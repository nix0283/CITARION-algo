/**
 * Pivot Points Indicators
 * Ported from ai-technicals (https://github.com/sanzol-tech/ai-technicals)
 *
 * Pivot Points are significant price levels used by traders to determine
 * potential support and resistance levels.
 *
 * Supported Types:
 * 1. Standard (Floor) - Most common, based on previous day's HLC
 * 2. Fibonacci - Uses Fibonacci retracements
 * 3. Camarilla - Developed by Nick Stott, uses different formula
 * 4. Woodie - Gives more weight to close price
 * 5. Demark - Created by Tom Demark, uses open price
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

export interface PivotPoint {
  time: Time;
  pivot: number;
  r1: number;  // Resistance 1
  r2: number;  // Resistance 2
  r3: number;  // Resistance 3
  r4: number;  // Resistance 4 (not all types have this)
  s1: number;  // Support 1
  s2: number;  // Support 2
  s3: number;  // Support 3
  s4: number;  // Support 4 (not all types have this)
}

export type PivotType = 'standard' | 'fibonacci' | 'camarilla' | 'woodie' | 'demark';

export interface PivotConfig {
  type: PivotType;
  useWeekly: boolean;      // Use weekly instead of daily
  useMonthly: boolean;     // Use monthly instead of daily
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get period boundaries (daily, weekly, monthly)
 */
function getPeriodBoundaries(
  candles: Candle[],
  useWeekly: boolean,
  useMonthly: boolean
): Map<number, { high: number; low: number; close: number; open: number }> {
  const periods = new Map<number, { high: number; low: number; close: number; open: number }>();

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const date = new Date(candle.time as number * 1000);

    let periodKey: number;
    if (useMonthly) {
      periodKey = date.getFullYear() * 100 + date.getMonth();
    } else if (useWeekly) {
      // Get week number
      const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((days + firstDayOfYear.getDay() + 1) / 7);
      periodKey = date.getFullYear() * 100 + weekNumber;
    } else {
      periodKey = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    }

    const existing = periods.get(periodKey);
    if (existing) {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close; // Last close of period
    } else {
      periods.set(periodKey, {
        high: candle.high,
        low: candle.low,
        close: candle.close,
        open: candle.open
      });
    }
  }

  return periods;
}

/**
 * Get previous period data for a given time
 */
function getPreviousPeriodData(
  time: Time,
  periods: Map<number, { high: number; low: number; close: number; open: number }>,
  useWeekly: boolean,
  useMonthly: boolean
): { high: number; low: number; close: number; open: number } | null {
  const date = new Date(time as number * 1000);

  let currentPeriodKey: number;
  let prevPeriodKey: number;

  if (useMonthly) {
    currentPeriodKey = date.getFullYear() * 100 + date.getMonth();
    // Previous month
    const prevDate = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    prevPeriodKey = prevDate.getFullYear() * 100 + prevDate.getMonth();
  } else if (useWeekly) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + firstDayOfYear.getDay() + 1) / 7);
    currentPeriodKey = date.getFullYear() * 100 + weekNumber;
    // Previous week
    prevPeriodKey = date.getFullYear() * 100 + weekNumber - 1;
  } else {
    currentPeriodKey = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    // Previous day
    const prevDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    prevPeriodKey = prevDate.getFullYear() * 10000 + (prevDate.getMonth() + 1) * 100 + prevDate.getDate();
  }

  return periods.get(prevPeriodKey) || null;
}

// ==================== PIVOT POINT CALCULATIONS ====================

/**
 * Standard (Floor) Pivot Points
 * Most commonly used by traders
 *
 * Pivot = (High + Low + Close) / 3
 * R1 = 2 * Pivot - Low
 * S1 = 2 * Pivot - High
 * R2 = Pivot + (High - Low)
 * S2 = Pivot - (High - Low)
 * R3 = High + 2 * (Pivot - Low)
 * S3 = Low - 2 * (High - Pivot)
 */
function calculateStandardPivot(high: number, low: number, close: number): PivotPoint {
  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const r2 = pivot + (high - low);
  const s2 = pivot - (high - low);
  const r3 = high + 2 * (pivot - low);
  const s3 = low - 2 * (high - pivot);
  const r4 = r3 + (high - low);
  const s4 = s3 - (high - low);

  return { time: 0 as Time, pivot, r1, r2, r3, r4, s1, s2, s3, s4 };
}

/**
 * Fibonacci Pivot Points
 * Uses Fibonacci retracements to calculate levels
 *
 * Pivot = (High + Low + Close) / 3
 * R1 = Pivot + 0.382 * (High - Low)
 * S1 = Pivot - 0.382 * (High - Low)
 * R2 = Pivot + 0.618 * (High - Low)
 * S2 = Pivot - 0.618 * (High - Low)
 * R3 = Pivot + 1.000 * (High - Low)
 * S3 = Pivot - 1.000 * (High - Low)
 */
function calculateFibonacciPivot(high: number, low: number, close: number): PivotPoint {
  const pivot = (high + low + close) / 3;
  const range = high - low;

  const r1 = pivot + 0.382 * range;
  const s1 = pivot - 0.382 * range;
  const r2 = pivot + 0.618 * range;
  const s2 = pivot - 0.618 * range;
  const r3 = pivot + 1.000 * range;
  const s3 = pivot - 1.000 * range;
  const r4 = pivot + 1.618 * range;
  const s4 = pivot - 1.618 * range;

  return { time: 0 as Time, pivot, r1, r2, r3, r4, s1, s2, s3, s4 };
}

/**
 * Camarilla Pivot Points
 * Developed by Nick Stott, similar to Woodie but different formula
 * Uses a factor of the range to calculate levels
 *
 * R1 = Close + (High - Low) * 1.1 / 12
 * S1 = Close - (High - Low) * 1.1 / 12
 * R2 = Close + (High - Low) * 1.1 / 6
 * S2 = Close - (High - Low) * 1.1 / 6
 * R3 = Close + (High - Low) * 1.1 / 4
 * S3 = Close - (High - Low) * 1.1 / 4
 * R4 = Close + (High - Low) * 1.1 / 2
 * S4 = Close - (High - Low) * 1.1 / 2
 */
function calculateCamarillaPivot(high: number, low: number, close: number): PivotPoint {
  const range = high - low;

  const r1 = close + range * 1.1 / 12;
  const s1 = close - range * 1.1 / 12;
  const r2 = close + range * 1.1 / 6;
  const s2 = close - range * 1.1 / 6;
  const r3 = close + range * 1.1 / 4;
  const s3 = close - range * 1.1 / 4;
  const r4 = close + range * 1.1 / 2;
  const s4 = close - range * 1.1 / 2;

  // Camarilla doesn't use traditional pivot, use HLC/3
  const pivot = (high + low + close) / 3;

  return { time: 0 as Time, pivot, r1, r2, r3, r4, s1, s2, s3, s4 };
}

/**
 * Woodie Pivot Points
 * Gives more weight to the closing price
 *
 * Pivot = (High + Low + 2 * Close) / 4
 * R1 = 2 * Pivot - Low
 * S1 = 2 * Pivot - High
 * R2 = Pivot + High - Low
 * S2 = Pivot - High + Low
 * R3 = High + 2 * (Pivot - Low)
 * S3 = Low - 2 * (High - Pivot)
 */
function calculateWoodiePivot(high: number, low: number, close: number): PivotPoint {
  const pivot = (high + low + 2 * close) / 4;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const r2 = pivot + high - low;
  const s2 = pivot - high + low;
  const r3 = high + 2 * (pivot - low);
  const s3 = low - 2 * (high - pivot);
  const r4 = r3 + (high - low);
  const s4 = s3 - (high - low);

  return { time: 0 as Time, pivot, r1, r2, r3, r4, s1, s2, s3, s4 };
}

/**
 * Demark Pivot Points
 * Created by Tom DeMark, uses open price to determine calculation
 *
 * If Close < Open: X = High + 2 * Low + Close
 * If Close > Open: X = 2 * High + Low + Close
 * If Close = Open: X = High + Low + 2 * Close
 *
 * Pivot = X / 4
 * R1 = X / 2 - Low
 * S1 = X / 2 - High
 */
function calculateDemarkPivot(high: number, low: number, close: number, open: number): PivotPoint {
  let x: number;

  if (close < open) {
    x = high + 2 * low + close;
  } else if (close > open) {
    x = 2 * high + low + close;
  } else {
    x = high + low + 2 * close;
  }

  const pivot = x / 4;
  const r1 = x / 2 - low;
  const s1 = x / 2 - high;

  // Demark only has R1 and S1, fill others with standard formula
  const r2 = pivot + (high - low);
  const s2 = pivot - (high - low);
  const r3 = r1 + (high - low);
  const s3 = s1 - (high - low);
  const r4 = r2 + (high - low);
  const s4 = s2 - (high - low);

  return { time: 0 as Time, pivot, r1, r2, r3, r4, s1, s2, s3, s4 };
}

// ==================== MAIN CALCULATION FUNCTIONS ====================

/**
 * Calculate pivot points for a given type
 */
function calculatePivot(
  type: PivotType,
  high: number,
  low: number,
  close: number,
  open: number
): PivotPoint {
  switch (type) {
    case 'fibonacci':
      return calculateFibonacciPivot(high, low, close);
    case 'camarilla':
      return calculateCamarillaPivot(high, low, close);
    case 'woodie':
      return calculateWoodiePivot(high, low, close);
    case 'demark':
      return calculateDemarkPivot(high, low, close, open);
    case 'standard':
    default:
      return calculateStandardPivot(high, low, close);
  }
}

/**
 * Calculate Pivot Points indicator
 */
export function calculatePivotPoints(
  candles: Candle[],
  config: PivotConfig
): IndicatorResult {
  const type = config.type || 'standard';
  const useWeekly = config.useWeekly || false;
  const useMonthly = config.useMonthly || false;

  // Get period boundaries
  const periods = getPeriodBoundaries(candles, useWeekly, useMonthly);

  // Calculate pivot points for each candle
  const pivotData: (number | null)[] = [];
  const r1Data: (number | null)[] = [];
  const r2Data: (number | null)[] = [];
  const r3Data: (number | null)[] = [];
  const s1Data: (number | null)[] = [];
  const s2Data: (number | null)[] = [];
  const s3Data: (number | null)[] = [];

  for (const candle of candles) {
    const prevPeriod = getPreviousPeriodData(candle.time, periods, useWeekly, useMonthly);

    if (prevPeriod) {
      const pivot = calculatePivot(
        type,
        prevPeriod.high,
        prevPeriod.low,
        prevPeriod.close,
        prevPeriod.open
      );

      pivotData.push(pivot.pivot);
      r1Data.push(pivot.r1);
      r2Data.push(pivot.r2);
      r3Data.push(pivot.r3);
      s1Data.push(pivot.s1);
      s2Data.push(pivot.s2);
      s3Data.push(pivot.s3);
    } else {
      pivotData.push(null);
      r1Data.push(null);
      r2Data.push(null);
      r3Data.push(null);
      s1Data.push(null);
      s2Data.push(null);
      s3Data.push(null);
    }
  }

  // Build line data
  const buildLineData = (values: (number | null)[]): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = values[i];
      if (value !== null && !isNaN(value) && isFinite(value)) {
        return { time: c.time, value };
      }
      return { time: c.time };
    });
  };

  return {
    id: `pivot_${type}`,
    overlay: true,
    lines: [
      { name: 'pivot', data: buildLineData(pivotData), color: '#FFD700' },      // Gold
      { name: 'r1', data: buildLineData(r1Data), color: '#EF5350' },            // Red
      { name: 'r2', data: buildLineData(r2Data), color: '#E91E63' },            // Pink
      { name: 'r3', data: buildLineData(r3Data), color: '#CE93D8' },            // Purple
      { name: 's1', data: buildLineData(s1Data), color: '#26A69A' },            // Teal
      { name: 's2', data: buildLineData(s2Data), color: '#66BB6A' },            // Green
      { name: 's3', data: buildLineData(s3Data), color: '#A5D6A7' },            // Light Green
    ],
    histograms: [],
  };
}

/**
 * Get all pivot point types as separate indicator results
 */
export function calculateAllPivotTypes(
  candles: Candle[],
  useWeekly: boolean = false,
  useMonthly: boolean = false
): Map<PivotType, IndicatorResult> {
  const results = new Map<PivotType, IndicatorResult>();

  const types: PivotType[] = ['standard', 'fibonacci', 'camarilla', 'woodie', 'demark'];

  for (const type of types) {
    results.set(type, calculatePivotPoints(candles, { type, useWeekly, useMonthly }));
  }

  return results;
}

/**
 * Calculate current pivot levels from recent price data
 * Useful for displaying current levels without full history
 */
export function calculateCurrentPivots(
  high: number,
  low: number,
  close: number,
  open: number
): Map<PivotType, PivotPoint> {
  const results = new Map<PivotType, PivotPoint>();

  const types: PivotType[] = ['standard', 'fibonacci', 'camarilla', 'woodie', 'demark'];

  for (const type of types) {
    results.set(type, calculatePivot(type, high, low, close, open));
  }

  return results;
}

/**
 * Format pivot points for display
 */
export function formatPivotPoints(pivots: Map<PivotType, PivotPoint>): string {
  let output = '=== Pivot Points ===\n\n';

  pivots.forEach((pivot, type) => {
    output += `${type.toUpperCase()}:\n`;
    output += `  R3: ${pivot.r3.toFixed(2)}\n`;
    output += `  R2: ${pivot.r2.toFixed(2)}\n`;
    output += `  R1: ${pivot.r1.toFixed(2)}\n`;
    output += `  PP: ${pivot.pivot.toFixed(2)}\n`;
    output += `  S1: ${pivot.s1.toFixed(2)}\n`;
    output += `  S2: ${pivot.s2.toFixed(2)}\n`;
    output += `  S3: ${pivot.s3.toFixed(2)}\n\n`;
  });

  return output;
}

/**
 * Find nearest support/resistance level
 */
export function findNearestLevel(
  price: number,
  pivot: PivotPoint
): { level: number; type: 'support' | 'resistance'; name: string } {
  const levels = [
    { level: pivot.r3, type: 'resistance' as const, name: 'R3' },
    { level: pivot.r2, type: 'resistance' as const, name: 'R2' },
    { level: pivot.r1, type: 'resistance' as const, name: 'R1' },
    { level: pivot.pivot, type: 'resistance' as const, name: 'PP' },
    { level: pivot.s1, type: 'support' as const, name: 'S1' },
    { level: pivot.s2, type: 'support' as const, name: 'S2' },
    { level: pivot.s3, type: 'support' as const, name: 'S3' },
  ];

  let nearest = levels[0];
  let minDistance = Math.abs(price - nearest.level);

  for (const l of levels) {
    const distance = Math.abs(price - l.level);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = l;
    }
  }

  return nearest;
}
