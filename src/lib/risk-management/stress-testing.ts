/**
 * Stress Testing Engine
 * Comprehensive stress testing for portfolio risk assessment
 * Audit Fix: P2.13 - Implement Stress Testing Engine
 */

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  type: 'historical' | 'hypothetical' | 'reverse' | 'custom';
  shocks: MarketShock[];
  duration: number; // Duration in days
  probability?: number; // Estimated probability
  severity: 'mild' | 'moderate' | 'severe' | 'extreme';
}

export interface MarketShock {
  type: 'price' | 'volatility' | 'correlation' | 'rate' | 'spread' | 'liquidity';
  symbol?: string; // If undefined, applies to all
  assetClass?: 'crypto' | 'equity' | 'fx' | 'commodity' | 'rates';
  shock: number; // Percentage or absolute change
  direction: 'up' | 'down' | 'both';
}

export interface StressTestResult {
  scenarioId: string;
  scenarioName: string;
  portfolioValueBefore: number;
  portfolioValueAfter: number;
  pnl: number;
  pnlPercent: number;
  worstPosition: {
    symbol: string;
    pnl: number;
    pnlPercent: number;
  };
  bestPosition: {
    symbol: string;
    pnl: number;
    pnlPercent: number;
  };
  marginCall: boolean;
  liquidationRisk: boolean;
  breakevenShock: number;
  riskMetrics: {
    maxDrawdown: number;
    leverageAfter: number;
    marginUsage: number;
  };
  timestamp: number;
}

export interface PortfolioPosition {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  margin: number;
  liquidationPrice?: number;
  unrealizedPnl: number;
}

export interface StressTestConfig {
  defaultProbability: number;
  includeCorrelationShocks: boolean;
  includeVolatilityShocks: boolean;
  maxScenarios: number;
  reportingCurrency: string;
}

const DEFAULT_CONFIG: StressTestConfig = {
  defaultProbability: 0.01,
  includeCorrelationShocks: true,
  includeVolatilityShocks: true,
  maxScenarios: 50,
  reportingCurrency: 'USD',
};

// Built-in stress scenarios
const BUILTIN_SCENARIOS: StressScenario[] = [
  {
    id: 'crypto_crash_2022',
    name: 'Crypto Market Crash (2022-like)',
    description: 'Simulates the 2022 crypto market crash with 70-90% drawdowns',
    type: 'historical',
    shocks: [
      { type: 'price', assetClass: 'crypto', shock: -80, direction: 'down' },
      { type: 'volatility', assetClass: 'crypto', shock: 200, direction: 'up' },
      { type: 'correlation', assetClass: 'crypto', shock: 50, direction: 'up' },
    ],
    duration: 180,
    probability: 0.05,
    severity: 'extreme',
  },
  {
    id: 'flash_crash',
    name: 'Flash Crash',
    description: 'Sudden 30% price drop in minutes with high volatility',
    type: 'hypothetical',
    shocks: [
      { type: 'price', assetClass: 'crypto', shock: -30, direction: 'down' },
      { type: 'volatility', assetClass: 'crypto', shock: 500, direction: 'up' },
      { type: 'liquidity', assetClass: 'crypto', shock: -80, direction: 'down' },
    ],
    duration: 1,
    probability: 0.02,
    severity: 'severe',
  },
  {
    id: 'btc_dominance_shift',
    name: 'BTC Dominance Shift',
    description: 'BTC up 20% while altcoins down 40%',
    type: 'hypothetical',
    shocks: [
      { type: 'price', symbol: 'BTC', shock: 20, direction: 'up' },
      { type: 'price', assetClass: 'crypto', shock: -40, direction: 'down' },
    ],
    duration: 30,
    probability: 0.1,
    severity: 'moderate',
  },
  {
    id: 'leveraged_unwind',
    name: 'Leveraged Position Unwind',
    description: 'Cascade of liquidations causing 50% drop',
    type: 'hypothetical',
    shocks: [
      { type: 'price', assetClass: 'crypto', shock: -50, direction: 'down' },
      { type: 'spread', assetClass: 'crypto', shock: 300, direction: 'up' },
      { type: 'liquidity', assetClass: 'crypto', shock: -70, direction: 'down' },
    ],
    duration: 7,
    probability: 0.03,
    severity: 'extreme',
  },
  {
    id: 'regulatory_crackdown',
    name: 'Regulatory Crackdown',
    description: 'Major regulatory action causing market panic',
    type: 'hypothetical',
    shocks: [
      { type: 'price', assetClass: 'crypto', shock: -40, direction: 'down' },
      { type: 'volatility', assetClass: 'crypto', shock: 300, direction: 'up' },
      { type: 'liquidity', assetClass: 'crypto', shock: -60, direction: 'down' },
    ],
    duration: 30,
    probability: 0.05,
    severity: 'severe',
  },
  {
    id: 'stablecoin_depeg',
    name: 'Stablecoin Depeg',
    description: 'Major stablecoin loses peg causing market chaos',
    type: 'hypothetical',
    shocks: [
      { type: 'price', assetClass: 'crypto', shock: -25, direction: 'down' },
      { type: 'spread', assetClass: 'crypto', shock: 500, direction: 'up' },
      { type: 'volatility', assetClass: 'crypto', shock: 400, direction: 'up' },
    ],
    duration: 14,
    probability: 0.02,
    severity: 'severe',
  },
  {
    id: 'bull_run',
    name: 'Bull Run Scenario',
    description: 'Market rally with 100% gains',
    type: 'hypothetical',
    shocks: [
      { type: 'price', assetClass: 'crypto', shock: 100, direction: 'up' },
      { type: 'volatility', assetClass: 'crypto', shock: -30, direction: 'down' },
    ],
    duration: 90,
    probability: 0.15,
    severity: 'mild',
  },
  {
    id: 'correlation_breakdown',
    name: 'Correlation Breakdown',
    description: 'Normal correlations break down, pairs diverge wildly',
    type: 'hypothetical',
    shocks: [
      { type: 'correlation', assetClass: 'crypto', shock: -60, direction: 'down' },
      { type: 'volatility', assetClass: 'crypto', shock: 100, direction: 'up' },
    ],
    duration: 30,
    probability: 0.08,
    severity: 'moderate',
  },
  {
    id: 'black_swan',
    name: 'Black Swan Event',
    description: 'Extreme unexpected event with 90% market crash',
    type: 'hypothetical',
    shocks: [
      { type: 'price', assetClass: 'crypto', shock: -90, direction: 'down' },
      { type: 'volatility', assetClass: 'crypto', shock: 1000, direction: 'up' },
      { type: 'liquidity', assetClass: 'crypto', shock: -95, direction: 'down' },
      { type: 'spread', assetClass: 'crypto', shock: 1000, direction: 'up' },
    ],
    duration: 30,
    probability: 0.005,
    severity: 'extreme',
  },
];

export class StressTestingEngine {
  private config: StressTestConfig;
  private customScenarios: Map<string, StressScenario> = new Map();
  private priceHistory: Map<string, number[]> = new Map();

  constructor(config: Partial<StressTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Load built-in scenarios
    for (const scenario of BUILTIN_SCENARIOS) {
      this.customScenarios.set(scenario.id, scenario);
    }
  }

  /**
   * Add price history for a symbol
   */
  addPriceHistory(symbol: string, prices: number[]): void {
    this.priceHistory.set(symbol, prices);
  }

  /**
   * Add custom stress scenario
   */
  addScenario(scenario: StressScenario): void {
    if (this.customScenarios.size >= this.config.maxScenarios) {
      throw new Error('Maximum number of scenarios reached');
    }
    this.customScenarios.set(scenario.id, scenario);
  }

  /**
   * Remove a scenario
   */
  removeScenario(scenarioId: string): boolean {
    return this.customScenarios.delete(scenarioId);
  }

  /**
   * Get all scenarios
   */
  getScenarios(): StressScenario[] {
    return Array.from(this.customScenarios.values());
  }

  /**
   * Get scenario by ID
   */
  getScenario(id: string): StressScenario | undefined {
    return this.customScenarios.get(id);
  }

  /**
   * Run a single stress test
   */
  runStressTest(
    positions: PortfolioPosition[],
    scenarioId: string
  ): StressTestResult | null {
    const scenario = this.customScenarios.get(scenarioId);
    if (!scenario) {
      console.error(`[StressTest] Scenario ${scenarioId} not found`);
      return null;
    }

    return this.applyScenario(positions, scenario);
  }

  /**
   * Run all stress tests
   */
  runAllStressTests(positions: PortfolioPosition[]): StressTestResult[] {
    const results: StressTestResult[] = [];

    for (const scenario of this.customScenarios.values()) {
      const result = this.applyScenario(positions, scenario);
      if (result) {
        results.push(result);
      }
    }

    return results.sort((a, b) => a.pnl - b.pnl);
  }

  /**
   * Apply scenario to positions
   */
  private applyScenario(
    positions: PortfolioPosition[],
    scenario: StressScenario
  ): StressTestResult {
    const portfolioValueBefore = this.calculatePortfolioValue(positions);
    const shockedPositions = this.applyShocks(positions, scenario.shocks);
    const portfolioValueAfter = this.calculatePortfolioValue(shockedPositions);

    const pnl = portfolioValueAfter - portfolioValueBefore;
    const pnlPercent = portfolioValueBefore > 0 
      ? (pnl / portfolioValueBefore) * 100 
      : 0;

    // Find worst and best positions
    const positionResults = positions.map((pos, i) => ({
      symbol: pos.symbol,
      pnl: shockedPositions[i].unrealizedPnl - pos.unrealizedPnl,
      pnlPercent: pos.size * pos.currentPrice > 0
        ? ((shockedPositions[i].unrealizedPnl - pos.unrealizedPnl) / (pos.size * pos.currentPrice)) * 100
        : 0,
    }));

    positionResults.sort((a, b) => a.pnl - b.pnl);

    const worstPosition = positionResults[0] || { symbol: 'N/A', pnl: 0, pnlPercent: 0 };
    const bestPosition = positionResults[positionResults.length - 1] || { symbol: 'N/A', pnl: 0, pnlPercent: 0 };

    // Calculate margin call and liquidation risk
    const totalMargin = positions.reduce((sum, p) => sum + p.margin, 0);
    const marginAfter = totalMargin + pnl;
    const marginCall = marginAfter < totalMargin * 0.5;
    
    const liquidationRisk = shockedPositions.some((pos, i) => {
      const originalPos = positions[i];
      return originalPos.liquidationPrice && 
        ((originalPos.side === 'long' && shockedPositions[i].currentPrice <= (originalPos.liquidationPrice || 0)) ||
         (originalPos.side === 'short' && shockedPositions[i].currentPrice >= (originalPos.liquidationPrice || Infinity)));
    });

    // Calculate breakeven shock
    const breakevenShock = this.calculateBreakevenShock(positions);

    // Calculate risk metrics
    const maxDrawdown = this.calculateMaxDrawdown(positions, shockedPositions);
    const leverageAfter = this.calculateLeverage(shockedPositions);
    const marginUsage = totalMargin > 0 ? (marginAfter / totalMargin) * 100 : 0;

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      portfolioValueBefore,
      portfolioValueAfter,
      pnl,
      pnlPercent,
      worstPosition,
      bestPosition,
      marginCall,
      liquidationRisk,
      breakevenShock,
      riskMetrics: {
        maxDrawdown,
        leverageAfter,
        marginUsage,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Apply shocks to positions
   */
  private applyShocks(
    positions: PortfolioPosition[],
    shocks: MarketShock[]
  ): PortfolioPosition[] {
    return positions.map(pos => {
      let shockedPrice = pos.currentPrice;
      let volatilityMultiplier = 1;

      for (const shock of shocks) {
        // Check if shock applies to this position
        if (shock.symbol && shock.symbol !== pos.symbol) continue;
        // For crypto positions, apply crypto asset class shocks
        if (shock.assetClass && shock.assetClass !== 'crypto') continue;

        switch (shock.type) {
          case 'price':
            const priceChange = shockedPrice * (shock.shock / 100);
            if (shock.direction === 'up') {
              shockedPrice += Math.abs(priceChange);
            } else if (shock.direction === 'down') {
              shockedPrice -= Math.abs(priceChange);
            } else {
              shockedPrice += priceChange * (Math.random() > 0.5 ? 1 : -1);
            }
            break;

          case 'volatility':
            volatilityMultiplier *= (1 + shock.shock / 100);
            break;

          case 'spread':
            // Widen spread - affects execution but for simplicity we adjust price
            const spreadImpact = shockedPrice * (shock.shock / 1000);
            shockedPrice -= spreadImpact; // Assume selling at bid
            break;
        }
      }

      // Calculate new unrealized PnL
      const direction = pos.side === 'long' ? 1 : -1;
      const newUnrealizedPnl = direction * pos.size * (shockedPrice - pos.entryPrice);

      return {
        ...pos,
        currentPrice: shockedPrice,
        unrealizedPnl: newUnrealizedPnl,
      };
    });
  }

  /**
   * Calculate portfolio value
   */
  private calculatePortfolioValue(positions: PortfolioPosition[]): number {
    return positions.reduce((sum, pos) => {
      return sum + pos.margin + pos.unrealizedPnl;
    }, 0);
  }

  /**
   * Calculate portfolio leverage
   */
  private calculateLeverage(positions: PortfolioPosition[]): number {
    const totalNotional = positions.reduce((sum, pos) => 
      sum + pos.size * pos.currentPrice, 0
    );
    const totalMargin = positions.reduce((sum, pos) => sum + pos.margin, 0);
    return totalMargin > 0 ? totalNotional / totalMargin : 0;
  }

  /**
   * Calculate max drawdown from stress
   */
  private calculateMaxDrawdown(
    original: PortfolioPosition[],
    stressed: PortfolioPosition[]
  ): number {
    const originalValue = this.calculatePortfolioValue(original);
    const stressedValue = this.calculatePortfolioValue(stressed);
    return originalValue > 0 
      ? Math.max(0, (originalValue - stressedValue) / originalValue * 100)
      : 0;
  }

  /**
   * Calculate breakeven shock percentage
   */
  private calculateBreakevenShock(positions: PortfolioPosition[]): number {
    if (positions.length === 0) return 0;

    const totalMargin = positions.reduce((sum, p) => sum + p.margin, 0);
    const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    // Simple approximation: find the price shock that would wipe out margin
    let totalExposure = 0;
    let weightedDirection = 0;

    for (const pos of positions) {
      const notional = pos.size * pos.currentPrice * pos.leverage;
      totalExposure += notional;
      weightedDirection += (pos.side === 'long' ? 1 : -1) * notional;
    }

    if (totalExposure === 0) return 0;

    // Breakeven shock = loss needed to wipe out margin / total exposure
    const lossNeeded = -(totalMargin + totalUnrealizedPnl);
    const breakeven = (lossNeeded / totalExposure) * 100;

    return Math.round(breakeven * 100) / 100;
  }

  /**
   * Run reverse stress test
   * Find scenarios that would cause a specific loss
   */
  runReverseStressTest(
    positions: PortfolioPosition[],
    targetLossPercent: number
  ): MarketShock[] {
    const portfolioValue = this.calculatePortfolioValue(positions);
    const targetLoss = portfolioValue * (targetLossPercent / 100);

    const shocks: MarketShock[] = [];
    
    // Calculate required price shock for each position
    for (const pos of positions) {
      const direction = pos.side === 'long' ? -1 : 1;
      const notional = pos.size * pos.currentPrice * pos.leverage;
      
      // Price shock needed to hit target loss
      const priceShockPercent = direction * (targetLoss / notional) * 100;
      
      shocks.push({
        type: 'price',
        symbol: pos.symbol,
        shock: Math.abs(priceShockPercent),
        direction: priceShockPercent > 0 ? 'up' : 'down',
      });
    }

    return shocks;
  }

  /**
   * Create custom scenario from shocks
   */
  createCustomScenario(
    name: string,
    description: string,
    shocks: MarketShock[],
    severity: StressScenario['severity'] = 'moderate'
  ): StressScenario {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const scenario: StressScenario = {
      id,
      name,
      description,
      type: 'custom',
      shocks,
      duration: 1,
      severity,
    };

    this.addScenario(scenario);
    return scenario;
  }

  /**
   * Generate summary report
   */
  generateSummaryReport(
    positions: PortfolioPosition[]
  ): {
    worstCase: StressTestResult;
    bestCase: StressTestResult;
    averageLoss: number;
    probabilityWeightedLoss: number;
    liquidationRiskScenarios: string[];
    marginCallScenarios: string[];
    recommendations: string[];
  } {
    const results = this.runAllStressTests(positions);

    if (results.length === 0) {
      throw new Error('No stress test results available');
    }

    const worstCase = results[0];
    const bestCase = results[results.length - 1];
    const averageLoss = results.reduce((sum, r) => sum + r.pnl, 0) / results.length;

    // Calculate probability-weighted loss
    let probabilityWeightedLoss = 0;
    let totalProbability = 0;

    for (const result of results) {
      const scenario = this.customScenarios.get(result.scenarioId);
      const probability = scenario?.probability || this.config.defaultProbability;
      probabilityWeightedLoss += result.pnl * probability;
      totalProbability += probability;
    }

    if (totalProbability > 0) {
      probabilityWeightedLoss /= totalProbability;
    }

    const liquidationRiskScenarios = results
      .filter(r => r.liquidationRisk)
      .map(r => r.scenarioName);

    const marginCallScenarios = results
      .filter(r => r.marginCall)
      .map(r => r.scenarioName);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      results,
      liquidationRiskScenarios,
      marginCallScenarios
    );

    return {
      worstCase,
      bestCase,
      averageLoss,
      probabilityWeightedLoss,
      liquidationRiskScenarios,
      marginCallScenarios,
      recommendations,
    };
  }

  /**
   * Generate risk recommendations
   */
  private generateRecommendations(
    results: StressTestResult[],
    liquidationScenarios: string[],
    marginCallScenarios: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (liquidationScenarios.length > 0) {
      recommendations.push(
        `CRITICAL: Reduce leverage to avoid liquidation in scenarios: ${liquidationScenarios.slice(0, 3).join(', ')}`
      );
    }

    if (marginCallScenarios.length > 0) {
      recommendations.push(
        `WARNING: Add margin buffer to withstand scenarios: ${marginCallScenarios.slice(0, 3).join(', ')}`
      );
    }

    const avgLeverage = results.reduce((sum, r) => sum + r.riskMetrics.leverageAfter, 0) / results.length;
    if (avgLeverage > 5) {
      recommendations.push('Consider reducing overall portfolio leverage below 5x');
    }

    const worstCaseLoss = results[0]?.pnlPercent || 0;
    if (worstCaseLoss < -50) {
      recommendations.push('Extreme tail risk detected. Review position sizing and risk limits.');
    }

    return recommendations;
  }

  /**
   * Get config
   */
  getConfig(): StressTestConfig {
    return { ...this.config };
  }
}

// Singleton
let instance: StressTestingEngine | null = null;

export function getStressTestingEngine(
  config?: Partial<StressTestConfig>
): StressTestingEngine {
  if (!instance) {
    instance = new StressTestingEngine(config);
  }
  return instance;
}

export default StressTestingEngine;
