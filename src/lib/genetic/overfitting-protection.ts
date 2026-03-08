/**
 * CITARION Overfitting Protection Module
 * 
 * Implements validation-based overfitting protection for genetic algorithm
 * optimization of trading strategies.
 * 
 * CIT-027: Overfitting protection with validation sets and penalties
 */

import {
  Chromosome,
  FitnessContext,
  FitnessFunction,
  OverfittingProtectionConfig,
  DEFAULT_OVERFITTING_CONFIG,
  ValidationResult,
  CrossValidationType,
} from './types'

// ============================================================================
// DATA SPLITTING
// ============================================================================

/**
 * Data split configuration for train/validation
 */
export interface DataSplit {
  trainIndices: number[]
  validationIndices: number[]
}

/**
 * Split data into training and validation sets
 */
export function createTrainTestSplit(
  totalSize: number,
  validationRatio: number = 0.3,
  shuffle: boolean = false
): DataSplit {
  const allIndices = Array.from({ length: totalSize }, (_, i) => i)
  
  if (shuffle) {
    // Fisher-Yates shuffle
    for (let i = allIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]]
    }
  }
  
  const validationSize = Math.floor(totalSize * validationRatio)
  
  return {
    trainIndices: allIndices.slice(validationSize),
    validationIndices: allIndices.slice(0, validationSize),
  }
}

/**
 * Create k-fold cross-validation splits
 */
export function createKFoldSplits(
  totalSize: number,
  k: number = 5,
  shuffle: boolean = true
): DataSplit[] {
  const allIndices = Array.from({ length: totalSize }, (_, i) => i)
  
  if (shuffle) {
    for (let i = allIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]]
    }
  }
  
  const foldSize = Math.floor(totalSize / k)
  const splits: DataSplit[] = []
  
  for (let i = 0; i < k; i++) {
    const start = i * foldSize
    const end = i === k - 1 ? totalSize : (i + 1) * foldSize
    
    splits.push({
      validationIndices: allIndices.slice(start, end),
      trainIndices: [
        ...allIndices.slice(0, start),
        ...allIndices.slice(end),
      ],
    })
  }
  
  return splits
}

/**
 * Create walk-forward validation splits for time series data
 */
export function createWalkForwardSplits(
  totalSize: number,
  windows: number = 5,
  trainRatio: number = 0.7
): DataSplit[] {
  const splits: DataSplit[] = []
  const windowSize = Math.floor(totalSize / windows)
  
  for (let i = 0; i < windows; i++) {
    const windowStart = i * windowSize
    const windowEnd = i === windows - 1 ? totalSize : (i + 1) * windowSize
    const windowLength = windowEnd - windowStart
    
    const trainSize = Math.floor(windowLength * trainRatio)
    
    splits.push({
      trainIndices: Array.from(
        { length: trainSize },
        (_, j) => windowStart + j
      ),
      validationIndices: Array.from(
        { length: windowLength - trainSize },
        (_, j) => windowStart + trainSize + j
      ),
    })
  }
  
  return splits
}

/**
 * Create time-series split (expanding window)
 */
export function createTimeSeriesSplits(
  totalSize: number,
  minTrainSize: number = 100,
  stepSize: number = 50
): DataSplit[] {
  const splits: DataSplit[] = []
  let trainEnd = minTrainSize
  
  while (trainEnd < totalSize - stepSize) {
    const validationEnd = Math.min(trainEnd + stepSize, totalSize)
    
    splits.push({
      trainIndices: Array.from({ length: trainEnd }, (_, i) => i),
      validationIndices: Array.from(
        { length: validationEnd - trainEnd },
        (_, i) => trainEnd + i
      ),
    })
    
    trainEnd += stepSize
  }
  
  return splits
}

// ============================================================================
// OVERFITTING METRICS
// ============================================================================

/**
 * Calculate overfitting score (0 = no overfitting, 1 = severe overfitting)
 */
export function calculateOverfittingScore(
  trainFitness: number,
  validationFitness: number,
  maximize: boolean = true
): number {
  if (trainFitness === 0) return 0
  
  const gap = maximize
    ? (trainFitness - validationFitness) / Math.abs(trainFitness)
    : (validationFitness - trainFitness) / Math.abs(trainFitness)
  
  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, gap))
}

/**
 * Calculate penalized fitness with overfitting penalty
 */
export function calculatePenalizedFitness(
  trainFitness: number,
  validationFitness: number,
  config: OverfittingProtectionConfig,
  maximize: boolean = true
): number {
  const overfittingScore = calculateOverfittingScore(trainFitness, validationFitness, maximize)
  
  if (overfittingScore > config.maxTrainTestGap) {
    // Heavy penalty for severe overfitting
    const penalty = 1 - (overfittingScore - config.maxTrainTestGap) * config.penaltyWeight
    return maximize ? trainFitness * penalty : trainFitness / penalty
  }
  
  // Blend train and validation fitness
  return trainFitness * (1 - config.validationSplit) + validationFitness * config.validationSplit
}

/**
 * Create validation result
 */
export function createValidationResult(
  trainFitness: number,
  validationFitness: number,
  config: OverfittingProtectionConfig,
  maximize: boolean = true
): ValidationResult {
  const overfittingScore = calculateOverfittingScore(trainFitness, validationFitness, maximize)
  const penalizedFitness = calculatePenalizedFitness(trainFitness, validationFitness, config, maximize)
  
  return {
    trainFitness,
    validationFitness,
    overfittingScore,
    penalizedFitness,
    isValid: overfittingScore <= config.maxTrainTestGap,
  }
}

// ============================================================================
// FITNESS FUNCTION WRAPPER
// ============================================================================

/**
 * Fitness function with training data
 */
export type DataFitnessFunction<T> = (
  chromosome: Chromosome,
  context: FitnessContext,
  dataIndices: number[]
) => Promise<number> | number

/**
 * Create overfitting-protected fitness function
 */
export function createProtectedFitnessFunction<T>(
  trainFitnessFn: DataFitnessFunction<T>,
  validationFitnessFn: DataFitnessFunction<T>,
  config: OverfittingProtectionConfig,
  dataSplit: DataSplit
): FitnessFunction {
  return async (chromosome: Chromosome, context: FitnessContext): Promise<number> => {
    // Evaluate on training data
    const trainFitness = await trainFitnessFn(chromosome, context, dataSplit.trainIndices)
    
    if (!config.enabled) {
      return trainFitness
    }
    
    // Evaluate on validation data
    const validationFitness = await validationFitnessFn(chromosome, context, dataSplit.validationIndices)
    
    // Calculate penalized fitness
    const result = createValidationResult(trainFitness, validationFitness, config)
    
    return result.penalizedFitness
  }
}

// ============================================================================
// CROSS-VALIDATION FITNESS EVALUATOR
// ============================================================================

export class CrossValidationEvaluator {
  private config: OverfittingProtectionConfig
  private splits: DataSplit[] = []
  private currentSplitIndex: number = 0

  constructor(config: Partial<OverfittingProtectionConfig> = {}) {
    this.config = { ...DEFAULT_OVERFITTING_CONFIG, ...config }
  }

  /**
   * Initialize cross-validation splits
   */
  initialize(totalSize: number): void {
    switch (this.config.crossValidationType) {
      case 'k-fold':
        this.splits = createKFoldSplits(totalSize, this.config.kFolds || 5)
        break
      case 'walk-forward':
        this.splits = createWalkForwardSplits(
          totalSize,
          this.config.walkForwardWindows || 5,
          this.config.walkForwardTrainRatio || 0.7
        )
        break
      case 'time-series':
        this.splits = createTimeSeriesSplits(totalSize)
        break
      case 'train-test':
      default:
        this.splits = [createTrainTestSplit(totalSize, this.config.validationSplit)]
        break
    }
    
    this.currentSplitIndex = 0
  }

  /**
   * Get current split
   */
  getCurrentSplit(): DataSplit | null {
    return this.splits[this.currentSplitIndex] || null
  }

  /**
   * Move to next split
   */
  nextSplit(): boolean {
    this.currentSplitIndex++
    return this.currentSplitIndex < this.splits.length
  }

  /**
   * Evaluate fitness with cross-validation
   */
  async evaluateFitness<T>(
    fitnessFn: DataFitnessFunction<T>,
    chromosome: Chromosome,
    context: FitnessContext
  ): Promise<ValidationResult> {
    if (this.splits.length === 0) {
      throw new Error('Cross-validation not initialized. Call initialize() first.')
    }

    const trainFitnesses: number[] = []
    const validationFitnesses: number[] = []

    for (const split of this.splits) {
      const trainFitness = await fitnessFn(chromosome, context, split.trainIndices)
      const validationFitness = await fitnessFn(chromosome, context, split.validationIndices)
      
      trainFitnesses.push(trainFitness)
      validationFitnesses.push(validationFitness)
    }

    // Average across all folds
    const avgTrainFitness = trainFitnesses.reduce((a, b) => a + b, 0) / trainFitnesses.length
    const avgValidationFitness = validationFitnesses.reduce((a, b) => a + b, 0) / validationFitnesses.length

    return createValidationResult(avgTrainFitness, avgValidationFitness, this.config)
  }

  /**
   * Get all splits
   */
  getSplits(): DataSplit[] {
    return this.splits
  }

  /**
   * Get configuration
   */
  getConfig(): OverfittingProtectionConfig {
    return this.config
  }
}

// ============================================================================
// EARLY STOPPING
// ============================================================================

export interface EarlyStoppingState {
  bestValidationFitness: number
  generationsWithoutImprovement: number
  shouldStop: boolean
  bestGeneration: number
}

/**
 * Create early stopping tracker
 */
export function createEarlyStoppingTracker(
  patience: number = 10,
  minimize: boolean = false
): {
  check: (validationFitness: number, generation: number) => EarlyStoppingState
  getState: () => EarlyStoppingState
  reset: () => void
} {
  let state: EarlyStoppingState = {
    bestValidationFitness: minimize ? Infinity : -Infinity,
    generationsWithoutImprovement: 0,
    shouldStop: false,
    bestGeneration: 0,
  }

  const check = (validationFitness: number, generation: number): EarlyStoppingState => {
    const improved = minimize
      ? validationFitness < state.bestValidationFitness
      : validationFitness > state.bestValidationFitness

    if (improved) {
      state = {
        bestValidationFitness: validationFitness,
        generationsWithoutImprovement: 0,
        shouldStop: false,
        bestGeneration: generation,
      }
    } else {
      state.generationsWithoutImprovement++
      state.shouldStop = state.generationsWithoutImprovement >= patience
    }

    return { ...state }
  }

  const getState = (): EarlyStoppingState => ({ ...state })

  const reset = (): void => {
    state = {
      bestValidationFitness: minimize ? Infinity : -Infinity,
      generationsWithoutImprovement: 0,
      shouldStop: false,
      bestGeneration: 0,
    }
  }

  return { check, getState, reset }
}

// ============================================================================
// FITNESS CACHE FOR OVERFITTING PROTECTION
// ============================================================================

interface CachedEvaluation {
  trainFitness: number
  validationFitness: number
  penalizedFitness: number
  timestamp: number
}

/**
 * Cache for fitness evaluations to avoid redundant computation
 */
export class FitnessCache {
  private cache: Map<string, CachedEvaluation> = new Map()
  private maxSize: number
  private ttl: number // Time to live in milliseconds

  constructor(maxSize: number = 1000, ttl: number = 300000) { // 5 minutes default
    this.maxSize = maxSize
    this.ttl = ttl
  }

  /**
   * Get cached evaluation
   */
  get(chromosome: Chromosome): CachedEvaluation | null {
    const key = this.hashChromosome(chromosome)
    const cached = this.cache.get(key)
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached
    }
    
    return null
  }

  /**
   * Set cached evaluation
   */
  set(chromosome: Chromosome, evaluation: Omit<CachedEvaluation, 'timestamp'>): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
    
    const key = this.hashChromosome(chromosome)
    this.cache.set(key, { ...evaluation, timestamp: Date.now() })
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Hash chromosome to string key
   */
  private hashChromosome(chromosome: Chromosome): string {
    return chromosome
      .map(g => `${g.name}:${g.value.toFixed(6)}`)
      .join('|')
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  createTrainTestSplit,
  createKFoldSplits,
  createWalkForwardSplits,
  createTimeSeriesSplits,
  calculateOverfittingScore,
  calculatePenalizedFitness,
  createValidationResult,
  createProtectedFitnessFunction,
}
