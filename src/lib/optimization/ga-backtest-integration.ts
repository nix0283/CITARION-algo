/**
 * GA Backtest Integration
 * 
 * Production-ready integration between Genetic Algorithm and Backtesting Engine.
 * Replaces simulation-based fitness with real backtesting results.
 * 
 * CIT-025: Real backtesting integration for GA optimization
 */

import { GeneticEngine } from '@/lib/genetic/engine';
import { BacktestEngine } from '@/lib/backtesting/engine';
import { 
  Chromosome, 
  FitnessFunction, 
  FitnessContext,
  GAConfig,
  GAResult,
  Individual,
  DEFAULT_GA_CONFIG,
} from '@/lib/genetic/types';
import {
  BacktestConfig,
  BacktestResult,
  BacktestMetrics,
  createEmptyBacktestResult,
} from '@/lib/backtesting/types';
import { Candle, StrategySignal } from '@/lib/strategy/types';
import { getStrategyManager } from '@/lib/strategy/manager';

// ==================== TYPES ====================

export interface GABacktestConfig {
  /** Chromosome template for optimization */
  chromosomeTemplate: Chromosome;
  
  /** Historical candles for backtesting */
  candles: Candle[];
  
  /** Strategy ID to optimize */
  strategyId: string;
  
  /** Trading symbol */
  symbol: string;
  
  /** Initial balance for backtest */
  initialBalance: number;
  
  /** Fee percentage */
  feePercent: number;
  
  /** Max leverage */
  maxLeverage: number;
  
  /** Split ratio for train/test (e.g., 0.7 = 70% train, 30% test) */
  trainTestSplit: number;
  
  /** Enable walk-forward validation */
  enableWalkForward: boolean;
  
  /** Number of walk-forward windows */
  walkForwardWindows: number;
  
  /** Fitness objective */
  fitnessObjective: 'sharpe' | 'totalReturn' | 'winRate' | 'profitFactor' | 'calmar' | 'custom';
  
  /** Custom fitness function (optional) */
  customFitnessFn?: (metrics: BacktestMetrics) => number;
  
  /** GA configuration */
  gaConfig: Partial<GAConfig>;
  
  /** Parallel execution (worker threads) */
  parallelExecution: boolean;
  
  /** Max parallel workers */
  maxWorkers: number;
  
  /** Overfitting protection - penalize if train/test gap too large */
  overfittingPenalty: boolean;
  
  /** Maximum allowed train/test performance gap */
  maxTrainTestGap: number;
}

export interface GABacktestResult extends GAResult {
  trainResult: BacktestResult;
  testResult: BacktestResult | null;
  walkForwardResults?: BacktestResult[];
  metrics: BacktestMetrics;
  chromosome: Record<string, number | string>;
}

export interface OptimizationProgress {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  diversity: number;
  evaluatedIndividuals: number;
  bestParams: Record<string, number | string>;
  elapsedMs: number;
}

const DEFAULT_GA_BACKTEST_CONFIG: Partial<GABacktestConfig> = {
  trainTestSplit: 0.7,
  enableWalkForward: false,
  walkForwardWindows: 5,
  fitnessObjective: 'sharpe',
  parallelExecution: false,
  maxWorkers: 4,
  overfittingPenalty: true,
  maxTrainTestGap: 0.3,
  initialBalance: 10000,
  feePercent: 0.04,
  maxLeverage: 10,
};

// ==================== GA BACKTEST OPTIMIZER ====================

export class GABacktestOptimizer {
  private config: GABacktestConfig;
  private trainCandles: Candle[] = [];
  private testCandles: Candle[] = [];
  private engine: GeneticEngine | null = null;
  private startTime: number = 0;
  private progressCallbacks: ((progress: OptimizationProgress) => void)[] = [];

  constructor(config: Partial<GABacktestConfig> & {
    chromosomeTemplate: Chromosome;
    candles: Candle[];
    strategyId: string;
    symbol: string;
  }) {
    this.config = { ...DEFAULT_GA_BACKTEST_CONFIG, ...config } as GABacktestConfig;
    this.splitCandles();
  }

  /**
   * Split candles into train and test sets
   */
  private splitCandles(): void {
    const splitIndex = Math.floor(this.config.candles.length * this.config.trainTestSplit);
    this.trainCandles = this.config.candles.slice(0, splitIndex);
    this.testCandles = this.config.candles.slice(splitIndex);
  }

  /**
   * Create fitness function from backtesting
   */
  private createFitnessFunction(): FitnessFunction {
    return async (chromosome: Chromosome, context: FitnessContext): Promise<number> => {
      try {
        // Convert chromosome to strategy parameters
        const params = this.chromosomeToParams(chromosome);
        
        // Run backtest on training data
        const trainResult = await this.runBacktest(this.trainCandles, params);
        
        if (!trainResult || trainResult.status !== 'COMPLETED') {
          return -Infinity;
        }
        
        // Calculate base fitness from training
        const trainFitness = this.calculateFitness(trainResult.metrics);
        
        // Overfitting protection
        if (this.config.overfittingPenalty && this.testCandles.length > 0) {
          const testResult = await this.runBacktest(this.testCandles, params);
          
          if (testResult && testResult.status === 'COMPLETED') {
            const testFitness = this.calculateFitness(testResult.metrics);
            
            // Penalize if train/test gap is too large
            const gap = Math.abs(trainFitness - testFitness) / Math.max(Math.abs(trainFitness), 1);
            
            if (gap > this.config.maxTrainTestGap) {
              // Heavy penalty for overfitting
              return trainFitness * (1 - gap);
            }
            
            // Blend train and test fitness
            return trainFitness * 0.7 + testFitness * 0.3;
          }
        }
        
        return trainFitness;
        
      } catch (error) {
        console.error('[GA-Backtest] Fitness evaluation error:', error);
        return -Infinity;
      }
    };
  }

  /**
   * Run backtest with given parameters
   */
  private async runBacktest(
    candles: Candle[],
    params: Record<string, number | string>
  ): Promise<BacktestResult | null> {
    try {
      const strategyManager = getStrategyManager();
      const strategy = strategyManager.getStrategy(this.config.strategyId);
      
      if (!strategy) {
        console.error(`Strategy ${this.config.strategyId} not found`);
        return null;
      }
      
      // Create backtest config
      const backtestConfig: BacktestConfig = {
        id: `ga-backtest-${Date.now()}`,
        strategyId: this.config.strategyId,
        strategyParameters: params,
        symbol: this.config.symbol,
        timeframe: '1h', // Default
        initialBalance: this.config.initialBalance,
        feePercent: this.config.feePercent,
        maxLeverage: this.config.maxLeverage,
        maxOpenPositions: 3,
        maxDrawdown: 50,
        marginMode: 'isolated',
        tacticsSet: this.getDefaultTacticsSet(),
        allowShort: true,
      };
      
      // Run backtest
      const engine = new BacktestEngine(backtestConfig);
      return await engine.run(candles);
      
    } catch (error) {
      console.error('[GA-Backtest] Backtest error:', error);
      return null;
    }
  }

  /**
   * Calculate fitness from backtest metrics
   */
  private calculateFitness(metrics: BacktestMetrics): number {
    if (this.config.customFitnessFn) {
      return this.config.customFitnessFn(metrics);
    }
    
    switch (this.config.fitnessObjective) {
      case 'sharpe':
        return metrics.sharpeRatio;
        
      case 'totalReturn':
        return metrics.totalPnlPercent;
        
      case 'winRate':
        return metrics.winRate;
        
      case 'profitFactor':
        return metrics.profitFactor;
        
      case 'calmar':
        return metrics.calmarRatio;
        
      default:
        // Multi-objective blend
        return (
          metrics.sharpeRatio * 0.3 +
          metrics.totalPnlPercent * 0.02 +
          metrics.winRate * 0.01 +
          metrics.profitFactor * 0.1 -
          metrics.maxDrawdownPercent * 0.02
        );
    }
  }

  /**
   * Convert chromosome to strategy parameters
   */
  private chromosomeToParams(chromosome: Chromosome): Record<string, number | string> {
    const params: Record<string, number | string> = {};
    
    for (const gene of chromosome) {
      if (gene.type === 'categorical' && gene.categories) {
        params[gene.name] = gene.categories[Math.round(gene.value)];
      } else {
        params[gene.name] = gene.value;
      }
    }
    
    return params;
  }

  /**
   * Get default tactics set for backtesting
   */
  private getDefaultTacticsSet() {
    return {
      id: 'default-ga-tactics',
      name: 'Default GA Tactics',
      description: 'Default tactics for GA optimization',
      entry: {
        type: 'MARKET' as const,
        positionSize: 'PERCENT' as const,
        positionSizeValue: 2,
        maxEntries: 1,
        entryZoneType: 'SINGLE' as const,
        entryWeights: [],
      },
      takeProfit: {
        type: 'MULTIPLE_TARGETS' as const,
        targets: [
          { profitPercent: 3, closePercent: 50 },
          { profitPercent: 5, closePercent: 50 },
        ],
      },
      stopLoss: {
        type: 'PERCENT' as const,
        slPercent: 2,
        slTimeout: 0,
        slTimeoutUnit: 'SECONDS' as const,
        slOrderType: 'MARKET' as const,
      },
      trailing: {
        enabled: false,
        activationType: 'PERCENT_ABOVE_ENTRY' as const,
        activationValue: 3,
        trailingType: 'PERCENT' as const,
        trailingDistance: 1,
      },
    };
  }

  /**
   * Subscribe to optimization progress
   */
  onProgress(callback: (progress: OptimizationProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Notify progress callbacks
   */
  private notifyProgress(progress: OptimizationProgress): void {
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        console.error('[GA-Backtest] Progress callback error:', error);
      }
    }
  }

  /**
   * Run walk-forward validation
   */
  private async runWalkForwardValidation(
    bestParams: Record<string, number | string>
  ): Promise<BacktestResult[]> {
    const results: BacktestResult[] = [];
    const windowSize = Math.floor(this.config.candles.length / this.config.walkForwardWindows);
    
    for (let i = 0; i < this.config.walkForwardWindows; i++) {
      const startIdx = i * windowSize;
      const endIdx = startIdx + windowSize;
      const windowCandles = this.config.candles.slice(startIdx, endIdx);
      
      const result = await this.runBacktest(windowCandles, bestParams);
      if (result && result.status === 'COMPLETED') {
        results.push(result);
      }
    }
    
    return results;
  }

  /**
   * Run optimization
   */
  async optimize(): Promise<GABacktestResult> {
    this.startTime = Date.now();
    
    // Create fitness function
    const fitnessFn = this.createFitnessFunction();
    
    // Initialize GA engine
    this.engine = new GeneticEngine(
      {
        ...this.config.gaConfig,
        chromosomeTemplate: this.config.chromosomeTemplate,
      },
      fitnessFn
    );
    
    // Run optimization with progress reporting
    let lastGeneration = 0;
    const progressInterval = setInterval(() => {
      if (this.engine) {
        const population = this.engine.getPopulation();
        if (population && population.generation > lastGeneration) {
          lastGeneration = population.generation;
          const best = this.engine.getBest();
          this.notifyProgress({
            generation: population.generation,
            bestFitness: population.stats.bestFitness,
            avgFitness: population.stats.avgFitness,
            diversity: population.stats.diversity,
            evaluatedIndividuals: population.individuals.length,
            bestParams: best ? this.chromosomeToParams(best.chromosome) : {},
            elapsedMs: Date.now() - this.startTime,
          });
        }
      }
    }, 1000);
    
    try {
      // Run GA
      const gaResult = await this.engine.run();
      
      clearInterval(progressInterval);
      
      // Get best parameters
      const bestParams = this.engine.getBestParams() || {};
      
      // Run final backtests with best parameters
      const trainResult = await this.runBacktest(this.trainCandles, bestParams);
      const testResult = this.testCandles.length > 0
        ? await this.runBacktest(this.testCandles, bestParams)
        : null;
      
      // Walk-forward validation if enabled
      let walkForwardResults: BacktestResult[] | undefined;
      if (this.config.enableWalkForward) {
        walkForwardResults = await this.runWalkForwardValidation(bestParams);
      }
      
      return {
        ...gaResult,
        trainResult: trainResult || createEmptyBacktestResult({} as BacktestConfig),
        testResult,
        walkForwardResults,
        metrics: trainResult?.metrics || {} as BacktestMetrics,
        chromosome: bestParams,
      };
      
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  /**
   * Stop optimization
   */
  stop(): void {
    // Note: Current GA implementation doesn't support mid-run stop
    // This would need to be implemented with a cancellation token
    console.log('[GA-Backtest] Stop requested');
  }

  /**
   * Get current best parameters
   */
  getBestParams(): Record<string, number | string> | null {
    return this.engine?.getBestParams() || null;
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Create GA optimizer for trading strategy
 */
export function createGAOptimizer(
  config: Partial<GABacktestConfig> & {
    chromosomeTemplate: Chromosome;
    candles: Candle[];
    strategyId: string;
    symbol: string;
  }
): GABacktestOptimizer {
  return new GABacktestOptimizer(config);
}

/**
 * Quick optimization preset for RSI strategy
 */
export function createRSIOptimizer(
  candles: Candle[],
  symbol: string = 'BTCUSDT'
): GABacktestOptimizer {
  const chromosomeTemplate: Chromosome = [
    { name: 'rsiPeriod', type: 'discrete', min: 5, max: 30, value: 14 },
    { name: 'rsiOversold', type: 'continuous', min: 20, max: 35, value: 30 },
    { name: 'rsiOverbought', type: 'continuous', min: 65, max: 85, value: 70 },
    { name: 'stopLossPercent', type: 'continuous', min: 1, max: 5, value: 2 },
    { name: 'takeProfitPercent', type: 'continuous', min: 2, max: 10, value: 5 },
  ];
  
  return new GABacktestOptimizer({
    chromosomeTemplate,
    candles,
    strategyId: 'rsi-reversal',
    symbol,
    gaConfig: {
      populationSize: 50,
      termination: {
        maxGenerations: 30,
        targetFitness: 2.0,
        maxStagnation: 10,
      },
      operators: {
        selection: { method: 'tournament', tournamentSize: 3 },
        crossover: { method: 'blend', rate: 0.8, blendAlpha: 0.5 },
        mutation: { method: 'gaussian', rate: 0.1, strength: 0.2 },
        elitism: { enabled: true, percentage: 0.1 },
      },
    },
  });
}

/**
 * Quick optimization preset for MACD strategy
 */
export function createMACDOptimizer(
  candles: Candle[],
  symbol: string = 'BTCUSDT'
): GABacktestOptimizer {
  const chromosomeTemplate: Chromosome = [
    { name: 'macdFastPeriod', type: 'discrete', min: 5, max: 20, value: 12 },
    { name: 'macdSlowPeriod', type: 'discrete', min: 15, max: 35, value: 26 },
    { name: 'macdSignalPeriod', type: 'discrete', min: 5, max: 15, value: 9 },
    { name: 'stopLossPercent', type: 'continuous', min: 1, max: 5, value: 2 },
    { name: 'takeProfitPercent', type: 'continuous', min: 2, max: 10, value: 5 },
  ];
  
  return new GABacktestOptimizer({
    chromosomeTemplate,
    candles,
    strategyId: 'macd-crossover',
    symbol,
    gaConfig: {
      populationSize: 50,
      termination: {
        maxGenerations: 30,
        targetFitness: 2.0,
        maxStagnation: 10,
      },
    },
  });
}

// ==================== EXPORTS ====================

export default GABacktestOptimizer;
