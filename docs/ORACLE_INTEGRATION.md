# CITARION Oracle Chat System

> AI-powered chat bot for signal parsing and trade execution

## Overview

Oracle is an intelligent chat system that enables trading through natural language signals. It parses Cornix-compatible trading signals and executes them on connected exchanges.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ORACLE CHAT SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐    │
│   │  Chat UI     │────▶│  Parse API   │────▶│  Demo/Real Trade API │    │
│   │  (Oracle)    │     │  /api/chat   │     │  /api/demo/trade     │    │
│   └──────────────┘     └──────────────┘     └──────────────────────┘    │
│          │                    │                      │                  │
│          │                    ▼                      ▼                  │
│          │            ┌──────────────┐     ┌──────────────────────┐    │
│          │            │ Signal Parser│     │  Position Database   │    │
│          │            │ (Cornix fmt) │     │  + Source Tracking   │    │
│          │            └──────────────┘     └──────────────────────┘    │
│          │                                          │                  │
│          │                                          ▼                  │
│          │            ┌──────────────┐     ┌──────────────────────┐    │
│          └───────────▶│WebSocket Svc │◀────│  Positions Table UI  │    │
│                       │  Port 3005   │     │  + Source Column     │    │
│                       └──────────────┘     └──────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Mini Services

| Service | Port | Purpose |
|---------|------|---------|
| **Chat Service** | 3005 | WebSocket two-way communication |
| **Telegram Bot** | 3006 | Standalone Telegram integration |
| **Risk Monitor** | 3004 | Real-time risk alerts |

## Signal Format

Oracle supports Cornix-compatible signal format:

### Futures Long
```
⚡⚡ #BTC/USDT ⚡⚡
Exchanges: Binance Futures
Signal Type: Regular (Long)
Leverage: Isolated (10X)
Entry: 67000
Take-Profit Targets: 1) 68000 2) 69000 3) 70000
Stop Targets: 1) 66000
```

### Futures Short
```
#ETH/USDT
SHORT
Entry: 3600
TP: 3500, 3400, 3300
Stop: 3700
Leverage: Cross x10
```

### Spot
```
#SOL/USDT SPOT
Buy: 150
TP1: 160
TP2: 170
Stop: 140
```

## Commands

| Command | Description |
|---------|-------------|
| `help` | Show all available commands |
| `positions` | Show open positions |
| `close all` | Close all positions |
| `close {SYMBOL}` | Close position by symbol |
| `close {SYMBOL} {DIR}` | Close specific direction |
| `delete signals` | Clear signal history |
| `clear database` | Full database reset |
| `шаблон` | Show signal templates |
| `long` / `short` / `spot` | Quick template access |

## Position Source Tracking

Each position tracks its origin:

| Source | Icon | Color | Description |
|--------|------|-------|-------------|
| **CHAT** | 💬 MessageSquare | Blue | Opened via Oracle chat |
| **TELEGRAM** | 🤖 Bot | Sky | Opened via Telegram bot |
| **PLATFORM** | 🖥️ Monitor | Gray | Opened via web interface |
| **EXTERNAL** | 🔗 ExternalLink | Purple | Detected on exchange |
| **SIGNAL** | 📈 TrendingUp | Amber | From signal provider |

## API Endpoints

### Demo Trading (No Auth Required)
```typescript
// Open position
POST /api/demo/trade
{
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "leverage": 10,
  "amount": 100,
  "exchangeId": "binance"
}

// Get positions
GET /api/demo/trade

// Close all
POST /api/demo/close-all
```

### Signal Parsing
```typescript
POST /api/chat/parse-signal
{
  "message": "BTCUSDT LONG Entry: 67000 TP: 68000 SL: 66000"
}
```

### Real Trading (Auth Required)
```typescript
POST /api/trade/open
{
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "amount": 100,
  "leverage": 10,
  "isDemo": true,
  "exchangeId": "binance"
}
```

## Supported Exchanges

| Exchange | Testnet | Demo | Real |
|----------|---------|------|------|
| Binance | ✅ | ❌ | ✅ |
| Bybit | ✅ | ❌ | ✅ |
| OKX | ❌ | ✅ | ✅ |
| Bitget | ❌ | ✅ | ✅ |
| BingX | ❌ | ✅ | ✅ |
| KuCoin | ✅ | ❌ | ✅ |
| HyperLiquid | ✅ | ❌ | ✅ |
| Gate.io | ❌ | ❌ | ✅ |

## Trading Modes

| Mode | Description | Requirements |
|------|-------------|--------------|
| **DEMO** | Virtual trading | None (auto demo account) |
| **TESTNET** | Exchange testnet | API keys (testnet) |
| **LIVE** | Real trading | API keys (production) |

## Event Subscriptions

Oracle subscribes to:
- `TRADING.POSITION.*` (opened, closed, liquidated)
- `ANALYTICS.SIGNAL.*` (all bot signals)
- `RISK.*` (limit breach, drawdown)
- `SYSTEM.BOT.*` (started, stopped, error)

## Notification Templates

| Event | Template |
|-------|----------|
| Position Opened | 🟢 {SYMBOL} {DIR} открыта |
| Position Closed | ✅ {SYMBOL} закрыта: +{PNL}% |
| Liquidation | 💀 ЛИКВИДАЦИЯ {SYMBOL} |
| Signal Generated | 📊 {BOT}: {SYMBOL} {DIR} |
| Drawdown Warning | ⚠️ Просадка: {DRAWDOWN}% |

## Integration with Cornix

```typescript
// Cornix API client
import { CornixApiClient } from '@/lib/cornix-api'

const client = new CornixApiClient(apiKey)

// Get signals
const signals = await client.getSignals()

// Sync positions
const positions = await client.getPositions()

// Execute signal
await client.executeSignal(signalId)
```

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start bot and show welcome |
| `/help` | Show available commands |
| `/status` | Show account status |
| `/positions` | Show open positions |
| `/balance` | Show account balance |
| `/settings` | Open settings keyboard |

---

*Document Version: 2.0.0*
*Platform Version: v2.0.0*
