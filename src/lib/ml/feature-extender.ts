/**
 * Feature Extender
 * 
 * Provides dynamic feature extension capabilities for ML classifiers.
 * Implements the "Einstein Extension" concept from Lorentzian Classification Premium,
 * allowing the feature space to expand from 4 to N dimensions.
 * 
 * Key capabilities:
 * - Dynamic feature registration
 * - Feature normalization and scaling
 * - Feature importance tracking
 * - Automatic feature selection
 * - Feature correlation analysis
 * 
 * @see https://www.tradingview.com/script/Ts0sn9jl/ - ML Lorentzian Classification Premium
 */

// ==================== TYPE DEFINITIONS ====================

export interface FeatureDefinition {
  name: string;
  type: 'continuous' | 'categorical' | 'binary';
  normalize: boolean;
  min?: number;
  max?: number;
  defaultValue: number;
  importance: number;  // 0-1, higher = more important
  category: 'indicator' | 'price' | 'volume' | 'time' | 'custom';
}

export interface FeatureValue {
  name: string;
  value: number;
  normalized: number;
  timestamp: number;
  source: string; // Indicator name or calculation method
}

export interface FeatureVector {
  features: Record<string, number>;
  normalized: number[];
  names: string[];
  timestamp: number;
}

export interface FeatureStats {
  name: string;
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  missingRate: number;
  importance: number;
  lastUpdated: number;
}

export interface FeatureCorrelation {
  feature1: string;
  feature2: string;
  correlation: number;  // -1 to 1
  pValue: number;
}

export interface FeatureExtenderConfig {
  maxFeatures: number;
  normalizationMethod: 'minmax' | 'zscore' | 'robust' | 'rank';
  importanceThreshold: number;
  correlationThreshold: number;
  updateInterval: number;  // MS between stats updates
  historyLength: number;   // Number of samples to keep for stats
}

export type FeatureCalculator = (context: FeatureContext) => number | null;

export interface FeatureContext {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  timestamp: number;
  symbol: string;
  timeframe: string;
  custom?: Record<string, any>;
}

// ==================== BUILT-IN FEATURES ====================

/**
 * Built-in feature calculators
 * These are common technical indicators that can be used as features
 */
export const BUILTIN_FEATURES: Record<string, { definition: FeatureDefinition; calculator: FeatureCalculator }> = {
  // Momentum features
  'rsi_14': {
    definition: {
      name: 'rsi_14',
      type: 'continuous',
      normalize: true,
      min: 0,
      max: 100,
      defaultValue: 50,
      importance: 0.9,
      category: 'indicator'
    },
    calculator: (ctx) => calculateRSI(ctx.close, 14)
  },
  
  'rsi_7': {
    definition: {
      name: 'rsi_7',
      type: 'continuous',
      normalize: true,
      min: 0,
      max: 100,
      defaultValue: 50,
      importance: 0.8,
      category: 'indicator'
    },
    calculator: (ctx) => calculateRSI(ctx.close, 7)
  },
  
  'momentum_10': {
    definition: {
      name: 'momentum_10',
      type: 'continuous',
      normalize: true,
      defaultValue: 0,
      importance: 0.7,
      category: 'indicator'
    },
    calculator: (ctx) => {
      if (ctx.close.length < 10) return null;
      return (ctx.close[ctx.close.length - 1] - ctx.close[ctx.close.length - 10]) / ctx.close[ctx.close.length - 10];
    }
  },
  
  'roc_5': {
    definition: {
      name: 'roc_5',
      type: 'continuous',
      normalize: true,
      defaultValue: 0,
      importance: 0.75,
      category: 'indicator'
    },
    calculator: (ctx) => {
      if (ctx.close.length < 5) return null;
      return (ctx.close[ctx.close.length - 1] - ctx.close[ctx.close.length - 5]) / ctx.close[ctx.close.length - 5] * 100;
    }
  },

  // Volatility features
  'atr_14': {
    definition: {
      name: 'atr_14',
      type: 'continuous',
      normalize: true,
      defaultValue: 0,
      importance: 0.85,
      category: 'indicator'
    },
    calculator: (ctx) => calculateATR(ctx.high, ctx.low, ctx.close, 14)
  },
  
  'atr_ratio': {
    definition: {
      name: 'atr_ratio',
      type: 'continuous',
      normalize: true,
      defaultValue: 1,
      importance: 0.8,
      category: 'indicator'
    },
    calculator: (ctx) => {
      const atr = calculateATR(ctx.high, ctx.low, ctx.close, 14);
      if (!atr || ctx.close.length === 0) return null;
      return atr / ctx.close[ctx.close.length - 1];
    }
  },
  
  'bb_width': {
    definition: {
      name: 'bb_width',
      type: 'continuous',
      normalize: true,
      defaultValue: 0.02,
      importance: 0.75,
      category: 'indicator'
    },
    calculator: (ctx) => calculateBBWidth(ctx.close, 20, 2)
  },
  
  'bb_position': {
    definition: {
      name: 'bb_position',
      type: 'continuous',
      normalize: true,
      min: -1,
      max: 1,
      defaultValue: 0,
      importance: 0.8,
      category: 'indicator'
    },
    calculator: (ctx) => calculateBBPosition(ctx.close, 20, 2)
  },

  // Trend features
  'adx_14': {
    definition: {
      name: 'adx_14',
      type: 'continuous',
      normalize: true,
      min: 0,
      max: 100,
      defaultValue: 25,
      importance: 0.9,
      category: 'indicator'
    },
    calculator: (ctx) => calculateADX(ctx.high, ctx.low, ctx.close, 14)
  },
  
  'plus_di': {
    definition: {
      name: 'plus_di',
      type: 'continuous',
      normalize: true,
      min: 0,
      max: 100,
      defaultValue: 25,
      importance: 0.7,
      category: 'indicator'
    },
    calculator: (ctx) => calculateDI(ctx.high, ctx.low, ctx.close, 14, 'plus')
  },
  
  'minus_di': {
    definition: {
      name: 'minus_di',
      type: 'continuous',
      normalize: true,
      min: 0,
      max: 100,
      defaultValue: 25,
      importance: 0.7,
      category: 'indicator'
    },
    calculator: (ctx) => calculateDI(ctx.high, ctx.low, ctx.close, 14, 'minus')
  },
  
  'ema_cross_20_50': {
    definition: {
      name: 'ema_cross_20_50',
      type: 'continuous',
      normalize: true,
      defaultValue: 0,
      importance: 0.85,
      category: 'indicator'
    },
    calculator: (ctx) => {
      const ema20 = calculateEMA(ctx.close, 20);
      const ema50 = calculateEMA(ctx.close, 50);
      if (!ema20 || !ema50) return null;
      return (ema20 - ema50) / ema50;
    }
  },
  
  'price_to_ema20': {
    definition: {
      name: 'price_to_ema20',
      type: 'continuous',
      normalize: true,
      defaultValue: 0,
      importance: 0.75,
      category: 'price'
    },
    calculator: (ctx) => {
      const ema = calculateEMA(ctx.close, 20);
      if (!ema || ctx.close.length === 0) return null;
      return (ctx.close[ctx.close.length - 1] - ema) / ema;
    }
  },

  // Volume features
  'volume_ratio': {
    definition: {
      name: 'volume_ratio',
      type: 'continuous',
      normalize: true,
      defaultValue: 1,
      importance: 0.7,
      category: 'volume'
    },
    calculator: (ctx) => {
      if (ctx.volume.length < 20) return null;
      const current = ctx.volume[ctx.volume.length - 1];
      const avg = ctx.volume.slice(-20).reduce((a, b) => a + b, 0) / 20;
      return current / avg;
    }
  },
  
  'obv_slope': {
    definition: {
      name: 'obv_slope',
      type: 'continuous',
      normalize: true,
      defaultValue: 0,
      importance: 0.65,
      category: 'volume'
    },
    calculator: (ctx) => {
      if (ctx.volume.length < 10) return null;
      // Calculate OBV slope
      let obv = 0;
      const obvValues: number[] = [0];
      for (let i = 1; i < ctx.close.length; i++) {
        if (ctx.close[i] > ctx.close[i - 1]) {
          obv += ctx.volume[i];
        } else if (ctx.close[i] < ctx.close[i - 1]) {
          obv -= ctx.volume[i];
        }
        obvValues.push(obv);
      }
      // Calculate slope of last 10 OBV values
      const recent = obvValues.slice(-10);
      const slope = (recent[recent.length - 1] - recent[0]) / 10;
      return slope / ctx.close[ctx.close.length - 1]; // Normalize by price
    }
  },

  // Oscillator features
  'stochastic_k': {
    definition: {
      name: 'stochastic_k',
      type: 'continuous',
      normalize: true,
      min: 0,
      max: 100,
      defaultValue: 50,
      importance: 0.8,
      category: 'indicator'
    },
    calculator: (ctx) => calculateStochastic(ctx.high, ctx.low, ctx.close, 14, 3, 'K')
  },
  
  'stochastic_d': {
    definition: {
      name: 'stochastic_d',
      type: 'continuous',
      normalize: true,
      min: 0,
      max: 100,
      defaultValue: 50,
      importance: 0.75,
      category: 'indicator'
    },
    calculator: (ctx) => calculateStochastic(ctx.high, ctx.low, ctx.close, 14, 3, 'D')
  },
  
  'cci_20': {
    definition: {
      name: 'cci_20',
      type: 'continuous',
      normalize: true,
      defaultValue: 0,
      importance: 0.75,
      category: 'indicator'
    },
    calculator: (ctx) => calculateCCI(ctx.high, ctx.low, ctx.close, 20)
  },
  
  'williams_r': {
    definition: {
      name: 'williams_r',
      type: 'continuous',
      normalize: true,
      min: -100,
      max: 0,
      defaultValue: -50,
      importance: 0.7,
      category: 'indicator'
    },
    calculator: (ctx) => calculateWilliamsR(ctx.high, ctx.low, ctx.close, 14)
  },

  // Pattern features
  'doji_pattern': {
    definition: {
      name: 'doji_pattern',
      type: 'binary',
      normalize: false,
      min: 0,
      max: 1,
      defaultValue: 0,
      importance: 0.5,
      category: 'custom'
    },
    calculator: (ctx) => {
      if (ctx.close.length < 1) return null;
      const i = ctx.close.length - 1;
      const body = Math.abs(ctx.close[i] - ctx.open[i]);
      const range = ctx.high[i] - ctx.low[i];
      if (range === 0) return 0;
      return body / range < 0.1 ? 1 : 0;
    }
  },
  
  'engulfing': {
    definition: {
      name: 'engulfing',
      type: 'continuous',
      normalize: false,
      min: -1,
      max: 1,
      defaultValue: 0,
      importance: 0.6,
      category: 'custom'
    },
    calculator: (ctx) => {
      if (ctx.close.length < 2) return null;
      const i = ctx.close.length - 1;
      const prevBody = Math.abs(ctx.close[i - 1] - ctx.open[i - 1]);
      const currBody = Math.abs(ctx.close[i] - ctx.open[i]);
      
      // Bullish engulfing
      if (ctx.close[i - 1] < ctx.open[i - 1] && ctx.close[i] > ctx.open[i] &&
          ctx.open[i] < ctx.close[i - 1] && ctx.close[i] > ctx.open[i - 1]) {
        return 1;
      }
      // Bearish engulfing
      if (ctx.close[i - 1] > ctx.open[i - 1] && ctx.close[i] < ctx.open[i] &&
          ctx.open[i] > ctx.close[i - 1] && ctx.close[i] < ctx.open[i - 1]) {
        return -1;
      }
      return 0;
    }
  },

  // Time features
  'hour_sin': {
    definition: {
      name: 'hour_sin',
      type: 'continuous',
      normalize: false,
      min: -1,
      max: 1,
      defaultValue: 0,
      importance: 0.5,
      category: 'time'
    },
    calculator: (ctx) => {
      const hour = new Date(ctx.timestamp).getHours();
      return Math.sin(2 * Math.PI * hour / 24);
    }
  },
  
  'hour_cos': {
    definition: {
      name: 'hour_cos',
      type: 'continuous',
      normalize: false,
      min: -1,
      max: 1,
      defaultValue: 1,
      importance: 0.5,
      category: 'time'
    },
    calculator: (ctx) => {
      const hour = new Date(ctx.timestamp).getHours();
      return Math.cos(2 * Math.PI * hour / 24);
    }
  },
  
  'day_of_week': {
    definition: {
      name: 'day_of_week',
      type: 'categorical',
      normalize: false,
      min: 0,
      max: 6,
      defaultValue: 0,
      importance: 0.4,
      category: 'time'
    },
    calculator: (ctx) => {
      return new Date(ctx.timestamp).getDay();
    }
  }
};

// ==================== INDICATOR CALCULATIONS ====================

function calculateRSI(close: number[], period: number): number | null {
  if (close.length < period + 1) return null;
  
  let gains = 0, losses = 0;
  for (let i = close.length - period; i < close.length; i++) {
    const change = close[i] - close[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateATR(high: number[], low: number[], close: number[], period: number): number | null {
  if (close.length < period + 1) return null;
  
  let trSum = 0;
  for (let i = close.length - period; i < close.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    trSum += tr;
  }
  
  return trSum / period;
}

function calculateEMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateBBWidth(close: number[], period: number, stdDev: number): number | null {
  if (close.length < period) return null;
  
  const slice = close.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  if (sma === 0) return null;
  return (2 * stdDev * std) / sma;
}

function calculateBBPosition(close: number[], period: number, stdDev: number): number | null {
  if (close.length < period) return null;
  
  const slice = close.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  if (std === 0) return 0;
  const price = close[close.length - 1];
  return (price - sma) / (stdDev * std);
}

function calculateADX(high: number[], low: number[], close: number[], period: number): number | null {
  if (close.length < period * 2) return null;
  
  const { adx } = calculateADXInternal(high, low, close, period);
  return adx.length > 0 ? adx[adx.length - 1] : null;
}

function calculateDI(high: number[], low: number[], close: number[], period: number, type: 'plus' | 'minus'): number | null {
  if (close.length < period * 2) return null;
  
  const { plusDI, minusDI } = calculateADXInternal(high, low, close, period);
  if (type === 'plus') return plusDI.length > 0 ? plusDI[plusDI.length - 1] : null;
  return minusDI.length > 0 ? minusDI[minusDI.length - 1] : null;
}

function calculateADXInternal(high: number[], low: number[], close: number[], period: number): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
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
  
  // Smooth values
  const smoothTR: number[] = [];
  const smoothPlusDM: number[] = [];
  const smoothMinusDM: number[] = [];
  
  let trSum = 0, plusDMSum = 0, minusDMSum = 0;
  for (let i = 0; i < period && i < tr.length; i++) {
    trSum += tr[i];
    plusDMSum += plusDM[i];
    minusDMSum += minusDM[i];
  }
  
  smoothTR.push(trSum / period);
  smoothPlusDM.push(plusDMSum / period);
  smoothMinusDM.push(minusDMSum / period);
  
  for (let i = period; i < tr.length; i++) {
    smoothTR.push((smoothTR[smoothTR.length - 1] * (period - 1) + tr[i]) / period);
    smoothPlusDM.push((smoothPlusDM[smoothPlusDM.length - 1] * (period - 1) + plusDM[i]) / period);
    smoothMinusDM.push((smoothMinusDM[smoothMinusDM.length - 1] * (period - 1) + minusDM[i]) / period);
  }
  
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
  
  const adx: number[] = [];
  let dxSum = 0;
  for (let i = 0; i < period && i < dx.length; i++) {
    dxSum += dx[i];
  }
  adx.push(dxSum / period);
  
  for (let i = period; i < dx.length; i++) {
    adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
  }
  
  return { adx, plusDI, minusDI };
}

function calculateStochastic(high: number[], low: number[], close: number[], kPeriod: number, dPeriod: number, type: 'K' | 'D'): number | null {
  if (close.length < kPeriod + (type === 'D' ? dPeriod : 0)) return null;
  
  const kValues: number[] = [];
  
  for (let i = kPeriod - 1; i < close.length; i++) {
    const highestHigh = Math.max(...high.slice(i - kPeriod + 1, i + 1));
    const lowestLow = Math.min(...low.slice(i - kPeriod + 1, i + 1));
    const range = highestHigh - lowestLow;
    
    if (range === 0) {
      kValues.push(50);
    } else {
      kValues.push(((close[i] - lowestLow) / range) * 100);
    }
  }
  
  if (type === 'K') {
    return kValues[kValues.length - 1];
  }
  
  // Calculate %D (SMA of %K)
  const dSlice = kValues.slice(-dPeriod);
  return dSlice.reduce((a, b) => a + b, 0) / dPeriod;
}

function calculateCCI(high: number[], low: number[], close: number[], period: number): number | null {
  if (close.length < period) return null;
  
  const tp: number[] = [];
  for (let i = 0; i < close.length; i++) {
    tp.push((high[i] + low[i] + close[i]) / 3);
  }
  
  const recentTP = tp.slice(-period);
  const sma = recentTP.reduce((a, b) => a + b, 0) / period;
  const meanDev = recentTP.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;
  
  if (meanDev === 0) return 0;
  return (tp[tp.length - 1] - sma) / (0.015 * meanDev);
}

function calculateWilliamsR(high: number[], low: number[], close: number[], period: number): number | null {
  if (close.length < period) return null;
  
  const highestHigh = Math.max(...high.slice(-period));
  const lowestLow = Math.min(...low.slice(-period));
  const range = highestHigh - lowestLow;
  
  if (range === 0) return -50;
  return -100 * (highestHigh - close[close.length - 1]) / range;
}

// ==================== FEATURE EXTENDER CLASS ====================

/**
 * Feature Extender
 * 
 * Manages dynamic feature extension for ML classifiers.
 */
export class FeatureExtender {
  private features: Map<string, FeatureDefinition> = new Map();
  private calculators: Map<string, FeatureCalculator> = new Map();
  private stats: Map<string, FeatureStats> = new Map();
  private history: Map<string, number[]> = new Map();
  private config: FeatureExtenderConfig;
  
  constructor(config?: Partial<FeatureExtenderConfig>) {
    this.config = {
      maxFeatures: 32,
      normalizationMethod: 'minmax',
      importanceThreshold: 0.3,
      correlationThreshold: 0.9,
      updateInterval: 3600000, // 1 hour
      historyLength: 1000,
      ...config
    };
    
    // Register built-in features
    for (const [name, { definition, calculator }] of Object.entries(BUILTIN_FEATURES)) {
      this.registerFeature(definition, calculator);
    }
  }
  
  /**
   * Register a new feature
   */
  registerFeature(definition: FeatureDefinition, calculator: FeatureCalculator): boolean {
    if (this.features.size >= this.config.maxFeatures) {
      console.warn(`Maximum features (${this.config.maxFeatures}) reached`);
      return false;
    }
    
    this.features.set(definition.name, definition);
    this.calculators.set(definition.name, calculator);
    this.history.set(definition.name, []);
    
    return true;
  }
  
  /**
   * Unregister a feature
   */
  unregisterFeature(name: string): boolean {
    return this.features.delete(name) && 
           this.calculators.delete(name) && 
           this.stats.delete(name) &&
           this.history.delete(name);
  }
  
  /**
   * Extract features from context
   */
  extractFeatures(context: FeatureContext): FeatureVector {
    const features: Record<string, number> = {};
    const normalized: number[] = [];
    const names: string[] = [];
    
    // Calculate all features
    for (const [name, calculator] of this.calculators) {
      const definition = this.features.get(name)!;
      let value = calculator(context);
      
      // Handle missing values
      if (value === null || isNaN(value)) {
        value = definition.defaultValue;
      }
      
      features[name] = value;
      
      // Store in history
      const hist = this.history.get(name) || [];
      hist.push(value);
      if (hist.length > this.config.historyLength) {
        hist.shift();
      }
      this.history.set(name, hist);
      
      // Normalize
      const normalizedValue = this.normalizeFeature(name, value, definition);
      normalized.push(normalizedValue);
      names.push(name);
    }
    
    return {
      features,
      normalized,
      names,
      timestamp: context.timestamp
    };
  }
  
  /**
   * Normalize a feature value
   */
  private normalizeFeature(name: string, value: number, definition: FeatureDefinition): number {
    if (!definition.normalize) return value;
    
    const stats = this.stats.get(name);
    
    switch (this.config.normalizationMethod) {
      case 'minmax': {
        const min = definition.min ?? (stats?.min ?? 0);
        const max = definition.max ?? (stats?.max ?? 1);
        const range = max - min;
        return range === 0 ? 0.5 : (value - min) / range;
      }
      
      case 'zscore': {
        if (!stats || stats.count < 10) return 0.5;
        const std = stats.std || 1;
        const zscore = (value - stats.mean) / std;
        // Convert to 0-1 range using sigmoid
        return 1 / (1 + Math.exp(-zscore));
      }
      
      case 'robust': {
        if (!stats) return 0.5;
        // Use median and MAD (median absolute deviation)
        const history = this.history.get(name) || [];
        const sorted = [...history].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        const mad = sorted.reduce((sum, v) => sum + Math.abs(v - median), 0) / sorted.length || 1;
        return Math.tanh((value - median) / (1.4826 * mad)) / 2 + 0.5;
      }
      
      case 'rank': {
        const history = this.history.get(name) || [];
        if (history.length === 0) return 0.5;
        const rank = history.filter(v => v < value).length;
        return rank / history.length;
      }
      
      default:
        return value;
    }
  }
  
  /**
   * Update feature statistics
   */
  updateStats(): void {
    for (const [name, history] of this.history) {
      if (history.length < 2) continue;
      
      const definition = this.features.get(name)!;
      const count = history.length;
      const mean = history.reduce((a, b) => a + b, 0) / count;
      const variance = history.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / count;
      const std = Math.sqrt(variance);
      
      // Skewness
      const skewness = history.reduce((sum, v) => sum + Math.pow((v - mean) / std, 3), 0) / count;
      
      // Kurtosis
      const kurtosis = history.reduce((sum, v) => sum + Math.pow((v - mean) / std, 4), 0) / count - 3;
      
      const stats: FeatureStats = {
        name,
        count,
        mean,
        std,
        min: Math.min(...history),
        max: Math.max(...history),
        skewness,
        kurtosis,
        missingRate: 0,
        importance: definition.importance,
        lastUpdated: Date.now()
      };
      
      this.stats.set(name, stats);
    }
  }
  
  /**
   * Calculate feature correlations
   */
  calculateCorrelations(): FeatureCorrelation[] {
    const correlations: FeatureCorrelation[] = [];
    const names = Array.from(this.features.keys());
    
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const hist1 = this.history.get(names[i]) || [];
        const hist2 = this.history.get(names[j]) || [];
        
        if (hist1.length < 10 || hist2.length < 10) continue;
        
        const minLen = Math.min(hist1.length, hist2.length);
        const slice1 = hist1.slice(-minLen);
        const slice2 = hist2.slice(-minLen);
        
        const mean1 = slice1.reduce((a, b) => a + b, 0) / minLen;
        const mean2 = slice2.reduce((a, b) => a + b, 0) / minLen;
        
        let covariance = 0;
        let var1 = 0, var2 = 0;
        
        for (let k = 0; k < minLen; k++) {
          const diff1 = slice1[k] - mean1;
          const diff2 = slice2[k] - mean2;
          covariance += diff1 * diff2;
          var1 += diff1 * diff1;
          var2 += diff2 * diff2;
        }
        
        const correlation = covariance / Math.sqrt(var1 * var2) || 0;
        
        correlations.push({
          feature1: names[i],
          feature2: names[j],
          correlation,
          pValue: 0 // Would need proper calculation
        });
      }
    }
    
    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }
  
  /**
   * Select best features based on importance and correlation
   */
  selectFeatures(): string[] {
    // Sort by importance
    const sorted = Array.from(this.features.values())
      .sort((a, b) => b.importance - a.importance);
    
    const selected: string[] = [];
    const correlations = this.calculateCorrelations();
    
    for (const feature of sorted) {
      if (feature.importance < this.config.importanceThreshold) continue;
      
      // Check correlation with already selected features
      let tooCorrelated = false;
      for (const selectedName of selected) {
        const corr = correlations.find(
          c => (c.feature1 === feature.name && c.feature2 === selectedName) ||
               (c.feature2 === feature.name && c.feature1 === selectedName)
        );
        if (corr && Math.abs(corr.correlation) > this.config.correlationThreshold) {
          tooCorrelated = true;
          break;
        }
      }
      
      if (!tooCorrelated) {
        selected.push(feature.name);
      }
    }
    
    return selected;
  }
  
  /**
   * Get feature definition
   */
  getFeatureDefinition(name: string): FeatureDefinition | undefined {
    return this.features.get(name);
  }
  
  /**
   * Get all feature names
   */
  getFeatureNames(): string[] {
    return Array.from(this.features.keys());
  }
  
  /**
   * Get feature statistics
   */
  getFeatureStats(name: string): FeatureStats | undefined {
    return this.stats.get(name);
  }
  
  /**
   * Get all statistics
   */
  getAllStats(): FeatureStats[] {
    return Array.from(this.stats.values());
  }
  
  /**
   * Get feature count
   */
  getFeatureCount(): number {
    return this.features.size;
  }
  
  /**
   * Clear history
   */
  clearHistory(): void {
    for (const name of this.history.keys()) {
      this.history.set(name, []);
    }
  }
  
  /**
   * Export configuration
   */
  export(): { features: FeatureDefinition[]; config: FeatureExtenderConfig } {
    return {
      features: Array.from(this.features.values()),
      config: this.config
    };
  }
}

// ==================== SINGLETON INSTANCE ====================

let extenderInstance: FeatureExtender | null = null;

/**
 * Get feature extender instance
 */
export function getFeatureExtender(config?: Partial<FeatureExtenderConfig>): FeatureExtender {
  if (!extenderInstance) {
    extenderInstance = new FeatureExtender(config);
  }
  return extenderInstance;
}

/**
 * Reset feature extender instance
 */
export function resetFeatureExtender(): void {
  extenderInstance = null;
}

export default {
  FeatureExtender,
  BUILTIN_FEATURES,
  getFeatureExtender,
  resetFeatureExtender
};
