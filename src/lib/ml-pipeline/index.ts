/**
 * ML Pipeline Module
 * Export all components for the ML Pipeline Infrastructure
 */

// Types
export type {
  OHLCV,
  Orderbook,
  OrderbookLevel,
  FundingRate,
  OpenInterest,
  MarketData,
  FeatureConfig,
  FeatureSet,
  FeatureImportance,
  ModelConfig,
  ModelType,
  ModelAlgorithm,
  TrainingResult,
  ModelMetrics,
  ModelVersion,
  ABTest,
  ABTestResult,
  DataCollectionConfig,
  DataCollectionResult,
  AutoMLConfig,
  AutoMLTrial,
  AutoMLResult,
  MLPipelineConfig,
  MLPipelineResult,
  PredictionResult
} from './types'

// Components
export { DataCollector, dataCollector } from './data-collector'
export { FeatureEngineer, featureEngineer } from './feature-engineer'
export { AutoMLEngine, autoMLEngine } from './auto-ml-engine'
export { ModelRegistry, modelRegistry } from './model-registry'

// Convenience functions
import { dataCollector } from './data-collector'
import { featureEngineer } from './feature-engineer'
import { autoMLEngine } from './auto-ml-engine'
import { modelRegistry } from './model-registry'
import type { OHLCV, FeatureSet, AutoMLConfig, AutoMLResult, PredictionResult } from './types'

/**
 * Quick training pipeline
 */
export async function quickTrain(
  exchange: string,
  symbol: string,
  interval: string = '1h',
  config?: Partial<AutoMLConfig>
): Promise<{
  success: boolean
  result?: AutoMLResult
  error?: string
}> {
  try {
    // 1. Collect data
    const ohlcv = await dataCollector.collectOHLCV(exchange, symbol, interval, 500)

    if (ohlcv.length < 100) {
      return { success: false, error: 'Insufficient data' }
    }

    // 2. Generate features
    const features = featureEngineer.generateFeatures(ohlcv)
    const normalized = featureEngineer.normalizeFeatures(features)

    // 3. Add labels (future returns)
    const labeled = normalized.map((fs, i) => {
      if (i < normalized.length - 1) {
        const futureReturn = (ohlcv[i + 1].close - ohlcv[i].close) / ohlcv[i].close
        return {
          ...fs,
          labels: { returns: futureReturn }
        }
      }
      return fs
    }).slice(0, -1) // Remove last (no label)

    // 4. AutoML
    const autoMLConfig: AutoMLConfig = {
      targetMetric: 'directionalAccuracy',
      maxTrials: 10,
      maxTime: 60,
      earlyStoppingRounds: 5,
      featureSelection: true,
      hyperparameterTuning: true,
      ensembleMethods: false,
      ...config
    }

    const result = await autoMLEngine.optimize(labeled, autoMLConfig)

    // 5. Register model
    if (result.bestModel) {
      modelRegistry.registerModel(
        result.bestModel,
        null, // Weights would be stored here in production
        result.bestMetrics
      )
    }

    return { success: true, result }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Quick prediction
 */
export async function quickPredict(
  exchange: string,
  symbol: string,
  interval: string = '1h'
): Promise<{
  success: boolean
  prediction?: PredictionResult
  error?: string
}> {
  try {
    // 1. Collect recent data
    const ohlcv = await dataCollector.collectOHLCV(exchange, symbol, interval, 100)

    if (ohlcv.length < 50) {
      return { success: false, error: 'Insufficient data' }
    }

    // 2. Generate features for last candle
    const features = featureEngineer.generateFeatures(ohlcv.slice(-2))
    const lastFeatures = features[features.length - 1]

    // 3. Get prediction from AutoML engine
    const featureArray = Object.values(lastFeatures.features)
    const prediction = autoMLEngine.predict(featureArray)

    if (!prediction) {
      return { success: false, error: 'No trained model available' }
    }

    return {
      success: true,
      prediction: {
        timestamp: lastFeatures.timestamp,
        prediction: prediction.prediction,
        confidence: prediction.confidence,
        features: lastFeatures.features
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get pipeline status
 */
export function getPipelineStatus(): {
  dataCollector: { cacheSize: number }
  featureEngineer: { enabledFeatures: string[] }
  autoML: { trialsCount: number; bestModel: string | null }
  modelRegistry: {
    totalModels: number
    totalVersions: number
    activeABTests: number
  }
} {
  return {
    dataCollector: {
      cacheSize: 0 // Would track cache size
    },
    featureEngineer: {
      enabledFeatures: featureEngineer.getEnabledFeatures()
    },
    autoML: {
      trialsCount: autoMLEngine.getTrials().length,
      bestModel: autoMLEngine.getBestModel()?.config.name || null
    },
    modelRegistry: modelRegistry.getStats()
  }
}
