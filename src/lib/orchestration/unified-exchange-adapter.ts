/**
 * CITARION Unified Exchange Adapter (UEA)
 * 
 * Unified interface for all supported exchanges.
 * Provides consistent API for order management, market data, and account operations.
 * 
 * Supported exchanges: Binance, Bybit, OKX, Bitget, BingX
 */

import { getEventBus } from './event-bus'
import type { PlatformEvent } from './types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported exchanges
 */
export type ExchangeId = 'binance' | 'bybit' | 'okx' | 'bitget' | 'bingx'

/**
 * Market types
 */
export type MarketType = 'spot' | 'futures' | 'margin'

/**
 * Order side
 */
export type OrderSide = 'BUY' | 'SELL'

/**
 * Order type
 */
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT'

/**
 * Order status
 */
export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED'

/**
 * Time in force
 */
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTX' // GTX = Post Only

/**
 * Position side (for hedge mode)
 */
export type PositionSide = 'LONG' | 'SHORT' | 'BOTH'

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Unified order parameters
 */
export interface UnifiedOrderParams {
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  price?: number
  stopPrice?: number
  timeInForce?: TimeInForce
  reduceOnly?: boolean
  positionSide?: PositionSide
  clientOrderId?: string
  takeProfitPrice?: number
  stopLossPrice?: number
}

/**
 * Unified order result
 */
export interface UnifiedOrder {
  orderId: string
  clientOrderId?: string
  exchangeOrderId: string
  exchange: ExchangeId
  symbol: string
  side: OrderSide
  type: OrderType
  status: OrderStatus
  quantity: number
  filledQuantity: number
  remainingQuantity: number
  price?: number
  avgPrice?: number
  stopPrice?: number
  timeInForce: TimeInForce
  createdAt: number
  updatedAt: number
  fee?: number
  feeCurrency?: string
}

/**
 * Unified position
 */
export interface UnifiedPosition {
  positionId: string
  exchange: ExchangeId
  symbol: string
  side: PositionSide
  quantity: number
  entryPrice: number
  markPrice: number
  liquidationPrice?: number
  unrealizedPnl: number
  realizedPnl: number
  leverage: number
  margin: number
  marginMode: 'cross' | 'isolated'
  createdAt: number
  updatedAt: number
}

/**
 * Unified account balance
 */
export interface UnifiedBalance {
  exchange: ExchangeId
  asset: string
  total: number
  available: number
  locked: number
  usdValue?: number
}

/**
 * Unified ticker
 */
export interface UnifiedTicker {
  exchange: ExchangeId
  symbol: string
  bid: number
  ask: number
  lastPrice: number
  high24h: number
  low24h: number
  volume24h: number
  quoteVolume24h: number
  priceChange24h: number
  priceChangePercent24h: number
  timestamp: number
}

/**
 * Unified candlestick
 */
export interface UnifiedCandle {
  exchange: ExchangeId
  symbol: string
  interval: string
  openTime: number
  closeTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  quoteVolume: number
  trades: number
}

/**
 * Unified orderbook
 */
export interface UnifiedOrderbook {
  exchange: ExchangeId
  symbol: string
  bids: [number, number][]  // [price, quantity]
  asks: [number, number][]
  timestamp: number
}

/**
 * Exchange credentials
 */
export interface ExchangeCredentials {
  apiKey: string
  apiSecret: string
  passphrase?: string  // Required for OKX
}

/**
 * Exchange adapter interface
 */
export interface IExchangeAdapter {
  exchangeId: ExchangeId
  
  // Connection
  connect(credentials: ExchangeCredentials): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  
  // Market Data
  getTicker(symbol: string): Promise<UnifiedTicker>
  getOrderbook(symbol: string, depth?: number): Promise<UnifiedOrderbook>
  getCandles(symbol: string, interval: string, limit?: number): Promise<UnifiedCandle[]>
  
  // Trading
  createOrder(params: UnifiedOrderParams): Promise<UnifiedOrder>
  cancelOrder(symbol: string, orderId: string): Promise<UnifiedOrder>
  cancelAllOrders(symbol?: string): Promise<void>
  getOrder(symbol: string, orderId: string): Promise<UnifiedOrder>
  getOpenOrders(symbol?: string): Promise<UnifiedOrder[]>
  
  // Position Management
  getPositions(symbol?: string): Promise<UnifiedPosition[]>
  setLeverage(symbol: string, leverage: number): Promise<void>
  setMarginMode(symbol: string, mode: 'cross' | 'isolated'): Promise<void>
  
  // Account
  getBalances(): Promise<UnifiedBalance[]>
  
  // WebSocket
  subscribeTicker(symbol: string, callback: (ticker: UnifiedTicker) => void): Promise<void>
  subscribeOrderbook(symbol: string, callback: (orderbook: UnifiedOrderbook) => void): Promise<void>
  subscribeCandles(symbol: string, interval: string, callback: (candle: UnifiedCandle) => void): Promise<void>
  subscribeOrders(callback: (order: UnifiedOrder) => void): Promise<void>
  unsubscribe(subscriptionId: string): void
}

// ============================================================================
// BASE ADAPTER
// ============================================================================

/**
 * Base class for exchange adapters
 */
export abstract class BaseExchangeAdapter implements IExchangeAdapter {
  abstract exchangeId: ExchangeId
  protected credentials: ExchangeCredentials | null = null
  protected connected: boolean = false
  protected subscriptions: Map<string, () => void> = new Map()

  abstract connect(credentials: ExchangeCredentials): Promise<void>
  abstract disconnect(): Promise<void>
  
  isConnected(): boolean {
    return this.connected
  }

  abstract getTicker(symbol: string): Promise<UnifiedTicker>
  abstract getOrderbook(symbol: string, depth?: number): Promise<UnifiedOrderbook>
  abstract getCandles(symbol: string, interval: string, limit?: number): Promise<UnifiedCandle[]>
  
  abstract createOrder(params: UnifiedOrderParams): Promise<UnifiedOrder>
  abstract cancelOrder(symbol: string, orderId: string): Promise<UnifiedOrder>
  abstract cancelAllOrders(symbol?: string): Promise<void>
  abstract getOrder(symbol: string, orderId: string): Promise<UnifiedOrder>
  abstract getOpenOrders(symbol?: string): Promise<UnifiedOrder[]>
  
  abstract getPositions(symbol?: string): Promise<UnifiedPosition[]>
  abstract setLeverage(symbol: string, leverage: number): Promise<void>
  abstract setMarginMode(symbol: string, mode: 'cross' | 'isolated'): Promise<void>
  
  abstract getBalances(): Promise<UnifiedBalance[]>
  
  abstract subscribeTicker(symbol: string, callback: (ticker: UnifiedTicker) => void): Promise<void>
  abstract subscribeOrderbook(symbol: string, callback: (orderbook: UnifiedOrderbook) => void): Promise<void>
  abstract subscribeCandles(symbol: string, interval: string, callback: (candle: UnifiedCandle) => void): Promise<void>
  abstract subscribeOrders(callback: (order: UnifiedOrder) => void): Promise<void>

  unsubscribe(subscriptionId: string): void {
    const cleanup = this.subscriptions.get(subscriptionId)
    if (cleanup) {
      cleanup()
      this.subscriptions.delete(subscriptionId)
    }
  }

  protected generateId(): string {
    return `${this.exchangeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// ============================================================================
// UNIFIED EXCHANGE MANAGER
// ============================================================================

/**
 * Unified Exchange Manager
 * Manages all exchange adapters and provides a single point of access
 */
export class UnifiedExchangeManager {
  private adapters: Map<ExchangeId, IExchangeAdapter> = new Map()
  private eventBus = getEventBus()

  /**
   * Register an exchange adapter
   */
  registerAdapter(adapter: IExchangeAdapter): void {
    this.adapters.set(adapter.exchangeId, adapter)
    console.log(`[UEA] Registered adapter: ${adapter.exchangeId}`)
  }

  /**
   * Get an adapter by exchange ID
   */
  getAdapter(exchangeId: ExchangeId): IExchangeAdapter | undefined {
    return this.adapters.get(exchangeId)
  }

  /**
   * Get all registered exchanges
   */
  getRegisteredExchanges(): ExchangeId[] {
    return Array.from(this.adapters.keys())
  }

  /**
   * Connect to an exchange
   */
  async connect(exchangeId: ExchangeId, credentials: ExchangeCredentials): Promise<void> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    await adapter.connect(credentials)
    
    // Publish system event
    await this.eventBus.publish('system.exchange.connected', {
      id: `evt_${Date.now()}`,
      timestamp: Date.now(),
      category: 'system',
      source: 'UEA',
      type: 'bot.healthy',
      data: {
        botId: exchangeId,
        botCode: exchangeId.toUpperCase() as any,
        status: 'running',
      },
    } as PlatformEvent)
  }

  /**
   * Disconnect from an exchange
   */
  async disconnect(exchangeId: ExchangeId): Promise<void> {
    const adapter = this.adapters.get(exchangeId)
    if (adapter) {
      await adapter.disconnect()
    }
  }

  /**
   * Create order on exchange with event publishing
   */
  async createOrder(exchangeId: ExchangeId, params: UnifiedOrderParams): Promise<UnifiedOrder> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }

    // Publish order created event
    await this.eventBus.publish('trading.order.created', {
      id: `evt_${Date.now()}`,
      timestamp: Date.now(),
      category: 'trading',
      source: 'UEA',
      type: 'order.created',
      data: {
        symbol: params.symbol,
        side: params.side,
        orderType: params.type,
        quantity: params.quantity,
        price: params.price,
        exchange: exchangeId,
      },
    } as PlatformEvent)

    try {
      const order = await adapter.createOrder(params)
      
      // Publish order submitted event
      await this.eventBus.publish('trading.order.submitted', {
        id: `evt_${Date.now()}`,
        timestamp: Date.now(),
        category: 'trading',
        source: 'UEA',
        type: 'order.submitted',
        data: {
          orderId: order.orderId,
          exchangeOrderId: order.exchangeOrderId,
          symbol: order.symbol,
          side: order.side,
          orderType: order.type,
          quantity: order.quantity,
          price: order.price,
          exchange: exchangeId,
        },
      } as PlatformEvent)

      return order
    } catch (error) {
      // Publish order rejected event
      await this.eventBus.publish('trading.order.rejected', {
        id: `evt_${Date.now()}`,
        timestamp: Date.now(),
        category: 'trading',
        source: 'UEA',
        type: 'order.rejected',
        data: {
          symbol: params.symbol,
          side: params.side,
          orderType: params.type,
          quantity: params.quantity,
          exchange: exchangeId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        },
      } as PlatformEvent)
      
      throw error
    }
  }

  /**
   * Cancel order with event publishing
   */
  async cancelOrder(exchangeId: ExchangeId, symbol: string, orderId: string): Promise<UnifiedOrder> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }

    const order = await adapter.cancelOrder(symbol, orderId)
    
    await this.eventBus.publish('trading.order.cancelled', {
      id: `evt_${Date.now()}`,
      timestamp: Date.now(),
      category: 'trading',
      source: 'UEA',
      type: 'order.cancelled',
      data: {
        orderId: order.orderId,
        exchangeOrderId: order.exchangeOrderId,
        symbol: order.symbol,
        exchange: exchangeId,
      },
    } as PlatformEvent)

    return order
  }

  /**
   * Get ticker from exchange
   */
  async getTicker(exchangeId: ExchangeId, symbol: string): Promise<UnifiedTicker> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.getTicker(symbol)
  }

  /**
   * Get orderbook from exchange
   */
  async getOrderbook(exchangeId: ExchangeId, symbol: string, depth?: number): Promise<UnifiedOrderbook> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.getOrderbook(symbol, depth)
  }

  /**
   * Get candles from exchange
   */
  async getCandles(
    exchangeId: ExchangeId,
    symbol: string,
    interval: string,
    limit?: number
  ): Promise<UnifiedCandle[]> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.getCandles(symbol, interval, limit)
  }

  /**
   * Get positions from exchange
   */
  async getPositions(exchangeId: ExchangeId, symbol?: string): Promise<UnifiedPosition[]> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.getPositions(symbol)
  }

  /**
   * Get balances from exchange
   */
  async getBalances(exchangeId: ExchangeId): Promise<UnifiedBalance[]> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.getBalances()
  }

  /**
   * Set leverage on exchange
   */
  async setLeverage(exchangeId: ExchangeId, symbol: string, leverage: number): Promise<void> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.setLeverage(symbol, leverage)
  }

  /**
   * Subscribe to ticker updates
   */
  async subscribeTicker(
    exchangeId: ExchangeId,
    symbol: string,
    callback: (ticker: UnifiedTicker) => void
  ): Promise<void> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.subscribeTicker(symbol, callback)
  }

  /**
   * Subscribe to orderbook updates
   */
  async subscribeOrderbook(
    exchangeId: ExchangeId,
    symbol: string,
    callback: (orderbook: UnifiedOrderbook) => void
  ): Promise<void> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.subscribeOrderbook(symbol, callback)
  }

  /**
   * Subscribe to order updates
   */
  async subscribeOrders(
    exchangeId: ExchangeId,
    callback: (order: UnifiedOrder) => void
  ): Promise<void> {
    const adapter = this.adapters.get(exchangeId)
    if (!adapter) {
      throw new Error(`Exchange adapter not found: ${exchangeId}`)
    }
    return adapter.subscribeOrders(callback)
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let unifiedManagerInstance: UnifiedExchangeManager | null = null

/**
 * Get the unified exchange manager singleton
 */
export function getUnifiedExchangeManager(): UnifiedExchangeManager {
  if (!unifiedManagerInstance) {
    unifiedManagerInstance = new UnifiedExchangeManager()
  }
  return unifiedManagerInstance
}
