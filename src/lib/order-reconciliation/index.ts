/**
 * Order Reconciliation Module
 * 
 * Detects and handles "ghost orders" - orders that exist on the exchange 
 * but not in local state due to network timeouts during order placement.
 * 
 * Usage:
 * ```typescript
 * import { OrderReconciler, startPeriodicReconciliation } from '@/lib/order-reconciliation';
 * 
 * // Manual reconciliation
 * const reconciler = new OrderReconciler();
 * const result = await reconciler.reconcileAccount(accountId);
 * 
 * // Start periodic reconciliation (every 5 minutes for active bots)
 * const scheduler = startPeriodicReconciliation();
 * 
 * // Stop scheduler
 * scheduler.stop();
 * ```
 * 
 * Safety Notes:
 * - By default, orphaned orders are LOGGED ONLY
 * - autoCloseOrphans must be explicitly enabled in config
 * - Always review logs before enabling auto-close
 */

import { OrderReconciler } from './reconciler';
import type {
  ExchangeOrder,
  LocalOrder,
  MatchedOrder,
  OrderDiscrepancy,
  ReconciliationResult,
  BulkReconciliationResult,
  ReconciliationConfig,
  ReconciliationAction,
  SchedulerStatus,
  ReconciliationEvent,
  ReconciliationEventCallback,
  ReconciliationLog,
} from './types';

export { OrderReconciler };

export type {
  ExchangeOrder,
  LocalOrder,
  MatchedOrder,
  OrderDiscrepancy,
  ReconciliationResult,
  BulkReconciliationResult,
  ReconciliationConfig,
  ReconciliationAction,
  SchedulerStatus,
  ReconciliationEvent,
  ReconciliationEventCallback,
  ReconciliationLog,
};

export { DEFAULT_RECONCILIATION_CONFIG } from './types';

// ==================== PERIODIC RECONCILIATION SCHEDULER ====================

/**
 * Scheduler for automatic periodic reconciliation
 */
class ReconciliationScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private reconciler: OrderReconciler;
  private _status: SchedulerStatus;
  private isReconciling: boolean = false;

  constructor(config: Partial<ReconciliationConfig> = {}) {
    this.reconciler = new OrderReconciler(config);
    this._status = {
      isRunning: false,
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null,
      consecutiveErrors: 0,
      totalRuns: 0,
      config: this.reconciler.getConfig(),
    };
  }

  /**
   * Start periodic reconciliation
   */
  start(): void {
    if (this.intervalId) {
      console.warn("[ReconciliationScheduler] Already running");
      return;
    }

    const intervalMs = this._status.config.reconciliationInterval;
    
    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      this.runReconciliation();
    }, intervalMs);

    this._status.isRunning = true;
    this._status.nextRunAt = new Date(Date.now() + intervalMs);
    
    console.log(`[ReconciliationScheduler] Started with interval ${intervalMs / 60000} minutes`);
    
    // Run immediately on start
    this.runReconciliation();
  }

  /**
   * Stop periodic reconciliation
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._status.isRunning = false;
    this._status.nextRunAt = null;
    console.log("[ReconciliationScheduler] Stopped");
  }

  /**
   * Run reconciliation (called periodically)
   */
  private async runReconciliation(): Promise<void> {
    if (this.isReconciling) {
      console.log("[ReconciliationScheduler] Already reconciling, skipping");
      return;
    }

    this.isReconciling = true;

    try {
      console.log("[ReconciliationScheduler] Starting reconciliation...");
      
      const result = await this.reconciler.reconcileAllAccounts();
      
      this._status.lastRunAt = new Date();
      this._status.lastResult = result;
      this._status.totalRuns++;
      this._status.nextRunAt = new Date(Date.now() + this._status.config.reconciliationInterval);
      
      if (result.summary.totalOrphanedOrders > 0 || result.summary.totalMissingOrders > 0) {
        console.warn(`[ReconciliationScheduler] Found discrepancies:`, {
          orphaned: result.summary.totalOrphanedOrders,
          missing: result.summary.totalMissingOrders,
          critical: result.summary.criticalIssues,
        });
      } else {
        console.log(`[ReconciliationScheduler] Reconciliation complete - no issues found`);
      }

      // Reset consecutive errors on success
      this._status.consecutiveErrors = 0;

    } catch (error) {
      this._status.consecutiveErrors++;
      console.error(`[ReconciliationScheduler] Reconciliation failed (${this._status.consecutiveErrors} consecutive errors):`, error);
      
      // Exponential backoff on repeated errors
      if (this._status.consecutiveErrors >= 3) {
        const backoffMultiplier = Math.min(this._status.consecutiveErrors, 10);
        const backoffMs = this._status.config.reconciliationInterval * backoffMultiplier;
        this._status.nextRunAt = new Date(Date.now() + backoffMs);
        console.warn(`[ReconciliationScheduler] Backing off, next run in ${backoffMs / 60000} minutes`);
      }
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Get current status
   */
  getStatus(): SchedulerStatus {
    return { ...this._status };
  }

  /**
   * Trigger manual reconciliation
   */
  async triggerManual(): Promise<BulkReconciliationResult> {
    if (this.isReconciling) {
      throw new Error("Reconciliation already in progress");
    }
    
    this.isReconciling = true;
    try {
      const result = await this.reconciler.reconcileAllAccounts();
      this._status.lastResult = result;
      return result;
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ReconciliationConfig>): void {
    this.reconciler.updateConfig(config);
    this._status.config = this.reconciler.getConfig();
    
    // Restart with new interval if running
    if (this.intervalId && config.reconciliationInterval) {
      this.stop();
      this.start();
    }
  }
}

// Singleton instance
let schedulerInstance: ReconciliationScheduler | null = null;

/**
 * Start periodic reconciliation (singleton)
 * 
 * @param config - Optional configuration overrides
 * @returns Scheduler instance with status() and stop() methods
 */
export function startPeriodicReconciliation(
  config: Partial<ReconciliationConfig> = {}
): {
  stop: () => void;
  status: () => SchedulerStatus;
  triggerManual: () => Promise<BulkReconciliationResult>;
  updateConfig: (config: Partial<ReconciliationConfig>) => void;
} {
  if (!schedulerInstance) {
    schedulerInstance = new ReconciliationScheduler(config);
  }
  
  schedulerInstance.start();
  
  return {
    stop: () => schedulerInstance?.stop(),
    status: () => schedulerInstance?.getStatus() ?? {
      isRunning: false,
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null,
      consecutiveErrors: 0,
      totalRuns: 0,
      config: { ...DEFAULT_RECONCILIATION_CONFIG, ...config },
    },
    triggerManual: () => schedulerInstance?.triggerManual() ?? Promise.resolve({
      timestamp: new Date(),
      totalAccounts: 0,
      successfulAccounts: 0,
      failedAccounts: 0,
      results: [],
      summary: {
        totalOrphanedOrders: 0,
        totalMissingOrders: 0,
        totalMatchedOrders: 0,
        totalActions: 0,
        criticalIssues: 0,
      },
    }),
    updateConfig: (newConfig) => schedulerInstance?.updateConfig(newConfig),
  };
}

/**
 * Stop periodic reconciliation
 */
export function stopPeriodicReconciliation(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): SchedulerStatus | null {
  return schedulerInstance?.getStatus() ?? null;
}

/**
 * Create a new reconciler instance for manual use
 */
export function createReconciler(config: Partial<ReconciliationConfig> = {}): OrderReconciler {
  return new OrderReconciler(config);
}

/**
 * Quick reconciliation for a single account
 */
export async function quickReconcileAccount(
  accountId: string, 
  config: Partial<ReconciliationConfig> = {}
): Promise<ReconciliationResult> {
  const reconciler = new OrderReconciler(config);
  return reconciler.reconcileAccount(accountId);
}

/**
 * Quick reconciliation for all accounts
 */
export async function quickReconcileAll(
  config: Partial<ReconciliationConfig> = {}
): Promise<BulkReconciliationResult> {
  const reconciler = new OrderReconciler(config);
  return reconciler.reconcileAllAccounts();
}
