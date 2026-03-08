/**
 * Keltner Channel Indicator
 * Ported from Ta4j (https://github.com/ta4j/ta4j)
 *
 * Keltner Channels are volatility-based envelopes that use ATR (Average True Range)
 * to set channel distance from the EMA. They help identify overbought/oversold
 * conditions and trend direction.
 *
 * Formula:
 * - Middle Line = EMA of Close (typically 20-period)
 * - Upper Channel = EMA + (ATR × Multiplier)
 * - Lower Channel = EMA - (ATR × Multiplier)
 *
 * Usage:
 * - Price above upper channel: Strong uptrend / overbought
 * - Price below lower channel: Strong downtrend / oversold
 * - Price in channel: Normal range
 * - Channel width indicates volatility
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";

// ==================== TYPES ====================

export interface KeltnerChannelConfig {
  emaPeriod: number;     // EMA period for middle line (default: 20)
  atrPeriod: number;     // ATR period (default: 10)
  multiplier: number;    // ATR multiplier (default: 2.0)
}

export interface KeltnerChannelPoint {
  time: Time;
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;     // Channel width as % of middle
  position: 'above' | 'below' | 'inside';
}

export interface KeltnerChannelSignal {
  time: Time;
  type: 'overbought' | 'oversold' | 'channel_cross_up' | 'channel_cross_down';
  price: number;
  channel: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate EMA
 */
function calculateEMA(data: number[], period: number): (number | null)[] {
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
  for (let i = period; i < data.length; i++) {
    const prevEMA = result[i - 1] as number;
    result[i] = (data[i] - prevEMA) * multiplier + prevEMA;
  }

  return result;
}

/**
 * Calculate True Range
 */
function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
}

/**
 * Calculate ATR using Wilder's smoothing
 */
function calculateATR(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length < period) return result;

  // Calculate TR values
  const trValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trValues.push(candles[i].high - candles[i].low);
    } else {
      trValues.push(trueRange(
        candles[i].high,
        candles[i].low,
        candles[i - 1].close
      ));
    }
  }

  // First ATR is SMA of TR
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trValues[i];
  }
  result[period - 1] = sum / period;

  // Subsequent ATR values use Wilder's smoothing
  for (let i = period; i < trValues.length; i++) {
    const prevATR = result[i - 1] as number;
    result[i] = (prevATR * (period - 1) + trValues[i]) / period;
  }

  return result;
}

// ==================== MAIN CALCULATION ====================

/**
 * Calculate Keltner Channel indicator
 */
export function calculateKeltnerChannel(
  candles: Candle[],
  config: Partial<KeltnerChannelConfig> = {}
): IndicatorResult {
  const emaPeriod = config.emaPeriod ?? 20;
  const atrPeriod = config.atrPeriod ?? 10;
  const multiplier = config.multiplier ?? 2.0;

  const closes = candles.map(c => c.close);
  const emaValues = calculateEMA(closes, emaPeriod);
  const atrValues = calculateATR(candles, atrPeriod);

  const upperValues: (number | null)[] = new Array(candles.length).fill(null);
  const middleValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowerValues: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const ema = emaValues[i];
    const atr = atrValues[i];

    if (ema === null || atr === null) continue;

    middleValues[i] = ema;
    upperValues[i] = ema + atr * multiplier;
    lowerValues[i] = ema - atr * multiplier;
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
 * Calculate Keltner Channel with analysis
 */
export function calculateKeltnerChannelWithAnalysis(
  candles: Candle[],
  config: Partial<KeltnerChannelConfig> = {}
): KeltnerChannelPoint[] {
  const emaPeriod = config.emaPeriod ?? 20;
  const atrPeriod = config.atrPeriod ?? 10;
  const multiplier = config.multiplier ?? 2.0;

  const closes = candles.map(c => c.close);
  const emaValues = calculateEMA(closes, emaPeriod);
  const atrValues = calculateATR(candles, atrPeriod);

  const result: KeltnerChannelPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const ema = emaValues[i];
    const atr = atrValues[i];

    if (ema === null || atr === null) {
      result.push({
        time: candles[i].time,
        upper: 0,
        middle: 0,
        lower: 0,
        bandwidth: 0,
        position: 'inside',
      });
      continue;
    }

    const upper = ema + atr * multiplier;
    const lower = ema - atr * multiplier;
    const bandwidth = ((upper - lower) / ema) * 100;

    const close = candles[i].close;
    let position: 'above' | 'below' | 'inside';
    if (close > upper) {
      position = 'above';
    } else if (close < lower) {
      position = 'below';
    } else {
      position = 'inside';
    }

    result.push({
      time: candles[i].time,
      upper,
      middle: ema,
      lower,
      bandwidth,
      position,
    });
  }

  return result;
}

/**
 * Detect Keltner Channel signals
 */
export function detectKeltnerChannelSignals(
  candles: Candle[],
  config: Partial<KeltnerChannelConfig> = {}
): KeltnerChannelSignal[] {
  const analysis = calculateKeltnerChannelWithAnalysis(candles, config);
  const signals: KeltnerChannelSignal[] = [];

  for (let i = 1; i < analysis.length; i++) {
    const current = analysis[i];
    const previous = analysis[i - 1];

    // Channel cross up (from inside to above)
    if (previous.position === 'inside' && current.position === 'above') {
      signals.push({
        time: current.time,
        type: 'channel_cross_up',
        price: candles[i].close,
        channel: current.upper,
      });
    }

    // Channel cross down (from inside to below)
    if (previous.position === 'inside' && current.position === 'below') {
      signals.push({
        time: current.time,
        type: 'channel_cross_down',
        price: candles[i].close,
        channel: current.lower,
      });
    }

    // Overbought condition
    if (current.position === 'above') {
      signals.push({
        time: current.time,
        type: 'overbought',
        price: candles[i].close,
        channel: current.upper,
      });
    }

    // Oversold condition
    if (current.position === 'below') {
      signals.push({
        time: current.time,
        type: 'oversold',
        price: candles[i].close,
        channel: current.lower,
      });
    }
  }

  return signals;
}

/**
 * Analyze Keltner Channel squeeze (low volatility)
 */
export function analyzeKeltnerSqueeze(
  candles: Candle[],
  config: Partial<KeltnerChannelConfig> = {}
): {
  isSqueeze: boolean;
  bandwidth: number;
  bandwidthPercentile: number;  // 0-100, low = squeeze
  volatilityState: 'expansion' | 'normal' | 'squeeze';
} {
  const analysis = calculateKeltnerChannelWithAnalysis(candles, config);

  if (analysis.length < 50) {
    return {
      isSqueeze: false,
      bandwidth: 0,
      bandwidthPercentile: 50,
      volatilityState: 'normal',
    };
  }

  // Get current bandwidth
  const currentBandwidth = analysis[analysis.length - 1].bandwidth;

  // Calculate bandwidth percentile over last 50 periods
  const recentBandwidths = analysis.slice(-50).map(a => a.bandwidth).filter(b => b > 0);
  const sortedBandwidths = [...recentBandwidths].sort((a, b) => a - b);

  const bandwidthPercentile = sortedBandwidths.length > 0
    ? (sortedBandwidths.indexOf(currentBandwidth) / sortedBandwidths.length) * 100
    : 50;

  // Determine volatility state
  let volatilityState: 'expansion' | 'normal' | 'squeeze';
  let isSqueeze = false;

  if (bandwidthPercentile < 20) {
    volatilityState = 'squeeze';
    isSqueeze = true;
  } else if (bandwidthPercentile > 80) {
    volatilityState = 'expansion';
  } else {
    volatilityState = 'normal';
  }

  return {
    isSqueeze,
    bandwidth: currentBandwidth,
    bandwidthPercentile,
    volatilityState,
  };
}

/**
 * Compare Keltner Channel with Bollinger Bands for squeeze detection
 * When BB is inside KC, it's a strong squeeze signal
 */
export function compareWithBollinger(
  kcUpper: number,
  kcLower: number,
  bbUpper: number,
  bbLower: number
): {
  squeeze: boolean;
  strength: 'strong' | 'moderate' | 'weak' | 'none';
} {
  // BB inside KC = squeeze
  if (bbUpper < kcUpper && bbLower > kcLower) {
    // Calculate how much BB is inside KC
    const kcRange = kcUpper - kcLower;
    const bbRange = bbUpper - bbLower;
    const ratio = bbRange / kcRange;

    let strength: 'strong' | 'moderate' | 'weak';
    if (ratio < 0.5) {
      strength = 'strong';
    } else if (ratio < 0.75) {
      strength = 'moderate';
    } else {
      strength = 'weak';
    }

    return { squeeze: true, strength };
  }

  return { squeeze: false, strength: 'none' };
}
