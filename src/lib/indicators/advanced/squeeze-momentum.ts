/**
 * Squeeze Momentum Indicator
 *
 * A powerful volatility and momentum indicator that combines Bollinger Bands
 * and Keltner Channels to detect periods of low volatility (squeeze) followed
 * by potential explosive moves.
 *
 * Created by LazyBear (TradingView)
 *
 * Algorithm:
 * - Bollinger Bands: basis ± bbMult × stddev
 * - Keltner Channels: basis ± kcMult × ATR
 * - Squeeze ON: lowerBB > lowerKC AND upperBB < upperKC (compression)
 * - Squeeze OFF: lowerBB < lowerKC AND upperBB > upperKC (release)
 *
 * Momentum:
 * - momentum = close - (avgHL + SMA) / 2
 * - avgHL = (highestHigh + lowestLow) / 2 over lookback
 *
 * Colors:
 * - LIME: momentum > 0 and rising (strong bullish)
 * - GREEN: momentum > 0 and falling (weak bullish)
 * - RED: momentum < 0 and falling (strong bearish)
 * - MAROON: momentum < 0 and rising (weak bearish)
 *
 * Signals:
 * - LONG: squeeze release with positive momentum
 * - SHORT: squeeze release with negative momentum
 */

import type { Time, LineData, HistogramData, WhitespaceData } from "lightweight-charts";
import type { IndicatorResult } from "../calculator";

// ==================== TYPES ====================

/**
 * Configuration for Squeeze Momentum Indicator
 */
export interface SqueezeMomentumConfig {
  bbLength: number;       // Bollinger Bands length (default: 20)
  bbMult: number;         // Bollinger Bands multiplier (default: 2.0)
  kcLength: number;       // Keltner Channel length (default: 20)
  kcMult: number;         // Keltner Channel multiplier (default: 1.5)
  useTrueRange: boolean;  // Use True Range for KC calculation (default: true)
  momentumLength: number; // Momentum lookback length (default: 20)
}

/**
 * Result of Squeeze Momentum calculation for a single candle
 */
export interface SqueezeMomentumResult {
  time: Time;
  squeezeOn: boolean;                          // BB inside KC (compression)
  squeezeOff: boolean;                         // BB outside KC (release)
  noSqueeze: boolean;                          // Neither condition
  momentum: number;                            // Momentum oscillator value
  momentumColor: 'LIME' | 'GREEN' | 'RED' | 'MAROON';
  signal: 'LONG' | 'SHORT' | 'NONE';
  // Additional data for charting
  bbUpper: number;
  bbLower: number;
  kcUpper: number;
  kcLower: number;
}

/**
 * Candle data structure
 */
export interface Candle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result[i] = sum / period;
  }

  return result;
}

/**
 * Calculate Standard Deviation
 */
function calculateStdev(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const squaredDiffs = slice.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    result[i] = Math.sqrt(variance);
  }

  return result;
}

/**
 * Calculate True Range
 */
function calculateTrueRange(candles: Candle[]): number[] {
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      result.push(tr);
    }
  }

  return result;
}

/**
 * Calculate Average True Range using Wilder's smoothing
 */
function calculateATR(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  const trValues = calculateTrueRange(candles);

  if (candles.length < period) return result;

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

/**
 * Calculate highest high over a period
 */
function highest(data: number[], period: number, index: number): number | null {
  if (index < period - 1) return null;

  let highest = data[index - period + 1];
  for (let i = index - period + 2; i <= index; i++) {
    if (data[i] > highest) highest = data[i];
  }
  return highest;
}

/**
 * Calculate lowest low over a period
 */
function lowest(data: number[], period: number, index: number): number | null {
  if (index < period - 1) return null;

  let lowest = data[index - period + 1];
  for (let i = index - period + 2; i <= index; i++) {
    if (data[i] < lowest) lowest = data[i];
  }
  return lowest;
}

// ==================== MAIN CLASS ====================

/**
 * Squeeze Momentum Indicator Class
 *
 * Implements the Squeeze Momentum indicator for detecting volatility compression
 * and momentum-based breakout signals.
 */
export class SqueezeMomentum {
  private config: SqueezeMomentumConfig;

  constructor(config: Partial<SqueezeMomentumConfig> = {}) {
    this.config = {
      bbLength: config.bbLength ?? 20,
      bbMult: config.bbMult ?? 2.0,
      kcLength: config.kcLength ?? 20,
      kcMult: config.kcMult ?? 1.5,
      useTrueRange: config.useTrueRange ?? true,
      momentumLength: config.momentumLength ?? 20,
    };
  }

  /**
   * Calculate Squeeze Momentum indicator values
   */
  calculate(candles: Candle[]): SqueezeMomentumResult[] {
    const results: SqueezeMomentumResult[] = [];
    const { bbLength, bbMult, kcLength, kcMult, useTrueRange, momentumLength } = this.config;

    if (candles.length === 0) return results;

    // Extract data arrays
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // Calculate Bollinger Bands
    const bbBasis = calculateSMA(closes, bbLength);
    const bbStdev = calculateStdev(closes, bbLength);

    // Calculate Keltner Channels
    const kcBasis = calculateSMA(closes, kcLength);
    const atrValues = calculateATR(candles, kcLength);

    // Alternative: use simple range instead of True Range
    const simpleRanges = candles.map(c => c.high - c.low);
    const avgRange = useTrueRange ? null : calculateSMA(simpleRanges, kcLength);

    // Calculate momentum values
    const momentumValues: (number | null)[] = [];

    for (let i = 0; i < candles.length; i++) {
      // Get highest high and lowest low for momentum calculation
      const highestHigh = highest(highs, momentumLength, i);
      const lowestLow = lowest(lows, momentumLength, i);
      const sma = bbBasis[i]; // Using BB basis (SMA of close)

      if (highestHigh === null || lowestLow === null || sma === null) {
        momentumValues.push(null);
      } else {
        const avgHL = (highestHigh + lowestLow) / 2;
        momentumValues.push(closes[i] - (avgHL + sma) / 2);
      }
    }

    // Calculate Bollinger Band values
    const bbUpper: (number | null)[] = [];
    const bbLower: (number | null)[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (bbBasis[i] === null || bbStdev[i] === null) {
        bbUpper.push(null);
        bbLower.push(null);
      } else {
        bbUpper.push(bbBasis[i]! + bbMult * bbStdev[i]!);
        bbLower.push(bbBasis[i]! - bbMult * bbStdev[i]!);
      }
    }

    // Calculate Keltner Channel values
    const kcUpper: (number | null)[] = [];
    const kcLower: (number | null)[] = [];
    for (let i = 0; i < candles.length; i++) {
      const range = useTrueRange ? atrValues[i] : avgRange?.[i] ?? null;
      if (kcBasis[i] === null || range === null) {
        kcUpper.push(null);
        kcLower.push(null);
      } else {
        kcUpper.push(kcBasis[i]! + kcMult * range!);
        kcLower.push(kcBasis[i]! - kcMult * range!);
      }
    }

    // Build results with squeeze detection and momentum
    for (let i = 0; i < candles.length; i++) {
      const bbU = bbUpper[i];
      const bbL = bbLower[i];
      const kcU = kcUpper[i];
      const kcL = kcLower[i];
      const momentum = momentumValues[i];

      // Default values for incomplete data
      if (bbU === null || bbL === null || kcU === null || kcL === null || momentum === null) {
        results.push({
          time: candles[i].time,
          squeezeOn: false,
          squeezeOff: false,
          noSqueeze: true,
          momentum: 0,
          momentumColor: 'GREEN',
          signal: 'NONE',
          bbUpper: 0,
          bbLower: 0,
          kcUpper: 0,
          kcLower: 0,
        });
        continue;
      }

      // Squeeze detection
      // Squeeze ON: BB is inside KC (compression)
      const squeezeOn = bbL > kcL && bbU < kcU;

      // Squeeze OFF: BB is outside KC (release)
      const squeezeOff = bbL < kcL && bbU > kcU;

      // Neither condition
      const noSqueeze = !squeezeOn && !squeezeOff;

      // Determine momentum color
      const prevMomentum = i > 0 ? momentumValues[i - 1] : null;
      let momentumColor: 'LIME' | 'GREEN' | 'RED' | 'MAROON';

      if (momentum > 0) {
        // Positive momentum
        if (prevMomentum !== null && momentum > prevMomentum) {
          momentumColor = 'LIME'; // Rising positive momentum
        } else {
          momentumColor = 'GREEN'; // Falling positive momentum
        }
      } else {
        // Negative momentum
        if (prevMomentum !== null && momentum < prevMomentum) {
          momentumColor = 'RED'; // Falling negative momentum
        } else {
          momentumColor = 'MAROON'; // Rising negative momentum
        }
      }

      // Determine signal
      let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';

      if (i > 0) {
        const prevResult = results[i - 1];

        // Squeeze release detection
        if (prevResult.squeezeOn && squeezeOff) {
          // Squeeze just released
          signal = momentum > 0 ? 'LONG' : 'SHORT';
        }
      }

      results.push({
        time: candles[i].time,
        squeezeOn,
        squeezeOff,
        noSqueeze,
        momentum,
        momentumColor,
        signal,
        bbUpper: bbU,
        bbLower: bbL,
        kcUpper: kcU,
        kcLower: kcL,
      });
    }

    return results;
  }

  /**
   * Get breakout signal from results
   * Analyzes the results to find the most recent breakout signal
   */
  getBreakoutSignal(results: SqueezeMomentumResult[]): 'LONG' | 'SHORT' | 'NONE' {
    if (results.length < 2) return 'NONE';

    // Check the most recent results for a breakout
    for (let i = results.length - 1; i >= 1; i--) {
      if (results[i].signal !== 'NONE') {
        return results[i].signal;
      }
    }

    return 'NONE';
  }

  /**
   * Get indicator result for chart rendering
   */
  calculateIndicator(candles: Candle[]): IndicatorResult {
    const results = this.calculate(candles);

    // Build momentum histogram data with colors
    const momentumData: (HistogramData<Time> | WhitespaceData<Time>)[] = results.map((r) => {
      const colorMap = {
        'LIME': '#26A69A',    // Bright green - strong bullish
        'GREEN': '#B2DFDB',   // Light green - weak bullish
        'RED': '#EF5350',     // Bright red - strong bearish
        'MAROON': '#FFCDD2',  // Light red - weak bearish
      };

      return {
        time: r.time,
        value: r.momentum,
        color: colorMap[r.momentumColor],
      };
    });

    // Build squeeze dots data (shows as circles at zero line)
    const squeezeData: (HistogramData<Time> | WhitespaceData<Time>)[] = results.map((r) => {
      let squeezeValue = 0;
      let squeezeColor = 'transparent';

      if (r.squeezeOn) {
        // Squeeze is ON - show black dot (compression)
        squeezeValue = 0;
        squeezeColor = '#424242';
      } else if (r.squeezeOff) {
        // Squeeze is OFF - show gray dot (release)
        squeezeValue = 0;
        squeezeColor = '#9E9E9E';
      }

      return {
        time: r.time,
        value: squeezeValue,
        color: squeezeColor,
      };
    });

    // Build BB and KC lines
    const bbUpperLine = results.map((r) => ({
      time: r.time,
      value: r.bbUpper,
    }));

    const bbLowerLine = results.map((r) => ({
      time: r.time,
      value: r.bbLower,
    }));

    const kcUpperLine = results.map((r) => ({
      time: r.time,
      value: r.kcUpper,
    }));

    const kcLowerLine = results.map((r) => ({
      time: r.time,
      value: r.kcLower,
    }));

    return {
      id: 'squeeze_momentum',
      overlay: true,
      lines: [
        { name: 'bb_upper', data: bbUpperLine, color: '#2962FF40' },
        { name: 'bb_lower', data: bbLowerLine, color: '#2962FF40' },
        { name: 'kc_upper', data: kcUpperLine, color: '#FF6D0040' },
        { name: 'kc_lower', data: kcLowerLine, color: '#FF6D0040' },
      ],
      histograms: [
        { name: 'momentum', data: momentumData, color: '#26A69A' },
        { name: 'squeeze', data: squeezeData, color: '#424242' },
      ],
    };
  }
}

// ==================== STANDALONE FUNCTIONS ====================

/**
 * Calculate Squeeze Momentum indicator (standalone function)
 */
export function calculateSqueezeMomentum(
  candles: Candle[],
  config: Partial<SqueezeMomentumConfig> = {}
): SqueezeMomentumResult[] {
  const indicator = new SqueezeMomentum(config);
  return indicator.calculate(candles);
}

/**
 * Get breakout signal from candles (standalone function)
 */
export function getSqueezeBreakoutSignal(
  candles: Candle[],
  config: Partial<SqueezeMomentumConfig> = {}
): 'LONG' | 'SHORT' | 'NONE' {
  const indicator = new SqueezeMomentum(config);
  const results = indicator.calculate(candles);
  return indicator.getBreakoutSignal(results);
}

/**
 * Analyze squeeze state and momentum
 */
export function analyzeSqueezeState(
  candles: Candle[],
  config: Partial<SqueezeMomentumConfig> = {}
): {
  isSqueezing: boolean;
  squeezeCount: number;
  momentumDirection: 'bullish' | 'bearish' | 'neutral';
  momentumStrength: 'strong' | 'weak' | 'neutral';
  latestSignal: 'LONG' | 'SHORT' | 'NONE';
} {
  const indicator = new SqueezeMomentum(config);
  const results = indicator.calculate(candles);

  if (results.length === 0) {
    return {
      isSqueezing: false,
      squeezeCount: 0,
      momentumDirection: 'neutral',
      momentumStrength: 'neutral',
      latestSignal: 'NONE',
    };
  }

  // Count consecutive squeezes
  let squeezeCount = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].squeezeOn) {
      squeezeCount++;
    } else {
      break;
    }
  }

  // Get latest result
  const latest = results[results.length - 1];

  // Determine momentum direction
  let momentumDirection: 'bullish' | 'bearish' | 'neutral';
  if (latest.momentum > 0) {
    momentumDirection = 'bullish';
  } else if (latest.momentum < 0) {
    momentumDirection = 'bearish';
  } else {
    momentumDirection = 'neutral';
  }

  // Determine momentum strength
  let momentumStrength: 'strong' | 'weak' | 'neutral';
  if (latest.momentumColor === 'LIME' || latest.momentumColor === 'RED') {
    momentumStrength = 'strong';
  } else if (latest.momentumColor === 'GREEN' || latest.momentumColor === 'MAROON') {
    momentumStrength = 'weak';
  } else {
    momentumStrength = 'neutral';
  }

  return {
    isSqueezing: latest.squeezeOn,
    squeezeCount,
    momentumDirection,
    momentumStrength,
    latestSignal: indicator.getBreakoutSignal(results),
  };
}

/**
 * Calculate Squeeze Momentum for chart indicator system
 */
export function calculateSqueezeMomentumIndicator(
  candles: Candle[],
  config: Partial<SqueezeMomentumConfig> = {}
): IndicatorResult {
  const indicator = new SqueezeMomentum(config);
  return indicator.calculateIndicator(candles);
}

// Export default class
export default SqueezeMomentum;
