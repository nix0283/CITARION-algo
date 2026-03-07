/**
 * RISK MANAGER
 *
 * Central risk management orchestrator combining:
 * - VaR Calculator
 * - Position Limiter
 * - Drawdown Monitor
 * - Kill Switch
 */

import { VaRCalculator, defaultVaRConfig } from './var-calculator';
import { PositionLimiter, defaultPositionLimits } from './position-limiter';
import { DrawdownMonitor, defaultDrawdownThresholds } from './drawdown-monitor';
import { KillSwitch, defaultKillSwitchConfig, type KillSwitchCallback } from './kill-switch';
import type {
  RiskManagerConfig,
  RiskReport,
  VaRResult,
  DrawdownMetrics,
  PositionRiskData,
  PortfolioData,
  PositionCheckResult,
  KillSwitchTrigger,
} from './types';

export class RiskManager {
  private config: RiskManagerConfig;
  private varCalculator: VaRCalculator;
  private positionLimiter: PositionLimiter;
  private drawdownMonitor: DrawdownMonitor;
  private killSwitch: KillSwitch;
  private returns: number[] = [];
  private lastReport: RiskReport | null = null;

  constructor(config: Partial<RiskManagerConfig> = {}) {
    this.config = {
      var: defaultVaRConfig,
      limits: defaultPositionLimits,
      drawdown: defaultDrawdownThresholds,
      killSwitch: defaultKillSwitchConfig,
      enableLogging: true,
      updateInterval: 60000,
      ...config,
    };

    this.varCalculator = new VaRCalculator(this.config.var);
    this.positionLimiter = new PositionLimiter(this.config.limits);
    this.drawdownMonitor = new DrawdownMonitor(this.config.drawdown);
    this.killSwitch = new KillSwitch(this.config.killSwitch);
  }

  /**
   * Initialize with starting equity
   */
  public initialize(equity: number): void {
    this.drawdownMonitor.reset(equity);
    this.killSwitch.arm();
    this.log('Risk manager initialized', { equity });
  }

  /**
   * Update risk state with new portfolio data
   */
  public update(portfolio: PortfolioData): RiskReport {
    // Update drawdown
    const drawdownMetrics = this.drawdownMonitor.update(portfolio.equity);

    // Calculate VaR if we have returns
    const varResult = this.varCalculator.calculate(this.returns, portfolio.equity);

    // Check kill switch conditions
    const triggerReason = this.killSwitch.checkConditions(
      drawdownMetrics.state.currentDrawdown,
      false, // VaR breach
      0, // Correlation
      portfolio.cash // Liquidity
    );

    // Build report
    this.lastReport = {
      timestamp: Date.now(),
      var: varResult,
      exposure: {
        total: this.calculateTotalExposure(portfolio.positions),
        bySymbol: this.mapToRecord(this.positionLimiter.calculateExposureBySymbol(portfolio.positions)),
        byExchange: this.mapToRecord(this.positionLimiter.calculateExposureByExchange(portfolio.positions)),
      },
      drawdown: drawdownMetrics,
      limits: {
        used: this.calculateTotalExposure(portfolio.positions),
        available: this.config.limits.maxTotalExposure,
        breaches: [],
      },
      killSwitch: this.killSwitch.getStatus(),
      riskScore: this.calculateRiskScore(varResult, drawdownMetrics, portfolio),
      recommendations: this.generateRecommendations(varResult, drawdownMetrics, portfolio),
    };

    return this.lastReport;
  }

  /**
   * Check if a position is allowed
   */
  public checkPosition(
    symbol: string,
    exchange: string,
    size: number,
    leverage: number,
    portfolio: PortfolioData
  ): PositionCheckResult {
    // Don't allow new positions if kill switch is triggered
    if (this.killSwitch.isTriggered()) {
      return {
        allowed: false,
        reason: 'Kill switch is active',
        exposureAfter: 0,
        riskLevel: 1,
      };
    }

    return this.positionLimiter.checkPosition(symbol, exchange, size, leverage, portfolio);
  }

  /**
   * Add equity point to returns history
   */
  public addEquityPoint(equity: number): void {
    if (this.returns.length > 0) {
      const lastEquity = equity / (1 + this.returns[this.returns.length - 1]);
      const returnVal = (equity - lastEquity) / lastEquity;
      this.returns.push(returnVal);
      
      // Keep last 252 days
      if (this.returns.length > 252) {
        this.returns.shift();
      }
    } else {
      this.returns.push(0);
    }
  }

  /**
   * Handle kill switch trigger
   */
  public async triggerKillSwitch(
    positions: PositionRiskData[],
    trigger: KillSwitchTrigger
  ): Promise<{ positionsClosed: number; pnlSaved: number }> {
    const drawdown = this.drawdownMonitor.getMetrics().state.currentDrawdown;
    const equity = this.drawdownMonitor.getMetrics().state.currentEquity;

    return this.killSwitch.trigger(trigger, positions, equity, drawdown);
  }

  /**
   * Register kill switch callback
   */
  public onKillSwitch(callback: KillSwitchCallback): void {
    this.killSwitch.onClose(callback);
  }

  /**
   * Get current risk report
   */
  public getReport(): RiskReport | null {
    return this.lastReport;
  }

  /**
   * Get drawdown metrics
   */
  public getDrawdown(): DrawdownMetrics {
    return this.drawdownMonitor.getMetrics();
  }

  /**
   * Get VaR calculation
   */
  public getVaR(): VaRResult | null {
    if (this.returns.length < 10) return null;
    return this.varCalculator.calculate(this.returns, 10000); // Placeholder
  }

  /**
   * Check if trading is allowed
   */
  public canTrade(): boolean {
    return !this.killSwitch.isTriggered() && this.killSwitch.isActive();
  }

  /**
   * Get risk score (0-100)
   */
  public getRiskScore(): number {
    return this.lastReport?.riskScore || 0;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private calculateTotalExposure(positions: PositionRiskData[]): number {
    return positions.reduce((sum, p) => sum + p.value, 0);
  }

  private calculateRiskScore(
    varResult: VaRResult,
    drawdownMetrics: DrawdownMetrics,
    portfolio: PortfolioData
  ): number {
    let score = 0;

    // VaR contribution (0-30 points)
    const varPct = varResult.riskPercentage;
    score += Math.min(varPct * 10, 30);

    // Drawdown contribution (0-40 points)
    score += drawdownMetrics.state.currentDrawdown * 200;

    // Exposure contribution (0-20 points)
    const exposurePct = portfolio.positions.reduce((sum, p) => sum + p.value, 0) / portfolio.equity;
    score += Math.min(exposurePct * 20, 20);

    // Daily PnL contribution (0-10 points)
    if (portfolio.dailyPnL < 0) {
      score += Math.min(Math.abs(portfolio.dailyPnL) / portfolio.equity * 100, 10);
    }

    return Math.min(Math.round(score), 100);
  }

  private generateRecommendations(
    varResult: VaRResult,
    drawdownMetrics: DrawdownMetrics,
    portfolio: PortfolioData
  ): string[] {
    const recommendations: string[] = [];

    if (drawdownMetrics.state.level === 'warning') {
      recommendations.push('Consider reducing position sizes due to elevated drawdown');
    }

    if (drawdownMetrics.state.level === 'critical') {
      recommendations.push('URGENT: Reduce exposure immediately');
    }

    if (varResult.riskPercentage > 5) {
      recommendations.push('VaR exceeds 5% - review position sizes');
    }

    const exposurePct = portfolio.positions.reduce((sum, p) => sum + p.value, 0) / portfolio.equity;
    if (exposurePct > 0.8) {
      recommendations.push('High exposure - consider diversifying');
    }

    if (portfolio.dailyPnL / portfolio.equity < -0.05) {
      recommendations.push('Daily loss exceeds 5% - consider pausing trading');
    }

    if (recommendations.length === 0) {
      recommendations.push('Risk levels within acceptable parameters');
    }

    return recommendations;
  }

  private mapToRecord(map: Map<string, number>): Record<string, number> {
    const record: Record<string, number> = {};
    for (const [key, value] of map) {
      record[key] = value;
    }
    return record;
  }

  private log(message: string, data?: Record<string, unknown>): void {
    if (this.config.enableLogging) {
      console.log(`[RiskManager] ${message}`, data || '');
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<RiskManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.varCalculator.updateConfig(this.config.var);
    this.positionLimiter.updateLimits(this.config.limits);
    this.drawdownMonitor.updateThresholds(this.config.drawdown);
    this.killSwitch.updateConfig(this.config.killSwitch);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const defaultRiskManagerConfig: RiskManagerConfig = {
  var: defaultVaRConfig,
  limits: defaultPositionLimits,
  drawdown: defaultDrawdownThresholds,
  killSwitch: defaultKillSwitchConfig,
  enableLogging: true,
  updateInterval: 60000,
};

export function createRiskManager(config?: Partial<RiskManagerConfig>): RiskManager {
  return new RiskManager(config);
}
