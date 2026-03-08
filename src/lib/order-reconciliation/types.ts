/**
 * Order Reconciliation Types
 * 
 * Detects "ghost orders" - orders that exist on the exchange but not in local state.
 * This happens when network timeouts occur during order placement.
 * 
 * These orphaned orders can lead to:
 * - Unexpected positions
 * - Potential liquidations
 * - Untracked risk exposure
 */

import type { OpenOrder, AllExchangeId, OrderSide, OrderType, OrderStatus, PositionSide } from "../exchange/types";

// ==================== CORE TYPES ====================

/**
 * Exchange order as returned from the exchange API
 */
export interface ExchangeOrder {
  id: string;
  clientOrderId?: string;
  exchange: AllExchangeId;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: number;
  averagePrice?: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  stopPrice?: number;
  leverage?: number;
  positionSide?: PositionSide;
  createdAt: Date;
  updatedAt: Date;
  reduceOnly?: boolean;
  isDemo?: boolean;
}

/**
 * Local order from database
 */
export interface LocalOrder {
  id: string;
  exchangeOrderId?: string | null;
  clientOrderId?: string | null;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price?: number | null;
  averagePrice?: number | null;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  stopPrice?: number | null;
  leverage?: number | null;
  positionSide?: PositionSide;
  createdAt: Date;
  updatedAt: Date;
  accountId: string;
  botId?: string | null;
  isDemo: boolean;
}

/**
 * Matched order - exists both on exchange and locally
 */
export interface MatchedOrder {
  exchangeOrder: ExchangeOrder;
  localOrder: LocalOrder;
  matchType: 'exchange_id' | 'client_order_id' | 'symbol_side_price';
  discrepancies: OrderDiscrepancy[];
}

/**
 * Order discrepancy between exchange and local state
 */
export interface OrderDiscrepancy {
  field: string;
  exchangeValue: unknown;
  localValue: unknown;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

// ==================== RESULT TYPES ====================

/**
 * Action taken during reconciliation
 */
export interface ReconciliationAction {
  type: 'log_only' | 'sync_local' | 'close_orphan' | 'notify' | 'error';
  orderId: string;
  exchange: AllExchangeId;
  symbol: string;
  description: string;
  timestamp: Date;
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Complete reconciliation result
 */
export interface ReconciliationResult {
  timestamp: Date;
  exchange: AllExchangeId;
  account: string;
  accountId: string;
  
  // Orders found
  exchangeOrdersCount: number;
  localOrdersCount: number;
  
  // Discrepancies
  orphanedOrders: ExchangeOrder[];      // On exchange, not in local DB
  missingOrders: LocalOrder[];          // In local DB, not on exchange
  matchedOrders: MatchedOrder[];
  
  // Actions taken
  actions: ReconciliationAction[];
  
  // Summary
  summary: {
    totalDiscrepancies: number;
    criticalDiscrepancies: number;
    orphansClosed: number;
    orphansSynced: number;
    errors: number;
  };
  
  // Duration
  durationMs: number;
  
  // Status
  success: boolean;
  error?: string;
}

/**
 * Reconciliation result for all accounts
 */
export interface BulkReconciliationResult {
  timestamp: Date;
  totalAccounts: number;
  successfulAccounts: number;
  failedAccounts: number;
  results: ReconciliationResult[];
  summary: {
    totalOrphanedOrders: number;
    totalMissingOrders: number;
    totalMatchedOrders: number;
    totalActions: number;
    criticalIssues: number;
  };
}

// ==================== CONFIG TYPES ====================

/**
 * Configuration for order reconciliation
 */
export interface ReconciliationConfig {
  /** Automatically close orphaned orders (dangerous!) */
  autoCloseOrphans: boolean;
  
  /** Send notification on discrepancies */
  notifyOnDiscrepancy: boolean;
  
  /** Interval between automatic reconciliations (ms) */
  reconciliationInterval: number;
  
  /** Only reconcile orders newer than this age (ms) */
  maxOrderAge?: number;
  
  /** Include demo/testnet accounts */
  includeDemoAccounts: boolean;
  
  /** Only check specific symbols (empty = all) */
  symbols?: string[];
  
  /** Actions to take on orphaned orders */
  orphanHandling: 'log_only' | 'sync_to_local' | 'close_immediately' | 'ask_user';
  
  /** Actions to take on missing orders */
  missingHandling: 'mark_closed' | 'log_only' | 'reconcile_status';
  
  /** Severity threshold for notifications */
  notificationThreshold: 'low' | 'medium' | 'high';
  
  /** Maximum concurrent reconciliations */
  maxConcurrent: number;
  
  /** Timeout for exchange API calls (ms) */
  apiTimeout: number;
}

/**
 * Default reconciliation configuration
 */
export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  autoCloseOrphans: false,
  notifyOnDiscrepancy: true,
  reconciliationInterval: 5 * 60 * 1000, // 5 minutes
  includeDemoAccounts: false,
  orphanHandling: 'log_only',
  missingHandling: 'mark_closed',
  notificationThreshold: 'medium',
  maxConcurrent: 3,
  apiTimeout: 30000,
};

// ==================== SCHEDULER TYPES ====================

/**
 * Status of the reconciliation scheduler
 */
export interface SchedulerStatus {
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastResult: BulkReconciliationResult | null;
  consecutiveErrors: number;
  totalRuns: number;
  config: ReconciliationConfig;
}

/**
 * Event emitted during reconciliation
 */
export interface ReconciliationEvent {
  type: 'started' | 'account_started' | 'account_completed' | 'orphan_found' | 
        'missing_found' | 'action_taken' | 'completed' | 'error';
  timestamp: Date;
  data: Record<string, unknown>;
}

/**
 * Callback for reconciliation events
 */
export type ReconciliationEventCallback = (event: ReconciliationEvent) => void;

// ==================== DATABASE EXTENSION ====================

/**
 * Order tracking record for reconciliation
 * Stored in SystemLog with category 'RECONCILIATION'
 */
export interface ReconciliationLog {
  id: string;
  timestamp: Date;
  exchange: AllExchangeId;
  accountId: string;
  
  // Result summary
  orphanedCount: number;
  missingCount: number;
  matchedCount: number;
  
  // Actions
  actionsCount: number;
  
  // Details
  details: ReconciliationResult;
}
