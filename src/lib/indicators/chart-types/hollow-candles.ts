/**
 * Hollow Candlesticks Chart Implementation
 *
 * Hollow Candlesticks are a variation of traditional candlesticks where
 * the fill pattern depends on the relationship between current open/close
 * AND the previous close, not just the current candle's open/close.
 *
 * Rules:
 * - Hollow (empty): Close > Open (bullish movement)
 * - Filled (solid): Close < Open (bearish movement)
 * - Green color: Close > Previous Close
 * - Red color: Close < Previous Close
 *
 * This creates 4 combinations:
 * 1. Hollow Green: Close > Open AND Close > PrevClose (strong bullish)
 * 2. Filled Green: Close < Open AND Close > PrevClose (bearish candle, but higher than prev)
 * 3. Hollow Red: Close > Open AND Close < PrevClose (bullish candle, but lower than prev)
 * 4. Filled Red: Close < Open AND Close < PrevClose (strong bearish)
 *
 * References:
 * - https://www.highcharts.com/blog/tutorials/how-to-read-hollow-candlesticks
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "../calculator";

// ==================== TYPES ====================

export interface HollowCandle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  style: 'hollow_green' | 'filled_green' | 'hollow_red' | 'filled_red';
  direction: 'bullish' | 'bearish';
  strength: 'strong' | 'weak';
}

// ==================== MAIN CALCULATION ====================

/**
 * Calculate Hollow Candlesticks
 */
export function calculateHollowCandles(
  candles: Candle[]
): IndicatorResult {
  const openValues: (number | null)[] = new Array(candles.length).fill(null);
  const closeValues: (number | null)[] = new Array(candles.length).fill(null);
  const highValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowValues: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length === 0) {
    return {
      id: 'hollow_candles',
      overlay: true,
      lines: [],
      histograms: [],
    };
  }

  for (let i = 0; i < candles.length; i++) {
    openValues[i] = candles[i].open;
    closeValues[i] = candles[i].close;
    highValues[i] = candles[i].high;
    lowValues[i] = candles[i].low;
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
    id: 'hollow_candles',
    overlay: true,
    lines: [
      { name: 'hc_open', data: buildLineData(openValues), color: '#2962FF' },
      { name: 'hc_close', data: buildLineData(closeValues), color: '#FF6D00' },
      { name: 'hc_high', data: buildLineData(highValues), color: '#26A69A' },
      { name: 'hc_low', data: buildLineData(lowValues), color: '#EF5350' },
    ],
    histograms: [],
  };
}

/**
 * Get Hollow Candlesticks with style information
 */
export function getHollowCandles(candles: Candle[]): HollowCandle[] {
  const result: HollowCandle[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : candle.open;

    const isHollow = candle.close > candle.open;
    const isGreen = candle.close > prevClose;

    let style: HollowCandle['style'];
    let direction: 'bullish' | 'bearish';
    let strength: 'strong' | 'weak';

    if (isHollow && isGreen) {
      style = 'hollow_green';
      direction = 'bullish';
      strength = 'strong';
    } else if (isHollow && !isGreen) {
      style = 'hollow_red';
      direction = 'bullish';
      strength = 'weak';
    } else if (!isHollow && isGreen) {
      style = 'filled_green';
      direction = 'bearish';
      strength = 'weak';
    } else {
      style = 'filled_red';
      direction = 'bearish';
      strength = 'strong';
    }

    result.push({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      style,
      direction,
      strength,
    });
  }

  return result;
}

/**
 * Analyze Hollow Candlestick patterns
 */
export function analyzeHollowCandlePattern(candles: Candle[]): {
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  pattern: string;
} {
  if (candles.length < 3) {
    return { trend: 'neutral', strength: 0, pattern: 'Insufficient data' };
  }

  const hollowCandles = getHollowCandles(candles);
  const recent = hollowCandles.slice(-5);

  let bullishCount = 0;
  let bearishCount = 0;
  let strongBullish = 0;
  let strongBearish = 0;

  for (const hc of recent) {
    if (hc.direction === 'bullish') {
      bullishCount++;
      if (hc.strength === 'strong') strongBullish++;
    } else {
      bearishCount++;
      if (hc.strength === 'strong') strongBearish++;
    }
  }

  const trend = bullishCount > bearishCount ? 'bullish'
    : bearishCount > bullishCount ? 'bearish'
    : 'neutral';

  const strength = trend === 'bullish'
    ? (strongBullish / recent.length) * 100
    : trend === 'bearish'
    ? (strongBearish / recent.length) * 100
    : 0;

  let pattern = '';
  if (trend === 'bullish' && strength > 60) {
    pattern = 'Strong bullish trend - hollow green candles dominant';
  } else if (trend === 'bearish' && strength > 60) {
    pattern = 'Strong bearish trend - filled red candles dominant';
  } else if (trend === 'bullish') {
    pattern = 'Weak bullish trend - mixed signals';
  } else if (trend === 'bearish') {
    pattern = 'Weak bearish trend - mixed signals';
  } else {
    pattern = 'Consolidation - no clear trend';
  }

  return { trend, strength, pattern };
}

export default {
  calculateHollowCandles,
  getHollowCandles,
  analyzeHollowCandlePattern,
};
