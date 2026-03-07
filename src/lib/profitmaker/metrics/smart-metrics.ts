/**
 * Smart Metrics Engine
 * 
 * Based on Profitmaker's Smart Metrics Engine roadmap ideas.
 * Provides comprehensive trading metrics and analytics.
 */

// ==================== Types ====================

export interface TradingMetrics {
  // Returns
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  dailyReturns: number[];
  monthlyReturns: MonthlyReturn[];
  
  // Risk
  volatility: number;
  variance: number;
  standardDeviation: number;
  downsideDeviation: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  maxDrawdownDuration: number;
  averageDrawdown: number;
  
  // Risk-Adjusted
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  treynorRatio: number;
  informationRatio: number;
  
  // Trade Statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  avgTrade: number;
  largestWin: number;
  largestLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  
  // Profitability
  profitFactor: number;
  riskRewardRatio: number;
  expectancy: number;
  kellyPercentage: number;
  
  // Efficiency
  avgHoldingTime: number;
  tradesPerDay: number;
  profitPerTrade: number;
  profitPerHour: number;
  
  // Risk Metrics
  valueAtRisk95: number;
  conditionalVaR95: number;
  beta: number;
  alpha: number;
}

export interface MonthlyReturn {
  month: string;
  return: number;
  trades: number;
  winRate: number;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  amount: number;
  pnl: number;
  pnlPercent: number;
  entryTime: number;
  exitTime: number;
  fees: number;
  tags?: string[];
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  cash: number;
  positionValue: number;
  drawdown: number;
  drawdownPercent: number;
}

export interface MetricsConfig {
  riskFreeRate: number;
  benchmarkReturn: number;
  periodsPerYear: number;
  confidenceLevel: number;
}

// ==================== Smart Metrics Engine ====================

/**
 * Comprehensive metrics calculation engine
 */
export class SmartMetricsEngine {
  private defaultConfig: MetricsConfig = {
    riskFreeRate: 0.02, // 2% annual
    benchmarkReturn: 0.08, // 8% annual (S&P500 average)
    periodsPerYear: 252, // Trading days
    confidenceLevel: 0.95,
  };

  /**
   * Calculate all metrics from trade history
   */
  calculateMetrics(
    trades: TradeRecord[],
    equityCurve: EquityPoint[],
    config: Partial<MetricsConfig> = {}
  ): TradingMetrics {
    const cfg = { ...this.defaultConfig, ...config };
    
    return {
      // Returns
      totalReturn: this.calculateTotalReturn(equityCurve),
      totalReturnPercent: this.calculateTotalReturnPercent(equityCurve),
      annualizedReturn: this.calculateAnnualizedReturn(equityCurve, cfg.periodsPerYear),
      dailyReturns: this.calculateDailyReturns(equityCurve),
      monthlyReturns: this.calculateMonthlyReturns(trades),
      
      // Risk
      volatility: this.calculateVolatility(equityCurve, cfg.periodsPerYear),
      variance: this.calculateVariance(equityCurve),
      standardDeviation: this.calculateStandardDeviation(equityCurve),
      downsideDeviation: this.calculateDownsideDeviation(equityCurve, cfg.riskFreeRate),
      maxDrawdown: this.calculateMaxDrawdown(equityCurve),
      maxDrawdownPercent: this.calculateMaxDrawdownPercent(equityCurve),
      maxDrawdownDuration: this.calculateMaxDrawdownDuration(equityCurve),
      averageDrawdown: this.calculateAverageDrawdown(equityCurve),
      
      // Risk-Adjusted
      sharpeRatio: this.calculateSharpeRatio(equityCurve, cfg.riskFreeRate, cfg.periodsPerYear),
      sortinoRatio: this.calculateSortinoRatio(equityCurve, cfg.riskFreeRate, cfg.periodsPerYear),
      calmarRatio: this.calculateCalmarRatio(equityCurve, cfg.periodsPerYear),
      treynorRatio: this.calculateTreynorRatio(trades, cfg.riskFreeRate),
      informationRatio: this.calculateInformationRatio(equityCurve, cfg.benchmarkReturn, cfg.periodsPerYear),
      
      // Trade Statistics
      totalTrades: trades.length,
      winningTrades: trades.filter(t => t.pnl > 0).length,
      losingTrades: trades.filter(t => t.pnl <= 0).length,
      winRate: this.calculateWinRate(trades),
      avgWin: this.calculateAverageWin(trades),
      avgLoss: this.calculateAverageLoss(trades),
      avgTrade: this.calculateAverageTrade(trades),
      largestWin: this.calculateLargestWin(trades),
      largestLoss: this.calculateLargestLoss(trades),
      maxConsecutiveWins: this.calculateMaxConsecutiveWins(trades),
      maxConsecutiveLosses: this.calculateMaxConsecutiveLosses(trades),
      
      // Profitability
      profitFactor: this.calculateProfitFactor(trades),
      riskRewardRatio: this.calculateRiskRewardRatio(trades),
      expectancy: this.calculateExpectancy(trades),
      kellyPercentage: this.calculateKellyPercentage(trades),
      
      // Efficiency
      avgHoldingTime: this.calculateAverageHoldingTime(trades),
      tradesPerDay: this.calculateTradesPerDay(trades),
      profitPerTrade: this.calculateProfitPerTrade(trades),
      profitPerHour: this.calculateProfitPerHour(trades),
      
      // Risk Metrics
      valueAtRisk95: this.calculateVaR(equityCurve, cfg.confidenceLevel),
      conditionalVaR95: this.calculateCVaR(equityCurve, cfg.confidenceLevel),
      beta: this.calculateBeta(equityCurve, cfg.benchmarkReturn),
      alpha: this.calculateAlpha(equityCurve, cfg.benchmarkReturn, cfg.riskFreeRate),
    };
  }

  /**
   * Calculate metrics summary
   */
  calculateSummary(trades: TradeRecord[], equityCurve: EquityPoint[]): {
    performance: string;
    risk: string;
    efficiency: string;
    grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    recommendations: string[];
  } {
    const metrics = this.calculateMetrics(trades, equityCurve);
    
    const performance = `Return: ${metrics.totalReturnPercent.toFixed(2)}% | Win Rate: ${metrics.winRate.toFixed(1)}% | Sharpe: ${metrics.sharpeRatio.toFixed(2)}`;
    const risk = `Max DD: ${metrics.maxDrawdownPercent.toFixed(2)}% | Volatility: ${(metrics.volatility * 100).toFixed(2)}% | VaR: ${metrics.valueAtRisk95.toFixed(2)}`;
    const efficiency = `Trades: ${metrics.totalTrades} | Profit/Trade: ${metrics.profitPerTrade.toFixed(2)} | Kelly: ${metrics.kellyPercentage.toFixed(1)}%`;
    
    // Calculate grade
    const grade = this.calculateGrade(metrics);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics);
    
    return { performance, risk, efficiency, grade, recommendations };
  }

  // ==================== Return Calculations ====================

  private calculateTotalReturn(equityCurve: EquityPoint[]): number {
    if (equityCurve.length < 2) return 0;
    return equityCurve[equityCurve.length - 1].equity - equityCurve[0].equity;
  }

  private calculateTotalReturnPercent(equityCurve: EquityPoint[]): number {
    if (equityCurve.length < 2) return 0;
    const start = equityCurve[0].equity;
    const end = equityCurve[equityCurve.length - 1].equity;
    return start > 0 ? ((end - start) / start) * 100 : 0;
  }

  private calculateAnnualizedReturn(equityCurve: EquityPoint[], periodsPerYear: number): number {
    if (equityCurve.length < 2) return 0;
    
    const start = equityCurve[0].equity;
    const end = equityCurve[equityCurve.length - 1].equity;
    const periods = equityCurve.length;
    
    if (start <= 0) return 0;
    
    // CAGR formula
    return Math.pow(end / start, periodsPerYear / periods) - 1;
  }

  private calculateDailyReturns(equityCurve: EquityPoint[]): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = equityCurve[i - 1].equity;
      const curr = equityCurve[i].equity;
      
      if (prev > 0) {
        returns.push((curr - prev) / prev);
      }
    }
    
    return returns;
  }

  private calculateMonthlyReturns(trades: TradeRecord[]): MonthlyReturn[] {
    const monthlyData: Record<string, { pnl: number; count: number; wins: number }> = {};
    
    for (const trade of trades) {
      const month = new Date(trade.exitTime).toISOString().slice(0, 7); // YYYY-MM
      
      if (!monthlyData[month]) {
        monthlyData[month] = { pnl: 0, count: 0, wins: 0 };
      }
      
      monthlyData[month].pnl += trade.pnl;
      monthlyData[month].count++;
      if (trade.pnl > 0) monthlyData[month].wins++;
    }
    
    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        return: data.pnl,
        trades: data.count,
        winRate: (data.wins / data.count) * 100,
      }));
  }

  // ==================== Risk Calculations ====================

  private calculateVolatility(equityCurve: EquityPoint[], periodsPerYear: number): number {
    const returns = this.calculateDailyReturns(equityCurve);
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    
    return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
  }

  private calculateVariance(equityCurve: EquityPoint[]): number {
    const returns = this.calculateDailyReturns(equityCurve);
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    return returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  }

  private calculateStandardDeviation(equityCurve: EquityPoint[]): number {
    return Math.sqrt(this.calculateVariance(equityCurve));
  }

  private calculateDownsideDeviation(equityCurve: EquityPoint[], riskFreeRate: number): number {
    const returns = this.calculateDailyReturns(equityCurve);
    const dailyRiskFree = Math.pow(1 + riskFreeRate, 1 / 252) - 1;
    
    const downside = returns
      .filter(r => r < dailyRiskFree)
      .map(r => Math.pow(r - dailyRiskFree, 2));
    
    if (downside.length === 0) return 0;
    
    return Math.sqrt(downside.reduce((a, b) => a + b, 0) / downside.length);
  }

  private calculateMaxDrawdown(equityCurve: EquityPoint[]): number {
    let maxDrawdown = 0;
    let peak = 0;
    
    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      
      const drawdown = peak - point.equity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }

  private calculateMaxDrawdownPercent(equityCurve: EquityPoint[]): number {
    let maxDrawdownPercent = 0;
    let peak = 0;
    
    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      
      if (peak > 0) {
        const drawdownPercent = ((peak - point.equity) / peak) * 100;
        if (drawdownPercent > maxDrawdownPercent) {
          maxDrawdownPercent = drawdownPercent;
        }
      }
    }
    
    return maxDrawdownPercent;
  }

  private calculateMaxDrawdownDuration(equityCurve: EquityPoint[]): number {
    let maxDuration = 0;
    let currentDuration = 0;
    let peak = 0;
    let inDrawdown = false;
    
    for (const point of equityCurve) {
      if (point.equity >= peak) {
        peak = point.equity;
        if (inDrawdown) {
          maxDuration = Math.max(maxDuration, currentDuration);
          currentDuration = 0;
          inDrawdown = false;
        }
      } else {
        inDrawdown = true;
        currentDuration++;
      }
    }
    
    return maxDuration;
  }

  private calculateAverageDrawdown(equityCurve: EquityPoint[]): number {
    const drawdowns = equityCurve
      .filter(p => p.drawdownPercent > 0)
      .map(p => p.drawdownPercent);
    
    if (drawdowns.length === 0) return 0;
    return drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length;
  }

  // ==================== Risk-Adjusted Calculations ====================

  private calculateSharpeRatio(
    equityCurve: EquityPoint[],
    riskFreeRate: number,
    periodsPerYear: number
  ): number {
    const returns = this.calculateDailyReturns(equityCurve);
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = this.calculateStandardDeviation(equityCurve);
    
    if (std === 0) return 0;
    
    const dailyRiskFree = Math.pow(1 + riskFreeRate, 1 / periodsPerYear) - 1;
    const excessReturn = mean - dailyRiskFree;
    
    return (excessReturn / std) * Math.sqrt(periodsPerYear);
  }

  private calculateSortinoRatio(
    equityCurve: EquityPoint[],
    riskFreeRate: number,
    periodsPerYear: number
  ): number {
    const returns = this.calculateDailyReturns(equityCurve);
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downside = this.calculateDownsideDeviation(equityCurve, riskFreeRate);
    
    if (downside === 0) return 0;
    
    const dailyRiskFree = Math.pow(1 + riskFreeRate, 1 / periodsPerYear) - 1;
    const excessReturn = mean - dailyRiskFree;
    
    return (excessReturn / downside) * Math.sqrt(periodsPerYear);
  }

  private calculateCalmarRatio(equityCurve: EquityPoint[], periodsPerYear: number): number {
    const maxDD = this.calculateMaxDrawdownPercent(equityCurve);
    if (maxDD === 0) return 0;
    
    const annualized = this.calculateAnnualizedReturn(equityCurve, periodsPerYear);
    return (annualized * 100) / maxDD;
  }

  private calculateTreynorRatio(trades: TradeRecord[], riskFreeRate: number): number {
    // Simplified Treynor - would need market data for proper calculation
    const pnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    return pnl - riskFreeRate;
  }

  private calculateInformationRatio(
    equityCurve: EquityPoint[],
    benchmarkReturn: number,
    periodsPerYear: number
  ): number {
    const annualized = this.calculateAnnualizedReturn(equityCurve, periodsPerYear);
    const volatility = this.calculateVolatility(equityCurve, periodsPerYear);
    
    if (volatility === 0) return 0;
    
    return (annualized - benchmarkReturn) / volatility;
  }

  // ==================== Trade Statistics ====================

  private calculateWinRate(trades: TradeRecord[]): number {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => t.pnl > 0).length;
    return (wins / trades.length) * 100;
  }

  private calculateAverageWin(trades: TradeRecord[]): number {
    const wins = trades.filter(t => t.pnl > 0);
    if (wins.length === 0) return 0;
    return wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length;
  }

  private calculateAverageLoss(trades: TradeRecord[]): number {
    const losses = trades.filter(t => t.pnl < 0);
    if (losses.length === 0) return 0;
    return losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length;
  }

  private calculateAverageTrade(trades: TradeRecord[]): number {
    if (trades.length === 0) return 0;
    return trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length;
  }

  private calculateLargestWin(trades: TradeRecord[]): number {
    if (trades.length === 0) return 0;
    return Math.max(...trades.map(t => t.pnl));
  }

  private calculateLargestLoss(trades: TradeRecord[]): number {
    if (trades.length === 0) return 0;
    return Math.min(...trades.map(t => t.pnl));
  }

  private calculateMaxConsecutiveWins(trades: TradeRecord[]): number {
    let max = 0;
    let current = 0;
    
    for (const trade of trades) {
      if (trade.pnl > 0) {
        current++;
        max = Math.max(max, current);
      } else {
        current = 0;
      }
    }
    
    return max;
  }

  private calculateMaxConsecutiveLosses(trades: TradeRecord[]): number {
    let max = 0;
    let current = 0;
    
    for (const trade of trades) {
      if (trade.pnl <= 0) {
        current++;
        max = Math.max(max, current);
      } else {
        current = 0;
      }
    }
    
    return max;
  }

  // ==================== Profitability Calculations ====================

  private calculateProfitFactor(trades: TradeRecord[]): number {
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    
    if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
    return grossProfit / grossLoss;
  }

  private calculateRiskRewardRatio(trades: TradeRecord[]): number {
    const avgWin = this.calculateAverageWin(trades);
    const avgLoss = Math.abs(this.calculateAverageLoss(trades));
    
    if (avgLoss === 0) return avgWin > 0 ? Infinity : 0;
    return avgWin / avgLoss;
  }

  private calculateExpectancy(trades: TradeRecord[]): number {
    const winRate = this.calculateWinRate(trades) / 100;
    const avgWin = this.calculateAverageWin(trades);
    const avgLoss = Math.abs(this.calculateAverageLoss(trades));
    
    return (winRate * avgWin) - ((1 - winRate) * avgLoss);
  }

  private calculateKellyPercentage(trades: TradeRecord[]): number {
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    
    if (wins.length === 0 || losses.length === 0) return 0;
    
    const winRate = wins.length / trades.length;
    const avgWin = wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length);
    
    if (avgLoss === 0) return 0;
    
    // Kelly formula: K% = W - (1-W)/R
    // Where W = win rate, R = win/loss ratio
    const winLossRatio = avgWin / avgLoss;
    return (winRate - (1 - winRate) / winLossRatio) * 100;
  }

  // ==================== Efficiency Calculations ====================

  private calculateAverageHoldingTime(trades: TradeRecord[]): number {
    if (trades.length === 0) return 0;
    
    const totalMs = trades.reduce((sum, t) => sum + (t.exitTime - t.entryTime), 0);
    return totalMs / trades.length / (1000 * 60 * 60); // Convert to hours
  }

  private calculateTradesPerDay(trades: TradeRecord[]): number {
    if (trades.length < 2) return trades.length;
    
    const firstTrade = Math.min(...trades.map(t => t.entryTime));
    const lastTrade = Math.max(...trades.map(t => t.exitTime));
    const days = (lastTrade - firstTrade) / (1000 * 60 * 60 * 24);
    
    return days > 0 ? trades.length / days : trades.length;
  }

  private calculateProfitPerTrade(trades: TradeRecord[]): number {
    if (trades.length === 0) return 0;
    return trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length;
  }

  private calculateProfitPerHour(trades: TradeRecord[]): number {
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalHours = trades.reduce((sum, t) => sum + (t.exitTime - t.entryTime), 0) / (1000 * 60 * 60);
    
    return totalHours > 0 ? totalPnl / totalHours : 0;
  }

  // ==================== Risk Metrics ====================

  private calculateVaR(equityCurve: EquityPoint[], confidence: number): number {
    const returns = this.calculateDailyReturns(equityCurve);
    if (returns.length < 10) return 0;
    
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    
    return Math.abs(sorted[index] || 0);
  }

  private calculateCVaR(equityCurve: EquityPoint[], confidence: number): number {
    const returns = this.calculateDailyReturns(equityCurve);
    if (returns.length < 10) return 0;
    
    const sorted = [...returns].sort((a, b) => a - b);
    const cutoff = Math.floor((1 - confidence) * sorted.length);
    
    const tailReturns = sorted.slice(0, cutoff + 1);
    if (tailReturns.length === 0) return 0;
    
    return Math.abs(tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length);
  }

  private calculateBeta(equityCurve: EquityPoint[], benchmarkReturn: number): number {
    // Simplified beta calculation
    const volatility = this.calculateVolatility(equityCurve, 252);
    const benchmarkVolatility = Math.sqrt(benchmarkReturn); // Approximate
    
    if (benchmarkVolatility === 0) return 0;
    return volatility / benchmarkVolatility;
  }

  private calculateAlpha(
    equityCurve: EquityPoint[],
    benchmarkReturn: number,
    riskFreeRate: number
  ): number {
    const annualized = this.calculateAnnualizedReturn(equityCurve, 252);
    const beta = this.calculateBeta(equityCurve, benchmarkReturn);
    
    // Jensen's Alpha: Rp - [Rf + β(Rm - Rf)]
    return annualized - (riskFreeRate + beta * (benchmarkReturn - riskFreeRate));
  }

  // ==================== Helper Methods ====================

  private calculateGrade(metrics: TradingMetrics): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    let score = 0;
    
    // Win rate (0-25 points)
    score += Math.min(25, metrics.winRate / 4);
    
    // Sharpe ratio (0-25 points)
    if (metrics.sharpeRatio > 3) score += 25;
    else if (metrics.sharpeRatio > 2) score += 20;
    else if (metrics.sharpeRatio > 1) score += 15;
    else if (metrics.sharpeRatio > 0.5) score += 10;
    
    // Profit factor (0-20 points)
    if (metrics.profitFactor > 2) score += 20;
    else if (metrics.profitFactor > 1.5) score += 15;
    else if (metrics.profitFactor > 1.2) score += 10;
    
    // Max drawdown (0-15 points) - lower is better
    if (metrics.maxDrawdownPercent < 10) score += 15;
    else if (metrics.maxDrawdownPercent < 20) score += 10;
    else if (metrics.maxDrawdownPercent < 30) score += 5;
    
    // Total return (0-15 points)
    if (metrics.totalReturnPercent > 50) score += 15;
    else if (metrics.totalReturnPercent > 25) score += 10;
    else if (metrics.totalReturnPercent > 10) score += 5;
    
    if (score >= 90) return 'A+';
    if (score >= 75) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    if (score >= 20) return 'D';
    return 'F';
  }

  private generateRecommendations(metrics: TradingMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.winRate < 50) {
      recommendations.push('Consider improving entry signal accuracy - win rate below 50%');
    }
    
    if (metrics.sharpeRatio < 1) {
      recommendations.push('Risk-adjusted returns are low - review position sizing');
    }
    
    if (metrics.maxDrawdownPercent > 25) {
      recommendations.push('High drawdown detected - implement stricter risk management');
    }
    
    if (metrics.profitFactor < 1.5) {
      recommendations.push('Profit factor is low - consider larger profit targets or smaller stops');
    }
    
    if (metrics.kellyPercentage > 25) {
      recommendations.push('Kelly percentage suggests aggressive sizing - consider using half-Kelly');
    }
    
    if (metrics.avgHoldingTime < 1) {
      recommendations.push('Very short holding times - consider longer-term strategies for lower fees');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Performance metrics are healthy - continue monitoring');
    }
    
    return recommendations;
  }
}

// ==================== Exports ====================

export const smartMetricsEngine = new SmartMetricsEngine();
