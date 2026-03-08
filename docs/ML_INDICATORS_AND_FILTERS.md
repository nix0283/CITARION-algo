# ML-Adaptive Indicators and Signal Filters

## Overview

This document describes the ML-adaptive indicators and signal filtering system integrated from the CITARION-Reworked project. These components provide advanced signal generation and filtering capabilities using machine learning techniques.

## Modules Structure

```
src/lib/
├── ml/
│   ├── lawrence-classifier.ts    # Lawrence Classifier (converted from Pine Script)
│   └── index.ts
├── indicators/
│   └── advanced/
│       ├── ml-adaptive-supertrend.ts   # ML-Adaptive SuperTrend
│       ├── neural-probability-channel.ts # Neural Probability Channel
│       ├── squeeze-momentum.ts         # Squeeze Momentum
│       ├── wave-trend.ts               # WaveTrend Oscillator
│       ├── kernel-regression.ts        # Kernel Regression
│       ├── kmeans-volatility.ts        # K-Means Volatility Clustering
│       └── index.ts
└── bot-filters/
    ├── enhanced-signal-filter.ts       # Ensemble Signal Filter
    ├── bb-signal-filter.ts             # BB Bot Signal Filter
    ├── dca-entry-filter.ts             # DCA Entry Filter
    ├── vision-signal-filter.ts         # VISION Signal Filter
    └── index.ts
```

---

## Advanced Indicators

### 1. ML-Adaptive SuperTrend

**Location:** `src/lib/indicators/advanced/ml-adaptive-supertrend.ts`

A SuperTrend indicator that adapts its factor based on K-Means volatility clustering.

**Features:**
- K-Means clustering on ATR values (k=3)
- Adaptive factor based on volatility regime:
  - LOW volatility → factor 4.0 (wider bands)
  - MEDIUM volatility → factor 3.0 (balanced)
  - HIGH volatility → factor 2.0 (tighter bands)

**Usage:**
```typescript
import { MLAdaptiveSuperTrend, createMLAdaptiveSuperTrend } from '@/lib/indicators/advanced/ml-adaptive-supertrend';

const superTrend = createMLAdaptiveSuperTrend({
  atrLength: 10,
  trainingPeriod: 100
});

const results = superTrend.calculate(candles);
const regime = superTrend.getVolatilityRegime();
```

**Result Interface:**
```typescript
interface MLAdaptiveSuperTrendResult {
  superTrend: number;
  direction: -1 | 1;
  volatilityCluster: 'LOW' | 'MEDIUM' | 'HIGH';
  clusterCentroid: number;
  factor: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
}
```

---

### 2. Neural Probability Channel (NPC)

**Location:** `src/lib/indicators/advanced/neural-probability-channel.ts`

A channel indicator using Nadaraya-Watson kernel regression for mean reversion signals.

**Features:**
- Rational Quadratic Kernel: `w(d) = (1 + d²/(2αh²))^(-α)`
- Nadaraya-Watson weighted average for baseline
- Hybrid volatility: Mean Deviation + ATR
- Inner and outer channel bands

**Usage:**
```typescript
import { NeuralProbabilityChannel, createNeuralProbabilityChannel } from '@/lib/indicators/advanced/neural-probability-channel';

const npc = createNeuralProbabilityChannel({
  lookbackWindow: 24,
  bandwidth: 8.0,
  alpha: 2.0
});

const results = npc.calculate(candles);
```

**Result Interface:**
```typescript
interface NPCResult {
  baseline: number;
  upperInner: number;
  lowerInner: number;
  upperOuter: number;
  lowerOuter: number;
  volatility: number;
  trend: 'BULLISH' | 'BEARISH';
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
}
```

---

### 3. Squeeze Momentum

**Location:** `src/lib/indicators/advanced/squeeze-momentum.ts`

Detects BB/KC squeeze patterns and momentum breakouts.

**Features:**
- Bollinger Bands / Keltner Channel squeeze detection
- Momentum oscillator with color coding
- Breakout signal generation

**Usage:**
```typescript
import { SqueezeMomentum, calculateSqueezeMomentum } from '@/lib/indicators/advanced/squeeze-momentum';

const squeeze = new SqueezeMomentum({
  bbLength: 20,
  bbMult: 2.0,
  kcLength: 20,
  kcMult: 1.5
});

const results = squeeze.calculate(candles);
const signal = squeeze.getBreakoutSignal(results);
```

**Result Interface:**
```typescript
interface SqueezeMomentumResult {
  squeezeOn: boolean;
  squeezeOff: boolean;
  noSqueeze: boolean;
  momentum: number;
  momentumColor: 'LIME' | 'GREEN' | 'RED' | 'MAROON';
  signal: 'LONG' | 'SHORT' | 'NONE';
}
```

---

### 4. WaveTrend Oscillator

**Location:** `src/lib/indicators/advanced/wave-trend.ts`

A momentum oscillator for overbought/oversold detection with divergence analysis.

**Features:**
- Channelized momentum oscillator
- Overbought/oversold levels
- Crossover signals
- Divergence detection

**Usage:**
```typescript
import { calculateWaveTrend, getWaveTrendEntrySignal, detectDivergence } from '@/lib/indicators/advanced/wave-trend';

const results = calculateWaveTrend(highs, lows, closes, {
  channelLength: 10,
  averageLength: 21
});

const signal = getWaveTrendEntrySignal(current, previous);
const divergence = detectDivergence(closes, results, 5);
```

---

### 5. Kernel Regression

**Location:** `src/lib/indicators/advanced/kernel-regression.ts`

Non-parametric regression using Rational Quadratic kernel for smooth trend estimation.

**Features:**
- Nadaraya-Watson estimator
- Rational Quadratic kernel
- Channel bands with inner/outer multipliers

**Usage:**
```typescript
import { calculateKernelRegression, getChannelSignal } from '@/lib/indicators/advanced/kernel-regression';

const results = calculateKernelRegression(highs, lows, closes, {
  lookbackWindow: 24,
  bandwidth: 8.0
});
```

---

### 6. K-Means Volatility Clustering

**Location:** `src/lib/indicators/advanced/kmeans-volatility.ts`

Clusters ATR values into volatility regimes using K-Means algorithm.

**Features:**
- K-Means++ initialization
- Convergence detection
- Volatility regime assignment

**Usage:**
```typescript
import { KMeansVolatility, calculateVolatilityRegime } from '@/lib/indicators/advanced/kmeans-volatility';

const kmeans = new KMeansVolatility({
  atrLength: 14,
  lookbackPeriod: 100,
  numClusters: 3
});

const result = kmeans.calculate(candles);
```

---

## Lawrence Classifier

**Location:** `src/lib/ml/lawrence-classifier.ts`

Converted from Pine Script MLExtensions library. Provides approximate nearest neighbors classification in Lorentzian space.

**Features:**
- Normalized indicators (RSI, CCI, WaveTrend, ADX)
- Market filters (regime, ADX, volatility)
- K-NN classification with weighted voting
- Confidence calibration

**Usage:**
```typescript
import { LawrenceClassifier, getLawrenceClassifier } from '@/lib/ml/lawrence-classifier';

const classifier = getLawrenceClassifier();

// Train with historical data
await classifier.train(symbol, 120);

// Evaluate a signal
const result = await classifier.evaluate({
  indicators: { rsi: 45, macd: 0.5, atr: 100, volumeRatio: 1.2 },
  context: { trend: 'TRENDING_UP', volatility: 'MEDIUM', volume: 'HIGH' },
  signal: { direction: 'LONG', symbol: 'BTCUSDT', timeframe: '1h', entryPrice: 50000 },
  time: { hour: 14, dayOfWeek: 3, isSessionOverlap: true }
});
```

---

## Signal Filters

### 1. Enhanced Signal Filter (Ensemble)

**Location:** `src/lib/bot-filters/enhanced-signal-filter.ts`

Combines ML-Adaptive SuperTrend, Neural Probability Channel, and Squeeze Momentum with dynamic weight optimization.

**Features:**
- Ensemble of 3 indicators
- Dynamic weight optimization
- Disagreement detection
- Regime-aware filtering
- Lawrence Classifier integration

**Usage:**
```typescript
import { EnhancedSignalFilter, createEnhancedSignalFilter } from '@/lib/bot-filters/enhanced-signal-filter';

const filter = createEnhancedSignalFilter({
  weights: { superTrend: 0.3, npc: 0.4, squeeze: 0.3 },
  signalThreshold: 0.5,
  minConfidence: 0.55,
  enableWeightOptimization: true
});

const result = await filter.evaluate(candles);
```

**Result Interface:**
```typescript
interface EnsembleSignal {
  signal: 'LONG' | 'SHORT' | 'NONE';
  confidence: number;
  score: number;
  indicators: {
    superTrend: MLAdaptiveSuperTrendResult;
    npc: NPCResult;
    squeeze: SqueezeMomentumResult;
  };
  weights: { superTrend: number; npc: number; squeeze: number };
  disagreement: boolean;
  uncertainty: number;
  regime: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
}
```

---

### 2. BB Signal Filter

**Location:** `src/lib/bot-filters/bb-signal-filter.ts`

Signal filter for Bollinger Bands bot with stochastic confirmation.

**Signal Types:**
- `INNER_TOUCH` - Price touches inner band
- `OUTER_TOUCH` - Price touches outer band
- `BAND_WALK` - Price walking the band
- `SQUEEZE` - Band squeeze pattern
- `REVERSAL` - Mean reversion signal

---

### 3. DCA Entry Filter

**Location:** `src/lib/bot-filters/dca-entry-filter.ts`

Entry filter for DCA strategies with level-based recommendations.

**Features:**
- Price drop threshold checking
- RSI oversold confirmation
- ATR-based volatility adjustments
- Amount multipliers per level

---

### 4. VISION Signal Filter

**Location:** `src/lib/bot-filters/vision-signal-filter.ts`

Ensemble filter combining Lawrence Classifier, ML model predictions, and market forecast.

**Ensemble Weights:**
- Lawrence Classifier: 40%
- ML Model: 40%
- Forecast: 20%

**Recommendation Logic:**
- `combined >= 0.70` + direction UP → `ENTER_LONG`
- `combined >= 0.70` + direction DOWN → `ENTER_SHORT`
- `combined >= 0.55` → `WAIT`
- otherwise → `AVOID`

---

## UI Components

**Location:** `src/components/filters/`

### Components:
- `SignalFilterPanel` - Main filter configuration panel
- `EnsembleConfig` - Weight and threshold configuration
- `FilterStatsCard` - Performance statistics display
- `SignalIndicator` - Visual signal state indicator
- `LawrenceCalibration` - Classifier calibration component

### Hook:
```typescript
import { useBotFilter, useBBFilter, useDCAFilter, useVISIONFilter, useORIONFilter } from '@/hooks/use-bot-filter';

const { filter, result, loading, evaluate, filterEnabled, setFilterEnabled } = useBotFilter('ORION', 'BTCUSDT');
```

---

## Prisma Models

New models added for signal classification and filtering:

```prisma
model ClassifiedSignal {
  id          String   @id @default(cuid())
  symbol      String
  direction   String
  outcome     String   @default("PENDING")
  pnlPercent  Float    @default(0)
  probability Float
  features    String
  botType     String
  timestamp   DateTime @default(now())
  resolvedAt  DateTime?
  userId      String?
  user        User?    @relation(fields: [userId], references: [id])
}

model SignalFilterConfig {
  id           String   @id @default(cuid())
  userId       String?
  filterType   String
  config       String
  totalSignals Int      @default(0)
  winSignals   Int      @default(0)
  winRate      Float    @default(0)
  isActive     Boolean  @default(true)
}

model EnsembleWeights {
  id            String   @id @default(cuid())
  symbol        String
  timeframe     String   @default("1h")
  superTrend    Float    @default(0.3)
  npc           Float    @default(0.4)
  squeeze       Float    @default(0.3)
  totalSignals  Int      @default(0)
  accuracy      Float    @default(0)
  lastOptimized DateTime @default(now())
}

model MLModelTraining {
  id           String   @id @default(cuid())
  modelType    String
  symbol       String?
  samplesCount Int
  features     String
  accuracy     Float?
  precision    Float?
  recall       Float?
  f1Score      Float?
  status       String   @default("PENDING")
  startedAt    DateTime?
  completedAt  DateTime?
}
```

---

## Integration Examples

### Orion Bot with Enhanced Filter:
```typescript
import { useBotFilter } from '@/hooks/use-bot-filter';

function OrionBotManager() {
  const { result, evaluate, filterEnabled, setFilterEnabled } = useBotFilter('ORION', symbol);
  
  const handleSignal = async () => {
    const filterResult = await evaluate(candles);
    if (filterResult.approved && filterResult.confidence > 0.6) {
      // Execute trade
    }
  };
}
```

### BB Bot with Signal Filter:
```typescript
import { getBBSignalFilter } from '@/lib/bot-filters';

const bbFilter = getBBSignalFilter('BTCUSDT');
const result = await bbFilter.evaluate(bbSignal);
```

---

## Academic References

1. **Nadaraya-Watson Kernel Regression**: Watson (1964), Nadaraya (1964)
2. **K-Means Clustering**: Lloyd (1982)
3. **Ensemble Methods**: Dietterich (2000)
4. **Lawrence Classifier**: SSRN 4557281
5. **SuperTrend**: TradingView community indicator

---

## Performance Considerations

1. **Training Period**: ML-Adaptive SuperTrend requires minimum 100 candles for K-Means training
2. **Kernel Regression**: Computationally intensive for large lookback windows
3. **Lawrence Classifier**: Training requires sufficient historical signals
4. **Ensemble Filter**: Caches indicator instances for performance

---

## Future Improvements

1. Add WebWorker support for heavy calculations
2. Implement caching for indicator results
3. Add real-time weight optimization
4. Integrate with backtesting engine
5. Add more ML models (LSTM, Transformer)

---

## Integration Status

### Bot ML Integration Overview

| Bot | Filter Type | Integration | Status |
|-----|-------------|-------------|--------|
| **DCA Bot** | DCA Entry Filter | ✅ Direct ML | Active |
| **BB Bot** | BB Signal Filter | ✅ Direct ML | Active |
| **ORION Bot** | Enhanced Signal Filter | ✅ Direct ML | Active |
| **VISION Bot** | VISION Signal Filter | ✅ Built-in Ensemble | Active |
| **Zenbot Engine** | ML Signal Pipeline | ✅ Direct ML | Active |
| **GRID Bot** | - | ❌ Not Applicable | Direction-agnostic |
| **HFT Bot** | - | ❌ Not Applicable | Latency critical |
| **REED Bot** | - | ❌ Not Applicable | Classical methods |

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIGNAL FILTERING PIPELINE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  Bot     │───▶│  Bot Filter      │───▶│  ML Integration  │  │
│  │  Signal  │    │  (Type-specific) │    │  (Optional)      │  │
│  └──────────┘    └──────────────────┘    └──────────────────┘  │
│                          │                     │                │
│                          ▼                     ▼                │
│                  ┌─────────────────────────────────────────┐   │
│                  │           FILTERED SIGNAL               │   │
│                  │  - Direction confirmed/rejected         │   │
│                  │  - Confidence adjusted                  │   │
│                  │  - Quality score assigned               │   │
│                  └─────────────────────────────────────────┘   │
│                                    │                            │
│                                    ▼                            │
│                  ┌─────────────────────────────────────────┐   │
│                  │        LOGOS ENGINE AGGREGATION         │   │
│                  └─────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Filter Types per Bot

| Filter | Components | Weight Scheme |
|--------|------------|---------------|
| **EnhancedSignalFilter** | SuperTrend (30%) + NPC (40%) + Squeeze (30%) | Dynamic optimization |
| **VISIONSignalFilter** | Lawrence (40%) + ML Model (40%) + Forecast (20%) | Fixed ensemble |
| **BBSignalFilter** | BB Position + Stochastic + Volume Confirmation | Adaptive |
| **DCAEntryFilter** | RSI + ATR + Price Drop + Level Multipliers | Level-based |

### Related Documentation

- [ML Bot Integration](./ML_BOT_INTEGRATION.md) - Detailed bot-specific ML services
- [ML Integration](./ML_INTEGRATION.md) - Lawrence Classifier integration
- [ML Signal Pipeline](./ML_SIGNAL_PIPELINE.md) - Signal enhancement pipeline
- [LOGOS Bot](./LOGOS_BOT.md) - Signal aggregation with ML enhancement
