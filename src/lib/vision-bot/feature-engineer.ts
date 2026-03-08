/**
 * Feature Engineer - Technical Indicators Calculator
 *
 * Provides comprehensive technical analysis indicators for market forecasting.
 * Implements RSI, MACD, Bollinger Bands, ATR, and Correlation calculations.
 */

import type { MarketData, OHLCV } from './types';

// --------------------------------------------------
// TYPES
// --------------------------------------------------

export interface RSISResult {
  value: number;
  overbought: boolean;
  oversold: boolean;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  crossover: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE';
}

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;
  squeeze: boolean;
}

export interface ATRResult {
  value: number;
  percent: number;
  volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
}

export interface CorrelationResult {
  value: number;
  strength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  direction: 'POSITIVE' | 'NEGATIVE' | 'NONE';
}

export interface FeatureSet {
  rsi: RSISResult;
  macd: MACDResult;
  bollingerBands: BollingerBandsResult;
  atr: ATRResult;
  timestamp: Date;
}

export interface CandlesInput {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number | Date;
}

// --------------------------------------------------
// FEATURE ENGINEER CLASS
// --------------------------------------------------

export class FeatureEngineer {
  /**
   * Calculate Relative Strength Index (RSI)
   *
   * RSI = 100 - (100 / (1 + RS))
   * RS = Average Gain / Average Loss
   */
  static calculateRSI(
    candles: CandlesInput[],
    period: number = 14
  ): RSISResult {
    if (candles.length < period + 1) {
      return {
        value: 50,
        overbought: false,
        oversold: false,
      };
    }

    const closes = candles.map(c => c.close);
    const gains: number[] = [];
    const losses: number[] = [];

    // Calculate price changes
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // Calculate initial averages
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // Smooth using Wilder's method
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    // Calculate RSI
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return {
      value: Math.round(rsi * 100) / 100,
      overbought: rsi >= 70,
      oversold: rsi <= 30,
    };
  }

  /**
   * Calculate Moving Average Convergence Divergence (MACD)
   *
   * MACD = EMA(12) - EMA(26)
   * Signal = EMA(MACD, 9)
   * Histogram = MACD - Signal
   */
  static calculateMACD(
    candles: CandlesInput[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): MACDResult {
    if (candles.length < slowPeriod + signalPeriod) {
      return {
        macd: 0,
        signal: 0,
        histogram: 0,
        trend: 'NEUTRAL',
        crossover: 'NONE',
      };
    }

    const closes = candles.map(c => c.close);

    // Calculate EMAs
    const emaFast = this.calculateEMA(closes, fastPeriod);
    const emaSlow = this.calculateEMA(closes, slowPeriod);

    // Calculate MACD line
    const macdLine: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i >= slowPeriod - 1) {
        macdLine.push(emaFast[i] - emaSlow[i]);
      }
    }

    // Calculate signal line (EMA of MACD)
    const signalLine = this.calculateEMA(macdLine, signalPeriod);

    // Get last values
    const macd = macdLine[macdLine.length - 1];
    const signal = signalLine[signalLine.length - 1];
    const histogram = macd - signal;

    // Determine trend
    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    if (macd > 0 && signal > 0) {
      trend = 'BULLISH';
    } else if (macd < 0 && signal < 0) {
      trend = 'BEARISH';
    } else {
      trend = 'NEUTRAL';
    }

    // Check for crossover
    let crossover: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE' = 'NONE';
    if (macdLine.length >= 2 && signalLine.length >= 2) {
      const prevMacd = macdLine[macdLine.length - 2];
      const prevSignal = signalLine[signalLine.length - 2];

      if (prevMacd <= prevSignal && macd > signal) {
        crossover = 'BULLISH_CROSSOVER';
      } else if (prevMacd >= prevSignal && macd < signal) {
        crossover = 'BEARISH_CROSSOVER';
      }
    }

    return {
      macd: Math.round(macd * 10000) / 10000,
      signal: Math.round(signal * 10000) / 10000,
      histogram: Math.round(histogram * 10000) / 10000,
      trend,
      crossover,
    };
  }

  /**
   * Calculate Bollinger Bands
   *
   * Middle = SMA(period)
   * Upper = Middle + (stdDev * multiplier)
   * Lower = Middle - (stdDev * multiplier)
   */
  static calculateBollingerBands(
    candles: CandlesInput[],
    period: number = 20,
    multiplier: number = 2
  ): BollingerBandsResult {
    if (candles.length < period) {
      const price = candles.length > 0 ? candles[candles.length - 1].close : 0;
      return {
        upper: price * 1.02,
        middle: price,
        lower: price * 0.98,
        bandwidth: 0.04,
        percentB: 0.5,
        squeeze: false,
      };
    }

    const closes = candles.map(c => c.close);
    const recentCloses = closes.slice(-period);

    // Calculate SMA
    const middle = recentCloses.reduce((a, b) => a + b, 0) / period;

    // Calculate standard deviation
    const squaredDiffs = recentCloses.map(c => Math.pow(c - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);

    // Calculate bands
    const upper = middle + (stdDev * multiplier);
    const lower = middle - (stdDev * multiplier);

    // Calculate bandwidth
    const bandwidth = (upper - lower) / middle;

    // Calculate %B (position within bands)
    const currentPrice = closes[closes.length - 1];
    const percentB = (currentPrice - lower) / (upper - lower);

    // Detect squeeze (bandwidth below historical average)
    const historicalBandwidths: number[] = [];
    for (let i = period; i < closes.length; i++) {
      const windowCloses = closes.slice(i - period, i);
      const windowMiddle = windowCloses.reduce((a, b) => a + b, 0) / period;
      const windowVariance = windowCloses.reduce((sum, c) => sum + Math.pow(c - windowMiddle, 2), 0) / period;
      const windowStdDev = Math.sqrt(windowVariance);
      historicalBandwidths.push((windowStdDev * 2 * multiplier) / windowMiddle);
    }

    const avgBandwidth = historicalBandwidths.length > 0
      ? historicalBandwidths.reduce((a, b) => a + b, 0) / historicalBandwidths.length
      : bandwidth;

    const squeeze = bandwidth < avgBandwidth * 0.5;

    return {
      upper: Math.round(upper * 100) / 100,
      middle: Math.round(middle * 100) / 100,
      lower: Math.round(lower * 100) / 100,
      bandwidth: Math.round(bandwidth * 10000) / 10000,
      percentB: Math.round(percentB * 10000) / 10000,
      squeeze,
    };
  }

  /**
   * Calculate Average True Range (ATR)
   *
   * TR = max(High - Low, |High - PrevClose|, |Low - PrevClose|)
   * ATR = SMA(TR, period)
   */
  static calculateATR(
    candles: CandlesInput[],
    period: number = 14
  ): ATRResult {
    if (candles.length < period + 1) {
      return {
        value: 0,
        percent: 0,
        volatility: 'NORMAL',
      };
    }

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    // Calculate ATR using Wilder's smoothing
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }

    // Calculate percentage
    const currentPrice = candles[candles.length - 1].close;
    const percent = currentPrice > 0 ? (atr / currentPrice) : 0;

    // Determine volatility level
    let volatility: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
    if (percent < 0.01) {
      volatility = 'LOW';
    } else if (percent < 0.025) {
      volatility = 'NORMAL';
    } else if (percent < 0.05) {
      volatility = 'HIGH';
    } else {
      volatility = 'EXTREME';
    }

    return {
      value: Math.round(atr * 100) / 100,
      percent: Math.round(percent * 10000) / 10000,
      volatility,
    };
  }

  /**
   * Calculate Pearson Correlation Coefficient
   *
   * r = Σ((x - x̄)(y - ȳ)) / √(Σ(x - x̄)² × Σ(y - ȳ)²)
   */
  static calculateCorrelation(
    candles1: CandlesInput[],
    candles2: CandlesInput[],
    lookback?: number
  ): CorrelationResult {
    // Determine lookback period
    const period = lookback ?? Math.min(candles1.length, candles2.length);

    if (candles1.length < period || candles2.length < period || period < 2) {
      return {
        value: 0,
        strength: 'WEAK',
        direction: 'NONE',
      };
    }

    // Get closing prices
    const prices1 = candles1.slice(-period).map(c => c.close);
    const prices2 = candles2.slice(-period).map(c => c.close);

    // Calculate correlation using returns instead of prices for stationarity
    const returns1: number[] = [];
    const returns2: number[] = [];

    for (let i = 1; i < prices1.length; i++) {
      if (prices1[i - 1] !== 0 && prices2[i - 1] !== 0) {
        returns1.push((prices1[i] - prices1[i - 1]) / prices1[i - 1]);
        returns2.push((prices2[i] - prices2[i - 1]) / prices2[i - 1]);
      }
    }

    if (returns1.length < 2) {
      return {
        value: 0,
        strength: 'WEAK',
        direction: 'NONE',
      };
    }

    // Calculate Pearson correlation
    const n = returns1.length;
    const sumX = returns1.reduce((a, b) => a + b, 0);
    const sumY = returns2.reduce((a, b) => a + b, 0);
    const sumXY = returns1.reduce((total, x, i) => total + x * returns2[i], 0);
    const sumX2 = returns1.reduce((total, x) => total + x * x, 0);
    const sumY2 = returns2.reduce((total, y) => total + y * y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    if (denominator === 0) {
      return {
        value: 0,
        strength: 'WEAK',
        direction: 'NONE',
      };
    }

    const correlation = numerator / denominator;

    // Determine strength and direction
    const absValue = Math.abs(correlation);
    let strength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
    let direction: 'POSITIVE' | 'NEGATIVE' | 'NONE';

    if (absValue < 0.3) {
      strength = 'WEAK';
    } else if (absValue < 0.5) {
      strength = 'MODERATE';
    } else if (absValue < 0.7) {
      strength = 'STRONG';
    } else {
      strength = 'VERY_STRONG';
    }

    if (correlation > 0.1) {
      direction = 'POSITIVE';
    } else if (correlation < -0.1) {
      direction = 'NEGATIVE';
    } else {
      direction = 'NONE';
    }

    return {
      value: Math.round(correlation * 10000) / 10000,
      strength,
      direction,
    };
  }

  /**
   * Calculate all features for a candle dataset
   */
  static calculateAllFeatures(candles: CandlesInput[]): FeatureSet {
    return {
      rsi: this.calculateRSI(candles),
      macd: this.calculateMACD(candles),
      bollingerBands: this.calculateBollingerBands(candles),
      atr: this.calculateATR(candles),
      timestamp: candles.length > 0
        ? new Date(candles[candles.length - 1].timestamp)
        : new Date(),
    };
  }

  // --------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------

  /**
   * Calculate Exponential Moving Average
   */
  private static calculateEMA(prices: number[], period: number): number[] {
    if (prices.length === 0) return [];

    const multiplier = 2 / (period + 1);
    const ema: number[] = [prices[0]];

    for (let i = 1; i < prices.length; i++) {
      const value = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
      ema.push(value);
    }

    return ema;
  }

  /**
   * Calculate Simple Moving Average
   */
  static calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const window = prices.slice(-period);
    return window.reduce((a, b) => a + b, 0) / period;
  }

  /**
   * Calculate Standard Deviation
   */
  static calculateStdDev(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const window = prices.slice(-period);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const squaredDiffs = window.map(p => Math.pow(p - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / period);
  }
}

// --------------------------------------------------
// CONVERSION UTILITIES
// --------------------------------------------------

/**
 * Convert MarketData array to CandlesInput array
 */
export function marketDataToCandles(data: MarketData[]): CandlesInput[] {
  return data.map(d => ({
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
    timestamp: d.timestamp,
  }));
}

/**
 * Convert OHLCV array to CandlesInput array
 */
export function ohlcvToCandles(data: OHLCV[]): CandlesInput[] {
  return data.map(d => ({
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
    timestamp: d.timestamp,
  }));
}

// --------------------------------------------------
// CORRELATION MATRIX BUILDER
// --------------------------------------------------

export interface CorrelationMatrix {
  assets: string[];
  matrix: number[][];
  timestamp: Date;
}

export class CorrelationMatrixBuilder {
  private data: Map<string, CandlesInput[]> = new Map();

  /**
   * Add asset data
   */
  addAsset(symbol: string, candles: CandlesInput[]): void {
    this.data.set(symbol, candles);
  }

  /**
   * Calculate correlation matrix
   */
  calculateMatrix(lookback: number = 24): CorrelationMatrix {
    const assets = Array.from(this.data.keys());
    const matrix: number[][] = [];

    for (let i = 0; i < assets.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < assets.length; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          const data1 = this.data.get(assets[i]);
          const data2 = this.data.get(assets[j]);
          if (data1 && data2) {
            const result = FeatureEngineer.calculateCorrelation(data1, data2, lookback);
            matrix[i][j] = result.value;
          } else {
            matrix[i][j] = 0;
          }
        }
      }
    }

    return {
      assets,
      matrix,
      timestamp: new Date(),
    };
  }

  /**
   * Get correlation with specific asset (e.g., BTC)
   */
  getCorrelationWith(targetAsset: string, lookback: number = 24): Map<string, CorrelationResult> {
    const targetData = this.data.get(targetAsset);
    const correlations = new Map<string, CorrelationResult>();

    if (!targetData) return correlations;

    for (const [symbol, data] of this.data) {
      if (symbol !== targetAsset) {
        const result = FeatureEngineer.calculateCorrelation(targetData, data, lookback);
        correlations.set(symbol, result);
      }
    }

    return correlations;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.clear();
  }
}

// Export default instance
export default FeatureEngineer;
