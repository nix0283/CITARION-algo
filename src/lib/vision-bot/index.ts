/**
 * Vision Bot - Market Forecasting & Trading System
 *
 * Production-grade Vision Bot with:
 * - Real-time WebSocket data streaming from exchanges
 * - ML Service integration for predictions
 * - 24h price forecast with confidence intervals
 * - Multi-symbol correlation analysis
 * - Ensemble prediction combining technical and ML
 * - Training data collection for model improvement
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
  MarketData,
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
  type EnhancedMarketForecast,
  type PriceForecast24h,
  type ForecastSignals,
  type ForecastServiceConfig,
} from './forecast-service';
import {
  FeatureEngineer,
  CorrelationMatrixBuilder,
  marketDataToCandles,
  ohlcvToCandles,
} from './feature-engineer';
import { BinanceClient } from '../exchange/binance-client';
import {
  getRealDataProvider,
  getDataSyncService,
  type RealtimeDataCallback,
  type RealtimeCandle,
  type PriceCallback,
  type PriceTick,
  validateMarketData,
} from './real-data-provider';
import {
  getMLServiceClient,
  extractFeatures,
  featuresToArray,
  prepareSequenceData,
  type MarketFeatures,
  type MLPredictionResponse,
  type SignalClassificationResponse,
  type RegimeDetectionResponse,
} from './ml-service-client';
import { db } from '@/lib/db';

// --------------------------------------------------
// VISION BOT WORKER
// --------------------------------------------------

export class VisionBotWorker {
  private id: string;
  private config: VisionBotConfig;
  private status: VisionBotStatus;
  private analyzer: MarketAnalyzer;
  private exchangeClient: BinanceClient | null = null;
  private dataProvider = getRealDataProvider();
  private mlClient = getMLServiceClient();
  private forecastService: ForecastService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private useRealData = true;
  private mlHealthy = false;
  private realtimeUnsubscribe: (() => void) | null = null;
  private priceUnsubscribe: (() => void) | null = null;
  private latestCandle: RealtimeCandle | null = null;
  private latestPrice: PriceTick | null = null;
  private forecastHistory: EnhancedMarketForecast[] = [];
  private priceHistory: PriceTick[] = [];
  private signalHistory: Array<{
    timestamp: Date;
    signal: ForecastSignal;
    confidence: number;
    actualOutcome?: number;
    wasCorrect?: boolean;
  }> = [];

  constructor(config: VisionBotConfig) {
    this.id = config.id;
    this.config = config;
    this.analyzer = new MarketAnalyzer(config);
    this.forecastService = new ForecastService({ useMLService: true, fallbackToTechnical: true });

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
   * Initialize the bot with real-time connections
   */
  async initialize(): Promise<void> {
    console.log(`[Vision ${this.id}] Initializing...`);

    // Check ML service health
    this.mlHealthy = await this.mlClient.healthCheck();
    console.log(`[Vision ${this.id}] ML Service: ${this.mlHealthy ? 'Available' : 'Unavailable'}`);

    // Subscribe to real-time data for primary symbol
    if (this.useRealData) {
      const symbol = this.config.cryptoSymbols[0];
      console.log(`[Vision ${this.id}] Subscribing to real-time data for ${symbol}...`);

      // Subscribe to candle data
      this.realtimeUnsubscribe = this.dataProvider.subscribeToRealtime(
        symbol,
        this.config.timeframe,
        (candle: RealtimeCandle) => {
          this.latestCandle = candle;
          if (candle.isFinal) {
            console.log(`[Vision ${this.id}] New final candle: ${candle.close}`);
            this.runForecast().catch(err => {
              console.error(`[Vision ${this.id}] Forecast error:`, err);
            });
          }
        }
      );

      // Subscribe to price data
      this.priceUnsubscribe = this.dataProvider.subscribeToPrice(
        symbol,
        (tick: PriceTick) => {
          this.latestPrice = tick;
          this.priceHistory.push(tick);
          // Keep last 1000 price ticks
          if (this.priceHistory.length > 1000) {
            this.priceHistory.shift();
          }
        }
      );
    }
  }

  /**
   * Fetch market data from exchange with fallback
   */
  async fetchMarketData(symbol: string, days: number = 30): Promise<MarketData[]> {
    try {
      if (this.useRealData) {
        const result = await this.dataProvider.fetchMarketData(
          symbol,
          this.config.timeframe,
          days,
          'futures'
        );

        if (result.data.length > 0) {
          console.log(`[Vision ${this.id}] Fetched ${result.data.length} real candles for ${symbol} from ${result.exchange}`);
          return result.data;
        }
      }

      // Fallback to synthetic data if real data unavailable
      console.warn(`[Vision ${this.id}] Using synthetic data fallback for ${symbol}`);
      const data = generateSyntheticData(days, 50000, 0.03);
      this.analyzer.addData(symbol, data);
      return data;

    } catch (error) {
      console.error(`[Vision ${this.id}] Error fetching data for ${symbol}:`, error);

      console.warn(`[Vision ${this.id}] Falling back to synthetic data due to error`);
      const data = generateSyntheticData(days, 50000, 0.03);
      this.analyzer.addData(symbol, data);
      return data;
    }
  }

  /**
   * Run forecast cycle with ML integration
   */
  async runForecast(): Promise<EnhancedMarketForecast | null> {
    console.log(`[Vision ${this.id}] Running forecast...`);

    const symbol = this.config.cryptoSymbols[0];
    const marketData = await this.fetchMarketData(symbol, this.config.lookbackDays);

    if (marketData.length < 50) {
      console.error(`[Vision ${this.id}] Insufficient data for forecast: ${marketData.length} candles`);
      return null;
    }

    // Validate data quality
    const validation = validateMarketData(marketData);
    if (!validation.valid) {
      console.warn(`[Vision ${this.id}] Data quality issues:`, validation.issues);
    }

    // Load data into forecast service
    this.forecastService.loadMarketData(symbol, marketData);

    // Generate enhanced forecast with ML integration
    let forecast: EnhancedMarketForecast | null = null;

    if (this.mlHealthy) {
      try {
        forecast = await this.forecastService.generateEnhancedForecastWithML(symbol);

        if (forecast) {
          console.log(`[Vision ${this.id}] ML Forecast: ${forecast.direction} (${(forecast.confidence * 100).toFixed(0)}% confidence)`);
          console.log(`[Vision ${this.id}] Predicted 24h change: ${forecast.predictedChange24h.toFixed(2)}%`);
          if (forecast.priceForecast) {
            console.log(`[Vision ${this.id}] Price: $${forecast.priceForecast.predictedPrice.toFixed(2)} (CI: $${forecast.priceForecast.confidenceInterval.lower.toFixed(2)} - $${forecast.priceForecast.confidenceInterval.upper.toFixed(2)})`);
          }
          if (forecast.regime) {
            console.log(`[Vision ${this.id}] Market Regime: ${forecast.regime} (${((forecast.regimeConfidence || 0) * 100).toFixed(0)}% confidence)`);
          }
        }
      } catch (error) {
        console.warn(`[Vision ${this.id}] ML forecast failed, falling back to technical:`, error);
      }
    }

    // Fallback to legacy forecast if ML failed
    if (!forecast) {
      this.analyzer.addData(symbol, marketData);
      const legacyForecast = this.analyzer.generateForecast(symbol);

      forecast = {
        direction: this.probabilitiesToDirection(legacyForecast.probabilities),
        confidence: legacyForecast.confidence,
        upwardProb: legacyForecast.probabilities.upward,
        downwardProb: legacyForecast.probabilities.downward,
        consolidationProb: legacyForecast.probabilities.consolidation,
        predictedChange24h: 0,
        timestamp: new Date(),
        symbol,
        indicators: {} as any,
        correlations: new Map(),
        signals: {} as any,
        mlAvailable: false,
      };

      console.log(`[Vision ${this.id}] Legacy Forecast: ${forecast.direction} (${(forecast.confidence * 100).toFixed(0)}% confidence)`);
    }

    // Store forecast in history
    this.forecastHistory.push(forecast);
    if (this.forecastHistory.length > 100) {
      this.forecastHistory.shift();
    }

    // Store signal for feedback
    const signal = this.directionToSignal(forecast.direction);
    this.signalHistory.push({
      timestamp: new Date(),
      signal,
      confidence: forecast.confidence,
    });

    // Update status
    this.status.currentForecast = this.enhancedToMarketForecast(forecast);
    this.status.currentSignal = signal;
    this.status.lastForecastTime = new Date();

    // Record training data
    await this.recordTrainingData(symbol, marketData, forecast);

    return forecast;
  }

  /**
   * Get current price from real-time stream
   */
  getCurrentPrice(): number {
    if (this.latestPrice) {
      return this.latestPrice.price;
    }
    if (this.latestCandle) {
      return this.latestCandle.close;
    }
    return 0;
  }

  /**
   * Get detailed price forecast
   */
  async getPriceForecast(): Promise<PriceForecast24h | null> {
    const forecast = await this.runForecast();
    return forecast?.priceForecast || null;
  }

  /**
   * Get forecast history
   */
  getForecastHistory(): EnhancedMarketForecast[] {
    return [...this.forecastHistory];
  }

  /**
   * Get signal performance statistics
   */
  getSignalPerformance(): {
    totalSignals: number;
    longSignals: number;
    shortSignals: number;
    neutralSignals: number;
    avgConfidence: number;
  } {
    const signals = this.signalHistory;
    return {
      totalSignals: signals.length,
      longSignals: signals.filter(s => s.signal === 'LONG').length,
      shortSignals: signals.filter(s => s.signal === 'SHORT').length,
      neutralSignals: signals.filter(s => s.signal === 'NEUTRAL').length,
      avgConfidence: signals.length > 0
        ? signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length
        : 0,
    };
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

    console.log(`[Vision ${this.id}] Started with ${this.config.forecastIntervalMinutes}min interval (Real Data: ${this.useRealData}, ML: ${this.mlHealthy})`);
  }

  /**
   * Stop the bot
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.realtimeUnsubscribe) {
      this.realtimeUnsubscribe();
      this.realtimeUnsubscribe = null;
    }

    if (this.priceUnsubscribe) {
      this.priceUnsubscribe();
      this.priceUnsubscribe = null;
    }

    this.isRunning = false;
    this.status.isRunning = false;

    console.log(`[Vision ${this.id}] Stopped`);
  }

  /**
   * Get ML service status
   */
  getMLStatus(): { healthy: boolean; lastCheck: Date | null } {
    return {
      healthy: this.mlHealthy,
      lastCheck: this.mlClient.getLastHealthCheck(),
    };
  }

  /**
   * Get real-time data status
   */
  getRealtimeStatus(): {
    wsConnected: boolean;
    latestCandle: RealtimeCandle | null;
    latestPrice: PriceTick | null;
    priceHistoryCount: number;
  } {
    const symbol = this.config.cryptoSymbols[0];
    return {
      wsConnected: this.dataProvider.isWebSocketConnected(symbol, this.config.timeframe),
      latestCandle: this.latestCandle,
      latestPrice: this.latestPrice,
      priceHistoryCount: this.priceHistory.length,
    };
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

    if (newConfig.forecastIntervalMinutes && this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // Private helper methods

  private probabilitiesToDirection(probs: { upward: number; downward: number; consolidation: number }): 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION' {
    if (probs.upward > probs.downward && probs.upward > probs.consolidation) {
      return 'UPWARD';
    }
    if (probs.downward > probs.upward && probs.downward > probs.consolidation) {
      return 'DOWNWARD';
    }
    return 'CONSOLIDATION';
  }

  private directionToSignal(direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION'): ForecastSignal {
    if (direction === 'UPWARD') return 'LONG';
    if (direction === 'DOWNWARD') return 'SHORT';
    return 'NEUTRAL';
  }

  private enhancedToMarketForecast(enhanced: EnhancedMarketForecast): MarketForecast {
    return {
      timestamp: enhanced.timestamp,
      symbol: enhanced.symbol,
      probabilities: {
        upward: enhanced.upwardProb,
        downward: enhanced.downwardProb,
        consolidation: enhanced.consolidationProb,
      },
      indicators: {
        roc_24h: 0,
        atr_pct: enhanced.indicators?.atr?.percent || 0,
        trend_strength: 0,
        volume_ratio: 1,
        crypto_cnt: 1,
        stock_cnt: 0,
        gold_roc: 0,
      },
      correlations: { avg_corr: 0.5 },
      signal: this.directionToSignal(enhanced.direction),
      confidence: enhanced.confidence,
    };
  }

  private async recordTrainingData(
    symbol: string,
    marketData: MarketData[],
    forecast: EnhancedMarketForecast
  ): Promise<void> {
    try {
      const features = extractFeatures(marketData);
      const featureArray = featuresToArray(features);

      await db.visionTrainingData.create({
        data: {
          id: `${symbol}-${Date.now()}`,
          symbol,
          timestamp: new Date(),
          features: JSON.stringify(featureArray),
          signal: this.directionToSignal(forecast.direction),
          confidence: forecast.confidence,
          actualOutcome: null,
          wasCorrect: null,
          feedbackReceived: false,
        },
      });
    } catch (error) {
      // Don't fail if recording fails
      console.warn(`[Vision ${this.id}] Failed to record training data:`, error);
    }
  }
}

// --------------------------------------------------
// VISION BOT MANAGER
// --------------------------------------------------

export class VisionBotManager {
  private workers: Map<string, VisionBotWorker> = new Map();

  async createBot(config: VisionBotConfig): Promise<VisionBotWorker> {
    if (this.workers.has(config.id)) {
      throw new Error(`Vision bot ${config.id} already exists`);
    }

    const worker = new VisionBotWorker(config);
    this.workers.set(config.id, worker);

    return worker;
  }

  getBot(id: string): VisionBotWorker | undefined {
    return this.workers.get(id);
  }

  async startBot(id: string): Promise<void> {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new Error(`Vision bot ${id} not found`);
    }

    await worker.start();
  }

  stopBot(id: string): void {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new Error(`Vision bot ${id} not found`);
    }

    worker.stop();
  }

  removeBot(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.stop();
      this.workers.delete(id);
    }
  }

  getAllStatuses(): VisionBotStatus[] {
    return Array.from(this.workers.values()).map(w => w.getStatus());
  }

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
  static async runBacktest(
    symbol: string,
    strategy: StrategyType,
    days: number = 365,
    initialCapital: number = 10000,
    riskPerTrade: number = 0.1,
    leverage: number = 5,
    fee: number = 0.001
  ): Promise<BacktestResult> {
    const data = generateSyntheticData(days, 50000, 0.03);

    const strategies: Record<StrategyType, StrategyConfig> = {
      basic: { type: 'basic', stopLossPercent: 2, takeProfitPercent: 4, maxReentries: 0 },
      multi_tp: { type: 'multi_tp', stopLossPercent: 2, takeProfitPercent: 6, maxReentries: 0 },
      trailing: { type: 'trailing', stopLossPercent: 2, takeProfitPercent: 0, maxReentries: 0, trailingPercent: 2 },
      reentry_24h: { type: 'reentry_24h', stopLossPercent: 3, takeProfitPercent: 0, maxReentries: 3 },
    };

    const stratConfig = strategies[strategy];

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

    for (let i = 48; i < data.length; i++) {
      const candle = data[i];
      const windowData = data.slice(Math.max(0, i - 720), i);

      const roc = calculateROC(windowData, 24);
      const vol = calculateATRPercent(windowData, 14);
      const trend = calculateTrendStrength(windowData);
      const volRatio = calculateVolumeRatio(windowData, 24);

      const probs = generateForecast(
        { roc_24h: roc, atr_pct: vol, trend_strength: trend, volume_ratio: volRatio, crypto_cnt: 1, stock_cnt: 0, gold_roc: 0 },
        { avg_corr: 0.5 }
      );

      const signal = getSignalFromProbabilities(probs);

      const cycleStart = i % 24 === 0;

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

      const currentEquity = capital + (position !== 0
        ? position > 0
          ? position * (candle.close - entryPrice)
          : Math.abs(position) * (entryPrice - candle.close)
        : 0);
      equityCurve.push(currentEquity);

      if (signal === 'NEUTRAL') continue;

      const direction = signal === 'LONG' ? 1 : -1;

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

      if (position !== 0) {
        if (direction > 0) {
          highSinceEntry = Math.max(highSinceEntry, candle.high);
        } else {
          lowSinceEntry = Math.min(lowSinceEntry, candle.low);
        }
      }

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

    const finalEquity = equityCurve[equityCurve.length - 1];
    const totalReturn = ((finalEquity / initialCapital) - 1) * 100;

    let maxDD = 0;
    let peak = initialCapital;
    for (const eq of equityCurve) {
      if (eq > peak) peak = eq;
      const dd = (peak - eq) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }

    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(8760) : 0;

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
      avgTradeDurationHours: 24,
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
  PriceForecast24h,
} from './forecast-service';

// Re-export enhanced modules
export {
  getMLServiceClient,
  MLServiceClient,
  extractFeatures,
  featuresToArray,
  prepareSequenceData,
  type MLPredictionResponse,
  type SignalClassificationResponse,
  type RegimeDetectionResponse,
  type MLServiceHealth,
} from './ml-service-client';

export {
  getRealDataProvider,
  RealDataProvider,
  getDataSyncService,
  DataSyncService,
  ohlcvToMarketData as realOhlcvToMarketData,
  validateMarketData,
  type RealtimeCandle,
  type PriceTick,
} from './real-data-provider';
