/**
 * LOGOS Meta Bot
 * 
 * Meta bot for signal aggregation and consensus building.
 * Collects signals from all operational, institutional, and frequency bots,
 * then produces a unified trading decision.
 * 
 * Named after the Greek word for "reason" or "logic".
 */

import { getEventBus, TOPICS, type BotCode, type AnalyticsEvent } from '../orchestration'

// ============================================================================
// TYPES
// ============================================================================

/**
 * LOGOS Bot Metadata
 */
export const LOGOS_BOT_METADATA = {
  code: 'LOGOS' as const,
  name: 'Logos',
  fullName: 'Logos Meta Bot - Signal Aggregator',
  category: 'meta' as const,
  description: 'Meta bot for signal aggregation and consensus building',
  frequency: 'variable' as const,
  latencyTarget: 500000, // 500ms
  exchanges: ['binance', 'bybit', 'okx', 'bitget', 'bingx'],
  features: [
    'signal_aggregation',
    'consensus_building',
    'weighted_voting',
    'confidence_calibration',
    'conflict_resolution',
    'performance_tracking',
  ],
  riskLevel: 'conservative' as const,
}

/**
 * Incoming signal from a bot
 */
export interface IncomingSignal {
  botCode: BotCode
  botCategory: 'operational' | 'institutional' | 'frequency' | 'meta'
  timestamp: number
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number          // 0-1
  strength?: number           // 0-1
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
  metadata?: Record<string, unknown>
}

/**
 * Aggregated signal output
 */
export interface AggregatedSignal {
  id: string
  timestamp: number
  symbol: string
  exchange: string
  
  // Decision
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number          // 0-1
  consensus: number           // 0-1 (agreement level)
  
  // Entry/Exit
  entryPrice: number
  stopLoss: number
  takeProfit: number
  riskRewardRatio: number
  
  // Aggregation details
  participatingBots: BotCode[]
  longVotes: number
  shortVotes: number
  neutralVotes: number
  weightedLongScore: number
  weightedShortScore: number
  
  // Quality metrics
  signalQuality: 'high' | 'medium' | 'low'
  conflictDetected: boolean
  conflictReason?: string
  
  // Individual contributions
  contributions: SignalContribution[]
}

/**
 * Individual signal contribution
 */
export interface SignalContribution {
  botCode: BotCode
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  weight: number              // Contribution weight
  adjustedConfidence: number  // Weight-adjusted confidence
  performanceScore: number    // Historical accuracy
}

/**
 * Bot performance tracking
 */
export interface BotPerformance {
  botCode: BotCode
  totalSignals: number
  longSignals: number
  shortSignals: number
  correctSignals: number
  incorrectSignals: number
  accuracy: number
  avgConfidence: number
  avgLatency: number
  lastSignalTime: number
  weightedScore: number       // Performance-weighted score
}

/**
 * Aggregation configuration
 */
export interface AggregationConfig {
  // Minimum requirements
  minSignals: number          // Minimum signals to aggregate
  minConfidence: number       // Minimum confidence threshold
  minConsensus: number        // Minimum consensus to act
  
  // Weights by bot category
  categoryWeights: {
    operational: number
    institutional: number
    frequency: number
  }
  
  // Weights by signal quality
  confidenceWeighting: boolean
  performanceWeighting: boolean
  
  // Conflict resolution
  conflictResolution: 'strict' | 'moderate' | 'loose'
  conflictThreshold: number   // Difference threshold for conflict
  
  // Time window for aggregation
  aggregationWindowMs: number
  
  // Decay
  signalDecay: boolean
  decayRate: number           // Decay rate per second
}

/**
 * Default aggregation configuration
 */
export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  minSignals: 2,
  minConfidence: 0.5,
  minConsensus: 0.6,
  
  categoryWeights: {
    operational: 1.0,
    institutional: 1.2,
    frequency: 0.9,
  },
  
  confidenceWeighting: true,
  performanceWeighting: true,
  
  conflictResolution: 'moderate',
  conflictThreshold: 0.3,
  
  aggregationWindowMs: 5000,  // 5 seconds
  
  signalDecay: true,
  decayRate: 0.01,
}

// ============================================================================
// SIGNAL AGGREGATOR
// ============================================================================

/**
 * Signal Aggregator class
 */
class SignalAggregator {
  private signals: Map<string, IncomingSignal[]> = new Map()
  private performances: Map<BotCode, BotPerformance> = new Map()
  private config: AggregationConfig

  constructor(config: AggregationConfig = DEFAULT_AGGREGATION_CONFIG) {
    this.config = config
    this.initializePerformances()
  }

  /**
   * Initialize performance tracking for all bots
   */
  private initializePerformances(): void {
    const botCodes: BotCode[] = [
      'MESH', 'SCALE', 'BAND',
      'PND', 'TRND', 'FCST', 'RNG', 'LMB',
      'HFT', 'MFT', 'LFT',
    ]

    for (const code of botCodes) {
      this.performances.set(code, {
        botCode: code,
        totalSignals: 0,
        longSignals: 0,
        shortSignals: 0,
        correctSignals: 0,
        incorrectSignals: 0,
        accuracy: 0.5,
        avgConfidence: 0.5,
        avgLatency: 0,
        lastSignalTime: 0,
        weightedScore: 0.5,
      })
    }
  }

  /**
   * Add a signal to aggregation
   */
  addSignal(signal: IncomingSignal): void {
    const key = `${signal.exchange}_${signal.symbol}`
    
    if (!this.signals.has(key)) {
      this.signals.set(key, [])
    }
    
    this.signals.get(key)!.push(signal)
    
    // Update performance
    this.updatePerformance(signal)
  }

  /**
   * Update bot performance tracking
   */
  private updatePerformance(signal: IncomingSignal): void {
    const perf = this.performances.get(signal.botCode)
    if (!perf) return

    perf.totalSignals++
    perf.lastSignalTime = Date.now()
    
    if (signal.direction === 'LONG') perf.longSignals++
    else if (signal.direction === 'SHORT') perf.shortSignals++
    
    perf.avgConfidence = 
      (perf.avgConfidence * (perf.totalSignals - 1) + signal.confidence) / 
      perf.totalSignals
  }

  /**
   * Get category for a bot
   */
  private getBotCategory(botCode: BotCode): 'operational' | 'institutional' | 'frequency' {
    const operational: BotCode[] = ['MESH', 'SCALE', 'BAND']
    const institutional: BotCode[] = ['PND', 'TRND', 'FCST', 'RNG', 'LMB']
    const frequency: BotCode[] = ['HFT', 'MFT', 'LFT']

    if (operational.includes(botCode)) return 'operational'
    if (institutional.includes(botCode)) return 'institutional'
    if (frequency.includes(botCode)) return 'frequency'
    return 'operational'
  }

  /**
   * Calculate weight for a signal
   */
  private calculateWeight(signal: IncomingSignal): number {
    let weight = 1.0

    // Category weight
    const category = this.getBotCategory(signal.botCode)
    weight *= this.config.categoryWeights[category]

    // Confidence weighting
    if (this.config.confidenceWeighting) {
      weight *= signal.confidence
    }

    // Performance weighting
    if (this.config.performanceWeighting) {
      const perf = this.performances.get(signal.botCode)
      if (perf) {
        weight *= perf.accuracy
      }
    }

    // Time decay
    if (this.config.signalDecay) {
      const age = (Date.now() - signal.timestamp) / 1000
      weight *= Math.exp(-this.config.decayRate * age)
    }

    return weight
  }

  /**
   * Aggregate signals for a symbol
   */
  aggregate(symbol: string, exchange: string): AggregatedSignal | null {
    const key = `${exchange}_${symbol}`
    const signals = this.signals.get(key) || []
    
    // Filter to time window
    const cutoff = Date.now() - this.config.aggregationWindowMs
    const recentSignals = signals.filter(s => s.timestamp >= cutoff)
    
    if (recentSignals.length < this.config.minSignals) {
      return null
    }

    // Calculate weighted scores
    let longScore = 0
    let shortScore = 0
    let totalWeight = 0
    
    const contributions: SignalContribution[] = []
    const uniqueBots = new Set<BotCode>()

    for (const signal of recentSignals) {
      if (uniqueBots.has(signal.botCode)) continue  // One signal per bot
      uniqueBots.add(signal.botCode)

      const weight = this.calculateWeight(signal)
      const perf = this.performances.get(signal.botCode)
      const performanceScore = perf?.accuracy || 0.5
      const adjustedConfidence = signal.confidence * weight

      contributions.push({
        botCode: signal.botCode,
        direction: signal.direction,
        confidence: signal.confidence,
        weight,
        adjustedConfidence,
        performanceScore,
      })

      totalWeight += weight

      if (signal.direction === 'LONG') {
        longScore += adjustedConfidence
      } else if (signal.direction === 'SHORT') {
        shortScore += adjustedConfidence
      }
    }

    // Normalize scores
    const weightedLongScore = totalWeight > 0 ? longScore / totalWeight : 0
    const weightedShortScore = totalWeight > 0 ? shortScore / totalWeight : 0

    // Determine direction
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL'
    let confidence: number
    let consensus: number

    const scoreDiff = Math.abs(weightedLongScore - weightedShortScore)
    const conflictDetected = scoreDiff < this.config.conflictThreshold

    if (conflictDetected && this.config.conflictResolution === 'strict') {
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

    // Count votes
    const longVotes = contributions.filter(c => c.direction === 'LONG').length
    const shortVotes = contributions.filter(c => c.direction === 'SHORT').length
    const neutralVotes = contributions.filter(c => c.direction === 'NEUTRAL').length

    // Calculate average entry, SL, TP
    const entriesWithPrice = recentSignals.filter(s => s.entryPrice && s.entryPrice > 0)
    const avgEntry = entriesWithPrice.length > 0
      ? entriesWithPrice.reduce((sum, s) => sum + (s.entryPrice || 0), 0) / entriesWithPrice.length
      : 0

    const stopLosses = recentSignals.filter(s => s.stopLoss && s.stopLoss > 0)
    const avgStopLoss = stopLosses.length > 0
      ? stopLosses.reduce((sum, s) => sum + (s.stopLoss || 0), 0) / stopLosses.length
      : avgEntry * 0.98

    const takeProfits = recentSignals.filter(s => s.takeProfit && s.takeProfit > 0)
    const avgTakeProfit = takeProfits.length > 0
      ? takeProfits.reduce((sum, s) => sum + (s.takeProfit || 0), 0) / takeProfits.length
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

    // Clear processed signals
    this.signals.set(key, signals.filter(s => s.timestamp < cutoff))

    return {
      id: `logos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
      participatingBots: Array.from(uniqueBots),
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
   * Update signal outcome for performance tracking
   */
  updateOutcome(botCode: BotCode, correct: boolean): void {
    const perf = this.performances.get(botCode)
    if (!perf) return

    if (correct) {
      perf.correctSignals++
    } else {
      perf.incorrectSignals++
    }

    const total = perf.correctSignals + perf.incorrectSignals
    if (total > 0) {
      perf.accuracy = perf.correctSignals / total
      perf.weightedScore = perf.accuracy * perf.avgConfidence
    }
  }

  /**
   * Get bot performance
   */
  getPerformance(botCode: BotCode): BotPerformance | undefined {
    return this.performances.get(botCode)
  }

  /**
   * Get all performances
   */
  getAllPerformances(): BotPerformance[] {
    return Array.from(this.performances.values())
  }
}

// ============================================================================
// LOGOS ENGINE
// ============================================================================

/**
 * LOGOS Engine - Meta bot controller
 */
export class LOGOSEngine {
  private aggregator: SignalAggregator
  private eventBus = getEventBus()
  private subscriptionId: string | null = null
  private status: 'idle' | 'running' | 'paused' = 'idle'
  private config: AggregationConfig

  constructor(config: Partial<AggregationConfig> = {}) {
    this.config = { ...DEFAULT_AGGREGATION_CONFIG, ...config }
    this.aggregator = new SignalAggregator(this.config)
  }

  /**
   * Start the LOGOS engine
   */
  async start(): Promise<void> {
    if (this.status === 'running') return

    // Subscribe to all bot signals
    this.subscriptionId = await this.eventBus.subscribeToAllSignals((event) => {
      this.handleSignal(event)
    })

    this.status = 'running'
    console.log('[LOGOS] Engine started, listening for signals')

    // Register bot
    this.eventBus.registerBot({
      metadata: LOGOS_BOT_METADATA,
      status: 'active',
      registeredAt: Date.now(),
      subscriptions: ['analytics.signal.*'],
    })
  }

  /**
   * Stop the LOGOS engine
   */
  async stop(): Promise<void> {
    if (this.subscriptionId) {
      await this.eventBus.unsubscribe(this.subscriptionId)
      this.subscriptionId = null
    }

    this.status = 'idle'
    this.eventBus.unregisterBot('LOGOS')
    console.log('[LOGOS] Engine stopped')
  }

  /**
   * Handle incoming signal from another bot
   */
  private handleSignal(event: AnalyticsEvent): void {
    if (event.category !== 'analytics') return
    if (event.source === 'LOGOS') return  // Ignore own signals

    const signal: IncomingSignal = {
      botCode: event.source as BotCode,
      botCategory: this.getBotCategory(event.source as BotCode),
      timestamp: event.timestamp,
      symbol: event.data.symbol || 'BTCUSDT',
      exchange: event.data.exchange || 'binance',
      direction: event.data.direction || 'NEUTRAL',
      confidence: event.data.confidence || 0.5,
      strength: event.data.strength,
      entryPrice: event.data.entryPrice,
      stopLoss: event.data.stopLoss,
      takeProfit: event.data.takeProfit,
      metadata: event.data.metadata,
    }

    this.aggregator.addSignal(signal)

    // Try to aggregate
    const aggregated = this.aggregator.aggregate(signal.symbol, signal.exchange)
    
    if (aggregated && aggregated.direction !== 'NEUTRAL') {
      this.publishAggregatedSignal(aggregated)
    }
  }

  /**
   * Get bot category
   */
  private getBotCategory(botCode: BotCode): 'operational' | 'institutional' | 'frequency' {
    const operational: BotCode[] = ['MESH', 'SCALE', 'BAND']
    const institutional: BotCode[] = ['PND', 'TRND', 'FCST', 'RNG', 'LMB']
    const frequency: BotCode[] = ['HFT', 'MFT', 'LFT']

    if (operational.includes(botCode)) return 'operational'
    if (institutional.includes(botCode)) return 'institutional'
    return 'frequency'
  }

  /**
   * Publish aggregated signal
   */
  private async publishAggregatedSignal(signal: AggregatedSignal): Promise<void> {
    await this.eventBus.publishSignal('LOGOS', {
      id: signal.id,
      timestamp: signal.timestamp,
      category: 'analytics',
      source: 'LOGOS',
      type: 'signal.confirmed',
      data: {
        signalId: signal.id,
        botId: 'LOGOS',
        signalType: 'entry',
        direction: signal.direction,
        confidence: signal.confidence,
        symbol: signal.symbol,
        exchange: signal.exchange,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        participatingBots: signal.participatingBots,
        consensus: signal.consensus,
        signalQuality: signal.signalQuality,
      },
    } as AnalyticsEvent)

    console.log(
      `[LOGOS] Published aggregated signal: ${signal.direction} ${signal.symbol} ` +
      `(confidence: ${signal.confidence.toFixed(2)}, consensus: ${signal.consensus.toFixed(2)}, ` +
      `bots: ${signal.participatingBots.join(', ')})`
    )
  }

  /**
   * Get engine status
   */
  getStatus(): { status: string; config: AggregationConfig } {
    return {
      status: this.status,
      config: this.config,
    }
  }

  /**
   * Get bot performances
   */
  getBotPerformances(): BotPerformance[] {
    return this.aggregator.getAllPerformances()
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AggregationConfig>): void {
    this.config = { ...this.config, ...config }
    this.aggregator = new SignalAggregator(this.config)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { LOGOS_BOT_METADATA, DEFAULT_AGGREGATION_CONFIG, SignalAggregator }
export type { BotPerformance }
