/**
 * Signal Processing Types
 * Types for double-entry protection and signal deduplication
 */

import type { ParsedSignal } from '../signal-parser';

// ==================== SIGNAL FINGERPRINT ====================

/**
 * Unique fingerprint for a signal, used for deduplication
 */
export interface SignalFingerprint {
  /** SHA-256 hash of canonical signal representation */
  hash: string;
  /** Trading pair symbol (e.g., BTCUSDT) */
  symbol: string;
  /** Trade direction */
  direction: 'LONG' | 'SHORT';
  /** Entry prices from the signal */
  entryPrices: number[];
  /** Unix timestamp of when the signal was generated/received */
  timestamp: number;
  /** Stop loss price (if present) */
  stopLoss?: number;
  /** Take profit prices (if present) */
  takeProfits?: number[];
  /** Market type */
  marketType?: 'SPOT' | 'FUTURES';
}

// ==================== PROCESSED SIGNAL ====================

/**
 * Status of a processed signal
 */
export type ProcessedStatus = 'EXECUTED' | 'IGNORED' | 'FAILED' | 'DUPLICATE' | 'PENDING';

/**
 * Result of processing a signal
 */
export interface ProcessResult {
  /** Processing status */
  status: ProcessedStatus;
  /** ID of created position (if executed) */
  positionId?: string;
  /** ID of created trade (if executed) */
  tradeId?: string;
  /** Signal ID from database */
  signalId?: number;
  /** Error message (if failed) */
  error?: string;
  /** Processing timestamp */
  processedAt: Date;
}

/**
 * Record of a processed signal for deduplication tracking
 */
export interface ProcessedSignal {
  /** Unique identifier */
  id: string;
  /** Signal fingerprint */
  fingerprint: SignalFingerprint;
  /** When the signal was processed */
  processedAt: Date;
  /** When this record expires */
  expiresAt: Date;
  /** Position ID if a position was created */
  positionId?: string;
  /** Trade ID if a trade was created */
  tradeId?: string;
  /** Signal ID from database */
  signalId?: number;
  /** Processing status */
  status: ProcessedStatus;
  /** Source of the signal */
  signalSource?: string;
  /** Original raw text hash */
  rawTextHash?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ==================== SIGNAL CACHE ====================

/**
 * In-memory cache entry for signal deduplication
 */
export interface SignalCacheEntry {
  /** Signal fingerprint */
  fingerprint: SignalFingerprint;
  /** Processing result */
  result: ProcessResult;
  /** When this entry was cached */
  cachedAt: Date;
  /** When this entry expires */
  expiresAt: Date;
  /** Raw text hash for text-based deduplication */
  rawTextHash?: string;
}

/**
 * Configuration for signal cache
 */
export interface SignalCacheConfig {
  /** Default TTL for cached signals (milliseconds) */
  defaultTTL: number;
  /** Maximum number of entries in cache */
  maxEntries: number;
  /** Cleanup interval (milliseconds) */
  cleanupInterval: number;
  /** Enable persistence to database */
  persistToDatabase: boolean;
}

// ==================== DEDUPLICATOR ====================

/**
 * Configuration for SignalDeduplicator
 */
export interface DeduplicatorConfig {
  /** Default TTL for processed signals (default: 24 hours) */
  defaultTTL: number;
  /** Sliding window for price matching (percentage, e.g., 0.001 = 0.1%) */
  priceSlidingWindow: number;
  /** Enable fuzzy matching for similar signals */
  enableFuzzyMatching: boolean;
  /** Time window for considering signals as duplicates (milliseconds) */
  duplicateTimeWindow: number;
  /** Enable database persistence */
  enablePersistence: boolean;
  /** Maximum in-memory cache size */
  maxCacheSize: number;
}

/**
 * Result of duplicate check
 */
export interface DuplicateCheckResult {
  /** Whether the signal is a duplicate */
  isDuplicate: boolean;
  /** Original signal that this duplicates (if found) */
  originalSignal?: ProcessedSignal;
  /** Similar signals found (for debugging) */
  similarSignals?: ProcessedSignal[];
  /** Reason for duplicate detection */
  reason?: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'SAME_RAW_TEXT' | 'TIME_WINDOW';
}

/**
 * Signal for deduplication (simplified ParsedSignal)
 */
export interface SignalForDedup {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrices: number[];
  stopLoss?: number;
  takeProfits?: { price: number; percentage: number }[];
  marketType?: 'SPOT' | 'FUTURES';
  rawText?: string;
  signalSource?: string;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Convert ParsedSignal to SignalForDedup
 */
export function toSignalForDedup(signal: ParsedSignal): SignalForDedup {
  return {
    symbol: signal.symbol,
    direction: signal.direction,
    entryPrices: signal.entryPrices,
    stopLoss: signal.stopLoss,
    takeProfits: signal.takeProfits,
    marketType: signal.marketType,
    rawText: signal.rawText,
  };
}

// ==================== DEFAULT CONFIG ====================

/**
 * Default deduplicator configuration
 */
export const DEFAULT_DEDUPLICATOR_CONFIG: DeduplicatorConfig = {
  defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
  priceSlidingWindow: 0.001, // 0.1%
  enableFuzzyMatching: true,
  duplicateTimeWindow: 60 * 60 * 1000, // 1 hour
  enablePersistence: true,
  maxCacheSize: 10000,
};

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: SignalCacheConfig = {
  defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
  maxEntries: 10000,
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  persistToDatabase: true,
};
