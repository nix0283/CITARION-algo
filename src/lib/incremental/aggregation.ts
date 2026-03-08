/**
 * OHLCV Aggregation for Real-time Data
 *
 * Converts tick/trade data into OHLCV bars for incremental processing.
 * Supports multiple timeframes and window types.
 */

import { OHLCV, type OHLCVBar, type TumblingSpec } from '@junduck/trading-indi';
import type { TickData, IncrementalBar, AggregationConfig } from './types';

// ==================== TICK AGGREGATOR ====================

/**
 * Aggregates tick data into OHLCV bars for incremental indicator processing.
 * Essential for WebSocket tick streams.
 */
export class TickAggregator {
  private ohlv: InstanceType<typeof OHLCV>;
  private intervalSeconds: number;
  private onBarComplete?: (bar: IncrementalBar) => void;
  private currentBar: IncrementalBar | null = null;
  private barCount = 0;

  constructor(config: AggregationConfig) {
    this.intervalSeconds = config.interval;
    this.onBarComplete = config.onBarComplete;

    const spec: TumblingSpec = {
      type: 'tumbling',
      interval_ms: config.interval * 1000,
    };

    this.ohlv = new OHLCV(spec);
  }

  /**
   * Process a tick and return current bar state
   */
  onTick(tick: TickData): IncrementalBar | null {
    const ohlcvBar = this.ohlv.onTick({
      price: tick.price,
      volume: tick.volume,
      timestamp: tick.timestamp,
      side: tick.side,
    });

    if (ohlcvBar) {
      // Bar completed
      this.barCount++;
      const bar: IncrementalBar = {
        open: ohlcvBar.open,
        high: ohlcvBar.high,
        low: ohlcvBar.low,
        close: ohlcvBar.close,
        volume: ohlcvBar.volume,
        timestamp: ohlcvBar.timestamp,
      };

      this.currentBar = bar;
      this.onBarComplete?.(bar);
      return bar;
    }

    // Return current incomplete bar
    const current = this.ohlv.getCurrent();
    if (current) {
      this.currentBar = {
        open: current.open,
        high: current.high,
        low: current.low,
        close: current.close,
        volume: current.volume,
        timestamp: current.timestamp,
      };
    }

    return null;
  }

  /**
   * Get current incomplete bar
   */
  getCurrentBar(): IncrementalBar | null {
    return this.currentBar;
  }

  /**
   * Get bar count
   */
  getBarCount(): number {
    return this.barCount;
  }

  /**
   * Reset aggregator
   */
  reset(): void {
    this.ohlv.reset();
    this.currentBar = null;
    this.barCount = 0;
  }
}

// ==================== MULTI-TIMEFRAME AGGREGATOR ====================

/**
 * Manages multiple timeframes for multi-timeframe analysis
 */
export class MultiTimeframeAggregator {
  private aggregators: Map<string, TickAggregator> = new Map();
  private onBarComplete?: (timeframe: string, bar: IncrementalBar) => void;

  constructor(
    timeframes: Array<{ name: string; interval: number }>,
    onBarComplete?: (timeframe: string, bar: IncrementalBar) => void
  ) {
    this.onBarComplete = onBarComplete;

    for (const tf of timeframes) {
      this.aggregators.set(
        tf.name,
        new TickAggregator({
          interval: tf.interval,
          onBarComplete: (bar) => this.onBarComplete?.(tf.name, bar),
        })
      );
    }
  }

  /**
   * Process tick across all timeframes
   */
  onTick(tick: TickData): Map<string, IncrementalBar | null> {
    const results = new Map<string, IncrementalBar | null>();

    for (const [name, aggregator] of this.aggregators) {
      results.set(name, aggregator.onTick(tick));
    }

    return results;
  }

  /**
   * Get aggregator by timeframe name
   */
  getAggregator(timeframe: string): TickAggregator | undefined {
    return this.aggregators.get(timeframe);
  }

  /**
   * Get all current bars
   */
  getAllCurrentBars(): Map<string, IncrementalBar | null> {
    const bars = new Map<string, IncrementalBar | null>();

    for (const [name, aggregator] of this.aggregators) {
      bars.set(name, aggregator.getCurrentBar());
    }

    return bars;
  }

  /**
   * Reset all aggregators
   */
  reset(): void {
    for (const aggregator of this.aggregators.values()) {
      aggregator.reset();
    }
  }
}

// ==================== WEBSOCKET ADAPTER ====================

export interface WebSocketAdapterConfig {
  symbol: string;
  timeframes: Array<{ name: string; interval: number }>;
  onBar: (timeframe: string, bar: IncrementalBar) => void;
  onTick?: (tick: TickData) => void;
}

/**
 * Adapter for processing WebSocket trade streams
 */
export class WebSocketDataAdapter {
  private symbol: string;
  private multiAggregator: MultiTimeframeAggregator;
  private onTick?: (tick: TickData) => void;

  constructor(config: WebSocketAdapterConfig) {
    this.symbol = config.symbol;
    this.onTick = config.onTick;

    this.multiAggregator = new MultiTimeframeAggregator(
      config.timeframes,
      config.onBar
    );
  }

  /**
   * Process a trade from WebSocket
   * Compatible with Binance, Bybit, OKX trade formats
   */
  processTrade(trade: {
    price: string | number;
    quantity: string | number;
    timestamp?: number;
    side?: 'buy' | 'sell';
  }): Map<string, IncrementalBar | null> {
    const tick: TickData = {
      price: typeof trade.price === 'string' ? parseFloat(trade.price) : trade.price,
      volume: typeof trade.quantity === 'string' ? parseFloat(trade.quantity) : trade.quantity,
      timestamp: trade.timestamp,
      side: trade.side,
    };

    this.onTick?.(tick);
    return this.multiAggregator.onTick(tick);
  }

  /**
   * Process Binance trade message
   */
  processBinanceTrade(msg: {
    p: string;
    q: string;
    T: number;
    m: boolean;
  }): Map<string, IncrementalBar | null> {
    return this.processTrade({
      price: msg.p,
      quantity: msg.q,
      timestamp: msg.T,
      side: msg.m ? 'sell' : 'buy',
    });
  }

  /**
   * Process Bybit trade message
   */
  processBybitTrade(msg: {
    price: string;
    size: string;
    time: number;
    side: string;
  }): Map<string, IncrementalBar | null> {
    return this.processTrade({
      price: msg.price,
      quantity: msg.size,
      timestamp: msg.time,
      side: msg.side.toLowerCase() as 'buy' | 'sell',
    });
  }

  /**
   * Get current bars for all timeframes
   */
  getCurrentBars(): Map<string, IncrementalBar | null> {
    return this.multiAggregator.getAllCurrentBars();
  }

  /**
   * Reset adapter
   */
  reset(): void {
    this.multiAggregator.reset();
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Create a simple tick aggregator
 */
export function createTickAggregator(
  intervalSeconds: number,
  onBarComplete?: (bar: IncrementalBar) => void
): TickAggregator {
  return new TickAggregator({
    interval: intervalSeconds,
    onBarComplete,
  });
}

/**
 * Create a WebSocket data adapter
 */
export function createWebSocketAdapter(config: WebSocketAdapterConfig): WebSocketDataAdapter {
  return new WebSocketDataAdapter(config);
}

/**
 * Create common timeframe configuration
 */
export function createCommonTimeframes(): Array<{ name: string; interval: number }> {
  return [
    { name: '1m', interval: 60 },
    { name: '5m', interval: 300 },
    { name: '15m', interval: 900 },
    { name: '1h', interval: 3600 },
    { name: '4h', interval: 14400 },
  ];
}
