# Genetic Algorithm Optimizer

## Overview

The Genetic Algorithm Optimizer is a production-ready evolutionary optimization system for trading bot parameters. It uses classical genetic algorithms (NO NEURAL NETWORKS) to find optimal parameter configurations.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    GENETIC ALGORITHM OPTIMIZER                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ GA Service   │───▶│  Optimizer   │───▶│  GARCH           │   │
│  │              │    │  Engine      │    │  Integration     │   │
│  └──────┬───────┘    └──────────────┘    └──────────────────┘   │
│         │                                                         │
│         ▼                                                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    API ENDPOINTS                           │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ POST /api/ga/optimize   - Start optimization               │  │
│  │ GET  /api/ga/progress   - Get optimization progress        │  │
│  │ POST /api/ga/apply      - Apply optimized parameters       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│         │                                                         │
│         ▼                                                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                 BOT INTEGRATION                            │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ DCA Bot  → DcaBot table    (baseAmount, dcaMultiplier)    │  │
│  │ BB Bot   → BBBot table     (stopLoss, takeProfit)         │  │
│  │ GRID Bot → GridBot table   (gridCount, gridType)          │  │
│  │ ORION/LOGOS/MFT → BotConfig (tradeAmount, minRiskReward)  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## ⚠️ Important: Bot Must Exist First

**Before optimizing parameters, the bot MUST be created in the Trading Bots section.**

The optimizer will:
- ✅ Apply optimized parameters to **existing bots**
- ❌ NOT create new bots automatically

**Workflow:**
1. Create bot in Trading Bots section (DCA, BB, GRID, etc.)
2. Note the bot code (e.g., `DCA-BTC-001`)
3. Run optimization with that bot code
4. Apply optimized parameters

## API Endpoints

### 1. POST /api/ga/optimize

Start a new optimization job.

**Request Body:**
```json
{
  "botCode": "DCA-BTC-001",
  "botType": "DCA",
  "symbol": "BTCUSDT",
  "geneTemplate": [...],      // Optional: custom gene template
  "config": {                 // Optional: GA configuration
    "populationSize": 50,
    "maxGenerations": 100,
    "mutationRate": 0.1,
    "crossoverRate": 0.8
  },
  "volatilityAware": true     // Enable GARCH integration
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "DCA-BTC-001-1234567890",
  "status": "running",
  "message": "Optimization started for DCA-BTC-001",
  "volatilityRegime": "normal",
  "volatilityAdjustments": {...}
}
```

### 2. GET /api/ga/progress

Get optimization progress.

**Query Parameters:**
- `jobId` (required): Job ID to get progress for

**Response:**
```json
{
  "success": true,
  "jobId": "DCA-BTC-001-1234567890",
  "status": "completed",
  "generation": 38,
  "maxGenerations": 100,
  "progress": 100,
  "bestChromosome": {
    "fitness": 0.692,
    "genes": [...]
  },
  "history": [...],
  "result": {
    "generations": 38,
    "converged": true,
    "evaluationsCount": 1950
  }
}
```

### 3. POST /api/ga/apply

Apply optimized parameters to a bot.

**Request Body:**
```json
{
  "jobId": "DCA-BTC-001-1234567890"
}
```

**Alternative:** `POST /api/ga/apply?botCode=<botCode>` to apply latest optimization.

**Response:**
```json
{
  "success": true,
  "botCode": "DCA-BTC-001",
  "appliedParams": {
    "baseOrderSize": 0.05,
    "safetyOrderSize": 0.1,
    "priceDeviation": 0.046,
    "takeProfit": 0.097,
    "maxSafetyOrders": 8,
    "safetyOrderStep": 0.065
  },
  "fitness": 0.692,
  "message": "Applied optimized parameters to DCA-BTC-001"
}
```

### 4. GET /api/ga/apply?botCode=<botCode>

Get latest optimized parameters for a bot.

**Response:**
```json
{
  "success": true,
  "botCode": "DCA-BTC-001",
  "fitness": 0.692,
  "params": {...},
  "completedAt": 1234567890,
  "volatilityRegime": "normal"
}
```

## Supported Bot Types

Each bot type has predefined parameter templates:

### DCA Bot
```javascript
{
  baseOrderSize: [0.001, 0.05],
  safetyOrderSize: [0.002, 0.1],
  priceDeviation: [0.005, 0.05],
  takeProfit: [0.01, 0.1],
  maxSafetyOrders: [1, 15],
  safetyOrderStep: [0.01, 0.1]
}
```

### BB (Bollinger Bands) Bot
```javascript
{
  period: [10, 50],
  stdDev: [1.0, 3.5],
  stopLossPercent: [0.01, 0.05],
  takeProfitPercent: [0.02, 0.1],
  entryThreshold: [0.85, 1.0]
}
```

### ORION Bot
```javascript
{
  rsiPeriod: [7, 30],
  rsiOversold: [20, 40],
  rsiOverbought: [60, 80],
  macdFast: [5, 20],
  macdSlow: [15, 40],
  signalThreshold: [0.4, 0.9]
}
```

### LOGOS Meta Bot
```javascript
{
  confidenceThreshold: [0.3, 0.8],
  signalWeight: [0.3, 1.0],
  maxPositions: [1, 10],
  riskPerTrade: [0.01, 0.05]
}
```

### GRID Bot
```javascript
{
  gridLevels: [5, 30],
  gridSpacing: [0.005, 0.03],
  positionSize: [0.005, 0.05],
  takeProfitGrid: [0.002, 0.02]
}
```

### MFT Bot
```javascript
{
  fastPeriod: [3, 15],
  slowPeriod: [10, 50],
  signalPeriod: [5, 20],
  stopLossPercent: [0.005, 0.04],
  trailPercent: [0.005, 0.03]
}
```

## GARCH Integration

The Genetic Algorithm integrates with GARCH volatility analysis for volatility-aware optimization:

### Volatility Adjustments by Regime

| Regime | Mutation Rate | Fitness Penalty | Exploration Boost |
|--------|--------------|-----------------|-------------------|
| Low    | 0.8x         | 0%              | 0%                |
| Normal | 1.0x         | 0%              | 0%                |
| High   | 1.3x         | 5%              | 15%               |
| Extreme| 1.5x         | 10%             | 25%               |

### Features

1. **Dynamic Mutation Rates**: Higher mutation in volatile markets for exploration
2. **Fitness Penalty**: Penalize unstable parameter configurations
3. **Exploration Boost**: Encourage diverse solutions in uncertainty
4. **Regime Constraints**: Stricter position limits in extreme volatility
5. **Diversification Bonus**: Reward diverse solutions in high volatility

## Usage Examples

### Start Optimization with GARCH

```typescript
const response = await fetch('/api/ga/optimize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    botCode: 'DCA-BTC-001',
    botType: 'DCA',
    symbol: 'BTCUSDT',
    volatilityAware: true
  })
});

const { jobId } = await response.json();
```

### Monitor Progress

```typescript
const checkProgress = async (jobId: string) => {
  const response = await fetch(`/api/ga/progress?jobId=${jobId}`);
  const data = await response.json();
  
  console.log(`Generation: ${data.generation}/${data.maxGenerations}`);
  console.log(`Best Fitness: ${data.bestChromosome?.fitness}`);
  
  return data.status === 'completed';
};
```

### Apply Optimized Parameters

```typescript
const applyParams = async (jobId: string) => {
  const response = await fetch('/api/ga/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId })
  });
  
  return response.json();
};
```

## Files

```
src/
├── lib/
│   ├── self-learning/
│   │   ├── genetic-optimizer.ts      # Core GA engine
│   │   ├── ga-service.ts             # Service for managing optimizations
│   │   ├── ga-garch-integration.ts   # GARCH volatility integration
│   │   └── types.ts                  # Type definitions
│   ├── genetic/
│   │   ├── nsga2.ts                  # Multi-objective NSGA-II
│   │   ├── engine.ts                 # GA engine
│   │   └── types.ts                  # GA types
│   └── optimization/
│       └── ga-backtest-integration.ts # Backtest fitness
├── components/
│   └── self-learning/
│       └── genetic-optimizer-panel.tsx # UI panel
└── app/api/ga/
    ├── optimize/route.ts             # Start optimization
    ├── progress/route.ts             # Get progress
    └── apply/route.ts                # Apply parameters
```

## Performance

- **Population Size**: 50-100 individuals
- **Generations**: 50-100 typical
- **Convergence**: ~20-40 generations with early stopping
- **Evaluation Time**: ~50-100ms for 100 generations

## Best Practices

1. **Use GARCH Integration**: Enable volatility-aware optimization for production
2. **Set Appropriate Constraints**: Add parameter constraints for risk management
3. **Monitor Diversity**: Low diversity indicates premature convergence
4. **Cross-Validate**: Use backtesting for fitness evaluation
5. **Apply Gradually**: Test optimized parameters in paper trading first

## NO NEURAL NETWORKS

This system uses **classical evolutionary methods only**:
- Tournament/Roulette Selection
- Single/Two-Point/Uniform/Blend Crossover
- Gaussian/Adaptive Mutation
- Elitism Preservation
- Early Stopping
- NSGA-II for Multi-Objective

No machine learning models, neural networks, or deep learning are used.

## Bot Integration Details

### Parameter Mapping by Bot Type

#### DCA Bot
| GA Parameter | DcaBot Field | Transformation |
|-------------|--------------|----------------|
| baseOrderSize | baseAmount | × 10000 (USDT) |
| safetyOrderSize | dcaMultiplier | ÷ baseOrderSize |
| priceDeviation | dcaPercent | × 100 (%) |
| takeProfit | tpValue | × 100 (%) |
| maxSafetyOrders | dcaLevels | rounded |
| safetyOrderStep | dcaPriceScale | × 20 |

#### BB Bot
| GA Parameter | BBBot Field | Transformation |
|-------------|-------------|----------------|
| period | (stored in BBotTimeframeConfig) | - |
| stdDev | (stored in BBotTimeframeConfig) | - |
| stopLossPercent | stopLoss | × 100 (%) |
| takeProfitPercent | takeProfit | × 100 (%) |
| entryThreshold | (signal threshold) | - |

#### GRID Bot
| GA Parameter | GridBot Field | Transformation |
|-------------|---------------|----------------|
| gridLevels | gridCount | rounded |
| gridSpacing | gridType | < 0.015 = ARITHMETIC |
| positionSize | perGridAmount | × 10000 (USDT) |
| takeProfitGrid | (take profit setting) | - |

#### ORION/LOGOS/MFT Bots
| GA Parameter | BotConfig Field | Transformation |
|-------------|-----------------|----------------|
| riskPerTrade | tradeAmount | × 10000 (USDT) |
| signalThreshold | minRiskRewardRatio | - |
| confidenceThreshold | (signal config) | - |

### Database Schema

Optimization jobs are persisted in the `GAOptimizationJob` table:

```prisma
model GAOptimizationJob {
  id                  String   @id @default(cuid())
  jobId               String   @unique
  botCode             String
  botType             String
  symbol              String
  status              String
  config              String   // JSON
  geneTemplate        String   // JSON
  constraints         String   // JSON
  generation          Int
  progress            Float
  bestChromosome      String?  // JSON
  history             String   // JSON
  startedAt           DateTime?
  completedAt         DateTime?
  durationMs          Int
  result              String?  // JSON
  error               String?
  volatilityRegime    String?
  volatilityAdjustments String? // JSON
  gaGarchConfig       String?  // JSON
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

## Troubleshooting

### "Job not found" error
- Job completed and memory was cleared
- Use `/api/ga/optimize` (GET) to list all jobs
- Jobs are persisted in database

### "Bot not found" when applying
- Create the bot first in Trading Bots section
- Ensure botCode matches exactly (case-sensitive)

### Optimization stuck at 0%
- Check dev.log for errors
- Reduce population size for faster testing
- Ensure fitness function is not blocking
