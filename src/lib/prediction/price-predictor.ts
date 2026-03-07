/**
 * Price Predictor
 * Multi-model price prediction system
 */

import type { OHLCV } from '../ml-pipeline/types'

export interface PredictionResult {
  timestamp: number
  prediction: number
  confidence: number
  horizon: string
  model: string
  features?: Record<string, number>
}

export interface ModelPerformance {
  mse: number
  mae: number
  directionalAccuracy: number
  sharpeRatio: number
  lastUpdated: number
}

/**
 * LSTM-style sequence predictor (simplified)
 */
class LSTMStylePredictor {
  private weights: number[][] = []
  private biases: number[] = []
  private hiddenState: number[] = []
  private inputSize: number
  private hiddenSize: number
  private outputSize: number

  constructor(inputSize: number, hiddenSize: number = 64, outputSize: number = 1) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.outputSize = outputSize

    // Initialize weights
    const scale = Math.sqrt(2 / (inputSize + hiddenSize))
    this.weights = Array.from({ length: hiddenSize }, () =>
      Array.from({ length: inputSize + hiddenSize }, () => (Math.random() - 0.5) * 2 * scale)
    )
    this.biases = new Array(hiddenSize).fill(0)
    this.hiddenState = new Array(hiddenSize).fill(0)
  }

  forward(input: number[]): number {
    // Combine input with hidden state
    const combined = [...input, ...this.hiddenState]

    // Compute new hidden state
    for (let i = 0; i < this.hiddenSize; i++) {
      let sum = this.biases[i]
      for (let j = 0; j < combined.length; j++) {
        sum += combined[j] * (this.weights[i][j] || 0)
      }
      // Tanh activation (LSTM-style)
      this.hiddenState[i] = Math.tanh(sum)
    }

    // Output layer
    let output = 0
    for (let i = 0; i < this.hiddenSize; i++) {
      output += this.hiddenState[i] * 0.1 // Simple linear output
    }

    return output
  }

  resetState(): void {
    this.hiddenState = new Array(this.hiddenSize).fill(0)
  }

  train(inputs: number[][], targets: number[], learningRate: number = 0.001): number {
    let totalLoss = 0

    for (let i = 0; i < inputs.length; i++) {
      const prediction = this.forward(inputs[i])
      const error = targets[i] - prediction
      totalLoss += error * error

      // Simple gradient update
      for (let j = 0; j < this.hiddenSize; j++) {
        this.biases[j] += learningRate * error * this.hiddenState[j]
      }
    }

    return totalLoss / inputs.length
  }
}

/**
 * Transformer-style attention predictor (simplified)
 */
class AttentionPredictor {
  private queryWeights: number[][]
  private keyWeights: number[][]
  private valueWeights: number[][]
  private inputSize: number
  private attentionSize: number

  constructor(inputSize: number, attentionSize: number = 32) {
    this.inputSize = inputSize
    this.attentionSize = attentionSize

    const scale = Math.sqrt(2 / inputSize)
    this.queryWeights = this.initWeights(inputSize, attentionSize, scale)
    this.keyWeights = this.initWeights(inputSize, attentionSize, scale)
    this.valueWeights = this.initWeights(inputSize, attentionSize, scale)
  }

  private initWeights(rows: number, cols: number, scale: number): number[][] {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 2 * scale)
    )
  }

  attention(inputs: number[][]): number[][] {
    const seqLen = inputs.length
    const outputs: number[][] = []

    // Compute Q, K, V for each position
    const queries = inputs.map((inp) => this.project(inp, this.queryWeights))
    const keys = inputs.map((inp) => this.project(inp, this.keyWeights))
    const values = inputs.map((inp) => this.project(inp, this.valueWeights))

    for (let i = 0; i < seqLen; i++) {
      // Compute attention scores
      const scores = keys.map((k) => {
        let dot = 0
        for (let j = 0; j < this.attentionSize; j++) {
          dot += queries[i][j] * k[j]
        }
        return dot / Math.sqrt(this.attentionSize)
      })

      // Softmax
      const maxScore = Math.max(...scores)
      const expScores = scores.map((s) => Math.exp(s - maxScore))
      const sumExp = expScores.reduce((a, b) => a + b, 0)
      const attentionWeights = expScores.map((e) => e / sumExp)

      // Weighted sum of values
      const output = new Array(this.attentionSize).fill(0)
      for (let j = 0; j < seqLen; j++) {
        for (let k = 0; k < this.attentionSize; k++) {
          output[k] += attentionWeights[j] * values[j][k]
        }
      }

      outputs.push(output)
    }

    return outputs
  }

  private project(input: number[], weights: number[][]): number[] {
    return weights[0].map((_, j) => {
      let sum = 0
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * (weights[i]?.[j] || 0)
      }
      return sum
    })
  }

  predict(sequence: number[][]): number {
    const attentionOutputs = this.attention(sequence)
    const lastOutput = attentionOutputs[attentionOutputs.length - 1]

    // Simple aggregation for prediction
    return lastOutput.reduce((a, b) => a + b, 0) / lastOutput.length
  }
}

/**
 * Ensemble predictor combining multiple models
 */
class EnsemblePredictor {
  private models: Array<{ model: LSTMStylePredictor | AttentionPredictor; weight: number }> = []

  addModel(model: LSTMStylePredictor | AttentionPredictor, weight: number = 1): void {
    this.models.push({ model, weight })
  }

  predict(input: number[] | number[][]): number {
    if (this.models.length === 0) return 0

    let totalPrediction = 0
    let totalWeight = 0

    for (const { model, weight } of this.models) {
      let pred: number
      if (model instanceof LSTMStylePredictor) {
        pred = model.forward(input as number[])
      } else {
        pred = model.predict(input as number[][])
      }
      totalPrediction += pred * weight
      totalWeight += weight
    }

    return totalPrediction / totalWeight
  }

  getConfidence(): number {
    // Higher confidence with more models
    return Math.min(0.95, 0.5 + this.models.length * 0.1)
  }
}

/**
 * Main Price Predictor class
 */
export class PricePredictor {
  private lstmModel: LSTMStylePredictor
  private attentionModel: AttentionPredictor
  private ensembleModel: EnsemblePredictor
  private performance: ModelPerformance
  private lookback: number = 20

  constructor() {
    this.lstmModel = new LSTMStylePredictor(20, 64, 1)
    this.attentionModel = new AttentionPredictor(20, 32)
    this.ensembleModel = new EnsemblePredictor()

    // Add models to ensemble
    this.ensembleModel.addModel(this.lstmModel, 1)
    this.ensembleModel.addModel(this.attentionModel, 1)

    this.performance = {
      mse: 0,
      mae: 0,
      directionalAccuracy: 0.5,
      sharpeRatio: 0,
      lastUpdated: Date.now()
    }
  }

  /**
   * Train on historical data
   */
  train(ohlcv: OHLCV[], epochs: number = 10): void {
    const closes = ohlcv.map((o) => o.close)
    const normalizedCloses = this.normalizePrices(closes)

    // Create sequences
    const sequences: number[][] = []
    const targets: number[] = []

    for (let i = this.lookback; i < normalizedCloses.length; i++) {
      sequences.push(normalizedCloses.slice(i - this.lookback, i))
      targets.push(normalizedCloses[i])
    }

    // Train LSTM
    for (let epoch = 0; epoch < epochs; epoch++) {
      const loss = this.lstmModel.train(sequences, targets, 0.001)
      console.log(`LSTM Epoch ${epoch + 1}, Loss: ${loss.toFixed(6)}`)
    }

    this.performance.lastUpdated = Date.now()
  }

  /**
   * Predict future price
   */
  predict(ohlcv: OHLCV[], horizon: string = '1h'): PredictionResult {
    const closes = ohlcv.slice(-this.lookback).map((o) => o.close)
    const normalizedCloses = this.normalizePrices(closes)
    const lastClose = closes[closes.length - 1]

    // Get prediction
    const normalizedPrediction = this.ensembleModel.predict(normalizedCloses)
    
    // Denormalize
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length
    const std = Math.sqrt(closes.reduce((sum, c) => sum + (c - mean) ** 2, 0) / closes.length)
    const prediction = normalizedPrediction * std + mean

    // Scale by horizon
    const horizonMultipliers: Record<string, number> = {
      '1h': 1,
      '4h': 1.5,
      '24h': 2,
      '7d': 3
    }
    const scaledPrediction = lastClose + (prediction - lastClose) * (horizonMultipliers[horizon] || 1)

    return {
      timestamp: ohlcv[ohlcv.length - 1].timestamp,
      prediction: scaledPrediction,
      confidence: this.ensembleModel.getConfidence() * this.performance.directionalAccuracy,
      horizon,
      model: 'ensemble',
      features: {
        lstm_contribution: 0.5,
        attention_contribution: 0.5,
        price_momentum: (scaledPrediction - lastClose) / lastClose
      }
    }
  }

  /**
   * Multi-horizon prediction
   */
  predictMultiHorizon(ohlcv: OHLCV[]): Record<string, PredictionResult> {
    const horizons = ['1h', '4h', '24h', '7d']
    const results: Record<string, PredictionResult> = {}

    for (const horizon of horizons) {
      results[horizon] = this.predict(ohlcv, horizon)
    }

    return results
  }

  /**
   * Calculate prediction confidence intervals
   */
  getConfidenceInterval(prediction: PredictionResult, confidence: number = 0.95): {
    lower: number
    upper: number
  } {
    const stdError = (1 - prediction.confidence) * Math.abs(prediction.prediction)
    const zScore = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.58 : 1.0

    return {
      lower: prediction.prediction - zScore * stdError,
      upper: prediction.prediction + zScore * stdError
    }
  }

  /**
   * Update performance metrics
   */
  updatePerformance(actuals: number[], predictions: number[]): void {
    if (actuals.length !== predictions.length || actuals.length === 0) return

    // MSE
    const mse = actuals.reduce((sum, a, i) => sum + (a - predictions[i]) ** 2, 0) / actuals.length

    // MAE
    const mae = actuals.reduce((sum, a, i) => sum + Math.abs(a - predictions[i]), 0) / actuals.length

    // Directional accuracy
    let correct = 0
    for (let i = 1; i < actuals.length; i++) {
      const actualDir = actuals[i] > actuals[i - 1]
      const predDir = predictions[i] > predictions[i - 1]
      if (actualDir === predDir) correct++
    }
    const directionalAccuracy = correct / (actuals.length - 1)

    this.performance = {
      mse,
      mae,
      directionalAccuracy,
      sharpeRatio: this.calculateSharpeFromPredictions(actuals, predictions),
      lastUpdated: Date.now()
    }
  }

  /**
   * Get model performance
   */
  getPerformance(): ModelPerformance {
    return { ...this.performance }
  }

  /**
   * Normalize prices for neural network
   */
  private normalizePrices(prices: number[]): number[] {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length
    const std = Math.sqrt(prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length)
    return prices.map((p) => std > 0 ? (p - mean) / std : 0)
  }

  /**
   * Calculate Sharpe ratio from predictions
   */
  private calculateSharpeFromPredictions(actuals: number[], predictions: number[]): number {
    if (actuals.length < 2) return 0

    // Calculate returns from predictions
    const returns: number[] = []
    for (let i = 1; i < actuals.length; i++) {
      const predReturn = (predictions[i] - predictions[i - 1]) / predictions[i - 1]
      const actualReturn = (actuals[i] - actuals[i - 1]) / actuals[i - 1]
      // Trading return based on prediction direction
      returns.push(predReturn > 0 ? actualReturn : -actualReturn)
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length)

    return std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : 0
  }
}

// Singleton instance
export const pricePredictor = new PricePredictor()
