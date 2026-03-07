/**
 * Look-Ahead Protection System
 * 
 * Система защиты от look-ahead bias в бэктестах.
 * Вдохновлено подходом Jesse (https://jesse.trade)
 * 
 * Look-ahead bias - это использование будущей информации
 * для принятия решений в текущий момент времени.
 * Это одна из самых частых ошибок в бэктестинге.
 * 
 * Особенности:
 * - Автоматическая проверка доступа к данным
 * - Временные метки для каждой точки данных
 * - Детекция look-ahead в индикаторах
 * - Режим строгой и мягкой проверки
 * - Логирование нарушений
 * 
 * @see https://jesse.trade/blog/news/meet-jesse-a-python-trading-framework-for-cryptocurrencies
 */

import { Candle } from "../strategy/types";

// ==================== TYPES ====================

/**
 * Режим защиты
 */
export type ProtectionMode = "strict" | "moderate" | "disabled";

/**
 * Нарушение look-ahead
 */
export interface LookAheadViolation {
  /** Время нарушения */
  timestamp: number;
  /** Индекс текущей свечи */
  currentIndex: number;
  /** Индекс к которому был доступ */
  accessedIndex: number;
  /** Описание */
  description: string;
  /** Источник (индикатор, стратегия и т.д.) */
  source: string;
  /** Серьёзность */
  severity: "warning" | "error" | "critical";
}

/**
 * Конфигурация защиты
 */
export interface LookAheadProtectionConfig {
  /** Режим защиты */
  mode: ProtectionMode;
  /** Логировать нарушения */
  logViolations: boolean;
  /** Максимальное допустимое опережение (в свечах) */
  maxLookAhead: number;
  /** Бросать исключение при нарушении */
  throwOnViolation: boolean;
  /** Коллектор нарушений */
  onViolation?: (violation: LookAheadViolation) => void;
}

/**
 * Точка данных с временной меткой
 */
export interface TimestampedData<T> {
  /** Значение */
  value: T;
  /** Временная метка (индекс свечи) */
  timestamp: number;
  /** Валидно ли значение */
  valid: boolean;
}

/**
 * Контекст защищённого доступа
 */
export interface ProtectedContext {
  /** Текущий индекс */
  currentIndex: number;
  /** Режим защиты */
  mode: ProtectionMode;
  /** Проверить доступ */
  canAccess: (index: number, source?: string) => boolean;
  /** Получить значение с защитой */
  getProtected: <T>(data: T[], index: number, source?: string) => T | undefined;
  /** Записать нарушение */
  recordViolation: (violation: Omit<LookAheadViolation, "timestamp">) => void;
  /** Получить все нарушения */
  getViolations: () => LookAheadViolation[];
}

// ==================== LOOK-AHEAD PROTECTOR ====================

/**
 * Защитник от look-ahead bias
 */
export class LookAheadProtector {
  private config: LookAheadProtectionConfig;
  private violations: LookAheadViolation[] = [];
  private currentIndex: number = 0;

  constructor(config: Partial<LookAheadProtectionConfig> = {}) {
    this.config = {
      mode: config.mode || "strict",
      logViolations: config.logViolations ?? true,
      maxLookAhead: config.maxLookAhead ?? 0,
      throwOnViolation: config.throwOnViolation ?? false,
      onViolation: config.onViolation
    };
  }

  /**
   * Установить текущий индекс
   */
  setCurrentIndex(index: number): void {
    this.currentIndex = index;
  }

  /**
   * Получить текущий индекс
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Проверить доступ к индексу
   */
  canAccess(index: number, source: string = "unknown"): boolean {
    if (this.config.mode === "disabled") {
      return true;
    }

    const lookAhead = index - this.currentIndex;

    if (lookAhead > this.config.maxLookAhead) {
      this.recordViolation({
        currentIndex: this.currentIndex,
        accessedIndex: index,
        description: `Attempted to access future data at index ${index} while at index ${this.currentIndex}`,
        source,
        severity: lookAhead > 5 ? "critical" : lookAhead > 1 ? "error" : "warning"
      });

      if (this.config.mode === "strict") {
        return false;
      }
    }

    return true;
  }

  /**
   * Получить значение с защитой
   */
  getProtectedValue<T>(data: T[], index: number, source: string = "unknown"): T | undefined {
    if (!this.canAccess(index, source)) {
      return undefined;
    }

    if (index < 0 || index >= data.length) {
      return undefined;
    }

    return data[index];
  }

  /**
   * Создать защищённый контекст
   */
  createContext(): ProtectedContext {
    return {
      currentIndex: this.currentIndex,
      mode: this.config.mode,

      canAccess: (index: number, source: string = "unknown"): boolean => {
        return this.canAccess(index, source);
      },

      getProtected: <T>(data: T[], index: number, source: string = "unknown"): T | undefined => {
        return this.getProtectedValue(data, index, source);
      },

      recordViolation: (violation: Omit<LookAheadViolation, "timestamp">): void => {
        this.recordViolation(violation);
      },

      getViolations: (): LookAheadViolation[] => {
        return [...this.violations];
      }
    };
  }

  /**
   * Записать нарушение
   */
  private recordViolation(violation: Omit<LookAheadViolation, "timestamp">): void {
    const fullViolation: LookAheadViolation = {
      ...violation,
      timestamp: Date.now()
    };

    this.violations.push(fullViolation);

    if (this.config.logViolations) {
      const level = violation.severity === "critical"
        ? "error"
        : violation.severity === "error"
          ? "warn"
          : "log";

      console[level](
        `[LookAhead Protection] ${violation.severity.toUpperCase()}: ${violation.description} (source: ${violation.source})`
      );
    }

    if (this.config.onViolation) {
      this.config.onViolation(fullViolation);
    }

    if (this.config.throwOnViolation && violation.severity === "critical") {
      throw new Error(`Look-ahead bias detected: ${violation.description}`);
    }
  }

  /**
   * Получить все нарушения
   */
  getViolations(): LookAheadViolation[] {
    return [...this.violations];
  }

  /**
   * Очистить нарушения
   */
  clearViolations(): void {
    this.violations = [];
  }

  /**
   * Получить статистику нарушений
   */
  getStats(): {
    total: number;
    critical: number;
    errors: number;
    warnings: number;
  } {
    return {
      total: this.violations.length,
      critical: this.violations.filter(v => v.severity === "critical").length,
      errors: this.violations.filter(v => v.severity === "error").length,
      warnings: this.violations.filter(v => v.severity === "warning").length
    };
  }

  /**
   * Сбросить состояние
   */
  reset(): void {
    this.currentIndex = 0;
    this.violations = [];
  }
}

// ==================== TIMESTAMPED DATA STORE ====================

/**
 * Хранилище данных с временными метками
 */
export class TimestampedDataStore {
  private data: Map<string, TimestampedData<unknown>[]> = new Map();
  private protector: LookAheadProtector;

  constructor(protector: LookAheadProtector) {
    this.protector = protector;
  }

  /**
   * Добавить данные с временной меткой
   */
  setData<T>(key: string, values: T[]): void {
    const timestamped: TimestampedData<T>[] = values.map((value, index) => ({
      value,
      timestamp: index,
      valid: true
    }));
    this.data.set(key, timestamped);
  }

  /**
   * Получить значение с защитой
   */
  getValue<T>(key: string, index: number, source: string = "unknown"): T | undefined {
    const arr = this.data.get(key);
    if (!arr) return undefined;

    if (!this.protector.canAccess(index, `${source}:${key}`)) {
      return undefined;
    }

    if (index < 0 || index >= arr.length) {
      return undefined;
    }

    const item = arr[index];
    return item.valid ? (item.value as T) : undefined;
  }

  /**
   * Получить массив значений до текущего индекса
   */
  getValuesUpToCurrent<T>(key: string): T[] {
    const arr = this.data.get(key);
    if (!arr) return [];

    const currentIndex = this.protector.getCurrentIndex();
    return arr
      .slice(0, currentIndex + 1)
      .filter(item => item.valid)
      .map(item => item.value as T);
  }

  /**
   * Проверить наличие данных
   */
  hasData(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Очистить хранилище
   */
  clear(): void {
    this.data.clear();
  }
}

// ==================== INDICATOR LOOK-AHEAD VALIDATOR ====================

/**
 * Валидатор индикаторов на look-ahead bias
 */
export class IndicatorValidator {
  private protector: LookAheadProtector;

  constructor(protector: LookAheadProtector) {
    this.protector = protector;
  }

  /**
   * Проверить индикатор на look-ahead bias
   * 
   * Метод тестирует индикатор на разных точках данных
   * и проверяет, что значения не изменяются при добавлении
   * будущих данных.
   */
  validateIndicator(
    computeFn: (candles: Candle[]) => number[],
    testData: Candle[],
    checkPoints: number[] = [0.25, 0.5, 0.75, 1.0]
  ): {
    valid: boolean;
    violations: LookAheadViolation[];
    details: Array<{
      checkPoint: number;
      index: number;
      valueWithPartial: number;
      valueWithFull: number;
      changed: boolean;
    }>;
  } {
    const violations: LookAheadViolation[] = [];
    const details: Array<{
      checkPoint: number;
      index: number;
      valueWithPartial: number;
      valueWithFull: number;
      changed: boolean;
    }> = [];

    // Вычисляем с полными данными
    const fullResult = computeFn(testData);

    for (const point of checkPoints) {
      const partialIndex = Math.floor(testData.length * point);
      const partialData = testData.slice(0, partialIndex + 1);

      // Вычисляем с частичными данными
      const partialResult = computeFn(partialData);

      // Сравниваем значения
      for (let i = 0; i < partialIndex; i++) {
        const partialValue = partialResult[i];
        const fullValue = fullResult[i];

        const changed = !isNaN(partialValue) && !isNaN(fullValue) &&
          Math.abs(partialValue - fullValue) > 0.0001;

        details.push({
          checkPoint: point,
          index: i,
          valueWithPartial: partialValue,
          valueWithFull: fullValue,
          changed
        });

        if (changed) {
          violations.push({
            timestamp: Date.now(),
            currentIndex: i,
            accessedIndex: partialIndex,
            description: `Indicator value at index ${i} changed when data was added up to index ${partialIndex}`,
            source: "indicator-validator",
            severity: "critical"
          });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      details
    };
  }

  /**
   * Проверить, что стратегия не использует будущие данные
   */
  validateStrategy(
    strategy: {
      populateIndicators: (candles: Candle[]) => Record<string, unknown>;
      populateEntrySignal: (
        candles: Candle[],
        indicators: Record<string, unknown>,
        price: number
      ) => unknown;
    },
    testData: Candle[]
  ): {
    valid: boolean;
    violations: LookAheadViolation[];
  } {
    const violations: LookAheadViolation[] = [];
    const results: Array<{
      index: number;
      signal: unknown;
    }> = [];

    // Прогоняем стратегию с инкрементальными данными
    for (let i = 20; i < testData.length; i++) {
      this.protector.setCurrentIndex(i);
      const partialData = testData.slice(0, i + 1);

      try {
        const indicators = strategy.populateIndicators(partialData);
        const signal = strategy.populateEntrySignal(
          partialData,
          indicators,
          testData[i].close
        );

        results.push({ index: i, signal });
      } catch (error) {
        violations.push({
          timestamp: Date.now(),
          currentIndex: i,
          accessedIndex: -1,
          description: `Strategy error at index ${i}: ${error}`,
          source: "strategy-validator",
          severity: "error"
        });
      }
    }

    // Проверяем, что сигналы не изменяются при добавлении данных
    const fullIndicators = strategy.populateIndicators(testData);

    for (let i = 20; i < testData.length; i++) {
      this.protector.setCurrentIndex(i);
      const partialData = testData.slice(0, i + 1);

      const partialIndicators = strategy.populateIndicators(partialData);
      const partialSignal = strategy.populateEntrySignal(
        partialData,
        partialIndicators,
        testData[i].close
      );

      const fullSignalAtPoint = strategy.populateEntrySignal(
        testData.slice(0, i + 1),
        fullIndicators,
        testData[i].close
      );

      // Простое сравнение сигналов
      const partialSignalStr = JSON.stringify(partialSignal);
      const fullSignalStr = JSON.stringify(fullSignalAtPoint);

      if (partialSignalStr !== fullSignalStr) {
        violations.push({
          timestamp: Date.now(),
          currentIndex: i,
          accessedIndex: testData.length,
          description: `Signal at index ${i} depends on future data`,
          source: "strategy-validator",
          severity: "warning"
        });
      }
    }

    return {
      valid: violations.filter(v => v.severity === "critical").length === 0,
      violations
    };
  }
}

// ==================== PROTECTED BACKTEST HELPERS ====================

/**
 * Защищённый итератор свечей
 */
export class ProtectedCandleIterator {
  private candles: Candle[];
  private protector: LookAheadProtector;
  private currentIndex: number = 0;

  constructor(candles: Candle[], protector: LookAheadProtector) {
    this.candles = candles;
    this.protector = protector;
  }

  /**
   * Получить текущую свечу
   */
  current(): Candle | undefined {
    return this.candles[this.currentIndex];
  }

  /**
   * Получить предыдущую свечу
   */
  previous(offset: number = 1): Candle | undefined {
    const index = this.currentIndex - offset;
    if (!this.protector.canAccess(index, "candle-iterator")) {
      return undefined;
    }
    return this.candles[index];
  }

  /**
   * Получить N предыдущих свечей
   */
  getPrevious(count: number): Candle[] {
    const startIndex = Math.max(0, this.currentIndex - count + 1);
    const endIndex = this.currentIndex;

    if (!this.protector.canAccess(endIndex, "candle-iterator")) {
      return [];
    }

    return this.candles.slice(startIndex, endIndex + 1);
  }

  /**
   * Переместиться к следующей свече
   */
  next(): boolean {
    if (this.currentIndex < this.candles.length - 1) {
      this.currentIndex++;
      this.protector.setCurrentIndex(this.currentIndex);
      return true;
    }
    return false;
  }

  /**
   * Сбросить итератор
   */
  reset(): void {
    this.currentIndex = 0;
    this.protector.setCurrentIndex(0);
  }

  /**
   * Проверить, есть ли следующая свеча
   */
  hasNext(): boolean {
    return this.currentIndex < this.candles.length - 1;
  }

  /**
   * Получить текущий индекс
   */
  getIndex(): number {
    return this.currentIndex;
  }

  /**
   * Получить все доступные свечи (до текущего индекса)
   */
  getAvailableCandles(): Candle[] {
    return this.candles.slice(0, this.currentIndex + 1);
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Создать защитник по умолчанию
 */
export function createDefaultProtector(
  mode: ProtectionMode = "strict"
): LookAheadProtector {
  return new LookAheadProtector({ mode });
}

/**
 * Создать защищённый контекст для бэктеста
 */
export function createProtectedBacktestContext(
  candles: Candle[],
  mode: ProtectionMode = "strict"
): {
  protector: LookAheadProtector;
  iterator: ProtectedCandleIterator;
  dataStore: TimestampedDataStore;
  validator: IndicatorValidator;
} {
  const protector = new LookAheadProtector({ mode });
  const iterator = new ProtectedCandleIterator(candles, protector);
  const dataStore = new TimestampedDataStore(protector);
  const validator = new IndicatorValidator(protector);

  return { protector, iterator, dataStore, validator };
}

// ==================== EXPORTS ====================

export {
  LookAheadProtector,
  TimestampedDataStore,
  IndicatorValidator,
  ProtectedCandleIterator
};
