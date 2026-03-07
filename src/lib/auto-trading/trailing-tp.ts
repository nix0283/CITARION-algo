/**
 * Trailing Take-Profit Service
 * Cornix-compatible trailing TP after targets reached
 */

import type { Position } from "@prisma/client";

export type TrailingTPStatus = "INACTIVE" | "ACTIVE" | "COMPLETED";

export interface TrailingTPConfig {
  enabled: boolean;
  trailPercent: number; // Trail TP by this % behind price
  activateAfterTP: number; // Activate after Nth TP filled
  onlyIfNotDefinedByGroup: boolean;
}

export interface TrailingTPState {
  id: string;
  positionId: string;
  status: TrailingTPStatus;
  originalTP: number;
  currentTP: number;
  highestPrice: number;
  lowestPrice: number;
  trailPercent: number;
  direction: "LONG" | "SHORT";
  filledTPCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Calculate trailing TP price
 */
export function calculateTrailingTPPrice(
  highestPrice: number,
  trailPercent: number,
  direction: "LONG" | "SHORT"
): number {
  if (direction === "LONG") {
    // For LONG, TP trails BELOW highest price
    return highestPrice * (1 - trailPercent / 100);
  } else {
    // For SHORT, TP trails ABOVE lowest price
    return highestPrice * (1 + trailPercent / 100);
  }
}

/**
 * Process trailing TP update
 */
export function processTrailingTP(
  state: TrailingTPState,
  currentPrice: number,
  filledTPCount: number,
  config: TrailingTPConfig
): { state: TrailingTPState; shouldUpdateTP: boolean; newTP?: number } {
  // Update price tracking
  const newState = {
    ...state,
    highestPrice: Math.max(state.highestPrice, currentPrice),
    lowestPrice: Math.min(state.lowestPrice, currentPrice),
    filledTPCount,
    updatedAt: new Date()
  };
  
  // Check activation
  if (newState.status === "INACTIVE" && filledTPCount >= config.activateAfterTP) {
    newState.status = "ACTIVE";
  }
  
  if (newState.status !== "ACTIVE") {
    return { state: newState, shouldUpdateTP: false };
  }
  
  // Calculate new TP
  const newTP = calculateTrailingTPPrice(
    newState.highestPrice,
    config.trailPercent,
    newState.direction
  );
  
  // Check if new TP is better
  const isBetter = newState.direction === "LONG"
    ? newTP > newState.currentTP
    : newTP < newState.currentTP;
  
  if (isBetter) {
    return {
      state: { ...newState, currentTP: newTP },
      shouldUpdateTP: true,
      newTP
    };
  }
  
  return { state: newState, shouldUpdateTP: false };
}

export default {
  calculateTrailingTPPrice,
  processTrailingTP
};
