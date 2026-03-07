/**
 * ML Signal Filter Integration Layer
 * 
 * Integrates Lawrence Classifier into the signal pipeline for:
 * - Signal quality enhancement
 * - Direction confirmation
 * - Confidence calibration
 * - False signal filtering
 * 
 * Pipeline: Bot Signal → ML Filter → LOGOS Aggregation → Output
 */

import {
  LawrenceClassifier,
  getLawrenceClassifier,
  type LawrenceFeatures,
  type LawrenceResult,
  type TrainingSample,
  type FilterSettings,
  regime_filter,
  filter_adx,
  filter_volatility,
} from './lawrence-classifier'

import type { BotCode } from '../orchestration/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Signal to be filtered through ML
 */
export interface SignalForFiltering {
  botCode: BotCode
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
  
  // Market data for feature extraction
  marketData?: {
    high: number[]
    low: number[]
    close: number[]
    volume?: number[]
  }
  
  // Indicator values (optional, will be calculated if not provided)
  indicators?: {
    rsi?: number
    macd?: number
    ema20?: number
    ema50?: number
    atr?: number
    volumeRatio?: number
  }
  
  // Context
  context?: {
    trend?: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING'
    volatility?: 'LOW' | 'MEDIUM' | 'HIGH'
    volume?: 'LOW' | 'MEDIUM' | 'HIGH'
  }
  
  metadata?: Record<string, unknown>
}

/**
 * Filtered signal result
 */
export interface FilteredSignal {
  // Original signal data
  original: SignalForFiltering
  
  // ML classification result
  mlResult: LawrenceResult
  
  // Filter decision
  passed: boolean
  rejectionReasons: string[]
  
  // Adjusted values
  adjustedDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
  adjustedConfidence: number
  
  // Quality metrics
  mlScore: number          // 0-1, ML agreement with signal
  qualityScore: number     // 0-1, overall signal quality
  riskScore: number        // 0-1, risk assessment (lower is better)
  
  // Recommendations
  recommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
  suggestedAdjustments?: {
    direction?: 'LONG' | 'SHORT' | 'NEUTRAL'
    confidenceMultiplier?: number
    additionalStopLossPercent?: number
    additionalTakeProfitPercent?: number
  }
  
  // Timestamps
  timestamp: number
  processingTimeMs: number
}

/**
 * ML Filter configuration
 */
export interface MLFilterConfig {
  // Enable/disable filtering
  enabled: boolean
  
  // Minimum confidence to pass filter
  minConfidence: number
  
  // Minimum ML agreement to pass
  minMLAgreement: number
  
  // Enable filter components
  useRegimeFilter: boolean
  useADXFilter: boolean
  useVolatilityFilter: boolean
  
  // Direction confirmation
  requireDirectionConfirmation: boolean
  directionConfirmationThreshold: number  // 0-1, how much ML must agree
  
  // Confidence adjustment
  adjustConfidence: boolean
  confidenceBlendWeight: number  // 0-1, weight for ML confidence (vs original)
  
  // Auto-training
  autoTrain: boolean
  trainingThreshold: number  // Confidence threshold for auto-training
  
  // Quality thresholds
  highQualityThreshold: number
  lowQualityThreshold: number
}

/**
 * Default ML Filter configuration
 */
export const DEFAULT_ML_FILTER_CONFIG: MLFilterConfig = {
  enabled: true,
  minConfidence: 0.3,
  minMLAgreement: 0.4,
  
  useRegimeFilter: true,
  useADXFilter: true,
  useVolatilityFilter: true,
  
  requireDirectionConfirmation: false,
  directionConfirmationThreshold: 0.6,
  
  adjustConfidence: true,
  confidenceBlendWeight: 0.3,
  
  autoTrain: true,
  trainingThreshold: 0.7,
  
  highQualityThreshold: 0.7,
  lowQualityThreshold: 0.4,
}

/**
 * Filter statistics
 */
export interface MLFilterStats {
  totalSignals: number
  passedSignals: number
  rejectedSignals: number
  adjustedSignals: number
  
  avgOriginalConfidence: number
  avgFilteredConfidence: number
  avgMLScore: number
  avgQualityScore: number
  
  longApprovals: number
  shortApprovals: number
  neutralSignals: number
  
  rejectionReasons: Record<string, number>
  
  lastReset: number
}

// ============================================================================
// ML SIGNAL FILTER CLASS
// ============================================================================

/**
 * ML Signal Filter
 * 
 * Applies Lawrence Classifier to filter and enhance trading signals
 */
export class MLSignalFilter {
  private classifier: LawrenceClassifier
  private config: MLFilterConfig
  private stats: MLFilterStats
  private trainingQueue: TrainingSample[] = []
  
  constructor(config: Partial<MLFilterConfig> = {}) {
    this.config = { ...DEFAULT_ML_FILTER_CONFIG, ...config }
    this.classifier = getLawrenceClassifier()
    this.resetStats()
  }
  
  // ==========================================================================
  // MAIN FILTERING METHOD
  // ==========================================================================
  
  /**
   * Filter a signal through ML pipeline
   */
  async filter(signal: SignalForFiltering): Promise<FilteredSignal> {
    const startTime = performance.now()
    
    // Update stats
    this.stats.totalSignals++
    
    // Default result structure
    const result: FilteredSignal = {
      original: signal,
      mlResult: {
        direction: 'NEUTRAL',
        probability: 0.5,
        confidence: 0,
        features: {},
      },
      passed: true,
      rejectionReasons: [],
      adjustedDirection: signal.direction,
      adjustedConfidence: signal.confidence,
      mlScore: 0.5,
      qualityScore: 0.5,
      riskScore: 0.5,
      recommendation: 'APPROVE',
      timestamp: Date.now(),
      processingTimeMs: 0,
    }
    
    // Skip if disabled
    if (!this.config.enabled) {
      result.processingTimeMs = performance.now() - startTime
      return result
    }
    
    // Step 1: Extract features and classify
    const features = this.extractFeatures(signal)
    result.mlResult = this.classifier.classify(features)
    
    // Step 2: Apply filters
    const filterResults = this.applyFilters(signal)
    result.rejectionReasons.push(...filterResults.reasons)
    
    // Step 3: Calculate ML agreement score
    result.mlScore = this.calculateMLScore(signal, result.mlResult)
    
    // Step 4: Determine adjusted direction
    result.adjustedDirection = this.determineAdjustedDirection(signal, result.mlResult)
    
    // Step 5: Calculate adjusted confidence
    result.adjustedConfidence = this.calculateAdjustedConfidence(
      signal.confidence,
      result.mlResult.confidence,
      result.mlScore
    )
    
    // Step 6: Calculate quality and risk scores
    result.qualityScore = this.calculateQualityScore(signal, result)
    result.riskScore = this.calculateRiskScore(signal, result)
    
    // Step 7: Make filter decision
    const decision = this.makeDecision(result)
    result.passed = decision.passed
    result.recommendation = decision.recommendation
    result.rejectionReasons.push(...decision.reasons)
    
    // Step 8: Generate suggestions
    if (result.recommendation === 'ADJUST' || result.recommendation === 'MONITOR') {
      result.suggestedAdjustments = this.generateAdjustments(signal, result)
    }
    
    // Step 9: Update statistics
    this.updateStats(result)
    
    // Step 10: Auto-train if applicable
    if (this.config.autoTrain && result.qualityScore >= this.config.trainingThreshold) {
      this.queueForTraining(signal, result)
    }
    
    result.processingTimeMs = performance.now() - startTime
    return result
  }
  
  // ==========================================================================
  // FEATURE EXTRACTION
  // ==========================================================================
  
  /**
   * Extract Lawrence Features from signal
   */
  private extractFeatures(signal: SignalForFiltering): LawrenceFeatures {
    const now = new Date()
    
    // Default indicator values
    const indicators = signal.indicators || {}
    
    // Default context
    const context = signal.context || {
      trend: 'RANGING' as const,
      volatility: 'MEDIUM' as const,
      volume: 'MEDIUM' as const,
    }
    
    // Calculate context from market data if available
    if (signal.marketData) {
      const { high, low, close, volume } = signal.marketData
      
      // Determine trend
      if (close.length >= 20) {
        const sma20 = close.slice(-20).reduce((a, b) => a + b, 0) / 20
        const currentPrice = close[close.length - 1]
        if (currentPrice > sma20 * 1.02) {
          context.trend = 'TRENDING_UP'
        } else if (currentPrice < sma20 * 0.98) {
          context.trend = 'TRENDING_DOWN'
        }
      }
      
      // Determine volatility
      if (high.length >= 14 && low.length >= 14) {
        let atrSum = 0
        for (let i = high.length - 14; i < high.length; i++) {
          atrSum += high[i] - low[i]
        }
        const atr = atrSum / 14
        const avgPrice = close[close.length - 1]
        const atrPercent = atr / avgPrice
        
        if (atrPercent > 0.03) {
          context.volatility = 'HIGH'
        } else if (atrPercent < 0.01) {
          context.volatility = 'LOW'
        }
      }
      
      // Determine volume
      if (volume && volume.length >= 20) {
        const avgVolume = volume.slice(-20).reduce((a, b) => a + b, 0) / 20
        const currentVolume = volume[volume.length - 1]
        
        if (currentVolume > avgVolume * 1.5) {
          context.volume = 'HIGH'
        } else if (currentVolume < avgVolume * 0.5) {
          context.volume = 'LOW'
        }
      }
    }
    
    // Check for session overlap (London/NY overlap: 13:00-17:00 UTC)
    const hour = now.getUTCHours()
    const isSessionOverlap = hour >= 13 && hour <= 17
    
    return {
      indicators: {
        rsi: indicators.rsi,
        macd: indicators.macd,
        ema20: indicators.ema20,
        ema50: indicators.ema50,
        atr: indicators.atr,
        volumeRatio: indicators.volumeRatio,
      },
      context: {
        trend: context.trend || 'RANGING',
        volatility: context.volatility || 'MEDIUM',
        volume: context.volume || 'MEDIUM',
      },
      signal: {
        direction: signal.direction,
        symbol: signal.symbol,
        timeframe: '1h', // Default
        entryPrice: signal.entryPrice || 0,
      },
      time: {
        hour,
        dayOfWeek: now.getUTCDay(),
        isSessionOverlap,
      },
    }
  }
  
  // ==========================================================================
  // FILTERING METHODS
  // ==========================================================================
  
  /**
   * Apply market filters
   */
  private applyFilters(signal: SignalForFiltering): { passed: boolean; reasons: string[] } {
    const reasons: string[] = []
    
    if (!signal.marketData) {
      return { passed: true, reasons: [] }
    }
    
    const { high, low, close } = signal.marketData
    
    // Regime filter
    if (this.config.useRegimeFilter) {
      const regimeSettings: FilterSettings = this.classifier.getConfig().filterSettings
      if (!regime_filter(close, regimeSettings.regimeThreshold)) {
        reasons.push('Regime filter: Market not trending')
      }
    }
    
    // ADX filter
    if (this.config.useADXFilter) {
      const regimeSettings: FilterSettings = this.classifier.getConfig().filterSettings
      if (!filter_adx(high, low, close, regimeSettings.adxThreshold)) {
        reasons.push(`ADX filter: Trend strength below ${regimeSettings.adxThreshold}`)
      }
    }
    
    // Volatility filter
    if (this.config.useVolatilityFilter) {
      const regimeSettings: FilterSettings = this.classifier.getConfig().filterSettings
      if (!filter_volatility(high, low, close, regimeSettings.volatilityThreshold)) {
        reasons.push(`Volatility filter: Excessive volatility`)
      }
    }
    
    return {
      passed: reasons.length === 0,
      reasons,
    }
  }
  
  /**
   * Calculate ML agreement score
   */
  private calculateMLScore(signal: SignalForFiltering, mlResult: LawrenceResult): number {
    // Perfect agreement = 1, disagreement = 0
    if (signal.direction === 'NEUTRAL') {
      return mlResult.direction === 'NEUTRAL' ? 1.0 : 0.5
    }
    
    if (signal.direction === mlResult.direction) {
      // Agreement - return ML confidence as score
      return 0.5 + (mlResult.confidence * 0.5)
    }
    
    if (mlResult.direction === 'NEUTRAL') {
      // ML is neutral on a directional signal
      return 0.4
    }
    
    // Disagreement
    return 0.2
  }
  
  /**
   * Determine adjusted direction
   */
  private determineAdjustedDirection(
    signal: SignalForFiltering,
    mlResult: LawrenceResult
  ): 'LONG' | 'SHORT' | 'NEUTRAL' {
    // If ML strongly disagrees, adjust to neutral
    if (signal.direction !== 'NEUTRAL' && 
        mlResult.direction !== 'NEUTRAL' &&
        signal.direction !== mlResult.direction &&
        mlResult.confidence > 0.6) {
      return 'NEUTRAL'
    }
    
    // If both agree, keep direction
    return signal.direction
  }
  
  /**
   * Calculate adjusted confidence
   */
  private calculateAdjustedConfidence(
    originalConfidence: number,
    mlConfidence: number,
    mlScore: number
  ): number {
    if (!this.config.adjustConfidence) {
      return originalConfidence
    }
    
    // Blend original and ML confidence based on ML score
    const mlWeight = this.config.confidenceBlendWeight * mlScore
    const originalWeight = 1 - mlWeight
    
    const blended = (originalConfidence * originalWeight) + (mlConfidence * mlWeight)
    
    // Apply ML score as a multiplier
    return blended * (0.7 + mlScore * 0.3)
  }
  
  /**
   * Calculate quality score
   */
  private calculateQualityScore(signal: SignalForFiltering, result: FilteredSignal): number {
    let score = 0
    
    // Component 1: Original confidence (25%)
    score += signal.confidence * 0.25
    
    // Component 2: ML score (25%)
    score += result.mlScore * 0.25
    
    // Component 3: ML confidence (20%)
    score += result.mlResult.confidence * 0.20
    
    // Component 4: Direction alignment (15%)
    const directionAlignment = result.adjustedDirection === signal.direction ? 1 : 0.5
    score += directionAlignment * 0.15
    
    // Component 5: Filter pass rate (15%)
    const filterPassRate = 1 - (result.rejectionReasons.length * 0.2)
    score += Math.max(0, filterPassRate) * 0.15
    
    return Math.min(1, Math.max(0, score))
  }
  
  /**
   * Calculate risk score
   */
  private calculateRiskScore(signal: SignalForFiltering, result: FilteredSignal): number {
    let risk = 0
    
    // Component 1: Low ML agreement increases risk
    risk += (1 - result.mlScore) * 0.3
    
    // Component 2: Low confidence increases risk
    risk += (1 - result.adjustedConfidence) * 0.2
    
    // Component 3: Direction disagreement increases risk
    if (result.adjustedDirection !== signal.direction) {
      risk += 0.2
    }
    
    // Component 4: High volatility increases risk
    if (result.original.context?.volatility === 'HIGH') {
      risk += 0.15
    }
    
    // Component 5: Filter failures increase risk
    risk += result.rejectionReasons.length * 0.05
    
    return Math.min(1, Math.max(0, risk))
  }
  
  /**
   * Make filter decision
   */
  private makeDecision(result: FilteredSignal): { 
    passed: boolean
    recommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
    reasons: string[]
  } {
    const reasons: string[] = []
    
    // Check minimum confidence
    if (result.adjustedConfidence < this.config.minConfidence) {
      reasons.push(`Confidence below minimum: ${result.adjustedConfidence.toFixed(2)} < ${this.config.minConfidence}`)
    }
    
    // Check ML agreement
    if (result.mlScore < this.config.minMLAgreement) {
      reasons.push(`ML agreement below minimum: ${result.mlScore.toFixed(2)} < ${this.config.minMLAgreement}`)
    }
    
    // Check direction confirmation if required
    if (this.config.requireDirectionConfirmation) {
      if (result.original.direction !== 'NEUTRAL' &&
          result.mlResult.direction !== result.original.direction &&
          result.mlResult.confidence > this.config.directionConfirmationThreshold) {
        reasons.push('ML direction confirmation failed')
      }
    }
    
    // Determine recommendation
    let recommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
    
    if (reasons.length === 0 && result.qualityScore >= this.config.highQualityThreshold) {
      recommendation = 'APPROVE'
    } else if (result.qualityScore < this.config.lowQualityThreshold) {
      recommendation = 'REJECT'
    } else if (result.adjustedDirection !== result.original.direction || 
               result.rejectionReasons.length > 0) {
      recommendation = 'ADJUST'
    } else {
      recommendation = 'MONITOR'
    }
    
    return {
      passed: recommendation !== 'REJECT',
      recommendation,
      reasons,
    }
  }
  
  /**
   * Generate adjustment suggestions
   */
  private generateAdjustments(
    signal: SignalForFiltering,
    result: FilteredSignal
  ): FilteredSignal['suggestedAdjustments'] {
    const adjustments: NonNullable<FilteredSignal['suggestedAdjustments']> = {}
    
    // Direction adjustment
    if (result.adjustedDirection !== signal.direction) {
      adjustments.direction = result.adjustedDirection
    }
    
    // Confidence adjustment
    if (result.adjustedConfidence !== signal.confidence) {
      adjustments.confidenceMultiplier = result.adjustedConfidence / signal.confidence
    }
    
    // Stop loss adjustment based on risk
    if (result.riskScore > 0.5) {
      adjustments.additionalStopLossPercent = result.riskScore * 0.5 // Up to 0.5% additional
    }
    
    // Take profit adjustment based on quality
    if (result.qualityScore > 0.7) {
      adjustments.additionalTakeProfitPercent = (result.qualityScore - 0.7) * 0.5
    }
    
    return Object.keys(adjustments).length > 0 ? adjustments : undefined
  }
  
  // ==========================================================================
  // TRAINING METHODS
  // ==========================================================================
  
  /**
   * Queue a signal for training
   */
  private queueForTraining(signal: SignalForFiltering, result: FilteredSignal): void {
    const sample: TrainingSample = {
      features: result.mlResult.features,
      label: signal.direction,
      weight: result.qualityScore,
      timestamp: Date.now(),
    }
    
    this.trainingQueue.push(sample)
    
    // Process queue if it gets large
    if (this.trainingQueue.length >= 10) {
      this.processTrainingQueue()
    }
  }
  
  /**
   * Process queued training samples
   */
  processTrainingQueue(): void {
    if (this.trainingQueue.length === 0) return
    
    this.classifier.trainBatch(this.trainingQueue)
    this.trainingQueue = []
  }
  
  /**
   * Add training sample manually
   */
  addTrainingSample(sample: TrainingSample): void {
    this.classifier.train(sample)
  }
  
  /**
   * Add batch of training samples
   */
  addTrainingSamples(samples: TrainingSample[]): void {
    this.classifier.trainBatch(samples)
  }
  
  // ==========================================================================
  // STATISTICS
  // ==========================================================================
  
  /**
   * Update filter statistics
   */
  private updateStats(result: FilteredSignal): void {
    if (result.passed) {
      this.stats.passedSignals++
    } else {
      this.stats.rejectedSignals++
    }
    
    if (result.adjustedDirection !== result.original.direction ||
        result.adjustedConfidence !== result.original.confidence) {
      this.stats.adjustedSignals++
    }
    
    this.stats.avgOriginalConfidence = 
      (this.stats.avgOriginalConfidence * (this.stats.totalSignals - 1) + 
       result.original.confidence) / this.stats.totalSignals
    
    this.stats.avgFilteredConfidence = 
      (this.stats.avgFilteredConfidence * (this.stats.totalSignals - 1) + 
       result.adjustedConfidence) / this.stats.totalSignals
    
    this.stats.avgMLScore = 
      (this.stats.avgMLScore * (this.stats.totalSignals - 1) + 
       result.mlScore) / this.stats.totalSignals
    
    this.stats.avgQualityScore = 
      (this.stats.avgQualityScore * (this.stats.totalSignals - 1) + 
       result.qualityScore) / this.stats.totalSignals
    
    if (result.passed) {
      if (result.adjustedDirection === 'LONG') this.stats.longApprovals++
      else if (result.adjustedDirection === 'SHORT') this.stats.shortApprovals++
      else this.stats.neutralSignals++
    }
    
    for (const reason of result.rejectionReasons) {
      const key = reason.split(':')[0]
      this.stats.rejectionReasons[key] = (this.stats.rejectionReasons[key] || 0) + 1
    }
  }
  
  /**
   * Get filter statistics
   */
  getStats(): MLFilterStats {
    return { ...this.stats }
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalSignals: 0,
      passedSignals: 0,
      rejectedSignals: 0,
      adjustedSignals: 0,
      avgOriginalConfidence: 0,
      avgFilteredConfidence: 0,
      avgMLScore: 0,
      avgQualityScore: 0,
      longApprovals: 0,
      shortApprovals: 0,
      neutralSignals: 0,
      rejectionReasons: {},
      lastReset: Date.now(),
    }
  }
  
  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================
  
  /**
   * Get configuration
   */
  getConfig(): MLFilterConfig {
    return { ...this.config }
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<MLFilterConfig>): void {
    this.config = { ...this.config, ...config }
  }
  
  /**
   * Get underlying classifier
   */
  getClassifier(): LawrenceClassifier {
    return this.classifier
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let filterInstance: MLSignalFilter | null = null

/**
 * Get ML Signal Filter instance (singleton factory)
 */
export function getMLSignalFilter(config?: Partial<MLFilterConfig>): MLSignalFilter {
  if (!filterInstance) {
    filterInstance = new MLSignalFilter(config)
  } else if (config) {
    filterInstance.setConfig(config)
  }
  return filterInstance
}

/**
 * Reset the singleton instance
 */
export function resetMLSignalFilter(): void {
  filterInstance = null
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export {
  DEFAULT_ML_FILTER_CONFIG as DEFAULT_ML_FILTER_CONFIG,
}

export default MLSignalFilter
