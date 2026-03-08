/**
 * Advanced Indicators Module
 *
 * This module exports sophisticated technical indicators for professional trading analysis.
 * These indicators provide advanced features like kernel-based trend estimation,
 * momentum analysis, and signal generation.
 *
 * Available Indicators:
 * - WaveTrend: Momentum oscillator with overbought/oversold detection and divergence analysis
 * - KernelRegression: Nadaraya-Watson estimator with channel bands for trend following
 * - SqueezeMomentum: Volatility and momentum indicator for detecting breakouts
 * - NeuralProbabilityChannel: ML-based probability channel indicator
 * - MLAdaptiveSuperTrend: Adaptive SuperTrend using machine learning
 */

// WaveTrend Oscillator
export {
  WaveTrend,
  calculateWaveTrend,
  getWaveTrendEntrySignal,
  detectDivergence,
  calculateWaveTrendIndicator,
  type WaveTrendConfig,
  type WaveTrendResult,
  type Candle as WaveTrendCandle,
} from './wave-trend';

// Kernel Regression
export {
  KernelRegression,
  calculateKernelRegression,
  getChannelSignal,
  calculateKernelRegressionIndicator,
  analyzeKernelTrendStrength,
  type KernelRegressionConfig,
  type KernelRegressionResult,
  type Candle as KernelRegressionCandle,
} from './kernel-regression';

// Squeeze Momentum
export {
  SqueezeMomentum,
  calculateSqueezeMomentum,
  getSqueezeBreakoutSignal,
  analyzeSqueezeState,
  calculateSqueezeMomentumIndicator,
  type SqueezeMomentumConfig,
  type SqueezeMomentumResult,
  type Candle as SqueezeMomentumCandle,
} from './squeeze-momentum';

// Neural Probability Channel
export {
  NeuralProbabilityChannel,
  createNeuralProbabilityChannel,
  calculateNPC,
  calculateNPCLatest,
  type NeuralProbabilityChannelConfig,
  type NPCResult,
  type NPCResultExtended,
  type NPCPoint,
} from './neural-probability-channel';

// ML Adaptive SuperTrend
export {
  MLAdaptiveSuperTrend,
  createMLAdaptiveSuperTrend,
  calculateMLAdaptiveSuperTrend,
  getMLSuperTrendSignals,
  type MLAdaptiveSuperTrendConfig,
  type MLAdaptiveSuperTrendResult,
} from './ml-adaptive-supertrend';
