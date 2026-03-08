/**
 * Lawrence Classifier
 * 
 * Converted from Pine Script MLExtensions library to TypeScript.
 * Implements Approximate Nearest Neighbors in Lorentzian Space for
 * market direction classification with confidence calibration.
 * 
 * @see https://www.tradingview.com/script/I6aMjDjh-ML-Extensions-Lorentzian-Classification/
 */

// ==================== TYPE DEFINITIONS ====================

export interface LawrenceFeatures {
  indicators: {
    rsi?: number;
    macd?: number;
    ema20?: number;
    ema50?: number;
    atr?: number;
    volumeRatio?: number;
  };
  context: {
    trend: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING';
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    volume: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  signal: {
    direction: 'LONG' | 'SHORT';
    symbol: string;
    timeframe: string;
    entryPrice: number;
  };
  time: {
    hour: number;
    dayOfWeek: number;
    isSessionOverlap: boolean;
  };
}

export interface LawrenceResult {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  probability: number;  // 0-1
  confidence: number;   // 0-1
  features: Record<string, number>;
}

export interface TrainingSample {
  features: Record<string, number>;
  label: 'LONG' | 'SHORT' | 'NEUTRAL';
  weight: number;
  timestamp: number;
}

export interface ClassifierStats {
  totalSamples: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  avgConfidence: number;
  winRate: number;
  lastUpdated: number;
}

export interface FilterSettings {
  useVolatilityFilter: boolean;
  useRegimeFilter: boolean;
  useAdxFilter: boolean;
  regimeThreshold: number;
  adxThreshold: number;
  volatilityThreshold: number;
}

export interface MLExtensionsConfig {
  lookbackWindow: number;
  maxBarsBackIndex: number;
  featureCount: number;
  neighborCount: number;
  filterSettings: FilterSettings;
}

// ==================== ML EXTENSIONS - CORE FUNCTIONS ====================

/**
 * Normalized Derivative with Quadratic Mean
 * 
 * Calculates the normalized derivative of a series, measuring the rate of change
 * relative to the quadratic mean of recent values.
 * 
 * @param src - Source values array
 * @param period - Lookback period for quadratic mean calculation
 * @param index - Current index in the array (defaults to last element)
 * @returns Normalized derivative value between -1 and 1
 */
export function normalizeDeriv(src: number[], period: number, index?: number): number {
  if (src.length < period + 1) return 0;
  
  const i = index !== undefined ? index : src.length - 1;
  if (i < period) return 0;
  
  // Calculate derivative (price change)
  const derivative = src[i] - src[i - 1];
  
  // Calculate quadratic mean (RMS) over the period
  let sumSquares = 0;
  for (let j = i - period + 1; j <= i; j++) {
    sumSquares += Math.pow(src[j] - src[j - 1], 2);
  }
  const quadraticMean = Math.sqrt(sumSquares / period);
  
  // Normalize derivative
  if (quadraticMean === 0) return 0;
  return Math.max(-1, Math.min(1, derivative / quadraticMean));
}

/**
 * Normalize a value to a bounded range [0, 1]
 * 
 * Rescales a value from its natural range to a bounded 0-1 range using
 * a sigmoid-like transformation.
 * 
 * @param value - The value to normalize
 * @param range - The expected range of the input values
 * @returns Normalized value between 0 and 1
 */
export function normalize(value: number, range: number): number {
  if (range === 0) return 0.5;
  const normalized = value / range;
  // Sigmoid-like transformation to bound between 0 and 1
  return 1 / (1 + Math.exp(-2 * normalized));
}

/**
 * Rescale a value from one range to another
 * 
 * @param value - The value to rescale
 * @param fromMin - Minimum of source range
 * @param fromMax - Maximum of source range
 * @param toMin - Minimum of target range
 * @param toMax - Maximum of target range
 * @returns Rescaled value
 */
export function rescale(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
): number {
  if (fromMax === fromMin) return toMin;
  return toMin + (value - fromMin) * (toMax - toMin) / (fromMax - fromMin);
}

/**
 * Hyperbolic Tangent
 * 
 * Smooth activation function that bounds output between -1 and 1.
 * Used for smoothing and normalizing indicator values.
 * 
 * @param value - Input value
 * @returns Value between -1 and 1
 */
export function tanh(value: number): number {
  if (value > 20) return 1;
  if (value < -20) return -1;
  const exp2x = Math.exp(2 * value);
  return (exp2x - 1) / (exp2x + 1);
}

/**
 * Dual Pole Filter
 * 
 * A second-order low-pass filter that provides smooth output with minimal lag.
 * Implements a two-pole recursive filter for enhanced smoothing.
 * 
 * @param src - Source values array
 * @param period - Filter period (controls smoothness)
 * @param index - Current index (defaults to last)
 * @param prevValue1 - Previous filter output (for stateful calculation)
 * @param prevValue2 - Second previous filter output
 * @returns Filtered value
 */
export function dualPoleFilter(
  src: number[],
  period: number,
  index?: number,
  prevValue1?: number,
  prevValue2?: number
): number {
  if (src.length === 0) return 0;
  
  const i = index !== undefined ? index : src.length - 1;
  if (i < 0) return src[0];
  
  // Calculate omega (angular frequency)
  const omega = Math.PI * Math.sqrt(2) / period;
  const alpha = Math.sin(omega) / (2 * 0.707); // 0.707 is Q factor for Butterworth
  
  // Coefficients for second-order filter
  const b0 = (1 - Math.cos(omega)) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(omega);
  const a2 = 1 - alpha;
  
  // Normalize coefficients
  const normB0 = b0 / a0;
  const normA1 = a1 / a0;
  const normA2 = a2 / a0;
  
  // For stateless calculation, use simple EMA approximation
  if (prevValue1 === undefined || prevValue2 === undefined) {
    // Fallback to simple smoothing if no state provided
    const multiplier = 2 / (period + 1);
    let filtered = src[0];
    for (let j = 1; j <= i; j++) {
      filtered = (src[j] - filtered) * multiplier + filtered;
    }
    return filtered;
  }
  
  // Apply second-order recursive filter
  return normB0 * src[i] + normB0 * (src[i - 1] || src[i]) 
    - normA1 * prevValue1 - normA2 * prevValue2;
}

/**
 * Tanh Transform
 * 
 * Applies hyperbolic tangent transformation to smooth extreme values
 * while preserving directional information.
 * 
 * @param src - Source values array
 * @param smoothness - Smoothing factor (higher = smoother)
 * @param index - Current index (defaults to last)
 * @returns Transformed value
 */
export function tanhTransform(
  src: number[],
  smoothness: number = 0.5,
  index?: number
): number {
  if (src.length < 2) return 0;
  
  const i = index !== undefined ? index : src.length - 1;
  if (i < 1) return 0;
  
  // Calculate rate of change
  const roc = src[i] - src[i - 1];
  
  // Apply tanh with smoothing
  const transformed = tanh(roc * smoothness);
  
  return transformed;
}

// ==================== NORMALIZED INDICATORS ====================

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSIInternal(prices: number[], period: number): number[] {
  if (prices.length < period + 1) return [];
  
  const result: number[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  
  // First calculation uses SMA
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  
  // First RSI value
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + firstRS));
  
  // Subsequent values use EMA
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  
  return result;
}

/**
 * Normalized RSI
 * 
 * Calculates RSI and normalizes it to a 0-1 range using tanh transform.
 * 
 * @param src - Source prices array
 * @param period - RSI period (default 14)
 * @param index - Current index (defaults to last)
 * @returns Normalized RSI value between 0 and 1
 */
export function n_rsi(src: number[], period: number = 14, index?: number): number {
  const rsiValues = calculateRSIInternal(src, period);
  if (rsiValues.length === 0) return 0.5;
  
  const i = index !== undefined ? index : rsiValues.length - 1;
  const rsi = rsiValues[Math.min(i, rsiValues.length - 1)];
  
  // Normalize RSI from 0-100 range to -1 to 1, then apply sigmoid
  const centered = (rsi - 50) / 50; // -1 to 1
  return normalize(centered, 1); // 0 to 1
}

/**
 * Calculate CCI (Commodity Channel Index)
 */
function calculateCCIInternal(
  high: number[],
  low: number[],
  close: number[],
  period: number
): number[] {
  if (close.length < period) return [];
  
  const result: number[] = [];
  
  for (let i = period - 1; i < close.length; i++) {
    // Calculate typical price
    const tpSlice: number[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      tpSlice.push((high[j] + low[j] + close[j]) / 3);
    }
    
    const sma = tpSlice.reduce((a, b) => a + b, 0) / period;
    
    // Mean deviation
    const meanDev = tpSlice.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;
    
    const currentTP = tpSlice[tpSlice.length - 1];
    const cci = meanDev === 0 ? 0 : (currentTP - sma) / (0.015 * meanDev);
    result.push(cci);
  }
  
  return result;
}

/**
 * Normalized CCI
 * 
 * Calculates CCI and normalizes it using tanh transform.
 * 
 * @param high - High prices array
 * @param low - Low prices array
 * @param close - Close prices array
 * @param period - CCI period (default 20)
 * @param index - Current index (defaults to last)
 * @returns Normalized CCI value between 0 and 1
 */
export function n_cci(
  high: number[],
  low: number[],
  close: number[],
  period: number = 20,
  index?: number
): number {
  const cciValues = calculateCCIInternal(high, low, close, period);
  if (cciValues.length === 0) return 0.5;
  
  const i = index !== undefined ? index : cciValues.length - 1;
  const cci = cciValues[Math.min(i, cciValues.length - 1)];
  
  // Normalize CCI using tanh (CCI typically ranges from -200 to +200)
  return normalize(tanh(cci / 100), 1);
}

/**
 * Normalized WaveTrend
 * 
 * Calculates WaveTrend oscillator and normalizes it.
 * WaveTrend is similar to a smoothed CCI with an additional signal line.
 * 
 * @param high - High prices array
 * @param low - Low prices array
 * @param close - Close prices array
 * @param channelPeriod - Channel period (default 10)
 * @param avgPeriod - Average period (default 21)
 * @param index - Current index (defaults to last)
 * @returns Normalized WaveTrend value between 0 and 1
 */
export function n_wt(
  high: number[],
  low: number[],
  close: number[],
  channelPeriod: number = 10,
  avgPeriod: number = 21,
  index?: number
): number {
  if (close.length < avgPeriod + channelPeriod) return 0.5;
  
  // Calculate typical price
  const hlc3: number[] = [];
  for (let i = 0; i < close.length; i++) {
    hlc3.push((high[i] + low[i] + close[i]) / 3);
  }
  
  // Calculate EMA of HLC3
  const esa: number[] = [];
  const multiplier = 2 / (channelPeriod + 1);
  esa.push(hlc3[0]);
  for (let i = 1; i < hlc3.length; i++) {
    esa.push((hlc3[i] - esa[i - 1]) * multiplier + esa[i - 1]);
  }
  
  // Calculate absolute deviation
  const absDev: number[] = [];
  for (let i = 0; i < hlc3.length; i++) {
    absDev.push(Math.abs(hlc3[i] - esa[i]));
  }
  
  // EMA of absolute deviation
  const d: number[] = [];
  const dMultiplier = 2 / (channelPeriod + 1);
  d.push(absDev[0]);
  for (let i = 1; i < absDev.length; i++) {
    d.push((absDev[i] - d[i - 1]) * dMultiplier + d[i - 1]);
  }
  
  // Calculate CI (Commodity Index)
  const ci: number[] = [];
  for (let i = 0; i < hlc3.length; i++) {
    if (d[i] === 0) ci.push(0);
    else ci.push((hlc3[i] - esa[i]) / (0.015 * d[i]));
  }
  
  // WaveTrend = EMA of CI
  const wt: number[] = [];
  const wtMultiplier = 2 / (avgPeriod + 1);
  wt.push(ci[0]);
  for (let i = 1; i < ci.length; i++) {
    wt.push((ci[i] - wt[i - 1]) * wtMultiplier + wt[i - 1]);
  }
  
  const i = index !== undefined ? index : wt.length - 1;
  const waveTrend = wt[Math.min(i, wt.length - 1)];
  
  // Normalize WaveTrend
  return normalize(tanh(waveTrend / 60), 1);
}

/**
 * Calculate ADX (Average Directional Index)
 */
function calculateADXInternal(
  high: number[],
  low: number[],
  close: number[],
  period: number
): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  if (close.length < period * 2) return { adx: [], plusDI: [], minusDI: [] };
  
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  // Calculate True Range and Directional Movement
  for (let i = 1; i < close.length; i++) {
    const highLow = high[i] - low[i];
    const highClose = Math.abs(high[i] - close[i - 1]);
    const lowClose = Math.abs(low[i] - close[i - 1]);
    tr.push(Math.max(highLow, highClose, lowClose));
    
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Smooth values using RMA (Wilder's smoothing)
  const smoothTR: number[] = [];
  const smoothPlusDM: number[] = [];
  const smoothMinusDM: number[] = [];
  
  // Initial SMA
  let trSum = 0, plusDMSum = 0, minusDMSum = 0;
  for (let i = 0; i < period; i++) {
    trSum += tr[i];
    plusDMSum += plusDM[i];
    minusDMSum += minusDM[i];
  }
  
  smoothTR.push(trSum / period);
  smoothPlusDM.push(plusDMSum / period);
  smoothMinusDM.push(minusDMSum / period);
  
  // RMA smoothing
  for (let i = period; i < tr.length; i++) {
    smoothTR.push((smoothTR[smoothTR.length - 1] * (period - 1) + tr[i]) / period);
    smoothPlusDM.push((smoothPlusDM[smoothPlusDM.length - 1] * (period - 1) + plusDM[i]) / period);
    smoothMinusDM.push((smoothMinusDM[smoothMinusDM.length - 1] * (period - 1) + minusDM[i]) / period);
  }
  
  // Calculate DI and DX
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];
  
  for (let i = 0; i < smoothTR.length; i++) {
    const pdi = smoothTR[i] === 0 ? 0 : (smoothPlusDM[i] / smoothTR[i]) * 100;
    const mdi = smoothTR[i] === 0 ? 0 : (smoothMinusDM[i] / smoothTR[i]) * 100;
    plusDI.push(pdi);
    minusDI.push(mdi);
    
    const diSum = pdi + mdi;
    dx.push(diSum === 0 ? 0 : (Math.abs(pdi - mdi) / diSum) * 100);
  }
  
  // ADX = smoothed DX
  const adx: number[] = [];
  let dxSum = 0;
  for (let i = 0; i < period; i++) {
    dxSum += dx[i];
  }
  adx.push(dxSum / period);
  
  for (let i = period; i < dx.length; i++) {
    adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
  }
  
  return { adx, plusDI, minusDI };
}

/**
 * Normalized ADX
 * 
 * Calculates ADX and normalizes it to 0-1 range.
 * 
 * @param high - High prices array
 * @param low - Low prices array
 * @param close - Close prices array
 * @param period - ADX period (default 14)
 * @param index - Current index (defaults to last)
 * @returns Normalized ADX value between 0 and 1
 */
export function n_adx(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14,
  index?: number
): number {
  const { adx } = calculateADXInternal(high, low, close, period);
  if (adx.length === 0) return 0.5;
  
  const i = index !== undefined ? index : adx.length - 1;
  const adxValue = adx[Math.min(i, adx.length - 1)];
  
  // Normalize ADX (typically 0-100, but rarely above 60)
  return Math.min(1, adxValue / 60);
}

// ==================== FILTERS ====================

/**
 * Regime Filter
 * 
 * Detects market regime (trending vs ranging) based on price action.
 * Returns true when market is in a trending regime.
 * 
 * @param src - Source prices array
 * @param threshold - Regime threshold (default 0.5)
 * @param index - Current index (defaults to last)
 * @returns Whether the market is in trending regime
 */
export function regime_filter(
  src: number[],
  threshold: number = 0.5,
  index?: number
): boolean {
  if (src.length < 20) return false;
  
  const i = index !== undefined ? index : src.length - 1;
  if (i < 20) return false;
  
  // Calculate efficiency ratio (trend efficiency)
  let sumChange = 0;
  for (let j = i - 19; j <= i; j++) {
    sumChange += Math.abs(src[j] - src[j - 1]);
  }
  
  const netChange = Math.abs(src[i] - src[i - 20]);
  
  if (sumChange === 0) return false;
  
  const efficiencyRatio = netChange / sumChange;
  
  return efficiencyRatio > threshold;
}

/**
 * ADX Filter
 * 
 * Filters based on ADX value - returns true when trend strength is sufficient.
 * 
 * @param high - High prices array
 * @param low - Low prices array
 * @param close - Close prices array
 * @param threshold - ADX threshold (default 20)
 * @param period - ADX period (default 14)
 * @param index - Current index (defaults to last)
 * @returns Whether ADX is above threshold
 */
export function filter_adx(
  high: number[],
  low: number[],
  close: number[],
  threshold: number = 20,
  period: number = 14,
  index?: number
): boolean {
  const { adx, plusDI, minusDI } = calculateADXInternal(high, low, close, period);
  if (adx.length === 0) return false;
  
  const i = index !== undefined ? index : adx.length - 1;
  const adxValue = adx[Math.min(i, adx.length - 1)];
  
  // ADX must be above threshold for trending
  return adxValue > threshold;
}

/**
 * Volatility Filter
 * 
 * Filters based on ATR volatility - returns true when volatility is within acceptable range.
 * 
 * @param high - High prices array
 * @param low - Low prices array
 * @param close - Close prices array
 * @param threshold - Volatility threshold multiplier (default 1.5)
 * @param period - ATR period (default 14)
 * @param index - Current index (defaults to last)
 * @returns Whether volatility is acceptable
 */
export function filter_volatility(
  high: number[],
  low: number[],
  close: number[],
  threshold: number = 1.5,
  period: number = 14,
  index?: number
): boolean {
  if (close.length < period * 2) return true;
  
  const i = index !== undefined ? index : close.length - 1;
  if (i < period * 2) return true;
  
  // Calculate ATR
  const tr: number[] = [];
  for (let j = 1; j <= i; j++) {
    const highLow = high[j] - low[j];
    const highClose = Math.abs(high[j] - close[j - 1]);
    const lowClose = Math.abs(low[j] - close[j - 1]);
    tr.push(Math.max(highLow, highClose, lowClose));
  }
  
  // Current ATR (SMA of TR)
  let atrSum = 0;
  for (let j = tr.length - period; j < tr.length; j++) {
    atrSum += tr[j];
  }
  const currentATR = atrSum / period;
  
  // Historical average ATR
  let totalATR = 0;
  const atrCount = Math.floor(tr.length / period);
  for (let k = 0; k < atrCount; k++) {
    let sum = 0;
    for (let j = k * period; j < (k + 1) * period && j < tr.length; j++) {
      sum += tr[j];
    }
    totalATR += sum / period;
  }
  const avgATR = totalATR / atrCount;
  
  if (avgATR === 0) return true;
  
  // Volatility ratio
  const volatilityRatio = currentATR / avgATR;
  
  // Accept volatility within threshold range
  return volatilityRatio < threshold;
}

// ==================== LORENTZIAN DISTANCE ====================

/**
 * Calculate Lorentzian Distance
 * 
 * Lorentzian distance is more robust to outliers than Euclidean distance.
 * Formula: d(x,y) = sum(log(1 + |xi - yi|))
 * 
 * @param a - First feature vector
 * @param b - Second feature vector
 * @returns Lorentzian distance
 */
export function lorentzianDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Feature vectors must have the same length');
  }
  
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    distance += Math.log(1 + Math.abs(a[i] - b[i]));
  }
  
  return distance;
}

/**
 * Approximate Nearest Neighbors in Lorentzian Space
 * 
 * Finds k nearest neighbors using Lorentzian distance.
 * 
 * @param query - Query feature vector
 * @param database - Database of feature vectors with labels
 * @param k - Number of neighbors to find
 * @returns Array of nearest neighbors with distances
 */
export function findNearestNeighbors(
  query: number[],
  database: TrainingSample[],
  k: number
): Array<{ sample: TrainingSample; distance: number }> {
  if (database.length === 0) return [];
  
  // Calculate distances to all samples
  const distances: Array<{ sample: TrainingSample; distance: number }> = database.map(sample => {
    const featureVector = Object.values(sample.features);
    const distance = lorentzianDistance(query, featureVector);
    return { sample, distance };
  });
  
  // Sort by distance and take k nearest
  distances.sort((a, b) => a.distance - b.distance);
  
  return distances.slice(0, k);
}

// ==================== LAWRENCE CLASSIFIER ====================

/**
 * Lawrence Classifier
 * 
 * A k-NN classifier using Lorentzian distance for market direction prediction.
 * Includes feature extraction, classification with confidence calibration,
 * and support for regime/volatility filtering.
 */
export class LawrenceClassifier {
  private trainingData: TrainingSample[] = [];
  private config: MLExtensionsConfig;
  private stats: ClassifierStats;
  private featureHistory: Map<string, number[]> = new Map();
  
  constructor(config?: Partial<MLExtensionsConfig>) {
    this.config = {
      lookbackWindow: 2000,
      maxBarsBackIndex: 4000,
      featureCount: 5,
      neighborCount: 8,
      filterSettings: {
        useVolatilityFilter: true,
        useRegimeFilter: true,
        useAdxFilter: true,
        regimeThreshold: 0.5,
        adxThreshold: 20,
        volatilityThreshold: 1.5
      },
      ...config
    };
    
    this.stats = {
      totalSamples: 0,
      longCount: 0,
      shortCount: 0,
      neutralCount: 0,
      avgConfidence: 0,
      winRate: 0,
      lastUpdated: Date.now()
    };
  }
  
  /**
   * Extract features from market data
   * 
   * @param high - High prices
   * @param low - Low prices
   * @param close - Close prices
   * @param volume - Volume data
   * @returns Normalized feature vector
   */
  extractFeatures(
    high: number[],
    low: number[],
    close: number[],
    volume?: number[]
  ): Record<string, number> {
    const features: Record<string, number> = {};
    
    // Normalized RSI
    features.n_rsi = n_rsi(close, 14);
    
    // Normalized CCI
    features.n_cci = n_cci(high, low, close, 20);
    
    // Normalized WaveTrend
    features.n_wt = n_wt(high, low, close, 10, 21);
    
    // Normalized ADX
    features.n_adx = n_adx(high, low, close, 14);
    
    // Normalized derivative of close price
    features.n_deriv = normalizeDeriv(close, 14);
    
    // Additional features
    if (volume && volume.length > 1) {
      const volumeRatio = volume[volume.length - 1] / 
        (volume.slice(-20).reduce((a, b) => a + b, 0) / 20);
      features.n_volume = normalize(volumeRatio - 1, 2);
    }
    
    // Rate of change features
    if (close.length > 5) {
      const roc5 = (close[close.length - 1] - close[close.length - 5]) / close[close.length - 5];
      features.n_roc5 = normalize(tanh(roc5 * 10), 1);
    }
    
    if (close.length > 10) {
      const roc10 = (close[close.length - 1] - close[close.length - 10]) / close[close.length - 10];
      features.n_roc10 = normalize(tanh(roc10 * 10), 1);
    }
    
    return features;
  }
  
  /**
   * Convert LawrenceFeatures to feature vector for classification
   */
  featuresToVector(features: LawrenceFeatures): number[] {
    const vector: number[] = [];
    
    // Indicator features (normalized 0-1)
    if (features.indicators.rsi !== undefined) {
      vector.push(normalize((features.indicators.rsi - 50) / 50, 1));
    } else {
      vector.push(0.5);
    }
    
    if (features.indicators.macd !== undefined) {
      vector.push(normalize(tanh(features.indicators.macd), 1));
    } else {
      vector.push(0.5);
    }
    
    // EMA distance
    if (features.indicators.ema20 !== undefined && features.signal.entryPrice !== undefined) {
      const emaDist = (features.signal.entryPrice - features.indicators.ema20) / features.signal.entryPrice;
      vector.push(normalize(tanh(emaDist * 10), 1));
    } else {
      vector.push(0.5);
    }
    
    // ATR relative
    if (features.indicators.atr !== undefined && features.signal.entryPrice !== undefined) {
      const atrRel = features.indicators.atr / features.signal.entryPrice;
      vector.push(normalize(atrRel * 100, 1));
    } else {
      vector.push(0.5);
    }
    
    // Volume ratio
    if (features.indicators.volumeRatio !== undefined) {
      vector.push(normalize(features.indicators.volumeRatio - 1, 1));
    } else {
      vector.push(0.5);
    }
    
    // Context features (categorical to numeric)
    vector.push(features.context.trend === 'TRENDING_UP' ? 0.8 : 
                features.context.trend === 'TRENDING_DOWN' ? 0.2 : 0.5);
    vector.push(features.context.volatility === 'HIGH' ? 0.8 : 
                features.context.volatility === 'LOW' ? 0.2 : 0.5);
    vector.push(features.context.volume === 'HIGH' ? 0.8 : 
                features.context.volume === 'LOW' ? 0.2 : 0.5);
    
    // Time features
    vector.push(normalize(features.time.hour / 24, 1));
    vector.push(normalize(features.time.dayOfWeek / 7, 1));
    vector.push(features.time.isSessionOverlap ? 0.8 : 0.3);
    
    return vector;
  }
  
  /**
   * Apply filters to determine if signal should be taken
   */
  applyFilters(
    high: number[],
    low: number[],
    close: number[]
  ): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    if (this.config.filterSettings.useRegimeFilter) {
      if (!regime_filter(close, this.config.filterSettings.regimeThreshold)) {
        reasons.push('Regime filter: Market not trending');
      }
    }
    
    if (this.config.filterSettings.useAdxFilter) {
      if (!filter_adx(high, low, close, this.config.filterSettings.adxThreshold)) {
        reasons.push(`ADX filter: ADX below ${this.config.filterSettings.adxThreshold}`);
      }
    }
    
    if (this.config.filterSettings.useVolatilityFilter) {
      if (!filter_volatility(high, low, close, this.config.filterSettings.volatilityThreshold)) {
        reasons.push(`Volatility filter: Volatility above ${this.config.filterSettings.volatilityThreshold}x average`);
      }
    }
    
    return {
      passed: reasons.length === 0,
      reasons
    };
  }
  
  /**
   * Weighted voting based on distance and historical performance
   */
  private weightedVote(
    neighbors: Array<{ sample: TrainingSample; distance: number }>
  ): { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; probability: number; confidence: number } {
    if (neighbors.length === 0) {
      return { direction: 'NEUTRAL', probability: 0.5, confidence: 0 };
    }
    
    let longWeight = 0;
    let shortWeight = 0;
    let neutralWeight = 0;
    let totalWeight = 0;
    
    for (const { sample, distance } of neighbors) {
      // Distance-based weight (closer = higher weight)
      // Using inverse distance with smoothing
      const distWeight = 1 / (1 + distance);
      
      // Combine with sample weight and recency
      const weight = distWeight * sample.weight;
      
      totalWeight += weight;
      
      switch (sample.label) {
        case 'LONG':
          longWeight += weight;
          break;
        case 'SHORT':
          shortWeight += weight;
          break;
        case 'NEUTRAL':
          neutralWeight += weight;
          break;
      }
    }
    
    if (totalWeight === 0) {
      return { direction: 'NEUTRAL', probability: 0.5, confidence: 0 };
    }
    
    // Normalize weights
    const longProb = longWeight / totalWeight;
    const shortProb = shortWeight / totalWeight;
    const neutralProb = neutralWeight / totalWeight;
    
    // Determine direction
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    let probability: number;
    
    if (longProb > shortProb && longProb > neutralProb) {
      direction = 'LONG';
      probability = longProb;
    } else if (shortProb > longProb && shortProb > neutralProb) {
      direction = 'SHORT';
      probability = shortProb;
    } else {
      direction = 'NEUTRAL';
      probability = neutralProb;
    }
    
    // Confidence based on separation and agreement
    const maxProb = Math.max(longProb, shortProb, neutralProb);
    const secondProb = [longProb, shortProb, neutralProb].sort((a, b) => b - a)[1];
    const confidence = maxProb - secondProb;
    
    return { direction, probability, confidence };
  }
  
  /**
   * Calibrate confidence using historical accuracy
   */
  private calibrateConfidence(
    rawConfidence: number,
    distance: number
  ): number {
    // Base calibration on distance (closer = higher confidence)
    const distanceFactor = 1 / (1 + distance * 0.1);
    
    // Factor in historical win rate
    const winRateFactor = this.stats.winRate || 0.5;
    
    // Combined calibration
    const calibrated = rawConfidence * distanceFactor * winRateFactor;
    
    return Math.max(0, Math.min(1, calibrated));
  }
  
  /**
   * Classify market direction using k-NN in Lorentzian space
   */
  classify(features: LawrenceFeatures): LawrenceResult {
    // Convert features to vector
    const featureVector = this.featuresToVector(features);
    
    // Find nearest neighbors
    const neighbors = findNearestNeighbors(
      featureVector,
      this.trainingData,
      this.config.neighborCount
    );
    
    // Weighted voting
    const { direction, probability, confidence: rawConfidence } = this.weightedVote(neighbors);
    
    // Calculate average distance for confidence calibration
    const avgDistance = neighbors.length > 0
      ? neighbors.reduce((sum, n) => sum + n.distance, 0) / neighbors.length
      : 0;
    
    // Calibrate confidence
    const confidence = this.calibrateConfidence(rawConfidence, avgDistance);
    
    // Build features record for result
    const featuresRecord: Record<string, number> = {};
    const featureKeys = [
      'n_rsi', 'n_macd', 'ema_dist', 'atr_rel', 'vol_ratio',
      'trend', 'volatility', 'volume', 'hour', 'day', 'session'
    ];
    featureVector.forEach((v, i) => {
      featuresRecord[featureKeys[i] || `f${i}`] = v;
    });
    
    return {
      direction,
      probability,
      confidence,
      features: featuresRecord
    };
  }
  
  /**
   * Train the classifier with a new sample
   */
  train(sample: TrainingSample): void {
    // Add to training data
    this.trainingData.push(sample);
    
    // Maintain window size
    if (this.trainingData.length > this.config.lookbackWindow) {
      this.trainingData = this.trainingData.slice(-this.config.lookbackWindow);
    }
    
    // Update stats
    this.stats.totalSamples = this.trainingData.length;
    this.stats.lastUpdated = Date.now();
    
    switch (sample.label) {
      case 'LONG':
        this.stats.longCount++;
        break;
      case 'SHORT':
        this.stats.shortCount++;
        break;
      case 'NEUTRAL':
        this.stats.neutralCount++;
        break;
    }
  }
  
  /**
   * Train with batch of samples
   */
  trainBatch(samples: TrainingSample[]): void {
    for (const sample of samples) {
      this.train(sample);
    }
  }
  
  /**
   * Evaluate classifier performance on test data
   */
  evaluate(testData: TrainingSample[]): {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    confusionMatrix: {
      tp: number;
      tn: number;
      fp: number;
      fn: number;
    };
  } {
    let tp = 0, tn = 0, fp = 0, fn = 0;
    let correct = 0;
    
    for (const sample of testData) {
      // Convert sample to features format
      const features: LawrenceFeatures = {
        indicators: {
          rsi: sample.features.n_rsi !== undefined ? 
            rescale(sample.features.n_rsi, 0, 1, 0, 100) : undefined,
        },
        context: {
          trend: 'RANGING',
          volatility: 'MEDIUM',
          volume: 'MEDIUM'
        },
        signal: {
          direction: sample.label === 'LONG' ? 'LONG' : 'SHORT',
          symbol: 'UNKNOWN',
          timeframe: '1h',
          entryPrice: 0
        },
        time: {
          hour: 12,
          dayOfWeek: 3,
          isSessionOverlap: true
        }
      };
      
      const result = this.classify(features);
      
      // Binary classification for LONG vs SHORT
      const actualLong = sample.label === 'LONG';
      const predictedLong = result.direction === 'LONG';
      
      if (actualLong && predictedLong) tp++;
      else if (!actualLong && !predictedLong) tn++;
      else if (!actualLong && predictedLong) fp++;
      else if (actualLong && !predictedLong) fn++;
      
      if (result.direction === sample.label) correct++;
    }
    
    const accuracy = testData.length > 0 ? correct / testData.length : 0;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1Score = (precision + recall) > 0 ? 
      2 * (precision * recall) / (precision + recall) : 0;
    
    this.stats.winRate = accuracy;
    
    return {
      accuracy,
      precision,
      recall,
      f1Score,
      confusionMatrix: { tp, tn, fp, fn }
    };
  }
  
  /**
   * Get classifier statistics
   */
  getStats(): ClassifierStats {
    return { ...this.stats };
  }
  
  /**
   * Get configuration
   */
  getConfig(): MLExtensionsConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<MLExtensionsConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Clear training data
   */
  clear(): void {
    this.trainingData = [];
    this.stats = {
      totalSamples: 0,
      longCount: 0,
      shortCount: 0,
      neutralCount: 0,
      avgConfidence: 0,
      winRate: 0,
      lastUpdated: Date.now()
    };
  }
  
  /**
   * Export training data
   */
  exportTrainingData(): TrainingSample[] {
    return [...this.trainingData];
  }
  
  /**
   * Import training data
   */
  importTrainingData(data: TrainingSample[]): void {
    this.trainingData = [...data];
    this.stats.totalSamples = data.length;
    this.stats.longCount = data.filter(s => s.label === 'LONG').length;
    this.stats.shortCount = data.filter(s => s.label === 'SHORT').length;
    this.stats.neutralCount = data.filter(s => s.label === 'NEUTRAL').length;
    this.stats.lastUpdated = Date.now();
  }
}

// ==================== SINGLETON INSTANCE ====================

let classifierInstance: LawrenceClassifier | null = null;

/**
 * Get Lawrence Classifier instance (singleton factory)
 */
export function getLawrenceClassifier(config?: Partial<MLExtensionsConfig>): LawrenceClassifier {
  if (!classifierInstance) {
    classifierInstance = new LawrenceClassifier(config);
  } else if (config) {
    classifierInstance.setConfig(config);
  }
  return classifierInstance;
}

/**
 * Reset the singleton instance
 */
export function resetLawrenceClassifier(): void {
  classifierInstance = null;
}

// Named export for all functions
const lawrenceClassifierModule = {
  // Core functions
  normalizeDeriv,
  normalize,
  rescale,
  tanh,
  dualPoleFilter,
  tanhTransform,
  
  // Normalized indicators
  n_rsi,
  n_cci,
  n_wt,
  n_adx,
  
  // Filters
  regime_filter,
  filter_adx,
  filter_volatility,
  
  // Distance functions
  lorentzianDistance,
  findNearestNeighbors,
  
  // Classifier
  LawrenceClassifier,
  getLawrenceClassifier,
  resetLawrenceClassifier
};

export default lawrenceClassifierModule;
