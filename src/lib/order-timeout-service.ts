/**
 * Order Timeout Service for CITARION Trading Platform
 * 
 * Tracks pending orders with expiration times and automatically cancels
 * orders that exceed their TTL (Time-To-Live).
 * 
 * Features:
 * - Background process checking for timed-out orders
 * - Configurable check intervals and TTL values
 * - Event callbacks for timeout, cancellation, and error handling
 * - Metrics tracking for monitoring
 * - Support for different timeout values per order type
 * 
 * Usage:
 * ```typescript
 * const timeoutService = new OrderTimeoutService({
 *   checkIntervalMs: 30000, // 30 seconds
 *   defaultTtlMs: 60000,    // 60 seconds
 * });
 * 
 * // Set up callbacks
 * timeoutService.onOrderTimeout(async (order) => {
 *   console.log('Order timed out:', order.orderId);
 *   // Handle timeout (e.g., cancel on exchange)
 * });
 * 
 * // Start the service
 * timeoutService.start();
 * 
 * // Track an order
 * timeoutService.trackOrder({
 *   orderId: 'order-123',
 *   symbol: 'BTCUSDT',
 *   side: 'BUY',
 *   quantity: 0.1,
 *   orderType: 'LIMIT',
 *   ttlMs: 120000, // Custom TTL of 2 minutes
 * });
 * ```
 */

// ==================== TYPES ====================

/**
 * Order types supported by the timeout service
 */
export type OrderType = 
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_MARKET'
  | 'STOP_LIMIT'
  | 'TRAILING_STOP'
  | 'TAKE_PROFIT'
  | 'OCO';

/**
 * Status of a tracked order
 */
export type TrackedOrderStatus = 
  | 'PENDING'      // Order is being tracked and waiting for fill/timeout
  | 'FILLED'       // Order was filled before timeout
  | 'TIMED_OUT'    // Order exceeded TTL and was cancelled
  | 'CANCELLED'    // Order was manually cancelled
  | 'REJECTED'     // Order was rejected by exchange
  | 'ERROR';       // Error occurred during processing

/**
 * Tracked order data structure
 */
export interface TrackedOrder {
  /** Unique order identifier */
  orderId: string;
  /** Exchange-assigned order ID (if available) */
  exchangeOrderId?: string;
  /** Client-provided order ID */
  clientOrderId?: string;
  /** Trading symbol */
  symbol: string;
  /** Order side */
  side: 'BUY' | 'SELL';
  /** Order quantity */
  quantity: number;
  /** Order type */
  orderType: OrderType;
  /** Exchange where the order was placed */
  exchange?: string;
  /** Limit price (for limit orders) */
  limitPrice?: number;
  /** Stop price (for stop orders) */
  stopPrice?: number;
  /** Position side (for hedge mode) */
  positionSide?: 'LONG' | 'SHORT' | 'BOTH';
  /** Reduce only flag */
  reduceOnly?: boolean;
  /** Custom TTL for this order (overrides default) */
  ttlMs?: number;
  /** Time when the order was created/tracked */
  createdAt: Date;
  /** Time when the order will expire */
  expiresAt: Date;
  /** Current status of the order */
  status: TrackedOrderStatus;
  /** Number of timeout check cycles this order has survived */
  checkCycles: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Signal ID that triggered this order (if applicable) */
  signalId?: number;
  /** Position ID this order is associated with */
  positionId?: string;
  /** Bot ID that created this order */
  botId?: string;
  /** Strategy name that created this order */
  strategy?: string;
}

/**
 * Order to track (input for trackOrder method)
 */
export interface OrderToTrack {
  orderId: string;
  exchangeOrderId?: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  orderType: OrderType;
  exchange?: string;
  limitPrice?: number;
  stopPrice?: number;
  positionSide?: 'LONG' | 'SHORT' | 'BOTH';
  reduceOnly?: boolean;
  ttlMs?: number;
  metadata?: Record<string, unknown>;
  signalId?: number;
  positionId?: string;
  botId?: string;
  strategy?: string;
}

/**
 * Result of a timeout check cycle
 */
export interface TimeoutCheckResult {
  /** Timestamp of the check */
  timestamp: Date;
  /** Number of orders checked */
  ordersChecked: number;
  /** Number of orders that timed out */
  ordersTimedOut: number;
  /** Number of errors during processing */
  errors: number;
  /** Orders that timed out (with details) */
  timedOutOrders: TrackedOrder[];
  /** Errors that occurred */
  errorDetails: Array<{ orderId: string; error: Error }>;
  /** Duration of the check cycle in ms */
  durationMs: number;
}

/**
 * Metrics for the timeout service
 */
export interface TimeoutServiceMetrics {
  /** Total orders tracked since service started */
  totalTracked: number;
  /** Total orders that have timed out */
  totalTimedOut: number;
  /** Total orders manually cancelled */
  totalCancelled: number;
  /** Total orders filled before timeout */
  totalFilled: number;
  /** Total orders rejected */
  totalRejected: number;
  /** Total errors during processing */
  totalErrors: number;
  /** Current number of pending orders being tracked */
  currentPending: number;
  /** Total timeout check cycles run */
  totalCheckCycles: number;
  /** Average time per check cycle in ms */
  avgCheckCycleMs: number;
  /** Service uptime in ms */
  uptimeMs: number;
}

/**
 * Callback function types
 */
export type OrderTimeoutCallback = (order: TrackedOrder) => Promise<void> | void;
export type OrderCancelledCallback = (order: TrackedOrder, reason: string) => Promise<void> | void;
export type ErrorCallback = (error: Error, orderId?: string) => Promise<void> | void;

/**
 * Configuration for the OrderTimeoutService
 */
export interface OrderTimeoutServiceConfig {
  /** Interval between timeout checks in ms (default: 30000) */
  checkIntervalMs?: number;
  /** Default TTL for orders in ms (default: 60000) */
  defaultTtlMs?: number;
  /** Custom TTL values per order type */
  ttlByOrderType?: Partial<Record<OrderType, number>>;
  /** Maximum number of orders to track */
  maxTrackedOrders?: number;
  /** Whether to auto-start the service on creation */
  autoStart?: boolean;
  /** Whether to log timeout events */
  enableLogging?: boolean;
  /** Custom logger function */
  logger?: (message: string, data?: unknown) => void;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Omit<OrderTimeoutServiceConfig, 'ttlByOrderType' | 'logger'>> & {
  ttlByOrderType: Partial<Record<OrderType, number>>;
} = {
  checkIntervalMs: 30000,     // 30 seconds
  defaultTtlMs: 60000,        // 60 seconds
  maxTrackedOrders: 10000,
  autoStart: false,
  enableLogging: true,
  ttlByOrderType: {
    MARKET: 30000,            // 30 seconds - market orders should execute quickly
    LIMIT: 300000,            // 5 minutes - limit orders need more time
    STOP_MARKET: 600000,      // 10 minutes - stop orders wait for trigger
    STOP_LIMIT: 600000,       // 10 minutes
    TRAILING_STOP: 900000,    // 15 minutes - trailing stops can take longer
    TAKE_PROFIT: 600000,      // 10 minutes
    OCO: 600000,              // 10 minutes
  },
};

// ==================== ORDER TIMEOUT SERVICE CLASS ====================

/**
 * Order Timeout Service
 * 
 * Manages order timeouts for the CITARION trading platform.
 * Tracks pending orders and automatically cancels those that exceed their TTL.
 */
export class OrderTimeoutService {
  /** Map of tracked orders (orderId -> TrackedOrder) */
  private orders: Map<string, TrackedOrder> = new Map();
  
  /** Map of orders by clientOrderId for quick lookup */
  private clientOrderIndex: Map<string, string> = new Map();
  
  /** Configuration */
  private config: Required<Omit<OrderTimeoutServiceConfig, 'logger'>> & {
    ttlByOrderType: Partial<Record<OrderType, number>>;
    logger?: (message: string, data?: unknown) => void;
  };
  
  /** Timer handle for the background check interval */
  private checkTimer: NodeJS.Timeout | null = null;
  
  /** Flag indicating if the service is running */
  private isRunning: boolean = false;
  
  /** Service start time */
  private startTime: Date | null = null;
  
  /** Metrics */
  private metrics: TimeoutServiceMetrics = {
    totalTracked: 0,
    totalTimedOut: 0,
    totalCancelled: 0,
    totalFilled: 0,
    totalRejected: 0,
    totalErrors: 0,
    currentPending: 0,
    totalCheckCycles: 0,
    avgCheckCycleMs: 0,
    uptimeMs: 0,
  };
  
  /** Running total of check cycle durations for averaging */
  private checkCycleDurations: number[] = [];
  
  /** Callback handlers */
  private onOrderTimeoutCallback: OrderTimeoutCallback | null = null;
  private onOrderCancelledCallback: OrderCancelledCallback | null = null;
  private onErrorCallback: ErrorCallback | null = null;
  
  /** Promise tracking the current check cycle */
  private currentCheckPromise: Promise<TimeoutCheckResult> | null = null;

  constructor(config: OrderTimeoutServiceConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      ttlByOrderType: {
        ...DEFAULT_CONFIG.ttlByOrderType,
        ...config.ttlByOrderType,
      },
    };
    
    if (this.config.autoStart) {
      this.start();
    }
  }

  // ==================== PUBLIC METHODS ====================

  /**
   * Start the timeout checking background process
   */
  start(): void {
    if (this.isRunning) {
      this.log('OrderTimeoutService is already running');
      return;
    }
    
    this.isRunning = true;
    this.startTime = new Date();
    
    // Start the periodic check timer
    this.checkTimer = setInterval(() => {
      this.runCheckCycle().catch((error) => {
        this.handleError(error, undefined);
      });
    }, this.config.checkIntervalMs);
    
    // Prevent the timer from keeping the process alive
    if (this.checkTimer.unref) {
      this.checkTimer.unref();
    }
    
    this.log('OrderTimeoutService started', {
      checkIntervalMs: this.config.checkIntervalMs,
      defaultTtlMs: this.config.defaultTtlMs,
    });
  }

  /**
   * Stop the timeout checking background process
   */
  stop(): void {
    if (!this.isRunning) {
      this.log('OrderTimeoutService is not running');
      return;
    }
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    
    this.isRunning = false;
    this.log('OrderTimeoutService stopped', {
      uptimeMs: this.getMetrics().uptimeMs,
      finalMetrics: this.getMetrics(),
    });
  }

  /**
   * Track a new order for timeout monitoring
   * 
   * @param order The order to track
   * @returns The tracked order with computed expiration time
   */
  trackOrder(order: OrderToTrack): TrackedOrder {
    // Check max limit
    if (this.orders.size >= this.config.maxTrackedOrders) {
      const error = new Error(
        `Maximum tracked orders limit reached (${this.config.maxTrackedOrders})`
      );
      this.handleError(error, order.orderId);
      throw error;
    }
    
    // Calculate TTL
    const ttlMs = order.ttlMs ?? 
      this.config.ttlByOrderType[order.orderType] ?? 
      this.config.defaultTtlMs;
    
    const now = new Date();
    const trackedOrder: TrackedOrder = {
      ...order,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      status: 'PENDING',
      checkCycles: 0,
      ttlMs,
    };
    
    // Add to main map
    this.orders.set(order.orderId, trackedOrder);
    
    // Add to client order index if clientOrderId exists
    if (order.clientOrderId) {
      this.clientOrderIndex.set(order.clientOrderId, order.orderId);
    }
    
    // Update metrics
    this.metrics.totalTracked++;
    this.metrics.currentPending = this.orders.size;
    
    this.log('Order tracked', {
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      orderType: order.orderType,
      ttlMs,
      expiresAt: trackedOrder.expiresAt,
    });
    
    return trackedOrder;
  }

  /**
   * Manually cancel an order (removes from tracking)
   * 
   * @param orderId The order ID to cancel
   * @param reason The reason for cancellation
   * @returns True if the order was cancelled, false if not found
   */
  async cancelOrder(orderId: string, reason: string = 'Manual cancellation'): Promise<boolean> {
    const order = this.orders.get(orderId);
    
    if (!order) {
      this.log('Attempted to cancel non-existent order', { orderId });
      return false;
    }
    
    // Update order status
    order.status = 'CANCELLED';
    
    // Remove from tracking
    this.orders.delete(orderId);
    if (order.clientOrderId) {
      this.clientOrderIndex.delete(order.clientOrderId);
    }
    
    // Update metrics
    this.metrics.totalCancelled++;
    this.metrics.currentPending = this.orders.size;
    
    this.log('Order cancelled', {
      orderId,
      reason,
      trackedDurationMs: Date.now() - order.createdAt.getTime(),
    });
    
    // Invoke callback
    if (this.onOrderCancelledCallback) {
      try {
        await this.onOrderCancelledCallback(order, reason);
      } catch (error) {
        this.handleError(
          error instanceof Error ? error : new Error(String(error)),
          orderId
        );
      }
    }
    
    return true;
  }

  /**
   * Get the current status of an order
   * 
   * @param orderId The order ID to check
   * @returns The tracked order or undefined if not found
   */
  getOrderStatus(orderId: string): TrackedOrder | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get order by client order ID
   * 
   * @param clientOrderId The client order ID
   * @returns The tracked order or undefined if not found
   */
  getOrderByClientId(clientOrderId: string): TrackedOrder | undefined {
    const orderId = this.clientOrderIndex.get(clientOrderId);
    if (!orderId) return undefined;
    return this.orders.get(orderId);
  }

  /**
   * Mark an order as filled (removes from tracking)
   * 
   * @param orderId The order ID to mark as filled
   * @returns True if successful, false if not found
   */
  markOrderFilled(orderId: string): boolean {
    const order = this.orders.get(orderId);
    
    if (!order) {
      return false;
    }
    
    order.status = 'FILLED';
    this.orders.delete(orderId);
    if (order.clientOrderId) {
      this.clientOrderIndex.delete(order.clientOrderId);
    }
    
    this.metrics.totalFilled++;
    this.metrics.currentPending = this.orders.size;
    
    this.log('Order filled', {
      orderId,
      trackedDurationMs: Date.now() - order.createdAt.getTime(),
    });
    
    return true;
  }

  /**
   * Mark an order as rejected (removes from tracking)
   * 
   * @param orderId The order ID to mark as rejected
   * @returns True if successful, false if not found
   */
  markOrderRejected(orderId: string): boolean {
    const order = this.orders.get(orderId);
    
    if (!order) {
      return false;
    }
    
    order.status = 'REJECTED';
    this.orders.delete(orderId);
    if (order.clientOrderId) {
      this.clientOrderIndex.delete(order.clientOrderId);
    }
    
    this.metrics.totalRejected++;
    this.metrics.currentPending = this.orders.size;
    
    this.log('Order rejected', {
      orderId,
      trackedDurationMs: Date.now() - order.createdAt.getTime(),
    });
    
    return true;
  }

  /**
   * Update the exchange order ID for a tracked order
   * 
   * @param orderId The internal order ID
   * @param exchangeOrderId The exchange-assigned order ID
   * @returns True if successful, false if not found
   */
  updateExchangeOrderId(orderId: string, exchangeOrderId: string): boolean {
    const order = this.orders.get(orderId);
    
    if (!order) {
      return false;
    }
    
    order.exchangeOrderId = exchangeOrderId;
    this.log('Exchange order ID updated', { orderId, exchangeOrderId });
    return true;
  }

  /**
   * Get current metrics
   */
  getMetrics(): TimeoutServiceMetrics {
    return {
      ...this.metrics,
      currentPending: this.orders.size,
      uptimeMs: this.startTime ? Date.now() - this.startTime.getTime() : 0,
    };
  }

  /**
   * Get all pending orders
   */
  getPendingOrders(): TrackedOrder[] {
    return Array.from(this.orders.values()).filter(
      (order) => order.status === 'PENDING'
    );
  }

  /**
   * Get orders that are about to expire (within threshold)
   * 
   * @param thresholdMs Threshold in milliseconds
   * @returns Orders expiring within the threshold
   */
  getExpiringOrders(thresholdMs: number = 10000): TrackedOrder[] {
    const now = Date.now();
    return Array.from(this.orders.values()).filter((order) => {
      const timeUntilExpiry = order.expiresAt.getTime() - now;
      return timeUntilExpiry > 0 && timeUntilExpiry <= thresholdMs;
    });
  }

  /**
   * Check if the service is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get the number of currently tracked orders
   */
  get size(): number {
    return this.orders.size;
  }

  // ==================== CALLBACK SETTERS ====================

  /**
   * Set the callback for when an order times out
   */
  onOrderTimeout(callback: OrderTimeoutCallback): void {
    this.onOrderTimeoutCallback = callback;
  }

  /**
   * Set the callback for when an order is cancelled
   */
  onOrderCancelled(callback: OrderCancelledCallback): void {
    this.onOrderCancelledCallback = callback;
  }

  /**
   * Set the callback for error handling
   */
  onError(callback: ErrorCallback): void {
    this.onErrorCallback = callback;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Run a timeout check cycle
   */
  private async runCheckCycle(): Promise<TimeoutCheckResult> {
    const startTime = Date.now();
    const result: TimeoutCheckResult = {
      timestamp: new Date(),
      ordersChecked: 0,
      ordersTimedOut: 0,
      errors: 0,
      timedOutOrders: [],
      errorDetails: [],
      durationMs: 0,
    };
    
    const now = Date.now();
    const ordersToTimeout: TrackedOrder[] = [];
    
    // Find timed-out orders
    for (const order of Array.from(this.orders.values())) {
      if (order.status !== 'PENDING') continue;
      
      result.ordersChecked++;
      order.checkCycles++;
      
      if (order.expiresAt.getTime() <= now) {
        ordersToTimeout.push(order);
      }
    }
    
    // Process timed-out orders
    for (const order of ordersToTimeout) {
      try {
        await this.processTimeout(order);
        result.ordersTimedOut++;
        result.timedOutOrders.push(order);
      } catch (error) {
        result.errors++;
        result.errorDetails.push({
          orderId: order.orderId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        this.metrics.totalErrors++;
        this.handleError(
          error instanceof Error ? error : new Error(String(error)),
          order.orderId
        );
      }
    }
    
    // Update metrics
    result.durationMs = Date.now() - startTime;
    this.metrics.totalCheckCycles++;
    this.checkCycleDurations.push(result.durationMs);
    
    // Keep only last 100 durations for averaging
    if (this.checkCycleDurations.length > 100) {
      this.checkCycleDurations = this.checkCycleDurations.slice(-100);
    }
    
    this.metrics.avgCheckCycleMs = 
      this.checkCycleDurations.reduce((a, b) => a + b, 0) / 
      this.checkCycleDurations.length;
    
    if (result.ordersTimedOut > 0 || result.errors > 0) {
      this.log('Check cycle completed', result);
    }
    
    return result;
  }

  /**
   * Process a timed-out order
   */
  private async processTimeout(order: TrackedOrder): Promise<void> {
    // Update order status
    order.status = 'TIMED_OUT';
    
    // Remove from tracking
    this.orders.delete(order.orderId);
    if (order.clientOrderId) {
      this.clientOrderIndex.delete(order.clientOrderId);
    }
    
    // Update metrics
    this.metrics.totalTimedOut++;
    this.metrics.currentPending = this.orders.size;
    
    this.log('Order timed out', {
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      orderType: order.orderType,
      ttlMs: order.ttlMs,
      checkCycles: order.checkCycles,
      trackedDurationMs: Date.now() - order.createdAt.getTime(),
    });
    
    // Invoke timeout callback
    if (this.onOrderTimeoutCallback) {
      await this.onOrderTimeoutCallback(order);
    }
  }

  /**
   * Handle an error
   */
  private handleError(error: Error, orderId?: string): void {
    this.log('Error occurred', {
      orderId,
      error: error.message,
      stack: error.stack,
    });
    
    if (this.onErrorCallback) {
      // Don't await - error handlers should be fire-and-forget
      Promise.resolve(this.onErrorCallback(error, orderId)).catch((e) => {
        console.error('Error in error callback:', e);
      });
    }
  }

  /**
   * Log a message
   */
  private log(message: string, data?: unknown): void {
    if (!this.config.enableLogging) return;
    
    if (this.config.logger) {
      this.config.logger(message, data);
    } else {
      console.log(`[OrderTimeoutService] ${message}`, data ?? '');
    }
  }
}

// ==================== SINGLETON INSTANCE ====================

let defaultInstance: OrderTimeoutService | null = null;

/**
 * Get the default singleton instance of OrderTimeoutService
 */
export function getOrderTimeoutService(
  config?: OrderTimeoutServiceConfig
): OrderTimeoutService {
  if (!defaultInstance) {
    defaultInstance = new OrderTimeoutService(config);
  }
  return defaultInstance;
}

/**
 * Initialize the default singleton with custom config
 */
export function initOrderTimeoutService(
  config?: OrderTimeoutServiceConfig
): OrderTimeoutService {
  if (defaultInstance) {
    defaultInstance.stop();
  }
  defaultInstance = new OrderTimeoutService(config);
  return defaultInstance;
}

/**
 * Reset the singleton instance (mainly for testing)
 */
export function resetOrderTimeoutService(): void {
  if (defaultInstance) {
    defaultInstance.stop();
    defaultInstance = null;
  }
}
