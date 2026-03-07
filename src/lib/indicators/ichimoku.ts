/**
 * Ichimoku Cloud (Ichimoku Kinko Hyo) Indicator
 * Ported from ai-technicals (https://github.com/sanzol-tech/ai-technicals)
 *
 * Ichimoku Cloud is a comprehensive indicator that defines support and resistance,
 * identifies trend direction, measures momentum, and provides trading signals.
 *
 * Components:
 * 1. Tenkan-sen (Conversion Line): (9-period high + 9-period low) / 2
 * 2. Kijun-sen (Base Line): (26-period high + 26-period low) / 2
 * 3. Senkou Span A (Leading Span A): (Tenkan + Kijun) / 2, plotted 26 periods ahead
 * 4. Senkou Span B (Leading Span B): (52-period high + 52-period low) / 2, plotted 26 periods ahead
 * 5. Chikou Span (Lagging Span): Close plotted 26 periods back
 *
 * The "cloud" (Kumo) is formed between Senkou Span A and B
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

export interface IchimokuConfig {
  tenkanPeriod: number;    // Default: 9
  kijunPeriod: number;     // Default: 26
  senkouBPeriod: number;   // Default: 52
  displacement: number;    // Default: 26 (how far ahead Senkou spans are plotted)
}

export interface IchimokuData {
  time: Time;
  tenkan: number | null;       // Conversion Line
  kijun: number | null;        // Base Line
  senkouA: number | null;      // Leading Span A
  senkouB: number | null;      // Leading Span B
  chikou: number | null;       // Lagging Span
}

export interface IchimokuSignal {
  type: 'tk_cross' | 'kumo_breakout' | 'chikou_cross' | 'kijun_cross';
  direction: 'bullish' | 'bearish';
  strength: 'strong' | 'neutral' | 'weak';
  price: number;
  time: Time;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate the midpoint between high and low over a period
 */
function calculateMidpoint(
  candles: Candle[],
  period: number,
  offset: number = 0
): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = period - 1 + offset; i < candles.length; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let j = i - period + 1; j <= i; j++) {
      highestHigh = Math.max(highestHigh, candles[j].high);
      lowestLow = Math.min(lowestLow, candles[j].low);
    }

    result[i] = (highestHigh + lowestLow) / 2;
  }

  return result;
}

/**
 * Get highest high over period
 */
function getHighestHigh(candles: Candle[], period: number, endIndex: number): number {
  let highest = -Infinity;
  const startIndex = Math.max(0, endIndex - period + 1);

  for (let i = startIndex; i <= endIndex; i++) {
    highest = Math.max(highest, candles[i].high);
  }

  return highest;
}

/**
 * Get lowest low over period
 */
function getLowestLow(candles: Candle[], period: number, endIndex: number): number {
  let lowest = Infinity;
  const startIndex = Math.max(0, endIndex - period + 1);

  for (let i = startIndex; i <= endIndex; i++) {
    lowest = Math.min(lowest, candles[i].low);
  }

  return lowest;
}

// ==================== ICHIMOKU CALCULATIONS ====================

/**
 * Calculate Tenkan-sen (Conversion Line)
 * Formula: (9-period high + 9-period low) / 2
 */
function calculateTenkan(candles: Candle[], period: number = 9): (number | null)[] {
  return calculateMidpoint(candles, period);
}

/**
 * Calculate Kijun-sen (Base Line)
 * Formula: (26-period high + 26-period low) / 2
 */
function calculateKijun(candles: Candle[], period: number = 26): (number | null)[] {
  return calculateMidpoint(candles, period);
}

/**
 * Calculate Senkou Span A (Leading Span A)
 * Formula: (Tenkan + Kijun) / 2, displaced forward 26 periods
 */
function calculateSenkouA(
  tenkan: (number | null)[],
  kijun: (number | null)[],
  displacement: number = 26
): (number | null)[] {
  const result: (number | null)[] = new Array(tenkan.length).fill(null);

  for (let i = 0; i < tenkan.length; i++) {
    if (tenkan[i] !== null && kijun[i] !== null) {
      // Senkou A is plotted displacement periods ahead
      const targetIndex = i + displacement;
      if (targetIndex < tenkan.length) {
        result[targetIndex] = (tenkan[i]! + kijun[i]!) / 2;
      } else {
        // Extend array for future values
        result[targetIndex] = (tenkan[i]! + kijun[i]!) / 2;
      }
    }
  }

  return result;
}

/**
 * Calculate Senkou Span B (Leading Span B)
 * Formula: (52-period high + 52-period low) / 2, displaced forward 26 periods
 */
function calculateSenkouB(
  candles: Candle[],
  period: number = 52,
  displacement: number = 26
): (number | null)[] {
  const midpoint = calculateMidpoint(candles, period);
  const result: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < midpoint.length; i++) {
    if (midpoint[i] !== null) {
      const targetIndex = i + displacement;
      if (targetIndex < candles.length) {
        result[targetIndex] = midpoint[i];
      } else {
        result[targetIndex] = midpoint[i];
      }
    }
  }

  return result;
}

/**
 * Calculate Chikou Span (Lagging Span)
 * Formula: Close displaced backward 26 periods
 */
function calculateChikou(
  candles: Candle[],
  displacement: number = 26
): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length - displacement; i++) {
    // Chikou is the close plotted displacement periods back
    result[i] = candles[i + displacement].close;
  }

  return result;
}

// ==================== MAIN CALCULATION FUNCTION ====================

/**
 * Calculate full Ichimoku Cloud indicator
 */
export function calculateIchimoku(
  candles: Candle[],
  config: Partial<IchimokuConfig> = {}
): IndicatorResult {
  const tenkanPeriod = config.tenkanPeriod ?? 9;
  const kijunPeriod = config.kijunPeriod ?? 26;
  const senkouBPeriod = config.senkouBPeriod ?? 52;
  const displacement = config.displacement ?? 26;

  // Calculate components
  const tenkan = calculateTenkan(candles, tenkanPeriod);
  const kijun = calculateKijun(candles, kijunPeriod);
  const senkouA = calculateSenkouA(tenkan, kijun, displacement);
  const senkouB = calculateSenkouB(candles, senkouBPeriod, displacement);
  const chikou = calculateChikou(candles, displacement);

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
    id: 'ichimoku',
    overlay: true,
    lines: [
      { name: 'tenkan', data: buildLineData(tenkan), color: '#2962FF' },       // Blue
      { name: 'kijun', data: buildLineData(kijun), color: '#FF6D00' },         // Orange
      { name: 'senkouA', data: buildLineData(senkouA), color: '#26A69A' },     // Green
      { name: 'senkouB', data: buildLineData(senkouB), color: '#EF5350' },     // Red
      { name: 'chikou', data: buildLineData(chikou), color: '#9C27B0' },       // Purple
    ],
    histograms: [],
  };
}

/**
 * Calculate Ichimoku with extended cloud for future projection
 */
export function calculateIchimokuWithFuture(
  candles: Candle[],
  config: Partial<IchimokuConfig> = {}
): {
  result: IndicatorResult;
  futureCloud: Array<{ time: Time; senkouA: number; senkouB: number }>;
} {
  const tenkanPeriod = config.tenkanPeriod ?? 9;
  const kijunPeriod = config.kijunPeriod ?? 26;
  const senkouBPeriod = config.senkouBPeriod ?? 52;
  const displacement = config.displacement ?? 26;

  const result = calculateIchimoku(candles, config);

  // Calculate future cloud (26 periods ahead)
  const futureCloud: Array<{ time: Time; senkouA: number; senkouB: number }> = [];

  // Get the last available values
  const lastCandle = candles[candles.length - 1];
  const lastTenkan = calculateMidpoint(candles.slice(-tenkanPeriod), tenkanPeriod)[tenkanPeriod - 1];
  const lastKijun = calculateMidpoint(candles.slice(-kijunPeriod), kijunPeriod)[kijunPeriod - 1];
  const lastSenkouB = calculateMidpoint(candles.slice(-senkouBPeriod), senkouBPeriod)[senkouBPeriod - 1];

  // Generate future timestamps (daily assumption)
  const lastTime = lastCandle.time as number;
  for (let i = 1; i <= displacement; i++) {
    const futureTime = (lastTime + i * 86400) as Time;
    const futureSenkouA = lastTenkan && lastKijun ? (lastTenkan + lastKijun) / 2 : null;
    const futureSenkouB = lastSenkouB;

    if (futureSenkouA && futureSenkouB) {
      futureCloud.push({
        time: futureTime,
        senkouA: futureSenkouA,
        senkouB: futureSenkouB,
      });
    }
  }

  return { result, futureCloud };
}

// ==================== SIGNAL DETECTION ====================

/**
 * Detect Ichimoku trading signals
 */
export function detectIchimokuSignals(
  candles: Candle[],
  ichimokuData: IchimokuData[]
): IchimokuSignal[] {
  const signals: IchimokuSignal[] = [];

  for (let i = 1; i < ichimokuData.length; i++) {
    const current = ichimokuData[i];
    const previous = ichimokuData[i - 1];
    const price = candles[i].close;

    // Skip if data is incomplete
    if (!current.tenkan || !current.kijun || !current.senkouA || !current.senkouB) {
      continue;
    }

    // 1. TK Cross (Tenkan-Kijun Cross)
    if (previous.tenkan && previous.kijun) {
      if (previous.tenkan <= previous.kijun && current.tenkan > current.kijun) {
        // Bullish TK Cross
        const strength = price > current.senkouA && price > current.senkouB ? 'strong' :
                        price < current.senkouA && price < current.senkouB ? 'weak' : 'neutral';
        signals.push({
          type: 'tk_cross',
          direction: 'bullish',
          strength,
          price,
          time: current.time,
        });
      } else if (previous.tenkan >= previous.kijun && current.tenkan < current.kijun) {
        // Bearish TK Cross
        const strength = price < current.senkouA && price < current.senkouB ? 'strong' :
                        price > current.senkouA && price > current.senkouB ? 'weak' : 'neutral';
        signals.push({
          type: 'tk_cross',
          direction: 'bearish',
          strength,
          price,
          time: current.time,
        });
      }
    }

    // 2. Kumo Breakout
    const cloudTop = Math.max(current.senkouA, current.senkouB);
    const cloudBottom = Math.min(current.senkouA, current.senkouB);
    const prevCloudTop = previous.senkouA && previous.senkouB ?
      Math.max(previous.senkouA, previous.senkouB) : cloudTop;
    const prevCloudBottom = previous.senkouA && previous.senkouB ?
      Math.min(previous.senkouA, previous.senkouB) : cloudBottom;

    if (previous.senkouA && previous.senkouB) {
      // Bullish breakout: price was below cloud, now above
      if (candles[i - 1].close < prevCloudTop && price > cloudTop) {
        signals.push({
          type: 'kumo_breakout',
          direction: 'bullish',
          strength: 'strong',
          price,
          time: current.time,
        });
      }
      // Bearish breakout: price was above cloud, now below
      if (candles[i - 1].close > prevCloudBottom && price < cloudBottom) {
        signals.push({
          type: 'kumo_breakout',
          direction: 'bearish',
          strength: 'strong',
          price,
          time: current.time,
        });
      }
    }

    // 3. Chikou Cross (Chikou crosses price)
    if (current.chikou && previous.chikou && i >= 26) {
      const price26Ago = candles[i - 26].close;
      const prevPrice26Ago = candles[i - 27].close;

      if (previous.chikou <= prevPrice26Ago && current.chikou > price26Ago) {
        signals.push({
          type: 'chikou_cross',
          direction: 'bullish',
          strength: 'neutral',
          price,
          time: current.time,
        });
      } else if (previous.chikou >= prevPrice26Ago && current.chikou < price26Ago) {
        signals.push({
          type: 'chikou_cross',
          direction: 'bearish',
          strength: 'neutral',
          price,
          time: current.time,
        });
      }
    }

    // 4. Kijun Cross (Price crosses Kijun)
    if (previous.kijun) {
      if (candles[i - 1].close < previous.kijun && price > current.kijun) {
        const strength = price > current.senkouA && price > current.senkouB ? 'strong' :
                        price < current.senkouA && price < current.senkouB ? 'weak' : 'neutral';
        signals.push({
          type: 'kijun_cross',
          direction: 'bullish',
          strength,
          price,
          time: current.time,
        });
      } else if (candles[i - 1].close > previous.kijun && price < current.kijun) {
        const strength = price < current.senkouA && price < current.senkouB ? 'strong' :
                        price > current.senkouA && price > current.senkouB ? 'weak' : 'neutral';
        signals.push({
          type: 'kijun_cross',
          direction: 'bearish',
          strength,
          price,
          time: current.time,
        });
      }
    }
  }

  return signals;
}

// ==================== MARKET ANALYSIS ====================

/**
 * Analyze current market state using Ichimoku
 */
export function analyzeIchimokuMarket(
  price: number,
  ichimoku: IchimokuData
): {
  trend: 'bullish' | 'bearish' | 'neutral';
  cloudPosition: 'above' | 'below' | 'inside';
  signal: string;
  recommendations: string[];
} {
  if (!ichimoku.tenkan || !ichimoku.kijun || !ichimoku.senkouA || !ichimoku.senkouB) {
    return {
      trend: 'neutral',
      cloudPosition: 'inside',
      signal: 'Insufficient data',
      recommendations: ['Wait for more data'],
    };
  }

  const recommendations: string[] = [];
  const cloudTop = Math.max(ichimoku.senkouA, ichimoku.senkouB);
  const cloudBottom = Math.min(ichimoku.senkouA, ichimoku.senkouB);
  const cloudIsBullish = ichimoku.senkouA > ichimoku.senkouB;

  // Determine cloud position
  let cloudPosition: 'above' | 'below' | 'inside';
  if (price > cloudTop) {
    cloudPosition = 'above';
  } else if (price < cloudBottom) {
    cloudPosition = 'below';
  } else {
    cloudPosition = 'inside';
  }

  // Determine trend
  let trend: 'bullish' | 'bearish' | 'neutral';
  const tkBullish = ichimoku.tenkan > ichimoku.kijun;
  const priceBullish = price > ichimoku.tenkan && price > ichimoku.kijun;

  if (cloudPosition === 'above' && tkBullish && priceBullish) {
    trend = 'bullish';
    recommendations.push('Strong bullish trend - consider long positions');
  } else if (cloudPosition === 'below' && !tkBullish && !priceBullish) {
    trend = 'bearish';
    recommendations.push('Strong bearish trend - consider short positions');
  } else {
    trend = 'neutral';
    recommendations.push('Mixed signals - wait for confirmation');
  }

  // Generate signal
  let signal = '';
  if (cloudPosition === 'above') {
    signal = cloudIsBullish ? 'Bullish cloud support' : 'Resistance from bearish cloud top';
  } else if (cloudPosition === 'below') {
    signal = cloudIsBullish ? 'Support from bullish cloud bottom' : 'Bearish cloud resistance';
  } else {
    signal = cloudIsBullish ? 'Inside bullish cloud - consolidation' : 'Inside bearish cloud - danger zone';
  }

  // Add TK cross signal
  if (ichimoku.tenkan > ichimoku.kijun) {
    recommendations.push('TK bullish cross - momentum up');
  } else if (ichimoku.tenkan < ichimoku.kijun) {
    recommendations.push('TK bearish cross - momentum down');
  }

  // Add support/resistance levels
  recommendations.push(`Kijun support/resistance: ${ichimoku.kijun.toFixed(2)}`);

  return {
    trend,
    cloudPosition,
    signal,
    recommendations,
  };
}

/**
 * Get Ichimoku data for a single candle
 */
export function getIchimokuAtCandle(
  candles: Candle[],
  index: number,
  config: Partial<IchimokuConfig> = {}
): IchimokuData | null {
  if (index < 0 || index >= candles.length) return null;

  const tenkanPeriod = config.tenkanPeriod ?? 9;
  const kijunPeriod = config.kijunPeriod ?? 26;
  const senkouBPeriod = config.senkouBPeriod ?? 52;
  const displacement = config.displacement ?? 26;

  // Calculate Tenkan
  let tenkan: number | null = null;
  if (index >= tenkanPeriod - 1) {
    const high = getHighestHigh(candles, tenkanPeriod, index);
    const low = getLowestLow(candles, tenkanPeriod, index);
    tenkan = (high + low) / 2;
  }

  // Calculate Kijun
  let kijun: number | null = null;
  if (index >= kijunPeriod - 1) {
    const high = getHighestHigh(candles, kijunPeriod, index);
    const low = getLowestLow(candles, kijunPeriod, index);
    kijun = (high + low) / 2;
  }

  // Calculate Senkou A (current index but this will be displayed displacement periods ahead)
  let senkouA: number | null = null;
  if (tenkan && kijun) {
    senkouA = (tenkan + kijun) / 2;
  }

  // Calculate Senkou B
  let senkouB: number | null = null;
  if (index >= senkouBPeriod - 1) {
    const high = getHighestHigh(candles, senkouBPeriod, index);
    const low = getLowestLow(candles, senkouBPeriod, index);
    senkouB = (high + low) / 2;
  }

  // Calculate Chikou (close displaced backward)
  let chikou: number | null = null;
  if (index + displacement < candles.length) {
    chikou = candles[index + displacement].close;
  }

  return {
    time: candles[index].time,
    tenkan,
    kijun,
    senkouA,
    senkouB,
    chikou,
  };
}

/**
 * Format Ichimoku values for display
 */
export function formatIchimoku(ichimoku: IchimokuData): string {
  const format = (value: number | null) => value !== null ? value.toFixed(2) : 'N/A';

  return `Ichimoku Cloud:
  Tenkan-sen (Conversion): ${format(ichimoku.tenkan)}
  Kijun-sen (Base):        ${format(ichimoku.kijun)}
  Senkou Span A:           ${format(ichimoku.senkouA)}
  Senkou Span B:           ${format(ichimoku.senkouB)}
  Chikou Span (Lagging):   ${format(ichimoku.chikou)}`;
}
