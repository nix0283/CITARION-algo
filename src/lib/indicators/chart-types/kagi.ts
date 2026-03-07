/**
 * Kagi Chart Implementation
 *
 * Kagi charts are time-independent charts that filter out noise
 * and focus on price movements. They use vertical lines connected
 * by short horizontal lines, changing direction when price moves
 * by a reversal amount.
 *
 * Features:
 * - Green (Yang) lines: Rising prices
 * - Red (Yin) lines: Falling prices
 * - Thick lines: Trend confirmation
 * - Thin lines: Potential reversal
 *
 * References:
 * - https://www.tradingview.com/support/solutions/43000502272
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "../calculator";

// ==================== TYPES ====================

export interface KagiConfig {
  reversalAmount: number;  // Price reversal amount (fixed or ATR-based)
  useATR: boolean;         // Use ATR for reversal amount
  atrPeriod: number;       // ATR period
}

export interface KagiLine {
  time: Time;
  price: number;
  direction: 'up' | 'down';
  thickness: 'thick' | 'thin';
  trend: 'bullish' | 'bearish';
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
 * Calculate Kagi lines from candles
 */
export function calculateKagi(
  candles: Candle[],
  config: Partial<KagiConfig> = {}
): IndicatorResult {
  const useATR = config.useATR ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  let reversalAmount = config.reversalAmount ?? 0;

  // Determine reversal amount
  if (useATR || reversalAmount === 0) {
    reversalAmount = calculateATR(candles, atrPeriod);
    if (reversalAmount === 0) {
      reversalAmount = (candles[candles.length - 1]?.close ?? 100) * 0.01;
    }
  }

  const kagiValues: (number | null)[] = new Array(candles.length).fill(null);
  const directionValues: ('up' | 'down' | null)[] = new Array(candles.length).fill(null);

  if (candles.length === 0) {
    return {
      id: 'kagi',
      overlay: true,
      lines: [],
      histograms: [],
    };
  }

  let currentPrice = candles[0].close;
  let currentDirection: 'up' | 'down' = 'up';
  let lastHigh = currentPrice;
  let lastLow = currentPrice;
  let trend: 'bullish' | 'bearish' = 'bullish';

  kagiValues[0] = currentPrice;
  directionValues[0] = currentDirection;

  for (let i = 1; i < candles.length; i++) {
    const close = candles[i].close;

    if (currentDirection === 'up') {
      if (close > lastHigh) {
        // Continue up
        lastHigh = close;
        currentPrice = close;
        kagiValues[i] = currentPrice;
        directionValues[i] = 'up';
      } else if (close < lastHigh - reversalAmount) {
        // Reversal down
        currentDirection = 'down';
        lastLow = close;
        currentPrice = close;
        trend = 'bearish';
        kagiValues[i] = currentPrice;
        directionValues[i] = 'down';
      } else {
        // No change
        kagiValues[i] = kagiValues[i - 1];
        directionValues[i] = directionValues[i - 1];
      }
    } else {
      if (close < lastLow) {
        // Continue down
        lastLow = close;
        currentPrice = close;
        kagiValues[i] = currentPrice;
        directionValues[i] = 'down';
      } else if (close > lastLow + reversalAmount) {
        // Reversal up
        currentDirection = 'up';
        lastHigh = close;
        currentPrice = close;
        trend = 'bullish';
        kagiValues[i] = currentPrice;
        directionValues[i] = 'up';
      } else {
        // No change
        kagiValues[i] = kagiValues[i - 1];
        directionValues[i] = directionValues[i - 1];
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
    id: 'kagi',
    overlay: true,
    lines: [
      { name: 'kagi', data: buildLineData(kagiValues), color: '#2962FF' },
    ],
    histograms: [],
  };
}

/**
 * Get detailed Kagi lines with direction info
 */
export function getKagiLines(
  candles: Candle[],
  config: Partial<KagiConfig> = {}
): KagiLine[] {
  const lines: KagiLine[] = [];
  const useATR = config.useATR ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  let reversalAmount = config.reversalAmount ?? 0;

  if (useATR || reversalAmount === 0) {
    reversalAmount = calculateATR(candles, atrPeriod);
    if (reversalAmount === 0) {
      reversalAmount = (candles[candles.length - 1]?.close ?? 100) * 0.01;
    }
  }

  if (candles.length === 0) return lines;

  let currentPrice = candles[0].close;
  let currentDirection: 'up' | 'down' = 'up';
  let lastHigh = currentPrice;
  let lastLow = currentPrice;
  let trend: 'bullish' | 'bearish' = 'bullish';

  lines.push({
    time: candles[0].time,
    price: currentPrice,
    direction: currentDirection,
    thickness: 'thin',
    trend,
  });

  for (let i = 1; i < candles.length; i++) {
    const close = candles[i].close;
    let newLine: KagiLine | null = null;

    if (currentDirection === 'up') {
      if (close > lastHigh) {
        lastHigh = close;
        currentPrice = close;
        newLine = {
          time: candles[i].time,
          price: currentPrice,
          direction: 'up',
          thickness: trend === 'bullish' ? 'thick' : 'thin',
          trend,
        };
      } else if (close < lastHigh - reversalAmount) {
        currentDirection = 'down';
        lastLow = close;
        currentPrice = close;
        trend = 'bearish';
        newLine = {
          time: candles[i].time,
          price: currentPrice,
          direction: 'down',
          thickness: 'thin',
          trend,
        };
      }
    } else {
      if (close < lastLow) {
        lastLow = close;
        currentPrice = close;
        newLine = {
          time: candles[i].time,
          price: currentPrice,
          direction: 'down',
          thickness: trend === 'bearish' ? 'thick' : 'thin',
          trend,
        };
      } else if (close > lastLow + reversalAmount) {
        currentDirection = 'up';
        lastHigh = close;
        currentPrice = close;
        trend = 'bullish';
        newLine = {
          time: candles[i].time,
          price: currentPrice,
          direction: 'up',
          thickness: 'thin',
          trend,
        };
      }
    }

    if (newLine) {
      lines.push(newLine);
    }
  }

  return lines;
}

export default {
  calculateKagi,
  getKagiLines,
};
