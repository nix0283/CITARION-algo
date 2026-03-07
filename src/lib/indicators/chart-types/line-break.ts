/**
 * Three Line Break Chart Implementation
 *
 * Three Line Break charts are time-independent charts that filter
 * out noise and focus on trend direction. A new line is added when
 * price exceeds the high/low of the previous 3 lines.
 *
 * Rules:
 * - White/Green line: Price exceeds the high of previous 3 lines
 * - Black/Red line: Price falls below the low of previous 3 lines
 * - No time component - only price movement matters
 *
 * References:
 * - https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-types/three-line-break-charts
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "../calculator";

// ==================== TYPES ====================

export interface LineBreakConfig {
  lineCount: number;  // Number of lines to break (default: 3)
}

export interface LineBreakBar {
  time: Time;
  open: number;
  close: number;
  direction: 'bullish' | 'bearish';
}

// ==================== MAIN CALCULATION ====================

/**
 * Calculate Three Line Break from candles
 */
export function calculateLineBreak(
  candles: Candle[],
  config: Partial<LineBreakConfig> = {}
): IndicatorResult {
  const lineCount = config.lineCount ?? 3;

  const openValues: (number | null)[] = new Array(candles.length).fill(null);
  const closeValues: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length === 0) {
    return {
      id: 'line_break',
      overlay: true,
      lines: [],
      histograms: [],
    };
  }

  // Track the last N lines
  const lines: LineBreakBar[] = [];

  // Initialize with first candle
  let currentOpen = candles[0].close;
  let currentClose = candles[0].close;

  lines.push({
    time: candles[0].time,
    open: currentOpen,
    close: currentClose,
    direction: 'bullish',
  });

  openValues[0] = currentOpen;
  closeValues[0] = currentClose;

  for (let i = 1; i < candles.length; i++) {
    const close = candles[i].close;

    if (lines.length < lineCount) {
      // Still building initial lines
      const lastLine = lines[lines.length - 1];

      if (lastLine.direction === 'bullish') {
        if (close > lastLine.close) {
          // Continue bullish
          currentOpen = lastLine.close;
          currentClose = close;
          lines.push({
            time: candles[i].time,
            open: currentOpen,
            close: currentClose,
            direction: 'bullish',
          });
        } else if (close < lastLine.open) {
          // Reversal
          currentOpen = lastLine.open;
          currentClose = close;
          lines.push({
            time: candles[i].time,
            open: currentOpen,
            close: currentClose,
            direction: 'bearish',
          });
        }
      } else {
        if (close < lastLine.close) {
          // Continue bearish
          currentOpen = lastLine.close;
          currentClose = close;
          lines.push({
            time: candles[i].time,
            open: currentOpen,
            close: currentClose,
            direction: 'bearish',
          });
        } else if (close > lastLine.open) {
          // Reversal
          currentOpen = lastLine.open;
          currentClose = close;
          lines.push({
            time: candles[i].time,
            open: currentOpen,
            close: currentClose,
            direction: 'bullish',
          });
        }
      }
    } else {
      // Standard 3-line break logic
      const lastLine = lines[lines.length - 1];

      // Get the low/high of the last N lines
      const recentLines = lines.slice(-lineCount);
      const lowestLow = Math.min(...recentLines.map(l => Math.min(l.open, l.close)));
      const highestHigh = Math.max(...recentLines.map(l => Math.max(l.open, l.close)));

      if (lastLine.direction === 'bullish') {
        if (close > lastLine.close) {
          // Continue bullish
          currentOpen = lastLine.close;
          currentClose = close;
          lines.push({
            time: candles[i].time,
            open: currentOpen,
            close: currentClose,
            direction: 'bullish',
          });
        } else if (close < lowestLow) {
          // Reversal - price breaks below the low of last N lines
          currentOpen = highestHigh;
          currentClose = close;
          lines.push({
            time: candles[i].time,
            open: currentOpen,
            close: currentClose,
            direction: 'bearish',
          });
        }
      } else {
        if (close < lastLine.close) {
          // Continue bearish
          currentOpen = lastLine.close;
          currentClose = close;
          lines.push({
            time: candles[i].time,
            open: currentOpen,
            close: currentClose,
            direction: 'bearish',
          });
        } else if (close > highestHigh) {
          // Reversal - price breaks above the high of last N lines
          currentOpen = lowestLow;
          currentClose = close;
          lines.push({
            time: candles[i].time,
            open: currentOpen,
            close: currentClose,
            direction: 'bullish',
          });
        }
      }
    }

    const lastAddedLine = lines[lines.length - 1];
    openValues[i] = lastAddedLine.open;
    closeValues[i] = lastAddedLine.close;
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
    id: 'line_break',
    overlay: true,
    lines: [
      { name: 'lb_open', data: buildLineData(openValues), color: '#2962FF' },
      { name: 'lb_close', data: buildLineData(closeValues), color: '#FF6D00' },
    ],
    histograms: [],
  };
}

/**
 * Get Three Line Break bars
 */
export function getLineBreakBars(
  candles: Candle[],
  config: Partial<LineBreakConfig> = {}
): LineBreakBar[] {
  const lineCount = config.lineCount ?? 3;

  if (candles.length === 0) return [];

  const lines: LineBreakBar[] = [];
  let currentOpen = candles[0].close;
  let currentClose = candles[0].close;

  lines.push({
    time: candles[0].time,
    open: currentOpen,
    close: currentClose,
    direction: 'bullish',
  });

  for (let i = 1; i < candles.length; i++) {
    const close = candles[i].close;

    if (lines.length < lineCount) {
      const lastLine = lines[lines.length - 1];

      if (lastLine.direction === 'bullish') {
        if (close > lastLine.close) {
          lines.push({
            time: candles[i].time,
            open: lastLine.close,
            close: close,
            direction: 'bullish',
          });
        } else if (close < lastLine.open) {
          lines.push({
            time: candles[i].time,
            open: lastLine.open,
            close: close,
            direction: 'bearish',
          });
        }
      } else {
        if (close < lastLine.close) {
          lines.push({
            time: candles[i].time,
            open: lastLine.close,
            close: close,
            direction: 'bearish',
          });
        } else if (close > lastLine.open) {
          lines.push({
            time: candles[i].time,
            open: lastLine.open,
            close: close,
            direction: 'bullish',
          });
        }
      }
    } else {
      const lastLine = lines[lines.length - 1];
      const recentLines = lines.slice(-lineCount);
      const lowestLow = Math.min(...recentLines.map(l => Math.min(l.open, l.close)));
      const highestHigh = Math.max(...recentLines.map(l => Math.max(l.open, l.close)));

      if (lastLine.direction === 'bullish') {
        if (close > lastLine.close) {
          lines.push({
            time: candles[i].time,
            open: lastLine.close,
            close: close,
            direction: 'bullish',
          });
        } else if (close < lowestLow) {
          lines.push({
            time: candles[i].time,
            open: highestHigh,
            close: close,
            direction: 'bearish',
          });
        }
      } else {
        if (close < lastLine.close) {
          lines.push({
            time: candles[i].time,
            open: lastLine.close,
            close: close,
            direction: 'bearish',
          });
        } else if (close > highestHigh) {
          lines.push({
            time: candles[i].time,
            open: lowestLow,
            close: close,
            direction: 'bullish',
          });
        }
      }
    }
  }

  return lines;
}

export default {
  calculateLineBreak,
  getLineBreakBars,
};
