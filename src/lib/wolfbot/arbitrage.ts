/**
 * Arbitrage Module
 * Ported from WolfBot - Cross-exchange arbitrage opportunities
 * 
 * Features:
 * - Price comparison across exchanges
 * - Fee calculation for profitability
 * - Opportunity detection and alerts
 * - Execution simulation
 */

import { ExchangeClient } from '../exchange/types';

// ============== Types ==============

export interface ArbitragePair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface ExchangePrice {
  exchange: string;
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  timestamp: number;
}

export interface ArbitrageOpportunity {
  id: string;
  pair: ArbitragePair;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number; // Percentage
  spreadAbsolute: number; // Absolute value
  estimatedProfit: number; // After fees
  profitPercent: number;
  volume: number; // Recommended volume
  fees: {
    buyFee: number;
    sellFee: number;
    totalFees: number;
  };
  timestamp: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'executed';
}

export interface ArbitrageConfig {
  minSpreadPercent: number; // Minimum spread to consider
  minProfitPercent: number; // Minimum profit after fees
  maxVolumePercent: number; // Max volume relative to 24h volume
  feeBuffer: number; // Extra buffer for fees
  priceStaleness: number; // Max age of price data in ms
  exchanges: string[]; // Exchanges to monitor
  pairs: string[]; // Trading pairs to monitor
}

export interface ExchangeFee {
  maker: number;
  taker: number;
  withdrawal?: number; // Withdrawal fee (if needed)
}

export interface ArbitrageStats {
  totalOpportunities: number;
  executedTrades: number;
  totalProfit: number;
  avgSpread: number;
  bestSpread: number;
  byPair: Map<string, { count: number; profit: number }>;
  byExchange: Map<string, { count: number; profit: number }>;
}

// ============== Default Config ==============

export const DEFAULT_ARBITRAGE_CONFIG: ArbitrageConfig = {
  minSpreadPercent: 0.5, // 0.5% minimum spread
  minProfitPercent: 0.3, // 0.3% minimum profit after fees
  maxVolumePercent: 0.1, // Max 0.1% of 24h volume
  feeBuffer: 0.001, // 0.1% extra buffer
  priceStaleness: 5000, // 5 seconds
  exchanges: ['binance', 'bybit', 'okx', 'bitget'],
  pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT']
};

// ============== Exchange Fees ==============

export const EXCHANGE_FEES: Record<string, ExchangeFee> = {
  binance: { maker: 0.001, taker: 0.001 },
  bybit: { maker: 0.001, taker: 0.001 },
  okx: { maker: 0.0008, taker: 0.001 },
  bitget: { maker: 0.0002, taker: 0.0006 },
  bingx: { maker: 0.001, taker: 0.001 },
  kucoin: { maker: 0.001, taker: 0.001 },
  coinbase: { maker: 0.005, taker: 0.005 },
  kraken: { maker: 0.0016, taker: 0.0026 }
};

// ============== Arbitrage Engine ==============

export class ArbitrageEngine {
  private config: ArbitrageConfig;
  private prices: Map<string, Map<string, ExchangePrice>> = new Map(); // pair -> exchange -> price
  private opportunities: Map<string, ArbitrageOpportunity> = new Map();
  private stats: ArbitrageStats;
  
  constructor(config: Partial<ArbitrageConfig> = {}) {
    this.config = { ...DEFAULT_ARBITRAGE_CONFIG, ...config };
    
    this.stats = {
      totalOpportunities: 0,
      executedTrades: 0,
      totalProfit: 0,
      avgSpread: 0,
      bestSpread: 0,
      byPair: new Map(),
      byExchange: new Map()
    };
    
    // Initialize price maps
    for (const pair of this.config.pairs) {
      this.prices.set(pair, new Map());
    }
  }
  
  /**
   * Update price for an exchange/pair
   */
  updatePrice(exchange: string, symbol: string, price: ExchangePrice): void {
    const pairPrices = this.prices.get(symbol);
    if (pairPrices) {
      pairPrices.set(exchange, price);
    }
  }
  
  /**
   * Scan for arbitrage opportunities
   */
  scan(): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    const now = Date.now();
    
    for (const [pair, exchangePrices] of this.prices) {
      const exchanges = Array.from(exchangePrices.entries());
      
      // Compare all exchange pairs
      for (let i = 0; i < exchanges.length; i++) {
        for (let j = i + 1; j < exchanges.length; j++) {
          const [ex1, price1] = exchanges[i];
          const [ex2, price2] = exchanges[j];
          
          // Check price staleness
          if (now - price1.timestamp > this.config.priceStaleness ||
              now - price2.timestamp > this.config.priceStaleness) {
            continue;
          }
          
          // Check both directions
          const opp1 = this.checkOpportunity(pair, ex1, price1, ex2, price2);
          const opp2 = this.checkOpportunity(pair, ex2, price2, ex1, price1);
          
          if (opp1) opportunities.push(opp1);
          if (opp2) opportunities.push(opp2);
        }
      }
    }
    
    // Sort by profit
    opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
    
    // Update stats
    this.stats.totalOpportunities += opportunities.length;
    if (opportunities.length > 0) {
      this.stats.bestSpread = Math.max(this.stats.bestSpread, ...opportunities.map(o => o.spread));
      this.stats.avgSpread = (this.stats.avgSpread + opportunities.reduce((s, o) => s + o.spread, 0) / opportunities.length) / 2;
    }
    
    return opportunities;
  }
  
  /**
   * Check for opportunity between two exchanges
   */
  private checkOpportunity(
    pair: string,
    buyExchange: string,
    buyPrice: ExchangePrice,
    sellExchange: string,
    sellPrice: ExchangePrice
  ): ArbitrageOpportunity | null {
    // Buy at ask price, sell at bid price
    const buyRate = buyPrice.ask; // We buy at the ask
    const sellRate = sellPrice.bid; // We sell at the bid
    
    // Calculate spread
    const spreadAbsolute = sellRate - buyRate;
    const spread = (spreadAbsolute / buyRate) * 100;
    
    // Check minimum spread
    if (spread < this.config.minSpreadPercent) return null;
    
    // Calculate fees
    const buyFeeRate = EXCHANGE_FEES[buyExchange]?.taker || 0.001;
    const sellFeeRate = EXCHANGE_FEES[sellExchange]?.taker || 0.001;
    
    // Calculate recommended volume (based on 24h volume)
    const maxVolume = Math.min(
      buyPrice.volume24h * this.config.maxVolumePercent,
      sellPrice.volume24h * this.config.maxVolumePercent
    );
    
    const volume = Math.min(maxVolume, 10000); // Cap at $10k per trade
    
    // Calculate actual profit
    const buyCost = volume * buyRate;
    const buyFee = buyCost * buyFeeRate;
    const totalBuyCost = buyCost + buyFee;
    
    const sellProceeds = volume * sellRate;
    const sellFee = sellProceeds * sellFeeRate;
    const totalSellProceeds = sellProceeds - sellFee;
    
    const grossProfit = totalSellProceeds - totalBuyCost;
    const feeBuffer = (totalBuyCost + totalSellProceeds) * this.config.feeBuffer;
    const estimatedProfit = grossProfit - feeBuffer;
    const profitPercent = (estimatedProfit / totalBuyCost) * 100;
    
    // Check minimum profit after fees
    if (profitPercent < this.config.minProfitPercent) return null;
    
    const id = `${pair}-${buyExchange}-${sellExchange}-${Date.now()}`;
    
    return {
      id,
      pair: {
        symbol: pair,
        baseAsset: pair.split('/')[0],
        quoteAsset: pair.split('/')[1]
      },
      buyExchange,
      sellExchange,
      buyPrice: buyRate,
      sellPrice: sellRate,
      spread,
      spreadAbsolute,
      estimatedProfit,
      profitPercent,
      volume,
      fees: {
        buyFee: buyFeeRate * 100,
        sellFee: sellFeeRate * 100,
        totalFees: (buyFeeRate + sellFeeRate) * 100
      },
      timestamp: Date.now(),
      expiresAt: Date.now() + 30000, // 30 seconds TTL
      status: 'active'
    };
  }
  
  /**
   * Get all active opportunities
   */
  getActiveOpportunities(): ArbitrageOpportunity[] {
    const now = Date.now();
    const active: ArbitrageOpportunity[] = [];
    
    for (const [id, opp] of this.opportunities) {
      if (opp.status === 'active' && opp.expiresAt > now) {
        active.push(opp);
      } else if (opp.expiresAt <= now) {
        opp.status = 'expired';
      }
    }
    
    return active.sort((a, b) => b.profitPercent - a.profitPercent);
  }
  
  /**
   * Simulate arbitrage execution
   */
  simulateExecution(opportunity: ArbitrageOpportunity): {
    success: boolean;
    actualProfit: number;
    slippage: number;
    executionTime: number;
    errors: string[];
  } {
    const errors: string[] = [];
    let success = true;
    
    // Simulate slippage (random 0-0.2%)
    const slippage = Math.random() * 0.2;
    
    // Adjust prices for slippage
    const adjustedBuyPrice = opportunity.buyPrice * (1 + slippage / 100);
    const adjustedSellPrice = opportunity.sellPrice * (1 - slippage / 100);
    
    // Recalculate profit
    const buyCost = opportunity.volume * adjustedBuyPrice;
    const buyFee = buyCost * (opportunity.fees.buyFee / 100);
    const totalBuyCost = buyCost + buyFee;
    
    const sellProceeds = opportunity.volume * adjustedSellPrice;
    const sellFee = sellProceeds * (opportunity.fees.sellFee / 100);
    const totalSellProceeds = sellProceeds - sellFee;
    
    const actualProfit = totalSellProceeds - totalBuyCost;
    
    // Check if still profitable after slippage
    if (actualProfit < 0) {
      success = false;
      errors.push('Not profitable after slippage');
    }
    
    // Simulate execution time (100-500ms)
    const executionTime = 100 + Math.random() * 400;
    
    return {
      success,
      actualProfit,
      slippage,
      executionTime,
      errors
    };
  }
  
  /**
   * Mark opportunity as executed
   */
  markExecuted(id: string, actualProfit: number): void {
    const opp = this.opportunities.get(id);
    if (opp) {
      opp.status = 'executed';
      this.stats.executedTrades++;
      this.stats.totalProfit += actualProfit;
      
      // Update pair stats
      const pairStats = this.stats.byPair.get(opp.pair.symbol) || { count: 0, profit: 0 };
      pairStats.count++;
      pairStats.profit += actualProfit;
      this.stats.byPair.set(opp.pair.symbol, pairStats);
      
      // Update exchange stats
      const buyStats = this.stats.byExchange.get(opp.buyExchange) || { count: 0, profit: 0 };
      buyStats.count++;
      buyStats.profit += actualProfit / 2;
      this.stats.byExchange.set(opp.buyExchange, buyStats);
      
      const sellStats = this.stats.byExchange.get(opp.sellExchange) || { count: 0, profit: 0 };
      sellStats.count++;
      sellStats.profit += actualProfit / 2;
      this.stats.byExchange.set(opp.sellExchange, sellStats);
    }
  }
  
  /**
   * Get statistics
   */
  getStats(): ArbitrageStats {
    return this.stats;
  }
  
  /**
   * Get config
   */
  getConfig(): ArbitrageConfig {
    return this.config;
  }
  
  /**
   * Update config
   */
  updateConfig(config: Partial<ArbitrageConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============== Price Monitor ==============

export interface PriceMonitorConfig {
  updateInterval: number; // ms
  exchanges: Map<string, ExchangeClient>;
  symbols: string[];
  onPriceUpdate?: (exchange: string, symbol: string, price: ExchangePrice) => void;
  onOpportunity?: (opportunity: ArbitrageOpportunity) => void;
}

export class PriceMonitor {
  private config: PriceMonitorConfig;
  private engine: ArbitrageEngine;
  private intervalId: NodeJS.Timeout | null = null;
  private running: boolean = false;
  
  constructor(config: PriceMonitorConfig, arbitrageConfig: Partial<ArbitrageConfig> = {}) {
    this.config = config;
    this.engine = new ArbitrageEngine({
      ...arbitrageConfig,
      exchanges: Array.from(config.exchanges.keys()),
      pairs: config.symbols
    });
  }
  
  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.running) return;
    
    this.running = true;
    
    this.intervalId = setInterval(async () => {
      await this.fetchPrices();
      const opportunities = this.engine.scan();
      
      for (const opp of opportunities) {
        this.config.onOpportunity?.(opp);
      }
    }, this.config.updateInterval);
    
    // Initial fetch
    await this.fetchPrices();
  }
  
  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }
  
  /**
   * Fetch prices from all exchanges
   */
  private async fetchPrices(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [exchangeName, client] of this.config.exchanges) {
      for (const symbol of this.config.symbols) {
        promises.push(this.fetchExchangePrice(exchangeName, client, symbol));
      }
    }
    
    await Promise.allSettled(promises);
  }
  
  /**
   * Fetch price from single exchange
   */
  private async fetchExchangePrice(
    exchange: string,
    client: ExchangeClient,
    symbol: string
  ): Promise<void> {
    try {
      const ticker = await client.getTicker(symbol);
      
      const price: ExchangePrice = {
        exchange,
        symbol,
        bid: ticker.bid,
        ask: ticker.ask,
        last: ticker.last,
        volume24h: ticker.volume24h || 0,
        timestamp: Date.now()
      };
      
      this.engine.updatePrice(exchange, symbol, price);
      this.config.onPriceUpdate?.(exchange, symbol, price);
    } catch (error) {
      console.error(`Failed to fetch ${symbol} from ${exchange}:`, error);
    }
  }
  
  /**
   * Get arbitrage engine
   */
  getEngine(): ArbitrageEngine {
    return this.engine;
  }
  
  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// ============== Utility Functions ==============

/**
 * Calculate triangular arbitrage opportunity
 * (e.g., BTC/USDT -> ETH/BTC -> ETH/USDT -> BTC/USDT)
 */
export function calculateTriangularArbitrage(
  prices: Map<string, ExchangePrice>,
  path: string[], // e.g., ['BTC/USDT', 'ETH/BTC', 'ETH/USDT']
  startingAmount: number = 1000
): { profit: number; profitPercent: number; valid: boolean } {
  let amount = startingAmount;
  let currentAsset = path[0].split('/')[1]; // Starting quote asset
  
  for (const pair of path) {
    const [base, quote] = pair.split('/');
    const price = prices.get(pair);
    
    if (!price) {
      return { profit: 0, profitPercent: 0, valid: false };
    }
    
    if (currentAsset === quote) {
      // Buy base asset
      amount = amount / price.ask;
      currentAsset = base;
    } else if (currentAsset === base) {
      // Sell base asset
      amount = amount * price.bid;
      currentAsset = quote;
    } else {
      return { profit: 0, profitPercent: 0, valid: false };
    }
  }
  
  const profit = amount - startingAmount;
  const profitPercent = (profit / startingAmount) * 100;
  
  return {
    profit,
    profitPercent,
    valid: amount > startingAmount
  };
}

/**
 * Find best triangular arbitrage path
 */
export function findBestTriangularPath(
  prices: Map<string, ExchangePrice>,
  baseAsset: string = 'USDT',
  startingAmount: number = 1000
): { path: string[]; profit: number; profitPercent: number } | null {
  // Build asset graph
  const assets = new Set<string>();
  const pairs = Array.from(prices.keys());
  
  for (const pair of pairs) {
    const [base, quote] = pair.split('/');
    assets.add(base);
    assets.add(quote);
  }
  
  let bestPath: string[] | null = null;
  let bestProfit = 0;
  let bestProfitPercent = 0;
  
  // Try all possible 3-step paths
  const otherAssets = Array.from(assets).filter(a => a !== baseAsset);
  
  for (const middleAsset of otherAssets) {
    const path = [
      `${middleAsset}/${baseAsset}`,
      ...pairs.filter(p => {
        const [b, q] = p.split('/');
        return (b === middleAsset || q === middleAsset) && 
               (b !== baseAsset && q !== baseAsset);
      })
    ];
    
    if (path.length < 3) continue;
    
    // Try combinations
    for (const finalPair of path.slice(1)) {
      const testPath = [path[0], finalPair, `${finalPair.split('/')[0]}/${baseAsset}`];
      const result = calculateTriangularArbitrage(prices, testPath, startingAmount);
      
      if (result.valid && result.profitPercent > bestProfitPercent) {
        bestPath = testPath;
        bestProfit = result.profit;
        bestProfitPercent = result.profitPercent;
      }
    }
  }
  
  if (bestPath) {
    return { path: bestPath, profit: bestProfit, profitPercent: bestProfitPercent };
  }
  
  return null;
}

// ============== Export ==============

export default ArbitrageEngine;
