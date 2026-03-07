/**
 * ORION Multi-Exchange Adapter
 *
 * Unified interface for multi-exchange trading.
 * Supports: Binance, Bybit, OKX, Bitget, Hyperliquid, Blofin
 *
 * Features:
 * - Unified order interface
 * - Exchange-specific adaptations
 * - Position synchronization
 * - Balance tracking
 */

import type {
  OrionPosition,
  TrendSignal,
  Candle,
  Ticker,
  PositionSide,
} from './types';

// =============================================================================
// ADAPTER INTERFACES
// =============================================================================

export interface ExchangeOrder {
  id: string;
  exchange: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT';
  price: number | null;
  stopPrice?: number;
  size: number;
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  filledSize: number;
  avgFillPrice: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExchangeBalance {
  exchange: string;
  asset: string;
  total: number;
  available: number;
  locked: number;
  usdValue: number;
}

export interface ExchangePosition {
  exchange: string;
  symbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnL: number;
  leverage: number;
  liquidationPrice: number;
}

export interface ExchangeCredentials {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet?: boolean;
}

export interface ExchangeAdapter {
  name: string;
  isPaperTrading: boolean;

  // Connection
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Market Data
  getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  getTicker(symbol: string): Promise<Ticker>;

  // Trading
  placeOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    type: 'MARKET' | 'LIMIT',
    size: number,
    price?: number
  ): Promise<ExchangeOrder>;

  placeStopLoss(
    symbol: string,
    side: 'BUY' | 'SELL',
    stopPrice: number,
    size: number
  ): Promise<ExchangeOrder>;

  placeTakeProfit(
    symbol: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number
  ): Promise<ExchangeOrder>;

  cancelOrder(orderId: string, symbol: string): Promise<boolean>;
  cancelAllOrders(symbol?: string): Promise<boolean>;

  // Positions
  getPositions(): Promise<ExchangePosition[]>;
  getPosition(symbol: string, side: PositionSide): Promise<ExchangePosition | null>;
  closePosition(symbol: string, side: PositionSide): Promise<ExchangeOrder>;

  // Account
  getBalances(): Promise<ExchangeBalance[]>;
  getBalance(asset: string): Promise<ExchangeBalance | null>;

  // Settings
  setLeverage(symbol: string, leverage: number): Promise<boolean>;
  setMarginMode(symbol: string, mode: 'ISOLATED' | 'CROSS'): Promise<boolean>;
  setHedgingMode(enabled: boolean): Promise<boolean>;
}

// =============================================================================
// BASE ADAPTER
// =============================================================================

export abstract class BaseExchangeAdapter implements ExchangeAdapter {
  abstract name: string;
  abstract isPaperTrading: boolean;

  protected credentials: ExchangeCredentials;
  protected connected: boolean = false;

  constructor(credentials: ExchangeCredentials) {
    this.credentials = credentials;
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }

  abstract getCandles(
    symbol: string,
    timeframe: string,
    limit: number
  ): Promise<Candle[]>;

  abstract getTicker(symbol: string): Promise<Ticker>;

  abstract placeOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    type: 'MARKET' | 'LIMIT',
    size: number,
    price?: number
  ): Promise<ExchangeOrder>;

  abstract placeStopLoss(
    symbol: string,
    side: 'BUY' | 'SELL',
    stopPrice: number,
    size: number
  ): Promise<ExchangeOrder>;

  abstract placeTakeProfit(
    symbol: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number
  ): Promise<ExchangeOrder>;

  abstract cancelOrder(orderId: string, symbol: string): Promise<boolean>;
  abstract cancelAllOrders(symbol?: string): Promise<boolean>;

  abstract getPositions(): Promise<ExchangePosition[]>;
  abstract getPosition(
    symbol: string,
    side: PositionSide
  ): Promise<ExchangePosition | null>;
  abstract closePosition(
    symbol: string,
    side: PositionSide
  ): Promise<ExchangeOrder>;

  abstract getBalances(): Promise<ExchangeBalance[]>;
  abstract getBalance(asset: string): Promise<ExchangeBalance | null>;

  abstract setLeverage(symbol: string, leverage: number): Promise<boolean>;
  abstract setMarginMode(
    symbol: string,
    mode: 'ISOLATED' | 'CROSS'
  ): Promise<boolean>;
  abstract setHedgingMode(enabled: boolean): Promise<boolean>;

  // Utility methods
  protected formatSymbol(symbol: string): string {
    // Override in subclass for exchange-specific formatting
    return symbol;
  }

  protected parseTimeframe(timeframe: string): string {
    // Override in subclass for exchange-specific timeframe format
    return timeframe;
  }
}

// =============================================================================
// EXCHANGE MANAGER
// =============================================================================

export class ExchangeManager {
  private adapters: Map<string, ExchangeAdapter> = new Map();
  private primaryExchange: string = '';

  /**
   * Register an exchange adapter
   */
  public registerAdapter(adapter: ExchangeAdapter): void {
    this.adapters.set(adapter.name.toLowerCase(), adapter);
    if (this.primaryExchange === '') {
      this.primaryExchange = adapter.name.toLowerCase();
    }
  }

  /**
   * Get adapter by name
   */
  public getAdapter(exchange: string): ExchangeAdapter | null {
    return this.adapters.get(exchange.toLowerCase()) || null;
  }

  /**
   * Get all registered exchanges
   */
  public getRegisteredExchanges(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Set primary exchange
   */
  public setPrimaryExchange(exchange: string): void {
    if (this.adapters.has(exchange.toLowerCase())) {
      this.primaryExchange = exchange.toLowerCase();
    }
  }

  /**
   * Get primary exchange adapter
   */
  public getPrimaryAdapter(): ExchangeAdapter | null {
    return this.adapters.get(this.primaryExchange) || null;
  }

  /**
   * Connect to all exchanges
   */
  public async connectAll(): Promise<{ [exchange: string]: boolean }> {
    const results: { [exchange: string]: boolean } = {};

    for (const [name, adapter] of this.adapters) {
      try {
        results[name] = await adapter.connect();
      } catch {
        results[name] = false;
      }
    }

    return results;
  }

  /**
   * Disconnect from all exchanges
   */
  public async disconnectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.disconnect();
      } catch {
        // Ignore disconnection errors
      }
    }
  }

  /**
   * Get aggregated balances across all exchanges
   */
  public async getAggregatedBalances(): Promise<ExchangeBalance[]> {
    const allBalances: ExchangeBalance[] = [];

    for (const adapter of this.adapters.values()) {
      try {
        const balances = await adapter.getBalances();
        allBalances.push(...balances);
      } catch {
        // Skip failed exchanges
      }
    }

    return allBalances;
  }

  /**
   * Get positions from all exchanges
   */
  public async getAllPositions(): Promise<ExchangePosition[]> {
    const allPositions: ExchangePosition[] = [];

    for (const adapter of this.adapters.values()) {
      try {
        const positions = await adapter.getPositions();
        allPositions.push(...positions);
      } catch {
        // Skip failed exchanges
      }
    }

    return allPositions;
  }

  /**
   * Execute order on specific exchange
   */
  public async executeOrder(
    exchange: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    type: 'MARKET' | 'LIMIT',
    size: number,
    price?: number
  ): Promise<ExchangeOrder> {
    const adapter = this.getAdapter(exchange);
    if (!adapter) {
      throw new Error(`Exchange ${exchange} not registered`);
    }

    return adapter.placeOrder(symbol, side, type, size, price);
  }
}

// =============================================================================
// PAPER TRADING ADAPTER
// =============================================================================

export class PaperTradingAdapter implements ExchangeAdapter {
  name: string;
  isPaperTrading: boolean = true;

  private balances: Map<string, number> = new Map();
  private positions: Map<string, ExchangePosition> = new Map();
  private orders: Map<string, ExchangeOrder> = new Map();
  private tickers: Map<string, Ticker> = new Map();
  private candles: Map<string, Candle[]> = new Map();
  private leverage: Map<string, number> = new Map();
  private orderIdCounter: number = 0;
  private hedgingEnabled: boolean = true;

  constructor(name: string = 'paper', initialBalances: { [asset: string]: number } = { USDT: 10000 }) {
    this.name = name;
    for (const [asset, amount] of Object.entries(initialBalances)) {
      this.balances.set(asset, amount);
    }
  }

  async connect(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {
    // Nothing to disconnect
  }

  isConnected(): boolean {
    return true;
  }

  // Market data - should be fed from real exchange
  setTicker(ticker: Ticker): void {
    this.tickers.set(ticker.symbol, ticker);
  }

  setCandles(symbol: string, candles: Candle[]): void {
    this.candles.set(symbol, candles);
  }

  async getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]> {
    const candles = this.candles.get(symbol) || [];
    return candles.slice(-limit);
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const ticker = this.tickers.get(symbol);
    if (!ticker) {
      throw new Error(`No ticker data for ${symbol}`);
    }
    return ticker;
  }

  // Trading
  async placeOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    type: 'MARKET' | 'LIMIT',
    size: number,
    price?: number
  ): Promise<ExchangeOrder> {
    const ticker = this.tickers.get(symbol);
    if (!ticker) {
      throw new Error(`No ticker for ${symbol}`);
    }

    const executionPrice = type === 'MARKET' ? ticker.last : price || ticker.last;

    const order: ExchangeOrder = {
      id: `paper-${++this.orderIdCounter}`,
      exchange: this.name,
      symbol,
      side,
      type,
      price: type === 'LIMIT' ? price || null : null,
      size,
      status: 'FILLED',
      filledSize: size,
      avgFillPrice: executionPrice,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.orders.set(order.id, order);

    // Update position
    await this.updatePositionFromOrder(order);

    return order;
  }

  async placeStopLoss(
    symbol: string,
    side: 'BUY' | 'SELL',
    stopPrice: number,
    size: number
  ): Promise<ExchangeOrder> {
    const order: ExchangeOrder = {
      id: `paper-sl-${++this.orderIdCounter}`,
      exchange: this.name,
      symbol,
      side,
      type: 'STOP_MARKET',
      price: null,
      stopPrice,
      size,
      status: 'OPEN',
      filledSize: 0,
      avgFillPrice: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.orders.set(order.id, order);
    return order;
  }

  async placeTakeProfit(
    symbol: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number
  ): Promise<ExchangeOrder> {
    const order: ExchangeOrder = {
      id: `paper-tp-${++this.orderIdCounter}`,
      exchange: this.name,
      symbol,
      side,
      type: 'LIMIT',
      price,
      size,
      status: 'OPEN',
      filledSize: 0,
      avgFillPrice: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.orders.set(order.id, order);
    return order;
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (order && order.symbol === symbol) {
      order.status = 'CANCELLED';
      order.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  async cancelAllOrders(symbol?: string): Promise<boolean> {
    for (const order of this.orders.values()) {
      if (!symbol || order.symbol === symbol) {
        if (order.status === 'OPEN') {
          order.status = 'CANCELLED';
          order.updatedAt = Date.now();
        }
      }
    }
    return true;
  }

  // Positions
  async getPositions(): Promise<ExchangePosition[]> {
    return Array.from(this.positions.values());
  }

  async getPosition(symbol: string, side: PositionSide): Promise<ExchangePosition | null> {
    const key = `${symbol}:${side}`;
    return this.positions.get(key) || null;
  }

  async closePosition(symbol: string, side: PositionSide): Promise<ExchangeOrder> {
    const key = `${symbol}:${side}`;
    const position = this.positions.get(key);

    if (!position) {
      throw new Error(`No position to close for ${symbol} ${side}`);
    }

    const ticker = this.tickers.get(symbol);
    if (!ticker) {
      throw new Error(`No ticker for ${symbol}`);
    }

    // Close with opposite side
    const closeSide: 'BUY' | 'SELL' = side === 'LONG' ? 'SELL' : 'BUY';

    const order = await this.placeOrder(symbol, closeSide, 'MARKET', position.size);

    // Remove position
    this.positions.delete(key);

    // Update balance with PnL
    const pnl = position.unrealizedPnL;
    const currentBalance = this.balances.get('USDT') || 0;
    this.balances.set('USDT', currentBalance + pnl);

    return order;
  }

  // Account
  async getBalances(): Promise<ExchangeBalance[]> {
    const ticker = this.tickers.values().next().value;
    const usdRate = ticker?.last || 1;

    return Array.from(this.balances.entries()).map(([asset, total]) => ({
      exchange: this.name,
      asset,
      total,
      available: total, // Simplified - no locked in paper
      locked: 0,
      usdValue: asset === 'USDT' ? total : total * usdRate,
    }));
  }

  async getBalance(asset: string): Promise<ExchangeBalance | null> {
    const total = this.balances.get(asset) || 0;
    const ticker = this.tickers.values().next().value;
    const usdRate = ticker?.last || 1;

    return {
      exchange: this.name,
      asset,
      total,
      available: total,
      locked: 0,
      usdValue: asset === 'USDT' ? total : total * usdRate,
    };
  }

  // Settings
  async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    this.leverage.set(symbol, leverage);
    return true;
  }

  async setMarginMode(symbol: string, mode: 'ISOLATED' | 'CROSS'): Promise<boolean> {
    return true; // Paper trading always succeeds
  }

  async setHedgingMode(enabled: boolean): Promise<boolean> {
    this.hedgingEnabled = enabled;
    return true;
  }

  // Internal methods
  private async updatePositionFromOrder(order: ExchangeOrder): Promise<void> {
    const side: PositionSide = order.side === 'BUY' ? 'LONG' : 'SHORT';
    const key = `${order.symbol}:${side}`;

    const ticker = this.tickers.get(order.symbol);
    if (!ticker) return;

    const existingPosition = this.positions.get(key);
    const leverage = this.leverage.get(order.symbol) || 1;

    if (existingPosition) {
      // Update existing position
      const newSize = existingPosition.size + order.filledSize;
      if (newSize <= 0) {
        this.positions.delete(key);
      } else {
        const totalCost = existingPosition.entryPrice * existingPosition.size +
          order.avgFillPrice * order.filledSize;
        const newEntryPrice = totalCost / newSize;

        existingPosition.size = newSize;
        existingPosition.entryPrice = newEntryPrice;
        existingPosition.markPrice = ticker.last;
        existingPosition.unrealizedPnL = (ticker.last - newEntryPrice) * newSize;
        this.positions.set(key, existingPosition);
      }
    } else {
      // Create new position
      const position: ExchangePosition = {
        exchange: this.name,
        symbol: order.symbol,
        side,
        size: order.filledSize,
        entryPrice: order.avgFillPrice,
        markPrice: ticker.last,
        unrealizedPnL: 0,
        leverage,
        liquidationPrice: 0, // Simplified for paper
      };
      this.positions.set(key, position);
    }
  }

  /**
   * Update positions with new ticker price (for unrealized PnL)
   */
  public updatePositionsPrice(ticker: Ticker): void {
    this.tickers.set(ticker.symbol, ticker);

    for (const [key, position] of this.positions) {
      if (position.symbol === ticker.symbol) {
        position.markPrice = ticker.last;
        const direction = position.side === 'LONG' ? 1 : -1;
        position.unrealizedPnL = direction * (ticker.last - position.entryPrice) * position.size;
        this.positions.set(key, position);
      }
    }
  }

  /**
   * Get total balance in USDT
   */
  public getTotalBalance(): number {
    return this.balances.get('USDT') || 0;
  }

  /**
   * Reset paper trading account
   */
  public reset(initialBalance: number = 10000): void {
    this.balances.clear();
    this.positions.clear();
    this.orders.clear();
    this.balances.set('USDT', initialBalance);
    this.orderIdCounter = 0;
  }
}
