/**
 * CITARION Genetic Algorithm Framework
 * 
 * Evolutionary optimization for trading bot parameters.
 * No neural networks - uses classical genetic algorithms.
 * 
 * Features:
 * - Tournament and roulette wheel selection
 * - Single-point, two-point, and uniform crossover
 * - Gaussian and uniform mutation
 * - Elitism for preserving best individuals
 * - Multi-objective optimization (NSGA-II)
 * - Island model for parallel evolution
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Gene representation for a single parameter
 */
export interface Gene {
  name: string
  value: number
  min: number
  max: number
  type: 'continuous' | 'discrete' | 'categorical'
  categories?: string[]  // For categorical genes
}

/**
 * Chromosome - collection of genes representing a solution
 */
export type Chromosome = Gene[]

/**
 * Individual in the population
 */
export interface Individual {
  id: string
  chromosome: Chromosome
  fitness: number
  objectives: number[]  // For multi-objective optimization
  rank?: number         // Pareto rank for NSGA-II
  crowdingDistance?: number
  age: number           // Generations survived
  history: {
    fitnessHistory: number[]
    bestFitness: number
    avgFitness: number
  }
}

/**
 * Population of individuals
 */
export interface Population {
  generation: number
  individuals: Individual[]
  stats: {
    bestFitness: number
    avgFitness: number
    worstFitness: number
    diversity: number
    stagnationCount: number
  }
}

// ============================================================================
// GENETIC OPERATORS
// ============================================================================

/**
 * Selection method types
 */
export type SelectionMethod = 'tournament' | 'roulette' | 'rank' | 'sus'

/**
 * Crossover method types
 */
export type CrossoverMethod = 'single-point' | 'two-point' | 'uniform' | 'blend' | 'sbx'

/**
 * Mutation method types
 */
export type MutationMethod = 'gaussian' | 'uniform' | 'polynomial' | 'non-uniform'

/**
 * Genetic operator configuration
 */
export interface GeneticOperatorConfig {
  selection: {
    method: SelectionMethod
    tournamentSize?: number  // For tournament selection
    pressure?: number        // Selection pressure (1.5-2.0 typical)
  }
  crossover: {
    method: CrossoverMethod
    rate: number            // Probability of crossover (0.6-0.9)
    sbxDistributionIndex?: number  // For SBX crossover
    blendAlpha?: number     // For blend crossover
  }
  mutation: {
    method: MutationMethod
    rate: number            // Probability per gene (0.01-0.1)
    strength: number        // Mutation strength (sigma for Gaussian)
    polynomialDistributionIndex?: number
    decayRate?: number      // For non-uniform mutation
  }
  elitism: {
    enabled: boolean
    count: number           // Number of elite individuals to preserve
    percentage?: number     // Alternative: percentage of population
  }
}

// ============================================================================
// FITNESS FUNCTION
// ============================================================================

/**
 * Fitness evaluation context
 */
export interface FitnessContext {
  generation: number
  maxGenerations: number
  populationStats: Population['stats']
}

/**
 * Fitness function type
 */
export type FitnessFunction = (
  chromosome: Chromosome,
  context: FitnessContext
) => Promise<number> | number

/**
 * Multi-objective fitness function
 */
export type MultiObjectiveFitnessFunction = (
  chromosome: Chromosome,
  context: FitnessContext
) => Promise<number[]> | number[]

// ============================================================================
// GA CONFIGURATION
// ============================================================================

/**
 * Termination criteria
 */
export interface TerminationCriteria {
  maxGenerations: number
  targetFitness?: number
  maxStagnation?: number    // Stop if no improvement for N generations
  minDiversity?: number     // Stop if diversity drops below threshold
  timeLimit?: number        // Stop after N milliseconds
}

/**
 * Genetic Algorithm configuration
 */
export interface GAConfig {
  // Population
  populationSize: number
  chromosomeTemplate: Chromosome
  
  // Operators
  operators: GeneticOperatorConfig
  
  // Termination
  termination: TerminationCriteria
  
  // Multi-objective
  multiObjective: boolean
  objectiveCount?: number
  
  // Island model
  islandModel: boolean
  islandCount?: number
  migrationInterval?: number
  migrationRate?: number
  
  // Advanced
  adaptiveOperators: boolean
  diversityPreservation: boolean
  localSearch: boolean
  localSearchRate?: number
  
  // Logging
  verbose: boolean
  logInterval?: number
}

/**
 * Default GA configuration
 */
export const DEFAULT_GA_CONFIG: Omit<GAConfig, 'chromosomeTemplate'> = {
  populationSize: 100,
  
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
      percentage: 0.02,
    },
  },
  
  termination: {
    maxGenerations: 100,
    maxStagnation: 20,
    minDiversity: 0.01,
  },
  
  multiObjective: false,
  
  islandModel: false,
  islandCount: 4,
  migrationInterval: 10,
  migrationRate: 0.1,
  
  adaptiveOperators: false,
  diversityPreservation: true,
  localSearch: false,
  localSearchRate: 0.1,
  
  verbose: true,
  logInterval: 10,
}

// ============================================================================
// GA RESULT
// ============================================================================

/**
 * Optimization result
 */
export interface GAResult {
  success: boolean
  bestIndividual: Individual
  finalPopulation: Population
  history: {
    generation: number
    bestFitness: number
    avgFitness: number
    diversity: number
  }[]
  statistics: {
    totalEvaluations: number
    totalGenerations: number
    elapsedMs: number
    convergenceGeneration?: number
  }
  message?: string
}

/**
 * Pareto front for multi-objective optimization
 */
export interface ParetoFront {
  individuals: Individual[]
  hypervolume: number
}

// ============================================================================
// BOT PARAMETER OPTIMIZATION
// ============================================================================

/**
 * Bot parameter definition
 */
export interface BotParameterDef {
  name: string
  type: 'continuous' | 'discrete' | 'categorical'
  min?: number
  max?: number
  step?: number           // For discrete parameters
  categories?: string[]   // For categorical parameters
  default: number | string
}

/**
 * Bot optimization config
 */
export interface BotOptimizationConfig {
  botType: string
  parameters: BotParameterDef[]
  fitnessFunction: FitnessFunction
  objectives?: string[]   // For multi-objective
  constraints?: {
    name: string
    evaluate: (chromosome: Chromosome) => boolean
  }[]
}

// ============================================================================
// IMMIGRATION MECHANISM (CIT-029)
// ============================================================================

/**
 * Immigration strategy to maintain genetic diversity
 */
export type ImmigrationStrategy = 'random' | 'diverse' | 'hybrid'

/**
 * Immigration configuration
 */
export interface ImmigrationConfig {
  enabled: boolean
  rate: number                    // Percentage of population to replace (0.0-1.0)
  interval: number                // Apply immigration every N generations
  strategy: ImmigrationStrategy
  preserveElites: number          // Number of elites to protect from replacement
  diversityThreshold?: number     // Trigger immigration if diversity below threshold
}

/**
 * Default immigration configuration
 */
export const DEFAULT_IMMIGRATION_CONFIG: ImmigrationConfig = {
  enabled: true,
  rate: 0.1,
  interval: 10,
  strategy: 'diverse',
  preserveElites: 5,
  diversityThreshold: 0.05,
}

// ============================================================================
// OVERFITTING PROTECTION (CIT-027)
// ============================================================================

/**
 * Cross-validation split type
 */
export type CrossValidationType = 'train-test' | 'k-fold' | 'walk-forward' | 'time-series'

/**
 * Overfitting protection configuration
 */
export interface OverfittingProtectionConfig {
  enabled: boolean
  validationSplit: number         // Fraction of data for validation (0.0-1.0)
  crossValidationType: CrossValidationType
  kFolds?: number                 // For k-fold cross-validation
  maxTrainTestGap: number         // Maximum allowed train/test performance gap
  penaltyWeight: number           // Weight for overfitting penalty
  earlyStoppingPatience?: number  // Stop if validation fitness doesn't improve
  walkForwardWindows?: number     // For walk-forward validation
  walkForwardTrainRatio?: number  // Ratio of training window
}

/**
 * Default overfitting protection configuration
 */
export const DEFAULT_OVERFITTING_CONFIG: OverfittingProtectionConfig = {
  enabled: true,
  validationSplit: 0.3,
  crossValidationType: 'train-test',
  maxTrainTestGap: 0.25,
  penaltyWeight: 0.5,
  earlyStoppingPatience: 10,
}

/**
 * Validation result for fitness evaluation
 */
export interface ValidationResult {
  trainFitness: number
  validationFitness: number
  overfittingScore: number        // 0 = no overfitting, 1 = severe overfitting
  penalizedFitness: number        // Fitness with overfitting penalty applied
  isValid: boolean                // True if within acceptable bounds
}

// ============================================================================
// PARALLEL FITNESS EVALUATION (CIT-028)
// ============================================================================

/**
 * Parallel execution mode
 */
export type ParallelMode = 'none' | 'threads' | 'batch' | 'async'

/**
 * Parallel evaluation configuration
 */
export interface ParallelEvaluationConfig {
  enabled: boolean
  mode: ParallelMode
  maxWorkers: number              // Maximum number of parallel workers
  batchSize: number               // Number of individuals per batch
  timeout: number                 // Timeout per evaluation in ms
  retries: number                 // Number of retries for failed evaluations
}

/**
 * Default parallel evaluation configuration
 */
export const DEFAULT_PARALLEL_CONFIG: ParallelEvaluationConfig = {
  enabled: true,
  mode: 'async',
  maxWorkers: 4,
  batchSize: 10,
  timeout: 30000,
  retries: 2,
}

/**
 * Worker task for parallel evaluation
 */
export interface FitnessWorkerTask {
  id: string
  chromosome: Chromosome
  context: FitnessContext
}

/**
 * Worker result from parallel evaluation
 */
export interface FitnessWorkerResult {
  id: string
  fitness: number
  objectives?: number[]
  error?: string
  duration: number
}

// ============================================================================
// ENHANCED GA CONFIGURATION
// ============================================================================

/**
 * Extended GA configuration with all enhancements
 */
export interface EnhancedGAConfig extends GAConfig {
  // Immigration mechanism
  immigration?: ImmigrationConfig
  
  // Overfitting protection
  overfittingProtection?: OverfittingProtectionConfig
  
  // Parallel evaluation
  parallelEvaluation?: ParallelEvaluationConfig
}

/**
 * Default enhanced GA configuration
 */
export const DEFAULT_ENHANCED_GA_CONFIG: Omit<EnhancedGAConfig, 'chromosomeTemplate'> = {
  ...DEFAULT_GA_CONFIG,
  immigration: DEFAULT_IMMIGRATION_CONFIG,
  overfittingProtection: DEFAULT_OVERFITTING_CONFIG,
  parallelEvaluation: DEFAULT_PARALLEL_CONFIG,
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Clamp value to bounds
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Random number in range
 */
export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Random integer in range (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Gaussian random number (Box-Muller transform)
 */
export function gaussianRandom(mean: number = 0, std: number = 1): number {
  const u1 = Math.random()
  const u2 = Math.random()
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return z0 * std + mean
}

/**
 * Calculate population diversity (average distance from mean)
 */
export function calculateDiversity(population: Individual[]): number {
  if (population.length === 0) return 0
  
  // Calculate mean chromosome
  const geneCount = population[0].chromosome.length
  const means: number[] = []
  
  for (let i = 0; i < geneCount; i++) {
    let sum = 0
    for (const ind of population) {
      sum += ind.chromosome[i].value
    }
    means.push(sum / population.length)
  }
  
  // Calculate average distance from mean
  let totalDistance = 0
  for (const ind of population) {
    let distance = 0
    for (let i = 0; i < geneCount; i++) {
      distance += Math.pow(ind.chromosome[i].value - means[i], 2)
    }
    totalDistance += Math.sqrt(distance)
  }
  
  return totalDistance / population.length
}

/**
 * Convert chromosome to parameter map
 */
export function chromosomeToParams(chromosome: Chromosome): Record<string, number | string> {
  const params: Record<string, number | string> = {}
  for (const gene of chromosome) {
    if (gene.type === 'categorical' && gene.categories) {
      params[gene.name] = gene.categories[Math.round(gene.value)]
    } else if (gene.type === 'discrete') {
      params[gene.name] = Math.round(gene.value)
    } else {
      params[gene.name] = gene.value
    }
  }
  return params
}

/**
 * Create chromosome from parameter map
 */
export function paramsToChromosome(
  params: Record<string, number | string>,
  template: Chromosome
): Chromosome {
  return template.map(gene => {
    const value = params[gene.name]
    return {
      ...gene,
      value: typeof value === 'string' 
        ? gene.categories?.indexOf(value) ?? 0 
        : value,
    }
  })
}
