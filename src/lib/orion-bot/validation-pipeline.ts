/**
 * ORION Paper Trading Validation Pipeline
 *
 * Mandatory validation before live trading.
 *
 * Validation Criteria:
 * 1. Minimum duration: 7 days
 * 2. Minimum trades: 20
 * 3. Win rate > 40%
 * 4. Max drawdown < configured limit
 * 5. Profit factor > 1.0
 * 6. Sharpe ratio > 0
 *
 * Pipeline Stages:
 * ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
 * │   INIT       │ → │   RUNNING    │ → │   VALIDATED  │
 * └──────────────┘    └──────────────┘    └──────────────┘
 *                            ↓
 *                     ┌──────────────┐
 *                     │   FAILED     │
 *                     └──────────────┘
 */

import type {
  DailyStats,
  LifetimeStats,
  BotMode,
} from './types';

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export type ValidationStatus = 'INIT' | 'RUNNING' | 'VALIDATED' | 'FAILED';

export interface ValidationCriteria {
  /** Minimum duration in milliseconds */
  minDuration: number;
  /** Minimum number of trades */
  minTrades: number;
  /** Minimum win rate */
  minWinRate: number;
  /** Maximum drawdown allowed */
  maxDrawdown: number;
  /** Minimum profit factor */
  minProfitFactor: number;
  /** Minimum Sharpe ratio */
  minSharpeRatio: number;
  /** Maximum consecutive losses */
  maxConsecutiveLosses: number;
  /** Minimum average R:R achieved */
  minAvgRiskReward: number;
}

export interface ValidationResult {
  status: ValidationStatus;
  passedAt: number | null;
  failedAt: number | null;
  failureReason: string | null;
  criteria: ValidationCriteria;
  progress: {
    duration: number;
    durationPercent: number;
    trades: number;
    tradesPercent: number;
  };
  metrics: {
    winRate: number;
    drawdown: number;
    profitFactor: number;
    sharpeRatio: number;
    consecutiveLosses: number;
    avgRiskReward: number;
  };
  checks: {
    [key: string]: {
      passed: boolean;
      value: number;
      threshold: number;
    };
  };
  startedAt: number;
  lastCheckedAt: number;
}

export interface ValidationReport {
  instanceId: string;
  startedAt: number;
  completedAt: number | null;
  status: ValidationStatus;
  criteria: ValidationCriteria;
  finalMetrics: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalPnL: number;
    totalPnLPct: number;
  };
  recommendation: 'APPROVE' | 'REJECT' | 'EXTEND';
  recommendationReason: string;
  tradingSummary: {
    byDay: DailyStats[];
    bySymbol: { [symbol: string]: { trades: number; pnl: number } };
    byDirection: { long: number; short: number };
  };
}

// =============================================================================
// DEFAULT CRITERIA
// =============================================================================

export const defaultValidationCriteria: ValidationCriteria = {
  minDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
  minTrades: 20,
  minWinRate: 0.40, // 40%
  maxDrawdown: 0.10, // 10%
  minProfitFactor: 1.0,
  minSharpeRatio: 0,
  maxConsecutiveLosses: 10,
  minAvgRiskReward: 0.5,
};

// =============================================================================
// VALIDATION PIPELINE
// =============================================================================

export class ValidationPipeline {
  private criteria: ValidationCriteria;
  private status: ValidationStatus = 'INIT';
  private startedAt: number = 0;
  private passedAt: number | null = null;
  private failedAt: number | null = null;
  private failureReason: string | null = null;
  private dailyStats: DailyStats[] = [];
  private lifetimeStats: LifetimeStats | null = null;
  private consecutiveLosses: number = 0;
  private maxConsecutiveLosses: number = 0;
  private instanceId: string = '';

  constructor(criteria: ValidationCriteria = defaultValidationCriteria) {
    this.criteria = criteria;
    this.instanceId = `validation-${Date.now()}`;
  }

  /**
   * Start validation
   */
  public start(): void {
    this.status = 'RUNNING';
    this.startedAt = Date.now();
    this.consecutiveLosses = 0;
    this.maxConsecutiveLosses = 0;
  }

  /**
   * Update with new trade result
   */
  public updateTrade(isWin: boolean, pnl: number, pnlPct: number): void {
    if (this.status !== 'RUNNING') return;

    if (isWin) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
      this.maxConsecutiveLosses = Math.max(
        this.maxConsecutiveLosses,
        this.consecutiveLosses
      );
    }

    // Check consecutive loss limit
    if (this.consecutiveLosses > this.criteria.maxConsecutiveLosses) {
      this.fail('Maximum consecutive losses exceeded');
    }
  }

  /**
   * Update with daily stats
   */
  public updateDailyStats(stats: DailyStats): void {
    if (this.status !== 'RUNNING') return;

    this.dailyStats.push(stats);

    // Check drawdown
    if (stats.maxDrawdown > this.criteria.maxDrawdown) {
      this.fail(`Maximum drawdown exceeded: ${(stats.maxDrawdown * 100).toFixed(2)}% > ${(this.criteria.maxDrawdown * 100).toFixed(2)}%`);
    }
  }

  /**
   * Update with lifetime stats
   */
  public updateLifetimeStats(stats: LifetimeStats): void {
    this.lifetimeStats = stats;
  }

  /**
   * Check if validation is complete
   */
  public check(): ValidationResult {
    const now = Date.now();
    const duration = this.startedAt > 0 ? now - this.startedAt : 0;

    const metrics = this.calculateMetrics();
    const progress = {
      duration,
      durationPercent: Math.min(100, (duration / this.criteria.minDuration) * 100),
      trades: this.lifetimeStats?.totalTrades || 0,
      tradesPercent: Math.min(100, ((this.lifetimeStats?.totalTrades || 0) / this.criteria.minTrades) * 100),
    };

    const checks = this.runChecks(metrics);

    // If running, check if all criteria met
    if (this.status === 'RUNNING') {
      const allPassed = Object.values(checks).every(c => c.passed);
      const minRequirementsMet =
        progress.durationPercent >= 100 && progress.tradesPercent >= 100;

      if (allPassed && minRequirementsMet) {
        this.pass();
      }
    }

    return {
      status: this.status,
      passedAt: this.passedAt,
      failedAt: this.failedAt,
      failureReason: this.failureReason,
      criteria: this.criteria,
      progress,
      metrics,
      checks,
      startedAt: this.startedAt,
      lastCheckedAt: now,
    };
  }

  /**
   * Get validation status
   */
  public getStatus(): ValidationStatus {
    return this.status;
  }

  /**
   * Is validation complete (passed or failed)
   */
  public isComplete(): boolean {
    return this.status === 'VALIDATED' || this.status === 'FAILED';
  }

  /**
   * Can proceed to live trading
   */
  public canGoLive(): boolean {
    return this.status === 'VALIDATED';
  }

  /**
   * Get validation report
   */
  public getReport(): ValidationReport {
    const now = Date.now();

    return {
      instanceId: this.instanceId,
      startedAt: this.startedAt,
      completedAt: this.passedAt || this.failedAt || null,
      status: this.status,
      criteria: this.criteria,
      finalMetrics: {
        totalTrades: this.lifetimeStats?.totalTrades || 0,
        winRate: this.lifetimeStats?.winRate || 0,
        profitFactor: this.lifetimeStats?.profitFactor || 0,
        sharpeRatio: this.lifetimeStats?.sharpeRatio || 0,
        maxDrawdown: this.lifetimeStats?.maxDrawdown || 0,
        totalPnL: this.lifetimeStats?.totalPnl || 0,
        totalPnLPct: this.lifetimeStats?.totalPnlPct || 0,
      },
      recommendation: this.generateRecommendation(),
      recommendationReason: this.generateRecommendationReason(),
      tradingSummary: {
        byDay: this.dailyStats,
        bySymbol: {}, // Would be populated from actual data
        byDirection: { long: 0, short: 0 }, // Would be populated from actual data
      },
    };
  }

  /**
   * Reset validation
   */
  public reset(): void {
    this.status = 'INIT';
    this.startedAt = 0;
    this.passedAt = null;
    this.failedAt = null;
    this.failureReason = null;
    this.dailyStats = [];
    this.lifetimeStats = null;
    this.consecutiveLosses = 0;
    this.maxConsecutiveLosses = 0;
    this.instanceId = `validation-${Date.now()}`;
  }

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  private calculateMetrics() {
    const stats = this.lifetimeStats;

    return {
      winRate: stats?.winRate || 0,
      drawdown: stats?.maxDrawdown || 0,
      profitFactor: stats?.profitFactor || 0,
      sharpeRatio: stats?.sharpeRatio || 0,
      consecutiveLosses: this.maxConsecutiveLosses,
      avgRiskReward: stats?.avgWin && stats?.avgLoss
        ? stats.avgWin / stats.avgLoss
        : 0,
    };
  }

  private runChecks(metrics: ReturnType<typeof this.calculateMetrics>) {
    return {
      winRate: {
        passed: metrics.winRate >= this.criteria.minWinRate,
        value: metrics.winRate,
        threshold: this.criteria.minWinRate,
      },
      drawdown: {
        passed: metrics.drawdown <= this.criteria.maxDrawdown,
        value: metrics.drawdown,
        threshold: this.criteria.maxDrawdown,
      },
      profitFactor: {
        passed: metrics.profitFactor >= this.criteria.minProfitFactor,
        value: metrics.profitFactor,
        threshold: this.criteria.minProfitFactor,
      },
      sharpeRatio: {
        passed: metrics.sharpeRatio >= this.criteria.minSharpeRatio,
        value: metrics.sharpeRatio,
        threshold: this.criteria.minSharpeRatio,
      },
      consecutiveLosses: {
        passed: metrics.consecutiveLosses <= this.criteria.maxConsecutiveLosses,
        value: metrics.consecutiveLosses,
        threshold: this.criteria.maxConsecutiveLosses,
      },
      avgRiskReward: {
        passed: metrics.avgRiskReward >= this.criteria.minAvgRiskReward,
        value: metrics.avgRiskReward,
        threshold: this.criteria.minAvgRiskReward,
      },
    };
  }

  private pass(): void {
    this.status = 'VALIDATED';
    this.passedAt = Date.now();
  }

  private fail(reason: string): void {
    this.status = 'FAILED';
    this.failedAt = Date.now();
    this.failureReason = reason;
  }

  private generateRecommendation(): 'APPROVE' | 'REJECT' | 'EXTEND' {
    if (this.status === 'VALIDATED') return 'APPROVE';
    if (this.status === 'FAILED') return 'REJECT';

    // If still running, check if extending might help
    const stats = this.lifetimeStats;
    if (!stats) return 'EXTEND';

    // If metrics are close to thresholds, recommend extension
    const winRateClose = stats.winRate >= this.criteria.minWinRate * 0.9;
    const profitFactorClose = stats.profitFactor >= this.criteria.minProfitFactor * 0.9;

    if (winRateClose && profitFactorClose) {
      return 'EXTEND';
    }

    return 'REJECT';
  }

  private generateRecommendationReason(): string {
    if (this.status === 'VALIDATED') {
      return 'All validation criteria met. Strategy approved for live trading.';
    }

    if (this.status === 'FAILED') {
      return `Validation failed: ${this.failureReason}. Strategy not recommended for live trading.`;
    }

    const stats = this.lifetimeStats;
    if (!stats) {
      return 'Insufficient data for recommendation.';
    }

    const issues: string[] = [];

    if (stats.winRate < this.criteria.minWinRate) {
      issues.push(`Win rate ${(stats.winRate * 100).toFixed(1)}% below ${(this.criteria.minWinRate * 100).toFixed(1)}% threshold`);
    }

    if (stats.profitFactor < this.criteria.minProfitFactor) {
      issues.push(`Profit factor ${stats.profitFactor.toFixed(2)} below ${this.criteria.minProfitFactor.toFixed(2)} threshold`);
    }

    if (issues.length === 0) {
      return 'Validation in progress. Continue paper trading to complete validation.';
    }

    return `Issues detected: ${issues.join('; ')}. `;
  }
}

// =============================================================================
// VALIDATION MANAGER
// =============================================================================

export class ValidationManager {
  private pipelines: Map<string, ValidationPipeline> = new Map();

  /**
   * Create or get validation pipeline for an instance
   */
  public getOrCreatePipeline(
    instanceId: string,
    criteria?: ValidationCriteria
  ): ValidationPipeline {
    let pipeline = this.pipelines.get(instanceId);

    if (!pipeline) {
      pipeline = new ValidationPipeline(criteria);
      this.pipelines.set(instanceId, pipeline);
    }

    return pipeline;
  }

  /**
   * Get pipeline by instance ID
   */
  public getPipeline(instanceId: string): ValidationPipeline | null {
    return this.pipelines.get(instanceId) || null;
  }

  /**
   * Remove pipeline
   */
  public removePipeline(instanceId: string): void {
    this.pipelines.delete(instanceId);
  }

  /**
   * Get all active validations
   */
  public getActiveValidations(): { instanceId: string; status: ValidationStatus }[] {
    return Array.from(this.pipelines.entries())
      .filter(([_, p]) => p.getStatus() === 'RUNNING')
      .map(([id, p]) => ({ instanceId: id, status: p.getStatus() }));
  }

  /**
   * Get all completed validations
   */
  public getCompletedValidations(): { instanceId: string; result: ValidationResult }[] {
    return Array.from(this.pipelines.entries())
      .filter(([_, p]) => p.isComplete())
      .map(([id, p]) => ({ instanceId: id, result: p.check() }));
  }
}
