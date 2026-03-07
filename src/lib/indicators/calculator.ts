/**
 * Indicator Calculator
 * 
 * Computes indicator values from OHLCV data for chart rendering
 */

import type { Time, LineData, HistogramData, WhitespaceData } from "lightweight-charts";
import type { BuiltInIndicator } from "./builtin";
import {
  calculatePivotPoints,
  type PivotType,
  type PivotConfig,
} from "./pivot";
import {
  calculateIchimoku,
  type IchimokuConfig,
} from "./ichimoku";
import {
  analyzeDepth,
  calculateDepthDeltaIndicator,
  calculateDepthImbalanceIndicator,
  calculateDepthMiddlePriceIndicator,
  type OrderBookSnapshot,
  type DepthConfig,
} from "./depth";
import {
  calculateFractals,
  type FractalsConfig,
} from "./fractals";
import {
  calculateSuperTrend,
  calculateVWAP,
  calculateKeltnerChannel,
  calculateMassIndex,
} from "./ta4j-port";
import {
  calculateStochastic,
  calculateADX,
} from "./quantclub-port";
import {
  calculateHeikinAshi,
} from "./heikin-ashi";
import {
  calculateRenko,
} from "./renko";
import { extendedCalculators } from "./extended-calculators";

export interface Candle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  id: string;
  overlay: boolean;
  lines: Array<{
    name: string;
    data: (LineData<Time> | WhitespaceData<Time>)[];
    color: string;
  }>;
  histograms: Array<{
    name: string;
    data: (HistogramData<Time> | WhitespaceData<Time>)[];
    color: string;
  }>;
}

// ==================== HELPER FUNCTIONS ====================

function sma(data: number[], period: number): (number | null)[] {
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

function ema(data: number[], period: number): (number | null)[] {
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

function rsi(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  
  if (closes.length < period + 1) return result;
  
  // Calculate price changes
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  // First RSI calculation uses SMA
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    result[period] = 100 - (100 / (1 + avgGain / avgLoss));
  }
  
  // Subsequent calculations use EMA-like smoothing
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    if (avgLoss === 0) {
      result[i + 1] = 100;
    } else {
      result[i + 1] = 100 - (100 / (1 + avgGain / avgLoss));
    }
  }
  
  return result;
}

function stdev(data: number[], period: number): (number | null)[] {
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
  
  // Calculate ATR (SMA of TR)
  if (trValues.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trValues[i];
    }
    result[period - 1] = sum / period;
    
    // Smoothed ATR
    for (let i = period; i < trValues.length; i++) {
      result[i] = (result[i - 1] as number * (period - 1) + trValues[i]) / period;
    }
  }
  
  return result;
}

// ==================== SAFE DATA BUILDERS ====================

// Build line data with proper alignment
// Include whitespace points for null values to ensure time alignment
// This is critical for chart synchronization
export function buildLineData(
  candles: Candle[],
  values: (number | null)[]
): (LineData<Time> | WhitespaceData<Time>)[] {
  const result: (LineData<Time> | WhitespaceData<Time>)[] = [];

  for (let i = 0; i < candles.length; i++) {
    const value = values[i];
    const time = candles[i].time;

    if (value !== null && !isNaN(value) && isFinite(value)) {
      result.push({
        time,
        value,
      });
    } else {
      // Add whitespace data point for null values
      // This ensures the indicator data spans the same time range as candles
      result.push({ time });
    }
  }

  return result;
}

export function buildHistogramData(
  candles: Candle[],
  values: (number | null)[],
  colorUp: string,
  colorDown: string
): (HistogramData<Time> | WhitespaceData<Time>)[] {
  const result: (HistogramData<Time> | WhitespaceData<Time>)[] = [];
  for (let i = 0; i < candles.length; i++) {
    const value = values[i];
    const time = candles[i].time;
    if (value !== null && !isNaN(value) && isFinite(value)) {
      result.push({
        time,
        value,
        color: value >= 0 ? colorUp : colorDown,
      });
    } else {
      // Add whitespace for null values
      result.push({ time });
    }
  }
  return result;
}

// ==================== INDICATOR CALCULATORS ====================

function calculateSMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  const smaValues = sma(closes, length);
  
  return {
    id: 'sma',
    overlay: true,
    lines: [{
      name: 'sma',
      data: buildLineData(candles, smaValues),
      color: '#2962FF',
    }],
    histograms: [],
  };
}

function calculateEMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  const emaValues = ema(closes, length);
  
  return {
    id: 'ema',
    overlay: true,
    lines: [{
      name: 'ema',
      data: buildLineData(candles, emaValues),
      color: '#00C853',
    }],
    histograms: [],
  };
}

function calculateEMACross(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const fastLength = inputs.fastLength as number;
  const slowLength = inputs.slowLength as number;
  const closes = candles.map(c => c.close);
  
  const fastEma = ema(closes, fastLength);
  const slowEma = ema(closes, slowLength);
  
  return {
    id: 'ema_cross',
    overlay: true,
    lines: [
      { name: 'fast', data: buildLineData(candles, fastEma), color: '#00C853' },
      { name: 'slow', data: buildLineData(candles, slowEma), color: '#F6465D' },
    ],
    histograms: [],
  };
}

function calculateRSI(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  const rsiValues = rsi(closes, length);
  
  return {
    id: 'rsi',
    overlay: false,
    lines: [{
      name: 'rsi',
      data: buildLineData(candles, rsiValues),
      color: '#D500F9',
    }],
    histograms: [],
  };
}

function calculateMACD(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const fastLength = inputs.fastLength as number;
  const slowLength = inputs.signalLength as number;
  const signalLength = inputs.signalLength as number;
  const closes = candles.map(c => c.close);
  
  const fastEma = ema(closes, fastLength);
  const slowEma = ema(closes, slowLength);
  
  // MACD Line = Fast EMA - Slow EMA
  const macdLine: (number | null)[] = closes.map((_, i) => {
    if (fastEma[i] === null || slowEma[i] === null) return null;
    return fastEma[i]! - slowEma[i]!;
  });
  
  // Signal Line = EMA of MACD
  const macdValues = macdLine.filter(v => v !== null) as number[];
  const signalEma = ema(macdValues, signalLength);
  
  // Map signal back to original indices
  const signalLine: (number | null)[] = new Array(candles.length).fill(null);
  let macdIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (macdLine[i] !== null) {
      signalLine[i] = signalEma[macdIdx] ?? null;
      macdIdx++;
    }
  }
  
  // Histogram = MACD - Signal
  const histogramValues: (number | null)[] = candles.map((_, i) => {
    const macd = macdLine[i];
    const signal = signalLine[i];
    if (macd === null || signal === null) return null;
    return macd - signal;
  });
  
  return {
    id: 'macd',
    overlay: false,
    lines: [
      { name: 'macd', data: buildLineData(candles, macdLine), color: '#2962FF' },
      { name: 'signal', data: buildLineData(candles, signalLine), color: '#FF6D00' },
    ],
    histograms: [{ 
      name: 'histogram', 
      data: buildHistogramData(candles, histogramValues, '#26a69a', '#ef5350'), 
      color: '#26a69a' 
    }],
  };
}

function calculateBB(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const mult = inputs.mult as number;
  const closes = candles.map(c => c.close);
  
  const smaValues = sma(closes, length);
  const stdevValues = stdev(closes, length);
  
  const upperValues: (number | null)[] = closes.map((_, i) => {
    if (smaValues[i] === null || stdevValues[i] === null) return null;
    return smaValues[i]! + stdevValues[i]! * mult;
  });
  
  const lowerValues: (number | null)[] = closes.map((_, i) => {
    if (smaValues[i] === null || stdevValues[i] === null) return null;
    return smaValues[i]! - stdevValues[i]! * mult;
  });
  
  return {
    id: 'bb',
    overlay: true,
    lines: [
      { name: 'upper', data: buildLineData(candles, upperValues), color: '#2962FF' },
      { name: 'middle', data: buildLineData(candles, smaValues), color: '#FF6D00' },
      { name: 'lower', data: buildLineData(candles, lowerValues), color: '#2962FF' },
    ],
    histograms: [],
  };
}

function calculateATR(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const atrValues = atr(candles, length);
  
  return {
    id: 'atr',
    overlay: false,
    lines: [{
      name: 'atr',
      data: buildLineData(candles, atrValues),
      color: '#FF6D00',
    }],
    histograms: [],
  };
}

function calculateVolumeSMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const volumes = candles.map(c => c.volume);
  const smaValues = sma(volumes, length);

  // Volume data always has values for all candles (no nulls)
  const volumeData: (HistogramData<Time> | WhitespaceData<Time>)[] = candles.map((c) => ({
    time: c.time,
    value: c.volume,
    color: '#2962FF80',
  }));

  return {
    id: 'vol_sma',
    overlay: false,
    lines: [{ name: 'volSMA', data: buildLineData(candles, smaValues), color: '#FF6D00' }],
    histograms: [{ name: 'volume', data: volumeData, color: '#2962FF80' }],
  };
}

// ==================== PIVOT POINTS CALCULATORS ====================

function calculatePivotIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>,
  type: PivotType
): IndicatorResult {
  const useWeekly = inputs.useWeekly as boolean || false;
  const useMonthly = inputs.useMonthly as boolean || false;

  const config: PivotConfig = { type, useWeekly, useMonthly };
  return calculatePivotPoints(candles, config);
}

function calculatePivotStandard(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculatePivotIndicator(candles, inputs, 'standard');
}

function calculatePivotFibonacci(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculatePivotIndicator(candles, inputs, 'fibonacci');
}

function calculatePivotCamarilla(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculatePivotIndicator(candles, inputs, 'camarilla');
}

function calculatePivotWoodie(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculatePivotIndicator(candles, inputs, 'woodie');
}

function calculatePivotDemark(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculatePivotIndicator(candles, inputs, 'demark');
}

// ==================== ICHIMOKU CALCULATOR ====================

function calculateIchimokuIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const config: Partial<IchimokuConfig> = {
    tenkanPeriod: (inputs.tenkanPeriod as number) ?? 9,
    kijunPeriod: (inputs.kijunPeriod as number) ?? 26,
    senkouBPeriod: (inputs.senkouBPeriod as number) ?? 52,
    displacement: (inputs.displacement as number) ?? 26,
  };

  return calculateIchimoku(candles, config);
}

// ==================== FRACTALS CALCULATOR ====================

function calculateFractalsIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const config: Partial<FractalsConfig> = {
    period: (inputs.period as number) ?? 2,
    showBullish: (inputs.showBullish as boolean) ?? true,
    showBearish: (inputs.showBearish as boolean) ?? true,
  };

  return calculateFractals(candles, config);
}

// ==================== QUANTCLUB INDICATORS CALCULATORS ====================

function calculateStochasticIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculateStochastic(candles, {
    kPeriod: (inputs.kPeriod as number) ?? 14,
    dPeriod: (inputs.dPeriod as number) ?? 3,
    smoothK: (inputs.smoothK as number) ?? 1,
  });
}

function calculateADXIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculateADX(candles, {
    period: (inputs.period as number) ?? 14,
  });
}

// ==================== TA4J INDICATORS CALCULATORS ====================

function calculateSuperTrendIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculateSuperTrend(candles, {
    period: (inputs.period as number) ?? 10,
    multiplier: (inputs.multiplier as number) ?? 3,
  });
}

function calculateVWAPIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculateVWAP(candles, {
    stddevPeriod: (inputs.stddevBands as number) ?? 20,
  });
}

function calculateHeikinAshiCalc(
  candles: Candle[],
  _inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculateHeikinAshi(candles);
}

function calculateRenkoCalc(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculateRenko(candles, {
    brickSize: (inputs.brickSize as number) ?? 0,
    useATR: (inputs.useAtr as boolean) ?? true,
    atrPeriod: (inputs.atrPeriod as number) ?? 14,
  });
}

function calculateKeltnerChannelIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculateKeltnerChannel(candles, {
    period: (inputs.emaPeriod as number) ?? 20,
    atrPeriod: (inputs.atrPeriod as number) ?? 10,
    multiplier: (inputs.multiplier as number) ?? 2,
  });
}

function calculateMassIndexIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  return calculateMassIndex(candles, {
    emaPeriod: (inputs.emaPeriod as number) ?? 9,
    sumPeriod: (inputs.sumPeriod as number) ?? 25,
  });
}

// ==================== MAIN CALCULATOR ====================

const indicatorCalculators: Record<string, (
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
) => IndicatorResult> = {
  sma: calculateSMA,
  ema: calculateEMA,
  ema_cross: calculateEMACross,
  rsi: calculateRSI,
  macd: calculateMACD,
  bb: calculateBB,
  atr: calculateATR,
  vol_sma: calculateVolumeSMA,
  // Pivot Points
  pivot_standard: calculatePivotStandard,
  pivot_fibonacci: calculatePivotFibonacci,
  pivot_camarilla: calculatePivotCamarilla,
  pivot_woodie: calculatePivotWoodie,
  pivot_demark: calculatePivotDemark,
  // Ichimoku
  ichimoku: calculateIchimokuIndicator,
  // Fractals
  fractals: calculateFractalsIndicator,
  // QuantClub Indicators
  stochastic: calculateStochasticIndicator,
  adx: calculateADXIndicator,
  // Ta4j Indicators
  supertrend: calculateSuperTrendIndicator,
  vwap: calculateVWAPIndicator,
  heikin_ashi: calculateHeikinAshiCalc,
  renko: calculateRenkoCalc,
  keltner_channel: calculateKeltnerChannelIndicator,
  mass_index: calculateMassIndexIndicator,
  // Depth indicators (require order book data - not available from candles)
  // These are handled separately in calculateIndicator
  // Extended calculators (all new indicators)
  ...extendedCalculators,
};

export function calculateIndicator(
  indicator: BuiltInIndicator,
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult | null {
  const calculator = indicatorCalculators[indicator.id];
  
  if (!calculator) {
    console.warn(`No calculator implemented for indicator: ${indicator.id}`);
    return null;
  }
  
  return calculator(candles, inputs);
}

export function isOverlayIndicator(indicator: BuiltInIndicator): boolean {
  return indicator.overlay;
}
