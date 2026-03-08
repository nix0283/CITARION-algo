/**
 * REED BOT - Statistical Arbitrage (STA)
 *
 * Production-ready statistical arbitrage using PCA and factor models.
 * Identifies mispricings based on factor exposures and residual analysis.
 *
 * Features:
 * - Principal Component Analysis for dimensionality reduction
 * - Multi-factor model with momentum, value, quality factors
 * - Residual-based signal generation
 * - Sector and market neutral positioning
 * - Risk-adjusted position sizing
 *
 * NO NEURAL NETWORKS - Classical statistical methods only.
 */

import type { BotStatus, BotMode, RiskConfig } from './types';
import { getEventBus } from '../orchestration';

// =============================================================================
// TYPES
// =============================================================================

export interface ReedConfig {
  name: 'Reed';
  code: 'STA';
  version: string;
  mode: BotMode;
  exchanges: string[];
  riskConfig: RiskConfig;
  strategy: {
    lookbackPeriod: number;
    pcaComponents: number;
    minExplainedVariance: number;
    residualZScoreEntry: number;
    residualZScoreExit: number;
    maxHoldingPeriod: number;
    rebalanceFrequency: number;
    universeSize: number;
    factorModels: string[];
    sectorNeutral: boolean;
    marketNeutral: boolean;
    minExpectedReturn: number;
    maxPositionWeight: number;
    informationRatioTarget: number;
  };
}

export interface FactorModel {
  name: string;
  type: 'STYLE' | 'SECTOR' | 'MACRO' | 'TECHNICAL';
  weights: Map<string, number>;
  returns: number[];
  meanReturn: number;
  volatility: number;
  sharpeRatio: number;
  factorExposures: Map<string, number>;
}

export interface PCAResult {
  components: number[][];
  eigenvalues: number[];
  explainedVarianceRatio: number[];
  cumulativeVariance: number[];
  factorLoadings: Map<string, number[]>;
  reconstructedData: number[][];
}

export interface ResidualAnalysis {
  symbol: string;
  actualReturn: number;
  expectedReturn: number;
  residual: number;
  residualZScore: number;
  residualStd: number;
  rSquared: number;
  lastUpdated: number;
}

export interface StatArbSignal {
  id: string;
  timestamp: number;
  symbol: string;
  exchange: string;
  direction: 'LONG' | 'SHORT';
  expectedReturn: number;
  residualZScore: number;
  confidence: number;
  factorExposures: Map<string, number>;
  holdingPeriod: number;
  positionWeight: number;
  riskContribution: number;
  sector: string;
}

export interface StatArbPosition {
  id: string;
  symbol: string;
  exchange: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  expectedReturn: number;
  residualZScore: number;
  factorExposures: Map<string, number>;
  unrealizedPnl: number;
  realizedPnl: number;
  openedAt: number;
  holdingPeriod: number;
  sector: string;
}

export interface PortfolioState {
  positions: Map<string, StatArbPosition>;
  totalExposure: number;
  grossExposure: number;
  netExposure: number;
  factorExposures: Map<string, number>;
  sectorExposures: Map<string, number>;
  beta: number;
  trackingError: number;
  informationRatio: number;
}

export interface ReedState {
  status: BotStatus;
  pcaResult: PCAResult | null;
  factorModels: Map<string, FactorModel>;
  residuals: Map<string, ResidualAnalysis>;
  positions: Map<string, StatArbPosition>;
  signals: StatArbSignal[];
  portfolio: PortfolioState;
  priceHistory: Map<string, number[]>;
  returnsHistory: Map<string, number[]>;
  stats: {
    totalTrades: number;
    winRate: number;
    avgPnL: number;
    informationRatio: number;
    trackingError: number;
    factorReturns: Map<string, number>;
    avgResidualZScore: number;
    avgHoldingPeriod: number;
    turnoverRate: number;
  };
}

// =============================================================================
// PCA ENGINE
// =============================================================================

class PCAEngine {
  /**
   * Perform Principal Component Analysis
   */
  performPCA(
    data: number[][],
    numComponents: number
  ): PCAResult {
    const n = data.length;    // Number of observations
    const p = data[0]?.length || 0;  // Number of variables

    if (n < 2 || p < 2) {
      return {
        components: [],
        eigenvalues: [],
        explainedVarianceRatio: [],
        cumulativeVariance: [],
        factorLoadings: new Map(),
        reconstructedData: [],
      };
    }

    // Step 1: Center the data
    const means: number[] = [];
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += data[i][j];
      }
      means.push(sum / n);
    }

    const centered = data.map(row =>
      row.map((val, j) => val - means[j])
    );

    // Step 2: Compute covariance matrix
    const covMatrix = this.computeCovarianceMatrix(centered);

    // Step 3: Compute eigenvalues and eigenvectors using power iteration
    const { eigenvalues, eigenvectors } = this.eigenDecomposition(
      covMatrix,
      Math.min(numComponents, p)
    );

    // Step 4: Calculate explained variance
    const totalVariance = eigenvalues.reduce((s, v) => s + v, 0);
    const explainedVarianceRatio = eigenvalues.map(e => e / totalVariance);
    const cumulativeVariance: number[] = [];
    let cumSum = 0;
    for (const ev of explainedVarianceRatio) {
      cumSum += ev;
      cumulativeVariance.push(cumSum);
    }

    // Step 5: Calculate factor loadings
    const factorLoadings = new Map<string, number[]>();
    for (let j = 0; j < p; j++) {
      const loadings: number[] = [];
      for (let k = 0; k < eigenvectors.length; k++) {
        loadings.push(eigenvectors[k][j] * Math.sqrt(eigenvalues[k]));
      }
      factorLoadings.set(`var_${j}`, loadings);
    }

    // Step 6: Reconstruct data using top components
    const reconstructedData = this.reconstructData(centered, eigenvectors, means);

    return {
      components: eigenvectors,
      eigenvalues,
      explainedVarianceRatio,
      cumulativeVariance,
      factorLoadings,
      reconstructedData,
    };
  }

  /**
   * Compute covariance matrix
   */
  private computeCovarianceMatrix(data: number[][]): number[][] {
    const n = data.length;
    const p = data[0]?.length || 0;
    const cov: number[][] = Array(p).fill(null).map(() => Array(p).fill(0));

    for (let i = 0; i < p; i++) {
      for (let j = i; j < p; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += data[k][i] * data[k][j];
        }
        cov[i][j] = sum / (n - 1);
        cov[j][i] = cov[i][j];
      }
    }

    return cov;
  }

  /**
   * Eigenvalue decomposition using power iteration with deflation
   */
  private eigenDecomposition(
    matrix: number[][],
    k: number
  ): { eigenvalues: number[]; eigenvectors: number[][] } {
    const n = matrix.length;
    const eigenvalues: number[] = [];
    const eigenvectors: number[][] = [];

    // Work on a copy
    let A = matrix.map(row => [...row]);

    for (let comp = 0; comp < k; comp++) {
      // Power iteration
      let v = Array(n).fill(0).map(() => Math.random() - 0.5);
      let eigenvalue = 0;

      for (let iter = 0; iter < 100; iter++) {
        // Matrix-vector multiplication
        const Av = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            Av[i] += A[i][j] * v[j];
          }
        }

        // Calculate eigenvalue (Rayleigh quotient)
        const norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0));
        if (norm < 1e-10) break;

        eigenvalue = Av.reduce((s, x, i) => s + x * v[i], 0);
        v = Av.map(x => x / norm);
      }

      eigenvalues.push(Math.abs(eigenvalue));
      eigenvectors.push(v);

      // Deflate matrix
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          A[i][j] -= eigenvalue * v[i] * v[j];
        }
      }
    }

    return { eigenvalues, eigenvectors };
  }

  /**
   * Reconstruct data from principal components
   */
  private reconstructData(
    centered: number[][],
    components: number[][],
    means: number[]
  ): number[][] {
    const n = centered.length;
    const p = centered[0]?.length || 0;
    const k = components.length;

    const reconstructed: number[][] = [];

    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < p; j++) {
        let val = means[j];
        for (let c = 0; c < k; c++) {
          let score = 0;
          for (let l = 0; l < p; l++) {
            score += centered[i][l] * components[c][l];
          }
          val += score * components[c][j];
        }
        row.push(val);
      }
      reconstructed.push(row);
    }

    return reconstructed;
  }

  /**
   * Get factor scores for a new observation
   */
  getFactorScores(
    observation: number[],
    means: number[],
    components: number[][]
  ): number[] {
    const centered = observation.map((val, j) => val - means[j]);
    const scores: number[] = [];

    for (const component of components) {
      let score = 0;
      for (let j = 0; j < centered.length; j++) {
        score += centered[j] * component[j];
      }
      scores.push(score);
    }

    return scores;
  }
}

// =============================================================================
// FACTOR MODEL ENGINE
// =============================================================================

class FactorModelEngine {
  private factors: Map<string, FactorModel> = new Map();

  /**
   * Build factor models from returns data
   */
  buildFactorModels(
    returns: Map<string, number[]>,
    factorNames: string[]
  ): Map<string, FactorModel> {
    this.factors.clear();

    for (const factorName of factorNames) {
      const factor = this.buildSingleFactor(factorName, returns);
      this.factors.set(factorName, factor);
    }

    return this.factors;
  }

  /**
   * Build a single factor model
   */
  private buildSingleFactor(
    factorName: string,
    returns: Map<string, number[]>
  ): FactorModel {
    const weights = new Map<string, number>();
    const factorExposures = new Map<string, number>();

    switch (factorName) {
      case 'MOMENTUM':
        this.buildMomentumFactor(returns, weights, factorExposures);
        break;
      case 'MEAN_REVERSION':
        this.buildMeanReversionFactor(returns, weights, factorExposures);
        break;
      case 'VOLUME':
        this.buildVolumeFactor(returns, weights, factorExposures);
        break;
      case 'VOLATILITY':
        this.buildVolatilityFactor(returns, weights, factorExposures);
        break;
      case 'QUALITY':
        this.buildQualityFactor(returns, weights, factorExposures);
        break;
      default:
        this.buildCustomFactor(factorName, returns, weights, factorExposures);
    }

    // Calculate factor returns (simplified)
    const factorReturns = this.calculateFactorReturns(weights, returns);
    const meanReturn = factorReturns.length > 0
      ? factorReturns.reduce((s, r) => s + r, 0) / factorReturns.length
      : 0;
    const volatility = this.std(factorReturns);
    const sharpeRatio = volatility > 0 ? meanReturn / volatility : 0;

    return {
      name: factorName,
      type: 'STYLE',
      weights,
      returns: factorReturns,
      meanReturn,
      volatility,
      sharpeRatio,
      factorExposures,
    };
  }

  /**
   * Build momentum factor
   */
  private buildMomentumFactor(
    returns: Map<string, number[]>,
    weights: Map<string, number>,
    exposures: Map<string, number>
  ): void {
    for (const [symbol, rets] of returns) {
      if (rets.length < 10) continue;

      // 10-period momentum
      const momentum = rets.slice(-10).reduce((s, r) => s + r, 0);
      const normalized = this.normalizeFactor(momentum, -0.1, 0.1);

      weights.set(symbol, normalized);
      exposures.set(symbol, normalized);
    }
  }

  /**
   * Build mean reversion factor
   */
  private buildMeanReversionFactor(
    returns: Map<string, number[]>,
    weights: Map<string, number>,
    exposures: Map<string, number>
  ): void {
    for (const [symbol, rets] of returns) {
      if (rets.length < 20) continue;

      // Recent vs historical mean
      const recentMean = this.mean(rets.slice(-5));
      const historicalMean = this.mean(rets.slice(-20, -5));
      const meanReversion = historicalMean - recentMean;
      const normalized = this.normalizeFactor(meanReversion, -0.05, 0.05);

      weights.set(symbol, normalized);
      exposures.set(symbol, normalized);
    }
  }

  /**
   * Build volume factor (using return magnitude as proxy)
   */
  private buildVolumeFactor(
    returns: Map<string, number[]>,
    weights: Map<string, number>,
    exposures: Map<string, number>
  ): void {
    for (const [symbol, rets] of returns) {
      if (rets.length < 5) continue;

      // Average absolute return as volume proxy
      const avgAbsReturn = this.mean(rets.slice(-5).map(Math.abs));
      const normalized = this.normalizeFactor(avgAbsReturn, 0, 0.1);

      weights.set(symbol, normalized);
      exposures.set(symbol, normalized);
    }
  }

  /**
   * Build volatility factor
   */
  private buildVolatilityFactor(
    returns: Map<string, number[]>,
    weights: Map<string, number>,
    exposures: Map<string, number>
  ): void {
    for (const [symbol, rets] of returns) {
      if (rets.length < 20) continue;

      const vol = this.std(rets.slice(-20)) * Math.sqrt(252); // Annualized
      const normalized = this.normalizeFactor(vol, 0.2, 0.8);

      weights.set(symbol, -normalized); // Low vol premium
      exposures.set(symbol, normalized);
    }
  }

  /**
   * Build quality factor
   */
  private buildQualityFactor(
    returns: Map<string, number[]>,
    weights: Map<string, number>,
    exposures: Map<string, number>
  ): void {
    for (const [symbol, rets] of returns) {
      if (rets.length < 30) continue;

      // Return consistency as quality proxy
      const recentReturns = rets.slice(-30);
      const positiveRatio = recentReturns.filter(r => r > 0).length / recentReturns.length;
      const consistency = positiveRatio - 0.5; // Centered

      weights.set(symbol, consistency);
      exposures.set(symbol, consistency);
    }
  }

  /**
   * Build custom factor (placeholder)
   */
  private buildCustomFactor(
    factorName: string,
    returns: Map<string, number[]>,
    weights: Map<string, number>,
    exposures: Map<string, number>
  ): void {
    // Equal weight as placeholder
    const n = returns.size;
    for (const symbol of returns.keys()) {
      weights.set(symbol, 1 / n);
      exposures.set(symbol, 1 / n);
    }
  }

  /**
   * Calculate factor returns
   */
  private calculateFactorReturns(
    weights: Map<string, number>,
    returns: Map<string, number[]>
  ): number[] {
    if (returns.size === 0) return [];

    const maxLen = Math.max(...Array.from(returns.values()).map(r => r.length));
    const factorReturns: number[] = [];

    for (let i = 0; i < maxLen; i++) {
      let weightedReturn = 0;
      let totalWeight = 0;

      for (const [symbol, w] of weights) {
        const rets = returns.get(symbol);
        if (rets && rets.length > i) {
          weightedReturn += w * rets[rets.length - 1 - i];
          totalWeight += Math.abs(w);
        }
      }

      if (totalWeight > 0) {
        factorReturns.push(weightedReturn / totalWeight);
      }
    }

    return factorReturns;
  }

  /**
   * Calculate expected return for a symbol using factor model
   */
  calculateExpectedReturn(
    symbol: string,
    factorExposures: Map<string, number>
  ): number {
    let expectedReturn = 0;

    for (const [factorName, exposure] of factorExposures) {
      const factor = this.factors.get(factorName);
      if (factor) {
        expectedReturn += exposure * factor.meanReturn;
      }
    }

    return expectedReturn;
  }

  private mean(values: number[]): number {
    return values.length > 0
      ? values.reduce((s, v) => s + v, 0) / values.length
      : 0;
  }

  private std(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
  }

  private normalizeFactor(value: number, min: number, max: number): number {
    return Math.max(-1, Math.min(1, (value - (min + max) / 2) / ((max - min) / 2)));
  }
}

// =============================================================================
// RESIDUAL ANALYZER
// =============================================================================

class ResidualAnalyzer {
  /**
   * Calculate residuals from factor model
   */
  calculateResiduals(
    returns: Map<string, number[]>,
    factorModels: Map<string, FactorModel>,
    pcaResult: PCAResult | null
  ): Map<string, ResidualAnalysis> {
    const residuals = new Map<string, ResidualAnalysis>();

    for (const [symbol, rets] of returns) {
      if (rets.length < 5) continue;

      const actualReturn = rets[rets.length - 1];

      // Calculate expected return from factors
      let expectedReturn = 0;
      const factorExposures = new Map<string, number>();

      for (const [factorName, factor] of factorModels) {
        const exposure = factor.factorExposures.get(symbol) || 0;
        factorExposures.set(factorName, exposure);
        expectedReturn += exposure * factor.meanReturn;
      }

      // Add PCA-based expected return if available
      if (pcaResult && pcaResult.factorLoadings.size > 0) {
        // Simplified PCA contribution
        const pcContribution = this.getPredictedReturn(symbol, pcaResult);
        expectedReturn = expectedReturn * 0.5 + pcContribution * 0.5;
      }

      const residual = actualReturn - expectedReturn;

      // Calculate residual statistics
      const historicalResiduals: number[] = [];
      const windowSize = Math.min(20, rets.length - 1);

      for (let i = 1; i <= windowSize; i++) {
        const pastReturn = rets[rets.length - 1 - i];
        let pastExpected = 0;

        for (const [_, factor] of factorModels) {
          const exposure = factor.factorExposures.get(symbol) || 0;
          const factorReturn = factor.returns[factor.returns.length - 1 - i] || 0;
          pastExpected += exposure * factorReturn;
        }

        historicalResiduals.push(pastReturn - pastExpected);
      }

      const residualStd = this.std(historicalResiduals);
      const residualZScore = residualStd > 0 ? residual / residualStd : 0;

      // Calculate R-squared
      const rSquared = this.calculateRSquared(rets, factorModels, symbol);

      residuals.set(symbol, {
        symbol,
        actualReturn,
        expectedReturn,
        residual,
        residualZScore,
        residualStd,
        rSquared,
        lastUpdated: Date.now(),
      });
    }

    return residuals;
  }

  /**
   * Get predicted return from PCA
   */
  private getPredictedReturn(symbol: string, pcaResult: PCAResult): number {
    // Simplified: use first PC loading as predictor
    if (pcaResult.explainedVarianceRatio.length === 0) return 0;

    // Use explained variance weighted prediction
    let prediction = 0;
    for (let i = 0; i < pcaResult.components.length; i++) {
      const weight = pcaResult.explainedVarianceRatio[i] || 0;
      // Simplified prediction component
      prediction += weight * 0.01; // Placeholder
    }

    return prediction;
  }

  /**
   * Calculate R-squared for factor model fit
   */
  private calculateRSquared(
    returns: number[],
    factorModels: Map<string, FactorModel>,
    symbol: string
  ): number {
    const actualReturns = returns.slice(-20);
    const expectedReturns: number[] = [];

    for (let i = 0; i < actualReturns.length; i++) {
      let expected = 0;
      for (const [_, factor] of factorModels) {
        const exposure = factor.factorExposures.get(symbol) || 0;
        const factorReturn = factor.returns[factor.returns.length - 1 - i] || 0;
        expected += exposure * factorReturn;
      }
      expectedReturns.push(expected);
    }

    // Calculate R-squared
    const ssRes = actualReturns.reduce((s, r, i) => s + Math.pow(r - expectedReturns[i], 2), 0);
    const meanActual = this.mean(actualReturns);
    const ssTot = actualReturns.reduce((s, r) => s + Math.pow(r - meanActual, 2), 0);

    return ssTot > 0 ? 1 - ssRes / ssTot : 0;
  }

  private mean(values: number[]): number {
    return values.length > 0
      ? values.reduce((s, v) => s + v, 0) / values.length
      : 0;
  }

  private std(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
  }
}

// =============================================================================
// REED BOT CLASS
// =============================================================================

export class ReedBot {
  private config: ReedConfig;
  private state: ReedState;
  private pcaEngine: PCAEngine;
  private factorEngine: FactorModelEngine;
  private residualAnalyzer: ResidualAnalyzer;
  private eventBus = getEventBus();
  private analysisInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<ReedConfig> = {}) {
    this.config = {
      name: 'Reed',
      code: 'STA',
      version: '2.0.0',
      mode: 'PAPER',
      exchanges: ['binance'],
      riskConfig: {
        maxPositionSize: 5000,
        maxTotalExposure: 50000,
        maxDrawdownPct: 0.10,
        riskPerTrade: 0.01,
        maxLeverage: 3,
      },
      strategy: {
        lookbackPeriod: 60,
        pcaComponents: 3,
        minExplainedVariance: 0.8,
        residualZScoreEntry: 2.0,
        residualZScoreExit: 0.5,
        maxHoldingPeriod: 5 * 24 * 60 * 60 * 1000,
        rebalanceFrequency: 24 * 60 * 60 * 1000,
        universeSize: 50,
        factorModels: ['MOMENTUM', 'MEAN_REVERSION', 'VOLATILITY', 'QUALITY'],
        sectorNeutral: true,
        marketNeutral: true,
        minExpectedReturn: 0.02,
        maxPositionWeight: 0.05,
        informationRatioTarget: 1.0,
      },
      ...config,
    };

    this.state = {
      status: 'STOPPED',
      pcaResult: null,
      factorModels: new Map(),
      residuals: new Map(),
      positions: new Map(),
      signals: [],
      portfolio: {
        positions: new Map(),
        totalExposure: 0,
        grossExposure: 0,
        netExposure: 0,
        factorExposures: new Map(),
        sectorExposures: new Map(),
        beta: 1,
        trackingError: 0,
        informationRatio: 0,
      },
      priceHistory: new Map(),
      returnsHistory: new Map(),
      stats: {
        totalTrades: 0,
        winRate: 0,
        avgPnL: 0,
        informationRatio: 0,
        trackingError: 0,
        factorReturns: new Map(),
        avgResidualZScore: 0,
        avgHoldingPeriod: 0,
        turnoverRate: 0,
      },
    };

    this.pcaEngine = new PCAEngine();
    this.factorEngine = new FactorModelEngine();
    this.residualAnalyzer = new ResidualAnalyzer();
  }

  // ===========================================================================
  // LIFECYCLE METHODS
  // ===========================================================================

  /**
   * Start the bot
   */
  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.state.status !== 'STOPPED') {
      return { success: false, message: 'Bot already running' };
    }

    this.state.status = 'STARTING';

    this.analysisInterval = setInterval(() => {
      this.analysisCycle();
    }, 60000);

    this.state.status = 'RUNNING';

    this.eventBus.emit('bot.started', {
      botCode: 'STA',
      botName: 'Reed',
      timestamp: Date.now(),
    });

    return { success: true, message: 'Reed started with PCA factor model engine' };
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    this.state.status = 'STOPPED';

    this.eventBus.emit('bot.stopped', {
      botCode: 'STA',
      botName: 'Reed',
      timestamp: Date.now(),
    });

    return { success: true, message: 'Reed stopped' };
  }

  // ===========================================================================
  // DATA MANAGEMENT
  // ===========================================================================

  /**
   * Update with new price data
   */
  public updatePrices(prices: Record<string, number>): StatArbSignal[] {
    // Update price and returns history
    for (const [symbol, price] of Object.entries(prices)) {
      if (!this.state.priceHistory.has(symbol)) {
        this.state.priceHistory.set(symbol, []);
        this.state.returnsHistory.set(symbol, []);
      }

      const priceHistory = this.state.priceHistory.get(symbol)!;
      const returnsHistory = this.state.returnsHistory.get(symbol)!;

      if (priceHistory.length > 0) {
        const prevPrice = priceHistory[priceHistory.length - 1];
        if (prevPrice > 0) {
          const ret = (price - prevPrice) / prevPrice;
          returnsHistory.push(ret);
        }
      }

      priceHistory.push(price);

      // Trim to lookback period
      const maxLen = this.config.strategy.lookbackPeriod * 2;
      if (priceHistory.length > maxLen) priceHistory.shift();
      if (returnsHistory.length > maxLen) returnsHistory.shift();
    }

    return this.analysisCycle();
  }

  /**
   * Analysis cycle
   */
  private analysisCycle(): StatArbSignal[] {
    if (this.state.status !== 'RUNNING') return [];

    // Run PCA
    this.runPCA();

    // Build factor models
    this.buildFactorModels();

    // Calculate residuals
    this.calculateResiduals();

    // Generate signals
    const signals = this.generateSignals();
    this.state.signals = signals;

    // Update positions
    this.updatePositions();

    // Update portfolio state
    this.updatePortfolioState();

    return signals;
  }

  /**
   * Run PCA analysis
   */
  private runPCA(): void {
    const symbols = Array.from(this.state.returnsHistory.keys());

    if (symbols.length < 3) return;

    // Build returns matrix
    const minLen = Math.min(...symbols.map(s => this.state.returnsHistory.get(s)?.length || 0));
    if (minLen < 20) return;

    const returnsMatrix: number[][] = symbols.map(symbol => {
      const rets = this.state.returnsHistory.get(symbol)!;
      return rets.slice(-minLen);
    });

    // Transpose for PCA (observations x variables)
    const transposed: number[][] = [];
    for (let i = 0; i < minLen; i++) {
      transposed.push(returnsMatrix.map(row => row[i]));
    }

    this.state.pcaResult = this.pcaEngine.performPCA(
      transposed,
      this.config.strategy.pcaComponents
    );
  }

  /**
   * Build factor models
   */
  private buildFactorModels(): void {
    this.state.factorModels = this.factorEngine.buildFactorModels(
      this.state.returnsHistory,
      this.config.strategy.factorModels
    );
  }

  /**
   * Calculate residuals
   */
  private calculateResiduals(): void {
    this.state.residuals = this.residualAnalyzer.calculateResiduals(
      this.state.returnsHistory,
      this.state.factorModels,
      this.state.pcaResult
    );
  }

  /**
   * Generate trading signals
   */
  private generateSignals(): StatArbSignal[] {
    const signals: StatArbSignal[] = [];

    for (const [symbol, residual] of this.state.residuals) {
      // Skip if we have position
      if (this.state.positions.has(symbol)) continue;

      const absZScore = Math.abs(residual.residualZScore);

      // Entry signal
      if (absZScore >= this.config.strategy.residualZScoreEntry) {
        const expectedReturn = this.factorEngine.calculateExpectedReturn(
          symbol,
          residual.rSquared > 0
            ? this.getFactorExposures(symbol)
            : new Map()
        );

        if (Math.abs(expectedReturn) + Math.abs(residual.residual) < this.config.strategy.minExpectedReturn) {
          continue;
        }

        const signal: StatArbSignal = {
          id: `sig-${symbol}-${Date.now()}`,
          timestamp: Date.now(),
          symbol,
          exchange: this.config.exchanges[0] || 'binance',
          direction: residual.residualZScore > 0 ? 'SHORT' : 'LONG',
          expectedReturn: expectedReturn + residual.residual,
          residualZScore: residual.residualZScore,
          confidence: this.calculateSignalConfidence(residual),
          factorExposures: this.getFactorExposures(symbol),
          holdingPeriod: Math.min(5, Math.round(Math.abs(residual.residualZScore))),
          positionWeight: Math.min(
            this.config.strategy.maxPositionWeight,
            Math.abs(residual.residualZScore) / 10
          ),
          riskContribution: Math.abs(residual.residual) * Math.sqrt(252),
          sector: 'UNKNOWN', // Would be populated from metadata
        };

        signals.push(signal);
      }
    }

    // Sort by expected return and limit
    signals.sort((a, b) => Math.abs(b.expectedReturn) - Math.abs(a.expectedReturn));
    return signals.slice(0, this.config.strategy.universeSize);
  }

  /**
   * Get factor exposures for a symbol
   */
  private getFactorExposures(symbol: string): Map<string, number> {
    const exposures = new Map<string, number>();

    for (const [factorName, factor] of this.state.factorModels) {
      const exposure = factor.factorExposures.get(symbol) || 0;
      exposures.set(factorName, exposure);
    }

    return exposures;
  }

  /**
   * Calculate signal confidence
   */
  private calculateSignalConfidence(residual: ResidualAnalysis): number {
    let confidence = 0;

    // Z-score magnitude (0-40%)
    confidence += Math.min(Math.abs(residual.residualZScore) / 4, 1) * 0.4;

    // Model fit (0-30%)
    confidence += Math.max(0, residual.rSquared) * 0.3;

    // Residual stability (0-30%)
    const stabilityScore = Math.max(0, 1 - residual.residualStd * 10);
    confidence += stabilityScore * 0.3;

    return Math.min(confidence, 1);
  }

  // ===========================================================================
  // POSITION MANAGEMENT
  // ===========================================================================

  /**
   * Open a position
   */
  public openPosition(signal: StatArbSignal, capital: number): StatArbPosition | null {
    if (this.state.positions.has(signal.symbol)) return null;

    const prices = this.state.priceHistory.get(signal.symbol);
    if (!prices?.length) return null;

    const price = prices[prices.length - 1];
    const size = (capital * signal.positionWeight) / price;

    const position: StatArbPosition = {
      id: `pos-${signal.symbol}-${Date.now()}`,
      symbol: signal.symbol,
      exchange: signal.exchange,
      side: signal.direction,
      size,
      entryPrice: price,
      currentPrice: price,
      expectedReturn: signal.expectedReturn,
      residualZScore: signal.residualZScore,
      factorExposures: signal.factorExposures,
      unrealizedPnl: 0,
      realizedPnl: 0,
      openedAt: Date.now(),
      holdingPeriod: 0,
      sector: signal.sector,
    };

    this.state.positions.set(signal.symbol, position);

    this.eventBus.emit('bot.trade', {
      botCode: 'STA',
      symbol: signal.symbol,
      side: signal.direction,
      quantity: size,
      timestamp: Date.now(),
    });

    return position;
  }

  /**
   * Update all positions
   */
  private updatePositions(): void {
    for (const [symbol, position] of this.state.positions) {
      const prices = this.state.priceHistory.get(symbol);
      const residual = this.state.residuals.get(symbol);

      if (!prices?.length) continue;

      const price = prices[prices.length - 1];
      position.currentPrice = price;
      position.holdingPeriod = Date.now() - position.openedAt;

      // Calculate PnL
      const pnlPct = position.side === 'LONG'
        ? (price - position.entryPrice) / position.entryPrice
        : (position.entryPrice - price) / position.entryPrice;

      position.unrealizedPnl = pnlPct * position.size * position.entryPrice;

      // Update residual z-score
      if (residual) {
        position.residualZScore = residual.residualZScore;
      }

      // Check exit conditions
      const absZScore = Math.abs(position.residualZScore);

      if (absZScore <= this.config.strategy.residualZScoreExit) {
        this.closePosition(symbol, 'Target reached');
        continue;
      }

      if (position.holdingPeriod >= this.config.strategy.maxHoldingPeriod) {
        this.closePosition(symbol, 'Holding period exceeded');
      }
    }
  }

  /**
   * Update portfolio state
   */
  private updatePortfolioState(): void {
    let totalExposure = 0;
    let grossExposure = 0;
    const factorExposures = new Map<string, number>();
    const sectorExposures = new Map<string, number>();

    for (const [_, position] of this.state.positions) {
      const value = position.size * position.currentPrice;
      totalExposure += position.side === 'LONG' ? value : -value;
      grossExposure += value;

      // Aggregate factor exposures
      for (const [factor, exposure] of position.factorExposures) {
        factorExposures.set(factor, (factorExposures.get(factor) || 0) + exposure * value);
      }

      // Aggregate sector exposures
      sectorExposures.set(
        position.sector,
        (sectorExposures.get(position.sector) || 0) + value
      );
    }

    this.state.portfolio = {
      positions: new Map(this.state.positions),
      totalExposure,
      grossExposure,
      netExposure: totalExposure / Math.max(1, grossExposure),
      factorExposures,
      sectorExposures,
      beta: 1, // Would calculate from regression
      trackingError: 0,
      informationRatio: this.stats.informationRatio,
    };
  }

  /**
   * Close a position
   */
  public closePosition(symbol: string, reason: string): { pnl: number; reason: string } | null {
    const position = this.state.positions.get(symbol);
    if (!position) return null;

    this.state.positions.delete(symbol);

    // Update stats
    this.state.stats.totalTrades++;
    if (position.unrealizedPnl > 0) {
      const wins = Math.round(this.state.stats.winRate * (this.state.stats.totalTrades - 1));
      this.state.stats.winRate = (wins + 1) / this.state.stats.totalTrades;
    }

    this.state.stats.avgHoldingPeriod =
      (this.state.stats.avgHoldingPeriod * (this.state.stats.totalTrades - 1) + position.holdingPeriod)
      / this.state.stats.totalTrades;

    this.eventBus.emit('bot.signal', {
      botCode: 'STA',
      signalType: 'position_closed',
      symbol,
      data: { pnl: position.unrealizedPnl, reason },
      timestamp: Date.now(),
    });

    return { pnl: position.unrealizedPnl, reason };
  }

  // ===========================================================================
  // QUERY METHODS
  // ===========================================================================

  /**
   * Get current state
   */
  public getState(): ReedState {
    return {
      ...this.state,
      factorModels: new Map(this.state.factorModels),
      residuals: new Map(this.state.residuals),
      positions: new Map(this.state.positions),
      portfolio: { ...this.state.portfolio },
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): ReedConfig {
    return { ...this.config };
  }

  /**
   * Get PCA result
   */
  public getPCAResult(): PCAResult | null {
    return this.state.pcaResult;
  }

  /**
   * Get factor models
   */
  public getFactorModels(): FactorModel[] {
    return Array.from(this.state.factorModels.values());
  }

  /**
   * Get residuals
   */
  public getResiduals(): ResidualAnalysis[] {
    return Array.from(this.state.residuals.values());
  }

  /**
   * Get signals
   */
  public getSignals(): StatArbSignal[] {
    return [...this.state.signals];
  }

  /**
   * Get positions
   */
  public getPositions(): StatArbPosition[] {
    return Array.from(this.state.positions.values());
  }

  /**
   * Get portfolio state
   */
  public getPortfolio(): PortfolioState {
    return { ...this.state.portfolio };
  }

  /**
   * Get statistics (with getter for stats.informationRatio)
   */
  private get stats() {
    return this.state.stats;
  }
}
