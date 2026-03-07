/**
 * Strategy Types
 * 
 * Типы и интерфейсы для торговых стратегий.
 * Стратегия определяет КОГДА входить в позицию.
 * Тактики определяют КАК входить и управлять позицией.
 */

import { TacticsSet } from "./tactics/types";

// ==================== CANDLE DATA ====================

/**
 * Данные свечи (OHLCV)
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Таймфрейм
 */
export type Timeframe = 
  | "1m" | "3m" | "5m" | "15m" | "30m" | "45m"
  | "1h" | "2h" | "3h" | "4h" | "6h" | "8h" | "12h"
  | "1d" | "3d" | "1w" | "1M";

// ==================== INDICATORS ====================

/**
 * Результат расчёта индикаторов
 */
export interface IndicatorResult {
  // Trend Indicators
  sma?: Record<number, number[]>;       // Simple Moving Average
  ema?: Record<number, number[]>;       // Exponential Moving Average
  wma?: Record<number, number[]>;       // Weighted Moving Average
  
  // Momentum Indicators
  rsi?: Record<number, number[]>;       // Relative Strength Index
  macd?: {
    macd: number[];
    signal: number[];
    histogram: number[];
  };
  stoch?: {
    k: number[];
    d: number[];
  };
  cci?: number[];                       // Commodity Channel Index
  
  // Volatility Indicators
  bollingerBands?: {
    upper: number[];
    middle: number[];
    lower: number[];
  };
  atr?: number[];                       // Average True Range
  keltner?: {
    upper: number[];
    middle: number[];
    lower: number[];
  };
  
  // Volume Indicators
  obv?: number[];                       // On Balance Volume
  vwap?: number[];                      // Volume Weighted Average Price
  mfi?: number[];                       // Money Flow Index
  
  // Support/Resistance
  pivotPoints?: {
    pp: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  };
  fibonacciRetracement?: {
    level0: number;
    level236: number;
    level382: number;
    level500: number;
    level618: number;
    level786: number;
    level1000: number;
  };
  
  // Custom indicators
  custom?: Record<string, number[]>;
}

// ==================== SIGNALS ====================

/**
 * Тип торгового сигнала
 */
export type SignalType = "LONG" | "SHORT" | "EXIT_LONG" | "EXIT_SHORT" | "NO_SIGNAL";

/**
 * Сигнал стратегии
 */
export interface StrategySignal {
  /** Тип сигнала */
  type: SignalType;
  /** Уверенность в сигнале (0-100) */
  confidence: number;
  /** Символ */
  symbol: string;
  /** Таймфрейм */
  timeframe: Timeframe;
  /** Время генерации */
  timestamp: Date;
  
  /** Цена на момент сигнала */
  price: number;
  /** Рекомендуемые цены входа (если LIMIT) */
  suggestedEntryPrices?: number[];
  /** Рекомендуемые TP */
  suggestedTakeProfits?: { price: number; percent: number }[];
  /** Рекомендуемый SL */
  suggestedStopLoss?: number;
  
  /** Причина сигнала */
  reason: string;
  /** Дополнительные данные */
  metadata?: Record<string, unknown>;
  
  /** Связанный набор тактик (если есть) */
  tacticsSet?: TacticsSet;
}

// ==================== STRATEGY INTERFACE ====================

/**
 * Параметры стратегии для оптимизации
 */
export interface StrategyParameter {
  /** Имя параметра */
  name: string;
  /** Описание */
  description?: string;
  /** Тип */
  type: "number" | "integer" | "boolean" | "string" | "select";
  /** Значение по умолчанию */
  defaultValue: number | boolean | string;
  /** Минимум (для number) */
  min?: number;
  /** Максимум (для number) */
  max?: number;
  /** Шаг (для number) */
  step?: number;
  /** Варианты (для select) */
  options?: string[];
  /** Категория для группировки */
  category?: string;
}

/**
 * Конфигурация стратегии
 */
export interface StrategyConfig {
  /** ID стратегии */
  id: string;
  /** Название */
  name: string;
  /** Описание */
  description?: string;
  /** Версия */
  version: string;
  /** Автор */
  author?: string;
  
  /** Поддерживаемые таймфреймы */
  timeframes: Timeframe[];
  /** Таймфрейм по умолчанию */
  defaultTimeframe: Timeframe;
  
  /** Параметры стратегии */
  parameters: StrategyParameter[];
  
  /** Наборы тактик по умолчанию */
  defaultTactics?: TacticsSet[];
  
  /** Теги */
  tags?: string[];
  
  /** Минимальная история свечей для работы */
  minCandlesRequired: number;
}

/**
 * Состояние стратегии
 */
export interface StrategyState {
  /** ID стратегии */
  strategyId: string;
  /** Текущие параметры */
  parameters: Record<string, number | boolean | string>;
  /** Последний сигнал */
  lastSignal?: StrategySignal;
  /** История сигналов */
  signalHistory?: StrategySignal[];
  /** Кэшированные индикаторы */
  cachedIndicators?: IndicatorResult;
  /** Время последнего обновления */
  lastUpdate?: Date;
}

/**
 * Интерфейс торговой стратегии
 */
export interface IStrategy {
  // === Meta Information ===
  /** Получить конфигурацию стратегии */
  getConfig(): StrategyConfig;
  
  // === Initialization ===
  /** Инициализировать стратегию с параметрами */
  initialize(parameters?: Record<string, number | boolean | string>): void;
  
  // === Analysis ===
  /** Рассчитать индикаторы */
  populateIndicators(candles: Candle[]): IndicatorResult;
  
  /** Сгенерировать сигнал входа */
  populateEntrySignal(
    candles: Candle[],
    indicators: IndicatorResult,
    currentPrice: number
  ): StrategySignal | null;
  
  /** Сгенерировать сигнал выхода */
  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: {
      direction: "LONG" | "SHORT";
      entryPrice: number;
      currentPrice: number;
      size: number;
      openTime: Date;
    }
  ): StrategySignal | null;
  
  // === State Management ===
  /** Получить текущее состояние */
  getState(): StrategyState;
  
  /** Установить параметры */
  setParameters(params: Record<string, number | boolean | string>): void;
  
  /** Сбросить состояние */
  reset(): void;
}

// ==================== BASE STRATEGY ====================

/**
 * Базовый класс для стратегий
 */
export abstract class BaseStrategy implements IStrategy {
  protected config: StrategyConfig;
  protected state: StrategyState;
  protected parameters: Record<string, number | boolean | string>;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.parameters = {};
    this.state = {
      strategyId: config.id,
      parameters: {},
    };

    // Устанавливаем параметры по умолчанию
    this.initialize();
  }

  getConfig(): StrategyConfig {
    return this.config;
  }

  initialize(parameters?: Record<string, number | boolean | string>): void {
    // Устанавливаем дефолтные значения
    for (const param of this.config.parameters) {
      this.parameters[param.name] = param.defaultValue;
    }

    // Переопределяем переданными значениями
    if (parameters) {
      this.setParameters(parameters);
    }

    this.state.parameters = { ...this.parameters };
  }

  setParameters(params: Record<string, number | boolean | string>): void {
    for (const [key, value] of Object.entries(params)) {
      if (key in this.parameters) {
        this.parameters[key] = value;
      }
    }
    this.state.parameters = { ...this.parameters };
  }

  getState(): StrategyState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      strategyId: this.config.id,
      parameters: { ...this.parameters },
    };
  }

  // Абстрактные методы - должны быть реализованы в наследниках
  abstract populateIndicators(candles: Candle[]): IndicatorResult;
  abstract populateEntrySignal(
    candles: Candle[],
    indicators: IndicatorResult,
    currentPrice: number
  ): StrategySignal | null;
  abstract populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: {
      direction: "LONG" | "SHORT";
      entryPrice: number;
      currentPrice: number;
      size: number;
      openTime: Date;
    }
  ): StrategySignal | null;
}

// ==================== STRATEGY RESULT ====================

/**
 * Результат анализа стратегии
 */
export interface StrategyAnalysisResult {
  /** Стратегия */
  strategyId: string;
  /** Символ */
  symbol: string;
  /** Таймфрейм */
  timeframe: Timeframe;
  /** Время анализа */
  timestamp: Date;
  
  /** Текущая цена */
  currentPrice: number;
  /** Рассчитанные индикаторы */
  indicators: IndicatorResult;
  /** Сгенерированный сигнал (если есть) */
  signal: StrategySignal | null;
  
  /** Ошибки */
  errors?: string[];
  /** Предупреждения */
  warnings?: string[];
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Конвертировать строку таймфрейма в миллисекунды
 */
export function timeframeToMs(timeframe: Timeframe): number {
  const map: Record<Timeframe, number> = {
    "1m": 60 * 1000,
    "3m": 3 * 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "45m": 45 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "2h": 2 * 60 * 60 * 1000,
    "3h": 3 * 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "8h": 8 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
  };
  return map[timeframe];
}

/**
 * Валидация параметров стратегии
 */
export function validateStrategyParameters(
  config: StrategyConfig,
  params: Record<string, number | boolean | string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const param of config.parameters) {
    const value = params[param.name];

    if (value === undefined) {
      errors.push(`Parameter "${param.name}" is required`);
      continue;
    }

    switch (param.type) {
      case "number":
        if (typeof value !== "number") {
          errors.push(`Parameter "${param.name}" must be a number`);
        } else {
          if (param.min !== undefined && value < param.min) {
            errors.push(`Parameter "${param.name}" must be >= ${param.min}`);
          }
          if (param.max !== undefined && value > param.max) {
            errors.push(`Parameter "${param.name}" must be <= ${param.max}`);
          }
        }
        break;

      case "integer":
        if (typeof value !== "number" || !Number.isInteger(value)) {
          errors.push(`Parameter "${param.name}" must be an integer`);
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          errors.push(`Parameter "${param.name}" must be a boolean`);
        }
        break;

      case "string":
        if (typeof value !== "string") {
          errors.push(`Parameter "${param.name}" must be a string`);
        }
        break;

      case "select":
        if (param.options && !param.options.includes(String(value))) {
          errors.push(`Parameter "${param.name}" must be one of: ${param.options.join(", ")}`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
