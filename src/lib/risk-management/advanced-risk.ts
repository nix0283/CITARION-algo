/**
 * CITARION Advanced Risk Management
 * Stage 4.3 - Enhanced VaR Calculator & Stress Testing
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VaRResult {
  var: number;
  expectedShortfall: number;
  confidenceLevel: number;
  method: 'historical' | 'parametric' | 'monte_carlo';
  timestamp: Date;
  distribution?: number[];
}

export interface StressTestScenario {
  name: string;
  description: string;
  type: 'historical' | 'hypothetical';
  shocks: Record<string, number>; // symbol -> % change
  date?: Date;
}

export interface StressTestResult {
  scenario: string;
  pnlImpact: number;
  pnlImpactPct: number;
  positionsAtRisk: number;
  marginCallRisk: boolean;
  recommendations: string[];
}

export interface PositionRisk {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  margin: number;
  leverage: number;
  liquidationPrice?: number;
  var: number;
  beta?: number;
}

export interface PortfolioRisk {
  totalVar: number;
  diversifiedVar: number;
  componentVar: Record<string, number>;
  marginalVar: Record<string, number>;
  betaWeightedVar: number;
  concentrationRisk: number;
  correlationRisk: number;
}

// ============================================================================
// ENHANCED VAR CALCULATOR
// ============================================================================

export class EnhancedVaRCalculator {
  /**
   * Historical Simulation VaR
   * Uses actual historical returns distribution
   */
  calculateHistoricalVaR(
    returns: number[],
    confidenceLevels: number[] = [0.95, 0.99],
    portfolioValue: number = 1
  ): VaRResult[] {
    const results: VaRResult[] = [];
    const sorted = [...returns].sort((a, b) => a - b);

    for (const confidence of confidenceLevels) {
      const index = Math.floor((1 - confidence) * sorted.length);
      const varValue = sorted[index] * portfolioValue;

      // Expected Shortfall (CVaR)
      const esReturns = sorted.slice(0, index + 1);
      const expectedShortfall =
        (esReturns.reduce((a, b) => a + b, 0) / esReturns.length) *
        portfolioValue;

      results.push({
        var: Math.abs(varValue),
        expectedShortfall: Math.abs(expectedShortfall),
        confidenceLevel: confidence,
        method: 'historical',
        timestamp: new Date(),
        distribution: sorted,
      });
    }

    return results;
  }

  /**
   * Parametric VaR (Variance-Covariance)
   * Assumes normal distribution
   */
  calculateParametricVaR(
    returns: number[],
    confidenceLevels: number[] = [0.95, 0.99],
    portfolioValue: number = 1
  ): VaRResult[] {
    const results: VaRResult[] = [];

    const mean = this.mean(returns);
    const std = this.standardDeviation(returns);

    const zScores: Record<number, number> = {
      0.90: 1.282,
      0.95: 1.645,
      0.99: 2.326,
    };

    for (const confidence of confidenceLevels) {
      const zScore = zScores[confidence] || 1.645;
      const varValue = (mean - zScore * std) * portfolioValue;

      // Expected Shortfall for normal distribution
      const esMultiplier = Math.exp((-(zScore ** 2)) / 2) / ((1 - confidence) * Math.sqrt(2 * Math.PI));
      const expectedShortfall = (mean - std * esMultiplier) * portfolioValue;

      results.push({
        var: Math.abs(varValue),
        expectedShortfall: Math.abs(expectedShortfall),
        confidenceLevel: confidence,
        method: 'parametric',
        timestamp: new Date(),
      });
    }

    return results;
  }

  /**
   * Monte Carlo VaR
   * Simulates future scenarios
   */
  async calculateMonteCarloVaR(
    positions: PositionRisk[],
    historicalReturns: Record<string, number[]>,
    options: {
      scenarios?: number;
      timeHorizon?: number; // days
      confidenceLevels?: number[];
    } = {}
  ): Promise<VaRResult[]> {
    const {
      scenarios = 10000,
      timeHorizon = 1,
      confidenceLevels = [0.95, 0.99],
    } = options;

    // Calculate mean returns and covariance matrix
    const symbols = Object.keys(historicalReturns);
    const meanReturns: Record<string, number> = {};
    const volatilities: Record<string, number> = {};

    for (const symbol of symbols) {
      const returns = historicalReturns[symbol];
      meanReturns[symbol] = this.mean(returns);
      volatilities[symbol] = this.standardDeviation(returns);
    }

    // Correlation matrix (simplified)
    const correlations = this.calculateCorrelations(historicalReturns);

    // Generate scenarios
    const scenarioPnls: number[] = [];

    for (let i = 0; i < scenarios; i++) {
      let scenarioPnl = 0;

      for (const position of positions) {
        const symbol = position.symbol;
        if (!symbols.includes(symbol)) continue;

        // Generate correlated random returns using Cholesky decomposition (simplified)
        const randomReturn = this.generateCorrelatedReturn(
          meanReturns[symbol],
          volatilities[symbol],
          timeHorizon
        );

        // Calculate PnL impact
        const priceChange = randomReturn;
        const pnl =
          position.side === 'LONG'
            ? position.size * priceChange
            : -position.size * priceChange;

        scenarioPnl += pnl;
      }

      scenarioPnls.push(scenarioPnl);
    }

    // Calculate VaR from scenarios
    const sorted = [...scenarioPnls].sort((a, b) => a - b);
    const results: VaRResult[] = [];

    for (const confidence of confidenceLevels) {
      const index = Math.floor((1 - confidence) * scenarios);
      const varValue = sorted[index];

      const esReturns = sorted.slice(0, index + 1);
      const expectedShortfall = esReturns.reduce((a, b) => a + b, 0) / esReturns.length;

      results.push({
        var: Math.abs(varValue),
        expectedShortfall: Math.abs(expectedShortfall),
        confidenceLevel: confidence,
        method: 'monte_carlo',
        timestamp: new Date(),
        distribution: sorted,
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private standardDeviation(values: number[]): number {
    const avg = this.mean(values);
    const squareDiffs = values.map((v) => (v - avg) ** 2);
    return Math.sqrt(this.mean(squareDiffs));
  }

  private calculateCorrelations(
    returns: Record<string, number[]>
  ): Record<string, Record<string, number>> {
    const symbols = Object.keys(returns);
    const correlations: Record<string, Record<string, number>> = {};

    for (const s1 of symbols) {
      correlations[s1] = {};
      for (const s2 of symbols) {
        correlations[s1][s2] = this.correlation(returns[s1], returns[s2]);
      }
    }

    return correlations;
  }

  private correlation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const meanX = this.mean(xSlice);
    const meanY = this.mean(ySlice);

    const stdX = this.standardDeviation(xSlice);
    const stdY = this.standardDeviation(ySlice);

    if (stdX === 0 || stdY === 0) return 0;

    const covariance =
      xSlice.reduce((sum, xi, i) => sum + (xi - meanX) * (ySlice[i] - meanY), 0) / n;

    return covariance / (stdX * stdY);
  }

  private generateCorrelatedReturn(
    meanReturn: number,
    volatility: number,
    timeHorizon: number
  ): number {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    return meanReturn * timeHorizon + volatility * Math.sqrt(timeHorizon) * z;
  }
}

// ============================================================================
// STRESS TESTING ENGINE
// ============================================================================

export class StressTestingEngine {
  private scenarios: StressTestScenario[] = [];

  constructor() {
    this.initializeScenarios();
  }

  private initializeScenarios(): void {
    // Historical scenarios
    this.scenarios.push({
      name: '2008 Financial Crisis',
      description: 'Global financial crisis - massive sell-off',
      type: 'historical',
      date: new Date('2008-09-15'),
      shocks: {
        BTC: -0.50, // Bitcoin didn't exist, but hypothetical
        ETH: -0.50,
        SPX: -0.20,
        GOLD: 0.10,
      },
    });

    this.scenarios.push({
      name: 'COVID-19 Crash',
      description: 'March 2020 market crash',
      type: 'historical',
      date: new Date('2020-03-12'),
      shocks: {
        BTC: -0.40,
        ETH: -0.45,
        LTC: -0.50,
        XRP: -0.35,
      },
    });

    this.scenarios.push({
      name: 'FTX Collapse',
      description: 'November 2022 crypto crash',
      type: 'historical',
      date: new Date('2022-11-08'),
      shocks: {
        BTC: -0.25,
        ETH: -0.30,
        SOL: -0.60,
        FTT: -0.95,
      },
    });

    // Hypothetical scenarios
    this.scenarios.push({
      name: 'Flash Crash',
      description: 'Sudden 20% drop in 5 minutes',
      type: 'hypothetical',
      shocks: {
        BTC: -0.20,
        ETH: -0.25,
        '*': -0.20,
      },
    });

    this.scenarios.push({
      name: 'Liquidity Crisis',
      description: 'Widening spreads, low liquidity',
      type: 'hypothetical',
      shocks: {
        BTC: -0.15,
        ETH: -0.20,
        ALTCOINS: -0.30,
      },
    });

    this.scenarios.push({
      name: 'Regulatory Crackdown',
      description: 'Major regulatory action against crypto',
      type: 'hypothetical',
      shocks: {
        BTC: -0.30,
        ETH: -0.35,
        PRIVACY: -0.50,
        DEFI: -0.40,
      },
    });

    this.scenarios.push({
      name: 'Black Swan',
      description: 'Extreme tail event - 50%+ drop',
      type: 'hypothetical',
      shocks: {
        BTC: -0.50,
        ETH: -0.55,
        '*': -0.50,
      },
    });
  }

  // -------------------------------------------------------------------------
  // STRESS TEST EXECUTION
  // -------------------------------------------------------------------------

  runStressTest(
    positions: PositionRisk[],
    scenarioName?: string
  ): StressTestResult[] {
    const results: StressTestResult[] = [];

    const scenariosToRun = scenarioName
      ? this.scenarios.filter((s) => s.name === scenarioName)
      : this.scenarios;

    for (const scenario of scenariosToRun) {
      let pnlImpact = 0;
      let positionsAtRisk = 0;
      let marginCallRisk = false;

      const recommendations: string[] = [];

      for (const position of positions) {
        const shock = this.getShock(scenario, position.symbol);

        // Calculate PnL impact
        const priceImpact = position.currentPrice * shock;
        const positionPnl =
          position.side === 'LONG'
            ? position.size * priceImpact
            : -position.size * priceImpact;

        pnlImpact += positionPnl;

        // Check if position is at risk
        const newPnl = position.unrealizedPnl + positionPnl;
        const marginRatio = position.margin + positionPnl;

        if (marginRatio < 0) {
          positionsAtRisk++;
          marginCallRisk = true;
        }

        // Generate recommendations
        if (newPnl < -position.margin * 0.5) {
          recommendations.push(
            `Reduce ${position.symbol} position to avoid liquidation`
          );
        }
      }

      // Portfolio-level recommendations
      if (pnlImpact < -0.1 * this.getTotalValue(positions)) {
        recommendations.push('Implement portfolio-wide hedge');
      }

      if (marginCallRisk) {
        recommendations.push('Increase margin buffer immediately');
      }

      results.push({
        scenario: scenario.name,
        pnlImpact,
        pnlImpactPct: pnlImpact / this.getTotalValue(positions),
        positionsAtRisk,
        marginCallRisk,
        recommendations: recommendations.slice(0, 5),
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // CUSTOM SCENARIO
  // -------------------------------------------------------------------------

  addCustomScenario(scenario: StressTestScenario): void {
    this.scenarios.push(scenario);
  }

  runCustomStressTest(
    positions: PositionRisk[],
    shocks: Record<string, number>
  ): StressTestResult {
    const scenario: StressTestScenario = {
      name: 'Custom',
      description: 'User-defined stress test',
      type: 'hypothetical',
      shocks,
    };

    return this.runStressTest(positions, 'Custom')[0];
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private getShock(scenario: StressTestScenario, symbol: string): number {
    // Direct match
    if (scenario.shocks[symbol] !== undefined) {
      return scenario.shocks[symbol];
    }

    // Wildcard
    if (scenario.shocks['*'] !== undefined) {
      return scenario.shocks['*'];
    }

    // Category matches
    const categories: Record<string, string[]> = {
      ALTCOINS: ['ETH', 'LTC', 'XRP', 'ADA', 'DOGE', 'DOT', 'LINK'],
      PRIVACY: ['XMR', 'ZEC', 'DASH'],
      DEFI: ['UNI', 'AAVE', 'COMP', 'MKR', 'SNX'],
    };

    for (const [category, symbols] of Object.entries(categories)) {
      if (symbols.includes(symbol) && scenario.shocks[category]) {
        return scenario.shocks[category];
      }
    }

    return 0;
  }

  private getTotalValue(positions: PositionRisk[]): number {
    return positions.reduce(
      (sum, p) => sum + p.size * p.currentPrice,
      0
    );
  }

  getAvailableScenarios(): StressTestScenario[] {
    return [...this.scenarios];
  }
}

// ============================================================================
// PORTFOLIO RISK ANALYZER
// ============================================================================

export class PortfolioRiskAnalyzer {
  /**
   * Calculate portfolio-level risk metrics
   */
  analyzePortfolioRisk(
    positions: PositionRisk[],
    returns: Record<string, number[]>,
    confidence: number = 0.95
  ): PortfolioRisk {
    const varCalculator = new EnhancedVaRCalculator();

    // Individual VaRs
    const individualVars: Record<string, number> = {};
    for (const position of positions) {
      const symbolReturns = returns[position.symbol] || [];
      if (symbolReturns.length > 0) {
        const varResult = varCalculator.calculateHistoricalVaR(
          symbolReturns,
          [confidence],
          position.size * position.currentPrice
        )[0];
        individualVars[position.symbol] = varResult.var;
      }
    }

    // Undiversified VaR (simple sum)
    const totalVar = Object.values(individualVars).reduce((a, b) => a + b, 0);

    // Diversified VaR (considering correlations)
    const diversifiedVar = this.calculateDiversifiedVar(
      positions,
      returns,
      confidence
    );

    // Component VaR
    const componentVar = this.calculateComponentVar(
      positions,
      returns,
      diversifiedVar,
      confidence
    );

    // Marginal VaR
    const marginalVar = this.calculateMarginalVar(
      positions,
      returns,
      diversifiedVar,
      confidence
    );

    // Concentration risk
    const concentrationRisk = this.calculateConcentrationRisk(positions);

    // Correlation risk
    const correlationRisk = this.calculateCorrelationRisk(positions, returns);

    return {
      totalVar,
      diversifiedVar,
      componentVar,
      marginalVar,
      betaWeightedVar: diversifiedVar, // Simplified
      concentrationRisk,
      correlationRisk,
    };
  }

  private calculateDiversifiedVar(
    positions: PositionRisk[],
    returns: Record<string, number[]>,
    confidence: number
  ): number {
    // Simplified: use correlation-adjusted sum
    const weights: number[] = [];
    const volatilities: number[] = [];
    const correlationMatrix: number[][] = [];

    const symbols = positions.map((p) => p.symbol);

    for (let i = 0; i < symbols.length; i++) {
      const symbolReturns = returns[symbols[i]] || [];
      const vol = this.std(symbolReturns);
      volatilities.push(vol);

      const weight =
        (positions[i].size * positions[i].currentPrice) /
        positions.reduce((s, p) => s + p.size * p.currentPrice, 0);
      weights.push(weight);

      correlationMatrix[i] = [];
      for (let j = 0; j < symbols.length; j++) {
        const returns1 = returns[symbols[i]] || [];
        const returns2 = returns[symbols[j]] || [];
        correlationMatrix[i][j] = this.correlation(returns1, returns2);
      }
    }

    // Portfolio variance
    let portfolioVariance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        portfolioVariance +=
          weights[i] * weights[j] * volatilities[i] * volatilities[j] * correlationMatrix[i][j];
      }
    }

    const portfolioVol = Math.sqrt(portfolioVariance);
    const totalValue = positions.reduce(
      (s, p) => s + p.size * p.currentPrice,
      0
    );

    // VaR at confidence level
    const zScore = confidence === 0.99 ? 2.326 : 1.645;
    return totalValue * portfolioVol * zScore;
  }

  private calculateComponentVar(
    positions: PositionRisk[],
    returns: Record<string, number[]>,
    diversifiedVar: number,
    confidence: number
  ): Record<string, number> {
    const componentVar: Record<string, number> = {};
    const totalValue = positions.reduce(
      (s, p) => s + p.size * p.currentPrice,
      0
    );

    for (const position of positions) {
      const weight = (position.size * position.currentPrice) / totalValue;
      componentVar[position.symbol] = weight * diversifiedVar;
    }

    return componentVar;
  }

  private calculateMarginalVar(
    positions: PositionRisk[],
    returns: Record<string, number[]>,
    diversifiedVar: number,
    confidence: number
  ): Record<string, number> {
    const marginalVar: Record<string, number> = {};
    const totalValue = positions.reduce(
      (s, p) => s + p.size * p.currentPrice,
      0
    );

    for (const position of positions) {
      // Simplified: marginal VaR is approximately component VaR divided by weight
      const weight = (position.size * position.currentPrice) / totalValue;
      marginalVar[position.symbol] = weight > 0 ? diversifiedVar / totalValue : 0;
    }

    return marginalVar;
  }

  private calculateConcentrationRisk(positions: PositionRisk[]): number {
    // Herfindahl-Hirschman Index for concentration
    const totalValue = positions.reduce(
      (s, p) => s + p.size * p.currentPrice,
      0
    );
    const weights = positions.map(
      (p) => (p.size * p.currentPrice) / totalValue
    );
    return weights.reduce((sum, w) => sum + w * w, 0);
  }

  private calculateCorrelationRisk(
    positions: PositionRisk[],
    returns: Record<string, number[]>
  ): number {
    // Average pairwise correlation
    const symbols = positions.map((p) => p.symbol);
    let totalCorr = 0;
    let count = 0;

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const returns1 = returns[symbols[i]] || [];
        const returns2 = returns[symbols[j]] || [];
        totalCorr += Math.abs(this.correlation(returns1, returns2));
        count++;
      }
    }

    return count > 0 ? totalCorr / count : 0;
  }

  private mean(values: number[]): number {
    return values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
  }

  private std(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    return Math.sqrt(
      values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
    );
  }

  private correlation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const meanX = this.mean(xSlice);
    const meanY = this.mean(ySlice);

    const stdX = this.std(xSlice);
    const stdY = this.std(ySlice);

    if (stdX === 0 || stdY === 0) return 0;

    const covariance =
      xSlice.reduce((sum, xi, i) => sum + (xi - meanX) * (ySlice[i] - meanY), 0) / n;

    return covariance / (stdX * stdY);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const enhancedVarCalculator = new EnhancedVaRCalculator();
export const stressTestingEngine = new StressTestingEngine();
export const portfolioRiskAnalyzer = new PortfolioRiskAnalyzer();
