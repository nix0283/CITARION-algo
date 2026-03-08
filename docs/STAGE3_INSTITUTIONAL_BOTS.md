# CITARION Stage 3 - Institutional Bots & Advanced Systems

## Overview

Stage 3 implements:
- 5 Institutional Bots (Spectrum, Reed, Architect, Equilibrist, Kron)
- Risk Management Layer (VaR, Position Limiter, Drawdown Monitor, Kill Switch)
- Self-Learning Engine (Genetic Algorithms - NO Neural Networks)
- GARCH Volatility Forecasting (GARCH, GJR-GARCH, EGARCH)
- Gradient Boosting Signal Quality Scorer
- LOGOS Enhancements (Trade Journal, Pattern Detection)
- Alert System (Telegram, Email, Rate Limiting)

**All systems use classical statistical methods - NO NEURAL NETWORKS.**

---

## 1. Risk Management Layer

Location: `/src/lib/risk-management/`

### Components

#### VaR Calculator (`var-calculator.ts`)
- **Historical Simulation**: Uses actual historical returns distribution
- **Parametric (Variance-Covariance)**: Assumes normal distribution
- **Monte Carlo**: Simulates future returns using historical parameters
- **Expected Shortfall (CVaR)**: Tail risk measure

```typescript
import { VaRCalculator } from '@/lib/risk-management';

const calculator = new VaRCalculator({
  confidenceLevel: 0.95,
  timeHorizon: 1,
  method: 'historical'
});

const result = calculator.calculate(returns, portfolioValue);
// result.var, result.expectedShortfall, result.riskPercentage
```

#### Position Limiter (`position-limiter.ts`)
- Position size limits
- Total exposure control
- Leverage restrictions
- Correlation limits
- **Kelly Criterion** for optimal sizing

```typescript
import { PositionLimiter } from '@/lib/risk-management';

const limiter = new PositionLimiter({
  maxPositionSize: 10000,
  maxTotalExposure: 100000,
  maxLeverage: 10
});

const check = limiter.checkPosition(symbol, exchange, size, leverage, portfolio);
```

#### Drawdown Monitor (`drawdown-monitor.ts`)
- Real-time drawdown tracking
- Multiple warning levels (warning, critical, breach)
- Recovery tracking
- Duration analysis

```typescript
import { DrawdownMonitor } from '@/lib/risk-management';

const monitor = new DrawdownMonitor({
  warning: 0.05,
  critical: 0.10,
  breach: 0.20
});

const metrics = monitor.update(equity);
// metrics.state.level, metrics.state.currentDrawdown
```

#### Kill Switch (`kill-switch.ts`)
- Automatic triggers (drawdown, VaR breach, correlation, liquidity)
- Manual trigger support
- Recovery modes (automatic/manual)
- Position close callbacks

```typescript
import { KillSwitch } from '@/lib/risk-management';

const ks = new KillSwitch({
  autoTrigger: true,
  triggers: { drawdown: true, varBreach: true }
});

ks.onClose(async (positions, reason) => {
  // Close all positions
  return pnlSaved;
});
```

---

## 2. Self-Learning Engine

Location: `/src/lib/self-learning/`

### Genetic Algorithm Optimizer

**NO NEURAL NETWORKS** - Uses evolutionary optimization.

#### Features
- Tournament, Roulette, Rank, Elitist selection
- Single-point, Two-point, Uniform, Blend crossover
- Random, Gaussian, Adaptive mutation
- Constraint handling
- Early stopping with patience
- Adaptive mutation on stagnation

```typescript
import { GeneticOptimizer } from '@/lib/self-learning';

const optimizer = new GeneticOptimizer({
  populationSize: 50,
  maxGenerations: 100,
  selectionMethod: 'tournament',
  crossoverMethod: 'blend',
  mutationMethod: 'adaptive'
});

// Define parameter template
const template: Gene[] = [
  { name: 'riskPerTrade', value: 0.02, min: 0.005, max: 0.05 },
  { name: 'stopLossAtr', value: 2.0, min: 1.0, max: 4.0 },
  // ...
];

// Run optimization
const result = await optimizer.optimize(template, fitnessFunction);
// result.bestChromosome.genes, result.converged
```

#### Online Learning

```typescript
import { SelfLearningEngine } from '@/lib/self-learning';

const engine = new SelfLearningEngine({
  enableOnlineLearning: true,
  explorationRate: 0.1
});

// Record trade outcomes
engine.recordTradeOutcome({
  timestamp: Date.now(),
  symbol: 'BTCUSDT',
  pnl: 100,
  parameters: currentParams,
  marketRegime: 'trending'
});

// Get best parameters
const bestParams = engine.getBestParameters();
```

---

## 3. GARCH Volatility Forecasting

Location: `/src/lib/volatility/`

### Models

#### GARCH(1,1)
Standard generalized autoregressive conditional heteroskedasticity.
- Variance = ω + α·ε² + β·σ²

#### GJR-GARCH
Asymmetric GARCH capturing leverage effect.
- Variance = ω + α·ε² + γ·ε²·I(ε<0) + β·σ²

#### EGARCH
Exponential GARCH with log variance.
- log(σ²) = ω + α(|z| - E|z|) + γz + β·log(σ²)

```typescript
import { GARCH, GJRGARCH, EGARCH, createGARCHModel } from '@/lib/volatility';

// Using factory
const model = createGARCHModel('GJR-GARCH');
const result = model.fit(returns);

// Forecast
const forecast = model.forecast(10); // 10 steps ahead

// Update with new data
const currentVol = model.update(newReturn);
```

---

## 4. Institutional Bots

Location: `/src/lib/institutional-bots/`

### Spectrum (PR) - Pairs Trading
- Cointegration detection (Engle-Granger)
- ADF test for stationarity
- Hedge ratio calculation
- Z-score entry/exit signals

```typescript
import { SpectrumBot } from '@/lib/institutional-bots';

const bot = new SpectrumBot({
  strategy: {
    zScoreEntry: 2.0,
    zScoreExit: 0.5,
    minCointegration: 0.05
  }
});

const signals = bot.updatePrices({ BTCUSDT: 50000, ETHUSDT: 3000 });
```

### Reed (STA) - Statistical Arbitrage
- Multi-factor model (momentum, mean reversion, volume, volatility)
- PCA for dimensionality reduction
- Market/sector neutral positioning

```typescript
import { ReedBot } from '@/lib/institutional-bots';

const bot = new ReedBot({
  strategy: {
    factorModels: ['MOMENTUM', 'MEAN_REVERSION', 'VOLUME', 'VOLATILITY'],
    minExpectedReturn: 0.02
  }
});
```

### Architect (MM) - Market Making
- Inventory-based pricing
- Adverse selection protection
- Avellaneda-Stoikov spread optimization
- Quote skew for inventory management

```typescript
import { ArchitectBot } from '@/lib/institutional-bots';

const bot = new ArchitectBot({
  strategy: {
    baseSpreadPct: 0.002,
    maxInventory: 1000,
    inventorySkewFactor: 0.1
  }
});

const quote = bot.generateQuotes(symbol, midPrice, volatility);
// quote.bidPrice, quote.askPrice, quote.bidSize, quote.askSize
```

### Equilibrist (MR) - Mean Reversion
- Multiple mean calculation methods (SMA, EMA, KAMA, Regression)
- Bollinger Bands confirmation
- RSI confirmation
- Volume confirmation

```typescript
import { EquilibristBot } from '@/lib/institutional-bots';

const bot = new EquilibristBot({
  strategy: {
    zScoreEntry: 2.0,
    meanCalcMethod: 'KAMA',
    bollingerBands: true,
    rsiConfirmation: true
  }
});
```

### Kron (TRF) - Trend Following
- Multiple trend methods (EMA Cross, ADX, Supertrend, Combined)
- Pyramiding support
- ATR-based trailing stops
- Volatility-adjusted position sizing

```typescript
import { KronBot } from '@/lib/institutional-bots';

const bot = new KronBot({
  strategy: {
    trendMethod: 'COMBINED',
    emaPeriods: { fast: 9, medium: 21, slow: 55 },
    trailingStop: { enabled: true, atrMultiplier: 3 }
  }
});
```

---

## 5. Gradient Boosting Signal Scorer

Location: `/src/lib/gradient-boosting/`

### Features
- Decision tree ensemble (NO Neural Networks)
- Learning rate, tree depth configuration
- Early stopping
- Feature importance analysis
- 18 signal features

```typescript
import { GradientBoostingClassifier, SignalQualityScorer } from '@/lib/gradient-boosting';

const scorer = new SignalQualityScorer({
  nEstimators: 100,
  maxDepth: 5,
  learningRate: 0.1
});

// Train on historical data
scorer.train(historicalSignals);

// Score new signal
const score = scorer.score({
  return_1: 0.01,
  rsi_14: 65,
  macd: 100,
  adx: 30,
  volume_ratio: 1.5
  // ... more features
});
// score.direction, score.confidence, score.quality
```

---

## 6. LOGOS Enhancements

Location: `/src/lib/logos-bot/enhancements.ts`

### Trade Journal

Records and analyzes all trades for learning.

```typescript
import { TradeJournal } from '@/lib/logos-bot';

const journal = new TradeJournal();

// Open trade
const entry = journal.openTrade(
  symbol, exchange, botCode, side,
  entryPrice, size, leverage,
  stopLoss, takeProfit,
  entryReason, signalId
);

// Close trade
journal.closeTrade(entry.id, exitPrice, exitReason, fees);

// Analyze
const analysis = journal.analyzePerformance();
// analysis.bestTimes, analysis.commonMistakes, analysis.successfulPatterns
```

### Pattern Detector

Detects chart patterns using classical methods.

**23 Pattern Types:**
- Double Top/Bottom
- Head & Shoulders (regular and inverse)
- Triangles (ascending, descending, symmetrical)
- Flags, Wedges, Channels
- Candlestick patterns (Pin Bar, Engulfing, Morning/Evening Star, etc.)

```typescript
import { PatternDetector } from '@/lib/logos-bot';

const detector = new PatternDetector();

// Detect patterns
const patterns = detector.detect(
  symbol, exchange, timeframe,
  opens, highs, lows, closes, volumes
);

// Get active patterns
const active = detector.getActivePatterns(symbol, exchange);

// Update outcome
detector.updatePatternOutcome(patternId, 'SUCCESS');
```

---

## 7. Alert System

Location: `/src/lib/alert-system/`

### Features
- Multi-channel (Telegram, Email, Webhook)
- Rate limiting (per minute, hour, day, burst)
- Priority levels (low, normal, high, critical)
- Trading-specific alerts

```typescript
import { AlertSystem, TradingAlerts } from '@/lib/alert-system';

const alerts = new AlertSystem({
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
    enabled: true
  },
  rateLimits: {
    maxPerMinute: 10,
    maxPerHour: 50,
    burstLimit: 3
  }
});

// Trading alerts helper
const tradingAlerts = new TradingAlerts(alerts);
await tradingAlerts.tradeAlert('OPEN', 'BTCUSDT', 'LONG', { entryPrice: 50000 });
await tradingAlerts.riskAlert('DRAWDOWN', { current: 0.12, limit: 0.15 });
```

---

## Bot Codes Reference

| Code | Name | Category | Strategy |
|------|------|----------|----------|
| PR | Spectrum | Institutional | Pairs Trading |
| STA | Reed | Institutional | Statistical Arbitrage |
| MM | Architect | Institutional | Market Making |
| MR | Equilibrist | Institutional | Mean Reversion |
| TRF | Kron | Institutional | Trend Following |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CITARION PLATFORM                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   LOGOS     │  │    Risk     │  │    Self     │                │
│  │  Meta Bot   │  │  Management │  │  Learning   │                │
│  │             │  │             │  │             │                │
│  │ • Aggregate │  │ • VaR Calc  │  │ • Genetic   │                │
│  │ • Journal   │  │ • Position  │  │   Algorithm │                │
│  │ • Patterns  │  │   Limiter   │  │ • Online    │                │
│  │             │  │ • Drawdown  │  │   Learning  │                │
│  │             │  │ • Kill Sw   │  │             │                │
│  └─────────────┘  └─────────────┘  └─────────────┘                │
│         │                │                │                        │
│         └────────────────┼────────────────┘                        │
│                          │                                         │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    INSTITUTIONAL BOTS                         │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │ │
│  │  │Spectrum │ │  Reed   │ │Architect│ │Equilibr │ │  Kron   │ │ │
│  │  │  (PR)   │ │  (STA)  │ │  (MM)   │ │  (MR)   │ │  (TRF)  │ │ │
│  │  │ Pairs   │ │Stat Arb │ │Market M │ │Mean Rev │ │Trend Fll│ │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                          │                                         │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    SUPPORTING SYSTEMS                          │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐     │ │
│  │  │   GARCH       │  │   Gradient    │  │    Alert      │     │ │
│  │  │   Volatility  │  │   Boosting    │  │    System     │     │ │
│  │  └───────────────┘  └───────────────┘  └───────────────┘     │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Files Created

### Risk Management
- `/src/lib/risk-management/types.ts`
- `/src/lib/risk-management/var-calculator.ts`
- `/src/lib/risk-management/position-limiter.ts`
- `/src/lib/risk-management/drawdown-monitor.ts`
- `/src/lib/risk-management/kill-switch.ts`
- `/src/lib/risk-management/risk-manager.ts`
- `/src/lib/risk-management/index.ts`

### Self-Learning
- `/src/lib/self-learning/types.ts`
- `/src/lib/self-learning/genetic-optimizer.ts`
- `/src/lib/self-learning/engine.ts`
- `/src/lib/self-learning/index.ts`

### Volatility
- `/src/lib/volatility/garch.ts`
- `/src/lib/volatility/index.ts`

### Institutional Bots
- `/src/lib/institutional-bots/types.ts`
- `/src/lib/institutional-bots/spectrum-bot.ts`
- `/src/lib/institutional-bots/reed-bot.ts`
- `/src/lib/institutional-bots/architect-bot.ts`
- `/src/lib/institutional-bots/equilibrist-bot.ts`
- `/src/lib/institutional-bots/kron-bot.ts`
- `/src/lib/institutional-bots/index.ts`

### Gradient Boosting
- `/src/lib/gradient-boosting/index.ts`

### Alert System
- `/src/lib/alert-system/index.ts`

### LOGOS Enhancement
- `/src/lib/logos-bot/enhancements.ts`

---

## Usage Example

```typescript
import { RiskManager } from '@/lib/risk-management';
import { SelfLearningEngine } from '@/lib/self-learning';
import { SpectrumBot, KronBot } from '@/lib/institutional-bots';
import { AlertSystem } from '@/lib/alert-system';

// Initialize systems
const riskManager = new RiskManager();
const learningEngine = new SelfLearningEngine();
const alertSystem = new AlertSystem({ telegram: { ... } });

// Initialize bots
const spectrum = new SpectrumBot();
const kron = new KronBot();

// Start bots
await spectrum.start();
await kron.start();

// On signal
const signals = spectrum.updatePrices(marketData);
for (const signal of signals) {
  const check = riskManager.checkPosition(
    signal.pair[0], 'binance', size, 1, portfolio
  );
  
  if (check.allowed) {
    const position = spectrum.openPosition(signal, capital);
    await alertSystem.send('Trade Opened', `${signal.pair.join('/')}`);
  }
}
```

---

*Document Version: 1.0.0*
*Stage: 3 - Complete*
