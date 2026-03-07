/**
 * Heikin-Ashi Indicator
 * Ported from Ta4j (https://github.com/ta4j/ta4j)
 *
 * Heikin-Ashi means "average bar" in Japanese. It's a modified candlestick chart
 * that uses averaged values to smooth out price action and make trends easier to identify.
 *
 * Formula:
 * - HA Close = (Open + High + Low + Close) / 4
 * - HA Open = (Previous HA Open + Previous HA Close) / 2
 * - HA High = Max(High, HA Open, HA Close)
 * - HA Low = Min(Low, HA Open, HA Close)
 *
 * Usage:
 * - Hollow/Green candles: Uptrend
 * - Filled/Red candles: Downtrend
 * - Small bodies with long wicks: Consolidation
 * - No lower wicks: Strong uptrend
 * - No upper wicks: Strong downtrend
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

export interface HeikinAshiCandle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  trend: 'bullish' | 'bearish';
  bodySize: number;      // Absolute body size
  upperWick: number;     // Upper shadow
  lowerWick: number;     // Lower shadow
  strength: 'strong' | 'moderate' | 'weak';  // Trend strength
}

export interface HeikinAshiConfig {
  /** Placeholder for future configuration options */
  _placeholder?: never;
}

// ==================== MAIN CALCULATION ====================

/**
 * Calculate Heikin-Ashi candles
 */
export function calculateHeikinAshi(
  candles: Candle[],
  _config: Partial<HeikinAshiConfig> = {}
): IndicatorResult {
  const haOpenValues: (number | null)[] = new Array(candles.length).fill(null);
  const haCloseValues: (number | null)[] = new Array(candles.length).fill(null);
  const haHighValues: (number | null)[] = new Array(candles.length).fill(null);
  const haLowValues: (number | null)[] = new Array(candles.length).fill(null);

  let prevHAOpen: number | null = null;
  let prevHAClose: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // HA Close = (Open + High + Low + Close) / 4
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
    haCloseValues[i] = haClose;

    // HA Open = (Previous HA Open + Previous HA Close) / 2
    let haOpen: number;
    if (prevHAOpen === null || prevHAClose === null) {
      haOpen = (candle.open + candle.close) / 2;
    } else {
      haOpen = (prevHAOpen + prevHAClose) / 2;
    }
    haOpenValues[i] = haOpen;

    // HA High = Max(High, HA Open, HA Close)
    const haHigh = Math.max(candle.high, haOpen, haClose);
    haHighValues[i] = haHigh;

    // HA Low = Min(Low, HA Open, HA Close)
    const haLow = Math.min(candle.low, haOpen, haClose);
    haLowValues[i] = haLow;

    prevHAOpen = haOpen;
    prevHAClose = haClose;
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
    id: 'heikin_ashi',
    overlay: true,
    lines: [
      { name: 'ha_open', data: buildLineData(haOpenValues), color: '#2962FF' },
      { name: 'ha_close', data: buildLineData(haCloseValues), color: '#2962FF' },
      { name: 'ha_high', data: buildLineData(haHighValues), color: '#26A69A' },
      { name: 'ha_low', data: buildLineData(haLowValues), color: '#EF5350' },
    ],
    histograms: [],
  };
}

/**
 * Calculate full Heikin-Ashi candles with trend analysis
 */
export function calculateHeikinAshiCandles(
  candles: Candle[],
  _config: Partial<HeikinAshiConfig> = {}
): HeikinAshiCandle[] {
  const result: HeikinAshiCandle[] = [];

  let prevHAOpen: number | null = null;
  let prevHAClose: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // HA calculations
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;

    let haOpen: number;
    if (prevHAOpen === null || prevHAClose === null) {
      haOpen = (candle.open + candle.close) / 2;
    } else {
      haOpen = (prevHAOpen + prevHAClose) / 2;
    }

    const haHigh = Math.max(candle.high, haOpen, haClose);
    const haLow = Math.min(candle.low, haOpen, haClose);

    // Trend analysis
    const trend = haClose > haOpen ? 'bullish' : 'bearish';
    const bodySize = Math.abs(haClose - haOpen);
    const upperWick = haHigh - Math.max(haOpen, haClose);
    const lowerWick = Math.min(haOpen, haClose) - haLow;

    // Determine strength
    let strength: 'strong' | 'moderate' | 'weak';
    const totalRange = haHigh - haLow;
    if (totalRange === 0) {
      strength = 'weak';
    } else {
      const bodyRatio = bodySize / totalRange;
      if (bodyRatio > 0.7) {
        strength = 'strong';
      } else if (bodyRatio > 0.4) {
        strength = 'moderate';
      } else {
        strength = 'weak';
      }
    }

    result.push({
      time: candle.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      trend,
      bodySize,
      upperWick,
      lowerWick,
      strength,
    });

    prevHAOpen = haOpen;
    prevHAClose = haClose;
  }

  return result;
}

/**
 * Detect Heikin-Ashi trend changes
 */
export function detectHeikinAshiSignals(
  candles: Candle[]
): Array<{
  time: Time;
  type: 'buy' | 'sell';
  reason: string;
}> {
  const haCandles = calculateHeikinAshiCandles(candles);
  const signals: Array<{
    time: Time;
    type: 'buy' | 'sell';
    reason: string;
  }> = [];

  for (let i = 1; i < haCandles.length; i++) {
    const current = haCandles[i];
    const previous = haCandles[i - 1];

    // Trend change detection
    if (previous.trend === 'bearish' && current.trend === 'bullish') {
      signals.push({
        time: current.time,
        type: 'buy',
        reason: current.strength === 'strong'
          ? 'Strong bullish HA candle - trend reversal'
          : 'Bullish HA candle - potential trend change',
      });
    } else if (previous.trend === 'bullish' && current.trend === 'bearish') {
      signals.push({
        time: current.time,
        type: 'sell',
        reason: current.strength === 'strong'
          ? 'Strong bearish HA candle - trend reversal'
          : 'Bearish HA candle - potential trend change',
      });
    }

    // Strong trend continuation signal
    if (current.strength === 'strong') {
      if (current.trend === 'bullish' && current.lowerWick === 0) {
        // No lower wick in strong bullish = very strong uptrend
        signals.push({
          time: current.time,
          type: 'buy',
          reason: 'Strong bullish HA with no lower wick - strong uptrend',
        });
      } else if (current.trend === 'bearish' && current.upperWick === 0) {
        // No upper wick in strong bearish = very strong downtrend
        signals.push({
          time: current.time,
          type: 'sell',
          reason: 'Strong bearish HA with no upper wick - strong downtrend',
        });
      }
    }

    // Doji-like HA candle (indecision)
    if (current.strength === 'weak' && previous.strength !== 'weak') {
      signals.push({
        time: current.time,
        type: previous.trend === 'bullish' ? 'sell' : 'buy',
        reason: 'Small HA body - potential trend exhaustion',
      });
    }
  }

  return signals;
}

/**
 * Analyze Heikin-Ashi pattern
 */
export function analyzeHeikinAshiPattern(
  haCandle: HeikinAshiCandle
): {
  pattern: string;
  description: string;
  bias: 'bullish' | 'bearish' | 'neutral';
} {
  const { trend, strength, upperWick, lowerWick, bodySize } = haCandle;
  const totalWick = upperWick + lowerWick;

  // Strong trend patterns
  if (strength === 'strong') {
    if (trend === 'bullish' && lowerWick === 0) {
      return {
        pattern: 'Strong Bullish',
        description: 'No lower wick - strong buying pressure, uptrend continuation',
        bias: 'bullish',
      };
    }
    if (trend === 'bearish' && upperWick === 0) {
      return {
        pattern: 'Strong Bearish',
        description: 'No upper wick - strong selling pressure, downtrend continuation',
        bias: 'bearish',
      };
    }
    return {
      pattern: trend === 'bullish' ? 'Bullish Body' : 'Bearish Body',
      description: `Large ${trend} body - trend continuation`,
      bias: trend,
    };
  }

  // Indecision patterns
  if (strength === 'weak') {
    if (bodySize === 0 || totalWick > bodySize * 3) {
      return {
        pattern: 'HA Doji',
        description: 'Small body with long wicks - indecision, potential reversal',
        bias: 'neutral',
      };
    }
    return {
      pattern: 'HA Spinning Top',
      description: 'Small body - consolidation, trend may change',
      bias: 'neutral',
    };
  }

  // Moderate patterns
  return {
    pattern: trend === 'bullish' ? 'Moderate Bullish' : 'Moderate Bearish',
    description: `Moderate ${trend} body - trend continuation likely`,
    bias: trend,
  };
}
