/**
 * Vision Bot Types - Market Forecasting Module
 *
 * Based on market_analyzer_crypto by roman-boop
 * Provides 24-hour market forecast with probability-based signals
 */

// --------------------------------------------------
// CORE TYPES
// --------------------------------------------------

export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// --------------------------------------------------
// INDICATORS
// --------------------------------------------------

export interface AssetIndicators {
  roc_24h: number;          // 24-hour Rate of Change
  atr_pct: number;          // Average True Range percentage
  trend_strength: number;   // EMA12/EMA26 trend
  volume_ratio: number;     // Current volume vs 24h MA
}

export interface AggregatedIndicators extends AssetIndicators {
  crypto_cnt: number;       // Number of crypto assets analyzed
  stock_cnt: number;        // Number of stock indices analyzed
  gold_roc: number;         // Gold ROC (separate for correlation)
}

export interface Correlations {
  [key: string]: number;    // symbol_vs_BTC: correlation value
  avg_corr: number;         // Average correlation strength
}

// --------------------------------------------------
// FORECAST
// --------------------------------------------------

export interface ForecastProbabilities {
  upward: number;           // Probability of upward movement (0-1)
  downward: number;         // Probability of downward movement (0-1)
  consolidation: number;    // Probability of consolidation (0-1)
}

export interface MarketForecast {
  timestamp: Date;
  symbol: string;
  probabilities: ForecastProbabilities;
  indicators: AggregatedIndicators;
  correlations: Correlations;
  signal: ForecastSignal;
  confidence: number;       // Signal confidence (0-1)
}

/**
 * Enhanced Market Forecast with direction and probability breakdown
 */
export interface EnhancedMarketForecast {
  direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
  confidence: number;       // Signal confidence (0-1)
  upwardProb: number;       // Probability of upward movement (0-1)
  downwardProb: number;     // Probability of downward movement (0-1)
  consolidationProb: number; // Probability of consolidation (0-1)
  predictedChange24h: number; // Predicted 24-hour change in percentage
  timestamp: Date;
  symbol: string;
}

export type ForecastSignal = 'LONG' | 'SHORT' | 'NEUTRAL';

// --------------------------------------------------
// TRADING STRATEGIES
// --------------------------------------------------

export type StrategyType = 'basic' | 'multi_tp' | 'trailing' | 'reentry_24h';

export interface StrategyConfig {
  type: StrategyType;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxReentries: number;
  trailingPercent?: number;
}

export const STRATEGY_PRESETS: Record<StrategyType, StrategyConfig> = {
  basic: {
    type: 'basic',
    stopLossPercent: 2,
    takeProfitPercent: 4,
    maxReentries: 0,
  },
  multi_tp: {
    type: 'multi_tp',
    stopLossPercent: 2,
    takeProfitPercent: 6, // Multiple TPs at 2%, 4%, 6%
    maxReentries: 0,
  },
  trailing: {
    type: 'trailing',
    stopLossPercent: 2,
    takeProfitPercent: 0, // No fixed TP
    maxReentries: 0,
    trailingPercent: 2,
  },
  reentry_24h: {
    type: 'reentry_24h',
    stopLossPercent: 3,
    takeProfitPercent: 0, // No fixed TP
    maxReentries: 3,
  },
};

// --------------------------------------------------
// RISK PROFILES
// --------------------------------------------------

export type RiskProfileType = 'easy' | 'normal' | 'hard' | 'scalper';

export interface RiskProfile {
  type: RiskProfileType;
  riskPerTrade: number;     // Fraction of capital to risk
  leverage: number;
  maxReentries: number;
  targetMonthly: number;    // Target monthly return
  maxTradesPerDay?: number;
}

export const RISK_PROFILES: Record<RiskProfileType, RiskProfile> = {
  easy: {
    type: 'easy',
    riskPerTrade: 0.05,
    leverage: 2,
    maxReentries: 1,
    targetMonthly: 0.03,
  },
  normal: {
    type: 'normal',
    riskPerTrade: 0.10,
    leverage: 3,
    maxReentries: 2,
    targetMonthly: 0.06,
  },
  hard: {
    type: 'hard',
    riskPerTrade: 0.15,
    leverage: 5,
    maxReentries: 3,
    targetMonthly: 0.10,
  },
  scalper: {
    type: 'scalper',
    riskPerTrade: 0.02,
    leverage: 10,
    maxReentries: 5,
    targetMonthly: 0.05,
    maxTradesPerDay: 10,
  },
};

// --------------------------------------------------
// VISION BOT CONFIG
// --------------------------------------------------

export interface VisionBotConfig {
  id: string;
  name: string;
  enabled: boolean;

  // Data sources
  cryptoSymbols: string[];      // e.g., ['BTC/USDT', 'ETH/USDT', ...]
  stockIndices: string[];       // e.g., ['^GSPC', '^IXIC', '^DJI']
  goldSymbol: string;           // Gold futures symbol

  // Analysis parameters
  timeframe: '1h' | '4h' | '1d';
  lookbackDays: number;
  volatilityLow: number;        // Low volatility threshold
  volatilityHigh: number;       // High volatility threshold
  trendThreshold: number;       // Trend significance threshold
  correlationWeight: number;    // Weight for cross-asset correlation

  // Trading settings
  tradingEnabled: boolean;      // Enable actual trading
  strategy: StrategyType;
  riskProfile: RiskProfileType;
  initialCapital: number;
  tradingFee: number;           // Exchange fee (e.g., 0.001 = 0.1%)

  // Notifications
  telegramEnabled: boolean;
  telegramChatId?: string;

  // Schedule
  forecastIntervalMinutes: number;  // How often to run forecast
  tradingCycleHours: number;        // Trading cycle duration (default: 24)
}

export const DEFAULT_VISION_CONFIG: Partial<VisionBotConfig> = {
  enabled: true,
  cryptoSymbols: [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ADA/USDT', 'DOT/USDT',
    'LINK/USDT', 'LTC/USDT', 'TRX/USDT', 'AVAX/USDT', 'DOGE/USDT'
  ],
  stockIndices: ['^GSPC', '^IXIC', '^DJI'],
  goldSymbol: 'GC=F',
  timeframe: '1h',
  lookbackDays: 30,
  volatilityLow: 0.01,
  volatilityHigh: 0.05,
  trendThreshold: 0.02,
  correlationWeight: 0.30,
  tradingEnabled: false,
  strategy: 'reentry_24h',
  riskProfile: 'normal',
  initialCapital: 10000,
  tradingFee: 0.001,
  telegramEnabled: false,
  forecastIntervalMinutes: 60,
  tradingCycleHours: 24,
};

// --------------------------------------------------
// TRADING STATE
// --------------------------------------------------

export interface Position {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  entryTime: Date;
  stopLoss?: number;
  takeProfit?: number;
  reentries: number;
  highSinceEntry?: number;
  lowSinceEntry?: number;
}

export interface Trade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: Date;
  entryPrice: number;
  exitTime?: Date;
  exitPrice?: number;
  size: number;
  pnl?: number;
  exitReason?: 'SL' | 'TP' | 'cycle_start' | 'manual';
  reentry?: boolean;
}

export interface VisionBotStatus {
  id: string;
  isRunning: boolean;
  currentSignal: ForecastSignal;
  currentForecast?: MarketForecast;
  currentPosition?: Position;
  equity: number;
  trades: Trade[];
  lastForecastTime?: Date;
  totalReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

// --------------------------------------------------
// BACKTEST
// --------------------------------------------------

export interface BacktestResult {
  symbol: string;
  strategy: StrategyType;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  finalCapital: number;
  totalReturnPct: number;
  cagrPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  numTrades: number;
  winRatePct: number;
  avgTradePnl: number;
  profitFactor: number;
  avgTradeDurationHours: number;
  trades: Trade[];
}

// --------------------------------------------------
// API RESPONSE TYPES
// --------------------------------------------------

export interface VisionForecastResponse {
  success: boolean;
  forecast?: MarketForecast;
  error?: string;
}

export interface VisionStatusResponse {
  success: boolean;
  status?: VisionBotStatus;
  error?: string;
}

export interface VisionBacktestRequest {
  symbol: string;
  strategy: StrategyType;
  days: number;
  initialCapital?: number;
  riskPerTrade?: number;
  leverage?: number;
}

export interface VisionBacktestResponse {
  success: boolean;
  result?: BacktestResult;
  error?: string;
}
