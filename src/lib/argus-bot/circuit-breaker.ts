/**
 * Argus Bot Circuit Breaker
 * 
 * Implements progressive cooldown to handle extended losing streaks:
 * - 1st trigger: 1 hour cooldown
 * - 2nd trigger: 4 hours cooldown
 * - 3rd trigger: 24 hours cooldown
 * - 4th+ trigger: Manual reset required
 */

/**
 * Progressive cooldown configuration
 */
export interface ProgressiveCooldown {
  /** Number of times the circuit breaker has been triggered */
  triggers: number;
  /** Current cooldown duration in ms */
  currentCooldown: number;
  /** Maximum cooldown before manual reset required (24 hours) */
  maxCooldown: number;
  /** History of trigger times for analysis */
  triggerHistory: Date[];
}

/**
 * Cooldown levels for progressive backoff
 */
const COOLDOWN_LEVELS = [
  60 * 60 * 1000,      // 1st trigger: 1 hour
  4 * 60 * 60 * 1000,  // 2nd trigger: 4 hours
  24 * 60 * 60 * 1000, // 3rd trigger: 24 hours
];

const MAX_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours max before manual reset
const MANUAL_RESET_THRESHOLD = 4; // After 4 triggers, manual reset required

export interface CircuitBreakerConfig {
  enabled: boolean;
  maxConsecutiveLosses: number;
  maxDailyLoss: number;
  maxDailyLossPercent: number;
  /** @deprecated Use progressive cooldown instead */
  cooldownMinutes: number;
  maxTradesPerHour: number;
  /** Enable progressive cooldown (default: true) */
  progressiveCooldown: boolean;
}

export interface CircuitBreakerState {
  active: boolean;
  triggeredAt?: Date;
  reason?: string;
  until?: Date;
  consecutiveLosses: number;
  dailyPnl: number;
  hourlyTrades: number;
  lastTradeTime?: Date;
  lastReset: Date;
  /** Progressive cooldown state */
  progressive: ProgressiveCooldown;
  /** Whether manual reset is required */
  requiresManualReset: boolean;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  maxConsecutiveLosses: 5,
  maxDailyLoss: 500,
  maxDailyLossPercent: 10,
  cooldownMinutes: 60, // Kept for backwards compatibility
  maxTradesPerHour: 20,
  progressiveCooldown: true,
};

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;
  private initialBalance: number;

  constructor(config: Partial<CircuitBreakerConfig> = {}, initialBalance: number = 10000) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialBalance = initialBalance;
    this.state = {
      active: false,
      consecutiveLosses: 0,
      dailyPnl: 0,
      hourlyTrades: 0,
      lastReset: new Date(),
      progressive: {
        triggers: 0,
        currentCooldown: 0,
        maxCooldown: MAX_COOLDOWN,
        triggerHistory: [],
      },
      requiresManualReset: false,
    };
  }

  canTrade(): { allowed: boolean; reason?: string } {
    if (!this.config.enabled) return { allowed: true };

    if (this.state.active) {
      if (this.state.until && new Date() < this.state.until) {
        return { allowed: false, reason: `Circuit breaker active until ${this.state.until.toISOString()}` };
      } else {
        this.deactivate();
      }
    }

    this.checkHourlyReset();
    if (this.state.hourlyTrades >= this.config.maxTradesPerHour) {
      return { allowed: false, reason: `Hourly trade limit reached (${this.config.maxTradesPerHour})` };
    }

    return { allowed: true };
  }

  recordTrade(pnl: number): { triggered: boolean; reason?: string } {
    this.state.dailyPnl += pnl;
    this.state.hourlyTrades++;
    this.state.lastTradeTime = new Date();

    if (pnl < 0) {
      this.state.consecutiveLosses++;
      if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses) {
        return this.trigger(`Too many consecutive losses (${this.state.consecutiveLosses})`);
      }
    } else {
      // Reset consecutive losses on profitable trade
      this.state.consecutiveLosses = 0;
      
      // Reset progressive cooldown on successful trade
      // This rewards the bot for recovering
      if (pnl > 0 && this.config.progressiveCooldown) {
        this.resetProgressiveCooldown();
      }
    }

    if (this.state.dailyPnl <= -this.config.maxDailyLoss) {
      return this.trigger(`Max daily loss reached ($${this.config.maxDailyLoss})`);
    }

    const dailyLossPercent = (Math.abs(this.state.dailyPnl) / this.initialBalance) * 100;
    if (dailyLossPercent >= this.config.maxDailyLossPercent) {
      return this.trigger(`Max daily loss percent reached (${dailyLossPercent.toFixed(1)}%)`);
    }

    return { triggered: false };
  }

  private trigger(reason: string): { triggered: boolean; reason: string } {
    this.state.active = true;
    this.state.triggeredAt = new Date();
    this.state.reason = reason;
    
    // Calculate progressive cooldown
    const cooldownMs = this.calculateProgressiveCooldown();
    
    if (this.state.requiresManualReset) {
      console.error(
        `[CircuitBreaker] TRIGGERED: ${reason}. MANUAL RESET REQUIRED. ` +
        `Trigger count: ${this.state.progressive.triggers}. ` +
        `This is the ${this.ordinal(this.state.progressive.triggers)} trigger.`
      );
      this.state.until = undefined; // No automatic cooldown end
    } else {
      this.state.until = new Date(Date.now() + cooldownMs);
      console.warn(
        `[CircuitBreaker] TRIGGERED: ${reason}. ` +
        `Cooldown: ${this.formatCooldown(cooldownMs)} until ${this.state.until}. ` +
        `Trigger count: ${this.state.progressive.triggers}`
      );
    }
    
    return { triggered: true, reason };
  }

  /**
   * Calculate cooldown based on trigger count (progressive backoff)
   */
  private calculateProgressiveCooldown(): number {
    // Increment trigger count
    this.state.progressive.triggers++;
    this.state.progressive.triggerHistory.push(new Date());
    
    // Check if manual reset is required
    if (this.state.progressive.triggers >= MANUAL_RESET_THRESHOLD) {
      this.state.requiresManualReset = true;
      return Infinity; // No automatic cooldown
    }
    
    // Get cooldown from levels array (clamped to array length)
    const levelIndex = Math.min(this.state.progressive.triggers - 1, COOLDOWN_LEVELS.length - 1);
    const cooldown = COOLDOWN_LEVELS[levelIndex];
    
    this.state.progressive.currentCooldown = cooldown;
    return cooldown;
  }

  /**
   * Reset progressive cooldown (called on successful trade or manual reset)
   */
  private resetProgressiveCooldown(): void {
    if (this.state.progressive.triggers > 0) {
      console.log(
        `[CircuitBreaker] Progressive cooldown reset due to profitable trade. ` +
        `Previous triggers: ${this.state.progressive.triggers}`
      );
    }
    this.state.progressive = {
      triggers: 0,
      currentCooldown: 0,
      maxCooldown: MAX_COOLDOWN,
      triggerHistory: [],
    };
    this.state.requiresManualReset = false;
  }

  /**
   * Format cooldown duration for logging
   */
  private formatCooldown(ms: number): string {
    if (ms === Infinity) return 'MANUAL RESET REQUIRED';
    
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get ordinal suffix for number (1st, 2nd, 3rd, etc.)
   */
  private ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  private deactivate(): void {
    this.state.active = false;
    this.state.triggeredAt = undefined;
    this.state.reason = undefined;
    this.state.until = undefined;
    this.state.consecutiveLosses = 0;
    // Note: progressive cooldown state is NOT reset on deactivation
    // It only resets on successful trade or explicit manual reset
  }

  private checkHourlyReset(): void {
    const now = new Date();
    const hoursSinceReset = (now.getTime() - this.state.lastReset.getTime()) / (60 * 60 * 1000);
    if (hoursSinceReset >= 1) {
      this.state.hourlyTrades = 0;
      this.state.lastReset = now;
    }
  }

  resetDaily(): void {
    this.state.dailyPnl = 0;
    this.state.hourlyTrades = 0;
    this.state.consecutiveLosses = 0;
    this.state.lastReset = new Date();
  }

  /**
   * Force reset the circuit breaker (manual intervention)
   * This is required after 4+ triggers
   */
  forceReset(): void {
    this.state = {
      active: false,
      consecutiveLosses: 0,
      dailyPnl: 0,
      hourlyTrades: 0,
      lastReset: new Date(),
      progressive: {
        triggers: 0,
        currentCooldown: 0,
        maxCooldown: MAX_COOLDOWN,
        triggerHistory: [],
      },
      requiresManualReset: false,
    };
    console.log('[CircuitBreaker] Force reset completed. Progressive cooldown cleared.');
  }

  /**
   * Get progressive cooldown statistics
   */
  getProgressiveStats(): {
    triggers: number;
    currentCooldown: number;
    requiresManualReset: boolean;
    triggerHistory: Date[];
  } {
    return {
      triggers: this.state.progressive.triggers,
      currentCooldown: this.state.progressive.currentCooldown,
      requiresManualReset: this.state.requiresManualReset,
      triggerHistory: [...this.state.progressive.triggerHistory],
    };
  }

  /**
   * Check if circuit breaker requires manual reset
   */
  isManualResetRequired(): boolean {
    return this.state.requiresManualReset;
  }

  getState(): CircuitBreakerState { return { ...this.state }; }
  updateConfig(config: Partial<CircuitBreakerConfig>): void { this.config = { ...this.config, ...config }; }
  updateBalance(balance: number): void { this.initialBalance = balance; }
}
