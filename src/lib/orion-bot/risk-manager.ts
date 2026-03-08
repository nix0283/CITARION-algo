/**
 * ORION Risk Manager
 *
 * Professional risk management with Kelly Criterion support.
 *
 * Philosophy: "Minimum risk for position" - preserve capital above all.
 *
 * Features:
 * - Kelly Criterion for optimal position sizing
 * - Fractional Kelly for risk-adjusted sizing
 * - Portfolio-level risk limits
 * - Dynamic leverage adjustment
 * - Correlation-aware position limits
 */

import type {
  RiskConfig,
  RiskMetrics,
  TrendSignal,
  OrionPosition,
  PositionRisk,
  MarketRegime,
} from './types';

// =============================================================================
// KELLY CRITERION CALCULATOR
// =============================================================================

export interface TradeHistory {
  pnl: number;
  pnlPct: number;
  win: boolean;
}

export interface KellyResult {
  /** Optimal Kelly fraction (0-1) */
  optimalFraction: number;
  /** Half Kelly (more conservative) */
  halfKelly: number;
  /** Quarter Kelly (recommended for trading) */
  quarterKelly: number;
  /** Win rate */
  winRate: number;
  /** Average win / average loss ratio */
  winLossRatio: number;
  /** Expected value per trade */
  expectedValue: number;
  /** Is result statistically significant */
  isSignificant: boolean;
  /** Sample size */
  sampleSize: number;
}

/**
 * Calculate Kelly Criterion
 *
 * Kelly % = W - (1-W)/R
 * Where:
 *   W = Win probability
 *   R = Win/Loss ratio (average win / average loss)
 *
 * For trading, we use fractional Kelly (1/4 or 1/2) for safety
 */
export function calculateKelly(trades: TradeHistory[]): KellyResult {
  if (trades.length < 10) {
    // Not enough data - return conservative defaults
    return {
      optimalFraction: 0.01, // 1% max without data
      halfKelly: 0.005,
      quarterKelly: 0.0025,
      winRate: 0.5,
      winLossRatio: 1.5,
      expectedValue: 0,
      isSignificant: false,
      sampleSize: trades.length,
    };
  }

  const wins = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);

  const winRate = wins.length / trades.length;

  const avgWin = wins.length > 0
    ? wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length
    : 0;

  const avgLoss = losses.length > 0
    ? Math.abs(losses.reduce((sum, t) => sum + t.pnlPct, 0) / losses.length)
    : 1;

  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1;

  // Kelly formula: f = W - (1-W)/R
  const kellyRaw = winRate - (1 - winRate) / winLossRatio;

  // Cap Kelly at reasonable levels
  const optimalFraction = Math.max(0, Math.min(0.25, kellyRaw));

  // Statistical significance check
  // Using rule of thumb: need at least 30 trades for meaningful statistics
  const isSignificant = trades.length >= 30 && winRate > 0 && winLossRatio > 0;

  // Expected value
  const expectedValue = winRate * avgWin - (1 - winRate) * avgLoss;

  return {
    optimalFraction,
    halfKelly: optimalFraction * 0.5,
    quarterKelly: optimalFraction * 0.25,
    winRate,
    winLossRatio,
    expectedValue,
    isSignificant,
    sampleSize: trades.length,
  };
}

// =============================================================================
// RISK MANAGER CLASS
// =============================================================================

export class RiskManager {
  private config: RiskConfig;
  private metrics: RiskMetrics;
  private tradeHistory: TradeHistory[] = [];
  private dailyTrades: TradeHistory[] = [];
  private lastResetDate: string = new Date().toISOString().split('T')[0];

  constructor(config: RiskConfig) {
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Calculate position size for a signal
   */
  public calculatePositionSize(
    signal: TrendSignal,
    accountBalance: number,
    currentPositions: OrionPosition[]
  ): {
    size: number;
    riskAmount: number;
    riskPct: number;
    leverage: number;
    reasoning: string;
  } {
    // Check position limits
    const positionCheck = this.checkPositionLimits(signal, currentPositions);
    if (!positionCheck.allowed) {
      return {
        size: 0,
        riskAmount: 0,
        riskPct: 0,
        leverage: 1,
        reasoning: positionCheck.reason,
      };
    }

    // Determine risk percentage
    let riskPct = this.determineRiskPct(signal);

    // Apply regime-based adjustment
    riskPct = this.adjustForRegime(riskPct, signal.regime);

    // Apply correlation adjustment
    riskPct = this.adjustForCorrelation(riskPct, signal, currentPositions);

    // Calculate risk amount
    const riskAmount = accountBalance * riskPct;

    // Calculate stop loss distance (using ATR)
    const stopDistance = signal.atr * this.config.stopLoss.atrMultiplier;
    const stopPct = stopDistance / signal.price;

    // Validate stop loss
    if (stopPct < this.config.stopLoss.minPct / 100) {
      return {
        size: 0,
        riskAmount: 0,
        riskPct: 0,
        leverage: 1,
        reasoning: `Stop loss too tight (${(stopPct * 100).toFixed(2)}% < ${this.config.stopLoss.minPct}%)`,
      };
    }

    if (stopPct > this.config.stopLoss.maxPct / 100) {
      return {
        size: 0,
        riskAmount: 0,
        riskPct: 0,
        leverage: 1,
        reasoning: `Stop loss too wide (${(stopPct * 100).toFixed(2)}% > ${this.config.stopLoss.maxPct}%)`,
      };
    }

    // Position size = Risk Amount / Stop Distance
    const positionValue = riskAmount / stopPct;
    const size = positionValue / signal.price;

    // Determine leverage
    const leverage = Math.min(
      this.config.leverage.default,
      this.config.leverage.max,
      positionValue / accountBalance
    );

    // Final safety check
    if (positionValue > accountBalance * this.config.limits.maxPositions) {
      return {
        size: 0,
        riskAmount: 0,
        riskPct: 0,
        leverage: 1,
        reasoning: 'Position would exceed portfolio limits',
      };
    }

    return {
      size: Math.floor(size * 100000000) / 100000000, // Round to 8 decimals
      riskAmount,
      riskPct,
      leverage: Math.max(1, Math.round(leverage * 10) / 10),
      reasoning: `Risk: ${(riskPct * 100).toFixed(2)}%, Stop: ${(stopPct * 100).toFixed(2)}%, Leverage: ${leverage.toFixed(1)}x`,
    };
  }

  /**
   * Calculate stop loss price
   */
  public calculateStopLoss(signal: TrendSignal): number {
    const atrDistance = signal.atr * this.config.stopLoss.atrMultiplier;

    if (signal.direction === 'LONG') {
      return signal.price - atrDistance;
    } else {
      return signal.price + atrDistance;
    }
  }

  /**
   * Calculate take profit levels
   */
  public calculateTakeProfits(
    signal: TrendSignal,
    stopLoss: number
  ): { price: number; sizePct: number }[] {
    const risk = Math.abs(signal.price - stopLoss);
    const levels = this.config.takeProfit.levels;

    return [
      {
        price: signal.direction === 'LONG'
          ? signal.price + risk * levels.tp1.riskRewardRatio
          : signal.price - risk * levels.tp1.riskRewardRatio,
        sizePct: levels.tp1.sizePct,
      },
      {
        price: signal.direction === 'LONG'
          ? signal.price + risk * levels.tp2.riskRewardRatio
          : signal.price - risk * levels.tp2.riskRewardRatio,
        sizePct: levels.tp2.sizePct,
      },
      {
        price: signal.direction === 'LONG'
          ? signal.price + risk * levels.tp3.riskRewardRatio
          : signal.price - risk * levels.tp3.riskRewardRatio,
        sizePct: levels.tp3.sizePct,
      },
    ];
  }

  /**
   * Check if new position is allowed
   */
  private checkPositionLimits(
    signal: TrendSignal,
    currentPositions: OrionPosition[]
  ): { allowed: boolean; reason: string } {
    // Max positions check
    if (currentPositions.length >= this.config.limits.maxPositions) {
      return { allowed: false, reason: 'Maximum positions limit reached' };
    }

    // Per-symbol check
    const symbolPositions = currentPositions.filter(
      p => p.symbol === signal.symbol && p.status === 'ACTIVE'
    );
    if (symbolPositions.length >= this.config.limits.maxPositionsPerSymbol) {
      return { allowed: false, reason: 'Maximum positions per symbol reached' };
    }

    // Per-exchange check
    const exchangePositions = currentPositions.filter(
      p => p.exchange === signal.exchange && p.status === 'ACTIVE'
    );
    if (exchangePositions.length >= this.config.limits.maxPositionsPerExchange) {
      return { allowed: false, reason: 'Maximum positions per exchange reached' };
    }

    // Drawdown check
    if (this.metrics.drawdown >= this.config.limits.maxDrawdownPct) {
      return { allowed: false, reason: 'Maximum drawdown reached - trading halted' };
    }

    // Daily loss check
    if (this.metrics.dailyPnL <= -this.config.limits.dailyLossLimitPct) {
      return { allowed: false, reason: 'Daily loss limit reached' };
    }

    return { allowed: true, reason: 'OK' };
  }

  /**
   * Determine risk percentage based on mode
   */
  private determineRiskPct(signal: TrendSignal): number {
    const { riskPerTrade } = this.config;

    switch (riskPerTrade.mode) {
      case 'fixed':
        return (riskPerTrade.fixedPct || 0.5) / 100;

      case 'kelly':
        return this.getKellyRisk(riskPerTrade.maxRiskPct / 100);

      case 'fractional_kelly':
        return this.getFractionalKellyRisk(
          riskPerTrade.kellyFraction || 0.25,
          riskPerTrade.maxRiskPct / 100
        );

      default:
        return riskPerTrade.minRiskPct / 100;
    }
  }

  /**
   * Get Kelly-based risk
   */
  private getKellyRisk(maxRisk: number): number {
    const kelly = calculateKelly(this.tradeHistory);

    if (!kelly.isSignificant) {
      // Not enough data - use minimum
      return this.config.riskPerTrade.minRiskPct / 100;
    }

    return Math.min(kelly.optimalFraction, maxRisk);
  }

  /**
   * Get fractional Kelly risk
   */
  private getFractionalKellyRisk(fraction: number, maxRisk: number): number {
    const kelly = calculateKelly(this.tradeHistory);

    if (!kelly.isSignificant) {
      return this.config.riskPerTrade.minRiskPct / 100;
    }

    const fractionalKelly = kelly.optimalFraction * fraction;
    return Math.min(fractionalKelly, maxRisk);
  }

  /**
   * Adjust risk based on market regime
   */
  private adjustForRegime(riskPct: number, regime: MarketRegime): number {
    switch (regime) {
      case 'volatile':
        return riskPct * 0.5; // Reduce risk in volatile markets
      case 'transitioning':
        return riskPct * 0.75; // Reduce risk during transitions
      case 'ranging':
        return riskPct * 0.5; // Reduce risk in ranging markets
      case 'trending':
      default:
        return riskPct; // Full risk in trending markets
    }
  }

  /**
   * Adjust risk based on correlation with existing positions
   */
  private adjustForCorrelation(
    riskPct: number,
    signal: TrendSignal,
    positions: OrionPosition[]
  ): number {
    // Same direction positions reduce risk
    const sameDirectionPositions = positions.filter(
      p => p.symbol === signal.symbol &&
        ((p.side === 'LONG' && signal.direction === 'LONG') ||
          (p.side === 'SHORT' && signal.direction === 'SHORT'))
    );

    if (sameDirectionPositions.length > 0) {
      // Reduce risk for each additional same-direction position
      return riskPct * Math.pow(0.8, sameDirectionPositions.length);
    }

    return riskPct;
  }

  /**
   * Update risk metrics after trade
   */
  public updateMetrics(trade: TradeHistory): void {
    // Add to history
    this.tradeHistory.push(trade);
    this.dailyTrades.push(trade);

    // Keep only last 100 trades for Kelly calculation
    if (this.tradeHistory.length > 100) {
      this.tradeHistory.shift();
    }

    // Update metrics
    this.recalculateMetrics();
  }

  /**
   * Recalculate all risk metrics
   */
  private recalculateMetrics(): void {
    const wins = this.tradeHistory.filter(t => t.win);
    const losses = this.tradeHistory.filter(t => !t.win);

    const winRate = this.tradeHistory.length > 0
      ? wins.length / this.tradeHistory.length
      : 0;

    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length
      : 0;

    const avgLoss = losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + t.pnlPct, 0) / losses.length)
      : 0;

    const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    const kelly = calculateKelly(this.tradeHistory);

    this.metrics = {
      ...this.metrics,
      winRate,
      avgWinLossRatio,
      kellyOptimal: kelly.optimalFraction,
      expectedValue: kelly.expectedValue,
      updatedAt: Date.now(),
    };
  }

  /**
   * Update daily metrics
   */
  public updateDailyPnL(pnl: number, balance: number): void {
    const today = new Date().toISOString().split('T')[0];

    if (today !== this.lastResetDate) {
      // New day - reset daily counters
      this.dailyTrades = [];
      this.lastResetDate = today;
    }

    this.metrics.dailyPnL = pnl / balance;
  }

  /**
   * Get current risk metrics
   */
  public getMetrics(): RiskMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if risk event should trigger halt
   */
  public shouldHalt(): { halt: boolean; reason: string } {
    if (this.metrics.drawdown >= this.config.limits.maxDrawdownPct) {
      return { halt: true, reason: 'Maximum drawdown exceeded' };
    }

    if (this.metrics.dailyPnL <= -this.config.limits.dailyLossLimitPct) {
      return { halt: true, reason: 'Daily loss limit exceeded' };
    }

    return { halt: false, reason: '' };
  }

  /**
   * Initialize default metrics
   */
  private initializeMetrics(): RiskMetrics {
    return {
      portfolioRisk: 0,
      drawdown: 0,
      dailyPnL: 0,
      openRisk: 0,
      usedMargin: 0,
      availableMargin: 1,
      marginRatio: 0,
      winRate: 0.5,
      avgWinLossRatio: 1.5,
      kellyOptimal: 0.01,
      expectedValue: 0,
      sharpeRatio: 0,
      updatedAt: Date.now(),
    };
  }
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const defaultRiskConfig: RiskConfig = {
  riskPerTrade: {
    mode: 'fractional_kelly',
    kellyFraction: 0.25, // Quarter Kelly
    maxRiskPct: 2, // Max 2% per trade
    minRiskPct: 0.25, // Min 0.25% per trade
  },
  limits: {
    maxPositions: 5,
    maxPositionsPerSymbol: 2,
    maxPositionsPerExchange: 3,
    maxCorrelation: 0.6,
    maxDrawdown: 10, // 10% max drawdown
    dailyLossLimit: 3, // 3% daily loss limit
  },
  leverage: {
    default: 3,
    max: 5,
    volatileRegimeMultiplier: 0.5, // Reduce leverage in volatile markets
  },
  stopLoss: {
    atrMultiplier: 2.0,
    minPct: 0.5, // Minimum 0.5% stop
    maxPct: 5, // Maximum 5% stop
  },
  takeProfit: {
    levels: {
      tp1: { riskRewardRatio: 1.5, sizePct: 30 },
      tp2: { riskRewardRatio: 2.5, sizePct: 40 },
      tp3: { riskRewardRatio: 4.0, sizePct: 30 },
    },
  },
};

/**
 * Calculate risk metrics for a position
 */
export function calculatePositionRisk(
  entryPrice: number,
  stopLoss: number,
  positionValue: number,
  accountBalance: number
): PositionRisk {
  const riskPct = Math.abs(entryPrice - stopLoss) / entryPrice;
  const riskAmount = positionValue * riskPct;

  // Simple Kelly score based on position size vs account
  const kellyScore = Math.min(1, (riskAmount / accountBalance) / 0.02);

  return {
    riskPct: riskPct * 100,
    riskAmount,
    kellyScore,
    riskRewardRatio: 0, // Will be set when TP is calculated
    maxAdverseExcursion: 0,
    maxFavorableExcursion: 0,
  };
}
