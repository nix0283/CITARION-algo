/**
 * CITARION Trading Platform
 * Redis-based Rate Limiter Module
 * 
 * Features:
 * - Distributed rate limiting with Redis
 * - Sliding window algorithm for precise rate control
 * - Multiple rate limit keys (IP, user, API key)
 * - Automatic key expiration
 * - Graceful fallback to in-memory when Redis unavailable
 * 
 * @author CITARION
 * @version 1.0.0
 */

import { createClient, RedisClientType } from 'redis'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for rate limiting
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number
  /** Maximum requests allowed within the window */
  maxRequests: number
  /** Key prefix for Redis storage */
  keyPrefix: string
  /** Skip failed requests (4xx/5xx responses) */
  skipFailedRequests?: boolean
  /** Skip successful requests (2xx responses) */
  skipSuccessfulRequests?: boolean
  /** Custom key generator function */
  keyGenerator?: (identifier: string) => string
  /** Handler called when rate limit is exceeded */
  onLimitReached?: (identifier: string, resetTime: Date) => void
}

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean
  /** Remaining requests in current window */
  remaining: number
  /** Time when the rate limit resets */
  resetTime: Date
  /** Seconds until reset (for Retry-After header) */
  retryAfter?: number
  /** Total requests made in current window */
  totalHits: number
}

/**
 * Redis connection options
 */
export interface RedisRateLimiterOptions {
  /** Redis connection URL */
  url?: string
  /** Key prefix for all rate limit keys */
  keyPrefix?: string
  /** Enable in-memory fallback when Redis unavailable */
  enableFallback?: boolean
  /** Custom Redis client (for sharing connections) */
  client?: RedisClientType
}

/**
 * In-memory storage entry for fallback
 */
interface MemoryEntry {
  timestamps: number[]
  lastCleanup: number
}

// ============================================================================
// LUA SCRIPTS FOR ATOMIC OPERATIONS
// ============================================================================

/**
 * Lua script for sliding window rate limiting
 * This ensures atomic operations in Redis
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local value = now .. '-' .. math.random()

-- Remove entries outside the window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- Count current entries
local current = redis.call('ZCARD', key)

if current < maxRequests then
  -- Add new entry
  redis.call('ZADD', key, now, value)
  redis.call('PEXPIRE', key, window)
  return {1, maxRequests - current - 1, now + window}
else
  -- Get oldest entry to calculate reset time
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetTime = now + window
  if #oldest > 0 then
    resetTime = tonumber(oldest[2]) + window
  end
  return {0, 0, resetTime}
end
`

/**
 * Lua script for getting remaining requests without incrementing
 */
const GET_REMAINING_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Remove entries outside the window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- Count current entries
local current = redis.call('ZCARD', key)

return {maxRequests - current, current}
`

// ============================================================================
// IN-MEMORY FALLBACK RATE LIMITER
// ============================================================================

/**
 * In-memory rate limiter for fallback when Redis is unavailable
 * Uses sliding window algorithm
 */
class InMemoryRateLimiter {
  private storage: Map<string, MemoryEntry> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  /**
   * Check rate limit using sliding window
   */
  checkLimit(
    identifier: string,
    config: RateLimitConfig
  ): RateLimitResult {
    const now = Date.now()
    const windowStart = now - config.windowMs
    const key = `${config.keyPrefix}:${identifier}`

    let entry = this.storage.get(key)

    if (!entry) {
      entry = { timestamps: [], lastCleanup: now }
      this.storage.set(key, entry)
    }

    // Remove timestamps outside the window (sliding window)
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart)

    const currentCount = entry.timestamps.length
    const allowed = currentCount < config.maxRequests

    if (allowed) {
      entry.timestamps.push(now)
    }

    const remaining = Math.max(0, config.maxRequests - entry.timestamps.length)
    const resetTime = new Date(
      entry.timestamps.length > 0
        ? entry.timestamps[0] + config.windowMs
        : now + config.windowMs
    )

    return {
      allowed,
      remaining: allowed ? remaining : 0,
      resetTime,
      retryAfter: allowed ? undefined : Math.ceil((resetTime.getTime() - now) / 1000),
      totalHits: entry.timestamps.length,
    }
  }

  /**
   * Record a request without checking limit
   */
  recordRequest(identifier: string, config: RateLimitConfig): void {
    const now = Date.now()
    const windowStart = now - config.windowMs
    const key = `${config.keyPrefix}:${identifier}`

    let entry = this.storage.get(key)

    if (!entry) {
      entry = { timestamps: [], lastCleanup: now }
      this.storage.set(key, entry)
    }

    // Remove old timestamps
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart)
    entry.timestamps.push(now)
  }

  /**
   * Get remaining requests
   */
  getRemaining(identifier: string, config: RateLimitConfig): number {
    const now = Date.now()
    const windowStart = now - config.windowMs
    const key = `${config.keyPrefix}:${identifier}`

    const entry = this.storage.get(key)
    if (!entry) return config.maxRequests

    const currentCount = entry.timestamps.filter(ts => ts > windowStart).length
    return Math.max(0, config.maxRequests - currentCount)
  }

  /**
   * Reset rate limit for identifier
   */
  reset(identifier: string, config: RateLimitConfig): void {
    const key = `${config.keyPrefix}:${identifier}`
    this.storage.delete(key)
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    this.storage.forEach((entry, key) => {
      const maxWindow = 3600000 // 1 hour max window
      const timestamps = entry.timestamps.filter(ts => ts > now - maxWindow)
      
      if (timestamps.length === 0) {
        this.storage.delete(key)
      } else {
        entry.timestamps = timestamps
      }
    })
  }

  /**
   * Destroy the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.storage.clear()
  }
}

// ============================================================================
// REDIS RATE LIMITER
// ============================================================================

/**
 * Redis-based Rate Limiter with sliding window algorithm
 * 
 * Features:
 * - Distributed rate limiting across multiple instances
 * - Atomic operations using Lua scripts
 * - Automatic fallback to in-memory when Redis unavailable
 * - Multiple rate limit configurations
 */
export class RedisRateLimiter {
  private client: RedisClientType | null = null
  private fallbackLimiter: InMemoryRateLimiter
  private connected: boolean = false
  private connecting: boolean = false
  private keyPrefix: string
  private enableFallback: boolean
  private scriptHashes: Map<string, string> = new Map()
  private configs: Map<string, RateLimitConfig> = new Map()
  private externalClient: boolean = false

  // Singleton instances
  private static instances: Map<string, RedisRateLimiter> = new Map()

  constructor(options: RedisRateLimiterOptions = {}) {
    this.keyPrefix = options.keyPrefix || 'citarion:ratelimit'
    this.enableFallback = options.enableFallback ?? true
    this.fallbackLimiter = new InMemoryRateLimiter()

    // Use provided client or create new one
    if (options.client) {
      this.client = options.client
      this.externalClient = true
      this.connected = true
    }

    // Initialize default configurations
    this.initializeDefaultConfigs()
  }

  /**
   * Get singleton instance
   */
  static getInstance(name: string = 'default', options?: RedisRateLimiterOptions): RedisRateLimiter {
    if (!RedisRateLimiter.instances.has(name)) {
      RedisRateLimiter.instances.set(name, new RedisRateLimiter(options))
    }
    return RedisRateLimiter.instances.get(name)!
  }

  /**
   * Connect to Redis
   */
  async connect(url?: string): Promise<void> {
    if (this.externalClient || this.connecting) return

    const redisUrl = url || process.env.REDIS_URL || 'redis://localhost:6379'
    this.connecting = true

    try {
      this.client = createClient({ url: redisUrl })

      this.client.on('error', (err) => {
        console.error('[RedisRateLimiter] Redis error:', err.message)
        this.connected = false
      })

      this.client.on('connect', () => {
        this.connected = true
        console.log('[RedisRateLimiter] Connected to Redis')
      })

      this.client.on('disconnect', () => {
        this.connected = false
        console.log('[RedisRateLimiter] Disconnected from Redis')
      })

      await this.client.connect()

      // Load Lua scripts
      await this.loadScripts()

      this.connecting = false
    } catch (error) {
      console.error('[RedisRateLimiter] Connection failed:', error)
      this.connecting = false
      this.connected = false

      if (!this.enableFallback) {
        throw error
      }
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client && !this.externalClient) {
      await this.client.quit()
      this.client = null
      this.connected = false
    }
    this.fallbackLimiter.destroy()
  }

  /**
   * Check if Redis is available
   */
  isRedisAvailable(): boolean {
    return this.connected && this.client !== null
  }

  // -------------------------------------------------------------------------
  // CORE RATE LIMIT METHODS
  // -------------------------------------------------------------------------

  /**
   * Check rate limit and record request if allowed
   */
  async checkLimit(
    identifier: string,
    configKey: string = 'default'
  ): Promise<RateLimitResult> {
    const config = this.getConfig(configKey)
    return this.checkLimitWithConfig(identifier, config)
  }

  /**
   * Check rate limit with specific config
   */
  private async checkLimitWithConfig(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    // Use fallback if Redis unavailable
    if (!this.isRedisAvailable()) {
      if (this.enableFallback) {
        return this.fallbackLimiter.checkLimit(identifier, config)
      }
      // If fallback disabled, allow all requests
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: new Date(Date.now() + config.windowMs),
        totalHits: 0,
      }
    }

    try {
      const key = this.buildKey(identifier, config)
      const now = Date.now()

      // Execute Lua script for atomic sliding window
      const result = await this.client!.evalSha(
        this.scriptHashes.get('slidingWindow')!,
        {
          keys: [key],
          arguments: [
            config.windowMs.toString(),
            config.maxRequests.toString(),
            now.toString(),
          ],
        }
      ) as [number, number, number]

      const [allowed, remaining, resetTime] = result

      const rateLimitResult: RateLimitResult = {
        allowed: allowed === 1,
        remaining,
        resetTime: new Date(resetTime),
        totalHits: config.maxRequests - remaining,
      }

      if (!rateLimitResult.allowed) {
        rateLimitResult.retryAfter = Math.ceil(
          (resetTime - now) / 1000
        )
        config.onLimitReached?.(identifier, rateLimitResult.resetTime)
      }

      return rateLimitResult
    } catch (error) {
      console.error('[RedisRateLimiter] Redis error, using fallback:', error)
      
      if (this.enableFallback) {
        return this.fallbackLimiter.checkLimit(identifier, config)
      }

      // Allow request on error if fallback disabled
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: new Date(Date.now() + config.windowMs),
        totalHits: 0,
      }
    }
  }

  /**
   * Record a request without checking limit
   */
  async recordRequest(
    identifier: string,
    configKey: string = 'default'
  ): Promise<void> {
    const config = this.getConfig(configKey)

    if (!this.isRedisAvailable()) {
      if (this.enableFallback) {
        this.fallbackLimiter.recordRequest(identifier, config)
      }
      return
    }

    try {
      const key = this.buildKey(identifier, config)
      const now = Date.now()
      const value = `${now}-${Math.random().toString(36).slice(2)}`

      // Add timestamp to sorted set
      await this.client!.zAdd(key, { score: now, value })
      await this.client!.pExpire(key, config.windowMs)
    } catch (error) {
      console.error('[RedisRateLimiter] Error recording request:', error)
      
      if (this.enableFallback) {
        this.fallbackLimiter.recordRequest(identifier, config)
      }
    }
  }

  /**
   * Get remaining requests without incrementing
   */
  async getRemaining(
    identifier: string,
    configKey: string = 'default'
  ): Promise<number> {
    const config = this.getConfig(configKey)

    if (!this.isRedisAvailable()) {
      if (this.enableFallback) {
        return this.fallbackLimiter.getRemaining(identifier, config)
      }
      return config.maxRequests
    }

    try {
      const key = this.buildKey(identifier, config)
      const now = Date.now()
      const windowStart = now - config.windowMs

      // Remove old entries and count current
      await this.client!.zRemRangeByScore(key, 0, windowStart)
      const count = await this.client!.zCard(key)

      return Math.max(0, config.maxRequests - count)
    } catch (error) {
      console.error('[RedisRateLimiter] Error getting remaining:', error)
      
      if (this.enableFallback) {
        return this.fallbackLimiter.getRemaining(identifier, config)
      }
      return config.maxRequests
    }
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(
    identifier: string,
    configKey: string = 'default'
  ): Promise<void> {
    const config = this.getConfig(configKey)

    if (!this.isRedisAvailable()) {
      if (this.enableFallback) {
        this.fallbackLimiter.reset(identifier, config)
      }
      return
    }

    try {
      const key = this.buildKey(identifier, config)
      await this.client!.del(key)
    } catch (error) {
      console.error('[RedisRateLimiter] Error resetting:', error)
      
      if (this.enableFallback) {
        this.fallbackLimiter.reset(identifier, config)
      }
    }
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Set a rate limit configuration
   */
  setConfig(key: string, config: Partial<RateLimitConfig> & { windowMs: number; maxRequests: number }): void {
    this.configs.set(key, {
      keyPrefix: this.keyPrefix,
      ...config,
    })
  }

  /**
   * Get a rate limit configuration
   */
  getConfig(key: string): RateLimitConfig {
    return this.configs.get(key) || this.configs.get('default')!
  }

  /**
   * Initialize default configurations
   */
  private initializeDefaultConfigs(): void {
    // Default configuration
    this.configs.set('default', {
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      keyPrefix: this.keyPrefix,
    })

    // IP-based rate limiting (more lenient)
    this.configs.set('ip', {
      windowMs: 60000, // 1 minute
      maxRequests: 200,
      keyPrefix: `${this.keyPrefix}:ip`,
    })

    // User-based rate limiting
    this.configs.set('user', {
      windowMs: 60000, // 1 minute
      maxRequests: 300,
      keyPrefix: `${this.keyPrefix}:user`,
    })

    // API key rate limiting (most lenient)
    this.configs.set('apiKey', {
      windowMs: 60000, // 1 minute
      maxRequests: 1000,
      keyPrefix: `${this.keyPrefix}:apikey`,
    })

    // Trading API (strict)
    this.configs.set('trading', {
      windowMs: 60000, // 1 minute
      maxRequests: 30,
      keyPrefix: `${this.keyPrefix}:trading`,
    })

    // Market data API
    this.configs.set('market', {
      windowMs: 1000, // 1 second
      maxRequests: 20,
      keyPrefix: `${this.keyPrefix}:market`,
    })

    // Analytics API
    this.configs.set('analytics', {
      windowMs: 60000, // 1 minute
      maxRequests: 50,
      keyPrefix: `${this.keyPrefix}:analytics`,
    })

    // Webhook endpoints
    this.configs.set('webhook', {
      windowMs: 60000, // 1 minute
      maxRequests: 500,
      keyPrefix: `${this.keyPrefix}:webhook`,
    })
  }

  // -------------------------------------------------------------------------
  // UTILITY METHODS
  // -------------------------------------------------------------------------

  /**
   * Build Redis key for rate limit
   */
  private buildKey(identifier: string, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(identifier)
    }
    return `${config.keyPrefix}:${identifier}`
  }

  /**
   * Load Lua scripts into Redis
   */
  private async loadScripts(): Promise<void> {
    if (!this.client) return

    try {
      const slidingWindowHash = await this.client.scriptLoad(SLIDING_WINDOW_SCRIPT)
      this.scriptHashes.set('slidingWindow', slidingWindowHash)

      const getRemainingHash = await this.client.scriptLoad(GET_REMAINING_SCRIPT)
      this.scriptHashes.set('getRemaining', getRemainingHash)

      console.log('[RedisRateLimiter] Lua scripts loaded')
    } catch (error) {
      console.error('[RedisRateLimiter] Failed to load scripts:', error)
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

// Default rate limiter instance
let defaultRateLimiter: RedisRateLimiter | null = null

/**
 * Get or create default rate limiter instance
 */
function getRateLimiter(): RedisRateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = RedisRateLimiter.getInstance()
  }
  return defaultRateLimiter
}

/**
 * Rate limit by IP address
 */
export async function rateLimitByIp(
  ip: string,
  options?: { maxRequests?: number; windowMs?: number }
): Promise<RateLimitResult> {
  const limiter = getRateLimiter()
  
  if (options?.maxRequests && options?.windowMs) {
    const configKey = `ip:${ip}:${Date.now()}`
    limiter.setConfig(configKey, {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      keyPrefix: 'citarion:ratelimit:ip',
    })
    return limiter.checkLimit(ip, configKey)
  }
  
  return limiter.checkLimit(ip, 'ip')
}

/**
 * Rate limit by user ID
 */
export async function rateLimitByUser(
  userId: string,
  options?: { maxRequests?: number; windowMs?: number }
): Promise<RateLimitResult> {
  const limiter = getRateLimiter()
  
  if (options?.maxRequests && options?.windowMs) {
    const configKey = `user:${userId}:${Date.now()}`
    limiter.setConfig(configKey, {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      keyPrefix: 'citarion:ratelimit:user',
    })
    return limiter.checkLimit(userId, configKey)
  }
  
  return limiter.checkLimit(userId, 'user')
}

/**
 * Rate limit by API key
 */
export async function rateLimitByApiKey(
  apiKey: string,
  options?: { maxRequests?: number; windowMs?: number }
): Promise<RateLimitResult> {
  const limiter = getRateLimiter()
  
  if (options?.maxRequests && options?.windowMs) {
    const configKey = `apikey:${apiKey}:${Date.now()}`
    limiter.setConfig(configKey, {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      keyPrefix: 'citarion:ratelimit:apikey',
    })
    return limiter.checkLimit(apiKey, configKey)
  }
  
  return limiter.checkLimit(apiKey, 'apiKey')
}

/**
 * Rate limit for trading operations
 */
export async function rateLimitTrading(
  identifier: string,
  options?: { maxRequests?: number; windowMs?: number }
): Promise<RateLimitResult> {
  const limiter = getRateLimiter()
  
  if (options?.maxRequests && options?.windowMs) {
    const configKey = `trading:${identifier}:${Date.now()}`
    limiter.setConfig(configKey, {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      keyPrefix: 'citarion:ratelimit:trading',
    })
    return limiter.checkLimit(identifier, configKey)
  }
  
  return limiter.checkLimit(identifier, 'trading')
}

/**
 * Rate limit for market data
 */
export async function rateLimitMarket(
  identifier: string,
  options?: { maxRequests?: number; windowMs?: number }
): Promise<RateLimitResult> {
  const limiter = getRateLimiter()
  
  if (options?.maxRequests && options?.windowMs) {
    const configKey = `market:${identifier}:${Date.now()}`
    limiter.setConfig(configKey, {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      keyPrefix: 'citarion:ratelimit:market',
    })
    return limiter.checkLimit(identifier, configKey)
  }
  
  return limiter.checkLimit(identifier, 'market')
}

// ============================================================================
// EXPRESS/Next.js MIDDLEWARE HELPER
// ============================================================================

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(
  configKey: string = 'default',
  options?: {
    identifierExtractor?: (req: Request) => string | Promise<string>
    onLimitReached?: (req: Request, result: RateLimitResult) => Response | Promise<Response>
  }
) {
  const limiter = getRateLimiter()

  return async (request: Request): Promise<Response | null> => {
    // Extract identifier
    let identifier: string
    
    if (options?.identifierExtractor) {
      identifier = await options.identifierExtractor(request)
    } else {
      // Default: use IP from headers or connection
      identifier = 
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        'unknown'
    }

    const result = await limiter.checkLimit(identifier, configKey)

    // Set rate limit headers
    const headers = new Headers({
      'X-RateLimit-Limit': limiter.getConfig(configKey).maxRequests.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetTime.toISOString(),
    })

    if (!result.allowed) {
      headers.set('Retry-After', result.retryAfter?.toString() || '60')

      if (options?.onLimitReached) {
        return options.onLimitReached(request, result)
      }

      // Default response
      const responseHeaders = new Headers(headers)
      responseHeaders.set('Content-Type', 'application/json')
      
      return new Response(
        JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
        }),
        {
          status: 429,
          headers: responseHeaders,
        }
      )
    }

    return null // Continue to next handler
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default RedisRateLimiter
