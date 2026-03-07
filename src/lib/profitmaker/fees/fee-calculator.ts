/**
 * Fee Calculator
 * 
 * Based on Profitmaker's fee calculation patterns.
 * Provides comprehensive fee calculation across exchanges with:
 * - Exchange-specific fee structures
 * - VIP tier support
 * - Maker/Taker fee differentiation
 * - Trading volume discounts
 * - Funding rate calculations
 */

// ==================== Types ====================

export interface FeeStructure {
  exchange: string;
  spot: FeeTier[];
  futures: FeeTier[];
  vipTiers?: VIPTier[];
  fundingRates?: FundingRateConfig;
}

export interface FeeTier {
  makerFee: number;
  takerFee: number;
  minVolume?: number;
  description?: string;
}

export interface VIPTier {
  level: string;
  minVolume30d: number;
  makerFee: number;
  takerFee: number;
  benefits?: string[];
}

export interface FundingRateConfig {
  intervalHours: number;
  maxRate: number;
}

export interface TradingFee {
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  amount: number;
  price: number;
  volume: number;
  feeRate: number;
  feeAmount: number;
  feeCurrency: string;
  isMaker: boolean;
}

export interface FeeCalculationParams {
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  amount: number;
  price: number;
  marketType: 'spot' | 'futures';
  vipLevel?: string;
  volume30d?: number;
}

export interface FundingCalculationParams {
  exchange: string;
  symbol: string;
  positionSize: number;
  entryPrice: number;
  currentPrice: number;
  fundingRate: number;
  holdingHours: number;
}

// ==================== Exchange Fee Structures ====================

/**
 * Fee structures for supported exchanges
 */
export const EXCHANGE_FEE_STRUCTURES: Record<string, FeeStructure> = {
  binance: {
    exchange: 'binance',
    spot: [
      { makerFee: 0.001, takerFee: 0.001 }, // Standard
    ],
    futures: [
      { makerFee: 0.0002, takerFee: 0.0005 }, // USDT-M
    ],
    vipTiers: [
      { level: 'VIP0', minVolume30d: 0, makerFee: 0.001, takerFee: 0.001 },
      { level: 'VIP1', minVolume30d: 1000000, makerFee: 0.0009, takerFee: 0.001 },
      { level: 'VIP2', minVolume30d: 5000000, makerFee: 0.0008, takerFee: 0.001 },
      { level: 'VIP3', minVolume30d: 20000000, makerFee: 0.0006, takerFee: 0.0008 },
      { level: 'VIP4', minVolume30d: 75000000, makerFee: 0.0004, takerFee: 0.0006 },
      { level: 'VIP5', minVolume30d: 150000000, makerFee: 0.0002, takerFee: 0.0004 },
      { level: 'VIP6', minVolume30d: 400000000, makerFee: 0, takerFee: 0.0002 },
    ],
    fundingRates: {
      intervalHours: 8,
      maxRate: 0.0375,
    },
  },
  
  bybit: {
    exchange: 'bybit',
    spot: [
      { makerFee: 0.001, takerFee: 0.001 },
    ],
    futures: [
      { makerFee: 0.0002, takerFee: 0.00055 }, // USDT Perpetual
    ],
    vipTiers: [
      { level: 'Non-VIP', minVolume30d: 0, makerFee: 0.0002, takerFee: 0.00055 },
      { level: 'VIP1', minVolume30d: 2500000, makerFee: 0.00015, takerFee: 0.0005 },
      { level: 'VIP2', minVolume30d: 12500000, makerFee: 0.0001, takerFee: 0.00045 },
      { level: 'VIP3', minVolume30d: 25000000, makerFee: 0.00005, takerFee: 0.0004 },
      { level: 'Pro1', minVolume30d: 100000000, makerFee: 0, takerFee: 0.0003 },
      { level: 'Pro2', minVolume30d: 200000000, makerFee: 0, takerFee: 0.00025 },
      { level: 'Pro3', minVolume30d: 400000000, makerFee: 0, takerFee: 0.0002 },
    ],
    fundingRates: {
      intervalHours: 8,
      maxRate: 0.0375,
    },
  },

  okx: {
    exchange: 'okx',
    spot: [
      { makerFee: 0.0008, takerFee: 0.001 },
    ],
    futures: [
      { makerFee: 0.0002, takerFee: 0.0005 },
    ],
    vipTiers: [
      { level: 'Regular', minVolume30d: 0, makerFee: 0.0002, takerFee: 0.0005 },
      { level: 'VIP1', minVolume30d: 5000000, makerFee: 0.00018, takerFee: 0.00048 },
      { level: 'VIP2', minVolume30d: 20000000, makerFee: 0.00015, takerFee: 0.00045 },
      { level: 'VIP3', minVolume30d: 100000000, makerFee: 0.0001, takerFee: 0.0004 },
      { level: 'VIP4', minVolume30d: 500000000, makerFee: 0.00005, takerFee: 0.00035 },
      { level: 'VIP5', minVolume30d: 2000000000, makerFee: 0, takerFee: 0.00028 },
    ],
    fundingRates: {
      intervalHours: 8,
      maxRate: 0.0375,
    },
  },

  bitget: {
    exchange: 'bitget',
    spot: [
      { makerFee: 0.001, takerFee: 0.001 },
    ],
    futures: [
      { makerFee: 0.0002, takerFee: 0.0006 },
    ],
    vipTiers: [
      { level: 'Regular', minVolume30d: 0, makerFee: 0.0002, takerFee: 0.0006 },
      { level: 'VIP1', minVolume30d: 3000000, makerFee: 0.00018, takerFee: 0.00055 },
      { level: 'VIP2', minVolume30d: 10000000, makerFee: 0.00015, takerFee: 0.0005 },
      { level: 'VIP3', minVolume30d: 30000000, makerFee: 0.00012, takerFee: 0.00045 },
      { level: 'VIP4', minVolume30d: 100000000, makerFee: 0.00008, takerFee: 0.00038 },
    ],
    fundingRates: {
      intervalHours: 8,
      maxRate: 0.0375,
    },
  },

  bingx: {
    exchange: 'bingx',
    spot: [
      { makerFee: 0.001, takerFee: 0.001 },
    ],
    futures: [
      { makerFee: 0.0002, takerFee: 0.0005 },
    ],
    fundingRates: {
      intervalHours: 8,
      maxRate: 0.0375,
    },
  },
};

// ==================== Fee Calculator ====================

/**
 * Comprehensive fee calculator for all exchanges
 */
export class FeeCalculator {
  private customFees: Map<string, FeeStructure> = new Map();

  /**
   * Calculate trading fee
   */
  calculateFee(params: FeeCalculationParams): TradingFee {
    const structure = this.getFeeStructure(params.exchange);
    const tiers = params.marketType === 'spot' ? structure.spot : structure.futures;
    
    // Determine fee tier based on VIP level or volume
    let applicableTier: FeeTier = tiers[0];
    
    if (params.vipLevel && structure.vipTiers) {
      const vipTier = structure.vipTiers.find(t => t.level === params.vipLevel);
      if (vipTier) {
        applicableTier = vipTier;
      }
    } else if (params.volume30d && structure.vipTiers) {
      // Find appropriate tier based on volume
      for (const tier of structure.vipTiers) {
        if (params.volume30d >= tier.minVolume30d) {
          applicableTier = tier;
        }
      }
    }

    // Determine maker vs taker
    const isMaker = params.orderType === 'limit';
    const feeRate = isMaker ? applicableTier.makerFee : applicableTier.takerFee;
    
    // Calculate values
    const volume = params.amount * params.price;
    const feeAmount = volume * feeRate;
    
    // Determine fee currency
    const feeCurrency = this.getFeeCurrency(params.exchange, params.symbol, params.side);

    return {
      exchange: params.exchange,
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      amount: params.amount,
      price: params.price,
      volume,
      feeRate,
      feeAmount,
      feeCurrency,
      isMaker,
    };
  }

  /**
   * Calculate funding fee for futures positions
   */
  calculateFundingFee(params: FundingCalculationParams): {
    fundingFee: number;
    nextFundingTime: number;
    estimatedNextRate?: number;
  } {
    const structure = this.getFeeStructure(params.exchange);
    const config = structure.fundingRates;
    
    if (!config) {
      return {
        fundingFee: 0,
        nextFundingTime: 0,
      };
    }

    // Calculate position value
    const positionValue = params.positionSize * params.currentPrice;
    
    // Calculate funding fee
    // Funding fee = Position Value × Funding Rate
    const fundingFee = positionValue * params.fundingRate * (params.holdingHours / config.intervalHours);
    
    // Calculate next funding time
    const now = Date.now();
    const intervalMs = config.intervalHours * 60 * 60 * 1000;
    const nextFundingTime = Math.ceil(now / intervalMs) * intervalMs;

    return {
      fundingFee,
      nextFundingTime,
    };
  }

  /**
   * Calculate total fees for a round trip trade (entry + exit)
   */
  calculateRoundTripFee(
    exchange: string,
    symbol: string,
    amount: number,
    entryPrice: number,
    exitPrice: number,
    marketType: 'spot' | 'futures',
    vipLevel?: string
  ): {
    entryFee: TradingFee;
    exitFee: TradingFee;
    totalFeeAmount: number;
    totalFeePercent: number;
  } {
    const entryFee = this.calculateFee({
      exchange,
      symbol,
      side: 'buy',
      orderType: 'market',
      amount,
      price: entryPrice,
      marketType,
      vipLevel,
    });

    const exitFee = this.calculateFee({
      exchange,
      symbol,
      side: 'sell',
      orderType: 'market',
      amount,
      price: exitPrice,
      marketType,
      vipLevel,
    });

    const totalFeeAmount = entryFee.feeAmount + exitFee.feeAmount;
    const entryValue = amount * entryPrice;
    const exitValue = amount * exitPrice;
    const totalFeePercent = (totalFeeAmount / ((entryValue + exitValue) / 2)) * 100;

    return {
      entryFee,
      exitFee,
      totalFeeAmount,
      totalFeePercent,
    };
  }

  /**
   * Compare fees across exchanges
   */
  compareFeesAcrossExchanges(
    exchanges: string[],
    symbol: string,
    amount: number,
    price: number,
    marketType: 'spot' | 'futures'
  ): Array<{
    exchange: string;
    makerFee: number;
    takerFee: number;
    makerFeeAmount: number;
    takerFeeAmount: number;
  }> {
    return exchanges.map(exchange => {
      const makerResult = this.calculateFee({
        exchange,
        symbol,
        side: 'buy',
        orderType: 'limit',
        amount,
        price,
        marketType,
      });

      const takerResult = this.calculateFee({
        exchange,
        symbol,
        side: 'buy',
        orderType: 'market',
        amount,
        price,
        marketType,
      });

      return {
        exchange,
        makerFee: makerResult.feeRate,
        takerFee: takerResult.feeRate,
        makerFeeAmount: makerResult.feeAmount,
        takerFeeAmount: takerResult.feeAmount,
      };
    }).sort((a, b) => a.takerFee - b.takerFee);
  }

  /**
   * Get VIP tier info for exchange
   */
  getVIPTiers(exchange: string): VIPTier[] {
    const structure = this.getFeeStructure(exchange);
    return structure.vipTiers || [];
  }

  /**
   * Calculate required volume for VIP tier
   */
  getVolumeRequiredForTier(exchange: string, targetTier: string): number {
    const structure = this.getFeeStructure(exchange);
    const tier = structure.vipTiers?.find(t => t.level === targetTier);
    return tier?.minVolume30d || 0;
  }

  /**
   * Register custom fee structure
   */
  registerCustomFee(exchange: string, structure: FeeStructure): void {
    this.customFees.set(exchange, structure);
  }

  // ==================== Private Methods ====================

  private getFeeStructure(exchange: string): FeeStructure {
    // Check custom fees first
    const custom = this.customFees.get(exchange);
    if (custom) return custom;

    // Get predefined structure
    const structure = EXCHANGE_FEE_STRUCTURES[exchange.toLowerCase()];
    if (!structure) {
      throw new Error(`Unknown exchange: ${exchange}`);
    }

    return structure;
  }

  private getFeeCurrency(exchange: string, symbol: string, side: 'buy' | 'sell'): string {
    // Most exchanges charge fees in quote currency for buys, base for sells
    // But this varies - here's simplified logic
    
    const parts = symbol.split('/');
    if (parts.length === 2) {
      return side === 'buy' ? parts[1] : parts[0];
    }

    // For USDT pairs
    if (symbol.includes('USDT')) {
      return 'USDT';
    }
    if (symbol.includes('USDC')) {
      return 'USDC';
    }
    if (symbol.includes('BUSD')) {
      return 'BUSD';
    }

    // Default to USDT
    return 'USDT';
  }
}

// ==================== Fee Optimization ====================

/**
 * Fee optimization strategies
 */
export class FeeOptimizer {
  private calculator: FeeCalculator;

  constructor() {
    this.calculator = new FeeCalculator();
  }

  /**
   * Find optimal execution strategy
   */
  findOptimalExecution(
    exchange: string,
    symbol: string,
    amount: number,
    currentPrice: number,
    marketType: 'spot' | 'futures'
  ): {
    strategy: 'market' | 'limit' | 'twap';
    estimatedFee: number;
    savings: number;
    description: string;
  } {
    // Calculate fees for different strategies
    const marketFee = this.calculator.calculateFee({
      exchange,
      symbol,
      side: 'buy',
      orderType: 'market',
      amount,
      price: currentPrice,
      marketType,
    });

    const limitFee = this.calculator.calculateFee({
      exchange,
      symbol,
      side: 'buy',
      orderType: 'limit',
      amount,
      price: currentPrice,
      marketType,
    });

    // Maker fee discount
    const savings = marketFee.feeAmount - limitFee.feeAmount;
    const savingsPercent = (savings / marketFee.feeAmount) * 100;

    // Recommend strategy based on savings
    if (savingsPercent > 20 && marketType === 'spot') {
      return {
        strategy: 'limit',
        estimatedFee: limitFee.feeAmount,
        savings,
        description: `Use limit orders to save ${savingsPercent.toFixed(1)}% on fees`,
      };
    }

    if (amount * currentPrice > 100000) {
      return {
        strategy: 'twap',
        estimatedFee: marketFee.feeAmount,
        savings: 0,
        description: 'Large order - consider TWAP to reduce market impact',
      };
    }

    return {
      strategy: 'market',
      estimatedFee: marketFee.feeAmount,
      savings: 0,
      description: 'Market order recommended for immediate execution',
    };
  }

  /**
   * Calculate break-even price including fees
   */
  calculateBreakEvenPrice(
    exchange: string,
    symbol: string,
    amount: number,
    entryPrice: number,
    marketType: 'spot' | 'futures'
  ): {
    breakEvenPrice: number;
    totalFees: number;
    requiredGainPercent: number;
  } {
    // Calculate entry fee
    const entryFee = this.calculator.calculateFee({
      exchange,
      symbol,
      side: 'buy',
      orderType: 'market',
      amount,
      price: entryPrice,
      marketType,
    });

    // For break-even, we need to cover both entry and exit fees
    // Exit fee will be at exit price, so we need to solve for it
    // BreakEven: exitAmount * exitPrice - exitFees = entryAmount * entryPrice + entryFees
    
    const entryValue = amount * entryPrice;
    const entryFeeAmount = entryFee.feeAmount;
    
    // Approximate exit fee rate
    const exitFeeRate = entryFee.feeRate;
    
    // Break-even calculation
    // exitValue * (1 - exitFeeRate) = entryValue + entryFeeAmount
    // exitValue = (entryValue + entryFeeAmount) / (1 - exitFeeRate)
    const exitValue = (entryValue + entryFeeAmount) / (1 - exitFeeRate);
    const breakEvenPrice = exitValue / amount;
    
    const totalFees = entryFeeAmount + (exitValue * exitFeeRate);
    const requiredGainPercent = ((breakEvenPrice - entryPrice) / entryPrice) * 100;

    return {
      breakEvenPrice,
      totalFees,
      requiredGainPercent,
    };
  }
}

// ==================== Exports ====================

export const feeCalculator = new FeeCalculator();
export const feeOptimizer = new FeeOptimizer();
