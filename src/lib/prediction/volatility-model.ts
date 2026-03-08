/**
 * Volatility Model
 * GARCH and volatility estimation models
 */

import type { OHLCV } from '../ml-pipeline/types'

export interface VolatilityEstimate {
  timestamp: number
  volatility: number
  annualized: number
  regime: 'low' | 'normal' | 'high' | 'extreme'
  percentile: number
}

export interface VolatilityForecast {
  timestamp: number
  forecast: number
  horizon: string
  confidence: { lower: number; upper: number }
}

/**
 * GARCH(1,1) Model
 */
export class GARCHModel {
  private omega: number = 0.00001
  private alpha: number = 0.1
  private beta: number = 0.85
  private lastVariance: number = 0.0001
  private returns: number[] = []

  constructor(params?: { omega?: number; alpha?: number; beta?: number }) {
    if (params) {
      this.omega = params.omega ?? this.omega
      this.alpha = params.alpha ?? this.alpha
      this.beta = params.beta ?? this.beta
    }
  }

  /**
   * Fit model to returns
   */
  fit(prices: number[]): void {
    // Calculate log returns
    this.returns = []
    for (let i = 1; i < prices.length; i++) {
      this.returns.push(Math.log(prices[i] / prices[i - 1]))
    }

    // Initialize variance
    this.lastVariance = this.returns.reduce((sum, r) => sum + r * r, 0) / this.returns.length

    // Optimize parameters using MLE (simplified)
    this.optimizeParameters()
  }

  /**
   * Optimize GARCH parameters
   */
  private optimizeParameters(): void {
    // Simplified optimization - grid search
    const omegaRange = [0.000001, 0.00001, 0.0001]
    const alphaRange = [0.05, 0.1, 0.15]
    const betaRange = [0.8, 0.85, 0.9]

    let bestLikelihood = -Infinity
    let bestParams = { omega: this.omega, alpha: this.alpha, beta: this.beta }

    for (const omega of omegaRange) {
      for (const alpha of alphaRange) {
        for (const beta of betaRange) {
          if (alpha + beta >= 1) continue // Stationarity condition

          const likelihood = this.calculateLikelihood(omega, alpha, beta)
          if (likelihood > bestLikelihood) {
            bestLikelihood = likelihood
            bestParams = { omega, alpha, beta }
          }
        }
      }
    }

    this.omega = bestParams.omega
    this.alpha = bestParams.alpha
    this.beta = bestParams.beta
  }

  /**
   * Calculate log-likelihood
   */
  private calculateLikelihood(omega: number, alpha: number, beta: number): number {
    let variance = this.lastVariance
    let logLikelihood = 0

    for (const ret of this.returns) {
      variance = omega + alpha * ret * ret + beta * variance
      logLikelihood += -0.5 * (Math.log(2 * Math.PI) + Math.log(variance) + (ret * ret) / variance)
    }

    return logLikelihood
  }

  /**
   * Estimate current volatility
   */
  estimate(): number {
    return Math.sqrt(this.lastVariance)
  }

  /**
   * Forecast volatility
   */
  forecast(steps: number): number[] {
    const forecasts: number[] = []
    let variance = this.lastVariance

    // Long-run variance
    const longRunVariance = this.omega / (1 - this.alpha - this.beta)

    for (let i = 0; i < steps; i++) {
      variance = this.omega + (this.alpha + this.beta) * variance
      forecasts.push(Math.sqrt(variance))
    }

    return forecasts
  }

  /**
   * Update with new observation
   */
  update(return_: number): void {
    this.returns.push(return_)
    this.lastVariance = this.omega + this.alpha * return_ * return_ + this.beta * this.lastVariance
  }

  /**
   * Get parameters
   */
  getParams(): { omega: number; alpha: number; beta: number } {
    return { omega: this.omega, alpha: this.alpha, beta: this.beta }
  }
}

/**
 * EWMA Volatility (RiskMetrics)
 */
export class EWMAVolatility {
  private lambda: number = 0.94
  private lastVariance: number = 0

  constructor(lambda?: number) {
    this.lambda = lambda ?? 0.94
  }

  /**
   * Calculate EWMA volatility
   */
  calculate(returns: number[]): number {
    if (returns.length === 0) return 0

    let variance = returns[0] * returns[0]

    for (let i = 1; i < returns.length; i++) {
      variance = this.lambda * variance + (1 - this.lambda) * returns[i] * returns[i]
    }

    this.lastVariance = variance
    return Math.sqrt(variance)
  }

  /**
   * Update with new return
   */
  update(return_: number): void {
    this.lastVariance = this.lambda * this.lastVariance + (1 - this.lambda) * return_ * return_
  }

  /**
   * Get current volatility
   */
  getVolatility(): number {
    return Math.sqrt(this.lastVariance)
  }
}

/**
 * Realized Volatility Calculator
 */
export class RealizedVolatility {
  /**
   * Calculate realized volatility from high-frequency data
   */
  calculate(ohlcv: OHLCV[], window: number = 20): number[] {
    const volatilities: number[] = []

    for (let i = window; i <= ohlcv.length; i++) {
      const windowData = ohlcv.slice(i - window, i)
      const returns = this.calculateReturns(windowData.map((o) => o.close))
      
      // Parkinson volatility (using high-low)
      const parkinson = this.parkinsonVolatility(windowData)
      
      // Garman-Klass volatility
      const garmanKlass = this.garmanKlassVolatility(windowData)

      // Combine estimators
      volatilities.push((parkinson + garmanKlass + this.stdVolatility(returns)) / 3)
    }

    return volatilities
  }

  /**
   * Calculate returns
   */
  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]))
    }
    return returns
  }

  /**
   * Parkinson volatility (high-low based)
   */
  private parkinsonVolatility(ohlcv: OHLCV[]): number {
    const sum = ohlcv.reduce((total, o) => {
      return total + Math.pow(Math.log(o.high / o.low), 2)
    }, 0)

    return Math.sqrt(sum / (4 * ohlcv.length * Math.log(2)))
  }

  /**
   * Garman-Klass volatility
   */
  private garmanKlassVolatility(ohlcv: OHLCV[]): number {
    const sum = ohlcv.reduce((total, o) => {
      const hl = Math.log(o.high / o.low)
      const co = Math.log(o.close / o.open)
      return total + 0.5 * hl * hl - (2 * Math.log(2) - 1) * co * co
    }, 0)

    return Math.sqrt(sum / ohlcv.length)
  }

  /**
   * Standard deviation volatility
   */
  private stdVolatility(returns: number[]): number {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length
    return Math.sqrt(variance)
  }
}

/**
 * Main Volatility Model class
 */
export class VolatilityModel {
  private garch: GARCHModel
  private ewma: EWMAVolatility
  private realized: RealizedVolatility
  private history: VolatilityEstimate[] = []
  private lookbackWindow: number = 100

  constructor() {
    this.garch = new GARCHModel()
    this.ewma = new EWMAVolatility(0.94)
    this.realized = new RealizedVolatility()
  }

  /**
   * Estimate volatility from OHLCV data
   */
  estimate(ohlcv: OHLCV[]): VolatilityEstimate {
    const closes = ohlcv.map((o) => o.close)
    const returns = this.calculateReturns(closes)

    // GARCH estimate
    this.garch.fit(closes)
    const garchVol = this.garch.estimate()

    // EWMA estimate
    const ewmaVol = this.ewma.calculate(returns)

    // Realized volatility
    const realizedVols = this.realized.calculate(ohlcv, 20)
    const realizedVol = realizedVols.length > 0 ? realizedVols[realizedVols.length - 1] : 0

    // Combine estimates
    const volatility = (garchVol + ewmaVol + realizedVol) / 3

    // Annualize
    const annualized = volatility * Math.sqrt(252 * 24) // Assuming hourly data

    // Determine regime
    const regime = this.classifyRegime(volatility, returns)

    // Calculate percentile
    const percentile = this.calculatePercentile(volatility, returns)

    const estimate: VolatilityEstimate = {
      timestamp: ohlcv[ohlcv.length - 1].timestamp,
      volatility,
      annualized,
      regime,
      percentile
    }

    this.history.push(estimate)
    return estimate
  }

  /**
   * Forecast future volatility
   */
  forecast(ohlcv: OHLCV[], horizons: string[] = ['1h', '4h', '24h', '7d']): VolatilityForecast[] {
    const closes = ohlcv.map((o) => o.close)
    this.garch.fit(closes)

    const horizonSteps: Record<string, number> = {
      '1h': 1,
      '4h': 4,
      '24h': 24,
      '7d': 168
    }

    const forecasts = this.garch.forecast(168) // Max 7 days
    const currentVol = this.garch.estimate()

    return horizons.map((horizon) => {
      const steps = horizonSteps[horizon] || 1
      const forecast = forecasts[steps - 1] || currentVol

      return {
        timestamp: ohlcv[ohlcv.length - 1].timestamp,
        forecast,
        horizon,
        confidence: {
          lower: forecast * 0.7,
          upper: forecast * 1.3
        }
      }
    })
  }

  /**
   * Classify volatility regime
   */
  private classifyRegime(volatility: number, returns: number[]): 'low' | 'normal' | 'high' | 'extreme' {
    if (returns.length < 20) return 'normal'

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length)

    // Historical percentiles
    const sortedReturns = [...returns].map(Math.abs).sort((a, b) => a - b)
    const p25 = sortedReturns[Math.floor(sortedReturns.length * 0.25)]
    const p75 = sortedReturns[Math.floor(sortedReturns.length * 0.75)]
    const p95 = sortedReturns[Math.floor(sortedReturns.length * 0.95)]

    const currentAbs = volatility

    if (currentAbs < p25) return 'low'
    if (currentAbs < p75) return 'normal'
    if (currentAbs < p95) return 'high'
    return 'extreme'
  }

  /**
   * Calculate percentile of current volatility
   */
  private calculatePercentile(volatility: number, returns: number[]): number {
    if (returns.length < 2) return 50

    const sortedReturns = [...returns].map(Math.abs).sort((a, b) => a - b)
    const currentAbs = volatility

    let rank = 0
    for (const r of sortedReturns) {
      if (currentAbs > r) rank++
      else break
    }

    return (rank / sortedReturns.length) * 100
  }

  /**
   * Calculate returns from prices
   */
  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]))
    }
    return returns
  }

  /**
   * Get volatility history
   */
  getHistory(): VolatilityEstimate[] {
    return [...this.history]
  }

  /**
   * Implied volatility estimation (simplified)
   */
  estimateImplied(
    currentPrice: number,
    strikePrice: number,
    timeToExpiry: number,
    riskFreeRate: number = 0.02
  ): number {
    // Simplified IV estimation using ATM approximation
    const forwardPrice = currentPrice * Math.exp(riskFreeRate * timeToExpiry)
    const moneyness = strikePrice / forwardPrice

    // Simple approximation: IV ≈ sqrt(2 * |ln(moneyness)| / timeToExpiry)
    const logMoneyness = Math.abs(Math.log(moneyness))
    return Math.sqrt(2 * logMoneyness / timeToExpiry) || 0.3 // Default 30% if ATM
  }
}

// Singleton instance
export const volatilityModel = new VolatilityModel()
