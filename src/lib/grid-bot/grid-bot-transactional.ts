/**
 * Grid Bot Transactional Order Manager
 * 
 * Production-ready transactional order placement with:
 * - Batch order support (when exchange supports)
 * - Automatic rollback on failure
 * - Distributed locking for race condition prevention
 * - Order state tracking and recovery
 * 
 * CIT-008: Transactional Grid Bot Implementation
 */

import { EventEmitter } from 'events';
import { acquireBotLock, releaseBotLock, withBotLock } from '@/lib/locks';
import type { GridBotAdapter } from './types';

// ==================== TYPES ====================

export interface GridOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  quantity: number;
  price: number;
  clientOrderId: string;
  levelIndex: number;
}

export interface PlacedOrder {
  orderId: string;
  clientOrderId: string;
  levelIndex: number;
  side: 'BUY' | 'SELL';
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'FAILED';
  price: number;
  quantity: number;
  placedAt: Date;
  exchangeResponse?: unknown;
}

export interface TransactionResult {
  success: boolean;
  placedOrders: PlacedOrder[];
  failedOrders: GridOrderRequest[];
  rolledBackOrders: PlacedOrder[];
  error?: string;
  transactionId: string;
  duration: number;
}

export interface BatchOrderResult {
  success: boolean;
  orders: PlacedOrder[];
  failedRequests: GridOrderRequest[];
  error?: string;
}

export interface TransactionalConfig {
  /** Enable batch orders when exchange supports */
  enableBatchOrders: boolean;
  
  /** Maximum retry attempts for rollback */
  maxRollbackRetries: number;
  
  /** Delay between rollback retries (ms) */
  rollbackRetryDelay: number;
  
  /** Lock TTL for transaction (ms) */
  lockTtl: number;
  
  /** Enable order state persistence */
  persistState: boolean;
  
  /** Timeout for individual order placement (ms) */
  orderTimeout: number;
}

const DEFAULT_CONFIG: TransactionalConfig = {
  enableBatchOrders: true,
  maxRollbackRetries: 3,
  rollbackRetryDelay: 100,
  lockTtl: 30000,
  persistState: true,
  orderTimeout: 10000,
};

// ==================== TRANSACTION STATE ====================

interface TransactionState {
  id: string;
  botId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rolling_back' | 'failed' | 'rolled_back';
  orders: Map<string, PlacedOrder>;
  requests: GridOrderRequest[];
  startTime: number;
  endTime?: number;
  error?: string;
}

// ==================== TRANSACTIONAL ORDER MANAGER ====================

export class GridBotTransactionalManager extends EventEmitter {
  private adapter: GridBotAdapter;
  private botId: string;
  private config: TransactionalConfig;
  private activeTransactions: Map<string, TransactionState> = new Map();
  private orderHistory: PlacedOrder[] = [];

  constructor(
    adapter: GridBotAdapter,
    botId: string,
    config: Partial<TransactionalConfig> = {}
  ) {
    super();
    this.adapter = adapter;
    this.botId = botId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Place all grid orders transactionally
   * Either all succeed, or all are rolled back
   */
  async placeOrdersTransactional(
    requests: GridOrderRequest[]
  ): Promise<TransactionResult> {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();

    // Initialize transaction state
    const state: TransactionState = {
      id: transactionId,
      botId: this.botId,
      status: 'pending',
      orders: new Map(),
      requests,
      startTime,
    };
    this.activeTransactions.set(transactionId, state);

    this.emit('transaction_started', { transactionId, orderCount: requests.length });

    try {
      // Acquire distributed lock
      const lock = await acquireBotLock('grid', this.botId, {
        ttl: this.config.lockTtl,
        holder: `tx_${transactionId}`,
      });

      if (!lock.acquired) {
        throw new Error(`Failed to acquire lock for transaction ${transactionId}`);
      }

      state.status = 'in_progress';

      try {
        // Try batch orders first if supported
        if (this.config.enableBatchOrders && this.supportsBatchOrders()) {
          const batchResult = await this.executeBatchOrders(requests, state);
          
          if (batchResult.success) {
            state.status = 'completed';
            state.endTime = Date.now();
            
            return {
              success: true,
              placedOrders: batchResult.orders,
              failedOrders: [],
              rolledBackOrders: [],
              transactionId,
              duration: state.endTime - startTime,
            };
          }
          
          // If batch failed, fall through to sequential placement
          this.emit('batch_failed', { transactionId, error: batchResult.error });
        }

        // Sequential order placement with tracking
        const result = await this.executeSequentialOrders(requests, state);
        
        if (result.success) {
          state.status = 'completed';
          state.endTime = Date.now();
          
          return {
            success: true,
            placedOrders: result.placedOrders,
            failedOrders: [],
            rolledBackOrders: [],
            transactionId,
            duration: state.endTime - startTime,
          };
        }

        // Some orders failed - need to rollback
        throw new Error(`Order placement failed: ${result.error}`);
        
      } finally {
        // Release lock
        await releaseBotLock('grid', this.botId, lock.holder!);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      state.error = errorMessage;
      state.status = 'rolling_back';

      this.emit('rollback_started', { transactionId, reason: errorMessage });

      // Rollback all placed orders
      const rolledBackOrders = await this.rollbackOrders(state);

      state.status = 'rolled_back';
      state.endTime = Date.now();

      this.emit('transaction_rolled_back', {
        transactionId,
        rolledBackCount: rolledBackOrders.length,
        error: errorMessage,
      });

      return {
        success: false,
        placedOrders: [],
        failedOrders: requests,
        rolledBackOrders,
        error: errorMessage,
        transactionId,
        duration: state.endTime - startTime,
      };
    } finally {
      // Cleanup transaction state after a delay
      setTimeout(() => {
        this.activeTransactions.delete(transactionId);
      }, 60000);
    }
  }

  /**
   * Execute orders as a batch (if exchange supports)
   */
  private async executeBatchOrders(
    requests: GridOrderRequest[],
    state: TransactionState
  ): Promise<BatchOrderResult> {
    try {
      // Check if adapter supports batch orders
      if (typeof (this.adapter as any).placeBatchOrders !== 'function') {
        return {
          success: false,
          orders: [],
          failedRequests: requests,
          error: 'Exchange does not support batch orders',
        };
      }

      // Prepare batch request
      const batchRequest = requests.map(req => ({
        symbol: req.symbol,
        side: req.side,
        type: req.type,
        quantity: req.quantity,
        price: req.price,
        clientOrderId: req.clientOrderId,
      }));

      // Execute batch
      const batchResult = await this.withTimeout(
        (this.adapter as any).placeBatchOrders(batchRequest),
        this.config.orderTimeout * requests.length
      );

      if (!batchResult.success) {
        return {
          success: false,
          orders: [],
          failedRequests: requests,
          error: batchResult.error || 'Batch order failed',
        };
      }

      // Track all placed orders
      const placedOrders: PlacedOrder[] = [];
      for (let i = 0; i < batchResult.orders.length; i++) {
        const exchangeOrder = batchResult.orders[i];
        const request = requests[i];
        
        const placedOrder: PlacedOrder = {
          orderId: exchangeOrder.orderId,
          clientOrderId: request.clientOrderId,
          levelIndex: request.levelIndex,
          side: request.side,
          status: 'PENDING',
          price: request.price,
          quantity: request.quantity,
          placedAt: new Date(),
          exchangeResponse: exchangeOrder,
        };
        
        state.orders.set(placedOrder.orderId, placedOrder);
        placedOrders.push(placedOrder);
        this.orderHistory.push(placedOrder);
      }

      this.emit('batch_orders_placed', {
        transactionId: state.id,
        orderCount: placedOrders.length,
      });

      return {
        success: true,
        orders: placedOrders,
        failedRequests: [],
      };
      
    } catch (error) {
      return {
        success: false,
        orders: [],
        failedRequests: requests,
        error: error instanceof Error ? error.message : 'Batch execution failed',
      };
    }
  }

  /**
   * Execute orders sequentially with rollback on failure
   */
  private async executeSequentialOrders(
    requests: GridOrderRequest[],
    state: TransactionState
  ): Promise<{ success: boolean; placedOrders: PlacedOrder[]; error?: string }> {
    const placedOrders: PlacedOrder[] = [];
    const placedOrderIds: string[] = [];

    for (const request of requests) {
      try {
        const orderResult = await this.withTimeout(
          this.adapter.placeOrder({
            symbol: request.symbol,
            side: request.side,
            type: request.type,
            quantity: request.quantity,
            price: request.price,
            clientOrderId: request.clientOrderId,
          }),
          this.config.orderTimeout
        );

        if (!orderResult.success || !orderResult.order) {
          // Order failed - we'll need to rollback
          return {
            success: false,
            placedOrders,
            error: `Failed to place order for level ${request.levelIndex}: ${orderResult.error || 'Unknown error'}`,
          };
        }

        const placedOrder: PlacedOrder = {
          orderId: orderResult.order.id,
          clientOrderId: request.clientOrderId,
          levelIndex: request.levelIndex,
          side: request.side,
          status: 'PENDING',
          price: request.price,
          quantity: request.quantity,
          placedAt: new Date(),
          exchangeResponse: orderResult.order,
        };

        state.orders.set(placedOrder.orderId, placedOrder);
        placedOrders.push(placedOrder);
        placedOrderIds.push(placedOrder.orderId);
        this.orderHistory.push(placedOrder);

        this.emit('order_placed', {
          transactionId: state.id,
          orderId: placedOrder.orderId,
          levelIndex: request.levelIndex,
        });

      } catch (error) {
        return {
          success: false,
          placedOrders,
          error: `Exception placing order for level ${request.levelIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    }

    return {
      success: true,
      placedOrders,
    };
  }

  /**
   * Rollback all placed orders
   */
  private async rollbackOrders(state: TransactionState): Promise<PlacedOrder[]> {
    const rolledBack: PlacedOrder[] = [];
    const failedToCancel: PlacedOrder[] = [];

    for (const [orderId, order] of state.orders) {
      let cancelled = false;
      let attempts = 0;

      while (!cancelled && attempts < this.config.maxRollbackRetries) {
        attempts++;
        
        try {
          const result = await this.adapter.cancelOrder(orderId);
          
          if (result.success) {
            order.status = 'CANCELLED';
            rolledBack.push(order);
            cancelled = true;
            
            this.emit('order_cancelled', {
              transactionId: state.id,
              orderId,
              levelIndex: order.levelIndex,
            });
          } else {
            // Check if order doesn't exist (already filled/cancelled)
            if (result.error?.includes('not found') || result.error?.includes('does not exist')) {
              order.status = 'CANCELLED';
              rolledBack.push(order);
              cancelled = true;
            } else {
              console.error(
                `[GridBot] Rollback attempt ${attempts} failed for order ${orderId}: ${result.error}`
              );
              await this.delay(this.config.rollbackRetryDelay * attempts);
            }
          }
        } catch (error) {
          console.error(
            `[GridBot] Exception during rollback of order ${orderId}:`,
            error
          );
          await this.delay(this.config.rollbackRetryDelay * attempts);
        }
      }

      if (!cancelled) {
        order.status = 'FAILED';
        failedToCancel.push(order);
        
        this.emit('rollback_failed', {
          transactionId: state.id,
          orderId,
          levelIndex: order.levelIndex,
        });
      }
    }

    // If some orders couldn't be cancelled, escalate
    if (failedToCancel.length > 0) {
      this.emit('rollback_incomplete', {
        transactionId: state.id,
        failedOrders: failedToCancel,
        message: 'Some orders could not be cancelled during rollback. Manual intervention may be required.',
      });
      
      console.error(
        `[GridBot] CRITICAL: ${failedToCancel.length} orders could not be cancelled during rollback:`,
        failedToCancel.map(o => o.orderId)
      );
    }

    return rolledBack;
  }

  /**
   * Cancel specific orders by IDs
   */
  async cancelOrders(orderIds: string[]): Promise<{
    success: boolean;
    cancelled: string[];
    failed: string[];
  }> {
    const cancelled: string[] = [];
    const failed: string[] = [];

    // Use lock to prevent race conditions
    const result = await withBotLock('grid', this.botId, async () => {
      for (const orderId of orderIds) {
        try {
          const cancelResult = await this.adapter.cancelOrder(orderId);
          
          if (cancelResult.success) {
            cancelled.push(orderId);
            
            // Update local state
            const order = Array.from(this.orderHistory).find(o => o.orderId === orderId);
            if (order) {
              order.status = 'CANCELLED';
            }
          } else {
            failed.push(orderId);
          }
        } catch (error) {
          failed.push(orderId);
          console.error(`[GridBot] Error cancelling order ${orderId}:`, error);
        }
      }

      return { cancelled, failed };
    });

    return result.result || { success: false, cancelled, failed };
  }

  /**
   * Get active transaction state
   */
  getTransactionState(transactionId: string): TransactionState | undefined {
    return this.activeTransactions.get(transactionId);
  }

  /**
   * Get order history
   */
  getOrderHistory(limit: number = 100): PlacedOrder[] {
    return this.orderHistory.slice(-limit);
  }

  /**
   * Get pending orders (not filled or cancelled)
   */
  getPendingOrders(): PlacedOrder[] {
    return this.orderHistory.filter(o => o.status === 'PENDING');
  }

  /**
   * Check if exchange supports batch orders
   */
  private supportsBatchOrders(): boolean {
    return typeof (this.adapter as any).placeBatchOrders === 'function';
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `tx_${this.botId}_${timestamp}_${random}`;
  }

  /**
   * Timeout wrapper for promises
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== EXPORTS ====================

export default GridBotTransactionalManager;
