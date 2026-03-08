/**
 * Redis-based Distributed Lock
 * 
 * Production-ready distributed lock implementation using Redis.
 * Uses SET NX EX pattern for atomic lock acquisition.
 * 
 * Features:
 * - Atomic lock acquisition with SET NX EX
 * - Automatic lock expiration (TTL)
 * - Lock extension support
 * - Retry with exponential backoff
 * - Lua scripts for atomic operations
 * 
 * IMPORTANT: Requires Redis connection to be established before use.
 */

import { createClient, RedisClientType } from 'redis';

// ==================== TYPES ====================

export interface DistributedLockOptions {
  redisUrl?: string;
  lockPrefix?: string;
  defaultTtl?: number;
  maxRetryAttempts?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
}

export interface LockInfo {
  key: string;
  holder: string;
  ttl: number;
  acquiredAt: number;
  expiresAt: number;
}

export interface LockStats {
  totalAcquisitions: number;
  totalReleases: number;
  totalExtensions: number;
  totalTimeouts: number;
  totalErrors: number;
  activeLocks: number;
}

// ==================== LUA SCRIPTS ====================

// Script to acquire lock atomically
// Returns 1 if acquired, 0 if already locked
const ACQUIRE_SCRIPT = `
local key = KEYS[1]
local holder = ARGV[1]
local ttl = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Check if lock exists
local existing = redis.call('GET', key)
if existing then
  -- Lock exists, check if it's from the same holder (reentrant)
  if existing == holder then
    -- Extend the lock
    redis.call('PEXPIRE', key, ttl)
    return 1
  end
  -- Lock is held by someone else
  return 0
end

-- Acquire the lock
redis.call('SET', key, holder, 'PX', ttl)
return 1
`;

// Script to release lock atomically
// Returns 1 if released, 0 if not found or holder mismatch
const RELEASE_SCRIPT = `
local key = KEYS[1]
local holder = ARGV[1]

local existing = redis.call('GET', key)
if existing == holder then
  redis.call('DEL', key)
  return 1
elseif existing then
  -- Holder mismatch
  return 0
else
  -- Lock not found
  return 0
end
`;

// Script to extend lock atomically
// Returns remaining TTL if extended, -1 if not found or holder mismatch
const EXTEND_SCRIPT = `
local key = KEYS[1]
local holder = ARGV[1]
local ttl = tonumber(ARGV[2])

local existing = redis.call('GET', key)
if existing == holder then
  redis.call('PEXPIRE', key, ttl)
  return ttl
else
  return -1
end
`;

// ==================== REDIS LOCK IMPLEMENTATION ====================

/**
 * Redis-based distributed lock for production use
 */
export class DistributedLock {
  private client: RedisClientType | null = null;
  private connected: boolean = false;
  private lockPrefix: string;
  private defaultTtl: number;
  private maxRetryAttempts: number;
  private retryDelay: number;
  private maxRetryDelay: number;
  private stats: LockStats = {
    totalAcquisitions: 0,
    totalReleases: 0,
    totalExtensions: 0,
    totalTimeouts: 0,
    totalErrors: 0,
    activeLocks: 0,
  };
  
  // Track active locks for this instance
  private activeLocks: Map<string, { holder: string; acquiredAt: number }> = new Map();
  
  constructor(options: DistributedLockOptions = {}) {
    this.lockPrefix = options.lockPrefix || 'lock';
    this.defaultTtl = options.defaultTtl || 30000; // 30 seconds default
    this.maxRetryAttempts = options.maxRetryAttempts || 5;
    this.retryDelay = options.retryDelay || 100;
    this.maxRetryDelay = options.maxRetryDelay || 5000;
  }
  
  // ==================== CONNECTION ====================
  
  /**
   * Connect to Redis
   */
  async connect(url?: string): Promise<void> {
    if (this.connected && this.client) {
      return;
    }
    
    const redisUrl = url || process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.client = createClient({ url: redisUrl });
    
    this.client.on('error', (err) => {
      console.error('[DistributedLock] Redis error:', err);
      this.connected = false;
    });
    
    this.client.on('connect', () => {
      console.log('[DistributedLock] Redis connected');
      this.connected = true;
    });
    
    this.client.on('disconnect', () => {
      console.log('[DistributedLock] Redis disconnected');
      this.connected = false;
    });
    
    await this.client.connect();
  }
  
  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }
  
  /**
   * Check if connected to Redis
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }
  
  // ==================== CORE LOCK OPERATIONS ====================
  
  /**
   * Try to acquire a lock
   * @param key - Lock key (will be prefixed)
   * @param ttl - Time to live in milliseconds
   * @param holder - Unique identifier for the lock holder
   * @returns true if lock was acquired, false if already locked
   */
  async acquire(key: string, ttl?: number, holder?: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      throw new Error('[DistributedLock] Not connected to Redis');
    }
    
    const fullKey = this.getFullKey(key);
    const lockTtl = ttl || this.defaultTtl;
    const lockHolder = holder || this.generateHolderId();
    const now = Date.now();
    
    try {
      const result = await this.client.eval(
        ACQUIRE_SCRIPT,
        {
          keys: [fullKey],
          arguments: [lockHolder, lockTtl.toString(), now.toString()],
        }
      );
      
      const acquired = result === 1;
      
      if (acquired) {
        this.stats.totalAcquisitions++;
        this.stats.activeLocks++;
        this.activeLocks.set(fullKey, { holder: lockHolder, acquiredAt: now });
        console.log(`[DistributedLock] Acquired lock ${fullKey} by ${lockHolder} for ${lockTtl}ms`);
      } else {
        console.log(`[DistributedLock] Lock ${fullKey} is held by another process`);
      }
      
      return acquired;
    } catch (error) {
      this.stats.totalErrors++;
      console.error(`[DistributedLock] Error acquiring lock ${fullKey}:`, error);
      throw error;
    }
  }
  
  /**
   * Release a lock
   * @param key - Lock key
   * @param holder - The holder that acquired the lock (for verification)
   * @returns true if lock was released, false if not found or holder mismatch
   */
  async release(key: string, holder?: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      throw new Error('[DistributedLock] Not connected to Redis');
    }
    
    const fullKey = this.getFullKey(key);
    const lockHolder = holder || this.activeLocks.get(fullKey)?.holder;
    
    if (!lockHolder) {
      console.log(`[DistributedLock] No holder found for lock ${fullKey}`);
      return false;
    }
    
    try {
      const result = await this.client.eval(
        RELEASE_SCRIPT,
        {
          keys: [fullKey],
          arguments: [lockHolder],
        }
      );
      
      const released = result === 1;
      
      if (released) {
        this.stats.totalReleases++;
        this.stats.activeLocks = Math.max(0, this.stats.activeLocks - 1);
        this.activeLocks.delete(fullKey);
        console.log(`[DistributedLock] Released lock ${fullKey} by ${lockHolder}`);
      } else {
        console.log(`[DistributedLock] Could not release lock ${fullKey}: not found or holder mismatch`);
      }
      
      return released;
    } catch (error) {
      this.stats.totalErrors++;
      console.error(`[DistributedLock] Error releasing lock ${fullKey}:`, error);
      throw error;
    }
  }
  
  /**
   * Extend a lock's TTL
   * @param key - Lock key
   * @param ttl - New TTL in milliseconds
   * @param holder - The holder that acquired the lock (for verification)
   * @returns true if lock was extended, false if not found or holder mismatch
   */
  async extend(key: string, ttl?: number, holder?: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      throw new Error('[DistributedLock] Not connected to Redis');
    }
    
    const fullKey = this.getFullKey(key);
    const lockTtl = ttl || this.defaultTtl;
    const lockHolder = holder || this.activeLocks.get(fullKey)?.holder;
    
    if (!lockHolder) {
      console.log(`[DistributedLock] No holder found for lock ${fullKey}`);
      return false;
    }
    
    try {
      const result = await this.client.eval(
        EXTEND_SCRIPT,
        {
          keys: [fullKey],
          arguments: [lockHolder, lockTtl.toString()],
        }
      );
      
      const extended = typeof result === 'number' && result >= 0;
      
      if (extended) {
        this.stats.totalExtensions++;
        console.log(`[DistributedLock] Extended lock ${fullKey} for ${lockTtl}ms`);
      } else {
        console.log(`[DistributedLock] Could not extend lock ${fullKey}: not found or holder mismatch`);
      }
      
      return extended;
    } catch (error) {
      this.stats.totalErrors++;
      console.error(`[DistributedLock] Error extending lock ${fullKey}:`, error);
      throw error;
    }
  }
  
  /**
   * Check if a lock is currently held
   * @param key - Lock key
   * @returns true if locked, false if not locked
   */
  async isLocked(key: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      throw new Error('[DistributedLock] Not connected to Redis');
    }
    
    const fullKey = this.getFullKey(key);
    
    try {
      const exists = await this.client.exists(fullKey);
      return exists === 1;
    } catch (error) {
      this.stats.totalErrors++;
      console.error(`[DistributedLock] Error checking lock ${fullKey}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the remaining TTL of a lock
   * @param key - Lock key
   * @returns TTL in milliseconds, -1 if no TTL, -2 if key doesn't exist
   */
  async getTtl(key: string): Promise<number> {
    if (!this.client || !this.connected) {
      throw new Error('[DistributedLock] Not connected to Redis');
    }
    
    const fullKey = this.getFullKey(key);
    
    try {
      return await this.client.pttl(fullKey);
    } catch (error) {
      this.stats.totalErrors++;
      console.error(`[DistributedLock] Error getting TTL for ${fullKey}:`, error);
      throw error;
    }
  }
  
  // ==================== HIGH-LEVEL OPERATIONS ====================
  
  /**
   * Acquire lock with retry and exponential backoff
   */
  async acquireWithRetry(
    key: string,
    ttl?: number,
    options?: {
      maxRetries?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffMultiplier?: number;
      holder?: string;
    }
  ): Promise<{ acquired: boolean; holder?: string; attempts: number }> {
    const maxRetries = options?.maxRetries ?? this.maxRetryAttempts;
    const initialDelay = options?.initialDelay ?? this.retryDelay;
    const maxDelay = options?.maxDelay ?? this.maxRetryDelay;
    const backoffMultiplier = 2;
    const holder = options?.holder || this.generateHolderId();
    
    let delay = initialDelay;
    let attempts = 0;
    
    for (let i = 0; i <= maxRetries; i++) {
      attempts++;
      
      try {
        const acquired = await this.acquire(key, ttl, holder);
        if (acquired) {
          return { acquired: true, holder, attempts };
        }
      } catch (error) {
        console.error(`[DistributedLock] Error on attempt ${attempts}:`, error);
      }
      
      if (i < maxRetries) {
        console.log(`[DistributedLock] Retry ${i + 1}/${maxRetries} for ${key}, waiting ${delay}ms`);
        await this.sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }
    
    return { acquired: false, attempts };
  }
  
  /**
   * Execute a function with a lock
   * Automatically releases the lock after execution
   */
  async withLock<T>(
    key: string,
    ttl: number | undefined,
    fn: () => Promise<T>,
    options?: {
      maxRetries?: number;
      holder?: string;
    }
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const lockTtl = ttl || this.defaultTtl;
    const { acquired, holder } = await this.acquireWithRetry(key, lockTtl, options);
    
    if (!acquired) {
      return { 
        success: false, 
        error: `Failed to acquire lock for ${key}` 
      };
    }
    
    try {
      const result = await fn();
      return { success: true, result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    } finally {
      await this.release(key, holder);
    }
  }
  
  /**
   * Execute a function with a lock and auto-extend
   * Useful for long-running operations
   */
  async withLockAndAutoExtend<T>(
    key: string,
    ttl: number | undefined,
    fn: (extend: () => Promise<void>) => Promise<T>,
    options?: {
      maxRetries?: number;
      holder?: string;
      extendInterval?: number;
    }
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const lockTtl = ttl || this.defaultTtl;
    const extendInterval = options?.extendInterval || lockTtl / 2;
    const { acquired, holder } = await this.acquireWithRetry(key, lockTtl, options);
    
    if (!acquired) {
      return { 
        success: false, 
        error: `Failed to acquire lock for ${key}` 
      };
    }
    
    let keepExtending = true;
    let extendError: Error | null = null;
    
    // Start auto-extend timer
    const extendTimer = setInterval(async () => {
      if (keepExtending) {
        try {
          await this.extend(key, lockTtl, holder);
        } catch (error) {
          extendError = error instanceof Error ? error : new Error('Extend failed');
          keepExtending = false;
        }
      }
    }, extendInterval);
    
    try {
      const extend = async () => {
        await this.extend(key, lockTtl, holder);
      };
      
      const result = await fn(extend);
      return { success: true, result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    } finally {
      keepExtending = false;
      clearInterval(extendTimer);
      await this.release(key, holder);
    }
  }
  
  // ==================== UTILITY METHODS ====================
  
  /**
   * Get lock statistics
   */
  getStats(): LockStats {
    return { ...this.stats };
  }
  
  /**
   * Get active locks held by this instance
   */
  getActiveLocks(): Array<{ key: string; holder: string; acquiredAt: number }> {
    return Array.from(this.activeLocks.entries()).map(([key, value]) => ({
      key,
      ...value,
    }));
  }
  
  /**
   * Force release all locks held by this instance
   * Use with caution - only in error recovery scenarios
   */
  async releaseAll(): Promise<number> {
    let released = 0;
    
    for (const [key, { holder }] of this.activeLocks.entries()) {
      try {
        if (await this.release(key, holder)) {
          released++;
        }
      } catch (error) {
        console.error(`[DistributedLock] Error releasing lock ${key}:`, error);
      }
    }
    
    console.log(`[DistributedLock] Released ${released} locks`);
    return released;
  }
  
  // ==================== HELPERS ====================
  
  private getFullKey(key: string): string {
    return key.startsWith(this.lockPrefix) ? key : `${this.lockPrefix}:${key}`;
  }
  
  private generateHolderId(): string {
    const hostname = process.env.HOSTNAME || 'localhost';
    return `${hostname}-${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== SINGLETON INSTANCE ====================

let distributedLockInstance: DistributedLock | null = null;

/**
 * Get the singleton distributed lock instance
 */
export function getDistributedLock(): DistributedLock {
  if (!distributedLockInstance) {
    distributedLockInstance = new DistributedLock();
  }
  return distributedLockInstance;
}

/**
 * Initialize the distributed lock with Redis connection
 */
export async function initializeDistributedLock(options?: DistributedLockOptions): Promise<DistributedLock> {
  const lock = getDistributedLock();
  await lock.connect(options?.redisUrl);
  return lock;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetDistributedLock(): void {
  if (distributedLockInstance) {
    distributedLockInstance.disconnect().catch(console.error);
    distributedLockInstance = null;
  }
}

export default DistributedLock;
