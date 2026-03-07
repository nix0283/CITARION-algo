/**
 * POSITION LIMITER
 *
 * Enforces position limits and exposure constraints.
 * Uses Kelly Criterion for optimal position sizing.
 */

import type {
  PositionLimits,
  PositionCheckResult,
  PositionSuggestion,
  PositionRiskData,
  PortfolioData,
  KellyParams,
  KellyResult,
} from './types';

export class PositionLimiter {
  private limits: PositionLimits;

  constructor(limits: Partial<PositionLimits> = {}) {
    this.limits = {
      maxPositionSize: 10000,
      maxTotalExposure: 100000,
      maxPositionsPerSymbol: 2,
      maxTotalPositions: 20,
      maxLeverage: 10,
      maxCorrelation: 0.7,
      maxSectorExposure: 0.3,
      maxSingleAssetExposure: 0.2,
      ...limits,
    };
  }

  /**
   * Check if a new position is allowed
   */
  public checkPosition(
    symbol: string,
    exchange: string,
    size: number,
    leverage: number,
    portfolio: PortfolioData
  ): PositionCheckResult {
    const suggestions: PositionSuggestion[] = [];
    const breaches: string[] = [];
    let adjustedSize = size;
    let adjustedLeverage = leverage;

    // Calculate current exposure
    const currentExposure = this.calculateTotalExposure(portfolio.positions);
    const positionValue = size * leverage;

    // Check single position size
    if (positionValue > this.limits.maxPositionSize) {
      breaches.push('max_position_size');
      adjustedSize = this.limits.maxPositionSize / leverage;
      suggestions.push({
        type: 'reduce_size',
        message: `Position size exceeds max ${this.limits.maxPositionSize}`,
        suggestedValue: adjustedSize,
      });
    }

    // Check total exposure
    const newExposure = currentExposure + positionValue;
    if (newExposure > this.limits.maxTotalExposure) {
      breaches.push('max_total_exposure');
      const available = this.limits.maxTotalExposure - currentExposure;
      if (available <= 0) {
        return {
          allowed: false,
          reason: 'Total exposure limit reached',
          suggestions: [{ type: 'reject', message: 'No available exposure capacity' }],
          exposureAfter: currentExposure,
          riskLevel: 1,
        };
      }
      adjustedSize = available / leverage;
      suggestions.push({
        type: 'reduce_size',
        message: `Reduced to fit exposure limit`,
        suggestedValue: adjustedSize,
      });
    }

    // Check positions per symbol
    const symbolPositions = portfolio.positions.filter(p => p.symbol === symbol).length;
    if (symbolPositions >= this.limits.maxPositionsPerSymbol) {
      return {
        allowed: false,
        reason: `Max positions per symbol (${this.limits.maxPositionsPerSymbol}) reached for ${symbol}`,
        suggestions: [{ type: 'reject', message: 'Close existing positions first' }],
        exposureAfter: currentExposure,
        riskLevel: 0.7,
      };
    }

    // Check total positions
    if (portfolio.positions.length >= this.limits.maxTotalPositions) {
      return {
        allowed: false,
        reason: `Max total positions (${this.limits.maxTotalPositions}) reached`,
        suggestions: [{ type: 'reject', message: 'Close some positions first' }],
        exposureAfter: currentExposure,
        riskLevel: 0.8,
      };
    }

    // Check leverage
    if (leverage > this.limits.maxLeverage) {
      breaches.push('max_leverage');
      adjustedLeverage = this.limits.maxLeverage;
      suggestions.push({
        type: 'reduce_leverage',
        message: `Leverage exceeds max ${this.limits.maxLeverage}x`,
        suggestedValue: adjustedLeverage,
      });
    }

    // Check single asset exposure
    const assetExposure = this.calculateAssetExposure(symbol, portfolio.positions);
    const newAssetExposure = assetExposure + adjustedSize * adjustedLeverage;
    const maxAssetValue = portfolio.equity * this.limits.maxSingleAssetExposure;
    
    if (newAssetExposure > maxAssetValue) {
      breaches.push('max_single_asset_exposure');
      const available = maxAssetValue - assetExposure;
      if (available <= 0) {
        return {
          allowed: false,
          reason: `Max exposure for ${symbol} reached`,
          suggestions: [{ type: 'reject', message: 'Reduce existing position in this asset' }],
          exposureAfter: currentExposure,
          riskLevel: 0.9,
        };
      }
      adjustedSize = available / adjustedLeverage;
      suggestions.push({
        type: 'reduce_size',
        message: `Reduced to fit single asset limit`,
        suggestedValue: adjustedSize,
      });
    }

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(breaches, portfolio);

    return {
      allowed: adjustedSize > 0,
      reason: breaches.length > 0 ? breaches.join(', ') : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      exposureAfter: currentExposure + (adjustedSize * adjustedLeverage),
      riskLevel,
    };
  }

  /**
   * Calculate optimal position size using Kelly Criterion
   */
  public calculateKellySize(params: KellyParams): KellyResult {
    const { winRate, avgWin, avgLoss, fraction = 0.25, maxRisk = 0.02 } = params;

    // Kelly formula: f* = p - (1-p)/(w/l)
    // where p = win rate, w = avg win, l = avg loss
    const odds = avgWin / avgLoss; // Win/loss ratio
    const kellyFraction = winRate - (1 - winRate) / odds;
    
    // Apply fractional Kelly
    let adjustedFraction = kellyFraction * fraction;
    
    // Cap at max risk
    adjustedFraction = Math.min(adjustedFraction, maxRisk);
    
    // Calculate edge
    const edge = winRate * avgWin - (1 - winRate) * avgLoss;

    return {
      kellyFraction,
      adjustedFraction,
      riskAmount: adjustedFraction,
      suggestedSize: adjustedFraction, // Caller multiplies by capital
      edge,
      odds,
    };
  }

  /**
   * Get suggested position size based on risk parameters
   */
  public suggestPositionSize(
    portfolio: PortfolioData,
    riskPerTrade: number,
    stopLossPercent: number
  ): number {
    // Position size = Risk Amount / Stop Loss Distance
    const riskAmount = portfolio.equity * riskPerTrade;
    const positionSize = riskAmount / (stopLossPercent / 100);
    return Math.min(positionSize, this.limits.maxPositionSize);
  }

  /**
   * Calculate current exposure by symbol
   */
  public calculateExposureBySymbol(positions: PositionRiskData[]): Map<string, number> {
    const exposure = new Map<string, number>();
    for (const pos of positions) {
      const current = exposure.get(pos.symbol) || 0;
      exposure.set(pos.symbol, current + pos.value);
    }
    return exposure;
  }

  /**
   * Calculate current exposure by exchange
   */
  public calculateExposureByExchange(positions: PositionRiskData[]): Map<string, number> {
    const exposure = new Map<string, number>();
    for (const pos of positions) {
      const current = exposure.get(pos.exchange) || 0;
      exposure.set(pos.exchange, current + pos.value);
    }
    return exposure;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private calculateTotalExposure(positions: PositionRiskData[]): number {
    return positions.reduce((sum, p) => sum + p.value, 0);
  }

  private calculateAssetExposure(symbol: string, positions: PositionRiskData[]): number {
    return positions
      .filter(p => p.symbol === symbol)
      .reduce((sum, p) => sum + p.value, 0);
  }

  private calculateRiskLevel(breaches: string[], portfolio: PortfolioData): number {
    let riskLevel = 0;

    // Base risk from breaches
    riskLevel += breaches.length * 0.1;

    // Add risk from exposure ratio
    const exposureRatio = this.calculateTotalExposure(portfolio.positions) / portfolio.equity;
    riskLevel += exposureRatio * 0.3;

    // Add risk from drawdown
    if (portfolio.dailyPnL < 0) {
      riskLevel += Math.abs(portfolio.dailyPnL) / portfolio.equity * 0.5;
    }

    return Math.min(riskLevel, 1);
  }

  /**
   * Update limits
   */
  public updateLimits(limits: Partial<PositionLimits>): void {
    this.limits = { ...this.limits, ...limits };
  }

  /**
   * Get current limits
   */
  public getLimits(): PositionLimits {
    return { ...this.limits };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const defaultPositionLimits: PositionLimits = {
  maxPositionSize: 10000,
  maxTotalExposure: 100000,
  maxPositionsPerSymbol: 2,
  maxTotalPositions: 20,
  maxLeverage: 10,
  maxCorrelation: 0.7,
  maxSectorExposure: 0.3,
  maxSingleAssetExposure: 0.2,
};

export function calculateKelly(params: KellyParams): KellyResult {
  const limiter = new PositionLimiter();
  return limiter.calculateKellySize(params);
}
