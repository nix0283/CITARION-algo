/**
 * Grid Bot Module - Production Ready
 * 
 * CIT-008: Transactional order placement with rollback
 * CIT-009: Distributed locking for race conditions
 */

// Core Engine
export { GridBotEngine } from './grid-bot-engine';

// Transactional Order Manager (CIT-008)
export { 
  GridBotTransactionalManager,
  type GridOrderRequest,
  type PlacedOrder,
  type TransactionResult,
  type TransactionalConfig,
} from './grid-bot-transactional';

// Types
export type {
  GridBotConfig,
  GridBotState,
  GridBotStatus,
  GridBotEvent,
  GridBotEventType,
  GridLevel,
  GridOrder,
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
} from './types';

// Grid Types
export { GridType } from './types';

// Trailing Grid
export { TrailingGridManager } from './trailing-grid';

// Adaptive Grid
export { AdaptiveGridManager } from './adaptive-grid';

// Re-export distributed locks for convenience
export { 
  acquireBotLock, 
  releaseBotLock, 
  withBotLock,
  isBotLocked,
  type LockResult,
  type BotType,
} from '@/lib/locks';
