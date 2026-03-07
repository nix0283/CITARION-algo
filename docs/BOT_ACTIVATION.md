# Bot Activation & Testing Documentation

## Overview

This document describes the Bot Activation & Testing layer of the CITARION platform. This layer provides API endpoints, UI components, and real-time integration for managing and monitoring all trading bots.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOT ACTIVATION LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   HFT API    │  │   MFT API    │  │   LFT API    │          │
│  │  /bots/hft   │  │  /bots/mft   │  │  /bots/lft   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│  ┌────────────────────────▼────────────────────────┐           │
│  │              FREQUENCY BOTS API                  │           │
│  │              /api/bots/frequency                 │           │
│  └────────────────────────┬────────────────────────┘           │
│                           │                                     │
│  ┌────────────────────────▼────────────────────────┐           │
│  │                LOGOS META BOT API                │           │
│  │                /api/bots/logos                   │           │
│  └────────────────────────┬────────────────────────┘           │
│                           │                                     │
│  ┌────────────────────────▼────────────────────────┐           │
│  │            EXCHANGE STREAM API                   │           │
│  │            /api/bots/exchange-stream             │           │
│  └────────────────────────┬────────────────────────┘           │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Event Bus   │  │     UEA      │  │ Bot Registry │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Frequency Bots API (`/api/bots/frequency`)

#### GET - List all frequency bots

```http
GET /api/bots/frequency
```

**Response:**
```json
{
  "success": true,
  "bots": [
    {
      "code": "HFT",
      "name": "Helios",
      "fullName": "High Frequency Trading Bot",
      "category": "frequency",
      "description": "Microstructure analysis and high-speed order execution",
      "status": "idle",
      "enabled": false,
      "stats": {
        "totalTrades": 0,
        "winningTrades": 0,
        "totalPnl": 0,
        "winRate": 0,
        "avgLatency": 0
      }
    },
    // ... MFT, LFT
  ],
  "systemStatus": {
    "totalBots": 3,
    "runningBots": 0,
    "category": "frequency"
  }
}
```

#### POST - Control frequency bots

```http
POST /api/bots/frequency
Content-Type: application/json

{
  "action": "start",      // "start" | "stop" | "configure"
  "botCode": "HFT",       // "HFT" | "MFT" | "LFT"
  "config": {             // Optional config (for start/configure)
    "symbol": "BTCUSDT",
    "exchange": "binance",
    "maxPositionSize": 0.1,
    "imbalanceThreshold": 0.3
  }
}
```

### 2. LOGOS Meta Bot API (`/api/bots/logos`)

#### GET - Get LOGOS status

```http
GET /api/bots/logos
```

**Response:**
```json
{
  "success": true,
  "bot": {
    "code": "LOGOS",
    "name": "Logos",
    "fullName": "Meta Bot - Signal Aggregator",
    "category": "meta",
    "status": "running",
    "enabled": true,
    "config": {
      "minSignals": 2,
      "minConfidence": 0.5,
      "minConsensus": 0.6,
      "aggregationWindowMs": 5000
    },
    "performances": [
      {
        "botCode": "HFT",
        "accuracy": 0.65,
        "totalSignals": 100
      }
    ]
  }
}
```

#### POST - Control LOGOS

```http
POST /api/bots/logos
Content-Type: application/json

{
  "action": "start",      // "start" | "stop" | "configure" | "inject_signal"
  "config": {             // Optional
    "minSignals": 3,
    "minConfidence": 0.6
  }
}
```

### 3. Exchange Stream API (`/api/bots/exchange-stream`)

#### GET - List active streams

```http
GET /api/bots/exchange-stream
```

#### POST - Manage streams

```http
POST /api/bots/exchange-stream
Content-Type: application/json

{
  "action": "subscribe",    // "subscribe" | "unsubscribe" | "unsubscribe_all"
  "config": {
    "exchange": "binance",
    "symbol": "BTCUSDT",
    "channels": ["ticker", "orderbook", "kline"],
    "interval": "1m"        // For kline channel
  }
}
```

## UI Components

### FrequencyBotPanel

Located at: `/src/components/bots/frequency-bot-panel.tsx`

**Features:**
- Real-time bot status monitoring
- Start/Stop controls for each bot
- Win rate and PnL visualization
- Latency indicators (color-coded)
- LOGOS integration panel
- Signal feed display

**Usage:**
```tsx
import { FrequencyBotPanel } from '@/components/bots/frequency-bot-panel'

export default function TradingPage() {
  return <FrequencyBotPanel />
}
```

### Bot Status Indicators

| Status | Color | Description |
|--------|-------|-------------|
| `idle` | Gray | Bot is not running |
| `starting` | Yellow | Bot is initializing |
| `running` | Green | Bot is active and trading |
| `stopping` | Yellow | Bot is shutting down |
| `error` | Red | Bot encountered an error |
| `paused` | Orange | Bot is temporarily paused |

### Latency Indicators

| Latency | Color | Performance |
|---------|-------|-------------|
| < 10ms | Green | Excellent |
| 10-100ms | Yellow | Good |
| > 100ms | Red | Needs optimization |

## Signal Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    SIGNAL GENERATION                         │
│                                                              │
│  HFT Bot ──┬──► Orderbook Imbalance Signal                  │
│            ├──► Momentum Signal                              │
│            └──► Volume Surge Signal                          │
│                                                              │
│  MFT Bot ──┬──► Statistical Arbitrage Signal                 │
│            ├──► Mean Reversion Signal                        │
│            └──► Pairs Trading Signal                         │
│                                                              │
│  LFT Bot ──┬──► Trend Following Signal                      │
│            ├──► Swing Trading Signal                         │
│            └──► Multi-timeframe Signal                       │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    EVENT BUS (TOPICS)                        │
│                                                              │
│  analytics.signal.HFT                                       │
│  analytics.signal.MFT                                       │
│  analytics.signal.LFT                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    LOGOS AGGREGATION                         │
│                                                              │
│  1. Collect signals within aggregation window (5s)          │
│  2. Weight by category, confidence, performance             │
│  3. Calculate consensus (agreement level)                   │
│  4. Detect conflicts (opposing signals)                     │
│  5. Generate aggregated signal if thresholds met            │
│                                                              │
│  Thresholds:                                                 │
│  - minSignals: 2                                             │
│  - minConfidence: 0.5                                        │
│  - minConsensus: 0.6                                         │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    AGGREGATED SIGNAL OUTPUT                  │
│                                                              │
│  {                                                           │
│    "id": "logos_xxx",                                       │
│    "direction": "LONG",                                     │
│    "confidence": 0.75,                                      │
│    "consensus": 0.85,                                       │
│    "participatingBots": ["HFT", "MFT", "LFT"],              │
│    "entryPrice": 50000,                                     │
│    "stopLoss": 49500,                                       │
│    "takeProfit": 51000,                                     │
│    "signalQuality": "high"                                  │
│  }                                                           │
└──────────────────────────────────────────────────────────────┘
```

## Bot Configuration

### HFT Bot Configuration

```typescript
interface HFTConfig {
  symbol: string              // Trading pair (e.g., "BTCUSDT")
  exchange: string            // Exchange ID (e.g., "binance")
  analysisIntervalMs: number  // Analysis interval (default: 100ms)
  imbalanceThreshold: number  // Orderbook imbalance threshold (0-1)
  stopLossPercent: number     // Stop loss percentage
  takeProfitPercent: number   // Take profit percentage
  maxPositionSize: number     // Maximum position size
  maxOrdersPerMinute: number  // Rate limit
  maxDrawdownPercent: number  // Maximum drawdown
  enableMomentumSignals: boolean
}
```

### MFT Bot Configuration

```typescript
interface MFTConfig {
  symbol: string
  exchange: string
  timeframe: string           // Analysis timeframe (e.g., "5m")
  lookbackPeriod: number      // Historical data lookback
  zScoreThreshold: number     // Z-score entry threshold
  maxPositionSize: number
  stopLossPercent: number
  takeProfitPercent: number
}
```

### LFT Bot Configuration

```typescript
interface LFTConfig {
  symbol: string
  exchange: string
  primaryTimeframe: string    // Primary trend timeframe (e.g., "4h")
  confirmationTimeframe: string
  trendStrengthThreshold: number
  maxPositionSize: number
  trailingStopPercent: number
}
```

### LOGOS Aggregation Configuration

```typescript
interface AggregationConfig {
  minSignals: number          // Minimum signals to aggregate
  minConfidence: number       // Minimum confidence threshold
  minConsensus: number        // Minimum consensus to act
  
  categoryWeights: {
    operational: number       // Weight for operational bots
    institutional: number     // Weight for institutional bots
    frequency: number         // Weight for frequency bots
  }
  
  confidenceWeighting: boolean
  performanceWeighting: boolean
  
  conflictResolution: 'strict' | 'moderate' | 'loose'
  conflictThreshold: number
  
  aggregationWindowMs: number
  signalDecay: boolean
  decayRate: number
}
```

## Error Handling

### Bot Errors

All bot errors are tracked and displayed in the UI:

```typescript
interface BotError {
  code: string
  message: string
  timestamp: number
  stack?: string
  recoverable: boolean
}
```

### Error Recovery

1. **Automatic Recovery**: Bots with recoverable errors attempt to restart automatically
2. **Manual Recovery**: Critical errors require manual intervention
3. **Circuit Breaker**: Stops bot after 10 consecutive errors

## Performance Metrics

### Tracked Metrics

| Metric | Description |
|--------|-------------|
| `totalTrades` | Total number of trades executed |
| `winningTrades` | Number of profitable trades |
| `losingTrades` | Number of unprofitable trades |
| `totalPnl` | Total profit/loss |
| `winRate` | Win rate percentage |
| `avgLatency` | Average processing latency (ms) |
| `maxDrawdown` | Maximum drawdown percentage |
| `signalsGenerated` | Total signals generated |

## Testing

### Manual Testing

1. Start the development server: `bun run dev`
2. Navigate to the Frequency Bot Panel
3. Start individual bots using the toggle switches
4. Monitor the signal feed for generated signals
5. Start LOGOS to begin signal aggregation

### API Testing

```bash
# Get all frequency bots
curl http://localhost:3000/api/bots/frequency

# Start HFT bot
curl -X POST http://localhost:3000/api/bots/frequency \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "botCode": "HFT"}'

# Get LOGOS status
curl http://localhost:3000/api/bots/logos

# Start LOGOS
curl -X POST http://localhost:3000/api/bots/logos \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'
```

## Best Practices

1. **Start LOGOS before starting trading bots** to ensure signal aggregation is ready
2. **Monitor latency metrics** to ensure optimal performance
3. **Use conservative settings** for initial testing
4. **Check error logs** regularly for any issues
5. **Review signal quality** before acting on aggregated signals

## Troubleshooting

### Bot Won't Start

1. Check if exchange API credentials are configured
2. Verify network connectivity to exchange
3. Check for error messages in the bot card
4. Review system logs for detailed errors

### No Signals Generated

1. Verify bot is in "running" status
2. Check market data stream is active
3. Verify symbol is correct
4. Check signal thresholds are appropriate

### High Latency

1. Check network connectivity
2. Verify system resources are adequate
3. Consider using closer server location
4. Reduce analysis frequency if needed

## Future Enhancements

1. **WebSocket Real-time Updates**: Replace polling with WebSocket for instant updates
2. **Advanced Bot Configuration UI**: Modal for detailed bot configuration
3. **Signal History Charts**: Visual representation of signal performance
4. **Backtesting Integration**: Test bot configurations with historical data
5. **Alert System**: Notifications for important events
6. **Performance Analytics Dashboard**: Detailed performance analysis
