/**
 * QuantClub Indicators Port
 *
 * Indicators ported and enhanced from the-quantclub-iitbhu/Technical-indicators
 * Reference: https://github.com/the-quantclub-iitbhu/Technical-indicators
 *
 * This module provides enhanced implementations of:
 * 1. Stochastic Oscillator - Full featured with signals
 * 2. ADX (Average Directional Index) - With trend strength analysis
 * 3. Validation utilities - Compare implementations
 *
 * QuantClub is a Python library from IIT (BHU) with academic-quality
 * implementations of technical indicators.
 */

import type { Time, LineData, HistogramData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

/**
 * Stochastic Oscillator configuration
 */
export interface StochasticConfig {
  kPeriod: number;     // %K period (default: 14)
  dPeriod: number;     // %D period (default: 3)
  smoothK: number;     // Smoothing for %K (default: 1)
}

/**
 * Stochastic Oscillator result point
 */
export interface StochasticPoint {
  time: Time;
  k: number;           // %K value
  d: number;           // %D value (SMA of %K)
  zone: 'overbought' | 'oversold' | 'neutral';
  signal: 'buy' | 'sell' | null;
}

/**
 * ADX configuration
 */
export interface ADXConfig {
  period: number;      // ADX period (default: 14)
  adxSmooth: number;   // ADX smoothing (default: 14)
}

/**
 * ADX result point with full directional analysis
 */
export interface ADXPoint {
  time: Time;
  adx: number;         // Average Directional Index
  plusDI: number;      // +DI (Positive Directional Indicator)
  minusDI: number;     // -DI (Negative Directional Indicator)
  trend: 'strong_bullish' | 'bullish' | 'weak' | 'bearish' | 'strong_bearish';
  trendStrength: number; // 0-100 strength
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate EMA (Exponential Moving Average)
 */
function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;

  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;

  // Calculate EMA
  let prevEma = result[period - 1] as number;
  for (let i = period; i < data.length; i++) {
    const currentEma = (data[i] - prevEma) * multiplier + prevEma;
    result[i] = currentEma;
    prevEma = currentEma;
  }

  return result;
}

/**
 * Calculate SMA (Simple Moving Average)
 */
function sma(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result[i] = sum / period;
  }

  return result;
}

/**
 * Calculate highest high over period
 */
function highestHigh(candles: Candle[], period: number, endIndex: number): number {
  let highest = -Infinity;
  const startIndex = Math.max(0, endIndex - period + 1);

  for (let i = startIndex; i <= endIndex; i++) {
    highest = Math.max(highest, candles[i].high);
  }

  return highest;
}

/**
 * Calculate lowest low over period
 */
function lowestLow(candles: Candle[], period: number, endIndex: number): number {
  let lowest = Infinity;
  const startIndex = Math.max(0, endIndex - period + 1);

  for (let i = startIndex; i <= endIndex; i++) {
    lowest = Math.min(lowest, candles[i].low);
  }

  return lowest;
}

/**
 * Build line data for chart
 */
function buildLineData(
  candles: Candle[],
  values: (number | null)[]
): (LineData<Time> | WhitespaceData<Time>)[] {
  return candles.map((c, i) => {
    const value = values[i];
    if (value !== null && !isNaN(value) && isFinite(value)) {
      return { time: c.time, value };
    }
    return { time: c.time };
  });
}

/**
 * Build histogram data for chart
 */
function buildHistogramData(
  candles: Candle[],
  values: (number | null)[],
  colorPositive: string,
  colorNegative: string
): (HistogramData<Time> | WhitespaceData<Time>)[] {
  return candles.map((c, i) => {
    const value = values[i];
    if (value !== null && !isNaN(value) && isFinite(value)) {
      return {
        time: c.time,
        value,
        color: value >= 0 ? colorPositive : colorNegative,
      };
    }
    return { time: c.time };
  });
}

// ==================== STOCHASTIC OSCILLATOR ====================

/**
 * Stochastic Oscillator
 *
 * The Stochastic Oscillator compares a security's closing price to its
 * price range over a given time period. It's a momentum indicator that
 * shows the location of the close relative to the high-low range over
 * a set number of periods.
 *
 * Formula:
 * - %K = ((Close - Lowest Low) / (Highest High - Lowest Low)) × 100
 * - %D = SMA of %K over dPeriod
 *
 * Interpretation:
 * - %K above 80: Overbought zone
 * - %K below 20: Oversold zone
 * - Bullish signal: %K crosses above %D in oversold zone
 * - Bearish signal: %K crosses below %D in overbought zone
 *
 * Ported from QuantClub with enhancements.
 */
export function calculateStochastic(
  candles: Candle[],
  config: Partial<StochasticConfig> = {}
): IndicatorResult {
  const kPeriod = config.kPeriod ?? 14;
  const dPeriod = config.dPeriod ?? 3;
  const smoothK = config.smoothK ?? 1;

  // Calculate raw %K values
  const rawKValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = kPeriod - 1; i < candles.length; i++) {
    const highest = highestHigh(candles, kPeriod, i);
    const lowest = lowestLow(candles, kPeriod, i);
    const close = candles[i].close;

    if (highest === lowest) {
      rawKValues[i] = 50; // Neutral when range is zero
    } else {
      rawKValues[i] = ((close - lowest) / (highest - lowest)) * 100;
    }
  }

  // Apply smoothing to %K if needed
  let kValues: (number | null)[];
  if (smoothK > 1) {
    kValues = sma(rawKValues.filter(v => v !== null) as number[], smoothK);
    // Map back to original indices
    const smoothedK: (number | null)[] = new Array(candles.length).fill(null);
    let smoothIdx = 0;
    for (let i = 0; i < candles.length; i++) {
      if (rawKValues[i] !== null) {
        if (smoothIdx < kValues.length && kValues[smoothIdx] !== null) {
          smoothedK[i] = kValues[smoothIdx];
        }
        smoothIdx++;
      }
    }
    kValues = smoothedK;
  } else {
    kValues = rawKValues;
  }

  // Calculate %D (SMA of %K)
  const dValues = sma(kValues.filter(v => v !== null) as number[], dPeriod);

  // Map %D back to original indices
  const fullDValues: (number | null)[] = new Array(candles.length).fill(null);
  let dIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (kValues[i] !== null) {
      if (dIdx < dValues.length && dValues[dIdx] !== null) {
        fullDValues[i] = dValues[dIdx];
      }
      dIdx++;
    }
  }

  return {
    id: 'stochastic',
    overlay: false,
    lines: [
      { name: 'k', data: buildLineData(candles, kValues), color: '#2962FF' },
      { name: 'd', data: buildLineData(candles, fullDValues), color: '#FF6D00' },
    ],
    histograms: [],
  };
}

/**
 * Get Stochastic with full signals and analysis
 */
export function getStochasticSignals(
  candles: Candle[],
  config: Partial<StochasticConfig> = {}
): StochasticPoint[] {
  const kPeriod = config.kPeriod ?? 14;
  const dPeriod = config.dPeriod ?? 3;

  const results: StochasticPoint[] = [];

  // Calculate %K
  const kValues: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const highest = highestHigh(candles, kPeriod, i);
    const lowest = lowestLow(candles, kPeriod, i);
    const close = candles[i].close;

    if (highest === lowest) {
      kValues[i] = 50;
    } else {
      kValues[i] = ((close - lowest) / (highest - lowest)) * 100;
    }
  }

  // Calculate %D
  const dValues = sma(kValues.filter(v => v !== null) as number[], dPeriod);

  // Map %D back
  const fullDValues: (number | null)[] = new Array(candles.length).fill(null);
  let dIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (kValues[i] !== null) {
      if (dIdx < dValues.length && dValues[dIdx] !== null) {
        fullDValues[i] = dValues[dIdx];
      }
      dIdx++;
    }
  }

  // Generate signals
  let prevK: number | null = null;
  let prevD: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const k = kValues[i];
    const d = fullDValues[i];

    if (k !== null && d !== null) {
      // Determine zone
      let zone: 'overbought' | 'oversold' | 'neutral';
      if (k >= 80) {
        zone = 'overbought';
      } else if (k <= 20) {
        zone = 'oversold';
      } else {
        zone = 'neutral';
      }

      // Determine signal
      let signal: 'buy' | 'sell' | null = null;
      if (prevK !== null && prevD !== null) {
        // Bullish crossover in oversold zone
        if (prevK <= prevD && k > d && zone === 'oversold') {
          signal = 'buy';
        }
        // Bearish crossover in overbought zone
        if (prevK >= prevD && k < d && zone === 'overbought') {
          signal = 'sell';
        }
      }

      results.push({
        time: candles[i].time,
        k,
        d,
        zone,
        signal,
      });

      prevK = k;
      prevD = d;
    }
  }

  return results;
}

// ==================== ADX (AVERAGE DIRECTIONAL INDEX) ====================

/**
 * ADX (Average Directional Index)
 *
 * The ADX indicator measures the strength of a trend, not its direction.
 * It was developed by Welles Wilder and is part of the Directional
 * Movement System.
 *
 * Formula:
 * - +DM = High - Previous High (if positive, else 0)
 * - -DM = Previous Low - Low (if positive, else 0)
 * - TR (True Range) = max(H-L, |H-PrevC|, |L-PrevC|)
 * - +DI = 100 × EMA(+DM) / EMA(TR)
 * - -DI = 100 × EMA(-DM) / EMA(TR)
 * - DX = 100 × |+DI - -DI| / (+DI + -DI)
 * - ADX = EMA(DX)
 *
 * Interpretation:
 * - ADX > 25: Strong trend (direction determined by +DI/-DI)
 * - ADX < 20: Weak/no trend
 * - ADX rising: Trend strengthening
 * - ADX falling: Trend weakening
 * - +DI > -DI: Bullish trend
 * - -DI > +DI: Bearish trend
 *
 * Ported from QuantClub with enhancements.
 */
export function calculateADX(
  candles: Candle[],
  config: Partial<ADXConfig> = {}
): IndicatorResult {
  const period = config.period ?? 14;

  if (candles.length < period + 1) {
    return {
      id: 'adx',
      overlay: false,
      lines: [
        { name: 'adx', data: buildLineData(candles, new Array(candles.length).fill(null)), color: '#2962FF' },
        { name: 'plusDI', data: buildLineData(candles, new Array(candles.length).fill(null)), color: '#26A69A' },
        { name: 'minusDI', data: buildLineData(candles, new Array(candles.length).fill(null)), color: '#EF5350' },
      ],
      histograms: [],
    };
  }

  // Calculate Directional Movement and True Range
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trValues: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    // +DM
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);

    // -DM
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    // True Range
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trValues.push(tr);
  }

  // Smooth DM and TR using Wilder's smoothing (similar to EMA)
  const smoothPlusDM: number[] = [];
  const smoothMinusDM: number[] = [];
  const smoothTR: number[] = [];

  // First value is sum of first 'period' values
  let sumPlusDM = 0;
  let sumMinusDM = 0;
  let sumTR = 0;

  for (let i = 0; i < period; i++) {
    sumPlusDM += plusDM[i];
    sumMinusDM += minusDM[i];
    sumTR += trValues[i];

    smoothPlusDM.push(0);
    smoothMinusDM.push(0);
    smoothTR.push(0);
  }

  smoothPlusDM[period - 1] = sumPlusDM;
  smoothMinusDM[period - 1] = sumMinusDM;
  smoothTR[period - 1] = sumTR;

  // Apply Wilder's smoothing
  for (let i = period; i < candles.length; i++) {
    smoothPlusDM.push(smoothPlusDM[i - 1] - smoothPlusDM[i - 1] / period + plusDM[i]);
    smoothMinusDM.push(smoothMinusDM[i - 1] - smoothMinusDM[i - 1] / period + minusDM[i]);
    smoothTR.push(smoothTR[i - 1] - smoothTR[i - 1] / period + trValues[i]);
  }

  // Calculate +DI, -DI, DX
  const plusDI: (number | null)[] = new Array(candles.length).fill(null);
  const minusDI: (number | null)[] = new Array(candles.length).fill(null);
  const dxValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = period - 1; i < candles.length; i++) {
    if (smoothTR[i] > 0) {
      plusDI[i] = (smoothPlusDM[i] / smoothTR[i]) * 100;
      minusDI[i] = (smoothMinusDM[i] / smoothTR[i]) * 100;

      const diSum = plusDI[i]! + minusDI[i]!;
      if (diSum > 0) {
        dxValues[i] = (Math.abs(plusDI[i]! - minusDI[i]!) / diSum) * 100;
      }
    }
  }

  // Calculate ADX (smoothed DX)
  const adxValues: (number | null)[] = new Array(candles.length).fill(null);

  // First ADX is average of first 'period' DX values
  let sumDX = 0;
  let dxCount = 0;
  for (let i = period - 1; i < period * 2 - 1 && i < candles.length; i++) {
    if (dxValues[i] !== null) {
      sumDX += dxValues[i]!;
      dxCount++;
    }
  }

  if (dxCount > 0) {
    const firstADXIndex = Math.min(period * 2 - 2, candles.length - 1);
    adxValues[firstADXIndex] = sumDX / dxCount;

    // Smooth remaining ADX values
    for (let i = firstADXIndex + 1; i < candles.length; i++) {
      if (dxValues[i] !== null) {
        adxValues[i] = (adxValues[i - 1]! * (period - 1) + dxValues[i]!) / period;
      }
    }
  }

  return {
    id: 'adx',
    overlay: false,
    lines: [
      { name: 'adx', data: buildLineData(candles, adxValues), color: '#2962FF' },
      { name: 'plusDI', data: buildLineData(candles, plusDI), color: '#26A69A' },
      { name: 'minusDI', data: buildLineData(candles, minusDI), color: '#EF5350' },
    ],
    histograms: [],
  };
}

/**
 * Get ADX with full trend analysis
 */
export function getADXAnalysis(
  candles: Candle[],
  config: Partial<ADXConfig> = {}
): ADXPoint[] {
  const period = config.period ?? 14;
  const results: ADXPoint[] = [];

  if (candles.length < period + 1) {
    return results;
  }

  // Calculate Directional Movement and True Range
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trValues: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trValues.push(tr);
  }

  // Smooth values
  const smoothPlusDM: number[] = [];
  const smoothMinusDM: number[] = [];
  const smoothTR: number[] = [];

  let sumPlusDM = 0;
  let sumMinusDM = 0;
  let sumTR = 0;

  for (let i = 0; i < period; i++) {
    sumPlusDM += plusDM[i];
    sumMinusDM += minusDM[i];
    sumTR += trValues[i];
    smoothPlusDM.push(0);
    smoothMinusDM.push(0);
    smoothTR.push(0);
  }

  smoothPlusDM[period - 1] = sumPlusDM;
  smoothMinusDM[period - 1] = sumMinusDM;
  smoothTR[period - 1] = sumTR;

  for (let i = period; i < candles.length; i++) {
    smoothPlusDM.push(smoothPlusDM[i - 1] - smoothPlusDM[i - 1] / period + plusDM[i]);
    smoothMinusDM.push(smoothMinusDM[i - 1] - smoothMinusDM[i - 1] / period + minusDM[i]);
    smoothTR.push(smoothTR[i - 1] - smoothTR[i - 1] / period + trValues[i]);
  }

  // Calculate DI, DX, ADX
  const plusDI: (number | null)[] = new Array(candles.length).fill(null);
  const minusDI: (number | null)[] = new Array(candles.length).fill(null);
  const dxValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = period - 1; i < candles.length; i++) {
    if (smoothTR[i] > 0) {
      plusDI[i] = (smoothPlusDM[i] / smoothTR[i]) * 100;
      minusDI[i] = (smoothMinusDM[i] / smoothTR[i]) * 100;

      const diSum = plusDI[i]! + minusDI[i]!;
      if (diSum > 0) {
        dxValues[i] = (Math.abs(plusDI[i]! - minusDI[i]!) / diSum) * 100;
      }
    }
  }

  const adxValues: (number | null)[] = new Array(candles.length).fill(null);

  let sumDX = 0;
  let dxCount = 0;
  for (let i = period - 1; i < period * 2 - 1 && i < candles.length; i++) {
    if (dxValues[i] !== null) {
      sumDX += dxValues[i]!;
      dxCount++;
    }
  }

  if (dxCount > 0) {
    const firstADXIndex = Math.min(period * 2 - 2, candles.length - 1);
    adxValues[firstADXIndex] = sumDX / dxCount;

    for (let i = firstADXIndex + 1; i < candles.length; i++) {
      if (dxValues[i] !== null) {
        adxValues[i] = (adxValues[i - 1]! * (period - 1) + dxValues[i]!) / period;
      }
    }
  }

  // Generate analysis
  for (let i = 0; i < candles.length; i++) {
    const adx = adxValues[i];
    const pdi = plusDI[i];
    const mdi = minusDI[i];

    if (adx !== null && pdi !== null && mdi !== null) {
      // Determine trend and strength
      let trend: ADXPoint['trend'];
      const trendStrength = adx;

      if (adx >= 25) {
        if (pdi > mdi) {
          trend = adx >= 50 ? 'strong_bullish' : 'bullish';
        } else {
          trend = adx >= 50 ? 'strong_bearish' : 'bearish';
        }
      } else {
        trend = 'weak';
      }

      results.push({
        time: candles[i].time,
        adx,
        plusDI: pdi,
        minusDI: mdi,
        trend,
        trendStrength,
      });
    }
  }

  return results;
}

// ==================== VALIDATION UTILITIES ====================

/**
 * Validate indicator implementation by comparing with reference values
 */
export function validateIndicator(
  calculated: number[],
  expected: number[],
  tolerance: number = 0.01
): {
  valid: boolean;
  maxError: number;
  avgError: number;
  matchCount: number;
  totalCount: number;
} {
  let maxError = 0;
  let totalError = 0;
  let matchCount = 0;

  const minLen = Math.min(calculated.length, expected.length);

  for (let i = 0; i < minLen; i++) {
    if (!isNaN(calculated[i]) && !isNaN(expected[i])) {
      const error = Math.abs(calculated[i] - expected[i]);
      maxError = Math.max(maxError, error);
      totalError += error;

      if (error <= tolerance * Math.abs(expected[i])) {
        matchCount++;
      }
    }
  }

  const avgError = totalError / minLen;

  return {
    valid: maxError <= tolerance * 100,
    maxError,
    avgError,
    matchCount,
    totalCount: minLen,
  };
}

/**
 * Compare RSI implementations
 */
export function compareRSIImplementations(
  closes: number[],
  period: number = 14
): {
  calculator: (number | null)[];
  strategy: number[];
  valid: boolean;
} {
  // Implementation from calculator.ts
  const calculatorRSI: (number | null)[] = new Array(closes.length).fill(null);

  if (closes.length < period + 1) {
    return {
      calculator: calculatorRSI,
      strategy: [],
      valid: true,
    };
  }

  // Calculate changes
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // First RSI uses SMA
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) {
    calculatorRSI[period] = 100;
  } else {
    calculatorRSI[period] = 100 - 100 / (1 + avgGain / avgLoss);
  }

  // Subsequent use EMA smoothing
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      calculatorRSI[i + 1] = 100;
    } else {
      calculatorRSI[i + 1] = 100 - 100 / (1 + avgGain / avgLoss);
    }
  }

  // Compare with strategy implementation
  const strategyRSI: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  for (let i = 0; i < period; i++) {
    strategyRSI.push(NaN as unknown as number);
  }

  let sAvgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let sAvgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  if (sAvgLoss === 0) {
    strategyRSI.push(100);
  } else {
    strategyRSI.push(100 - 100 / (1 + sAvgGain / sAvgLoss));
  }

  for (let i = period; i < gains.length; i++) {
    sAvgGain = (sAvgGain * (period - 1) + gains[i]) / period;
    sAvgLoss = (sAvgLoss * (period - 1) + losses[i]) / period;

    if (sAvgLoss === 0) {
      strategyRSI.push(100);
    } else {
      strategyRSI.push(100 - 100 / (1 + sAvgGain / sAvgLoss));
    }
  }

  // Compare
  const calcValues = calculatorRSI.filter(v => v !== null) as number[];
  const stratValues = strategyRSI.filter(v => !isNaN(v));

  const validation = validateIndicator(calcValues, stratValues);

  return {
    calculator: calculatorRSI,
    strategy: strategyRSI,
    valid: validation.valid,
  };
}
