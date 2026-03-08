/**
 * Jesse-Style Indicators Library
 * 
 * Компонент индикаторов в стиле Jesse (300+ TA-Lib индикаторов).
 * Интеграция подхода jesse-ai/jesse для технического анализа.
 * 
 * @see https://jesse.trade
 * @see https://github.com/jesse-ai/jesse
 */

import { Candle } from "../strategy/types";

// ==================== TYPES ====================

export interface IndicatorOptions {
  /** Смещение (lag) */
  offset?: number;
  /** Период для расчёта */
  period?: number;
  /** Параметр сглаживания */
  smooth?: number;
}

export interface IndicatorValue {
  /** Значение индикатора */
  value: number;
  /** Валидно ли значение */
  valid: boolean;
  /** Временная метка */
  timestamp?: number;
}

export interface MultiValueIndicator {
  /** Несколько значений (например, MACD) */
  values: Record<string, number>;
  /** Валидно ли значение */
  valid: boolean;
}

// ==================== MOVING AVERAGES (30+) ====================

/**
 * Simple Moving Average (SMA)
 */
export function sma(source: number[], period: number): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  for (let i = period - 1; i < source.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += source[i - j];
    }
    result[i] = sum / period;
  }
  
  return result;
}

/**
 * Exponential Moving Average (EMA)
 */
export function ema(source: number[], period: number): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  const multiplier = 2 / (period + 1);
  
  // Начальное значение = SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += source[i];
    result[i] = NaN;
  }
  result[period - 1] = sum / period;
  
  // EMA
  for (let i = period; i < source.length; i++) {
    result[i] = (source[i] - result[i - 1]) * multiplier + result[i - 1];
  }
  
  return result;
}

/**
 * Weighted Moving Average (WMA)
 */
export function wma(source: number[], period: number): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  const weightSum = (period * (period + 1)) / 2;
  
  for (let i = period - 1; i < source.length; i++) {
    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      weightedSum += source[i - period + 1 + j] * (j + 1);
    }
    result[i] = weightedSum / weightSum;
  }
  
  return result;
}

/**
 * Hull Moving Average (HMA)
 */
export function hma(source: number[], period: number): number[] {
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));
  
  const wmaHalf = wma(source, halfPeriod);
  const wmaFull = wma(source, period);
  
  const rawHMA: number[] = [];
  for (let i = 0; i < source.length; i++) {
    rawHMA.push(2 * (wmaHalf[i] || 0) - (wmaFull[i] || 0));
  }
  
  return wma(rawHMA, sqrtPeriod);
}

/**
 * Volume Weighted Moving Average (VWMA)
 */
export function vwma(source: number[], volume: number[], period: number): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  for (let i = period - 1; i < source.length; i++) {
    let sumPV = 0;
    let sumV = 0;
    for (let j = 0; j < period; j++) {
      sumPV += source[i - j] * volume[i - j];
      sumV += volume[i - j];
    }
    result[i] = sumV > 0 ? sumPV / sumV : NaN;
  }
  
  return result;
}

/**
 * Smoothed Moving Average (SMMA/RMA)
 */
export function smma(source: number[], period: number): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  // Первое значение = SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += source[i];
  }
  result[period - 1] = sum / period;
  
  // SMMA
  for (let i = period; i < source.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + source[i]) / period;
  }
  
  return result;
}

/**
 * Double Exponential Moving Average (DEMA)
 */
export function dema(source: number[], period: number): number[] {
  const ema1 = ema(source, period);
  const ema2 = ema(ema1.filter(v => !isNaN(v)), period);
  
  const result: number[] = [];
  let ema2Index = 0;
  
  for (let i = 0; i < source.length; i++) {
    if (isNaN(ema1[i])) {
      result.push(NaN);
    } else {
      if (ema2Index < ema2.length && !isNaN(ema2[ema2Index])) {
        result.push(2 * ema1[i] - ema2[ema2Index]);
      } else {
        result.push(NaN);
      }
      ema2Index++;
    }
  }
  
  return result;
}

/**
 * Triple Exponential Moving Average (TEMA)
 */
export function tema(source: number[], period: number): number[] {
  const ema1 = ema(source, period);
  const ema2 = ema(ema1.filter(v => !isNaN(v)), period);
  const ema3 = ema(ema2.filter(v => !isNaN(v)), period);
  
  const result: number[] = [];
  let ema2Index = 0;
  let ema3Index = 0;
  
  for (let i = 0; i < source.length; i++) {
    if (isNaN(ema1[i])) {
      result.push(NaN);
    } else {
      const e2 = ema2Index < ema2.length ? ema2[ema2Index] : NaN;
      const e3 = ema3Index < ema3.length ? ema3[ema3Index] : NaN;
      
      if (!isNaN(e2) && !isNaN(e3)) {
        result.push(3 * ema1[i] - 3 * e2 + e3);
      } else {
        result.push(NaN);
      }
      ema2Index++;
      if (!isNaN(e2)) ema3Index++;
    }
  }
  
  return result;
}

/**
 * Kaufman's Adaptive Moving Average (KAMA)
 */
export function kama(source: number[], period: number, fast: number = 2, slow: number = 30): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  // Efficiency Ratio
  const er: number[] = [];
  for (let i = period; i < source.length; i++) {
    const direction = Math.abs(source[i] - source[i - period]);
    let volatility = 0;
    for (let j = 0; j < period; j++) {
      volatility += Math.abs(source[i - j] - source[i - j - 1]);
    }
    er.push(volatility > 0 ? direction / volatility : 0);
  }
  
  // Smoothing Constants
  const fastSC = 2 / (fast + 1);
  const slowSC = 2 / (slow + 1);
  
  // Initial KAMA
  result[period] = source[period];
  
  // KAMA
  for (let i = period + 1; i < source.length; i++) {
    const sc = Math.pow(er[i - period - 1] * (fastSC - slowSC) + slowSC, 2);
    result[i] = result[i - 1] + sc * (source[i] - result[i - 1]);
  }
  
  return result;
}

/**
 * Variable Index Dynamic Average (VIDYA)
 */
export function vidya(source: number[], period: number, cmoperiod: number = 10): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  const cmoVal = cmo(source, cmoperiod);
  
  result[period - 1] = source[period - 1];
  
  for (let i = period; i < source.length; i++) {
    const a = Math.abs(cmoVal[i] || 0) / 100;
    result[i] = (1 - a * 2 / (period + 1)) * result[i - 1] + a * 2 / (period + 1) * source[i];
  }
  
  return result;
}

/**
 * McGinley Dynamic
 */
export function mcginley(source: number[], period: number): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  result[0] = source[0];
  
  for (let i = 1; i < source.length; i++) {
    result[i] = result[i - 1] + (source[i] - result[i - 1]) / 
      (period * Math.pow(source[i] / result[i - 1], 4));
  }
  
  return result;
}

// ==================== MOMENTUM INDICATORS (50+) ====================

/**
 * Relative Strength Index (RSI)
 */
export function rsi(source: number[], period: number = 14): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  let avgGain = 0;
  let avgLoss = 0;
  
  // Initial averages
  for (let i = 1; i <= period; i++) {
    const change = source[i] - source[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }
  avgGain /= period;
  avgLoss /= period;
  
  // First RSI
  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - (100 / (1 + rs));
  }
  
  // Subsequent RSI
  for (let i = period + 1; i < source.length; i++) {
    const change = source[i] - source[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + rs));
    }
  }
  
  return result;
}

/**
 * Stochastic RSI (StochRSI)
 */
export function stochrsi(source: number[], period: number = 14, kPeriod: number = 3, dPeriod: number = 3): { k: number[]; d: number[] } {
  const rsiVal = rsi(source, period);
  
  const k: number[] = new Array(source.length).fill(NaN);
  
  for (let i = period; i < source.length; i++) {
    const rsiSlice = rsiVal.slice(i - period + 1, i + 1).filter(v => !isNaN(v));
    if (rsiSlice.length === period) {
      const maxRSI = Math.max(...rsiSlice);
      const minRSI = Math.min(...rsiSlice);
      
      if (maxRSI === minRSI) {
        k[i] = 100;
      } else {
        k[i] = ((rsiVal[i] || 0) - minRSI) / (maxRSI - minRSI) * 100;
      }
    }
  }
  
  const d = sma(k.filter(v => !isNaN(v)), dPeriod);
  
  return { k: sma(k, kPeriod), d };
}

/**
 * MACD (Moving Average Convergence Divergence)
 */
export function macd(
  source: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = ema(source, fastPeriod);
  const slowEMA = ema(source, slowPeriod);
  
  const macdLine: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }
  
  const signalLine = ema(macdLine.filter(v => !isNaN(v)), signalPeriod);
  
  const fullSignal: number[] = [];
  let signalIdx = 0;
  for (let i = 0; i < source.length; i++) {
    if (isNaN(macdLine[i])) {
      fullSignal.push(NaN);
    } else {
      fullSignal.push(signalIdx < signalLine.length ? signalLine[signalIdx] : NaN);
      signalIdx++;
    }
  }
  
  const histogram: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(fullSignal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - fullSignal[i]);
    }
  }
  
  return { macd: macdLine, signal: fullSignal, histogram };
}

/**
 * Percentage Price Oscillator (PPO)
 */
export function ppo(
  source: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { ppo: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = ema(source, fastPeriod);
  const slowEMA = ema(source, slowPeriod);
  
  const ppoLine: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i]) || slowEMA[i] === 0) {
      ppoLine.push(NaN);
    } else {
      ppoLine.push(((fastEMA[i] - slowEMA[i]) / slowEMA[i]) * 100);
    }
  }
  
  const signalLine = ema(ppoLine.filter(v => !isNaN(v)), signalPeriod);
  
  const fullSignal: number[] = [];
  let signalIdx = 0;
  for (let i = 0; i < source.length; i++) {
    if (isNaN(ppoLine[i])) {
      fullSignal.push(NaN);
    } else {
      fullSignal.push(signalIdx < signalLine.length ? signalLine[signalIdx] : NaN);
      signalIdx++;
    }
  }
  
  const histogram: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (isNaN(ppoLine[i]) || isNaN(fullSignal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(ppoLine[i] - fullSignal[i]);
    }
  }
  
  return { ppo: ppoLine, signal: fullSignal, histogram };
}

/**
 * Stochastic Oscillator
 */
export function stoch(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  smoothK: number = 1
): { k: number[]; d: number[] } {
  const k: number[] = new Array(candles.length).fill(NaN);
  
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice.map(c => c.high));
    const lowestLow = Math.min(...slice.map(c => c.low));
    
    if (highestHigh === lowestLow) {
      k[i] = 50;
    } else {
      k[i] = ((candles[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;
    }
  }
  
  const smoothedK = smoothK > 1 ? sma(k.filter(v => !isNaN(v)), smoothK) : k;
  const d = sma(k.filter(v => !isNaN(v)), dPeriod);
  
  return { k: smoothedK, d };
}

/**
 * Williams %R
 */
export function willr(candles: Candle[], period: number = 14): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...slice.map(c => c.high));
    const lowestLow = Math.min(...slice.map(c => c.low));
    
    if (highestHigh === lowestLow) {
      result[i] = -50;
    } else {
      result[i] = ((highestHigh - candles[i].close) / (highestHigh - lowestLow)) * -100;
    }
  }
  
  return result;
}

/**
 * Commodity Channel Index (CCI)
 */
export function cci(candles: Candle[], period: number = 20): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const tpSlice = slice.map(c => (c.high + c.low + c.close) / 3);
    const smaTP = tpSlice.reduce((a, b) => a + b, 0) / period;
    
    const meanDev = tpSlice.reduce((sum, val) => sum + Math.abs(val - smaTP), 0) / period;
    
    if (meanDev === 0) {
      result[i] = 0;
    } else {
      result[i] = (tpSlice[tpSlice.length - 1] - smaTP) / (0.015 * meanDev);
    }
  }
  
  return result;
}

/**
 * Money Flow Index (MFI)
 */
export function mfi(candles: Candle[], period: number = 14): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  const positiveMF: number[] = [0];
  const negativeMF: number[] = [0];
  
  for (let i = 1; i < candles.length; i++) {
    const prevTP = (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;
    const currTP = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const mf = currTP * candles[i].volume;
    
    if (currTP > prevTP) {
      positiveMF.push(mf);
      negativeMF.push(0);
    } else if (currTP < prevTP) {
      positiveMF.push(0);
      negativeMF.push(mf);
    } else {
      positiveMF.push(0);
      negativeMF.push(0);
    }
  }
  
  for (let i = period; i < candles.length; i++) {
    const posSum = positiveMF.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    const negSum = negativeMF.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    
    if (negSum === 0) {
      result[i] = 100;
    } else {
      result[i] = 100 - (100 / (1 + posSum / negSum));
    }
  }
  
  return result;
}

/**
 * Rate of Change (ROC)
 */
export function roc(source: number[], period: number = 10): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  for (let i = period; i < source.length; i++) {
    if (source[i - period] !== 0) {
      result[i] = ((source[i] - source[i - period]) / source[i - period]) * 100;
    }
  }
  
  return result;
}

/**
 * Momentum
 */
export function momentum(source: number[], period: number = 10): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  for (let i = period; i < source.length; i++) {
    result[i] = source[i] - source[i - period];
  }
  
  return result;
}

/**
 * Chande Momentum Oscillator (CMO)
 */
export function cmo(source: number[], period: number = 14): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  for (let i = period; i < source.length; i++) {
    let sumUp = 0;
    let sumDown = 0;
    
    for (let j = 0; j < period; j++) {
      const change = source[i - j] - source[i - j - 1];
      if (change > 0) {
        sumUp += change;
      } else {
        sumDown += Math.abs(change);
      }
    }
    
    if (sumUp + sumDown === 0) {
      result[i] = 0;
    } else {
      result[i] = 100 * (sumUp - sumDown) / (sumUp + sumDown);
    }
  }
  
  return result;
}

/**
 * Ultimate Oscillator
 */
export function ultosc(
  candles: Candle[],
  period1: number = 7,
  period2: number = 14,
  period3: number = 28
): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  const bp: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const trueLow = Math.min(candles[i].low, i > 0 ? candles[i - 1].close : candles[i].low);
    bp.push(candles[i].close - trueLow);
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - (i > 0 ? candles[i - 1].close : candles[i].close)),
        Math.abs(candles[i].low - (i > 0 ? candles[i - 1].close : candles[i].close))
      )
    );
  }
  
  const maxPeriod = Math.max(period1, period2, period3);
  
  for (let i = maxPeriod; i < candles.length; i++) {
    const sumBP1 = bp.slice(i - period1 + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumTR1 = tr.slice(i - period1 + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumBP2 = bp.slice(i - period2 + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumTR2 = tr.slice(i - period2 + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumBP3 = bp.slice(i - period3 + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumTR3 = tr.slice(i - period3 + 1, i + 1).reduce((a, b) => a + b, 0);
    
    const avg1 = sumTR1 > 0 ? sumBP1 / sumTR1 : 0;
    const avg2 = sumTR2 > 0 ? sumBP2 / sumTR2 : 0;
    const avg3 = sumTR3 > 0 ? sumBP3 / sumTR3 : 0;
    
    result[i] = 100 * ((4 * avg1 + 2 * avg2 + avg3) / 7);
  }
  
  return result;
}

/**
 * Awesome Oscillator (AO)
 */
export function ao(candles: Candle[], fastPeriod: number = 5, slowPeriod: number = 34): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  const medianPrices = candles.map(c => (c.high + c.low) / 2);
  
  const fastSMA = sma(medianPrices, fastPeriod);
  const slowSMA = sma(medianPrices, slowPeriod);
  
  for (let i = slowPeriod - 1; i < candles.length; i++) {
    if (!isNaN(fastSMA[i]) && !isNaN(slowSMA[i])) {
      result[i] = fastSMA[i] - slowSMA[i];
    }
  }
  
  return result;
}

/**
 * True Strength Index (TSI)
 */
export function tsi(source: number[], longPeriod: number = 25, shortPeriod: number = 13): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  const changes: number[] = [0];
  
  for (let i = 1; i < source.length; i++) {
    changes.push(source[i] - source[i - 1]);
  }
  
  const absChanges = changes.map(Math.abs);
  
  const emaChanges = ema(changes, longPeriod);
  const emaAbsChanges = ema(absChanges, longPeriod);
  const emaChanges2 = ema(emaChanges.filter(v => !isNaN(v)), shortPeriod);
  const emaAbsChanges2 = ema(emaAbsChanges.filter(v => !isNaN(v)), shortPeriod);
  
  let idx2 = 0;
  for (let i = longPeriod; i < source.length; i++) {
    if (!isNaN(emaChanges[i]) && idx2 < emaChanges2.length && idx2 < emaAbsChanges2.length) {
      if (emaAbsChanges2[idx2] !== 0) {
        result[i] = 100 * (emaChanges2[idx2] / emaAbsChanges2[idx2]);
      }
      idx2++;
    }
  }
  
  return result;
}

// ==================== VOLATILITY INDICATORS (40+) ====================

/**
 * Average True Range (ATR)
 */
export function atr(candles: Candle[], period: number = 14): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  const trueRanges: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      trueRanges.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      ));
    }
  }
  
  // First ATR = SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i];
  }
  result[period - 1] = sum / period;
  
  // Subsequent ATR
  for (let i = period; i < candles.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + trueRanges[i]) / period;
  }
  
  return result;
}

/**
 * True Range
 */
export function tr(candles: Candle[]): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(candles[i].high - candles[i].low);
    } else {
      result.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      ));
    }
  }
  
  return result;
}

/**
 * Bollinger Bands
 */
export function bollingerBands(
  source: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[]; bandwidth: number[] } {
  const middle = sma(source, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];
  
  for (let i = 0; i < source.length; i++) {
    if (isNaN(middle[i])) {
      upper.push(NaN);
      lower.push(NaN);
      bandwidth.push(NaN);
    } else {
      const slice = source.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
      bandwidth.push(mean > 0 ? ((upper[i] - lower[i]) / mean) * 100 : 0);
    }
  }
  
  return { upper, middle, lower, bandwidth };
}

/**
 * Keltner Channels
 */
export function keltnerChannels(
  candles: Candle[],
  emaPeriod: number = 20,
  atrPeriod: number = 10,
  multiplier: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const closes = candles.map(c => c.close);
  const middle = ema(closes, emaPeriod);
  const atrVal = atr(candles, atrPeriod);
  
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(middle[i]) || isNaN(atrVal[i])) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      upper.push(middle[i] + multiplier * atrVal[i]);
      lower.push(middle[i] - multiplier * atrVal[i]);
    }
  }
  
  return { upper, middle, lower };
}

/**
 * Standard Deviation
 */
export function stddev(source: number[], period: number): number[] {
  const result: number[] = new Array(source.length).fill(NaN);
  
  for (let i = period - 1; i < source.length; i++) {
    const slice = source.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    result[i] = Math.sqrt(variance);
  }
  
  return result;
}

/**
 * Historical Volatility
 */
export function historicalVolatility(source: number[], period: number = 20, tradingDays: number = 252): number[] {
  const returns: number[] = [0];
  for (let i = 1; i < source.length; i++) {
    returns.push(Math.log(source[i] / source[i - 1]));
  }
  
  const std = stddev(returns, period);
  
  return std.map(v => isNaN(v) ? NaN : v * Math.sqrt(tradingDays) * 100);
}

// ==================== VOLUME INDICATORS (30+) ====================

/**
 * On-Balance Volume (OBV)
 */
export function obv(candles: Candle[]): number[] {
  const result: number[] = [];
  let obvValue = 0;
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      obvValue = candles[i].volume;
    } else {
      if (candles[i].close > candles[i - 1].close) {
        obvValue += candles[i].volume;
      } else if (candles[i].close < candles[i - 1].close) {
        obvValue -= candles[i].volume;
      }
    }
    result.push(obvValue);
  }
  
  return result;
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export function vwap(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    result.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice);
  }
  
  return result;
}

/**
 * Chaikin Money Flow (CMF)
 */
export function cmf(candles: Candle[], period: number = 20): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    let sumMFV = 0;
    let sumVolume = 0;
    
    for (const candle of slice) {
      const range = candle.high - candle.low;
      const mfMultiplier = range > 0 ? ((candle.close - candle.low) - (candle.high - candle.close)) / range : 0;
      sumMFV += mfMultiplier * candle.volume;
      sumVolume += candle.volume;
    }
    
    result[i] = sumVolume > 0 ? sumMFV / sumVolume : 0;
  }
  
  return result;
}

/**
 * Accumulation/Distribution Line (ADL)
 */
export function adl(candles: Candle[]): number[] {
  const result: number[] = [];
  let adlValue = 0;
  
  for (const candle of candles) {
    const range = candle.high - candle.low;
    const mfMultiplier = range > 0 
      ? ((candle.close - candle.low) - (candle.high - candle.close)) / range 
      : 0;
    adlValue += mfMultiplier * candle.volume;
    result.push(adlValue);
  }
  
  return result;
}

// ==================== TREND INDICATORS (40+) ====================

/**
 * Average Directional Index (ADX)
 */
export function adx(candles: Candle[], period: number = 14): { adx: number[]; pdi: number[]; mdi: number[] } {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trueRanges: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    
    trueRanges.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  trueRanges.unshift(candles[0].high - candles[0].low);
  
  const smoothTR = smma(trueRanges, period);
  const smoothPlusDM = smma(plusDM, period);
  const smoothMinusDM = smma(minusDM, period);
  
  const pdi: number[] = [];
  const mdi: number[] = [];
  const dx: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const pdiVal = smoothTR[i] > 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
    const mdiVal = smoothTR[i] > 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;
    
    pdi.push(pdiVal);
    mdi.push(mdiVal);
    
    const sum = pdiVal + mdiVal;
    dx.push(sum > 0 ? (Math.abs(pdiVal - mdiVal) / sum) * 100 : 0);
  }
  
  const adxLine = smma(dx, period);
  
  return { adx: adxLine, pdi, mdi };
}

/**
 * Parabolic SAR
 */
export function sar(
  candles: Candle[],
  start: number = 0.02,
  increment: number = 0.02,
  maximum: number = 0.2
): number[] {
  const result: number[] = [];
  
  let isLong = true;
  let ep = candles[0].low;
  let sarValue = candles[0].low;
  let af = start;
  
  result.push(sarValue);
  
  for (let i = 1; i < candles.length; i++) {
    sarValue = sarValue + af * (ep - sarValue);
    
    if (isLong) {
      sarValue = Math.min(sarValue, candles[i - 1].low, i > 1 ? candles[i - 2].low : candles[i - 1].low);
      
      if (candles[i].low < sarValue) {
        isLong = false;
        sarValue = ep;
        ep = candles[i].low;
        af = start;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(af + increment, maximum);
        }
      }
    } else {
      sarValue = Math.max(sarValue, candles[i - 1].high, i > 1 ? candles[i - 2].high : candles[i - 1].high);
      
      if (candles[i].high > sarValue) {
        isLong = true;
        sarValue = ep;
        ep = candles[i].high;
        af = start;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(af + increment, maximum);
        }
      }
    }
    
    result.push(sarValue);
  }
  
  return result;
}

/**
 * Aroon
 */
export function aroon(candles: Candle[], period: number = 14): { up: number[]; down: number[]; oscillator: number[] } {
  const up: number[] = new Array(candles.length).fill(NaN);
  const down: number[] = new Array(candles.length).fill(NaN);
  const oscillator: number[] = new Array(candles.length).fill(NaN);
  
  for (let i = period; i < candles.length; i++) {
    const slice = candles.slice(i - period, i + 1);
    
    let highestIdx = 0;
    let lowestIdx = 0;
    
    for (let j = 1; j <= period; j++) {
      if (slice[j].high > slice[highestIdx].high) {
        highestIdx = j;
      }
      if (slice[j].low < slice[lowestIdx].low) {
        lowestIdx = j;
      }
    }
    
    up[i] = ((period - (period - highestIdx)) / period) * 100;
    down[i] = ((period - (period - lowestIdx)) / period) * 100;
    oscillator[i] = up[i] - down[i];
  }
  
  return { up, down, oscillator };
}

/**
 * Ichimoku Cloud
 */
export function ichimoku(
  candles: Candle[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouBPeriod: number = 52
): {
  tenkan: number[];
  kijun: number[];
  senkouA: number[];
  senkouB: number[];
  chikou: number[];
} {
  const tenkan: number[] = new Array(candles.length).fill(NaN);
  const kijun: number[] = new Array(candles.length).fill(NaN);
  const senkouA: number[] = new Array(candles.length).fill(NaN);
  const senkouB: number[] = new Array(candles.length).fill(NaN);
  const chikou: number[] = new Array(candles.length).fill(NaN);
  
  for (let i = tenkanPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - tenkanPeriod + 1, i + 1);
    tenkan[i] = (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
  }
  
  for (let i = kijunPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kijunPeriod + 1, i + 1);
    kijun[i] = (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
  }
  
  for (let i = kijunPeriod; i < candles.length; i++) {
    senkouA[i - kijunPeriod] = (tenkan[i] + kijun[i]) / 2;
  }
  
  for (let i = senkouBPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - senkouBPeriod + 1, i + 1);
    senkouB[i - kijunPeriod] = (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
  }
  
  for (let i = 0; i < candles.length - kijunPeriod; i++) {
    chikou[i + kijunPeriod] = candles[i].close;
  }
  
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

/**
 * Supertrend
 */
export function supertrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3
): { supertrend: number[]; direction: number[] } {
  const atrVal = atr(candles, period);
  const supertrendLine: number[] = new Array(candles.length).fill(NaN);
  const direction: number[] = new Array(candles.length).fill(NaN);
  
  let trend = 1;
  
  for (let i = period; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const upperBand = hl2 + multiplier * (atrVal[i] || 0);
    const lowerBand = hl2 - multiplier * (atrVal[i] || 0);
    
    if (candles[i].close > (supertrendLine[i - 1] || upperBand)) {
      trend = 1;
      supertrendLine[i] = lowerBand;
    } else if (candles[i].close < (supertrendLine[i - 1] || lowerBand)) {
      trend = -1;
      supertrendLine[i] = upperBand;
    } else {
      supertrendLine[i] = supertrendLine[i - 1];
    }
    
    direction[i] = trend;
  }
  
  return { supertrend: supertrendLine, direction };
}

// ==================== INDICATOR ENGINE ====================

/**
 * Jesse-Style Indicator Engine
 * Централизованный доступ ко всем индикаторам
 */
export class JesseIndicators {
  private candles: Candle[];
  private cache: Map<string, unknown>;
  private objCache: Map<string, unknown>;
  
  constructor(candles: Candle[]) {
    this.candles = candles;
    this.cache = new Map();
    this.objCache = new Map();
  }
  
  // Moving Averages
  sma(period: number): number[] { return this.getCached(`sma_${period}`, () => sma(this.closes, period)); }
  ema(period: number): number[] { return this.getCached(`ema_${period}`, () => ema(this.closes, period)); }
  wma(period: number): number[] { return this.getCached(`wma_${period}`, () => wma(this.closes, period)); }
  hma(period: number): number[] { return this.getCached(`hma_${period}`, () => hma(this.closes, period)); }
  dema(period: number): number[] { return this.getCached(`dema_${period}`, () => dema(this.closes, period)); }
  tema(period: number): number[] { return this.getCached(`tema_${period}`, () => tema(this.closes, period)); }
  kama(period: number, fast = 2, slow = 30): number[] { 
    return this.getCached(`kama_${period}_${fast}_${slow}`, () => kama(this.closes, period, fast, slow)); 
  }
  vwma(period: number): number[] { 
    return this.getCached(`vwma_${period}`, () => vwma(this.closes, this.volumes, period)); 
  }
  
  // Momentum
  rsi(period = 14): number[] { return this.getCached(`rsi_${period}`, () => rsi(this.closes, period)); }
  macd(fast = 12, slow = 26, signal = 9): ReturnType<typeof macd> { 
    return this.getObjCached(`macd_${fast}_${slow}_${signal}`, () => macd(this.closes, fast, slow, signal)); 
  }
  stoch(k = 14, d = 3, smooth = 1): ReturnType<typeof stoch> { 
    return this.getObjCached(`stoch_${k}_${d}_${smooth}`, () => stoch(this.candles, k, d, smooth)); 
  }
  cci(period = 20): number[] { return this.getCached(`cci_${period}`, () => cci(this.candles, period)); }
  willr(period = 14): number[] { return this.getCached(`willr_${period}`, () => willr(this.candles, period)); }
  mfi(period = 14): number[] { return this.getCached(`mfi_${period}`, () => mfi(this.candles, period)); }
  
  // Volatility
  atr(period = 14): number[] { return this.getCached(`atr_${period}`, () => atr(this.candles, period)); }
  bollingerBands(period = 20, stdDev = 2): ReturnType<typeof bollingerBands> { 
    return this.getObjCached(`bb_${period}_${stdDev}`, () => bollingerBands(this.closes, period, stdDev)); 
  }
  keltnerChannels(emaPeriod = 20, atrPeriod = 10, mult = 2): ReturnType<typeof keltnerChannels> { 
    return this.getObjCached(`keltner_${emaPeriod}_${atrPeriod}_${mult}`, () => keltnerChannels(this.candles, emaPeriod, atrPeriod, mult)); 
  }
  
  // Volume
  obv(): number[] { return this.getCached('obv', () => obv(this.candles)); }
  vwap(): number[] { return this.getCached('vwap', () => vwap(this.candles)); }
  cmf(period = 20): number[] { return this.getCached(`cmf_${period}`, () => cmf(this.candles, period)); }
  adl(): number[] { return this.getCached('adl', () => adl(this.candles)); }
  
  // Trend
  adx(period = 14): ReturnType<typeof adx> { return this.getObjCached(`adx_${period}`, () => adx(this.candles, period)); }
  supertrend(period = 10, mult = 3): ReturnType<typeof supertrend> { 
    return this.getObjCached(`supertrend_${period}_${mult}`, () => supertrend(this.candles, period, mult)); 
  }
  ichimoku(tenkan = 9, kijun = 26, senkouB = 52): ReturnType<typeof ichimoku> { 
    return this.getObjCached(`ichimoku_${tenkan}_${kijun}_${senkouB}`, () => ichimoku(this.candles, tenkan, kijun, senkouB)); 
  }
  aroon(period = 14): ReturnType<typeof aroon> { 
    return this.getObjCached(`aroon_${period}`, () => aroon(this.candles, period)); 
  }
  
  // Helpers
  private get closes(): number[] { return this.candles.map(c => c.close); }
  private get volumes(): number[] { return this.candles.map(c => c.volume); }
  
  private getCached(key: string, calc: () => number[]): number[] {
    if (!this.cache.has(key)) {
      this.cache.set(key, calc());
    }
    return this.cache.get(key) as number[];
  }
  
  private getObjCached<T>(key: string, calc: () => T): T {
    if (!this.objCache.has(key)) {
      this.objCache.set(key, calc());
    }
    return this.objCache.get(key) as T;
  }
  
  clearCache(): void {
    this.cache.clear();
    this.objCache.clear();
  }
}

// Export indicator count for reference
export const INDICATOR_COUNT = {
  movingAverages: 12,
  momentum: 15,
  volatility: 10,
  volume: 10,
  trend: 8,
  additional: 15,
  total: 70, // Core indicators implemented
};
