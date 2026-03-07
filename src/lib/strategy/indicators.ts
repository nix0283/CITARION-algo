/**
 * Technical Indicators
 * 
 * Расчёт технических индикаторов для стратегий.
 * Все функции принимают массив цен и возвращают массив значений индикатора.
 */

import { Candle, IndicatorResult } from "./types";

// ==================== MOVING AVERAGES ====================

/**
 * Simple Moving Average (SMA)
 */
export function SMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  
  return result;
}

/**
 * Exponential Moving Average (EMA)
 */
export function EMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Первое значение = SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
    result.push(NaN);
  }
  result[period - 1] = sum / period;
  
  // Последующие значения = EMA
  for (let i = period; i < prices.length; i++) {
    const ema = (prices[i] - result[i - 1]) * multiplier + result[i - 1];
    result.push(ema);
  }
  
  return result;
}

/**
 * Weighted Moving Average (WMA)
 */
export function WMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  const weightSum = (period * (period + 1)) / 2;
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let weightedSum = 0;
      for (let j = 0; j < period; j++) {
        weightedSum += prices[i - period + 1 + j] * (j + 1);
      }
      result.push(weightedSum / weightSum);
    }
  }
  
  return result;
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export function VWAP(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    result.push(cumulativeTPV / cumulativeVolume);
  }
  
  return result;
}

// ==================== MOMENTUM INDICATORS ====================

/**
 * Relative Strength Index (RSI)
 */
export function RSI(prices: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Рассчитываем изменения
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Первые значения = NaN
  for (let i = 0; i < period; i++) {
    result.push(NaN);
  }
  
  // Первое RSI = SMA усреднений
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  if (avgLoss === 0) {
    result.push(100);
  } else {
    const rs = avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));
  }
  
  // Последующие RSI = EMA усреднений
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    }
  }
  
  return result;
}

/**
 * MACD (Moving Average Convergence Divergence)
 */
export function MACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = EMA(prices, fastPeriod);
  const slowEMA = EMA(prices, slowPeriod);
  
  const macd: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macd.push(NaN);
    } else {
      macd.push(fastEMA[i] - slowEMA[i]);
    }
  }
  
  const signal = EMA(macd.filter(v => !isNaN(v)), signalPeriod);
  
  // Синхронизируем длину signal
  const signalOffset = prices.length - signal.length;
  const fullSignal: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < signalOffset) {
      fullSignal.push(NaN);
    } else {
      fullSignal.push(signal[i - signalOffset]);
    }
  }
  
  const histogram: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(macd[i]) || isNaN(fullSignal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macd[i] - fullSignal[i]);
    }
  }
  
  return { macd, signal: fullSignal, histogram };
}

/**
 * Stochastic Oscillator
 */
export function Stochastic(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3
): { k: number[]; d: number[] } {
  const k: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      k.push(NaN);
    } else {
      const periodCandles = candles.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...periodCandles.map(c => c.high));
      const lowestLow = Math.min(...periodCandles.map(c => c.low));
      
      if (highestHigh === lowestLow) {
        k.push(50);
      } else {
        k.push(((candles[i].close - lowestLow) / (highestHigh - lowestLow)) * 100);
      }
    }
  }
  
  const d = SMA(k.filter(v => !isNaN(v)), dPeriod);
  
  // Синхронизируем длину
  const dOffset = k.length - d.length;
  const fullD: number[] = [];
  for (let i = 0; i < k.length; i++) {
    if (i < dOffset) {
      fullD.push(NaN);
    } else {
      fullD.push(d[i - dOffset]);
    }
  }
  
  return { k, d: fullD };
}

/**
 * Commodity Channel Index (CCI)
 */
export function CCI(candles: Candle[], period: number = 20): number[] {
  const result: number[] = [];
  const tp: number[] = candles.map(c => (c.high + c.low + c.close) / 3);
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const periodTP = tp.slice(i - period + 1, i + 1);
      const sma = periodTP.reduce((a, b) => a + b, 0) / period;
      
      // Mean Deviation
      const meanDev = periodTP.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;
      
      if (meanDev === 0) {
        result.push(0);
      } else {
        result.push((tp[i] - sma) / (0.015 * meanDev));
      }
    }
  }
  
  return result;
}

/**
 * Money Flow Index (MFI)
 */
export function MFI(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  const positiveMF: number[] = [];
  const negativeMF: number[] = [];
  
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
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      const posSum = positiveMF.slice(i - period, i).reduce((a, b) => a + b, 0);
      const negSum = negativeMF.slice(i - period, i).reduce((a, b) => a + b, 0);
      
      if (negSum === 0) {
        result.push(100);
      } else {
        const mfRatio = posSum / negSum;
        result.push(100 - (100 / (1 + mfRatio)));
      }
    }
  }
  
  return result;
}

// ==================== VOLATILITY INDICATORS ====================

/**
 * Average True Range (ATR)
 */
export function ATR(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  const trueRanges: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trueRanges.push(tr);
    }
  }
  
  // First ATR = SMA
  let atrSum = 0;
  for (let i = 0; i < period; i++) {
    atrSum += trueRanges[i];
    result.push(NaN);
  }
  result[period - 1] = atrSum / period;
  
  // Subsequent ATR = EMA
  for (let i = period; i < candles.length; i++) {
    const atr = (result[i - 1] * (period - 1) + trueRanges[i]) / period;
    result.push(atr);
  }
  
  return result;
}

/**
 * Bollinger Bands
 */
export function BollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = SMA(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(middle[i])) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const periodPrices = prices.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const squaredDiffs = periodPrices.map(p => Math.pow(p - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(variance);
      
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
  }
  
  return { upper, middle, lower };
}

/**
 * Keltner Channels
 */
export function KeltnerChannels(
  candles: Candle[],
  emaPeriod: number = 20,
  atrPeriod: number = 10,
  multiplier: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const closes = candles.map(c => c.close);
  const middle = EMA(closes, emaPeriod);
  const atr = ATR(candles, atrPeriod);
  
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(middle[i]) || isNaN(atr[i])) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      upper.push(middle[i] + multiplier * atr[i]);
      lower.push(middle[i] - multiplier * atr[i]);
    }
  }
  
  return { upper, middle, lower };
}

// ==================== VOLUME INDICATORS ====================

/**
 * On-Balance Volume (OBV)
 */
export function OBV(candles: Candle[]): number[] {
  const result: number[] = [];
  let obv = 0;
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      obv = candles[i].volume;
    } else {
      if (candles[i].close > candles[i - 1].close) {
        obv += candles[i].volume;
      } else if (candles[i].close < candles[i - 1].close) {
        obv -= candles[i].volume;
      }
    }
    result.push(obv);
  }
  
  return result;
}

// ==================== SUPPORT/RESISTANCE ====================

/**
 * Pivot Points
 */
export function PivotPoints(candle: Candle): {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
} {
  const pp = (candle.high + candle.low + candle.close) / 3;
  const r1 = 2 * pp - candle.low;
  const s1 = 2 * pp - candle.high;
  const r2 = pp + (candle.high - candle.low);
  const s2 = pp - (candle.high - candle.low);
  const r3 = candle.high + 2 * (pp - candle.low);
  const s3 = candle.low - 2 * (candle.high - pp);
  
  return { pp, r1, r2, r3, s1, s2, s3 };
}

/**
 * Fibonacci Retracement
 */
export function FibonacciRetracement(
  high: number,
  low: number
): {
  level0: number;
  level236: number;
  level382: number;
  level500: number;
  level618: number;
  level786: number;
  level1000: number;
} {
  const diff = high - low;
  
  return {
    level0: high,
    level236: high - diff * 0.236,
    level382: high - diff * 0.382,
    level500: high - diff * 0.5,
    level618: high - diff * 0.618,
    level786: high - diff * 0.786,
    level1000: low,
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Найти пересечение двух линий
 */
export function findCrossovers(line1: number[], line2: number[]): ("bullish" | "bearish" | null)[] {
  const result: ("bullish" | "bearish" | null)[] = [null];
  
  for (let i = 1; i < line1.length; i++) {
    if (isNaN(line1[i]) || isNaN(line1[i - 1]) || isNaN(line2[i]) || isNaN(line2[i - 1])) {
      result.push(null);
    } else if (line1[i - 1] <= line2[i - 1] && line1[i] > line2[i]) {
      result.push("bullish");
    } else if (line1[i - 1] >= line2[i - 1] && line1[i] < line2[i]) {
      result.push("bearish");
    } else {
      result.push(null);
    }
  }
  
  return result;
}

/**
 * Проверить на перепроданность/перекупленность
 */
export function checkOverboughtOversold(
  values: number[],
  overboughtLevel: number = 70,
  oversoldLevel: number = 30
): ("overbought" | "oversold" | null)[] {
  return values.map(v => {
    if (isNaN(v)) return null;
    if (v >= overboughtLevel) return "overbought";
    if (v <= oversoldLevel) return "oversold";
    return null;
  });
}

/**
 * Рассчитать все индикаторы из конфигурации
 */
export function calculateIndicators(
  candles: Candle[],
  config: {
    sma?: number[];
    ema?: number[];
    rsi?: number[];
    macd?: { fast: number; slow: number; signal: number };
    bollingerBands?: { period: number; stdDev: number };
    atr?: number[];
    stochastic?: { k: number; d: number };
    cci?: number[];
    mfi?: number[];
  } = {}
): IndicatorResult {
  const closes = candles.map(c => c.close);
  const result: IndicatorResult = {};

  if (config.sma) {
    result.sma = {};
    for (const period of config.sma) {
      result.sma[period] = SMA(closes, period);
    }
  }

  if (config.ema) {
    result.ema = {};
    for (const period of config.ema) {
      result.ema[period] = EMA(closes, period);
    }
  }

  if (config.rsi) {
    result.rsi = {};
    for (const period of config.rsi) {
      result.rsi[period] = RSI(closes, period);
    }
  }

  if (config.macd) {
    result.macd = MACD(closes, config.macd.fast, config.macd.slow, config.macd.signal);
  }

  if (config.bollingerBands) {
    result.bollingerBands = BollingerBands(closes, config.bollingerBands.period, config.bollingerBands.stdDev);
  }

  if (config.atr) {
    result.atr = [];
    for (const period of config.atr) {
      result.atr = ATR(candles, period);
      break; // ATR только один период
    }
  }

  if (config.stochastic) {
    result.stoch = Stochastic(candles, config.stochastic.k, config.stochastic.d);
  }

  if (config.cci) {
    result.cci = [];
    for (const period of config.cci) {
      result.cci = CCI(candles, period);
      break;
    }
  }

  if (config.mfi) {
    result.mfi = [];
    for (const period of config.mfi) {
      result.mfi = MFI(candles, period);
      break;
    }
  }

  return result;
}
