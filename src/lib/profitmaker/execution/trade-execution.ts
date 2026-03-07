/**
 * Trade Execution Engine
 * 
 * Based on Profitmaker's trade execution patterns.
 * Provides reliable order execution with:
 * - Exponential backoff retry logic
 * - Order status tracking
 * - Position management
 * - Smart order routing
 */

// ==================== Types ====================

export interface OrderRequest {
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop_market' | 'stop_limit' | 'take_profit';
  amount: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX';
  clientOrderId?: string;
}

export interface OrderResult {
  orderId: string;
  clientOrderId?: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  status: OrderStatus;
  amount: number;
  filled: number;
  price?: number;
  avgPrice?: number;
  fee: number;
  feeCurrency: string;
  createdAt: number;
  updatedAt: number;
}

export type OrderStatus = 
  | 'pending'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired';

export interface Position {
  id: string;
  exchange: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  leverage: number;
  liquidationPrice?: number;
  margin: number;
  openedAt: number;
  updatedAt: number;
}

export interface ExecutionConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  timeout: number;
  enableSmartRouting: boolean;
  enablePositionSync: boolean;
}

export interface ExecutionStats {
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  totalRetries: number;
  averageLatency: number;
  successRate: number;
}

// ==================== Retry Logic ====================

/**
 * Exponential backoff with jitter
 */
function calculateBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitter: boolean = true
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  if (jitter) {
    // Add random jitter to prevent thundering herd
    const jitterRange = cappedDelay * 0.3;
    return cappedDelay + (Math.random() * jitterRange - jitterRange / 2);
  }
  
  return cappedDelay;
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Network errors
  if (message.includes('timeout') || 
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('network')) {
    return true;
  }
  
  // Rate limits
  if (message.includes('rate limit') || 
      message.includes('429') ||
      message.includes('too many requests')) {
    return true;
  }
  
  // Server errors
  if (message.includes('500') || 
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')) {
    return true;
  }
  
  // Service unavailable
  if (message.includes('service unavailable') ||
      message.includes('maintenance')) {
    return true;
  }

  return false;
}

/**
 * Determine if error is permanent
 */
function isPermanentError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Authentication errors
  if (message.includes('401') ||
      message.includes('403') ||
      message.includes('invalid api key') ||
      message.includes('signature')) {
    return true;
  }
  
  // Order errors
  if (message.includes('insufficient') ||
      message.includes('insufficient balance') ||
      message.includes('insufficient margin') ||
      message.includes('insufficient funds')) {
    return true;
  }
  
  // Invalid parameters
  if (message.includes('invalid') ||
      message.includes('bad request') ||
      message.includes('400')) {
    return true;
  }
  
  // Order rejected
  if (message.includes('rejected') ||
      message.includes('would trigger')) {
    return true;
  }

  return false;
}

// ==================== Order Status Tracker ====================

/**
 * Tracks order status and maintains order history
 */
export class OrderStatusTracker {
  private orders: Map<string, OrderResult> = new Map();
  private clientOrderIdMap: Map<string, string> = new Map();
  private exchangeOrderMap: Map<string, Set<string>> = new Map();

  /**
   * Add or update order
   */
  updateOrder(order: OrderResult): void {
    this.orders.set(order.orderId, order);
    
    if (order.clientOrderId) {
      this.clientOrderIdMap.set(order.clientOrderId, order.orderId);
    }
    
    const exchangeKey = `${order.exchange}:${order.symbol}`;
    if (!this.exchangeOrderMap.has(exchangeKey)) {
      this.exchangeOrderMap.set(exchangeKey, new Set());
    }
    this.exchangeOrderMap.get(exchangeKey)!.add(order.orderId);
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): OrderResult | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get order by client order ID
   */
  getOrderByClientId(clientOrderId: string): OrderResult | undefined {
    const orderId = this.clientOrderIdMap.get(clientOrderId);
    return orderId ? this.orders.get(orderId) : undefined;
  }

  /**
   * Get orders by exchange and symbol
   */
  getOrdersBySymbol(exchange: string, symbol: string): OrderResult[] {
    const exchangeKey = `${exchange}:${symbol}`;
    const orderIds = this.exchangeOrderMap.get(exchangeKey);
    
    if (!orderIds) return [];
    
    return Array.from(orderIds)
      .map(id => this.orders.get(id))
      .filter((o): o is OrderResult => o !== undefined);
  }

  /**
   * Get open orders
   */
  getOpenOrders(exchange?: string, symbol?: string): OrderResult[] {
    const orders = exchange && symbol
      ? this.getOrdersBySymbol(exchange, symbol)
      : Array.from(this.orders.values());
    
    return orders.filter(o => 
      o.status === 'open' || o.status === 'partially_filled'
    );
  }

  /**
   * Remove old orders
   */
  cleanup(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    let removed = 0;
    
    for (const [id, order] of this.orders) {
      if (order.updatedAt < cutoff && 
          (order.status === 'filled' || 
           order.status === 'cancelled' ||
           order.status === 'rejected')) {
        this.orders.delete(id);
        
        if (order.clientOrderId) {
          this.clientOrderIdMap.delete(order.clientOrderId);
        }
        
        const exchangeKey = `${order.exchange}:${order.symbol}`;
        this.exchangeOrderMap.get(exchangeKey)?.delete(id);
        
        removed++;
      }
    }
    
    return removed;
  }
}

// ==================== Position Manager ====================

/**
 * Manages trading positions
 */
export class PositionManager {
  private positions: Map<string, Position> = new Map();
  private positionHistory: Position[] = [];

  /**
   * Update or create position
   */
  updatePosition(
    exchange: string,
    symbol: string,
    side: 'long' | 'short',
    size: number,
    entryPrice: number,
    leverage: number = 1
  ): Position {
    const key = `${exchange}:${symbol}:${side}`;
    
    let position = this.positions.get(key);
    
    if (!position || size === 0) {
      // Create new position or close existing
      if (size === 0 && position) {
        // Archive closed position
        this.positionHistory.push(position);
        this.positions.delete(key);
        return position;
      }
      
      position = {
        id: `${exchange}_${symbol}_${side}_${Date.now()}`,
        exchange,
        symbol,
        side,
        size,
        entryPrice,
        markPrice: entryPrice,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        leverage,
        margin: (size * entryPrice) / leverage,
        openedAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      // Update existing position
      const totalValue = position.size * position.entryPrice + size * entryPrice;
      const totalSize = position.size + size;
      
      position.entryPrice = totalSize > 0 ? totalValue / totalSize : entryPrice;
      position.size = Math.abs(totalSize);
      position.side = totalSize >= 0 ? 'long' : 'short';
      position.updatedAt = Date.now();
    }
    
    this.positions.set(key, position);
    return position;
  }

  /**
   * Update mark price and calculate PnL
   */
  updateMarkPrice(exchange: string, symbol: string, markPrice: number): void {
    for (const [key, position] of this.positions) {
      if (key.startsWith(`${exchange}:${symbol}:`)) {
        position.markPrice = markPrice;
        
        if (position.side === 'long') {
          position.unrealizedPnl = (markPrice - position.entryPrice) * position.size;
        } else {
          position.unrealizedPnl = (position.entryPrice - markPrice) * position.size;
        }
        
        position.unrealizedPnlPercent = (position.unrealizedPnl / (position.entryPrice * position.size)) * 100;
        position.updatedAt = Date.now();
      }
    }
  }

  /**
   * Get position
   */
  getPosition(exchange: string, symbol: string, side?: 'long' | 'short'): Position | undefined {
    if (side) {
      return this.positions.get(`${exchange}:${symbol}:${side}`);
    }
    
    // Return any position for symbol
    for (const [key, position] of this.positions) {
      if (key.startsWith(`${exchange}:${symbol}:`)) {
        return position;
      }
    }
    
    return undefined;
  }

  /**
   * Get all positions
   */
  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get total unrealized PnL
   */
  getTotalUnrealizedPnl(): number {
    return Array.from(this.positions.values())
      .reduce((sum, p) => sum + p.unrealizedPnl, 0);
  }
}

// ==================== Trade Execution Engine ====================

/**
 * Main execution engine with retry logic
 */
export class TradeExecutionEngine {
  private orderTracker: OrderStatusTracker;
  private positionManager: PositionManager;
  private stats: ExecutionStats = {
    totalOrders: 0,
    successfulOrders: 0,
    failedOrders: 0,
    totalRetries: 0,
    averageLatency: 0,
    successRate: 0,
  };
  private latencies: number[] = [];

  constructor(
    private config: ExecutionConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      timeout: 30000,
      enableSmartRouting: false,
      enablePositionSync: true,
    }
  ) {
    this.orderTracker = new OrderStatusTracker();
    this.positionManager = new PositionManager();
  }

  /**
   * Execute order with retry logic
   */
  async executeOrder(
    request: OrderRequest,
    executor: (req: OrderRequest) => Promise<OrderResult>
  ): Promise<OrderResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempts = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      attempts = attempt + 1;
      
      try {
        this.stats.totalOrders++;
        
        // Add client order ID if not provided
        if (!request.clientOrderId) {
          request.clientOrderId = this.generateClientOrderId();
        }

        // Execute with timeout
        const result = await this.executeWithTimeout(
          executor(request),
          this.config.timeout
        );

        // Track order
        this.orderTracker.updateOrder(result);
        
        // Update position
        if (this.config.enablePositionSync) {
          this.syncPosition(result);
        }

        // Update stats
        const latency = Date.now() - startTime;
        this.latencies.push(latency);
        if (this.latencies.length > 100) {
          this.latencies.shift();
        }
        
        this.stats.successfulOrders++;
        this.stats.averageLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
        this.stats.successRate = (this.stats.successfulOrders / this.stats.totalOrders) * 100;
        this.stats.totalRetries += attempt;

        return result;
        
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if permanent error
        if (isPermanentError(lastError)) {
          this.stats.failedOrders++;
          this.stats.successRate = (this.stats.successfulOrders / this.stats.totalOrders) * 100;
          throw lastError;
        }
        
        // Check if should retry
        if (!isRetryableError(lastError) || attempt === this.config.maxRetries) {
          this.stats.failedOrders++;
          this.stats.successRate = (this.stats.successfulOrders / this.stats.totalOrders) * 100;
          throw lastError;
        }
        
        // Wait before retry
        const delay = calculateBackoff(
          attempt,
          this.config.baseDelay,
          this.config.maxDelay
        );
        
        await this.sleep(delay);
      }
    }

    this.stats.failedOrders++;
    this.stats.successRate = (this.stats.successfulOrders / this.stats.totalOrders) * 100;
    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Cancel order with retry
   */
  async cancelOrder(
    exchange: string,
    orderId: string,
    canceller: (exchange: string, orderId: string) => Promise<boolean>
  ): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await canceller(exchange, orderId);
        
        // Update order status
        const order = this.orderTracker.getOrder(orderId);
        if (order) {
          order.status = 'cancelled';
          order.updatedAt = Date.now();
          this.orderTracker.updateOrder(order);
        }
        
        return result;
        
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (isPermanentError(lastError) || attempt === this.config.maxRetries) {
          throw lastError;
        }
        
        const delay = calculateBackoff(attempt, this.config.baseDelay, this.config.maxDelay);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Cancel failed');
  }

  /**
   * Batch execute orders
   */
  async executeBatch(
    requests: OrderRequest[],
    executor: (req: OrderRequest) => Promise<OrderResult>
  ): Promise<Map<string, { success: boolean; result?: OrderResult; error?: string }>> {
    const results = new Map<string, { success: boolean; result?: OrderResult; error?: string }>();

    await Promise.all(
      requests.map(async (request) => {
        const key = request.clientOrderId || this.generateClientOrderId();
        
        try {
          const result = await this.executeOrder(
            { ...request, clientOrderId: key },
            executor
          );
          results.set(key, { success: true, result });
        } catch (error: unknown) {
          results.set(key, { 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );

    return results;
  }

  // ==================== Helper Methods ====================

  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeout)
      ),
    ]);
  }

  private generateClientOrderId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private syncPosition(result: OrderResult): void {
    if (result.status === 'filled' || result.status === 'partially_filled') {
      const side = result.side === 'buy' ? 'long' : 'short';
      this.positionManager.updatePosition(
        result.exchange,
        result.symbol,
        side,
        result.filled,
        result.avgPrice || result.price || 0
      );
    }
  }

  // ==================== Getters ====================

  getOrderTracker(): OrderStatusTracker {
    return this.orderTracker;
  }

  getPositionManager(): PositionManager {
    return this.positionManager;
  }

  getStats(): ExecutionStats {
    return { ...this.stats };
  }
}

// ==================== Smart Order Router ====================

/**
 * Routes orders to best exchange based on price and liquidity
 */
export class SmartOrderRouter {
  /**
   * Find best execution path
   */
  findBestExecution(
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    orderBooks: Map<string, { bids: Array<[number, number]>; asks: Array<[number, number]> }>
  ): {
    exchange: string;
    avgPrice: number;
    slippage: number;
    totalCost: number;
  } | null {
    let best: { exchange: string; avgPrice: number; slippage: number; totalCost: number } | null = null;

    for (const [exchange, book] of orderBooks) {
      const levels = side === 'buy' ? book.asks : book.bids;
      const result = this.calculateExecution(levels, amount);

      if (!result) continue;

      if (!best || (side === 'buy' ? result.avgPrice < best.avgPrice : result.avgPrice > best.avgPrice)) {
        best = {
          exchange,
          avgPrice: result.avgPrice,
          slippage: result.slippage,
          totalCost: result.totalCost,
        };
      }
    }

    return best;
  }

  private calculateExecution(
    levels: Array<[number, number]>,
    targetAmount: number
  ): { avgPrice: number; slippage: number; totalCost: number } | null {
    if (!levels.length) return null;

    let remaining = targetAmount;
    let totalCost = 0;
    const startingPrice = levels[0][0];

    for (const [price, amount] of levels) {
      if (remaining <= 0) break;
      
      const fillAmount = Math.min(remaining, amount);
      totalCost += fillAmount * price;
      remaining -= fillAmount;
    }

    if (remaining > 0) {
      // Not enough liquidity
      return null;
    }

    const avgPrice = totalCost / targetAmount;
    const slippage = Math.abs(avgPrice - startingPrice) / startingPrice;

    return { avgPrice, slippage, totalCost };
  }
}

// ==================== Exports ====================

export const tradeExecutionEngine = new TradeExecutionEngine();
export const smartOrderRouter = new SmartOrderRouter();
