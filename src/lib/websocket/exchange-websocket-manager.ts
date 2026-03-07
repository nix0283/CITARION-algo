/**
 * Exchange WebSocket Manager
 * 
 * Unified WebSocket infrastructure for all exchanges.
 * Provides real-time price feeds, orderbook updates, and order notifications.
 * 
 * Features:
 * - State recovery on reconnection
 * - Message buffering during disconnection
 * - Sequence number validation
 * - Gap detection and handling
 * 
 * Supported exchanges:
 * - Binance (Spot, Futures)
 * - Bybit (Spot, Linear, Inverse)
 * - OKX (Spot, Futures)
 * - Bitget (Spot, Futures)
 * - BingX (Futures)
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  WSStateRecovery,
  OrderbookRecovery,
  wsStateRecovery,
  orderbookRecovery,
  type WSRecoveryConfig,
  type ReconnectionResult,
  type WSMessage,
  type DeltaMessage,
  type OrderbookSnapshot,
  type WSState,
} from './state-recovery';

// ==================== TYPES ====================

export interface WSConfig {
  exchange: string;
  channels: string[];
  symbol: string;
  accountType?: 'spot' | 'futures' | 'linear' | 'inverse';
  onMessage: (data: any) => void;
  onError?: (error: Error) => void;
  onReconnect?: () => void;
  onConnect?: () => void;
  onRecovery?: (result: ReconnectionResult) => void;
  /** Enable state recovery on reconnection */
  enableRecovery?: boolean;
  /** Recovery configuration overrides */
  recoveryConfig?: Partial<WSRecoveryConfig>;
}

export interface PriceUpdate {
  exchange: string;
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  timestamp: Date;
}

export interface OrderbookUpdate {
  exchange: string;
  symbol: string;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  timestamp: Date;
  sequence?: number;
  isSnapshot?: boolean;
}

export interface TradeUpdate {
  exchange: string;
  symbol: string;
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: Date;
}

export interface KlineUpdate {
  exchange: string;
  symbol: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export interface OrderUpdate {
  exchange: string;
  symbol: string;
  orderId: string;
  clientOrderId?: string;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED';
  side: 'BUY' | 'SELL';
  type: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  avgPrice: number;
  timestamp: Date;
}

export interface PositionUpdate {
  exchange: string;
  symbol: string;
  side: 'LONG' | 'SHORT' | 'NONE';
  quantity: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice?: number;
  timestamp: Date;
}

export interface WSConnectionState {
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'RECOVERING';
  lastConnected?: Date;
  lastDisconnected?: Date;
  reconnectAttempts: number;
  messagesReceived: number;
  errors: number;
  /** Last known sequence number */
  lastSequence?: number;
  /** Whether recovery is in progress */
  recoveryInProgress?: boolean;
  /** Last recovery result */
  lastRecovery?: ReconnectionResult;
}

// ==================== WEBSOCKET URLs ====================

const WS_URLS: Record<string, Record<string, string>> = {
  binance: {
    spot: 'wss://stream.binance.com:9443/ws',
    futures: 'wss://fstream.binance.com/ws',
  },
  bybit: {
    spot: 'wss://stream.bybit.com/v5/public/spot',
    linear: 'wss://stream.bybit.com/v5/public/linear',
    inverse: 'wss://stream.bybit.com/v5/public/inverse',
  },
  okx: {
    public: 'wss://ws.okx.com:8443/ws/v5/public',
    private: 'wss://ws.okx.com:8443/ws/v5/private',
  },
  bitget: {
    spot: 'wss://ws.bitget.com/v2/ws/public',
    futures: 'wss://ws.bitget.com/v2/ws/public',
  },
  bingx: {
    futures: 'wss://open-api-ws.bingx.com/market',
  },
};

// ==================== EXCHANGE WEBSOCKET MANAGER ====================

export class ExchangeWebSocketManager extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private connectionStates: Map<string, WSConnectionState> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private maxReconnectAttempts = 10;
  private reconnectBaseDelay = 1000;
  private maxReconnectDelay = 60000; // 60 seconds max
  private jitterFactor = 0.3; // 30% jitter to prevent thundering herd
  private subscriptions: Map<string, Set<string>> = new Map();
  private configs: Map<string, WSConfig> = new Map();
  private wsRecovery: WSStateRecovery;
  private orderbookRecovery: OrderbookRecovery;
  
  // Track sequence numbers per subscription
  private sequenceNumbers: Map<string, number> = new Map();
  
  // Track pending recoveries
  private pendingRecoveries: Map<string, Promise<ReconnectionResult>> = new Map();

  constructor() {
    super();
    this.wsRecovery = wsStateRecovery;
    this.orderbookRecovery = orderbookRecovery;
    
    // Forward recovery events
    this.wsRecovery.on('recovered', (data: { exchange: string; symbol: string; result: ReconnectionResult }) => {
      this.emit('recovered', data);
    });
    
    this.wsRecovery.on('recovery_failed', (data: { exchange: string; symbol: string; result: ReconnectionResult }) => {
      this.emit('recovery_failed', data);
    });
  }

  // ==================== CONNECTION MANAGEMENT ====================

  connect(config: WSConfig): void {
    const key = this.getConnectionKey(config);
    
    if (this.connections.has(key)) {
      console.log(`[WS] Already connected to ${key}`);
      return;
    }

    const url = this.getWebSocketUrl(config);
    if (!url) {
      config.onError?.(new Error(`Unknown WebSocket URL for ${config.exchange}`));
      return;
    }

    this.connectionStates.set(key, {
      status: 'CONNECTING',
      reconnectAttempts: 0,
      messagesReceived: 0,
      errors: 0,
    });

    // Store config for recovery
    this.configs.set(key, config);
    
    this.createConnection(key, url, config);
  }

  private createConnection(key: string, url: string, config: WSConfig): void {
    const ws = new WebSocket(url);
    const isReconnect = this.reconnectAttempts.get(key) !== undefined && this.reconnectAttempts.get(key)! > 0;

    ws.on('open', async () => {
      console.log(`[WS] Connected to ${config.exchange} (${config.accountType || 'default'})${isReconnect ? ' [RECONNECT]' : ''}`);
      
      const state = this.connectionStates.get(key);
      if (state) {
        state.status = 'CONNECTED';
        state.lastConnected = new Date();
        state.reconnectAttempts = 0;
      }

      this.reconnectAttempts.set(key, 0);
      this.connections.set(key, ws);
      this.subscribe(ws, config);
      this.startPing(key, ws, config.exchange);

      // Execute recovery if enabled and this is a reconnect
      if (isReconnect && config.enableRecovery !== false) {
        await this.executeRecovery(key, config);
      }

      config.onConnect?.();
      this.emit('connected', { exchange: config.exchange, key, isReconnect });
    });

    ws.on('message', (data: Buffer) => {
      try {
        const state = this.connectionStates.get(key);
        if (state) state.messagesReceived++;

        const parsed = this.parseMessage(data, config.exchange);
        if (parsed) {
          // Track sequence numbers for recovery
          this.trackSequence(config, parsed);
          
          // Buffer message if recovery is enabled
          if (config.enableRecovery !== false) {
            this.bufferMessage(config, parsed);
          }
          
          config.onMessage(parsed);
          this.emit('message', { exchange: config.exchange, data: parsed, key });
        }
      } catch (error) {
        console.error(`[WS] Parse error:`, error);
      }
    });

    ws.on('error', (error) => {
      console.error(`[WS] Error on ${key}:`, error.message);
      
      const state = this.connectionStates.get(key);
      if (state) state.errors++;

      config.onError?.(error);
      this.emit('error', { exchange: config.exchange, error, key });
    });

    ws.on('close', () => {
      console.log(`[WS] Connection closed: ${key}`);
      
      const state = this.connectionStates.get(key);
      if (state) {
        state.status = 'DISCONNECTED';
        state.lastDisconnected = new Date();
      }

      this.connections.delete(key);
      this.stopPing(key);
      
      this.emit('disconnected', { exchange: config.exchange, key });
      
      this.handleReconnect(config);
    });
  }

  disconnect(exchange: string, symbol: string, accountType?: string): void {
    const key = this.getConnectionKey({ exchange, symbol, accountType: accountType as any, channels: [] });
    const ws = this.connections.get(key);

    if (ws) {
      this.stopPing(key);
      ws.close();
      this.connections.delete(key);
      this.configs.delete(key);
      
      const state = this.connectionStates.get(key);
      if (state) state.status = 'DISCONNECTED';
      
      // Clear recovery state
      this.wsRecovery.clearBuffer(exchange, symbol);
      this.orderbookRecovery.clearOrderbook(exchange, symbol);
    }
  }

  disconnectAll(): void {
    for (const [key, ws] of this.connections) {
      this.stopPing(key);
      ws.close();
    }
    this.connections.clear();
    this.connectionStates.clear();
    this.configs.clear();
    this.wsRecovery.clearAllBuffers();
    this.orderbookRecovery.clearAll();
  }

  // ==================== RECOVERY MANAGEMENT ====================

  /**
   * Track sequence number for a message
   */
  private trackSequence(config: WSConfig, data: any): void {
    const sequence = this.extractSequence(config.exchange, data);
    if (sequence !== null) {
      const key = `${config.exchange}:${config.symbol}:${config.channels[0]}`;
      this.sequenceNumbers.set(key, sequence);
      
      const stateKey = this.getConnectionKey(config);
      const state = this.connectionStates.get(stateKey);
      if (state) {
        state.lastSequence = sequence;
      }
    }
  }

  /**
   * Buffer a message for potential recovery
   */
  private bufferMessage(config: WSConfig, data: any): void {
    const sequence = this.extractSequence(config.exchange, data);
    const channel = config.channels[0] || 'default';
    
    const message: WSMessage = {
      exchange: config.exchange,
      symbol: config.symbol,
      channel,
      sequence: sequence ?? undefined,
      timestamp: Date.now(),
      data,
      isSnapshot: this.isSnapshot(config.exchange, data),
    };

    this.wsRecovery.bufferMessage(message);
  }

  /**
   * Execute recovery process for a connection
   */
  private async executeRecovery(key: string, config: WSConfig): Promise<ReconnectionResult | null> {
    // Check if recovery is already in progress
    if (this.pendingRecoveries.has(key)) {
      return this.pendingRecoveries.get(key)!;
    }

    const state = this.connectionStates.get(key);
    if (state) {
      state.status = 'RECOVERING';
      state.recoveryInProgress = true;
    }

    const channel = config.channels[0] || 'default';
    const lastSeq = this.sequenceNumbers.get(`${config.exchange}:${config.symbol}:${channel}`);

    console.log(`[WS] Starting recovery for ${config.exchange}:${config.symbol}, last seq: ${lastSeq}`);

    const recoveryPromise = this.wsRecovery.executeRecovery(
      config.exchange,
      config.symbol,
      channel,
      config.accountType
    );

    this.pendingRecoveries.set(key, recoveryPromise);

    try {
      const result = await recoveryPromise;
      
      if (state) {
        state.recoveryInProgress = false;
        state.lastRecovery = result;
        if (result.success) {
          state.status = 'CONNECTED';
        }
      }

      // Call recovery callback
      config.onRecovery?.(result);

      // Emit detailed recovery event
      this.emit('recovered', {
        exchange: config.exchange,
        symbol: config.symbol,
        result,
        key,
      });

      console.log(`[WS] Recovery complete for ${config.exchange}:${config.symbol}:`, {
        success: result.success,
        bufferedApplied: result.bufferedApplied,
        missedMessages: result.missedMessages,
        gapsDetected: result.gapsDetected.length,
        recoveryTime: result.recoveryTime,
      });

      return result;
    } catch (error) {
      console.error(`[WS] Recovery failed for ${key}:`, error);
      
      if (state) {
        state.recoveryInProgress = false;
        state.status = 'CONNECTED';
      }

      const result: ReconnectionResult = {
        previousState: 'RECOVERING',
        newState: 'CONNECTED',
        missedMessages: 0,
        bufferedApplied: 0,
        gapsDetected: [],
        recoveryTime: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };

      config.onRecovery?.(result);
      
      return result;
    } finally {
      this.pendingRecoveries.delete(key);
    }
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    bufferSize: number;
    sequenceNumbers: Map<string, number>;
    pendingRecoveries: string[];
  } {
    const bufferStats = this.wsRecovery.getBufferStats();
    return {
      bufferSize: bufferStats.totalMessages,
      sequenceNumbers: new Map(this.sequenceNumbers),
      pendingRecoveries: Array.from(this.pendingRecoveries.keys()),
    };
  }

  /**
   * Force a resync for a symbol
   */
  async forceResync(exchange: string, symbol: string, accountType?: string): Promise<ReconnectionResult | null> {
    const key = `${exchange}-${accountType || 'default'}-${symbol}`;
    const config = this.configs.get(key);
    
    if (!config) {
      console.warn(`[WS] No config found for ${key}, cannot resync`);
      return null;
    }

    return this.executeRecovery(key, config);
  }

  // ==================== SEQUENCE EXTRACTION ====================

  /**
   * Extract sequence number from exchange-specific message
   */
  private extractSequence(exchange: string, data: any): number | null {
    try {
      switch (exchange.toLowerCase()) {
        case 'binance':
          // Binance depth updates have 'u' (final updateId) and 'U' (previous)
          if (data.u !== undefined) return data.u;
          if (data.lastUpdateId !== undefined) return data.lastUpdateId;
          break;

        case 'bybit':
          // Bybit has 'seq' in the response
          if (data.seq !== undefined) return data.seq;
          if (data.data?.seq !== undefined) return data.data.seq;
          break;

        case 'okx':
          // OKX has 'seqId' 
          if (data.seqId !== undefined) return data.seqId;
          if (data.data?.[0]?.seqId !== undefined) return data.data[0].seqId;
          break;

        case 'bitget':
          // Bitget has 'seqId'
          if (data.seqId !== undefined) return data.seqId;
          if (data.data?.seqId !== undefined) return data.data.seqId;
          break;

        case 'bingx':
          // BingX may not have sequence numbers
          if (data.seq !== undefined) return data.seq;
          break;
      }
    } catch (error) {
      // Sequence extraction failed, ignore
    }
    return null;
  }

  /**
   * Check if message is a snapshot (vs delta)
   */
  private isSnapshot(exchange: string, data: any): boolean {
    switch (exchange.toLowerCase()) {
      case 'binance':
        return data.e !== 'depthUpdate' && data.lastUpdateId !== undefined;
      
      case 'bybit':
        return data.type === 'snapshot';
      
      case 'okx':
        return data.action === 'snapshot';
      
      case 'bitget':
        return data.action === 'snapshot';
      
      default:
        return false;
    }
  }

  // ==================== SUBSCRIPTION MANAGEMENT ====================

  private subscribe(ws: WebSocket, config: WSConfig): void {
    let subscribeMsg: any;

    switch (config.exchange.toLowerCase()) {
      case 'binance':
        subscribeMsg = {
          method: 'SUBSCRIBE',
          params: config.channels.map(ch => `${config.symbol.toLowerCase()}@${ch}`),
          id: Date.now(),
        };
        break;

      case 'bybit':
        subscribeMsg = {
          op: 'subscribe',
          args: config.channels.map(ch => `${ch}.${config.symbol}`),
        };
        break;

      case 'okx':
        subscribeMsg = {
          op: 'subscribe',
          args: config.channels.map(ch => ({ channel: ch, instId: config.symbol })),
        };
        break;

      case 'bitget':
        subscribeMsg = {
          op: 'subscribe',
          args: config.channels.map(ch => ({
            instType: config.accountType === 'spot' ? 'SPOT' : 'USDT-FUTURES',
            channel: ch,
            instId: config.symbol,
          })),
        };
        break;

      case 'bingx':
        subscribeMsg = {
          id: Date.now(),
          reqType: 'sub',
          dataType: config.channels.map(ch => `${ch}@${config.symbol}`),
        };
        break;
    }

    if (subscribeMsg) {
      ws.send(JSON.stringify(subscribeMsg));
      console.log(`[WS] Subscribed to ${config.channels.join(', ')} on ${config.exchange}`);
    }
  }

  subscribeToPrice(
    exchange: string,
    symbol: string,
    accountType: 'spot' | 'futures' | 'linear' = 'futures',
    callback: (update: PriceUpdate) => void,
    options?: { enableRecovery?: boolean; onRecovery?: (result: ReconnectionResult) => void }
  ): () => void {
    const channels = this.getPriceChannels(exchange);
    
    const config: WSConfig = {
      exchange,
      symbol,
      accountType,
      channels,
      enableRecovery: options?.enableRecovery ?? true,
      onMessage: (data) => {
        const priceUpdate = this.extractPriceUpdate(exchange, symbol, data);
        if (priceUpdate) callback(priceUpdate);
      },
      onRecovery: options?.onRecovery,
    };

    this.connect(config);
    return () => this.disconnect(exchange, symbol, accountType);
  }

  subscribeToOrderbook(
    exchange: string,
    symbol: string,
    accountType: 'spot' | 'futures' | 'linear' = 'futures',
    callback: (update: OrderbookUpdate) => void,
    options?: { 
      enableRecovery?: boolean; 
      onRecovery?: (result: ReconnectionResult) => void;
      depth?: number;
    }
  ): () => void {
    const channels = this.getOrderbookChannels(exchange, options?.depth);
    
    const config: WSConfig = {
      exchange,
      symbol,
      accountType,
      channels,
      enableRecovery: options?.enableRecovery ?? true,
      onMessage: (data) => {
        const orderbookUpdate = this.extractOrderbookUpdate(exchange, symbol, data);
        if (orderbookUpdate) callback(orderbookUpdate);
      },
      onRecovery: options?.onRecovery,
    };

    this.connect(config);
    return () => this.disconnect(exchange, symbol, accountType);
  }

  // ==================== MESSAGE PARSING ====================

  private parseMessage(data: Buffer, exchange: string): any {
    try {
      return JSON.parse(data.toString());
    } catch {
      return null;
    }
  }

  private extractPriceUpdate(exchange: string, symbol: string, data: any): PriceUpdate | null {
    try {
      switch (exchange.toLowerCase()) {
        case 'binance':
          if (data.e === 'ticker' || data.e === '24hrTicker') {
            return {
              exchange, symbol,
              price: parseFloat(data.c),
              bid: parseFloat(data.b),
              ask: parseFloat(data.a),
              spread: (parseFloat(data.a) - parseFloat(data.b)) / parseFloat(data.b) * 100,
              timestamp: new Date(data.E),
            };
          }
          break;

        case 'bybit':
          if (data.topic?.includes('tickers')) {
            const tick = data.data;
            return {
              exchange, symbol,
              price: parseFloat(tick.lastPrice),
              bid: parseFloat(tick.bid1Price),
              ask: parseFloat(tick.ask1Price),
              spread: (parseFloat(tick.ask1Price) - parseFloat(tick.bid1Price)) / parseFloat(tick.bid1Price) * 100,
              timestamp: new Date(data.ts),
            };
          }
          break;

        case 'okx':
          if (data.arg?.channel === 'tickers') {
            const tick = data.data[0];
            return {
              exchange, symbol,
              price: parseFloat(tick.last),
              bid: parseFloat(tick.bidPx),
              ask: parseFloat(tick.askPx),
              spread: (parseFloat(tick.askPx) - parseFloat(tick.bidPx)) / parseFloat(tick.bidPx) * 100,
              timestamp: new Date(parseInt(tick.ts)),
            };
          }
          break;

        case 'bitget':
          if (data.arg?.channel === 'ticker') {
            const tick = data.data[0];
            return {
              exchange, symbol,
              price: parseFloat(tick.last),
              bid: parseFloat(tick.bidPr),
              ask: parseFloat(tick.askPr),
              spread: (parseFloat(tick.askPr) - parseFloat(tick.bidPr)) / parseFloat(tick.bidPr) * 100,
              timestamp: new Date(parseInt(tick.ts)),
            };
          }
          break;

        case 'bingx':
          if (data.dataType?.includes('ticker')) {
            const tick = data.data;
            return {
              exchange, symbol,
              price: parseFloat(tick.lastPrice),
              bid: parseFloat(tick.bidPrice),
              ask: parseFloat(tick.askPrice),
              spread: (parseFloat(tick.askPrice) - parseFloat(tick.bidPrice)) / parseFloat(tick.bidPrice) * 100,
              timestamp: new Date(parseInt(tick.timestamp)),
            };
          }
          break;
      }
    } catch (error) {
      console.error(`[WS] Error extracting price:`, error);
    }
    return null;
  }

  private extractOrderbookUpdate(exchange: string, symbol: string, data: any): OrderbookUpdate | null {
    try {
      switch (exchange.toLowerCase()) {
        case 'binance':
          if (data.e === 'depthUpdate' || data.lastUpdateId) {
            const sequence = data.u || data.lastUpdateId;
            return {
              exchange, symbol,
              bids: (data.bids || data.b || []).map((b: any[]) => [parseFloat(b[0]), parseFloat(b[1])]),
              asks: (data.asks || data.a || []).map((a: any[]) => [parseFloat(a[0]), parseFloat(a[1])]),
              timestamp: new Date(data.E || Date.now()),
              sequence,
              isSnapshot: data.e !== 'depthUpdate',
            };
          }
          break;

        case 'bybit':
          if (data.topic?.includes('orderbook')) {
            const ob = data.data;
            return {
              exchange, symbol,
              bids: (ob.b || []).map((b: any[]) => [parseFloat(b[0]), parseFloat(b[1])]),
              asks: (ob.a || []).map((a: any[]) => [parseFloat(a[0]), parseFloat(a[1])]),
              timestamp: new Date(data.ts),
              sequence: data.seq || ob.seq,
              isSnapshot: data.type === 'snapshot',
            };
          }
          break;

        case 'okx':
          if (data.arg?.channel?.includes('books')) {
            const ob = data.data[0];
            return {
              exchange, symbol,
              bids: (ob.bids || []).map((b: any[]) => [parseFloat(b[0]), parseFloat(b[1])]),
              asks: (ob.asks || []).map((a: any[]) => [parseFloat(a[0]), parseFloat(a[1])]),
              timestamp: new Date(parseInt(ob.ts)),
              sequence: ob.seqId,
              isSnapshot: data.action === 'snapshot',
            };
          }
          break;

        case 'bitget':
          if (data.arg?.channel?.includes('books')) {
            const ob = data.data;
            return {
              exchange, symbol,
              bids: (ob.bids || []).map((b: any[]) => [parseFloat(b[0]), parseFloat(b[1])]),
              asks: (ob.asks || []).map((a: any[]) => [parseFloat(a[0]), parseFloat(a[1])]),
              timestamp: new Date(parseInt(ob.ts)),
              sequence: ob.seqId,
              isSnapshot: data.action === 'snapshot',
            };
          }
          break;

        case 'bingx':
          if (data.dataType?.includes('depth')) {
            const ob = data.data;
            return {
              exchange, symbol,
              bids: (ob.bids || []).map((b: any) => [parseFloat(b.price), parseFloat(b.volume)]),
              asks: (ob.asks || []).map((a: any) => [parseFloat(a.price), parseFloat(a.volume)]),
              timestamp: new Date(parseInt(ob.timestamp)),
              sequence: ob.seq,
              isSnapshot: true, // BingX usually sends full depth
            };
          }
          break;
      }
    } catch (error) {
      console.error(`[WS] Error extracting orderbook:`, error);
    }
    return null;
  }

  // ==================== CHANNEL HELPERS ====================

  private getPriceChannels(exchange: string): string[] {
    switch (exchange.toLowerCase()) {
      case 'binance': return ['ticker'];
      case 'bybit': return ['tickers'];
      case 'okx': return ['tickers'];
      case 'bitget': return ['ticker'];
      case 'bingx': return ['ticker'];
      default: return [];
    }
  }

  private getOrderbookChannels(exchange: string, depth?: number): string[] {
    switch (exchange.toLowerCase()) {
      case 'binance': return depth ? [`depth@${depth}ms`] : ['depth@100ms'];
      case 'bybit': return [`orderbook.${depth || 50}`];
      case 'okx': return depth && depth <= 5 ? ['books5'] : ['books'];
      case 'bitget': return depth && depth <= 5 ? ['books5'] : ['books'];
      case 'bingx': return ['depth'];
      default: return [];
    }
  }

  // ==================== PING/PONG ====================

  // Audit Fix: P3.17 - WebSocket Heartbeat/Ping-Pong Mechanism
  private lastPongReceived: Map<string, number> = new Map();
  private pongTimeoutIntervals: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatTimeout: number = 60000; // 60 seconds without pong = reconnect
  private heartbeatInterval: number = 25000; // 25 seconds between pings

  private startPing(key: string, ws: WebSocket, exchange: string): void {
    const pingInterval = this.getPingInterval(exchange);
    
    // Initialize last pong time
    this.lastPongReceived.set(key, Date.now());

    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const pingMsg = this.getPingMessage(exchange);
        ws.send(pingMsg);
        
        // Start pong timeout check
        this.startPongTimeout(key, ws, exchange);
      }
    }, pingInterval);

    this.pingIntervals.set(key, interval);
    
    // Listen for pong responses
    ws.on('pong', () => {
      this.handlePong(key);
    });
    
    // For exchanges that send pong as data message
    ws.on('message', (data: Buffer) => {
      this.checkPongMessage(key, data, exchange);
    });
  }

  /**
   * Start timeout for pong response
   * Audit Fix: P3.17 - Reconnect if no pong received within timeout
   */
  private startPongTimeout(key: string, ws: WebSocket, exchange: string): void {
    // Clear existing timeout
    this.clearPongTimeout(key);
    
    const timeout = setTimeout(() => {
      const lastPong = this.lastPongReceived.get(key) || 0;
      const elapsed = Date.now() - lastPong;
      
      if (elapsed > this.heartbeatTimeout) {
        console.warn(`[WS] No pong received for ${elapsed}ms, reconnecting ${key}`);
        
        // Terminate and reconnect
        if (ws.readyState === WebSocket.OPEN) {
          ws.terminate();
        }
        
        const config = this.configs.get(key);
        if (config) {
          this.handleReconnect(config);
        }
      }
    }, this.heartbeatTimeout);
    
    this.pongTimeoutIntervals.set(key, timeout);
  }

  /**
   * Clear pong timeout
   */
  private clearPongTimeout(key: string): void {
    const timeout = this.pongTimeoutIntervals.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.pongTimeoutIntervals.delete(key);
    }
  }

  /**
   * Handle pong response
   */
  private handlePong(key: string): void {
    this.lastPongReceived.set(key, Date.now());
    this.clearPongTimeout(key);
  }

  /**
   * Check if message is a pong response (exchange-specific)
   */
  private checkPongMessage(key: string, data: Buffer, exchange: string): void {
    try {
      const msg = data.toString();
      
      // Check for pong messages from different exchanges
      switch (exchange.toLowerCase()) {
        case 'binance':
          if (msg === 'pong' || msg.includes('"method":"pong"')) {
            this.handlePong(key);
          }
          break;
        case 'bybit':
          if (msg.includes('"op":"pong"') || msg.includes('"ret_msg":"pong"')) {
            this.handlePong(key);
          }
          break;
        case 'okx':
          if (msg === 'pong') {
            this.handlePong(key);
          }
          break;
        case 'bitget':
          if (msg.includes('"op":"pong"')) {
            this.handlePong(key);
          }
          break;
        case 'bingx':
          if (msg.includes('pong') || msg.includes('ping')) {
            this.handlePong(key);
          }
          break;
      }
    } catch (error) {
      // Ignore parse errors
    }
  }

  private stopPing(key: string): void {
    const interval = this.pingIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(key);
    }
    
    this.clearPongTimeout(key);
    this.lastPongReceived.delete(key);
  }

  /**
   * Get connection health status based on heartbeat
   */
  getConnectionHealth(key: string): {
    lastPong: number | null;
    timeSinceLastPong: number;
    isHealthy: boolean;
  } {
    const lastPong = this.lastPongReceived.get(key);
    const timeSinceLastPong = lastPong ? Date.now() - lastPong : Infinity;
    
    return {
      lastPong: lastPong || null,
      timeSinceLastPong,
      isHealthy: timeSinceLastPong < this.heartbeatTimeout,
    };
  }

  private getPingInterval(exchange: string): number {
    switch (exchange.toLowerCase()) {
      case 'binance': return 180000;
      case 'bybit': return 20000;
      case 'okx': return 25000;
      case 'bitget': return 30000;
      case 'bingx': return 25000;
      default: return 30000;
    }
  }

  private getPingMessage(exchange: string): string {
    switch (exchange.toLowerCase()) {
      case 'binance': return JSON.stringify({ method: 'ping' });
      case 'bybit': return JSON.stringify({ op: 'ping' });
      case 'okx': return 'ping';
      case 'bitget': return JSON.stringify({ op: 'ping' });
      case 'bingx': return JSON.stringify({ pong: Date.now() });
      default: return 'ping';
    }
  }

  // ==================== RECONNECTION ====================

  /**
   * Calculate exponential backoff delay with jitter
   * Audit Fix: P1.18 - Implement exponential backoff with jitter for WebSocket reconnection
   */
  private calculateReconnectDelay(attempts: number): number {
    // Exponential backoff: baseDelay * 2^attempts
    const exponentialDelay = this.reconnectBaseDelay * Math.pow(2, attempts);
    
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.maxReconnectDelay);
    
    // Add jitter to prevent thundering herd problem
    // Jitter is random value between 0 and jitterFactor * cappedDelay
    const jitter = cappedDelay * this.jitterFactor * Math.random();
    
    return Math.floor(cappedDelay + jitter);
  }

  private handleReconnect(config: WSConfig): void {
    const key = this.getConnectionKey(config);
    const attempts = this.reconnectAttempts.get(key) || 0;

    if (attempts < this.maxReconnectAttempts) {
      // Use exponential backoff with jitter
      const delay = this.calculateReconnectDelay(attempts);

      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);

      const state = this.connectionStates.get(key);
      if (state) {
        state.status = 'RECONNECTING';
        state.reconnectAttempts = attempts + 1;
      }

      // Update WS recovery state
      this.wsRecovery.setState(config.exchange, config.symbol, 'RECONNECTING');

      setTimeout(() => {
        this.reconnectAttempts.set(key, attempts + 1);
        const url = this.getWebSocketUrl(config);
        if (url) {
          this.createConnection(key, url, config);
          config.onReconnect?.();
        }
      }, delay);
    } else {
      console.error(`[WS] Max reconnection attempts reached for ${key}`);
      this.emit('max_reconnect_failed', { exchange: config.exchange, key });
    }
  }

  // ==================== UTILITIES ====================

  private getConnectionKey(config: WSConfig | { exchange: string; symbol: string; accountType?: string }): string {
    return `${config.exchange}-${config.accountType || 'default'}-${config.symbol}`;
  }

  private getWebSocketUrl(config: WSConfig): string | null {
    const urls = WS_URLS[config.exchange.toLowerCase()];
    if (!urls) return null;
    const accountType = config.accountType || 'futures';
    return urls[accountType] || urls[Object.keys(urls)[0]];
  }

  // ==================== PUBLIC GETTERS ====================

  getConnectionState(exchange: string, symbol: string, accountType?: string): WSConnectionState | null {
    const key = this.getConnectionKey({ exchange, symbol, accountType: accountType as any });
    return this.connectionStates.get(key) || null;
  }

  isConnected(exchange: string, symbol: string, accountType?: string): boolean {
    const key = this.getConnectionKey({ exchange, symbol, accountType: accountType as any });
    const state = this.connectionStates.get(key);
    return state?.status === 'CONNECTED';
  }

  getAllConnections(): Map<string, WSConnectionState> {
    return new Map(this.connectionStates);
  }

  /**
   * Get the underlying WSStateRecovery instance for advanced usage
   */
  getWSRecovery(): WSStateRecovery {
    return this.wsRecovery;
  }

  /**
   * Get the OrderbookRecovery instance
   */
  getOrderbookRecovery(): OrderbookRecovery {
    return this.orderbookRecovery;
  }

  broadcast(exchange: string, message: any): void {
    for (const [key, ws] of this.connections) {
      if (key.startsWith(exchange) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }
}

// ==================== SINGLETON ====================

export const exchangeWsManager = new ExchangeWebSocketManager();

// Re-export types and classes from state-recovery for convenience
export {
  WSStateRecovery,
  OrderbookRecovery,
  type WSRecoveryConfig,
  type ReconnectionResult,
  type WSMessage,
  type DeltaMessage,
  type OrderbookSnapshot,
  type WSState,
};

export default ExchangeWebSocketManager;
