/**
 * Position Sizer
 * AI-driven position sizing algorithms
 */

import type { OHLCV } from '../ml-pipeline/types'
import type { RiskMetrics } from './risk-predictor'

export interface PositionSizeResult {
  size: number // In base currency
  sizePercent: number // Percentage of portfolio
  leverage: number
  stopLoss: number
  takeProfit: number
  riskAmount: number
  rationale: string
}

export interface PortfolioAllocation {
  symbol: string
  weight: number
  size: number
  expectedReturn: number
  risk: number
}

export interface SizingConfig {
  maxRiskPerTrade: number // Percentage of portfolio
  maxTotalRisk: number // Total portfolio risk limit
  maxPositionSize: number // Maximum single position
  maxLeverage: number
  riskFreeRate: number
  targetVolatility: number // Target portfolio volatility
}

/**
 * Position Sizer Class
 */
export class PositionSizer {
  private config: SizingConfig = {
    maxRiskPerTrade: 2, // 2% risk per trade
    maxTotalRisk: 10, // 10% total portfolio risk
    maxPositionSize: 50, // 50% max single position
    maxLeverage: 5,
    riskFreeRate: 0.02,
    targetVolatility: 0.15 // 15% annual volatility
  }

  constructor(config?: Partial<SizingConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  /**
   * Calculate position size using Kelly Criterion
   */
  kellyCriterion(
    winRate: number,
    avgWin: number,
    avgLoss: number,
    portfolioValue: number
  ): PositionSizeResult {
    // Kelly fraction: f = p - (1-p)/(w/l)
    // where p = win probability, w = avg win, l = avg loss
    const winLossRatio = avgWin / Math.abs(avgLoss)
    const kellyFraction = winRate - (1 - winRate) / winLossRatio

    // Apply half-Kelly for safety
    const halfKelly = kellyFraction * 0.5

    // Clamp to max risk
    const safeKelly = Math.max(0, Math.min(this.config.maxRiskPerTrade / 100, halfKelly))

    const size = portfolioValue * safeKelly
    const riskAmount = portfolioValue * (this.config.maxRiskPerTrade / 100)

    return {
      size,
      sizePercent: safeKelly * 100,
      leverage: 1,
      stopLoss: 0.02, // 2% default stop
      takeProfit: 0.04, // 4% default target
      riskAmount,
      rationale: `Kelly criterion: ${(kellyFraction * 100).toFixed(2)}% -> Half-Kelly: ${(safeKelly * 100).toFixed(2)}%`
    }
  }

  /**
   * Risk Parity allocation
   */
  riskParityAllocation(
    assets: Array<{ symbol: string; returns: number[]; volatility: number }>,
    portfolioValue: number
  ): PortfolioAllocation[] {
    const n = assets.length
    if (n === 0) return []

    // Calculate inverse volatility weights
    const invVols = assets.map((a) => 1 / (a.volatility + 0.001))
    const sumInvVols = invVols.reduce((a, b) => a + b, 0)

    // Initial weights
    let weights = invVols.map((iv) => iv / sumInvVols)

    // Iterative refinement for risk parity
    for (let iter = 0; iter < 10; iter++) {
      const riskContributions = weights.map((w, i) => w * assets[i].volatility)
      const totalRisk = riskContributions.reduce((a, b) => a + b, 0)
      const targetRC = totalRisk / n

      // Adjust weights
      weights = weights.map((w, i) => {
        const rc = riskContributions[i]
        return w * (targetRC / (rc + 0.0001))
      })

      // Normalize
      const sum = weights.reduce((a, b) => a + b, 0)
      weights = weights.map((w) => w / sum)
    }

    // Apply weight constraints
    weights = weights.map((w) => Math.min(this.config.maxPositionSize / 100, w))
    const sumWeights = weights.reduce((a, b) => a + b, 0)
    weights = weights.map((w) => w / sumWeights)

    return assets.map((asset, i) => ({
      symbol: asset.symbol,
      weight: weights[i],
      size: portfolioValue * weights[i],
      expectedReturn: this.estimateExpectedReturn(asset.returns),
      risk: asset.volatility * Math.sqrt(252)
    }))
  }

  /**
   * Volatility-adjusted position sizing
   */
  volatilityAdjustedSize(
    portfolioValue: number,
    currentVolatility: number,
    targetRisk: number = 0.02, // 2% per trade
    entryPrice: number,
    stopLossPercent: number = 0.02
  ): PositionSizeResult {
    // Size based on volatility targeting
    // Position = TargetRisk / (StopLoss% * VolatilityMultiplier)
    const volMultiplier = currentVolatility / 0.02 // Relative to 2% base volatility
    const adjustedStopLoss = stopLossPercent * volMultiplier

    // Risk amount
    const riskAmount = portfolioValue * (targetRisk / 100)

    // Position size
    const size = riskAmount / adjustedStopLoss

    // Leverage calculation
    const maxLeverage = this.config.maxLeverage
    const requiredLeverage = (size / portfolioValue)
    const leverage = Math.min(maxLeverage, Math.max(1, requiredLeverage))

    // Final size with leverage constraint
    const finalSize = Math.min(size, portfolioValue * leverage)

    return {
      size: finalSize,
      sizePercent: (finalSize / portfolioValue) * 100,
      leverage,
      stopLoss: adjustedStopLoss,
      takeProfit: adjustedStopLoss * 2, // 2:1 R:R
      riskAmount,
      rationale: `Vol-adjusted sizing: Vol multiplier = ${volMultiplier.toFixed(2)}, Adjusted SL = ${(adjustedStopLoss * 100).toFixed(2)}%`
    }
  }

  /**
   * Dynamic position sizing based on market regime
   */
  dynamicSize(
    portfolioValue: number,
    regime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile',
    volatility: number,
    signalStrength: number, // 0-1
    riskMetrics: RiskMetrics
  ): PositionSizeResult {
    // Base size from risk metrics
    let baseSizePercent = this.config.maxRiskPerTrade

    // Adjust for regime
    const regimeMultipliers: Record<string, number> = {
      'trending_up': 1.5,
      'trending_down': 0.5,
      'ranging': 1.0,
      'volatile': 0.7
    }

    baseSizePercent *= regimeMultipliers[regime] || 1.0

    // Adjust for volatility
    const volFactor = this.config.targetVolatility / volatility
    baseSizePercent *= Math.min(2, Math.max(0.5, volFactor))

    // Adjust for signal strength
    baseSizePercent *= signalStrength

    // Adjust for tail risk
    if (riskMetrics.tailRiskScore > 50) {
      baseSizePercent *= 0.5
    }

    // Ensure within limits
    baseSizePercent = Math.min(this.config.maxPositionSize, Math.max(1, baseSizePercent))

    const size = portfolioValue * (baseSizePercent / 100)
    const riskAmount = portfolioValue * (this.config.maxRiskPerTrade / 100)

    return {
      size,
      sizePercent: baseSizePercent,
      leverage: 1,
      stopLoss: 0.02 * (volatility / 0.02),
      takeProfit: 0.04 * signalStrength,
      riskAmount,
      rationale: `Dynamic sizing: Regime=${regime}, Signal=${(signalStrength * 100).toFixed(0)}%, Vol factor=${volFactor.toFixed(2)}`
    }
  }

  /**
   * Calculate optimal leverage
   */
  optimalLeverage(
    expectedReturn: number,
    volatility: number,
    riskFreeRate: number = 0.02
  ): number {
    // Sharpe-optimal leverage: L = (E[R] - Rf) / σ²
    const excessReturn = expectedReturn - riskFreeRate
    const variance = volatility * volatility

    if (variance <= 0) return 1

    const kellyLeverage = excessReturn / variance

    // Apply safety factor (half-Kelly)
    const safeLeverage = kellyLeverage * 0.5

    // Clamp to limits
    return Math.max(1, Math.min(this.config.maxLeverage, safeLeverage))
  }

  /**
   * Portfolio-level position sizing
   */
  portfolioSizing(
    signals: Array<{
      symbol: string
      direction: 'long' | 'short'
      strength: number
      volatility: number
    }>,
    portfolioValue: number,
    currentPositions: Array<{ symbol: string; sizePercent: number }>
  ): Array<{ symbol: string; sizePercent: number; action: 'open' | 'increase' | 'reduce' | 'close' }> {
    const results: Array<{ symbol: string; sizePercent: number; action: 'open' | 'increase' | 'reduce' | 'close' }> = []

    // Calculate total current risk
    const currentTotalRisk = currentPositions.reduce((sum, p) => sum + p.sizePercent, 0)

    // Available risk budget
    const availableRisk = Math.max(0, this.config.maxTotalRisk - currentTotalRisk)

    // Sort signals by strength
    const sortedSignals = [...signals].sort((a, b) => b.strength - a.strength)

    let allocatedRisk = 0

    for (const signal of sortedSignals) {
      const currentPos = currentPositions.find((p) => p.symbol === signal.symbol)

      // Calculate target size based on strength and volatility
      let targetSize = signal.strength * (this.config.targetVolatility / signal.volatility)
      targetSize = Math.min(this.config.maxPositionSize, targetSize * 100)

      // Check risk budget
      if (allocatedRisk + targetSize > availableRisk) {
        targetSize = Math.max(0, availableRisk - allocatedRisk)
      }

      if (targetSize < 1) continue

      allocatedRisk += targetSize

      // Determine action
      let action: 'open' | 'increase' | 'reduce' | 'close'
      if (!currentPos) {
        action = 'open'
      } else if (targetSize > currentPos.sizePercent) {
        action = 'increase'
      } else if (targetSize < currentPos.sizePercent) {
        action = targetSize < 1 ? 'close' : 'reduce'
      } else {
        action = 'increase' // No change
      }

      results.push({
        symbol: signal.symbol,
        sizePercent: targetSize,
        action
      })
    }

    return results
  }

  /**
   * Estimate expected return from historical returns
   */
  private estimateExpectedReturn(returns: number[]): number {
    if (returns.length === 0) return 0
    return returns.reduce((a, b) => a + b, 0) / returns.length * 252 // Annualized
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SizingConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  getConfig(): SizingConfig {
    return { ...this.config }
  }
}

// Singleton instance
export const positionSizer = new PositionSizer()
