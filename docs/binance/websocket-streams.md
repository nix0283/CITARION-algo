# Binance WebSocket Streams

Complete reference for Binance WebSocket real-time data streams.

## Table of Contents

1. [Connection Basics](#connection-basics)
2. [Stream Types](#stream-types)
3. [Live Subscribing/Unsubscribing](#live-subscribingunsubscribing)
4. [Stream Payloads](#stream-payloads)
5. [Order Book Management](#order-book-management)
6. [Implementation Examples](#implementation-examples)

## Connection Basics

### Base Endpoints

```
Primary:     wss://stream.binance.com:9443
Alternative: wss://stream.binance.com:443
Market Data: wss://data-stream.binance.vision (no user data stream)
```

### Connection Types

1. **Raw Streams**: Single stream connection
   ```
   wss://stream.binance.com:9443/ws/<streamName>
   ```

2. **Combined Streams**: Multiple streams in one connection
   ```
   wss://stream.binance.com:9443/stream?streams=<streamName1>/<streamName2>/<streamName3>
   ```

### Connection Rules

- Connections are valid for **24 hours**; expect disconnection at 24h mark
- WebSocket server sends **ping frame every 20 seconds**
- Must respond with **pong frame within 1 minute** or be disconnected
- Maximum **1024 streams per connection**
- Maximum **300 connection attempts per 5 minutes per IP**
- Maximum **5 incoming messages per second** (ping/pong/JSON)

### Time Units

By default, all timestamps are in **milliseconds**. To receive microseconds:

```
wss://stream.binance.com:9443/stream?streams=btcusdt@trade&timeUnit=MICROSECOND
```

## Stream Types

### Trade Streams

| Stream | Name | Description |
|--------|------|-------------|
| Aggregate Trade | `<symbol>@aggTrade` | Trades aggregated by taker order |
| Trade | `<symbol>@trade` | Raw trade data |

### Kline Streams

| Stream | Name | Intervals |
|--------|------|-----------|
| Kline (UTC) | `<symbol>@kline_<interval>` | 1s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M |
| Kline (UTC+8) | `<symbol>@kline_<interval>@+08:00` | Same as above |

### Ticker Streams

| Stream | Name | Update Speed |
|--------|------|--------------|
| Mini Ticker | `<symbol>@miniTicker` | 1000ms |
| All Mini Tickers | `!miniTicker@arr` | 1000ms |
| Ticker | `<symbol>@ticker` | 1000ms |
| Rolling Window Ticker | `<symbol>@ticker_<window>` | 1000ms |
| All Rolling Window Tickers | `!ticker_<window>@arr` | 1000ms |

Window sizes: `1h`, `4h`, `1d`

### Book Streams

| Stream | Name | Update Speed |
|--------|------|--------------|
| Book Ticker | `<symbol>@bookTicker` | Real-time |
| Partial Book Depth | `<symbol>@depth<levels>` | 1000ms or 100ms |
| Diff. Depth | `<symbol>@depth` | 1000ms or 100ms |

Valid levels: `5`, `10`, `20`

### Average Price

| Stream | Name | Update Speed |
|--------|------|--------------|
| Average Price | `<symbol>@avgPrice` | 1000ms |

## Live Subscribing/Unsubscribing

### Subscribe to Streams

```json
// Request
{
  "method": "SUBSCRIBE",
  "params": [
    "btcusdt@aggTrade",
    "btcusdt@depth"
  ],
  "id": 1
}

// Response
{
  "result": null,
  "id": 1
}
```

### Unsubscribe from Streams

```json
// Request
{
  "method": "UNSUBSCRIBE",
  "params": [
    "btcusdt@depth"
  ],
  "id": 2
}

// Response
{
  "result": null,
  "id": 2
}
```

### List Subscriptions

```json
// Request
{
  "method": "LIST_SUBSCRIPTIONS",
  "id": 3
}

// Response
{
  "result": ["btcusdt@aggTrade"],
  "id": 3
}
```

## Stream Payloads

### Aggregate Trade

```json
{
  "e": "aggTrade",      // Event type
  "E": 1672515782136,   // Event time
  "s": "BNBBTC",        // Symbol
  "a": 12345,           // Aggregate trade ID
  "p": "0.001",         // Price
  "q": "100",           // Quantity
  "f": 100,             // First trade ID
  "l": 105,             // Last trade ID
  "T": 1672515782136,   // Trade time
  "m": true,            // Is buyer market maker?
  "M": true             // Ignore
}
```

### Trade

```json
{
  "e": "trade",         // Event type
  "E": 1672515782136,   // Event time
  "s": "BNBBTC",        // Symbol
  "t": 12345,           // Trade ID
  "p": "0.001",         // Price
  "q": "100",           // Quantity
  "T": 1672515782136,   // Trade time
  "m": true,            // Is buyer market maker?
  "M": true             // Ignore
}
```

### Kline

```json
{
  "e": "kline",           // Event type
  "E": 1672515782136,     // Event time
  "s": "BNBBTC",          // Symbol
  "k": {
    "t": 1672515780000,   // Kline start time
    "T": 1672515839999,   // Kline close time
    "s": "BNBBTC",        // Symbol
    "i": "1m",            // Interval
    "f": 100,             // First trade ID
    "L": 200,             // Last trade ID
    "o": "0.0010",        // Open price
    "c": "0.0020",        // Close price
    "h": "0.0025",        // High price
    "l": "0.0015",        // Low price
    "v": "1000",          // Base asset volume
    "n": 100,             // Number of trades
    "x": false,           // Is kline closed?
    "q": "1.0000",        // Quote asset volume
    "V": "500",           // Taker buy base volume
    "Q": "0.500",         // Taker buy quote volume
    "B": "123456"         // Ignore
  }
}
```

### Book Ticker

```json
{
  "u": 400900217,        // Order book update ID
  "s": "BNBUSDT",        // Symbol
  "b": "25.35190000",    // Best bid price
  "B": "31.21000000",    // Best bid quantity
  "a": "25.36520000",    // Best ask price
  "A": "40.66000000"     // Best ask quantity
}
```

### Diff. Depth

```json
{
  "e": "depthUpdate",    // Event type
  "E": 1672515782136,    // Event time
  "s": "BNBBTC",         // Symbol
  "U": 157,              // First update ID in event
  "u": 160,              // Final update ID in event
  "b": [                 // Bids to update
    ["0.0024", "10"]     // [price, quantity]
  ],
  "a": [                 // Asks to update
    ["0.0026", "100"]
  ]
}
```

### 24hr Mini Ticker

```json
{
  "e": "24hrMiniTicker",   // Event type
  "E": 1672515782136,      // Event time
  "s": "BNBBTC",           // Symbol
  "c": "0.0025",           // Close price
  "o": "0.0010",           // Open price
  "h": "0.0025",           // High price
  "l": "0.0010",           // Low price
  "v": "10000",            // Base asset volume
  "q": "18"                // Quote asset volume
}
```

### 24hr Ticker

```json
{
  "e": "24hrTicker",       // Event type
  "E": 1672515782136,      // Event time
  "s": "BNBBTC",           // Symbol
  "p": "0.0015",           // Price change
  "P": "250.00",           // Price change percent
  "w": "0.0018",           // Weighted average price
  "x": "0.0009",           // Previous close price
  "c": "0.0025",           // Last price
  "Q": "10",               // Last quantity
  "b": "0.0024",           // Best bid price
  "B": "10",               // Best bid quantity
  "a": "0.0026",           // Best ask price
  "A": "100",              // Best ask quantity
  "o": "0.0010",           // Open price
  "h": "0.0025",           // High price
  "l": "0.0010",           // Low price
  "v": "10000",            // Base asset volume
  "q": "18",               // Quote asset volume
  "O": 0,                  // Statistics open time
  "C": 86400000,           // Statistics close time
  "F": 0,                  // First trade ID
  "L": 18150,              // Last trade ID
  "n": 18151               // Total trades
}
```

## Order Book Management

### Building a Local Order Book

1. Open WebSocket to `<symbol>@depth`
2. Buffer events, note the `U` of first event
3. Get depth snapshot from REST API
4. Verify snapshot's `lastUpdateId` >= first event's `U`
5. Discard buffered events where `u` <= `lastUpdateId`
6. Apply events to local order book

### Algorithm

```typescript
interface OrderBook {
  lastUpdateId: number;
  bids: Map<string, string>;  // price -> quantity
  asks: Map<string, string>;
}

class LocalOrderBook {
  private book: OrderBook | null = null;
  private buffer: DepthUpdateEvent[] = [];

  constructor(private symbol: string) {}

  async initialize(): Promise<void> {
    // 1. Connect to WebSocket
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${this.symbol.toLowerCase()}@depth`);

    // 2. Buffer events
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      if (!this.book) {
        this.buffer.push(event);
      } else {
        this.applyUpdate(event);
      }
    });

    // 3. Get snapshot
    const snapshot = await this.getSnapshot();

    // 4. Verify and apply
    if (this.buffer.length > 0) {
      const firstEvent = this.buffer[0];

      // If snapshot is older than first buffered event, retry
      if (snapshot.lastUpdateId < firstEvent.U) {
        await this.initialize();
        return;
      }

      // Filter valid events
      this.buffer = this.buffer.filter(e => e.u > snapshot.lastUpdateId);
    }

    // 5. Set initial book
    this.book = {
      lastUpdateId: snapshot.lastUpdateId,
      bids: new Map(snapshot.bids),
      asks: new Map(snapshot.asks)
    };

    // 6. Apply buffered events
    for (const event of this.buffer) {
      this.applyUpdate(event);
    }
    this.buffer = [];
  }

  private applyUpdate(event: DepthUpdateEvent): void {
    if (!this.book) return;

    // Validate event sequence
    if (event.U <= this.book.lastUpdateId && event.u > this.book.lastUpdateId) {
      // Valid: event overlaps with current state
    } else if (event.U === this.book.lastUpdateId + 1) {
      // Valid: direct sequence
    } else {
      // Invalid: missed events, reinitialize
      console.error('Missed events, reinitializing...');
      this.book = null;
      this.initialize();
      return;
    }

    // Apply updates
    for (const [price, qty] of event.b) {
      if (qty === '0.00000000') {
        this.book.bids.delete(price);
      } else {
        this.book.bids.set(price, qty);
      }
    }

    for (const [price, qty] of event.a) {
      if (qty === '0.00000000') {
        this.book.asks.delete(price);
      } else {
        this.book.asks.set(price, qty);
      }
    }

    this.book.lastUpdateId = event.u;
  }

  private async getSnapshot(): Promise<OrderBookSnapshot> {
    const response = await fetch(
      `https://api.binance.com/api/v3/depth?symbol=${this.symbol}&limit=5000`
    );
    return response.json();
  }
}
```

## Implementation Examples

### Multi-Stream Manager

```typescript
interface StreamConfig {
  symbol: string;
  streams: string[];
  onMessage: (data: any) => void;
  onError?: (error: Error) => void;
  reconnectDelay?: number;
}

class BinanceStreamManager {
  private ws: WebSocket | null = null;
  private config: StreamConfig;
  private reconnectAttempts: number = 0;
  private maxReconnectDelay: number = 60000;

  constructor(config: StreamConfig) {
    this.config = config;
  }

  connect(): void {
    const streamNames = this.config.streams.map(s =>
      `${this.config.symbol.toLowerCase()}@${s}`
    );
    const url = `wss://stream.binance.com:9443/stream?streams=${streamNames.join('/')}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log(`Connected to ${streamNames.join(', ')}`);
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      // Combined stream format
      if (message.stream && message.data) {
        this.config.onMessage(message.data);
      } else {
        this.config.onMessage(message);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.config.onError?.(error);
    });

    this.ws.on('close', () => {
      console.log('WebSocket closed, reconnecting...');
      this.reconnect();
    });

    // Ping/pong handler
    this.ws.on('ping', (data) => {
      this.ws?.pong(data);
    });
  }

  subscribe(streams: string[]): void {
    this.send({
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now()
    });
  }

  unsubscribe(streams: string[]): void {
    this.send({
      method: 'UNSUBSCRIBE',
      params: streams,
      id: Date.now()
    });
  }

  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private reconnect(): void {
    const delay = Math.min(
      (this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
```

### Kline Collector

```typescript
interface KlineData {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
  isClosed: boolean;
}

class KlineCollector {
  private manager: BinanceStreamManager;
  private klines: Map<string, KlineData> = new Map();

  constructor(symbols: string[], interval: string = '1m') {
    this.manager = new BinanceStreamManager({
      symbol: symbols[0],
      streams: [`kline_${interval}`],
      onMessage: (data) => this.handleKline(data)
    });
  }

  private handleKline(data: any): void {
    if (data.e !== 'kline') return;

    const k = data.k;
    const key = `${k.s}_${k.i}_${k.t}`;

    const kline: KlineData = {
      symbol: k.s,
      interval: k.i,
      openTime: k.t,
      closeTime: k.T,
      open: k.o,
      high: k.h,
      low: k.l,
      close: k.c,
      volume: k.v,
      trades: k.n,
      isClosed: k.x
    };

    this.klines.set(key, kline);

    if (kline.isClosed) {
      this.storeKline(kline);
    }
  }

  private async storeKline(kline: KlineData): Promise<void> {
    // Store to database
    console.log('Storing closed kline:', kline);
  }

  start(): void {
    this.manager.connect();
  }
}
```

### Error Messages

| Error Message | Description |
|--------------|-------------|
| `{"code": 0, "msg": "Unknown property"}` | Invalid SET_PROPERTY parameter |
| `{"code": 1, "msg": "Invalid value type: expected Boolean"}` | Expected true/false |
| `{"code": 2, "msg": "Invalid request..."}` | Various request format errors |
| `{"code": 3, "msg": "Invalid JSON..."}` | JSON syntax error |
