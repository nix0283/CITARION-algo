/**
 * Signal Cache
 * In-memory and database persistence for signal deduplication
 */

import { db } from '../db';
import {
  SignalCacheEntry,
  SignalCacheConfig,
  SignalFingerprint,
  ProcessedSignal,
  ProcessResult,
  DEFAULT_CACHE_CONFIG,
} from './types';

/**
 * Signal Cache Manager
 * Manages in-memory cache with optional database persistence
 */
export class SignalCache {
  private cache: Map<string, SignalCacheEntry> = new Map();
  private config: SignalCacheConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<SignalCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Initialize the cache, optionally loading from database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.persistToDatabase) {
      await this.loadFromDatabase();
    }

    this.startCleanup();
    this.initialized = true;
  }

  /**
   * Load recent signals from database into cache
   */
  private async loadFromDatabase(): Promise<void> {
    try {
      const now = new Date();
      const records = await db.processedSignalRecord.findMany({
        where: {
          expiresAt: {
            gt: now,
          },
        },
        orderBy: {
          processedAt: 'desc',
        },
        take: this.config.maxEntries,
      });

      for (const record of records) {
        const entry: SignalCacheEntry = {
          fingerprint: {
            hash: record.signalHash,
            symbol: record.symbol,
            direction: record.direction as 'LONG' | 'SHORT',
            entryPrices: JSON.parse(record.entryPrices),
            timestamp: record.processedAt.getTime(),
          },
          result: {
            status: record.status as ProcessResult['status'],
            positionId: record.positionId ?? undefined,
            tradeId: record.tradeId ?? undefined,
            signalId: record.signalId ?? undefined,
            processedAt: record.processedAt,
          },
          cachedAt: record.createdAt,
          expiresAt: record.expiresAt,
          rawTextHash: record.rawTextHash ?? undefined,
        };

        this.cache.set(record.signalHash, entry);
      }

      console.log(`[SignalCache] Loaded ${records.length} signals from database`);
    } catch (error) {
      console.error('[SignalCache] Error loading from database:', error);
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Remove expired entries from cache
   */
  private cleanup(): void {
    const now = new Date();
    let removed = 0;

    for (const [hash, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(hash);
        removed++;
      }
    }

    // Also enforce max entries
    if (this.cache.size > this.config.maxEntries) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime());

      const toRemove = entries.slice(0, this.cache.size - this.config.maxEntries);
      for (const [hash] of toRemove) {
        this.cache.delete(hash);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[SignalCache] Cleaned up ${removed} expired entries`);
    }
  }

  /**
   * Get a cached signal by hash
   */
  get(hash: string): SignalCacheEntry | undefined {
    const entry = this.cache.get(hash);
    
    if (entry && entry.expiresAt <= new Date()) {
      this.cache.delete(hash);
      return undefined;
    }

    return entry;
  }

  /**
   * Check if a signal hash exists in cache
   */
  has(hash: string): boolean {
    const entry = this.get(hash);
    return entry !== undefined;
  }

  /**
   * Set a signal in cache
   */
  async set(
    fingerprint: SignalFingerprint,
    result: ProcessResult,
    ttl: number = this.config.defaultTTL,
    rawTextHash?: string
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl);

    const entry: SignalCacheEntry = {
      fingerprint,
      result,
      cachedAt: now,
      expiresAt,
      rawTextHash,
    };

    this.cache.set(fingerprint.hash, entry);

    // Persist to database
    if (this.config.persistToDatabase) {
      await this.persistToDatabase(entry);
    }
  }

  /**
   * Persist a cache entry to database
   */
  private async persistToDatabase(entry: SignalCacheEntry): Promise<void> {
    try {
      await db.processedSignalRecord.upsert({
        where: {
          signalHash: entry.fingerprint.hash,
        },
        create: {
          signalHash: entry.fingerprint.hash,
          symbol: entry.fingerprint.symbol,
          direction: entry.fingerprint.direction,
          entryPrices: JSON.stringify(entry.fingerprint.entryPrices),
          status: entry.result.status,
          positionId: entry.result.positionId,
          tradeId: entry.result.tradeId,
          signalId: entry.result.signalId,
          processedAt: entry.result.processedAt,
          expiresAt: entry.expiresAt,
          rawTextHash: entry.rawTextHash,
        },
        update: {
          status: entry.result.status,
          positionId: entry.result.positionId,
          tradeId: entry.result.tradeId,
          signalId: entry.result.signalId,
          expiresAt: entry.expiresAt,
        },
      });
    } catch (error) {
      console.error('[SignalCache] Error persisting to database:', error);
    }
  }

  /**
   * Find signals by symbol and direction
   */
  findBySymbolDirection(symbol: string, direction: 'LONG' | 'SHORT'): SignalCacheEntry[] {
    const results: SignalCacheEntry[] = [];

    for (const entry of this.cache.values()) {
      if (
        entry.fingerprint.symbol === symbol &&
        entry.fingerprint.direction === direction &&
        entry.expiresAt > new Date()
      ) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Find signals by raw text hash
   */
  findByRawTextHash(rawTextHash: string): SignalCacheEntry | undefined {
    for (const entry of this.cache.values()) {
      if (entry.rawTextHash === rawTextHash) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Find similar signals within a time window
   */
  findSimilar(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    entryPrices: number[],
    timeWindowMs: number,
    priceSlidingWindow: number
  ): SignalCacheEntry[] {
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindowMs);
    const results: SignalCacheEntry[] = [];

    for (const entry of this.cache.values()) {
      // Check symbol and direction
      if (entry.fingerprint.symbol !== symbol || entry.fingerprint.direction !== direction) {
        continue;
      }

      // Check time window
      if (entry.cachedAt < windowStart) {
        continue;
      }

      // Check if not expired
      if (entry.expiresAt <= now) {
        continue;
      }

      // Check price similarity
      if (this.arePricesSimilar(entry.fingerprint.entryPrices, entryPrices, priceSlidingWindow)) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Check if two sets of prices are similar within sliding window
   */
  private arePricesSimilar(
    prices1: number[],
    prices2: number[],
    slidingWindow: number
  ): boolean {
    if (prices1.length !== prices2.length) {
      return false;
    }

    for (let i = 0; i < prices1.length; i++) {
      const p1 = prices1[i];
      const p2 = prices2[i];
      const diff = Math.abs(p1 - p2) / Math.max(p1, p2);

      if (diff > slidingWindow) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all cache entries (for debugging)
   */
  getAll(): SignalCacheEntry[] {
    return Array.from(this.cache.values())
      .filter(entry => entry.expiresAt > new Date());
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxEntries: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    let oldest: Date | null = null;
    let newest: Date | null = null;

    for (const entry of this.cache.values()) {
      if (!oldest || entry.cachedAt < oldest) {
        oldest = entry.cachedAt;
      }
      if (!newest || entry.cachedAt > newest) {
        newest = entry.cachedAt;
      }
    }

    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Stop cleanup timer and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
    this.initialized = false;
  }

  /**
   * Delete a specific entry by hash
   */
  delete(hash: string): boolean {
    return this.cache.delete(hash);
  }

  /**
   * Get recent processed signals (for API)
   */
  async getRecentSignals(limit: number = 50): Promise<ProcessedSignal[]> {
    const entries = this.getAll()
      .sort((a, b) => b.cachedAt.getTime() - a.cachedAt.getTime())
      .slice(0, limit);

    return entries.map(entry => ({
      id: entry.fingerprint.hash,
      fingerprint: entry.fingerprint,
      processedAt: entry.result.processedAt,
      expiresAt: entry.expiresAt,
      positionId: entry.result.positionId,
      tradeId: entry.result.tradeId,
      signalId: entry.result.signalId,
      status: entry.result.status,
      rawTextHash: entry.rawTextHash,
    }));
  }
}

// Singleton instance
let cacheInstance: SignalCache | null = null;

/**
 * Get or create the singleton SignalCache instance
 */
export function getSignalCache(config?: Partial<SignalCacheConfig>): SignalCache {
  if (!cacheInstance) {
    cacheInstance = new SignalCache(config);
  }
  return cacheInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSignalCache(): void {
  if (cacheInstance) {
    cacheInstance.destroy();
    cacheInstance = null;
  }
}
