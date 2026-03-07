/**
 * Multi-Exchange Arbitrage System
 * 
 * Detects and executes arbitrage opportunities across multiple exchanges:
 * - Cross-exchange price arbitrage
 * - Funding rate arbitrage
 * - Basis trading (spot vs futures)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ArbitrageOpportunity {
  id: string;
  type: 'price' | 'funding' | 'basis';
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
  estimatedProfit: number;
  estimatedFees: number;
  netProfit: number;
  requiredCapital: number;
  executionTime: number; // estimated ms
  confidence: number;
  timestamp: number;
  expiresAt: number;
}

export interface ExchangePrice {
  exchange: string;
  symbol: string;
  bidPrice: number;
  askPrice: number;
  timestamp: number;
}

export interface FundingRate {
  exchange: string;
  symbol: string;
  rate: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface ArbitrageConfig {
  minSpreadPercent: number;
  minProfitUsdt: number;
  maxCapitalPerTrade: number;
  maxExecutionTimeMs: number;
  feeBuffer: number;
  enabledExchanges: string[];
  enabledSymbols: string[];
  priceTimeoutMs: number;
}

export interface ExecutionResult {
  opportunityId: string;
  success: boolean;
  profit?: number;
  fees?: number;
  error?: string;
  executionTime: number;
  trades: ArbitrageTrade[];
}

export interface ArbitrageTrade {
  exchange: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  orderId: string;
  timestamp: number;
}

// ============================================================================
// EXCHANGE FEES
// ============================================================================

const EXCHANGE_FEES: Record<string, { maker: number; taker: number }> = {
  binance: { maker: 0.0002, taker: 0.0004 },
  bybit: { maker: 0.0001, taker: 0.0001 },
  okx: { maker: 0.0002, taker: 0.0005 },
  bitget: { maker: 0.0002, taker: 0.0006 },
  bingx: { maker: 0.0001, taker: 0.0001 },
  kucoin: { maker: 0.0002, taker: 0.0006 },
};

// ============================================================================
// ARBITRAGE SCANNER
// ============================================================================

class ArbitrageScanner {
  private config: ArbitrageConfig;
  private prices: Map<string, ExchangePrice> = new Map();
  private fundingRates: Map<string, FundingRate> = new Map();
  private opportunities: Map<string, ArbitrageOpportunity> = new Map();
  private scanInterval: NodeJS.Timeout | null = null;
  private isScanning: boolean = false;

  constructor(config: Partial<ArbitrageConfig> = {}) {
    this.config = {
      minSpreadPercent: 0.1,
      minProfitUsdt: 5,
      maxCapitalPerTrade: 1000,
      maxExecutionTimeMs: 5000,
      feeBuffer: 0.0002,
      enabledExchanges: ['binance', 'bybit', 'okx', 'bitget'],
      enabledSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      priceTimeoutMs: 5000,
      ...config,
    };
  }

  /**
   * Configure scanner
   */
  configure(config: Partial<ArbitrageConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update price for an exchange
   */
  updatePrice(price: ExchangePrice): void {
    const key = `${price.exchange}:${price.symbol}`;
    this.prices.set(key, price);
  }

  /**
   * Update funding rate
   */
  updateFundingRate(funding: FundingRate): void {
    const key = `${funding.exchange}:${funding.symbol}`;
    this.fundingRates.set(key, funding);
  }

  /**
   * Start scanning for opportunities
   */
  startScanning(intervalMs: number = 1000): void {
    if (this.scanInterval) return;

    this.isScanning = true;
    this.scanInterval = setInterval(() => this.scan(), intervalMs);
    console.log('[Arbitrage] Scanner started');
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isScanning = false;
    console.log('[Arbitrage] Scanner stopped');
  }

  /**
   * Scan for all types of opportunities
   */
  private scan(): void {
    const now = Date.now();

    // Scan price arbitrage
    for (const symbol of this.config.enabledSymbols) {
      this.scanPriceArbitrage(symbol, now);
    }

    // Scan funding arbitrage
    for (const symbol of this.config.enabledSymbols) {
      this.scanFundingArbitrage(symbol, now);
    }

    // Remove expired opportunities
    this.cleanExpiredOpportunities(now);
  }

  /**
   * Scan for price arbitrage opportunities
   */
  private scanPriceArbitrage(symbol: string, now: number): void {
    const prices: ExchangePrice[] = [];

    // Collect all prices for symbol
    for (const exchange of this.config.enabledExchanges) {
      const key = `${exchange}:${symbol}`;
      const price = this.prices.get(key);

      if (price && now - price.timestamp < this.config.priceTimeoutMs) {
        prices.push(price);
      }
    }

    if (prices.length < 2) return;

    // Find best bid and ask across exchanges
    let bestBid: ExchangePrice | null = null;
    let bestAsk: ExchangePrice | null = null;

    for (const price of prices) {
      if (!bestBid || price.bidPrice > bestBid.bidPrice) {
        bestBid = price;
      }
      if (!bestAsk || price.askPrice < bestAsk.askPrice) {
        bestAsk = price;
      }
    }

    if (!bestBid || !bestAsk) return;
    if (bestBid.exchange === bestAsk.exchange) return;

    // Calculate spread
    const spread = bestBid.bidPrice - bestAsk.askPrice;
    const spreadPercent = (spread / bestAsk.askPrice) * 100;

    if (spreadPercent < this.config.minSpreadPercent) return;

    // Calculate fees
    const buyFees = this.calculateFees(bestAsk.exchange, bestAsk.askPrice);
    const sellFees = this.calculateFees(bestBid.exchange, bestBid.bidPrice);
    const totalFees = buyFees + sellFees + (this.config.feeBuffer * 2);

    // Calculate profit
    const quantity = this.config.maxCapitalPerTrade / bestAsk.askPrice;
    const estimatedProfit = spread * quantity;
    const netProfit = estimatedProfit - totalFees;

    if (netProfit < this.config.minProfitUsdt) return;

    // Create opportunity
    const opportunity: ArbitrageOpportunity = {
      id: `price-${symbol}-${bestAsk.exchange}-${bestBid.exchange}-${now}`,
      type: 'price',
      symbol,
      buyExchange: bestAsk.exchange,
      sellExchange: bestBid.exchange,
      buyPrice: bestAsk.askPrice,
      sellPrice: bestBid.bidPrice,
      spreadPercent,
      estimatedProfit,
      estimatedFees: totalFees,
      netProfit,
      requiredCapital: this.config.maxCapitalPerTrade,
      executionTime: 100, // estimate
      confidence: 0.9,
      timestamp: now,
      expiresAt: now + 5000,
    };

    this.opportunities.set(opportunity.id, opportunity);
  }

  /**
   * Scan for funding rate arbitrage
   */
  private scanFundingArbitrage(symbol: string, now: number): void {
    const fundings: FundingRate[] = [];

    // Collect all funding rates for symbol
    for (const exchange of this.config.enabledExchanges) {
      const key = `${exchange}:${symbol}`;
      const funding = this.fundingRates.get(key);

      if (funding) {
        fundings.push(funding);
      }
    }

    if (fundings.length < 2) return;

    // Find highest and lowest funding rates
    let highest: FundingRate | null = null;
    let lowest: FundingRate | null = null;

    for (const f of fundings) {
      if (!highest || f.rate > highest.rate) {
        highest = f;
      }
      if (!lowest || f.rate < lowest.rate) {
        lowest = f;
      }
    }

    if (!highest || !lowest) return;
    if (highest.exchange === lowest.exchange) return;

    // Funding rate spread
    const fundingSpread = highest.rate - lowest.rate;

    // Need at least 0.01% spread (0.0001)
    if (fundingSpread < 0.0001) return;

    // Estimate 8-hour profit (typical funding interval)
    const quantity = this.config.maxCapitalPerTrade;
    const estimatedProfit = fundingSpread * quantity;

    if (estimatedProfit < this.config.minProfitUsdt) return;

    // Create opportunity
    const opportunity: ArbitrageOpportunity = {
      id: `funding-${symbol}-${lowest.exchange}-${highest.exchange}-${now}`,
      type: 'funding',
      symbol,
      buyExchange: lowest.exchange, // Go long where funding is negative (receiving)
      sellExchange: highest.exchange, // Go short where funding is positive (receiving)
      buyPrice: 0, // Would need current price
      sellPrice: 0,
      spreadPercent: fundingSpread * 100,
      estimatedProfit,
      estimatedFees: 0, // Funding arbitrage has no immediate fees
      netProfit: estimatedProfit,
      requiredCapital: this.config.maxCapitalPerTrade * 2, // Need both positions
      executionTime: 1000,
      confidence: 0.7, // Lower confidence due to market risk
      timestamp: now,
      expiresAt: now + 8 * 60 * 60 * 1000, // 8 hours
    };

    this.opportunities.set(opportunity.id, opportunity);
  }

  /**
   * Calculate fees for an exchange
   */
  private calculateFees(exchange: string, price: number): number {
    const fees = EXCHANGE_FEES[exchange] || { maker: 0.0004, taker: 0.0004 };
    return price * (fees.maker + fees.taker) * (this.config.maxCapitalPerTrade / price);
  }

  /**
   * Remove expired opportunities
   */
  private cleanExpiredOpportunities(now: number): void {
    for (const [id, opp] of this.opportunities) {
      if (opp.expiresAt < now) {
        this.opportunities.delete(id);
      }
    }
  }

  /**
   * Get all current opportunities
   */
  getOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.opportunities.values())
      .sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * Get best opportunity
   */
  getBestOpportunity(): ArbitrageOpportunity | null {
    const opps = this.getOpportunities();
    return opps.length > 0 ? opps[0] : null;
  }

  /**
   * Get opportunity by ID
   */
  getOpportunity(id: string): ArbitrageOpportunity | undefined {
    return this.opportunities.get(id);
  }

  /**
   * Check if scanning
   */
  isRunning(): boolean {
    return this.isScanning;
  }
}

// ============================================================================
// ARBITRAGE EXECUTOR
// ============================================================================

class ArbitrageExecutor {
  private executionHistory: ExecutionResult[] = [];
  private maxHistorySize: number = 1000;

  /**
   * Execute an arbitrage opportunity
   */
  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    const trades: ArbitrageTrade[] = [];

    try {
      // Execute buy side
      const buyTrade = await this.executeSide(
        opportunity.buyExchange,
        opportunity.symbol,
        'BUY',
        opportunity.buyPrice,
        opportunity.requiredCapital / opportunity.buyPrice
      );
      trades.push(buyTrade);

      // Execute sell side
      const sellTrade = await this.executeSide(
        opportunity.sellExchange,
        opportunity.symbol,
        'SELL',
        opportunity.sellPrice,
        opportunity.requiredCapital / opportunity.sellPrice
      );
      trades.push(sellTrade);

      // Calculate actual profit
      const profit = (sellTrade.price - buyTrade.price) * buyTrade.quantity;
      const fees = this.calculateExecutionFees(trades);

      const result: ExecutionResult = {
        opportunityId: opportunity.id,
        success: true,
        profit,
        fees,
        executionTime: Date.now() - startTime,
        trades,
      };

      this.addToHistory(result);
      return result;
    } catch (error) {
      const result: ExecutionResult = {
        opportunityId: opportunity.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
        trades,
      };

      this.addToHistory(result);
      return result;
    }
  }

  /**
   * Execute a single side (simulated)
   */
  private async executeSide(
    exchange: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    price: number,
    quantity: number
  ): Promise<ArbitrageTrade> {
    // In production, this would call the exchange API
    // For now, simulate execution
    await new Promise(resolve => setTimeout(resolve, 50));

    return {
      exchange,
      symbol,
      side,
      price,
      quantity,
      orderId: `${exchange}-${Date.now()}`,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate fees from trades
   */
  private calculateExecutionFees(trades: ArbitrageTrade[]): number {
    let totalFees = 0;

    for (const trade of trades) {
      const fees = EXCHANGE_FEES[trade.exchange] || { maker: 0.0004, taker: 0.0004 };
      totalFees += trade.price * trade.quantity * fees.taker;
    }

    return totalFees;
  }

  /**
   * Add to execution history
   */
  private addToHistory(result: ExecutionResult): void {
    this.executionHistory.push(result);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get execution history
   */
  getHistory(limit: number = 100): ExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    successful: number;
    failed: number;
    totalProfit: number;
    totalFees: number;
    avgExecutionTime: number;
  } {
    const successful = this.executionHistory.filter(r => r.success);
    const failed = this.executionHistory.filter(r => !r.success);

    return {
      totalExecutions: this.executionHistory.length,
      successful: successful.length,
      failed: failed.length,
      totalProfit: successful.reduce((sum, r) => sum + (r.profit || 0), 0),
      totalFees: successful.reduce((sum, r) => sum + (r.fees || 0), 0),
      avgExecutionTime: this.executionHistory.length > 0
        ? this.executionHistory.reduce((sum, r) => sum + r.executionTime, 0) / this.executionHistory.length
        : 0,
    };
  }
}

// ============================================================================
// SINGLETON EXPORTS
// ============================================================================

export const arbitrageScanner = new ArbitrageScanner();
export const arbitrageExecutor = new ArbitrageExecutor();

export default {
  scanner: arbitrageScanner,
  executor: arbitrageExecutor,
};
