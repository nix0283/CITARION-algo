/**
 * Market Forecast Service - Core Analytics Engine
 *
 * Based on market_analyzer_crypto by roman-boop
 * Implements technical analysis and probability forecasting
 *
 * Features:
 * - Technical indicators: RSI, MACD, Bollinger Bands, ATR
 * - Correlation analysis with BTC, ETH, S&P500, Gold
 * - Probability-based market direction forecasting
 */

import type {
  MarketData,
  OHLCV,
  AssetIndicators,
  AggregatedIndicators,
  Correlations,
  ForecastProbabilities,
  MarketForecast,
  ForecastSignal,
  VisionBotConfig,
} from './types';
import {
  FeatureEngineer,
  type CandlesInput,
  type FeatureSet,
  type CorrelationResult,
  marketDataToCandles,
  ohlcvToCandles,
} from './feature-engineer';

// --------------------------------------------------
// ENHANCED MARKET FORECAST INTERFACE
// --------------------------------------------------

export interface EnhancedMarketForecast {
  direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
  confidence: number;  // 0-1
  upwardProb: number;
  downwardProb: number;
  consolidationProb: number;
  predictedChange24h: number;  // %
  timestamp: Date;
  symbol: string;
  indicators: FeatureSet;
  correlations: Map<string, CorrelationResult>;
  signals: ForecastSignals;
}

export interface ForecastSignals {
  rsi: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  macd: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bollingerPosition: 'UPPER' | 'MIDDLE' | 'LOWER' | 'OUTSIDE';
  volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  overall: number;  // -1 to 1 (bearish to bullish)
}

// --------------------------------------------------
// TECHNICAL INDICATORS (Legacy - kept for backward compatibility)
// --------------------------------------------------

/**
 * Calculate 24-hour Rate of Change (ROC)
 */
export function calculateROC(data: MarketData[], lookback: number = 24): number {
  if (data.length < lookback + 1) {
    return 0;
  }

  const currentPrice = data[data.length - 1].close;
  const prevPrice = data[data.length - 1 - lookback].close;

  if (prevPrice === 0) return 0;

  return (currentPrice - prevPrice) / prevPrice;
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(data: MarketData[], period: number = 14): number {
  if (data.length < period + 1) {
    return 0;
  }

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

  // Simple moving average of last 'period' true ranges
  const recentTRs = trueRanges.slice(-period);
  if (recentTRs.length === 0) return 0;

  return recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;
}

/**
 * Calculate ATR as percentage of price
 */
export function calculateATRPercent(data: MarketData[], period: number = 14): number {
  if (data.length === 0) return 0;

  const atr = calculateATR(data, period);
  const currentPrice = data[data.length - 1].close;

  if (currentPrice === 0) return 0;

  return atr / currentPrice;
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
export function calculateEMA(prices: number[], span: number): number[] {
  if (prices.length === 0) return [];

  const multiplier = 2 / (span + 1);
  const ema: number[] = [prices[0]];

  for (let i = 1; i < prices.length; i++) {
    const value = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
    ema.push(value);
  }

  return ema;
}

/**
 * Calculate Trend Strength (EMA12 vs EMA26)
 */
export function calculateTrendStrength(data: MarketData[]): number {
  if (data.length < 26) return 0;

  const closes = data.map(d => d.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const lastEMA12 = ema12[ema12.length - 1];
  const lastEMA26 = ema26[ema26.length - 1];

  if (lastEMA26 === 0) return 0;

  return (lastEMA12 - lastEMA26) / lastEMA26;
}

/**
 * Calculate Volume Ratio (current vs 24h MA)
 */
export function calculateVolumeRatio(data: MarketData[], lookback: number = 24): number {
  if (data.length < lookback) return 1;

  const volumes = data.slice(-lookback).map(d => d.volume);
  const currentVolume = volumes[volumes.length - 1];

  const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;

  if (avgVolume === 0) return 1;

  return currentVolume / avgVolume;
}

/**
 * Calculate all indicators for a single asset
 */
export function calculateAssetIndicators(data: MarketData[]): AssetIndicators {
  return {
    roc_24h: calculateROC(data, 24),
    atr_pct: calculateATRPercent(data, 14),
    trend_strength: calculateTrendStrength(data),
    volume_ratio: calculateVolumeRatio(data, 24),
  };
}

// --------------------------------------------------
// CORRELATION CALCULATIONS
// --------------------------------------------------

/**
 * Calculate Pearson correlation coefficient
 */
export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

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
 * Calculate correlations between BTC and other assets
 */
export function calculateCorrelations(
  btcData: MarketData[],
  otherAssets: Map<string, MarketData[]>,
  lookback: number = 24
): Correlations {
  const correlations: Correlations = { avg_corr: 0 };

  if (!btcData || btcData.length < lookback) {
    return correlations;
  }

  const btcCloses = btcData.slice(-lookback).map(d => d.close);
  const correlationValues: number[] = [];

  for (const [symbol, data] of otherAssets) {
    if (data && data.length >= lookback) {
      const assetCloses = data.slice(-lookback).map(d => d.close);

      if (assetCloses.length === btcCloses.length) {
        const corr = calculatePearsonCorrelation(btcCloses, assetCloses);
        correlations[`${symbol}_vs_BTC`] = corr;
        correlationValues.push(corr);
      }
    }
  }

  if (correlationValues.length > 0) {
    correlations.avg_corr = correlationValues.reduce((a, b) => a + b, 0) / correlationValues.length;
  }

  return correlations;
}

// --------------------------------------------------
// PROBABILITY FORECAST MODEL
// --------------------------------------------------

/**
 * Generate probability forecast based on indicators and correlations
 *
 * This is the core prediction model from the original Python script
 */
export function generateForecast(
  indicators: AggregatedIndicators,
  correlations: Correlations,
  config: Partial<VisionBotConfig> = {}
): ForecastProbabilities {
  // Default thresholds
  const trendThreshold = config.trendThreshold ?? 0.02;
  const volLow = config.volatilityLow ?? 0.01;
  const volHigh = config.volatilityHigh ?? 0.05;
  const corrWeight = config.correlationWeight ?? 0.30;

  // Start with equal probabilities
  let up = 1/3;
  let down = 1/3;
  let cons = 1/3;

  // ----- Momentum factor -----
  const roc = indicators.roc_24h;
  if (roc > trendThreshold) {
    up += 0.20;
    down -= 0.10;
    cons -= 0.10;
  } else if (roc < -trendThreshold) {
    down += 0.20;
    up -= 0.10;
    cons -= 0.10;
  }

  // ----- Volatility factor -----
  const vol = indicators.atr_pct;
  if (vol < volLow) {
    // Low volatility -> more consolidation
    cons += 0.20;
    up -= 0.10;
    down -= 0.10;
  } else if (vol > volHigh) {
    // High volatility -> follow trend
    if (indicators.trend_strength > 0) {
      up += 0.15;
    } else {
      down += 0.15;
    }
    cons -= 0.15;
  }

  // ----- Volume surge factor -----
  const volRatio = indicators.volume_ratio;
  if (volRatio > 1.5) {
    if (indicators.trend_strength > 0) {
      up += 0.10;
    } else {
      down += 0.10;
    }
    cons -= 0.10;
  }

  // ----- Cross-asset correlation factor -----
  const avgCorr = correlations.avg_corr;
  const corrAdj = corrWeight * Math.abs(avgCorr);

  if (Math.abs(avgCorr) < 0.5) {
    // Low correlation -> more consolidation
    cons += corrAdj;
    up -= corrAdj / 2;
    down -= corrAdj / 2;
  } else {
    // High correlation -> follow gold/stocks direction
    const goldRoc = indicators.gold_roc;
    if (goldRoc > 0 && avgCorr > 0) {
      up += corrAdj / 2;
    } else if (goldRoc < 0 && avgCorr > 0) {
      down += corrAdj / 2;
    }
  }

  // ----- Normalize -----
  const total = up + down + cons;
  if (total > 0) {
    up /= total;
    down /= total;
    cons /= total;
  }

  return {
    upward: Math.round(up * 10000) / 10000,
    downward: Math.round(down * 10000) / 10000,
    consolidation: Math.round(cons * 10000) / 10000,
  };
}

/**
 * Determine signal from probabilities
 */
export function getSignalFromProbabilities(probs: ForecastProbabilities): ForecastSignal {
  if (probs.upward > 0.5) return 'LONG';
  if (probs.downward > 0.5) return 'SHORT';
  return 'NEUTRAL';
}

/**
 * Calculate signal confidence
 */
export function calculateConfidence(probs: ForecastProbabilities): number {
  // Confidence is based on how far from equal distribution
  const maxProb = Math.max(probs.upward, probs.downward, probs.consolidation);
  const minProb = Math.min(probs.upward, probs.downward, probs.consolidation);

  // Higher spread = higher confidence
  return Math.round((maxProb - minProb) * 100) / 100;
}

// --------------------------------------------------
// FORECAST SERVICE CLASS
// --------------------------------------------------

export interface ForecastServiceConfig {
  correlationAssets: string[];  // e.g., ['BTC', 'ETH', 'SP500', 'GOLD']
  defaultLookback: number;
  volatilityThresholds: {
    low: number;
    high: number;
    extreme: number;
  };
}

const DEFAULT_FORECAST_CONFIG: ForecastServiceConfig = {
  correlationAssets: ['BTC', 'ETH', 'SP500', 'GOLD'],
  defaultLookback: 24,
  volatilityThresholds: {
    low: 0.01,
    high: 0.03,
    extreme: 0.05,
  },
};

export class ForecastService {
  private config: ForecastServiceConfig;
  private marketData: Map<string, CandlesInput[]> = new Map();
  private featureCache: Map<string, FeatureSet> = new Map();

  constructor(config: Partial<ForecastServiceConfig> = {}) {
    this.config = { ...DEFAULT_FORECAST_CONFIG, ...config };
  }

  /**
   * Load historical OHLCV data for an asset
   */
  loadHistoricalData(symbol: string, candles: CandlesInput[]): void {
    this.marketData.set(symbol, candles);
    // Invalidate cache for this symbol
    this.featureCache.delete(symbol);
  }

  /**
   * Load historical data from MarketData array
   */
  loadMarketData(symbol: string, data: MarketData[]): void {
    const candles = marketDataToCandles(data);
    this.loadHistoricalData(symbol, candles);
  }

  /**
   * Load historical data from OHLCV array
   */
  loadOHLCVData(symbol: string, data: OHLCV[]): void {
    const candles = ohlcvToCandles(data);
    this.loadHistoricalData(symbol, candles);
  }

  /**
   * Get technical indicators for an asset
   */
  getIndicators(symbol: string): FeatureSet | null {
    // Check cache first
    const cached = this.featureCache.get(symbol);
    if (cached) return cached;

    const candles = this.marketData.get(symbol);
    if (!candles || candles.length === 0) return null;

    const features = FeatureEngineer.calculateAllFeatures(candles);
    this.featureCache.set(symbol, features);

    return features;
  }

  /**
   * Calculate correlations with reference assets
   */
  calculateCorrelations(
    symbol: string,
    referenceAssets: string[] = this.config.correlationAssets,
    lookback: number = this.config.defaultLookback
  ): Map<string, CorrelationResult> {
    const correlations = new Map<string, CorrelationResult>();
    const targetData = this.marketData.get(symbol);

    if (!targetData) return correlations;

    for (const refAsset of referenceAssets) {
      if (refAsset === symbol) continue;

      const refData = this.marketData.get(refAsset);
      if (refData) {
        const result = FeatureEngineer.calculateCorrelation(targetData, refData, lookback);
        correlations.set(refAsset, result);
      }
    }

    return correlations;
  }

  /**
   * Generate forecast signals from indicators
   */
  generateSignals(features: FeatureSet): ForecastSignals {
    // RSI signal
    let rsiSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
    if (features.rsi.overbought) {
      rsiSignal = 'OVERBOUGHT';
    } else if (features.rsi.oversold) {
      rsiSignal = 'OVERSOLD';
    }

    // MACD signal
    let macdSignal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (features.macd.crossover === 'BULLISH_CROSSOVER') {
      macdSignal = 'BULLISH';
    } else if (features.macd.crossover === 'BEARISH_CROSSOVER') {
      macdSignal = 'BEARISH';
    } else if (features.macd.trend === 'BULLISH') {
      macdSignal = 'BULLISH';
    } else if (features.macd.trend === 'BEARISH') {
      macdSignal = 'BEARISH';
    }

    // Bollinger position
    let bbPosition: 'UPPER' | 'MIDDLE' | 'LOWER' | 'OUTSIDE' = 'MIDDLE';
    if (features.bollingerBands.percentB > 1) {
      bbPosition = 'OUTSIDE';
    } else if (features.bollingerBands.percentB > 0.7) {
      bbPosition = 'UPPER';
    } else if (features.bollingerBands.percentB < 0) {
      bbPosition = 'OUTSIDE';
    } else if (features.bollingerBands.percentB < 0.3) {
      bbPosition = 'LOWER';
    }

    // Overall signal (-1 to 1)
    let overall = 0;

    // RSI contribution
    if (features.rsi.value < 30) overall += 0.2;      // Oversold = bullish
    else if (features.rsi.value > 70) overall -= 0.2; // Overbought = bearish

    // MACD contribution
    if (features.macd.histogram > 0) overall += 0.3;
    else overall -= 0.3;

    // Bollinger contribution
    if (features.bollingerBands.percentB < 0.2) overall += 0.15;
    else if (features.bollingerBands.percentB > 0.8) overall -= 0.15;

    // Squeeze = potential breakout
    if (features.bollingerBands.squeeze) overall *= 0.5; // Reduce confidence

    return {
      rsi: rsiSignal,
      macd: macdSignal,
      bollingerPosition: bbPosition,
      volatility: features.atr.volatility,
      overall: Math.max(-1, Math.min(1, overall)),
    };
  }

  /**
   * Generate enhanced market forecast
   */
  generateEnhancedForecast(symbol: string): EnhancedMarketForecast | null {
    const candles = this.marketData.get(symbol);
    if (!candles || candles.length < 50) {
      return null;
    }

    // Get technical indicators
    const indicators = this.getIndicators(symbol);
    if (!indicators) return null;

    // Get correlations
    const correlations = this.calculateCorrelations(symbol);

    // Generate signals
    const signals = this.generateSignals(indicators);

    // Calculate probabilities using multiple factors
    let upProb = 0.33;
    let downProb = 0.33;
    let consProb = 0.33;

    // Factor 1: Technical indicators
    const technicalScore = signals.overall;
    upProb += technicalScore * 0.25;
    downProb -= technicalScore * 0.25;

    // Factor 2: RSI extremes
    if (indicators.rsi.oversold) {
      upProb += 0.15;
      consProb -= 0.075;
      downProb -= 0.075;
    } else if (indicators.rsi.overbought) {
      downProb += 0.15;
      consProb -= 0.075;
      upProb -= 0.075;
    }

    // Factor 3: MACD
    if (indicators.macd.crossover === 'BULLISH_CROSSOVER') {
      upProb += 0.1;
      consProb -= 0.05;
    } else if (indicators.macd.crossover === 'BEARISH_CROSSOVER') {
      downProb += 0.1;
      consProb -= 0.05;
    }

    // Factor 4: Volatility
    if (indicators.atr.volatility === 'LOW') {
      consProb += 0.15;
      upProb -= 0.075;
      downProb -= 0.075;
    } else if (indicators.atr.volatility === 'EXTREME') {
      consProb -= 0.1;
    }

    // Factor 5: Correlations
    const btcCorr = correlations.get('BTC') || correlations.get('BTC/USDT');
    const ethCorr = correlations.get('ETH') || correlations.get('ETH/USDT');

    if (btcCorr && btcCorr.strength === 'STRONG') {
      // High BTC correlation, check BTC trend
      const btcIndicators = this.getIndicators('BTC') || this.getIndicators('BTC/USDT');
      if (btcIndicators && btcIndicators.macd.histogram > 0) {
        upProb += 0.05 * Math.abs(btcCorr.value);
      } else if (btcIndicators && btcIndicators.macd.histogram < 0) {
        downProb += 0.05 * Math.abs(btcCorr.value);
      }
    }

    if (ethCorr && ethCorr.strength === 'STRONG') {
      const ethIndicators = this.getIndicators('ETH') || this.getIndicators('ETH/USDT');
      if (ethIndicators && ethIndicators.macd.histogram > 0) {
        upProb += 0.03 * Math.abs(ethCorr.value);
      } else if (ethIndicators && ethIndicators.macd.histogram < 0) {
        downProb += 0.03 * Math.abs(ethCorr.value);
      }
    }

    // Normalize probabilities
    const total = upProb + downProb + consProb;
    upProb = Math.max(0, Math.min(1, upProb / total));
    downProb = Math.max(0, Math.min(1, downProb / total));
    consProb = Math.max(0, Math.min(1, consProb / total));

    // Determine direction
    let direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
    if (upProb > 0.45) {
      direction = 'UPWARD';
    } else if (downProb > 0.45) {
      direction = 'DOWNWARD';
    } else {
      direction = 'CONSOLIDATION';
    }

    // Calculate confidence
    const maxProb = Math.max(upProb, downProb, consProb);
    const minProb = Math.min(upProb, downProb, consProb);
    const confidence = maxProb - minProb;

    // Predict 24h change based on ATR and direction
    const atrPercent = indicators.atr.percent;
    const predictedChange = direction === 'UPWARD'
      ? atrPercent * 0.5 * confidence
      : direction === 'DOWNWARD'
        ? -atrPercent * 0.5 * confidence
        : 0;

    return {
      direction,
      confidence: Math.round(confidence * 100) / 100,
      upwardProb: Math.round(upProb * 10000) / 10000,
      downwardProb: Math.round(downProb * 10000) / 10000,
      consolidationProb: Math.round(consProb * 10000) / 10000,
      predictedChange24h: Math.round(predictedChange * 10000) / 100,
      timestamp: new Date(),
      symbol,
      indicators,
      correlations,
      signals,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.marketData.clear();
    this.featureCache.clear();
  }

  /**
   * Get loaded symbols
   */
  getLoadedSymbols(): string[] {
    return Array.from(this.marketData.keys());
  }
}

// --------------------------------------------------
// MARKET ANALYZER CLASS (Legacy - kept for backward compatibility)
// --------------------------------------------------

export class MarketAnalyzer {
  private data: Map<string, MarketData[]> = new Map();
  private config: Partial<VisionBotConfig>;

  constructor(config: Partial<VisionBotConfig> = {}) {
    this.config = config;
  }

  /**
   * Add market data for a symbol
   */
  addData(symbol: string, data: MarketData[]): void {
    this.data.set(symbol, data);
  }

  /**
   * Get aggregated indicators across all assets
   */
  getAggregatedIndicators(): AggregatedIndicators {
    const allIndicators: AssetIndicators[] = [];

    for (const [symbol, data] of this.data) {
      if (data && data.length > 0) {
        const indicators = calculateAssetIndicators(data);
        allIndicators.push(indicators);
      }
    }

    if (allIndicators.length === 0) {
      return {
        roc_24h: 0,
        atr_pct: 0,
        trend_strength: 0,
        volume_ratio: 1,
        crypto_cnt: 0,
        stock_cnt: 0,
        gold_roc: 0,
      };
    }

    // Average the indicators
    const agg: AggregatedIndicators = {
      roc_24h: allIndicators.reduce((sum, i) => sum + i.roc_24h, 0) / allIndicators.length,
      atr_pct: allIndicators.reduce((sum, i) => sum + i.atr_pct, 0) / allIndicators.length,
      trend_strength: allIndicators.reduce((sum, i) => sum + i.trend_strength, 0) / allIndicators.length,
      volume_ratio: allIndicators.reduce((sum, i) => sum + i.volume_ratio, 0) / allIndicators.length,
      crypto_cnt: 0,
      stock_cnt: 0,
      gold_roc: 0,
    };

    // Count crypto vs stock
    for (const [symbol] of this.data) {
      if (symbol.includes('/')) {
        agg.crypto_cnt++;
      } else if (symbol.startsWith('^')) {
        agg.stock_cnt++;
      }
    }

    // Get gold ROC separately
    const goldData = this.data.get('GOLD');
    if (goldData && goldData.length > 24) {
      agg.gold_roc = calculateROC(goldData, 24);
    }

    return agg;
  }

  /**
   * Get correlations with BTC
   */
  getCorrelations(): Correlations {
    const btcData = this.data.get('BTC/USDT');
    if (!btcData) {
      return { avg_corr: 0 };
    }

    // Create map of other assets (excluding BTC)
    const otherAssets = new Map<string, MarketData[]>();
    for (const [symbol, data] of this.data) {
      if (symbol !== 'BTC/USDT') {
        otherAssets.set(symbol, data);
      }
    }

    return calculateCorrelations(btcData, otherAssets, 24);
  }

  /**
   * Generate full market forecast
   */
  generateForecast(symbol: string = 'BTC/USDT'): MarketForecast {
    const indicators = this.getAggregatedIndicators();
    const correlations = this.getCorrelations();
    const probabilities = generateForecast(indicators, correlations, this.config);
    const signal = getSignalFromProbabilities(probabilities);
    const confidence = calculateConfidence(probabilities);

    return {
      timestamp: new Date(),
      symbol,
      probabilities,
      indicators,
      correlations,
      signal,
      confidence,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.clear();
  }
}

// --------------------------------------------------
// UTILITY FUNCTIONS
// --------------------------------------------------

/**
 * Convert OHLCV array to MarketData array
 */
export function ohlcvToMarketData(ohlcv: number[][], symbol: string): MarketData[] {
  return ohlcv.map(candle => ({
    symbol,
    timestamp: new Date(candle[0]),
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
    volume: candle[5],
  }));
}

/**
 * Generate synthetic market data (for testing/backtesting)
 */
export function generateSyntheticData(
  days: number,
  basePrice: number = 1000,
  volatility: number = 0.02
): MarketData[] {
  const data: MarketData[] = [];
  const hours = days * 24;
  let price = basePrice;

  const now = new Date();

  for (let i = hours; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);

    // Random walk with volatility
    const change = (Math.random() - 0.5) * 2 * volatility * price;
    price = Math.max(price + change, 1);

    const high = price * (1 + Math.random() * volatility * 0.5);
    const low = price * (1 - Math.random() * volatility * 0.5);
    const open = low + Math.random() * (high - low);
    const close = low + Math.random() * (high - low);
    const volume = 1000 + Math.random() * 9000;

    data.push({
      symbol: 'SYNTHETIC',
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return data;
}

/**
 * Format forecast for display
 */
export function formatForecast(forecast: MarketForecast): string {
  const { probabilities, signal, confidence } = forecast;

  const emoji = signal === 'LONG' ? '📈' : signal === 'SHORT' ? '📉' : '➡️';

  return [
    `${emoji} **${signal}** (Confidence: ${(confidence * 100).toFixed(0)}%)`,
    '',
    '**Probabilities:**',
    `  🟢 Upward: ${(probabilities.upward * 100).toFixed(1)}%`,
    `  🔴 Downward: ${(probabilities.downward * 100).toFixed(1)}%`,
    `  🟡 Consolidation: ${(probabilities.consolidation * 100).toFixed(1)}%`,
    '',
    '**Market Indicators:**',
    `  ROC 24h: ${(forecast.indicators.roc_24h * 100).toFixed(2)}%`,
    `  ATR%: ${(forecast.indicators.atr_pct * 100).toFixed(2)}%`,
    `  Trend: ${(forecast.indicators.trend_strength * 100).toFixed(2)}%`,
    `  Volume Ratio: ${forecast.indicators.volume_ratio.toFixed(2)}x`,
    '',
    `**Correlation Strength:** ${(forecast.correlations.avg_corr * 100).toFixed(1)}%`,
  ].join('\n');
}

/**
 * Format enhanced forecast for display
 */
export function formatEnhancedForecast(forecast: EnhancedMarketForecast): string {
  const directionEmoji = forecast.direction === 'UPWARD' ? '📈' : forecast.direction === 'DOWNWARD' ? '📉' : '➡️';

  const lines = [
    `${directionEmoji} **${forecast.direction}** (Confidence: ${(forecast.confidence * 100).toFixed(0)}%)`,
    '',
    '**Probabilities:**',
    `  🟢 Upward: ${(forecast.upwardProb * 100).toFixed(1)}%`,
    `  🔴 Downward: ${(forecast.downwardProb * 100).toFixed(1)}%`,
    `  🟡 Consolidation: ${(forecast.consolidationProb * 100).toFixed(1)}%`,
    '',
    `**Predicted 24h Change:** ${forecast.predictedChange24h >= 0 ? '+' : ''}${forecast.predictedChange24h.toFixed(2)}%`,
    '',
    '**Technical Indicators:**',
    `  RSI: ${forecast.indicators.rsi.value.toFixed(1)} ${forecast.indicators.rsi.overbought ? '(Overbought)' : forecast.indicators.rsi.oversold ? '(Oversold)' : ''}`,
    `  MACD: ${forecast.indicators.macd.trend} ${forecast.indicators.macd.crossover !== 'NONE' ? `(${forecast.indicators.macd.crossover})` : ''}`,
    `  BB Position: ${forecast.signals.bollingerPosition}`,
    `  Volatility: ${forecast.indicators.atr.volatility}`,
  ];

  // Add correlations if available
  if (forecast.correlations.size > 0) {
    lines.push('', '**Correlations:**');
    for (const [asset, corr] of forecast.correlations) {
      const sign = corr.value >= 0 ? '+' : '';
      lines.push(`  ${asset}: ${sign}${(corr.value * 100).toFixed(1)}% (${corr.strength})`);
    }
  }

  return lines.join('\n');
}

// Export default
export default ForecastService;
