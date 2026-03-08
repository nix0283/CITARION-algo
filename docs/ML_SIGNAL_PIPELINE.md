# ML Signal Pipeline Integration

## Overview

The ML Signal Pipeline integrates the Lawrence Classifier (k-NN with Lorentzian distance) into the trading signal flow. This provides signal quality enhancement, filtering, and confidence calibration for all trading bots.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIGNAL FLOW                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────┐    ┌───────────────┐    ┌──────────────────┐    │
│  │  HFT Bot  │───►│               │    │                  │    │
│  └───────────┘    │               │    │                  │    │
│  ┌───────────┐    │  ML SIGNAL    │───►│  Enhanced Signal │    │
│  │  MFT Bot  │───►│  PIPELINE     │    │  Output          │    │
│  └───────────┘    │               │    │                  │    │
│  ┌───────────┐    │  - Features   │    │  - Quality Score │    │
│  │  LFT Bot  │───►│  - Classify   │    │  - Agreement     │    │
│  └───────────┘    │  - Filter     │    │  - Filters       │    │
│  ┌───────────┐    │  - Enhance    │    │  - Adjusted Conf │    │
│  │   LOGOS   │───►│               │    │                  │    │
│  └───────────┘    └───────────────┘    └──────────────────┘    │
│                          │                                      │
│                          ▼                                      │
│                   ┌──────────────┐                            │
│                   │   Training   │                            │
│                   │   Feedback   │                            │
│                   └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Lawrence Classifier

A k-Nearest Neighbors classifier using Lorentzian distance for robust outlier handling.

**Key Features:**
- Lorentzian distance metric: `d(x,y) = sum(log(1 + |xi - yi|))`
- Weighted voting based on distance
- Confidence calibration
- Built-in filters (Regime, ADX, Volatility)

### 2. Signal Adapter

Converts trading signals to standardized format.

**Signal Types:**
| Value | Action |
|-------|--------|
| 1 | Start Long Trade |
| 2 | End Long Trade |
| -1 | Start Short Trade |
| -2 | End Short Trade |
| 0 | No Signal |

### 3. ML Signal Pipeline

Main orchestration class for signal enhancement.

## API Endpoints

### GET /api/ml/pipeline

Get ML Pipeline status and statistics.

```json
{
  "success": true,
  "pipeline": {
    "status": "active",
    "stats": {
      "totalSignals": 150,
      "confirmedSignals": 98,
      "rejectedSignals": 52,
      "avgProcessingTime": "125μs",
      "confirmationRate": "65.3%"
    },
    "classifier": {
      "totalSamples": 500,
      "longCount": 220,
      "shortCount": 180,
      "neutralCount": 100,
      "avgConfidence": "0.72",
      "winRate": "68.5%"
    }
  }
}
```

### POST /api/ml/pipeline

Control the ML Pipeline with various actions.

#### Configure Pipeline

```json
{
  "action": "configure",
  "config": {
    "enabled": true,
    "minConfidence": 0.5,
    "minQualityScore": 0.4,
    "agreementThreshold": 0.6,
    "useRegimeFilter": true,
    "useAdxFilter": true,
    "useVolatilityFilter": true,
    "autoTrain": true
  }
}
```

#### Enhance Signal

```json
{
  "action": "enhance",
  "signal": {
    "botCode": "HFT",
    "symbol": "BTCUSDT",
    "exchange": "binance",
    "direction": "LONG",
    "confidence": 0.75,
    "entryPrice": 50000,
    "timestamp": 1709251200000
  },
  "context": {
    "symbol": "BTCUSDT",
    "exchange": "binance",
    "timeframe": "1m",
    "open": [...],
    "high": [...],
    "low": [...],
    "close": [...],
    "volume": [...],
    "rsi": 45,
    "macd": 0.001,
    "atr": 500,
    "trend": "TRENDING_UP",
    "volatility": "MEDIUM"
  }
}
```

**Response:**

```json
{
  "success": true,
  "enhanced": {
    "id": "ml_1709251200000_abc123",
    "timestamp": 1709251200000,
    "source": {
      "botCode": "HFT",
      "originalDirection": "LONG",
      "originalConfidence": 0.75
    },
    "mlDirection": "LONG",
    "mlConfidence": 0.82,
    "mlProbability": 0.78,
    "quality": "HIGH",
    "qualityScore": 0.85,
    "agreement": "CONFIRMED",
    "agreementScore": 0.9,
    "entryPrice": 50000,
    "stopLoss": 49250,
    "takeProfit": 51500,
    "riskRewardRatio": 1.67,
    "filtersPassed": true,
    "filterResults": {
      "regime": true,
      "adx": true,
      "volatility": true,
      "session": true,
      "confidence": true
    },
    "processingTime": 125
  },
  "recommendation": {
    "action": "TRADE",
    "reason": "Signal approved"
  }
}
```

#### Train with Outcome

```json
{
  "action": "train",
  "signalId": "ml_1709251200000_abc123",
  "outcome": "WIN"
}
```

## Signal Quality Enhancement

### Quality Score Calculation

| Component | Weight | Description |
|-----------|--------|-------------|
| Confidence | 30% | ML classifier confidence |
| Probability | 25% | Direction probability |
| Agreement | 25% | Source vs ML agreement |
| Context | 20% | Market context score |

### Quality Levels

| Level | Score Range | Action |
|-------|-------------|--------|
| HIGH | >= 0.7 + Confirmed | Trade |
| MEDIUM | >= 0.4 | Evaluate |
| LOW | < 0.4 | Skip |

### Agreement Types

| Type | Description | Confidence Adjustment |
|------|-------------|----------------------|
| CONFIRMED | Source and ML agree | +15% bonus |
| CONFLICT | Source and ML disagree | -20% penalty |
| NEUTRAL | One or both neutral | No change |

## Filters

### 1. Regime Filter

Detects market regime (trending vs ranging).

```typescript
// Efficiency ratio calculation
efficiencyRatio = |netChange| / sum(|priceChange|)

// Threshold
if (efficiencyRatio > 0.5) -> TRENDING
else -> RANGING
```

### 2. ADX Filter

Filters based on trend strength.

```typescript
// ADX calculation
ADX > 20 -> Strong trend (pass)
ADX <= 20 -> Weak trend (fail)
```

### 3. Volatility Filter

Filters based on ATR volatility ratio.

```typescript
volatilityRatio = currentATR / avgATR

if (volatilityRatio < 1.5) -> Acceptable volatility
else -> Too volatile
```

### 4. Session Filter

Trading session awareness.

| Session | Hours (UTC) |
|---------|-------------|
| Asian | 00:00 - 08:00 |
| London | 08:00 - 16:00 |
| New York | 13:00 - 21:00 |
| London-NY Overlap | 13:00 - 16:00 |

## Integration with Trading Bots

### HFT Bot Integration

```typescript
import { getMLSignalPipeline } from '@/lib/ml'

// In HFT signal processing
const pipeline = getMLSignalPipeline()

const enhanced = await pipeline.processSignal(
  {
    botCode: 'HFT',
    symbol: 'BTCUSDT',
    exchange: 'binance',
    direction: signal.direction,
    confidence: signal.confidence,
    entryPrice: signal.entryPrice,
    timestamp: Date.now(),
  },
  {
    symbol: 'BTCUSDT',
    exchange: 'binance',
    timeframe: '1m',
    open, high, low, close, volume,
    rsi, macd, atr,
    trend: 'TRENDING_UP',
    volatility: 'MEDIUM',
    volumeProfile: 'HIGH',
  }
)

if (enhanced.filtersPassed && enhanced.quality !== 'LOW') {
  // Execute trade
}
```

### LOGOS Integration

```typescript
// LOGOS receives enhanced signals from all bots
// and performs meta-aggregation

// Enhanced signals include:
// - ML confidence (calibrated)
// - Quality score
// - Agreement status
// - Filter results

// LOGOS can weight signals based on:
// 1. Original bot confidence
// 2. ML enhancement quality
// 3. Agreement status
```

## Training and Learning

### Automatic Training

When auto-train is enabled, the pipeline collects samples:

```typescript
// After trade outcome is known
pipeline.trainWithOutcome(signalId, 'WIN')  // or 'LOSS', 'NEUTRAL'
```

### Manual Training Data Import/Export

```typescript
// Export current training data
const data = pipeline.exportTrainingData()

// Import training data
pipeline.importTrainingData(pretrainedData)
```

## Configuration Reference

```typescript
interface MLPipelineConfig {
  // Core settings
  enabled: boolean              // Enable ML enhancement
  minConfidence: number         // Minimum confidence threshold (0-1)
  minQualityScore: number       // Minimum quality score (0-1)
  agreementThreshold: number    // Agreement threshold for confirmation (0-1)
  
  // Filters
  useRegimeFilter: boolean      // Enable regime filter
  useAdxFilter: boolean         // Enable ADX filter
  useVolatilityFilter: boolean  // Enable volatility filter
  useSessionFilter: boolean     // Enable session filter
  
  // Training
  autoTrain: boolean            // Enable automatic training
  trainingThreshold: number     // Minimum samples before using
  
  // Confidence adjustment
  adjustConfidence: boolean     // Enable confidence adjustment
  confidenceBonus: number       // Bonus for agreement
  confidencePenalty: number     // Penalty for conflict
}
```

## Performance Metrics

### Latency

| Operation | Target | Typical |
|-----------|--------|---------|
| Feature extraction | < 50μs | ~30μs |
| Classification | < 100μs | ~80μs |
| Total pipeline | < 200μs | ~125μs |

### Accuracy Tracking

```typescript
const stats = pipeline.getStats()

console.log({
  totalSignals: stats.totalSignals,
  confirmationRate: stats.confirmedSignals / stats.totalSignals,
  classifierWinRate: stats.classifierStats.winRate,
  avgConfidence: stats.classifierStats.avgConfidence,
})
```

## Best Practices

1. **Collect sufficient training data** before relying on ML predictions
2. **Train with outcomes** after each trade closes
3. **Monitor quality scores** and adjust thresholds
4. **Use filter combinations** appropriate for market conditions
5. **Calibrate confidence** based on your risk tolerance

## Troubleshooting

### Low Confirmation Rate

- Check filter thresholds (may be too strict)
- Verify market context is appropriate
- Review training data quality

### High Processing Latency

- Reduce feature count
- Optimize data passing (use references)
- Check for memory leaks

### Poor Classification Accuracy

- Need more training samples
- Review label quality
- Adjust neighbor count (k)
- Check feature relevance
