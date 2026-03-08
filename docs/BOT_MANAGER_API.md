# Bot Manager & API

## Overview

The Bot Manager provides centralized control for all trading bots in the CITARION platform. It handles bot lifecycle, configuration, statistics tracking, and integration with the Event Bus.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BOT MANAGER                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   API Layer     │    │  Bot Manager    │    │  Integration    │      │
│  │  /api/bots/*    │───▶│    Service      │───▶│     Layer       │      │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘      │
│          │                      │                       │               │
│          ▼                      ▼                       ▼               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │  Bot Control    │    │   Event Bus     │    │  Market Data    │      │
│  │     Panel       │    │   (Signals)     │    │    Service      │      │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### List All Bots

```http
GET /api/bots
```

**Response:**
```json
{
  "bots": [
    {
      "code": "HFT",
      "name": "Helios",
      "fullName": "HFT Bot - High Frequency Trading",
      "category": "frequency",
      "description": "High frequency trading with microstructure analysis",
      "status": "idle",
      "enabled": false,
      "config": {
        "symbol": "BTCUSDT",
        "exchange": "binance",
        "leverage": 5,
        "maxPositionSize": 0.1
      },
      "stats": {
        "totalTrades": 0,
        "winningTrades": 0,
        "losingTrades": 0,
        "totalPnl": 0,
        "winRate": 0,
        "avgLatency": 0,
        "signalsGenerated": 0,
        "uptime": 0
      }
    }
  ],
  "systemStatus": {
    "totalBots": 12,
    "runningBots": 3,
    "totalSignals": 45,
    "totalPnl": 12.5,
    "avgWinRate": 0.65
  }
}
```

### Get Single Bot

```http
GET /api/bots/{botType}
```

### Start Bot

```http
POST /api/bots/{botType}
Content-Type: application/json

{
  "action": "start"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot HFT started successfully"
}
```

### Stop Bot

```http
POST /api/bots/{botType}
Content-Type: application/json

{
  "action": "stop"
}
```

### Update Bot Config

```http
PATCH /api/bots/{botType}
Content-Type: application/json

{
  "symbol": "ETHUSDT",
  "leverage": 3,
  "maxPositionSize": 0.5
}
```

### Get Signals

```http
GET /api/signals?bot=HFT&limit=50
```

### Publish Signal

```http
POST /api/signals
Content-Type: application/json

{
  "source": "HFT",
  "symbol": "BTCUSDT",
  "exchange": "binance",
  "direction": "LONG",
  "confidence": 0.85,
  "entryPrice": 50000,
  "stopLoss": 49500,
  "takeProfit": 51000
}
```

## Bot Categories

| Category | Bots | Description |
|----------|------|-------------|
| **Operational** | MESH, SCALE, BAND | Core trading strategies |
| **Institutional** | PND, TRND, FCST, RNG, LMB | Advanced strategies |
| **Frequency** | HFT, MFT, LFT | Time-based strategies |
| **Meta** | LOGOS | Signal aggregation |

## Bot Status

| Status | Description |
|--------|-------------|
| `idle` | Bot is not running |
| `starting` | Bot is initializing |
| `running` | Bot is active and processing |
| `stopping` | Bot is shutting down |
| `error` | Bot encountered an error |
| `paused` | Bot is temporarily paused |

## Using Bot Manager in Code

```typescript
import { getBotManager } from '@/lib/bot-manager'

const manager = getBotManager()

// Get all bots
const bots = manager.getAllBots()

// Get bots by category
const frequencyBots = manager.getBotsByCategory('frequency')

// Start a bot
const result = await manager.startBot('HFT')
console.log(result.message)

// Stop a bot
await manager.stopBot('HFT')

// Update config
manager.updateBotConfig('HFT', {
  symbol: 'ETHUSDT',
  leverage: 3,
})

// Record trade
manager.recordTrade('HFT', pnl, isWin, latency)

// Get system status
const status = manager.getSystemStatus()
```

## Market Data Service

```typescript
import { getMarketDataService } from '@/lib/bot-manager/market-data-service'

const marketData = getMarketDataService()

// Get ticker
const ticker = await marketData.getTicker({
  exchange: 'binance',
  symbol: 'BTCUSDT',
})

// Get orderbook
const orderbook = await marketData.getOrderbook({
  exchange: 'binance',
  symbol: 'BTCUSDT',
}, 20)

// Get candles
const candles = await marketData.getCandles({
  exchange: 'binance',
  symbol: 'BTCUSDT',
}, '1m', 100)

// Get mid price
const midPrice = await marketData.getMidPrice({
  exchange: 'binance',
  symbol: 'BTCUSDT',
})
```

## Bot Integration

```typescript
import { getBotIntegration } from '@/lib/bot-manager/integration'

const integration = getBotIntegration()

// Start bot integration
await integration.startBot({
  botCode: 'HFT',
  exchange: 'binance',
  symbol: 'BTCUSDT',
  credentials: {
    apiKey: 'your-api-key',
    apiSecret: 'your-api-secret',
  },
})

// Stop bot
integration.stopBot('HFT')
```

## Bot Control Panel (UI)

The `BotControlPanel` component provides a visual interface for managing bots:

```tsx
import { BotControlPanel } from '@/components/bots/bot-control-panel'

export default function BotsPage() {
  return <BotControlPanel />
}
```

**Features:**
- View all bots by category
- Start/stop individual bots
- View real-time statistics
- System status overview
- Batch operations (Start All / Stop All)
- Configuration access

## Statistics Tracking

Each bot tracks:
- `totalTrades` - Total number of trades
- `winningTrades` - Profitable trades
- `losingTrades` - Loss trades
- `totalPnl` - Total profit/loss
- `winRate` - Win percentage
- `avgLatency` - Average execution latency
- `signalsGenerated` - Number of signals produced
- `uptime` - Time bot has been running

## Event Bus Integration

Bots automatically integrate with the Event Bus:

```typescript
// Bot registration
eventBus.registerBot({
  metadata: { code: 'HFT', name: 'Helios', ... },
  status: 'active',
  registeredAt: Date.now(),
  subscriptions: ['trading.order.*', 'market.orderbook.*'],
})

// Signal publishing
eventBus.publish('analytics.signal.HFT', {
  id: 'sig_123',
  timestamp: Date.now(),
  category: 'analytics',
  source: 'HFT',
  type: 'signal.generated',
  data: { direction: 'LONG', confidence: 0.85 },
})
```

## File Structure

```
src/lib/bot-manager/
├── index.ts                    # Bot Manager class
├── market-data-service.ts      # Market data fetching
└── integration.ts              # Bot integration layer

src/app/api/bots/
├── route.ts                    # List all bots
└── [botType]/
    └── route.ts                # Single bot operations

src/app/api/signals/
└── route.ts                    # Signal operations

src/components/bots/
└── bot-control-panel.tsx       # UI component
```
