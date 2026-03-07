/**
 * Regime Detector
 * Detects market regimes using Hidden Markov Models and change point detection
 */

import type { OHLCV } from '../ml-pipeline/types'

export type MarketRegime = 
  | 'trending_up'
  | 'trending_down'
  | 'ranging'
  | 'volatile'
  | 'breakout'

export interface RegimeState {
  timestamp: number
  regime: MarketRegime
  probability: number
  duration: number // candles in this regime
  transitionProbability: Record<MarketRegime, number>
}

export interface RegimeHistory {
  timestamp: number
  fromRegime: MarketRegime
  toRegime: MarketRegime
  confidence: number
}

/**
 * Hidden Markov Model for regime detection
 */
class HiddenMarkovModel {
  private numStates: number = 5
  private transitionMatrix: number[][] = []
  private emissionParams: Array<{ mean: number; std: number }> = []
  private initialState: number[] = []

  constructor(numStates: number = 5) {
    this.numStates = numStates
    this.initialize()
  }

  private initialize(): void {
    // Initialize transition matrix with equal probabilities
    this.transitionMatrix = Array.from({ length: this.numStates }, () =>
      new Array(this.numStates).fill(1 / this.numStates)
    )

    // Initialize emission parameters
    this.emissionParams = [
      { mean: 0.001, std: 0.005 },  // Trending up
      { mean: -0.001, std: 0.005 }, // Trending down
      { mean: 0, std: 0.002 },      // Ranging
      { mean: 0, std: 0.01 },       // Volatile
      { mean: 0.002, std: 0.008 }   // Breakout
    ]

    // Initial state distribution
    this.initialState = new Array(this.numStates).fill(1 / this.numStates)
  }

  /**
   * Train model using Baum-Welch algorithm (simplified)
   */
  train(observations: number[], iterations: number = 10): void {
    const n = observations.length

    for (let iter = 0; iter < iterations; iter++) {
      // E-step: Calculate forward and backward probabilities
      const alpha = this.forward(observations)
      const beta = this.backward(observations)

      // M-step: Update parameters
      this.updateEmissions(observations, alpha, beta)
      this.updateTransitions(alpha, beta)
    }
  }

  /**
   * Forward algorithm
   */
  private forward(observations: number[]): number[][] {
    const T = observations.length
    const alpha: number[][] = []

    // Initialize
    alpha[0] = this.initialState.map((pi, i) =>
      pi * this.emissionProbability(observations[0], i)
    )
    this.normalize(alpha[0])

    // Forward pass
    for (let t = 1; t < T; t++) {
      alpha[t] = new Array(this.numStates).fill(0)
      for (let j = 0; j < this.numStates; j++) {
        for (let i = 0; i < this.numStates; i++) {
          alpha[t][j] += alpha[t - 1][i] * this.transitionMatrix[i][j]
        }
        alpha[t][j] *= this.emissionProbability(observations[t], j)
      }
      this.normalize(alpha[t])
    }

    return alpha
  }

  /**
   * Backward algorithm
   */
  private backward(observations: number[]): number[][] {
    const T = observations.length
    const beta: number[][] = []

    // Initialize
    beta[T - 1] = new Array(this.numStates).fill(1 / this.numStates)

    // Backward pass
    for (let t = T - 2; t >= 0; t--) {
      beta[t] = new Array(this.numStates).fill(0)
      for (let i = 0; i < this.numStates; i++) {
        for (let j = 0; j < this.numStates; j++) {
          beta[t][i] += this.transitionMatrix[i][j] *
            this.emissionProbability(observations[t + 1], j) *
            beta[t + 1][j]
        }
      }
      this.normalize(beta[t])
    }

    return beta
  }

  /**
   * Emission probability (Gaussian)
   */
  private emissionProbability(observation: number, state: number): number {
    const { mean, std } = this.emissionParams[state]
    const z = (observation - mean) / std
    return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI))
  }

  /**
   * Update emission parameters
   */
  private updateEmissions(observations: number[], alpha: number[][], beta: number[][]): void {
    const T = observations.length

    for (let state = 0; state < this.numStates; state++) {
      let sumGamma = 0
      let sumGammaX = 0
      let sumGammaX2 = 0

      for (let t = 0; t < T; t++) {
        const gamma = (alpha[t][state] * beta[t][state]) /
          (alpha[t].reduce((s, a) => s + a, 0) * beta[t].reduce((s, b) => s + b, 0) + 1e-10)

        sumGamma += gamma
        sumGammaX += gamma * observations[t]
        sumGammaX2 += gamma * observations[t] * observations[t]
      }

      this.emissionParams[state].mean = sumGammaX / (sumGamma + 1e-10)
      this.emissionParams[state].std = Math.sqrt(
        (sumGammaX2 - sumGamma * this.emissionParams[state].mean ** 2) / (sumGamma + 1e-10)
      ) || 0.001
    }
  }

  /**
   * Update transition matrix
   */
  private updateTransitions(alpha: number[][], beta: number[][]): void {
    const T = alpha.length

    for (let i = 0; i < this.numStates; i++) {
      let sumXi = 0
      const xi = new Array(this.numStates).fill(0)

      for (let t = 0; t < T - 1; t++) {
        for (let j = 0; j < this.numStates; j++) {
          const xi_ij = alpha[t][i] * this.transitionMatrix[i][j] * beta[t + 1][j]
          xi[j] += xi_ij
          sumXi += xi_ij
        }
      }

      for (let j = 0; j < this.numStates; j++) {
        this.transitionMatrix[i][j] = xi[j] / (sumXi + 1e-10)
      }
    }
  }

  /**
   * Decode most likely state sequence using Viterbi
   */
  decode(observations: number[]): number[] {
    const T = observations.length
    const delta: number[][] = []
    const psi: number[][] = []

    // Initialize
    delta[0] = this.initialState.map((pi, i) =>
      Math.log(pi + 1e-10) + Math.log(this.emissionProbability(observations[0], i) + 1e-10)
    )
    psi[0] = new Array(this.numStates).fill(0)

    // Recursion
    for (let t = 1; t < T; t++) {
      delta[t] = new Array(this.numStates).fill(-Infinity)
      psi[t] = new Array(this.numStates).fill(0)

      for (let j = 0; j < this.numStates; j++) {
        for (let i = 0; i < this.numStates; i++) {
          const score = delta[t - 1][i] + Math.log(this.transitionMatrix[i][j] + 1e-10)
          if (score > delta[t][j]) {
            delta[t][j] = score
            psi[t][j] = i
          }
        }
        delta[t][j] += Math.log(this.emissionProbability(observations[t], j) + 1e-10)
      }
    }

    // Backtrack
    const states: number[] = []
    states[T - 1] = delta[T - 1].indexOf(Math.max(...delta[T - 1]))

    for (let t = T - 2; t >= 0; t--) {
      states[t] = psi[t + 1][states[t + 1]]
    }

    return states
  }

  /**
   * Normalize array
   */
  private normalize(arr: number[]): void {
    const sum = arr.reduce((a, b) => a + b, 0)
    for (let i = 0; i < arr.length; i++) {
      arr[i] /= (sum + 1e-10)
    }
  }
}

/**
 * Change Point Detection
 */
class ChangePointDetector {
  private threshold: number = 3.0 // Standard deviations

  /**
   * CUSUM change point detection
   */
  cusum(observations: number[]): number[] {
    const mean = observations.reduce((a, b) => a + b, 0) / observations.length
    const std = Math.sqrt(
      observations.reduce((sum, o) => sum + (o - mean) ** 2, 0) / observations.length
    )

    const changePoints: number[] = []
    let cusumPos = 0
    let cusumNeg = 0

    for (let i = 0; i < observations.length; i++) {
      const z = (observations[i] - mean) / (std + 1e-10)
      cusumPos = Math.max(0, cusumPos + z - this.threshold / 2)
      cusumNeg = Math.min(0, cusumNeg + z + this.threshold / 2)

      if (cusumPos > this.threshold || cusumNeg < -this.threshold) {
        changePoints.push(i)
        cusumPos = 0
        cusumNeg = 0
      }
    }

    return changePoints
  }

  /**
   * PELT (Pruned Exact Linear Time) - simplified version
   */
  pelt(observations: number[], penalty: number = 10): number[] {
    const n = observations.length
    const changePoints: number[] = []

    if (n < 3) return changePoints

    // Simplified: use binary segmentation
    const detectChange = (start: number, end: number): number | null => {
      if (end - start < 3) return null

      const segment = observations.slice(start, end)
      const mean = segment.reduce((a, b) => a + b, 0) / segment.length

      let maxStat = 0
      let maxIdx = start

      for (let i = start + 1; i < end; i++) {
        const leftMean = segment.slice(0, i - start).reduce((a, b) => a + b, 0) / (i - start)
        const rightMean = segment.slice(i - start).reduce((a, b) => a + b, 0) / (end - i)

        const leftVar = segment.slice(0, i - start).reduce((s, x) => s + (x - leftMean) ** 2, 0)
        const rightVar = segment.slice(i - start).reduce((s, x) => s + (x - rightMean) ** 2, 0)

        const stat = leftVar + rightVar
        if (stat > maxStat) {
          maxStat = stat
          maxIdx = i
        }
      }

      // Check if change is significant
      const totalVar = segment.reduce((s, x) => s + (x - mean) ** 2, 0)
      if (totalVar - maxStat > penalty) {
        return maxIdx
      }

      return null
    }

    // Recursive detection
    const detect = (start: number, end: number) => {
      const cp = detectChange(start, end)
      if (cp !== null) {
        changePoints.push(cp)
        detect(start, cp)
        detect(cp, end)
      }
    }

    detect(0, n)
    return changePoints.sort((a, b) => a - b)
  }
}

/**
 * Main Regime Detector class
 */
export class RegimeDetector {
  private hmm: HiddenMarkovModel
  private cpDetector: ChangePointDetector
  private history: RegimeState[] = []
  private regimeHistory: RegimeHistory[] = []

  private regimeNames: MarketRegime[] = [
    'trending_up',
    'trending_down',
    'ranging',
    'volatile',
    'breakout'
  ]

  constructor() {
    this.hmm = new HiddenMarkovModel(5)
    this.cpDetector = new ChangePointDetector()
  }

  /**
   * Detect current market regime
   */
  detect(ohlcv: OHLCV[]): RegimeState {
    // Calculate features
    const returns = this.calculateReturns(ohlcv)
    const volatilities = this.calculateRollingVolatility(ohlcv, 20)
    const trends = this.calculateTrendStrength(ohlcv, 20)

    // Train HMM on returns
    this.hmm.train(returns, 5)

    // Decode most likely states
    const states = this.hmm.decode(returns)
    const currentState = states[states.length - 1]
    const regime = this.regimeNames[currentState] || 'ranging'

    // Calculate state probabilities
    const probabilities = this.calculateStateProbabilities(returns, states)

    // Calculate regime duration
    let duration = 1
    for (let i = states.length - 2; i >= 0; i--) {
      if (states[i] === currentState) duration++
      else break
    }

    // Transition probabilities
    const transitionProb: Record<MarketRegime, number> = {} as Record<MarketRegime, number>
    for (let i = 0; i < this.regimeNames.length; i++) {
      transitionProb[this.regimeNames[i]] = probabilities[i] || 0
    }

    const state: RegimeState = {
      timestamp: ohlcv[ohlcv.length - 1].timestamp,
      regime,
      probability: probabilities[currentState] || 0.5,
      duration,
      transitionProbability: transitionProb
    }

    // Check for regime change
    if (this.history.length > 0 && this.history[this.history.length - 1].regime !== regime) {
      this.regimeHistory.push({
        timestamp: state.timestamp,
        fromRegime: this.history[this.history.length - 1].regime,
        toRegime: regime,
        confidence: state.probability
      })
    }

    this.history.push(state)
    return state
  }

  /**
   * Detect change points
   */
  detectChangePoints(ohlcv: OHLCV[]): number[] {
    const returns = this.calculateReturns(ohlcv)
    return this.cpDetector.cusum(returns)
  }

  /**
   * Get regime probabilities
   */
  getRegimeProbabilities(ohlcv: OHLCV[]): Record<MarketRegime, number> {
    const returns = this.calculateReturns(ohlcv)
    this.hmm.train(returns, 5)
    const states = this.hmm.decode(returns)
    const probabilities = this.calculateStateProbabilities(returns, states)

    const result: Record<MarketRegime, number> = {} as Record<MarketRegime, number>
    for (let i = 0; i < this.regimeNames.length; i++) {
      result[this.regimeNames[i]] = probabilities[i] || 0
    }

    return result
  }

  /**
   * Calculate returns
   */
  private calculateReturns(ohlcv: OHLCV[]): number[] {
    const returns: number[] = []
    for (let i = 1; i < ohlcv.length; i++) {
      returns.push(Math.log(ohlcv[i].close / ohlcv[i - 1].close))
    }
    return returns
  }

  /**
   * Calculate rolling volatility
   */
  private calculateRollingVolatility(ohlcv: OHLCV[], window: number): number[] {
    const volatilities: number[] = []
    for (let i = window; i <= ohlcv.length; i++) {
      const returns = this.calculateReturns(ohlcv.slice(i - window, i))
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length
      const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length)
      volatilities.push(std)
    }
    return volatilities
  }

  /**
   * Calculate trend strength
   */
  private calculateTrendStrength(ohlcv: OHLCV[], window: number): number[] {
    const trends: number[] = []
    for (let i = window; i <= ohlcv.length; i++) {
      const windowData = ohlcv.slice(i - window, i)
      const closes = windowData.map((o) => o.close)
      const first = closes[0]
      const last = closes[closes.length - 1]
      const trend = (last - first) / first
      trends.push(trend)
    }
    return trends
  }

  /**
   * Calculate state probabilities
   */
  private calculateStateProbabilities(returns: number[], states: number[]): number[] {
    const counts = new Array(this.regimeNames.length).fill(0)
    for (const state of states) {
      counts[state]++
    }

    const total = states.length
    return counts.map((c) => c / total)
  }

  /**
   * Get regime history
   */
  getHistory(): RegimeState[] {
    return [...this.history]
  }

  /**
   * Get regime transitions
   */
  getTransitions(): RegimeHistory[] {
    return [...this.regimeHistory]
  }
}

// Singleton instance
export const regimeDetector = new RegimeDetector()
