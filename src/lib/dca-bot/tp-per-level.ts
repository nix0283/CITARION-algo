/**
 * DCA Bot Take Profit Per Level
 * 
 * Закрытие части позиции на каждом DCA уровне.
 */

// ==================== TYPES ====================

export interface LevelTakeProfit {
  dcaLevel: number;         // DCA level (0 = initial, 1-N = DCA levels)
  tpPercent: number;        // Take profit percentage from avg entry
  closePercent: number;     // Percentage of position to close
  trailingAfterHit: boolean; // Enable trailing after TP hit
}

export interface LevelTPState {
  config: LevelTakeProfit[];
  hitLevels: Set<number>;
  lastPrice: number;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_LEVEL_TP_CONFIG: LevelTakeProfit[] = [
  { dcaLevel: 0, tpPercent: 5, closePercent: 20, trailingAfterHit: false },
  { dcaLevel: 1, tpPercent: 7, closePercent: 20, trailingAfterHit: false },
  { dcaLevel: 2, tpPercent: 10, closePercent: 30, trailingAfterHit: false },
  { dcaLevel: 3, tpPercent: 15, closePercent: 30, trailingAfterHit: true },
  { dcaLevel: 4, tpPercent: 20, closePercent: 50, trailingAfterHit: true },
  { dcaLevel: 5, tpPercent: 30, closePercent: 100, trailingAfterHit: true },
];

// ==================== LEVEL TP MANAGER ====================

export class LevelTPManager {
  private config: LevelTakeProfit[];
  private state: LevelTPState;
  private currentLevel: number;
  private avgEntryPrice: number;

  constructor(config: LevelTakeProfit[] = DEFAULT_LEVEL_TP_CONFIG) {
    this.config = config;
    this.state = {
      config: [...config],
      hitLevels: new Set(),
      lastPrice: 0,
    };
    this.currentLevel = 0;
    this.avgEntryPrice = 0;
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
   * Check if TP should be triggered
   */
  checkTP(
    currentPrice: number,
    direction: "LONG" | "SHORT"
  ): { hit: boolean; config: LevelTakeProfit | null } {
    this.state.lastPrice = currentPrice;

    const applicableConfig = this.findApplicableConfig();
    if (!applicableConfig) {
      return { hit: false, config: null };
    }

    if (this.state.hitLevels.has(applicableConfig.dcaLevel)) {
      return { hit: false, config: null };
    }

    const profitPercent = direction === "LONG"
      ? ((currentPrice - this.avgEntryPrice) / this.avgEntryPrice) * 100
      : ((this.avgEntryPrice - currentPrice) / this.avgEntryPrice) * 100;

    if (profitPercent >= applicableConfig.tpPercent) {
      this.state.hitLevels.add(applicableConfig.dcaLevel);
      return { hit: true, config: applicableConfig };
    }

    return { hit: false, config: null };
  }

  /**
   * Find applicable TP config for current level
   */
  private findApplicableConfig(): LevelTakeProfit | null {
    let applicable: LevelTakeProfit | null = null;

    for (const config of this.config) {
      if (config.dcaLevel <= this.currentLevel) {
        if (!applicable || config.dcaLevel > applicable.dcaLevel) {
          applicable = config;
        }
      }
    }

    return applicable;
  }

  /**
   * Calculate close quantity
   */
  calculateCloseQuantity(config: LevelTakeProfit, totalQuantity: number): number {
    return totalQuantity * (config.closePercent / 100);
  }

  /**
   * Check if should enable trailing
   */
  shouldEnableTrailing(): boolean {
    for (const config of this.config) {
      if (this.state.hitLevels.has(config.dcaLevel) && config.trailingAfterHit) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get next TP target
   */
  getNextTPTarget(): { tpPercent: number; closePercent: number } | null {
    const applicableConfig = this.findApplicableConfig();
    if (!applicableConfig) return null;

    if (this.state.hitLevels.has(applicableConfig.dcaLevel)) {
      const nextConfig = this.config.find(
        c => c.dcaLevel > applicableConfig!.dcaLevel && c.dcaLevel <= this.currentLevel
      );
      return nextConfig ? { tpPercent: nextConfig.tpPercent, closePercent: nextConfig.closePercent } : null;
    }

    return { tpPercent: applicableConfig.tpPercent, closePercent: applicableConfig.closePercent };
  }

  /**
   * Get state
   */
  getState(): LevelTPState {
    return {
      ...this.state,
      hitLevels: new Set(this.state.hitLevels),
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      config: [...this.config],
      hitLevels: new Set(),
      lastPrice: 0,
    };
    this.currentLevel = 0;
    this.avgEntryPrice = 0;
  }

  /**
   * Update config
   */
  updateConfig(config: LevelTakeProfit[]): void {
    this.config = config;
    this.state.config = [...config];
  }
}

export function createLevelTPManager(): LevelTPManager {
  return new LevelTPManager();
}
