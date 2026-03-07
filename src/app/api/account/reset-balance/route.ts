import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUserId } from "@/lib/default-user";

const DEFAULT_BALANCE = {
  USDT: 10000,
  BTC: 0,
  ETH: 0,
  BNB: 0,
  SOL: 0,
};

export async function POST() {
  try {
    // Get default user
    const userId = await getDefaultUserId();
    
    // Find or create demo account
    let demoAccount = await db.account.findFirst({
      where: { accountType: "DEMO" }
    });

    if (!demoAccount) {
      // Create new demo account
      demoAccount = await db.account.create({
        data: {
          userId,
          accountType: "DEMO",
          exchangeId: "binance",
          exchangeType: "futures",
          exchangeName: "Binance Futures",
          virtualBalance: JSON.stringify(DEFAULT_BALANCE),
          isActive: true,
        }
      });
    } else {
      // Reset balance
      await db.account.update({
        where: { id: demoAccount.id },
        data: {
          virtualBalance: JSON.stringify(DEFAULT_BALANCE),
          lastError: null,
        }
      });

      // Close all open demo positions
      await db.position.updateMany({
        where: {
          accountId: demoAccount.id,
          status: "OPEN"
        },
        data: { status: "CLOSED" }
      });

      // Update all demo trades to closed
      await db.trade.updateMany({
        where: {
          accountId: demoAccount.id,
          status: "OPEN"
        },
        data: {
          status: "CANCELLED",
          closeReason: "MANUAL"
        }
      });
    }

    // Log the reset
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "ACCOUNT",
        message: "[DEMO] Balance reset to default: 10,000 USDT",
        details: JSON.stringify({ accountId: demoAccount.id })
      }
    });

    return NextResponse.json({
      success: true,
      balance: DEFAULT_BALANCE,
      message: "[DEMO] Баланс сброшен до 10,000 USDT. Все позиции закрыты.",
    });

  } catch (error) {
    console.error("Reset balance error:", error);
    return NextResponse.json(
      { error: "Failed to reset balance", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch current balance
export async function GET() {
  try {
    const demoAccount = await db.account.findFirst({
      where: { accountType: "DEMO" }
    });

    if (!demoAccount) {
      return NextResponse.json({
        success: true,
        balance: DEFAULT_BALANCE,
        isNew: true,
      });
    }

    const balance = demoAccount.virtualBalance 
      ? JSON.parse(demoAccount.virtualBalance) 
      : DEFAULT_BALANCE;

    // Get account statistics
    const stats = await db.trade.aggregate({
      where: {
        accountId: demoAccount.id,
        status: "CLOSED"
      },
      _count: true,
      _sum: { pnl: true }
    });

    const openPositions = await db.position.count({
      where: {
        accountId: demoAccount.id,
        status: "OPEN"
      }
    });

    return NextResponse.json({
      success: true,
      balance,
      stats: {
        totalTrades: stats._count,
        totalPnL: stats._sum.pnl || 0,
        openPositions,
      },
      accountId: demoAccount.id,
    });

  } catch (error) {
    console.error("Get balance error:", error);
    return NextResponse.json(
      { error: "Failed to get balance" },
      { status: 500 }
    );
  }
}
