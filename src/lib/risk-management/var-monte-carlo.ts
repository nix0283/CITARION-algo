/**
 * Monte Carlo VaR (Value at Risk) Calculator
 * Advanced risk measurement using Monte Carlo simulation
 * Audit Fix: P2.12 - Implement Monte Carlo VaR Calculator
 */

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
}

export interface VaRResult {
  var95: number; // 95% confidence VaR
  var99: number; // 99% confidence VaR
  expectedShortfall95: number; // Expected Shortfall (CVaR) at 95%
  expectedShortfall99: number; // Expected Shortfall (CVaR) at 99%
  maxLoss: number; // Maximum simulated loss
  maxGain: number; // Maximum simulated gain
  meanPnL: number; // Mean P&L
  stdDev: number; // Standard deviation
  simulations: number; // Number of simulations run
  timeHorizon: number; // Time horizon in days
  percentiles: {
    p1: number;
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

export interface MonteCarloConfig {
  simulations: number; // Number of Monte Carlo simulations
  timeHorizon: number; // Time horizon in days
  confidenceLevels: number[]; // Confidence levels for VaR
  riskFreeRate: number; // Annual risk-free rate
  randomSeed?: number; // For reproducibility
}

const DEFAULT_CONFIG: MonteCarloConfig = {
  simulations: 10000,
  timeHorizon: 1,
  confidenceLevels: [0.95, 0.99],
  riskFreeRate: 0.02, // 2% annual
};

export type SimulationMethod = 'historical' | 'parametric' | 'monte_carlo' | 'bootstrap';

export class MonteCarloVaR {
  private config: MonteCarloConfig;
  private priceHistory: Map<string, number[]> = new Map();
  private returnsHistory: Map<string, number[]> = new Map();

  constructor(config: Partial<MonteCarloConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add price history for a symbol
   */
  addPriceHistory(symbol: string, prices: number[]): void {
    this.priceHistory.set(symbol, prices);
    this.calculateReturns(symbol);
  }

  /**
   * Calculate log returns for a symbol
   */
  private calculateReturns(symbol: string): void {
    const prices = this.priceHistory.get(symbol);
    if (!prices || prices.length < 2) return;

    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const logReturn = Math.log(prices[i] / prices[i - 1]);
      returns.push(logReturn);
    }

    this.returnsHistory.set(symbol, returns);
  }

  /**
   * Calculate VaR using Monte Carlo simulation
   */
  calculateMonteCarloVaR(positions: Position[]): VaRResult {
    const simulations = this.runMonteCarloSimulation(positions);
    return this.calculateVaRFromSimulations(simulations);
  }

  /**
   * Run Monte Carlo simulation
   */
  private runMonteCarloSimulation(positions: Position[]): number[] {
    const results: number[] = [];
    const n = this.config.simulations;

    // Seeded random for reproducibility
    const random = this.config.randomSeed 
      ? this.seededRandom(this.config.randomSeed)
      : Math.random;

    for (let i = 0; i < n; i++) {
      let portfolioPnL = 0;

      for (const position of positions) {
        const simulatedPnL = this.simulatePositionPnL(position, random);
        portfolioPnL += simulatedPnL;
      }

      results.push(portfolioPnL);
    }

    return results;
  }

  /**
   * Simulate P&L for a single position
   */
  private simulatePositionPnL(position: Position, random: () => number): number {
    const returns = this.returnsHistory.get(position.symbol);
    
    if (!returns || returns.length === 0) {
      // Use default volatility if no history
      return this.simulateWithDefaultVolatility(position, random);
    }

    const mean = this.mean(returns);
    const stdDev = this.standardDeviation(returns);

    // Geometric Brownian Motion simulation
    const dt = this.config.timeHorizon / 252; // Trading days
    const drift = (mean - 0.5 * stdDev * stdDev) * dt;
    const diffusion = stdDev * Math.sqrt(dt) * this.boxMuller(random);

    const priceChange = Math.exp(drift + diffusion) - 1;
    const pnl = this.calculatePnL(position, priceChange);

    return pnl;
  }

  /**
   * Simulate with default volatility when no history available
   */
  private simulateWithDefaultVolatility(position: Position, random: () => number): number {
    const defaultVolatility = 0.3; // 30% annual volatility
    const dt = this.config.timeHorizon / 252;
    const dailyVol = defaultVolatility * Math.sqrt(dt);
    const priceChange = dailyVol * this.boxMuller(random);
    return this.calculatePnL(position, priceChange);
  }

  /**
   * Calculate P&L for a position given price change
   */
  private calculatePnL(position: Position, priceChange: number): number {
    const direction = position.side === 'long' ? 1 : -1;
    const notionalValue = position.size * position.currentPrice;
    return direction * notionalValue * priceChange * position.leverage;
  }

  /**
   * Box-Muller transform for generating normal random numbers
   */
  private boxMuller(random: () => number): number {
    let u1: number, u2: number;
    
    do {
      u1 = random();
    } while (u1 === 0);
    
    u2 = random();
    
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Seeded random number generator
   */
  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  /**
   * Calculate VaR results from simulation results
   */
  private calculateVaRFromSimulations(simulations: number[]): VaRResult {
    const sorted = [...simulations].sort((a, b) => a - b);
    const n = sorted.length;

    const mean = this.mean(sorted);
    const stdDev = this.standardDeviation(sorted);

    // Calculate percentiles
    const percentile = (p: number): number => {
      const idx = Math.floor(n * p);
      return sorted[idx];
    };

    // VaR (negative of the percentile)
    const var95 = -percentile(0.05);
    const var99 = -percentile(0.01);

    // Expected Shortfall (CVaR) - average of losses beyond VaR
    const tail95 = sorted.slice(0, Math.floor(n * 0.05));
    const tail99 = sorted.slice(0, Math.floor(n * 0.01));

    const expectedShortfall95 = -this.mean(tail95);
    const expectedShortfall99 = -this.mean(tail99);

    return {
      var95,
      var99,
      expectedShortfall95,
      expectedShortfall99,
      maxLoss: sorted[0],
      maxGain: sorted[n - 1],
      meanPnL: mean,
      stdDev,
      simulations: n,
      timeHorizon: this.config.timeHorizon,
      percentiles: {
        p1: percentile(0.01),
        p5: percentile(0.05),
        p10: percentile(0.10),
        p25: percentile(0.25),
        p50: percentile(0.50),
        p75: percentile(0.75),
        p90: percentile(0.90),
        p95: percentile(0.95),
        p99: percentile(0.99),
      },
    };
  }

  /**
   * Calculate Historical VaR
   */
  calculateHistoricalVaR(positions: Position[]): VaRResult | null {
    const allReturns = this.getAlignedReturns(positions);
    if (allReturns.length === 0) return null;

    // Calculate portfolio returns for each historical period
    const portfolioReturns = allReturns.map(returns => {
      let portfolioReturn = 0;
      positions.forEach((position, i) => {
        const direction = position.side === 'long' ? 1 : -1;
        const weight = (position.size * position.currentPrice) / this.getPortfolioValue(positions);
        portfolioReturn += direction * weight * returns[i] * position.leverage;
      });
      return portfolioReturn;
    });

    const portfolioPnL = portfolioReturns.map(r => 
      r * this.getPortfolioValue(positions) * this.config.timeHorizon
    );

    return this.calculateVaRFromSimulations(portfolioPnL);
  }

  /**
   * Calculate Parametric VaR (Variance-Covariance)
   */
  calculateParametricVaR(positions: Position[]): VaRResult | null {
    if (positions.length === 0) return null;

    // Calculate portfolio variance
    let portfolioVariance = 0;
    let portfolioMean = 0;

    for (const position of positions) {
      const returns = this.returnsHistory.get(position.symbol);
      if (!returns) continue;

      const meanReturn = this.mean(returns);
      const variance = this.variance(returns);
      const weight = (position.size * position.currentPrice) / this.getPortfolioValue(positions);
      const direction = position.side === 'long' ? 1 : -1;

      portfolioMean += direction * weight * meanReturn * position.leverage;
      portfolioVariance += Math.pow(weight * position.leverage, 2) * variance;
    }

    // Add covariance terms
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const returns1 = this.returnsHistory.get(positions[i].symbol);
        const returns2 = this.returnsHistory.get(positions[j].symbol);
        
        if (!returns1 || !returns2) continue;

        const cov = this.covariance(returns1, returns2);
        const weight1 = (positions[i].size * positions[i].currentPrice) / this.getPortfolioValue(positions);
        const weight2 = (positions[j].size * positions[j].currentPrice) / this.getPortfolioValue(positions);
        const dir1 = positions[i].side === 'long' ? 1 : -1;
        const dir2 = positions[j].side === 'long' ? 1 : -1;

        portfolioVariance += 2 * dir1 * dir2 * weight1 * weight2 * 
          positions[i].leverage * positions[j].leverage * cov;
      }
    }

    const portfolioStdDev = Math.sqrt(portfolioVariance);
    const portfolioValue = this.getPortfolioValue(positions);

    // VaR using normal distribution assumption
    const z95 = 1.645; // 95% confidence
    const z99 = 2.326; // 99% confidence

    const dailyStdDev = portfolioStdDev / Math.sqrt(252);
    const horizonStdDev = dailyStdDev * Math.sqrt(this.config.timeHorizon);

    const var95 = portfolioValue * z95 * horizonStdDev;
    const var99 = portfolioValue * z99 * horizonStdDev;

    return {
      var95,
      var99,
      expectedShortfall95: var95 * 1.19, // Approximation for normal distribution
      expectedShortfall99: var99 * 1.15,
      maxLoss: portfolioValue * 3 * horizonStdDev, // 3 sigma
      maxGain: portfolioValue * 3 * horizonStdDev,
      meanPnL: portfolioValue * portfolioMean * this.config.timeHorizon / 252,
      stdDev: portfolioValue * horizonStdDev,
      simulations: 1,
      timeHorizon: this.config.timeHorizon,
      percentiles: {
        p1: portfolioValue * (-2.326 * horizonStdDev),
        p5: -var95,
        p10: portfolioValue * (-1.282 * horizonStdDev),
        p25: portfolioValue * (-0.674 * horizonStdDev),
        p50: 0,
        p75: portfolioValue * (0.674 * horizonStdDev),
        p90: portfolioValue * (1.282 * horizonStdDev),
        p95: portfolioValue * (1.645 * horizonStdDev),
        p99: portfolioValue * (2.326 * horizonStdDev),
      },
    };
  }

  /**
   * Calculate VaR using Bootstrap method
   */
  calculateBootstrapVaR(positions: Position[], bootstrapSamples: number = 1000): VaRResult | null {
    const allReturns = this.getAlignedReturns(positions);
    if (allReturns.length === 0) return null;

    const bootstrapResults: number[] = [];
    const portfolioValue = this.getPortfolioValue(positions);

    for (let b = 0; b < bootstrapSamples; b++) {
      let portfolioReturn = 0;
      
      positions.forEach((position, i) => {
        // Randomly sample a historical return
        const returnIdx = Math.floor(Math.random() * allReturns.length);
        const historicalReturn = allReturns[returnIdx][i];
        
        const direction = position.side === 'long' ? 1 : -1;
        const weight = (position.size * position.currentPrice) / portfolioValue;
        portfolioReturn += direction * weight * historicalReturn * position.leverage;
      });

      bootstrapResults.push(portfolioReturn * portfolioValue * this.config.timeHorizon);
    }

    return this.calculateVaRFromSimulations(bootstrapResults);
  }

  /**
   * Get aligned returns for all positions
   */
  private getAlignedReturns(positions: Position[]): number[][] {
    const returnsArrays = positions.map(p => this.returnsHistory.get(p.symbol) || []);
    const minLength = Math.min(...returnsArrays.map(r => r.length));
    
    if (minLength === 0) return [];

    const aligned: number[][] = [];
    for (let i = 0; i < minLength; i++) {
      aligned.push(returnsArrays.map(r => r[i]));
    }

    return aligned;
  }

  /**
   * Get total portfolio value
   */
  private getPortfolioValue(positions: Position[]): number {
    return positions.reduce((sum, p) => sum + p.size * p.currentPrice, 0);
  }

  /**
   * Statistical helper functions
   */
  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private variance(arr: number[]): number {
    const m = this.mean(arr);
    return arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length;
  }

  private standardDeviation(arr: number[]): number {
    return Math.sqrt(this.variance(arr));
  }

  private covariance(arr1: number[], arr2: number[]): number {
    const mean1 = this.mean(arr1);
    const mean2 = this.mean(arr2);
    const n = Math.min(arr1.length, arr2.length);
    
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (arr1[i] - mean1) * (arr2[i] - mean2);
    }
    
    return sum / n;
  }

  /**
   * Calculate all VaR methods and compare
   */
  calculateAllMethods(positions: Position[]): {
    monteCarlo: VaRResult | null;
    historical: VaRResult | null;
    parametric: VaRResult | null;
    bootstrap: VaRResult | null;
  } {
    return {
      monteCarlo: this.calculateMonteCarloVaR(positions),
      historical: this.calculateHistoricalVaR(positions),
      parametric: this.calculateParametricVaR(positions),
      bootstrap: this.calculateBootstrapVaR(positions),
    };
  }

  /**
   * Get configuration
   */
  getConfig(): MonteCarloConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MonteCarloConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton
let instance: MonteCarloVaR | null = null;

export function getMonteCarloVaR(config?: Partial<MonteCarloConfig>): MonteCarloVaR {
  if (!instance) {
    instance = new MonteCarloVaR(config);
  }
  return instance;
}

export default MonteCarloVaR;
