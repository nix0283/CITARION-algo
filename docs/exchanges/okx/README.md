# OKX API Documentation

> Official documentation: https://www.okx.com/docs-v5/en

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Market Data Endpoints](#market-data-endpoints)
4. [Trading Operations](#trading-operations)
5. [WebSocket Streams](#websocket-streams)
6. [Error Codes](#error-codes)
7. [Response Storage](#response-storage)

---

## Overview

OKX V5 API provides a unified interface for all trading products:
- **Spot** - Spot trading
- **Margin** - Margin trading (cross and isolated)
- **Swap** - Perpetual futures (USDT/USDC margined)
- **Futures** - Dated futures
- **Options** - Options trading

### Base URLs

| Environment | URL |
|------------|-----|
| Mainnet REST | `https://www.okx.com` |
| Mainnet WebSocket (Public) | `wss://ws.okx.com:8443/ws/v5/public` |
| Mainnet WebSocket (Private) | `wss://ws.okx.com:8443/ws/v5/private` |
| Mainnet WebSocket (Business) | `wss://ws.okx.com:8443/ws/v5/business` |
| Demo Trading REST | `https://www.okx.com` (with demo flag) |
| Demo Trading WebSocket | `wss://wspap.okx.com:8443/ws/v5/public?brokerId=9999` |

### API Path Structure

```
/api/v5/{module}/{action}
```

| Module | Description |
|--------|-------------|
| `/api/v5/market/` | Market data, tickers, candles, orderbook |
| `/api/v5/trade/` | Order management, execution |
| `/api/v5/account/` | Account operations, balance |
| `/api/v5/asset/` | Asset management, deposits, withdrawals |
| `/api/v5/public/` | Public data, instruments info |
| `/api/v5/savings/` | Savings/earn products |
| `/api/v5/convert/` | Convert operations |

### Instrument Types (instType)

| Type | Description |
|------|-------------|
| `SPOT` | Spot trading |
| `MARGIN` | Margin trading |
| `SWAP` | Perpetual futures |
| `FUTURES` | Dated futures |
| `OPTION` | Options |

---

## Authentication

### API Key Setup

1. Log in to OKX account
2. Go to API Management page
3. Create API Key with appropriate permissions:
   - **Read**: Query account info, orders, positions
   - **Trade**: Place, amend, cancel orders
   - **Withdraw**: Withdraw assets

### Required Headers

| Header | Description |
|--------|-------------|
| `OK-ACCESS-KEY` | Your API key |
| `OK-ACCESS-SIGN` | Request signature |
| `OK-ACCESS-TIMESTAMP` | UTC timestamp in ISO format |
| `OK-ACCESS-PASSPHRASE` | Your API passphrase |

### Signature Generation

```typescript
import crypto from 'crypto';

function generateSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secretKey: string
): string {
  const signString = timestamp + method + requestPath + body;
  return crypto
    .createHmac('sha256', secretKey)
    .update(signString)
    .digest('base64');
}
```

### GET Request Example

```typescript
const apiKey = 'your-api-key';
const secretKey = 'your-secret-key';
const passphrase = 'your-passphrase';

const timestamp = new Date().toISOString();
const method = 'GET';
const requestPath = '/api/v5/account/balance';

const signature = generateSignature(
  timestamp,
  method,
  requestPath,
  '',
  secretKey
);

const response = await fetch('https://www.okx.com' + requestPath, {
  headers: {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json'
  }
});
```

### POST Request Example

```typescript
const body = {
  instId: 'BTC-USDT',
  tdMode: 'cash',
  side: 'buy',
  ordType: 'limit',
  px: '50000',
  sz: '0.001'
};

const timestamp = new Date().toISOString();
const method = 'POST';
const requestPath = '/api/v5/trade/order';
const bodyString = JSON.stringify(body);

const signature = generateSignature(
  timestamp,
  method,
  requestPath,
  bodyString,
  secretKey
);

const response = await fetch('https://www.okx.com' + requestPath, {
  method: 'POST',
  headers: {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json'
  },
  body: bodyString
});
```

### Demo Trading

For demo trading, add the `x-simulated-trading: 1` header:

```typescript
const headers = {
  'OK-ACCESS-KEY': apiKey,
  'OK-ACCESS-SIGN': signature,
  'OK-ACCESS-TIMESTAMP': timestamp,
  'OK-ACCESS-PASSPHRASE': passphrase,
  'Content-Type': 'application/json',
  'x-simulated-trading': '1'  // Enable demo trading
};
```

---

## Market Data Endpoints

### Get Tickers

```
GET /api/v5/market/tickers
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instType | STRING | YES | Instrument type (SPOT, SWAP, FUTURES, OPTION) |

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    {
      "instType": "SPOT",
      "instId": "BTC-USDT",
      "last": "50000.0",
      "lastSz": "0.1",
      "askPx": "50001.0",
      "askSz": "1.5",
      "bidPx": "49999.0",
      "bidSz": "2.0",
      "open24h": "49000.0",
      "high24h": "51000.0",
      "low24h": "48000.0",
      "volCcy24h": "100000000",
      "vol24h": "2000",
      "ts": "1672218931000"
    }
  ]
}
```

### Get Candlesticks

```
GET /api/v5/market/candles
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | YES | Instrument ID (e.g., BTC-USDT) |
| bar | STRING | NO | Bar size (default: 1m) |
| before | STRING | NO | Pagination before this timestamp |
| after | STRING | NO | Pagination after this timestamp |
| limit | STRING | NO | Limit (default: 100, max: 300) |

**Bar Intervals:**
- Minutes: `1m`, `3m`, `5m`, `15m`, `30m`
- Hours: `1H`, `2H`, `4H`, `6H`, `12H`
- Days: `1D`, `2D`, `3D`
- Weeks: `1W`
- Months: `1M`

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    [
      "1672218931000",  // Timestamp
      "50000.0",        // Open
      "50500.0",        // High
      "49800.0",        // Low
      "50200.0",        // Close
      "100",            // Volume (in base currency)
      "5000000"         // Volume (in quote currency)
    ]
  ]
}
```

### Get Order Book

```
GET /api/v5/market/books
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | YES | Instrument ID |
| sz | STRING | NO | Depth size (default: 1, max: 400) |

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    {
      "asks": [
        ["50001.0", "1.5", "0", "1"],
        ["50002.0", "2.0", "0", "2"]
      ],
      "bids": [
        ["50000.0", "1.0", "0", "1"],
        ["49999.0", "3.0", "0", "3"]
      ],
      "ts": "1672218931000"
    }
  ]
}
```

### Get Trades

```
GET /api/v5/market/trades
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | YES | Instrument ID |
| limit | STRING | NO | Limit (default: 100, max: 500) |

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    {
      "tradeId": "123456",
      "px": "50000.0",
      "sz": "0.1",
      "side": "buy",
      "ts": "1672218931000"
    }
  ]
}
```

### Get Instruments

```
GET /api/v5/public/instruments
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instType | STRING | YES | Instrument type |
| instId | STRING | NO | Instrument ID (optional filter) |

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    {
      "instType": "SPOT",
      "instId": "BTC-USDT",
      "uly": "BTC-USDT",
      "category": "1",
      "baseCcy": "BTC",
      "quoteCcy": "USDT",
      "settleCcy": "",
      "ctVal": "",
      "ctMult": "",
      "ctValCcy": "",
      "optType": "",
      "stk": "",
      "listTime": "1672218931000",
      "expTime": "",
      "lever": "10",
      "tickSz": "0.1",
      "lotSz": "0.00000001",
      "minSz": "0.00001",
      "ctType": "",
      "alias": "",
      "state": "live"
    }
  ]
}
```

---

## Trading Operations

### Place Order

```
POST /api/v5/trade/order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | YES | Instrument ID |
| tdMode | STRING | YES | Trade mode (cash, cross, isolated) |
| side | STRING | YES | buy, sell |
| ordType | STRING | YES | Order type |
| sz | STRING | YES | Size (contracts or base currency) |
| px | STRING | NO | Price (required for limit orders) |
| tag | STRING | NO | Order tag |
| posSide | STRING | NO | Position side (long, short, net) |
| reduceOnly | BOOLEAN | NO | Reduce position only |
| tgtCcy | STRING | NO | Target currency (base_ccy, quote_ccy) |

**Order Types (ordType):**
- `market` - Market order
- `limit` - Limit order
- `post_only` - Post-only order
- `fok` - Fill or kill
- `ioc` - Immediate or cancel

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    {
      "clOrdId": "order123",
      "ordId": "123456789",
      "tag": "",
      "sCode": "0",
      "sMsg": ""
    }
  ]
}
```

### Place Multiple Orders

```
POST /api/v5/trade/batch-orders
```

**Body:**
```json
[
  {
    "instId": "BTC-USDT",
    "tdMode": "cash",
    "side": "buy",
    "ordType": "limit",
    "px": "50000",
    "sz": "0.001"
  },
  {
    "instId": "ETH-USDT",
    "tdMode": "cash",
    "side": "buy",
    "ordType": "limit",
    "px": "3000",
    "sz": "0.01"
  }
]
```

### Amend Order

```
POST /api/v5/trade/amend-order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | YES | Instrument ID |
| ordId | STRING | NO | Order ID |
| clOrdId | STRING | NO | Client order ID |
| newSz | STRING | NO | New size |
| newPx | STRING | NO | New price |

### Cancel Order

```
POST /api/v5/trade/cancel-order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | YES | Instrument ID |
| ordId | STRING | NO | Order ID |
| clOrdId | STRING | NO | Client order ID |

### Cancel All Orders

```
POST /api/v5/trade/cancel-all-orders
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | NO | Instrument ID |
| instType | STRING | NO | Instrument type |

### Get Order Details

```
GET /api/v5/trade/order
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | YES | Instrument ID |
| ordId | STRING | NO | Order ID |
| clOrdId | STRING | NO | Client order ID |

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    {
      "instId": "BTC-USDT",
      "ordId": "123456789",
      "clOrdId": "order123",
      "tag": "",
      "instType": "SPOT",
      "tdMode": "cash",
      "side": "buy",
      "posSide": "net",
      "ordType": "limit",
      "px": "50000.0",
      "sz": "0.001",
      "pnl": "",
      "ordState": "live",
      "avgPx": "50000.0",
      "accFillSz": "0.001",
      "fillSz": "0.001",
      "feeCcy": "USDT",
      "fee": "-0.05",
      "rebateCcy": "USDT",
      "rebate": "0",
      "category": "",
      "uTime": "1672218931000",
      "cTime": "1672218931000"
    }
  ]
}
```

### Get Order History

```
GET /api/v5/trade/orders-history
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instType | STRING | YES | Instrument type |
| instId | STRING | NO | Instrument ID |
| ordType | STRING | NO | Order type filter |
| state | STRING | NO | Order state filter |

### Get Open Orders

```
GET /api/v5/trade/orders-pending
```

---

## Account Management

### Get Balance

```
GET /api/v5/account/balance
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| ccy | STRING | NO | Currency filter |

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    {
      "uTime": "1672218931000",
      "totalEq": "10000.5",
      "isoEq": "10000.5",
      "adjEq": "9500.0",
      "ordFroz": "100.0",
      "imr": "500.0",
      "mmr": "100.0",
      "mgnRatio": "10.5",
      "notionalUsd": "10000.0",
      "details": [
        {
          "ccy": "USDT",
          "bal": "9500.0",
          "availBal": "9400.0",
          "frozenBal": "100.0",
          "ordFrozen": "100.0",
          "liab": "",
          "uTime": "1672218931000",
          "isoUpl": "10.0",
          "isoLiab": "",
          "crossLiab": "",
          "isoLiabAsset": ""
        }
      ]
    }
  ]
}
```

### Get Positions

```
GET /api/v5/account/positions
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instType | STRING | NO | Instrument type |
| instId | STRING | NO | Instrument ID |
| posId | STRING | NO | Position ID |

**Response:**
```json
{
  "code": "0",
  "msg": "",
  "data": [
    {
      "instType": "SWAP",
      "instId": "BTC-USDT-SWAP",
      "posId": "123456789",
      "posSide": "long",
      "pos": "1",
      "baseBal": "",
      "quoteBal": "",
      "posCcy": "",
      "avgPx": "50000.0",
      "uTime": "1672218931000",
      "cTime": "1672218931000",
      "upl": "100.0",
      "uplRatio": "0.002",
      "mgnMode": "cross",
      "mgnIsoMode": "",
      "lever": "10",
      "liqPx": "45000.0",
      "markPx": "50100.0",
      "imr": "500.0",
      "mmr": "100.0",
      "liab": "",
      "liabCcy": ""
    }
  ]
}
```

### Set Leverage

```
POST /api/v5/account/set-leverage
```

**Parameters:**
| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| instId | STRING | YES | Instrument ID |
| lever | STRING | YES | Leverage value |
| mgnMode | STRING | YES | Margin mode (cross, isolated) |
| posSide | STRING | NO | Position side |

---

## WebSocket Streams

### Public WebSocket URL

```
wss://ws.okx.com:8443/ws/v5/public
```

### Private WebSocket URL

```
wss://ws.okx.com:8443/ws/v5/private
```

### Business WebSocket URL

```
wss://ws.okx.com:8443/ws/v5/business
```

### Connection Example

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');

ws.on('open', () => {
  console.log('Connected to OKX WebSocket');

  // Subscribe to channels
  ws.send(JSON.stringify({
    op: 'subscribe',
    args: [
      { channel: 'tickers', instId: 'BTC-USDT' },
      { channel: 'candle1m', instId: 'BTC-USDT' }
    ]
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
const passphrase = 'your-passphrase';

const timestamp = Date.now() / 1000;
const method = 'GET';
const requestPath = '/users/self/verify';

const signature = crypto
  .createHmac('sha256', secretKey)
  .update(timestamp + method + requestPath)
  .digest('base64');

// Authenticate
ws.send(JSON.stringify({
  op: 'login',
  args: [{
    apiKey: apiKey,
    passphrase: passphrase,
    timestamp: timestamp,
    sign: signature
  }]
}));

// Then subscribe to private channels
ws.send(JSON.stringify({
  op: 'subscribe',
  args: [
    { channel: 'account' },
    { channel: 'positions' },
    { channel: 'orders' }
  ]
}));
```

### Available Channels

#### Public Channels

| Channel | Description |
|---------|-------------|
| `tickers` | Ticker updates |
| `candle{interval}` | Candlestick updates |
| `trades` | Trade updates |
| `books` | Order book updates |
| `books5` | Top 5 order book |
| `books50-l2-tbt` | 50-depth tick-by-tick |
| `mark-price` | Mark price updates |

#### Private Channels

| Channel | Description |
|---------|-------------|
| `account` | Account balance updates |
| `positions` | Position updates |
| `orders` | Order updates |
| `orders-algo` | Algo order updates |
| `liquidation-warning` | Liquidation warnings |
| `account-greeks` | Option Greeks |

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
  "ts": "1672218931000"
}
```

#### Ticker Update

```json
{
  "event": "tickers",
  "arg": {
    "channel": "tickers",
    "instId": "BTC-USDT"
  },
  "data": [
    {
      "instType": "SPOT",
      "instId": "BTC-USDT",
      "last": "50000.0",
      "askPx": "50001.0",
      "askSz": "1.5",
      "bidPx": "49999.0",
      "bidSz": "2.0",
      "open24h": "49000.0",
      "high24h": "51000.0",
      "low24h": "48000.0",
      "vol24h": "2000",
      "volCcy24h": "100000000",
      "ts": "1672218931000"
    }
  ]
}
```

#### Order Update (Private)

```json
{
  "event": "orders",
  "arg": {
    "channel": "orders",
    "instType": "SPOT"
  },
  "data": [
    {
      "instType": "SPOT",
      "instId": "BTC-USDT",
      "ordId": "123456789",
      "clOrdId": "order123",
      "tag": "",
      "side": "buy",
      "posSide": "net",
      "tdMode": "cash",
      "ordType": "limit",
      "px": "50000.0",
      "sz": "0.001",
      "ordState": "live",
      "avgPx": "0",
      "accFillSz": "0",
      "fillSz": "0",
      "state": "live",
      "cTime": "1672218931000",
      "uTime": "1672218931000"
    }
  ]
}
```

---

## Error Codes

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| 0 | 200 | Success |
| 50000 | 200 | System error |
| 50001 | 200 | Service unavailable |
| 50002 | 200 | Server busy |
| 50004 | 200 | WebSocket connection closed |
| 50005 | 200 | Order does not exist |

### Authentication Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| 50100 | 200 | API key is invalid |
| 50101 | 200 | API key is expired |
| 50102 | 200 | Request header "OK-ACCESS-KEY" is empty |
| 50103 | 200 | Request header "OK-ACCESS-SIGN" is empty |
| 50104 | 200 | Request header "OK-ACCESS-TIMESTAMP" is empty |
| 50105 | 200 | Request header "OK-ACCESS-PASSPHRASE" is empty |
| 50106 | 200 | Timestamp is invalid |
| 50107 | 200 | Signature does not match |
| 50108 | 200 | Passphrase does not match |
| 50109 | 200 | IP not in whitelist |
| 50110 | 200 | API key does not have permission |
| 50111 | 200 | Request rate limit reached |
| 50112 | 200 | Account blocked |

### Order Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| 51000 | 200 | Parameter {0} can not be empty |
| 51001 | 200 | Parameter {0} is invalid |
| 51002 | 200 | Instrument ID is invalid |
| 51003 | 200 | Order price is invalid |
| 51004 | 200 | Order size is invalid |
| 51005 | 200 | Order type is invalid |
| 51006 | 200 | Order side is invalid |
| 51007 | 200 | Trade mode is invalid |
| 51008 | 200 | Position side is invalid |
| 51009 | 200 | Leverage is invalid |
| 51010 | 200 | Order does not exist |
| 51011 | 200 | Order is already canceled |
| 51012 | 200 | Order is already filled |
| 51013 | 200 | Insufficient balance |
| 51014 | 200 | Position is in liquidation |
| 51015 | 200 | Position size exceeds limit |
| 51016 | 200 | Order count exceeds limit |
| 51017 | 200 | Order price exceeds limit |
| 51018 | 200 | Order would trigger immediately |

### Position Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| 51120 | 200 | Position does not exist |
| 51121 | 200 | Position size is zero |
| 51122 | 200 | Position is in auto-deleverage |
| 51123 | 200 | Position margin is insufficient |
| 51124 | 200 | Leverage is unchanged |
| 51125 | 200 | Position mode is unchanged |

### Rate Limit Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| 50011 | 429 | Rate limit reached |
| 50012 | 429 | Rate limit for API key reached |
| 50013 | 429 | Rate limit for IP reached |
| 50014 | 429 | Rate limit for account reached |
| 50061 | 429 | Sub-account rate limit exceeded |

---

## Response Storage

### Recommended Storage Schema

```typescript
interface OkxApiLogEntry {
  id: string;
  timestamp: Date;
  exchange: 'okx';
  instType: 'SPOT' | 'MARGIN' | 'SWAP' | 'FUTURES' | 'OPTION';
  endpoint: string;
  method: string;
  params: Record<string, any>;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  code: string;
  msg: string;
  responseBody: any;
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
  "code": "51013",
  "msg": "Insufficient balance",
  "data": []
}
```

### Implementation Example

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function logOkxResponse(
  instType: string,
  endpoint: string,
  method: string,
  params: any,
  response: any,
  error?: any
) {
  await prisma.apiLog.create({
    data: {
      exchange: 'okx',
      instType,
      endpoint,
      method,
      params: JSON.stringify(params),
      responseStatus: response?.status || 0,
      code: response?.data?.code || error?.response?.data?.code,
      msg: response?.data?.msg || error?.response?.data?.msg,
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

## Official Resources & Repositories

### Documentation

| Resource | URL | Description |
|----------|-----|-------------|
| Official API Docs | https://www.okx.com/docs-v5/en | Main V5 API documentation |
| Web3 Developer Docs | https://web3.okx.com/build/docs | Web3 and WaaS documentation |
| API Status Page | https://www.okx.com/status | System status and incidents |
| V5 Upgrade Guide | https://www.okx.com/learn/complete-guide-to-okex-api-v5-upgrade | Migration guide from V3 |

### Official OKX GitHub Repositories

| Repository | URL | Description |
|------------|-----|-------------|
| OKX Organization | https://github.com/okx | Official OKX GitHub organization |
| js-wallet-sdk | https://github.com/okx/js-wallet-sdk | TypeScript/JavaScript Wallet SDK |
| go-wallet-sdk | https://github.com/okx/go-wallet-sdk | Go Wallet SDK |
| exchain | https://github.com/okx/exchain | OKT Chain (EVM + Wasm) |
| okbchain | https://github.com/okx/okbchain | OKB Chain infrastructure |
| xlayer-toolkit | https://github.com/okx/xlayer-toolkit | X Layer development tools |
| xlayer-node | https://github.com/okx/xlayer-node | X Layer node implementation |
| xlayer-reth | https://github.com/okx/xlayer-reth | X Layer Reth implementation |
| xlayer-data-availability | https://github.com/okx/xlayer-data-availability | X Layer data availability |
| xlayer-erigon | https://github.com/okx/xlayer-erigon | X Layer Erigon implementation |
| ZeroIndexer | https://github.com/okx/ZeroIndexer | Inscriptions indexer |
| Deploy | https://github.com/okx/Deploy | X Layer deployment scripts |
| OKXConnectDemo | https://github.com/okx/OKXConnectDemo | OKX Wallet Connect demo |
| exchain-javascript-sdk | https://github.com/okx/exchain-javascript-sdk | Exchain JavaScript SDK |

### X Layer (Layer 2 Blockchain)

X Layer is a ZK L2 network powered by OKB token, built using Polygon CDK:
- **100% EVM Compatible**
- **Low Fees**
- **High Performance**
- **Based on Optimism/Polygon CDK**

| Component | Repository |
|-----------|------------|
| Toolkit | https://github.com/okx/xlayer-toolkit |
| Node | https://github.com/okx/xlayer-node |
| Reth Client | https://github.com/okx/xlayer-reth |
| Erigon Client | https://github.com/okx/xlayer-erigon |
| Data Availability | https://github.com/okx/xlayer-data-availability |

---

## Community SDKs

> Note: OKX does not provide official SDKs for trading API. Use community-maintained SDKs.

### Python SDKs

#### python-okx (Recommended)

**Installation:**
```bash
pip install python-okx
```

**Repository:** https://github.com/okxapi/python-okx

**Usage:**
```python
from okx.PublicData import PublicData
from okx.MarketData import MarketData
from okx.Trade import Trade
from okx.Account import Account

# Initialize clients (passphrase required)
api_key = 'your-api-key'
secret_key = 'your-secret-key'
passphrase = 'your-passphrase'

publicData = PublicData(
    api_key=api_key,
    api_secret=secret_key,
    passphrase=passphrase
)

# Get instruments
instruments = publicData.get_instruments(instType='SPOT')
print(instruments)

# Market data
marketData = MarketData(
    api_key=api_key,
    api_secret=secret_key,
    passphrase=passphrase
)

# Get tickers
tickers = marketData.get_tickers(instType='SPOT')
print(tickers)

# Get candlesticks
candles = marketData.get_candlesticks(
    instId='BTC-USDT',
    bar='1H',
    limit=100
)
print(candles)

# Trading (authenticated)
trade = Trade(
    api_key=api_key,
    api_secret=secret_key,
    passphrase=passphrase,
    flag='0'  # 0 for live, 1 for demo
)

# Place order
order = trade.place_order(
    instId='BTC-USDT',
    tdMode='cash',
    side='buy',
    ordType='limit',
    px='50000',
    sz='0.001'
)
print(order)

# Account
account = Account(
    api_key=api_key,
    api_secret=secret_key,
    passphrase=passphrase
)

# Get balance
balance = account.get_account_balance()
print(balance)
```

#### okx-sdk (Alternative)

**Installation:**
```bash
pip install okx-sdk
```

**Repository:** https://github.com/burakoner/okx-sdk

**Features:**
- Up-to-date
- Most complete
- Well-documented
- Easy to use

### Node.js SDKs

#### okx-api (Recommended)

**Installation:**
```bash
npm install okx-api
```

**Repository:** https://github.com/tiagosiebler/okx-api

**Features:**
- Complete REST API integration
- WebSocket support
- TypeScript support
- Over 100 integration tests
- Actively maintained

**REST API Usage:**
```typescript
import { RestClient, WebsocketClient } from 'okx-api';

// Initialize client
const client = new RestClient({
  apiKey: 'your-api-key',
  apiSecret: 'your-secret-key',
  apiPass: 'your-passphrase',
  // For demo trading:
  // baseUrl: 'https://www.okx.com',
  // headers: { 'x-simulated-trading': '1' }
});

// Get tickers
const tickers = await client.getTickers({ instType: 'SPOT' });
console.log(tickers);

// Get candlesticks
const candles = await client.getCandlesticks({
  instId: 'BTC-USDT',
  bar: '1H',
  limit: 100
});
console.log(candles);

// Get order book
const orderbook = await client.getOrderBook({
  instId: 'BTC-USDT',
  sz: 20
});
console.log(orderbook);

// Place order
const order = await client.submitOrder({
  instId: 'BTC-USDT',
  tdMode: 'cash',
  side: 'buy',
  ordType: 'limit',
  px: '50000',
  sz: '0.001'
});
console.log(order);

// Get balance
const balance = await client.getBalance();
console.log(balance);

// Get positions
const positions = await client.getPositions();
console.log(positions);
```

**WebSocket Usage:**
```typescript
import { WebsocketClient } from 'okx-api';

const wsClient = new WebsocketClient({
  apiKey: 'your-api-key',
  apiSecret: 'your-secret-key',
  apiPass: 'your-passphrase',
});

// Subscribe to public topics
wsClient.subscribe({
  channel: 'tickers',
  instId: 'BTC-USDT'
});

wsClient.subscribe({
  channel: 'candle1m',
  instId: 'BTC-USDT'
});

// Subscribe to private topics (auto-authenticated)
wsClient.subscribe({
  channel: 'account'
});

wsClient.subscribe({
  channel: 'orders',
  instType: 'SPOT'
});

// Handle events
wsClient.on('update', (data) => {
  console.log('Update:', data);
});

wsClient.on('open', () => {
  console.log('WebSocket connected');
});

wsClient.on('response', (data) => {
  console.log('Response:', data);
});

wsClient.on('error', (err) => {
  console.error('WebSocket error:', err);
});
```

### Go SDKs

#### go-okx

**Installation:**
```bash
go get github.com/iaping/go-okx
```

**Repository:** https://github.com/iaping/go-okx

**Usage:**
```go
package main

import (
    "context"
    "fmt"
    "log"

    okx "github.com/iaping/go-okx"
    "github.com/iaping/go-okx/api"
)

func main() {
    client, err := okx.NewClient(
        context.Background(),
        &api.Config{
            ApiKey:     "your-api-key",
            ApiSecret:  "your-api-secret",
            Passphrase: "your-passphrase",
            // BaseURL: api.BaseURLDemo, // For demo trading
        },
    )
    if err != nil {
        log.Fatal(err)
    }

    // Get instruments
    instruments, err := client.PublicData.GetInstruments(
        context.Background(),
        okx.InstrumentTypeSpot,
        "",
        "",
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Instruments: %+v\n", instruments)

    // Place order
    order, err := client.Trade.PlaceOrder(
        context.Background(),
        &okx.PlaceOrderRequest{
            InstId:  "BTC-USDT",
            TdMode:  okx.TradeModeCash,
            Side:    okx.OrderSideBuy,
            OrdType: okx.OrderTypeLimit,
            Px:      "50000",
            Sz:      "0.001",
        },
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Order: %+v\n", order)
}
```

#### go-okx-v5 (Alternative)

**Repository:** https://github.com/zok2/go-okx-v5

**Go Package:** https://pkg.go.dev/github.com/zok2/go-okx-v5/api

### Java SDK

#### okx-v5-java

**Maven:**
```xml
<dependency>
    <groupId>xyz.felh</groupId>
    <artifactId>okx-v5-java</artifactId>
    <version>0.4.2024071601</version>
</dependency>
```

**Repository:** https://github.com/forestwanglin/okx-v5-java

**Gradle:**
```groovy
implementation 'xyz.felh:okx-v5-java:0.4.2024071601'
```

**Usage:**
```java
import com.okx.api.client.OkxApiClientFactory;
import com.okx.api.client.OkxApiRestClient;

public class OkxExample {
    public static void main(String[] args) {
        OkxApiClientFactory factory = OkxApiClientFactory.newInstance(
            "your-api-key",
            "your-secret-key",
            "your-passphrase"
        );

        OkxApiRestClient client = factory.newRestClient();

        // Get instruments
        var instruments = client.getInstruments("SPOT", null, null);
        System.out.println(instruments);

        // Place order
        var order = client.placeOrder(
            "BTC-USDT",    // instId
            "cash",        // tdMode
            "buy",         // side
            "limit",       // ordType
            "50000",       // px
            "0.001"        // sz
        );
        System.out.println(order);

        // Get balance
        var balance = client.getBalance(null);
        System.out.println(balance);
    }
}
```

### .NET SDK

#### OKX.Api

**Installation:**
```bash
dotnet add package OKX.Api
```

**Repository:** https://github.com/burakoner/OKX.Api

**Usage:**
```csharp
using OKX.Api;

var client = new OkxRestClient();

// Public endpoints (no authentication needed)
var tickers = await client.GetTickersAsync(OkxInstrumentType.Spot);
Console.WriteLine($"Got {tickers.Data.Count} tickers");

var candles = await client.GetCandlesticksAsync(
    "BTC-USDT",
    OkxBar.OneHour,
    limit: 100
);
Console.WriteLine($"Got {candles.Data.Count} candles");

// Authenticated client
var authClient = new OkxRestClient(options => {
    options.ApiCredentials = new OkxApiCredentials(
        "your-api-key",
        "your-secret-key",
        "your-passphrase"
    );
});

// Get balance
var balance = await authClient.GetBalanceAsync();
Console.WriteLine($"Balance: {balance.Data.TotalEquity}");

// Place order
var order = await authClient.PlaceOrderAsync(
    new OkxPlaceOrderRequest {
        InstId = "BTC-USDT",
        TdMode = OkxTradeMode.Cash,
        Side = OkxOrderSide.Buy,
        OrdType = OkxOrderType.Limit,
        Px = 50000m,
        Sz = 0.001m
    }
);
Console.WriteLine($"Order ID: {order.Data.OrderId}");
```

---

## Postman Collection

OKX provides an official Postman workspace:

**URL:** https://www.postman.com/okexexchange/okex-apis-doc/overview

### Setup Instructions

1. Open the Postman workspace link
2. Fork the collection to your workspace
3. Set environment variables:
   - `api_key`: Your API key
   - `api_secret`: Your API secret
   - `passphrase`: Your API passphrase
   - `base_url`: `https://www.okx.com`
   - `simulated_trading`: `0` for live, `1` for demo

---

## Web3 SDKs

OKX provides comprehensive Web3 development tools:

### JavaScript Wallet SDK

**Repository:** https://github.com/okx/js-wallet-sdk

**Features:**
- Multi-chain support
- Offline transaction signing
- TypeScript support
- Browser and Node.js compatible

```typescript
import { Bitcoin, Ethereum, Solana } from '@okxweb3/js-wallet-sdk';

// Bitcoin signing
const btc = new Bitcoin();
const signedTx = await btc.signTransaction(privateKey, unsignedTx);

// Ethereum signing
const eth = new Ethereum();
const signature = await eth.signMessage(privateKey, message);
```

### Go Wallet SDK

**Repository:** https://github.com/okx/go-wallet-sdk

**Features:**
- Go-based implementation
- Multi-chain support
- Offline signing capabilities

### DEX SDK

**Documentation:** https://web3.okx.com/build/dev-docs/wallet-api/dex-sdk-introduction

**Features:**
- DEX aggregation
- Cross-chain swaps
- Price quotes

---

## Best Practices

1. **Time Synchronization**: Use NTP to sync server time (timestamps must be in ISO 8601 format)
2. **Signature Generation**: Always use HMAC-SHA256 with base64 encoding
3. **Error Handling**: Check the `code` field for errors (non-zero means error)
4. **Rate Limiting**: Respect rate limits (varies by endpoint)
5. **WebSocket Reconnection**: Implement ping/pong and auto-reconnect
6. **Passphrase Security**: Never expose passphrase in code
7. **Demo Trading**: Test with demo trading first (`x-simulated-trading: 1`)
8. **IP Whitelist**: Configure IP whitelist in API settings

---

## Rate Limits

### REST API

| Endpoint Type | Rate Limit |
|---------------|------------|
| Public Market Data | 20 requests/2s |
| Private Trading | 60 requests/2s |
| Account Info | 10 requests/2s |

### WebSocket

- Maximum 240 connections per IP
- Ping every 30 seconds recommended
- Auto-disconnect after 30 seconds of inactivity

---

## Regional Restrictions

**Important:** OKX has regional restrictions. Check the official documentation for the latest list of restricted jurisdictions.

---

## Recommended SDK Summary

| Language | Package | Repository | Notes |
|----------|---------|------------|-------|
| **Python** | `python-okx` | https://github.com/okxapi/python-okx | Most complete, recommended |
| **Node.js** | `okx-api` | https://github.com/tiagosiebler/okx-api | Full TypeScript support |
| **Go** | `go-okx` | https://github.com/iaping/go-okx | Clean API design |
| **Java** | `okx-v5-java` | https://github.com/forestwanglin/okx-v5-java | Maven/Gradle support |
| **.NET** | `OKX.Api` | https://github.com/burakoner/OKX.Api | C# wrapper |

---

## Migration from V3 to V5

If migrating from the older V3 API:

1. Update endpoint URLs to V5 format
2. Change authentication headers:
   - Old: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`
   - New: Same headers, different signature format
3. Update parameter names (see migration guide)
4. Update response parsing (V5 uses `code` and `msg` at root level)

**Migration Guide:** https://www.okx.com/learn/complete-guide-to-okex-api-v5-upgrade
