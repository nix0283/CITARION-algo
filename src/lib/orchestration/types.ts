/**
 * CITARION Orchestration Layer - Event Types
 * 
 * Central type definitions for the event-driven architecture.
 * All bot communication flows through this unified system.
 */

// ============================================================================
// CORE EVENT TYPES
// ============================================================================

/**
 * Event categories for trading platform
 */
export type EventCategory = 
  | 'trading'    // Order events, executions
  | 'market'     // Price updates, orderbook changes
  | 'risk'       // Risk limit breaches, position alerts
  | 'execution'  // Order fill confirmations, rejections
  | 'analytics'  // Signal generation, metrics
  | 'system'     // Bot lifecycle, health checks
  | 'portfolio'  // Position aggregation, balance updates

/**
 * Base event interface
 */
export interface BaseEvent {
  id: string
  timestamp: number
  category: EventCategory
  source: string      // Bot code (MESH, HFT, etc.)
  correlationId?: string  // For tracking related events
  metadata?: Record<string, unknown>
}

/**
 * Trading events - order lifecycle
 */
export interface TradingEvent extends BaseEvent {
  category: 'trading'
  type: 
    | 'order.created'
    | 'order.submitted'
    | 'order.partially_filled'
    | 'order.filled'
    | 'order.cancelled'
    | 'order.rejected'
    | 'order.amended'
  data: {
    orderId?: string
    exchangeOrderId?: string
    symbol: string
    side: 'BUY' | 'SELL'
    orderType: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT'
    quantity: number
    price?: number
    filledQuantity?: number
    avgPrice?: number
    exchange: string
    reason?: string
  }
}

/**
 * Market events - price and orderbook updates
 */
export interface MarketEvent extends BaseEvent {
  category: 'market'
  type:
    | 'price.update'
    | 'orderbook.update'
    | 'funding.update'
    | 'ticker.update'
    | 'kline.update'
    | 'trade.update'
  data: {
    symbol: string
    exchange: string
    price?: number
    bid?: number
    ask?: number
    volume?: number
    fundingRate?: number
    timestamp: number
  }
}

/**
 * Risk events - position and risk management
 */
export interface RiskEvent extends BaseEvent {
  category: 'risk'
  type:
    | 'position.opened'
    | 'position.closed'
    | 'position.updated'
    | 'risk.limit.warning'
    | 'risk.limit.breach'
    | 'drawdown.warning'
    | 'drawdown.critical'
    | 'liquidation.warning'
  data: {
    symbol?: string
    positionId?: string
    exposure?: number
    leverage?: number
    pnl?: number
    drawdown?: number
    limitType?: 'daily_loss' | 'position_size' | 'leverage' | 'correlation'
    threshold?: number
    current?: number
  }
}

/**
 * Execution events - order confirmations
 */
export interface ExecutionEvent extends BaseEvent {
  category: 'execution'
  type:
    | 'execution.confirmed'
    | 'execution.failed'
    | 'execution.timeout'
    | 'execution.retry'
  data: {
    orderId: string
    exchange: string
    symbol: string
    status: 'success' | 'failed' | 'pending'
    latency?: number
    error?: string
    retryCount?: number
  }
}

/**
 * Analytics events - signals and metrics
 */
export interface AnalyticsEvent extends BaseEvent {
  category: 'analytics'
  type:
    | 'signal.generated'
    | 'signal.confirmed'
    | 'signal.rejected'
    | 'metrics.updated'
    | 'performance.report'
    | 'backtest.completed'
  data: {
    signalId?: string
    botId: string
    signalType?: 'entry' | 'exit' | 'modify'
    direction?: 'LONG' | 'SHORT' | 'NEUTRAL'
    confidence?: number
    metrics?: Record<string, number>
    timeframe?: string
  }
}

/**
 * System events - bot lifecycle
 */
export interface SystemEvent extends BaseEvent {
  category: 'system'
  type:
    | 'bot.started'
    | 'bot.stopped'
    | 'bot.error'
    | 'bot.healthy'
    | 'bot.unhealthy'
    | 'config.updated'
    | 'maintenance.start'
    | 'maintenance.end'
  data: {
    botId: string
    botCode: string
    status: 'running' | 'stopped' | 'error' | 'maintenance'
    uptime?: number
    error?: string
    healthScore?: number
  }
}

/**
 * Portfolio events - position aggregation
 */
export interface PortfolioEvent extends BaseEvent {
  category: 'portfolio'
  type:
    | 'balance.updated'
    | 'position.aggregated'
    | 'exposure.calculated'
    | 'rebalance.suggested'
  data: {
    exchange?: string
    asset?: string
    balance?: number
    available?: number
    locked?: number
    totalExposure?: number
    netExposure?: number
  }
}

/**
 * Union of all event types
 */
export type PlatformEvent = 
  | TradingEvent 
  | MarketEvent 
  | RiskEvent 
  | ExecutionEvent 
  | AnalyticsEvent 
  | SystemEvent 
  | PortfolioEvent

// ============================================================================
// EVENT BUS INTERFACE
// ============================================================================

/**
 * Event handler function type
 */
export type EventHandler<T extends PlatformEvent = PlatformEvent> = (
  event: T
) => Promise<void> | void

/**
 * Subscription options
 */
export interface SubscriptionOptions {
  queue?: string           // Queue group name for load balancing
  durable?: string         // Durable subscription name
  replay?: 'instant' | 'original'  // Message replay speed
  maxDeliver?: number      // Max redelivery attempts
  ackWait?: number         // Ack timeout in milliseconds
}

/**
 * Publish options
 */
export interface PublishOptions {
  priority?: 1 | 2 | 3 | 4 | 5  // 1 = highest, 5 = lowest
  ttl?: number                  // Time-to-live in milliseconds
  delay?: number                // Delay before delivery in milliseconds
  correlationId?: string        // For event chaining
  replyTo?: string              // Reply subject for request-reply
}

// ============================================================================
// BOT REGISTRY
// ============================================================================

/**
 * Bot classification codes
 */
export type BotCode = 
  // Operational Bots
  | 'MESH'  // Grid Bot - Market Maker Strategy
  | 'SCALE' // DCA Bot - Dollar Cost Averaging
  | 'BAND'  // Bollinger Band Bot - Mean Reversion
  // Institutional Bots
  | 'PND'   // Argus - Pump & Dump Detection
  | 'TRND'  // Orion - Trend Following
  | 'FCST'  // Vision - Price Forecasting
  | 'RNG'   // Range Bot - Range Trading
  | 'LMB'   // Lumibot - AI Assistant
  // Frequency Bots
  | 'HFT'   // Helios - High Frequency Trading
  | 'MFT'   // Selene - Medium Frequency Trading
  | 'LFT'   // Atlas - Low Frequency Trading
  // Meta Bots
  | 'LOGOS' // Meta Bot - Signal Aggregation

/**
 * Bot category for grouping
 */
export type BotCategory = 'operational' | 'institutional' | 'frequency' | 'meta'

/**
 * Bot metadata
 */
export interface BotMetadata {
  code: BotCode
  name: string
  fullName: string
  category: BotCategory
  description: string
  frequency: 'high' | 'medium' | 'low' | 'variable'
  latencyTarget: number  // Target latency in microseconds
  exchanges: string[]    // Supported exchanges
  features: string[]
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
}

/**
 * Bot registration info
 */
export interface BotRegistration {
  metadata: BotMetadata
  status: 'registered' | 'active' | 'paused' | 'error'
  registeredAt: number
  lastHeartbeat?: number
  subscriptions: string[]  // Subscribed topics
}

// ============================================================================
// TOPIC DEFINITIONS
// ============================================================================

/**
 * Standard topic patterns
 */
export const TOPICS = {
  // Trading topics
  TRADING_ORDER_CREATED: 'trading.order.created',
  TRADING_ORDER_SUBMITTED: 'trading.order.submitted',
  TRADING_ORDER_FILLED: 'trading.order.filled',
  TRADING_ORDER_CANCELLED: 'trading.order.cancelled',
  TRADING_ORDER_REJECTED: 'trading.order.rejected',
  
  // Market topics (wildcards supported)
  MARKET_PRICE: 'market.price.*',        // market.price.BTCUSDT
  MARKET_ORDERBOOK: 'market.orderbook.*',
  MARKET_FUNDING: 'market.funding.*',
  MARKET_TICKER: 'market.ticker.*',
  
  // Risk topics
  RISK_POSITION: 'risk.position.*',
  RISK_LIMIT: 'risk.limit.*',
  RISK_DRAWDOWN: 'risk.drawdown',
  
  // Execution topics
  EXECUTION_CONFIRM: 'execution.confirm',
  EXECUTION_FAIL: 'execution.fail',
  
  // Analytics topics
  ANALYTICS_SIGNAL: 'analytics.signal.*',  // analytics.signal.MESH
  ANALYTICS_METRICS: 'analytics.metrics',
  
  // System topics
  SYSTEM_BOT_LIFECYCLE: 'system.bot.*',
  SYSTEM_HEALTH: 'system.health',
  
  // Portfolio topics
  PORTFOLIO_BALANCE: 'portfolio.balance.*',
  PORTFOLIO_EXPOSURE: 'portfolio.exposure',
} as const

/**
 * Topic pattern type
 */
export type TopicPattern = typeof TOPICS[keyof typeof TOPICS]

// ============================================================================
// EVENT BUS STATUS
// ============================================================================

/**
 * Connection status
 */
export type ConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

/**
 * Event bus statistics
 */
export interface EventBusStats {
  status: ConnectionStatus
  uptime: number
  messagesPublished: number
  messagesReceived: number
  messagesFailed: number
  avgLatency: number
  activeSubscriptions: number
  registeredBots: number
  lastError?: string
  lastErrorTime?: number
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Operation result wrapper
 */
export interface Result<T, E = Error> {
  success: boolean
  data?: T
  error?: E
}

/**
 * Event processing result
 */
export interface EventResult {
  eventId: string
  processed: boolean
  latency: number
  error?: string
}
