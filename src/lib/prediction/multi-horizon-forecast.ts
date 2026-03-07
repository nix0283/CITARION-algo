/**
 * Multi-Horizon Forecaster
 * Hierarchical forecasting across multiple time horizons
 */

import type { OHLCV } from '../ml-pipeline/types'
import { PricePredictor, type PredictionResult } from './price-predictor'
import { VolatilityModel, type VolatilityForecast } from './volatility-model'
import { RegimeDetector, type MarketRegime, type RegimeState } from './regime-detector'

export interface MultiHorizonPrediction {
  timestamp: number
  horizon: string
  price: PredictionResult
  volatility: VolatilityForecast
  regime: RegimeState
  confidence: number
  direction: 'up' | 'down' | 'neutral'
  directionProbability: number
}

export interface ForecastConsensus {
  timestamp: number
  predictions: MultiHorizonPrediction[]
  consensus: {
    direction: 'bullish' | 'bearish' | 'neutral'
    confidence: number
    priceTarget: number
    stopLoss: number
    takeProfit: number
  }
  risk: {
    volatility: number
    regime: MarketRegime
    uncertaintyScore: number
  }
}

export interface HierarchicalForecast {
  horizons: Record<string, {
    point: number
    lower95: number
    upper95: number
    weight: number
  }>
  reconciled: number
  bottomUp: number
  topDown: number
}

/**
 * Multi-Horizon Forecaster Class
 */
export class MultiHorizonForecaster {
  private pricePredictor: PricePredictor
  private volatilityModel: VolatilityModel
  private regimeDetector: RegimeDetector
  private forecastHistory: MultiHorizonPrediction[][] = []

  private horizons = ['1h', '4h', '24h', '7d']
  private horizonWeights: Record<string, number> = {
    '1h': 0.4,
    '4h': 0.3,
    '24h': 0.2,
    '7d': 0.1
  }

  constructor() {
    this.pricePredictor = new PricePredictor()
    this.volatilityModel = new VolatilityModel()
    this.regimeDetector = new RegimeDetector()
  }

  /**
   * Generate multi-horizon forecasts
   */
  forecast(ohlcv: OHLCV[]): ForecastConsensus {
    const predictions: MultiHorizonPrediction[] = []

    // Get regime for all data
    const regime = this.regimeDetector.detect(ohlcv)

    // Get volatility forecasts
    const volForecasts = this.volatilityModel.forecast(ohlcv, this.horizons)

    // Get price predictions for each horizon
    for (const horizon of this.horizons) {
      const pricePred = this.pricePredictor.predict(ohlcv, horizon)
      const volForecast = volForecasts.find((v) => v.horizon === horizon) || volForecasts[0]

      const prediction: MultiHorizonPrediction = {
        timestamp: ohlcv[ohlcv.length - 1].timestamp,
        horizon,
        price: pricePred,
        volatility: volForecast,
        regime,
        confidence: this.calculateConfidence(pricePred, volForecast, regime),
        direction: this.determineDirection(pricePred, ohlcv),
        directionProbability: this.calculateDirectionProbability(pricePred, ohlcv)
      }

      predictions.push(prediction)
    }

    this.forecastHistory.push(predictions)

    return {
      timestamp: ohlcv[ohlcv.length - 1].timestamp,
      predictions,
      consensus: this.generateConsensus(predictions, ohlcv),
      risk: {
        volatility: volForecasts[0].forecast,
        regime: regime.regime,
        uncertaintyScore: this.calculateUncertainty(predictions)
      }
    }
  }

  /**
   * Hierarchical forecast reconciliation
   */
  reconcileForecasts(ohlcv: OHLCV[]): HierarchicalForecast {
    const currentPrice = ohlcv[ohlcv.length - 1].close
    const predictions = this.pricePredictor.predictMultiHorizon(ohlcv)

    const horizons: Record<string, {
      point: number
      lower95: number
      upper95: number
      weight: number
    }> = {}

    for (const [horizon, pred] of Object.entries(predictions)) {
      const ci = this.pricePredictor.getConfidenceInterval(pred, 0.95)
      horizons[horizon] = {
        point: pred.prediction,
        lower95: ci.lower,
        upper95: ci.upper,
        weight: this.horizonWeights[horizon] || 0.1
      }
    }

    // Bottom-up: aggregate short-term forecasts
    const bottomUp = this.bottomUpReconciliation(horizons, currentPrice)

    // Top-down: disaggregate long-term forecast
    const topDown = this.topDownReconciliation(horizons, currentPrice)

    // Reconciled: optimal combination
    const reconciled = this.optimalReconciliation(bottomUp, topDown, horizons)

    return {
      horizons,
      reconciled,
      bottomUp,
      topDown
    }
  }

  /**
   * Generate trading signals
   */
  generateSignals(ohlcv: OHLCV[]): {
    signal: 'buy' | 'sell' | 'hold'
    strength: number
    confidence: number
    reasons: string[]
  } {
    const consensus = this.forecast(ohlcv)
    const signals: ('buy' | 'sell' | 'hold')[] = []
    const strengths: number[] = []
    const reasons: string[] = []

    // Analyze each horizon
    for (const pred of consensus.predictions) {
      if (pred.direction === 'up' && pred.directionProbability > 0.6) {
        signals.push('buy')
        strengths.push(pred.directionProbability * this.horizonWeights[pred.horizon])
        reasons.push(`${pred.horizon}: Bullish (${(pred.directionProbability * 100).toFixed(1)}%)`)
      } else if (pred.direction === 'down' && pred.directionProbability > 0.6) {
        signals.push('sell')
        strengths.push(pred.directionProbability * this.horizonWeights[pred.horizon])
        reasons.push(`${pred.horizon}: Bearish (${(pred.directionProbability * 100).toFixed(1)}%)`)
      } else {
        signals.push('hold')
        strengths.push(0.5)
        reasons.push(`${pred.horizon}: Neutral`)
      }
    }

    // Aggregate signals
    const buySignals = signals.filter((s) => s === 'buy').length
    const sellSignals = signals.filter((s) => s === 'sell').length

    let signal: 'buy' | 'sell' | 'hold' = 'hold'
    if (buySignals > sellSignals && buySignals >= 2) {
      signal = 'buy'
    } else if (sellSignals > buySignals && sellSignals >= 2) {
      signal = 'sell'
    }

    // Add regime-based reasoning
    if (consensus.risk.regime === 'volatile') {
      reasons.push('Warning: High volatility regime')
    } else if (consensus.risk.regime === 'trending_up') {
      reasons.push('Market in uptrend regime')
    } else if (consensus.risk.regime === 'trending_down') {
      reasons.push('Market in downtrend regime')
    }

    return {
      signal,
      strength: Math.max(...strengths),
      confidence: consensus.consensus.confidence,
      reasons
    }
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    price: PredictionResult,
    volatility: VolatilityForecast,
    regime: RegimeState
  ): number {
    // Base confidence from price prediction
    let conf = price.confidence

    // Adjust for volatility
    const volFactor = 1 - Math.min(0.3, volatility.forecast * 10)
    conf *= volFactor

    // Adjust for regime certainty
    conf *= regime.probability

    return Math.max(0.1, Math.min(0.95, conf))
  }

  /**
   * Determine price direction
   */
  private determineDirection(prediction: PredictionResult, ohlcv: OHLCV[]): 'up' | 'down' | 'neutral' {
    const currentPrice = ohlcv[ohlcv.length - 1].close
    const change = (prediction.prediction - currentPrice) / currentPrice

    if (Math.abs(change) < 0.001) return 'neutral' // < 0.1% change
    return change > 0 ? 'up' : 'down'
  }

  /**
   * Calculate direction probability
   */
  private calculateDirectionProbability(prediction: PredictionResult, ohlcv: OHLCV[]): number {
    const currentPrice = ohlcv[ohlcv.length - 1].close
    const change = (prediction.prediction - currentPrice) / currentPrice

    // Use confidence and magnitude to estimate probability
    const magnitude = Math.abs(change)
    const baseProb = 0.5 + Math.min(0.4, magnitude * 20)

    return baseProb * prediction.confidence
  }

  /**
   * Generate consensus
   */
  private generateConsensus(predictions: MultiHorizonPrediction[], ohlcv: OHLCV[]): {
    direction: 'bullish' | 'bearish' | 'neutral'
    confidence: number
    priceTarget: number
    stopLoss: number
    takeProfit: number
  } {
    const currentPrice = ohlcv[ohlcv.length - 1].close

    // Weighted average prediction
    let weightedSum = 0
    let totalWeight = 0

    for (const pred of predictions) {
      const weight = this.horizonWeights[pred.horizon] || 0.1
      weightedSum += pred.price.prediction * weight
      totalWeight += weight
    }

    const priceTarget = weightedSum / totalWeight

    // Direction consensus
    const upVotes = predictions.filter((p) => p.direction === 'up').length
    const downVotes = predictions.filter((p) => p.direction === 'down').length

    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral'
    if (upVotes > downVotes) direction = 'bullish'
    else if (downVotes > upVotes) direction = 'bearish'

    // Average confidence
    const confidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length

    // Calculate stop loss and take profit based on volatility
    const volatility = predictions[0].volatility.forecast
    const stopLoss = direction === 'bullish'
      ? currentPrice * (1 - volatility * 2)
      : currentPrice * (1 + volatility * 2)
    const takeProfit = direction === 'bullish'
      ? currentPrice * (1 + volatility * 4)
      : currentPrice * (1 - volatility * 4)

    return {
      direction,
      confidence,
      priceTarget,
      stopLoss,
      takeProfit
    }
  }

  /**
   * Calculate uncertainty score
   */
  private calculateUncertainty(predictions: MultiHorizonPrediction[]): number {
    // Higher variance in predictions = higher uncertainty
    const prices = predictions.map((p) => p.price.prediction)
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length
    const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length

    // Normalize to 0-1 scale
    const cv = Math.sqrt(variance) / mean // Coefficient of variation
    return Math.min(1, cv * 10)
  }

  /**
   * Bottom-up reconciliation
   */
  private bottomUpReconciliation(
    horizons: Record<string, { point: number; weight: number }>,
    currentPrice: number
  ): number {
    // Use short-term forecasts primarily
    const h1 = horizons['1h']?.point || currentPrice
    const h4 = horizons['4h']?.point || currentPrice

    return (h1 + h4) / 2
  }

  /**
   * Top-down reconciliation
   */
  private topDownReconciliation(
    horizons: Record<string, { point: number; weight: number }>,
    currentPrice: number
  ): number {
    // Use long-term forecast primarily
    const h24 = horizons['24h']?.point || currentPrice
    const h7d = horizons['7d']?.point || currentPrice

    return (h24 + h7d) / 2
  }

  /**
   * Optimal reconciliation
   */
  private optimalReconciliation(
    bottomUp: number,
    topDown: number,
    horizons: Record<string, { point: number; weight: number }>
  ): number {
    // MinT-style optimal combination
    const totalWeight = Object.values(horizons).reduce((sum, h) => sum + h.weight, 0)

    let weightedSum = 0
    for (const [_, data] of Object.entries(horizons)) {
      weightedSum += data.point * data.weight
    }

    const weighted = weightedSum / totalWeight

    // Combine approaches
    return (bottomUp + topDown + weighted) / 3
  }

  /**
   * Get forecast history
   */
  getHistory(): MultiHorizonPrediction[][] {
    return [...this.forecastHistory]
  }

  /**
   * Evaluate forecast accuracy
   */
  evaluateAccuracy(actualPrices: number[], forecastTimestamps: number[]): {
    mape: number
    rmse: number
    directionalAccuracy: number
  } {
    if (this.forecastHistory.length === 0 || actualPrices.length < 2) {
      return { mape: 0, rmse: 0, directionalAccuracy: 0 }
    }

    const errors: number[] = []
    const correctDirections: number[] = []

    for (let i = 1; i < Math.min(this.forecastHistory.length, actualPrices.length); i++) {
      const forecast = this.forecastHistory[i - 1]?.[0] // 1h forecast
      if (!forecast) continue

      const predicted = forecast.price.prediction
      const actual = actualPrices[i]
      const previousActual = actualPrices[i - 1]

      // MAPE
      errors.push(Math.abs((actual - predicted) / actual))

      // Directional accuracy
      const predDir = predicted > previousActual
      const actualDir = actual > previousActual
      if (predDir === actualDir) correctDirections.push(1)
      else correctDirections.push(0)
    }

    return {
      mape: errors.length > 0 ? errors.reduce((a, b) => a + b, 0) / errors.length : 0,
      rmse: 0, // Would calculate from squared errors
      directionalAccuracy: correctDirections.length > 0
        ? correctDirections.reduce((a, b) => a + b, 0) / correctDirections.length
        : 0
    }
  }
}

// Singleton instance
export const multiHorizonForecaster = new MultiHorizonForecaster()
