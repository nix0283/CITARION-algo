/**
 * ML Types - Training Data Validation
 * 
 * Types for training data validation, label leakage detection,
 * and proper time-based data splitting for ML models.
 */

// =============================================================================
// TRAINING SAMPLE TYPES
// =============================================================================

/**
 * Training sample with temporal metadata
 */
export interface TrainingSample {
  /** Feature values */
  features: Record<string, number>
  /** Label for the sample */
  label: 'LONG' | 'SHORT' | 'NEUTRAL'
  /** Sample weight */
  weight: number
  /** Timestamp when features were available */
  featureTimestamp: number
  /** Timestamp when label was determined (must be >= featureTimestamp) */
  labelTimestamp: number
  /** Original timestamp (for backward compatibility) */
  timestamp: number
  /** Index in the original data */
  index?: number
  /** Whether this sample has been validated for leakage */
  validated?: boolean
}

/**
 * Label configuration for training
 */
export interface LabelConfig {
  /** Type of label */
  type: 'classification' | 'regression'
  /** For classification: thresholds for LONG/SHORT/NEUTRAL */
  thresholds?: {
    longThreshold: number
    shortThreshold: number
  }
  /** Lookahead period for label calculation (in bars) */
  lookaheadBars: number
  /** Whether to use future returns for label */
  usesFutureReturns: boolean
  /** Description of how labels are calculated */
  description: string
}

// =============================================================================
// LABEL LEAKAGE DETECTION
// =============================================================================

/**
 * Result of label leakage check
 */
export interface LabelLeakageResult {
  /** Whether label leakage was detected */
  hasLeakage: boolean
  /** Severity of leakage */
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
  /** List of detected leakage issues */
  issues: LabelLeakageIssue[]
  /** Features that may cause leakage */
  suspiciousFeatures: string[]
  /** Samples affected by leakage */
  affectedSamples: number[]
  /** Recommendation for fixing */
  recommendations: string[]
}

/**
 * Description of a label leakage issue
 */
export interface LabelLeakageIssue {
  type: 'future_data_in_features' | 'label_from_future' | 'improper_time_split' | 'feature_label_correlation'
  description: string
  featureName?: string
  sampleIndices?: number[]
  severity: 'info' | 'warning' | 'error' | 'critical'
  suggestion?: string
}

// =============================================================================
// TIME-BASED SPLITTING
// =============================================================================

/**
 * Configuration for time-based train/test splitting
 */
export interface TimeSplitConfig {
  /** Type of split */
  type: 'simple' | 'walk_forward' | 'anchored' | 'expanding' | 'rolling'
  /** Ratio of data to use for training (0-1) */
  trainRatio: number
  /** Embargo period between train and test (in bars) */
  embargoBars: number
  /** Purge period at the start of test set (in bars) */
  purgeBars: number
  /** For walk-forward: number of folds */
  nFolds?: number
  /** For rolling: size of each window (in bars) */
  windowSize?: number
  /** For rolling: step size between windows (in bars) */
  stepSize?: number
  /** Whether to shuffle within time windows (generally false for time series) */
  shuffleWithinWindow: boolean
}

/**
 * A single time-based split
 */
export interface TimeSplit {
  /** Index of this split (for cross-validation) */
  splitIndex: number
  /** Indices of training samples */
  trainIndices: number[]
  /** Indices of test samples */
  testIndices: number[]
  /** Timestamps for train period */
  trainPeriod: {
    start: number
    end: number
  }
  /** Timestamps for test period */
  testPeriod: {
    start: number
    end: number
  }
  /** Embargo period between train and test */
  embargoPeriod: {
    start: number
    end: number
  }
}

/**
 * Result of time-based splitting
 */
export interface TimeSplitResult {
  /** Configuration used */
  config: TimeSplitConfig
  /** All splits */
  splits: TimeSplit[]
  /** Whether the split is valid */
  valid: boolean
  /** Any issues with the split */
  issues: string[]
  /** Statistics about the split */
  statistics: {
    totalSamples: number
    avgTrainSize: number
    avgTestSize: number
    minGapBetweenTrainTest: number
    maxGapBetweenTrainTest: number
  }
}

// =============================================================================
// PURGED CROSS-VALIDATION
// =============================================================================

/**
 * Configuration for purged cross-validation
 */
export interface PurgedCrossValidationConfig {
  /** Number of folds */
  nFolds: number
  /** Number of bars to purge before and after test set */
  purgeBars: number
  /** Number of bars for embargo period after test set */
  embargoBars: number
  /** Minimum size of training set (in bars) */
  minTrainSize?: number
  /** Whether to use overlapping test sets */
  overlapTestSets: boolean
}

/**
 * A single purged CV fold
 */
export interface PurgedCVFold {
  foldIndex: number
  trainIndices: number[]
  testIndices: number[]
  purgedIndices: number[]
  embargoIndices: number[]
  trainPeriod: { start: number; end: number }
  testPeriod: { start: number; end: number }
  purgePeriod: { beforeTest: { start: number; end: number }; afterTest?: { start: number; end: number } }
  embargoPeriod?: { start: number; end: number }
}

/**
 * Result of purged cross-validation generation
 */
export interface PurgedCVResult {
  config: PurgedCrossValidationConfig
  folds: PurgedCVFold[]
  valid: boolean
  issues: string[]
  statistics: {
    totalSamples: number
    avgTrainSize: number
    avgTestSize: number
    avgPurgedSize: number
    avgEmbargoSize: number
  }
}

// =============================================================================
// VALIDATION RESULT
// =============================================================================

/**
 * Complete validation result for training data
 */
export interface TrainingDataValidationResult {
  /** Whether the data is valid for training */
  valid: boolean
  /** Overall score (0-1, higher is better) */
  score: number
  /** Label leakage check result */
  labelLeakage: LabelLeakageResult
  /** Time order validation */
  timeOrder: {
    valid: boolean
    issues: string[]
    sortedFrom: number
    sortedTo: number
  }
  /** Feature statistics */
  featureStats: {
    totalFeatures: number
    featuresWithMissingValues: string[]
    featuresWithConstantValues: string[]
    featuresWithHighCorrelation: string[]
  }
  /** Label distribution */
  labelDistribution: {
    long: number
    short: number
    neutral: number
    total: number
    imbalance: number
  }
  /** Recommendations */
  recommendations: string[]
  /** Timestamp of validation */
  validatedAt: number
}

// =============================================================================
// WALK-FORWARD OPTIMIZATION TYPES
// =============================================================================

/**
 * Configuration for walk-forward validation
 */
export interface WalkForwardConfig {
  /** Type of walk-forward */
  type: 'anchored' | 'expanding' | 'rolling'
  /** Initial training window size (in bars) */
  initialTrainWindow: number
  /** Test window size (in bars) */
  testWindow: number
  /** Step size between folds (in bars) */
  stepSize: number
  /** Embargo period between train and test (in bars) */
  embargoBars: number
  /** Purge period (in bars) */
  purgeBars: number
  /** Minimum training window size (for expanding) */
  minTrainWindow?: number
  /** Maximum training window size (for expanding) */
  maxTrainWindow?: number
}

/**
 * A single walk-forward fold
 */
export interface WalkForwardFold {
  foldIndex: number
  trainIndices: number[]
  testIndices: number[]
  trainPeriod: { start: number; end: number }
  testPeriod: { start: number; end: number }
  trainSize: number
  testSize: number
  embargoPeriod?: { start: number; end: number }
}

/**
 * Result of walk-forward validation
 */
export interface WalkForwardResult {
  config: WalkForwardConfig
  folds: WalkForwardFold[]
  valid: boolean
  issues: string[]
  statistics: {
    totalFolds: number
    totalSamples: number
    avgTrainSize: number
    avgTestSize: number
    coverageRatio: number
  }
}

// =============================================================================
// EXPORT ALL TYPES
// =============================================================================

export type {
  TrainingSample,
  LabelConfig,
  LabelLeakageResult,
  LabelLeakageIssue,
  TimeSplitConfig,
  TimeSplit,
  TimeSplitResult,
  PurgedCrossValidationConfig,
  PurgedCVFold,
  PurgedCVResult,
  TrainingDataValidationResult,
  WalkForwardConfig,
  WalkForwardFold,
  WalkForwardResult,
}
