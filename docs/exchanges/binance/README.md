# Binance API Documentation

> Official repositories:
> - https://github.com/binance/binance-spot-api-docs
> - https://github.com/binance/binance-connector-js
> - https://github.com/binance/binance-signature-examples
> - https://github.com/binance/binance-websocket-examples
> - https://github.com/binance/websocket-demo

## Table of Contents

1. [Overview](#overview)
2. [Connection](#connection)
3. [Authentication](#authentication)
4. [Market Data Endpoints](#market-data-endpoints)
5. [Trading Operations](#trading-operations)
6. [WebSocket Streams](#websocket-streams)
7. [Local Order Book Management](#local-order-book-management)
8. [Rate Limit Best Practices](#rate-limit-best-practices)
9. [Error Codes](#error-codes)
10. [Error Recovery Patterns](#error-recovery-patterns)
11. [Response Storage](#response-storage)

---

## Overview

Binance API provides programmatic access to Binance trading platform. The API supports:

- **REST API**: For order management, account data, and market data
- **WebSocket API**: For real-time data streams
- **FIX API**: For institutional traders

### Base URLs

| Environment | URL |
|------------|-----|
| Spot (Main) | `https://api.binance.com` |
| Spot (Alternative) | `https://api1.binance.com`, `https://api2.binance.com`, `https://api3.binance.com` |
| Futures | `https://fapi.binance.com` |
| Delivery | `https://dapi.binance.com` |
| Testnet Spot | `https://testnet.binance.vision/api` |
| Testnet Futures | `https://testnet.binancefuture.com` |

### Rate Limits

| Type | Limit |
|------|-------|
| IP Limits | 6,000 weight per minute |
| Order Limits | 50 orders/10s or 160,000/24h |
| Raw Requests | 5,000 per 5 minutes |

---

## Connection

### HTTP Request Format

```typescript
// REST API Request Structure
interface BinanceRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  params?: Record<string, any>;
  signature?: string;
  timestamp?: number;
}
```

### Basic Connection Example

```typescript
import axios from 'axios';

const BASE_URL = 'https://api.binance.com';

async function testConnection(): Promise<boolean> {
  try {
    const response = await axios.get(`${BASE_URL}/api/v3/ping`);
    return response.status === 200;
  } catch (error) {
    console.error('Connection failed:', error);
    return false;
  }
}
```

### Server Time Sync

```typescript
async function getServerTime(): Promise<number> {
  const response = await axios.get(`${BASE_URL}/api/v3/time`);
  return response.data.serverTime;
}

// Important: Keep local time synced with server time
// Timestamp must be within 5 seconds of server time
```

---

## Authentication

### API Key Types

1. **HMAC Authentication**: System-generated keys
2. **RSA Authentication**: Self-generated keys (recommended for institutional)

### HMAC Signature Generation

```typescript
import crypto from 'crypto';

function generateSignature(
  queryString: string,
  secretKey: string
): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');
}

// Example usage
const apiKey = 'your-api-key';
const secretKey = 'your-secret-key';
const timestamp = Date.now();

// For GET requests
const queryString = `symbol=BTCUSDT&timestamp=${timestamp}`;
const signature = generateSignature(queryString, secretKey);

// Full URL
const url = `${BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;
```

### Request Headers

```typescript
const headers = {
  'X-MBX-APIKEY': apiKey,
  'Content-Type': 'application/json',
};
```

### RSA Signature (Advanced)

```typescript
import crypto from 'crypto';

function generateRSASignature(
  queryString: string,
  privateKey: string
): string {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(queryString);
  return sign.sign(privateKey, 'base64');
}
```

---

## Market Data Endpoints

### Ping Server

```
GET /api/v3/ping
```

**Response:**
```json
{}
```

### Server Time

```
GET /api/v3/time
```

**Response:**
```json
{
  "serverTime": 1499827319559
}
```

### Exchange Information

```
GET /api/v3/exchangeInfo
```

**Response:**
```json
{
  "timezone": "UTC",
  "serverTime": 1565246363776,
  "rateLimits": [
    {
      "rateLimitType": "REQUEST_WEIGHT",
      "interval": "MINUTE",
      "intervalNum": 1,
      "limit": 1200
    }
  ],
  "symbols": [
    {
      "symbol": "BNBBTC",
      "status": "TRADING",
      "baseAsset": "BNB",
      "baseAssetPrecision": 8,
      "quoteAsset": "BTC",
      "quotePrecision": 8,
      "orderTypes": ["LIMIT", "LIMIT_MAKER", "MARKET", "STOP_LOSS", "STOP_LOSS_LIMIT"],
      "permissions": ["SPOT", "MARGIN"]
    }
  ]
}
```

### Order Book

```
GET /api/v3/depth
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| limit | INT | NO | Default 100; max 5000 |

**Response:**
```json
{
  "lastUpdateId": 1027024,
  "bids": [
    ["4.00000000", "431.00000000"]
  ],
  "asks": [
    ["4.00000200", "12.00000000"]
  ]
}
```

### Recent Trades

```
GET /api/v3/trades
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| limit | INT | NO | Default 500; max 1000 |

**Response:**
```json
[
  {
    "id": 28457,
    "price": "4.00000100",
    "qty": "12.00000000",
    "quoteQty": "48.00001200",
    "time": 1499865549590,
    "isBuyerMaker": true,
    "isBestMatch": true
  }
]
```

### Kline/Candlestick Data

```
GET /api/v3/klines
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| interval | ENUM | YES | kline interval |
| startTime | LONG | NO | Start time |
| endTime | LONG | NO | End time |
| limit | INT | NO | Default 500; max 1000 |

**Intervals:**
- `1s`, `1m`, `3m`, `5m`, `15m`, `30m`
- `1h`, `2h`, `4h`, `6h`, `8h`, `12h`
- `1d`, `3d`, `1w`, `1M`

**Response:**
```json
[
  [
    1499040000000,      // Open time
    "0.01634000",       // Open
    "0.80000000",       // High
    "0.01575800",       // Low
    "0.01577100",       // Close
    "148976.11427815",  // Volume
    1499644799999,      // Close time
    "2434.19055334",    // Quote asset volume
    308,                // Number of trades
    "1756.87402397",    // Taker buy base asset volume
    "28.46694368",      // Taker buy quote asset volume
    "0"                 // Ignore
  ]
]
```

### Current Average Price

```
GET /api/v3/avgPrice
```

**Response:**
```json
{
  "mins": 5,
  "price": "9.35751834"
}
```

### 24hr Ticker

```
GET /api/v3/ticker/24hr
```

**Response:**
```json
{
  "symbol": "BNBBTC",
  "priceChange": "-94.99999800",
  "priceChangePercent": "-95.960",
  "weightedAvgPrice": "0.29628482",
  "prevClosePrice": "0.10002000",
  "lastPrice": "0.01000000",
  "lastQty": "200.00000000",
  "bidPrice": "0.01000000",
  "bidQty": "100.00000000",
  "askPrice": "0.01000001",
  "askQty": "100.00000000",
  "openPrice": "0.10002000",
  "highPrice": "0.10002000",
  "lowPrice": "0.01000000",
  "volume": "100000.00000000",
  "quoteVolume": "10000.00000000",
  "openTime": 1499783499040,
  "closeTime": 1499869899040,
  "firstId": 1,
  "lastId": 100,
  "count": 100
}
```

---

## Trading Operations

### New Order (POST)

```
POST /api/v3/order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| side | ENUM | YES | BUY or SELL |
| type | ENUM | YES | Order type |
| timeInForce | ENUM | NO | Order time in force |
| quantity | DECIMAL | NO | Order quantity |
| quoteOrderQty | DECIMAL | NO | Quote quantity |
| price | DECIMAL | NO | Order price |
| newClientOrderId | STRING | NO | Client order ID |
| stopPrice | DECIMAL | NO | Stop price |
| icebergQty | DECIMAL | NO | Iceberg quantity |
| newOrderRespType | ENUM | NO | Response type |
| recvWindow | LONG | NO | Receive window |

**Order Types:**
- `LIMIT` - Limit order
- `MARKET` - Market order
- `STOP_LOSS` - Stop loss
- `STOP_LOSS_LIMIT` - Stop loss limit
- `TAKE_PROFIT` - Take profit
- `TAKE_PROFIT_LIMIT` - Take profit limit
- `LIMIT_MAKER` - Limit maker only

**Example - Limit Order:**

```typescript
const order = {
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '50000',
  timestamp: Date.now(),
};

const queryString = Object.entries(order)
  .map(([k, v]) => `${k}=${v}`)
  .join('&');

const signature = generateSignature(queryString, secretKey);

const response = await axios.post(
  `${BASE_URL}/api/v3/order?${queryString}&signature=${signature}`,
  {},
  { headers: { 'X-MBX-APIKEY': apiKey } }
);
```

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "orderId": 28,
  "orderListId": -1,
  "clientOrderId": "6gCrw2kRUAF9CvJDGP16IP",
  "transactTime": 1507725176595,
  "price": "50000.00000000",
  "origQty": "0.00100000",
  "executedQty": "0.00000000",
  "cummulativeQuoteQty": "0.00000000",
  "status": "NEW",
  "timeInForce": "GTC",
  "type": "LIMIT",
  "side": "BUY"
}
```

### Query Order

```
GET /api/v3/order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| orderId | LONG | NO | Order ID |
| origClientOrderId | STRING | NO | Client order ID |

**Response:**
```json
{
  "symbol": "LTCBTC",
  "orderId": 1,
  "orderListId": -1,
  "clientOrderId": "myOrder1",
  "price": "0.1",
  "origQty": "1.0",
  "executedQty": "0.0",
  "cummulativeQuoteQty": "0.0",
  "status": "NEW",
  "timeInForce": "GTC",
  "type": "LIMIT",
  "side": "BUY",
  "stopPrice": "0.0",
  "icebergQty": "0.0",
  "time": 1499827319559,
  "updateTime": 1499827319559,
  "isWorking": true,
  "workingTime": 1499827319559,
  "origQuoteOrderQty": "0.000000",
  "selfTradePreventionMode": "NONE"
}
```

### Cancel Order

```
DELETE /api/v3/order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| orderId | LONG | NO | Order ID |
| origClientOrderId | STRING | NO | Client order ID |

### Cancel All Orders

```
DELETE /api/v3/openOrders
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |

### Current Open Orders

```
GET /api/v3/openOrders
```

### All Orders

```
GET /api/v3/allOrders
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| orderId | LONG | NO | Order ID to start from |
| startTime | LONG | NO | Start time |
| endTime | LONG | NO | End time |
| limit | INT | NO | Default 500; max 1000 |

---

## Account Information

### Account Info

```
GET /api/v3/account
```

**Response:**
```json
{
  "makerCommission": 15,
  "takerCommission": 15,
  "buyerCommission": 0,
  "sellerCommission": 0,
  "canTrade": true,
  "canWithdraw": true,
  "canDeposit": true,
  " updateTime": 123456789,
  "balances": [
    {
      "asset": "BTC",
      "free": "4723846.89208129",
      "locked": "0.00000000"
    }
  ]
}
```

### Account Trade List

```
GET /api/v3/myTrades
```

**Response:**
```json
[
  {
    "symbol": "BNBBTC",
    "id": 28457,
    "orderId": 100234,
    "price": "4.00000100",
    "qty": "12.00000000",
    "quoteQty": "48.00001200",
    "commission": "10.10000000",
    "commissionAsset": "BNB",
    "time": 1499865549590,
    "isBuyer": true,
    "isMaker": false,
    "isBestMatch": true
  }
]
```

---

## WebSocket Streams

### Base WebSocket URL

```
wss://stream.binance.com:9443/ws
wss://stream.binance.com:9443/stream
```

### Connection Example

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

ws.on('open', () => {
  console.log('Connected to Binance WebSocket');
});

ws.on('message', (data) => {
  const trade = JSON.parse(data.toString());
  console.log('Trade:', trade);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});
```

### Subscribe to Streams

```typescript
// Subscribe to multiple streams
const subscribe = {
  method: 'SUBSCRIBE',
  params: [
    'btcusdt@aggTrade',
    'btcusdt@depth'
  ],
  id: 1
};

ws.send(JSON.stringify(subscribe));
```

### Available Streams

#### Aggregate Trade Stream

```
<symbol>@aggTrade
```

**Payload:**
```json
{
  "e": "aggTrade",
  "E": 123456789,
  "s": "BTCUSDT",
  "a": 5933014,
  "p": "0.001",
  "q": "100",
  "f": 100,
  "l": 105,
  "T": 123456785,
  "m": true,
  "M": true
}
```

#### Trade Stream

```
<symbol>@trade
```

**Payload:**
```json
{
  "e": "trade",
  "E": 123456789,
  "s": "BTCUSDT",
  "t": 12345,
  "p": "0.001",
  "q": "100",
  "b": 88,
  "a": 50,
  "T": 123456785,
  "m": true,
  "M": true
}
```

#### Kline/Candlestick Stream

```
<symbol>@kline_<interval>
```

**Payload:**
```json
{
  "e": "kline",
  "E": 123456789,
  "s": "BTCUSDT",
  "k": {
    "t": 123400000,
    "T": 123460000,
    "s": "BTCUSDT",
    "i": "1m",
    "o": "0.0010",
    "c": "0.0020",
    "h": "0.0025",
    "l": "0.0015",
    "v": "1000",
    "n": 100,
    "x": false,
    "q": "1.0000",
    "V": "500",
    "Q": "0.500",
    "B": "123456"
  }
}
```

#### Depth Stream

```
<symbol>@depth
<symbol>@depth@100ms
```

**Payload:**
```json
{
  "e": "depthUpdate",
  "E": 123456789,
  "s": "BTCUSDT",
  "U": 157,
  "u": 160,
  "b": [
    ["0.0024", "10"]
  ],
  "a": [
    ["0.0026", "100"]
  ]
}
```

#### Ticker Stream

```
<symbol>@ticker
```

**Payload:**
```json
{
  "e": "24hrTicker",
  "E": 123456789,
  "s": "BTCUSDT",
  "p": "0.0015",
  "P": "250.00",
  "w": "0.0018",
  "x": "0.0009",
  "c": "0.0025",
  "Q": "10",
  "b": "0.0024",
  "B": "10",
  "a": "0.0026",
  "A": "100",
  "o": "0.0010",
  "h": "0.0025",
  "l": "0.0010",
  "v": "10000",
  "q": "18",
  "O": 0,
  "C": 86400000,
  "F": 0,
  "L": 18150,
  "n": 18151
}
```

---

## Local Order Book Management

Maintaining a local order book is essential for high-frequency trading and scalping strategies. Binance provides WebSocket depth streams for real-time updates, but proper synchronization is critical for accuracy.

### Why Local Order Book?

| Approach | Latency | Accuracy | Use Case |
|----------|---------|----------|----------|
| REST API polling | 100-500ms | Snapshot only | Low-frequency trading |
| WebSocket depth stream | 5-50ms | Real-time updates | HFT, scalping, arbitrage |
| Local order book | <5ms | Full depth | Market making, HFT |

### Algorithm for Maintaining Local Order Book

According to Binance documentation, the correct approach involves:

1. **Open a WebSocket connection** to `<symbol>@depth` stream
2. **Buffer incoming events** in memory
3. **Get a depth snapshot** via REST API
4. **Discard events** where `u <= lastUpdateId`
5. **Apply updates** from buffered events where `U <= lastUpdateId+1 AND u >= lastUpdateId+1`

### Complete Implementation

```typescript
import WebSocket from 'ws';

interface OrderBookEntry {
  price: string;
  quantity: string;
}

interface DepthUpdate {
  e: 'depthUpdate';           // Event type
  E: number;                  // Event time
  s: string;                  // Symbol
  U: number;                  // First update ID in event
  u: number;                  // Final update ID in event
  b: OrderBookEntry[];        // Bids to be updated
  a: OrderBookEntry[];        // Asks to be updated
}

interface OrderBookSnapshot {
  lastUpdateId: number;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

class LocalOrderBook {
  private ws: WebSocket | null = null;
  private bids: Map<string, string> = new Map(); // price -> quantity
  private asks: Map<string, string> = new Map();
  private eventBuffer: DepthUpdate[] = [];
  private lastUpdateId: number = 0;
  private isSynced: boolean = false;
  private symbol: string;
  private baseUrl: string;
  private wsUrl: string;

  constructor(symbol: string, testnet: boolean = false) {
    this.symbol = symbol.toLowerCase();
    this.baseUrl = testnet 
      ? 'https://testnet.binance.vision/api' 
      : 'https://api.binance.com';
    this.wsUrl = testnet
      ? 'wss://testnet.binance.vision/ws'
      : 'wss://stream.binance.com:9443/ws';
  }

  async start(): Promise<void> {
    // 1. Open WebSocket connection
    this.ws = new WebSocket(`${this.wsUrl}/${this.symbol}@depth`);

    this.ws.on('message', (data: string) => {
      const event = JSON.parse(data) as DepthUpdate;
      
      if (!this.isSynced) {
        // 2. Buffer events until we get a snapshot
        this.eventBuffer.push(event);
      } else {
        // 5. Apply updates directly if already synced
        this.applyUpdate(event);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.reconnect();
    });

    this.ws.on('close', () => {
      console.log('WebSocket closed, reconnecting...');
      this.reconnect();
    });

    // Wait for connection
    await new Promise<void>((resolve) => {
      this.ws!.once('open', () => resolve());
    });

    // 3. Get depth snapshot
    await this.syncSnapshot();
  }

  private async syncSnapshot(): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/v3/depth?symbol=${this.symbol.toUpperCase()}&limit=1000`
    );
    const snapshot: OrderBookSnapshot = await response.json();
    
    this.lastUpdateId = snapshot.lastUpdateId;
    
    // Initialize order book from snapshot
    this.bids.clear();
    this.asks.clear();
    
    for (const [price, qty] of snapshot.bids) {
      this.bids.set(price, qty);
    }
    for (const [price, qty] of snapshot.asks) {
      this.asks.set(price, qty);
    }

    // 4. Process buffered events
    for (const event of this.eventBuffer) {
      // Discard if event is older than snapshot
      if (event.u <= this.lastUpdateId) {
        continue;
      }
      
      // Process if event follows snapshot
      if (event.U <= this.lastUpdateId + 1 && event.u >= this.lastUpdateId + 1) {
        this.applyUpdate(event);
      }
    }

    // Clear buffer after processing
    this.eventBuffer = [];
    this.isSynced = true;
    
    console.log(`Order book synced at lastUpdateId: ${this.lastUpdateId}`);
  }

  private applyUpdate(event: DepthUpdate): void {
    // Update bids
    for (const [price, qty] of event.b) {
      if (parseFloat(qty) === 0) {
        this.bids.delete(price);
      } else {
        this.bids.set(price, qty);
      }
    }

    // Update asks
    for (const [price, qty] of event.a) {
      if (parseFloat(qty) === 0) {
        this.asks.delete(price);
      } else {
        this.asks.set(price, qty);
      }
    }

    this.lastUpdateId = event.u;
  }

  private reconnect(): void {
    this.isSynced = false;
    this.eventBuffer = [];
    setTimeout(() => this.start(), 1000);
  }

  // Get best bid (highest bid price)
  getBestBid(): { price: number; quantity: number } | null {
    const prices = Array.from(this.bids.keys()).map(Number).sort((a, b) => b - a);
    if (prices.length === 0) return null;
    const bestPrice = prices[0];
    return {
      price: bestPrice,
      quantity: parseFloat(this.bids.get(bestPrice.toString()) || '0')
    };
  }

  // Get best ask (lowest ask price)
  getBestAsk(): { price: number; quantity: number } | null {
    const prices = Array.from(this.asks.keys()).map(Number).sort((a, b) => a - b);
    if (prices.length === 0) return null;
    const bestPrice = prices[0];
    return {
      price: bestPrice,
      quantity: parseFloat(this.asks.get(bestPrice.toString()) || '0')
    };
  }

  // Get spread
  getSpread(): number | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    if (!bestBid || !bestAsk) return null;
    return bestAsk.price - bestBid.price;
  }

  // Get order book depth
  getDepth(levels: number = 10): { bids: [number, number][]; asks: [number, number][] } {
    const bidPrices = Array.from(this.bids.entries())
      .map(([price, qty]) => [parseFloat(price), parseFloat(qty)] as [number, number])
      .sort((a, b) => b[0] - a[0])
      .slice(0, levels);

    const askPrices = Array.from(this.asks.entries())
      .map(([price, qty]) => [parseFloat(price), parseFloat(qty)] as [number, number])
      .sort((a, b) => a[0] - b[0])
      .slice(0, levels);

    return { bids: bidPrices, asks: askPrices };
  }

  stop(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage example
async function main() {
  const orderBook = new LocalOrderBook('BTCUSDT');
  await orderBook.start();

  // Print best prices every second
  setInterval(() => {
    const bestBid = orderBook.getBestBid();
    const bestAsk = orderBook.getBestAsk();
    const spread = orderBook.getSpread();
    
    console.log(`Best Bid: ${bestBid?.price} | Best Ask: ${bestAsk?.price} | Spread: ${spread}`);
  }, 1000);
}
```

### Key Points for Order Book Management

1. **Never rely on a single update** - Always buffer and validate
2. **Check U/u sequence** - `U` should be `lastUpdateId + 1` for valid sequence
3. **Handle zero quantity** - Remove price level when quantity is 0
4. **Implement reconnection** - WebSocket can disconnect unexpectedly
5. **Use heartbeat** - Send ping/pong to keep connection alive

### Depth Stream Types

| Stream | Update Frequency | Description |
|--------|------------------|-------------|
| `<symbol>@depth` | 100ms | Full depth updates |
| `<symbol>@depth@100ms` | 100ms | Explicit 100ms |
| `<symbol>@depth@1000ms` | 1000ms | 1 second updates |
| `<symbol>@depth20` | 100ms | Top 20 levels only |
| `<symbol>@depth5` | 100ms | Top 5 levels only |

### Reference

- Official tutorial: https://www.binance.com/en/academy/articles/local-order-book-tutorial-part-3-keeping-the-websocket-connection
- WebSocket examples: https://github.com/binance/binance-websocket-examples

---

## Rate Limit Best Practices

Binance has strict rate limits that must be respected to avoid IP bans. Understanding and properly handling rate limits is critical for production systems.

### Rate Limit Types

| Type | Limit | Weight |
|------|-------|--------|
| Request Weight | 1,200 per minute | Varies by endpoint |
| Orders | 50 per 10 seconds | N/A |
| Orders | 160,000 per 24 hours | N/A |
| Raw Requests | 5,000 per 5 minutes | N/A |

### Endpoint Weights

Different endpoints have different weight costs:

| Endpoint | Weight | Notes |
|----------|--------|-------|
| `/api/v3/ping` | 1 | Minimal |
| `/api/v3/time` | 1 | Minimal |
| `/api/v3/exchangeInfo` | 10 | Light |
| `/api/v3/depth` | 1-100 | Depends on limit |
| `/api/v3/klines` | 1-5 | Depends on limit |
| `/api/v3/trades` | 1-5 | Depends on limit |
| `/api/v3/account` | 10 | Authenticated |
| `/api/v3/order` | 1 | Per order |
| `/api/v3/allOrders` | 10 | History query |
| `/api/v3/myTrades` | 10 | History query |

### Response Headers to Monitor

```typescript
// Important rate limit headers in every response
const headers = {
  'x-mbx-used-weight-1m': '580',      // Used weight in last minute
  'x-mbx-used-weight-1h': '12345',    // Used weight in last hour
  'x-mbx-used-weight-1d': '98765',    // Used weight in last 24h
  'x-mbx-order-count-10s': '12',      // Order count in last 10 seconds
  'x-mbx-order-count-1d': '1234',     // Order count in last 24 hours
};
```

### Rate Limit Tracker Implementation

```typescript
class BinanceRateLimiter {
  private usedWeight: number = 0;
  private orderCount10s: number = 0;
  private orderCount1d: number = 0;
  private maxWeight: number = 1200;
  private maxOrders10s: number = 50;
  private maxOrders1d: number = 160000;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 50; // 50ms between requests

  // Update from response headers
  updateFromHeaders(headers: Headers): void {
    const weight = headers.get('x-mbx-used-weight-1m');
    const orders10s = headers.get('x-mbx-order-count-10s');
    const orders1d = headers.get('x-mbx-order-count-1d');

    if (weight) this.usedWeight = parseInt(weight);
    if (orders10s) this.orderCount10s = parseInt(orders10s);
    if (orders1d) this.orderCount1d = parseInt(orders1d);
  }

  // Check if we can make a request
  canMakeRequest(weight: number = 1, isOrder: boolean = false): boolean {
    // Check weight limit (leave 10% buffer)
    if (this.usedWeight + weight > this.maxWeight * 0.9) {
      return false;
    }

    // Check order limits
    if (isOrder) {
      if (this.orderCount10s >= this.maxOrders10s * 0.9) {
        return false;
      }
      if (this.orderCount1d >= this.maxOrders1d * 0.9) {
        return false;
      }
    }

    return true;
  }

  // Calculate wait time before next request
  getWaitTime(): number {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    
    if (elapsed < this.minRequestInterval) {
      return this.minRequestInterval - elapsed;
    }
    
    return 0;
  }

  // Get current usage stats
  getStats(): { weightPercent: number; orders10sPercent: number; orders1dPercent: number } {
    return {
      weightPercent: (this.usedWeight / this.maxWeight) * 100,
      orders10sPercent: (this.orderCount10s / this.maxOrders10s) * 100,
      orders1dPercent: (this.orderCount1d / this.maxOrders1d) * 100,
    };
  }

  // Log request after completion
  logRequest(): void {
    this.lastRequestTime = Date.now();
  }
}

// Usage with automatic rate limiting
async function rateLimitedRequest(
  url: string,
  options: RequestInit,
  limiter: BinanceRateLimiter,
  weight: number = 1,
  isOrder: boolean = false
): Promise<Response> {
  // Wait for rate limit
  while (!limiter.canMakeRequest(weight, isOrder)) {
    console.log('Rate limit reached, waiting...');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Wait for minimum interval
  const waitTime = limiter.getWaitTime();
  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  const response = await fetch(url, options);
  
  // Update rate limiter from headers
  limiter.updateFromHeaders(response.headers);
  limiter.logRequest();

  // Log warning if approaching limit
  const stats = limiter.getStats();
  if (stats.weightPercent > 80) {
    console.warn(`Rate limit usage: ${stats.weightPercent.toFixed(1)}%`);
  }

  return response;
}
```

### Exponential Backoff Implementation

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelay: 200,      // Start with 200ms
  maxDelay: 32000,     // Max 32 seconds
  retryableErrors: [
    -1003,  // TOO_MANY_REQUESTS
    -1015,  // TOO_MANY_ORDERS
    -1007,  // TIMEOUT
    -1001,  // DISCONNECTED
  ],
};

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Check if response indicates an error
      if (!response.ok) {
        const data = await response.clone().json();
        
        // Check if error is retryable
        if (config.retryableErrors.includes(data.code)) {
          throw new Error(`Retryable error: ${data.code}`);
        }
        
        // Non-retryable error
        throw new Error(`API error: ${data.code} - ${data.msg}`);
      }
      
      return response;
      
    } catch (error) {
      lastError = error as Error;
      
      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt) + Math.random() * 100,
        config.maxDelay
      );
      
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
```

### Handling 429 and 418 Status Codes

```typescript
// 429 = Too Many Requests (temporary)
// 418 = IP Banned (serious)

async function handleRateLimitResponse(response: Response): Promise<void> {
  const retryAfter = response.headers.get('Retry-After');
  
  if (response.status === 429) {
    // Temporary rate limit - wait and retry
    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
    console.warn(`Rate limited (429). Waiting ${waitTime}ms before retry.`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  if (response.status === 418) {
    // IP Banned - serious issue
    console.error('IP has been banned (418). Stop all requests immediately.');
    console.error('Check your rate limit implementation and wait for ban to expire.');
    // Could take minutes to days to expire
    throw new Error('IP Banned by Binance');
  }
}
```

### Best Practices Summary

1. **Monitor headers** - Always check `x-mbx-used-weight-1m`
2. **Leave buffer** - Don't use more than 80-90% of limit
3. **Implement backoff** - Use exponential backoff with jitter
4. **Handle 429/418** - Respect `Retry-After` header
5. **Distribute load** - Use multiple API keys if needed
6. **Prioritize requests** - Market data can be cached, orders are critical
7. **Use WebSocket** - Reduce REST API calls with WebSocket streams

---

## Error Codes

### General Errors

| Code | Name | Description |
|------|------|-------------|
| -1000 | UNKNOWN | An unknown error occurred |
| -1001 | DISCONNECTED | Internal error; unable to respond |
| -1002 | UNAUTHORIZED | Unauthorized request |
| -1003 | TOO_MANY_REQUESTS | Rate limit exceeded |
| -1006 | UNEXPECTED_RESP | Unexpected response from exchange |
| -1007 | TIMEOUT | Request timeout |
| -1013 | INVALID_MESSAGE | Invalid message |
| -1014 | UNKNOWN_ORDER_COMPOSITION | Unknown order composition |
| -1015 | TOO_MANY_ORDERS | Too many orders |
| -1016 | SERVICE_SHUTTING_DOWN | Service shutting down |
| -1020 | UNSUPPORTED_OPERATION | Unsupported operation |
| -1021 | TIMESTAMP_NOT_IN_RECV_WINDOW | Timestamp outside recvWindow |
| -1022 | INVALID_SIGNATURE | Invalid signature |

### Order Errors

| Code | Name | Description |
|------|------|-------------|
| -2010 | NEW_ORDER_REJECTED | New order rejected |
| -2011 | CANCEL_REJECTED | Cancel rejected |
| -2013 | NO_SUCH_ORDER | Order does not exist |
| -2014 | BAD_API_KEY_FMT | Bad API key format |
| -2015 | REJECTED_MBX_KEY | Rejected API key |
| -2016 | NO_TRADING_WINDOW | No trading window |

### Request Errors

| Code | Name | Description |
|------|------|-------------|
| -1100 | ILLEGAL_CHARS | Illegal characters in request |
| -1101 | TOO_MANY_PARAMETERS | Too many parameters |
| -1102 | UNEXPECTED_PARAMS | Unexpected parameters |
| -1103 | UNKNOWN_PARAM | Unknown parameter |
| -1104 | UNREAD_PARAMETERS | Unread parameters |
| -1105 | PARAM_EMPTY | Parameter empty |
| -1106 | PARAM_NOT_REQUIRED | Parameter not required |

### Filter Errors

| Code | Name | Description |
|------|------|-------------|
| -2013 | NO_SUCH_ORDER | Order does not exist |
| -2026 | ORDER_ARCHIVED | Order archived |

---

## Error Recovery Patterns

Proper error handling and recovery is essential for reliable trading systems. Different error types require different recovery strategies.

### Error Categories

| Category | Examples | Recovery Strategy |
|----------|----------|-------------------|
| **Network** | Timeout, disconnect | Retry with backoff |
| **Rate Limit** | 429, 418 | Wait and retry |
| **Authentication** | Invalid key, bad signature | Stop, alert user |
| **Order** | Insufficient balance, invalid price | Log, notify, no retry |
| **Market** | Symbol not found, maintenance | Wait or skip |

### Complete Error Handler

```typescript
interface BinanceError {
  code: number;
  msg: string;
}

class BinanceErrorHandler {
  // Map error codes to recovery actions
  private recoveryStrategies: Map<number, () => Promise<void>> = new Map();
  
  constructor() {
    this.setupRecoveryStrategies();
  }

  private setupRecoveryStrategies(): void {
    // Rate limit errors - wait
    this.recoveryStrategies.set(-1003, async () => {
      await this.wait(60000); // Wait 1 minute
    });
    
    this.recoveryStrategies.set(-1015, async () => {
      await this.wait(10000); // Wait 10 seconds
    });
    
    // Timestamp errors - sync time
    this.recoveryStrategies.set(-1021, async () => {
      await this.syncServerTime();
    });
    
    // Timeout - immediate retry
    this.recoveryStrategies.set(-1007, async () => {
      await this.wait(100);
    });
    
    // Disconnected - wait and reconnect
    this.recoveryStrategies.set(-1001, async () => {
      await this.wait(5000);
    });
  }

  async handle(error: BinanceError, context?: any): Promise<{ shouldRetry: boolean; action: string }> {
    const strategy = this.recoveryStrategies.get(error.code);
    
    // Log the error
    await this.logError(error, context);
    
    // Critical errors - do not retry
    const criticalErrors = [
      -1002,  // UNAUTHORIZED
      -1014,  // UNSUPPORTED_OPERATION
      -1022,  // INVALID_SIGNATURE
      -2013,  // NO_SUCH_ORDER
      -2014,  // BAD_API_KEY_FMT
      -2015,  // REJECTED_MBX_KEY
    ];
    
    if (criticalErrors.includes(error.code)) {
      return { shouldRetry: false, action: 'STOP - Critical error requires manual intervention' };
    }
    
    // Order errors - specific handling
    if (error.code === -2010) {
      return this.handleOrderRejection(error, context);
    }
    
    // Apply recovery strategy if available
    if (strategy) {
      await strategy();
      return { shouldRetry: true, action: `Applied recovery strategy for error ${error.code}` };
    }
    
    // Unknown error - conservative approach
    return { shouldRetry: false, action: `Unknown error ${error.code}: ${error.msg}` };
  }

  private async handleOrderRejection(error: BinanceError, context: any): Promise<{ shouldRetry: boolean; action: string }> {
    const msg = error.msg.toLowerCase();
    
    if (msg.includes('insufficient balance')) {
      return { 
        shouldRetry: false, 
        action: 'INSUFFICIENT_BALANCE - Check account balance and reduce order size' 
      };
    }
    
    if (msg.includes('price') && msg.includes('filter')) {
      return { 
        shouldRetry: false, 
        action: 'PRICE_FILTER - Adjust price to meet symbol requirements' 
      };
    }
    
    if (msg.includes('quantity') && msg.includes('filter')) {
      return { 
        shouldRetry: false, 
        action: 'LOT_SIZE_FILTER - Adjust quantity to meet symbol requirements' 
      };
    }
    
    if (msg.includes('min notional')) {
      return { 
        shouldRetry: false, 
        action: 'MIN_NOTIONAL - Order value too small, increase size' 
      };
    }
    
    if (msg.includes('would trigger immediately')) {
      return { 
        shouldRetry: false, 
        action: 'STOP_PRICE_INVALID - Stop price would trigger immediately' 
      };
    }
    
    if (msg.includes('margin') && msg.includes('insufficient')) {
      return { 
        shouldRetry: false, 
        action: 'MARGIN_INSUFFICIENT - Not enough margin for position' 
      };
    }
    
    return { shouldRetry: false, action: `ORDER_REJECTED: ${error.msg}` };
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async syncServerTime(): Promise<void> {
    const response = await fetch('https://api.binance.com/api/v3/time');
    const data = await response.json();
    const serverTime = data.serverTime;
    const localTime = Date.now();
    const offset = serverTime - localTime;
    
    console.log(`Time sync: server=${serverTime}, local=${localTime}, offset=${offset}ms`);
    
    // Store offset for future requests
    // Your API client should use: timestamp = Date.now() + offset
  }

  private async logError(error: BinanceError, context: any): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      code: error.code,
      message: error.msg,
      context: context,
    };
    
    console.error('Binance API Error:', JSON.stringify(logEntry));
    
    // In production, send to logging service
    // await this.sendToLoggingService(logEntry);
  }
}
```

### Resilient API Client

```typescript
class ResilientBinanceClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private errorHandler: BinanceErrorHandler;
  private rateLimiter: BinanceRateLimiter;
  private timeOffset: number = 0;
  private maxRetries: number = 3;

  constructor(apiKey: string, apiSecret: string, testnet: boolean = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = testnet ? 'https://testnet.binance.vision/api' : 'https://api.binance.com';
    this.errorHandler = new BinanceErrorHandler();
    this.rateLimiter = new BinanceRateLimiter();
    
    // Sync time on init
    this.syncTime();
  }

  async syncTime(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v3/time`);
    const data = await response.json();
    this.timeOffset = data.serverTime - Date.now();
  }

  private getTimestamp(): number {
    return Date.now() + this.timeOffset;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, any> = {},
    weight: number = 1,
    isOrder: boolean = false
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Check rate limit
        while (!this.rateLimiter.canMakeRequest(weight, isOrder)) {
          await new Promise(r => setTimeout(r, 1000));
        }
        
        // Build request
        const timestamp = this.getTimestamp();
        const allParams = { ...params, timestamp, recvWindow: 5000 };
        
        const queryString = Object.entries(allParams)
          .map(([k, v]) => `${k}=${v}`)
          .join('&');
        
        const signature = this.generateSignature(queryString);
        const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;
        
        // Make request
        const response = await fetch(url, {
          method,
          headers: { 'X-MBX-APIKEY': this.apiKey }
        });
        
        // Update rate limiter
        this.rateLimiter.updateFromHeaders(response.headers);
        
        // Handle HTTP errors
        if (response.status === 429 || response.status === 418) {
          await this.handleRateLimitResponse(response);
          continue;
        }
        
        if (!response.ok) {
          const error: BinanceError = await response.json();
          const result = await this.errorHandler.handle(error, { endpoint, params });
          
          if (result.shouldRetry && attempt < this.maxRetries - 1) {
            continue;
          }
          
          throw new Error(`${error.code}: ${error.msg}`);
        }
        
        return await response.json();
        
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.maxRetries - 1) {
          // Wait before retry
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    
    throw lastError;
  }

  private generateSignature(queryString: string): string {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  private async handleRateLimitResponse(response: Response): Promise<void> {
    const retryAfter = response.headers.get('Retry-After');
    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
    
    console.warn(`Rate limited. Waiting ${waitTime}ms`);
    await new Promise(r => setTimeout(r, waitTime));
  }

  // Convenience methods
  async getAccountInfo(): Promise<any> {
    return this.request('GET', '/api/v3/account', {}, 10);
  }

  async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: string;
    quantity?: string;
    price?: string;
    timeInForce?: string;
  }): Promise<any> {
    return this.request('POST', '/api/v3/order', params, 1, true);
  }

  async cancelOrder(symbol: string, orderId: string): Promise<any> {
    return this.request('DELETE', '/api/v3/order', { symbol, orderId }, 1);
  }
}
```

### Error Monitoring Dashboard

```typescript
interface ErrorMetrics {
  totalErrors: number;
  errorsByCode: Map<number, number>;
  errorsByEndpoint: Map<string, number>;
  lastErrorTime: Date | null;
  consecutiveErrors: number;
}

class ErrorMonitor {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByCode: new Map(),
    errorsByEndpoint: new Map(),
    lastErrorTime: null,
    consecutiveErrors: 0,
  };

  recordError(error: BinanceError, endpoint: string): void {
    this.metrics.totalErrors++;
    this.metrics.lastErrorTime = new Date();
    this.metrics.consecutiveErrors++;
    
    // Count by error code
    const codeCount = this.metrics.errorsByCode.get(error.code) || 0;
    this.metrics.errorsByCode.set(error.code, codeCount + 1);
    
    // Count by endpoint
    const endpointCount = this.metrics.errorsByEndpoint.get(endpoint) || 0;
    this.metrics.errorsByEndpoint.set(endpoint, endpointCount + 1);
    
    // Alert if too many consecutive errors
    if (this.metrics.consecutiveErrors >= 5) {
      this.sendAlert('Multiple consecutive errors detected');
    }
  }

  recordSuccess(): void {
    this.metrics.consecutiveErrors = 0;
  }

  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  private sendAlert(message: string): void {
    console.error(`[ALERT] ${message}`);
    // In production: send to Slack, email, etc.
  }
}
```

### Summary of Error Recovery Patterns

| Error Code | Pattern | Action |
|------------|---------|--------|
| -1001 | Reconnect | Wait 5s, reconnect WebSocket |
| -1002 | Stop | Invalid API key - alert user |
| -1003 | Backoff | Exponential backoff, max 60s |
| -1007 | Retry | Immediate retry (timeout) |
| -1015 | Backoff | Wait 10s, reduce request rate |
| -1021 | Sync time | Get server time, adjust offset |
| -1022 | Stop | Invalid signature - check keys |
| -2010 | Analyze | Check balance, filters, adjust order |
| -2013 | Log | Order doesn't exist - may be filled/cancelled |
| 429 | Wait | Respect Retry-After header |
| 418 | Stop | IP banned - stop all requests |

---

## Response Storage

### Recommended Storage Schema

```typescript
interface ApiLogEntry {
  id: string;
  timestamp: Date;
  exchange: 'binance';
  endpoint: string;
  method: string;
  params: Record<string, any>;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  responseBody: any;
  responseTime: number; // ms
  error?: {
    code: number;
    msg: string;
    data?: any;
  };
}
```

### Error Response Format

When an order is rejected, Binance returns:

```json
{
  "code": -2010,
  "msg": "Account has insufficient balance for requested action.",
  "data": {
    "symbol": "BTCUSDT",
    "side": "BUY",
    "type": "LIMIT",
    "quantity": "1.0",
    "price": "50000"
  }
}
```

### Recommended Logging Implementation

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function logApiResponse(
  endpoint: string,
  method: string,
  params: any,
  response: any,
  error?: any
) {
  await prisma.apiLog.create({
    data: {
      exchange: 'binance',
      endpoint,
      method,
      params: JSON.stringify(params),
      responseStatus: response?.status || 0,
      responseBody: JSON.stringify(response?.data || {}),
      error: error ? JSON.stringify({
        code: error?.response?.data?.code,
        msg: error?.response?.data?.msg,
        data: error?.response?.data?.data
      }) : null,
      timestamp: new Date(),
    }
  });
}
```

---

## Best Practices

1. **Time Synchronization**: Keep server time synced with NTP
2. **Error Handling**: Implement proper error handling for all API calls
3. **Rate Limiting**: Respect rate limits and implement backoff strategies
4. **Connection Management**: Use connection pooling for HTTP requests
5. **WebSocket Reconnection**: Implement automatic reconnection with ping/pong
6. **Order Management**: Use `newClientOrderId` for idempotency
7. **Security**: Never expose API keys in client-side code

---

## Official Resources & Repositories

### Documentation
| Resource | URL | Description |
|----------|-----|-------------|
| Spot API Docs | https://github.com/binance/binance-spot-api-docs | Official API documentation |
| API Swagger | https://github.com/binance/binance-api-swagger | OpenAPI/Swagger specifications |
| Public Data | https://github.com/binance/binance-public-data | Historical market data |

### Spot Trading SDKs
| Language | Package | Repository |
|----------|---------|------------|
| JavaScript/Node.js | `@binance/connector` | https://github.com/binance/binance-connector-js |
| TypeScript | `binance-connector-typescript` | https://github.com/binance/binance-connector-typescript |
| Python | `binance-connector` | https://github.com/binance/binance-connector-python |
| Java | `binance-connector-java` | https://github.com/binance/binance-connector-java |
| Rust | `binance-connector-rust` | https://github.com/binance/binance-connector-rust |

### Futures Trading SDKs
| Language | Repository |
|----------|------------|
| Python | https://github.com/binance/binance-futures-connector-python |
| Java | https://github.com/binance/binance-futures-connector-java |
| Node.js | https://github.com/binance/binance-futures-connector-node |

### FIX Protocol
| Language | Repository |
|----------|------------|
| Python | https://github.com/binance/binance-fix-connector-python |

### Toolbox Libraries (Quick Start)
| Language | Repository |
|----------|------------|
| Node.js | https://github.com/binance/binance-toolbox-nodejs |
| TypeScript | https://github.com/binance/binance-toolbox-typescript |
| Python | https://github.com/binance/binance-toolbox-python |
| Java | https://github.com/binance/binance-toolbox-java |
| Futures Java | https://github.com/binance/binance-futures-java-toolbox |

### SBE (Simple Binary Encoding)
| Language | Repository |
|----------|------------|
| C++ | https://github.com/binance/binance-sbe-cpp-sample-app |
| Rust | https://github.com/binance/binance-sbe-rust-sample-app |
| Java | https://github.com/binance/binance-sbe-java-sample-app |

### Tools & Utilities
| Tool | URL | Description |
|------|-----|-------------|
| CLI | https://github.com/binance/binance-cli | Command-line interface |
| Postman | https://github.com/binance/binance-api-postman | Postman collection |
| Signature Examples | https://github.com/binance/binance-signature-examples | Auth examples |
| WebSocket Examples | https://github.com/binance/binance-websocket-examples | WebSocket code |
| WebSocket Demo | https://github.com/binance/websocket-demo | Live demo |
| RSA Key Generator | https://github.com/binance/asymmetric-key-generator | Generate RSA keys |

### Binance Pay
| Resource | URL |
|----------|-----|
| Pay Signature Examples | https://github.com/binance/binance-pay-signature-examples |
| Pay Python | https://github.com/binance/binance-pay-connector-python |
| Pay Postman | https://github.com/binance/binance-pay-postman-collection |

### Proof of Reserves
| Resource | URL |
|----------|-----|
| Merkle Proof | https://github.com/binance/zkmerkle-proof-of-solvency |

### AI Trading Tools
| Tool | URL |
|------|-----|
| AI Trading Prototype | https://github.com/binance/ai-trading-prototype |
| Backtester | https://github.com/binance/ai-trading-prototype-backtester |
| Headlines | https://github.com/binance/ai-trading-prototype-headlines |

### Other Tools
| Tool | URL |
|------|-----|
| Crypto Trade Analyzer | https://github.com/binance/crypto-trade-analyzer |
| Java Logback | https://github.com/binance/binance-java-logback |
| MP Demo | https://github.com/binance/binance-mp-demo |

---

## Official SDKs - Detailed Usage

### Node.js SDK (binance-connector-js)

**Installation:**
```bash
npm install @binance/connector
```

**Spot Trading:**
```typescript
import Binance from '@binance/connector';

const client = new Binance.Spot(apiKey, apiKeySecret);

// Get account info
const account = await client.account();

// Place order
const order = await client.newOrder('BTCUSDT', 'BUY', 'LIMIT', {
  price: '50000',
  quantity: 0.001,
  timeInForce: 'GTC'
});

// Get open orders
const orders = await client.openOrders({ symbol: 'BTCUSDT' });

// Cancel order
await client.cancelOrder('BTCUSDT', { orderId: '12345' });
```

**WebSocket:**
```typescript
const logger = new Binance.Logger('https://api.binance.com');

// Trade stream
const callbacks = {
  open: () => logger.info('open'),
  close: () => logger.info('closed'),
  message: (data) => logger.info(data)
};

const wsRef = Binance.Websocket.trade('BTCUSDT', callbacks);

// Close connection
wsRef.ws.close();
```

### TypeScript SDK (binance-connector-typescript)

**Installation:**
```bash
npm install binance-connector-typescript
```

**Usage:**
```typescript
import { BinanceClient } from 'binance-connector-typescript';

const client = new BinanceClient({
  api_key: 'your-api-key',
  api_secret: 'your-api-secret',
  base_url: 'https://api.binance.com'
});

// Get exchange info
const exchangeInfo = await client.getExchangeInfo();

// Place order
const order = await client.newOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '50000'
});
```

### Python SDK (binance-connector-python)

**Installation:**
```bash
pip install binance-connector
```

**Usage:**
```python
from binance.spot import Spot
from binance.websocket.spot.websocket_client import SpotWebsocketClient

# REST API
client = Spot(api_key, api_secret)

# Get account info
account = client.account()

# Place order
order = client.new_order(
    symbol='BTCUSDT',
    side='BUY',
    type='LIMIT',
    quantity='0.001',
    price='50000',
    timeInForce='GTC'
)

# WebSocket
def message_handler(message):
    print(message)

ws_client = SpotWebsocketClient(stream_url='wss://stream.binance.com:9443/ws')
ws_client.trade(symbol='BTCUSDT', callback=message_handler)
```

### Java SDK (binance-connector-java)

**Maven:**
```xml
<dependency>
    <groupId>io.github.binance</groupId>
    <artifactId>binance-connector-java</artifactId>
    <version>latest</version>
</dependency>
```

**Gradle:**
```groovy
implementation 'io.github.binance:binance-connector-java:latest'
```

**Usage:**
```java
import com.binance.connector.client.impl.SpotClientImpl;
import com.binance.connector.client.impl.websocket.WebsocketClientImpl;

// REST API
SpotClientImpl client = new SpotClientImpl(apiKey, apiSecret);

// Get account
String account = client.createTrade().account();

// Place order
Map<String, Object> params = new HashMap<>();
params.put("symbol", "BTCUSDT");
params.put("side", "BUY");
params.put("type", "LIMIT");
params.put("timeInForce", "GTC");
params.put("quantity", "0.001");
params.put("price", "50000");

String order = client.createTrade().newOrder(params);
```

### Rust SDK (binance-connector-rust)

**Cargo.toml:**
```toml
[dependencies]
binance-connector = "1.0"
tokio = { version = "1", features = ["full"] }
```

**Usage:**
```rust
use binance_connector::{Spot, BinanceClient};

#[tokio::main]
async fn main() {
    let client = BinanceClient::new(api_key, api_secret);
    
    // Get account
    let account = client.account().await.unwrap();
    println!("{:?}", account);
    
    // Place order
    let order = client
        .new_order("BTCUSDT", "BUY", "LIMIT")
        .quantity("0.001")
        .price("50000")
        .time_in_force("GTC")
        .send()
        .await
        .unwrap();
}
```

### Futures Python SDK

**Installation:**
```bash
pip install binance-futures-connector
```

**Usage:**
```python
from binance.um_futures import UMFutures

client = UMFutures(api_key, api_secret)

# Get exchange info
exchange_info = client.exchange_info()

# Place order
order = client.new_order(
    symbol='BTCUSDT',
    side='BUY',
    type='LIMIT',
    quantity='0.001',
    price='50000',
    timeInForce='GTC'
)

# Set leverage
client.change_leverage(symbol='BTCUSDT', leverage=10)

# Get positions
positions = client.get_position_risk()
```

### FIX Protocol (Python)

For institutional traders requiring low-latency connections:

```bash
pip install binance-fix-connector-python
```

---

## Toolbox Libraries

Quick-start examples for common use cases:

### Node.js Toolbox

```bash
npm install binance-toolbox-nodejs
```

### Python Toolbox

```bash
pip install binance-toolbox-python
```

These toolboxes provide:
- Quick setup examples
- Common trading patterns
- WebSocket handling
- Order management examples

---

## Binance Pay Integration

For payment integration:

```python
# binance-pay-connector-python
from binance_pay import BinancePay

client = BinancePay(api_key, api_secret)

# Create order
order = client.create_order(
    merchantTradeNo='ORDER_123',
    totalAmount=100.00,
    currency='USDT',
    description='Payment for goods'
)
```

---

## RSA Key Generation

For RSA authentication:

```bash
# Using asymmetric-key-generator
git clone https://github.com/binance/asymmetric-key-generator

# Or use OpenSSL
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem
```

---

## Postman Collection

Quick start with Postman:

1. Download: https://github.com/binance/binance-api-postman
2. Import into Postman
3. Set environment variables:
   - `api_key`: Your API key
   - `api_secret`: Your API secret
   - `base_url`: `https://api.binance.com`

---

## AI Trading Tools

Binance provides AI-powered trading prototypes:

| Tool | Description |
|------|-------------|
| ai-trading-prototype | Basic AI trading framework |
| ai-trading-prototype-backtester | Backtest AI strategies |
| ai-trading-prototype-headlines | News-based trading signals |

---

## SBE (Simple Binary Encoding)

For high-performance, low-latency trading:

- Official specification implementation
- Supports C++, Rust, and Java
- Much faster than JSON parsing
- Used by institutional traders

---

## References

- [Official API Documentation](https://binance-docs.github.io/apidocs/spot/en/)
- [API Status](https://www.binance.com/en/networkStatus)
- [Fees](https://www.binance.com/en/fee/schedule)
- [Trading Rules](https://www.binance.com/en/trading-rules)
