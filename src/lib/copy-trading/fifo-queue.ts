/**
 * FIFO Queue for Copy Trading
 * 
 * Implements a FIFO (First-In-First-Out) queue using Redis sorted sets
 * for managing copy trading orders and signals.
 * 
 * Features:
 * - Priority-based ordering within FIFO structure
 * - Atomic operations for distributed systems
 * - Delayed message processing
 * - Dead letter queue for failed messages
 * - Message acknowledgment and requeue
 * 
 * Redis Sorted Set Score Formula:
 * score = timestamp * 1000 + (1000 - priority)
 * 
 * This ensures:
 * 1. Messages with same priority are processed FIFO (by timestamp)
 * 2. Higher priority messages are processed first within same timestamp
 */

// ==================== TYPES ====================

/**
 * Queue message types for copy trading
 */
export type CopyTradingMessageType =
  | 'OPEN_POSITION'
  | 'CLOSE_POSITION'
  | 'MODIFY_POSITION'
  | 'SET_TP_SL'
  | 'SET_LEVERAGE'
  | 'PARTIAL_CLOSE';

/**
 * Priority levels for queue messages
 */
export type MessagePriority = 'high' | 'normal' | 'low';

/**
 * Base queue message structure
 */
export interface QueueMessage<T = unknown> {
  /** Unique message ID */
  id: string;
  /** Message type */
  type: CopyTradingMessageType;
  /** Message payload */
  payload: T;
  /** Priority level (affects ordering within timestamp) */
  priority: MessagePriority;
  /** Timestamp when message was created */
  timestamp: number;
  /** Exchange ID */
  exchange: string;
  /** Master trader ID */
  masterTraderId: string;
  /** Follower ID (can be array for broadcast) */
  followerIds?: string[];
  /** Correlation ID for tracking related messages */
  correlationId?: string;
  /** Number of retry attempts */
  retryCount: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Message expiration timestamp */
  expiresAt?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Open position message payload
 */
export interface OpenPositionPayload {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  orderType: 'MARKET' | 'LIMIT';
  masterTradeId: string;
  masterTradeTime: Date;
}

/**
 * Close position message payload
 */
export interface ClosePositionPayload {
  symbol: string;
  positionId: string;
  closePrice?: number;
  closeReason: string;
  masterTradeId: string;
}

/**
 * Modify position message payload
 */
export interface ModifyPositionPayload {
  symbol: string;
  positionId: string;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: {
    enabled: boolean;
    percent?: number;
  };
}

/**
 * Result of queue operation
 */
export interface QueueResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  avgProcessingTime: number;
  throughput: number; // messages per second
}

/**
 * Redis client interface (simplified)
 */
interface RedisClient {
  zadd(key: string, score: number, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
  zrem(key: string, member: string): Promise<number>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zcard(key: string): Promise<number>;
  zscore(key: string, member: string): Promise<number | null>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: string[]): Promise<string>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  multi(): RedisPipeline;
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

interface RedisPipeline {
  zadd(key: string, score: number, member: string): RedisPipeline;
  zrem(key: string, member: string): RedisPipeline;
  set(key: string, value: string): RedisPipeline;
  get(key: string): RedisPipeline;
  del(key: string): RedisPipeline;
  exec(): Promise<unknown[]>;
}

// ==================== CONSTANTS ====================

const QUEUE_PREFIX = 'copytrading:queue';
const PROCESSING_PREFIX = 'copytrading:processing';
const DEAD_LETTER_PREFIX = 'copytrading:deadletter';
const COMPLETED_PREFIX = 'copytrading:completed';
const STATS_PREFIX = 'copytrading:stats';

const PRIORITY_SCORES: Record<MessagePriority, number> = {
  high: 900,
  normal: 500,
  low: 100,
};

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MESSAGE_TTL = 300000; // 5 minutes
const PROCESSING_TIMEOUT = 60000; // 1 minute

// ==================== FIFO QUEUE CLASS ====================

/**
 * FIFO Queue implementation for copy trading using Redis sorted sets
 */
export class CopyTradingFIFOQueue {
  private queueName: string;
  private redis: RedisClient | null = null;
  private processingTimeout: number;
  private messageCounter: number = 0;

  constructor(
    queueName: string = 'default',
    redisClient?: RedisClient,
    processingTimeout: number = PROCESSING_TIMEOUT
  ) {
    this.queueName = queueName;
    this.redis = redisClient || null;
    this.processingTimeout = processingTimeout;
  }

  /**
   * Set Redis client (for lazy initialization)
   */
  setRedisClient(client: RedisClient): void {
    this.redis = client;
  }

  /**
   * Generate a unique message ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const counter = (++this.messageCounter).toString(36).padStart(4, '0');
    const random = Math.random().toString(36).substr(2, 6);
    return `ct-${timestamp}-${counter}-${random}`;
  }

  /**
   * Calculate score for sorted set
   * 
   * Score = timestamp * 1000 + (1000 - priorityScore)
   * 
   * This ensures:
   * - Lower score = processed first (FIFO)
   * - Within same timestamp, higher priority messages have lower scores
   */
  private calculateScore(message: QueueMessage): number {
    const timestampScore = message.timestamp * 1000;
    const priorityScore = PRIORITY_SCORES[message.priority];
    return timestampScore + (1000 - priorityScore);
  }

  /**
   * Get queue key for a specific exchange
   */
  private getQueueKey(exchange?: string): string {
    return exchange 
      ? `${QUEUE_PREFIX}:${this.queueName}:${exchange}`
      : `${QUEUE_PREFIX}:${this.queueName}`;
  }

  /**
   * Get processing queue key
   */
  private getProcessingKey(exchange?: string): string {
    return exchange
      ? `${PROCESSING_PREFIX}:${this.queueName}:${exchange}`
      : `${PROCESSING_PREFIX}:${this.queueName}`;
  }

  /**
   * Get dead letter queue key
   */
  private getDeadLetterKey(exchange?: string): string {
    return exchange
      ? `${DEAD_LETTER_PREFIX}:${this.queueName}:${exchange}`
      : `${DEAD_LETTER_PREFIX}:${this.queueName}`;
  }

  /**
   * Enqueue a message
   * 
   * @param message - Message to enqueue
   * @returns QueueResult with message ID
   */
  async enqueue<T>(message: Omit<QueueMessage<T>, 'id' | 'timestamp' | 'retryCount'>): Promise<QueueResult> {
    const fullMessage: QueueMessage<T> = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: message.maxRetries || DEFAULT_MAX_RETRIES,
      expiresAt: message.expiresAt || Date.now() + DEFAULT_MESSAGE_TTL,
    };

    // Check expiration
    if (fullMessage.expiresAt && fullMessage.expiresAt < Date.now()) {
      return {
        success: false,
        error: 'Message has already expired',
      };
    }

    const score = this.calculateScore(fullMessage);
    const messageJson = JSON.stringify(fullMessage);
    const queueKey = this.getQueueKey(fullMessage.exchange);

    if (this.redis) {
      try {
        await this.redis.zadd(queueKey, score, messageJson);
        
        // Update stats
        await this.redis.incr(`${STATS_PREFIX}:${this.queueName}:enqueued`);
        
        return {
          success: true,
          messageId: fullMessage.id,
        };
      } catch (error) {
        console.error('[FIFOQueue] Enqueue error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to enqueue message',
        };
      }
    }

    // Fallback to in-memory queue (not recommended for production)
    console.warn('[FIFOQueue] No Redis client, using in-memory fallback');
    this.inMemoryQueue.push({ score, message: messageJson });
    
    return {
      success: true,
      messageId: fullMessage.id,
    };
  }

  /**
   * Dequeue a message (FIFO with priority)
   * 
   * @param exchange - Optional exchange filter
   * @returns Message with acknowledgment function
   */
  async dequeue<T>(
    exchange?: string
  ): Promise<{
    message: QueueMessage<T>;
    ack: () => Promise<void>;
    nack: (requeue?: boolean) => Promise<void>;
  } | null> {
    const queueKey = this.getQueueKey(exchange);
    const processingKey = this.getProcessingKey(exchange);
    const deadLetterKey = this.getDeadLetterKey(exchange);

    if (this.redis) {
      try {
        // Use Lua script for atomic dequeue
        const script = `
          local queueKey = KEYS[1]
          local processingKey = KEYS[2]
          local now = tonumber(ARGV[1])
          local timeout = tonumber(ARGV[2])
          
          -- Get expired processing messages first (for recovery)
          local expired = redis.call('zrangebyscore', processingKey, 0, now - timeout)
          for i, msg in ipairs(expired) do
            redis.call('zrem', processingKey, msg)
            local data = cjson.decode(msg)
            data.retryCount = (data.retryCount or 0) + 1
            if data.retryCount < (data.maxRetries or 3) then
              local score = tonumber(ARGV[3]) or 0
              redis.call('zadd', queueKey, score, cjson.encode(data))
            else
              redis.call('zadd', KEYS[3], now, msg)
            end
          end
          
          -- Get next message (lowest score = highest priority + oldest)
          local messages = redis.call('zrange', queueKey, 0, 0)
          if #messages == 0 then
            return nil
          end
          
          local message = messages[1]
          redis.call('zrem', queueKey, message)
          redis.call('zadd', processingKey, now, message)
          
          return message
        `;

        const now = Date.now();
        const result = await this.redis.eval(script, [queueKey, processingKey, deadLetterKey], [
          now,
          this.processingTimeout,
          now * 1000,
        ]) as string | null;

        if (!result) {
          return null;
        }

        const message: QueueMessage<T> = JSON.parse(result);

        // Check expiration
        if (message.expiresAt && message.expiresAt < Date.now()) {
          // Message expired, move to dead letter
          await this.redis.zadd(deadLetterKey, now, result);
          return null;
        }

        // Create acknowledgment functions
        let acknowledged = false;

        const ack = async () => {
          if (acknowledged) return;
          acknowledged = true;

          await this.redis!.zrem(processingKey, result);
          await this.redis!.incr(`${STATS_PREFIX}:${this.queueName}:completed`);
        };

        const nack = async (requeue: boolean = true) => {
          if (acknowledged) return;
          acknowledged = true;

          await this.redis!.zrem(processingKey, result);

          if (requeue && message.retryCount < message.maxRetries) {
            // Requeue with updated retry count
            const updatedMessage: QueueMessage<T> = {
              ...message,
              retryCount: message.retryCount + 1,
            };
            const score = this.calculateScore(updatedMessage);
            await this.redis!.zadd(queueKey, score, JSON.stringify(updatedMessage));
          } else {
            // Move to dead letter queue
            await this.redis!.zadd(deadLetterKey, now, result);
            await this.redis!.incr(`${STATS_PREFIX}:${this.queueName}:failed`);
          }
        };

        return { message, ack, nack };
      } catch (error) {
        console.error('[FIFOQueue] Dequeue error:', error);
        return null;
      }
    }

    // Fallback to in-memory queue
    if (this.inMemoryQueue.length === 0) {
      return null;
    }

    const item = this.inMemoryQueue.shift()!;
    const message: QueueMessage<T> = JSON.parse(item.message);

    return {
      message,
      ack: async () => {},
      nack: async () => {},
    };
  }

  /**
   * Peek at the next message without removing it
   */
  async peek<T>(exchange?: string): Promise<QueueMessage<T> | null> {
    const queueKey = this.getQueueKey(exchange);

    if (this.redis) {
      try {
        const messages = await this.redis.zrange(queueKey, 0, 0);
        if (messages.length === 0) {
          return null;
        }
        return JSON.parse(messages[0]);
      } catch (error) {
        console.error('[FIFOQueue] Peek error:', error);
        return null;
      }
    }

    if (this.inMemoryQueue.length === 0) {
      return null;
    }

    return JSON.parse(this.inMemoryQueue[0].message);
  }

  /**
   * Get queue size
   */
  async size(exchange?: string): Promise<number> {
    const queueKey = this.getQueueKey(exchange);

    if (this.redis) {
      try {
        return await this.redis.zcard(queueKey);
      } catch (error) {
        console.error('[FIFOQueue] Size error:', error);
        return 0;
      }
    }

    return this.inMemoryQueue.length;
  }

  /**
   * Get queue statistics
   */
  async getStats(exchange?: string): Promise<QueueStats> {
    if (this.redis) {
      try {
        const [pending, processing, deadLetter] = await Promise.all([
          this.redis.zcard(this.getQueueKey(exchange)),
          this.redis.zcard(this.getProcessingKey(exchange)),
          this.redis.zcard(this.getDeadLetterKey(exchange)),
        ]);

        return {
          pending,
          processing,
          completed: 0, // Would need to track this separately
          failed: deadLetter,
          deadLetter,
          avgProcessingTime: 0, // Would need to track this separately
          throughput: 0, // Would need to track this separately
        };
      } catch (error) {
        console.error('[FIFOQueue] GetStats error:', error);
        return {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          deadLetter: 0,
          avgProcessingTime: 0,
          throughput: 0,
        };
      }
    }

    return {
      pending: this.inMemoryQueue.length,
      processing: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
      avgProcessingTime: 0,
      throughput: 0,
    };
  }

  /**
   * Clear all messages from queue
   */
  async clear(exchange?: string): Promise<void> {
    const queueKey = this.getQueueKey(exchange);
    const processingKey = this.getProcessingKey(exchange);
    const deadLetterKey = this.getDeadLetterKey(exchange);

    if (this.redis) {
      try {
        await Promise.all([
          this.redis.del(queueKey),
          this.redis.del(processingKey),
          this.redis.del(deadLetterKey),
        ]);
      } catch (error) {
        console.error('[FIFOQueue] Clear error:', error);
      }
    }

    this.inMemoryQueue = [];
  }

  /**
   * Get messages by correlation ID
   */
  async getByCorrelationId<T>(correlationId: string): Promise<QueueMessage<T>[]> {
    // This would require scanning all messages
    // In production, consider using a secondary index
    console.warn('[FIFOQueue] getByCorrelationId not implemented for Redis sorted sets');
    return [];
  }

  /**
   * Reclaim expired processing messages
   */
  async reclaimExpired(exchange?: string): Promise<number> {
    const processingKey = this.getProcessingKey(exchange);
    const queueKey = this.getQueueKey(exchange);
    const deadLetterKey = this.getDeadLetterKey(exchange);

    if (this.redis) {
      try {
        const cutoff = Date.now() - this.processingTimeout;
        
        // Get expired messages
        const expired = await this.redis.zrangebyscore(processingKey, 0, cutoff);
        
        for (const msgJson of expired) {
          const msg = JSON.parse(msgJson) as QueueMessage;
          
          // Remove from processing
          await this.redis.zrem(processingKey, msgJson);
          
          // Increment retry count
          msg.retryCount++;
          
          if (msg.retryCount < msg.maxRetries) {
            // Requeue
            const score = this.calculateScore(msg);
            await this.redis.zadd(queueKey, score, JSON.stringify(msg));
          } else {
            // Move to dead letter
            await this.redis.zadd(deadLetterKey, Date.now(), msgJson);
          }
        }
        
        return expired.length;
      } catch (error) {
        console.error('[FIFOQueue] ReclaimExpired error:', error);
        return 0;
      }
    }

    return 0;
  }

  // In-memory fallback (not for production)
  private inMemoryQueue: Array<{ score: number; message: string }> = [];
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create a FIFO queue instance
 */
export function createFIFOQueue(
  queueName: string,
  redisClient?: RedisClient
): CopyTradingFIFOQueue {
  return new CopyTradingFIFOQueue(queueName, redisClient);
}

/**
 * Priority score helper
 */
export function getPriorityScore(priority: MessagePriority): number {
  return PRIORITY_SCORES[priority];
}

// ==================== SINGLETON INSTANCE ====================

let defaultQueue: CopyTradingFIFOQueue | null = null;

export function getDefaultFIFOQueue(): CopyTradingFIFOQueue {
  if (!defaultQueue) {
    defaultQueue = new CopyTradingFIFOQueue('default');
  }
  return defaultQueue;
}

export function setDefaultFIFOQueue(queue: CopyTradingFIFOQueue): void {
  defaultQueue = queue;
}
