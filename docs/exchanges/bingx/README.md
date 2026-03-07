# BingX API Documentation

> Official documentation: https://bingx-api.github.io/docs-v3/#/en/info

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Market Data Endpoints](#market-data-endpoints)
4. [Trading Operations](#trading-operations)
5. [WebSocket Streams](#websocket-streams)
6. [Error Codes](#error-codes)
7. [Response Storage](#response-storage)
8. [Local Order Book Management](#local-order-book-management)
9. [Rate Limit Best Practices](#rate-limit-best-practices)
10. [Error Recovery Patterns](#error-recovery-patterns)

---

## Overview

BingX API provides unified access to all trading products:
- **Spot** - Spot trading with standard pairs
- **Standard Contract (Swap V2)** - USDT-M perpetual futures
- **Standard Contract (Coin-M)** - Coin-Margined perpetual futures
- **Demo Trading** - Virtual simulation with VST tokens

### Base URLs

| Environment | URL |
|------------|-----|
| Mainnet REST | `https://open-api.bingx.com` |
| Mainnet WebSocket (Spot) | `wss://open-api-ws.bingx.com` |
| Mainnet WebSocket (Futures) | `wss://open-api-swap.bingx.com` |

### API Path Structure

```
/openApi/{market}/{version}/{module}
```

| Path Segment | Description |
|--------------|-------------|
| `/openApi/spot/v1/` | Spot trading API |
| `/openApi/swap/v2/` | Futures trading API (V2) |
| `/openApi/swap/v3/` | Futures trading API (V3) |

---

## Authentication

### Required Headers

| Header | Description |
|--------|-------------|
| `X-BX-APIKEY` | Your API key |
| `signature` | Request signature (HMAC-SHA256) |
| `timestamp` | UTC timestamp in milliseconds |
| `recvWindow` | Request validity window (default 5000ms) |

### Signature Generation

BingX uses HMAC-SHA256 with hex encoding:

```typescript
import crypto from 'crypto';

function generateSignature(queryString: string, apiSecret: string): string {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
}
```

### GET Request Example

```typescript
const apiKey = 'your-api-key';
const apiSecret = 'your-api-secret';

const timestamp = Date.now().toString();
const recvWindow = '5000';

const params = {
  symbol: 'BTC-USDT',
  timestamp,
  recvWindow
};

// Build query string (without signature)
const queryString = Object.entries(params)
  .map(([k, v]) => `${k}=${v}`)
  .join('&');

// Generate signature
const signature = generateSignature(queryString, apiSecret);

// Build final URL
const url = `https://open-api.bingx.com/openApi/swap/v2/user/balance?${queryString}&signature=${signature}`;

const response = await fetch(url, {
  headers: {
    'X-BX-APIKEY': apiKey,
    'Content-Type': 'application/json'
  }
});
```

### POST Request Example

```typescript
const body = {
  symbol: 'BTC-USDT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: '0.001',
  price: '50000',
  timestamp: Date.now().toString(),
  recvWindow: '5000'
};

// Build query string from all params
const queryString = Object.entries(body)
  .map(([k, v]) => `${k}=${v}`)
  .join('&');

// Generate signature
const signature = generateSignature(queryString, apiSecret);

const url = `https://open-api.bingx.com/openApi/swap/v2/trade/order?${queryString}&signature=${signature}`;

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'X-BX-APIKEY': apiKey,
    'Content-Type': 'application/json'
  }
});
```

---

## Market Data Endpoints

### Get Ticker Price

```
GET /openApi/swap/v2/quote/price
GET /openApi/spot/v1/ticker/price
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |

**Response:**
```json
{
  "code": 0,
  "msg": "",
  "data": {
    "symbol": "BTC-USDT",
    "price": "50000.00",
    "bidPrice": "49999.00",
    "askPrice": "50001.00",
    "high24h": "51000.00",
    "low24h": "49000.00",
    "volume24h": "12345.67"
  }
}
```

### Get Orderbook (Depth)

```
GET /openApi/swap/v2/quote/depth
GET /openApi/spot/v1/depth
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| limit | INT | NO | Depth limit (default 100, max 1000) |

**Response:**
```json
{
  "code": 0,
  "msg": "",
  "data": {
    "bids": [
      { "price": "50000.00", "qty": "1.5" },
      { "price": "49999.00", "qty": "2.0" }
    ],
    "asks": [
      { "price": "50001.00", "qty": "1.2" },
      { "price": "50002.00", "qty": "0.8" }
    ]
  }
}
```

### Get Klines (Candlesticks)

```
GET /openApi/swap/v2/quote/klines
GET /openApi/spot/v1/klines
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| interval | STRING | YES | Kline interval |
| startTime | LONG | NO | Start timestamp |
| endTime | LONG | NO | End timestamp |
| limit | INT | NO | Limit (default 500, max 1000) |

**Intervals:**
- Minutes: `1m`, `3m`, `5m`, `15m`, `30m`
- Hours: `1h`, `2h`, `4h`, `6h`, `12h`
- Days: `1d`, `3d`, `1w`, `1M`

### Get Funding Rate

```
GET /openApi/swap/v2/quote/fundingRate
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |

**Response:**
```json
{
  "code": 0,
  "msg": "",
  "data": {
    "symbol": "BTC-USDT",
    "fundingRate": "0.0001",
    "nextFundingTime": "1672300800000",
    "markPrice": "50000.00",
    "indexPrice": "50001.00"
  }
}
```

---

## Trading Operations

### Place Order (Futures)

```
POST /openApi/swap/v2/trade/order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| side | STRING | YES | BUY, SELL |
| type | STRING | YES | LIMIT, MARKET |
| quantity | DECIMAL | YES | Order quantity |
| price | DECIMAL | NO | Price (required for LIMIT) |
| positionSide | STRING | NO | LONG, SHORT (for hedge mode) |
| reduceOnly | BOOLEAN | NO | Reduce position only |
| clientOrderId | STRING | NO | Client order ID |

**Response:**
```json
{
  "code": 0,
  "msg": "",
  "data": {
    "orderId": "1234567890",
    "clientOrderId": "my_order_001"
  }
}
```

### Place Order (Spot)

```
POST /openApi/spot/v1/trade/order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| side | STRING | YES | BUY, SELL |
| type | STRING | YES | LIMIT, MARKET |
| quantity | DECIMAL | NO | Order quantity (for LIMIT) |
| quoteOrderQty | DECIMAL | NO | Quote quantity (for MARKET) |
| price | DECIMAL | NO | Price (required for LIMIT) |
| newClientOrderId | STRING | NO | Client order ID |

### Cancel Order

```
DELETE /openApi/swap/v2/trade/order
DELETE /openApi/spot/v1/trade/cancelOrder
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| orderId | STRING | NO | Order ID |
| clientOrderId | STRING | NO | Client order ID |

### Get Open Orders

```
GET /openApi/swap/v2/trade/openOrders
GET /openApi/spot/v1/trade/openOrders
```

### Get Order History

```
GET /openApi/swap/v2/trade/allOrders
GET /openApi/spot/v1/trade/historyOrders
```

---

## Position Management

### Get Positions

```
GET /openApi/swap/v2/user/positions
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | NO | Trading pair (omit for all) |

**Response:**
```json
{
  "code": 0,
  "msg": "",
  "data": [
    {
      "symbol": "BTC-USDT",
      "positionSide": "LONG",
      "positionAmt": "0.001",
      "entryPrice": "50000.00",
      "markPrice": "50100.00",
      "unRealizedProfit": "0.10",
      "leverage": "20",
      "initialMargin": "2.5",
      "liquidationPrice": "45000.00",
      "updateTime": "1672218931000"
    }
  ]
}
```

### Set Leverage

```
POST /openApi/swap/v2/trade/leverage
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| leverage | INT | YES | Leverage multiplier |

### Set Position Mode

```
POST /openApi/swap/v2/trade/positionSide/dual
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| dualSidePosition | STRING | YES | "true" for hedge mode, "false" for one-way |

---

## Account Management

### Get Balance (Futures)

```
GET /openApi/swap/v2/user/balance
```

**Response:**
```json
{
  "code": 0,
  "msg": "",
  "data": {
    "balance": [
      {
        "asset": "USDT",
        "totalAmount": "10000.00",
        "availableAmount": "9500.00",
        "frozenAmount": "500.00"
      }
    ]
  }
}
```

### Get Balance (Spot)

```
GET /openApi/spot/v1/account/balance
```

**Response:**
```json
{
  "code": 0,
  "msg": "",
  "data": {
    "balances": [
      {
        "asset": "USDT",
        "free": "10000.00",
        "locked": "500.00"
      }
    ]
  }
}
```

---

## WebSocket Streams

### WebSocket URLs

| Type | URL |
|------|-----|
| Spot Public | `wss://open-api-ws.bingx.com/openapi` |
| Spot Private | `wss://open-api-ws.bingx.com/openapi/spot/v1/ws` |
| Futures Public | `wss://open-api-swap.bingx.com/openapi/swap/v2/ws` |
| Futures Private | `wss://open-api-swap.bingx.com/openapi/swap/v2/ws` |

### Connection Example

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('wss://open-api-swap.bingx.com/openapi/swap/v2/ws');

ws.on('open', () => {
  console.log('Connected to BingX WebSocket');
  
  // Subscribe to depth channel
  ws.send(JSON.stringify({
    id: 'depth_sub',
    reqType: 'sub',
    dataType: 'BTC-USDT@depth20'
  }));
  
  // Subscribe to trade channel
  ws.send(JSON.stringify({
    id: 'trade_sub',
    reqType: 'sub',
    dataType: 'BTC-USDT@trade'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Message:', message);
});

// Handle ping/pong
setInterval(() => {
  ws.send(JSON.stringify({ pong: Date.now() }));
}, 25000);
```

### Authentication for Private Channels

```typescript
const apiKey = 'your-api-key';
const apiSecret = 'your-api-secret';

// Listen key for private channels (obtain via REST API)
const listenKey = await fetch('https://open-api.bingx.com/openApi/swap/v2/user/auth', {
  headers: { 'X-BX-APIKEY': apiKey }
}).then(r => r.json()).then(d => d.data.listenKey);

ws.send(JSON.stringify({
  id: 'auth',
  reqType: 'sub',
  dataType: 'ACCOUNT_UPDATE',
  signature: generateSignature(`listenKey=${listenKey}`, apiSecret)
}));
```

### Available Channels

#### Public Channels (Futures)

| Channel | dataType | Description |
|---------|----------|-------------|
| Depth | `{symbol}@depth` | Full order book |
| Depth 20 | `{symbol}@depth20` | 20 levels depth |
| Trade | `{symbol}@trade` | Trade updates |
| Ticker | `{symbol}@ticker` | 24h ticker |
| Kline | `{symbol}@kline_{interval}` | Candlestick data |
| Funding Rate | `{symbol}@fundingRate` | Funding rate updates |
| Mark Price | `{symbol}@markPrice` | Mark price updates |

#### Public Channels (Spot)

| Channel | dataType | Description |
|---------|----------|-------------|
| Depth | `{symbol}@depth` | Order book |
| Trade | `{symbol}@trade` | Trade updates |
| Ticker | `{symbol}@ticker` | 24h ticker |
| Kline | `{symbol}@kline_{interval}` | Candlestick data |

#### Private Channels

| Channel | Description |
|---------|-------------|
| `ACCOUNT_UPDATE` | Account balance updates |
| `ORDER_UPDATE` | Order status updates |
| `POSITION_UPDATE` | Position updates |

### Message Format

#### Depth Update

```json
{
  "id": "depth_sub",
  "code": 0,
  "dataType": "BTC-USDT@depth20",
  "data": {
    "bids": [
      ["50000.00", "1.5"],
      ["49999.00", "2.0"]
    ],
    "asks": [
      ["50001.00", "1.2"],
      ["50002.00", "0.8"]
    ],
    "timestamp": 1672218931000
  }
}
```

#### Trade Update

```json
{
  "id": "trade_sub",
  "code": 0,
  "dataType": "BTC-USDT@trade",
  "data": {
    "e": "trade",
    "E": 1672218931000,
    "s": "BTC-USDT",
    "t": 1234567890,
    "p": "50000.00",
    "q": "0.001",
    "m": true
  }
}
```

#### Position Update (Private)

```json
{
  "id": "position_sub",
  "code": 0,
  "dataType": "POSITION_UPDATE",
  "data": {
    "symbol": "BTC-USDT",
    "positionSide": "LONG",
    "positionAmt": "0.001",
    "entryPrice": "50000.00",
    "unRealizedProfit": "0.10"
  }
}
```

---

## Error Codes

### Success Code

| Code | Description |
|------|-------------|
| `0` | Success |

### Authentication Errors

| Code | Description |
|------|-------------|
| `100001` | Signature verification failed |
| `100002` | Invalid API key |
| `100003` | Invalid timestamp |
| `100004` | Request expired (recvWindow exceeded) |
| `100005` | Permission denied |
| `100006` | IP not whitelisted |

### Order Errors

| Code | Description |
|------|-------------|
| `100202` | Insufficient balance |
| `100400` | Invalid parameter |
| `100440` | Order price deviates greatly from market price |
| `100441` | Order quantity exceeds limit |
| `100442` | Order would trigger immediately |
| `100443` | Order not found |
| `100444` | Order already cancelled |
| `100445` | Order already filled |
| `100446` | Position size exceeds limit |
| `100447` | Reduce only would increase position |

### Position Errors

| Code | Description |
|------|-------------|
| `100500` | Position not found |
| `100501` | Position size is zero |
| `100502` | Position is in liquidation |
| `100503` | Leverage not modified |

### Rate Limit Errors

| Code | Description |
|------|-------------|
| `100600` | Too many requests |
| `100601` | Rate limit exceeded |

### System Errors

| Code | Description |
|------|-------------|
| `100500` | Internal system error |
| `80001` | Request failed |
| `80002` | Service unavailable |

---

## Response Storage

### Recommended Storage Schema

```typescript
interface BingxApiLogEntry {
  id: string;
  timestamp: Date;
  exchange: 'bingx';
  market: 'spot' | 'swap';
  endpoint: string;
  method: string;
  params: Record<string, any>;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  code: number;
  msg: string;
  data: any;
  responseTime: number;
  error?: {
    code: number;
    msg: string;
  };
}
```

### Error Response Format

```json
{
  "code": 100202,
  "msg": "Insufficient balance",
  "data": null
}
```

### Implementation Example

```typescript
async function logBingxResponse(
  market: string,
  endpoint: string,
  method: string,
  params: any,
  response: any,
  error?: any
) {
  await prisma.apiLog.create({
    data: {
      exchange: 'bingx',
      market,
      endpoint,
      method,
      params: JSON.stringify(params),
      responseStatus: response?.status || 0,
      code: response?.data?.code || error?.response?.data?.code,
      msg: response?.data?.msg || error?.response?.data?.msg,
      data: JSON.stringify(response?.data?.data || {}),
      error: error ? JSON.stringify({
        code: error?.response?.data?.code,
        msg: error?.response?.data?.msg
      }) : null,
      timestamp: new Date()
    }
  });
}
```

---

## Local Order Book Management

Maintaining a local order book via WebSocket is essential for high-frequency trading strategies. BingX provides depth channels with real-time updates.

### How Order Book WebSocket Works

BingX's order book stream:

1. **Subscribe** to `{symbol}@depth` or `{symbol}@depth20` channel
2. **Receive snapshot** - Full order book state
3. **Receive updates** - Real-time changes pushed continuously
4. **Apply updates** - Maintain local order book state

### Depth Channel Comparison

| Channel | Depth | Update Frequency | Use Case |
|---------|-------|------------------|----------|
| `{symbol}@depth5` | 5 levels | Real-time | Quick price display |
| `{symbol}@depth20` | 20 levels | Real-time | Standard trading |
| `{symbol}@depth` | Full depth | Real-time | Market making |

### Local Order Book Implementation

```typescript
import WebSocket from 'ws';

interface OrderBookLevel {
  price: number;
  qty: number;
}

interface BingxDepthMessage {
  id: string;
  code: number;
  dataType: string;
  data: {
    bids: [string, string][];
    asks: [string, string][];
    timestamp: number;
  };
}

class BingxLocalOrderBook {
  private ws: WebSocket | null = null;
  private bids: Map<number, number> = new Map();
  private asks: Map<number, number> = new Map();
  private symbol: string;
  private depth: number;
  private onUpdateCallback: (() => void) | null = null;
  private lastTimestamp: number = 0;

  constructor(symbol: string, depth: number = 20) {
    this.symbol = symbol;
    this.depth = depth;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = 'wss://open-api-swap.bingx.com/openapi/swap/v2/ws';
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log(`[BingX] Connected to orderbook stream for ${this.symbol}`);
        
        // Subscribe to depth channel
        const channel = this.depth >= 20 ? `${this.symbol}@depth20` : `${this.symbol}@depth`;
        
        this.ws!.send(JSON.stringify({
          id: `depth_${Date.now()}`,
          reqType: 'sub',
          dataType: channel
        }));
        
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as BingxDepthMessage;
          
          if (message.dataType?.includes('@depth')) {
            this.handleDepthUpdate(message);
          }
        } catch (error) {
          console.error('[BingX] Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[BingX] WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[BingX] WebSocket connection closed');
        this.handleReconnect();
      });

      // Setup ping interval
      this.setupPing();
    });
  }

  private pingInterval: NodeJS.Timeout | null = null;

  private setupPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ pong: Date.now() }));
      }
    }, 25000);
  }

  private handleDepthUpdate(message: BingxDepthMessage): void {
    if (message.code !== 0) {
      console.error('[BingX] Depth update error:', message);
      return;
    }

    const { bids, asks, timestamp } = message.data;
    
    // BingX sends full snapshot each time (replace, don't merge)
    this.bids.clear();
    this.asks.clear();
    
    // Process bids
    for (const [price, qty] of bids) {
      const p = parseFloat(price);
      const q = parseFloat(qty);
      if (q > 0) {
        this.bids.set(p, q);
      }
    }
    
    // Process asks
    for (const [price, qty] of asks) {
      const p = parseFloat(price);
      const q = parseFloat(qty);
      if (q > 0) {
        this.asks.set(p, q);
      }
    }
    
    this.lastTimestamp = timestamp;
    
    if (this.onUpdateCallback) {
      this.onUpdateCallback();
    }
  }

  private async handleReconnect(): Promise<void> {
    console.log('[BingX] Reconnecting in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await this.connect();
  }

  onUpdate(callback: () => void): void {
    this.onUpdateCallback = callback;
  }

  getBids(limit?: number): OrderBookLevel[] {
    const sorted = Array.from(this.bids.entries())
      .map(([price, qty]) => ({ price, qty }))
      .sort((a, b) => b.price - a.price);
    
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getAsks(limit?: number): OrderBookLevel[] {
    const sorted = Array.from(this.asks.entries())
      .map(([price, qty]) => ({ price, qty }))
      .sort((a, b) => a.price - b.price);
    
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getBestBid(): OrderBookLevel | null {
    const bids = this.getBids(1);
    return bids.length > 0 ? bids[0] : null;
  }

  getBestAsk(): OrderBookLevel | null {
    const asks = this.getAsks(1);
    return asks.length > 0 ? asks[0] : null;
  }

  getSpread(): { absolute: number; percentage: number } | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    const absolute = bestAsk.price - bestBid.price;
    const percentage = (absolute / bestBid.price) * 100;
    
    return { absolute, percentage };
  }

  getMidPrice(): number | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    return (bestBid.price + bestAsk.price) / 2;
  }

  getImbalance(levels: number = 10): number {
    const bids = this.getBids(levels);
    const asks = this.getAsks(levels);
    
    const bidVolume = bids.reduce((sum, b) => sum + b.qty, 0);
    const askVolume = asks.reduce((sum, a) => sum + a.qty, 0);
    const total = bidVolume + askVolume;
    
    return total > 0 ? (bidVolume - askVolume) / total : 0;
  }

  disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage Example
async function main() {
  const orderBook = new BingxLocalOrderBook('BTC-USDT', 20);
  
  orderBook.onUpdate(() => {
    const spread = orderBook.getSpread();
    const imbalance = orderBook.getImbalance(10);
    const midPrice = orderBook.getMidPrice();
    
    console.log(`Mid: ${midPrice?.toFixed(2)} | Spread: ${spread?.percentage.toFixed(4)}% | Imbalance: ${imbalance.toFixed(3)}`);
  });
  
  await orderBook.connect();
  
  process.on('SIGINT', () => {
    orderBook.disconnect();
    process.exit(0);
  });
}
```

### Best Practices

1. **Full Replace Model**: BingX sends full snapshots, replace your local order book entirely
2. **Ping/Pong**: Send ping every 25-30 seconds to keep connection alive
3. **Timestamp Validation**: Track last update timestamp to detect stale data
4. **Handle Reconnection**: Implement automatic reconnection on disconnect

---

## Rate Limit Best Practices

BingX implements rate limits to ensure platform stability. Understanding these limits is crucial for building reliable applications.

### Rate Limit Types

| Limit Type | Scope | Default Limit | Window |
|------------|-------|---------------|--------|
| Market Data | Per IP | 500 requests | 10 seconds |
| Trading | Per Account | 10 requests | 1 second |
| WebSocket Connections | Per IP | 30 connections | - |
| WebSocket Subscriptions | Per Connection | 100 subscriptions | - |

### Endpoint-Specific Rate Limits

| Endpoint | Rate Limit | Notes |
|----------|------------|-------|
| `/openApi/spot/v1/trade/order` | 10 req/s | Per account |
| `/openApi/swap/v2/trade/order` | 10 req/s | Per account |
| `/openApi/spot/v1/depth` | 50 req/10s | Per IP |
| `/openApi/swap/v2/quote/depth` | 50 req/10s | Per IP |
| `/openApi/spot/v1/klines` | 50 req/10s | Per IP |
| `/openApi/swap/v2/user/balance` | 10 req/s | Per account |

### Rate Limiter Implementation

```typescript
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  minInterval: number;
}

class BingxRateLimiter {
  private requests: number[] = [];
  private config: RateLimitConfig;
  private lastRequestTime: number = 0;

  constructor(config: RateLimitConfig = { maxRequests: 10, windowMs: 1000, minInterval: 100 }) {
    this.config = config;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Clean old requests
    this.requests = this.requests.filter(time => now - time < this.config.windowMs);
    
    // Check limit
    if (this.requests.length >= this.config.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.config.windowMs - (now - oldestRequest) + 10;
      
      console.log(`[RateLimiter] Rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }
    
    // Ensure minimum interval
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.minInterval) {
      await this.sleep(this.config.minInterval - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
    this.requests.push(this.lastRequestTime);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getUsage(): { used: number; remaining: number; resetIn: number } {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.config.windowMs);
    
    const oldestRequest = this.requests[0] || now;
    const resetIn = Math.max(0, this.config.windowMs - (now - oldestRequest));
    
    return {
      used: this.requests.length,
      remaining: this.config.maxRequests - this.requests.length,
      resetIn
    };
  }
}

// Rate-limited client
class RateLimitedBingxClient {
  private rateLimiter: BingxRateLimiter;
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://open-api.bingx.com';
    this.rateLimiter = new BingxRateLimiter();
  }

  async request(method: 'GET' | 'POST' | 'DELETE', path: string, params: any = {}): Promise<any> {
    await this.rateLimiter.waitForSlot();

    const timestamp = Date.now().toString();
    const allParams = { ...params, timestamp, recvWindow: 5000 };
    
    const queryString = Object.entries(allParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const signature = this.generateSignature(queryString);
    const url = `${this.baseUrl}${path}?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method,
      headers: {
        'X-BX-APIKEY': this.apiKey,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.code !== 0) {
      throw new BingxApiError(data.code, data.msg);
    }

    return data.data;
  }

  private generateSignature(queryString: string): string {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }
}

class BingxApiError extends Error {
  public code: number;
  
  constructor(code: number, message: string) {
    super(message);
    this.name = 'BingxApiError';
    this.code = code;
  }
}
```

### Exponential Backoff

```typescript
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof BingxApiError && error.code === 100600) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[BingX] Rate limited. Waiting ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}
```

### Rate Limit Best Practices

1. **Use WebSocket for Market Data**: Avoid REST polling for real-time data
2. **Separate Rate Limiters**: Use different limiters for different endpoint types
3. **Monitor Usage**: Track remaining requests in real-time
4. **Implement Backoff**: Use exponential backoff for rate limit errors
5. **Batch Operations**: Consider batching multiple operations where supported
6. **Cache Responses**: Cache infrequently changing data

---

## Error Recovery Patterns

Robust error handling is essential for production trading systems. This section covers common error scenarios and recovery strategies.

### Error Categories

| Category | Error Codes | Recovery Strategy |
|----------|-------------|-------------------|
| Network | Timeout, Connection Reset | Retry with backoff |
| Rate Limit | 100600, 100601 | Exponential backoff |
| Authentication | 100001-100006 | Check credentials |
| Order | 100202, 100400-100447 | Validate order params |
| Position | 100500-100503 | Check position state |

### Error Handler Implementation

```typescript
interface BingxError {
  code: number;
  message: string;
  retriable: boolean;
  category: 'network' | 'rate_limit' | 'auth' | 'order' | 'position' | 'unknown';
}

class BingxErrorHandler {
  private errorPatterns: Map<number, BingxError> = new Map([
    // Authentication errors
    [100001, { code: 100001, message: 'Signature verification failed', retriable: false, category: 'auth' }],
    [100002, { code: 100002, message: 'Invalid API key', retriable: false, category: 'auth' }],
    [100003, { code: 100003, message: 'Invalid timestamp', retriable: true, category: 'auth' }],
    [100004, { code: 100004, message: 'Request expired', retriable: true, category: 'auth' }],
    [100005, { code: 100005, message: 'Permission denied', retriable: false, category: 'auth' }],
    [100006, { code: 100006, message: 'IP not whitelisted', retriable: false, category: 'auth' }],
    
    // Rate limit errors
    [100600, { code: 100600, message: 'Too many requests', retriable: true, category: 'rate_limit' }],
    [100601, { code: 100601, message: 'Rate limit exceeded', retriable: true, category: 'rate_limit' }],
    
    // Order errors
    [100202, { code: 100202, message: 'Insufficient balance', retriable: false, category: 'order' }],
    [100400, { code: 100400, message: 'Invalid parameter', retriable: false, category: 'order' }],
    [100440, { code: 100440, message: 'Order price deviates greatly', retriable: false, category: 'order' }],
    [100441, { code: 100441, message: 'Order quantity exceeds limit', retriable: false, category: 'order' }],
    [100442, { code: 100442, message: 'Order would trigger immediately', retriable: false, category: 'order' }],
    [100443, { code: 100443, message: 'Order not found', retriable: false, category: 'order' }],
    [100446, { code: 100446, message: 'Position size exceeds limit', retriable: false, category: 'position' }],
    [100447, { code: 100447, message: 'Reduce only would increase position', retriable: false, category: 'order' }],
    
    // Position errors
    [100500, { code: 100500, message: 'Position not found', retriable: false, category: 'position' }],
    [100501, { code: 100501, message: 'Position size is zero', retriable: false, category: 'position' }],
    [100502, { code: 100502, message: 'Position is in liquidation', retriable: false, category: 'position' }],
  ]);

  analyzeError(code: number, message: string): BingxError {
    const known = this.errorPatterns.get(code);
    if (known) return known;
    
    return {
      code,
      message,
      retriable: false,
      category: 'unknown'
    };
  }

  shouldRetry(error: BingxError): boolean {
    return error.retriable;
  }

  getRecoveryAction(error: BingxError): string {
    switch (error.category) {
      case 'network':
        return 'Retry with exponential backoff';
      case 'rate_limit':
        return 'Wait and retry with backoff';
      case 'auth':
        if (error.code === 100003 || error.code === 100004) {
          return 'Sync time and retry';
        }
        return 'Check API credentials and permissions';
      case 'order':
        return 'Validate order parameters and account balance';
      case 'position':
        return 'Check position state and leverage';
      default:
        return 'Log error and investigate';
    }
  }
}
```

### Resilient Client Implementation

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

class ResilientBingxClient {
  private errorHandler: BingxErrorHandler;
  private retryConfig: RetryConfig;
  private timeOffset: number = 0;

  constructor(
    private client: RateLimitedBingxClient,
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.errorHandler = new BingxErrorHandler();
    this.retryConfig = {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      ...retryConfig
    };
  }

  async initialize(): Promise<void> {
    await this.syncTime();
  }

  private async syncTime(): Promise<void> {
    try {
      const response = await fetch('https://open-api.bingx.com/openApi/swap/v2/quote/price?symbol=BTC-USDT');
      const serverTime = Date.now(); // Approximate, consider adding dedicated endpoint
      const localTime = Date.now();
      this.timeOffset = serverTime - localTime;
      
      if (Math.abs(this.timeOffset) > 1000) {
        console.warn(`[BingX] Time offset detected: ${this.timeOffset}ms`);
      }
    } catch (error) {
      console.error('[BingX] Failed to sync time:', error);
    }
  }

  getTimestamp(): string {
    return (Date.now() + this.timeOffset).toString();
  }

  async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params: any = {}): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.client.request(method, path, params) as T;
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof BingxApiError) {
          const analyzed = this.errorHandler.analyzeError(error.code, error.message);
          
          console.error(`[BingX] API Error (${analyzed.category}): ${error.message} [code: ${error.code}]`);
          
          if (!analyzed.retriable || attempt === this.retryConfig.maxRetries) {
            throw error;
          }
          
          // Handle timestamp errors
          if (error.code === 100003 || error.code === 100004) {
            await this.syncTime();
            continue;
          }
          
          const delay = Math.min(
            this.retryConfig.baseDelayMs * Math.pow(2, attempt),
            this.retryConfig.maxDelayMs
          );
          
          console.log(`[BingX] Retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          if (attempt === this.retryConfig.maxRetries) {
            throw error;
          }
          
          const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
          console.log(`[BingX] Network error. Retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    quantity: string;
    price?: string;
    positionSide?: 'LONG' | 'SHORT';
    reduceOnly?: boolean;
  }): Promise<{ orderId: string }> {
    try {
      return await this.request('POST', '/openApi/swap/v2/trade/order', params);
    } catch (error) {
      if (error instanceof BingxApiError) {
        switch (error.code) {
          case 100202:
            throw new OrderError('Insufficient balance', 'INSUFFICIENT_BALANCE');
          case 100440:
            throw new OrderError('Price deviates greatly from market', 'PRICE_DEVIATION');
          case 100441:
            throw new OrderError('Quantity exceeds limit', 'QTY_EXCEEDED');
          default:
            throw error;
        }
      }
      throw error;
    }
  }
}

class OrderError extends Error {
  public reason: string;
  
  constructor(message: string, reason: string) {
    super(message);
    this.name = 'OrderError';
    this.reason = reason;
  }
}
```

### WebSocket Error Recovery

```typescript
class ResilientBingxWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: string[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(private url: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.on('open', () => {
          console.log('[BingX WS] Connected');
          this.reconnectAttempts = 0;
          this.startPing();
          this.resubscribe();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('[BingX WS] Error:', error);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('[BingX WS] Connection closed');
          this.stopPing();
          this.handleDisconnect();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ pong: Date.now() }));
      }
    }, 25000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle ping/pong
      if (message.ping) {
        this.ws?.send(JSON.stringify({ pong: Date.now() }));
        return;
      }
      
      // Process data messages
      if (message.dataType) {
        this.emit(message.dataType, message);
      }
    } catch (error) {
      console.error('[BingX WS] Parse error:', error);
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[BingX WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[BingX WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(err => {
        console.error('[BingX WS] Reconnection failed:', err);
      });
    }, delay);
  }

  private resubscribe(): void {
    if (this.subscriptions.length === 0) return;
    
    for (const dataType of this.subscriptions) {
      this.ws!.send(JSON.stringify({
        id: `sub_${Date.now()}`,
        reqType: 'sub',
        dataType
      }));
    }
  }

  subscribe(dataTypes: string[]): void {
    this.subscriptions.push(...dataTypes);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      for (const dataType of dataTypes) {
        this.ws.send(JSON.stringify({
          id: `sub_${Date.now()}`,
          reqType: 'sub',
          dataType
        }));
      }
    }
  }

  private emit(channel: string, data: any): void {
    // Implement event emission
  }

  disconnect(): void {
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }
}
```

### Error Recovery Summary

| Error Type | Detection | Recovery Action |
|------------|-----------|-----------------|
| Timestamp Error (100003, 100004) | Server rejects request | Sync time with server, retry |
| Rate Limit (100600, 100601) | Response code | Exponential backoff |
| Network Timeout | No response | Retry with backoff |
| WebSocket Disconnect | Close event | Reconnect with backoff, resubscribe |
| Order Rejection (100xxx) | Response code | Validate params, check balance |
| Position Error (1005xx) | Response code | Verify position state |

---

## Demo Trading (VST)

BingX provides a demo trading environment using VST (Virtual Simulation Token) for testing strategies without real funds.

### VST Features

- **Virtual Currency**: VST has no real value and cannot be withdrawn
- **Initial Balance**: 100,000 VST for new users
- **Recharge**: Available every 7 days if balance < 20,000 VST
- **Same API**: Uses the same endpoints as production trading

### Demo Mode Implementation

```typescript
class DemoBingxClient extends BingxClient {
  constructor(credentials: ApiCredentials, marketType: MarketType = 'futures') {
    super(credentials, marketType, false, true); // demoMode = true
  }

  async getVSTBalance(): Promise<{ available: number; total: number }> {
    const accountInfo = await this.getAccountInfo();
    const vstBalance = accountInfo.balances.find((b) => b.currency === 'VST');
    
    return {
      available: vstBalance?.available || 0,
      total: vstBalance?.total || 0
    };
  }

  async checkRechargeStatus(): Promise<{
    eligible: boolean;
    currentBalance: number;
    minRequired: number;
  }> {
    const { available } = await this.getVSTBalance();
    
    return {
      eligible: available < 20000,
      currentBalance: available,
      minRequired: 20000
    };
  }
}
```

---

## Official Resources & Repositories

### Documentation
| Resource | URL | Description |
|----------|-----|-------------|
| Official API Docs | https://bingx-api.github.io/docs-v3/#/en/info | Main API documentation |
| API GitHub | https://github.com/BingX-API | Official GitHub organization |
| Rate Limit Info | https://bingx.com/en/support/articles/31103871611289 | Rate limit announcement |

### Official GitHub Repositories
| Repository | Description |
|------------|-------------|
| [BingX-swap-api-doc](https://github.com/BingX-API/BingX-swap-api-doc) | Futures API documentation |
| [BingX-spot-api-doc](https://github.com/BingX-API/BingX-spot-api-doc) | Spot API documentation |
| [BingX-Standard-Contract-doc](https://github.com/BingX-API/BingX-Standard-Contract-doc) | Standard contract docs |

### Community SDKs
| Language | Package | URL |
|----------|---------|-----|
| Node.js | - | https://github.com/ccxt/ccxt |
| Python | `bingx-py` | https://pypi.org/project/bingx-py/ |
| Python | `bingX-connector-python` | https://github.com/Ming119/bingX-connector-python |
| PHP | `bingx-php` | https://github.com/tigusigalpa/bingx-php |
| .NET | `BingX.Net` | https://github.com/JKorf/BingX.Net |
| Multi | `ccxt` | https://github.com/ccxt/ccxt |

---

## SDK Usage Examples

### CCXT Integration

```javascript
import ccxt from 'ccxt';

const exchange = new ccxt.bingx({
  apiKey: 'your-api-key',
  secret: 'your-api-secret'
});

// Fetch balance
const balance = await exchange.fetchBalance();

// Place order
const order = await exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.001, 50000);

// Fetch orderbook
const orderbook = await exchange.fetchOrderBook('BTC/USDT', 20);
```

### Python SDK

```python
from bingx_connector import BingxClient

client = BingxClient(api_key='your-api-key', api_secret='your-api-secret')

# Get balance
balance = client.get_balance()

# Place order
order = client.place_order(
    symbol='BTC-USDT',
    side='BUY',
    type='LIMIT',
    quantity=0.001,
    price=50000
)

# Get positions
positions = client.get_positions()
```

### .NET SDK (BingX.Net)

```csharp
using BingX.Net;

var client = new BingxClient();

// Get ticker
var ticker = await client.GetTickerAsync("BTC-USDT");

// Place order (authenticated)
var client = new BingxClient(new BingxClientOptions {
  ApiCredentials = new ApiCredentials("api-key", "api-secret")
});

var order = await client.PlaceOrderAsync(
  symbol: "BTC-USDT",
  side: OrderSide.Buy,
  type: OrderType.Limit,
  quantity: 0.001m,
  price: 50000m
);
```

---

## Best Practices

1. **Time Synchronization**: Use NTP to sync server time
2. **Timestamp Validation**: Ensure timestamp is within recvWindow
3. **Error Handling**: Implement proper error handling for all API calls
4. **Rate Limiting**: Respect rate limits (10 req/s for trading)
5. **WebSocket Reconnection**: Implement ping/pong and auto-reconnect
6. **Order Management**: Use clientOrderId for idempotency
7. **Security**: Never expose API keys in client-side code
8. **Demo Testing**: Test strategies on demo account (VST) before production

---

## Regional Restrictions

**Important:** API access may be restricted in certain regions. Check BingX's terms of service for current restrictions.
