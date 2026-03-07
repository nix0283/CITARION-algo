/**
 * Demo Trade API Endpoint
 * 
 * Public endpoint for demo trading from chat bot
 * No authentication required - uses default demo user
 * 
 * Trading modes:
 * - DEMO: Virtual trading with simulated positions
 * - No real exchange connection required
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUser } from "@/lib/auth-utils";

interface DemoTradeRequest {
  symbol: string;
  direction: "LONG" | "SHORT";
  action?: "BUY" | "SELL" | "CLOSE";
  entryPrices?: number[];
  takeProfits?: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage?: number;
  marketType?: "SPOT" | "FUTURES";
  amount?: number;
  exchangeId?: string;
}

// Demo prices for simulation
const DEMO_PRICES: Record<string, number> = {
  BTCUSDT: 67500,
  ETHUSDT: 3500,
  BNBUSDT: 600,
  SOLUSDT: 175,
  XRPUSDT: 0.52,
  DOGEUSDT: 0.15,
  ADAUSDT: 0.45,
  AVAXUSDT: 35,
  LINKUSDT: 14,
  DOTUSDT: 7,
  MATICUSDT: 0.5,
  LTCUSDT: 85,
  ATOMUSDT: 9,
  UNIUSDT: 7,
  NEARUSDT: 5,
};

function getDemoPrice(symbol: string): number {
  const upperSymbol = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  return DEMO_PRICES[upperSymbol + "USDT"] || DEMO_PRICES[upperSymbol] || 100;
}

export async function POST(request: NextRequest) {
  try {
    const body: DemoTradeRequest = await request.json();
    const {
      symbol,
      direction,
      entryPrices = [],
      takeProfits = [],
      stopLoss,
      leverage = 10,
      marketType = "FUTURES",
      amount = 100,
      exchangeId = "binance",
    } = body;

    // Validate required fields
    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "Symbol is required" },
        { status: 400 }
      );
    }

    if (!direction || !["LONG", "SHORT"].includes(direction)) {
      return NextResponse.json(
        { success: false, error: "Direction must be LONG or SHORT" },
        { status: 400 }
      );
    }

    // Get or create default demo user
    const user = await getDefaultUser();

    // Get or create demo account
    let account = await db.account.findFirst({
      where: {
        userId: user.id,
        accountType: "DEMO",
        exchangeId,
      },
    });

    if (!account) {
      account = await db.account.create({
        data: {
          userId: user.id,
          accountType: "DEMO",
          exchangeId,
          exchangeType: "futures",
          exchangeName: `${exchangeId.toUpperCase()} Demo`,
          virtualBalance: JSON.stringify({ USDT: 10000 }),
          isActive: true,
        },
      });
    }

    // Get current demo price
    const currentPrice = entryPrices[0] || getDemoPrice(symbol);
    const tradeAmount = amount || 100;
    const tradeLeverage = marketType === "SPOT" ? 1 : leverage;
    const quantity = (tradeAmount * tradeLeverage) / currentPrice;
    const fee = tradeAmount * tradeLeverage * 0.0004;

    // Check balance
    const balanceData = account.virtualBalance ? JSON.parse(account.virtualBalance) : { USDT: 10000 };
    const usdtBalance = balanceData.USDT || 0;

    if (usdtBalance < tradeAmount + fee) {
      return NextResponse.json(
        { success: false, error: `Insufficient balance. Available: ${usdtBalance.toFixed(2)} USDT` },
        { status: 400 }
      );
    }

    // Deduct margin and fee
    balanceData.USDT = usdtBalance - tradeAmount - fee;
    await db.account.update({
      where: { id: account.id },
      data: { virtualBalance: JSON.stringify(balanceData) },
    });

    // Calculate liquidation price
    let liquidationPrice: number;
    if (direction === "LONG") {
      liquidationPrice = currentPrice * (1 - (1 / tradeLeverage) + 0.005);
    } else {
      liquidationPrice = currentPrice * (1 + (1 / tradeLeverage) - 0.005);
    }

    // Create position
    const position = await db.position.create({
      data: {
        accountId: account.id,
        symbol: symbol.toUpperCase(),
        direction,
        status: "OPEN",
        totalAmount: quantity,
        filledAmount: quantity,
        avgEntryPrice: currentPrice,
        currentPrice,
        leverage: tradeLeverage,
        stopLoss: stopLoss || null,
        takeProfit: takeProfits[0]?.price || null,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isDemo: true,
      },
    });

    // Get next signal ID
    const counter = await db.signalIdCounter.upsert({
      where: { id: "signal_counter" },
      update: { lastId: { increment: 1 } },
      create: { id: "signal_counter", lastId: 1 },
    });

    // Create signal record
    await db.signal.create({
      data: {
        signalId: counter.lastId,
        source: "CHAT_BOT",
        sourceMessage: `${symbol} ${direction}`,
        symbol: symbol.toUpperCase(),
        direction,
        action: direction === "LONG" ? "BUY" : "SELL",
        marketType,
        entryPrices: JSON.stringify(entryPrices.length > 0 ? entryPrices : [currentPrice]),
        takeProfits: JSON.stringify(takeProfits),
        stopLoss,
        leverage: tradeLeverage,
        status: "ACTIVE",
        positionId: position.id,
        processedAt: new Date(),
      },
    });

    const directionEmoji = direction === "LONG" ? "🟢" : "🔴";
    const marketEmoji = marketType === "SPOT" ? "💱" : "⚡";

    return NextResponse.json({
      success: true,
      message: `${directionEmoji} **#${counter.lastId} ${symbol}** ${direction}\n${marketEmoji} Market: ${marketType}\n\n📍 Entry: $${currentPrice.toLocaleString()}\n⚡ Leverage: ${tradeLeverage}x\n💰 Margin: $${tradeAmount.toFixed(2)}\n📊 Quantity: ${quantity.toFixed(6)}\n\n✅ Position opened successfully!`,
      position: {
        id: position.id,
        symbol: position.symbol,
        direction: position.direction,
        totalAmount: position.totalAmount,
        avgEntryPrice: position.avgEntryPrice,
        currentPrice: position.currentPrice,
        leverage: position.leverage,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        liquidationPrice,
        margin: tradeAmount,
      },
      balance: balanceData,
      isDemo: true,
      exchangeId,
    });
  } catch (error) {
    console.error("[DemoTrade] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to fetch demo positions
 */
export async function GET() {
  try {
    const user = await getDefaultUser();

    const positions = await db.position.findMany({
      where: {
        status: "OPEN",
        isDemo: true,
        account: { userId: user.id },
      },
      orderBy: { createdAt: "desc" },
      include: {
        account: {
          select: {
            exchangeId: true,
            exchangeName: true,
          },
        },
      },
    });

    // Get demo balance
    const account = await db.account.findFirst({
      where: { userId: user.id, accountType: "DEMO" },
    });

    const balance = account?.virtualBalance
      ? JSON.parse(account.virtualBalance)
      : { USDT: 10000 };

    return NextResponse.json({
      success: true,
      positions,
      count: positions.length,
      balance,
      isDemo: true,
    });
  } catch (error) {
    console.error("[DemoTrade] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
