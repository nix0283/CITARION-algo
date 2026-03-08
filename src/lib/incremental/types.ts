/**
 * Incremental Indicators Types
 *
 * Type definitions for incremental (stateful) indicator calculations.
 * These types are compatible with @junduck/trading-indi library.
 */

// ==================== BAR DATA ====================

/**
 * OHLCV bar data for incremental processing
 */
export interface IncrementalBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
}

/**
 * Tick data for real-time processing
 */
export interface TickData {
  price: number;
  volume: number;
  timestamp?: number;
  side?: 'buy' | 'sell';
}

// ==================== INDICATOR CONFIG ====================

/**
 * Base configuration for incremental indicators
 */
export interface IncrementalIndicatorConfig {
  /** Whether indicator is enabled */
  enabled?: boolean;
}

/**
 * RSI configuration
 */
export interface RSIConfig extends IncrementalIndicatorConfig {
  period: number;
}

/**
 * EMA configuration
 */
export interface EMAConfig extends IncrementalIndicatorConfig {
  period: number;
}

/**
 * SMA configuration
 */
export interface SMAConfig extends IncrementalIndicatorConfig {
  period: number;
}

/**
 * MACD configuration
 */
export interface MACDConfig extends IncrementalIndicatorConfig {
  periodFast: number;
  periodSlow: number;
  periodSignal: number;
}

/**
 * Bollinger Bands configuration
 */
export interface BBANDSConfig extends IncrementalIndicatorConfig {
  period: number;
  stddev: number;
}

/**
 * ATR configuration
 */
export interface ATRConfig extends IncrementalIndicatorConfig {
  period: number;
}

/**
 * ADX configuration
 */
export interface ADXConfig extends IncrementalIndicatorConfig {
  period: number;
}

/**
 * Stochastic configuration
 */
export interface STOCHConfig extends IncrementalIndicatorConfig {
  periodK: number;
  periodD: number;
  smoothK: number;
}

/**
 * Ichimoku configuration
 */
export interface IchimokuConfig extends IncrementalIndicatorConfig {
  tenkanPeriod: number;
  kijunPeriod: number;
  senkouBPeriod: number;
  displacement: number;
}

// ==================== INDICATOR RESULTS ====================

/**
 * RSI result
 */
export interface RSIResult {
  value: number | null;
  overbought: boolean;
  oversold: boolean;
}

/**
 * MACD result
 */
export interface MACDResult {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  crossover: 'bullish' | 'bearish' | null;
}

/**
 * Bollinger Bands result
 */
export interface BBANDSResult {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  bandwidth: number | null;
  percentB: number | null;
}

/**
 * ATR result
 */
export interface ATRResult {
  value: number | null;
  tr: number | null;
}

/**
 * ADX result
 */
export interface ADXResult {
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  trend: 'strong_bullish' | 'strong_bearish' | 'weak' | null;
}

/**
 * Stochastic result
 */
export interface STOCHResult {
  k: number | null;
  d: number | null;
  overbought: boolean;
  oversold: boolean;
}

/**
 * Ichimoku result
 */
export interface IchimokuResult {
  tenkan: number | null;
  kijun: number | null;
  senkouA: number | null;
  senkouB: number | null;
  chikou: number | null;
  cloudPosition: 'above' | 'below' | 'inside' | null;
}

/**
 * Complete indicator state for a single bar
 */
export interface IndicatorState {
  timestamp: number;

  // Moving averages
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  sma50: number | null;

  // Momentum
  rsi: RSIResult;
  macd: MACDResult;

  // Volatility
  atr: ATRResult;
  bbands: BBANDSResult;

  // Trend
  adx: ADXResult;

  // Oscillators
  stoch: STOCHResult;

  // Signals
  signals: IndicatorSignal[];
}

/**
 * Trading signal from indicators
 */
export interface IndicatorSignal {
  indicator: string;
  type: 'buy' | 'sell';
  strength: 'strong' | 'moderate' | 'weak';
  reason: string;
  value?: number;
}

// ==================== PATTERN TYPES ====================

/**
 * Candlestick pattern result
 */
export interface PatternResult {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  bar: IncrementalBar;
}

/**
 * All detected patterns for a bar
 */
export interface PatternsState {
  // Single-bar patterns
  doji: boolean;
  hammer: boolean;
  invertedHammer: boolean;
  marubozuWhite: boolean;
  marubozuBlack: boolean;
  spinningTop: boolean;
  dragonflyDoji: boolean;
  gravestoneDoji: boolean;
  highWave: boolean;

  // Two-bar patterns
  bullishEngulfing: boolean;
  bearishEngulfing: boolean;
  bullishHarami: boolean;
  bearishHarami: boolean;
  tweezerTops: boolean;
  tweezerBottoms: boolean;
  insideBar: boolean;
  outsideBar: boolean;

  // Multi-bar patterns
  morningStar: boolean;
  eveningStar: boolean;
  threeWhiteSoldiers: boolean;
  threeBlackCrows: boolean;

  // Summary
  bullishPatterns: string[];
  bearishPatterns: string[];
  neutralPatterns: string[];
}

// ==================== AGGREGATION TYPES ====================

/**
 * OHLCV aggregation configuration
 */
export interface AggregationConfig {
  interval: number; // in seconds
  onBarComplete?: (bar: IncrementalBar) => void;
}

/**
 * Window types for aggregation
 */
export type WindowType = 'tumbling' | 'session' | 'volume';

// ==================== FLOW TYPES ====================

/**
 * Flow node definition for DAG
 */
export interface FlowNodeDef {
  id: string;
  type: string;
  inputs: string[];
  params?: Record<string, unknown>;
}

/**
 * Flow graph definition
 */
export interface FlowGraphDef {
  nodes: FlowNodeDef[];
  outputs: string[];
}

/**
 * Flow execution result
 */
export interface FlowResult {
  [nodeId: string]: unknown;
}
