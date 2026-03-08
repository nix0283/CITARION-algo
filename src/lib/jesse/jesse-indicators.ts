/**
 * Jesse Indicators Library
 * 
 * Порт индикаторов из jesse-ai/indicators (TypeScript)
 * @see https://github.com/jesse-ai/indicators
 * @see https://www.npmjs.com/package/jesse-indicators
 * 
 * Библиотека технического анализа, изначально созданная для Jesse AI.
 * Все индикаторы оптимизированы для потоковой обработки данных.
 */

// ==================== TYPES ====================

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
}

export interface IndicatorResult {
  value: number;
  valid: boolean;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Проверка на валидное число
 */
function isValid(value: number): boolean {
  return !isNaN(value) && isFinite(value);
}

/**
 * Сумма массива
 */
function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Среднее значение
 */
function average(arr: number[]): number {
  if (arr.length === 0) return NaN;
  return sum(arr) / arr.length;
}

/**
 * Стандартное отклонение
 */
function standardDeviation(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const avg = average(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

// ==================== MOVING AVERAGES ====================

/**
 * Simple Moving Average (SMA)
 */
export function SMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);

  for (let i = period - 1; i < data.length; i++) {
    let sumVal = 0;
    for (let j = 0; j < period; j++) {
      sumVal += data[i - j];
    }
    result[i] = sumVal / period;
  }

  return result;
}

/**
 * Exponential Moving Average (EMA)
 */
export function EMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const multiplier = 2 / (period + 1);

  // Initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;

  // EMA
  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }

  return result;
}

/**
 * Weighted Moving Average (WMA)
 */
export function WMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const weightSum = (period * (period + 1)) / 2;

  for (let i = period - 1; i < data.length; i++) {
    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      weightedSum += data[i - period + 1 + j] * (j + 1);
    }
    result[i] = weightedSum / weightSum;
  }

  return result;
}

/**
 * Hull Moving Average (HMA)
 */
export function HMA(data: number[], period: number): number[] {
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));

  const wmaHalf = WMA(data, halfPeriod);
  const wmaFull = WMA(data, period);

  const rawHMA: number[] = [];
  for (let i = 0; i < data.length; i++) {
    rawHMA.push(2 * (wmaHalf[i] || 0) - (wmaFull[i] || 0));
  }

  return WMA(rawHMA, sqrtPeriod);
}

/**
 * Volume Weighted Moving Average (VWMA)
 */
export function VWMA(candles: Candle[], period: number): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);

  for (let i = period - 1; i < candles.length; i++) {
    let sumPV = 0;
    let sumV = 0;
    for (let j = 0; j < period; j++) {
      sumPV += candles[i - j].close * candles[i - j].volume;
      sumV += candles[i - j].volume;
    }
    result[i] = sumV > 0 ? sumPV / sumV : NaN;
  }

  return result;
}

/**
 * Smoothed Moving Average (SMMA/RMA)
 */
export function SMMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);

  // Initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;

  // SMMA
  for (let i = period; i < data.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + data[i]) / period;
  }

  return result;
}

/**
 * Double Exponential Moving Average (DEMA)
 */
export function DEMA(data: number[], period: number): number[] {
  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1.map(v => isNaN(v) ? 0 : v), period);

  const result: number[] = [];
  let ema2Idx = 0;

  for (let i = 0; i < data.length; i++) {
    if (isNaN(ema1[i])) {
      result.push(NaN);
    } else {
      result.push(2 * ema1[i] - (ema2[ema2Idx] || ema1[i]));
      ema2Idx++;
    }
  }

  return result;
}

/**
 * Triple Exponential Moving Average (TEMA)
 */
export function TEMA(data: number[], period: number): number[] {
  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1.map(v => isNaN(v) ? 0 : v), period);
  const ema3 = EMA(ema2.map(v => isNaN(v) ? 0 : v), period);

  const result: number[] = [];
  let ema2Idx = 0;
  let ema3Idx = 0;

  for (let i = 0; i < data.length; i++) {
    if (isNaN(ema1[i])) {
      result.push(NaN);
    } else {
      const e2 = ema2[ema2Idx] || ema1[i];
      const e3 = ema3[ema3Idx] || e2;
      result.push(3 * ema1[i] - 3 * e2 + e3);
      ema2Idx++;
      if (!isNaN(ema2[ema2Idx - 1])) ema3Idx++;
    }
  }

  return result;
}

// ==================== OSCILLATORS ====================

/**
 * Relative Strength Index (RSI)
 */
export function RSI(data: number[], period: number = 14): number[] {
  const result: number[] = new Array(data.length).fill(NaN);

  let avgGain = 0;
  let avgLoss = 0;

  // Initial averages
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
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
    result[period] = 100 - (100 / (1 + avgGain / avgLoss));
  }

  // Subsequent RSI
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      result[i] = 100 - (100 / (1 + avgGain / avgLoss));
    }
  }

  return result;
}

/**
 * Stochastic Oscillator
 */
export function Stochastic(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3
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

  const d = SMA(k, dPeriod);

  return { k, d };
}

/**
 * Stochastic RSI
 */
export function StochRSI(
  data: number[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
  kPeriod: number = 3,
  dPeriod: number = 3
): { k: number[]; d: number[] } {
  const rsi = RSI(data, rsiPeriod);
  const kRaw: number[] = new Array(data.length).fill(NaN);

  for (let i = stochPeriod - 1; i < data.length; i++) {
    const rsiSlice = rsi.slice(i - stochPeriod + 1, i + 1).filter(v => !isNaN(v));
    if (rsiSlice.length < stochPeriod) continue;

    const maxRSI = Math.max(...rsiSlice);
    const minRSI = Math.min(...rsiSlice);

    if (maxRSI === minRSI) {
      kRaw[i] = 100;
    } else {
      kRaw[i] = ((rsi[i] - minRSI) / (maxRSI - minRSI)) * 100;
    }
  }

  const k = SMA(kRaw, kPeriod);
  const d = SMA(k, dPeriod);

  return { k, d };
}

/**
 * Williams %R
 */
export function WilliamsR(candles: Candle[], period: number = 14): number[] {
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
export function CCI(candles: Candle[], period: number = 20): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const tpSlice = slice.map(c => (c.high + c.low + c.close) / 3);
    const smaTP = average(tpSlice);
    const meanDev = tpSlice.reduce((sum, val) => sum + Math.abs(val - smaTP), 0) / period;

    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;

    if (meanDev === 0) {
      result[i] = 0;
    } else {
      result[i] = (tp - smaTP) / (0.015 * meanDev);
    }
  }

  return result;
}

/**
 * Money Flow Index (MFI)
 */
export function MFI(candles: Candle[], period: number = 14): number[] {
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
    const posSum = sum(positiveMF.slice(i - period + 1, i + 1));
    const negSum = sum(negativeMF.slice(i - period + 1, i + 1));

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
export function ROC(data: number[], period: number = 10): number[] {
  const result: number[] = new Array(data.length).fill(NaN);

  for (let i = period; i < data.length; i++) {
    if (data[i - period] !== 0) {
      result[i] = ((data[i] - data[i - period]) / data[i - period]) * 100;
    }
  }

  return result;
}

// ==================== MACD ====================

/**
 * MACD (Moving Average Convergence Divergence)
 */
export function MACD(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = EMA(data, fastPeriod);
  const slowEMA = EMA(data, slowPeriod);

  const macdLine: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  const signalLine = EMA(macdLine.filter(v => !isNaN(v)), signalPeriod);

  // Build full signal array
  const fullSignal: number[] = [];
  let signalIdx = 0;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(macdLine[i])) {
      fullSignal.push(NaN);
    } else {
      fullSignal.push(signalIdx < signalLine.length ? signalLine[signalIdx] : NaN);
      signalIdx++;
    }
  }

  const histogram: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(fullSignal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - fullSignal[i]);
    }
  }

  return { macd: macdLine, signal: fullSignal, histogram };
}

/**
 * PPO (Percentage Price Oscillator)
 */
export function PPO(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { ppo: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = EMA(data, fastPeriod);
  const slowEMA = EMA(data, slowPeriod);

  const ppoLine: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i]) || slowEMA[i] === 0) {
      ppoLine.push(NaN);
    } else {
      ppoLine.push(((fastEMA[i] - slowEMA[i]) / slowEMA[i]) * 100);
    }
  }

  const signalLine = EMA(ppoLine.filter(v => !isNaN(v)), signalPeriod);

  const fullSignal: number[] = [];
  let signalIdx = 0;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(ppoLine[i])) {
      fullSignal.push(NaN);
    } else {
      fullSignal.push(signalIdx < signalLine.length ? signalLine[signalIdx] : NaN);
      signalIdx++;
    }
  }

  const histogram: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(ppoLine[i]) || isNaN(fullSignal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(ppoLine[i] - fullSignal[i]);
    }
  }

  return { ppo: ppoLine, signal: fullSignal, histogram };
}

// ==================== VOLATILITY ====================

/**
 * Average True Range (ATR)
 */
export function ATR(candles: Candle[], period: number = 14): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      trueRanges.push(
        Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low - candles[i - 1].close)
        )
      );
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
export function TrueRange(candles: Candle[]): number[] {
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(candles[i].high - candles[i].low);
    } else {
      result.push(
        Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low - candles[i - 1].close)
        )
      );
    }
  }

  return result;
}

/**
 * Bollinger Bands
 */
export function BollingerBands(
  data: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[]; bandwidth: number[] } {
  const middle = SMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (isNaN(middle[i])) {
      upper.push(NaN);
      lower.push(NaN);
      bandwidth.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const std = standardDeviation(slice);

      upper.push(middle[i] + stdDev * std);
      lower.push(middle[i] - stdDev * std);
      bandwidth.push(middle[i] > 0 ? ((upper[i] - lower[i]) / middle[i]) * 100 : 0);
    }
  }

  return { upper, middle, lower, bandwidth };
}

/**
 * Standard Deviation
 */
export function StdDev(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    result[i] = standardDeviation(slice);
  }

  return result;
}

// ==================== TREND ====================

/**
 * Average Directional Index (ADX)
 */
export function ADX(candles: Candle[], period: number = 14): {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
} {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    trueRanges.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }
  trueRanges.unshift(candles[0].high - candles[0].low);

  const smoothTR = SMMA(trueRanges, period);
  const smoothPlusDM = SMMA(plusDM, period);
  const smoothMinusDM = SMMA(minusDM, period);

  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const pdiVal = smoothTR[i] > 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
    const mdiVal = smoothTR[i] > 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;

    plusDI.push(pdiVal);
    minusDI.push(mdiVal);

    const sum = pdiVal + mdiVal;
    dx.push(sum > 0 ? (Math.abs(pdiVal - mdiVal) / sum) * 100 : 0);
  }

  const adxLine = SMMA(dx, period);

  return { adx: adxLine, plusDI, minusDI };
}

/**
 * Parabolic SAR
 */
export function SAR(
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
 * Supertrend
 */
export function SuperTrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3
): { supertrend: number[]; direction: number[] } {
  const atrVal = ATR(candles, period);
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

// ==================== VOLUME ====================

/**
 * On-Balance Volume (OBV)
 */
export function OBV(candles: Candle[]): number[] {
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
export function VWAP(candles: Candle[]): number[] {
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
export function CMF(candles: Candle[], period: number = 20): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    let sumMFV = 0;
    let sumVolume = 0;

    for (const candle of slice) {
      const range = candle.high - candle.low;
      const mfMultiplier = range > 0
        ? ((candle.close - candle.low) - (candle.high - candle.close)) / range
        : 0;
      sumMFV += mfMultiplier * candle.volume;
      sumVolume += candle.volume;
    }

    result[i] = sumVolume > 0 ? sumMFV / sumVolume : 0;
  }

  return result;
}

// ==================== EXPORTS ====================

export default {
  // Moving Averages
  SMA,
  EMA,
  WMA,
  HMA,
  VWMA,
  SMMA,
  DEMA,
  TEMA,
  
  // Oscillators
  RSI,
  Stochastic,
  StochRSI,
  WilliamsR,
  CCI,
  MFI,
  ROC,
  
  // MACD
  MACD,
  PPO,
  
  // Volatility
  ATR,
  TrueRange,
  BollingerBands,
  StdDev,
  
  // Trend
  ADX,
  SAR,
  SuperTrend,
  
  // Volume
  OBV,
  VWAP,
  CMF,
};
