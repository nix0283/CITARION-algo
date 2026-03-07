/**
 * DCA Bot Safety Orders
 * 
 * Safety orders - дополнительные ордера при сильном падении цены.
 * Защищают от больших убытков при резких движениях рынка.
 */

// ==================== TYPES ====================

export interface SafetyOrderConfig {
  enabled: boolean;
  triggerDrawdown: number;      // % падения для активации safety order
  safetyAmount: number;         // Сумма safety ордера (USDT)
  safetyAmountMultiplier: number; // Множитель суммы для каждого последующего SO
  maxSafetyOrders: number;      // Максимум safety ордеров
  safetyInterval: number;       // Минут между safety ордерами
  priceDeviation: number;       // % отклонения цены между safety ордерами
}

export interface SafetyOrder {
  index: number;                // Порядковый номер (1, 2, 3...)
  triggerPrice: number;         // Цена активации
  amount: number;               // Сумма ордера (USDT)
  quantity: number;             // Количество монет
  status: "PENDING" | "TRIGGERED" | "FILLED" | "CANCELLED";
  triggeredAt?: Date;
  filledAt?: Date;
  filledPrice?: number;
}

export interface SafetyOrderState {
  safetyOrders: SafetyOrder[];
  triggeredCount: number;
  totalSafetyInvested: number;
  lastTriggerTime?: Date;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_SAFETY_ORDER_CONFIG: SafetyOrderConfig = {
  enabled: false,
  triggerDrawdown: 5,           // 5% просадки для активации
  safetyAmount: 50,             // 50 USDT на safety order
  safetyAmountMultiplier: 1.5,  // Каждый следующий на 50% больше
  maxSafetyOrders: 5,           // Максимум 5 safety ордеров
  safetyInterval: 30,           // Минимум 30 минут между ордерами
  priceDeviation: 3,            // 3% между ордерами
};

// ==================== SAFETY ORDER MANAGER ====================

export class SafetyOrderManager {
  private config: SafetyOrderConfig;
  private state: SafetyOrderState;
  private entryPrice: number;

  constructor(config: Partial<SafetyOrderConfig> = {}) {
    this.config = { ...DEFAULT_SAFETY_ORDER_CONFIG, ...config };
    this.state = {
      safetyOrders: [],
      triggeredCount: 0,
      totalSafetyInvested: 0,
    };
    this.entryPrice = 0;
  }

  /**
   * Initialize safety orders based on entry price
   */
  initialize(entryPrice: number): void {
    this.entryPrice = entryPrice;
    this.state.safetyOrders = [];

    if (!this.config.enabled) return;

    // Pre-calculate all safety order levels
    let currentTriggerPrice = entryPrice * (1 - this.config.triggerDrawdown / 100);
    let currentAmount = this.config.safetyAmount;

    for (let i = 0; i < this.config.maxSafetyOrders; i++) {
      this.state.safetyOrders.push({
        index: i + 1,
        triggerPrice: currentTriggerPrice,
        amount: currentAmount,
        quantity: 0, // Will be calculated when triggered
        status: "PENDING",
      });

      // Next trigger price
      currentTriggerPrice = currentTriggerPrice * (1 - this.config.priceDeviation / 100);
      
      // Next amount (with multiplier)
      currentAmount = currentAmount * this.config.safetyAmountMultiplier;
    }
  }

  /**
   * Check if safety orders should be triggered
   */
  checkTriggers(currentPrice: number): SafetyOrder[] {
    if (!this.config.enabled) return [];

    const triggeredOrders: SafetyOrder[] = [];
    const now = new Date();

    for (const order of this.state.safetyOrders) {
      if (order.status !== "PENDING") continue;

      // Check price trigger
      if (currentPrice <= order.triggerPrice) {
        // Check interval
        if (this.state.lastTriggerTime) {
          const minutesSinceLastTrigger = 
            (now.getTime() - this.state.lastTriggerTime.getTime()) / (1000 * 60);
          
          if (minutesSinceLastTrigger < this.config.safetyInterval) {
            continue; // Not enough time passed
          }
        }

        // Trigger the order
        order.status = "TRIGGERED";
        order.triggeredAt = now;
        order.quantity = order.amount / currentPrice;
        
        this.state.triggeredCount++;
        this.state.lastTriggerTime = now;
        this.state.totalSafetyInvested += order.amount;
        
        triggeredOrders.push(order);
      }
    }

    return triggeredOrders;
  }

  /**
   * Mark order as filled
   */
  markFilled(orderIndex: number, filledPrice: number): void {
    const order = this.state.safetyOrders.find(o => o.index === orderIndex);
    if (!order || order.status !== "TRIGGERED") return;

    order.status = "FILLED";
    order.filledAt = new Date();
    order.filledPrice = filledPrice;
    order.quantity = order.amount / filledPrice;
  }

  /**
   * Cancel all pending safety orders
   */
  cancelAll(): void {
    for (const order of this.state.safetyOrders) {
      if (order.status === "PENDING") {
        order.status = "CANCELLED";
      }
    }
  }

  /**
   * Get state
   */
  getState(): SafetyOrderState {
    return { ...this.state };
  }

  /**
   * Get total safety invested
   */
  getTotalInvested(): number {
    return this.state.totalSafetyInvested;
  }

  /**
   * Get filled safety orders
   */
  getFilledOrders(): SafetyOrder[] {
    return this.state.safetyOrders.filter(o => o.status === "FILLED");
  }

  /**
   * Calculate average entry price including safety orders
   */
  calculateAverageEntry(
    baseEntryPrice: number,
    baseQuantity: number
  ): { avgEntryPrice: number; totalQuantity: number; totalInvested: number } {
    const filledOrders = this.getFilledOrders();
    
    if (filledOrders.length === 0) {
      return {
        avgEntryPrice: baseEntryPrice,
        totalQuantity: baseQuantity,
        totalInvested: baseEntryPrice * baseQuantity,
      };
    }

    let totalValue = baseEntryPrice * baseQuantity;
    let totalQuantity = baseQuantity;

    for (const order of filledOrders) {
      if (order.filledPrice && order.quantity) {
        totalValue += order.filledPrice * order.quantity;
        totalQuantity += order.quantity;
      }
    }

    return {
      avgEntryPrice: totalValue / totalQuantity,
      totalQuantity,
      totalInvested: totalValue,
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      safetyOrders: [],
      triggeredCount: 0,
      totalSafetyInvested: 0,
    };
    this.entryPrice = 0;
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<SafetyOrderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create safety order manager with config
 */
export function createSafetyOrderManager(
  config: Partial<SafetyOrderConfig>
): SafetyOrderManager {
  return new SafetyOrderManager(config);
}
