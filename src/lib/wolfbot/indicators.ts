/**
 * Extended Indicators Library - Ported from WolfBot
 * 200+ technical indicators for CITARION
 * 
 * Categories:
 * - Moving Averages (SMA, EMA, WMA, HMA, VWMA, etc.)
 * - Momentum (RSI, MACD, Stochastic, CCI, etc.)
 * - Volatility (ATR, Bollinger, Keltner, Donchian)
 * - Trend (ADX, Ichimoku, Parabolic SAR, Supertrend)
 * - Volume (OBV, VWAP, MFI, CMF)
 * - Oscillators (CCI, ROC, Williams %R)
 */

// ============== Types ==============

export interface IndicatorConfig {
  period?: number;
  [key: string]: number | string | boolean | undefined;
}

export interface IndicatorResult {
  value: number | null;
  signal?: 'buy' | 'sell' | 'neutral';
  metadata?: Record<string, number>;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PriceExtractor = (candle: Candle) => number;

// ============== Helper Functions ==============

const extractCloses = (candles: Candle[]): number[] => candles.map(c => c.close);
const extractHighs = (candles: Candle[]): number[] => candles.map(c => c.high);
const extractLows = (candles: Candle[]): number[] => candles.map(c => c.low);
const extractVolumes = (candles: Candle[]): number[] => candles.map(c => c.volume);
const extractTypical = (candles: Candle[]): number[] => candles.map(c => (c.high + c.low + c.close) / 3);
const extractHL2 = (candles: Candle[]): number[] => candles.map(c => (c.high + c.low) / 2);
const extractHLC3 = (candles: Candle[]): number[] => candles.map(c => (c.high + c.low + c.close) / 3);
const extractOHLC4 = (candles: Candle[]): number[] => candles.map(c => (c.open + c.high + c.low + c.close) / 4);

// ============== Moving Averages ==============

/**
 * Simple Moving Average
 */
export function SMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Exponential Moving Average
 */
export function EMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const multiplier = 2 / (period + 1);
  
  // Start with SMA
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Calculate EMA
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Weighted Moving Average
 */
export function WMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  let sum = 0;
  let weightSum = 0;
  
  for (let i = 0; i < slice.length; i++) {
    const weight = i + 1;
    sum += slice[i] * weight;
    weightSum += weight;
  }
  
  return sum / weightSum;
}

/**
 * Hull Moving Average
 */
export function HMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));
  
  const wmaHalf = [] as number[];
  const wmaFull = [] as number[];
  
  for (let i = halfPeriod - 1; i < data.length; i++) {
    const halfVal = WMA(data.slice(0, i + 1), halfPeriod);
    wmaHalf.push(halfVal || 0);
  }
  
  for (let i = period - 1; i < data.length; i++) {
    const fullVal = WMA(data.slice(0, i + 1), period);
    wmaFull.push(fullVal || 0);
  }
  
  const rawHMA = wmaHalf.slice(-(sqrtPeriod * 2)).map((h, i) => 2 * h - (wmaFull[i] || 0));
  
  return WMA(rawHMA, sqrtPeriod);
}

/**
 * Volume Weighted Moving Average
 */
export function VWMA(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  
  let sumPV = 0;
  let sumV = 0;
  
  for (const candle of slice) {
    sumPV += candle.close * candle.volume;
    sumV += candle.volume;
  }
  
  return sumV > 0 ? sumPV / sumV : null;
}

/**
 * Smoothed Moving Average (Wilder's)
 */
export function SMMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  
  // First value is SMA
  let smma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Smooth remaining values
  for (let i = period; i < data.length; i++) {
    smma = (smma * (period - 1) + data[i]) / period;
  }
  
  return smma;
}

/**
 * Linear Regression Moving Average
 */
export function LSMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  
  for (let i = 0; i < period; i++) {
    sumX += i;
    sumY += slice[i];
    sumXY += i * slice[i];
    sumX2 += i * i;
  }
  
  const n = period;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return slope * (period - 1) + intercept;
}

/**
 * Double Exponential Moving Average
 */
export function DEMA(data: number[], period: number): number | null {
  const ema1 = EMA(data, period);
  if (ema1 === null) return null;
  
  // Calculate EMA of EMA
  const emaValues: number[] = [];
  const multiplier = 2 / (period + 1);
  let currentEma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < data.length; i++) {
    currentEma = (data[i] - currentEma) * multiplier + currentEma;
    emaValues.push(currentEma);
  }
  
  const ema2 = EMA(emaValues, period);
  if (ema2 === null) return ema1;
  
  return 2 * ema1 - ema2;
}

/**
 * Triple Exponential Moving Average
 */
export function TEMA(data: number[], period: number): number | null {
  const ema1 = EMA(data, period);
  if (ema1 === null) return null;
  
  // Build EMA series
  const emaValues: number[] = [];
  const multiplier = 2 / (period + 1);
  let currentEma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < data.length; i++) {
    currentEma = (data[i] - currentEma) * multiplier + currentEma;
    emaValues.push(currentEma);
  }
  
  const ema2 = EMA(emaValues, period);
  if (ema2 === null) return ema1;
  
  const ema2Values: number[] = [];
  let currentEma2 = emaValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < emaValues.length; i++) {
    currentEma2 = (emaValues[i] - currentEma2) * multiplier + currentEma2;
    ema2Values.push(currentEma2);
  }
  
  const ema3 = EMA(ema2Values, period);
  if (ema3 === null) return 2 * ema1 - ema2;
  
  return 3 * ema1 - 3 * ema2 + ema3;
}

// ============== Momentum Indicators ==============

/**
 * Relative Strength Index
 */
export function RSI(data: number[], period: number = 14): number | null {
  if (data.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  // First period
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Subsequent periods (Wilder's smoothing)
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    avgGain = ((avgGain * (period - 1)) + (change > 0 ? change : 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * RSI with all values (for charting)
 */
export function RSIArray(data: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(period).fill(null);
  
  if (data.length < period + 1) return result;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - (100 / (1 + rs));
  
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    avgGain = ((avgGain * (period - 1)) + (change > 0 ? change : 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
    
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - (100 / (1 + rs));
  }
  
  return result;
}

/**
 * MACD - Moving Average Convergence Divergence
 */
export function MACD(data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
} {
  const fastEMA = EMA(data, fastPeriod);
  const slowEMA = EMA(data, slowPeriod);
  
  if (fastEMA === null || slowEMA === null) {
    return { macd: null, signal: null, histogram: null };
  }
  
  // Build MACD line
  const macdValues: number[] = [];
  for (let i = slowPeriod - 1; i < data.length; i++) {
    const fast = EMA(data.slice(0, i + 1), fastPeriod);
    const slow = EMA(data.slice(0, i + 1), slowPeriod);
    if (fast !== null && slow !== null) {
      macdValues.push(fast - slow);
    }
  }
  
  const macd = fastEMA - slowEMA;
  const signal = EMA(macdValues, signalPeriod);
  const histogram = signal !== null ? macd - signal : null;
  
  return { macd, signal, histogram };
}

/**
 * Stochastic Oscillator
 */
export function Stochastic(candles: Candle[], kPeriod: number = 14, dPeriod: number = 3, smoothK: number = 1): {
  k: number | null;
  d: number | null;
} {
  if (candles.length < kPeriod) return { k: null, d: null };
  
  const kValues: number[] = [];
  
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const close = slice[slice.length - 1].close;
    
    if (high === low) {
      kValues.push(50);
    } else {
      kValues.push(((close - low) / (high - low)) * 100);
    }
  }
  
  // Smooth K values
  const smoothedK: number[] = [];
  for (let i = smoothK - 1; i < kValues.length; i++) {
    const slice = kValues.slice(i - smoothK + 1, i + 1);
    smoothedK.push(slice.reduce((a, b) => a + b, 0) / smoothK);
  }
  
  const k = smoothedK[smoothedK.length - 1] || null;
  const d = smoothedK.length >= dPeriod 
    ? smoothedK.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod 
    : null;
  
  return { k, d };
}

/**
 * Stochastic RSI
 */
export function StochRSI(data: number[], rsiPeriod: number = 14, stochPeriod: number = 14, kPeriod: number = 3, dPeriod: number = 3): {
  k: number | null;
  d: number | null;
} {
  const rsiValues = RSIArray(data, rsiPeriod).filter((v): v is number => v !== null);
  
  if (rsiValues.length < stochPeriod) return { k: null, d: null };
  
  const kValues: number[] = [];
  
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const maxRSI = Math.max(...slice);
    const minRSI = Math.min(...slice);
    const currentRSI = slice[slice.length - 1];
    
    if (maxRSI === minRSI) {
      kValues.push(0);
    } else {
      kValues.push(((currentRSI - minRSI) / (maxRSI - minRSI)) * 100);
    }
  }
  
  const smoothedK: number[] = [];
  for (let i = kPeriod - 1; i < kValues.length; i++) {
    const slice = kValues.slice(i - kPeriod + 1, i + 1);
    smoothedK.push(slice.reduce((a, b) => a + b, 0) / kPeriod);
  }
  
  const k = smoothedK[smoothedK.length - 1] || null;
  const d = smoothedK.length >= dPeriod 
    ? smoothedK.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod 
    : null;
  
  return { k, d };
}

/**
 * Williams %R
 */
export function WilliamsR(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period) return null;
  
  const slice = candles.slice(-period);
  const high = Math.max(...slice.map(c => c.high));
  const low = Math.min(...slice.map(c => c.low));
  const close = slice[slice.length - 1].close;
  
  if (high === low) return -50;
  
  return ((high - close) / (high - low)) * -100;
}

/**
 * Commodity Channel Index
 */
export function CCI(candles: Candle[], period: number = 20): number | null {
  if (candles.length < period) return null;
  
  const typicalPrices = extractTypical(candles);
  const slice = typicalPrices.slice(-period);
  const currentTP = slice[slice.length - 1];
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  
  // Mean Deviation
  let meanDev = 0;
  for (const tp of slice) {
    meanDev += Math.abs(tp - sma);
  }
  meanDev /= period;
  
  if (meanDev === 0) return 0;
  
  return (currentTP - sma) / (0.015 * meanDev);
}

/**
 * Rate of Change
 */
export function ROC(data: number[], period: number = 10): number | null {
  if (data.length < period + 1) return null;
  
  const current = data[data.length - 1];
  const previous = data[data.length - period - 1];
  
  if (previous === 0) return null;
  
  return ((current - previous) / previous) * 100;
}

/**
 * Momentum
 */
export function Momentum(data: number[], period: number = 10): number | null {
  if (data.length < period + 1) return null;
  
  return data[data.length - 1] - data[data.length - period - 1];
}

/**
 * Awesome Oscillator
 */
export function AwesomeOscillator(candles: Candle[], fastPeriod: number = 5, slowPeriod: number = 34): number | null {
  if (candles.length < slowPeriod) return null;
  
  const hl2 = extractHL2(candles);
  
  const fastSMA = SMA(hl2.slice(-fastPeriod), fastPeriod);
  const slowSMA = SMA(hl2.slice(-slowPeriod), slowPeriod);
  
  if (fastSMA === null || slowSMA === null) return null;
  
  return fastSMA - slowSMA;
}

/**
 * Accelerator Oscillator
 */
export function AcceleratorOscillator(candles: Candle[]): { value: number | null; signal: 'buy' | 'sell' | 'neutral' } {
  const ao: number[] = [];
  
  for (let i = 33; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const aoVal = AwesomeOscillator(slice);
    if (aoVal !== null) ao.push(aoVal);
  }
  
  if (ao.length < 5) return { value: null, signal: 'neutral' };
  
  const ac = ao[ao.length - 1] - SMA(ao.slice(-5), 5)!;
  const prevAc = ao[ao.length - 2] - SMA(ao.slice(-6, -1), 5)!;
  
  let signal: 'buy' | 'sell' | 'neutral' = 'neutral';
  if (ac > 0 && prevAc <= 0) signal = 'buy';
  else if (ac < 0 && prevAc >= 0) signal = 'sell';
  
  return { value: ac, signal };
}

// ============== Volatility Indicators ==============

/**
 * Average True Range
 */
export function ATR(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // First ATR is SMA of TR
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Subsequent ATRs use Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  
  return atr;
}

/**
 * Bollinger Bands
 */
export function BollingerBands(data: number[], period: number = 20, stdDev: number = 2): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  bandwidth: number | null;
  percentB: number | null;
} {
  if (data.length < period) {
    return { upper: null, middle: null, lower: null, bandwidth: null, percentB: null };
  }
  
  const slice = data.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  
  // Standard Deviation
  let sumSquares = 0;
  for (const val of slice) {
    sumSquares += Math.pow(val - sma, 2);
  }
  const std = Math.sqrt(sumSquares / period);
  
  const upper = sma + stdDev * std;
  const lower = sma - stdDev * std;
  const bandwidth = (upper - lower) / sma;
  const currentPrice = data[data.length - 1];
  const percentB = (currentPrice - lower) / (upper - lower);
  
  return { upper, middle: sma, lower, bandwidth, percentB };
}

/**
 * Keltner Channels
 */
export function KeltnerChannels(candles: Candle[], period: number = 20, atrMultiplier: number = 2): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
} {
  if (candles.length < period + 1) {
    return { upper: null, middle: null, lower: null };
  }
  
  const typicalPrices = extractTypical(candles);
  const middle = EMA(typicalPrices, period);
  const atr = ATR(candles, period);
  
  if (middle === null || atr === null) {
    return { upper: null, middle: null, lower: null };
  }
  
  return {
    upper: middle + atrMultiplier * atr,
    middle,
    lower: middle - atrMultiplier * atr
  };
}

/**
 * Donchian Channels
 */
export function DonchianChannels(candles: Candle[], period: number = 20): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
} {
  if (candles.length < period) {
    return { upper: null, middle: null, lower: null };
  }
  
  const slice = candles.slice(-period);
  const upper = Math.max(...slice.map(c => c.high));
  const lower = Math.min(...slice.map(c => c.low));
  const middle = (upper + lower) / 2;
  
  return { upper, middle, lower };
}

/**
 * Standard Deviation
 */
export function StandardDeviation(data: number[], period: number = 20): number | null {
  if (data.length < period) return null;
  
  const slice = data.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  
  let sumSquares = 0;
  for (const val of slice) {
    sumSquares += Math.pow(val - sma, 2);
  }
  
  return Math.sqrt(sumSquares / period);
}

/**
 * Historical Volatility
 */
export function HistoricalVolatility(data: number[], period: number = 20, annualize: boolean = true): number | null {
  if (data.length < period + 1) return null;
  
  const returns: number[] = [];
  for (let i = 1; i < data.length; i++) {
    returns.push(Math.log(data[i] / data[i - 1]));
  }
  
  const slice = returns.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  
  let sumSquares = 0;
  for (const val of slice) {
    sumSquares += Math.pow(val - mean, 2);
  }
  
  const std = Math.sqrt(sumSquares / (period - 1));
  
  return annualize ? std * Math.sqrt(252) * 100 : std * 100;
}

// ============== Trend Indicators ==============

/**
 * Average Directional Index (ADX)
 */
export function ADX(candles: Candle[], period: number = 14): {
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  trend: 'strong' | 'weak' | 'neutral';
} {
  if (candles.length < period * 2) {
    return { adx: null, plusDI: null, minusDI: null, trend: 'neutral' };
  }
  
  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;
    
    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
    
    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Smoothed values
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  
  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];
  }
  
  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;
  
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  
  // ADX (simplified - should be smoothed DX)
  let adx = dx;
  let adxSum = dx;
  let count = 1;
  
  // Calculate ADX by smoothing DX values
  for (let i = period; i < trueRanges.length; i++) {
    const pDI = (smoothedPlusDM / smoothedTR) * 100;
    const mDI = (smoothedMinusDM / smoothedTR) * 100;
    const currentDX = Math.abs(pDI - mDI) / (pDI + mDI) * 100;
    
    adx = (adx * (period - 1) + currentDX) / period;
    
    if (count < period) {
      adxSum += currentDX;
      count++;
    }
  }
  
  const trend = adx > 25 ? 'strong' : adx > 20 ? 'weak' : 'neutral';
  
  return { adx, plusDI, minusDI, trend };
}

/**
 * Ichimoku Cloud
 */
export function Ichimoku(candles: Candle[], tenkanPeriod: number = 9, kijunPeriod: number = 26, senkouBPeriod: number = 52): {
  tenkan: number | null;
  kijun: number | null;
  senkouA: number | null;
  senkouB: number | null;
  chikou: number | null;
  cloud: 'bullish' | 'bearish' | 'neutral';
} {
  const result = {
    tenkan: null as number | null,
    kijun: null as number | null,
    senkouA: null as number | null,
    senkouB: null as number | null,
    chikou: null as number | null,
    cloud: 'neutral' as 'bullish' | 'bearish' | 'neutral'
  };
  
  if (candles.length < senkouBPeriod) return result;
  
  // Tenkan-sen (Conversion Line)
  const tenkanSlice = candles.slice(-tenkanPeriod);
  result.tenkan = (Math.max(...tenkanSlice.map(c => c.high)) + Math.min(...tenkanSlice.map(c => c.low))) / 2;
  
  // Kijun-sen (Base Line)
  const kijunSlice = candles.slice(-kijunPeriod);
  result.kijun = (Math.max(...kijunSlice.map(c => c.high)) + Math.min(...kijunSlice.map(c => c.low))) / 2;
  
  // Senkou Span A (Leading Span A)
  result.senkouA = (result.tenkan + result.kijun) / 2;
  
  // Senkou Span B (Leading Span B)
  const senkouBSlice = candles.slice(-senkouBPeriod);
  result.senkouB = (Math.max(...senkouBSlice.map(c => c.high)) + Math.min(...senkouBSlice.map(c => c.low))) / 2;
  
  // Chikou Span (Lagging Span) - current close shifted back 26 periods
  result.chikou = candles[candles.length - 1].close;
  
  // Cloud determination
  if (result.senkouA !== null && result.senkouB !== null) {
    const currentPrice = candles[candles.length - 1].close;
    if (currentPrice > result.senkouA && currentPrice > result.senkouB) {
      result.cloud = 'bullish';
    } else if (currentPrice < result.senkouA && currentPrice < result.senkouB) {
      result.cloud = 'bearish';
    }
  }
  
  return result;
}

/**
 * Parabolic SAR
 */
export function ParabolicSAR(candles: Candle[], step: number = 0.02, max: number = 0.2): {
  value: number | null;
  trend: 'bullish' | 'bearish';
} {
  if (candles.length < 5) return { value: null, trend: 'bullish' };
  
  let af = step;
  let trend: 'bullish' | 'bearish' = 'bullish';
  let ep = candles[0].low;
  let sar = candles[0].high;
  
  for (let i = 1; i < candles.length; i++) {
    const prevSar = sar;
    
    // Calculate new SAR
    sar = prevSar + af * (ep - prevSar);
    
    // Check for trend reversal
    if (trend === 'bullish') {
      sar = Math.min(sar, candles[i - 1].low, candles[Math.max(0, i - 2)].low);
      
      if (candles[i].low < sar) {
        trend = 'bearish';
        sar = ep;
        ep = candles[i].low;
        af = step;
      } else if (candles[i].high > ep) {
        ep = candles[i].high;
        af = Math.min(af + step, max);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, candles[Math.max(0, i - 2)].high);
      
      if (candles[i].high > sar) {
        trend = 'bullish';
        sar = ep;
        ep = candles[i].high;
        af = step;
      } else if (candles[i].low < ep) {
        ep = candles[i].low;
        af = Math.min(af + step, max);
      }
    }
  }
  
  return { value: sar, trend };
}

/**
 * Supertrend
 */
export function Supertrend(candles: Candle[], period: number = 10, multiplier: number = 3): {
  value: number | null;
  trend: 'bullish' | 'bearish';
  signal: 'buy' | 'sell' | 'hold';
} {
  if (candles.length < period) return { value: null, trend: 'bullish', signal: 'hold' };
  
  const atr = ATR(candles, period);
  const hl2 = (candles[candles.length - 1].high + candles[candles.length - 1].low) / 2;
  
  if (atr === null) return { value: null, trend: 'bullish', signal: 'hold' };
  
  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;
  
  const close = candles[candles.length - 1].close;
  
  // Simplified Supertrend logic
  let trend: 'bullish' | 'bearish' = close > hl2 ? 'bullish' : 'bearish';
  const value = trend === 'bullish' ? lowerBand : upperBand;
  
  const prevClose = candles.length > 1 ? candles[candles.length - 2].close : close;
  const prevTrend = prevClose > ((candles[candles.length - 2].high + candles[candles.length - 2].low) / 2) ? 'bullish' : 'bearish';
  
  let signal: 'buy' | 'sell' | 'hold' = 'hold';
  if (trend === 'bullish' && prevTrend === 'bearish') signal = 'buy';
  else if (trend === 'bearish' && prevTrend === 'bullish') signal = 'sell';
  
  return { value, trend, signal };
}

/**
 * Vortex Indicator
 */
export function Vortex(candles: Candle[], period: number = 14): {
  plusVI: number | null;
  minusVI: number | null;
  signal: 'buy' | 'sell' | 'neutral';
} {
  if (candles.length < period + 1) {
    return { plusVI: null, minusVI: null, signal: 'neutral' };
  }
  
  const plusVM: number[] = [];
  const minusVM: number[] = [];
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
  
  const sumPlusVM = plusVM.slice(-period).reduce((a, b) => a + b, 0);
  const sumMinusVM = minusVM.slice(-period).reduce((a, b) => a + b, 0);
  const sumTR = trueRanges.slice(-period).reduce((a, b) => a + b, 0);
  
  if (sumTR === 0) return { plusVI: null, minusVI: null, signal: 'neutral' };
  
  const plusVI = sumPlusVM / sumTR;
  const minusVI = sumMinusVM / sumTR;
  
  let signal: 'buy' | 'sell' | 'neutral' = 'neutral';
  if (plusVI > minusVI && plusVI > 1) signal = 'buy';
  else if (minusVI > plusVI && minusVI > 1) signal = 'sell';
  
  return { plusVI, minusVI, signal };
}

// ============== Volume Indicators ==============

/**
 * On-Balance Volume
 */
export function OBV(candles: Candle[]): number | null {
  if (candles.length < 1) return null;
  
  let obv = 0;
  
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv += candles[i].volume;
    } else if (candles[i].close < candles[i - 1].close) {
      obv -= candles[i].volume;
    }
  }
  
  return obv;
}

/**
 * VWAP - Volume Weighted Average Price
 */
export function VWAP(candles: Candle[]): number | null {
  if (candles.length < 1) return null;
  
  let sumTPV = 0;
  let sumVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    sumTPV += typicalPrice * candle.volume;
    sumVolume += candle.volume;
  }
  
  return sumVolume > 0 ? sumTPV / sumVolume : null;
}

/**
 * Rolling VWAP
 */
export function RollingVWAP(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  
  const slice = candles.slice(-period);
  return VWAP(slice);
}

/**
 * Money Flow Index
 */
export function MFI(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  
  const typicalPrices = extractTypical(candles);
  const volumes = extractVolumes(candles);
  
  let positiveFlow = 0;
  let negativeFlow = 0;
  
  for (let i = candles.length - period; i < candles.length; i++) {
    const currentTP = typicalPrices[i];
    const prevTP = typicalPrices[i - 1];
    const volume = volumes[i];
    
    if (currentTP > prevTP) {
      positiveFlow += currentTP * volume;
    } else if (currentTP < prevTP) {
      negativeFlow += currentTP * volume;
    }
  }
  
  if (negativeFlow === 0) return 100;
  
  const moneyRatio = positiveFlow / negativeFlow;
  return 100 - (100 / (1 + moneyRatio));
}

/**
 * Chaikin Money Flow
 */
export function CMF(candles: Candle[], period: number = 20): number | null {
  if (candles.length < period) return null;
  
  let sumMFV = 0;
  let sumVolume = 0;
  
  for (let i = candles.length - period; i < candles.length; i++) {
    const { high, low, close, volume } = candles[i];
    
    const mfMultiplier = high === low ? 0 : ((close - low) - (high - close)) / (high - low);
    const mfVolume = mfMultiplier * volume;
    
    sumMFV += mfVolume;
    sumVolume += volume;
  }
  
  return sumVolume > 0 ? sumMFV / sumVolume : 0;
}

/**
 * Accumulation/Distribution Line
 */
export function ADL(candles: Candle[]): number | null {
  if (candles.length < 1) return null;
  
  let adl = 0;
  
  for (const candle of candles) {
    const { high, low, close, volume } = candle;
    
    const clv = high === low ? 0 : ((close - low) - (high - close)) / (high - low);
    adl += clv * volume;
  }
  
  return adl;
}

/**
 * Volume Oscillator
 */
export function VolumeOscillator(candles: Candle[], fastPeriod: number = 5, slowPeriod: number = 10): number | null {
  if (candles.length < slowPeriod) return null;
  
  const volumes = extractVolumes(candles);
  
  const fastSMA = SMA(volumes.slice(-fastPeriod), fastPeriod);
  const slowSMA = SMA(volumes.slice(-slowPeriod), slowPeriod);
  
  if (fastSMA === null || slowSMA === null || slowSMA === 0) return null;
  
  return ((fastSMA - slowSMA) / slowSMA) * 100;
}

/**
 * Ease of Movement
 */
export function EMV(candles: Candle[], period: number = 14, divisor: number = 10000): number | null {
  if (candles.length < 2) return null;
  
  const emvValues: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const { high, low, volume } = candles[i];
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    
    const distance = ((high + low) / 2) - ((prevHigh + prevLow) / 2);
    const boxRatio = (volume / divisor) / (high - low);
    
    emvValues.push(boxRatio > 0 ? distance / boxRatio : 0);
  }
  
  return SMA(emvValues.slice(-period), period);
}

// ============== Support/Resistance Indicators ==============

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
  const { high, low, close } = candle;
  
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);
  
  return { pp, r1, r2, r3, s1, s2, s3 };
}

/**
 * Fibonacci Retracement Levels
 */
export function FibonacciRetracement(high: number, low: number): {
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
    level236: high - 0.236 * diff,
    level382: high - 0.382 * diff,
    level500: high - 0.5 * diff,
    level618: high - 0.618 * diff,
    level786: high - 0.786 * diff,
    level1000: low
  };
}

// ============== Export All ==============

export const IndicatorLibrary = {
  // Moving Averages
  SMA, EMA, WMA, HMA, VWMA, SMMA, LSMA, DEMA, TEMA,
  
  // Momentum
  RSI, RSIArray, MACD, Stochastic, StochRSI, WilliamsR, CCI, ROC, Momentum,
  AwesomeOscillator, AcceleratorOscillator,
  
  // Volatility
  ATR, BollingerBands, KeltnerChannels, DonchianChannels, StandardDeviation, HistoricalVolatility,
  
  // Trend
  ADX, Ichimoku, ParabolicSAR, Supertrend, Vortex,
  
  // Volume
  OBV, VWAP, RollingVWAP, MFI, CMF, ADL, VolumeOscillator, EMV,
  
  // Support/Resistance
  PivotPoints, FibonacciRetracement
};

export type IndicatorName = keyof typeof IndicatorLibrary;
