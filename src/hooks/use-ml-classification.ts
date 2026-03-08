/**
 * ML Classification Hook
 * 
 * React hook for using ML classification in components.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ==================== TYPES ====================

export interface ClassificationResult {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  probability: number;
  confidence: number;
  calibratedProbability: number;
  features: Record<string, number>;
  kernelEstimate?: {
    value: number;
    confidence: number;
    sampleCount: number;
  };
  sessionValid: boolean;
  activeSession?: string;
  featureImportance: Record<string, number>;
}

export interface SignalResult {
  type: number;
  direction: string;
  action: string;
  passed: boolean;
  reasons: string[];
}

export interface ClassifierStats {
  totalSamples: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  avgConfidence: number;
  winRate: number;
  lastUpdated: number;
}

export interface MLClassifyConfig {
  usePlattScaling?: boolean;
  useKernelSmoothing?: boolean;
  useSessionFilter?: boolean;
  minConfidence?: number;
  minProbability?: number;
}

export interface UseMLClassificationOptions {
  /** Auto-run classification on mount */
  autoRun?: boolean;
  /** Classification config */
  config?: MLClassifyConfig;
  /** Symbol to classify */
  symbol?: string;
  /** Timeframe */
  timeframe?: string;
}

export interface UseMLClassificationReturn {
  /** Classification result */
  result: ClassificationResult | null;
  /** Signal result */
  signal: SignalResult | null;
  /** Classifier stats */
  stats: ClassifierStats | null;
  /** Is currently classifying */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Run classification */
  classify: (priceData: {
    high: number[];
    low: number[];
    close: number[];
    volume?: number[];
  }) => Promise<void>;
  /** Refresh stats */
  refreshStats: () => Promise<void>;
  /** Clear results */
  clear: () => void;
}

// ==================== HOOK ====================

export function useMLClassification(
  options: UseMLClassificationOptions = {}
): UseMLClassificationReturn {
  const {
    autoRun = false,
    config = {},
    symbol = 'BTCUSDT',
    timeframe = '1h',
  } = options;

  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [stats, setStats] = useState<ClassifierStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Run classification
  const classify = useCallback(async (priceData: {
    high: number[];
    low: number[];
    close: number[];
    volume?: number[];
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ml/classify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          timeframe,
          priceData,
          config,
        }),
      });

      if (!response.ok) {
        throw new Error(`Classification failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setResult(data.result);
        setSignal(data.signal);
      } else {
        throw new Error(data.error || 'Classification failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('ML Classification error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, timeframe, config]);

  // Refresh stats
  const refreshStats = useCallback(async () => {
    try {
      const response = await fetch('/api/ml/classify');
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to refresh stats:', err);
    }
  }, []);

  // Clear results
  const clear = useCallback(() => {
    setResult(null);
    setSignal(null);
    setError(null);
  }, []);

  // Initial stats load
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  return {
    result,
    signal,
    stats,
    isLoading,
    error,
    classify,
    refreshStats,
    clear,
  };
}

// ==================== UTILITY HOOKS ====================

/**
 * Hook for real-time classification with WebSocket data
 */
export function useRealtimeClassification(
  symbol: string,
  timeframe: string,
  options: {
    enabled?: boolean;
    interval?: number;
    config?: MLClassifyConfig;
  } = {}
) {
  const { enabled = true, config = {} } = options;
  
  // Use ref for history to avoid setState in effect
  const historyRef = useRef<Array<{
    timestamp: number;
    result: ClassificationResult;
  }>>([]);

  const { result, isLoading, classify } = useMLClassification({
    symbol,
    timeframe,
    config,
  });

  // Update history ref when result changes (no state update in effect)
  if (enabled && result) {
    const lastEntry = historyRef.current[0];
    const isNewResult = !lastEntry || 
      lastEntry.result.direction !== result.direction ||
      lastEntry.result.probability !== result.probability;
    
    if (isNewResult) {
      historyRef.current = [{
        timestamp: Date.now(),
        result,
      }, ...historyRef.current.slice(0, 99)];
    }
  }

  return {
    result: enabled ? result : null,
    history: historyRef.current,
    isLoading,
    classify,
  };
}

/**
 * Hook for batch classification of multiple symbols
 */
export function useBatchClassification() {
  const [results, setResults] = useState<Record<string, ClassificationResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const classifyBatch = useCallback(async (
    symbols: string[],
    getPriceData: (symbol: string) => Promise<{
      high: number[];
      low: number[];
      close: number[];
      volume?: number[];
    }>,
    config: MLClassifyConfig = {}
  ) => {
    setIsLoading(true);
    setErrors({});

    const newResults: Record<string, ClassificationResult> = {};
    const newErrors: Record<string, string> = {};

    await Promise.all(symbols.map(async (symbol) => {
      try {
        const priceData = await getPriceData(symbol);
        
        const response = await fetch('/api/ml/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            timeframe: '1h',
            priceData,
            config,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.success) {
          newResults[symbol] = data.result;
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (err) {
        newErrors[symbol] = err instanceof Error ? err.message : 'Unknown error';
      }
    }));

    setResults(newResults);
    setErrors(newErrors);
    setIsLoading(false);
  }, []);

  return {
    results,
    errors,
    isLoading,
    classifyBatch,
  };
}

export default { useMLClassification, useRealtimeClassification, useBatchClassification };
