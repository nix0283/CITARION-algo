/**
 * Trend Bot Module Exports
 * Production-ready trend-following trading bot
 */

// Core types
export * from './types';

// Strategy (EMA + SuperTrend)
export {
  DEFAULT_STRATEGY_CONFIG,
  calculateEMA,
  calculateATR,
  calculateSuperTrend,
  calculateStrategyState,
  determineTrendState,
  calculateSignalStrength,
  generateSignal,
  checkExitSignal,
  updateTrailingStop,
  type SuperTrendResult,
  type StrategyState
} from './strategy';

// Risk Management
export {
  DEFAULT_RISK_CONFIG,
  RiskManager,
  DrawdownTracker,
  calculateKellyFraction,
  kellyPositionSize,
  calculateRiskBasedSize,
  calculateOptimalPositionSize,
  calculateCorrelation,
  calculateReturnCorrelation,
  checkCorrelationRisk,
  type PositionSizeResult,
  type RiskCheckResult,
  type DrawdownState
} from './risk-manager';

// Paper Trading Engine
export {
  DEFAULT_PAPER_CONFIG,
  PaperTradingEngine,
  type PaperTradingConfig,
  type SimulatedCandle
} from './paper-engine';

// Main Bot Controller
export {
  TrendBot,
  createTrendBot,
  type BotStatus,
  type SymbolState
} from './index';
