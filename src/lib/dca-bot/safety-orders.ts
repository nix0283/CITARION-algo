/**
 * DCA Bot Safety Orders - Enhanced Implementation (10/10)
 * 
 * Complete Safety Orders implementation with:
 * - Dynamic price deviation calculation
 * - Volume scaling with exponential/martingale modes
 * - Conditional triggering based on market conditions
 * - Order execution with smart timing
 * - Price target recalculation after each fill
 */

// ==================== TYPES ====================

export interface SafetyOrderConfig {
  enabled: boolean;
  triggerDrawdown: number;          // % падения для активации safety order
  safetyAmount: number;             // Сумма safety ордера (USDT)
  safetyAmountMultiplier: number;   // Множитель суммы для каждого последующего SO
  maxSafetyOrders: number;          // Максимум safety ордеров
  safetyInterval: number;           // Минут между safety ордерами
  priceDeviation: number;           // % отклонения цены между safety ордерами
  priceDeviationScale: number;      // Множитель отклонения для каждого уровня
  scalingMode: 'EXPONENTIAL' | 'LINEAR' | 'MARTINGALE';
  conditionalTrigger: boolean;      // Использовать условный триггер (RSI, volume)
  rsiThreshold: number;             // RSI уровень для активации
  volumeMultiplier: number;         // Минимальный объём для активации
  maxTotalInvestment: number;       // Макс общая инвестиция в safety orders
  cooldownAfterVolatility: number;  // Минут охлаждения после высокой волатильности
}

export interface SafetyOrder {
  index: number;                    // Порядковый номер (1, 2, 3...)
  triggerPrice: number;             // Цена активации
  actualTriggerPrice?: number;      // Реальная цена при срабатывании
  amount: number;                   // Сумма ордера (USDT)
  quantity: number;                 // Количество монет
  volumeScale: number;              // Применённый множитель объёма
  priceDeviation: number;           // Применённое отклонение цены
  status: "PENDING" | "TRIGGERED" | "FILLED" | "CANCELLED" | "SKIPPED";
  triggeredAt?: Date;
  filledAt?: Date;
  filledPrice?: number;
  filledQuantity?: number;
  fee?: number;
  conditionalMet: boolean;          // Были ли выполнены условия для триггера
  skipReason?: string;              // Причина пропуска (если SKIPPED)
}

export interface SafetyOrderState {
  safetyOrders: SafetyOrder[];
  triggeredCount: number;
  filledCount: number;
  totalSafetyInvested: number;
  lastTriggerTime?: Date;
  avgEntryAfterSafety: number;
  totalQuantityAfterSafety: number;
  costReductionPercent: number;     // Насколько снизилась средняя цена входа
  volatilityLockUntil?: Date;       // Блокировка из-за волатильности
}

export interface SafetyOrderTriggerContext {
  currentPrice: number;
  currentRSI?: number;
  currentVolume?: number;
  avgVolume?: number;
  volatility?: number;
  avgEntryPrice: number;
  baseQuantity: number;
}

export interface SafetyOrderFillResult {
  order: SafetyOrder;
  newAvgEntryPrice: number;
  newTotalQuantity: number;
  costReduction: number;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_SAFETY_ORDER_CONFIG: SafetyOrderConfig = {
  enabled: true,
  triggerDrawdown: 3,               // 3% просадки для активации первого SO
  safetyAmount: 50,                 // 50 USDT на safety order
  safetyAmountMultiplier: 1.5,      // Каждый следующий на 50% больше
  maxSafetyOrders: 6,               // Максимум 6 safety ордеров
  safetyInterval: 15,               // Минимум 15 минут между ордерами
  priceDeviation: 2,                // 2% между ордерами
  priceDeviationScale: 1.2,         // Увеличение отклонения на 20% каждый уровень
  scalingMode: 'EXPONENTIAL',
  conditionalTrigger: true,
  rsiThreshold: 35,                 // RSI < 35 для активации
  volumeMultiplier: 1.2,            // Объём должен быть > 1.2x среднего
  maxTotalInvestment: 2000,         // Макс 2000 USDT на safety orders
  cooldownAfterVolatility: 10,      // 10 минут охлаждения
};

// ==================== SAFETY ORDER MANAGER ====================

export class SafetyOrderManager {
  private config: SafetyOrderConfig;
  private state: SafetyOrderState;
  private entryPrice: number = 0;
  private baseQuantity: number = 0;
  private priceHistory: number[] = [];
  private volatilityHistory: number[] = [];

  constructor(config: Partial<SafetyOrderConfig> = {}) {
    this.config = { ...DEFAULT_SAFETY_ORDER_CONFIG, ...config };
    this.state = {
      safetyOrders: [],
      triggeredCount: 0,
      filledCount: 0,
      totalSafetyInvested: 0,
      avgEntryAfterSafety: 0,
      totalQuantityAfterSafety: 0,
      costReductionPercent: 0,
    };
  }

  /**
   * Initialize safety orders based on entry price
   */
  initialize(entryPrice: number, baseQuantity: number = 0): void {
    this.entryPrice = entryPrice;
    this.baseQuantity = baseQuantity;
    this.state.safetyOrders = [];
    this.state.triggeredCount = 0;
    this.state.filledCount = 0;
    this.state.totalSafetyInvested = 0;
    this.state.avgEntryAfterSafety = entryPrice;
    this.state.totalQuantityAfterSafety = baseQuantity;
    this.state.costReductionPercent = 0;

    if (!this.config.enabled) return;

    // Pre-calculate all safety order levels
    this.calculateSafetyOrderLevels();
  }

  /**
   * Calculate all safety order levels with dynamic parameters
   */
  private calculateSafetyOrderLevels(): void {
    let currentTriggerPrice = this.entryPrice * (1 - this.config.triggerDrawdown / 100);
    let currentAmount = this.config.safetyAmount;
    let currentDeviation = this.config.triggerDrawdown;
    let cumulativeInvestment = 0;

    for (let i = 0; i < this.config.maxSafetyOrders; i++) {
      // Check max investment limit
      if (cumulativeInvestment + currentAmount > this.config.maxTotalInvestment) {
        // Adjust amount to fit within limit
        currentAmount = this.config.maxTotalInvestment - cumulativeInvestment;
        if (currentAmount <= 0) break;
      }

      const order: SafetyOrder = {
        index: i + 1,
        triggerPrice: currentTriggerPrice,
        amount: currentAmount,
        quantity: 0, // Will be calculated when triggered
        volumeScale: this.calculateVolumeScale(i + 1),
        priceDeviation: currentDeviation,
        status: "PENDING",
        conditionalMet: false,
      };

      this.state.safetyOrders.push(order);
      cumulativeInvestment += currentAmount;

      // Calculate next level parameters
      currentDeviation += this.config.priceDeviation * Math.pow(this.config.priceDeviationScale, i);
      currentTriggerPrice = this.entryPrice * (1 - currentDeviation / 100);
      currentAmount = this.calculateNextAmount(currentAmount, i + 1);
    }
  }

  /**
   * Calculate volume scale based on scaling mode
   */
  private calculateVolumeScale(level: number): number {
    switch (this.config.scalingMode) {
      case 'EXPONENTIAL':
        return Math.pow(this.config.safetyAmountMultiplier, level - 1);
      case 'LINEAR':
        return 1 + (this.config.safetyAmountMultiplier - 1) * (level - 1);
      case 'MARTINGALE':
        return Math.pow(2, level - 1);
      default:
        return 1;
    }
  }

  /**
   * Calculate next amount based on scaling mode
   */
  private calculateNextAmount(currentAmount: number, level: number): number {
    switch (this.config.scalingMode) {
      case 'EXPONENTIAL':
        return currentAmount * this.config.safetyAmountMultiplier;
      case 'LINEAR':
        return this.config.safetyAmount * this.calculateVolumeScale(level);
      case 'MARTINGALE':
        return this.config.safetyAmount * Math.pow(2, level - 1);
      default:
        return currentAmount;
    }
  }

  /**
   * Check if safety orders should be triggered with enhanced conditions
   */
  checkTriggers(context: SafetyOrderTriggerContext): SafetyOrder[] {
    if (!this.config.enabled) return [];

    const triggeredOrders: SafetyOrder[] = [];
    const now = new Date();

    // Check volatility lock
    if (this.state.volatilityLockUntil && now < this.state.volatilityLockUntil) {
      return [];
    }

    // Update price history for volatility calculation
    this.updatePriceHistory(context.currentPrice);

    for (const order of this.state.safetyOrders) {
      if (order.status !== "PENDING") continue;

      // Check price trigger
      if (context.currentPrice > order.triggerPrice) continue;

      // Check interval
      if (this.state.lastTriggerTime) {
        const minutesSinceLastTrigger = 
          (now.getTime() - this.state.lastTriggerTime.getTime()) / (1000 * 60);
        
        if (minutesSinceLastTrigger < this.config.safetyInterval) {
          continue; // Not enough time passed
        }
      }

      // Check conditional triggers
      const conditionalResult = this.checkConditionalTriggers(context, order);
      if (this.config.conditionalTrigger && !conditionalResult.met) {
        order.conditionalMet = false;
        continue;
      }
      order.conditionalMet = true;

      // Trigger the order
      order.status = "TRIGGERED";
      order.triggeredAt = now;
      order.actualTriggerPrice = context.currentPrice;
      order.quantity = order.amount / context.currentPrice;
      
      this.state.triggeredCount++;
      this.state.lastTriggerTime = now;
      
      triggeredOrders.push(order);

      // Set volatility lock if needed
      if (context.volatility && context.volatility > 0.03) {
        this.state.volatilityLockUntil = new Date(
          now.getTime() + this.config.cooldownAfterVolatility * 60 * 1000
        );
      }
    }

    return triggeredOrders;
  }

  /**
   * Check conditional triggers (RSI, volume)
   */
  private checkConditionalTriggers(
    context: SafetyOrderTriggerContext,
    order: SafetyOrder
  ): { met: boolean; reason?: string } {
    // RSI check
    if (context.currentRSI !== undefined) {
      if (context.currentRSI > this.config.rsiThreshold) {
        return { met: false, reason: `RSI ${context.currentRSI.toFixed(1)} > threshold ${this.config.rsiThreshold}` };
      }
    }

    // Volume check
    if (context.currentVolume !== undefined && context.avgVolume !== undefined) {
      const volumeRatio = context.currentVolume / context.avgVolume;
      if (volumeRatio < this.config.volumeMultiplier) {
        return { met: false, reason: `Volume ratio ${volumeRatio.toFixed(2)} < required ${this.config.volumeMultiplier}` };
      }
    }

    return { met: true };
  }

  /**
   * Update price history for volatility calculation
   */
  private updatePriceHistory(price: number): void {
    this.priceHistory.push(price);
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }

    // Calculate rolling volatility
    if (this.priceHistory.length > 20) {
      const returns: number[] = [];
      for (let i = 1; i < this.priceHistory.length; i++) {
        returns.push((this.priceHistory[i] - this.priceHistory[i-1]) / this.priceHistory[i-1]);
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      this.volatilityHistory.push(Math.sqrt(variance));
      if (this.volatilityHistory.length > 20) {
        this.volatilityHistory.shift();
      }
    }
  }

  /**
   * Get current volatility
   */
  getCurrentVolatility(): number {
    if (this.volatilityHistory.length === 0) return 0;
    return this.volatilityHistory[this.volatilityHistory.length - 1];
  }

  /**
   * Mark order as filled and recalculate averages
   */
  markFilled(orderIndex: number, filledPrice: number, filledQuantity?: number, fee?: number): SafetyOrderFillResult | null {
    const order = this.state.safetyOrders.find(o => o.index === orderIndex);
    if (!order || order.status !== "TRIGGERED") return null;

    order.status = "FILLED";
    order.filledAt = new Date();
    order.filledPrice = filledPrice;
    order.filledQuantity = filledQuantity ?? order.quantity;
    order.fee = fee ?? 0;

    this.state.filledCount++;
    this.state.totalSafetyInvested += order.amount;

    // Recalculate average entry price
    const prevTotalInvested = this.state.avgEntryAfterSafety * this.state.totalQuantityAfterSafety;
    const newInvestment = filledPrice * order.filledQuantity!;
    const newTotalInvested = prevTotalInvested + newInvestment;
    const newTotalQuantity = this.state.totalQuantityAfterSafety + order.filledQuantity!;

    const newAvgEntry = newTotalInvested / newTotalQuantity;
    const costReduction = ((this.entryPrice - newAvgEntry) / this.entryPrice) * 100;

    this.state.avgEntryAfterSafety = newAvgEntry;
    this.state.totalQuantityAfterSafety = newTotalQuantity;
    this.state.costReductionPercent = costReduction;

    return {
      order,
      newAvgEntryPrice: newAvgEntry,
      newTotalQuantity: newTotalQuantity,
      costReduction,
    };
  }

  /**
   * Skip a pending safety order
   */
  skipOrder(orderIndex: number, reason: string): void {
    const order = this.state.safetyOrders.find(o => o.index === orderIndex);
    if (!order || order.status !== "PENDING") return;

    order.status = "SKIPPED";
    order.skipReason = reason;
  }

  /**
   * Cancel all pending safety orders
   */
  cancelAll(): void {
    for (const order of this.state.safetyOrders) {
      if (order.status === "PENDING" || order.status === "TRIGGERED") {
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
   * Get remaining safety orders capacity
   */
  getRemainingCapacity(): { orders: number; amount: number } {
    const pendingOrders = this.state.safetyOrders.filter(o => o.status === "PENDING");
    const remainingAmount = pendingOrders.reduce((sum, o) => sum + o.amount, 0);
    return {
      orders: pendingOrders.length,
      amount: remainingAmount,
    };
  }

  /**
   * Get filled safety orders
   */
  getFilledOrders(): SafetyOrder[] {
    return this.state.safetyOrders.filter(o => o.status === "FILLED");
  }

  /**
   * Get triggered but not filled orders
   */
  getTriggeredOrders(): SafetyOrder[] {
    return this.state.safetyOrders.filter(o => o.status === "TRIGGERED");
  }

  /**
   * Calculate projected average entry if all safety orders fill
   */
  calculateProjectedEntry(): number {
    const filledOrders = this.getFilledOrders();
    const pendingOrders = this.state.safetyOrders.filter(o => o.status === "PENDING");

    let totalInvested = this.state.avgEntryAfterSafety * this.state.totalQuantityAfterSafety;
    let totalQuantity = this.state.totalQuantityAfterSafety;

    // Add filled orders
    for (const order of filledOrders) {
      totalInvested += order.amount;
      totalQuantity += order.quantity;
    }

    // Add pending orders at their trigger prices
    for (const order of pendingOrders) {
      totalInvested += order.amount;
      totalQuantity += order.amount / order.triggerPrice;
    }

    return totalInvested / totalQuantity;
  }

  /**
   * Get next safety order info
   */
  getNextSafetyOrder(): SafetyOrder | null {
    return this.state.safetyOrders.find(o => o.status === "PENDING") || null;
  }

  /**
   * Get cost reduction achieved
   */
  getCostReduction(): number {
    return this.state.costReductionPercent;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      safetyOrders: [],
      triggeredCount: 0,
      filledCount: 0,
      totalSafetyInvested: 0,
      avgEntryAfterSafety: 0,
      totalQuantityAfterSafety: 0,
      costReductionPercent: 0,
    };
    this.entryPrice = 0;
    this.baseQuantity = 0;
    this.priceHistory = [];
    this.volatilityHistory = [];
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<SafetyOrderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get config
   */
  getConfig(): SafetyOrderConfig {
    return { ...this.config };
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

/**
 * Calculate optimal safety order parameters
 */
export function calculateOptimalSafetyParams(
  balance: number,
  riskPercent: number,
  volatility: number,
  maxDrawdown: number
): {
  triggerDrawdown: number;
  safetyAmount: number;
  maxSafetyOrders: number;
  priceDeviation: number;
} {
  // Higher volatility = wider triggers and fewer orders
  // Higher risk tolerance = more aggressive scaling

  const baseTrigger = 2 + (volatility * 100); // 2% base + volatility adjustment
  const baseAmount = balance * (riskPercent / 100) * 0.15; // 15% of risk per order
  const maxOrders = Math.min(8, Math.max(3, Math.floor(maxDrawdown / baseTrigger)));
  const deviation = baseTrigger * 0.8;

  return {
    triggerDrawdown: Math.min(10, baseTrigger),
    safetyAmount: Math.max(20, baseAmount),
    maxSafetyOrders: maxOrders,
    priceDeviation: Math.min(5, deviation),
  };
}
