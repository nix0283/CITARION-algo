/**
 * Gradient Boosting Scorer Instance
 *
 * Singleton scorer instance for use across API routes
 */

import { SignalQualityScorer, type BoostingConfig } from '@/lib/gradient-boosting'

// Singleton scorer instance
let scorerInstance: SignalQualityScorer | null = null
let modelInitialized = false

/**
 * Get or create the scorer instance
 */
export function getScorer(): SignalQualityScorer {
  if (!scorerInstance) {
    const config: Partial<BoostingConfig> = {
      nEstimators: 100,
      learningRate: 0.1,
      maxDepth: 5,
      minSamplesSplit: 10,
      minSamplesLeaf: 5,
      subsample: 0.8,
      loss: 'squared',
      earlyStoppingRounds: 10,
      validationSplit: 0.2,
    }
    scorerInstance = new SignalQualityScorer(config)

    // Train with sample data for demonstration
    if (!modelInitialized) {
      trainModel(scorerInstance)
      modelInitialized = true
    }
  }
  return scorerInstance
}

/**
 * Train model with synthetic data
 */
function trainModel(scorer: SignalQualityScorer) {
  const trainingData = []

  // Generate synthetic training data
  for (let i = 0; i < 500; i++) {
    const rsi = 30 + Math.random() * 40
    const trend = (Math.random() - 0.5) * 2
    const adx = 15 + Math.random() * 30
    const volRatio = 0.5 + Math.random() * 2

    // Outcome based on features (synthetic pattern)
    let outcome = 0.5
    if (rsi < 40 && trend > 0) outcome += 0.3
    if (rsi > 60 && trend < 0) outcome -= 0.3
    if (adx > 25) outcome += trend * 0.2
    if (volRatio > 1.5) outcome += (Math.random() - 0.5) * 0.2
    outcome = Math.max(0, Math.min(1, outcome))

    trainingData.push({
      features: {
        return_1: trend * 0.02,
        return_5: trend * 0.03,
        return_10: trend * 0.04,
        volatility_10: 0.02 + Math.random() * 0.03,
        volatility_20: 0.02 + Math.random() * 0.03,
        rsi_14: rsi,
        macd: trend * 0.1,
        macd_signal: trend * 0.08,
        bollinger_position: (Math.random() - 0.5) * 2,
        adx: adx,
        volume_ratio: volRatio,
        volume_trend: (volRatio - 1) * 0.1,
        ema_cross: trend > 0 ? 1 : -1,
        supertrend_direction: trend > 0 ? 1 : -1,
        trend_strength: trend,
        funding_rate: (Math.random() - 0.5) * 0.001,
        basis: (Math.random() - 0.5) * 0.01,
        open_interest_change: (Math.random() - 0.5) * 0.05,
      },
      outcome,
    })
  }

  scorer.train(trainingData)
}

// In-memory storage for historical scores
export const scoreHistory: Array<{
  id: string
  timestamp: number
  score: number
  confidence: number
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  quality: 'HIGH' | 'MEDIUM' | 'LOW'
  symbol: string
}> = []
