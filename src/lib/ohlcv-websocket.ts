/**
 * Real-time OHLCV WebSocket Client
 *
 * Connects to exchange WebSocket streams and stores candles in real-time.
 * Supports multiple exchanges and automatic reconnection.
 */

import { OhlcvService, ExchangeId } from './ohlcv-service';

type MarketType = 'spot' | 'futures' | 'inverse';

interface Subscription {
  exchange: ExchangeId;
  symbol: string;
  marketType: MarketType;
  interval: string;
}

interface WebSocketConfig {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onCandle?: (candle: any) => void;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

// Interval to milliseconds mapping
const INTERVAL_MS: Record<string, number> = {
  '1m': 60000,
  '3m': 180000,
  '5m': 300000,
  '15m': 900000,
  '30m': 1800000,
  '1h': 3600000,
  '2h': 7200000,
  '4h': 14400000,
  '6h': 21600000,
  '8h': 28800000,
  '12h': 43200000,
  '1d': 86400000,
  '3d': 259200000,
  '1w': 604800000,
  '1M': 2592000000,
};

/**
 * Binance WebSocket Client
 */
export class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private baseUrl: string;

  constructor(config: WebSocketConfig = {}, marketType: MarketType = 'spot') {
    this.config = {
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      ...config,
    };
    this.baseUrl = marketType === 'futures'
      ? 'wss://fstream.binance.com/ws'
      : 'wss://stream.binance.com:9443/ws';
  }

  /**
   * Generate stream name for symbol and interval
   */
  private getStreamName(symbol: string, interval: string): string {
    return `${symbol.toLowerCase()}@kline_${interval}`;
  }

  /**
   * Connect to WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const streams = Array.from(this.subscriptions.values())
      .map((s) => this.getStreamName(s.symbol, s.interval))
      .join('/');

    const url = streams
      ? `${this.baseUrl}/${streams}`
      : this.baseUrl;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Binance WS] Connected');
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.startPing();
        this.config.onConnect?.();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this.handleMessage(data);
        } catch (error) {
          console.error('[Binance WS] Message parse error:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Binance WS] Error:', error);
        this.config.onError?.(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        console.log('[Binance WS] Disconnected');
        this.stopPing();
        this.config.onDisconnect?.();
        this.handleReconnect();
      };
    } catch (error) {
      console.error('[Binance WS] Connection error:', error);
      this.handleReconnect();
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(data: any): Promise<void> {
    // Handle kline data
    if (data.e === 'kline' && data.k) {
      const kline = data.k;
      const subscription = Array.from(this.subscriptions.values()).find(
        (s) => s.symbol === kline.s && s.interval === kline.i
      );

      if (subscription) {
        const candle = {
          symbol: kline.s,
          exchange: 'binance' as ExchangeId,
          marketType: subscription.marketType,
          timeframe: kline.i,
          openTime: new Date(kline.t),
          closeTime: new Date(kline.T),
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
          volume: parseFloat(kline.v),
          quoteVolume: parseFloat(kline.q),
          trades: kline.n,
          takerBuyVolume: parseFloat(kline.V),
          isFinal: kline.x, // Is candle closed
        };

        // Store in database
        try {
          await OhlcvService.storeCandle(candle);

          // Log closed candles
          if (candle.isFinal) {
            console.log(`[Binance WS] Candle closed: ${candle.symbol} ${candle.timeframe} ${candle.close}`);
          }
        } catch (error) {
          console.error('[Binance WS] Failed to store candle:', error);
        }

        this.config.onCandle?.(candle);
      }
    }
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Handle reconnection
   */
  private handleReconnect(): void {
    if (this.isReconnecting) return;

    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      console.error('[Binance WS] Max reconnect attempts reached');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = this.config.reconnectDelay || 5000;

    console.log(`[Binance WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Subscribe to a symbol's kline stream
   */
  subscribe(params: Subscription): void {
    const key = `${params.exchange}:${params.symbol}:${params.marketType}:${params.interval}`;
    this.subscriptions.set(key, params);

    // If already connected, send subscribe message
    if (this.ws?.readyState === WebSocket.OPEN) {
      const stream = this.getStreamName(params.symbol, params.interval);
      this.ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: [stream],
        id: Date.now(),
      }));
    } else {
      // Reconnect with new subscription
      this.connect();
    }
  }

  /**
   * Unsubscribe from a symbol's kline stream
   */
  unsubscribe(params: Omit<Subscription, 'exchange'>): void {
    const key = `binance:${params.symbol}:${params.marketType}:${params.interval}`;
    this.subscriptions.delete(key);

    if (this.ws?.readyState === WebSocket.OPEN) {
      const stream = this.getStreamName(params.symbol, params.interval);
      this.ws.send(JSON.stringify({
        method: 'UNSUBSCRIBE',
        params: [stream],
        id: Date.now(),
      }));
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }
}

/**
 * Multi-Exchange WebSocket Manager
 */
export class OhlcvWebSocketManager {
  private clients: Map<string, BinanceWebSocketClient> = new Map();
  private config: WebSocketConfig;

  constructor(config: WebSocketConfig = {}) {
    this.config = config;
  }

  /**
   * Get or create client for exchange
   */
  private getClient(exchange: ExchangeId, marketType: MarketType): BinanceWebSocketClient {
    const key = `${exchange}:${marketType}`;

    if (!this.clients.has(key)) {
      const client = new BinanceWebSocketClient(this.config, marketType);
      this.clients.set(key, client);
    }

    return this.clients.get(key)!;
  }

  /**
   * Subscribe to candle stream
   */
  subscribe(params: Subscription): void {
    const client = this.getClient(params.exchange, params.marketType);
    client.subscribe(params);
  }

  /**
   * Unsubscribe from candle stream
   */
  unsubscribe(params: Omit<Subscription, 'exchange'> & { exchange: ExchangeId }): void {
    const client = this.getClient(params.exchange, params.marketType);
    client.unsubscribe(params);
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
  }

  /**
   * Get all active subscriptions
   */
  getAllSubscriptions(): Subscription[] {
    const all: Subscription[] = [];
    for (const client of this.clients.values()) {
      all.push(...client.getSubscriptions());
    }
    return all;
  }

  /**
   * Check if any client is connected
   */
  isConnected(): boolean {
    for (const client of this.clients.values()) {
      if (client.isConnected()) return true;
    }
    return false;
  }
}

// Singleton instance for server-side use
let managerInstance: OhlcvWebSocketManager | null = null;

export function getOhlcvWebSocketManager(): OhlcvWebSocketManager {
  if (!managerInstance) {
    managerInstance = new OhlcvWebSocketManager({
      onConnect: () => console.log('[OHLCV WS] Manager connected'),
      onDisconnect: () => console.log('[OHLCV WS] Manager disconnected'),
      onError: (err) => console.error('[OHLCV WS] Manager error:', err),
    });
  }
  return managerInstance;
}
