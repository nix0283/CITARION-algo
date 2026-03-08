/**
 * Monte Carlo Simulation for Backtesting
 * 
 * Моделирование методом Монте-Карло для оценки устойчивости стратегии.
 * Перемешивает порядок сделок и моделирует различные сценарии.
 */

import { BacktestTrade, EquityPoint } from "./types";

// ==================== TYPES ====================

export interface MonteCarloResult {
  iterations: number;
  equityCurves: number[][];  // Equity curve for each iteration
  finalEquities: number[];   // Final equity for each iteration
  percentiles: {
    p5: number;   // 5th percentile
    p25: number;  // 25th percentile
    p50: number;  // Median
    p75: number;  // 75th percentile
    p95: number;  // 95th percentile
  };
  ruinProbability: number;   // Probability of losing > 50%
  profitProbability: number; // Probability of profit
  avgFinalEquity: number;
  stdFinalEquity: number;
  maxDrawdowns: number[];
  avgMaxDrawdown: number;
  worstCase: number;
  bestCase: number;
}

export interface MonteCarloConfig {
  iterations: number;        // Number of simulations (default: 1000)
  ruinThreshold: number;     // Equity loss % considered ruin (default: 50%)
  initialEquity: number;     // Starting equity
  seed?: number;             // Random seed for reproducibility
}

// ==================== MONTE CARLO SIMULATOR ====================

export class MonteCarloSimulator {
  private config: MonteCarloConfig;
  private random: () => number;

  constructor(config: Partial<MonteCarloConfig> = {}) {
    this.config = {
      iterations: config.iterations || 1000,
      ruinThreshold: config.ruinThreshold || 0.5,
      initialEquity: config.initialEquity || 10000,
      seed: config.seed,
    };

    // Seeded random number generator if seed provided
    if (this.config.seed !== undefined) {
      this.random = this.seededRandom(this.config.seed);
    } else {
      this.random = Math.random;
    }
  }

  /**
   * Seeded random number generator (Mulberry32)
   */
  private seededRandom(seed: number): () => number {
    let t = seed += 0x6D2B79F5;
    return () => {
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /**
   * Run Monte Carlo simulation on trades
   */
  simulate(trades: BacktestTrade[]): MonteCarloResult {
    if (trades.length === 0) {
      return this.createEmptyResult();
    }

    const pnlValues = trades.map(t => t.netPnl);
    const equityCurves: number[][] = [];
    const finalEquities: number[] = [];
    const maxDrawdowns: number[] = [];
    let ruinCount = 0;
    let profitCount = 0;

    for (let i = 0; i < this.config.iterations; i++) {
      // Shuffle PnL values
      const shuffled = this.shuffleArray([...pnlValues]);
      
      // Calculate equity curve
      const equityCurve = this.calculateEquityCurve(shuffled);
      equityCurves.push(equityCurve);
      
      const finalEquity = equityCurve[equityCurve.length - 1];
      finalEquities.push(finalEquity);

      // Calculate max drawdown
      const maxDrawdown = this.calculateMaxDrawdown(equityCurve);
      maxDrawdowns.push(maxDrawdown);

      // Check for ruin
      if (finalEquity < this.config.initialEquity * (1 - this.config.ruinThreshold)) {
        ruinCount++;
      }

      // Check for profit
      if (finalEquity > this.config.initialEquity) {
        profitCount++;
      }
    }

    // Sort final equities for percentiles
    const sortedEquities = [...finalEquities].sort((a, b) => a - b);

    return {
      iterations: this.config.iterations,
      equityCurves,
      finalEquities,
      percentiles: {
        p5: this.percentile(sortedEquities, 5),
        p25: this.percentile(sortedEquities, 25),
        p50: this.percentile(sortedEquities, 50),
        p75: this.percentile(sortedEquities, 75),
        p95: this.percentile(sortedEquities, 95),
      },
      ruinProbability: ruinCount / this.config.iterations,
      profitProbability: profitCount / this.config.iterations,
      avgFinalEquity: this.average(finalEquities),
      stdFinalEquity: this.stdDev(finalEquities),
      maxDrawdowns,
      avgMaxDrawdown: this.average(maxDrawdowns),
      worstCase: Math.min(...finalEquities),
      bestCase: Math.max(...finalEquities),
    };
  }

  /**
   * Run simulation with position sizing
   */
  simulateWithPositionSizing(
    trades: BacktestTrade[],
    positionSizeMultiplier: number[]
  ): MonteCarloResult[] {
    return positionSizeMultiplier.map(mult => {
      const adjustedTrades = trades.map(t => ({
        ...t,
        netPnl: t.netPnl * mult,
      }));
      return this.simulate(adjustedTrades);
    });
  }

  /**
   * Calculate probability of reaching target before ruin
   */
  calculateTargetProbability(
    trades: BacktestTrade[],
    targetProfitPercent: number,
    maxLossPercent: number
  ): number {
    const pnlValues = trades.map(t => t.netPnl);
    let successCount = 0;

    for (let i = 0; i < this.config.iterations; i++) {
      const shuffled = this.shuffleArray([...pnlValues]);
      const targetEquity = this.config.initialEquity * (1 + targetProfitPercent / 100);
      const ruinEquity = this.config.initialEquity * (1 - maxLossPercent / 100);
      
      let equity = this.config.initialEquity;
      let reached = false;

      for (const pnl of shuffled) {
        equity += pnl;
        
        if (equity >= targetEquity) {
          successCount++;
          reached = true;
          break;
        }
        
        if (equity <= ruinEquity) {
          break;
        }
      }
    }

    return successCount / this.config.iterations;
  }

  // ==================== PRIVATE METHODS ====================

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  private calculateEquityCurve(pnlValues: number[]): number[] {
    const curve: number[] = [this.config.initialEquity];
    let equity = this.config.initialEquity;

    for (const pnl of pnlValues) {
      equity += pnl;
      curve.push(equity);
    }

    return curve;
  }

  private calculateMaxDrawdown(equityCurve: number[]): number {
    let maxEquity = equityCurve[0];
    let maxDrawdown = 0;

    for (const equity of equityCurve) {
      if (equity > maxEquity) {
        maxEquity = equity;
      }
      const drawdown = (maxEquity - equity) / maxEquity * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private percentile(sortedValues: number[], p: number): number {
    const index = Math.floor((p / 100) * sortedValues.length);
    return sortedValues[Math.min(index, sortedValues.length - 1)];
  }

  private average(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    const avg = this.average(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.average(squaredDiffs));
  }

  private createEmptyResult(): MonteCarloResult {
    return {
      iterations: 0,
      equityCurves: [],
      finalEquities: [],
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
      ruinProbability: 0,
      profitProbability: 0,
      avgFinalEquity: this.config.initialEquity,
      stdFinalEquity: 0,
      maxDrawdowns: [],
      avgMaxDrawdown: 0,
      worstCase: this.config.initialEquity,
      bestCase: this.config.initialEquity,
    };
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Quick Monte Carlo analysis for backtest result
 */
export function analyzeWithMonteCarlo(
  trades: BacktestTrade[],
  config?: Partial<MonteCarloConfig>
): MonteCarloResult {
  const simulator = new MonteCarloSimulator(config);
  return simulator.simulate(trades);
}
