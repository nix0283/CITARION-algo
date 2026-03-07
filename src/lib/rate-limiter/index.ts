/**
 * CITARION Trading Platform
 * Rate Limiter Module - Redis-based with In-Memory Fallback
 * 
 * @module rate-limiter
 * @version 1.0.0
 * 
 * This module provides distributed rate limiting capabilities for the CITARION
 * trading platform, supporting multiple rate limiting strategies and graceful
 * degradation when Redis is unavailable.
 */

// ============================================================================
// MAIN EXPORTS
// ============================================================================

// Core class
export { RedisRateLimiter } from '../rate-limiter-redis'

// Types
export type {
  RateLimitConfig,
  RateLimitResult,
  RedisRateLimiterOptions,
} from '../rate-limiter-redis'

// Convenience functions
export {
  rateLimitByIp,
  rateLimitByUser,
  rateLimitByApiKey,
  rateLimitTrading,
  rateLimitMarket,
} from '../rate-limiter-redis'

// Middleware helper
export { createRateLimitMiddleware } from '../rate-limiter-redis'

// Default export
export { RedisRateLimiter as default } from '../rate-limiter-redis'

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * @example Basic usage
 * ```typescript
 * import { RedisRateLimiter } from '@/lib/rate-limiter'
 * 
 * const limiter = RedisRateLimiter.getInstance()
 * await limiter.connect()
 * 
 * const result = await limiter.checkLimit('user-123', 'trading')
 * 
 * if (!result.allowed) {
 *   console.log(`Rate limited. Retry after ${result.retryAfter}s`)
 * }
 * ```
 * 
 * @example Using convenience functions
 * ```typescript
 * import { rateLimitByIp, rateLimitByUser, rateLimitByApiKey } from '@/lib/rate-limiter'
 * 
 * // Rate limit by IP
 * const ipResult = await rateLimitByIp('192.168.1.1')
 * 
 * // Rate limit by user ID
 * const userResult = await rateLimitByUser('user-123')
 * 
 * // Rate limit by API key
 * const apiKeyResult = await rateLimitByApiKey('api-key-abc')
 * 
 * // Custom limits
 * const customResult = await rateLimitByIp('192.168.1.1', {
 *   maxRequests: 50,
 *   windowMs: 30000 // 30 seconds
 * })
 * ```
 * 
 * @example Next.js API route middleware
 * ```typescript
 * import { createRateLimitMiddleware } from '@/lib/rate-limiter'
 * import { NextResponse } from 'next/server'
 * 
 * const rateLimitMiddleware = createRateLimitMiddleware('trading', {
 *   identifierExtractor: async (req) => {
 *     // Extract user ID from auth header
 *     const authHeader = req.headers.get('authorization')
 *     return authHeader?.split(' ')[1] || 'anonymous'
 *   },
 *   onLimitReached: async (req, result) => {
 *     return NextResponse.json({
 *       error: 'Rate limit exceeded',
 *       retryAfter: result.retryAfter
 *     }, { status: 429 })
 *   }
 * })
 * 
 * export async function POST(request: Request) {
 *   // Check rate limit
 *   const limitResponse = await rateLimitMiddleware(request)
 *   if (limitResponse) return limitResponse
 *   
 *   // Process request...
 *   return NextResponse.json({ success: true })
 * }
 * ```
 * 
 * @example Multiple rate limiters (singleton pattern)
 * ```typescript
 * import { RedisRateLimiter } from '@/lib/rate-limiter'
 * 
 * // Different rate limiters for different purposes
 * const apiLimiter = RedisRateLimiter.getInstance('api')
 * const webhookLimiter = RedisRateLimiter.getInstance('webhook')
 * 
 * // Connect both
 * await Promise.all([
 *   apiLimiter.connect(),
 *   webhookLimiter.connect()
 * ])
 * ```
 * 
 * @example Custom configuration
 * ```typescript
 * import { RedisRateLimiter, type RateLimitConfig } from '@/lib/rate-limiter'
 * 
 * const limiter = RedisRateLimiter.getInstance()
 * 
 * // Set custom config
 * limiter.setConfig('custom', {
 *   windowMs: 60000,    // 1 minute window
 *   maxRequests: 100,   // 100 requests per minute
 *   keyPrefix: 'myapp:ratelimit:custom',
 *   skipFailedRequests: true,
 *   onLimitReached: (identifier, resetTime) => {
 *     console.log(`Rate limit reached for ${identifier}`)
 *   }
 * })
 * 
 * // Use custom config
 * const result = await limiter.checkLimit('user-123', 'custom')
 * ```
 */

// ============================================================================
// PRECONFIGURED INSTANCES
// ============================================================================

import { RedisRateLimiter } from '../rate-limiter-redis'

/**
 * Preconfigured rate limiter instances
 * These are lazy-loaded singletons
 */

let _apiRateLimiter: RedisRateLimiter | null = null
let _tradingRateLimiter: RedisRateLimiter | null = null
let _webhookRateLimiter: RedisRateLimiter | null = null

/**
 * Get API rate limiter instance
 */
export function getApiRateLimiter(): RedisRateLimiter {
  if (!_apiRateLimiter) {
    _apiRateLimiter = RedisRateLimiter.getInstance('api', {
      keyPrefix: 'citarion:api',
    })
  }
  return _apiRateLimiter
}

/**
 * Get trading rate limiter instance
 */
export function getTradingRateLimiter(): RedisRateLimiter {
  if (!_tradingRateLimiter) {
    _tradingRateLimiter = RedisRateLimiter.getInstance('trading', {
      keyPrefix: 'citarion:trading',
    })
  }
  return _tradingRateLimiter
}

/**
 * Get webhook rate limiter instance
 */
export function getWebhookRateLimiter(): RedisRateLimiter {
  if (!_webhookRateLimiter) {
    _webhookRateLimiter = RedisRateLimiter.getInstance('webhook', {
      keyPrefix: 'citarion:webhook',
    })
  }
  return _webhookRateLimiter
}

// ============================================================================
// INITIALIZATION HELPER
// ============================================================================

/**
 * Initialize all rate limiters with Redis connection
 * Call this at application startup
 */
export async function initializeRateLimiters(redisUrl?: string): Promise<void> {
  const limiters = [
    getApiRateLimiter(),
    getTradingRateLimiter(),
    getWebhookRateLimiter(),
  ]

  await Promise.all(limiters.map(limiter => limiter.connect(redisUrl)))
  
  console.log('[RateLimiter] All rate limiters initialized')
}

/**
 * Disconnect all rate limiters
 * Call this during graceful shutdown
 */
export async function shutdownRateLimiters(): Promise<void> {
  const limiters = [_apiRateLimiter, _tradingRateLimiter, _webhookRateLimiter]
    .filter((l): l is RedisRateLimiter => l !== null)

  await Promise.all(limiters.map(limiter => limiter.disconnect()))
  
  console.log('[RateLimiter] All rate limiters shut down')
}
