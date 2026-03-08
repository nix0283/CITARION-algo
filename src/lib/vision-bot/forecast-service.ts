/**
 * Market Forecast Service - Production Analytics Engine
 *
 * Enhanced version with:
 * - 24-hour price forecast with confidence intervals
 * - ML Service integration for ensemble predictions
 * - Technical indicators: RSI, MACD, Bollinger Bands, ATR, ADX
 * - Correlation analysis with BTC, ETH, S&P500, Gold
 * - Market regime detection integration
 * - Feature importance tracking for explainable predictions
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
import { getMLServiceClient, extractFeatures, featuresToArray, prepareSequenceData, type MarketFeatures } from './ml-service-client';

// --------------------------------------------------
// ENHANCED MARKET FORECAST INTERFACE
// --------------------------------------------------

export interface PriceForecast24h {
  currentPrice: number;
  predictedPrice: number;
  predictedChange: number;      // Percentage
  confidenceInterval: {
    lower: number;              // 95% confidence lower bound
    upper: number;              // 95% confidence upper bound
    stdDev: number;
  };
  direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
  directionConfidence: number;  // 0-1
  timestamp: Date;
  horizon: '24h';
  
  // Component predictions
  technicalForecast: {
    predictedChange: number;
    weight: number;
    signals: string[];
  };
  mlForecast?: {
    predictedChange: number;
    confidence: number;
    weight: number;
  };
  regimeForecast?: {
    regime: 'BULL' | 'BEAR' | 'SIDEWAYS';
    confidence: number;
    expectedDrift: number;
  };
  
  // Risk metrics
  volatility24h: number;
  expectedRange: { low: number; high: number };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

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
  priceForecast?: PriceForecast24h;
  // ML Enhancement fields
  mlAvailable?: boolean;
  mlConfidence?: number;
  regime?: 'BULL' | 'BEAR' | 'SIDEWAYS';
  regimeConfidence?: number;
}

export interface ForecastSignals {
  rsi: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  macd: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bollingerPosition: 'UPPER' | 'MIDDLE' | 'LOWER' | 'OUTSIDE';
  volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  overall: number;  // -1 to 1 (bearish to bullish)
  trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  momentum: 'ACCELERATING' | 'DECELERATING' | 'STABLE';
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
 */
export function generateForecast(
  indicators: AggregatedIndicators,
  correlations: Correlations,
  config: Partial<VisionBotConfig> = {}
): ForecastProbabilities {
  const trendThreshold = config.trendThreshold ?? 0.02;
  const volLow = config.volatilityLow ?? 0.01;
  const volHigh = config.volatilityHigh ?? 0.05;
  const corrWeight = config.correlationWeight ?? 0.30;

  // Start with equal probabilities
  let up = 1/3;
  let down = 1/3;
  let cons = 1/3;

  // Momentum factor
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

  // Volatility factor
  const vol = indicators.atr_pct;
  if (vol < volLow) {
    cons += 0.20;
    up -= 0.10;
    down -= 0.10;
  } else if (vol > volHigh) {
    if (indicators.trend_strength > 0) {
      up += 0.15;
    } else {
      down += 0.15;
    }
    cons -= 0.15;
  }

  // Volume surge factor
  const volRatio = indicators.volume_ratio;
  if (volRatio > 1.5) {
    if (indicators.trend_strength > 0) {
      up += 0.10;
    } else {
      down += 0.10;
    }
    cons -= 0.10;
  }

  // Cross-asset correlation factor
  const avgCorr = correlations.avg_corr;
  const corrAdj = corrWeight * Math.abs(avgCorr);

  if (Math.abs(avgCorr) < 0.5) {
    cons += corrAdj;
    up -= corrAdj / 2;
    down -= corrAdj / 2;
  } else {
    const goldRoc = indicators.gold_roc;
    if (goldRoc > 0 && avgCorr > 0) {
      up += corrAdj / 2;
    } else if (goldRoc < 0 && avgCorr > 0) {
      down += corrAdj / 2;
    }
  }

  // Normalize
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
  const maxProb = Math.max(probs.upward, probs.downward, probs.consolidation);
  const minProb = Math.min(probs.upward, probs.downward, probs.consolidation);
  return Math.round((maxProb - minProb) * 100) / 100;
}

// --------------------------------------------------
// 24H PRICE FORECAST ENGINE
// --------------------------------------------------

/**
 * Calculate 24h price forecast with confidence intervals
 */
export function calculate24hPriceForecast(
  data: MarketData[],
  features: FeatureSet,
  mlPrediction?: { change: number; confidence: number }
): PriceForecast24h {
  const currentPrice = data[data.length - 1]?.close || 0;
  const atr = features.atr.value;
  const atrPercent = features.atr.percent;
  
  // Technical analysis based prediction
  let technicalChange = 0;
  const signals: string[] = [];
  
  // RSI contribution
  if (features.rsi.oversold) {
    technicalChange += atrPercent * 0.5;
    signals.push('RSI oversold - bullish');
  } else if (features.rsi.overbought) {
    technicalChange -= atrPercent * 0.5;
    signals.push('RSI overbought - bearish');
  }
  
  // MACD contribution
  if (features.macd.histogram > 0) {
    technicalChange += atrPercent * 0.3;
    signals.push('MACD bullish');
  } else if (features.macd.histogram < 0) {
    technicalChange -= atrPercent * 0.3;
    signals.push('MACD bearish');
  }
  
  // Bollinger Bands contribution
  if (features.bollingerBands.percentB < 0.2) {
    technicalChange += atrPercent * 0.2;
    signals.push('Near lower BB - potential bounce');
  } else if (features.bollingerBands.percentB > 0.8) {
    technicalChange -= atrPercent * 0.2;
    signals.push('Near upper BB - potential pullback');
  }
  
  // Trend contribution
  if (features.macd.trend === 'BULLISH') {
    technicalChange += atrPercent * 0.2;
    signals.push('Uptrend');
  } else if (features.macd.trend === 'BEARISH') {
    technicalChange -= atrPercent * 0.2;
    signals.push('Downtrend');
  }
  
  // Combine with ML prediction if available
  let predictedChange: number;
  let mlWeight = 0;
  let technicalWeight = 1;
  
  if (mlPrediction && mlPrediction.confidence > 0.5) {
    mlWeight = 0.4 * mlPrediction.confidence;
    technicalWeight = 1 - mlWeight;
    predictedChange = technicalChange * technicalWeight + mlPrediction.change * mlWeight;
  } else {
    predictedChange = technicalChange;
  }
  
  // Calculate confidence interval (based on volatility)
  const volatility24h = atrPercent;
  const stdDev = Math.abs(predictedChange) * 0.5 + volatility24h;
  
  // 95% confidence interval (1.96 standard deviations)
  const ciMultiplier = 1.96;
  const lowerBound = predictedChange - stdDev * ciMultiplier;
  const upperBound = predictedChange + stdDev * ciMultiplier;
  
  // Determine direction
  let direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
  let directionConfidence: number;
  
  if (predictedChange > volatility24h * 0.3) {
    direction = 'UPWARD';
    directionConfidence = Math.min(0.95, 0.5 + Math.abs(predictedChange) / volatility24h);
  } else if (predictedChange < -volatility24h * 0.3) {
    direction = 'DOWNWARD';
    directionConfidence = Math.min(0.95, 0.5 + Math.abs(predictedChange) / volatility24h);
  } else {
    direction = 'CONSOLIDATION';
    directionConfidence = 0.5;
  }
  
  // Risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  if (volatility24h < 0.02) riskLevel = 'LOW';
  else if (volatility24h < 0.04) riskLevel = 'MEDIUM';
  else if (volatility24h < 0.06) riskLevel = 'HIGH';
  else riskLevel = 'EXTREME';
  
  return {
    currentPrice,
    predictedPrice: currentPrice * (1 + predictedChange),
    predictedChange: predictedChange * 100, // Convert to percentage
    confidenceInterval: {
      lower: currentPrice * (1 + lowerBound),
      upper: currentPrice * (1 + upperBound),
      stdDev: stdDev * 100,
    },
    direction,
    directionConfidence,
    timestamp: new Date(),
    horizon: '24h',
    technicalForecast: {
      predictedChange: technicalChange * 100,
      weight: technicalWeight,
      signals,
    },
    mlForecast: mlPrediction ? {
      predictedChange: mlPrediction.change * 100,
      confidence: mlPrediction.confidence,
      weight: mlWeight,
    } : undefined,
    volatility24h: volatility24h * 100,
    expectedRange: {
      low: currentPrice * (1 - volatility24h),
      high: currentPrice * (1 + volatility24h),
    },
    riskLevel,
  };
}

// --------------------------------------------------
// FORECAST SERVICE CLASS
// --------------------------------------------------

export interface ForecastServiceConfig {
  correlationAssets: string[];
  defaultLookback: number;
  volatilityThresholds: {
    low: number;
    high: number;
    extreme: number;
  };
  useMLService: boolean;
  mlWeight: number;
  fallbackToTechnical: boolean;
}

const DEFAULT_FORECAST_CONFIG: ForecastServiceConfig = {
  correlationAssets: ['BTC', 'ETH', 'SP500', 'GOLD'],
  defaultLookback: 24,
  volatilityThresholds: {
    low: 0.01,
    high: 0.03,
    extreme: 0.05,
  },
  useMLService: true,
  mlWeight: 0.5,
  fallbackToTechnical: true,
};

export class ForecastService {
  private config: ForecastServiceConfig;
  private marketData: Map<string, CandlesInput[]> = new Map();
  private featureCache: Map<string, FeatureSet> = new Map();
  private mlClient = getMLServiceClient();

  constructor(config: Partial<ForecastServiceConfig> = {}) {
    this.config = { ...DEFAULT_FORECAST_CONFIG, ...config };
  }

  /**
   * Load historical OHLCV data for an asset
   */
  loadHistoricalData(symbol: string, candles: CandlesInput[]): void {
    this.marketData.set(symbol, candles);
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

    if (features.rsi.value < 30) overall += 0.2;
    else if (features.rsi.value > 70) overall -= 0.2;

    if (features.macd.histogram > 0) overall += 0.3;
    else overall -= 0.3;

    if (features.bollingerBands.percentB < 0.2) overall += 0.15;
    else if (features.bollingerBands.percentB > 0.8) overall -= 0.15;

    if (features.bollingerBands.squeeze) overall *= 0.5;

    // Trend detection
    let trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS';
    if (features.macd.trend === 'BULLISH' && features.macd.histogram > 0) {
      trend = 'UPTREND';
    } else if (features.macd.trend === 'BEARISH' && features.macd.histogram < 0) {
      trend = 'DOWNTREND';
    }

    // Momentum detection
    let momentum: 'ACCELERATING' | 'DECELERATING' | 'STABLE' = 'STABLE';
    if (Math.abs(features.macd.histogram) > Math.abs(features.macd.signal) * 0.1) {
      momentum = features.macd.histogram > 0 ? 'ACCELERATING' : 'DECELERATING';
    }

    return {
      rsi: rsiSignal,
      macd: macdSignal,
      bollingerPosition: bbPosition,
      volatility: features.atr.volatility,
      overall: Math.max(-1, Math.min(1, overall)),
      trend,
      momentum,
    };
  }

  /**
   * Generate enhanced market forecast with 24h price prediction
   */
  async generateEnhancedForecastWithML(symbol: string): Promise<EnhancedMarketForecast | null> {
    const candles = this.marketData.get(symbol);
    if (!candles || candles.length < 50) {
      return null;
    }

    const marketData = this.candlesToMarketData(candles, symbol);
    const indicators = this.getIndicators(symbol);
    if (!indicators) return null;

    const correlations = this.calculateCorrelations(symbol);
    const signals = this.generateSignals(indicators);
    const marketFeatures = extractFeatures(marketData);

    // Initialize forecast
    let upProb = 0.33;
    let downProb = 0.33;
    let consProb = 0.33;
    let mlChange = 0;
    let mlConfidence = 0;
    let regimeConfidence = 0;
    let regime: 'BULL' | 'BEAR' | 'SIDEWAYS' = 'SIDEWAYS';
    let mlAvailable = false;

    // Technical analysis weights
    const technicalScore = signals.overall;
    upProb += technicalScore * 0.25;
    downProb -= technicalScore * 0.25;

    // RSI extremes
    if (indicators.rsi.oversold) {
      upProb += 0.15;
      consProb -= 0.075;
      downProb -= 0.075;
    } else if (indicators.rsi.overbought) {
      downProb += 0.15;
      consProb -= 0.075;
      upProb -= 0.075;
    }

    // MACD
    if (indicators.macd.crossover === 'BULLISH_CROSSOVER') {
      upProb += 0.1;
      consProb -= 0.05;
    } else if (indicators.macd.crossover === 'BEARISH_CROSSOVER') {
      downProb += 0.1;
      consProb -= 0.05;
    }

    // Volatility
    if (indicators.atr.volatility === 'LOW') {
      consProb += 0.15;
      upProb -= 0.075;
      downProb -= 0.075;
    } else if (indicators.atr.volatility === 'EXTREME') {
      consProb -= 0.1;
    }

    // ML Service Integration
    if (this.config.useMLService && this.mlClient.isServiceHealthy()) {
      try {
        mlAvailable = true;

        // Regime detection
        const regimeFeatures = [
          marketFeatures.returns_24h,
          marketFeatures.volatility_24h,
          marketFeatures.volume_trend,
        ];

        const regimeResult = await this.mlClient.detectRegime({
          observations: [regimeFeatures],
        });

        regime = regimeResult.regime;
        regimeConfidence = regimeResult.confidence;

        if (regime === 'BULL') {
          upProb += 0.1 * regimeConfidence;
          downProb -= 0.05 * regimeConfidence;
        } else if (regime === 'BEAR') {
          downProb += 0.1 * regimeConfidence;
          upProb -= 0.05 * regimeConfidence;
        }

        // Price prediction
        const sequences = prepareSequenceData(marketData.slice(-60), 60);
        if (sequences.length > 0) {
          const priceResult = await this.mlClient.predictPrice({
            features: [sequences[sequences.length - 1]],
            returnConfidence: true,
          });

          if (priceResult.predictions.length > 0) {
            mlChange = priceResult.predictions[0][0] || 0;
            mlConfidence = priceResult.confidence_intervals
              ? 1 - priceResult.confidence_intervals.std[0][0]
              : 0.5;

            if (mlChange > 0.01) {
              upProb += 0.1 * mlConfidence;
            } else if (mlChange < -0.01) {
              downProb += 0.1 * mlConfidence;
            }
          }
        }

        // Signal classification
        const featureArray = featuresToArray(marketFeatures);
        const signalResult = await this.mlClient.classifySignal({
          features: [featureArray],
        });

        if (signalResult.signals.length > 0) {
          const mlSignal = signalResult.signals[0];
          if (mlSignal.signal === 'BUY') {
            upProb += 0.15 * mlSignal.confidence;
          } else if (mlSignal.signal === 'SELL') {
            downProb += 0.15 * mlSignal.confidence;
          }
        }

      } catch (error) {
        console.warn('[ForecastService] ML prediction failed, using technical only:', error);
        mlAvailable = false;

        if (!this.config.fallbackToTechnical) {
          throw error;
        }
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
    let confidence = maxProb - minProb;

    if (mlAvailable && mlConfidence > 0) {
      confidence = confidence * 0.7 + mlConfidence * 0.3;
    }

    // Calculate 24h price forecast
    const priceForecast = calculate24hPriceForecast(
      marketData,
      indicators,
      mlAvailable && mlConfidence > 0 ? { change: mlChange, confidence: mlConfidence } : undefined
    );

    // Add regime forecast to price prediction
    if (mlAvailable) {
      const regimeDrift = regime === 'BULL' ? 0.02 : regime === 'BEAR' ? -0.02 : 0;
      priceForecast.regimeForecast = {
        regime,
        confidence: regimeConfidence,
        expectedDrift: regimeDrift,
      };
    }

    return {
      direction,
      confidence: Math.round(confidence * 100) / 100,
      upwardProb: Math.round(upProb * 10000) / 10000,
      downwardProb: Math.round(downProb * 10000) / 10000,
      consolidationProb: Math.round(consProb * 10000) / 10000,
      predictedChange24h: priceForecast.predictedChange,
      timestamp: new Date(),
      symbol,
      indicators,
      correlations,
      signals,
      priceForecast,
      mlAvailable,
      mlConfidence: mlAvailable ? mlConfidence : undefined,
      regime: mlAvailable ? regime : undefined,
      regimeConfidence: mlAvailable ? regimeConfidence : undefined,
    };
  }

  /**
   * Convert candles to MarketData format
   */
  private candlesToMarketData(candles: CandlesInput[], symbol: string): MarketData[] {
    return candles.map(c => ({
      symbol,
      timestamp: new Date(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
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

  addData(symbol: string, data: MarketData[]): void {
    this.data.set(symbol, data);
  }

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

    const agg: AggregatedIndicators = {
      roc_24h: allIndicators.reduce((sum, i) => sum + i.roc_24h, 0) / allIndicators.length,
      atr_pct: allIndicators.reduce((sum, i) => sum + i.atr_pct, 0) / allIndicators.length,
      trend_strength: allIndicators.reduce((sum, i) => sum + i.trend_strength, 0) / allIndicators.length,
      volume_ratio: allIndicators.reduce((sum, i) => sum + i.volume_ratio, 0) / allIndicators.length,
      crypto_cnt: 0,
      stock_cnt: 0,
      gold_roc: 0,
    };

    for (const [symbol] of this.data) {
      if (symbol.includes('/')) {
        agg.crypto_cnt++;
      } else if (symbol.startsWith('^')) {
        agg.stock_cnt++;
      }
    }

    const goldData = this.data.get('GOLD');
    if (goldData && goldData.length > 24) {
      agg.gold_roc = calculateROC(goldData, 24);
    }

    return agg;
  }

  getCorrelations(): Correlations {
    const btcData = this.data.get('BTC/USDT');
    if (!btcData) {
      return { avg_corr: 0 };
    }

    const otherAssets = new Map<string, MarketData[]>();
    for (const [symbol, data] of this.data) {
      if (symbol !== 'BTC/USDT') {
        otherAssets.set(symbol, data);
      }
    }

    return calculateCorrelations(btcData, otherAssets, 24);
  }

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
  ];

  // Add price forecast details if available
  if (forecast.priceForecast) {
    const pf = forecast.priceForecast;
    lines.push('', '**24h Price Forecast:**');
    lines.push(`  Current: $${pf.currentPrice.toFixed(2)}`);
    lines.push(`  Predicted: $${pf.predictedPrice.toFixed(2)}`);
    lines.push(`  95% CI: $${pf.confidenceInterval.lower.toFixed(2)} - $${pf.confidenceInterval.upper.toFixed(2)}`);
    lines.push(`  Risk Level: ${pf.riskLevel}`);
    
    if (pf.technicalForecast.signals.length > 0) {
      lines.push(`  Technical Signals: ${pf.technicalForecast.signals.join(', ')}`);
    }
  }

  lines.push('', '**Technical Indicators:**');
  lines.push(`  RSI: ${forecast.indicators.rsi.value.toFixed(1)} ${forecast.indicators.rsi.overbought ? '(Overbought)' : forecast.indicators.rsi.oversold ? '(Oversold)' : ''}`);
  lines.push(`  MACD: ${forecast.indicators.macd.trend} ${forecast.indicators.macd.crossover !== 'NONE' ? `(${forecast.indicators.macd.crossover})` : ''}`);
  lines.push(`  BB Position: ${forecast.signals.bollingerPosition}`);
  lines.push(`  Volatility: ${forecast.indicators.atr.volatility}`);
  lines.push(`  Trend: ${forecast.signals.trend}`);
  lines.push(`  Momentum: ${forecast.signals.momentum}`);

  if (forecast.correlations.size > 0) {
    lines.push('', '**Correlations:**');
    for (const [asset, corr] of forecast.correlations) {
      const sign = corr.value >= 0 ? '+' : '';
      lines.push(`  ${asset}: ${sign}${(corr.value * 100).toFixed(1)}% (${corr.strength})`);
    }
  }

  if (forecast.mlAvailable) {
    lines.push('', '**ML Enhancement:**');
    lines.push(`  Available: ✅`);
    if (forecast.regime) {
      lines.push(`  Market Regime: ${forecast.regime} (${((forecast.regimeConfidence || 0) * 100).toFixed(0)}% confidence)`);
    }
    if (forecast.mlConfidence) {
      lines.push(`  ML Confidence: ${(forecast.mlConfidence * 100).toFixed(0)}%`);
    }
  }

  return lines.join('\n');
}

export default ForecastService;
