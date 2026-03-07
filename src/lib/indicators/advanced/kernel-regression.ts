/**
 * Kernel Regression Indicator (Nadaraya-Watson Estimator)
 *
 * A sophisticated non-parametric regression technique that uses kernel functions
 * to estimate the underlying trend of price data. This implementation uses the
 * Rational Quadratic kernel which provides smooth trend estimation with adaptive
 * bandwidth control.
 *
 * Algorithm:
 * 1. Rational Quadratic Kernel: w(d) = (1 + d²/(2αh²))^(-α)
 *    Where: d = distance, α = alpha parameter, h = bandwidth
 * 2. Nadaraya-Watson weighted average: ŷ = Σ w(x) * y / Σ w(x)
 * 3. Mean deviation + ATR for hybrid volatility bands
 * 4. Channel bands with inner and outer multipliers
 *
 * Features:
 * - Smooth trend estimation without lag of traditional MAs
 * - Adaptive to market volatility
 * - Channel bands for mean reversion signals
 * - Trend direction detection
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { IndicatorResult } from "../calculator";

// ==================== TYPES ====================

/**
 * Configuration for Kernel Regression Indicator
 */
export interface KernelRegressionConfig {
  lookbackWindow: number;       // Default: 24 - Number of bars for kernel estimation
  bandwidth: number;            // Default: 8.0 - Bandwidth parameter (h)
  alpha: number;                // Default: 2.0 - Rational Quadratic alpha parameter
  innerMultiplier: number;      // Default: 1.5 - Inner channel multiplier
  outerMultiplier: number;      // Default: 2.5 - Outer channel multiplier
}

/**
 * Result of Kernel Regression calculation for a single candle
 */
export interface KernelRegressionResult {
  baseline: number;             // Nadaraya-Watson estimate
  upperInner: number;           // Upper inner channel
  lowerInner: number;           // Lower inner channel
  upperOuter: number;           // Upper outer channel
  lowerOuter: number;           // Lower outer channel
  trend: 'UP' | 'DOWN';         // Trend direction
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
}

/**
 * Candle data structure
 */
export interface Candle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate True Range
 */
function calculateTrueRange(candles: Candle[]): number[] {
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      result.push(tr);
    }
  }

  return result;
}

/**
 * Calculate Average True Range using Wilder's smoothing
 */
function calculateATR(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  const trValues = calculateTrueRange(candles);

  if (candles.length < period) return result;

  // First ATR is SMA of TR
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trValues[i];
  }
  result[period - 1] = sum / period;

  // Subsequent ATR values use Wilder's smoothing
  for (let i = period; i < trValues.length; i++) {
    const prevATR = result[i - 1] as number;
    result[i] = (prevATR * (period - 1) + trValues[i]) / period;
  }

  return result;
}

/**
 * Rational Quadratic Kernel Function
 *
 * w(d) = (1 + d²/(2αh²))^(-α)
 *
 * This kernel provides smooth weighting that decays with distance.
 * Higher alpha values result in faster decay (more local influence).
 * Lower alpha values result in slower decay (more global influence).
 */
function rationalQuadraticKernel(
  distance: number,
  bandwidth: number,
  alpha: number
): number {
  const h = bandwidth;
  const d = distance;
  return Math.pow(1 + (d * d) / (2 * alpha * h * h), -alpha);
}

/**
 * Calculate Mean Deviation
 * Mean Absolute Deviation from the baseline
 */
function calculateMeanDeviation(
  closes: number[],
  baseline: number,
  startIdx: number,
  window: number
): number {
  let sum = 0;
  const endIdx = Math.min(startIdx + window, closes.length);

  for (let i = startIdx; i < endIdx; i++) {
    sum += Math.abs(closes[i] - baseline);
  }

  return sum / (endIdx - startIdx);
}

// ==================== MAIN CLASS ====================

/**
 * Kernel Regression Class
 *
 * Implements Nadaraya-Watson kernel regression with Rational Quadratic kernel
 * for trend estimation and channel bands.
 */
export class KernelRegression {
  private config: KernelRegressionConfig;

  constructor(config: Partial<KernelRegressionConfig> = {}) {
    this.config = {
      lookbackWindow: config.lookbackWindow ?? 24,
      bandwidth: config.bandwidth ?? 8.0,
      alpha: config.alpha ?? 2.0,
      innerMultiplier: config.innerMultiplier ?? 1.5,
      outerMultiplier: config.outerMultiplier ?? 2.5,
    };
  }

  /**
   * Calculate Kernel Regression indicator values
   */
  calculate(highs: number[], lows: number[], closes: number[]): KernelRegressionResult[] {
    const results: KernelRegressionResult[] = [];
    const { lookbackWindow, bandwidth, alpha, innerMultiplier, outerMultiplier } = this.config;

    if (closes.length === 0) {
      return results;
    }

    // Create dummy candles for ATR calculation
    const dummyCandles: Candle[] = closes.map((c, i) => ({
      time: i as Time,
      open: c,
      high: highs[i],
      low: lows[i],
      close: c,
      volume: 0,
    }));

    // Calculate ATR for hybrid volatility
    const atrValues = calculateATR(dummyCandles, 14);

    // Calculate Nadaraya-Watson estimate for each point
    const baselines: (number | null)[] = [];

    for (let i = 0; i < closes.length; i++) {
      if (i < lookbackWindow - 1) {
        baselines.push(null);
        continue;
      }

      // Calculate kernel-weighted average
      let weightedSum = 0;
      let weightSum = 0;

      const startIdx = Math.max(0, i - lookbackWindow + 1);

      for (let j = startIdx; j <= i; j++) {
        // Distance is the number of bars back from current
        const distance = i - j;
        const weight = rationalQuadraticKernel(distance, bandwidth, alpha);

        weightedSum += weight * closes[j];
        weightSum += weight;
      }

      const baseline = weightSum > 0 ? weightedSum / weightSum : closes[i];
      baselines.push(baseline);
    }

    // Calculate channel bands using hybrid volatility
    for (let i = 0; i < closes.length; i++) {
      const baseline = baselines[i];
      const atr = atrValues[i];

      if (baseline === null) {
        results.push({
          baseline: 0,
          upperInner: 0,
          lowerInner: 0,
          upperOuter: 0,
          lowerOuter: 0,
          trend: 'UP',
          signal: 'NEUTRAL',
        });
        continue;
      }

      // Calculate mean deviation for additional volatility measure
      const meanDev = calculateMeanDeviation(closes, baseline, Math.max(0, i - lookbackWindow + 1), lookbackWindow);

      // Hybrid volatility: combine mean deviation and ATR
      const atrValue = atr ?? 0;
      const volatility = meanDev + atrValue * 0.5;

      // Calculate channel bands
      const innerBand = volatility * innerMultiplier;
      const outerBand = volatility * outerMultiplier;

      const upperInner = baseline + innerBand;
      const lowerInner = baseline - innerBand;
      const upperOuter = baseline + outerBand;
      const lowerOuter = baseline - outerBand;

      // Determine trend direction
      let trend: 'UP' | 'DOWN' = 'UP';
      if (i > 0 && baselines[i - 1] !== null) {
        trend = baseline >= (baselines[i - 1] as number) ? 'UP' : 'DOWN';
      }

      // Generate signal based on price position relative to bands
      let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
      const close = closes[i];

      // Price touching lower outer band - potential buy signal
      if (close <= lowerOuter) {
        signal = 'BUY';
      }
      // Price touching upper outer band - potential sell signal
      else if (close >= upperOuter) {
        signal = 'SELL';
      }
      // Price touching lower inner band with uptrend - potential buy
      else if (close <= lowerInner && trend === 'UP') {
        signal = 'BUY';
      }
      // Price touching upper inner band with downtrend - potential sell
      else if (close >= upperInner && trend === 'DOWN') {
        signal = 'SELL';
      }

      results.push({
        baseline,
        upperInner,
        lowerInner,
        upperOuter,
        lowerOuter,
        trend,
        signal,
      });
    }

    return results;
  }

  /**
   * Get channel signal based on price crossing bands
   */
  getChannelSignal(
    current: KernelRegressionResult,
    previous: KernelRegressionResult | null,
    close: number
  ): 'BUY' | 'SELL' | 'NEUTRAL' {
    if (previous === null) {
      return current.signal;
    }

    // Price crossing from below outer band to inside - strong buy
    if (close > previous.lowerOuter && close <= current.lowerOuter) {
      return 'BUY';
    }

    // Price crossing from above outer band to inside - strong sell
    if (close < previous.upperOuter && close >= current.upperOuter) {
      return 'SELL';
    }

    // Price bouncing off inner band in trend direction
    if (current.trend === 'UP' && close > current.lowerInner && close <= previous.lowerInner) {
      return 'BUY';
    }

    if (current.trend === 'DOWN' && close < current.upperInner && close >= previous.upperInner) {
      return 'SELL';
    }

    return 'NEUTRAL';
  }

  /**
   * Calculate indicator with candles input
   */
  calculateWithCandles(candles: Candle[]): KernelRegressionResult[] {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);
    return this.calculate(highs, lows, closes);
  }

  /**
   * Get indicator result for chart rendering
   */
  calculateIndicator(candles: Candle[]): IndicatorResult {
    const results = this.calculateWithCandles(candles);

    // Build baseline line data
    const baselineData: (LineData<Time> | WhitespaceData<Time>)[] = results.map((r, i) => ({
      time: candles[i].time,
      value: r.baseline,
    }));

    // Build inner channel lines
    const upperInnerData: (LineData<Time> | WhitespaceData<Time>)[] = results.map((r, i) => ({
      time: candles[i].time,
      value: r.upperInner,
    }));

    const lowerInnerData: (LineData<Time> | WhitespaceData<Time>)[] = results.map((r, i) => ({
      time: candles[i].time,
      value: r.lowerInner,
    }));

    // Build outer channel lines
    const upperOuterData: (LineData<Time> | WhitespaceData<Time>)[] = results.map((r, i) => ({
      time: candles[i].time,
      value: r.upperOuter,
    }));

    const lowerOuterData: (LineData<Time> | WhitespaceData<Time>)[] = results.map((r, i) => ({
      time: candles[i].time,
      value: r.lowerOuter,
    }));

    return {
      id: 'kernel_regression',
      overlay: true,
      lines: [
        { name: 'baseline', data: baselineData, color: '#2962FF' },
        { name: 'upper_inner', data: upperInnerData, color: '#26A69A' },
        { name: 'lower_inner', data: lowerInnerData, color: '#26A69A' },
        { name: 'upper_outer', data: upperOuterData, color: '#EF5350' },
        { name: 'lower_outer', data: lowerOuterData, color: '#EF5350' },
      ],
      histograms: [],
    };
  }

  /**
   * Analyze trend strength
   */
  analyzeTrendStrength(results: KernelRegressionResult[]): {
    direction: 'UP' | 'DOWN' | 'FLAT';
    strength: 'STRONG' | 'MODERATE' | 'WEAK';
    bandwidthCompression: boolean;
  } {
    if (results.length < 5) {
      return {
        direction: 'FLAT',
        strength: 'WEAK',
        bandwidthCompression: false,
      };
    }

    const recent = results.slice(-5);

    // Count trend direction
    let upCount = 0;
    let downCount = 0;

    for (const r of recent) {
      if (r.trend === 'UP') upCount++;
      else downCount++;
    }

    const direction = upCount > downCount ? 'UP' : downCount > upCount ? 'DOWN' : 'FLAT';

    // Calculate average channel width
    const avgWidth = recent.reduce((sum, r) => {
      return sum + (r.upperOuter - r.lowerOuter);
    }, 0) / recent.length;

    const avgPrice = recent.reduce((sum, r) => sum + r.baseline, 0) / recent.length;

    // Calculate width as percentage of price
    const widthPercent = (avgWidth / avgPrice) * 100;

    // Determine strength based on consistency and width
    let strength: 'STRONG' | 'MODERATE' | 'WEAK';
    const consistency = Math.max(upCount, downCount) / 5;

    if (consistency >= 0.8 && widthPercent < 3) {
      strength = 'STRONG';
    } else if (consistency >= 0.6 || widthPercent < 5) {
      strength = 'MODERATE';
    } else {
      strength = 'WEAK';
    }

    // Check for bandwidth compression (potential breakout)
    const latest = recent[recent.length - 1];
    const oldest = recent[0];
    const bandwidthCompression = (latest.upperOuter - latest.lowerOuter) <
                                   (oldest.upperOuter - oldest.lowerOuter) * 0.8;

    return {
      direction,
      strength,
      bandwidthCompression,
    };
  }
}

// ==================== STANDALONE FUNCTIONS ====================

/**
 * Calculate Kernel Regression indicator (standalone function)
 */
export function calculateKernelRegression(
  highs: number[],
  lows: number[],
  closes: number[],
  config: Partial<KernelRegressionConfig> = {}
): KernelRegressionResult[] {
  const indicator = new KernelRegression(config);
  return indicator.calculate(highs, lows, closes);
}

/**
 * Get channel signal (standalone function)
 */
export function getChannelSignal(
  current: KernelRegressionResult,
  previous: KernelRegressionResult | null,
  close: number
): 'BUY' | 'SELL' | 'NEUTRAL' {
  const indicator = new KernelRegression();
  return indicator.getChannelSignal(current, previous, close);
}

/**
 * Calculate Kernel Regression for chart indicator system
 */
export function calculateKernelRegressionIndicator(
  candles: Candle[],
  config: Partial<KernelRegressionConfig> = {}
): IndicatorResult {
  const indicator = new KernelRegression(config);
  return indicator.calculateIndicator(candles);
}

/**
 * Analyze trend strength (standalone function)
 */
export function analyzeKernelTrendStrength(
  results: KernelRegressionResult[]
): {
  direction: 'UP' | 'DOWN' | 'FLAT';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  bandwidthCompression: boolean;
} {
  const indicator = new KernelRegression();
  return indicator.analyzeTrendStrength(results);
}

// Export default class
export default KernelRegression;
