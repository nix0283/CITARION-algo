/**
 * PnL Statistics API
 * 
 * Provides comprehensive PnL analytics with:
 * - Multiple time periods (1d, 3d, 1w, 2w, 1m, 3m, 6m, 1y, 3y)
 * - Equity curve data for charts
 * - Funding and fee breakdowns
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Time period definitions
const TIME_PERIODS: Record<string, number> = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "2w": 14 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
  "6m": 180 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  "3y": 1095 * 24 * 60 * 60 * 1000,
};

export interface PnLStats {
  period: string;
  realizedPnL: number;
  unrealizedPnL: number;
  fundingPnL: number;
  feesPaid: number;
  netPnL: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  winRate: number;
  profitFactor: number;
  avgTrade: number;
  bestTrade: number;
  worstTrade: number;
}

export interface EquityPoint {
  timestamp: string;
  balance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  fundingPnL: number;
}

// GET - Get PnL statistics
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isDemo = searchParams.get("demo") !== "false"; // Default to demo
    const period = searchParams.get("period") || "1m";
    const includeEquityCurve = searchParams.get("equityCurve") === "true";

    // Get time range
    const periodMs = TIME_PERIODS[period] || TIME_PERIODS["1m"];
    const startTime = new Date(Date.now() - periodMs);

    // Get all closed trades in period
    const trades = await db.trade.findMany({
      where: {
        isDemo,
        status: "CLOSED",
        exitTime: { gte: startTime },
      },
      orderBy: { exitTime: "asc" },
    });

    // Get open positions
    const openPositions = await db.position.findMany({
      where: {
        isDemo,
        status: "OPEN",
      },
    });

    // Get funding payments in period
    const fundingPayments = await db.fundingPayment.findMany({
      where: {
        fundingTime: { gte: startTime },
        position: { isDemo },
      },
    });

    // Calculate statistics
    // Note: trade.pnl already includes fees and funding (netPnL at close time)
    // So winsCount is correctly calculated as trades with positive net pnl
    const realizedPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winsCount = trades.filter(t => t.pnl > 0).length;
    const lossesCount = trades.filter(t => t.pnl < 0).length;
    const totalFees = trades.reduce((sum, t) => sum + t.fee, 0);
    
    // Calculate unrealized PnL from open positions
    const unrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    
    // Calculate funding PnL from funding payments (for open positions only, closed positions already have this in trade.pnl)
    const openPositionIds = openPositions.map(p => p.id);
    const openPositionFunding = fundingPayments
      .filter(f => openPositionIds.includes(f.positionId))
      .reduce((sum, f) => sum + f.payment, 0);

    // Calculate profit factor
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Best and worst trades
    const pnlValues = trades.map(t => t.pnl);
    const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
    const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;
    const avgTrade = trades.length > 0 ? realizedPnL / trades.length : 0;

    const stats: PnLStats = {
      period,
      realizedPnL,
      unrealizedPnL,
      fundingPnL: openPositionFunding,
      feesPaid: totalFees,
      netPnL: realizedPnL, // realizedPnL already includes fees and funding (net value)
      tradesCount: trades.length,
      winsCount,
      lossesCount,
      winRate: trades.length > 0 ? (winsCount / trades.length) * 100 : 0,
      profitFactor,
      avgTrade,
      bestTrade,
      worstTrade,
    };

    // Get equity curve if requested
    let equityCurve: EquityPoint[] = [];
    
    if (includeEquityCurve) {
      // Get PnL history points
      const pnlHistory = await db.pnLHistory.findMany({
        where: {
          isDemo,
          timestamp: { gte: startTime },
        },
        orderBy: { timestamp: "asc" },
      });

      if (pnlHistory.length > 0) {
        equityCurve = pnlHistory.map(h => ({
          timestamp: h.timestamp.toISOString(),
          balance: h.balance,
          equity: h.equity,
          realizedPnL: h.realizedPnL,
          unrealizedPnL: h.unrealizedPnL,
          fundingPnL: h.fundingPnL,
        }));
      } else {
        // Generate equity curve from trades if no history exists
        equityCurve = generateEquityCurveFromTrades(trades, fundingPayments, startTime);
      }
    }

    // Get all periods stats for overview
    const allPeriodsStats = await getAllPeriodsStats(isDemo);

    return NextResponse.json({
      success: true,
      stats,
      equityCurve,
      allPeriodsStats,
      isDemo,
    });
  } catch (error) {
    console.error("PnL stats error:", error);
    return NextResponse.json(
      { error: "Failed to get PnL statistics", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Generate equity curve from trades
function generateEquityCurveFromTrades(
  trades: { exitTime: Date | null; pnl: number; fee: number }[],
  fundingPayments: { fundingTime: Date; payment: number }[],
  _startTime: Date
): EquityPoint[] {
  const points: EquityPoint[] = [];
  const initialBalance = 10000; // Default demo balance

  // Combine and sort all events by time
  const events: { time: Date; pnl: number; isFunding: boolean }[] = [
    ...trades.map(t => ({ time: t.exitTime || new Date(), pnl: t.pnl - t.fee, isFunding: false })),
    ...fundingPayments.map(f => ({ time: f.fundingTime, pnl: f.payment, isFunding: true })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  // Group by day
  const dailyData: Map<string, { pnl: number; funding: number }> = new Map();
  
  for (const event of events) {
    const dayKey = event.time.toISOString().split("T")[0];
    const existing = dailyData.get(dayKey) || { pnl: 0, funding: 0 };
    
    if (event.isFunding) {
      existing.funding += event.pnl;
    } else {
      existing.pnl += event.pnl;
    }
    
    dailyData.set(dayKey, existing);
  }

  // Generate points
  let runningPnL = 0;
  let runningFunding = 0;
  
  for (const [day, data] of dailyData) {
    runningPnL += data.pnl;
    runningFunding += data.funding;
    
    points.push({
      timestamp: new Date(day).toISOString(),
      balance: initialBalance + runningPnL + runningFunding,
      equity: initialBalance + runningPnL + runningFunding,
      realizedPnL: runningPnL,
      unrealizedPnL: 0,
      fundingPnL: runningFunding,
    });
  }

  return points;
}

// Get stats for all periods
async function getAllPeriodsStats(isDemo: boolean): Promise<Record<string, PnLStats>> {
  const results: Record<string, PnLStats> = {};

  for (const [periodName, periodMs] of Object.entries(TIME_PERIODS)) {
    const startTime = new Date(Date.now() - periodMs);

    const trades = await db.trade.findMany({
      where: {
        isDemo,
        status: "CLOSED",
        exitTime: { gte: startTime },
      },
    });

    // Note: trade.pnl already includes fees and funding (net value at close time)
    const realizedPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winsCount = trades.filter(t => t.pnl > 0).length;
    const lossesCount = trades.filter(t => t.pnl < 0).length;
    const totalFees = trades.reduce((sum, t) => sum + t.fee, 0);

    const grossProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const pnlValues = trades.map(t => t.pnl);

    results[periodName] = {
      period: periodName,
      realizedPnL,
      unrealizedPnL: 0,
      fundingPnL: 0, // Already included in realizedPnL
      feesPaid: totalFees,
      netPnL: realizedPnL, // realizedPnL is already net value
      tradesCount: trades.length,
      winsCount,
      lossesCount,
      winRate: trades.length > 0 ? (winsCount / trades.length) * 100 : 0,
      profitFactor,
      avgTrade: trades.length > 0 ? realizedPnL / trades.length : 0,
      bestTrade: pnlValues.length > 0 ? Math.max(...pnlValues) : 0,
      worstTrade: pnlValues.length > 0 ? Math.min(...pnlValues) : 0,
    };
  }

  return results;
}

// POST - Record PnL snapshot (for equity curve)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, isDemo = true } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Get account balance
    const account = await db.account.findFirst({
      where: { accountType: isDemo ? "DEMO" : "REAL" },
    });

    const balance = account?.virtualBalance 
      ? JSON.parse(account.virtualBalance).USDT || 10000 
      : 10000;

    // Calculate current PnL
    const closedTrades = await db.trade.findMany({
      where: { isDemo, status: "CLOSED" },
    });

    const openPositions = await db.position.findMany({
      where: { isDemo, status: "OPEN" },
    });

    const fundingPayments = await db.fundingPayment.findMany({
      where: { position: { isDemo } },
    });

    const realizedPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const unrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const fundingPnL = fundingPayments.reduce((sum, f) => sum + f.payment, 0);
    const feesPaid = closedTrades.reduce((sum, t) => sum + t.fee, 0);

    const winsCount = closedTrades.filter(t => t.pnl > 0).length;
    const lossesCount = closedTrades.filter(t => t.pnl < 0).length;

    // Create snapshot
    const snapshot = await db.pnLHistory.create({
      data: {
        userId,
        isDemo,
        balance,
        equity: balance + unrealizedPnL,
        realizedPnL,
        unrealizedPnL,
        fundingPnL,
        feesPaid,
        tradesCount: closedTrades.length,
        winsCount,
        lossesCount,
      },
    });

    return NextResponse.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        timestamp: snapshot.timestamp,
        balance: snapshot.balance,
        equity: snapshot.equity,
      },
    });
  } catch (error) {
    console.error("Record PnL snapshot error:", error);
    return NextResponse.json(
      { error: "Failed to record PnL snapshot" },
      { status: 500 }
    );
  }
}
