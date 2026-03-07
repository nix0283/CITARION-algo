# Bitget API Documentation

> Official documentation: https://www.bitget.com/api-doc/common/intro

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

Bitget V2 API provides unified access to all trading products:
- **Spot** - Spot trading with standard and margin accounts
- **Futures (Mix)** - USDT-M and Coin-M perpetual & futures
- **Margin** - Cross and isolated margin trading
- **Copy Trading** - Follow and copy trader strategies
- **Broker** - Broker-specific endpoints for partners

### Base URLs

| Environment | URL |
|------------|-----|
| Mainnet REST | `https://api.bitget.com` |
| Mainnet WebSocket (Public) | `wss://ws.bitget.com/v2/ws/public` |
| Mainnet WebSocket (Private) | `wss://ws.bitget.com/v2/ws/private` |

### API Path Structure

```
/api/v2/{module}/{action}
```

| Module | Description |
|--------|-------------|
| `spot` | Spot trading (market, account, orders) |
| `mix` | Futures trading (USDT-M, Coin-M) |
| `margin` | Margin trading |
| `broker` | Broker endpoints |
| `copy` | Copy trading |
| `earn` | Earn products |
| `uta` | Unified Trading Account |

### Product Types

| Product Type | Description |
|--------------|-------------|
| `SPOT` | Spot trading |
| `USDT-FUTURES` | USDT-Margined perpetual |
| `COIN-FUTURES` | Coin-Margined perpetual |
| `USDC-FUTURES` | USDC-Margined perpetual |

---

## Authentication

### Required Headers

| Header | Description |
|--------|-------------|
| `ACCESS-KEY` | Your API key |
| `ACCESS-SIGN` | Request signature (Base64) |
| `ACCESS-TIMESTAMP` | UTC timestamp in milliseconds |
| `ACCESS-PASSPHRASE` | Your API passphrase |
| `Content-Type` | `application/json` |
| `locale` | Response language (e.g., `en-US`) |

### Signature Generation

Bitget uses HMAC-SHA256 with Base64 encoding:

```typescript
import crypto from 'crypto';

function generateSignature(
  timestamp: string,
  method: string,
  path: string,
  body?: string
): string {
  const message = timestamp + method.toUpperCase() + path + (body || '');
  return crypto
    .createHmac('sha256', apiSecret)
    .update(message)
    .digest('base64');
}
```

### GET Request Example

```typescript
const apiKey = 'your-api-key';
const apiSecret = 'your-api-secret';
const passphrase = 'your-passphrase';

const timestamp = Date.now().toString();
const method = 'GET';
const path = '/api/v2/spot/account/assets';

const signature = generateSignature(timestamp, method, path);

const response = await fetch(`https://api.bitget.com${path}`, {
  headers: {
    'ACCESS-KEY': apiKey,
    'ACCESS-SIGN': signature,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json',
    'locale': 'en-US'
  }
});
```

### POST Request Example

```typescript
const body = {
  symbol: 'BTCUSDT',
  productType: 'USDT-FUTURES',
  marginMode: 'crossed',
  marginCoin: 'USDT',
  size: '0.001',
  side: 'open_long',
  orderType: 'limit',
  price: '50000',
  clientOid: `order_${Date.now()}`
};

const bodyString = JSON.stringify(body);
const timestamp = Date.now().toString();
const method = 'POST';
const path = '/api/v2/mix/order/place-order';

const signature = generateSignature(timestamp, method, path, bodyString);

const response = await fetch('https://api.bitget.com/api/v2/mix/order/place-order', {
  method: 'POST',
  headers: {
    'ACCESS-KEY': apiKey,
    'ACCESS-SIGN': signature,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json',
    'locale': 'en-US'
  },
  body: bodyString
});
```

---

## Market Data Endpoints

### Get Tickers

```
GET /api/v2/spot/market/tickers
GET /api/v2/mix/market/tickers
```

**Spot Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | NO | Trading pair |

**Futures Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| productType | STRING | YES | USDT-FUTURES, COIN-FUTURES |
| symbol | STRING | NO | Symbol name |

**Response:**
```json
{
  "code": "00000",
  "msg": "success",
  "data": [
    {
      "symbol": "BTCUSDT",
      "lastPr": "50000.00",
      "bidPr": "49999.00",
      "askPr": "50001.00",
      "high24h": "51000.00",
      "low24h": "49000.00",
      "baseVolume": "12345.67",
      "quoteVolume": "617283500.00",
      "change24h": "2.5"
    }
  ]
}
```

### Get Orderbook

```
GET /api/v2/spot/market/orderbook
GET /api/v2/mix/market/orderbook
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| limit | STRING | NO | Depth limit (default 100, max 500) |

**Response:**
```json
{
  "code": "00000",
  "msg": "success",
  "data": {
    "asks": [
      ["50001.00", "0.5"],
      ["50002.00", "1.2"]
    ],
    "bids": [
      ["50000.00", "0.8"],
      ["49999.00", "1.5"]
    ],
    "ts": "1672218931000"
  }
}
```

### Get Candlesticks

```
GET /api/v2/spot/market/candles
GET /api/v2/mix/market/candles
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| granularity | STRING | YES | Kline interval |
| startTime | STRING | NO | Start timestamp |
| endTime | STRING | NO | End timestamp |
| limit | STRING | NO | Limit (max 1000) |

**Intervals:**
- Minutes: `1m`, `3m`, `5m`, `15m`, `30m`
- Hours: `1H`, `4H`, `6H`, `12H`
- Days: `1D`, `3D`, `1W`, `1M`

### Get Instruments

```
GET /api/v2/spot/public/symbols
GET /api/v2/mix/market/contracts
```

**Response:**
```json
{
  "code": "00000",
  "msg": "success",
  "data": [
    {
      "symbol": "BTCUSDT",
      "status": "online",
      "baseCoin": "BTC",
      "quoteCoin": "USDT",
      "minTradeAmt": "5",
      "maxTradeAmt": "1000000",
      "minBaseAmt": "0.0001",
      "pricePrecision": 2,
      "quantityPrecision": 4
    }
  ]
}
```

---

## Trading Operations

### Place Order (Spot)

```
POST /api/v2/spot/trade/place-order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| side | STRING | YES | buy, sell |
| orderType | STRING | YES | limit, market |
| size | STRING | YES | Order quantity |
| price | STRING | NO | Price (required for limit) |
| force | STRING | NO | gtc, ioc, foc, post_only |
| clientOid | STRING | NO | Client order ID |

**Response:**
```json
{
  "code": "00000",
  "msg": "success",
  "data": {
    "orderId": "1234567890",
    "clientOid": "my_order_001"
  }
}
```

### Place Order (Futures)

```
POST /api/v2/mix/order/place-order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Symbol name |
| productType | STRING | YES | USDT-FUTURES, COIN-FUTURES |
| marginMode | STRING | YES | crossed, isolated |
| marginCoin | STRING | YES | Margin coin (USDT, BTC) |
| size | STRING | YES | Order quantity |
| side | STRING | YES | open_long, open_short, close_long, close_short |
| orderType | STRING | YES | limit, market |
| price | STRING | NO | Price (required for limit) |
| force | STRING | NO | gtc, ioc, foc, post_only |
| clientOid | STRING | NO | Client order ID |
| reduceOnly | BOOLEAN | NO | Reduce only flag |

### Cancel Order

```
POST /api/v2/spot/trade/cancel-order
POST /api/v2/mix/order/cancel-order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Trading pair |
| orderId | STRING | NO | Order ID |
| clientOid | STRING | NO | Client order ID |

### Cancel All Orders

```
POST /api/v2/spot/trade/cancel-all-orders
POST /api/v2/mix/order/cancel-all-orders
```

### Get Order History

```
GET /api/v2/spot/trade/orderHistory
GET /api/v2/mix/order/orderHistory
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | NO | Trading pair |
| startTime | STRING | NO | Start timestamp |
| endTime | STRING | NO | End timestamp |
| limit | STRING | NO | Limit (max 100) |

---

## Position Management

### Get Positions

```
GET /api/v2/mix/position/all-position
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| productType | STRING | YES | USDT-FUTURES, COIN-FUTURES |
| symbol | STRING | NO | Symbol name |
| marginCoin | STRING | NO | Margin coin |

**Response:**
```json
{
  "code": "00000",
  "msg": "success",
  "data": [
    {
      "symbol": "BTCUSDT",
      "holdSide": "long",
      "total": "0.001",
      "averageOpenPrice": "50000.00",
      "marketPrice": "50100.00",
      "unrealizedPL": "0.10",
      "leverage": "20",
      "marginSize": "2.5",
      "marginCoin": "USDT",
      "liquidationPrice": "45000.00",
      "cTime": "1672218931000",
      "uTime": "1672218931000"
    }
  ]
}
```

### Set Leverage

```
POST /api/v2/mix/account/set-leverage
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Symbol name |
| productType | STRING | YES | USDT-FUTURES, COIN-FUTURES |
| marginCoin | STRING | YES | Margin coin |
| leverage | STRING | YES | Leverage multiplier |

### Set Margin Mode

```
POST /api/v2/mix/account/set-margin-mode
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| symbol | STRING | YES | Symbol name |
| productType | STRING | YES | USDT-FUTURES, COIN-FUTURES |
| marginCoin | STRING | YES | Margin coin |
| marginMode | STRING | YES | crossed, isolated |

---

## Account Management

### Get Account Balance (Spot)

```
GET /api/v2/spot/account/assets
```

**Response:**
```json
{
  "code": "00000",
  "msg": "success",
  "data": [
    {
      "coin": "USDT",
      "available": "10000.00",
      "frozen": "500.00",
      "lock": "0.00"
    }
  ]
}
```

### Get Account Balance (Futures)

```
GET /api/v2/mix/account/accounts
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| productType | STRING | YES | USDT-FUTURES, COIN-FUTURES |
| marginCoin | STRING | NO | Margin coin |

**Response:**
```json
{
  "code": "00000",
  "msg": "success",
  "data": [
    {
      "marginCoin": "USDT",
      "totalEquity": "10000.00",
      "accountAvailable": "9500.00",
      "accountFrozen": "500.00",
      "unrealizedPL": "100.00"
    }
  ]
}
```

---

## WebSocket Streams

### Public WebSocket URL

```
wss://ws.bitget.com/v2/ws/public
```

### Private WebSocket URL

```
wss://ws.bitget.com/v2/ws/private
```

### Connection Example

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('wss://ws.bitget.com/v2/ws/public');

ws.on('open', () => {
  console.log('Connected to Bitget WebSocket');
  
  // Subscribe to channels
  ws.send(JSON.stringify({
    op: 'subscribe',
    args: [
      { instType: 'SPOT', channel: 'books5', instId: 'BTCUSDT' },
      { instType: 'USDT-FUTURES', channel: 'books15', instId: 'BTCUSDT' }
    ]
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Message:', message);
});

// Handle ping/pong (required every 30 seconds)
setInterval(() => {
  ws.send('ping');
}, 25000);
```

### Authentication for Private Channels

```typescript
const apiKey = 'your-api-key';
const apiSecret = 'your-api-secret';
const passphrase = 'your-passphrase';

const timestamp = Date.now().toString();
const signature = crypto
  .createHmac('sha256', apiSecret)
  .update(timestamp + 'GET' + '/user/verify')
  .digest('base64');

ws.send(JSON.stringify({
  op: 'login',
  args: [{
    apiKey,
    passphrase,
    timestamp,
    sign: signature
  }]
}));

// After login success, subscribe to private channels
ws.send(JSON.stringify({
  op: 'subscribe',
  args: [
    { instType: 'USDT-FUTURES', channel: 'positions', instId: 'default' },
    { instType: 'USDT-FUTURES', channel: 'orders', instId: 'default' }
  ]
}));
```

### Available Channels

#### Public Channels

| Channel | Description |
|---------|-------------|
| `books` | Full order book (400 levels) |
| `books5` | Order book (5 levels) |
| `books15` | Order book (15 levels) |
| `books50` | Order book (50 levels) |
| `ticker` | Ticker updates |
| `candle1m` | 1-minute candlesticks |
| `trade` | Trade updates |

#### Private Channels

| Channel | Description |
|---------|-------------|
| `account` | Account balance updates |
| `positions` | Position updates |
| `orders` | Order updates |
| `orders-algo` | Algo order updates |

### Message Format

#### Orderbook Update

```json
{
  "action": "snapshot",
  "arg": {
    "instType": "USDT-FUTURES",
    "channel": "books5",
    "instId": "BTCUSDT"
  },
  "data": {
    "asks": [
      ["50001.00", "0.5", "1"],
      ["50002.00", "1.2", "2"]
    ],
    "bids": [
      ["50000.00", "0.8", "1"],
      ["49999.00", "1.5", "2"]
    ],
    "ts": "1672218931000"
  }
}
```

#### Trade Update

```json
{
  "action": "snapshot",
  "arg": {
    "instType": "USDT-FUTURES",
    "channel": "trade",
    "instId": "BTCUSDT"
  },
  "data": [
    {
      "tradeId": "123456789",
      "instId": "BTCUSDT",
      "price": "50000.00",
      "size": "0.001",
      "side": "buy",
      "ts": "1672218931000"
    }
  ]
}
```

#### Position Update (Private)

```json
{
  "action": "snapshot",
  "arg": {
    "instType": "USDT-FUTURES",
    "channel": "positions",
    "instId": "default"
  },
  "data": [
    {
      "instId": "BTCUSDT",
      "posId": "123456789",
      "marginCoin": "USDT",
      "holdSide": "long",
      "total": "0.001",
      "avgPrice": "50000.00",
      "unrealizedPL": "10.00"
    }
  ]
}
```

---

## Error Codes

### Success Code

| Code | Description |
|------|-------------|
| `00000` | Success |

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `40001` | 400 | ACCESS_KEY cannot be empty |
| `40002` | 400 | ACCESS_SIGN cannot be empty |
| `40003` | 400 | ACCESS_TIMESTAMP cannot be empty |
| `40004` | 400 | ACCESS_PASSPHRASE cannot be empty |
| `40005` | 400 | Invalid ACCESS_KEY |
| `40006` | 400 | Invalid timestamp |
| `40007` | 400 | Invalid signature |
| `40008` | 400 | Invalid passphrase |
| `40009` | 400 | Request expired |
| `40010` | 400 | IP not whitelisted |
| `40011` | 400 | Permission denied |
| `429` | 429 | Too many requests |

### Order Errors

| Code | Description |
|------|-------------|
| `40101` | Invalid order type |
| `40102` | Invalid order side |
| `40103` | Invalid order size |
| `40104` | Invalid order price |
| `40105` | Order not found |
| `40106` | Order already cancelled |
| `40107` | Order already filled |
| `40108` | Insufficient balance |
| `40109` | Order price out of range |
| `40110` | Order size out of range |
| `40111` | Position size exceeds limit |
| `40112` | Reduce only would increase position |

### Position Errors

| Code | Description |
|------|-------------|
| `40201` | Position not found |
| `40202` | Position size is zero |
| `40203` | Position is in liquidation |
| `40204` | Leverage not modified |
| `40205` | Margin mode not modified |

### Rate Limit Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `429` | 429 | Too many requests |
| `43001` | 400 | Rate limit exceeded |

---

## Response Storage

### Recommended Storage Schema

```typescript
interface BitgetApiLogEntry {
  id: string;
  timestamp: Date;
  exchange: 'bitget';
  module: 'spot' | 'mix' | 'margin' | 'broker';
  endpoint: string;
  method: string;
  params: Record<string, any>;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  code: string;
  msg: string;
  data: any;
  responseTime: number;
  error?: {
    code: string;
    msg: string;
    data?: any;
  };
}
```

### Error Response Format

```json
{
  "code": "40108",
  "msg": "Insufficient balance",
  "data": null
}
```

### Implementation Example

```typescript
async function logBitgetResponse(
  module: string,
  endpoint: string,
  method: string,
  params: any,
  response: any,
  error?: any
) {
  await prisma.apiLog.create({
    data: {
      exchange: 'bitget',
      module,
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

Maintaining a local order book via WebSocket is essential for high-frequency trading strategies that require real-time market depth data. Bitget provides multiple depth channels with snapshot and update modes.

### How Order Book WebSocket Works

Bitget's order book stream follows this flow:

1. **Subscribe** to `books`, `books5`, `books15`, or `books50` channel
2. **Receive snapshot** - First message contains full order book state
3. **Receive updates** - Subsequent messages contain changes
4. **Merge updates** - Apply changes to your local order book

### Order Book Channel Comparison

| Channel | Depth | Update Mode | Frequency | Use Case |
|---------|-------|-------------|-----------|----------|
| `books5` | 5 levels | Replace | ~100ms | Simple price display |
| `books15` | 15 levels | Replace | ~100ms | Basic trading |
| `books50` | 50 levels | Replace | ~100ms | Standard trading |
| `books` | 400 levels | Snapshot + Update | ~100ms | Market making |

### Local Order Book Implementation

```typescript
import WebSocket from 'ws';

interface OrderBookLevel {
  price: number;
  size: number;
  numOrders?: number;
}

interface BitgetOrderBookMessage {
  action: 'snapshot' | 'update';
  arg: {
    instType: string;
    channel: string;
    instId: string;
  };
  data: {
    asks: [string, string, string?][];  // [price, size, numOrders?]
    bids: [string, string, string?][];
    ts: string;
    checksum?: number;
    seqId?: number;
  };
}

class BitgetLocalOrderBook {
  private ws: WebSocket | null = null;
  private bids: Map<number, number> = new Map();
  private asks: Map<number, number> = new Map();
  private lastSeqId: number = 0;
  private lastChecksum: number = 0;
  private symbol: string;
  private instType: string;
  private channel: string;
  private isSnapshotReceived: boolean = false;
  private updateBuffer: BitgetOrderBookMessage[] = [];
  private onUpdateCallback: (() => void) | null = null;

  constructor(symbol: string, instType: string = 'USDT-FUTURES', depth: number = 50) {
    this.symbol = symbol;
    this.instType = instType;
    
    // Determine channel based on depth
    if (depth >= 400) {
      this.channel = 'books';
    } else if (depth >= 50) {
      this.channel = 'books50';
    } else if (depth >= 15) {
      this.channel = 'books15';
    } else {
      this.channel = 'books5';
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = 'wss://ws.bitget.com/v2/ws/public';
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log(`[Bitget] Connected to orderbook stream for ${this.symbol}`);
        
        // Subscribe to orderbook
        this.ws!.send(JSON.stringify({
          op: 'subscribe',
          args: [{
            instType: this.instType,
            channel: this.channel,
            instId: this.symbol
          }]
        }));
        
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          // Handle ping/pong
          if (data.toString() === 'pong') return;
          
          const message = JSON.parse(data.toString()) as BitgetOrderBookMessage;
          
          if (message.arg?.channel?.startsWith('books')) {
            this.handleMessage(message);
          }
        } catch (error) {
          console.error('[Bitget] Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[Bitget] WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[Bitget] WebSocket connection closed');
        this.handleReconnect();
      });

      // Setup ping interval (Bitget requires ping every 30 seconds)
      this.setupPing();
    });
  }

  private pingInterval: NodeJS.Timeout | null = null;

  private setupPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 25000);
  }

  private handleMessage(message: BitgetOrderBookMessage): void {
    const { action, data } = message;
    
    if (action === 'snapshot') {
      this.processSnapshot(data);
      this.isSnapshotReceived = true;
      
      // Process buffered updates
      this.processBufferedUpdates();
    } else if (action === 'update') {
      if (!this.isSnapshotReceived) {
        // Buffer until snapshot received (for books channel)
        if (this.channel === 'books') {
          this.updateBuffer.push(message);
        }
        return;
      }
      
      this.processUpdate(data);
    }
    
    if (this.onUpdateCallback) {
      this.onUpdateCallback();
    }
  }

  private processSnapshot(data: any): void {
    this.bids.clear();
    this.asks.clear();
    
    // Process bids
    for (const [price, size] of data.bids) {
      const p = parseFloat(price);
      const s = parseFloat(size);
      if (s > 0) {
        this.bids.set(p, s);
      }
    }
    
    // Process asks
    for (const [price, size] of data.asks) {
      const p = parseFloat(price);
      const s = parseFloat(size);
      if (s > 0) {
        this.asks.set(p, s);
      }
    }
    
    this.lastSeqId = data.seqId || 0;
    this.lastChecksum = data.checksum || 0;
    
    console.log(`[Bitget] Snapshot received: ${this.bids.size} bids, ${this.asks.size} asks`);
  }

  private processUpdate(data: any): void {
    // Check sequence for books channel
    if (this.channel === 'books' && data.seqId) {
      if (data.seqId <= this.lastSeqId) {
        console.warn(`[Bitget] Stale update: seqId=${data.seqId}, lastSeqId=${this.lastSeqId}`);
        return;
      }
      
      // Check for gap
      if (data.seqId > this.lastSeqId + 1 && this.lastSeqId > 0) {
        console.warn(`[Bitget] Sequence gap detected, resubscribing`);
        this.resubscribe();
        return;
      }
    }
    
    // Apply bid updates
    for (const [price, size] of data.bids) {
      const p = parseFloat(price);
      const s = parseFloat(size);
      
      if (s === 0) {
        this.bids.delete(p);
      } else {
        this.bids.set(p, s);
      }
    }
    
    // Apply ask updates
    for (const [price, size] of data.asks) {
      const p = parseFloat(price);
      const s = parseFloat(size);
      
      if (s === 0) {
        this.asks.delete(p);
      } else {
        this.asks.set(p, s);
      }
    }
    
    this.lastSeqId = data.seqId || this.lastSeqId;
    this.lastChecksum = data.checksum || this.lastChecksum;
  }

  private processBufferedUpdates(): void {
    for (const update of this.updateBuffer) {
      this.processUpdate(update.data);
    }
    this.updateBuffer = [];
  }

  private async resubscribe(): Promise<void> {
    console.log('[Bitget] Resubscribing to orderbook...');
    this.isSnapshotReceived = false;
    this.updateBuffer = [];
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        op: 'unsubscribe',
        args: [{
          instType: this.instType,
          channel: this.channel,
          instId: this.symbol
        }]
      }));
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{
          instType: this.instType,
          channel: this.channel,
          instId: this.symbol
        }]
      }));
    }
  }

  private async handleReconnect(): Promise<void> {
    console.log('[Bitget] Reconnecting in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    this.isSnapshotReceived = false;
    this.updateBuffer = [];
    await this.connect();
  }

  onUpdate(callback: () => void): void {
    this.onUpdateCallback = callback;
  }

  getBids(limit?: number): OrderBookLevel[] {
    const sorted = Array.from(this.bids.entries())
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => b.price - a.price);
    
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getAsks(limit?: number): OrderBookLevel[] {
    const sorted = Array.from(this.asks.entries())
      .map(([price, size]) => ({ price, size }))
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
    
    const bidVolume = bids.reduce((sum, b) => sum + b.size, 0);
    const askVolume = asks.reduce((sum, a) => sum + a.size, 0);
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
  const orderBook = new BitgetLocalOrderBook('BTCUSDT', 'USDT-FUTURES', 50);
  
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

### Best Practices for Order Book Management

1. **Channel Selection**: Use `books5`/`books15` for simple display, `books` for algorithmic trading
2. **Sequence Validation**: For `books` channel, validate seqId to detect gaps
3. **Ping/Pong**: Send ping every 25-30 seconds to keep connection alive
4. **Buffer Updates**: Buffer updates until snapshot is received (for `books` channel)
5. **Handle Reconnection**: Re-subscribe if sequence gap is detected
6. **Memory Management**: Periodically clean up stale price levels

---

## Rate Limit Best Practices

Bitget implements multi-level rate limits to ensure platform stability. Understanding and respecting these limits is crucial for building reliable trading applications.

### Rate Limit Types

| Limit Type | Scope | Default Limit | Window |
|------------|-------|---------------|--------|
| Public IP | Per IP | 20 requests | 1 second |
| Private Account | Per User | Varies | 1 second |
| Order | Per User | 60 requests | 1 second |
| WebSocket Connection | Per IP | 30 connections | - |
| WebSocket Subscription | Per Connection | 240 channels | - |

### Endpoint-Specific Rate Limits

| Endpoint | Rate Limit | Notes |
|----------|------------|-------|
| `/api/v2/spot/trade/place-order` | 60 req/s | Per user |
| `/api/v2/mix/order/place-order` | 60 req/s | Per user |
| `/api/v2/spot/market/*` | 20 req/s | Per IP |
| `/api/v2/mix/market/*` | 20 req/s | Per IP |
| `/api/v2/spot/account/*` | 10 req/s | Per user |
| `/api/v2/mix/account/*` | 10 req/s | Per user |

### VIP Rate Limits

| Level | Order Limit | Account Limit |
|-------|-------------|---------------|
| Default | 60 req/s | 10 req/s |
| PRO 1-2 | 120 req/s | 20 req/s |
| PRO 3-5 | 160 req/s | 30 req/s |
| PRO 6 | 200 req/s | 40 req/s |

### Rate Limiter Implementation

```typescript
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  minInterval: number;
}

class BitgetRateLimiter {
  private requests: number[] = [];
  private config: RateLimitConfig;
  private lastRequestTime: number = 0;

  constructor(config: RateLimitConfig = { maxRequests: 20, windowMs: 1000, minInterval: 50 }) {
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
class RateLimitedBitgetClient {
  private rateLimiter: BitgetRateLimiter;
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private passphrase: string;

  constructor(apiKey: string, apiSecret: string, passphrase: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.passphrase = passphrase;
    this.baseUrl = 'https://api.bitget.com';
    this.rateLimiter = new BitgetRateLimiter();
  }

  async request(method: 'GET' | 'POST', path: string, params: any = {}): Promise<any> {
    await this.rateLimiter.waitForSlot();

    const timestamp = Date.now().toString();
    let url = `${this.baseUrl}${path}`;
    let body: string | undefined;
    let signPath = path;

    if (method === 'GET' && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
      signPath += `?${queryString}`;
    } else if (method === 'POST') {
      body = JSON.stringify(params);
    }

    const signature = this.generateSignature(timestamp, method, signPath, body);

    const response = await fetch(url, {
      method,
      headers: {
        'ACCESS-KEY': this.apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': this.passphrase,
        'Content-Type': 'application/json',
        'locale': 'en-US'
      },
      body
    });

    if (response.status === 429) {
      throw new RateLimitError('Rate limit exceeded');
    }

    const data = await response.json();

    if (data.code !== '00000') {
      throw new BitgetApiError(data.code, data.msg);
    }

    return data.data;
  }

  private generateSignature(timestamp: string, method: string, path: string, body?: string): string {
    const crypto = require('crypto');
    const message = timestamp + method.toUpperCase() + path + (body || '');
    return crypto.createHmac('sha256', this.apiSecret).update(message).digest('base64');
  }
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

class BitgetApiError extends Error {
  public code: string;
  
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BitgetApiError';
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
      
      if (error instanceof RateLimitError) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[Bitget] Rate limited. Waiting ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (error instanceof BitgetApiError && error.code === '429') {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[Bitget] Too many requests. Waiting ${delay}ms`);
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

1. **Use WebSocket for Market Data**: WebSocket subscriptions don't count toward REST rate limits
2. **Batch Operations**: Use batch order endpoints when possible
3. **Monitor Usage**: Track remaining requests and adjust behavior
4. **Implement Backoff**: Use exponential backoff for rate limit errors
5. **Distribute Load**: Spread requests evenly rather than in bursts
6. **Cache Responses**: Cache infrequently changing data
7. **Upgrade VIP**: Higher VIP levels get increased rate limits

---

## Error Recovery Patterns

Robust error handling is essential for production trading systems. This section covers common error scenarios and recovery strategies for Bitget API.

### Error Categories

| Category | Error Codes | Recovery Strategy |
|----------|-------------|-------------------|
| Network | Timeout, Connection Reset | Retry with backoff |
| Rate Limit | 429, 43001 | Exponential backoff |
| Authentication | 40001-40011 | Check credentials |
| Order | 40101-40112 | Validate order params |
| Position | 40201-40205 | Check position state |

### Error Handler Implementation

```typescript
interface BitgetError {
  code: string;
  message: string;
  retriable: boolean;
  category: 'network' | 'rate_limit' | 'auth' | 'order' | 'position' | 'unknown';
}

class BitgetErrorHandler {
  private errorPatterns: Map<string, BitgetError> = new Map([
    // Authentication errors
    ['40001', { code: '40001', message: 'ACCESS_KEY cannot be empty', retriable: false, category: 'auth' }],
    ['40005', { code: '40005', message: 'Invalid ACCESS_KEY', retriable: false, category: 'auth' }],
    ['40006', { code: '40006', message: 'Invalid timestamp', retriable: true, category: 'auth' }],
    ['40007', { code: '40007', message: 'Invalid signature', retriable: false, category: 'auth' }],
    ['40008', { code: '40008', message: 'Invalid passphrase', retriable: false, category: 'auth' }],
    ['40009', { code: '40009', message: 'Request expired', retriable: true, category: 'auth' }],
    ['40010', { code: '40010', message: 'IP not whitelisted', retriable: false, category: 'auth' }],
    ['40011', { code: '40011', message: 'Permission denied', retriable: false, category: 'auth' }],
    
    // Rate limit errors
    ['429', { code: '429', message: 'Too many requests', retriable: true, category: 'rate_limit' }],
    ['43001', { code: '43001', message: 'Rate limit exceeded', retriable: true, category: 'rate_limit' }],
    
    // Order errors
    ['40101', { code: '40101', message: 'Invalid order type', retriable: false, category: 'order' }],
    ['40102', { code: '40102', message: 'Invalid order side', retriable: false, category: 'order' }],
    ['40103', { code: '40103', message: 'Invalid order size', retriable: false, category: 'order' }],
    ['40104', { code: '40104', message: 'Invalid order price', retriable: false, category: 'order' }],
    ['40105', { code: '40105', message: 'Order not found', retriable: false, category: 'order' }],
    ['40108', { code: '40108', message: 'Insufficient balance', retriable: false, category: 'order' }],
    ['40109', { code: '40109', message: 'Order price out of range', retriable: false, category: 'order' }],
    ['40110', { code: '40110', message: 'Order size out of range', retriable: false, category: 'order' }],
    ['40111', { code: '40111', message: 'Position size exceeds limit', retriable: false, category: 'position' }],
    ['40112', { code: '40112', message: 'Reduce only would increase position', retriable: false, category: 'order' }],
    
    // Position errors
    ['40201', { code: '40201', message: 'Position not found', retriable: false, category: 'position' }],
    ['40202', { code: '40202', message: 'Position size is zero', retriable: false, category: 'position' }],
    ['40203', { code: '40203', message: 'Position is in liquidation', retriable: false, category: 'position' }],
  ]);

  analyzeError(code: string, message: string): BitgetError {
    const known = this.errorPatterns.get(code);
    if (known) return known;
    
    return {
      code,
      message,
      retriable: false,
      category: 'unknown'
    };
  }

  shouldRetry(error: BitgetError): boolean {
    return error.retriable;
  }

  getRecoveryAction(error: BitgetError): string {
    switch (error.category) {
      case 'network':
        return 'Retry with exponential backoff';
      case 'rate_limit':
        return 'Wait and retry with backoff';
      case 'auth':
        if (error.code === '40006' || error.code === '40009') {
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

### Resilient Client with Error Recovery

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

class ResilientBitgetClient {
  private errorHandler: BitgetErrorHandler;
  private retryConfig: RetryConfig;
  private timeOffset: number = 0;

  constructor(
    private client: RateLimitedBitgetClient,
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.errorHandler = new BitgetErrorHandler();
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
      const response = await fetch('https://api.bitget.com/api/v2/public/time');
      const data = await response.json();
      const serverTime = parseInt(data.data.serverTime);
      const localTime = Date.now();
      this.timeOffset = serverTime - localTime;
      
      if (Math.abs(this.timeOffset) > 1000) {
        console.warn(`[Bitget] Time offset detected: ${this.timeOffset}ms`);
      }
    } catch (error) {
      console.error('[Bitget] Failed to sync time:', error);
    }
  }

  async request<T>(method: 'GET' | 'POST', path: string, params: any = {}): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.client.request(method, path, params) as T;
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof BitgetApiError) {
          const analyzed = this.errorHandler.analyzeError(error.code, error.message);
          
          console.error(`[Bitget] API Error (${analyzed.category}): ${error.message} [code: ${error.code}]`);
          
          if (!analyzed.retriable || attempt === this.retryConfig.maxRetries) {
            throw error;
          }
          
          // Handle timestamp errors
          if (error.code === '40006' || error.code === '40009') {
            await this.syncTime();
            continue;
          }
          
          const delay = Math.min(
            this.retryConfig.baseDelayMs * Math.pow(2, attempt),
            this.retryConfig.maxDelayMs
          );
          
          console.log(`[Bitget] Retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (error instanceof RateLimitError) {
          const delay = Math.min(1000 * Math.pow(2, attempt), this.retryConfig.maxDelayMs);
          console.log(`[Bitget] Rate limited. Retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          if (attempt === this.retryConfig.maxRetries) {
            throw error;
          }
          
          const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
          console.log(`[Bitget] Network error. Retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  async placeOrder(params: {
    symbol: string;
    side: 'buy' | 'sell' | 'open_long' | 'open_short' | 'close_long' | 'close_short';
    orderType: 'limit' | 'market';
    size: string;
    price?: string;
    productType?: string;
  }): Promise<{ orderId: string; clientOid: string }> {
    try {
      const isFutures = params.productType && params.productType !== 'SPOT';
      const endpoint = isFutures ? '/api/v2/mix/order/place-order' : '/api/v2/spot/trade/place-order';
      
      const orderParams: any = {
        symbol: params.symbol,
        side: params.side,
        orderType: params.orderType,
        size: params.size,
        clientOid: `bot_${Date.now()}`
      };
      
      if (params.price && params.orderType === 'limit') {
        orderParams.price = params.price;
      }
      
      if (isFutures) {
        orderParams.productType = params.productType || 'USDT-FUTURES';
        orderParams.marginMode = 'crossed';
        orderParams.marginCoin = 'USDT';
      }
      
      return await this.request('POST', endpoint, orderParams);
    } catch (error) {
      if (error instanceof BitgetApiError) {
        switch (error.code) {
          case '40108':
            throw new OrderError('Insufficient balance', 'INSUFFICIENT_BALANCE');
          case '40109':
            throw new OrderError('Price out of range', 'PRICE_RANGE');
          case '40110':
            throw new OrderError('Size out of range', 'SIZE_RANGE');
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
class ResilientBitgetWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: any[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private pingInterval: NodeJS.Timeout | null = null;
  private isAuthenticated: boolean = false;

  constructor(
    private url: string,
    private apiKey?: string,
    private apiSecret?: string,
    private passphrase?: string
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.on('open', () => {
          console.log('[Bitget WS] Connected');
          this.reconnectAttempts = 0;
          this.startPing();
          
          if (this.apiKey && this.apiSecret) {
            this.authenticate();
          } else {
            this.resubscribe();
            resolve();
          }
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data, resolve);
        });

        this.ws.on('error', (error) => {
          console.error('[Bitget WS] Error:', error);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('[Bitget WS] Connection closed');
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
        this.ws.send('ping');
      }
    }, 25000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private authenticate(): void {
    const timestamp = Date.now().toString();
    const signature = require('crypto')
      .createHmac('sha256', this.apiSecret!)
      .update(timestamp + 'GET' + '/user/verify')
      .digest('base64');

    this.ws!.send(JSON.stringify({
      op: 'login',
      args: [{
        apiKey: this.apiKey,
        passphrase: this.passphrase,
        timestamp,
        sign: signature
      }]
    }));
  }

  private handleMessage(data: Buffer, resolve?: Function): void {
    if (data.toString() === 'pong') return;
    
    try {
      const message = JSON.parse(data.toString());
      
      if (message.op === 'login') {
        if (message.code === '00000') {
          console.log('[Bitget WS] Authenticated');
          this.isAuthenticated = true;
          this.resubscribe();
          if (resolve) resolve();
        } else {
          console.error('[Bitget WS] Authentication failed:', message);
        }
        return;
      }
      
      if (message.op === 'subscribe') {
        console.log('[Bitget WS] Subscribed:', message);
        return;
      }
      
      if (message.arg?.channel) {
        this.emit(message.arg.channel, message);
      }
    } catch (error) {
      console.error('[Bitget WS] Parse error:', error);
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Bitget WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[Bitget WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(err => {
        console.error('[Bitget WS] Reconnection failed:', err);
      });
    }, delay);
  }

  private resubscribe(): void {
    if (this.subscriptions.length === 0) return;
    
    this.ws!.send(JSON.stringify({
      op: 'subscribe',
      args: this.subscriptions
    }));
  }

  subscribe(args: any[]): void {
    this.subscriptions.push(...args);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        op: 'subscribe',
        args
      }));
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
| Timestamp Error (40006, 40009) | Server rejects request | Sync time with server, retry |
| Rate Limit (429, 43001) | Response code | Exponential backoff |
| Network Timeout | No response | Retry with backoff |
| WebSocket Disconnect | Close event | Reconnect with backoff, resubscribe |
| Order Rejection (40xxx) | Response code | Validate params, check balance |
| Position Error (402xx) | Response code | Verify position state |

---

## Official Resources & Repositories

### Documentation
| Resource | URL | Description |
|----------|-----|-------------|
| Official Docs | https://www.bitget.com/api-doc/common/intro | Main API documentation |
| Spot API | https://www.bitget.com/api-doc/spot/intro | Spot trading API |
| Futures API | https://www.bitget.com/api-doc/contract/intro | Futures trading API |
| Margin API | https://www.bitget.com/api-doc/margin/intro | Margin trading API |
| Broker API | https://www.bitget.com/api-doc/broker/intro | Broker endpoints |
| UTA API | https://www.bitget.com/api-doc/uta/intro | Unified Trading Account |
| Error Codes | https://www.bitget.com/api-doc/uta/error | Complete error reference |

### Official SDKs
| Language | Package | Repository |
|----------|---------|------------|
| Java | Official | https://github.com/BitgetLimited/v3-bitget-api-sdk (Java module) |
| Python | `bitget-python-connector` | https://github.com/BitgetLimited/v3-bitget-api-sdk (Python module) |
| Node.js | Official | https://github.com/BitgetLimited/v3-bitget-api-sdk (Node module) |
| Go | `bitget-api-sdk-go` | https://github.com/BitgetLimited/v3-bitget-api-sdk (Go module) |

### Community SDKs
| Language | Package | URL |
|----------|---------|-----|
| Node.js | `bitget-api` | https://www.npmjs.com/package/bitget-api |
| Python | `python-bitget` | https://pypi.org/project/python-bitget/ |
| CCXT | `ccxt` | https://github.com/ccxt/ccxt |

---

## Official SDKs - Detailed Usage

### Node.js SDK (bitget-api by tiagosiebler)

**Installation:**
```bash
npm install bitget-api
```

**REST API Usage:**
```typescript
import { RestClient } from 'bitget-api';

const client = new RestClient({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  passphrase: 'your-passphrase'
});

// Get tickers
const tickers = await client.spotGetTickers({ symbol: 'BTCUSDT' });

// Place spot order
const order = await client.spotPlaceOrder({
  symbol: 'BTCUSDT',
  side: 'buy',
  orderType: 'limit',
  size: '0.001',
  price: '50000'
});

// Place futures order
const futuresOrder = await client.mixPlaceOrder({
  symbol: 'BTCUSDT',
  productType: 'USDT-FUTURES',
  marginMode: 'crossed',
  marginCoin: 'USDT',
  size: '0.001',
  side: 'open_long',
  orderType: 'limit',
  price: '50000'
});
```

**WebSocket Usage:**
```typescript
import { WebsocketClient } from 'bitget-api';

const ws = new WebsocketClient({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  passphrase: 'your-passphrase'
});

// Public channels
ws.subscribe({
  instType: 'USDT-FUTURES',
  channel: 'books5',
  instId: 'BTCUSDT'
});

// Private channels (auto-authenticated)
ws.subscribe({
  instType: 'USDT-FUTURES',
  channel: 'positions',
  instId: 'default'
});

ws.on('update', (data) => {
  console.log('Update:', data);
});

ws.on('error', (error) => {
  console.error('Error:', error);
});
```

### Python SDK

**Installation:**
```bash
pip install bitget-python-connector
```

**Usage:**
```python
from bitget import BitgetApi

api = BitgetApi(
    api_key='your-api-key',
    api_secret='your-api-secret',
    passphrase='your-passphrase'
)

# Get tickers
tickers = api.get('/api/v2/spot/market/tickers', {'symbol': 'BTCUSDT'})

# Place order
order = api.post('/api/v2/spot/trade/place-order', {
    'symbol': 'BTCUSDT',
    'side': 'buy',
    'orderType': 'limit',
    'size': '0.001',
    'price': '50000'
})
```

### CCXT Integration

```javascript
import ccxt from 'ccxt';

const exchange = new ccxt.bitget({
  apiKey: 'your-api-key',
  secret: 'your-api-secret',
  password: 'your-passphrase'
});

// Fetch balance
const balance = await exchange.fetchBalance();

// Place order
const order = await exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.001, 50000);

// Fetch orderbook
const orderbook = await exchange.fetchOrderBook('BTC/USDT', 50);
```

---

## Demo Trading

Bitget provides a demo trading environment for testing strategies without real funds.

### Demo Mode Features

- Same API endpoints as production
- Symbols prefixed with "S" (e.g., `SBTCUSDT`)
- Virtual balance: 50,000 SUSDT (rechargeable every 72 hours)
- All trading features available

### Demo Mode Implementation

```typescript
class DemoBitgetClient extends BitgetClient {
  constructor(credentials: ApiCredentials, marketType: MarketType = 'futures') {
    super(credentials, marketType, false, true); // demoMode = true
  }

  private getDemoSymbol(symbol: string): string {
    // Convert BTCUSDT -> SBTCUSDT for demo
    return symbol.startsWith('S') ? symbol : 'S' + symbol;
  }

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const demoParams = {
      ...params,
      symbol: this.getDemoSymbol(params.symbol)
    };
    
    return super.createOrder(demoParams);
  }
}
```

---

## Best Practices

1. **Time Synchronization**: Use NTP to sync server time, allow for ±1 second offset
2. **Error Handling**: Implement proper error handling for all API calls
3. **Rate Limiting**: Respect rate limits, use exponential backoff
4. **WebSocket Reconnection**: Implement ping/pong and auto-reconnect
5. **Order Management**: Use `clientOid` for idempotency
6. **Security**: Never expose API keys in client-side code
7. **Demo Testing**: Test strategies on demo account before production

---

## Regional Restrictions

**Important:** API access may be restricted in certain regions. Check Bitget's terms of service for current restrictions.
