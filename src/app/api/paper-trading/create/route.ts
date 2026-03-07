import { NextRequest, NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/paper-trading/engine";
import { PaperTradingConfig } from "@/lib/paper-trading/types";

/**
 * POST /api/paper-trading/create
 * Create a new paper trading bot
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      name,
      strategyId,
      strategyParams,
      tacticsSet,
      symbol,
      timeframe,
      initialBalance,
    } = body;

    if (!strategyId || !symbol || !tacticsSet) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Create config
    const config: PaperTradingConfig = {
      id: `paper-${Date.now()}`,
      name: name || `${strategyId} Paper Bot`,
      initialBalance: initialBalance || 10000,
      currency: "USDT",
      exchange: "binance",
      symbols: [symbol],
      timeframe: timeframe || "1h",
      strategyId,
      strategyParameters: strategyParams,
      tacticsSets: [tacticsSet],
      maxRiskPerTrade: 2,
      maxDrawdown: 50,
      maxOpenPositions: 3,
      maxLeverage: 10,
      feePercent: 0.1,
      slippagePercent: 0.05,
      autoTrading: true,
      checkInterval: 60000,
      notifications: {
        onEntry: true,
        onExit: true,
        onError: true,
        onMaxDrawdown: true,
      },
    };

    // Create engine and account
    const engine = getPaperTradingEngine();
    const account = engine.createAccount(config);

    return NextResponse.json({
      success: true,
      bot: {
        id: account.id,
        name: account.name,
        status: account.status,
        strategyId: account.config.strategyId,
        symbol: account.config.symbols[0],
        balance: account.balance,
        equity: account.equity,
        totalPnl: account.totalPnl,
        openPositions: account.positions.filter(p => p.status === "OPEN").length,
        tradesCount: account.tradeHistory.length,
        winRate: account.metrics.winRate,
        tacticsSetId: tacticsSet.id,
      },
    });

  } catch (error) {
    console.error("Create paper trading bot error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/paper-trading/create
 * List all paper trading bots
 */
export async function GET() {
  try {
    const engine = getPaperTradingEngine();
    const accounts = engine.getAllAccounts();
    
    const bots = accounts.map(account => ({
      id: account.id,
      name: account.name,
      status: account.status,
      strategyId: account.config.strategyId,
      symbol: account.config.symbols[0],
      balance: account.balance,
      equity: account.equity,
      totalPnl: account.totalPnl,
      openPositions: account.positions.filter(p => p.status === "OPEN").length,
      tradesCount: account.tradeHistory.length,
      winRate: account.metrics.winRate,
      tacticsSetId: account.config.tacticsSets[0]?.id || "",
    }));

    return NextResponse.json({
      success: true,
      bots,
    });
  } catch (error) {
    console.error("Get paper trading bots error:", error);
    return NextResponse.json({
      success: true,
      bots: [],
    });
  }
}
