/**
 * Renko Indicator
 * Ported from Ta4j (https://github.com/ta4j/ta4j)
 *
 * Renko charts are price-based (not time-based) charts that filter out noise
 * and focus on significant price movements. Each "brick" (or box) is created
 * only when price moves by a specified amount.
 *
 * Types:
 * - Fixed brick size: Constant brick size in price units
 * - ATR-based: Brick size based on ATR (adaptive to volatility)
 *
 * Rules:
 * - Bullish brick: Price moves UP by brick size or more
 * - Bearish brick: Price moves DOWN by brick size or more
 * - New brick in same direction: Price moves 2x brick size
 * - Reversal: Price moves 2x brick size in opposite direction
 *
 * Usage:
 * - Series of same color bricks: Strong trend
 * - Color change: Trend reversal
 * - Small bricks: Consolidation
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

export interface RenkoConfig {
  brickSize: number;     // Fixed brick size (0 = use ATR)
  atrPeriod: number;     // ATR period for adaptive brick size
  useATR: boolean;       // Use ATR-based brick size
}

export interface RenkoBrick {
  time: Time;
  open: number;
  close: number;
  type: 'bullish' | 'bearish';
  brickNumber: number;   // Sequential brick number
}

export interface RenkoSignal {
  time: Time;
  type: 'buy' | 'sell';
  brickNumber: number;
  price: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate ATR for adaptive brick size
 */
function calculateATR(candles: Candle[], period: number): number {
  if (candles.length < period) return 0;

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
 * Calculate Renko bricks from candles
 */
export function calculateRenko(
  candles: Candle[],
  config: Partial<RenkoConfig> = {}
): IndicatorResult {
  const useATR = config.useATR ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  let brickSize = config.brickSize ?? 0;

  // Determine brick size
  if (useATR || brickSize === 0) {
    brickSize = calculateATR(candles, atrPeriod);
    if (brickSize === 0) {
      brickSize = (candles[candles.length - 1]?.close ?? 100) * 0.01; // Default 1%
    }
  }

  const renkoOpenValues: (number | null)[] = new Array(candles.length).fill(null);
  const renkoCloseValues: (number | null)[] = new Array(candles.length).fill(null);

  // Start with first close price
  let currentPrice = candles[0]?.close ?? 0;
  let renkoOpen = currentPrice;
  let renkoClose = currentPrice;
  let currentTrend: 'bullish' | 'bearish' | null = null;

  // Round to nearest brick
  const roundToBrick = (price: number): number => {
    return Math.round(price / brickSize) * brickSize;
  };

  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;

    if (currentTrend === null) {
      // Initialize
      renkoOpen = roundToBrick(currentPrice);
      renkoClose = renkoOpen + brickSize;
      currentTrend = 'bullish';
      renkoOpenValues[i] = renkoOpen;
      renkoCloseValues[i] = renkoClose;
      continue;
    }

    const priceDiff = close - renkoClose;
    const brickDiff = priceDiff / brickSize;

    if (currentTrend === 'bullish') {
      if (brickDiff >= 1) {
        // Continue bullish - add more bricks
        const newBricks = Math.floor(brickDiff);
        renkoOpen = renkoClose;
        renkoClose = renkoOpen + newBricks * brickSize;
      } else if (brickDiff <= -2) {
        // Reversal - switch to bearish
        const newBricks = Math.floor(Math.abs(brickDiff));
        renkoOpen = renkoClose;
        renkoClose = renkoOpen - newBricks * brickSize;
        currentTrend = 'bearish';
      }
    } else {
      if (brickDiff <= -1) {
        // Continue bearish - add more bricks
        const newBricks = Math.floor(Math.abs(brickDiff));
        renkoOpen = renkoClose;
        renkoClose = renkoOpen - newBricks * brickSize;
      } else if (brickDiff >= 2) {
        // Reversal - switch to bullish
        const newBricks = Math.floor(brickDiff);
        renkoOpen = renkoClose;
        renkoClose = renkoOpen + newBricks * brickSize;
        currentTrend = 'bullish';
      }
    }

    renkoOpenValues[i] = renkoOpen;
    renkoCloseValues[i] = renkoClose;
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
    id: 'renko',
    overlay: true,
    lines: [
      { name: 'renko_open', data: buildLineData(renkoOpenValues), color: '#2962FF' },
      { name: 'renko_close', data: buildLineData(renkoCloseValues), color: '#2962FF' },
    ],
    histograms: [],
  };
}

/**
 * Calculate Renko bricks with full brick information
 */
export function calculateRenkoBricks(
  candles: Candle[],
  config: Partial<RenkoConfig> = {}
): RenkoBrick[] {
  const useATR = config.useATR ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  let brickSize = config.brickSize ?? 0;

  if (useATR || brickSize === 0) {
    brickSize = calculateATR(candles, atrPeriod);
    if (brickSize === 0) {
      brickSize = (candles[candles.length - 1]?.close ?? 100) * 0.01;
    }
  }

  const bricks: RenkoBrick[] = [];

  if (candles.length === 0) return bricks;

  // Initialize with first price
  const firstPrice = candles[0].close;
  const roundedPrice = Math.round(firstPrice / brickSize) * brickSize;

  let renkoOpen = roundedPrice;
  let renkoClose = roundedPrice + brickSize;
  let currentTrend: 'bullish' | 'bearish' = 'bullish';
  let brickNumber = 1;

  // Add first brick
  bricks.push({
    time: candles[0].time,
    open: renkoOpen,
    close: renkoClose,
    type: currentTrend,
    brickNumber,
  });

  for (let i = 1; i < candles.length; i++) {
    const close = candles[i].close;
    const priceDiff = close - renkoClose;
    const brickDiff = priceDiff / brickSize;

    let newBricks = 0;

    if (currentTrend === 'bullish') {
      if (brickDiff >= 1) {
        newBricks = Math.floor(brickDiff);
        renkoOpen = renkoClose;
        renkoClose = renkoOpen + newBricks * brickSize;
      } else if (brickDiff <= -2) {
        newBricks = Math.floor(Math.abs(brickDiff));
        renkoOpen = renkoClose;
        renkoClose = renkoOpen - newBricks * brickSize;
        currentTrend = 'bearish';
      }
    } else {
      if (brickDiff <= -1) {
        newBricks = Math.floor(Math.abs(brickDiff));
        renkoOpen = renkoClose;
        renkoClose = renkoOpen - newBricks * brickSize;
      } else if (brickDiff >= 2) {
        newBricks = Math.floor(brickDiff);
        renkoOpen = renkoClose;
        renkoClose = renkoOpen + newBricks * brickSize;
        currentTrend = 'bullish';
      }
    }

    // Add new bricks
    for (let b = 0; b < newBricks; b++) {
      brickNumber++;
      const brickOpen = currentTrend === 'bullish'
        ? renkoClose - (newBricks - b) * brickSize
        : renkoClose + (newBricks - b) * brickSize;
      const brickClose = currentTrend === 'bullish'
        ? brickOpen + brickSize
        : brickOpen - brickSize;

      bricks.push({
        time: candles[i].time,
        open: brickOpen,
        close: brickClose,
        type: currentTrend,
        brickNumber,
      });
    }
  }

  return bricks;
}

/**
 * Detect Renko signals (trend reversals)
 */
export function detectRenkoSignals(
  candles: Candle[],
  config: Partial<RenkoConfig> = {}
): RenkoSignal[] {
  const bricks = calculateRenkoBricks(candles, config);
  const signals: RenkoSignal[] = [];

  for (let i = 1; i < bricks.length; i++) {
    const current = bricks[i];
    const previous = bricks[i - 1];

    if (current.type !== previous.type) {
      signals.push({
        time: current.time,
        type: current.type === 'bullish' ? 'buy' : 'sell',
        brickNumber: current.brickNumber,
        price: current.close,
      });
    }
  }

  return signals;
}

/**
 * Analyze Renko trend
 */
export function analyzeRenkoTrend(
  candles: Candle[],
  config: Partial<RenkoConfig> = {}
): {
  trend: 'bullish' | 'bearish';
  consecutiveBricks: number;
  lastBrickPrice: number;
  reversalDistance: number;
} {
  const bricks = calculateRenkoBricks(candles, config);

  if (bricks.length === 0) {
    return {
      trend: 'bullish',
      consecutiveBricks: 0,
      lastBrickPrice: 0,
      reversalDistance: 0,
    };
  }

  const lastBrick = bricks[bricks.length - 1];
  let consecutiveBricks = 1;

  for (let i = bricks.length - 2; i >= 0; i--) {
    if (bricks[i].type === lastBrick.type) {
      consecutiveBricks++;
    } else {
      break;
    }
  }

  const brickSize = config.brickSize ?? Math.abs(lastBrick.close - lastBrick.open);
  const reversalDistance = brickSize * 2;

  return {
    trend: lastBrick.type,
    consecutiveBricks,
    lastBrickPrice: lastBrick.close,
    reversalDistance,
  };
}
