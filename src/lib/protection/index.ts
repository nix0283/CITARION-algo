/**
 * Protection Module Exports
 * 
 * This module provides protection mechanisms for the trading system:
 * - Double Entry Protection: Prevents duplicate position entries
 * - Signal Deduplication: Prevents processing the same signal twice
 * - Bot Coordination: Ensures only one bot trades per symbol
 */

export * from './double-entry-protection';

// Re-export from signal-processing for convenience
export { SignalDeduplicator, type SignalDeduplicationConfig, type DeduplicationResult } from '../signal-processing/deduplicator';
