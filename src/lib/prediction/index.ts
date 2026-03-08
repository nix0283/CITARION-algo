/**
 * Market Prediction Module
 * Comprehensive market prediction system
 */

// Types
export type { PredictionResult, ModelPerformance } from './price-predictor'
export type { VolatilityEstimate, VolatilityForecast } from './volatility-model'
export type { MarketRegime, RegimeState, RegimeHistory } from './regime-detector'
export type {
  MultiHorizonPrediction,
  ForecastConsensus,
  HierarchicalForecast
} from './multi-horizon-forecast'

// Components
export { PricePredictor, pricePredictor } from './price-predictor'
export { VolatilityModel, volatilityModel, GARCHModel, EWMAVolatility, RealizedVolatility } from './volatility-model'
export { RegimeDetector, regimeDetector } from './regime-detector'
export { MultiHorizonForecaster, multiHorizonForecaster } from './multi-horizon-forecast'

// Convenience functions
import { pricePredictor } from './price-predictor'
import { volatilityModel } from './volatility-model'
import { regimeDetector } from './regime-detector'
import { multiHorizonForecaster } from './multi-horizon-forecast'
import type { OHLCV } from '../ml-pipeline/types'

export interface FullAnalysis {
  timestamp: number
  currentPrice: number
  predictions: {
    '1h': { price: number; confidence: number; direction: 'up' | 'down' | 'neutral' }
    '4h': { price: number; confidence: number; direction: 'up' | 'down' | 'neutral' }
    '24h': { price: number; confidence: number; direction: 'up' | 'down' | 'neutral' }
    '7d': { price: number; confidence: number; direction: 'up' | 'down' | 'neutral' }
  }
  volatility: {
    current: number
    regime: 'low' | 'normal' | 'high' | 'extreme'
    forecast: number
  }
  regime: {
    current: string
    probability: number
    duration: number
  }
  signal: {
    action: 'buy' | 'sell' | 'hold'
    strength: number
    confidence: number
    reasons: string[]
  }
  risk: {
    uncertaintyScore: number
    stopLoss: number
    takeProfit: number
  }
}

/**
 * Run complete market analysis
 */
export async function analyzeMarket(ohlcv: OHLCV[]): Promise<FullAnalysis> {
  // Get all predictions
  const forecast = multiHorizonForecaster.forecast(ohlcv)
  const volatilityEst = volatilityModel.estimate(ohlcv)
  const regimeState = regimeDetector.detect(ohlcv)
  const signals = multiHorizonForecaster.generateSignals(ohlcv)

  const currentPrice = ohlcv[ohlcv.length - 1].close

  // Format predictions
  const predictions: FullAnalysis['predictions'] = {
    '1h': { price: currentPrice, confidence: 0.5, direction: 'neutral' },
    '4h': { price: currentPrice, confidence: 0.5, direction: 'neutral' },
    '24h': { price: currentPrice, confidence: 0.5, direction: 'neutral' },
    '7d': { price: currentPrice, confidence: 0.5, direction: 'neutral' }
  }

  for (const pred of forecast.predictions) {
    const horizon = pred.horizon as keyof typeof predictions
    if (predictions[horizon]) {
      predictions[horizon] = {
        price: pred.price.prediction,
        confidence: pred.confidence,
        direction: pred.direction
      }
    }
  }

  return {
    timestamp: ohlcv[ohlcv.length - 1].timestamp,
    currentPrice,
    predictions,
    volatility: {
      current: volatilityEst.volatility,
      regime: volatilityEst.regime,
      forecast: forecast.risk.volatility
    },
    regime: {
      current: regimeState.regime,
      probability: regimeState.probability,
      duration: regimeState.duration
    },
    signal: {
      action: signals.signal,
      strength: signals.strength,
      confidence: signals.confidence,
      reasons: signals.reasons
    },
    risk: {
      uncertaintyScore: forecast.risk.uncertaintyScore,
      stopLoss: forecast.consensus.stopLoss,
      takeProfit: forecast.consensus.takeProfit
    }
  }
}

/**
 * Quick price prediction
 */
export async function predictPrice(
  ohlcv: OHLCV[],
  horizon: string = '1h'
): Promise<{ price: number; confidence: number; direction: string }> {
  const prediction = pricePredictor.predict(ohlcv, horizon)
  const currentPrice = ohlcv[ohlcv.length - 1].close

  const direction = prediction.prediction > currentPrice ? 'up' : 'down'

  return {
    price: prediction.prediction,
    confidence: prediction.confidence,
    direction
  }
}

/**
 * Get volatility forecast
 */
export async function forecastVolatility(
  ohlcv: OHLCV[],
  horizon: string = '24h'
): Promise<{ forecast: number; regime: string }> {
  const forecasts = volatilityModel.forecast(ohlcv, [horizon])
  const estimate = volatilityModel.estimate(ohlcv)

  return {
    forecast: forecasts[0]?.forecast || estimate.volatility,
    regime: estimate.regime
  }
}

/**
 * Detect current market regime
 */
export function detectRegime(ohlcv: OHLCV[]): {
  regime: string
  probability: number
  transitions: Record<string, number>
} {
  const state = regimeDetector.detect(ohlcv)

  return {
    regime: state.regime,
    probability: state.probability,
    transitions: state.transitionProbability
  }
}

/**
 * Get trading signal
 */
export function getTradingSignal(ohlcv: OHLCV[]): {
  signal: 'buy' | 'sell' | 'hold'
  strength: number
  confidence: number
  reasons: string[]
} {
  return multiHorizonForecaster.generateSignals(ohlcv)
}
