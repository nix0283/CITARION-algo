/**
 * CITARION Advanced Analytics
 * Stage 4.4 - Correlation, Portfolio Optimization, Attribution
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  timestamp: Date;
}

export interface PortfolioOptimization {
  weights: Record<string, number>;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  efficientFrontier?: EfficientFrontierPoint[];
}

export interface EfficientFrontierPoint {
  return: number;
  volatility: number;
  weights: Record<string, number>;
}

export interface AttributionResult {
  totalReturn: number;
  benchmarkReturn: number;
  activeReturn: number;
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
  factorExposures: Record<string, number>;
}

export interface FactorExposure {
  factor: string;
  exposure: number;
  contribution: number;
}

// ============================================================================
// ADVANCED ANALYTICS ENGINE
// ============================================================================

export class AdvancedAnalyticsEngine {
  // -------------------------------------------------------------------------
  // CORRELATION ANALYSIS
  // -------------------------------------------------------------------------

  calculateCorrelationMatrix(
    returns: Record<string, number[]>
  ): CorrelationMatrix {
    const symbols = Object.keys(returns);
    const n = symbols.length;
    const matrix: number[][] = [];

    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          matrix[i][j] = this.pearsonCorrelation(
            returns[symbols[i]],
            returns[symbols[j]]
          );
        }
      }
    }

    return {
      symbols,
      matrix,
      timestamp: new Date(),
    };
  }

  calculateRollingCorrelation(
    returns1: number[],
    returns2: number[],
    window: number = 30
  ): number[] {
    const correlations: number[] = [];

    for (let i = window; i <= returns1.length; i++) {
      const slice1 = returns1.slice(i - window, i);
      const slice2 = returns2.slice(i - window, i);
      correlations.push(this.pearsonCorrelation(slice1, slice2));
    }

    return correlations;
  }

  // -------------------------------------------------------------------------
  // PORTFOLIO OPTIMIZATION
  // -------------------------------------------------------------------------

  optimizePortfolio(
    returns: Record<string, number[]>,
    options: {
      riskFreeRate?: number;
      targetReturn?: number;
      maxWeight?: number;
      minWeight?: number;
    } = {}
  ): PortfolioOptimization {
    const { riskFreeRate = 0.02, maxWeight = 1, minWeight = 0 } = options;

    const symbols = Object.keys(returns);
    const n = symbols.length;

    // Calculate expected returns and covariance
    const expectedReturns = symbols.map((s) => this.annualizedReturn(returns[s]));
    const covMatrix = this.covarianceMatrix(returns);

    // Optimize for maximum Sharpe ratio
    const weights = this.optimizeSharpeRatio(
      expectedReturns,
      covMatrix,
      riskFreeRate,
      maxWeight,
      minWeight
    );

    const weightsMap: Record<string, number> = {};
    symbols.forEach((s, i) => (weightsMap[s] = weights[i]));

    const portfolioReturn = this.portfolioReturn(weights, expectedReturns);
    const portfolioVol = this.portfolioVolatility(weights, covMatrix);
    const sharpeRatio = (portfolioReturn - riskFreeRate) / portfolioVol;

    return {
      weights: weightsMap,
      expectedReturn: portfolioReturn,
      volatility: portfolioVol,
      sharpeRatio,
    };
  }

  calculateEfficientFrontier(
    returns: Record<string, number[]>,
    points: number = 20
  ): EfficientFrontierPoint[] {
    const symbols = Object.keys(returns);
    const expectedReturns = symbols.map((s) => this.annualizedReturn(returns[s]));
    const covMatrix = this.covarianceMatrix(returns);

    const minReturn = Math.min(...expectedReturns);
    const maxReturn = Math.max(...expectedReturns);
    const step = (maxReturn - minReturn) / (points - 1);

    const frontier: EfficientFrontierPoint[] = [];

    for (let i = 0; i < points; i++) {
      const targetReturn = minReturn + i * step;
      const weights = this.optimizeForTargetReturn(
        expectedReturns,
        covMatrix,
        targetReturn
      );

      const weightsMap: Record<string, number> = {};
      symbols.forEach((s, idx) => (weightsMap[s] = weights[idx]));

      const vol = this.portfolioVolatility(weights, covMatrix);

      frontier.push({
        return: targetReturn,
        volatility: vol,
        weights: weightsMap,
      });
    }

    return frontier;
  }

  // -------------------------------------------------------------------------
  // RISK PARITY
  // -------------------------------------------------------------------------

  calculateRiskParityWeights(
    returns: Record<string, number[]>,
    targetVolatility?: number
  ): Record<string, number> {
    const symbols = Object.keys(returns);
    const volatilities = symbols.map((s) => this.annualizedVolatility(returns[s]));

    // Risk parity: weights inversely proportional to volatility
    const inverseVols = volatilities.map((v) => 1 / v);
    const sum = inverseVols.reduce((a, b) => a + b, 0);
    const weights = inverseVols.map((w) => w / sum);

    // Scale to target volatility if provided
    if (targetVolatility) {
      const covMatrix = this.covarianceMatrix(returns);
      const currentVol = this.portfolioVolatility(weights, covMatrix);
      const scaleFactor = targetVolatility / currentVol;
      return Object.fromEntries(
        symbols.map((s, i) => [s, Math.min(weights[i] * scaleFactor, 1)])
      );
    }

    return Object.fromEntries(symbols.map((s, i) => [s, weights[i]]));
  }

  // -------------------------------------------------------------------------
  // PERFORMANCE ATTRIBUTION
  // -------------------------------------------------------------------------

  attributePerformance(
    portfolioReturns: number[],
    benchmarkReturns: number[],
    factorReturns: Record<string, number[]>,
    portfolioWeights: Record<string, number>,
    benchmarkWeights: Record<string, number>
  ): AttributionResult {
    // Total returns
    const totalReturn = this.totalReturn(portfolioReturns);
    const benchmarkReturn = this.totalReturn(benchmarkReturns);
    const activeReturn = totalReturn - benchmarkReturn;

    // Brinson-Hood-Beebower attribution
    const allocationEffect = this.calculateAllocationEffect(
      portfolioWeights,
      benchmarkWeights,
      factorReturns
    );

    const selectionEffect = this.calculateSelectionEffect(
      portfolioWeights,
      benchmarkWeights,
      factorReturns
    );

    const interactionEffect =
      activeReturn - allocationEffect - selectionEffect;

    // Factor exposures
    const factorExposures = this.calculateFactorExposures(
      portfolioReturns,
      factorReturns
    );

    return {
      totalReturn,
      benchmarkReturn,
      activeReturn,
      allocationEffect,
      selectionEffect,
      interactionEffect,
      factorExposures,
    };
  }

  // -------------------------------------------------------------------------
  // STATISTICAL FUNCTIONS
  // -------------------------------------------------------------------------

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const meanX = this.mean(xSlice);
    const meanY = this.mean(ySlice);

    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
      const dx = xSlice[i] - meanX;
      const dy = ySlice[i] - meanY;
      sumXY += dx * dy;
      sumX2 += dx * dx;
      sumY2 += dy * dy;
    }

    const denominator = Math.sqrt(sumX2 * sumY2);
    return denominator === 0 ? 0 : sumXY / denominator;
  }

  private mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private variance(values: number[]): number {
    const avg = this.mean(values);
    return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  }

  private std(values: number[]): number {
    return Math.sqrt(this.variance(values));
  }

  private covariance(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    const meanX = this.mean(x.slice(0, n));
    const meanY = this.mean(y.slice(0, n));

    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (x[i] - meanX) * (y[i] - meanY);
    }

    return sum / n;
  }

  private annualizedReturn(dailyReturns: number[]): number {
    const totalReturn = dailyReturns.reduce((a, b) => a + b, 0);
    return totalReturn * 252; // Trading days per year
  }

  private annualizedVolatility(dailyReturns: number[]): number {
    return this.std(dailyReturns) * Math.sqrt(252);
  }

  private covarianceMatrix(
    returns: Record<string, number[]>
  ): number[][] {
    const symbols = Object.keys(returns);
    const n = symbols.length;
    const matrix: number[][] = [];

    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        matrix[i][j] = this.covariance(returns[symbols[i]], returns[symbols[j]]);
      }
    }

    return matrix;
  }

  // -------------------------------------------------------------------------
  // OPTIMIZATION
  // -------------------------------------------------------------------------

  private optimizeSharpeRatio(
    expectedReturns: number[],
    covMatrix: number[][],
    riskFreeRate: number,
    maxWeight: number,
    minWeight: number
  ): number[] {
    const n = expectedReturns.length;

    // Start with equal weights
    let weights = Array(n).fill(1 / n);
    let bestSharpe = -Infinity;
    let bestWeights = [...weights];

    // Simple grid search for demonstration
    // In production, use quadratic programming or gradient descent
    const steps = 10;
    const stepSize = (maxWeight - minWeight) / steps;

    for (let iter = 0; iter < 1000; iter++) {
      // Random perturbation
      const newWeights = [...weights];
      const i = Math.floor(Math.random() * n);
      const delta = (Math.random() - 0.5) * stepSize;
      newWeights[i] = Math.max(minWeight, Math.min(maxWeight, newWeights[i] + delta));

      // Normalize
      const sum = newWeights.reduce((a, b) => a + b, 0);
      for (let j = 0; j < n; j++) {
        newWeights[j] /= sum;
      }

      const portReturn = this.portfolioReturn(newWeights, expectedReturns);
      const portVol = this.portfolioVolatility(newWeights, covMatrix);
      const sharpe = (portReturn - riskFreeRate) / portVol;

      if (sharpe > bestSharpe) {
        bestSharpe = sharpe;
        bestWeights = [...newWeights];
      }
    }

    return bestWeights;
  }

  private optimizeForTargetReturn(
    expectedReturns: number[],
    covMatrix: number[][],
    targetReturn: number
  ): number[] {
    const n = expectedReturns.length;

    // Simple approach: find minimum variance portfolio for target return
    let weights = Array(n).fill(1 / n);
    let minVar = Infinity;
    let bestWeights = [...weights];

    // Grid search
    for (let iter = 0; iter < 1000; iter++) {
      const newWeights = Array(n)
        .fill(0)
        .map(() => Math.random());
      const sum = newWeights.reduce((a, b) => a + b, 0);
      for (let j = 0; j < n; j++) {
        newWeights[j] /= sum;
      }

      const portReturn = this.portfolioReturn(newWeights, expectedReturns);
      if (Math.abs(portReturn - targetReturn) < 0.01) {
        const portVol = this.portfolioVolatility(newWeights, covMatrix);
        if (portVol < minVar) {
          minVar = portVol;
          bestWeights = [...newWeights];
        }
      }
    }

    return bestWeights;
  }

  private portfolioReturn(
    weights: number[],
    expectedReturns: number[]
  ): number {
    return weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
  }

  private portfolioVolatility(
    weights: number[],
    covMatrix: number[][]
  ): number {
    const n = weights.length;
    let variance = 0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += weights[i] * weights[j] * covMatrix[i][j];
      }
    }

    return Math.sqrt(variance);
  }

  // -------------------------------------------------------------------------
  // ATTRIBUTION HELPERS
  // -------------------------------------------------------------------------

  private totalReturn(returns: number[]): number {
    return returns.reduce((a, b) => a + b, 0);
  }

  private calculateAllocationEffect(
    portfolioWeights: Record<string, number>,
    benchmarkWeights: Record<string, number>,
    factorReturns: Record<string, number[]>
  ): number {
    let effect = 0;

    for (const symbol of Object.keys(portfolioWeights)) {
      const weightDiff =
        (portfolioWeights[symbol] || 0) - (benchmarkWeights[symbol] || 0);
      const benchmarkReturn = this.totalReturn(factorReturns[symbol] || [0]);
      const avgBenchmarkReturn =
        this.totalReturn(
          Object.values(factorReturns).reduce(
            (a, b) => a.map((x, i) => x + b[i]),
            Array(Object.keys(factorReturns).length).fill(0)
          )
        ) / Object.keys(factorReturns).length;

      effect += weightDiff * (benchmarkReturn - avgBenchmarkReturn);
    }

    return effect;
  }

  private calculateSelectionEffect(
    portfolioWeights: Record<string, number>,
    benchmarkWeights: Record<string, number>,
    factorReturns: Record<string, number[]>
  ): number {
    let effect = 0;

    for (const symbol of Object.keys(portfolioWeights)) {
      const benchmarkWeight = benchmarkWeights[symbol] || 0;
      const symbolReturn = this.totalReturn(factorReturns[symbol] || [0]);
      const avgReturn = this.totalReturn(factorReturns['benchmark'] || [0]);

      effect += benchmarkWeight * (symbolReturn - avgReturn);
    }

    return effect;
  }

  private calculateFactorExposures(
    portfolioReturns: number[],
    factorReturns: Record<string, number[]>
  ): Record<string, number> {
    const exposures: Record<string, number> = {};

    for (const [factor, returns] of Object.entries(factorReturns)) {
      exposures[factor] = this.pearsonCorrelation(portfolioReturns, returns);
    }

    return exposures;
  }
}

// Singleton
export const advancedAnalytics = new AdvancedAnalyticsEngine();
