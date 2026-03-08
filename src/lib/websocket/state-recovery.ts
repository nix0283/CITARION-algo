/**
 * WebSocket State Recovery Module
 * 
 * Handles state recovery during WebSocket reconnections to prevent data loss.
 * Implements buffering, sequence validation, and gap detection for orderbooks
 * and other real-time data streams.
 * 
 * Features:
 * - Message buffering during disconnection
 * - Sequence number validation
 * - Gap detection and handling
 * - Orderbook snapshot fetching and merging
 * - Recovery event emission
 */

import { EventEmitter } from 'events';
import { Orderbook, OrderbookEntry, AllExchangeId } from '../exchange/types';

// ==================== TYPES ====================

/**
 * Configuration for WebSocket recovery behavior
 */
export interface WSRecoveryConfig {
  /** Fetch orderbook snapshot on reconnect */
  snapshotOnReconnect: boolean;
  /** Maximum number of buffered messages per symbol */
  maxBufferSize: number;
  /** Validate sequence numbers for continuity */
  sequenceValidation: boolean;
  /** How to handle detected gaps */
  gapHandling: 'resync' | 'ignore' | 'error';
  /** Maximum time to wait for snapshot fetch (ms) */
  snapshotTimeout: number;
  /** Maximum age of buffered messages before discard (ms) */
  maxBufferAge: number;
}

/**
 * Default recovery configuration
 */
export const DEFAULT_RECOVERY_CONFIG: WSRecoveryConfig = {
  snapshotOnReconnect: true,
  maxBufferSize: 1000,
  sequenceValidation: true,
  gapHandling: 'resync',
  snapshotTimeout: 10000,
  maxBufferAge: 60000, // 1 minute
};

/**
 * WebSocket state enumeration
 */
export type WSState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'RECOVERING';

/**
 * Result of a reconnection recovery attempt
 */
export interface ReconnectionResult {
  /** State before reconnection */
  previousState: WSState;
  /** State after recovery */
  newState: WSState;
  /** Number of messages that were missed during disconnection */
  missedMessages: number;
  /** Number of buffered messages that were successfully applied */
  bufferedApplied: number;
  /** Sequence numbers where gaps were detected */
  gapsDetected: number[];
  /** Time taken for recovery in milliseconds */
  recoveryTime: number;
  /** Whether recovery was successful */
  success: boolean;
  /** Error message if recovery failed */
  error?: string;
  /** Timestamp of recovery completion */
  timestamp: Date;
}

/**
 * Generic WebSocket message with sequence tracking
 */
export interface WSMessage {
  /** Exchange identifier */
  exchange: string;
  /** Symbol (e.g., BTCUSDT) */
  symbol: string;
  /** Channel/type of message */
  channel: string;
  /** Sequence number (if supported by exchange) */
  sequence?: number;
  /** Previous sequence number (for gap detection) */
  prevSequence?: number;
  /** Message timestamp */
  timestamp: number;
  /** Raw message data */
  data: unknown;
  /** Whether this is a snapshot or delta */
  isSnapshot?: boolean;
}

/**
 * Orderbook snapshot with sequence info
 */
export interface OrderbookSnapshot {
  exchange: string;
  symbol: string;
  bids: Array<[number, number]>; // [price, amount]
  asks: Array<[number, number]>;
  sequence: number;
  timestamp: number;
  checksum?: number;
}

/**
 * Orderbook delta update
 */
export interface DeltaMessage extends WSMessage {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  sequence: number;
}

/**
 * Result of sequence validation
 */
export interface ValidationResult {
  /** Whether the sequence is valid/continuous */
  valid: boolean;
  /** Detected gaps in the sequence */
  gaps: Array<{ start: number; end: number }>;
  /** Messages that can be applied (after filtering) */
  validMessages: WSMessage[];
  /** Messages that were discarded */
  discardedMessages: WSMessage[];
}

/**
 * Buffer stats for monitoring
 */
export interface BufferStats {
  /** Total buffered messages */
  totalMessages: number;
  /** Messages per symbol */
  bySymbol: Map<string, number>;
  /** Oldest message timestamp */
  oldestMessage?: number;
  /** Newest message timestamp */
  newestMessage?: number;
  /** Buffer memory usage estimate (bytes) */
  memoryUsage: number;
}

/**
 * Exchange-specific snapshot fetcher function
 */
export type SnapshotFetcher = (
  exchange: string,
  symbol: string,
  accountType?: string
) => Promise<OrderbookSnapshot | null>;

// ==================== WSStateRecovery CLASS ====================

/**
 * Manages WebSocket state recovery including message buffering,
 * sequence validation, and gap handling.
 */
export class WSStateRecovery extends EventEmitter {
  private config: WSRecoveryConfig;
  private messageBuffer: Map<string, WSMessage[]> = new Map();
  private lastSequences: Map<string, number> = new Map();
  private connectionStates: Map<string, WSState> = new Map();
  private snapshotFetchers: Map<string, SnapshotFetcher> = new Map();
  private bufferCleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<WSRecoveryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    this.startBufferCleanup();
  }

  // ==================== BUFFER MANAGEMENT ====================

  /**
   * Buffer a message for potential recovery
   */
  bufferMessage(message: WSMessage): void {
    const key = this.getMessageKey(message);
    
    if (!this.messageBuffer.has(key)) {
      this.messageBuffer.set(key, []);
    }

    const buffer = this.messageBuffer.get(key)!;
    
    // Enforce max buffer size (FIFO)
    if (buffer.length >= this.config.maxBufferSize) {
      buffer.shift();
    }

    buffer.push(message);

    // Update last sequence
    if (message.sequence !== undefined) {
      this.lastSequences.set(key, message.sequence);
    }

    this.emit('buffered', { key, totalBuffered: buffer.length });
  }

  /**
   * Get all buffered messages for a symbol
   */
  getBufferedMessages(exchange: string, symbol: string, channel?: string): WSMessage[] {
    if (channel) {
      const key = `${exchange}:${symbol}:${channel}`;
      return this.messageBuffer.get(key) || [];
    }

    // Get all messages for symbol across channels
    const allMessages: WSMessage[] = [];
    const prefix = `${exchange}:${symbol}:`;

    for (const [key, messages] of this.messageBuffer) {
      if (key.startsWith(prefix)) {
        allMessages.push(...messages);
      }
    }

    // Sort by timestamp
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get buffer statistics
   */
  getBufferStats(): BufferStats {
    let totalMessages = 0;
    let oldestMessage: number | undefined;
    let newestMessage: number | undefined;
    let memoryUsage = 0;
    const bySymbol = new Map<string, number>();

    for (const [key, messages] of this.messageBuffer) {
      totalMessages += messages.length;
      
      // Extract symbol from key
      const parts = key.split(':');
      if (parts.length >= 2) {
        const symbolKey = `${parts[0]}:${parts[1]}`;
        bySymbol.set(symbolKey, (bySymbol.get(symbolKey) || 0) + messages.length);
      }

      for (const msg of messages) {
        if (oldestMessage === undefined || msg.timestamp < oldestMessage) {
          oldestMessage = msg.timestamp;
        }
        if (newestMessage === undefined || msg.timestamp > newestMessage) {
          newestMessage = msg.timestamp;
        }
        // Rough memory estimate
        memoryUsage += JSON.stringify(msg).length;
      }
    }

    return {
      totalMessages,
      bySymbol,
      oldestMessage,
      newestMessage,
      memoryUsage,
    };
  }

  /**
   * Clear buffer for a specific symbol
   */
  clearBuffer(exchange: string, symbol: string): void {
    const prefix = `${exchange}:${symbol}:`;
    
    for (const key of this.messageBuffer.keys()) {
      if (key.startsWith(prefix)) {
        this.messageBuffer.delete(key);
      }
    }
  }

  /**
   * Clear all buffers
   */
  clearAllBuffers(): void {
    this.messageBuffer.clear();
    this.lastSequences.clear();
  }

  // ==================== SEQUENCE VALIDATION ====================

  /**
   * Validate sequence continuity for a set of messages
   */
  validateSequence(messages: WSMessage[], lastSequence?: number): ValidationResult {
    const gaps: Array<{ start: number; end: number }> = [];
    const validMessages: WSMessage[] = [];
    const discardedMessages: WSMessage[] = [];

    if (!this.config.sequenceValidation) {
      return {
        valid: true,
        gaps: [],
        validMessages: messages,
        discardedMessages: [],
      };
    }

    // Sort by sequence
    const sorted = messages
      .filter(m => m.sequence !== undefined)
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    let expectedSeq = lastSequence !== undefined ? lastSequence + 1 : undefined;

    for (const message of sorted) {
      const seq = message.sequence!;

      if (expectedSeq === undefined) {
        // No previous sequence, accept this as starting point
        validMessages.push(message);
        expectedSeq = seq + 1;
      } else if (seq === expectedSeq) {
        // Continuous sequence
        validMessages.push(message);
        expectedSeq = seq + 1;
      } else if (seq < expectedSeq) {
        // Out of order or duplicate, discard
        discardedMessages.push(message);
      } else {
        // Gap detected
        gaps.push({ start: expectedSeq, end: seq - 1 });
        
        // Handle based on config
        if (this.config.gapHandling === 'ignore') {
          validMessages.push(message);
          expectedSeq = seq + 1;
        } else if (this.config.gapHandling === 'error') {
          discardedMessages.push(message);
        } else {
          // 'resync' - mark for resync but accept message
          validMessages.push(message);
          expectedSeq = seq + 1;
        }
      }
    }

    // Add messages without sequence to valid messages
    for (const message of messages) {
      if (message.sequence === undefined) {
        validMessages.push(message);
      }
    }

    return {
      valid: gaps.length === 0,
      gaps,
      validMessages,
      discardedMessages,
    };
  }

  /**
   * Get last known sequence for a symbol
   */
  getLastSequence(exchange: string, symbol: string, channel: string): number | undefined {
    const key = `${exchange}:${symbol}:${channel}`;
    return this.lastSequences.get(key);
  }

  /**
   * Set last known sequence for a symbol
   */
  setLastSequence(exchange: string, symbol: string, channel: string, sequence: number): void {
    const key = `${exchange}:${symbol}:${channel}`;
    this.lastSequences.set(key, sequence);
  }

  // ==================== STATE MANAGEMENT ====================

  /**
   * Set connection state
   */
  setState(exchange: string, symbol: string, state: WSState): void {
    const key = `${exchange}:${symbol}`;
    const previousState = this.connectionStates.get(key);
    this.connectionStates.set(key, state);
    this.emit('state_change', { key, previousState, newState: state });
  }

  /**
   * Get connection state
   */
  getState(exchange: string, symbol: string): WSState {
    return this.connectionStates.get(`${exchange}:${symbol}`) || 'DISCONNECTED';
  }

  // ==================== SNAPSHOT MANAGEMENT ====================

  /**
   * Register a snapshot fetcher for an exchange
   */
  registerSnapshotFetcher(exchange: string, fetcher: SnapshotFetcher): void {
    this.snapshotFetchers.set(exchange, fetcher);
  }

  /**
   * Fetch orderbook snapshot from exchange
   */
  async fetchSnapshot(
    exchange: string,
    symbol: string,
    accountType?: string
  ): Promise<OrderbookSnapshot | null> {
    const fetcher = this.snapshotFetchers.get(exchange);
    
    if (!fetcher) {
      console.warn(`[WSRecovery] No snapshot fetcher registered for ${exchange}`);
      return null;
    }

    try {
      const snapshot = await fetcher(exchange, symbol, accountType);
      
      if (snapshot) {
        this.emit('snapshot_fetched', { exchange, symbol, snapshot });
      }
      
      return snapshot;
    } catch (error) {
      console.error(`[WSRecovery] Failed to fetch snapshot for ${exchange}:${symbol}:`, error);
      this.emit('snapshot_failed', { exchange, symbol, error });
      return null;
    }
  }

  // ==================== RECOVERY EXECUTION ====================

  /**
   * Execute recovery process for a connection
   */
  async executeRecovery(
    exchange: string,
    symbol: string,
    channel: string,
    accountType?: string
  ): Promise<ReconnectionResult> {
    const startTime = Date.now();
    const key = `${exchange}:${symbol}`;
    const previousState = this.getState(exchange, symbol);

    this.setState(exchange, symbol, 'RECOVERING');

    try {
      // Get buffered messages
      const buffered = this.getBufferedMessages(exchange, symbol, channel);
      const lastSeq = this.getLastSequence(exchange, symbol, channel);

      // Detect gaps
      const validation = this.validateSequence(buffered, lastSeq);
      const gapsDetected = validation.gaps.flatMap(g => 
        Array.from({ length: g.end - g.start + 1 }, (_, i) => g.start + i)
      );

      let bufferedApplied = 0;
      let missedMessages = 0;

      if (this.config.snapshotOnReconnect && channel.includes('depth')) {
        // For orderbook, fetch fresh snapshot
        const snapshot = await this.fetchSnapshot(exchange, symbol, accountType);
        
        if (snapshot) {
          // Update sequence from snapshot
          this.setLastSequence(exchange, symbol, channel, snapshot.sequence);
          
          // Filter buffered messages to only include those after snapshot
          const validBuffered = buffered.filter(m => 
            m.sequence !== undefined && m.sequence > snapshot.sequence
          );
          
          bufferedApplied = validBuffered.length;
          missedMessages = buffered.length - validBuffered;
        }
      } else {
        // For non-orderbook channels, apply valid buffered messages
        bufferedApplied = validation.validMessages.length;
        missedMessages = validation.discardedMessages.length;
      }

      const result: ReconnectionResult = {
        previousState,
        newState: 'CONNECTED',
        missedMessages,
        bufferedApplied,
        gapsDetected,
        recoveryTime: Date.now() - startTime,
        success: true,
        timestamp: new Date(),
      };

      this.setState(exchange, symbol, 'CONNECTED');
      this.emit('recovered', { exchange, symbol, result });

      // Clear processed buffer
      this.clearBuffer(exchange, symbol);

      return result;
    } catch (error) {
      const result: ReconnectionResult = {
        previousState,
        newState: 'CONNECTED',
        missedMessages: 0,
        bufferedApplied: 0,
        gapsDetected: [],
        recoveryTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };

      this.setState(exchange, symbol, 'CONNECTED');
      this.emit('recovery_failed', { exchange, symbol, result, error });

      return result;
    }
  }

  // ==================== BUFFER CLEANUP ====================

  /**
   * Start periodic buffer cleanup
   */
  private startBufferCleanup(): void {
    this.bufferCleanupInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [key, messages] of this.messageBuffer) {
        // Remove messages older than maxBufferAge
        const filtered = messages.filter(
          m => now - m.timestamp < this.config.maxBufferAge
        );
        
        if (filtered.length !== messages.length) {
          this.messageBuffer.set(key, filtered);
          this.emit('buffer_cleaned', { 
            key, 
            removed: messages.length - filtered.length 
          });
        }
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop buffer cleanup
   */
  stopBufferCleanup(): void {
    if (this.bufferCleanupInterval) {
      clearInterval(this.bufferCleanupInterval);
      this.bufferCleanupInterval = null;
    }
  }

  /**
   * Get message key for buffer storage
   */
  private getMessageKey(message: WSMessage): string {
    return `${message.exchange}:${message.symbol}:${message.channel}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopBufferCleanup();
    this.clearAllBuffers();
    this.removeAllListeners();
  }
}

// ==================== ORDERBOOK RECOVERY CLASS ====================

/**
 * Specialized recovery handler for orderbook data
 */
export class OrderbookRecovery {
  private wsRecovery: WSStateRecovery;
  private orderbooks: Map<string, LocalOrderbook> = new Map();

  constructor(wsRecovery: WSStateRecovery) {
    this.wsRecovery = wsRecovery;
  }

  /**
   * Get or create a local orderbook for a symbol
   */
  getOrderbook(exchange: string, symbol: string): LocalOrderbook {
    const key = `${exchange}:${symbol}`;
    
    if (!this.orderbooks.has(key)) {
      this.orderbooks.set(key, new LocalOrderbook(exchange, symbol));
    }
    
    return this.orderbooks.get(key)!;
  }

  /**
   * Merge orderbook snapshot with buffered deltas
   */
  mergeWithBuffer(
    snapshot: OrderbookSnapshot,
    buffered: DeltaMessage[]
  ): LocalOrderbook {
    const orderbook = this.getOrderbook(snapshot.exchange, snapshot.symbol);
    
    // Initialize with snapshot
    orderbook.initialize(snapshot);
    
    // Sort buffered by sequence
    const sorted = buffered
      .filter(d => d.sequence > snapshot.sequence)
      .sort((a, b) => a.sequence - b.sequence);
    
    // Apply deltas
    for (const delta of sorted) {
      orderbook.applyDelta(delta);
    }
    
    return orderbook;
  }

  /**
   * Validate orderbook integrity
   */
  validateOrderbook(orderbook: LocalOrderbook): {
    valid: boolean;
    crossed: boolean;
    emptyLevels: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    let crossed = false;
    let emptyLevels = false;

    const bestBid = orderbook.getBestBid();
    const bestAsk = orderbook.getBestAsk();

    // Check for crossed book
    if (bestBid && bestAsk && bestBid >= bestAsk) {
      crossed = true;
      issues.push(`Crossed book: best bid (${bestBid}) >= best ask (${bestAsk})`);
    }

    // Check for empty levels
    if (orderbook.getBidCount() === 0 || orderbook.getAskCount() === 0) {
      emptyLevels = true;
      issues.push('Orderbook has empty bid or ask levels');
    }

    return {
      valid: issues.length === 0,
      crossed,
      emptyLevels,
      issues,
    };
  }

  /**
   * Clear orderbook state
   */
  clearOrderbook(exchange: string, symbol: string): void {
    const key = `${exchange}:${symbol}`;
    this.orderbooks.delete(key);
  }

  /**
   * Clear all orderbooks
   */
  clearAll(): void {
    this.orderbooks.clear();
  }
}

// ==================== LOCAL ORDERBOOK CLASS ====================

/**
 * In-memory orderbook for recovery operations
 */
export class LocalOrderbook {
  private bids: Map<number, number> = new Map(); // price -> amount
  private asks: Map<number, number> = new Map();
  private lastSequence: number = 0;
  private lastUpdate: number = 0;
  private initialized: boolean = false;

  constructor(
    public readonly exchange: string,
    public readonly symbol: string
  ) {}

  /**
   * Initialize with snapshot
   */
  initialize(snapshot: OrderbookSnapshot): void {
    this.bids.clear();
    this.asks.clear();

    for (const [price, amount] of snapshot.bids) {
      this.bids.set(price, amount);
    }
    for (const [price, amount] of snapshot.asks) {
      this.asks.set(price, amount);
    }

    this.lastSequence = snapshot.sequence;
    this.lastUpdate = snapshot.timestamp;
    this.initialized = true;
  }

  /**
   * Apply a delta update
   */
  applyDelta(delta: DeltaMessage): boolean {
    if (!this.initialized) {
      return false;
    }

    // Sequence check
    if (delta.sequence <= this.lastSequence) {
      return false; // Skip outdated
    }

    // Apply bid updates
    for (const [price, amount] of delta.bids) {
      if (amount === 0) {
        this.bids.delete(price);
      } else {
        this.bids.set(price, amount);
      }
    }

    // Apply ask updates
    for (const [price, amount] of delta.asks) {
      if (amount === 0) {
        this.asks.delete(price);
      } else {
        this.asks.set(price, amount);
      }
    }

    this.lastSequence = delta.sequence;
    this.lastUpdate = delta.timestamp;

    return true;
  }

  /**
   * Get best bid price
   */
  getBestBid(): number | null {
    let best = null;
    for (const price of this.bids.keys()) {
      if (best === null || price > best) {
        best = price;
      }
    }
    return best;
  }

  /**
   * Get best ask price
   */
  getBestAsk(): number | null {
    let best = null;
    for (const price of this.asks.keys()) {
      if (best === null || price < best) {
        best = price;
      }
    }
    return best;
  }

  /**
   * Get sorted bids (descending)
   */
  getBids(limit?: number): Array<[number, number]> {
    const sorted = Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0]);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get sorted asks (ascending)
   */
  getAsks(limit?: number): Array<[number, number]> {
    const sorted = Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0]);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get bid level count
   */
  getBidCount(): number {
    return this.bids.size;
  }

  /**
   * Get ask level count
   */
  getAskCount(): number {
    return this.asks.size;
  }

  /**
   * Get spread info
   */
  getSpread(): { absolute: number; percent: number } | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    if (bestBid === null || bestAsk === null) {
      return null;
    }

    const absolute = bestAsk - bestBid;
    const mid = (bestBid + bestAsk) / 2;
    const percent = (absolute / mid) * 100;

    return { absolute, percent };
  }

  /**
   * Get mid price
   */
  getMidPrice(): number | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    if (bestBid === null || bestAsk === null) {
      return null;
    }

    return (bestBid + bestAsk) / 2;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get last sequence
   */
  getLastSequence(): number {
    return this.lastSequence;
  }

  /**
   * Get last update time
   */
  getLastUpdate(): number {
    return this.lastUpdate;
  }

  /**
   * Clear orderbook
   */
  clear(): void {
    this.bids.clear();
    this.asks.clear();
    this.lastSequence = 0;
    this.lastUpdate = 0;
    this.initialized = false;
  }
}

// ==================== SNAPSHOT FETCHERS ====================

/**
 * Create snapshot fetcher for Binance
 */
export function createBinanceSnapshotFetcher(
  marketType: 'spot' | 'futures' | 'inverse' = 'futures'
): SnapshotFetcher {
  const baseUrl = marketType === 'spot' 
    ? 'https://api.binance.com'
    : marketType === 'futures'
    ? 'https://fapi.binance.com'
    : 'https://dapi.binance.com';

  return async (exchange: string, symbol: string): Promise<OrderbookSnapshot | null> => {
    try {
      const endpoint = marketType === 'spot'
        ? `/api/v3/depth?symbol=${symbol}&limit=1000`
        : marketType === 'futures'
        ? `/fapi/v1/depth?symbol=${symbol}&limit=1000`
        : `/dapi/v1/depth?symbol=${symbol}&limit=1000`;

      const response = await fetch(`${baseUrl}${endpoint}`);
      const data = await response.json() as {
        bids: Array<[string, string]>;
        asks: Array<[string, string]>;
        lastUpdateId: number;
      };

      return {
        exchange: 'binance',
        symbol,
        bids: data.bids.map(([p, a]) => [parseFloat(p), parseFloat(a)]),
        asks: data.asks.map(([p, a]) => [parseFloat(p), parseFloat(a)]),
        sequence: data.lastUpdateId,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`[BinanceSnapshot] Failed for ${symbol}:`, error);
      return null;
    }
  };
}

/**
 * Create snapshot fetcher for Bybit
 */
export function createBybitSnapshotFetcher(
  accountType: 'spot' | 'linear' | 'inverse' = 'linear'
): SnapshotFetcher {
  const baseUrl = 'https://api.bybit.com';
  
  return async (exchange: string, symbol: string): Promise<OrderbookSnapshot | null> => {
    try {
      const category = accountType === 'spot' ? 'spot' : accountType;
      const response = await fetch(
        `${baseUrl}/v5/market/orderbook?category=${category}&symbol=${symbol}&limit=500`
      );
      
      const data = await response.json() as {
        result: {
          b: Array<[string, string]>;
          a: Array<[string, string]>;
          seq: number;
          ts: number;
        }
      };

      return {
        exchange: 'bybit',
        symbol,
        bids: data.result.b.map(([p, a]) => [parseFloat(p), parseFloat(a)]),
        asks: data.result.a.map(([p, a]) => [parseFloat(p), parseFloat(a)]),
        sequence: data.result.seq,
        timestamp: data.result.ts,
      };
    } catch (error) {
      console.error(`[BybitSnapshot] Failed for ${symbol}:`, error);
      return null;
    }
  };
}

/**
 * Create snapshot fetcher for OKX
 */
export function createOKXSnapshotFetcher(): SnapshotFetcher {
  const baseUrl = 'https://www.okx.com';

  return async (exchange: string, symbol: string): Promise<OrderbookSnapshot | null> => {
    try {
      const response = await fetch(
        `${baseUrl}/api/v5/market/books?instId=${symbol}&sz=400`
      );
      
      const data = await response.json() as {
        data: Array<{
          bids: Array<[string, string, string, string]>;
          asks: Array<[string, string, string, string]>;
          ts: string;
          seqId: string;
        }>
      };

      if (!data.data || data.data.length === 0) {
        return null;
      }

      const book = data.data[0];

      return {
        exchange: 'okx',
        symbol,
        bids: book.bids.map(([p, a]) => [parseFloat(p), parseFloat(a)]),
        asks: book.asks.map(([p, a]) => [parseFloat(p), parseFloat(a)]),
        sequence: parseInt(book.seqId),
        timestamp: parseInt(book.ts),
      };
    } catch (error) {
      console.error(`[OKXSnapshot] Failed for ${symbol}:`, error);
      return null;
    }
  };
}

/**
 * Create snapshot fetcher for Bitget
 */
export function createBitgetSnapshotFetcher(
  accountType: 'spot' | 'futures' = 'futures'
): SnapshotFetcher {
  const baseUrl = 'https://api.bitget.com';

  return async (exchange: string, symbol: string): Promise<OrderbookSnapshot | null> => {
    try {
      const instType = accountType === 'spot' ? 'SPOT' : 'USDT-FUTURES';
      const response = await fetch(
        `${baseUrl}/api/v2/mix/market/orderbook?instType=${instType}&instId=${symbol}&limit=400`
      );
      
      const data = await response.json() as {
        data: {
          bids: Array<[string, string]>;
          asks: Array<[string, string]>;
          ts: string;
          seqId: string;
        }
      };

      if (!data.data) {
        return null;
      }

      return {
        exchange: 'bitget',
        symbol,
        bids: data.data.bids.map(([p, a]) => [parseFloat(p), parseFloat(a)]),
        asks: data.data.asks.map(([p, a]) => [parseFloat(p), parseFloat(a)]),
        sequence: parseInt(data.data.seqId),
        timestamp: parseInt(data.data.ts),
      };
    } catch (error) {
      console.error(`[BitgetSnapshot] Failed for ${symbol}:`, error);
      return null;
    }
  };
}

/**
 * Create snapshot fetcher for BingX
 */
export function createBingXSnapshotFetcher(): SnapshotFetcher {
  const baseUrl = 'https://open-api.bingx.com';

  return async (exchange: string, symbol: string): Promise<OrderbookSnapshot | null> => {
    try {
      const response = await fetch(
        `${baseUrl}/openApi/swap/v2/quote/depth?symbol=${symbol}&limit=500`
      );
      
      const data = await response.json() as {
        data: {
          bids: Array<{ price: string; volume: string }>;
          asks: Array<{ price: string; volume: string }>;
          timestamp: number;
          sequence?: number;
        }
      };

      if (!data.data) {
        return null;
      }

      return {
        exchange: 'bingx',
        symbol,
        bids: data.data.bids.map(b => [parseFloat(b.price), parseFloat(b.volume)]),
        asks: data.data.asks.map(a => [parseFloat(a.price), parseFloat(a.volume)]),
        sequence: data.data.sequence || Date.now(),
        timestamp: data.data.timestamp,
      };
    } catch (error) {
      console.error(`[BingXSnapshot] Failed for ${symbol}:`, error);
      return null;
    }
  };
}

// ==================== SINGLETON EXPORT ====================

/**
 * Default global state recovery instance
 */
export const wsStateRecovery = new WSStateRecovery();

/**
 * Default orderbook recovery instance
 */
export const orderbookRecovery = new OrderbookRecovery(wsStateRecovery);

// Register default snapshot fetchers
wsStateRecovery.registerSnapshotFetcher('binance', createBinanceSnapshotFetcher());
wsStateRecovery.registerSnapshotFetcher('bybit', createBybitSnapshotFetcher());
wsStateRecovery.registerSnapshotFetcher('okx', createOKXSnapshotFetcher());
wsStateRecovery.registerSnapshotFetcher('bitget', createBitgetSnapshotFetcher());
wsStateRecovery.registerSnapshotFetcher('bingx', createBingXSnapshotFetcher());

export default WSStateRecovery;
