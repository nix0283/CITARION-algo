/**
 * Stress Testing Engine
 *
 * Test strategies under extreme market conditions:
 * - 6 predefined scenarios
 * - Monte Carlo simulation
 * - VaR and Expected Shortfall
 * - Margin call / liquidation tracking
 *
 * @module lib/analytics/stress
 */

import type { Candle, TrendSignal } from '@/lib/orion-bot/types';

// ==================== TYPES ====================

export interface StressScenario {
  id: string;
  name: string;
  type: 'CRASH' | 'FLASH_CRASH' | 'HIGH_VOLATILITY' | 'LIQUIDITY_CRISIS' | 'BLACK_SWAN';
  severity: 'MODERATE' | 'SEVERE' | 'EXTREME';
  parameters: {
    priceDropPercent: number;
    volatilityIncrease: number;
    volumeDecrease: number;
    spreadIncrease: number;
    correlationChange: number;
    durationHours: number;
  };
}

export interface StressTestResult {
  scenarioId: string;
  scenarioName: string;
  initialEquity: number;
  finalEquity: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  liquidations: number;
  marginCalls: number;
  survivalRate: number;
  recoveryTime: number;
  passed: boolean;
  riskMetrics: {
    var95: number;
    var99: number;
    expectedShortfall: number;
  };
  recommendations: string[];
}

export interface MonteCarloResult {
  simulations: number;
  confidenceIntervals: {
    90: { lower: number; upper: number };
    95: { lower: number; upper: number };
    99: { lower: number; upper: number };
  };
  probabilityOfRuin: number;
  expectedReturn: number;
  expectedMaxDrawdown: number;
}

// ==================== PREDEFINED SCENARIOS ====================

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'moderate_correction',
    name: 'Moderate Market Correction',
    type: 'CRASH',
    severity: 'MODERATE',
    parameters: {
      priceDropPercent: 10,
      volatilityIncrease: 1.5,
      volumeDecrease: 0.2,
      spreadIncrease: 2,
      correlationChange: 0.1,
      durationHours: 48,
    },
  },
  {
    id: 'severe_crash',
    name: 'Severe Market Crash',
    type: 'CRASH',
    severity: 'SEVERE',
    parameters: {
      priceDropPercent: 30,
      volatilityIncrease: 3,
      volumeDecrease: 0.5,
      spreadIncrease: 5,
      correlationChange: 0.3,
      durationHours: 168,
    },
  },
  {
    id: 'flash_crash',
    name: 'Flash Crash',
    type: 'FLASH_CRASH',
    severity: 'SEVERE',
    parameters: {
      priceDropPercent: 20,
      volatilityIncrease: 5,
      volumeDecrease: 0.8,
      spreadIncrease: 10,
      correlationChange: 0.5,
      durationHours: 1,
    },
  },
  {
    id: 'high_volatility',
    name: 'High Volatility Period',
    type: 'HIGH_VOLATILITY',
    severity: 'MODERATE',
    parameters: {
      priceDropPercent: 5,
      volatilityIncrease: 4,
      volumeDecrease: 0,
      spreadIncrease: 3,
      correlationChange: 0.2,
      durationHours: 72,
    },
  },
  {
    id: 'liquidity_crisis',
    name: 'Liquidity Crisis',
    type: 'LIQUIDITY_CRISIS',
    severity: 'SEVERE',
    parameters: {
      priceDropPercent: 15,
      volatilityIncrease: 2,
      volumeDecrease: 0.9,
      spreadIncrease: 20,
      correlationChange: 0.4,
      durationHours: 120,
    },
  },
  {
    id: 'black_swan',
    name: 'Black Swan Event',
    type: 'BLACK_SWAN',
    severity: 'EXTREME',
    parameters: {
      priceDropPercent: 50,
      volatilityIncrease: 10,
      volumeDecrease: 0.95,
      spreadIncrease: 50,
      correlationChange: 0.8,
      durationHours: 720,
    },
  },
];

// ==================== STRESS TEST ENGINE ====================

export class StressTestEngine {
  /**
   * Run stress test for a position/strategy
   */
  async runStressTest(params: {
    scenario: StressScenario;
    initialEquity: number;
    positions: Array<{
      symbol: string;
      quantity: number;
      entryPrice: number;
      direction: 'LONG' | 'SHORT';
      leverage: number;
    }>;
    baseVolatility: number;
    basePrice: number;
  }): Promise<StressTestResult> {
    const { scenario, initialEquity, positions, baseVolatility, basePrice } = params;

    // Simulate price path
    const pricePath = this.simulatePricePath(basePrice, baseVolatility, scenario);

    // Track equity through scenario
    const equityPath: number[] = [];
    let currentEquity = initialEquity;
    let maxDrawdown = 0;
    let peakEquity = initialEquity;
    let liquidations = 0;
    let marginCalls = 0;
    const returns: number[] = [];

    for (let hour = 0; hour < scenario.parameters.durationHours; hour++) {
      const price = pricePath[hour];

      // Calculate portfolio value
      let portfolioValue = 0;
      for (const pos of positions) {
        const priceChange = (price - pos.entryPrice) / pos.entryPrice;
        const pnl = pos.direction === 'LONG' ? priceChange : -priceChange;
        const leveragedPnl = pnl * pos.leverage * pos.quantity * pos.entryPrice;
        portfolioValue += leveragedPnl;
      }

      currentEquity = initialEquity + portfolioValue;
      equityPath.push(currentEquity);

      // Track drawdown
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const drawdown = (peakEquity - currentEquity) / peakEquity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Calculate returns for VaR
      if (hour > 0) {
        returns.push((equityPath[hour] - equityPath[hour - 1]) / equityPath[hour - 1]);
      }

      // Check margin call / liquidation
      const maintenanceMargin = positions.reduce((sum, pos) => {
        return sum + (pos.quantity * pos.entryPrice * price) / pos.leverage;
      }, 0);

      if (currentEquity < maintenanceMargin * 1.2) marginCalls++;
      if (currentEquity < maintenanceMargin) liquidations++;
    }

    const finalEquity = equityPath[equityPath.length - 1];
    const survivalRate = finalEquity > 0 ? 1 : 0;

    // Calculate risk metrics
    const var95 = this.calculateVaR(returns, 0.95);
    const var99 = this.calculateVaR(returns, 0.99);
    const expectedShortfall = this.calculateExpectedShortfall(returns, 0.95);

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      maxDrawdown,
      liquidations,
      marginCalls,
      survivalRate,
      var95,
    });

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      initialEquity,
      finalEquity,
      maxDrawdown,
      maxDrawdownDuration: 0,
      liquidations,
      marginCalls,
      survivalRate,
      recoveryTime: -1,
      passed: survivalRate > 0 && maxDrawdown < 0.5,
      riskMetrics: { var95, var99, expectedShortfall },
      recommendations,
    };
  }

  /**
   * Run Monte Carlo simulation
   */
  runMonteCarlo(params: {
    initialEquity: number;
    simulations: number;
    timeHorizonDays: number;
    strategy: {
      winRate: number;
      avgWin: number;
      avgLoss: number;
      positionSize: number;
    };
  }): MonteCarloResult {
    const { initialEquity, simulations, timeHorizonDays, strategy } = params;
    const finalEquities: number[] = [];
    const maxDrawdowns: number[] = [];

    for (let sim = 0; sim < simulations; sim++) {
      let equity = initialEquity;
      let peakEquity = initialEquity;
      let maxDrawdown = 0;

      for (let day = 0; day < timeHorizonDays; day++) {
        const isWin = Math.random() < strategy.winRate;
        const pnlPercent = isWin ? strategy.avgWin : -strategy.avgLoss;
        equity += equity * strategy.positionSize * pnlPercent;

        if (equity > peakEquity) peakEquity = equity;
        const drawdown = (peakEquity - equity) / peakEquity;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        if (equity <= 0) break;
      }

      finalEquities.push(equity);
      maxDrawdowns.push(maxDrawdown);
    }

    finalEquities.sort((a, b) => a - b);

    const probabilityOfRuin = finalEquities.filter(e => e <= 0).length / simulations;
    const expectedReturn = finalEquities.reduce((a, b) => a + b, 0) / simulations;
    const expectedMaxDrawdown = maxDrawdowns.reduce((a, b) => a + b, 0) / simulations;

    return {
      simulations,
      confidenceIntervals: {
        90: {
          lower: finalEquities[Math.floor(simulations * 0.05)],
          upper: finalEquities[Math.floor(simulations * 0.95)],
        },
        95: {
          lower: finalEquities[Math.floor(simulations * 0.025)],
          upper: finalEquities[Math.floor(simulations * 0.975)],
        },
        99: {
          lower: finalEquities[Math.floor(simulations * 0.005)],
          upper: finalEquities[Math.floor(simulations * 0.995)],
        },
      },
      probabilityOfRuin,
      expectedReturn,
      expectedMaxDrawdown,
    };
  }

  // ==================== PRIVATE METHODS ====================

  private simulatePricePath(
    basePrice: number,
    baseVolatility: number,
    scenario: StressScenario
  ): number[] {
    const path: number[] = [];
    let price = basePrice;
    const { parameters } = scenario;

    for (let hour = 0; hour < parameters.durationHours; hour++) {
      const volatility = baseVolatility * parameters.volatilityIncrease;
      const randomShock = (Math.random() - 0.5) * volatility * 2;
      const crashBias = parameters.priceDropPercent / parameters.durationHours / 100;

      price *= 1 + randomShock - crashBias;
      path.push(price);
    }

    return path;
  }

  private calculateVaR(returns: number[], confidence: number): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor(returns.length * (1 - confidence));
    return Math.abs(sorted[index] || 0);
  }

  private calculateExpectedShortfall(returns: number[], confidence: number): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor(returns.length * (1 - confidence));
    const tailReturns = sorted.slice(0, index);
    if (tailReturns.length === 0) return 0;
    return Math.abs(tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length);
  }

  private generateRecommendations(results: {
    maxDrawdown: number;
    liquidations: number;
    marginCalls: number;
    survivalRate: number;
    var95: number;
  }): string[] {
    const recommendations: string[] = [];

    if (results.maxDrawdown > 0.5) {
      recommendations.push('Reduce leverage - drawdown exceeded 50%');
    }
    if (results.liquidations > 0) {
      recommendations.push('CRITICAL: Liquidations occurred - significantly reduce position sizes');
    }
    if (results.marginCalls > 2) {
      recommendations.push('Frequent margin calls - increase margin buffer');
    }
    if (results.survivalRate < 1) {
      recommendations.push('Strategy did not survive scenario - review risk parameters');
    }
    if (results.var95 > 0.1) {
      recommendations.push('High VaR - consider hedging strategies');
    }
    if (recommendations.length === 0) {
      recommendations.push('Strategy passed stress test - parameters appear robust');
    }

    return recommendations;
  }
}

// ==================== SINGLETON ====================

let engineInstance: StressTestEngine | null = null;

export function getStressTestEngine(): StressTestEngine {
  if (!engineInstance) {
    engineInstance = new StressTestEngine();
  }
  return engineInstance;
}

export default {
  StressTestEngine,
  getStressTestEngine,
  STRESS_SCENARIOS,
};
