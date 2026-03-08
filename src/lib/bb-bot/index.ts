/**
 * BB Bot Module Exports
 * 
 * Complete Bollinger Bands Trading Bot (10/10)
 */

// Core Engine
export { BBBotEngine, createBBBot, DEFAULT_BB_BOT_CONFIG } from './engine';
export type {
  BBBotConfig,
  BBBotState,
  BBBotPosition,
  BBBotSignal,
  BBBotMetrics,
} from './engine';

// Multi-Timeframe Confirmation
export {
  MultiTimeframeConfirmation,
  DoubleBollingerBands,
  StochasticOscillator,
  RSICalculator,
  VolumeConfirmationFilter,
  DivergenceDetector,
  DEFAULT_CONFIG,
} from './mtf-confirmation';
export type {
  TimeframeSignal,
  MTFConfirmation,
  MTFConfig,
  DoubleBBSignal,
  StochasticSignal,
  VolumeConfig,
  DivergenceSignal,
} from './mtf-confirmation';
