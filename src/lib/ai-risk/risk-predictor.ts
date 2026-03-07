/**
 * Risk Predictor
 * ML-based risk prediction and VaR calculation
 */

import type { OHLCV } from '../ml-pipeline/types'

export interface RiskMetrics {
  timestamp: number
  var: {
    90: number // 90% confidence VaR
    95: number // 95% confidence VaR
    99: number // 99% confidence VaR
  }
  expectedShortfall: number // CVaR
  maxDrawdown: number
  drawdownProbability: number
  tailRiskScore: number
  correlationBreakdownRisk: number
}

export interface RiskScore {
  overall: number // 0-100
  components: {
    market: number
    liquidity: number
    volatility: number
    correlation: number
    tail: number
  }
  recommendation: 'reduce' | 'maintain' | 'increase'
}

/**
 * Risk Predictor Class
 */
export class RiskPredictor {
  private lookbackWindow: number = 252 // Trading days
  private history: RiskMetrics[] = []

  /**
   * Calculate Value at Risk using multiple methods
   */
  calculateVaR(returns: number[]): { 90: number; 95: number; 99: number } {
    const sorted = [...returns].sort((a, b) => a - b)
    const n = sorted.length

    return {
      90: sorted[Math.floor(n * 0.1)] || 0,
      95: sorted[Math.floor(n * 0.05)] || 0,
      99: sorted[Math.floor(n * 0.01)] || 0
    }
  }

  /**
   * Calculate Expected Shortfall (Conditional VaR)
   */
  calculateExpectedShortfall(returns: number[], confidence: number = 0.95): number {
    const sorted = [...returns].sort((a, b) => a - b)
    const cutoff = Math.floor(sorted.length * (1 - confidence))
    
    if (cutoff === 0) return sorted[0] || 0

    const tailReturns = sorted.slice(0, cutoff)
    return tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length
  }

  /**
   * Calculate Maximum Drawdown
   */
  calculateMaxDrawdown(prices: number[]): number {
    if (prices.length < 2) return 0

    let maxDrawdown = 0
    let peak = prices[0]

    for (const price of prices) {
      if (price > peak) peak = price
      const drawdown = (peak - price) / peak
      maxDrawdown = Math.max(maxDrawdown, drawdown)
    }

    return maxDrawdown
  }

  /**
   * Predict drawdown probability using ML-like approach
   */
  predictDrawdownProbability(ohlcv: OHLCV[], threshold: number = 0.1): number {
    if (ohlcv.length < 50) return 0.5

    // Calculate returns
    const returns = this.calculateReturns(ohlcv.map((o) => o.close))

    // Calculate rolling maximum drawdowns
    const drawdowns: number[] = []
    for (let i = 50; i < ohlcv.length; i++) {
      const window = ohlcv.slice(i - 50, i).map((o) => o.close)
      const dd = this.calculateMaxDrawdown(window)
      drawdowns.push(dd)
    }

    // Count occurrences above threshold
    const aboveThreshold = drawdowns.filter((d) => d >= threshold).length
    const probability = aboveThreshold / drawdowns.length

    // Adjust for current volatility
    const currentVol = this.calculateVolatility(returns.slice(-20))
    const avgVol = this.calculateVolatility(returns)
    const volAdjustment = currentVol / avgVol

    return Math.min(1, probability * volAdjustment)
  }

  /**
   * Calculate tail risk score
   */
  calculateTailRiskScore(returns: number[]): number {
    if (returns.length < 30) return 0.5

    const sorted = [...returns].sort((a, b) => a - b)
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length)

    // Calculate kurtosis (fat tails)
    const kurtosis = returns.reduce((sum, r) => sum + ((r - mean) / std) ** 4, 0) / returns.length - 3

    // Calculate skewness
    const skewness = returns.reduce((sum, r) => sum + ((r - mean) / std) ** 3, 0) / returns.length

    // Combine into tail risk score (0-100)
    const kurtosisScore = Math.min(50, Math.max(0, kurtosis * 10))
    const skewnessScore = skewness < 0 ? Math.min(50, Math.abs(skewness) * 20) : 0

    return kurtosisScore + skewnessScore
  }

  /**
   * Detect correlation breakdown risk
   */
  detectCorrelationBreakdownRisk(
    priceSeries1: number[],
    priceSeries2: number[],
    window: number = 30
  ): number {
    if (priceSeries1.length < window * 2) return 0

    // Calculate rolling correlations
    const correlations: number[] = []
    for (let i = window; i < priceSeries1.length; i++) {
      const returns1 = this.calculateReturns(priceSeries1.slice(i - window, i))
      const returns2 = this.calculateReturns(priceSeries2.slice(i - window, i))
      const corr = this.correlation(returns1, returns2)
      correlations.push(corr)
    }

    // Check for sudden correlation changes
    const avgCorrelation = correlations.reduce((a, b) => a + b, 0) / correlations.length
    const recentCorrelation = correlations.slice(-5).reduce((a, b) => a + b, 0) / 5

    const change = Math.abs(recentCorrelation - avgCorrelation)
    
    // High change indicates correlation breakdown risk
    return Math.min(1, change * 2)
  }

  /**
   * Estimate risk metrics
   */
  estimate(ohlcv: OHLCV[]): RiskMetrics {
    const closes = ohlcv.map((o) => o.close)
    const returns = this.calculateReturns(closes)

    const varMetrics = this.calculateVaR(returns)
    const expectedShortfall = this.calculateExpectedShortfall(returns)
    const maxDrawdown = this.calculateMaxDrawdown(closes)
    const drawdownProbability = this.predictDrawdownProbability(ohlcv)
    const tailRiskScore = this.calculateTailRiskScore(returns)

    const metrics: RiskMetrics = {
      timestamp: ohlcv[ohlcv.length - 1].timestamp,
      var: varMetrics,
      expectedShortfall,
      maxDrawdown,
      drawdownProbability,
      tailRiskScore,
      correlationBreakdownRisk: 0 // Would need multiple assets
    }

    this.history.push(metrics)
    return metrics
  }

  /**
   * Calculate comprehensive risk score
   */
  calculateRiskScore(ohlcv: OHLCV[], positions?: Array<{ size: number; entryPrice: number }>): RiskScore {
    const metrics = this.estimate(ohlcv)
    const returns = this.calculateReturns(ohlcv.map((o) => o.close))

    // Market risk (based on VaR)
    const marketRisk = Math.min(100, Math.abs(metrics.var['95']) * 1000)

    // Volatility risk
    const volatility = this.calculateVolatility(returns)
    const volatilityRisk = Math.min(100, volatility * 1000)

    // Tail risk
    const tailRisk = metrics.tailRiskScore

    // Correlation risk (placeholder)
    const correlationRisk = 20

    // Liquidity risk (placeholder)
    const liquidityRisk = 15

    // Calculate position-adjusted risk
    let positionMultiplier = 1
    if (positions && positions.length > 0) {
      const totalExposure = positions.reduce((sum, p) => sum + Math.abs(p.size), 0)
      positionMultiplier = Math.min(2, totalExposure / 10000 + 0.5) // Scale based on exposure
    }

    // Overall risk score (0-100)
    const overall = Math.min(100,
      (marketRisk * 0.3 + volatilityRisk * 0.2 + tailRisk * 0.2 + correlationRisk * 0.15 + liquidityRisk * 0.15) * positionMultiplier
    )

    // Recommendation
    let recommendation: 'reduce' | 'maintain' | 'increase' = 'maintain'
    if (overall > 70) recommendation = 'reduce'
    else if (overall < 30) recommendation = 'increase'

    return {
      overall,
      components: {
        market: marketRisk,
        liquidity: liquidityRisk,
        volatility: volatilityRisk,
        correlation: correlationRisk,
        tail: tailRisk
      },
      recommendation
    }
  }

  /**
   * Stress test portfolio
   */
  stressTest(
    positions: Array<{ symbol: string; size: number; entryPrice: number }>,
    scenarios: Array<{ name: string; priceChange: number; volChange: number }>
  ): Array<{ scenario: string; pnl: number; drawdown: number }> {
    return scenarios.map((scenario) => {
      let totalPnl = 0

      for (const position of positions) {
        const priceImpact = scenario.priceChange * position.entryPrice
        const pnl = position.size * priceImpact
        totalPnl += pnl
      }

      // Estimate drawdown from vol change
      const drawdown = Math.abs(totalPnl) * (1 + scenario.volChange * 0.5)

      return {
        scenario: scenario.name,
        pnl: totalPnl,
        drawdown
      }
    })
  }

  /**
   * Get risk history
   */
  getHistory(): RiskMetrics[] {
    return [...this.history]
  }

  // Helper methods
  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }
    return returns
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    return Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length)
  }

  private correlation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0

    const meanX = x.reduce((a, b) => a + b, 0) / x.length
    const meanY = y.reduce((a, b) => a + b, 0) / y.length

    let sumXY = 0
    let sumX2 = 0
    let sumY2 = 0

    for (let i = 0; i < x.length; i++) {
      const dx = x[i] - meanX
      const dy = y[i] - meanY
      sumXY += dx * dy
      sumX2 += dx * dx
      sumY2 += dy * dy
    }

    const denominator = Math.sqrt(sumX2 * sumY2)
    return denominator > 0 ? sumXY / denominator : 0
  }
}

// Singleton instance
export const riskPredictor = new RiskPredictor()
