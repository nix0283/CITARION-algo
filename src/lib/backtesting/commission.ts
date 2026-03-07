/**
 * Commission Tiers
 * 
 * Поддержка разных уровней комиссий в зависимости от объёма торгов.
 * Как на реальных биржах (Binance, Bybit, OKX).
 */

// ==================== TYPES ====================

export interface CommissionTier {
  minVolume30d: number;  // Minimum 30-day volume in USDT
  makerFee: number;      // Maker fee (decimal: 0.0002 = 0.02%)
  takerFee: number;      // Taker fee (decimal: 0.0004 = 0.04%)
}

export interface ExchangeFeeSchedule {
  exchange: string;
  tiers: CommissionTier[];
  defaultTier: CommissionTier;
  bnbDiscount?: number;  // BNB discount (Binance)
  nativeTokenDiscount?: number;  // Native token discount
}

// ==================== EXCHANGE FEE SCHEDULES ====================

export const EXCHANGE_FEE_SCHEDULES: Record<string, ExchangeFeeSchedule> = {
  binance: {
    exchange: "binance",
    tiers: [
      { minVolume30d: 0, makerFee: 0.001, takerFee: 0.001 },        // Regular
      { minVolume30d: 50000, makerFee: 0.0009, takerFee: 0.001 },   // VIP 1
      { minVolume30d: 500000, makerFee: 0.0008, takerFee: 0.001 },  // VIP 2
      { minVolume30d: 1000000, makerFee: 0.0006, takerFee: 0.0008 },// VIP 3
      { minVolume30d: 5000000, makerFee: 0.0004, takerFee: 0.0006 },// VIP 4
      { minVolume30d: 10000000, makerFee: 0.0002, takerFee: 0.0004 },// VIP 5
    ],
    defaultTier: { minVolume30d: 0, makerFee: 0.001, takerFee: 0.001 },
    bnbDiscount: 0.25, // 25% discount with BNB
  },
  
  binance_futures: {
    exchange: "binance_futures",
    tiers: [
      { minVolume30d: 0, makerFee: 0.0002, takerFee: 0.0004 },      // Regular
      { minVolume30d: 50000, makerFee: 0.00016, takerFee: 0.0004 }, // VIP 1
      { minVolume30d: 500000, makerFee: 0.00014, takerFee: 0.00035 },// VIP 2
      { minVolume30d: 1000000, makerFee: 0.00012, takerFee: 0.00032 },// VIP 3
      { minVolume30d: 5000000, makerFee: 0.0001, takerFee: 0.0003 }, // VIP 4
      { minVolume30d: 10000000, makerFee: 0.00008, takerFee: 0.00028 },// VIP 5
    ],
    defaultTier: { minVolume30d: 0, makerFee: 0.0002, takerFee: 0.0004 },
    bnbDiscount: 0.10, // 10% discount with BNB
  },

  bybit: {
    exchange: "bybit",
    tiers: [
      { minVolume30d: 0, makerFee: 0.0001, takerFee: 0.0001 },      // Non-VIP
      { minVolume30d: 50000, makerFee: 0.00008, takerFee: 0.0001 }, // VIP 1
      { minVolume30d: 200000, makerFee: 0.00006, takerFee: 0.00008 },// VIP 2
      { minVolume30d: 500000, makerFee: 0.00004, takerFee: 0.00006 },// VIP 3
      { minVolume30d: 2000000, makerFee: 0.00002, takerFee: 0.00004 },// VIP 4
    ],
    defaultTier: { minVolume30d: 0, makerFee: 0.0001, takerFee: 0.0001 },
  },

  bybit_futures: {
    exchange: "bybit_futures",
    tiers: [
      { minVolume30d: 0, makerFee: 0.0002, takerFee: 0.00055 },     // Non-VIP
      { minVolume30d: 50000, makerFee: 0.00015, takerFee: 0.0005 }, // VIP 1
      { minVolume30d: 200000, makerFee: 0.0001, takerFee: 0.00045 },// VIP 2
      { minVolume30d: 500000, makerFee: 0.00005, takerFee: 0.0004 },// VIP 3
      { minVolume30d: 2000000, makerFee: 0.0, takerFee: 0.00035 },  // VIP 4
    ],
    defaultTier: { minVolume30d: 0, makerFee: 0.0002, takerFee: 0.00055 },
  },

  okx: {
    exchange: "okx",
    tiers: [
      { minVolume30d: 0, makerFee: 0.0008, takerFee: 0.001 },       // Regular
      { minVolume30d: 100000, makerFee: 0.0007, takerFee: 0.0009 }, // VIP 1
      { minVolume30d: 500000, makerFee: 0.0006, takerFee: 0.0008 }, // VIP 2
      { minVolume30d: 2000000, makerFee: 0.0004, takerFee: 0.0006 },// VIP 3
      { minVolume30d: 10000000, makerFee: 0.0002, takerFee: 0.0004 },// VIP 4
    ],
    defaultTier: { minVolume30d: 0, makerFee: 0.0008, takerFee: 0.001 },
  },

  bitget: {
    exchange: "bitget",
    tiers: [
      { minVolume30d: 0, makerFee: 0.0002, takerFee: 0.0006 },      // LV0
      { minVolume30d: 10000, makerFee: 0.00018, takerFee: 0.00058 },// LV1
      { minVolume30d: 100000, makerFee: 0.00015, takerFee: 0.00055 },// LV2
      { minVolume30d: 500000, makerFee: 0.0001, takerFee: 0.0005 }, // LV3
      { minVolume30d: 2000000, makerFee: 0.00005, takerFee: 0.00045 },// LV4
    ],
    defaultTier: { minVolume30d: 0, makerFee: 0.0002, takerFee: 0.0006 },
  },

  bingx: {
    exchange: "bingx",
    tiers: [
      { minVolume30d: 0, makerFee: 0.0002, takerFee: 0.0005 },      // Standard
      { minVolume30d: 100000, makerFee: 0.00015, takerFee: 0.00045 },// VIP 1
      { minVolume30d: 500000, makerFee: 0.0001, takerFee: 0.0004 }, // VIP 2
      { minVolume30d: 2000000, makerFee: 0.00005, takerFee: 0.00035 },// VIP 3
    ],
    defaultTier: { minVolume30d: 0, makerFee: 0.0002, takerFee: 0.0005 },
  },
};

// ==================== COMMISSION CALCULATOR ====================

export class CommissionCalculator {
  private schedule: ExchangeFeeSchedule;
  private volume30d: number;
  private useNativeTokenDiscount: boolean;

  constructor(exchange: string = "binance", volume30d: number = 0, useNativeTokenDiscount: boolean = false) {
    this.schedule = EXCHANGE_FEE_SCHEDULES[exchange] || EXCHANGE_FEE_SCHEDULES.binance;
    this.volume30d = volume30d;
    this.useNativeTokenDiscount = useNativeTokenDiscount;
  }

  /**
   * Get current fee tier
   */
  getCurrentTier(): CommissionTier {
    const sortedTiers = [...this.schedule.tiers].sort((a, b) => b.minVolume30d - a.minVolume30d);
    
    for (const tier of sortedTiers) {
      if (this.volume30d >= tier.minVolume30d) {
        return tier;
      }
    }
    
    return this.schedule.defaultTier;
  }

  /**
   * Calculate fee for an order
   */
  calculateFee(
    price: number,
    quantity: number,
    isMaker: boolean,
    isFutures: boolean = true
  ): number {
    const tier = this.getCurrentTier();
    const baseFee = isMaker ? tier.makerFee : tier.takerFee;
    const volume = price * quantity;

    let fee = volume * baseFee;

    // Apply native token discount
    if (this.useNativeTokenDiscount) {
      const discount = this.schedule.bnbDiscount || this.schedule.nativeTokenDiscount || 0;
      fee = fee * (1 - discount);
    }

    return fee;
  }

  /**
   * Calculate fee for a complete trade (open + close)
   */
  calculateTotalTradeFee(
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    leverage: number = 1
  ): number {
    const positionValue = entryPrice * quantity;
    
    // Futures fees are on position value, not margin
    const openFee = this.calculateFee(entryPrice, quantity, false, true);
    const closeFee = this.calculateFee(exitPrice, quantity, false, true);
    
    return openFee + closeFee;
  }

  /**
   * Get next tier info
   */
  getNextTier(): { tier: CommissionTier; volumeNeeded: number } | null {
    const currentTier = this.getCurrentTier();
    const sortedTiers = [...this.schedule.tiers].sort((a, b) => a.minVolume30d - b.minVolume30d);
    
    const nextTier = sortedTiers.find(t => t.minVolume30d > currentTier.minVolume30d);
    
    if (!nextTier) return null;
    
    return {
      tier: nextTier,
      volumeNeeded: nextTier.minVolume30d - this.volume30d,
    };
  }

  /**
   * Estimate savings with next tier
   */
  estimateSavingsWithNextTier(monthlyTrades: number, avgTradeSize: number): number | null {
    const nextTierInfo = this.getNextTier();
    if (!nextTierInfo) return null;

    const currentTier = this.getCurrentTier();
    const monthlyVolume = monthlyTrades * avgTradeSize;

    // Calculate current monthly fees
    const currentFeeRate = (currentTier.makerFee + currentTier.takerFee) / 2;
    const currentMonthlyFees = monthlyVolume * currentFeeRate;

    // Calculate next tier monthly fees
    const nextFeeRate = (nextTierInfo.tier.makerFee + nextTierInfo.tier.takerFee) / 2;
    const nextMonthlyFees = monthlyVolume * nextFeeRate;

    return currentMonthlyFees - nextMonthlyFees;
  }

  /**
   * Update 30-day volume
   */
  updateVolume(volume: number): void {
    this.volume30d = volume;
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get fee schedule for exchange
 */
export function getExchangeFeeSchedule(exchange: string): ExchangeFeeSchedule {
  return EXCHANGE_FEE_SCHEDULES[exchange] || EXCHANGE_FEE_SCHEDULES.binance;
}

/**
 * Calculate commission with default settings
 */
export function calculateCommission(
  exchange: string,
  price: number,
  quantity: number,
  isMaker: boolean
): number {
  const calculator = new CommissionCalculator(exchange);
  return calculator.calculateFee(price, quantity, isMaker);
}
