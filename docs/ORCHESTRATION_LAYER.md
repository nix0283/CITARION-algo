# CITARION Orchestration Layer

## Overview

The Orchestration Layer is the central nervous system of the CITARION trading platform. It provides unified event-driven communication between all trading bots, enabling real-time coordination, signal aggregation, and risk management.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CITARION Platform                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  HFT Bot    │  │  MFT Bot    │  │  LFT Bot    │                 │
│  │  (Helios)   │  │  (Selene)   │  │  (Atlas)    │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│                          ▼                                          │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                     EVENT BUS                                  │ │
│  │  (NATS JetStream / Redis / In-Memory)                         │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                          │                                          │
│         ┌────────────────┼────────────────┐                         │
│         │                │                │                         │
│         ▼                ▼                ▼                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Operational │  │Institutional│  │    LOGOS    │                 │
│  │    Bots     │  │    Bots     │  │  Meta Bot   │                 │
│  │ MESH/SCALE/ │  │ PND/TRND/   │  │  (Signal    │                 │
│  │    BAND     │  │ FCST/RNG    │  │ Aggregation)│                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                     │
│                          │                                          │
│                          ▼                                          │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │              UNIFIED EXCHANGE ADAPTER                          │ │
│  │     Binance │ Bybit │ OKX │ Bitget │ BingX                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Event Bus

The Event Bus is the central message broker for all inter-bot communication.

**Features:**
- Multiple backends: NATS JetStream, Redis, In-Memory
- Topic-based pub/sub with wildcards
- Bot registry for service discovery
- Event categorization for routing

**Topics:**
```typescript
// Trading events
trading.order.created
trading.order.submitted
trading.order.filled
trading.order.cancelled
trading.order.rejected

// Market events (wildcards supported)
market.price.{symbol}
market.orderbook.{symbol}
market.funding.{symbol}

// Analytics events
analytics.signal.{botCode}  // e.g., analytics.signal.HFT

// Risk events
risk.position.*
risk.limit.*
risk.drawdown

// System events
system.bot.*
system.health
```

**Usage:**
```typescript
import { initializeEventBus, getEventBus, TOPICS } from '@/lib/orchestration'

// Initialize on app startup
await initializeEventBus({ backend: 'memory', debug: true })

// Subscribe to signals from all bots
const bus = getEventBus()
await bus.subscribeToAllSignals((event) => {
  console.log('Signal received:', event)
})

// Publish a signal
await bus.publishSignal('HFT', {
  id: 'sig_123',
  timestamp: Date.now(),
  category: 'analytics',
  source: 'HFT',
  type: 'signal.generated',
  data: {
    botId: 'HFT',
    signalType: 'entry',
    direction: 'LONG',
    confidence: 0.85,
  },
})
```

### 2. Unified Exchange Adapter (UEA)

The UEA provides a consistent API for all supported exchanges.

**Supported Exchanges:**
- Binance
- Bybit
- OKX
- Bitget
- BingX

**Features:**
- Unified order management
- Position tracking
- Market data subscription
- Automatic event publishing

**Usage:**
```typescript
import { getUnifiedExchangeManager, type ExchangeCredentials } from '@/lib/orchestration'

const manager = getUnifiedExchangeManager()

// Connect to exchange
const credentials: ExchangeCredentials = {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
}
await manager.connect('binance', credentials)

// Create order (events are automatically published)
const order = await manager.createOrder('binance', {
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 0.001,
  price: 50000,
})

// Subscribe to market data
await manager.subscribeTicker('binance', 'BTCUSDT', (ticker) => {
  console.log('Ticker update:', ticker)
})
```

### 3. Bot Registry

The Bot Registry tracks all active bots and their capabilities.

**Bot Codes:**

| Code | Name | Category | Description |
|------|------|----------|-------------|
| MESH | Grid Bot | Operational | Market maker grid strategy |
| SCALE | DCA Bot | Operational | Dollar cost averaging |
| BAND | BB Bot | Operational | Bollinger Band mean reversion |
| PND | Argus | Institutional | Pump & dump detection |
| TRND | Orion | Institutional | Trend following |
| FCST | Vision | Institutional | Price forecasting |
| RNG | Range Bot | Institutional | Range trading |
| LMB | Lumibot | Institutional | AI assistant |
| HFT | Helios | Frequency | High frequency trading |
| MFT | Selene | Frequency | Medium frequency trading |
| LFT | Atlas | Frequency | Low frequency trading |
| LOGOS | Meta Bot | Meta | Signal aggregation |

## Event Types

### Trading Events
```typescript
interface TradingEvent {
  category: 'trading'
  type: 'order.created' | 'order.submitted' | 'order.filled' | ...
  data: {
    orderId: string
    symbol: string
    side: 'BUY' | 'SELL'
    orderType: 'MARKET' | 'LIMIT' | ...
    quantity: number
    price?: number
    exchange: string
  }
}
```

### Market Events
```typescript
interface MarketEvent {
  category: 'market'
  type: 'price.update' | 'orderbook.update' | 'funding.update' | ...
  data: {
    symbol: string
    exchange: string
    price?: number
    bid?: number
    ask?: number
    volume?: number
  }
}
```

### Analytics Events
```typescript
interface AnalyticsEvent {
  category: 'analytics'
  type: 'signal.generated' | 'signal.confirmed' | ...
  data: {
    signalId?: string
    botId: string
    signalType: 'entry' | 'exit' | 'modify'
    direction: 'LONG' | 'SHORT' | 'NEUTRAL'
    confidence: number
  }
}
```

## Latency Targets

| Bot Type | Target Latency | Analysis Interval |
|----------|---------------|-------------------|
| HFT | < 10ms | 100ms |
| MFT | < 100ms | 5s |
| LFT | < 1s | 60s |
| Operational | < 500ms | 1s |

## Configuration

### Event Bus Config
```typescript
interface EventBusConfig {
  backend: 'nats' | 'redis' | 'memory'
  natsUrl?: string       // e.g., 'nats://localhost:4222'
  redisUrl?: string      // e.g., 'redis://localhost:6379'
  appName?: string
  debug?: boolean
}
```

### NATS JetStream Setup (Production)
```bash
# Install NATS server
docker run -d --name nats \
  -p 4222:4222 \
  -p 8222:8222 \
  nats:latest -js

# Configure event bus
await initializeEventBus({
  backend: 'nats',
  natsUrl: 'nats://localhost:4222',
  debug: false,
})
```

## File Structure

```
src/lib/orchestration/
├── index.ts                    # Module exports
├── types.ts                    # Type definitions
├── event-bus.ts               # Event bus implementation
└── unified-exchange-adapter.ts # Exchange adapter
```

## Best Practices

1. **Always initialize the event bus** at application startup
2. **Use typed events** - Import types from `./types`
3. **Handle errors gracefully** - Events can fail
4. **Unsubscribe** when components unmount
5. **Use correlation IDs** for event chains
6. **Monitor latency** for HFT applications
