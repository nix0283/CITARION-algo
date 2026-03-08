/**
 * Real Market Data Provider for Vision Bot
 * 
 * Production-grade data provider with:
 * - Real-time WebSocket streaming from multiple exchanges (Binance, Bybit, OKX)
 * - REST API fallback with intelligent caching
 * - Automatic failover between exchanges
 * - Connection health monitoring and auto-reconnect
 * - Local caching for performance
 * - Data validation and gap detection
 */

import type { MarketData, OHLCV } from './types';
import { BinanceDataFetcher, BybitDataFetcher, OkxDataFetcher, OhlcvService, type ExchangeId } from '../ohlcv-service';
import { db } from '@/lib/db';

// =====================================================
// CONFIGURATION
// =====================================================

export interface WebSocketConfig {
  reconnectInterval: number;
  maxReconnectAttempts: number;
  pingInterval: number;
  connectionTimeout: number;
}

export interface RealtimeCandle {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
  exchange: ExchangeId;
}

export interface PriceTick {
  symbol: string;
  price: number;
  timestamp: Date;
  exchange: ExchangeId;
  bid?: number;
  ask?: number;
}

export type RealtimeDataCallback = (candle: RealtimeCandle) => void;
export type PriceCallback = (tick: PriceTick) => void;

const DEFAULT_WS_CONFIG: WebSocketConfig = {
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  pingInterval: 30000,
  connectionTimeout: 10000,
};

// =====================================================
// EXCHANGE ADAPTERS
// =====================================================

interface ExchangeAdapter {
  name: string;
  wsUrl: (symbol: string, interval: string, marketType: string) => string;
  wsPriceUrl: (symbol: string, marketType: string) => string;
  parseKline: (data: any, symbol: string) => RealtimeCandle | null;
  parsePrice: (data: any, symbol: string) => PriceTick | null;
  subscribeMsg: (symbol: string, interval: string) => any;
  pingMsg: () => any;
}

const EXCHANGE_ADAPTERS: Record<ExchangeId, ExchangeAdapter> = {
  binance: {
    name: 'Binance',
    wsUrl: (symbol, interval, marketType) => {
      const stream = `${symbol.toLowerCase()}@kline_${interval}`;
      return marketType === 'futures' 
        ? `wss://fstream.binance.com/ws/${stream}`
        : `wss://stream.binance.com:9443/ws/${stream}`;
    },
    wsPriceUrl: (symbol, marketType) => {
      const stream = `${symbol.toLowerCase()}@ticker`;
      return marketType === 'futures'
        ? `wss://fstream.binance.com/ws/${stream}`
        : `wss://stream.binance.com:9443/ws/${stream}`;
    },
    parseKline: (data, symbol) => {
      if (!data.k) return null;
      const k = data.k;
      return {
        symbol: k.s || symbol,
        timestamp: new Date(k.t),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isFinal: k.x,
        exchange: 'binance',
      };
    },
    parsePrice: (data, symbol) => {
      if (!data.c) return null;
      return {
        symbol: data.s || symbol,
        price: parseFloat(data.c),
        timestamp: new Date(data.E || Date.now()),
        exchange: 'binance',
        bid: data.b ? parseFloat(data.b) : undefined,
        ask: data.a ? parseFloat(data.a) : undefined,
      };
    },
    subscribeMsg: (symbol, interval) => null, // URL-based subscription
    pingMsg: () => ({ method: 'ping' }),
  },
  bybit: {
    name: 'Bybit',
    wsUrl: (symbol, _interval, marketType) => {
      return marketType === 'futures'
        ? 'wss://stream.bybit.com/v5/public/linear'
        : 'wss://stream.bybit.com/v5/public/spot';
    },
    wsPriceUrl: (symbol, marketType) => {
      return marketType === 'futures'
        ? 'wss://stream.bybit.com/v5/public/linear'
        : 'wss://stream.bybit.com/v5/public/spot';
    },
    parseKline: (data, symbol) => {
      if (data.topic?.includes('kline') && data.data) {
        const k = data.data;
        return {
          symbol: symbol,
          timestamp: new Date(k.start),
          open: parseFloat(k.open),
          high: parseFloat(k.high),
          low: parseFloat(k.low),
          close: parseFloat(k.close),
          volume: parseFloat(k.volume),
          isFinal: k.confirm,
          exchange: 'bybit',
        };
      }
      return null;
    },
    parsePrice: (data, symbol) => {
      if (data.topic?.includes('tickers') && data.data) {
        const d = data.data;
        return {
          symbol: symbol,
          price: parseFloat(d.lastPrice),
          timestamp: new Date(d.ts || Date.now()),
          exchange: 'bybit',
          bid: d.bid1Price ? parseFloat(d.bid1Price) : undefined,
          ask: d.ask1Price ? parseFloat(d.ask1Price) : undefined,
        };
      }
      return null;
    },
    subscribeMsg: (symbol, interval) => ({
      op: 'subscribe',
      args: [`kline.${interval}.${symbol}`],
    }),
    pingMsg: () => ({ op: 'ping' }),
  },
  okx: {
    name: 'OKX',
    wsUrl: (_symbol, _interval, _marketType) => 'wss://ws.okx.com:8443/ws/v5/public',
    wsPriceUrl: (_symbol, _marketType) => 'wss://ws.okx.com:8443/ws/v5/public',
    parseKline: (data, symbol) => {
      if (data.arg?.channel?.includes('candle') && data.data) {
        const k = data.data[0];
        return {
          symbol: symbol,
          timestamp: new Date(parseInt(k[0])),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          isFinal: k[8] === '1',
          exchange: 'okx',
        };
      }
      return null;
    },
    parsePrice: (data, symbol) => {
      if (data.arg?.channel?.includes('tickers') && data.data) {
        const d = data.data[0];
        return {
          symbol: symbol,
          price: parseFloat(d.last),
          timestamp: new Date(d.ts || Date.now()),
          exchange: 'okx',
          bid: d.bidPx ? parseFloat(d.bidPx) : undefined,
          ask: d.askPx ? parseFloat(d.askPx) : undefined,
        };
      }
      return null;
    },
    subscribeMsg: (symbol, interval) => ({
      op: 'subscribe',
      args: [{ channel: `candle${interval}`, instId: symbol }],
    }),
    pingMsg: () => 'ping',
  },
};

// =====================================================
// TYPES
// =====================================================

export interface DataProviderConfig {
  primaryExchange: ExchangeId;
  fallbackExchanges: ExchangeId[];
  cacheTimeMs: number;
  maxRetries: number;
  enableWebSocket: boolean;
  validateData: boolean;
}

export interface MarketDataResult {
  symbol: string;
  data: MarketData[];
  exchange: ExchangeId;
  timestamp: Date;
  cached: boolean;
}

export interface MultiSymbolData {
  [symbol: string]: MarketData[];
}

export interface ConnectionStatus {
  exchange: ExchangeId;
  symbol: string;
  type: 'kline' | 'price';
  connected: boolean;
  lastMessage: Date | null;
  reconnectAttempts: number;
}

// =====================================================
// DEFAULT CONFIG
// =====================================================

const DEFAULT_CONFIG: DataProviderConfig = {
  primaryExchange: 'binance',
  fallbackExchanges: ['bybit', 'okx'],
  cacheTimeMs: 60000,
  maxRetries: 3,
  enableWebSocket: true,
  validateData: true,
};

// =====================================================
// REAL DATA PROVIDER
// =====================================================

export class RealDataProvider {
  private config: DataProviderConfig;
  private cache: Map<string, { data: MarketData[]; timestamp: Date }> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();
  private wsCallbacks: Map<string, Set<RealtimeDataCallback>> = new Map();
  private priceCallbacks: Map<string, Set<PriceCallback>> = new Map();
  private latestCandles: Map<string, RealtimeCandle> = new Map();
  private latestPrices: Map<string, PriceTick> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private connectionStatus: Map<string, ConnectionStatus> = new Map();
  private priceStreams: Map<string, WebSocket> = new Map();
  
  constructor(config: Partial<DataProviderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  // =====================================================
  // PUBLIC API - HISTORICAL DATA
  // =====================================================
  
  /**
   * Fetch market data for a single symbol with exchange failover
   */
  async fetchMarketData(
    symbol: string,
    timeframe: string = '1h',
    lookbackDays: number = 30,
    marketType: 'spot' | 'futures' = 'futures'
  ): Promise<MarketDataResult> {
    const cacheKey = `${symbol}_${timeframe}_${lookbackDays}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp.getTime() < this.config.cacheTimeMs) {
      return {
        symbol,
        data: cached.data,
        exchange: this.config.primaryExchange,
        timestamp: cached.timestamp,
        cached: true,
      };
    }
    
    // Try to get from database first
    let data: MarketData[] = await this.getFromDatabase(symbol, timeframe, lookbackDays);
    
    if (data.length === 0) {
      // Fetch from exchanges with failover
      const exchanges = [this.config.primaryExchange, ...this.config.fallbackExchanges];
      let lastError: Error | null = null;
      let usedExchange: ExchangeId = this.config.primaryExchange;
      
      for (const exchange of exchanges) {
        try {
          data = await this.fetchFromExchange(symbol, timeframe, lookbackDays, exchange, marketType);
          usedExchange = exchange;
          console.log(`[DataProvider] Fetched ${data.length} candles for ${symbol} from ${exchange}`);
          break;
        } catch (error) {
          lastError = error as Error;
          console.warn(`[DataProvider] Failed to fetch from ${exchange}:`, error);
        }
      }
      
      if (data.length === 0) {
        throw lastError || new Error(`Failed to fetch data for ${symbol} from all exchanges`);
      }
      
      // Update cache
      this.cache.set(cacheKey, { data, timestamp: new Date() });
    }
    
    return {
      symbol,
      data,
      exchange: this.config.primaryExchange,
      timestamp: new Date(),
      cached: false,
    };
  }
  
  /**
   * Fetch market data for multiple symbols with rate limiting
   */
  async fetchMultiSymbolData(
    symbols: string[],
    timeframe: string = '1h',
    lookbackDays: number = 30,
    marketType: 'spot' | 'futures' = 'futures'
  ): Promise<MultiSymbolData> {
    const results: MultiSymbolData = {};
    const batchSize = 3;
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      const promises = batch.map(async (symbol) => {
        try {
          const result = await this.fetchMarketData(symbol, timeframe, lookbackDays, marketType);
          return { symbol, data: result.data };
        } catch (error) {
          console.error(`[DataProvider] Failed to fetch ${symbol}:`, error);
          return { symbol, data: [] };
        }
      });
      
      const batchResults = await Promise.all(promises);
      
      for (const { symbol, data } of batchResults) {
        if (data.length > 0) {
          results[symbol] = data;
        }
      }
      
      // Rate limiting between batches
      if (i + batchSize < symbols.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    return results;
  }
  
  /**
   * Get latest price for a symbol
   */
  async getLatestPrice(
    symbol: string,
    exchange: ExchangeId = 'binance'
  ): Promise<number> {
    // Check live price first
    const livePrice = this.latestPrices.get(`${symbol}_${exchange}`);
    if (livePrice) {
      return livePrice.price;
    }
    
    try {
      const data = await this.fetchMarketData(symbol, '1h', 1);
      return data.data[data.data.length - 1]?.close || 0;
    } catch {
      return 0;
    }
  }
  
  /**
   * Get prices for multiple symbols
   */
  async getLatestPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    
    for (const symbol of symbols) {
      const price = await this.getLatestPrice(symbol);
      prices.set(symbol, price);
    }
    
    return prices;
  }
  
  // =====================================================
  // PUBLIC API - REAL-TIME STREAMING
  // =====================================================
  
  /**
   * Subscribe to real-time candle updates via WebSocket
   */
  subscribeToRealtime(
    symbol: string,
    interval: string = '1h',
    callback: RealtimeDataCallback,
    marketType: 'spot' | 'futures' = 'futures'
  ): () => void {
    const key = `${symbol}_${interval}_${marketType}_kline`;
    
    // Add callback to set
    if (!this.wsCallbacks.has(key)) {
      this.wsCallbacks.set(key, new Set());
    }
    this.wsCallbacks.get(key)!.add(callback);
    
    // Start WebSocket if not already connected
    if (!this.wsConnections.has(key)) {
      this.startKlineWebSocket(symbol, interval, marketType);
    }
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.wsCallbacks.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.stopWebSocket(key);
        }
      }
    };
  }
  
  /**
   * Subscribe to real-time price updates
   */
  subscribeToPrice(
    symbol: string,
    callback: PriceCallback,
    marketType: 'spot' | 'futures' = 'futures'
  ): () => void {
    const key = `${symbol}_${marketType}_price`;
    
    if (!this.priceCallbacks.has(key)) {
      this.priceCallbacks.set(key, new Set());
    }
    this.priceCallbacks.get(key)!.add(callback);
    
    if (!this.priceStreams.has(key)) {
      this.startPriceWebSocket(symbol, marketType);
    }
    
    return () => {
      const callbacks = this.priceCallbacks.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.stopPriceStream(key);
        }
      }
    };
  }
  
  /**
   * Get latest real-time candle
   */
  getLatestRealtimeCandle(symbol: string, interval: string = '1h'): RealtimeCandle | null {
    const key = `${symbol}_${interval}_futures_kline`;
    return this.latestCandles.get(key) || null;
  }
  
  /**
   * Get latest real-time price
   */
  getLatestRealtimePrice(symbol: string): PriceTick | null {
    const key = `${symbol}_futures_price`;
    return this.latestPrices.get(key) || null;
  }
  
  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(symbol: string, interval: string = '1h'): boolean {
    const key = `${symbol}_${interval}_futures_kline`;
    const ws = this.wsConnections.get(key);
    return ws?.readyState === WebSocket.OPEN;
  }
  
  /**
   * Get all active WebSocket connections
   */
  getActiveConnections(): ConnectionStatus[] {
    return Array.from(this.connectionStatus.values());
  }
  
  // =====================================================
  // PUBLIC API - CACHE MANAGEMENT
  // =====================================================
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Get cached data count
   */
  getCacheSize(): number {
    return this.cache.size;
  }
  
  // =====================================================
  // WEBSOCKET MANAGEMENT
  // =====================================================
  
  private startKlineWebSocket(
    symbol: string,
    interval: string,
    marketType: 'spot' | 'futures'
  ): void {
    if (!this.config.enableWebSocket) {
      return;
    }
    
    const key = `${symbol}_${interval}_${marketType}_kline`;
    const adapter = EXCHANGE_ADAPTERS[this.config.primaryExchange];
    const wsUrl = adapter.wsUrl(symbol, interval, marketType);
    
    console.log(`[DataProvider] Starting kline WebSocket: ${key}`);
    
    try {
      const ws = new WebSocket(wsUrl);
      this.wsConnections.set(key, ws);
      this.reconnectAttempts.set(key, 0);
      
      // Update connection status
      this.connectionStatus.set(key, {
        exchange: this.config.primaryExchange,
        symbol,
        type: 'kline',
        connected: false,
        lastMessage: null,
        reconnectAttempts: 0,
      });
      
      ws.onopen = () => {
        console.log(`[DataProvider] WebSocket connected: ${key}`);
        this.reconnectAttempts.set(key, 0);
        this.startPing(key, ws);
        
        // Update status
        const status = this.connectionStatus.get(key);
        if (status) {
          status.connected = true;
          status.reconnectAttempts = 0;
        }
        
        // Send subscription message if needed
        const subMsg = adapter.subscribeMsg(symbol, interval);
        if (subMsg) {
          ws.send(JSON.stringify(subMsg));
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const candle = adapter.parseKline(data, symbol);
          
          if (candle) {
            // Store latest candle
            this.latestCandles.set(key, candle);
            
            // Update status
            const status = this.connectionStatus.get(key);
            if (status) {
              status.lastMessage = new Date();
            }
            
            // Notify subscribers
            const callbacks = this.wsCallbacks.get(key);
            if (callbacks) {
              for (const callback of callbacks) {
                try {
                  callback(candle);
                } catch (error) {
                  console.error(`[DataProvider] Callback error:`, error);
                }
              }
            }
            
            // Store final candles to database
            if (candle.isFinal) {
              this.storeCandleToDatabase(candle);
            }
          }
        } catch (error) {
          // Ignore parse errors for non-kline messages (ping/pong, etc.)
        }
      };
      
      ws.onerror = (error) => {
        console.error(`[DataProvider] WebSocket error: ${key}`, error);
      };
      
      ws.onclose = () => {
        console.log(`[DataProvider] WebSocket closed: ${key}`);
        this.stopPing(key);
        
        // Update status
        const status = this.connectionStatus.get(key);
        if (status) {
          status.connected = false;
        }
        
        this.handleReconnect(key, symbol, interval, marketType, 'kline');
      };
    } catch (error) {
      console.error(`[DataProvider] Failed to create WebSocket:`, error);
    }
  }
  
  private startPriceWebSocket(
    symbol: string,
    marketType: 'spot' | 'futures'
  ): void {
    if (!this.config.enableWebSocket) {
      return;
    }
    
    const key = `${symbol}_${marketType}_price`;
    const adapter = EXCHANGE_ADAPTERS[this.config.primaryExchange];
    const wsUrl = adapter.wsPriceUrl(symbol, marketType);
    
    console.log(`[DataProvider] Starting price WebSocket: ${key}`);
    
    try {
      const ws = new WebSocket(wsUrl);
      this.priceStreams.set(key, ws);
      
      this.connectionStatus.set(key, {
        exchange: this.config.primaryExchange,
        symbol,
        type: 'price',
        connected: false,
        lastMessage: null,
        reconnectAttempts: 0,
      });
      
      ws.onopen = () => {
        console.log(`[DataProvider] Price WebSocket connected: ${key}`);
        this.startPing(key, ws);
        
        const status = this.connectionStatus.get(key);
        if (status) {
          status.connected = true;
        }
        
        // For Bybit/OKX, need to subscribe
        if (this.config.primaryExchange !== 'binance') {
          const subMsg = {
            op: 'subscribe',
            args: this.config.primaryExchange === 'bybit'
              ? [`tickers.${symbol}`]
              : [{ channel: 'tickers', instId: symbol.replace('USDT', '-USDT') }],
          };
          ws.send(JSON.stringify(subMsg));
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const tick = adapter.parsePrice(data, symbol);
          
          if (tick) {
            this.latestPrices.set(key, tick);
            
            const status = this.connectionStatus.get(key);
            if (status) {
              status.lastMessage = new Date();
            }
            
            const callbacks = this.priceCallbacks.get(key);
            if (callbacks) {
              for (const callback of callbacks) {
                try {
                  callback(tick);
                } catch (error) {
                  console.error(`[DataProvider] Price callback error:`, error);
                }
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      };
      
      ws.onerror = (error) => {
        console.error(`[DataProvider] Price WebSocket error: ${key}`, error);
      };
      
      ws.onclose = () => {
        console.log(`[DataProvider] Price WebSocket closed: ${key}`);
        this.stopPing(key);
        
        const status = this.connectionStatus.get(key);
        if (status) {
          status.connected = false;
        }
        
        this.handleReconnect(key, symbol, '1m', marketType, 'price');
      };
    } catch (error) {
      console.error(`[DataProvider] Failed to create price WebSocket:`, error);
    }
  }
  
  private handleReconnect(
    key: string,
    symbol: string,
    interval: string,
    marketType: 'spot' | 'futures',
    type: 'kline' | 'price'
  ): void {
    const attempts = this.reconnectAttempts.get(key) || 0;
    
    if (attempts < DEFAULT_WS_CONFIG.maxReconnectAttempts) {
      this.reconnectAttempts.set(key, attempts + 1);
      
      // Exponential backoff with jitter
      const delay = DEFAULT_WS_CONFIG.reconnectInterval * Math.pow(1.5, attempts);
      const jitter = Math.random() * 1000;
      
      console.log(`[DataProvider] Reconnecting (${attempts + 1}/${DEFAULT_WS_CONFIG.maxReconnectAttempts}): ${key} in ${Math.round(delay + jitter)}ms`);
      
      setTimeout(() => {
        if (type === 'kline') {
          this.startKlineWebSocket(symbol, interval, marketType);
        } else {
          this.startPriceWebSocket(symbol, marketType);
        }
      }, delay + jitter);
    } else {
      console.error(`[DataProvider] Max reconnect attempts reached: ${key}`);
    }
  }
  
  private startPing(key: string, ws: WebSocket): void {
    const adapter = EXCHANGE_ADAPTERS[this.config.primaryExchange];
    const pingMsg = adapter.pingMsg();
    
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        if (typeof pingMsg === 'string') {
          ws.send(pingMsg);
        } else {
          ws.send(JSON.stringify(pingMsg));
        }
      }
    }, DEFAULT_WS_CONFIG.pingInterval);
    
    this.pingIntervals.set(key, interval);
  }
  
  private stopPing(key: string): void {
    const interval = this.pingIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(key);
    }
  }
  
  private stopWebSocket(key: string): void {
    const ws = this.wsConnections.get(key);
    if (ws) {
      this.stopPing(key);
      ws.close();
      this.wsConnections.delete(key);
    }
    this.wsCallbacks.delete(key);
    this.latestCandles.delete(key);
    this.reconnectAttempts.delete(key);
    this.connectionStatus.delete(key);
  }
  
  private stopPriceStream(key: string): void {
    const ws = this.priceStreams.get(key);
    if (ws) {
      this.stopPing(key);
      ws.close();
      this.priceStreams.delete(key);
    }
    this.priceCallbacks.delete(key);
    this.latestPrices.delete(key);
    this.connectionStatus.delete(key);
  }
  
  // =====================================================
  // PRIVATE METHODS - DATA PERSISTENCE
  // =====================================================
  
  private async getFromDatabase(
    symbol: string,
    timeframe: string,
    lookbackDays: number
  ): Promise<MarketData[]> {
    try {
      const startTime = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      
      const candles = await db.ohlcvCandle.findMany({
        where: {
          symbol,
          timeframe,
          openTime: { gte: startTime },
        },
        orderBy: { openTime: 'asc' },
      });
      
      if (candles.length === 0) return [];
      
      return candles.map(c => ({
        symbol: c.symbol,
        timestamp: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    } catch (error) {
      console.warn('[DataProvider] Database query failed:', error);
      return [];
    }
  }
  
  private async storeCandleToDatabase(candle: RealtimeCandle): Promise<void> {
    try {
      await db.ohlcvCandle.upsert({
        where: {
          symbol_exchange_timeframe_openTime: {
            symbol: candle.symbol,
            exchange: candle.exchange,
            timeframe: '1h',
            openTime: candle.timestamp,
          },
        },
        update: {
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          isFinal: true,
        },
        create: {
          symbol: candle.symbol,
          exchange: candle.exchange,
          marketType: 'futures',
          timeframe: '1h',
          openTime: candle.timestamp,
          closeTime: new Date(candle.timestamp.getTime() + 60 * 60 * 1000),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          isFinal: true,
        },
      });
    } catch (error) {
      console.error(`[DataProvider] Failed to store candle:`, error);
    }
  }
  
  private async fetchFromExchange(
    symbol: string,
    timeframe: string,
    lookbackDays: number,
    exchange: ExchangeId,
    marketType: 'spot' | 'futures'
  ): Promise<MarketData[]> {
    const startTime = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    
    let candles: any[] = [];
    
    switch (exchange) {
      case 'binance':
        candles = await BinanceDataFetcher.fetchKlines({
          symbol,
          interval: timeframe,
          limit: Math.min(lookbackDays * 24, 1000),
          startTime,
          marketType,
        });
        break;
      case 'bybit':
        candles = await BybitDataFetcher.fetchKlines({
          symbol,
          interval: timeframe,
          limit: 200,
          startTime,
          marketType,
        });
        break;
      case 'okx':
        candles = await OkxDataFetcher.fetchKlines({
          symbol,
          interval: timeframe,
          limit: 300,
          startTime,
          marketType,
        });
        break;
    }
    
    if (candles.length === 0) {
      throw new Error(`No candles returned for ${symbol} from ${exchange}`);
    }
    
    // Store in database for future use
    await OhlcvService.storeCandles(candles).catch(err => {
      console.warn('[DataProvider] Failed to store candles:', err);
    });
    
    // Convert to MarketData format
    return candles.map(c => ({
      symbol: c.symbol,
      timestamp: c.openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }
  
  /**
   * Cleanup all resources
   */
  destroy(): void {
    // Close all WebSocket connections
    for (const key of this.wsConnections.keys()) {
      this.stopWebSocket(key);
    }
    
    for (const key of this.priceStreams.keys()) {
      this.stopPriceStream(key);
    }
    
    // Clear caches
    this.cache.clear();
    this.latestCandles.clear();
    this.latestPrices.clear();
    this.wsCallbacks.clear();
    this.priceCallbacks.clear();
    this.connectionStatus.clear();
  }
}

// =====================================================
// DATA SYNC SERVICE
// =====================================================

export class DataSyncService {
  private provider: RealDataProvider;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  
  constructor(provider?: RealDataProvider) {
    this.provider = provider || new RealDataProvider();
  }
  
  /**
   * Start periodic data sync
   */
  startSync(
    symbols: string[],
    timeframe: string = '1h',
    intervalMinutes: number = 60
  ): void {
    if (this.isRunning) {
      console.log('[DataSync] Already running');
      return;
    }
    
    this.isRunning = true;
    
    // Initial sync
    this.syncData(symbols, timeframe);
    
    // Periodic sync
    this.syncInterval = setInterval(
      () => this.syncData(symbols, timeframe),
      intervalMinutes * 60 * 1000
    );
    
    console.log(`[DataSync] Started with ${intervalMinutes}min interval for ${symbols.length} symbols`);
  }
  
  /**
   * Stop periodic sync
   */
  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log('[DataSync] Stopped');
  }
  
  /**
   * Sync data for all symbols
   */
  private async syncData(symbols: string[], timeframe: string): Promise<void> {
    console.log(`[DataSync] Syncing data for ${symbols.length} symbols...`);
    
    try {
      await this.provider.fetchMultiSymbolData(symbols, timeframe, 30);
      console.log('[DataSync] Sync completed');
    } catch (error) {
      console.error('[DataSync] Sync failed:', error);
    }
  }
  
  /**
   * Get sync status
   */
  getStatus(): { isRunning: boolean; cacheSize: number; connections: any[] } {
    return {
      isRunning: this.isRunning,
      cacheSize: this.provider.getCacheSize(),
      connections: this.provider.getActiveConnections(),
    };
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Convert OHLCV array to MarketData array
 */
export function ohlcvToMarketData(ohlcv: OHLCV[], symbol: string): MarketData[] {
  return ohlcv.map(o => ({
    symbol,
    timestamp: new Date(o.timestamp),
    open: o.open,
    high: o.high,
    low: o.low,
    close: o.close,
    volume: o.volume,
  }));
}

/**
 * Validate market data quality
 */
export function validateMarketData(data: MarketData[]): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  if (data.length < 50) {
    issues.push(`Insufficient data: ${data.length} candles (min 50)`);
  }
  
  // Check for gaps
  for (let i = 1; i < data.length; i++) {
    const expectedTime = new Date(data[i - 1].timestamp.getTime() + 60 * 60 * 1000);
    if (Math.abs(data[i].timestamp.getTime() - expectedTime.getTime()) > 5 * 60 * 1000) {
      issues.push(`Gap detected at ${data[i].timestamp}`);
      break;
    }
  }
  
  // Check for invalid values
  for (const candle of data) {
    if (candle.close <= 0 || candle.high <= 0 || candle.low <= 0 || candle.open <= 0) {
      issues.push(`Invalid price in candle at ${candle.timestamp}`);
      break;
    }
    
    if (candle.high < candle.low) {
      issues.push(`High < Low at ${candle.timestamp}`);
      break;
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

// =====================================================
// SINGLETON
// =====================================================

let dataProvider: RealDataProvider | null = null;
let dataSyncService: DataSyncService | null = null;

export function getRealDataProvider(): RealDataProvider {
  if (!dataProvider) {
    dataProvider = new RealDataProvider();
  }
  return dataProvider;
}

export function getDataSyncService(): DataSyncService {
  if (!dataSyncService) {
    dataSyncService = new DataSyncService(getRealDataProvider());
  }
  return dataSyncService;
}

export default RealDataProvider;
