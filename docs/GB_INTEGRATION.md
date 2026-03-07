# Gradient Boosting Integration

## Overview

The Gradient Boosting Integration provides a complete ML-based signal quality scoring system with real exchange data support, training data collection, and integration with trading bots, LOGOS engine, and ML Signal Pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GRADIENT BOOSTING INTEGRATION ARCHITECTURE                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌───────────────┐    ┌─────────────────┐    ┌─────────────────────────┐   │
│   │   Exchange    │───▶│  Feature        │───▶│  GB Integration        │   │
│   │   WebSocket   │    │  Provider       │    │  Service               │   │
│   │   (Real-time) │    │  (18 features)  │    │                         │   │
│   └───────────────┘    └─────────────────┘    └─────────────────────────┘   │
│          │                      │                       │                    │
│          │                      │                       ▼                    │
│          │                      │            ┌─────────────────────────┐    │
│          │                      │            │  Enhanced Signal        │    │
│          │                      │            │  - Quality (0-100)      │    │
│          │                      │            │  - Direction            │    │
│          │                      │            │  - Confidence           │    │
│          │                      │            └─────────────────────────┘    │
│          │                      │                       │                    │
│          │                      ▼                       ▼                    │
│          │            ┌─────────────────┐    ┌─────────────────────────┐   │
│          │            │  Training Data  │    │  Trading Bots           │   │
│          └───────────▶│  Collector      │───▶│  (DCA, BB, ORION)       │   │
│                       │                 │    │  Use Score for Entry    │   │
│                       └─────────────────┘    └─────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Exchange Feature Provider

**Location:** `/src/lib/gradient-boosting/exchange-feature-provider.ts`

Extracts 18 features from exchange data for ML processing:

| Feature Group | Features | Description |
|--------------|----------|-------------|
| **Price** | return_1, return_5, return_10 | Returns over 1/5/10 periods |
| **Volatility** | volatility_10, volatility_20 | Volatility over 10/20 periods |
| **Technical** | rsi_14, macd, macd_signal, bollinger_position, adx | RSI, MACD, BB position, ADX |
| **Volume** | volume_ratio, volume_trend | Volume ratio and trend |
| **Trend** | ema_cross, supertrend_direction, trend_strength | Trend indicators |
| **Market** | funding_rate, basis, open_interest_change | Futures market data |

**Usage:**
```typescript
import { ExchangeFeatureProvider, getFeatureProvider } from '@/lib/gradient-boosting'

// Using factory function
const provider = getFeatureProvider('binance', 'BTCUSDT', '1h')
const features = provider.getFeaturesForSignal(candles)

// Using class directly
const provider = new ExchangeFeatureProvider({
  exchange: 'binance',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  lookbackPeriod: 100,
})
```

### 2. Training Data Collector

**Location:** `/src/lib/gradient-boosting/training-collector.ts`

Collects real trade outcomes for model training:

**Features:**
- Records signals with features at entry time
- Tracks pending signals awaiting outcome
- Records trade outcomes (win/loss, PnL, hold time)
- Provides statistics by bot and symbol
- Export/Import functionality for backup

**Usage:**
```typescript
import { getTrainingCollector } from '@/lib/gradient-boosting'

const collector = getTrainingCollector()

// Record a signal
const sampleId = collector.recordSignal({
  symbol: 'BTCUSDT',
  exchange: 'binance',
  botCode: 'DCA',
  direction: 'LONG',
  confidence: 0.75,
  entryPrice: 67500,
}, features)

// Record outcome
collector.recordOutcome(sampleId, {
  exitPrice: 68500,
  pnlPercent: 1.48,
  holdTimeMs: 3600000,
  maxDrawdown: 0.5,
  maxProfit: 2.1,
})

// Get statistics
const stats = collector.getStats()
```

### 3. GB Integration Service

**Location:** `/src/lib/gradient-boosting/gb-integration-service.ts`

Main service that ties everything together:

**Features:**
- Scores signals with real-time feature extraction
- Integrates with trading bots (DCA, BB, ORION, Zenbot)
- Provides scores for LOGOS aggregation
- Configurable filter modes (STRICT/MODERATE/LENIENT)
- Auto-training with collected data

**Usage:**
```typescript
import { getGBIntegration } from '@/lib/gradient-boosting'

const gbIntegration = getGBIntegration()

// Score a signal
const result = await gbIntegration.scoreBotSignal({
  botCode: 'DCA',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  direction: 'LONG',
  confidence: 0.75,
  entryPrice: 67500,
  candles: ohlcvData,
})

// Check result
if (result.passed) {
  console.log(`Signal approved with score: ${result.normalizedScore}`)
  console.log(`Recommendation: ${result.recommendation}`)
} else {
  console.log(`Signal rejected: ${result.filterReason}`)
}

// Get LOGOS score
const logosScore = await gbIntegration.getLOGOSScore(signal, candles)

// Adjust confidence
const adjustedConfidence = gbIntegration.adjustConfidence(0.75, result.gbScore)
```

## API Endpoints

### POST /api/ml/gradient-boosting/realtime

Real-time signal scoring:

```json
{
  "action": "score",
  "signal": {
    "botCode": "DCA",
    "symbol": "BTCUSDT",
    "exchange": "binance",
    "direction": "LONG",
    "confidence": 0.75,
    "entryPrice": 67500
  },
  "candles": [...]
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "normalizedScore": 72,
    "gbScore": {
      "confidence": 68,
      "direction": "LONG",
      "quality": "MEDIUM"
    },
    "passed": true,
    "recommendation": "MONITOR"
  }
}
```

### GET /api/ml/gradient-boosting/realtime?action=status

Get integration status:
- Pending signals count
- Training statistics
- Feature importance
- Bot integrations
- Configuration

### GET /api/ml/gradient-boosting/test

Test with real Binance data:

```
GET /api/ml/gradient-boosting/test?symbol=BTCUSDT&interval=1h&botCode=DCA
```

**Response includes:**
- Real market data from Binance
- Extracted features
- GB score
- Feature importance
- Configuration

## Bot Integration Status

| Bot | Integration | minScore | Features |
|-----|-------------|----------|----------|
| **DCA** | ✅ Enabled | 40 | Entry timing, market phase |
| **BB** | ✅ Enabled | 45 | Breakout classification |
| **ORION** | ✅ Enabled | 40 | Trend confirmation |
| **Zenbot** | ✅ Enabled | 35 | Strategy confirmation |
| **VISION** | ❌ Disabled | 50 | Has built-in ensemble |

## Filter Modes

| Mode | Confidence Threshold | Quality Filter |
|------|---------------------|----------------|
| **STRICT** | 50% | Rejects LOW quality |
| **MODERATE** | 50% | Allows all quality |
| **LENIENT** | 30% | Allows all quality |

## Integration with Other Systems

### ML Signal Pipeline

```typescript
import { getGBIntegration } from '@/lib/gradient-boosting'

// In ML Signal Pipeline
const gbScore = await gbIntegration.scoreBotSignal(signal, candles)
if (gbScore.passed) {
  // Include in pipeline output
  enhancedSignal.gbScore = gbScore.normalizedScore / 100
}
```

### LOGOS Engine

```typescript
// In LOGOS aggregation
const gbScore = await gbIntegration.getLOGOSScore(signal, candles)
// Use as weight in aggregation
weight = originalWeight * (0.5 + gbScore * 0.5)
```

### Trading Bots

```typescript
// In DCA Bot
const result = await gbIntegration.scoreBotSignal({
  botCode: 'DCA',
  ...signalData,
}, candles)

if (!result.passed) {
  // Skip entry
  return
}

// Adjust position size based on confidence
const adjustedSize = baseSize * result.gbScore.confidence
```

## Configuration

### Default Configuration

```typescript
{
  enabled: true,
  minScoreToPass: 40,
  minConfidenceToPass: 50,
  ensembleWeight: 0.25,
  autoTrain: true,
  trainIntervalMs: 86400000, // 24 hours
  useInLOGOS: true,
  filterMode: 'MODERATE',
}
```

### Update Configuration

```typescript
// Via API
POST /api/ml/gradient-boosting/realtime
{
  "action": "configure",
  "config": {
    "minScoreToPass": 45,
    "filterMode": "STRICT"
  },
  "botIntegration": {
    "botCode": "DCA",
    "minScore": 50
  }
}

// Via code
gbIntegration.updateConfig({ filterMode: 'STRICT' })
gbIntegration.updateBotIntegration('DCA', { minScore: 50 })
```

## Files Structure

```
src/lib/gradient-boosting/
├── index.ts                      # Main exports (728 lines)
├── exchange-feature-provider.ts  # Feature extraction (415 lines)
├── training-collector.ts         # Training data collection (290 lines)
├── gb-integration-service.ts     # Integration service (520 lines)
└── scorer-instance.ts            # Singleton instance

src/app/api/ml/gradient-boosting/
├── score/route.ts                # Signal scoring
├── stats/route.ts                # Statistics
├── history/route.ts              # Score history
├── realtime/route.ts             # Real-time integration
└── test/route.ts                 # Binance data testing
```

## Performance

| Metric | Value |
|--------|-------|
| Feature extraction | ~1-2ms |
| Signal scoring | ~0.5ms |
| Training (100 samples) | ~50ms |
| Memory footprint | ~2MB |

## Best Practices

1. **Start with MODERATE mode** - Good balance for most strategies
2. **Collect real outcomes** - For continuous model improvement
3. **Monitor feature importance** - Adjust features based on market conditions
4. **Use in combination with other ML** - GB works best in ensemble
5. **Adjust thresholds per bot** - Different bots have different requirements
