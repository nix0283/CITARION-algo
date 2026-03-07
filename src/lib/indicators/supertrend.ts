/**
 * SuperTrend Indicator
 * Ported from Ta4j (https://github.com/ta4j/ta4j)
 *
 * SuperTrend is a trend-following indicator that uses ATR (Average True Range)
 * to determine the current trend direction and provide support/resistance levels.
 *
 * Formula:
 * - Basic Upper Band = (High + Low) / 2 + (Multiplier × ATR)
 * - Basic Lower Band = (High + Low) / 2 - (Multiplier × ATR)
 * - Final Upper Band = Basic Upper if Basic Upper < Previous Final Upper OR Close > Previous Final Upper
 * - Final Lower Band = Basic Lower if Basic Lower > Previous Final Lower OR Close < Previous Final Lower
 * - SuperTrend = Final Upper Band if Close <= Final Upper, else Final Lower Band
 *
 * Usage:
 * - Price above SuperTrend: Uptrend (Bullish)
 * - Price below SuperTrend: Downtrend (Bearish)
 * - SuperTrend line acts as dynamic support/resistance
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

export interface SuperTrendConfig {
  period: number;      // ATR period (default: 10)
  multiplier: number;  // ATR multiplier (default: 3.0)
}

export interface SuperTrendPoint {
  time: Time;
  value: number;        // SuperTrend value
  trend: 'bullish' | 'bearish';
  upperBand: number;
  lowerBand: number;
}

export interface SuperTrendSignal {
  time: Time;
  type: 'buy' | 'sell';
  price: number;
  superTrendValue: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate True Range
 */
function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
}

/**
 * Calculate ATR using Wilder's smoothing
 */
function calculateATR(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length < period) return result;

  // Calculate TR values
  const trValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trValues.push(candles[i].high - candles[i].low);
    } else {
      trValues.push(trueRange(
        candles[i].high,
        candles[i].low,
        candles[i - 1].close
      ));
    }
  }

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

// ==================== MAIN CALCULATION ====================

/**
 * Calculate SuperTrend indicator
 */
export function calculateSuperTrend(
  candles: Candle[],
  config: Partial<SuperTrendConfig> = {}
): IndicatorResult {
  const period = config.period ?? 10;
  const multiplier = config.multiplier ?? 3.0;

  const atrValues = calculateATR(candles, period);

  const superTrendValues: (number | null)[] = new Array(candles.length).fill(null);
  const upperBandValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowerBandValues: (number | null)[] = new Array(candles.length).fill(null);
  const trendValues: ('bullish' | 'bearish' | null)[] = new Array(candles.length).fill(null);

  // Previous values for calculation
  let prevFinalUpper: number | null = null;
  let prevFinalLower: number | null = null;
  let prevTrend: 'bullish' | 'bearish' = 'bullish';

  for (let i = 0; i < candles.length; i++) {
    const atr = atrValues[i];

    if (atr === null) {
      continue;
    }

    const candle = candles[i];
    const hl2 = (candle.high + candle.low) / 2;

    // Basic bands
    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    // Final bands calculation
    let finalUpper: number;
    let finalLower: number;

    if (prevFinalUpper === null || prevFinalLower === null) {
      // First calculation
      finalUpper = basicUpper;
      finalLower = basicLower;
    } else {
      // Final Upper Band
      if (basicUpper < prevFinalUpper || candle.close > prevFinalUpper) {
        finalUpper = basicUpper;
      } else {
        finalUpper = prevFinalUpper;
      }

      // Final Lower Band
      if (basicLower > prevFinalLower || candle.close < prevFinalLower) {
        finalLower = basicLower;
      } else {
        finalLower = prevFinalLower;
      }
    }

    // Determine SuperTrend value and trend
    let superTrend: number;
    let trend: 'bullish' | 'bearish';

    if (prevFinalUpper === null || prevFinalLower === null) {
      // Initial trend based on close position
      if (candle.close <= finalUpper) {
        superTrend = finalUpper;
        trend = 'bearish';
      } else {
        superTrend = finalLower;
        trend = 'bullish';
      }
    } else {
      if (prevTrend === 'bullish') {
        if (candle.close < finalLower) {
          superTrend = finalUpper;
          trend = 'bearish';
        } else {
          superTrend = finalLower;
          trend = 'bullish';
        }
      } else {
        if (candle.close > finalUpper) {
          superTrend = finalLower;
          trend = 'bullish';
        } else {
          superTrend = finalUpper;
          trend = 'bearish';
        }
      }
    }

    superTrendValues[i] = superTrend;
    upperBandValues[i] = finalUpper;
    lowerBandValues[i] = finalLower;
    trendValues[i] = trend;

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
    prevTrend = trend;
  }

  // Build line data
  const buildLineData = (
    values: (number | null)[]
  ): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = values[i];
      if (value !== null && !isNaN(value) && isFinite(value)) {
        return { time: c.time, value };
      }
      return { time: c.time };
    });
  };

  return {
    id: 'supertrend',
    overlay: true,
    lines: [
      { name: 'supertrend', data: buildLineData(superTrendValues), color: '#2962FF' },
      { name: 'upperBand', data: buildLineData(upperBandValues), color: '#EF5350' },
      { name: 'lowerBand', data: buildLineData(lowerBandValues), color: '#26A69A' },
    ],
    histograms: [],
  };
}

/**
 * Detect SuperTrend signals (trend changes)
 */
export function detectSuperTrendSignals(
  candles: Candle[],
  config: Partial<SuperTrendConfig> = {}
): SuperTrendSignal[] {
  const period = config.period ?? 10;
  const multiplier = config.multiplier ?? 3.0;
  const signals: SuperTrendSignal[] = [];

  const atrValues = calculateATR(candles, period);

  let prevFinalUpper: number | null = null;
  let prevFinalLower: number | null = null;
  let prevTrend: 'bullish' | 'bearish' | null = null;

  for (let i = 0; i < candles.length; i++) {
    const atr = atrValues[i];
    if (atr === null) continue;

    const candle = candles[i];
    const hl2 = (candle.high + candle.low) / 2;

    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    let finalUpper: number;
    let finalLower: number;

    if (prevFinalUpper === null || prevFinalLower === null) {
      finalUpper = basicUpper;
      finalLower = basicLower;
    } else {
      finalUpper = (basicUpper < prevFinalUpper || candle.close > prevFinalUpper)
        ? basicUpper : prevFinalUpper;
      finalLower = (basicLower > prevFinalLower || candle.close < prevFinalLower)
        ? basicLower : prevFinalLower;
    }

    let trend: 'bullish' | 'bearish';

    if (prevFinalUpper === null || prevFinalLower === null) {
      trend = candle.close <= finalUpper ? 'bearish' : 'bullish';
    } else if (prevTrend === 'bullish') {
      trend = candle.close < finalLower ? 'bearish' : 'bullish';
    } else {
      trend = candle.close > finalUpper ? 'bullish' : 'bearish';
    }

    // Detect trend change
    if (prevTrend !== null && trend !== prevTrend) {
      signals.push({
        time: candle.time,
        type: trend === 'bullish' ? 'buy' : 'sell',
        price: candle.close,
        superTrendValue: trend === 'bullish' ? finalLower : finalUpper,
      });
    }

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
    prevTrend = trend;
  }

  return signals;
}

/**
 * Get SuperTrend analysis for current bar
 */
export function analyzeSuperTrend(
  candles: Candle[],
  config: Partial<SuperTrendConfig> = {}
): {
  trend: 'bullish' | 'bearish' | null;
  superTrendValue: number | null;
  distance: number | null;
  strength: number | null;
} {
  const period = config.period ?? 10;
  const multiplier = config.multiplier ?? 3.0;

  const atrValues = calculateATR(candles, period);
  const lastIndex = candles.length - 1;
  const atr = atrValues[lastIndex];

  if (atr === null) {
    return { trend: null, superTrendValue: null, distance: null, strength: null };
  }

  const result = calculateSuperTrend(candles, config);
  const superTrendLine = result.lines[0].data[lastIndex];
  const trendLine = result.lines.find(l => l.name === 'supertrend');

  if (!('value' in superTrendLine)) {
    return { trend: null, superTrendValue: null, distance: null, strength: null };
  }

  const candle = candles[lastIndex];
  const trend = candle.close > superTrendLine.value ? 'bullish' : 'bearish';
  const distance = ((candle.close - superTrendLine.value) / superTrendLine.value) * 100;

  // Strength based on distance as percentage of ATR
  const strength = Math.abs(distance) / (atr / candle.close * 100);

  return {
    trend,
    superTrendValue: superTrendLine.value,
    distance,
    strength,
  };
}
