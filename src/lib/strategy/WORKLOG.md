# Strategy Framework Worklog

## 2026-01-XX - Initial Implementation

### Created Files
- `/src/lib/strategy/types.ts` - Core types and interfaces for strategies
- `/src/lib/strategy/indicators.ts` - Technical indicators calculation
- `/src/lib/strategy/builtin.ts` - Built-in strategies (RSI, MACD, Bollinger Bands, EMA Crossover)
- `/src/lib/strategy/manager.ts` - Strategy management and execution
- `/src/lib/strategy/index.ts` - Module exports

### Tactics Module
- `/src/lib/strategy/tactics/types.ts` - Tactics types (Entry, Exit, Position Management)
- `/src/lib/strategy/tactics/executor.ts` - Tactics execution logic
- `/src/lib/strategy/tactics/index.ts` - Module exports

### Architecture

```
Strategy Framework
├── types.ts           - Candle, IndicatorResult, StrategySignal, IStrategy interface
├── indicators.ts      - SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic, etc.
├── builtin.ts         - RSI Reversal, MACD Crossover, Bollinger Bands, EMA Crossover
├── manager.ts         - StrategyManager (registration, execution, state)
└── tactics/
    ├── types.ts       - EntryTactic, TakeProfitTactic, StopLossTactic, TacticsSet
    ├── executor.ts    - TacticsExecutor (entry/exit execution, trailing stop)
    └── index.ts
```

### Key Concepts

1. **Strategy vs Tactics**
   - **Strategy** = WHEN to enter (signal generation)
   - **Tactics** = HOW to enter/exit (position management)

2. **Tactics Components**
   - **Entry Tactics**: Market, Limit, Limit Zone, Breakout, Pullback, DCA
   - **Exit Tactics**: Fixed TP, Multi TP, Trailing Stop, Breakeven, Time-based
   - **Stop Loss**: Fixed, Percent, ATR-based, Support-based
   - **Position Management**: Scaling, Risk Management, Martingale (optional)

3. **Predefined Tactics Sets**
   - Conservative - Fixed TP/SL, no trailing
   - Aggressive - Multi TP with trailing
   - Scalping - Quick in/out
   - Swing - Position trading
   - DCA - Dollar Cost Averaging

### Built-in Strategies

| Strategy | Type | Parameters | Tags |
|----------|------|------------|------|
| RSI Reversal | Momentum | rsiPeriod, overbought/oversold, emaPeriod | momentum, reversal, beginner |
| MACD Crossover | Trend | fastPeriod, slowPeriod, signalPeriod | trend, momentum, intermediate |
| Bollinger Bands | Mean Reversion | bbPeriod, stdDev | mean-reversion, volatility |
| EMA Crossover | Trend | fastPeriod, slowPeriod, trendPeriod | trend, beginner |

### Integration Points

1. **Backtesting Engine** - Test strategies with tactics on historical data
2. **Paper Trading Engine** - Virtual trading with real prices
3. **Hyperopt Engine** - Optimize strategy and tactics parameters

### Next Steps

- [ ] Add more strategies (Volume, Volatility based)
- [ ] Implement advanced indicators (Ichimoku, Elliott Wave)
- [ ] Add machine learning features
- [ ] Create strategy builder UI
