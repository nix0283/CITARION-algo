# Hyperopt Engine Worklog

## 2026-01-XX - Initial Implementation

### Created Files
- `/src/lib/hyperopt/types.ts` - Types for optimization config, trials, results
- `/src/lib/hyperopt/engine.ts` - HyperoptEngine class
- `/src/lib/hyperopt/index.ts` - Module exports

### Architecture

```
Hyperopt Engine
├── types.ts
│   ├── HyperoptParameter     - Parameter space definition
│   ├── HyperoptConfig        - Optimization configuration
│   ├── HyperoptTrial         - Single trial record
│   ├── HyperoptResult        - Full optimization result
│   └── HyperoptStatistics    - Optimization statistics
│
└── engine.ts
    └── HyperoptEngine
        ├── run()                  - Main optimization loop
        ├── runRandomSearch()      - Random parameter sampling
        ├── runGridSearch()        - Grid parameter search
        ├── runTPESearch()         - TPE optimization
        ├── runGeneticSearch()     - Genetic algorithm
        ├── sampleParameter()      - Sample from parameter space
        ├── runTrial()             - Execute single trial
        └── calculateStatistics()  - Compute final stats
```

### Supported Methods

| Method | Description | Best For |
|--------|-------------|----------|
| RANDOM | Random search | Quick exploration |
| GRID | Grid search | Small parameter spaces |
| TPE | Tree-structured Parzen Estimator | Efficient optimization |
| GENETIC | Genetic algorithm | Complex spaces |

### Parameter Spaces

1. **categorical** - Discrete choices (e.g., entry type)
2. **uniform** - Uniform distribution [min, max]
3. **loguniform** - Log-uniform for wide ranges
4. **quniform** - Quantized uniform (discrete values)
5. **normal** - Normal distribution

### Optimization Objectives

- `totalPnl` - Total profit/loss
- `winRate` - Win percentage
- `profitFactor` - Gross profit / gross loss
- `sharpeRatio` - Risk-adjusted return
- `calmarRatio` - Return / max drawdown
- `maxDrawdown` - Maximum drawdown (minimize)

### Example Usage

```typescript
import { getHyperoptEngine } from '@/lib/hyperopt';
import { createDefaultHyperoptConfig } from '@/lib/hyperopt/types';

const engine = getHyperoptEngine();

const config = createDefaultHyperoptConfig(
  'rsi-reversal',
  'BTCUSDT',
  [
    { name: 'rsiPeriod', space: 'quniform', min: 7, max: 30, q: 1 },
    { name: 'rsiOverbought', space: 'quniform', min: 65, max: 85, q: 5 },
    { name: 'rsiOversold', space: 'quniform', min: 15, max: 35, q: 5 },
    { name: 'positionSize', space: 'uniform', min: 1, max: 5 },
  ]
);

config.method = 'TPE';
config.maxEvals = 100;
config.objective = 'sharpeRatio';
config.direction = 'maximize';

const result = await engine.run(config, candles, (progress, trial) => {
  console.log(`Progress: ${progress}%`);
  console.log(`Trial ${trial.id}: ${trial.objectiveValue}`);
});

console.log('Best params:', result.bestParams);
console.log('Best Sharpe:', result.bestObjectiveValue);
```

### Tactics Optimization

Hyperopt can optimize tactics parameters:
- `positionSize` - Size of position (% or fixed)
- `tpPercent` - Take profit percentage
- `slPercent` - Stop loss percentage
- `trailingPercent` - Trailing stop distance
- `trailingActivation` - When to activate trailing

### Statistics Calculated

| Statistic | Description |
|-----------|-------------|
| avgObjective | Mean objective value |
| stdObjective | Standard deviation |
| min/max | Range of values |
| improvement | vs baseline parameters |
| convergenceRate | How quickly it converged |
| parameterImportance | Which params matter most |

### Integration with Backtesting

Hyperopt uses Backtesting Engine internally:
1. Samples parameters
2. Creates backtest config
3. Runs backtest
4. Extracts objective value
5. Records trial result

### Next Steps

- [ ] Implement parameter importance analysis
- [ ] Add multi-objective optimization
- [ ] Support for parallel trials
- [ ] Early stopping based on convergence
