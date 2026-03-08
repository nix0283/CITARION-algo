/**
 * Grid Bot Paper Trading Adapter
 * 
 * Адаптер для виртуальной торговли с реальными ценами.
 * Полностью симулирует торговлю без реальных ордеров.
 */

import {
  GridBotAdapter,
  GridOrderRequest,
  GridOrderResult,
  GridOrder,
  OrderbookSnapshot,
  BalanceInfo,
  PositionInfo,
} from './types';
import { EventEmitter } from 'events';

// ==================== PAPER TRADING ADAPTER ====================

export class GridBotPaperAdapter extends EventEmitter implements GridBotAdapter {
  private symbol: string;
  private connected: boolean = false;
  private priceCallbacks: ((price: number) => void)[] = [];
  
  // Paper account state
  private balance: BalanceInfo;
  private position: PositionInfo | null = null;
  private openOrders: Map<string, GridOrder> = new Map();
  private orderCounter: number = 0;
  
  // Price tracking
  private currentPrice: number = 0;
  private lastOrderbook: OrderbookSnapshot | null = null;
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private wsConnection: any = null;
  
  // Configuration
  private initialBalance: number;
  private leverage: number = 1;
  private feePercent: number = 0.1;
  private slippagePercent: number = 0.05;

  constructor(
    symbol: string,
    initialBalance: number = 10000,
    leverage: number = 1
  ) {
    super();
    this.symbol = symbol;
    this.initialBalance = initialBalance;
    this.leverage = leverage;
    
    // Parse symbol
    const { base, quote } = this.parseSymbol(symbol);
    
    // Initialize balance
    this.balance = {
      baseAsset: base,
      quoteAsset: quote,
      baseBalance: 0,
      quoteBalance: initialBalance,
      availableBase: 0,
      availableQuote: initialBalance,
    };
  }

  // ==================== CONNECTION ====================

  async connect(): Promise<void> {
    this.connected = true;
    
    // Get initial price from real market
    await this.fetchRealPrice();
    
    // Start price updates
    await this.startPriceUpdates();
    
    console.log(`[GridBotPaperAdapter] Connected for ${this.symbol}, balance: ${this.initialBalance} USDT`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.priceCallbacks = [];
    
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
    
    if (this.wsConnection) {
      this.wsConnection.disconnect();
      this.wsConnection = null;
    }
    
    console.log(`[GridBotPaperAdapter] Disconnected`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ==================== PRICE UPDATES ====================

  /**
   * Получить реальную цену с биржи
   */
  private async fetchRealPrice(): Promise<void> {
    try {
      // Fetch from Binance public API
      const response = await fetch(
        `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${this.symbol}`
      );
      
      if (response.ok) {
        const data = await response.json();
        this.currentPrice = parseFloat(data.price);
        
        // Update position mark price
        if (this.position) {
          this.position.markPrice = this.currentPrice;
          this.position.unrealizedPnl = this.calculateUnrealizedPnl();
        }
      }
    } catch (error) {
      console.error('[GridBotPaperAdapter] Failed to fetch price:', error);
    }
  }

  /**
   * Запустить обновления цен
   */
  private async startPriceUpdates(): Promise<void> {
    // Try WebSocket first
    try {
      const { io } = await import('socket.io-client');
      
      this.wsConnection = io('/?XTransformPort=3002');
      
      this.wsConnection.on('connect', () => {
        this.wsConnection.emit('subscribe_exchange', {
          exchange: 'binance',
          type: 'futures',
        });
      });
      
      this.wsConnection.on('price_update', (data: any) => {
        const normalizedSymbol = this.symbol.toUpperCase().replace(/[-_]/g, '');
        const dataSymbol = (data.symbol || '').toUpperCase().replace(/[-_]/g, '');
        
        if (dataSymbol === normalizedSymbol) {
          this.handlePriceUpdate(data.price);
        }
      });
      
      this.wsConnection.on('error', () => {
        // Fallback to polling
        this.startPolling();
      });
    } catch {
      // Fallback to polling
      this.startPolling();
    }
  }

  /**
   * Fallback polling
   */
  private startPolling(): void {
    this.priceUpdateInterval = setInterval(async () => {
      if (!this.connected) return;
      await this.fetchRealPrice();
      
      // Notify callbacks
      for (const callback of this.priceCallbacks) {
        callback(this.currentPrice);
      }
      
      // Check orders
      this.checkOrderFills();
    }, 3000);
  }

  /**
   * Обработка обновления цены
   */
  private handlePriceUpdate(price: number): void {
    const prevPrice = this.currentPrice;
    this.currentPrice = price;
    
    // Update position
    if (this.position) {
      this.position.markPrice = price;
      this.position.unrealizedPnl = this.calculateUnrealizedPnl();
    }
    
    // Notify callbacks
    for (const callback of this.priceCallbacks) {
      callback(price);
    }
    
    // Check if any orders should be filled
    this.checkOrderFills();
    
    // Emit price event
    this.emit('price', price);
  }

  /**
   * Проверка исполнения ордеров
   */
  private checkOrderFills(): void {
    for (const [orderId, order] of this.openOrders) {
      if (order.status !== 'OPEN') continue;
      
      let shouldFill = false;
      let fillPrice = order.price;
      
      switch (order.type) {
        case 'MARKET':
          shouldFill = true;
          fillPrice = this.applySlippage(this.currentPrice, order.side);
          break;
          
        case 'LIMIT':
          if (order.side === 'BUY' && this.currentPrice <= order.price) {
            shouldFill = true;
            fillPrice = Math.min(order.price, this.currentPrice);
          } else if (order.side === 'SELL' && this.currentPrice >= order.price) {
            shouldFill = true;
            fillPrice = Math.max(order.price, this.currentPrice);
          }
          break;
      }
      
      if (shouldFill) {
        this.fillOrder(order, fillPrice);
      }
    }
  }

  // ==================== ORDERS ====================

  async placeOrder(request: GridOrderRequest): Promise<GridOrderResult> {
    if (!this.connected) {
      return { success: false, error: 'Not connected' };
    }
    
    // Validate balance
    if (request.side === 'BUY') {
      const cost = request.quantity * (request.price || this.currentPrice);
      const fee = cost * (this.feePercent / 100);
      const total = cost + fee;
      
      if (total > this.balance.availableQuote) {
        return { success: false, error: 'Insufficient balance' };
      }
    } else {
      if (request.quantity > this.balance.availableBase) {
        return { success: false, error: 'Insufficient base asset' };
      }
    }
    
    // Create order
    const orderId = `paper_${++this.orderCounter}_${Date.now()}`;
    const order: GridOrder = {
      id: orderId,
      exchangeOrderId: orderId,
      side: request.side,
      type: request.type,
      price: request.price || this.currentPrice,
      quantity: request.quantity,
      status: 'OPEN',
      filledQuantity: 0,
      avgPrice: 0,
      fee: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Market orders fill immediately
    if (request.type === 'MARKET') {
      const fillPrice = this.applySlippage(this.currentPrice, request.side);
      this.fillOrder(order, fillPrice);
      return { success: true, order };
    }
    
    // Limit order - add to open orders
    this.openOrders.set(orderId, order);
    
    return { success: true, order };
  }

  /**
   * Исполнить ордер
   */
  private fillOrder(order: GridOrder, fillPrice: number): void {
    const quantity = order.quantity;
    const cost = quantity * fillPrice;
    const fee = cost * (this.feePercent / 100);
    
    order.status = 'FILLED';
    order.filledQuantity = quantity;
    order.avgPrice = fillPrice;
    order.fee = fee;
    order.updatedAt = new Date();
    
    // Update balance
    if (order.side === 'BUY') {
      // Deduct quote, add base
      this.balance.quoteBalance -= cost + fee;
      this.balance.availableQuote -= cost + fee;
      this.balance.baseBalance += quantity;
      this.balance.availableBase += quantity;
      
      // Update/create position
      if (this.position) {
        // Average in
        const totalQty = this.position.quantity + quantity;
        this.position.entryPrice = 
          (this.position.entryPrice * this.position.quantity + fillPrice * quantity) / totalQty;
        this.position.quantity = totalQty;
      } else {
        this.position = {
          symbol: this.symbol,
          side: 'LONG',
          quantity,
          entryPrice: fillPrice,
          markPrice: this.currentPrice,
          unrealizedPnl: 0,
          leverage: this.leverage,
          margin: cost / this.leverage,
        };
      }
    } else {
      // Deduct base, add quote
      this.balance.baseBalance -= quantity;
      this.balance.availableBase -= quantity;
      const proceeds = cost - fee;
      this.balance.quoteBalance += proceeds;
      this.balance.availableQuote += proceeds;
      
      // Close/reduce position
      if (this.position) {
        this.position.quantity -= quantity;
        
        // Realize PnL
        const pnl = (fillPrice - this.position.entryPrice) * quantity;
        this.position.unrealizedPnl = this.calculateUnrealizedPnl();
        
        if (this.position.quantity <= 0) {
          this.position = null;
        }
      }
    }
    
    // Remove from open orders
    this.openOrders.delete(order.id);
    
    // Emit event
    this.emit('order_filled', order);
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.openOrders.get(orderId);
    
    if (!order) {
      return false;
    }
    
    order.status = 'CANCELLED';
    order.updatedAt = new Date();
    
    this.openOrders.delete(orderId);
    
    return true;
  }

  async getOpenOrders(): Promise<GridOrder[]> {
    return Array.from(this.openOrders.values());
  }

  async getOrderStatus(orderId: string): Promise<GridOrder> {
    const order = this.openOrders.get(orderId);
    
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    
    return order;
  }

  // ==================== MARKET DATA ====================

  async getCurrentPrice(): Promise<number> {
    return this.currentPrice;
  }

  async getOrderbook(depth: number = 20): Promise<OrderbookSnapshot> {
    // Generate simulated orderbook around current price
    const bids: Array<{ price: number; quantity: number }> = [];
    const asks: Array<{ price: number; quantity: number }> = [];
    
    const tickSize = this.currentPrice * 0.0001;
    
    for (let i = 0; i < depth; i++) {
      bids.push({
        price: this.currentPrice - tickSize * (i + 1),
        quantity: Math.random() * 10 + 1,
      });
      
      asks.push({
        price: this.currentPrice + tickSize * (i + 1),
        quantity: Math.random() * 10 + 1,
      });
    }
    
    this.lastOrderbook = {
      symbol: this.symbol,
      bids,
      asks,
      timestamp: new Date(),
    };
    
    return this.lastOrderbook;
  }

  subscribePrice(callback: (price: number) => void): void {
    this.priceCallbacks.push(callback);
    
    if (this.currentPrice > 0) {
      callback(this.currentPrice);
    }
  }

  unsubscribePrice(): void {
    this.priceCallbacks = [];
  }

  // ==================== ACCOUNT ====================

  async getBalance(): Promise<BalanceInfo> {
    return { ...this.balance };
  }

  async getPosition(): Promise<PositionInfo | null> {
    if (!this.position) return null;
    return { ...this.position };
  }

  // ==================== CONFIGURATION ====================

  async setLeverage(leverage: number): Promise<void> {
    this.leverage = leverage;
    if (this.position) {
      this.position.leverage = leverage;
    }
  }

  async setMarginMode(mode: 'isolated' | 'cross'): Promise<void> {
    // Paper trading - just log
    console.log(`[GridBotPaperAdapter] Margin mode set to ${mode}`);
  }

  // ==================== HELPERS ====================

  private parseSymbol(symbol: string): { base: string; quote: string } {
    const normalized = symbol.toUpperCase();
    
    if (normalized.includes('USDT')) {
      const base = normalized.replace('USDT', '');
      return { base, quote: 'USDT' };
    }
    
    if (normalized.includes('USD')) {
      const base = normalized.replace('USD', '');
      return { base, quote: 'USD' };
    }
    
    return { base: symbol.slice(0, 3), quote: symbol.slice(3) };
  }

  private applySlippage(price: number, side: 'BUY' | 'SELL'): number {
    const slippage = price * (this.slippagePercent / 100);
    return side === 'BUY' ? price + slippage : price - slippage;
  }

  private calculateUnrealizedPnl(): number {
    if (!this.position) return 0;
    
    return (this.position.markPrice - this.position.entryPrice) * this.position.quantity;
  }

  // ==================== PAPER SPECIFIC ====================

  /**
   * Получить статистику paper trading
   */
  getPaperStats(): {
    initialBalance: number;
    currentBalance: number;
    totalPnl: number;
    totalFees: number;
    realizedPnl: number;
    unrealizedPnl: number;
    position: PositionInfo | null;
  } {
    const totalBalance = 
      this.balance.quoteBalance + 
      this.balance.baseBalance * this.currentPrice;
    
    const unrealizedPnl = this.calculateUnrealizedPnl();
    const realizedPnl = totalBalance - this.initialBalance - unrealizedPnl;
    
    return {
      initialBalance: this.initialBalance,
      currentBalance: totalBalance,
      totalPnl: totalBalance - this.initialBalance,
      totalFees: 0, // Track this
      realizedPnl,
      unrealizedPnl,
      position: this.position,
    };
  }

  /**
   * Сбросить баланс
   */
  resetBalance(newBalance?: number): void {
    const balance = newBalance || this.initialBalance;
    
    this.balance = {
      ...this.balance,
      baseBalance: 0,
      quoteBalance: balance,
      availableBase: 0,
      availableQuote: balance,
    };
    
    this.position = null;
    this.openOrders.clear();
    this.initialBalance = balance;
  }
}
