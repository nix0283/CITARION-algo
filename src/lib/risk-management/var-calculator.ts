/**
 * VaR CALCULATOR
 *
 * Value at Risk calculation using three methods:
 * - Historical Simulation
 * - Parametric (Variance-Covariance)
 * - Monte Carlo Simulation
 *
 * NO NEURAL NETWORKS - Uses classical statistical methods only.
 */

import type { VaRConfig, VaRResult, VaRMethod } from './types';

export class VaRCalculator {
  private config: VaRConfig;

  constructor(config: Partial<VaRConfig> = {}) {
    this.config = {
      confidenceLevel: 0.95,
      timeHorizon: 1,
      method: 'historical',
      lookbackPeriod: 252,
      monteCarloSimulations: 10000,
      ...config,
    };
  }

  /**
   * Calculate VaR using configured method
   */
  public calculate(returns: number[], portfolioValue: number): VaRResult {
    if (returns.length < 10) {
      return this.getEmptyResult(portfolioValue);
    }

    let var_value: number;
    let es_value: number;

    switch (this.config.method) {
      case 'historical':
        ({ var: var_value, es: es_value } = this.historicalVar(returns));
        break;
      case 'parametric':
        ({ var: var_value, es: es_value } = this.parametricVar(returns));
        break;
      case 'monte_carlo':
        ({ var: var_value, es: es_value } = this.monteCarloVar(returns));
        break;
      default:
        ({ var: var_value, es: es_value } = this.historicalVar(returns));
    }

    // Scale for time horizon
    const scaleFactor = Math.sqrt(this.config.timeHorizon);
    var_value *= scaleFactor;
    es_value *= scaleFactor;

    // Convert to absolute values
    const varAbs = Math.abs(var_value) * portfolioValue;
    const esAbs = Math.abs(es_value) * portfolioValue;

    return {
      var: varAbs,
      expectedShortfall: esAbs,
      confidenceLevel: this.config.confidenceLevel,
      timeHorizon: this.config.timeHorizon,
      method: this.config.method,
      timestamp: Date.now(),
      portfolioValue,
      riskPercentage: (varAbs / portfolioValue) * 100,
    };
  }

  /**
   * Historical Simulation VaR
   * Uses actual historical returns distribution
   */
  private historicalVar(returns: number[]): { var: number; es: number } {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - this.config.confidenceLevel) * sorted.length);
    
    const var_value = sorted[index];
    
    // Expected Shortfall: average of returns below VaR
    const tailReturns = sorted.slice(0, index + 1);
    const es = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;

    return { var: var_value, es };
  }

  /**
   * Parametric VaR (Variance-Covariance)
   * Assumes normal distribution of returns
   */
  private parametricVar(returns: number[]): { var: number; es: number } {
    const mean = this.mean(returns);
    const std = this.standardDeviation(returns);
    
    // Z-score for confidence level
    const zScore = this.getZScore(this.config.confidenceLevel);
    
    // VaR = mean - z * std (for losses, we look at left tail)
    const var_value = mean - zScore * std;
    
    // Expected Shortfall for normal distribution
    // ES = mean - std * phi(z) / (1 - confidence)
    const phi = this.normalPDF(zScore);
    const es = mean - std * phi / (1 - this.config.confidenceLevel);

    return { var: var_value, es };
  }

  /**
   * Monte Carlo Simulation VaR
   * Simulates future returns using historical parameters
   */
  private monteCarloVar(returns: number[]): { var: number; es: number } {
    const mean = this.mean(returns);
    const std = this.standardDeviation(returns);
    const simulations = this.config.monteCarloSimulations || 10000;
    
    // Generate random returns assuming normal distribution
    const simulatedReturns: number[] = [];
    for (let i = 0; i < simulations; i++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const returnVal = mean + std * z;
      simulatedReturns.push(returnVal);
    }

    // Sort and get VaR
    const sorted = simulatedReturns.sort((a, b) => a - b);
    const index = Math.floor((1 - this.config.confidenceLevel) * sorted.length);
    
    const var_value = sorted[index];
    const tailReturns = sorted.slice(0, index + 1);
    const es = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;

    return { var: var_value, es };
  }

  /**
   * Calculate returns from price series
   */
  public static calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] !== 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
    return returns;
  }

  /**
   * Calculate log returns from price series
   */
  public static calculateLogReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0 && prices[i] > 0) {
        returns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }
    return returns;
  }

  // ===========================================================================
  // STATISTICAL HELPERS
  // ===========================================================================

  private mean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private standardDeviation(values: number[]): number {
    const avg = this.mean(values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  private getZScore(confidence: number): number {
    // Approximate inverse normal CDF
    // More accurate values for common confidence levels
    const zScores: Record<number, number> = {
      0.90: 1.282,
      0.95: 1.645,
      0.99: 2.326,
      0.999: 3.090,
    };
    
    if (zScores[confidence]) {
      return zScores[confidence];
    }

    // Approximation for other values
    const p = 1 - confidence;
    // Abramowitz and Stegun approximation
    const t = 1 / (1 + 0.2316419 * Math.sqrt(2) * this.inverseErf(1 - 2 * p));
    return t;
  }

  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  private inverseErf(x: number): number {
    // Approximation of inverse error function
    const a = 0.147;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    
    const ln = Math.log(1 - x * x);
    const t1 = 2 / (Math.PI * a) + ln / 2;
    const t2 = ln / a;
    
    return sign * Math.sqrt(Math.sqrt(t1 * t1 - t2) - t1);
  }

  private getEmptyResult(portfolioValue: number): VaRResult {
    return {
      var: 0,
      expectedShortfall: 0,
      confidenceLevel: this.config.confidenceLevel,
      timeHorizon: this.config.timeHorizon,
      method: this.config.method,
      timestamp: Date.now(),
      portfolioValue,
      riskPercentage: 0,
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<VaRConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): VaRConfig {
    return { ...this.config };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const defaultVaRConfig: VaRConfig = {
  confidenceLevel: 0.95,
  timeHorizon: 1,
  method: 'historical',
  lookbackPeriod: 252,
  monteCarloSimulations: 10000,
};

export function calculateVaR(
  returns: number[],
  portfolioValue: number,
  config?: Partial<VaRConfig>
): VaRResult {
  const calculator = new VaRCalculator(config);
  return calculator.calculate(returns, portfolioValue);
}
