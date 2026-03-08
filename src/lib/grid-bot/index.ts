/**
 * Grid Bot Module - Production Ready (10/10)
 * 
 * Comprehensive grid trading implementation with:
 * - Core Grid Bot Engine
 * - Trailing Grid (levels move with price)
 * - Adaptive Grid (ATR-based volatility adaptation)
 * - Risk Management (drawdown, position limits, daily/weekly limits)
 * - Performance Tracking (Sharpe, Sortino, Calmar, Sterling ratios)
 * - Transactional Order Management
 * - Dynamic Level Management
 */

// ==================== CORE ENGINE ====================

export { GridBotEngine } from './grid-bot-engine';

// ==================== TRAILING GRID ====================

export {
  TrailingGridManager,
  DEFAULT_TRAILING_GRID_CONFIG,
} from './trailing-grid';

// ==================== ADAPTIVE GRID ====================

export {
  AdaptiveGridManager,
  DEFAULT_ADAPTIVE_CONFIG,
} from './adaptive-grid';

// ==================== RISK MANAGEMENT ====================

export {
  GridRiskManager,
  DEFAULT_RISK_CONFIG,
} from './risk-manager';

// ==================== PROFIT TRACKER ====================

export {
  GridProfitTracker,
} from './profit-tracker';

// ==================== TRANSACTIONAL ORDER MANAGER ====================

export {
  GridBotTransactionalManager,
} from './grid-bot-transactional';

// ==================== ADAPTERS ====================

export { GridBotPaperAdapter } from './paper-adapter';
export { GridBotExchangeAdapter } from './exchange-adapter';

// ==================== TYPES ====================

export type {
  // Core types
  GridBotConfig,
  GridLevel,
  GridOrder,
  GridBotState,
  GridBotStatus,
  GridBotEvent,
  GridBotEventType,
  GridTrade,
  GridSignal,
  GridBotMetrics,
  GridBotAdapter,
  GridOrderResult,
  OrderbookSnapshot,
  BalanceInfo,
  PositionInfo,
  PriceUpdate,
  OrderbookUpdate,
  GridOrderRequest,
  
  // Risk Management types
  RiskManagementConfig,
  RiskMetrics,
  RiskAlert,
  DailyRiskTracker,
  
  // Performance Metrics types
  PerformanceMetrics,
  PerformanceSnapshot,
  
  // Trailing Grid types
  TrailingGridConfig,
  TrailingGridState,
  TrailingEvent,
  
  // Adaptive Grid types
  AdaptiveGridConfig,
  AdaptiveGridState,
  VolatilityRecord,
  
  // Grid Level Management types
  GridLevelConfig,
  GridLevelAdjustment,
  DynamicLevelConfig,
  
  // Profit Tracker types
  GridLevelProfit,
  GridProfitStats,
} from './types';

// ==================== GRID TYPE ENUM ====================

export { GridType } from './types';

// ==================== DISTRIBUTED LOCKS ====================

export {
  acquireBotLock,
  releaseBotLock,
  withBotLock,
  isBotLocked,
  type LockResult,
  type BotType,
} from '@/lib/locks';
