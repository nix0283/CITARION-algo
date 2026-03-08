/**
 * Memory-based Distributed Lock
 * 
 * In-memory implementation for development and single-instance deployments.
 * Uses a simple Map with TTL tracking for lock management.
 * 
 * IMPORTANT: This implementation only works within a single process.
 * For multi-process/multi-server deployments, use Redis-based locks.
 */

// ==================== TYPES ====================

export interface LockEntry {
  acquiredAt: number;
  ttl: number;
  expiresAt: number;
  holder: string;
}

export interface LockStats {
  totalAcquisitions: number;
  totalReleases: number;
  totalTimeouts: number;
  activeLocks: number;
}

// ==================== MEMORY LOCK IMPLEMENTATION ====================

/**
 * In-memory lock implementation for single-process deployments
 */
export class MemoryLock {
  private locks: Map<string, LockEntry> = new Map();
  private stats: LockStats = {
    totalAcquisitions: 0,
    totalReleases: 0,
    totalTimeouts: 0,
    activeLocks: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lockPrefix: string;
  
  constructor(options?: { lockPrefix?: string }) {
    this.lockPrefix = options?.lockPrefix || "lock";
    // Start cleanup interval to remove expired locks
    this.startCleanup();
  }
  
  // ==================== CORE LOCK OPERATIONS ====================
  
  /**
   * Try to acquire a lock
   * @param key - Lock key (will be prefixed)
   * @param ttl - Time to live in milliseconds
   * @param holder - Unique identifier for the lock holder
   * @returns true if lock was acquired, false if already locked
   */
  async acquire(key: string, ttl: number, holder?: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const now = Date.now();
    const lockHolder = holder || this.generateHolderId();
    
    // Check if lock exists and is still valid
    const existingLock = this.locks.get(fullKey);
    if (existingLock) {
      if (now < existingLock.expiresAt) {
        // Lock is still held
        console.log(`[MemoryLock] Lock ${fullKey} is held by ${existingLock.holder} until ${new Date(existingLock.expiresAt).toISOString()}`);
        return false;
      }
      // Lock has expired, clean it up
      this.locks.delete(fullKey);
      this.stats.totalTimeouts++;
      this.stats.activeLocks = Math.max(0, this.stats.activeLocks - 1);
    }
    
    // Acquire the lock
    const lockEntry: LockEntry = {
      acquiredAt: now,
      ttl,
      expiresAt: now + ttl,
      holder: lockHolder,
    };
    
    this.locks.set(fullKey, lockEntry);
    this.stats.totalAcquisitions++;
    this.stats.activeLocks++;
    
    console.log(`[MemoryLock] Acquired lock ${fullKey} by ${lockHolder} for ${ttl}ms`);
    return true;
  }
  
  /**
   * Release a lock
   * @param key - Lock key
   * @param holder - The holder that acquired the lock (for verification)
   * @returns true if lock was released, false if not found or holder mismatch
   */
  async release(key: string, holder?: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const existingLock = this.locks.get(fullKey);
    
    if (!existingLock) {
      console.log(`[MemoryLock] Lock ${fullKey} not found for release`);
      return false;
    }
    
    // Verify holder if provided
    if (holder && existingLock.holder !== holder) {
      console.log(`[MemoryLock] Cannot release lock ${fullKey}: holder mismatch (${holder} vs ${existingLock.holder})`);
      return false;
    }
    
    this.locks.delete(fullKey);
    this.stats.totalReleases++;
    this.stats.activeLocks = Math.max(0, this.stats.activeLocks - 1);
    
    console.log(`[MemoryLock] Released lock ${fullKey} by ${existingLock.holder}`);
    return true;
  }
  
  /**
   * Extend a lock's TTL
   * @param key - Lock key
   * @param ttl - New TTL in milliseconds
   * @param holder - The holder that acquired the lock (for verification)
   * @returns true if lock was extended, false if not found or holder mismatch
   */
  async extend(key: string, ttl: number, holder?: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const existingLock = this.locks.get(fullKey);
    
    if (!existingLock) {
      console.log(`[MemoryLock] Lock ${fullKey} not found for extension`);
      return false;
    }
    
    // Verify holder if provided
    if (holder && existingLock.holder !== holder) {
      console.log(`[MemoryLock] Cannot extend lock ${fullKey}: holder mismatch`);
      return false;
    }
    
    // Check if lock has expired
    const now = Date.now();
    if (now >= existingLock.expiresAt) {
      this.locks.delete(fullKey);
      this.stats.totalTimeouts++;
      this.stats.activeLocks = Math.max(0, this.stats.activeLocks - 1);
      console.log(`[MemoryLock] Lock ${fullKey} has expired, cannot extend`);
      return false;
    }
    
    // Extend the lock
    existingLock.ttl = ttl;
    existingLock.expiresAt = now + ttl;
    
    console.log(`[MemoryLock] Extended lock ${fullKey} for ${ttl}ms`);
    return true;
  }
  
  /**
   * Check if a lock is currently held
   * @param key - Lock key
   * @returns true if locked, false if not locked or expired
   */
  async isLocked(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const existingLock = this.locks.get(fullKey);
    
    if (!existingLock) {
      return false;
    }
    
    // Check if lock has expired
    const now = Date.now();
    if (now >= existingLock.expiresAt) {
      // Clean up expired lock
      this.locks.delete(fullKey);
      this.stats.totalTimeouts++;
      this.stats.activeLocks = Math.max(0, this.stats.activeLocks - 1);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get lock information
   * @param key - Lock key
   * @returns Lock entry or null if not found
   */
  async getLockInfo(key: string): Promise<LockEntry | null> {
    const fullKey = this.getFullKey(key);
    const existingLock = this.locks.get(fullKey);
    
    if (!existingLock) {
      return null;
    }
    
    // Check if lock has expired
    const now = Date.now();
    if (now >= existingLock.expiresAt) {
      this.locks.delete(fullKey);
      this.stats.totalTimeouts++;
      this.stats.activeLocks = Math.max(0, this.stats.activeLocks - 1);
      return null;
    }
    
    return { ...existingLock };
  }
  
  // ==================== UTILITY METHODS ====================
  
  /**
   * Acquire lock with retry and exponential backoff
   */
  async acquireWithRetry(
    key: string,
    ttl: number,
    options?: {
      maxRetries?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffMultiplier?: number;
      holder?: string;
    }
  ): Promise<{ acquired: boolean; holder?: string; attempts: number }> {
    const maxRetries = options?.maxRetries ?? 5;
    const initialDelay = options?.initialDelay ?? 100;
    const maxDelay = options?.maxDelay ?? 5000;
    const backoffMultiplier = options?.backoffMultiplier ?? 2;
    const holder = options?.holder || this.generateHolderId();
    
    let delay = initialDelay;
    let attempts = 0;
    
    for (let i = 0; i <= maxRetries; i++) {
      attempts++;
      
      const acquired = await this.acquire(key, ttl, holder);
      if (acquired) {
        return { acquired: true, holder, attempts };
      }
      
      if (i < maxRetries) {
        console.log(`[MemoryLock] Retry ${i + 1}/${maxRetries} for ${key}, waiting ${delay}ms`);
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
    ttl: number,
    fn: () => Promise<T>,
    options?: {
      maxRetries?: number;
      holder?: string;
    }
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const { acquired, holder } = await this.acquireWithRetry(key, ttl, options);
    
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
   * Get all active locks (for debugging/monitoring)
   */
  getActiveLocks(): Array<{ key: string; entry: LockEntry }> {
    const now = Date.now();
    const activeLocks: Array<{ key: string; entry: LockEntry }> = [];
    
    for (const [key, entry] of this.locks.entries()) {
      if (now < entry.expiresAt) {
        activeLocks.push({ key, entry: { ...entry } });
      }
    }
    
    return activeLocks;
  }
  
  /**
   * Get lock statistics
   */
  getStats(): LockStats {
    return { ...this.stats };
  }
  
  /**
   * Force release all locks (use with caution!)
   */
  async releaseAll(): Promise<number> {
    const count = this.locks.size;
    this.locks.clear();
    this.stats.activeLocks = 0;
    console.log(`[MemoryLock] Released all ${count} locks`);
    return count;
  }
  
  // ==================== CLEANUP ====================
  
  /**
   * Start automatic cleanup of expired locks
   */
  private startCleanup(): void {
    // Run cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 30000);
  }
  
  /**
   * Remove all expired locks
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.locks.entries()) {
      if (now >= entry.expiresAt) {
        this.locks.delete(key);
        cleaned++;
        this.stats.totalTimeouts++;
        this.stats.activeLocks = Math.max(0, this.stats.activeLocks - 1);
      }
    }
    
    if (cleaned > 0) {
      console.log(`[MemoryLock] Cleaned up ${cleaned} expired locks`);
    }
  }
  
  /**
   * Stop the cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  // ==================== HELPERS ====================
  
  private getFullKey(key: string): string {
    return key.startsWith(this.lockPrefix) ? key : `${this.lockPrefix}:${key}`;
  }
  
  private generateHolderId(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== SINGLETON INSTANCE ====================

let memoryLockInstance: MemoryLock | null = null;

/**
 * Get the singleton memory lock instance
 */
export function getMemoryLock(): MemoryLock {
  if (!memoryLockInstance) {
    memoryLockInstance = new MemoryLock();
  }
  return memoryLockInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetMemoryLock(): void {
  if (memoryLockInstance) {
    memoryLockInstance.stopCleanup();
    memoryLockInstance = null;
  }
}

export default MemoryLock;
