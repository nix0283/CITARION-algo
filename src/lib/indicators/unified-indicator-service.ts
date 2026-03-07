/**
 * Unified Indicator Service
 * 
 * Single source of truth for all indicator calculations across the platform.
 * Eliminates code duplication and ensures consistent indicator implementations.
 * 
 * CIT-035: Unified Indicator Service to eliminate duplication
 * 
 * Features:
 * - Centralized indicator registry
 * - Consistent calculation API
 * - Caching for performance
 * - Type-safe interfaces
 * - Support for custom indicators
 */

import { EventEmitter } from 'events';
import type { Time, LineData, HistogramData, WhitespaceData } from 'lightweight-charts';

// ==================== CORE TYPES ====================

export interface Candle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorLine {
  name: string;
  data: (LineData<Time> | WhitespaceData<Time>)[];
  color: string;
}

export interface IndicatorHistogram {
  name: string;
  data: (HistogramData<Time> | WhitespaceData<Time>)[];
  color: string;
}

export interface IndicatorResult {
  id: string;
  name: string;
  overlay: boolean;
  lines: IndicatorLine[];
  histograms: IndicatorHistogram[];
  metadata?: Record<string, unknown>;
}

export interface IndicatorConfig {
  id: string;
  name: string;
  description: string;
  category: IndicatorCategory;
  overlay: boolean;
  inputs: IndicatorInput[];
  defaultInputs: Record<string, number | string | boolean>;
}

export interface IndicatorInput {
  name: string;
  type: 'number' | 'integer' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  options?: string[]; // For select type
  description?: string;
}

export type IndicatorCategory = 
  | 'trend'
  | 'momentum'
  | 'volatility'
  | 'volume'
  | 'support_resistance'
  | 'pattern'
  | 'custom';

export type IndicatorCalculator = (
  candles: Candle[],
  inputs: Record<string, number | string | boolean>
) => IndicatorResult;

// ==================== INDICATOR REGISTRY ====================

class IndicatorRegistry {
  private indicators: Map<string, IndicatorConfig> = new Map();
  private calculators: Map<string, IndicatorCalculator> = new Map();
  private aliases: Map<string, string> = new Map();

  register(
    config: IndicatorConfig,
    calculator: IndicatorCalculator,
    aliasList: string[] = []
  ): void {
    if (this.indicators.has(config.id)) {
      console.warn(`[IndicatorRegistry] Overwriting existing indicator: ${config.id}`);
    }

    this.indicators.set(config.id, config);
    this.calculators.set(config.id, calculator);

    // Register aliases
    for (const alias of aliasList) {
      this.aliases.set(alias.toLowerCase(), config.id);
    }
  }

  get(id: string): IndicatorConfig | undefined {
    const normalizedId = id.toLowerCase();
    const aliasTarget = this.aliases.get(normalizedId);
    return this.indicators.get(aliasTarget || normalizedId);
  }

  getCalculator(id: string): IndicatorCalculator | undefined {
    const normalizedId = id.toLowerCase();
    const aliasTarget = this.aliases.get(normalizedId);
    return this.calculators.get(aliasTarget || normalizedId);
  }

  getAll(): IndicatorConfig[] {
    return Array.from(this.indicators.values());
  }

  getByCategory(category: IndicatorCategory): IndicatorConfig[] {
    return this.getAll().filter(i => i.category === category);
  }

  getOverlayIndicators(): IndicatorConfig[] {
    return this.getAll().filter(i => i.overlay);
  }

  getOscillatorIndicators(): IndicatorConfig[] {
    return this.getAll().filter(i => !i.overlay);
  }
}

// ==================== CACHING LAYER ====================

interface CacheEntry {
  result: IndicatorResult;
  hash: string;
  timestamp: number;
}

class IndicatorCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number;
  private ttl: number;

  constructor(maxEntries: number = 100, ttl: number = 60000) {
    this.maxEntries = maxEntries;
    this.ttl = ttl;
  }

  private hash(candles: Candle[], inputs: Record<string, unknown>): string {
    // Create a hash from first candle time, last candle time, and inputs
    const firstTime = candles[0]?.time;
    const lastTime = candles[candles.length - 1]?.time;
    const inputsHash = JSON.stringify(inputs);
    return `${firstTime}-${lastTime}-${inputsHash}`;
  }

  get(
    indicatorId: string,
    candles: Candle[],
    inputs: Record<string, unknown>
  ): IndicatorResult | null {
    const key = indicatorId;
    const entry = this.cache.get(key);

    if (!entry) return null;

    const hash = this.hash(candles, inputs);
    if (entry.hash !== hash) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  set(
    indicatorId: string,
    candles: Candle[],
    inputs: Record<string, unknown>,
    result: IndicatorResult
  ): void {
    // Enforce max entries
    if (this.cache.size >= this.maxEntries) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(indicatorId, {
      result,
      hash: this.hash(candles, inputs),
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
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
  
  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i];
  }
  
  if (data.length >= period) {
    result[period - 1] = sum / period;
    
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
  
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
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
  
  if (trValues.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trValues[i];
    }
    result[period - 1] = sum / period;
    
    for (let i = period; i < trValues.length; i++) {
      result[i] = (result[i - 1] as number * (period - 1) + trValues[i]) / period;
    }
  }
  
  return result;
}

function buildLineData(
  candles: Candle[],
  values: (number | null)[]
): (LineData<Time> | WhitespaceData<Time>)[] {
  const result: (LineData<Time> | WhitespaceData<Time>)[] = [];

  for (let i = 0; i < candles.length; i++) {
    const value = values[i];
    const time = candles[i].time;

    if (value !== null && !isNaN(value) && isFinite(value)) {
      result.push({ time, value });
    } else {
      result.push({ time });
    }
  }

  return result;
}

function buildHistogramData(
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
      result.push({ time });
    }
  }
  return result;
}

// ==================== BUILT-IN INDICATORS ====================

const BUILTIN_INDICATORS: Array<{
  config: IndicatorConfig;
  calculator: IndicatorCalculator;
  aliases: string[];
}> = [
  // SMA
  {
    config: {
      id: 'sma',
      name: 'Simple Moving Average',
      description: 'Average price over a period',
      category: 'trend',
      overlay: true,
      inputs: [
        { name: 'length', type: 'integer', min: 1, max: 500, default: 20, description: 'Period length' },
      ],
      defaultInputs: { length: 20 },
    },
    calculator: (candles, inputs) => {
      const length = inputs.length as number;
      const closes = candles.map(c => c.close);
      const smaValues = sma(closes, length);
      
      return {
        id: 'sma',
        name: `SMA ${length}`,
        overlay: true,
        lines: [{
          name: 'sma',
          data: buildLineData(candles, smaValues),
          color: '#2962FF',
        }],
        histograms: [],
      };
    },
    aliases: ['simple_moving_average', 'moving_average'],
  },

  // EMA
  {
    config: {
      id: 'ema',
      name: 'Exponential Moving Average',
      description: 'Weighted average with more weight on recent prices',
      category: 'trend',
      overlay: true,
      inputs: [
        { name: 'length', type: 'integer', min: 1, max: 500, default: 20, description: 'Period length' },
      ],
      defaultInputs: { length: 20 },
    },
    calculator: (candles, inputs) => {
      const length = inputs.length as number;
      const closes = candles.map(c => c.close);
      const emaValues = ema(closes, length);
      
      return {
        id: 'ema',
        name: `EMA ${length}`,
        overlay: true,
        lines: [{
          name: 'ema',
          data: buildLineData(candles, emaValues),
          color: '#00C853',
        }],
        histograms: [],
      };
    },
    aliases: ['exponential_moving_average'],
  },

  // RSI
  {
    config: {
      id: 'rsi',
      name: 'Relative Strength Index',
      description: 'Momentum oscillator measuring overbought/oversold conditions',
      category: 'momentum',
      overlay: false,
      inputs: [
        { name: 'length', type: 'integer', min: 1, max: 100, default: 14, description: 'Period length' },
      ],
      defaultInputs: { length: 14 },
    },
    calculator: (candles, inputs) => {
      const length = inputs.length as number;
      const closes = candles.map(c => c.close);
      const rsiValues = rsi(closes, length);
      
      return {
        id: 'rsi',
        name: `RSI ${length}`,
        overlay: false,
        lines: [{
          name: 'rsi',
          data: buildLineData(candles, rsiValues),
          color: '#D500F9',
        }],
        histograms: [],
      };
    },
    aliases: ['relative_strength_index'],
  },

  // MACD
  {
    config: {
      id: 'macd',
      name: 'Moving Average Convergence Divergence',
      description: 'Trend-following momentum indicator',
      category: 'momentum',
      overlay: false,
      inputs: [
        { name: 'fastLength', type: 'integer', min: 1, max: 100, default: 12, description: 'Fast EMA period' },
        { name: 'slowLength', type: 'integer', min: 1, max: 200, default: 26, description: 'Slow EMA period' },
        { name: 'signalLength', type: 'integer', min: 1, max: 50, default: 9, description: 'Signal line period' },
      ],
      defaultInputs: { fastLength: 12, slowLength: 26, signalLength: 9 },
    },
    calculator: (candles, inputs) => {
      const fastLength = inputs.fastLength as number;
      const slowLength = inputs.slowLength as number;
      const signalLength = inputs.signalLength as number;
      const closes = candles.map(c => c.close);
      
      const fastEma = ema(closes, fastLength);
      const slowEma = ema(closes, slowLength);
      
      const macdLine: (number | null)[] = closes.map((_, i) => {
        if (fastEma[i] === null || slowEma[i] === null) return null;
        return fastEma[i]! - slowEma[i]!;
      });
      
      const macdValues = macdLine.filter(v => v !== null) as number[];
      const signalEma = ema(macdValues, signalLength);
      
      const signalLine: (number | null)[] = new Array(candles.length).fill(null);
      let macdIdx = 0;
      for (let i = 0; i < candles.length; i++) {
        if (macdLine[i] !== null) {
          signalLine[i] = signalEma[macdIdx] ?? null;
          macdIdx++;
        }
      }
      
      const histogramValues: (number | null)[] = candles.map((_, i) => {
        const macd = macdLine[i];
        const signal = signalLine[i];
        if (macd === null || signal === null) return null;
        return macd - signal;
      });
      
      return {
        id: 'macd',
        name: `MACD (${fastLength},${slowLength},${signalLength})`,
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
    },
    aliases: ['moving_average_convergence_divergence'],
  },

  // Bollinger Bands
  {
    config: {
      id: 'bb',
      name: 'Bollinger Bands',
      description: 'Volatility indicator with upper/lower bands',
      category: 'volatility',
      overlay: true,
      inputs: [
        { name: 'length', type: 'integer', min: 1, max: 200, default: 20, description: 'Period length' },
        { name: 'mult', type: 'number', min: 0.1, max: 5, step: 0.1, default: 2, description: 'Standard deviation multiplier' },
      ],
      defaultInputs: { length: 20, mult: 2 },
    },
    calculator: (candles, inputs) => {
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
        name: `BB (${length}, ${mult})`,
        overlay: true,
        lines: [
          { name: 'upper', data: buildLineData(candles, upperValues), color: '#2962FF' },
          { name: 'middle', data: buildLineData(candles, smaValues), color: '#FF6D00' },
          { name: 'lower', data: buildLineData(candles, lowerValues), color: '#2962FF' },
        ],
        histograms: [],
      };
    },
    aliases: ['bollinger', 'bollinger_bands'],
  },

  // ATR
  {
    config: {
      id: 'atr',
      name: 'Average True Range',
      description: 'Volatility indicator measuring price range',
      category: 'volatility',
      overlay: false,
      inputs: [
        { name: 'length', type: 'integer', min: 1, max: 200, default: 14, description: 'Period length' },
      ],
      defaultInputs: { length: 14 },
    },
    calculator: (candles, inputs) => {
      const length = inputs.length as number;
      const atrValues = atr(candles, length);
      
      return {
        id: 'atr',
        name: `ATR ${length}`,
        overlay: false,
        lines: [{
          name: 'atr',
          data: buildLineData(candles, atrValues),
          color: '#FF6D00',
        }],
        histograms: [],
      };
    },
    aliases: ['average_true_range'],
  },

  // EMA Cross
  {
    config: {
      id: 'ema_cross',
      name: 'EMA Cross',
      description: 'Two EMA lines showing crossovers',
      category: 'trend',
      overlay: true,
      inputs: [
        { name: 'fastLength', type: 'integer', min: 1, max: 100, default: 9, description: 'Fast EMA period' },
        { name: 'slowLength', type: 'integer', min: 1, max: 200, default: 21, description: 'Slow EMA period' },
      ],
      defaultInputs: { fastLength: 9, slowLength: 21 },
    },
    calculator: (candles, inputs) => {
      const fastLength = inputs.fastLength as number;
      const slowLength = inputs.slowLength as number;
      const closes = candles.map(c => c.close);
      
      const fastEma = ema(closes, fastLength);
      const slowEma = ema(closes, slowLength);
      
      return {
        id: 'ema_cross',
        name: `EMA Cross (${fastLength}/${slowLength})`,
        overlay: true,
        lines: [
          { name: 'fast', data: buildLineData(candles, fastEma), color: '#00C853' },
          { name: 'slow', data: buildLineData(candles, slowEma), color: '#F6465D' },
        ],
        histograms: [],
      };
    },
    aliases: ['ema_cross'],
  },

  // Volume SMA
  {
    config: {
      id: 'vol_sma',
      name: 'Volume SMA',
      description: 'Volume with simple moving average',
      category: 'volume',
      overlay: false,
      inputs: [
        { name: 'length', type: 'integer', min: 1, max: 200, default: 20, description: 'SMA period' },
      ],
      defaultInputs: { length: 20 },
    },
    calculator: (candles, inputs) => {
      const length = inputs.length as number;
      const volumes = candles.map(c => c.volume);
      const smaValues = sma(volumes, length);

      const volumeData: (HistogramData<Time> | WhitespaceData<Time>)[] = candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: '#2962FF80',
      }));

      return {
        id: 'vol_sma',
        name: `Volume SMA ${length}`,
        overlay: false,
        lines: [{ name: 'volSMA', data: buildLineData(candles, smaValues), color: '#FF6D00' }],
        histograms: [{ name: 'volume', data: volumeData, color: '#2962FF80' }],
      };
    },
    aliases: ['volume_sma', 'volume_ma'],
  },
];

// ==================== UNIFIED INDICATOR SERVICE ====================

export class UnifiedIndicatorService extends EventEmitter {
  private registry: IndicatorRegistry;
  private cache: IndicatorCache;
  private static instance: UnifiedIndicatorService | null = null;

  private constructor() {
    super();
    this.registry = new IndicatorRegistry();
    this.cache = new IndicatorCache();
    this.registerBuiltInIndicators();
  }

  static getInstance(): UnifiedIndicatorService {
    if (!UnifiedIndicatorService.instance) {
      UnifiedIndicatorService.instance = new UnifiedIndicatorService();
    }
    return UnifiedIndicatorService.instance;
  }

  private registerBuiltInIndicators(): void {
    for (const { config, calculator, aliases } of BUILTIN_INDICATORS) {
      this.registry.register(config, calculator, aliases);
    }
  }

  /**
   * Register a custom indicator
   */
  registerIndicator(
    config: IndicatorConfig,
    calculator: IndicatorCalculator,
    aliases: string[] = []
  ): void {
    this.registry.register(config, calculator, aliases);
    this.emit('indicator_registered', config);
  }

  /**
   * Calculate indicator with caching
   */
  calculate(
    indicatorId: string,
    candles: Candle[],
    inputs: Record<string, number | string | boolean> = {}
  ): IndicatorResult | null {
    const config = this.registry.get(indicatorId);
    if (!config) {
      console.warn(`[UnifiedIndicatorService] Unknown indicator: ${indicatorId}`);
      return null;
    }

    // Merge with default inputs
    const mergedInputs = { ...config.defaultInputs, ...inputs };

    // Check cache
    const cached = this.cache.get(indicatorId, candles, mergedInputs);
    if (cached) {
      return cached;
    }

    // Calculate
    const calculator = this.registry.getCalculator(indicatorId);
    if (!calculator) {
      return null;
    }

    const result = calculator(candles, mergedInputs);

    // Cache result
    this.cache.set(indicatorId, candles, mergedInputs, result);

    return result;
  }

  /**
   * Calculate multiple indicators at once
   */
  calculateMultiple(
    indicators: Array<{
      id: string;
      inputs?: Record<string, number | string | boolean>;
    }>,
    candles: Candle[]
  ): Map<string, IndicatorResult> {
    const results = new Map<string, IndicatorResult>();

    for (const { id, inputs } of indicators) {
      const result = this.calculate(id, candles, inputs);
      if (result) {
        results.set(id, result);
      }
    }

    return results;
  }

  /**
   * Get all registered indicators
   */
  getIndicators(): IndicatorConfig[] {
    return this.registry.getAll();
  }

  /**
   * Get indicators by category
   */
  getIndicatorsByCategory(category: IndicatorCategory): IndicatorConfig[] {
    return this.registry.getByCategory(category);
  }

  /**
   * Get overlay indicators
   */
  getOverlayIndicators(): IndicatorConfig[] {
    return this.registry.getOverlayIndicators();
  }

  /**
   * Get oscillator indicators
   */
  getOscillatorIndicators(): IndicatorConfig[] {
    return this.registry.getOscillatorIndicators();
  }

  /**
   * Get indicator config
   */
  getIndicatorConfig(indicatorId: string): IndicatorConfig | undefined {
    return this.registry.get(indicatorId);
  }

  /**
   * Check if indicator exists
   */
  hasIndicator(indicatorId: string): boolean {
    return this.registry.get(indicatorId) !== undefined;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.emit('cache_cleared');
  }

  /**
   * Export indicator registry as JSON (for API responses)
   */
  exportRegistry(): IndicatorConfig[] {
    return this.registry.getAll().map(config => ({
      ...config,
      // Add computed fields
      inputs: config.inputs.map(input => ({
        ...input,
        // Ensure default is set
        default: input.default ?? config.defaultInputs[input.name],
      })),
    }));
  }
}

// ==================== SINGLETON EXPORT ====================

export const unifiedIndicatorService = UnifiedIndicatorService.getInstance();

// Convenience functions
export const calculateIndicator = (
  indicatorId: string,
  candles: Candle[],
  inputs?: Record<string, number | string | boolean>
) => unifiedIndicatorService.calculate(indicatorId, candles, inputs);

export const getIndicatorConfig = (indicatorId: string) =>
  unifiedIndicatorService.getIndicatorConfig(indicatorId);

export const getAllIndicators = () => unifiedIndicatorService.getIndicators();

export default UnifiedIndicatorService;
