/**
 * Extended Indicator Calculators
 * 
 * Additional calculator functions for all new indicators
 * Imports functions from wolfbot and jesse modules
 */

import type { Time, LineData, HistogramData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "./calculator";
import { buildLineData, buildHistogramData } from "./calculator";

// Import from Jesse indicators
import {
  wma as jesseWma,
  hma as jesseHma,
  vwma as jesseVwma,
  smma as jesseSmma,
  dema as jesseDema,
  tema as jesseTema,
  kama as jesseKama,
  vidya as jesseVidya,
  mcginley as jesseMcginley,
  stochrsi as jesseStochrsi,
  ppo as jessePpo,
  willr as jesseWillr,
  cci as jesseCci,
  mfi as jesseMfi,
  roc as jesseRoc,
  momentum as jesseMomentum,
  cmo as jesseCmo,
  ultosc as jesseUltosc,
  ao as jesseAo,
  tsi as jesseTsi,
  tr as jesseTr,
  atr as jesseAtr,
  stddev as jesseStddev,
  historicalVolatility as jesseHistVol,
  obv as jesseObv,
  vwap as jesseVwap,
  cmf as jesseCmf,
  adl as jesseAdl,
  adx as jesseAdx,
  sar as jesseSar,
  aroon as jesseAroon
} from "../jesse/indicators";

// Local type for Jesse candles
interface JesseCandle {
  time: number;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ==================== MOVING AVERAGES ====================

export function calculateWMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const wmaValues = jesseWma(closes, length);
  const values: (number | null)[] = wmaValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'wma',
    overlay: true,
    lines: [{ name: 'wma', data: buildLineData(candles, values), color: '#2196F3' }],
    histograms: [],
  };
}

export function calculateHMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const hmaValues = jesseHma(closes, length);
  const values: (number | null)[] = hmaValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'hma',
    overlay: true,
    lines: [{ name: 'hma', data: buildLineData(candles, values), color: '#FF9800' }],
    histograms: [],
  };
}

export function calculateVWMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  const vwmaValues = jesseVwma(closes, volumes, length);
  const values: (number | null)[] = vwmaValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'vwma',
    overlay: true,
    lines: [{ name: 'vwma', data: buildLineData(candles, values), color: '#9C27B0' }],
    histograms: [],
  };
}

export function calculateSMMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const smmaValues = jesseSmma(closes, length);
  const values: (number | null)[] = smmaValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'smma',
    overlay: true,
    lines: [{ name: 'smma', data: buildLineData(candles, values), color: '#009688' }],
    histograms: [],
  };
}

export function calculateLSMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  // LSMA is linear regression - use local implementation
  const values: (number | null)[] = new Array(candles.length).fill(null);
  
  for (let i = length - 1; i < candles.length; i++) {
    const slice = closes.slice(i - length + 1, i + 1);
    
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    
    for (let j = 0; j < length; j++) {
      sumX += j;
      sumY += slice[j];
      sumXY += j * slice[j];
      sumX2 += j * j;
    }
    
    const n = length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    values[i] = slope * (length - 1) + intercept;
  }
  
  return {
    id: 'lsma',
    overlay: true,
    lines: [{ name: 'lsma', data: buildLineData(candles, values), color: '#00BCD4' }],
    histograms: [],
  };
}

export function calculateDEMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const demaValues = jesseDema(closes, length);
  const values: (number | null)[] = demaValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'dema',
    overlay: true,
    lines: [{ name: 'dema', data: buildLineData(candles, values), color: '#CDDC39' }],
    histograms: [],
  };
}

export function calculateTEMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const temaValues = jesseTema(closes, length);
  const values: (number | null)[] = temaValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'tema',
    overlay: true,
    lines: [{ name: 'tema', data: buildLineData(candles, values), color: '#FFEB3B' }],
    histograms: [],
  };
}

export function calculateKAMA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = (inputs.length as number) ?? 10;
  const fastLength = (inputs.fastLength as number) ?? 2;
  const slowLength = (inputs.slowLength as number) ?? 30;
  const closes = candles.map(c => c.close);
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const kamaValues = jesseKama(closes, length, fastLength, slowLength);
  const values: (number | null)[] = kamaValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'kama',
    overlay: true,
    lines: [{ name: 'kama', data: buildLineData(candles, values), color: '#E91E63' }],
    histograms: [],
  };
}

export function calculateVIDYA(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = (inputs.length as number) ?? 20;
  const cmoPeriod = (inputs.cmoPeriod as number) ?? 10;
  const closes = candles.map(c => c.close);
  
  const vidyaValues = jesseVidya(closes, length, cmoPeriod);
  const values: (number | null)[] = vidyaValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'vidya',
    overlay: true,
    lines: [{ name: 'vidya', data: buildLineData(candles, values), color: '#7B1FA2' }],
    histograms: [],
  };
}

export function calculateMcGinley(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const mcgValues = jesseMcginley(closes, length);
  const values: (number | null)[] = mcgValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'mcginley',
    overlay: true,
    lines: [{ name: 'mcginley', data: buildLineData(candles, values), color: '#8BC34A' }],
    histograms: [],
  };
}

export function calculateRollingVWAP(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const values: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - length + 1);
    const slice = jesseCandles.slice(start, i + 1);
    const vwapVals = jesseVwap(slice);
    values.push(vwapVals[vwapVals.length - 1] || null);
  }
  
  return {
    id: 'rolling_vwap',
    overlay: true,
    lines: [{ name: 'rolling_vwap', data: buildLineData(candles, values), color: '#3F51B5' }],
    histograms: [],
  };
}

// ==================== MOMENTUM ====================

export function calculateStochRSI(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const rsiPeriod = (inputs.rsiPeriod as number) ?? 14;
  const stochPeriod = (inputs.stochPeriod as number) ?? 14;
  const kPeriod = (inputs.kPeriod as number) ?? 3;
  const dPeriod = (inputs.dPeriod as number) ?? 3;
  const closes = candles.map(c => c.close);
  
  const result = jesseStochrsi(closes, rsiPeriod, kPeriod, dPeriod);
  
  const kValues: (number | null)[] = result.k.map(v => isNaN(v) ? null : v);
  const dValues: (number | null)[] = result.d.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'stochrsi',
    overlay: false,
    lines: [
      { name: 'k', data: buildLineData(candles, kValues), color: '#2962FF' },
      { name: 'd', data: buildLineData(candles, dValues), color: '#FF6D00' },
    ],
    histograms: [],
  };
}

export function calculatePPO(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const fastLength = (inputs.fastLength as number) ?? 12;
  const slowLength = (inputs.slowLength as number) ?? 26;
  const signalLength = (inputs.signalLength as number) ?? 9;
  const closes = candles.map(c => c.close);
  
  const result = jessePpo(closes, fastLength, slowLength, signalLength);
  
  const ppoValues: (number | null)[] = result.ppo.map(v => isNaN(v) ? null : v);
  const signalValues: (number | null)[] = result.signal.map(v => isNaN(v) ? null : v);
  const histValues: (number | null)[] = result.histogram.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'ppo',
    overlay: false,
    lines: [
      { name: 'ppo', data: buildLineData(candles, ppoValues), color: '#2962FF' },
      { name: 'signal', data: buildLineData(candles, signalValues), color: '#FF6D00' },
    ],
    histograms: [{ name: 'histogram', data: buildHistogramData(candles, histValues, '#26a69a', '#ef5350'), color: '#26a69a' }],
  };
}

export function calculateWilliamsR(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const wrValues = jesseWillr(jesseCandles, length);
  const values: (number | null)[] = wrValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'williams_r',
    overlay: false,
    lines: [{ name: 'williams_r', data: buildLineData(candles, values), color: '#9C27B0' }],
    histograms: [],
  };
}

export function calculateCCI(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const cciValues = jesseCci(jesseCandles, length);
  const values: (number | null)[] = cciValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'cci',
    overlay: false,
    lines: [{ name: 'cci', data: buildLineData(candles, values), color: '#2962FF' }],
    histograms: [],
  };
}

export function calculateMFI(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const mfiValues = jesseMfi(jesseCandles, length);
  const values: (number | null)[] = mfiValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'mfi',
    overlay: false,
    lines: [{ name: 'mfi', data: buildLineData(candles, values), color: '#26A69A' }],
    histograms: [],
  };
}

export function calculateROC(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const rocValues = jesseRoc(closes, length);
  const values: (number | null)[] = rocValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'roc',
    overlay: false,
    lines: [{ name: 'roc', data: buildLineData(candles, values), color: '#2962FF' }],
    histograms: [],
  };
}

export function calculateMomentum(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const momValues = jesseMomentum(closes, length);
  const values: (number | null)[] = momValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'momentum',
    overlay: false,
    lines: [{ name: 'momentum', data: buildLineData(candles, values), color: '#9C27B0' }],
    histograms: [],
  };
}

export function calculateCMO(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const cmoValues = jesseCmo(closes, length);
  const values: (number | null)[] = cmoValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'cmo',
    overlay: false,
    lines: [{ name: 'cmo', data: buildLineData(candles, values), color: '#009688' }],
    histograms: [],
  };
}

export function calculateUltimateOsc(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const period1 = (inputs.period1 as number) ?? 7;
  const period2 = (inputs.period2 as number) ?? 14;
  const period3 = (inputs.period3 as number) ?? 28;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const uoValues = jesseUltosc(jesseCandles, period1, period2, period3);
  const values: (number | null)[] = uoValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'ultimate_osc',
    overlay: false,
    lines: [{ name: 'ultimate_osc', data: buildLineData(candles, values), color: '#2962FF' }],
    histograms: [],
  };
}

export function calculateAO(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const fastPeriod = (inputs.fastPeriod as number) ?? 5;
  const slowPeriod = (inputs.slowPeriod as number) ?? 34;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const aoValues = jesseAo(jesseCandles, fastPeriod, slowPeriod);
  const values: (number | null)[] = aoValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'ao',
    overlay: false,
    lines: [],
    histograms: [{ name: 'ao', data: buildHistogramData(candles, values, '#26A69A', '#EF5350'), color: '#26A69A' }],
  };
}

export function calculateAC(
  candles: Candle[],
  _inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const aoValues = jesseAo(jesseCandles, 5, 34);
  
  // Calculate AC = AO - SMA(AO, 5)
  const acValues: (number | null)[] = [];
  for (let i = 0; i < aoValues.length; i++) {
    if (i < 4 || isNaN(aoValues[i])) {
      acValues.push(null);
    } else {
      const sma5 = (aoValues[i] + aoValues[i-1] + aoValues[i-2] + aoValues[i-3] + aoValues[i-4]) / 5;
      acValues.push(aoValues[i] - sma5);
    }
  }
  
  return {
    id: 'ac',
    overlay: false,
    lines: [],
    histograms: [{ name: 'ac', data: buildHistogramData(candles, acValues, '#4CAF50', '#EF5350'), color: '#4CAF50' }],
  };
}

export function calculateTSI(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const longLength = (inputs.longLength as number) ?? 25;
  const shortLength = (inputs.shortLength as number) ?? 13;
  const closes = candles.map(c => c.close);
  
  const tsiValues = jesseTsi(closes, longLength, shortLength);
  const values: (number | null)[] = tsiValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'tsi',
    overlay: false,
    lines: [{ name: 'tsi', data: buildLineData(candles, values), color: '#2962FF' }],
    histograms: [],
  };
}

export function calculateVortexIndicator(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const plusVIValues: (number | null)[] = new Array(candles.length).fill(null);
  const minusVIValues: (number | null)[] = new Array(candles.length).fill(null);
  
  const plusVM: number[] = [0];
  const minusVM: number[] = [0];
  const trueRanges: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;
    
    plusVM.push(Math.abs(high - prevLow));
    minusVM.push(Math.abs(low - prevHigh));
    
    trueRanges.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    ));
  }
  
  trueRanges.unshift(candles[0].high - candles[0].low);
  
  // Calculate smoothed values
  for (let i = length; i < candles.length; i++) {
    const sumPlusVM = plusVM.slice(i - length + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumMinusVM = minusVM.slice(i - length + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumTR = trueRanges.slice(i - length + 1, i + 1).reduce((a, b) => a + b, 0);
    
    if (sumTR > 0) {
      plusVIValues[i] = sumPlusVM / sumTR;
      minusVIValues[i] = sumMinusVM / sumTR;
    }
  }
  
  return {
    id: 'vortex',
    overlay: false,
    lines: [
      { name: 'plusVI', data: buildLineData(candles, plusVIValues), color: '#26A69A' },
      { name: 'minusVI', data: buildLineData(candles, minusVIValues), color: '#EF5350' },
    ],
    histograms: [],
  };
}

export function calculateAroon(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const result = jesseAroon(jesseCandles, length);
  
  const upValues: (number | null)[] = result.up.map(v => isNaN(v) ? null : v);
  const downValues: (number | null)[] = result.down.map(v => isNaN(v) ? null : v);
  const oscValues: (number | null)[] = result.oscillator.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'aroon',
    overlay: false,
    lines: [
      { name: 'aroon_up', data: buildLineData(candles, upValues), color: '#26A69A' },
      { name: 'aroon_down', data: buildLineData(candles, downValues), color: '#EF5350' },
    ],
    histograms: [{ name: 'oscillator', data: buildHistogramData(candles, oscValues, '#2962FF', '#EF5350'), color: '#2962FF' }],
  };
}

// ==================== VOLATILITY ====================

export function calculateTrueRange(
  candles: Candle[],
  _inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const trValues = jesseTr(jesseCandles);
  const values: (number | null)[] = trValues.map(v => v);
  
  return {
    id: 'true_range',
    overlay: false,
    lines: [{ name: 'true_range', data: buildLineData(candles, values), color: '#FF6D00' }],
    histograms: [],
  };
}

export function calculateDonchian(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const upperValues: (number | null)[] = [];
  const middleValues: (number | null)[] = [];
  const lowerValues: (number | null)[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < length - 1) {
      upperValues.push(null);
      middleValues.push(null);
      lowerValues.push(null);
    } else {
      const slice = candles.slice(i - length + 1, i + 1);
      const upper = Math.max(...slice.map(c => c.high));
      const lower = Math.min(...slice.map(c => c.low));
      upperValues.push(upper);
      middleValues.push((upper + lower) / 2);
      lowerValues.push(lower);
    }
  }
  
  return {
    id: 'donchian',
    overlay: true,
    lines: [
      { name: 'upper', data: buildLineData(candles, upperValues), color: '#2962FF' },
      { name: 'middle', data: buildLineData(candles, middleValues), color: '#FF6D00' },
      { name: 'lower', data: buildLineData(candles, lowerValues), color: '#2962FF' },
    ],
    histograms: [],
  };
}

export function calculateStdDev(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  const closes = candles.map(c => c.close);
  
  const stdValues = jesseStddev(closes, length);
  const values: (number | null)[] = stdValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'stddev',
    overlay: false,
    lines: [{ name: 'stddev', data: buildLineData(candles, values), color: '#9C27B0' }],
    histograms: [],
  };
}

export function calculateHistVol(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = (inputs.length as number) ?? 20;
  const annualize = (inputs.annualize as boolean) ?? true;
  const closes = candles.map(c => c.close);
  
  const hvValues = jesseHistVol(closes, length, annualize ? 252 : 1);
  const values: (number | null)[] = hvValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'hist_vol',
    overlay: false,
    lines: [{ name: 'hist_vol', data: buildLineData(candles, values), color: '#009688' }],
    histograms: [],
  };
}

export function calculateNATR(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const atrValues = jesseAtr(jesseCandles, length);
  const natrValues: (number | null)[] = atrValues.map((v, i) => 
    isNaN(v) || candles[i].close === 0 ? null : (v / candles[i].close) * 100
  );
  
  return {
    id: 'natr',
    overlay: false,
    lines: [{ name: 'natr', data: buildLineData(candles, natrValues), color: '#FF6D00' }],
    histograms: [],
  };
}

export function calculatePSAR(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const start = (inputs.start as number) ?? 0.02;
  const increment = (inputs.increment as number) ?? 0.02;
  const maximum = (inputs.maximum as number) ?? 0.2;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const sarValues = jesseSar(jesseCandles, start, increment, maximum);
  const values: (number | null)[] = sarValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'psar',
    overlay: true,
    lines: [{ name: 'psar', data: buildLineData(candles, values), color: '#EF5350' }],
    histograms: [],
  };
}

// ==================== VOLUME ====================

export function calculateOBV(
  candles: Candle[],
  _inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const obvValues = jesseObv(jesseCandles);
  const values: (number | null)[] = obvValues.map(v => v);
  
  return {
    id: 'obv',
    overlay: false,
    lines: [{ name: 'obv', data: buildLineData(candles, values), color: '#2962FF' }],
    histograms: [],
  };
}

export function calculateCMF(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const cmfValues = jesseCmf(jesseCandles, length);
  const values: (number | null)[] = cmfValues.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'cmf',
    overlay: false,
    lines: [{ name: 'cmf', data: buildLineData(candles, values), color: '#26A69A' }],
    histograms: [],
  };
}

export function calculateADL(
  candles: Candle[],
  _inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const adlValues = jesseAdl(jesseCandles);
  const values: (number | null)[] = adlValues.map(v => v);
  
  return {
    id: 'adl',
    overlay: false,
    lines: [{ name: 'adl', data: buildLineData(candles, values), color: '#2962FF' }],
    histograms: [],
  };
}

export function calculateVolumeOsc(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const fastLength = (inputs.fastLength as number) ?? 5;
  const slowLength = (inputs.slowLength as number) ?? 10;
  const volumes = candles.map(c => c.volume);
  
  const volOscValues: (number | null)[] = new Array(candles.length).fill(null);
  
  for (let i = slowLength - 1; i < candles.length; i++) {
    const fastSlice = volumes.slice(i - fastLength + 1, i + 1);
    const slowSlice = volumes.slice(i - slowLength + 1, i + 1);
    const fastSMA = fastSlice.reduce((a, b) => a + b, 0) / fastLength;
    const slowSMA = slowSlice.reduce((a, b) => a + b, 0) / slowLength;
    volOscValues[i] = fastSMA - slowSMA;
  }
  
  return {
    id: 'vol_osc',
    overlay: false,
    lines: [],
    histograms: [{ name: 'vol_osc', data: buildHistogramData(candles, volOscValues, '#26A69A', '#EF5350'), color: '#26A69A' }],
  };
}

export function calculateEMV(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = (inputs.length as number) ?? 14;
  const divisor = (inputs.divisor as number) ?? 10000;
  
  const emvValues: (number | null)[] = new Array(candles.length).fill(null);
  
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    
    const distance = ((curr.high + curr.low) / 2) - ((prev.high + prev.low) / 2);
    const boxRatio = (curr.volume / divisor) / (curr.high - curr.low);
    
    emvValues[i] = boxRatio > 0 ? distance / boxRatio : 0;
  }
  
  // Smooth with SMA
  const smoothedEMV: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = length - 1; i < candles.length; i++) {
    const slice = emvValues.slice(i - length + 1, i + 1).filter(v => v !== null) as number[];
    if (slice.length === length) {
      smoothedEMV[i] = slice.reduce((a, b) => a + b, 0) / length;
    }
  }
  
  return {
    id: 'emv',
    overlay: false,
    lines: [{ name: 'emv', data: buildLineData(candles, smoothedEMV), color: '#009688' }],
    histograms: [],
  };
}

// ==================== TREND ====================

export function calculateDMI(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const jesseCandles: JesseCandle[] = candles.map(c => ({
    time: c.time as number,
    timestamp: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }));
  
  const result = jesseAdx(jesseCandles, length);
  
  const adxValues: (number | null)[] = result.adx.map(v => isNaN(v) ? null : v);
  const pdiValues: (number | null)[] = result.pdi.map(v => isNaN(v) ? null : v);
  const mdiValues: (number | null)[] = result.mdi.map(v => isNaN(v) ? null : v);
  
  return {
    id: 'dmi',
    overlay: false,
    lines: [
      { name: 'plusDI', data: buildLineData(candles, pdiValues), color: '#26A69A' },
      { name: 'minusDI', data: buildLineData(candles, mdiValues), color: '#EF5350' },
      { name: 'adx', data: buildLineData(candles, adxValues), color: '#2962FF' },
    ],
    histograms: [],
  };
}

// ==================== FIBONACCI ====================

export function calculateFibRetracement(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const lookback = inputs.lookback as number;
  
  const level0: (number | null)[] = [];
  const level236: (number | null)[] = [];
  const level382: (number | null)[] = [];
  const level500: (number | null)[] = [];
  const level618: (number | null)[] = [];
  const level786: (number | null)[] = [];
  const level1000: (number | null)[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < lookback - 1) {
      level0.push(null);
      level236.push(null);
      level382.push(null);
      level500.push(null);
      level618.push(null);
      level786.push(null);
      level1000.push(null);
    } else {
      const slice = candles.slice(i - lookback + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const diff = high - low;
      
      level0.push(high);
      level236.push(high - 0.236 * diff);
      level382.push(high - 0.382 * diff);
      level500.push(high - 0.5 * diff);
      level618.push(high - 0.618 * diff);
      level786.push(high - 0.786 * diff);
      level1000.push(low);
    }
  }
  
  return {
    id: 'fib_retracement',
    overlay: true,
    lines: [
      { name: 'level0', data: buildLineData(candles, level0), color: '#EF5350' },
      { name: 'level236', data: buildLineData(candles, level236), color: '#FF9800' },
      { name: 'level382', data: buildLineData(candles, level382), color: '#FFEB3B' },
      { name: 'level500', data: buildLineData(candles, level500), color: '#4CAF50' },
      { name: 'level618', data: buildLineData(candles, level618), color: '#2962FF' },
      { name: 'level786', data: buildLineData(candles, level786), color: '#9C27B0' },
      { name: 'level1000', data: buildLineData(candles, level1000), color: '#EF5350' },
    ],
    histograms: [],
  };
}

export function calculateFibExtensions(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const lookback = inputs.lookback as number;
  
  const highValues: (number | null)[] = [];
  const level618: (number | null)[] = [];
  const level1000: (number | null)[] = [];
  const level1618: (number | null)[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < lookback - 1) {
      highValues.push(null);
      level618.push(null);
      level1000.push(null);
      level1618.push(null);
    } else {
      const slice = candles.slice(i - lookback + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const diff = high - low;
      
      highValues.push(high);
      level618.push(high + 0.618 * diff);
      level1000.push(high + 1.0 * diff);
      level1618.push(high + 1.618 * diff);
    }
  }
  
  return {
    id: 'fib_extensions',
    overlay: true,
    lines: [
      { name: 'high', data: buildLineData(candles, highValues), color: '#EF5350' },
      { name: 'level618', data: buildLineData(candles, level618), color: '#4CAF50' },
      { name: 'level1000', data: buildLineData(candles, level1000), color: '#2962FF' },
      { name: 'level1618', data: buildLineData(candles, level1618), color: '#9C27B0' },
    ],
    histograms: [],
  };
}

export function calculateFibLevels(
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
): IndicatorResult {
  const length = inputs.length as number;
  
  const level0: (number | null)[] = [];
  const level382: (number | null)[] = [];
  const level618: (number | null)[] = [];
  const level1000: (number | null)[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < length - 1) {
      level0.push(null);
      level382.push(null);
      level618.push(null);
      level1000.push(null);
    } else {
      const slice = candles.slice(i - length + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const diff = high - low;
      
      level0.push(high);
      level382.push(high - 0.382 * diff);
      level618.push(high - 0.618 * diff);
      level1000.push(low);
    }
  }
  
  return {
    id: 'fib_levels',
    overlay: true,
    lines: [
      { name: 'level0', data: buildLineData(candles, level0), color: '#EF5350' },
      { name: 'level382', data: buildLineData(candles, level382), color: '#FF9800' },
      { name: 'level618', data: buildLineData(candles, level618), color: '#2962FF' },
      { name: 'level1000', data: buildLineData(candles, level1000), color: '#4CAF50' },
    ],
    histograms: [],
  };
}

// ==================== EXTENDED CALCULATOR REGISTRY ====================

export const extendedCalculators: Record<string, (candles: Candle[], inputs: Record<string, number | string | boolean>) => IndicatorResult> = {
  // Moving Averages
  wma: calculateWMA,
  hma: calculateHMA,
  vwma: calculateVWMA,
  smma: calculateSMMA,
  lsma: calculateLSMA,
  dema: calculateDEMA,
  tema: calculateTEMA,
  kama: calculateKAMA,
  vidya: calculateVIDYA,
  mcginley: calculateMcGinley,
  rolling_vwap: calculateRollingVWAP,
  
  // Momentum
  stochrsi: calculateStochRSI,
  ppo: calculatePPO,
  williams_r: calculateWilliamsR,
  cci: calculateCCI,
  mfi: calculateMFI,
  roc: calculateROC,
  momentum: calculateMomentum,
  cmo: calculateCMO,
  ultimate_osc: calculateUltimateOsc,
  ao: calculateAO,
  ac: calculateAC,
  tsi: calculateTSI,
  vortex: calculateVortexIndicator,
  aroon: calculateAroon,
  
  // Volatility
  true_range: calculateTrueRange,
  donchian: calculateDonchian,
  stddev: calculateStdDev,
  hist_vol: calculateHistVol,
  natr: calculateNATR,
  psar: calculatePSAR,
  
  // Volume
  obv: calculateOBV,
  cmf: calculateCMF,
  adl: calculateADL,
  vol_osc: calculateVolumeOsc,
  emv: calculateEMV,
  
  // Trend
  dmi: calculateDMI,
  
  // Fibonacci
  fib_retracement: calculateFibRetracement,
  fib_extensions: calculateFibExtensions,
  fib_levels: calculateFibLevels,
};
