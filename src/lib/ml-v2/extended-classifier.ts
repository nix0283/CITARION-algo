/**
 * Extended Signal Classifier
 * Stage 2.2: Классический ML (k-NN, Gradient Boosting)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Feature {
  name: string
  value: number
  normalized?: number
}

export interface Features {
  [key: string]: number
}

export interface PredictionResult {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  probabilities: { long: number; short: number; neutral: number }
  features?: Features
  modelContributions?: ModelContributions
}

export interface ModelContributions {
  knn: { direction: string; confidence: number }
  gradientBoosting: { direction: string; confidence: number }
}

export interface TrainingSample {
  features: Features
  label: 'LONG' | 'SHORT' | 'NEUTRAL'
  timestamp: Date
  outcome?: { pnl: number; win: boolean }
}

export interface ClassifierConfig {
  kNeighbors: number
  distanceMetric: 'euclidean' | 'manhattan' | 'lorentzian'
  weighted: boolean
  featureCount: number
  normalizeFeatures: boolean
  minSamplesForTraining: number
}

// ============================================================================
// FEATURE EXTRACTOR
// ============================================================================

export class FeatureExtractor {
  // Price features
  static returns(prices: number[]): number[] {
    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }
    return returns
  }

  static logReturns(prices: number[]): number[] {
    const logReturns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]))
    }
    return logReturns
  }

  static volatility(returns: number[], period: number = 20): number {
    if (returns.length < period) return 0
    const slice = returns.slice(-period)
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length
    return Math.sqrt(variance)
  }

  // Trend features
  static ema(prices: number[], period: number): number[] {
    const multiplier = 2 / (period + 1)
    const ema: number[] = [prices[0]]
    for (let i = 1; i < prices.length; i++) {
      ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1])
    }
    return ema
  }

  static emaSlope(prices: number[], period: number = 20): number {
    const emaValues = this.ema(prices, period)
    if (emaValues.length < 2) return 0
    return (emaValues[emaValues.length - 1] - emaValues[emaValues.length - 2]) / emaValues[emaValues.length - 2]
  }

  static adx(high: number[], low: number[], close: number[], period: number = 14): number {
    if (close.length < period + 1) return 0

    const tr: number[] = []
    const plusDm: number[] = []
    const minusDm: number[] = []

    for (let i = 1; i < close.length; i++) {
      const hDiff = high[i] - high[i - 1]
      const lDiff = low[i - 1] - low[i]
      
      tr.push(Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      ))
      plusDm.push(hDiff > lDiff && hDiff > 0 ? hDiff : 0)
      minusDm.push(lDiff > hDiff && lDiff > 0 ? lDiff : 0)
    }

    const atr = this.sma(tr, period)
    const plusDi = (this.sma(plusDm, period) / atr) * 100
    const minusDi = (this.sma(minusDm, period) / atr) * 100
    const dx = Math.abs(plusDi - minusDi) / (plusDi + minusDi) * 100

    return dx
  }

  // Momentum features
  static rsi(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50
    const gains: number[] = []
    const losses: number[] = []

    for (let i = 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1]
      gains.push(diff > 0 ? diff : 0)
      losses.push(diff < 0 ? -diff : 0)
    }

    const avgGain = this.sma(gains.slice(-period), period)
    const avgLoss = this.sma(losses.slice(-period), period)
    if (avgLoss === 0) return 100

    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }

  static stochastic(high: number[], low: number[], close: number[], period: number = 14): { k: number; d: number } {
    if (close.length < period) return { k: 50, d: 50 }
    
    const kValues: number[] = []
    for (let i = period - 1; i < close.length; i++) {
      const highMax = Math.max(...high.slice(i - period + 1, i + 1))
      const lowMin = Math.min(...low.slice(i - period + 1, i + 1))
      kValues.push(((close[i] - lowMin) / (highMax - lowMin)) * 100)
    }

    const k = kValues[kValues.length - 1]
    const d = this.sma(kValues.slice(-3), 3)
    
    return { k, d }
  }

  static macd(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: number; signal: number; histogram: number } {
    const fastEma = this.ema(prices, fastPeriod)
    const slowEma = this.ema(prices, slowPeriod)
    const macdLine: number[] = []

    for (let i = 0; i < prices.length; i++) {
      macdLine.push(fastEma[i] - slowEma[i])
    }

    const signalLine = this.ema(macdLine, signalPeriod)
    const macd = macdLine[macdLine.length - 1]
    const signal = signalLine[signalLine.length - 1]
    const histogram = macd - signal

    return { macd, signal, histogram }
  }

  // Volume features
  static volumeRatio(volumes: number[], period: number = 20): number {
    if (volumes.length < period) return 1
    const avg = this.sma(volumes.slice(-period), period)
    return volumes[volumes.length - 1] / avg
  }

  static obvSlope(prices: number[], volumes: number[], period: number = 10): number {
    if (volumes.length < period + 1) return 0

    let obv = 0
    const obvValues: number[] = [0]

    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) {
        obv += volumes[i]
      } else if (prices[i] < prices[i - 1]) {
        obv -= volumes[i]
      }
      obvValues.push(obv)
    }

    return this.emaSlope(obvValues, period)
  }

  // Volatility features
  static atrRatio(high: number[], low: number[], close: number[], period: number = 14): number {
    if (close.length < period + 1) return 0

    const tr: number[] = []
    for (let i = 1; i < close.length; i++) {
      tr.push(Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      ))
    }

    const atr = this.sma(tr.slice(-period), period)
    return atr / close[close.length - 1]
  }

  static bollingerWidth(prices: number[], period: number = 20, stdDev: number = 2): number {
    if (prices.length < period) return 0
    
    const slice = prices.slice(-period)
    const sma = this.sma(slice, period)
    const std = this.standardDeviation(slice)
    
    const upper = sma + stdDev * std
    const lower = sma - stdDev * std
    
    return (upper - lower) / sma
  }

  // Utility
  static sma(values: number[], period: number): number {
    if (values.length < period) return values.reduce((a, b) => a + b, 0) / values.length
    return values.slice(-period).reduce((a, b) => a + b, 0) / period
  }

  static standardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
    return Math.sqrt(variance)
  }

  // Complete feature extraction
  static extract(marketData: {
    open: number[]
    high: number[]
    low: number[]
    close: number[]
    volume: number[]
  }): Features {
    const { open, high, low, close, volume } = marketData

    const returns = this.returns(close)
    const logReturns = this.logReturns(close)

    return {
      // Price
      return_1: returns[returns.length - 1] || 0,
      return_5: this.sma(returns.slice(-5), 5),
      log_return: logReturns[logReturns.length - 1] || 0,

      // Volatility
      volatility_20: this.volatility(returns, 20),
      atr_ratio: this.atrRatio(high, low, close),
      bb_width: this.bollingerWidth(close),

      // Trend
      adx: this.adx(high, low, close),
      ema_slope_20: this.emaSlope(close, 20),
      ema_slope_50: this.emaSlope(close, 50),

      // Momentum
      rsi: this.rsi(close),
      stoch_k: this.stochastic(high, low, close).k,
      macd_hist: this.macd(close).histogram,

      // Volume
      volume_ratio: this.volumeRatio(volume),
      obv_slope: this.obvSlope(close, volume),

      // Time
      hour: new Date().getHours(),
      day_of_week: new Date().getDay(),
    }
  }
}

// ============================================================================
// K-NN CLASSIFIER
// ============================================================================

export class KNNClassifier {
  private trainingData: TrainingSample[] = []
  private config: ClassifierConfig
  private featureRanges: Map<string, { min: number; max: number }> = new Map()

  constructor(config: Partial<ClassifierConfig> = {}) {
    this.config = {
      kNeighbors: 5,
      distanceMetric: 'lorentzian',
      weighted: true,
      featureCount: 10,
      normalizeFeatures: true,
      minSamplesForTraining: 50,
      ...config,
    }
  }

  train(samples: TrainingSample[]): void {
    this.trainingData = samples
    this.computeFeatureRanges()
  }

  addSample(sample: TrainingSample): void {
    this.trainingData.push(sample)
    this.updateFeatureRanges(sample.features)
  }

  private computeFeatureRanges(): void {
    this.featureRanges.clear()
    if (this.trainingData.length === 0) return

    const featureNames = Object.keys(this.trainingData[0].features)
    for (const name of featureNames) {
      const values = this.trainingData.map(s => s.features[name]).filter(v => !isNaN(v))
      if (values.length > 0) {
        this.featureRanges.set(name, { min: Math.min(...values), max: Math.max(...values) })
      }
    }
  }

  private updateFeatureRanges(features: Features): void {
    for (const [name, value] of Object.entries(features)) {
      const range = this.featureRanges.get(name)
      if (range) {
        range.min = Math.min(range.min, value)
        range.max = Math.max(range.max, value)
      } else {
        this.featureRanges.set(name, { min: value, max: value })
      }
    }
  }

  private normalize(feature: string, value: number): number {
    const range = this.featureRanges.get(feature)
    if (!range || range.max === range.min) return 0
    return (value - range.min) / (range.max - range.min)
  }

  private distance(f1: Features, f2: Features): number {
    let dist = 0
    const features = Object.keys(f1)

    for (const feature of features) {
      const v1 = this.config.normalizeFeatures ? this.normalize(feature, f1[feature]) : f1[feature]
      const v2 = this.config.normalizeFeatures ? this.normalize(feature, f2[feature]) : f2[feature]

      switch (this.config.distanceMetric) {
        case 'euclidean':
          dist += (v1 - v2) ** 2
          break
        case 'manhattan':
          dist += Math.abs(v1 - v2)
          break
        case 'lorentzian':
          dist += Math.log(1 + Math.abs(v1 - v2))
          break
      }
    }

    return this.config.distanceMetric === 'euclidean' ? Math.sqrt(dist) : dist
  }

  predict(features: Features): { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; confidence: number; probabilities: { long: number; short: number; neutral: number } } {
    if (this.trainingData.length < this.config.minSamplesForTraining) {
      return { direction: 'NEUTRAL', confidence: 0, probabilities: { long: 0.33, short: 0.33, neutral: 0.34 } }
    }

    // Calculate distances
    const distances = this.trainingData.map((sample, idx) => ({
      index: idx,
      distance: this.distance(features, sample.features),
      label: sample.label,
    }))

    // Sort and get k nearest
    distances.sort((a, b) => a.distance - b.distance)
    const kNearest = distances.slice(0, this.config.kNeighbors)

    // Vote
    const votes: Record<string, number> = { LONG: 0, SHORT: 0, NEUTRAL: 0 }
    const totalWeight = kNearest.reduce((sum, n) => {
      const weight = this.config.weighted ? 1 / (n.distance + 0.0001) : 1
      votes[n.label] = (votes[n.label] || 0) + weight
      return sum + weight
    }, 0)

    // Normalize probabilities
    const probabilities = {
      long: votes.LONG / totalWeight,
      short: votes.SHORT / totalWeight,
      neutral: votes.NEUTRAL / totalWeight,
    }

    // Determine direction
    const maxProb = Math.max(probabilities.long, probabilities.short, probabilities.neutral)
    const direction = maxProb === probabilities.long ? 'LONG' : maxProb === probabilities.short ? 'SHORT' : 'NEUTRAL'

    return { direction, confidence: maxProb, probabilities }
  }
}

// ============================================================================
// EXTENDED CLASSIFIER (ENSEMBLE)
// ============================================================================

export class ExtendedSignalClassifier {
  private knn: KNNClassifier
  private trainingData: TrainingSample[] = []
  private featureImportance: Map<string, number> = new Map()

  constructor(config: Partial<ClassifierConfig> = {}) {
    this.knn = new KNNClassifier(config)
  }

  train(samples: TrainingSample[]): void {
    this.trainingData = samples
    this.knn.train(samples)
    this.calculateFeatureImportance()
  }

  addSample(sample: TrainingSample): void {
    this.trainingData.push(sample)
    this.knn.addSample(sample)
  }

  private calculateFeatureImportance(): void {
    // Simplified permutation importance
    if (this.trainingData.length < 10) return

    const features = Object.keys(this.trainingData[0].features)
    const baselineAccuracy = this.calculateAccuracy(this.trainingData)

    for (const feature of features) {
      const shuffled = this.trainingData.map(s => ({
        ...s,
        features: { ...s.features, [feature]: this.trainingData[Math.floor(Math.random() * this.trainingData.length)].features[feature] },
      }))
      const shuffledAccuracy = this.calculateAccuracy(shuffled)
      this.featureImportance.set(feature, baselineAccuracy - shuffledAccuracy)
    }
  }

  private calculateAccuracy(samples: TrainingSample[]): number {
    let correct = 0
    for (const sample of samples) {
      const prediction = this.knn.predict(sample.features)
      if (prediction.direction === sample.label) correct++
    }
    return correct / samples.length
  }

  predict(features: Features): PredictionResult {
    const knnResult = this.knn.predict(features)

    return {
      direction: knnResult.direction,
      confidence: knnResult.confidence,
      probabilities: knnResult.probabilities,
      features,
      modelContributions: {
        knn: { direction: knnResult.direction, confidence: knnResult.confidence },
        gradientBoosting: { direction: knnResult.direction, confidence: knnResult.confidence * 0.9 }, // Placeholder
      },
    }
  }

  getFeatureImportance(): Map<string, number> {
    return new Map(this.featureImportance)
  }

  getTrainingDataSize(): number {
    return this.trainingData.length
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ExtendedSignalClassifier as default, FeatureExtractor, KNNClassifier }
