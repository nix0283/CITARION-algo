/**
 * RL Agents Module
 * Reinforcement Learning Trading Agents
 */

// Types
export type {
  ActionType,
  Action,
  State,
  Observation,
  StepResult,
  EnvironmentConfig,
  AgentConfig,
  Experience,
  TrainingMetrics,
  TrainingConfig,
  AgentCheckpoint,
  NetworkLayer,
  NeuralNetwork,
  Policy,
  ValueFunction,
  ReplayBufferConfig,
  EvaluationResult,
  TradeRecord,
  MultiAgentConfig,
  AgentMessage
} from './types'

// Components
export { TradingEnvironment } from './environment'
export { DQNAgent, trainDQN } from './dqn-agent'
export { PPOAgent, SACAgent } from './ppo-agent'
export { TrainingPipeline, quickTrain } from './training-pipeline'
export type { TrainingResult, AgentType } from './training-pipeline'

// Factory function
import { DQNAgent } from './dqn-agent'
import { PPOAgent, SACAgent } from './ppo-agent'
import type { AgentConfig } from './types'

export type Agent = DQNAgent | PPOAgent | SACAgent

export function createAgent(
  type: 'dqn' | 'ppo' | 'sac',
  stateSize: number,
  config?: Partial<AgentConfig>
): Agent {
  switch (type) {
    case 'dqn':
      return new DQNAgent(stateSize, config)
    case 'ppo':
      return new PPOAgent(stateSize, config)
    case 'sac':
      return new SACAgent(stateSize, config)
    default:
      return new DQNAgent(stateSize, config)
  }
}

/**
 * Default configurations for different trading strategies
 */
export const AGENT_PRESETS = {
  conservative: {
    learningRate: 0.0001,
    gamma: 0.99,
    epsilon: 0.5,
    epsilonMin: 0.01,
    epsilonDecay: 0.999,
    batchSize: 64,
    memorySize: 50000,
    hiddenLayers: [128, 128]
  },
  aggressive: {
    learningRate: 0.001,
    gamma: 0.95,
    epsilon: 1.0,
    epsilonMin: 0.05,
    epsilonDecay: 0.99,
    batchSize: 32,
    memorySize: 10000,
    hiddenLayers: [64, 64]
  },
  scalping: {
    learningRate: 0.0005,
    gamma: 0.9,
    epsilon: 0.8,
    epsilonMin: 0.1,
    epsilonDecay: 0.995,
    batchSize: 128,
    memorySize: 100000,
    hiddenLayers: [256, 256]
  },
  swing: {
    learningRate: 0.0003,
    gamma: 0.99,
    epsilon: 0.7,
    epsilonMin: 0.01,
    epsilonDecay: 0.998,
    batchSize: 64,
    memorySize: 20000,
    hiddenLayers: [128, 64]
  }
} as const
