/**
 * Signal Deduplicator
 * Double-entry protection for signal processing
 * 
 * Prevents duplicate positions from the same signal by:
 * - Generating deterministic hashes for signals
 * - Tracking processed signals with TTL
 * - Using sliding window for price matching
 * - Handling signal variations
 */

import { createHash } from 'crypto';
import { SignalCache, getSignalCache } from './signal-cache';
import {
  SignalFingerprint,
  ProcessedSignal,
  ProcessResult,
  DeduplicatorConfig,
  DuplicateCheckResult,
  SignalForDedup,
  DEFAULT_DEDUPLICATOR_CONFIG,
} from './types';

/**
 * Signal Deduplicator
 * 
 * Main class for preventing duplicate signal processing.
 * Implements idempotency checks for signal handling.
 */
export class SignalDeduplicator {
  private cache: SignalCache;
  private config: DeduplicatorConfig;
  private initialized: boolean = false;

  constructor(config: Partial<DeduplicatorConfig> = {}) {
    this.config = { ...DEFAULT_DEDUPLICATOR_CONFIG, ...config };
    this.cache = getSignalCache({
      defaultTTL: this.config.defaultTTL,
      maxEntries: this.config.maxCacheSize,
      persistToDatabase: this.config.enablePersistence,
    });
  }

  /**
   * Initialize the deduplicator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.cache.initialize();
    this.initialized = true;
  }

  /**
   * Generate a deterministic hash for a signal
   * Uses SHA-256 of canonical signal representation
   */
  generateHash(signal: SignalForDedup): string {
    // Create canonical representation
    const canonical = this.createCanonicalSignal(signal);
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Generate hash from raw text
   */
  generateRawTextHash(rawText: string): string {
    return createHash('sha256').update(rawText.trim().toLowerCase()).digest('hex');
  }

  /**
   * Create canonical string representation of a signal
   * This ensures identical signals produce the same hash
   */
  private createCanonicalSignal(signal: SignalForDedup): string {
    const parts: string[] = [
      signal.symbol.toUpperCase(),
      signal.direction,
      // Sort entry prices for consistency
      [...signal.entryPrices].sort((a, b) => a - b).join(','),
    ];

    // Include stop loss if present
    if (signal.stopLoss !== undefined) {
      parts.push(`SL:${signal.stopLoss}`);
    }

    // Include take profits if present (sorted)
    if (signal.takeProfits && signal.takeProfits.length > 0) {
      const tpPrices = signal.takeProfits
        .map(tp => tp.price)
        .sort((a, b) => a - b);
      parts.push(`TP:${tpPrices.join(',')}`);
    }

    // Include market type if present
    if (signal.marketType) {
      parts.push(`MT:${signal.marketType}`);
    }

    return parts.join('|');
  }

  /**
   * Create a signal fingerprint
   */
  createFingerprint(signal: SignalForDedup): SignalFingerprint {
    return {
      hash: this.generateHash(signal),
      symbol: signal.symbol.toUpperCase(),
      direction: signal.direction,
      entryPrices: [...signal.entryPrices].sort((a, b) => a - b),
      timestamp: Date.now(),
      stopLoss: signal.stopLoss,
      takeProfits: signal.takeProfits?.map(tp => tp.price),
      marketType: signal.marketType,
    };
  }

  /**
   * Check if a signal has already been processed
   */
  async isProcessed(signal: SignalForDedup): Promise<DuplicateCheckResult> {
    await this.initialize();

    const fingerprint = this.createFingerprint(signal);
    
    // Check for exact hash match
    const cachedEntry = this.cache.get(fingerprint.hash);
    if (cachedEntry) {
      return {
        isDuplicate: true,
        originalSignal: this.entryToProcessedSignal(cachedEntry.fingerprint, cachedEntry),
        reason: 'EXACT_MATCH',
      };
    }

    // Check for raw text match if available
    if (signal.rawText) {
      const rawTextHash = this.generateRawTextHash(signal.rawText);
      const rawTextEntry = this.cache.findByRawTextHash(rawTextHash);
      if (rawTextEntry) {
        return {
          isDuplicate: true,
          originalSignal: this.entryToProcessedSignal(rawTextEntry.fingerprint, rawTextEntry),
          reason: 'SAME_RAW_TEXT',
        };
      }
    }

    // Check for fuzzy/similar matches if enabled
    if (this.config.enableFuzzyMatching) {
      const similarSignals = this.cache.findSimilar(
        fingerprint.symbol,
        fingerprint.direction,
        fingerprint.entryPrices,
        this.config.duplicateTimeWindow,
        this.config.priceSlidingWindow
      );

      if (similarSignals.length > 0) {
        return {
          isDuplicate: true,
          originalSignal: this.entryToProcessedSignal(similarSignals[0].fingerprint, similarSignals[0]),
          similarSignals: similarSignals.map(e => this.entryToProcessedSignal(e.fingerprint, e)),
          reason: 'FUZZY_MATCH',
        };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Mark a signal as processed
   */
  async markProcessed(
    signal: SignalForDedup,
    result: ProcessResult
  ): Promise<void> {
    await this.initialize();

    const fingerprint = this.createFingerprint(signal);
    const rawTextHash = signal.rawText ? this.generateRawTextHash(signal.rawText) : undefined;

    await this.cache.set(fingerprint, result, this.config.defaultTTL, rawTextHash);
  }

  /**
   * Mark a signal as executed (convenience method)
   */
  async markExecuted(
    signal: SignalForDedup,
    positionId?: string,
    tradeId?: string,
    signalId?: number
  ): Promise<void> {
    await this.markProcessed(signal, {
      status: 'EXECUTED',
      positionId,
      tradeId,
      signalId,
      processedAt: new Date(),
    });
  }

  /**
   * Mark a signal as ignored
   */
  async markIgnored(signal: SignalForDedup, reason?: string): Promise<void> {
    await this.markProcessed(signal, {
      status: 'IGNORED',
      error: reason,
      processedAt: new Date(),
    });
  }

  /**
   * Mark a signal as failed
   */
  async markFailed(signal: SignalForDedup, error: string): Promise<void> {
    await this.markProcessed(signal, {
      status: 'FAILED',
      error,
      processedAt: new Date(),
    });
  }

  /**
   * Mark a signal as duplicate
   */
  async markDuplicate(signal: SignalForDedup, originalSignalId?: string): Promise<void> {
    await this.markProcessed(signal, {
      status: 'DUPLICATE',
      error: `Duplicate of ${originalSignalId ?? 'unknown signal'}`,
      processedAt: new Date(),
    });
  }

  /**
   * Find similar signals (for debugging)
   */
  async findSimilar(signal: SignalForDedup): Promise<ProcessedSignal[]> {
    await this.initialize();

    const fingerprint = this.createFingerprint(signal);
    const similarEntries = this.cache.findSimilar(
      fingerprint.symbol,
      fingerprint.direction,
      fingerprint.entryPrices,
      this.config.duplicateTimeWindow * 4, // Wider window for debugging
      this.config.priceSlidingWindow * 2 // Wider price window for debugging
    );

    return similarEntries.map(e => this.entryToProcessedSignal(e.fingerprint, e));
  }

  /**
   * Get all processed signals for a symbol and direction
   */
  async getProcessedSignals(
    symbol: string,
    direction: 'LONG' | 'SHORT'
  ): Promise<ProcessedSignal[]> {
    await this.initialize();

    const entries = this.cache.findBySymbolDirection(symbol, direction);
    return entries.map(e => this.entryToProcessedSignal(e.fingerprint, e));
  }

  /**
   * Get recent processed signals
   */
  async getRecentSignals(limit: number = 50): Promise<ProcessedSignal[]> {
    await this.initialize();
    return this.cache.getRecentSignals(limit);
  }

  /**
   * Get deduplicator statistics
   */
  getStats(): {
    cacheSize: number;
    config: DeduplicatorConfig;
    initialized: boolean;
  } {
    const cacheStats = this.cache.getStats();
    return {
      cacheSize: cacheStats.size,
      config: this.config,
      initialized: this.initialized,
    };
  }

  /**
   * Clear all cached signals
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Convert cache entry to ProcessedSignal
   */
  private entryToProcessedSignal(
    fingerprint: SignalFingerprint,
    entry: { result: ProcessResult; expiresAt: Date; rawTextHash?: string }
  ): ProcessedSignal {
    return {
      id: fingerprint.hash,
      fingerprint,
      processedAt: entry.result.processedAt,
      expiresAt: entry.expiresAt,
      positionId: entry.result.positionId,
      tradeId: entry.result.tradeId,
      signalId: entry.result.signalId,
      status: entry.result.status,
      rawTextHash: entry.rawTextHash,
    };
  }

  /**
   * Check if processing should be allowed for a signal
   * Returns true if the signal can be processed, false if it's a duplicate
   */
  async shouldProcess(signal: SignalForDedup): Promise<{
    canProcess: boolean;
    reason?: string;
    originalSignal?: ProcessedSignal;
  }> {
    const duplicateCheck = await this.isProcessed(signal);

    if (duplicateCheck.isDuplicate) {
      return {
        canProcess: false,
        reason: `Signal already processed: ${duplicateCheck.reason}`,
        originalSignal: duplicateCheck.originalSignal,
      };
    }

    return { canProcess: true };
  }

  /**
   * Process a signal with automatic deduplication
   * Returns the processing result or null if duplicate
   */
  async processSignal<T>(
    signal: SignalForDedup,
    processor: () => Promise<T>
  ): Promise<{
    processed: boolean;
    result?: T;
    duplicateReason?: string;
    originalSignal?: ProcessedSignal;
  }> {
    // Check for duplicate
    const shouldProcess = await this.shouldProcess(signal);

    if (!shouldProcess.canProcess) {
      // Mark as duplicate
      await this.markDuplicate(signal, shouldProcess.originalSignal?.id);
      return {
        processed: false,
        duplicateReason: shouldProcess.reason,
        originalSignal: shouldProcess.originalSignal,
      };
    }

    try {
      // Execute the processor
      const result = await processor();
      return { processed: true, result };
    } catch (error) {
      // Mark as failed
      await this.markFailed(signal, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
}

// Singleton instance
let deduplicatorInstance: SignalDeduplicator | null = null;

/**
 * Get or create the singleton SignalDeduplicator instance
 */
export function getSignalDeduplicator(
  config?: Partial<DeduplicatorConfig>
): SignalDeduplicator {
  if (!deduplicatorInstance) {
    deduplicatorInstance = new SignalDeduplicator(config);
  }
  return deduplicatorInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSignalDeduplicator(): void {
  if (deduplicatorInstance) {
    deduplicatorInstance.clear();
    deduplicatorInstance = null;
  }
}

/**
 * Convenience function to check if a signal is processed
 */
export async function isSignalProcessed(
  signal: SignalForDedup
): Promise<DuplicateCheckResult> {
  const deduplicator = getSignalDeduplicator();
  return deduplicator.isProcessed(signal);
}

/**
 * Convenience function to mark a signal as processed
 */
export async function markSignalProcessed(
  signal: SignalForDedup,
  result: ProcessResult
): Promise<void> {
  const deduplicator = getSignalDeduplicator();
  return deduplicator.markProcessed(signal, result);
}

/**
 * Convenience function to check if processing should be allowed
 */
export async function shouldProcessSignal(signal: SignalForDedup): Promise<{
  canProcess: boolean;
  reason?: string;
  originalSignal?: ProcessedSignal;
}> {
  const deduplicator = getSignalDeduplicator();
  return deduplicator.shouldProcess(signal);
}
