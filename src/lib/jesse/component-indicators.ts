/**
 * Jesse-Style Component Indicator System
 * 
 * Компонентная система индикаторов в стиле Jesse.
 * Позволяет создавать составные индикаторы с автоматическим управлением
 * зависимостями и кэшированием.
 * 
 * Особенности:
 * - Первый класс гражданин (First-class citizens)
 * - Композиция индикаторов
 * - Автоматическое управление зависимостями
 * - Look-ahead protection
 * - Lazy evaluation с кэшированием
 * 
 * @see https://jesse.trade
 * @see https://github.com/jesse-ai/jesse
 */

import { Candle } from "../strategy/types";

// ==================== TYPES ====================

/**
 * Результат индикатора
 */
export interface IndicatorResult<T = number> {
  /** Значения индикатора */
  values: T[];
  /** Метаданные */
  metadata?: Record<string, unknown>;
  /** Время последнего обновления */
  timestamp?: number;
}

/**
 * Параметры индикатора
 */
export interface IndicatorParams {
  [key: string]: number | string | boolean;
}

/**
 * Контекст для расчёта индикатора
 */
export interface IndicatorContext {
  /** Свечи */
  candles: Candle[];
  /** Индекс текущей свечи */
  currentIndex: number;
  /** Включить look-ahead protection */
  lookAheadProtection: boolean;
  /** Кэш вычисленных значений */
  cache: Map<string, unknown>;
}

/**
 * Базовый интерфейс индикатора
 */
export interface IIndicator<T = number> {
  /** Уникальный идентификатор */
  readonly id: string;
  /** Имя индикатора */
  readonly name: string;
  /** Параметры по умолчанию */
  readonly defaultParams: IndicatorParams;
  /** Зависимости */
  readonly dependencies: string[];
  /** Вычислить значения */
  compute(context: IndicatorContext, params: IndicatorParams): IndicatorResult<T>;
  /** Получить значение на индексе */
  getValue(index: number, context: IndicatorContext, params: IndicatorParams): T | undefined;
}

/**
 * Конфигурация индикатора
 */
export interface IndicatorConfig {
  /** Период расчёта */
  period?: number;
  /** Смещение (lag) */
  offset?: number;
  /** Параметр сглаживания */
  smooth?: number;
  /** Источник данных (close, open, high, low, hl2, hlc3) */
  source?: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "volume";
  /** Множитель */
  multiplier?: number;
}

// ==================== BASE INDICATOR CLASS ====================

/**
 * Базовый класс индикатора с кэшированием и look-ahead protection
 */
export abstract class BaseIndicator<T = number> implements IIndicator<T> {
  readonly id: string;
  readonly name: string;
  readonly defaultParams: IndicatorParams;
  readonly dependencies: string[] = [];

  protected cachedValues: T[] | null = null;
  protected cachedParams: string = "";

  constructor(
    id: string,
    name: string,
    defaultParams: IndicatorParams = {}
  ) {
    this.id = id;
    this.name = name;
    this.defaultParams = defaultParams;
  }

  /**
   * Получить источник данных из свечей
   */
  protected getSource(candles: Candle[], source: string = "close"): number[] {
    switch (source) {
      case "close":
        return candles.map(c => c.close);
      case "open":
        return candles.map(c => c.open);
      case "high":
        return candles.map(c => c.high);
      case "low":
        return candles.map(c => c.low);
      case "hl2":
        return candles.map(c => (c.high + c.low) / 2);
      case "hlc3":
        return candles.map(c => (c.high + c.low + c.close) / 3);
      case "volume":
        return candles.map(c => c.volume);
      default:
        return candles.map(c => c.close);
    }
  }

  /**
   * Проверка look-ahead protection
   * Возвращает true если индекс доступен для чтения
   */
  protected canAccessIndex(
    context: IndicatorContext,
    index: number
  ): boolean {
    if (!context.lookAheadProtection) {
      return true;
    }
    return index <= context.currentIndex;
  }

  /**
   * Ключ кэша
   */
  protected getCacheKey(params: IndicatorParams): string {
    return `${this.id}_${JSON.stringify(params)}`;
  }

  /**
   * Сбросить кэш
   */
  resetCache(): void {
    this.cachedValues = null;
    this.cachedParams = "";
  }

  abstract compute(context: IndicatorContext, params: IndicatorParams): IndicatorResult<T>;

  getValue(index: number, context: IndicatorContext, params: IndicatorParams): T | undefined {
    const result = this.compute(context, params);
    if (index < 0 || index >= result.values.length) {
      return undefined;
    }
    return result.values[index];
  }
}

// ==================== MOVING AVERAGE INDICATORS ====================

/**
 * SMA - Simple Moving Average
 */
export class SMAIndicator extends BaseIndicator<number> {
  constructor() {
    super("sma", "Simple Moving Average", { period: 20, source: "close" });
  }

  compute(context: IndicatorContext, params: IndicatorParams): IndicatorResult<number> {
    const period = (params.period as number) || 20;
    const source = (params.source as string) || "close";
    const data = this.getSource(context.candles, source);

    const values: number[] = new Array(data.length).fill(NaN);

    for (let i = period - 1; i < data.length; i++) {
      if (!this.canAccessIndex(context, i)) break;

      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      values[i] = sum / period;
    }

    return { values, metadata: { period, source } };
  }
}

/**
 * EMA - Exponential Moving Average
 */
export class EMAIndicator extends BaseIndicator<number> {
  constructor() {
    super("ema", "Exponential Moving Average", { period: 20, source: "close" });
  }

  compute(context: IndicatorContext, params: IndicatorParams): IndicatorResult<number> {
    const period = (params.period as number) || 20;
    const source = (params.source as string) || "close";
    const data = this.getSource(context.candles, source);

    const values: number[] = new Array(data.length).fill(NaN);
    const multiplier = 2 / (period + 1);

    // Initial SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    values[period - 1] = sum / period;

    // EMA
    for (let i = period; i < data.length; i++) {
      if (!this.canAccessIndex(context, i)) break;
      values[i] = (data[i] - values[i - 1]) * multiplier + values[i - 1];
    }

    return { values, metadata: { period, source } };
  }
}

/**
 * HMA - Hull Moving Average
 */
export class HMAIndicator extends BaseIndicator<number> {
  constructor() {
    super("hma", "Hull Moving Average", { period: 20, source: "close" });
  }

  compute(context: IndicatorContext, params: IndicatorParams): IndicatorResult<number> {
    const period = (params.period as number) || 20;
    const source = (params.source as string) || "close";
    const data = this.getSource(context.candles, source);

    const halfPeriod = Math.floor(period / 2);
    const sqrtPeriod = Math.floor(Math.sqrt(period));

    // WMA helper
    const wma = (arr: number[], p: number, endIdx: number): number => {
      if (endIdx < p - 1) return NaN;
      let sum = 0;
      let weightSum = 0;
      for (let i = 0; i < p; i++) {
        const weight = i + 1;
        sum += arr[endIdx - p + 1 + i] * weight;
        weightSum += weight;
      }
      return sum / weightSum;
    };

    const values: number[] = new Array(data.length).fill(NaN);

    for (let i = period - 1; i < data.length; i++) {
      if (!this.canAccessIndex(context, i)) break;

      const wmaHalf = wma(data, halfPeriod, i);
      const wmaFull = wma(data, period, i);
      const rawHMA = 2 * wmaHalf - wmaFull;

      // Need more data for second WMA
      if (i >= period - 1 + sqrtPeriod - 1) {
        // Build raw HMA array for WMA calculation
        const rawHMAArr: number[] = [];
        for (let j = period - 1; j <= i; j++) {
          const wh = wma(data, halfPeriod, j);
          const wf = wma(data, period, j);
          rawHMAArr.push(2 * wh - wf);
        }
        values[i] = wma(rawHMAArr, sqrtPeriod, rawHMAArr.length - 1);
      }
    }

    return { values, metadata: { period, source } };
  }
}

// ==================== MOMENTUM INDICATORS ====================

/**
 * RSI - Relative Strength Index
 */
export class RSIIndicator extends BaseIndicator<number> {
  constructor() {
    super("rsi", "Relative Strength Index", { period: 14, source: "close" });
  }

  compute(context: IndicatorContext, params: IndicatorParams): IndicatorResult<number> {
    const period = (params.period as number) || 14;
    const source = (params.source as string) || "close";
    const data = this.getSource(context.candles, source);

    const values: number[] = new Array(data.length).fill(NaN);

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
      values[period] = 100;
    } else {
      const rs = avgGain / avgLoss;
      values[period] = 100 - (100 / (1 + rs));
    }

    // Subsequent RSI
    for (let i = period + 1; i < data.length; i++) {
      if (!this.canAccessIndex(context, i)) break;

      const change = data[i] - data[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        values[i] = 100;
      } else {
        const rs = avgGain / avgLoss;
        values[i] = 100 - (100 / (1 + rs));
      }
    }

    return { values, metadata: { period, source } };
  }
}

/**
 * MACD - Moving Average Convergence Divergence
 */
export class MACDIndicator extends BaseIndicator<{ macd: number; signal: number; histogram: number }> {
  constructor() {
    super("macd", "Moving Average Convergence Divergence", {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      source: "close"
    });
  }

  compute(
    context: IndicatorContext,
    params: IndicatorParams
  ): IndicatorResult<{ macd: number; signal: number; histogram: number }> {
    const fastPeriod = (params.fastPeriod as number) || 12;
    const slowPeriod = (params.slowPeriod as number) || 26;
    const signalPeriod = (params.signalPeriod as number) || 9;
    const source = (params.source as string) || "close";
    const data = this.getSource(context.candles, source);

    // Calculate EMAs
    const calcEMA = (arr: number[], period: number): number[] => {
      const result: number[] = new Array(arr.length).fill(NaN);
      const mult = 2 / (period + 1);

      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += arr[i];
      }
      result[period - 1] = sum / period;

      for (let i = period; i < arr.length; i++) {
        result[i] = (arr[i] - result[i - 1]) * mult + result[i - 1];
      }
      return result;
    };

    const fastEMA = calcEMA(data, fastPeriod);
    const slowEMA = calcEMA(data, slowPeriod);

    // MACD Line
    const macdLine: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
        macdLine.push(NaN);
      } else {
        macdLine.push(fastEMA[i] - slowEMA[i]);
      }
    }

    // Signal Line
    const signalLine = calcEMA(macdLine.filter(v => !isNaN(v)), signalPeriod);

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

    // Histogram
    const values: { macd: number; signal: number; histogram: number }[] = [];
    for (let i = 0; i < data.length; i++) {
      if (!this.canAccessIndex(context, i)) break;

      values.push({
        macd: macdLine[i],
        signal: fullSignal[i],
        histogram: isNaN(macdLine[i]) || isNaN(fullSignal[i])
          ? NaN
          : macdLine[i] - fullSignal[i]
      });
    }

    // Fill rest with NaN
    while (values.length < data.length) {
      values.push({ macd: NaN, signal: NaN, histogram: NaN });
    }

    return {
      values,
      metadata: { fastPeriod, slowPeriod, signalPeriod, source }
    };
  }
}

/**
 * Stochastic Oscillator
 */
export class StochasticIndicator extends BaseIndicator<{ k: number; d: number }> {
  constructor() {
    super("stoch", "Stochastic Oscillator", {
      kPeriod: 14,
      dPeriod: 3,
      smoothK: 1
    });
  }

  compute(context: IndicatorContext, params: IndicatorParams): IndicatorResult<{ k: number; d: number }> {
    const kPeriod = (params.kPeriod as number) || 14;
    const dPeriod = (params.dPeriod as number) || 3;
    const smoothK = (params.smoothK as number) || 1;

    const values: { k: number; d: number }[] = new Array(context.candles.length)
      .fill(null)
      .map(() => ({ k: NaN, d: NaN }));

    const kValues: number[] = new Array(context.candles.length).fill(NaN);

    // Calculate %K
    for (let i = kPeriod - 1; i < context.candles.length; i++) {
      if (!this.canAccessIndex(context, i)) break;

      const slice = context.candles.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));

      if (highestHigh === lowestLow) {
        kValues[i] = 50;
      } else {
        kValues[i] = ((context.candles[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;
      }
    }

    // Smooth %K
    const smoothedK = smoothK > 1 ? this.sma(kValues, smoothK) : kValues;

    // Calculate %D (SMA of %K)
    const dValues = this.sma(smoothedK, dPeriod);

    for (let i = 0; i < context.candles.length; i++) {
      values[i] = { k: smoothedK[i], d: dValues[i] };
    }

    return { values, metadata: { kPeriod, dPeriod, smoothK } };
  }

  private sma(data: number[], period: number): number[] {
    const result: number[] = new Array(data.length).fill(NaN);
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result[i] = sum / period;
    }
    return result;
  }
}

// ==================== VOLATILITY INDICATORS ====================

/**
 * ATR - Average True Range
 */
export class ATRIndicator extends BaseIndicator<number> {
  constructor() {
    super("atr", "Average True Range", { period: 14 });
  }

  compute(context: IndicatorContext, params: IndicatorParams): IndicatorResult<number> {
    const period = (params.period as number) || 14;
    const values: number[] = new Array(context.candles.length).fill(NaN);

    // Calculate True Range
    const tr: number[] = [];
    for (let i = 0; i < context.candles.length; i++) {
      if (i === 0) {
        tr.push(context.candles[i].high - context.candles[i].low);
      } else {
        tr.push(
          Math.max(
            context.candles[i].high - context.candles[i].low,
            Math.abs(context.candles[i].high - context.candles[i - 1].close),
            Math.abs(context.candles[i].low - context.candles[i - 1].close)
          )
        );
      }
    }

    // First ATR = SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += tr[i];
    }
    values[period - 1] = sum / period;

    // Subsequent ATR
    for (let i = period; i < context.candles.length; i++) {
      if (!this.canAccessIndex(context, i)) break;
      values[i] = (values[i - 1] * (period - 1) + tr[i]) / period;
    }

    return { values, metadata: { period } };
  }
}

/**
 * Bollinger Bands
 */
export class BollingerBandsIndicator extends BaseIndicator<{
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}> {
  constructor() {
    super("bollinger", "Bollinger Bands", { period: 20, stdDev: 2, source: "close" });
  }

  compute(
    context: IndicatorContext,
    params: IndicatorParams
  ): IndicatorResult<{ upper: number; middle: number; lower: number; bandwidth: number }> {
    const period = (params.period as number) || 20;
    const stdDev = (params.stdDev as number) || 2;
    const source = (params.source as string) || "close";
    const data = this.getSource(context.candles, source);

    const values: { upper: number; middle: number; lower: number; bandwidth: number }[] =
      new Array(data.length)
        .fill(null)
        .map(() => ({ upper: NaN, middle: NaN, lower: NaN, bandwidth: NaN }));

    for (let i = period - 1; i < data.length; i++) {
      if (!this.canAccessIndex(context, i)) break;

      const slice = data.slice(i - period + 1, i + 1);
      const middle = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
      const std = Math.sqrt(variance);

      const upper = middle + stdDev * std;
      const lower = middle - stdDev * std;
      const bandwidth = middle > 0 ? ((upper - lower) / middle) * 100 : 0;

      values[i] = { upper, middle, lower, bandwidth };
    }

    return { values, metadata: { period, stdDev, source } };
  }
}

// ==================== INDICATOR REGISTRY ====================

/**
 * Реестр индикаторов
 */
export class IndicatorRegistry {
  private static instance: IndicatorRegistry;
  private indicators: Map<string, BaseIndicator> = new Map();

  private constructor() {
    // Register default indicators
    this.register(new SMAIndicator());
    this.register(new EMAIndicator());
    this.register(new HMAIndicator());
    this.register(new RSIIndicator());
    this.register(new MACDIndicator());
    this.register(new StochasticIndicator());
    this.register(new ATRIndicator());
    this.register(new BollingerBandsIndicator());
  }

  static getInstance(): IndicatorRegistry {
    if (!IndicatorRegistry.instance) {
      IndicatorRegistry.instance = new IndicatorRegistry();
    }
    return IndicatorRegistry.instance;
  }

  register(indicator: BaseIndicator): void {
    this.indicators.set(indicator.id, indicator);
  }

  get(id: string): BaseIndicator | undefined {
    return this.indicators.get(id);
  }

  getAll(): BaseIndicator[] {
    return Array.from(this.indicators.values());
  }

  /**
   * Создать контекст для расчёта индикаторов
   */
  createContext(
    candles: Candle[],
    currentIndex: number = candles.length - 1,
    lookAheadProtection: boolean = true
  ): IndicatorContext {
    return {
      candles,
      currentIndex,
      lookAheadProtection,
      cache: new Map()
    };
  }

  /**
   * Вычислить индикатор
   */
  compute<T = number>(
    indicatorId: string,
    candles: Candle[],
    params: IndicatorParams = {},
    lookAheadProtection: boolean = true
  ): IndicatorResult<T> | null {
    const indicator = this.indicators.get(indicatorId);
    if (!indicator) {
      console.warn(`Indicator "${indicatorId}" not found`);
      return null;
    }

    const context = this.createContext(candles, candles.length - 1, lookAheadProtection);
    const mergedParams = { ...indicator.defaultParams, ...params };

    return indicator.compute(context, mergedParams) as IndicatorResult<T>;
  }
}

// ==================== COMPOSITE INDICATORS ====================

/**
 * Составной индикатор - позволяет комбинировать несколько индикаторов
 */
export class CompositeIndicator extends BaseIndicator<Record<string, unknown>> {
  private indicators: Array<{
    id: string;
    params: IndicatorParams;
    alias: string;
  }> = [];

  constructor(id: string, name: string) {
    super(id, name, {});
  }

  /**
   * Добавить индикатор в композицию
   */
  addIndicator(
    indicatorId: string,
    alias: string,
    params: IndicatorParams = {}
  ): this {
    this.indicators.push({ id: indicatorId, params, alias });
    this.dependencies.push(indicatorId);
    return this;
  }

  compute(
    context: IndicatorContext,
    params: IndicatorParams
  ): IndicatorResult<Record<string, unknown>> {
    const registry = IndicatorRegistry.getInstance();
    const result: Record<string, unknown>[] = new Array(context.candles.length)
      .fill(null)
      .map(() => ({}));

    for (const { id, params: indicatorParams, alias } of this.indicators) {
      const indicator = registry.get(id);
      if (!indicator) continue;

      const mergedParams = { ...indicator.defaultParams, ...indicatorParams, ...params };
      const indicatorResult = indicator.compute(context, mergedParams);

      for (let i = 0; i < indicatorResult.values.length; i++) {
        result[i][alias] = indicatorResult.values[i];
      }
    }

    return { values: result };
  }
}

// ==================== EXPORTS ====================

export const indicatorRegistry = IndicatorRegistry.getInstance();

export {
  SMAIndicator,
  EMAIndicator,
  HMAIndicator,
  RSIIndicator,
  MACDIndicator,
  StochasticIndicator,
  ATRIndicator,
  BollingerBandsIndicator,
  CompositeIndicator
};
