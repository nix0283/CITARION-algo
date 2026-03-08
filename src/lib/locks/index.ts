/**
 * Distributed Lock System
 * 
 * Provides distributed locking to prevent race conditions in bot processing.
 * Supports both Redis-based (production) and in-memory (development) locks.
 * 
 * Usage:
 * ```typescript
 * import { acquireBotLock, releaseBotLock, withBotLock } from '@/lib/locks';
 * 
 * // Simple usage
 * const lock = await acquireBotLock('grid', 'bot-123');
 * if (lock.acquired) {
 *   try {
 *     // Process bot...
 *   } finally {
 *     await releaseBotLock('grid', 'bot-123', lock.holder);
 *   }
 * }
 * 
 * // With auto-release
 * const result = await withBotLock('dca', 'bot-456', async () => {
 *   // Process bot...
 *   return { success: true };
 * });
 * ```
 */

// ==================== TYPES ====================

export interface DistributedLock {
  acquire(key: string, ttl?: number): Promise<boolean>;
  release(key: string): Promise<boolean>;
  extend(key: string, ttl?: number): Promise<boolean>;
  isLocked(key: string): Promise<boolean>;
}

export interface LockResult {
  acquired: boolean;
  holder?: string;
  attempts: number;
}

export interface BotLockOptions {
  ttl?: number;
  maxRetries?: number;
  holder?: string;
}

export type BotType = 'grid' | 'dca' | 'bb' | 'vision' | 'orion' | 'argus' | 'range' | 'logos';

// ==================== IMPORTS ====================

import { MemoryLock, getMemoryLock } from './memory-lock';
import { DistributedLock as RedisLock, getDistributedLock, initializeDistributedLock } from './distributed-lock';
import { redisCache } from '@/lib/cache/redis-client';

// ==================== CONFIGURATION ====================

const DEFAULT_TTL = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 100;
const MAX_RETRY_DELAY = 5000;

// ==================== LOCK PROVIDER ====================

let lockProvider: 'redis' | 'memory' | null = null;
let redisLock: RedisLock | null = null;
let memoryLock: MemoryLock | null = null;

/**
 * Initialize the lock provider
 * Automatically detects Redis availability
 */
export async function initializeLockProvider(): Promise<'redis' | 'memory'> {
  if (lockProvider) {
    return lockProvider;
  }
  
  // Try to use Redis
  try {
    if (!redisCache.isConnected()) {
      await redisCache.connect();
    }
    
    if (redisCache.isConnected()) {
      redisLock = getDistributedLock();
      await redisLock.connect();
      
      if (redisLock.isConnected()) {
        lockProvider = 'redis';
        console.log('[LockProvider] Using Redis-based distributed locks');
        return 'redis';
      }
    }
  } catch (error) {
    console.warn('[LockProvider] Redis not available, falling back to memory locks:', error);
  }
  
  // Fall back to memory locks
  memoryLock = getMemoryLock();
  lockProvider = 'memory';
  console.log('[LockProvider] Using in-memory locks (single-instance mode)');
  return 'memory';
}

/**
 * Get the current lock provider
 */
export function getLockProvider(): 'redis' | 'memory' {
  return lockProvider || 'memory';
}

/**
 * Check if using Redis locks
 */
export function isRedisLock(): boolean {
  return lockProvider === 'redis' && redisLock?.isConnected() === true;
}

// ==================== BOT LOCK FUNCTIONS ====================

/**
 * Generate a lock key for a bot
 * Format: bot:{botType}:{botId}
 */
export function getBotLockKey(botType: BotType, botId: string): string {
  return `bot:${botType}:${botId}`;
}

/**
 * Acquire a lock for a specific bot
 */
export async function acquireBotLock(
  botType: BotType,
  botId: string,
  options?: BotLockOptions
): Promise<LockResult> {
  const key = getBotLockKey(botType, botId);
  const ttl = options?.ttl || DEFAULT_TTL;
  
  // Ensure provider is initialized
  if (!lockProvider) {
    await initializeLockProvider();
  }
  
  // Use Redis lock if available
  if (isRedisLock() && redisLock) {
    return redisLock.acquireWithRetry(key, ttl, {
      maxRetries: options?.maxRetries ?? MAX_RETRY_ATTEMPTS,
      initialDelay: RETRY_DELAY,
      maxDelay: MAX_RETRY_DELAY,
      holder: options?.holder,
    });
  }
  
  // Use memory lock
  if (memoryLock) {
    return memoryLock.acquireWithRetry(key, ttl, {
      maxRetries: options?.maxRetries ?? MAX_RETRY_ATTEMPTS,
      initialDelay: RETRY_DELAY,
      maxDelay: MAX_RETRY_DELAY,
      holder: options?.holder,
    });
  }
  
  // Fallback - initialize memory lock
  memoryLock = getMemoryLock();
  return memoryLock.acquireWithRetry(key, ttl, {
    maxRetries: options?.maxRetries ?? MAX_RETRY_ATTEMPTS,
    initialDelay: RETRY_DELAY,
    maxDelay: MAX_RETRY_DELAY,
    holder: options?.holder,
  });
}

/**
 * Release a lock for a specific bot
 */
export async function releaseBotLock(
  botType: BotType,
  botId: string,
  holder: string
): Promise<boolean> {
  const key = getBotLockKey(botType, botId);
  
  if (isRedisLock() && redisLock) {
    return redisLock.release(key, holder);
  }
  
  if (memoryLock) {
    return memoryLock.release(key, holder);
  }
  
  return false;
}

/**
 * Extend a lock for a specific bot
 */
export async function extendBotLock(
  botType: BotType,
  botId: string,
  holder: string,
  ttl?: number
): Promise<boolean> {
  const key = getBotLockKey(botType, botId);
  
  if (isRedisLock() && redisLock) {
    return redisLock.extend(key, ttl || DEFAULT_TTL, holder);
  }
  
  if (memoryLock) {
    return memoryLock.extend(key, ttl || DEFAULT_TTL, holder);
  }
  
  return false;
}

/**
 * Check if a bot is currently locked
 */
export async function isBotLocked(botType: BotType, botId: string): Promise<boolean> {
  const key = getBotLockKey(botType, botId);
  
  if (isRedisLock() && redisLock) {
    return redisLock.isLocked(key);
  }
  
  if (memoryLock) {
    return memoryLock.isLocked(key);
  }
  
  return false;
}

/**
 * Execute a function with a bot lock
 * Automatically acquires lock, runs function, and releases lock
 */
export async function withBotLock<T>(
  botType: BotType,
  botId: string,
  fn: () => Promise<T>,
  options?: BotLockOptions
): Promise<{ success: boolean; result?: T; error?: string }> {
  const key = getBotLockKey(botType, botId);
  const ttl = options?.ttl || DEFAULT_TTL;
  
  // Ensure provider is initialized
  if (!lockProvider) {
    await initializeLockProvider();
  }
  
  if (isRedisLock() && redisLock) {
    return redisLock.withLock(key, ttl, fn, {
      maxRetries: options?.maxRetries,
      holder: options?.holder,
    });
  }
  
  if (memoryLock) {
    return memoryLock.withLock(key, ttl, fn, {
      maxRetries: options?.maxRetries,
      holder: options?.holder,
    });
  }
  
  // Fallback - just run the function
  try {
    const result = await fn();
    return { success: true, result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Execute a function with a bot lock and auto-extend for long-running operations
 */
export async function withBotLockAutoExtend<T>(
  botType: BotType,
  botId: string,
  fn: (extend: () => Promise<void>) => Promise<T>,
  options?: BotLockOptions & { extendInterval?: number }
): Promise<{ success: boolean; result?: T; error?: string }> {
  const key = getBotLockKey(botType, botId);
  const ttl = options?.ttl || DEFAULT_TTL;
  
  // Ensure provider is initialized
  if (!lockProvider) {
    await initializeLockProvider();
  }
  
  if (isRedisLock() && redisLock) {
    return redisLock.withLockAndAutoExtend(key, ttl, fn, {
      maxRetries: options?.maxRetries,
      holder: options?.holder,
      extendInterval: options?.extendInterval,
    });
  }
  
  // Memory lock doesn't support auto-extend, use regular withLock
  if (memoryLock) {
    return memoryLock.withLock(key, ttl, fn as () => Promise<T>, {
      maxRetries: options?.maxRetries,
      holder: options?.holder,
    });
  }
  
  // Fallback - just run the function
  try {
    const result = await fn(async () => { /* no-op */ });
    return { success: true, result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ==================== BATCH OPERATIONS ====================

/**
 * Acquire locks for multiple bots
 * Returns map of botId -> lock result
 */
export async function acquireMultipleBotLocks(
  botType: BotType,
  botIds: string[],
  options?: BotLockOptions
): Promise<Map<string, LockResult>> {
  const results = new Map<string, LockResult>();
  
  // Acquire locks in parallel
  const lockPromises = botIds.map(async (botId) => {
    const result = await acquireBotLock(botType, botId, options);
    results.set(botId, result);
    return { botId, result };
  });
  
  await Promise.all(lockPromises);
  return results;
}

/**
 * Release locks for multiple bots
 */
export async function releaseMultipleBotLocks(
  botType: BotType,
  locks: Map<string, string> // botId -> holder
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  const releasePromises = Array.from(locks.entries()).map(async ([botId, holder]) => {
    const released = await releaseBotLock(botType, botId, holder);
    results.set(botId, released);
    return { botId, released };
  });
  
  await Promise.all(releasePromises);
  return results;
}

// ==================== MONITORING ====================

/**
 * Get lock statistics
 */
export async function getLockStats(): Promise<{
  provider: 'redis' | 'memory';
  redis?: {
    totalAcquisitions: number;
    totalReleases: number;
    totalExtensions: number;
    totalTimeouts: number;
    totalErrors: number;
    activeLocks: number;
  };
  memory?: {
    totalAcquisitions: number;
    totalReleases: number;
    totalTimeouts: number;
    activeLocks: number;
  };
}> {
  const stats: {
    provider: 'redis' | 'memory';
    redis?: any;
    memory?: any;
  } = {
    provider: lockProvider || 'memory',
  };
  
  if (isRedisLock() && redisLock) {
    stats.redis = redisLock.getStats();
  }
  
  if (memoryLock) {
    stats.memory = memoryLock.getStats();
  }
  
  return stats;
}

/**
 * Get all active locks
 */
export async function getActiveLocks(): Promise<{
  provider: 'redis' | 'memory';
  locks: Array<{ key: string; holder?: string; acquiredAt?: number }>;
}> {
  const result: {
    provider: 'redis' | 'memory';
    locks: Array<{ key: string; holder?: string; acquiredAt?: number }>;
  } = {
    provider: lockProvider || 'memory',
    locks: [],
  };
  
  if (isRedisLock() && redisLock) {
    result.locks = redisLock.getActiveLocks().map(l => ({
      key: l.key,
      holder: l.holder,
      acquiredAt: l.acquiredAt,
    }));
  } else if (memoryLock) {
    result.locks = memoryLock.getActiveLocks().map(l => ({
      key: l.key,
      holder: l.entry.holder,
      acquiredAt: l.entry.acquiredAt,
    }));
  }
  
  return result;
}

// ==================== CLEANUP ====================

/**
 * Release all locks held by this instance
 * Use with caution - only in error recovery or shutdown scenarios
 */
export async function releaseAllLocks(): Promise<number> {
  let released = 0;
  
  if (isRedisLock() && redisLock) {
    released += await redisLock.releaseAll();
  }
  
  if (memoryLock) {
    released += await memoryLock.releaseAll();
  }
  
  return released;
}

/**
 * Shutdown the lock provider
 */
export async function shutdownLockProvider(): Promise<void> {
  if (redisLock) {
    await redisLock.disconnect();
    redisLock = null;
  }
  
  if (memoryLock) {
    memoryLock.stopCleanup();
    memoryLock = null;
  }
  
  lockProvider = null;
  console.log('[LockProvider] Shutdown complete');
}

// ==================== RE-EXPORTS ====================

export { MemoryLock, getMemoryLock, resetMemoryLock } from './memory-lock';
export { DistributedLock as RedisDistributedLock, getDistributedLock, initializeDistributedLock, resetDistributedLock } from './distributed-lock';
