/**
 * Argus - Pump & Dump Detection and Trading System
 * 
 * Named after the mythological hundred-eyed giant, Argus watches
 * the markets for pump and dump patterns across multiple exchanges.
 * 
 * Features:
 * - Market Cap filtering via CoinMarketCap API (cached)
 * - Pump/Dump detection (5min and 15min intervals)
 * - Orderbook imbalance analysis for Binance, Bybit, BingX
 * - 4 trading strategies: 5% long/short, 12% long/short
 * - Automatic SL/TP/Trailing management
 * - Multi-exchange support (BingX, Binance, Bybit)
 * 
 * Based on research from:
 * - https://habr.com/ru/articles/963358/
 * - https://habr.com/ru/articles/972562/
 * - https://github.com/roman-boop/pump_tracker_bingx
 */

import { db } from "@/lib/db";
import { notifyTelegram, notifyUI } from "@/lib/notification-service";
import { getDefaultUserId } from "@/lib/default-user";

// ==================== TYPES ====================

export type SignalType = "PUMP_5" | "PUMP_12" | "DUMP_5" | "DUMP_12";
export type StrategyType = "5LONG" | "5SHORT" | "12LONG" | "12SHORT";
export type ArgusStatus = "ACTIVE" | "PAUSED" | "STOPPED";

export interface MarketCapInfo {
  symbol: string;
  name?: string;
  marketCap: number;
  lastUpdated: Date;
}

export interface PriceChange {
  symbol: string;
  exchange: string;
  price: number;
  change5m: number;
  change15m: number;
  change1h: number;
  volume24h: number;
  timestamp: Date;
}

export interface OrderbookImbalance {
  symbol: string;
  exchange: string;
  bidVolume: number;
  askVolume: number;
  imbalance: number; // -1 to 1 (negative = sellers, positive = buyers)
  timestamp: Date;
}

export interface ArgusSignal {
  id: string;
  symbol: string;
  exchange: string;
  type: SignalType;
  priceChange: number;
  currentPrice: number;
  previousPrice: number;
  volume24h: number;
  marketCap?: number;
  imbalance?: number;
  timestamp: Date;
  processed: boolean;
}

export interface ArgusBotConfig {
  id: string;
  userId: string;
  name: string;
  status: ArgusStatus;
  
  // Exchange settings
  exchange: string;
  accountId?: string;
  
  // Strategy toggles
  enable5Long: boolean;
  enable5Short: boolean;
  enable12Long: boolean;
  enable12Short: boolean;
  
  // Detection thresholds
  pumpThreshold5m: number;    // Default: 0.05 (5%)
  pumpThreshold15m: number;   // Default: 0.10 (10%)
  dumpThreshold5m: number;    // Default: -0.05 (-5%)
  dumpThreshold15m: number;   // Default: -0.10 (-10%)
  
  // Market cap filter
  maxMarketCap: number;       // Default: 100_000_000 (100M)
  minMarketCap: number;       // Default: 1_000_000 (1M)
  
  // Orderbook filter
  useImbalanceFilter: boolean;
  imbalanceThreshold: number; // Default: 0.2 (20% imbalance required)
  
  // Risk management
  leverage: number;
  positionSize: number;       // USDT per trade
  stopLoss5: number;          // Default: 0.05 (5%)
  stopLoss12: number;         // Default: 0.12 (12%)
  takeProfit5: number[];      // Default: [0.05, 0.10, 0.15]
  takeProfit12: number[];     // Default: [0.12, 0.18, 0.25]
  
  // Trailing stop
  useTrailing: boolean;
  trailingActivation5: number;
  trailingActivation12: number;
  trailingDistance5: number;
  trailingDistance12: number;
  
  // Cooldown
  cooldownMinutes: number;    // Default: 30
  
  // Notifications
  notifyOnSignal: boolean;
  notifyOnTrade: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

// ==================== CONSTANTS ====================

const CMC_API_URL = "https://pro-api.coinmarketcap.com";
const CMC_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// ==================== MARKET CAP SERVICE ====================

class MarketCapService {
  private cache: Map<string, MarketCapInfo> = new Map();
  private lastCacheUpdate: Date | null = null;
  private cmcApiKey: string | null = null;

  setApiKey(apiKey: string): void {
    this.cmcApiKey = apiKey;
  }

  /**
   * Load low-cap symbols from CoinMarketCap
   */
  async loadLowCapSymbols(maxCap: number = 100_000_000): Promise<MarketCapInfo[]> {
    if (!this.cmcApiKey) {
      console.warn("[Argus/MarketCap] No CMC API key configured, using fallback");
      return this.getFallbackLowCapSymbols();
    }

    // Check cache
    if (this.lastCacheUpdate && 
        Date.now() - this.lastCacheUpdate.getTime() < CMC_CACHE_DURATION &&
        this.cache.size > 0) {
      return Array.from(this.cache.values()).filter(
        info => info.marketCap > 0 && info.marketCap < maxCap
      );
    }

    try {
      console.log("[Argus/MarketCap] Fetching from CoinMarketCap API...");
      
      // Get all cryptocurrencies
      const response = await fetch(
        `${CMC_API_URL}/v1/cryptocurrency/listings/latest?limit=5000&convert=USD`,
        {
          headers: {
            "X-CMC_PRO_API_KEY": this.cmcApiKey,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`CMC API error: ${response.status}`);
      }

      const data = await response.json() as {
        data: Array<{
          symbol: string;
          name: string;
          quote: {
            USD: {
              market_cap: number;
            };
          };
        }>;
      };

      // Clear and rebuild cache
      this.cache.clear();

      for (const coin of data.data) {
        const marketCap = coin.quote.USD.market_cap;
        if (marketCap && marketCap > 0) {
          this.cache.set(coin.symbol.toUpperCase(), {
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            marketCap,
            lastUpdated: new Date(),
          });
        }
      }

      this.lastCacheUpdate = new Date();
      console.log(`[Argus/MarketCap] Cached ${this.cache.size} symbols`);

      return Array.from(this.cache.values()).filter(
        info => info.marketCap < maxCap
      );
    } catch (error) {
      console.error("[Argus/MarketCap] API error:", error);
      return this.getFallbackLowCapSymbols();
    }
  }

  /**
   * Fallback list of known low-cap symbols
   */
  private getFallbackLowCapSymbols(): MarketCapInfo[] {
    // Common low-cap trading pairs
    const fallbackSymbols = [
      "PEPE", "BONK", "FLOKI", "SHIB", "DOGE", "WIF", "MEME", "DOGS",
      "NOT", "TURBO", "BOME", "MYRO", "PONKE", "POPCAT", "MOG", "NEIRO",
      "GOAT", "BRETT", "SPX", "GIGA", "BABYDOGE", "SATS", "RATS", "ORDI"
    ];

    return fallbackSymbols.map(symbol => ({
      symbol,
      marketCap: 50_000_000, // Assume ~50M market cap
      lastUpdated: new Date(),
    }));
  }

  /**
   * Get market cap for a specific symbol
   */
  getMarketCap(symbol: string): number | null {
    const info = this.cache.get(symbol.toUpperCase());
    return info?.marketCap ?? null;
  }

  /**
   * Check if symbol is low-cap
   */
  isLowCap(symbol: string, maxCap: number = 100_000_000): boolean {
    const marketCap = this.getMarketCap(symbol);
    if (marketCap === null) {
      // Unknown symbol - might be very low cap or new
      return true;
    }
    return marketCap > 0 && marketCap < maxCap;
  }
}

// ==================== ORDERBOOK IMBALANCE SERVICE ====================

class OrderbookImbalanceService {
  /**
   * Get orderbook from exchange without authentication (public endpoint)
   */
  private async fetchOrderbookPublic(
    symbol: string,
    exchange: string,
    depth: number = 100
  ): Promise<OrderbookImbalance | null> {
    try {
      let bidVolume = 0;
      let askVolume = 0;

      switch (exchange.toLowerCase()) {
        case "binance": {
          // Binance Futures orderbook (public)
          const response = await fetch(
            `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=${depth}`
          );
          const data = await response.json() as {
            bids: Array<[string, string]>;
            asks: Array<[string, string]>;
          };
          
          for (const [price, qty] of data.bids || []) {
            bidVolume += parseFloat(price) * parseFloat(qty);
          }
          for (const [price, qty] of data.asks || []) {
            askVolume += parseFloat(price) * parseFloat(qty);
          }
          break;
        }

        case "bybit": {
          // Bybit V5 orderbook (public)
          const response = await fetch(
            `https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${symbol}&limit=${Math.min(depth, 200)}`
          );
          const data = await response.json() as {
            retCode: number;
            result: {
              b: Array<[string, string]>;
              a: Array<[string, string]>;
            };
          };

          if (data.retCode !== 0 || !data.result) {
            console.error(`[Argus/Bybit] Orderbook error: ${data.retCode}`);
            return null;
          }

          for (const [price, size] of data.result.b || []) {
            bidVolume += parseFloat(price) * parseFloat(size);
          }
          for (const [price, size] of data.result.a || []) {
            askVolume += parseFloat(price) * parseFloat(size);
          }
          break;
        }

        case "bingx": {
          // BingX Swap V2 orderbook (public)
          const response = await fetch(
            `https://open-api.bingx.com/openApi/swap/v2/quote/depth?symbol=${symbol}&limit=${depth}`
          );
          const data = await response.json() as {
            code: number;
            data: {
              bids: Array<{ price: string; qty: string }>;
              asks: Array<{ price: string; qty: string }>;
            };
          };

          if (data.code !== 0 || !data.data) {
            console.error(`[Argus/BingX] Orderbook error: ${data.code}`);
            return null;
          }

          for (const b of data.data.bids || []) {
            bidVolume += parseFloat(b.price) * parseFloat(b.qty);
          }
          for (const a of data.data.asks || []) {
            askVolume += parseFloat(a.price) * parseFloat(a.qty);
          }
          break;
        }

        default:
          console.warn(`[Argus/Orderbook] Unsupported exchange: ${exchange}`);
          return null;
      }

      const totalVolume = bidVolume + askVolume;
      const imbalance = totalVolume > 0
        ? (bidVolume - askVolume) / totalVolume
        : 0;

      return {
        symbol,
        exchange,
        bidVolume,
        askVolume,
        imbalance,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`[Argus/Orderbook] Error for ${symbol} on ${exchange}:`, error);
      return null;
    }
  }

  /**
   * Calculate orderbook imbalance for a symbol
   */
  async getImbalance(
    symbol: string,
    exchange: string,
    depth: number = 100
  ): Promise<OrderbookImbalance | null> {
    return this.fetchOrderbookPublic(symbol, exchange, depth);
  }

  /**
   * Calculate imbalance for multiple symbols in parallel
   */
  async getImbalanceBatch(
    symbols: Array<{ symbol: string; exchange: string }>,
    depth: number = 100
  ): Promise<Map<string, OrderbookImbalance>> {
    const results = new Map<string, OrderbookImbalance>();

    // Process in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const promises = batch.map(async ({ symbol, exchange }) => {
        const imbalance = await this.fetchOrderbookPublic(symbol, exchange, depth);
        if (imbalance) {
          results.set(`${exchange}:${symbol}`, imbalance);
        }
      });

      await Promise.all(promises);

      // Small delay between batches
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Check if imbalance supports a trade direction
   */
  supportsDirection(imbalance: number, isLong: boolean, threshold: number = 0.1): boolean {
    if (isLong) {
      // For longs, we want positive imbalance (more buyers)
      return imbalance >= threshold;
    } else {
      // For shorts, we want negative imbalance (more sellers)
      return imbalance <= -threshold;
    }
  }

  /**
   * Check if imbalance supports counter-trend trade
   */
  supportsCounterTrend(imbalance: number, isLong: boolean, threshold: number = 0.1): boolean {
    // For counter-trend: we want opposite imbalance
    if (isLong) {
      // Buying against sellers (contrarian)
      return imbalance <= -threshold;
    } else {
      // Selling against buyers (contrarian)
      return imbalance >= threshold;
    }
  }

  /**
   * Get aggregate imbalance across multiple exchanges
   */
  async getAggregateImbalance(
    symbol: string,
    exchanges: string[],
    depth: number = 100
  ): Promise<{ aggregateImbalance: number; byExchange: Map<string, OrderbookImbalance> }> {
    const byExchange = new Map<string, OrderbookImbalance>();
    let totalBidVolume = 0;
    let totalAskVolume = 0;

    for (const exchange of exchanges) {
      const imbalance = await this.fetchOrderbookPublic(symbol, exchange, depth);
      if (imbalance) {
        byExchange.set(exchange, imbalance);
        totalBidVolume += imbalance.bidVolume;
        totalAskVolume += imbalance.askVolume;
      }
    }

    const totalVolume = totalBidVolume + totalAskVolume;
    const aggregateImbalance = totalVolume > 0
      ? (totalBidVolume - totalAskVolume) / totalVolume
      : 0;

    return { aggregateImbalance, byExchange };
  }
}

// ==================== ARGUS DETECTOR ====================

class ArgusDetector {
  private priceHistory: Map<string, { price: number; timestamp: Date }[]> = new Map();
  private marketCapService: MarketCapService;
  private imbalanceService: OrderbookImbalanceService;

  constructor(marketCapService: MarketCapService, imbalanceService: OrderbookImbalanceService) {
    this.marketCapService = marketCapService;
    this.imbalanceService = imbalanceService;
  }

  /**
   * Update price history for a symbol
   */
  updatePrice(symbol: string, exchange: string, price: number, volume24h?: number): void {
    const key = `${exchange}:${symbol}`;
    
    if (!this.priceHistory.has(key)) {
      this.priceHistory.set(key, []);
    }

    const history = this.priceHistory.get(key)!;
    history.push({ price, timestamp: new Date() });

    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Calculate price changes for a symbol
   */
  calculateChanges(symbol: string, exchange: string): PriceChange | null {
    const key = `${exchange}:${symbol}`;
    const history = this.priceHistory.get(key);

    if (!history || history.length < 2) {
      return null;
    }

    const now = new Date();
    const current = history[history.length - 1];

    // Find prices at different intervals
    const price5mAgo = this.getPriceAt(history, now, 5 * 60 * 1000);
    const price15mAgo = this.getPriceAt(history, now, 15 * 60 * 1000);
    const price1hAgo = this.getPriceAt(history, now, 60 * 60 * 1000);

    return {
      symbol,
      exchange,
      price: current.price,
      change5m: price5mAgo ? (current.price - price5mAgo) / price5mAgo : 0,
      change15m: price15mAgo ? (current.price - price15mAgo) / price15mAgo : 0,
      change1h: price1hAgo ? (current.price - price1hAgo) / price1hAgo : 0,
      volume24h: 0,
      timestamp: now,
    };
  }

  /**
   * Get price at a specific time ago
   */
  private getPriceAt(
    history: { price: number; timestamp: Date }[],
    now: Date,
    msAgo: number
  ): number | null {
    const targetTime = new Date(now.getTime() - msAgo);
    
    // Find closest entry before target time
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].timestamp <= targetTime) {
        return history[i].price;
      }
    }

    return history[0]?.price ?? null;
  }

  /**
   * Detect pump signals
   */
  async detectSignals(
    config: ArgusBotConfig,
    prices: Map<string, { exchange: string; price: number; volume24h: number }>
  ): Promise<ArgusSignal[]> {
    const signals: ArgusSignal[] = [];

    for (const [symbol, data] of prices) {
      // Update price history
      this.updatePrice(symbol, data.exchange, data.price, data.volume24h);

      // Calculate changes
      const changes = this.calculateChanges(symbol, data.exchange);
      if (!changes) continue;

      // Check market cap filter
      const marketCap = this.marketCapService.getMarketCap(symbol);
      if (config.maxMarketCap > 0 && marketCap && marketCap > config.maxMarketCap) {
        continue;
      }
      if (config.minMarketCap > 0 && marketCap && marketCap < config.minMarketCap) {
        continue;
      }

      // Get orderbook imbalance
      let imbalance: number | undefined;
      if (config.useImbalanceFilter) {
        const imbalanceData = await this.imbalanceService.getImbalance(symbol, data.exchange);
        if (imbalanceData) {
          imbalance = imbalanceData.imbalance;
        }
      }

      // Detect PUMP signals
      if (changes.change5m >= config.pumpThreshold5m && config.enable5Long) {
        signals.push({
          id: `${symbol}-${Date.now()}`,
          symbol,
          exchange: data.exchange,
          type: "PUMP_5",
          priceChange: changes.change5m,
          currentPrice: changes.price,
          previousPrice: changes.price / (1 + changes.change5m),
          volume24h: changes.volume24h,
          marketCap: marketCap ?? undefined,
          imbalance,
          timestamp: new Date(),
          processed: false,
        });
      }

      if (changes.change5m >= config.pumpThreshold15m && config.enable12Long) {
        signals.push({
          id: `${symbol}-${Date.now()}-12`,
          symbol,
          exchange: data.exchange,
          type: "PUMP_12",
          priceChange: changes.change5m,
          currentPrice: changes.price,
          previousPrice: changes.price / (1 + changes.change5m),
          volume24h: changes.volume24h,
          marketCap: marketCap ?? undefined,
          imbalance,
          timestamp: new Date(),
          processed: false,
        });
      }

      // Detect DUMP signals
      if (changes.change5m <= config.dumpThreshold5m && config.enable5Short) {
        signals.push({
          id: `${symbol}-${Date.now()}-d5`,
          symbol,
          exchange: data.exchange,
          type: "DUMP_5",
          priceChange: changes.change5m,
          currentPrice: changes.price,
          previousPrice: changes.price / (1 + changes.change5m),
          volume24h: changes.volume24h,
          marketCap: marketCap ?? undefined,
          imbalance,
          timestamp: new Date(),
          processed: false,
        });
      }

      if (changes.change5m <= config.dumpThreshold15m && config.enable12Short) {
        signals.push({
          id: `${symbol}-${Date.now()}-d12`,
          symbol,
          exchange: data.exchange,
          type: "DUMP_12",
          priceChange: changes.change5m,
          currentPrice: changes.price,
          previousPrice: changes.price / (1 + changes.change5m),
          volume24h: changes.volume24h,
          marketCap: marketCap ?? undefined,
          imbalance,
          timestamp: new Date(),
          processed: false,
        });
      }
    }

    return signals;
  }
}

// ==================== ARGUS STRATEGY ====================

class ArgusStrategy {
  /**
   * Determine strategy from signal type
   */
  static getStrategy(signalType: SignalType): StrategyType {
    switch (signalType) {
      case "PUMP_5":
        return "5LONG";
      case "DUMP_5":
        return "5SHORT";
      case "PUMP_12":
        return "12SHORT"; // Counter-trend
      case "DUMP_12":
        return "12LONG"; // Counter-trend
    }
  }

  /**
   * Get stop loss percentage for strategy
   */
  static getStopLoss(strategy: StrategyType, config: ArgusBotConfig): number {
    switch (strategy) {
      case "5LONG":
      case "5SHORT":
        return config.stopLoss5;
      case "12LONG":
      case "12SHORT":
        return config.stopLoss12;
    }
  }

  /**
   * Get take profit levels for strategy
   */
  static getTakeProfits(strategy: StrategyType, config: ArgusBotConfig): number[] {
    switch (strategy) {
      case "5LONG":
      case "5SHORT":
        return config.takeProfit5;
      case "12LONG":
      case "12SHORT":
        return config.takeProfit12;
    }
  }

  /**
   * Calculate stop loss price
   */
  static calculateStopLoss(
    entryPrice: number,
    strategy: StrategyType,
    config: ArgusBotConfig
  ): number {
    const slPercent = this.getStopLoss(strategy, config);
    const isLong = strategy.includes("LONG");
    
    if (isLong) {
      return entryPrice * (1 - slPercent);
    } else {
      return entryPrice * (1 + slPercent);
    }
  }

  /**
   * Calculate take profit prices
   */
  static calculateTakeProfits(
    entryPrice: number,
    strategy: StrategyType,
    config: ArgusBotConfig
  ): number[] {
    const tpPercents = this.getTakeProfits(strategy, config);
    const isLong = strategy.includes("LONG");
    
    return tpPercents.map(tp => {
      if (isLong) {
        return entryPrice * (1 + tp);
      } else {
        return entryPrice * (1 - tp);
      }
    });
  }

  /**
   * Determine trade direction
   */
  static isLong(strategy: StrategyType): boolean {
    return strategy.includes("LONG");
  }

  /**
   * Check if imbalance filter passes
   */
  static passesImbalanceFilter(
    strategy: StrategyType,
    imbalance: number | undefined,
    config: ArgusBotConfig
  ): boolean {
    if (!config.useImbalanceFilter || imbalance === undefined) {
      return true;
    }

    const isLong = this.isLong(strategy);
    const isCounterTrend = strategy.startsWith("12");

    if (isCounterTrend) {
      // Counter-trend: need opposite imbalance
      if (isLong) {
        return imbalance <= -config.imbalanceThreshold;
      } else {
        return imbalance >= config.imbalanceThreshold;
      }
    } else {
      // Trend-following: need supporting imbalance
      if (isLong) {
        return imbalance >= config.imbalanceThreshold;
      } else {
        return imbalance <= -config.imbalanceThreshold;
      }
    }
  }
}

// ==================== ARGUS BOT WORKER ====================

export class ArgusBotWorker {
  private config: ArgusBotConfig;
  private marketCapService: MarketCapService;
  private imbalanceService: OrderbookImbalanceService;
  private detector: ArgusDetector;
  private lastTradeTimes: Map<string, Date> = new Map();
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: ArgusBotConfig) {
    this.config = config;
    this.marketCapService = new MarketCapService();
    this.imbalanceService = new OrderbookImbalanceService();
    this.detector = new ArgusDetector(this.marketCapService, this.imbalanceService);
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[Argus ${this.config.name}] Already running`);
      return;
    }

    this.isRunning = true;
    console.log(`[Argus ${this.config.name}] Starting...`);

    // Load market cap data
    await this.marketCapService.loadLowCapSymbols(this.config.maxMarketCap);

    // Start monitoring loop
    this.checkInterval = setInterval(async () => {
      await this.runDetection();
    }, 5 * 60 * 1000); // Check every 5 minutes

    // Initial run
    await this.runDetection();

    console.log(`[Argus ${this.config.name}] Started`);
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log(`[Argus ${this.config.name}] Stopped`);
  }

  /**
   * Run pump/dump detection
   */
  private async runDetection(): Promise<void> {
    if (this.config.status !== "ACTIVE") {
      return;
    }

    try {
      // Get prices from WebSocket (would integrate with existing price-websocket)
      // For now, this is a placeholder
      const prices = new Map<string, { exchange: string; price: number; volume24h: number }>();

      // Detect signals
      const signals = await this.detector.detectSignals(this.config, prices);

      // Process signals
      for (const signal of signals) {
        await this.processSignal(signal);
      }
    } catch (error) {
      console.error(`[Argus ${this.config.name}] Detection error:`, error);
    }
  }

  /**
   * Process a pump/dump signal
   */
  private async processSignal(signal: ArgusSignal): Promise<void> {
    const strategy = ArgusStrategy.getStrategy(signal.type);

    // Check cooldown
    const tradeKey = `${signal.symbol}-${strategy}`;
    const lastTrade = this.lastTradeTimes.get(tradeKey);
    if (lastTrade && this.config.cooldownMinutes > 0) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      if (Date.now() - lastTrade.getTime() < cooldownMs) {
        console.log(`[Argus] ${signal.symbol} on cooldown`);
        return;
      }
    }

    // Check imbalance filter
    if (!ArgusStrategy.passesImbalanceFilter(strategy, signal.imbalance, this.config)) {
      console.log(`[Argus] ${signal.symbol} failed imbalance filter`);
      return;
    }

    // Notify
    if (this.config.notifyOnSignal) {
      await notifyTelegram({
        type: "SIGNAL_RECEIVED",
        title: `👁️ Argus: ${signal.type} Detected!`,
        message: `${signal.symbol} on ${signal.exchange}
Change: ${(signal.priceChange * 100).toFixed(2)}%
Price: $${signal.currentPrice.toFixed(8)}
${signal.marketCap ? `MCap: $${(signal.marketCap / 1_000_000).toFixed(1)}M` : ""}
${signal.imbalance !== undefined ? `Imbalance: ${(signal.imbalance * 100).toFixed(1)}%` : ""}`,
      });
    }

    // TODO: Execute trade if account is connected
    // This would integrate with the exchange client system

    // Update last trade time
    this.lastTradeTimes.set(tradeKey, new Date());
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ArgusBotConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current status
   */
  getStatus(): { isRunning: boolean; config: ArgusBotConfig } {
    return {
      isRunning: this.isRunning,
      config: this.config,
    };
  }
}

// ==================== ARGUS MANAGER ====================

class ArgusBotManager {
  private bots: Map<string, ArgusBotWorker> = new Map();
  private marketCapService: MarketCapService;

  constructor() {
    this.marketCapService = new MarketCapService();
  }

  /**
   * Create a new bot
   */
  async createBot(config: Omit<ArgusBotConfig, "id" | "createdAt" | "updatedAt">): Promise<ArgusBotWorker> {
    const userId = await getDefaultUserId();
    
    const fullConfig: ArgusBotConfig = {
      ...config,
      id: `argus-${Date.now()}`,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to database
    await db.argusBot.create({
      data: {
        id: fullConfig.id,
        userId: fullConfig.userId,
        name: fullConfig.name,
        status: fullConfig.status,
        exchange: fullConfig.exchange,
        accountId: fullConfig.accountId,
        enable5Long: fullConfig.enable5Long,
        enable5Short: fullConfig.enable5Short,
        enable12Long: fullConfig.enable12Long,
        enable12Short: fullConfig.enable12Short,
        pumpThreshold5m: fullConfig.pumpThreshold5m,
        pumpThreshold15m: fullConfig.pumpThreshold15m,
        dumpThreshold5m: fullConfig.dumpThreshold5m,
        dumpThreshold15m: fullConfig.dumpThreshold15m,
        maxMarketCap: fullConfig.maxMarketCap,
        minMarketCap: fullConfig.minMarketCap,
        useImbalanceFilter: fullConfig.useImbalanceFilter,
        imbalanceThreshold: fullConfig.imbalanceThreshold,
        leverage: fullConfig.leverage,
        positionSize: fullConfig.positionSize,
        stopLoss5: fullConfig.stopLoss5,
        stopLoss12: fullConfig.stopLoss12,
        takeProfit5: JSON.stringify(fullConfig.takeProfit5),
        takeProfit12: JSON.stringify(fullConfig.takeProfit12),
        useTrailing: fullConfig.useTrailing,
        trailingActivation5: fullConfig.trailingActivation5,
        trailingActivation12: fullConfig.trailingActivation12,
        trailingDistance5: fullConfig.trailingDistance5,
        trailingDistance12: fullConfig.trailingDistance12,
        cooldownMinutes: fullConfig.cooldownMinutes,
        notifyOnSignal: fullConfig.notifyOnSignal,
        notifyOnTrade: fullConfig.notifyOnTrade,
      },
    });

    const bot = new ArgusBotWorker(fullConfig);
    this.bots.set(fullConfig.id, bot);

    return bot;
  }

  /**
   * Get bot by ID
   */
  getBot(id: string): ArgusBotWorker | undefined {
    return this.bots.get(id);
  }

  /**
   * Start all bots
   */
  async startAll(): Promise<void> {
    const bots = await db.argusBot.findMany({
      where: { status: "ACTIVE" },
    });

    for (const botConfig of bots) {
      if (!this.bots.has(botConfig.id)) {
        const config: ArgusBotConfig = {
          id: botConfig.id,
          userId: botConfig.userId,
          name: botConfig.name,
          status: botConfig.status as ArgusStatus,
          exchange: botConfig.exchange,
          accountId: botConfig.accountId ?? undefined,
          enable5Long: botConfig.enable5Long,
          enable5Short: botConfig.enable5Short,
          enable12Long: botConfig.enable12Long,
          enable12Short: botConfig.enable12Short,
          pumpThreshold5m: botConfig.pumpThreshold5m,
          pumpThreshold15m: botConfig.pumpThreshold15m,
          dumpThreshold5m: botConfig.dumpThreshold5m,
          dumpThreshold15m: botConfig.dumpThreshold15m,
          maxMarketCap: botConfig.maxMarketCap,
          minMarketCap: botConfig.minMarketCap,
          useImbalanceFilter: botConfig.useImbalanceFilter,
          imbalanceThreshold: botConfig.imbalanceThreshold,
          leverage: botConfig.leverage,
          positionSize: botConfig.positionSize,
          stopLoss5: botConfig.stopLoss5,
          stopLoss12: botConfig.stopLoss12,
          takeProfit5: JSON.parse(botConfig.takeProfit5 as string),
          takeProfit12: JSON.parse(botConfig.takeProfit12 as string),
          useTrailing: botConfig.useTrailing,
          trailingActivation5: botConfig.trailingActivation5,
          trailingActivation12: botConfig.trailingActivation12,
          trailingDistance5: botConfig.trailingDistance5,
          trailingDistance12: botConfig.trailingDistance12,
          cooldownMinutes: botConfig.cooldownMinutes,
          notifyOnSignal: botConfig.notifyOnSignal,
          notifyOnTrade: botConfig.notifyOnTrade,
          createdAt: botConfig.createdAt,
          updatedAt: botConfig.updatedAt,
        };

        const bot = new ArgusBotWorker(config);
        this.bots.set(botConfig.id, bot);
      }

      await this.bots.get(botConfig.id)!.start();
    }
  }

  /**
   * Stop all bots
   */
  stopAll(): void {
    for (const bot of this.bots.values()) {
      bot.stop();
    }
  }

  /**
   * Set CMC API key
   */
  setCMCApiKey(apiKey: string): void {
    this.marketCapService.setApiKey(apiKey);
  }
}

// ==================== SINGLETON ====================

let managerInstance: ArgusBotManager | null = null;

export function getArgusBotManager(): ArgusBotManager {
  if (!managerInstance) {
    managerInstance = new ArgusBotManager();
  }
  return managerInstance;
}

// ==================== LEGACY COMPATIBILITY ====================

// Keep old names for backward compatibility
export type PumpDumpStatus = ArgusStatus;
export type PumpSignal = ArgusSignal;
export type PumpDumpBotConfig = ArgusBotConfig;
export const PumpDumpDetector = ArgusDetector;
export const PumpDumpStrategy = ArgusStrategy;
export const PumpDumpBotWorker = ArgusBotWorker;
export const getPumpDumpBotManager = getArgusBotManager;

// ==================== EXPORTS ====================

export {
  MarketCapService,
  OrderbookImbalanceService,
  ArgusDetector,
  ArgusStrategy,
};
