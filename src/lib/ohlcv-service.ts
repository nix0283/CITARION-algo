/**
 * Multi-Exchange OHLCV Service
 *
 * Manages historical candlestick data storage and retrieval.
 * Supports Binance, Bybit, OKX with automatic data synchronization.
 */

import { db } from '@/lib/db';

// Exchange configurations
export const EXCHANGES = {
  binance: {
    name: 'Binance',
    restApiSpot: 'https://api.binance.com/api/v3/klines',
    restApiFutures: 'https://fapi.binance.com/fapi/v1/klines',
    wsApiSpot: 'wss://stream.binance.com:9443/ws',
    wsApiFutures: 'wss://fstream.binance.com/ws',
    supportsSpot: true,
    supportsFutures: true,
  },
  bybit: {
    name: 'Bybit',
    restApiSpot: 'https://api.bybit.com/v5/market/kline',
    restApiFutures: 'https://api.bybit.com/v5/market/kline',
    wsApiSpot: 'wss://stream.bybit.com/v5/public/spot',
    wsApiFutures: 'wss://stream.bybit.com/v5/public/linear',
    supportsSpot: true,
    supportsFutures: true,
  },
  okx: {
    name: 'OKX',
    restApiSpot: 'https://www.okx.com/api/v5/market/candles',
    restApiFutures: 'https://www.okx.com/api/v5/market/candles',
    wsApiSpot: 'wss://ws.okx.com:8443/ws/v5/public',
    wsApiFutures: 'wss://ws.okx.com:8443/ws/v5/public',
    supportsSpot: true,
    supportsFutures: true,
  },
} as const;

export type ExchangeId = keyof typeof EXCHANGES;

// Timeframe mappings for different exchanges
const TIMEFRAME_MAP: Record<ExchangeId, Record<string, string>> = {
  binance: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
    '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M',
  },
  bybit: {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
    '1d': 'D', '1w': 'W', '1M': 'M',
  },
  okx: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
    '1d': '1D', '3d': '3D', '1w': '1W', '1M': '1M',
  },
};

export interface OhlcvCandle {
  symbol: string;
  exchange: ExchangeId;
  marketType: 'spot' | 'futures' | 'inverse';
  timeframe: string;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  trades?: number;
  takerBuyVolume?: number;
  isFinal: boolean;
}

export interface SyncStatus {
  exchange: ExchangeId;
  symbol: string;
  marketType: string;
  timeframe: string;
  lastSyncTime: Date | null;
  lastCandleTime: Date | null;
  candlesCount: number;
  isSyncing: boolean;
  lastError?: string;
}

/**
 * OHLCV Database Service
 */
export class OhlcvService {
  /**
   * Store a single candle
   */
  static async storeCandle(candle: OhlcvCandle): Promise<void> {
    await db.ohlcvCandle.upsert({
      where: {
        symbol_exchange_timeframe_openTime: {
          symbol: candle.symbol,
          exchange: candle.exchange,
          timeframe: candle.timeframe,
          openTime: candle.openTime,
        },
      },
      update: {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        quoteVolume: candle.quoteVolume,
        trades: candle.trades,
        takerBuyQuoteVolume: candle.takerBuyVolume,
        isFinal: candle.isFinal,
      },
      create: {
        symbol: candle.symbol,
        exchange: candle.exchange,
        marketType: candle.marketType,
        timeframe: candle.timeframe,
        openTime: candle.openTime,
        closeTime: candle.closeTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        quoteVolume: candle.quoteVolume,
        trades: candle.trades,
        takerBuyQuoteVolume: candle.takerBuyVolume,
        isFinal: candle.isFinal,
      },
    });
  }

  /**
   * Store multiple candles in batch
   */
  static async storeCandles(candles: OhlcvCandle[]): Promise<number> {
    if (candles.length === 0) return 0;

    let stored = 0;
    const batchSize = 100;

    for (let i = 0; i < candles.length; i += batchSize) {
      const batch = candles.slice(i, i + batchSize);

      for (const candle of batch) {
        try {
          await this.storeCandle(candle);
          stored++;
        } catch (error) {
          console.error(`Failed to store candle: ${candle.symbol} ${candle.openTime}`, error);
        }
      }
    }

    return stored;
  }

  /**
   * Get candles from database
   */
  static async getCandles(params: {
    symbol: string;
    exchange?: ExchangeId;
    marketType?: string;
    timeframe: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<OhlcvCandle[]> {
    const where: any = {
      symbol: params.symbol,
      timeframe: params.timeframe,
    };

    if (params.exchange) where.exchange = params.exchange;
    if (params.marketType) where.marketType = params.marketType;
    if (params.startTime || params.endTime) {
      where.openTime = {};
      if (params.startTime) where.openTime.gte = params.startTime;
      if (params.endTime) where.openTime.lte = params.endTime;
    }

    const candles = await db.ohlcvCandle.findMany({
      where,
      orderBy: { openTime: 'asc' },
      take: params.limit || 500,
    });

    return candles.map((c) => ({
      symbol: c.symbol,
      exchange: c.exchange as ExchangeId,
      marketType: c.marketType as 'spot' | 'futures' | 'inverse',
      timeframe: c.timeframe,
      openTime: c.openTime,
      closeTime: c.closeTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      quoteVolume: c.quoteVolume ?? undefined,
      trades: c.trades ?? undefined,
      takerBuyVolume: c.takerBuyQuoteVolume ?? undefined,
      isFinal: c.isFinal,
    }));
  }

  /**
   * Get latest candle for a symbol
   */
  static async getLatestCandle(params: {
    symbol: string;
    exchange: ExchangeId;
    marketType: string;
    timeframe: string;
  }): Promise<OhlcvCandle | null> {
    const candle = await db.ohlcvCandle.findFirst({
      where: {
        symbol: params.symbol,
        exchange: params.exchange,
        marketType: params.marketType,
        timeframe: params.timeframe,
      },
      orderBy: { openTime: 'desc' },
    });

    if (!candle) return null;

    return {
      symbol: candle.symbol,
      exchange: candle.exchange as ExchangeId,
      marketType: candle.marketType as 'spot' | 'futures' | 'inverse',
      timeframe: candle.timeframe,
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      quoteVolume: candle.quoteVolume ?? undefined,
      trades: candle.trades ?? undefined,
      takerBuyVolume: candle.takerBuyQuoteVolume ?? undefined,
      isFinal: candle.isFinal,
    };
  }

  /**
   * Get sync status
   */
  static async getSyncStatus(params: {
    exchange: ExchangeId;
    symbol: string;
    marketType: string;
    timeframe: string;
  }): Promise<SyncStatus | null> {
    const status = await db.exchangeSyncStatus.findUnique({
      where: {
        exchange_symbol_marketType_timeframe: {
          exchange: params.exchange,
          symbol: params.symbol,
          marketType: params.marketType,
          timeframe: params.timeframe,
        },
      },
    });

    if (!status) return null;

    return {
      exchange: status.exchange as ExchangeId,
      symbol: status.symbol,
      marketType: status.marketType,
      timeframe: status.timeframe,
      lastSyncTime: status.lastSyncTime,
      lastCandleTime: status.lastCandleTime,
      candlesCount: status.candlesCount,
      isSyncing: status.isSyncing,
      lastError: status.lastError ?? undefined,
    };
  }

  /**
   * Update sync status
   */
  static async updateSyncStatus(params: {
    exchange: ExchangeId;
    symbol: string;
    marketType: string;
    timeframe: string;
    lastSyncTime?: Date;
    lastCandleTime?: Date;
    candlesCount?: number;
    isSyncing?: boolean;
    error?: string;
  }): Promise<void> {
    await db.exchangeSyncStatus.upsert({
      where: {
        exchange_symbol_marketType_timeframe: {
          exchange: params.exchange,
          symbol: params.symbol,
          marketType: params.marketType,
          timeframe: params.timeframe,
        },
      },
      update: {
        lastSyncTime: params.lastSyncTime,
        lastCandleTime: params.lastCandleTime,
        candlesCount: params.candlesCount,
        isSyncing: params.isSyncing ?? false,
        lastError: params.error,
      },
      create: {
        exchange: params.exchange,
        symbol: params.symbol,
        marketType: params.marketType,
        timeframe: params.timeframe,
        lastSyncTime: params.lastSyncTime,
        lastCandleTime: params.lastCandleTime,
        candlesCount: params.candlesCount ?? 0,
        isSyncing: params.isSyncing ?? false,
        lastError: params.error,
      },
    });
  }

  /**
   * Count candles in database
   */
  static async countCandles(params: {
    symbol?: string;
    exchange?: ExchangeId;
    timeframe?: string;
  }): Promise<number> {
    const where: any = {};
    if (params.symbol) where.symbol = params.symbol;
    if (params.exchange) where.exchange = params.exchange;
    if (params.timeframe) where.timeframe = params.timeframe;

    return db.ohlcvCandle.count({ where });
  }

  /**
   * Delete old candles (cleanup)
   */
  static async deleteOldCandles(params: {
    before: Date;
    symbol?: string;
    exchange?: ExchangeId;
  }): Promise<number> {
    const where: any = {
      openTime: { lt: params.before },
    };
    if (params.symbol) where.symbol = params.symbol;
    if (params.exchange) where.exchange = params.exchange;

    const result = await db.ohlcvCandle.deleteMany({ where });
    return result.count;
  }
}

/**
 * Binance Data Fetcher
 */
export class BinanceDataFetcher {
  private static REST_API_SPOT = 'https://api.binance.com';
  private static REST_API_FUTURES = 'https://fapi.binance.com';

  static async fetchKlines(params: {
    symbol: string;
    interval: string;
    limit?: number;
    startTime?: number;
    endTime?: number;
    marketType?: 'spot' | 'futures';
  }): Promise<OhlcvCandle[]> {
    const isFutures = params.marketType === 'futures';
    const baseUrl = isFutures
      ? `${this.REST_API_FUTURES}/fapi/v1/klines`
      : `${this.REST_API_SPOT}/api/v3/klines`;

    const url = new URL(baseUrl);
    url.searchParams.set('symbol', params.symbol);
    url.searchParams.set('interval', params.interval);
    if (params.limit) url.searchParams.set('limit', params.limit.toString());
    if (params.startTime) url.searchParams.set('startTime', params.startTime.toString());
    if (params.endTime) url.searchParams.set('endTime', params.endTime.toString());

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Binance API error: ${response.status}`);

    const data: any[][] = await response.json();

    return data.map((k) => ({
      symbol: params.symbol,
      exchange: 'binance' as ExchangeId,
      marketType: (params.marketType || 'spot') as 'spot' | 'futures' | 'inverse',
      timeframe: params.interval,
      openTime: new Date(k[0]),
      closeTime: new Date(k[6]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[7]),
      trades: k[8],
      takerBuyVolume: parseFloat(k[10]),
      isFinal: true,
    }));
  }

  static async syncHistory(params: {
    symbol: string;
    interval: string;
    marketType?: 'spot' | 'futures';
    daysBack?: number;
    onProgress?: (fetched: number, stored: number) => void;
  }): Promise<{ fetched: number; stored: number }> {
    const { symbol, interval, marketType = 'futures', daysBack = 30 } = params;

    const status = await OhlcvService.getSyncStatus({
      exchange: 'binance',
      symbol,
      marketType,
      timeframe: interval,
    });

    if (status?.isSyncing) {
      throw new Error('Sync already in progress');
    }

    await OhlcvService.updateSyncStatus({
      exchange: 'binance',
      symbol,
      marketType,
      timeframe: interval,
      isSyncing: true,
    });

    try {
      const now = Date.now();
      const startTime = now - daysBack * 24 * 60 * 60 * 1000;
      let fetched = 0;
      let stored = 0;
      let currentStartTime = startTime;

      while (currentStartTime < now) {
        const candles = await this.fetchKlines({
          symbol,
          interval,
          limit: 1000,
          startTime: currentStartTime,
          marketType,
        });

        if (candles.length === 0) break;

        const batchStored = await OhlcvService.storeCandles(candles);
        fetched += candles.length;
        stored += batchStored;

        params.onProgress?.(fetched, stored);

        const lastCandle = candles[candles.length - 1];
        currentStartTime = lastCandle.closeTime.getTime() + 1;

        await new Promise((r) => setTimeout(r, 100));
      }

      await OhlcvService.updateSyncStatus({
        exchange: 'binance',
        symbol,
        marketType,
        timeframe: interval,
        lastSyncTime: new Date(),
        lastCandleTime: new Date(currentStartTime),
        candlesCount: stored,
        isSyncing: false,
      });

      return { fetched, stored };
    } catch (error) {
      await OhlcvService.updateSyncStatus({
        exchange: 'binance',
        symbol,
        marketType,
        timeframe: interval,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
}

/**
 * Bybit Data Fetcher
 */
export class BybitDataFetcher {
  private static REST_API = 'https://api.bybit.com';

  static async fetchKlines(params: {
    symbol: string;
    interval: string;
    limit?: number;
    startTime?: number;
    endTime?: number;
    marketType?: 'spot' | 'futures';
  }): Promise<OhlcvCandle[]> {
    const category = params.marketType === 'spot' ? 'spot' : 'linear';
    const url = new URL(`${this.REST_API}/v5/market/kline`);
    
    url.searchParams.set('category', category);
    url.searchParams.set('symbol', params.symbol);
    url.searchParams.set('interval', TIMEFRAME_MAP.bybit[params.interval] || params.interval);
    if (params.limit) url.searchParams.set('limit', params.limit.toString());
    if (params.startTime) url.searchParams.set('start', params.startTime.toString());
    if (params.endTime) url.searchParams.set('end', params.endTime.toString());

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Bybit API error: ${response.status}`);

    const data = await response.json();
    if (data.retCode !== 0) throw new Error(`Bybit API error: ${data.retMsg}`);

    // Bybit returns data in reverse order [time, open, high, low, close, volume, turnover]
    const klines: any[][] = data.result.list.reverse();

    return klines.map((k) => ({
      symbol: params.symbol,
      exchange: 'bybit' as ExchangeId,
      marketType: (params.marketType || 'futures') as 'spot' | 'futures' | 'inverse',
      timeframe: params.interval,
      openTime: new Date(parseInt(k[0])),
      closeTime: new Date(parseInt(k[0]) + this.getIntervalMs(params.interval)),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[6]),
      isFinal: true,
    }));
  }

  private static getIntervalMs(interval: string): number {
    const ms: Record<string, number> = {
      '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000,
      '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000,
      '1d': 86400000, '1w': 604800000, '1M': 2592000000,
    };
    return ms[interval] || 3600000;
  }

  static async syncHistory(params: {
    symbol: string;
    interval: string;
    marketType?: 'spot' | 'futures';
    daysBack?: number;
    onProgress?: (fetched: number, stored: number) => void;
  }): Promise<{ fetched: number; stored: number }> {
    const { symbol, interval, marketType = 'futures', daysBack = 30 } = params;

    const status = await OhlcvService.getSyncStatus({
      exchange: 'bybit',
      symbol,
      marketType,
      timeframe: interval,
    });

    if (status?.isSyncing) {
      throw new Error('Sync already in progress');
    }

    await OhlcvService.updateSyncStatus({
      exchange: 'bybit',
      symbol,
      marketType,
      timeframe: interval,
      isSyncing: true,
    });

    try {
      const now = Date.now();
      const startTime = now - daysBack * 24 * 60 * 60 * 1000;
      let fetched = 0;
      let stored = 0;
      let currentStartTime = startTime;

      while (currentStartTime < now) {
        const candles = await this.fetchKlines({
          symbol,
          interval,
          limit: 200, // Bybit max limit
          startTime: currentStartTime,
          marketType,
        });

        if (candles.length === 0) break;

        const batchStored = await OhlcvService.storeCandles(candles);
        fetched += candles.length;
        stored += batchStored;

        params.onProgress?.(fetched, stored);

        const lastCandle = candles[candles.length - 1];
        currentStartTime = lastCandle.closeTime.getTime() + 1;

        await new Promise((r) => setTimeout(r, 100));
      }

      await OhlcvService.updateSyncStatus({
        exchange: 'bybit',
        symbol,
        marketType,
        timeframe: interval,
        lastSyncTime: new Date(),
        lastCandleTime: new Date(currentStartTime),
        candlesCount: stored,
        isSyncing: false,
      });

      return { fetched, stored };
    } catch (error) {
      await OhlcvService.updateSyncStatus({
        exchange: 'bybit',
        symbol,
        marketType,
        timeframe: interval,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
}

/**
 * OKX Data Fetcher
 */
export class OkxDataFetcher {
  private static REST_API = 'https://www.okx.com';

  static async fetchKlines(params: {
    symbol: string; // e.g., BTC-USDT
    interval: string;
    limit?: number;
    startTime?: number;
    endTime?: number;
    marketType?: 'spot' | 'futures';
  }): Promise<OhlcvCandle[]> {
    // OKX uses instId format: BTC-USDT for spot, BTC-USDT-SWAP for futures
    let instId = params.symbol;
    if (params.marketType === 'futures') {
      instId = params.symbol.replace('USDT', '-USDT-SWAP');
    } else {
      instId = params.symbol.replace('USDT', '-USDT');
    }

    const url = new URL(`${this.REST_API}/api/v5/market/candles`);
    
    url.searchParams.set('instId', instId);
    url.searchParams.set('bar', TIMEFRAME_MAP.okx[params.interval] || params.interval);
    if (params.limit) url.searchParams.set('limit', params.limit.toString());
    if (params.startTime) url.searchParams.set('before', params.startTime.toString());
    if (params.endTime) url.searchParams.set('after', params.endTime.toString());

    const response = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`OKX API error: ${response.status}`);

    const data = await response.json();
    if (data.code !== '0') throw new Error(`OKX API error: ${data.msg}`);

    // OKX returns data in reverse order [time, open, high, low, close, volume, volCcy, volCcyQuote, confirm]
    const klines: any[][] = data.data.reverse();

    return klines.map((k) => ({
      symbol: params.symbol,
      exchange: 'okx' as ExchangeId,
      marketType: (params.marketType || 'spot') as 'spot' | 'futures' | 'inverse',
      timeframe: params.interval,
      openTime: new Date(parseInt(k[0])),
      closeTime: new Date(parseInt(k[0]) + this.getIntervalMs(params.interval)),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[6]),
      isFinal: k[8] === '1',
    }));
  }

  private static getIntervalMs(interval: string): number {
    const ms: Record<string, number> = {
      '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000,
      '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000,
      '1d': 86400000, '3d': 259200000, '1w': 604800000, '1M': 2592000000,
    };
    return ms[interval] || 3600000;
  }

  static async syncHistory(params: {
    symbol: string;
    interval: string;
    marketType?: 'spot' | 'futures';
    daysBack?: number;
    onProgress?: (fetched: number, stored: number) => void;
  }): Promise<{ fetched: number; stored: number }> {
    const { symbol, interval, marketType = 'futures', daysBack = 30 } = params;

    const status = await OhlcvService.getSyncStatus({
      exchange: 'okx',
      symbol,
      marketType,
      timeframe: interval,
    });

    if (status?.isSyncing) {
      throw new Error('Sync already in progress');
    }

    await OhlcvService.updateSyncStatus({
      exchange: 'okx',
      symbol,
      marketType,
      timeframe: interval,
      isSyncing: true,
    });

    try {
      const now = Date.now();
      const startTime = now - daysBack * 24 * 60 * 60 * 1000;
      let fetched = 0;
      let stored = 0;
      let currentEndTime = now;

      // OKX uses before/after differently - we go backwards from now
      while (currentEndTime > startTime) {
        const candles = await this.fetchKlines({
          symbol,
          interval,
          limit: 300, // OKX max limit
          endTime: currentEndTime,
          startTime,
          marketType,
        });

        if (candles.length === 0) break;

        const batchStored = await OhlcvService.storeCandles(candles);
        fetched += candles.length;
        stored += batchStored;

        params.onProgress?.(fetched, stored);

        // Move back in time
        const firstCandle = candles[0];
        currentEndTime = firstCandle.openTime.getTime() - 1;

        await new Promise((r) => setTimeout(r, 100));
      }

      await OhlcvService.updateSyncStatus({
        exchange: 'okx',
        symbol,
        marketType,
        timeframe: interval,
        lastSyncTime: new Date(),
        lastCandleTime: new Date(currentEndTime),
        candlesCount: stored,
        isSyncing: false,
      });

      return { fetched, stored };
    } catch (error) {
      await OhlcvService.updateSyncStatus({
        exchange: 'okx',
        symbol,
        marketType,
        timeframe: interval,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
}

/**
 * Unified Multi-Exchange Fetcher
 */
export class MultiExchangeFetcher {
  static async fetchKlines(params: {
    exchange: ExchangeId;
    symbol: string;
    interval: string;
    limit?: number;
    startTime?: number;
    endTime?: number;
    marketType?: 'spot' | 'futures';
  }): Promise<OhlcvCandle[]> {
    switch (params.exchange) {
      case 'binance':
        return BinanceDataFetcher.fetchKlines(params);
      case 'bybit':
        return BybitDataFetcher.fetchKlines(params);
      case 'okx':
        return OkxDataFetcher.fetchKlines(params);
      default:
        throw new Error(`Unsupported exchange: ${params.exchange}`);
    }
  }

  static async syncHistory(params: {
    exchange: ExchangeId;
    symbol: string;
    interval: string;
    marketType?: 'spot' | 'futures';
    daysBack?: number;
    onProgress?: (fetched: number, stored: number) => void;
  }): Promise<{ fetched: number; stored: number }> {
    switch (params.exchange) {
      case 'binance':
        return BinanceDataFetcher.syncHistory(params);
      case 'bybit':
        return BybitDataFetcher.syncHistory(params);
      case 'okx':
        return OkxDataFetcher.syncHistory(params);
      default:
        throw new Error(`Unsupported exchange: ${params.exchange}`);
    }
  }
}
