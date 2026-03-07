/**
 * Grid Bot Profit Tracker
 * 
 * Отслеживание прибыли по каждому уровню сетки.
 */

export interface GridLevelProfit {
  level: number;
  buyPrice: number;
  sellPrice: number;
  buyAmount: number;
  sellAmount: number;
  profit: number;
  profitPercent: number;
  completedAt: Date;
  duration: number; // milliseconds
}

export interface GridProfitStats {
  totalProfit: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgProfitPerLevel: number;
  bestLevel: number;
  worstLevel: number;
  profitByLevel: Record<number, number>;
  avgDuration: number;
}

export class GridProfitTracker {
  private profitHistory: GridLevelProfit[] = [];

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
    return record;
  }

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
   * Clear history
   */
  clear(): void {
    this.profitHistory = [];
  }
}
