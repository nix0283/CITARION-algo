/**
 * Vision Bot - Market Forecasting & Trading System
 *
 * Based on market_analyzer_crypto by roman-boop
 * Provides 24-hour probability-based market forecasting
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  VisionBotConfig,
  VisionBotStatus,
  MarketForecast,
  Position,
  Trade,
  ForecastSignal,
  StrategyType,
  StrategyConfig,
  RiskProfile,
  RiskProfileType,
  BacktestResult,
  STRATEGY_PRESETS,
  RISK_PROFILES,
} from './types';
import {
  MarketAnalyzer,
  ForecastService,
  ohlcvToMarketData,
  generateSyntheticData,
  calculateROC,
  calculateATRPercent,
  calculateTrendStrength,
  calculateVolumeRatio,
  generateForecast,
  getSignalFromProbabilities,
  formatEnhancedForecast,
} from './forecast-service';
import {
  FeatureEngineer,
  CorrelationMatrixBuilder,
  marketDataToCandles,
  ohlcvToCandles,
} from './feature-engineer';
import { BinanceClient } from '../exchange/binance-client';

// --------------------------------------------------
// VISION BOT WORKER
// --------------------------------------------------

export class VisionBotWorker {
  private id: string;
  private config: VisionBotConfig;
  private status: VisionBotStatus;
  private analyzer: MarketAnalyzer;
  private exchangeClient: BinanceClient | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: VisionBotConfig) {
    this.id = config.id;
    this.config = config;
    this.analyzer = new MarketAnalyzer(config);

    this.status = {
      id: this.id,
      isRunning: false,
      currentSignal: 'NEUTRAL',
      equity: config.initialCapital,
      trades: [],
      totalReturn: 0,
      winRate: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
    };
  }

  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    // Initialize exchange client for data fetching
    // In production, use the exchange manager to get the client
    console.log(`[Vision ${this.id}] Initializing...`);
  }

  /**
   * Fetch market data from exchange
   */
  async fetchMarketData(symbol: string, days: number = 30): Promise<void> {
    try {
      // For now, use synthetic data for demo
      // In production, fetch from actual exchange API
      const data = generateSyntheticData(days, 50000, 0.03);
      this.analyzer.addData(symbol, data);

      console.log(`[Vision ${this.id}] Fetched ${data.length} candles for ${symbol}`);
    } catch (error) {
      console.error(`[Vision ${this.id}] Error fetching data for ${symbol}:`, error);
    }
  }

  /**
   * Run forecast cycle
   */
  async runForecast(): Promise<MarketForecast | null> {
    console.log(`[Vision ${this.id}] Running forecast...`);

    // Fetch data for configured symbols
    for (const symbol of this.config.cryptoSymbols.slice(0, 3)) {
      await this.fetchMarketData(symbol, this.config.lookbackDays);
    }

    // Generate forecast
    const forecast = this.analyzer.generateForecast(this.config.cryptoSymbols[0]);

    // Update status
    this.status.currentForecast = forecast;
    this.status.currentSignal = forecast.signal;
    this.status.lastForecastTime = new Date();

    console.log(`[Vision ${this.id}] Forecast: ${forecast.signal} (${(forecast.confidence * 100).toFixed(0)}% confidence)`);

    return forecast;
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[Vision ${this.id}] Already running`);
      return;
    }

    await this.initialize();
    this.isRunning = true;
    this.status.isRunning = true;

    // Run initial forecast
    await this.runForecast();

    // Set up interval for regular forecasts
    this.intervalId = setInterval(
      () => this.runForecast(),
      this.config.forecastIntervalMinutes * 60 * 1000
    );

    console.log(`[Vision ${this.id}] Started with ${this.config.forecastIntervalMinutes}min interval`);
  }

  /**
   * Stop the bot
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    this.status.isRunning = false;

    console.log(`[Vision ${this.id}] Stopped`);
  }

  /**
   * Get current status
   */
  getStatus(): VisionBotStatus {
    return { ...this.status };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<VisionBotConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart if interval changed
    if (newConfig.forecastIntervalMinutes && this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

// --------------------------------------------------
// VISION BOT MANAGER
// --------------------------------------------------

export class VisionBotManager {
  private workers: Map<string, VisionBotWorker> = new Map();

  /**
   * Create a new Vision bot
   */
  async createBot(config: VisionBotConfig): Promise<VisionBotWorker> {
    if (this.workers.has(config.id)) {
      throw new Error(`Vision bot ${config.id} already exists`);
    }

    const worker = new VisionBotWorker(config);
    this.workers.set(config.id, worker);

    return worker;
  }

  /**
   * Get bot by ID
   */
  getBot(id: string): VisionBotWorker | undefined {
    return this.workers.get(id);
  }

  /**
   * Start a bot
   */
  async startBot(id: string): Promise<void> {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new Error(`Vision bot ${id} not found`);
    }

    await worker.start();
  }

  /**
   * Stop a bot
   */
  stopBot(id: string): void {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new Error(`Vision bot ${id} not found`);
    }

    worker.stop();
  }

  /**
   * Remove a bot
   */
  removeBot(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.stop();
      this.workers.delete(id);
    }
  }

  /**
   * Get all bot statuses
   */
  getAllStatuses(): VisionBotStatus[] {
    return Array.from(this.workers.values()).map(w => w.getStatus());
  }

  /**
   * Stop all bots
   */
  stopAll(): void {
    for (const worker of this.workers.values()) {
      worker.stop();
    }
  }
}

// Singleton manager
let visionManager: VisionBotManager | null = null;

export function getVisionManager(): VisionBotManager {
  if (!visionManager) {
    visionManager = new VisionBotManager();
  }
  return visionManager;
}

// --------------------------------------------------
// BACKTEST ENGINE
// --------------------------------------------------

export class VisionBacktester {
  /**
   * Run backtest for a strategy
   */
  static async runBacktest(
    symbol: string,
    strategy: StrategyType,
    days: number = 365,
    initialCapital: number = 10000,
    riskPerTrade: number = 0.1,
    leverage: number = 5,
    fee: number = 0.001
  ): Promise<BacktestResult> {
    // Generate synthetic data for backtest
    const data = generateSyntheticData(days, 50000, 0.03);

    // Strategy config
    const strategies: Record<StrategyType, StrategyConfig> = {
      basic: { type: 'basic', stopLossPercent: 2, takeProfitPercent: 4, maxReentries: 0 },
      multi_tp: { type: 'multi_tp', stopLossPercent: 2, takeProfitPercent: 6, maxReentries: 0 },
      trailing: { type: 'trailing', stopLossPercent: 2, takeProfitPercent: 0, maxReentries: 0, trailingPercent: 2 },
      reentry_24h: { type: 'reentry_24h', stopLossPercent: 3, takeProfitPercent: 0, maxReentries: 3 },
    };

    const stratConfig = strategies[strategy];

    // Trading state
    let capital = initialCapital;
    let position = 0;
    let entryPrice = 0;
    let entryTime: Date | null = null;
    let reentries = 0;
    let highSinceEntry = 0;
    let lowSinceEntry = Infinity;
    let currentSl: number | undefined;
    let currentTp: number | undefined;

    const trades: Trade[] = [];
    const equityCurve: number[] = [initialCapital];

    // Process data candle by candle
    for (let i = 48; i < data.length; i++) {
      const candle = data[i];
      const prevCandle = data[i - 1];
      const windowData = data.slice(Math.max(0, i - 720), i);

      // Calculate indicators for this candle
      const roc = calculateROC(windowData, 24);
      const vol = calculateATRPercent(windowData, 14);
      const trend = calculateTrendStrength(windowData);
      const volRatio = calculateVolumeRatio(windowData, 24);

      // Generate forecast probabilities
      const probs = generateForecast(
        { roc_24h: roc, atr_pct: vol, trend_strength: trend, volume_ratio: volRatio, crypto_cnt: 1, stock_cnt: 0, gold_roc: 0 },
        { avg_corr: 0.5 }
      );

      const signal = getSignalFromProbabilities(probs);

      // Check for cycle start (every 24 candles)
      const cycleStart = i % 24 === 0;

      // Force exit at cycle start
      if (cycleStart && position !== 0) {
        const pnl = position > 0
          ? position * (candle.close - entryPrice)
          : Math.abs(position) * (entryPrice - candle.close);

        capital += pnl - Math.abs(position) * candle.close * fee;

        const trade = trades[trades.length - 1];
        if (trade) {
          trade.exitTime = candle.timestamp;
          trade.exitPrice = candle.close;
          trade.pnl = pnl;
          trade.exitReason = 'cycle_start';
        }

        position = 0;
        reentries = 0;
        currentSl = undefined;
        currentTp = undefined;
      }

      // Update equity
      const currentEquity = capital + (position !== 0
        ? position > 0
          ? position * (candle.close - entryPrice)
          : Math.abs(position) * (entryPrice - candle.close)
        : 0);
      equityCurve.push(currentEquity);

      // Skip if no signal
      if (signal === 'NEUTRAL') continue;

      const direction = signal === 'LONG' ? 1 : -1;

      // Entry / Re-entry logic
      const reentryCond = strategy === 'reentry_24h' &&
        reentries < stratConfig.maxReentries &&
        entryPrice !== 0 &&
        Math.abs((candle.close - entryPrice) / entryPrice) > 0.01;

      if (position === 0 || reentryCond) {
        const maxSize = capital * 0.2;
        const riskSize = capital * riskPerTrade * leverage;
        const size = Math.min(riskSize, maxSize) / candle.close;

        if (size > 0) {
          const newPos = size * direction;
          capital -= size * candle.close * fee;

          // Calculate SL/TP
          if (stratConfig.stopLossPercent > 0) {
            currentSl = direction > 0
              ? candle.close * (1 - stratConfig.stopLossPercent / 100)
              : candle.close * (1 + stratConfig.stopLossPercent / 100);
          } else {
            currentSl = undefined;
          }

          if (stratConfig.takeProfitPercent > 0) {
            currentTp = direction > 0
              ? candle.close * (1 + stratConfig.takeProfitPercent / 100)
              : candle.close * (1 - stratConfig.takeProfitPercent / 100);
          } else {
            currentTp = undefined;
          }

          if (position === 0) {
            // New entry
            entryPrice = candle.close;
            entryTime = candle.timestamp;
            highSinceEntry = direction > 0 ? candle.close : 0;
            lowSinceEntry = direction < 0 ? candle.close : Infinity;

            trades.push({
              id: uuidv4(),
              symbol,
              direction: signal,
              entryTime: candle.timestamp,
              entryPrice: candle.close,
              size,
            });
          } else {
            // Re-entry
            trades.push({
              id: uuidv4(),
              symbol,
              direction: signal,
              entryTime: candle.timestamp,
              entryPrice: candle.close,
              size,
              reentry: true,
            });
          }

          position += newPos;
          reentries++;
        }
      }

      // Update trailing data
      if (position !== 0) {
        if (direction > 0) {
          highSinceEntry = Math.max(highSinceEntry, candle.high);
        } else {
          lowSinceEntry = Math.min(lowSinceEntry, candle.low);
        }
      }

      // Exit logic
      let exitCond = false;
      let exitReason: 'SL' | 'TP' | 'cycle_start' | 'manual' | undefined;

      if (strategy === 'basic' && position !== 0) {
        if (direction > 0) {
          if (currentSl && candle.low <= currentSl) { exitCond = true; exitReason = 'SL'; }
          if (currentTp && candle.high >= currentTp) { exitCond = true; exitReason = 'TP'; }
        } else {
          if (currentSl && candle.high >= currentSl) { exitCond = true; exitReason = 'SL'; }
          if (currentTp && candle.low <= currentTp) { exitCond = true; exitReason = 'TP'; }
        }
      }

      if (strategy === 'trailing' && position !== 0 && stratConfig.trailingPercent) {
        if (direction > 0 && highSinceEntry > 0) {
          const trailStop = highSinceEntry * (1 - stratConfig.trailingPercent / 100);
          if (candle.low <= trailStop) {
            exitCond = true;
            exitReason = 'SL';
          }
        } else if (direction < 0 && lowSinceEntry < Infinity) {
          const trailStop = lowSinceEntry * (1 + stratConfig.trailingPercent / 100);
          if (candle.high >= trailStop) {
            exitCond = true;
            exitReason = 'SL';
          }
        }
      }

      if (strategy === 'reentry_24h' && position !== 0 && currentSl) {
        if (direction > 0 && candle.low <= currentSl) {
          exitCond = true;
          exitReason = 'SL';
        } else if (direction < 0 && candle.high >= currentSl) {
          exitCond = true;
          exitReason = 'SL';
        }
      }

      if (exitCond && position !== 0) {
        const pnl = position > 0
          ? position * (candle.close - entryPrice)
          : Math.abs(position) * (entryPrice - candle.close);

        capital += pnl - Math.abs(position) * candle.close * fee;

        const trade = trades[trades.length - 1];
        if (trade) {
          trade.exitTime = candle.timestamp;
          trade.exitPrice = candle.close;
          trade.pnl = pnl;
          trade.exitReason = exitReason;
        }

        position = 0;
        reentries = 0;
        currentSl = undefined;
        currentTp = undefined;
      }
    }

    // Calculate metrics
    const finalEquity = equityCurve[equityCurve.length - 1];
    const totalReturn = ((finalEquity / initialCapital) - 1) * 100;

    // Max drawdown
    let maxDD = 0;
    let peak = initialCapital;
    for (const eq of equityCurve) {
      if (eq > peak) peak = eq;
      const dd = (peak - eq) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }

    // Sharpe ratio (simplified)
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(8760) : 0;

    // Trade stats
    const pnls = trades.filter(t => t.pnl !== undefined).map(t => t.pnl!);
    const winTrades = pnls.filter(p => p > 0).length;
    const winRate = pnls.length > 0 ? (winTrades / pnls.length) * 100 : 0;

    return {
      symbol,
      strategy,
      startDate: data[0].timestamp,
      endDate: data[data.length - 1].timestamp,
      initialCapital,
      finalCapital: finalEquity,
      totalReturnPct: Math.round(totalReturn * 100) / 100,
      cagrPct: Math.round(Math.pow(finalEquity / initialCapital, 365 / (days * 24)) - 1) * 10000 / 100,
      sharpeRatio: Math.round(sharpe * 100) / 100,
      maxDrawdownPct: Math.round(maxDD * 100) / 100,
      numTrades: trades.length,
      winRatePct: Math.round(winRate * 100) / 100,
      avgTradePnl: pnls.length > 0 ? Math.round((pnls.reduce((a, b) => a + b, 0) / pnls.length) * 100) / 100 : 0,
      profitFactor: pnls.filter(p => p > 0).reduce((a, b) => a + b, 0) / (Math.abs(pnls.filter(p => p < 0).reduce((a, b) => a + b, 0)) || 1),
      avgTradeDurationHours: 24, // Simplified
      trades: trades.slice(-100),
    };
  }
}

// Re-export types
export type {
  VisionBotConfig,
  VisionBotStatus,
  MarketForecast,
  EnhancedMarketForecast,
  Position,
  Trade,
  ForecastSignal,
  StrategyType,
  BacktestResult,
  ForecastProbabilities,
  AggregatedIndicators,
  Correlations,
  AssetIndicators,
};

// Re-export forecast service classes and functions
export {
  ForecastService,
  MarketAnalyzer,
  ohlcvToMarketData,
  generateSyntheticData,
  calculateROC,
  calculateATRPercent,
  calculateTrendStrength,
  calculateVolumeRatio,
  generateForecast,
  getSignalFromProbabilities,
  formatEnhancedForecast,
};

// Re-export feature engineer classes and functions
export {
  FeatureEngineer,
  CorrelationMatrixBuilder,
  marketDataToCandles,
  ohlcvToCandles,
};

// Re-export types from feature-engineer
export type {
  RSISResult,
  MACDResult,
  BollingerBandsResult,
  ATRResult,
  CorrelationResult,
  FeatureSet,
  CandlesInput,
  CorrelationMatrix,
} from './feature-engineer';

// Re-export types from forecast-service
export type {
  EnhancedMarketForecast as ForecastResult,
  ForecastSignals,
  ForecastServiceConfig,
} from './forecast-service';
