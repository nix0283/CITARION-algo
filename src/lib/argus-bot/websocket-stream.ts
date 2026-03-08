/**
 * Argus Bot WebSocket Stream Manager
 * 
 * Real-time WebSocket streams for pump/dump detection
 * Supports Binance and Bybit exchanges
 * 
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Heartbeat/ping-pong handling
 * - Trade streams for price monitoring
 * - Depth streams for orderbook analysis
 * - Volume surge detection
 */

import { EventEmitter } from 'events';

// ==================== TYPES ====================

export type ExchangeId = 'binance' | 'bybit' | 'bingx';

export interface TradeData {
  exchange: ExchangeId;
  symbol: string;
  tradeId: string;
  price: number;
  quantity: number;
  value: number;
  side: 'BUY' | 'SELL';
  timestamp: Date;
}

export interface DepthData {
  exchange: ExchangeId;
  symbol: string;
  bids: Array<[number, number]>; // [price, quantity]
  asks: Array<[number, number]>;
  timestamp: Date;
}

export interface VolumeWindow {
  timestamp: number;
  volume: number;
  trades: number;
  buyVolume: number;
  sellVolume: number;
}

export interface StreamConfig {
  exchange: ExchangeId;
  symbols: string[];
  onTrade?: (trade: TradeData) => void;
  onDepth?: (depth: DepthData) => void;
  onVolumeSurge?: (symbol: string, surge: VolumeSurgeEvent) => void;
  onError?: (error: Error) => void;
  reconnectAttempts?: number;
  reconnectBaseDelay?: number;
}

export interface VolumeSurgeEvent {
  symbol: string;
  exchange: ExchangeId;
  currentVolume: number;
  averageVolume: number;
  surgeRatio: number;
  buyPressure: number; // -1 to 1
  timestamp: Date;
}

export interface StreamStatus {
  exchange: ExchangeId;
  connected: boolean;
  reconnectAttempts: number;
  lastMessage: Date | null;
  tradesReceived: number;
  depthsReceived: number;
}

// ==================== WEBSOCKET URLS ====================

const WS_URLS: Record<ExchangeId, { trade: string; depth: string }> = {
  binance: {
    trade: 'wss://fstream.binance.com/ws',
    depth: 'wss://fstream.binance.com/ws',
  },
  bybit: {
    trade: 'wss://stream.bybit.com/v5/public/linear',
    depth: 'wss://stream.bybit.com/v5/public/linear',
  },
  bingx: {
    trade: 'wss://open-api-swap.bingx.com/ws',
    depth: 'wss://open-api-swap.bingx.com/ws',
  },
};

// ==================== ARGUS WEBSOCKET STREAM ====================

export class ArgusWebSocketStream extends EventEmitter {
  private exchange: ExchangeId;
  private symbols: string[];
  private ws: WebSocket | null = null;
  private wsDepth: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectBaseDelay: number;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPongTime = Date.now();
  private readonly PONG_TIMEOUT = 60000;
  
  // Volume tracking
  private volumeWindows: Map<string, VolumeWindow[]> = new Map();
  private readonly WINDOW_SIZE = 60000; // 1 minute windows
  private readonly MAX_WINDOWS = 15; // 15 minutes of history
  
  // Stats
  private tradesReceived = 0;
  private depthsReceived = 0;
  private lastMessageTime: Date | null = null;

  constructor(config: StreamConfig) {
    super();
    this.exchange = config.exchange;
    this.symbols = config.symbols;
    this.maxReconnectAttempts = config.reconnectAttempts ?? 10;
    this.reconnectBaseDelay = config.reconnectBaseDelay ?? 1000;
    
    // Set up event handlers
    if (config.onTrade) this.on('trade', config.onTrade);
    if (config.onDepth) this.on('depth', config.onDepth);
    if (config.onVolumeSurge) this.on('volumeSurge', config.onVolumeSurge);
    if (config.onError) this.on('error', config.onError);
  }

  // ==================== CONNECTION ====================

  async connect(): Promise<void> {
    await Promise.all([
      this.connectTradeStream(),
      this.connectDepthStream(),
    ]);
  }

  private async connectTradeStream(): Promise<void> {
    const urls = WS_URLS[this.exchange];
    if (!urls) {
      this.emit('error', new Error(`Unknown exchange: ${this.exchange}`));
      return;
    }

    // Build URL based on exchange
    let wsUrl: string;
    switch (this.exchange) {
      case 'binance':
        // Binance combined stream
        const streams = this.symbols.map(s => `${s.toLowerCase()}@aggTrade`).join('/');
        wsUrl = `${urls.trade}/${streams}`;
        break;
      case 'bybit':
      case 'bingx':
        wsUrl = urls.trade;
        break;
      default:
        wsUrl = urls.trade;
    }

    console.log(`[Argus/${this.exchange}] Connecting to trade stream: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[Argus/${this.exchange}] Trade stream connected`);
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        
        // Subscribe for exchanges that need explicit subscription
        if (this.exchange === 'bybit' || this.exchange === 'bingx') {
          this.subscribeToTrades();
        }
        
        this.startPingInterval();
        this.emit('connected', { exchange: this.exchange, type: 'trade' });
      };

      this.ws.onmessage = (event) => {
        this.handleTradeMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error(`[Argus/${this.exchange}] Trade stream error:`, error);
        this.emit('error', error);
      };

      this.ws.onclose = () => {
        console.log(`[Argus/${this.exchange}] Trade stream closed`);
        this.stopPingInterval();
        this.scheduleReconnect('trade');
      };

    } catch (error) {
      console.error(`[Argus/${this.exchange}] Failed to connect:`, error);
      this.scheduleReconnect('trade');
    }
  }

  private async connectDepthStream(): Promise<void> {
    const urls = WS_URLS[this.exchange];
    if (!urls) return;

    let wsUrl: string;
    switch (this.exchange) {
      case 'binance':
        const streams = this.symbols.map(s => `${s.toLowerCase()}@depth@100ms`).join('/');
        wsUrl = `${urls.depth}/${streams}`;
        break;
      case 'bybit':
      case 'bingx':
        wsUrl = urls.depth;
        break;
      default:
        wsUrl = urls.depth;
    }

    console.log(`[Argus/${this.exchange}] Connecting to depth stream: ${wsUrl}`);

    try {
      this.wsDepth = new WebSocket(wsUrl);

      this.wsDepth.onopen = () => {
        console.log(`[Argus/${this.exchange}] Depth stream connected`);
        
        if (this.exchange === 'bybit' || this.exchange === 'bingx') {
          this.subscribeToDepth();
        }
        
        this.emit('connected', { exchange: this.exchange, type: 'depth' });
      };

      this.wsDepth.onmessage = (event) => {
        this.handleDepthMessage(event.data);
      };

      this.wsDepth.onerror = (error) => {
        console.error(`[Argus/${this.exchange}] Depth stream error:`, error);
      };

      this.wsDepth.onclose = () => {
        console.log(`[Argus/${this.exchange}] Depth stream closed`);
        this.scheduleReconnect('depth');
      };

    } catch (error) {
      console.error(`[Argus/${this.exchange}] Failed to connect depth:`, error);
      this.scheduleReconnect('depth');
    }
  }

  private subscribeToTrades(): void {
    if (!this.ws) return;
    
    switch (this.exchange) {
      case 'bybit':
        this.ws.send(JSON.stringify({
          op: 'subscribe',
          args: this.symbols.map(s => `publicTrade.${s}`),
        }));
        break;
      case 'bingx':
        this.symbols.forEach(symbol => {
          this.ws?.send(JSON.stringify({
            id: Date.now(),
            reqType: 'sub',
            dataType: `${symbol}@trade`,
          }));
        });
        break;
    }
  }

  private subscribeToDepth(): void {
    if (!this.wsDepth) return;
    
    switch (this.exchange) {
      case 'bybit':
        this.wsDepth.send(JSON.stringify({
          op: 'subscribe',
          args: this.symbols.map(s => `orderbook.50.${s}`),
        }));
        break;
      case 'bingx':
        this.symbols.forEach(symbol => {
          this.wsDepth?.send(JSON.stringify({
            id: Date.now(),
            reqType: 'sub',
            dataType: `${symbol}@depth`,
          }));
        });
        break;
    }
  }

  // ==================== MESSAGE HANDLING ====================

  private handleTradeMessage(data: string): void {
    this.lastMessageTime = new Date();
    this.lastPongTime = Date.now();
    
    try {
      const msg = JSON.parse(data);
      
      // Handle ping/pong
      if (this.handlePingPong(msg, this.ws)) return;
      
      // Parse trade based on exchange
      let trades: TradeData[] = [];
      
      switch (this.exchange) {
        case 'binance':
          trades = this.parseBinanceTrade(msg);
          break;
        case 'bybit':
          trades = this.parseBybitTrade(msg);
          break;
        case 'bingx':
          trades = this.parseBingxTrade(msg);
          break;
      }
      
      // Process trades
      for (const trade of trades) {
        this.tradesReceived++;
        this.updateVolumeWindow(trade);
        this.emit('trade', trade);
      }
      
    } catch (error) {
      // Ignore parse errors
    }
  }

  private handleDepthMessage(data: string): void {
    this.lastMessageTime = new Date();
    
    try {
      const msg = JSON.parse(data);
      
      // Handle ping/pong
      if (this.handlePingPong(msg, this.wsDepth)) return;
      
      // Parse depth based on exchange
      let depth: DepthData | null = null;
      
      switch (this.exchange) {
        case 'binance':
          depth = this.parseBinanceDepth(msg);
          break;
        case 'bybit':
          depth = this.parseBybitDepth(msg);
          break;
        case 'bingx':
          depth = this.parseBingxDepth(msg);
          break;
      }
      
      if (depth) {
        this.depthsReceived++;
        this.emit('depth', depth);
      }
      
    } catch (error) {
      // Ignore parse errors
    }
  }

  private handlePingPong(msg: unknown, ws: WebSocket | null): boolean {
    if (!ws) return false;
    
    switch (this.exchange) {
      case 'binance':
        if (typeof msg === 'object' && msg !== null && 'ping' in msg) {
          ws.send(JSON.stringify({ pong: (msg as { ping: number }).ping }));
          return true;
        }
        break;
      case 'bybit':
        if (typeof msg === 'object' && msg !== null && 
            'op' in msg && (msg as { op: string }).op === 'ping') {
          ws.send(JSON.stringify({ op: 'pong', ts: Date.now() }));
          return true;
        }
        break;
      case 'bingx':
        if (typeof msg === 'object' && msg !== null && 'ping' in msg) {
          ws.send('Pong');
          return true;
        }
        break;
    }
    
    return false;
  }

  // ==================== PARSERS ====================

  private parseBinanceTrade(msg: unknown): TradeData[] {
    const data = msg as {
      e?: string;
      s?: string;
      t?: number;
      p?: string;
      q?: string;
      T?: number;
      m?: boolean;
    };
    
    if (data.e !== 'aggTrade' || !data.s) return [];
    
    return [{
      exchange: 'binance',
      symbol: data.s,
      tradeId: String(data.t),
      price: parseFloat(data.p || '0'),
      quantity: parseFloat(data.q || '0'),
      value: parseFloat(data.p || '0') * parseFloat(data.q || '0'),
      side: data.m ? 'SELL' : 'BUY',
      timestamp: new Date(data.T || Date.now()),
    }];
  }

  private parseBybitTrade(msg: unknown): TradeData[] {
    const data = msg as {
      topic?: string;
      data?: Array<{
        s?: string;
        i?: string;
        p?: string;
        v?: string;
        T?: number;
        S?: 'Buy' | 'Sell';
      }>;
    };
    
    if (!data.topic?.includes('publicTrade') || !data.data) return [];
    
    return data.data.map(t => ({
      exchange: 'bybit' as ExchangeId,
      symbol: t.s || '',
      tradeId: t.i || '',
      price: parseFloat(t.p || '0'),
      quantity: parseFloat(t.v || '0'),
      value: parseFloat(t.p || '0') * parseFloat(t.v || '0'),
      side: t.S === 'Buy' ? 'BUY' : 'SELL',
      timestamp: new Date(t.T || Date.now()),
    }));
  }

  private parseBingxTrade(msg: unknown): TradeData[] {
    const data = msg as {
      dataType?: string;
      data?: {
        symbol?: string;
        tradeId?: string;
        price?: string;
        qty?: string;
        time?: number;
        side?: number;
      };
    };
    
    if (!data.dataType?.includes('trade') || !data.data) return [];
    
    return [{
      exchange: 'bingx',
      symbol: data.data.symbol || '',
      tradeId: data.data.tradeId || '',
      price: parseFloat(data.data.price || '0'),
      quantity: parseFloat(data.data.qty || '0'),
      value: parseFloat(data.data.price || '0') * parseFloat(data.data.qty || '0'),
      side: data.data.side === 1 ? 'BUY' : 'SELL',
      timestamp: new Date(data.data.time || Date.now()),
    }];
  }

  private parseBinanceDepth(msg: unknown): DepthData | null {
    const data = msg as {
      e?: string;
      s?: string;
      b?: Array<[string, string]>;
      a?: Array<[string, string]>;
      E?: number;
    };
    
    if (!data.s || (!data.b && !data.a)) return null;
    
    return {
      exchange: 'binance',
      symbol: data.s,
      bids: (data.b || []).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
      asks: (data.a || []).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
      timestamp: new Date(data.E || Date.now()),
    };
  }

  private parseBybitDepth(msg: unknown): DepthData | null {
    const data = msg as {
      topic?: string;
      type?: string;
      data?: {
        s?: string;
        b?: Array<[string, string]>;
        a?: Array<[string, string]>;
      };
      ts?: number;
    };
    
    if (!data.topic?.includes('orderbook') || !data.data) return null;
    
    return {
      exchange: 'bybit',
      symbol: data.data.s || '',
      bids: (data.data.b || []).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
      asks: (data.data.a || []).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
      timestamp: new Date(data.ts || Date.now()),
    };
  }

  private parseBingxDepth(msg: unknown): DepthData | null {
    const data = msg as {
      dataType?: string;
      data?: {
        symbol?: string;
        bids?: Array<{ price: string; volume: string }>;
        asks?: Array<{ price: string; volume: string }>;
        timestamp?: number;
      };
    };
    
    if (!data.dataType?.includes('depth') || !data.data) return null;
    
    return {
      exchange: 'bingx',
      symbol: data.data.symbol || '',
      bids: (data.data.bids || []).map(b => [parseFloat(b.price), parseFloat(b.volume)]),
      asks: (data.data.asks || []).map(a => [parseFloat(a.price), parseFloat(a.volume)]),
      timestamp: new Date(data.data.timestamp || Date.now()),
    };
  }

  // ==================== VOLUME TRACKING ====================

  private updateVolumeWindow(trade: TradeData): void {
    const windowTime = Math.floor(trade.timestamp.getTime() / this.WINDOW_SIZE) * this.WINDOW_SIZE;
    
    if (!this.volumeWindows.has(trade.symbol)) {
      this.volumeWindows.set(trade.symbol, []);
    }
    
    const windows = this.volumeWindows.get(trade.symbol)!;
    
    // Find or create window
    let window = windows.find(w => w.timestamp === windowTime);
    if (!window) {
      window = {
        timestamp: windowTime,
        volume: 0,
        trades: 0,
        buyVolume: 0,
        sellVolume: 0,
      };
      windows.push(window);
      
      // Keep only recent windows
      while (windows.length > this.MAX_WINDOWS) {
        windows.shift();
      }
    }
    
    // Update window
    window.volume += trade.value;
    window.trades++;
    if (trade.side === 'BUY') {
      window.buyVolume += trade.value;
    } else {
      window.sellVolume += trade.value;
    }
    
    // Check for volume surge
    this.checkVolumeSurge(trade.symbol, trade.exchange);
  }

  private checkVolumeSurge(symbol: string, exchange: ExchangeId): void {
    const windows = this.volumeWindows.get(symbol);
    if (!windows || windows.length < 5) return; // Need at least 5 minutes of history
    
    const currentWindow = windows[windows.length - 1];
    const historicalWindows = windows.slice(0, -1);
    
    if (historicalWindows.length < 3) return;
    
    // Calculate average volume (excluding current)
    const avgVolume = historicalWindows.reduce((sum, w) => sum + w.volume, 0) / historicalWindows.length;
    
    // Current window volume
    const currentVolume = currentWindow.volume;
    
    // Surge ratio
    const surgeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
    
    // Only emit if surge is significant (2x average)
    if (surgeRatio >= 2.0) {
      // Calculate buy pressure
      const totalVolume = currentWindow.buyVolume + currentWindow.sellVolume;
      const buyPressure = totalVolume > 0 
        ? (currentWindow.buyVolume - currentWindow.sellVolume) / totalVolume 
        : 0;
      
      const event: VolumeSurgeEvent = {
        symbol,
        exchange,
        currentVolume,
        averageVolume: avgVolume,
        surgeRatio,
        buyPressure,
        timestamp: new Date(),
      };
      
      this.emit('volumeSurge', symbol, event);
    }
  }

  // ==================== RECONNECTION ====================

  private scheduleReconnect(type: 'trade' | 'depth'): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[Argus/${this.exchange}] Max reconnection attempts reached`);
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }
    
    // Exponential backoff with jitter
    const delay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      60000
    ) + Math.random() * 1000;
    
    this.reconnectAttempts++;
    
    console.log(`[Argus/${this.exchange}] Reconnecting ${type} in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (type === 'trade') {
        this.connectTradeStream();
      } else {
        this.connectDepthStream();
      }
    }, delay);
  }

  // ==================== HEARTBEAT ====================

  private startPingInterval(): void {
    this.stopPingInterval();
    
    const interval = this.exchange === 'binance' ? 180000 : 20000;
    
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        switch (this.exchange) {
          case 'bybit':
            this.ws.send(JSON.stringify({ op: 'ping' }));
            break;
          case 'binance':
            // Binance sends pings automatically
            break;
          case 'bingx':
            this.ws.send(JSON.stringify({ ping: Date.now() }));
            break;
        }
      }
      
      // Check for timeout
      if (Date.now() - this.lastPongTime > this.PONG_TIMEOUT) {
        console.warn(`[Argus/${this.exchange}] Heartbeat timeout, reconnecting`);
        this.ws?.close();
        this.wsDepth?.close();
      }
    }, interval);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ==================== PUBLIC METHODS ====================

  disconnect(): void {
    this.stopPingInterval();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.ws?.close();
    this.wsDepth?.close();
    this.ws = null;
    this.wsDepth = null;
    
    console.log(`[Argus/${this.exchange}] Disconnected`);
  }

  getStatus(): StreamStatus {
    return {
      exchange: this.exchange,
      connected: this.ws?.readyState === WebSocket.OPEN,
      reconnectAttempts: this.reconnectAttempts,
      lastMessage: this.lastMessageTime,
      tradesReceived: this.tradesReceived,
      depthsReceived: this.depthsReceived,
    };
  }

  getVolumeStats(symbol: string): { currentVolume: number; averageVolume: number; windows: number } | null {
    const windows = this.volumeWindows.get(symbol);
    if (!windows || windows.length === 0) return null;
    
    const currentWindow = windows[windows.length - 1];
    const historicalWindows = windows.slice(0, -1);
    const avgVolume = historicalWindows.length > 0
      ? historicalWindows.reduce((sum, w) => sum + w.volume, 0) / historicalWindows.length
      : 0;
    
    return {
      currentVolume: currentWindow.volume,
      averageVolume: avgVolume,
      windows: windows.length,
    };
  }

  addSymbol(symbol: string): void {
    if (this.symbols.includes(symbol)) return;
    
    this.symbols.push(symbol);
    
    // Resubscribe if connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.subscribeToTrades();
    }
    if (this.wsDepth?.readyState === WebSocket.OPEN) {
      this.subscribeToDepth();
    }
  }

  removeSymbol(symbol: string): void {
    const index = this.symbols.indexOf(symbol);
    if (index > -1) {
      this.symbols.splice(index, 1);
      this.volumeWindows.delete(symbol);
    }
    
    // For Bybit and BingX, we need to reconnect to update subscriptions
    // Binance uses URL-based streams, so we'd need to reconnect too
  }
}

// ==================== MULTI-EXCHANGE MANAGER ====================

export class ArgusMultiExchangeStream extends EventEmitter {
  private streams: Map<ExchangeId, ArgusWebSocketStream> = new Map();
  private symbols: string[];
  
  constructor(symbols: string[] = []) {
    super();
    this.symbols = symbols;
  }
  
  async connect(exchanges: ExchangeId[]): Promise<void> {
    const promises = exchanges.map(async (exchange) => {
      if (this.streams.has(exchange)) return;
      
      const stream = new ArgusWebSocketStream({
        exchange,
        symbols: this.symbols,
        onTrade: (trade) => this.emit('trade', trade),
        onDepth: (depth) => this.emit('depth', depth),
        onVolumeSurge: (symbol, surge) => this.emit('volumeSurge', symbol, surge),
        onError: (error) => this.emit('error', error, exchange),
      });
      
      this.streams.set(exchange, stream);
      await stream.connect();
    });
    
    await Promise.all(promises);
  }
  
  disconnect(): void {
    for (const stream of this.streams.values()) {
      stream.disconnect();
    }
    this.streams.clear();
  }
  
  addSymbol(symbol: string): void {
    this.symbols.push(symbol);
    for (const stream of this.streams.values()) {
      stream.addSymbol(symbol);
    }
  }
  
  getStreamStatus(): Map<ExchangeId, StreamStatus> {
    const status = new Map<ExchangeId, StreamStatus>();
    for (const [exchange, stream] of this.streams) {
      status.set(exchange, stream.getStatus());
    }
    return status;
  }
}
