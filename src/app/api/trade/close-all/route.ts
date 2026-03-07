/**
 * Close All Positions API Endpoint
 * 
 * Closes all open positions for the authenticated user
 * 
 * Authentication:
 * - Session-based for web users
 * - X-API-Key header for bot/service access
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, AuthContext } from "@/lib/auth-utils";

interface CloseAllRequest {
  symbol?: string;
  direction?: "LONG" | "SHORT";
  exchangeId?: string;
  isDemo?: boolean;
}

/**
 * Main POST handler - wrapped with authentication
 */
const handlePost = async (request: NextRequest, context: AuthContext) => {
  try {
    const body: CloseAllRequest = await request.json();
    const { symbol, direction, exchangeId, isDemo = true } = body;

    // Log the authenticated request
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        userId: context.userId,
        message: `[AUTH] Close all positions request from ${context.authType}`,
        details: JSON.stringify({
          authType: context.authType,
          apiKeyId: context.apiKeyId,
          symbol,
          direction,
          exchangeId,
          isDemo,
        }),
      },
    });

    // Build where clause - only close user's own positions
    const whereClause: {
      status: string;
      isDemo?: boolean;
      symbol?: string;
      direction?: string;
      account?: { userId: string; exchangeId?: string };
    } = {
      status: "OPEN",
      account: { userId: context.userId }, // Only user's own positions
    };

    if (isDemo !== undefined) {
      whereClause.isDemo = isDemo;
    }

    if (symbol) {
      whereClause.symbol = symbol;
    }

    if (direction) {
      whereClause.direction = direction;
    }

    if (exchangeId) {
      whereClause.account = { userId: context.userId, exchangeId };
    }

    // Fetch all open positions
    const positions = await db.position.findMany({
      where: whereClause,
      include: {
        account: true,
        trades: { where: { status: "OPEN" } },
      },
    });

    if (positions.length === 0) {
      return NextResponse.json({
        success: true,
        closedCount: 0,
        message: "Нет открытых позиций для закрытия",
        authType: context.authType,
      });
    }

    // Close all positions
    const results: Array<{
      id: string;
      symbol: string;
      direction: string;
      exchange: string;
      entryPrice: number;
      exitPrice: number;
      pnl: number;
    }> = [];
    let totalPnL = 0;

    for (const position of positions) {
      try {
        // Get current market price
        const marketPrice = await db.marketPrice.findUnique({
          where: { symbol: position.symbol },
        });

        const exitPrice = marketPrice?.price || position.currentPrice || position.avgEntryPrice;
        const entryPrice = position.avgEntryPrice;
        const quantity = position.totalAmount;
        const leverage = position.leverage;

        // Calculate PnL
        let pnl: number;
        if (position.direction === "LONG") {
          pnl = (exitPrice - entryPrice) * quantity;
        } else {
          pnl = (entryPrice - exitPrice) * quantity;
        }

        // Calculate closing fee
        const positionValue = exitPrice * quantity;
        const closeFee = positionValue * 0.0004;
        const netPnL = pnl - closeFee;
        totalPnL += netPnL;

        // Update position status
        await db.position.update({
          where: { id: position.id },
          data: {
            status: "CLOSED",
            currentPrice: exitPrice,
            realizedPnl: netPnL,
          },
        });

        // Update trades
        await db.trade.updateMany({
          where: {
            positionId: position.id,
            status: "OPEN",
          },
          data: {
            status: "CLOSED",
            exitPrice,
            exitTime: new Date(),
            closeReason: "MANUAL",
            pnl: netPnL,
          },
        });

        // Update balance for demo accounts
        if (position.account) {
          const balanceData = position.account.virtualBalance
            ? JSON.parse(position.account.virtualBalance)
            : { USDT: 10000 };

          const margin = (position.totalAmount * position.avgEntryPrice) / position.leverage;
          balanceData.USDT = (balanceData.USDT || 0) + margin + netPnL;

          await db.account.update({
            where: { id: position.account.id },
            data: { virtualBalance: JSON.stringify(balanceData) },
          });
        }

        results.push({
          id: position.id,
          symbol: position.symbol,
          direction: position.direction,
          exchange: position.account?.exchangeName || "Unknown",
          entryPrice,
          exitPrice,
          pnl: netPnL,
        });
      } catch (error) {
        console.error(`Failed to close position ${position.id}:`, error);
      }
    }

    // Log the action
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        userId: context.userId,
        message: `[CLOSE ALL] Closed ${results.length} positions. Total PnL: $${totalPnL.toFixed(2)}`,
        details: JSON.stringify({
          closedCount: results.length,
          totalPnL,
          positions: results,
          authType: context.authType,
          apiKeyId: context.apiKeyId,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      closedCount: results.length,
      totalPnL,
      positions: results,
      authType: context.authType,
      message: `✅ Закрыто ${results.length} позиций. Общий PnL: $${totalPnL.toFixed(2)}`,
    });
  } catch (error) {
    console.error("Close all positions error:", error);
    return NextResponse.json(
      { error: "Failed to close positions", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
};

export const POST = withAuth(handlePost);
