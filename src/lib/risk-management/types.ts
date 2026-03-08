/**
 * RISK MANAGEMENT LAYER - Types
 *
 * Comprehensive risk management for CITARION trading platform.
 * Includes VaR, position limits, drawdown monitoring, and kill switch.
 */

// =============================================================================
// VAR TYPES
// =============================================================================

export type VaRMethod = 'historical' | 'parametric' | 'monte_carlo';

export interface VaRConfig {
  /** Confidence level (e.g., 0.95 for 95%) */
  confidenceLevel: number;
  /** Time horizon in days */
  timeHorizon: number;
  /** Method for VaR calculation */
  method: VaRMethod;
  /** Number of simulations for Monte Carlo */
  monteCarloSimulations?: number;
  /** Historical data lookback period */
  lookbackPeriod: number;
}

export interface VaRResult {
  /** Value at Risk */
  var: number;
  /** Expected Shortfall (Conditional VaR) */
  expectedShortfall: number;
  /** Confidence level used */
  confidenceLevel: number;
  /** Time horizon in days */
  timeHorizon: number;
  /** Method used */
  method: VaRMethod;
  /** Timestamp */
  timestamp: number;
  /** Portfolio value */
  portfolioValue: number;
  /** Risk percentage */
  riskPercentage: number;
}

// =============================================================================
// POSITION LIMITER TYPES
// =============================================================================

export interface PositionLimits {
  /** Maximum position size per trade (quote currency) */
  maxPositionSize: number;
  /** Maximum total exposure (quote currency) */
  maxTotalExposure: number;
  /** Maximum positions per symbol */
  maxPositionsPerSymbol: number;
  /** Maximum total positions */
  maxTotalPositions: number;
  /** Maximum leverage */
  maxLeverage: number;
  /** Maximum correlation between positions */
  maxCorrelation: number;
  /** Maximum sector exposure percentage */
  maxSectorExposure: number;
  /** Maximum single asset exposure percentage */
  maxSingleAssetExposure: number;
}

export interface PositionCheckResult {
  /** Whether the position is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Suggested adjustments */
  suggestions?: PositionSuggestion[];
  /** Current exposure after check */
  exposureAfter: number;
  /** Risk level (0-1) */
  riskLevel: number;
}

export interface PositionSuggestion {
  type: 'reduce_size' | 'reduce_leverage' | 'reject' | 'accept';
  message: string;
  suggestedValue?: number;
}

// =============================================================================
// DRAWDOWN MONITOR TYPES
// =============================================================================

export type DrawdownLevel = 'none' | 'warning' | 'critical' | 'breach';

export interface DrawdownThresholds {
  /** Warning level (e.g., 0.1 = 10%) */
  warning: number;
  /** Critical level */
  critical: number;
  /** Breach level - triggers kill switch */
  breach: number;
  /** Recovery threshold to reset */
  recoveryThreshold: number;
}

export interface DrawdownState {
  /** Current drawdown percentage */
  currentDrawdown: number;
  /** Peak equity */
  peakEquity: number;
  /** Current equity */
  currentEquity: number;
  /** Drawdown level */
  level: DrawdownLevel;
  /** Duration of current drawdown in ms */
  duration: number;
  /** Start timestamp of current drawdown */
  startedAt: number | null;
  /** Maximum drawdown observed */
  maxDrawdown: number;
  /** Recovery percentage */
  recoveryPct: number;
}

export interface DrawdownMetrics {
  /** Current state */
  state: DrawdownState;
  /** Daily drawdown */
  daily: number;
  /** Weekly drawdown */
  weekly: number;
  /** Monthly drawdown */
  monthly: number;
  /** Average recovery time in ms */
  avgRecoveryTime: number;
  /** Number of drawdowns in period */
  drawdownCount: number;
}

// =============================================================================
// KILL SWITCH TYPES
// =============================================================================

export type KillSwitchTrigger = 'manual' | 'drawdown' | 'var_breach' | 'correlation' | 'liquidity' | 'error';
export type KillSwitchState = 'armed' | 'triggered' | 'recovering' | 'disarmed';

/**
 * Trading state for auto-arm feature
 */
export type TradingState = 'idle' | 'paper' | 'live';

/**
 * Auto-arm configuration options
 */
export interface AutoArmConfig {
  /** Auto-arm when any bot starts (default: true) */
  autoArmWhenBotStarts: boolean;
  /** Auto-arm when trading mode switches to LIVE (default: true) */
  autoArmWhenLiveMode: boolean;
  /** Auto-arm when first position is opened (default: true) */
  autoArmWhenFirstPosition: boolean;
  /** Auto-arm on system startup (default: true) */
  autoArmOnStartup: boolean;
  /** Require explicit confirmation for disarm (default: true) */
  requireConfirmationToDisarm: boolean;
  /** Log all auto-arm events (default: true) */
  logAutoArmEvents: boolean;
}

export interface KillSwitchConfig {
  /** Enable automatic triggers */
  autoTrigger: boolean;
  /** Triggers to watch */
  triggers: {
    drawdown: boolean;
    varBreach: boolean;
    correlation: boolean;
    liquidity: boolean;
  };
  /** Thresholds for auto-trigger */
  thresholds: {
    drawdownPct: number;
    varMultiplier: number;
    correlationLimit: number;
    liquidityMin: number;
  };
  /** Recovery mode */
  recoveryMode: 'automatic' | 'manual';
  /** Cooldown before recovery (ms) */
  recoveryCooldown: number;
  /** Auto-arm configuration */
  autoArm: AutoArmConfig;
}

export interface KillSwitchStatus {
  /** Current state */
  state: KillSwitchState;
  /** Trigger reason */
  trigger?: KillSwitchTrigger;
  /** Timestamp when triggered */
  triggeredAt?: number;
  /** Timestamp when can recover */
  canRecoverAt?: number;
  /** Positions closed */
  positionsClosed: number;
  /** PnL saved by kill switch */
  pnlSaved: number;
  /** History of triggers */
  triggerHistory: KillSwitchEvent[];
  /** Current trading state */
  tradingState: TradingState;
  /** Timestamp when last armed (for tracking) */
  lastArmedAt?: number;
  /** Reason for last arm operation */
  lastArmReason?: string;
}

export interface KillSwitchEvent {
  id: string;
  timestamp: number;
  trigger: KillSwitchTrigger;
  equity: number;
  drawdown: number;
  positionsClosed: number;
  recovered: boolean;
  recoveredAt?: number;
}

/**
 * Auto-arm event for logging
 */
export interface AutoArmEvent {
  id: string;
  timestamp: number;
  reason: 'bot_start' | 'live_mode' | 'first_position' | 'manual';
  botId?: string;
  previousState: KillSwitchState;
  tradingState: TradingState;
}

/**
 * Safety check result from periodic checks
 */
export interface SafetyCheckResult {
  /** Whether the safety check indicates kill switch should trigger */
  shouldTrigger: boolean;
  /** Trigger reason if should trigger */
  trigger?: KillSwitchTrigger;
  /** Current drawdown percentage */
  drawdown?: number;
  /** VaR breach status */
  varBreach?: boolean;
  /** Correlation level */
  correlation?: number;
  /** Liquidity level */
  liquidity?: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

// =============================================================================
// RISK MANAGER TYPES
// =============================================================================

export interface RiskManagerConfig {
  /** VaR configuration */
  var: VaRConfig;
  /** Position limits */
  limits: PositionLimits;
  /** Drawdown thresholds */
  drawdown: DrawdownThresholds;
  /** Kill switch configuration */
  killSwitch: KillSwitchConfig;
  /** Enable logging */
  enableLogging: boolean;
  /** Update interval in ms */
  updateInterval: number;
}

export interface RiskReport {
  timestamp: number;
  var: VaRResult;
  exposure: {
    total: number;
    bySymbol: Record<string, number>;
    byExchange: Record<string, number>;
  };
  drawdown: DrawdownMetrics;
  limits: {
    used: number;
    available: number;
    breaches: string[];
  };
  killSwitch: KillSwitchStatus;
  riskScore: number; // 0-100
  recommendations: string[];
}

// =============================================================================
// POSITION RISK
// =============================================================================

export interface PositionRiskData {
  id: string;
  symbol: string;
  exchange: string;
  side: 'LONG' | 'SHORT';
  size: number;
  value: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  unrealizedPnL: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: number;
}

export interface PortfolioData {
  equity: number;
  cash: number;
  positions: PositionRiskData[];
  dailyPnL: number;
  weeklyPnL: number;
  monthlyPnL: number;
}

// =============================================================================
// KELLY CRITERION
// =============================================================================

export interface KellyParams {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  /** Kelly fraction (e.g., 0.25 = quarter Kelly) */
  fraction?: number;
  /** Maximum risk regardless of Kelly */
  maxRisk?: number;
}

export interface KellyResult {
  /** Optimal Kelly fraction */
  kellyFraction: number;
  /** Adjusted fraction (after applying fraction and max) */
  adjustedFraction: number;
  /** Risk amount */
  riskAmount: number;
  /** Position size suggestion */
  suggestedSize: number;
  /** Edge percentage */
  edge: number;
  /** Odds ratio */
  odds: number;
}
