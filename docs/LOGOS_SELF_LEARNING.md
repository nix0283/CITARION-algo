# LOGOS Self-Learning System

## Overview

LOGOS (Meta Bot) is an intelligent signal aggregator that learns from your trading activity to improve its recommendations over time.

## Learning Sources

LOGOS learns from two main sources:

### 1. Manual Trades
When you execute trades manually through the CITARION UI, LOGOS records:
- Trade entry and exit prices
- Duration and outcome
- Market conditions at the time
- Symbol and exchange details

### 2. Signal Trades (Chatbot)
When you send signals to the chatbot and they are executed:
- Original signal confidence
- Signal source bot (HFT, MFT, LFT, etc.)
- Signal reasoning
- Execution outcome

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TRADE SOURCES                           │
├─────────────────────────────────────────────────────────────┤
│  Manual Trades  │  Chatbot Signals  │  Bot Executions      │
└────────┬────────┴────────┬──────────┴────────┬─────────────┘
         │                 │                    │
         ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  SELF-LEARNING ENGINE                       │
├─────────────────────────────────────────────────────────────┤
│  • recordTrade()        - Store trade outcome              │
│  • updateBotPerformance() - Track bot accuracy             │
│  • updateLearningModel()  - Adjust weights                 │
│  • adjustConfidence()     - Modify signal confidence       │
└────────┬─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    LEARNING MODEL                           │
├─────────────────────────────────────────────────────────────┤
│  botWeights:          { "HFT": 0.7, "MFT": 0.5, ... }      │
│  symbolPreferences:   { "BTCUSDT": ["HFT", "MFT"], ... }    │
│  conditionMultipliers:{ "high_volatility": 0.8, ... }       │
│  timePreferences:     { "0": 0.5, "1": 0.6, ... }          │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   SIGNAL AGGREGATION                        │
├─────────────────────────────────────────────────────────────┤
│  • Weighted signal combination based on bot accuracy        │
│  • Symbol-specific bot preferences                          │
│  • Time-based confidence adjustments                        │
│  • Market condition multipliers                             │
└─────────────────────────────────────────────────────────────┘
```

## Database Models

### LearningTrade
Stores every trade for learning purposes:
```prisma
model LearningTrade {
  id              String   @id
  source          String   // 'manual', 'signal', 'bot'
  botCode         String?  // For signal/bot trades
  symbol          String
  exchange        String
  direction       String   // 'LONG', 'SHORT'
  entryPrice      Float
  exitPrice       Float
  size            Float
  pnl             Float
  pnlPercent      Float
  duration        Int      // milliseconds
  timestamp       DateTime
  success         Boolean
  marketConditions String?
  signalConfidence Float?
  signalReason    String?
  createdAt       DateTime @default(now())
}
```

### BotPerformance
Tracks performance metrics for each bot:
```prisma
model BotPerformance {
  botCode            String   @unique
  totalSignals       Int
  successfulSignals  Int
  failedSignals      Int
  accuracy           Float
  avgPnl             Float
  avgPnlPercent      Float
  bestConditions     String   // JSON
  worstConditions    String   // JSON
  preferredSymbols   String   // JSON
  avoidedSymbols     String   // JSON
  lastUpdated        DateTime @updatedAt
}
```

### LearningModel
Stores the learned model state:
```prisma
model LearningModel {
  botWeights          String   // JSON
  symbolPreferences   String   // JSON
  conditionMultipliers String  // JSON
  timePreferences     String   // JSON
  totalSamples        Int
  lastUpdated         DateTime @updatedAt
}
```

## API Functions

### Recording Trades

```typescript
import { recordTrade } from '@/lib/logos-bot/self-learning'

// Record a manual trade
await recordTrade({
  id: 'trade_123',
  source: 'manual',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  direction: 'LONG',
  entryPrice: 50000,
  exitPrice: 51000,
  size: 0.1,
  pnl: 100,
  pnlPercent: 2,
  duration: 3600000, // 1 hour
  timestamp: Date.now(),
  success: true,
  marketConditions: {
    volatility: 0.02,
    trend: 'up',
    volume: 1000000
  }
})
```

### Getting Bot Performance

```typescript
import { getBotPerformance } from '@/lib/logos-bot/self-learning'

const perf = await getBotPerformance('HFT')
// Returns:
// {
//   botCode: 'HFT',
//   totalSignals: 50,
//   successfulSignals: 32,
//   accuracy: 0.64,
//   avgPnl: 45.5,
//   preferredSymbols: ['BTCUSDT', 'ETHUSDT'],
//   ...
// }
```

### Adjusting Confidence

```typescript
import { adjustConfidence } from '@/lib/logos-bot/self-learning'

// Original signal confidence from HFT bot
const baseConfidence = 0.75

// Adjust based on learning
const adjusted = await adjustConfidence(
  baseConfidence,
  'HFT',        // botCode
  'BTCUSDT',    // symbol
  { volatility: 0.02, trend: 'up' }  // market conditions
)

// If HFT has good accuracy on BTCUSDT in uptrends,
// adjusted might be 0.82
// If HFT has poor accuracy, adjusted might be 0.68
```

### Getting Insights

```typescript
import { getLearningInsights } from '@/lib/logos-bot/self-learning'

const insights = await getLearningInsights()
// Returns array of insights:
// [
//   { type: 'success', message: 'HFT has 64% accuracy', recommendation: '...' },
//   { type: 'warning', message: 'MFT has low accuracy on ETHUSDT', recommendation: '...' },
//   ...
// ]
```

## Integration Points

### 1. Trading Form (Manual Trades)
When user executes a trade through the UI, record it:
```typescript
// In trading form submission
onSubmit: async (data) => {
  // Execute trade...
  const result = await executeTrade(data)
  
  // Record for learning
  await recordTrade({
    id: result.id,
    source: 'manual',
    ...result
  })
}
```

### 2. Chatbot Signal Handler
When chatbot generates/executes a signal:
```typescript
// In signal handler
const signal = await generateSignal(message)

if (signal.executed) {
  await recordTrade({
    id: signal.tradeId,
    source: 'signal',
    botCode: signal.botCode,
    signalConfidence: signal.confidence,
    signalReason: signal.reason,
    ...signal.tradeData
  })
}
```

### 3. Bot Executions
When any bot executes a trade:
```typescript
// In bot engine
const trade = await executeTrade(signal)

await recordTrade({
  id: trade.id,
  source: 'bot',
  botCode: 'HFT',
  ...trade
})
```

## Learning Algorithm

### Bot Weight Calculation
```
weight = base_weight (0.5) + (accuracy - 0.5) * adjustment_factor

Where:
- base_weight = 0.5 (neutral starting point)
- accuracy = successfulSignals / totalSignals
- adjustment_factor = 0.02 per trade outcome
```

### Confidence Adjustment
```
adjusted_confidence = base_confidence 
                    + (bot_weight - 0.5) * 0.3
                    + (time_preference - 0.5) * 0.1
```

### Symbol Preferences
```
preferredSymbols[symbol] = bots where:
  - accuracy > 60%
  - avgPnlPercent > 1%
  - at least 5 trades on that symbol
```

## Best Practices

1. **Minimum Data**: Wait for at least 10 trades before relying on learning insights
2. **Regular Review**: Check learning insights weekly to identify bot performance trends
3. **Symbol Focus**: Let learning run on your primary trading pairs for better accuracy
4. **Market Conditions**: Learning considers volatility, trend, and volume

## Monitoring

Access learning stats via API:
```typescript
const stats = await getLearningStats()
// {
//   totalTrades: 150,
//   manualTrades: 45,
//   signalTrades: 60,
//   botTrades: 45,
//   overallAccuracy: 0.58,
//   avgPnl: 23.5,
//   topBot: 'HFT',
//   topBotAccuracy: 0.67
// }
```

## Version History

- **1.0.0** - Initial implementation with manual and signal trade learning
