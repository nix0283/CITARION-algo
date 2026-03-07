/**
 * CITARION Genetic Algorithm Framework
 * 
 * Evolutionary optimization for trading bot parameters.
 * 
 * Features:
 * - NSGA-II multi-objective optimization (CIT-026)
 * - Overfitting protection with validation (CIT-027)
 * - Parallel fitness evaluation (CIT-028)
 * - Immigration mechanism for diversity (CIT-029)
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type {
  Gene,
  Chromosome,
  Individual,
  Population,
  SelectionMethod,
  CrossoverMethod,
  MutationMethod,
  GeneticOperatorConfig,
  FitnessContext,
  FitnessFunction,
  MultiObjectiveFitnessFunction,
  GAConfig,
  GAResult,
  BotParameterDef,
  BotOptimizationConfig,
  TerminationCriteria,
  ParetoFront,
} from './types'

// ============================================================================
// ENHANCED TYPES (CIT-027, CIT-028, CIT-029)
// ============================================================================

export type {
  ImmigrationStrategy,
  ImmigrationConfig,
  OverfittingProtectionConfig,
  CrossValidationType,
  ValidationResult,
  ParallelMode,
  ParallelEvaluationConfig,
  FitnessWorkerTask,
  FitnessWorkerResult,
  EnhancedGAConfig,
} from './types'

// ============================================================================
// CONSTANTS
// ============================================================================

export {
  DEFAULT_GA_CONFIG,
  DEFAULT_IMMIGRATION_CONFIG,
  DEFAULT_OVERFITTING_CONFIG,
  DEFAULT_PARALLEL_CONFIG,
  DEFAULT_ENHANCED_GA_CONFIG,
} from './types'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export {
  generateId,
  clamp,
  randomInRange,
  randomInt,
  gaussianRandom,
  paramsToChromosome,
} from './types'

// ============================================================================
// CORE ENGINE
// ============================================================================

export { GeneticEngine, chromosomeToParams, calculateDiversity } from './engine'

// ============================================================================
// NSGA-II MULTI-OBJECTIVE OPTIMIZATION (CIT-026)
// ============================================================================

export {
  NSGA2Engine,
  NSGA2Config,
  NSGA2Result,
  ObjectiveFunction,
  createNSGA2Optimizer,
  selectBestFromPareto,
  nonDominatedSort,
  calculateCrowdingDistance,
  calculateHypervolume,
  dominates,
} from './nsga2'

// ============================================================================
// OVERFITTING PROTECTION (CIT-027)
// ============================================================================

export {
  CrossValidationEvaluator,
  FitnessCache,
  createTrainTestSplit,
  createKFoldSplits,
  createWalkForwardSplits,
  createTimeSeriesSplits,
  calculateOverfittingScore,
  calculatePenalizedFitness,
  createValidationResult,
  createProtectedFitnessFunction,
  createEarlyStoppingTracker,
  type DataSplit,
  type EarlyStoppingState,
} from './overfitting-protection'

// ============================================================================
// PARALLEL FITNESS EVALUATION (CIT-028)
// ============================================================================

export {
  BatchEvaluator,
  ParallelFitnessManager,
  AdaptiveParallelEvaluator,
  FitnessTaskScheduler,
  type BatchResult,
} from './parallel-evaluator'

// ============================================================================
// IMMIGRATION MECHANISM (CIT-029)
// ============================================================================

export {
  ImmigrationManager,
  AdaptiveImmigrationManager,
  createRandomImmigrant,
  createDiverseImmigrant,
  createHybridImmigrant,
  createImmigrant,
  calculateDiversityMetrics,
  removeDuplicates,
  applyNicheSharing,
  calculateChromosomeDistance,
  findCrowdedRegions,
  type DiversityMetrics,
} from './immigration'

// ============================================================================
// ENHANCED GA ENGINE (INTEGRATION)
// ============================================================================

export { EnhancedGeneticEngine } from './enhanced-engine'
