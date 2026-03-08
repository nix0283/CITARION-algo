/**
 * Data Collector
 * Collects market data from multiple exchanges
 */

import type {
  OHLCV,
  Orderbook,
  OrderbookLevel,
  FundingRate,
  OpenInterest,
  MarketData,
  DataCollectionConfig,
  DataCollectionResult
} from './types'

// Exchange configurations
const EXCHANGE_CONFIGS = {
  binance: {
    baseUrl: 'https://fapi.binance.com',
    wsUrl: 'wss://fstream.binance.com'
  },
  bybit: {
    baseUrl: 'https://api.bybit.com',
    wsUrl: 'wss://stream.bybit.com'
  },
  okx: {
    baseUrl: 'https://www.okx.com',
    wsUrl: 'wss://ws.okx.com'
  },
  bitget: {
    baseUrl: 'https://api.bitget.com',
    wsUrl: 'wss://ws.bitget.com'
  },
  bingx: {
    baseUrl: 'https://open-api.bingx.com',
    wsUrl: 'wss://open-api-ws.bingx.com'
  }
}

export class DataCollector {
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map()
  private cacheTTL = 60000 // 1 minute
  private requestDelay = 100 // ms between requests

  /**
   * Collect OHLCV data from exchange
   */
  async collectOHLCV(
    exchange: string,
    symbol: string,
    interval: string = '1h',
    limit: number = 500
  ): Promise<OHLCV[]> {
    const cacheKey = `ohlcv_${exchange}_${symbol}_${interval}`
    const cached = this.getFromCache<OHLCV[]>(cacheKey)
    if (cached) return cached

    try {
      let ohlcv: OHLCV[] = []

      switch (exchange.toLowerCase()) {
        case 'binance':
          ohlcv = await this.fetchBinanceOHLCV(symbol, interval, limit)
          break
        case 'bybit':
          ohlcv = await this.fetchBybitOHLCV(symbol, interval, limit)
          break
        case 'okx':
          ohlcv = await this.fetchOKXOHLCV(symbol, interval, limit)
          break
        case 'bitget':
          ohlcv = await this.fetchBitgetOHLCV(symbol, interval, limit)
          break
        case 'bingx':
          ohlcv = await this.fetchBingXOHLCV(symbol, interval, limit)
          break
        default:
          throw new Error(`Unsupported exchange: ${exchange}`)
      }

      this.setCache(cacheKey, ohlcv)
      return ohlcv
    } catch (error) {
      console.error(`Error collecting OHLCV from ${exchange}:`, error)
      throw error
    }
  }

  /**
   * Collect orderbook data
   */
  async collectOrderbook(
    exchange: string,
    symbol: string,
    depth: number = 20
  ): Promise<Orderbook> {
    const cacheKey = `orderbook_${exchange}_${symbol}`
    const cached = this.getFromCache<Orderbook>(cacheKey)
    if (cached) return cached

    try {
      let orderbook: Orderbook

      switch (exchange.toLowerCase()) {
        case 'binance':
          orderbook = await this.fetchBinanceOrderbook(symbol, depth)
          break
        case 'bybit':
          orderbook = await this.fetchBybitOrderbook(symbol, depth)
          break
        case 'okx':
          orderbook = await this.fetchOKXOrderbook(symbol, depth)
          break
        case 'bitget':
          orderbook = await this.fetchBitgetOrderbook(symbol, depth)
          break
        case 'bingx':
          orderbook = await this.fetchBingXOrderbook(symbol, depth)
          break
        default:
          throw new Error(`Unsupported exchange: ${exchange}`)
      }

      this.setCache(cacheKey, orderbook)
      return orderbook
    } catch (error) {
      console.error(`Error collecting orderbook from ${exchange}:`, error)
      throw error
    }
  }

  /**
   * Collect funding rate
   */
  async collectFundingRate(
    exchange: string,
    symbol: string
  ): Promise<FundingRate> {
    const cacheKey = `funding_${exchange}_${symbol}`
    const cached = this.getFromCache<FundingRate>(cacheKey)
    if (cached) return cached

    try {
      let fundingRate: FundingRate

      switch (exchange.toLowerCase()) {
        case 'binance':
          fundingRate = await this.fetchBinanceFundingRate(symbol)
          break
        case 'bybit':
          fundingRate = await this.fetchBybitFundingRate(symbol)
          break
        case 'okx':
          fundingRate = await this.fetchOKXFundingRate(symbol)
          break
        case 'bitget':
          fundingRate = await this.fetchBitgetFundingRate(symbol)
          break
        case 'bingx':
          fundingRate = await this.fetchBingXFundingRate(symbol)
          break
        default:
          throw new Error(`Unsupported exchange: ${exchange}`)
      }

      this.setCache(cacheKey, fundingRate)
      return fundingRate
    } catch (error) {
      console.error(`Error collecting funding rate from ${exchange}:`, error)
      throw error
    }
  }

  /**
   * Collect open interest
   */
  async collectOpenInterest(
    exchange: string,
    symbol: string
  ): Promise<OpenInterest> {
    const cacheKey = `oi_${exchange}_${symbol}`
    const cached = this.getFromCache<OpenInterest>(cacheKey)
    if (cached) return cached

    try {
      let openInterest: OpenInterest

      switch (exchange.toLowerCase()) {
        case 'binance':
          openInterest = await this.fetchBinanceOpenInterest(symbol)
          break
        case 'bybit':
          openInterest = await this.fetchBybitOpenInterest(symbol)
          break
        case 'okx':
          openInterest = await this.fetchOKXOpenInterest(symbol)
          break
        default:
          throw new Error(`Unsupported exchange: ${exchange}`)
      }

      this.setCache(cacheKey, openInterest)
      return openInterest
    } catch (error) {
      console.error(`Error collecting open interest from ${exchange}:`, error)
      throw error
    }
  }

  /**
   * Collect all market data
   */
  async collectMarketData(
    exchange: string,
    symbol: string,
    interval: string = '1h'
  ): Promise<MarketData> {
    const [ohlcv, orderbook, fundingRate, openInterest] = await Promise.all([
      this.collectOHLCV(exchange, symbol, interval, 100),
      this.collectOrderbook(exchange, symbol).catch(() => undefined),
      this.collectFundingRate(exchange, symbol).catch(() => undefined),
      this.collectOpenInterest(exchange, symbol).catch(() => undefined)
    ])

    return {
      symbol,
      exchange,
      ohlcv,
      orderbook,
      fundingRate,
      openInterest
    }
  }

  /**
   * Collect data for multiple symbols and exchanges
   */
  async collectBatch(
    config: DataCollectionConfig
  ): Promise<DataCollectionResult[]> {
    const results: DataCollectionResult[] = []

    for (const exchange of config.exchanges) {
      for (const symbol of config.symbols) {
        try {
          const ohlcv = await this.collectOHLCV(exchange, symbol, config.interval)
          results.push({
            success: true,
            symbol,
            exchange,
            recordsCollected: ohlcv.length,
            timestamp: Date.now()
          })
          
          // Rate limiting
          await this.delay(this.requestDelay)
        } catch (error) {
          results.push({
            success: false,
            symbol,
            exchange,
            recordsCollected: 0,
            timestamp: Date.now(),
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    }

    return results
  }

  // Exchange-specific implementations

  private async fetchBinanceOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    const url = `${EXCHANGE_CONFIGS.binance.baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    const response = await fetch(url)
    const data = await response.json() as Array<[number, string, string, string, string, string]>
    
    return data.map((k) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }))
  }

  private async fetchBybitOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    const url = `${EXCHANGE_CONFIGS.bybit.baseUrl}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`
    const response = await fetch(url)
    const data = await response.json() as { result: { list: Array<[string, string, string, string, string, string, string]> } }
    
    return data.result.list.map((k) => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).reverse()
  }

  private async fetchOKXOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    const instId = symbol.replace('USDT', '-USDT-SWAP')
    const bar = interval.replace('h', 'H').replace('m', 'm').replace('d', 'D')
    const url = `${EXCHANGE_CONFIGS.okx.baseUrl}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`
    const response = await fetch(url)
    const data = await response.json() as { data: Array<[string, string, string, string, string, string, string]> }
    
    return data.data.map((k) => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).reverse()
  }

  private async fetchBitgetOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    const url = `${EXCHANGE_CONFIGS.bitget.baseUrl}/api/v2/mix/market/candles?productType=USDT-FUTURES&symbol=${symbol}&granularity=${interval}&limit=${limit}`
    const response = await fetch(url)
    const data = await response.json() as { data: Array<{ ts: string; o: string; h: string; l: string; c: string; vol: string }> }
    
    return data.data.map((k) => ({
      timestamp: parseInt(k.ts),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.vol)
    }))
  }

  private async fetchBingXOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    const url = `${EXCHANGE_CONFIGS.bingx.baseUrl}/openApi/swap/v3/quote/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    const response = await fetch(url)
    const data = await response.json() as { data: Array<{ time: number; open: string; high: string; low: string; close: string; volume: string }> }
    
    return data.data.map((k) => ({
      timestamp: k.time,
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume)
    }))
  }

  private async fetchBinanceOrderbook(symbol: string, depth: number): Promise<Orderbook> {
    const url = `${EXCHANGE_CONFIGS.binance.baseUrl}/fapi/v1/depth?symbol=${symbol}&limit=${depth}`
    const response = await fetch(url)
    const data = await response.json() as { lastUpdateId: number; bids: Array<[string, string]>; asks: Array<[string, string]> }
    
    return {
      timestamp: Date.now(),
      bids: data.bids.map((b) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
      asks: data.asks.map((a) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) }))
    }
  }

  private async fetchBybitOrderbook(symbol: string, depth: number): Promise<Orderbook> {
    const url = `${EXCHANGE_CONFIGS.bybit.baseUrl}/v5/market/orderbook?category=linear&symbol=${symbol}&limit=${depth}`
    const response = await fetch(url)
    const data = await response.json() as { result: { ts: number; b: Array<[string, string]>; a: Array<[string, string]> } }
    
    return {
      timestamp: data.result.ts,
      bids: data.result.b.map((b) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
      asks: data.result.a.map((a) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) }))
    }
  }

  private async fetchOKXOrderbook(symbol: string, depth: number): Promise<Orderbook> {
    const instId = symbol.replace('USDT', '-USDT-SWAP')
    const url = `${EXCHANGE_CONFIGS.okx.baseUrl}/api/v5/market/books?instId=${instId}&sz=${depth}`
    const response = await fetch(url)
    const data = await response.json() as { data: Array<{ ts: string; bids: Array<[string, string, string]>; asks: Array<[string, string, string]> }> }
    
    return {
      timestamp: parseInt(data.data[0].ts),
      bids: data.data[0].bids.map((b) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
      asks: data.data[0].asks.map((a) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) }))
    }
  }

  private async fetchBitgetOrderbook(symbol: string, depth: number): Promise<Orderbook> {
    const url = `${EXCHANGE_CONFIGS.bitget.baseUrl}/api/v2/mix/market/orderbook?productType=USDT-FUTURES&symbol=${symbol}&limit=${depth}`
    const response = await fetch(url)
    const data = await response.json() as { data: { asks: Array<{ price: string; size: string }>; bids: Array<{ price: string; size: string }> } }
    
    return {
      timestamp: Date.now(),
      bids: data.data.bids.map((b) => ({ price: parseFloat(b.price), quantity: parseFloat(b.size) })),
      asks: data.data.asks.map((a) => ({ price: parseFloat(a.price), quantity: parseFloat(a.size) }))
    }
  }

  private async fetchBingXOrderbook(symbol: string, depth: number): Promise<Orderbook> {
    const url = `${EXCHANGE_CONFIGS.bingx.baseUrl}/openApi/swap/v3/quote/depth?symbol=${symbol}&limit=${depth}`
    const response = await fetch(url)
    const data = await response.json() as { data: { asks: Array<{ price: string; quantity: string }>; bids: Array<{ price: string; quantity: string }> } }
    
    return {
      timestamp: Date.now(),
      bids: data.data.bids.map((b) => ({ price: parseFloat(b.price), quantity: parseFloat(b.quantity) })),
      asks: data.data.asks.map((a) => ({ price: parseFloat(a.price), quantity: parseFloat(a.quantity) }))
    }
  }

  private async fetchBinanceFundingRate(symbol: string): Promise<FundingRate> {
    const url = `${EXCHANGE_CONFIGS.binance.baseUrl}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`
    const response = await fetch(url)
    const data = await response.json() as Array<{ fundingTime: number; fundingRate: string }>
    
    return {
      timestamp: data[0].fundingTime,
      rate: parseFloat(data[0].fundingRate),
      nextFundingTime: data[0].fundingTime + 8 * 60 * 60 * 1000 // 8 hours
    }
  }

  private async fetchBybitFundingRate(symbol: string): Promise<FundingRate> {
    const url = `${EXCHANGE_CONFIGS.bybit.baseUrl}/v5/market/funding/history?category=linear&symbol=${symbol}&limit=1`
    const response = await fetch(url)
    const data = await response.json() as { result: { list: Array<{ fundingRateTimestamp: string; fundingRate: string }> } }
    
    return {
      timestamp: parseInt(data.result.list[0].fundingRateTimestamp),
      rate: parseFloat(data.result.list[0].fundingRate),
      nextFundingTime: parseInt(data.result.list[0].fundingRateTimestamp) + 8 * 60 * 60 * 1000
    }
  }

  private async fetchOKXFundingRate(symbol: string): Promise<FundingRate> {
    const instId = symbol.replace('USDT', '-USDT-SWAP')
    const url = `${EXCHANGE_CONFIGS.okx.baseUrl}/api/v5/public/funding-rate?instId=${instId}`
    const response = await fetch(url)
    const data = await response.json() as { data: Array<{ ts: string; fundingRate: string; nextFundingRate: string }> }
    
    return {
      timestamp: parseInt(data.data[0].ts),
      rate: parseFloat(data.data[0].fundingRate),
      nextFundingTime: parseInt(data.data[0].nextFundingRate)
    }
  }

  private async fetchBitgetFundingRate(symbol: string): Promise<FundingRate> {
    const url = `${EXCHANGE_CONFIGS.bitget.baseUrl}/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol}`
    const response = await fetch(url)
    const data = await response.json() as { data: Array<{ fundingRate: string; ts: string }> }
    
    return {
      timestamp: parseInt(data.data[0].ts),
      rate: parseFloat(data.data[0].fundingRate),
      nextFundingTime: Date.now() + 8 * 60 * 60 * 1000
    }
  }

  private async fetchBingXFundingRate(symbol: string): Promise<FundingRate> {
    const url = `${EXCHANGE_CONFIGS.bingx.baseUrl}/openApi/swap/v3/quote/fundingRate?symbol=${symbol}`
    const response = await fetch(url)
    const data = await response.json() as { data: { fundingRate: string; time: number } }
    
    return {
      timestamp: data.data.time,
      rate: parseFloat(data.data.fundingRate),
      nextFundingTime: data.data.time + 8 * 60 * 60 * 1000
    }
  }

  private async fetchBinanceOpenInterest(symbol: string): Promise<OpenInterest> {
    const url = `${EXCHANGE_CONFIGS.binance.baseUrl}/fapi/v1/openInterest?symbol=${symbol}`
    const response = await fetch(url)
    const data = await response.json() as { openInterest: string; time: number }
    
    return {
      timestamp: data.time,
      value: parseFloat(data.openInterest)
    }
  }

  private async fetchBybitOpenInterest(symbol: string): Promise<OpenInterest> {
    const url = `${EXCHANGE_CONFIGS.bybit.baseUrl}/v5/market/open-interest?category=linear&symbol=${symbol}`
    const response = await fetch(url)
    const data = await response.json() as { result: { list: Array<{ openInterest: string; timestamp: string }> } }
    
    return {
      timestamp: parseInt(data.result.list[0].timestamp),
      value: parseFloat(data.result.list[0].openInterest)
    }
  }

  private async fetchOKXOpenInterest(symbol: string): Promise<OpenInterest> {
    const instId = symbol.replace('USDT', '-USDT-SWAP')
    const url = `${EXCHANGE_CONFIGS.okx.baseUrl}/api/v5/public/open-interest?instId=${instId}`
    const response = await fetch(url)
    const data = await response.json() as { data: Array<{ oi: string; ts: string }> }
    
    return {
      timestamp: parseInt(data.data[0].ts),
      value: parseFloat(data.data[0].oi)
    }
  }

  // Cache helpers
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as T
    }
    return null
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}

// Singleton instance
export const dataCollector = new DataCollector()
