/**
 * SELF-LEARNING ENGINE - Types
 *
 * Self-learning system using genetic algorithms (NO NEURAL NETWORKS).
 * Optimizes trading parameters through evolutionary methods.
 */

// =============================================================================
// GENETIC ALGORITHM TYPES
// =============================================================================

export interface Gene {
  name: string;
  value: number;
  min: number;
  max: number;
  mutationRate: number;
}

export interface Chromosome {
  id: string;
  genes: Gene[];
  fitness: number;
  age: number;
  generation: number;
}

export interface PopulationStats {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  worstFitness: number;
  diversity: number;
  stagnationCount: number;
}

// =============================================================================
// OPTIMIZATION TYPES
// =============================================================================

export type SelectionMethod = 'tournament' | 'roulette' | 'rank' | 'elitist';
export type CrossoverMethod = 'single_point' | 'two_point' | 'uniform' | 'blend';
export type MutationMethod = 'random' | 'gaussian' | 'adaptive';

export interface GeneticConfig {
  /** Population size */
  populationSize: number;
  /** Maximum generations */
  maxGenerations: number;
  /** Elite preservation count */
  eliteCount: number;
  /** Selection method */
  selectionMethod: SelectionMethod;
  /** Tournament size (for tournament selection) */
  tournamentSize: number;
  /** Crossover method */
  crossoverMethod: CrossoverMethod;
  /** Crossover probability */
  crossoverRate: number;
  /** Mutation method */
  mutationMethod: MutationMethod;
  /** Base mutation probability */
  mutationRate: number;
  /** Adaptive mutation increase when stagnating */
  adaptiveMutationIncrease: number;
  /** Early stopping patience (generations without improvement) */
  earlyStoppingPatience: number;
  /** Minimum fitness improvement threshold */
  improvementThreshold: number;
  /** Parallel fitness evaluation */
  parallelEvaluation: boolean;
}

// =============================================================================
// LEARNING TASK TYPES
// =============================================================================

export interface LearningTask {
  id: string;
  botCode: string;
  parameters: Gene[];
  fitnessFunction: FitnessFunction;
  constraints: Constraint[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  result?: OptimizationResult;
}

export type FitnessFunction = (genes: Gene[]) => Promise<number> | number;

export interface Constraint {
  type: 'range' | 'sum' | 'ratio' | 'custom';
  parameters: string[];
  min?: number;
  max?: number;
  check?: (genes: Gene[]) => boolean;
}

// =============================================================================
// OPTIMIZATION RESULT
// =============================================================================

export interface OptimizationResult {
  /** Best chromosome found */
  bestChromosome: Chromosome;
  /** Final population */
  finalPopulation: Chromosome[];
  /** Evolution history */
  history: PopulationStats[];
  /** Total generations run */
  generations: number;
  /** Whether it converged */
  converged: boolean;
  /** Time taken in ms */
  durationMs: number;
  /** Fitness evaluations count */
  evaluationsCount: number;
}

// =============================================================================
// BOT PARAMETER OPTIMIZATION
// =============================================================================

export interface BotParameters {
  /** Risk per trade (fraction) */
  riskPerTrade: number;
  /** Stop loss ATR multiplier */
  stopLossAtr: number;
  /** Take profit risk/reward ratio */
  takeProfitRR: number;
  /** Trailing stop activation % */
  trailingActivation: number;
  /** Trailing stop distance % */
  trailingDistance: number;
  /** Position size multiplier */
  positionMultiplier: number;
  /** Signal threshold */
  signalThreshold: number;
  /** Time filter (hours) */
  timeFilterStart: number;
  timeFilterEnd: number;
}

export interface BotOptimizationConfig {
  botCode: string;
  baseParameters: BotParameters;
  parameterRanges: Record<keyof BotParameters, { min: number; max: number }>;
  fitnessWeights: {
    profit: number;
    winRate: number;
    sharpe: number;
    drawdown: number;
    trades: number;
  };
  backtestPeriod: {
    start: number;
    end: number;
  };
}

// =============================================================================
// ADAPTIVE LEARNING
// =============================================================================

export interface AdaptiveConfig {
  /** Enable online learning */
  enableOnlineLearning: boolean;
  /** Learning rate decay */
  learningRateDecay: number;
  /** Minimum learning rate */
  minLearningRate: number;
  /** Memory window (trades to remember) */
  memoryWindow: number;
  /** Exploration rate */
  explorationRate: number;
  /** Exploration decay */
  explorationDecay: number;
}

export interface LearningMemory {
  /** Recent trade outcomes */
  trades: TradeOutcome[];
  /** Parameter performance history */
  parameterHistory: Array<{ params: BotParameters; performance: number }>;
  /** Market regime memory */
  regimeMemory: Map<string, BotParameters>;
}

export interface TradeOutcome {
  timestamp: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  parameters: BotParameters;
  marketRegime: string;
  duration: number;
}

// =============================================================================
// META-LEARNING
// =============================================================================

export interface MetaLearningConfig {
  /** Enable meta-learning across bots */
  enabled: boolean;
  /** Knowledge sharing frequency */
  shareFrequency: number;
  /** Knowledge aggregation method */
  aggregationMethod: 'average' | 'weighted' | 'best';
  /** Cross-bot learning rate */
  crossLearningRate: number;
}

export interface SharedKnowledge {
  /** Best parameters by bot */
  bestParameters: Map<string, BotParameters>;
  /** Market regime parameters */
  regimeParameters: Map<string, BotParameters>;
  /** Performance correlation matrix */
  correlationMatrix: Map<string, Map<string, number>>;
  /** Last update timestamp */
  updatedAt: number;
}
