# ML Lorentzian Classification Extensions

This document describes the extensions implemented for the Lawrence Classifier based on the analysis of ML Lorentzian Classification Premium from TradingView.

## Overview

The following modules extend the base Lawrence Classifier with features from the Premium version:

1. **Probability Calibrator** - Converts raw scores to calibrated probabilities
2. **Feature Extender** - Dynamic feature space expansion
3. **Kernel Regression** - Signal smoothing and forecasting
4. **Session Filter** - Market session-based filtering

---

## 1. Probability Calibrator

**Location:** `/src/lib/ml/probability-calibrator.ts`

### Purpose

Converts raw classifier scores into well-calibrated probabilities that accurately reflect the true likelihood of a prediction being correct. Without calibration, confidence scores from classifiers can be poorly aligned with actual accuracy.

### Calibration Methods

| Method | Description | Best For |
|--------|-------------|----------|
| Platt Scaling | Logistic regression calibration | Binary classification, small datasets |
| Isotonic Regression | Non-parametric step function | Large datasets, non-monotonic distortions |
| Beta Calibration | Flexible parametric calibration | Skewed probability distributions |
| Temperature Scaling | Simple logit scaling | Neural networks |

### Usage

```typescript
import { ProbabilityCalibrator, getProbabilityCalibrator } from '@/lib/ml';

// Get singleton instance
const calibrator = getProbabilityCalibrator({
  method: 'ensemble',  // Auto-selects best method
  minSamples: 50
});

// Add training samples (score from classifier, actual outcome)
calibrator.addSample(0.75, 1);  // Long was correct
calibrator.addSample(0.60, 0);  // Short was correct
calibrator.addSample(-0.30, 0); // Short prediction was correct

// Fit the calibrator
const { bestMethod, metrics } = calibrator.fit();

// Calibrate a score
const result = calibrator.calibrate(0.65);
console.log(result.probability);  // Calibrated probability (0-1)
console.log(result.confidence);   // Confidence score (0-1)
console.log(result.method);       // Method used
```

### Calibration Metrics

The calibrator tracks several metrics:

- **ECE (Expected Calibration Error)**: Average difference between predicted probability and actual accuracy
- **MCE (Maximum Calibration Error)**: Maximum calibration error in any bin
- **Brier Score**: Mean squared error of probabilities
- **Log Loss**: Cross-entropy loss

---

## 2. Feature Extender

**Location:** `/src/lib/ml/feature-extender.ts`

### Purpose

Provides dynamic feature extension capabilities, implementing the "Einstein Extension" concept from Lorentzian Classification Premium. Allows the feature space to expand from 4 to N dimensions.

### Built-in Features

The extender includes 25+ built-in features:

#### Momentum Features
- `rsi_14`, `rsi_7` - Relative Strength Index
- `momentum_10` - 10-period momentum
- `roc_5` - Rate of Change

#### Volatility Features
- `atr_14`, `atr_ratio` - Average True Range
- `bb_width`, `bb_position` - Bollinger Band metrics

#### Trend Features
- `adx_14` - Average Directional Index
- `plus_di`, `minus_di` - Directional Indicators
- `ema_cross_20_50` - EMA crossover
- `price_to_ema20` - Price distance from EMA

#### Volume Features
- `volume_ratio` - Volume vs average
- `obv_slope` - On-Balance Volume slope

#### Oscillator Features
- `stochastic_k`, `stochastic_d` - Stochastic oscillator
- `cci_20` - Commodity Channel Index
- `williams_r` - Williams %R

#### Pattern Features
- `doji_pattern` - Doji candle detection
- `engulfing` - Engulfing pattern detection

#### Time Features
- `hour_sin`, `hour_cos` - Cyclical hour encoding
- `day_of_week` - Day encoding

### Usage

```typescript
import { FeatureExtender, getFeatureExtender } from '@/lib/ml';

const extender = getFeatureExtender({
  maxFeatures: 32,
  normalizationMethod: 'minmax',  // 'zscore', 'robust', 'rank'
  importanceThreshold: 0.3,
  correlationThreshold: 0.9
});

// Extract features from market data
const featureVector = extender.extractFeatures({
  open: opens,
  high: highs,
  low: lows,
  close: closes,
  volume: volumes,
  timestamp: Date.now(),
  symbol: 'BTCUSDT',
  timeframe: '1h'
});

console.log(featureVector.features);   // Named features
console.log(featureVector.normalized); // Normalized array for ML
console.log(featureVector.names);      // Feature names in order

// Select best features (removes correlated features)
const bestFeatures = extender.selectFeatures();
```

### Custom Features

```typescript
extender.registerFeature(
  {
    name: 'custom_momentum',
    type: 'continuous',
    normalize: true,
    defaultValue: 0,
    importance: 0.8,
    category: 'custom'
  },
  (ctx) => {
    // Custom calculation
    const price = ctx.close[ctx.close.length - 1];
    const ema = ctx.custom?.ema20;
    return ema ? (price - ema) / ema : 0;
  }
);
```

---

## 3. Kernel Regression

**Location:** `/src/lib/ml/kernel-regression.ts`

### Purpose

Implements Nadaraya-Watson kernel regression for signal smoothing and prediction. This non-parametric method provides smooth outputs without assuming a specific functional form.

### Kernel Functions

| Kernel | Formula | Use Case |
|--------|---------|----------|
| Gaussian | K(u) = exp(-u²/2) / √(2π) | Smooth, infinite support |
| Epanechnikov | K(u) = (3/4)(1-u²) | Optimal MSE, bounded |
| Tricube | K(u) = (70/81)(1-\|u\|³)³ | Very smooth, bounded |
| Quartic | K(u) = (15/16)(1-u²)² | Smooth, bounded |
| Triangular | K(u) = (1-\|u\|) | Simple, bounded |
| Cosine | K(u) = (π/4)cos(πu/2) | Smooth transitions |
| Uniform | K(u) = 0.5 | Simple average |

### Usage

```typescript
import { KernelRegression, StreamingKernelRegression } from '@/lib/ml';

// Batch smoothing
const regression = new KernelRegression({
  kernel: 'gaussian',
  bandwidth: 'auto',  // Silverman's rule
  degree: 0           // 0=Nadaraya-Watson, 1=Local Linear
});

// Fit and smooth
const smoothed = regression.smooth(priceSeries);

// Streaming (real-time)
const streaming = new StreamingKernelRegression({
  kernel: 'epanechnikov',
  maxSamples: 500
});

// Add values incrementally
for (const price of prices) {
  const result = streaming.add(price);
  console.log(result.value);       // Smoothed value
  console.log(result.gradient);    // Trend direction
  console.log(result.curvature);   // Acceleration
  console.log(result.confidence);  // Local density confidence
}

// Forecast
const forecast = streaming.forecast(5);  // 5 steps ahead
console.log(forecast.values);     // Forecasted values
console.log(forecast.confidence); // Decaying confidence
```

### Bandwidth Selection

```typescript
import { 
  silvermanBandwidth, 
  scottBandwidth, 
  iqrBandwidth,
  crossValidationBandwidth 
} from '@/lib/ml';

// Automatic selection
const bw = silvermanBandwidth(data);  // Most common

// Cross-validation (most accurate but slow)
const optimalBW = crossValidationBandwidth(data, 'gaussian');
```

---

## 4. Session Filter

**Location:** `/src/lib/bot-filters/session-filter.ts`

### Purpose

Filters trading signals based on market sessions. Different sessions have different characteristics:

- **London** - Highest forex volume, best for EUR/GBP pairs
- **New York** - High volume, good for USD pairs
- **Tokyo** - Asian session, JPY/AUD focus
- **Sydney** - Australian session, AUD pairs

Session overlaps (especially London-New York) provide the highest liquidity.

### Session Definitions

| Session | UTC Open | UTC Close | Priority |
|---------|----------|-----------|----------|
| Sydney | 22:00 | 07:00 | 3 |
| Tokyo | 00:00 | 09:00 | 3 |
| London | 07:00 | 16:00 | 4 |
| New York | 13:00 | 22:00 | 5 |

### Usage

```typescript
import { SessionFilter, getSessionFilter, getCurrentSession } from '@/lib/bot-filters';

// Get singleton instance
const sessionFilter = getSessionFilter({
  enabled: true,
  allowOverlapsOnly: false,      // Only allow signals during overlaps
  preferredSessions: ['london', 'newyork'],
  blockedSessions: [],
  minSessionDuration: 5,         // Wait 5 mins after session open
  volumeFilter: true,
  volumeThreshold: 0.8
});

// Filter a signal
const result = sessionFilter.filter(
  Date.now(),        // Timestamp
  1.2,               // Volume ratio (current/average)
  0.75               // Signal confidence
);

console.log(result.passed);        // true/false
console.log(result.session);       // 'london', 'newyork', etc.
console.log(result.isOverlap);     // In overlap period
console.log(result.reason);        // Why passed/blocked
console.log(result.recommendations); // Actionable suggestions

// Quick helpers
const session = getCurrentSession();  // Current session
const open = isMarketOpen();          // Is market open?
const overlap = isInOverlap();        // In overlap?
```

### Session Statistics

```typescript
// Record signal outcomes
sessionFilter.recordSignal(
  Date.now(),
  'london',
  150,    // PnL in $
  0.8,    // Confidence
  1.5     // Volume ratio
);

// Get statistics
const stats = sessionFilter.getStats('london');
console.log(stats.winRate);       // Win rate for London session
console.log(stats.avgPnL);        // Average PnL

// Get best sessions based on performance
const bestSessions = sessionFilter.getBestSessions();
```

---

## Integration with Lawrence Classifier

All modules integrate with the existing Lawrence Classifier:

```typescript
import { 
  getLawrenceClassifier,
  getProbabilityCalibrator,
  getFeatureExtender,
  getSessionFilter
} from '@/lib/ml';
import { getStreamingKernelRegression } from '@/lib/ml';

// Initialize components
const classifier = getLawrenceClassifier();
const calibrator = getProbabilityCalibrator();
const extender = getFeatureExtender();
const sessionFilter = getSessionFilter();
const kernelSmoother = getStreamingKernelRegression();

// In signal processing pipeline:
function processSignal(marketData) {
  // 1. Check session filter
  const sessionResult = sessionFilter.filter(
    marketData.timestamp,
    marketData.volumeRatio
  );
  
  if (!sessionResult.passed) {
    return { rejected: true, reason: sessionResult.reason };
  }
  
  // 2. Extract extended features
  const features = extender.extractFeatures(marketData);
  
  // 3. Classify
  const result = classifier.classify({
    indicators: { /* ... */ },
    context: { /* ... */ },
    signal: { /* ... */ },
    time: { /* ... */ }
  });
  
  // 4. Calibrate probability
  const calibrated = calibrator.calibrate(result.probability);
  
  // 5. Smooth with kernel regression
  const smoothed = kernelSmoother.add(calibrated.probability);
  
  return {
    direction: result.direction,
    probability: smoothed.value,
    confidence: smoothed.confidence,
    session: sessionResult.session,
    isOverlap: sessionResult.isOverlap
  };
}
```

---

## Configuration Recommendations

### For Conservative Trading
```typescript
const config = {
  sessionFilter: {
    allowOverlapsOnly: true,
    preferredSessions: ['london', 'newyork'],
    minSessionDuration: 30  // Wait 30 mins
  },
  calibrator: {
    method: 'isotonic',  // Most flexible
    minSamples: 100
  },
  kernelRegression: {
    kernel: 'gaussian',
    bandwidth: 'auto'
  }
};
```

### For Aggressive Trading
```typescript
const config = {
  sessionFilter: {
    allowOverlapsOnly: false,
    blockedSessions: [],  // Allow all sessions
    minSessionDuration: 5
  },
  calibrator: {
    method: 'temperature',  // Simple, fast
    minSamples: 30
  },
  kernelRegression: {
    kernel: 'epanechnikov',
    bandwidth: 0.5  // Smaller = more responsive
  }
};
```

---

## Performance Metrics

Track these metrics to evaluate the extensions:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Calibration ECE | < 0.05 | Expected Calibration Error |
| Feature Importance | > 0.3 | Information gain per feature |
| Kernel Smoothness | 0.8-1.0 | Continuity of output |
| Session Win Rate | > 55% | Per-session performance |

---

## References

1. **ML Lorentzian Classification Premium** - TradingView
   - https://www.tradingview.com/script/Ts0sn9jl/
   
2. **Lawrence Classifier Paper** - jdehorty
   - https://www.tradingview.com/script/I6aMjDjh/
   
3. **Platt Scaling** - John Platt (1999)
   - "Probabilistic Outputs for Support Vector Machines"
   
4. **Kernel Regression** - Nadaraya (1964), Watson (1964)
   - "On Estimating Regression"

5. **On Calibration of Modern Neural Networks** - Guo et al. (2017)
   - https://arxiv.org/abs/1706.04599
