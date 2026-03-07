/**
 * Trailing Stop Module
 * 
 * Портировано из Zenbot (https://github.com/DeviaVir/zenbot)
 * 
 * Реализация трейлинг-стопа с high-water mark:
 * - profit_stop_enable_pct: активация при достижении X% прибыли
 * - profit_stop_pct: расстояние трейлинга от пика
 * - Поддержка LONG и SHORT позиций
 * - Автоматическое обновление при движении цены
 * 
 * @author CITARION (ported from Zenbot)
 * @version 2.0.0
 */

// ==================== TYPES ====================

/**
 * Конфигурация Trailing Stop (Zenbot style)
 */
export interface TrailingStopConfig {
  /** Активировать трейлинг при X% прибыли */
  profitStopEnablePct: number;      // profit_stop_enable_pct
  /** Дистанция трейлинга от пика (%) */
  profitStopPct: number;            // profit_stop_pct
  
  /** Цена входа */
  entryPrice: number;
  /** Направление позиции */
  direction: "LONG" | "SHORT";
  
  /** Время начала позиции */
  startTime: Date;
  
  // Internal state
  /** Активирован ли трейлинг */
  activated: boolean;
  /** High-water mark (максимальная/минимальная цена) */
  highWaterMark: number;
  /** Текущий stop loss */
  currentStopLoss: number | null;
}

/**
 * Результат проверки трейлинг-стопа
 */
export interface TrailingStopResult {
  /** Нужно ли активировать */
  shouldActivate: boolean;
  /** Нужно ли закрывать позицию */
  shouldClose: boolean;
  /** Обновлённый stop loss */
  newStopLoss?: number;
  /** Причина */
  reason: string;
  /** Текущая прибыль % */
  profitPct: number;
  /** High-water mark */
  highWaterMark: number;
  /** Расстояние до SL */
  distanceToStop?: number;
}

// ==================== TRAILING STOP CLASS ====================

/**
 * Класс для управления трейлинг-стопом
 */
export class TrailingStopManager {
  private config: TrailingStopConfig;
  
  constructor(config: Omit<TrailingStopConfig, "activated" | "highWaterMark" | "currentStopLoss">) {
    this.config = {
      ...config,
      activated: false,
      highWaterMark: config.entryPrice,
      currentStopLoss: null,
    };
  }
  
  /**
   * Проверить и обновить трейлинг-стоп
   * 
   * Логика из Zenbot engine.js:
   * 1. Рассчитать текущую прибыль
   * 2. Если прибыль >= profit_stop_enable_pct, активировать трейлинг
   * 3. Обновить high-water mark
   * 4. Рассчитать stop loss на основе profit_stop_pct
   * 5. Если цена упала ниже SL, закрыть позицию
   */
  check(currentPrice: number): TrailingStopResult {
    const { entryPrice, direction, profitStopEnablePct, profitStopPct } = this.config;
    
    // Рассчитываем прибыль
    const profitPct = direction === "LONG"
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
    
    // Базовый результат
    const result: TrailingStopResult = {
      shouldActivate: false,
      shouldClose: false,
      reason: "",
      profitPct,
      highWaterMark: this.config.highWaterMark,
    };
    
    // Проверяем активацию
    if (!this.config.activated) {
      if (profitPct >= profitStopEnablePct) {
        this.config.activated = true;
        this.config.highWaterMark = currentPrice;
        
        // Устанавливаем начальный SL
        if (direction === "LONG") {
          this.config.currentStopLoss = currentPrice * (1 - profitStopPct / 100);
        } else {
          this.config.currentStopLoss = currentPrice * (1 + profitStopPct / 100);
        }
        
        result.shouldActivate = true;
        result.reason = `Trailing stop activated at ${profitPct.toFixed(2)}% profit`;
        result.newStopLoss = this.config.currentStopLoss;
        result.highWaterMark = this.config.highWaterMark;
        
        return result;
      }
      
      result.reason = "Profit threshold not reached";
      return result;
    }
    
    // Трейлинг активен - обновляем high-water mark
    if (direction === "LONG") {
      if (currentPrice > this.config.highWaterMark) {
        this.config.highWaterMark = currentPrice;
        this.config.currentStopLoss = currentPrice * (1 - profitStopPct / 100);
        result.reason = "High-water mark updated (new peak)";
      }
      
      // Проверяем срабатывание SL
      if (currentPrice <= this.config.currentStopLoss!) {
        result.shouldClose = true;
        result.reason = `Stop loss triggered at ${currentPrice.toFixed(2)} (SL: ${this.config.currentStopLoss!.toFixed(2)})`;
      }
    } else {
      // SHORT
      if (currentPrice < this.config.highWaterMark) {
        this.config.highWaterMark = currentPrice;
        this.config.currentStopLoss = currentPrice * (1 + profitStopPct / 100);
        result.reason = "Low-water mark updated (new low)";
      }
      
      // Проверяем срабатывание SL
      if (currentPrice >= this.config.currentStopLoss!) {
        result.shouldClose = true;
        result.reason = `Stop loss triggered at ${currentPrice.toFixed(2)} (SL: ${this.config.currentStopLoss!.toFixed(2)})`;
      }
    }
    
    result.newStopLoss = this.config.currentStopLoss ?? undefined;
    result.highWaterMark = this.config.highWaterMark;
    result.distanceToStop = direction === "LONG"
      ? ((currentPrice - (this.config.currentStopLoss ?? 0)) / currentPrice) * 100
      : (((this.config.currentStopLoss ?? 0) - currentPrice) / currentPrice) * 100;
    
    return result;
  }
  
  /**
   * Получить текущую конфигурацию
   */
  getConfig(): TrailingStopConfig {
    return { ...this.config };
  }
  
  /**
   * Обновить параметры
   */
  updateParams(params: Partial<Pick<TrailingStopConfig, "profitStopEnablePct" | "profitStopPct">>): void {
    if (params.profitStopEnablePct !== undefined) {
      this.config.profitStopEnablePct = params.profitStopEnablePct;
    }
    if (params.profitStopPct !== undefined) {
      this.config.profitStopPct = params.profitStopPct;
    }
  }
  
  /**
   * Сбросить состояние (для новой позиции)
   */
  reset(entryPrice: number, direction: "LONG" | "SHORT"): void {
    this.config.entryPrice = entryPrice;
    this.config.direction = direction;
    this.config.startTime = new Date();
    this.config.activated = false;
    this.config.highWaterMark = entryPrice;
    this.config.currentStopLoss = null;
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Создать TrailingStopManager из конфигурации Zenbot
 * 
 * Пример из Zenbot:
 * ```javascript
 * profit_stop_enable_pct: 10,  // Активировать при 10% прибыли
 * profit_stop_pct: 4,          // Trailing 4% от пика
 * ```
 */
export function createTrailingStop(
  entryPrice: number,
  direction: "LONG" | "SHORT",
  profitStopEnablePct: number = 10,
  profitStopPct: number = 4
): TrailingStopManager {
  return new TrailingStopManager({
    entryPrice,
    direction,
    profitStopEnablePct,
    profitStopPct,
    startTime: new Date(),
  });
}

/**
 * Предустановленные конфигурации Trailing Stop
 */
export const TRAILING_STOP_PRESETS = {
  /** Консервативный - активация при 5%, trailing 2% */
  conservative: {
    profitStopEnablePct: 5,
    profitStopPct: 2,
  },
  
  /** Умеренный - активация при 8%, trailing 3% */
  moderate: {
    profitStopEnablePct: 8,
    profitStopPct: 3,
  },
  
  /** Агрессивный - активация при 10%, trailing 4% */
  aggressive: {
    profitStopEnablePct: 10,
    profitStopPct: 4,
  },
  
  /** Zenbot default - активация при 10%, trailing 4% */
  zenbotDefault: {
    profitStopEnablePct: 10,
    profitStopPct: 4,
  },
  
  /** Scalping - активация при 2%, trailing 1% */
  scalping: {
    profitStopEnablePct: 2,
    profitStopPct: 1,
  },
  
  /** Swing - активация при 15%, trailing 5% */
  swing: {
    profitStopEnablePct: 15,
    profitStopPct: 5,
  },
} as const;

// ==================== UTILITY FUNCTIONS ====================

/**
 * Рассчитать потенциальный SL на основе high-water mark
 */
export function calculateTrailingStopLoss(
  highWaterMark: number,
  direction: "LONG" | "SHORT",
  trailPct: number
): number {
  if (direction === "LONG") {
    return highWaterMark * (1 - trailPct / 100);
  } else {
    return highWaterMark * (1 + trailPct / 100);
  }
}

/**
 * Проверить, достигнута ли прибыль для активации трейлинга
 */
export function isProfitThresholdReached(
  entryPrice: number,
  currentPrice: number,
  direction: "LONG" | "SHORT",
  thresholdPct: number
): boolean {
  const profitPct = direction === "LONG"
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - currentPrice) / entryPrice) * 100;
  
  return profitPct >= thresholdPct;
}

/**
 * Получить рекомендуемый stop loss (без состояния)
 */
export function getRecommendedStopLoss(
  currentPrice: number,
  direction: "LONG" | "SHORT",
  trailPct: number
): number {
  if (direction === "LONG") {
    return currentPrice * (1 - trailPct / 100);
  } else {
    return currentPrice * (1 + trailPct / 100);
  }
}
