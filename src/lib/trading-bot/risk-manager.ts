/**
 * Risk Manager
 * Production implementation of position sizing and risk controls
 * 
 * Features:
 * - Kelly Criterion position sizing (quarter-Kelly)
 * - Correlation filter
 * - Drawdown protection
 * - Position size limits
 */

import type { Candle } from './types';
import {
  TradeDirection,
  type Position,
  type TradingSignal,
  type RiskConfig,
  type CorrelationEntry
} from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface PositionSizeResult {
  size: number;              // Position size in base asset
  notionalValue: number;     // Position size in quote currency
  riskAmount: number;        // Risk amount in quote currency
  leverage: number;          // Suggested leverage
  reasoning: string;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason: string;
  adjustedSize?: number;
}

export interface DrawdownState {
  peakEquity: number;
  currentEquity: number;
  currentDrawdown: number;
  maxDrawdownReached: boolean;
  tradingHalted: boolean;
}

// ============================================================================
// KELLY CRITERION
// ============================================================================

/**
 * Calculate Kelly fraction for position sizing
 * Kelly = W - (1-W)/R
 * Where W = win rate, R = average win / average loss
 */
export function calculateKellyFraction(
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  if (avgLoss === 0) return 0;

  const ratio = avgWin / avgLoss;
  const kelly = winRate - (1 - winRate) / ratio;

  // Return 0 if negative (no edge)
  return Math.max(0, kelly);
}

/**
 * Calculate position size using Kelly Criterion
 */
export function kellyPositionSize(
  equity: number,
  kellyFraction: number,
  appliedFraction: number = 0.25 // Quarter-Kelly by default
): number {
  // Use fraction of Kelly (more conservative)
  const effectiveKelly = kellyFraction * appliedFraction;

  // Cap at 25% of equity
  return Math.min(equity * effectiveKelly, equity * 0.25);
}

// ============================================================================
// POSITION SIZING
// ============================================================================

/**
 * Calculate position size based on risk percentage
 */
export function calculateRiskBasedSize(
  equity: number,
  entryPrice: number,
  stopLoss: number,
  riskPercent: number,
  maxPositionPercent: number = 20
): PositionSizeResult {
  // Risk amount in quote currency
  const riskAmount = equity * (riskPercent / 100);

  // Distance to stop loss
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const stopPercent = (stopDistance / entryPrice) * 100;

  if (stopPercent === 0) {
    return {
      size: 0,
      notionalValue: 0,
      riskAmount: 0,
      leverage: 1,
      reasoning: 'Stop loss at entry price - no position'
    };
  }

  // Position size to achieve risk amount
  // riskAmount = notionalValue * stopPercent / 100
  // notionalValue = riskAmount * 100 / stopPercent
  const notionalValue = (riskAmount * 100) / stopPercent;

  // Cap at max position percent
  const maxNotional = equity * (maxPositionPercent / 100);
  const cappedNotional = Math.min(notionalValue, maxNotional);

  // Position size in base asset
  const size = cappedNotional / entryPrice;

  // Calculate leverage (if using margin)
  const leverage = cappedNotional / equity;

  return {
    size,
    notionalValue: cappedNotional,
    riskAmount,
    leverage: Math.max(1, leverage),
    reasoning: `Risk ${riskPercent}% = ${riskAmount.toFixed(2)}, Stop ${stopPercent.toFixed(2)}% away, Size = ${cappedNotional.toFixed(2)}`
  };
}

/**
 * Calculate optimal position size combining Kelly and risk-based
 */
export function calculateOptimalPositionSize(
  equity: number,
  entryPrice: number,
  stopLoss: number,
  config: RiskConfig,
  tradeHistory?: {
    winRate: number;
    avgWin: number;
    avgLoss: number;
  }
): PositionSizeResult {
  // Start with risk-based sizing
  const riskBased = calculateRiskBasedSize(
    equity,
    entryPrice,
    stopLoss,
    config.riskPerTradePercent,
    config.maxPositionSizePercent
  );

  // If using Kelly and we have history
  if (config.useKellySizing && tradeHistory) {
    const kelly = calculateKellyFraction(
      tradeHistory.winRate,
      tradeHistory.avgWin,
      tradeHistory.avgLoss
    );

    if (kelly > 0) {
      const kellySize = kellyPositionSize(
        equity,
        kelly,
        config.kellyFraction
      );

      // Use minimum of risk-based and Kelly
      const kellyNotional = Math.min(kellySize, riskBased.notionalValue);
      
      return {
        size: kellyNotional / entryPrice,
        notionalValue: kellyNotional,
        riskAmount: riskBased.riskAmount,
        leverage: Math.max(1, kellyNotional / equity),
        reasoning: `Kelly (${(kelly * 100).toFixed(1)}%) + Risk-based = ${kellyNotional.toFixed(2)}`
      };
    }
  }

  return riskBased;
}

// ============================================================================
// CORRELATION FILTER
// ============================================================================

/**
 * Calculate Pearson correlation coefficient
 */
export function calculateCorrelation(
  series1: number[],
  series2: number[]
): number {
  const n = Math.min(series1.length, series2.length);
  
  if (n < 2) return 0;

  // Take last n values
  const x = series1.slice(-n);
  const y = series2.slice(-n);

  // Calculate means
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  // Calculate correlation
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : numerator / denom;
}

/**
 * Calculate correlation from candles (using returns)
 */
export function calculateReturnCorrelation(
  candles1: Candle[],
  candles2: Candle[],
  lookback: number = 20
): number {
  // Calculate returns
  const returns1: number[] = [];
  const returns2: number[] = [];

  const n = Math.min(candles1.length, candles2.length, lookback + 1);

  for (let i = 1; i < n; i++) {
    const idx1 = candles1.length - n + i;
    const idx2 = candles2.length - n + i;

    const return1 = (candles1[idx1].close - candles1[idx1 - 1].close) / candles1[idx1 - 1].close;
    const return2 = (candles2[idx2].close - candles2[idx2 - 1].close) / candles2[idx2 - 1].close;

    returns1.push(return1);
    returns2.push(return2);
  }

  return calculateCorrelation(returns1, returns2);
}

/**
 * Check if new position violates correlation rules
 */
export function checkCorrelationRisk(
  newSymbol: string,
  existingPositions: Position[],
  candlesMap: Map<string, Candle[]>,
  threshold: number
): RiskCheckResult {
  const newCandles = candlesMap.get(newSymbol);
  
  if (!newCandles || newCandles.length < 20) {
    return { allowed: true, reason: 'Insufficient data for correlation check' };
  }

  const correlations: Array<{ symbol: string; correlation: number }> = [];

  for (const position of existingPositions) {
    if (position.symbol === newSymbol) continue;

    const posCandles = candlesMap.get(position.symbol);
    if (!posCandles || posCandles.length < 20) continue;

    const correlation = calculateReturnCorrelation(newCandles, posCandles);
    correlations.push({ symbol: position.symbol, correlation: Math.abs(correlation) });
  }

  // Check for high correlation
  const highCorrelation = correlations.find(c => c.correlation > threshold);

  if (highCorrelation) {
    return {
      allowed: false,
      reason: `High correlation (${(highCorrelation.correlation * 100).toFixed(1)}%) with ${highCorrelation.symbol}`
    };
  }

  // Calculate average correlation
  const avgCorrelation = correlations.length > 0
    ? correlations.reduce((sum, c) => sum + c.correlation, 0) / correlations.length
    : 0;

  return {
    allowed: true,
    reason: `Correlation check passed. Avg correlation: ${(avgCorrelation * 100).toFixed(1)}%`
  };
}

// ============================================================================
// DRAWDOWN PROTECTION
// ============================================================================

/**
 * Track and manage drawdown state
 */
export class DrawdownTracker {
  private peakEquity: number = 0;
  private currentEquity: number = 0;
  private dailyStartEquity: number = 0;
  private dailyPnL: number = 0;
  private lastResetDate: string = '';

  constructor(
    private readonly maxDrawdownPercent: number,
    private readonly dailyLossLimitPercent: number
  ) {}

  update(equity: number): DrawdownState {
    this.currentEquity = equity;

    // Update peak
    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }

    // Check daily reset
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailyStartEquity = equity;
      this.dailyPnL = 0;
      this.lastResetDate = today;
    }

    const currentDrawdown = this.peakEquity > 0
      ? ((this.peakEquity - equity) / this.peakEquity) * 100
      : 0;

    return {
      peakEquity: this.peakEquity,
      currentEquity: this.currentEquity,
      currentDrawdown,
      maxDrawdownReached: currentDrawdown >= this.maxDrawdownPercent,
      tradingHalted: currentDrawdown >= this.maxDrawdownPercent
    };
  }

  recordPnL(pnl: number): void {
    this.dailyPnL += pnl;
  }

  checkDailyLimit(): { exceeded: boolean; currentLoss: number; limit: number } {
    if (this.dailyStartEquity === 0) {
      return { exceeded: false, currentLoss: 0, limit: 0 };
    }

    const dailyLossPercent = (this.dailyPnL / this.dailyStartEquity) * 100;
    const limit = this.dailyLossLimitPercent;

    return {
      exceeded: dailyLossPercent <= -limit,
      currentLoss: dailyLossPercent,
      limit
    };
  }

  reset(): void {
    this.peakEquity = 0;
    this.dailyStartEquity = 0;
    this.dailyPnL = 0;
  }
}

// ============================================================================
// RISK MANAGER CLASS
// ============================================================================

export class RiskManager {
  private drawdownTracker: DrawdownTracker;
  private candlesMap: Map<string, Candle[]> = new Map();

  constructor(private readonly config: RiskConfig) {
    this.drawdownTracker = new DrawdownTracker(
      config.maxDrawdownPercent,
      config.dailyLossLimitPercent
    );
  }

  /**
   * Update candle data for correlation calculations
   */
  updateCandles(symbol: string, candles: Candle[]): void {
    this.candlesMap.set(symbol, candles);
  }

  /**
   * Comprehensive risk check before opening a position
   */
  checkCanOpenPosition(
    signal: TradingSignal,
    equity: number,
    existingPositions: Position[],
    tradeHistory?: {
      winRate: number;
      avgWin: number;
      avgLoss: number;
    }
  ): RiskCheckResult {
    // 1. Check max positions
    if (existingPositions.length >= this.config.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Max open positions (${this.config.maxOpenPositions}) reached`
      };
    }

    // 2. Check drawdown
    const ddState = this.drawdownTracker.update(equity);
    if (ddState.tradingHalted) {
      return {
        allowed: false,
        reason: `Trading halted: drawdown (${ddState.currentDrawdown.toFixed(1)}%) >= max (${this.config.maxDrawdownPercent}%)`
      };
    }

    // 3. Check daily loss limit
    const dailyCheck = this.drawdownTracker.checkDailyLimit();
    if (dailyCheck.exceeded) {
      return {
        allowed: false,
        reason: `Daily loss limit reached: ${dailyCheck.currentLoss.toFixed(1)}%`
      };
    }

    // 4. Check correlation
    const corrCheck = checkCorrelationRisk(
      signal.symbol,
      existingPositions,
      this.candlesMap,
      this.config.maxCorrelationThreshold
    );
    if (!corrCheck.allowed) {
      return corrCheck;
    }

    // 5. Check risk:reward ratio
    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
    const reward = Math.abs(signal.takeProfits[0] - signal.entryPrice);
    const rrRatio = reward / risk;

    if (rrRatio < this.config.minRiskRewardRatio) {
      return {
        allowed: false,
        reason: `Risk:Reward ratio (${rrRatio.toFixed(2)}) below minimum (${this.config.minRiskRewardRatio})`
      };
    }

    return { allowed: true, reason: 'All risk checks passed' };
  }

  /**
   * Calculate position size with all risk parameters
   */
  calculatePositionSize(
    equity: number,
    entryPrice: number,
    stopLoss: number,
    tradeHistory?: {
      winRate: number;
      avgWin: number;
      avgLoss: number;
    }
  ): PositionSizeResult {
    return calculateOptimalPositionSize(
      equity,
      entryPrice,
      stopLoss,
      this.config,
      tradeHistory
    );
  }

  /**
   * Update equity for drawdown tracking
   */
  updateEquity(equity: number): DrawdownState {
    return this.drawdownTracker.update(equity);
  }

  /**
   * Record realized P&L
   */
  recordRealizedPnL(pnl: number): void {
    this.drawdownTracker.recordPnL(pnl);
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  riskPerTradePercent: 0.5,      // 0.5% risk per trade
  maxPositionSizePercent: 20,    // Max 20% of equity in single position
  maxOpenPositions: 5,           // Max 5 simultaneous positions
  maxCorrelationThreshold: 0.6,  // Reject if correlation > 60%
  maxDrawdownPercent: 10,        // Halt at 10% drawdown
  dailyLossLimitPercent: 5,      // Halt at 5% daily loss
  useKellySizing: true,
  kellyFraction: 0.25,           // Quarter-Kelly
  defaultStopLossPercent: 2,     // 2% default stop
  minRiskRewardRatio: 2          // Minimum 1:2 R:R
};
