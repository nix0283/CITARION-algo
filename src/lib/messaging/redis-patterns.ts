/**
 * Async Message Patterns via Redis
 * 
 * Паттерны асинхронного обмена сообщениями через Redis.
 * Используется для:
 * - Межсервисного взаимодействия
 * - Pub/Sub для реального времени
 * - Очередей задач
 * - Кэширования и распределённых блокировок
 * 
 * @author CITARION
 * @version 1.0.0
 */

// ==================== TYPES ====================

/**
 * Конфигурация Redis подключения
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
}

/**
 * Типы каналов сообщений
 */
export type MessageChannel = 
  | `trading:signal:${string}`      // Торговые сигналы
  | `trading:order:${string}`       // Ордера
  | `trading:position:${string}`    // Позиции
  | `market:tick:${string}`         // Тики рынка
  | `market:kline:${string}`        // Свечи
  | `bot:status:${string}`          // Статус ботов
  | `bot:command:${string}`         // Команды ботам
  | `user:notification:${string}`   // Уведомления пользователей
  | `system:alert`;                 // Системные алерты

/**
 * Базовое сообщение
 */
export interface BaseMessage<T = unknown> {
  id: string;
  type: string;
  channel: string;
  payload: T;
  timestamp: number;
  ttl?: number;
  correlationId?: string;
  replyTo?: string;
}

/**
 * Торговый сигнал
 */
export interface TradingSignalMessage extends BaseMessage<{
  symbol: string;
  action: 'BUY' | 'SELL' | 'CLOSE';
  price?: number;
  quantity?: number;
  strategy: string;
  confidence: number;
  reason: string;
  exchange: string;
}> {
  type: 'TRADING_SIGNAL';
}

/**
 * Ордер
 */
export interface OrderMessage extends BaseMessage<{
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  price?: number;
  quantity: number;
  filledQuantity?: number;
  exchange: string;
}> {
  type: 'ORDER_UPDATE';
}

/**
 * Команда боту
 */
export interface BotCommandMessage extends BaseMessage<{
  botId: string;
  command: 'START' | 'STOP' | 'PAUSE' | 'RESUME' | 'UPDATE_CONFIG';
  params?: Record<string, unknown>;
}> {
  type: 'BOT_COMMAND';
}

/**
 * Результат обработки сообщения
 */
export interface MessageResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  processingTime: number;
}

// ==================== MESSAGE QUEUE ====================

/**
 * Паттерн: Очередь сообщений
 * 
 * FIFO очередь с поддержкой:
 * - Приоритетов
 * - Отложенной обработки
 * - Подтверждения обработки (ACK)
 */
export class MessageQueue<T = unknown> {
  private queueName: string;
  private processingQueueName: string;
  private deadLetterQueueName: string;
  
  constructor(name: string) {
    this.queueName = `queue:${name}`;
    this.processingQueueName = `queue:${name}:processing`;
    this.deadLetterQueueName = `queue:${name}:dead-letter`;
  }
  
  /**
   * Добавить сообщение в очередь
   */
  async enqueue(
    message: T,
    options?: {
      priority?: number;
      delay?: number;
      ttl?: number;
    }
  ): Promise<string> {
    const id = this.generateId();
    const msg: BaseMessage<T> = {
      id,
      type: 'QUEUE_MESSAGE',
      channel: this.queueName,
      payload: message,
      timestamp: Date.now(),
      ttl: options?.ttl,
    };
    
    // В реальной реализации используем Redis LPUSH
    // await redis.lpush(this.queueName, JSON.stringify(msg));
    
    return id;
  }
  
  /**
   * Получить сообщение из очереди
   */
  async dequeue(
    timeout: number = 5000,
    processingTimeout: number = 30000
  ): Promise<{ message: BaseMessage<T>; ack: () => Promise<void>; nack: () => Promise<void> } | null> {
    // В реальной реализации:
    // 1. BRPOPLPUSH для атомарного перемещения в processing queue
    // 2. Возвращаем сообщение с функциями подтверждения
    
    return null;
  }
  
  /**
   * Подтвердить обработку (ACK)
   */
  private async ack(messageId: string): Promise<void> {
    // Удаляем из processing queue
    // await redis.lrem(this.processingQueueName, 0, messageId);
  }
  
  /**
   * Отклонить обработку (NACK)
   */
  private async nack(messageId: string): Promise<void> {
    // Перемещаем в dead letter queue или возвращаем в основную очередь
    // await redis.rpush(this.deadLetterQueueName, messageId);
  }
  
  /**
   * Получить размер очереди
   */
  async size(): Promise<number> {
    // return await redis.llen(this.queueName);
    return 0;
  }
  
  /**
   * Очистить очередь
   */
  async clear(): Promise<void> {
    // await redis.del(this.queueName, this.processingQueueName);
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ==================== PUB/SUB PATTERN ====================

/**
 * Паттерн: Издатель-Подписчик
 * 
 * Используется для real-time обновлений:
 * - Цены, свечи
 * - Сигналы, ордера
 * - Уведомления
 */
export class MessagePubSub {
  private subscribers: Map<string, Set<(message: BaseMessage) => void>> = new Map();
  
  /**
   * Подписаться на канал
   */
  subscribe<T = unknown>(
    channel: MessageChannel | string,
    handler: (message: BaseMessage<T>) => void | Promise<void>
  ): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    
    const wrappedHandler = (msg: BaseMessage) => handler(msg as BaseMessage<T>);
    this.subscribers.get(channel)!.add(wrappedHandler);
    
    // Возвращаем функцию отписки
    return () => {
      this.subscribers.get(channel)?.delete(wrappedHandler);
    };
  }
  
  /**
   * Опубликовать сообщение
   */
  async publish<T = unknown>(
    channel: MessageChannel | string,
    payload: T,
    options?: {
      ttl?: number;
      correlationId?: string;
    }
  ): Promise<string> {
    const message: BaseMessage<T> = {
      id: this.generateId(),
      type: 'PUBSUB_MESSAGE',
      channel,
      payload,
      timestamp: Date.now(),
      ttl: options?.ttl,
      correlationId: options?.correlationId,
    };
    
    // В реальной реализации:
    // await redis.publish(channel, JSON.stringify(message));
    
    // Для демонстрации вызываем обработчики напрямую
    const handlers = this.subscribers.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          console.error(`Handler error for channel ${channel}:`, error);
        }
      }
    }
    
    return message.id;
  }
  
  /**
   * Подписаться на паттерн каналов
   */
  psubscribe(
    pattern: string,
    handler: (channel: string, message: BaseMessage) => void | Promise<void>
  ): () => void {
    // В реальной реализации:
    // redis.psubscribe(pattern);
    // redis.on('pmessage', (pattern, channel, message) => handler(channel, JSON.parse(message)));
    
    return () => {};
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ==================== DISTRIBUTED LOCK ====================

/**
 * Паттерн: Распределённая блокировка
 * 
 * Используется для синхронизации между сервисами:
 * - Защита от race conditions
 * - Критические секции
 */
export class DistributedLock {
  private lockPrefix: string;
  
  constructor(prefix: string = 'lock') {
    this.lockPrefix = prefix;
  }
  
  /**
   * Получить блокировку
   */
  async acquire(
    resource: string,
    options?: {
      ttl?: number;        // Время жизни блокировки (мс)
      retryInterval?: number;
      maxRetries?: number;
    }
  ): Promise<{ release: () => Promise<void>; id: string } | null> {
    const lockKey = `${this.lockPrefix}:${resource}`;
    const lockId = this.generateId();
    const ttl = options?.ttl ?? 30000;
    
    // В реальной реализации:
    // const result = await redis.set(lockKey, lockId, 'PX', ttl, 'NX');
    // if (result !== 'OK') return null;
    
    return {
      release: async () => {
        // Атомарное удаление только если значение совпадает
        // await redis.eval(`
        //   if redis.call("get", KEYS[1]) == ARGV[1] then
        //     return redis.call("del", KEYS[1])
        //   else
        //     return 0
        //   end
        // `, [lockKey, lockId]);
      },
      id: lockId,
    };
  }
  
  /**
   * Выполнить с блокировкой
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options?: {
      ttl?: number;
      retryInterval?: number;
      maxRetries?: number;
    }
  ): Promise<T | null> {
    const lock = await this.acquire(resource, options);
    if (!lock) return null;
    
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ==================== RATE LIMITER (Redis-based) ====================

/**
 * Паттерн: Rate Limiter на Redis
 * 
 * Поддерживает:
 * - Fixed Window
 * - Sliding Window
 * - Token Bucket
 */
export class RedisRateLimiter {
  private keyPrefix: string;
  
  constructor(prefix: string = 'ratelimit') {
    this.keyPrefix = prefix;
  }
  
  /**
   * Fixed Window Rate Limiting
   */
  async checkFixedWindow(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const key = `${this.keyPrefix}:fixed:${identifier}`;
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    
    // В реальной реализации:
    // const count = await redis.incr(key);
    // if (count === 1) await redis.pexpire(key, windowMs);
    // const remaining = Math.max(0, limit - count);
    // const resetIn = windowStart + windowMs - now;
    
    return {
      allowed: true, // count <= limit,
      remaining: limit, // remaining,
      resetIn: windowMs, // resetIn,
    };
  }
  
  /**
   * Sliding Window Rate Limiting (более точно)
   */
  async checkSlidingWindow(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const key = `${this.keyPrefix}:sliding:${identifier}`;
    const now = Date.now();
    
    // В реальной реализации используем Lua script:
    // 1. Удаляем старые записи
    // 2. Добавляем новую
    // 3. Считаем количество за окно
    
    return {
      allowed: true,
      remaining: limit,
      resetIn: windowMs,
    };
  }
  
  /**
   * Token Bucket Rate Limiting
   */
  async checkTokenBucket(
    identifier: string,
    bucketSize: number,
    refillRate: number, // токенов в секунду
    refillInterval: number = 1000
  ): Promise<{ allowed: boolean; tokens: number }> {
    const key = `${this.keyPrefix}:bucket:${identifier}`;
    
    // В реальной реализации:
    // 1. Получаем текущее состояние (tokens, lastRefill)
    // 2. Вычисляем refill
    // 3. Возвращаем/отказываем
    
    return {
      allowed: true,
      tokens: bucketSize,
    };
  }
}

// ==================== CIRCUIT BREAKER ====================

/**
 * Паттерн: Circuit Breaker
 * 
 * Защита от каскадных сбоев:
 * - CLOSED: Нормальная работа
 * - OPEN: Быстрый отказ
 * - HALF_OPEN: Попытка восстановления
 */
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private successes: number = 0;
  
  constructor(
    private readonly config: {
      failureThreshold: number;
      successThreshold: number;
      timeout: number; // Время в OPEN состоянии перед переходом в HALF_OPEN
    }
  ) {}
  
  /**
   * Выполнить через Circuit Breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.config.timeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
      this.successes = 0;
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'CLOSED';
      }
    }
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }
  
  getState(): { state: typeof this.state; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
    };
  }
}

// ==================== SINGLETON INSTANCES ====================

let pubSubInstance: MessagePubSub | null = null;
let lockInstance: DistributedLock | null = null;
let rateLimiterInstance: RedisRateLimiter | null = null;

export function getMessagePubSub(): MessagePubSub {
  if (!pubSubInstance) {
    pubSubInstance = new MessagePubSub();
  }
  return pubSubInstance;
}

export function getDistributedLock(): DistributedLock {
  if (!lockInstance) {
    lockInstance = new DistributedLock();
  }
  return lockInstance;
}

export function getRedisRateLimiter(): RedisRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RedisRateLimiter();
  }
  return rateLimiterInstance;
}

// ==================== FACTORY FUNCTIONS ====================

export function createMessageQueue<T = unknown>(name: string): MessageQueue<T> {
  return new MessageQueue<T>(name);
}

export function createCircuitBreaker(config: {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
}): CircuitBreaker {
  return new CircuitBreaker(config);
}
