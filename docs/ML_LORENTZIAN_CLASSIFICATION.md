# ML Lorentzian Classification - Enhanced Implementation

## Overview

This document describes the enhanced implementation of ML Lorentzian Classification for CITARION, including the Signal Adapter pattern and all P0/P1 features from the TradingView Premium indicator.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CITARION ML Classification System                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   Price Data    │───▶│  Feature        │───▶│   Lawrence      │ │
│  │   (OHLCV)       │    │  Extractor      │    │   Classifier    │ │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘ │
│                                                          │          │
│  ┌─────────────────┐    ┌─────────────────┐             │          │
│  │  Extended       │───▶│   Platt         │◀────────────┘          │
│  │  Features       │    │   Scaler        │                        │
│  └─────────────────┘    └────────┬────────┘                        │
│                                  │                                 │
│  ┌─────────────────┐    ┌────────┴────────┐                        │
│  │  Session        │───▶│   Signal        │                        │
│  │  Filter         │    │   Adapter       │                        │
│  └─────────────────┘    └────────┬────────┘                        │
│                                  │                                 │
│  ┌─────────────────┐    ┌────────┴────────┐                        │
│  │  Kernel         │───▶│   Enhanced      │                        │
│  │  Regressor      │    │   Result        │                        │
│  └─────────────────┘    └─────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Signal Adapter

Based on the TradingView Backtest Adapter pattern, provides standardized signal format:

```typescript
import { SignalAdapter, SignalType, TRADING_SESSIONS } from '@/lib/ml/signal-adapter';

// Create adapter with session filtering
const adapter = new SignalAdapter({
  useDateFilter: true,
  startDate: new Date('2024-01-01'),
  sessions: [TRADING_SESSIONS.LONDON, TRADING_SESSIONS.NEW_YORK],
  useSessionFilter: true,
  minConfidence: 0.6,
  minProbability: 0.55,
});

// Process signal
const signal = adapter.processSignal(1, {
  timestamp: Date.now(),
  price: 50000,
  confidence: 0.8,
  probability: 0.7,
  source: 'lawrence-classifier',
  timeframe: '1h',
  symbol: 'BTCUSDT',
});
```

**Signal Types:**
| Value | Meaning |
|-------|---------|
| 1 | Start Long Trade |
| 2 | End Long Trade |
| -1 | Start Short Trade |
| -2 | End Short Trade |
| 0 | No Signal |

**Trading Sessions:**
- `ASIAN`: 00:00-08:00 UTC
- `LONDON`: 08:00-16:00 UTC
- `NEW_YORK`: 13:00-21:00 UTC
- `LONDON_NY_OVERLAP`: 13:00-16:00 UTC
- `ASIAN_LONDON_OVERLAP`: 07:00-09:00 UTC

### 2. Platt Scaling (P0)

Probability calibration using logistic regression:

```typescript
import { PlattScaler } from '@/lib/ml/lawrence-extensions';

const scaler = new PlattScaler();

// Add calibration samples
scaler.addSample(0.8, 'LONG');
scaler.addSample(0.3, 'SHORT');
scaler.addSample(0.6, 'LONG');

// Train the scaler
scaler.train();

// Calibrate raw scores
const calibratedProb = scaler.calibrate(0.75);
```

**How it works:**
1. Collects scores and true labels from training data
2. Fits logistic regression using Newton-Raphson optimization
3. Converts raw classifier scores to calibrated probabilities

### 3. Extended Features (P0)

Additional market features for improved classification:

| Feature | Description | Range |
|---------|-------------|-------|
| momentum | Rate of change over 14 bars | [-1, 1] |
| volatility_ratio | Current ATR / Historical ATR | [0, 3] |
| trend_strength | ADX-like trend metric | [0, 100] |
| volume_profile | Current volume / Average volume | [0, 5] |
| price_velocity | Price change per bar | [-1, 1] |
| efficiency_ratio | Kaufman's Efficiency Ratio | [0, 1] |
| session_factor | Trading session activity level | [0, 1] |
| day_of_week_factor | Day-based activity factor | [0, 1] |

```typescript
import { ExtendedFeatureCalculator } from '@/lib/ml/lawrence-extensions';

const calculator = new ExtendedFeatureCalculator();

const features = calculator.calculate(high, low, close, volume);
// Returns: { momentum: 0.5, volatility_ratio: 1.2, ... }
```

### 4. Kernel Regression (P1)

Nadaraya-Watson kernel regression for smoothed predictions:

```typescript
import { NadarayaWatsonRegressor, KernelFunctions } from '@/lib/ml/lawrence-extensions';

const regressor = new NadarayaWatsonRegressor({
  bandwidth: 1.0,
  kernelType: 'gaussian',  // 'gaussian' | 'epanechnikov' | 'uniform' | 'triangular'
  minSamples: 5,
});

// Smooth classifier output
const result = regressor.smoothClassifierOutput(
  featureVector,
  trainingData,
  10  // k neighbors
);
```

**Kernel Functions:**
- **Gaussian**: `K(u) = exp(-0.5 * u²) / √(2π)` - Smooth, infinite support
- **Epanechnikov**: `K(u) = 0.75 * (1 - u²)` for |u| ≤ 1 - Optimal efficiency
- **Uniform**: `K(u) = 0.5` for |u| ≤ 1 - Simple averaging
- **Triangular**: `K(u) = 1 - |u|` for |u| ≤ 1 - Linear weighting

### 5. Session Filter (P1)

Time-based signal validation:

```typescript
import { SessionFilter } from '@/lib/ml/lawrence-extensions';

const filter = new SessionFilter({
  enabled: true,
  sessions: [
    { name: 'London', startHour: 8, endHour: 16, daysOfWeek: [1,2,3,4,5] },
    { name: 'New York', startHour: 13, endHour: 21, daysOfWeek: [1,2,3,4,5] },
  ],
  requireOverlap: false,  // Set true for overlap-only trading
});

const validation = filter.isValidTime(Date.now());
// Returns: { valid: true, sessions: ['London', 'New York'], isOverlap: true }
```

## Enhanced Classifier Usage

### Basic Usage

```typescript
import { getEnhancedLawrenceClassifier } from '@/lib/ml/lawrence-extensions';

const classifier = getEnhancedLawrenceClassifier({
  lookbackWindow: 2000,
  neighborCount: 8,
  filterSettings: {
    useVolatilityFilter: true,
    useRegimeFilter: true,
    useAdxFilter: true,
  },
});

// Train with samples
classifier.trainWithCalibration({
  features: { n_rsi: 0.7, n_cci: 0.6, ... },
  label: 'LONG',
  weight: 1.0,
  timestamp: Date.now(),
});

// Classify with all enhancements
const result = classifier.classifyEnhanced(
  lawrenceFeatures,
  { high, low, close, volume }
);
```

### Result Structure

```typescript
interface ExtendedLawrenceResult {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  probability: number;           // Raw probability
  confidence: number;            // Classifier confidence
  features: Record<string, number>;
  
  // Enhanced fields
  calibratedProbability: number;  // Platt-scaled probability
  kernelEstimate?: {
    value: number;
    confidence: number;
    sampleCount: number;
  };
  sessionValid: boolean;
  activeSession?: string;
  featureImportance: Record<string, number>;
}
```

## Integration with Backtest Adapter Pattern

The SignalAdapter is designed to work seamlessly with strategies and indicators:

```typescript
import { getSignalAdapter, createSignalFromClassifierResult } from '@/lib/ml/signal-adapter';
import { getEnhancedLawrenceClassifier } from '@/lib/ml/lawrence-extensions';

const adapter = getSignalAdapter({
  useSessionFilter: true,
  sessions: [TRADING_SESSIONS.LONDON_NY_OVERLAP],
  minConfidence: 0.6,
});

const classifier = getEnhancedLawrenceClassifier();

// In your signal processing loop:
const classifierResult = classifier.classifyEnhanced(features, priceData);

// Convert to standard signal format
const rawSignal = createSignalFromClassifierResult(
  classifierResult,
  metadata
);

// Process through adapter
const processedSignal = adapter.processSignal(rawSignal, {
  timestamp: Date.now(),
  price: currentPrice,
  confidence: classifierResult.confidence,
  probability: classifierResult.calibratedProbability,
  source: 'enhanced-lawrence',
  timeframe: '1h',
  symbol: 'BTCUSDT',
  features: classifierResult.features,
});

if (processedSignal.metadata.filters?.passed) {
  // Execute trade
  executeTrade(processedSignal);
}
```

## Backtest Integration

The signal format is compatible with the existing BacktestEngine:

```typescript
import { BacktestEngine } from '@/lib/backtesting';
import { SignalType } from '@/lib/ml/signal-adapter';

const engine = new BacktestEngine({
  symbol: 'BTCUSDT',
  timeframe: '1h',
  initialCapital: 10000,
});

// Signals are automatically processed
for (const candle of historicalData) {
  const result = classifier.classifyEnhanced(features, candle);
  const signal = adapter.processSignal(rawSignal, metadata);
  
  if (signal.type === SignalType.START_LONG) {
    engine.openPosition('LONG', candle.close);
  } else if (signal.type === SignalType.END_LONG) {
    engine.closePosition('LONG', candle.close);
  }
}

const metrics = engine.getMetrics();
```

## Performance Considerations

### 1. Platt Scaling
- **Training cost**: O(n × iterations) where n = samples
- **Inference cost**: O(1) - single sigmoid calculation
- **Recommendation**: Train once per week or when significant market regime change

### 2. Kernel Regression
- **Complexity**: O(n × d) where n = neighbors, d = dimensions
- **Optimization**: Pre-compute distances using KD-tree for large datasets
- **Bandwidth selection**: Use Silverman's rule as starting point

### 3. Session Filter
- **Cost**: O(1) - simple time checks
- **Recommendation**: Cache session validity per minute

## Comparison with TradingView Premium

| Feature | TradingView Premium | CITARION Implementation |
|---------|--------------------|-----------------------| 
| Lorentzian Distance | ✅ | ✅ |
| k-NN Classification | ✅ | ✅ |
| Normalized Indicators | ✅ RSI, CCI, WT, ADX | ✅ RSI, CCI, WT, ADX + Extended |
| Regime Filter | ✅ | ✅ |
| ADX Filter | ✅ | ✅ |
| Volatility Filter | ✅ | ✅ |
| Probability Calibration | ✅ | ✅ Platt Scaling |
| Kernel Regression | ✅ | ✅ Nadaraya-Watson |
| Session Filtering | ✅ | ✅ |
| Einstein Extension | ✅ | 🔄 Planned |
| Economic Calendar | ✅ | 🔄 Planned |

## File Structure

```
src/lib/ml/
├── lawrence-classifier.ts      # Core k-NN classifier
├── lawrence-extensions.ts      # P0/P1 enhancements
├── signal-adapter.ts           # Backtest Adapter pattern
├── feature-extender.ts         # Existing feature extensions
├── kernel-regression.ts        # Existing kernel regression
└── probability-calibrator.ts   # Existing probability calibration
```

## References

1. **ML Lorentzian Classification Premium**: https://www.tradingview.com/script/Ts0sn9jl/
2. **Backtest Adapter**: https://www.tradingview.com/script/Pu38F2pB-Backtest-Adapter/
3. **Platt Scaling Paper**: "Probabilistic Outputs for Support Vector Machines" - John C. Platt (1999)
4. **Nadaraya-Watson Regression**: https://en.wikipedia.org/wiki/Nadaraya%E2%80%93Watson_kernel_regression
5. **AI Edge Documentation**: https://ai-edge.io/docs/category/getting-started

## Future Enhancements (P2)

### Einstein Extension
Dynamic feature space expansion based on market conditions:
- Automatic feature selection
- Dimensionality reduction
- Adaptive neighbor count

### Economic Calendar Integration
Filter signals around major economic events:
- Non-Farm Payrolls
- FOMC meetings
- CPI/Inflation reports
