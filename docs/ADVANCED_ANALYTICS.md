# Advanced Analytics Modules

## Overview

Production-ready analytics modules integrated from CITARION-Reworked project. All modules are **fully implemented**, not stubs.

---

## 1. Deep Learning Module (`/src/lib/deep-learning/`)

### LSTM Model

**Purpose:** Price direction prediction using LSTM neural networks with TensorFlow.js.

**Architecture:**
```
Input: [sequenceLength × inputFeatures]
  ↓
LSTM Layer 1 (64 units, dropout 0.2)
  ↓
LSTM Layer 2 (32 units, dropout 0.2)
  ↓
Dense Layer 1 (32 units, ReLU)
  ↓
Dense Layer 2 (16 units, ReLU)
  ↓
Output (1 unit, sigmoid)
```

**Features (6 inputs per timestep):**
1. Normalized price change
2. Volume ratio
3. RSI (0-1 normalized)
4. MACD histogram
5. Bollinger position
6. ATR normalized

**Usage:**
```typescript
import { LSTMModel, getLSTMModel } from '@/lib/deep-learning';

const model = getLSTMModel({ sequenceLength: 60, epochs: 50 });

// Train
const result = await model.train(candles);

// Predict
const prediction = await model.predict(recentCandles);
// { direction: 'UP', confidence: 0.73, predictedChange: 2.5 }
```

**API:**
| Method | Description |
|--------|-------------|
| `buildModel()` | Build LSTM architecture |
| `train(candles)` | Train on historical data |
| `predict(candles)` | Generate prediction |
| `save(path)` | Persist model |
| `load(path)` | Load trained model |
| `getMetrics()` | Get accuracy/precision/recall |

---

## 2. Modern Portfolio Theory (`/src/lib/analytics/mpt/`)

### MPT Engine

**Purpose:** Portfolio optimization using Markowitz theory.

**Features:**
- Correlation matrix calculation
- Risk parity allocation
- Efficient frontier generation
- Maximum Sharpe optimization
- Rebalancing signals

**Usage:**
```typescript
import { MPTEngine, getMPTEngine } from '@/lib/analytics/mpt';

const mpt = getMPTEngine(0.02); // 2% risk-free rate

// Calculate correlation matrix
const corr = await mpt.calculateCorrelationMatrix(priceHistories);

// Risk parity weights
const weights = mpt.calculateRiskParity(corr, volatilities);

// Optimize for max Sharpe
const optimal = mpt.optimizeMaxSharpe(returns, vols, corr.matrix);
// { sharpeRatio: 1.85, optimalWeights: [...] }

// Generate rebalance signals
const signals = mpt.generateRebalanceSignals(current, target, symbols);
```

**Key Methods:**
| Method | Description |
|--------|-------------|
| `calculateCorrelationMatrix()` | Build correlation matrix |
| `calculateRiskParity()` | Equal risk contribution weights |
| `optimizeMaxSharpe()` | Find optimal Sharpe portfolio |
| `calculateEfficientFrontier()` | Generate frontier points |
| `generateRebalanceSignals()` | BUY/SELL/HOLD recommendations |

---

## 3. Stress Testing (`/src/lib/analytics/stress/`)

### Stress Test Engine

**Purpose:** Test strategies under extreme market conditions.

**6 Predefined Scenarios:**

| ID | Name | Type | Severity | Duration |
|----|------|------|----------|----------|
| `moderate_correction` | Moderate Correction | CRASH | MODERATE | 48h |
| `severe_crash` | Severe Crash | CRASH | SEVERE | 168h |
| `flash_crash` | Flash Crash | FLASH_CRASH | SEVERE | 1h |
| `high_volatility` | High Volatility | HIGH_VOLATILITY | MODERATE | 72h |
| `liquidity_crisis` | Liquidity Crisis | LIQUIDITY_CRISIS | SEVERE | 120h |
| `black_swan` | Black Swan | BLACK_SWAN | EXTREME | 720h |

**Usage:**
```typescript
import { StressTestEngine, STRESS_SCENARIOS } from '@/lib/analytics/stress';

const engine = getStressTestEngine();

// Run stress test
const result = await engine.runStressTest({
  scenario: STRESS_SCENARIOS[1], // Severe crash
  initialEquity: 10000,
  positions: [...],
  baseVolatility: 0.03,
  basePrice: 50000,
});

// { maxDrawdown: 0.35, liquidations: 0, passed: true }

// Run Monte Carlo
const mc = engine.runMonteCarlo({
  initialEquity: 10000,
  simulations: 10000,
  timeHorizonDays: 90,
  strategy: { winRate: 0.55, avgWin: 0.02, avgLoss: 0.015, positionSize: 0.05 },
});

// { probabilityOfRuin: 0.02, expectedReturn: 15234 }
```

---

## 4. Advanced Trailing (`/src/lib/analytics/trailing/`)

### Trailing Stop Manager

**Purpose:** Dynamic exit management with multiple strategies.

**Trailing Types:**
1. **Dynamic Trailing Stop** - Volatility-adjusted
2. **Multi-Level Take Profit** - Trailing TP levels
3. **Time-Based Trailing** - Decay over time

**Presets:**
| Preset | Style | Breakeven | Step | Distance |
|--------|-------|-----------|------|----------|
| SCALPING | Aggressive | 0.3% | 0.3% | 0.3-1% |
| DAY_TRADING | Moderate | 1% | 0.5% | 1-3% |
| SWING_TRADING | Conservative | 2% | 1% | 2-5% |

**Usage:**
```typescript
import { AdvancedTrailingManager, TRAILING_PRESETS } from '@/lib/analytics/trailing';

const manager = getAdvancedTrailingManager();

// Initialize
manager.initializePosition(
  'pos-123', 'BTCUSDT', 'LONG', 67000,
  TRAILING_PRESETS.SWING_TRADING,
  850 // ATR
);

// Update on price change
const update = manager.updatePosition('pos-123', 68500, 900);
// { stopUpdated: true, newStopPrice: 67100 }

// Check stop
const { hit } = manager.checkStopLoss('pos-123', 67000);
```

---

## 5. Evolutionary Optimization (`/src/lib/optimization/evolutionary.ts`)

### PSO + GA Optimizers

**Purpose:** Parameter optimization using swarm intelligence and genetic algorithms.

**PSO (Particle Swarm Optimization):**
- Best for continuous parameters
- Fast convergence
- 30 particles, 50 iterations default

**GA (Genetic Algorithm):**
- Best for mixed/discrete parameters
- Crossover + mutation
- 50 population, 100 generations

**Usage:**
```typescript
import { EvolutionaryOptimizer } from '@/lib/optimization/evolutionary';

const optimizer = getEvolutionaryOptimizer();

// PSO
const psoResult = await optimizer.optimizePSO(
  async (params) => {
    // Run backtest with params
    return sharpeRatio;
  },
  8, // dimensions
  { min: [5,10,20,1,0.5,1,1,10], max: [30,50,200,5,3,10,5,100] }
);

// Hybrid (PSO then GA refinement)
const hybrid = await optimizer.optimizeHybrid(fitnessFn, dims, bounds);
```

---

## Integration with Orion Bot

```typescript
// In Orion signal processing
import { getLSTMModel } from '@/lib/deep-learning';
import { getMPTEngine } from '@/lib/analytics/mpt';
import { getStressTestEngine } from '@/lib/analytics/stress';
import { getAdvancedTrailingManager } from '@/lib/analytics/trailing';

// Enhance signal with DL prediction
const dlPred = await lstm.predict(candles);
signal.confidence *= (0.7 + dlPred.confidence * 0.3);
if (dlPred.direction !== signal.direction) {
  signal.strength *= 0.5; // Reduce if DL disagrees
}

// Check portfolio correlation before trade
const corr = await mpt.calculateCorrelationMatrix(positions);
if (maxCorrelation > 0.7) {
  // Reduce position size
  size *= 0.5;
}

// Initialize trailing on position open
trailing.initializePosition(
  position.id, symbol, direction, entry,
  TRAILING_PRESETS.DAY_TRADING, atr
);
```

---

## Dependencies

```bash
# TensorFlow.js for deep learning
bun add @tensorflow/tfjs-node

# Already installed
# - All other dependencies are standard TypeScript/React
```

---

## File Structure

```
/src/lib/
├── deep-learning/
│   └── index.ts           # LSTM model
├── analytics/
│   ├── mpt/
│   │   └── index.ts       # Portfolio theory
│   ├── stress/
│   │   └── index.ts       # Stress testing
│   └── trailing/
│       └── index.ts       # Advanced trailing
├── optimization/
│   └── evolutionary.ts    # PSO + GA
└── components/analytics/
    └── deep-learning-panel.tsx  # UI
```

---

## Performance Notes

| Module | Training Time | Prediction Time | Memory |
|--------|--------------|-----------------|--------|
| LSTM | ~30s/50 epochs | <50ms | ~200MB |
| MPT | N/A | ~100ms | Minimal |
| Stress Test | N/A | ~200ms | Minimal |
| Trailing | N/A | <1ms | Minimal |
| PSO (30 iter) | ~3s | N/A | Minimal |
| GA (100 gen) | ~10s | N/A | Minimal |
