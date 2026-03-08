/**
 * ML Integration for Trading Bots
 * 
 * Provides ML-based signal filtering and confirmation for various bot types:
 * - DCA Bot: Entry timing and exit optimization
 * - BB Bot: Breakout classification and false signal filtering
 * - ORION Bot: Trend confirmation
 * - Zenbot Engine: Signal filtering
 * 
 * Design Decision: NOT integrated with:
 * - GRID Bot: Grid logic is direction-agnostic
 * - HFT Bot: Latency critical, ML adds delay
 * - REED Bot: Uses classical statistical methods
 */

import {
  getMLSignalFilter,
  getLawrenceClassifier,
  type SignalForFiltering,
  type FilteredSignal,
  type MLFilterConfig,
} from './index'
import type { LawrenceFeatures, LawrenceResult } from './lawrence-classifier'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported bot types for ML integration
 */
export type MLIntegratedBotType = 'DCA' | 'BB' | 'ORION' | 'ZENBOT' | 'VISION'

/**
 * ML signal for bot entry
 */
export interface MLBotEntrySignal {
  botType: MLIntegratedBotType
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  mlScore: number
  lawrenceScore: number
  recommendation: 'ENTER' | 'WAIT' | 'AVOID'
  reasons: string[]
  marketRegime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE'
  optimalEntry: boolean
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
}

/**
 * ML signal for bot exit
 */
export interface MLBotExitSignal {
  botType: MLIntegratedBotType
  symbol: string
  positionDirection: 'LONG' | 'SHORT'
  recommendation: 'EXIT_NOW' | 'EXIT_SOON' | 'HOLD' | 'ADD_TO_POSITION'
  confidence: number
  reasons: string[]
  predictedReversal: boolean
  takeProfitOptimization?: {
    currentTP: number
    suggestedTP: number
    reason: string
  }
  stopLossOptimization?: {
    currentSL: number
    suggestedSL: number
    reason: string
  }
}

/**
 * BB-specific ML signal
 */
export interface BBMLSignal extends MLBotEntrySignal {
  breakoutType: 'GENUINE' | 'FALSE' | 'SQUEEZE' | 'UNCERTAIN'
  bandPosition: 'ABOVE_UPPER' | 'AT_UPPER' | 'MIDDLE' | 'AT_LOWER' | 'BELOW_LOWER'
  stochConfirmation: boolean
  volumeConfirmation: boolean
  meanReversionScore: number
}

/**
 * DCA-specific ML signal
 */
export interface DCAMLSignal extends MLBotEntrySignal {
  entryTiming: 'OPTIMAL' | 'GOOD' | 'SUBOPTIMAL' | 'POOR'
  marketPhase: 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MARKDOWN'
  shouldDelayEntry: boolean
  suggestedDelayMinutes?: number
}

/**
 * ORION-specific ML signal
 */
export interface OrionMLSignal extends MLBotEntrySignal {
  trendStrength: number
  trendQuality: 'STRONG' | 'MODERATE' | 'WEAK' | 'NO_TREND'
  emaAlignment: boolean
  supertrendConfirmation: boolean
  pullbackEntry: boolean
}

/**
 * Zenbot-specific ML signal
 */
export interface ZenbotMLSignal extends MLBotEntrySignal {
  strategyConfirmation: boolean
  signalQuality: 'HIGH' | 'MEDIUM' | 'LOW'
  filterPassed: boolean
  adjustedConfidence: number
}

/**
 * ML integration configuration for bots
 */
export interface MLBotIntegrationConfig {
  enabled: boolean
  minConfidence: number
  minMLScore: number
  requireLawrenceConfirmation: boolean
  lawrenceWeight: number
  mlWeight: number
  filterMode: 'STRICT' | 'MODERATE' | 'LENIENT'
}

/**
 * Default configurations per bot type
 */
export const DEFAULT_ML_BOT_CONFIGS: Record<MLIntegratedBotType, MLBotIntegrationConfig> = {
  DCA: {
    enabled: true,
    minConfidence: 0.5,
    minMLScore: 0.4,
    requireLawrenceConfirmation: false,
    lawrenceWeight: 0.3,
    mlWeight: 0.7,
    filterMode: 'MODERATE',
  },
  BB: {
    enabled: true,
    minConfidence: 0.6,
    minMLScore: 0.5,
    requireLawrenceConfirmation: true,
    lawrenceWeight: 0.4,
    mlWeight: 0.6,
    filterMode: 'STRICT',
  },
  ORION: {
    enabled: true,
    minConfidence: 0.55,
    minMLScore: 0.45,
    requireLawrenceConfirmation: true,
    lawrenceWeight: 0.35,
    mlWeight: 0.65,
    filterMode: 'MODERATE',
  },
  ZENBOT: {
    enabled: true,
    minConfidence: 0.5,
    minMLScore: 0.4,
    requireLawrenceConfirmation: false,
    lawrenceWeight: 0.25,
    mlWeight: 0.75,
    filterMode: 'LENIENT',
  },
  VISION: {
    enabled: true,
    minConfidence: 0.6,
    minMLScore: 0.5,
    requireLawrenceConfirmation: true,
    lawrenceWeight: 0.4,
    mlWeight: 0.6,
    filterMode: 'STRICT',
  },
}

// ============================================================================
// ML BOT INTEGRATION SERVICE
// ============================================================================

/**
 * ML Integration Service for Trading Bots
 * 
 * Provides unified ML signal analysis for multiple bot types
 */
export class MLBotIntegrationService {
  private mlFilter = getMLSignalFilter()
  private classifier = getLawrenceClassifier()
  private configs: Map<MLIntegratedBotType, MLBotIntegrationConfig> = new Map()
  private stats: Map<MLIntegratedBotType, {
    totalSignals: number
    approvedSignals: number
    rejectedSignals: number
    avgMLScore: number
    avgLawrenceScore: number
  }> = new Map()

  constructor() {
    // Initialize with default configs
    for (const [botType, config] of Object.entries(DEFAULT_ML_BOT_CONFIGS)) {
      this.configs.set(botType as MLIntegratedBotType, config)
      this.stats.set(botType as MLIntegratedBotType, {
        totalSignals: 0,
        approvedSignals: 0,
        rejectedSignals: 0,
        avgMLScore: 0,
        avgLawrenceScore: 0,
      })
    }
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Update configuration for a bot type
   */
  setConfig(botType: MLIntegratedBotType, config: Partial<MLBotIntegrationConfig>): void {
    const current = this.configs.get(botType) || DEFAULT_ML_BOT_CONFIGS[botType]
    this.configs.set(botType, { ...current, ...config })
  }

  /**
   * Get configuration for a bot type
   */
  getConfig(botType: MLIntegratedBotType): MLBotIntegrationConfig {
    return this.configs.get(botType) || DEFAULT_ML_BOT_CONFIGS[botType]
  }

  /**
   * Enable/disable ML for a bot type
   */
  setEnabled(botType: MLIntegratedBotType, enabled: boolean): void {
    const config = this.configs.get(botType)
    if (config) {
      config.enabled = enabled
    }
  }

  // ==========================================================================
  // GENERIC SIGNAL ANALYSIS
  // ==========================================================================

  /**
   * Analyze a signal for any bot type
   */
  async analyzeSignal(
    botType: MLIntegratedBotType,
    signal: SignalForFiltering
  ): Promise<MLBotEntrySignal> {
    const config = this.getConfig(botType)

    if (!config.enabled) {
      return this.createDisabledSignal(botType, signal)
    }

    // Get ML filter result
    const filtered = await this.mlFilter.filter(signal)

    // Get Lawrence classifier result
    const lawrenceFeatures = this.signalToLawrenceFeatures(signal)
    const lawrenceResult = this.classifier.classify(lawrenceFeatures)

    // Calculate combined score
    const mlScore = filtered.mlScore
    const lawrenceScore = this.lawrenceResultToScore(lawrenceResult)
    const combinedScore = mlScore * config.mlWeight + lawrenceScore * config.lawrenceWeight

    // Determine recommendation
    const recommendation = this.determineRecommendation(
      combinedScore,
      config,
      lawrenceResult,
      config.requireLawrenceConfirmation
    )

    // Determine market regime
    const marketRegime = this.determineMarketRegime(lawrenceFeatures)

    // Build result
    const result: MLBotEntrySignal = {
      botType,
      symbol: signal.symbol,
      exchange: signal.exchange,
      direction: filtered.adjustedDirection,
      confidence: combinedScore,
      mlScore,
      lawrenceScore,
      recommendation,
      reasons: this.buildReasons(filtered, lawrenceResult, recommendation),
      marketRegime,
      optimalEntry: combinedScore >= 0.7 && lawrenceResult.confidence >= 0.6,
      riskLevel: this.determineRiskLevel(combinedScore, lawrenceFeatures),
    }

    // Update stats
    this.updateStats(botType, result)

    return result
  }

  // ==========================================================================
  // BOT-SPECIFIC ANALYSIS
  // ==========================================================================

  /**
   * Analyze DCA entry signal
   */
  async analyzeDCAEntry(
    signal: SignalForFiltering,
    currentPrice: number,
    historicalPrices?: number[]
  ): Promise<DCAMLSignal> {
    const baseResult = await this.analyzeSignal('DCA', signal)
    
    // Determine entry timing
    const entryTiming = this.determineEntryTiming(baseResult, currentPrice, historicalPrices)
    
    // Determine market phase
    const marketPhase = this.determineMarketPhase(baseResult, historicalPrices)
    
    // Check if entry should be delayed
    const shouldDelayEntry = entryTiming === 'POOR' || entryTiming === 'SUBOPTIMAL'
    const suggestedDelayMinutes = shouldDelayEntry ? this.suggestDelay(entryTiming) : undefined

    return {
      ...baseResult,
      entryTiming,
      marketPhase,
      shouldDelayEntry,
      suggestedDelayMinutes,
    }
  }

  /**
   * Analyze BB (Bollinger Band) signal
   */
  async analyzeBBSignal(
    signal: SignalForFiltering,
    bbData: {
      upperBand: number
      middleBand: number
      lowerBand: number
      currentPrice: number
      stochK: number
      stochD: number
      volumeRatio: number
    }
  ): Promise<BBMLSignal> {
    const baseResult = await this.analyzeSignal('BB', signal)
    
    // Determine band position
    const bandPosition = this.determineBandPosition(bbData)
    
    // Classify breakout type
    const breakoutType = this.classifyBreakout(
      baseResult,
      bbData,
      bandPosition
    )
    
    // Check confirmations
    const stochConfirmation = this.checkStochConfirmation(bbData, signal.direction)
    const volumeConfirmation = bbData.volumeRatio >= 1.2
    
    // Calculate mean reversion score
    const meanReversionScore = this.calculateMeanReversionScore(bbData, baseResult)

    return {
      ...baseResult,
      breakoutType,
      bandPosition,
      stochConfirmation,
      volumeConfirmation,
      meanReversionScore,
    }
  }

  /**
   * Analyze ORION trend signal
   */
  async analyzeOrionSignal(
    signal: SignalForFiltering,
    trendData: {
      ema20: number
      ema50: number
      ema200: number
      supertrend: number
      supertrendDirection: 'UP' | 'DOWN'
      currentPrice: number
    }
  ): Promise<OrionMLSignal> {
    const baseResult = await this.analyzeSignal('ORION', signal)
    
    // Check EMA alignment
    const emaAlignment = this.checkEMAAlignment(trendData, signal.direction)
    
    // Check Supertrend confirmation
    const supertrendConfirmation = this.checkSupertrendConfirmation(trendData, signal.direction)
    
    // Calculate trend strength
    const trendStrength = this.calculateTrendStrength(trendData)
    
    // Determine trend quality
    const trendQuality = this.determineTrendQuality(trendStrength, emaAlignment, supertrendConfirmation)
    
    // Check for pullback entry
    const pullbackEntry = this.checkPullbackEntry(trendData, signal.direction)

    return {
      ...baseResult,
      trendStrength,
      trendQuality,
      emaAlignment,
      supertrendConfirmation,
      pullbackEntry,
    }
  }

  /**
   * Analyze Zenbot strategy signal
   */
  async analyzeZenbotSignal(
    signal: SignalForFiltering,
    strategyConfidence: number
  ): Promise<ZenbotMLSignal> {
    const baseResult = await this.analyzeSignal('ZENBOT', signal)
    
    // Check if ML confirms strategy
    const strategyConfirmation = baseResult.confidence >= 0.5 && 
      baseResult.direction === signal.direction
    
    // Determine signal quality
    const signalQuality = this.determineSignalQuality(baseResult, strategyConfidence)
    
    // Check if passed filter
    const filterPassed = baseResult.recommendation === 'ENTER'
    
    // Adjust confidence based on ML and strategy alignment
    const adjustedConfidence = strategyConfirmation
      ? (baseResult.confidence + strategyConfidence) / 2
      : baseResult.confidence * 0.7

    return {
      ...baseResult,
      strategyConfirmation,
      signalQuality,
      filterPassed,
      adjustedConfidence,
    }
  }

  // ==========================================================================
  // EXIT ANALYSIS
  // ==========================================================================

  /**
   * Analyze exit signal for a position
   */
  async analyzeExit(
    botType: MLIntegratedBotType,
    signal: SignalForFiltering,
    positionData: {
      entryPrice: number
      currentPrice: number
      direction: 'LONG' | 'SHORT'
      unrealizedPnl: number
      unrealizedPnlPercent: number
      holdingTimeMinutes: number
      takeProfit?: number
      stopLoss?: number
    }
  ): Promise<MLBotExitSignal> {
    const config = this.getConfig(botType)

    if (!config.enabled) {
      return {
        botType,
        symbol: signal.symbol,
        positionDirection: positionData.direction,
        recommendation: 'HOLD',
        confidence: 0.5,
        reasons: ['ML integration disabled'],
        predictedReversal: false,
      }
    }

    // Get ML analysis
    const filtered = await this.mlFilter.filter(signal)
    const lawrenceFeatures = this.signalToLawrenceFeatures(signal)
    const lawrenceResult = this.classifier.classify(lawrenceFeatures)

    // Check for reversal prediction
    const predictedReversal = this.predictReversal(
      filtered,
      lawrenceResult,
      positionData
    )

    // Determine recommendation
    const recommendation = this.determineExitRecommendation(
      filtered,
      lawrenceResult,
      positionData,
      predictedReversal
    )

    // Build reasons
    const reasons = this.buildExitReasons(
      filtered,
      lawrenceResult,
      positionData,
      recommendation
    )

    // Optimize TP/SL if holding
    let takeProfitOptimization: MLBotExitSignal['takeProfitOptimization']
    let stopLossOptimization: MLBotExitSignal['stopLossOptimization']

    if (recommendation === 'HOLD' || recommendation === 'ADD_TO_POSITION') {
      const optimizations = this.optimizeTPSL(positionData, filtered, lawrenceResult)
      takeProfitOptimization = optimizations.tp
      stopLossOptimization = optimizations.sl
    }

    return {
      botType,
      symbol: signal.symbol,
      positionDirection: positionData.direction,
      recommendation,
      confidence: filtered.mlScore,
      reasons,
      predictedReversal,
      takeProfitOptimization,
      stopLossOptimization,
    }
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get statistics for a bot type
   */
  getStats(botType: MLIntegratedBotType) {
    return this.stats.get(botType)
  }

  /**
   * Get all statistics
   */
  getAllStats() {
    const result: Record<string, ReturnType<typeof this.getStats>> = {}
    for (const [botType, stats] of this.stats) {
      result[botType] = stats
    }
    return result
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createDisabledSignal(
    botType: MLIntegratedBotType,
    signal: SignalForFiltering
  ): MLBotEntrySignal {
    return {
      botType,
      symbol: signal.symbol,
      exchange: signal.exchange,
      direction: signal.direction,
      confidence: 0.5,
      mlScore: 0.5,
      lawrenceScore: 0.5,
      recommendation: 'ENTER',
      reasons: ['ML integration disabled - using raw signal'],
      marketRegime: 'RANGING',
      optimalEntry: false,
      riskLevel: 'MEDIUM',
    }
  }

  private signalToLawrenceFeatures(signal: SignalForFiltering): LawrenceFeatures {
    const indicators = signal.indicators || {}
    const context = signal.context || {}
    const now = new Date()

    return {
      indicators: {
        rsi: indicators.rsi || 50,
        macd: indicators.macd || 0,
        ema20: indicators.ema20 || signal.entryPrice || 0,
        ema50: indicators.ema50 || signal.entryPrice || 0,
        atr: indicators.atr || 0,
        volumeRatio: indicators.volumeRatio || 1,
      },
      context: {
        trend: context.trend || 'RANGING',
        volatility: context.volatility || 'MEDIUM',
        volume: context.volume || 'MEDIUM',
      },
      signal: {
        direction: signal.direction,
        symbol: signal.symbol,
        timeframe: signal.timeframe || '1h',
        entryPrice: signal.entryPrice || 0,
      },
      time: {
        hour: now.getUTCHours(),
        dayOfWeek: now.getUTCDay(),
        isSessionOverlap: this.isSessionOverlap(now),
      },
    }
  }

  private lawrenceResultToScore(result: LawrenceResult): number {
    if (result.direction === 'NEUTRAL') {
      return 0.3
    }
    return result.probability * result.confidence
  }

  private determineRecommendation(
    score: number,
    config: MLBotIntegrationConfig,
    lawrenceResult: LawrenceResult,
    requireLawrence: boolean
  ): 'ENTER' | 'WAIT' | 'AVOID' {
    // If Lawrence confirmation required and not confirmed
    if (requireLawrence && lawrenceResult.confidence < 0.5) {
      return 'AVOID'
    }

    // Check against thresholds based on filter mode
    switch (config.filterMode) {
      case 'STRICT':
        if (score >= 0.7) return 'ENTER'
        if (score >= 0.5) return 'WAIT'
        return 'AVOID'

      case 'MODERATE':
        if (score >= 0.6) return 'ENTER'
        if (score >= 0.4) return 'WAIT'
        return 'AVOID'

      case 'LENIENT':
        if (score >= 0.5) return 'ENTER'
        if (score >= 0.3) return 'WAIT'
        return 'AVOID'

      default:
        return 'WAIT'
    }
  }

  private determineMarketRegime(features: LawrenceFeatures): MLBotEntrySignal['marketRegime'] {
    const { trend, volatility } = features.context

    if (volatility === 'HIGH') {
      return 'VOLATILE'
    }

    switch (trend) {
      case 'TRENDING_UP':
        return 'TRENDING_UP'
      case 'TRENDING_DOWN':
        return 'TRENDING_DOWN'
      default:
        return 'RANGING'
    }
  }

  private determineRiskLevel(
    score: number,
    features: LawrenceFeatures
  ): MLBotEntrySignal['riskLevel'] {
    if (score >= 0.7 && features.context.volatility !== 'HIGH') {
      return 'LOW'
    }

    if (score < 0.4 || features.context.volatility === 'HIGH') {
      return 'HIGH'
    }

    return 'MEDIUM'
  }

  private buildReasons(
    filtered: FilteredSignal,
    lawrence: LawrenceResult,
    recommendation: string
  ): string[] {
    const reasons: string[] = []

    reasons.push(`ML Score: ${(filtered.mlScore * 100).toFixed(1)}%`)
    reasons.push(`Lawrence: ${lawrence.direction} (${(lawrence.confidence * 100).toFixed(1)}%)`)
    reasons.push(`Recommendation: ${recommendation}`)

    if (filtered.passed) {
      reasons.push('Signal passed ML filter')
    } else {
      reasons.push('Signal rejected by ML filter')
    }

    return reasons
  }

  private updateStats(botType: MLIntegratedBotType, signal: MLBotEntrySignal): void {
    const stats = this.stats.get(botType)
    if (!stats) return

    const n = stats.totalSignals + 1
    stats.totalSignals = n
    stats.avgMLScore = stats.avgMLScore + (signal.mlScore - stats.avgMLScore) / n
    stats.avgLawrenceScore = stats.avgLawrenceScore + (signal.lawrenceScore - stats.avgLawrenceScore) / n

    if (signal.recommendation === 'ENTER') {
      stats.approvedSignals++
    } else if (signal.recommendation === 'AVOID') {
      stats.rejectedSignals++
    }
  }

  // DCA-specific helpers
  private determineEntryTiming(
    result: MLBotEntrySignal,
    currentPrice: number,
    historicalPrices?: number[]
  ): 'OPTIMAL' | 'GOOD' | 'SUBOPTIMAL' | 'POOR' {
    if (result.confidence >= 0.7 && result.optimalEntry) {
      return 'OPTIMAL'
    }

    if (historicalPrices && historicalPrices.length > 0) {
      const avg = historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length
      const priceVsAvg = (currentPrice - avg) / avg

      // Good entry if price is below average (for long)
      if (result.direction === 'LONG' && priceVsAvg < -0.02) {
        return 'GOOD'
      }
      if (result.direction === 'SHORT' && priceVsAvg > 0.02) {
        return 'GOOD'
      }
    }

    if (result.confidence >= 0.5) {
      return 'SUBOPTIMAL'
    }

    return 'POOR'
  }

  private determineMarketPhase(
    result: MLBotEntrySignal,
    historicalPrices?: number[]
  ): 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MARKDOWN' {
    switch (result.marketRegime) {
      case 'TRENDING_UP':
        return 'MARKUP'
      case 'TRENDING_DOWN':
        return 'MARKDOWN'
      default:
        // Use volume and other factors
        if (result.confidence >= 0.5) {
          return 'ACCUMULATION'
        }
        return 'DISTRIBUTION'
    }
  }

  private suggestDelay(timing: 'SUBOPTIMAL' | 'POOR'): number {
    return timing === 'POOR' ? 60 : 15 // minutes
  }

  // BB-specific helpers
  private determineBandPosition(bbData: {
    upperBand: number
    middleBand: number
    lowerBand: number
    currentPrice: number
  }): BBMLSignal['bandPosition'] {
    const { upperBand, middleBand, lowerBand, currentPrice } = bbData
    const upperRange = upperBand - middleBand
    const lowerRange = middleBand - lowerBand

    if (currentPrice > upperBand) return 'ABOVE_UPPER'
    if (currentPrice >= upperBand - upperRange * 0.2) return 'AT_UPPER'
    if (currentPrice <= lowerBand + lowerRange * 0.2) return 'AT_LOWER'
    if (currentPrice < lowerBand) return 'BELOW_LOWER'
    return 'MIDDLE'
  }

  private classifyBreakout(
    result: MLBotEntrySignal,
    bbData: {
      upperBand: number
      middleBand: number
      lowerBand: number
      currentPrice: number
      stochK: number
      volumeRatio: number
    },
    bandPosition: BBMLSignal['bandPosition']
  ): BBMLSignal['breakoutType'] {
    // High ML score with volume = genuine breakout
    if (result.mlScore >= 0.7 && bbData.volumeRatio >= 1.5) {
      return 'GENUINE'
    }

    // Low ML score without volume = false breakout
    if (result.mlScore < 0.4 || bbData.volumeRatio < 0.8) {
      return 'FALSE'
    }

    // Squeeze detection (narrow bands)
    const bandwidth = (bbData.upperBand - bbData.lowerBand) / bbData.middleBand
    if (bandwidth < 0.02) {
      return 'SQUEEZE'
    }

    return 'UNCERTAIN'
  }

  private checkStochConfirmation(
    bbData: { stochK: number; stochD: number },
    direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  ): boolean {
    if (direction === 'LONG') {
      return bbData.stochK < 20 && bbData.stochK > bbData.stochD
    }
    if (direction === 'SHORT') {
      return bbData.stochK > 80 && bbData.stochK < bbData.stochD
    }
    return false
  }

  private calculateMeanReversionScore(
    bbData: {
      upperBand: number
      middleBand: number
      lowerBand: number
      currentPrice: number
    },
    result: MLBotEntrySignal
  ): number {
    // Higher score when price is at extremes and ML confirms reversal
    const { upperBand, lowerBand, middleBand, currentPrice } = bbData
    const range = upperBand - lowerBand

    let distanceScore = 0
    if (currentPrice >= upperBand) {
      distanceScore = 1
    } else if (currentPrice <= lowerBand) {
      distanceScore = 1
    } else {
      const distanceFromMiddle = Math.abs(currentPrice - middleBand)
      distanceScore = distanceFromMiddle / (range / 2)
    }

    return distanceScore * result.confidence
  }

  // ORION-specific helpers
  private checkEMAAlignment(
    trendData: {
      ema20: number
      ema50: number
      ema200: number
      currentPrice: number
    },
    direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  ): boolean {
    const { ema20, ema50, ema200, currentPrice } = trendData

    if (direction === 'LONG') {
      return currentPrice > ema20 && ema20 > ema50 && ema50 > ema200
    }
    if (direction === 'SHORT') {
      return currentPrice < ema20 && ema20 < ema50 && ema50 < ema200
    }
    return false
  }

  private checkSupertrendConfirmation(
    trendData: { supertrend: number; supertrendDirection: 'UP' | 'DOWN'; currentPrice: number },
    direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  ): boolean {
    if (direction === 'LONG') {
      return trendData.supertrendDirection === 'UP' && trendData.currentPrice > trendData.supertrend
    }
    if (direction === 'SHORT') {
      return trendData.supertrendDirection === 'DOWN' && trendData.currentPrice < trendData.supertrend
    }
    return false
  }

  private calculateTrendStrength(trendData: {
    ema20: number
    ema50: number
    ema200: number
    currentPrice: number
  }): number {
    const { ema20, ema50, ema200, currentPrice } = trendData

    // Calculate distances
    const priceVsEma20 = (currentPrice - ema20) / ema20
    const ema20Vs50 = (ema20 - ema50) / ema50
    const ema50Vs200 = (ema50 - ema200) / ema200

    // Combine into strength score
    const strength = Math.abs(priceVsEma20) + Math.abs(ema20Vs50) + Math.abs(ema50Vs200)
    return Math.min(1, strength * 5) // Normalize to 0-1
  }

  private determineTrendQuality(
    strength: number,
    emaAlignment: boolean,
    supertrendConfirmation: boolean
  ): OrionMLSignal['trendQuality'] {
    if (strength >= 0.6 && emaAlignment && supertrendConfirmation) {
      return 'STRONG'
    }
    if (strength >= 0.4 && (emaAlignment || supertrendConfirmation)) {
      return 'MODERATE'
    }
    if (strength >= 0.2) {
      return 'WEAK'
    }
    return 'NO_TREND'
  }

  private checkPullbackEntry(
    trendData: {
      ema20: number
      ema50: number
      currentPrice: number
    },
    direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  ): boolean {
    const { ema20, ema50, currentPrice } = trendData

    if (direction === 'LONG') {
      // Price pulled back to between EMA20 and EMA50
      return currentPrice < ema20 && currentPrice > ema50
    }
    if (direction === 'SHORT') {
      return currentPrice > ema20 && currentPrice < ema50
    }
    return false
  }

  // Zenbot-specific helpers
  private determineSignalQuality(
    result: MLBotEntrySignal,
    strategyConfidence: number
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    const combined = (result.confidence + strategyConfidence) / 2

    if (combined >= 0.7) return 'HIGH'
    if (combined >= 0.5) return 'MEDIUM'
    return 'LOW'
  }

  // Exit analysis helpers
  private predictReversal(
    filtered: FilteredSignal,
    lawrence: LawrenceResult,
    positionData: {
      direction: 'LONG' | 'SHORT'
      unrealizedPnlPercent: number
      holdingTimeMinutes: number
    }
  ): boolean {
    // Reversal if Lawrence shows opposite direction with confidence
    const oppositeDirection = positionData.direction === 'LONG' ? 'SHORT' : 'LONG'
    if (lawrence.direction === oppositeDirection && lawrence.confidence >= 0.6) {
      return true
    }

    // Reversal if ML score dropped significantly
    if (filtered.mlScore < 0.3 && positionData.unrealizedPnlPercent > 2) {
      return true
    }

    return false
  }

  private determineExitRecommendation(
    filtered: FilteredSignal,
    lawrence: LawrenceResult,
    positionData: {
      unrealizedPnl: number
      unrealizedPnlPercent: number
      holdingTimeMinutes: number
    },
    predictedReversal: boolean
  ): MLBotExitSignal['recommendation'] {
    // Exit now if reversal predicted with profit
    if (predictedReversal && positionData.unrealizedPnlPercent > 0) {
      return 'EXIT_NOW'
    }

    // Exit soon if ML score dropped
    if (filtered.mlScore < 0.3) {
      return 'EXIT_SOON'
    }

    // Add to position if ML is confident and we have profit
    if (filtered.mlScore >= 0.7 && positionData.unrealizedPnlPercent > 2) {
      return 'ADD_TO_POSITION'
    }

    return 'HOLD'
  }

  private buildExitReasons(
    filtered: FilteredSignal,
    lawrence: LawrenceResult,
    positionData: {
      unrealizedPnl: number
      unrealizedPnlPercent: number
    },
    recommendation: string
  ): string[] {
    const reasons: string[] = []

    reasons.push(`Current PnL: ${positionData.unrealizedPnlPercent.toFixed(2)}%`)
    reasons.push(`ML Score: ${(filtered.mlScore * 100).toFixed(1)}%`)
    reasons.push(`Lawrence: ${lawrence.direction} (${(lawrence.confidence * 100).toFixed(1)}%)`)
    reasons.push(`Recommendation: ${recommendation}`)

    return reasons
  }

  private optimizeTPSL(
    positionData: {
      entryPrice: number
      currentPrice: number
      direction: 'LONG' | 'SHORT'
      takeProfit?: number
      stopLoss?: number
    },
    filtered: FilteredSignal,
    lawrence: LawrenceResult
  ): {
    tp?: MLBotExitSignal['takeProfitOptimization']
    sl?: MLBotExitSignal['stopLossOptimization']
  } {
    const result: { tp?: MLBotExitSignal['takeProfitOptimization']; sl?: MLBotExitSignal['stopLossOptimization'] } = {}

    // Optimize TP if ML is confident
    if (filtered.mlScore >= 0.6 && positionData.takeProfit) {
      const currentDistance = Math.abs(positionData.takeProfit - positionData.currentPrice)
      const suggestedTP = lawrence.confidence >= 0.7
        ? positionData.takeProfit * 1.1 // Extend TP
        : positionData.takeProfit * 0.95 // Tighten TP

      result.tp = {
        currentTP: positionData.takeProfit,
        suggestedTP,
        reason: lawrence.confidence >= 0.7
          ? 'High ML confidence, extending take profit'
          : 'Lower ML confidence, tightening take profit',
      }
    }

    // Optimize SL if needed
    if (positionData.stopLoss) {
      const riskDistance = Math.abs(positionData.currentPrice - positionData.stopLoss)
      const suggestedSL = filtered.mlScore >= 0.5
        ? positionData.stopLoss * (positionData.direction === 'LONG' ? 1.02 : 0.98) // Tighten SL
        : positionData.stopLoss

      result.sl = {
        currentSL: positionData.stopLoss,
        suggestedSL,
        reason: filtered.mlScore >= 0.5
          ? 'Good ML score, tightening stop loss to protect profits'
          : 'Keeping current stop loss',
      }
    }

    return result
  }

  private isSessionOverlap(date: Date): boolean {
    const hour = date.getUTCHours()
    // London-NY overlap: 13:00 - 17:00 UTC
    const isLondonNYOverlap = hour >= 13 && hour < 17
    // Tokyo-London overlap: 08:00 - 09:00 UTC
    const isTokyoLondonOverlap = hour >= 8 && hour < 9
    return isLondonNYOverlap || isTokyoLondonOverlap
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let mlBotIntegrationInstance: MLBotIntegrationService | null = null

/**
 * Get ML Bot Integration Service instance
 */
export function getMLBotIntegration(): MLBotIntegrationService {
  if (!mlBotIntegrationInstance) {
    mlBotIntegrationInstance = new MLBotIntegrationService()
  }
  return mlBotIntegrationInstance
}

/**
 * Reset the singleton instance
 */
export function resetMLBotIntegration(): void {
  mlBotIntegrationInstance = null
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  DEFAULT_ML_BOT_CONFIGS,
}
