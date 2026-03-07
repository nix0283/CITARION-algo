/**
 * Safe Feature Engineer
 * 
 * Feature engineering with built-in look-ahead bias protection.
 * Ensures all features are calculated using only data available at prediction time.
 */

import type {
  OHLCV,
  Orderbook,
  FeatureSet,
  FeatureCalculationConfig,
  LookAheadValidationResult,
  LookAheadIssue,
  SafeFeatureSet,
  AvailableFeaturesAtTime,
  FeatureValidationStats,
} from './types'

/**
 * Safe Feature Engineer with Look-Ahead Protection
 * 
 * This class wraps the feature engineering process with safety checks to prevent
 * look-ahead bias. All features are validated to ensure they only use historical
 * data available at the time of prediction.
 */
export class SafeFeatureEngineer {
  private featureConfigs: Map<string, FeatureCalculationConfig> = new Map()
  private validationCache: Map<string, boolean> = new Map()

  constructor(configs?: FeatureCalculationConfig[]) {
    if (configs) {
      configs.forEach((c) => this.featureConfigs.set(c.name, c))
    } else {
      this.initializeDefaultSafeFeatures()
    }
  }

  /**
   * Initialize default features with proper look-ahead protection
   */
  private initializeDefaultSafeFeatures(): void {
    const defaultFeatures: FeatureCalculationConfig[] = [
      // Price-based features - no look-ahead
      { 
        name: 'returns', 
        type: 'technical', 
        maxLookback: 1, 
        usesFutureData: false, 
        params: { period: 1 }, 
        enabled: true,
        dataDescription: 'Returns calculated from previous close to current close'
      },
      { 
        name: 'log_returns', 
        type: 'technical', 
        maxLookback: 1, 
        usesFutureData: false, 
        params: { period: 1 }, 
        enabled: true,
        dataDescription: 'Log returns from previous close to current close'
      },
      
      // Moving averages - lookback only
      { 
        name: 'sma_5', 
        type: 'technical', 
        maxLookback: 5, 
        usesFutureData: false, 
        params: { period: 5 }, 
        enabled: true,
        dataDescription: '5-period simple moving average'
      },
      { 
        name: 'sma_10', 
        type: 'technical', 
        maxLookback: 10, 
        usesFutureData: false, 
        params: { period: 10 }, 
        enabled: true 
      },
      { 
        name: 'sma_20', 
        type: 'technical', 
        maxLookback: 20, 
        usesFutureData: false, 
        params: { period: 20 }, 
        enabled: true 
      },
      { 
        name: 'sma_50', 
        type: 'technical', 
        maxLookback: 50, 
        usesFutureData: false, 
        params: { period: 50 }, 
        enabled: true 
      },
      { 
        name: 'ema_5', 
        type: 'technical', 
        maxLookback: 5, 
        usesFutureData: false, 
        params: { period: 5 }, 
        enabled: true 
      },
      { 
        name: 'ema_10', 
        type: 'technical', 
        maxLookback: 10, 
        usesFutureData: false, 
        params: { period: 10 }, 
        enabled: true 
      },
      { 
        name: 'ema_20', 
        type: 'technical', 
        maxLookback: 20, 
        usesFutureData: false, 
        params: { period: 20 }, 
        enabled: true 
      },
      { 
        name: 'ema_50', 
        type: 'technical', 
        maxLookback: 50, 
        usesFutureData: false, 
        params: { period: 50 }, 
        enabled: true 
      },
      
      // Momentum indicators
      { 
        name: 'rsi_14', 
        type: 'technical', 
        maxLookback: 15, 
        usesFutureData: false, 
        params: { period: 14 }, 
        enabled: true,
        dataDescription: '14-period RSI using only historical closes'
      },
      { 
        name: 'rsi_7', 
        type: 'technical', 
        maxLookback: 8, 
        usesFutureData: false, 
        params: { period: 7 }, 
        enabled: true 
      },
      { 
        name: 'macd', 
        type: 'technical', 
        maxLookback: 35, 
        usesFutureData: false, 
        params: { fast: 12, slow: 26, signal: 9 }, 
        enabled: true,
        dataDescription: 'MACD using slow period (26) + signal period (9) = 35 bars max lookback'
      },
      
      // Volatility indicators
      { 
        name: 'atr_14', 
        type: 'technical', 
        maxLookback: 14, 
        usesFutureData: false, 
        params: { period: 14 }, 
        enabled: true 
      },
      { 
        name: 'bb_upper', 
        type: 'technical', 
        maxLookback: 20, 
        usesFutureData: false, 
        params: { period: 20, stdDev: 2 }, 
        enabled: true 
      },
      { 
        name: 'bb_lower', 
        type: 'technical', 
        maxLookback: 20, 
        usesFutureData: false, 
        params: { period: 20, stdDev: 2 }, 
        enabled: true 
      },
      
      // Volume indicators
      { 
        name: 'volume_sma', 
        type: 'technical', 
        maxLookback: 20, 
        usesFutureData: false, 
        params: { period: 20 }, 
        enabled: true 
      },
      { 
        name: 'obv', 
        type: 'technical', 
        maxLookback: 1, 
        usesFutureData: false, 
        params: {}, 
        enabled: true,
        dataDescription: 'On-balance volume calculated incrementally'
      },
      
      // Lag features - explicitly lagged
      { 
        name: 'lag_returns_1', 
        type: 'lag', 
        maxLookback: 2, 
        usesFutureData: false, 
        params: { lag: 1 }, 
        enabled: true,
        dataDescription: 'Returns from 1 bar ago (t-1 to t-2)'
      },
      { 
        name: 'lag_returns_2', 
        type: 'lag', 
        maxLookback: 3, 
        usesFutureData: false, 
        params: { lag: 2 }, 
        enabled: true 
      },
      { 
        name: 'lag_returns_3', 
        type: 'lag', 
        maxLookback: 4, 
        usesFutureData: false, 
        params: { lag: 3 }, 
        enabled: true 
      },
      
      // Rolling statistics
      { 
        name: 'rolling_mean_10', 
        type: 'rolling', 
        maxLookback: 10, 
        usesFutureData: false, 
        params: { period: 10, stat: 'mean' }, 
        enabled: true 
      },
      { 
        name: 'rolling_std_10', 
        type: 'rolling', 
        maxLookback: 10, 
        usesFutureData: false, 
        params: { period: 10, stat: 'std' }, 
        enabled: true 
      },
      
      // Time features - no data dependency
      { 
        name: 'hour', 
        type: 'time', 
        maxLookback: 0, 
        usesFutureData: false, 
        params: {}, 
        enabled: true,
        dataDescription: 'Hour of day - no look-ahead risk'
      },
      { 
        name: 'day_of_week', 
        type: 'time', 
        maxLookback: 0, 
        usesFutureData: false, 
        params: {}, 
        enabled: true 
      },
    ]

    defaultFeatures.forEach((f) => this.featureConfigs.set(f.name, f))
  }

  /**
   * Generate features with look-ahead protection
   * 
   * This is the main method for safe feature generation. It ensures:
   * 1. Features are calculated only using data up to the current bar
   * 2. Each feature's maxLookback is respected
   * 3. Future data is never accessed
   * 
   * @param ohlcv - Historical OHLCV data
   * @param currentBarIndex - Index of the current bar (features calculated up to this point)
   * @param orderbook - Optional orderbook data (must be from current time)
   */
  generateFeaturesSafe(
    ohlcv: OHLCV[],
    currentBarIndex: number,
    orderbook?: Orderbook
  ): SafeFeatureSet {
    // Validate inputs
    if (currentBarIndex < 0 || currentBarIndex >= ohlcv.length) {
      throw new Error(`Invalid bar index: ${currentBarIndex}. Must be between 0 and ${ohlcv.length - 1}`)
    }

    // Check for future data in orderbook
    if (orderbook && orderbook.timestamp > ohlcv[currentBarIndex].timestamp) {
      throw new Error('Orderbook timestamp is in the future relative to current bar')
    }

    const validFeatures: string[] = []
    const invalidFeatures: string[] = []
    const features: Record<string, number> = {}

    // Get only the historical data up to current bar
    const historicalData = ohlcv.slice(0, currentBarIndex + 1)
    const closes = historicalData.map((o) => o.close)
    const highs = historicalData.map((o) => o.high)
    const lows = historicalData.map((o) => o.low)
    const volumes = historicalData.map((o) => o.volume)
    const currentCandle = historicalData[historicalData.length - 1]

    // Calculate each enabled feature
    for (const [name, config] of this.featureConfigs) {
      if (!config.enabled) continue

      // Check if we have enough historical data
      if (historicalData.length < config.maxLookback) {
        invalidFeatures.push(name)
        continue
      }

      // Skip features that use future data
      if (config.usesFutureData) {
        console.warn(`[SafeFeatureEngineer] Skipping feature "${name}" - uses future data`)
        invalidFeatures.push(name)
        continue
      }

      try {
        const value = this.calculateFeatureValue(name, config, {
          closes,
          highs,
          lows,
          volumes,
          currentBarIndex,
          currentCandle,
          historicalData,
        })

        if (value !== null && !isNaN(value) && isFinite(value)) {
          features[name] = value
          validFeatures.push(name)
        } else {
          invalidFeatures.push(name)
        }
      } catch (error) {
        console.warn(`[SafeFeatureEngineer] Error calculating feature "${name}":`, error)
        invalidFeatures.push(name)
      }
    }

    // Add time features (no look-ahead risk)
    features.hour = new Date(currentCandle.timestamp).getHours()
    features.day_of_week = new Date(currentCandle.timestamp).getDay()
    if (!validFeatures.includes('hour')) validFeatures.push('hour')
    if (!validFeatures.includes('day_of_week')) validFeatures.push('day_of_week')

    // Add orderbook features if available
    if (orderbook) {
      const obFeatures = this.generateOrderbookFeatures(orderbook)
      Object.assign(features, obFeatures)
    }

    return {
      timestamp: currentCandle.timestamp,
      barIndex: currentBarIndex,
      features,
      isValid: invalidFeatures.length === 0,
      validFeatures,
      invalidFeatures,
      validatedAt: Date.now(),
    }
  }

  /**
   * Generate all feature sets for a time series with look-ahead protection
   */
  generateAllFeaturesSafe(ohlcv: OHLCV[], orderbooks?: Map<number, Orderbook>): SafeFeatureSet[] {
    const results: SafeFeatureSet[] = []
    const maxLookback = this.getMaxLookback()

    // Start from the first bar where all features can be calculated
    const startIndex = maxLookback

    for (let i = startIndex; i < ohlcv.length; i++) {
      const orderbook = orderbooks?.get(ohlcv[i].timestamp)
      const featureSet = this.generateFeaturesSafe(ohlcv, i, orderbook)
      results.push(featureSet)
    }

    return results
  }

  /**
   * Calculate a single feature value using only historical data
   */
  private calculateFeatureValue(
    name: string,
    config: FeatureCalculationConfig,
    data: {
      closes: number[]
      highs: number[]
      lows: number[]
      volumes: number[]
      currentBarIndex: number
      currentCandle: OHLCV
      historicalData: OHLCV[]
    }
  ): number | null {
    const { closes, highs, lows, volumes, currentCandle } = data
    const currentPrice = currentCandle.close

    switch (name) {
      case 'returns': {
        const period = config.params.period as number
        const prevClose = closes[closes.length - 1 - period]
        return prevClose ? (currentPrice - prevClose) / prevClose : 0
      }

      case 'log_returns': {
        const period = config.params.period as number
        const prevClose = closes[closes.length - 1 - period]
        return prevClose ? Math.log(currentPrice / prevClose) : 0
      }

      case 'sma_5':
      case 'sma_10':
      case 'sma_20':
      case 'sma_50': {
        const period = config.params.period as number
        return this.calculateSMA(closes, period)
      }

      case 'ema_5':
      case 'ema_10':
      case 'ema_20':
      case 'ema_50': {
        const period = config.params.period as number
        return this.calculateEMA(closes, period)
      }

      case 'rsi_14':
      case 'rsi_7': {
        const period = config.params.period as number
        return this.calculateRSI(closes, period)
      }

      case 'macd': {
        const fast = config.params.fast as number
        const slow = config.params.slow as number
        const signal = config.params.signal as number
        const macd = this.calculateMACD(closes, fast, slow, signal)
        return macd.macd
      }

      case 'macd_signal': {
        const fast = config.params.fast as number
        const slow = config.params.slow as number
        const signal = config.params.signal as number
        const macd = this.calculateMACD(closes, fast, slow, signal)
        return macd.signal
      }

      case 'macd_histogram': {
        const fast = config.params.fast as number
        const slow = config.params.slow as number
        const signal = config.params.signal as number
        const macd = this.calculateMACD(closes, fast, slow, signal)
        return macd.histogram
      }

      case 'atr_14': {
        const period = config.params.period as number
        return this.calculateATR(highs, lows, closes, period)
      }

      case 'bb_upper': {
        const period = config.params.period as number
        const stdDev = config.params.stdDev as number
        const bb = this.calculateBollingerBands(closes, period, stdDev)
        return bb.upper
      }

      case 'bb_lower': {
        const period = config.params.period as number
        const stdDev = config.params.stdDev as number
        const bb = this.calculateBollingerBands(closes, period, stdDev)
        return bb.lower
      }

      case 'bb_width': {
        const period = config.params.period as number
        const stdDev = config.params.stdDev as number
        const bb = this.calculateBollingerBands(closes, period, stdDev)
        return bb.width
      }

      case 'bb_position': {
        const period = config.params.period as number
        const stdDev = config.params.stdDev as number
        const bb = this.calculateBollingerBands(closes, period, stdDev)
        return bb.position
      }

      case 'volume_sma': {
        const period = config.params.period as number
        return this.calculateSMA(volumes, period)
      }

      case 'volume_ratio': {
        const period = config.params.period as number
        const volSma = this.calculateSMA(volumes, period)
        return volSma > 0 ? currentCandle.volume / volSma : 1
      }

      case 'obv': {
        return this.calculateOBV(closes, volumes)
      }

      case 'lag_returns_1':
      case 'lag_returns_2':
      case 'lag_returns_3': {
        const lag = config.params.lag as number
        if (closes.length < lag + 2) return null
        const prevClose = closes[closes.length - 1 - lag]
        const prevPrevClose = closes[closes.length - 2 - lag]
        return prevPrevClose ? (prevClose - prevPrevClose) / prevPrevClose : 0
      }

      case 'rolling_mean_10':
      case 'rolling_mean_20': {
        const period = config.params.period as number
        return this.calculateSMA(closes, period)
      }

      case 'rolling_std_10':
      case 'rolling_std_20': {
        const period = config.params.period as number
        return this.calculateRollingStd(closes, period)
      }

      default:
        return null
    }
  }

  /**
   * Generate orderbook features
   */
  generateOrderbookFeatures(orderbook: Orderbook): Record<string, number> {
    const { bids, asks } = orderbook
    
    if (!bids.length || !asks.length) return {}

    const bestBid = bids[0].price
    const bestAsk = asks[0].price
    const spread = bestAsk - bestBid
    const midPrice = (bestBid + bestAsk) / 2
    const spreadBps = (spread / midPrice) * 10000

    const bidVolume = bids.reduce((sum, b) => sum + b.quantity, 0)
    const askVolume = asks.reduce((sum, a) => sum + a.quantity, 0)
    const imbalance = (bidVolume - askVolume) / (bidVolume + askVolume)

    const weightedBidPrice = bids.reduce((sum, b) => sum + b.price * b.quantity, 0) / bidVolume
    const weightedAskPrice = asks.reduce((sum, a) => sum + a.price * a.quantity, 0) / askVolume

    return {
      spread,
      spread_bps: spreadBps,
      mid_price: midPrice,
      bid_ask_imbalance: imbalance,
      bid_volume: bidVolume,
      ask_volume: askVolume,
      weighted_bid_price: weightedBidPrice,
      weighted_ask_price: weightedAskPrice,
      depth_ratio: bidVolume / askVolume
    }
  }

  // ==================== TECHNICAL INDICATORS ====================

  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1]
    const slice = values.slice(-period)
    return slice.reduce((a, b) => a + b, 0) / period
  }

  private calculateEMA(values: number[], period: number): number {
    if (values.length === 0) return 0
    
    const multiplier = 2 / (period + 1)
    let ema = values[0]
    
    for (let i = 1; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema
    }
    
    return ema
  }

  private calculateRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50

    let gains = 0
    let losses = 0

    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1]
      if (change > 0) gains += change
      else losses += Math.abs(change)
    }

    const avgGain = gains / period
    const avgLoss = losses / period

    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - 100 / (1 + rs)
  }

  private calculateMACD(
    prices: number[],
    fast: number,
    slow: number,
    signal: number
  ): { macd: number; signal: number; histogram: number } {
    const fastEMA = this.calculateEMA(prices, fast)
    const slowEMA = this.calculateEMA(prices, slow)
    const macd = fastEMA - slowEMA

    // For signal line, we need to calculate EMA of MACD values
    // This is an approximation - in production, you'd track MACD history
    const signalLine = macd * 0.8 // Simplified approximation
    const histogram = macd - signalLine

    return { macd, signal: signalLine, histogram }
  }

  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
    if (highs.length < period + 1) return highs[highs.length - 1] - lows[lows.length - 1]

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

  private calculateBollingerBands(
    prices: number[],
    period: number,
    stdDev: number
  ): { upper: number; lower: number; width: number; position: number } {
    const sma = this.calculateSMA(prices, period)
    const std = this.calculateRollingStd(prices, period)
    const currentPrice = prices[prices.length - 1]

    const upper = sma + std * stdDev
    const lower = sma - std * stdDev
    const width = sma > 0 ? (upper - lower) / sma : 0
    const position = (upper - lower) > 0 ? (currentPrice - lower) / (upper - lower) : 0.5

    return { upper, lower, width, position }
  }

  private calculateOBV(closes: number[], volumes: number[]): number {
    let obv = volumes[0]
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i]
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i]
      }
    }
    return obv
  }

  private calculateRollingStd(values: number[], period: number): number {
    if (values.length < period) return 0
    const slice = values.slice(-period)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const squaredDiffs = slice.map((v) => Math.pow(v - mean, 2))
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / period)
  }

  // ==================== VALIDATION METHODS ====================

  /**
   * Validate that no look-ahead bias exists in the feature configurations
   */
  validateNoLookahead(): LookAheadValidationResult {
    const issues: LookAheadIssue[] = []
    const safeFeatures: string[] = []
    const unsafeFeatures: string[] = []

    for (const [name, config] of this.featureConfigs) {
      if (!config.enabled) continue

      // Check if feature uses future data
      if (config.usesFutureData) {
        issues.push({
          featureName: name,
          issueType: 'uses_future_data',
          description: `Feature "${name}" is configured to use future data`,
          severity: 'critical',
          suggestion: 'Disable this feature or modify calculation to use only historical data',
        })
        unsafeFeatures.push(name)
        continue
      }

      // Validate maxLookback
      if (config.maxLookback < 0) {
        issues.push({
          featureName: name,
          issueType: 'lookback_exceeded',
          description: `Feature "${name}" has invalid maxLookback: ${config.maxLookback}`,
          severity: 'critical',
          suggestion: 'Set maxLookback to a non-negative value',
        })
        unsafeFeatures.push(name)
        continue
      }

      safeFeatures.push(name)
    }

    return {
      valid: issues.filter((i) => i.severity === 'critical').length === 0,
      issues,
      safeFeatures,
      unsafeFeatures,
    }
  }

  /**
   * Get available features at a specific point in time
   */
  getAvailableFeaturesAtTime(ohlcv: OHLCV[], barIndex: number): AvailableFeaturesAtTime {
    const availableFeatures: string[] = []
    const unavailableFeatures: string[] = []
    const partialFeatures: string[] = []

    const barsAvailable = barIndex + 1

    for (const [name, config] of this.featureConfigs) {
      if (!config.enabled) continue

      if (config.usesFutureData) {
        unavailableFeatures.push(name)
        continue
      }

      if (barsAvailable >= config.maxLookback) {
        availableFeatures.push(name)
      } else if (barsAvailable >= Math.ceil(config.maxLookback * 0.5)) {
        partialFeatures.push(name)
      } else {
        unavailableFeatures.push(name)
      }
    }

    return {
      timestamp: ohlcv[barIndex].timestamp,
      barIndex,
      availableFeatures,
      unavailableFeatures,
      partialFeatures,
    }
  }

  /**
   * Get the maximum lookback period across all enabled features
   */
  getMaxLookback(): number {
    let maxLookback = 0
    for (const config of this.featureConfigs.values()) {
      if (config.enabled && config.maxLookback > maxLookback) {
        maxLookback = config.maxLookback
      }
    }
    return maxLookback
  }

  /**
   * Get feature validation statistics
   */
  getValidationStats(): FeatureValidationStats {
    const validation = this.validateNoLookahead()
    return {
      totalFeatures: this.featureConfigs.size,
      validFeatures: validation.safeFeatures.length,
      invalidFeatures: validation.unsafeFeatures.length,
      featuresWithLookAhead: validation.issues.filter(
        (i) => i.issueType === 'uses_future_data'
      ).length,
      featuresWithInsufficientHistory: 0,
      validationTimestamp: Date.now(),
      issues: validation.issues,
    }
  }

  // ==================== CONFIGURATION METHODS ====================

  /**
   * Add a custom feature with validation
   */
  addFeature(config: FeatureCalculationConfig): void {
    // Validate configuration
    if (config.usesFutureData) {
      console.warn(
        `[SafeFeatureEngineer] Warning: Feature "${config.name}" uses future data. ` +
        'This may introduce look-ahead bias.'
      )
    }
    this.featureConfigs.set(config.name, { ...config, validated: true })
  }

  /**
   * Remove a feature
   */
  removeFeature(name: string): void {
    this.featureConfigs.delete(name)
  }

  /**
   * Enable or disable a feature
   */
  setFeatureEnabled(name: string, enabled: boolean): void {
    const config = this.featureConfigs.get(name)
    if (config) {
      config.enabled = enabled
    }
  }

  /**
   * Get all enabled features
   */
  getEnabledFeatures(): string[] {
    return Array.from(this.featureConfigs.values())
      .filter((c) => c.enabled)
      .map((c) => c.name)
  }

  /**
   * Get all feature configurations
   */
  getAllFeatureConfigs(): FeatureCalculationConfig[] {
    return Array.from(this.featureConfigs.values())
  }

  /**
   * Get feature configuration by name
   */
  getFeatureConfig(name: string): FeatureCalculationConfig | undefined {
    return this.featureConfigs.get(name)
  }
}

// Singleton instance
let safeFeatureEngineerInstance: SafeFeatureEngineer | null = null

/**
 * Get the singleton SafeFeatureEngineer instance
 */
export function getSafeFeatureEngineer(): SafeFeatureEngineer {
  if (!safeFeatureEngineerInstance) {
    safeFeatureEngineerInstance = new SafeFeatureEngineer()
  }
  return safeFeatureEngineerInstance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetSafeFeatureEngineer(): void {
  safeFeatureEngineerInstance = null
}

export default SafeFeatureEngineer
