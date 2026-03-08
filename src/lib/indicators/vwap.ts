/**
 * VWAP (Volume Weighted Average Price) Indicator
 * Ported from Ta4j (https://github.com/ta4j/ta4j)
 *
 * VWAP calculates the average price weighted by volume over a specified period.
 * It's commonly used by institutional traders to gauge the average price at which
 * a security has traded throughout the day.
 *
 * Formula:
 * VWAP = Σ(Price × Volume) / Σ(Volume)
 *
 * Where Price is typically calculated as: (High + Low + Close) / 3
 *
 * Usage:
 * - Price above VWAP: Bullish (buying pressure)
 * - Price below VWAP: Bearish (selling pressure)
 * - VWAP acts as dynamic support/resistance
 * - Used for execution quality assessment
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

export interface VWAPConfig {
  period: number | 'session';  // Rolling period or session VWAP
  useTypicalPrice: boolean;    // Use HLC/3 instead of close
}

export interface VWAPPoint {
  time: Time;
  vwap: number;
  upperBand: number;   // VWAP + 1 StdDev
  lowerBand: number;   // VWAP - 1 StdDev
}

export interface VWAPBands {
  vwap: number;
  upper1: number;  // +1 StdDev
  lower1: number;  // -1 StdDev
  upper2: number;  // +2 StdDev
  lower2: number;  // -2 StdDev
  upper3: number;  // +3 StdDev
  lower3: number;  // -3 StdDev
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate typical price (HLC/3)
 */
function typicalPrice(high: number, low: number, close: number): number {
  return (high + low + close) / 3;
}

// ==================== MAIN CALCULATION ====================

/**
 * Calculate Rolling VWAP indicator
 */
export function calculateVWAP(
  candles: Candle[],
  config: Partial<VWAPConfig> = {}
): IndicatorResult {
  const period = config.period ?? 20;
  const useTypicalPrice = config.useTypicalPrice ?? true;

  const vwapValues: (number | null)[] = new Array(candles.length).fill(null);
  const upperBandValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowerBandValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const lookback = typeof period === 'number' ? Math.min(period, i + 1) : i + 1;
    const startIndex = typeof period === 'number' ? Math.max(0, i - period + 1) : 0;

    if (lookback === 0) continue;

    let sumPV = 0;
    let sumVolume = 0;
    const prices: number[] = [];
    const volumes: number[] = [];

    for (let j = startIndex; j <= i; j++) {
      const candle = candles[j];
      const price = useTypicalPrice
        ? typicalPrice(candle.high, candle.low, candle.close)
        : candle.close;

      sumPV += price * candle.volume;
      sumVolume += candle.volume;
      prices.push(price);
      volumes.push(candle.volume);
    }

    if (sumVolume === 0) continue;

    const vwap = sumPV / sumVolume;
    vwapValues[i] = vwap;

    // Calculate standard deviation for bands
    let sumWeightedVariance = 0;
    for (let j = 0; j < prices.length; j++) {
      sumWeightedVariance += volumes[j] * Math.pow(prices[j] - vwap, 2);
    }
    const variance = sumWeightedVariance / sumVolume;
    const stdDev = Math.sqrt(variance);

    upperBandValues[i] = vwap + stdDev;
    lowerBandValues[i] = vwap - stdDev;
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
    id: 'vwap',
    overlay: true,
    lines: [
      { name: 'vwap', data: buildLineData(vwapValues), color: '#FF6D00' },
      { name: 'upperBand', data: buildLineData(upperBandValues), color: '#FF6D0050' },
      { name: 'lowerBand', data: buildLineData(lowerBandValues), color: '#FF6D0050' },
    ],
    histograms: [],
  };
}

/**
 * Calculate VWAP with full bands (1, 2, 3 standard deviations)
 */
export function calculateVWAPBands(
  candles: Candle[],
  config: Partial<VWAPConfig> = {}
): IndicatorResult {
  const period = config.period ?? 20;
  const useTypicalPrice = config.useTypicalPrice ?? true;

  const vwapValues: (number | null)[] = new Array(candles.length).fill(null);
  const upper1Values: (number | null)[] = new Array(candles.length).fill(null);
  const lower1Values: (number | null)[] = new Array(candles.length).fill(null);
  const upper2Values: (number | null)[] = new Array(candles.length).fill(null);
  const lower2Values: (number | null)[] = new Array(candles.length).fill(null);
  const upper3Values: (number | null)[] = new Array(candles.length).fill(null);
  const lower3Values: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const lookback = typeof period === 'number' ? Math.min(period, i + 1) : i + 1;
    const startIndex = typeof period === 'number' ? Math.max(0, i - period + 1) : 0;

    if (lookback === 0) continue;

    let sumPV = 0;
    let sumVolume = 0;
    const prices: number[] = [];
    const volumes: number[] = [];

    for (let j = startIndex; j <= i; j++) {
      const candle = candles[j];
      const price = useTypicalPrice
        ? typicalPrice(candle.high, candle.low, candle.close)
        : candle.close;

      sumPV += price * candle.volume;
      sumVolume += candle.volume;
      prices.push(price);
      volumes.push(candle.volume);
    }

    if (sumVolume === 0) continue;

    const vwap = sumPV / sumVolume;
    vwapValues[i] = vwap;

    // Calculate standard deviation
    let sumWeightedVariance = 0;
    for (let j = 0; j < prices.length; j++) {
      sumWeightedVariance += volumes[j] * Math.pow(prices[j] - vwap, 2);
    }
    const stdDev = Math.sqrt(sumWeightedVariance / sumVolume);

    upper1Values[i] = vwap + stdDev;
    lower1Values[i] = vwap - stdDev;
    upper2Values[i] = vwap + 2 * stdDev;
    lower2Values[i] = vwap - 2 * stdDev;
    upper3Values[i] = vwap + 3 * stdDev;
    lower3Values[i] = vwap - 3 * stdDev;
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
    id: 'vwap_bands',
    overlay: true,
    lines: [
      { name: 'vwap', data: buildLineData(vwapValues), color: '#FF6D00' },
      { name: 'upper1', data: buildLineData(upper1Values), color: '#EF5350' },
      { name: 'lower1', data: buildLineData(lower1Values), color: '#26A69A' },
      { name: 'upper2', data: buildLineData(upper2Values), color: '#E91E63' },
      { name: 'lower2', data: buildLineData(lower2Values), color: '#66BB6A' },
      { name: 'upper3', data: buildLineData(upper3Values), color: '#CE93D8' },
      { name: 'lower3', data: buildLineData(lower3Values), color: '#A5D6A7' },
    ],
    histograms: [],
  };
}

/**
 * Get current VWAP bands for a single candle
 */
export function getVWAPBands(
  candles: Candle[],
  index: number,
  config: Partial<VWAPConfig> = {}
): VWAPBands | null {
  const period = config.period ?? 20;
  const useTypicalPrice = config.useTypicalPrice ?? true;
  const i = index;

  if (i < 0 || i >= candles.length) return null;

  const lookback = typeof period === 'number' ? Math.min(period, i + 1) : i + 1;
  const startIndex = typeof period === 'number' ? Math.max(0, i - period + 1) : 0;

  let sumPV = 0;
  let sumVolume = 0;
  const prices: number[] = [];
  const volumes: number[] = [];

  for (let j = startIndex; j <= i; j++) {
    const candle = candles[j];
    const price = useTypicalPrice
      ? typicalPrice(candle.high, candle.low, candle.close)
      : candle.close;

    sumPV += price * candle.volume;
    sumVolume += candle.volume;
    prices.push(price);
    volumes.push(candle.volume);
  }

  if (sumVolume === 0) return null;

  const vwap = sumPV / sumVolume;

  let sumWeightedVariance = 0;
  for (let j = 0; j < prices.length; j++) {
    sumWeightedVariance += volumes[j] * Math.pow(prices[j] - vwap, 2);
  }
  const stdDev = Math.sqrt(sumWeightedVariance / sumVolume);

  return {
    vwap,
    upper1: vwap + stdDev,
    lower1: vwap - stdDev,
    upper2: vwap + 2 * stdDev,
    lower2: vwap - 2 * stdDev,
    upper3: vwap + 3 * stdDev,
    lower3: vwap - 3 * stdDev,
  };
}

/**
 * Analyze price position relative to VWAP
 */
export function analyzeVWAPPosition(
  candles: Candle[],
  config: Partial<VWAPConfig> = {}
): {
  position: 'above' | 'below' | 'at';
  distance: number;
  bandLevel: number;  // Which band level (1, 2, 3) price is at
  bias: 'bullish' | 'bearish' | 'neutral';
} {
  const lastIndex = candles.length - 1;
  const bands = getVWAPBands(candles, lastIndex, config);

  if (!bands) {
    return {
      position: 'at',
      distance: 0,
      bandLevel: 0,
      bias: 'neutral',
    };
  }

  const candle = candles[lastIndex];
  const price = candle.close;
  const distance = ((price - bands.vwap) / bands.vwap) * 100;

  let position: 'above' | 'below' | 'at';
  let bandLevel: number;
  let bias: 'bullish' | 'bearish' | 'neutral';

  if (price > bands.vwap) {
    position = 'above';
    if (price > bands.upper3) bandLevel = 3;
    else if (price > bands.upper2) bandLevel = 2;
    else if (price > bands.upper1) bandLevel = 1;
    else bandLevel = 0;
    bias = 'bullish';
  } else if (price < bands.vwap) {
    position = 'below';
    if (price < bands.lower3) bandLevel = -3;
    else if (price < bands.lower2) bandLevel = -2;
    else if (price < bands.lower1) bandLevel = -1;
    else bandLevel = 0;
    bias = 'bearish';
  } else {
    position = 'at';
    bandLevel = 0;
    bias = 'neutral';
  }

  return { position, distance, bandLevel, bias };
}
