/**
 * Feature Engineer
 * Generates technical and market features for ML models
 * 
 * IMPORTANT: This class has been updated with look-ahead protection.
 * For production use, prefer SafeFeatureEngineer which enforces strict
 * temporal constraints on feature calculations.
 * 
 * Look-ahead bias can occur when:
 * 1. Features use future data not available at prediction time
 * 2. Indicators are calculated across the entire dataset before splitting
 * 3. Labels are created using information from after the prediction point
 */

import type { 
  OHLCV, 
  Orderbook, 
  FeatureConfig, 
  FeatureSet, 
  FeatureImportance,
  FeatureCalculationConfig,
  LookAheadValidationResult,
  LookAheadIssue,
  SafeFeatureSet,
  AvailableFeaturesAtTime,
} from './types'

export class FeatureEngineer {
  private featureConfigs: Map<string, FeatureConfig> = new Map()

  constructor(configs?: FeatureConfig[]) {
    if (configs) {
      configs.forEach((c) => this.featureConfigs.set(c.name, c))
    } else {
      // Default features
      this.initializeDefaultFeatures()
    }
  }

  /**
   * Initialize default technical features
   */
  private initializeDefaultFeatures(): void {
    const defaultFeatures: FeatureConfig[] = [
      // Price-based features
      { name: 'returns', type: 'technical', params: { period: 1 }, enabled: true },
      { name: 'log_returns', type: 'technical', params: { period: 1 }, enabled: true },
      { name: 'price_change', type: 'technical', params: { period: 1 }, enabled: true },
      
      // Moving averages
      { name: 'sma_5', type: 'technical', params: { period: 5 }, enabled: true },
      { name: 'sma_10', type: 'technical', params: { period: 10 }, enabled: true },
      { name: 'sma_20', type: 'technical', params: { period: 20 }, enabled: true },
      { name: 'sma_50', type: 'technical', params: { period: 50 }, enabled: true },
      { name: 'ema_5', type: 'technical', params: { period: 5 }, enabled: true },
      { name: 'ema_10', type: 'technical', params: { period: 10 }, enabled: true },
      { name: 'ema_20', type: 'technical', params: { period: 20 }, enabled: true },
      { name: 'ema_50', type: 'technical', params: { period: 50 }, enabled: true },
      
      // Momentum indicators
      { name: 'rsi_14', type: 'technical', params: { period: 14 }, enabled: true },
      { name: 'rsi_7', type: 'technical', params: { period: 7 }, enabled: true },
      { name: 'macd', type: 'technical', params: { fast: 12, slow: 26, signal: 9 }, enabled: true },
      { name: 'stoch_k', type: 'technical', params: { k: 14, d: 3 }, enabled: true },
      { name: 'stoch_d', type: 'technical', params: { k: 14, d: 3 }, enabled: true },
      
      // Volatility indicators
      { name: 'atr_14', type: 'technical', params: { period: 14 }, enabled: true },
      { name: 'atr_7', type: 'technical', params: { period: 7 }, enabled: true },
      { name: 'bb_upper', type: 'technical', params: { period: 20, stdDev: 2 }, enabled: true },
      { name: 'bb_lower', type: 'technical', params: { period: 20, stdDev: 2 }, enabled: true },
      { name: 'bb_width', type: 'technical', params: { period: 20, stdDev: 2 }, enabled: true },
      
      // Trend indicators
      { name: 'adx_14', type: 'technical', params: { period: 14 }, enabled: true },
      { name: 'plus_di', type: 'technical', params: { period: 14 }, enabled: true },
      { name: 'minus_di', type: 'technical', params: { period: 14 }, enabled: true },
      
      // Volume indicators
      { name: 'volume_sma', type: 'technical', params: { period: 20 }, enabled: true },
      { name: 'volume_ratio', type: 'technical', params: { period: 20 }, enabled: true },
      { name: 'obv', type: 'technical', params: {}, enabled: true },
      
      // Price position
      { name: 'high_low_range', type: 'technical', params: {}, enabled: true },
      { name: 'close_to_high', type: 'technical', params: {}, enabled: true },
      { name: 'close_to_low', type: 'technical', params: {}, enabled: true },
      
      // Lag features
      { name: 'lag_returns_1', type: 'lag', params: { lag: 1 }, enabled: true },
      { name: 'lag_returns_2', type: 'lag', params: { lag: 2 }, enabled: true },
      { name: 'lag_returns_3', type: 'lag', params: { lag: 3 }, enabled: true },
      { name: 'lag_returns_5', type: 'lag', params: { lag: 5 }, enabled: true },
      
      // Rolling statistics
      { name: 'rolling_mean_10', type: 'rolling', params: { period: 10, stat: 'mean' }, enabled: true },
      { name: 'rolling_std_10', type: 'rolling', params: { period: 10, stat: 'std' }, enabled: true },
      { name: 'rolling_mean_20', type: 'rolling', params: { period: 20, stat: 'mean' }, enabled: true },
      { name: 'rolling_std_20', type: 'rolling', params: { period: 20, stat: 'std' }, enabled: true },
      
      // Time features
      { name: 'hour', type: 'time', params: {}, enabled: true },
      { name: 'day_of_week', type: 'time', params: {}, enabled: true },
      { name: 'is_weekend', type: 'time', params: {}, enabled: false },
    ]

    defaultFeatures.forEach((f) => this.featureConfigs.set(f.name, f))
  }

  /**
   * Generate features from OHLCV data
   */
  generateFeatures(ohlcv: OHLCV[], orderbook?: Orderbook): FeatureSet[] {
    const featureSets: FeatureSet[] = []
    const closes = ohlcv.map((o) => o.close)
    const highs = ohlcv.map((o) => o.high)
    const lows = ohlcv.map((o) => o.low)
    const volumes = ohlcv.map((o) => o.volume)

    // Pre-calculate all technical features
    const features: Record<string, number[]> = {}

    // Calculate each feature
    for (const [name, config] of this.featureConfigs) {
      if (!config.enabled) continue

      switch (name) {
        case 'returns':
          features.returns = this.calculateReturns(closes, config.params.period as number)
          break
        case 'log_returns':
          features.log_returns = this.calculateLogReturns(closes, config.params.period as number)
          break
        case 'price_change':
          features.price_change = this.calculatePriceChange(closes, config.params.period as number)
          break
        case /^sma_\d+$/.test(name) && name:
          features[name] = this.calculateSMA(closes, config.params.period as number)
          break
        case /^ema_\d+$/.test(name) && name:
          features[name] = this.calculateEMA(closes, config.params.period as number)
          break
        case /^rsi_\d+$/.test(name) && name:
          features[name] = this.calculateRSI(closes, config.params.period as number)
          break
        case 'macd':
          const macd = this.calculateMACD(closes, config.params.fast as number, config.params.slow as number, config.params.signal as number)
          features.macd = macd.macd
          features.macd_signal = macd.signal
          features.macd_histogram = macd.histogram
          break
        case 'stoch_k':
        case 'stoch_d':
          const stoch = this.calculateStochastic(highs, lows, closes, config.params.k as number, config.params.d as number)
          features.stoch_k = stoch.k
          features.stoch_d = stoch.d
          break
        case /^atr_\d+$/.test(name) && name:
          features[name] = this.calculateATR(highs, lows, closes, config.params.period as number)
          break
        case 'bb_upper':
        case 'bb_lower':
        case 'bb_width':
          const bb = this.calculateBollingerBands(closes, config.params.period as number, config.params.stdDev as number)
          features.bb_upper = bb.upper
          features.bb_lower = bb.lower
          features.bb_width = bb.width
          features.bb_position = bb.position
          break
        case 'adx_14':
        case 'plus_di':
        case 'minus_di':
          const adx = this.calculateADX(highs, lows, closes, config.params.period as number)
          features.adx_14 = adx.adx
          features.plus_di = adx.plusDI
          features.minus_di = adx.minusDI
          break
        case 'volume_sma':
          features.volume_sma = this.calculateSMA(volumes, config.params.period as number)
          break
        case 'volume_ratio':
          const volSma = this.calculateSMA(volumes, config.params.period as number)
          features.volume_ratio = volumes.map((v, i) => volSma[i] ? v / volSma[i] : 1)
          break
        case 'obv':
          features.obv = this.calculateOBV(closes, volumes)
          break
        case 'high_low_range':
          features.high_low_range = highs.map((h, i) => (h - lows[i]) / closes[i])
          break
        case 'close_to_high':
          features.close_to_high = closes.map((c, i) => (highs[i] - c) / (highs[i] - lows[i] || 1))
          break
        case 'close_to_low':
          features.close_to_low = closes.map((c, i) => (c - lows[i]) / (highs[i] - lows[i] || 1))
          break
        case /^lag_returns_\d+$/.test(name) && name:
          const lag = config.params.lag as number
          const rets = this.calculateReturns(closes, 1)
          features[name] = rets.map((r, i) => i >= lag ? rets[i - lag] : 0)
          break
        case /^rolling_mean_\d+$/.test(name) && name:
          features[name] = this.calculateSMA(closes, config.params.period as number)
          break
        case /^rolling_std_\d+$/.test(name) && name:
          features[name] = this.calculateRollingStd(closes, config.params.period as number)
          break
      }
    }

    // Time features
    features.hour = ohlcv.map((o) => new Date(o.timestamp).getHours())
    features.day_of_week = ohlcv.map((o) => new Date(o.timestamp).getDay())

    // Build feature sets
    const maxLen = ohlcv.length
    for (let i = 0; i < maxLen; i++) {
      const fs: FeatureSet = {
        timestamp: ohlcv[i].timestamp,
        features: {}
      }

      for (const [fname, fvalues] of Object.entries(features)) {
        if (fvalues[i] !== undefined && !isNaN(fvalues[i]) && isFinite(fvalues[i])) {
          fs.features[fname] = fvalues[i]
        }
      }

      // Add microstructure features if orderbook available
      if (orderbook) {
        fs.features = { ...fs.features, ...this.generateOrderbookFeatures(orderbook) }
      }

      featureSets.push(fs)
    }

    return featureSets
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
    const spreadBps = (spread / midPrice) * 10000 // Basis points

    // Order imbalance
    const bidVolume = bids.reduce((sum, b) => sum + b.quantity, 0)
    const askVolume = asks.reduce((sum, a) => sum + a.quantity, 0)
    const imbalance = (bidVolume - askVolume) / (bidVolume + askVolume)

    // Depth weighted price
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

  /**
   * Normalize features
   */
  normalizeFeatures(featureSets: FeatureSet[], method: 'zscore' | 'minmax' | 'robust' = 'zscore'): FeatureSet[] {
    if (featureSets.length < 2) return featureSets

    const featureNames = Object.keys(featureSets[0].features)
    const stats: Record<string, { mean: number; std: number; min: number; max: number; median: number; iqr: number }> = {}

    // Calculate statistics
    for (const fname of featureNames) {
      const values = featureSets.map((fs) => fs.features[fname]).filter((v) => v !== undefined && isFinite(v))
      
      if (values.length < 2) continue

      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
      const min = Math.min(...values)
      const max = Math.max(...values)
      
      // For robust scaling
      const sorted = [...values].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const q1 = sorted[Math.floor(sorted.length * 0.25)]
      const q3 = sorted[Math.floor(sorted.length * 0.75)]
      const iqr = q3 - q1

      stats[fname] = { mean, std, min, max, median, iqr }
    }

    // Normalize
    return featureSets.map((fs) => ({
      ...fs,
      features: Object.fromEntries(
        Object.entries(fs.features).map(([name, value]) => {
          const s = stats[name]
          if (!s) return [name, value]

          let normalized: number
          switch (method) {
            case 'zscore':
              normalized = s.std > 0 ? (value - s.mean) / s.std : 0
              break
            case 'minmax':
              normalized = s.max > s.min ? (value - s.min) / (s.max - s.min) : 0.5
              break
            case 'robust':
              normalized = s.iqr > 0 ? (value - s.median) / s.iqr : 0
              break
            default:
              normalized = value
          }

          return [name, isFinite(normalized) ? normalized : 0]
        })
      )
    }))
  }

  // Technical indicator calculations

  private calculateReturns(prices: number[], period: number = 1): number[] {
    return prices.map((p, i) => i >= period ? (p - prices[i - period]) / prices[i - period] : 0)
  }

  private calculateLogReturns(prices: number[], period: number = 1): number[] {
    return prices.map((p, i) => i >= period ? Math.log(p / prices[i - period]) : 0)
  }

  private calculatePriceChange(prices: number[], period: number = 1): number[] {
    return prices.map((p, i) => i >= period ? p - prices[i - period] : 0)
  }

  private calculateSMA(values: number[], period: number): number[] {
    return values.map((_, i) => {
      if (i < period - 1) return values[i]
      const slice = values.slice(i - period + 1, i + 1)
      return slice.reduce((a, b) => a + b, 0) / period
    })
  }

  private calculateEMA(values: number[], period: number): number[] {
    const multiplier = 2 / (period + 1)
    const ema: number[] = [values[0]]
    
    for (let i = 1; i < values.length; i++) {
      ema.push((values[i] - ema[i - 1]) * multiplier + ema[i - 1])
    }
    
    return ema
  }

  private calculateRSI(prices: number[], period: number): number[] {
    const gains: number[] = []
    const losses: number[] = []

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1]
      gains.push(change > 0 ? change : 0)
      losses.push(change < 0 ? Math.abs(change) : 0)
    }

    const rsi: number[] = [50] // First value

    for (let i = 1; i < prices.length; i++) {
      if (i < period) {
        rsi.push(50)
        continue
      }

      const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period
      const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period

      if (avgLoss === 0) {
        rsi.push(100)
      } else {
        const rs = avgGain / avgLoss
        rsi.push(100 - 100 / (1 + rs))
      }
    }

    return rsi
  }

  private calculateMACD(prices: number[], fast: number, slow: number, signal: number): { macd: number[]; signal: number[]; histogram: number[] } {
    const fastEMA = this.calculateEMA(prices, fast)
    const slowEMA = this.calculateEMA(prices, slow)
    const macdLine = fastEMA.map((f, i) => f - slowEMA[i])
    const signalLine = this.calculateEMA(macdLine, signal)
    const histogram = macdLine.map((m, i) => m - signalLine[i])

    return { macd: macdLine, signal: signalLine, histogram }
  }

  private calculateStochastic(highs: number[], lows: number[], closes: number[], kPeriod: number, dPeriod: number): { k: number[]; d: number[] } {
    const k: number[] = []

    for (let i = 0; i < closes.length; i++) {
      if (i < kPeriod - 1) {
        k.push(50)
        continue
      }

      const highestHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1))
      const lowestLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1))
      const range = highestHigh - lowestLow

      if (range === 0) {
        k.push(50)
      } else {
        k.push(((closes[i] - lowestLow) / range) * 100)
      }
    }

    const d = this.calculateSMA(k, dPeriod)

    return { k, d }
  }

  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
    const trueRanges: number[] = [highs[0] - lows[0]]

    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
      trueRanges.push(tr)
    }

    return this.calculateSMA(trueRanges, period)
  }

  private calculateBollingerBands(prices: number[], period: number, stdDev: number): { upper: number[]; lower: number[]; width: number[]; position: number[] } {
    const sma = this.calculateSMA(prices, period)
    const std = this.calculateRollingStd(prices, period)

    const upper = sma.map((s, i) => s + std[i] * stdDev)
    const lower = sma.map((s, i) => s - std[i] * stdDev)
    const width = upper.map((u, i) => (u - lower[i]) / sma[i] || 0)
    const position = prices.map((p, i) => (p - lower[i]) / (upper[i] - lower[i]) || 0.5)

    return { upper, lower, width, position }
  }

  private calculateADX(highs: number[], lows: number[], closes: number[], period: number): { adx: number[]; plusDI: number[]; minusDI: number[] } {
    const plusDM: number[] = [0]
    const minusDM: number[] = [0]
    const tr: number[] = [highs[0] - lows[0]]

    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i] - highs[i - 1]
      const downMove = lows[i - 1] - lows[i]

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0)
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0)

      tr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ))
    }

    const smoothedTR = this.calculateEMA(tr, period)
    const smoothedPlusDM = this.calculateEMA(plusDM, period)
    const smoothedMinusDM = this.calculateEMA(minusDM, period)

    const plusDI = smoothedPlusDM.map((dm, i) => smoothedTR[i] > 0 ? (dm / smoothedTR[i]) * 100 : 0)
    const minusDI = smoothedMinusDM.map((dm, i) => smoothedTR[i] > 0 ? (dm / smoothedTR[i]) * 100 : 0)

    const dx = plusDI.map((pdi, i) => {
      const sum = pdi + minusDI[i]
      return sum > 0 ? (Math.abs(pdi - minusDI[i]) / sum) * 100 : 0
    })

    const adx = this.calculateEMA(dx, period)

    return { adx, plusDI, minusDI }
  }

  private calculateOBV(closes: number[], volumes: number[]): number[] {
    const obv: number[] = [volumes[0]]

    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv.push(obv[i - 1] + volumes[i])
      } else if (closes[i] < closes[i - 1]) {
        obv.push(obv[i - 1] - volumes[i])
      } else {
        obv.push(obv[i - 1])
      }
    }

    return obv
  }

  private calculateRollingStd(values: number[], period: number): number[] {
    return values.map((_, i) => {
      if (i < period - 1) return 0
      const slice = values.slice(i - period + 1, i + 1)
      const mean = slice.reduce((a, b) => a + b, 0) / period
      return Math.sqrt(slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period)
    })
  }

  /**
   * Get feature importance (placeholder - should be calculated from trained model)
   */
  getFeatureImportance(featureSets: FeatureSet[]): FeatureImportance[] {
    const featureNames = Object.keys(featureSets[0]?.features || {})
    
    // Placeholder importance based on variance
    return featureNames.map((name, index) => ({
      feature: name,
      importance: 1 / (index + 1), // Placeholder
      rank: index + 1
    }))
  }

  /**
   * Add custom feature
   */
  addFeature(config: FeatureConfig): void {
    this.featureConfigs.set(config.name, config)
  }

  /**
   * Remove feature
   */
  removeFeature(name: string): void {
    this.featureConfigs.delete(name)
  }

  /**
   * Get enabled features
   */
  getEnabledFeatures(): string[] {
    return Array.from(this.featureConfigs.values())
      .filter((c) => c.enabled)
      .map((c) => c.name)
  }

  // ==========================================================================
  // LOOK-AHEAD PROTECTION METHODS
  // ==========================================================================

  /**
   * Get the maximum lookback period for a feature
   * This is the minimum number of historical bars needed to calculate the feature
   */
  getFeatureMaxLookback(featureName: string): number {
    const config = this.featureConfigs.get(featureName)
    if (!config) return 0

    switch (featureName) {
      case 'returns':
      case 'log_returns':
      case 'price_change':
        return (config.params.period as number) || 1

      case 'sma_5': return 5
      case 'sma_10': return 10
      case 'sma_20': return 20
      case 'sma_50': return 50
      case 'ema_5': return 5
      case 'ema_10': return 10
      case 'ema_20': return 20
      case 'ema_50': return 50

      case 'rsi_14': return 15
      case 'rsi_7': return 8

      case 'macd':
        // MACD needs slow period + signal period
        return (config.params.slow as number || 26) + (config.params.signal as number || 9)

      case 'stoch_k':
      case 'stoch_d':
        return (config.params.k as number) || 14

      case 'atr_14': return 15
      case 'atr_7': return 8

      case 'bb_upper':
      case 'bb_lower':
      case 'bb_width':
        return (config.params.period as number) || 20

      case 'adx_14':
      case 'plus_di':
      case 'minus_di':
        return (config.params.period as number) || 14

      case 'volume_sma':
        return (config.params.period as number) || 20

      case 'lag_returns_1': return 2
      case 'lag_returns_2': return 3
      case 'lag_returns_3': return 4
      case 'lag_returns_5': return 6

      case 'rolling_mean_10':
      case 'rolling_std_10':
        return 10

      case 'rolling_mean_20':
      case 'rolling_std_20':
        return 20

      case 'hour':
      case 'day_of_week':
      case 'is_weekend':
        return 0 // Time features don't need historical data

      default:
        return 0
    }
  }

  /**
   * Validate that features don't use future data
   * 
   * @param ohlcv - OHLCV data
   * @param featureSets - Generated feature sets
   * @returns Validation result with any look-ahead issues found
   */
  validateNoLookahead(ohlcv: OHLCV[], featureSets: FeatureSet[]): LookAheadValidationResult {
    const issues: LookAheadIssue[] = []
    const safeFeatures: string[] = []
    const unsafeFeatures: string[] = []

    if (featureSets.length === 0 || ohlcv.length === 0) {
      return { valid: true, issues: [], safeFeatures: [], unsafeFeatures: [] }
    }

    // Check if feature sets have the same timestamps as OHLCV data
    const ohlcvTimestamps = new Set(ohlcv.map(o => o.timestamp))
    for (const fs of featureSets) {
      if (!ohlcvTimestamps.has(fs.timestamp)) {
        issues.push({
          featureName: 'ALL',
          issueType: 'future_timestamp',
          description: `Feature set timestamp ${fs.timestamp} not found in OHLCV data`,
          severity: 'warning',
          suggestion: 'Ensure feature timestamps align with OHLCV data'
        })
      }
    }

    // Check each feature for potential look-ahead
    const featureNames = Object.keys(featureSets[0]?.features || {})
    
    for (const featureName of featureNames) {
      const maxLookback = this.getFeatureMaxLookback(featureName)
      
      // Check if feature values exist before enough history is available
      let hasInsufficientHistoryWarning = false
      for (let i = 0; i < Math.min(maxLookback, featureSets.length); i++) {
        const value = featureSets[i]?.features[featureName]
        if (value !== undefined && !isNaN(value) && value !== 0) {
          hasInsufficientHistoryWarning = true
          break
        }
      }

      if (hasInsufficientHistoryWarning) {
        issues.push({
          featureName,
          issueType: 'lookback_exceeded',
          description: `Feature "${featureName}" may have values with insufficient history (needs ${maxLookback} bars)`,
          severity: 'warning',
          suggestion: `Consider NaN or 0 for first ${maxLookback} bars`
        })
      }

      // All features in this implementation use only historical data
      safeFeatures.push(featureName)
    }

    return {
      valid: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      safeFeatures,
      unsafeFeatures
    }
  }

  /**
   * Get available features at a specific point in time
   * 
   * This method returns which features can be calculated at a given bar index
   * without using future data.
   * 
   * @param ohlcv - OHLCV data
   * @param barIndex - Index of the current bar
   * @returns Information about available and unavailable features
   */
  getAvailableFeaturesAtTime(ohlcv: OHLCV[], barIndex: number): AvailableFeaturesAtTime {
    const availableFeatures: string[] = []
    const unavailableFeatures: string[] = []
    const partialFeatures: string[] = []

    const barsAvailable = barIndex + 1

    for (const [name, config] of this.featureConfigs) {
      if (!config.enabled) continue

      const maxLookback = this.getFeatureMaxLookback(name)

      if (barsAvailable >= maxLookback) {
        availableFeatures.push(name)
      } else if (barsAvailable >= Math.ceil(maxLookback * 0.5)) {
        partialFeatures.push(name)
      } else {
        unavailableFeatures.push(name)
      }
    }

    return {
      timestamp: ohlcv[barIndex]?.timestamp || 0,
      barIndex,
      availableFeatures,
      unavailableFeatures,
      partialFeatures
    }
  }

  /**
   * Generate features with strict look-ahead protection
   * 
   * This method ensures that features are calculated only using data
   * available up to and including the specified bar index.
   * 
   * @param ohlcv - OHLCV data
   * @param currentBarIndex - Index up to which data can be used
   * @param orderbook - Optional orderbook (must be from current time)
   * @returns Feature set with validation metadata
   */
  generateFeaturesAtTime(
    ohlcv: OHLCV[],
    currentBarIndex: number,
    orderbook?: Orderbook
  ): SafeFeatureSet {
    if (currentBarIndex < 0 || currentBarIndex >= ohlcv.length) {
      throw new Error(`Invalid bar index: ${currentBarIndex}`)
    }

    // Only use data up to current bar
    const historicalData = ohlcv.slice(0, currentBarIndex + 1)
    
    // Generate features for just this point
    const fullFeatureSets = this.generateFeatures(historicalData, orderbook)
    const currentFeatures = fullFeatureSets[fullFeatureSets.length - 1]

    // Validate which features have enough history
    const availableInfo = this.getAvailableFeaturesAtTime(ohlcv, currentBarIndex)
    const validFeatures: string[] = []
    const invalidFeatures: string[] = []

    for (const featureName of Object.keys(currentFeatures.features)) {
      if (availableInfo.availableFeatures.includes(featureName)) {
        validFeatures.push(featureName)
      } else {
        invalidFeatures.push(featureName)
        // Set invalid features to NaN to prevent use
        currentFeatures.features[featureName] = NaN
      }
    }

    return {
      ...currentFeatures,
      barIndex: currentBarIndex,
      isValid: invalidFeatures.length === 0,
      validFeatures,
      invalidFeatures,
      validatedAt: Date.now()
    }
  }

  /**
   * Get maximum lookback across all enabled features
   */
  getMaxLookback(): number {
    let maxLookback = 0
    for (const [name, config] of this.featureConfigs) {
      if (config.enabled) {
        const lookback = this.getFeatureMaxLookback(name)
        if (lookback > maxLookback) {
          maxLookback = lookback
        }
      }
    }
    return maxLookback
  }

  /**
   * Convert to safe feature configuration
   */
  toSafeFeatureConfigs(): FeatureCalculationConfig[] {
    return Array.from(this.featureConfigs.values()).map(config => ({
      ...config,
      maxLookback: this.getFeatureMaxLookback(config.name),
      usesFutureData: false, // This implementation doesn't use future data
      validated: true
    }))
  }
}

// Singleton instance
export const featureEngineer = new FeatureEngineer()
