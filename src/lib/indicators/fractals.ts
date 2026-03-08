/**
 * Williams Fractals Indicator
 * Ported from ai-technicals (https://github.com/sanzol-tech/ai-technicals)
 *
 * Williams Fractals are reversal patterns that identify potential turning points
 * in price action. A fractal is a series of at least 5 consecutive bars where
 * the middle bar has the highest high (bearish fractal) or lowest low (bullish fractal).
 *
 * Bullish Fractal: Low is lower than the 2 lows on each side
 * Bearish Fractal: High is higher than the 2 highs on each side
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

/**
 * Fractal point representing a detected fractal
 */
export interface FractalPoint {
  time: Time;
  price: number;
  type: 'bullish' | 'bearish';
  index: number; // Index in the original candle array
}

/**
 * Configuration for Fractals indicator
 */
export interface FractalsConfig {
  period: number;         // Number of bars on each side (default: 2)
  showBullish: boolean;   // Show bullish fractals (default: true)
  showBearish: boolean;   // Show bearish fractals (default: true)
}

/**
 * Fractal signal for trading
 */
export interface FractalSignal {
  time: Time;
  type: 'bullish' | 'bearish';
  price: number;
  strength: 'strong' | 'moderate' | 'weak';
  confirmed: boolean;
  brokenBy?: Time;  // Time when the fractal level was broken
}

/**
 * Result of fractal analysis
 */
export interface FractalsAnalysis {
  bullishFractals: FractalPoint[];
  bearishFractals: FractalPoint[];
  lastBullish: FractalPoint | null;
  lastBearish: FractalPoint | null;
  supportLevels: number[];   // Recent bullish fractal lows
  resistanceLevels: number[]; // Recent bearish fractal highs
}

// ==================== FRACTAL DETECTION ====================

/**
 * Check if a candle is a bullish fractal (lowest low surrounded by higher lows)
 * A bullish fractal has the lowest low in the middle of the pattern
 *
 * Pattern: H L H L (lowest) L H L H
 *                ^ Fractal Low
 */
function isBullishFractal(
  candles: Candle[],
  index: number,
  period: number = 2
): boolean {
  // Need enough candles on each side
  if (index < period || index >= candles.length - period) {
    return false;
  }

  const middleLow = candles[index].low;

  // Check if the middle candle has the lowest low
  for (let i = 1; i <= period; i++) {
    // Left side: lows should be higher
    if (candles[index - i].low <= middleLow) {
      return false;
    }
    // Right side: lows should be higher
    if (candles[index + i].low <= middleLow) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a candle is a bearish fractal (highest high surrounded by lower highs)
 * A bearish fractal has the highest high in the middle of the pattern
 *
 * Pattern: L H L H (highest) H L H L
 *                 ^ Fractal High
 */
function isBearishFractal(
  candles: Candle[],
  index: number,
  period: number = 2
): boolean {
  // Need enough candles on each side
  if (index < period || index >= candles.length - period) {
    return false;
  }

  const middleHigh = candles[index].high;

  // Check if the middle candle has the highest high
  for (let i = 1; i <= period; i++) {
    // Left side: highs should be lower
    if (candles[index - i].high >= middleHigh) {
      return false;
    }
    // Right side: highs should be lower
    if (candles[index + i].high >= middleHigh) {
      return false;
    }
  }

  return true;
}

// ==================== MAIN CALCULATION FUNCTIONS ====================

/**
 * Detect all fractals in the candle data
 */
export function detectFractals(
  candles: Candle[],
  config: Partial<FractalsConfig> = {}
): FractalsAnalysis {
  const period = config.period ?? 2;
  const showBullish = config.showBullish ?? true;
  const showBearish = config.showBearish ?? true;

  const bullishFractals: FractalPoint[] = [];
  const bearishFractals: FractalPoint[] = [];

  // Start from 'period' and end at length - period
  // This ensures we have enough bars on each side
  for (let i = period; i < candles.length - period; i++) {
    if (showBullish && isBullishFractal(candles, i, period)) {
      bullishFractals.push({
        time: candles[i].time,
        price: candles[i].low,
        type: 'bullish',
        index: i,
      });
    }

    if (showBearish && isBearishFractal(candles, i, period)) {
      bearishFractals.push({
        time: candles[i].time,
        price: candles[i].high,
        type: 'bearish',
        index: i,
      });
    }
  }

  // Get last fractals
  const lastBullish = bullishFractals.length > 0
    ? bullishFractals[bullishFractals.length - 1]
    : null;
  const lastBearish = bearishFractals.length > 0
    ? bearishFractals[bearishFractals.length - 1]
    : null;

  // Extract support and resistance levels from recent fractals
  const supportLevels = bullishFractals.slice(-5).map(f => f.price);
  const resistanceLevels = bearishFractals.slice(-5).map(f => f.price);

  return {
    bullishFractals,
    bearishFractals,
    lastBullish,
    lastBearish,
    supportLevels,
    resistanceLevels,
  };
}

/**
 * Calculate Fractals indicator for chart rendering
 */
export function calculateFractals(
  candles: Candle[],
  config: Partial<FractalsConfig> = {}
): IndicatorResult {
  const period = config.period ?? 2;
  const showBullish = config.showBullish ?? true;
  const showBearish = config.showBearish ?? true;

  const bullishValues: (number | null)[] = new Array(candles.length).fill(null);
  const bearishValues: (number | null)[] = new Array(candles.length).fill(null);

  // Detect fractals
  // Note: Fractals are confirmed 'period' bars after the actual candle
  // So we mark the fractal at its actual position, not the confirmation position
  for (let i = period; i < candles.length - period; i++) {
    if (showBullish && isBullishFractal(candles, i, period)) {
      bullishValues[i] = candles[i].low;
    }

    if (showBearish && isBearishFractal(candles, i, period)) {
      bearishValues[i] = candles[i].high;
    }
  }

  // Build line data for chart markers
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
    id: 'fractals',
    overlay: true,
    lines: [
      { name: 'bullish', data: buildLineData(bullishValues), color: '#26A69A' },  // Green for bullish
      { name: 'bearish', data: buildLineData(bearishValues), color: '#EF5350' }, // Red for bearish
    ],
    histograms: [],
  };
}

// ==================== SIGNAL DETECTION ====================

/**
 * Generate trading signals from fractals
 * Signals are generated when price breaks a fractal level
 */
export function detectFractalSignals(
  candles: Candle[],
  config: Partial<FractalsConfig> = {}
): FractalSignal[] {
  const period = config.period ?? 2;
  const signals: FractalSignal[] = [];
  const analysis = detectFractals(candles, config);

  // Track broken fractals
  const brokenBullish = new Set<number>();
  const brokenBearish = new Set<number>();

  for (let i = period + 1; i < candles.length; i++) {
    const currentCandle = candles[i];

    // Check for bullish fractal break (price breaks above bearish fractal = buy signal)
    for (const fractal of analysis.bearishFractals) {
      if (fractal.index < i && !brokenBearish.has(fractal.index)) {
        if (currentCandle.close > fractal.price) {
          // Bearish fractal broken to the upside = bullish signal
          const distance = fractal.index;
          const recency = i - distance;
          const strength = recency <= 5 ? 'strong' : recency <= 15 ? 'moderate' : 'weak';

          signals.push({
            time: currentCandle.time,
            type: 'bullish',
            price: fractal.price,
            strength,
            confirmed: true,
          });

          brokenBearish.add(fractal.index);
        }
      }
    }

    // Check for bearish fractal break (price breaks below bullish fractal = sell signal)
    for (const fractal of analysis.bullishFractals) {
      if (fractal.index < i && !brokenBullish.has(fractal.index)) {
        if (currentCandle.close < fractal.price) {
          // Bullish fractal broken to the downside = bearish signal
          const distance = fractal.index;
          const recency = i - distance;
          const strength = recency <= 5 ? 'strong' : recency <= 15 ? 'moderate' : 'weak';

          signals.push({
            time: currentCandle.time,
            type: 'bearish',
            price: fractal.price,
            strength,
            confirmed: true,
          });

          brokenBullish.add(fractal.index);
        }
      }
    }
  }

  return signals;
}

// ==================== SUPPORT/RESISTANCE ====================

/**
 * Get fractal-based support and resistance levels
 * Returns the most significant levels based on fractal clustering
 */
export function getFractalLevels(
  candles: Candle[],
  config: Partial<FractalsConfig> = {}
): {
  supports: Array<{ price: number; strength: number; touches: number }>;
  resistances: Array<{ price: number; strength: number; touches: number }>;
} {
  const analysis = detectFractals(candles, config);

  // Group fractals by proximity (within 1% of each other)
  const groupLevel = (price: number): number => {
    return Math.round(price * 100) / 100;
  };

  const supportMap = new Map<number, { price: number; count: number }>();
  const resistanceMap = new Map<number, { price: number; count: number }>();

  // Group bullish fractals (support)
  for (const fractal of analysis.bullishFractals) {
    const level = groupLevel(fractal.price);
    const existing = supportMap.get(level);
    if (existing) {
      existing.count++;
    } else {
      supportMap.set(level, { price: fractal.price, count: 1 });
    }
  }

  // Group bearish fractals (resistance)
  for (const fractal of analysis.bearishFractals) {
    const level = groupLevel(fractal.price);
    const existing = resistanceMap.get(level);
    if (existing) {
      existing.count++;
    } else {
      resistanceMap.set(level, { price: fractal.price, count: 1 });
    }
  }

  // Convert to arrays and sort by strength
  const supports = Array.from(supportMap.values())
    .map(s => ({
      price: s.price,
      strength: s.price,
      touches: s.count,
    }))
    .sort((a, b) => b.touches - a.touches);

  const resistances = Array.from(resistanceMap.values())
    .map(r => ({
      price: r.price,
      strength: r.price,
      touches: r.count,
    }))
    .sort((a, b) => b.touches - a.touches);

  return { supports, resistances };
}

/**
 * Find the nearest fractal levels to current price
 */
export function findNearestFractalLevels(
  candles: Candle[],
  currentPrice: number,
  config: Partial<FractalsConfig> = {}
): {
  nearestSupport: { price: number; distance: number } | null;
  nearestResistance: { price: number; distance: number } | null;
} {
  const analysis = detectFractals(candles, config);

  let nearestSupport: { price: number; distance: number } | null = null;
  let nearestResistance: { price: number; distance: number } | null = null;

  // Find nearest support (below current price)
  for (const fractal of analysis.bullishFractals) {
    if (fractal.price < currentPrice) {
      const distance = currentPrice - fractal.price;
      if (!nearestSupport || distance < nearestSupport.distance) {
        nearestSupport = { price: fractal.price, distance };
      }
    }
  }

  // Find nearest resistance (above current price)
  for (const fractal of analysis.bearishFractals) {
    if (fractal.price > currentPrice) {
      const distance = fractal.price - currentPrice;
      if (!nearestResistance || distance < nearestResistance.distance) {
        nearestResistance = { price: fractal.price, distance };
      }
    }
  }

  return { nearestSupport, nearestResistance };
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Format fractals for display
 */
export function formatFractals(analysis: FractalsAnalysis): string {
  let output = '=== Williams Fractals Analysis ===\n\n';

  output += `Total Bullish Fractals: ${analysis.bullishFractals.length}\n`;
  output += `Total Bearish Fractals: ${analysis.bearishFractals.length}\n\n`;

  if (analysis.lastBullish) {
    output += `Last Bullish Fractal:\n`;
    output += `  Price: ${analysis.lastBullish.price.toFixed(2)}\n`;
    output += `  Time: ${analysis.lastBullish.time}\n\n`;
  }

  if (analysis.lastBearish) {
    output += `Last Bearish Fractal:\n`;
    output += `  Price: ${analysis.lastBearish.price.toFixed(2)}\n`;
    output += `  Time: ${analysis.lastBearish.time}\n\n`;
  }

  if (analysis.supportLevels.length > 0) {
    output += 'Support Levels (Bullish Fractals):\n';
    for (const level of analysis.supportLevels) {
      output += `  - ${level.toFixed(2)}\n`;
    }
    output += '\n';
  }

  if (analysis.resistanceLevels.length > 0) {
    output += 'Resistance Levels (Bearish Fractals):\n';
    for (const level of analysis.resistanceLevels) {
      output += `  - ${level.toFixed(2)}\n`;
    }
  }

  return output;
}

/**
 * Check if fractal is still valid (not broken)
 */
export function isFractalValid(
  fractal: FractalPoint,
  candles: Candle[],
  fractalIndex: number
): boolean {
  // A fractal is valid if price hasn't broken through it
  for (let i = fractalIndex + 1; i < candles.length; i++) {
    if (fractal.type === 'bullish') {
      // Bullish fractal is broken if price goes below it
      if (candles[i].low < fractal.price) {
        return false;
      }
    } else {
      // Bearish fractal is broken if price goes above it
      if (candles[i].high > fractal.price) {
        return false;
      }
    }
  }
  return true;
}
