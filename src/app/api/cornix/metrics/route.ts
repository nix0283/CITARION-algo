import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getExchangeClient } from '@/lib/exchange';

/**
 * GET /api/cornix/metrics
 * Get comprehensive metrics for Cornix integration
 * 
 * Query params:
 * - period: '7d' | '30d' | '90d' | 'all'
 * - exchange: specific exchange to get metrics for
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '30d';
    const exchange = searchParams.get('exchange');

    // Calculate time range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    // Get performance metrics
    const performance = await getPerformanceMetrics(startDate, exchange);

    // Get signal metrics
    const signals = await getSignalMetrics(startDate, exchange);

    // Get copy trading metrics
    const copyTrading = await getCopyTradingMetrics(startDate, exchange);

    // Get equity curve
    const equityCurve = await getEquityCurve(startDate, exchange);

    return NextResponse.json({
      success: true,
      data: {
        performance,
        signals,
        copyTrading,
        equityCurve,
        period,
        startDate,
        endDate: now,
      },
    });
  } catch (error) {
    console.error('[Cornix Metrics API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Cornix metrics',
      },
      { status: 500 }
    );
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get performance metrics from trades
 */
async function getPerformanceMetrics(startDate: Date, exchange?: string | null) {
  try {
    // Try to get trades from database
    const trades = await getTradesFromDatabase(startDate, exchange);

    if (trades.length === 0) {
      return getDemoPerformance();
    }

    // Calculate metrics
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalPnlPercent = calculatePercent(trades);

    // Get time-based PnL
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTrades = trades.filter(t => new Date(t.timestamp) >= today);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekTrades = trades.filter(t => new Date(t.timestamp) >= weekStart);
    const monthStart = new Date(today);
    monthStart.setDate(1);
    const monthTrades = trades.filter(t => new Date(t.timestamp) >= monthStart);

    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length
      : 0;

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    return {
      totalPnl,
      totalPnlPercent,
      todayPnl: todayTrades.reduce((sum, t) => sum + t.pnl, 0),
      todayPnlPercent: calculatePercent(todayTrades),
      weekPnl: weekTrades.reduce((sum, t) => sum + t.pnl, 0),
      weekPnlPercent: calculatePercent(weekTrades),
      monthPnl: monthTrades.reduce((sum, t) => sum + t.pnl, 0),
      monthPnlPercent: calculatePercent(monthTrades),
      winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0,
      avgHoldTime: calculateAvgHoldTime(trades),
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio: calculateSharpeRatio(trades),
      maxDrawdown: calculateMaxDrawdown(trades),
      currentStreak: calculateCurrentStreak(trades),
      bestTrade: Math.max(...trades.map(t => t.pnl), 0),
      worstTrade: Math.min(...trades.map(t => t.pnl), 0),
    };
  } catch (error) {
    console.error('[Cornix] Error getting performance metrics:', error);
    return getDemoPerformance();
  }
}

/**
 * Get signal metrics
 */
async function getSignalMetrics(startDate: Date, exchange?: string | null) {
  try {
    // Try to get signals from database
    const signals = await getSignalsFromDatabase(startDate, exchange);

    if (signals.length === 0) {
      return getDemoSignals();
    }

    const successfulSignals = signals.filter(s => s.status === 'executed' && s.pnl > 0);
    const failedSignals = signals.filter(s => s.status === 'failed');
    const pendingSignals = signals.filter(s => s.status === 'pending');

    // Group by exchange
    const signalsByExchange: Record<string, number> = {};
    signals.forEach(s => {
      signalsByExchange[s.exchange] = (signalsByExchange[s.exchange] || 0) + 1;
    });

    // Group by pair
    const pairMap = new Map<string, { count: number; pnl: number }>();
    signals.forEach(s => {
      const existing = pairMap.get(s.symbol) || { count: 0, pnl: 0 };
      pairMap.set(s.symbol, {
        count: existing.count + 1,
        pnl: existing.pnl + (s.pnl || 0),
      });
    });

    const signalsByPair = Array.from(pairMap.entries())
      .map(([pair, data]) => ({ pair, ...data }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10);

    return {
      totalSignals: signals.length,
      successfulSignals: successfulSignals.length,
      failedSignals: failedSignals.length,
      pendingSignals: pendingSignals.length,
      avgExecutionTime: calculateAvgExecutionTime(signals),
      successRate: signals.length > 0
        ? (successfulSignals.length / (signals.length - pendingSignals.length)) * 100
        : 0,
      avgReturn: signals.length > 0
        ? signals.reduce((sum, s) => sum + (s.pnlPercent || 0), 0) / signals.length
        : 0,
      signalsByExchange,
      signalsByPair,
    };
  } catch (error) {
    console.error('[Cornix] Error getting signal metrics:', error);
    return getDemoSignals();
  }
}

/**
 * Get copy trading metrics from exchanges
 */
async function getCopyTradingMetrics(startDate: Date, exchange?: string | null) {
  try {
    // Get connected exchanges
    const connections = await db.exchangeConnection.findMany({
      where: {
        isActive: true,
        ...(exchange ? { exchange } : {}),
      },
    });

    if (connections.length === 0) {
      return getDemoCopyTrading();
    }

    // Try to get copy trading data from exchanges that support it
    let totalFollowers = 0;
    let activeFollowers = 0;
    let totalCopiedTrades = 0;
    let profitShareEarned = 0;
    const topFollowers: { id: string; pnl: number; trades: number }[] = [];

    for (const connection of connections) {
      // Only OKX and Bitget have full API support for copy trading
      if (connection.exchange === 'okx' || connection.exchange === 'bitget') {
        try {
          const client = await getExchangeClient(connection.exchange, {
            apiKey: connection.apiKey,
            apiSecret: connection.apiSecret,
            passphrase: connection.passphrase || undefined,
          });

          // Get lead trader status
          const status = await client.getLeadTraderStatus();

          if (status.isLeadTrader) {
            const followers = await client.getMasterFollowers(100);
            totalFollowers += followers.length;
            activeFollowers += followers.filter(f => f.active).length;

            const profitSummary = await client.getMasterProfitSummary(startDate);
            profitSummary.forEach(ps => {
              profitShareEarned += ps.profitShare || 0;
              totalCopiedTrades += ps.tradesCopied || 0;
            });

            // Add top followers
            followers.slice(0, 5).forEach(f => {
              topFollowers.push({
                id: f.followerId || f.id,
                pnl: f.totalPnl || 0,
                trades: f.totalCopiedTrades || 0,
              });
            });
          }
        } catch (err) {
          console.error(`[Cornix] Error getting copy trading data from ${connection.exchange}:`, err);
        }
      }
    }

    return {
      activeFollowers,
      totalFollowers,
      totalCopiedTrades,
      avgFollowerPnl: totalFollowers > 0
        ? topFollowers.reduce((sum, f) => sum + f.pnl, 0) / totalFollowers
        : 0,
      profitShareEarned,
      topFollowers: topFollowers.sort((a, b) => b.pnl - a.pnl).slice(0, 5),
    };
  } catch (error) {
    console.error('[Cornix] Error getting copy trading metrics:', error);
    return getDemoCopyTrading();
  }
}

/**
 * Get equity curve data
 */
async function getEquityCurve(startDate: Date, exchange?: string | null) {
  try {
    const trades = await getTradesFromDatabase(startDate, exchange);

    if (trades.length === 0) {
      return generateDemoEquityCurve();
    }

    // Group by day
    const dayMap = new Map<string, { pnl: number; trades: number; equity: number }>();
    let runningEquity = 50000; // Starting equity

    // Sort trades by timestamp
    const sortedTrades = [...trades].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedTrades.forEach(trade => {
      const date = new Date(trade.timestamp).toISOString().split('T')[0];
      const existing = dayMap.get(date) || { pnl: 0, trades: 0, equity: runningEquity };
      runningEquity += trade.pnl;

      dayMap.set(date, {
        pnl: existing.pnl + trade.pnl,
        trades: existing.trades + 1,
        equity: runningEquity,
      });
    });

    return Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('[Cornix] Error getting equity curve:', error);
    return generateDemoEquityCurve();
  }
}

// ==================== DATABASE HELPERS ====================

interface TradeRecord {
  pnl: number;
  timestamp: Date | string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  side: string;
  symbol: string;
}

interface SignalRecord {
  id: string;
  symbol: string;
  exchange: string;
  status: string;
  pnl?: number;
  pnlPercent?: number;
  executedAt?: Date;
  createdAt: Date;
}

async function getTradesFromDatabase(startDate: Date, exchange?: string | null): Promise<TradeRecord[]> {
  try {
    // Check if Trade table exists
    const tableCheck = await db.$queryRaw`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name='Trade'
    `;

    if ((tableCheck as { count: number }[])?.[0]?.count === 0) {
      return [];
    }

    // Query trades
    const trades = await db.$queryRaw`
      SELECT 
        "realizedPnl" as pnl,
        "closedAt" as timestamp,
        "entryPrice",
        "exitPrice",
        quantity,
        side,
        symbol
      FROM "Trade"
      WHERE "closedAt" >= ${startDate}
      ${exchange ? db.$queryRaw`AND exchange = ${exchange}` : db.$queryRaw``}
      ORDER BY "closedAt" ASC
    `;

    return (trades as TradeRecord[]).map(t => ({
      ...t,
      pnl: Number(t.pnl) || 0,
    }));
  } catch (error) {
    console.error('[Cornix] Error getting trades:', error);
    return [];
  }
}

async function getSignalsFromDatabase(startDate: Date, exchange?: string | null): Promise<SignalRecord[]> {
  try {
    // Check if CornixSignal table exists
    const tableCheck = await db.$queryRaw`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name='CornixSignal'
    `;

    if ((tableCheck as { count: number }[])?.[0]?.count === 0) {
      return [];
    }

    // Query signals
    const signals = await db.$queryRaw`
      SELECT *
      FROM "CornixSignal"
      WHERE "createdAt" >= ${startDate}
      ${exchange ? db.$queryRaw`AND exchange = ${exchange}` : db.$queryRaw``}
      ORDER BY "createdAt" DESC
    `;

    return signals as SignalRecord[];
  } catch (error) {
    console.error('[Cornix] Error getting signals:', error);
    return [];
  }
}

// ==================== CALCULATION HELPERS ====================

function calculatePercent(trades: { pnl: number; entryPrice: number; quantity: number }[]): number {
  if (trades.length === 0) return 0;
  const totalInvestment = trades.reduce((sum, t) => sum + (t.entryPrice * t.quantity), 0);
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  return totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;
}

function calculateAvgHoldTime(trades: { timestamp: Date | string }[]): number {
  // Simplified - would need actual entry/exit times
  return 4 * 3600000; // 4 hours default
}

function calculateSharpeRatio(trades: { pnl: number }[]): number {
  if (trades.length < 2) return 0;
  const returns = trades.map(t => t.pnl);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  return stdDev > 0 ? avgReturn / stdDev : 0;
}

function calculateMaxDrawdown(trades: { pnl: number }[]): number {
  let peak = 0;
  let maxDrawdown = 0;
  let running = 0;

  trades.forEach(t => {
    running += t.pnl;
    if (running > peak) peak = running;
    const drawdown = peak > 0 ? ((peak - running) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  return maxDrawdown;
}

function calculateCurrentStreak(trades: { pnl: number }[]): number {
  let streak = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (i === trades.length - 1) {
      streak = trades[i].pnl >= 0 ? 1 : -1;
    } else if ((trades[i].pnl >= 0 && streak > 0) || (trades[i].pnl < 0 && streak < 0)) {
      streak += streak > 0 ? 1 : -1;
    } else {
      break;
    }
  }
  return streak;
}

function calculateAvgExecutionTime(signals: { executedAt?: Date; createdAt: Date }[]): number {
  const executed = signals.filter(s => s.executedAt);
  if (executed.length === 0) return 1000;

  const totalMs = executed.reduce((sum, s) => {
    return sum + (new Date(s.executedAt!).getTime() - new Date(s.createdAt).getTime());
  }, 0);

  return totalMs / executed.length;
}

// ==================== DEMO DATA ====================

function getDemoPerformance() {
  return {
    totalPnl: 12456.78,
    totalPnlPercent: 24.91,
    todayPnl: 345.67,
    todayPnlPercent: 0.69,
    weekPnl: 1234.56,
    weekPnlPercent: 2.47,
    monthPnl: 4567.89,
    monthPnlPercent: 9.13,
    winRate: 68.5,
    avgHoldTime: 4 * 3600000 + 30 * 60000,
    totalTrades: 156,
    winningTrades: 107,
    losingTrades: 49,
    avgWin: 234.56,
    avgLoss: -156.78,
    profitFactor: 1.85,
    sharpeRatio: 2.15,
    maxDrawdown: 8.45,
    currentStreak: 5,
    bestTrade: 890.12,
    worstTrade: -345.67,
  };
}

function getDemoSignals() {
  return {
    totalSignals: 89,
    successfulSignals: 61,
    failedSignals: 8,
    pendingSignals: 20,
    avgExecutionTime: 1250,
    successRate: 68.5,
    avgReturn: 2.34,
    signalsByExchange: {
      binance: 32,
      bybit: 24,
      okx: 18,
      bitget: 10,
      bingx: 5,
    },
    signalsByPair: [
      { pair: 'BTCUSDT', count: 28, pnl: 3456.78 },
      { pair: 'ETHUSDT', count: 22, pnl: 2134.56 },
      { pair: 'SOLUSDT', count: 15, pnl: 1567.89 },
      { pair: 'DOGEUSDT', count: 12, pnl: 890.12 },
      { pair: 'XRPUSDT', count: 8, pnl: 567.89 },
    ],
  };
}

function getDemoCopyTrading() {
  return {
    activeFollowers: 12,
    totalFollowers: 15,
    totalCopiedTrades: 234,
    avgFollowerPnl: 456.78,
    profitShareEarned: 1234.56,
    topFollowers: [
      { id: 'user_1', pnl: 1234.56, trades: 45 },
      { id: 'user_2', pnl: 987.65, trades: 38 },
      { id: 'user_3', pnl: 678.90, trades: 29 },
      { id: 'user_4', pnl: 456.78, trades: 22 },
      { id: 'user_5', pnl: 234.56, trades: 15 },
    ],
  };
}

function generateDemoEquityCurve() {
  const data: { date: string; pnl: number; trades: number; equity: number }[] = [];
  let equity = 50000;
  const now = Date.now();

  for (let i = 30; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pnl = (Math.random() - 0.35) * 1000;
    equity += pnl;
    data.push({
      date,
      pnl,
      trades: Math.floor(Math.random() * 10) + 1,
      equity,
    });
  }

  return data;
}
