/**
 * Real-time OHLCV Data Hook
 *
 * Provides real-time candlestick updates via polling.
 * For WebSocket support, a separate service would be needed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Time } from 'lightweight-charts';

export interface RealtimeCandle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
}

export interface UseRealtimeOhlcvOptions {
  symbol: string;
  interval: string;
  enabled?: boolean;
  pollInterval?: number; // milliseconds
  onNewCandle?: (candle: RealtimeCandle) => void;
  onError?: (error: Error) => void;
}

export interface UseRealtimeOhlcvReturn {
  currentCandle: RealtimeCandle | null;
  latestPrice: number | null;
  isConnected: boolean;
  lastUpdate: Date | null;
}

/**
 * Hook for real-time OHLCV updates
 * Uses polling to fetch the latest candle data
 */
export function useRealtimeOhlcv(options: UseRealtimeOhlcvOptions): UseRealtimeOhlcvReturn {
  const {
    symbol,
    interval,
    enabled = true,
    pollInterval = 5000, // 5 seconds by default
    onNewCandle,
    onError,
  } = options;

  const [currentCandle, setCurrentCandle] = useState<RealtimeCandle | null>(null);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastCandleTimeRef = useRef<number>(0);

  const fetchLatestCandle = useCallback(async () => {
    if (!enabled || !symbol) return;

    try {
      // Fetch just the latest candle (limit=1)
      const response = await fetch(
        `/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=1&forceFetch=true`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.ohlcv && data.ohlcv.length > 0) {
        const candleData = data.ohlcv[data.ohlcv.length - 1];
        const candle: RealtimeCandle = {
          time: Math.floor(candleData[0] / 1000) as Time,
          open: candleData[1],
          high: candleData[2],
          low: candleData[3],
          close: candleData[4],
          volume: candleData[5],
          isFinal: Date.now() - candleData[0] > getIntervalMs(interval),
        };

        // Check if this is a new candle
        const candleTime = candleData[0];
        if (candleTime > lastCandleTimeRef.current) {
          lastCandleTimeRef.current = candleTime;
          onNewCandle?.(candle);
        }

        setCurrentCandle(candle);
        setLatestPrice(candle.close);
        setLastUpdate(new Date());
        setIsConnected(true);
      }
    } catch (error) {
      console.error('[Realtime OHLCV] Fetch error:', error);
      setIsConnected(false);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [symbol, interval, enabled, onNewCandle, onError]);

  // Start polling
  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }

    // Initial fetch
    fetchLatestCandle();

    // Set up polling
    pollRef.current = setInterval(fetchLatestCandle, pollInterval);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [enabled, fetchLatestCandle, pollInterval]);

  return {
    currentCandle,
    latestPrice,
    isConnected,
    lastUpdate,
  };
}

/**
 * Get interval duration in milliseconds
 */
function getIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60000,
    '3m': 180000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '2h': 7200000,
    '4h': 14400000,
    '6h': 21600000,
    '8h': 28800000,
    '12h': 43200000,
    '1d': 86400000,
    '3d': 259200000,
    '1w': 604800000,
    '1M': 2592000000,
  };
  return map[interval] || 60000;
}

/**
 * Hook for fetching historical OHLCV data with real-time updates
 */
export function useOhlcvWithRealtime(options: {
  symbol: string;
  interval: string;
  limit?: number;
  enabled?: boolean;
  realtimeEnabled?: boolean;
  pollInterval?: number;
}) {
  const {
    symbol,
    interval,
    limit = 500,
    enabled = true,
    realtimeEnabled = true,
    pollInterval = 5000,
  } = options;

  const [candles, setCandles] = useState<RealtimeCandle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch historical data
  const fetchHistorical = useCallback(async () => {
    if (!enabled || !symbol) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ohlcv?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.ohlcv && data.ohlcv.length > 0) {
        const ohlcv: RealtimeCandle[] = data.ohlcv.map((c: number[]) => ({
          time: Math.floor(c[0] / 1000) as Time,
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
          volume: c[5],
          isFinal: true,
        }));

        setCandles(ohlcv);
      } else {
        // No data from API, will use synthetic data in component
        setCandles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval, limit, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchHistorical();
  }, [fetchHistorical]);

  // Real-time updates
  const realtime = useRealtimeOhlcv({
    symbol,
    interval,
    enabled: enabled && realtimeEnabled && !isLoading,
    pollInterval,
    onNewCandle: useCallback((newCandle: RealtimeCandle) => {
      setCandles((prev) => {
        // Check if we need to update the last candle or add a new one
        const lastCandle = prev[prev.length - 1];

        if (lastCandle && lastCandle.time === newCandle.time) {
          // Update existing candle
          return [...prev.slice(0, -1), newCandle];
        } else {
          // Add new candle
          return [...prev, newCandle];
        }
      });
    }, []),
  });

  return {
    candles,
    isLoading,
    error,
    refetch: fetchHistorical,
    realtime,
  };
}
