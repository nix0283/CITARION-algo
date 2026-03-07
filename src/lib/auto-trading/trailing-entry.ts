/**
 * Trailing Entry Service
 * Cornix-compatible trailing entry orders
 * 
 * Trails the entry price as price moves favorably before entry
 */

import type { Signal } from "@prisma/client";

export type TrailingEntryStatus = "PENDING" | "TRAILING" | "TRIGGERED" | "FILLED" | "CANCELLED";

export interface TrailingEntryConfig {
  enabled: boolean;
  trailPercent: number; // Trail behind price by this %
  activateDistance: number; // Activate when price is within this % of entry
  maxIterations: number;
  onlyIfNotDefinedByGroup: boolean;
}

export interface TrailingEntryState {
  id: string;
  signalId: string;
  status: TrailingEntryStatus;
  originalEntryPrice: number;
  currentTargetPrice: number;
  trailPercent: number;
  direction: "LONG" | "SHORT";
  iterations: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrailingEntryResult {
  success: boolean;
  state: TrailingEntryState | null;
  shouldPlaceOrder: boolean;
  orderPrice?: number;
  error?: string;
}

/**
 * Calculate trailing entry price
 */
export function calculateTrailingEntryPrice(
  currentPrice: number,
  trailPercent: number,
  direction: "LONG" | "SHORT"
): number {
  if (direction === "LONG") {
    // For LONG, trail BELOW current price
    return currentPrice * (1 - trailPercent / 100);
  } else {
    // For SHORT, trail ABOVE current price
    return currentPrice * (1 + trailPercent / 100);
  }
}

/**
 * Check if trailing entry should activate
 */
export function shouldActivateTrailingEntry(
  currentPrice: number,
  entryPrice: number,
  activateDistance: number,
  direction: "LONG" | "SHORT"
): boolean {
  const distance = direction === "LONG"
    ? ((entryPrice - currentPrice) / currentPrice) * 100
    : ((currentPrice - entryPrice) / currentPrice) * 100;
  
  return distance <= activateDistance;
}

/**
 * Process trailing entry
 */
export function processTrailingEntry(
  state: TrailingEntryState,
  currentPrice: number,
  config: TrailingEntryConfig
): TrailingEntryResult {
  if (state.status === "FILLED" || state.status === "CANCELLED") {
    return { success: true, state, shouldPlaceOrder: false };
  }
  
  // Calculate new trailing price
  const newTargetPrice = calculateTrailingEntryPrice(
    currentPrice,
    config.trailPercent,
    state.direction
  );
  
  // Check if price should trigger entry
  const shouldTrigger = state.direction === "LONG"
    ? currentPrice <= newTargetPrice
    : currentPrice >= newTargetPrice;
  
  if (shouldTrigger) {
    return {
      success: true,
      state: {
        ...state,
        status: "TRIGGERED",
        currentTargetPrice: newTargetPrice,
        updatedAt: new Date()
      },
      shouldPlaceOrder: true,
      orderPrice: newTargetPrice
    };
  }
  
  // Update trailing price if better
  const isBetter = state.direction === "LONG"
    ? newTargetPrice > state.currentTargetPrice
    : newTargetPrice < state.currentTargetPrice;
  
  if (isBetter || state.status === "PENDING") {
    return {
      success: true,
      state: {
        ...state,
        status: "TRAILING",
        currentTargetPrice: newTargetPrice,
        iterations: state.iterations + 1,
        updatedAt: new Date()
      },
      shouldPlaceOrder: false
    };
  }
  
  return { success: true, state, shouldPlaceOrder: false };
}

export default {
  calculateTrailingEntryPrice,
  shouldActivateTrailingEntry,
  processTrailingEntry
};
