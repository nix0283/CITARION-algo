/**
 * Take-Profit Grace Service
 * Cornix-compatible implementation for TP retry on partial fills
 * 
 * Features:
 * - Progressive price adjustment for unfilled TP orders
 * - LONG: lowers TP price on each retry
 * - SHORT: raises TP price on each retry
 * - Configurable cap % per retry (0.01% - 2%)
 * - Max retries per TP target (1-10)
 */

import type { Position } from "@prisma/client";

// Types
export interface TPGraceConfig {
  enabled: boolean;
  capPercent: number; // 0.01 - 2%
  maxRetries: number; // 1 - 10
  retryInterval?: number; // milliseconds between retries
}

export interface TPTarget {
  id: string;
  price: number;
  amount: number; // Amount to close at this TP
  filledAmount: number;
  retryCount: number;
  status: "PENDING" | "PARTIAL" | "FILLED" | "GRACE_ACTIVE";
}

export interface TPGraceState {
  id: string;
  positionId: string;
  tpTargets: TPTarget[];
  totalRetries: number;
  maxRetries: number;
  capPercent: number;
  direction: "LONG" | "SHORT";
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}

export interface TPGraceResult {
  success: boolean;
  state: TPGraceState | null;
  retryPlaced: boolean;
  retryPrice?: number;
  retryAmount?: number;
  targetId?: string;
  error?: string;
}

// Constants
const DEFAULT_RETRY_INTERVAL = 5000; // 5 seconds

/**
 * Calculate grace price for TP retry
 * LONG: lower price = better chance to fill (sell lower)
 * SHORT: higher price = better chance to fill (buy higher)
 */
export function calculateGracePrice(
  originalPrice: number,
  capPercent: number,
  direction: "LONG" | "SHORT",
  retryCount: number
): number {
  const adjustment = (capPercent / 100) * retryCount;
  
  if (direction === "LONG") {
    // Lower the sell price
    return originalPrice * (1 - adjustment);
  } else {
    // Raise the buy price
    return originalPrice * (1 + adjustment);
  }
}

/**
 * Check if TP order needs grace retry
 */
export function needsGraceRetry(target: TPTarget, maxRetries: number): boolean {
  const remainingAmount = target.amount - target.filledAmount;
  return (
    remainingAmount > 0 &&
    target.retryCount < maxRetries &&
    target.status !== "FILLED"
  );
}

/**
 * Validate TP Grace configuration
 */
export function validateTPGraceConfig(config: TPGraceConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.capPercent < 0.01 || config.capPercent > 2) {
    errors.push("capPercent must be between 0.01% and 2%");
  }
  
  if (config.maxRetries < 1 || config.maxRetries > 10) {
    errors.push("maxRetries must be between 1 and 10");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create initial TP Grace state for a position
 */
export function createTPGraceState(
  positionId: string,
  tpTargets: Array<{ price: number; amount: number }>,
  config: TPGraceConfig,
  direction: "LONG" | "SHORT"
): TPGraceState {
  const targets: TPTarget[] = tpTargets.map((tp, index) => ({
    id: `tp-${index}-${Date.now()}`,
    price: tp.price,
    amount: tp.amount,
    filledAmount: 0,
    retryCount: 0,
    status: "PENDING" as const
  }));
  
  return {
    id: `tpgrace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    positionId,
    tpTargets: targets,
    totalRetries: 0,
    maxRetries: config.maxRetries,
    capPercent: config.capPercent,
    direction,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Process TP Grace for a specific target
 */
export function processTPGraceForTarget(
  state: TPGraceState,
  targetId: string,
  filledAmount?: number
): TPGraceResult {
  const targetIndex = state.tpTargets.findIndex(t => t.id === targetId);
  
  if (targetIndex === -1) {
    return {
      success: false,
      state,
      retryPlaced: false,
      error: "Target not found"
    };
  }
  
  const target = state.tpTargets[targetIndex];
  
  // Update filled amount if provided
  if (filledAmount !== undefined) {
    target.filledAmount += filledAmount;
    target.status = target.filledAmount >= target.amount ? "FILLED" : "PARTIAL";
  }
  
  // Check if grace retry is needed
  if (!needsGraceRetry(target, state.maxRetries)) {
    return {
      success: true,
      state,
      retryPlaced: false,
      targetId
    };
  }
  
  // Calculate new grace price
  const newRetryCount = target.retryCount + 1;
  const gracePrice = calculateGracePrice(
    target.price,
    state.capPercent,
    state.direction,
    newRetryCount
  );
  
  const remainingAmount = target.amount - target.filledAmount;
  
  // Update target
  const updatedTargets = [...state.tpTargets];
  updatedTargets[targetIndex] = {
    ...target,
    retryCount: newRetryCount,
    status: "GRACE_ACTIVE"
  };
  
  const newState: TPGraceState = {
    ...state,
    tpTargets: updatedTargets,
    totalRetries: state.totalRetries + 1,
    updatedAt: new Date()
  };
  
  return {
    success: true,
    state: newState,
    retryPlaced: true,
    retryPrice: gracePrice,
    retryAmount: remainingAmount,
    targetId
  };
}

/**
 * Process all TP targets for grace
 */
export function processAllTPGrace(
  state: TPGraceState
): { state: TPGraceState; retriesNeeded: TPGraceResult[] } {
  const retriesNeeded: TPGraceResult[] = [];
  let currentState = { ...state };
  
  for (const target of state.tpTargets) {
    if (needsGraceRetry(target, state.maxRetries)) {
      const result = processTPGraceForTarget(currentState, target.id);
      if (result.retryPlaced) {
        retriesNeeded.push(result);
        currentState = result.state!;
      }
    }
  }
  
  // Check if all targets are filled
  const allFilled = currentState.tpTargets.every(t => t.status === "FILLED");
  if (allFilled) {
    currentState.status = "COMPLETED";
  }
  
  return { state: currentState, retriesNeeded };
}

/**
 * Get TP target status summary
 */
export function getTPTargetSummary(state: TPGraceState): {
  total: number;
  filled: number;
  partial: number;
  pending: number;
  graceActive: number;
} {
  return {
    total: state.tpTargets.length,
    filled: state.tpTargets.filter(t => t.status === "FILLED").length,
    partial: state.tpTargets.filter(t => t.status === "PARTIAL").length,
    pending: state.tpTargets.filter(t => t.status === "PENDING").length,
    graceActive: state.tpTargets.filter(t => t.status === "GRACE_ACTIVE").length
  };
}

/**
 * Main function: Process TP Grace for position
 */
export async function executeTPGrace(
  positionId: string,
  tpTargets: Array<{ price: number; amount: number }>,
  config: TPGraceConfig,
  direction: "LONG" | "SHORT",
  existingState?: TPGraceState
): Promise<TPGraceResult[]> {
  if (!config.enabled) {
    return [{
      success: false,
      state: null,
      retryPlaced: false,
      error: "TP Grace is not enabled"
    }];
  }
  
  const validation = validateTPGraceConfig(config);
  if (!validation.valid) {
    return [{
      success: false,
      state: null,
      retryPlaced: false,
      error: validation.errors.join(", ")
    }];
  }
  
  const state = existingState || createTPGraceState(positionId, tpTargets, config, direction);
  const { retriesNeeded } = processAllTPGrace(state);
  
  return retriesNeeded.length > 0 ? retriesNeeded : [{
    success: true,
    state,
    retryPlaced: false
  }];
}

export default {
  calculateGracePrice,
  needsGraceRetry,
  validateTPGraceConfig,
  createTPGraceState,
  processTPGraceForTarget,
  processAllTPGrace,
  getTPTargetSummary,
  executeTPGrace
};
