/**
 * Fill Ratio Tracking for Copy Trading
 * 
 * Tracks partial order fills and ensures proper position sizing
 * when copying trades with partial executions.
 * 
 * Features:
 * - Track fill ratios for master and follower orders
 * - Calculate adjusted position sizes for followers
 * - Handle partial close scenarios
 * - Aggregate fill metrics for analysis
 * - Integration with slippage protection
 */

import type { ExchangeId } from '../exchange/types';

// ==================== TYPES ====================

/**
 * Fill status for an order
 */
export type FillStatus =
  | 'PENDING'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED';

/**
 * Single fill event
 */
export interface FillEvent {
  /** Unique fill ID */
  id: string;
  /** Order ID */
  orderId: string;
  /** Fill price */
  price: number;
  /** Fill quantity */
  quantity: number;
  /** Fill fee */
  fee: number;
  /** Fee currency */
  feeCurrency: string;
  /** Fill timestamp */
  timestamp: Date;
  /** Is this a taker fill */
  isTaker: boolean;
  /** Exchange trade ID */
  exchangeTradeId?: string;
}

/**
 * Order fill tracking record
 */
export interface OrderFillRecord {
  /** Unique record ID */
  id: string;
  /** Exchange ID */
  exchange: ExchangeId;
  /** Symbol */
  symbol: string;
  /** Order ID from exchange */
  exchangeOrderId: string;
  /** Internal order ID */
  internalOrderId: string;
  /** Master trader ID */
  masterTraderId: string;
  /** Follower ID */
  followerId: string;
  /** Original order quantity */
  originalQuantity: number;
  /** Filled quantity */
  filledQuantity: number;
  /** Remaining quantity */
  remainingQuantity: number;
  /** Fill ratio (0-1) */
  fillRatio: number;
  /** Average fill price */
  avgFillPrice: number;
  /** Total fees */
  totalFees: number;
  /** Fill status */
  status: FillStatus;
  /** Fill events */
  fills: FillEvent[];
  /** Order side */
  side: 'BUY' | 'SELL';
  /** Order type */
  orderType: 'MARKET' | 'LIMIT' | 'STOP';
  /** Order direction for positions */
  direction: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Completion timestamp */
  completedAt?: Date;
  /** Slippage in percent */
  slippagePercent?: number;
  /** Latency from signal to first fill (ms) */
  latencyMs?: number;
  /** Notes or errors */
  notes?: string;
}

/**
 * Fill ratio calculation result
 */
export interface FillRatioResult {
  /** Calculated fill ratio */
  fillRatio: number;
  /** Adjusted quantity for follower */
  adjustedQuantity: number;
  /** Average price */
  avgPrice: number;
  /** Is this a complete fill */
  isComplete: boolean;
  /** Recommended action */
  recommendation: 'PROCEED' | 'WAIT' | 'CANCEL' | 'PARTIAL_COPY';
  /** Reason for recommendation */
  reason: string;
}

/**
 * Fill metrics for analysis
 */
export interface FillMetrics {
  /** Total orders tracked */
  totalOrders: number;
  /** Fully filled orders */
  fullyFilled: number;
  /** Partially filled orders */
  partiallyFilled: number;
  /** Cancelled orders */
  cancelled: number;
  /** Average fill ratio */
  avgFillRatio: number;
  /** Average fill time (ms) */
  avgFillTime: number;
  /** Average slippage */
  avgSlippage: number;
  /** Fill rate by symbol */
  fillRateBySymbol: Record<string, number>;
  /** Fill rate by exchange */
  fillRateByExchange: Record<string, number>;
  /** Time-weighted average fill ratio */
  twaFillRatio: number;
}

/**
 * Fill ratio configuration
 */
export interface FillRatioConfig {
  /** Minimum fill ratio to proceed (default: 0.5) */
  minFillRatio: number;
  /** Maximum wait time for partial fills (ms) */
  maxWaitTime: number;
  /** Enable partial copy for partial fills */
  enablePartialCopy: boolean;
  /** Auto-cancel threshold for unfilled portion */
  autoCancelThreshold: number;
  /** Log all fill events */
  enableLogging: boolean;
}

// ==================== DEFAULTS ====================

const DEFAULT_CONFIG: FillRatioConfig = {
  minFillRatio: 0.5,
  maxWaitTime: 30000, // 30 seconds
  enablePartialCopy: true,
  autoCancelThreshold: 0.1, // 10% remaining
  enableLogging: true,
};

// ==================== FILL RATIO TRACKER CLASS ====================

/**
 * Tracks fill ratios for copy trading orders
 */
export class FillRatioTracker {
  private config: FillRatioConfig;
  private orders: Map<string, OrderFillRecord> = new Map();
  private masterOrders: Map<string, string[]> = new Map(); // masterTraderId -> orderIds
  private followerOrders: Map<string, string[]> = new Map(); // followerId -> orderIds
  private fillCounter: number = 0;

  constructor(config: Partial<FillRatioConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `fill-${Date.now()}-${(++this.fillCounter).toString(36).padStart(4, '0')}`;
  }

  /**
   * Register a new order for tracking
   */
  registerOrder(params: {
    exchange: ExchangeId;
    symbol: string;
    exchangeOrderId: string;
    internalOrderId: string;
    masterTraderId: string;
    followerId: string;
    originalQuantity: number;
    side: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT' | 'STOP';
    direction: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  }): OrderFillRecord {
    const record: OrderFillRecord = {
      id: this.generateId(),
      exchange: params.exchange,
      symbol: params.symbol,
      exchangeOrderId: params.exchangeOrderId,
      internalOrderId: params.internalOrderId,
      masterTraderId: params.masterTraderId,
      followerId: params.followerId,
      originalQuantity: params.originalQuantity,
      filledQuantity: 0,
      remainingQuantity: params.originalQuantity,
      fillRatio: 0,
      avgFillPrice: 0,
      totalFees: 0,
      status: 'PENDING',
      fills: [],
      side: params.side,
      orderType: params.orderType,
      direction: params.direction,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(record.id, record);

    // Index by master trader
    const masterOrders = this.masterOrders.get(params.masterTraderId) || [];
    masterOrders.push(record.id);
    this.masterOrders.set(params.masterTraderId, masterOrders);

    // Index by follower
    const followerOrders = this.followerOrders.get(params.followerId) || [];
    followerOrders.push(record.id);
    this.followerOrders.set(params.followerId, followerOrders);

    if (this.config.enableLogging) {
      console.log('[FillRatioTracker] Registered order:', {
        id: record.id,
        symbol: record.symbol,
        quantity: record.originalQuantity,
        masterTraderId: record.masterTraderId,
        followerId: record.followerId,
      });
    }

    return record;
  }

  /**
   * Record a fill event
   */
  recordFill(
    orderId: string,
    fill: Omit<FillEvent, 'id'>
  ): OrderFillRecord | null {
    const record = this.orders.get(orderId);
    if (!record) {
      console.warn('[FillRatioTracker] Order not found:', orderId);
      return null;
    }

    // Create fill event
    const fillEvent: FillEvent = {
      ...fill,
      id: this.generateId(),
    };

    // Add to fills array
    record.fills.push(fillEvent);

    // Update quantities
    record.filledQuantity += fill.quantity;
    record.remainingQuantity = record.originalQuantity - record.filledQuantity;
    record.fillRatio = record.filledQuantity / record.originalQuantity;
    record.totalFees += fill.fee;
    record.updatedAt = new Date();

    // Calculate average price
    let totalValue = 0;
    let totalQty = 0;
    for (const f of record.fills) {
      totalValue += f.price * f.quantity;
      totalQty += f.quantity;
    }
    record.avgFillPrice = totalQty > 0 ? totalValue / totalQty : 0;

    // Update status
    if (record.fillRatio >= 0.999) {
      record.status = 'FILLED';
      record.completedAt = new Date();
    } else if (record.fillRatio > 0) {
      record.status = 'PARTIALLY_FILLED';
    }

    // Set latency (time from order creation to first fill)
    if (record.fills.length === 1) {
      record.latencyMs = fill.timestamp.getTime() - record.createdAt.getTime();
    }

    if (this.config.enableLogging) {
      console.log('[FillRatioTracker] Recorded fill:', {
        orderId: record.id,
        fillId: fillEvent.id,
        price: fill.price,
        quantity: fill.quantity,
        totalFilled: record.filledQuantity,
        fillRatio: `${(record.fillRatio * 100).toFixed(2)}%`,
        status: record.status,
      });
    }

    return record;
  }

  /**
   * Mark order as cancelled
   */
  markCancelled(orderId: string, reason?: string): OrderFillRecord | null {
    const record = this.orders.get(orderId);
    if (!record) return null;

    record.status = 'CANCELLED';
    record.remainingQuantity = record.originalQuantity - record.filledQuantity;
    record.notes = reason;
    record.updatedAt = new Date();
    record.completedAt = new Date();

    return record;
  }

  /**
   * Calculate fill ratio and recommendation for a follower order
   */
  calculateFillRatio(orderId: string): FillRatioResult | null {
    const record = this.orders.get(orderId);
    if (!record) return null;

    const fillRatio = record.fillRatio;
    const adjustedQuantity = record.filledQuantity;
    const isComplete = fillRatio >= 0.999;

    // Determine recommendation
    let recommendation: FillRatioResult['recommendation'];
    let reason: string;

    if (isComplete) {
      recommendation = 'PROCEED';
      reason = 'Order fully filled';
    } else if (fillRatio >= this.config.minFillRatio) {
      if (this.config.enablePartialCopy) {
        recommendation = 'PARTIAL_COPY';
        reason = `Partial fill (${(fillRatio * 100).toFixed(2)}%), proceed with filled quantity`;
      } else {
        recommendation = 'WAIT';
        reason = `Waiting for more fills (${(fillRatio * 100).toFixed(2)}%)`;
      }
    } else if (fillRatio > 0) {
      if (Date.now() - record.createdAt.getTime() > this.config.maxWaitTime) {
        recommendation = 'CANCEL';
        reason = `Timeout waiting for fills, current ratio: ${(fillRatio * 100).toFixed(2)}%`;
      } else {
        recommendation = 'WAIT';
        reason = `Low fill ratio (${(fillRatio * 100).toFixed(2)}%), waiting for more fills`;
      }
    } else {
      if (Date.now() - record.createdAt.getTime() > this.config.maxWaitTime) {
        recommendation = 'CANCEL';
        reason = 'Timeout with no fills';
      } else {
        recommendation = 'WAIT';
        reason = 'No fills yet, waiting';
      }
    }

    return {
      fillRatio,
      adjustedQuantity,
      avgPrice: record.avgFillPrice,
      isComplete,
      recommendation,
      reason,
    };
  }

  /**
   * Get adjusted position size for follower based on master's fill ratio
   * 
   * @param masterOrderId - Master's order ID
   * @param followerTargetSize - Follower's target position size
   */
  getAdjustedFollowerSize(
    masterOrderId: string,
    followerTargetSize: number
  ): number {
    const record = this.orders.get(masterOrderId);
    if (!record) {
      return followerTargetSize; // Return original if not found
    }

    // Adjust follower size proportionally
    return followerTargetSize * record.fillRatio;
  }

  /**
   * Get fill metrics for analysis
   */
  getMetrics(timeRange?: { start: Date; end: Date }): FillMetrics {
    const records = Array.from(this.orders.values());

    // Filter by time range if provided
    const filtered = timeRange
      ? records.filter(
          (r) =>
            r.createdAt >= timeRange.start && r.createdAt <= timeRange.end
        )
      : records;

    const totalOrders = filtered.length;
    const fullyFilled = filtered.filter((r) => r.status === 'FILLED').length;
    const partiallyFilled = filtered.filter(
      (r) => r.status === 'PARTIALLY_FILLED'
    ).length;
    const cancelled = filtered.filter((r) => r.status === 'CANCELLED').length;

    const avgFillRatio =
      totalOrders > 0
        ? filtered.reduce((sum, r) => sum + r.fillRatio, 0) / totalOrders
        : 0;

    const fillTimes = filtered
      .filter((r) => r.completedAt)
      .map(
        (r) => r.completedAt!.getTime() - r.createdAt.getTime()
      );
    const avgFillTime =
      fillTimes.length > 0
        ? fillTimes.reduce((sum, t) => sum + t, 0) / fillTimes.length
        : 0;

    const avgSlippage =
      totalOrders > 0
        ? filtered
            .filter((r) => r.slippagePercent !== undefined)
            .reduce((sum, r) => sum + (r.slippagePercent || 0), 0) /
          Math.max(1, filtered.filter((r) => r.slippagePercent !== undefined).length)
        : 0;

    // Fill rate by symbol
    const symbolStats: Record<string, { filled: number; total: number }> = {};
    for (const r of filtered) {
      if (!symbolStats[r.symbol]) {
        symbolStats[r.symbol] = { filled: 0, total: 0 };
      }
      symbolStats[r.symbol].total++;
      if (r.status === 'FILLED') {
        symbolStats[r.symbol].filled++;
      }
    }
    const fillRateBySymbol: Record<string, number> = {};
    for (const [symbol, stats] of Object.entries(symbolStats)) {
      fillRateBySymbol[symbol] = stats.total > 0 ? stats.filled / stats.total : 0;
    }

    // Fill rate by exchange
    const exchangeStats: Record<string, { filled: number; total: number }> = {};
    for (const r of filtered) {
      if (!exchangeStats[r.exchange]) {
        exchangeStats[r.exchange] = { filled: 0, total: 0 };
      }
      exchangeStats[r.exchange].total++;
      if (r.status === 'FILLED') {
        exchangeStats[r.exchange].filled++;
      }
    }
    const fillRateByExchange: Record<string, number> = {};
    for (const [exchange, stats] of Object.entries(exchangeStats)) {
      fillRateByExchange[exchange] = stats.total > 0 ? stats.filled / stats.total : 0;
    }

    // Time-weighted average fill ratio
    const now = Date.now();
    const twaFillRatio =
      totalOrders > 0
        ? filtered.reduce((sum, r) => {
            const age = now - r.createdAt.getTime();
            const weight = 1 / (1 + age / 3600000); // Decay over hours
            return sum + r.fillRatio * weight;
          }, 0) /
          filtered.reduce((sum, r) => {
            const age = now - r.createdAt.getTime();
            const weight = 1 / (1 + age / 3600000);
            return sum + weight;
          }, 0)
        : 0;

    return {
      totalOrders,
      fullyFilled,
      partiallyFilled,
      cancelled,
      avgFillRatio,
      avgFillTime,
      avgSlippage,
      fillRateBySymbol,
      fillRateByExchange,
      twaFillRatio,
    };
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): OrderFillRecord | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get orders by master trader ID
   */
  getOrdersByMasterTrader(masterTraderId: string): OrderFillRecord[] {
    const orderIds = this.masterOrders.get(masterTraderId) || [];
    return orderIds
      .map((id) => this.orders.get(id))
      .filter((r): r is OrderFillRecord => r !== undefined);
  }

  /**
   * Get orders by follower ID
   */
  getOrdersByFollower(followerId: string): OrderFillRecord[] {
    const orderIds = this.followerOrders.get(followerId) || [];
    return orderIds
      .map((id) => this.orders.get(id))
      .filter((r): r is OrderFillRecord => r !== undefined);
  }

  /**
   * Get pending orders (not fully filled)
   */
  getPendingOrders(): OrderFillRecord[] {
    return Array.from(this.orders.values()).filter(
      (r) => r.status === 'PENDING' || r.status === 'PARTIALLY_FILLED'
    );
  }

  /**
   * Clean up old records
   */
  cleanup(maxAge: number = 86400000): number {
    const cutoff = new Date(Date.now() - maxAge);
    let removed = 0;

    for (const [id, record] of this.orders) {
      if (record.updatedAt < cutoff) {
        this.orders.delete(id);
        removed++;

        // Remove from indexes
        const masterOrders = this.masterOrders.get(record.masterTraderId) || [];
        this.masterOrders.set(
          record.masterTraderId,
          masterOrders.filter((oid) => oid !== id)
        );

        const followerOrders = this.followerOrders.get(record.followerId) || [];
        this.followerOrders.set(
          record.followerId,
          followerOrders.filter((oid) => oid !== id)
        );
      }
    }

    return removed;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FillRatioConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FillRatioConfig {
    return { ...this.config };
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create a fill ratio tracker instance
 */
export function createFillRatioTracker(
  config: Partial<FillRatioConfig> = {}
): FillRatioTracker {
  return new FillRatioTracker(config);
}

/**
 * Calculate fill ratio from quantities
 */
export function calculateFillRatio(
  filled: number,
  original: number
): number {
  return original > 0 ? filled / original : 0;
}

/**
 * Check if fill ratio meets minimum threshold
 */
export function isFillRatioAcceptable(
  fillRatio: number,
  minThreshold: number = 0.5
): boolean {
  return fillRatio >= minThreshold;
}

// ==================== SINGLETON INSTANCE ====================

let defaultTracker: FillRatioTracker | null = null;

export function getDefaultFillRatioTracker(): FillRatioTracker {
  if (!defaultTracker) {
    defaultTracker = new FillRatioTracker();
  }
  return defaultTracker;
}

export function setDefaultFillRatioTracker(tracker: FillRatioTracker): void {
  defaultTracker = tracker;
}
