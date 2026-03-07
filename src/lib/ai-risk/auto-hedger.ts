/**
 * Auto Hedger
 * Automatic hedging strategies
 */

import type { OHLCV } from '../ml-pipeline/types'

export interface Position {
  symbol: string
  exchange: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  currentPrice: number
  unrealizedPnl: number
  delta: number // Option delta if applicable
  gamma: number // Option gamma if applicable
}

export interface HedgeRecommendation {
  type: 'delta' | 'cross' | 'portfolio' | 'volatility'
  action: 'open' | 'adjust' | 'close'
  symbol: string
  side: 'long' | 'short'
  size: number
  reason: string
  cost: number
  effectiveness: number
}

export interface HedgeStatus {
  totalExposure: number
  hedgedAmount: number
  hedgeRatio: number
  hedgeCost: number
  netDelta: number
  recommendations: HedgeRecommendation[]
}

/**
 * Auto Hedger Class
 */
export class AutoHedger {
  private hedgeRatio: number = 0.5 // Target hedge ratio
  private maxHedgeCost: number = 0.02 // Maximum hedge cost as % of portfolio
  private rebalanceThreshold: number = 0.05 // Rebalance when hedge deviates by 5%

  /**
   * Analyze positions and generate hedge recommendations
   */
  analyze(positions: Position[], marketData: Map<string, OHLCV[]>): HedgeStatus {
    // Calculate total exposure
    const totalExposure = positions.reduce((sum, p) => {
      return sum + Math.abs(p.size * p.currentPrice)
    }, 0)

    // Calculate net delta
    const netDelta = positions.reduce((sum, p) => {
      const delta = p.side === 'long' ? p.size : -p.size
      return sum + delta * p.delta
    }, 0)

    // Calculate current hedge ratio
    const shortPositions = positions.filter((p) => p.side === 'short')
    const hedgedAmount = shortPositions.reduce((sum, p) => sum + Math.abs(p.size * p.currentPrice), 0)
    const currentHedgeRatio = totalExposure > 0 ? hedgedAmount / totalExposure : 0

    // Generate recommendations
    const recommendations = this.generateRecommendations(positions, marketData, currentHedgeRatio)

    // Calculate hedge cost
    const hedgeCost = recommendations.reduce((sum, r) => sum + r.cost, 0)

    return {
      totalExposure,
      hedgedAmount,
      hedgeRatio: currentHedgeRatio,
      hedgeCost,
      netDelta,
      recommendations
    }
  }

  /**
   * Generate hedge recommendations
   */
  private generateRecommendations(
    positions: Position[],
    marketData: Map<string, OHLCV[]>,
    currentHedgeRatio: number
  ): HedgeRecommendation[] {
    const recommendations: HedgeRecommendation[] = []

    // Delta hedging recommendations
    recommendations.push(...this.deltaHedgeRecommendations(positions))

    // Cross-exchange hedging
    recommendations.push(...this.crossExchangeHedgeRecommendations(positions, marketData))

    // Portfolio-level hedging
    if (Math.abs(currentHedgeRatio - this.hedgeRatio) > this.rebalanceThreshold) {
      recommendations.push(...this.portfolioHedgeRecommendations(positions, currentHedgeRatio))
    }

    return recommendations
  }

  /**
   * Delta hedging recommendations
   */
  private deltaHedgeRecommendations(positions: Position[]): HedgeRecommendation[] {
    const recommendations: HedgeRecommendation[] = []

    // Group positions by symbol
    const symbolPositions = new Map<string, Position[]>()
    for (const pos of positions) {
      const existing = symbolPositions.get(pos.symbol) || []
      existing.push(pos)
      symbolPositions.set(pos.symbol, existing)
    }

    for (const [symbol, symbolPos] of symbolPositions) {
      // Calculate net delta for this symbol
      const netDelta = symbolPos.reduce((sum, p) => {
        const delta = p.side === 'long' ? p.size : -p.size
        return sum + delta * (p.delta || 1)
      }, 0)

      // If net delta exceeds threshold, recommend hedge
      if (Math.abs(netDelta) > 1000) { // Threshold
        const hedgeSize = Math.abs(netDelta) * this.hedgeRatio
        const hedgeSide = netDelta > 0 ? 'short' : 'long'

        recommendations.push({
          type: 'delta',
          action: 'open',
          symbol,
          side: hedgeSide,
          size: hedgeSize,
          reason: `Net delta ${netDelta > 0 ? 'long' : 'short'} ${Math.abs(netDelta).toFixed(2)} on ${symbol}`,
          cost: hedgeSize * 0.0004, // Estimated commission
          effectiveness: 0.9
        })
      }
    }

    return recommendations
  }

  /**
   * Cross-exchange hedging recommendations
   */
  private crossExchangeHedgeRecommendations(
    positions: Position[],
    marketData: Map<string, OHLCV[]>
  ): HedgeRecommendation[] {
    const recommendations: HedgeRecommendation[] = []

    // Find arbitrage/hedge opportunities between exchanges
    const symbols = new Set(positions.map((p) => p.symbol))

    for (const symbol of symbols) {
      const symbolPositions = positions.filter((p) => p.symbol === symbol)
      const longPos = symbolPositions.filter((p) => p.side === 'long')
      const shortPos = symbolPositions.filter((p) => p.side === 'short')

      // Check if there's an imbalance
      const longValue = longPos.reduce((sum, p) => sum + p.size * p.currentPrice, 0)
      const shortValue = shortPos.reduce((sum, p) => sum + p.size * p.currentPrice, 0)

      if (Math.abs(longValue - shortValue) > longValue * 0.1) {
        // More than 10% imbalance - recommend cross-hedge
        const dominantSide = longValue > shortValue ? 'long' : 'short'
        const hedgeSize = Math.abs(longValue - shortValue) / (longPos[0]?.currentPrice || shortPos[0]?.currentPrice || 1)

        // Find best exchange for hedge
        let bestExchange = ''
        let bestPrice = 0

        for (const [key, ohlcv] of marketData) {
          if (key.includes(symbol)) {
            const lastPrice = ohlcv[ohlcv.length - 1]?.close || 0
            if (dominantSide === 'long' && lastPrice > bestPrice) {
              bestPrice = lastPrice
              bestExchange = key.split(':')[0]
            } else if (dominantSide === 'short' && (lastPrice < bestPrice || bestPrice === 0)) {
              bestPrice = lastPrice
              bestExchange = key.split(':')[0]
            }
          }
        }

        if (bestExchange) {
          recommendations.push({
            type: 'cross',
            action: 'open',
            symbol: `${bestExchange}:${symbol}`,
            side: dominantSide === 'long' ? 'short' : 'long',
            size: hedgeSize,
            reason: `Cross-exchange hedge for ${symbol} imbalance`,
            cost: hedgeSize * bestPrice * 0.0006,
            effectiveness: 0.85
          })
        }
      }
    }

    return recommendations
  }

  /**
   * Portfolio-level hedging recommendations
   */
  private portfolioHedgeRecommendations(
    positions: Position[],
    currentHedgeRatio: number
  ): HedgeRecommendation[] {
    const recommendations: HedgeRecommendation[] = []

    // Calculate portfolio value and direction
    const portfolioValue = positions.reduce((sum, p) => sum + Math.abs(p.size * p.currentPrice), 0)
    const netExposure = positions.reduce((sum, p) => {
      return sum + (p.side === 'long' ? p.size * p.currentPrice : -p.size * p.currentPrice)
    }, 0)

    // Determine if over-hedged or under-hedged
    const hedgeAdjustment = this.hedgeRatio - currentHedgeRatio
    const adjustmentSize = Math.abs(hedgeAdjustment * portfolioValue)

    if (Math.abs(hedgeAdjustment) > this.rebalanceThreshold) {
      recommendations.push({
        type: 'portfolio',
        action: hedgeAdjustment > 0 ? 'open' : 'adjust',
        symbol: 'BTCUSDT', // Use BTC as hedge proxy
        side: netExposure > 0 ? 'short' : 'long',
        size: adjustmentSize,
        reason: `Rebalance hedge ratio from ${(currentHedgeRatio * 100).toFixed(1)}% to ${(this.hedgeRatio * 100).toFixed(1)}%`,
        cost: adjustmentSize * 0.0004,
        effectiveness: 0.8
      })
    }

    return recommendations
  }

  /**
   * Calculate optimal hedge ratio using minimum variance
   */
  calculateOptimalHedgeRatio(
    spotReturns: number[],
    hedgeReturns: number[]
  ): number {
    if (spotReturns.length !== hedgeReturns.length || spotReturns.length < 2) {
      return this.hedgeRatio
    }

    // Calculate variances and covariance
    const meanSpot = spotReturns.reduce((a, b) => a + b, 0) / spotReturns.length
    const meanHedge = hedgeReturns.reduce((a, b) => a + b, 0) / hedgeReturns.length

    let varSpot = 0
    let covar = 0

    for (let i = 0; i < spotReturns.length; i++) {
      const dsSpot = spotReturns[i] - meanSpot
      const dsHedge = hedgeReturns[i] - meanHedge
      varSpot += dsSpot * dsSpot
      covar += dsSpot * dsHedge
    }

    varSpot /= spotReturns.length
    covar /= spotReturns.length

    // Minimum variance hedge ratio
    const varHedge = hedgeReturns.reduce((sum, r) => sum + (r - meanHedge) ** 2, 0) / hedgeReturns.length

    if (varHedge === 0) return this.hedgeRatio

    const optimalRatio = covar / varHedge

    // Clamp to reasonable range
    return Math.max(0, Math.min(1, optimalRatio))
  }

  /**
   * Calculate hedge effectiveness
   */
  calculateHedgeEffectiveness(
    unhedgedReturns: number[],
    hedgedReturns: number[]
  ): number {
    if (unhedgedReturns.length < 2) return 0

    const varUnhedged = this.variance(unhedgedReturns)
    const varHedged = this.variance(hedgedReturns)

    if (varUnhedged === 0) return 1

    return 1 - (varHedged / varUnhedged)
  }

  /**
   * Execute hedge (simulated)
   */
  executeHedge(recommendation: HedgeRecommendation): {
    success: boolean
    executedSize: number
    executedPrice: number
    timestamp: number
  } {
    // In production, this would execute the actual hedge
    return {
      success: true,
      executedSize: recommendation.size,
      executedPrice: 100, // Would be actual market price
      timestamp: Date.now()
    }
  }

  /**
   * Update hedge parameters
   */
  updateParams(params: { hedgeRatio?: number; maxHedgeCost?: number; rebalanceThreshold?: number }): void {
    if (params.hedgeRatio !== undefined) this.hedgeRatio = params.hedgeRatio
    if (params.maxHedgeCost !== undefined) this.maxHedgeCost = params.maxHedgeCost
    if (params.rebalanceThreshold !== undefined) this.rebalanceThreshold = params.rebalanceThreshold
  }

  /**
   * Get current parameters
   */
  getParams(): { hedgeRatio: number; maxHedgeCost: number; rebalanceThreshold: number } {
    return {
      hedgeRatio: this.hedgeRatio,
      maxHedgeCost: this.maxHedgeCost,
      rebalanceThreshold: this.rebalanceThreshold
    }
  }

  /**
   * Calculate variance
   */
  private variance(values: number[]): number {
    if (values.length < 2) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  }
}

// Singleton instance
export const autoHedger = new AutoHedger()
