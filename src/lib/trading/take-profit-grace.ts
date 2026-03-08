/**
 * Take Profit Grace - Cornix-compatible feature
 * 
 * Increases the chances of TP order execution in low liquidity conditions.
 * 
 * How it works:
 * 1. When price reaches TP, bot attempts to execute order at original price
 * 2. If order is not filled or partially filled:
 *    - Original order is cancelled
 *    - New TP order is placed at a slightly worse price
 *    - For LONG: price BELOW original (lower %)
 *    - For SHORT: price ABOVE original (higher %)
 * 3. Repeats until:
 *    - Full execution OR
 *    - Maximum % cap reached
 */

/**
 * Configuration for Take Profit Grace feature
 */
export interface TakeProfitGraceConfig {
  enabled: boolean;
  maxCapPercent: number; // e.g., 0.5% maximum deviation from original price
  retryIntervalMs?: number; // Optional: interval between retries in milliseconds
}

/**
 * Represents a Take Profit order being tracked for grace retries
 */
export interface TPOrder {
  id: string; // Unique identifier for tracking
  originalPrice: number; // Original TP target price
  currentPrice: number; // Current retry price
  direction: 'LONG' | 'SHORT';
  filledAmount: number; // Amount already filled
  totalAmount: number; // Total amount to fill
  retryCount: number; // Number of retry attempts
  capReached: boolean; // Whether max cap has been reached
  symbol: string; // Trading pair symbol
  createdAt: Date; // When the order was created
  lastRetryAt?: Date; // Last retry timestamp
}

/**
 * Result of a grace retry attempt
 */
export interface TPGraceRetryResult {
  success: boolean;
  newPrice: number;
  shouldContinue: boolean; // Whether more retries are possible
  reason: string;
  priceAdjustment: number; // How much the price was adjusted
}

/**
 * Calculate the next retry price for a TP order
 * 
 * For LONG: Price goes DOWN (sell at a lower price is worse)
 * For SHORT: Price goes UP (buy back at a higher price is worse)
 * 
 * @param order - The current TP order state
 * @param config - Grace configuration
 * @param stepPercent - Price adjustment per retry (default: calculated dynamically)
 * @returns The new price for the next retry
 */
export function calculateNextTPPrice(
  order: TPOrder,
  config: TakeProfitGraceConfig,
  stepPercent: number = 0.1 // Default 0.1% per step
): number {
  const { originalPrice, direction } = order;
  const { maxCapPercent } = config;
  
  // Calculate price adjustment (step)
  const priceAdjustment = originalPrice * (stepPercent / 100);
  
  // Determine direction of adjustment
  // LONG: we want to SELL, so worse price is LOWER
  // SHORT: we want to BUY back, so worse price is HIGHER
  const adjustment = direction === 'LONG' 
    ? -priceAdjustment  // Lower price for LONG
    : priceAdjustment;   // Higher price for SHORT
  
  const newPrice = order.currentPrice + adjustment;
  
  // Calculate min/max price based on direction
  const minMaxPrice = calculateMinMaxPrice(originalPrice, direction, maxCapPercent);
  
  // Ensure we don't exceed the cap
  if (direction === 'LONG') {
    // For LONG, price can't go below minMaxPrice
    return Math.max(newPrice, minMaxPrice);
  } else {
    // For SHORT, price can't go above minMaxPrice
    return Math.min(newPrice, minMaxPrice);
  }
}

/**
 * Check if a retry should be attempted for a TP order
 * 
 * @param order - The current TP order state
 * @param config - Grace configuration
 * @returns Whether a retry should be attempted
 */
export function shouldRetryTP(
  order: TPOrder,
  config: TakeProfitGraceConfig
): boolean {
  // Check if grace is enabled
  if (!config.enabled) {
    return false;
  }
  
  // Check if already fully filled
  if (order.filledAmount >= order.totalAmount) {
    return false;
  }
  
  // Check if cap has been reached
  if (order.capReached) {
    return false;
  }
  
  // Check if current price is within the allowed range
  const minMaxPrice = calculateMinMaxPrice(
    order.originalPrice,
    order.direction,
    config.maxCapPercent
  );
  
  if (order.direction === 'LONG') {
    // For LONG, price can't go below minMaxPrice
    return order.currentPrice > minMaxPrice;
  } else {
    // For SHORT, price can't go above minMaxPrice
    return order.currentPrice < minMaxPrice;
  }
}

/**
 * Calculate the minimum/maximum allowed price based on cap
 * 
 * For LONG: returns the minimum price (floor)
 * For SHORT: returns the maximum price (ceiling)
 * 
 * @param originalPrice - Original TP target price
 * @param direction - Trade direction (LONG or SHORT)
 * @param maxCapPercent - Maximum allowed deviation percentage
 * @returns The price floor (LONG) or ceiling (SHORT)
 */
export function calculateMinMaxPrice(
  originalPrice: number,
  direction: 'LONG' | 'SHORT',
  maxCapPercent: number
): number {
  const maxAdjustment = originalPrice * (maxCapPercent / 100);
  
  if (direction === 'LONG') {
    // For LONG, minimum price is original - cap
    return originalPrice - maxAdjustment;
  } else {
    // For SHORT, maximum price is original + cap
    return originalPrice + maxAdjustment;
  }
}

/**
 * Execute a TP Grace retry and return the result
 * 
 * @param order - Current TP order state
 * @param config - Grace configuration
 * @param stepPercent - Price adjustment per retry
 * @returns Result of the retry attempt
 */
export function executeTPGraceRetry(
  order: TPOrder,
  config: TakeProfitGraceConfig,
  stepPercent: number = 0.1
): TPGraceRetryResult {
  // Check if retry is possible
  if (!shouldRetryTP(order, config)) {
    return {
      success: false,
      newPrice: order.currentPrice,
      shouldContinue: false,
      reason: order.capReached 
        ? 'Maximum price cap reached' 
        : 'Grace retry not allowed',
      priceAdjustment: 0
    };
  }
  
  // Calculate new price
  const newPrice = calculateNextTPPrice(order, config, stepPercent);
  const minMaxPrice = calculateMinMaxPrice(
    order.originalPrice,
    order.direction,
    config.maxCapPercent
  );
  
  // Check if this is the final retry (at or beyond cap)
  const capReached = order.direction === 'LONG'
    ? newPrice <= minMaxPrice
    : newPrice >= minMaxPrice;
  
  const priceAdjustment = Math.abs(newPrice - order.currentPrice);
  
  return {
    success: true,
    newPrice,
    shouldContinue: !capReached,
    reason: capReached 
      ? 'Final retry at maximum cap' 
      : `Retry #${order.retryCount + 1} at adjusted price`,
    priceAdjustment
  };
}

/**
 * Create a new TP order with grace tracking
 * 
 * @param id - Unique identifier
 * @param originalPrice - Original TP target price
 * @param direction - Trade direction
 * @param totalAmount - Total amount to fill
 * @param symbol - Trading pair symbol
 * @returns New TPOrder instance
 */
export function createTPOrder(
  id: string,
  originalPrice: number,
  direction: 'LONG' | 'SHORT',
  totalAmount: number,
  symbol: string
): TPOrder {
  return {
    id,
    originalPrice,
    currentPrice: originalPrice,
    direction,
    filledAmount: 0,
    totalAmount,
    retryCount: 0,
    capReached: false,
    symbol,
    createdAt: new Date()
  };
}

/**
 * Update TP order after a fill attempt
 * 
 * @param order - Current order state
 * @param filledAmount - Amount filled in this attempt
 * @param config - Grace configuration
 * @param stepPercent - Price step per retry
 * @returns Updated order and retry result
 */
export function updateTPOrderAfterFill(
  order: TPOrder,
  filledAmount: number,
  config: TakeProfitGraceConfig,
  stepPercent: number = 0.1
): { order: TPOrder; result: TPGraceRetryResult } {
  // Update filled amount
  const newFilledAmount = order.filledAmount + filledAmount;
  const isFullyFilled = newFilledAmount >= order.totalAmount;
  
  // If fully filled, no need for retry
  if (isFullyFilled) {
    return {
      order: {
        ...order,
        filledAmount: order.totalAmount,
        capReached: false // Successfully filled, cap not reached
      },
      result: {
        success: true,
        newPrice: order.currentPrice,
        shouldContinue: false,
        reason: 'Order fully filled',
        priceAdjustment: 0
      }
    };
  }
  
  // Calculate retry
  const retryResult = executeTPGraceRetry(order, config, stepPercent);
  
  // Update order state
  const updatedOrder: TPOrder = {
    ...order,
    filledAmount: newFilledAmount,
    currentPrice: retryResult.newPrice,
    retryCount: order.retryCount + 1,
    capReached: !retryResult.shouldContinue,
    lastRetryAt: new Date()
  };
  
  return { order: updatedOrder, result: retryResult };
}

/**
 * Calculate the effective price deviation from original
 * 
 * @param order - Current TP order state
 * @returns Deviation percentage (always positive)
 */
export function calculatePriceDeviation(order: TPOrder): number {
  const deviation = Math.abs(order.currentPrice - order.originalPrice);
  return (deviation / order.originalPrice) * 100;
}

/**
 * Get remaining unfilled amount
 * 
 * @param order - Current TP order state
 * @returns Unfilled amount
 */
export function getRemainingAmount(order: TPOrder): number {
  return Math.max(0, order.totalAmount - order.filledAmount);
}

/**
 * Calculate fill percentage
 * 
 * @param order - Current TP order state
 * @returns Fill percentage (0-100)
 */
export function getFillPercentage(order: TPOrder): number {
  return (order.filledAmount / order.totalAmount) * 100;
}

/**
 * Default TP Grace configuration
 */
export const DEFAULT_TP_GRACE_CONFIG: TakeProfitGraceConfig = {
  enabled: false,
  maxCapPercent: 0.5,
  retryIntervalMs: 1000 // 1 second default
};

/**
 * Validate TP Grace configuration
 * 
 * @param config - Configuration to validate
 * @returns Whether configuration is valid
 */
export function validateTPGraceConfig(config: TakeProfitGraceConfig): {
  valid: boolean;
  errors: string[]
} {
  const errors: string[] = [];
  
  if (config.maxCapPercent <= 0) {
    errors.push('maxCapPercent must be greater than 0');
  }
  
  if (config.maxCapPercent > 5) {
    errors.push('maxCapPercent should not exceed 5%');
  }
  
  if (config.retryIntervalMs !== undefined && config.retryIntervalMs < 100) {
    errors.push('retryIntervalMs should be at least 100ms');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
