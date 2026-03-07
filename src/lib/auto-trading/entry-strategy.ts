/**
 * Entry Strategy Service
 * Cornix-compatible entry weight distribution strategies
 */

import type { Signal } from "@prisma/client";

export type EntryStrategyType = 
  | "EVENLY_DIVIDED"
  | "ONE_TARGET"
  | "TWO_TARGETS"
  | "THREE_TARGETS"
  | "FIFTY_ON_FIRST"
  | "DECREASING_EXP"
  | "INCREASING_EXP"
  | "SKIP_FIRST"
  | "CUSTOM_RATIOS";

export interface EntryStrategyConfig {
  type: EntryStrategyType;
  customRatios?: number[]; // e.g., [50, 30, 20]
  totalTargets: number;
}

export interface EntryTarget {
  index: number;
  price: number;
  amount: number;
  percentage: number;
}

/**
 * Calculate entry weights based on strategy
 */
export function calculateEntryWeights(
  config: EntryStrategyConfig
): number[] {
  const n = config.totalTargets;
  
  switch (config.type) {
    case "EVENLY_DIVIDED":
      return Array(n).fill(100 / n);
    
    case "ONE_TARGET":
      return [100, ...Array(n - 1).fill(0)];
    
    case "TWO_TARGETS": {
      const first = 100 / 2;
      const second = 100 / 2;
      const rest = Array(Math.max(0, n - 2)).fill(0);
      return [first, second, ...rest];
    }
    
    case "THREE_TARGETS": {
      const each = 100 / 3;
      const rest = Array(Math.max(0, n - 3)).fill(0);
      return [each, each, each, ...rest];
    }
    
    case "FIFTY_ON_FIRST": {
      const rest = (n - 1) > 0 ? (50 / (n - 1)) : 0;
      return [50, ...Array(n - 1).fill(rest)];
    }
    
    case "DECREASING_EXP": {
      // Exponentially decreasing: each target gets half of previous
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
      // Exponentially increasing: each target gets double of previous
      const weights: number[] = [];
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.pow(2, i);
        weights.push(w);
        sum += w;
      }
      // Normalize to 100%
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
      // Normalize custom ratios
      const sum = config.customRatios.reduce((a, b) => a + b, 0);
      const normalized = config.customRatios.map(r => (r / sum) * 100);
      // Pad or trim to match target count
      while (normalized.length < n) normalized.push(0);
      return normalized.slice(0, n);
    }
    
    default:
      return Array(n).fill(100 / n);
  }
}

/**
 * Generate entry targets from signal
 */
export function generateEntryTargets(
  entryPrice: number,
  totalAmount: number,
  config: EntryStrategyConfig,
  direction: "LONG" | "SHORT",
  priceDiff?: number // Price difference between targets
): EntryTarget[] {
  const weights = calculateEntryWeights(config);
  const targets: EntryTarget[] = [];
  
  for (let i = 0; i < weights.length; i++) {
    const percentage = weights[i];
    const amount = (percentage / 100) * totalAmount;
    
    // Calculate price for this target
    let price = entryPrice;
    if (priceDiff && i > 0) {
      price = direction === "LONG"
        ? entryPrice * (1 - (priceDiff / 100) * i)
        : entryPrice * (1 + (priceDiff / 100) * i);
    }
    
    targets.push({
      index: i,
      price,
      amount,
      percentage
    });
  }
  
  return targets;
}

/**
 * Validate entry strategy config
 */
export function validateEntryStrategyConfig(
  config: EntryStrategyConfig
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
  calculateEntryWeights,
  generateEntryTargets,
  validateEntryStrategyConfig
};
