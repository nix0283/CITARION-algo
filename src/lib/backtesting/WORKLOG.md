# Backtesting Engine Worklog

## 2026-01-XX - Initial Implementation

### Created Files
- `/src/lib/backtesting/types.ts` - Types for backtest config, positions, trades, metrics
- `/src/lib/backtesting/engine.ts` - BacktestEngine class
- `/src/lib/backtesting/index.ts` - Module exports

### Architecture

```
Backtesting Engine
├── types.ts
│   ├── BacktestConfig       - Configuration for backtest run
│   ├── BacktestPosition     - Position tracking during backtest
│   ├── BacktestTrade        - Completed trade record
│   ├── EquityPoint          - Point on equity curve
│   ├── BacktestMetrics      - Performance metrics
│   └── BacktestResult       - Full result with all data
│
└── engine.ts
    └── BacktestEngine
        ├── run()                 - Main execution loop
        ├── updatePositions()     - Update position prices
        ├── checkExitConditions() - Check SL/TP/Trailing
        ├── processEntrySignal()  - Handle strategy signals
        ├── closePosition()       - Close position with reason
        ├── updateEquityCurve()   - Track equity over time
        └── calculateMetrics()    - Compute final metrics
```

### Key Features

1. **Position Management**
   - Multiple entry support (DCA)
   - Partial closes (Multi TP)
   - Leverage and margin tracking
   - Liquidation price calculation

2. **Exit Conditions**
   - Stop Loss (fixed, percent, ATR-based)
   - Take Profit (single, multiple targets)
   - Trailing Stop (percent, ATR-based)
   - Time-based exit
   - Signal-based exit

3. **Metrics Calculated**
   - Win Rate, Profit Factor
   - Sharpe Ratio, Calmar Ratio
   - Max Drawdown
   - Average Trade Duration
   - Win/Loss Streaks

### Integration with Tactics

Backtesting Engine uses Tactics from Strategy Framework:
- Entry tactics determine how positions are opened
- Exit tactics determine SL/TP levels
- Trailing stop is managed by TacticsExecutor

### Example Usage

```typescript
import { BacktestEngine } from '@/lib/backtesting';
import { createDefaultBacktestConfig } from '@/lib/backtesting/types';

const config = createDefaultBacktestConfig(
  'rsi-reversal',
  'BTCUSDT',
  '1h',
  tacticsSet
);

const engine = new BacktestEngine(config);
const result = await engine.run(candles, (progress) => {
  console.log(`Progress: ${progress}%`);
});

console.log('Total PnL:', result.metrics.totalPnl);
console.log('Win Rate:', result.metrics.winRate);
```

### Metrics Detail

| Metric | Description |
|--------|-------------|
| totalTrades | Number of completed trades |
| winRate | Percentage of winning trades |
| profitFactor | Gross profit / Gross loss |
| sharpeRatio | Risk-adjusted return |
| maxDrawdown | Maximum peak-to-trough decline |
| avgTradeDuration | Average time in position |

### Next Steps

- [ ] Add funding rate simulation for futures
- [ ] Implement slippage model
- [ ] Add order book simulation
- [ ] Support for multi-asset backtesting
