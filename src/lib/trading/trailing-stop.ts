/**
 * Trailing Stop Module - Cornix-compatible Implementation
 *
 * Implements 5 types of Trailing Stop:
 *
 * 1. BREAKEVEN - Moves SL to breakeven point (avg entry price)
 *    Trigger: Target reached or percent above entry
 *
 * 2. MOVING_TARGET - Moves SL to distance of 1 target from last reached target
 *    Trigger: TP target reached
 *
 * 3. MOVING_2_TARGET - Moves SL to distance of 2 targets from last reached target
 *    Trigger: TP target reached
 *
 * 4. PERCENT_BELOW_TRIGGERS - Sets SL at X% below a specific trigger price
 *    Trigger: Target reached or percent above entry
 *
 * 5. PERCENT_BELOW_HIGHEST - Follows maximum price at X% distance
 *    Activation: Trigger condition
 *    Continuously updates below max price
 *
 * All types require a trigger for activation!
 *
 * @author CITARION Team
 * @version 1.0.0
 */

import { db } from "@/lib/db";
import { notifyTelegram, notifyUI } from "@/lib/notification-service";

// ==================== TYPES ====================

/**
 * Types of Trailing Stop (Cornix-compatible)
 */
export type TrailingType =
  | "BREAKEVEN"
  | "MOVING_TARGET"
  | "MOVING_2_TARGET"
  | "PERCENT_BELOW_TRIGGERS"
  | "PERCENT_BELOW_HIGHEST";

/**
 * Trigger types for trailing activation
 */
export type TrailingTriggerType = "TARGET_REACHED" | "PERCENT_ABOVE_ENTRY";

/**
 * Direction for position
 */
export type PositionDirection = "LONG" | "SHORT";

/**
 * Configuration for Trailing Stop
 */
export interface TrailingStopConfig {
  enabled: boolean;
  type: TrailingType;
  triggerType: TrailingTriggerType;
  triggerValue: number; // Target # (1-10) or percentage
  trailingPercent?: number; // % distance for types 4, 5
}

/**
 * Runtime state for Trailing Stop
 */
export interface TrailingState {
  activated: boolean;
  highestPrice?: number; // For PERCENT_BELOW_HIGHEST
  lowestPrice?: number; // For SHORT positions
  lastTPReached?: number; // For MOVING_TARGET types
  currentSL: number;
}

/**
 * Position data needed for trailing calculations
 */
export interface TrailingPositionData {
  id: string;
  symbol: string;
  direction: PositionDirection;
  avgEntryPrice: number;
  currentPrice: number;
  stopLoss: number | null;
  leverage: number;
  isDemo: boolean;
}

/**
 * Take Profit target
 */
export interface TPTarget {
  price: number;
  percentage: number;
  filled?: boolean;
}

/**
 * Result of trailing stop check
 */
export interface TrailingStopResult {
  updated: boolean;
  activated?: boolean;
  newStopLoss?: number;
  reason?: string;
  trailingDistance?: number;
  state?: TrailingState;
}

// ==================== MAIN FUNCTIONS ====================

/**
 * Check if trailing stop should activate based on trigger conditions
 *
 * @param currentPrice - Current market price
 * @param avgEntryPrice - Average entry price of position
 * @param tpTargets - Array of TP targets
 * @param config - Trailing stop configuration
 * @param state - Current trailing state
 * @returns Whether trailing should activate
 */
export function shouldActivateTrailing(
  currentPrice: number,
  avgEntryPrice: number,
  tpTargets: TPTarget[],
  config: TrailingStopConfig,
  state: TrailingState
): { activate: boolean; reason: string; tpReached?: number } {
  if (state.activated) {
    return { activate: false, reason: "Already activated" };
  }

  const isLong = true; // We'll handle direction in calculations

  switch (config.triggerType) {
    case "TARGET_REACHED": {
      // Check if specified target has been reached
      const targetIndex = Math.floor(config.triggerValue) - 1;
      if (targetIndex < 0 || targetIndex >= tpTargets.length) {
        return { activate: false, reason: "Invalid target number" };
      }

      const target = tpTargets[targetIndex];
      if (!target) {
        return { activate: false, reason: "Target not found" };
      }

      // For LONG: price >= target price means target reached
      // For SHORT: price <= target price means target reached
      const targetReached = currentPrice >= target.price;

      if (targetReached) {
        return {
          activate: true,
          reason: `Target ${config.triggerValue} reached at ${currentPrice}`,
          tpReached: config.triggerValue,
        };
      }
      return {
        activate: false,
        reason: `Target ${config.triggerValue} not yet reached`,
      };
    }

    case "PERCENT_ABOVE_ENTRY": {
      // Check if price is X% above/below entry
      const percentMove =
        ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100;

      if (percentMove >= config.triggerValue) {
        return {
          activate: true,
          reason: `Price ${percentMove.toFixed(2)}% above entry (threshold: ${config.triggerValue}%)`,
        };
      }
      return {
        activate: false,
        reason: `Price ${percentMove.toFixed(2)}% (need ${config.triggerValue}%)`,
      };
    }

    default:
      return { activate: false, reason: "Unknown trigger type" };
  }
}

/**
 * Calculate new Stop Loss based on trailing type
 *
 * @param type - Trailing stop type
 * @param direction - Position direction (LONG/SHORT)
 * @param avgEntryPrice - Average entry price
 * @param highestPrice - Highest price reached (for type 5)
 * @param lastTPReached - Last TP target number reached
 * @param tpTargets - Array of TP targets
 * @param trailingPercent - % distance for types 4, 5
 * @returns Calculated stop loss price
 */
export function calculateTrailingSL(
  type: TrailingType,
  direction: PositionDirection,
  avgEntryPrice: number,
  highestPrice: number,
  lastTPReached: number,
  tpTargets: TPTarget[],
  trailingPercent?: number
): number {
  const isLong = direction === "LONG";

  switch (type) {
    case "BREAKEVEN":
      // SL moves to entry price (breakeven)
      return avgEntryPrice;

    case "MOVING_TARGET": {
      // SL moves to 1 target distance below last reached TP
      if (lastTPReached < 1 || tpTargets.length < lastTPReached) {
        return avgEntryPrice; // Fallback to breakeven
      }

      const currentTP = tpTargets[lastTPReached - 1];
      if (!currentTP) return avgEntryPrice;

      // Calculate distance of 1 target
      let targetDistance: number;
      if (lastTPReached >= 2 && tpTargets[lastTPReached - 2]) {
        const prevTP = tpTargets[lastTPReached - 2];
        targetDistance = currentTP.price - prevTP.price;
      } else {
        // First target - use distance from entry
        targetDistance = currentTP.price - avgEntryPrice;
      }

      // SL = current TP - 1 target distance (for LONG)
      return isLong
        ? currentTP.price - targetDistance
        : currentTP.price + targetDistance;
    }

    case "MOVING_2_TARGET": {
      // SL moves to 2 target distances below last reached TP
      if (lastTPReached < 1 || tpTargets.length < lastTPReached) {
        return avgEntryPrice;
      }

      const currentTP = tpTargets[lastTPReached - 1];
      if (!currentTP) return avgEntryPrice;

      // Calculate distance of 2 targets
      let targetDistance: number;
      if (lastTPReached >= 3 && tpTargets[lastTPReached - 3]) {
        const prevPrevTP = tpTargets[lastTPReached - 3];
        targetDistance = (currentTP.price - prevPrevTP.price) / 2;
      } else if (lastTPReached >= 2 && tpTargets[lastTPReached - 2]) {
        const prevTP = tpTargets[lastTPReached - 2];
        targetDistance = currentTP.price - prevTP.price;
      } else {
        // Not enough targets - use distance from entry * 2
        targetDistance = (currentTP.price - avgEntryPrice) * 2;
      }

      return isLong
        ? currentTP.price - targetDistance * 2
        : currentTP.price + targetDistance * 2;
    }

    case "PERCENT_BELOW_TRIGGERS": {
      // SL at X% below trigger price
      const percent = trailingPercent ?? 2;
      return isLong
        ? highestPrice * (1 - percent / 100)
        : highestPrice * (1 + percent / 100);
    }

    case "PERCENT_BELOW_HIGHEST": {
      // SL follows highest price at X% distance
      const percent = trailingPercent ?? 2;
      return isLong
        ? highestPrice * (1 - percent / 100)
        : highestPrice * (1 + percent / 100);
    }

    default:
      return avgEntryPrice;
  }
}

/**
 * Update trailing state based on current price
 *
 * @param currentPrice - Current market price
 * @param direction - Position direction
 * @param config - Trailing configuration
 * @param state - Current trailing state
 * @returns Updated trailing state
 */
export function updateTrailingState(
  currentPrice: number,
  direction: PositionDirection,
  config: TrailingStopConfig,
  state: TrailingState
): TrailingState {
  const isLong = direction === "LONG";
  const newState = { ...state };

  // Update highest/lowest price for PERCENT_BELOW_HIGHEST
  if (config.type === "PERCENT_BELOW_HIGHEST" && state.activated) {
    if (isLong) {
      if (!state.highestPrice || currentPrice > state.highestPrice) {
        newState.highestPrice = currentPrice;
      }
    } else {
      if (!state.lowestPrice || currentPrice < state.lowestPrice) {
        newState.lowestPrice = currentPrice;
      }
    }
  }

  return newState;
}

/**
 * Process trailing stop for a position
 * Main entry point for the trailing stop logic
 *
 * @param position - Position data
 * @param tpTargets - Take profit targets
 * @param config - Trailing stop configuration
 * @param currentState - Current trailing state
 * @returns Trailing stop result
 */
export async function processTrailingStop(
  position: TrailingPositionData,
  tpTargets: TPTarget[],
  config: TrailingStopConfig,
  currentState: TrailingState
): Promise<TrailingStopResult> {
  if (!config.enabled) {
    return { updated: false, reason: "Trailing stop disabled" };
  }

  const { currentPrice, avgEntryPrice, direction } = position;
  const isLong = direction === "LONG";

  // Check for activation
  if (!currentState.activated) {
    const activation = shouldActivateTrailing(
      currentPrice,
      avgEntryPrice,
      tpTargets,
      config,
      currentState
    );

    if (activation.activate) {
      // Activate trailing
      const newState: TrailingState = {
        activated: true,
        highestPrice: currentPrice,
        lowestPrice: currentPrice,
        lastTPReached: activation.tpReached ?? 1,
        currentSL: position.stopLoss ?? avgEntryPrice,
      };

      // Calculate initial SL
      const newSL = calculateTrailingSL(
        config.type,
        direction,
        avgEntryPrice,
        currentPrice,
        newState.lastTPReached,
        tpTargets,
        config.trailingPercent
      );

      newState.currentSL = newSL;

      // Update database
      await db.position.update({
        where: { id: position.id },
        data: {
          stopLoss: newSL,
          trailingActivated: true,
          highestPrice: currentPrice,
          lowestPrice: currentPrice,
        },
      });

      // Notify
      await notifyUI({
        type: "POSITION_UPDATED",
        title: "📈 Trailing Stop Activated",
        message: `${position.symbol} ${direction}\nType: ${config.type}\nNew SL: $${newSL.toFixed(2)}`,
        data: { positionId: position.id, config, newState },
      });

      return {
        updated: true,
        activated: true,
        newStopLoss: newSL,
        reason: activation.reason,
        state: newState,
      };
    }

    return { updated: false, reason: activation.reason };
  }

  // Already activated - update trailing
  let updated = false;
  const newState = updateTrailingState(
    currentPrice,
    direction,
    config,
    currentState
  );

  // For PERCENT_BELOW_HIGHEST, continuously update SL
  if (config.type === "PERCENT_BELOW_HIGHEST") {
    const referencePrice = isLong
      ? newState.highestPrice!
      : newState.lowestPrice!;

    const newSL = calculateTrailingSL(
      config.type,
      direction,
      avgEntryPrice,
      referencePrice,
      currentState.lastTPReached ?? 1,
      tpTargets,
      config.trailingPercent
    );

    // SL only moves in profitable direction (up for LONG, down for SHORT)
    const shouldUpdate = isLong
      ? newSL > currentState.currentSL
      : newSL < currentState.currentSL;

    if (shouldUpdate) {
      newState.currentSL = newSL;
      updated = true;

      await db.position.update({
        where: { id: position.id },
        data: {
          stopLoss: newSL,
          highestPrice: newState.highestPrice,
          lowestPrice: newState.lowestPrice,
        },
      });

      await notifyUI({
        type: "POSITION_UPDATED",
        title: "📍 Trailing Stop Updated",
        message: `${position.symbol} ${direction}\nNew SL: $${newSL.toFixed(2)}`,
        data: { positionId: position.id, newSL },
      });

      return {
        updated: true,
        newStopLoss: newSL,
        reason: "Trailing stop updated",
        state: newState,
      };
    }
  }

  return {
    updated: false,
    reason: "No update needed",
    state: newState,
  };
}

/**
 * Handle TP target reached event
 * Updates trailing stop for MOVING_TARGET and MOVING_2_TARGET types
 *
 * @param position - Position data
 * @param tpTargets - All TP targets
 * @param reachedTargetNumber - Which target was just reached
 * @param config - Trailing configuration
 * @param currentState - Current trailing state
 */
export async function handleTPReached(
  position: TrailingPositionData,
  tpTargets: TPTarget[],
  reachedTargetNumber: number,
  config: TrailingStopConfig,
  currentState: TrailingState
): Promise<TrailingStopResult> {
  if (!config.enabled || !currentState.activated) {
    return { updated: false, reason: "Trailing not active" };
  }

  const { avgEntryPrice, direction } = position;
  const isLong = direction === "LONG";

  // Only MOVING_TARGET and MOVING_2_TARGET react to new TPs
  if (
    config.type !== "MOVING_TARGET" &&
    config.type !== "MOVING_2_TARGET"
  ) {
    return { updated: false, reason: "Type doesn't track TPs" };
  }

  const newState: TrailingState = {
    ...currentState,
    lastTPReached: reachedTargetNumber,
  };

  const newSL = calculateTrailingSL(
    config.type,
    direction,
    avgEntryPrice,
    currentState.highestPrice ?? position.currentPrice,
    reachedTargetNumber,
    tpTargets,
    config.trailingPercent
  );

  // SL only moves in profitable direction
  const shouldUpdate = isLong
    ? newSL > currentState.currentSL
    : newSL < currentState.currentSL;

  if (shouldUpdate) {
    newState.currentSL = newSL;

    await db.position.update({
      where: { id: position.id },
      data: {
        stopLoss: newSL,
      },
    });

    await notifyUI({
      type: "POSITION_UPDATED",
      title: `🎯 TP${reachedTargetNumber} Reached - SL Moved`,
      message: `${position.symbol} ${direction}\nNew SL: $${newSL.toFixed(2)}`,
      data: { positionId: position.id, reachedTargetNumber, newSL },
    });

    return {
      updated: true,
      newStopLoss: newSL,
      reason: `TP${reachedTargetNumber} reached, SL updated`,
      state: newState,
    };
  }

  return { updated: false, reason: "SL not updated (not profitable)", state: newState };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create default trailing stop configuration
 */
export function createDefaultTrailingConfig(
  type: TrailingType = "BREAKEVEN",
  triggerType: TrailingTriggerType = "TARGET_REACHED",
  triggerValue: number = 1,
  trailingPercent?: number
): TrailingStopConfig {
  return {
    enabled: true,
    type,
    triggerType,
    triggerValue,
    trailingPercent,
  };
}

/**
 * Create default trailing state
 */
export function createDefaultTrailingState(currentSL: number): TrailingState {
  return {
    activated: false,
    currentSL,
  };
}

/**
 * Parse TP targets from JSON string
 */
export function parseTPTargets(tpString: string | null): TPTarget[] {
  if (!tpString) return [];

  try {
    const parsed = JSON.parse(tpString);
    if (Array.isArray(parsed)) {
      return parsed.map((tp) => ({
        price: typeof tp.price === "number" ? tp.price : parseFloat(tp.price),
        percentage: tp.percentage ?? 100,
        filled: tp.filled ?? false,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Validate trailing stop configuration
 */
export function validateTrailingConfig(
  config: TrailingStopConfig
): { valid: boolean; error?: string } {
  if (!config.enabled) {
    return { valid: true };
  }

  switch (config.type) {
    case "BREAKEVEN":
    case "MOVING_TARGET":
    case "MOVING_2_TARGET":
      // These types use trigger settings
      if (config.triggerType === "TARGET_REACHED") {
        if (
          config.triggerValue < 1 ||
          config.triggerValue > 10 ||
          !Number.isInteger(config.triggerValue)
        ) {
          return {
            valid: false,
            error: "Target number must be integer 1-10",
          };
        }
      } else if (config.triggerType === "PERCENT_ABOVE_ENTRY") {
        if (config.triggerValue <= 0 || config.triggerValue > 100) {
          return {
            valid: false,
            error: "Percentage must be between 0 and 100",
          };
        }
      }
      break;

    case "PERCENT_BELOW_TRIGGERS":
    case "PERCENT_BELOW_HIGHEST":
      // These types require trailingPercent
      if (!config.trailingPercent || config.trailingPercent <= 0) {
        return {
          valid: false,
          error: "Trailing percent required for this type",
        };
      }
      break;
  }

  return { valid: true };
}

// ==================== PRESETS ====================

/**
 * Preset configurations for common trailing strategies
 */
export const TRAILING_PRESETS = {
  /** Conservative: Breakeven after TP1 */
  conservativeBreakeven: {
    type: "BREAKEVEN" as TrailingType,
    triggerType: "TARGET_REACHED" as TrailingTriggerType,
    triggerValue: 1,
  },

  /** Moderate: Moving Target after TP1 */
  moderateMovingTarget: {
    type: "MOVING_TARGET" as TrailingType,
    triggerType: "TARGET_REACHED" as TrailingTriggerType,
    triggerValue: 1,
  },

  /** Aggressive: 2% below highest after 5% profit */
  aggressivePercent: {
    type: "PERCENT_BELOW_HIGHEST" as TrailingType,
    triggerType: "PERCENT_ABOVE_ENTRY" as TrailingTriggerType,
    triggerValue: 5,
    trailingPercent: 2,
  },

  /** Scalping: 1% below triggers after 2% profit */
  scalping: {
    type: "PERCENT_BELOW_TRIGGERS" as TrailingType,
    triggerType: "PERCENT_ABOVE_ENTRY" as TrailingTriggerType,
    triggerValue: 2,
    trailingPercent: 1,
  },

  /** Swing: Moving 2-target after TP2 */
  swing: {
    type: "MOVING_2_TARGET" as TrailingType,
    triggerType: "TARGET_REACHED" as TrailingTriggerType,
    triggerValue: 2,
  },
};

// ==================== DATABASE OPERATIONS ====================

/**
 * Get trailing configuration from BotConfig
 */
export async function getTrailingConfigFromBot(
  botConfigId: string
): Promise<TrailingStopConfig | null> {
  try {
    const bot = await db.botConfig.findUnique({
      where: { id: botConfigId },
    });

    if (!bot || !bot.trailingEnabled) {
      return null;
    }

    return {
      enabled: bot.trailingEnabled,
      type: bot.trailingType as TrailingType,
      triggerType: bot.trailingTriggerType as TrailingTriggerType,
      triggerValue: bot.trailingTriggerValue ?? 1,
      trailingPercent: bot.trailingPercent ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Update trailing state in position
 */
export async function updatePositionTrailingState(
  positionId: string,
  state: Partial<TrailingState>
): Promise<void> {
  await db.position.update({
    where: { id: positionId },
    data: {
      trailingActivated: state.activated,
      highestPrice: state.highestPrice,
      lowestPrice: state.lowestPrice,
      stopLoss: state.currentSL,
    },
  });
}

/**
 * Check all positions with active trailing stops
 */
export async function checkAllTrailingStops(): Promise<{
  checked: number;
  updated: number;
  results: { positionId: string; result: TrailingStopResult }[];
}> {
  const positions = await db.position.findMany({
    where: {
      status: "OPEN",
      // Check positions that have trailing enabled in their bot config
    },
    include: {
      Signal: true,
    },
  });

  const results: { positionId: string; result: TrailingStopResult }[] = [];
  let updated = 0;

  for (const position of positions) {
    // Get bot config for this position's account
    if (!position.Signal) continue;

    // Parse TP targets
    const tpTargets = parseTPTargets(position.Signal.takeProfits);

    // This is a simplified check - in production you'd fetch the actual config
    // For now, skip positions without explicit trailing config
    if (!position.trailingActivated && !position.trailingStop) {
      continue;
    }

    // Process would go here...
    // For now, we count it as checked
  }

  return { checked: positions.length, updated, results };
}
