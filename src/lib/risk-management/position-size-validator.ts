/**
 * Position Size Validator
 * 
 * Risk-based position sizing with multiple strategies:
 * 1. Fixed Fractional - Risk fixed % of account per trade
 * 2. Kelly Criterion - Mathematically optimal sizing
 * 3. Volatility-Adjusted - Adjust for market volatility (ATR)
 * 4. Risk Parity - Equal risk contribution across positions
 * 5. Max Drawdown Limit - Limit based on drawdown tolerance
 * 
 * Also validates against:
 * - Account balance limits
 * - Exchange minimum/maximum order sizes
 * - Leverage limits
 * - Maximum position count
 * - Correlation constraints
 */

// ==================== TYPES ====================

export interface PositionSizeConfig {
  /** Default risk method */
  defaultMethod: PositionSizingMethod;
  
  /** Fixed fractional risk percentage (e.g., 0.02 = 2%) */
  fixedFractionalRisk: number;
  
  /** Kelly criterion fraction (0.5 = half Kelly) */
  kellyFraction: number;
  
  /** Maximum position size as % of portfolio */
  maxPositionPercent: number;
  
  /** Maximum total exposure as % of portfolio */
  maxTotalExposurePercent: number;
  
  /** Maximum number of open positions */
  maxOpenPositions: number;
  
  /** Minimum risk-reward ratio */
  minRiskRewardRatio: number;
  
  /** Default leverage for futures */
  defaultLeverage: number;
  
  /** Maximum allowed leverage */
  maxLeverage: number;
  
  /** ATR multiplier for stop loss */
  atrStopLossMultiplier: number;
  
  /** Volatility scaling factor */
  volatilityScalingFactor: number;
  
  /** Enable correlation-based adjustment */
  enableCorrelationAdjustment: boolean;
  
  /** Maximum correlation between positions */
  maxCorrelation: number;
  
  /** Minimum order size USDT */
  minOrderSize: number;
  
  /** Maximum order size USDT */
  maxOrderSize: number;
}

export type PositionSizingMethod = 
  | 'FIXED_FRACTIONAL'
  | 'KELLY_CRITERION'
  | 'VOLATILITY_ADJUSTED'
  | 'RISK_PARITY'
  | 'FIXED_AMOUNT';

export interface SizingInput {
  /** Account balance */
  accountBalance: number;
  
  /** Available margin */
  availableMargin: number;
  
  /** Entry price */
  entryPrice: number;
  
  /** Stop loss price */
  stopLossPrice?: number;
  
  /** Take profit price */
  takeProfitPrice?: number;
  
  /** ATR value */
  atr?: number;
  
  /** Symbol */
  symbol: string;
  
  /** Direction */
  direction: 'LONG' | 'SHORT';
  
  /** Exchange ID */
  exchange: string;
  
  /** Historical win rate (for Kelly) */
  winRate?: number;
  
  /** Historical average win/loss ratio (for Kelly) */
  winLossRatio?: number;
  
  /** Current open positions */
  openPositions?: OpenPositionInfo[];
  
  /** Leverage setting */
  leverage?: number;
  
  /** Risk method override */
  method?: PositionSizingMethod;
  
  /** Custom risk percentage override */
  customRiskPercent?: number;
}

export interface OpenPositionInfo {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  risk: number;
}

export interface SizingResult {
  /** Calculated position size in base currency */
  positionSize: number;
  
  /** Position size in quote currency (USDT) */
  positionValue: number;
  
  /** Number of units/contracts */
  units: number;
  
  /** Risk amount in USDT */
  riskAmount: number;
  
  /** Risk as percentage of account */
  riskPercent: number;
  
  /** Recommended leverage */
  recommendedLeverage: number;
  
  /** Stop loss distance in % */
  stopLossPercent: number;
  
  /** Risk-reward ratio */
  riskRewardRatio: number;
  
  /** Sizing method used */
  method: PositionSizingMethod;
  
  /** Whether sizing is valid */
  valid: boolean;
  
  /** Validation warnings */
  warnings: string[];
  
  /** Validation errors */
  errors: string[];
  
  /** Adjustments made */
  adjustments: SizingAdjustment[];
  
  /** Additional metrics */
  metrics: SizingMetrics;
}

export interface SizingAdjustment {
  type: 'LEVERAGE_LIMIT' | 'MAX_SIZE' | 'MIN_SIZE' | 'CORRELATION' | 'DRAWDOWN' | 'BALANCE';
  original: number;
  adjusted: number;
  reason: string;
}

export interface SizingMetrics {
  /** Kelly optimal fraction */
  kellyFraction?: number;
  
  /** Volatility adjustment factor */
  volatilityFactor?: number;
  
  /** Correlation adjustment factor */
  correlationFactor?: number;
  
  /** Portfolio heat (total risk %) */
  portfolioHeat?: number;
  
  /** Expected value (R) */
  expectedValue?: number;
  
  /** Margin utilization % */
  marginUtilization?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_POSITION_SIZE_CONFIG: PositionSizeConfig = {
  defaultMethod: 'FIXED_FRACTIONAL',
  fixedFractionalRisk: 0.02, // 2% per trade
  kellyFraction: 0.5, // Half Kelly
  maxPositionPercent: 0.10, // 10% max per position
  maxTotalExposurePercent: 0.50, // 50% total exposure
  maxOpenPositions: 10,
  minRiskRewardRatio: 1.5,
  defaultLeverage: 1,
  maxLeverage: 20,
  atrStopLossMultiplier: 2,
  volatilityScalingFactor: 0.01,
  enableCorrelationAdjustment: true,
  maxCorrelation: 0.7,
  minOrderSize: 10, // $10 minimum
  maxOrderSize: 100000, // $100k maximum
};

// ==================== POSITION SIZE VALIDATOR CLASS ====================

export class PositionSizeValidator {
  private config: PositionSizeConfig;
  
  // Exchange-specific limits (in USDT)
  private exchangeLimits: Map<string, { min: number; max: number; maxLeverage: number }> = new Map([
    ['binance', { min: 10, max: 10000000, maxLeverage: 125 }],
    ['bybit', { min: 5, max: 5000000, maxLeverage: 100 }],
    ['okx', { min: 10, max: 5000000, maxLeverage: 125 }],
    ['bitget', { min: 5, max: 2000000, maxLeverage: 100 }],
    ['bingx', { min: 5, max: 1000000, maxLeverage: 50 }],
  ]);
  
  constructor(config: Partial<PositionSizeConfig> = {}) {
    this.config = { ...DEFAULT_POSITION_SIZE_CONFIG, ...config };
  }
  
  /**
   * Calculate optimal position size
   */
  calculateSize(input: SizingInput): SizingResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const adjustments: SizingAdjustment[] = [];
    const metrics: SizingMetrics = {};
    
    // Determine sizing method
    const method = input.method || this.config.defaultMethod;
    
    // Calculate stop loss distance
    let stopLossPercent: number;
    if (input.stopLossPrice && input.entryPrice) {
      stopLossPercent = Math.abs(input.stopLossPrice - input.entryPrice) / input.entryPrice;
    } else if (input.atr) {
      // Use ATR-based stop loss
      stopLossPercent = (input.atr * this.config.atrStopLossMultiplier) / input.entryPrice;
    } else {
      // Default 2% stop loss
      stopLossPercent = 0.02;
      warnings.push('No stop loss provided, using default 2%');
    }
    
    // Calculate risk-reward ratio
    let riskRewardRatio = 0;
    if (input.takeProfitPrice && input.entryPrice) {
      const takeProfitPercent = Math.abs(input.takeProfitPrice - input.entryPrice) / input.entryPrice;
      riskRewardRatio = takeProfitPercent / stopLossPercent;
    }
    
    // Calculate base position size based on method
    let positionValue: number;
    let riskAmount: number;
    
    switch (method) {
      case 'KELLY_CRITERION':
        const kellyResult = this.calculateKellySize(input, stopLossPercent);
        positionValue = kellyResult.size;
        riskAmount = kellyResult.risk;
        metrics.kellyFraction = kellyResult.kellyFraction;
        break;
        
      case 'VOLATILITY_ADJUSTED':
        const volResult = this.calculateVolatilityAdjustedSize(input, stopLossPercent);
        positionValue = volResult.size;
        riskAmount = volResult.risk;
        metrics.volatilityFactor = volResult.factor;
        break;
        
      case 'RISK_PARITY':
        const parityResult = this.calculateRiskParitySize(input, stopLossPercent);
        positionValue = parityResult.size;
        riskAmount = parityResult.risk;
        metrics.correlationFactor = parityResult.factor;
        break;
        
      case 'FIXED_AMOUNT':
        positionValue = input.customRiskPercent || this.config.minOrderSize * 10;
        riskAmount = positionValue * stopLossPercent;
        break;
        
      case 'FIXED_FRACTIONAL':
      default:
        const riskPercent = input.customRiskPercent || this.config.fixedFractionalRisk;
        riskAmount = input.accountBalance * riskPercent;
        positionValue = riskAmount / stopLossPercent;
        break;
    }
    
    // Calculate units
    const units = positionValue / input.entryPrice;
    
    // Calculate leverage
    let leverage = input.leverage || this.config.defaultLeverage;
    const requiredMargin = positionValue / leverage;
    
    // Apply adjustments
    const adjustResult = this.applyAdjustments(
      positionValue,
      leverage,
      input,
      warnings,
      errors,
      adjustments
    );
    
    positionValue = adjustResult.positionValue;
    leverage = adjustResult.leverage;
    riskAmount = positionValue * stopLossPercent;
    
    // Calculate risk percentage
    const riskPercent = riskAmount / input.accountBalance;
    
    // Calculate margin utilization
    metrics.marginUtilization = (positionValue / leverage) / input.availableMargin;
    
    // Calculate portfolio heat
    if (input.openPositions) {
      const totalRisk = input.openPositions.reduce((sum, p) => sum + p.risk, 0) + riskAmount;
      metrics.portfolioHeat = totalRisk / input.accountBalance;
    }
    
    // Calculate expected value
    if (input.winRate && input.winLossRatio) {
      metrics.expectedValue = (input.winRate * input.winLossRatio) - (1 - input.winRate);
    }
    
    // Determine validity
    const valid = errors.length === 0;
    
    return {
      positionSize: positionValue,
      positionValue,
      units,
      riskAmount,
      riskPercent,
      recommendedLeverage: leverage,
      stopLossPercent: stopLossPercent * 100,
      riskRewardRatio,
      method,
      valid,
      warnings,
      errors,
      adjustments,
      metrics,
    };
  }
  
  /**
   * Validate a position size against all constraints
   */
  validate(positionValue: number, input: SizingInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check minimum size
    if (positionValue < this.config.minOrderSize) {
      errors.push(`Position size ${positionValue.toFixed(2)} USDT below minimum ${this.config.minOrderSize} USDT`);
    }
    
    // Check maximum size
    if (positionValue > this.config.maxOrderSize) {
      errors.push(`Position size ${positionValue.toFixed(2)} USDT above maximum ${this.config.maxOrderSize} USDT`);
    }
    
    // Check against account balance
    const maxByBalance = input.accountBalance * this.config.maxPositionPercent;
    if (positionValue > maxByBalance) {
      warnings.push(`Position size exceeds ${this.config.maxPositionPercent * 100}% of account balance`);
    }
    
    // Check against available margin
    if (positionValue > input.availableMargin) {
      errors.push(`Position size exceeds available margin ${input.availableMargin.toFixed(2)} USDT`);
    }
    
    // Check exchange limits
    const limits = this.exchangeLimits.get(input.exchange);
    if (limits) {
      if (positionValue < limits.min) {
        errors.push(`Below ${input.exchange} minimum order size ${limits.min} USDT`);
      }
      if (positionValue > limits.max) {
        warnings.push(`Approaching ${input.exchange} maximum order size`);
      }
    }
    
    // Check open positions count
    if (input.openPositions && input.openPositions.length >= this.config.maxOpenPositions) {
      errors.push(`Maximum open positions (${this.config.maxOpenPositions}) reached`);
    }
    
    // Check total exposure
    if (input.openPositions) {
      const totalExposure = input.openPositions.reduce((sum, p) => sum + p.size, 0) + positionValue;
      const maxExposure = input.accountBalance * this.config.maxTotalExposurePercent;
      if (totalExposure > maxExposure) {
        warnings.push(`Total exposure would exceed ${this.config.maxTotalExposurePercent * 100}% of account`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * Get recommended position size adjustments
   */
  getRecommendedAdjustments(input: SizingInput): string[] {
    const recommendations: string[] = [];
    const result = this.calculateSize(input);
    
    if (result.warnings.length > 0) {
      recommendations.push(...result.warnings);
    }
    
    if (result.riskPercent > 0.05) {
      recommendations.push(`Consider reducing risk from ${(result.riskPercent * 100).toFixed(1)}% to 2-3%`);
    }
    
    if (result.riskRewardRatio < this.config.minRiskRewardRatio) {
      recommendations.push(
        `Risk-reward ratio ${result.riskRewardRatio.toFixed(2)} is below minimum ${this.config.minRiskRewardRatio}`
      );
    }
    
    if (result.metrics.portfolioHeat && result.metrics.portfolioHeat > 0.15) {
      recommendations.push(
        `Portfolio heat is ${(result.metrics.portfolioHeat * 100).toFixed(1)}%, consider reducing total risk`
      );
    }
    
    return recommendations;
  }
  
  // ==================== PRIVATE METHODS ====================
  
  private calculateKellySize(
    input: SizingInput,
    stopLossPercent: number
  ): { size: number; risk: number; kellyFraction: number } {
    const winRate = input.winRate || 0.5;
    const winLossRatio = input.winLossRatio || 1.5;
    
    // Kelly formula: f = (p * b - q) / b
    // where p = win rate, q = loss rate, b = win/loss ratio
    const kellyFraction = (winRate * winLossRatio - (1 - winRate)) / winLossRatio;
    
    // Use partial Kelly (half Kelly by default)
    const adjustedKelly = kellyFraction * this.config.kellyFraction;
    
    // Cap at reasonable level
    const cappedKelly = Math.max(0, Math.min(adjustedKelly, 0.25));
    
    // Calculate size
    const riskAmount = input.accountBalance * cappedKelly;
    const size = riskAmount / stopLossPercent;
    
    return { size, risk: riskAmount, kellyFraction: cappedKelly };
  }
  
  private calculateVolatilityAdjustedSize(
    input: SizingInput,
    stopLossPercent: number
  ): { size: number; risk: number; factor: number } {
    const atr = input.atr || input.entryPrice * 0.02; // Default 2% ATR
    const atrPercent = atr / input.entryPrice;
    
    // Volatility factor: lower volatility = larger size, higher volatility = smaller size
    const volatilityFactor = this.config.volatilityScalingFactor / atrPercent;
    
    // Apply to base risk
    const baseRisk = input.accountBalance * this.config.fixedFractionalRisk;
    const adjustedRisk = baseRisk * volatilityFactor;
    
    const size = adjustedRisk / stopLossPercent;
    
    return { size, risk: adjustedRisk, factor: volatilityFactor };
  }
  
  private calculateRiskParitySize(
    input: SizingInput,
    stopLossPercent: number
  ): { size: number; risk: number; factor: number } {
    if (!input.openPositions || input.openPositions.length === 0) {
      // No existing positions, use base calculation
      const riskAmount = input.accountBalance * this.config.fixedFractionalRisk;
      return { size: riskAmount / stopLossPercent, risk: riskAmount, factor: 1 };
    }
    
    // Calculate total risk budget
    const totalRiskBudget = input.accountBalance * this.config.maxTotalExposurePercent * 0.5;
    
    // Divide risk equally among positions
    const positionCount = input.openPositions.length + 1; // +1 for new position
    const riskPerPosition = totalRiskBudget / positionCount;
    
    const size = riskPerPosition / stopLossPercent;
    
    return { size, risk: riskPerPosition, factor: 1 / positionCount };
  }
  
  private applyAdjustments(
    positionValue: number,
    leverage: number,
    input: SizingInput,
    warnings: string[],
    errors: string[],
    adjustments: SizingAdjustment[]
  ): { positionValue: number; leverage: number } {
    let adjustedValue = positionValue;
    let adjustedLeverage = leverage;
    
    // Check leverage limits
    const maxLeverage = this.getMaxLeverage(input.exchange);
    if (adjustedLeverage > maxLeverage) {
      adjustments.push({
        type: 'LEVERAGE_LIMIT',
        original: adjustedLeverage,
        adjusted: maxLeverage,
        reason: `Leverage capped at ${maxLeverage}x for ${input.exchange}`,
      });
      adjustedLeverage = maxLeverage;
    }
    
    // Check maximum position size
    const maxValue = input.accountBalance * this.config.maxPositionPercent;
    if (adjustedValue > maxValue) {
      adjustments.push({
        type: 'MAX_SIZE',
        original: adjustedValue,
        adjusted: maxValue,
        reason: `Position capped at ${this.config.maxPositionPercent * 100}% of account`,
      });
      adjustedValue = maxValue;
    }
    
    // Check minimum order size
    if (adjustedValue < this.config.minOrderSize) {
      adjustments.push({
        type: 'MIN_SIZE',
        original: adjustedValue,
        adjusted: this.config.minOrderSize,
        reason: `Position adjusted to minimum ${this.config.minOrderSize} USDT`,
      });
      adjustedValue = this.config.minOrderSize;
    }
    
    // Check against available margin
    const requiredMargin = adjustedValue / adjustedLeverage;
    if (requiredMargin > input.availableMargin) {
      // Reduce size to fit available margin
      const maxByMargin = input.availableMargin * adjustedLeverage;
      adjustments.push({
        type: 'BALANCE',
        original: adjustedValue,
        adjusted: maxByMargin,
        reason: 'Position reduced to available margin',
      });
      adjustedValue = maxByMargin;
    }
    
    return { positionValue: adjustedValue, leverage: adjustedLeverage };
  }
  
  private getMaxLeverage(exchange: string): number {
    const limits = this.exchangeLimits.get(exchange);
    if (limits) {
      return Math.min(limits.maxLeverage, this.config.maxLeverage);
    }
    return this.config.maxLeverage;
  }
  
  // ==================== GETTERS/SETTERS ====================
  
  getConfig(): PositionSizeConfig {
    return { ...this.config };
  }
  
  setConfig(config: Partial<PositionSizeConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  getExchangeLimits(): Map<string, { min: number; max: number; maxLeverage: number }> {
    return new Map(this.exchangeLimits);
  }
  
  setExchangeLimits(
    exchange: string,
    limits: { min: number; max: number; maxLeverage: number }
  ): void {
    this.exchangeLimits.set(exchange, limits);
  }
}

// ==================== SINGLETON INSTANCE ====================

let positionSizeValidator: PositionSizeValidator | null = null;

export function getPositionSizeValidator(config?: Partial<PositionSizeConfig>): PositionSizeValidator {
  if (!positionSizeValidator) {
    positionSizeValidator = new PositionSizeValidator(config);
  } else if (config) {
    positionSizeValidator.setConfig(config);
  }
  return positionSizeValidator;
}

export function createPositionSizeValidator(config?: Partial<PositionSizeConfig>): PositionSizeValidator {
  return new PositionSizeValidator(config);
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Quick position size calculation
 */
export function calculateQuickPositionSize(
  accountBalance: number,
  entryPrice: number,
  stopLossPrice: number,
  riskPercent: number = 0.02
): number {
  const stopLossDistance = Math.abs(entryPrice - stopLossPrice) / entryPrice;
  const riskAmount = accountBalance * riskPercent;
  return riskAmount / stopLossDistance;
}

/**
 * Calculate risk amount from position
 */
export function calculateRiskAmount(
  positionValue: number,
  entryPrice: number,
  stopLossPrice: number
): number {
  const stopLossPercent = Math.abs(entryPrice - stopLossPrice) / entryPrice;
  return positionValue * stopLossPercent;
}

/**
 * Calculate Kelly optimal fraction
 */
export function calculateKellyFraction(winRate: number, winLossRatio: number): number {
  return (winRate * winLossRatio - (1 - winRate)) / winLossRatio;
}

// ==================== EXPORTS ====================

export default PositionSizeValidator;
