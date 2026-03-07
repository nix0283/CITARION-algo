/**
 * ORION BOT - Trend-Following Hunter
 *
 * Named after the Greek mythological hunter, Orion pursues trends
 * across markets with disciplined risk management.
 *
 * Architecture Pair:
 * ┌─────────────────────────────────────────────┐
 * │                  ORION                       │
 * │         Trend-Following Hunter              │
 *   EMA + Supertrend | Hedging Mode           │
 *   Multi-Exchange | Paper Validation         │
 * └─────────────────────────────────────────────┘
 *          ↓ signals confirmation ↓
 * ┌─────────────────────────────────────────────┐
 * │                  ARGUS                       │
 * │         Market Watchman                     │
 *   Orderbook | Whale Tracking                │
 *   Circuit Breaker | Risk Sentinels          │
 * └─────────────────────────────────────────────┘
 *
 * @module orion-bot
 */

// Core Engine
export { OrionEngine, ORION_NAME, ORION_VERSION } from './engine';

// Types
export type {
  TrendDirection,
  MarketRegime,
  TrendSignal,
  OrionPosition,
  PositionSide,
  PositionStatus,
  TakeProfitLevel,
  TrailingStopConfig,
  PositionRisk,
  HedgeInfo,
  RiskConfig,
  RiskMetrics,
  StrategyConfig,
  BotMode,
  BotStatus,
  OrionBotConfig,
  ExchangeConfig,
  OrionBotState,
  DailyStats,
  LifetimeStats,
  BotError,
  Candle,
  MarketData,
  Ticker,
  OrionEventType,
  OrionEvent,
} from './types';

// Signal Engine
export {
  SignalEngine,
  defaultStrategyConfig,
  calculateEMA,
  calculateATR,
  calculateSupertrend,
  calculateRSI,
  calculateADX,
} from './signal-engine';

// Risk Manager
export {
  RiskManager,
  defaultRiskConfig,
  calculateKelly,
  calculatePositionRisk,
  type TradeHistory,
  type KellyResult,
} from './risk-manager';

// Hedging Engine
export {
  HedgingEngine,
  HedgingStateMachine,
  HedgeDecisionEngine,
  type HedgeState,
  type HedgePair,
  type HedgeDecision,
} from './hedging-engine';

// Exchange Adapter
export {
  ExchangeManager,
  PaperTradingAdapter,
  BaseExchangeAdapter,
  type ExchangeAdapter,
  type ExchangeOrder,
  type ExchangeBalance,
  type ExchangePosition,
  type ExchangeCredentials,
} from './exchange-adapter';

// Validation Pipeline
export {
  ValidationPipeline,
  ValidationManager,
  defaultValidationCriteria,
  type ValidationStatus,
  type ValidationCriteria,
  type ValidationResult,
  type ValidationReport,
} from './validation-pipeline';
