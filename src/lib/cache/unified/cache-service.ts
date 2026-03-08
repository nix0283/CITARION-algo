/**
 * Unified Cache Service
 * 
 * Provides a unified caching layer for CITARION using Redis.
 * Caches prices, positions, tickers, and other frequently accessed data.
 * 
 * Features:
 * - Price caching with automatic expiry
 * - Position caching for fast lookups
 * - Orderbook caching
 * - Ticker caching
 * - Cache invalidation strategies
 * - Fallback to in-memory cache when Redis is unavailable
 */

import { redisCache } from '@/lib/cache/redis-client';

// ============================================================================
// TYPES
// ============================================================================

export interface CachedPrice {
  symbol: string;
  exchange: string;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  timestamp: number;
}

export interface CachedPosition {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  amount: number;
  avgEntryPrice: number;
  currentPrice?: number;
  unrealizedPnl: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  timestamp: number;
}

export interface CachedTicker {
  symbol: string;
  exchange: string;
  lastPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface CacheConfig {
  priceTTL: number;        // seconds
  positionTTL: number;     // seconds
  tickerTTL: number;       // seconds
  orderbookTTL: number;    // seconds
  enableFallback: boolean; // use in-memory when Redis unavailable
}

// ============================================================================
// IN-MEMORY FALLBACK CACHE
// ============================================================================

class MemoryCache {
  private cache: Map<string, { value: unknown; expiry: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  deletePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// ============================================================================
// UNIFIED CACHE SERVICE
// ============================================================================

class UnifiedCacheService {
  private config: CacheConfig = {
    priceTTL: 60,          // 1 minute
    positionTTL: 30,       // 30 seconds
    tickerTTL: 10,         // 10 seconds
    orderbookTTL: 5,       // 5 seconds
    enableFallback: true,
  };

  private memoryCache: MemoryCache;
  private redisAvailable: boolean = false;

  constructor() {
    this.memoryCache = new MemoryCache();
    this.checkRedisConnection();
  }

  /**
   * Check Redis connection status
   */
  private async checkRedisConnection(): Promise<void> {
    try {
      this.redisAvailable = redisCache.isConnected();
      if (!this.redisAvailable && this.config.enableFallback) {
        console.log('⚠️ Redis not available, using in-memory cache fallback');
      }
    } catch {
      this.redisAvailable = false;
    }
  }

  /**
   * Configure cache settings
   */
  configure(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================================
  // PRICE CACHING
  // ============================================================================

  /**
   * Cache a single price
   */
  async cachePrice(
    symbol: string,
    exchange: string,
    price: number,
    bidPrice?: number,
    askPrice?: number
  ): Promise<void> {
    const cachedPrice: CachedPrice = {
      symbol,
      exchange,
      price,
      bidPrice,
      askPrice,
      timestamp: Date.now(),
    };

    const key = `price:${exchange}:${symbol}`;

    if (this.redisAvailable) {
      try {
        await redisCache.set(key, cachedPrice, { ttl: this.config.priceTTL });
      } catch {
        this.memoryCache.set(key, cachedPrice, this.config.priceTTL);
      }
    } else if (this.config.enableFallback) {
      this.memoryCache.set(key, cachedPrice, this.config.priceTTL);
    }
  }

  /**
   * Cache multiple prices at once
   */
  async cachePrices(
    prices: Array<{
      symbol: string;
      exchange: string;
      price: number;
      bidPrice?: number;
      askPrice?: number;
    }>
  ): Promise<void> {
    for (const p of prices) {
      await this.cachePrice(p.symbol, p.exchange, p.price, p.bidPrice, p.askPrice);
    }
  }

  /**
   * Get cached price
   */
  async getPrice(symbol: string, exchange: string): Promise<CachedPrice | null> {
    const key = `price:${exchange}:${symbol}`;

    if (this.redisAvailable) {
      try {
        return await redisCache.get<CachedPrice>(key);
      } catch {
        // Fallback to memory cache
      }
    }

    return this.memoryCache.get<CachedPrice>(key);
  }

  /**
   * Get multiple cached prices
   */
  async getPrices(
    symbols: string[],
    exchange: string
  ): Promise<Map<string, CachedPrice>> {
    const result = new Map<string, CachedPrice>();

    for (const symbol of symbols) {
      const price = await this.getPrice(symbol, exchange);
      if (price) {
        result.set(symbol, price);
      }
    }

    return result;
  }

  // ============================================================================
  // POSITION CACHING
  // ============================================================================

  /**
   * Cache a position
   */
  async cachePosition(
    accountId: string,
    position: CachedPosition
  ): Promise<void> {
    const key = `position:${accountId}:${position.id}`;
    const indexKey = `positions:${accountId}`;

    if (this.redisAvailable) {
      try {
        await redisCache.set(key, position, { ttl: this.config.positionTTL });
        // Add to index
        await redisCache.hSet(indexKey, position.id, position.symbol);
      } catch {
        this.memoryCache.set(key, position, this.config.positionTTL);
      }
    } else if (this.config.enableFallback) {
      this.memoryCache.set(key, position, this.config.positionTTL);
    }
  }

  /**
   * Cache multiple positions
   */
  async cachePositions(accountId: string, positions: CachedPosition[]): Promise<void> {
    for (const position of positions) {
      await this.cachePosition(accountId, position);
    }
  }

  /**
   * Get cached position
   */
  async getPosition(accountId: string, positionId: string): Promise<CachedPosition | null> {
    const key = `position:${accountId}:${positionId}`;

    if (this.redisAvailable) {
      try {
        return await redisCache.get<CachedPosition>(key);
      } catch {
        // Fallback
      }
    }

    return this.memoryCache.get<CachedPosition>(key);
  }

  /**
   * Get all cached positions for an account
   */
  async getPositions(accountId: string): Promise<CachedPosition[]> {
    const positions: CachedPosition[] = [];

    if (this.redisAvailable) {
      try {
        const index = await redisCache.hGetAll<string>(`positions:${accountId}`);
        for (const positionId of Object.keys(index)) {
          const position = await this.getPosition(accountId, positionId);
          if (position) {
            positions.push(position);
          }
        }
      } catch {
        // Fallback
      }
    }

    return positions;
  }

  /**
   * Invalidate position cache
   */
  async invalidatePosition(accountId: string, positionId: string): Promise<void> {
    const key = `position:${accountId}:${positionId}`;
    const indexKey = `positions:${accountId}`;

    if (this.redisAvailable) {
      try {
        await redisCache.delete(key);
        await redisCache.hDel(indexKey, positionId);
      } catch {
        // Ignore
      }
    }

    this.memoryCache.delete(key);
  }

  /**
   * Invalidate all positions for an account
   */
  async invalidatePositions(accountId: string): Promise<void> {
    if (this.redisAvailable) {
      try {
        await redisCache.flush(`position:${accountId}`);
        await redisCache.delete(`positions:${accountId}`);
      } catch {
        // Ignore
      }
    }

    this.memoryCache.deletePattern(`position:${accountId}:*`);
  }

  // ============================================================================
  // TICKER CACHING
  // ============================================================================

  /**
   * Cache ticker data
   */
  async cacheTicker(
    symbol: string,
    exchange: string,
    ticker: Omit<CachedTicker, 'symbol' | 'exchange' | 'timestamp'>
  ): Promise<void> {
    const cachedTicker: CachedTicker = {
      ...ticker,
      symbol,
      exchange,
      timestamp: Date.now(),
    };

    const key = `ticker:${exchange}:${symbol}`;

    if (this.redisAvailable) {
      try {
        await redisCache.set(key, cachedTicker, { ttl: this.config.tickerTTL });
      } catch {
        this.memoryCache.set(key, cachedTicker, this.config.tickerTTL);
      }
    } else if (this.config.enableFallback) {
      this.memoryCache.set(key, cachedTicker, this.config.tickerTTL);
    }
  }

  /**
   * Get cached ticker
   */
  async getTicker(symbol: string, exchange: string): Promise<CachedTicker | null> {
    const key = `ticker:${exchange}:${symbol}`;

    if (this.redisAvailable) {
      try {
        return await redisCache.get<CachedTicker>(key);
      } catch {
        // Fallback
      }
    }

    return this.memoryCache.get<CachedTicker>(key);
  }

  // ============================================================================
  // ORDERBOOK CACHING
  // ============================================================================

  /**
   * Cache orderbook
   */
  async cacheOrderbook(
    symbol: string,
    exchange: string,
    orderbook: { bids: [number, number][]; asks: [number, number][] }
  ): Promise<void> {
    const key = `orderbook:${exchange}:${symbol}`;

    if (this.redisAvailable) {
      try {
        await redisCache.set(key, orderbook, { ttl: this.config.orderbookTTL });
      } catch {
        this.memoryCache.set(key, orderbook, this.config.orderbookTTL);
      }
    } else if (this.config.enableFallback) {
      this.memoryCache.set(key, orderbook, this.config.orderbookTTL);
    }
  }

  /**
   * Get cached orderbook
   */
  async getOrderbook(
    symbol: string,
    exchange: string
  ): Promise<{ bids: [number, number][]; asks: [number, number][] } | null> {
    const key = `orderbook:${exchange}:${symbol}`;

    if (this.redisAvailable) {
      try {
        return await redisCache.get<{ bids: [number, number][]; asks: [number, number][] }>(key);
      } catch {
        // Fallback
      }
    }

    return this.memoryCache.get<{ bids: [number, number][]; asks: [number, number][] }>(key);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get or set with fetcher
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    // Try to get from cache
    if (this.redisAvailable) {
      try {
        const cached = await redisCache.get<T>(key);
        if (cached !== null) {
          return cached;
        }
      } catch {
        // Ignore
      }
    } else {
      const cached = this.memoryCache.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    }

    // Fetch new value
    const value = await fetcher();

    // Cache it
    if (this.redisAvailable) {
      try {
        await redisCache.set(key, value, { ttl: ttlSeconds });
      } catch {
        // Ignore
      }
    } else if (this.config.enableFallback) {
      this.memoryCache.set(key, value, ttlSeconds);
    }

    return value;
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;

    if (this.redisAvailable) {
      try {
        await redisCache.flush(pattern);
        count = 1; // Redis doesn't return count
      } catch {
        // Ignore
      }
    }

    count += this.memoryCache.deletePattern(pattern);
    return count;
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    if (this.redisAvailable) {
      try {
        await redisCache.flush();
      } catch {
        // Ignore
      }
    }

    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { redis: { available: boolean; stats?: ReturnType<typeof redisCache.getStats> } } {
    return {
      redis: {
        available: this.redisAvailable,
        stats: this.redisAvailable ? redisCache.getStats() : undefined,
      },
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.memoryCache.destroy();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const unifiedCache = new UnifiedCacheService();
export default unifiedCache;
