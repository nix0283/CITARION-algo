/**
 * RL Agent Types
 * Type definitions for Reinforcement Learning Trading Agents
 */

// Environment Types
export type ActionType = 'hold' | 'long' | 'short' | 'close_long' | 'close_short'

export interface Action {
  type: ActionType
  size?: number // Position size (0-1 for continuous)
}

export interface State {
  // Price data
  close: number
  high: number
  low: number
  volume: number
  
  // Technical indicators
  rsi: number
  macd: number
  macdSignal: number
  atr: number
  adx: number
  
  // Position info
  position: number // -1 to 1 (short to long)
  entryPrice: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  
  // Portfolio info
  balance: number
  equity: number
  drawdown: number
  
  // Market state
  volatility: number
  trend: number // -1 to 1
  momentum: number
  
  // Time features
  hour: number
  dayOfWeek: number
}

export interface Observation {
  state: State
  timestamp: number
}

export interface StepResult {
  observation: Observation
  reward: number
  done: boolean
  info: {
    pnl: number
    tradeCount: number
    position: number
    equity: number
  }
}

export interface EnvironmentConfig {
  initialBalance: number
  commissionRate: number
  slippageRate: number
  maxPosition: number
  leverage: number
  rewardScaling: number
  punishHolding: boolean
  rewardFunction: 'pnl' | 'sharpe' | 'sortino' | 'calmar'
}

// Agent Types
export interface AgentConfig {
  learningRate: number
  gamma: number // Discount factor
  epsilon: number // Exploration rate
  epsilonMin: number
  epsilonDecay: number
  batchSize: number
  memorySize: number
  targetUpdateFreq: number
  hiddenLayers: number[]
}

export interface Experience {
  state: number[]
  action: number
  reward: number
  nextState: number[]
  done: boolean
}

export interface TrainingMetrics {
  episode: number
  totalReward: number
  totalPnl: number
  tradeCount: number
  winRate: number
  sharpeRatio: number
  maxDrawdown: number
  avgEpisodeLength: number
}

export interface TrainingConfig {
  episodes: number
  maxStepsPerEpisode: number
  saveEvery: number
  evalEvery: number
  evalEpisodes: number
  earlyStoppingPatience: number
  earlyStoppingMetric: string
  logEvery: number
}

export interface AgentCheckpoint {
  episode: number
  metrics: TrainingMetrics
  config: AgentConfig
  timestamp: number
}

// Network Types
export interface NetworkLayer {
  weights: number[][]
  biases: number[]
  activation: 'relu' | 'sigmoid' | 'tanh' | 'linear'
}

export interface NeuralNetwork {
  layers: NetworkLayer[]
  inputSize: number
  outputSize: number
}

// Policy Types
export interface Policy {
  getAction(state: number[]): Action
  update(experiences: Experience[]): void
}

export interface ValueFunction {
  getValue(state: number[]): number
  update(state: number[], target: number): void
}

// Replay Buffer Types
export interface ReplayBufferConfig {
  maxSize: number
  batchSize: number
  prioritized: boolean
  alpha: number // Priority exponent
  beta: number // Importance sampling
}

// Evaluation Types
export interface EvaluationResult {
  totalReward: number
  totalPnl: number
  sharpeRatio: number
  maxDrawdown: number
  winRate: number
  profitFactor: number
  avgTradeDuration: number
  trades: TradeRecord[]
}

export interface TradeRecord {
  timestamp: number
  action: ActionType
  price: number
  size: number
  pnl: number
  reason: string
}

// Multi-Agent Types
export interface MultiAgentConfig {
  agents: AgentConfig[]
  cooperationEnabled: boolean
  communicationFreq: number
  ensembleMethod: 'voting' | 'averaging' | 'weighted'
}

export interface AgentMessage {
  fromAgent: string
  toAgent: string | 'all'
  type: 'observation' | 'action' | 'reward' | 'strategy'
  content: unknown
  timestamp: number
}
