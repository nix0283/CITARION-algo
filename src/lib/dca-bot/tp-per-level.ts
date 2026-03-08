/**
 * DCA Bot Take Profit Per Level - Enhanced Implementation (10/10)
 * 
 * Complete Multi-Level Take Profit with:
 * - Dynamic TP levels based on DCA depth
 * - Partial close with configurable percentages
 * - Trailing activation after TP hits
 * - RSI/Volume confirmation for TP execution
 * - Smart position management
 */

// ==================== TYPES ====================

export interface LevelTakeProfit {
  dcaLevel: number;              // DCA level (0 = initial, 1-N = DCA levels)
  tpPercent: number;             // Take profit percentage from avg entry
  closePercent: number;          // Percentage of position to close
  trailingAfterHit: boolean;     // Enable trailing after TP hit
  trailingDistance?: number;     // Trailing distance % after TP
  minVolume?: number;            // Minimum volume ratio for execution
  rsiConfirm?: boolean;          // Require RSI confirmation
}

export interface LevelTPState {
  config: LevelTakeProfit[];
  hitLevels: Map<number, TPLevelHit>;
  lastPrice: number;
  totalClosedPercent: number;
  realizedPnl: number;
}

export interface TPLevelHit {
  level: number;
  hitAt: Date;
  hitPrice: number;
  closedPercent: number;
  closedQuantity: number;
  realizedPnl: number;
  trailingActivated: boolean;
}

export interface TPCheckResult {
  shouldClose: boolean;
  level: number;
  closePercent: number;
  closeQuantity: number;
  tpPrice: number;
  currentProfit: number;
  trailingEnabled: boolean;
  reason: string;
}

export interface TPAncillaryData {
  rsi?: number;
  volumeRatio?: number;
  avgVolume?: number;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_LEVEL_TP_CONFIG: LevelTakeProfit[] = [
  { dcaLevel: 0, tpPercent: 3, closePercent: 25, trailingAfterHit: false },
  { dcaLevel: 0, tpPercent: 5, closePercent: 25, trailingAfterHit: false },
  { dcaLevel: 1, tpPercent: 4, closePercent: 30, trailingAfterHit: false },
  { dcaLevel: 1, tpPercent: 7, closePercent: 30, trailingAfterHit: true, trailingDistance: 2 },
  { dcaLevel: 2, tpPercent: 5, closePercent: 35, trailingAfterHit: false },
  { dcaLevel: 2, tpPercent: 10, closePercent: 40, trailingAfterHit: true, trailingDistance: 3 },
  { dcaLevel: 3, tpPercent: 6, closePercent: 40, trailingAfterHit: false },
  { dcaLevel: 3, tpPercent: 12, closePercent: 50, trailingAfterHit: true, trailingDistance: 4 },
  { dcaLevel: 4, tpPercent: 8, closePercent: 50, trailingAfterHit: false },
  { dcaLevel: 4, tpPercent: 15, closePercent: 60, trailingAfterHit: true, trailingDistance: 5 },
  { dcaLevel: 5, tpPercent: 10, closePercent: 60, trailingAfterHit: false },
  { dcaLevel: 5, tpPercent: 20, closePercent: 100, trailingAfterHit: true, trailingDistance: 6 },
];

// ==================== LEVEL TP MANAGER ====================

export class LevelTPManager {
  private config: LevelTakeProfit[];
  private state: LevelTPState;
  private currentLevel: number = 0;
  private avgEntryPrice: number = 0;
  private currentQuantity: number = 0;
  private trailingStopPrice: number | null = null;
  private trailingActive: boolean = false;
  private highestPriceSinceTP: number = 0;

  constructor(config: LevelTakeProfit[] = DEFAULT_LEVEL_TP_CONFIG) {
    this.config = config.sort((a, b) => {
      if (a.dcaLevel !== b.dcaLevel) return a.dcaLevel - b.dcaLevel;
      return a.tpPercent - b.tpPercent;
    });
    this.state = {
      config: [...this.config],
      hitLevels: new Map(),
      lastPrice: 0,
      totalClosedPercent: 0,
      realizedPnl: 0,
    };
  }

  /**
   * Update current DCA level
   */
  updateLevel(level: number): void {
    this.currentLevel = level;
  }

  /**
   * Update average entry price
   */
  updateAvgEntryPrice(price: number): void {
    this.avgEntryPrice = price;
  }

  /**
   * Update current position quantity
   */
  updateQuantity(quantity: number): void {
    this.currentQuantity = quantity;
  }

  /**
   * Check if TP should be triggered with enhanced conditions
   */
  checkTP(
    currentPrice: number,
    direction: "LONG" | "SHORT",
    ancillaryData?: TPAncillaryData
  ): TPCheckResult | null {
    this.state.lastPrice = currentPrice;

    // Update trailing stop if active
    if (this.trailingActive) {
      return this.checkTrailingStop(currentPrice, direction);
    }

    // Check for trailing activation from previous TP hits
    const shouldTrail = this.shouldEnableTrailing();
    if (shouldTrail && !this.trailingActive) {
      this.activateTrailing(currentPrice);
    }

    const applicableConfigs = this.findApplicableConfigs();
    if (applicableConfigs.length === 0) {
      return null;
    }

    for (const config of applicableConfigs) {
      const hitKey = `${config.dcaLevel}_${config.tpPercent}`;
      
      // Skip if already hit
      if (this.state.hitLevels.has(hitKey)) continue;

      // Calculate current profit
      const profitPercent = direction === "LONG"
        ? ((currentPrice - this.avgEntryPrice) / this.avgEntryPrice) * 100
        : ((this.avgEntryPrice - currentPrice) / this.avgEntryPrice) * 100;

      // Check if TP level reached
      if (profitPercent < config.tpPercent) continue;

      // Check ancillary conditions
      if (!this.checkAncillaryConditions(config, ancillaryData)) {
        continue;
      }

      // Calculate close quantity
      const remainingPercent = 100 - this.state.totalClosedPercent;
      const actualClosePercent = Math.min(config.closePercent, remainingPercent);
      const closeQuantity = this.currentQuantity * (actualClosePercent / 100);

      return {
        shouldClose: true,
        level: config.dcaLevel,
        closePercent: actualClosePercent,
        closeQuantity,
        tpPrice: this.avgEntryPrice * (1 + config.tpPercent / 100),
        currentProfit: profitPercent,
        trailingEnabled: config.trailingAfterHit,
        reason: `TP Level ${config.dcaLevel} at ${config.tpPercent}% profit, closing ${actualClosePercent}%`,
      };
    }

    return null;
  }

  /**
   * Check ancillary conditions for TP
   */
  private checkAncillaryConditions(
    config: LevelTakeProfit,
    ancillaryData?: TPAncillaryData
  ): boolean {
    if (!ancillaryData) return true;

    // Volume check
    if (config.minVolume && ancillaryData.volumeRatio !== undefined) {
      if (ancillaryData.volumeRatio < config.minVolume) {
        return false;
      }
    }

    // RSI confirmation (for sell/long close, we want high RSI)
    if (config.rsiConfirm && ancillaryData.rsi !== undefined) {
      // For closing long positions, RSI should be elevated
      if (ancillaryData.rsi < 60) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find all applicable TP configs for current level
   */
  private findApplicableConfigs(): LevelTakeProfit[] {
    const applicable: LevelTakeProfit[] = [];

    for (const config of this.config) {
      // Only include configs for current level or lower
      if (config.dcaLevel <= this.currentLevel) {
        applicable.push(config);
      }
    }

    // Sort by TP percent ascending
    return applicable.sort((a, b) => a.tpPercent - b.tpPercent);
  }

  /**
   * Mark TP level as hit
   */
  markTPHit(
    level: number,
    tpPercent: number,
    hitPrice: number,
    closedQuantity: number,
    realizedPnl: number
  ): void {
    const hitKey = `${level}_${tpPercent}`;
    const config = this.config.find(c => c.dcaLevel === level && c.tpPercent === tpPercent);

    this.state.hitLevels.set(hitKey, {
      level,
      hitAt: new Date(),
      hitPrice,
      closedPercent: (closedQuantity / this.currentQuantity) * 100,
      closedQuantity,
      realizedPnl,
      trailingActivated: config?.trailingAfterHit ?? false,
    });

    // Update state
    this.state.totalClosedPercent += (closedQuantity / this.currentQuantity) * 100;
    this.state.realizedPnl += realizedPnl;
    this.currentQuantity -= closedQuantity;

    // Activate trailing if configured
    if (config?.trailingAfterHit) {
      this.activateTrailing(hitPrice);
    }
  }

  /**
   * Activate trailing stop
   */
  private activateTrailing(activationPrice: number): void {
    this.trailingActive = true;
    this.highestPriceSinceTP = activationPrice;
    
    // Find the trailing distance from config
    const config = this.findConfigWithTrailing();
    const trailingDistance = config?.trailingDistance ?? 2; // Default 2%
    
    this.trailingStopPrice = activationPrice * (1 - trailingDistance / 100);
  }

  /**
   * Check trailing stop
   */
  private checkTrailingStop(currentPrice: number, direction: "LONG" | "SHORT"): TPCheckResult | null {
    // Update highest price
    if (direction === "LONG" && currentPrice > this.highestPriceSinceTP) {
      this.highestPriceSinceTP = currentPrice;
      
      // Update trailing stop
      const config = this.findConfigWithTrailing();
      const trailingDistance = config?.trailingDistance ?? 2;
      const newTrailingStop = currentPrice * (1 - trailingDistance / 100);
      
      if (newTrailingStop > (this.trailingStopPrice ?? 0)) {
        this.trailingStopPrice = newTrailingStop;
      }
    }

    // Check if hit trailing stop
    if (this.trailingStopPrice && currentPrice <= this.trailingStopPrice) {
      return {
        shouldClose: true,
        level: this.currentLevel,
        closePercent: 100 - this.state.totalClosedPercent, // Close all remaining
        closeQuantity: this.currentQuantity,
        tpPrice: this.trailingStopPrice,
        currentProfit: ((currentPrice - this.avgEntryPrice) / this.avgEntryPrice) * 100,
        trailingEnabled: true,
        reason: `Trailing stop hit at ${this.trailingStopPrice.toFixed(2)}`,
      };
    }

    return null;
  }

  /**
   * Find config that enabled trailing
   */
  private findConfigWithTrailing(): LevelTakeProfit | undefined {
    for (const [key, hit] of this.state.hitLevels) {
      if (hit.trailingActivated) {
        const [level, tpPercent] = key.split('_').map(Number);
        return this.config.find(c => c.dcaLevel === level && c.tpPercent === tpPercent);
      }
    }
    return undefined;
  }

  /**
   * Calculate close quantity for a config
   */
  calculateCloseQuantity(config: LevelTakeProfit, totalQuantity: number): number {
    const remainingPercent = 100 - this.state.totalClosedPercent;
    const actualClosePercent = Math.min(config.closePercent, remainingPercent);
    return totalQuantity * (actualClosePercent / 100);
  }

  /**
   * Check if should enable trailing
   */
  shouldEnableTrailing(): boolean {
    for (const hit of this.state.hitLevels.values()) {
      if (hit.trailingActivated) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get next TP target
   */
  getNextTPTarget(): { tpPercent: number; closePercent: number; level: number } | null {
    const applicableConfigs = this.findApplicableConfigs();

    for (const config of applicableConfigs) {
      const hitKey = `${config.dcaLevel}_${config.tpPercent}`;
      if (!this.state.hitLevels.has(hitKey)) {
        return {
          tpPercent: config.tpPercent,
          closePercent: config.closePercent,
          level: config.dcaLevel,
        };
      }
    }

    return null;
  }

  /**
   * Get all remaining TP targets
   */
  getRemainingTPTargets(): Array<{ tpPercent: number; closePercent: number; level: number }> {
    const targets: Array<{ tpPercent: number; closePercent: number; level: number }> = [];
    const applicableConfigs = this.findApplicableConfigs();

    for (const config of applicableConfigs) {
      const hitKey = `${config.dcaLevel}_${config.tpPercent}`;
      if (!this.state.hitLevels.has(hitKey)) {
        targets.push({
          tpPercent: config.tpPercent,
          closePercent: config.closePercent,
          level: config.dcaLevel,
        });
      }
    }

    return targets;
  }

  /**
   * Get state
   */
  getState(): LevelTPState {
    return {
      ...this.state,
      hitLevels: new Map(this.state.hitLevels),
    };
  }

  /**
   * Get trailing info
   */
  getTrailingInfo(): {
    active: boolean;
    stopPrice: number | null;
    highestPrice: number;
  } {
    return {
      active: this.trailingActive,
      stopPrice: this.trailingStopPrice,
      highestPrice: this.highestPriceSinceTP,
    };
  }

  /**
   * Get total realized PnL
   */
  getRealizedPnl(): number {
    return this.state.realizedPnl;
  }

  /**
   * Get remaining position percent
   */
  getRemainingPercent(): number {
    return 100 - this.state.totalClosedPercent;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      config: [...this.config],
      hitLevels: new Map(),
      lastPrice: 0,
      totalClosedPercent: 0,
      realizedPnl: 0,
    };
    this.currentLevel = 0;
    this.avgEntryPrice = 0;
    this.currentQuantity = 0;
    this.trailingStopPrice = null;
    this.trailingActive = false;
    this.highestPriceSinceTP = 0;
  }

  /**
   * Update config
   */
  updateConfig(config: LevelTakeProfit[]): void {
    this.config = config.sort((a, b) => {
      if (a.dcaLevel !== b.dcaLevel) return a.dcaLevel - b.dcaLevel;
      return a.tpPercent - b.tpPercent;
    });
    this.state.config = [...this.config];
  }
}

// ==================== ENHANCED TRAILING STOP ====================

export interface TrailingStopConfig {
  enabled: boolean;
  activationPercent: number;      // Profit % to activate trailing
  distance: number;               // Trailing distance %
  step: number;                   // Step size for trailing updates
  maxSteps: number;               // Maximum trailing steps
  tightenOnProfit: boolean;       // Tighten distance as profit increases
  profitThresholds: Array<{ profit: number; newDistance: number }>;
}

export const DEFAULT_TRAILING_CONFIG: TrailingStopConfig = {
  enabled: true,
  activationPercent: 3,
  distance: 2,
  step: 0.5,
  maxSteps: 10,
  tightenOnProfit: true,
  profitThresholds: [
    { profit: 5, newDistance: 1.5 },
    { profit: 10, newDistance: 1 },
    { profit: 15, newDistance: 0.5 },
  ],
};

export class EnhancedTrailingStop {
  private config: TrailingStopConfig;
  private activated: boolean = false;
  private stopPrice: number | null = null;
  private highestPrice: number = 0;
  private currentStep: number = 0;
  private activationPrice: number = 0;

  constructor(config: Partial<TrailingStopConfig> = {}) {
    this.config = { ...DEFAULT_TRAILING_CONFIG, ...config };
  }

  /**
   * Update trailing stop with new price
   */
  update(
    currentPrice: number,
    avgEntryPrice: number,
    direction: "LONG" | "SHORT"
  ): {
    activated: boolean;
    updated: boolean;
    hit: boolean;
    stopPrice: number | null;
    distance: number;
  } {
    const profitPercent = direction === "LONG"
      ? ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100
      : ((avgEntryPrice - currentPrice) / avgEntryPrice) * 100;

    // Check activation
    if (!this.activated && profitPercent >= this.config.activationPercent) {
      this.activated = true;
      this.activationPrice = currentPrice;
      this.highestPrice = currentPrice;
      const distance = this.getCurrentDistance(profitPercent);
      this.stopPrice = direction === "LONG"
        ? currentPrice * (1 - distance / 100)
        : currentPrice * (1 + distance / 100);
      this.currentStep = 1;

      return {
        activated: true,
        updated: true,
        hit: false,
        stopPrice: this.stopPrice,
        distance,
      };
    }

    if (!this.activated) {
      return {
        activated: false,
        updated: false,
        hit: false,
        stopPrice: null,
        distance: this.config.distance,
      };
    }

    // Update highest price and trailing stop
    let updated = false;
    if (direction === "LONG" && currentPrice > this.highestPrice) {
      this.highestPrice = currentPrice;
      const distance = this.getCurrentDistance(profitPercent);
      const newStopPrice = currentPrice * (1 - distance / 100);

      if (newStopPrice > (this.stopPrice ?? 0)) {
        this.stopPrice = newStopPrice;
        this.currentStep++;
        updated = true;
      }
    } else if (direction === "SHORT" && currentPrice < this.highestPrice) {
      this.highestPrice = currentPrice;
      const distance = this.getCurrentDistance(profitPercent);
      const newStopPrice = currentPrice * (1 + distance / 100);

      if (newStopPrice < (this.stopPrice ?? Infinity)) {
        this.stopPrice = newStopPrice;
        this.currentStep++;
        updated = true;
      }
    }

    // Check if hit
    const hit = direction === "LONG"
      ? currentPrice <= (this.stopPrice ?? 0)
      : currentPrice >= (this.stopPrice ?? Infinity);

    return {
      activated: true,
      updated,
      hit,
      stopPrice: this.stopPrice,
      distance: this.getCurrentDistance(profitPercent),
    };
  }

  /**
   * Get current distance based on profit thresholds
   */
  private getCurrentDistance(profitPercent: number): number {
    if (!this.config.tightenOnProfit) {
      return this.config.distance;
    }

    let distance = this.config.distance;
    for (const threshold of this.config.profitThresholds) {
      if (profitPercent >= threshold.profit) {
        distance = threshold.newDistance;
      }
    }
    return distance;
  }

  /**
   * Get state
   */
  getState(): {
    activated: boolean;
    stopPrice: number | null;
    highestPrice: number;
    currentStep: number;
    activationPrice: number;
  } {
    return {
      activated: this.activated,
      stopPrice: this.stopPrice,
      highestPrice: this.highestPrice,
      currentStep: this.currentStep,
      activationPrice: this.activationPrice,
    };
  }

  /**
   * Reset
   */
  reset(): void {
    this.activated = false;
    this.stopPrice = null;
    this.highestPrice = 0;
    this.currentStep = 0;
    this.activationPrice = 0;
  }
}

// ==================== HELPER FUNCTIONS ====================

export function createLevelTPManager(): LevelTPManager {
  return new LevelTPManager();
}

export function createEnhancedTrailingStop(config: Partial<TrailingStopConfig> = {}): EnhancedTrailingStop {
  return new EnhancedTrailingStop(config);
}

/**
 * Calculate optimal TP levels based on DCA depth
 */
export function calculateOptimalTPLevels(
  maxDcaLevel: number,
  avgRangePercent: number,
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
): LevelTakeProfit[] {
  const levels: LevelTakeProfit[] = [];
  
  const baseTP = riskTolerance === 'CONSERVATIVE' ? 2 : 
                 riskTolerance === 'MODERATE' ? 3 : 4;
  const incrementTP = avgRangePercent * 0.5;

  for (let level = 0; level <= maxDcaLevel; level++) {
    // First TP level - early profit taking
    levels.push({
      dcaLevel: level,
      tpPercent: baseTP + (level * incrementTP * 0.5),
      closePercent: 25 + (level * 5),
      trailingAfterHit: false,
    });

    // Second TP level - main profit target
    levels.push({
      dcaLevel: level,
      tpPercent: (baseTP * 2) + (level * incrementTP),
      closePercent: 30 + (level * 5),
      trailingAfterHit: level >= 2,
      trailingDistance: baseTP + level,
    });
  }

  return levels;
}
