/**
 * Machine Learning Module
 * 
 * Contains the Lawrence Classifier and related ML utilities for
 * market direction prediction using Lorentzian space analysis.
 * 
 * Components:
 * - Lawrence Classifier: k-NN in Lorentzian space
 * - Probability Calibrator: Platt Scaling, Isotonic Regression, etc.
 * - Feature Extender: Dynamic feature space extension
 * - Kernel Regression: Nadaraya-Watson smoothing
 */

// Lawrence Classifier
export {
  // Core functions
  normalizeDeriv,
  normalize,
  rescale,
  tanh,
  dualPoleFilter,
  tanhTransform,
  
  // Normalized indicators
  n_rsi,
  n_cci,
  n_wt,
  n_adx,
  
  // Filters
  regime_filter,
  filter_adx,
  filter_volatility,
  
  // Distance functions
  lorentzianDistance,
  findNearestNeighbors,
  
  // Classifier
  LawrenceClassifier,
  getLawrenceClassifier,
  resetLawrenceClassifier,
  
  // Types
  type LawrenceFeatures,
  type LawrenceResult,
  type TrainingSample,
  type ClassifierStats,
  type FilterSettings,
  type MLExtensionsConfig
} from './lawrence-classifier';

// Probability Calibrator
export {
  // Calibrator classes
  PlattScaling,
  IsotonicRegression,
  BetaCalibration,
  TemperatureScaling,
  EnsembleCalibrator,
  ProbabilityCalibrator,
  
  // Singleton functions
  getProbabilityCalibrator,
  resetProbabilityCalibrator,
  
  // Types
  type CalibrationSample,
  type CalibratedResult,
  type PlattParameters,
  type IsotonicPoint,
  type BetaParameters,
  type CalibrationMetrics,
  type CalibratorConfig
} from './probability-calibrator';

// Feature Extender
export {
  // Main class
  FeatureExtender,
  
  // Built-in features
  BUILTIN_FEATURES,
  
  // Singleton functions
  getFeatureExtender,
  resetFeatureExtender,
  
  // Types
  type FeatureDefinition,
  type FeatureValue,
  type FeatureVector,
  type FeatureStats,
  type FeatureCorrelation,
  type FeatureExtenderConfig,
  type FeatureCalculator,
  type FeatureContext
} from './feature-extender';

// Kernel Regression
export {
  // Main classes
  KernelRegression,
  StreamingKernelRegression,
  MultiKernelEnsemble,
  
  // Kernel functions
  gaussianKernel,
  epanechnikovKernel,
  tricubeKernel,
  quarticKernel,
  triangularKernel,
  cosineKernel,
  uniformKernel,
  getKernelFunction,
  
  // Bandwidth selection
  silvermanBandwidth,
  scottBandwidth,
  iqrBandwidth,
  crossValidationBandwidth,
  
  // Singleton functions
  getKernelRegression,
  getStreamingKernelRegression,
  resetKernelRegression,
  
  // Types
  type KernelType,
  type KernelRegressionConfig,
  type KernelRegressionResult,
  type StreamingState,
  type KernelStats
} from './kernel-regression';

// Signal Adapter
export {
  // Enums
  SignalType,
  
  // Constants
  TRADING_SESSIONS,
  
  // Converter functions
  parseSignalType,
  signalToDirection,
  signalToAction,
  toSignalType,
  
  // Session functions
  isInSession,
  getActiveSessions,
  isSessionOverlap,
  
  // Classes
  SignalAdapter,
  
  // Factory functions
  createSignalFromClassifierResult,
  createExitSignal,
  getSignalAdapter,
  resetSignalAdapter,
  
  // Types
  type TradeDirection,
  type TradingSession,
  type SignalMetadata,
  type Signal,
  type SignalAdapterConfig,
  type PositionState,
} from './signal-adapter';

// ML Signal Pipeline
export {
  // Main class
  MLSignalPipeline,
  
  // Singleton functions
  getMLSignalPipeline,
  resetMLSignalPipeline,
  
  // Constants
  DEFAULT_ML_PIPELINE_CONFIG,
  
  // Types
  type SignalSource,
  type MarketContext,
  type EnhancedSignal,
  type MLPipelineConfig,
} from './ml-signal-pipeline';
