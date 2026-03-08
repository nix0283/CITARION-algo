/**
 * First Entry as Market Service
 * Cornix-compatible implementation for market-like first entry execution
 * 
 * Features:
 * - IMMEDIATE mode: Enter at current market price with cap protection
 * - ENTRY_PRICE_REACHED mode: Wait for signal entry price, then enter with cap
 * - Iterative price expansion (0.1% intervals, max 200 iterations)
 * - Protection from buying above TP on first entry
 */

import type { Position, Signal } from "@prisma/client";

// Types
export type FirstEntryMode = "IMMEDIATE" | "ENTRY_PRICE_REACHED";
export type FirstEntryStatus = "PENDING" | "ACTIVE" | "FILLED" | "CANCELLED" | "EXPIRED";

export interface FirstEntryConfig {
  enabled: boolean;
  mode: FirstEntryMode;
  maxPriceCap: number; // 0.05 - 20%
  onlyIfNotDefinedByGroup: boolean;
}

export interface FirstEntryState {
  id: string;
  positionId: string;
  signalId: string;
  status: FirstEntryStatus;
  mode: FirstEntryMode;
  originalEntryPrice: number;
  currentTargetPrice: number;
  cappedPrice: number;
  iterations: number;
  maxIterations: number;
  iterationStep: number; // 0.1% default
  amount: number;
  filledAmount: number;
  createdAt: Date;
  updatedAt: Date;
  lastIterationAt: Date | null;
}

export interface FirstEntryResult {
  success: boolean;
  state: FirstEntryState;
  orderPlaced: boolean;
  orderPrice?: number;
  orderAmount?: number;
  error?: string;
}

// Constants
const MAX_ITERATIONS = 200;
const ITERATION_STEP = 0.001; // 0.1%

/**
 * Calculate maximum capped price for entry
 * For LONG: capped = entry * (1 + cap%)
 * For SHORT: capped = entry * (1 - cap%)
 */
export function calculateCappedPrice(
  entryPrice: number,
  maxCap: number,
  direction: "LONG" | "SHORT"
): number {
  const capDecimal = maxCap / 100;
  
  if (direction === "LONG") {
    return entryPrice * (1 + capDecimal);
  } else {
    return entryPrice * (1 - capDecimal);
  }
}

/**
 * Calculate next iteration price
 * Iteratively increase by 0.1% for LONG, decrease for SHORT
 */
export function calculateNextIterationPrice(
  currentPrice: number,
  direction: "LONG" | "SHORT",
  step: number = ITERATION_STEP
): number {
  if (direction === "LONG") {
    return currentPrice * (1 + step);
  } else {
    return currentPrice * (1 - step);
  }
}

/**
 * Check if price is within cap limits
 */
export function isPriceWithinCap(
  price: number,
  cappedPrice: number,
  direction: "LONG" | "SHORT"
): boolean {
  if (direction === "LONG") {
    return price <= cappedPrice;
  } else {
    return price >= cappedPrice;
  }
}

/**
 * Validate first entry configuration
 */
export function validateFirstEntryConfig(config: FirstEntryConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.maxPriceCap < 0.05 || config.maxPriceCap > 20) {
    errors.push("maxPriceCap must be between 0.05% and 20%");
  }
  
  if (!["IMMEDIATE", "ENTRY_PRICE_REACHED"].includes(config.mode)) {
    errors.push("mode must be IMMEDIATE or ENTRY_PRICE_REACHED");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create initial first entry state
 */
export function createFirstEntryState(
  positionId: string,
  signalId: string,
  entryPrice: number,
  amount: number,
  config: FirstEntryConfig,
  direction: "LONG" | "SHORT"
): FirstEntryState {
  const cappedPrice = calculateCappedPrice(entryPrice, config.maxPriceCap, direction);
  
  return {
    id: `fe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    positionId,
    signalId,
    status: "PENDING",
    mode: config.mode,
    originalEntryPrice: entryPrice,
    currentTargetPrice: config.mode === "IMMEDIATE" ? entryPrice : entryPrice,
    cappedPrice,
    iterations: 0,
    maxIterations: MAX_ITERATIONS,
    iterationStep: ITERATION_STEP,
    amount,
    filledAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastIterationAt: null
  };
}

/**
 * Process first entry iteration
 * Called when current entry attempt fails
 */
export function processFirstEntryIteration(
  state: FirstEntryState,
  direction: "LONG" | "SHORT",
  currentMarketPrice: number
): FirstEntryResult {
  // Check if already filled
  if (state.status === "FILLED") {
    return {
      success: true,
      state,
      orderPlaced: false
    };
  }
  
  // Check max iterations
  if (state.iterations >= state.maxIterations) {
    return {
      success: false,
      state: { ...state, status: "EXPIRED" },
      orderPlaced: false,
      error: "Maximum iterations reached"
    };
  }
  
  // Calculate next price
  let nextPrice: number;
  
  if (state.mode === "IMMEDIATE") {
    // Use current market price for immediate mode
    nextPrice = currentMarketPrice;
  } else {
    // Iteratively expand from original entry
    nextPrice = calculateNextIterationPrice(
      state.currentTargetPrice,
      direction,
      state.iterationStep
    );
  }
  
  // Check cap
  if (!isPriceWithinCap(nextPrice, state.cappedPrice, direction)) {
    return {
      success: false,
      state: { ...state, status: "CANCELLED" },
      orderPlaced: false,
      error: "Price exceeded maximum cap"
    };
  }
  
  // Update state
  const newState: FirstEntryState = {
    ...state,
    currentTargetPrice: nextPrice,
    iterations: state.iterations + 1,
    status: "ACTIVE",
    updatedAt: new Date(),
    lastIterationAt: new Date()
  };
  
  return {
    success: true,
    state: newState,
    orderPlaced: true,
    orderPrice: nextPrice,
    orderAmount: state.amount - state.filledAmount
  };
}

/**
 * Check if TP would be hit before entry
 * Prevents buying above TP on first entry
 */
export function isTPBeforeEntry(
  entryPrice: number,
  tpPrice: number,
  direction: "LONG" | "SHORT"
): boolean {
  if (direction === "LONG") {
    return tpPrice < entryPrice;
  } else {
    return tpPrice > entryPrice;
  }
}

/**
 * Execute first entry as market
 * Main entry point for first entry logic
 */
export async function executeFirstEntryAsMarket(
  signal: Signal,
  config: FirstEntryConfig,
  currentMarketPrice: number
): Promise<FirstEntryResult> {
  if (!config.enabled) {
    return {
      success: false,
      state: null as unknown as FirstEntryState,
      orderPlaced: false,
      error: "First Entry as Market is not enabled"
    };
  }
  
  const validation = validateFirstEntryConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      state: null as unknown as FirstEntryState,
      orderPlaced: false,
      error: validation.errors.join(", ")
    };
  }
  
  const direction = signal.direction as "LONG" | "SHORT";
  const entryPrice = signal.entryPrice;
  const amount = signal.amount || 100; // Default amount
  
  // Check TP protection
  if (signal.takeProfit) {
    if (isTPBeforeEntry(entryPrice, signal.takeProfit, direction)) {
      return {
        success: false,
        state: null as unknown as FirstEntryState,
        orderPlaced: false,
        error: "TP would be hit before entry - aborting"
      };
    }
  }
  
  const state = createFirstEntryState(
    signal.id,
    signal.id,
    entryPrice,
    amount,
    config,
    direction
  );
  
  // For IMMEDIATE mode, use current market price
  if (config.mode === "IMMEDIATE") {
    const cappedPrice = calculateCappedPrice(entryPrice, config.maxPriceCap, direction);
    
    if (!isPriceWithinCap(currentMarketPrice, cappedPrice, direction)) {
      return {
        success: false,
        state: { ...state, status: "CANCELLED" },
        orderPlaced: false,
        error: "Current market price exceeds cap"
      };
    }
    
    return {
      success: true,
      state: { ...state, status: "ACTIVE", currentTargetPrice: currentMarketPrice },
      orderPlaced: true,
      orderPrice: currentMarketPrice,
      orderAmount: amount
    };
  }
  
  // For ENTRY_PRICE_REACHED mode, wait for signal price
  if (config.mode === "ENTRY_PRICE_REACHED") {
    const priceReached = direction === "LONG" 
      ? currentMarketPrice <= entryPrice * 1.001 // 0.1% tolerance
      : currentMarketPrice >= entryPrice * 0.999;
    
    if (!priceReached) {
      return {
        success: true,
        state: { ...state, status: "PENDING" },
        orderPlaced: false
      };
    }
    
    return processFirstEntryIteration(state, direction, currentMarketPrice);
  }
  
  return {
    success: false,
    state,
    orderPlaced: false,
    error: "Unknown mode"
  };
}

export default {
  calculateCappedPrice,
  calculateNextIterationPrice,
  isPriceWithinCap,
  validateFirstEntryConfig,
  createFirstEntryState,
  processFirstEntryIteration,
  isTPBeforeEntry,
  executeFirstEntryAsMarket
};
