/**
 * Risk Manager Module
 * 
 * Портировано из Zenbot (https://github.com/DeviaVir/zenbot)
 * 
 * Компоненты:
 * - Loss Protection: max_sell_loss_pct, max_buy_loss_pct
 * - Slippage Protection: max_slippage_pct
 * - Order Validation: проверка размеров ордеров
 * - Balance Protection: проверка доступности средств
 * 
 * @author CITARION (ported from Zenbot)
 * @version 1.0.0
 */

// ==================== TYPES ====================

/**
 * Конфигурация Risk Manager
 */
export interface RiskManagerConfig {
  // Loss Protection
  /** Макс. убыток при продаже (%) - защита от продажи ниже цены покупки */
  maxSellLossPct?: number | null;   // null = disabled
  /** Макс. убыток при покупке (%) - защита от покупки выше последней продажи */
  maxBuyLossPct?: number | null;    // null = disabled
  
  // Slippage Protection
  /** Макс. проскальзывание (%) - защита от исполнения по худшей цене */
  maxSlippagePct?: number | null;   // null = disabled
  
  // Order Size Protection
  /** Мин. размер ордера в базовой валюте */
  minOrderSize?: number;
  /** Макс. размер ордера в базовой валюте */
  maxOrderSize?: number;
  /** Мин. общая стоимость ордера */
  minOrderTotal?: number;
  
  // Balance Protection
  /** Процент депозита для торговли (default: 100%) */
  tradePct?: number;
  /** Резервный процент от депозита */
  reservePct?: number;
  
  // Timing Protection
  /** Время ожидания подтверждения ордера (ms) */
  orderPollTime?: number;
  /** Время на отмену ордера (ms) */
  orderAdjustTime?: number;
  /** Макс. время удержания позиции */
  maxHoldTime?: number;
}

/**
 * Торговля для расчёта убытка
 */
export interface Trade {
  type: "buy" | "sell";
  price: number;
  size: number;
  time: number;
}

/**
 * Результат проверки риска
 */
export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  description?: string;
  adjustedSize?: number;
  adjustedPrice?: number;
}

/**
 * Контекст для проверки рисков
 */
export interface RiskContext {
  currentPrice: number;
  proposedPrice: number;
  proposedSize: number;
  direction: "buy" | "sell";
  balance: {
    asset: number;       // Количество актива
    currency: number;    // Количество валюты
    deposit: number;     // Доступный депозит
  };
  trades: Trade[];
  lastOrder?: {
    price: number;
    origPrice: number;
    size: number;
    remainingSize: number;
  };
}

// ==================== RISK MANAGER CLASS ====================

/**
 * Менеджер рисков для торговли
 */
export class RiskManager {
  private config: Required<RiskManagerConfig>;

  constructor(config: RiskManagerConfig = {}) {
    this.config = {
      maxSellLossPct: config.maxSellLossPct ?? null,
      maxBuyLossPct: config.maxBuyLossPct ?? null,
      maxSlippagePct: config.maxSlippagePct ?? null,
      minOrderSize: config.minOrderSize ?? 0,
      maxOrderSize: config.maxOrderSize ?? Infinity,
      minOrderTotal: config.minOrderTotal ?? 0,
      tradePct: config.tradePct ?? 100,
      reservePct: config.reservePct ?? 0,
      orderPollTime: config.orderPollTime ?? 5000,
      orderAdjustTime: config.orderAdjustTime ?? 30000,
      maxHoldTime: config.maxHoldTime ?? Infinity,
    };
  }

  /**
   * Проверить, разрешена ли сделка
   */
  checkRisk(ctx: RiskContext): RiskCheckResult {
    // 1. Проверка размера ордера
    const sizeCheck = this.checkOrderSize(ctx);
    if (!sizeCheck.allowed) return sizeCheck;

    // 2. Проверка баланса
    const balanceCheck = this.checkBalance(ctx);
    if (!balanceCheck.allowed) return balanceCheck;

    // 3. Проверка защиты от убытков
    const lossCheck = this.checkLossProtection(ctx);
    if (!lossCheck.allowed) return lossCheck;

    // 4. Проверка проскальзывания
    const slippageCheck = this.checkSlippage(ctx);
    if (!slippageCheck.allowed) return slippageCheck;

    // Все проверки пройдены
    return { allowed: true };
  }

  /**
   * Проверка размера ордера
   */
  private checkOrderSize(ctx: RiskContext): RiskCheckResult {
    const { proposedSize, proposedPrice } = ctx;
    const total = proposedSize * proposedPrice;

    // Минимальный размер
    if (this.config.minOrderSize > 0 && proposedSize < this.config.minOrderSize) {
      return {
        allowed: false,
        reason: "ORDER_TOO_SMALL",
        description: `Order size ${proposedSize} below minimum ${this.config.minOrderSize}`,
      };
    }

    // Максимальный размер
    if (proposedSize > this.config.maxOrderSize) {
      return {
        allowed: true,
        reason: "ORDER_SIZE_ADJUSTED",
        description: `Order size adjusted from ${proposedSize} to ${this.config.maxOrderSize}`,
        adjustedSize: this.config.maxOrderSize,
      };
    }

    // Минимальная общая стоимость
    if (this.config.minOrderTotal > 0 && total < this.config.minOrderTotal) {
      return {
        allowed: false,
        reason: "ORDER_TOTAL_TOO_SMALL",
        description: `Order total ${total.toFixed(2)} below minimum ${this.config.minOrderTotal}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Проверка баланса
   */
  private checkBalance(ctx: RiskContext): RiskCheckResult {
    const { direction, proposedSize, proposedPrice, balance } = ctx;
    const total = proposedSize * proposedPrice;
    const tradePct = this.config.tradePct / 100;
    const reservePct = this.config.reservePct / 100;

    if (direction === "buy") {
      const availableBalance = balance.deposit * tradePct * (1 - reservePct);
      
      if (total > availableBalance) {
        const adjustedSize = (availableBalance / proposedPrice) * 0.99; // 1% margin
        
        if (adjustedSize * proposedPrice >= (this.config.minOrderTotal || 0)) {
          return {
            allowed: true,
            reason: "BALANCE_LIMITED",
            description: `Insufficient balance. Order size adjusted to ${adjustedSize.toFixed(6)}`,
            adjustedSize,
          };
        }
        
        return {
          allowed: false,
          reason: "INSUFFICIENT_BALANCE",
          description: `Need ${total.toFixed(2)} but only ${availableBalance.toFixed(2)} available`,
        };
      }
    } else {
      const availableAsset = balance.asset * tradePct;
      
      if (proposedSize > availableAsset) {
        const adjustedSize = availableAsset * 0.99;
        
        if (adjustedSize * proposedPrice >= (this.config.minOrderTotal || 0)) {
          return {
            allowed: true,
            reason: "ASSET_LIMITED",
            description: `Insufficient asset. Order size adjusted to ${adjustedSize.toFixed(6)}`,
            adjustedSize,
          };
        }
        
        return {
          allowed: false,
          reason: "INSUFFICIENT_ASSET",
          description: `Need ${proposedSize} but only ${availableAsset.toFixed(6)} available`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Проверка защиты от убытков (Loss Protection)
   * 
   * Из Zenbot engine.js:
   * - max_sell_loss_pct: отказ от продажи если цена ниже последней покупки
   * - max_buy_loss_pct: отказ от покупки если цена выше последней продажи
   */
  private checkLossProtection(ctx: RiskContext): RiskCheckResult {
    const { direction, proposedPrice, trades } = ctx;

    if (!trades || trades.length === 0) {
      return { allowed: true };
    }

    if (direction === "buy" && this.config.maxBuyLossPct !== null) {
      // Найти последнюю продажу
      const lastSell = this.findLastTrade(trades, "sell");
      
      if (lastSell) {
        // buy_loss = (last_sell_price - proposed_price) / last_sell_price * -100
        const buyLoss = ((lastSell.price - proposedPrice) / lastSell.price) * -100;
        
        if (buyLoss > this.config.maxBuyLossPct) {
          return {
            allowed: false,
            reason: "LOSS_PROTECTION",
            description: `Refusing to buy at ${proposedPrice.toFixed(2)}, buy loss of ${buyLoss.toFixed(2)}% (max: ${this.config.maxBuyLossPct}%)`,
          };
        }
      }
    }

    if (direction === "sell" && this.config.maxSellLossPct !== null) {
      // Найти последнюю покупку
      const lastBuy = this.findLastTrade(trades, "buy");
      
      if (lastBuy) {
        // sell_loss = (proposed_price - last_buy_price) / last_buy_price * -100
        const sellLoss = ((proposedPrice - lastBuy.price) / lastBuy.price) * -100;
        
        if (sellLoss > this.config.maxSellLossPct) {
          return {
            allowed: false,
            reason: "LOSS_PROTECTION",
            description: `Refusing to sell at ${proposedPrice.toFixed(2)}, sell loss of ${sellLoss.toFixed(2)}% (max: ${this.config.maxSellLossPct}%)`,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Проверка проскальзывания (Slippage Protection)
   * 
   * Из Zenbot engine.js:
   * Защита от исполнения ордера по слишком худшей цене
   */
  private checkSlippage(ctx: RiskContext): RiskCheckResult {
    if (this.config.maxSlippagePct === null || !ctx.lastOrder) {
      return { allowed: true };
    }

    const { direction, proposedPrice, lastOrder } = ctx;

    if (direction === "buy") {
      // slippage = (new_price - orig_price) / orig_price * 100
      const slippage = ((proposedPrice - lastOrder.origPrice) / lastOrder.origPrice) * 100;
      
      if (slippage > this.config.maxSlippagePct) {
        return {
          allowed: false,
          reason: "SLIPPAGE_PROTECTION",
          description: `Refusing to buy at ${proposedPrice.toFixed(2)}, slippage of ${slippage.toFixed(2)}% (max: ${this.config.maxSlippagePct}%)`,
        };
      }
    } else {
      // slippage = (orig_price - new_price) / new_price * 100
      const slippage = ((lastOrder.origPrice - proposedPrice) / proposedPrice) * 100;
      
      if (slippage > this.config.maxSlippagePct) {
        return {
          allowed: false,
          reason: "SLIPPAGE_PROTECTION",
          description: `Refusing to sell at ${proposedPrice.toFixed(2)}, slippage of ${slippage.toFixed(2)}% (max: ${this.config.maxSlippagePct}%)`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Найти последнюю сделку определённого типа
   */
  private findLastTrade(trades: Trade[], type: "buy" | "sell"): Trade | null {
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].type === type) {
        return trades[i];
      }
    }
    return null;
  }

  /**
   * Рассчитать размер позиции с учётом риска
   */
  calculatePositionSize(
    balance: number,
    price: number,
    fee: number = 0.1 // % комиссия
  ): number {
    const tradePct = this.config.tradePct / 100;
    const reservePct = this.config.reservePct / 100;
    
    // Доступный депозит
    const available = balance * tradePct * (1 - reservePct);
    
    // Учитываем комиссию
    const feeMultiplier = 1 + (fee / 100);
    const tradeableBalance = available / feeMultiplier;
    
    // Размер позиции
    const size = tradeableBalance / price;
    
    // Проверяем лимиты
    if (size < this.config.minOrderSize) {
      return 0;
    }
    
    return Math.min(size, this.config.maxOrderSize);
  }

  /**
   * Проверить, нужно ли активировать profit stop (trailing)
   * 
   * Из Zenbot engine.js:
   * profit_stop_enable_pct: активировать трейлинг при достижении прибыли
   * profit_stop_pct: расстояние трейлинга от пика
   */
  checkProfitStop(
    entryPrice: number,
    currentPrice: number,
    profitStopEnablePct: number,
    profitStopPct: number,
    profitStopHigh?: number
  ): {
    shouldActivate: boolean;
    shouldTrigger: boolean;
    newProfitStop?: number;
  } {
    const profitPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    // Проверяем активацию
    if (profitPct >= profitStopEnablePct) {
      // Обновляем максимум
      const highWaterMark = Math.max(profitStopHigh || currentPrice, currentPrice);
      
      // Рассчитываем новый stop
      const newProfitStop = highWaterMark * (1 - profitStopPct / 100);
      
      // Проверяем триггер
      if (currentPrice < newProfitStop && profitPct > 0) {
        return {
          shouldActivate: true,
          shouldTrigger: true,
          newProfitStop,
        };
      }
      
      return {
        shouldActivate: true,
        shouldTrigger: false,
        newProfitStop,
      };
    }
    
    return {
      shouldActivate: false,
      shouldTrigger: false,
    };
  }

  /**
   * Получить конфигурацию
   */
  getConfig(): Required<RiskManagerConfig> {
    return { ...this.config };
  }

  /**
   * Обновить конфигурацию
   */
  updateConfig(config: Partial<RiskManagerConfig>): void {
    this.config = { ...this.config, ...config } as Required<RiskManagerConfig>;
  }
}

// ==================== PREDEFINED CONFIGS ====================

/**
 * Предустановленные конфигурации Risk Manager
 */
export const RISK_PRESETS = {
  /** Консервативный режим */
  conservative: {
    maxSellLossPct: 2,      // Максимум 2% убытка при продаже
    maxBuyLossPct: 2,       // Максимум 2% убытка при покупке
    maxSlippagePct: 0.5,    // Максимум 0.5% проскальзывания
    tradePct: 50,           // Использовать 50% депозита
    reservePct: 10,         // 10% резерв
  } satisfies RiskManagerConfig,

  /** Умеренный режим */
  moderate: {
    maxSellLossPct: 5,
    maxBuyLossPct: 5,
    maxSlippagePct: 1,
    tradePct: 75,
    reservePct: 5,
  } satisfies RiskManagerConfig,

  /** Агрессивный режим */
  aggressive: {
    maxSellLossPct: null,   // Без ограничений
    maxBuyLossPct: null,
    maxSlippagePct: 2,
    tradePct: 95,
    reservePct: 2,
  } satisfies RiskManagerConfig,

  /** Режим Zenbot по умолчанию */
  zenbotDefault: {
    maxSellLossPct: null,   // Опционально в Zenbot
    maxBuyLossPct: null,    // Опционально в Zenbot
    maxSlippagePct: null,   // Опционально в Zenbot
    tradePct: 100,
    reservePct: 0,
  } satisfies RiskManagerConfig,
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Быстрая проверка рисков без создания экземпляра
 */
export function quickRiskCheck(
  ctx: RiskContext,
  config: RiskManagerConfig = {}
): RiskCheckResult {
  const manager = new RiskManager(config);
  return manager.checkRisk(ctx);
}

/**
 * Рассчитать максимальный размер позиции
 */
export function calculateMaxPosition(
  balance: number,
  price: number,
  config: RiskManagerConfig = {}
): number {
  const manager = new RiskManager(config);
  return manager.calculatePositionSize(balance, price);
}
