/**
 * Real Market Data Provider for Vision Bot
 * 
 * Fetches real OHLCV data from exchanges and prepares it for ML models.
 * Replaces synthetic data generation with actual market data.
 */

import type { MarketData, OHLCV } from './types';
import { BinanceDataFetcher, OhlcvService, type ExchangeId } from '../ohlcv-service';
import { db } from '@/lib/db';

// =====================================================
// TYPES
// =====================================================

export interface DataProviderConfig {
  primaryExchange: ExchangeId;
  fallbackExchanges: ExchangeId[];
  cacheTimeMs: number;
  maxRetries: number;
}

export interface MarketDataResult {
  symbol: string;
  data: MarketData[];
  exchange: ExchangeId;
  timestamp: Date;
  cached: boolean;
}

export interface MultiSymbolData {
  [symbol: string]: MarketData[];
}

// =====================================================
// DEFAULT CONFIG
// =====================================================

const DEFAULT_CONFIG: DataProviderConfig = {
  primaryExchange: 'binance',
  fallbackExchanges: ['bybit', 'okx'],
  cacheTimeMs: 60000, // 1 minute cache
  maxRetries: 3,
};

// =====================================================
// REAL DATA PROVIDER
// =====================================================

export class RealDataProvider {
  private config: DataProviderConfig;
  private cache: Map<string, { data: MarketData[]; timestamp: Date }> = new Map();
  
  constructor(config: Partial<DataProviderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Fetch market data for a single symbol
   */
  async fetchMarketData(
    symbol: string,
    timeframe: string = '1h',
    lookbackDays: number = 30,
    marketType: 'spot' | 'futures' = 'futures'
  ): Promise<MarketDataResult> {
    const cacheKey = `${symbol}_${timeframe}_${lookbackDays}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp.getTime() < this.config.cacheTimeMs) {
      return {
        symbol,
        data: cached.data,
        exchange: this.config.primaryExchange,
        timestamp: cached.timestamp,
        cached: true,
      };
    }
    
    // Try primary exchange
    let data: MarketData[] = [];
    let usedExchange: ExchangeId = this.config.primaryExchange;
    let lastError: Error | null = null;
    
    // Try to get from database first
    data = await this.getFromDatabase(symbol, timeframe, lookbackDays);
    
    if (data.length === 0) {
      // Fetch from exchanges
      const exchanges = [this.config.primaryExchange, ...this.config.fallbackExchanges];
      
      for (const exchange of exchanges) {
        try {
          data = await this.fetchFromExchange(symbol, timeframe, lookbackDays, exchange, marketType);
          usedExchange = exchange;
          break;
        } catch (error) {
          lastError = error as Error;
          console.warn(`[DataProvider] Failed to fetch from ${exchange}:`, error);
        }
      }
      
      if (data.length === 0) {
        throw lastError || new Error(`Failed to fetch data for ${symbol}`);
      }
    }
    
    // Update cache
    this.cache.set(cacheKey, { data, timestamp: new Date() });
    
    return {
      symbol,
      data,
      exchange: usedExchange,
      timestamp: new Date(),
      cached: false,
    };
  }
  
  /**
   * Fetch market data for multiple symbols
   */
  async fetchMultiSymbolData(
    symbols: string[],
    timeframe: string = '1h',
    lookbackDays: number = 30,
    marketType: 'spot' | 'futures' = 'futures'
  ): Promise<MultiSymbolData> {
    const results: MultiSymbolData = {};
    
    // Fetch in parallel with rate limiting
    const batchSize = 3;
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      const promises = batch.map(async (symbol) => {
        try {
          const result = await this.fetchMarketData(symbol, timeframe, lookbackDays, marketType);
          return { symbol, data: result.data };
        } catch (error) {
          console.error(`[DataProvider] Failed to fetch ${symbol}:`, error);
          return { symbol, data: [] };
        }
      });
      
      const batchResults = await Promise.all(promises);
      
      for (const { symbol, data } of batchResults) {
        if (data.length > 0) {
          results[symbol] = data;
        }
      }
      
      // Rate limiting between batches
      if (i + batchSize < symbols.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    return results;
  }
  
  /**
   * Get latest price for a symbol
   */
  async getLatestPrice(
    symbol: string,
    exchange: ExchangeId = 'binance'
  ): Promise<number> {
    try {
      const data = await this.fetchMarketData(symbol, '1h', 1);
      return data.data[data.data.length - 1]?.close || 0;
    } catch {
      return 0;
    }
  }
  
  /**
   * Get prices for multiple symbols
   */
  async getLatestPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    
    for (const symbol of symbols) {
      const price = await this.getLatestPrice(symbol);
      prices.set(symbol, price);
    }
    
    return prices;
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Get cached data count
   */
  getCacheSize(): number {
    return this.cache.size;
  }
  
  // =====================================================
  // PRIVATE METHODS
  // =====================================================
  
  private async getFromDatabase(
    symbol: string,
    timeframe: string,
    lookbackDays: number
  ): Promise<MarketData[]> {
    try {
      const startTime = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      
      const candles = await db.ohlcvCandle.findMany({
        where: {
          symbol,
          timeframe,
          openTime: { gte: startTime },
        },
        orderBy: { openTime: 'asc' },
      });
      
      if (candles.length === 0) return [];
      
      return candles.map(c => ({
        symbol: c.symbol,
        timestamp: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    } catch (error) {
      console.warn('[DataProvider] Database query failed:', error);
      return [];
    }
  }
  
  private async fetchFromExchange(
    symbol: string,
    timeframe: string,
    lookbackDays: number,
    exchange: ExchangeId,
    marketType: 'spot' | 'futures'
  ): Promise<MarketData[]> {
    const startTime = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    
    const candles = await BinanceDataFetcher.fetchKlines({
      symbol,
      interval: timeframe,
      limit: Math.min(lookbackDays * 24, 1000), // Max 1000 candles
      startTime,
      marketType,
    });
    
    if (candles.length === 0) {
      throw new Error(`No candles returned for ${symbol}`);
    }
    
    // Store in database for future use
    await OhlcvService.storeCandles(candles).catch(err => {
      console.warn('[DataProvider] Failed to store candles:', err);
    });
    
    // Convert to MarketData format
    return candles.map(c => ({
      symbol: c.symbol,
      timestamp: c.openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }
}

// =====================================================
// SYNCHRONIZATION SERVICE
// =====================================================

export class DataSyncService {
  private provider: RealDataProvider;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  
  constructor(provider?: RealDataProvider) {
    this.provider = provider || new RealDataProvider();
  }
  
  /**
   * Start periodic data sync
   */
  startSync(
    symbols: string[],
    timeframe: string = '1h',
    intervalMinutes: number = 60
  ): void {
    if (this.isRunning) {
      console.log('[DataSync] Already running');
      return;
    }
    
    this.isRunning = true;
    
    // Initial sync
    this.syncData(symbols, timeframe);
    
    // Periodic sync
    this.syncInterval = setInterval(
      () => this.syncData(symbols, timeframe),
      intervalMinutes * 60 * 1000
    );
    
    console.log(`[DataSync] Started with ${intervalMinutes}min interval for ${symbols.length} symbols`);
  }
  
  /**
   * Stop periodic sync
   */
  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log('[DataSync] Stopped');
  }
  
  /**
   * Sync data for all symbols
   */
  private async syncData(symbols: string[], timeframe: string): Promise<void> {
    console.log(`[DataSync] Syncing data for ${symbols.length} symbols...`);
    
    try {
      await this.provider.fetchMultiSymbolData(symbols, timeframe, 30);
      console.log('[DataSync] Sync completed');
    } catch (error) {
      console.error('[DataSync] Sync failed:', error);
    }
  }
  
  /**
   * Get sync status
   */
  getStatus(): { isRunning: boolean; cacheSize: number } {
    return {
      isRunning: this.isRunning,
      cacheSize: this.provider.getCacheSize(),
    };
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Convert OHLCV array to MarketData array
 */
export function ohlcvToMarketData(ohlcv: OHLCV[], symbol: string): MarketData[] {
  return ohlcv.map(o => ({
    symbol,
    timestamp: new Date(o.timestamp),
    open: o.open,
    high: o.high,
    low: o.low,
    close: o.close,
    volume: o.volume,
  }));
}

/**
 * Validate market data quality
 */
export function validateMarketData(data: MarketData[]): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  if (data.length < 50) {
    issues.push(`Insufficient data: ${data.length} candles (min 50)`);
  }
  
  // Check for gaps
  for (let i = 1; i < data.length; i++) {
    const expectedTime = new Date(data[i - 1].timestamp.getTime() + 60 * 60 * 1000);
    if (Math.abs(data[i].timestamp.getTime() - expectedTime.getTime()) > 5 * 60 * 1000) {
      issues.push(`Gap detected at ${data[i].timestamp}`);
      break;
    }
  }
  
  // Check for invalid values
  for (const candle of data) {
    if (candle.close <= 0 || candle.high <= 0 || candle.low <= 0 || candle.open <= 0) {
      issues.push(`Invalid price in candle at ${candle.timestamp}`);
      break;
    }
    
    if (candle.high < candle.low) {
      issues.push(`High < Low at ${candle.timestamp}`);
      break;
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

// =====================================================
// SINGLETON
// =====================================================

let dataProvider: RealDataProvider | null = null;
let dataSyncService: DataSyncService | null = null;

export function getRealDataProvider(): RealDataProvider {
  if (!dataProvider) {
    dataProvider = new RealDataProvider();
  }
  return dataProvider;
}

export function getDataSyncService(): DataSyncService {
  if (!dataSyncService) {
    dataSyncService = new DataSyncService(getRealDataProvider());
  }
  return dataSyncService;
}

export default RealDataProvider;
