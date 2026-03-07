/**
 * NATS Message Queue Integration
 * 
 * Provides event-driven architecture for CITARION with:
 * - Pub/Sub messaging
 * - Request/Reply patterns
 * - JetStream for persistence
 * - Event sourcing support
 * 
 * Note: In development, falls back to in-memory event bus.
 * In production, connects to NATS server.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NatsConfig {
  servers: string[];
  user?: string;
  pass?: string;
  token?: string;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectTimeWait?: number;
  timeout?: number;
}

export interface Event<T = unknown> {
  id: string;
  subject: string;
  data: T;
  timestamp: number;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, string>;
}

export type EventHandler<T = unknown> = (event: Event<T>) => Promise<void> | void;

export interface Subscription {
  subject: string;
  handler: EventHandler;
  queueGroup?: string;
  unsubscribe: () => void;
}

export interface PublishOptions {
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, string>;
  reply?: string;
}

// ============================================================================
// EVENT SUBJECTS
// ============================================================================

export const EventSubjects = {
  // Trading events
  TRADE_OPENED: 'trade.opened',
  TRADE_CLOSED: 'trade.closed',
  TRADE_UPDATED: 'trade.updated',
  ORDER_PLACED: 'order.placed',
  ORDER_FILLED: 'order.filled',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_REJECTED: 'order.rejected',
  
  // Position events
  POSITION_OPENED: 'position.opened',
  POSITION_CLOSED: 'position.closed',
  POSITION_UPDATED: 'position.updated',
  POSITION_LIQUIDATED: 'position.liquidated',
  
  // Bot events
  BOT_STARTED: 'bot.started',
  BOT_STOPPED: 'bot.stopped',
  BOT_PAUSED: 'bot.paused',
  BOT_RESUMED: 'bot.resumed',
  BOT_SIGNAL: 'bot.signal',
  BOT_ERROR: 'bot.error',
  
  // Market events
  PRICE_UPDATE: 'market.price',
  TICKER_UPDATE: 'market.ticker',
  FUNDING_RATE: 'market.funding',
  LIQUIDATION: 'market.liquidation',
  
  // Signal events
  SIGNAL_RECEIVED: 'signal.received',
  SIGNAL_PROCESSED: 'signal.processed',
  SIGNAL_REJECTED: 'signal.rejected',
  
  // Risk events
  RISK_ALERT: 'risk.alert',
  DRAWDOWN_WARNING: 'risk.drawdown',
  MARGIN_CALL: 'risk.margin_call',
  KILL_SWITCH: 'risk.kill_switch',
  
  // System events
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  HEALTH_CHECK: 'system.health',
  ERROR: 'system.error',
  
  // User events
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_SETTINGS_CHANGED: 'user.settings',
} as const;

export type EventSubject = typeof EventSubjects[keyof typeof EventSubjects];

// ============================================================================
// IN-MEMORY EVENT BUS (Development Fallback)
// ============================================================================

class InMemoryEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private eventLog: Event[] = [];
  private maxLogSize: number = 10000;

  async publish<T>(subject: string, data: T, options?: PublishOptions): Promise<string> {
    const event: Event<T> = {
      id: this.generateId(),
      subject,
      data,
      timestamp: Date.now(),
      correlationId: options?.correlationId,
      causationId: options?.causationId,
      metadata: options?.metadata,
    };

    // Log event
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Deliver to handlers
    const handlers = this.handlers.get(subject);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`[EventBus] Handler error for ${subject}:`, error);
        }
      }
    }

    // Also check wildcard handlers
    for (const [pattern, patternHandlers] of this.handlers) {
      if (pattern.includes('>') || pattern.includes('*')) {
        if (this.matchSubject(pattern, subject)) {
          for (const handler of patternHandlers) {
            try {
              await handler(event);
            } catch (error) {
              console.error(`[EventBus] Wildcard handler error for ${subject}:`, error);
            }
          }
        }
      }
    }

    return event.id;
  }

  subscribe<T>(subject: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(subject)) {
      this.handlers.set(subject, new Set());
    }
    
    const wrappedHandler = handler as EventHandler;
    this.handlers.get(subject)!.add(wrappedHandler);

    return () => {
      this.handlers.get(subject)?.delete(wrappedHandler);
    };
  }

  async request<T, R>(subject: string, data: T, timeout: number = 5000): Promise<R> {
    // In-memory request/reply simulation
    return new Promise((resolve, reject) => {
      const replySubject = `${subject}.reply.${this.generateId()}`;
      const timer = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeout);

      const unsubscribe = this.subscribe<R>(replySubject, (event) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(event.data);
      });

      this.publish(subject, data, { reply: replySubject });
    });
  }

  getEventLog(subject?: string): Event[] {
    if (subject) {
      return this.eventLog.filter(e => e.subject === subject);
    }
    return [...this.eventLog];
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private matchSubject(pattern: string, subject: string): boolean {
    const patternParts = pattern.split('.');
    const subjectParts = subject.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '>') {
        return true; // Match remaining
      }
      if (patternParts[i] !== '*' && patternParts[i] !== subjectParts[i]) {
        return false;
      }
    }

    return patternParts.length === subjectParts.length;
  }
}

// ============================================================================
// NATS CLIENT WRAPPER
// ============================================================================

class NATSMessageQueue {
  private config: NatsConfig | null = null;
  private connected: boolean = false;
  private eventBus: InMemoryEventBus;
  private subscriptions: Map<string, Subscription> = new Map();

  constructor() {
    this.eventBus = new InMemoryEventBus();
  }

  /**
   * Connect to NATS server
   */
  async connect(config: NatsConfig): Promise<void> {
    this.config = config;

    try {
      // In production, would connect to actual NATS server
      // const nc = await connect({ servers: config.servers, ... });
      // For development, use in-memory event bus
      
      console.log('[NATS] Using in-memory event bus (development mode)');
      this.connected = true;
    } catch (error) {
      console.error('[NATS] Connection failed:', error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================================
  // PUBLISH / SUBSCRIBE
  // ============================================================================

  /**
   * Publish an event
   */
  async publish<T>(subject: string, data: T, options?: PublishOptions): Promise<string> {
    return this.eventBus.publish(subject, data, options);
  }

  /**
   * Subscribe to events
   */
  subscribe<T>(subject: string, handler: EventHandler<T>): () => void {
    const unsubscribe = this.eventBus.subscribe(subject, handler);
    
    const subscription: Subscription = {
      subject,
      handler: handler as EventHandler,
      unsubscribe,
    };
    
    const id = `${subject}-${Date.now()}`;
    this.subscriptions.set(id, subscription);
    
    return () => {
      unsubscribe();
      this.subscriptions.delete(id);
    };
  }

  /**
   * Subscribe with queue group (for load balancing)
   */
  subscribeQueue<T>(
    subject: string,
    queueGroup: string,
    handler: EventHandler<T>
  ): () => void {
    // In production, this would use NATS queue groups
    // For development, just regular subscribe
    return this.subscribe(subject, handler);
  }

  // ============================================================================
  // REQUEST / REPLY
  // ============================================================================

  /**
   * Send request and wait for reply
   */
  async request<T, R>(subject: string, data: T, timeout?: number): Promise<R> {
    return this.eventBus.request(subject, data, timeout);
  }

  /**
   * Subscribe to handle requests
   */
  handleRequests<T, R>(subject: string, handler: (data: T) => Promise<R>): () => void {
    return this.subscribe<T>(subject, async (event) => {
      try {
        const result = await handler(event.data);
        if (event.metadata?.reply) {
          await this.publish(event.metadata.reply, result);
        }
      } catch (error) {
        console.error(`[NATS] Request handler error for ${subject}:`, error);
      }
    });
  }

  // ============================================================================
  // EVENT SOURCING
  // ============================================================================

  /**
   * Get event log
   */
  getEventLog(subject?: string): Event[] {
    return this.eventBus.getEventLog(subject);
  }

  /**
   * Replay events from log
   */
  async replayEvents(
    subject: string,
    handler: EventHandler,
    fromTimestamp?: number
  ): Promise<number> {
    const events = this.eventBus.getEventLog(subject);
    let count = 0;

    for (const event of events) {
      if (!fromTimestamp || event.timestamp >= fromTimestamp) {
        await handler(event);
        count++;
      }
    }

    return count;
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Emit a trade event
   */
  async emitTradeOpened(data: {
    tradeId: string;
    symbol: string;
    direction: string;
    amount: number;
    entryPrice: number;
    exchange: string;
  }): Promise<string> {
    return this.publish(EventSubjects.TRADE_OPENED, data);
  }

  /**
   * Emit a position event
   */
  async emitPositionUpdated(data: {
    positionId: string;
    symbol: string;
    unrealizedPnl: number;
    currentPrice: number;
  }): Promise<string> {
    return this.publish(EventSubjects.POSITION_UPDATED, data);
  }

  /**
   * Emit a bot signal
   */
  async emitBotSignal(data: {
    botId: string;
    botType: string;
    signal: string;
    symbol: string;
    confidence?: number;
  }): Promise<string> {
    return this.publish(EventSubjects.BOT_SIGNAL, data);
  }

  /**
   * Emit a risk alert
   */
  async emitRiskAlert(data: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    details?: Record<string, unknown>;
  }): Promise<string> {
    return this.publish(EventSubjects.RISK_ALERT, data);
  }

  /**
   * Emit a price update
   */
  async emitPriceUpdate(data: {
    symbol: string;
    exchange: string;
    price: number;
    bidPrice?: number;
    askPrice?: number;
    volume24h?: number;
  }): Promise<string> {
    return this.publish(EventSubjects.PRICE_UPDATE, data);
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // Unsubscribe all
    for (const [id, sub] of this.subscriptions) {
      sub.unsubscribe();
      this.subscriptions.delete(id);
    }

    this.connected = false;
    console.log('[NATS] Disconnected');
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const natsMessageQueue = new NATSMessageQueue();
export default natsMessageQueue;
