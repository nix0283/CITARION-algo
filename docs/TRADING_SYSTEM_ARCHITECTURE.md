# Trading System Architecture

## Overview

**Backtesting** и **Paper Trading** - два дополняющих друг друга компонента для разработки и тестирования торговых стратегий.

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   STRATEGY      │ ───▶ │   BACKTESTING   │ ───▶ │ PAPER TRADING   │
│   Framework     │      │     Engine      │      │     Engine      │
│                 │      │                 │      │                 │
│ • Indicators    │      │ • Historical    │      │ • Real-time     │
│ • Signals       │      │ • Fast          │      │ • Live prices   │
│ • Tactics       │      │ • Metrics       │      │ • Metrics       │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                         ┌───────┴───────┐
                         │   HYPEROPT    │
                         │    Engine     │
                         │               │
                         │ • Backtesting │
                         │ • Paper       │
                         │ • Progressive │
                         └───────────────┘
```

## Workflow

### 1. Strategy Development
```typescript
// 1. Создаём стратегию
const strategy = new RSIStrategy();
strategy.initialize({ rsiPeriod: 14, overbought: 70 });

// 2. Определяем тактики
const tactics: TacticsSet = {
  id: "conservative-1",
  name: "Conservative",
  entry: { type: "LIMIT", positionSize: "PERCENT", positionSizeValue: 2 },
  takeProfit: { type: "FIXED_TP", tpPercent: 3 },
  stopLoss: { type: "PERCENT", slPercent: 1.5 },
};
```

### 2. Backtesting (Historical Data)
```typescript
import { BacktestEngine, createDefaultBacktestConfig } from '@/lib/backtesting';

// Тестируем на исторических данных
const backtestConfig = createDefaultBacktestConfig(
  'rsi-reversal',
  'BTCUSDT',
  '1h',
  tactics
);

const engine = new BacktestEngine(backtestConfig);
const result = await engine.run(candles);

// Анализируем метрики
console.log('Win Rate:', result.metrics.winRate);
console.log('Sharpe Ratio:', result.metrics.sharpeRatio);
console.log('Max Drawdown:', result.metrics.maxDrawdownPercent);
```

### 3. Paper Trading (Real-time)
```typescript
import { getPaperTradingEngine } from '@/lib/paper-trading';

// Запускаем виртуальную торговлю
const paperEngine = getPaperTradingEngine();

const account = paperEngine.createAccount({
  id: 'paper-1',
  name: 'Test Account',
  initialBalance: 10000,
  strategyId: 'rsi-reversal',
  tacticsSets: [tactics],
  autoTrading: true,
});

paperEngine.start(account.id);

// Обновляем цены в реальном времени
paperEngine.updatePrices({ 'BTCUSDT': 45000 });

// Проверяем метрики
console.log('Equity:', account.equity);
console.log('Trades:', account.metrics.totalTrades);
```

### 4. Hyperopt (Optimization)

#### Backtesting Only
```typescript
import { createDefaultHyperoptConfig } from '@/lib/hyperopt';

const config = createDefaultHyperoptConfig(
  'rsi-reversal',
  'BTCUSDT',
  [
    { name: 'rsiPeriod', space: 'quniform', min: 7, max: 30, q: 1 },
    { name: 'positionSize', space: 'uniform', min: 1, max: 5 },
  ]
);

const result = await hyperopt.run(config, candles);
```

#### Paper Trading Only
```typescript
import { createPaperTradingHyperoptConfig } from '@/lib/hyperopt';

const config = createPaperTradingHyperoptConfig(
  'rsi-reversal',
  'BTCUSDT',
  parameters,
  1440  // 24 hours
);

// Оптимизация в реальном времени
```

#### Progressive (Backtesting → Paper Trading)
```typescript
import { createProgressiveHyperoptConfig } from '@/lib/hyperopt';

const config = createProgressiveHyperoptConfig(
  'rsi-reversal',
  'BTCUSDT',
  parameters
);

// 1. Сначала оптимизация на Backtesting (100 итераций)
// 2. Топ 20% лучших переходят в Paper Trading
// 3. Дополнительная оптимизация в Paper Trading
```

## Tactics System

### Entry Tactics
| Type | Description | Parameters |
|------|-------------|------------|
| MARKET | Рыночный ордер | - |
| LIMIT | Лимитный ордер | entryPrices |
| LIMIT_ZONE | В зоне цен | entryZone { min, max } |
| BREAKOUT | Пробой уровня | breakoutLevel, breakoutDirection |
| DCA | Усреднение | dcaCount, dcaStep, dcaSizeMultiplier |

### Exit Tactics
| Type | Description | Parameters |
|------|-------------|------------|
| FIXED_TP | Фиксированный TP | tpPrice, tpPercent |
| MULTI_TP | Множественные TP | targets [{ price, closePercent }] |
| TRAILING_STOP | Скользящий стоп | trailingConfig { type, percentValue, activationProfit } |
| BREAKEVEN | Выход в безубыток | breakevenTrigger |
| TIME_BASED | Выход по времени | maxHoldingTime |

### Stop Loss Types
| Type | Description | Parameters |
|------|-------------|------------|
| FIXED | Фиксированная цена | slPrice |
| PERCENT | Процент от входа | slPercent |
| ATR_BASED | На основе ATR | atrMultiplier, atrPeriod |
| SUPPORT_BASED | На уровнях поддержки | useSupportLevel, levelOffset |

## Metrics Comparison

### Backtesting Metrics
```typescript
interface BacktestMetrics {
  // Basic
  totalTrades: number;
  winRate: number;
  
  // PnL
  totalPnl: number;
  totalPnlPercent: number;
  profitFactor: number;
  
  // Risk-adjusted
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  
  // Drawdown
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  // Duration
  avgTradeDuration: number;
}
```

### Paper Trading Metrics
```typescript
interface PaperTradingMetrics {
  // Same as BacktestMetrics plus:
  
  // Real-time tracking
  tradingDays: number;
  avgDailyReturn: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  
  // Exposure
  marketExposure: number;
  avgLeverage: number;
}
```

## Integration Points

### Signal → Tactics → Position
```
1. Strategy generates SIGNAL (LONG/SHORT)
2. Tactics determines ENTRY method
3. Tactics sets SL/TP levels
4. Position is opened
5. Trailing stop is activated (if configured)
6. Partial closes on TP hits
7. Position is closed (SL/TP/Signal/Manual)
```

### Events System (Paper Trading)
```typescript
// Подписка на события
paperEngine.subscribe((event) => {
  switch (event.type) {
    case 'POSITION_OPENED':
      console.log('Position opened:', event.data.position);
      break;
    case 'POSITION_CLOSED':
      console.log('Position closed:', event.data.trade);
      break;
    case 'MAX_DRAWDOWN_REACHED':
      console.log('Max drawdown reached!');
      break;
  }
});
```

## Best Practices

### 1. Always Test on Backtesting First
```typescript
// ✅ Good
const backtestResult = await backtest.run(candles);
if (backtestResult.metrics.sharpeRatio > 1) {
  paperEngine.start(account.id);
}

// ❌ Bad
paperEngine.start(account.id); // No backtesting
```

### 2. Use Progressive Optimization
```typescript
// ✅ Good - progressive
const config = createProgressiveHyperoptConfig(...);

// ❌ Bad - paper trading only (too slow)
const config = createPaperTradingHyperoptConfig(...);
```

### 3. Monitor Paper Trading
```typescript
// Set max drawdown limit
paperEngine.subscribe((event) => {
  if (event.type === 'MAX_DRAWDOWN_REACHED') {
    paperEngine.stop(accountId);
    notifyUser('Paper trading stopped due to max drawdown');
  }
});
```

## ML Integration Ecosystem

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ML INTEGRATION ECOSYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌───────────────┐    ┌─────────────────┐    ┌─────────────────────────┐   │
│   │   Trading     │    │  ML Bot         │    │  Enhanced Signal        │   │
│   │     Bots      │───▶│  Integration    │───▶│  Output                 │   │
│   └───────────────┘    └─────────────────┘    └─────────────────────────┘   │
│          │                      │                       │                    │
│          │                      ▼                       │                    │
│          │            ┌─────────────────┐              │                    │
│          │            │ Lawrence        │              │                    │
│          │            │ Classifier      │              │                    │
│          │            └─────────────────┘              │                    │
│          │                      │                       │                    │
│          │                      ▼                       ▼                    │
│          │            ┌─────────────────┐    ┌─────────────────────────┐   │
│          └───────────▶│  ML-Enhanced    │───▶│  Backtesting            │   │
│                       │  LOGOS Engine   │    │  Validation             │   │
│                       └─────────────────┘    └─────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Signal Flow with ML Enhancement

```
1. Bot generates SIGNAL (LONG/SHORT)
2. ML Bot Integration filters signal
3. Lawrence Classifier evaluates direction
4. ML-Enhanced LOGOS aggregates signals
5. Backtesting validates decision
6. Tactics determines ENTRY method
7. Position is opened
```

### Bot ML Integration Status

| Bot Category | Bot | ML Integration | Type |
|--------------|-----|----------------|------|
| **Operational** | MESH | Indirect | Via LOGOS aggregation |
| | SCALE | Indirect | Via LOGOS aggregation |
| | BAND | Indirect | Via LOGOS aggregation |
| **Institutional** | ORION | ✅ Direct | Trend confirmation |
| | TRND | Indirect | Via LOGOS aggregation |
| | FCST | Indirect | Via LOGOS aggregation |
| | RNG | Indirect | Via LOGOS aggregation |
| | LMB | Indirect | Via LOGOS aggregation |
| **Frequency** | HFT | ❌ None | Latency critical |
| | MFT | Indirect | Via LOGOS aggregation |
| | LFT | Indirect | Via LOGOS aggregation |
| **Strategy** | DCA | ✅ Direct | Entry timing optimization |
| | BB | ✅ Direct | Breakout classification |
| | GRID | ❌ None | Direction-agnostic |
| | REED | ❌ None | Classical methods |
| | VISION | ✅ Built-in | Ensemble filter |
| | Zenbot | ✅ Direct | Signal filtering |
| **Meta** | LOGOS | ✅ Core | ML-weighted aggregation |

### ML Filter → LOGOS → Backtesting Navigation

The UI provides unified navigation between key components:

```typescript
import { MLIntegrationNav } from '@/components/ml/ml-integration-nav'

<MLIntegrationNav 
  activeTab="filter" 
  onTabChange={(tab) => navigate(tab)} 
/>
```

**Navigation Flow:**
1. **ML Filter** - Configure signal filtering, view statistics
2. **LOGOS Engine** - Signal aggregation, consensus building
3. **Backtesting** - Historical validation of signals

### Key Documentation References

- [ML Integration](./ML_INTEGRATION.md) - Lawrence Classifier integration
- [ML Bot Integration](./ML_BOT_INTEGRATION.md) - Bot-specific ML services
- [ML Signal Pipeline](./ML_SIGNAL_PIPELINE.md) - Signal enhancement pipeline
- [LOGOS Bot](./LOGOS_BOT.md) - Meta bot aggregation
- [ML Indicators & Filters](./ML_INDICATORS_AND_FILTERS.md) - Advanced indicators

## File Structure

```
src/lib/
├── strategy/
│   ├── types.ts           # Candle, Signal, IStrategy
│   ├── indicators.ts      # Technical indicators
│   ├── builtin.ts         # Built-in strategies
│   ├── manager.ts         # Strategy management
│   └── tactics/
│       ├── types.ts       # TacticsSet, Entry/Exit/SL tactics
│       └── executor.ts    # Tactics execution
│
├── backtesting/
│   ├── types.ts           # BacktestConfig, Position, Trade, Metrics
│   └── engine.ts          # Historical testing
│
├── paper-trading/
│   ├── types.ts           # PaperAccount, Position, Metrics, EquityCurve
│   └── engine.ts          # Real-time simulation
│
├── hyperopt/
│   ├── types.ts           # HyperoptConfig, Trial, Result
│   └── engine.ts          # Parameter optimization
│
├── ml/
│   ├── lawrence-classifier.ts    # k-NN with Lorentzian distance
│   ├── ml-signal-filter.ts       # Signal filtering layer
│   ├── bot-ml-integration.ts     # Bot-specific ML services
│   └── index.ts
│
├── logos-bot/
│   ├── engine.ts                 # LOGOS aggregation engine
│   ├── ml-integration.ts         # ML-Enhanced LOGOS
│   └── index.ts
│
└── bot-filters/
    ├── enhanced-signal-filter.ts # Ensemble filter
    ├── bb-signal-filter.ts       # BB bot filter
    ├── dca-entry-filter.ts       # DCA entry filter
    ├── vision-signal-filter.ts   # VISION ensemble filter
    └── index.ts
```
