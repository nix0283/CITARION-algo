/**
 * ML Signal Pipeline
 * 
 * Integrates Lawrence Classifier with trading signal flow.
 * Provides signal quality enhancement, filtering, and confidence calibration.
 * 
 * Flow: Signal → Feature Extraction → Lawrence Classification → Quality Enhancement → Output
 */

import { 
  LawrenceClassifier, 
  getLawrenceClassifier,
  type LawrenceFeatures,
  type LawrenceResult,
  type TrainingSample,
} from './lawrence-classifier'

import {
  SignalAdapter,
  getSignalAdapter,
  SignalType,
  createSignalFromClassifierResult,
  type Signal,
  type SignalMetadata,
} from './signal-adapter'

import { getEventBus } from '../orchestration'
import type { AnalyticsEvent, BotCode } from '../orchestration/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Signal source for ML pipeline
 */
export interface SignalSource {
  botCode: BotCode
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
  timestamp: number
  metadata?: Record<string, unknown>
}

/**
 * Market context for signal enhancement
 */
export interface MarketContext {
  symbol: string
  exchange: string
  timeframe: string
  // OHLCV data
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
  // Pre-calculated indicators
  rsi?: number
  macd?: number
  ema20?: number
  ema50?: number
  atr?: number
  volumeRatio?: number
  // Market state
  trend: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING'
  volatility: 'LOW' | 'MEDIUM' | 'HIGH'
  volumeProfile: 'LOW' | 'MEDIUM' | 'HIGH'
}

/**
 * Enhanced signal output
 */
export interface EnhancedSignal {
  id: string
  timestamp: number
  
  // Original signal info
  source: {
    botCode: BotCode
    originalDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
    originalConfidence: number
  }
  
  // ML-enhanced values
  mlDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
  mlConfidence: number
  mlProbability: number
  
  // Quality metrics
  quality: 'HIGH' | 'MEDIUM' | 'LOW'
  qualityScore: number  // 0-1
  
  // Agreement
  agreement: 'CONFIRMED' | 'CONFLICT' | 'NEUTRAL'
  agreementScore: number  // 0-1
  
  // Trading parameters
  entryPrice: number
  stopLoss: number
  takeProfit: number
  riskRewardRatio: number
  
  // Filters applied
  filtersPassed: boolean
  filterResults: {
    regime: boolean
    adx: boolean
    volatility: boolean
    session: boolean
    confidence: boolean
  }
  
  // Features used
  features: Record<string, number>
  
  // Processing metadata
  processingTime: number  // microseconds
}

/**
 * Pipeline configuration
 */
export interface MLPipelineConfig {
  // Enable/disable ML enhancement
  enabled: boolean
  
  // Minimum confidence threshold
  minConfidence: number
  
  // Minimum quality score to pass
  minQualityScore: number
  
  // Agreement threshold for confirmation
  agreementThreshold: number
  
  // Filter settings
  useRegimeFilter: boolean
  useAdxFilter: boolean
  useVolatilityFilter: boolean
  useSessionFilter: boolean
  
  // Auto-training
  autoTrain: boolean
  trainingThreshold: number  // Minimum samples before using
  
  // Confidence adjustment
  adjustConfidence: boolean
  confidenceBonus: number  // Bonus for agreement
  confidencePenalty: number  // Penalty for conflict
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_ML_PIPELINE_CONFIG: MLPipelineConfig = {
  enabled: true,
  minConfidence: 0.5,
  minQualityScore: 0.4,
  agreementThreshold: 0.6,
  useRegimeFilter: true,
  useAdxFilter: true,
  useVolatilityFilter: true,
  useSessionFilter: true,
  autoTrain: true,
  trainingThreshold: 100,
  adjustConfidence: true,
  confidenceBonus: 0.15,
  confidencePenalty: 0.2,
}

// ============================================================================
// ML SIGNAL PIPELINE
// ============================================================================

/**
 * ML Signal Pipeline
 * 
 * Main class for signal enhancement using Lawrence Classifier
 */
export class MLSignalPipeline {
  private classifier: LawrenceClassifier
  private signalAdapter: SignalAdapter
  private eventBus = getEventBus()
  private config: MLPipelineConfig
  private trainingSamples: TrainingSample[] = []
  private processedSignals: EnhancedSignal[] = []
  private stats = {
    totalSignals: 0,
    confirmedSignals: 0,
    rejectedSignals: 0,
    avgProcessingTime: 0,
  }

  constructor(config: Partial<MLPipelineConfig> = {}) {
    this.config = { ...DEFAULT_ML_PIPELINE_CONFIG, ...config }
    this.classifier = getLawrenceClassifier({
      filterSettings: {
        useRegimeFilter: this.config.useRegimeFilter,
        useAdxFilter: this.config.useAdxFilter,
        useVolatilityFilter: this.config.useVolatilityFilter,
        regimeThreshold: 0.5,
        adxThreshold: 20,
        volatilityThreshold: 1.5,
      },
    })
    this.signalAdapter = getSignalAdapter({
      minConfidence: this.config.minConfidence,
    })
  }

  /**
   * Process a signal through the ML pipeline
   */
  async processSignal(
    source: SignalSource,
    context: MarketContext
  ): Promise<EnhancedSignal> {
    const startTime = performance.now()

    // Extract features from context
    const features = this.extractFeatures(source, context)
    
    // Run Lawrence classifier
    const mlResult = this.classifier.classify(features)
    
    // Calculate quality score
    const qualityScore = this.calculateQualityScore(source, mlResult, context)
    
    // Determine agreement
    const agreement = this.calculateAgreement(source, mlResult)
    
    // Adjust confidence
    let adjustedConfidence = mlResult.confidence
    if (this.config.adjustConfidence) {
      if (agreement.agreement === 'CONFIRMED') {
        adjustedConfidence = Math.min(1, adjustedConfidence + this.config.confidenceBonus)
      } else if (agreement.agreement === 'CONFLICT') {
        adjustedConfidence = Math.max(0, adjustedConfidence - this.config.confidencePenalty)
      }
    }
    
    // Apply filters
    const filterResults = this.applyFilters(context, source)
    const filtersPassed = Object.values(filterResults).every(v => v)
    
    // Determine quality level
    let quality: 'HIGH' | 'MEDIUM' | 'LOW'
    if (qualityScore >= 0.7 && agreement.agreement === 'CONFIRMED') {
      quality = 'HIGH'
    } else if (qualityScore >= 0.4) {
      quality = 'MEDIUM'
    } else {
      quality = 'LOW'
    }
    
    // Calculate trading parameters
    const entryPrice = source.entryPrice || context.close[context.close.length - 1]
    const stopLoss = source.stopLoss || this.calculateStopLoss(entryPrice, mlResult.direction, context)
    const takeProfit = source.takeProfit || this.calculateTakeProfit(entryPrice, mlResult.direction, context)
    const riskRewardRatio = this.calculateRiskReward(entryPrice, stopLoss, takeProfit)
    
    // Build enhanced signal
    const enhanced: EnhancedSignal = {
      id: `ml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      source: {
        botCode: source.botCode,
        originalDirection: source.direction,
        originalConfidence: source.confidence,
      },
      mlDirection: mlResult.direction,
      mlConfidence: adjustedConfidence,
      mlProbability: mlResult.probability,
      quality,
      qualityScore,
      agreement: agreement.agreement,
      agreementScore: agreement.score,
      entryPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio,
      filtersPassed,
      filterResults,
      features: mlResult.features,
      processingTime: (performance.now() - startTime) * 1000, // microseconds
    }
    
    // Update stats
    this.stats.totalSignals++
    if (filtersPassed && quality !== 'LOW') {
      this.stats.confirmedSignals++
    } else {
      this.stats.rejectedSignals++
    }
    this.stats.avgProcessingTime = 
      (this.stats.avgProcessingTime * (this.stats.totalSignals - 1) + enhanced.processingTime) / 
      this.stats.totalSignals
    
    // Store processed signal
    this.processedSignals.push(enhanced)
    if (this.processedSignals.length > 1000) {
      this.processedSignals.shift()
    }
    
    // Auto-train if enabled
    if (this.config.autoTrain && this.trainingSamples.length < this.config.trainingThreshold) {
      // Queue for training (label will be set after outcome)
      this.trainingSamples.push({
        features: mlResult.features,
        label: mlResult.direction,
        weight: adjustedConfidence,
        timestamp: Date.now(),
      })
    }
    
    // Publish enhanced signal event
    await this.publishEnhancedSignal(enhanced)
    
    return enhanced
  }

  /**
   * Extract Lawrence features from signal source and market context
   */
  private extractFeatures(source: SignalSource, context: MarketContext): LawrenceFeatures {
    const now = new Date()
    const hour = now.getUTCHours()
    const dayOfWeek = now.getUTCDay()
    
    // Determine session overlap
    const isLondon = hour >= 8 && hour < 16
    const isNY = hour >= 13 && hour < 21
    const isAsian = hour >= 0 && hour < 8
    const isSessionOverlap = (isLondon && isNY) || (isAsian && isLondon)
    
    return {
      indicators: {
        rsi: context.rsi,
        macd: context.macd,
        ema20: context.ema20,
        ema50: context.ema50,
        atr: context.atr,
        volumeRatio: context.volumeRatio,
      },
      context: {
        trend: context.trend,
        volatility: context.volatility,
        volume: context.volumeProfile,
      },
      signal: {
        direction: source.direction,
        symbol: source.symbol,
        timeframe: context.timeframe,
        entryPrice: source.entryPrice || context.close[context.close.length - 1],
      },
      time: {
        hour,
        dayOfWeek,
        isSessionOverlap,
      },
    }
  }

  /**
   * Calculate quality score for the signal
   */
  private calculateQualityScore(
    source: SignalSource,
    mlResult: LawrenceResult,
    context: MarketContext
  ): number {
    let score = 0
    
    // Confidence component (0-0.3)
    score += mlResult.confidence * 0.3
    
    // Probability component (0-0.25)
    score += mlResult.probability * 0.25
    
    // Agreement component (0-0.25)
    const agreementScore = source.direction === mlResult.direction ? 1 : 
                          source.direction === 'NEUTRAL' || mlResult.direction === 'NEUTRAL' ? 0.5 : 0
    score += agreementScore * 0.25
    
    // Market context component (0-0.2)
    let contextScore = 0
    if (context.trend !== 'RANGING' || mlResult.direction === 'NEUTRAL') {
      contextScore += 0.5
    }
    if (context.volatility !== 'HIGH') {
      contextScore += 0.5
    }
    score += contextScore * 0.2
    
    return Math.min(1, score)
  }

  /**
   * Calculate agreement between source signal and ML result
   */
  private calculateAgreement(
    source: SignalSource,
    mlResult: LawrenceResult
  ): { agreement: 'CONFIRMED' | 'CONFLICT' | 'NEUTRAL'; score: number } {
    // Both neutral
    if (source.direction === 'NEUTRAL' && mlResult.direction === 'NEUTRAL') {
      return { agreement: 'NEUTRAL', score: 0.5 }
    }
    
    // One neutral
    if (source.direction === 'NEUTRAL' || mlResult.direction === 'NEUTRAL') {
      return { agreement: 'NEUTRAL', score: 0.5 }
    }
    
    // Same direction
    if (source.direction === mlResult.direction) {
      return { agreement: 'CONFIRMED', score: 0.8 + mlResult.confidence * 0.2 }
    }
    
    // Opposite directions
    return { agreement: 'CONFLICT', score: 0.2 }
  }

  /**
   * Apply filters to the signal
   */
  private applyFilters(context: MarketContext, source: SignalSource): EnhancedSignal['filterResults'] {
    const { high, low, close } = context
    
    // Regime filter
    let regime = true
    if (this.config.useRegimeFilter) {
      const filterResult = this.classifier.applyFilters(high, low, close)
      regime = filterResult.passed || !filterResult.reasons.some(r => r.includes('Regime'))
    }
    
    // ADX filter
    let adx = true
    if (this.config.useAdxFilter) {
      const filterResult = this.classifier.applyFilters(high, low, close)
      adx = filterResult.passed || !filterResult.reasons.some(r => r.includes('ADX'))
    }
    
    // Volatility filter
    let volatility = true
    if (this.config.useVolatilityFilter) {
      const filterResult = this.classifier.applyFilters(high, low, close)
      volatility = filterResult.passed || !filterResult.reasons.some(r => r.includes('Volatility'))
    }
    
    // Session filter (based on time)
    let session = true
    if (this.config.useSessionFilter) {
      const now = new Date()
      const hour = now.getUTCHours()
      const day = now.getUTCDay()
      // Skip weekends for crypto
      // session = day !== 0 && day !== 6 // Uncomment to disable weekends
      session = true // Allow all sessions for crypto
    }
    
    // Confidence filter
    const confidence = source.confidence >= this.config.minConfidence
    
    return { regime, adx, volatility, session, confidence }
  }

  /**
   * Calculate stop loss price
   */
  private calculateStopLoss(
    entryPrice: number,
    direction: 'LONG' | 'SHORT' | 'NEUTRAL',
    context: MarketContext
  ): number {
    if (direction === 'NEUTRAL') return entryPrice
    
    const atr = context.atr || entryPrice * 0.01 // Default 1% ATR
    const atrMultiplier = 1.5
    
    if (direction === 'LONG') {
      return entryPrice - atr * atrMultiplier
    } else {
      return entryPrice + atr * atrMultiplier
    }
  }

  /**
   * Calculate take profit price
   */
  private calculateTakeProfit(
    entryPrice: number,
    direction: 'LONG' | 'SHORT' | 'NEUTRAL',
    context: MarketContext
  ): number {
    if (direction === 'NEUTRAL') return entryPrice
    
    const atr = context.atr || entryPrice * 0.01
    const atrMultiplier = 3.0 // 2:1 RR minimum
    
    if (direction === 'LONG') {
      return entryPrice + atr * atrMultiplier
    } else {
      return entryPrice - atr * atrMultiplier
    }
  }

  /**
   * Calculate risk/reward ratio
   */
  private calculateRiskReward(entry: number, sl: number, tp: number): number {
    const risk = Math.abs(entry - sl)
    const reward = Math.abs(tp - entry)
    return risk > 0 ? reward / risk : 0
  }

  /**
   * Publish enhanced signal to event bus
   */
  private async publishEnhancedSignal(signal: EnhancedSignal): Promise<void> {
    await this.eventBus.publishSignal('LOGOS', {
      id: signal.id,
      timestamp: signal.timestamp,
      category: 'analytics',
      source: 'ML_PIPELINE',
      type: 'signal.confirmed',
      data: {
        signalId: signal.id,
        botId: signal.source.botCode,
        signalType: 'entry',
        direction: signal.mlDirection,
        confidence: signal.mlConfidence,
        symbol: signal.source.botCode,
        quality: signal.quality,
        agreement: signal.agreement,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
      },
    } as AnalyticsEvent)
  }

  /**
   * Train with outcome data
   */
  trainWithOutcome(signalId: string, outcome: 'WIN' | 'LOSS' | 'NEUTRAL'): void {
    const signal = this.processedSignals.find(s => s.id === signalId)
    if (!signal) return
    
    const label = outcome === 'WIN' 
      ? signal.mlDirection 
      : outcome === 'LOSS' 
        ? (signal.mlDirection === 'LONG' ? 'SHORT' : 'LONG')
        : 'NEUTRAL'
    
    const sample: TrainingSample = {
      features: signal.features,
      label,
      weight: signal.mlConfidence,
      timestamp: Date.now(),
    }
    
    this.classifier.train(sample)
  }

  /**
   * Get pipeline statistics
   */
  getStats(): typeof this.stats & { classifierStats: ReturnType<LawrenceClassifier['getStats']> } {
    return {
      ...this.stats,
      classifierStats: this.classifier.getStats(),
    }
  }

  /**
   * Get processed signals
   */
  getProcessedSignals(limit?: number): EnhancedSignal[] {
    return limit ? this.processedSignals.slice(-limit) : [...this.processedSignals]
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MLPipelineConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get configuration
   */
  getConfig(): MLPipelineConfig {
    return { ...this.config }
  }

  /**
   * Export training data
   */
  exportTrainingData(): TrainingSample[] {
    return this.classifier.exportTrainingData()
  }

  /**
   * Import training data
   */
  importTrainingData(data: TrainingSample[]): void {
    this.classifier.importTrainingData(data)
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let pipelineInstance: MLSignalPipeline | null = null

/**
 * Get ML Signal Pipeline instance
 */
export function getMLSignalPipeline(config?: Partial<MLPipelineConfig>): MLSignalPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new MLSignalPipeline(config)
  } else if (config) {
    pipelineInstance.setConfig(config)
  }
  return pipelineInstance
}

/**
 * Reset pipeline instance
 */
export function resetMLSignalPipeline(): void {
  pipelineInstance = null
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  DEFAULT_ML_PIPELINE_CONFIG,
  type SignalSource,
  type MarketContext,
  type EnhancedSignal,
  type MLPipelineConfig,
}
