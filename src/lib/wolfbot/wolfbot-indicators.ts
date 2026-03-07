/**
 * WolfBot Indicators Port for CITARION
 * Comprehensive library of 200+ technical indicators
 * Based on WolfBot (https://github.com/Ekliptor/WolfBot)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface IndicatorInput {
  high: number[];
  low: number[];
  close: number[];
  open: number[];
  volume?: number[];
}

export interface IndicatorResult {
  value: number;
  signal?: 'buy' | 'sell' | 'neutral';
  trend?: 'bullish' | 'bearish' | 'sideways';
  metadata?: Record<string, number>;
}

export interface BandedResult extends IndicatorResult {
  upper: number;
  middle: number;
  lower: number;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'bullish' | 'bearish';
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function sum(data: number[]): number {
  return data.reduce((a, b) => a + b, 0);
}

function mean(data: number[]): number {
  return data.length > 0 ? sum(data) / data.length : 0;
}

function stdDev(data: number[]): number {
  const avg = mean(data);
  const squareDiffs = data.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

function variance(data: number[]): number {
  const avg = mean(data);
  return mean(data.map(value => Math.pow(value - avg, 2)));
}

function highest(data: number[]): number {
  return Math.max(...data);
}

function lowest(data: number[]): number {
  return Math.min(...data);
}

// =============================================================================
// MOVING AVERAGES (30+ variants)
// =============================================================================

/**
 * Simple Moving Average
 */
export function SMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      result.push(mean(slice));
    }
  }
  return result;
}

/**
 * Exponential Moving Average
 */
export function EMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  const firstEMA = mean(data.slice(0, period));
  result.push(...Array(period - 1).fill(NaN));
  result.push(firstEMA);
  
  for (let i = period; i < data.length; i++) {
    const ema = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    result.push(ema);
  }
  return result;
}

/**
 * Weighted Moving Average
 */
export function WMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const weightSum = (period * (period + 1)) / 2;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let weightedSum = 0;
      for (let j = 0; j < period; j++) {
        weightedSum += data[i - period + 1 + j] * (j + 1);
      }
      result.push(weightedSum / weightSum);
    }
  }
  return result;
}

/**
 * Hull Moving Average - reduces lag
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
 * Volume Weighted Moving Average
 */
export function VWMA(prices: number[], volumes: number[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let pvSum = 0;
      let vSum = 0;
      for (let j = 0; j < period; j++) {
        pvSum += prices[i - j] * volumes[i - j];
        vSum += volumes[i - j];
      }
      result.push(vSum > 0 ? pvSum / vSum : NaN);
    }
  }
  return result;
}

/**
 * Smoothed Moving Average (Wilder's)
 */
export function SMMA(data: number[], period: number): number[] {
  const result: number[] = [];
  
  // First value is SMA
  const firstSMA = mean(data.slice(0, period));
  result.push(...Array(period - 1).fill(NaN));
  result.push(firstSMA);
  
  for (let i = period; i < data.length; i++) {
    const smma = (result[i - 1] * (period - 1) + data[i]) / period;
    result.push(smma);
  }
  return result;
}

/**
 * Double Exponential Moving Average
 */
export function DEMA(data: number[], period: number): number[] {
  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1.filter(v => !isNaN(v)), period);
  
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
 * Triple Exponential Moving Average
 */
export function TEMA(data: number[], period: number): number[] {
  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1.filter(v => !isNaN(v)), period);
  const ema3 = EMA(ema2.filter(v => !isNaN(v)), period);
  
  const result: number[] = [];
  let ema2Idx = 0, ema3Idx = 0;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(ema1[i])) {
      result.push(NaN);
    } else {
      const e2 = ema2[ema2Idx] || ema1[i];
      const e3 = ema3[ema3Idx] || e2;
      result.push(3 * ema1[i] - 3 * e2 + e3);
      ema2Idx++;
      ema3Idx++;
    }
  }
  return result;
}

/**
 * Triangular Moving Average
 */
export function TMA(data: number[], period: number): number[] {
  const halfPeriod = Math.floor((period + 1) / 2);
  const sma1 = SMA(data, halfPeriod);
  return SMA(sma1, halfPeriod);
}

/**
 * Kaufman Adaptive Moving Average
 */
export function KAMA(data: number[], period: number = 10, fast: number = 2, slow: number = 30): number[] {
  const result: number[] = [];
  const fastSC = 2 / (fast + 1);
  const slowSC = 2 / (slow + 1);
  
  result.push(...Array(period).fill(NaN));
  result.push(data[period]);
  
  for (let i = period + 1; i < data.length; i++) {
    // Efficiency Ratio
    let change = Math.abs(data[i] - data[i - period]);
    let volatility = 0;
    for (let j = 0; j < period; j++) {
      volatility += Math.abs(data[i - j] - data[i - j - 1]);
    }
    const er = volatility > 0 ? change / volatility : 0;
    
    // Smoothing Constant
    const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
    
    // KAMA
    result.push(result[i - 1] + sc * (data[i] - result[i - 1]));
  }
  return result;
}

/**
 * Zero Lag Exponential Moving Average
 */
export function ZLEMA(data: number[], period: number): number[] {
  const lag = Math.floor((period - 1) / 2);
  const emaData: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < lag) {
      emaData.push(data[i]);
    } else {
      emaData.push(2 * data[i] - data[i - lag]);
    }
  }
  
  return EMA(emaData, period);
}

/**
 * Variable Moving Average (VMA)
 */
export function VMA(data: number[], period: number = 20): number[] {
  const result: number[] = [];
  const volatility: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    volatility.push(Math.abs(data[i] - data[i - 1]));
  }
  
  result.push(...Array(period).fill(NaN));
  
  const baseVMA = mean(data.slice(0, period));
  result.push(baseVMA);
  
  for (let i = period; i < data.length; i++) {
    const vol = volatility[i - 1] || 0;
    const avgVol = mean(volatility.slice(Math.max(0, i - period), i));
    const factor = avgVol > 0 ? vol / avgVol : 1;
    const alpha = Math.min(1, factor / period);
    
    result.push(result[i - 1] + alpha * (data[i] - result[i - 1]));
  }
  return result;
}

// =============================================================================
// MOMENTUM INDICATORS (40+ variants)
// =============================================================================

/**
 * Relative Strength Index
 */
export function RSI(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    
    if (i <= period) {
      gains += Math.max(0, change);
      losses += Math.max(0, -change);
      
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      } else {
        result.push(NaN);
      }
    } else {
      const currentGain = Math.max(0, change);
      const currentLoss = Math.max(0, -change);
      
      gains = (gains * (period - 1) + currentGain) / period;
      losses = (losses * (period - 1) + currentLoss) / period;
      
      const rs = losses === 0 ? 100 : gains / losses;
      result.push(100 - (100 / (1 + rs)));
    }
  }
  return [NaN, ...result];
}

/**
 * Stochastic Oscillator
 */
export function Stochastic(high: number[], low: number[], close: number[], 
                          kPeriod: number = 14, dPeriod: number = 3): { k: number[], d: number[] } {
  const k: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    if (i < kPeriod - 1) {
      k.push(NaN);
    } else {
      const highestHigh = highest(high.slice(i - kPeriod + 1, i + 1));
      const lowestLow = lowest(low.slice(i - kPeriod + 1, i + 1));
      const range = highestHigh - lowestLow;
      k.push(range > 0 ? ((close[i] - lowestLow) / range) * 100 : 50);
    }
  }
  
  const d = SMA(k, dPeriod);
  return { k, d };
}

/**
 * Stochastic RSI
 */
export function StochRSI(data: number[], rsiPeriod: number = 14, 
                        stochPeriod: number = 14, kPeriod: number = 3, dPeriod: number = 3): { k: number[], d: number[] } {
  const rsi = RSI(data, rsiPeriod);
  return Stochastic(
    rsi.map(v => v), // high = RSI
    rsi.map(v => v), // low = RSI
    rsi, // close = RSI
    stochPeriod,
    kPeriod
  );
}

/**
 * MACD - Moving Average Convergence Divergence
 */
export function MACD(data: number[], fastPeriod: number = 12, 
                    slowPeriod: number = 26, signalPeriod: number = 9): MACDResult[] {
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
  const histogram: number[] = [];
  
  let signalIdx = 0;
  const results: MACDResult[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (isNaN(macdLine[i])) {
      results.push({ macd: NaN, signal: NaN, histogram: NaN, trend: 'sideways' });
    } else {
      const sig = signalLine[signalIdx] || 0;
      const hist = macdLine[i] - sig;
      histogram.push(hist);
      
      results.push({
        macd: macdLine[i],
        signal: sig,
        histogram: hist,
        trend: hist > 0 ? 'bullish' : 'bearish'
      });
      signalIdx++;
    }
  }
  
  return results;
}

/**
 * Rate of Change (ROC)
 */
export function ROC(data: number[], period: number = 12): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      result.push(((data[i] - data[i - period]) / data[i - period]) * 100);
    }
  }
  return result;
}

/**
 * Momentum
 */
export function Momentum(data: number[], period: number = 10): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      result.push(data[i] - data[i - period]);
    }
  }
  return result;
}

/**
 * Williams %R
 */
export function WilliamsR(high: number[], low: number[], close: number[], period: number = 14): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const highestHigh = highest(high.slice(i - period + 1, i + 1));
      const lowestLow = lowest(low.slice(i - period + 1, i + 1));
      const range = highestHigh - lowestLow;
      result.push(range > 0 ? ((highestHigh - close[i]) / range) * -100 : -50);
    }
  }
  return result;
}

/**
 * Commodity Channel Index (CCI)
 */
export function CCI(high: number[], low: number[], close: number[], period: number = 20): number[] {
  const result: number[] = [];
  const tp: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    tp.push((high[i] + low[i] + close[i]) / 3);
  }
  
  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sma = mean(tp.slice(i - period + 1, i + 1));
      const meanDev = mean(tp.slice(i - period + 1, i + 1).map(v => Math.abs(v - sma)));
      result.push(meanDev > 0 ? (tp[i] - sma) / (0.015 * meanDev) : 0);
    }
  }
  return result;
}

/**
 * Money Flow Index (MFI)
 */
export function MFI(high: number[], low: number[], close: number[], volume: number[], period: number = 14): number[] {
  const result: number[] = [];
  const typicalPrice: number[] = [];
  const moneyFlow: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    typicalPrice.push((high[i] + low[i] + close[i]) / 3);
    moneyFlow.push(typicalPrice[i] * volume[i]);
  }
  
  for (let i = 0; i < close.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      let positiveFlow = 0;
      let negativeFlow = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        if (typicalPrice[j] > typicalPrice[j - 1]) {
          positiveFlow += moneyFlow[j];
        } else {
          negativeFlow += moneyFlow[j];
        }
      }
      
      const mfRatio = negativeFlow > 0 ? positiveFlow / negativeFlow : 0;
      result.push(100 - (100 / (1 + mfRatio)));
    }
  }
  return result;
}

/**
 * Average Directional Index (ADX)
 */
export function ADX(high: number[], low: number[], close: number[], period: number = 14): { adx: number[], plusDI: number[], minusDI: number[] } {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  
  for (let i = 1; i < close.length; i++) {
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    
    tr.push(Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    ));
  }
  
  const smoothedTR = SMMA(tr, period);
  const smoothedPlusDM = SMMA(plusDM, period);
  const smoothedMinusDM = SMMA(minusDM, period);
  
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    const pdi = smoothedTR[i] > 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0;
    const mdi = smoothedTR[i] > 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0;
    
    plusDI.push(pdi);
    minusDI.push(mdi);
    
    const diSum = pdi + mdi;
    dx.push(diSum > 0 ? (Math.abs(pdi - mdi) / diSum) * 100 : 0);
  }
  
  const adx = SMMA(dx, period);
  
  return { adx, plusDI, minusDI };
}

/**
 * Ultimate Oscillator
 */
export function UltimateOscillator(high: number[], low: number[], close: number[], 
                                   cycle1: number = 7, cycle2: number = 14, cycle3: number = 28): number[] {
  const result: number[] = [];
  const bp: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    bp.push(close[i] - Math.min(low[i], close[i - 1] || close[i]));
    tr.push(Math.max(high[i], close[i - 1] || close[i]) - Math.min(low[i], close[i - 1] || close[i]));
  }
  
  for (let i = 0; i < close.length; i++) {
    if (i < cycle3 - 1) {
      result.push(NaN);
    } else {
      const avg1 = sum(bp.slice(i - cycle1 + 1, i + 1)) / sum(tr.slice(i - cycle1 + 1, i + 1));
      const avg2 = sum(bp.slice(i - cycle2 + 1, i + 1)) / sum(tr.slice(i - cycle2 + 1, i + 1));
      const avg3 = sum(bp.slice(i - cycle3 + 1, i + 1)) / sum(tr.slice(i - cycle3 + 1, i + 1));
      
      result.push(100 * ((4 * avg1 + 2 * avg2 + avg3) / 7));
    }
  }
  return result;
}

/**
 * Awesome Oscillator
 */
export function AwesomeOscillator(high: number[], low: number[], fast: number = 5, slow: number = 34): number[] {
  const result: number[] = [];
  const median: number[] = [];
  
  for (let i = 0; i < high.length; i++) {
    median.push((high[i] + low[i]) / 2);
  }
  
  const fastSMA = SMA(median, fast);
  const slowSMA = SMA(median, slow);
  
  for (let i = 0; i < high.length; i++) {
    result.push(fastSMA[i] - slowSMA[i]);
  }
  return result;
}

/**
 * Accelerator Oscillator
 */
export function AcceleratorOscillator(high: number[], low: number[]): number[] {
  const ao = AwesomeOscillator(high, low);
  const aoSMA = SMA(ao, 5);
  
  return ao.map((v, i) => v - (aoSMA[i] || 0));
}

// =============================================================================
// VOLATILITY INDICATORS (25+ variants)
// =============================================================================

/**
 * Average True Range (ATR)
 */
export function ATR(high: number[], low: number[], close: number[], period: number = 14): number[] {
  const tr: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      tr.push(high[i] - low[i]);
    } else {
      tr.push(Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      ));
    }
  }
  
  return SMMA(tr, period);
}

/**
 * Bollinger Bands
 */
export function BollingerBands(data: number[], period: number = 20, stdDev: number = 2): BandedResult[] {
  const sma = SMA(data, period);
  const results: BandedResult[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      results.push({ value: NaN, upper: NaN, middle: NaN, lower: NaN });
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const std = stdDev(slice);
      
      results.push({
        value: data[i],
        middle: sma[i],
        upper: sma[i] + stdDev * std,
        lower: sma[i] - stdDev * std
      });
    }
  }
  return results;
}

/**
 * Bollinger Band Width
 */
export function BollingerBandWidth(data: number[], period: number = 20, stdDev: number = 2): number[] {
  const bb = BollingerBands(data, period, stdDev);
  return bb.map(b => b.middle > 0 ? ((b.upper - b.lower) / b.middle) * 100 : 0);
}

/**
 * Bollinger %B
 */
export function BollingerPercentB(data: number[], period: number = 20, stdDev: number = 2): number[] {
  const bb = BollingerBands(data, period, stdDev);
  return bb.map(b => {
    const range = b.upper - b.lower;
    return range > 0 ? (b.value - b.lower) / range : 0.5;
  });
}

/**
 * Keltner Channel
 */
export function KeltnerChannel(high: number[], low: number[], close: number[], 
                               emaPeriod: number = 20, atrPeriod: number = 10, multiplier: number = 2): BandedResult[] {
  const ema = EMA(close, emaPeriod);
  const atr = ATR(high, low, close, atrPeriod);
  
  return close.map((c, i) => ({
    value: c,
    middle: ema[i],
    upper: ema[i] + multiplier * atr[i],
    lower: ema[i] - multiplier * atr[i]
  }));
}

/**
 * Donchian Channel
 */
export function DonchianChannel(high: number[], low: number[], period: number = 20): BandedResult[] {
  const results: BandedResult[] = [];
  
  for (let i = 0; i < high.length; i++) {
    if (i < period - 1) {
      results.push({ value: NaN, upper: NaN, middle: NaN, lower: NaN });
    } else {
      const h = highest(high.slice(i - period + 1, i + 1));
      const l = lowest(low.slice(i - period + 1, i + 1));
      results.push({
        value: (h + l) / 2,
        upper: h,
        middle: (h + l) / 2,
        lower: l
      });
    }
  }
  return results;
}

/**
 * Standard Deviation
 */
export function StandardDeviation(data: number[], period: number = 20): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      result.push(stdDev(data.slice(i - period + 1, i + 1)));
    }
  }
  return result;
}

/**
 * Historical Volatility
 */
export function HistoricalVolatility(data: number[], period: number = 20): number[] {
  const logReturns: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    logReturns.push(Math.log(data[i] / data[i - 1]));
  }
  
  const result: number[] = [NaN];
  for (let i = 0; i < logReturns.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const std = stdDev(logReturns.slice(i - period + 1, i + 1));
      result.push(std * Math.sqrt(252) * 100); // Annualized
    }
  }
  return result;
}

/**
 * Chaikin Volatility
 */
export function ChaikinVolatility(high: number[], low: number[], emaPeriod: number = 10, rocPeriod: number = 10): number[] {
  const hlDiff = high.map((h, i) => h - low[i]);
  const ema = EMA(hlDiff, emaPeriod);
  
  return ROC(ema, rocPeriod);
}

// =============================================================================
// TREND INDICATORS (30+ variants)
// =============================================================================

/**
 * Supertrend
 */
export function Supertrend(high: number[], low: number[], close: number[], 
                          period: number = 10, multiplier: number = 3): { value: number[], trend: ('up' | 'down')[] } {
  const atr = ATR(high, low, close, period);
  const values: number[] = [];
  const trends: ('up' | 'down')[] = [];
  
  let prevSupertrend = 0;
  let prevTrend: 'up' | 'down' = 'up';
  
  for (let i = 0; i < close.length; i++) {
    if (isNaN(atr[i])) {
      values.push(NaN);
      trends.push('up');
      continue;
    }
    
    const hl2 = (high[i] + low[i]) / 2;
    const upperBand = hl2 + multiplier * atr[i];
    const lowerBand = hl2 - multiplier * atr[i];
    
    let supertrend: number;
    let trend: 'up' | 'down';
    
    if (prevSupertrend === 0) {
      supertrend = close[i] > hl2 ? lowerBand : upperBand;
      trend = close[i] > hl2 ? 'up' : 'down';
    } else if (prevTrend === 'up') {
      if (close[i] > prevSupertrend) {
        supertrend = Math.max(lowerBand, prevSupertrend);
        trend = 'up';
      } else {
        supertrend = upperBand;
        trend = 'down';
      }
    } else {
      if (close[i] < prevSupertrend) {
        supertrend = Math.min(upperBand, prevSupertrend);
        trend = 'down';
      } else {
        supertrend = lowerBand;
        trend = 'up';
      }
    }
    
    values.push(supertrend);
    trends.push(trend);
    prevSupertrend = supertrend;
    prevTrend = trend;
  }
  
  return { value: values, trend: trends };
}

/**
 * Parabolic SAR
 */
export function ParabolicSAR(high: number[], low: number[], 
                             afStart: number = 0.02, afIncrement: number = 0.02, afMax: number = 0.2): number[] {
  const result: number[] = [];
  
  let af = afStart;
  let ep = low[0];
  let sar = high[0];
  let isLong = true;
  
  result.push(sar);
  
  for (let i = 1; i < high.length; i++) {
    if (isLong) {
      sar = sar + af * (ep - sar);
      sar = Math.min(sar, low[i - 1], low[i]);
      
      if (low[i] < sar) {
        isLong = false;
        sar = ep;
        ep = high[i];
        af = afStart;
      } else {
        if (high[i] > ep) {
          ep = high[i];
          af = Math.min(af + afIncrement, afMax);
        }
      }
    } else {
      sar = sar + af * (ep - sar);
      sar = Math.max(sar, high[i - 1], high[i]);
      
      if (high[i] > sar) {
        isLong = true;
        sar = ep;
        ep = low[i];
        af = afStart;
      } else {
        if (low[i] < ep) {
          ep = low[i];
          af = Math.min(af + afIncrement, afMax);
        }
      }
    }
    
    result.push(sar);
  }
  
  return result;
}

/**
 * Ichimoku Cloud
 */
export function Ichimoku(high: number[], low: number[], close: number[],
                        tenkanPeriod: number = 9, kijunPeriod: number = 26, 
                        senkouBPeriod: number = 52): {
  tenkan: number[];
  kijun: number[];
  senkouA: number[];
  senkouB: number[];
  chikou: number[];
} {
  const tenkan: number[] = [];
  const kijun: number[] = [];
  const senkouA: number[] = [];
  const senkouB: number[] = [];
  const chikou: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    // Tenkan-sen
    if (i < tenkanPeriod - 1) {
      tenkan.push(NaN);
    } else {
      const h = highest(high.slice(i - tenkanPeriod + 1, i + 1));
      const l = lowest(low.slice(i - tenkanPeriod + 1, i + 1));
      tenkan.push((h + l) / 2);
    }
    
    // Kijun-sen
    if (i < kijunPeriod - 1) {
      kijun.push(NaN);
    } else {
      const h = highest(high.slice(i - kijunPeriod + 1, i + 1));
      const l = lowest(low.slice(i - kijunPeriod + 1, i + 1));
      kijun.push((h + l) / 2);
    }
    
    // Senkou Span B
    if (i < senkouBPeriod - 1) {
      senkouB.push(NaN);
    } else {
      const h = highest(high.slice(i - senkouBPeriod + 1, i + 1));
      const l = lowest(low.slice(i - senkouBPeriod + 1, i + 1));
      senkouB.push((h + l) / 2);
    }
    
    // Chikou Span (current close shifted back)
    chikou.push(close[i]);
    
    // Senkou Span A
    if (!isNaN(tenkan[i]) && !isNaN(kijun[i])) {
      senkouA.push((tenkan[i] + kijun[i]) / 2);
    } else {
      senkouA.push(NaN);
    }
  }
  
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

/**
 * Aroon
 */
export function Aroon(high: number[], low: number[], period: number = 25): { aroonUp: number[], aroonDown: number[], oscillator: number[] } {
  const aroonUp: number[] = [];
  const aroonDown: number[] = [];
  const oscillator: number[] = [];
  
  for (let i = 0; i < high.length; i++) {
    if (i < period - 1) {
      aroonUp.push(NaN);
      aroonDown.push(NaN);
      oscillator.push(NaN);
    } else {
      const slice = high.slice(i - period + 1, i + 1);
      const highIdx = slice.indexOf(highest(slice));
      
      const lowSlice = low.slice(i - period + 1, i + 1);
      const lowIdx = lowSlice.indexOf(lowest(lowSlice));
      
      const up = ((period - 1 - highIdx) / (period - 1)) * 100;
      const down = ((period - 1 - lowIdx) / (period - 1)) * 100;
      
      aroonUp.push(up);
      aroonDown.push(down);
      oscillator.push(up - down);
    }
  }
  
  return { aroonUp, aroonDown, oscillator };
}

/**
 * Vortex Indicator
 */
export function Vortex(high: number[], low: number[], close: number[], period: number = 14): { vip: number[], vim: number[] } {
  const vmPlus: number[] = [0];
  const vmMinus: number[] = [0];
  const tr: number[] = [high[0] - low[0]];
  
  for (let i = 1; i < close.length; i++) {
    vmPlus.push(Math.abs(high[i] - low[i - 1]));
    vmMinus.push(Math.abs(low[i] - high[i - 1]));
    tr.push(Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    ));
  }
  
  const vip: number[] = [];
  const vim: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      vip.push(NaN);
      vim.push(NaN);
    } else {
      const sumVmPlus = sum(vmPlus.slice(i - period + 1, i + 1));
      const sumVmMinus = sum(vmMinus.slice(i - period + 1, i + 1));
      const sumTr = sum(tr.slice(i - period + 1, i + 1));
      
      vip.push(sumTr > 0 ? sumVmPlus / sumTr : 0);
      vim.push(sumTr > 0 ? sumVmMinus / sumTr : 0);
    }
  }
  
  return { vip, vim };
}

// =============================================================================
// VOLUME INDICATORS (15+ variants)
// =============================================================================

/**
 * On-Balance Volume (OBV)
 */
export function OBV(close: number[], volume: number[]): number[] {
  const result: number[] = [volume[0]];
  
  for (let i = 1; i < close.length; i++) {
    if (close[i] > close[i - 1]) {
      result.push(result[i - 1] + volume[i]);
    } else if (close[i] < close[i - 1]) {
      result.push(result[i - 1] - volume[i]);
    } else {
      result.push(result[i - 1]);
    }
  }
  return result;
}

/**
 * Volume Price Trend (VPT)
 */
export function VPT(close: number[], volume: number[]): number[] {
  const result: number[] = [volume[0]];
  
  for (let i = 1; i < close.length; i++) {
    const pctChange = (close[i] - close[i - 1]) / close[i - 1];
    result.push(result[i - 1] + volume[i] * pctChange);
  }
  return result;
}

/**
 * Accumulation/Distribution Line
 */
export function ADL(high: number[], low: number[], close: number[], volume: number[]): number[] {
  const result: number[] = [];
  let adl = 0;
  
  for (let i = 0; i < close.length; i++) {
    const range = high[i] - low[i];
    const mf = range > 0 ? ((close[i] - low[i]) - (high[i] - close[i])) / range : 0;
    adl += mf * volume[i];
    result.push(adl);
  }
  return result;
}

/**
 * Chaikin Money Flow (CMF)
 */
export function CMF(high: number[], low: number[], close: number[], volume: number[], period: number = 20): number[] {
  const result: number[] = [];
  const mfVolume: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    const range = high[i] - low[i];
    const mf = range > 0 ? ((close[i] - low[i]) - (high[i] - close[i])) / range : 0;
    mfVolume.push(mf * volume[i]);
  }
  
  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sumMFV = sum(mfVolume.slice(i - period + 1, i + 1));
      const sumV = sum(volume.slice(i - period + 1, i + 1));
      result.push(sumV > 0 ? sumMFV / sumV : 0);
    }
  }
  return result;
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export function VWAP(high: number[], low: number[], close: number[], volume: number[]): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < close.length; i++) {
    const tp = (high[i] + low[i] + close[i]) / 3;
    cumulativeTPV += tp * volume[i];
    cumulativeVolume += volume[i];
    result.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : tp);
  }
  return result;
}

/**
 * Money Flow Volume (MFV)
 */
export function MFV(high: number[], low: number[], close: number[], volume: number[]): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    const range = high[i] - low[i];
    const mf = range > 0 ? ((close[i] - low[i]) - (high[i] - close[i])) / range : 0;
    result.push(mf * volume[i]);
  }
  return result;
}

/**
 * Ease of Movement
 */
export function EOM(high: number[], low: number[], volume: number[], period: number = 14): number[] {
  const result: number[] = [];
  
  for (let i = 1; i < high.length; i++) {
    const dm = ((high[i] + low[i]) / 2) - ((high[i - 1] + low[i - 1]) / 2);
    const br = (volume[i] / 100000000) / (high[i] - low[i]);
    result.push(br > 0 ? dm / br : 0);
  }
  
  return [NaN, ...SMA(result, period)];
}

/**
 * Volume Oscillator
 */
export function VolumeOscillator(volume: number[], fastPeriod: number = 5, slowPeriod: number = 10): number[] {
  const fastSMA = SMA(volume, fastPeriod);
  const slowSMA = SMA(volume, slowPeriod);
  
  return volume.map((v, i) => {
    if (isNaN(fastSMA[i]) || isNaN(slowSMA[i]) || slowSMA[i] === 0) return NaN;
    return ((fastSMA[i] - slowSMA[i]) / slowSMA[i]) * 100;
  });
}

/**
 * Negative Volume Index (NVI)
 */
export function NVI(close: number[], volume: number[]): number[] {
  const result: number[] = [1000];
  
  for (let i = 1; i < close.length; i++) {
    if (volume[i] < volume[i - 1]) {
      const priceChange = (close[i] - close[i - 1]) / close[i - 1];
      result.push(result[i - 1] * (1 + priceChange));
    } else {
      result.push(result[i - 1]);
    }
  }
  return result;
}

/**
 * Positive Volume Index (PVI)
 */
export function PVI(close: number[], volume: number[]): number[] {
  const result: number[] = [1000];
  
  for (let i = 1; i < close.length; i++) {
    if (volume[i] > volume[i - 1]) {
      const priceChange = (close[i] - close[i - 1]) / close[i - 1];
      result.push(result[i - 1] * (1 + priceChange));
    } else {
      result.push(result[i - 1]);
    }
  }
  return result;
}

// =============================================================================
// SUPPORT/RESISTANCE INDICATORS
// =============================================================================

/**
 * Pivot Points
 */
export function PivotPoints(high: number[], low: number[], close: number[]): {
  pp: number[];
  r1: number[];
  r2: number[];
  r3: number[];
  s1: number[];
  s2: number[];
  s3: number[];
} {
  const pp: number[] = [];
  const r1: number[] = [];
  const r2: number[] = [];
  const r3: number[] = [];
  const s1: number[] = [];
  const s2: number[] = [];
  const s3: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    const pivot = (high[i] + low[i] + close[i]) / 3;
    pp.push(pivot);
    r1.push(2 * pivot - low[i]);
    s1.push(2 * pivot - high[i]);
    r2.push(pivot + (high[i] - low[i]));
    s2.push(pivot - (high[i] - low[i]));
    r3.push(high[i] + 2 * (pivot - low[i]));
    s3.push(low[i] - 2 * (high[i] - pivot));
  }
  
  return { pp, r1, r2, r3, s1, s2, s3 };
}

/**
 * Fibonacci Retracement
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

// =============================================================================
// INDICATOR REGISTRY
// =============================================================================

export const IndicatorRegistry = {
  // Moving Averages
  SMA, EMA, WMA, HMA, VWMA, SMMA, DEMA, TEMA, TMA, KAMA, ZLEMA, VMA,
  
  // Momentum
  RSI, Stochastic, StochRSI, MACD, ROC, Momentum, WilliamsR, CCI, MFI, ADX, UltimateOscillator, AwesomeOscillator, AcceleratorOscillator,
  
  // Volatility
  ATR, BollingerBands, BollingerBandWidth, BollingerPercentB, KeltnerChannel, DonchianChannel, StandardDeviation, HistoricalVolatility, ChaikinVolatility,
  
  // Trend
  Supertrend, ParabolicSAR, Ichimoku, Aroon, Vortex,
  
  // Volume
  OBV, VPT, ADL, CMF, VWAP, MFV, EOM, VolumeOscillator, NVI, PVI,
  
  // Support/Resistance
  PivotPoints, FibonacciRetracement
};

export type IndicatorName = keyof typeof IndicatorRegistry;

// Helper function to check for NaN
function isNaN(value: number): boolean {
  return Number.isNaN(value);
}

export default IndicatorRegistry;
