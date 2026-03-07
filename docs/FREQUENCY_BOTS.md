# Frequency Bots (HFT/MFT/LFT)

## Overview

Frequency bots are specialized trading systems designed to operate at different time scales and trading frequencies. Each bot type is optimized for specific market conditions and latency requirements.

## Структура меню в Sidebar

Раздел **Частотные** является декоративным контейнером со следующими подразделами:

| Подраздел | ID | Описание |
|-----------|-----|----------|
| Дашборд | `frequency-bots` | Обзор всех частотных ботов |
| HFT | `hft-bot` | High Frequency Trading (Гелиос) |
| MFT | `mft-bot` | Medium Frequency Trading (Селена) |
| LFT | `lft-bot` | Low Frequency Trading (Атлас) |

## Bot Classification

| Bot | Code | Frequency | Latency Target | Trades/Day |
|-----|------|-----------|----------------|------------|
| Helios | HFT | High | < 10ms | 100+ |
| Selene | MFT | Medium | < 100ms | 10-50 |
| Atlas | LFT | Low | < 1s | 1-10 |

---

## HFT Bot - Helios

### Description
High Frequency Trading bot specializing in market microstructure analysis. Designed for latency-sensitive strategies.

### Strategy
- **Orderbook Imbalance**: Detect bid/ask imbalances for directional signals
- **Spread Capture**: Profit from bid-ask spread
- **Momentum Signals**: Short-term price momentum
- **Latency Arbitrage**: (Optional) Cross-exchange arbitrage

### Configuration
```typescript
import { HFTEngine, DEFAULT_HFT_CONFIG, type HFTConfig } from '@/lib/hft-bot'

const config: HFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  leverage: 5,
  
  // Entry parameters
  entryThreshold: 0.7,        // Min signal strength to enter
  orderbookDepth: 20,         // Orderbook levels to analyze
  imbalanceThreshold: 0.3,    // Orderbook imbalance threshold
  
  // Exit parameters
  takeProfitPercent: 0.1,     // 0.1% take profit
  stopLossPercent: 0.05,      // 0.05% stop loss
  trailingStopPercent: 0.03,  // 0.03% trailing stop
  
  // Risk management
  maxPositionSize: 0.1,       // BTC
  maxOrdersPerMinute: 30,
  maxDrawdownPercent: 5,
  
  // Timing
  analysisIntervalMs: 100,    // 100ms analysis cycle
  orderTimeoutMs: 50,         // 50ms order timeout
  
  // Features
  enableLatencyArbitrage: false,
  enableSpreadCapture: true,
  enableMomentumSignals: true,
}

const engine = new HFTEngine(config)
await engine.start()
```

### Microstructure Analysis

#### Orderbook Snapshot
```typescript
interface OrderbookSnapshot {
  symbol: string
  exchange: string
  timestamp: number
  
  bids: [number, number][]  // [price, quantity]
  asks: [number, number][]
  
  // Calculated metrics
  bidVolume: number
  askVolume: number
  imbalance: number     // (bidVol - askVol) / total
  spread: number        // Best ask - best bid
  spreadPercent: number
  midPrice: number
  vwap: number
}
```

#### Signal Generation
```typescript
interface MicrostructureSignal {
  timestamp: number
  signalType: 'imbalance_long' | 'imbalance_short' | 'spread_capture' | 'momentum_up' | 'momentum_down' | 'none'
  strength: number       // 0-1
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  entryPrice: number
  stopLoss: number
  takeProfit: number
  confidence: number
  metadata: {
    imbalance?: number
    spread?: number
    momentum?: number
    volume?: number
  }
}
```

### Usage Example
```typescript
import { HFTEngine } from '@/lib/hft-bot'

const bot = new HFTEngine({
  symbol: 'BTCUSDT',
  exchange: 'binance',
  maxPositionSize: 0.1,
})

// Start the engine
await bot.start()

// Monitor state
const state = bot.getState()
console.log('Status:', state.status)
console.log('Total trades:', state.totalTrades)
console.log('Avg latency:', state.avgLatency, 'ms')

// Get trade history
const trades = bot.getTrades()
```

---

## MFT Bot - Selene

### Description
Medium Frequency Trading bot specializing in volume profile analysis and market regime detection.

### Strategy
- **Volume Profile**: Identify high-volume nodes as support/resistance
- **VWAP Analysis**: Trade bounces from VWAP
- **Regime Detection**: Adapt strategy to market conditions
- **Multi-Timeframe**: Confirm signals across timeframes

### Configuration
```typescript
import { MFTEngine, DEFAULT_MFT_CONFIG, type MFTConfig } from '@/lib/mft-bot'

const config: MFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  leverage: 3,
  
  // Timeframes
  primaryTimeframe: '15m',
  higherTimeframe: '1h',
  lowerTimeframe: '5m',
  
  // Volume profile
  volumeProfilePeriods: 100,
  volumeNodeThreshold: 0.7,
  
  // Entry/Exit
  entryThreshold: 0.6,
  requireHigherTFConfirmation: true,
  takeProfitRR: 2.0,
  stopLossATR: 1.5,
  trailingStopATR: 1.0,
  
  // Risk
  maxPositionSize: 0.5,
  maxDailyTrades: 10,
  maxDrawdownPercent: 10,
  
  // Timing
  analysisIntervalMs: 5000,  // 5 seconds
  
  // Features
  enableVolumeProfile: true,
  enableRegimeDetection: true,
  enableMTFConfirmation: true,
}

const engine = new MFTEngine(config)
await engine.start()
```

### Volume Profile Analysis

```typescript
interface VolumeProfile {
  symbol: string
  timeframe: string
  nodes: VolumeNode[]
  poc: number        // Point of Control (highest volume)
  vah: number        // Value Area High (70% of volume)
  val: number        // Value Area Low
  timestamp: number
}

interface VolumeNode {
  price: number
  volume: number
  isHighVolume: boolean
  isPOC: boolean
}
```

### Market Regime Detection

```typescript
interface MarketRegime {
  type: 'trending' | 'ranging' | 'volatile' | 'quiet'
  strength: number     // 0-1
  direction: 'up' | 'down' | 'sideways'
  confidence: number
  timestamp: number
}
```

---

## LFT Bot - Atlas

### Description
Low Frequency Trading bot specializing in trend following and multi-timeframe analysis.

### Strategy
- **Trend Following**: Ride established trends
- **Support/Resistance**: Key level trading
- **Fibonacci Levels**: Retracement entries
- **Position Scaling**: Scale in/out of positions

### Configuration
```typescript
import { LFTEngine, DEFAULT_LFT_CONFIG, type LFTConfig } from '@/lib/lft-bot'

const config: LFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  leverage: 2,
  
  // Timeframes
  primaryTimeframe: '4h',
  higherTimeframe: '1d',
  lowerTimeframe: '1h',
  
  // Trend parameters
  trendPeriod: 50,
  trendThreshold: 0.02,
  
  // Entry/Exit
  entryThreshold: 0.7,
  requireHigherTFConfirmation: true,
  pullbackEntry: true,
  takeProfitRR: 3.0,
  stopLossATR: 2.0,
  trailingStopATR: 1.5,
  timeBasedExit: 72,  // hours
  
  // Position management
  maxPositionSize: 1.0,
  positionScaleIn: true,
  positionScaleOut: true,
  scaleInPercent: 2,
  scaleOutPercent: 5,
  
  // Risk
  maxWeeklyTrades: 5,
  maxDrawdownPercent: 15,
  riskPerTrade: 2,    // % of account
  
  // Timing
  analysisIntervalMs: 60000,  // 1 minute
  
  // Features
  enableTrendFollowing: true,
  enableSupportResistance: true,
  enableFibonacci: true,
  enablePositionScaling: true,
}

const engine = new LFTEngine(config)
await engine.start()
```

### Trend Analysis

```typescript
interface TrendAnalysis {
  direction: 'up' | 'down' | 'sideways'
  strength: number       // 0-1
  slope: number          // Price change per period
  ema: number            // Current EMA value
  pricePosition: 'above' | 'below' | 'neutral'
  confidence: number
  timestamp: number
}
```

### Multi-Timeframe Analysis

```typescript
interface MultiTimeframeAnalysis {
  higherTF: {
    trend: TrendAnalysis
    bias: 'bullish' | 'bearish' | 'neutral'
  }
  primaryTF: {
    trend: TrendAnalysis
    sr: SupportResistance | null
    fib: FibonacciLevels | null
  }
  lowerTF: {
    trend: TrendAnalysis
    entry: {
      optimal: boolean
      price: number | null
    }
  }
  alignment: 'aligned' | 'conflicting' | 'neutral'
  overallBias: 'bullish' | 'bearish' | 'neutral'
  confidence: number
}
```

### Position Scaling

```typescript
interface LFTPosition {
  // ... base fields
  
  // Position sizing
  baseQuantity: number
  currentQuantity: number
  scaledIn: boolean
  
  // Multiple TP levels
  takeProfit1: number
  takeProfit2?: number
  takeProfit3?: number
  
  // Status
  tp1Hit: boolean
  tp2Hit: boolean
  tp3Hit: boolean
}
```

---

## Integration with Event Bus

All frequency bots integrate with the orchestration layer:

```typescript
import { getEventBus } from '@/lib/orchestration'

const bus = getEventBus()

// Subscribe to signals from frequency bots
await bus.subscribe('analytics.signal.*', (event) => {
  if (event.category === 'analytics' && event.type === 'signal.generated') {
    const { botId, direction, confidence } = event.data
    
    if (['HFT', 'MFT', 'LFT'].includes(botId)) {
      console.log(`Signal from ${botId}: ${direction} (${confidence})`)
    }
  }
})
```

## Performance Metrics

All engines track the following metrics:

| Metric | Description |
|--------|-------------|
| totalTrades | Total number of trades |
| winningTrades | Number of profitable trades |
| losingTrades | Number of losing trades |
| totalPnl | Total profit/loss |
| maxDrawdown | Maximum drawdown percentage |
| avgLatency | Average execution latency |
| winRate | Winning trade percentage |

## File Structure

```
src/lib/
├── hft-bot/
│   ├── index.ts       # Module exports
│   ├── types.ts       # Type definitions
│   └── engine.ts      # HFT engine implementation
├── mft-bot/
│   ├── index.ts
│   └── engine.ts      # MFT engine with VP and regime detection
└── lft-bot/
    ├── index.ts
    └── engine.ts      # LFT engine with trend following
```

## Risk Levels

| Bot | Risk Level | Description |
|-----|------------|-------------|
| HFT | Aggressive | High trade frequency, tight stops |
| MFT | Moderate | Balanced approach, daily limits |
| LFT | Conservative | Low frequency, wide stops, scaling |
