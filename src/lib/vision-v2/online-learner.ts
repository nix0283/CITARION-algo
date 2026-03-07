/**
 * Online Learning for Vision Bot
 * Stage 2.3: Vision Online Learning
 */

export interface TrainingSample {
  features: Record<string, number>
  label: 'LONG' | 'SHORT' | 'NEUTRAL'
  timestamp: Date
  outcome?: { pnl: number; win: boolean; holdingTime: number }
}

export interface OnlineConfig {
  bufferSize: number
  learningRate: number
  forgettingFactor: number
  driftDetection: boolean
  driftThreshold: number
  retrainThreshold: number
}

export interface DriftResult {
  detected: boolean
  recentAccuracy: number
  historicalAccuracy: number
  severity: number
}

export interface MultiHorizonForecast {
  horizons: {
    '1h': { direction: string; confidence: number; price: number }
    '4h': { direction: string; confidence: number; price: number }
    '24h': { direction: string; confidence: number; price: number }
    '7d': { direction: string; confidence: number; price: number }
  }
  consensus: { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; confidence: number; agreement: number }
}

// Drift Detector (ADWIN)
export class DriftDetector {
  private window: number[] = []
  
  constructor(private windowSize: number = 100, private threshold: number = 0.1) {}

  addAccuracy(accuracy: number): void {
    this.window.push(accuracy)
    if (this.window.length > this.windowSize) this.window.shift()
  }

  detect(): DriftResult {
    if (this.window.length < 20) return { detected: false, recentAccuracy: 0, historicalAccuracy: 0, severity: 0 }

    const halfSize = Math.floor(this.window.length / 2)
    const recent = this.window.slice(-halfSize)
    const historical = this.window.slice(0, halfSize)
    const recentAcc = recent.reduce((a, b) => a + b, 0) / recent.length
    const historicalAcc = historical.reduce((a, b) => a + b, 0) / historical.length
    const severity = Math.abs(recentAcc - historicalAcc)

    return { detected: severity > this.threshold, recentAccuracy: recentAcc, historicalAccuracy: historicalAcc, severity }
  }
}

// Incremental Model
export class IncrementalModel {
  private weights: Map<string, number> = new Map()
  private bias: number = 0
  private samplesProcessed: number = 0

  constructor(private learningRate: number = 0.01) {}

  private sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)) }

  predict(features: Record<string, number>): { long: number; short: number; neutral: number } {
    for (const f of Object.keys(features)) if (!this.weights.has(f)) this.weights.set(f, 0)
    let sum = this.bias
    for (const [f, v] of Object.entries(features)) sum += (this.weights.get(f) || 0) * v
    const prob = this.sigmoid(sum)
    return { long: prob > 0.6 ? prob : prob * 0.5, short: prob < 0.4 ? 1 - prob : (1 - prob) * 0.5, neutral: 1 - Math.abs(prob - 0.5) * 2 }
  }

  update(features: Record<string, number>, label: 'LONG' | 'SHORT' | 'NEUTRAL', weight: number = 1): void {
    this.samplesProcessed++
    const target = label === 'LONG' ? 1 : label === 'SHORT' ? 0 : 0.5
    let sum = this.bias
    for (const [f, v] of Object.entries(features)) {
      if (!this.weights.has(f)) this.weights.set(f, 0)
      sum += (this.weights.get(f) || 0) * v
    }
    const prediction = this.sigmoid(sum)
    const error = target - prediction
    const gradient = error * prediction * (1 - prediction) * weight * this.learningRate
    this.bias += gradient
    for (const [f, v] of Object.entries(features)) this.weights.set(f, (this.weights.get(f) || 0) + gradient * v)
  }

  getSamplesProcessed(): number { return this.samplesProcessed }
  setLearningRate(r: number): void { this.learningRate = r }
  getWeights(): Map<string, number> { return new Map(this.weights) }
}

// Online Learner
export class OnlineLearner {
  private model: IncrementalModel
  private buffer: TrainingSample[] = []
  private driftDetector: DriftDetector
  private accuracyHistory: number[] = []

  constructor(private config: OnlineConfig) {
    this.model = new IncrementalModel(config.learningRate)
    this.driftDetector = new DriftDetector(50, config.driftThreshold)
  }

  async addSample(sample: TrainingSample): Promise<void> {
    this.buffer.push(sample)
    if (this.buffer.length > this.config.bufferSize * 2) this.buffer = this.buffer.slice(-this.config.bufferSize)
    if (sample.outcome) this.driftDetector.addAccuracy(sample.outcome.win ? 1 : 0)
    if (this.buffer.length >= this.config.bufferSize) await this.incrementalUpdate()
  }

  private async incrementalUpdate(): Promise<void> {
    const samples = this.buffer.slice(-Math.floor(this.config.bufferSize * 0.3))
    for (let i = 0; i < samples.length; i++) {
      const age = (samples.length - i) / samples.length
      const weight = Math.pow(this.config.forgettingFactor, age)
      this.model.update(samples[i].features, samples[i].label, weight)
    }
  }

  async handleDrift(drift: DriftResult): Promise<void> {
    if (drift.severity > 0.3) await this.fullRetrain(true)
    else { const r = this.config.learningRate; this.model.setLearningRate(r * 3); await this.incrementalUpdate(); this.model.setLearningRate(r) }
  }

  async fullRetrain(recentOnly: boolean = false): Promise<void> {
    const samples = recentOnly ? this.buffer.slice(-Math.floor(this.config.bufferSize * 0.5)) : this.buffer
    this.model = new IncrementalModel(this.config.learningRate)
    for (const s of samples) this.model.update(s.features, s.label)
  }

  predict(features: Record<string, number>): { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; confidence: number } {
    const probs = this.model.predict(features)
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL', confidence: number
    if (probs.long > probs.short && probs.long > probs.neutral) { direction = 'LONG'; confidence = probs.long }
    else if (probs.short > probs.neutral) { direction = 'SHORT'; confidence = probs.short }
    else { direction = 'NEUTRAL'; confidence = probs.neutral }
    return { direction, confidence }
  }

  getModelInfo() { return { samplesProcessed: this.model.getSamplesProcessed(), bufferSize: this.buffer.length, weights: this.model.getWeights() } }
}

// Multi-Horizon Forecaster
export class MultiHorizonForecaster {
  private learners: Map<string, OnlineLearner> = new Map()
  private horizons = ['1h', '4h', '24h', '7d']

  constructor() {
    for (const h of this.horizons) this.learners.set(h, new OnlineLearner({ bufferSize: h === '1h' ? 50 : h === '4h' ? 100 : h === '24h' ? 200 : 500, learningRate: 0.01, forgettingFactor: 0.98, driftDetection: true, driftThreshold: 0.15, retrainThreshold: 0.5 }))
  }

  async forecast(features: Record<string, number>): Promise<MultiHorizonForecast> {
    const horizons = {} as MultiHorizonForecast['horizons']
    for (const h of this.horizons) {
      const pred = this.learners.get(h)!.predict(features)
      horizons[h as keyof typeof horizons] = { direction: pred.direction, confidence: pred.confidence, price: 0 }
    }
    const weights = { '1h': 0.4, '4h': 0.3, '24h': 0.2, '7d': 0.1 }
    let long = 0, short = 0, neutral = 0
    for (const [h, r] of Object.entries(horizons)) {
      const w = weights[h as keyof typeof weights]
      if (r.direction === 'LONG') long += w * r.confidence
      if (r.direction === 'SHORT') short += w * r.confidence
      if (r.direction === 'NEUTRAL') neutral += w * r.confidence
    }
    const max = Math.max(long, short, neutral)
    const dir = max === long ? 'LONG' : max === short ? 'SHORT' : 'NEUTRAL'
    const dirs = Object.values(horizons).map(r => r.direction)
    const agreement = dirs.filter(d => d === dir).length / dirs.length
    return { horizons, consensus: { direction: dir, confidence: max, agreement } }
  }

  getLearner(h: string): OnlineLearner | undefined { return this.learners.get(h) }
}

export { OnlineLearner as default, MultiHorizonForecaster }
