# Bybit API Documentation

> Official documentation: https://bybit-exchange.github.io/docs/

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

Bybit V5 API unifies all product lines into a single API specification:
- **Spot** - Spot trading
- **Linear** - USDT/USDC Perpetual and Futures
- **Inverse** - Inverse Perpetual and Futures
- **Option** - Options trading

### Base URLs

| Environment | URL |
|------------|-----|
| Mainnet | `https://api.bybit.com` |
| Mainnet (Alternative) | `https://api.bytick.com` |
| Testnet | `https://api-testnet.bybit.com` |
| Netherlands | `https://api.bybit.nl` |
| Turkey | `https://api.bybit-tr.com` |
| Kazakhstan | `https://api.bybit.kz` |
| Georgia | `https://api.bybitgeorgia.ge` |
| UAE | `https://api.bybit.ae` |
| EEA | `https://api.bybit.eu` |
| Indonesia | `https://api.bybit.id` |

### API Path Structure

```
{host}/{version}/{product}/{module}
```

| Path Segment | Description |
|--------------|-------------|
| `v5/market/` | Market data, orderbook, ticker, candles |
| `v5/order/` | Order management |
| `v5/position/` | Position management |
| `v5/account/` | Account operations |
| `v5/asset/` | Asset management across accounts |
| `v5/spot-lever-token/` | Leveraged tokens |
| `v5/spot-margin-trade/` | Margin trading |

### Category Parameter

All V5 endpoints use `category` parameter to distinguish product types:

| Category | Description |
|----------|-------------|
| `spot` | Spot trading |
| `linear` | USDT/USDC Perpetual & Futures |
| `inverse` | Inverse Perpetual & Futures |
| `option` | Options trading |

---

## Authentication

### API Key Types

1. **HMAC Keys**: System-generated keys with HMAC signature
2. **RSA Keys**: Self-generated keys with RSA signature

### Required Headers

| Header | Description |
|--------|-------------|
| `X-BAPI-API-KEY` | Your API key |
| `X-BAPI-TIMESTAMP` | UTC timestamp in milliseconds |
| `X-BAPI-SIGN` | Request signature |
| `X-BAPI-RECV-WINDOW` | Request validity window (default 5000ms) |

### HMAC Signature Generation

```typescript
import crypto from 'crypto';

function generateSignature(
  timestamp: string,
  apiKey: string,
  recvWindow: string,
  queryString: string,
  secretKey: string
): string {
  const signString = timestamp + apiKey + recvWindow + queryString;
  return crypto
    .createHmac('sha256', secretKey)
    .update(signString)
    .digest('hex');
}
```

### GET Request Example

```typescript
const apiKey = 'your-api-key';
const secretKey = 'your-secret-key';
const timestamp = Date.now().toString();
const recvWindow = '5000';

const params = {
  category: 'linear',
  symbol: 'BTCUSDT',
  timestamp: timestamp
};

const queryString = Object.entries(params)
  .map(([k, v]) => `${k}=${v}`)
  .join('&');

const signature = generateSignature(
  timestamp,
  apiKey,
  recvWindow,
  queryString,
  secretKey
);

const response = await fetch(
  `https://api.bybit.com/v5/order/realtime?${queryString}`,
  {
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'X-BAPI-RECV-WINDOW': recvWindow
    }
  }
);
```

### POST Request Example

```typescript
const body = {
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'Buy',
  orderType: 'Limit',
  qty: '0.001',
  price: '50000'
};

const timestamp = Date.now().toString();
const recvWindow = '5000';
const bodyString = JSON.stringify(body);

const signature = generateSignature(
  timestamp,
  apiKey,
  recvWindow,
  bodyString,
  secretKey
);

const response = await fetch('https://api.bybit.com/v5/order/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow
  },
  body: bodyString
});
```

### RSA Signature (Advanced)

```typescript
import crypto from 'crypto';

function generateRSASignature(
  timestamp: string,
  apiKey: string,
  recvWindow: string,
  queryString: string,
  privateKey: string
): string {
  const signString = timestamp + apiKey + recvWindow + queryString;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signString);
  return sign.sign(privateKey, 'base64');
}
```

---

## Market Data Endpoints

### Query Kline

```
GET /v5/market/kline
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | YES | Symbol name |
| interval | STRING | YES | Kline interval |
| start | NUMBER | NO | Start timestamp |
| end | NUMBER | NO | End timestamp |
| limit | NUMBER | NO | Limit (default 200, max 1000) |

**Intervals:**
- Minutes: `1`, `3`, `5`, `15`, `30`, `60`
- Hours: `120`, `240`, `360`, `720`
- Days: `D`
- Weeks: `W`
- Months: `M`

**Response:**
```json
{
  "retCode": 0,
  "retMsg": "OK",
  "result": {
    "symbol": "BTCUSDT",
    "category": "linear",
    "list": [
      [
        "1670608800",   // Open time
        "17071",        // Open price
        "17073",        // High price
        "16861",        // Low price
        "17027",        // Close price
        "25871200",     // Volume
        "1700691599"    // Close time
      ]
    ]
  }
}
```

### Query Mark Price Kline

```
GET /v5/market/mark-price-kline
```

### Query Orderbook

```
GET /v5/market/orderbook
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | YES | Symbol name |
| limit | NUMBER | NO | Limit (default 25, max 500) |

**Response:**
```json
{
  "retCode": 0,
  "retMsg": "OK",
  "result": {
    "s": "BTCUSDT",
    "a": [
      ["17026.50", "9"],
      ["17027.00", "4"]
    ],
    "b": [
      ["17026.00", "2"],
      ["17025.50", "5"]
    ]
  }
}
```

### Query Ticker

```
GET /v5/market/tickers
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | NO | Symbol name (optional) |

**Response:**
```json
{
  "retCode": 0,
  "retMsg": "OK",
  "result": {
    "category": "linear",
    "list": [
      {
        "symbol": "BTCUSDT",
        "lastPrice": "17026.50",
        "indexPrice": "17023.10",
        "markPrice": "17024.65",
        "prevPrice24h": "16932.00",
        "price24hPcnt": "0.0056",
        "highPrice24h": "17145.50",
        "lowPrice24h": "16679.00",
        "volume24h": "98388.798",
        "turnover24h": "1673620098.33"
      }
    ]
  }
}
```

### Get Instruments Info

```
GET /v5/market/instruments-info
```

**Response:**
```json
{
  "retCode": 0,
  "retMsg": "OK",
  "result": {
    "category": "linear",
    "list": [
      {
        "symbol": "BTCUSDT",
        "contractType": "LinearPerpetual",
        "status": "Trading",
        "baseCoin": "BTC",
        "quoteCoin": "USDT",
        "settleCoin": "USDT",
        "lotSizeFilter": {
          "basePrecision": "0.001",
          "quotePrecision": "0.01",
          "minOrderQty": "0.001",
          "maxOrderQty": "100",
          "minOrderAmt": "5",
          "maxOrderAmt": "1000000"
        },
        "priceFilter": {
          "minPrice": "0.1",
          "maxPrice": "999999.9",
          "tickSize": "0.1"
        }
      }
    ]
  }
}
```

---

## Trading Operations

### Place Order

```
POST /v5/order/create
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | YES | Symbol name |
| side | STRING | YES | Buy, Sell |
| orderType | STRING | YES | Market, Limit |
| qty | STRING | YES | Order quantity |
| price | STRING | NO | Order price (required for Limit) |
| timeInForce | STRING | NO | GoodTilCancel, ImmediateOrCancel, FillOrKill, PostOnly |
| orderLinkId | STRING | NO | Client order ID |
| takeProfit | STRING | NO | Take profit price |
| stopLoss | STRING | NO | Stop loss price |
| reduceOnly | BOOLEAN | NO | Reduce position only |
| closeOnTrigger | BOOLEAN | NO | Close on trigger |
| positionIdx | NUMBER | NO | Position index |

**Response:**
```json
{
  "retCode": 0,
  "retMsg": "OK",
  "result": {
    "orderId": "1321003749380418816",
    "orderLinkId": "spot-003"
  }
}
```

### Amend Order

```
POST /v5/order/amend
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | YES | Symbol name |
| orderId | STRING | NO | Order ID |
| orderLinkId | STRING | NO | Client order ID |
| price | STRING | NO | New price |
| qty | STRING | NO | New quantity |

### Cancel Order

```
POST /v5/order/cancel
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | YES | Symbol name |
| orderId | STRING | NO | Order ID |
| orderLinkId | STRING | NO | Client order ID |

### Cancel All Orders

```
POST /v5/order/cancel-all
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | NO | Symbol name (optional for cancel all) |
| stopOrderType | STRING | NO | Stop order type filter |
| settleCoin | STRING | NO | Cancel by settle coin (Derivatives only) |

### Query Order

```
GET /v5/order/realtime
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | NO | Symbol name |
| orderId | STRING | NO | Order ID |
| orderLinkId | STRING | NO | Client order ID |

**Response:**
```json
{
  "retCode": 0,
  "retMsg": "OK",
  "result": {
    "category": "linear",
    "nextPageCursor": "",
    "list": [
      {
        "orderId": "1321003749380418816",
        "orderLinkId": "spot-003",
        "symbol": "BTCUSDT",
        "side": "Buy",
        "orderType": "Limit",
        "price": "50000",
        "qty": "0.001",
        "orderStatus": "New",
        "createdTime": "1672218931000",
        "updatedTime": "1672218931000"
      }
    ]
  }
}
```

### Query Order History

```
GET /v5/order/history
```

### Query Execution List

```
GET /v5/execution/list
```

---

## Position Management

### Query Position

```
GET /v5/position/list
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| category | STRING | YES | Product type |
| symbol | STRING | NO | Symbol name |
| baseCoin | STRING | NO | Base coin |
| settleCoin | STRING | NO | Settle coin |

**Response:**
```json
{
  "retCode": 0,
  "retMsg": "OK",
  "result": {
    "category": "linear",
    "nextPageCursor": "",
    "list": [
      {
        "symbol": "BTCUSDT",
        "side": "Buy",
        "size": "0.001",
        "avgPrice": "50000",
        "positionValue": "50",
        "unrealisedPnl": "-0.5",
        "cumRealisedPnl": "0",
        "createdTime": "1672218931000",
        "updatedTime": "1672218931000",
        "tpTriggerBy": "",
        "slTriggerBy": "",
        "riskId": 1,
        "takeProfit": "55000",
        "stopLoss": "45000",
        "trailingStop": "1000",
        "positionIdx": 0
      }
    ]
  }
}
```

### Set Trading Stop

```
POST /v5/position/trading-stop
```

### Set Leverage

```
POST /v5/position/set-leverage
```

---

## Account Management

### Query Wallet Balance

```
GET /v5/account/wallet-balance
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| accountType | STRING | YES | UNIFIED, CONTRACT, SPOT |
| coin | STRING | NO | Coin name |

**Response:**
```json
{
  "retCode": 0,
  "retMsg": "OK",
  "result": {
    "list": [
      {
        "accountType": "UNIFIED",
        "totalEquity": "1000.5",
        "totalWalletBalance": "950.0",
        "totalAvailableBalance": "950.0",
        "coin": [
          {
            "coin": "USDT",
            "equity": "950.0",
            "walletBalance": "950.0",
            "availableToWithdraw": "950.0"
          }
        ]
      }
    ]
  }
}
```

### Query Fee Rate

```
GET /v5/account/fee-rate
```

---

## WebSocket Streams

### Public WebSocket URL

```
wss://stream.bybit.com/v5/public/spot
wss://stream.bybit.com/v5/public/linear
wss://stream.bybit.com/v5/public/inverse
wss://stream.bybit.com/v5/public/option
```

### Private WebSocket URL

```
wss://stream.bybit.com/v5/private
```

### Connection Example

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');

ws.on('open', () => {
  console.log('Connected to Bybit WebSocket');
  
  // Subscribe to topics
  ws.send(JSON.stringify({
    op: 'subscribe',
    args: ['publicTrade.BTCUSDT', 'orderbook.50.BTCUSDT']
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Message:', message);
});
```

### Authentication for Private Channels

```typescript
const apiKey = 'your-api-key';
const secretKey = 'your-secret-key';

// Generate signature
const expires = Date.now() + 10000; // 10 seconds from now
const signature = crypto
  .createHmac('sha256', secretKey)
  .update('GET/realtime' + expires)
  .digest('hex');

// Authenticate
ws.send(JSON.stringify({
  op: 'auth',
  args: [apiKey, expires, signature]
}));

// Then subscribe to private topics
ws.send(JSON.stringify({
  op: 'subscribe',
  args: ['position', 'execution', 'order']
}));
```

### Available Topics

#### Public Topics

| Topic | Description |
|-------|-------------|
| `orderbook.{depth}.{symbol}` | Orderbook updates |
| `publicTrade.{symbol}` | Public trades |
| `kline.{interval}.{symbol}` | Kline data |
| `tickers.{symbol}` | Ticker updates |
| `lt.tickers.{symbol}` | Leveraged token tickers |

#### Private Topics

| Topic | Description |
|-------|-------------|
| `position` | Position updates |
| `execution` | Execution updates |
| `order` | Order updates |
| `wallet` | Wallet updates |
| `greeks` | Option Greeks |

### Message Format

#### Ping/Pong

```json
{
  "op": "ping"
}
```

Response:
```json
{
  "op": "pong",
  "ts": 1672218931000
}
```

#### Orderbook Update

```json
{
  "topic": "orderbook.50.BTCUSDT",
  "ts": 1672218931000,
  "type": "snapshot",
  "data": {
    "s": "BTCUSDT",
    "b": [
      ["17026.00", "2.5"],
      ["17025.50", "5.0"]
    ],
    "a": [
      ["17026.50", "9.0"],
      ["17027.00", "4.0"]
    ]
  }
}
```

#### Trade Update

```json
{
  "topic": "publicTrade.BTCUSDT",
  "ts": 1672218931000,
  "type": "snapshot",
  "data": [
    {
      "i": "trade_id",
      "T": 1672218931000,
      "p": "17026.50",
      "v": "0.5",
      "S": "Buy",
      "s": "BTCUSDT",
      "BT": false
    }
  ]
}
```

#### Position Update (Private)

```json
{
  "topic": "position",
  "ts": 1672218931000,
  "type": "snapshot",
  "data": [
    {
      "category": "linear",
      "symbol": "BTCUSDT",
      "side": "Buy",
      "size": "0.001",
      "avgPrice": "50000",
      "positionValue": "50",
      "unrealisedPnl": "-0.5"
    }
  ]
}
```

#### Order Update (Private)

```json
{
  "topic": "order",
  "ts": 1672218931000,
  "type": "snapshot",
  "data": [
    {
      "category": "linear",
      "orderId": "1321003749380418816",
      "orderLinkId": "spot-003",
      "symbol": "BTCUSDT",
      "side": "Buy",
      "orderType": "Limit",
      "price": "50000",
      "qty": "0.001",
      "orderStatus": "New",
      "createdTime": "1672218931000",
      "updatedTime": "1672218931000"
    }
  ]
}
```

---

## Error Codes

### Common Error Codes

| Code | Description |
|------|-------------|
| 0 | OK |
| 10001 | Invalid API key |
| 10002 | Invalid timestamp |
| 10003 | Invalid signature |
| 10004 | Request timeout |
| 10005 | Permission denied |
| 10006 | Too many requests |
| 10007 | IP not whitelisted |
| 10010 | Error sign |

### Order Errors

| Code | Description |
|------|-------------|
| 10001 | Params error |
| 10015 | Order not found |
| 10016 | Order already cancelled |
| 10017 | Order already filled |
| 110007 | Insufficient balance |
| 110009 | Order price out of range |
| 110010 | Order quantity out of range |
| 110011 | Position size exceeds limit |
| 110012 | Order would trigger immediately |
| 110013 | Order would exceed position limit |
| 110014 | Reduce only order would increase position |
| 110015 | Position not found |
| 110016 | Order not found |
| 110017 | Position status abnormal |
| 110018 | Order status abnormal |
| 110019 | Risk limit exceeded |
| 110020 | Risk limit not modified |

### Position Errors

| Code | Description |
|------|-------------|
| 110001 | Position size is zero |
| 110002 | Position is in liquidation |
| 110003 | Position is bankrupt |
| 110004 | Position is not modified |
| 110005 | Leverage not modified |

### Rate Limit Errors

| Code | Description |
|------|-------------|
| 10006 | Too many requests |
| 10018 | Too many API requests |

---

## Response Storage

### Recommended Storage Schema

```typescript
interface BybitApiLogEntry {
  id: string;
  timestamp: Date;
  exchange: 'bybit';
  category: 'spot' | 'linear' | 'inverse' | 'option';
  endpoint: string;
  method: string;
  params: Record<string, any>;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  retCode: number;
  retMsg: string;
  responseBody: any;
  responseTime: number;
  error?: {
    code: number;
    msg: string;
    data?: any;
  };
}
```

### Error Response Format

```json
{
  "retCode": 110007,
  "retMsg": "Insufficient wallet balance.",
  "result": {}
}
```

### Implementation Example

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function logBybitResponse(
  category: string,
  endpoint: string,
  method: string,
  params: any,
  response: any,
  error?: any
) {
  await prisma.apiLog.create({
    data: {
      exchange: 'bybit',
      category,
      endpoint,
      method,
      params: JSON.stringify(params),
      responseStatus: response?.status || 0,
      retCode: response?.data?.retCode || error?.response?.data?.retCode,
      retMsg: response?.data?.retMsg || error?.response?.data?.retMsg,
      responseBody: JSON.stringify(response?.data || {}),
      error: error ? JSON.stringify({
        code: error?.response?.data?.retCode,
        msg: error?.response?.data?.retMsg,
        data: error?.response?.data?.result
      }) : null,
      timestamp: new Date(),
    }
  });
}
```

---

## Official SDKs

### Python SDK

```bash
pip install pybit
```

```python
from pybit.unified_trading import HTTP

session = HTTP(
    testnet=False,
    api_key="your-api-key",
    api_secret="your-api-secret"
)

# Place order
order = session.place_order(
    category="linear",
    symbol="BTCUSDT",
    side="Buy",
    orderType="Limit",
    qty="0.001",
    price="50000"
)
```

### Go SDK

```bash
go get github.com/bybit-exchange/bybit-api-go
```

### Java SDK

```xml
<dependency>
    <groupId>com.bybit</groupId>
    <artifactId>bybit-api</artifactId>
    <version>latest</version>
</dependency>
```

### .NET SDK

```bash
dotnet add package Bybit.Net
```

### Node.js SDK (Community)

```bash
npm install bybit-api
```

```typescript
import { RestClient } from 'bybit-api';

const client = new RestClient(
  'your-api-key',
  'your-api-secret',
  false // use testnet
);

// Place order
const order = await client.submitOrder({
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'Buy',
  orderType: 'Limit',
  qty: '0.001',
  price: '50000'
});
```

---

## Best Practices

1. **Time Synchronization**: Use NTP to sync server time
2. **Timestamp Validation**: Ensure timestamp is within `[server_time - recv_window; server_time + 1000)`
3. **Error Handling**: Implement proper error handling for all API calls
4. **Rate Limiting**: Respect rate limits (see Rate Limit docs)
5. **WebSocket Reconnection**: Implement ping/pong and auto-reconnect
6. **Order Management**: Use `orderLinkId` for idempotency
7. **Security**: Never expose API keys in client-side code
8. **Unified Account**: Consider using unified account for better capital efficiency

---

## Regional Restrictions

**Important:** IP addresses located in the US or Mainland China are restricted and will return a 403 Forbidden error.

---

## Official Resources & Repositories

### Documentation
| Resource | URL | Description |
|----------|-----|-------------|
| Official Docs | https://bybit-exchange.github.io/docs/ | Main V5 API documentation |
| API Explorer | https://bybit-exchange.github.io/docs/api-explorer/v5/category | Interactive API explorer |
| Changelog | https://bybit-exchange.github.io/docs/changelog/v5 | API updates and changes |
| FAQ | https://bybit-exchange.github.io/docs/faq | Frequently asked questions |
| Docs Source | https://github.com/bybit-exchange/docs | Documentation repository |
| Offline Docs V3 | https://github.com/bybit-exchange/doc-v3-offline | Offline documentation |

### Official SDKs
| Language | Package | Repository |
|----------|---------|------------|
| Python | `pybit` | https://github.com/bybit-exchange/pybit |
| Go | `bybit.go.api` | https://github.com/bybit-exchange/bybit.go.api |
| Java | `bybit-java-api` | https://github.com/bybit-exchange/bybit-java-api |
| .NET | `Bybit.Net` | https://github.com/bybit-exchange/bybit.net.api |

### Community SDKs
| Language | Package | URL |
|----------|---------|-----|
| Node.js | `bybit-api` | https://www.npmjs.com/package/bybit-api |

### Tools & Utilities
| Tool | URL | Description |
|------|-----|-------------|
| API Usage Examples | https://github.com/bybit-exchange/api-usage-examples | Code examples for all APIs |
| Postman Collection | https://github.com/bybit-exchange/QuickStartWithPostman | Ready-to-use Postman collection |
| RSA Key Generator | https://github.com/bybit-exchange/api-rsa-generator | Generate RSA key pairs for API auth |

### Specialized Documentation
| Resource | URL | Description |
|----------|-----|-------------|
| Bybit Pay Docs | https://github.com/bybit-exchange/pay-docs | Payment API documentation |
| P2P Trading | https://github.com/bybit-exchange/bybit_p2p | P2P trading integration |
| Merkle Proof | https://github.com/bybit-exchange/merkle-proof | Proof of reserves verification |

---

## Official SDKs - Detailed Usage

### Python SDK (pybit)

**Installation:**
```bash
pip install pybit
```

**Usage:**
```python
from pybit.unified_trading import HTTP

# Initialize client
session = HTTP(
    testnet=False,
    api_key="your-api-key",
    api_secret="your-api-secret"
)

# Get market data
klines = session.get_kline(
    category="linear",
    symbol="BTCUSDT",
    interval=60,
    limit=200
)

# Place order
order = session.place_order(
    category="linear",
    symbol="BTCUSDT",
    side="Buy",
    orderType="Limit",
    qty="0.001",
    price="50000",
    timeInForce="GoodTilCancel"
)

# Set leverage
session.set_leverage(
    category="linear",
    symbol="BTCUSDT",
    buyLeverage="10",
    sellLeverage="10"
)

# Query position
position = session.get_positions(
    category="linear",
    symbol="BTCUSDT"
)
```

### Node.js SDK (Community - bybit-api)

**Special Benefits:**
- 🚀 **Higher rate limits** - 400 requests/second (higher than highest VIP tier)
- 💰 **Lower minimum order** - $1 minimum notional (vs $5 default)
- 🔐 **Automatic auth** - HMAC and RSA authentication support
- 📡 **WebSocket API** - Both event-driven and promise-driven patterns

**Installation:**
```bash
npm install bybit-api
```

**REST API Usage:**
```typescript
import { RestClient } from 'bybit-api';

// Initialize client
const client = new RestClient(
  'your-api-key',
  'your-api-secret',
  {
    testnet: false,
    // Optional: Use RSA authentication
    // privateKey: 'your-rsa-private-key'
  }
);

// Get market data
const klines = await client.getKline({
  category: 'linear',
  symbol: 'BTCUSDT',
  interval: '60',
  limit: 200
});

// Place order
const order = await client.submitOrder({
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'Buy',
  orderType: 'Limit',
  qty: '0.001',
  price: '50000',
  timeInForce: 'GoodTilCancel'
});

// Set leverage
await client.setLeverage({
  category: 'linear',
  symbol: 'BTCUSDT',
  buyLeverage: '10',
  sellLeverage: '10'
});

// Query positions
const positions = await client.getPositionInfo({
  category: 'linear',
  symbol: 'BTCUSDT'
});
```

**WebSocket Usage:**
```typescript
import { WebsocketClient } from 'bybit-api';

const wsClient = new WebsocketClient({
  testnet: false,
  key: 'your-api-key',
  secret: 'your-api-secret',
});

// Subscribe to public topics
wsClient.subscribe(['orderbook.50.BTCUSDT', 'publicTrade.BTCUSDT']);

// Subscribe to private topics (auto-authenticated)
wsClient.subscribe(['position', 'order', 'execution']);

// Handle events
wsClient.on('update', (data) => {
  console.log('Update:', data);
});

wsClient.on('open', () => {
  console.log('WebSocket connected');
});

wsClient.on('reconnect', () => {
  console.log('WebSocket reconnecting');
});

wsClient.on('error', (err) => {
  console.error('WebSocket error:', err);
});
```

**WebSocket API (Promise-based):**
```typescript
import { WebsocketAPIClient } from 'bybit-api';

// Use WebSocket like REST API with promises
const wsApi = new WebsocketAPIClient({
  key: 'your-api-key',
  secret: 'your-api-secret',
});

// Place order via WebSocket
const order = await wsApi.submitOrder({
  category: 'linear',
  symbol: 'BTCUSDT',
  side: 'Buy',
  orderType: 'Market',
  qty: '0.001',
});
```

### Go SDK

**Installation:**
```bash
go get github.com/bybit-exchange/bybit.go.api
```

**Usage:**
```go
package main

import (
    "context"
    "fmt"
    "log"
    
    bybit "github.com/bybit-exchange/bybit.go.api"
)

func main() {
    client := bybit.NewBybitHttpClient(
        "your-api-key",
        "your-api-secret",
        bybit.WithBaseURL(bybit.MAINNET),
    )
    
    // Get kline
    kline, err := client.V5().Market().GetKline(
        context.Background(),
        bybit.V5GetKlineParam{
            Category: bybit.CategoryV5Linear,
            Symbol:   "BTCUSDT",
            Interval: 60,
            Limit:    200,
        },
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Kline: %+v\n", kline)
}
```

### Java SDK

**Maven:**
```xml
<dependency>
    <groupId>io.github.bybit-exchange</groupId>
    <artifactId>bybit-api-client</artifactId>
    <version>1.0.0</version>
</dependency>
```

**Gradle:**
```groovy
implementation 'io.github.bybit-exchange:bybit-api-client:1.0.0'
```

**Usage:**
```java
import com.bybit.api.client.BybitApiClientFactory;
import com.bybit.api.client.BybitApiRestClient;

public class BybitExample {
    public static void main(String[] args) {
        BybitApiClientFactory factory = BybitApiClientFactory.newInstance(
            "your-api-key",
            "your-api-secret"
        );
        
        BybitApiRestClient client = factory.newRestClient();
        
        // Get kline
        var klines = client.getKline("linear", "BTCUSDT", "60", 200);
        System.out.println(klines);
        
        // Place order
        var order = client.placeOrder(
            "linear", "BTCUSDT", "Buy", "Limit",
            "0.001", "50000", "GoodTilCancel"
        );
        System.out.println(order);
    }
}
```

### .NET SDK

**Installation:**
```bash
dotnet add package Bybit.Net
```

**Usage:**
```csharp
using Bybit.Net.Clients;
using Bybit.Net.Objects.Models;

var client = new BybitRestClient();

// Get kline
var klines = await client.V5Api.ExchangeData.GetKlinesAsync(
    Bybit.Net.Enums.Category.Linear,
    "BTCUSDT",
    Bybit.Net.Enums.KlineInterval.OneHour
);

// Place order (authenticated)
var client = new BybitRestClient(options => {
    options.ApiCredentials = new Bybit.Net.Objects.BybitApiCredentials(
        "your-api-key",
        "your-api-secret"
    );
});

var order = await client.V5Api.Trading.PlaceOrderAsync(
    Bybit.Net.Enums.Category.Linear,
    "BTCUSDT",
    Bybit.Net.Enums.OrderSide.Buy,
    Bybit.Net.Enums.NewOrderType.Limit,
    0.001m,
    price: 50000m
);
```

---

## RSA Key Generation

For enhanced security, use RSA authentication instead of HMAC.

### Using api-rsa-generator

```bash
# Clone the repository
git clone https://github.com/bybit-exchange/api-rsa-generator

# Navigate to directory
cd api-rsa-generator

# Generate keys (Python)
python generate_rsa_keys.py
```

### Manual Generation

```bash
# Generate private key (2048 bits)
openssl genrsa -out private_key.pem 2048

# Generate public key
openssl rsa -in private_key.pem -pubout -out public_key.pem

# Or generate in DER format
openssl rsa -in private_key.pem -outform DER -pubout -out public_key.der
```

### Using RSA with API

```typescript
import crypto from 'crypto';
import fs from 'fs';

// Load private key
const privateKey = fs.readFileSync('private_key.pem', 'utf8');

function generateRSASignature(
  timestamp: string,
  apiKey: string,
  recvWindow: string,
  queryString: string
): string {
  const signString = timestamp + apiKey + recvWindow + queryString;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signString);
  return sign.sign(privateKey, 'base64');
}

// For WebSocket authentication
const expires = Date.now() + 10000;
const signature = crypto
  .createSign('RSA-SHA256')
  .update('GET/realtime' + expires)
  .sign(privateKey, 'base64');
```

---

## Postman Collection

Quick start with Bybit API using Postman:

1. Download collection: https://github.com/bybit-exchange/QuickStartWithPostman
2. Import into Postman
3. Set environment variables:
   - `api_key`: Your API key
   - `api_secret`: Your API secret
   - `base_url`: `https://api.bybit.com` (mainnet) or `https://api-testnet.bybit.com` (testnet)

---

## API Usage Examples

Comprehensive examples available at: https://github.com/bybit-exchange/api-usage-examples

Topics covered:
- Authentication (HMAC and RSA)
- Market data retrieval
- Order management
- Position management
- WebSocket connections
- Error handling
- Rate limiting strategies

---

## Local Order Book Management

Maintaining a local order book via WebSocket is essential for high-frequency trading strategies that require real-time market depth data. Bybit provides order book WebSocket streams with snapshot and delta updates.

### How Order Book WebSocket Works

Bybit's order book stream follows this flow:

1. **Subscribe** to `orderbook.{depth}.{symbol}` topic
2. **Receive snapshot** - First message contains the full order book state
3. **Receive deltas** - Subsequent messages contain only changes (updates/deletes)
4. **Apply deltas** - Update your local order book with each delta message
5. **Validate sequence** - Use `u` (update ID) to ensure message ordering

### Order Book Depth Levels

| Depth | Topic | Update Frequency | Use Case |
|-------|-------|------------------|----------|
| 1 | `orderbook.1.{symbol}` | Real-time | Best bid/ask only |
| 50 | `orderbook.50.{symbol}` | ~20ms | Standard trading |
| 200 | `orderbook.200.{symbol}` | ~100ms | Market making |
| 500 | `orderbook.500.{symbol}` | ~100ms | Full depth analysis |

### Local Order Book Implementation

```typescript
import WebSocket from 'ws';

interface OrderBookLevel {
  price: number;
  size: number;
}

interface OrderBookUpdate {
  s: string;      // Symbol
  b: [string, string][];  // Bids [price, size]
  a: [string, string][];  // Asks [price, size]
  u: number;      // Update ID
  seq: number;    // Sequence number
}

class BybitLocalOrderBook {
  private ws: WebSocket | null = null;
  private bids: Map<number, number> = new Map(); // price -> size
  private asks: Map<number, number> = new Map();
  private lastUpdateId: number = 0;
  private lastSeq: number = 0;
  private isSnapshotReceived: boolean = false;
  private messageBuffer: OrderBookUpdate[] = [];
  private symbol: string;
  private depth: number;
  private onUpdateCallback: (() => void) | null = null;

  constructor(symbol: string, depth: number = 50) {
    this.symbol = symbol;
    this.depth = depth;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://stream.bybit.com/v5/public/linear`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log(`[Bybit] Connected to orderbook stream for ${this.symbol}`);
        
        // Subscribe to orderbook
        this.ws!.send(JSON.stringify({
          op: 'subscribe',
          args: [`orderbook.${this.depth}.${this.symbol}`]
        }));
        
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Skip non-orderbook messages
          if (message.topic?.startsWith('orderbook.')) {
            this.handleMessage(message);
          }
        } catch (error) {
          console.error('[Bybit] Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[Bybit] WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[Bybit] WebSocket connection closed');
        this.handleReconnect();
      });
    });
  }

  private handleMessage(message: any): void {
    const { type, data, ts } = message;
    
    if (type === 'snapshot') {
      // Initial full snapshot
      this.processSnapshot(data);
      this.isSnapshotReceived = true;
      
      // Process any buffered delta messages
      this.processBufferedDeltas();
    } else if (type === 'delta') {
      if (!this.isSnapshotReceived) {
        // Buffer delta until we get the snapshot
        this.messageBuffer.push(data);
        return;
      }
      
      this.processDelta(data);
    }
    
    // Callback for updates
    if (this.onUpdateCallback) {
      this.onUpdateCallback();
    }
  }

  private processSnapshot(data: OrderBookUpdate): void {
    // Clear existing data
    this.bids.clear();
    this.asks.clear();
    
    // Process bids
    for (const [price, size] of data.b) {
      const p = parseFloat(price);
      const s = parseFloat(size);
      if (s > 0) {
        this.bids.set(p, s);
      }
    }
    
    // Process asks
    for (const [price, size] of data.a) {
      const p = parseFloat(price);
      const s = parseFloat(size);
      if (s > 0) {
        this.asks.set(p, s);
      }
    }
    
    this.lastUpdateId = data.u;
    this.lastSeq = data.seq;
    
    console.log(`[Bybit] Snapshot received: ${this.bids.size} bids, ${this.asks.size} asks`);
  }

  private processDelta(data: OrderBookUpdate): void {
    // Validate sequence
    if (data.seq <= this.lastSeq) {
      console.warn(`[Bybit] Stale delta received: seq=${data.seq}, lastSeq=${this.lastSeq}`);
      return;
    }
    
    // Check for missed updates (sequence gap)
    const expectedSeq = this.lastSeq + 1;
    if (data.seq > expectedSeq) {
      console.warn(`[Bybit] Sequence gap detected: expected ${expectedSeq}, got ${data.seq}`);
      // Consider re-subscribing for fresh snapshot
      this.resubscribe();
      return;
    }
    
    // Apply bid updates
    for (const [price, size] of data.b) {
      const p = parseFloat(price);
      const s = parseFloat(size);
      
      if (s === 0) {
        // Remove level
        this.bids.delete(p);
      } else {
        // Update level
        this.bids.set(p, s);
      }
    }
    
    // Apply ask updates
    for (const [price, size] of data.a) {
      const p = parseFloat(price);
      const s = parseFloat(size);
      
      if (s === 0) {
        this.asks.delete(p);
      } else {
        this.asks.set(p, s);
      }
    }
    
    this.lastUpdateId = data.u;
    this.lastSeq = data.seq;
  }

  private processBufferedDeltas(): void {
    for (const delta of this.messageBuffer) {
      if (delta.seq > this.lastSeq) {
        this.processDelta(delta);
      }
    }
    this.messageBuffer = [];
  }

  private async resubscribe(): Promise<void> {
    console.log('[Bybit] Resubscribing to orderbook...');
    this.isSnapshotReceived = false;
    this.messageBuffer = [];
    
    // Unsubscribe and resubscribe
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        op: 'unsubscribe',
        args: [`orderbook.${this.depth}.${this.symbol}`]
      }));
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.ws.send(JSON.stringify({
        op: 'subscribe',
        args: [`orderbook.${this.depth}.${this.symbol}`]
      }));
    }
  }

  private async handleReconnect(): Promise<void> {
    console.log('[Bybit] Reconnecting in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    this.isSnapshotReceived = false;
    this.messageBuffer = [];
    await this.connect();
  }

  onUpdate(callback: () => void): void {
    this.onUpdateCallback = callback;
  }

  // Get sorted bids (descending by price)
  getBids(limit?: number): OrderBookLevel[] {
    const sorted = Array.from(this.bids.entries())
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => b.price - a.price);
    
    return limit ? sorted.slice(0, limit) : sorted;
  }

  // Get sorted asks (ascending by price)
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

  getDepth(levels: number): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
    return {
      bids: this.getBids(levels),
      asks: this.getAsks(levels)
    };
  }

  // Calculate mid price
  getMidPrice(): number | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    return (bestBid.price + bestAsk.price) / 2;
  }

  // Calculate order book imbalance (-1 to 1)
  getImbalance(levels: number = 10): number {
    const bids = this.getBids(levels);
    const asks = this.getAsks(levels);
    
    const bidVolume = bids.reduce((sum, b) => sum + b.size, 0);
    const askVolume = asks.reduce((sum, a) => sum + a.size, 0);
    const total = bidVolume + askVolume;
    
    return total > 0 ? (bidVolume - askVolume) / total : 0;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage Example
async function main() {
  const orderBook = new BybitLocalOrderBook('BTCUSDT', 50);
  
  orderBook.onUpdate(() => {
    const spread = orderBook.getSpread();
    const imbalance = orderBook.getImbalance(10);
    const midPrice = orderBook.getMidPrice();
    
    console.log(`Mid: ${midPrice?.toFixed(2)} | Spread: ${spread?.percentage.toFixed(4)}% | Imbalance: ${imbalance.toFixed(3)}`);
  });
  
  await orderBook.connect();
  
  // Keep running
  process.on('SIGINT', () => {
    orderBook.disconnect();
    process.exit(0);
  });
}
```

### Order Book Message Format

**Snapshot Message:**
```json
{
  "topic": "orderbook.50.BTCUSDT",
  "ts": 1672304484978,
  "type": "snapshot",
  "data": {
    "s": "BTCUSDT",
    "b": [
      ["16493.50", "0.001"],
      ["16493.00", "0.001"],
      ["16492.50", "0.012"]
    ],
    "a": [
      ["16611.00", "0.004"],
      ["16612.00", "0.028"],
      ["16612.50", "0.004"]
    ],
    "u": 1854353,
    "seq": 7968789492
  }
}
```

**Delta Message:**
```json
{
  "topic": "orderbook.50.BTCUSDT",
  "ts": 1672304485982,
  "type": "delta",
  "data": {
    "s": "BTCUSDT",
    "b": [
      ["16494.00", "0.001"],   // New or update
      ["16493.50", "0"]        // Delete (size = 0)
    ],
    "a": [
      ["16611.00", "0.008"]    // Update existing level
    ],
    "u": 1854365,
    "seq": 7968789493
  }
}
```

### Best Practices for Order Book Management

1. **Sequence Validation**: Always check `seq` to ensure no messages are missed
2. **Buffer Deltas**: Buffer delta messages until snapshot is received
3. **Handle Reconnection**: Re-subscribe if sequence gap is detected
4. **Memory Management**: Periodically clean up price levels with zero size
5. **Heartbeat**: Monitor WebSocket connection with ping/pong (Bybit sends ping every 20s)
6. **Latency Tracking**: Track message timestamps to detect delays

---

## Rate Limit Best Practices

Bybit implements rate limits to ensure fair usage and platform stability. Understanding and respecting these limits is crucial for building reliable trading applications.

### Rate Limit Types

| Limit Type | Scope | Default Limit | Window |
|------------|-------|---------------|--------|
| HTTP IP Limit | Per IP | 600 requests | 5 seconds |
| WebSocket Connection | Per IP | 500 connections | 5 minutes |
| Order Rate Limit | Per Account | Varies by endpoint | Per second |
| WebSocket Subscription | Per Connection | 10 subscriptions | Per request |

### Endpoint-Specific Rate Limits

| Endpoint | Rate Limit | Notes |
|----------|------------|-------|
| `/v5/order/create` | 20 req/s | Per account |
| `/v5/order/amend` | 20 req/s | Per account |
| `/v5/order/cancel` | 20 req/s | Per account |
| `/v5/order/cancel-all` | 5 req/s | Per account |
| `/v5/order/realtime` | 50 req/s | Per account |
| `/v5/position/list` | 20 req/s | Per account |
| `/v5/account/wallet-balance` | 10 req/s | Per account |
| `/v5/market/*` | 600 req/5s | Per IP |

### Response Headers

Bybit includes rate limit information in response headers:

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 598
X-RateLimit-Reset: 1672304485
Retry-After: 1
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Timestamp when limit resets |
| `Retry-After` | Seconds to wait before retry (on 429) |

### Rate Limiter Implementation

```typescript
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  minInterval: number;
}

class BybitRateLimiter {
  private requests: number[] = [];
  private config: RateLimitConfig;
  private lastRequestTime: number = 0;
  private queue: Array<() => Promise<void>> = [];
  private processing: boolean = false;

  constructor(config: RateLimitConfig = { maxRequests: 600, windowMs: 5000, minInterval: 10 }) {
    this.config = config;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Clean old requests outside window
    this.requests = this.requests.filter(time => now - time < this.config.windowMs);
    
    // Check if we're at the limit
    if (this.requests.length >= this.config.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.config.windowMs - (now - oldestRequest) + 10;
      
      console.log(`[RateLimiter] Rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }
    
    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.minInterval) {
      await this.sleep(this.config.minInterval - timeSinceLastRequest);
    }
    
    // Record this request
    this.lastRequestTime = Date.now();
    this.requests.push(this.lastRequestTime);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current usage
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

// Extended client with rate limiting
class RateLimitedBybitClient {
  private rateLimiter: BybitRateLimiter;
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string, testnet: boolean = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    this.rateLimiter = new BybitRateLimiter();
  }

  async request(method: 'GET' | 'POST', endpoint: string, params: any = {}): Promise<any> {
    await this.rateLimiter.waitForSlot();

    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    
    let url = `${this.baseUrl}${endpoint}`;
    let body: string | undefined;
    let queryString = '';

    if (method === 'GET' && Object.keys(params).length > 0) {
      queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
    } else if (method === 'POST') {
      body = JSON.stringify(params);
      queryString = JSON.stringify(params);
    }

    const signature = this.generateSignature(timestamp, recvWindow, queryString);

    const response = await fetch(url, {
      method,
      headers: {
        'X-BAPI-API-KEY': this.apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-SIGN': signature,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json'
      },
      body
    });

    // Check rate limit headers
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining && parseInt(remaining) < 10) {
      console.warn(`[Bybit] Rate limit low: ${remaining} requests remaining`);
    }

    // Handle rate limit error
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '1';
      throw new RateLimitError(parseInt(retryAfter));
    }

    const data = await response.json();

    if (data.retCode !== 0) {
      throw new BybitApiError(data.retCode, data.retMsg);
    }

    return data.result;
  }

  private generateSignature(timestamp: string, recvWindow: string, queryString: string): string {
    const crypto = require('crypto');
    const message = timestamp + this.apiKey + recvWindow + queryString;
    return crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');
  }
}

class RateLimitError extends Error {
  public retryAfter: number;
  
  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s`);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class BybitApiError extends Error {
  public code: number;
  
  constructor(code: number, message: string) {
    super(message);
    this.name = 'BybitApiError';
    this.code = code;
  }
}
```

### Exponential Backoff for Rate Limits

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
        // Use Retry-After header for rate limit errors
        const delay = error.retryAfter * 1000;
        console.log(`[Bybit] Rate limited. Waiting ${delay}ms before retry (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (error instanceof BybitApiError && error.code === 10006) {
        // Too many requests - use exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[Bybit] Too many requests. Waiting ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

// Usage
const result = await withExponentialBackoff(() => 
  client.request('GET', '/v5/position/list', { category: 'linear' })
);
```

### Rate Limit Best Practices

1. **Use WebSocket for Market Data**: WebSocket subscriptions don't count toward HTTP rate limits
2. **Batch Operations**: Use batch order endpoints when placing multiple orders
3. **Monitor Headers**: Track `X-RateLimit-Remaining` to anticipate limits
4. **Implement Backoff**: Use exponential backoff for rate limit errors (code 10006)
5. **Distribute Load**: Spread requests evenly rather than in bursts
6. **Cache Responses**: Cache infrequently changing data like instrument info
7. **Use Higher VIP Tiers**: Higher VIP levels get increased rate limits

---

## Error Recovery Patterns

Robust error handling is essential for production trading systems. This section covers common error scenarios and recovery strategies for Bybit API.

### Error Categories

| Category | Error Codes | Recovery Strategy |
|----------|-------------|-------------------|
| Network | Timeout, Connection Reset | Retry with backoff |
| Rate Limit | 10006, 10018 | Exponential backoff |
| Authentication | 10001, 10002, 10003 | Check credentials, sync time |
| Order | 110007-110020 | Validate order params, check balance |
| Position | 110001-110005 | Check position state |
| Market | Price/Qty out of range | Refresh market data |

### Error Handler Implementation

```typescript
interface BybitError {
  code: number;
  message: string;
  retriable: boolean;
  category: 'network' | 'rate_limit' | 'auth' | 'order' | 'position' | 'market' | 'unknown';
}

class BybitErrorHandler {
  private errorPatterns: Map<number, BybitError> = new Map([
    // Authentication errors
    [10001, { code: 10001, message: 'Invalid API key', retriable: false, category: 'auth' }],
    [10002, { code: 10002, message: 'Invalid timestamp', retriable: true, category: 'auth' }],
    [10003, { code: 10003, message: 'Invalid signature', retriable: false, category: 'auth' }],
    [10004, { code: 10004, message: 'Request timeout', retriable: true, category: 'network' }],
    [10005, { code: 10005, message: 'Permission denied', retriable: false, category: 'auth' }],
    
    // Rate limit errors
    [10006, { code: 10006, message: 'Too many requests', retriable: true, category: 'rate_limit' }],
    [10018, { code: 10018, message: 'Too many API requests', retriable: true, category: 'rate_limit' }],
    
    // Order errors
    [110007, { code: 110007, message: 'Insufficient balance', retriable: false, category: 'order' }],
    [110009, { code: 110009, message: 'Order price out of range', retriable: false, category: 'order' }],
    [110010, { code: 110010, message: 'Order quantity out of range', retriable: false, category: 'order' }],
    [110011, { code: 110011, message: 'Position size exceeds limit', retriable: false, category: 'position' }],
    [110012, { code: 110012, message: 'Order would trigger immediately', retriable: false, category: 'order' }],
    [110013, { code: 110013, message: 'Order would exceed position limit', retriable: false, category: 'order' }],
    [110014, { code: 110014, message: 'Reduce only would increase position', retriable: false, category: 'order' }],
    [110015, { code: 110015, message: 'Position not found', retriable: false, category: 'position' }],
    [110016, { code: 110016, message: 'Order not found', retriable: false, category: 'order' }],
    
    // Position errors
    [110001, { code: 110001, message: 'Position size is zero', retriable: false, category: 'position' }],
    [110002, { code: 110002, message: 'Position is in liquidation', retriable: false, category: 'position' }],
    [110003, { code: 110003, message: 'Position is bankrupt', retriable: false, category: 'position' }],
  ]);

  analyzeError(code: number, message: string): BybitError {
    const known = this.errorPatterns.get(code);
    if (known) return known;
    
    return {
      code,
      message,
      retriable: false,
      category: 'unknown'
    };
  }

  shouldRetry(error: BybitError): boolean {
    return error.retriable;
  }

  getRecoveryAction(error: BybitError): string {
    switch (error.category) {
      case 'network':
        return 'Retry with exponential backoff';
      case 'rate_limit':
        return 'Wait and retry with backoff';
      case 'auth':
        if (error.code === 10002) {
          return 'Sync server time and retry';
        }
        return 'Check API credentials and permissions';
      case 'order':
        return 'Validate order parameters and account balance';
      case 'position':
        return 'Check position state and leverage';
      case 'market':
        return 'Refresh market data and validate price/quantity';
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

class ResilientBybitClient {
  private errorHandler: BybitErrorHandler;
  private retryConfig: RetryConfig;
  private timeOffset: number = 0;

  constructor(
    private client: RateLimitedBybitClient,
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.errorHandler = new BybitErrorHandler();
    this.retryConfig = {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      ...retryConfig
    };
  }

  async initialize(): Promise<void> {
    // Sync time with server
    await this.syncTime();
  }

  private async syncTime(): Promise<void> {
    try {
      const serverTime = await this.getServerTime();
      const localTime = Date.now();
      this.timeOffset = serverTime - localTime;
      
      if (Math.abs(this.timeOffset) > 1000) {
        console.warn(`[Bybit] Time offset detected: ${this.timeOffset}ms`);
      }
    } catch (error) {
      console.error('[Bybit] Failed to sync time:', error);
    }
  }

  private getServerTime(): Promise<number> {
    return new Promise((resolve, reject) => {
      fetch('https://api.bybit.com/v5/market/time')
        .then(res => res.json())
        .then(data => resolve(parseInt(data.result.timeSecond) * 1000))
        .catch(reject);
    });
  }

  getTimestamp(): string {
    return (Date.now() + this.timeOffset).toString();
  }

  async request<T>(method: 'GET' | 'POST', endpoint: string, params: any = {}): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.client.request(method, endpoint, params) as T;
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof BybitApiError) {
          const analyzed = this.errorHandler.analyzeError(error.code, error.message);
          
          console.error(`[Bybit] API Error (${analyzed.category}): ${error.message} [code: ${error.code}]`);
          
          if (!analyzed.retriable || attempt === this.retryConfig.maxRetries) {
            throw error;
          }
          
          // Special handling for timestamp errors
          if (error.code === 10002) {
            await this.syncTime();
            continue;
          }
          
          // Calculate delay with exponential backoff
          const delay = Math.min(
            this.retryConfig.baseDelayMs * Math.pow(2, attempt),
            this.retryConfig.maxDelayMs
          );
          
          console.log(`[Bybit] Retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (error instanceof RateLimitError) {
          const delay = error.retryAfter * 1000;
          console.log(`[Bybit] Rate limited. Retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Network error
          if (attempt === this.retryConfig.maxRetries) {
            throw error;
          }
          
          const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
          console.log(`[Bybit] Network error. Retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  // Order with automatic retry and validation
  async placeOrder(params: {
    symbol: string;
    side: 'Buy' | 'Sell';
    orderType: 'Market' | 'Limit';
    qty: string;
    price?: string;
    timeInForce?: string;
    reduceOnly?: boolean;
  }): Promise<{ orderId: string; orderLinkId: string }> {
    try {
      return await this.request('POST', '/v5/order/create', {
        category: 'linear',
        ...params,
        timeInForce: params.timeInForce || 'GoodTilCancel'
      });
    } catch (error) {
      if (error instanceof BybitApiError) {
        // Handle specific order errors
        switch (error.code) {
          case 110007: // Insufficient balance
            throw new OrderError('Insufficient balance', 'INSUFFICIENT_BALANCE');
          case 110009: // Price out of range
            throw new OrderError('Price out of allowed range', 'PRICE_RANGE');
          case 110010: // Quantity out of range
            throw new OrderError('Quantity out of allowed range', 'QTY_RANGE');
          case 110012: // Would trigger immediately
            throw new OrderError('Order would trigger immediately', 'TRIGGER_IMMEDIATE');
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
class ResilientBybitWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: string[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private isAuthenticated: boolean = false;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    private url: string,
    private apiKey?: string,
    private apiSecret?: string
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.on('open', () => {
          console.log('[Bybit WS] Connected');
          this.reconnectAttempts = 0;
          this.startPing();
          
          // Authenticate if credentials provided
          if (this.apiKey && this.apiSecret) {
            this.authenticate();
          }
          
          // Resubscribe to topics
          this.resubscribe();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('[Bybit WS] Error:', error);
        });

        this.ws.on('close', () => {
          console.log('[Bybit WS] Connection closed');
          this.stopPing();
          this.handleDisconnect();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private startPing(): void {
    // Bybit requires ping every 20 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, 20000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private authenticate(): void {
    const expires = Date.now() + 10000;
    const signature = require('crypto')
      .createHmac('sha256', this.apiSecret!)
      .update('GET/realtime' + expires)
      .digest('hex');

    this.ws!.send(JSON.stringify({
      op: 'auth',
      args: [this.apiKey, expires, signature]
    }));
  }

  private handleMessage(data: Buffer): void {
    const message = JSON.parse(data.toString());
    
    // Handle auth response
    if (message.op === 'auth') {
      if (message.success) {
        console.log('[Bybit WS] Authenticated');
        this.isAuthenticated = true;
      } else {
        console.error('[Bybit WS] Authentication failed:', message);
      }
      return;
    }
    
    // Handle pong
    if (message.op === 'pong') {
      return;
    }
    
    // Handle subscription confirmation
    if (message.op === 'subscribe') {
      if (message.success) {
        console.log('[Bybit WS] Subscribed:', message);
      }
      return;
    }
    
    // Handle data messages
    if (message.topic) {
      // Emit to handlers
      this.emit(message.topic, message);
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Bybit WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[Bybit WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(err => {
        console.error('[Bybit WS] Reconnection failed:', err);
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

  subscribe(topics: string[]): void {
    this.subscriptions.push(...topics);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        op: 'subscribe',
        args: topics
      }));
    }
  }

  private emit(topic: string, data: any): void {
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
| Timestamp Error (10002) | Server rejects request | Sync time with server, retry |
| Rate Limit (10006, 10018) | Response code | Exponential backoff, check headers |
| Network Timeout | No response | Retry with backoff |
| WebSocket Disconnect | Close event | Reconnect with backoff, resubscribe |
| Order Rejection (110xxx) | Response code | Validate params, check balance |
| Position Error (110xxx) | Response code | Verify position state |

### Monitoring and Alerting

```typescript
interface ErrorMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorsByCode: Map<number, number>;
  errorsByCategory: Map<string, number>;
  avgRetryCount: number;
}

class BybitErrorMonitor {
  private metrics: ErrorMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    errorsByCode: new Map(),
    errorsByCategory: new Map(),
    avgRetryCount: 0
  };

  recordSuccess(): void {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
  }

  recordError(code: number, category: string): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    
    this.metrics.errorsByCode.set(code, (this.metrics.errorsByCode.get(code) || 0) + 1);
    this.metrics.errorsByCategory.set(category, (this.metrics.errorsByCategory.get(category) || 0) + 1);
  }

  getMetrics(): ErrorMetrics & { successRate: number } {
    return {
      ...this.metrics,
      successRate: this.metrics.totalRequests > 0 
        ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
        : 0
    };
  }

  shouldAlert(): boolean {
    // Alert if error rate > 5%
    const errorRate = this.metrics.failedRequests / (this.metrics.totalRequests || 1);
    return errorRate > 0.05;
  }
}
