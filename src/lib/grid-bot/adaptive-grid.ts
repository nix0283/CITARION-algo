/**
 * Adaptive Grid Bot - Production Ready
 * 
 * Dynamic grid adaptation based on market volatility:
 * - ATR-based volatility calculation
 * - Dynamic grid range adjustment
 * - Automatic level count optimization
 * - Grid reconfiguration triggers
 * - Integration with risk management
 */

import { EventEmitter } from 'events';
import {
  AdaptiveGridConfig,
  AdaptiveGridState,
  VolatilityRecord,
  GridLevel,
  GridLevelAdjustment,
} from './types';

// ==================== CANDLE INTERFACE ====================

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timestamp?: Date;
}

// ==================== VOLATILITY METRICS ====================

export interface VolatilityMetrics {
  /** Average True Range */
  atr: number;
  /** ATR as percentage of price */
  atrPercent: number;
  /** Bollinger Band width */
  bollingerWidth: number;
  /** Historical volatility (annualized %) */
  historicalVolatility: number;
  /** Volatility regime */
  regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
}

// ==================== GRID ADJUSTMENT ====================

export interface GridAdjustment {
  newGridCount: number;
  newUpperPrice: number;
  newLowerPrice: number;
  newLevelPrices: number[];
  reason: string;
  volatilityChange: number;
}

// ==================== GRID CONFIG ====================

export interface GridConfig {
  gridCount: number;
  upperPrice: number;
  lowerPrice: number;
  gridType: 'ARITHMETIC' | 'GEOMETRIC';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
}

// ==================== DEFAULTS ====================

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveGridConfig = {
  enabled: true,
  atrPeriod: 14,
  atrMultiplier: 2.5,
  minGridLevels: 5,
  maxGridLevels: 50,
  volatilityThreshold: 25, // 25% change triggers reconfiguration
  dynamicPositionSizing: true,
  reconfigureCooldown: 30, // 30 minutes
};

const VOLATILITY_REGIME_THRESHOLDS = {
  LOW: 0.02,      // < 2% ATR%
  NORMAL: 0.04,   // 2-4% ATR%
  HIGH: 0.06,     // 4-6% ATR%
  EXTREME: 0.06,  // > 6% ATR%
};

// ==================== ADAPTIVE GRID MANAGER ====================

export class AdaptiveGridManager extends EventEmitter {
  private config: AdaptiveGridConfig;
  private state: AdaptiveGridState;
  private baseConfig: GridConfig;
  private candles: Candle[] = [];
  private lastReconfigureTime: Date | null = null;
  private reconfigureCount: number = 0;
  private levelAdjustments: GridLevelAdjustment[] = [];

  constructor(
    gridConfig: GridConfig,
    adaptiveConfig: Partial<AdaptiveGridConfig> = {}
  ) {
    super();
    
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...adaptiveConfig };
    this.baseConfig = gridConfig;
    
    this.state = {
      baseATR: 0,
      currentATR: 0,
      atrPercent: 0,
      lastReconfigureTime: null,
      reconfigureCount: 0,
      volatilityHistory: [],
      currentGridRange: {
        upper: gridConfig.upperPrice,
        lower: gridConfig.lowerPrice,
      },
    };
  }

  // ==================== CANDLE MANAGEMENT ====================

  /**
   * Add new candle to history
   */
  addCandle(candle: Candle): void {
    this.candles.push(candle);
    
    // Keep only necessary candles
    const maxCandles = Math.max(this.config.atrPeriod * 3, 100);
    if (this.candles.length > maxCandles) {
      this.candles = this.candles.slice(-maxCandles);
    }
    
    this.emit('candle_added', candle);
  }

  /**
   * Update candles array
   */
  updateCandles(candles: Candle[]): void {
    this.candles = candles;
    this.emit('candles_updated', { count: candles.length });
  }

  // ==================== VOLATILITY CALCULATIONS ====================

  /**
   * Calculate ATR (Average True Range)
   */
  calculateATR(period: number = this.config.atrPeriod): number {
    if (this.candles.length < period + 1) {
      return 0;
    }

    const trueRanges: number[] = [];
    
    for (let i = 1; i < this.candles.length; i++) {
      const high = this.candles[i].high;
      const low = this.candles[i].low;
      const prevClose = this.candles[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      trueRanges.push(tr);
    }

    // Use EMA-style ATR calculation
    const recentRanges = trueRanges.slice(-period);
    return recentRanges.reduce((sum, tr) => sum + tr, 0) / recentRanges.length;
  }

  /**
   * Calculate ATR percentage
   */
  calculateATRPercent(currentPrice: number): number {
    const atr = this.calculateATR();
    return currentPrice > 0 ? atr / currentPrice : 0;
  }

  /**
   * Calculate Bollinger Band width
   */
  calculateBollingerWidth(period: number = 20, stdDev: number = 2): number {
    if (this.candles.length < period) {
      return 0;
    }

    const closes = this.candles.slice(-period).map(c => c.close);
    const sma = closes.reduce((sum, c) => sum + c, 0) / period;
    
    // Standard deviation
    const squaredDiffs = closes.map(c => Math.pow(c - sma, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / period;
    const std = Math.sqrt(variance);
    
    // Width = (Upper - Lower) / SMA * 100
    const upper = sma + stdDev * std;
    const lower = sma - stdDev * std;
    
    return sma > 0 ? ((upper - lower) / sma) * 100 : 0;
  }

  /**
   * Calculate historical volatility (annualized)
   */
  calculateHistoricalVolatility(period: number = 20): number {
    if (this.candles.length < period + 1) {
      return 0;
    }

    // Calculate log returns
    const returns: number[] = [];
    const startIdx = Math.max(0, this.candles.length - period - 1);
    
    for (let i = startIdx + 1; i < this.candles.length; i++) {
      const logReturn = Math.log(this.candles[i].close / this.candles[i - 1].close);
      returns.push(logReturn);
    }

    // Mean return
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    // Standard deviation
    const squaredDiffs = returns.map(r => Math.pow(r - meanReturn, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / returns.length;
    const std = Math.sqrt(variance);
    
    // Annualize (365 days, 24/7 for crypto)
    return std * Math.sqrt(365 * 24) * 100;
  }

  /**
   * Get comprehensive volatility metrics
   */
  getVolatilityMetrics(): VolatilityMetrics {
    const currentPrice = this.candles.length > 0 
      ? this.candles[this.candles.length - 1].close 
      : (this.baseConfig.upperPrice + this.baseConfig.lowerPrice) / 2;
    
    const atr = this.calculateATR();
    const atrPercent = this.calculateATRPercent(currentPrice);
    const bollingerWidth = this.calculateBollingerWidth();
    const historicalVolatility = this.calculateHistoricalVolatility();
    
    // Determine regime
    let regime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
    if (atrPercent < VOLATILITY_REGIME_THRESHOLDS.LOW) {
      regime = 'LOW';
    } else if (atrPercent < VOLATILITY_REGIME_THRESHOLDS.NORMAL) {
      regime = 'NORMAL';
    } else if (atrPercent < VOLATILITY_REGIME_THRESHOLDS.HIGH) {
      regime = 'HIGH';
    } else {
      regime = 'EXTREME';
    }
    
    return {
      atr,
      atrPercent,
      bollingerWidth,
      historicalVolatility,
      regime,
    };
  }

  // ==================== GRID RECONFIGURATION ====================

  /**
   * Calculate optimal grid parameters based on volatility
   */
  calculateOptimalGrid(currentPrice: number): {
    gridCount: number;
    upperPrice: number;
    lowerPrice: number;
  } {
    const volatility = this.getVolatilityMetrics();
    
    // Calculate grid range based on ATR
    const atrRange = volatility.atr * this.config.atrMultiplier;
    
    // Grid range is ATR multiplier above and below current price
    const halfRange = atrRange;
    let upperPrice = currentPrice + halfRange;
    let lowerPrice = currentPrice - halfRange;
    
    // Ensure minimum range
    const minRange = currentPrice * 0.02; // 2% minimum
    if (upperPrice - lowerPrice < minRange) {
      upperPrice = currentPrice + minRange / 2;
      lowerPrice = currentPrice - minRange / 2;
    }
    
    // Calculate optimal grid count based on volatility
    // Higher volatility = more levels to capture moves
    // Lower volatility = fewer levels to reduce fees
    let gridCount = this.baseConfig.gridCount;
    
    switch (volatility.regime) {
      case 'LOW':
        gridCount = Math.max(this.config.minGridLevels, Math.floor(gridCount * 0.7));
        break;
      case 'NORMAL':
        // Keep base count
        break;
      case 'HIGH':
        gridCount = Math.min(this.config.maxGridLevels, Math.floor(gridCount * 1.3));
        break;
      case 'EXTREME':
        gridCount = Math.min(this.config.maxGridLevels, Math.floor(gridCount * 1.5));
        break;
    }
    
    return { gridCount, upperPrice, lowerPrice };
  }

  /**
   * Check if reconfiguration is needed
   */
  needsReconfiguration(currentPrice: number): {
    needed: boolean;
    reason: string;
  } {
    if (!this.config.enabled) {
      return { needed: false, reason: 'Adaptive grid disabled' };
    }

    // Check cooldown
    if (this.lastReconfigureTime) {
      const minutesSinceReconfigure = 
        (Date.now() - this.lastReconfigureTime.getTime()) / 60000;
      
      if (minutesSinceReconfigure < this.config.reconfigureCooldown) {
        return { needed: false, reason: 'Cooldown period active' };
      }
    }

    // Check volatility change
    if (this.state.baseATR > 0) {
      const currentATR = this.calculateATR();
      const volatilityChange = Math.abs(currentATR - this.state.baseATR) / this.state.baseATR * 100;
      
      if (volatilityChange >= this.config.volatilityThreshold) {
        return {
          needed: true,
          reason: `Volatility changed ${volatilityChange.toFixed(1)}% (threshold: ${this.config.volatilityThreshold}%)`,
        };
      }
    }

    // Check if price is outside grid range
    const { upper, lower } = this.state.currentGridRange;
    const rangeBuffer = (upper - lower) * 0.1; // 10% buffer
    
    if (currentPrice > upper + rangeBuffer) {
      return { needed: true, reason: 'Price exceeded upper grid boundary' };
    }
    
    if (currentPrice < lower - rangeBuffer) {
      return { needed: true, reason: 'Price fell below lower grid boundary' };
    }

    return { needed: false, reason: 'No reconfiguration needed' };
  }

  /**
   * Execute grid reconfiguration
   */
  reconfigureGrid(currentPrice: number): GridAdjustment | null {
    const check = this.needsReconfiguration(currentPrice);
    
    if (!check.needed) {
      return null;
    }

    const optimal = this.calculateOptimalGrid(currentPrice);
    const volatility = this.getVolatilityMetrics();
    
    // Calculate new level prices
    const newLevelPrices = this.generateLevelPrices(
      optimal.lowerPrice,
      optimal.upperPrice,
      optimal.gridCount
    );
    
    // Update state
    const previousATR = this.state.currentATR;
    this.state.currentATR = volatility.atr;
    this.state.atrPercent = volatility.atrPercent;
    
    if (this.state.baseATR === 0) {
      this.state.baseATR = volatility.atr;
    }
    
    this.state.currentGridRange = {
      upper: optimal.upperPrice,
      lower: optimal.lowerPrice,
    };
    
    this.lastReconfigureTime = new Date();
    this.reconfigureCount++;
    this.state.reconfigureCount = this.reconfigureCount;
    this.state.lastReconfigureTime = this.lastReconfigureTime;
    
    // Record volatility
    this.state.volatilityHistory.push({
      timestamp: new Date(),
      atr: volatility.atr,
      atrPercent: volatility.atrPercent,
      historicalVolatility: volatility.historicalVolatility,
      gridLevels: optimal.gridCount,
    });
    
    const adjustment: GridAdjustment = {
      newGridCount: optimal.gridCount,
      newUpperPrice: optimal.upperPrice,
      newLowerPrice: optimal.lowerPrice,
      newLevelPrices,
      reason: check.reason,
      volatilityChange: previousATR > 0 
        ? ((volatility.atr - previousATR) / previousATR) * 100 
        : 0,
    };
    
    this.emit('grid_reconfigured', adjustment);
    
    return adjustment;
  }

  /**
   * Generate level prices
   */
  private generateLevelPrices(
    lowerPrice: number,
    upperPrice: number,
    gridCount: number
  ): number[] {
    const prices: number[] = [];
    
    if (this.baseConfig.gridType === 'ARITHMETIC') {
      const step = (upperPrice - lowerPrice) / (gridCount - 1);
      for (let i = 0; i < gridCount; i++) {
        prices.push(lowerPrice + step * i);
      }
    } else {
      // Geometric
      const ratio = Math.pow(upperPrice / lowerPrice, 1 / (gridCount - 1));
      for (let i = 0; i < gridCount; i++) {
        prices.push(lowerPrice * Math.pow(ratio, i));
      }
    }
    
    return prices;
  }

  // ==================== LEVEL MANAGEMENT ====================

  /**
   * Calculate levels to add at boundary
   */
  calculateLevelsToAdd(
    currentPrice: number,
    currentLevels: GridLevel[],
    maxToAdd: number = 3
  ): GridLevel[] {
    const sortedPrices = currentLevels.map(l => l.price).sort((a, b) => a - b);
    const upperBoundary = sortedPrices[sortedPrices.length - 1];
    const lowerBoundary = sortedPrices[0];
    const avgSpacing = (upperBoundary - lowerBoundary) / (sortedPrices.length - 1);
    
    const levelsToAdd: GridLevel[] = [];
    
    // Check if approaching upper boundary
    if (upperBoundary - currentPrice < avgSpacing * 2) {
      for (let i = 1; i <= maxToAdd; i++) {
        levelsToAdd.push({
          index: currentLevels.length + i,
          price: upperBoundary + avgSpacing * i,
          quantity: 0,
          filled: false,
        });
      }
    }
    
    // Check if approaching lower boundary
    if (currentPrice - lowerBoundary < avgSpacing * 2) {
      for (let i = 1; i <= maxToAdd; i++) {
        levelsToAdd.push({
          index: -(currentLevels.length + i),
          price: lowerBoundary - avgSpacing * i,
          quantity: 0,
          filled: false,
        });
      }
    }
    
    return levelsToAdd;
  }

  /**
   * Calculate levels to remove (distant from price)
   */
  calculateLevelsToRemove(
    currentPrice: number,
    currentLevels: GridLevel[],
    distanceThresholdPercent: number = 15
  ): number[] {
    const indicesToRemove: number[] = [];
    
    for (const level of currentLevels) {
      if (level.filled) continue; // Don't remove filled levels
      
      const distancePercent = Math.abs(level.price - currentPrice) / currentPrice * 100;
      
      if (distancePercent > distanceThresholdPercent) {
        indicesToRemove.push(level.index);
      }
    }
    
    return indicesToRemove;
  }

  /**
   * Record level adjustment
   */
  recordLevelAdjustment(adjustment: GridLevelAdjustment): void {
    this.levelAdjustments.push(adjustment);
    this.emit('level_adjusted', adjustment);
  }

  // ==================== POSITION SIZING ====================

  /**
   * Calculate dynamic position size based on volatility
   */
  calculateDynamicPositionSize(
    basePositionSize: number,
    currentPrice: number
  ): number {
    if (!this.config.dynamicPositionSizing) {
      return basePositionSize;
    }
    
    const volatility = this.getVolatilityMetrics();
    
    // Adjust position size inversely to volatility
    // Higher volatility = smaller position
    // Lower volatility = larger position (up to base size)
    let multiplier = 1;
    
    switch (volatility.regime) {
      case 'LOW':
        multiplier = 1.0; // Full size in low volatility
        break;
      case 'NORMAL':
        multiplier = 1.0;
        break;
      case 'HIGH':
        multiplier = 0.7; // Reduce by 30%
        break;
      case 'EXTREME':
        multiplier = 0.5; // Reduce by 50%
        break;
    }
    
    return basePositionSize * multiplier;
  }

  // ==================== STATE MANAGEMENT ====================

  /**
   * Get current state
   */
  getState(): AdaptiveGridState {
    return { ...this.state };
  }

  /**
   * Get base configuration
   */
  getBaseConfig(): GridConfig {
    return { ...this.baseConfig };
  }

  /**
   * Get adaptive configuration
   */
  getAdaptiveConfig(): AdaptiveGridConfig {
    return { ...this.config };
  }

  /**
   * Get reconfigure count
   */
  getReconfigureCount(): number {
    return this.reconfigureCount;
  }

  /**
   * Get level adjustments history
   */
  getLevelAdjustments(): GridLevelAdjustment[] {
    return [...this.levelAdjustments];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AdaptiveGridConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      baseATR: 0,
      currentATR: 0,
      atrPercent: 0,
      lastReconfigureTime: null,
      reconfigureCount: 0,
      volatilityHistory: [],
      currentGridRange: {
        upper: this.baseConfig.upperPrice,
        lower: this.baseConfig.lowerPrice,
      },
    };
    
    this.candles = [];
    this.lastReconfigureTime = null;
    this.reconfigureCount = 0;
    this.levelAdjustments = [];
    
    this.emit('reset', {});
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create adaptive grid manager
 */
export function createAdaptiveGridManager(
  config: GridConfig,
  options: Partial<AdaptiveGridConfig> = {}
): AdaptiveGridManager {
  return new AdaptiveGridManager(config, options);
}

/**
 * Calculate volatility regime from ATR percent
 */
export function getVolatilityRegime(atrPercent: number): 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' {
  if (atrPercent < VOLATILITY_REGIME_THRESHOLDS.LOW) {
    return 'LOW';
  } else if (atrPercent < VOLATILITY_REGIME_THRESHOLDS.NORMAL) {
    return 'NORMAL';
  } else if (atrPercent < VOLATILITY_REGIME_THRESHOLDS.HIGH) {
    return 'HIGH';
  } else {
    return 'EXTREME';
  }
}

/**
 * Suggest grid parameters based on market conditions
 */
export function suggestGridParameters(
  currentPrice: number,
  volatility: VolatilityMetrics,
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
): {
  suggestedLevels: number;
  suggestedRange: { upper: number; lower: number };
  suggestedSpacing: number;
} {
  // Base calculations
  const atrRange = volatility.atr * 2;
  
  // Adjust for risk tolerance
  const riskMultiplier = {
    LOW: 0.7,
    MEDIUM: 1.0,
    HIGH: 1.5,
  };
  
  const adjustedRange = atrRange * riskMultiplier[riskTolerance];
  
  // Suggest levels based on volatility
  let suggestedLevels: number;
  switch (volatility.regime) {
    case 'LOW':
      suggestedLevels = 10;
      break;
    case 'NORMAL':
      suggestedLevels = 15;
      break;
    case 'HIGH':
      suggestedLevels = 20;
      break;
    case 'EXTREME':
      suggestedLevels = 25;
      break;
  }
  
  const suggestedRange = {
    upper: currentPrice + adjustedRange / 2,
    lower: currentPrice - adjustedRange / 2,
  };
  
  const suggestedSpacing = adjustedRange / suggestedLevels;
  
  return {
    suggestedLevels,
    suggestedRange,
    suggestedSpacing,
  };
}

// ==================== EXPORT DEFAULT ====================

export default AdaptiveGridManager;
