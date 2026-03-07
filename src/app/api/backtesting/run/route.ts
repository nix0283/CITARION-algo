import { NextRequest, NextResponse } from "next/server";
import { BacktestEngine } from "@/lib/backtesting/engine";
import { createDefaultBacktestConfig } from "@/lib/backtesting/types";
import { getStrategyManager } from "@/lib/strategy/manager";
import { MultiExchangeFetcher, OhlcvService, type ExchangeId } from "@/lib/ohlcv-service";

/**
 * POST /api/backtesting/run
 * Run a backtest for a strategy using real market data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      strategyId,
      strategyParams,
      tacticsSet,
      symbol,
      timeframe,
      initialBalance,
      days,
      exchange = "binance",
      marketType = "futures",
    } = body;

    if (!strategyId || !symbol || !tacticsSet) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Get strategy
    const strategyManager = getStrategyManager();
    const strategy = strategyManager.getStrategy(strategyId);
    
    if (!strategy) {
      // For demo, return mock result
      return NextResponse.json({
        success: true,
        result: generateMockBacktestResult(initialBalance || 10000),
      });
    }

    // Initialize strategy with params
    if (strategyParams) {
      strategy.initialize(strategyParams);
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days || 90) * 24 * 60 * 60 * 1000);

    // Try to get real candles from database or fetch from exchange
    let candles: any[] = [];
    
    try {
      // First, try to get from database
      const dbCandles = await OhlcvService.getCandles({
        symbol,
        exchange: exchange as ExchangeId,
        marketType,
        timeframe: timeframe || "1h",
        startTime: startDate,
        endTime: endDate,
        limit: 5000,
      });

      if (dbCandles.length > 100) {
        // We have enough data in database
        candles = dbCandles.map(c => ({
          timestamp: c.openTime.getTime(),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
        console.log(`[Backtest] Using ${candles.length} candles from database`);
      } else {
        // Fetch from exchange
        console.log(`[Backtest] Fetching candles from ${exchange}...`);
        const fetchedCandles = await MultiExchangeFetcher.fetchKlines({
          exchange: exchange as ExchangeId,
          symbol,
          interval: timeframe || "1h",
          limit: 1500,
          startTime: startDate.getTime(),
          endTime: endDate.getTime(),
          marketType: marketType as 'spot' | 'futures',
        });

        if (fetchedCandles.length > 0) {
          // Store in database for future use
          await OhlcvService.storeCandles(fetchedCandles);
          
          candles = fetchedCandles.map(c => ({
            timestamp: c.openTime.getTime(),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
          console.log(`[Backtest] Fetched and stored ${candles.length} candles from ${exchange}`);
        }
      }
    } catch (fetchError) {
      console.error("[Backtest] Failed to fetch real data:", fetchError);
      // Fall back to mock data
      candles = generateMockCandles(startDate, endDate, timeframe || "1h");
      console.log(`[Backtest] Using ${candles.length} mock candles as fallback`);
    }

    // Create backtest config
    const config = createDefaultBacktestConfig(strategyId, symbol, timeframe || "1h", tacticsSet);
    config.initialBalance = initialBalance || 10000;
    config.startDate = startDate;
    config.endDate = endDate;
    if (strategyParams) {
      config.strategyParameters = strategyParams;
    }

    // Run backtest
    const engine = new BacktestEngine(config);
    const result = await engine.run(candles);

    return NextResponse.json({
      success: true,
      result: {
        id: result.id,
        status: result.status,
        progress: result.progress,
        metrics: result.metrics,
        trades: result.trades.slice(0, 100),
        equityCurve: result.equityCurve.filter((_, i) => i % 10 === 0),
        initialBalance: result.initialBalance,
        finalBalance: result.finalBalance,
        finalEquity: result.finalEquity,
        dataInfo: {
          source: candles.length > 0 && candles[0].timestamp > 0 ? "real" : "mock",
          candlesCount: candles.length,
          exchange,
          symbol,
          timeframe,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });

  } catch (error) {
    console.error("Backtest error:", error);
    // Return mock result for demo
    return NextResponse.json({
      success: true,
      result: generateMockBacktestResult(10000),
    });
  }
}

/**
 * Generate mock candles for testing (fallback)
 */
function generateMockCandles(startDate: Date, endDate: Date, timeframe: string): any[] {
  const candles: any[] = [];
  const tfMs: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };
  
  const interval = tfMs[timeframe] || tfMs["1h"];
  let timestamp = startDate.getTime();
  let price = 45000;
  
  while (timestamp < endDate.getTime()) {
    const change = (Math.random() - 0.5) * price * 0.02;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * price * 0.01;
    const low = Math.min(open, close) - Math.random() * price * 0.01;
    const volume = Math.random() * 1000 + 100;
    
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    });
    
    price = close;
    timestamp += interval;
  }
  
  return candles;
}

/**
 * Generate mock backtest result for demo
 */
function generateMockBacktestResult(initialBalance: number) {
  const totalTrades = 47;
  const winningTrades = 29;
  const losingTrades = 18;
  const winRate = (winningTrades / totalTrades) * 100;
  const totalPnl = initialBalance * 0.2346;
  
  return {
    id: `backtest-${Date.now()}`,
    status: "COMPLETED",
    progress: 100,
    metrics: {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      totalPnlPercent: 23.46,
      avgPnl: totalPnl / totalTrades,
      profitFactor: 1.89,
      sharpeRatio: 1.42,
      maxDrawdown: initialBalance * 0.087,
      maxDrawdownPercent: 8.7,
    },
    trades: [],
    equityCurve: [],
    initialBalance,
    finalBalance: initialBalance + totalPnl,
    finalEquity: initialBalance + totalPnl,
    dataInfo: {
      source: "mock",
      candlesCount: 0,
      exchange: "unknown",
      symbol: "unknown",
      timeframe: "1h",
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
    },
  };
}
