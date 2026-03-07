/**
 * Cached Price Service
 * 
 * High-performance price service using Redis caching.
 * Provides real-time price updates with intelligent caching.
 * 
 * Features:
 * - Multi-exchange price fetching
 * - Redis caching with fallback
 * - Batch price updates
 * - Automatic cache invalidation
 * - WebSocket integration support
 */

import { unifiedCache, CachedPrice, CachedTicker } from '@/lib/cache/unified';
import { db } from '@/lib/db';

// ============================================================================
// TYPES
// ============================================================================

export interface PriceUpdate {
  symbol: string;
  exchange: string;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  priceChange24h?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
}

export interface PriceSubscription {
  symbol: string;
  exchange: string;
  callback: (update: PriceUpdate) => void;
}

export interface PriceServiceConfig {
  cacheTTL: number;
  batchSize: number;
  updateInterval: number;
  exchanges: string[];
}

// ============================================================================
// EXCHANGE PRICE FETCHERS
// ============================================================================

async function fetchBinancePrice(symbol: string): Promise<PriceUpdate | null> {
  try {
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol.toUpperCase()}`
    );
    const data = await response.json();
    
    if (data.symbol) {
      return {
        symbol,
        exchange: 'binance',
        price: parseFloat(data.lastPrice),
        bidPrice: parseFloat(data.bidPrice),
        askPrice: parseFloat(data.askPrice),
        priceChange24h: parseFloat(data.priceChange),
        volume24h: parseFloat(data.volume),
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch Binance price for ${symbol}:`, error);
    return null;
  }
}

async function fetchBybitPrice(symbol: string): Promise<PriceUpdate | null> {
  try {
    const response = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol.toUpperCase()}`
    );
    const data = await response.json();
    
    if (data.result?.list?.[0]) {
      const ticker = data.result.list[0];
      return {
        symbol,
        exchange: 'bybit',
        price: parseFloat(ticker.lastPrice),
        bidPrice: parseFloat(ticker.bid1Price),
        askPrice: parseFloat(ticker.ask1Price),
        priceChange24h: parseFloat(ticker.price24hPcnt) * parseFloat(ticker.lastPrice),
        volume24h: parseFloat(ticker.volume24h),
        high24h: parseFloat(ticker.highPrice24h),
        low24h: parseFloat(ticker.lowPrice24h),
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch Bybit price for ${symbol}:`, error);
    return null;
  }
}

async function fetchOkxPrice(symbol: string): Promise<PriceUpdate | null> {
  try {
    const instId = symbol.replace('USDT', '-USDT-SWAP');
    const response = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${instId}`
    );
    const data = await response.json();
    
    if (data.data?.[0]) {
      const ticker = data.data[0];
      return {
        symbol,
        exchange: 'okx',
        price: parseFloat(ticker.last),
        bidPrice: parseFloat(ticker.bidPx),
        askPrice: parseFloat(ticker.askPx),
        priceChange24h: parseFloat(ticker.open24h) - parseFloat(ticker.last),
        volume24h: parseFloat(ticker.vol24h),
        high24h: parseFloat(ticker.high24h),
        low24h: parseFloat(ticker.low24h),
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch OKX price for ${symbol}:`, error);
    return null;
  }
}

async function fetchBitgetPrice(symbol: string): Promise<PriceUpdate | null> {
  try {
    const response = await fetch(
      `https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol.toUpperCase()}`
    );
    const data = await response.json();
    
    if (data.data?.[0]) {
      const ticker = data.data[0];
      return {
        symbol,
        exchange: 'bitget',
        price: parseFloat(ticker.lastPr),
        bidPrice: parseFloat(ticker.bidPr),
        askPrice: parseFloat(ticker.askPr),
        priceChange24h: parseFloat(ticker.change24h),
        volume24h: parseFloat(ticker.baseVolume),
        high24h: parseFloat(ticker.high24h),
        low24h: parseFloat(ticker.low24h),
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch Bitget price for ${symbol}:`, error);
    return null;
  }
}

async function fetchBingxPrice(symbol: string): Promise<PriceUpdate | null> {
  try {
    const response = await fetch(
      `https://open-api.bingx.com/openApi/swap/v2/quote/ticker?symbol=${symbol.toUpperCase()}`
    );
    const data = await response.json();
    
    if (data.data) {
      const ticker = data.data;
      return {
        symbol,
        exchange: 'bingx',
        price: parseFloat(ticker.lastPrice),
        priceChange24h: parseFloat(ticker.priceChange),
        volume24h: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch BingX price for ${symbol}:`, error);
    return null;
  }
}

const EXCHANGE_FETCHERS: Record<string, (symbol: string) => Promise<PriceUpdate | null>> = {
  binance: fetchBinancePrice,
  bybit: fetchBybitPrice,
  okx: fetchOkxPrice,
  bitget: fetchBitgetPrice,
  bingx: fetchBingxPrice,
};

// ============================================================================
// PRICE SERVICE
// ============================================================================

class CachedPriceService {
  private config: PriceServiceConfig = {
    cacheTTL: 60,           // 1 minute
    batchSize: 50,
    updateInterval: 5000,   // 5 seconds
    exchanges: ['binance', 'bybit', 'okx', 'bitget', 'bingx'],
  };

  private subscriptions: Map<string, Set<(update: PriceUpdate) => void>> = new Map();
  private updateTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Configure the price service
   */
  configure(config: Partial<PriceServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get price for a symbol from cache or fetch
   */
  async getPrice(
    symbol: string,
    exchange: string = 'binance',
    forceRefresh: boolean = false
  ): Promise<CachedPrice | null> {
    // Check cache first
    if (!forceRefresh) {
      const cached = await unifiedCache.getPrice(symbol, exchange);
      if (cached) {
        return cached;
      }
    }

    // Fetch from exchange
    const fetcher = EXCHANGE_FETCHERS[exchange];
    if (!fetcher) {
      console.error(`Unknown exchange: ${exchange}`);
      return null;
    }

    const update = await fetcher(symbol);
    if (!update) {
      return null;
    }

    // Cache the result
    await unifiedCache.cachePrice(
      symbol,
      exchange,
      update.price,
      update.bidPrice,
      update.askPrice
    );

    // Also cache ticker data
    await unifiedCache.cacheTicker(symbol, exchange, {
      lastPrice: update.price,
      priceChange24h: update.priceChange24h || 0,
      priceChangePercent24h: update.priceChange24h && update.price 
        ? (update.priceChange24h / update.price) * 100 
        : 0,
      volume24h: update.volume24h || 0,
      high24h: update.high24h || update.price,
      low24h: update.low24h || update.price,
    });

    return {
      symbol,
      exchange,
      price: update.price,
      bidPrice: update.bidPrice,
      askPrice: update.askPrice,
      timestamp: Date.now(),
    };
  }

  /**
   * Get prices for multiple symbols
   */
  async getPrices(
    symbols: string[],
    exchange: string = 'binance',
    forceRefresh: boolean = false
  ): Promise<Map<string, CachedPrice>> {
    const result = new Map<string, CachedPrice>();

    // Process in batches
    for (let i = 0; i < symbols.length; i += this.config.batchSize) {
      const batch = symbols.slice(i, i + this.config.batchSize);
      const promises = batch.map(s => this.getPrice(s, exchange, forceRefresh));
      const prices = await Promise.all(promises);

      for (let j = 0; j < batch.length; j++) {
        const price = prices[j];
        if (price) {
          result.set(batch[j], price);
        }
      }
    }

    return result;
  }

  /**
   * Get ticker data
   */
  async getTicker(
    symbol: string,
    exchange: string = 'binance'
  ): Promise<CachedTicker | null> {
    // Ensure we have fresh data
    await this.getPrice(symbol, exchange);
    return unifiedCache.getTicker(symbol, exchange);
  }

  /**
   * Get best price across exchanges
   */
  async getBestPrice(
    symbol: string,
    side: 'BUY' | 'SELL'
  ): Promise<{ price: number; exchange: string } | null> {
    const prices = await Promise.all(
      this.config.exchanges.map(e => this.getPrice(symbol, e))
    );

    let bestPrice: number | null = null;
    let bestExchange: string | null = null;

    for (const price of prices) {
      if (!price) continue;

      const relevantPrice = side === 'BUY' ? price.askPrice : price.bidPrice;
      if (relevantPrice === undefined) continue;

      if (bestPrice === null) {
        bestPrice = relevantPrice;
        bestExchange = price.exchange;
        continue;
      }

      // For BUY, we want the lowest ask price
      // For SELL, we want the highest bid price
      if (side === 'BUY' && relevantPrice < bestPrice) {
        bestPrice = relevantPrice;
        bestExchange = price.exchange;
      } else if (side === 'SELL' && relevantPrice > bestPrice) {
        bestPrice = relevantPrice;
        bestExchange = price.exchange;
      }
    }

    return bestPrice !== null && bestExchange !== null
      ? { price: bestPrice, exchange: bestExchange }
      : null;
  }

  /**
   * Subscribe to price updates
   */
  subscribe(
    symbol: string,
    exchange: string,
    callback: (update: PriceUpdate) => void
  ): () => void {
    const key = `${exchange}:${symbol}`;
    
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    
    this.subscriptions.get(key)!.add(callback);

    // Start update loop if not running
    if (!this.isRunning) {
      this.startUpdateLoop();
    }

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(key)?.delete(callback);
      if (this.subscriptions.get(key)?.size === 0) {
        this.subscriptions.delete(key);
      }
      if (this.subscriptions.size === 0) {
        this.stopUpdateLoop();
      }
    };
  }

  /**
   * Start the update loop
   */
  private startUpdateLoop(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.updateTimer = setInterval(() => this.updatePrices(), this.config.updateInterval);
  }

  /**
   * Stop the update loop
   */
  private stopUpdateLoop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.isRunning = false;
  }

  /**
   * Update prices for all subscribed symbols
   */
  private async updatePrices(): Promise<void> {
    const updates: Promise<void>[] = [];

    for (const [key, callbacks] of this.subscriptions) {
      const [exchange, symbol] = key.split(':');
      
      updates.push(
        (async () => {
          const price = await this.getPrice(symbol, exchange, true);
          if (price) {
            const update: PriceUpdate = {
              symbol,
              exchange,
              price: price.price,
              bidPrice: price.bidPrice,
              askPrice: price.askPrice,
            };
            
            for (const callback of callbacks) {
              try {
                callback(update);
              } catch (error) {
                console.error('Price callback error:', error);
              }
            }
          }
        })()
      );
    }

    await Promise.all(updates);
  }

  /**
   * Invalidate price cache
   */
  async invalidatePrice(symbol: string, exchange: string): Promise<void> {
    await unifiedCache.invalidatePattern(`price:${exchange}:${symbol}`);
    await unifiedCache.invalidatePattern(`ticker:${exchange}:${symbol}`);
  }

  /**
   * Invalidate all price caches
   */
  async invalidateAllPrices(): Promise<void> {
    await unifiedCache.invalidatePattern('price:*');
    await unifiedCache.invalidatePattern('ticker:*');
  }

  /**
   * Store price to database
   */
  async storePriceToDb(
    symbol: string,
    exchange: string,
    price: number
  ): Promise<void> {
    try {
      await db.marketPrice.upsert({
        where: { symbol },
        update: {
          price,
          lastUpdate: new Date(),
        },
        create: {
          symbol,
          exchange: exchange.toUpperCase(),
          price,
          lastUpdate: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to store price to database:', error);
    }
  }

  /**
   * Sync prices from database to cache
   */
  async syncPricesFromDb(): Promise<number> {
    const prices = await db.marketPrice.findMany();
    
    for (const p of prices) {
      await unifiedCache.cachePrice(
        p.symbol,
        p.exchange.toLowerCase(),
        p.price,
        p.bidPrice ?? undefined,
        p.askPrice ?? undefined
      );
    }

    return prices.length;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const cachedPriceService = new CachedPriceService();
export default cachedPriceService;
