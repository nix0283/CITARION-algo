/**
 * Optimized Order Book Manager
 * 
 * Based on Profitmaker's Order Book patterns with enhancements.
 * Provides efficient local order book management with:
 * - Snapshot + Delta processing
 * - Sequence validation
 * - Memory-efficient data structures
 * - Cross-exchange normalization
 */

// ==================== Types ====================

export interface PriceLevel {
  price: number;
  amount: number;
  total: number; // price * amount (cached for performance)
}

export interface OrderBookSnapshot {
  exchange: string;
  symbol: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  sequence: number;
  timestamp: number;
  checksum?: number;
}

export interface OrderBookDelta {
  exchange: string;
  symbol: string;
  bids: Array<[number, number]>; // [price, amount]
  asks: Array<[number, number]>;
  sequence: number;
  timestamp: number;
}

export interface OrderBookConfig {
  maxDepth: number;
  pricePrecision: number;
  amountPrecision: number;
  checksumValidation: boolean;
  sequenceValidation: boolean;
}

export interface OrderBookStats {
  spread: number;
  spreadPercent: number;
  midPrice: number;
  imbalance: number;
  totalBidLiquidity: number;
  totalAskLiquidity: number;
  bidVWAP: number;
  askVWAP: number;
}

// ==================== Optimized Data Structures ====================

/**
 * Sorted map implementation for efficient price level operations
 * Uses binary search for O(log n) insertions and deletions
 */
class SortedPriceLevels {
  private levels: PriceLevel[] = [];
  private priceIndex: Map<number, number> = new Map(); // price -> array index
  
  constructor(private ascending: boolean = true) {}

  /**
   * Update or insert a price level
   * O(log n) for search, O(n) worst case for insert
   */
  update(price: number, amount: number): boolean {
    // Check if price exists
    if (this.priceIndex.has(price)) {
      const idx = this.priceIndex.get(price)!;
      
      if (amount === 0) {
        // Remove level
        this.levels.splice(idx, 1);
        this.priceIndex.delete(price);
        this.rebuildIndex();
        return true;
      }
      
      // Update existing
      this.levels[idx].amount = amount;
      this.levels[idx].total = price * amount;
      return true;
    }

    if (amount === 0) return false;

    // Insert new level
    const level: PriceLevel = { price, amount, total: price * amount };
    
    // Binary search for insertion point
    let low = 0;
    let high = this.levels.length;
    
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const cmp = this.ascending 
        ? this.levels[mid].price - price
        : price - this.levels[mid].price;
      
      if (cmp < 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.levels.splice(low, 0, level);
    this.rebuildIndex();
    return true;
  }

  /**
   * Batch update for better performance
   */
  batchUpdate(updates: Array<[number, number]>): void {
    // Sort updates for better cache locality
    const sorted = [...updates].sort((a, b) => 
      this.ascending ? a[0] - b[0] : b[0] - a[0]
    );

    for (const [price, amount] of sorted) {
      this.update(price, amount);
    }
  }

  /**
   * Get top N levels
   */
  getTop(n: number): PriceLevel[] {
    return this.levels.slice(0, n);
  }

  /**
   * Get level at specific price
   */
  get(price: number): PriceLevel | undefined {
    const idx = this.priceIndex.get(price);
    return idx !== undefined ? this.levels[idx] : undefined;
  }

  /**
   * Get all levels
   */
  getAll(): PriceLevel[] {
    return this.levels;
  }

  /**
   * Get best price
   */
  getBest(): PriceLevel | undefined {
    return this.levels[0];
  }

  /**
   * Get total liquidity
   */
  getTotalLiquidity(): number {
    return this.levels.reduce((sum, l) => sum + l.total, 0);
  }

  /**
   * Get total amount
   */
  getTotalAmount(): number {
    return this.levels.reduce((sum, l) => sum + l.amount, 0);
  }

  /**
   * Calculate VWAP up to a certain depth
   */
  getVWAP(depth?: number): number {
    const levels = depth ? this.levels.slice(0, depth) : this.levels;
    const totalAmount = levels.reduce((sum, l) => sum + l.amount, 0);
    if (totalAmount === 0) return 0;
    
    const weightedSum = levels.reduce((sum, l) => sum + l.price * l.amount, 0);
    return weightedSum / totalAmount;
  }

  /**
   * Clear all levels
   */
  clear(): void {
    this.levels = [];
    this.priceIndex.clear();
  }

  /**
   * Get depth
   */
  getDepth(): number {
    return this.levels.length;
  }

  /**
   * Rebuild index after modifications
   */
  private rebuildIndex(): void {
    this.priceIndex.clear();
    for (let i = 0; i < this.levels.length; i++) {
      this.priceIndex.set(this.levels[i].price, i);
    }
  }
}

// ==================== Order Book Implementation ====================

/**
 * High-performance order book implementation
 */
export class OrderBook {
  private bids: SortedPriceLevels;
  private asks: SortedPriceLevels;
  private lastSequence: number = 0;
  private lastUpdate: number = 0;
  private pendingDeltas: OrderBookDelta[] = [];
  private initialized: boolean = false;

  constructor(
    public readonly exchange: string,
    public readonly symbol: string,
    private config: OrderBookConfig = {
      maxDepth: 1000,
      pricePrecision: 8,
      amountPrecision: 8,
      checksumValidation: false,
      sequenceValidation: true,
    }
  ) {
    this.bids = new SortedPriceLevels(false); // Descending
    this.asks = new SortedPriceLevels(true);  // Ascending
  }

  /**
   * Initialize with snapshot
   */
  initialize(snapshot: OrderBookSnapshot): void {
    this.bids.clear();
    this.asks.clear();

    // Process snapshot
    for (const level of snapshot.bids) {
      this.bids.update(level.price, level.amount);
    }
    for (const level of snapshot.asks) {
      this.asks.update(level.price, level.amount);
    }

    this.lastSequence = snapshot.sequence;
    this.lastUpdate = snapshot.timestamp;
    this.initialized = true;

    // Process any pending deltas
    this.processPendingDeltas();
  }

  /**
   * Apply delta update
   */
  applyDelta(delta: OrderBookDelta): boolean {
    // Validate sequence
    if (this.config.sequenceValidation && this.initialized) {
      if (delta.sequence <= this.lastSequence) {
        // Skip outdated update
        return false;
      }

      if (delta.sequence > this.lastSequence + 1) {
        // Gap detected, queue for later
        this.pendingDeltas.push(delta);
        return false;
      }
    }

    // Apply updates
    this.bids.batchUpdate(delta.bids);
    this.asks.batchUpdate(delta.asks);

    this.lastSequence = delta.sequence;
    this.lastUpdate = delta.timestamp;

    return true;
  }

  /**
   * Process pending deltas in order
   */
  private processPendingDeltas(): void {
    if (this.pendingDeltas.length === 0) return;

    // Sort by sequence
    this.pendingDeltas.sort((a, b) => a.sequence - b.sequence);

    // Apply in order
    const remaining: OrderBookDelta[] = [];
    
    for (const delta of this.pendingDeltas) {
      if (!this.applyDelta(delta)) {
        remaining.push(delta);
      }
    }

    this.pendingDeltas = remaining;
  }

  // ==================== Query Methods ====================

  /**
   * Get best bid
   */
  getBestBid(): PriceLevel | undefined {
    return this.bids.getBest();
  }

  /**
   * Get best ask
   */
  getBestAsk(): PriceLevel | undefined {
    return this.asks.getBest();
  }

  /**
   * Get bid levels
   */
  getBids(depth?: number): PriceLevel[] {
    return this.bids.getTop(depth || this.config.maxDepth);
  }

  /**
   * Get ask levels
   */
  getAsks(depth?: number): PriceLevel[] {
    return this.asks.getTop(depth || this.config.maxDepth);
  }

  /**
   * Get mid price
   */
  getMidPrice(): number | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    return (bestBid.price + bestAsk.price) / 2;
  }

  /**
   * Get spread
   */
  getSpread(): { absolute: number; percent: number } | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    const absolute = bestAsk.price - bestBid.price;
    const mid = (bestBid.price + bestAsk.price) / 2;
    const percent = (absolute / mid) * 100;
    
    return { absolute, percent };
  }

  /**
   * Get order book statistics
   */
  getStats(): OrderBookStats {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    const spread = this.getSpread();
    const midPrice = this.getMidPrice();

    const totalBidLiquidity = this.bids.getTotalLiquidity();
    const totalAskLiquidity = this.asks.getTotalLiquidity();

    const imbalance = totalBidLiquidity + totalAskLiquidity > 0
      ? (totalBidLiquidity - totalAskLiquidity) / (totalBidLiquidity + totalAskLiquidity)
      : 0;

    return {
      spread: spread?.absolute || 0,
      spreadPercent: spread?.percent || 0,
      midPrice: midPrice || 0,
      imbalance,
      totalBidLiquidity,
      totalAskLiquidity,
      bidVWAP: this.bids.getVWAP(),
      askVWAP: this.asks.getVWAP(),
    };
  }

  /**
   * Calculate market impact for a given size
   */
  calculateMarketImpact(size: number, side: 'buy' | 'sell'): {
    avgPrice: number;
    worstPrice: number;
    slippage: number;
  } {
    const levels = side === 'buy' ? this.asks : this.bids;
    let remaining = size;
    let totalCost = 0;
    let worstPrice = 0;
    const startingPrice = levels.getBest()?.price || 0;

    for (const level of levels.getAll()) {
      if (remaining <= 0) break;

      const fillAmount = Math.min(remaining, level.amount);
      totalCost += fillAmount * level.price;
      worstPrice = level.price;
      remaining -= fillAmount;
    }

    const avgPrice = totalCost / (size - remaining);
    const slippage = startingPrice > 0 
      ? Math.abs(avgPrice - startingPrice) / startingPrice * 100
      : 0;

    return { avgPrice, worstPrice, slippage };
  }

  /**
   * Check if order book is valid
   */
  isValid(): boolean {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    // Crossed book check
    if (bestBid && bestAsk && bestBid.price >= bestAsk.price) {
      return false;
    }

    return this.initialized && this.lastSequence > 0;
  }

  /**
   * Get last update time
   */
  getLastUpdate(): number {
    return this.lastUpdate;
  }

  /**
   * Get sequence number
   */
  getSequence(): number {
    return this.lastSequence;
  }
}

// ==================== Order Book Manager ====================

/**
 * Manager for multiple order books
 */
export class OrderBookManager {
  private books: Map<string, OrderBook> = new Map();
  private updateCallbacks: Map<string, Set<(book: OrderBook) => void>> = new Map();
  private statsCache: Map<string, { stats: OrderBookStats; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 100; // ms

  /**
   * Get or create order book
   */
  getBook(exchange: string, symbol: string): OrderBook {
    const key = this.getKey(exchange, symbol);
    
    if (!this.books.has(key)) {
      this.books.set(key, new OrderBook(exchange, symbol));
    }
    
    return this.books.get(key)!;
  }

  /**
   * Initialize book with snapshot
   */
  initializeBook(snapshot: OrderBookSnapshot): OrderBook {
    const book = this.getBook(snapshot.exchange, snapshot.symbol);
    book.initialize(snapshot);
    this.notifyUpdate(snapshot.exchange, snapshot.symbol);
    return book;
  }

  /**
   * Apply delta to book
   */
  applyDelta(delta: OrderBookDelta): boolean {
    const book = this.getBook(delta.exchange, delta.symbol);
    const result = book.applyDelta(delta);
    
    if (result) {
      this.notifyUpdate(delta.exchange, delta.symbol);
      this.invalidateCache(delta.exchange, delta.symbol);
    }
    
    return result;
  }

  /**
   * Subscribe to book updates
   */
  subscribe(
    exchange: string,
    symbol: string,
    callback: (book: OrderBook) => void
  ): () => void {
    const key = this.getKey(exchange, symbol);
    
    if (!this.updateCallbacks.has(key)) {
      this.updateCallbacks.set(key, new Set());
    }
    
    this.updateCallbacks.get(key)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.updateCallbacks.get(key)?.delete(callback);
    };
  }

  /**
   * Get cached stats
   */
  getStats(exchange: string, symbol: string): OrderBookStats {
    const key = this.getKey(exchange, symbol);
    const cached = this.statsCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.stats;
    }
    
    const book = this.books.get(key);
    const stats = book ? book.getStats() : this.getEmptyStats();
    
    this.statsCache.set(key, { stats, timestamp: Date.now() });
    return stats;
  }

  /**
   * Get aggregated view across multiple books
   */
  getAggregatedView(
    symbol: string,
    exchanges: string[]
  ): {
    bestBid: { price: number; exchange: string };
    bestAsk: { price: number; exchange: string };
    totalLiquidity: number;
  } {
    let bestBid: { price: number; exchange: string } | null = null;
    let bestAsk: { price: number; exchange: string } | null = null;
    let totalLiquidity = 0;

    for (const exchange of exchanges) {
      const book = this.books.get(this.getKey(exchange, symbol));
      if (!book) continue;

      const bid = book.getBestBid();
      const ask = book.getBestAsk();

      if (bid && (!bestBid || bid.price > bestBid.price)) {
        bestBid = { price: bid.price, exchange };
      }

      if (ask && (!bestAsk || ask.price < bestAsk.price)) {
        bestAsk = { price: ask.price, exchange };
      }

      const stats = book.getStats();
      totalLiquidity += stats.totalBidLiquidity + stats.totalAskLiquidity;
    }

    return {
      bestBid: bestBid || { price: 0, exchange: '' },
      bestAsk: bestAsk || { price: 0, exchange: '' },
      totalLiquidity,
    };
  }

  /**
   * Remove book
   */
  removeBook(exchange: string, symbol: string): void {
    const key = this.getKey(exchange, symbol);
    this.books.delete(key);
    this.updateCallbacks.delete(key);
    this.statsCache.delete(key);
  }

  /**
   * Clear all books
   */
  clear(): void {
    this.books.clear();
    this.updateCallbacks.clear();
    this.statsCache.clear();
  }

  /**
   * Get all active books
   */
  getActiveBooks(): Array<{ exchange: string; symbol: string; lastUpdate: number }> {
    return Array.from(this.books.entries()).map(([key, book]) => {
      const [exchange, symbol] = key.split(':');
      return {
        exchange,
        symbol,
        lastUpdate: book.getLastUpdate(),
      };
    });
  }

  // ==================== Private Methods ====================

  private getKey(exchange: string, symbol: string): string {
    return `${exchange}:${symbol}`;
  }

  private notifyUpdate(exchange: string, symbol: string): void {
    const key = this.getKey(exchange, symbol);
    const callbacks = this.updateCallbacks.get(key);
    const book = this.books.get(key);
    
    if (callbacks && book) {
      callbacks.forEach(cb => cb(book));
    }
  }

  private invalidateCache(exchange: string, symbol: string): void {
    const key = this.getKey(exchange, symbol);
    this.statsCache.delete(key);
  }

  private getEmptyStats(): OrderBookStats {
    return {
      spread: 0,
      spreadPercent: 0,
      midPrice: 0,
      imbalance: 0,
      totalBidLiquidity: 0,
      totalAskLiquidity: 0,
      bidVWAP: 0,
      askVWAP: 0,
    };
  }
}

// ==================== Singleton Export ====================

export const orderBookManager = new OrderBookManager();
