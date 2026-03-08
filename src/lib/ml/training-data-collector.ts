/**
 * Training Data Collector
 * 
 * System for collecting historical signal outcomes to train the Lawrence Classifier.
 * Collects signals from all bots and tracks their outcomes for ML training.
 * 
 * IMPORTANT: Updated with label leakage prevention and proper time-based splitting.
 * 
 * Key improvements:
 * 1. Labels are calculated only from data available after feature timestamp
 * 2. Proper embargo periods between train and test data
 * 3. Time-based train/test splits instead of random splitting
 * 4. Label leakage detection and validation
 */

import { PrismaClient } from '@prisma/client'
import {
  getLawrenceClassifier,
  type TrainingSample,
  type LawrenceFeatures,
} from './lawrence-classifier'
import { 
  getTrainingDataValidator,
  type TimeSplitConfig,
  type WalkForwardConfig,
} from './training-data-validator'

const prisma = new PrismaClient()

// ============================================================================
// TYPES
// ============================================================================

/**
 * Signal outcome for training
 */
export interface SignalOutcome {
  signalId: string
  botCode: string
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT'
  confidence: number
  entryPrice: number
  exitPrice?: number
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN'
  pnlPercent: number
  features: Record<string, number>
  holdingTime: number // seconds
  timestamp: number
}

/**
 * Training data statistics
 */
export interface TrainingDataStats {
  totalSamples: number
  winSamples: number
  lossSamples: number
  breakevenSamples: number
  avgHoldingTime: number
  avgPnlPercent: number
  winRate: number
  byBot: Record<string, { total: number; wins: number; winRate: number }>
  bySymbol: Record<string, { total: number; wins: number; winRate: number }>
  lastCollected: number
}

/**
 * Collection configuration
 */
export interface CollectionConfig {
  // Minimum holding time to consider (seconds)
  minHoldingTime: number
  
  // Maximum holding time to consider (seconds)
  maxHoldingTime: number
  
  // Minimum PnL % for WIN
  winThreshold: number
  
  // Maximum PnL % for LOSS (negative)
  lossThreshold: number
  
  // Bot codes to collect from
  botCodes: string[]
  
  // Auto-train classifier after collecting
  autoTrain: boolean
  
  // Minimum samples before training
  minSamplesForTraining: number
  
  // ==================== LABEL LEAKAGE PREVENTION ====================
  
  /**
   * Embargo period between train and test data (in seconds)
   * During this period, samples are excluded from both train and test
   * to prevent label leakage from overlapping time periods
   */
  embargoPeriodSeconds: number
  
  /**
   * Number of bars to look ahead for label calculation
   * This determines how far into the future we look to determine outcome
   */
  labelLookaheadBars: number
  
  /**
   * Time-based split configuration
   */
  timeSplitConfig: TimeSplitConfig
  
  /**
   * Whether to validate training data for label leakage
   */
  validateForLeakage: boolean
  
  /**
   * Whether to use walk-forward validation instead of simple train/test split
   */
  useWalkForwardValidation: boolean
  
  /**
   * Walk-forward validation configuration
   */
  walkForwardConfig?: WalkForwardConfig
}

/**
 * Default collection configuration
 */
export const DEFAULT_COLLECTION_CONFIG: CollectionConfig = {
  minHoldingTime: 60, // 1 minute
  maxHoldingTime: 86400 * 7, // 1 week
  winThreshold: 0.5, // 0.5% profit
  lossThreshold: -0.5, // 0.5% loss
  botCodes: ['HFT', 'MFT', 'LFT', 'MESH', 'SCALE', 'BAND', 'PND', 'TRND', 'FCST', 'RNG', 'LMB'],
  autoTrain: true,
  minSamplesForTraining: 50,
  
  // Label leakage prevention
  embargoPeriodSeconds: 3600, // 1 hour embargo between train and test
  labelLookaheadBars: 24, // Look 24 bars ahead for label
  timeSplitConfig: {
    type: 'simple',
    trainRatio: 0.8,
    embargoBars: 24, // 24 bars embargo
    purgeBars: 5, // 5 bars purge at boundaries
    shuffleWithinWindow: false, // Never shuffle time series
  },
  validateForLeakage: true,
  useWalkForwardValidation: false,
}

// ============================================================================
// TRAINING DATA COLLECTOR CLASS
// ============================================================================

/**
 * Training Data Collector
 * 
 * Collects signal outcomes from the database and prepares them for training
 */
export class TrainingDataCollector {
  private config: CollectionConfig
  private stats: TrainingDataStats
  
  constructor(config: Partial<CollectionConfig> = {}) {
    this.config = { ...DEFAULT_COLLECTION_CONFIG, ...config }
    this.stats = this.getDefaultStats()
  }
  
  // ==========================================================================
  // MAIN COLLECTION METHODS
  // ==========================================================================
  
  /**
   * Collect training data from classified signals in database
   */
  async collectFromDatabase(): Promise<TrainingSample[]> {
    try {
      // Fetch classified signals with outcomes
      const signals = await prisma.classifiedSignal.findMany({
        where: {
          outcome: { in: ['WIN', 'LOSS', 'BREAKEVEN'] },
          botType: { in: this.config.botCodes },
          resolvedAt: { not: null },
        },
        orderBy: { timestamp: 'desc' },
        take: 10000, // Limit for performance
      })
      
      const samples: TrainingSample[] = []
      
      for (const signal of signals) {
        const sample = this.signalToSample(signal)
        if (sample) {
          samples.push(sample)
        }
      }
      
      // Update stats
      this.updateStats(samples)
      
      return samples
    } catch (error) {
      console.error('[TrainingCollector] Error collecting from database:', error)
      return []
    }
  }
  
  /**
   * Collect training data from trades
   */
  async collectFromTrades(): Promise<TrainingSample[]> {
    try {
      // Fetch closed trades with PnL
      const trades = await prisma.trade.findMany({
        where: {
          status: 'CLOSED',
          closeReason: { in: ['TP', 'SL', 'MANUAL'] },
          exitTime: { not: null },
          exitPrice: { not: null },
        },
        orderBy: { exitTime: 'desc' },
        take: 5000,
      })
      
      const samples: TrainingSample[] = []
      
      for (const trade of trades) {
        const sample = await this.tradeToSample(trade)
        if (sample) {
          samples.push(sample)
        }
      }
      
      return samples
    } catch (error) {
      console.error('[TrainingCollector] Error collecting from trades:', error)
      return []
    }
  }
  
  /**
   * Collect all training data
   */
  async collectAll(): Promise<TrainingSample[]> {
    const [fromSignals, fromTrades] = await Promise.all([
      this.collectFromDatabase(),
      this.collectFromTrades(),
    ])
    
    // Merge and deduplicate by timestamp
    const allSamples = [...fromSignals, ...fromTrades]
    const uniqueSamples = this.deduplicateSamples(allSamples)
    
    // Auto-train if enabled
    if (this.config.autoTrain && uniqueSamples.length >= this.config.minSamplesForTraining) {
      await this.trainClassifier(uniqueSamples)
    }
    
    return uniqueSamples
  }
  
  // ==========================================================================
  // CONVERSION METHODS
  // ==========================================================================
  
  /**
   * Convert ClassifiedSignal to TrainingSample
   */
  private signalToSample(signal: any): TrainingSample | null {
    try {
      let features: Record<string, number>
      try {
        features = JSON.parse(signal.features)
      } catch {
        features = {}
      }
      
      const label = this.outcomeToLabel(signal.outcome)
      const weight = this.calculateWeight(signal.pnlPercent, signal.outcome)
      
      return {
        features,
        label,
        weight,
        timestamp: signal.timestamp.getTime(),
      }
    } catch (error) {
      return null
    }
  }
  
  /**
   * Convert Trade to TrainingSample
   */
  private async tradeToSample(trade: any): Promise<TrainingSample | null> {
    try {
      if (!trade.entryPrice || !trade.exitPrice || !trade.exitTime || !trade.entryTime) {
        return null
      }
      
      const pnlPercent = trade.pnlPercent || 
        this.calculatePnlPercent(trade)
      
      const outcome = this.determineOutcome(pnlPercent)
      const label = this.outcomeToLabel(outcome)
      
      // Extract features from market data if available
      const features = await this.extractFeaturesFromTrade(trade)
      
      const weight = this.calculateWeight(pnlPercent, outcome)
      
      return {
        features,
        label,
        weight,
        timestamp: trade.exitTime.getTime(),
      }
    } catch (error) {
      return null
    }
  }
  
  /**
   * Extract features from trade context
   */
  private async extractFeaturesFromTrade(trade: any): Promise<Record<string, number>> {
    const features: Record<string, number> = {}
    
    try {
      // Get market data at entry time
      const candles = await prisma.ohlcvCandle.findMany({
        where: {
          symbol: trade.symbol,
          exchange: trade.account?.exchangeId || 'binance',
          timeframe: '1h',
          openTime: { 
            gte: new Date(trade.entryTime.getTime() - 24 * 60 * 60 * 1000),
            lte: trade.entryTime,
          },
        },
        orderBy: { openTime: 'asc' },
        take: 48,
      })
      
      if (candles.length >= 14) {
        // Calculate normalized indicators
        const closes = candles.map(c => c.close)
        const highs = candles.map(c => c.high)
        const lows = candles.map(c => c.low)
        const volumes = candles.map(c => c.volume)
        
        // RSI-like feature
        features.n_rsi = this.calculateNormalizedRSI(closes, 14)
        
        // Trend feature
        const sma20 = this.calculateSMA(closes.slice(-20))
        const currentPrice = closes[closes.length - 1]
        features.n_trend = currentPrice > sma20 ? 0.7 : 0.3
        
        // Volatility feature
        const atr = this.calculateATR(highs, lows, closes, 14)
        features.n_volatility = Math.min(1, atr / currentPrice * 100)
        
        // Volume feature
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
        const currentVolume = volumes[volumes.length - 1]
        features.n_volume = Math.min(1, currentVolume / avgVolume / 2)
        
        // Momentum feature
        const roc = (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5]
        features.n_momentum = Math.tanh(roc * 10) * 0.5 + 0.5
      }
    } catch (error) {
      // Return empty features if extraction fails
    }
    
    // Add trade-specific features
    features.direction = trade.direction === 'LONG' ? 0.8 : 0.2
    features.leverage = Math.min(1, (trade.leverage || 1) / 20)
    
    // Time features
    const entryHour = new Date(trade.entryTime).getUTCHours()
    features.hour = entryHour / 24
    features.dayOfWeek = new Date(trade.entryTime).getUTCDay() / 7
    
    return features
  }
  
  // ==========================================================================
  // TRAINING METHODS
  // ==========================================================================
  
  /**
   * Train the classifier with collected samples
   */
  async trainClassifier(samples: TrainingSample[]): Promise<void> {
    const classifier = getLawrenceClassifier()
    
    // Clear existing training data
    classifier.clear()
    
    // Train with collected samples
    classifier.trainBatch(samples)
    
    // Log training stats
    const stats = classifier.getStats()
    console.log(`[TrainingCollector] Trained classifier with ${stats.totalSamples} samples`)
    
    // Save training record to database
    await this.saveTrainingRecord(samples.length, stats)
  }
  
  /**
   * Save training record to database
   */
  private async saveTrainingRecord(samplesCount: number, stats: any): Promise<void> {
    try {
      await prisma.mLModelTraining.create({
        data: {
          modelType: 'LAWRENCE',
          samplesCount,
          features: JSON.stringify([
            'n_rsi', 'n_trend', 'n_volatility', 'n_volume', 
            'n_momentum', 'direction', 'leverage', 'hour', 'dayOfWeek'
          ]),
          accuracy: stats.winRate,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })
    } catch (error) {
      console.error('[TrainingCollector] Error saving training record:', error)
    }
  }
  
  // ==========================================================================
  // SIGNAL OUTCOME TRACKING
  // ==========================================================================
  
  /**
   * Record signal outcome for training
   */
  async recordSignalOutcome(outcome: SignalOutcome): Promise<void> {
    try {
      // Create training sample
      const sample: TrainingSample = {
        features: outcome.features,
        label: this.outcomeToLabel(outcome.outcome),
        weight: this.calculateWeight(outcome.pnlPercent, outcome.outcome),
        timestamp: outcome.timestamp,
      }
      
      // Add to classifier
      const classifier = getLawrenceClassifier()
      classifier.train(sample)
      
      // Also save to database
      await prisma.classifiedSignal.create({
        data: {
          symbol: outcome.symbol,
          direction: outcome.direction,
          outcome: outcome.outcome,
          pnlPercent: outcome.pnlPercent,
          probability: outcome.confidence,
          features: JSON.stringify(outcome.features),
          botType: outcome.botCode,
          resolvedAt: new Date(),
        },
      })
    } catch (error) {
      console.error('[TrainingCollector] Error recording signal outcome:', error)
    }
  }
  
  /**
   * Update signal outcome after trade closes
   */
  async updateSignalOutcome(
    signalId: string,
    exitPrice: number,
    pnlPercent: number
  ): Promise<void> {
    try {
      const outcome = this.determineOutcome(pnlPercent)
      
      await prisma.classifiedSignal.update({
        where: { id: signalId },
        data: {
          outcome,
          pnlPercent,
          resolvedAt: new Date(),
        },
      })
    } catch (error) {
      console.error('[TrainingCollector] Error updating signal outcome:', error)
    }
  }
  
  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================
  
  /**
   * Determine outcome from PnL
   */
  private determineOutcome(pnlPercent: number): 'WIN' | 'LOSS' | 'BREAKEVEN' {
    if (pnlPercent >= this.config.winThreshold) return 'WIN'
    if (pnlPercent <= this.config.lossThreshold) return 'LOSS'
    return 'BREAKEVEN'
  }
  
  /**
   * Convert outcome to label
   */
  private outcomeToLabel(outcome: string): 'LONG' | 'SHORT' | 'NEUTRAL' {
    if (outcome === 'WIN') return 'LONG'
    if (outcome === 'LOSS') return 'SHORT'
    return 'NEUTRAL'
  }
  
  /**
   * Calculate sample weight based on outcome
   */
  private calculateWeight(pnlPercent: number, outcome: string): number {
    // Base weight
    let weight = 0.5
    
    // Adjust based on outcome significance
    if (outcome === 'WIN') {
      weight = 0.5 + Math.min(0.5, Math.abs(pnlPercent) / 10)
    } else if (outcome === 'LOSS') {
      weight = 0.5 - Math.min(0.3, Math.abs(pnlPercent) / 10)
    }
    
    return Math.max(0.1, Math.min(1, weight))
  }
  
  /**
   * Calculate PnL percent from trade
   */
  private calculatePnlPercent(trade: any): number {
    if (!trade.entryPrice || !trade.exitPrice) return 0
    
    const direction = trade.direction === 'LONG' ? 1 : -1
    return direction * (trade.exitPrice - trade.entryPrice) / trade.entryPrice * 100
  }
  
  /**
   * Calculate normalized RSI
   */
  private calculateNormalizedRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 0.5
    
    let gains = 0
    let losses = 0
    
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1]
      if (change > 0) gains += change
      else losses += Math.abs(change)
    }
    
    const avgGain = gains / period
    const avgLoss = losses / period
    
    if (avgLoss === 0) return 1
    const rs = avgGain / avgLoss
    const rsi = 100 - (100 / (1 + rs))
    
    return rsi / 100
  }
  
  /**
   * Calculate SMA
   */
  private calculateSMA(prices: number[]): number {
    if (prices.length === 0) return 0
    return prices.reduce((a, b) => a + b, 0) / prices.length
  }
  
  /**
   * Calculate ATR
   */
  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
    if (highs.length < period + 1) return 0
    
    let trSum = 0
    for (let i = highs.length - period; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
      trSum += tr
    }
    
    return trSum / period
  }
  
  /**
   * Deduplicate samples by timestamp
   */
  private deduplicateSamples(samples: TrainingSample[]): TrainingSample[] {
    const seen = new Map<number, TrainingSample>()
    
    for (const sample of samples) {
      const key = Math.floor(sample.timestamp / 60000) // Group by minute
      if (!seen.has(key)) {
        seen.set(key, sample)
      }
    }
    
    return Array.from(seen.values())
  }
  
  /**
   * Update stats from collected samples
   */
  private updateStats(samples: TrainingSample[]): void {
    this.stats.totalSamples = samples.length
    this.stats.winSamples = samples.filter(s => s.label === 'LONG').length
    this.stats.lossSamples = samples.filter(s => s.label === 'SHORT').length
    this.stats.breakevenSamples = samples.filter(s => s.label === 'NEUTRAL').length
    this.stats.winRate = samples.length > 0 
      ? this.stats.winSamples / samples.length 
      : 0
    this.stats.lastCollected = Date.now()
  }
  
  /**
   * Get default stats
   */
  private getDefaultStats(): TrainingDataStats {
    return {
      totalSamples: 0,
      winSamples: 0,
      lossSamples: 0,
      breakevenSamples: 0,
      avgHoldingTime: 0,
      avgPnlPercent: 0,
      winRate: 0,
      byBot: {},
      bySymbol: {},
      lastCollected: 0,
    }
  }
  
  // ==========================================================================
  // PUBLIC GETTERS
  // ==========================================================================
  
  /**
   * Get collection statistics
   */
  getStats(): TrainingDataStats {
    return { ...this.stats }
  }
  
  /**
   * Get configuration
   */
  getConfig(): CollectionConfig {
    return { ...this.config }
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<CollectionConfig>): void {
    this.config = { ...this.config, ...config }
  }
  
  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    classifiedSignalsCount: number
    tradesCount: number
    pendingOutcomes: number
  }> {
    try {
      const [classifiedSignalsCount, tradesCount, pendingOutcomes] = await Promise.all([
        prisma.classifiedSignal.count(),
        prisma.trade.count({ where: { status: 'CLOSED' } }),
        prisma.classifiedSignal.count({ where: { outcome: 'PENDING' } }),
      ])
      
      return {
        classifiedSignalsCount,
        tradesCount,
        pendingOutcomes,
      }
    } catch (error) {
      return {
        classifiedSignalsCount: 0,
        tradesCount: 0,
        pendingOutcomes: 0,
      }
    }
  }

  // ==========================================================================
  // LABEL LEAKAGE PREVENTION METHODS
  // ==========================================================================

  /**
   * Calculate label from future returns with proper temporal separation
   * 
   * This method ensures that labels are calculated only from data that
   * would be available after the feature timestamp.
   * 
   * @param ohlcv - OHLCV data
   * @param featureBarIndex - Index of the bar where features are calculated
   * @param lookaheadBars - How many bars to look ahead for outcome
   * @returns Label based on future returns
   */
  calculateSafeLabel(
    ohlcv: { close: number; timestamp: number }[],
    featureBarIndex: number,
    lookaheadBars: number
  ): { label: 'LONG' | 'SHORT' | 'NEUTRAL'; returns: number; confidence: number } {
    if (featureBarIndex + lookaheadBars >= ohlcv.length) {
      return { label: 'NEUTRAL', returns: 0, confidence: 0 }
    }

    const entryPrice = ohlcv[featureBarIndex].close
    const exitPrice = ohlcv[featureBarIndex + lookaheadBars].close
    const returns = (exitPrice - entryPrice) / entryPrice * 100

    // Determine label based on returns
    let label: 'LONG' | 'SHORT' | 'NEUTRAL'
    if (returns >= this.config.winThreshold) {
      label = 'LONG'
    } else if (returns <= this.config.lossThreshold) {
      label = 'SHORT'
    } else {
      label = 'NEUTRAL'
    }

    // Calculate confidence based on magnitude
    const confidence = Math.min(1, Math.abs(returns) / 10)

    return { label, returns, confidence }
  }

  /**
   * Create training samples with proper time-based splitting
   * 
   * This method creates training samples while respecting:
   * 1. Temporal ordering (no shuffling)
   * 2. Embargo periods between train and test
   * 3. Label leakage validation
   * 
   * @param samples - Raw training samples
   * @returns Train and test samples with proper temporal separation
   */
  createTimeBasedSplit(
    samples: TrainingSample[]
  ): {
    trainSamples: TrainingSample[]
    testSamples: TrainingSample[]
    embargoSamples: TrainingSample[]
    validation: {
      valid: boolean
      issues: string[]
    }
  } {
    if (samples.length < 10) {
      return {
        trainSamples: samples,
        testSamples: [],
        embargoSamples: [],
        validation: { valid: false, issues: ['Not enough samples for splitting'] }
      }
    }

    // Sort by timestamp
    const sortedSamples = [...samples].sort((a, b) => a.timestamp - b.timestamp)

    // Calculate split points
    const trainSize = Math.floor(sortedSamples.length * this.config.timeSplitConfig.trainRatio)
    const embargoBars = this.config.timeSplitConfig.embargoBars
    const purgeBars = this.config.timeSplitConfig.purgeBars

    const trainEnd = trainSize - purgeBars
    const testStart = trainSize + embargoBars + purgeBars

    // Split samples
    const trainSamples = sortedSamples.slice(0, trainEnd)
    const embargoSamples = sortedSamples.slice(trainEnd, testStart)
    const testSamples = sortedSamples.slice(testStart)

    // Validate for label leakage
    let validation = { valid: true, issues: [] as string[] }
    
    if (this.config.validateForLeakage) {
      const validator = getTrainingDataValidator()
      const leakageResult = validator.checkLabelLeakage(sortedSamples)
      
      if (leakageResult.hasLeakage) {
        validation = {
          valid: leakageResult.severity !== 'critical',
          issues: leakageResult.issues.map(i => i.description)
        }
      }
    }

    return {
      trainSamples,
      testSamples,
      embargoSamples,
      validation
    }
  }

  /**
   * Create walk-forward validation splits
   * 
   * Walk-forward validation is the gold standard for financial ML.
   * It simulates real trading by training on past data and testing on future.
   * 
   * @param samples - Sorted training samples
   * @returns Array of walk-forward folds
   */
  createWalkForwardSplits(samples: TrainingSample[]): Array<{
    foldIndex: number
    trainSamples: TrainingSample[]
    testSamples: TrainingSample[]
    embargoSamples: TrainingSample[]
  }> {
    if (samples.length < 20 || !this.config.walkForwardConfig) {
      return []
    }

    const validator = getTrainingDataValidator()
    const sortedSamples = [...samples].sort((a, b) => a.timestamp - b.timestamp)
    
    const wfConfig: WalkForwardConfig = {
      type: this.config.walkForwardConfig.type || 'expanding',
      initialTrainWindow: this.config.walkForwardConfig.initialTrainWindow || Math.floor(sortedSamples.length * 0.5),
      testWindow: this.config.walkForwardConfig.testWindow || Math.floor(sortedSamples.length * 0.1),
      stepSize: this.config.walkForwardConfig.stepSize || Math.floor(sortedSamples.length * 0.1),
      embargoBars: this.config.timeSplitConfig.embargoBars,
      purgeBars: this.config.timeSplitConfig.purgeBars,
    }

    const result = validator.generateWalkForwardFolds(
      sortedSamples.map((s, i) => ({ ...s, index: i })),
      wfConfig
    )

    return result.folds.map(fold => ({
      foldIndex: fold.foldIndex,
      trainSamples: fold.trainIndices.map(i => sortedSamples[i]),
      testSamples: fold.testIndices.map(i => sortedSamples[i]),
      embargoSamples: sortedSamples.slice(
        fold.trainIndices[fold.trainIndices.length - 1] + 1,
        fold.testIndices[0]
      )
    }))
  }

  /**
   * Validate training data for label leakage
   * 
   * This method performs comprehensive validation of training data
   * to detect potential label leakage issues.
   */
  async validateTrainingData(samples: TrainingSample[]): Promise<{
    valid: boolean
    score: number
    issues: string[]
    recommendations: string[]
  }> {
    const validator = getTrainingDataValidator()
    const result = validator.validateTrainingData(samples)

    return {
      valid: result.valid,
      score: result.score,
      issues: [
        ...result.labelLeakage.issues.map(i => `[${i.severity}] ${i.description}`),
        ...result.timeOrder.issues
      ],
      recommendations: result.recommendations
    }
  }

  /**
   * Train classifier with proper time-based splitting
   * 
   * This method ensures proper temporal separation between
   * training and validation data.
   */
  async trainClassifierSafe(samples: TrainingSample[]): Promise<{
    success: boolean
    trainSize: number
    testSize: number
    metrics?: {
      trainAccuracy: number
      testAccuracy: number
      overfittingDetected: boolean
    }
    issues: string[]
  }> {
    const issues: string[] = []

    // Validate data first
    if (this.config.validateForLeakage) {
      const validation = await this.validateTrainingData(samples)
      if (!validation.valid) {
        return {
          success: false,
          trainSize: 0,
          testSize: 0,
          issues: [...validation.issues, 'Training data validation failed']
        }
      }
    }

    // Create proper time-based split
    const { trainSamples, testSamples, validation } = this.createTimeBasedSplit(samples)
    
    if (!validation.valid) {
      issues.push(...validation.issues)
    }

    if (trainSamples.length < this.config.minSamplesForTraining) {
      return {
        success: false,
        trainSize: trainSamples.length,
        testSize: testSamples.length,
        issues: [`Not enough training samples: ${trainSamples.length} < ${this.config.minSamplesForTraining}`]
      }
    }

    // Train on training data only
    const classifier = getLawrenceClassifier()
    classifier.clear()
    classifier.trainBatch(trainSamples)

    // Evaluate on both train and test
    let trainCorrect = 0
    let testCorrect = 0

    for (const sample of trainSamples) {
      const prediction = classifier.predict(sample.features)
      if (prediction.direction === sample.label) {
        trainCorrect++
      }
    }

    for (const sample of testSamples) {
      const prediction = classifier.predict(sample.features)
      if (prediction.direction === sample.label) {
        testCorrect++
      }
    }

    const trainAccuracy = trainSamples.length > 0 ? trainCorrect / trainSamples.length : 0
    const testAccuracy = testSamples.length > 0 ? testCorrect / testSamples.length : 0
    const overfittingDetected = trainAccuracy > testAccuracy + 0.15

    if (overfittingDetected) {
      issues.push(`Potential overfitting detected: train accuracy (${(trainAccuracy * 100).toFixed(1)}%) much higher than test (${(testAccuracy * 100).toFixed(1)}%)`)
    }

    // Save training record
    await this.saveTrainingRecord(trainSamples.length, {
      totalSamples: trainSamples.length,
      winRate: trainAccuracy
    })

    return {
      success: true,
      trainSize: trainSamples.length,
      testSize: testSamples.length,
      metrics: {
        trainAccuracy,
        testAccuracy,
        overfittingDetected
      },
      issues
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let collectorInstance: TrainingDataCollector | null = null

/**
 * Get Training Data Collector instance
 */
export function getTrainingDataCollector(config?: Partial<CollectionConfig>): TrainingDataCollector {
  if (!collectorInstance) {
    collectorInstance = new TrainingDataCollector(config)
  } else if (config) {
    collectorInstance.setConfig(config)
  }
  return collectorInstance
}

/**
 * Reset the singleton instance
 */
export function resetTrainingDataCollector(): void {
  collectorInstance = null
}

export default TrainingDataCollector
