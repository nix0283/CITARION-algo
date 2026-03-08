/**
 * Demo Close All Positions API
 * 
 * Closes all demo positions without authentication
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUser } from "@/lib/auth-utils";

export async function POST() {
  try {
    const user = await getDefaultUser();

    // Get all open demo positions
    const positions = await db.position.findMany({
      where: {
        status: "OPEN",
        isDemo: true,
        account: { userId: user.id },
      },
      include: {
        account: true,
      },
    });

    if (positions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "📭 No open positions to close",
        closedCount: 0,
        totalPnL: 0,
      });
    }

    let totalPnL = 0;
    const closedPositions: Array<{
      symbol: string;
      direction: string;
      entryPrice: number;
      pnl: number;
    }> = [];

    // Get demo account for balance updates
    const account = await db.account.findFirst({
      where: { userId: user.id, accountType: "DEMO" },
    });

    const balanceData = account?.virtualBalance
      ? JSON.parse(account.virtualBalance)
      : { USDT: 10000 };

    // Close each position
    for (const position of positions) {
      // Calculate PnL (simple simulation)
      const priceChange = (position.currentPrice - position.avgEntryPrice) / position.avgEntryPrice;
      const pnl = position.direction === "LONG"
        ? position.totalAmount * position.avgEntryPrice * priceChange * position.leverage
        : -position.totalAmount * position.avgEntryPrice * priceChange * position.leverage;

      totalPnL += pnl;

      // Return margin + PnL to balance
      const margin = (position.totalAmount * position.avgEntryPrice) / position.leverage;
      balanceData.USDT = (balanceData.USDT || 0) + margin + pnl;

      // Update position
      await db.position.update({
        where: { id: position.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closeReason: "MANUAL",
          realizedPnl: pnl,
        },
      });

      closedPositions.push({
        symbol: position.symbol,
        direction: position.direction,
        entryPrice: position.avgEntryPrice,
        pnl,
      });

      // Update related signal
      await db.signal.updateMany({
        where: { positionId: position.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closeReason: "MANUAL",
        },
      });
    }

    // Update account balance
    if (account) {
      await db.account.update({
        where: { id: account.id },
        data: { virtualBalance: JSON.stringify(balanceData) },
      });
    }

    // Log the action
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        userId: user.id,
        message: `[DEMO] Closed all positions: ${positions.length} positions, PnL: $${totalPnL.toFixed(2)}`,
        details: JSON.stringify({
          closedCount: positions.length,
          totalPnL,
          positions: closedPositions,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `🚫 **Closed All Positions**\n\n✅ Closed: ${positions.length}\n💰 Total PnL: ${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}\n💵 New Balance: ${(balanceData.USDT || 0).toFixed(2)} USDT`,
      closedCount: positions.length,
      totalPnL,
      positions: closedPositions,
      balance: balanceData,
    });
  } catch (error) {
    console.error("[DemoCloseAll] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
