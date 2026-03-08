/**
 * Profitmaker Integration Module
 * 
 * Architectural patterns and components inspired by Profitmaker (https://github.com/suenot/profitmaker)
 * 
 * This module provides:
 * - Unified Exchange Manager with caching and failover
 * - Optimized Order Book Management
 * - Trade Execution Engine with retry logic
 * - Fee Calculator with VIP tiers
 * - Bot Visual Builder
 * - Smart Metrics Engine
 * - AI-Enhanced Backtesting
 */

// ==================== Exchange Management ====================

export {
  ExchangeInstanceManager,
  ExchangeConnectionPool,
  ExchangeConnection,
  RateLimiter,
  exchangeManager,
  connectionPool,
  type ExchangeCredentials,
  type ExchangeConfig,
  type ExchangeInstance,
  type ExchangeHealth,
  type RateLimitConfig,
  type RetryOptions,
} from './exchange/instance-manager';

// ==================== Order Book ====================

export {
  OrderBook,
  OrderBookManager,
  orderBookManager,
  type PriceLevel,
  type OrderBookSnapshot,
  type OrderBookDelta,
  type OrderBookConfig,
  type OrderBookStats,
} from './orderbook/orderbook-manager';

// ==================== Trade Execution ====================

export {
  TradeExecutionEngine,
  OrderStatusTracker,
  PositionManager,
  SmartOrderRouter,
  tradeExecutionEngine,
  smartOrderRouter,
  type OrderRequest,
  type OrderResult,
  type OrderStatus,
  type Position,
  type ExecutionConfig,
  type ExecutionStats,
} from './execution/trade-execution';

// ==================== Fee Calculation ====================

export {
  FeeCalculator,
  FeeOptimizer,
  feeCalculator,
  feeOptimizer,
  EXCHANGE_FEE_STRUCTURES,
  type FeeStructure,
  type FeeTier,
  type VIPTier,
  type TradingFee,
  type FeeCalculationParams,
  type FundingCalculationParams,
} from './fees/fee-calculator';

// ==================== Bot Builder ====================

export {
  BotBuilder,
  BotCompiler,
  NodeRegistry,
  botBuilder,
  type BotNode,
  type BotNodeType,
  type NodeCategory,
  type PortDefinition,
  type BotConnection,
  type BotDefinition,
  type BotVariable,
  type CompiledBot,
  type NodeRegistration,
  type ConfigFieldSchema,
} from './builder/bot-builder';

// ==================== Smart Metrics ====================

export {
  SmartMetricsEngine,
  smartMetricsEngine,
  type TradingMetrics,
  type MonthlyReturn,
  type TradeRecord,
  type EquityPoint,
  type MetricsConfig,
} from './metrics/smart-metrics';

// ==================== AI Backtesting ====================

export {
  AIStrategyOptimizer,
  AIMarketAnalyzer,
  aiStrategyOptimizer,
  aiMarketAnalyzer,
  type AIBacktestConfig,
  type StrategyParameter,
  type OptimizationResult,
  type OptimizationIteration,
  type AIAnalysis,
  type MarketConditionAnalysis,
  type BacktestResult,
  type TradeResult,
} from './backtesting/ai-backtesting';
