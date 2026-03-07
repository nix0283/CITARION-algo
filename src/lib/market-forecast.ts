/**
 * Market Forecast Module - 24-Hour Market Forecast with Cross-Asset Analysis
 *
 * Based on: https://github.com/roman-boop/market_analyzer_crypto
 *
 * Features:
 * - Multi-asset correlation analysis (crypto, stocks, gold)
 * - Probability-based market direction forecast (up/down/consolidation)
 * - Technical indicators: ROC, ATR%, EMA trend, Volume ratio
 * - Multiple trading strategies with risk profiles
 * - Can be used standalone or as additional signal for Argus Bot
 *
 * Integration:
 * - Optional toggle in Argus Bot config
 * - Provides market sentiment boost to pump/dump signals
 */

// ==================== TYPES ====================

export type MarketDirection = "UPWARD" | "DOWNWARD" | "CONSOLIDATION";
export type RiskProfileType = "easy" | "normal" | "hard" | "scalper";
export type TradingStrategy = "basic" | "multi_tp" | "trailing" | "reentry_24h";

export interface MarketForecastConfig {
  enabled: boolean;

  // Data sources
  cryptoSymbols: string[];
  stockIndices: string[];
  goldSymbol: string;

  // Timeframe
  timeframe: "1h" | "4h" | "1d";
  lookbackDays: number;

  // Thresholds
  volatilityLow: number;      // Default: 0.01 (1%)
  volatilityHigh: number;     // Default: 0.05 (5%)
  trendThreshold: number;     // Default: 0.02 (2%)
  correlationWeight: number;  // Default: 0.30

  // Risk profile
  riskProfile: RiskProfileType;
  leverage: number;

  // Trading strategy
  strategy: TradingStrategy;

  // Integration with Argus
  boostArgusSignals: boolean;      // Apply forecast to boost Argus signals
  forecastWeight: number;          // Weight of forecast in signal scoring (0-1)
  requireConfirmation: boolean;    // Only trade when forecast confirms signal direction
}

export interface AssetIndicators {
  symbol: string;
  roc24h: number;           // Rate of change 24h
  atrPercent: number;       // ATR as % of price
  trendStrength: number;    // EMA12/EMA26 difference
  volumeRatio: number;      // Current volume / 24h MA
}

export interface MarketIndicators {
  avgRoc24h: number;
  avgAtrPercent: number;
  avgTrendStrength: number;
  avgVolumeRatio: number;
  goldRoc24h: number;
  cryptoCount: number;
  stockCount: number;
}

export interface CorrelationData {
  btcVsAlts: Map<string, number>;
  btcVsStocks: Map<string, number>;
  btcVsGold: number;
  averageCorrelation: number;
}

export interface MarketForecast {
  id: string;
  timestamp: Date;

  // Probabilities
  upwardProbability: number;
  downwardProbability: number;
  consolidationProbability: number;

  // Direction
  direction: MarketDirection;
  confidence: number;  // 0-1, how confident in the forecast

  // Supporting data
  indicators: MarketIndicators;
  correlations: CorrelationData;

  // Trading signal
  tradingSignal: {
    action: "BUY" | "SELL" | "HOLD";
    leverage: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    reason: string;
  };
}

export interface RiskProfile {
  riskPerTrade: number;
  leverage: number;
  maxReentries: number;
  targetMonthly: number;
  maxTradesPerDay?: number;
}

export interface BacktestResult {
  totalReturn: number;
  cagr: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  numTrades: number;
  avgTradeDuration: number;  // hours
}

// ==================== CONSTANTS ====================

const DEFAULT_CRYPTO_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "DOTUSDT",
  "LINKUSDT", "LTCUSDT", "TRXUSDT", "AVAXUSDT", "DOGEUSDT"
];

const DEFAULT_STOCK_INDICES = ["^GSPC", "^IXIC", "^DJI"];  // S&P 500, NASDAQ, Dow
const DEFAULT_GOLD_SYMBOL = "GC=F";

const RISK_PROFILES: Record<RiskProfileType, RiskProfile> = {
  easy: {
    riskPerTrade: 0.05,
    leverage: 2,
    maxReentries: 1,
    targetMonthly: 0.03,
  },
  normal: {
    riskPerTrade: 0.10,
    leverage: 3,
    maxReentries: 2,
    targetMonthly: 0.06,
  },
  hard: {
    riskPerTrade: 0.15,
    leverage: 5,
    maxReentries: 3,
    targetMonthly: 0.10,
  },
  scalper: {
    riskPerTrade: 0.02,
    leverage: 10,
    maxReentries: 5,
    targetMonthly: 0.05,
    maxTradesPerDay: 10,
  },
};

// ==================== DATA FETCHER ====================

class MarketDataFetcher {
  private cache: Map<string, { data: OHLCV[]; timestamp: Date }> = new Map();
  private cacheDuration = 60 * 60 * 1000; // 1 hour

  /**
   * Fetch OHLCV data from Binance (public API)
   */
  async fetchCryptoOHLCV(
    symbol: string,
    interval: string = "1h",
    limit: number = 720  // 30 days of hourly data
  ): Promise<OHLCV[]> {
    const cacheKey = `crypto_${symbol}_${interval}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheDuration) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json() as Array<[
        number,  // Open time
        string,  // Open
        string,  // High
        string,  // Low
        string,  // Close
        string,  // Volume
        number,  // Close time
        string,  // Quote asset volume
        number,  // Number of trades
        string,  // Taker buy base asset volume
        string,  // Taker buy quote asset volume
        string   // Ignore
      ]>;

      const ohlcv: OHLCV[] = data.map(candle => ({
        timestamp: new Date(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));

      this.cache.set(cacheKey, { data: ohlcv, timestamp: new Date() });
      return ohlcv;
    } catch (error) {
      console.error(`[MarketForecast] Error fetching ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Fetch futures OHLCV from Binance
   */
  async fetchFuturesOHLCV(
    symbol: string,
    interval: string = "1h",
    limit: number = 720
  ): Promise<OHLCV[]> {
    const cacheKey = `futures_${symbol}_${interval}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheDuration) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Binance Futures API error: ${response.status}`);
      }

      const data = await response.json() as Array<[
        number, string, string, string, string, string,
        number, string, number, string, string, string
      ]>;

      const ohlcv: OHLCV[] = data.map(candle => ({
        timestamp: new Date(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));

      this.cache.set(cacheKey, { data: ohlcv, timestamp: new Date() });
      return ohlcv;
    } catch (error) {
      console.error(`[MarketForecast] Error fetching futures ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

interface OHLCV {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ==================== TECHNICAL INDICATORS ====================

class TechnicalIndicators {
  /**
   * Calculate Rate of Change (ROC)
   */
  static roc(prices: number[], period: number): number {
    if (prices.length < period + 1) return 0;
    const current = prices[prices.length - 1];
    const previous = prices[prices.length - 1 - period];
    if (previous === 0) return 0;
    return (current - previous) / previous;
  }

  /**
   * Calculate ATR (Average True Range)
   */
  static atr(data: OHLCV[], period: number = 14): number {
    if (data.length < period + 1) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Simple moving average of TR
    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((a, b) => a + b, 0) / recentTR.length;
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   */
  static ema(prices: number[], period: number): number[] {
    if (prices.length === 0) return [];

    const multiplier = 2 / (period + 1);
    const emaValues: number[] = [prices[0]];

    for (let i = 1; i < prices.length; i++) {
      const ema = (prices[i] - emaValues[i - 1]) * multiplier + emaValues[i - 1];
      emaValues.push(ema);
    }

    return emaValues;
  }

  /**
   * Calculate EMA Trend Strength (EMA12 vs EMA26)
   */
  static emaTrendStrength(prices: number[]): number {
    if (prices.length < 26) return 0;

    const ema12 = this.ema(prices, 12);
    const ema26 = this.ema(prices, 26);

    const currentEma12 = ema12[ema12.length - 1];
    const currentEma26 = ema26[ema26.length - 1];

    if (currentEma26 === 0) return 0;
    return (currentEma12 - currentEma26) / currentEma26;
  }

  /**
   * Calculate Volume Ratio (current vs 24h MA)
   */
  static volumeRatio(volumes: number[]): number {
    if (volumes.length < 24) return 1;

    const currentVolume = volumes[volumes.length - 1];
    const ma24 = volumes.slice(-24).reduce((a, b) => a + b, 0) / 24;

    if (ma24 === 0) return 1;
    return currentVolume / ma24;
  }

  /**
   * Calculate RSI
   */
  static rsi(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}

// ==================== MARKET ANALYZER ====================

class MarketAnalyzer {
  private fetcher: MarketDataFetcher;
  private data: Map<string, OHLCV[]> = new Map();

  constructor() {
    this.fetcher = new MarketDataFetcher();
  }

  /**
   * Load data for all symbols
   */
  async loadData(config: MarketForecastConfig): Promise<void> {
    console.log("[MarketForecast] Loading market data...");

    // Load crypto data
    const cryptoPromises = config.cryptoSymbols.map(async (symbol) => {
      const data = await this.fetcher.fetchFuturesOHLCV(symbol);
      if (data.length > 0) {
        this.data.set(symbol, data);
      }
    });

    await Promise.all(cryptoPromises);
    console.log(`[MarketForecast] Loaded data for ${this.data.size} symbols`);
  }

  /**
   * Calculate indicators for a single asset
   */
  calculateAssetIndicators(symbol: string): AssetIndicators | null {
    const ohlcv = this.data.get(symbol);
    if (!ohlcv || ohlcv.length < 24) return null;

    const prices = ohlcv.map(d => d.close);
    const volumes = ohlcv.map(d => d.volume);
    const currentPrice = prices[prices.length - 1];

    return {
      symbol,
      roc24h: TechnicalIndicators.roc(prices, 24),
      atrPercent: TechnicalIndicators.atr(ohlcv, 14) / currentPrice,
      trendStrength: TechnicalIndicators.emaTrendStrength(prices),
      volumeRatio: TechnicalIndicators.volumeRatio(volumes),
    };
  }

  /**
   * Aggregate indicators across all assets
   */
  aggregateIndicators(): MarketIndicators {
    const allIndicators: AssetIndicators[] = [];

    for (const symbol of this.data.keys()) {
      const ind = this.calculateAssetIndicators(symbol);
      if (ind) allIndicators.push(ind);
    }

    if (allIndicators.length === 0) {
      return {
        avgRoc24h: 0,
        avgAtrPercent: 0,
        avgTrendStrength: 0,
        avgVolumeRatio: 0,
        goldRoc24h: 0,
        cryptoCount: 0,
        stockCount: 0,
      };
    }

    const btcInd = allIndicators.find(i => i.symbol === "BTCUSDT");

    return {
      avgRoc24h: allIndicators.reduce((a, b) => a + b.roc24h, 0) / allIndicators.length,
      avgAtrPercent: allIndicators.reduce((a, b) => a + b.atrPercent, 0) / allIndicators.length,
      avgTrendStrength: allIndicators.reduce((a, b) => a + b.trendStrength, 0) / allIndicators.length,
      avgVolumeRatio: allIndicators.reduce((a, b) => a + b.volumeRatio, 0) / allIndicators.length,
      goldRoc24h: 0, // Would need yfinance for this
      cryptoCount: allIndicators.length,
      stockCount: 0,
    };
  }

  /**
   * Calculate correlations between assets
   */
  calculateCorrelations(): CorrelationData {
    const btcData = this.data.get("BTCUSDT");
    if (!btcData || btcData.length < 24) {
      return {
        btcVsAlts: new Map(),
        btcVsStocks: new Map(),
        btcVsGold: 0,
        averageCorrelation: 0,
      };
    }

    const btcPrices = btcData.slice(-24).map(d => d.close);
    const btcVsAlts = new Map<string, number>();
    const correlations: number[] = [];

    for (const [symbol, ohlcv] of this.data) {
      if (symbol === "BTCUSDT") continue;

      const prices = ohlcv.slice(-24).map(d => d.close);
      if (prices.length === 24) {
        const corr = this.pearsonCorrelation(btcPrices, prices);
        btcVsAlts.set(symbol, corr);
        correlations.push(corr);
      }
    }

    return {
      btcVsAlts,
      btcVsStocks: new Map(),
      btcVsGold: 0,
      averageCorrelation: correlations.length > 0
        ? correlations.reduce((a, b) => a + b, 0) / correlations.length
        : 0,
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  /**
   * Generate market forecast
   */
  async generateForecast(config: MarketForecastConfig): Promise<MarketForecast> {
    // Load data if needed
    if (this.data.size === 0) {
      await this.loadData(config);
    }

    // Calculate indicators and correlations
    const indicators = this.aggregateIndicators();
    const correlations = this.calculateCorrelations();

    // Calculate probabilities
    let up = 1 / 3;
    let down = 1 / 3;
    let cons = 1 / 3;

    // Momentum factor (ROC)
    if (indicators.avgRoc24h > config.trendThreshold) {
      up += 0.20;
      down -= 0.10;
      cons -= 0.10;
    } else if (indicators.avgRoc24h < -config.trendThreshold) {
      down += 0.20;
      up -= 0.10;
      cons -= 0.10;
    }

    // Volatility factor
    if (indicators.avgAtrPercent < config.volatilityLow) {
      cons += 0.20;
      up -= 0.10;
      down -= 0.10;
    } else if (indicators.avgAtrPercent > config.volatilityHigh) {
      if (indicators.avgTrendStrength > 0) {
        up += 0.15;
      } else {
        down += 0.15;
      }
      cons -= 0.15;
    }

    // Volume surge factor
    if (indicators.avgVolumeRatio > 1.5) {
      if (indicators.avgTrendStrength > 0) {
        up += 0.10;
      } else {
        down += 0.10;
      }
      cons -= 0.10;
    }

    // Correlation factor
    const avgCorr = correlations.averageCorrelation;
    const corrAdjust = config.correlationWeight * Math.abs(avgCorr);

    if (Math.abs(avgCorr) < 0.5) {
      // Low correlation = more consolidation
      cons += corrAdjust;
      up -= corrAdjust / 2;
      down -= corrAdjust / 2;
    } else {
      // High correlation = follow trend
      if (indicators.goldRoc24h > 0 && avgCorr > 0) {
        up += corrAdjust / 2;
      } else if (indicators.goldRoc24h < 0 && avgCorr > 0) {
        down += corrAdjust / 2;
      }
    }

    // Normalize
    const total = up + down + cons;
    up /= total;
    down /= total;
    cons /= total;

    // Determine direction
    let direction: MarketDirection;
    if (up > down && up > cons) {
      direction = "UPWARD";
    } else if (down > up && down > cons) {
      direction = "DOWNWARD";
    } else {
      direction = "CONSOLIDATION";
    }

    // Calculate confidence
    const maxProb = Math.max(up, down, cons);
    const confidence = maxProb - 1/3; // How much better than random

    // Get risk profile
    const riskProfile = RISK_PROFILES[config.riskProfile];

    // Generate trading signal
    const tradingSignal = this.generateTradingSignal(
      direction,
      confidence,
      indicators,
      config,
      riskProfile
    );

    return {
      id: `forecast-${Date.now()}`,
      timestamp: new Date(),
      upwardProbability: Math.round(up * 10000) / 10000,
      downwardProbability: Math.round(down * 10000) / 10000,
      consolidationProbability: Math.round(cons * 10000) / 10000,
      direction,
      confidence: Math.round(confidence * 100) / 100,
      indicators,
      correlations,
      tradingSignal,
    };
  }

  /**
   * Generate trading signal from forecast
   */
  private generateTradingSignal(
    direction: MarketDirection,
    confidence: number,
    indicators: MarketIndicators,
    config: MarketForecastConfig,
    riskProfile: RiskProfile
  ): MarketForecast["tradingSignal"] {
    const strategy = config.strategy;
    let action: "BUY" | "SELL" | "HOLD" = "HOLD";
    let stopLossPercent = 0;
    let takeProfitPercent = 0;
    let reason = "";

    // Only trade if confidence is significant
    if (confidence < 0.1) {
      return {
        action: "HOLD",
        leverage: riskProfile.leverage,
        stopLossPercent: 0,
        takeProfitPercent: 0,
        reason: "Low confidence forecast",
      };
    }

    // Set SL/TP based on strategy
    switch (strategy) {
      case "basic":
        stopLossPercent = 0.02;  // 2%
        takeProfitPercent = 0.04; // 4%
        break;
      case "multi_tp":
        stopLossPercent = 0.02;
        takeProfitPercent = 0.06; // 6% (highest TP)
        break;
      case "trailing":
        stopLossPercent = 0.02;  // Initial, then trails
        takeProfitPercent = 0;   // No fixed TP
        break;
      case "reentry_24h":
        stopLossPercent = 0.03;  // 3%
        takeProfitPercent = 0;   // Exits at cycle end
        break;
    }

    switch (direction) {
      case "UPWARD":
        action = "BUY";
        reason = `Bullish forecast: ${(indicators.avgRoc24h * 100).toFixed(1)}% 24h ROC, trend strength ${indicators.avgTrendStrength.toFixed(3)}`;
        break;
      case "DOWNWARD":
        action = "SELL";
        reason = `Bearish forecast: ${(indicators.avgRoc24h * 100).toFixed(1)}% 24h ROC, trend strength ${indicators.avgTrendStrength.toFixed(3)}`;
        break;
      case "CONSOLIDATION":
        action = "HOLD";
        reason = `Market consolidating: low volatility (${(indicators.avgAtrPercent * 100).toFixed(2)}% ATR), wait for breakout`;
        break;
    }

    return {
      action,
      leverage: riskProfile.leverage,
      stopLossPercent,
      takeProfitPercent,
      reason,
    };
  }

  /**
   * Get current data for a symbol
   */
  getSymbolData(symbol: string): OHLCV[] | undefined {
    return this.data.get(symbol);
  }

  /**
   * Clear cached data
   */
  clearData(): void {
    this.data.clear();
    this.fetcher.clearCache();
  }
}

// ==================== MARKET FORECAST SERVICE ====================

export class MarketForecastService {
  private analyzer: MarketAnalyzer;
  private config: MarketForecastConfig;
  private lastForecast: MarketForecast | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<MarketForecastConfig>) {
    this.analyzer = new MarketAnalyzer();
    this.config = {
      enabled: true,
      cryptoSymbols: DEFAULT_CRYPTO_SYMBOLS,
      stockIndices: DEFAULT_STOCK_INDICES,
      goldSymbol: DEFAULT_GOLD_SYMBOL,
      timeframe: "1h",
      lookbackDays: 30,
      volatilityLow: 0.01,
      volatilityHigh: 0.05,
      trendThreshold: 0.02,
      correlationWeight: 0.30,
      riskProfile: "normal",
      leverage: 3,
      strategy: "basic",
      boostArgusSignals: true,
      forecastWeight: 0.3,
      requireConfirmation: false,
      ...config,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MarketForecastConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): MarketForecastConfig {
    return this.config;
  }

  /**
   * Run forecast analysis
   */
  async runForecast(): Promise<MarketForecast | null> {
    if (!this.config.enabled) {
      console.log("[MarketForecast] Service is disabled");
      return null;
    }

    try {
      console.log("[MarketForecast] Running forecast...");
      const forecast = await this.analyzer.generateForecast(this.config);
      this.lastForecast = forecast;

      console.log(`[MarketForecast] Forecast complete: ${forecast.direction} ` +
        `(Up: ${(forecast.upwardProbability * 100).toFixed(1)}%, ` +
        `Down: ${(forecast.downwardProbability * 100).toFixed(1)}%, ` +
        `Cons: ${(forecast.consolidationProbability * 100).toFixed(1)}%)`);

      return forecast;
    } catch (error) {
      console.error("[MarketForecast] Forecast error:", error);
      return null;
    }
  }

  /**
   * Start periodic forecasts
   */
  startPeriodicForecast(intervalMs: number = 60 * 60 * 1000): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Run initial forecast
    this.runForecast();

    // Schedule periodic updates
    this.updateInterval = setInterval(() => {
      this.runForecast();
    }, intervalMs);

    console.log(`[MarketForecast] Started periodic forecasts (every ${intervalMs / 60000} minutes)`);
  }

  /**
   * Stop periodic forecasts
   */
  stopPeriodicForecast(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    console.log("[MarketForecast] Stopped periodic forecasts");
  }

  /**
   * Get last forecast
   */
  getLastForecast(): MarketForecast | null {
    return this.lastForecast;
  }

  /**
   * Apply forecast boost to Argus signal
   * Returns modified confidence score
   */
  applyForecastBoost(
    signalDirection: "LONG" | "SHORT",
    originalConfidence: number
  ): number {
    if (!this.config.boostArgusSignals || !this.lastForecast) {
      return originalConfidence;
    }

    const forecast = this.lastForecast;
    let boost = 0;

    // Check if forecast aligns with signal
    if (signalDirection === "LONG") {
      if (forecast.direction === "UPWARD") {
        boost = forecast.confidence * this.config.forecastWeight;
      } else if (forecast.direction === "DOWNWARD") {
        boost = -forecast.confidence * this.config.forecastWeight * 0.5; // Penalty
      }
    } else {
      if (forecast.direction === "DOWNWARD") {
        boost = forecast.confidence * this.config.forecastWeight;
      } else if (forecast.direction === "UPWARD") {
        boost = -forecast.confidence * this.config.forecastWeight * 0.5;
      }
    }

    // Apply boost and clamp to 0-1
    const newConfidence = Math.max(0, Math.min(1, originalConfidence + boost));

    console.log(`[MarketForecast] Applied boost to ${signalDirection} signal: ` +
      `${originalConfidence.toFixed(2)} → ${newConfidence.toFixed(2)}`);

    return newConfidence;
  }

  /**
   * Check if signal should be filtered based on forecast
   */
  shouldFilterSignal(signalDirection: "LONG" | "SHORT"): boolean {
    if (!this.config.requireConfirmation || !this.lastForecast) {
      return false;
    }

    const forecast = this.lastForecast;

    // Filter if forecast strongly opposes signal
    if (signalDirection === "LONG" && forecast.direction === "DOWNWARD" && forecast.confidence > 0.2) {
      return true;
    }
    if (signalDirection === "SHORT" && forecast.direction === "UPWARD" && forecast.confidence > 0.2) {
      return true;
    }

    return false;
  }

  /**
   * Get risk profile settings
   */
  getRiskProfile(): RiskProfile {
    return RISK_PROFILES[this.config.riskProfile];
  }
}

// ==================== SINGLETON INSTANCE ====================

let serviceInstance: MarketForecastService | null = null;

export function getMarketForecastService(config?: Partial<MarketForecastConfig>): MarketForecastService {
  if (!serviceInstance) {
    serviceInstance = new MarketForecastService(config);
  } else if (config) {
    serviceInstance.updateConfig(config);
  }
  return serviceInstance;
}

// ==================== EXPORTS ====================

export {
  TechnicalIndicators,
  MarketAnalyzer,
  MarketDataFetcher,
  RISK_PROFILES,
  DEFAULT_CRYPTO_SYMBOLS,
  DEFAULT_STOCK_INDICES,
};
