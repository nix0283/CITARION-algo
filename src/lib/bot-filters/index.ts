/**
 * Bot Filters Module
 * 
 * Signal filters for various bot strategies:
 * - BB (Bollinger Band) Signal Filter
 * - DCA (Dollar Cost Averaging) Entry Filter
 * - Enhanced Signal Filter (Combined)
 * - Vision Signal Filter (ML ensemble)
 * - Session Filter (Market session filtering)
 */

// ==================== BB SIGNAL FILTER ====================

export {
  BBSignalFilter,
  BBSignal,
  BBFilterResult,
  BBFilterConfig,
  DEFAULT_BB_FILTER_CONFIG,
  getBBSignalFilter,
  createBBSignalFilter,
} from './bb-signal-filter';

// ==================== DCA ENTRY FILTER ====================

export {
  DCAEntryFilter,
  DCASignal,
  DCAFilterResult,
  DCAFilterConfig,
  DEFAULT_DCA_FILTER_CONFIG,
  getDCAEntryFilter,
  createDCAEntryFilter,
} from './dca-entry-filter';

// ==================== ENHANCED SIGNAL FILTER ====================

export {
  EnhancedSignalFilter,
  SignalContext,
  EnhancedFilterResult,
  EnhancedFilterConfig,
  BotType,
  DEFAULT_ENHANCED_FILTER_CONFIG,
  createEnhancedSignalFilter,
  getEnhancedSignalFilter,
} from './enhanced-signal-filter';

// ==================== VISION SIGNAL FILTER ====================

export {
  VISIONSignalFilter,
  VISIONSignal,
  VISIONFilterConfig,
  VISIONFilterResult,
  VISIONFilterStats,
  DEFAULT_VISION_FILTER_CONFIG,
  getVISIONSignalFilter,
  createVISIONSignalFilter,
  resetVISIONSignalFilters,
} from './vision-signal-filter';

// ==================== SESSION FILTER ====================

export {
  SessionDetector,
  SessionFilter,
  SESSION_DEFINITIONS,
  SESSION_OVERLAPS,
  getSessionFilter,
  resetSessionFilter,
  getCurrentSession,
  isMarketOpen,
  isInOverlap,
  getNextSessionOpen,
  
  // Types
  type MarketSession,
  type SessionConfig,
  type SessionState,
  type SessionFilterConfig,
  type SessionStats,
  type SessionFilterResult,
} from './session-filter';

// ==================== TYPES ====================

import type { BBSignalFilter } from './bb-signal-filter';
import type { DCAEntryFilter } from './dca-entry-filter';
import type { EnhancedSignalFilter, BotType } from './enhanced-signal-filter';

// ==================== FACTORY FUNCTIONS ====================

/**
 * Get bot filter by type
 */
export function getBotFilter<T extends BotType>(
  botType: T,
  symbol?: string,
  config?: Record<string, unknown>
): T extends 'BB' ? BBSignalFilter : T extends 'DCA' ? DCAEntryFilter : EnhancedSignalFilter {
  switch (botType) {
    case 'BB':
      return getBBSignalFilter(config as Parameters<typeof getBBSignalFilter>[0]) as ReturnType<typeof getBotFilter<T>>;
    case 'DCA':
      return getDCAEntryFilter(config as Parameters<typeof getDCAEntryFilter>[0]) as ReturnType<typeof getBotFilter<T>>;
    default:
      return getEnhancedSignalFilter(config as Parameters<typeof getEnhancedSignalFilter>[0]) as ReturnType<typeof getBotFilter<T>>;
  }
}

/**
 * Create bot filter by type (new instance)
 */
export function createBotFilter<T extends BotType>(
  botType: T,
  config?: Record<string, unknown>
): T extends 'BB' ? BBSignalFilter : T extends 'DCA' ? DCAEntryFilter : EnhancedSignalFilter {
  switch (botType) {
    case 'BB':
      return createBBSignalFilter(config as Parameters<typeof createBBSignalFilter>[0]) as ReturnType<typeof createBotFilter<T>>;
    case 'DCA':
      return createDCAEntryFilter(config as Parameters<typeof createDCAEntryFilter>[0]) as ReturnType<typeof createBotFilter<T>>;
    default:
      return createEnhancedSignalFilter(config as Parameters<typeof createEnhancedSignalFilter>[0]) as ReturnType<typeof createBotFilter<T>>;
  }
}

// Import the factory functions that we're exporting
import { getBBSignalFilter, createBBSignalFilter } from './bb-signal-filter';
import { getDCAEntryFilter, createDCAEntryFilter } from './dca-entry-filter';
import { getEnhancedSignalFilter, createEnhancedSignalFilter } from './enhanced-signal-filter';

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if a signal is valid for a given bot type
 */
export function isValidSignalForBot(
  botType: BotType,
  signal: unknown
): boolean {
  if (!signal || typeof signal !== 'object') return false;

  const s = signal as Record<string, unknown>;

  switch (botType) {
    case 'BB':
      return (
        typeof s.symbol === 'string' &&
        typeof s.currentPrice === 'number' &&
        typeof s.bbInnerUpper === 'number' &&
        typeof s.bbInnerLower === 'number' &&
        typeof s.stochK === 'number'
      );

    case 'DCA':
      return (
        typeof s.symbol === 'string' &&
        typeof s.currentPrice === 'number' &&
        typeof s.avgEntryPrice === 'number' &&
        typeof s.currentLevel === 'number' &&
        typeof s.rsi === 'number'
      );

    default:
      return false;
  }
}

/**
 * Get default configuration for a bot type
 */
export function getDefaultConfig(botType: BotType): Record<string, unknown> {
  switch (botType) {
    case 'BB':
      return {
        stochOversold: 20,
        stochOverbought: 80,
        outerBandWeight: 1.0,
        innerBandWeight: 0.7,
        squeezeBandwidthThreshold: 0.05,
        minProbability: 0.6,
        minConfidence: 0.5,
      };

    case 'DCA':
      return {
        levelDropThresholds: [3, 5, 7, 10, 15, 20, 25, 30, 35, 40],
        rsiOversold: 30,
        rsiSeverelyOversold: 20,
        amountMultipliers: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5],
        baseAmount: 100,
        minConfidence: 0.5,
      };

    default:
      return {
        minConfidence: {
          BB: 0.6,
          DCA: 0.5,
          GRID: 0.65,
          SCALP: 0.7,
          SWING: 0.55,
        },
        maxRiskScore: 0.7,
      };
  }
}
