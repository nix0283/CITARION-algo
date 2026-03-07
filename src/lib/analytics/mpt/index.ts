/**
 * Modern Portfolio Theory (MPT) Engine
 *
 * Professional portfolio optimization:
 * - Correlation matrix calculation
 * - Risk parity allocation
 * - Efficient frontier generation
 * - Maximum Sharpe optimization
 * - Rebalancing signals
 *
 * @module lib/analytics/mpt
 */

import type { Candle } from '@/lib/orion-bot/types';

// ==================== TYPES ====================

export interface Asset {
  symbol: string;
  expectedReturn: number;
  volatility: number;
  weight: number;
  sharpeRatio: number;
}

export interface Portfolio {
  assets: Asset[];
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  diversificationRatio: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  lastUpdated: Date;
}

export interface EfficientFrontierPoint {
  return: number;
  volatility: number;
  sharpeRatio: number;
  weights: number[];
}

export interface RebalanceSignal {
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  deviation: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  priority: number;
  reason: string;
}

export interface PortfolioOptimization {
  optimalWeights: number[];
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  diversificationRatio: number;
  riskContributions: number[];
  efficientFrontier: EfficientFrontierPoint[];
}

export interface RiskContribution {
  symbol: string;
  weight: number;
  riskContribution: number;
  marginalRisk: number;
}

// ==================== MPT ENGINE ====================

export class MPTEngine {
  private riskFreeRate: number;
  private correlationCache: Map<string, CorrelationMatrix> = new Map();

  constructor(riskFreeRate: number = 0.02) {
    this.riskFreeRate = riskFreeRate;
  }

  /**
   * Calculate correlation matrix from price history
   */
  async calculateCorrelationMatrix(
    priceHistories: Map<string, number[]>
  ): Promise<CorrelationMatrix> {
    const symbols = Array.from(priceHistories.keys());

    // Calculate returns for each symbol
    const returns = new Map<string, number[]>();
    for (const [symbol, prices] of priceHistories) {
      const symbolReturns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        symbolReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      returns.set(symbol, symbolReturns);
    }

    // Calculate correlation matrix
    const matrix: number[][] = [];

    for (let i = 0; i < symbols.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < symbols.length; j++) {
        const returnsA = returns.get(symbols[i])!;
        const returnsB = returns.get(symbols[j])!;
        const correlation = this.calculateCorrelation(returnsA, returnsB);
        row.push(correlation);
      }
      matrix.push(row);
    }

    const result: CorrelationMatrix = {
      symbols,
      matrix,
      lastUpdated: new Date(),
    };

    // Cache result
    this.correlationCache.set(symbols.join(','), result);

    return result;
  }

  /**
   * Calculate risk parity weights
   * Allocates capital so each asset contributes equally to portfolio risk
   */
  calculateRiskParity(
    correlationMatrix: CorrelationMatrix,
    volatilities: number[]
  ): number[] {
    const n = correlationMatrix.symbols.length;
    let weights = new Array(n).fill(1 / n);

    // Iterative optimization
    for (let iteration = 0; iteration < 100; iteration++) {
      const riskContributions = this.calculateRiskContributions(
        weights,
        correlationMatrix.matrix,
        volatilities
      );
      const avgRiskContribution = riskContributions.reduce((a, b) => a + b, 0) / n;

      // Adjust weights to equalize risk contributions
      const newWeights = weights.map((w, i) => {
        const adjustment = avgRiskContribution / Math.max(0.0001, riskContributions[i]);
        return w * Math.sqrt(adjustment);
      });

      // Normalize weights
      const sum = newWeights.reduce((a, b) => a + b, 0);
      weights = newWeights.map(w => w / sum);

      // Check convergence
      const maxDiff = Math.max(...weights.map((w, i) => Math.abs(w - newWeights[i] / sum)));
      if (maxDiff < 0.0001) break;
    }

    return weights;
  }

  /**
   * Calculate efficient frontier
   */
  calculateEfficientFrontier(
    expectedReturns: number[],
    volatilities: number[],
    correlationMatrix: number[][],
    points: number = 50
  ): EfficientFrontierPoint[] {
    const n = expectedReturns.length;
    const frontier: EfficientFrontierPoint[] = [];

    const minReturn = Math.min(...expectedReturns);
    const maxReturn = Math.max(...expectedReturns);

    for (let i = 0; i <= points; i++) {
      const targetReturn = minReturn + (maxReturn - minReturn) * (i / points);

      // Optimize weights for this return level
      const weights = this.optimizeForReturn(
        targetReturn,
        expectedReturns,
        correlationMatrix,
        volatilities
      );

      if (weights) {
        const volatility = this.calculatePortfolioVolatility(
          weights,
          correlationMatrix,
          volatilities
        );
        const sharpeRatio = (targetReturn - this.riskFreeRate) / volatility;

        frontier.push({
          return: targetReturn,
          volatility,
          sharpeRatio,
          weights,
        });
      }
    }

    return frontier;
  }

  /**
   * Optimize portfolio for maximum Sharpe ratio
   */
  optimizeMaxSharpe(
    expectedReturns: number[],
    volatilities: number[],
    correlationMatrix: number[][]
  ): PortfolioOptimization {
    const n = expectedReturns.length;

    // Gradient descent optimization
    let weights = new Array(n).fill(1 / n);
    let bestSharpe = -Infinity;
    let bestWeights = [...weights];

    for (let iteration = 0; iteration < 500; iteration++) {
      const return_ = this.calculatePortfolioReturn(weights, expectedReturns);
      const volatility = this.calculatePortfolioVolatility(
        weights,
        correlationMatrix,
        volatilities
      );
      const sharpeRatio = (return_ - this.riskFreeRate) / volatility;

      if (sharpeRatio > bestSharpe) {
        bestSharpe = sharpeRatio;
        bestWeights = [...weights];
      }

      // Gradient ascent
      const gradient = this.calculateSharpeGradient(
        weights,
        expectedReturns,
        correlationMatrix,
        volatilities
      );

      // Update weights
      weights = weights.map((w, i) => Math.max(0, w + 0.01 * gradient[i]));

      // Normalize
      const sum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sum);
    }

    const optimalReturn = this.calculatePortfolioReturn(bestWeights, expectedReturns);
    const optimalVolatility = this.calculatePortfolioVolatility(
      bestWeights,
      correlationMatrix,
      volatilities
    );
    const riskContributions = this.calculateRiskContributions(
      bestWeights,
      correlationMatrix,
      volatilities
    );

    // Diversification ratio
    const weightedAvgVol = bestWeights.reduce(
      (sum, w, i) => sum + w * volatilities[i],
      0
    );
    const diversificationRatio = weightedAvgVol / optimalVolatility;

    // Generate efficient frontier for reference
    const efficientFrontier = this.calculateEfficientFrontier(
      expectedReturns,
      volatilities,
      correlationMatrix
    );

    return {
      optimalWeights: bestWeights,
      expectedReturn: optimalReturn,
      volatility: optimalVolatility,
      sharpeRatio: bestSharpe,
      diversificationRatio,
      riskContributions,
      efficientFrontier,
    };
  }

  /**
   * Generate rebalance signals
   */
  generateRebalanceSignals(
    currentWeights: number[],
    targetWeights: number[],
    symbols: string[],
    threshold: number = 0.05
  ): RebalanceSignal[] {
    const signals: RebalanceSignal[] = [];

    for (let i = 0; i < symbols.length; i++) {
      const deviation = currentWeights[i] - targetWeights[i];
      const absDeviation = Math.abs(deviation);

      let action: 'BUY' | 'SELL' | 'HOLD';
      let reason: string;

      if (absDeviation < threshold) {
        action = 'HOLD';
        reason = 'Within threshold';
      } else if (deviation > 0) {
        action = 'SELL';
        reason = `Overweight by ${(deviation * 100).toFixed(1)}%`;
      } else {
        action = 'BUY';
        reason = `Underweight by ${(absDeviation * 100).toFixed(1)}%`;
      }

      signals.push({
        symbol: symbols[i],
        currentWeight: currentWeights[i],
        targetWeight: targetWeights[i],
        deviation,
        action,
        priority: absDeviation,
        reason,
      });
    }

    // Sort by priority
    return signals.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get risk contributions for each asset
   */
  getRiskContributions(
    weights: number[],
    correlationMatrix: CorrelationMatrix,
    volatilities: number[]
  ): RiskContribution[] {
    const contributions = this.calculateRiskContributions(
      weights,
      correlationMatrix.matrix,
      volatilities
    );
    const portfolioVol = this.calculatePortfolioVolatility(
      weights,
      correlationMatrix.matrix,
      volatilities
    );

    return correlationMatrix.symbols.map((symbol, i) => ({
      symbol,
      weight: weights[i],
      riskContribution: contributions[i],
      marginalRisk: contributions[i] / portfolioVol,
    }));
  }

  // ==================== PRIVATE METHODS ====================

  private calculateCorrelation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    const meanA = a.slice(0, n).reduce((s, x) => s + x, 0) / n;
    const meanB = b.slice(0, n).reduce((s, x) => s + x, 0) / n;

    let numerator = 0;
    let sumSqA = 0;
    let sumSqB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = a[i] - meanA;
      const diffB = b[i] - meanB;
      numerator += diffA * diffB;
      sumSqA += diffA * diffA;
      sumSqB += diffB * diffB;
    }

    const denominator = Math.sqrt(sumSqA * sumSqB);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateRiskContributions(
    weights: number[],
    correlationMatrix: number[][],
    volatilities: number[]
  ): number[] {
    const n = weights.length;
    const portfolioVol = this.calculatePortfolioVolatility(
      weights,
      correlationMatrix,
      volatilities
    );
    const contributions: number[] = [];

    for (let i = 0; i < n; i++) {
      let marginalRisk = 0;
      for (let j = 0; j < n; j++) {
        marginalRisk += weights[j] * correlationMatrix[i][j] * volatilities[i] * volatilities[j];
      }
      marginalRisk /= portfolioVol;
      contributions.push(weights[i] * marginalRisk);
    }

    return contributions;
  }

  private calculatePortfolioVolatility(
    weights: number[],
    correlationMatrix: number[][],
    volatilities: number[]
  ): number {
    const n = weights.length;
    let variance = 0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += weights[i] * weights[j] * correlationMatrix[i][j] * volatilities[i] * volatilities[j];
      }
    }

    return Math.sqrt(variance);
  }

  private calculatePortfolioReturn(weights: number[], expectedReturns: number[]): number {
    return weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
  }

  private optimizeForReturn(
    targetReturn: number,
    expectedReturns: number[],
    correlationMatrix: number[][],
    volatilities: number[]
  ): number[] | null {
    const n = expectedReturns.length;
    let weights = new Array(n).fill(1 / n);

    for (let iteration = 0; iteration < 100; iteration++) {
      const currentReturn = this.calculatePortfolioReturn(weights, expectedReturns);

      if (Math.abs(currentReturn - targetReturn) < 0.001) break;

      // Adjust weights
      for (let i = 0; i < n; i++) {
        if (currentReturn < targetReturn && expectedReturns[i] > currentReturn) {
          weights[i] += 0.01;
        } else if (currentReturn > targetReturn && expectedReturns[i] < currentReturn) {
          weights[i] -= 0.01;
        }
      }

      // Ensure positive and normalized
      weights = weights.map(w => Math.max(0, w));
      const sum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sum);
    }

    return weights;
  }

  private calculateSharpeGradient(
    weights: number[],
    expectedReturns: number[],
    correlationMatrix: number[][],
    volatilities: number[]
  ): number[] {
    const n = weights.length;
    const return_ = this.calculatePortfolioReturn(weights, expectedReturns);
    const volatility = this.calculatePortfolioVolatility(weights, correlationMatrix, volatilities);
    const gradient: number[] = [];

    for (let i = 0; i < n; i++) {
      const marginalReturn = expectedReturns[i];

      let marginalVolatility = 0;
      for (let j = 0; j < n; j++) {
        marginalVolatility += weights[j] * correlationMatrix[i][j] * volatilities[i] * volatilities[j];
      }
      marginalVolatility /= volatility;

      const gradientValue =
        (marginalReturn * volatility - (return_ - this.riskFreeRate) * marginalVolatility) /
        (volatility * volatility);
      gradient.push(gradientValue);
    }

    return gradient;
  }
}

// ==================== SINGLETON ====================

let mptInstance: MPTEngine | null = null;

export function getMPTEngine(riskFreeRate?: number): MPTEngine {
  if (!mptInstance) {
    mptInstance = new MPTEngine(riskFreeRate);
  }
  return mptInstance;
}

// ==================== EXPORTS ====================

export default {
  MPTEngine,
  getMPTEngine,
};
