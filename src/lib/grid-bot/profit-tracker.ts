/**
 * Grid Bot Profit Tracker - Production Ready
 * 
 * Comprehensive performance tracking for grid trading:
 * - Per-level profit tracking
 * - Performance metrics (Sharpe, Sortino, Calmar, Sterling)
 * - Win rate and profit factor calculation
 * - Grid efficiency metrics
 * - Performance snapshots and history
 */

import { EventEmitter } from 'events';
import {
  GridLevelProfit,
  GridProfitStats,
  PerformanceMetrics,
  PerformanceSnapshot,
  GridTrade,
} from './types';

// ==================== PROFIT TRACKER CLASS ====================

export class GridProfitTracker extends EventEmitter {
  private profitHistory: GridLevelProfit[] = [];
  private trades: GridTrade[] = [];
  private snapshots: PerformanceSnapshot[] = [];
  private equityCurve: number[] = [];
  private returnsHistory: number[] = [];
  private startEquity: number;
  private currentEquity: number;
  private peakEquity: number;
  private valleyEquity: number;

  constructor(initialEquity: number = 10000) {
    super();
    this.startEquity = initialEquity;
    this.currentEquity = initialEquity;
    this.peakEquity = initialEquity;
    this.valleyEquity = initialEquity;
    this.equityCurve = [initialEquity];
  }

  // ==================== RECORD KEEPING ====================

  /**
   * Record completed grid level
   */
  recordCompletedLevel(
    level: number,
    buyPrice: number,
    sellPrice: number,
    buyAmount: number,
    sellAmount: number,
    buyTime: Date
  ): GridLevelProfit {
    const profit = (sellPrice - buyPrice) * Math.min(buyAmount, sellAmount);
    const profitPercent = ((sellPrice - buyPrice) / buyPrice) * 100;
    const completedAt = new Date();
    const duration = completedAt.getTime() - buyTime.getTime();

    const record: GridLevelProfit = {
      level,
      buyPrice,
      sellPrice,
      buyAmount,
      sellAmount,
      profit,
      profitPercent,
      completedAt,
      duration,
    };

    this.profitHistory.push(record);
    this.emit('level_completed', record);
    
    return record;
  }

  /**
   * Record a trade
   */
  recordTrade(trade: GridTrade): void {
    this.trades.push(trade);
    
    // Update equity if trade is closed
    if (trade.status === 'CLOSED' && trade.exitTime) {
      this.updateEquity(this.currentEquity + trade.pnl);
    }
    
    this.emit('trade_recorded', trade);
  }

  /**
   * Update equity value
   */
  updateEquity(equity: number): void {
    const previousEquity = this.currentEquity;
    this.currentEquity = equity;
    this.equityCurve.push(equity);
    
    // Calculate return
    if (previousEquity > 0) {
      const returnRate = (equity - previousEquity) / previousEquity;
      this.returnsHistory.push(returnRate);
    }
    
    // Update peak/valley
    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }
    if (equity < this.valleyEquity) {
      this.valleyEquity = equity;
    }
    
    this.emit('equity_updated', { equity, peak: this.peakEquity });
  }

  /**
   * Take performance snapshot
   */
  takeSnapshot(): PerformanceSnapshot {
    const snapshot: PerformanceSnapshot = {
      timestamp: new Date(),
      equity: this.currentEquity,
      balance: this.currentEquity,
      unrealizedPnL: 0,
      drawdown: this.calculateDrawdown(),
      returnPercent: this.calculateTotalReturnPercent(),
    };
    
    this.snapshots.push(snapshot);
    return snapshot;
  }

  // ==================== PERFORMANCE METRICS ====================

  /**
   * Calculate Sharpe Ratio
   * Risk-free rate assumed 0 for crypto (or can be parameterized)
   */
  calculateSharpeRatio(riskFreeRate: number = 0): number {
    if (this.returnsHistory.length < 2) return 0;

    const meanReturn = this.calculateMeanReturn();
    const stdReturn = this.calculateStdReturn();
    
    if (stdReturn === 0) return 0;
    
    // Annualize (assuming 365 days for crypto)
    const periodsPerYear = 365 * 24; // Hourly data
    const excessReturn = meanReturn - riskFreeRate / periodsPerYear;
    
    return (excessReturn / stdReturn) * Math.sqrt(periodsPerYear);
  }

  /**
   * Calculate Sortino Ratio
   * Uses only downside deviation
   */
  calculateSortinoRatio(riskFreeRate: number = 0): number {
    if (this.returnsHistory.length < 2) return 0;

    const meanReturn = this.calculateMeanReturn();
    const downsideStd = this.calculateDownsideStd();
    
    if (downsideStd === 0) return 0;
    
    const periodsPerYear = 365 * 24;
    const excessReturn = meanReturn - riskFreeRate / periodsPerYear;
    
    return (excessReturn / downsideStd) * Math.sqrt(periodsPerYear);
  }

  /**
   * Calculate Calmar Ratio
   * Annual return / Max Drawdown
   */
  calculateCalmarRatio(): number {
    const annualReturn = this.calculateAnnualizedReturn();
    const maxDrawdownPercent = this.calculateMaxDrawdownPercent();
    
    if (maxDrawdownPercent === 0) return 0;
    
    return annualReturn / maxDrawdownPercent;
  }

  /**
   * Calculate Sterling Ratio
   * (Annual Return - 10%) / Average Drawdown
   */
  calculateSterlingRatio(): number {
    const annualReturn = this.calculateAnnualizedReturn();
    const avgDrawdown = this.calculateAverageDrawdown();
    
    if (avgDrawdown === 0) return 0;
    
    return (annualReturn - 10) / avgDrawdown;
  }

  /**
   * Calculate Profit Factor
   * Gross Profit / Gross Loss
   */
  calculateProfitFactor(): number {
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
    
    if (closedTrades.length === 0) return 0;
    
    let grossProfit = 0;
    let grossLoss = 0;
    
    for (const trade of closedTrades) {
      if (trade.pnl > 0) {
        grossProfit += trade.pnl;
      } else {
        grossLoss += Math.abs(trade.pnl);
      }
    }
    
    if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
    
    return grossProfit / grossLoss;
  }

  /**
   * Calculate Win Rate
   */
  calculateWinRate(): number {
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
    
    if (closedTrades.length === 0) return 0;
    
    const wins = closedTrades.filter(t => t.pnl > 0).length;
    return (wins / closedTrades.length) * 100;
  }

  /**
   * Calculate Payoff Ratio (Average Win / Average Loss)
   */
  calculatePayoffRatio(): number {
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
    
    if (closedTrades.length === 0) return 0;
    
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl <= 0);
    
    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0 
      ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) 
      : 0;
    
    if (avgLoss === 0) return avgWin > 0 ? Infinity : 0;
    
    return avgWin / avgLoss;
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl <= 0);
    
    const totalReturn = this.currentEquity - this.startEquity;
    const totalReturnPercent = this.calculateTotalReturnPercent();
    const annualReturn = this.calculateAnnualizedReturn();
    const dailyReturn = this.calculateDailyReturn();
    const monthlyReturn = this.calculateMonthlyReturn();
    
    const maxDrawdown = this.calculateMaxDrawdown();
    const maxDrawdownPercent = this.calculateMaxDrawdownPercent();
    const avgDrawdown = this.calculateAverageDrawdown();
    const currentDrawdown = this.calculateDrawdown();
    
    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0 
      ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length 
      : 0;
    
    const avgDuration = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => {
          if (t.exitTime) {
            return sum + (t.exitTime.getTime() - t.entryTime.getTime());
          }
          return sum;
        }, 0) / closedTrades.length / 60000 // Convert to minutes
      : 0;
    
    return {
      // Returns
      totalReturn,
      totalReturnPercent,
      annualizedReturn: annualReturn,
      dailyReturn,
      monthlyReturn,
      
      // Risk-adjusted
      sharpeRatio: this.calculateSharpeRatio(),
      sortinoRatio: this.calculateSortinoRatio(),
      calmarRatio: this.calculateCalmarRatio(),
      sterlingRatio: this.calculateSterlingRatio(),
      
      // Drawdown
      maxDrawdown,
      maxDrawdownPercent,
      avgDrawdown,
      maxDrawdownDuration: this.calculateMaxDrawdownDuration(),
      currentDrawdown,
      
      // Trading
      totalTrades: closedTrades.length,
      winRate: this.calculateWinRate(),
      profitFactor: this.calculateProfitFactor(),
      payoffRatio: this.calculatePayoffRatio(),
      avgWin,
      avgLoss,
      avgTradeDuration: avgDuration,
      
      // Grid specific
      gridEfficiency: this.calculateGridEfficiency(),
      levelUtilization: this.calculateLevelUtilization(),
      avgGridSpread: this.calculateAvgGridSpread(),
      rebalanceCount: 0, // Tracked separately
      trailingCount: 0,  // Tracked separately
      
      // Execution
      totalFees: this.trades.reduce((sum, t) => sum + t.fees, 0),
      feeRatio: this.calculateFeeRatio(),
      avgSlippage: 0, // Would need order data
      orderFillRate: 0, // Would need order data
      
      // Volatility
      realizedVolatility: this.calculateRealizedVolatility(),
      avgATR: 0, // Would need candle data
    };
  }

  // ==================== LEVEL STATISTICS ====================

  /**
   * Get profit by level
   */
  getProfitByLevel(): Record<number, number> {
    const result: Record<number, number> = {};

    for (const record of this.profitHistory) {
      if (!result[record.level]) {
        result[record.level] = 0;
      }
      result[record.level] += record.profit;
    }

    return result;
  }

  /**
   * Get statistics
   */
  getStats(): GridProfitStats {
    if (this.profitHistory.length === 0) {
      return {
        totalProfit: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        avgProfitPerLevel: 0,
        bestLevel: 0,
        worstLevel: 0,
        profitByLevel: {},
        avgDuration: 0,
      };
    }

    const totalProfit = this.profitHistory.reduce((sum, r) => sum + r.profit, 0);
    const winningTrades = this.profitHistory.filter(r => r.profit > 0).length;
    const losingTrades = this.profitHistory.filter(r => r.profit <= 0).length;
    const profitByLevel = this.getProfitByLevel();

    // Find best and worst levels
    let bestLevel = 0;
    let worstLevel = 0;
    let bestProfit = -Infinity;
    let worstProfit = Infinity;

    for (const [level, profit] of Object.entries(profitByLevel)) {
      if (profit > bestProfit) {
        bestProfit = profit;
        bestLevel = parseInt(level);
      }
      if (profit < worstProfit) {
        worstProfit = profit;
        worstLevel = parseInt(level);
      }
    }

    const avgDuration = this.profitHistory.reduce((sum, r) => sum + r.duration, 0) / this.profitHistory.length;

    return {
      totalProfit,
      totalTrades: this.profitHistory.length,
      winningTrades,
      losingTrades,
      avgProfitPerLevel: totalProfit / this.profitHistory.length,
      bestLevel,
      worstLevel,
      profitByLevel,
      avgDuration,
    };
  }

  // ==================== HELPER CALCULATIONS ====================

  /**
   * Calculate mean return
   */
  private calculateMeanReturn(): number {
    if (this.returnsHistory.length === 0) return 0;
    return this.returnsHistory.reduce((sum, r) => sum + r, 0) / this.returnsHistory.length;
  }

  /**
   * Calculate standard deviation of returns
   */
  private calculateStdReturn(): number {
    if (this.returnsHistory.length < 2) return 0;
    
    const mean = this.calculateMeanReturn();
    const squaredDiffs = this.returnsHistory.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / this.returnsHistory.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate downside standard deviation
   */
  private calculateDownsideStd(): number {
    if (this.returnsHistory.length < 2) return 0;
    
    const mean = this.calculateMeanReturn();
    const negativeReturns = this.returnsHistory.filter(r => r < mean);
    
    if (negativeReturns.length === 0) return 0;
    
    const squaredDiffs = negativeReturns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / negativeReturns.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate total return percent
   */
  private calculateTotalReturnPercent(): number {
    if (this.startEquity === 0) return 0;
    return ((this.currentEquity - this.startEquity) / this.startEquity) * 100;
  }

  /**
   * Calculate annualized return
   */
  private calculateAnnualizedReturn(): number {
    const totalReturnPercent = this.calculateTotalReturnPercent();
    const daysRunning = Math.max(1, (Date.now() - this.snapshots[0]?.timestamp?.getTime() || Date.now()) / 86400000);
    
    // Simple annualization
    return (totalReturnPercent / daysRunning) * 365;
  }

  /**
   * Calculate daily return
   */
  private calculateDailyReturn(): number {
    const totalReturnPercent = this.calculateTotalReturnPercent();
    const daysRunning = Math.max(1, (Date.now() - (this.snapshots[0]?.timestamp?.getTime() || Date.now())) / 86400000);
    
    return totalReturnPercent / daysRunning;
  }

  /**
   * Calculate monthly return
   */
  private calculateMonthlyReturn(): number {
    return this.calculateDailyReturn() * 30;
  }

  /**
   * Calculate max drawdown
   */
  private calculateMaxDrawdown(): number {
    let maxDrawdown = 0;
    let peak = this.equityCurve[0] || this.startEquity;
    
    for (const equity of this.equityCurve) {
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = peak - equity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }

  /**
   * Calculate max drawdown percent
   */
  private calculateMaxDrawdownPercent(): number {
    let maxDrawdownPercent = 0;
    let peak = this.equityCurve[0] || this.startEquity;
    
    for (const equity of this.equityCurve) {
      if (equity > peak) {
        peak = equity;
      }
      const drawdownPercent = ((peak - equity) / peak) * 100;
      if (drawdownPercent > maxDrawdownPercent) {
        maxDrawdownPercent = drawdownPercent;
      }
    }
    
    return maxDrawdownPercent;
  }

  /**
   * Calculate average drawdown
   */
  private calculateAverageDrawdown(): number {
    if (this.equityCurve.length < 2) return 0;
    
    let totalDrawdown = 0;
    let drawdownCount = 0;
    let peak = this.equityCurve[0];
    
    for (const equity of this.equityCurve) {
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = peak - equity;
      if (drawdown > 0) {
        totalDrawdown += drawdown;
        drawdownCount++;
      }
    }
    
    return drawdownCount > 0 ? (totalDrawdown / drawdownCount) / this.peakEquity * 100 : 0;
  }

  /**
   * Calculate current drawdown
   */
  private calculateDrawdown(): number {
    return this.peakEquity - this.currentEquity;
  }

  /**
   * Calculate max drawdown duration in days
   */
  private calculateMaxDrawdownDuration(): number {
    // Simplified - would need timestamp data for accurate calculation
    return 0;
  }

  /**
   * Calculate grid efficiency
   */
  private calculateGridEfficiency(): number {
    const levelsUsed = new Set(this.profitHistory.map(p => p.level)).size;
    // Assuming total levels would be passed in
    return levelsUsed > 0 ? 1 : 0;
  }

  /**
   * Calculate level utilization
   */
  private calculateLevelUtilization(): number {
    const totalLevels = this.profitHistory.length;
    const usedLevels = new Set(this.profitHistory.map(p => p.level)).size;
    return totalLevels > 0 ? usedLevels / totalLevels : 0;
  }

  /**
   * Calculate average grid spread
   */
  private calculateAvgGridSpread(): number {
    if (this.profitHistory.length < 2) return 0;
    
    const spreads = this.profitHistory.map(r => Math.abs(r.sellPrice - r.buyPrice));
    return spreads.reduce((sum, s) => sum + s, 0) / spreads.length;
  }

  /**
   * Calculate fee ratio
   */
  private calculateFeeRatio(): number {
    const totalFees = this.trades.reduce((sum, t) => sum + t.fees, 0);
    const totalPnL = Math.abs(this.trades.reduce((sum, t) => sum + t.pnl, 0));
    
    return totalPnL > 0 ? (totalFees / totalPnL) * 100 : 0;
  }

  /**
   * Calculate realized volatility
   */
  private calculateRealizedVolatility(): number {
    if (this.returnsHistory.length < 2) return 0;
    
    const std = this.calculateStdReturn();
    // Annualize
    return std * Math.sqrt(365 * 24) * 100;
  }

  // ==================== DATA RETRIEVAL ====================

  /**
   * Get history
   */
  getHistory(): GridLevelProfit[] {
    return [...this.profitHistory];
  }

  /**
   * Get history for level
   */
  getHistoryForLevel(level: number): GridLevelProfit[] {
    return this.profitHistory.filter(r => r.level === level);
  }

  /**
   * Get trades
   */
  getTrades(): GridTrade[] {
    return [...this.trades];
  }

  /**
   * Get equity curve
   */
  getEquityCurve(): number[] {
    return [...this.equityCurve];
  }

  /**
   * Get snapshots
   */
  getSnapshots(): PerformanceSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get returns history
   */
  getReturnsHistory(): number[] {
    return [...this.returnsHistory];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.profitHistory = [];
    this.trades = [];
    this.snapshots = [];
    this.returnsHistory = [];
    this.equityCurve = [this.currentEquity];
    this.emit('cleared', {});
  }

  /**
   * Reset tracker
   */
  reset(equity: number): void {
    this.startEquity = equity;
    this.currentEquity = equity;
    this.peakEquity = equity;
    this.valleyEquity = equity;
    this.profitHistory = [];
    this.trades = [];
    this.snapshots = [];
    this.returnsHistory = [];
    this.equityCurve = [equity];
    this.emit('reset', { equity });
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create profit tracker with initial equity
 */
export function createProfitTracker(initialEquity: number = 10000): GridProfitTracker {
  return new GridProfitTracker(initialEquity);
}

/**
 * Calculate performance score (0-100)
 */
export function calculatePerformanceScore(metrics: PerformanceMetrics): number {
  let score = 50; // Base score
  
  // Win rate contribution (max 15 points)
  score += (metrics.winRate - 50) * 0.3;
  
  // Profit factor contribution (max 20 points)
  if (metrics.profitFactor > 1) {
    score += Math.min(20, (metrics.profitFactor - 1) * 10);
  } else if (metrics.profitFactor < 1) {
    score -= Math.min(20, (1 - metrics.profitFactor) * 20);
  }
  
  // Sharpe ratio contribution (max 15 points)
  if (metrics.sharpeRatio > 0) {
    score += Math.min(15, metrics.sharpeRatio * 3);
  } else {
    score += Math.max(-15, metrics.sharpeRatio * 5);
  }
  
  // Drawdown penalty (max -20 points)
  score -= Math.min(20, metrics.maxDrawdownPercent * 0.5);
  
  return Math.max(0, Math.min(100, score));
}

// ==================== EXPORT DEFAULT ====================

export default GridProfitTracker;
