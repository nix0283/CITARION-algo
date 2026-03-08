/**
 * PPO Agent
 * Proximal Policy Optimization implementation for trading
 */

import type {
  AgentConfig,
  TrainingMetrics
} from './types'

/**
 * Actor-Critic Network
 */
class ActorCriticNetwork {
  private actorWeights: number[][]
  private criticWeights: number[]
  private inputSize: number
  private hiddenSize: number
  private actionSize: number

  constructor(inputSize: number, hiddenSize: number, actionSize: number) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.actionSize = actionSize

    // Initialize weights
    const scale = Math.sqrt(2 / (inputSize + hiddenSize))
    this.actorWeights = Array.from({ length: hiddenSize }, () =>
      Array.from({ length: actionSize }, () => (Math.random() - 0.5) * 2 * scale)
    )
    this.criticWeights = new Array(hiddenSize).fill(0).map(() => (Math.random() - 0.5) * scale)
  }

  private relu(x: number): number {
    return Math.max(0, x)
  }

  private softmax(values: number[]): number[] {
    const max = Math.max(...values)
    const exp = values.map((v) => Math.exp(v - max))
    const sum = exp.reduce((a, b) => a + b, 0)
    return exp.map((v) => v / sum)
  }

  forward(input: number[]): { actionProbs: number[]; value: number } {
    // Hidden layer
    const hidden: number[] = []
    for (let i = 0; i < this.actorWeights.length; i++) {
      let sum = 0
      for (let j = 0; j < input.length; j++) {
        sum += input[j] * this.actorWeights[i][j % this.actionSize]
      }
      hidden.push(this.relu(sum))
    }

    // Actor output (action probabilities)
    const actionLogits: number[] = []
    for (let a = 0; a < this.actionSize; a++) {
      let sum = 0
      for (let h = 0; h < hidden.length; h++) {
        sum += hidden[h] * this.actorWeights[h][a]
      }
      actionLogits.push(sum)
    }
    const actionProbs = this.softmax(actionLogits)

    // Critic output (value)
    let value = 0
    for (let h = 0; h < hidden.length; h++) {
      value += hidden[h] * this.criticWeights[h]
    }

    return { actionProbs, value }
  }

  update(
    states: number[][],
    actions: number[],
    advantages: number[],
    returns: number[],
    oldProbs: number[][],
    learningRate: number,
    clipRatio: number
  ): { actorLoss: number; criticLoss: number } {
    let actorLoss = 0
    let criticLoss = 0

    for (let i = 0; i < states.length; i++) {
      const { actionProbs, value } = this.forward(states[i])
      const action = actions[i]
      const advantage = advantages[i]
      const oldProb = oldProbs[i][action]
      const newProb = actionProbs[action]

      // PPO clipped objective
      const ratio = newProb / (oldProb + 1e-8)
      const clippedRatio = Math.max(1 - clipRatio, Math.min(1 + clipRatio, ratio))
      const surrogate = Math.min(ratio * advantage, clippedRatio * advantage)
      actorLoss -= surrogate

      // Critic loss
      criticLoss += (returns[i] - value) ** 2

      // Update weights (simplified gradient descent)
      const gradient = (returns[i] - value) * learningRate
      for (let h = 0; h < this.criticWeights.length; h++) {
        this.criticWeights[h] += gradient
      }
    }

    return {
      actorLoss: actorLoss / states.length,
      criticLoss: criticLoss / states.length
    }
  }
}

/**
 * Experience storage for PPO
 */
interface PPOExperience {
  state: number[]
  action: number
  reward: number
  value: number
  logProb: number
  done: boolean
}

/**
 * PPO Agent
 */
export class PPOAgent {
  private network: ActorCriticNetwork
  private config: AgentConfig & { clipRatio: number; gaeLambda: number }
  private experiences: PPOExperience[] = []
  private actionSize: number = 5

  constructor(stateSize: number, config?: Partial<AgentConfig> & { clipRatio?: number; gaeLambda?: number }) {
    this.config = {
      learningRate: 0.0003,
      gamma: 0.99,
      epsilon: 0.2, // Clip ratio
      epsilonMin: 0.01,
      epsilonDecay: 0.99,
      batchSize: 64,
      memorySize: 2048,
      targetUpdateFreq: 10,
      hiddenLayers: [64],
      clipRatio: 0.2,
      gaeLambda: 0.95,
      ...config
    }

    this.network = new ActorCriticNetwork(
      stateSize,
      this.config.hiddenLayers[0] || 64,
      this.actionSize
    )
  }

  /**
   * Select action
   */
  selectAction(state: number[]): { action: number; logProb: number; value: number } {
    const { actionProbs, value } = this.network.forward(state)
    
    // Sample action from distribution
    const random = Math.random()
    let cumulative = 0
    let action = 0
    for (let i = 0; i < actionProbs.length; i++) {
      cumulative += actionProbs[i]
      if (random <= cumulative) {
        action = i
        break
      }
    }

    const logProb = Math.log(actionProbs[action] + 1e-8)

    return { action, logProb, value }
  }

  /**
   * Store experience
   */
  storeExperience(
    state: number[],
    action: number,
    reward: number,
    value: number,
    logProb: number,
    done: boolean
  ): void {
    this.experiences.push({ state, action, reward, value, logProb, done })

    if (this.experiences.length >= this.config.memorySize) {
      this.update()
      this.experiences = []
    }
  }

  /**
   * Update policy using PPO
   */
  private update(): void {
    if (this.experiences.length < 2) return

    // Calculate advantages using GAE
    const advantages = this.calculateGAE()
    const returns = this.calculateReturns()

    // Get old probabilities
    const oldProbs: number[][] = []
    const states: number[][] = []
    const actions: number[] = []

    for (const exp of this.experiences) {
      const { actionProbs } = this.network.forward(exp.state)
      oldProbs.push(actionProbs)
      states.push(exp.state)
      actions.push(exp.action)
    }

    // Update network
    for (let epoch = 0; epoch < 10; epoch++) {
      this.network.update(
        states,
        actions,
        advantages,
        returns,
        oldProbs,
        this.config.learningRate,
        this.config.clipRatio
      )
    }
  }

  /**
   * Calculate Generalized Advantage Estimation
   */
  private calculateGAE(): number[] {
    const advantages: number[] = []
    let gae = 0

    for (let i = this.experiences.length - 1; i >= 0; i--) {
      const exp = this.experiences[i]
      const nextValue = i < this.experiences.length - 1 ? this.experiences[i + 1].value : 0

      const delta = exp.reward + this.config.gamma * nextValue * (exp.done ? 0 : 1) - exp.value
      gae = delta + this.config.gamma * this.config.gaeLambda * (exp.done ? 0 : 1) * gae

      advantages.unshift(gae)
    }

    // Normalize advantages
    const mean = advantages.reduce((a, b) => a + b, 0) / advantages.length
    const std = Math.sqrt(advantages.reduce((sum, a) => sum + (a - mean) ** 2, 0) / advantages.length)
    
    return advantages.map((a) => std > 0 ? (a - mean) / std : 0)
  }

  /**
   * Calculate returns
   */
  private calculateReturns(): number[] {
    const returns: number[] = []
    let ret = 0

    for (let i = this.experiences.length - 1; i >= 0; i--) {
      const exp = this.experiences[i]
      ret = exp.reward + this.config.gamma * ret * (exp.done ? 0 : 1)
      returns.unshift(ret)
    }

    return returns
  }

  /**
   * Get action from index
   */
  getActionFromIndex(index: number): string {
    const actions = ['hold', 'long', 'short', 'close_long', 'close_short']
    return actions[index] || 'hold'
  }
}

/**
 * SAC Agent (Soft Actor-Critic)
 */
export class SACAgent {
  private config: AgentConfig & { entropyCoef: number; targetEntropy: number }
  private actorWeights: number[][]
  private critic1Weights: number[][]
  private critic2Weights: number[][]
  private targetCritic1Weights: number[][]
  private targetCritic2Weights: number[][]
  private logAlpha: number
  private actionSize: number = 5
  private stateSize: number

  constructor(stateSize: number, config?: Partial<AgentConfig> & { entropyCoef?: number }) {
    this.stateSize = stateSize
    this.config = {
      learningRate: 0.0003,
      gamma: 0.99,
      epsilon: 1.0,
      epsilonMin: 0.01,
      epsilonDecay: 0.99,
      batchSize: 256,
      memorySize: 100000,
      targetUpdateFreq: 1,
      hiddenLayers: [256, 256],
      entropyCoef: 0.2,
      targetEntropy: -Math.log(5), // -dim(A)
      ...config
    }

    const hiddenSize = this.config.hiddenLayers[0] || 256
    this.actorWeights = this.initWeights(hiddenSize, this.actionSize)
    this.critic1Weights = this.initWeights(stateSize, hiddenSize)
    this.critic2Weights = this.initWeights(stateSize, hiddenSize)
    this.targetCritic1Weights = this.critic1Weights.map((row) => [...row])
    this.targetCritic2Weights = this.critic2Weights.map((row) => [...row])
    this.logAlpha = 0
  }

  private initWeights(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2 / (rows + cols))
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 2 * scale)
    )
  }

  /**
   * Select action with entropy regularization
   */
  selectAction(state: number[], training: boolean = true): number {
    // Simplified: use deterministic action
    const actionProbs = this.getActorProbs(state)
    
    if (training) {
      // Sample from distribution
      const random = Math.random()
      let cumulative = 0
      for (let i = 0; i < actionProbs.length; i++) {
        cumulative += actionProbs[i]
        if (random <= cumulative) return i
      }
    }

    // Greedy action
    return actionProbs.indexOf(Math.max(...actionProbs))
  }

  private getActorProbs(state: number[]): number[] {
    // Simplified forward pass
    const logits = state.map((s, i) => s * (this.actorWeights[i % this.actorWeights.length]?.[0] || 0))
    const maxLogit = Math.max(...logits)
    const exp = logits.map((l) => Math.exp(l - maxLogit))
    const sum = exp.reduce((a, b) => a + b, 0)
    return exp.map((e) => e / sum)
  }

  /**
   * Get alpha (entropy coefficient)
   */
  getAlpha(): number {
    return Math.exp(this.logAlpha)
  }
}

// Export types
export type { AgentConfig, TrainingMetrics }
