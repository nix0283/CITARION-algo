/**
 * ORION BOT - Trend-Following Hunter
 *
 * Named after the Greek mythological hunter, Orion pursues trends
 * across markets with disciplined risk management.
 *
 * Strategy: EMA + Supertrend
 * Mode: 24/7, Hedging enabled
 * Validation: Paper trading mandatory before live
 */

// =============================================================================
// CORE SIGNAL TYPES
// =============================================================================

export type TrendDirection = 'LONG' | 'SHORT' | 'FLAT';

export type MarketRegime = 'trending' | 'ranging' | 'volatile' | 'transitioning';

export interface TrendSignal {
  /** Unique signal identifier */
  id: string;
  /** Timestamp of signal generation */
  timestamp: number;
  /** Trading pair */
  symbol: string;
  /** Exchange identifier */
  exchange: string;
  /** Direction of the trend */
  direction: TrendDirection;
  /** Signal strength 0-1 (based on EMA alignment + Supertrend confirmation) */
  strength: number;
  /** Confidence level 0-1 (based on multiple timeframe confirmation) */
  confidence: number;
  /** Detected market regime */
  regime: MarketRegime;
  /** EMA values at signal time */
  ema: {
    ema20: number;
    ema50: number;
    ema200: number;
    /** EMA alignment: 1 = bullish, -1 = bearish, 0 = mixed */
    alignment: number;
  };
  /** Supertrend values at signal time */
  supertrend: {
    value: number;
    direction: 1 | -1; // 1 = uptrend, -1 = downtrend
    /** Distance from price to supertrend line as % */
    distance: number;
  };
  /** ATR for volatility context */
  atr: number;
  /** Price at signal */
  price: number;
  /** Signal source components */
  components: {
    emaAligned: boolean;
    supertrendConfirmed: boolean;
    volumeConfirmed: boolean;
    momentumConfirmed: boolean;
  };
}

// =============================================================================
// POSITION MANAGEMENT
// =============================================================================

export type PositionSide = 'LONG' | 'SHORT';

export type PositionStatus = 'OPENING' | 'ACTIVE' | 'CLOSING' | 'CLOSED' | 'LIQUIDATED';

export interface OrionPosition {
  /** Position ID */
  id: string;
  /** Signal that opened this position */
  signalId: string;
  /** Exchange */
  exchange: string;
  /** Trading pair */
  symbol: string;
  /** Position side */
  side: PositionSide;
  /** Current status */
  status: PositionStatus;
  /** Entry price (average) */
  entryPrice: number;
  /** Current price */
  currentPrice: number;
  /** Position size in base currency */
  size: number;
  /** Position size in quote currency */
  value: number;
  /** Leverage used */
  leverage: number;
  /** Unrealized PnL */
  unrealizedPnL: number;
  /** Unrealized PnL % */
  unrealizedPnLPct: number;
  /** Realized PnL (after close) */
  realizedPnL: number;
  /** Stop loss price */
  stopLoss: number;
  /** Take profit levels */
  takeProfits: TakeProfitLevel[];
  /** Trailing stop configuration */
  trailingStop: TrailingStopConfig;
  /** Position opened timestamp */
  openedAt: number;
  /** Position closed timestamp */
  closedAt: number | null;
  /** Last update timestamp */
  updatedAt: number;
  /** Risk metrics for this position */
  risk: PositionRisk;
  /** Hedging info (for hedging mode) */
  hedgeInfo?: HedgeInfo;
}

export interface TakeProfitLevel {
  id: string;
  price: number;
  sizePct: number; // % of position to close
  status: 'pending' | 'triggered' | 'executed';
  triggeredAt?: number;
}

export interface TrailingStopConfig {
  enabled: boolean;
  activationPct: number; // Activate after this % profit
  trailPct: number; // Trail distance as % of price
  currentTrigger: number | null;
}

export interface PositionRisk {
  /** Risk per trade as % of capital */
  riskPct: number;
  /** Risk amount in quote currency */
  riskAmount: number;
  /** Position score (Kelly-based) */
  kellyScore: number;
  /** Risk/Reward ratio */
  riskRewardRatio: number;
  /** Maximum adverse excursion observed */
  maxAdverseExcursion: number;
  /** Maximum favorable excursion observed */
  maxFavorableExcursion: number;
}

export interface HedgeInfo {
  /** Paired position ID (if hedged) */
  pairedPositionId?: string;
  /** Net exposure after hedging */
  netExposure: number;
  /** Hedge status */
  hedgeStatus: 'unhedged' | 'partial' | 'full';
}

// =============================================================================
// RISK MANAGEMENT
// =============================================================================

export interface RiskConfig {
  /** Risk per trade: fixed % or Kelly-adjusted */
  riskPerTrade: {
    mode: 'fixed' | 'kelly' | 'fractional_kelly';
    /** Fixed % when mode = 'fixed' */
    fixedPct?: number;
    /** Kelly fraction when mode = 'fractional_kelly' (e.g., 0.25 = quarter Kelly) */
    kellyFraction?: number;
    /** Maximum risk % regardless of Kelly */
    maxRiskPct: number;
    /** Minimum risk % (floor) */
    minRiskPct: number;
  };
  /** Position limits */
  limits: {
    /** Maximum concurrent positions */
    maxPositions: number;
    /** Maximum positions per symbol */
    maxPositionsPerSymbol: number;
    /** Maximum positions per exchange */
    maxPositionsPerExchange: number;
    /** Maximum correlation between positions */
    maxCorrelation: number;
    /** Maximum portfolio drawdown before halt */
    maxDrawdownPct: number;
    /** Daily loss limit */
    dailyLossLimitPct: number;
  };
  /** Leverage settings */
  leverage: {
    /** Default leverage */
    default: number;
    /** Maximum allowed leverage */
    max: number;
    /** Reduce leverage in volatile regime */
    volatileRegimeMultiplier: number;
  };
  /** Stop loss settings */
  stopLoss: {
    /** Default stop loss ATR multiplier */
    atrMultiplier: number;
    /** Minimum stop loss % */
    minPct: number;
    /** Maximum stop loss % */
    maxPct: number;
  };
  /** Take profit settings */
  takeProfit: {
    /** Default take profit levels */
    levels: {
      /** Level 1: conservative */
      tp1: { riskRewardRatio: number; sizePct: number };
      /** Level 2: moderate */
      tp2: { riskRewardRatio: number; sizePct: number };
      /** Level 3: aggressive */
      tp3: { riskRewardRatio: number; sizePct: number };
    };
  };
}

export interface RiskMetrics {
  /** Current portfolio risk */
  portfolioRisk: number;
  /** Current drawdown */
  drawdown: number;
  /** Current daily P&L */
  dailyPnL: number;
  /** Open risk (sum of all position risks) */
  openRisk: number;
  /** Used margin */
  usedMargin: number;
  /** Available margin */
  availableMargin: number;
  /** Margin ratio */
  marginRatio: number;
  /** Win rate (rolling 100 trades) */
  winRate: number;
  /** Average win/loss ratio */
  avgWinLossRatio: number;
  /** Kelly optimal fraction */
  kellyOptimal: number;
  /** Expected value per trade */
  expectedValue: number;
  /** Sharpe ratio (rolling) */
  sharpeRatio: number;
  /** Last updated */
  updatedAt: number;
}

// =============================================================================
// STRATEGY CONFIGURATION
// =============================================================================

export interface StrategyConfig {
  /** EMA periods for trend detection */
  ema: {
    /** Fast EMA period */
    fast: number; // 20
    /** Medium EMA period */
    medium: number; // 50
    /** Slow EMA period */
    slow: number; // 200
  };
  /** Supertrend parameters */
  supertrend: {
    /** ATR period for supertrend */
    period: number; // 10
    /** ATR multiplier */
    multiplier: number; // 3.0
  };
  /** Signal filters */
  filters: {
    /** Minimum signal strength to trade */
    minStrength: number;
    /** Minimum confidence to trade */
    minConfidence: number;
    /** Require all EMAs aligned */
    requireEmaAlignment: boolean;
    /** Require Supertrend confirmation */
    requireSupertrendConfirm: boolean;
    /** Volume filter */
    volume: {
      enabled: boolean;
      /** Minimum volume relative to average */
      minRatio: number;
    };
    /** Momentum filter (RSI/MACD) */
    momentum: {
      enabled: boolean;
      /** RSI period */
      rsiPeriod: number;
      /** RSI oversold threshold */
      rsiOversold: number;
      /** RSI overbought threshold */
      rsiOverbought: number;
    };
  };
  /** Regime detection */
  regime: {
    /** ADX threshold for trending market */
    adxTrendThreshold: number;
    /** ATR percentile threshold for volatile market */
    atrVolatilePercentile: number;
  };
  /** Timeframes for analysis */
  timeframes: {
    /** Primary trading timeframe */
    primary: string;
    /** Higher timeframe for trend confirmation */
    higher: string;
    /** Lower timeframe for entry timing */
    lower: string;
  };
}

// =============================================================================
// BOT CONFIGURATION
// =============================================================================

export type BotMode = 'PAPER' | 'LIVE';
export type BotStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'HALTED' | 'ERROR';

export interface OrionBotConfig {
  /** Bot name */
  name: string;
  /** Bot version */
  version: string;
  /** Operating mode */
  mode: BotMode;
  /** Paper trading required before live */
  paperValidationRequired: boolean;
  /** Minimum paper trading duration before live (ms) */
  minPaperDuration: number;
  /** Exchanges to trade on */
  exchanges: ExchangeConfig[];
  /** Strategy configuration */
  strategy: StrategyConfig;
  /** Risk management configuration */
  risk: RiskConfig;
  /** Hedging mode settings */
  hedging: {
    enabled: boolean;
    /** Allow opposing positions on same symbol */
    allowOppositePositions: boolean;
    /** Auto-hedge when correlation exceeds threshold */
    autoHedgeCorrelation: number;
  };
  /** Notification settings */
  notifications: {
    /** Enable Telegram notifications */
    telegram: boolean;
    /** Enable email notifications */
    email: boolean;
    /** Notify on signal */
    onSignal: boolean;
    /** Notify on trade */
    onTrade: boolean;
    /** Notify on risk events */
    onRiskEvent: boolean;
  };
  /** Logging level */
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export interface ExchangeConfig {
  /** Exchange identifier */
  exchange: string;
  /** Enabled symbols */
  symbols: string[];
  /** API credentials reference (stored securely) */
  credentialRef: string;
  /** Is this exchange active */
  enabled: boolean;
  /** Paper trading instance ID */
  paperInstanceId?: string;
}

// =============================================================================
// BOT STATE
// =============================================================================

export interface OrionBotState {
  /** Current status */
  status: BotStatus;
  /** Bot instance ID */
  instanceId: string;
  /** Start time */
  startTime: number | null;
  /** Last heartbeat */
  lastHeartbeat: number;
  /** Active positions */
  positions: Map<string, OrionPosition>;
  /** Pending signals */
  pendingSignals: TrendSignal[];
  /** Risk metrics */
  riskMetrics: RiskMetrics;
  /** Daily statistics */
  dailyStats: DailyStats;
  /** Lifetime statistics */
  lifetimeStats: LifetimeStats;
  /** Current errors */
  errors: BotError[];
  /** Mode */
  mode: BotMode;
}

export interface DailyStats {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  pnlPct: number;
  maxDrawdown: number;
  signalsGenerated: number;
  signalsExecuted: number;
}

export interface LifetimeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  avgHoldingTime: number;
  startedAt: number;
}

export interface BotError {
  id: string;
  timestamp: number;
  code: string;
  message: string;
  context: Record<string, unknown>;
  recovered: boolean;
}

// =============================================================================
// MARKET DATA
// =============================================================================

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketData {
  exchange: string;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  lastUpdate: number;
}

export interface Ticker {
  exchange: string;
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  timestamp: number;
}

// =============================================================================
// EVENTS
// =============================================================================

export type OrionEventType =
  | 'SIGNAL_GENERATED'
  | 'SIGNAL_FILTERED'
  | 'POSITION_OPENING'
  | 'POSITION_OPENED'
  | 'POSITION_UPDATED'
  | 'POSITION_CLOSING'
  | 'POSITION_CLOSED'
  | 'STOP_LOSS_HIT'
  | 'TAKE_PROFIT_HIT'
  | 'TRAILING_STOP_ACTIVATED'
  | 'RISK_LIMIT_WARNING'
  | 'RISK_LIMIT_BREACH'
  | 'DRAWDOWN_WARNING'
  | 'DRAWDOWN_HALT'
  | 'ERROR'
  | 'RECOVERY';

export interface OrionEvent {
  id: string;
  type: OrionEventType;
  timestamp: number;
  data: Record<string, unknown>;
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
}
