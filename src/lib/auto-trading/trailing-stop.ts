/**
 * Trailing Stop Service
 * Cornix-compatible implementation with 5 trailing stop types
 * 
 * Types:
 * 1. BREAKEVEN - Move SL to break-even after trigger
 * 2. MOVING_TARGET - SL follows at 1 TP distance
 * 3. MOVING_2_TARGET - SL follows at 2 TP distance
 * 4. PERCENT_BELOW_TRIGGERS - Fixed % below trigger price
 * 5. PERCENT_BELOW_HIGHEST - Dynamic % below highest price
 */

import type { Position } from "@prisma/client";

// Types
export type TrailingType = 
  | "BREAKEVEN" 
  | "MOVING_TARGET" 
  | "MOVING_2_TARGET" 
  | "PERCENT_BELOW_TRIGGERS" 
  | "PERCENT_BELOW_HIGHEST";

export type TrailingTriggerType = "TARGET_REACHED" | "PERCENT_ABOVE_ENTRY";

export type TrailingStatus = "INACTIVE" | "TRIGGERED" | "ACTIVE" | "STOPPED";

export interface TrailingStopConfig {
  enabled: boolean;
  type: TrailingType;
  triggerType: TrailingTriggerType;
  triggerValue?: number; // Target # or percentage
  trailingPercent?: number; // For PERCENT_BELOW_* types
  onlyIfNotDefinedByGroup?: boolean;
}

export interface TrailingStopState {
  id: string;
  positionId: string;
  type: TrailingType;
  status: TrailingStatus;
  originalSL: number;
  currentSL: number;
  avgEntryPrice: number;
  highestPrice: number;
  lowestPrice: number;
  triggerTargetIndex: number;
  lastTPPrice: number | null;
  last2TPPrice: number | null;
  trailingDistance: number;
  createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;
}

export interface TrailingStopResult {
  success: boolean;
  state: TrailingStopState | null;
  shouldUpdateSL: boolean;
  newSL?: number;
  message?: string;
  error?: string;
}

/**
 * Validate trailing stop configuration
 */
export function validateTrailingConfig(config: TrailingStopConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const validTypes: TrailingType[] = [
    "BREAKEVEN", 
    "MOVING_TARGET", 
    "MOVING_2_TARGET", 
    "PERCENT_BELOW_TRIGGERS", 
    "PERCENT_BELOW_HIGHEST"
  ];
  
  if (!validTypes.includes(config.type)) {
    errors.push(`type must be one of: ${validTypes.join(", ")}`);
  }
  
  if (["PERCENT_BELOW_TRIGGERS", "PERCENT_BELOW_HIGHEST"].includes(config.type)) {
    if (!config.trailingPercent || config.trailingPercent <= 0) {
      errors.push("trailingPercent is required for PERCENT_BELOW_* types");
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check if trailing should be triggered
 */
export function shouldTriggerTrailing(
  config: TrailingStopConfig,
  currentPrice: number,
  avgEntryPrice: number,
  tpTargets: number[],
  highestProfitPercent: number
): { triggered: boolean; triggerTargetIndex: number } {
  if (config.triggerType === "TARGET_REACHED") {
    // Trigger when specific TP target is reached
    const targetIndex = Math.floor(config.triggerValue || 1) - 1;
    const targetPrice = tpTargets[targetIndex];
    
    if (!targetPrice) {
      return { triggered: false, triggerTargetIndex: -1 };
    }
    
    // Check if current price has reached/passed the target
    return { triggered: true, triggerTargetIndex: targetIndex };
  }
  
  if (config.triggerType === "PERCENT_ABOVE_ENTRY") {
    const triggerPercent = config.triggerValue || 5;
    const profitPercent = highestProfitPercent;
    
    if (profitPercent >= triggerPercent) {
      return { triggered: true, triggerTargetIndex: -1 };
    }
  }
  
  return { triggered: false, triggerTargetIndex: -1 };
}

/**
 * Calculate new SL based on trailing type
 */
export function calculateTrailingSL(
  type: TrailingType,
  avgEntryPrice: number,
  highestPrice: number,
  triggerPrice: number,
  lastTPPrice: number | null,
  last2TPPrice: number | null,
  trailingPercent: number,
  direction: "LONG" | "SHORT"
): number {
  switch (type) {
    case "BREAKEVEN":
      return avgEntryPrice;
    
    case "MOVING_TARGET":
      if (!lastTPPrice) return avgEntryPrice;
      // SL at 1 TP distance from last TP
      const tp1Distance = Math.abs(lastTPPrice - avgEntryPrice);
      return direction === "LONG" 
        ? lastTPPrice - tp1Distance 
        : lastTPPrice + tp1Distance;
    
    case "MOVING_2_TARGET":
      if (!lastTPPrice || !last2TPPrice) return avgEntryPrice;
      // SL at 2 TP distance from last TP
      const tp2Distance = Math.abs(lastTPPrice - last2TPPrice);
      return direction === "LONG"
        ? lastTPPrice - tp2Distance
        : lastTPPrice + tp2Distance;
    
    case "PERCENT_BELOW_TRIGGERS":
      return direction === "LONG"
        ? triggerPrice * (1 - trailingPercent / 100)
        : triggerPrice * (1 + trailingPercent / 100);
    
    case "PERCENT_BELOW_HIGHEST":
      return direction === "LONG"
        ? highestPrice * (1 - trailingPercent / 100)
        : highestPrice * (1 + trailingPercent / 100);
    
    default:
      return avgEntryPrice;
  }
}

/**
 * Create initial trailing stop state
 */
export function createTrailingStopState(
  positionId: string,
  config: TrailingStopConfig,
  avgEntryPrice: number,
  initialSL: number,
  direction: "LONG" | "SHORT"
): TrailingStopState {
  return {
    id: `ts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    positionId,
    type: config.type,
    status: "INACTIVE",
    originalSL: initialSL,
    currentSL: initialSL,
    avgEntryPrice,
    highestPrice: avgEntryPrice,
    lowestPrice: avgEntryPrice,
    triggerTargetIndex: -1,
    lastTPPrice: null,
    last2TPPrice: null,
    trailingDistance: config.trailingPercent || 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    activatedAt: null
  };
}

/**
 * Update highest/lowest price tracking
 */
export function updatePriceTracking(
  state: TrailingStopState,
  currentPrice: number,
  direction: "LONG" | "SHORT"
): TrailingStopState {
  return {
    ...state,
    highestPrice: Math.max(state.highestPrice, currentPrice),
    lowestPrice: Math.min(state.lowestPrice, currentPrice),
    updatedAt: new Date()
  };
}

/**
 * Process trailing stop update
 */
export function processTrailingStop(
  state: TrailingStopState,
  config: TrailingStopConfig,
  currentPrice: number,
  tpTargets: number[],
  filledTPCount: number,
  direction: "LONG" | "SHORT"
): TrailingStopResult {
  // Update price tracking
  let updatedState = updatePriceTracking(state, currentPrice, direction);
  
  // Check for trigger
  if (updatedState.status === "INACTIVE") {
    const profitPercent = direction === "LONG"
      ? ((currentPrice - updatedState.avgEntryPrice) / updatedState.avgEntryPrice) * 100
      : ((updatedState.avgEntryPrice - currentPrice) / updatedState.avgEntryPrice) * 100;
    
    const { triggered, triggerTargetIndex } = shouldTriggerTrailing(
      config,
      currentPrice,
      updatedState.avgEntryPrice,
      tpTargets,
      profitPercent
    );
    
    if (triggered) {
      updatedState = {
        ...updatedState,
        status: "TRIGGERED",
        triggerTargetIndex,
        activatedAt: new Date()
      };
    } else {
      return {
        success: true,
        state: updatedState,
        shouldUpdateSL: false,
        message: "Trailing not yet triggered"
      };
    }
  }
  
  // If triggered or active, calculate new SL
  if (updatedState.status === "TRIGGERED" || updatedState.status === "ACTIVE") {
    // Update TP tracking
    if (filledTPCount > 0 && tpTargets.length > 0) {
      updatedState.last2TPPrice = updatedState.lastTPPrice;
      updatedState.lastTPPrice = tpTargets[Math.min(filledTPCount - 1, tpTargets.length - 1)];
    }
    
    const triggerPrice = updatedState.triggerTargetIndex >= 0 && tpTargets[updatedState.triggerTargetIndex]
      ? tpTargets[updatedState.triggerTargetIndex]
      : currentPrice;
    
    const newSL = calculateTrailingSL(
      config.type,
      updatedState.avgEntryPrice,
      updatedState.highestPrice,
      triggerPrice,
      updatedState.lastTPPrice,
      updatedState.last2TPPrice,
      config.trailingPercent || 2,
      direction
    );
    
    // Only update if new SL is better
    const isBetter = direction === "LONG"
      ? newSL > updatedState.currentSL
      : newSL < updatedState.currentSL;
    
    if (isBetter) {
      return {
        success: true,
        state: {
          ...updatedState,
          status: "ACTIVE",
          currentSL: newSL,
          updatedAt: new Date()
        },
        shouldUpdateSL: true,
        newSL,
        message: `Trailing SL updated to ${newSL}`
      };
    }
  }
  
  return {
    success: true,
    state: updatedState,
    shouldUpdateSL: false
  };
}

// Presets for common use cases
export const TRAILING_PRESETS: Record<string, TrailingStopConfig> = {
  conservativeBreakeven: {
    enabled: true,
    type: "BREAKEVEN",
    triggerType: "TARGET_REACHED",
    triggerValue: 1
  },
  moderateMovingTarget: {
    enabled: true,
    type: "MOVING_TARGET",
    triggerType: "TARGET_REACHED",
    triggerValue: 1
  },
  aggressivePercent: {
    enabled: true,
    type: "PERCENT_BELOW_HIGHEST",
    triggerType: "PERCENT_ABOVE_ENTRY",
    triggerValue: 5,
    trailingPercent: 2
  },
  scalping: {
    enabled: true,
    type: "PERCENT_BELOW_TRIGGERS",
    triggerType: "PERCENT_ABOVE_ENTRY",
    triggerValue: 2,
    trailingPercent: 1
  },
  swing: {
    enabled: true,
    type: "MOVING_2_TARGET",
    triggerType: "TARGET_REACHED",
    triggerValue: 2
  }
};

export default {
  validateTrailingConfig,
  shouldTriggerTrailing,
  calculateTrailingSL,
  createTrailingStopState,
  updatePriceTracking,
  processTrailingStop,
  TRAILING_PRESETS
};
