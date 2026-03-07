/**
 * Point & Figure Chart Implementation
 *
 * Point & Figure (P&F) charts are time-independent charts that filter
 * out noise and focus on significant price movements. They use X's
 * for rising prices and O's for falling prices.
 *
 * Features:
 * - X columns: Rising prices
 * - O columns: Falling prices
 * - Box size: Minimum price movement
 * - Reversal: Number of boxes to change direction (usually 3)
 *
 * References:
 * - https://www.tradingview.com/support/solutions/43000502276
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "../calculator";

// ==================== TYPES ====================

export interface PointFigureConfig {
  boxSize: number;       // Size of each box (0 = use ATR)
  reversal: number;      // Number of boxes for reversal (default: 3)
  useATR: boolean;       // Use ATR for box size
  atrPeriod: number;     // ATR period
}

export interface PFColumn {
  time: Time;
  type: 'X' | 'O';
  price: number;
  boxes: number;
  columnNumber: number;
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

function roundToBox(price: number, boxSize: number, direction: 'up' | 'down'): number {
  const boxes = direction === 'up'
    ? Math.floor(price / boxSize)
    : Math.ceil(price / boxSize);
  return boxes * boxSize;
}

// ==================== MAIN CALCULATION ====================

/**
 * Calculate Point & Figure from candles
 */
export function calculatePointFigure(
  candles: Candle[],
  config: Partial<PointFigureConfig> = {}
): IndicatorResult {
  const useATR = config.useATR ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  const reversal = config.reversal ?? 3;
  let boxSize = config.boxSize ?? 0;

  // Determine box size
  if (useATR || boxSize === 0) {
    boxSize = calculateATR(candles, atrPeriod);
    if (boxSize === 0) {
      boxSize = (candles[candles.length - 1]?.close ?? 100) * 0.01;
    }
  }

  const xValues: (number | null)[] = new Array(candles.length).fill(null);
  const oValues: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length === 0) {
    return {
      id: 'point_figure',
      overlay: true,
      lines: [],
      histograms: [],
    };
  }

  let currentType: 'X' | 'O' = 'X';
  let currentPrice = roundToBox(candles[0].close, boxSize, 'up');
  let columnHigh = currentPrice;
  let columnLow = currentPrice;

  for (let i = 0; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    if (currentType === 'X') {
      // Currently in X column (rising)
      const newHigh = roundToBox(high, boxSize, 'up');

      if (newHigh > columnHigh) {
        // Continue X column
        columnHigh = newHigh;
        currentPrice = newHigh;
        xValues[i] = newHigh;
        oValues[i] = null;
      } else {
        // Check for reversal to O
        const boxesDown = (columnHigh - roundToBox(low, boxSize, 'down')) / boxSize;

        if (boxesDown >= reversal) {
          // Reversal to O
          currentType = 'O';
          columnLow = roundToBox(low, boxSize, 'down');
          currentPrice = columnLow;
          oValues[i] = columnLow;
          xValues[i] = null;
        } else {
          xValues[i] = currentPrice;
        }
      }
    } else {
      // Currently in O column (falling)
      const newLow = roundToBox(low, boxSize, 'down');

      if (newLow < columnLow) {
        // Continue O column
        columnLow = newLow;
        currentPrice = newLow;
        oValues[i] = newLow;
        xValues[i] = null;
      } else {
        // Check for reversal to X
        const boxesUp = (roundToBox(high, boxSize, 'up') - columnLow) / boxSize;

        if (boxesUp >= reversal) {
          // Reversal to X
          currentType = 'X';
          columnHigh = roundToBox(high, boxSize, 'up');
          currentPrice = columnHigh;
          xValues[i] = columnHigh;
          oValues[i] = null;
        } else {
          oValues[i] = currentPrice;
        }
      }
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
    id: 'point_figure',
    overlay: true,
    lines: [
      { name: 'x_column', data: buildLineData(xValues), color: '#26A69A' },  // Green for X (up)
      { name: 'o_column', data: buildLineData(oValues), color: '#EF5350' }, // Red for O (down)
    ],
    histograms: [],
  };
}

/**
 * Get Point & Figure columns
 */
export function getPointFigureColumns(
  candles: Candle[],
  config: Partial<PointFigureConfig> = {}
): PFColumn[] {
  const columns: PFColumn[] = [];
  const useATR = config.useATR ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  const reversal = config.reversal ?? 3;
  let boxSize = config.boxSize ?? 0;

  if (useATR || boxSize === 0) {
    boxSize = calculateATR(candles, atrPeriod);
    if (boxSize === 0) {
      boxSize = (candles[candles.length - 1]?.close ?? 100) * 0.01;
    }
  }

  if (candles.length === 0) return columns;

  let currentType: 'X' | 'O' = 'X';
  let columnHigh = roundToBox(candles[0].close, boxSize, 'up');
  let columnLow = columnHigh;
  let columnNumber = 1;

  for (let i = 0; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;

    if (currentType === 'X') {
      const newHigh = roundToBox(high, boxSize, 'up');

      if (newHigh > columnHigh) {
        columnHigh = newHigh;
      } else {
        const boxesDown = (columnHigh - roundToBox(low, boxSize, 'down')) / boxSize;

        if (boxesDown >= reversal) {
          // Save current X column
          columns.push({
            time: candles[i].time,
            type: 'X',
            price: columnHigh,
            boxes: Math.round((columnHigh - columnLow) / boxSize) + 1,
            columnNumber,
          });

          // Start new O column
          columnNumber++;
          currentType = 'O';
          columnLow = roundToBox(low, boxSize, 'down');
          columnHigh = columnLow;
        }
      }
    } else {
      const newLow = roundToBox(low, boxSize, 'down');

      if (newLow < columnLow) {
        columnLow = newLow;
      } else {
        const boxesUp = (roundToBox(high, boxSize, 'up') - columnLow) / boxSize;

        if (boxesUp >= reversal) {
          // Save current O column
          columns.push({
            time: candles[i].time,
            type: 'O',
            price: columnLow,
            boxes: Math.round((columnHigh - columnLow) / boxSize) + 1,
            columnNumber,
          });

          // Start new X column
          columnNumber++;
          currentType = 'X';
          columnHigh = roundToBox(high, boxSize, 'up');
          columnLow = columnHigh;
        }
      }
    }
  }

  // Add the last column
  if (currentType === 'X') {
    columns.push({
      time: candles[candles.length - 1].time,
      type: 'X',
      price: columnHigh,
      boxes: Math.round((columnHigh - columnLow) / boxSize) + 1,
      columnNumber,
    });
  } else {
    columns.push({
      time: candles[candles.length - 1].time,
      type: 'O',
      price: columnLow,
      boxes: Math.round((columnHigh - columnLow) / boxSize) + 1,
      columnNumber,
    });
  }

  return columns;
}

export default {
  calculatePointFigure,
  getPointFigureColumns,
};
