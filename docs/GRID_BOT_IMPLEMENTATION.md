# Grid Bot Implementation

**Status:** Production Ready ✅  
**Version:** 2.0.0  
**Date:** 2025-01-XX

---

## Overview

Полнофункциональный сеточный торговый бот с поддержкой множества бирж, paper trading и реальной торговли.

---

## Features

### Grid Types
- **Arithmetic** — равные интервалы между уровнями
- **Geometric** — равные процентные интервалы
- **Adaptive** — адаптивная сетка на основе ликвидности

### Order Management
- Limit и Market ордера
- Автоматическое выставление противоположных ордеров
- Order tracking и status updates
- Partial fill support

### Risk Management
- Max drawdown protection
- Stop loss (fixed и trailing)
- Take profit
- Max open positions limit

### Real-time Data
- WebSocket price feed
- Fallback polling
- Orderbook monitoring
- Position tracking

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GRID BOT ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ GridBotEngine│────▶│GridBotAdapter│────▶│   Exchange   │    │
│  │              │     │              │     │   Client     │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                    │             │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Grid State │     │ Paper Adapter│     │   Real API   │    │
│  │   & Metrics  │     │  (Virtual)   │     │  (Binance,   │    │
│  └──────────────┘     └──────────────┘     │   Bybit...)  │    │
│                                            └──────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Usage

### Create Grid Bot (Paper Trading)

```typescript
import { createGridBot } from '@/lib/grid-bot';

const bot = createGridBot({
  id: 'grid-1',
  name: 'BTC Grid Bot',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  accountType: 'DEMO',
  gridType: 'arithmetic',
  gridLevels: 10,
  upperPrice: 70000,
  lowerPrice: 60000,
  positionSize: 0.01,
  positionSizeType: 'fixed',
  leverage: 1,
  trailingEnabled: false,
  maxDrawdown: 20,
}, {
  paperTrading: true,
  initialBalance: 10000,
});

// Start the bot
await bot.start();

// Listen to events
bot.on('ORDER_FILLED', (event) => {
  console.log('Order filled:', event.data);
});

// Get metrics
const metrics = bot.getMetrics();
console.log('Win rate:', metrics.winRate);
console.log('Total PnL:', metrics.totalReturn);
```

### Create Grid Bot (Real Exchange)

```typescript
import { createGridBot } from '@/lib/grid-bot';

const bot = createGridBot({
  id: 'grid-2',
  name: 'ETH Grid Bot',
  symbol: 'ETHUSDT',
  exchange: 'bybit',
  accountType: 'REAL',
  gridType: 'geometric',
  gridLevels: 15,
  upperPrice: 4000,
  lowerPrice: 3000,
  positionSize: 0.1,
  positionSizeType: 'fixed',
  leverage: 3,
  trailingEnabled: true,
  trailingActivationPercent: 5,
  trailingDistancePercent: 2,
  maxDrawdown: 15,
}, {
  exchange: 'bybit',
  credentials: {
    apiKey: 'YOUR_API_KEY',
    apiSecret: 'YOUR_API_SECRET',
  },
  testnet: false,
});

await bot.start();
```

---

## API Endpoints

### Create Grid Bot
```
POST /api/bots/grid
{
  "name": "BTC Grid",
  "symbol": "BTCUSDT",
  "exchangeId": "binance",
  "gridType": "ARITHMETIC",
  "gridCount": 10,
  "upperPrice": 70000,
  "lowerPrice": 60000,
  "totalInvestment": 1000,
  "leverage": 1
}
```

### Start Grid Bot
```
PATCH /api/bots/grid
{
  "id": "bot-id",
  "action": "start"
}
```

### Stop Grid Bot
```
PATCH /api/bots/grid
{
  "id": "bot-id",
  "action": "stop"
}
```

### Get Bot Status
```
GET /api/bots/grid?id=bot-id
```

---

## Metrics

| Metric | Description |
|--------|-------------|
| totalReturn | Total profit/loss |
| winRate | Percentage of winning trades |
| profitFactor | Gross profit / Gross loss |
| sharpeRatio | Risk-adjusted return |
| maxDrawdown | Maximum equity decline |
| gridEfficiency | Percentage of filled levels |

---

## Files

| File | Description |
|------|-------------|
| `types.ts` | TypeScript interfaces |
| `grid-bot-engine.ts` | Main engine (600+ lines) |
| `exchange-adapter.ts` | Exchange integration |
| `paper-adapter.ts` | Paper trading simulation |
| `index.ts` | Module exports |

---

## Next Steps

1. Add UI controls in `grid-bot-manager.tsx`
2. Implement grid visualization
3. Add notification system
4. Create backtesting integration
