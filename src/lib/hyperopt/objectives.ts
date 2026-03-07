/**
 * Hyperopt Custom Objectives
 * 
 * Различные целевые функции для оптимизации.
 */

import { BacktestResult } from "../backtesting/types";

export type ObjectiveType = 
  | "SHARPE"
  | "SORTINO"
  | "CALMAR"
  | "TOTAL_PNL"
  | "WIN_RATE"
  | "PROFIT_FACTOR"
  | "MAX_DRAWDOWN"
  | "RISK_ADJUSTED_RETURN"
  | "BALANCED"
  | "CUSTOM";

export interface ObjectiveConfig {
  type: ObjectiveType;
  customWeights?: {
    sharpe?: number;
    pnl?: number;
    drawdown?: number;
    winRate?: number;
  };
}

/**
 * Calculate Sharpe Ratio
 */
export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  return (avgReturn - riskFreeRate) / stdDev * Math.sqrt(252); // Annualized
}

/**
 * Calculate Sortino Ratio
 */
export function calculateSortinoRatio(returns: number[], riskFreeRate: number = 0): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  
  // Only negative returns
  const negativeReturns = returns.filter(r => r < 0);
  if (negativeReturns.length === 0) return avgReturn > 0 ? Infinity : 0;
  
  const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
  const downsideDev = Math.sqrt(downsideVariance);
  
  if (downsideDev === 0) return 0;
  return (avgReturn - riskFreeRate) / downsideDev * Math.sqrt(252);
}

/**
 * Calculate Calmar Ratio
 */
export function calculateCalmarRatio(totalReturn: number, maxDrawdown: number): number {
  if (maxDrawdown === 0) return totalReturn > 0 ? Infinity : 0;
  return totalReturn / maxDrawdown;
}

/**
 * Get objective value from backtest result
 */
export function getObjectiveValue(
  result: BacktestResult,
  objectiveType: ObjectiveType,
  customWeights?: ObjectiveConfig["customWeights"]
): number {
  const metrics = result.metrics;
  
  switch (objectiveType) {
    case "SHARPE":
      return metrics.sharpeRatio;
    
    case "SORTINO":
      return metrics.sortinoRatio || calculateSortinoRatio(
        result.equityCurve.map((p, i) => {
          if (i === 0) return 0;
          return (p.equity - result.equityCurve[i - 1].equity) / result.equityCurve[i - 1].equity;
        }).filter(r => r !== 0)
      );
    
    case "CALMAR":
      return calculateCalmarRatio(metrics.totalPnlPercent, metrics.maxDrawdownPercent);
    
    case "TOTAL_PNL":
      return metrics.totalPnl;
    
    case "WIN_RATE":
      return metrics.winRate;
    
    case "PROFIT_FACTOR":
      return metrics.profitFactor;
    
    case "MAX_DRAWDOWN":
      return -metrics.maxDrawdownPercent; // Negative for minimization
    
    case "RISK_ADJUSTED_RETURN":
      // Return / max drawdown
      if (metrics.maxDrawdownPercent === 0) return metrics.totalPnlPercent;
      return metrics.totalPnlPercent / metrics.maxDrawdownPercent;
    
    case "BALANCED":
      // Weighted combination
      const weights = customWeights || { sharpe: 0.4, pnl: 0.3, drawdown: 0.2, winRate: 0.1 };
      const sharpe = Math.min(metrics.sharpeRatio, 5); // Cap at 5
      const pnl = metrics.totalPnlPercent / 100; // Normalize
      const drawdown = 1 - metrics.maxDrawdownPercent / 100; // Inverted
      const winRate = metrics.winRate / 100;
      
      return (
        (weights.sharpe || 0) * sharpe +
        (weights.pnl || 0) * pnl +
        (weights.drawdown || 0) * drawdown +
        (weights.winRate || 0) * winRate
      );
    
    case "CUSTOM":
      // Use custom weights
      if (!customWeights) return metrics.sharpeRatio;
      return getObjectiveValue(result, "BALANCED", customWeights);
    
    default:
      return metrics.sharpeRatio;
  }
}

/**
 * Get objective description
 */
export function getObjectiveDescription(objectiveType: ObjectiveType): string {
  const descriptions: Record<ObjectiveType, string> = {
    SHARPE: "Sharpe Ratio - Risk-adjusted return (higher is better)",
    SORTINO: "Sortino Ratio - Downside risk-adjusted return (higher is better)",
    CALMAR: "Calmar Ratio - Return / Max Drawdown (higher is better)",
    TOTAL_PNL: "Total Profit & Loss in USDT (higher is better)",
    WIN_RATE: "Win Rate percentage (higher is better)",
    PROFIT_FACTOR: "Gross Profit / Gross Loss (higher is better)",
    MAX_DRAWDOWN: "Maximum Drawdown percentage (lower is better)",
    RISK_ADJUSTED_RETURN: "Return percentage / Max Drawdown (higher is better)",
    BALANCED: "Weighted combination of Sharpe, PnL, Drawdown, Win Rate",
    CUSTOM: "Custom weighted objective",
  };
  
  return descriptions[objectiveType];
}

/**
 * Get all objective types
 */
export function getAllObjectives(): { type: ObjectiveType; description: string }[] {
  const types: ObjectiveType[] = [
    "SHARPE", "SORTINO", "CALMAR", "TOTAL_PNL", 
    "WIN_RATE", "PROFIT_FACTOR", "MAX_DRAWDOWN", 
    "RISK_ADJUSTED_RETURN", "BALANCED"
  ];
  
  return types.map(type => ({
    type,
    description: getObjectiveDescription(type),
  }));
}
