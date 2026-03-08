/**
 * ML Pipeline Types
 * Type definitions for the ML Pipeline Infrastructure
 */

// Data Types
export interface OHLCV {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderbookLevel {
  price: number
  quantity: number
}

export interface Orderbook {
  timestamp: number
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
}

export interface FundingRate {
  timestamp: number
  rate: number
  nextFundingTime: number
}

export interface OpenInterest {
  timestamp: number
  value: number
}

export interface MarketData {
  symbol: string
  exchange: string
  ohlcv: OHLCV[]
  orderbook?: Orderbook
  fundingRate?: FundingRate
  openInterest?: OpenInterest
}

// Feature Types
export interface FeatureConfig {
  name: string
  type: 'technical' | 'microstructure' | 'time' | 'lag' | 'rolling'
  params: Record<string, number | string | boolean>
  enabled: boolean
}

export interface FeatureSet {
  timestamp: number
  features: Record<string, number>
  labels?: Record<string, number>
}

export interface FeatureImportance {
  feature: string
  importance: number
  rank: number
}

// Model Types
export type ModelType = 
  | 'regression'
  | 'classification'
  | 'timeseries'
  | 'ensemble'

export type ModelAlgorithm = 
  | 'linear'
  | 'tree'
  | 'forest'
  | 'gradient_boost'
  | 'neural_net'
  | 'ensemble'

export interface ModelConfig {
  id: string
  name: string
  type: ModelType
  algorithm: ModelAlgorithm
  features: string[]
  hyperparams: Record<string, number | string | boolean>
  targetVariable: string
  trainTestSplit: number
  crossValidationFolds: number
}

export interface TrainingResult {
  modelId: string
  metrics: ModelMetrics
  featureImportance: FeatureImportance[]
  trainingTime: number
  samplesUsed: number
  timestamp: number
}

export interface ModelMetrics {
  // Regression metrics
  mse?: number
  rmse?: number
  mae?: number
  r2?: number
  
  // Classification metrics
  accuracy?: number
  precision?: number
  recall?: number
  f1?: number
  auc?: number
  
  // Time series metrics
  mape?: number
  directionalAccuracy?: number
  
  // General
  sharpeRatio?: number
  maxDrawdown?: number
}

// Model Registry Types
export interface ModelVersion {
  id: string
  modelId: string
  version: string
  createdAt: number
  createdBy: string
  metrics: ModelMetrics
  status: 'active' | 'deprecated' | 'testing'
  config: ModelConfig
}

export interface ABTest {
  id: string
  name: string
  modelA: string
  modelB: string
  startDate: number
  endDate?: number
  trafficSplit: number // 0-1, portion to model A
  status: 'running' | 'completed' | 'paused'
  results?: ABTestResult
}

export interface ABTestResult {
  modelAMetrics: ModelMetrics
  modelBMetrics: ModelMetrics
  winner: 'A' | 'B' | 'none'
  confidence: number
}

// Data Collection Types
export interface DataCollectionConfig {
  symbols: string[]
  exchanges: string[]
  interval: string // '1m', '5m', '15m', '1h', '4h', '1d'
  historicalDays: number
  realtime: boolean
}

export interface DataCollectionResult {
  success: boolean
  symbol: string
  exchange: string
  recordsCollected: number
  timestamp: number
  error?: string
}

// AutoML Types
export interface AutoMLConfig {
  targetMetric: keyof ModelMetrics
  maxTrials: number
  maxTime: number // seconds
  earlyStoppingRounds: number
  featureSelection: boolean
  hyperparameterTuning: boolean
  ensembleMethods: boolean
}

export interface AutoMLTrial {
  id: number
  config: ModelConfig
  metrics: ModelMetrics
  status: 'running' | 'completed' | 'failed'
  duration: number
}

export interface AutoMLResult {
  bestModel: ModelConfig
  bestMetrics: ModelMetrics
  allTrials: AutoMLTrial[]
  totalDuration: number
  featureImportance: FeatureImportance[]
}

// Pipeline Types
export interface MLPipelineConfig {
  dataCollection: DataCollectionConfig
  features: FeatureConfig[]
  model: ModelConfig
  autoML?: AutoMLConfig
}

export interface MLPipelineResult {
  dataCollected: number
  featuresGenerated: number
  modelTrained: boolean
  trainingResult?: TrainingResult
  predictions?: PredictionResult[]
}

export interface PredictionResult {
  timestamp: number
  prediction: number
  confidence?: number
  features: Record<string, number>
}

// =============================================================================
// LOOK-AHEAD PROTECTION TYPES
// =============================================================================

/**
 * Configuration for safe feature calculation with look-ahead protection
 */
export interface FeatureCalculationConfig {
  /** Name of the feature */
  name: string
  /** Type of feature */
  type: 'technical' | 'microstructure' | 'time' | 'lag' | 'rolling' | 'custom'
  /** Maximum lookback period required for calculation (in bars) */
  maxLookback: number
  /** Whether this feature uses future data (should be false for production) */
  usesFutureData: boolean
  /** Parameters for the feature calculation */
  params: Record<string, number | string | boolean>
  /** Whether this feature is enabled */
  enabled: boolean
  /** Description of what data the feature uses */
  dataDescription?: string
  /** Validation status */
  validated?: boolean
}

/**
 * Result of look-ahead validation
 */
export interface LookAheadValidationResult {
  /** Whether the feature is safe to use */
  valid: boolean
  /** List of issues found */
  issues: LookAheadIssue[]
  /** Features that passed validation */
  safeFeatures: string[]
  /** Features that failed validation */
  unsafeFeatures: string[]
}

/**
 * Description of a look-ahead bias issue
 */
export interface LookAheadIssue {
  featureName: string
  issueType: 'uses_future_data' | 'lookback_exceeded' | 'future_timestamp' | 'label_leakage'
  description: string
  severity: 'critical' | 'warning' | 'info'
  suggestion?: string
}

/**
 * Time-based split configuration for training data
 */
export interface TimeBasedSplit {
  /** Training start timestamp */
  trainStart: number
  /** Training end timestamp */
  trainEnd: number
  /** Embargo period between train and test (in ms) */
  embargoPeriod: number
  /** Test start timestamp */
  testStart: number
  /** Test end timestamp */
  testEnd: number
  /** Whether this split is anchored (fixed start) or expanding */
  type: 'anchored' | 'expanding' | 'rolling'
}

/**
 * Configuration for purged cross-validation
 */
export interface PurgedCVConfig {
  /** Number of folds */
  nFolds: number
  /** Embargo period between train and test (in bars) */
  embargoBars: number
  /** Purge period at boundaries (in bars) */
  purgeBars: number
  /** Whether to use embargo after test set */
  embargoAfterTest: boolean
}

/**
 * Purged cross-validation fold
 */
export interface PurgedCVFold {
  foldIndex: number
  trainIndices: number[]
  testIndices: number[]
  trainStart: number
  trainEnd: number
  testStart: number
  testEnd: number
  embargoStart: number
  embargoEnd: number
}

/**
 * Available features at a specific point in time
 */
export interface AvailableFeaturesAtTime {
  timestamp: number
  barIndex: number
  /** Features that can be calculated at this point */
  availableFeatures: string[]
  /** Features that cannot be calculated (insufficient history) */
  unavailableFeatures: string[]
  /** Features with partial data (reduced accuracy) */
  partialFeatures: string[]
}

/**
 * Safe feature set with validation metadata
 */
export interface SafeFeatureSet extends FeatureSet {
  /** Bar index in the original data */
  barIndex: number
  /** Whether all features are valid at this point */
  isValid: boolean
  /** Features that passed validation */
  validFeatures: string[]
  /** Features that failed validation */
  invalidFeatures: string[]
  /** Validation timestamp */
  validatedAt: number
}

/**
 * Feature validation statistics
 */
export interface FeatureValidationStats {
  totalFeatures: number
  validFeatures: number
  invalidFeatures: number
  featuresWithLookAhead: number
  featuresWithInsufficientHistory: number
  validationTimestamp: number
  issues: LookAheadIssue[]
}
