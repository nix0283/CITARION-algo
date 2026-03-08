/**
 * DCA Bot Risk Manager
 * 
 * Управление рисками для DCA бота.
 */

export interface DcaRiskConfig {
  maxOpenPositions: number;
  maxDcaOrders: number;
  maxPositionSize: number;
  maxPositionPercent: number;
  maxTotalInvested: number;
  maxTotalInvestedPercent: number;
  maxDrawdownPercent: number;
  maxDailyLoss: number;
  maxDailyLossPercent: number;
  cooldownBetweenOrders: number;
  cooldownAfterLoss: number;
  circuitBreakerEnabled: boolean;
  circuitBreakerLosses: number;
}

export interface DcaRiskState {
  openPositions: number;
  currentDcaOrders: number;
  totalInvested: number;
  currentDrawdown: number;
  dailyPnl: number;
  dailyLoss: number;
  consecutiveLosses: number;
  lastOrderTime?: Date;
  lastLossTime?: Date;
  circuitBreakerActive: boolean;
  circuitBreakerUntil?: Date;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
}

export const DEFAULT_DCA_RISK_CONFIG: DcaRiskConfig = {
  maxOpenPositions: 5,
  maxDcaOrders: 10,
  maxPositionSize: 1000,
  maxPositionPercent: 20,
  maxTotalInvested: 5000,
  maxTotalInvestedPercent: 50,
  maxDrawdownPercent: 30,
  maxDailyLoss: 500,
  maxDailyLossPercent: 10,
  cooldownBetweenOrders: 5,
  cooldownAfterLoss: 30,
  circuitBreakerEnabled: true,
  circuitBreakerLosses: 5,
};

export class DcaRiskManager {
  private config: DcaRiskConfig;
  private state: DcaRiskState;
  private availableBalance: number;

  constructor(config: Partial<DcaRiskConfig> = {}, initialBalance: number = 10000) {
    this.config = { ...DEFAULT_DCA_RISK_CONFIG, ...config };
    this.availableBalance = initialBalance;
    this.state = {
      openPositions: 0,
      currentDcaOrders: 0,
      totalInvested: 0,
      currentDrawdown: 0,
      dailyPnl: 0,
      dailyLoss: 0,
      consecutiveLosses: 0,
      circuitBreakerActive: false,
    };
  }

  canOpenDcaOrder(orderAmount: number, symbol: string, existingPositions: string[]): RiskCheckResult {
    if (this.state.circuitBreakerActive) {
      if (this.state.circuitBreakerUntil && new Date() < this.state.circuitBreakerUntil) {
        return { allowed: false, reason: `Circuit breaker active until ${this.state.circuitBreakerUntil.toISOString()}` };
      } else {
        this.state.circuitBreakerActive = false;
      }
    }

    if (this.state.currentDcaOrders >= this.config.maxDcaOrders) {
      return { allowed: false, reason: `Maximum DCA orders reached (${this.config.maxDcaOrders})` };
    }

    if (orderAmount > this.config.maxPositionSize) {
      return { allowed: false, reason: `Order amount exceeds max position size (${this.config.maxPositionSize} USDT)` };
    }

    const positionPercent = (orderAmount / this.availableBalance) * 100;
    if (positionPercent > this.config.maxPositionPercent) {
      return { allowed: false, reason: `Order amount exceeds max position percent (${this.config.maxPositionPercent}%)` };
    }

    const newTotal = this.state.totalInvested + orderAmount;
    if (newTotal > this.config.maxTotalInvested) {
      return { allowed: false, reason: `Total invested would exceed limit (${this.config.maxTotalInvested} USDT)` };
    }

    const totalPercent = (newTotal / this.availableBalance) * 100;
    if (totalPercent > this.config.maxTotalInvestedPercent) {
      return { allowed: false, reason: `Total invested would exceed ${this.config.maxTotalInvestedPercent}% of balance` };
    }

    if (orderAmount > this.availableBalance) {
      return { allowed: false, reason: "Insufficient balance" };
    }

    if (this.state.lastOrderTime) {
      const minutesSinceLastOrder = (Date.now() - this.state.lastOrderTime.getTime()) / (1000 * 60);
      if (minutesSinceLastOrder < this.config.cooldownBetweenOrders) {
        return { allowed: false, reason: `Cooldown active. Wait ${Math.ceil(this.config.cooldownBetweenOrders - minutesSinceLastOrder)} minutes` };
      }
    }

    if (this.state.lastLossTime && this.state.consecutiveLosses > 0) {
      const minutesSinceLoss = (Date.now() - this.state.lastLossTime.getTime()) / (1000 * 60);
      if (minutesSinceLoss < this.config.cooldownAfterLoss) {
        return { allowed: false, reason: `Post-loss cooldown active. Wait ${Math.ceil(this.config.cooldownAfterLoss - minutesSinceLoss)} minutes` };
      }
    }

    let warning: string | undefined;
    if (this.state.currentDcaOrders >= this.config.maxDcaOrders * 0.8) {
      warning = `Approaching max DCA orders (${this.state.currentDcaOrders}/${this.config.maxDcaOrders})`;
    }

    return { allowed: true, warning };
  }

  canOpenNewPosition(symbol: string, existingPositions: string[]): RiskCheckResult {
    if (existingPositions.includes(symbol)) {
      return { allowed: true };
    }
    if (this.state.openPositions >= this.config.maxOpenPositions) {
      return { allowed: false, reason: `Maximum open positions reached (${this.config.maxOpenPositions})` };
    }
    return { allowed: true };
  }

  recordOrderOpened(amount: number): void {
    this.state.currentDcaOrders++;
    this.state.totalInvested += amount;
    this.state.lastOrderTime = new Date();
  }

  recordPositionClosed(pnl: number, wasLoss: boolean): void {
    this.state.openPositions--;
    this.state.currentDcaOrders = 0;
    this.state.totalInvested = 0;
    this.state.dailyPnl += pnl;

    if (wasLoss) {
      this.state.dailyLoss += Math.abs(pnl);
      this.state.consecutiveLosses++;
      this.state.lastLossTime = new Date();

      if (this.config.circuitBreakerEnabled && this.state.consecutiveLosses >= this.config.circuitBreakerLosses) {
        this.triggerCircuitBreaker();
      }
      if (this.state.dailyLoss >= this.config.maxDailyLoss) {
        this.triggerCircuitBreaker();
      }
    } else {
      this.state.consecutiveLosses = 0;
    }

    const dailyLossPercent = (this.state.dailyLoss / this.availableBalance) * 100;
    if (dailyLossPercent >= this.config.maxDailyLossPercent) {
      this.triggerCircuitBreaker();
    }
  }

  private triggerCircuitBreaker(): void {
    this.state.circuitBreakerActive = true;
    this.state.circuitBreakerUntil = new Date(Date.now() + 60 * 60 * 1000);
    console.warn(`[DcaRiskManager] Circuit breaker triggered until ${this.state.circuitBreakerUntil}`);
  }

  updateDrawdown(drawdownPercent: number): RiskCheckResult {
    this.state.currentDrawdown = drawdownPercent;
    if (drawdownPercent >= this.config.maxDrawdownPercent) {
      return { allowed: false, reason: `Max drawdown reached (${drawdownPercent.toFixed(2)}% >= ${this.config.maxDrawdownPercent}%)` };
    }
    return { allowed: true };
  }

  updateBalance(balance: number): void {
    this.availableBalance = balance;
  }

  resetDaily(): void {
    this.state.dailyPnl = 0;
    this.state.dailyLoss = 0;
  }

  reset(): void {
    this.state = {
      openPositions: 0,
      currentDcaOrders: 0,
      totalInvested: 0,
      currentDrawdown: 0,
      dailyPnl: 0,
      dailyLoss: 0,
      consecutiveLosses: 0,
      circuitBreakerActive: false,
    };
  }

  getState(): DcaRiskState {
    return { ...this.state };
  }

  getConfig(): DcaRiskConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<DcaRiskConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createDcaRiskManager(config: Partial<DcaRiskConfig>, initialBalance: number): DcaRiskManager {
  return new DcaRiskManager(config, initialBalance);
}
