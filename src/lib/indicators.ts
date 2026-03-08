/**
 * Technical Indicators Library for BB Bot
 * Implements: Double Bollinger Bands, Slow Stochastic, Moving Averages (EMA, SMA, SMMA)
 */

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timestamp?: number;
}

export interface BollingerBandsResult {
  middle: number;
  innerUpper: number;
  innerLower: number;
  outerUpper: number;
  outerLower: number;
  bandwidth: number;
  percentB: number;
}

export interface StochasticResult {
  k: number;
  d: number;
  isOverbought: boolean;
  isOversold: boolean;
}

export interface MAResult {
  ema: number | null;
  sma: number | null;
  smma: number | null;
}

export type PriceSource = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';

/**
 * Get price from candle based on source type
 */
export function getPrice(candle: Candle, source: PriceSource): number {
  switch (source) {
    case 'close':
      return candle.close;
    case 'open':
      return candle.open;
    case 'high':
      return candle.high;
    case 'low':
      return candle.low;
    case 'hl2':
      return (candle.high + candle.low) / 2;
    case 'hlc3':
      return (candle.high + candle.low + candle.close) / 3;
    default:
      return candle.close;
  }
}

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  
  const slice = data.slice(-period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return sum / period;
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  
  // Start with SMA for the first EMA value
  let ema = data.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
  
  // Calculate EMA for remaining data points
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Smoothed Moving Average (SMMA / RMA)
 * Also known as Running Moving Average or Welles Wilder's Moving Average
 */
export function calculateSMMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  
  // First value is SMA
  let smma = data.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
  
  // Subsequent values
  for (let i = period; i < data.length; i++) {
    smma = (smma * (period - 1) + data[i]) / period;
  }
  
  return smma;
}

/**
 * Standard Deviation
 */
export function calculateStdDev(data: number[], period: number): number | null {
  if (data.length < period) return null;
  
  const slice = data.slice(-period);
  const mean = slice.reduce((acc, val) => acc + val, 0) / period;
  const squaredDiffs = slice.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
  
  return Math.sqrt(variance);
}

/**
 * Double Bollinger Bands
 * Inner bands: 1 standard deviation
 * Outer bands: 2 standard deviations
 */
export function calculateBollingerBands(
  candles: Candle[],
  innerPeriod: number = 20,
  innerDeviation: number = 1.0,
  outerPeriod: number = 20,
  outerDeviation: number = 2.0,
  source: PriceSource = 'close'
): BollingerBandsResult | null {
  if (candles.length < Math.max(innerPeriod, outerPeriod)) return null;
  
  const prices = candles.map(c => getPrice(c, source));
  const close = prices[prices.length - 1];
  
  // Inner Bollinger Bands
  const innerMiddle = calculateSMA(prices, innerPeriod);
  const innerStdDev = calculateStdDev(prices, innerPeriod);
  
  // Outer Bollinger Bands
  const outerMiddle = calculateSMA(prices, outerPeriod);
  const outerStdDev = calculateStdDev(prices, outerPeriod);
  
  if (innerMiddle === null || innerStdDev === null || 
      outerMiddle === null || outerStdDev === null) {
    return null;
  }
  
  const innerUpper = innerMiddle + innerStdDev * innerDeviation;
  const innerLower = innerMiddle - innerStdDev * innerDeviation;
  const outerUpper = outerMiddle + outerStdDev * outerDeviation;
  const outerLower = outerMiddle - outerStdDev * outerDeviation;
  
  // Bandwidth = (Upper - Lower) / Middle * 100
  const bandwidth = ((outerUpper - outerLower) / outerMiddle) * 100;
  
  // %B = (Close - Lower) / (Upper - Lower)
  const percentB = (close - outerLower) / (outerUpper - outerLower);
  
  return {
    middle: outerMiddle,
    innerUpper,
    innerLower,
    outerUpper,
    outerLower,
    bandwidth,
    percentB
  };
}

/**
 * Slow Stochastic Oscillator
 * %K = (Current Close - Lowest Low) / (Highest High - Lowest Low) * 100
 * %D = SMA of %K (signal line)
 * Slow Stochastic = SMA of Fast %K, then %D of Slow %K
 */
export function calculateStochastic(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  slowing: number = 3,
  overbought: number = 80,
  oversold: number = 20
): StochasticResult | null {
  if (candles.length < kPeriod + slowing + dPeriod) return null;
  
  // Calculate Fast %K values
  const fastKValues: number[] = [];
  
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice.map(c => c.high));
    const lowestLow = Math.min(...slice.map(c => c.low));
    const close = candles[i].close;
    
    const range = highestHigh - lowestLow;
    const fastK = range === 0 ? 50 : ((close - lowestLow) / range) * 100;
    fastKValues.push(fastK);
  }
  
  // Apply slowing (SMA of Fast %K to get Slow %K)
  const slowKValues: number[] = [];
  for (let i = slowing - 1; i < fastKValues.length; i++) {
    const slice = fastKValues.slice(i - slowing + 1, i + 1);
    const slowK = slice.reduce((acc, val) => acc + val, 0) / slowing;
    slowKValues.push(slowK);
  }
  
  if (slowKValues.length < dPeriod) return null;
  
  // Calculate %D (SMA of Slow %K)
  const lastSlowKValues = slowKValues.slice(-dPeriod);
  const d = lastSlowKValues.reduce((acc, val) => acc + val, 0) / dPeriod;
  const k = slowKValues[slowKValues.length - 1];
  
  return {
    k,
    d,
    isOverbought: k >= overbought,
    isOversold: k <= oversold
  };
}

/**
 * Calculate all Moving Averages
 */
export function calculateMovingAverages(
  candles: Candle[],
  emaEnabled: boolean = false,
  emaPeriod: number = 20,
  emaSource: PriceSource = 'close',
  smaEnabled: boolean = false,
  smaPeriod: number = 50,
  smaSource: PriceSource = 'close',
  smmaEnabled: boolean = false,
  smmaPeriod: number = 20,
  smmaSource: PriceSource = 'close'
): MAResult {
  const result: MAResult = {
    ema: null,
    sma: null,
    smma: null
  };
  
  const prices = candles.map(c => c.close); // Default prices
  
  if (emaEnabled) {
    const emaPrices = candles.map(c => getPrice(c, emaSource));
    result.ema = calculateEMA(emaPrices, emaPeriod);
  }
  
  if (smaEnabled) {
    const smaPrices = candles.map(c => getPrice(c, smaSource));
    result.sma = calculateSMA(smaPrices, smaPeriod);
  }
  
  if (smmaEnabled) {
    const smmaPrices = candles.map(c => getPrice(c, smmaSource));
    result.smma = calculateSMMA(smmaPrices, smmaPeriod);
  }
  
  return result;
}

/**
 * Complete indicator calculation for a timeframe
 */
export interface IndicatorResult {
  bollingerBands: BollingerBandsResult | null;
  stochastic: StochasticResult | null;
  movingAverages: MAResult;
  timestamp: number;
}

export function calculateAllIndicators(
  candles: Candle[],
  config: {
    // Bollinger Bands
    bbEnabled: boolean;
    bbInnerPeriod: number;
    bbInnerDeviation: number;
    bbOuterPeriod: number;
    bbOuterDeviation: number;
    bbSource: PriceSource;
    // Stochastic
    stochEnabled: boolean;
    stochKPeriod: number;
    stochDPeriod: number;
    stochSlowing: number;
    stochOverbought: number;
    stochOversold: number;
    // Moving Averages
    emaEnabled: boolean;
    emaPeriod: number;
    emaSource: PriceSource;
    smaEnabled: boolean;
    smaPeriod: number;
    smaSource: PriceSource;
    smmaEnabled: boolean;
    smmaPeriod: number;
    smmaSource: PriceSource;
  }
): IndicatorResult {
  const result: IndicatorResult = {
    bollingerBands: null,
    stochastic: null,
    movingAverages: { ema: null, sma: null, smma: null },
    timestamp: Date.now()
  };
  
  // Calculate Bollinger Bands
  if (config.bbEnabled) {
    result.bollingerBands = calculateBollingerBands(
      candles,
      config.bbInnerPeriod,
      config.bbInnerDeviation,
      config.bbOuterPeriod,
      config.bbOuterDeviation,
      config.bbSource
    );
  }
  
  // Calculate Stochastic
  if (config.stochEnabled) {
    result.stochastic = calculateStochastic(
      candles,
      config.stochKPeriod,
      config.stochDPeriod,
      config.stochSlowing,
      config.stochOverbought,
      config.stochOversold
    );
  }
  
  // Calculate Moving Averages
  result.movingAverages = calculateMovingAverages(
    candles,
    config.emaEnabled,
    config.emaPeriod,
    config.emaSource,
    config.smaEnabled,
    config.smaPeriod,
    config.smaSource,
    config.smmaEnabled,
    config.smmaPeriod,
    config.smmaSource
  );
  
  return result;
}

/**
 * Format indicator values for display
 */
export function formatIndicatorValues(result: IndicatorResult): {
  bb: string;
  stoch: string;
  ma: string;
} {
  let bbStr = '--';
  let stoch = '--';
  let ma = '--';
  
  if (result.bollingerBands) {
    const bb = result.bollingerBands;
    bbStr = `M: ${bb.middle.toFixed(2)} | Upper: ${bb.outerUpper.toFixed(2)} | Lower: ${bb.outerLower.toFixed(2)} | %B: ${(bb.percentB * 100).toFixed(1)}%`;
  }
  
  if (result.stochastic) {
    stoch = `K: ${result.stochastic.k.toFixed(2)} | D: ${result.stochastic.d.toFixed(2)}`;
    if (result.stochastic.isOverbought) stoch += ' | Overbought';
    if (result.stochastic.isOversold) stoch += ' | Oversold';
  }
  
  const maParts: string[] = [];
  if (result.movingAverages.ema !== null) {
    maParts.push(`EMA: ${result.movingAverages.ema.toFixed(2)}`);
  }
  if (result.movingAverages.sma !== null) {
    maParts.push(`SMA: ${result.movingAverages.sma.toFixed(2)}`);
  }
  if (result.movingAverages.smma !== null) {
    maParts.push(`SMMA: ${result.movingAverages.smma.toFixed(2)}`);
  }
  if (maParts.length > 0) {
    ma = maParts.join(' | ');
  }
  
  return { bb: bbStr, stoch, ma };
}
