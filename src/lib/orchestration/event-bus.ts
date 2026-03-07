/**
 * CITARION Event Bus Implementation
 * 
 * Unified event-driven communication layer for all trading bots.
 * Supports multiple backends: NATS JetStream, Redis, In-Memory.
 * 
 * Latency target: < 100μs for internal events
 */

import {
  PlatformEvent,
  EventHandler,
  SubscriptionOptions,
  PublishOptions,
  EventBusStats,
  ConnectionStatus,
  BotRegistration,
  BotCode,
  TopicPattern,
  EventResult,
  TOPICS,
} from './types'

// ============================================================================
// EVENT BUS BACKEND INTERFACE
// ============================================================================

/**
 * Backend adapter interface
 */
interface EventBusBackend {
  connect(): Promise<void>
  disconnect(): Promise<void>
  publish(subject: string, event: PlatformEvent, options?: PublishOptions): Promise<void>
  subscribe(subject: string, handler: EventHandler, options?: SubscriptionOptions): Promise<string>
  unsubscribe(subscriptionId: string): Promise<void>
  getStatus(): ConnectionStatus
  getStats(): EventBusStats
}

// ============================================================================
// IN-MEMORY BACKEND (Development/Testing)
// ============================================================================

/**
 * In-memory backend for development and testing
 */
class InMemoryBackend implements EventBusBackend {
  private status: ConnectionStatus = 'disconnected'
  private subscriptions: Map<string, { subject: string; handler: EventHandler; options?: SubscriptionOptions }> = new Map()
  private stats: EventBusStats = {
    status: 'disconnected',
    uptime: 0,
    messagesPublished: 0,
    messagesReceived: 0,
    messagesFailed: 0,
    avgLatency: 0,
    activeSubscriptions: 0,
    registeredBots: 0,
  }
  private startTime: number = 0
  private latencies: number[] = []

  async connect(): Promise<void> {
    this.status = 'connected'
    this.startTime = Date.now()
    this.stats.status = 'connected'
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected'
    this.stats.status = 'disconnected'
    this.subscriptions.clear()
  }

  async publish(subject: string, event: PlatformEvent, _options?: PublishOptions): Promise<void> {
    const startTime = performance.now()
    
    // Find matching subscriptions (support wildcards)
    const matchingSubs = Array.from(this.subscriptions.entries()).filter(([_, sub]) => {
      return this.matchesSubject(sub.subject, subject)
    })

    // Deliver to all matching subscribers
    for (const [id, sub] of matchingSubs) {
      try {
        await sub.handler(event)
        this.stats.messagesReceived++
      } catch (error) {
        this.stats.messagesFailed++
        console.error(`[EventBus] Handler error for subscription ${id}:`, error)
      }
    }

    const latency = performance.now() - startTime
    this.recordLatency(latency)
    this.stats.messagesPublished++
  }

  async subscribe(subject: string, handler: EventHandler, options?: SubscriptionOptions): Promise<string> {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.subscriptions.set(id, { subject, handler, options })
    this.stats.activeSubscriptions = this.subscriptions.size
    return id
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    this.subscriptions.delete(subscriptionId)
    this.stats.activeSubscriptions = this.subscriptions.size
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  getStats(): EventBusStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime,
    }
  }

  private matchesSubject(pattern: string, subject: string): boolean {
    // Convert NATS-style wildcards to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^.]+')
      .replace(/>/g, '.*')
    return new RegExp(`^${regexPattern}$`).test(subject)
  }

  private recordLatency(latency: number): void {
    this.latencies.push(latency)
    if (this.latencies.length > 100) {
      this.latencies.shift()
    }
    this.stats.avgLatency = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
  }
}

// ============================================================================
// EVENT BUS IMPLEMENTATION
// ============================================================================

/**
 * Event Bus configuration
 */
export interface EventBusConfig {
  backend: 'nats' | 'redis' | 'memory'
  natsUrl?: string
  redisUrl?: string
  appName?: string
  debug?: boolean
}

/**
 * Main Event Bus class
 */
export class EventBus {
  private backend: EventBusBackend
  private config: EventBusConfig
  private botRegistry: Map<BotCode, BotRegistration> = new Map()
  private debug: boolean

  constructor(config: EventBusConfig) {
    this.config = config
    this.debug = config.debug ?? false
    
    // Select backend
    switch (config.backend) {
      case 'nats':
        // Will use NATS JetStream when available
        // For now, fall through to memory
        console.warn('[EventBus] NATS backend not yet implemented, using in-memory')
        this.backend = new InMemoryBackend()
        break
      case 'redis':
        // Will use Redis pub/sub when available
        console.warn('[EventBus] Redis backend not yet implemented, using in-memory')
        this.backend = new InMemoryBackend()
        break
      case 'memory':
      default:
        this.backend = new InMemoryBackend()
        break
    }
  }

  // ==========================================================================
  // CONNECTION MANAGEMENT
  // ==========================================================================

  /**
   * Connect to the event bus
   */
  async connect(): Promise<void> {
    await this.backend.connect()
    if (this.debug) {
      console.log(`[EventBus] Connected (${this.config.backend} backend)`)
    }
  }

  /**
   * Disconnect from the event bus
   */
  async disconnect(): Promise<void> {
    await this.backend.disconnect()
    if (this.debug) {
      console.log('[EventBus] Disconnected')
    }
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return this.backend.getStatus()
  }

  /**
   * Get event bus statistics
   */
  getStats(): EventBusStats {
    const stats = this.backend.getStats()
    stats.registeredBots = this.botRegistry.size
    return stats
  }

  // ==========================================================================
  // PUBLISHING
  // ==========================================================================

  /**
   * Publish an event to the bus
   */
  async publish<T extends PlatformEvent>(
    topic: string,
    event: T,
    options?: PublishOptions
  ): Promise<EventResult> {
    const startTime = performance.now()
    const eventId = event.id

    try {
      await this.backend.publish(topic, event, options)
      
      if (this.debug) {
        console.log(`[EventBus] Published: ${topic} (id: ${eventId})`)
      }

      return {
        eventId,
        processed: true,
        latency: performance.now() - startTime,
      }
    } catch (error) {
      return {
        eventId,
        processed: false,
        latency: performance.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Publish trading event
   */
  async publishTradingEvent(event: PlatformEvent & { category: 'trading' }): Promise<EventResult> {
    const topic = `trading.order.${event.type.split('.')[1]}`
    return this.publish(topic, event)
  }

  /**
   * Publish market event
   */
  async publishMarketEvent(symbol: string, event: PlatformEvent & { category: 'market' }): Promise<EventResult> {
    const topic = `market.${event.type.split('.')[0]}.${symbol}`
    return this.publish(topic, event)
  }

  /**
   * Publish risk event
   */
  async publishRiskEvent(event: PlatformEvent & { category: 'risk' }): Promise<EventResult> {
    const topic = `risk.${event.type.split('.')[0]}`
    return this.publish(topic, event)
  }

  /**
   * Publish analytics event (signal)
   */
  async publishSignal(botCode: BotCode, event: PlatformEvent & { category: 'analytics' }): Promise<EventResult> {
    const topic = `analytics.signal.${botCode}`
    return this.publish(topic, event)
  }

  // ==========================================================================
  // SUBSCRIPTIONS
  // ==========================================================================

  /**
   * Subscribe to a topic pattern
   */
  async subscribe(
    topic: string | TopicPattern,
    handler: EventHandler,
    options?: SubscriptionOptions
  ): Promise<string> {
    const subscriptionId = await this.backend.subscribe(topic, handler, options)
    
    if (this.debug) {
      console.log(`[EventBus] Subscribed: ${topic} (id: ${subscriptionId})`)
    }

    return subscriptionId
  }

  /**
   * Unsubscribe from a topic
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    await this.backend.unsubscribe(subscriptionId)
    
    if (this.debug) {
      console.log(`[EventBus] Unsubscribed: ${subscriptionId}`)
    }
  }

  /**
   * Subscribe to all trading events
   */
  subscribeToTrading(handler: EventHandler): Promise<string> {
    return this.subscribe('trading.order.*', handler)
  }

  /**
   * Subscribe to market events for a specific symbol
   */
  subscribeToMarket(symbol: string, handler: EventHandler): Promise<string> {
    return this.subscribe(`market.*.${symbol}`, handler)
  }

  /**
   * Subscribe to all signals from a specific bot
   */
  subscribeToBotSignals(botCode: BotCode, handler: EventHandler): Promise<string> {
    return this.subscribe(`analytics.signal.${botCode}`, handler)
  }

  /**
   * Subscribe to all signals (for LOGOS meta-bot)
   */
  subscribeToAllSignals(handler: EventHandler): Promise<string> {
    return this.subscribe('analytics.signal.*', handler)
  }

  // ==========================================================================
  // BOT REGISTRY
  // ==========================================================================

  /**
   * Register a bot with the event bus
   */
  registerBot(registration: BotRegistration): void {
    this.botRegistry.set(registration.metadata.code, registration)
    
    if (this.debug) {
      console.log(`[EventBus] Bot registered: ${registration.metadata.code} (${registration.metadata.name})`)
    }

    // Publish system event
    this.publish('system.bot.registered', {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      category: 'system',
      source: 'EventBus',
      type: 'bot.started',
      data: {
        botId: registration.metadata.code,
        botCode: registration.metadata.code,
        status: 'running',
      },
    })
  }

  /**
   * Unregister a bot
   */
  unregisterBot(botCode: BotCode): void {
    const registration = this.botRegistry.get(botCode)
    if (registration) {
      this.botRegistry.delete(botCode)
      
      if (this.debug) {
        console.log(`[EventBus] Bot unregistered: ${botCode}`)
      }

      // Publish system event
      this.publish('system.bot.stopped', {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        category: 'system',
        source: 'EventBus',
        type: 'bot.stopped',
        data: {
          botId: botCode,
          botCode: botCode,
          status: 'stopped',
        },
      })
    }
  }

  /**
   * Get registered bots
   */
  getRegisteredBots(): BotRegistration[] {
    return Array.from(this.botRegistry.values())
  }

  /**
   * Get bot registration
   */
  getBotRegistration(botCode: BotCode): BotRegistration | undefined {
    return this.botRegistry.get(botCode)
  }

  /**
   * Update bot heartbeat
   */
  updateHeartbeat(botCode: BotCode): void {
    const registration = this.botRegistry.get(botCode)
    if (registration) {
      registration.lastHeartbeat = Date.now()
      registration.status = 'active'
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let eventBusInstance: EventBus | null = null

/**
 * Get or create the global event bus instance
 */
export function getEventBus(config?: EventBusConfig): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus(config ?? { backend: 'memory', debug: true })
  }
  return eventBusInstance
}

/**
 * Initialize the event bus
 */
export async function initializeEventBus(config?: EventBusConfig): Promise<EventBus> {
  const bus = getEventBus(config)
  await bus.connect()
  return bus
}

// Export topics for convenience
export { TOPICS }
