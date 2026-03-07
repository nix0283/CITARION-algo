/**
 * CITARION API Gateway
 * Stage 4.2 - Distributed Rate Limiter
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (identifier: string) => string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

// ============================================================================
// DISTRIBUTED RATE LIMITER
// ============================================================================

export class DistributedRateLimiter {
  private limits: Map<string, RateLimitConfig> = new Map();
  private counters: Map<string, { count: number; resetAt: number }> = new Map();

  constructor() {
    // Default limits
    this.limits.set('default', {
      windowMs: 60000,
      maxRequests: 100,
    });

    // Tenant-specific limits would be loaded from config
    this.limits.set('api:trade', {
      windowMs: 60000,
      maxRequests: 10,
    });

    this.limits.set('api:market', {
      windowMs: 1000,
      maxRequests: 20,
    });

    this.limits.set('api:analytics', {
      windowMs: 60000,
      maxRequests: 30,
    });

    // Clean up expired counters periodically
    setInterval(() => this.cleanup(), 60000);
  }

  // -------------------------------------------------------------------------
  // RATE LIMIT CHECK
  // -------------------------------------------------------------------------

  async check(
    identifier: string,
    limitKey: string = 'default'
  ): Promise<RateLimitResult> {
    const config = this.limits.get(limitKey) || this.limits.get('default')!;
    const key = `${limitKey}:${identifier}`;
    const now = Date.now();

    let entry = this.counters.get(key);

    if (!entry || entry.resetAt < now) {
      // Create new window
      entry = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      this.counters.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, config.maxRequests - entry.count);
    const allowed = entry.count <= config.maxRequests;

    return {
      allowed,
      remaining,
      resetAt: new Date(entry.resetAt),
      retryAfter: allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  // -------------------------------------------------------------------------
  // CONSUME TOKEN
  // -------------------------------------------------------------------------

  async consume(
    identifier: string,
    tokens: number = 1,
    limitKey: string = 'default'
  ): Promise<RateLimitResult> {
    const config = this.limits.get(limitKey) || this.limits.get('default')!;
    const key = `${limitKey}:${identifier}`;
    const now = Date.now();

    let entry = this.counters.get(key);

    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      this.counters.set(key, entry);
    }

    entry.count += tokens;

    const remaining = Math.max(0, config.maxRequests - entry.count);
    const allowed = entry.count <= config.maxRequests;

    return {
      allowed,
      remaining,
      resetAt: new Date(entry.resetAt),
      retryAfter: allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  // -------------------------------------------------------------------------
  // RESET LIMIT
  // -------------------------------------------------------------------------

  async reset(identifier: string, limitKey: string = 'default'): Promise<void> {
    const key = `${limitKey}:${identifier}`;
    this.counters.delete(key);
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  setLimit(key: string, config: RateLimitConfig): void {
    this.limits.set(key, config);
  }

  getLimit(key: string): RateLimitConfig | undefined {
    return this.limits.get(key);
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.counters) {
      if (entry.resetAt < now) {
        this.counters.delete(key);
      }
    }
  }
}

// ============================================================================
// TOKEN BUCKET RATE LIMITER
// ============================================================================

export class TokenBucketRateLimiter {
  private buckets: Map<
    string,
    { tokens: number; lastRefill: number }
  > = new Map();

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number, // tokens per second
    private readonly refillInterval: number = 1000 // ms
  ) {}

  async consume(
    key: string,
    tokens: number = 1
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.maxTokens,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens
    const elapsed = now - bucket.lastRefill;
    const refillAmount = (elapsed / this.refillInterval) * this.refillRate;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refillAmount);
    bucket.lastRefill = now;

    // Check if we have enough tokens
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return { allowed: true, remaining: Math.floor(bucket.tokens) };
    }

    return { allowed: false, remaining: 0 };
  }
}

// ============================================================================
// LEAKY BUCKET RATE LIMITER
// ============================================================================

export class LeakyBucketRateLimiter {
  private queues: Map<string, { queue: number; lastLeak: number }> = new Map();

  constructor(
    private readonly capacity: number,
    private readonly leakRate: number // requests per second
  ) {}

  async tryAcquire(key: string): Promise<boolean> {
    const now = Date.now();
    let bucket = this.queues.get(key);

    if (!bucket) {
      bucket = {
        queue: 0,
        lastLeak: now,
      };
      this.queues.set(key, bucket);
    }

    // Leak requests
    const elapsed = (now - bucket.lastLeak) / 1000;
    const leaked = elapsed * this.leakRate;
    bucket.queue = Math.max(0, bucket.queue - leaked);
    bucket.lastLeak = now;

    // Check if we can add to queue
    if (bucket.queue < this.capacity) {
      bucket.queue++;
      return true;
    }

    return false;
  }
}

// Singleton
export const rateLimiter = new DistributedRateLimiter();
