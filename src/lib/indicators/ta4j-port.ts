/**
 * Ta4j Ported Indicators
 *
 * Indicators ported from Ta4j (https://github.com/ta4j/ta4j) - 
 * Java library with 200+ technical indicators.
 *
 * Implemented indicators:
 * 1. SuperTrend - Popular trend-following indicator
 * 2. VWAP - Volume Weighted Average Price
 * 3. Heikin-Ashi - Smoothed candlestick technique
 * 4. Renko - Brick-based price movement
 * 5. Keltner Channel - ATR-based volatility channel
 * 6. Mass Index - Reversal detection indicator
 */

import type { Time, LineData, HistogramData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

/**
 * SuperTrend result
 */
export interface SuperTrendResult {
  time: Time;
  value: number;
  direction: 1 | -1; // 1 = bullish, -1 = bearish
  trendChanged: boolean;
  upperBand: number;
  lowerBand: number;
}

/**
 * VWAP result
 */
export interface VWAPResult {
  time: Time;
  vwap: number;
  upperBand: number;  // VWAP + 1 stddev
  lowerBand: number;  // VWAP - 1 stddev
}

/**
 * Heikin-Ashi candle
 */
export interface HeikinAshiCandle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Renko brick
 */
export interface RenkoBrick {
  time: Time;
  open: number;
  close: number;
  direction: 1 | -1;
  brickNumber: number;
}

/**
 * Keltner Channel result
 */
export interface KeltnerChannelResult {
  time: Time;
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

/**
 * Mass Index result
 */
export interface MassIndexResult {
  time: Time;
  value: number;
  reversalSignal: boolean; // True when mass index > 27 then < 26.5
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate EMA
 */
function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;

  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;

  // Calculate EMA
  let prevEma = result[period - 1] as number;
  for (let i = period; i < data.length; i++) {
    const currentEma = (data[i] - prevEma) * multiplier + prevEma;
    result[i] = currentEma;
    prevEma = currentEma;
  }

  return result;
}

/**
 * Calculate ATR
 */
function atr(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  const trValues: number[] = [];

  // Calculate True Range
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

  // Calculate ATR using Wilder's smoothing (like EMA)
  if (trValues.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trValues[i];
  }
  result[period - 1] = sum / period;

  // Wilder's smoothing
  let prevAtr = result[period - 1] as number;
  for (let i = period; i < trValues.length; i++) {
    const currentAtr = (prevAtr * (period - 1) + trValues[i]) / period;
    result[i] = currentAtr;
    prevAtr = currentAtr;
  }

  return result;
}

/**
 * Calculate highest high over period
 */
function highestHigh(candles: Candle[], period: number, endIndex: number): number {
  let highest = -Infinity;
  const startIndex = Math.max(0, endIndex - period + 1);

  for (let i = startIndex; i <= endIndex; i++) {
    highest = Math.max(highest, candles[i].high);
  }

  return highest;
}

/**
 * Calculate lowest low over period
 */
function lowestLow(candles: Candle[], period: number, endIndex: number): number {
  let lowest = Infinity;
  const startIndex = Math.max(0, endIndex - period + 1);

  for (let i = startIndex; i <= endIndex; i++) {
    lowest = Math.min(lowest, candles[i].low);
  }

  return lowest;
}

// ==================== SUPERTREND ====================

/**
 * SuperTrend Indicator
 *
 * A trend-following indicator that uses ATR to determine trend direction.
 * Popular for identifying trend direction and potential reversal points.
 *
 * Formula:
 * - Basic Upper Band = (High + Low) / 2 + Multiplier × ATR
 * - Basic Lower Band = (High + Low) / 2 - Multiplier × ATR
 * - Final Upper Band = Basic Upper if Basic Upper < prev Final Upper OR close > prev Final Upper
 * - Final Lower Band = Basic Lower if Basic Lower > prev Final Lower OR close < prev Final Lower
 * - SuperTrend = Final Upper if close <= Final Upper, else Final Lower
 */
export function calculateSuperTrend(
  candles: Candle[],
  config: { period?: number; multiplier?: number } = {}
): IndicatorResult {
  const period = config.period ?? 10;
  const multiplier = config.multiplier ?? 3;

  const atrValues = atr(candles, period);
  const superTrendValues: (number | null)[] = new Array(candles.length).fill(null);
  const directionValues: (number | null)[] = new Array(candles.length).fill(null);
  const upperBandValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowerBandValues: (number | null)[] = new Array(candles.length).fill(null);

  // Track previous values
  let prevUpperBand: number | null = null;
  let prevLowerBand: number | null = null;
  let prevSuperTrend: number | null = null;
  let prevDirection = 1;

  for (let i = period - 1; i < candles.length; i++) {
    const atrVal = atrValues[i];
    if (atrVal === null) continue;

    const candle = candles[i];
    const hl2 = (candle.high + candle.low) / 2;

    // Basic bands
    const basicUpperBand = hl2 + multiplier * atrVal;
    const basicLowerBand = hl2 - multiplier * atrVal;

    // Final bands calculation
    let finalUpperBand: number;
    let finalLowerBand: number;

    if (prevUpperBand === null || basicUpperBand < prevUpperBand || candle.close > prevUpperBand) {
      finalUpperBand = basicUpperBand;
    } else {
      finalUpperBand = prevUpperBand;
    }

    if (prevLowerBand === null || basicLowerBand > prevLowerBand || candle.close < prevLowerBand) {
      finalLowerBand = basicLowerBand;
    } else {
      finalLowerBand = prevLowerBand;
    }

    // Determine SuperTrend value and direction
    let superTrend: number;
    let direction: number;

    if (prevSuperTrend === null) {
      // First calculation
      if (candle.close <= finalUpperBand) {
        superTrend = finalUpperBand;
        direction = -1; // Bearish
      } else {
        superTrend = finalLowerBand;
        direction = 1; // Bullish
      }
    } else {
      if (prevSuperTrend === prevUpperBand) {
        // Previous was bearish
        if (candle.close <= finalUpperBand) {
          superTrend = finalUpperBand;
          direction = -1;
        } else {
          superTrend = finalLowerBand;
          direction = 1;
        }
      } else {
        // Previous was bullish
        if (candle.close >= finalLowerBand) {
          superTrend = finalLowerBand;
          direction = 1;
        } else {
          superTrend = finalUpperBand;
          direction = -1;
        }
      }
    }

    superTrendValues[i] = superTrend;
    directionValues[i] = direction;
    upperBandValues[i] = finalUpperBand;
    lowerBandValues[i] = finalLowerBand;

    prevUpperBand = finalUpperBand;
    prevLowerBand = finalLowerBand;
    prevSuperTrend = superTrend;
    prevDirection = direction;
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
    id: 'supertrend',
    overlay: true,
    lines: [
      { name: 'supertrend', data: buildLineData(superTrendValues), color: '#2962FF' },
      { name: 'upperBand', data: buildLineData(upperBandValues), color: '#EF5350' },
      { name: 'lowerBand', data: buildLineData(lowerBandValues), color: '#26A69A' },
    ],
    histograms: [],
  };
}

/**
 * Get SuperTrend with direction info
 */
export function getSuperTrendWithDirection(
  candles: Candle[],
  config: { period?: number; multiplier?: number } = {}
): SuperTrendResult[] {
  const period = config.period ?? 10;
  const multiplier = config.multiplier ?? 3;

  const atrValues = atr(candles, period);
  const results: SuperTrendResult[] = [];

  let prevUpperBand: number | null = null;
  let prevLowerBand: number | null = null;
  let prevSuperTrend: number | null = null;
  let prevDirection = 1;

  for (let i = period - 1; i < candles.length; i++) {
    const atrVal = atrValues[i];
    if (atrVal === null) continue;

    const candle = candles[i];
    const hl2 = (candle.high + candle.low) / 2;

    const basicUpperBand = hl2 + multiplier * atrVal;
    const basicLowerBand = hl2 - multiplier * atrVal;

    let finalUpperBand: number;
    let finalLowerBand: number;

    if (prevUpperBand === null || basicUpperBand < prevUpperBand || candle.close > prevUpperBand) {
      finalUpperBand = basicUpperBand;
    } else {
      finalUpperBand = prevUpperBand;
    }

    if (prevLowerBand === null || basicLowerBand > prevLowerBand || candle.close < prevLowerBand) {
      finalLowerBand = basicLowerBand;
    } else {
      finalLowerBand = prevLowerBand;
    }

    let superTrend: number;
    let direction: number;

    if (prevSuperTrend === null) {
      if (candle.close <= finalUpperBand) {
        superTrend = finalUpperBand;
        direction = -1;
      } else {
        superTrend = finalLowerBand;
        direction = 1;
      }
    } else {
      if (prevSuperTrend === prevUpperBand) {
        if (candle.close <= finalUpperBand) {
          superTrend = finalUpperBand;
          direction = -1;
        } else {
          superTrend = finalLowerBand;
          direction = 1;
        }
      } else {
        if (candle.close >= finalLowerBand) {
          superTrend = finalLowerBand;
          direction = 1;
        } else {
          superTrend = finalUpperBand;
          direction = -1;
        }
      }
    }

    const trendChanged = prevDirection !== direction;

    results.push({
      time: candle.time,
      value: superTrend,
      direction: direction as 1 | -1,
      trendChanged,
      upperBand: finalUpperBand,
      lowerBand: finalLowerBand,
    });

    prevUpperBand = finalUpperBand;
    prevLowerBand = finalLowerBand;
    prevSuperTrend = superTrend;
    prevDirection = direction;
  }

  return results;
}

// ==================== VWAP ====================

/**
 * Volume Weighted Average Price (VWAP)
 *
 * VWAP is the average price a security has traded at throughout the day,
 * based on both volume and price. It's important because it provides
 * traders with insight into both the trend and value of a security.
 *
 * Formula:
 * - VWAP = Σ(Price × Volume) / Σ(Volume)
 * - Typical Price = (High + Low + Close) / 3
 *
 * Typically reset at the start of each trading session.
 */
export function calculateVWAP(
  candles: Candle[],
  config: { stddevPeriod?: number; resetDaily?: boolean } = {}
): IndicatorResult {
  const stddevPeriod = config.stddevPeriod ?? 20;

  const vwapValues: (number | null)[] = new Array(candles.length).fill(null);
  const upperBandValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowerBandValues: (number | null)[] = new Array(candles.length).fill(null);

  // Cumulative values for VWAP calculation
  let cumulativeTPV = 0; // Typical Price × Volume
  let cumulativeVolume = 0;

  // For standard deviation bands
  const tpvSquaredHistory: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const tpv = typicalPrice * candle.volume;

    // TODO: Implement daily reset if resetDaily is true
    // For now, cumulative VWAP without reset

    cumulativeTPV += tpv;
    cumulativeVolume += candle.volume;

    if (cumulativeVolume > 0) {
      const vwap = cumulativeTPV / cumulativeVolume;
      vwapValues[i] = vwap;

      // Calculate standard deviation for bands
      tpvSquaredHistory.push(typicalPrice);
      if (tpvSquaredHistory.length > stddevPeriod) {
        tpvSquaredHistory.shift();
      }

      if (tpvSquaredHistory.length >= 2) {
        // Calculate stddev of typical prices around VWAP
        const mean = tpvSquaredHistory.reduce((a, b) => a + b, 0) / tpvSquaredHistory.length;
        const squaredDiffs = tpvSquaredHistory.map(p => Math.pow(p - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / tpvSquaredHistory.length;
        const stddev = Math.sqrt(variance);

        upperBandValues[i] = vwap + stddev;
        lowerBandValues[i] = vwap - stddev;
      }
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
      { name: 'upperBand', data: buildLineData(upperBandValues), color: '#FF6D0080' },
      { name: 'lowerBand', data: buildLineData(lowerBandValues), color: '#FF6D0080' },
    ],
    histograms: [],
  };
}

/**
 * Calculate VWAP for a specific period (Rolling VWAP)
 */
export function calculateRollingVWAP(
  candles: Candle[],
  period: number
): IndicatorResult {
  const vwapValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = period - 1; i < candles.length; i++) {
    let sumTPV = 0;
    let sumVolume = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const candle = candles[j];
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      sumTPV += typicalPrice * candle.volume;
      sumVolume += candle.volume;
    }

    if (sumVolume > 0) {
      vwapValues[i] = sumTPV / sumVolume;
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
    id: 'vwap_rolling',
    overlay: true,
    lines: [
      { name: 'vwap', data: buildLineData(vwapValues), color: '#FF6D00' },
    ],
    histograms: [],
  };
}

// ==================== HEIKIN-ASHI ====================

/**
 * Heikin-Ashi Candles
 *
 * A Japanese technique that uses modified candlestick values to filter
 * out market noise and better identify market trends.
 *
 * Formula:
 * - HA Close = (Open + High + Low + Close) / 4
 * - HA Open = (previous HA Open + previous HA Close) / 2
 * - HA High = max(High, HA Open, HA Close)
 * - HA Low = min(Low, HA Open, HA Close)
 */
export function calculateHeikinAshi(candles: Candle[]): HeikinAshiCandle[] {
  const haCandles: HeikinAshiCandle[] = [];

  let prevHaOpen: number | null = null;
  let prevHaClose: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // HA Close is the average of the current candle
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;

    // HA Open is the average of the previous HA Open and HA Close
    let haOpen: number;
    if (prevHaOpen === null || prevHaClose === null) {
      haOpen = (candle.open + candle.close) / 2;
    } else {
      haOpen = (prevHaOpen + prevHaClose) / 2;
    }

    // HA High is the maximum of High, HA Open, HA Close
    const haHigh = Math.max(candle.high, haOpen, haClose);

    // HA Low is the minimum of Low, HA Open, HA Close
    const haLow = Math.min(candle.low, haOpen, haClose);

    haCandles.push({
      time: candle.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  return haCandles;
}

/**
 * Calculate Heikin-Ashi as IndicatorResult for chart display
 */
export function calculateHeikinAshiIndicator(candles: Candle[]): IndicatorResult {
  const haCandles = calculateHeikinAshi(candles);

  const buildLineData = (getVal: (ha: HeikinAshiCandle) => number): (LineData<Time> | WhitespaceData<Time>)[] => {
    return haCandles.map(ha => ({
      time: ha.time,
      value: getVal(ha),
    }));
  };

  return {
    id: 'heikin_ashi',
    overlay: true,
    lines: [
      { name: 'ha_open', data: buildLineData(ha => ha.open), color: '#9C27B0' },
      { name: 'ha_close', data: buildLineData(ha => ha.close), color: '#9C27B0' },
    ],
    histograms: [],
  };
}

/**
 * Detect Heikin-Ashi trend signals
 */
export function getHeikinAshiSignals(haCandles: HeikinAshiCandle[]): Array<{
  time: Time;
  type: 'bullish' | 'bearish';
  reason: string;
}> {
  const signals: Array<{ time: Time; type: 'bullish' | 'bearish'; reason: string }> = [];

  for (let i = 1; i < haCandles.length; i++) {
    const curr = haCandles[i];
    const prev = haCandles[i - 1];

    // Bullish signals
    if (curr.close > curr.open && prev.close <= prev.open) {
      signals.push({
        time: curr.time,
        type: 'bullish',
        reason: 'HA candle turned bullish',
      });
    }

    // Bearish signals
    if (curr.close < curr.open && prev.close >= prev.open) {
      signals.push({
        time: curr.time,
        type: 'bearish',
        reason: 'HA candle turned bearish',
      });
    }
  }

  return signals;
}

// ==================== RENKO ====================

/**
 * Renko Charts
 *
 * Renko charts are built using price movements rather than time.
 * A new brick is created when the price moves by a specified amount.
 * Bricks are always equal in size and at 45-degree angles.
 *
 * Types:
 * - Fixed brick size (traditional)
 * - ATR-based brick size (adaptive)
 */
export function calculateRenko(
  candles: Candle[],
  config: { brickSize?: number; useATR?: boolean; atrPeriod?: number } = {}
): RenkoBrick[] {
  let brickSize = config.brickSize ?? 0;

  // Calculate ATR-based brick size if requested
  if (config.useATR ?? false) {
    const atrPeriod = config.atrPeriod ?? 14;
    const atrValues = atr(candles, atrPeriod);
    // Use last ATR value as brick size
    for (let i = atrValues.length - 1; i >= 0; i--) {
      if (atrValues[i] !== null) {
        brickSize = atrValues[i]!;
        break;
      }
    }
  }

  if (brickSize <= 0) {
    // Default to 1% of first close price
    const firstClose = candles[0]?.close;
    brickSize = firstClose ? firstClose * 0.01 : 1;
  }

  const bricks: RenkoBrick[] = [];
  let currentPrice = candles[0]?.close ?? 0;
  let brickNumber = 0;

  // Initialize first brick
  let currentDirection: 1 | -1 = 1;
  let currentOpen = currentPrice - brickSize / 2;
  let currentClose = currentPrice + brickSize / 2;

  for (const candle of candles) {
    const price = candle.close;
    const priceDiff = price - currentClose;

    // Check if we need to add new bricks
    const bricksToMove = Math.floor(Math.abs(priceDiff) / brickSize);

    for (let b = 0; b < bricksToMove; b++) {
      brickNumber++;

      if (priceDiff > 0) {
        // Bullish movement
        if (currentDirection === -1) {
          // Reversal - need 2 bricks to reverse
          if (b === 0 && bricksToMove >= 2) {
            currentOpen = currentClose + brickSize;
            currentClose = currentOpen + brickSize;
            currentDirection = 1;
          }
        } else {
          currentOpen = currentClose;
          currentClose = currentOpen + brickSize;
        }
      } else {
        // Bearish movement
        if (currentDirection === 1) {
          // Reversal - need 2 bricks to reverse
          if (b === 0 && bricksToMove >= 2) {
            currentOpen = currentClose - brickSize;
            currentClose = currentOpen - brickSize;
            currentDirection = -1;
          }
        } else {
          currentOpen = currentClose;
          currentClose = currentOpen - brickSize;
        }
      }

      bricks.push({
        time: candle.time,
        open: currentOpen,
        close: currentClose,
        direction: currentDirection,
        brickNumber,
      });
    }
  }

  return bricks;
}

/**
 * Calculate Renko as IndicatorResult
 */
export function calculateRenkoIndicator(
  candles: Candle[],
  config: { brickSize?: number; useATR?: boolean; atrPeriod?: number } = {}
): IndicatorResult {
  const bricks = calculateRenko(candles, config);

  const openValues: (number | null)[] = [];
  const closeValues: (number | null)[] = [];

  // Map bricks to original candle times
  let brickIdx = 0;
  for (const candle of candles) {
    if (brickIdx < bricks.length && bricks[brickIdx].time === candle.time) {
      openValues.push(bricks[brickIdx].open);
      closeValues.push(bricks[brickIdx].close);
      brickIdx++;
    } else {
      openValues.push(null);
      closeValues.push(null);
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
      { name: 'renko_open', data: buildLineData(openValues), color: '#9C27B0' },
      { name: 'renko_close', data: buildLineData(closeValues), color: '#9C27B0' },
    ],
    histograms: [],
  };
}

// ==================== KELTNER CHANNEL ====================

/**
 * Keltner Channel
 *
 * A volatility-based envelope that uses ATR to set channel width.
 * Similar to Bollinger Bands but uses ATR instead of standard deviation.
 *
 * Formula:
 * - Middle Line = EMA(close, period)
 * - Upper Channel = EMA + (ATR × multiplier)
 * - Lower Channel = EMA - (ATR × multiplier)
 */
export function calculateKeltnerChannel(
  candles: Candle[],
  config: { period?: number; atrPeriod?: number; multiplier?: number } = {}
): IndicatorResult {
  const period = config.period ?? 20;
  const atrPeriod = config.atrPeriod ?? period;
  const multiplier = config.multiplier ?? 2;

  const closes = candles.map(c => c.close);
  const emaValues = ema(closes, period);
  const atrValues = atr(candles, atrPeriod);

  const upperValues: (number | null)[] = new Array(candles.length).fill(null);
  const middleValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowerValues: (number | null)[] = new Array(candles.length).fill(null);
  const bandwidthValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const emaVal = emaValues[i];
    const atrVal = atrValues[i];

    if (emaVal !== null && atrVal !== null) {
      middleValues[i] = emaVal;
      upperValues[i] = emaVal + multiplier * atrVal;
      lowerValues[i] = emaVal - multiplier * atrVal;

      // Bandwidth = (Upper - Lower) / Middle
      bandwidthValues[i] = ((upperValues[i]! - lowerValues[i]!) / emaVal) * 100;
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
    id: 'keltner',
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
 * Get Keltner Channel with additional analysis
 */
export function getKeltnerChannelAnalysis(
  candles: Candle[],
  config: { period?: number; atrPeriod?: number; multiplier?: number } = {}
): KeltnerChannelResult[] {
  const period = config.period ?? 20;
  const atrPeriod = config.atrPeriod ?? period;
  const multiplier = config.multiplier ?? 2;

  const closes = candles.map(c => c.close);
  const emaValues = ema(closes, period);
  const atrValues = atr(candles, atrPeriod);

  const results: KeltnerChannelResult[] = [];

  for (let i = 0; i < candles.length; i++) {
    const emaVal = emaValues[i];
    const atrVal = atrValues[i];

    if (emaVal !== null && atrVal !== null) {
      const upper = emaVal + multiplier * atrVal;
      const lower = emaVal - multiplier * atrVal;
      const bandwidth = ((upper - lower) / emaVal) * 100;

      results.push({
        time: candles[i].time,
        upper,
        middle: emaVal,
        lower,
        bandwidth,
      });
    }
  }

  return results;
}

/**
 * Detect Keltner Channel signals
 */
export function getKeltnerChannelSignals(
  candles: Candle[],
  config: { period?: number; atrPeriod?: number; multiplier?: number } = {}
): Array<{ time: Time; type: 'buy' | 'sell'; reason: string }> {
  const analysis = getKeltnerChannelAnalysis(candles, config);
  const signals: Array<{ time: Time; type: 'buy' | 'sell'; reason: string }> = [];

  for (let i = 1; i < analysis.length; i++) {
    const curr = analysis[i];
    const prev = analysis[i - 1];
    const candle = candles[candles.findIndex(c => c.time === curr.time)];

    if (!candle) continue;

    // Price breaks above upper channel
    if (candle.close > curr.upper && candle.open <= prev.upper) {
      signals.push({
        time: curr.time,
        type: 'buy',
        reason: 'Price broke above Keltner upper channel',
      });
    }

    // Price breaks below lower channel
    if (candle.close < curr.lower && candle.open >= prev.lower) {
      signals.push({
        time: curr.time,
        type: 'sell',
        reason: 'Price broke below Keltner lower channel',
      });
    }
  }

  return signals;
}

// ==================== MASS INDEX ====================

/**
 * Mass Index
 *
 * Developed by Donald Dorsey, the Mass Index uses the high-low range
 * to identify trend reversals. It's based on the concept that range
 * expansion precedes trend reversals.
 *
 * Formula:
 * - Single EMA = EMA(High - Low, 9)
 * - Double EMA = EMA(Single EMA, 9)
 * - EMA Ratio = Single EMA / Double EMA
 * - Mass Index = 25-period sum of EMA Ratio
 *
 * Signal: When Mass Index rises above 27 then falls below 26.5,
 * a reversal is expected (known as "reversal bulge").
 */
export function calculateMassIndex(
  candles: Candle[],
  config: { emaPeriod?: number; sumPeriod?: number } = {}
): IndicatorResult {
  const emaPeriod = config.emaPeriod ?? 9;
  const sumPeriod = config.sumPeriod ?? 25;

  // Calculate high-low range
  const ranges = candles.map(c => c.high - c.low);

  // Single EMA of range
  const singleEma = ema(ranges, emaPeriod);

  // Double EMA (EMA of single EMA)
  const singleEmaValues = singleEma.filter(v => v !== null) as number[];
  const doubleEmaValues = ema(singleEmaValues, emaPeriod);

  // Map double EMA back to original indices
  const doubleEma: (number | null)[] = new Array(candles.length).fill(null);
  let singleIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (singleEma[i] !== null) {
      const doubleIdx = singleIdx - emaPeriod + 1;
      if (doubleIdx >= 0 && doubleIdx < doubleEmaValues.length) {
        doubleEma[i] = doubleEmaValues[doubleIdx];
      }
      singleIdx++;
    }
  }

  // Calculate EMA Ratio
  const emaRatio: (number | null)[] = candles.map((_, i) => {
    if (singleEma[i] !== null && doubleEma[i] !== null && doubleEma[i] !== 0) {
      return singleEma[i]! / doubleEma[i]!;
    }
    return null;
  });

  // Calculate Mass Index (sum of EMA Ratios)
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
 * Get Mass Index with reversal signals
 */
export function getMassIndexWithSignals(
  candles: Candle[],
  config: { emaPeriod?: number; sumPeriod?: number } = {}
): MassIndexResult[] {
  const emaPeriod = config.emaPeriod ?? 9;
  const sumPeriod = config.sumPeriod ?? 25;

  // Calculate high-low range
  const ranges = candles.map(c => c.high - c.low);
  const singleEma = ema(ranges, emaPeriod);
  const singleEmaValues = singleEma.filter(v => v !== null) as number[];
  const doubleEmaValues = ema(singleEmaValues, emaPeriod);

  const doubleEma: (number | null)[] = new Array(candles.length).fill(null);
  let singleIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (singleEma[i] !== null) {
      const doubleIdx = singleIdx - emaPeriod + 1;
      if (doubleIdx >= 0 && doubleIdx < doubleEmaValues.length) {
        doubleEma[i] = doubleEmaValues[doubleIdx];
      }
      singleIdx++;
    }
  }

  const emaRatio: (number | null)[] = candles.map((_, i) => {
    if (singleEma[i] !== null && doubleEma[i] !== null && doubleEma[i] !== 0) {
      return singleEma[i]! / doubleEma[i]!;
    }
    return null;
  });

  const results: MassIndexResult[] = [];
  let wasAbove27 = false;

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
      // Detect reversal bulge signal
      let reversalSignal = false;

      if (sum > 27) {
        wasAbove27 = true;
      } else if (wasAbove27 && sum < 26.5) {
        reversalSignal = true;
        wasAbove27 = false;
      }

      results.push({
        time: candles[i].time,
        value: sum,
        reversalSignal,
      });
    }
  }

  return results;
}
