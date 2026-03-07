/**
 * Signal Processing Module
 * Double-entry protection for signal processing
 * 
 * This module provides deduplication for trading signals to prevent
 * duplicate positions from the same signal (e.g., from Telegram reconnection).
 * 
 * @example
 * ```typescript
 * import {
 *   SignalDeduplicator,
 *   getSignalDeduplicator,
 *   shouldProcessSignal,
 *   markSignalProcessed,
 *   toSignalForDedup,
 * } from '@/lib/signal-processing';
 * 
 * // Using the singleton
 * const deduplicator = getSignalDeduplicator();
 * 
 * // Check if signal was already processed
 * const signal = toSignalForDedup(parsedSignal);
 * const check = await deduplicator.isProcessed(signal);
 * 
 * if (!check.isDuplicate) {
 *   // Process the signal
 *   await processSignal(parsedSignal);
 *   
 *   // Mark as processed
 *   await deduplicator.markExecuted(signal, positionId, tradeId);
 * }
 * ```
 * 
 * @example Using the convenience wrapper
 * ```typescript
 * import { shouldProcessSignal, markSignalProcessed, toSignalForDedup } from '@/lib/signal-processing';
 * 
 * const signal = toSignalForDedup(parsedSignal);
 * const { canProcess, reason } = await shouldProcessSignal(signal);
 * 
 * if (canProcess) {
 *   const positionId = await executeSignal(parsedSignal);
 *   await markSignalProcessed(signal, {
 *     status: 'EXECUTED',
 *     positionId,
 *     processedAt: new Date(),
 *   });
 * }
 * ```
 */

// Types
export type {
  SignalFingerprint,
  ProcessedSignal,
  ProcessResult,
  ProcessedStatus,
  SignalCacheEntry,
  SignalCacheConfig,
  DeduplicatorConfig,
  DuplicateCheckResult,
  SignalForDedup,
} from './types';

// Constants
export {
  DEFAULT_DEDUPLICATOR_CONFIG,
  DEFAULT_CACHE_CONFIG,
  toSignalForDedup,
} from './types';

// Signal Cache
export {
  SignalCache,
  getSignalCache,
  resetSignalCache,
} from './signal-cache';

// Deduplicator
export {
  SignalDeduplicator,
  getSignalDeduplicator,
  resetSignalDeduplicator,
  isSignalProcessed,
  markSignalProcessed,
  shouldProcessSignal,
} from './deduplicator';

// Stale Signal Detector
// Audit Fix: P1.16 - Stale Signal Detection with 30s TTL
export {
  StaleSignalDetector,
  getStaleSignalDetector,
  type SignalWithTTL,
  type StaleSignalConfig,
  type TrackedSignal,
  type StaleSignalMetrics,
  type SignalStatus,
} from './stale-signal-detector';

/**
 * Process a signal with automatic deduplication
 * 
 * This is the recommended way to process signals with deduplication built-in.
 * It will automatically check for duplicates and mark the signal as processed.
 * 
 * @example
 * ```typescript
 * import { processSignalWithDedup, toSignalForDedup } from '@/lib/signal-processing';
 * 
 * const signal = toSignalForDedup(parsedSignal);
 * const result = await processSignalWithDedup(signal, async () => {
 *   // Your signal processing logic here
 *   return await executeTrade(parsedSignal);
 * });
 * 
 * if (result.processed) {
 *   console.log('Trade executed:', result.result);
 * } else {
 *   console.log('Signal was duplicate:', result.duplicateReason);
 * }
 * ```
 */
export async function processSignalWithDedup<T>(
  signal: import('./types').SignalForDedup,
  processor: () => Promise<T>
): Promise<{
  processed: boolean;
  result?: T;
  duplicateReason?: string;
  originalSignal?: import('./types').ProcessedSignal;
}> {
  const deduplicator = getSignalDeduplicator();
  return deduplicator.processSignal(signal, processor);
}
