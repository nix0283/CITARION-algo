# OHLCV Data System Documentation

## Overview

The CITARION platform includes a comprehensive OHLCV (Open-High-Low-Close-Volume) data system that:

1. **Stores historical data** in SQLite (dev) or TimescaleDB (production)
2. **Receives real-time data** via WebSocket from exchanges
3. **Auto-syncs** via Vercel Cron Jobs

## Supported Exchanges

| Exchange | Spot | Futures | WebSocket | REST API |
|----------|------|---------|-----------|----------|
| Binance  | ✅   | ✅      | ✅        | ✅       |
| Bybit    | ✅   | ✅      | ✅        | ✅       |
| OKX      | ✅   | ✅      | ✅        | ✅       |

## API Endpoints

### GET /api/ohlcv
Get candlestick data from database or exchange API.

```bash
# Get BTC hourly candles from Binance futures
curl "http://localhost:3000/api/ohlcv?symbol=BTCUSDT&exchange=binance&interval=1h&marketType=futures&limit=500"

# Force fetch from API (skip database)
curl "http://localhost:3000/api/ohlcv?symbol=BTCUSDT&forceFetch=true"
```

**Parameters:**
- `symbol` - Trading pair (e.g., BTCUSDT, BTC-USDT for OKX)
- `exchange` - binance, bybit, okx
- `interval` - 1m, 5m, 15m, 1h, 4h, 1d
- `marketType` - spot, futures
- `limit` - Number of candles (max 1500)
- `forceFetch` - Skip database, fetch from API

### POST /api/ohlcv
Sync historical data or check status.

```bash
# Sync last 30 days of BTC 1h candles
curl -X POST http://localhost:3000/api/ohlcv \
  -H "Content-Type: application/json" \
  -d '{"action":"sync","symbol":"BTCUSDT","interval":"1h","daysBack":30}'

# Check sync status
curl -X POST http://localhost:3000/api/ohlcv \
  -H "Content-Type: application/json" \
  -d '{"action":"status","symbol":"BTCUSDT","interval":"1h"}'

# Clean up old candles
curl -X POST http://localhost:3000/api/ohlcv \
  -H "Content-Type: application/json" \
  -d '{"action":"cleanup","daysOld":365}'
```

### GET /api/cron/ohlcv-sync
Cron job endpoint for auto-sync.

```bash
# Sync all exchanges
curl "http://localhost:3000/api/cron/ohlcv-sync?exchanges=binance,bybit,okx"

# Sync specific symbols and timeframes
curl "http://localhost:3000/api/cron/ohlcv-sync?symbols=BTCUSDT,ETHUSDT&timeframes=1h,4h"
```

## Vercel Cron Configuration

The `vercel.json` file configures automatic cron jobs:

```json
{
  "crons": [
    {
      "path": "/api/cron/ohlcv-sync?timeframes=1h,4h,1d&daysBack=3",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/ohlcv-sync?timeframes=1m,5m,15m&daysBack=1",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Schedules:**
- Every hour: Sync 1h, 4h, 1d timeframes
- Every 15 minutes: Sync 1m, 5m, 15m timeframes

## Database Schema

### OhlcvCandle
```prisma
model OhlcvCandle {
  id            String   @id @default(cuid())
  symbol        String   // BTCUSDT
  exchange      String   // binance, bybit, okx
  marketType    String   // spot, futures
  timeframe     String   // 1h, 4h, 1d
  openTime      DateTime // Candle start time
  closeTime     DateTime // Candle end time
  open          Float
  high          Float
  low           Float
  close         Float
  volume        Float
  quoteVolume   Float?
  trades        Int?
  takerBuyVolume Float?
  isFinal       Boolean  // Is candle closed?
}
```

### ExchangeSyncStatus
```prisma
model ExchangeSyncStatus {
  exchange      String
  symbol        String
  marketType    String
  timeframe     String
  lastSyncTime  DateTime?
  lastCandleTime DateTime?
  candlesCount  Int
  isSyncing     Boolean
  lastError     String?
}
```

## Real-time WebSocket

For real-time data, use the WebSocket client:

```typescript
import { BinanceWebSocketClient } from '@/lib/ohlcv-websocket';

const client = new BinanceWebSocketClient({
  onCandle: (candle) => {
    console.log('New candle:', candle);
  },
});

// Subscribe to BTC/USDT 1h futures
client.subscribe({
  exchange: 'binance',
  symbol: 'BTCUSDT',
  marketType: 'futures',
  interval: '1h',
});
```

## TimescaleDB Migration

For production with large data volumes, migrate to TimescaleDB:

1. Install PostgreSQL + TimescaleDB
2. Update `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/citarion"
   ```
3. Run setup:
   ```bash
   bunx prisma migrate dev
   psql -d citarion -f prisma/timescaledb-setup.sql
   ```

See `docs/TIMESCALEDB.md` for detailed instructions.

## Code Examples

### Fetch data for chart
```typescript
import { OhlcvService } from '@/lib/ohlcv-service';

// Get candles from database
const candles = await OhlcvService.getCandles({
  symbol: 'BTCUSDT',
  exchange: 'binance',
  marketType: 'futures',
  timeframe: '1h',
  limit: 500,
});

// Format for chart library
const chartData = candles.map(c => ({
  time: c.openTime.getTime() / 1000,
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
}));
```

### Sync data on demand
```typescript
import { MultiExchangeFetcher } from '@/lib/ohlcv-service';

// Sync 7 days of BTC data from Bybit
const result = await MultiExchangeFetcher.syncHistory({
  exchange: 'bybit',
  symbol: 'BTCUSDT',
  interval: '1h',
  marketType: 'futures',
  daysBack: 7,
});

console.log(`Synced ${result.stored} candles`);
```

## Monitoring

Check sync status via API:
```bash
curl -X POST http://localhost:3000/api/ohlcv \
  -H "Content-Type: application/json" \
  -d '{"action":"status","symbol":"BTCUSDT","interval":"1h"}'
```

Response:
```json
{
  "success": true,
  "symbol": "BTCUSDT",
  "interval": "1h",
  "marketType": "futures",
  "status": {
    "lastSyncTime": "2025-01-18T10:00:00Z",
    "candlesCount": 500,
    "isSyncing": false
  },
  "totalCandles": 1250
}
```

## Error Handling

The system handles errors gracefully:
- API rate limits: Automatic retry with backoff
- Network errors: Fallback to database data
- Sync errors: Logged to `ExchangeSyncStatus.lastError`
- Partial failures: Continue with remaining symbols

## Performance Tips

1. **Use TimescaleDB** for production (>100k candles)
2. **Limit sync frequency** for lower timeframes
3. **Use compression** for old data
4. **Monitor storage** with `OhlcvService.countCandles()`
5. **Clean up** old data periodically
