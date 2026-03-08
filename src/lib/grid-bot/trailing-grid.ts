/**
 * Grid Bot Trailing Grid - Production Ready
 * 
 * Full implementation of trailing grid functionality where grid levels
 * move dynamically with price movements.
 * 
 * Features:
 * - Dynamic grid center tracking
 * - Configurable trail triggers and sensitivity
 * - Preserve filled levels option
 * - Trail history tracking
 * - Integration with risk management
 */

import { EventEmitter } from 'events';
import {
  TrailingGridConfig,
  TrailingGridState,
  TrailingEvent,
  GridLevel,
} from './types';

// ==================== DEFAULTS ====================

export const DEFAULT_TRAILING_GRID_CONFIG: TrailingGridConfig = {
  enabled: false,
  trailTriggerPercent: 5,        // Trail when price moves 5% from center
  minTrailDistance: 100,         // Minimum $100 movement
  keepFilledLevels: true,        // Preserve filled levels
  maxTrailsPerSession: 20,       // Maximum 20 trails per session
  trailMode: 'FOLLOW',           // Follow price movement
  trailSensitivity: 0.5,         // Move grid 50% of price movement
};

// ==================== TRAILING GRID MANAGER ====================

export class TrailingGridManager extends EventEmitter {
  private config: TrailingGridConfig;
  private state: TrailingGridState;
  private gridLevels: GridLevel[];
  private gridWidth: number;
  private peakPrice: number;
  private valleyPrice: number;
  private sessionStartTime: Date;

  constructor(
    config: Partial<TrailingGridConfig> = {},
    initialLevels: GridLevel[] = [],
    centerPrice: number = 0
  ) {
    super();
    
    this.config = { ...DEFAULT_TRAILING_GRID_CONFIG, ...config };
    this.gridLevels = initialLevels;
    
    // Calculate grid width from levels
    if (initialLevels.length > 1) {
      const prices = initialLevels.map(l => l.price).sort((a, b) => a - b);
      this.gridWidth = prices[prices.length - 1] - prices[0];
    } else {
      this.gridWidth = 0;
    }
    
    this.state = {
      originalCenter: centerPrice,
      currentCenter: centerPrice,
      trailCount: 0,
      lastTrailTime: null,
      lastTrailDirection: null,
      totalTrailingDistance: 0,
      trailHistory: [],
    };
    
    this.peakPrice = centerPrice;
    this.valleyPrice = centerPrice;
    this.sessionStartTime = new Date();
  }

  // ==================== CORE TRAILING LOGIC ====================

  /**
   * Check if grid should trail based on current price
   */
  shouldTrail(currentPrice: number): boolean {
    if (!this.config.enabled) return false;
    if (this.state.trailCount >= this.config.maxTrailsPerSession) return false;
    if (this.gridLevels.length === 0) return false;

    // Calculate distance from center
    const distanceFromCenter = currentPrice - this.state.currentCenter;
    const distancePercent = Math.abs(distanceFromCenter) / this.state.currentCenter * 100;

    // Check minimum distance
    if (Math.abs(distanceFromCenter) < this.config.minTrailDistance) return false;

    // Check trigger percentage
    return distancePercent >= this.config.trailTriggerPercent;
  }

  /**
   * Execute grid trail
   * Returns new grid levels after trailing
   */
  executeTrail(currentPrice: number): {
    newLevels: GridLevel[];
    shift: number;
    direction: 'UP' | 'DOWN';
    event: TrailingEvent;
  } | null {
    if (!this.shouldTrail(currentPrice)) return null;

    const direction = currentPrice > this.state.currentCenter ? 'UP' : 'DOWN';
    const distance = currentPrice - this.state.currentCenter;
    
    // Calculate shift amount based on sensitivity
    const shiftAmount = distance * this.config.trailSensitivity;
    
    // Apply the shift
    const result = this.applyTrailShift(shiftAmount, direction, currentPrice);
    
    if (result) {
      this.emit('grid_trailed', {
        direction,
        shift: shiftAmount,
        newCenter: this.state.currentCenter,
        trailCount: this.state.trailCount,
      });
    }
    
    return result;
  }

  /**
   * Apply trail shift to grid levels
   */
  private applyTrailShift(
    shift: number,
    direction: 'UP' | 'DOWN',
    currentPrice: number
  ): {
    newLevels: GridLevel[];
    shift: number;
    direction: 'UP' | 'DOWN';
    event: TrailingEvent;
  } | null {
    const previousCenter = this.state.currentCenter;
    const filledLevelsCount = this.gridLevels.filter(l => l.filled).length;
    
    // Create new levels array
    const newLevels: GridLevel[] = this.gridLevels.map(level => {
      // If keepFilledLevels is true and level is filled, don't shift it
      if (this.config.keepFilledLevels && level.filled) {
        return { ...level };
      }
      
      return {
        ...level,
        price: level.price + shift,
        // Update order prices if orders exist
        buyOrder: level.buyOrder ? { ...level.buyOrder, price: level.buyOrder.price + shift } : undefined,
        sellOrder: level.sellOrder ? { ...level.sellOrder, price: level.sellOrder.price + shift } : undefined,
      };
    });

    // Update state
    const newCenter = previousCenter + shift;
    this.state.currentCenter = newCenter;
    this.state.trailCount++;
    this.state.lastTrailTime = new Date();
    this.state.lastTrailDirection = direction;
    this.state.totalTrailingDistance += Math.abs(shift);
    
    // Create trail event
    const event: TrailingEvent = {
      timestamp: new Date(),
      price: currentPrice,
      fromCenter: previousCenter,
      toCenter: newCenter,
      direction,
      levelsShifted: newLevels.length - (this.config.keepFilledLevels ? filledLevelsCount : 0),
      filledLevelsPreserved: this.config.keepFilledLevels ? filledLevelsCount : 0,
    };
    
    this.state.trailHistory.push(event);
    this.gridLevels = newLevels;
    
    // Update peak/valley tracking
    if (direction === 'UP') {
      this.peakPrice = Math.max(this.peakPrice, currentPrice);
    } else {
      this.valleyPrice = Math.min(this.valleyPrice, currentPrice);
    }

    return { newLevels, shift, direction, event };
  }

  // ==================== SMART TRAILING ====================

  /**
   * Smart trail that considers volatility and position
   */
  executeSmartTrail(
    currentPrice: number,
    volatility: number,
    positionSize: number
  ): {
    newLevels: GridLevel[];
    shift: number;
    direction: 'UP' | 'DOWN';
    event: TrailingEvent;
    reason: string;
  } | null {
    if (!this.shouldTrail(currentPrice)) return null;

    const direction = currentPrice > this.state.currentCenter ? 'UP' : 'DOWN';
    const distance = currentPrice - this.state.currentCenter;
    
    // Adjust sensitivity based on volatility
    let adjustedSensitivity = this.config.trailSensitivity;
    
    // Lower sensitivity in high volatility
    if (volatility > 0.05) { // 5% volatility
      adjustedSensitivity *= 0.7;
    }
    // Higher sensitivity in low volatility
    else if (volatility < 0.02) { // 2% volatility
      adjustedSensitivity *= 1.3;
    }
    
    // Cap sensitivity
    adjustedSensitivity = Math.min(1, Math.max(0.2, adjustedSensitivity));
    
    // Calculate shift with adjusted sensitivity
    const shiftAmount = distance * adjustedSensitivity;
    
    // Apply opposite mode if configured
    const actualDirection = this.config.trailMode === 'OPPOSITE' 
      ? (direction === 'UP' ? 'DOWN' : 'UP')
      : direction;
    
    const actualShift = this.config.trailMode === 'OPPOSITE'
      ? -shiftAmount
      : shiftAmount;
    
    const result = this.applyTrailShift(actualShift, actualDirection, currentPrice);
    
    if (result) {
      const reason = `Smart trail: vol=${(volatility * 100).toFixed(2)}%, sensitivity=${adjustedSensitivity.toFixed(2)}, mode=${this.config.trailMode}`;
      
      this.emit('smart_grid_trailed', {
        ...result,
        reason,
        volatility,
        positionSize,
      });
      
      return { ...result, reason };
    }
    
    return null;
  }

  /**
   * Check if price is approaching grid boundary
   */
  isApproachingBoundary(currentPrice: number, thresholdPercent: number = 10): {
    isApproaching: boolean;
    boundary: 'UPPER' | 'LOWER' | null;
    distancePercent: number;
  } {
    if (this.gridLevels.length === 0) {
      return { isApproaching: false, boundary: null, distancePercent: 0 };
    }
    
    const sortedPrices = this.gridLevels.map(l => l.price).sort((a, b) => a - b);
    const upperBoundary = sortedPrices[sortedPrices.length - 1];
    const lowerBoundary = sortedPrices[0];
    
    const distanceToUpper = (upperBoundary - currentPrice) / currentPrice * 100;
    const distanceToLower = (currentPrice - lowerBoundary) / currentPrice * 100;
    
    if (distanceToUpper <= thresholdPercent) {
      return { isApproaching: true, boundary: 'UPPER', distancePercent: distanceToUpper };
    }
    
    if (distanceToLower <= thresholdPercent) {
      return { isApproaching: true, boundary: 'LOWER', distancePercent: distanceToLower };
    }
    
    return { isApproaching: false, boundary: null, distancePercent: Math.min(distanceToUpper, distanceToLower) };
  }

  /**
   * Auto-trail when approaching boundary
   */
  autoTrailOnBoundary(currentPrice: number): {
    newLevels: GridLevel[];
    shift: number;
    direction: 'UP' | 'DOWN';
    event: TrailingEvent;
  } | null {
    const boundaryCheck = this.isApproachingBoundary(currentPrice, 5);
    
    if (!boundaryCheck.isApproaching) return null;
    if (this.state.trailCount >= this.config.maxTrailsPerSession) return null;
    
    // Trail away from boundary
    const direction = boundaryCheck.boundary === 'UPPER' ? 'UP' : 'DOWN';
    const gridRange = this.gridWidth || (this.state.currentCenter * 0.2);
    const shiftAmount = (direction === 'UP' ? 1 : -1) * gridRange * 0.3;
    
    return this.applyTrailShift(shiftAmount, direction, currentPrice);
  }

  // ==================== STATE MANAGEMENT ====================

  /**
   * Get current grid levels
   */
  getLevels(): GridLevel[] {
    return this.gridLevels.map(l => ({ ...l }));
  }

  /**
   * Get current state
   */
  getState(): TrailingGridState {
    return { ...this.state };
  }

  /**
   * Get trail history
   */
  getTrailHistory(): TrailingEvent[] {
    return [...this.state.trailHistory];
  }

  /**
   * Get trail statistics
   */
  getTrailStats(): {
    totalTrails: number;
    totalDistance: number;
    avgTrailDistance: number;
    upTrails: number;
    downTrails: number;
    sessionDuration: number; // minutes
  } {
    const upTrails = this.state.trailHistory.filter(e => e.direction === 'UP').length;
    const downTrails = this.state.trailHistory.filter(e => e.direction === 'DOWN').length;
    const avgTrailDistance = this.state.trailCount > 0
      ? this.state.totalTrailingDistance / this.state.trailCount
      : 0;
    
    const sessionDuration = (Date.now() - this.sessionStartTime.getTime()) / 60000;
    
    return {
      totalTrails: this.state.trailCount,
      totalDistance: this.state.totalTrailingDistance,
      avgTrailDistance,
      upTrails,
      downTrails,
      sessionDuration,
    };
  }

  /**
   * Reset trailing state
   */
  reset(centerPrice: number, levels: GridLevel[]): void {
    this.state = {
      originalCenter: centerPrice,
      currentCenter: centerPrice,
      trailCount: 0,
      lastTrailTime: null,
      lastTrailDirection: null,
      totalTrailingDistance: 0,
      trailHistory: [],
    };
    this.gridLevels = levels;
    this.peakPrice = centerPrice;
    this.valleyPrice = centerPrice;
    this.sessionStartTime = new Date();
    
    // Calculate grid width
    if (levels.length > 1) {
      const prices = levels.map(l => l.price).sort((a, b) => a - b);
      this.gridWidth = prices[prices.length - 1] - prices[0];
    } else {
      this.gridWidth = 0;
    }
    
    this.emit('trailing_reset', { centerPrice, levelCount: levels.length });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TrailingGridConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  /**
   * Get configuration
   */
  getConfig(): TrailingGridConfig {
    return { ...this.config };
  }

  /**
   * Calculate distance from current center
   */
  getDistanceFromCenter(currentPrice: number): {
    absolute: number;
    percent: number;
    direction: 'ABOVE' | 'BELOW' | 'AT_CENTER';
  } {
    const absolute = currentPrice - this.state.currentCenter;
    const percent = (absolute / this.state.currentCenter) * 100;
    const direction = absolute > 0 ? 'ABOVE' : absolute < 0 ? 'BELOW' : 'AT_CENTER';
    
    return { absolute, percent, direction };
  }

  /**
   * Check if trailing is available (within limits)
   */
  isTrailingAvailable(): boolean {
    return (
      this.config.enabled &&
      this.state.trailCount < this.config.maxTrailsPerSession
    );
  }

  /**
   * Get remaining trails for session
   */
  getRemainingTrails(): number {
    return Math.max(0, this.config.maxTrailsPerSession - this.state.trailCount);
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create trailing grid manager from existing grid configuration
 */
export function createTrailingGridManager(
  levels: GridLevel[],
  options: Partial<TrailingGridConfig> = {}
): TrailingGridManager {
  if (levels.length === 0) {
    throw new Error('Cannot create trailing grid manager with empty levels');
  }
  
  // Calculate center price
  const sortedPrices = levels.map(l => l.price).sort((a, b) => a - b);
  const centerPrice = (sortedPrices[0] + sortedPrices[sortedPrices.length - 1]) / 2;
  
  return new TrailingGridManager(options, levels, centerPrice);
}

/**
 * Calculate optimal trail sensitivity based on market conditions
 */
export function calculateOptimalSensitivity(
  volatility: number,
  trendStrength: number, // -1 to 1, negative = downtrend, positive = uptrend
  gridUtilization: number // 0 to 1, how many levels are filled
): number {
  // Base sensitivity
  let sensitivity = 0.5;
  
  // Adjust for volatility (lower sensitivity in high volatility)
  sensitivity *= Math.max(0.3, 1 - volatility * 2);
  
  // Adjust for trend (higher sensitivity in strong trends)
  sensitivity *= 1 + Math.abs(trendStrength) * 0.3;
  
  // Adjust for grid utilization (lower sensitivity when many levels filled)
  sensitivity *= 1 - gridUtilization * 0.3;
  
  // Ensure bounds
  return Math.min(0.9, Math.max(0.1, sensitivity));
}

// ==================== EXPORT DEFAULT ====================

export default TrailingGridManager;
