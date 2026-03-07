/**
 * DCA Entry Strategy (Cornix-compatible)
 *
 * This module implements the Dollar-Cost Averaging entry strategy
 * with support for configurable amount scaling and price spacing.
 *
 * @see https://cornix.io - Reference implementation
 */

/**
 * DCA Entry Configuration
 */
export interface DCAEntryConfig {
  /** Percentage of total amount for first entry (null = equal distribution) */
  firstEntryPercent?: number | null;
  /** Multiplier between consecutive orders (e.g., 2 = double each order) */
  amountScale: number;
  /** Percentage price difference between 1st and 2nd order */
  priceDiff: number;
  /** Multiplier for price difference from 2nd order onwards */
  priceScale: number;
  /** Maximum percentage distance from first to last order */
  maxPriceDiff: number;
}

/**
 * Single DCA order with calculated price and amount
 */
export interface DCAOrder {
  /** Order index (0-based) */
  index: number;
  /** Price for this order */
  price: number;
  /** Amount in quote currency (USDT) */
  amount: number;
  /** Percentage of total amount */
  percentage: number;
}

/**
 * DCA Strategy calculation result
 */
export interface DCAStrategyResult {
  /** All calculated DCA orders */
  orders: DCAOrder[];
  /** Total amount across all orders */
  totalAmount: number;
  /** Average entry price */
  avgEntryPrice: number;
  /** Maximum price distance from first order */
  maxPriceDistance: number;
  /** Whether configuration is valid */
  valid: boolean;
  /** Any validation errors */
  errors: string[];
}

/**
 * Calculate all DCA orders based on configuration
 *
 * @example
 * ```typescript
 * const orders = calculateDCAOrders(
 *   100, // total amount USDT
 *   50000, // first entry price
 *   'LONG', // direction
 *   3, // max orders
 *   {
 *     firstEntryPercent: 14.28, // ~$10 for first order
 *     amountScale: 2, // double each order: $10, $20, $40 = $70
 *     priceDiff: 1, // 1% between orders
 *     priceScale: 2, // double the price diff from 2nd order
 *     maxPriceDiff: 10 // max 10% from first price
 *   }
 * );
 * // Result: [
 * //   { index: 0, price: 50000, amount: 10, percentage: 14.28 },
 * //   { index: 1, price: 49500, amount: 20, percentage: 28.57 },
 * //   { index: 2, price: 48510, amount: 40, percentage: 57.14 }
 * // ]
 * ```
 */
export function calculateDCAOrders(
  totalAmount: number,
  firstEntryPrice: number,
  direction: 'LONG' | 'SHORT',
  maxOrders: number,
  config: DCAEntryConfig
): DCAStrategyResult {
  const errors: string[] = [];

  // Validate inputs
  if (totalAmount <= 0) {
    errors.push('Total amount must be positive');
  }
  if (firstEntryPrice <= 0) {
    errors.push('First entry price must be positive');
  }
  if (maxOrders < 1 || maxOrders > 20) {
    errors.push('Max orders must be between 1 and 20');
  }
  if (config.amountScale < 0.1) {
    errors.push('Amount scale must be at least 0.1');
  }
  if (config.priceDiff < 0) {
    errors.push('Price difference cannot be negative');
  }
  if (config.priceScale < 0.1) {
    errors.push('Price scale must be at least 0.1');
  }

  if (errors.length > 0) {
    return {
      orders: [],
      totalAmount: 0,
      avgEntryPrice: 0,
      maxPriceDistance: 0,
      valid: false,
      errors,
    };
  }

  const orders: DCAOrder[] = [];

  // Calculate amounts
  const amounts = calculateDCAAmounts(totalAmount, maxOrders, config);

  // Calculate prices
  const prices = calculateDCAPrices(firstEntryPrice, direction, maxOrders, config);

  // Build orders
  for (let i = 0; i < maxOrders; i++) {
    orders.push({
      index: i,
      price: prices[i],
      amount: amounts[i],
      percentage: (amounts[i] / totalAmount) * 100,
    });
  }

  // Calculate statistics
  const calculatedTotal = orders.reduce((sum, o) => sum + o.amount, 0);
  const avgPrice = orders.reduce((sum, o) => sum + o.price * o.amount, 0) / calculatedTotal;
  const lastPrice = orders[orders.length - 1]?.price || firstEntryPrice;
  const maxDistance = Math.abs((firstEntryPrice - lastPrice) / firstEntryPrice) * 100;

  return {
    orders,
    totalAmount: calculatedTotal,
    avgEntryPrice: avgPrice,
    maxPriceDistance: maxDistance,
    valid: true,
    errors: [],
  };
}

/**
 * Calculate amounts for each DCA order
 *
 * Formula:
 * - If firstEntryPercent is set: first order = total * firstEntryPercent / 100
 * - Each subsequent order = previous * amountScale
 * - Remaining amount is distributed to remaining orders if needed
 */
function calculateDCAAmounts(
  totalAmount: number,
  maxOrders: number,
  config: DCAEntryConfig
): number[] {
  const amounts: number[] = [];

  if (config.firstEntryPercent && config.firstEntryPercent > 0) {
    // Use first entry percent
    const firstAmount = (totalAmount * config.firstEntryPercent) / 100;
    amounts.push(firstAmount);

    // Calculate remaining orders with amount scale
    let currentAmount = firstAmount;
    let usedAmount = firstAmount;

    for (let i = 1; i < maxOrders; i++) {
      currentAmount *= config.amountScale;
      usedAmount += currentAmount;
      amounts.push(currentAmount);
    }

    // Normalize to total amount (in case of overflow/underflow)
    const scaleFactor = totalAmount / usedAmount;
    for (let i = 0; i < amounts.length; i++) {
      amounts[i] *= scaleFactor;
    }
  } else {
    // Calculate with amount scale from equal distribution
    // Sum of geometric series: S = a * (r^n - 1) / (r - 1)
    // where a = first amount, r = amountScale, n = maxOrders

    if (config.amountScale === 1) {
      // Equal distribution
      const equalAmount = totalAmount / maxOrders;
      for (let i = 0; i < maxOrders; i++) {
        amounts.push(equalAmount);
      }
    } else {
      // Geometric series
      const r = config.amountScale;
      const n = maxOrders;
      // a = total * (r - 1) / (r^n - 1)
      const firstAmount = totalAmount * (r - 1) / (Math.pow(r, n) - 1);

      let currentAmount = firstAmount;
      for (let i = 0; i < maxOrders; i++) {
        amounts.push(currentAmount);
        currentAmount *= r;
      }
    }
  }

  return amounts;
}

/**
 * Calculate prices for each DCA order
 *
 * Price spacing logic (Cornix-compatible):
 * - Order 0: firstEntryPrice
 * - Order 1: firstEntryPrice * (1 - priceDiff/100) for LONG
 * - Order 2+: previousPrice * (1 - priceDiff * priceScale^(order-1) / 100) for LONG
 *
 * The price scale is applied from the 2nd order onwards.
 *
 * @example
 * With priceDiff=1, priceScale=2:
 * - Order 0: 100
 * - Order 1: 99 (100 - 1%)
 * - Order 2: 97.02 (99 - 2% = 99 * 0.98)
 * - Order 3: 91.28 (97.02 - 4% = 97.02 * 0.96)
 */
function calculateDCAPrices(
  firstEntryPrice: number,
  direction: 'LONG' | 'SHORT',
  maxOrders: number,
  config: DCAEntryConfig
): number[] {
  const prices: number[] = [firstEntryPrice];

  if (maxOrders === 1) {
    return prices;
  }

  const priceMultiplier = direction === 'LONG' ? -1 : 1;

  // Order 1: uses base priceDiff
  const secondPrice = firstEntryPrice * (1 + priceMultiplier * (config.priceDiff / 100));
  prices.push(secondPrice);

  // Orders 2+: price diff is scaled
  for (let i = 2; i < maxOrders; i++) {
    const prevPrice = prices[i - 1];
    // Price diff grows exponentially: priceDiff * priceScale^(i-1)
    const scaledDiff = config.priceDiff * Math.pow(config.priceScale, i - 1);

    // Check max price diff constraint
    const potentialPrice = prevPrice * (1 + priceMultiplier * (scaledDiff / 100));
    const distanceFromFirst = Math.abs((firstEntryPrice - potentialPrice) / firstEntryPrice) * 100;

    if (distanceFromFirst > config.maxPriceDiff) {
      // Cap at max price diff
      const cappedPrice = firstEntryPrice * (1 + priceMultiplier * (config.maxPriceDiff / 100));
      prices.push(cappedPrice);
    } else {
      prices.push(potentialPrice);
    }
  }

  return prices;
}

/**
 * Validate DCA configuration
 *
 * @returns Object with valid flag and array of error messages
 */
export function validateDCAConfig(config: DCAEntryConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // First entry percent validation
  if (config.firstEntryPercent !== null && config.firstEntryPercent !== undefined) {
    if (config.firstEntryPercent <= 0) {
      errors.push('First entry percent must be positive');
    }
    if (config.firstEntryPercent >= 100) {
      errors.push('First entry percent must be less than 100%');
    }
  }

  // Amount scale validation
  if (config.amountScale < 0.1) {
    errors.push('Amount scale must be at least 0.1');
  }
  if (config.amountScale > 10) {
    errors.push('Amount scale should not exceed 10 (recommended: 1-3)');
  }

  // Price diff validation
  if (config.priceDiff < 0) {
    errors.push('Price difference cannot be negative');
  }
  if (config.priceDiff > 50) {
    errors.push('Price difference should not exceed 50%');
  }

  // Price scale validation
  if (config.priceScale < 0.1) {
    errors.push('Price scale must be at least 0.1');
  }
  if (config.priceScale > 10) {
    errors.push('Price scale should not exceed 10');
  }

  // Max price diff validation
  if (config.maxPriceDiff <= 0) {
    errors.push('Max price difference must be positive');
  }
  if (config.maxPriceDiff > 50) {
    errors.push('Max price difference should not exceed 50%');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate the number of orders that fit within max price diff
 *
 * Useful for determining optimal order count given price constraints
 */
export function calculateMaxOrdersWithinRange(
  firstEntryPrice: number,
  direction: 'LONG' | 'SHORT',
  config: DCAEntryConfig,
  maxOrdersLimit: number = 20
): number {
  let count = 1;
  const priceMultiplier = direction === 'LONG' ? -1 : 1;

  if (maxOrdersLimit === 1) return 1;

  // Check if order 2 fits
  const secondPrice = firstEntryPrice * (1 + priceMultiplier * (config.priceDiff / 100));
  const distance2 = Math.abs((firstEntryPrice - secondPrice) / firstEntryPrice) * 100;

  if (distance2 > config.maxPriceDiff) {
    return 1;
  }
  count = 2;

  // Check subsequent orders
  let prevPrice = secondPrice;
  for (let i = 2; i < maxOrdersLimit; i++) {
    const scaledDiff = config.priceDiff * Math.pow(config.priceScale, i - 1);
    const nextPrice = prevPrice * (1 + priceMultiplier * (scaledDiff / 100));
    const distance = Math.abs((firstEntryPrice - nextPrice) / firstEntryPrice) * 100;

    if (distance > config.maxPriceDiff) {
      break;
    }
    count++;
    prevPrice = nextPrice;
  }

  return count;
}

/**
 * Generate a preview of DCA orders for UI display
 */
export function generateDCAPreview(
  totalAmount: number,
  firstEntryPrice: number,
  direction: 'LONG' | 'SHORT',
  maxOrders: number,
  config: DCAEntryConfig
): {
  orders: Array<{
    order: number;
    price: number;
    priceChange: string;
    amount: number;
    amountPercent: string;
    cumulative: string;
  }>;
  summary: {
    totalAmount: number;
    avgEntryPrice: number;
    maxDrawdown: string;
    orderCount: number;
  };
} {
  const result = calculateDCAOrders(totalAmount, firstEntryPrice, direction, maxOrders, config);

  let cumulative = 0;
  const previewOrders = result.orders.map((order, idx) => {
    cumulative += order.amount;
    const priceChange = idx === 0
      ? '0.00%'
      : `${((order.price - firstEntryPrice) / firstEntryPrice * 100).toFixed(2)}%`;

    return {
      order: idx + 1,
      price: order.price,
      priceChange,
      amount: order.amount,
      amountPercent: `${order.percentage.toFixed(2)}%`,
      cumulative: `$${cumulative.toFixed(2)}`,
    };
  });

  return {
    orders: previewOrders,
    summary: {
      totalAmount: result.totalAmount,
      avgEntryPrice: result.avgEntryPrice,
      maxDrawdown: `${result.maxPriceDistance.toFixed(2)}%`,
      orderCount: result.orders.length,
    },
  };
}

/**
 * Default DCA configurations for common use cases
 */
export const DCA_PRESETS = {
  /** Conservative: equal distribution, small steps */
  conservative: {
    firstEntryPercent: null,
    amountScale: 1,
    priceDiff: 0.5,
    priceScale: 1,
    maxPriceDiff: 5,
  },
  /** Moderate: slightly increasing amounts */
  moderate: {
    firstEntryPercent: 20,
    amountScale: 1.5,
    priceDiff: 1,
    priceScale: 1,
    maxPriceDiff: 10,
  },
  /** Aggressive: doubling amounts, wider price range */
  aggressive: {
    firstEntryPercent: 14.28, // 1/7 for martingale
    amountScale: 2,
    priceDiff: 1.5,
    priceScale: 1.5,
    maxPriceDiff: 15,
  },
  /** Martingale: classic doubling strategy */
  martingale: {
    firstEntryPercent: null,
    amountScale: 2,
    priceDiff: 2,
    priceScale: 1,
    maxPriceDiff: 20,
  },
} as const;

export type DCAPresetName = keyof typeof DCA_PRESETS;
