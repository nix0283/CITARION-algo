/**
 * Copy Trading Follower Risk Manager
 * 
 * Управление рисками для подписчиков при копировании сделок.
 * Защита от чрезмерных убытков и контроль экспозиции.
 */

// ==================== TYPES ====================

export interface FollowerRiskConfig {
  /** Максимальный % от депозита на одну сделку */
  maxTradeSizePercent: number;
  
  /** Максимальный % от депозита в одной позиции */
  maxPositionSizePercent: number;
  
  /** Максимальная общая экспозиция (% от депозита) */
  maxTotalExposurePercent: number;
  
  /** Максимальная дневная просадка (%) */
  maxDailyDrawdownPercent: number;
  
  /** Максимальная недельная просадка (%) */
  maxWeeklyDrawdownPercent: number;
  
  /** Максимальное количество открытых позиций */
  maxOpenPositions: number;
  
  /** Коэффициент копирования (0.1 - 2.0) */
  copyRatio: number;
  
  /** Минимальный баланс для копирования */
  minBalanceRequired: number;
  
  /** Приостановка при просадке */
  pauseOnDrawdown: boolean;
  
  /** Дни торговли (1-7, где 1 = понедельник) */
  tradingDays: number[];
  
  /** Часы торговли (UTC) */
  tradingHours: {
    start: number;
    end: number;
  };
}

export interface FollowerRiskState {
  followerId: string;
  availableBalance: number;
  totalBalance: number;
  currentExposure: number;
  openPositions: number;
  dailyPnL: number;
  weeklyPnL: number;
  dailyDrawdown: number;
  weeklyDrawdown: number;
  isPaused: boolean;
  pauseReason?: string;
  lastTradeAt?: Date;
  lastCheckAt: Date;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  adjustedSize?: number;
  warnings: string[];
}

export interface PositionRequest {
  symbol: string;
  direction: "LONG" | "SHORT";
  masterSize: number;       // Размер позиции мастера (USDT)
  masterLeverage: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_RISK_CONFIG: FollowerRiskConfig = {
  maxTradeSizePercent: 5,           // 5% на сделку
  maxPositionSizePercent: 10,        // 10% на позицию
  maxTotalExposurePercent: 50,       // 50% общая экспозиция
  maxDailyDrawdownPercent: 5,        // 5% дневная просадка
  maxWeeklyDrawdownPercent: 15,      // 15% недельная просадка
  maxOpenPositions: 5,
  copyRatio: 1.0,                    // 100% копирование
  minBalanceRequired: 100,           // Минимум $100
  pauseOnDrawdown: true,
  tradingDays: [1, 2, 3, 4, 5],      // Пн-Пт
  tradingHours: {
    start: 0,                        // 00:00 UTC
    end: 24,                         // 24:00 UTC
  },
};

// ==================== RISK MANAGER CLASS ====================

export class FollowerRiskManager {
  private config: FollowerRiskConfig;
  private state: FollowerRiskState;
  private tradeHistory: Array<{
    timestamp: Date;
    pnl: number;
    size: number;
  }> = [];

  constructor(
    followerId: string,
    initialBalance: number,
    config: Partial<FollowerRiskConfig> = {}
  ) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
    this.state = {
      followerId,
      availableBalance: initialBalance,
      totalBalance: initialBalance,
      currentExposure: 0,
      openPositions: 0,
      dailyPnL: 0,
      weeklyPnL: 0,
      dailyDrawdown: 0,
      weeklyDrawdown: 0,
      isPaused: false,
      lastCheckAt: new Date(),
    };
  }

  /**
   * Проверить, можно ли открыть позицию
   */
  canOpenPosition(request: PositionRequest): RiskCheckResult {
    const warnings: string[] = [];

    // 1. Проверка паузы
    if (this.state.isPaused) {
      return {
        allowed: false,
        reason: `Trading is paused: ${this.state.pauseReason}`,
        warnings,
      };
    }

    // 2. Проверка минимального баланса
    if (this.state.totalBalance < this.config.minBalanceRequired) {
      return {
        allowed: false,
        reason: `Balance too low: ${this.state.totalBalance} < ${this.config.minBalanceRequired}`,
        warnings,
      };
    }

    // 3. Проверка количества открытых позиций
    if (this.state.openPositions >= this.config.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Max open positions reached: ${this.state.openPositions}/${this.config.maxOpenPositions}`,
        warnings,
      };
    }

    // 4. Проверка торгового времени
    const timeCheck = this.checkTradingTime();
    if (!timeCheck.allowed) {
      return { ...timeCheck, warnings };
    }

    // 5. Проверка просадки
    const drawdownCheck = this.checkDrawdown();
    if (!drawdownCheck.allowed) {
      return { ...drawdownCheck, warnings };
    }

    // 6. Расчёт размера позиции с учётом copyRatio
    let adjustedSize = request.masterSize * this.config.copyRatio;

    // 7. Проверка максимального размера сделки
    const maxTradeSize = this.state.totalBalance * (this.config.maxTradeSizePercent / 100);
    if (adjustedSize > maxTradeSize) {
      warnings.push(`Trade size reduced from ${adjustedSize.toFixed(2)} to ${maxTradeSize.toFixed(2)} (max trade size limit)`);
      adjustedSize = maxTradeSize;
    }

    // 8. Проверка максимального размера позиции (с учётом плеча)
    const maxPositionSize = this.state.totalBalance * (this.config.maxPositionSizePercent / 100);
    const positionValue = adjustedSize * request.masterLeverage;
    if (positionValue > maxPositionSize) {
      const newSize = maxPositionSize / request.masterLeverage;
      warnings.push(`Position size reduced from ${adjustedSize.toFixed(2)} to ${newSize.toFixed(2)} (max position size limit)`);
      adjustedSize = newSize;
    }

    // 9. Проверка общей экспозиции
    const newExposure = this.state.currentExposure + positionValue;
    const maxExposure = this.state.totalBalance * (this.config.maxTotalExposurePercent / 100);
    if (newExposure > maxExposure) {
      const availableForTrade = maxExposure - this.state.currentExposure;
      if (availableForTrade <= 0) {
        return {
          allowed: false,
          reason: `Max exposure reached: ${this.state.currentExposure.toFixed(2)}/${maxExposure.toFixed(2)}`,
          warnings,
        };
      }
      const newSize = availableForTrade / request.masterLeverage;
      warnings.push(`Trade size reduced due to exposure limit: ${newSize.toFixed(2)}`);
      adjustedSize = Math.min(adjustedSize, newSize);
    }

    // 10. Проверка доступного баланса
    const requiredMargin = adjustedSize / request.masterLeverage;
    if (requiredMargin > this.state.availableBalance) {
      const possibleSize = this.state.availableBalance * request.masterLeverage;
      if (possibleSize < this.config.minBalanceRequired * 0.1) {
        return {
          allowed: false,
          reason: `Insufficient balance: need ${requiredMargin.toFixed(2)}, have ${this.state.availableBalance.toFixed(2)}`,
          warnings,
        };
      }
      warnings.push(`Trade size reduced due to insufficient balance`);
      adjustedSize = possibleSize;
    }

    return {
      allowed: true,
      adjustedSize,
      warnings,
    };
  }

  /**
   * Проверка торгового времени
   */
  private checkTradingTime(): RiskCheckResult {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = воскресенье
    const hour = now.getUTCHours();

    // Конвертируем в формат 1-7 (1 = понедельник)
    const tradingDay = dayOfWeek === 0 ? 7 : dayOfWeek;

    if (!this.config.tradingDays.includes(tradingDay)) {
      return {
        allowed: false,
        reason: `Trading not allowed on this day`,
        warnings: [],
      };
    }

    if (hour < this.config.tradingHours.start || hour >= this.config.tradingHours.end) {
      return {
        allowed: false,
        reason: `Trading not allowed at this hour (${hour}:00 UTC)`,
        warnings: [],
      };
    }

    return { allowed: true, warnings: [] };
  }

  /**
   * Проверка просадки
   */
  private checkDrawdown(): RiskCheckResult {
    if (this.state.dailyDrawdown >= this.config.maxDailyDrawdownPercent) {
      if (this.config.pauseOnDrawdown) {
        this.state.isPaused = true;
        this.state.pauseReason = `Daily drawdown limit reached: ${this.state.dailyDrawdown.toFixed(2)}%`;
      }
      return {
        allowed: false,
        reason: `Daily drawdown limit reached: ${this.state.dailyDrawdown.toFixed(2)}%`,
        warnings: [],
      };
    }

    if (this.state.weeklyDrawdown >= this.config.maxWeeklyDrawdownPercent) {
      if (this.config.pauseOnDrawdown) {
        this.state.isPaused = true;
        this.state.pauseReason = `Weekly drawdown limit reached: ${this.state.weeklyDrawdown.toFixed(2)}%`;
      }
      return {
        allowed: false,
        reason: `Weekly drawdown limit reached: ${this.state.weeklyDrawdown.toFixed(2)}%`,
        warnings: [],
      };
    }

    return { allowed: true, warnings: [] };
  }

  /**
   * Обновить состояние после открытия позиции
   */
  recordPositionOpened(size: number, leverage: number): void {
    const margin = size / leverage;
    this.state.availableBalance -= margin;
    this.state.currentExposure += size * leverage;
    this.state.openPositions++;
    this.state.lastTradeAt = new Date();
  }

  /**
   * Обновить состояние после закрытия позиции
   */
  recordPositionClosed(pnl: number, size: number, leverage: number): void {
    const margin = size / leverage;
    this.state.availableBalance += margin + pnl;
    this.state.totalBalance += pnl;
    this.state.currentExposure -= size * leverage;
    this.state.openPositions--;

    // Обновляем PnL
    this.state.dailyPnL += pnl;
    this.state.weeklyPnL += pnl;

    // Обновляем просадку
    this.updateDrawdown();

    // Записываем в историю
    this.tradeHistory.push({
      timestamp: new Date(),
      pnl,
      size,
    });

    // Очищаем старую историю
    this.cleanOldHistory();
  }

  /**
   * Обновить просадку
   */
  private updateDrawdown(): void {
    // Рассчитываем дневную просадку
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    const todayTrades = this.tradeHistory.filter(
      t => t.timestamp.getTime() >= today.getTime()
    );
    
    const todayPnL = todayTrades.reduce((sum, t) => sum + t.pnl, 0);
    this.state.dailyPnL = todayPnL;
    
    // Дневная просадка как % от начального баланса дня
    const startOfDayBalance = this.state.totalBalance - todayPnL;
    this.state.dailyDrawdown = startOfDayBalance > 0 
      ? Math.max(0, -todayPnL / startOfDayBalance * 100)
      : 0;

    // Рассчитываем недельную просадку
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weekTrades = this.tradeHistory.filter(
      t => t.timestamp.getTime() >= weekAgo.getTime()
    );
    
    const weekPnL = weekTrades.reduce((sum, t) => sum + t.pnl, 0);
    this.state.weeklyPnL = weekPnL;
    
    const startOfWeekBalance = this.state.totalBalance - weekPnL;
    this.state.weeklyDrawdown = startOfWeekBalance > 0
      ? Math.max(0, -weekPnL / startOfWeekBalance * 100)
      : 0;
  }

  /**
   * Очистить старую историю сделок
   */
  private cleanOldHistory(): void {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    
    this.tradeHistory = this.tradeHistory.filter(
      t => t.timestamp.getTime() >= monthAgo.getTime()
    );
  }

  /**
   * Обновить баланс (для синхронизации с биржей)
   */
  updateBalance(newBalance: number): void {
    const pnl = newBalance - this.state.totalBalance;
    this.state.totalBalance = newBalance;
    this.state.availableBalance = Math.max(0, newBalance - this.state.currentExposure);
    
    if (pnl < 0) {
      this.updateDrawdown();
    }
  }

  /**
   * Возобновить торговлю
   */
  resume(): void {
    this.state.isPaused = false;
    this.state.pauseReason = undefined;
  }

  /**
   * Приостановить торговлю
   */
  pause(reason: string): void {
    this.state.isPaused = true;
    this.state.pauseReason = reason;
  }

  // ==================== GETTERS ====================

  getState(): FollowerRiskState {
    return { ...this.state };
  }

  getConfig(): FollowerRiskConfig {
    return { ...this.config };
  }

  getAvailableBalance(): number {
    return this.state.availableBalance;
  }

  getTotalBalance(): number {
    return this.state.totalBalance;
  }

  getCurrentExposure(): number {
    return this.state.currentExposure;
  }

  getExposurePercent(): number {
    return (this.state.currentExposure / this.state.totalBalance) * 100;
  }

  isTrading(): boolean {
    return !this.state.isPaused && this.state.openPositions > 0;
  }

  // ==================== SETTERS ====================

  updateConfig(config: Partial<FollowerRiskConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setCopyRatio(ratio: number): void {
    this.config.copyRatio = Math.max(0.1, Math.min(2.0, ratio));
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Создать конфигурацию риск-менеджмента по профилю
 */
export function createRiskConfigByProfile(
  profile: "conservative" | "moderate" | "aggressive"
): FollowerRiskConfig {
  switch (profile) {
    case "conservative":
      return {
        maxTradeSizePercent: 2,
        maxPositionSizePercent: 5,
        maxTotalExposurePercent: 20,
        maxDailyDrawdownPercent: 3,
        maxWeeklyDrawdownPercent: 10,
        maxOpenPositions: 3,
        copyRatio: 0.5,
        minBalanceRequired: 100,
        pauseOnDrawdown: true,
        tradingDays: [1, 2, 3, 4, 5],
        tradingHours: { start: 8, end: 20 },
      };

    case "moderate":
      return {
        maxTradeSizePercent: 5,
        maxPositionSizePercent: 10,
        maxTotalExposurePercent: 50,
        maxDailyDrawdownPercent: 5,
        maxWeeklyDrawdownPercent: 15,
        maxOpenPositions: 5,
        copyRatio: 1.0,
        minBalanceRequired: 100,
        pauseOnDrawdown: true,
        tradingDays: [1, 2, 3, 4, 5, 6, 7],
        tradingHours: { start: 0, end: 24 },
      };

    case "aggressive":
      return {
        maxTradeSizePercent: 10,
        maxPositionSizePercent: 20,
        maxTotalExposurePercent: 80,
        maxDailyDrawdownPercent: 10,
        maxWeeklyDrawdownPercent: 25,
        maxOpenPositions: 10,
        copyRatio: 1.5,
        minBalanceRequired: 50,
        pauseOnDrawdown: false,
        tradingDays: [1, 2, 3, 4, 5, 6, 7],
        tradingHours: { start: 0, end: 24 },
      };
  }
}
