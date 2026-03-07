/**
 * Dead Letter Queue (DLQ) Module
 * Handles failed events with retry logic and exponential backoff
 * Audit Fix: P1.15 - Implement Dead Letter Queue for failed events
 */

export interface DLQEvent {
  id: string;
  type: 'order' | 'signal' | 'trade' | 'position' | 'webhook' | 'websocket';
  payload: unknown;
  error: {
    message: string;
    code?: string;
    stack?: string;
    timestamp: number;
  };
  metadata: {
    source: string;
    retryCount: number;
    maxRetries: number;
    createdAt: number;
    lastRetryAt?: number;
    nextRetryAt?: number;
    priority: 'low' | 'normal' | 'high' | 'critical';
  };
  status: 'pending' | 'processing' | 'retrying' | 'failed' | 'resolved';
}

export interface DLQConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  retentionMs: number;
  batchSize: number;
  processingIntervalMs: number;
}

const DEFAULT_CONFIG: DLQConfig = {
  maxRetries: 5,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 300000, // 5 minutes
  jitterFactor: 0.3,
  retentionMs: 86400000, // 24 hours
  batchSize: 50,
  processingIntervalMs: 5000, // 5 seconds
};

export class DeadLetterQueue {
  private queue: Map<string, DLQEvent> = new Map();
  private config: DLQConfig;
  private processingInterval?: NodeJS.Timeout;
  private handlers: Map<string, (event: DLQEvent) => Promise<boolean>> = new Map();
  private metrics = {
    totalEvents: 0,
    successfulRetries: 0,
    permanentFailures: 0,
    currentQueueSize: 0,
  };

  constructor(config: Partial<DLQConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a failed event to the DLQ
   */
  addEvent(
    type: DLQEvent['type'],
    payload: unknown,
    error: Error | { message: string; code?: string },
    metadata: Partial<DLQEvent['metadata']> = {}
  ): string {
    const id = this.generateId();
    const event: DLQEvent = {
      id,
      type,
      payload,
      error: {
        message: error.message,
        code: (error as { code?: string }).code,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
      },
      metadata: {
        source: metadata.source || 'unknown',
        retryCount: 0,
        maxRetries: metadata.maxRetries ?? this.config.maxRetries,
        createdAt: Date.now(),
        priority: metadata.priority || 'normal',
      },
      status: 'pending',
    };

    this.queue.set(id, event);
    this.metrics.totalEvents++;
    this.metrics.currentQueueSize = this.queue.size;

    console.log(`[DLQ] Added event ${id} of type ${type} with priority ${event.metadata.priority}`);
    
    return id;
  }

  /**
   * Register a handler for a specific event type
   */
  registerHandler(
    eventType: DLQEvent['type'],
    handler: (event: DLQEvent) => Promise<boolean>
  ): void {
    this.handlers.set(eventType, handler);
    console.log(`[DLQ] Registered handler for event type: ${eventType}`);
  }

  /**
   * Start processing the DLQ
   */
  startProcessing(): void {
    if (this.processingInterval) {
      console.warn('[DLQ] Processing already started');
      return;
    }

    this.processingInterval = setInterval(() => {
      this.processBatch();
    }, this.config.processingIntervalMs);

    console.log('[DLQ] Started processing with interval:', this.config.processingIntervalMs);
  }

  /**
   * Stop processing the DLQ
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
      console.log('[DLQ] Stopped processing');
    }
  }

  /**
   * Process a batch of events
   */
  private async processBatch(): Promise<void> {
    const now = Date.now();
    const eventsToProcess = Array.from(this.queue.values())
      .filter((event) => {
        if (event.status === 'processing') return false;
        if (event.status === 'failed' || event.status === 'resolved') return false;
        if (event.metadata.nextRetryAt && event.metadata.nextRetryAt > now) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by priority (critical > high > normal > low)
        const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        return priorityOrder[a.metadata.priority] - priorityOrder[b.metadata.priority];
      })
      .slice(0, this.config.batchSize);

    for (const event of eventsToProcess) {
      await this.processEvent(event);
    }

    // Clean up old events
    this.cleanupOldEvents();
  }

  /**
   * Process a single event
   */
  private async processEvent(event: DLQEvent): Promise<void> {
    const handler = this.handlers.get(event.type);
    
    if (!handler) {
      console.warn(`[DLQ] No handler registered for event type: ${event.type}`);
      return;
    }

    event.status = 'processing';
    event.metadata.lastRetryAt = Date.now();

    try {
      const success = await handler(event);

      if (success) {
        event.status = 'resolved';
        this.queue.delete(event.id);
        this.metrics.successfulRetries++;
        console.log(`[DLQ] Event ${event.id} successfully processed after ${event.metadata.retryCount} retries`);
      } else {
        this.handleRetry(event);
      }
    } catch (error) {
      console.error(`[DLQ] Error processing event ${event.id}:`, error);
      this.handleRetry(event);
    }

    this.metrics.currentQueueSize = this.queue.size;
  }

  /**
   * Handle retry logic with exponential backoff
   */
  private handleRetry(event: DLQEvent): void {
    event.metadata.retryCount++;

    if (event.metadata.retryCount >= event.metadata.maxRetries) {
      event.status = 'failed';
      this.metrics.permanentFailures++;
      console.error(`[DLQ] Event ${event.id} permanently failed after ${event.metadata.retryCount} retries`);
      
      // Alert on permanent failures for critical events
      if (event.metadata.priority === 'critical') {
        this.alertPermanentFailure(event);
      }
      return;
    }

    event.status = 'retrying';
    const delay = this.calculateBackoffDelay(event.metadata.retryCount);
    event.metadata.nextRetryAt = Date.now() + delay;
    
    console.log(`[DLQ] Event ${event.id} scheduled for retry ${event.metadata.retryCount}/${event.metadata.maxRetries} in ${delay}ms`);
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(retryCount: number): number {
    // Exponential backoff: baseDelay * 2^retryCount
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, retryCount);
    
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Clean up events older than retention period
   */
  private cleanupOldEvents(): void {
    const cutoff = Date.now() - this.config.retentionMs;
    let cleaned = 0;

    for (const [id, event] of this.queue.entries()) {
      if (event.metadata.createdAt < cutoff && (event.status === 'failed' || event.status === 'resolved')) {
        this.queue.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[DLQ] Cleaned up ${cleaned} old events`);
    }

    this.metrics.currentQueueSize = this.queue.size;
  }

  /**
   * Alert on permanent failure of critical event
   */
  private alertPermanentFailure(event: DLQEvent): void {
    console.error(`[DLQ] CRITICAL: Permanent failure for event ${event.id}`, {
      type: event.type,
      error: event.error,
      payload: event.payload,
    });
    
    // In production, this would send alerts via Slack, PagerDuty, etc.
  }

  /**
   * Get event by ID
   */
  getEvent(id: string): DLQEvent | undefined {
    return this.queue.get(id);
  }

  /**
   * Get all events of a specific type
   */
  getEventsByType(type: DLQEvent['type']): DLQEvent[] {
    return Array.from(this.queue.values()).filter((event) => event.type === type);
  }

  /**
   * Get all events with a specific status
   */
  getEventsByStatus(status: DLQEvent['status']): DLQEvent[] {
    return Array.from(this.queue.values()).filter((event) => event.status === status);
  }

  /**
   * Manually retry an event
   */
  async retryEvent(id: string): Promise<boolean> {
    const event = this.queue.get(id);
    if (!event) {
      console.warn(`[DLQ] Event ${id} not found`);
      return false;
    }

    event.metadata.retryCount = 0;
    event.status = 'pending';
    delete event.metadata.nextRetryAt;

    await this.processEvent(event);
    return true;
  }

  /**
   * Remove an event from the queue
   */
  removeEvent(id: string): boolean {
    const result = this.queue.delete(id);
    if (result) {
      this.metrics.currentQueueSize = this.queue.size;
    }
    return result;
  }

  /**
   * Get current metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.queue.size;
  }

  /**
   * Generate unique event ID
   */
  private generateId(): string {
    return `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[DLQ] Shutting down...');
    this.stopProcessing();
    
    // Process remaining high-priority events
    const criticalEvents = this.getEventsByStatus('pending')
      .filter((e) => e.metadata.priority === 'critical');
    
    for (const event of criticalEvents) {
      await this.processEvent(event);
    }
    
    console.log('[DLQ] Shutdown complete. Final metrics:', this.metrics);
  }
}

// Singleton instance
let dlqInstance: DeadLetterQueue | null = null;

export function getDeadLetterQueue(config?: Partial<DLQConfig>): DeadLetterQueue {
  if (!dlqInstance) {
    dlqInstance = new DeadLetterQueue(config);
  }
  return dlqInstance;
}

export default DeadLetterQueue;
