/**
 * Lumibot Integration Types
 * Type definitions for Lumibot Python service integration
 */

// ============== Strategy Types ==============

export interface StrategyConfig {
  name: string;
  symbol: string;
  timeframe: string;
  parameters: Record<string, unknown>;
}

export interface StrategyInfo {
  name: string;
  class: string;
  description: string;
  default_parameters: Record<string, unknown>;
}

export interface Strategy {
  name: string;
  class: string;
  description: string;
}

// ============== Backtesting Types ==============

export interface BacktestRequest {
  strategy: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_cash: number;
  parameters: Record<string, unknown>;
}

export interface BacktestResult {
  strategy: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_cash: number;
  final_value: number;
  total_return: number;
  total_return_pct: number;
  max_drawdown: number;
  sharpe_ratio: number;
  win_rate: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  signals: Signal[];
  equity_curve: EquityPoint[];
}

export interface EquityPoint {
  date: string;
  equity: number;
  return_pct: number;
}

// ============== Live Trading Types ==============

export interface LiveTradingRequest {
  strategy: string;
  symbol: string;
  broker: string;
  paper_trading: boolean;
  parameters: Record<string, unknown>;
}

export interface ActiveStrategy {
  strategy: string;
  symbol: string;
  broker: string;
  paper_trading: boolean;
  status: 'starting' | 'running' | 'paused' | 'stopped' | 'error';
  started_at: string;
  stopped_at?: string;
  parameters: Record<string, unknown>;
}

// ============== Signal Types ==============

export interface Signal {
  id: string;
  type: SignalType;
  timestamp: string;
  strategy: string;
  data: SignalData;
}

export type SignalType = 
  | 'BUY' 
  | 'SELL' 
  | 'GRID_INITIALIZED' 
  | 'GRID_FILLED'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED';

export interface SignalData {
  symbol?: string;
  price?: number;
  size?: number;
  rsi?: number;
  macd?: number;
  signal?: number;
  histogram?: number;
  upper_band?: number;
  middle_band?: number;
  lower_band?: number;
  reason?: string;
  pnl_percent?: number;
  center_price?: number;
  lower_price?: number;
  upper_price?: number;
  levels?: number;
}

// ============== Service Types ==============

export interface ServiceStatus {
  service: string;
  version: string;
  status: 'running' | 'stopped' | 'error';
  timestamp: string;
  uptime?: number;
  active_strategies?: number;
}

export interface LumibotConfig {
  host: string;
  port: number;
  timeout: number;
  retries: number;
}

// ============== Broker Types ==============

export interface BrokerConfig {
  broker_type: 'ccxt' | 'alpaca' | 'ib' | 'paper';
  api_key?: string;
  api_secret?: string;
  paper_trading: boolean;
  exchange?: string; // For CCXT
  ib_port?: number; // For Interactive Brokers
  ib_client_id?: number;
}

export const SUPPORTED_BROKERS = [
  { id: 'ccxt', name: 'CCXT (Crypto)', exchanges: ['binance', 'bybit', 'okx', 'bitget', 'kucoin'] },
  { id: 'alpaca', name: 'Alpaca (Stocks)', exchanges: [] },
  { id: 'ib', name: 'Interactive Brokers', exchanges: [] },
  { id: 'paper', name: 'Paper Trading', exchanges: [] },
] as const;

// ============== Predefined Strategies ==============

export const PREDEFINED_STRATEGIES = [
  {
    id: 'rsi_reversal',
    name: 'RSI Reversal',
    description: 'Mean-reversion strategy based on RSI indicator',
    category: 'mean-reversion',
    timeframe: '1h',
    parameters: {
      rsi_period: { type: 'number', default: 14, min: 5, max: 50 },
      oversold: { type: 'number', default: 30, min: 10, max: 40 },
      overbought: { type: 'number', default: 70, min: 60, max: 90 },
      position_size: { type: 'number', default: 0.1, min: 0.01, max: 1 },
    },
  },
  {
    id: 'macd_trend',
    name: 'MACD Trend Following',
    description: 'Trend following strategy based on MACD crossovers',
    category: 'trend-following',
    timeframe: '4h',
    parameters: {
      fast_period: { type: 'number', default: 12, min: 5, max: 30 },
      slow_period: { type: 'number', default: 26, min: 15, max: 50 },
      signal_period: { type: 'number', default: 9, min: 5, max: 20 },
      position_size: { type: 'number', default: 0.15, min: 0.01, max: 1 },
    },
  },
  {
    id: 'bollinger_reversion',
    name: 'Bollinger Bands Reversion',
    description: 'Mean-reversion strategy using Bollinger Bands',
    category: 'mean-reversion',
    timeframe: '1h',
    parameters: {
      period: { type: 'number', default: 20, min: 10, max: 50 },
      std_dev: { type: 'number', default: 2.0, min: 1, max: 3 },
      position_size: { type: 'number', default: 0.1, min: 0.01, max: 1 },
    },
  },
  {
    id: 'grid_trading',
    name: 'Grid Trading',
    description: 'Grid trading strategy for sideways markets',
    category: 'grid',
    timeframe: '1h',
    parameters: {
      grid_levels: { type: 'number', default: 10, min: 5, max: 20 },
      grid_spacing: { type: 'number', default: 0.02, min: 0.005, max: 0.1 },
      position_size: { type: 'number', default: 0.05, min: 0.01, max: 0.5 },
    },
  },
] as const;

// ============== Timeframes ==============

export const SUPPORTED_TIMEFRAMES = [
  { id: '1m', name: '1 Minute' },
  { id: '5m', name: '5 Minutes' },
  { id: '15m', name: '15 Minutes' },
  { id: '1h', name: '1 Hour' },
  { id: '4h', name: '4 Hours' },
  { id: '1d', name: '1 Day' },
] as const;
