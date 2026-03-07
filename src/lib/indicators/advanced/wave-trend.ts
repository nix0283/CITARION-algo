/**
 * WaveTrend Oscillator
 *
 * A powerful momentum and trend-following oscillator that identifies overbought/oversold
 * conditions and momentum crossovers. Originally developed by LazyBear on TradingView.
 *
 * Algorithm:
 * 1. Calculate HLC3 (typical price) = (High + Low + Close) / 3
 * 2. Calculate EMA of HLC3 (ESA - Exponential Simple Average)
 * 3. Calculate absolute deviation: |HLC3 - ESA|
 * 4. Calculate EMA of deviation (D)
 * 5. Calculate CI (Channel Index) = (HLC3 - ESA) / (0.015 * D)
 * 6. Calculate WT1 = EMA of CI
 * 7. Calculate WT2 = SMA of WT1 (signal line)
 *
 * Signals:
 * - OVERBOUGHT: WT1 > overBoughtLevel1
 * - OVERSOLD: WT1 < overSoldLevel1
 * - BULLISH CROSSOVER: WT1 crosses above WT2
 * - BEARISH CROSSOVER: WT1 crosses below WT2
 */

import type { Time, LineData, HistogramData, WhitespaceData } from "lightweight-charts";
import type { IndicatorResult } from "../calculator";

// ==================== TYPES ====================

/**
 * Configuration for WaveTrend Oscillator
 */
export interface WaveTrendConfig {
  channelLength: number;        // Default: 10 - EMA period for CI calculation
  averageLength: number;        // Default: 21 - EMA period for WT1, SMA period for WT2
  overBoughtLevel1: number;     // Default: 60 - Main overbought level
  overBoughtLevel2: number;     // Default: 53 - Secondary overbought level
  overSoldLevel1: number;       // Default: -60 - Main oversold level
  overSoldLevel2: number;       // Default: -53 - Secondary oversold level
}

/**
 * Result of WaveTrend calculation for a single candle
 */
export interface WaveTrendResult {
  wt1: number;                  // Main wave line (EMA of CI)
  wt2: number;                  // Signal line (SMA of WT1)
  divergence: number;           // wt1 - wt2 (histogram)
  signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  crossover: 'BULLISH' | 'BEARISH' | 'NONE';
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
 * Calculate Exponential Moving Average
 */
function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i];
  }

  if (data.length >= period) {
    result[period - 1] = sum / period;

    // Calculate EMA
    let prevEma = result[period - 1] as number;
    for (let i = period; i < data.length; i++) {
      const currentEma = (data[i] - prevEma) * multiplier + prevEma;
      result[i] = currentEma;
      prevEma = currentEma;
    }
  }

  return result;
}

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
 * Calculate EMA of absolute values
 */
function calculateEMAOfAbsoluteDeviation(
  data: number[],
  reference: (number | null)[],
  period: number
): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  const multiplier = 2 / (period + 1);

  // Calculate absolute deviations
  const deviations: number[] = data.map((v, i) => {
    const ref = reference[i];
    if (ref === null) return 0;
    return Math.abs(v - ref);
  });

  // First EMA is SMA of deviations
  let sum = 0;
  for (let i = 0; i < period && i < deviations.length; i++) {
    sum += deviations[i];
  }

  if (deviations.length >= period) {
    result[period - 1] = sum / period;

    // Calculate EMA
    let prevEma = result[period - 1] as number;
    for (let i = period; i < deviations.length; i++) {
      const currentEma = (deviations[i] - prevEma) * multiplier + prevEma;
      result[i] = currentEma;
      prevEma = currentEma;
    }
  }

  return result;
}

// ==================== MAIN CLASS ====================

/**
 * WaveTrend Oscillator Class
 *
 * Implements the WaveTrend indicator for momentum and trend analysis.
 */
export class WaveTrend {
  private config: WaveTrendConfig;

  constructor(config: Partial<WaveTrendConfig> = {}) {
    this.config = {
      channelLength: config.channelLength ?? 10,
      averageLength: config.averageLength ?? 21,
      overBoughtLevel1: config.overBoughtLevel1 ?? 60,
      overBoughtLevel2: config.overBoughtLevel2 ?? 53,
      overSoldLevel1: config.overSoldLevel1 ?? -60,
      overSoldLevel2: config.overSoldLevel2 ?? -53,
    };
  }

  /**
   * Calculate WaveTrend indicator values
   */
  calculate(highs: number[], lows: number[], closes: number[]): WaveTrendResult[] {
    const results: WaveTrendResult[] = [];
    const { channelLength, averageLength, overBoughtLevel1, overSoldLevel1 } = this.config;

    if (highs.length === 0 || highs.length !== lows.length || highs.length !== closes.length) {
      return results;
    }

    // Calculate HLC3 (typical price)
    const hlc3: number[] = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);

    // Step 1: Calculate EMA of HLC3 (ESA - Exponential Simple Average)
    const esa = calculateEMA(hlc3, channelLength);

    // Step 2: Calculate EMA of absolute deviation (D)
    const d = calculateEMAOfAbsoluteDeviation(hlc3, esa, channelLength);

    // Step 3: Calculate Channel Index (CI)
    const ci: (number | null)[] = hlc3.map((h, i) => {
      const esaVal = esa[i];
      const dVal = d[i];
      if (esaVal === null || dVal === null || dVal === 0) return null;
      return (h - esaVal) / (0.015 * dVal);
    });

    // Step 4: Calculate WT1 (EMA of CI)
    const wt1Values = calculateEMA(ci.filter(v => v !== null) as number[], averageLength);

    // Map WT1 back to original indices
    const wt1: (number | null)[] = new Array(highs.length).fill(null);
    let wt1Idx = 0;
    for (let i = 0; i < highs.length; i++) {
      if (ci[i] !== null) {
        wt1[i] = wt1Values[wt1Idx] ?? null;
        wt1Idx++;
      }
    }

    // Step 5: Calculate WT2 (SMA of WT1 - signal line)
    const wt2Values = calculateSMA(wt1.filter(v => v !== null) as number[], 4);

    // Map WT2 back to original indices
    const wt2: (number | null)[] = new Array(highs.length).fill(null);
    let wt2Idx = 0;
    for (let i = 0; i < highs.length; i++) {
      if (wt1[i] !== null) {
        wt2[i] = wt2Values[wt2Idx] ?? null;
        wt2Idx++;
      }
    }

    // Build results with signal detection
    for (let i = 0; i < highs.length; i++) {
      const wt1Val = wt1[i];
      const wt2Val = wt2[i];

      // Default values for incomplete data
      if (wt1Val === null || wt2Val === null) {
        results.push({
          wt1: 0,
          wt2: 0,
          divergence: 0,
          signal: 'NEUTRAL',
          crossover: 'NONE',
        });
        continue;
      }

      // Calculate divergence (histogram)
      const divergence = wt1Val - wt2Val;

      // Determine signal (overbought/oversold)
      let signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
      if (wt1Val > overBoughtLevel1) {
        signal = 'OVERBOUGHT';
      } else if (wt1Val < overSoldLevel1) {
        signal = 'OVERSOLD';
      } else {
        signal = 'NEUTRAL';
      }

      // Detect crossover
      let crossover: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
      if (i > 0) {
        const prevWt1 = wt1[i - 1];
        const prevWt2 = wt2[i - 1];

        if (prevWt1 !== null && prevWt2 !== null) {
          // Bullish crossover: WT1 crosses above WT2
          if (prevWt1 <= prevWt2 && wt1Val > wt2Val) {
            crossover = 'BULLISH';
          }
          // Bearish crossover: WT1 crosses below WT2
          else if (prevWt1 >= prevWt2 && wt1Val < wt2Val) {
            crossover = 'BEARISH';
          }
        }
      }

      results.push({
        wt1: wt1Val,
        wt2: wt2Val,
        divergence,
        signal,
        crossover,
      });
    }

    return results;
  }

  /**
   * Get WaveTrend entry signal
   * Analyzes current and previous results to generate trading signals
   */
  getEntrySignal(
    current: WaveTrendResult,
    previous: WaveTrendResult | null
  ): 'BUY' | 'SELL' | 'WAIT' {
    // BUY conditions:
    // 1. Bullish crossover in oversold zone
    // 2. WT1 crosses above WT2 while oversold
    if (current.crossover === 'BULLISH' && current.signal === 'OVERSOLD') {
      return 'BUY';
    }

    // Also buy if crossover happens near oversold zone
    if (current.crossover === 'BULLISH' && current.wt1 < -40) {
      return 'BUY';
    }

    // SELL conditions:
    // 1. Bearish crossover in overbought zone
    // 2. WT1 crosses below WT2 while overbought
    if (current.crossover === 'BEARISH' && current.signal === 'OVERBOUGHT') {
      return 'SELL';
    }

    // Also sell if crossover happens near overbought zone
    if (current.crossover === 'BEARISH' && current.wt1 > 40) {
      return 'SELL';
    }

    return 'WAIT';
  }

  /**
   * Detect divergence between price and WaveTrend
   */
  detectDivergence(
    prices: number[],
    waveTrendResults: WaveTrendResult[],
    lookback: number = 14
  ): 'BULLISH_DIV' | 'BEARISH_DIV' | 'NONE' {
    if (prices.length < lookback || waveTrendResults.length < lookback) {
      return 'NONE';
    }

    const recentPrices = prices.slice(-lookback);
    const recentWt = waveTrendResults.slice(-lookback);

    // Find price lows and WT lows for bullish divergence
    let priceLowIdx = 0;
    let wtLowIdx = 0;
    let priceLow = recentPrices[0];
    let wtLow = recentWt[0].wt1;

    // Find price highs and WT highs for bearish divergence
    let priceHighIdx = 0;
    let wtHighIdx = 0;
    let priceHigh = recentPrices[0];
    let wtHigh = recentWt[0].wt1;

    for (let i = 1; i < recentPrices.length; i++) {
      if (recentPrices[i] < priceLow) {
        priceLow = recentPrices[i];
        priceLowIdx = i;
      }
      if (recentWt[i].wt1 < wtLow) {
        wtLow = recentWt[i].wt1;
        wtLowIdx = i;
      }
      if (recentPrices[i] > priceHigh) {
        priceHigh = recentPrices[i];
        priceHighIdx = i;
      }
      if (recentWt[i].wt1 > wtHigh) {
        wtHigh = recentWt[i].wt1;
        wtHighIdx = i;
      }
    }

    // Bullish divergence: price makes lower low, WT makes higher low
    // This indicates potential upward reversal
    if (priceLowIdx === recentPrices.length - 1 && wtLowIdx !== recentWt.length - 1) {
      // Current price is at low, but WT is not at its low
      if (wtLow < -40) { // Ensure we're in oversold territory
        return 'BULLISH_DIV';
      }
    }

    // Bearish divergence: price makes higher high, WT makes lower high
    // This indicates potential downward reversal
    if (priceHighIdx === recentPrices.length - 1 && wtHighIdx !== recentWt.length - 1) {
      // Current price is at high, but WT is not at its high
      if (wtHigh > 40) { // Ensure we're in overbought territory
        return 'BEARISH_DIV';
      }
    }

    return 'NONE';
  }

  /**
   * Get indicator result for chart rendering
   */
  calculateIndicator(candles: Candle[]): IndicatorResult {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    const results = this.calculate(highs, lows, closes);

    // Build WT1 line data
    const wt1Data: (LineData<Time> | WhitespaceData<Time>)[] = results.map((r, i) => ({
      time: candles[i].time,
      value: r.wt1,
    }));

    // Build WT2 line data
    const wt2Data: (LineData<Time> | WhitespaceData<Time>)[] = results.map((r, i) => ({
      time: candles[i].time,
      value: r.wt2,
    }));

    // Build divergence histogram data
    const divergenceData: (HistogramData<Time> | WhitespaceData<Time>)[] = results.map((r, i) => ({
      time: candles[i].time,
      value: r.divergence,
      color: r.divergence >= 0 ? '#26A69A' : '#EF5350',
    }));

    return {
      id: 'wave_trend',
      overlay: false,
      lines: [
        { name: 'wt1', data: wt1Data, color: '#2962FF' },
        { name: 'wt2', data: wt2Data, color: '#FF6D00' },
      ],
      histograms: [
        { name: 'divergence', data: divergenceData, color: '#26A69A' },
      ],
    };
  }
}

// ==================== STANDALONE FUNCTIONS ====================

/**
 * Calculate WaveTrend indicator (standalone function)
 */
export function calculateWaveTrend(
  highs: number[],
  lows: number[],
  closes: number[],
  config: Partial<WaveTrendConfig> = {}
): WaveTrendResult[] {
  const indicator = new WaveTrend(config);
  return indicator.calculate(highs, lows, closes);
}

/**
 * Get WaveTrend entry signal (standalone function)
 */
export function getWaveTrendEntrySignal(
  current: WaveTrendResult,
  previous: WaveTrendResult | null
): 'BUY' | 'SELL' | 'WAIT' {
  const indicator = new WaveTrend();
  return indicator.getEntrySignal(current, previous);
}

/**
 * Detect divergence (standalone function)
 */
export function detectDivergence(
  prices: number[],
  waveTrendResults: WaveTrendResult[],
  lookback: number = 14
): 'BULLISH_DIV' | 'BEARISH_DIV' | 'NONE' {
  const indicator = new WaveTrend();
  return indicator.detectDivergence(prices, waveTrendResults, lookback);
}

/**
 * Calculate WaveTrend for chart indicator system
 */
export function calculateWaveTrendIndicator(
  candles: Candle[],
  config: Partial<WaveTrendConfig> = {}
): IndicatorResult {
  const indicator = new WaveTrend(config);
  return indicator.calculateIndicator(candles);
}

// Export default class
export default WaveTrend;
