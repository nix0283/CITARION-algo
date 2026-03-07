/**
 * Training Data Collector for Gradient Boosting
 *
 * Collects real trade outcomes for training the Gradient Boosting model
 * Stores features at signal time and outcome after trade closes
 */

import type { SignalFeatures } from './index'
import { getFeatureProvider, type OHLCV } from './exchange-feature-provider'

// =============================================================================
// TYPES
// =============================================================================

export interface TrainingSample {
  id: string
  timestamp: number
  symbol: string
  exchange: string
  botCode: string
  
  // Features at signal time
  features: SignalFeatures
  
  // Signal details
  signalDirection: 'LONG' | 'SHORT'
  signalConfidence: number
  
  // Trade result (filled after trade closes)
  outcome?: number  // 0 = loss, 1 = win, 0.5 = neutral
  pnlPercent?: number
  holdTimeMs?: number
  maxDrawdown?: number
  maxProfit?: number
  
  // Status
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED'
  completedAt?: number
  
  // Metadata
  entryPrice?: number
  exitPrice?: number
}

export interface TrainingStats {
  totalSamples: number
  completedSamples: number
  pendingSamples: number
  winRate: number
  avgPnl: number
  avgHoldTime: number
  byBot: Record<string, { count: number; winRate: number }>
  bySymbol: Record<string, { count: number; winRate: number }>
}

export interface TrainingConfig {
  /** Maximum samples to keep */
  maxSamples: number
  /** Time after which pending samples expire */
  pendingExpiryMs: number
  /** Minimum samples before model retrain */
  minSamplesForRetrain: number
  /** Auto-retrain when enough new samples collected */
  autoRetrain: boolean
}

// =============================================================================
// TRAINING DATA COLLECTOR
// =============================================================================

export class TrainingDataCollector {
  private samples: TrainingSample[] = []
  private config: TrainingConfig
  private onRetrainCallback?: (samples: TrainingSample[]) => void

  constructor(config: Partial<TrainingConfig> = {}) {
    this.config = {
      maxSamples: 5000,
      pendingExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      minSamplesForRetrain: 100,
      autoRetrain: true,
      ...config,
    }
  }

  /**
   * Set callback for auto-retrain
   */
  setRetrainCallback(callback: (samples: TrainingSample[]) => void): void {
    this.onRetrainCallback = callback
  }

  /**
   * Record a new signal for training
   */
  recordSignal(
    signal: {
      symbol: string
      exchange: string
      botCode: string
      direction: 'LONG' | 'SHORT'
      confidence: number
      entryPrice: number
    },
    features: SignalFeatures
  ): string {
    const sample: TrainingSample = {
      id: `train_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      symbol: signal.symbol,
      exchange: signal.exchange,
      botCode: signal.botCode,
      features,
      signalDirection: signal.direction,
      signalConfidence: signal.confidence,
      status: 'PENDING',
      entryPrice: signal.entryPrice,
    }

    this.samples.push(sample)
    this.pruneOldSamples()

    return sample.id
  }

  /**
   * Record a new signal with candles (auto-extract features)
   */
  recordSignalWithCandles(
    signal: {
      symbol: string
      exchange: string
      botCode: string
      direction: 'LONG' | 'SHORT'
      confidence: number
      entryPrice: number
    },
    candles: OHLCV[],
    context?: { fundingRate?: number; basis?: number; openInterestChange?: number }
  ): string {
    const provider = getFeatureProvider(signal.exchange, signal.symbol)
    const features = provider.getFeaturesForSignal(candles, context)
    
    return this.recordSignal(signal, features)
  }

  /**
   * Update sample with trade outcome
   */
  recordOutcome(
    sampleId: string,
    outcome: {
      exitPrice: number
      pnlPercent: number
      holdTimeMs: number
      maxDrawdown?: number
      maxProfit?: number
    }
  ): boolean {
    const sample = this.samples.find(s => s.id === sampleId)
    
    if (!sample || sample.status !== 'PENDING') {
      return false
    }

    // Calculate win/loss
    const isWin = outcome.pnlPercent > 0
    const isNeutral = Math.abs(outcome.pnlPercent) < 0.1
    
    sample.outcome = isNeutral ? 0.5 : (isWin ? 1 : 0)
    sample.pnlPercent = outcome.pnlPercent
    sample.holdTimeMs = outcome.holdTimeMs
    sample.maxDrawdown = outcome.maxDrawdown
    sample.maxProfit = outcome.maxProfit
    sample.exitPrice = outcome.exitPrice
    sample.status = 'COMPLETED'
    sample.completedAt = Date.now()

    // Check if we should retrain
    this.checkAutoRetrain()

    return true
  }

  /**
   * Mark expired samples
   */
  expireOldSamples(): number {
    const now = Date.now()
    let expired = 0

    for (const sample of this.samples) {
      if (
        sample.status === 'PENDING' &&
        now - sample.timestamp > this.config.pendingExpiryMs
      ) {
        sample.status = 'EXPIRED'
        expired++
      }
    }

    return expired
  }

  /**
   * Get training data for model
   */
  getTrainingData(): Array<{ features: SignalFeatures; outcome: number }> {
    return this.samples
      .filter(s => s.status === 'COMPLETED' && s.outcome !== undefined)
      .map(s => ({
        features: s.features,
        outcome: s.outcome!,
      }))
  }

  /**
   * Get samples by status
   */
  getPendingSamples(): TrainingSample[] {
    return this.samples.filter(s => s.status === 'PENDING')
  }

  getCompletedSamples(): TrainingSample[] {
    return this.samples.filter(s => s.status === 'COMPLETED')
  }

  /**
   * Get statistics
   */
  getStats(): TrainingStats {
    const completed = this.samples.filter(s => s.status === 'COMPLETED')
    const pending = this.samples.filter(s => s.status === 'PENDING')

    const wins = completed.filter(s => (s.outcome || 0) >= 0.6)
    const totalPnl = completed.reduce((sum, s) => sum + (s.pnlPercent || 0), 0)
    const totalHoldTime = completed.reduce((sum, s) => sum + (s.holdTimeMs || 0), 0)

    // By bot stats
    const byBot: Record<string, { count: number; winRate: number }> = {}
    for (const sample of completed) {
      if (!byBot[sample.botCode]) {
        byBot[sample.botCode] = { count: 0, winRate: 0 }
      }
      byBot[sample.botCode].count++
    }
    for (const bot of Object.keys(byBot)) {
      const botSamples = completed.filter(s => s.botCode === bot)
      const botWins = botSamples.filter(s => (s.outcome || 0) >= 0.6)
      byBot[bot].winRate = botSamples.length > 0 ? botWins.length / botSamples.length : 0
    }

    // By symbol stats
    const bySymbol: Record<string, { count: number; winRate: number }> = {}
    for (const sample of completed) {
      if (!bySymbol[sample.symbol]) {
        bySymbol[sample.symbol] = { count: 0, winRate: 0 }
      }
      bySymbol[sample.symbol].count++
    }
    for (const sym of Object.keys(bySymbol)) {
      const symSamples = completed.filter(s => s.symbol === sym)
      const symWins = symSamples.filter(s => (s.outcome || 0) >= 0.6)
      bySymbol[sym].winRate = symSamples.length > 0 ? symWins.length / symSamples.length : 0
    }

    return {
      totalSamples: this.samples.length,
      completedSamples: completed.length,
      pendingSamples: pending.length,
      winRate: completed.length > 0 ? wins.length / completed.length : 0,
      avgPnl: completed.length > 0 ? totalPnl / completed.length : 0,
      avgHoldTime: completed.length > 0 ? totalHoldTime / completed.length : 0,
      byBot,
      bySymbol,
    }
  }

  /**
   * Export training data
   */
  exportData(): string {
    return JSON.stringify({
      samples: this.samples,
      exportedAt: Date.now(),
      config: this.config,
    }, null, 2)
  }

  /**
   * Import training data
   */
  importData(json: string): number {
    try {
      const data = JSON.parse(json)
      const importedSamples = data.samples || []
      
      for (const sample of importedSamples) {
        // Avoid duplicates
        if (!this.samples.find(s => s.id === sample.id)) {
          this.samples.push(sample)
        }
      }

      this.pruneOldSamples()
      return importedSamples.length
    } catch {
      return 0
    }
  }

  /**
   * Clear all samples
   */
  clearSamples(): void {
    this.samples = []
  }

  /**
   * Prune old samples if over limit
   */
  private pruneOldSamples(): void {
    if (this.samples.length > this.config.maxSamples) {
      // Keep completed samples first, then newest pending
      const completed = this.samples
        .filter(s => s.status === 'COMPLETED')
        .sort((a, b) => b.timestamp - a.timestamp)
      const pending = this.samples
        .filter(s => s.status === 'PENDING')
        .sort((a, b) => b.timestamp - a.timestamp)

      const keepCompleted = Math.floor(this.config.maxSamples * 0.8)
      const keepPending = this.config.maxSamples - keepCompleted

      this.samples = [
        ...completed.slice(0, keepCompleted),
        ...pending.slice(0, keepPending),
      ]
    }
  }

  /**
   * Check if auto-retrain should trigger
   */
  private checkAutoRetrain(): void {
    if (!this.config.autoRetrain || !this.onRetrainCallback) return

    const completedCount = this.samples.filter(s => s.status === 'COMPLETED').length
    
    if (completedCount >= this.config.minSamplesForRetrain) {
      // Check if we have enough new samples since last train
      // For simplicity, trigger every minSamplesForRetrain new samples
      if (completedCount % this.config.minSamplesForRetrain === 0) {
        this.onRetrainCallback(this.getCompletedSamples())
      }
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let collectorInstance: TrainingDataCollector | null = null

/**
 * Get singleton collector instance
 */
export function getTrainingCollector(config?: Partial<TrainingConfig>): TrainingDataCollector {
  if (!collectorInstance) {
    collectorInstance = new TrainingDataCollector(config)
  }
  return collectorInstance
}

/**
 * Reset collector (for testing)
 */
export function resetCollector(): void {
  collectorInstance = null
}
