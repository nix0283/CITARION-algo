/**
 * Argus Bot Module Exports
 * 
 * Production-ready Pump/Dump detection system with:
 * - Real-time WebSocket streams
 * - Advanced detection algorithms
 * - Whale tracking
 * - Real-time alerts
 */

// Core Engine
export { ArgusEngine, getArgusEngine, resetArgusEngine } from './engine';
export type { 
  ArgusEngineConfig, 
  ArgusEngineState,
  ArgusStatus,
} from './engine';

// WebSocket Streams
export { 
  ArgusWebSocketStream, 
  ArgusMultiExchangeStream 
} from './websocket-stream';
export type {
  TradeData,
  DepthData,
  VolumeSurgeEvent,
  StreamConfig,
  StreamStatus,
  ExchangeId,
} from './websocket-stream';

// Pump/Dump Detection
export { PumpDumpDetector } from './pump-dump-detector';
export type {
  DetectionSignal,
  DetectorConfig as PumpDumpDetectorConfig,
  SignalType,
  SignalStrength,
  PriceStats,
  LargeOrder,
} from './pump-dump-detector';

// Whale Tracking
export { WhaleTracker } from './whale-tracker';
export type {
  WhaleOrder,
  WhaleActivity,
  WhaleAlert,
  WhaleTrackerConfig,
  OrderWall,
  OrderbookSnapshot,
} from './whale-tracker';

// Circuit Breaker
export { CircuitBreaker } from './circuit-breaker';
export type {
  CircuitBreakerConfig,
  CircuitBreakerState,
  ProgressiveCooldown,
} from './circuit-breaker';

// Orderbook Analyzer (legacy compatibility)
export { 
  OrderbookAnalyzer,
  type OrderbookLevel,
  type OrderbookData,
  type OrderbookMetrics,
  type OrderbookSignal,
  type OrderbookAnalyzerConfig,
} from './orderbook-analyzer';
