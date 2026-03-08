/**
 * Argus - Pump & Dump Detection and Trading System (Enhanced v2.0)
 * 
 * Named after the mythological hundred-eyed giant, Argus watches
 * the markets for pump and dump patterns across multiple exchanges.
 * 
 * Features:
 * - Real-time WebSocket streams (Binance, Bybit, BingX)
 * - Advanced Pump/Dump detection (volume surge + price spike)
 * - Whale tracking with orderbook analysis
 * - Real-time alerts via event bus
 * - Auto-reconnect with exponential backoff
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
import {
  ArgusEngine,
  getArgusEngine,
  type ArgusEngineConfig,
  type DetectionSignal,
  type WhaleAlert,
  type ExchangeId,
} from "./argus-bot";

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
  confidence?: number;
  strength?: string;
  reasons?: string[];
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
  
  // New features (v2.0)
  enableWhaleTracking?: boolean;
  enableVolumeSurgeDetection?: boolean;
  whaleThreshold?: number;
  volumeSurgeThreshold?: number;
  symbols?: string[];
  
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
    const fallbackSymbols = [
      "PEPE", "BONK", "FLOKI", "SHIB", "DOGE", "WIF", "MEME", "DOGS",
      "NOT", "TURBO", "BOME", "MYRO", "PONKE", "POPCAT", "MOG", "NEIRO",
      "GOAT", "BRETT", "SPX", "GIGA", "BABYDOGE", "SATS", "RATS", "ORDI"
    ];

    return fallbackSymbols.map(symbol => ({
      symbol,
      marketCap: 50_000_000,
      lastUpdated: new Date(),
    }));
  }

  getMarketCap(symbol: string): number | null {
    const info = this.cache.get(symbol.toUpperCase());
    return info?.marketCap ?? null;
  }

  isLowCap(symbol: string, maxCap: number = 100_000_000): boolean {
    const marketCap = this.getMarketCap(symbol);
    if (marketCap === null) return true;
    return marketCap > 0 && marketCap < maxCap;
  }
}

// ==================== ENHANCED ARGUS BOT WORKER ====================

export class ArgusBotWorker {
  private config: ArgusBotConfig;
  private marketCapService: MarketCapService;
  private engine: ArgusEngine | null = null;
  private lastTradeTimes: Map<string, Date> = new Map();
  private isRunning: boolean = false;
  private signalBuffer: DetectionSignal[] = [];
  private alertBuffer: WhaleAlert[] = [];

  constructor(config: ArgusBotConfig) {
    this.config = config;
    this.marketCapService = new MarketCapService();
  }

  /**
   * Start the bot with WebSocket streams
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[Argus ${this.config.name}] Already running`);
      return;
    }

    this.isRunning = true;
    console.log(`[Argus ${this.config.name}] Starting with WebSocket streams...`);

    // Load market cap data
    await this.marketCapService.loadLowCapSymbols(this.config.maxMarketCap);

    // Get or create engine
    const engineConfig: Partial<ArgusEngineConfig> = {
      exchanges: [this.config.exchange as ExchangeId],
      symbols: this.config.symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      detector: {
        pumpThreshold1m: this.config.pumpThreshold5m,
        pumpThreshold5m: this.config.pumpThreshold15m,
        dumpThreshold1m: this.config.dumpThreshold5m,
        dumpThreshold5m: this.config.dumpThreshold15m,
      },
      whaleTracker: {
        minValueUsdt: this.config.whaleThreshold || 50000,
      },
      enableWhaleTracking: this.config.enableWhaleTracking ?? true,
      enableAlerts: this.config.notifyOnSignal,
      onSignal: (signal) => this.handleSignal(signal),
      onWhaleAlert: (alert) => this.handleWhaleAlert(alert),
      onError: (error) => console.error(`[Argus ${this.config.name}] Error:`, error),
    };

    this.engine = getArgusEngine(engineConfig);

    try {
      await this.engine.start();
      console.log(`[Argus ${this.config.name}] Started with real-time streams`);
    } catch (error) {
      console.error(`[Argus ${this.config.name}] Failed to start:`, error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the bot
   */
  stop(): void {
    if (this.engine) {
      this.engine.stop();
    }
    this.isRunning = false;
    console.log(`[Argus ${this.config.name}] Stopped`);
  }

  /**
   * Handle detection signal from engine
   */
  private async handleSignal(signal: DetectionSignal): Promise<void> {
    // Buffer signal
    this.signalBuffer.push(signal);
    if (this.signalBuffer.length > 100) {
      this.signalBuffer.shift();
    }

    // Check cooldown
    const tradeKey = `${signal.symbol}-${signal.type}`;
    const lastTrade = this.lastTradeTimes.get(tradeKey);
    if (lastTrade && this.config.cooldownMinutes > 0) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      if (Date.now() - lastTrade.getTime() < cooldownMs) {
        return;
      }
    }

    // Convert to legacy signal format
    const legacySignal: ArgusSignal = {
      id: signal.id,
      symbol: signal.symbol,
      exchange: signal.exchange,
      type: this.convertSignalType(signal.type, signal.confidence),
      priceChange: signal.priceChange,
      currentPrice: signal.price,
      previousPrice: signal.price / (1 + signal.priceChange),
      volume24h: signal.metadata.volumeSurgeEvent?.currentVolume || 0,
      marketCap: this.marketCapService.getMarketCap(signal.symbol) ?? undefined,
      imbalance: signal.orderbookImbalance,
      timestamp: signal.timestamp,
      processed: false,
      confidence: signal.confidence,
      strength: signal.strength,
      reasons: signal.reasons,
    };

    // Notify
    if (this.config.notifyOnSignal) {
      await this.sendSignalNotification(legacySignal);
    }

    // Update last trade time
    this.lastTradeTimes.set(tradeKey, new Date());
  }

  /**
   * Handle whale alert
   */
  private async handleWhaleAlert(alert: WhaleAlert): Promise<void> {
    this.alertBuffer.push(alert);
    if (this.alertBuffer.length > 50) {
      this.alertBuffer.shift();
    }

    if (this.config.notifyOnSignal) {
      await notifyTelegram({
        type: "SIGNAL_RECEIVED",
        title: `🐋 Whale Alert: ${alert.type}`,
        message: `${alert.symbol} on ${alert.exchange}
${alert.details}
Severity: ${alert.severity}
Value: $${(alert.value / 1000).toFixed(0)}K`,
      });
    }
  }

  /**
   * Send signal notification
   */
  private async sendSignalNotification(signal: ArgusSignal): Promise<void> {
    const emoji = signal.type.includes('PUMP') ? '📈' : '📉';
    const direction = signal.type.includes('PUMP') ? 'UP' : 'DOWN';
    
    await notifyTelegram({
      type: "SIGNAL_RECEIVED",
      title: `${emoji} Argus: ${signal.type} Detected!`,
      message: `${signal.symbol} on ${signal.exchange}
Change: ${(signal.priceChange * 100).toFixed(2)}% ${direction}
Price: $${signal.currentPrice.toFixed(8)}
${signal.confidence ? `Confidence: ${signal.confidence.toFixed(0)}%` : ''}
${signal.strength ? `Strength: ${signal.strength}` : ''}
${signal.marketCap ? `MCap: $${(signal.marketCap / 1_000_000).toFixed(1)}M` : ''}
${signal.imbalance !== undefined ? `Imbalance: ${(signal.imbalance * 100).toFixed(1)}%` : ''}
${signal.reasons?.length ? `Reasons: ${signal.reasons.join(', ')}` : ''}`,
    });

    await notifyUI({
      type: "SIGNAL_RECEIVED",
      title: `${emoji} ${signal.type}`,
      message: `${signal.symbol}: ${(signal.priceChange * 100).toFixed(2)}%`,
    });
  }

  /**
   * Convert new signal type to legacy format
   */
  private convertSignalType(type: string, confidence: number): SignalType {
    const is5m = confidence >= 60; // Higher confidence = quicker signal
    if (type === 'PUMP') {
      return is5m ? 'PUMP_5' : 'PUMP_12';
    } else {
      return is5m ? 'DUMP_5' : 'DUMP_12';
    }
  }

  /**
   * Add symbol to monitoring
   */
  addSymbol(symbol: string): void {
    if (this.engine) {
      this.engine.addSymbol(symbol);
    }
    if (!this.config.symbols) {
      this.config.symbols = [];
    }
    if (!this.config.symbols.includes(symbol)) {
      this.config.symbols.push(symbol);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ArgusBotConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.engine) {
      this.engine.updateConfig({
        detector: {
          pumpThreshold1m: config.pumpThreshold5m,
          pumpThreshold5m: config.pumpThreshold15m,
          dumpThreshold1m: config.dumpThreshold5m,
          dumpThreshold5m: config.dumpThreshold15m,
        },
        whaleTracker: {
          minValueUsdt: config.whaleThreshold,
        },
      });
    }
  }

  /**
   * Get current status
   */
  getStatus(): { isRunning: boolean; config: ArgusBotConfig; stats?: unknown } {
    const engineState = this.engine?.getState();
    return {
      isRunning: this.isRunning,
      config: this.config,
      stats: engineState?.stats,
    };
  }

  /**
   * Get recent signals
   */
  getRecentSignals(): DetectionSignal[] {
    return this.signalBuffer.slice(-20);
  }

  /**
   * Get recent whale alerts
   */
  getRecentAlerts(): WhaleAlert[] {
    return this.alertBuffer.slice(-20);
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

export type PumpDumpStatus = ArgusStatus;
export type PumpSignal = ArgusSignal;
export type PumpDumpBotConfig = ArgusBotConfig;
export const PumpDumpBotWorker = ArgusBotWorker;
export const getPumpDumpBotManager = getArgusBotManager;

// ==================== EXPORTS ====================

export {
  MarketCapService,
  getArgusEngine,
};

// ==================== ADDITIONAL LEGACY SUPPORT ====================

// ArgusDetector and ArgusStrategy kept for backward compatibility
// but functionality is now in PumpDumpDetector

class ArgusDetector {
  private priceHistory: Map<string, { price: number; timestamp: Date }[]> = new Map();
  private marketCapService: MarketCapService;

  constructor(marketCapService: MarketCapService) {
    this.marketCapService = marketCapService;
  }

  updatePrice(symbol: string, exchange: string, price: number): void {
    const key = `${exchange}:${symbol}`;
    if (!this.priceHistory.has(key)) {
      this.priceHistory.set(key, []);
    }
    const history = this.priceHistory.get(key)!;
    history.push({ price, timestamp: new Date() });
    if (history.length > 100) history.shift();
  }

  calculateChanges(symbol: string, exchange: string): PriceChange | null {
    // Legacy method - now handled by PumpDumpDetector
    return null;
  }
}

class ArgusStrategy {
  static getStrategy(signalType: SignalType): StrategyType {
    switch (signalType) {
      case "PUMP_5": return "5LONG";
      case "DUMP_5": return "5SHORT";
      case "PUMP_12": return "12SHORT";
      case "DUMP_12": return "12LONG";
    }
  }

  static getStopLoss(strategy: StrategyType, config: ArgusBotConfig): number {
    return strategy.includes("5") ? config.stopLoss5 : config.stopLoss12;
  }

  static getTakeProfits(strategy: StrategyType, config: ArgusBotConfig): number[] {
    return strategy.includes("5") ? config.takeProfit5 : config.takeProfit12;
  }

  static isLong(strategy: StrategyType): boolean {
    return strategy.includes("LONG");
  }
}

export { ArgusDetector, ArgusStrategy };
