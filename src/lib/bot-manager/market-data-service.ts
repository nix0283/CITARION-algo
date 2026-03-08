/**
 * Market Data Service
 * 
 * Unified service for fetching market data from exchanges.
 * Used by all trading bots for price, orderbook, and candle data.
 */

import { createExchangeClient, type ExchangeId, type BaseExchangeClient } from '@/lib/exchange'

// ============================================================================
// TYPES
// ============================================================================

export interface Ticker {
  symbol: string
  exchange: string
  bid: number
  ask: number
  last: number
  high24h: number
  low24h: number
  volume24h: number
  timestamp: number
}

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderbookLevel {
  price: number
  quantity: number
}

export interface Orderbook {
  symbol: string
  exchange: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  timestamp: number
}

export interface MarketDataConfig {
  exchange: ExchangeId
  symbol: string
  credentials?: {
    apiKey: string
    apiSecret: string
    passphrase?: string
  }
}

// ============================================================================
// MARKET DATA SERVICE
// ============================================================================

class MarketDataService {
  private clients: Map<string, BaseExchangeClient> = new Map()
  private tickerCache: Map<string, { data: Ticker; timestamp: number }> = new Map()
  private cacheTTL = 1000 // 1 second

  /**
   * Get or create exchange client
   */
  private getClient(exchange: ExchangeId, credentials?: MarketDataConfig['credentials']): BaseExchangeClient {
    const key = `${exchange}_${credentials?.apiKey || 'public'}`
    
    if (!this.clients.has(key)) {
      const client = createExchangeClient({
        exchangeId: exchange,
        credentials: credentials || { apiKey: '', apiSecret: '' },
        marketType: 'futures',
        tradingMode: 'LIVE',
      })
      this.clients.set(key, client)
    }
    
    return this.clients.get(key)!
  }

  /**
   * Get ticker (with caching)
   */
  async getTicker(config: MarketDataConfig): Promise<Ticker> {
    const cacheKey = `${config.exchange}_${config.symbol}`
    const cached = this.tickerCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data
    }

    const client = this.getClient(config.exchange, config.credentials)
    
    // Get ticker from exchange
    const ticker = await client.getTicker(config.symbol)
    
    const result: Ticker = {
      symbol: config.symbol,
      exchange: config.exchange,
      bid: ticker.bid,
      ask: ticker.ask,
      last: ticker.last,
      high24h: ticker.high24h || ticker.last,
      low24h: ticker.low24h || ticker.last,
      volume24h: ticker.volume24h || 0,
      timestamp: Date.now(),
    }
    
    this.tickerCache.set(cacheKey, { data: result, timestamp: Date.now() })
    
    return result
  }

  /**
   * Get orderbook
   */
  async getOrderbook(config: MarketDataConfig, depth: number = 20): Promise<Orderbook> {
    const client = this.getClient(config.exchange, config.credentials)
    
    const ob = await client.getOrderbook(config.symbol, depth)
    
    return {
      symbol: config.symbol,
      exchange: config.exchange,
      bids: ob.bids.slice(0, depth),
      asks: ob.asks.slice(0, depth),
      timestamp: Date.now(),
    }
  }

  /**
   * Get candlestick data
   */
  async getCandles(
    config: MarketDataConfig,
    interval: string = '1m',
    limit: number = 100
  ): Promise<Candle[]> {
    const client = this.getClient(config.exchange, config.credentials)
    
    const candles = await client.getKlines(config.symbol, interval, limit)
    
    return candles.map((c: any) => ({
      timestamp: c.openTime || c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
  }

  /**
   * Get mid price
   */
  async getMidPrice(config: MarketDataConfig): Promise<number> {
    const ticker = await this.getTicker(config)
    return (ticker.bid + ticker.ask) / 2
  }

  /**
   * Get spread
   */
  async getSpread(config: MarketDataConfig): Promise<{ absolute: number; percent: number }> {
    const ticker = await this.getTicker(config)
    const absolute = ticker.ask - ticker.bid
    const percent = (absolute / ticker.last) * 100
    return { absolute, percent }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.tickerCache.clear()
  }

  /**
   * Get cached tickers
   */
  getCachedTickers(): Ticker[] {
    return Array.from(this.tickerCache.values()).map(c => c.data)
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let marketDataInstance: MarketDataService | null = null

export function getMarketDataService(): MarketDataService {
  if (!marketDataInstance) {
    marketDataInstance = new MarketDataService()
  }
  return marketDataInstance
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { Ticker, Candle, Orderbook, OrderbookLevel, MarketDataConfig }
