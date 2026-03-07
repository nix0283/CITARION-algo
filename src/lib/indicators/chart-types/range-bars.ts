/**
 * Range Bars Chart Implementation
 *
 * Range Bars are price-based (not time-based) charts where each bar
 * represents a specific price range. A new bar is created only when
 * price moves by the specified range amount.
 *
 * Features:
 * - Each bar has the same range (high - low)
 * - No time component - purely price-based
 * - Filters out noise and focuses on significant moves
 *
 * References:
 * - https://github.com/Quantower/QuantowerKB/blob/master/analytics-panels/chart/chart-types/range-bars.md
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "../calculator";

// ==================== TYPES ====================

export interface RangeBarsConfig {
  rangeSize: number;     // Fixed range size (0 = use ATR)
  useATR: boolean;       // Use ATR for range size
  atrPeriod: number;     // ATR period
}

export interface RangeBar {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: 'bullish' | 'bearish';
  barNumber: number;
}

// ==================== HELPER FUNCTIONS ====================

function calculateATR(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;

  let sum = 0;
  for (let i = 1; i <= period && i < candles.length; i++) {
    const idx = candles.length - i;
    const prevIdx = idx - 1;
    if (prevIdx < 0) continue;

    const tr = Math.max(
      candles[idx].high - candles[idx].low,
      Math.abs(candles[idx].high - candles[prevIdx].close),
      Math.abs(candles[idx].low - candles[prevIdx].close)
    );
    sum += tr;
  }

  return sum / Math.min(period, candles.length - 1);
}

// ==================== MAIN CALCULATION ====================

/**
 * Calculate Range Bars from candles
 */
export function calculateRangeBars(
  candles: Candle[],
  config: Partial<RangeBarsConfig> = {}
): IndicatorResult {
  const useATR = config.useATR ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  let rangeSize = config.rangeSize ?? 0;

  // Determine range size
  if (useATR || rangeSize === 0) {
    rangeSize = calculateATR(candles, atrPeriod);
    if (rangeSize === 0) {
      rangeSize = (candles[candles.length - 1]?.close ?? 100) * 0.01;
    }
  }

  const openValues: (number | null)[] = new Array(candles.length).fill(null);
  const closeValues: (number | null)[] = new Array(candles.length).fill(null);
  const highValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowValues: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length === 0) {
    return {
      id: 'range_bars',
      overlay: true,
      lines: [],
      histograms: [],
    };
  }

  let barOpen = candles[0].close;
  let barHigh = barOpen;
  let barLow = barOpen;
  let barClose = barOpen;
  let direction: 'bullish' | 'bearish' = 'bullish';

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const high = candle.high;
    const low = candle.low;

    // Update high/low
    barHigh = Math.max(barHigh, high);
    barLow = Math.min(barLow, low);

    // Check if range exceeded
    const currentRange = barHigh - barLow;

    if (currentRange >= rangeSize) {
      // Close current bar and start new one
      if (high > barOpen) {
        // Bullish bar
        barClose = barHigh;
        direction = 'bullish';
        barLow = barHigh - rangeSize;
      } else {
        // Bearish bar
        barClose = barLow;
        direction = 'bearish';
        barHigh = barLow + rangeSize;
      }

      openValues[i] = barOpen;
      closeValues[i] = barClose;
      highValues[i] = barHigh;
      lowValues[i] = barLow;

      // Start new bar
      barOpen = barClose;
      barHigh = barOpen;
      barLow = barOpen;
    } else {
      // Continue current bar
      openValues[i] = barOpen;
      closeValues[i] = candle.close;
      highValues[i] = barHigh;
      lowValues[i] = barLow;
    }
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
    id: 'range_bars',
    overlay: true,
    lines: [
      { name: 'range_open', data: buildLineData(openValues), color: '#2962FF' },
      { name: 'range_close', data: buildLineData(closeValues), color: '#FF6D00' },
      { name: 'range_high', data: buildLineData(highValues), color: '#26A69A' },
      { name: 'range_low', data: buildLineData(lowValues), color: '#EF5350' },
    ],
    histograms: [],
  };
}

/**
 * Get Range Bars with full bar information
 */
export function getRangeBars(
  candles: Candle[],
  config: Partial<RangeBarsConfig> = {}
): RangeBar[] {
  const bars: RangeBar[] = [];
  const useATR = config.useATR ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  let rangeSize = config.rangeSize ?? 0;

  if (useATR || rangeSize === 0) {
    rangeSize = calculateATR(candles, atrPeriod);
    if (rangeSize === 0) {
      rangeSize = (candles[candles.length - 1]?.close ?? 100) * 0.01;
    }
  }

  if (candles.length === 0) return bars;

  let barOpen = candles[0].close;
  let barHigh = barOpen;
  let barLow = barOpen;
  let barNumber = 1;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    barHigh = Math.max(barHigh, candle.high);
    barLow = Math.min(barLow, candle.low);

    const currentRange = barHigh - barLow;

    if (currentRange >= rangeSize) {
      const direction = candle.close > barOpen ? 'bullish' : 'bearish';
      const barClose = direction === 'bullish' ? barHigh : barLow;

      bars.push({
        time: candle.time,
        open: barOpen,
        high: barHigh,
        low: barLow,
        close: barClose,
        direction,
        barNumber,
      });

      barNumber++;
      barOpen = barClose;
      barHigh = barOpen;
      barLow = barOpen;
    }
  }

  return bars;
}

export default {
  calculateRangeBars,
  getRangeBars,
};
