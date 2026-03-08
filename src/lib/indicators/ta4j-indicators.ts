/**
 * Advanced Indicators Ported from Ta4j
 * Source: https://github.com/ta4j/ta4j (MIT License)
 *
 * This module contains 6 advanced technical indicators ported from Ta4j:
 * 1. SuperTrend - Trend following indicator
 * 2. VWAP - Volume Weighted Average Price
 * 3. Heikin-Ashi - Smoothed candlestick representation
 * 4. Renko - Brick-based price representation
 * 5. Keltner Channel - ATR-based volatility channel
 * 6. Mass Index - Reversal detection indicator
 */

import type { Time, LineData, HistogramData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

export interface SuperTrendConfig {
  period: number;        // ATR period (default: 10)
  multiplier: number;    // ATR multiplier (default: 3)
}

export interface SuperTrendResult {
  time: Time;
  value: number;
  trend: 'bullish' | 'bearish';
  signal: 'buy' | 'sell' | null;
}

export interface VWAPConfig {
  // VWAP is typically calculated from session start
  // For historical data, we use rolling VWAP
  period?: number;  // Optional rolling period
}

export interface HeikinAshiBar {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  trend: 'bullish' | 'bearish';
}

export interface RenkoConfig {
  brickSize: number;     // Fixed brick size or ATR multiplier
  useATR?: boolean;      // Use ATR for dynamic brick size
  atrPeriod?: number;    // ATR period for dynamic sizing
}

export interface RenkoBrick {
  time: Time;
  price: number;
  type: 'up' | 'down';
  brickNumber: number;
}

export interface KeltnerChannelConfig {
  period: number;        // EMA period (default: 20)
  multiplier: number;    // ATR multiplier (default: 2)
  atrPeriod: number;     // ATR period (default: 10)
}

export interface MassIndexConfig {
  emaPeriod: number;     // First EMA period (default: 9)
  sumPeriod: number;     // Sum period (default: 25)
}

// ==================== HELPER FUNCTIONS ====================

function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i];
  }

  if (data.length >= period) {
    result[period - 1] = sum / period;
    let prevEma = result[period - 1] as number;

    for (let i = period; i < data.length; i++) {
      const currentEma = (data[i] - prevEma) * multiplier + prevEma;
      result[i] = currentEma;
      prevEma = currentEma;
    }
  }

  return result;
}

function atr(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  const trValues: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trValues.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trValues.push(tr);
    }
  }

  if (trValues.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trValues[i];
    }
    result[period - 1] = sum / period;

    for (let i = period; i < trValues.length; i++) {
      result[i] = (result[i - 1] as number * (period - 1) + trValues[i]) / period;
    }
  }

  return result;
}

function highestHigh(candles: Candle[], period: number, endIndex: number): number {
  let highest = -Infinity;
  const startIndex = Math.max(0, endIndex - period + 1);
  for (let i = startIndex; i <= endIndex; i++) {
    highest = Math.max(highest, candles[i].high);
  }
  return highest;
}

function lowestLow(candles: Candle[], period: number, endIndex: number): number {
  let lowest = Infinity;
  const startIndex = Math.max(0, endIndex - period + 1);
  for (let i = startIndex; i <= endIndex; i++) {
    lowest = Math.min(lowest, candles[i].low);
  }
  return lowest;
}

function typicalPrice(candle: Candle): number {
  return (candle.high + candle.low + candle.close) / 3;
}

// ==================== 1. SUPERTREND ====================

/**
 * SuperTrend Indicator
 *
 * A trend following indicator that uses ATR to determine trend direction.
 * When price is above the SuperTrend line, the trend is bullish.
 * When price is below, the trend is bearish.
 *
 * Formula:
 * Basic Upper Band = (High + Low) / 2 + (Multiplier × ATR)
 * Basic Lower Band = (High + Low) / 2 - (Multiplier × ATR)
 *
 * Final Upper Band = Basic Upper if Basic Upper < Previous Final Upper OR Close > Previous Final Upper
 * Final Lower Band = Basic Lower if Basic Lower > Previous Final Lower OR Close < Previous Final Lower
 */
export function calculateSuperTrend(
  candles: Candle[],
  config: Partial<SuperTrendConfig> = {}
): IndicatorResult {
  const period = config.period ?? 10;
  const multiplier = config.multiplier ?? 3;

  const atrValues = atr(candles, period);
  const superTrendValues: (number | null)[] = new Array(candles.length).fill(null);
  const trendValues: ('bullish' | 'bearish')[] = new Array(candles.length).fill('bullish');

  // Track bands
  let prevUpperBand: number | null = null;
  let prevLowerBand: number | null = null;
  let prevSuperTrend: number | null = null;
  let prevTrend: 'bullish' | 'bearish' = 'bullish';

  for (let i = 0; i < candles.length; i++) {
    const atrVal = atrValues[i];
    if (atrVal === null) continue;

    const candle = candles[i];
    const hl2 = (candle.high + candle.low) / 2;

    // Basic bands
    const basicUpperBand = hl2 + multiplier * atrVal;
    const basicLowerBand = hl2 - multiplier * atrVal;

    // Final bands with transition logic
    let finalUpperBand: number;
    let finalLowerBand: number;

    if (prevUpperBand === null || prevLowerBand === null) {
      finalUpperBand = basicUpperBand;
      finalLowerBand = basicLowerBand;
    } else {
      // Upper band: use basic if it's lower than previous, or if close crossed above
      if (basicUpperBand < prevUpperBand || candle.close > prevUpperBand) {
        finalUpperBand = basicUpperBand;
      } else {
        finalUpperBand = prevUpperBand;
      }

      // Lower band: use basic if it's higher than previous, or if close crossed below
      if (basicLowerBand > prevLowerBand || candle.close < prevLowerBand) {
        finalLowerBand = basicLowerBand;
      } else {
        finalLowerBand = prevLowerBand;
      }
    }

    // Determine SuperTrend value and trend
    let superTrend: number;
    let trend: 'bullish' | 'bearish';

    if (prevSuperTrend === null) {
      // Initial trend based on close vs hl2
      if (candle.close <= hl2) {
        superTrend = finalUpperBand;
        trend = 'bearish';
      } else {
        superTrend = finalLowerBand;
        trend = 'bullish';
      }
    } else if (prevTrend === 'bullish') {
      if (candle.close < prevLowerBand) {
        // Trend changed to bearish
        superTrend = finalUpperBand;
        trend = 'bearish';
      } else {
        superTrend = finalLowerBand;
        trend = 'bullish';
      }
    } else {
      if (candle.close > prevUpperBand) {
        // Trend changed to bullish
        superTrend = finalLowerBand;
        trend = 'bullish';
      } else {
        superTrend = finalUpperBand;
        trend = 'bearish';
      }
    }

    superTrendValues[i] = superTrend;
    trendValues[i] = trend;

    prevUpperBand = finalUpperBand;
    prevLowerBand = finalLowerBand;
    prevSuperTrend = superTrend;
    prevTrend = trend;
  }

  const buildLineData = (values: (number | null)[]): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = values[i];
      if (value !== null && !isNaN(value) && isFinite(value)) {
        return { time: c.time, value };
      }
      return { time: c.time };
    });
  };

  // Create separate series for bullish and bearish trends
  const bullishValues = superTrendValues.map((v, i) => trendValues[i] === 'bullish' ? v : null);
  const bearishValues = superTrendValues.map((v, i) => trendValues[i] === 'bearish' ? v : null);

  return {
    id: 'supertrend',
    overlay: true,
    lines: [
      { name: 'supertrend_bullish', data: buildLineData(bullishValues), color: '#26A69A' },
      { name: 'supertrend_bearish', data: buildLineData(bearishValues), color: '#EF5350' },
      { name: 'supertrend', data: buildLineData(superTrendValues), color: '#2962FF' },
    ],
    histograms: [],
  };
}

/**
 * Get SuperTrend signals (trend changes)
 */
export function getSuperTrendSignals(
  candles: Candle[],
  config: Partial<SuperTrendConfig> = {}
): Array<{ time: Time; type: 'buy' | 'sell'; price: number }> {
  const period = config.period ?? 10;
  const multiplier = config.multiplier ?? 3;
  const signals: Array<{ time: Time; type: 'buy' | 'sell'; price: number }> = [];

  const atrValues = atr(candles, period);
  let prevUpperBand: number | null = null;
  let prevLowerBand: number | null = null;
  let prevSuperTrend: number | null = null;
  let prevTrend: 'bullish' | 'bearish' = 'bullish';

  for (let i = 0; i < candles.length; i++) {
    const atrVal = atrValues[i];
    if (atrVal === null) continue;

    const candle = candles[i];
    const hl2 = (candle.high + candle.low) / 2;

    const basicUpperBand = hl2 + multiplier * atrVal;
    const basicLowerBand = hl2 - multiplier * atrVal;

    let finalUpperBand: number;
    let finalLowerBand: number;

    if (prevUpperBand === null || prevLowerBand === null) {
      finalUpperBand = basicUpperBand;
      finalLowerBand = basicLowerBand;
    } else {
      finalUpperBand = (basicUpperBand < prevUpperBand || candle.close > prevUpperBand)
        ? basicUpperBand : prevUpperBand;
      finalLowerBand = (basicLowerBand > prevLowerBand || candle.close < prevLowerBand)
        ? basicLowerBand : prevLowerBand;
    }

    let trend: 'bullish' | 'bearish';

    if (prevSuperTrend === null) {
      trend = candle.close <= hl2 ? 'bearish' : 'bullish';
    } else if (prevTrend === 'bullish') {
      trend = candle.close < prevLowerBand ? 'bearish' : 'bullish';
    } else {
      trend = candle.close > prevUpperBand ? 'bullish' : 'bearish';
    }

    // Detect signal on trend change
    if (prevTrend !== trend && i > 0) {
      signals.push({
        time: candle.time,
        type: trend === 'bullish' ? 'buy' : 'sell',
        price: candle.close,
      });
    }

    prevUpperBand = finalUpperBand;
    prevLowerBand = finalLowerBand;
    prevSuperTrend = trend === 'bullish' ? finalLowerBand : finalUpperBand;
    prevTrend = trend;
  }

  return signals;
}

// ==================== 2. VWAP ====================

/**
 * Volume Weighted Average Price (VWAP)
 *
 * VWAP calculates the average price weighted by volume.
 * It's commonly used as a trading benchmark by institutional investors.
 *
 * Formula:
 * VWAP = Σ(Typical Price × Volume) / Σ(Volume)
 *
 * Where Typical Price = (High + Low + Close) / 3
 */
export function calculateVWAP(
  candles: Candle[],
  config: Partial<VWAPConfig> = {}
): IndicatorResult {
  const period = config.period; // If undefined, use cumulative VWAP

  const vwapValues: (number | null)[] = [];
  const upperBandValues: (number | null)[] = [];
  const lowerBandValues: (number | null)[] = [];

  if (period) {
    // Rolling VWAP
    for (let i = 0; i < candles.length; i++) {
      if (i < period - 1) {
        vwapValues.push(null);
        upperBandValues.push(null);
        lowerBandValues.push(null);
        continue;
      }

      let sumTPV = 0; // Sum of Typical Price × Volume
      let sumVolume = 0;
      let sumTPV2 = 0; // For standard deviation

      for (let j = i - period + 1; j <= i; j++) {
        const tp = typicalPrice(candles[j]);
        const vol = candles[j].volume;
        sumTPV += tp * vol;
        sumVolume += vol;
        sumTPV2 += tp * tp * vol;
      }

      const vwap = sumTPV / sumVolume;
      vwapValues.push(vwap);

      // Standard deviation bands
      const variance = (sumTPV2 / sumVolume) - (vwap * vwap);
      const stdDev = Math.sqrt(Math.max(0, variance));
      upperBandValues.push(vwap + stdDev);
      lowerBandValues.push(vwap - stdDev);
    }
  } else {
    // Cumulative VWAP (session VWAP)
    let cumTPV = 0;
    let cumVolume = 0;
    let cumTPV2 = 0;

    for (const candle of candles) {
      const tp = typicalPrice(candle);
      const vol = candle.volume;

      cumTPV += tp * vol;
      cumVolume += vol;
      cumTPV2 += tp * tp * vol;

      const vwap = cumTPV / cumVolume;
      vwapValues.push(vwap);

      const variance = (cumTPV2 / cumVolume) - (vwap * vwap);
      const stdDev = Math.sqrt(Math.max(0, variance));
      upperBandValues.push(vwap + stdDev);
      lowerBandValues.push(vwap - stdDev);
    }
  }

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
    id: 'vwap',
    overlay: true,
    lines: [
      { name: 'vwap', data: buildLineData(vwapValues), color: '#FF6D00' },
      { name: 'upper', data: buildLineData(upperBandValues), color: '#FF6D0050' },
      { name: 'lower', data: buildLineData(lowerBandValues), color: '#FF6D0050' },
    ],
    histograms: [],
  };
}

/**
 * Calculate VWAP from tick data
 */
export function calculateVWAPFromTicks(
  ticks: Array<{ price: number; volume: number }>
): number {
  let sumPV = 0;
  let sumVolume = 0;

  for (const tick of ticks) {
    sumPV += tick.price * tick.volume;
    sumVolume += tick.volume;
  }

  return sumVolume > 0 ? sumPV / sumVolume : 0;
}

// ==================== 3. HEIKIN-ASHI ====================

/**
 * Heikin-Ashi Candles
 *
 * A technique for smoothing price action to identify trends more clearly.
 * Uses modified open, high, low, close calculations.
 *
 * Formula:
 * HA Close = (Open + High + Low + Close) / 4
 * HA Open = (Previous HA Open + Previous HA Close) / 2
 * HA High = Max(High, HA Open, HA Close)
 * HA Low = Min(Low, HA Open, HA Close)
 */
export function calculateHeikinAshi(candles: Candle[]): HeikinAshiBar[] {
  const haBars: HeikinAshiBar[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    let haOpen: number;
    let haClose: number;
    let haHigh: number;
    let haLow: number;

    // HA Close is always the average
    haClose = (candle.open + candle.high + candle.low + candle.close) / 4;

    if (i === 0) {
      // First HA bar: open = (first open + first close) / 2
      haOpen = (candle.open + candle.close) / 2;
    } else {
      // HA Open = (previous HA Open + previous HA Close) / 2
      haOpen = (haBars[i - 1].open + haBars[i - 1].close) / 2;
    }

    // HA High = max(high, haOpen, haClose)
    haHigh = Math.max(candle.high, haOpen, haClose);

    // HA Low = min(low, haOpen, haClose)
    haLow = Math.min(candle.low, haOpen, haClose);

    const trend = haClose >= haOpen ? 'bullish' : 'bearish';

    haBars.push({
      time: candle.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      trend,
    });
  }

  return haBars;
}

/**
 * Heikin-Ashi as indicator result for chart rendering
 */
export function calculateHeikinAshiIndicator(candles: Candle[]): IndicatorResult {
  const haBars = calculateHeikinAshi(candles);

  const openValues = haBars.map(ha => ha.open);
  const closeValues = haBars.map(ha => ha.close);
  const highValues = haBars.map(ha => ha.high);
  const lowValues = haBars.map(ha => ha.low);

  const buildLineData = (values: number[]): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => ({
      time: c.time,
      value: values[i],
    }));
  };

  return {
    id: 'heikin_ashi',
    overlay: true,
    lines: [
      { name: 'ha_open', data: buildLineData(openValues), color: '#9C27B0' },
      { name: 'ha_close', data: buildLineData(closeValues), color: '#2962FF' },
      { name: 'ha_high', data: buildLineData(highValues), color: '#26A69A80' },
      { name: 'ha_low', data: buildLineData(lowValues), color: '#EF535080' },
    ],
    histograms: [],
  };
}

/**
 * Detect Heikin-Ashi trend signals
 */
export function getHeikinAshiSignals(candles: Candle[]): Array<{
  time: Time;
  type: 'buy' | 'sell';
  reason: string;
}> {
  const haBars = calculateHeikinAshi(candles);
  const signals: Array<{ time: Time; type: 'buy' | 'sell'; reason: string }> = [];

  for (let i = 1; i < haBars.length; i++) {
    const prev = haBars[i - 1];
    const curr = haBars[i];

    // Trend change: bearish to bullish
    if (prev.trend === 'bearish' && curr.trend === 'bullish') {
      signals.push({
        time: curr.time,
        type: 'buy',
        reason: 'Heikin-Ashi trend changed to bullish',
      });
    }

    // Trend change: bullish to bearish
    if (prev.trend === 'bullish' && curr.trend === 'bearish') {
      signals.push({
        time: curr.time,
        type: 'sell',
        reason: 'Heikin-Ashi trend changed to bearish',
      });
    }
  }

  return signals;
}

// ==================== 4. RENKO ====================

/**
 * Renko Charts
 *
 * Renko charts filter out noise by only showing price movements that
 * exceed a predefined brick size. Time is not a factor in Renko charts.
 *
 * A new brick is drawn when price moves by the brick size:
 * - Up brick (green): when price rises by brick size
 * - Down brick (red): when price falls by 2 × brick size (to reverse)
 */
export function calculateRenko(
  candles: Candle[],
  config: Partial<RenkoConfig> = {}
): RenkoBrick[] {
  let brickSize = config.brickSize ?? 1;
  const useATR = config.useATR ?? false;
  const atrPeriod = config.atrPeriod ?? 14;

  // Calculate dynamic brick size using ATR
  if (useATR) {
    const atrValues = atr(candles, atrPeriod);
    const lastAtr = atrValues[atrValues.length - 1];
    if (lastAtr !== null) {
      brickSize = lastAtr;
    }
  }

  const bricks: RenkoBrick[] = [];
  let currentPrice = candles[0].close;
  let brickNumber = 0;

  // First brick
  bricks.push({
    time: candles[0].time,
    price: currentPrice,
    type: 'up',
    brickNumber: brickNumber++,
  });

  for (let i = 1; i < candles.length; i++) {
    const close = candles[i].close;
    const lastBrick = bricks[bricks.length - 1];
    const priceDiff = close - lastBrick.price;

    if (lastBrick.type === 'up') {
      // Currently in uptrend
      if (priceDiff >= brickSize) {
        // Continue up
        const numBricks = Math.floor(priceDiff / brickSize);
        for (let j = 0; j < numBricks; j++) {
          bricks.push({
            time: candles[i].time,
            price: lastBrick.price + (j + 1) * brickSize,
            type: 'up',
            brickNumber: brickNumber++,
          });
        }
      } else if (priceDiff <= -2 * brickSize) {
        // Reverse down (need 2 brick sizes)
        const numBricks = Math.floor(Math.abs(priceDiff) / brickSize);
        for (let j = 0; j < numBricks; j++) {
          bricks.push({
            time: candles[i].time,
            price: lastBrick.price - (j + 1) * brickSize,
            type: 'down',
            brickNumber: brickNumber++,
          });
        }
      }
    } else {
      // Currently in downtrend
      if (priceDiff <= -brickSize) {
        // Continue down
        const numBricks = Math.floor(Math.abs(priceDiff) / brickSize);
        for (let j = 0; j < numBricks; j++) {
          bricks.push({
            time: candles[i].time,
            price: lastBrick.price - (j + 1) * brickSize,
            type: 'down',
            brickNumber: brickNumber++,
          });
        }
      } else if (priceDiff >= 2 * brickSize) {
        // Reverse up (need 2 brick sizes)
        const numBricks = Math.floor(priceDiff / brickSize);
        for (let j = 0; j < numBricks; j++) {
          bricks.push({
            time: candles[i].time,
            price: lastBrick.price + (j + 1) * brickSize,
            type: 'up',
            brickNumber: brickNumber++,
          });
        }
      }
    }
  }

  return bricks;
}

/**
 * Renko as indicator result
 */
export function calculateRenkoIndicator(
  candles: Candle[],
  config: Partial<RenkoConfig> = {}
): IndicatorResult {
  const bricks = calculateRenko(candles, config);

  // Map bricks back to candle times
  const upValues: (number | null)[] = new Array(candles.length).fill(null);
  const downValues: (number | null)[] = new Array(candles.length).fill(null);

  // Simple mapping: use last brick price at each candle time
  let brickIndex = 0;
  for (let i = 0; i < candles.length; i++) {
    // Find all bricks up to this candle
    while (brickIndex < bricks.length && bricks[brickIndex].time <= candles[i].time) {
      const brick = bricks[brickIndex];
      if (brick.type === 'up') {
        upValues[i] = brick.price;
        downValues[i] = null;
      } else {
        downValues[i] = brick.price;
        upValues[i] = null;
      }
      brickIndex++;
    }
  }

  const buildLineData = (values: (number | null)[]): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = values[i];
      if (value !== null) {
        return { time: c.time, value };
      }
      return { time: c.time };
    });
  };

  return {
    id: 'renko',
    overlay: true,
    lines: [
      { name: 'renko_up', data: buildLineData(upValues), color: '#26A69A' },
      { name: 'renko_down', data: buildLineData(downValues), color: '#EF5350' },
    ],
    histograms: [],
  };
}

/**
 * Get Renko reversal signals
 */
export function getRenkoSignals(
  candles: Candle[],
  config: Partial<RenkoConfig> = {}
): Array<{ time: Time; type: 'buy' | 'sell'; price: number }> {
  const bricks = calculateRenko(candles, config);
  const signals: Array<{ time: Time; type: 'buy' | 'sell'; price: number }> = [];

  for (let i = 1; i < bricks.length; i++) {
    if (bricks[i].type !== bricks[i - 1].type) {
      signals.push({
        time: bricks[i].time,
        type: bricks[i].type === 'up' ? 'buy' : 'sell',
        price: bricks[i].price,
      });
    }
  }

  return signals;
}

// ==================== 5. KELTNER CHANNEL ====================

/**
 * Keltner Channel
 *
 * A volatility-based envelope that uses ATR for band width.
 * Similar to Bollinger Bands but uses ATR instead of standard deviation.
 *
 * Formula:
 * Middle Line = EMA(close, period)
 * Upper Band = EMA + (Multiplier × ATR)
 * Lower Band = EMA - (Multiplier × ATR)
 */
export function calculateKeltnerChannel(
  candles: Candle[],
  config: Partial<KeltnerChannelConfig> = {}
): IndicatorResult {
  const period = config.period ?? 20;
  const multiplier = config.multiplier ?? 2;
  const atrPeriod = config.atrPeriod ?? 10;

  const closes = candles.map(c => c.close);
  const emaValues = ema(closes, period);
  const atrValues = atr(candles, atrPeriod);

  const upperValues: (number | null)[] = [];
  const lowerValues: (number | null)[] = [];
  const middleValues: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    const emaVal = emaValues[i];
    const atrVal = atrValues[i];

    if (emaVal === null || atrVal === null) {
      upperValues.push(null);
      lowerValues.push(null);
      middleValues.push(null);
    } else {
      middleValues.push(emaVal);
      upperValues.push(emaVal + multiplier * atrVal);
      lowerValues.push(emaVal - multiplier * atrVal);
    }
  }

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
    id: 'keltner_channel',
    overlay: true,
    lines: [
      { name: 'upper', data: buildLineData(upperValues), color: '#2962FF' },
      { name: 'middle', data: buildLineData(middleValues), color: '#FF6D00' },
      { name: 'lower', data: buildLineData(lowerValues), color: '#2962FF' },
    ],
    histograms: [],
  };
}

/**
 * Keltner Channel signals
 */
export function getKeltnerChannelSignals(
  candles: Candle[],
  config: Partial<KeltnerChannelConfig> = {}
): Array<{ time: Time; type: 'buy' | 'sell'; reason: string }> {
  const period = config.period ?? 20;
  const multiplier = config.multiplier ?? 2;
  const atrPeriod = config.atrPeriod ?? 10;

  const closes = candles.map(c => c.close);
  const emaValues = ema(closes, period);
  const atrValues = atr(candles, atrPeriod);

  const signals: Array<{ time: Time; type: 'buy' | 'sell'; reason: string }> = [];

  for (let i = Math.max(period, atrPeriod); i < candles.length; i++) {
    const emaVal = emaValues[i];
    const atrVal = atrValues[i];
    const close = closes[i];
    const prevClose = closes[i - 1];
    const prevEma = emaValues[i - 1];
    const prevAtr = atrValues[i - 1];

    if (!emaVal || !atrVal || !prevEma || !prevAtr) continue;

    const upper = emaVal + multiplier * atrVal;
    const lower = emaVal - multiplier * atrVal;
    const prevUpper = prevEma + multiplier * prevAtr;
    const prevLower = prevEma - multiplier * prevAtr;

    // Breakout above upper band
    if (prevClose <= prevUpper && close > upper) {
      signals.push({
        time: candles[i].time,
        type: 'buy',
        reason: 'Price broke above Keltner Channel upper band',
      });
    }

    // Breakdown below lower band
    if (prevClose >= prevLower && close < lower) {
      signals.push({
        time: candles[i].time,
        type: 'sell',
        reason: 'Price broke below Keltner Channel lower band',
      });
    }

    // Return to middle from oversold
    if (prevClose < prevLower && close >= emaVal) {
      signals.push({
        time: candles[i].time,
        type: 'buy',
        reason: 'Price returned to Keltner middle from oversold',
      });
    }

    // Return to middle from overbought
    if (prevClose > prevUpper && close <= emaVal) {
      signals.push({
        time: candles[i].time,
        type: 'sell',
        reason: 'Price returned to Keltner middle from overbought',
      });
    }
  }

  return signals;
}

// ==================== 6. MASS INDEX ====================

/**
 * Mass Index
 *
 * A reversal indicator that identifies range bulges that can signal
 * trend reversals. It measures the narrowing and widening of the
 * range between high and low prices.
 *
 * Formula:
 * Single EMA = EMA(High - Low, emaPeriod)
 * Double EMA = EMA(Single EMA, emaPeriod)
 * EMA Ratio = Single EMA / Double EMA
 * Mass Index = Sum(EMA Ratio, sumPeriod)
 *
 * A "reversal bulge" occurs when Mass Index rises above 27 and then
 * drops below 26.5, signaling a potential price reversal.
 */
export function calculateMassIndex(
  candles: Candle[],
  config: Partial<MassIndexConfig> = {}
): IndicatorResult {
  const emaPeriod = config.emaPeriod ?? 9;
  const sumPeriod = config.sumPeriod ?? 25;

  // Calculate high - low range
  const ranges = candles.map(c => c.high - c.low);

  // Single EMA of range
  const singleEma = ema(ranges, emaPeriod);

  // Double EMA (EMA of single EMA)
  const singleEmaValues = singleEma.filter(v => v !== null) as number[];
  const doubleEmaFull = ema(singleEmaValues, emaPeriod);

  // Map double EMA back to original indices
  const doubleEma: (number | null)[] = new Array(candles.length).fill(null);
  let singleIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (singleEma[i] !== null) {
      doubleEma[i] = doubleEmaFull[singleIdx] ?? null;
      singleIdx++;
    }
  }

  // Calculate EMA ratio
  const emaRatio: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (singleEma[i] !== null && doubleEma[i] !== null && doubleEma[i] !== 0) {
      emaRatio.push(singleEma[i]! / doubleEma[i]!);
    } else {
      emaRatio.push(null);
    }
  }

  // Calculate Mass Index (sum of EMA ratios)
  const massIndexValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = sumPeriod - 1; i < candles.length; i++) {
    let sum = 0;
    let valid = true;

    for (let j = i - sumPeriod + 1; j <= i; j++) {
      if (emaRatio[j] === null) {
        valid = false;
        break;
      }
      sum += emaRatio[j]!;
    }

    if (valid) {
      massIndexValues[i] = sum;
    }
  }

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
    id: 'mass_index',
    overlay: false,
    lines: [
      { name: 'mass_index', data: buildLineData(massIndexValues), color: '#9C27B0' },
    ],
    histograms: [],
  };
}

/**
 * Mass Index reversal signals
 * 
 * A reversal bulge occurs when:
 * 1. Mass Index rises above 27
 * 2. Mass Index then falls below 26.5
 * 
 * The signal is triggered at step 2, indicating a potential reversal.
 */
export function getMassIndexSignals(
  candles: Candle[],
  config: Partial<MassIndexConfig> = {}
): Array<{ time: Time; type: 'buy' | 'sell'; reason: string }> {
  const emaPeriod = config.emaPeriod ?? 9;
  const sumPeriod = config.sumPeriod ?? 25;

  // Calculate ranges
  const ranges = candles.map(c => c.high - c.low);
  const singleEma = ema(ranges, emaPeriod);
  const singleEmaValues = singleEma.filter(v => v !== null) as number[];
  const doubleEmaFull = ema(singleEmaValues, emaPeriod);

  const doubleEma: (number | null)[] = new Array(candles.length).fill(null);
  let singleIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (singleEma[i] !== null) {
      doubleEma[i] = doubleEmaFull[singleIdx] ?? null;
      singleIdx++;
    }
  }

  const emaRatio: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (singleEma[i] !== null && doubleEma[i] !== null && doubleEma[i] !== 0) {
      emaRatio.push(singleEma[i]! / doubleEma[i]!);
    } else {
      emaRatio.push(null);
    }
  }

  const massIndexValues: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = sumPeriod - 1; i < candles.length; i++) {
    let sum = 0;
    let valid = true;
    for (let j = i - sumPeriod + 1; j <= i; j++) {
      if (emaRatio[j] === null) {
        valid = false;
        break;
      }
      sum += emaRatio[j]!;
    }
    if (valid) massIndexValues[i] = sum;
  }

  const signals: Array<{ time: Time; type: 'buy' | 'sell'; reason: string }> = [];

  // Track reversal bulge state
  let wasAbove27 = false;

  for (let i = 1; i < candles.length; i++) {
    const prevMI = massIndexValues[i - 1];
    const currMI = massIndexValues[i];

    if (prevMI === null || currMI === null) continue;

    // Check for rise above 27
    if (currMI > 27) {
      wasAbove27 = true;
    }

    // Check for drop below 26.5 after being above 27
    if (wasAbove27 && prevMI > 26.5 && currMI <= 26.5) {
      // Determine signal direction based on price trend
      // If price was going up, expect reversal down (sell)
      // If price was going down, expect reversal up (buy)
      const priceChange = candles[i].close - candles[Math.max(0, i - 5)].close;

      signals.push({
        time: candles[i].time,
        type: priceChange > 0 ? 'sell' : 'buy',
        reason: `Mass Index reversal bulge: dropped below 26.5 after exceeding 27`,
      });

      wasAbove27 = false; // Reset state
    }
  }

  return signals;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Format SuperTrend for display
 */
export function formatSuperTrend(value: number, trend: 'bullish' | 'bearish'): string {
  const arrow = trend === 'bullish' ? '↑' : '↓';
  return `SuperTrend: ${value.toFixed(2)} ${arrow}`;
}

/**
 * Format Heikin-Ashi bar for display
 */
export function formatHeikinAshi(ha: HeikinAshiBar): string {
  const trend = ha.trend === 'bullish' ? '🟢' : '🔴';
  return `${trend} HA: O=${ha.open.toFixed(2)} H=${ha.high.toFixed(2)} L=${ha.low.toFixed(2)} C=${ha.close.toFixed(2)}`;
}

/**
 * Check if price is above/below VWAP
 */
export function checkVWAPPosition(
  price: number,
  vwap: number,
  upperBand: number,
  lowerBand: number
): { position: 'above' | 'below' | 'inside'; zscore: number } {
  const bandwidth = upperBand - lowerBand;
  const zscore = bandwidth > 0 ? (price - vwap) / (bandwidth / 2) : 0;

  if (price > upperBand) {
    return { position: 'above', zscore };
  } else if (price < lowerBand) {
    return { position: 'below', zscore };
  }
  return { position: 'inside', zscore };
}
