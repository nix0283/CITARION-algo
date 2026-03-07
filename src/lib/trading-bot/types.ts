/**
 * Trend-Bot Core Types
 * Production-ready type definitions for multi-exchange trend following system
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum TradeDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
  FLAT = 'FLAT'
}

export enum TrendState {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH',
  RANGING = 'RANGING',
  REVERSAL = 'REVERSAL'
}

export enum SignalStrength {
  WEAK = 0.3,
  MODERATE = 0.6,
  STRONG = 0.9
}

export enum PositionStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  LIQUIDATED = 'LIQUIDATED'
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_MARKET = 'STOP_MARKET',
  STOP_LIMIT = 'STOP_LIMIT',
  TAKE_PROFIT = 'TAKE_PROFIT',
  TRAILING_STOP = 'TRAILING_STOP'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED'
}

export enum ExchangeId {
  BINANCE = 'binance',
  BYBIT = 'bybit',
  OKX = 'okx',
  BITGET = 'bitget',
  PAPER = 'paper'
}

export enum TradingMode {
  LIVE = 'LIVE',
  PAPER = 'PAPER',
  BACKTEST = 'BACKTEST'
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * OHLCV Candle data structure
 */
export interface Candle {
  time: number;        // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Trading pair configuration
 */
export interface TradingPair {
  symbol: string;           // e.g., 'BTCUSDT'
  baseAsset: string;        // e.g., 'BTC'
  quoteAsset: string;       // e.g., 'USDT'
  exchanges: ExchangeId[];  // Available exchanges
  minNotional: number;      // Minimum order size in quote currency
  pricePrecision: number;   // Decimal places for price
  quantityPrecision: number;// Decimal places for quantity
}

/**
 * Strategy parameters for EMA + SuperTrend
 */
export interface TrendStrategyConfig {
  // EMA Parameters
  emaFastPeriod: number;    // Default: 20
  emaMidPeriod: number;     // Default: 50
  emaSlowPeriod: number;    // Default: 200

  // SuperTrend Parameters
  supertrendPeriod: number; // Default: 10
  supertrendMultiplier: number; // Default: 3.0

  // Signal confirmation
  requireAllEMAAlign: boolean; // All EMAs must align for entry
  minVolumeMultiplier: number; // Volume must be X times average

  // Exit parameters
  useTrailingStop: boolean;
  trailingStopActivation: number; // Percentage profit to activate trailing
  trailingStopDistance: number;   // Percentage distance from peak
}

/**
 * Risk management configuration
 */
export interface RiskConfig {
  // Position sizing
  riskPerTradePercent: number;  // 0.5 = 0.5% of equity
  maxPositionSizePercent: number; // Max single position as % of equity
  maxOpenPositions: number;     // Max simultaneous positions

  // Correlation filter
  maxCorrelationThreshold: number; // 0.6 = reject if correlation > 0.6

  // Drawdown protection
  maxDrawdownPercent: number;   // 10% = halt trading after 10% DD
  dailyLossLimitPercent: number; // Daily loss limit

  // Kelly criterion
  useKellySizing: boolean;
  kellyFraction: number;        // 0.25 = quarter Kelly

  // Stop loss / Take profit
  defaultStopLossPercent: number;
  minRiskRewardRatio: number;   // Minimum 1:2 risk:reward
}

/**
 * Generated trading signal
 */
export interface TradingSignal {
  symbol: string;
  exchange: ExchangeId;
  direction: TradeDirection;
  strength: SignalStrength;
  confidence: number;          // 0-1

  // Entry details
  entryPrice: number;
  stopLoss: number;
  takeProfits: number[];       // Multiple TP levels

  // Metadata
  trendState: TrendState;
  supertrendValue: number;
  emaValues: {
    fast: number;
    mid: number;
    slow: number;
  };
  timestamp: number;
  reason: string;
}

/**
 * Position representation
 */
export interface Position {
  id: string;
  symbol: string;
  exchange: ExchangeId;
  direction: TradeDirection;
  status: PositionStatus;

  // Size and entry
  size: number;               // Position size in base asset
  entryPrice: number;
  notionalValue: number;      // Size * Entry Price

  // Risk management
  stopLoss: number;
  takeProfits: Array<{
    price: number;
    sizePercent: number;      // Percentage of position to close
    filled: boolean;
  }>;

  // P&L
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl: number;

  // Timestamps
  openedAt: number;
  updatedAt: number;
  closedAt?: number;

  // Trailing stop state
  trailingStopActivated: boolean;
  trailingStopPrice?: number;
  highestPrice?: number;      // For longs
  lowestPrice?: number;       // For shorts
}

/**
 * Order representation
 */
export interface Order {
  id: string;
  clientId: string;           // Our internal ID
  exchangeOrderId?: string;   // Exchange's order ID

  symbol: string;
  exchange: ExchangeId;
  direction: TradeDirection;
  type: OrderType;
  status: OrderStatus;

  // Size and price
  size: number;
  price?: number;             // For limit orders
  stopPrice?: number;         // For stop orders

  // Execution
  filledSize: number;
  avgFillPrice: number;
  fees: number;
  feeCurrency: string;

  // Metadata
  positionId?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

/**
 * Account state
 */
export interface AccountState {
  exchange: ExchangeId;
  balance: number;            // Available balance
  equity: number;             // Total equity (balance + unrealized PnL)
  unrealizedPnl: number;
  marginUsed: number;
  marginAvailable: number;
  positions: Position[];
  openOrders: Order[];
  lastUpdated: number;
}

/**
 * Bot state machine
 */
export interface BotState {
  mode: TradingMode;
  isActive: boolean;
  isHalted: boolean;          // Halted due to max drawdown

  // Account tracking
  accounts: Map<ExchangeId, AccountState>;

  // Position tracking
  positions: Map<string, Position>;  // positionId -> Position
  maxPositionsReached: boolean;

  // P&L tracking
  dailyPnL: number;
  totalPnL: number;
  peakEquity: number;
  currentDrawdown: number;

  // Signal history
  lastSignals: Map<string, TradingSignal>; // symbol -> last signal

  // Timestamps
  startedAt: number;
  lastUpdate: number;
}

/**
 * Correlation matrix entry
 */
export interface CorrelationEntry {
  symbol1: string;
  symbol2: string;
  correlation: number;        // -1 to 1
  period: number;             // Lookback period used
  timestamp: number;
}

/**
 * Bot configuration
 */
export interface TrendBotConfig {
  id: string;
  name: string;
  mode: TradingMode;

  // Trading pairs
  pairs: TradingPair[];

  // Strategy config
  strategy: TrendStrategyConfig;

  // Risk config
  risk: RiskConfig;

  // Exchange credentials (encrypted)
  exchanges: Map<ExchangeId, {
    apiKey: string;
    apiSecret: string;
    passphrase?: string;      // For OKX
    testnet: boolean;
  }>;

  // Runtime
  updateIntervalMs: number;   // How often to check for signals
  candleTimeframe: string;    // e.g., '1h', '4h'
}

/**
 * Trade execution result
 */
export interface ExecutionResult {
  success: boolean;
  order?: Order;
  position?: Position;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/**
 * Logger interface for dependency injection
 */
export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Event types for bot state changes
 */
export type BotEvent =
  | { type: 'SIGNAL_GENERATED'; signal: TradingSignal }
  | { type: 'POSITION_OPENED'; position: Position }
  | { type: 'POSITION_CLOSED'; position: Position; pnl: number }
  | { type: 'ORDER_FILLED'; order: Order }
  | { type: 'STOP_LOSS_HIT'; position: Position }
  | { type: 'TAKE_PROFIT_HIT'; position: Position; level: number }
  | { type: 'DRAWDOWN_WARNING'; currentDD: number; maxDD: number }
  | { type: 'BOT_HALTED'; reason: string }
  | { type: 'ERROR'; error: Error; context?: Record<string, unknown> };

export type BotEventHandler = (event: BotEvent) => void | Promise<void>;
