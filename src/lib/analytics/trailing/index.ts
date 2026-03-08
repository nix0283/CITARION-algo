/**
 * Advanced Trailing Stop System
 *
 * Sophisticated exit management:
 * - Multi-level trailing take profit
 * - Dynamic trailing stop (volatility-adjusted)
 * - Time-based trailing
 * - ATR-based trailing
 *
 * @module lib/analytics/trailing
 */

// ==================== TYPES ====================

export interface TrailingTakeProfit {
  levels: Array<{
    id: string;
    percent: number;
    trigger: number;
    trailingType: 'PERCENT' | 'ATR' | 'HIGH_LOW';
    trailingDistance: number;
    triggered: boolean;
    executed: boolean;
    executionPrice?: number;
  }>;
}

export interface DynamicTrailingStop {
  type: 'AGGRESSIVE' | 'MODERATE' | 'CONSERVATIVE';
  breakevenTrigger: number;
  stepPercent: number;
  minDistance: number;
  maxDistance: number;
  volatilityAdjustment: boolean;
  currentStopPrice: number;
  highestPrice: number;
  activated: boolean;
}

export interface TimeTrailingStop {
  enableAfterMinutes: number;
  initialStopPercent: number;
  finalStopPercent: number;
  decayType: 'LINEAR' | 'EXPONENTIAL';
  startTime: Date;
  currentStopPercent: number;
}

export interface TrailingConfig {
  takeProfit?: TrailingTakeProfit;
  stopLoss?: DynamicTrailingStop;
  timeStop?: TimeTrailingStop;
}

export interface TrailingState {
  positionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  highestPrice: number;
  lowestPrice: number;
  config: TrailingConfig;
  atr: number;
  lastUpdate: Date;
}

// ==================== PRESET CONFIGS ====================

export const TRAILING_PRESETS = {
  SCALPING: {
    stopLoss: {
      type: 'AGGRESSIVE' as const,
      breakevenTrigger: 0.3,
      stepPercent: 0.3,
      minDistance: 0.3,
      maxDistance: 1,
      volatilityAdjustment: true,
      currentStopPrice: 0,
      highestPrice: 0,
      activated: false,
    },
    takeProfit: {
      levels: [
        { id: 'tp1', percent: 50, trigger: 0.5, trailingType: 'PERCENT' as const, trailingDistance: 0.3, triggered: false, executed: false },
        { id: 'tp2', percent: 50, trigger: 1, trailingType: 'PERCENT' as const, trailingDistance: 0.5, triggered: false, executed: false },
      ],
    },
  },

  DAY_TRADING: {
    stopLoss: {
      type: 'MODERATE' as const,
      breakevenTrigger: 1,
      stepPercent: 0.5,
      minDistance: 1,
      maxDistance: 3,
      volatilityAdjustment: true,
      currentStopPrice: 0,
      highestPrice: 0,
      activated: false,
    },
    takeProfit: {
      levels: [
        { id: 'tp1', percent: 30, trigger: 2, trailingType: 'ATR' as const, trailingDistance: 1.5, triggered: false, executed: false },
        { id: 'tp2', percent: 30, trigger: 4, trailingType: 'ATR' as const, trailingDistance: 2, triggered: false, executed: false },
        { id: 'tp3', percent: 40, trigger: 6, trailingType: 'ATR' as const, trailingDistance: 3, triggered: false, executed: false },
      ],
    },
  },

  SWING_TRADING: {
    stopLoss: {
      type: 'CONSERVATIVE' as const,
      breakevenTrigger: 2,
      stepPercent: 1,
      minDistance: 2,
      maxDistance: 5,
      volatilityAdjustment: true,
      currentStopPrice: 0,
      highestPrice: 0,
      activated: false,
    },
    takeProfit: {
      levels: [
        { id: 'tp1', percent: 25, trigger: 5, trailingType: 'PERCENT' as const, trailingDistance: 2, triggered: false, executed: false },
        { id: 'tp2', percent: 25, trigger: 10, trailingType: 'PERCENT' as const, trailingDistance: 3, triggered: false, executed: false },
        { id: 'tp3', percent: 50, trigger: 15, trailingType: 'HIGH_LOW' as const, trailingDistance: 5, triggered: false, executed: false },
      ],
    },
  },
};

// ==================== ADVANCED TRAILING MANAGER ====================

export class AdvancedTrailingManager {
  private activePositions: Map<string, TrailingState> = new Map();

  /**
   * Initialize trailing for a position
   */
  initializePosition(
    positionId: string,
    symbol: string,
    direction: 'LONG' | 'SHORT',
    entryPrice: number,
    config: TrailingConfig,
    atr: number
  ): void {
    const state: TrailingState = {
      positionId,
      symbol,
      direction,
      entryPrice,
      currentPrice: entryPrice,
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      config,
      atr,
      lastUpdate: new Date(),
    };

    this.activePositions.set(positionId, state);
  }

  /**
   * Update trailing on price change
   */
  updatePosition(
    positionId: string,
    currentPrice: number,
    atr?: number
  ): {
    stopUpdated: boolean;
    newStopPrice?: number;
    takeProfitExecuted: boolean;
    shouldClose: boolean;
  } {
    const state = this.activePositions.get(positionId);
    if (!state) {
      return { stopUpdated: false, takeProfitExecuted: false, shouldClose: false };
    }

    state.currentPrice = currentPrice;
    state.lastUpdate = new Date();

    if (atr) state.atr = atr;

    // Update extremes
    if (state.direction === 'LONG') {
      if (currentPrice > state.highestPrice) {
        state.highestPrice = currentPrice;
      }
    } else {
      if (currentPrice < state.lowestPrice) {
        state.lowestPrice = currentPrice;
      }
    }

    let stopUpdated = false;
    let newStopPrice: number | undefined;
    let takeProfitExecuted = false;
    let shouldClose = false;

    // Update dynamic trailing stop
    if (state.config.stopLoss) {
      const stopResult = this.updateDynamicStop(state);
      if (stopResult.updated) {
        stopUpdated = true;
        newStopPrice = stopResult.newStopPrice;
        if (stopResult.shouldClose) shouldClose = true;
      }
    }

    // Check take profit levels
    if (state.config.takeProfit) {
      const tpResult = this.checkTakeProfitLevels(state);
      takeProfitExecuted = tpResult.executed;
    }

    // Update time-based stop
    if (state.config.timeStop) {
      this.updateTimeStop(state);
    }

    return { stopUpdated, newStopPrice, takeProfitExecuted, shouldClose };
  }

  /**
   * Update dynamic trailing stop
   */
  private updateDynamicStop(
    state: TrailingState
  ): { updated: boolean; newStopPrice?: number; shouldClose: boolean } {
    const config = state.config.stopLoss!;

    // Calculate current profit
    const profitPercent = state.direction === 'LONG'
      ? (state.currentPrice - state.entryPrice) / state.entryPrice
      : (state.entryPrice - state.currentPrice) / state.entryPrice;

    // Activate breakeven
    if (!config.activated && profitPercent >= config.breakevenTrigger / 100) {
      config.activated = true;
      config.currentStopPrice = state.entryPrice;
      config.highestPrice = state.currentPrice;
      return { updated: true, newStopPrice: state.entryPrice, shouldClose: false };
    }

    if (!config.activated) {
      return { updated: false };
    }

    // Calculate trailing distance
    let distance = config.stepPercent / 100;

    // Volatility adjustment
    if (config.volatilityAdjustment && state.atr > 0) {
      const volatilityMultiplier = Math.min(2, Math.max(0.5, state.atr / (state.entryPrice * 0.02)));
      distance *= volatilityMultiplier;
    }

    // Apply bounds
    distance = Math.max(config.minDistance / 100, Math.min(distance, config.maxDistance / 100));

    // Calculate new stop
    let newStopPrice: number;
    if (state.direction === 'LONG') {
      newStopPrice = state.highestPrice * (1 - distance);
      if (newStopPrice <= config.currentStopPrice) {
        return { updated: false };
      }
    } else {
      newStopPrice = state.lowestPrice * (1 + distance);
      if (newStopPrice >= config.currentStopPrice) {
        return { updated: false };
      }
    }

    config.currentStopPrice = newStopPrice;

    // Check if stop hit
    const stopHit = state.direction === 'LONG'
      ? state.currentPrice <= newStopPrice
      : state.currentPrice >= newStopPrice;

    return { updated: true, newStopPrice, shouldClose: stopHit };
  }

  /**
   * Check take profit levels
   */
  private checkTakeProfitLevels(state: TrailingState): { executed: boolean } {
    const config = state.config.takeProfit!;
    let executed = false;

    for (const level of config.levels) {
      if (level.executed) continue;

      // Calculate profit
      const profitPercent = state.direction === 'LONG'
        ? (state.currentPrice - state.entryPrice) / state.entryPrice * 100
        : (state.entryPrice - state.currentPrice) / state.entryPrice * 100;

      // Check trigger
      if (!level.triggered && profitPercent >= level.trigger) {
        level.triggered = true;
      }

      if (!level.triggered) continue;

      // Calculate trailing stop for this level
      let trailingStopPrice: number;
      if (level.trailingType === 'ATR') {
        trailingStopPrice = state.direction === 'LONG'
          ? state.highestPrice - state.atr * level.trailingDistance
          : state.lowestPrice + state.atr * level.trailingDistance;
      } else {
        trailingStopPrice = state.direction === 'LONG'
          ? state.highestPrice * (1 - level.trailingDistance / 100)
          : state.lowestPrice * (1 + level.trailingDistance / 100);
      }

      // Check if hit
      const hitTrailing = state.direction === 'LONG'
        ? state.currentPrice <= trailingStopPrice
        : state.currentPrice >= trailingStopPrice;

      if (hitTrailing) {
        level.executed = true;
        level.executionPrice = state.currentPrice;
        executed = true;
      }
    }

    return { executed };
  }

  /**
   * Update time-based trailing stop
   */
  private updateTimeStop(state: TrailingState): void {
    const config = state.config.timeStop!;

    const elapsedMinutes = (Date.now() - config.startTime.getTime()) / 60000;

    if (elapsedMinutes < config.enableAfterMinutes) return;

    const progress = Math.min(1, (elapsedMinutes - config.enableAfterMinutes) / 60);

    let currentStopPercent: number;
    if (config.decayType === 'LINEAR') {
      currentStopPercent = config.initialStopPercent +
        (config.finalStopPercent - config.initialStopPercent) * progress;
    } else {
      currentStopPercent = config.initialStopPercent *
        Math.pow(config.finalStopPercent / config.initialStopPercent, progress);
    }

    config.currentStopPercent = currentStopPercent;
  }

  /**
   * Check if stop loss hit
   */
  checkStopLoss(positionId: string, currentPrice: number): { hit: boolean; stopPrice?: number } {
    const state = this.activePositions.get(positionId);
    if (!state || !state.config.stopLoss) {
      return { hit: false };
    }

    const stopPrice = state.config.stopLoss.currentStopPrice;
    if (!stopPrice) return { hit: false };

    const hit = state.direction === 'LONG'
      ? currentPrice <= stopPrice
      : currentPrice >= stopPrice;

    return { hit, stopPrice };
  }

  /**
   * Remove position from tracking
   */
  removePosition(positionId: string): void {
    this.activePositions.delete(positionId);
  }

  /**
   * Get all active positions
   */
  getActivePositions(): TrailingState[] {
    return Array.from(this.activePositions.values());
  }

  /**
   * Get position state
   */
  getPositionState(positionId: string): TrailingState | undefined {
    return this.activePositions.get(positionId);
  }
}

// ==================== SINGLETON ====================

let managerInstance: AdvancedTrailingManager | null = null;

export function getAdvancedTrailingManager(): AdvancedTrailingManager {
  if (!managerInstance) {
    managerInstance = new AdvancedTrailingManager();
  }
  return managerInstance;
}

export default {
  AdvancedTrailingManager,
  getAdvancedTrailingManager,
  TRAILING_PRESETS,
};
