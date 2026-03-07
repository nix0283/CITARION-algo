/**
 * Moving Take-Profit Service
 * Cornix-compatible dynamic TP adjustment based on entry baseline
 */

import type { Position } from "@prisma/client";

export type MovingTPBaseline = "AVERAGE_ENTRIES" | "FIRST_ENTRY";

export interface MovingTPConfig {
  enabled: boolean;
  baseline: MovingTPBaseline;
  onlyIfNotDefinedByGroup: boolean;
}

export interface MovingTPState {
  id: string;
  positionId: string;
  enabled: boolean;
  baseline: MovingTPBaseline;
  originalTPs: number[];
  currentTPs: number[];
  avgEntryPrice: number;
  firstEntryPrice: number;
  direction: "LONG" | "SHORT";
  totalEntries: number;
  totalAmount: number;
  updatedAt: Date;
}

/**
 * Calculate moving TP prices based on baseline
 */
export function calculateMovingTPs(
  originalTPs: number[],
  baseline: MovingTPBaseline,
  avgEntryPrice: number,
  firstEntryPrice: number,
  direction: "LONG" | "SHORT"
): number[] {
  const baselinePrice = baseline === "AVERAGE_ENTRIES" ? avgEntryPrice : firstEntryPrice;
  
  return originalTPs.map(tp => {
    // Calculate TP distance from baseline
    const distance = direction === "LONG"
      ? tp - baselinePrice
      : baselinePrice - tp;
    
    // Apply distance from current baseline
    return direction === "LONG"
      ? baselinePrice + distance
      : baselinePrice - distance;
  });
}

/**
 * Update moving TP after new entry
 */
export function updateMovingTP(
  state: MovingTPState,
  newEntryPrice: number,
  newAmount: number
): { state: MovingTPState; newTPs: number[] } {
  const totalAmount = state.totalAmount + newAmount;
  const avgEntryPrice = (
    (state.avgEntryPrice * state.totalAmount + newEntryPrice * newAmount) 
    / totalAmount
  );
  
  const newState = {
    ...state,
    avgEntryPrice,
    totalEntries: state.totalEntries + 1,
    totalAmount,
    updatedAt: new Date()
  };
  
  const newTPs = calculateMovingTPs(
    state.originalTPs,
    state.baseline,
    avgEntryPrice,
    state.firstEntryPrice,
    state.direction
  );
  
  newState.currentTPs = newTPs;
  
  return { state: newState, newTPs };
}

export default {
  calculateMovingTPs,
  updateMovingTP
};
