/**
 * Incremental Indicators Module
 *
 * Real-time, stateful indicator calculations optimized for WebSocket streams.
 * Built on @junduck/trading-indi for O(1) incremental updates.
 *
 * Key Features:
 * - 80+ technical indicators with incremental updates
 * - 30+ candlestick patterns
 * - DAG flow system for complex strategies
 * - Tick-to-OHLCV aggregation
 * - Zero recalculation on new data
 *
 * @example
 * ```typescript
 * import { createIncrementalIndicators, createPatternManager } from '@/lib/incremental';
 *
 * // Create managers
 * const indicators = createIncrementalIndicators();
 * const patterns = createPatternManager();
 *
 * // Process real-time data
 * websocket.on('trade', (tick) => {
 *   aggregator.onTick(tick);
 * });
 *
 * aggregator.onBarComplete = (bar) => {
 *   const state = indicators.onUpdate(bar);
 *   const patternState = patterns.detect(bar);
 *
 *   console.log('RSI:', state.rsi.value);
 *   console.log('Patterns:', patternState.bullishPatterns);
 *   console.log('Signals:', state.signals);
 * });
 * ```
 */

// Types
export type {
  IncrementalBar,
  TickData,
  IndicatorState,
  IndicatorSignal,
  RSIResult,
  MACDResult,
  BBANDSResult,
  ATRResult,
  ADXResult,
  STOCHResult,
  IchimokuResult,
  PatternResult,
  PatternsState,
  AggregationConfig,
  WindowType,
  FlowNodeDef,
  FlowGraphDef,
  FlowResult,
} from './types';

// Indicator Manager
export {
  IncrementalIndicatorManager,
  createIncrementalIndicators,
  createScalpingIndicators,
  createSwingIndicators,
  createFullIndicators,
  type IndicatorSetConfig,
} from './indicator-manager';

// Pattern Recognition
export {
  PatternManager,
  createPatternManager,
  generatePatternSignals,
  type PatternSignal,
} from './patterns';

// Aggregation
export {
  TickAggregator,
  MultiTimeframeAggregator,
  WebSocketDataAdapter,
  createTickAggregator,
  createWebSocketAdapter,
  createCommonTimeframes,
  type WebSocketAdapterConfig,
} from './aggregation';

// Flow System
export {
  IndicatorFlowBuilder,
  FlowExecutor,
  createFlowBuilder,
  createFlowExecutor,
  createRSIStrategy,
  createMACDStrategy,
  createEMACrossStrategy,
  createMultiIndicatorStrategy,
  createBollingerSqueezeStrategy,
  generateFlowSignals,
} from './flow';
