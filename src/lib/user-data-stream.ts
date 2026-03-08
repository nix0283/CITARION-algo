/**
 * User Data Stream Service
 * 
 * Real-time account updates via WebSocket:
 * - Balance changes
 * - Order updates
 * - Position changes
 * - listenKey keep-alive management
 * 
 * Based on best practices from trading platform development:
 * - Automatic reconnection with exponential backoff
 * - listenKey renewal every 30 minutes
 * - Heartbeat timeout detection
 * - Event-driven architecture
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

// ==================== TYPES ====================

export interface UserDataStreamConfig {
  exchange: 'binance' | 'bybit' | 'okx';
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface AccountUpdate {
  event: 'accountUpdate';
  balances: Array<{
    asset: string;
    free: number;
    locked: number;
  }>;
  timestamp: Date;
}

export interface OrderUpdate {
  event: 'orderUpdate';
  symbol: string;
  clientOrderId: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  timeInForce: string;
  quantity: number;
  price: number;
  averagePrice: number;
  orderStatus: string;
  orderId: number;
  lastFilledQuantity: number;
  cumulativeFilledQuantity: number;
  lastFilledPrice: number;
  commissionAsset: string;
  commission: number;
  tradeTime: Date;
  tradeId: number;
  isMaker: boolean;
}

export interface PositionUpdate {
  event: 'positionUpdate';
  symbol: string;
  positionSide: 'LONG' | 'SHORT' | 'BOTH';
  positionAmount: number;
  entryPrice: number;
  unrealizedPnl: number;
  marginType: string;
  isolatedWallet: number;
  positionSide2: string;
}

export interface BalanceUpdate {
  event: 'balanceUpdate';
  asset: string;
  balanceDelta: number;
  clearTime: Date;
}

export type UserDataEvent = AccountUpdate | OrderUpdate | PositionUpdate | BalanceUpdate;

// ==================== BINANCE USER DATA STREAM ====================

export class BinanceUserDataStream extends EventEmitter {
  private config: UserDataStreamConfig;
  private ws: WebSocket | null = null;
  private listenKey: string | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastMessageTime: number = 0;
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly KEEPALIVE_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly HEARTBEAT_TIMEOUT = 60 * 1000; // 60 seconds

  constructor(config: UserDataStreamConfig) {
    super();
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.testnet
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';
  }

  private getWsUrl(): string {
    return this.config.testnet
      ? 'wss://stream.binancefuture.com/ws'
      : 'wss://fstream.binance.com/ws';
  }

  /**
   * Start the user data stream
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[BinanceUserData] Already running');
      return;
    }

    try {
      this.isRunning = true;
      await this.fetchListenKey();
      await this.connectWebSocket();
      this.startKeepAlive();
      this.startHeartbeatCheck();
      this.reconnectAttempts = 0;
      console.log('[BinanceUserData] Started successfully');
    } catch (error) {
      console.error('[BinanceUserData] Failed to start:', error);
      this.isRunning = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Stop the user data stream
   */
  async stop(): Promise<void> {
    console.log('[BinanceUserData] Stopping...');
    this.isRunning = false;
    this.stopKeepAlive();
    this.stopHeartbeatCheck();
    this.clearReconnectTimeout();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Close listenKey on server
    if (this.listenKey) {
      try {
        await this.closeListenKey();
      } catch (error) {
        console.error('[BinanceUserData] Error closing listenKey:', error);
      }
      this.listenKey = null;
    }

    console.log('[BinanceUserData] Stopped');
  }

  /**
   * Fetch listenKey from Binance REST API
   */
  private async fetchListenKey(): Promise<void> {
    const url = `${this.getBaseUrl()}/fapi/v1/listenKey`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': this.config.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get listenKey: ${error}`);
    }

    const data = await response.json() as { listenKey: string };
    this.listenKey = data.listenKey;
    console.log('[BinanceUserData] Obtained listenKey');
  }

  /**
   * Keep-alive the listenKey (every 30 minutes)
   */
  private async keepAliveListenKey(): Promise<void> {
    if (!this.listenKey) return;

    const url = `${this.getBaseUrl()}/fapi/v1/listenKey`;
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'X-MBX-APIKEY': this.config.apiKey,
        },
      });

      if (response.ok) {
        console.log('[BinanceUserData] listenKey renewed');
      } else {
        console.error('[BinanceUserData] Failed to renew listenKey');
        // Try to get a new listenKey
        await this.fetchListenKey();
        // Reconnect with new key
        if (this.ws) {
          this.ws.close();
        }
      }
    } catch (error) {
      console.error('[BinanceUserData] Keep-alive error:', error);
    }
  }

  /**
   * Close listenKey on server
   */
  private async closeListenKey(): Promise<void> {
    const url = `${this.getBaseUrl()}/fapi/v1/listenKey`;
    
    await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': this.config.apiKey,
      },
    });
  }

  /**
   * Connect to WebSocket
   */
  private async connectWebSocket(): Promise<void> {
    if (!this.listenKey) {
      throw new Error('No listenKey available');
    }

    const wsUrl = `${this.getWsUrl()}/${this.listenKey}`;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[BinanceUserData] WebSocket connected');
          this.lastMessageTime = Date.now();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.lastMessageTime = Date.now();
          try {
            const data = JSON.parse(event.data as string);
            this.handleMessage(data);
          } catch (error) {
            console.error('[BinanceUserData] Parse error:', error);
          }
        };

        this.ws.onclose = (event) => {
          console.log(`[BinanceUserData] WebSocket closed: code=${event.code}, reason=${event.reason}`);
          this.ws = null;
          if (this.isRunning) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('[BinanceUserData] WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Record<string, unknown>): void {
    const eventType = data.e as string;

    switch (eventType) {
      case 'ACCOUNT_UPDATE':
        this.emit('accountUpdate', this.parseAccountUpdate(data));
        break;
      case 'ORDER_TRADE_UPDATE':
        this.emit('orderUpdate', this.parseOrderUpdate(data));
        break;
      case 'ACCOUNT_CONFIG_UPDATE':
        this.emit('configUpdate', data);
        break;
      case 'MARGIN_CALL':
        this.emit('marginCall', data);
        break;
      default:
        // Log unknown events for debugging
        if (eventType) {
          console.log(`[BinanceUserData] Unknown event: ${eventType}`, data);
        }
    }
  }

  /**
   * Parse ACCOUNT_UPDATE event
   */
  private parseAccountUpdate(data: Record<string, unknown>): AccountUpdate {
    const a = data.a as Record<string, unknown>;
    const balances = (a?.B as Array<Record<string, unknown>>)?.map((b) => ({
      asset: b.a as string,
      free: parseFloat(b.bc as string || '0'),
      locked: parseFloat(b.bw as string || '0'),
    })) || [];

    return {
      event: 'accountUpdate',
      balances,
      timestamp: new Date(data.E as number),
    };
  }

  /**
   * Parse ORDER_TRADE_UPDATE event
   */
  private parseOrderUpdate(data: Record<string, unknown>): OrderUpdate {
    const o = data.o as Record<string, unknown>;
    
    return {
      event: 'orderUpdate',
      symbol: o.s as string,
      clientOrderId: o.c as string,
      side: o.S as 'BUY' | 'SELL',
      orderType: o.o as string,
      timeInForce: o.f as string,
      quantity: parseFloat(o.q as string),
      price: parseFloat(o.p as string),
      averagePrice: parseFloat(o.ap as string),
      orderStatus: o.X as string,
      orderId: o.i as number,
      lastFilledQuantity: parseFloat(o.l as string),
      cumulativeFilledQuantity: parseFloat(o.z as string),
      lastFilledPrice: parseFloat(o.L as string),
      commissionAsset: o.N as string,
      commission: parseFloat(o.n as string || '0'),
      tradeTime: new Date(o.T as number),
      tradeId: o.t as number,
      isMaker: o.m as boolean,
    };
  }

  /**
   * Start keep-alive interval
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      this.keepAliveListenKey();
    }, this.KEEPALIVE_INTERVAL);
  }

  /**
   * Stop keep-alive interval
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Start heartbeat check
   */
  private startHeartbeatCheck(): void {
    this.stopHeartbeatCheck();
    this.heartbeatCheckInterval = setInterval(() => {
      const now = Date.now();
      if (now - this.lastMessageTime > this.HEARTBEAT_TIMEOUT) {
        console.warn(`[BinanceUserData] Heartbeat timeout - no message for ${Math.round((now - this.lastMessageTime) / 1000)}s`);
        if (this.ws) {
          this.ws.close();
        }
      }
    }, 10000);
  }

  /**
   * Stop heartbeat check
   */
  private stopHeartbeatCheck(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.isRunning) return;

    this.clearReconnectTimeout();

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`[BinanceUserData] Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached`);
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    console.log(`[BinanceUserData] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        // Get fresh listenKey on reconnect
        await this.fetchListenKey();
        await this.connectWebSocket();
        this.startKeepAlive();
        this.startHeartbeatCheck();
        this.reconnectAttempts = 0;
        this.emit('reconnected');
        console.log('[BinanceUserData] Reconnected successfully');
      } catch (error) {
        console.error('[BinanceUserData] Reconnect failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Clear reconnect timeout
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Get current listen key (for debugging)
   */
  getListenKey(): string | null {
    return this.listenKey;
  }

  /**
   * Check if stream is running
   */
  isActive(): boolean {
    return this.isRunning && this.ws?.readyState === WebSocket.OPEN;
  }
}

// ==================== FACTORY FUNCTION ====================

export function createUserDataStream(config: UserDataStreamConfig): BinanceUserDataStream {
  switch (config.exchange) {
    case 'binance':
      return new BinanceUserDataStream(config);
    // Add other exchanges later
    default:
      throw new Error(`Unsupported exchange: ${config.exchange}`);
  }
}

// ==================== MANAGER FOR MULTIPLE ACCOUNTS ====================

export class UserDataStreamManager {
  private streams: Map<string, BinanceUserDataStream> = new Map();

  async addAccount(accountId: string, config: UserDataStreamConfig): Promise<BinanceUserDataStream> {
    if (this.streams.has(accountId)) {
      return this.streams.get(accountId)!;
    }

    const stream = createUserDataStream(config);
    
    // Forward events
    stream.on('accountUpdate', (data) => {
      console.log(`[UserDataStream:${accountId}] Account update`);
    });
    
    stream.on('orderUpdate', (data) => {
      console.log(`[UserDataStream:${accountId}] Order update: ${data.symbol} ${data.side} ${data.orderStatus}`);
    });

    stream.on('error', (error) => {
      console.error(`[UserDataStream:${accountId}] Error:`, error);
    });

    await stream.start();
    this.streams.set(accountId, stream);
    
    return stream;
  }

  async removeAccount(accountId: string): Promise<void> {
    const stream = this.streams.get(accountId);
    if (stream) {
      await stream.stop();
      this.streams.delete(accountId);
    }
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.streams.values()).map((stream) => stream.stop());
    await Promise.all(promises);
    this.streams.clear();
  }

  getStream(accountId: string): BinanceUserDataStream | undefined {
    return this.streams.get(accountId);
  }

  getActiveAccounts(): string[] {
    return Array.from(this.streams.entries())
      .filter(([_, stream]) => stream.isActive())
      .map(([id]) => id);
  }
}

// ==================== SINGLETON INSTANCE ====================

let managerInstance: UserDataStreamManager | null = null;

export function getUserDataStreamManager(): UserDataStreamManager {
  if (!managerInstance) {
    managerInstance = new UserDataStreamManager();
  }
  return managerInstance;
}
