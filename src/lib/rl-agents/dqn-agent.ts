/**
 * DQN Agent
 * Deep Q-Network implementation for trading
 */

import type {
  AgentConfig,
  Experience,
  TrainingMetrics,
  NeuralNetwork,
  NetworkLayer
} from './types'

/**
 * Simple Neural Network for DQN
 */
class SimpleNN {
  private layers: NetworkLayer[] = []

  constructor(inputSize: number, hiddenLayers: number[], outputSize: number) {
    let prevSize = inputSize

    for (const size of hiddenLayers) {
      this.layers.push({
        weights: this.initWeights(prevSize, size),
        biases: new Array(size).fill(0),
        activation: 'relu'
      })
      prevSize = size
    }

    this.layers.push({
      weights: this.initWeights(prevSize, outputSize),
      biases: new Array(outputSize).fill(0),
      activation: 'linear'
    })
  }

  private initWeights(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2 / (rows + cols))
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 2 * scale)
    )
  }

  forward(input: number[]): number[] {
    let output = input

    for (const layer of this.layers) {
      const newOutput: number[] = []

      for (let j = 0; j < layer.weights[0].length; j++) {
        let sum = layer.biases[j]
        for (let i = 0; i < output.length; i++) {
          sum += output[i] * layer.weights[i][j]
        }

        // Activation
        if (layer.activation === 'relu') {
          sum = Math.max(0, sum)
        } else if (layer.activation === 'tanh') {
          sum = Math.tanh(sum)
        }

        newOutput.push(sum)
      }

      output = newOutput
    }

    return output
  }

  backward(input: number[], target: number[], learningRate: number): void {
    // Simplified backpropagation
    const output = this.forward(input)
    const errors = target.map((t, i) => t - output[i])

    // Update last layer
    const lastLayer = this.layers[this.layers.length - 1]
    for (let i = 0; i < lastLayer.weights.length; i++) {
      for (let j = 0; j < lastLayer.weights[i].length; j++) {
        lastLayer.weights[i][j] += learningRate * errors[j] * input[i % input.length]
      }
      lastLayer.biases[i % lastLayer.biases.length] += learningRate * errors[i % errors.length]
    }
  }

  copy(): SimpleNN {
    const copy = new SimpleNN(1, [], 1)
    copy.layers = this.layers.map((l) => ({
      weights: l.weights.map((row) => [...row]),
      biases: [...l.biases],
      activation: l.activation
    }))
    return copy
  }
}

/**
 * Experience Replay Buffer
 */
class ReplayBuffer {
  private buffer: Experience[] = []
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  push(experience: Experience): void {
    this.buffer.push(experience)
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift()
    }
  }

  sample(batchSize: number): Experience[] {
    const batch: Experience[] = []
    for (let i = 0; i < Math.min(batchSize, this.buffer.length); i++) {
      const idx = Math.floor(Math.random() * this.buffer.length)
      batch.push(this.buffer[idx])
    }
    return batch
  }

  get length(): number {
    return this.buffer.length
  }
}

/**
 * DQN Agent
 */
export class DQNAgent {
  private config: AgentConfig
  private qNetwork: SimpleNN
  private targetNetwork: SimpleNN
  private replayBuffer: ReplayBuffer
  private epsilon: number
  private stepCount: number = 0
  private actionCount: number = 5 // hold, long, short, close_long, close_short
  private stateSize: number = 20

  constructor(stateSize: number, config?: Partial<AgentConfig>) {
    this.stateSize = stateSize
    this.config = {
      learningRate: 0.001,
      gamma: 0.99,
      epsilon: 1.0,
      epsilonMin: 0.01,
      epsilonDecay: 0.995,
      batchSize: 32,
      memorySize: 10000,
      targetUpdateFreq: 100,
      hiddenLayers: [64, 64],
      ...config
    }

    this.epsilon = this.config.epsilon
    this.qNetwork = new SimpleNN(stateSize, this.config.hiddenLayers, this.actionCount)
    this.targetNetwork = this.qNetwork.copy()
    this.replayBuffer = new ReplayBuffer(this.config.memorySize)
  }

  /**
   * Select action using epsilon-greedy policy
   */
  selectAction(state: number[], training: boolean = true): number {
    if (training && Math.random() < this.epsilon) {
      return Math.floor(Math.random() * this.actionCount)
    }

    const qValues = this.qNetwork.forward(state)
    return qValues.indexOf(Math.max(...qValues))
  }

  /**
   * Store experience and train
   */
  step(
    state: number[],
    action: number,
    reward: number,
    nextState: number[],
    done: boolean
  ): void {
    this.replayBuffer.push({ state, action, reward, nextState, done })
    this.stepCount++

    if (this.replayBuffer.length >= this.config.batchSize) {
      this.train()
    }

    // Update target network
    if (this.stepCount % this.config.targetUpdateFreq === 0) {
      this.targetNetwork = this.qNetwork.copy()
    }

    // Decay epsilon
    if (this.epsilon > this.config.epsilonMin) {
      this.epsilon *= this.config.epsilonDecay
    }
  }

  /**
   * Train on batch from replay buffer
   */
  private train(): void {
    const batch = this.replayBuffer.sample(this.config.batchSize)

    for (const exp of batch) {
      const currentQ = this.qNetwork.forward(exp.state)
      const targetQ = [...currentQ]

      if (exp.done) {
        targetQ[exp.action] = exp.reward
      } else {
        const nextQ = this.targetNetwork.forward(exp.nextState)
        targetQ[exp.action] = exp.reward + this.config.gamma * Math.max(...nextQ)
      }

      this.qNetwork.backward(exp.state, targetQ, this.config.learningRate)
    }
  }

  /**
   * Get action from index
   */
  getActionFromIndex(index: number): string {
    const actions = ['hold', 'long', 'short', 'close_long', 'close_short']
    return actions[index] || 'hold'
  }

  /**
   * Get current epsilon
   */
  getEpsilon(): number {
    return this.epsilon
  }

  /**
   * Save agent state
   */
  save(): { config: AgentConfig; epsilon: number; stepCount: number } {
    return {
      config: this.config,
      epsilon: this.epsilon,
      stepCount: this.stepCount
    }
  }

  /**
   * Load agent state
   */
  load(state: { epsilon: number }): void {
    this.epsilon = state.epsilon
  }
}

/**
 * Training function for DQN agent
 */
export async function trainDQN(
  agent: DQNAgent,
  dataGenerator: () => number[][],
  episodes: number,
  maxStepsPerEpisode: number,
  onProgress?: (metrics: TrainingMetrics) => void
): Promise<TrainingMetrics[]> {
  const metricsHistory: TrainingMetrics[] = []

  for (let episode = 0; episode < episodes; episode++) {
    const data = dataGenerator()
    let totalReward = 0
    let totalPnl = 0
    let trades = 0
    let wins = 0

    for (let step = 0; step < Math.min(maxStepsPerEpisode, data.length - 1); step++) {
      const state = data[step]
      const action = agent.selectAction(state, true)
      
      // Simulate reward (simplified)
      const nextState = data[step + 1]
      const priceChange = (nextState[0] - state[0]) / state[0] // Normalized price change
      
      let reward = 0
      if (action === 1 && priceChange > 0) { // Long
        reward = priceChange
        trades++
        if (priceChange > 0) wins++
      } else if (action === 2 && priceChange < 0) { // Short
        reward = -priceChange
        trades++
        if (-priceChange > 0) wins++
      }

      totalReward += reward
      totalPnl += reward

      agent.step(state, action, reward, nextState, step === data.length - 2)
    }

    const metrics: TrainingMetrics = {
      episode,
      totalReward,
      totalPnl,
      tradeCount: trades,
      winRate: trades > 0 ? wins / trades : 0,
      sharpeRatio: 0, // Would calculate from returns
      maxDrawdown: 0, // Would calculate from equity curve
      avgEpisodeLength: maxStepsPerEpisode
    }

    metricsHistory.push(metrics)

    if (onProgress && episode % 10 === 0) {
      onProgress(metrics)
    }
  }

  return metricsHistory
}
