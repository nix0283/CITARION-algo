/**
 * SELF-LEARNING ENGINE
 *
 * Main orchestrator for bot parameter optimization.
 * Coordinates genetic algorithm with backtesting.
 */

import { GeneticOptimizer, defaultGeneticConfig } from './genetic-optimizer';
import type {
  Gene,
  Chromosome,
  LearningTask,
  OptimizationResult,
  BotParameters,
  BotOptimizationConfig,
  AdaptiveConfig,
  LearningMemory,
  TradeOutcome,
  FitnessFunction,
} from './types';

export class SelfLearningEngine {
  private optimizer: GeneticOptimizer;
  private tasks: Map<string, LearningTask> = new Map();
  private memory: LearningMemory;
  private adaptiveConfig: AdaptiveConfig;

  constructor(adaptiveConfig: Partial<AdaptiveConfig> = {}) {
    this.optimizer = new GeneticOptimizer(defaultGeneticConfig);
    this.adaptiveConfig = {
      enableOnlineLearning: true,
      learningRateDecay: 0.99,
      minLearningRate: 0.01,
      memoryWindow: 100,
      explorationRate: 0.1,
      explorationDecay: 0.995,
      ...adaptiveConfig,
    };
    this.memory = {
      trades: [],
      parameterHistory: [],
      regimeMemory: new Map(),
    };
  }

  /**
   * Create optimization task for a bot
   */
  public createTask(
    botCode: string,
    parameters: Gene[],
    fitnessFunction: FitnessFunction,
    constraints: any[] = []
  ): string {
    const taskId = `task-${botCode}-${Date.now()}`;
    
    const task: LearningTask = {
      id: taskId,
      botCode,
      parameters,
      fitnessFunction,
      constraints,
      status: 'pending',
    };

    this.tasks.set(taskId, task);
    return taskId;
  }

  /**
   * Run optimization task
   */
  public async runTask(taskId: string): Promise<OptimizationResult | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.status = 'running';
    task.startedAt = Date.now();

    try {
      const result = await this.optimizer.optimize(
        task.parameters,
        task.fitnessFunction,
        task.constraints
      );

      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;

      // Store in memory
      this.memory.parameterHistory.push({
        params: this.genesToParams(result.bestChromosome.genes),
        performance: result.bestChromosome.fitness,
      });

      // Trim memory
      if (this.memory.parameterHistory.length > this.adaptiveConfig.memoryWindow) {
        this.memory.parameterHistory.shift();
      }

      return result;
    } catch (error) {
      task.status = 'failed';
      task.completedAt = Date.now();
      throw error;
    }
  }

  /**
   * Create standard bot parameter template
   */
  public createBotParameterTemplate(config?: BotOptimizationConfig): Gene[] {
    const ranges = config?.parameterRanges || {
      riskPerTrade: { min: 0.005, max: 0.05 },
      stopLossAtr: { min: 1.0, max: 4.0 },
      takeProfitRR: { min: 1.0, max: 5.0 },
      trailingActivation: { min: 0.5, max: 5.0 },
      trailingDistance: { min: 0.3, max: 3.0 },
      positionMultiplier: { min: 0.5, max: 2.0 },
      signalThreshold: { min: 0.3, max: 0.9 },
      timeFilterStart: { min: 0, max: 12 },
      timeFilterEnd: { min: 12, max: 24 },
    };

    return [
      { name: 'riskPerTrade', value: 0.02, min: ranges.riskPerTrade.min, max: ranges.riskPerTrade.max, mutationRate: 0.1 },
      { name: 'stopLossAtr', value: 2.0, min: ranges.stopLossAtr.min, max: ranges.stopLossAtr.max, mutationRate: 0.15 },
      { name: 'takeProfitRR', value: 2.0, min: ranges.takeProfitRR.min, max: ranges.takeProfitRR.max, mutationRate: 0.15 },
      { name: 'trailingActivation', value: 1.5, min: ranges.trailingActivation.min, max: ranges.trailingActivation.max, mutationRate: 0.1 },
      { name: 'trailingDistance', value: 1.0, min: ranges.trailingDistance.min, max: ranges.trailingDistance.max, mutationRate: 0.1 },
      { name: 'positionMultiplier', value: 1.0, min: ranges.positionMultiplier.min, max: ranges.positionMultiplier.max, mutationRate: 0.1 },
      { name: 'signalThreshold', value: 0.6, min: ranges.signalThreshold.min, max: ranges.signalThreshold.max, mutationRate: 0.1 },
      { name: 'timeFilterStart', value: 8, min: ranges.timeFilterStart.min, max: ranges.timeFilterStart.max, mutationRate: 0.05 },
      { name: 'timeFilterEnd', value: 20, min: ranges.timeFilterEnd.min, max: ranges.timeFilterEnd.max, mutationRate: 0.05 },
    ];
  }

  /**
   * Record trade outcome for online learning
   */
  public recordTradeOutcome(outcome: TradeOutcome): void {
    if (!this.adaptiveConfig.enableOnlineLearning) return;

    this.memory.trades.push(outcome);

    // Trim to memory window
    if (this.memory.trades.length > this.adaptiveConfig.memoryWindow) {
      this.memory.trades.shift();
    }

    // Store regime-specific parameters if trade was successful
    if (outcome.pnl > 0 && outcome.marketRegime) {
      this.memory.regimeMemory.set(outcome.marketRegime, outcome.parameters);
    }
  }

  /**
   * Get parameters for specific market regime
   */
  public getRegimeParameters(regime: string): BotParameters | null {
    return this.memory.regimeMemory.get(regime) || null;
  }

  /**
   * Get best parameters from history
   */
  public getBestParameters(): BotParameters | null {
    if (this.memory.parameterHistory.length === 0) return null;

    const sorted = [...this.memory.parameterHistory].sort((a, b) => b.performance - a.performance);
    return sorted[0]?.params || null;
  }

  /**
   * Get recent trade statistics
   */
  public getTradeStats(): {
    winRate: number;
    avgPnL: number;
    avgWin: number;
    avgLoss: number;
    sharpe: number;
  } {
    const trades = this.memory.trades;
    if (trades.length === 0) {
      return { winRate: 0.5, avgPnL: 0, avgWin: 0, avgLoss: 0, sharpe: 0 };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);

    const winRate = wins.length / trades.length;
    const avgPnL = trades.reduce((sum, t) => sum + t.pnlPct, 0) / trades.length;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnlPct, 0) / losses.length : 0;

    // Approximate Sharpe ratio
    const returns = trades.map(t => t.pnlPct);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const sharpe = variance > 0 ? avgReturn / Math.sqrt(variance) : 0;

    return { winRate, avgPnL, avgWin, avgLoss, sharpe };
  }

  /**
   * Suggest exploration vs exploitation
   */
  public shouldExplore(): boolean {
    return Math.random() < this.adaptiveConfig.explorationRate;
  }

  /**
   * Decay exploration rate
   */
  public decayExploration(): void {
    this.adaptiveConfig.explorationRate *= this.adaptiveConfig.explorationDecay;
    this.adaptiveConfig.explorationRate = Math.max(
      this.adaptiveConfig.explorationRate,
      0.01
    );
  }

  /**
   * Get task status
   */
  public getTaskStatus(taskId: string): LearningTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get all tasks
   */
  public getAllTasks(): LearningTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Clear completed tasks
   */
  public clearCompletedTasks(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id);
      }
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private genesToParams(genes: Gene[]): BotParameters {
    const params = {} as BotParameters;
    for (const gene of genes) {
      (params as unknown as Record<string, unknown>)[gene.name] = gene.value;
    }
    return params;
  }
}

// =============================================================================
// FITNESS FUNCTIONS
// =============================================================================

/**
 * Create fitness function for backtesting
 */
export function createBacktestFitnessFunction(
  backtestFn: (params: BotParameters) => Promise<{
    profit: number;
    winRate: number;
    trades: number;
    drawdown: number;
    sharpe: number;
  }>,
  weights: {
    profit: number;
    winRate: number;
    sharpe: number;
    drawdown: number;
    trades: number;
  }
): FitnessFunction {
  return async (genes: Gene[]) => {
    const params = {} as BotParameters;
    for (const gene of genes) {
      (params as unknown as Record<string, unknown>)[gene.name] = gene.value;
    }

    try {
      const result = await backtestFn(params);

      // Minimum trades requirement
      if (result.trades < 10) return -Infinity;

      // Composite fitness score
      const fitness =
        result.profit * weights.profit +
        result.winRate * weights.winRate * 100 +
        result.sharpe * weights.sharpe * 10 -
        result.drawdown * weights.drawdown * 100 +
        Math.min(result.trades, 100) * weights.trades * 0.1;

      return fitness;
    } catch {
      return -Infinity;
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { GeneticOptimizer } from './genetic-optimizer';
export * from './types';

export const defaultAdaptiveConfig: AdaptiveConfig = {
  enableOnlineLearning: true,
  learningRateDecay: 0.99,
  minLearningRate: 0.01,
  memoryWindow: 100,
  explorationRate: 0.1,
  explorationDecay: 0.995,
};
