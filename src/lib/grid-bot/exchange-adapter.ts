/**
 * Grid Bot Exchange Adapter
 * 
 * Адаптер для подключения Grid Bot к реальным биржам.
 * Поддерживает: Binance, Bybit, OKX, Bitget, BingX
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
import { BaseExchangeClient } from '../exchange/base-client';
import { BinanceClient } from '../exchange/binance-client';
import { BybitClient } from '../exchange/bybit-client';
import { OKXClient } from '../exchange/okx-client';
import { EventEmitter } from 'events';

// ==================== GRID BOT EXCHANGE ADAPTER ====================

export class GridBotExchangeAdapter extends EventEmitter implements GridBotAdapter {
  private exchangeClient: BaseExchangeClient;
  private exchange: string;
  private symbol: string;
  private connected: boolean = false;
  private priceCallbacks: ((price: number) => void)[] = [];
  private wsConnection: any = null;
  private lastPrice: number = 0;
  private lastOrderbook: OrderbookSnapshot | null = null;

  constructor(
    exchange: string,
    symbol: string,
    credentials: { apiKey: string; apiSecret: string },
    testnet: boolean = false
  ) {
    super();
    this.exchange = exchange;
    this.symbol = symbol;
    
    // Create exchange client
    this.exchangeClient = this.createExchangeClient(exchange, credentials, testnet);
  }

  /**
   * Создать клиент биржи
   */
  private createExchangeClient(
    exchange: string,
    credentials: { apiKey: string; apiSecret: string },
    testnet: boolean
  ): BaseExchangeClient {
    switch (exchange.toLowerCase()) {
      case 'binance':
        return new BinanceClient(credentials, 'futures', testnet);
      case 'bybit':
        return new BybitClient(credentials, 'futures', testnet);
      case 'okx':
        return new OKXClient(credentials, 'futures', testnet);
      // case 'bitget':
      //   return new BitgetClient(credentials, 'futures', testnet);
      // case 'bingx':
      //   return new BingXClient(credentials, 'futures', testnet);
      default:
        throw new Error(`Unsupported exchange: ${exchange}`);
    }
  }

  // ==================== CONNECTION ====================

  async connect(): Promise<void> {
    try {
      // Test connection
      const result = await this.exchangeClient.testConnection();
      
      if (!result.success) {
        throw new Error(`Failed to connect: ${result.message}`);
      }
      
      this.connected = true;
      
      // Get initial price
      this.lastPrice = await this.getCurrentPrice();
      
      // Start WebSocket connection for real-time updates
      await this.startWebSocket();
      
      console.log(`[GridBotAdapter] Connected to ${this.exchange} for ${this.symbol}`);
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.priceCallbacks = [];
    
    if (this.wsConnection) {
      // Close WebSocket
      if (typeof this.wsConnection.close === 'function') {
        this.wsConnection.close();
      } else if (typeof this.wsConnection.disconnect === 'function') {
        this.wsConnection.disconnect();
      }
      this.wsConnection = null;
    }
    
    console.log(`[GridBotAdapter] Disconnected from ${this.exchange}`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ==================== WEBSOCKET ====================

  /**
   * Запустить WebSocket для real-time данных
   */
  private async startWebSocket(): Promise<void> {
    try {
      const { io } = await import('socket.io-client');
      
      // Connect to our price service
      this.wsConnection = io('/?XTransformPort=3002');
      
      this.wsConnection.on('connect', () => {
        console.log(`[GridBotAdapter] WebSocket connected`);
        
        // Subscribe to price updates
        this.wsConnection.emit('subscribe_exchange', {
          exchange: this.exchange,
          type: 'futures',
        });
      });
      
      this.wsConnection.on('price_update', (data: any) => {
        if (data.symbol === this.symbol || this.normalizeSymbol(data.symbol) === this.normalizeSymbol(this.symbol)) {
          this.lastPrice = data.price;
          this.emit('price', data.price);
          
          // Notify all callbacks
          for (const callback of this.priceCallbacks) {
            callback(data.price);
          }
        }
      });
      
      this.wsConnection.on('disconnect', () => {
        console.log(`[GridBotAdapter] WebSocket disconnected`);
        // Attempt to reconnect
        setTimeout(() => this.startWebSocket(), 5000);
      });
      
      this.wsConnection.on('error', (error: any) => {
        console.error(`[GridBotAdapter] WebSocket error:`, error);
      });
    } catch (error) {
      console.error(`[GridBotAdapter] Failed to start WebSocket:`, error);
      // Fallback to polling
      this.startPolling();
    }
  }

  /**
   * Fallback polling для цен
   */
  private startPolling(): void {
    const pollInterval = setInterval(async () => {
      if (!this.connected) {
        clearInterval(pollInterval);
        return;
      }
      
      try {
        const price = await this.getCurrentPrice();
        this.lastPrice = price;
        
        for (const callback of this.priceCallbacks) {
          callback(price);
        }
      } catch (error) {
        console.error('[GridBotAdapter] Polling error:', error);
      }
    }, 5000);
  }

  // ==================== MARKET DATA ====================

  async getCurrentPrice(): Promise<number> {
    try {
      const ticker = await this.exchangeClient.getTicker(this.symbol);
      return ticker.last;
    } catch (error) {
      console.error('[GridBotAdapter] Failed to get price:', error);
      return this.lastPrice;
    }
  }

  async getOrderbook(depth: number = 20): Promise<OrderbookSnapshot> {
    try {
      const orderbook = await this.exchangeClient.getOrderbook(this.symbol, depth);
      
      const snapshot: OrderbookSnapshot = {
        symbol: this.symbol,
        bids: orderbook.bids.map(b => ({ price: b.price, quantity: b.quantity })),
        asks: orderbook.asks.map(a => ({ price: a.price, quantity: a.quantity })),
        timestamp: new Date(),
      };
      
      this.lastOrderbook = snapshot;
      return snapshot;
    } catch (error) {
      console.error('[GridBotAdapter] Failed to get orderbook:', error);
      return this.lastOrderbook || {
        symbol: this.symbol,
        bids: [],
        asks: [],
        timestamp: new Date(),
      };
    }
  }

  subscribePrice(callback: (price: number) => void): void {
    this.priceCallbacks.push(callback);
    
    // Send current price immediately
    if (this.lastPrice > 0) {
      callback(this.lastPrice);
    }
  }

  unsubscribePrice(): void {
    this.priceCallbacks = [];
  }

  // ==================== ORDERS ====================

  async placeOrder(request: GridOrderRequest): Promise<GridOrderResult> {
    try {
      const result = await this.exchangeClient.createOrder({
        symbol: request.symbol,
        side: request.side.toLowerCase() as 'buy' | 'sell',
        type: request.type.toLowerCase() as 'limit' | 'market',
        quantity: request.quantity,
        price: request.price,
        clientOrderId: request.clientOrderId,
      });
      
      if (result.success && result.order) {
        const order: GridOrder = {
          id: result.order.id,
          exchangeOrderId: result.order.id,
          side: request.side,
          type: request.type,
          price: result.order.price || request.price || 0,
          quantity: request.quantity,
          status: 'OPEN',
          filledQuantity: result.order.filledQuantity,
          avgPrice: result.order.averagePrice || 0,
          fee: result.order.fee || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        return { success: true, order };
      }
      
      return { success: false, error: result.error };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const result = await this.exchangeClient.cancelOrder({
        symbol: this.symbol,
        orderId,
      });
      
      return result.success;
    } catch (error) {
      console.error(`[GridBotAdapter] Failed to cancel order ${orderId}:`, error);
      return false;
    }
  }

  async getOpenOrders(): Promise<GridOrder[]> {
    try {
      const orders = await this.exchangeClient.getOpenOrders(this.symbol);
      
      return orders.map(o => ({
        id: o.id,
        exchangeOrderId: o.id,
        side: o.side.toUpperCase() as 'BUY' | 'SELL',
        type: o.type.toUpperCase() as 'LIMIT' | 'MARKET',
        price: o.price,
        quantity: o.quantity,
        status: 'OPEN',
        filledQuantity: o.filledQuantity,
        avgPrice: o.avgPrice || 0,
        fee: o.fee || 0,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      }));
    } catch (error) {
      console.error('[GridBotAdapter] Failed to get open orders:', error);
      return [];
    }
  }

  async getOrderStatus(orderId: string): Promise<GridOrder> {
    try {
      // Get from open orders first
      const openOrders = await this.getOpenOrders();
      const openOrder = openOrders.find(o => o.id === orderId);
      
      if (openOrder) {
        return openOrder;
      }
      
      // If not in open orders, it's likely filled
      // Get order history
      const history = await this.exchangeClient.getOrderHistory(this.symbol, 100);
      const historicalOrder = history.find(o => o.id === orderId);
      
      if (historicalOrder) {
        return {
          id: historicalOrder.id,
          exchangeOrderId: historicalOrder.id,
          side: historicalOrder.side.toUpperCase() as 'BUY' | 'SELL',
          type: historicalOrder.type.toUpperCase() as 'LIMIT' | 'MARKET',
          price: historicalOrder.price,
          quantity: historicalOrder.quantity,
          status: 'FILLED',
          filledQuantity: historicalOrder.filledQuantity,
          avgPrice: historicalOrder.avgPrice || historicalOrder.price,
          fee: historicalOrder.fee || 0,
          createdAt: historicalOrder.createdAt,
          updatedAt: historicalOrder.updatedAt,
        };
      }
      
      throw new Error(`Order ${orderId} not found`);
    } catch (error) {
      console.error(`[GridBotAdapter] Failed to get order status:`, error);
      throw error;
    }
  }

  // ==================== ACCOUNT ====================

  async getBalance(): Promise<BalanceInfo> {
    try {
      const accountInfo = await this.exchangeClient.getAccountInfo();
      
      // Extract base and quote assets
      const symbolInfo = this.parseSymbol(this.symbol);
      const baseAsset = symbolInfo.base;
      const quoteAsset = symbolInfo.quote;
      
      const baseBalance = accountInfo.balances.find(b => b.currency === baseAsset);
      const quoteBalance = accountInfo.balances.find(b => b.currency === quoteAsset);
      
      return {
        baseAsset,
        quoteAsset,
        baseBalance: baseBalance?.total || 0,
        quoteBalance: quoteBalance?.total || 0,
        availableBase: baseBalance?.available || 0,
        availableQuote: quoteBalance?.available || 0,
      };
    } catch (error) {
      console.error('[GridBotAdapter] Failed to get balance:', error);
      return {
        baseAsset: '',
        quoteAsset: '',
        baseBalance: 0,
        quoteBalance: 0,
        availableBase: 0,
        availableQuote: 0,
      };
    }
  }

  async getPosition(): Promise<PositionInfo | null> {
    try {
      const position = await this.exchangeClient.getPosition(this.symbol);
      
      if (!position) return null;
      
      return {
        symbol: position.symbol,
        side: position.side.toUpperCase() as 'LONG' | 'SHORT',
        quantity: position.quantity,
        entryPrice: position.entryPrice,
        markPrice: position.markPrice,
        unrealizedPnl: position.unrealizedPnl,
        leverage: position.leverage,
        margin: position.margin,
        liquidationPrice: position.liquidationPrice,
      };
    } catch (error) {
      console.error('[GridBotAdapter] Failed to get position:', error);
      return null;
    }
  }

  // ==================== CONFIGURATION ====================

  async setLeverage(leverage: number): Promise<void> {
    try {
      await this.exchangeClient.setLeverage({
        symbol: this.symbol,
        leverage,
        marginMode: 'isolated',
      });
    } catch (error) {
      console.error('[GridBotAdapter] Failed to set leverage:', error);
    }
  }

  async setMarginMode(mode: 'isolated' | 'cross'): Promise<void> {
    try {
      await this.exchangeClient.setLeverage({
        symbol: this.symbol,
        leverage: 1, // Will be overridden
        marginMode: mode,
      });
    } catch (error) {
      console.error('[GridBotAdapter] Failed to set margin mode:', error);
    }
  }

  // ==================== HELPERS ====================

  private parseSymbol(symbol: string): { base: string; quote: string } {
    // Common patterns: BTCUSDT, BTC-USDT, BTC_USDT
    const separators = ['USDT', 'USD', 'BUSD', '-USDT', '_USDT'];
    
    for (const sep of separators) {
      if (symbol.includes(sep)) {
        const parts = symbol.split(sep.replace('-', '').replace('_', ''));
        return {
          base: parts[0] || 'BTC',
          quote: sep.replace('-', '').replace('_', '') || 'USDT',
        };
      }
    }
    
    // Default
    return {
      base: symbol.slice(0, 3),
      quote: symbol.slice(3),
    };
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase().replace(/[-_]/g, '');
  }
}
