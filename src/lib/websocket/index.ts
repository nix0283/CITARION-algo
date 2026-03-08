/**
 * WebSocket Module Exports
 * 
 * Provides unified WebSocket infrastructure with state recovery capabilities.
 */

// Main manager exports
export {
  ExchangeWebSocketManager,
  exchangeWsManager,
  type WSConfig,
  type PriceUpdate,
  type OrderbookUpdate,
  type TradeUpdate,
  type KlineUpdate,
  type OrderUpdate,
  type PositionUpdate,
  type WSConnectionState,
} from './exchange-websocket-manager';

// State recovery exports
export {
  WSStateRecovery,
  OrderbookRecovery,
  LocalOrderbook,
  wsStateRecovery,
  orderbookRecovery,
  DEFAULT_RECOVERY_CONFIG,
  createBinanceSnapshotFetcher,
  createBybitSnapshotFetcher,
  createOKXSnapshotFetcher,
  createBitgetSnapshotFetcher,
  createBingXSnapshotFetcher,
  type WSRecoveryConfig,
  type ReconnectionResult,
  type WSMessage,
  type DeltaMessage,
  type OrderbookSnapshot,
  type WSState,
  type ValidationResult,
  type BufferStats,
  type SnapshotFetcher,
} from './state-recovery';
