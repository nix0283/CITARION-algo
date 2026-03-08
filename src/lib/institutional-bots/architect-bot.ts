/**
 * ARCHITECT BOT - Market Making
 *
 * Provides liquidity by quoting bid/ask spreads.
 * Uses inventory-based pricing and adverse selection protection.
 * 
 * NO NEURAL NETWORKS - Classical market making algorithms only.
 */

import type {
  ArchitectConfig,
  ArchitectState,
  Quote,
  InventoryState,
  MarketMakingOrder,
  MarketMakingStats,
  BotStatus,
} from './types';

export class ArchitectBot {
  private config: ArchitectConfig;
  private state: ArchitectState;
  private priceHistory: Map<string, number[]> = new Map();
  private lastQuotes: Map<string, Quote> = new Map();

  constructor(config: Partial<ArchitectConfig> = {}) {
    this.config = {
      name: 'Architect',
      code: 'MM',
      version: '1.0.0',
      mode: 'PAPER',
      exchanges: [],
      riskConfig: {
        maxPositionSize: 5000,
        maxTotalExposure: 50000,
        maxDrawdownPct: 0.05,
        riskPerTrade: 0.005,
        maxLeverage: 1,
      },
      notifications: {
        telegram: false,
        email: false,
        onSignal: false,
        onTrade: true,
        onRiskEvent: true,
      },
      logLevel: 'INFO',
      strategy: {
        baseSpreadPct: 0.002,
        minSpreadPct: 0.0005,
        maxSpreadPct: 0.01,
        orderSize: 100,
        maxInventory: 1000,
        inventorySkewFactor: 0.1,
        refreshRate: 1000,
        adverseSelectionProtection: true,
        latencyMs: 50,
        volatilityAdjustment: true,
      },
      ...config,
    };

    this.state = {
      status: 'STOPPED',
      quotes: new Map(),
      inventory: new Map(),
      orders: new Map(),
      stats: {
        totalVolume: 0,
        capturedSpread: 0,
        inventoryPnl: 0,
        totalPnl: 0,
        fillRate: 0,
        avgSpread: 0,
        adverseSelectionCost: 0,
        sharpeRatio: 0,
      },
    };
  }

  /**
   * Start the bot
   */
  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.state.status !== 'STOPPED') {
      return { success: false, message: 'Bot already running' };
    }

    this.state.status = 'STARTING';
    this.state.status = 'RUNNING';

    return { success: true, message: 'Architect started' };
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    this.state.status = 'STOPPED';
    return { success: true, message: 'Architect stopped' };
  }

  /**
   * Generate quotes for a symbol
   */
  public generateQuotes(symbol: string, midPrice: number, volatility?: number): Quote {
    // Get or create inventory state
    let inventory = this.state.inventory.get(symbol);
    if (!inventory) {
      inventory = {
        symbol,
        netPosition: 0,
        avgCost: midPrice,
        unrealizedPnl: 0,
        targetInventory: 0,
        skew: 0,
      };
      this.state.inventory.set(symbol, inventory);
    }

    // Calculate base spread
    let spreadPct = this.config.strategy.baseSpreadPct;

    // Volatility adjustment
    if (this.config.strategy.volatilityAdjustment && volatility) {
      const volMultiplier = 1 + (volatility - 0.02) * 10; // Adjust for volatility
      spreadPct *= Math.max(0.5, Math.min(2, volMultiplier));
    }

    // Calculate inventory skew
    const inventoryRatio = inventory.netPosition / this.config.strategy.maxInventory;
    const skew = inventoryRatio * this.config.strategy.inventorySkewFactor;

    // Adjust prices for inventory
    const midPriceAdjusted = midPrice * (1 - skew);

    // Calculate bid/ask prices
    const halfSpread = midPriceAdjusted * spreadPct / 2;
    let bidPrice = midPriceAdjusted - halfSpread;
    let askPrice = midPriceAdjusted + halfSpread;

    // Adverse selection protection
    if (this.config.strategy.adverseSelectionProtection) {
      const recentPrices = this.priceHistory.get(symbol) || [];
      if (recentPrices.length > 10) {
        const trend = this.detectTrend(recentPrices.slice(-10));
        
        // Widen spread in direction of adverse selection
        if (trend > 0.001) {
          askPrice += halfSpread * 0.2; // Widen ask
        } else if (trend < -0.001) {
          bidPrice -= halfSpread * 0.2; // Widen bid
        }
      }
    }

    // Ensure spread limits
    const actualSpread = (askPrice - bidPrice) / midPrice;
    if (actualSpread < this.config.strategy.minSpreadPct) {
      const adjustment = midPrice * (this.config.strategy.minSpreadPct - actualSpread) / 2;
      bidPrice -= adjustment;
      askPrice += adjustment;
    } else if (actualSpread > this.config.strategy.maxSpreadPct) {
      const adjustment = midPrice * (actualSpread - this.config.strategy.maxSpreadPct) / 2;
      bidPrice += adjustment;
      askPrice -= adjustment;
    }

    // Calculate order sizes with inventory consideration
    let bidSize = this.config.strategy.orderSize;
    let askSize = this.config.strategy.orderSize;

    // Reduce size on the side we have inventory
    if (inventory.netPosition > 0) {
      askSize = Math.max(this.config.strategy.orderSize * 0.5, 
                         this.config.strategy.orderSize * (1 - inventoryRatio));
    } else if (inventory.netPosition < 0) {
      bidSize = Math.max(this.config.strategy.orderSize * 0.5,
                         this.config.strategy.orderSize * (1 + inventoryRatio));
    }

    const quote: Quote = {
      bidPrice,
      bidSize,
      askPrice,
      askSize,
      spread: (askPrice - bidPrice) / midPrice,
      midPrice: midPriceAdjusted,
      timestamp: Date.now(),
    };

    this.state.quotes.set(symbol, quote);
    this.lastQuotes.set(symbol, quote);

    // Update price history
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    this.priceHistory.get(symbol)!.push(midPrice);
    if (this.priceHistory.get(symbol)!.length > 100) {
      this.priceHistory.get(symbol)!.shift();
    }

    return quote;
  }

  /**
   * Handle order fill
   */
  public handleFill(
    symbol: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number
  ): MarketMakingOrder {
    const inventory = this.state.inventory.get(symbol);
    if (!inventory) {
      throw new Error(`No inventory state for ${symbol}`);
    }

    // Update inventory
    if (side === 'BUY') {
      const totalCost = inventory.avgCost * Math.abs(inventory.netPosition) + price * size;
      inventory.netPosition += size;
      inventory.avgCost = totalCost / Math.abs(inventory.netPosition);
    } else {
      if (inventory.netPosition > 0) {
        // Realize PnL for sold inventory
        const realizedPnl = (price - inventory.avgCost) * Math.min(size, inventory.netPosition);
        this.state.stats.inventoryPnl += realizedPnl;
      }
      inventory.netPosition -= size;
    }

    // Update stats
    this.state.stats.totalVolume += size * price;
    const lastQuote = this.lastQuotes.get(symbol);
    this.state.stats.capturedSpread += size * price * (lastQuote?.spread || 0);

    // Create order record
    const order: MarketMakingOrder = {
      id: `ord-${symbol}-${Date.now()}`,
      symbol,
      side,
      price,
      size,
      status: 'FILLED',
      filledSize: size,
      timestamp: Date.now(),
    };

    this.state.orders.set(order.id, order);

    // Calculate adverse selection cost
    const currentMid = this.lastQuotes.get(symbol)?.midPrice || price;
    const adverseCost = side === 'BUY' 
      ? Math.max(0, currentMid - price) * size
      : Math.max(0, price - currentMid) * size;
    this.state.stats.adverseSelectionCost += adverseCost;

    // Update total PnL
    this.state.stats.totalPnl = this.state.stats.inventoryPnl + this.state.stats.capturedSpread;

    return order;
  }

  /**
   * Update inventory with current price
   */
  public updateInventory(symbol: string, currentPrice: number): void {
    const inventory = this.state.inventory.get(symbol);
    if (!inventory) return;

    inventory.unrealizedPnl = (currentPrice - inventory.avgCost) * inventory.netPosition;
    inventory.skew = inventory.netPosition / this.config.strategy.maxInventory;
  }

  /**
   * Detect price trend for adverse selection protection
   */
  private detectTrend(prices: number[]): number {
    if (prices.length < 2) return 0;
    const first = prices.slice(0, prices.length / 2);
    const second = prices.slice(prices.length / 2);
    
    const avgFirst = first.reduce((s, p) => s + p, 0) / first.length;
    const avgSecond = second.reduce((s, p) => s + p, 0) / second.length;
    
    return (avgSecond - avgFirst) / avgFirst;
  }

  /**
   * Calculate optimal spread based on volatility and inventory
   */
  public calculateOptimalSpread(
    symbol: string,
    volatility: number,
    orderArrivalRate: number
  ): number {
    // Avellaneda-Stoikov spread approximation
    // spread = gamma * sigma^2 * T + 2 * ln(1 + gamma/k) / gamma
    // Simplified version
    
    const gamma = 0.1; // Risk aversion
    const T = 1; // Time to liquidation
    const k = orderArrivalRate;

    const inventory = this.state.inventory.get(symbol);
    const q = inventory?.netPosition || 0;
    
    const spread = gamma * volatility * volatility * T + 
                   2 * Math.log(1 + gamma / k) / gamma;
    
    // Adjust for inventory
    const inventoryAdj = 2 * gamma * volatility * Math.sqrt(T) * q / 
                         this.config.strategy.maxInventory;
    
    return Math.max(
      this.config.strategy.minSpreadPct,
      Math.min(this.config.strategy.maxSpreadPct, spread + inventoryAdj)
    );
  }

  /**
   * Check if we should pause quoting
   */
  public shouldPause(symbol: string): boolean {
    const inventory = this.state.inventory.get(symbol);
    if (!inventory) return false;

    // Pause if inventory too large
    if (Math.abs(inventory.netPosition) >= this.config.strategy.maxInventory * 0.9) {
      return true;
    }

    return false;
  }

  /**
   * Get current state
   */
  public getState(): ArchitectState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  public getConfig(): ArchitectConfig {
    return { ...this.config };
  }

  /**
   * Get inventory for symbol
   */
  public getInventory(symbol: string): InventoryState | null {
    return this.state.inventory.get(symbol) || null;
  }

  /**
   * Get current quote for symbol
   */
  public getCurrentQuote(symbol: string): Quote | null {
    return this.state.quotes.get(symbol) || null;
  }

  /**
   * Get statistics
   */
  public getStats(): MarketMakingStats {
    return { ...this.state.stats };
  }
}
