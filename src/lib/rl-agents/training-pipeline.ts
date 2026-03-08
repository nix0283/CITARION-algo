/**
 * Training Pipeline
 * Complete training infrastructure for RL agents
 */

import type { OHLCV } from '../ml-pipeline/types'
import type { TrainingConfig, TrainingMetrics, AgentCheckpoint } from './types'
import { TradingEnvironment } from './environment'
import { DQNAgent, trainDQN } from './dqn-agent'
import { PPOAgent, SACAgent } from './ppo-agent'

export interface TrainingResult {
  agent: DQNAgent | PPOAgent | SACAgent
  metrics: TrainingMetrics[]
  bestMetrics: TrainingMetrics
  checkpoints: AgentCheckpoint[]
}

export type AgentType = 'dqn' | 'ppo' | 'sac'

/**
 * Training Pipeline Class
 */
export class TrainingPipeline {
  private environment: TradingEnvironment
  private checkpoints: AgentCheckpoint[] = []
  private metrics: TrainingMetrics[] = []
  private bestMetrics: TrainingMetrics | null = null
  private patienceCounter: number = 0

  constructor() {
    this.environment = new TradingEnvironment()
  }

  /**
   * Train agent
   */
  async train(
    agentType: AgentType,
    data: OHLCV[],
    config: Partial<TrainingConfig> = {}
  ): Promise<TrainingResult> {
    const trainingConfig: TrainingConfig = {
      episodes: 100,
      maxStepsPerEpisode: 500,
      saveEvery: 10,
      evalEvery: 5,
      evalEpisodes: 10,
      earlyStoppingPatience: 10,
      earlyStoppingMetric: 'totalReward',
      logEvery: 1,
      ...config
    }

    const stateSize = 20 // State array size
    let agent: DQNAgent | PPOAgent | SACAgent

    // Create agent
    switch (agentType) {
      case 'dqn':
        agent = new DQNAgent(stateSize, { learningRate: 0.001, gamma: 0.99 })
        break
      case 'ppo':
        agent = new PPOAgent(stateSize, { learningRate: 0.0003 })
        break
      case 'sac':
        agent = new SACAgent(stateSize, { learningRate: 0.0003 })
        break
      default:
        agent = new DQNAgent(stateSize)
    }

    // Training loop
    this.metrics = []
    this.checkpoints = []
    this.bestMetrics = null
    this.patienceCounter = 0

    for (let episode = 0; episode < trainingConfig.episodes; episode++) {
      // Reset environment
      let observation = this.environment.reset(data)
      let episodeReward = 0
      let episodePnl = 0
      let episodeTrades = 0

      for (let step = 0; step < trainingConfig.maxStepsPerEpisode; step++) {
        const state = this.environment.getStateArray()
        let action: number

        if (agent instanceof DQNAgent) {
          action = agent.selectAction(state, true)
        } else if (agent instanceof PPOAgent) {
          action = agent.selectAction(state).action
        } else {
          action = agent.selectAction(state, true)
        }

        // Take step
        const result = this.environment.step({
          type: this.getActionFromIndex(action),
          size: 1
        })

        // Store experience
        if (agent instanceof DQNAgent) {
          agent.step(state, action, result.reward, this.environment.getStateArray(), result.done)
        } else if (agent instanceof PPOAgent) {
          const { value, logProb } = (agent as PPOAgent).selectAction(state)
          agent.storeExperience(state, action, result.reward, value, logProb, result.done)
        }

        episodeReward += result.reward
        episodePnl = result.info.pnl
        episodeTrades = result.info.tradeCount

        if (result.done) break
      }

      // Record metrics
      const envStats = this.environment.getStats()
      const metrics: TrainingMetrics = {
        episode,
        totalReward: episodeReward,
        totalPnl: episodePnl,
        tradeCount: episodeTrades,
        winRate: envStats.winRate,
        sharpeRatio: envStats.sharpeRatio,
        maxDrawdown: envStats.maxDrawdown,
        avgEpisodeLength: trainingConfig.maxStepsPerEpisode
      }

      this.metrics.push(metrics)

      // Check for best
      if (!this.bestMetrics || this.isBetter(metrics, this.bestMetrics, trainingConfig.earlyStoppingMetric)) {
        this.bestMetrics = metrics
        this.patienceCounter = 0
      } else {
        this.patienceCounter++
      }

      // Save checkpoint
      if (episode % trainingConfig.saveEvery === 0) {
        this.saveCheckpoint(agent, episode, metrics)
      }

      // Early stopping
      if (this.patienceCounter >= trainingConfig.earlyStoppingPatience) {
        console.log(`Early stopping at episode ${episode}`)
        break
      }

      // Log progress
      if (episode % trainingConfig.logEvery === 0) {
        console.log(`Episode ${episode}: Reward=${episodeReward.toFixed(2)}, PnL=${episodePnl.toFixed(2)}, WinRate=${(envStats.winRate * 100).toFixed(1)}%`)
      }
    }

    return {
      agent,
      metrics: this.metrics,
      bestMetrics: this.bestMetrics || this.metrics[this.metrics.length - 1],
      checkpoints: this.checkpoints
    }
  }

  /**
   * Compare metrics
   */
  private isBetter(newMetrics: TrainingMetrics, oldMetrics: TrainingMetrics, metric: string): boolean {
    const newVal = (newMetrics as Record<string, number>)[metric] || 0
    const oldVal = (oldMetrics as Record<string, number>)[metric] || 0

    // Higher is better for most metrics
    const higherIsBetter = ['totalReward', 'totalPnl', 'winRate', 'sharpeRatio']
    
    if (higherIsBetter.includes(metric)) {
      return newVal > oldVal
    }
    return newVal < oldVal
  }

  /**
   * Save checkpoint
   */
  private saveCheckpoint(agent: DQNAgent | PPOAgent | SACAgent, episode: number, metrics: TrainingMetrics): void {
    this.checkpoints.push({
      episode,
      metrics,
      config: {
        learningRate: 0.001,
        gamma: 0.99,
        epsilon: agent instanceof DQNAgent ? agent.getEpsilon() : 0,
        epsilonMin: 0.01,
        epsilonDecay: 0.995,
        batchSize: 32,
        memorySize: 10000,
        targetUpdateFreq: 100,
        hiddenLayers: [64, 64]
      },
      timestamp: Date.now()
    })
  }

  /**
   * Get action from index
   */
  private getActionFromIndex(index: number): 'hold' | 'long' | 'short' | 'close_long' | 'close_short' {
    const actions: Array<'hold' | 'long' | 'short' | 'close_long' | 'close_short'> = 
      ['hold', 'long', 'short', 'close_long', 'close_short']
    return actions[index] || 'hold'
  }

  /**
   * Evaluate trained agent
   */
  evaluate(
    agent: DQNAgent | PPOAgent | SACAgent,
    data: OHLCV[],
    episodes: number = 10
  ): TrainingMetrics {
    let totalReward = 0
    let totalPnl = 0
    let totalTrades = 0
    let totalWins = 0
    const sharpeRatios: number[] = []
    const maxDrawdowns: number[] = []

    for (let ep = 0; ep < episodes; ep++) {
      this.environment.reset(data)
      let episodeReward = 0

      for (let step = 0; step < data.length - 50; step++) {
        const state = this.environment.getStateArray()
        let action: number

        if (agent instanceof DQNAgent) {
          action = agent.selectAction(state, false) // No exploration
        } else if (agent instanceof PPOAgent) {
          action = agent.selectAction(state).action
        } else {
          action = agent.selectAction(state, false)
        }

        const result = this.environment.step({
          type: this.getActionFromIndex(action),
          size: 1
        })

        episodeReward += result.reward

        if (result.done) break
      }

      const stats = this.environment.getStats()
      totalReward += episodeReward
      totalPnl += stats.totalPnl
      totalTrades += stats.tradeCount
      totalWins += stats.winRate * stats.tradeCount
      sharpeRatios.push(stats.sharpeRatio)
      maxDrawdowns.push(stats.maxDrawdown)
    }

    return {
      episode: 0,
      totalReward: totalReward / episodes,
      totalPnl: totalPnl / episodes,
      tradeCount: totalTrades / episodes,
      winRate: totalTrades > 0 ? totalWins / totalTrades : 0,
      sharpeRatio: sharpeRatios.reduce((a, b) => a + b, 0) / episodes,
      maxDrawdown: Math.max(...maxDrawdowns),
      avgEpisodeLength: data.length / episodes
    }
  }
}

/**
 * Quick train function
 */
export async function quickTrain(
  data: OHLCV[],
  agentType: AgentType = 'dqn',
  episodes: number = 50
): Promise<TrainingResult> {
  const pipeline = new TrainingPipeline()
  return pipeline.train(agentType, data, { episodes })
}

// Export components
export { TradingEnvironment } from './environment'
export { DQNAgent, trainDQN } from './dqn-agent'
export { PPOAgent, SACAgent } from './ppo-agent'
