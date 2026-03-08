/**
 * LIQUIDATION PROTECTION MODULE
 *
 * Comprehensive liquidation protection for CITARION trading platform.
 * Calculates accurate liquidation prices across multiple exchanges and validates
 * margin safety to prevent premature liquidations.
 *
 * Supported Exchanges: Binance, Bybit, OKX, Bitget
 * Margin Modes: Isolated, Cross
 */

// =============================================================================
// TYPES
// =============================================================================

export type Exchange = 'binance' | 'bybit' | 'okx' | 'bitget';
export type MarginMode = 'isolated' | 'cross';
export type PositionSide = 'long' | 'short';

/**
 * Position parameters for liquidation calculations
 */
export interface PositionParams {
  /** Entry price of the position */
  entryPrice: number;
  /** Position size in base currency (e.g., BTC) */
  positionSize: number;
  /** Leverage multiplier (e.g., 10 for 10x) */
  leverage: number;
  /** Account balance in quote currency (e.g., USDT) */
  accountBalance: number;
  /** Margin mode: isolated or cross */
  marginMode: MarginMode;
  /** Position side: long or short */
  side: PositionSide;
  /** Maintenance margin rate (exchange-specific, defaults will be used if not provided) */
  maintenanceMarginRate?: number;
  /** Maintenance amount (exchange-specific, for tiered margin) */
  maintenanceAmount?: number;
  /** Current mark price (optional, for real-time calculations) */
  markPrice?: number;
  /** Symbol being traded (e.g., 'BTCUSDT') */
  symbol?: string;
}

/**
 * Exchange-specific maintenance margin configuration
 */
export interface MaintenanceMarginConfig {
  /** Base maintenance margin rate */
  baseRate: number;
  /** Tiered margin rates (notional -> rate) */
  tiers?: Array<{
    maxNotional: number;
    rate: number;
    maintenanceAmount: number;
  }>;
}

/**
 * Result of liquidation price calculation
 */
export interface LiquidationResult {
  /** Calculated liquidation price */
  liquidationPrice: number;
  /** Exchange used for calculation */
  exchange: Exchange;
  /** Margin mode */
  marginMode: MarginMode;
  /** Maintenance margin rate used */
  maintenanceMarginRate: number;
  /** Initial margin amount */
  initialMargin: number;
  /** Maintenance margin amount */
  maintenanceMargin: number;
  /** Distance to liquidation from entry price (percentage) */
  distanceFromEntry: number;
  /** Whether the position is at risk */
  isAtRisk: boolean;
  /** Risk level (0-100) */
  riskLevel: number;
  /** Timestamp of calculation */
  timestamp: number;
}

/**
 * Validation result for margin safety
 */
export interface ValidationResult {
  /** Whether the trade passes safety validation */
  isValid: boolean;
  /** Distance to liquidation in percentage */
  distanceToLiquidation: number;
  /** Required minimum buffer percentage */
  requiredBuffer: number;
  /** Actual buffer percentage */
  actualBuffer: number;
  /** Whether buffer is sufficient */
  bufferSufficient: boolean;
  /** Risk level (0-100) */
  riskLevel: number;
  /** ATR value used */
  atrValue: number;
  /** ATR-based buffer percentage */
  atrBufferPercent: number;
  /** Warning messages */
  warnings: string[];
  /** Error messages if validation fails */
  errors: string[];
  /** Suggestions for safer trading */
  suggestions: string[];
  /** Liquidation price */
  liquidationPrice: number;
  /** Current price */
  currentPrice: number;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// EXCHANGE-SPECIFIC MAINTENANCE MARGIN RATES
// =============================================================================

/**
 * Default maintenance margin rates by exchange
 * These are approximate rates - actual rates vary by symbol and position size
 */
const DEFAULT_MAINTENANCE_RATES: Record<Exchange, number> = {
  binance: 0.004, // 0.4% typical for BTC
  bybit: 0.005,   // 0.5% typical
  okx: 0.005,     // 0.5% typical
  bitget: 0.005,  // 0.5% typical
};

/**
 * Tiered maintenance margin configurations by exchange
 * Simplified tier structure for common trading pairs
 */
const MAINTENANCE_MARGIN_TIERS: Record<Exchange, MaintenanceMarginConfig> = {
  binance: {
    baseRate: 0.004,
    tiers: [
      { maxNotional: 50000, rate: 0.004, maintenanceAmount: 0 },
      { maxNotional: 250000, rate: 0.005, maintenanceAmount: 50 },
      { maxNotional: 1000000, rate: 0.01, maintenanceAmount: 1300 },
      { maxNotional: 5000000, rate: 0.025, maintenanceAmount: 16300 },
      { maxNotional: 10000000, rate: 0.05, maintenanceAmount: 141300 },
      { maxNotional: Infinity, rate: 0.1, maintenanceAmount: 641300 },
    ],
  },
  bybit: {
    baseRate: 0.005,
    tiers: [
      { maxNotional: 100000, rate: 0.005, maintenanceAmount: 0 },
      { maxNotional: 500000, rate: 0.01, maintenanceAmount: 500 },
      { maxNotional: 2000000, rate: 0.015, maintenanceAmount: 3000 },
      { maxNotional: 10000000, rate: 0.025, maintenanceAmount: 23000 },
      { maxNotional: Infinity, rate: 0.05, maintenanceAmount: 273000 },
    ],
  },
  okx: {
    baseRate: 0.005,
    tiers: [
      { maxNotional: 100000, rate: 0.005, maintenanceAmount: 0 },
      { maxNotional: 500000, rate: 0.01, maintenanceAmount: 500 },
      { maxNotional: 2000000, rate: 0.015, maintenanceAmount: 3000 },
      { maxNotional: 10000000, rate: 0.025, maintenanceAmount: 23000 },
      { maxNotional: Infinity, rate: 0.05, maintenanceAmount: 273000 },
    ],
  },
  bitget: {
    baseRate: 0.005,
    tiers: [
      { maxNotional: 100000, rate: 0.005, maintenanceAmount: 0 },
      { maxNotional: 500000, rate: 0.01, maintenanceAmount: 500 },
      { maxNotional: 2000000, rate: 0.015, maintenanceAmount: 3000 },
      { maxNotional: Infinity, rate: 0.025, maintenanceAmount: 23000 },
    ],
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get maintenance margin rate and amount based on notional value
 */
function getMaintenanceMarginForNotional(
  exchange: Exchange,
  notional: number
): { rate: number; maintenanceAmount: number } {
  const config = MAINTENANCE_MARGIN_TIERS[exchange];
  
  if (!config.tiers || config.tiers.length === 0) {
    return { rate: config.baseRate, maintenanceAmount: 0 };
  }

  for (const tier of config.tiers) {
    if (notional <= tier.maxNotional) {
      return { rate: tier.rate, maintenanceAmount: tier.maintenanceAmount };
    }
  }

  // Fallback to highest tier
  const lastTier = config.tiers[config.tiers.length - 1];
  return { rate: lastTier.rate, maintenanceAmount: lastTier.maintenanceAmount };
}

/**
 * Calculate notional value of position
 */
function calculateNotional(positionSize: number, price: number): number {
  return Math.abs(positionSize * price);
}

/**
 * Round price to appropriate precision
 */
function roundPrice(price: number, precision: number = 2): number {
  return Math.round(price * Math.pow(10, precision)) / Math.pow(10, precision);
}

// =============================================================================
// EXCHANGE-SPECIFIC LIQUIDATION PRICE CALCULATIONS
// =============================================================================

/**
 * Calculate liquidation price for Binance
 * 
 * ISOLATED MARGIN:
 * Long: LiqPrice = EntryPrice * (1 - InitialMarginRate + MaintenanceMarginRate)
 * Short: LiqPrice = EntryPrice * (1 + InitialMarginRate - MaintenanceMarginRate)
 * 
 * CROSS MARGIN:
 * LiqPrice = (AccountBalance + PositionValue - MaintenanceMargin) / PositionSize
 * 
 * With tiered margin:
 * LiqPrice = (WalletBalance - MaintenanceAmount) / (PositionSize * MaintenanceMarginRate - PositionSize)
 */
function calculateBinanceLiquidation(
  params: PositionParams,
  notional: number
): number {
  const { entryPrice, positionSize, leverage, accountBalance, marginMode, side } = params;
  const { rate: mmr, maintenanceAmount: mm } = getMaintenanceMarginForNotional('binance', notional);
  
  const initialMarginRate = 1 / leverage;
  const absSize = Math.abs(positionSize);
  
  if (marginMode === 'isolated') {
    // Binance isolated margin formula
    if (side === 'long') {
      // For long: liquidation happens when price drops
      // LiqPrice = EntryPrice * (1 - InitialMarginRate + MMR) - (MM / PositionSize)
      const liqPrice = entryPrice * (1 - initialMarginRate + mmr) - (mm / absSize);
      return Math.max(0, liqPrice);
    } else {
      // For short: liquidation happens when price rises
      // LiqPrice = EntryPrice * (1 + InitialMarginRate - MMR) + (MM / PositionSize)
      const liqPrice = entryPrice * (1 + initialMarginRate - mmr) + (mm / absSize);
      return liqPrice;
    }
  } else {
    // Cross margin - considers entire account balance
    // For long:
    // LiqPrice = (WalletBalance + PositionValue - MM) / (PositionSize * (1 - MMR))
    // For short:
    // LiqPrice = (WalletBalance - PositionValue + MM) / (PositionSize * (1 + MMR))
    
    if (side === 'long') {
      const numerator = accountBalance - mm;
      const denominator = absSize * (1 - mmr);
      if (denominator <= 0) return 0;
      const liqPrice = numerator / denominator;
      return Math.max(0, liqPrice);
    } else {
      const numerator = accountBalance + mm;
      const denominator = absSize * (1 + mmr);
      if (denominator <= 0) return Infinity;
      const liqPrice = numerator / denominator;
      return liqPrice;
    }
  }
}

/**
 * Calculate liquidation price for Bybit
 * 
 * ISOLATED MARGIN:
 * Long: LiqPrice = EntryPrice * (1 - 1/Leverage + MMR) - (MM / PositionSize)
 * Short: LiqPrice = EntryPrice * (1 + 1/Leverage - MMR) + (MM / PositionSize)
 * 
 * CROSS MARGIN:
 * Uses total account balance minus other positions' margins
 */
function calculateBybitLiquidation(
  params: PositionParams,
  notional: number
): number {
  const { entryPrice, positionSize, leverage, accountBalance, marginMode, side } = params;
  const { rate: mmr, maintenanceAmount: mm } = getMaintenanceMarginForNotional('bybit', notional);
  
  const initialMarginRate = 1 / leverage;
  const absSize = Math.abs(positionSize);
  
  if (marginMode === 'isolated') {
    if (side === 'long') {
      const liqPrice = entryPrice * (1 - initialMarginRate + mmr) - (mm / absSize);
      return Math.max(0, liqPrice);
    } else {
      const liqPrice = entryPrice * (1 + initialMarginRate - mmr) + (mm / absSize);
      return liqPrice;
    }
  } else {
    // Cross margin
    // Bybit uses similar formula to Binance for cross margin
    if (side === 'long') {
      const numerator = accountBalance - mm;
      const denominator = absSize * (1 - mmr);
      if (denominator <= 0) return 0;
      const liqPrice = numerator / denominator;
      return Math.max(0, liqPrice);
    } else {
      const numerator = accountBalance + mm;
      const denominator = absSize * (1 + mmr);
      if (denominator <= 0) return Infinity;
      const liqPrice = numerator / denominator;
      return liqPrice;
    }
  }
}

/**
 * Calculate liquidation price for OKX
 * 
 * OKX uses a slightly different formula with their "maintenance margin ratio"
 * 
 * ISOLATED MARGIN:
 * Long: LiqPrice = AvgEntryPrice * (1 - InitialMarginRatio + MMR)
 * Short: LiqPrice = AvgEntryPrice * (1 + InitialMarginRatio - MMR)
 * 
 * CROSS MARGIN:
 * More complex calculation involving total equity and all positions
 */
function calculateOKXLiquidation(
  params: PositionParams,
  notional: number
): number {
  const { entryPrice, positionSize, leverage, accountBalance, marginMode, side } = params;
  const { rate: mmr, maintenanceAmount: mm } = getMaintenanceMarginForNotional('okx', notional);
  
  const initialMarginRate = 1 / leverage;
  const absSize = Math.abs(positionSize);
  
  // OKX adds additional buffer for cross margin
  const okxCrossBuffer = 0.01; // 1% additional buffer
  
  if (marginMode === 'isolated') {
    if (side === 'long') {
      const liqPrice = entryPrice * (1 - initialMarginRate + mmr) - (mm / absSize);
      return Math.max(0, liqPrice);
    } else {
      const liqPrice = entryPrice * (1 + initialMarginRate - mmr) + (mm / absSize);
      return liqPrice;
    }
  } else {
    // Cross margin with OKX-specific buffer
    if (side === 'long') {
      const numerator = accountBalance * (1 - okxCrossBuffer) - mm;
      const denominator = absSize * (1 - mmr);
      if (denominator <= 0) return 0;
      const liqPrice = numerator / denominator;
      return Math.max(0, liqPrice);
    } else {
      const numerator = accountBalance * (1 - okxCrossBuffer) + mm;
      const denominator = absSize * (1 + mmr);
      if (denominator <= 0) return Infinity;
      const liqPrice = numerator / denominator;
      return liqPrice;
    }
  }
}

/**
 * Calculate liquidation price for Bitget
 * 
 * Similar to other exchanges but with Bitget-specific maintenance margin rates
 */
function calculateBitgetLiquidation(
  params: PositionParams,
  notional: number
): number {
  const { entryPrice, positionSize, leverage, accountBalance, marginMode, side } = params;
  const { rate: mmr, maintenanceAmount: mm } = getMaintenanceMarginForNotional('bitget', notional);
  
  const initialMarginRate = 1 / leverage;
  const absSize = Math.abs(positionSize);
  
  // Bitget uses similar formulas to Binance
  if (marginMode === 'isolated') {
    if (side === 'long') {
      const liqPrice = entryPrice * (1 - initialMarginRate + mmr) - (mm / absSize);
      return Math.max(0, liqPrice);
    } else {
      const liqPrice = entryPrice * (1 + initialMarginRate - mmr) + (mm / absSize);
      return liqPrice;
    }
  } else {
    // Cross margin
    if (side === 'long') {
      const numerator = accountBalance - mm;
      const denominator = absSize * (1 - mmr);
      if (denominator <= 0) return 0;
      const liqPrice = numerator / denominator;
      return Math.max(0, liqPrice);
    } else {
      const numerator = accountBalance + mm;
      const denominator = absSize * (1 + mmr);
      if (denominator <= 0) return Infinity;
      const liqPrice = numerator / denominator;
      return liqPrice;
    }
  }
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Calculate liquidation price for a position
 * 
 * @param position - Position parameters
 * @param exchange - Exchange name (binance, bybit, okx, bitget)
 * @returns Detailed liquidation result
 * 
 * @example
 * ```typescript
 * const result = calculateLiquidationPrice({
 *   entryPrice: 50000,
 *   positionSize: 0.1,
 *   leverage: 10,
 *   accountBalance: 5000,
 *   marginMode: 'isolated',
 *   side: 'long'
 * }, 'binance');
 * console.log(result.liquidationPrice); // ~45200
 * ```
 */
export function calculateLiquidationPrice(
  position: PositionParams,
  exchange: Exchange
): LiquidationResult {
  const { entryPrice, positionSize, leverage, marginMode, side } = position;
  
  // Calculate notional value
  const notional = calculateNotional(positionSize, entryPrice);
  
  // Get exchange-specific calculation
  let liquidationPrice: number;
  
  switch (exchange) {
    case 'binance':
      liquidationPrice = calculateBinanceLiquidation(position, notional);
      break;
    case 'bybit':
      liquidationPrice = calculateBybitLiquidation(position, notional);
      break;
    case 'okx':
      liquidationPrice = calculateOKXLiquidation(position, notional);
      break;
    case 'bitget':
      liquidationPrice = calculateBitgetLiquidation(position, notional);
      break;
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
  
  // Round to reasonable precision
  liquidationPrice = roundPrice(liquidationPrice, 4);
  
  // Calculate maintenance margin rate used
  const { rate: mmr } = getMaintenanceMarginForNotional(exchange, notional);
  
  // Calculate initial and maintenance margin
  const initialMargin = notional / leverage;
  const maintenanceMargin = notional * mmr;
  
  // Calculate distance from entry
  const distanceFromEntry = getDistanceToLiquidation(entryPrice, liquidationPrice, side);
  
  // Determine risk level (0-100)
  // Risk level increases as distance to liquidation decreases
  const riskLevel = Math.min(100, Math.max(0, 100 - distanceFromEntry * 2));
  
  // Position is at risk if distance is less than 10%
  const isAtRisk = distanceFromEntry < 10;
  
  return {
    liquidationPrice,
    exchange,
    marginMode,
    maintenanceMarginRate: mmr,
    initialMargin,
    maintenanceMargin,
    distanceFromEntry,
    isAtRisk,
    riskLevel,
    timestamp: Date.now(),
  };
}

/**
 * Get distance to liquidation as percentage
 * 
 * @param currentPrice - Current market price
 * @param liquidationPrice - Calculated liquidation price
 * @param side - Position side (long or short)
 * @returns Distance percentage
 * 
 * @example
 * ```typescript
 * // For a long position
 * getDistanceToLiquidation(50000, 45000, 'long'); // Returns 10 (10%)
 * 
 * // For a short position
 * getDistanceToLiquidation(50000, 55000, 'short'); // Returns 10 (10%)
 * ```
 */
export function getDistanceToLiquidation(
  currentPrice: number,
  liquidationPrice: number,
  side: PositionSide
): number {
  if (currentPrice <= 0 || liquidationPrice <= 0) {
    return 0;
  }
  
  if (side === 'long') {
    // For long: liquidation is below current price
    // Distance = (current - liquidation) / current * 100
    if (liquidationPrice >= currentPrice) {
      return 0; // Already at or past liquidation
    }
    return ((currentPrice - liquidationPrice) / currentPrice) * 100;
  } else {
    // For short: liquidation is above current price
    // Distance = (liquidation - current) / current * 100
    if (liquidationPrice <= currentPrice) {
      return 0; // Already at or past liquidation
    }
    return ((liquidationPrice - currentPrice) / currentPrice) * 100;
  }
}

/**
 * Validate margin safety for a position
 * 
 * Checks if the position has sufficient buffer from liquidation,
 * considering ATR-based volatility and minimum buffer requirements.
 * 
 * @param position - Position parameters
 * @param atr - ATR (Average True Range) value
 * @param minBufferPercent - Minimum required buffer percentage (default: 5%)
 * @param exchange - Exchange name (default: 'binance')
 * @returns Validation result with safety assessment
 * 
 * @example
 * ```typescript
 * const result = validateMarginSafety({
 *   entryPrice: 50000,
 *   positionSize: 0.1,
 *   leverage: 10,
 *   accountBalance: 5000,
 *   marginMode: 'isolated',
 *   side: 'long'
 * }, 1500, 5, 'binance');
 * 
 * if (!result.isValid) {
 *   console.log('Trade rejected:', result.errors);
 * }
 * ```
 */
export function validateMarginSafety(
  position: PositionParams,
  atr: number,
  minBufferPercent: number = 5,
  exchange: Exchange = 'binance'
): ValidationResult {
  const currentPrice = position.markPrice || position.entryPrice;
  const warnings: string[] = [];
  const errors: string[] = [];
  const suggestions: string[] = [];
  
  // Calculate liquidation price
  const liqResult = calculateLiquidationPrice(position, exchange);
  const liquidationPrice = liqResult.liquidationPrice;
  
  // Calculate distance to liquidation
  const distanceToLiquidation = getDistanceToLiquidation(
    currentPrice,
    liquidationPrice,
    position.side
  );
  
  // Calculate ATR-based buffer
  // ATR as percentage of current price
  const atrPercent = (atr / currentPrice) * 100;
  
  // ATR buffer should be at least 2x ATR to account for volatility spikes
  const atrBufferPercent = atrPercent * 2;
  
  // Use the higher of minBufferPercent and ATR-based buffer
  const requiredBuffer = Math.max(minBufferPercent, atrBufferPercent);
  
  // Calculate actual buffer
  const actualBuffer = distanceToLiquidation;
  const bufferSufficient = actualBuffer >= requiredBuffer;
  
  // Calculate risk level
  const riskLevel = Math.min(100, Math.max(0, 
    100 - (actualBuffer / requiredBuffer) * 50
  ));
  
  // Generate warnings and errors
  if (distanceToLiquidation < 3) {
    errors.push('CRITICAL: Position is extremely close to liquidation (< 3%)');
    suggestions.push('Consider reducing position size or leverage immediately');
    suggestions.push('Add more margin to the position');
  } else if (distanceToLiquidation < 5) {
    errors.push('HIGH RISK: Position is dangerously close to liquidation (< 5%)');
    suggestions.push('Reduce position size or increase margin');
  } else if (distanceToLiquidation < 10) {
    warnings.push('WARNING: Position is within 10% of liquidation');
    suggestions.push('Monitor position closely and consider adjusting leverage');
  }
  
  if (!bufferSufficient) {
    const bufferDeficit = requiredBuffer - actualBuffer;
    errors.push(
      `Insufficient margin buffer: ${actualBuffer.toFixed(2)}% actual vs ${requiredBuffer.toFixed(2)}% required`
    );
    errors.push(`Buffer deficit: ${bufferDeficit.toFixed(2)}%`);
    
    // Calculate suggested adjustments
    const suggestedLeverage = Math.floor(
      position.leverage * (actualBuffer / requiredBuffer)
    );
    if (suggestedLeverage < position.leverage && suggestedLeverage > 0) {
      suggestions.push(
        `Consider reducing leverage from ${position.leverage}x to ${suggestedLeverage}x`
      );
    }
    
    const suggestedSize = position.positionSize * (actualBuffer / requiredBuffer);
    if (suggestedSize < position.positionSize && suggestedSize > 0) {
      suggestions.push(
        `Or reduce position size from ${position.positionSize.toFixed(4)} to ${suggestedSize.toFixed(4)}`
      );
    }
  }
  
  // Check for high leverage warning
  if (position.leverage > 20) {
    warnings.push(`High leverage detected: ${position.leverage}x`);
    suggestions.push('High leverage significantly increases liquidation risk');
  }
  
  // Check if margin mode affects risk
  if (position.marginMode === 'cross') {
    warnings.push('Cross margin mode: Account balance is at risk for all positions');
    suggestions.push('Consider isolated margin to limit risk to individual positions');
  }
  
  // Add ATR-based warning if volatility is high
  if (atrPercent > 5) {
    warnings.push(`High volatility detected: ATR is ${atrPercent.toFixed(2)}% of price`);
    suggestions.push('Consider wider stops or reduced position size during high volatility');
  }
  
  // Determine if trade is valid
  const isValid = bufferSufficient && distanceToLiquidation >= minBufferPercent;
  
  return {
    isValid,
    distanceToLiquidation,
    requiredBuffer,
    actualBuffer,
    bufferSufficient,
    riskLevel,
    atrValue: atr,
    atrBufferPercent,
    warnings,
    errors,
    suggestions,
    liquidationPrice,
    currentPrice,
    timestamp: Date.now(),
  };
}

// =============================================================================
// ADDITIONAL UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate the maximum safe leverage for a position
 * given a required buffer percentage
 * 
 * @param entryPrice - Entry price
 * @param atr - ATR value for volatility consideration
 * @param requiredBufferPercent - Required buffer from liquidation
 * @param exchange - Exchange name
 * @returns Maximum recommended leverage
 */
export function calculateMaxSafeLeverage(
  entryPrice: number,
  atr: number,
  requiredBufferPercent: number = 10,
  exchange: Exchange = 'binance'
): number {
  const mmr = DEFAULT_MAINTENANCE_RATES[exchange];
  const atrPercent = (atr / entryPrice) * 100;
  
  // Buffer must account for both required buffer and ATR volatility
  const totalBufferNeeded = Math.max(requiredBufferPercent, atrPercent * 2);
  
  // For isolated margin long position:
  // LiqPrice = EntryPrice * (1 - 1/Leverage + MMR)
  // Distance = (EntryPrice - LiqPrice) / EntryPrice = 1/Leverage - MMR
  // TotalBufferNeeded = 1/Leverage - MMR
  // 1/Leverage = TotalBufferNeeded + MMR
  // Leverage = 1 / (TotalBufferNeeded + MMR)
  
  const leverage = 1 / ((totalBufferNeeded / 100) + mmr);
  
  // Round down to nearest integer and cap at 125 (typical max)
  return Math.min(125, Math.max(1, Math.floor(leverage)));
}

/**
 * Calculate required margin to achieve a target liquidation distance
 * 
 * @param position - Position parameters
 * @param targetDistancePercent - Target distance from liquidation
 * @param exchange - Exchange name
 * @returns Required additional margin
 */
export function calculateRequiredMargin(
  position: PositionParams,
  targetDistancePercent: number,
  exchange: Exchange = 'binance'
): number {
  const currentLiq = calculateLiquidationPrice(position, exchange);
  const currentDistance = getDistanceToLiquidation(
    position.entryPrice,
    currentLiq.liquidationPrice,
    position.side
  );
  
  if (currentDistance >= targetDistancePercent) {
    return 0; // Already have sufficient buffer
  }
  
  const notional = calculateNotional(position.positionSize, position.entryPrice);
  const mmr = currentLiq.maintenanceMarginRate;
  
  // For isolated margin:
  // TargetDistance = (EntryPrice - TargetLiqPrice) / EntryPrice * 100
  // TargetLiqPrice = EntryPrice * (1 - TargetDistance/100)
  // TargetLiqPrice = EntryPrice * (1 - 1/NewLeverage + MMR)
  // 1 - TargetDistance/100 = 1 - 1/NewLeverage + MMR
  // 1/NewLeverage = TargetDistance/100 + MMR
  // NewLeverage = 1 / (TargetDistance/100 + MMR)
  
  const newLeverage = 1 / ((targetDistancePercent / 100) + mmr);
  const newInitialMargin = notional / newLeverage;
  const currentInitialMargin = notional / position.leverage;
  
  return Math.max(0, newInitialMargin - currentInitialMargin);
}

/**
 * Get liquidation risk summary for a portfolio
 * 
 * @param positions - Array of position parameters
 * @param exchange - Exchange name
 * @returns Portfolio risk summary
 */
export function getPortfolioLiquidationRisk(
  positions: PositionParams[],
  exchange: Exchange = 'binance'
): {
  totalExposure: number;
  weightedRiskLevel: number;
  positionsAtRisk: number;
  criticalPositions: number;
  details: Array<{
    index: number;
    liquidationPrice: number;
    distanceToLiquidation: number;
    riskLevel: number;
    isAtRisk: boolean;
  }>;
} {
  if (positions.length === 0) {
    return {
      totalExposure: 0,
      weightedRiskLevel: 0,
      positionsAtRisk: 0,
      criticalPositions: 0,
      details: [],
    };
  }
  
  let totalExposure = 0;
  let weightedRiskSum = 0;
  let positionsAtRisk = 0;
  let criticalPositions = 0;
  const details: Array<{
    index: number;
    liquidationPrice: number;
    distanceToLiquidation: number;
    riskLevel: number;
    isAtRisk: boolean;
  }> = [];
  
  positions.forEach((position, index) => {
    const liqResult = calculateLiquidationPrice(position, exchange);
    const notional = calculateNotional(position.positionSize, position.entryPrice);
    
    totalExposure += notional;
    weightedRiskSum += liqResult.riskLevel * notional;
    
    if (liqResult.isAtRisk) {
      positionsAtRisk++;
      if (liqResult.distanceFromEntry < 5) {
        criticalPositions++;
      }
    }
    
    details.push({
      index,
      liquidationPrice: liqResult.liquidationPrice,
      distanceToLiquidation: liqResult.distanceFromEntry,
      riskLevel: liqResult.riskLevel,
      isAtRisk: liqResult.isAtRisk,
    });
  });
  
  return {
    totalExposure,
    weightedRiskLevel: totalExposure > 0 ? weightedRiskSum / totalExposure : 0,
    positionsAtRisk,
    criticalPositions,
    details,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  calculateLiquidationPrice,
  getDistanceToLiquidation,
  validateMarginSafety,
  calculateMaxSafeLeverage,
  calculateRequiredMargin,
  getPortfolioLiquidationRisk,
};
