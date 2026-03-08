/**
 * Redis Cache Client
 * Stage 3.2: Redis caching implementation
 */

import { createClient, RedisClientType } from 'redis'

// ============================================================================
// TYPES
// ============================================================================

export interface CacheOptions {
  ttl?: number // Time to live in seconds
  prefix?: string
  refresh?: boolean // Refresh TTL on get
}

export interface PubSubHandler<T = any> {
  (message: T, channel: string): void | Promise<void>
}

export interface CacheStats {
  hits: number
  misses: number
  sets: number
  deletes: number
  hitRate: number
}

// ============================================================================
// REDIS CLIENT
// ============================================================================

class RedisCacheClient {
  private client: RedisClientType | null = null
  private subscriber: RedisClientType | null = null
  private publisher: RedisClientType | null = null
  private connected: boolean = false
  private stats: CacheStats = { hits: 0, misses: 0, sets: 0, deletes: 0, hitRate: 0 }

  // Connection
  async connect(url?: string): Promise<void> {
    const redisUrl = url || process.env.REDIS_URL || 'redis://localhost:6379'

    this.client = createClient({ url: redisUrl })
    this.subscriber = this.client.duplicate()
    this.publisher = this.client.duplicate()

    this.client.on('error', (err) => console.error('Redis Client Error:', err))
    this.client.on('connect', () => { this.connected = true })
    this.client.on('disconnect', () => { this.connected = false })

    await Promise.all([
      this.client.connect(),
      this.subscriber.connect(),
      this.publisher.connect(),
    ])

    console.log('✅ Redis connected')
  }

  async disconnect(): Promise<void> {
    if (this.client) await this.client.quit()
    if (this.subscriber) await this.subscriber.quit()
    if (this.publisher) await this.publisher.quit()
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  // ============================================================================
  // BASIC OPERATIONS
  // ============================================================================

  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    if (!this.client) throw new Error('Redis not connected')

    const fullKey = options?.prefix ? `${options.prefix}:${key}` : key
    const serialized = JSON.stringify(value)

    if (options?.ttl) {
      await this.client.setEx(fullKey, options.ttl, serialized)
    } else {
      await this.client.set(fullKey, serialized)
    }

    this.stats.sets++
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.client) throw new Error('Redis not connected')

    const fullKey = options?.prefix ? `${options.prefix}:${key}` : key
    const value = await this.client.get(fullKey)

    if (value === null) {
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    if (options?.refresh && options?.ttl) {
      await this.client.expire(fullKey, options.ttl)
    }

    this.stats.hits++
    this.updateHitRate()
    return JSON.parse(value)
  }

  async delete(key: string, prefix?: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected')

    const fullKey = prefix ? `${prefix}:${key}` : key
    const result = await this.client.del(fullKey)

    this.stats.deletes++
    return result > 0
  }

  async exists(key: string, prefix?: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected')

    const fullKey = prefix ? `${prefix}:${key}` : key
    const result = await this.client.exists(fullKey)
    return result === 1
  }

  async ttl(key: string, prefix?: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected')

    const fullKey = prefix ? `${prefix}:${key}` : key
    return this.client.ttl(fullKey)
  }

  // ============================================================================
  // CACHE-ASIDE PATTERN
  // ============================================================================

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key, options)
    if (cached !== null) return cached

    const value = await fetcher()
    await this.set(key, value, options)
    return value
  }

  async getOrSetWithLock<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions & { lockTimeout?: number }
  ): Promise<T> {
    const cached = await this.get<T>(key, options)
    if (cached !== null) return cached

    // Try to acquire lock
    const lockKey = `lock:${key}`
    const lockAcquired = await this.setNX(lockKey, '1', options?.lockTimeout || 10)

    if (lockAcquired) {
      try {
        const value = await fetcher()
        await this.set(key, value, options)
        return value
      } finally {
        await this.delete(lockKey)
      }
    } else {
      // Wait and retry
      await new Promise(r => setTimeout(r, 100))
      return this.getOrSetWithLock(key, fetcher, options)
    }
  }

  // ============================================================================
  // HASH OPERATIONS
  // ============================================================================

  async hSet(key: string, field: string, value: any, prefix?: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected')
    const fullKey = prefix ? `${prefix}:${key}` : key
    await this.client.hSet(fullKey, field, JSON.stringify(value))
  }

  async hGet<T>(key: string, field: string, prefix?: string): Promise<T | null> {
    if (!this.client) throw new Error('Redis not connected')
    const fullKey = prefix ? `${prefix}:${key}` : key
    const value = await this.client.hGet(fullKey, field)
    return value ? JSON.parse(value) : null
  }

  async hGetAll<T>(key: string, prefix?: string): Promise<Record<string, T>> {
    if (!this.client) throw new Error('Redis not connected')
    const fullKey = prefix ? `${prefix}:${key}` : key
    const values = await this.client.hGetAll(fullKey)
    const result: Record<string, T> = {}
    for (const [field, value] of Object.entries(values)) {
      result[field] = JSON.parse(value)
    }
    return result
  }

  async hDel(key: string, field: string, prefix?: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected')
    const fullKey = prefix ? `${prefix}:${key}` : key
    await this.client.hDel(fullKey, field)
  }

  // ============================================================================
  // ORDERBOOK CACHING
  // ============================================================================

  async cacheOrderbook(
    symbol: string,
    exchange: string,
    orderbook: { bids: [number, number][]; asks: [number, number][] },
    ttl: number = 5
  ): Promise<void> {
    const key = `orderbook:${exchange}:${symbol}`
    await this.set(key, orderbook, { ttl })
  }

  async getOrderbook(
    symbol: string,
    exchange: string
  ): Promise<{ bids: [number, number][]; asks: [number, number][] } | null> {
    const key = `orderbook:${exchange}:${symbol}`
    return this.get(key)
  }

  // ============================================================================
  // PRICE CACHING
  // ============================================================================

  async cachePrice(symbol: string, exchange: string, price: number, ttl: number = 60): Promise<void> {
    const key = `price:${exchange}:${symbol}`
    await this.set(key, price, { ttl })
  }

  async getPrice(symbol: string, exchange: string): Promise<number | null> {
    const key = `price:${exchange}:${symbol}`
    return this.get<number>(key)
  }

  async cachePrices(prices: Record<string, number>, exchange: string, ttl: number = 60): Promise<void> {
    const pipeline = this.client?.multi()
    if (!pipeline) return

    for (const [symbol, price] of Object.entries(prices)) {
      const key = `price:${exchange}:${symbol}`
      pipeline.setEx(key, ttl, JSON.stringify(price))
    }

    await pipeline.exec()
  }

  // ============================================================================
  // TICKER CACHING
  // ============================================================================

  async cacheTicker(symbol: string, exchange: string, ticker: any, ttl: number = 10): Promise<void> {
    const key = `ticker:${exchange}:${symbol}`
    await this.set(key, ticker, { ttl })
  }

  async getTicker(symbol: string, exchange: string): Promise<any | null> {
    const key = `ticker:${exchange}:${symbol}`
    return this.get(key)
  }

  // ============================================================================
  // PUB/SUB
  // ============================================================================

  async publish(channel: string, message: any): Promise<void> {
    if (!this.publisher) throw new Error('Redis not connected')
    await this.publisher.publish(channel, JSON.stringify(message))
  }

  async subscribe<T = any>(channel: string, handler: PubSubHandler<T>): Promise<void> {
    if (!this.subscriber) throw new Error('Redis not connected')
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message)
        handler(parsed, channel)
      } catch (e) {
        console.error(`Error parsing message on ${channel}:`, e)
      }
    })
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) return
    await this.subscriber.unsubscribe(channel)
  }

  // ============================================================================
  // STREAMS (Event Log)
  // ============================================================================

  async xAdd(stream: string, data: Record<string, any>): Promise<string> {
    if (!this.client) throw new Error('Redis not connected')
    return this.client.xAdd(stream, '*', Object.entries(data).flat() as string[])
  }

  async xRead(stream: string, count: number = 10): Promise<any[]> {
    if (!this.client) throw new Error('Redis not connected')
    const result = await this.client.xRead({ key: stream, id: '0' }, { COUNT: count })
    return result || []
  }

  async xTrim(stream: string, maxlen: number = 1000): Promise<void> {
    if (!this.client) return
    await this.client.xTrim(stream, 'MAXLEN', maxlen)
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  async checkRateLimit(
    key: string,
    limit: number,
    window: number // seconds
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    if (!this.client) throw new Error('Redis not connected')

    const now = Date.now()
    const windowStart = now - window * 1000

    // Remove old entries
    await this.client.zRemRangeByScore(key, 0, windowStart)

    // Count current entries
    const count = await this.client.zCard(key)

    if (count < limit) {
      // Add new entry
      await this.client.zAdd(key, { score: now, value: `${now}-${Math.random()}` })
      await this.client.expire(key, window)
      return { allowed: true, remaining: limit - count - 1, resetAt: now + window * 1000 }
    }

    return { allowed: false, remaining: 0, resetAt: now + window * 1000 }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private async setNX(key: string, value: string, ttl: number): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected')
    const result = await this.client.setNX(key, value)
    if (result && ttl) await this.client.expire(key, ttl)
    return result
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0
  }

  getStats(): CacheStats {
    return { ...this.stats }
  }

  async flush(prefix?: string): Promise<void> {
    if (!this.client) return
    if (prefix) {
      const keys = await this.client.keys(`${prefix}:*`)
      if (keys.length > 0) await this.client.del(keys)
    } else {
      await this.client.flushDb()
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const redisCache = new RedisCacheClient()
export default redisCache
