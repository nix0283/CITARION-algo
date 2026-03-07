/**
 * Adaptive Grid Bot
 * 
 * Динамическая адаптация сетки на основе волатильности:
 * - Расчёт метрик волатильности (ATR, Bollinger Bands, Historical Volatility)
 * - Автоматическая адаптация количества уровней и диапазона сетки
 * - Trailing grid - сдвиг сетки за ценой при сильном движении
 * - Ребалансировка при выходе цены за пределы сетки
 */

import { Candle } from "../strategy/types";
import { GridLevel } from "../grid-bot-worker";

// ==================== INTERFACES ====================

/**
 * Метрики волатильности
 */
export interface VolatilityMetrics {
  /** Average True Range */
  atr: number;
  /** ATR как % от цены */
  atrPercent: number;
  /** Ширина Bollinger Bands */
  bollingerWidth: number;
  /** Историческая волатильность (годовая, в %) */
  historicalVolatility: number;
}

/**
 * Настройка сетки при адаптации
 */
export interface GridAdjustment {
  /** Новое количество уровней сетки */
  newGridCount: number;
  /** Новая верхняя граница цены */
  newUpperPrice: number;
  /** Новая нижняя граница цены */
  newLowerPrice: number;
  /** Причина изменения */
  reason: string;
}

/**
 * Базовая конфигурация сетки
 */
export interface GridConfig {
  /** Количество уровней */
  gridCount: number;
  /** Верхняя граница цены */
  upperPrice: number;
  /** Нижняя граница цены */
  lowerPrice: number;
  /** Тип сетки */
  gridType: "ARITHMETIC" | "GEOMETRIC";
  /** Направление */
  direction: "LONG" | "SHORT";
}

/**
 * Состояние адаптивной сетки
 */
export interface AdaptiveGridState {
  /** Базовая конфигурация */
  baseConfig: GridConfig;
  /** Базовый ATR (зафиксированный при старте) */
  baseAtr: number;
  /** Текущие метрики волатильности */
  currentVolatility: VolatilityMetrics | null;
  /** Центр сетки */
  gridCenter: number;
  /** Последняя проверка */
  lastCheckAt: Date | null;
  /** История адаптаций */
  adaptationHistory: GridAdjustment[];
}

// ==================== CONSTANTS ====================

/** Пороги для адаптации */
const VOLATILITY_THRESHOLD_EXPAND = 1.5; // 50% рост волатильности = расширение
const VOLATILITY_THRESHOLD_CONTRACT = 0.5; // 50% падение волатильности = сужение
const MIN_GRID_COUNT = 5;
const MAX_GRID_COUNT = 50;
const GRID_COUNT_VOLATILITY_FACTOR = 0.3; // Множитель для корректировки кол-ва уровней
const TRAILING_THRESHOLD_PERCENT = 0.3; // 30% от ширины сетки для trailing

// ==================== ADAPTIVE GRID BOT CLASS ====================

/**
 * Класс адаптивной сетки
 */
export class AdaptiveGridBot {
  private state: AdaptiveGridState;
  private rebalanceThreshold: number;
  private trailingEnabled: boolean;

  constructor(
    config: GridConfig,
    options: {
      baseAtr?: number;
      rebalanceThreshold?: number;
      trailingEnabled?: boolean;
    } = {}
  ) {
    const gridCenter = (config.upperPrice + config.lowerPrice) / 2;

    this.state = {
      baseConfig: config,
      baseAtr: options.baseAtr || 0,
      currentVolatility: null,
      gridCenter,
      lastCheckAt: null,
      adaptationHistory: [],
    };

    this.rebalanceThreshold = options.rebalanceThreshold || 0.05; // 5% по умолчанию
    this.trailingEnabled = options.trailingEnabled ?? false;
  }

  // ==================== VOLATILITY CALCULATIONS ====================

  /**
   * Рассчитать метрики волатильности на основе свечей
   */
  calculateVolatility(candles: Candle[]): VolatilityMetrics {
    if (candles.length < 14) {
      throw new Error("Need at least 14 candles for volatility calculation");
    }

    const atr = this.calculateATR(candles, 14);
    const atrPercent = (atr / candles[candles.length - 1].close) * 100;
    const bollingerWidth = this.calculateBollingerWidth(candles, 20, 2);
    const historicalVolatility = this.calculateHistoricalVolatility(candles, 20);

    return {
      atr,
      atrPercent,
      bollingerWidth,
      historicalVolatility,
    };
  }

  /**
   * Рассчитать ATR (Average True Range)
   */
  private calculateATR(candles: Candle[], period: number = 14): number {
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

    // Берем последние period значений
    const recentRanges = trueRanges.slice(-period);
    return recentRanges.reduce((sum, tr) => sum + tr, 0) / recentRanges.length;
  }

  /**
   * Рассчитать ширину Bollinger Bands
   */
  private calculateBollingerWidth(
    candles: Candle[],
    period: number = 20,
    stdDev: number = 2
  ): number {
    if (candles.length < period) {
      return 0;
    }

    const closes = candles.slice(-period).map((c) => c.close);
    const sma = closes.reduce((sum, c) => sum + c, 0) / period;

    // Standard deviation
    const squaredDiffs = closes.map((c) => Math.pow(c - sma, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / period;
    const std = Math.sqrt(variance);

    // Width = (Upper - Lower) / SMA * 100
    const upper = sma + stdDev * std;
    const lower = sma - stdDev * std;

    return ((upper - lower) / sma) * 100;
  }

  /**
   * Рассчитать историческую волатильность (годовая)
   */
  private calculateHistoricalVolatility(candles: Candle[], period: number = 20): number {
    if (candles.length < period + 1) {
      return 0;
    }

    // Рассчитываем логарифмические доходности
    const returns: number[] = [];
    for (let i = candles.length - period; i < candles.length; i++) {
      const logReturn = Math.log(candles[i].close / candles[i - 1].close);
      returns.push(logReturn);
    }

    // Средняя доходность
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Стандартное отклонение
    const squaredDiffs = returns.map((r) => Math.pow(r - meanReturn, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / returns.length;
    const std = Math.sqrt(variance);

    // Годовая волатильность (предполагаем 365 дней, 24/7 для крипто)
    const annualizedVolatility = std * Math.sqrt(365 * 24) * 100;

    return annualizedVolatility;
  }

  // ==================== GRID ADAPTATION ====================

  /**
   * Адаптировать уровни сетки на основе текущей волатильности
   */
  adjustGridLevels(
    currentVolatility: VolatilityMetrics,
    baseConfig: GridConfig
  ): GridAdjustment {
    const { baseAtr } = this.state;
    
    // Если нет базового ATR, устанавливаем текущий как базовый
    if (baseAtr === 0) {
      this.state.baseAtr = currentVolatility.atr;
      return {
        newGridCount: baseConfig.gridCount,
        newUpperPrice: baseConfig.upperPrice,
        newLowerPrice: baseConfig.lowerPrice,
        reason: "Initial volatility baseline established",
      };
    }

    // Рассчитываем отношение текущей волатильности к базовой
    const volatilityRatio = currentVolatility.atr / baseAtr;
    const currentPrice = baseConfig.upperPrice; // Используем текущую цену как точку отсчёта

    let newGridCount = baseConfig.gridCount;
    let newUpperPrice = baseConfig.upperPrice;
    let newLowerPrice = baseConfig.lowerPrice;
    let reason = "No adjustment needed";

    // === Расширение сетки при росте волатильности ===
    if (volatilityRatio > VOLATILITY_THRESHOLD_EXPAND) {
      // Волатильность выросла более чем на 50%
      const expandFactor = 1 + (volatilityRatio - 1) * GRID_COUNT_VOLATILITY_FACTOR;
      
      // Расширяем диапазон
      const range = baseConfig.upperPrice - baseConfig.lowerPrice;
      const newRange = range * expandFactor;
      const center = (baseConfig.upperPrice + baseConfig.lowerPrice) / 2;
      
      newUpperPrice = center + newRange / 2;
      newLowerPrice = center - newRange / 2;
      
      // Увеличиваем количество уровней
      newGridCount = Math.min(
        MAX_GRID_COUNT,
        Math.floor(baseConfig.gridCount * expandFactor)
      );
      
      reason = `Volatility increased by ${((volatilityRatio - 1) * 100).toFixed(1)}% - expanding grid`;
    }
    // === Сужение сетки при падении волатильности ===
    else if (volatilityRatio < VOLATILITY_THRESHOLD_CONTRACT) {
      // Волатильность упала более чем на 50%
      const contractFactor = volatilityRatio + (1 - volatilityRatio) * GRID_COUNT_VOLATILITY_FACTOR;
      
      // Сужаем диапазон
      const range = baseConfig.upperPrice - baseConfig.lowerPrice;
      const newRange = range * contractFactor;
      const center = (baseConfig.upperPrice + baseConfig.lowerPrice) / 2;
      
      newUpperPrice = center + newRange / 2;
      newLowerPrice = center - newRange / 2;
      
      // Уменьшаем количество уровней
      newGridCount = Math.max(
        MIN_GRID_COUNT,
        Math.floor(baseConfig.gridCount * contractFactor)
      );
      
      reason = `Volatility decreased by ${((1 - volatilityRatio) * 100).toFixed(1)}% - contracting grid`;
    }
    // === Умеренная адаптация при небольших изменениях ===
    else if (volatilityRatio > 1.1 || volatilityRatio < 0.9) {
      // Изменение волатильности на 10-50%
      const adjustmentFactor = 1 + (volatilityRatio - 1) * 0.1;
      
      // Корректируем только диапазон, не меняя количество уровней
      const range = baseConfig.upperPrice - baseConfig.lowerPrice;
      const newRange = range * adjustmentFactor;
      const center = (baseConfig.upperPrice + baseConfig.lowerPrice) / 2;
      
      newUpperPrice = center + newRange / 2;
      newLowerPrice = center - newRange / 2;
      
      reason = `Volatility changed by ${((volatilityRatio - 1) * 100).toFixed(1)}% - adjusting range`;
    }

    // Обновляем состояние
    this.state.currentVolatility = currentVolatility;

    const adjustment: GridAdjustment = {
      newGridCount,
      newUpperPrice,
      newLowerPrice,
      reason,
    };

    this.state.adaptationHistory.push(adjustment);
    this.state.lastCheckAt = new Date();

    return adjustment;
  }

  // ==================== REBALANCING ====================

  /**
   * Проверить необходимость ребалансировки
   */
  shouldRebalance(currentPrice: number, gridCenter: number): boolean {
    const { upperPrice, lowerPrice } = this.state.baseConfig;
    
    // Цена вышла за пределы сетки
    if (currentPrice > upperPrice || currentPrice < lowerPrice) {
      return true;
    }
    
    // Цена сместилась от центра более чем на порог
    const gridWidth = upperPrice - lowerPrice;
    const deviation = Math.abs(currentPrice - gridCenter);
    const deviationPercent = deviation / (gridWidth / 2);
    
    if (deviationPercent > this.rebalanceThreshold) {
      return true;
    }
    
    return false;
  }

  /**
   * Выполнить ребалансировку сетки при выходе цены за пределы
   */
  rebalanceGrid(currentPrice: number): GridAdjustment {
    const { baseConfig } = this.state;
    const gridWidth = baseConfig.upperPrice - baseConfig.lowerPrice;
    
    // Новый центр сетки = текущая цена
    const newCenter = currentPrice;
    
    // Сохраняем ширину сетки
    const newUpperPrice = newCenter + gridWidth / 2;
    const newLowerPrice = newCenter - gridWidth / 2;
    
    const adjustment: GridAdjustment = {
      newGridCount: baseConfig.gridCount,
      newUpperPrice,
      newLowerPrice,
      reason: `Rebalanced grid center from ${(baseConfig.upperPrice + baseConfig.lowerPrice) / 2} to ${newCenter}`,
    };
    
    // Обновляем состояние
    this.state.gridCenter = newCenter;
    this.state.baseConfig = {
      ...baseConfig,
      upperPrice: newUpperPrice,
      lowerPrice: newLowerPrice,
    };
    this.state.adaptationHistory.push(adjustment);
    
    return adjustment;
  }

  // ==================== TRAILING GRID ====================

  /**
   * Проверить необходимость trailing (сдвига сетки)
   */
  shouldTrail(currentPrice: number): boolean {
    if (!this.trailingEnabled) {
      return false;
    }

    const { upperPrice, lowerPrice } = this.state.baseConfig;
    const gridWidth = upperPrice - lowerPrice;
    const trailingThreshold = gridWidth * TRAILING_THRESHOLD_PERCENT;
    
    // Trailing при приближении к границе
    const distanceToUpper = upperPrice - currentPrice;
    const distanceToLower = currentPrice - lowerPrice;
    
    return distanceToUpper < trailingThreshold || distanceToLower < trailingThreshold;
  }

  /**
   * Выполнить trailing сетки
   */
  trailGrid(currentPrice: number, direction: "LONG" | "SHORT"): GridAdjustment {
    const { baseConfig } = this.state;
    const gridWidth = baseConfig.upperPrice - baseConfig.lowerPrice;
    
    let newCenter: number;
    
    if (direction === "LONG") {
      // При LONG сетка сдвигается вверх
      newCenter = currentPrice + gridWidth * 0.1; // Сдвиг на 10% ширины
    } else {
      // При SHORT сетка сдвигается вниз
      newCenter = currentPrice - gridWidth * 0.1;
    }
    
    const newUpperPrice = newCenter + gridWidth / 2;
    const newLowerPrice = newCenter - gridWidth / 2;
    
    const adjustment: GridAdjustment = {
      newGridCount: baseConfig.gridCount,
      newUpperPrice,
      newLowerPrice,
      reason: `Trailing grid ${direction === "LONG" ? "up" : "down"} - price at ${currentPrice}`,
    };
    
    // Обновляем состояние
    this.state.gridCenter = newCenter;
    this.state.baseConfig = {
      ...baseConfig,
      upperPrice: newUpperPrice,
      lowerPrice: newLowerPrice,
    };
    this.state.adaptationHistory.push(adjustment);
    
    return adjustment;
  }

  // ==================== LEVEL CALCULATION ====================

  /**
   * Пересчитать уровни сетки на основе новой конфигурации
   */
  recalculateLevels(config: GridAdjustment): GridLevel[] {
    const { newGridCount, newUpperPrice, newLowerPrice } = config;
    const { baseConfig } = this.state;
    
    const levels: GridLevel[] = [];
    const direction = baseConfig.direction;
    
    if (baseConfig.gridType === "ARITHMETIC") {
      // Арифметическая сетка - равные шаги по цене
      const step = (newUpperPrice - newLowerPrice) / (newGridCount - 1);
      
      for (let i = 0; i < newGridCount; i++) {
        const price = newLowerPrice + step * i;
        
        // Для LONG: покупаем на нижних уровнях, продаём на верхних
        // Для SHORT: продаём на верхних уровнях, покупаем на нижних
        const isBuyLevel = direction === "LONG" 
          ? i < newGridCount / 2 
          : i >= newGridCount / 2;
        
        levels.push({
          price: parseFloat(price.toFixed(8)),
          side: isBuyLevel ? "BUY" : "SELL",
          status: "PENDING",
        });
      }
    } else {
      // Геометрическая сетка - равные шаги в процентах
      const ratio = Math.pow(
        newUpperPrice / newLowerPrice,
        1 / (newGridCount - 1)
      );
      
      for (let i = 0; i < newGridCount; i++) {
        const price = newLowerPrice * Math.pow(ratio, i);
        
        const isBuyLevel = direction === "LONG"
          ? i < newGridCount / 2
          : i >= newGridCount / 2;
        
        levels.push({
          price: parseFloat(price.toFixed(8)),
          side: isBuyLevel ? "BUY" : "SELL",
          status: "PENDING",
        });
      }
    }
    
    return levels;
  }

  // ==================== STATE MANAGEMENT ====================

  /**
   * Получить текущее состояние
   */
  getState(): AdaptiveGridState {
    return { ...this.state };
  }

  /**
   * Обновить базовый ATR
   */
  setBaseAtr(atr: number): void {
    this.state.baseAtr = atr;
  }

  /**
   * Получить историю адаптаций
   */
  getAdaptationHistory(): GridAdjustment[] {
    return [...this.state.adaptationHistory];
  }

  /**
   * Сбросить состояние
   */
  reset(config: GridConfig): void {
    const gridCenter = (config.upperPrice + config.lowerPrice) / 2;
    
    this.state = {
      baseConfig: config,
      baseAtr: 0,
      currentVolatility: null,
      gridCenter,
      lastCheckAt: null,
      adaptationHistory: [],
    };
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Создать адаптивную сетку с начальными параметрами
 */
export function createAdaptiveGrid(
  config: GridConfig,
  candles: Candle[],
  options?: {
    rebalanceThreshold?: number;
    trailingEnabled?: boolean;
  }
): { bot: AdaptiveGridBot; initialVolatility: VolatilityMetrics; levels: GridLevel[] } {
  const bot = new AdaptiveGridBot(config, options);
  const initialVolatility = bot.calculateVolatility(candles);
  
  // Устанавливаем базовый ATR
  bot.setBaseAtr(initialVolatility.atr);
  
  // Создаём начальные уровни
  const levels = bot.recalculateLevels({
    newGridCount: config.gridCount,
    newUpperPrice: config.upperPrice,
    newLowerPrice: config.lowerPrice,
    reason: "Initial grid setup",
  });
  
  return { bot, initialVolatility, levels };
}

/**
 * Проверить и выполнить адаптацию сетки
 */
export function checkAndAdapt(
  bot: AdaptiveGridBot,
  candles: Candle[],
  currentPrice: number
): {
  needsUpdate: boolean;
  adjustment: GridAdjustment | null;
  newLevels: GridLevel[] | null;
} {
  const state = bot.getState();
  
  // Рассчитываем текущую волатильность
  const currentVolatility = bot.calculateVolatility(candles);
  
  // Проверяем необходимость ребалансировки
  if (bot.shouldRebalance(currentPrice, state.gridCenter)) {
    const adjustment = bot.rebalanceGrid(currentPrice);
    const newLevels = bot.recalculateLevels(adjustment);
    
    return {
      needsUpdate: true,
      adjustment,
      newLevels,
    };
  }
  
  // Проверяем trailing
  if (bot.shouldTrail(currentPrice)) {
    const adjustment = bot.trailGrid(currentPrice, state.baseConfig.direction);
    const newLevels = bot.recalculateLevels(adjustment);
    
    return {
      needsUpdate: true,
      adjustment,
      newLevels,
    };
  }
  
  // Проверяем адаптацию по волатильности
  const adjustment = bot.adjustGridLevels(currentVolatility, state.baseConfig);
  
  // Если есть изменения
  if (adjustment.reason !== "No adjustment needed") {
    const newLevels = bot.recalculateLevels(adjustment);
    
    return {
      needsUpdate: true,
      adjustment,
      newLevels,
    };
  }
  
  return {
    needsUpdate: false,
    adjustment: null,
    newLevels: null,
  };
}
