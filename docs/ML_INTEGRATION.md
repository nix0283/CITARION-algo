# ML Integration - Lawrence Classifier Signal Pipeline

## Overview

This document describes the integration of the Lawrence Classifier (k-NN with Lorentzian distance) into the CITARION signal pipeline for signal quality enhancement and filtering.

## Architecture

### Signal Pipeline Flow

```
Bot Signal → Event Bus → ML Signal Filter → LOGOS Aggregation → Signal Output
     │                        │                      │
     │                        ▼                      │
     │                  Lawrence Classifier         │
     │                   (k-NN Filter)              │
     │                        │                      │
     └────────────────────────┴──────────────────────┘
                    Quality Scored Signal
```

### Components

1. **Lawrence Classifier** (`/src/lib/ml/lawrence-classifier.ts`)
   - k-NN classifier using Lorentzian distance
   - Feature extraction from market data
   - Regime/ADX/Volatility filters
   - Training and evaluation methods

2. **ML Signal Filter** (`/src/lib/ml/ml-signal-filter.ts`)
   - Integration layer between signals and classifier
   - Signal quality scoring
   - Confidence adjustment
   - Auto-training on high-quality signals

3. **ML-Enhanced LOGOS** (`/src/lib/logos-bot/ml-integration.ts`)
   - ML-weighted signal aggregation
   - Quality assessment
   - Recommendation generation

4. **API Endpoints**
   - `/api/ml/filter` - Filter signals through ML pipeline
   - `/api/ml/stats` - Get ML statistics
   - `/api/ml/train` - Training data management

## ML Signal Filter

### Configuration

```typescript
interface MLFilterConfig {
  // Enable/disable filtering
  enabled: boolean
  
  // Minimum confidence to pass filter
  minConfidence: number  // 0-1, default: 0.3
  
  // Minimum ML agreement to pass
  minMLAgreement: number  // 0-1, default: 0.4
  
  // Enable filter components
  useRegimeFilter: boolean
  useADXFilter: boolean
  useVolatilityFilter: boolean
  
  // Direction confirmation
  requireDirectionConfirmation: boolean
  directionConfirmationThreshold: number  // 0-1
  
  // Confidence adjustment
  adjustConfidence: boolean
  confidenceBlendWeight: number  // 0-1, weight for ML confidence
  
  // Auto-training
  autoTrain: boolean
  trainingThreshold: number  // Confidence threshold for auto-training
  
  // Quality thresholds
  highQualityThreshold: number  // 0-1
  lowQualityThreshold: number   // 0-1
}
```

### Filter Result

```typescript
interface FilteredSignal {
  // Original signal data
  original: SignalForFiltering
  
  // ML classification result
  mlResult: LawrenceResult
  
  // Filter decision
  passed: boolean
  rejectionReasons: string[]
  
  // Adjusted values
  adjustedDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
  adjustedConfidence: number
  
  // Quality metrics
  mlScore: number          // 0-1, ML agreement with signal
  qualityScore: number     // 0-1, overall signal quality
  riskScore: number        // 0-1, risk assessment (lower is better)
  
  // Recommendation
  recommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
  suggestedAdjustments?: {
    direction?: 'LONG' | 'SHORT' | 'NEUTRAL'
    confidenceMultiplier?: number
    additionalStopLossPercent?: number
    additionalTakeProfitPercent?: number
  }
}
```

## Usage

### Filtering a Signal

```typescript
import { getMLSignalFilter, type SignalForFiltering } from '@/lib/ml/ml-signal-filter'

const filter = getMLSignalFilter()

const signal: SignalForFiltering = {
  botCode: 'HFT',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  direction: 'LONG',
  confidence: 0.75,
  entryPrice: 67500,
  marketData: {
    high: [...],
    low: [...],
    close: [...],
    volume: [...]
  }
}

const result = await filter.filter(signal)

if (result.passed) {
  console.log(`Signal approved with quality score: ${result.qualityScore}`)
  console.log(`Adjusted confidence: ${result.adjustedConfidence}`)
} else {
  console.log(`Signal rejected: ${result.rejectionReasons.join(', ')}`)
}
```

### Using the API

```bash
# Filter a signal
curl -X POST http://localhost:3000/api/ml/filter \
  -H "Content-Type: application/json" \
  -d '{
    "signal": {
      "botCode": "HFT",
      "symbol": "BTCUSDT",
      "exchange": "binance",
      "direction": "LONG",
      "confidence": 0.75
    }
  }'

# Get statistics
curl http://localhost:3000/api/ml/stats

# Add training sample
curl -X POST http://localhost:3000/api/ml/train \
  -H "Content-Type: application/json" \
  -d '{
    "samples": [{
      "features": { "n_rsi": 0.6, "n_cci": 0.5 },
      "label": "LONG",
      "weight": 0.8,
      "timestamp": 1699999999999
    }]
  }'
```

## ML-Enhanced LOGOS Aggregation

The ML-Enhanced LOGOS Engine extends the base LOGOS with ML-based signal filtering:

```typescript
import { getMLEnhancedLOGOS } from '@/lib/logos-bot/ml-integration'

const engine = getMLEnhancedLOGOS(
  // Aggregation config
  { minSignals: 2, minConsensus: 0.6 },
  // ML config
  { enabled: true, minMLScoreToInclude: 0.3 }
)

await engine.start()

// Process signals with ML enhancement
const result = await engine.processSignals(signals, 'BTCUSDT', 'binance')

console.log(`Direction: ${result.direction}`)
console.log(`ML Score: ${result.ml.overallMLScore}`)
console.log(`Quality: ${result.ml.qualityAssessment}`)
console.log(`Recommendation: ${result.ml.mlRecommendation}`)
```

## Lawrence Classifier

### Feature Extraction

The classifier extracts features from market data:

- **n_rsi**: Normalized RSI (0-1)
- **n_cci**: Normalized CCI (0-1)
- **n_wt**: Normalized WaveTrend (0-1)
- **n_adx**: Normalized ADX (0-1)
- **n_deriv**: Normalized price derivative
- **n_volume**: Normalized volume ratio
- **n_roc5/n_roc10**: Rate of change features

### Lorentzian Distance

The classifier uses Lorentzian distance instead of Euclidean:

```
d(x,y) = Σ log(1 + |xi - yi|)
```

This provides better robustness to outliers in financial data.

### Filters

1. **Regime Filter**: Detects trending vs ranging markets
2. **ADX Filter**: Filters by trend strength
3. **Volatility Filter**: Filters excessive volatility

## UI Component

The ML Filtering Panel (`/src/components/ml/ml-filtering-panel.tsx`) provides:

- **Overview Tab**: Statistics, quality metrics, rejection reasons
- **Configuration Tab**: Filter settings and component toggles
- **Test Filter Tab**: Test signal filtering with custom parameters
- **Training Tab**: Classifier training statistics and settings

## Performance Considerations

1. **Latency**: ML filtering adds ~1-5ms per signal
2. **Memory**: Training data limited to 2000 samples (configurable)
3. **CPU**: k-NN is O(n*k) where n=samples, k=neighbors (default 8)

## Bot-Specific ML Integration

### Bots WITH Direct ML Integration

| Bot | Integration Type | Benefit |
|-----|-----------------|----------|
| **DCA Bot** | Entry/Exit timing | Better level selection, market phase detection |
| **BB Bot** | Breakout classification | Distinguish Genuine/False breakouts |
| **ORION Bot** | Trend confirmation | EMA alignment quality assessment |
| **Zenbot Engine** | Signal filtering | Strategy confirmation, quality scoring |

### Bots WITHOUT Direct ML Integration

| Bot | Reason |
|-----|--------|
| **GRID Bot** | Direction-agnostic grid logic |
| **HFT Bot** | Latency critical (ML adds ~5ms) |
| **REED Bot** | Uses classical statistical methods |
| **VISION Bot** | Already has VISION Signal Filter (ensemble) |

See [ML Bot Integration](./ML_BOT_INTEGRATION.md) for detailed documentation.

## UI Navigation

The ML Filtering Panel provides unified navigation between:

```
┌─────────────────────────────────────────────────────────────────┐
│  ML FILTER  ←→  LOGOS ENGINE  ←→  BACKTESTING                  │
│     │                │                 │                       │
│     ▼                ▼                 ▼                       │
│  Signal         Aggregated        Historical                   │
│  Filtering      Signals           Validation                   │
└─────────────────────────────────────────────────────────────────┘
```

### Navigation Component

```typescript
import { MLIntegrationNav } from '@/components/ml/ml-integration-nav'

<MLIntegrationNav
  activeTab="filter"
  onTabChange={(tab) => setActiveTab(tab)}
/>
```

### ML Filtering Panel Tabs

| Tab | Description |
|-----|-------------|
| **Обзор** | Statistics, quality metrics, rejection reasons |
| **Конфигурация** | Filter settings and component toggles |
| **Тест фильтра** | Test signal filtering with custom parameters |
| **Обучение** | Classifier training statistics and settings |
| **Интеграции** | Bot integration status and pipeline visualization |

## Next Steps

1. **Training Data Collection**: Gather historical signal outcomes
2. **Model Evaluation**: Track prediction accuracy over time
3. **Feature Engineering**: Add more predictive features
4. **Ensemble Methods**: Combine multiple classifiers
5. **Real-time Learning**: Continuous model updates

## Files Created

- `/src/lib/ml/ml-signal-filter.ts` - ML Signal Filter integration layer
- `/src/lib/ml/bot-ml-integration.ts` - Bot-specific ML integration service
- `/src/lib/logos-bot/ml-integration.ts` - ML-Enhanced LOGOS Engine
- `/src/app/api/ml/filter/route.ts` - Filter API endpoint
- `/src/app/api/ml/bot-integration/route.ts` - Bot ML integration API
- `/src/app/api/ml/stats/route.ts` - Statistics API endpoint
- `/src/app/api/ml/train/route.ts` - Training API endpoint
- `/src/components/ml/ml-filtering-panel.tsx` - UI component
- `/src/components/ml/ml-integration-nav.tsx` - Navigation component
