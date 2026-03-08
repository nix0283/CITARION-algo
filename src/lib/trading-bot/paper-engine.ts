/**
 * Paper Trading Engine
 * Simulates exchange behavior for strategy validation
 * 
 * Features:
 * - Realistic order matching
 * - Slippage simulation
 * - Fee calculation
 * - Latency simulation
 * - Balance tracking
 */

import {
  ExchangeId,
  TradeDirection,
  OrderType,
  OrderStatus,
  PositionStatus,
  type Candle,
  type Order,
  type Position,
  type AccountState,
  type TradingPair
} from './types';
import { v4 as uuidv4 } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface PaperTradingConfig {
  initialBalance: number;
  leverage: number;
  
  // Fee simulation
  makerFeePercent: number;
  takerFeePercent: number;
  
  // Slippage simulation
  slippagePercent: number;       // Random slippage range
  slippageOnStopLoss: number;    // Higher slippage for stops
  
  // Latency simulation (ms)
  minLatencyMs: number;
  maxLatencyMs: number;
  
  // Liquidation
  liquidationThreshold: number;  // Margin ratio for liquidation
}

export interface SimulatedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bid: number;
  ask: number;
}

// ============================================================================
// PAPER TRADING ENGINE
// ============================================================================

export class PaperTradingEngine {
  private balance: number;
  private equity: number;
  private positions: Map<string, Position> = new Map();
  private orders: Map<string, Order> = new Map();
  private orderQueue: Array<{ order: Order; executeAt: number }> = [];
  
  private candleHistory: Map<string, Candle[]> = new Map();
  private currentPrices: Map<string, SimulatedCandle> = new Map();
  
  private tradeHistory: Array<{
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    timestamp: number;
    fees: number;
  }> = [];

  constructor(
    private readonly config: PaperTradingConfig,
    private readonly pairs: Map<string, TradingPair>
  ) {
    this.balance = config.initialBalance;
    this.equity = config.initialBalance;
  }

  // =========================================================================
  // PRICE MANAGEMENT
  // =========================================================================

  /**
   * Update current price for a symbol
   */
  updatePrice(symbol: string, candle: Candle): void {
    // Calculate bid/ask spread (simulate order book)
    const spreadPercent = 0.01 + Math.random() * 0.02; // 0.01-0.03% spread
    const midPrice = candle.close;
    const halfSpread = midPrice * (spreadPercent / 2);

    const simCandle: SimulatedCandle = {
      ...candle,
      bid: midPrice - halfSpread,
      ask: midPrice + halfSpread
    };

    this.currentPrices.set(symbol, simCandle);

    // Store history
    const history = this.candleHistory.get(symbol) || [];
    history.push(candle);
    if (history.length > 1000) history.shift();
    this.candleHistory.set(symbol, history);

    // Process pending orders
    this.processOrderQueue(symbol, simCandle);
  }

  /**
   * Get current price for a symbol
   */
  getCurrentPrice(symbol: string): SimulatedCandle | null {
    return this.currentPrices.get(symbol) || null;
  }

  // =========================================================================
  // ORDER MANAGEMENT
  // =========================================================================

  /**
   * Submit a new order
   */
  async submitOrder(
    symbol: string,
    direction: TradeDirection,
    type: OrderType,
    size: number,
    price?: number,
    stopPrice?: number,
    positionId?: string
  ): Promise<Order> {
    const pair = this.pairs.get(symbol);
    if (!pair) {
      throw new Error(`Unknown trading pair: ${symbol}`);
    }

    const clientId = `paper_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const now = Date.now();

    // Calculate execution delay
    const delayMs = this.config.minLatencyMs + 
      Math.random() * (this.config.maxLatencyMs - this.config.minLatencyMs);
    const executeAt = now + delayMs;

    const order: Order = {
      id: clientId,
      clientId,
      symbol,
      exchange: ExchangeId.PAPER,
      direction,
      type,
      status: OrderStatus.PENDING,
      size,
      price: type === OrderType.LIMIT || type === OrderType.STOP_LIMIT ? price : undefined,
      stopPrice: stopPrice || (type === OrderType.STOP_MARKET ? price : undefined),
      filledSize: 0,
      avgFillPrice: 0,
      fees: 0,
      feeCurrency: pair.quoteAsset,
      positionId,
      createdAt: now,
      updatedAt: now
    };

    this.orders.set(clientId, order);

    // Market orders execute immediately with delay
    if (type === OrderType.MARKET) {
      this.orderQueue.push({ order, executeAt });
    }
    // Stop orders wait for price trigger
    else if (type === OrderType.STOP_MARKET || type === OrderType.STOP_LIMIT) {
      // Will be processed when price reaches stop
      this.orderQueue.push({ order, executeAt: 0 }); // 0 means wait for trigger
    }
    // Limit orders wait for price match
    else if (type === OrderType.LIMIT) {
      this.orderQueue.push({ order, executeAt: 0 });
    }

    return order;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) return false;

    if (order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED) {
      return false;
    }

    order.status = OrderStatus.CANCELLED;
    order.updatedAt = Date.now();

    // Remove from queue
    const idx = this.orderQueue.findIndex(o => o.order.id === orderId);
    if (idx >= 0) {
      this.orderQueue.splice(idx, 1);
    }

    return true;
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get all open orders
   */
  getOpenOrders(): Order[] {
    return Array.from(this.orders.values())
      .filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.SUBMITTED);
  }

  // =========================================================================
  // ORDER EXECUTION
  // =========================================================================

  /**
   * Process order queue against current prices
   */
  private processOrderQueue(symbol: string, candle: SimulatedCandle): void {
    const now = Date.now();
    const toExecute: Order[] = [];
    const toRemove: number[] = [];

    for (let i = 0; i < this.orderQueue.length; i++) {
      const { order, executeAt } = this.orderQueue[i];

      if (order.symbol !== symbol) continue;

      // Check if order should execute
      let shouldExecute = false;
      let fillPrice = candle.close;

      switch (order.type) {
        case OrderType.MARKET:
          // Check delay
          if (now >= executeAt) {
            shouldExecute = true;
            // Simulate slippage
            fillPrice = this.applySlippage(candle, order.direction);
          }
          break;

        case OrderType.STOP_MARKET:
          // Check if stop price hit
          if (order.stopPrice) {
            const hit = order.direction === TradeDirection.LONG
              ? candle.high >= order.stopPrice
              : candle.low <= order.stopPrice;
            if (hit) {
              shouldExecute = true;
              fillPrice = this.applySlippageOnStop(order.stopPrice, order.direction);
            }
          }
          break;

        case OrderType.STOP_LIMIT:
          // Check if stop price hit, then place limit
          if (order.stopPrice) {
            const hit = order.direction === TradeDirection.LONG
              ? candle.high >= order.stopPrice
              : candle.low <= order.stopPrice;
            if (hit && order.price) {
              // Convert to limit order
              order.type = OrderType.LIMIT;
              order.stopPrice = undefined;
              // Will be processed as limit order
            }
          }
          break;

        case OrderType.LIMIT:
          // Check if limit price reached
          if (order.price) {
            const reached = order.direction === TradeDirection.LONG
              ? candle.low <= order.price
              : candle.high >= order.price;
            if (reached) {
              shouldExecute = true;
              fillPrice = order.price;
            }
          }
          break;
      }

      if (shouldExecute) {
        toExecute.push(order);
        toRemove.push(i);
      }
    }

    // Execute orders
    for (const order of toExecute) {
      this.executeOrder(order, candle.close);
    }

    // Remove executed orders from queue
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.orderQueue.splice(toRemove[i], 1);
    }
  }

  /**
   * Execute an order
   */
  private executeOrder(order: Order, marketPrice: number): void {
    const pair = this.pairs.get(order.symbol);
    if (!pair) return;

    // Calculate fill price with slippage
    let fillPrice = marketPrice;
    if (order.type === OrderType.MARKET) {
      fillPrice = this.applySlippage(
        this.currentPrices.get(order.symbol)!,
        order.direction
      );
    } else if (order.type === OrderType.STOP_MARKET && order.stopPrice) {
      fillPrice = this.applySlippageOnStop(order.stopPrice, order.direction);
    } else if (order.type === OrderType.LIMIT && order.price) {
      fillPrice = order.price;
    }

    // Calculate fees
    const notionalValue = order.size * fillPrice;
    const isMaker = order.type === OrderType.LIMIT;
    const feeRate = isMaker ? this.config.makerFeePercent : this.config.takerFeePercent;
    const fees = notionalValue * (feeRate / 100);

    // Update order
    order.status = OrderStatus.FILLED;
    order.filledSize = order.size;
    order.avgFillPrice = fillPrice;
    order.fees = fees;
    order.updatedAt = Date.now();

    // Update balance
    if (order.direction === TradeDirection.LONG) {
      this.balance -= notionalValue + fees;
    } else {
      this.balance += notionalValue - fees;
    }

    // Create or update position
    this.updatePosition(order, fillPrice);

    // Record trade
    this.tradeHistory.push({
      orderId: order.id,
      symbol: order.symbol,
      side: order.direction === TradeDirection.LONG ? 'BUY' : 'SELL',
      price: fillPrice,
      size: order.size,
      timestamp: Date.now(),
      fees
    });
  }

  /**
   * Update position after order execution
   */
  private updatePosition(order: Order, fillPrice: number): void {
    const posKey = `${order.symbol}_${order.direction}`;

    if (order.positionId) {
      // Closing existing position
      const position = this.positions.get(order.positionId);
      if (position) {
        const pnl = (fillPrice - position.entryPrice) * position.size;
        this.balance += position.notionalValue + pnl;
        position.status = PositionStatus.CLOSED;
        position.closedAt = Date.now();
        position.realizedPnl = pnl;
        this.positions.delete(order.positionId);
      }
    } else {
      // Opening new position
      const positionId = `pos_${Date.now()}_${uuidv4().slice(0, 8)}`;
      const position: Position = {
        id: positionId,
        symbol: order.symbol,
        exchange: ExchangeId.PAPER,
        direction: order.direction,
        status: PositionStatus.OPEN,
        size: order.size,
        entryPrice: fillPrice,
        notionalValue: order.size * fillPrice,
        stopLoss: 0, // Will be set by strategy
        takeProfits: [],
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        realizedPnl: 0,
        openedAt: Date.now(),
        updatedAt: Date.now(),
        trailingStopActivated: false
      };

      this.positions.set(positionId, position);
      order.positionId = positionId;
    }

    // Update equity
    this.updateEquity();
  }

  // =========================================================================
  // SLIPPAGE SIMULATION
  // =========================================================================

  /**
   * Apply realistic slippage for market orders
   */
  private applySlippage(candle: SimulatedCandle, direction: TradeDirection): number {
    const basePrice = direction === TradeDirection.LONG ? candle.ask : candle.bid;
    const slippage = basePrice * (this.config.slippagePercent / 100) * Math.random();
    
    return direction === TradeDirection.LONG
      ? basePrice + slippage
      : basePrice - slippage;
  }

  /**
   * Apply higher slippage for stop orders (realistic)
   */
  private applySlippageOnStop(stopPrice: number, direction: TradeDirection): number {
    const slippage = stopPrice * (this.config.slippageOnStopLoss / 100) * Math.random();
    
    return direction === TradeDirection.LONG
      ? stopPrice + slippage  // Buying back at higher price
      : stopPrice - slippage; // Selling at lower price
  }

  // =========================================================================
  // ACCOUNT STATE
  // =========================================================================

  /**
   * Update equity based on current positions
   */
  private updateEquity(): void {
    let unrealizedPnl = 0;

    for (const position of this.positions.values()) {
      const currentPrice = this.currentPrices.get(position.symbol)?.close || position.entryPrice;
      const pnl = (currentPrice - position.entryPrice) * position.size;
      if (position.direction === TradeDirection.SHORT) {
        unrealizedPnl -= pnl;
      } else {
        unrealizedPnl += pnl;
      }
    }

    this.equity = this.balance + unrealizedPnl;
  }

  /**
   * Get account state
   */
  getAccountState(): AccountState {
    this.updateEquity();

    return {
      exchange: ExchangeId.PAPER,
      balance: this.balance,
      equity: this.equity,
      unrealizedPnl: this.equity - this.balance,
      marginUsed: 0, // Calculate from positions
      marginAvailable: this.balance,
      positions: Array.from(this.positions.values()),
      openOrders: this.getOpenOrders(),
      lastUpdated: Date.now()
    };
  }

  /**
   * Get all positions
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Update position stop loss / take profit
   */
  updatePositionRisk(
    positionId: string,
    stopLoss?: number,
    takeProfits?: Array<{ price: number; sizePercent: number }>
  ): boolean {
    const position = this.positions.get(positionId);
    if (!position) return false;

    if (stopLoss !== undefined) {
      position.stopLoss = stopLoss;
    }

    if (takeProfits !== undefined) {
      position.takeProfits = takeProfits.map(tp => ({
        ...tp,
        filled: false
      }));
    }

    position.updatedAt = Date.now();
    return true;
  }

  /**
   * Get trade history
   */
  getTradeHistory() {
    return [...this.tradeHistory];
  }

  /**
   * Reset engine to initial state
   */
  reset(): void {
    this.balance = this.config.initialBalance;
    this.equity = this.config.initialBalance;
    this.positions.clear();
    this.orders.clear();
    this.orderQueue = [];
    this.tradeHistory = [];
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_PAPER_CONFIG: PaperTradingConfig = {
  initialBalance: 10000,
  leverage: 10,
  makerFeePercent: 0.02,      // 0.02% maker
  takerFeePercent: 0.05,      // 0.05% taker
  slippagePercent: 0.05,      // 0.05% slippage
  slippageOnStopLoss: 0.1,    // 0.1% on stops
  minLatencyMs: 50,
  maxLatencyMs: 200,
  liquidationThreshold: 0.8   // 80% margin usage
};
