/**
 * Take-Profit Strategy Service
 * Cornix-compatible TP weight distribution strategies
 */

import type { Signal } from "@prisma/client";

export type TPStrategyType = 
  | "EVENLY_DIVIDED"
  | "ONE_TARGET"
  | "TWO_TARGETS"
  | "THREE_TARGETS"
  | "FIFTY_ON_FIRST"
  | "DECREASING_EXP"
  | "INCREASING_EXP"
  | "SKIP_FIRST"
  | "CUSTOM_RATIOS";

export interface TPStrategyConfig {
  type: TPStrategyType;
  customRatios?: number[];
  totalTargets: number;
}

export interface TPTarget {
  index: number;
  price: number;
  amount: number;
  percentage: number;
}

/**
 * Calculate TP weights based on strategy
 */
export function calculateTPWeights(
  config: TPStrategyConfig
): number[] {
  const n = config.totalTargets;
  
  switch (config.type) {
    case "EVENLY_DIVIDED":
      return Array(n).fill(100 / n);
    
    case "ONE_TARGET":
      return [100];
    
    case "TWO_TARGETS": {
      const first = 100 / 2;
      const second = 100 / 2;
      return [first, second];
    }
    
    case "THREE_TARGETS":
      return [100 / 3, 100 / 3, 100 / 3];
    
    case "FIFTY_ON_FIRST": {
      const rest = (n - 1) > 0 ? (50 / (n - 1)) : 0;
      return [50, ...Array(n - 1).fill(rest)];
    }
    
    case "DECREASING_EXP": {
      const weights: number[] = [];
      let remaining = 100;
      for (let i = 0; i < n; i++) {
        const w = i < n - 1 ? remaining / 2 : remaining;
        weights.push(w);
        remaining -= w;
      }
      return weights;
    }
    
    case "INCREASING_EXP": {
      const weights: number[] = [];
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.pow(2, i);
        weights.push(w);
        sum += w;
      }
      return weights.map(w => (w / sum) * 100);
    }
    
    case "SKIP_FIRST": {
      const rest = n > 1 ? 100 / (n - 1) : 100;
      return [0, ...Array(n - 1).fill(rest)];
    }
    
    case "CUSTOM_RATIOS": {
      if (!config.customRatios || config.customRatios.length === 0) {
        return Array(n).fill(100 / n);
      }
      const sum = config.customRatios.reduce((a, b) => a + b, 0);
      const normalized = config.customRatios.map(r => (r / sum) * 100);
      while (normalized.length < n) normalized.push(0);
      return normalized.slice(0, n);
    }
    
    default:
      return Array(n).fill(100 / n);
  }
}

/**
 * Generate TP targets from signal
 */
export function generateTPTargets(
  tpPrices: number[],
  totalAmount: number,
  config: TPStrategyConfig
): TPTarget[] {
  const weights = calculateTPWeights(config);
  const targets: TPTarget[] = [];
  
  const targetCount = Math.min(tpPrices.length, config.totalTargets);
  
  for (let i = 0; i < targetCount; i++) {
    const percentage = weights[i] || 0;
    const amount = (percentage / 100) * totalAmount;
    
    targets.push({
      index: i,
      price: tpPrices[i],
      amount,
      percentage
    });
  }
  
  return targets;
}

/**
 * Validate TP strategy config
 */
export function validateTPStrategyConfig(
  config: TPStrategyConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.totalTargets < 1 || config.totalTargets > 10) {
    errors.push("totalTargets must be between 1 and 10");
  }
  
  if (config.type === "CUSTOM_RATIOS") {
    if (!config.customRatios || config.customRatios.length === 0) {
      errors.push("customRatios required for CUSTOM_RATIOS strategy");
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export default {
  calculateTPWeights,
  generateTPTargets,
  validateTPStrategyConfig
};
