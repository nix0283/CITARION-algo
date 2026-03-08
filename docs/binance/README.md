# Binance API Integration Documentation

This directory contains comprehensive documentation for integrating with Binance Exchange APIs. This documentation is based on official Binance repositories and is intended for the CITARION trading platform.

## Official Resources

| Repository | Description | URL |
|------------|-------------|-----|
| binance-spot-api-docs | Official Spot API Documentation | https://github.com/binance/binance-spot-api-docs |
| binance-connector-js | JavaScript/TypeScript SDK | https://github.com/binance/binance-connector-js |
| binance-signature-examples | Signature Generation Examples | https://github.com/binance/binance-signature-examples |
| binance-websocket-examples | WebSocket Integration Examples | https://github.com/binance/binance-websocket-examples |
| websocket-demo | Live WebSocket Demo | https://github.com/binance/websocket-demo |

## Documentation Files

- [REST API Reference](./rest-api.md) - Complete REST API endpoints
- [WebSocket Streams](./websocket-streams.md) - Real-time data streams
- [Authentication](./authentication.md) - API key and signature methods
- [Error Codes](./error-codes.md) - Complete error code reference
- [Trading Guide](./trading.md) - Order placement and management
- [Response Logging](./response-logging.md) - Storing and analyzing API responses

## Quick Start

### Base Endpoints

```
Primary:     https://api.binance.com
Alternative: https://api-gcp.binance.com
Fast (less stable): https://api1.binance.com through https://api4.binance.com
Market Data Only: https://data-api.binance.vision
WebSocket:   wss://stream.binance.com:9443 or wss://stream.binance.com:443
```

### API Key Types

Binance supports three types of API keys:

1. **HMAC** - Most common, uses secret key for signing
2. **RSA** - Uses public/private key pair (PKCS#8 format)
3. **Ed25519** - Recommended for best performance and security

### Security Types

| Type | Description |
|------|-------------|
| `NONE` | Public market data |
| `TRADE` | Trading operations (placing/canceling orders) |
| `USER_DATA` | Private account information |
| `USER_STREAM` | Managing User Data Stream subscriptions |

### Rate Limits

- **IP Limits**: Weight-based, tracked via `X-MBX-USED-WEIGHT-*` header
- **Order Limits**: Tracked via `X-MBX-ORDER-COUNT-*` header
- HTTP 429: Rate limit exceeded - back off immediately
- HTTP 418: IP banned (2 minutes to 3 days)

## Installation

```bash
# Install official Binance Spot connector
npm install @binance/spot

# Or install specific connectors
npm install @binance/derivatives-trading-usds-futures
npm install @binance/margin-trading
npm install @binance/wallet
```

## Basic Usage Examples

### REST API

```typescript
import Spot from '@binance/spot';

const client = new Spot();

// Public endpoint - no API key needed
const exchangeInfo = await client.exchangeInfo();
const tickerPrice = await client.tickerPrice('BTCUSDT');
const klines = await client.klines('BTCUSDT', '1h', { limit: 100 });

// Private endpoint - requires API key
const privateClient = new Spot(apiKey, apiSecret);
const accountInfo = await privateClient.account();
const openOrders = await privateClient.openOrders({ symbol: 'BTCUSDT' });
```

### WebSocket Streams

```typescript
const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

ws.on('message', (data) => {
  const trade = JSON.parse(data);
  console.log({
    symbol: trade.s,
    price: trade.p,
    quantity: trade.q,
    time: new Date(trade.T)
  });
});
```

### Placing Orders

```typescript
// Limit order
const order = await client.newOrder('BTCUSDT', 'BUY', 'LIMIT', {
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '50000'
});

// Market order
const marketOrder = await client.newOrder('BTCUSDT', 'SELL', 'MARKET', {
  quantity: '0.001'
});

// Stop-loss order
const stopOrder = await client.newOrder('BTCUSDT', 'SELL', 'STOP_LOSS_LIMIT', {
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '49000',
  stopPrice: '49500'
});
```

## Important Notes

1. **Timestamp Sync**: Server time must be within `recvWindow` (default 5000ms, max 60000ms)
2. **Connection Limits**: WebSocket connections valid for 24 hours, 300 connections per 5 minutes per IP
3. **Ping/Pong**: WebSocket sends ping every 20 seconds, must respond with pong within 1 minute
4. **Order Book Management**: Use diff. depth stream with snapshot for accurate local order book

## Related Files in Project

- `/src/lib/binance-client.ts` - Binance API client wrapper
- `/src/lib/ohlcv-service.ts` - OHLCV data management
- `/src/lib/ohlcv-websocket.ts` - WebSocket client for real-time data
- `/src/app/api/binance/` - API routes for Binance integration
