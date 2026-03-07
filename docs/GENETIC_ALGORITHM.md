# Genetic Algorithm Framework

## Overview

The Genetic Algorithm Framework provides evolutionary optimization for trading bot parameters. It uses classical genetic algorithms without neural networks, making it interpretable and fast.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GENETIC ALGORITHM ENGINE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  Initialize  │───▶│   Evaluate   │───▶│   Select     │          │
│  │  Population  │    │   Fitness    │    │   Parents    │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                 │                    │
│                                                 ▼                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Terminate  │◀───│    Mutate    │◀───│   Crossover  │          │
│  │   Check      │    │   Genes      │    │   Parents    │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────┐                                                   │
│  │    Return    │                                                   │
│  │    Best      │                                                   │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { GeneticEngine, type Chromosome, type GAConfig } from '@/lib/genetic'

// Define chromosome template (parameters to optimize)
const template: Chromosome = [
  { name: 'rsiPeriod', value: 14, min: 5, max: 30, type: 'discrete' },
  { name: 'rsiOversold', value: 30, min: 10, max: 40, type: 'continuous' },
  { name: 'rsiOverbought', value: 70, min: 60, max: 90, type: 'continuous' },
  { name: 'stopLoss', value: 0.02, min: 0.005, max: 0.05, type: 'continuous' },
  { name: 'takeProfit', value: 0.04, min: 0.01, max: 0.1, type: 'continuous' },
]

// Define fitness function (evaluate strategy performance)
async function fitnessFunction(chromosome: Chromosome): Promise<number> {
  const params = chromosomeToParams(chromosome)
  
  // Run backtest with parameters
  const result = await runBacktest({
    rsiPeriod: params.rsiPeriod as number,
    rsiOversold: params.rsiOversold as number,
    rsiOverbought: params.rsiOverbought as number,
    stopLoss: params.stopLoss as number,
    takeProfit: params.takeProfit as number,
  })
  
  // Return Sharpe ratio (higher is better)
  return result.sharpeRatio
}

// Create and run genetic algorithm
const ga = new GeneticEngine(
  {
    chromosomeTemplate: template,
    populationSize: 50,
    termination: {
      maxGenerations: 100,
      targetFitness: 2.0,  // Target Sharpe ratio
      maxStagnation: 20,
    },
    operators: {
      selection: { method: 'tournament', tournamentSize: 3 },
      crossover: { method: 'blend', rate: 0.8 },
      mutation: { method: 'gaussian', rate: 0.1, strength: 0.2 },
      elitism: { enabled: true, count: 2 },
    },
  },
  fitnessFunction
)

const result = await ga.run()

console.log('Best parameters:', result.bestIndividual.chromosome)
console.log('Best fitness (Sharpe):', result.bestIndividual.fitness)
console.log('Generations:', result.statistics.totalGenerations)
```

## Selection Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| `tournament` | Select best from random subset | General purpose, preserves diversity |
| `roulette` | Probability proportional to fitness | When fitness varies widely |
| `rank` | Probability based on rank order | When fitness values are similar |
| `sus` | Stochastic Universal Sampling | When you need multiple selections |

## Crossover Methods

| Method | Description | Best For |
|--------|-------------|----------|
| `single-point` | One cut point | Simple parameters |
| `two-point` | Two cut points | Mixed parameters |
| `uniform` | Random gene selection | Independent genes |
| `blend` | BLX-α interpolation | Continuous parameters |
| `sbx` | Simulated Binary Crossover | Continuous with bounds |

## Mutation Methods

| Method | Description | Best For |
|--------|-------------|----------|
| `gaussian` | Normal distribution mutation | Continuous parameters |
| `uniform` | Random within bounds | General purpose |
| `polynomial` | Polynomial distribution | Fine-tuning |
| `non-uniform` | Time-decaying mutation | Late-stage optimization |

## Configuration

### Complete GA Configuration

```typescript
const config: GAConfig = {
  // Population size
  populationSize: 100,
  
  // Chromosome template
  chromosomeTemplate: myTemplate,
  
  // Genetic operators
  operators: {
    selection: {
      method: 'tournament',
      tournamentSize: 3,
      pressure: 2.0,
    },
    crossover: {
      method: 'blend',
      rate: 0.8,
      blendAlpha: 0.5,
    },
    mutation: {
      method: 'gaussian',
      rate: 0.1,
      strength: 0.2,
    },
    elitism: {
      enabled: true,
      count: 2,
    },
  },
  
  // Termination criteria
  termination: {
    maxGenerations: 100,
    targetFitness: 2.0,
    maxStagnation: 20,
    minDiversity: 0.01,
    timeLimit: 300000, // 5 minutes
  },
  
  // Logging
  verbose: true,
  logInterval: 10,
}
```

## Gene Types

### Continuous Gene
```typescript
{
  name: 'stopLoss',
  value: 0.02,
  min: 0.005,
  max: 0.05,
  type: 'continuous',
}
```

### Discrete Gene
```typescript
{
  name: 'rsiPeriod',
  value: 14,
  min: 5,
  max: 30,
  type: 'discrete',
}
```

### Categorical Gene
```typescript
{
  name: 'strategy',
  value: 0,
  min: 0,
  max: 2,
  type: 'categorical',
  categories: ['trend', 'reversal', 'breakout'],
}
```

## Fitness Function Design

### Single Objective

```typescript
async function fitness(chromosome: Chromosome): Promise<number> {
  const result = await backtest(chromosome)
  return result.sharpeRatio
}
```

### Multi-Objective (Manual Combination)

```typescript
async function fitness(chromosome: Chromosome): Promise<number> {
  const result = await backtest(chromosome)
  
  // Weighted combination
  const sharpeWeight = 0.4
  const winRateWeight = 0.3
  const maxDrawdownWeight = 0.3
  
  return (
    sharpeWeight * result.sharpeRatio +
    winRateWeight * result.winRate +
    maxDrawdownWeight * (1 - result.maxDrawdown)
  )
}
```

## Integration with Trading Bots

### Optimizing Grid Bot (MESH)

```typescript
const meshTemplate: Chromosome = [
  { name: 'gridLevels', value: 10, min: 5, max: 50, type: 'discrete' },
  { name: 'gridSpacing', value: 0.01, min: 0.002, max: 0.05, type: 'continuous' },
  { name: 'trailingPercent', value: 0.5, min: 0, max: 1, type: 'continuous' },
]

const ga = new GeneticEngine(
  { chromosomeTemplate: meshTemplate, populationSize: 50 },
  async (chromosome) => {
    const params = chromosomeToParams(chromosome)
    return await backtestGridBot(params)
  }
)
```

### Optimizing DCA Bot (SCALE)

```typescript
const dcaTemplate: Chromosome = [
  { name: 'safetyOrderCount', value: 3, min: 1, max: 10, type: 'discrete' },
  { name: 'safetyOrderScaling', value: 1.5, min: 1.0, max: 3.0, type: 'continuous' },
  { name: 'takeProfitPercent', value: 0.02, min: 0.005, max: 0.1, type: 'continuous' },
  { name: 'deviationThreshold', value: 0.01, min: 0.005, max: 0.05, type: 'continuous' },
]
```

## Performance Tips

1. **Population Size**: Start with 50-100, increase for complex problems
2. **Mutation Rate**: 0.01-0.1 is typical; lower for converged populations
3. **Elitism**: Preserve top 1-5% to maintain best solutions
4. **Termination**: Use maxStagnation to avoid wasted computation
5. **Parallel Evaluation**: Run fitness evaluations in parallel for speed

## File Structure

```
src/lib/genetic/
├── index.ts      # Module exports
├── types.ts      # Type definitions and utilities
└── engine.ts     # Genetic algorithm implementation
```
