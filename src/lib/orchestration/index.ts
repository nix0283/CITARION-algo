/**
 * CITARION Orchestration Layer
 * 
 * Unified event-driven communication system for all trading bots.
 * 
 * Components:
 * - Event Bus: Central message broker for inter-bot communication
 * - Unified Exchange Adapter: Consistent API for all exchanges
 * - Bot Registry: Centralized bot management
 * 
 * Usage:
 * ```typescript
 * import { initializeEventBus, getEventBus, TOPICS } from '@/lib/orchestration'
 * 
 * // Initialize on app startup
 * await initializeEventBus({ backend: 'memory', debug: true })
 * 
 * // Subscribe to signals
 * const bus = getEventBus()
 * await bus.subscribeToAllSignals((event) => {
 *   console.log('Signal received:', event)
 * })
 * ```
 */

// Event Bus
export {
  EventBus,
  getEventBus,
  initializeEventBus,
  type EventBusConfig,
} from './event-bus'

// Types
export {
  // Event types
  type PlatformEvent,
  type TradingEvent,
  type MarketEvent,
  type RiskEvent,
  type ExecutionEvent,
  type AnalyticsEvent,
  type SystemEvent,
  type PortfolioEvent,
  type BaseEvent,
  type EventCategory,
  
  // Handler types
  type EventHandler,
  type SubscriptionOptions,
  type PublishOptions,
  
  // Bot types
  type BotCode,
  type BotCategory,
  type BotMetadata,
  type BotRegistration,
  
  // Topic types
  type TopicPattern,
  TOPICS,
  
  // Status types
  type ConnectionStatus,
  type EventBusStats,
  type Result,
  type EventResult,
} from './types'

// Unified Exchange Adapter
export {
  // Types
  type ExchangeId,
  type MarketType,
  type OrderSide,
  type OrderType,
  type OrderStatus,
  type TimeInForce,
  type PositionSide,
  
  // Interfaces
  type UnifiedOrderParams,
  type UnifiedOrder,
  type UnifiedPosition,
  type UnifiedBalance,
  type UnifiedTicker,
  type UnifiedCandle,
  type UnifiedOrderbook,
  type ExchangeCredentials,
  type IExchangeAdapter,
  
  // Classes
  BaseExchangeAdapter,
  UnifiedExchangeManager,
  getUnifiedExchangeManager,
} from './unified-exchange-adapter'
