# ML Pipeline Enhancement - Immediate Tasks

## Overview

This document describes the implementation of immediate enhancement tasks for the ML signal pipeline:

1. **Training Data Collection** - System for collecting historical signal outcomes
2. **Signal Pipeline Testing** - End-to-end testing framework
3. **WebSocket Integration** - Real-time updates replacing polling

## 1. Training Data Collection

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRAINING DATA COLLECTION SYSTEM                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────────┐     ┌──────────────────────────┐  │
│  │   SIGNALS   │────►│  TRAINING DATA  │────►│   LAWRENCE CLASSIFIER    │  │
│  │   (DB)      │     │   COLLECTOR     │     │                          │  │
│  └─────────────┘     └─────────────────┘     └──────────────────────────┘  │
│         │                    │                          │                  │
│         │                    ▼                          │                  │
│         │           ┌─────────────────┐                 │                  │
│         │           │  SAMPLE QUEUE   │                 │                  │
│         │           └─────────────────┘                 │                  │
│         │                    │                          │                  │
│         ▼                    ▼                          ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        PRISMA DATABASE                               │   │
│  │  ┌───────────────┐ ┌────────────────┐ ┌───────────────────────────┐│   │
│  │  │ClassifiedSignal│ │MLTrainingSample│ │MLEvaluationMetrics        ││   │
│  │  └───────────────┘ └────────────────┘ └───────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Components

#### TrainingDataCollector

**Location:** `/src/lib/ml/training-data-collector.ts`

**Features:**
- Collects signals from database (ClassifiedSignal model)
- Extracts features from trade market data
- Calculates normalized indicators (RSI, Trend, Volatility, Momentum)
- Auto-trains Lawrence Classifier when threshold reached
- Tracks statistics by bot and symbol

**Configuration:**
```typescript
interface CollectionConfig {
  minHoldingTime: number      // 60 seconds
  maxHoldingTime: number      // 1 week
  winThreshold: number        // 0.5% profit
  lossThreshold: number       // -0.5% loss
  botCodes: string[]          // All active bots
  autoTrain: boolean          // true
  minSamplesForTraining: number // 50
}
```

**Usage:**
```typescript
import { getTrainingDataCollector } from '@/lib/ml/training-data-collector'

const collector = getTrainingDataCollector()

// Collect all training data
const samples = await collector.collectAll()

// Record signal outcome
await collector.recordSignalOutcome({
  signalId: 'sig_123',
  botCode: 'HFT',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  direction: 'LONG',
  confidence: 0.8,
  outcome: 'WIN',
  pnlPercent: 2.5,
  features: { n_rsi: 0.6, n_trend: 0.7, ... },
  timestamp: Date.now(),
})
```

### Database Models

#### MLTrainingSample

```prisma
model MLTrainingSample {
  id          String   @id @default(cuid())
  sourceType  String   // SIGNAL, TRADE, MANUAL
  direction   String   // LONG, SHORT, NEUTRAL
  label       String   // Actual outcome
  features    String   // JSON: normalized features
  pnlPercent  Float
  holdingTime Int
  outcome     String   // WIN, LOSS, BREAKEVEN
  weight      Float
  symbol      String
  botCode     String
  signalTime  DateTime
  resolvedAt  DateTime?
}
```

#### MLEvaluationMetrics

```prisma
model MLEvaluationMetrics {
  periodStart    DateTime
  periodEnd      DateTime
  totalSamples   Int
  overallAccuracy Float
  precision      Float
  recall         Float
  f1Score        Float
  avgPnlPercent  Float
  profitFactor   Float
  sharpeRatio    Float
  byBotMetrics   String   // JSON
  bySymbolMetrics String   // JSON
}
```

### API Endpoints

#### GET /api/ml/training

```bash
# Get statistics
curl /api/ml/training?action=stats

# Get configuration
curl /api/ml/training?action=config

# Export training data
curl /api/ml/training?action=export
```

#### POST /api/ml/training

```bash
# Collect training data
curl -X POST /api/ml/training -d '{"action": "collect"}'

# Train classifier
curl -X POST /api/ml/training -d '{"action": "train"}'

# Record outcome
curl -X POST /api/ml/training -d '{
  "action": "record_outcome",
  "outcome": {
    "signalId": "sig_123",
    "botCode": "HFT",
    "symbol": "BTCUSDT",
    ...
  }
}'
```

## 2. Signal Pipeline Testing

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SIGNAL PIPELINE TESTER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 1: CLASSIFIER TESTS                                                  │
│  ├── testClassifierBasic()         - Basic classification                   │
│  ├── testClassifierFeatures()      - Feature extraction                     │
│  └── testClassifierTraining()      - Training functionality                 │
│                                                                             │
│  STAGE 2: FILTER TESTS                                                       │
│  ├── testFilterBasic()             - Basic filtering                        │
│  ├── testFilterWithMarketData()    - Market data integration                │
│  └── testFilterConfiguration()     - Configuration updates                  │
│                                                                             │
│  STAGE 3: LOGOS TESTS                                                        │
│  ├── testLOGOSBasic()              - Basic LOGOS functionality               │
│  ├── testLOGOSAggregation()        - Signal aggregation                      │
│  └── testLOGOSConflictResolution() - Conflict handling                       │
│                                                                             │
│  STAGE 4: END-TO-END TESTS                                                   │
│  ├── testEndToEndPipeline()        - Full pipeline test                      │
│  ├── testMultipleSignals()         - Batch processing                        │
│  └── testHighFrequencySignals()    - HFT performance                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Test Results Format

```typescript
interface PipelineTestSuiteResult {
  totalTests: number
  passedTests: number
  failedTests: number
  results: PipelineTestResult[]
  totalDuration: number
  avgDuration: number
}

interface PipelineTestResult {
  passed: boolean
  stage: string
  duration: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  error?: string
}
```

### Performance Targets

| Test | Target | Description |
|------|--------|-------------|
| Basic Filter | < 5ms | Single signal processing |
| Market Data Filter | < 10ms | With feature extraction |
| LOGOS Aggregation | < 50ms | Multi-signal aggregation |
| High Frequency | < 10ms avg | 100 signals rapid processing |

### API Endpoint

```bash
# Run all pipeline tests
curl -X POST /api/ml/pipeline-test

# Response
{
  "success": true,
  "summary": {
    "total": 12,
    "passed": 11,
    "failed": 1,
    "passRate": "91.7%",
    "totalDuration": "245.32ms",
    "avgDuration": "20.44ms"
  },
  "results": [...]
}
```

## 3. WebSocket Integration

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ML WEBSOCKET SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                          ┌─────────────────────────┐  │
│  │  SERVER (API)   │◄────────────────────────►│  CLIENT (Browser)      │  │
│  │                 │     WebSocket Connection  │                         │  │
│  └─────────────────┘                          └─────────────────────────┘  │
│         │                                                │                   │
│         │                                                │                   │
│         ▼                                                ▼                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        MESSAGE TYPES                                 │   │
│  │  ┌────────────────────────────────────────────────────────────┐    │   │
│  │  │ ml:signal:filtered     - Signal filtered through ML        │    │   │
│  │  │ ml:signal:aggregated   - LOGOS aggregated signal           │    │   │
│  │  │ ml:stats:updated       - Statistics updated                │    │   │
│  │  │ ml:training:progress   - Training progress update          │    │   │
│  │  │ ml:model:updated       - Model updated                     │    │   │
│  │  │ ml:alert               - Alert notification                │    │   │
│  │  └────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Message Types

#### ml:signal:filtered

```typescript
interface FilteredSignalPayload {
  signalId: string
  botCode: string
  symbol: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  originalConfidence: number
  adjustedConfidence: number
  mlScore: number
  qualityScore: number
  recommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
  passed: boolean
}
```

#### ml:signal:aggregated

```typescript
interface AggregatedSignalPayload {
  signalId: string
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  consensus: number
  participatingBots: string[]
  mlScore: number
  qualityAssessment: string
}
```

#### ml:stats:updated

```typescript
interface StatsUpdatedPayload {
  filterStats: {
    totalSignals: number
    passedSignals: number
    rejectedSignals: number
    avgQualityScore: number
  }
  classifierStats: {
    totalSamples: number
    winRate: number
  }
}
```

### Client Usage

```typescript
import { useMLWebSocket } from '@/lib/ml/ml-websocket'

function MyComponent() {
  const { connect, subscribe, isConnected } = useMLWebSocket()
  
  useEffect(() => {
    connect()
    
    // Subscribe to filtered signals
    const unsub = subscribe('ml:signal:filtered', (payload) => {
      console.log('Signal filtered:', payload)
      // Update UI
    })
    
    return unsub
  }, [])
  
  return <div>Connected: {isConnected()}</div>
}
```

### Server-Side Broadcasting

```typescript
import { createMLMessage } from '@/lib/ml/ml-websocket'

// Broadcast filtered signal
const message = createMLMessage('ml:signal:filtered', {
  signalId: 'sig_123',
  botCode: 'HFT',
  symbol: 'BTCUSDT',
  direction: 'LONG',
  ...
})

// Send to all connected clients
broadcastToAll(message)
```

## Files Created

| File | Description | Lines |
|------|-------------|-------|
| `/src/lib/ml/training-data-collector.ts` | Training data collection system | ~670 |
| `/src/lib/ml/signal-pipeline-tester.ts` | Pipeline testing framework | ~550 |
| `/src/lib/ml/ml-websocket.ts` | WebSocket integration | ~350 |
| `/src/app/api/ml/training/route.ts` | Training API endpoints | ~150 |
| `/src/app/api/ml/pipeline-test/route.ts` | Testing API endpoint | ~60 |
| `prisma/schema.prisma` | Added MLTrainingSample, MLEvaluationMetrics models | ~100 |

## Database Migration

Run the following to apply new Prisma models:

```bash
npx prisma migrate dev --name add_ml_training_models
npx prisma generate
```

## Next Steps

After completing these immediate tasks, proceed to:

1. **Short-term**:
   - Model Evaluation Dashboard
   - Feature Importance Visualization
   - Signal Performance Charts

2. **Medium-term**:
   - Advanced Feature Engineering
   - Ensemble Methods
   - Real-time Learning

3. **Long-term**:
   - Deep Learning Integration
   - Reinforcement Learning
   - Multi-timeframe Analysis
