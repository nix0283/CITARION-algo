# LOGOS Meta Bot

## Overview

LOGOS is the meta bot responsible for signal aggregation and consensus building across all trading bots in the CITARION platform. Named after the Greek word for "reason" or "logic", it synthesizes signals from operational, institutional, and frequency bots to produce unified trading decisions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LOGOS META BOT                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│   │  Operational    │   │ Institutional   │   │   Frequency     │       │
│   │     Bots        │   │     Bots        │   │     Bots        │       │
│   │ MESH SCALE BAND │   │ PND TRND FCST   │   │  HFT MFT LFT    │       │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘       │
│            │                     │                     │                 │
│            └─────────────────────┼─────────────────────┘                 │
│                                  │                                       │
│                                  ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    SIGNAL AGGREGATOR                              │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│   │  │   Weight    │  │  Consensus  │  │  Conflict   │              │   │
│   │  │  Calculator │  │   Builder   │  │  Resolver   │              │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                       │
│                                  ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                  AGGREGATED SIGNAL OUTPUT                         │   │
│   │  - Direction: LONG/SHORT/NEUTRAL                                 │   │
│   │  - Confidence: 0-1                                                │   │
│   │  - Consensus: Agreement level                                     │   │
│   │  - Entry/SL/TP: Weighted averages                                 │   │
│   │  - Participating bots                                             │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Signal Flow

1. **Signal Collection**: LOGOS subscribes to `analytics.signal.*` topics
2. **Weighting**: Each signal is weighted by:
   - Bot category (institutional bots have higher weight)
   - Signal confidence
   - Historical bot performance
   - Signal age (decay)
3. **Aggregation**: Signals within a time window are combined
4. **Consensus**: Agreement level is calculated
5. **Conflict Resolution**: Conflicting signals are resolved
6. **Output**: Aggregated signal is published

## Quick Start

```typescript
import { LOGOSEngine, DEFAULT_AGGREGATION_CONFIG } from '@/lib/logos-bot'

// Create LOGOS engine with default config
const logos = new LOGOSEngine()

// Start listening for signals
await logos.start()

// Check status
const status = logos.getStatus()
console.log('Status:', status.status)

// Get bot performances
const performances = logos.getBotPerformances()
console.log('Bot accuracies:', performances.map(p => ({
  bot: p.botCode,
  accuracy: p.accuracy,
  totalSignals: p.totalSignals,
})))

// Stop engine
await logos.stop()
```

## Configuration

```typescript
import { LOGOSEngine, type AggregationConfig } from '@/lib/logos-bot'

const config: Partial<AggregationConfig> = {
  // Minimum signals to aggregate
  minSignals: 2,
  
  // Minimum confidence threshold
  minConfidence: 0.5,
  
  // Minimum consensus to act
  minConsensus: 0.6,
  
  // Bot category weights
  categoryWeights: {
    operational: 1.0,     // MESH, SCALE, BAND
    institutional: 1.2,   // PND, TRND, FCST, RNG, LMB
    frequency: 0.9,       // HFT, MFT, LFT
  },
  
  // Enable confidence-based weighting
  confidenceWeighting: true,
  
  // Enable performance-based weighting
  performanceWeighting: true,
  
  // Conflict resolution mode
  conflictResolution: 'moderate',  // 'strict' | 'moderate' | 'loose'
  conflictThreshold: 0.3,          // Difference threshold for conflict
  
  // Time window for signal aggregation
  aggregationWindowMs: 5000,       // 5 seconds
  
  // Signal decay
  signalDecay: true,
  decayRate: 0.01,                 // Per second
}

const logos = new LOGOSEngine(config)
```

## Aggregation Methods

### Weighted Voting

```typescript
// Each signal contributes based on:
weight = categoryWeight * confidence * performance * timeDecay

// Example:
// HFT signal: 0.9 * 0.7 * 0.65 * 1.0 = 0.41
// TRND signal: 1.2 * 0.8 * 0.75 * 0.95 = 0.68
```

### Consensus Building

```typescript
consensus = max(weightedLongScore, weightedShortScore) / 
            (weightedLongScore + weightedShortScore)

// High consensus (> 0.7): Strong agreement
// Medium consensus (0.5-0.7): Moderate agreement
// Low consensus (< 0.5): Weak agreement, conflict detected
```

### Conflict Resolution

| Mode | Description |
|------|-------------|
| `strict` | Any conflict → NEUTRAL signal |
| `moderate` | Use majority direction with reduced confidence |
| `loose` | Ignore conflicts, use weighted score |

## Signal Output

```typescript
interface AggregatedSignal {
  id: string
  timestamp: number
  symbol: string
  exchange: string
  
  // Decision
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number          // 0-1
  consensus: number           // 0-1
  
  // Entry/Exit
  entryPrice: number
  stopLoss: number
  takeProfit: number
  riskRewardRatio: number
  
  // Details
  participatingBots: BotCode[]
  longVotes: number
  shortVotes: number
  weightedLongScore: number
  weightedShortScore: number
  
  // Quality
  signalQuality: 'high' | 'medium' | 'low'
  conflictDetected: boolean
}
```

## Example Signal Flow

```
Time    Bot     Direction  Confidence  Weight
─────────────────────────────────────────────
0ms     HFT     LONG       0.7         0.41
50ms    MFT     LONG       0.6         0.32
100ms   TRND    LONG       0.8         0.72
150ms   MESH    SHORT      0.5         0.25
200ms   FCST    LONG       0.75        0.68
─────────────────────────────────────────────

Aggregation (within 5000ms window):
  Long votes: 4
  Short votes: 1
  Weighted Long: 2.13
  Weighted Short: 0.25
  
Result:
  Direction: LONG
  Confidence: 0.89
  Consensus: 0.89
  Signal Quality: HIGH
```

## Performance Tracking

LOGOS tracks performance for each bot:

```typescript
interface BotPerformance {
  botCode: BotCode
  totalSignals: number
  longSignals: number
  shortSignals: number
  correctSignals: number
  incorrectSignals: number
  accuracy: number
  avgConfidence: number
  weightedScore: number
}
```

### Updating Performance

```typescript
// After trade outcome is known
logos.updateOutcome('TRND', true)  // Correct prediction
logos.updateOutcome('HFT', false)  // Incorrect prediction
```

## Integration with Event Bus

```typescript
import { getEventBus } from '@/lib/orchestration'

const bus = getEventBus()

// Subscribe to LOGOS signals
await bus.subscribe('analytics.signal.LOGOS', (event) => {
  if (event.category === 'analytics') {
    console.log('LOGOS signal:', event.data)
  }
})
```

## Best Practices

1. **Calibrate Category Weights**: Adjust based on bot reliability
2. **Monitor Consensus**: Low consensus indicates market uncertainty
3. **Track Performance**: Update outcomes for better weighting
4. **Handle Conflicts**: Use 'strict' mode for risk-averse trading
5. **Adjust Time Window**: Shorter for HFT, longer for LFT signals

## File Structure

```
src/lib/logos-bot/
├── index.ts      # Module exports
├── engine.ts     # LOGOS engine implementation
└── ml-integration.ts  # ML-Enhanced LOGOS Engine
```

---

## ML-Enhanced LOGOS Engine

### Overview

The ML-Enhanced LOGOS Engine extends the base LOGOS with machine learning-based signal filtering and quality assessment.

**Location:** `/src/lib/logos-bot/ml-integration.ts`

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ML-ENHANCED LOGOS ENGINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌──────────┐ │
│   │  Signal   │──▶│ ML Filter │──▶│ Weight    │──▶│ Consensus│ │
│   │  Input    │   │ (Lawrence)│   │ Calculator│   │  Builder │ │
│   └───────────┘   └───────────┘   └───────────┘   └──────────┘ │
│                          │                                       │
│                          ▼                                       │
│                  ┌───────────────────┐                          │
│                  │ Quality Assessment│                          │
│                  │  - ML Score       │                          │
│                  │  - Agreement      │                          │
│                  │  - Recommendation │                          │
│                  └───────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Usage

```typescript
import { getMLEnhancedLOGOS } from '@/lib/logos-bot/ml-integration'

const engine = getMLEnhancedLOGOS(
  // Aggregation config
  { 
    minSignals: 2, 
    minConsensus: 0.6,
    categoryWeights: {
      operational: 1.0,
      institutional: 1.2,
      frequency: 0.9
    }
  },
  // ML config
  { 
    enabled: true, 
    minMLScoreToInclude: 0.3,
    useRegimeFilter: true,
    useADXFilter: true,
    useVolatilityFilter: true
  }
)

await engine.start()

// Process signals with ML enhancement
const result = await engine.processSignals(signals, 'BTCUSDT', 'binance')

console.log(`Direction: ${result.direction}`)
console.log(`ML Score: ${result.ml.overallMLScore}`)
console.log(`Quality: ${result.ml.qualityAssessment}`)
console.log(`Recommendation: ${result.ml.mlRecommendation}`)
```

### ML Configuration

```typescript
interface MLEnhancedConfig {
  enabled: boolean                    // Enable ML filtering
  minMLScoreToInclude: number         // Minimum ML score to include signal (0-1)
  useRegimeFilter: boolean            // Filter by market regime
  useADXFilter: boolean               // Filter by trend strength
  useVolatilityFilter: boolean        // Filter by volatility
  confidenceBlendWeight: number       // Weight for ML confidence (0-1)
}
```

### ML-Enhanced Signal Output

```typescript
interface MLEnhancedAggregatedSignal extends AggregatedSignal {
  ml: {
    overallMLScore: number            // Average ML score of included signals
    qualityAssessment: 'HIGH' | 'MEDIUM' | 'LOW'
    mlRecommendation: 'TRADE' | 'EVALUATE' | 'WAIT' | 'AVOID'
    filterResults: {
      regime: boolean
      adx: boolean
      volatility: boolean
    }
    signalsFiltered: number           // Signals filtered out by ML
    signalsIncluded: number           // Signals passing ML filter
  }
}
```

### ML Weighting in Aggregation

The ML-Enhanced LOGOS uses ML scores in signal weighting:

```typescript
// Standard weight calculation
weight = categoryWeight * confidence * performance * timeDecay

// ML-Enhanced weight calculation
weight = categoryWeight * confidence * performance * timeDecay * mlScore

// Where mlScore is from Lawrence Classifier (0-1)
```

### Quality Assessment Logic

| ML Score | Quality | Recommendation |
|----------|---------|----------------|
| >= 0.7 | HIGH | TRADE |
| >= 0.4 | MEDIUM | EVALUATE |
| >= 0.25 | LOW | WAIT |
| < 0.25 | LOW | AVOID |

### Integration with Bots

```typescript
// In signal processing pipeline
import { getMLEnhancedLOGOS } from '@/lib/logos-bot/ml-integration'

const logos = getMLEnhancedLOGOS()

// Signals from various bots
const signals = [
  { source: 'HFT', direction: 'LONG', confidence: 0.7, ... },
  { source: 'TRND', direction: 'LONG', confidence: 0.8, ... },
  { source: 'ORION', direction: 'LONG', confidence: 0.75, ... },
]

// Process with ML enhancement
const result = await logos.processSignals(signals, 'BTCUSDT', 'binance')

if (result.ml.mlRecommendation === 'TRADE') {
  // Execute trade with high confidence
  executeTrade(result)
} else if (result.ml.mlRecommendation === 'EVALUATE') {
  // Additional analysis needed
  requestManualReview(result)
}
```
