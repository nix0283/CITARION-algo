/**
 * useBotFilter Hook
 *
 * A shared hook for integrating signal filters into bot manager components.
 * Provides filter state management, evaluation, and configuration updates.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  getBotFilter,
  BBSignalFilter,
  DCAEntryFilter,
  EnhancedSignalFilter,
  VISIONSignalFilter,
  getVISIONSignalFilter,
  BBSignal,
  BBFilterResult,
  DCASignal,
  DCAFilterResult,
  EnhancedFilterResult,
  VISIONSignal,
  VISIONFilterResult,
} from '@/lib/bot-filters';

// ==================== TYPES ====================

export type BotType = 'BB' | 'DCA' | 'VISION' | 'ORION';

export type SignalFilter = BBSignalFilter | DCAEntryFilter | EnhancedSignalFilter | VISIONSignalFilter;

export type FilterResult = BBFilterResult | DCAFilterResult | EnhancedFilterResult | VISIONFilterResult;

export type BotSignal = BBSignal | DCASignal | VISIONSignal;

export interface UseBotFilterOptions {
  /** Enable filter by default */
  defaultEnabled?: boolean;
  /** Custom filter configuration */
  config?: Record<string, unknown>;
  /** Auto-evaluate on signal change */
  autoEvaluate?: boolean;
}

export interface UseBotFilterReturn<T extends BotType> {
  /** Filter instance */
  filter: SignalFilter | null;
  /** Latest filter evaluation result */
  result: FilterResult | null;
  /** Loading state during evaluation */
  loading: boolean;
  /** Evaluate a signal through the filter */
  evaluate: (signal: BotSignal) => Promise<FilterResult | null>;
  /** Whether filter is enabled */
  filterEnabled: boolean;
  /** Toggle filter enabled state */
  setFilterEnabled: (enabled: boolean) => void;
  /** Update filter configuration */
  updateConfig: (config: Record<string, unknown>) => void;
  /** Reset filter state */
  reset: () => void;
  /** Initialize or reinitialize filter */
  initialize: () => void;
  /** Filter is ready for use */
  isReady: boolean;
}

// ==================== HOOK ====================

export function useBotFilter<T extends BotType>(
  botType: T,
  symbol: string = 'default',
  options: UseBotFilterOptions = {}
): UseBotFilterReturn<T> {
  const {
    defaultEnabled = true,
    config = {},
    autoEvaluate = false,
  } = options;

  const [filter, setFilter] = useState<SignalFilter | null>(null);
  const [result, setResult] = useState<FilterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(defaultEnabled);
  const [isReady, setIsReady] = useState(false);

  // Use ref to store filter for stable access
  const filterRef = useRef<SignalFilter | null>(null);

  // Initialize filter based on bot type
  const initialize = useCallback(() => {
    try {
      let filterInstance: SignalFilter;

      switch (botType) {
        case 'BB':
          filterInstance = getBotFilter('BB', symbol, config);
          break;
        case 'DCA':
          filterInstance = getBotFilter('DCA', symbol, config);
          break;
        case 'VISION':
          filterInstance = getVISIONSignalFilter(symbol, config);
          break;
        case 'ORION':
          filterInstance = getBotFilter('BB', symbol, config); // ORION uses enhanced filter internally
          break;
        default:
          throw new Error(`Unknown bot type: ${botType}`);
      }

      filterRef.current = filterInstance;
      setFilter(filterInstance);
      setIsReady(true);
    } catch (error) {
      console.error(`Failed to initialize filter for ${botType}:`, error);
      setIsReady(false);
    }
  }, [botType, symbol, config]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Evaluate signal through filter
  const evaluate = useCallback(async (signal: BotSignal): Promise<FilterResult | null> => {
    if (!filterRef.current || !filterEnabled) {
      // Return approved result when filter is disabled
      return {
        approved: true,
        confidence: 1,
        reasons: ['Filter disabled - signal auto-approved'],
      } as FilterResult;
    }

    setLoading(true);
    try {
      const evalResult = await filterRef.current.evaluate(signal as any);
      setResult(evalResult);
      return evalResult;
    } catch (error) {
      console.error('Filter evaluation error:', error);
      return {
        approved: false,
        confidence: 0,
        reasons: [`Filter error: ${error}`],
      } as FilterResult;
    } finally {
      setLoading(false);
    }
  }, [filterEnabled]);

  // Update filter configuration
  const updateConfig = useCallback((newConfig: Record<string, unknown>) => {
    if (filterRef.current && 'updateConfig' in filterRef.current) {
      (filterRef.current as any).updateConfig(newConfig);
    }
  }, []);

  // Reset filter state
  const reset = useCallback(() => {
    setResult(null);
    setLoading(false);
    if (filterRef.current && 'clearHistory' in filterRef.current) {
      (filterRef.current as any).clearHistory();
    }
  }, []);

  return {
    filter,
    result,
    loading,
    evaluate,
    filterEnabled,
    setFilterEnabled,
    updateConfig,
    reset,
    initialize,
    isReady,
  };
}

// ==================== SPECIALIZED HOOKS ====================

/**
 * Hook for BB Bot filter
 */
export function useBBFilter(symbol: string, options?: UseBotFilterOptions) {
  return useBotFilter('BB', symbol, options);
}

/**
 * Hook for DCA Bot filter
 */
export function useDCAFilter(symbol: string, options?: UseBotFilterOptions) {
  return useBotFilter('DCA', symbol, options);
}

/**
 * Hook for VISION Bot filter
 */
export function useVISIONFilter(symbol: string, options?: UseBotFilterOptions) {
  return useBotFilter('VISION', symbol, options);
}

/**
 * Hook for ORION Bot filter
 */
export function useORIONFilter(symbol: string, options?: UseBotFilterOptions) {
  return useBotFilter('ORION', symbol, options);
}

export default useBotFilter;
