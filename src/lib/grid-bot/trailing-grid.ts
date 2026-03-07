/**
 * Grid Bot Trailing Grid
 * 
 * Сетка, которая двигается за ценой.
 */

export interface TrailingGridConfig {
  enabled: boolean;
  trailPercent: number;       // Сдвигать сетку когда цена выходит за X%
  minTrailDistance: number;   // Минимальное расстояние для сдвига (USDT)
  keepFilledLevels: boolean;  // Сохранять заполненные уровни
  maxTrails: number;          // Максимум сдвигов за сессию
}

export interface TrailingGridState {
  originalCenter: number;
  currentCenter: number;
  trailCount: number;
  lastTrailTime?: Date;
  trailHistory: {
    from: number;
    to: number;
    price: number;
    time: Date;
  }[];
}

export const DEFAULT_TRAILING_GRID_CONFIG: TrailingGridConfig = {
  enabled: false,
  trailPercent: 5,      // 5%
  minTrailDistance: 100, // $100 minimum
  keepFilledLevels: true,
  maxTrails: 10,
};

export class TrailingGridManager {
  private config: TrailingGridConfig;
  private state: TrailingGridState;
  private gridLevels: number[];

  constructor(
    config: Partial<TrailingGridConfig> = {},
    initialLevels: number[] = [],
    centerPrice: number = 0
  ) {
    this.config = { ...DEFAULT_TRAILING_GRID_CONFIG, ...config };
    this.gridLevels = initialLevels;
    this.state = {
      originalCenter: centerPrice,
      currentCenter: centerPrice,
      trailCount: 0,
      trailHistory: [],
    };
  }

  /**
   * Check if grid should trail
   */
  shouldTrail(currentPrice: number): boolean {
    if (!this.config.enabled) return false;
    if (this.state.trailCount >= this.config.maxTrails) return false;

    // Calculate distance from center
    const distancePercent = Math.abs(currentPrice - this.state.currentCenter) / this.state.currentCenter * 100;

    return distancePercent >= this.config.trailPercent;
  }

  /**
   * Execute grid trail
   */
  executeTrail(currentPrice: number): {
    newLevels: number[];
    shift: number;
    direction: "UP" | "DOWN";
  } | null {
    if (!this.shouldTrail(currentPrice)) return null;

    const direction = currentPrice > this.state.currentCenter ? "UP" : "DOWN";
    const distance = currentPrice - this.state.currentCenter;
    
    // Ensure minimum trail distance
    if (Math.abs(distance) < this.config.minTrailDistance) {
      // Scale distance to minimum
      const sign = distance > 0 ? 1 : -1;
      const shift = sign * this.config.minTrailDistance;
      return this.applyShift(shift, direction, currentPrice);
    }

    return this.applyShift(distance * 0.5, direction, currentPrice); // Move 50% of distance
  }

  /**
   * Apply shift to grid levels
   */
  private applyShift(
    shift: number,
    direction: "UP" | "DOWN",
    currentPrice: number
  ): { newLevels: number[]; shift: number; direction: "UP" | "DOWN" } | null {
    const newLevels = this.gridLevels.map(level => level + shift);
    const newCenter = this.state.currentCenter + shift;

    // Update state
    this.state.trailHistory.push({
      from: this.state.currentCenter,
      to: newCenter,
      price: currentPrice,
      time: new Date(),
    });
    this.state.currentCenter = newCenter;
    this.state.trailCount++;
    this.state.lastTrailTime = new Date();
    this.gridLevels = newLevels;

    return { newLevels, shift, direction };
  }

  /**
   * Get current levels
   */
  getLevels(): number[] {
    return [...this.gridLevels];
  }

  /**
   * Get state
   */
  getState(): TrailingGridState {
    return { ...this.state };
  }

  /**
   * Reset
   */
  reset(centerPrice: number, levels: number[]): void {
    this.state = {
      originalCenter: centerPrice,
      currentCenter: centerPrice,
      trailCount: 0,
      trailHistory: [],
    };
    this.gridLevels = levels;
  }
}
