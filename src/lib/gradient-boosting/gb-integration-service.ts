/**
 * Gradient Boosting Integration Service
 *
 * Integrates Gradient Boosting Signal Scorer with:
 * - ML Signal Pipeline
 * - Trading Bots (DCA, BB, ORION)
 * - LOGOS Engine
 * - Exchange Feature Provider
 * - Training Data Collector
 */

import { 
  GradientBoostingClassifier, 
  SignalQualityScorer,
  type SignalFeatures,
  type SignalScore,
  type BoostingConfig
} from './index'
import { 
  ExchangeFeatureProvider, 
  getFeatureProvider,
  type OHLCV 
} from './exchange-feature-provider'
import {
  TrainingDataCollector,
  getTrainingCollector,
  type TrainingSample
} from './training-collector'

// =============================================================================
// TYPES
// =============================================================================

export interface GBIntegrationConfig {
  /** Enable/disable Gradient Boosting integration */
  enabled: boolean
  /** Minimum score to pass filter (0-100) */
  minScoreToPass: number
  /** Minimum confidence to pass filter (0-100) */
  minConfidenceToPass: number
  /** Weight in ensemble with other ML models (0-1) */
  ensembleWeight: number
  /** Auto-train with collected data */
  autoTrain: boolean
  /** Training interval in ms */
  trainIntervalMs: number
  /** Use in LOGOS aggregation */
  useInLOGOS: boolean
  /** Filter mode */
  filterMode: 'STRICT' | 'MODERATE' | 'LENIENT'
  /** Min score to pass */
  minScoreToPass?: number
  /** Min confidence to pass */
  minConfidenceToPass?: number
}

export interface BotSignalInput {
  botCode: string
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT'
  confidence: number
  entryPrice: number
  candles?: OHLCV[]
  features?: SignalFeatures
}

export interface EnhancedSignal {
  original: BotSignalInput
  gbScore: SignalScore
  normalizedScore: number
  passed: boolean
  filterReason?: string
  recommendation: 'APPROVE' | 'REJECT' | 'MONITOR'
  sampleId?: string
}

export interface GBBotIntegration {
  botCode: string
  enabled: boolean
  minScore: number
  weight: number
  useAsFilter: boolean
  useAsConfidenceAdjuster: boolean
}

export interface TrainingStats {
  totalSamples: number
  completedSamples: number
  pendingSamples: number
  winRate: number
  avgPnl: number
  avgHoldTime: number
  lastTrainTime: number
  trainScore: number
  validationScore: number
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_GB_CONFIG: GBIntegrationConfig = {
  enabled: true,
  minScoreToPass: 40,
  minConfidenceToPass: 50,
  ensembleWeight: 0.25,
  autoTrain: true,
  trainIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  useInLOGOS: true,
  filterMode: 'MODERATE',
}

export const DEFAULT_BOT_INTEGRATIONS: GBBotIntegration[] = [
  { botCode: 'DCA', enabled: true, minScore: 40, weight: 0.3, useAsFilter: true, useAsConfidenceAdjuster: true },
  { botCode: 'BB', enabled: true, minScore: 45, weight: 0.25, useAsFilter: true, useAsConfidenceAdjuster: true },
  { botCode: 'ORION', enabled: true, minScore: 40, weight: 0.25, useAsFilter: true, useAsConfidenceAdjuster: true },
  { botCode: 'Zenbot', enabled: true, minScore: 35, weight: 0.3, useAsFilter: true, useAsConfidenceAdjuster: true },
  { botCode: 'VISION', enabled: false, minScore: 50, weight: 0.2, useAsFilter: false, useAsConfidenceAdjuster: false },
]

// =============================================================================
// GRADIENT BOOSTING INTEGRATION SERVICE
// =============================================================================

export class GBIntegrationService {
  private config: GBIntegrationConfig
  private botIntegrations: Map<string, GBBotIntegration>
  private scorer: SignalQualityScorer
  private collector: TrainingDataCollector
  private lastTrainTime: number = 0
  private pendingSignals: Map<string, BotSignalInput> = new Map()

  constructor(
    config: Partial<GBIntegrationConfig> = {},
    boostingConfig?: Partial<BoostingConfig>
  ) {
    this.config = { ...DEFAULT_GB_CONFIG, ...config }
    this.botIntegrations = new Map(
      DEFAULT_BOT_INTEGRATIONS.map(b => [b.botCode, b])
    )
    this.scorer = new SignalQualityScorer(boostingConfig)
    this.collector = getTrainingCollector()

    // Setup auto-train callback
    this.collector.setRetrainCallback((samples) => {
      if (this.config.autoTrain) {
        this.trainFromSamples(samples)
      }
    })
  }

  /**
   * Score a signal from a trading bot
   */
  async scoreBotSignal(
    signal: BotSignalInput,
    candles?: OHLCV[]
  ): Promise<EnhancedSignal> {
    if (!this.config.enabled) {
      return this.createPassThroughResult(signal)
    }

    // Get bot integration config
    const botConfig = this.botIntegrations.get(signal.botCode) || DEFAULT_BOT_INTEGRATIONS[0]
    
    if (!botConfig.enabled) {
      return this.createPassThroughResult(signal)
    }

    // Get features
    let features: SignalFeatures
    
    if (signal.features) {
      features = signal.features
    } else if (candles && candles.length > 0) {
      const provider = getFeatureProvider(signal.exchange, signal.symbol)
      features = provider.getFeaturesForSignal(candles)
    } else {
      // Use default/neutral features
      features = this.getDefaultFeatures()
    }

    // Score with GB
    const gbScore = this.scorer.score(features)
    const normalizedScore = this.normalizeScore(gbScore.score)

    // Determine if passed
    const passed = this.checkPassCriteria(gbScore, botConfig, normalizedScore)
    const filterReason = passed ? undefined : this.getFilterReason(gbScore, botConfig, normalizedScore)

    // Determine recommendation
    const recommendation = this.getRecommendation(gbScore, normalizedScore)

    // Record for training if enabled
    if (botConfig.useAsFilter && passed) {
      const sampleId = this.collector.recordSignal(
        {
          symbol: signal.symbol,
          exchange: signal.exchange,
          botCode: signal.botCode,
          direction: signal.direction,
          confidence: signal.confidence,
          entryPrice: signal.entryPrice,
        },
        features
      )
      
      // Store pending signal for outcome tracking
      this.pendingSignals.set(sampleId, signal)
    }

    return {
      original: signal,
      gbScore: {
        ...gbScore,
        confidence: gbScore.confidence * 100,
      },
      normalizedScore,
      passed,
      filterReason,
      recommendation,
    }
  }

  /**
   * Record outcome for a signal
   */
  recordOutcome(sampleId: string, outcome: {
    exitPrice: number
    pnlPercent: number
    holdTimeMs: number
    maxDrawdown?: number
    maxProfit?: number
  }): boolean {
    const result = this.collector.recordOutcome(sampleId, outcome)
    
    if (result) {
      this.pendingSignals.delete(sampleId)
    }
    
    return result
  }

  /**
   * Get score for LOGOS aggregation
   */
  getLOGOSScore(signal: BotSignalInput, candles?: OHLCV[]): Promise<number> {
    if (!this.config.useInLOGOS) {
      return Promise.resolve(0.5)
    }

    return this.scoreBotSignal(signal, candles).then(result => {
      return result.normalizedScore / 100
    })
  }

  /**
   * Adjust confidence based on GB score
   */
  adjustConfidence(
    originalConfidence: number,
    gbScore: SignalScore
  ): number {
    const normalizedGB = this.normalizeScore(gbScore.score) / 100

    // Blend original confidence with GB score
    const blended = originalConfidence * 0.6 + normalizedGB * 0.4

    // Apply quality bonus/penalty
    if (gbScore.quality === 'HIGH') {
      return Math.min(1, blended * 1.15)
    } else if (gbScore.quality === 'LOW') {
      return Math.max(0, blended * 0.85)
    }

    return blended
  }

  /**
   * Update bot integration config
   */
  updateBotIntegration(botCode: string, config: Partial<GBBotIntegration>): void {
    const existing = this.botIntegrations.get(botCode) || {
      botCode,
      enabled: true,
      minScore: 40,
      weight: 0.25,
      useAsFilter: true,
      useAsConfidenceAdjuster: true,
    }
    
    this.botIntegrations.set(botCode, { ...existing, ...config })
  }

  /**
   * Get all bot integrations
   */
  getBotIntegrations(): GBBotIntegration[] {
    return Array.from(this.botIntegrations.values())
  }

  /**
   * Get feature importance
   */
  getFeatureImportance(): Record<string, number> {
    return this.scorer.getFeatureImportance()
  }

  /**
   * Get training statistics
   */
  getTrainingStats() {
    return this.collector.getStats()
  }

  /**
   * Get pending signals
   */
  getPendingSignals(): Map<string, BotSignalInput> {
    return new Map(this.pendingSignals)
  }

  /**
   * Export model and training data
   */
  exportAll(): string {
    return JSON.stringify({
      config: this.config,
      botIntegrations: Array.from(this.botIntegrations.entries()),
      trainingData: this.collector.exportData(),
      exportedAt: Date.now(),
    }, null, 2)
  }

  /**
   * Import model and training data
   */
  importAll(json: string): boolean {
    try {
      const data = JSON.parse(json)
      
      if (data.config) {
        this.config = { ...DEFAULT_GB_CONFIG, ...data.config }
      }
      
      if (data.botIntegrations) {
        this.botIntegrations = new Map(data.botIntegrations)
      }
      
      if (data.trainingData) {
        this.collector.importData(data.trainingData)
      }
      
      return true
    } catch {
      return false
    }
  }

  /**
   * Update main config
   */
  updateConfig(config: Partial<GBIntegrationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current config
   */
  getConfig(): GBIntegrationConfig {
    return { ...this.config }
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private normalizeScore(rawScore: number): number {
    // Raw score is typically -1 to 1, normalize to 0-100
    return Math.max(0, Math.min(100, (rawScore + 1) * 50))
  }

  private checkPassCriteria(
    gbScore: SignalScore,
    botConfig: GBBotIntegration,
    normalizedScore: number
  ): boolean {
    // Check minimum score
    if (normalizedScore < botConfig.minScore) {
      return false
    }

    // Check minimum confidence
    if (gbScore.confidence * 100 < this.config.minConfidenceToPass) {
      return false
    }

    // Check quality in strict mode
    if (this.config.filterMode === 'STRICT' && gbScore.quality === 'LOW') {
      return false
    }

    return true
  }

  private getFilterReason(
    gbScore: SignalScore,
    botConfig: GBBotIntegration,
    normalizedScore: number
  ): string {
    if (normalizedScore < botConfig.minScore) {
      return `Score ${normalizedScore.toFixed(0)} below minimum ${botConfig.minScore}`
    }
    
    if (gbScore.confidence * 100 < this.config.minConfidenceToPass) {
      return `Confidence ${(gbScore.confidence * 100).toFixed(0)}% below minimum ${this.config.minConfidenceToPass}%`
    }
    
    if (this.config.filterMode === 'STRICT' && gbScore.quality === 'LOW') {
      return 'Quality LOW in STRICT mode'
    }
    
    return 'Failed filter criteria'
  }

  private getRecommendation(
    gbScore: SignalScore,
    normalizedScore: number
  ): 'APPROVE' | 'REJECT' | 'MONITOR' {
    if (normalizedScore >= 70 && gbScore.quality !== 'LOW') {
      return 'APPROVE'
    }
    
    if (normalizedScore < 30 || gbScore.quality === 'LOW') {
      return 'REJECT'
    }
    
    return 'MONITOR'
  }

  private createPassThroughResult(signal: BotSignalInput): EnhancedSignal {
    return {
      original: signal,
      gbScore: {
        score: 0.5,
        confidence: 50,
        direction: signal.direction,
        quality: 'MEDIUM',
        features: {},
      },
      normalizedScore: 50,
      passed: true,
      recommendation: 'APPROVE',
    }
  }

  private getDefaultFeatures(): SignalFeatures {
    return {
      return_1: 0,
      return_5: 0,
      return_10: 0,
      volatility_10: 0.02,
      volatility_20: 0.02,
      rsi_14: 50,
      macd: 0,
      macd_signal: 0,
      bollinger_position: 0,
      adx: 25,
      volume_ratio: 1,
      volume_trend: 0,
      ema_cross: 0,
      supertrend_direction: 0,
      trend_strength: 0,
      funding_rate: 0,
      basis: 0,
      open_interest_change: 0,
    }
  }

  private trainFromSamples(samples: TrainingSample[]): void {
    const trainingData = samples
      .filter(s => s.outcome !== undefined)
      .map(s => ({
        features: s.features,
        outcome: s.outcome!,
      }))

    if (trainingData.length >= 50) {
      this.scorer.train(trainingData)
      this.lastTrainTime = Date.now()
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let gbIntegrationInstance: GBIntegrationService | null = null

/**
 * Get singleton GB Integration Service
 */
export function getGBIntegration(
  config?: Partial<GBIntegrationConfig>
): GBIntegrationService {
  if (!gbIntegrationInstance) {
    gbIntegrationInstance = new GBIntegrationService(config)
  }
  return gbIntegrationInstance
}

/**
 * Reset instance (for testing)
 */
export function resetGBIntegration(): void {
  gbIntegrationInstance = null
}
