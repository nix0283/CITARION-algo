/**
 * LOGOS ML Integration
 * 
 * Extends LOGOS Engine with ML-based signal filtering and quality enhancement.
 * Integrates Lawrence Classifier into the signal aggregation pipeline.
 * 
 * Pipeline: Bot Signal → ML Filter → Enhanced Aggregation → Quality Scored Output
 */

import {
  LOGOSEngine,
  LOGOS_BOT_METADATA,
  type IncomingSignal,
  type AggregatedSignal,
  type SignalContribution,
  type AggregationConfig,
  DEFAULT_AGGREGATION_CONFIG,
} from './engine'

import {
  getMLSignalFilter,
  type SignalForFiltering,
  type FilteredSignal,
  type MLFilterConfig,
  DEFAULT_ML_FILTER_CONFIG,
} from '../ml/ml-signal-filter'

import { getEventBus } from '../orchestration'

// ============================================================================
// TYPES
// ============================================================================

/**
 * ML-Enhanced aggregated signal
 */
export interface MLAggregatedSignal extends AggregatedSignal {
  // ML enhancement data
  ml: {
    // Overall ML score for the aggregated signal
    overallMLScore: number
    
    // ML-enhanced confidence
    mlEnhancedConfidence: number
    
    // Individual ML scores per contribution
    mlScores: Array<{
      botCode: string
      mlScore: number
      passedFilter: boolean
    }>
    
    // Filter statistics
    filterStats: {
      totalProcessed: number
      passedFilter: number
      rejectedFilter: number
    }
    
    // Quality assessment
    qualityAssessment: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'REJECTED'
    
    // ML recommendation
    mlRecommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
  }
}

/**
 * ML Integration configuration
 */
export interface MLIntegrationConfig {
  // Enable ML filtering
  enabled: boolean
  
  // ML filter configuration
  filterConfig: Partial<MLFilterConfig>
  
  // Minimum ML score to include signal in aggregation
  minMLScoreToInclude: number
  
  // Weight boost for high ML score signals
  highMLScoreBoost: number
  
  // Weight penalty for low ML score signals
  lowMLScorePenalty: number
  
  // Require minimum ML filtered signals
  minMLFilteredSignals: number
  
  // Adjust final confidence with ML
  adjustFinalConfidence: boolean
  finalConfidenceMLWeight: number
}

/**
 * Default ML Integration configuration
 */
export const DEFAULT_ML_INTEGRATION_CONFIG: MLIntegrationConfig = {
  enabled: true,
  filterConfig: {},
  minMLScoreToInclude: 0.3,
  highMLScoreBoost: 0.2,
  lowMLScorePenalty: 0.3,
  minMLFilteredSignals: 1,
  adjustFinalConfidence: true,
  finalConfidenceMLWeight: 0.25,
}

// ============================================================================
// ML ENHANCED LOGOS ENGINE
// ============================================================================

/**
 * ML-Enhanced LOGOS Engine
 * 
 * Extends the base LOGOS Engine with ML-based signal filtering
 */
export class MLEnhancedLOGOSEngine {
  private baseEngine: LOGOSEngine
  private mlFilter = getMLSignalFilter()
  private config: MLIntegrationConfig & { aggregationConfig: AggregationConfig }
  private filteredSignalsCache: Map<string, FilteredSignal[]> = new Map()
  private eventBus = getEventBus()
  private status: 'idle' | 'running' | 'paused' = 'idle'
  
  constructor(
    aggregationConfig: Partial<AggregationConfig> = {},
    mlConfig: Partial<MLIntegrationConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_ML_INTEGRATION_CONFIG,
      ...mlConfig,
      aggregationConfig: {
        ...DEFAULT_AGGREGATION_CONFIG,
        ...aggregationConfig,
      },
    }
    
    this.baseEngine = new LOGOSEngine(this.config.aggregationConfig)
  }
  
  // ==========================================================================
  // START/STOP
  // ==========================================================================
  
  /**
   * Start the ML-enhanced LOGOS engine
   */
  async start(): Promise<void> {
    if (this.status === 'running') return
    
    await this.baseEngine.start()
    this.status = 'running'
    
    console.log('[LOGOS-ML] Engine started with ML enhancement enabled')
  }
  
  /**
   * Stop the engine
   */
  async stop(): Promise<void> {
    await this.baseEngine.stop()
    this.status = 'idle'
    this.filteredSignalsCache.clear()
    
    console.log('[LOGOS-ML] Engine stopped')
  }
  
  // ==========================================================================
  // SIGNAL PROCESSING
  // ==========================================================================
  
  /**
   * Filter a signal through ML pipeline
   */
  async filterSignal(signal: IncomingSignal): Promise<FilteredSignal> {
    // Convert to filter format
    const signalForFiltering: SignalForFiltering = {
      botCode: signal.botCode,
      symbol: signal.symbol,
      exchange: signal.exchange,
      direction: signal.direction,
      confidence: signal.confidence,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      marketData: signal.metadata?.marketData as SignalForFiltering['marketData'],
      indicators: signal.metadata?.indicators as SignalForFiltering['indicators'],
      context: signal.metadata?.context as SignalForFiltering['context'],
      metadata: signal.metadata,
    }
    
    return this.mlFilter.filter(signalForFiltering)
  }
  
  /**
   * Process and aggregate signals with ML enhancement
   */
  async processSignals(
    signals: IncomingSignal[],
    symbol: string,
    exchange: string
  ): Promise<MLAggregatedSignal | null> {
    if (!this.config.enabled) {
      // Fall back to base aggregation
      const baseResult = await this.getBaseAggregation(symbol, exchange)
      if (!baseResult) return null
      return this.wrapAsMLSignal(baseResult)
    }
    
    // Step 1: Filter all signals through ML
    const filteredSignals: FilteredSignal[] = []
    const mlScores: Array<{ botCode: string; mlScore: number; passedFilter: boolean }> = []
    
    for (const signal of signals) {
      const filtered = await this.filterSignal(signal)
      filteredSignals.push(filtered)
      
      mlScores.push({
        botCode: signal.botCode,
        mlScore: filtered.mlScore,
        passedFilter: filtered.passed,
      })
    }
    
    // Step 2: Filter signals by ML score
    const qualifiedSignals = filteredSignals.filter(
      fs => fs.passed && fs.mlScore >= this.config.minMLScoreToInclude
    )
    
    // Check minimum signals
    if (qualifiedSignals.length < this.config.minMLFilteredSignals) {
      console.log(`[LOGOS-ML] Insufficient qualified signals: ${qualifiedSignals.length} < ${this.config.minMLFilteredSignals}`)
      return null
    }
    
    // Step 3: Calculate ML-weighted aggregation
    const aggregation = this.aggregateWithMLWeighting(qualifiedSignals, symbol, exchange)
    
    if (!aggregation) return null
    
    // Step 4: Enhance with ML data
    const mlEnhanced = this.enhanceWithML(aggregation, filteredSignals, mlScores)
    
    return mlEnhanced
  }
  
  /**
   * Aggregate signals with ML-based weighting
   */
  private aggregateWithMLWeighting(
    filteredSignals: FilteredSignal[],
    symbol: string,
    exchange: string
  ): AggregatedSignal | null {
    // Calculate weighted scores with ML enhancement
    let longScore = 0
    let shortScore = 0
    let totalWeight = 0
    
    const contributions: SignalContribution[] = []
    const uniqueBots = new Set<string>()
    
    for (const fs of filteredSignals) {
      if (uniqueBots.has(fs.original.botCode)) continue
      uniqueBots.add(fs.original.botCode)
      
      // Calculate weight with ML enhancement
      let weight = fs.adjustedConfidence
      
      // Apply ML score boost/penalty
      if (fs.mlScore > 0.7) {
        weight *= (1 + this.config.highMLScoreBoost)
      } else if (fs.mlScore < 0.4) {
        weight *= (1 - this.config.lowMLScorePenalty)
      }
      
      totalWeight += weight
      
      const contribution: SignalContribution = {
        botCode: fs.original.botCode,
        direction: fs.adjustedDirection,
        confidence: fs.adjustedConfidence,
        weight,
        adjustedConfidence: fs.adjustedConfidence * weight,
        performanceScore: fs.qualityScore,
      }
      
      contributions.push(contribution)
      
      if (fs.adjustedDirection === 'LONG') {
        longScore += contribution.adjustedConfidence
      } else if (fs.adjustedDirection === 'SHORT') {
        shortScore += contribution.adjustedConfidence
      }
    }
    
    if (uniqueBots.size < this.config.aggregationConfig.minSignals) {
      return null
    }
    
    // Normalize scores
    const weightedLongScore = totalWeight > 0 ? longScore / totalWeight : 0
    const weightedShortScore = totalWeight > 0 ? shortScore / totalWeight : 0
    
    // Determine direction
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL'
    let confidence: number
    let consensus: number
    
    const scoreDiff = Math.abs(weightedLongScore - weightedShortScore)
    const conflictDetected = scoreDiff < this.config.aggregationConfig.conflictThreshold
    
    if (conflictDetected && this.config.aggregationConfig.conflictResolution === 'strict') {
      direction = 'NEUTRAL'
      confidence = 0
      consensus = 0
    } else if (weightedLongScore > weightedShortScore) {
      direction = 'LONG'
      confidence = weightedLongScore
      consensus = weightedLongScore / (weightedLongScore + weightedShortScore + 0.001)
    } else if (weightedShortScore > weightedLongScore) {
      direction = 'SHORT'
      confidence = weightedShortScore
      consensus = weightedShortScore / (weightedLongScore + weightedShortScore + 0.001)
    } else {
      direction = 'NEUTRAL'
      confidence = 0
      consensus = 0
    }
    
    // Calculate entry prices
    const entriesWithPrice = filteredSignals.filter(fs => fs.original.entryPrice && fs.original.entryPrice > 0)
    const avgEntry = entriesWithPrice.length > 0
      ? entriesWithPrice.reduce((sum, fs) => sum + (fs.original.entryPrice || 0), 0) / entriesWithPrice.length
      : 0
    
    const stopLosses = filteredSignals.filter(fs => fs.original.stopLoss && fs.original.stopLoss > 0)
    const avgStopLoss = stopLosses.length > 0
      ? stopLosses.reduce((sum, fs) => sum + (fs.original.stopLoss || 0), 0) / stopLosses.length
      : avgEntry * 0.98
    
    const takeProfits = filteredSignals.filter(fs => fs.original.takeProfit && fs.original.takeProfit > 0)
    const avgTakeProfit = takeProfits.length > 0
      ? takeProfits.reduce((sum, fs) => sum + (fs.original.takeProfit || 0), 0) / takeProfits.length
      : avgEntry * 1.04
    
    // Calculate R:R
    const risk = Math.abs(avgEntry - avgStopLoss)
    const reward = Math.abs(avgTakeProfit - avgEntry)
    const riskRewardRatio = risk > 0 ? reward / risk : 0
    
    // Determine signal quality
    let signalQuality: 'high' | 'medium' | 'low'
    if (confidence >= 0.7 && consensus >= 0.7 && !conflictDetected) {
      signalQuality = 'high'
    } else if (confidence >= 0.5 && consensus >= 0.5) {
      signalQuality = 'medium'
    } else {
      signalQuality = 'low'
    }
    
    // Count votes
    const longVotes = contributions.filter(c => c.direction === 'LONG').length
    const shortVotes = contributions.filter(c => c.direction === 'SHORT').length
    const neutralVotes = contributions.filter(c => c.direction === 'NEUTRAL').length
    
    return {
      id: `logos_ml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      symbol,
      exchange,
      direction,
      confidence,
      consensus,
      entryPrice: avgEntry,
      stopLoss: avgStopLoss,
      takeProfit: avgTakeProfit,
      riskRewardRatio,
      participatingBots: Array.from(uniqueBots) as any,
      longVotes,
      shortVotes,
      neutralVotes,
      weightedLongScore,
      weightedShortScore,
      signalQuality,
      conflictDetected,
      conflictReason: conflictDetected ? 'Signals are conflicting' : undefined,
      contributions,
    }
  }
  
  /**
   * Enhance aggregated signal with ML data
   */
  private enhanceWithML(
    aggregation: AggregatedSignal,
    filteredSignals: FilteredSignal[],
    mlScores: Array<{ botCode: string; mlScore: number; passedFilter: boolean }>
  ): MLAggregatedSignal {
    // Calculate overall ML score
    const passedSignals = filteredSignals.filter(fs => fs.passed)
    const overallMLScore = passedSignals.length > 0
      ? passedSignals.reduce((sum, fs) => sum + fs.mlScore, 0) / passedSignals.length
      : 0
    
    // ML-enhanced confidence
    let mlEnhancedConfidence = aggregation.confidence
    if (this.config.adjustFinalConfidence) {
      mlEnhancedConfidence = 
        aggregation.confidence * (1 - this.config.finalConfidenceMLWeight) +
        overallMLScore * this.config.finalConfidenceMLWeight
    }
    
    // Filter statistics
    const filterStats = {
      totalProcessed: filteredSignals.length,
      passedFilter: passedSignals.length,
      rejectedFilter: filteredSignals.length - passedSignals.length,
    }
    
    // Quality assessment
    let qualityAssessment: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'REJECTED'
    if (overallMLScore >= 0.8 && mlEnhancedConfidence >= 0.7) {
      qualityAssessment = 'EXCELLENT'
    } else if (overallMLScore >= 0.6 && mlEnhancedConfidence >= 0.5) {
      qualityAssessment = 'GOOD'
    } else if (overallMLScore >= 0.4 && mlEnhancedConfidence >= 0.3) {
      qualityAssessment = 'ACCEPTABLE'
    } else if (overallMLScore >= 0.2) {
      qualityAssessment = 'POOR'
    } else {
      qualityAssessment = 'REJECTED'
    }
    
    // ML recommendation
    let mlRecommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
    if (qualityAssessment === 'EXCELLENT' || qualityAssessment === 'GOOD') {
      mlRecommendation = 'APPROVE'
    } else if (qualityAssessment === 'ACCEPTABLE') {
      mlRecommendation = 'MONITOR'
    } else if (qualityAssessment === 'POOR') {
      mlRecommendation = 'ADJUST'
    } else {
      mlRecommendation = 'REJECT'
    }
    
    return {
      ...aggregation,
      confidence: mlEnhancedConfidence,
      ml: {
        overallMLScore,
        mlEnhancedConfidence,
        mlScores,
        filterStats,
        qualityAssessment,
        mlRecommendation,
      },
    }
  }
  
  /**
   * Wrap base aggregation as ML signal (for disabled ML mode)
   */
  private wrapAsMLSignal(base: AggregatedSignal): MLAggregatedSignal {
    return {
      ...base,
      ml: {
        overallMLScore: 0.5,
        mlEnhancedConfidence: base.confidence,
        mlScores: base.contributions.map(c => ({
          botCode: c.botCode,
          mlScore: 0.5,
          passedFilter: true,
        })),
        filterStats: {
          totalProcessed: base.contributions.length,
          passedFilter: base.contributions.length,
          rejectedFilter: 0,
        },
        qualityAssessment: base.signalQuality === 'high' ? 'EXCELLENT' : 
                          base.signalQuality === 'medium' ? 'GOOD' : 'ACCEPTABLE',
        mlRecommendation: 'APPROVE',
      },
    }
  }
  
  /**
   * Get base aggregation (fallback)
   */
  private async getBaseAggregation(symbol: string, exchange: string): Promise<AggregatedSignal | null> {
    // This would call the base engine's aggregation
    // For now, return null as base engine handles this internally
    return null
  }
  
  // ==========================================================================
  // STATUS & CONFIGURATION
  // ==========================================================================
  
  /**
   * Get engine status
   */
  getStatus(): {
    status: string
    mlEnabled: boolean
    config: MLIntegrationConfig
    filterStats: ReturnType<typeof this.mlFilter.getStats>
  } {
    return {
      status: this.status,
      mlEnabled: this.config.enabled,
      config: this.config,
      filterStats: this.mlFilter.getStats(),
    }
  }
  
  /**
   * Get ML filter statistics
   */
  getMLStats() {
    return this.mlFilter.getStats()
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<MLIntegrationConfig>): void {
    this.config = { ...this.config, ...config }
  }
  
  /**
   * Get base engine
   */
  getBaseEngine(): LOGOSEngine {
    return this.baseEngine
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let mlEngineInstance: MLEnhancedLOGOSEngine | null = null

/**
 * Get ML-Enhanced LOGOS Engine instance
 */
export function getMLEnhancedLOGOS(
  aggregationConfig?: Partial<AggregationConfig>,
  mlConfig?: Partial<MLIntegrationConfig>
): MLEnhancedLOGOSEngine {
  if (!mlEngineInstance) {
    mlEngineInstance = new MLEnhancedLOGOSEngine(aggregationConfig, mlConfig)
  }
  return mlEngineInstance
}

/**
 * Reset the singleton instance
 */
export function resetMLEnhancedLOGOS(): void {
  mlEngineInstance = null
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  DEFAULT_ML_INTEGRATION_CONFIG,
  LOGOS_BOT_METADATA,
}

export default MLEnhancedLOGOSEngine
