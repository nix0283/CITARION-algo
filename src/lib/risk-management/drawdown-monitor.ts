/**
 * DRAWDOWN MONITOR
 *
 * Real-time drawdown monitoring with multiple levels and recovery tracking.
 */

import type {
  DrawdownThresholds,
  DrawdownState,
  DrawdownMetrics,
  DrawdownLevel,
} from './types';

export class DrawdownMonitor {
  private thresholds: DrawdownThresholds;
  private state: DrawdownState;
  private history: Array<{ timestamp: number; equity: number; drawdown: number }> = [];
  private recoveryTimes: number[] = [];
  private drawdownStart: number | null = null;

  constructor(thresholds: Partial<DrawdownThresholds> = {}) {
    this.thresholds = {
      warning: 0.05,
      critical: 0.10,
      breach: 0.20,
      recoveryThreshold: 0.02,
      ...thresholds,
    };

    this.state = {
      currentDrawdown: 0,
      peakEquity: 0,
      currentEquity: 0,
      level: 'none',
      duration: 0,
      startedAt: null,
      maxDrawdown: 0,
      recoveryPct: 0,
    };
  }

  /**
   * Update drawdown state with new equity value
   */
  public update(equity: number): DrawdownMetrics {
    const now = Date.now();

    // Update peak equity
    if (equity > this.state.peakEquity) {
      // Check for recovery
      if (this.state.startedAt && this.state.currentDrawdown > 0) {
        this.recoveryTimes.push(now - this.state.startedAt);
        this.drawdownStart = null;
      }
      this.state.peakEquity = equity;
      this.state.startedAt = null;
    }

    // Update current equity
    this.state.currentEquity = equity;

    // Calculate drawdown
    if (this.state.peakEquity > 0) {
      this.state.currentDrawdown = (this.state.peakEquity - equity) / this.state.peakEquity;
    } else {
      this.state.currentDrawdown = 0;
    }

    // Update max drawdown
    if (this.state.currentDrawdown > this.state.maxDrawdown) {
      this.state.maxDrawdown = this.state.currentDrawdown;
    }

    // Determine level
    this.state.level = this.determineLevel(this.state.currentDrawdown);

    // Track drawdown duration
    if (this.state.currentDrawdown > 0 && !this.state.startedAt) {
      this.state.startedAt = now;
      this.drawdownStart = now;
    }
    
    if (this.state.startedAt) {
      this.state.duration = now - this.state.startedAt;
    }

    // Calculate recovery percentage
    if (this.state.maxDrawdown > 0) {
      this.state.recoveryPct = 1 - (this.state.currentDrawdown / this.state.maxDrawdown);
    }

    // Record history
    this.history.push({
      timestamp: now,
      equity,
      drawdown: this.state.currentDrawdown,
    });

    // Keep last 1000 entries
    if (this.history.length > 1000) {
      this.history.shift();
    }

    return this.getMetrics();
  }

  /**
   * Get current drawdown metrics
   */
  public getMetrics(): DrawdownMetrics {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    return {
      state: { ...this.state },
      daily: this.calculatePeriodDrawdown(dayAgo),
      weekly: this.calculatePeriodDrawdown(weekAgo),
      monthly: this.calculatePeriodDrawdown(monthAgo),
      avgRecoveryTime: this.calculateAvgRecoveryTime(),
      drawdownCount: this.countDrawdowns(),
    };
  }

  /**
   * Check if drawdown exceeds a specific level
   */
  public exceedsLevel(level: DrawdownLevel): boolean {
    const thresholds: Record<DrawdownLevel, number> = {
      none: 0,
      warning: this.thresholds.warning,
      critical: this.thresholds.critical,
      breach: this.thresholds.breach,
    };

    return this.state.currentDrawdown >= thresholds[level];
  }

  /**
   * Get drawdown history for a period
   */
  public getHistory(since?: number): Array<{ timestamp: number; equity: number; drawdown: number }> {
    if (since) {
      return this.history.filter(h => h.timestamp >= since);
    }
    return [...this.history];
  }

  /**
   * Reset monitor (e.g., after major account change)
   */
  public reset(equity: number): void {
    this.state = {
      currentDrawdown: 0,
      peakEquity: equity,
      currentEquity: equity,
      level: 'none',
      duration: 0,
      startedAt: null,
      maxDrawdown: 0,
      recoveryPct: 0,
    };
    this.history = [];
    this.drawdownStart = null;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private determineLevel(drawdown: number): DrawdownLevel {
    if (drawdown >= this.thresholds.breach) {
      return 'breach';
    }
    if (drawdown >= this.thresholds.critical) {
      return 'critical';
    }
    if (drawdown >= this.thresholds.warning) {
      return 'warning';
    }
    return 'none';
  }

  private calculatePeriodDrawdown(since: number): number {
    const periodHistory = this.history.filter(h => h.timestamp >= since);
    if (periodHistory.length === 0) return 0;

    const peak = Math.max(...periodHistory.map(h => h.equity));
    const current = periodHistory[periodHistory.length - 1]?.equity || peak;

    return peak > 0 ? (peak - current) / peak : 0;
  }

  private calculateAvgRecoveryTime(): number {
    if (this.recoveryTimes.length === 0) return 0;
    return this.recoveryTimes.reduce((sum, t) => sum + t, 0) / this.recoveryTimes.length;
  }

  private countDrawdowns(): number {
    return this.recoveryTimes.length + (this.state.currentDrawdown > 0 ? 1 : 0);
  }

  /**
   * Update thresholds
   */
  public updateThresholds(thresholds: Partial<DrawdownThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  public getThresholds(): DrawdownThresholds {
    return { ...this.thresholds };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const defaultDrawdownThresholds: DrawdownThresholds = {
  warning: 0.05,
  critical: 0.10,
  breach: 0.20,
  recoveryThreshold: 0.02,
};
