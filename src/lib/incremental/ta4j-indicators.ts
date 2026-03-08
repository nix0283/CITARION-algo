/**
 * Advanced Indicators Ported from Ta4j
 * 
 * Source: https://github.com/ta4j/ta4j (200+ indicators library)
 * 
 * These indicators were ported from the Ta4j Java library, which provides
 * comprehensive technical analysis capabilities. Each indicator is implemented
 * with incremental (stateful) updates for O(1) performance.
 * 
 * Implemented Indicators:
 * 1. SuperTrend - Trend-following indicator based on ATR
 * 2. VWAP - Volume Weighted Average Price
 * 3. Heikin-Ashi - Smoothed candlestick calculation
 * 4. Renko - Brick-based chart transformation
 * 5. Keltner Channel - ATR-based volatility channel
 * 6. Mass Index - Reversal detection indicator
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "../indicators/calculator";

// ==================== TYPES ====================

/**
 * SuperTrend result
 */
export interface SuperTrendResult {
  value: number | null;
  trend: 'bullish' | 'bearish' | null;
  signal: 'buy' | 'sell' | null; // Trend change signal
  upperBand: number | null;
  lowerBand: number | null;
}

/**
 * VWAP result
 */
export interface VWAPResult {
  value: number | null;
  upperBand: number | null;  // VWAP + stddev
  lowerBand: number | null;  // VWAP - stddev
  cumulativeVolume: number;
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
  trend: 'bullish' | 'bearish';
}

/**
 * Renko brick
 */
export interface RenkoBrick {
  time: Time;
  open: number;
  close: number;
  direction: 'up' | 'down';
  size: number;
}

/**
 * Keltner Channel result
 */
export interface KeltnerChannelResult {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  bandwidth: number | null;
}

/**
 * Mass Index result
 */
export interface MassIndexResult {
  value: number | null;
  signal: 'reversal' | null; // When crosses above 27 then below 26.5
}

// ==================== SUPERTREND ====================

/**
 * SuperTrend Indicator
 * 
 * A trend-following indicator that uses ATR to determine the direction of the trend.
 * It's particularly useful for identifying stop-loss levels and trend direction.
 * 
 * Formula:
 * - Basic Upper Band = (High + Low) / 2 + (Multiplier × ATR)
 * - Basic Lower Band = (High + Low) / 2 - (Multiplier × ATR)
 * - Final Upper Band = Basic Upper if it's below previous or price closed above previous
 * - Final Lower Band = Basic Lower if it's above previous or price closed below previous
 * - SuperTrend = Final Upper if close <= Final Upper, else Final Lower
 */
export class SuperTrend {
  private atrPeriod: number;
  private multiplier: number;
  
  // State
  private atrValues: number[] = [];
  private trValues: number[] = [];
  private prevClose: number | null = null;
  private prevSuperTrend: number | null = null;
  private prevUpperBand: number | null = null;
  private prevLowerBand: number | null = null;
  private prevTrend: 'bullish' | 'bearish' | null = null;
  private count = 0;

  constructor(config: { period?: number; multiplier?: number } = {}) {
    this.atrPeriod = config.period ?? 10;
    this.multiplier = config.multiplier ?? 3;
  }

  /**
   * Calculate SuperTrend for a new bar
   */
  calculate(bar: { high: number; low: number; close: number }): SuperTrendResult {
    this.count++;

    // Calculate True Range
    let tr: number;
    if (this.prevClose === null) {
      tr = bar.high - bar.low;
    } else {
      tr = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - this.prevClose),
        Math.abs(bar.low - this.prevClose)
      );
    }
    this.trValues.push(tr);
    if (this.trValues.length > this.atrPeriod) {
      this.trValues.shift();
    }

    // Calculate ATR
    let atr: number | null = null;
    if (this.trValues.length >= this.atrPeriod) {
      if (this.atrValues.length === 0) {
        // First ATR is simple average
        atr = this.trValues.reduce((a, b) => a + b, 0) / this.atrPeriod;
      } else {
        // Subsequent ATR uses smoothing
        atr = (this.atrValues[this.atrValues.length - 1] * (this.atrPeriod - 1) + tr) / this.atrPeriod;
      }
      this.atrValues.push(atr);
      if (this.atrValues.length > this.atrPeriod * 2) {
        this.atrValues.shift();
      }
    }

    this.prevClose = bar.close;

    // Not enough data
    if (atr === null) {
      return {
        value: null,
        trend: null,
        signal: null,
        upperBand: null,
        lowerBand: null,
      };
    }

    // Calculate basic bands
    const hl2 = (bar.high + bar.low) / 2;
    const basicUpperBand = hl2 + this.multiplier * atr;
    const basicLowerBand = hl2 - this.multiplier * atr;

    // Calculate final bands
    let finalUpperBand = basicUpperBand;
    let finalLowerBand = basicLowerBand;

    if (this.prevUpperBand !== null && this.prevLowerBand !== null) {
      // Final Upper Band
      if (basicUpperBand < this.prevUpperBand || bar.close > this.prevUpperBand) {
        finalUpperBand = basicUpperBand;
      } else {
        finalUpperBand = this.prevUpperBand;
      }

      // Final Lower Band
      if (basicLowerBand > this.prevLowerBand || bar.close < this.prevLowerBand) {
        finalLowerBand = basicLowerBand;
      } else {
        finalLowerBand = this.prevLowerBand;
      }
    }

    // Calculate SuperTrend
    let superTrend: number;
    let trend: 'bullish' | 'bearish';

    if (this.prevSuperTrend === null) {
      // First value
      if (bar.close <= finalUpperBand) {
        superTrend = finalUpperBand;
        trend = 'bearish';
      } else {
        superTrend = finalLowerBand;
        trend = 'bullish';
      }
    } else {
      if (this.prevTrend === 'bullish') {
        if (bar.close < finalLowerBand) {
          superTrend = finalUpperBand;
          trend = 'bearish';
        } else {
          superTrend = finalLowerBand;
          trend = 'bullish';
        }
      } else {
        if (bar.close > finalUpperBand) {
          superTrend = finalLowerBand;
          trend = 'bullish';
        } else {
          superTrend = finalUpperBand;
          trend = 'bearish';
        }
      }
    }

    // Detect signal (trend change)
    let signal: 'buy' | 'sell' | null = null;
    if (this.prevTrend !== null && this.prevTrend !== trend) {
      signal = trend === 'bullish' ? 'buy' : 'sell';
    }

    // Store for next iteration
    this.prevSuperTrend = superTrend;
    this.prevUpperBand = finalUpperBand;
    this.prevLowerBand = finalLowerBand;
    this.prevTrend = trend;

    return {
      value: superTrend,
      trend,
      signal,
      upperBand: finalUpperBand,
      lowerBand: finalLowerBand,
    };
  }

  reset(): void {
    this.atrValues = [];
    this.trValues = [];
    this.prevClose = null;
    this.prevSuperTrend = null;
    this.prevUpperBand = null;
    this.prevLowerBand = null;
    this.prevTrend = null;
    this.count = 0;
  }
}

// ==================== VWAP ====================

/**
 * VWAP (Volume Weighted Average Price) Indicator
 * 
 * VWAP calculates the average price weighted by volume. It's commonly used
 * as a trading benchmark by institutional investors and algorithmic traders.
 * 
 * Formula:
 * VWAP = Σ(Price × Volume) / Σ(Volume)
 * 
 * Typically, "Price" can be:
 * - Typical Price = (High + Low + Close) / 3
 * - Or just the Close price
 * 
 * Bands are calculated using standard deviation:
 * Upper Band = VWAP + (StdDev × Multiplier)
 * Lower Band = VWAP - (StdDev × Multiplier)
 */
export class VWAP {
  private stddevMultiplier: number;
  private resetOnSession: boolean;
  
  // State
  private cumulativeTPV = 0;  // Cumulative (Typical Price × Volume)
  private cumulativeVolume = 0;
  private cumulativeTPV2 = 0; // For variance calculation
  private count = 0;
  private lastValue: number | null = null;

  constructor(config: { stddevMultiplier?: number; resetOnSession?: boolean } = {}) {
    this.stddevMultiplier = config.stddevMultiplier ?? 1.5;
    this.resetOnSession = config.resetOnSession ?? false;
  }

  /**
   * Calculate VWAP for a new bar
   */
  calculate(bar: { high: number; low: number; close: number; volume: number }): VWAPResult {
    this.count++;

    // Typical Price
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;

    // Update cumulative values
    this.cumulativeTPV += typicalPrice * bar.volume;
    this.cumulativeVolume += bar.volume;
    this.cumulativeTPV2 += typicalPrice * typicalPrice * bar.volume;

    // Calculate VWAP
    if (this.cumulativeVolume === 0) {
      return {
        value: null,
        upperBand: null,
        lowerBand: null,
        cumulativeVolume: 0,
      };
    }

    const vwap = this.cumulativeTPV / this.cumulativeVolume;
    this.lastValue = vwap;

    // Calculate standard deviation
    // Variance = E[X²] - E[X]²
    const meanTPV = this.cumulativeTPV / this.cumulativeVolume;
    const meanTPV2 = this.cumulativeTPV2 / this.cumulativeVolume;
    const variance = meanTPV2 - meanTPV * meanTPV;
    const stddev = Math.sqrt(Math.max(0, variance));

    // Calculate bands
    const upperBand = vwap + this.stddevMultiplier * stddev;
    const lowerBand = vwap - this.stddevMultiplier * stddev;

    return {
      value: vwap,
      upperBand,
      lowerBand,
      cumulativeVolume: this.cumulativeVolume,
    };
  }

  /**
   * Reset VWAP (typically at session start)
   */
  reset(): void {
    this.cumulativeTPV = 0;
    this.cumulativeVolume = 0;
    this.cumulativeTPV2 = 0;
    this.count = 0;
    this.lastValue = null;
  }

  getCurrentValue(): number | null {
    return this.lastValue;
  }
}

// ==================== HEIKIN-ASHI ====================

/**
 * Heikin-Ashi Indicator
 * 
 * Heikin-Ashi means "average bar" in Japanese. It's a technique that creates
 * smoothed candlesticks to better identify market trends and reduce noise.
 * 
 * Formula:
 * HA-Close = (Open + High + Low + Close) / 4
 * HA-Open = (Previous HA-Open + Previous HA-Close) / 2
 * HA-High = Max(High, HA-Open, HA-Close)
 * HA-Low = Min(Low, HA-Open, HA-Close)
 */
export class HeikinAshi {
  private prevHAOpen: number | null = null;
  private prevHAClose: number | null = null;
  private candles: HeikinAshiCandle[] = [];

  constructor() {}

  /**
   * Calculate Heikin-Ashi for a new bar
   */
  calculate(bar: { time: Time; open: number; high: number; low: number; close: number }): HeikinAshiCandle {
    // HA-Close is average of current bar
    const haClose = (bar.open + bar.high + bar.low + bar.close) / 4;

    // HA-Open is average of previous HA values
    let haOpen: number;
    if (this.prevHAOpen === null || this.prevHAClose === null) {
      haOpen = (bar.open + bar.close) / 2;
    } else {
      haOpen = (this.prevHAOpen + this.prevHAClose) / 2;
    }

    // HA-High is max of high, HA-Open, HA-Close
    const haHigh = Math.max(bar.high, haOpen, haClose);

    // HA-Low is min of low, HA-Open, HA-Close
    const haLow = Math.min(bar.low, haOpen, haClose);

    // Determine trend
    const trend = haClose >= haOpen ? 'bullish' : 'bearish';

    // Store for next iteration
    this.prevHAOpen = haOpen;
    this.prevHAClose = haClose;

    const candle: HeikinAshiCandle = {
      time: bar.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      trend,
    };

    this.candles.push(candle);
    return candle;
  }

  /**
   * Get all calculated candles
   */
  getCandles(): HeikinAshiCandle[] {
    return this.candles;
  }

  /**
   * Get last N candles
   */
  getLastCandles(n: number): HeikinAshiCandle[] {
    return this.candles.slice(-n);
  }

  /**
   * Detect trend strength based on consecutive candles
   */
  getTrendStrength(): { direction: 'bullish' | 'bearish' | 'neutral'; strength: number } {
    if (this.candles.length < 2) {
      return { direction: 'neutral', strength: 0 };
    }

    let bullishCount = 0;
    let bearishCount = 0;

    const recent = this.candles.slice(-5);
    for (const candle of recent) {
      if (candle.trend === 'bullish') bullishCount++;
      else bearishCount++;
    }

    if (bullishCount >= 4) {
      return { direction: 'bullish', strength: bullishCount };
    } else if (bearishCount >= 4) {
      return { direction: 'bearish', strength: bearishCount };
    }

    return { direction: 'neutral', strength: Math.abs(bullishCount - bearishCount) };
  }

  reset(): void {
    this.prevHAOpen = null;
    this.prevHAClose = null;
    this.candles = [];
  }
}

// ==================== RENKO ====================

/**
 * Renko Chart Generator
 * 
 * Renko charts are built using price movements rather than time.
 * Each "brick" is created when price moves a specified amount.
 * Bricks are always the same size, making trends easier to spot.
 * 
 * Types:
 * - Fixed brick size
 * - ATR-based brick size (adaptive)
 */
export class RenkoChart {
  private brickSize: number;
  private useATR: boolean;
  private atrPeriod: number;
  
  // State
  private bricks: RenkoBrick[] = [];
  private currentPrice: number | null = null;
  private currentOpen: number | null = null;
  private atrValues: number[] = [];
  private trValues: number[] = [];
  private prevClose: number | null = null;
  private dynamicBrickSize: number | null = null;

  constructor(config: { brickSize?: number; useATR?: boolean; atrPeriod?: number } = {}) {
    this.brickSize = config.brickSize ?? 10;
    this.useATR = config.useATR ?? false;
    this.atrPeriod = config.atrPeriod ?? 14;
  }

  /**
   * Process a new price and generate Renko bricks
   */
  calculate(bar: { time: Time; high: number; low: number; close: number }): RenkoBrick[] {
    const newBricks: RenkoBrick[] = [];

    // Update ATR if using dynamic brick size
    if (this.useATR) {
      this.updateATR(bar);
      if (this.dynamicBrickSize === null) {
        return [];
      }
    }

    const effectiveBrickSize = this.useATR && this.dynamicBrickSize
      ? this.dynamicBrickSize
      : this.brickSize;

    const price = bar.close;

    // Initialize first brick
    if (this.currentPrice === null) {
      this.currentPrice = price;
      this.currentOpen = Math.round(price / effectiveBrickSize) * effectiveBrickSize;
      return [];
    }

    // Calculate price movement in terms of brick size
    const priceDiff = price - this.currentOpen;
    const brickCount = Math.floor(Math.abs(priceDiff) / effectiveBrickSize);

    if (brickCount === 0) {
      return [];
    }

    // Generate bricks
    const direction = priceDiff > 0 ? 'up' : 'down';
    
    for (let i = 0; i < brickCount; i++) {
      let newOpen: number;
      let newClose: number;

      if (direction === 'up') {
        newOpen = this.currentOpen! + i * effectiveBrickSize;
        newClose = newOpen + effectiveBrickSize;
      } else {
        newOpen = this.currentOpen! - i * effectiveBrickSize;
        newClose = newOpen - effectiveBrickSize;
      }

      const brick: RenkoBrick = {
        time: bar.time,
        open: newOpen,
        close: newClose,
        direction,
        size: effectiveBrickSize,
      };

      newBricks.push(brick);
      this.bricks.push(brick);
    }

    // Update current state
    const lastBrick = newBricks[newBricks.length - 1];
    this.currentOpen = lastBrick.close;
    this.currentPrice = price;

    return newBricks;
  }

  private updateATR(bar: { high: number; low: number; close: number }): void {
    let tr: number;
    if (this.prevClose === null) {
      tr = bar.high - bar.low;
    } else {
      tr = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - this.prevClose),
        Math.abs(bar.low - this.prevClose)
      );
    }
    this.trValues.push(tr);
    this.prevClose = bar.close;

    if (this.trValues.length > this.atrPeriod) {
      this.trValues.shift();
    }

    if (this.trValues.length >= this.atrPeriod) {
      const atr = this.trValues.reduce((a, b) => a + b, 0) / this.trValues.length;
      this.dynamicBrickSize = atr; // Use ATR as brick size
    }
  }

  getBricks(): RenkoBrick[] {
    return this.bricks;
  }

  getLastBricks(n: number): RenkoBrick[] {
    return this.bricks.slice(-n);
  }

  /**
   * Detect Renko trend
   */
  getTrend(): { direction: 'up' | 'down' | 'neutral'; strength: number } {
    if (this.bricks.length < 2) {
      return { direction: 'neutral', strength: 0 };
    }

    let upCount = 0;
    let downCount = 0;

    const recent = this.bricks.slice(-5);
    for (const brick of recent) {
      if (brick.direction === 'up') upCount++;
      else downCount++;
    }

    if (upCount > downCount) {
      return { direction: 'up', strength: upCount };
    } else if (downCount > upCount) {
      return { direction: 'down', strength: downCount };
    }

    return { direction: 'neutral', strength: 0 };
  }

  reset(): void {
    this.bricks = [];
    this.currentPrice = null;
    this.currentOpen = null;
    this.atrValues = [];
    this.trValues = [];
    this.prevClose = null;
    this.dynamicBrickSize = null;
  }
}

// ==================== KELTNER CHANNEL ====================

/**
 * Keltner Channel Indicator
 * 
 * A volatility-based envelope that uses ATR to set channel width.
 * Similar to Bollinger Bands but uses ATR instead of standard deviation.
 * 
 * Formula:
 * Middle Line = EMA(Close, period)
 * Upper Band = Middle Line + (ATR × Multiplier)
 * Lower Band = Middle Line - (ATR × Multiplier)
 */
export class KeltnerChannel {
  private emaPeriod: number;
  private atrPeriod: number;
  private multiplier: number;
  
  // State for EMA
  private emaValues: number[] = [];
  private emaMultiplier: number;
  private currentEma: number | null = null;
  
  // State for ATR
  private trValues: number[] = [];
  private currentAtr: number | null = null;
  private prevClose: number | null = null;

  constructor(config: { emaPeriod?: number; atrPeriod?: number; multiplier?: number } = {}) {
    this.emaPeriod = config.emaPeriod ?? 20;
    this.atrPeriod = config.atrPeriod ?? 10;
    this.multiplier = config.multiplier ?? 2;
    this.emaMultiplier = 2 / (this.emaPeriod + 1);
  }

  /**
   * Calculate Keltner Channel for a new bar
   */
  calculate(bar: { high: number; low: number; close: number }): KeltnerChannelResult {
    // Calculate True Range
    let tr: number;
    if (this.prevClose === null) {
      tr = bar.high - bar.low;
    } else {
      tr = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - this.prevClose),
        Math.abs(bar.low - this.prevClose)
      );
    }
    this.trValues.push(tr);
    this.prevClose = bar.close;

    // Calculate ATR
    if (this.trValues.length >= this.atrPeriod) {
      if (this.currentAtr === null) {
        this.currentAtr = this.trValues.slice(-this.atrPeriod).reduce((a, b) => a + b, 0) / this.atrPeriod;
      } else {
        this.currentAtr = (this.currentAtr * (this.atrPeriod - 1) + tr) / this.atrPeriod;
      }
    }

    // Calculate EMA
    if (this.currentEma === null) {
      this.currentEma = bar.close;
    } else {
      this.currentEma = (bar.close - this.currentEma) * this.emaMultiplier + this.currentEma;
    }

    // Not enough data
    if (this.currentAtr === null || this.currentEma === null) {
      return {
        upper: null,
        middle: null,
        lower: null,
        bandwidth: null,
      };
    }

    // Calculate bands
    const upper = this.currentEma + this.multiplier * this.currentAtr;
    const lower = this.currentEma - this.multiplier * this.currentAtr;
    const bandwidth = (upper - lower) / this.currentEma;

    return {
      upper,
      middle: this.currentEma,
      lower,
      bandwidth,
    };
  }

  /**
   * Check price position relative to channel
   */
  getPricePosition(close: number, result: KeltnerChannelResult): 'above' | 'below' | 'inside' {
    if (result.upper === null || result.lower === null) {
      return 'inside';
    }

    if (close > result.upper) return 'above';
    if (close < result.lower) return 'below';
    return 'inside';
  }

  reset(): void {
    this.emaValues = [];
    this.currentEma = null;
    this.trValues = [];
    this.currentAtr = null;
    this.prevClose = null;
  }
}

// ==================== MASS INDEX ====================

/**
 * Mass Index Indicator
 * 
 * The Mass Index is a range oscillator that identifies potential trend reversals
 * by measuring the narrowing and widening of trading ranges.
 * 
 * Formula:
 * 1. Single EMA = EMA(High - Low, 9)
 * 2. Double EMA = EMA(Single EMA, 9)
 * 3. EMA Ratio = Single EMA / Double EMA
 * 4. Mass Index = Sum of EMA Ratio over 25 periods
 * 
 * Signal:
 * - When Mass Index rises above 27, then falls below 26.5, a reversal may occur
 */
export class MassIndex {
  private emaPeriod: number;
  private sumPeriod: number;
  
  // State for first EMA
  private singleEmaValues: number[] = [];
  private currentSingleEma: number | null = null;
  
  // State for double EMA
  private doubleEmaValues: number[] = [];
  private currentDoubleEma: number | null = null;
  
  // State for EMA ratio sum
  private emaRatios: number[] = [];
  
  // Signal detection
  private wasAbove27 = false;
  private lastValue: number | null = null;

  constructor(config: { emaPeriod?: number; sumPeriod?: number } = {}) {
    this.emaPeriod = config.emaPeriod ?? 9;
    this.sumPeriod = config.sumPeriod ?? 25;
  }

  /**
   * Calculate Mass Index for a new bar
   */
  calculate(bar: { high: number; low: number }): MassIndexResult {
    const range = bar.high - bar.low;
    const multiplier = 2 / (this.emaPeriod + 1);

    // Calculate single EMA
    if (this.currentSingleEma === null) {
      this.currentSingleEma = range;
    } else {
      this.currentSingleEma = (range - this.currentSingleEma) * multiplier + this.currentSingleEma;
    }

    // Calculate double EMA
    if (this.currentDoubleEma === null) {
      this.currentDoubleEma = this.currentSingleEma;
    } else {
      this.currentDoubleEma = (this.currentSingleEma - this.currentDoubleEma) * multiplier + this.currentDoubleEma;
    }

    // Calculate EMA ratio
    if (this.currentDoubleEma === 0) {
      return { value: null, signal: null };
    }

    const emaRatio = this.currentSingleEma / this.currentDoubleEma;
    this.emaRatios.push(emaRatio);

    if (this.emaRatios.length > this.sumPeriod) {
      this.emaRatios.shift();
    }

    // Not enough data
    if (this.emaRatios.length < this.sumPeriod) {
      return { value: null, signal: null };
    }

    // Calculate Mass Index
    const massIndex = this.emaRatios.reduce((a, b) => a + b, 0);

    // Detect reversal signal
    let signal: 'reversal' | null = null;

    if (massIndex > 27) {
      this.wasAbove27 = true;
    }

    if (this.wasAbove27 && massIndex < 26.5) {
      signal = 'reversal';
      this.wasAbove27 = false;
    }

    this.lastValue = massIndex;

    return { value: massIndex, signal };
  }

  /**
   * Get current Mass Index interpretation
   */
  getInterpretation(value: number | null): string {
    if (value === null) return 'Insufficient data';
    if (value > 27) return 'Bulge: Potential trend reversal forming';
    if (value > 26.5) return 'High: Watch for reversal signal';
    if (value < 20) return 'Low: No significant range expansion';
    return 'Normal: No clear signal';
  }

  reset(): void {
    this.singleEmaValues = [];
    this.currentSingleEma = null;
    this.doubleEmaValues = [];
    this.currentDoubleEma = null;
    this.emaRatios = [];
    this.wasAbove27 = false;
    this.lastValue = null;
  }
}

// ==================== BATCH CALCULATORS ====================

/**
 * Calculate SuperTrend for historical data
 */
export function calculateSuperTrendBatch(
  candles: Candle[],
  config: { period?: number; multiplier?: number } = {}
): IndicatorResult {
  const supertrend = new SuperTrend(config);
  const values: (number | null)[] = [];
  const trends: ('bullish' | 'bearish' | null)[] = [];

  for (const candle of candles) {
    const result = supertrend.calculate(candle);
    values.push(result.value);
    trends.push(result.trend);
  }

  const buildLineData = (vals: (number | null)[]): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = vals[i];
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
      { name: 'supertrend', data: buildLineData(values), color: '#2962FF' },
    ],
    histograms: [],
  };
}

/**
 * Calculate VWAP for historical data
 */
export function calculateVWAPBatch(
  candles: Candle[],
  config: { stddevMultiplier?: number } = {}
): IndicatorResult {
  const vwap = new VWAP(config);
  const values: (number | null)[] = [];
  const upperBands: (number | null)[] = [];
  const lowerBands: (number | null)[] = [];

  for (const candle of candles) {
    const result = vwap.calculate(candle);
    values.push(result.value);
    upperBands.push(result.upperBand);
    lowerBands.push(result.lowerBand);
  }

  const buildLineData = (vals: (number | null)[]): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = vals[i];
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
      { name: 'vwap', data: buildLineData(values), color: '#FF6D00' },
      { name: 'upper', data: buildLineData(upperBands), color: '#2962FF' },
      { name: 'lower', data: buildLineData(lowerBands), color: '#2962FF' },
    ],
    histograms: [],
  };
}

/**
 * Calculate Keltner Channel for historical data
 */
export function calculateKeltnerChannelBatch(
  candles: Candle[],
  config: { emaPeriod?: number; atrPeriod?: number; multiplier?: number } = {}
): IndicatorResult {
  const kc = new KeltnerChannel(config);
  const uppers: (number | null)[] = [];
  const middles: (number | null)[] = [];
  const lowers: (number | null)[] = [];

  for (const candle of candles) {
    const result = kc.calculate(candle);
    uppers.push(result.upper);
    middles.push(result.middle);
    lowers.push(result.lower);
  }

  const buildLineData = (vals: (number | null)[]): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = vals[i];
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
      { name: 'upper', data: buildLineData(uppers), color: '#2962FF' },
      { name: 'middle', data: buildLineData(middles), color: '#FF6D00' },
      { name: 'lower', data: buildLineData(lowers), color: '#2962FF' },
    ],
    histograms: [],
  };
}

/**
 * Calculate Mass Index for historical data
 */
export function calculateMassIndexBatch(
  candles: Candle[],
  config: { emaPeriod?: number; sumPeriod?: number } = {}
): IndicatorResult {
  const mi = new MassIndex(config);
  const values: (number | null)[] = [];

  for (const candle of candles) {
    const result = mi.calculate(candle);
    values.push(result.value);
  }

  const buildLineData = (vals: (number | null)[]): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = vals[i];
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
      { name: 'mass_index', data: buildLineData(values), color: '#9C27B0' },
    ],
    histograms: [],
  };
}

/**
 * Convert candles to Heikin-Ashi
 */
export function convertToHeikinAshi(candles: Candle[]): HeikinAshiCandle[] {
  const ha = new HeikinAshi();
  return candles.map(c => ha.calculate(c));
}

/**
 * Convert candles to Renko
 */
export function convertToRenko(
  candles: Candle[],
  config: { brickSize?: number; useATR?: boolean; atrPeriod?: number } = {}
): RenkoBrick[] {
  const renko = new RenkoChart(config);
  let allBricks: RenkoBrick[] = [];

  for (const candle of candles) {
    const newBricks = renko.calculate(candle);
    allBricks = allBricks.concat(newBricks);
  }

  return allBricks;
}
