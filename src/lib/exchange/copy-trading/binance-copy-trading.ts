/**
 * Binance Copy Trading API Implementation
 * 
 * Documentation: https://developers.binance.com/docs/copy_trading/future-copy-trading
 * NPM Package: @binance/copy-trading
 * 
 * Available Endpoints:
 * - GET /sapi/v1/copyTrading/futures/userStatus - Get Lead Trader Status
 * - GET /sapi/v1/copyTrading/futures/leadSymbol - Get Lead Trading Symbol Whitelist
 * 
 * Note: Binance Copy Trading API is limited compared to other exchanges.
 * For full trader statistics, the public Copy Trading platform API may be needed.
 * 
 * Slippage Protection:
 * - Integrated SlippageProtector to prevent followers from entering at worse prices
 * - Dynamic thresholds based on market volatility (ATR)
 * - Automatic rejection when slippage exceeds configured threshold
 */

import {
  ExchangeId,
  LeadTraderStatus,
  CopyTraderStats,
  CopyTraderPosition,
  CopyTraderTrade,
  CopySubscribeParams,
  CopyTradingResult,
  CopyFollowerSettings,
  CopyFollowerInfo,
  CopyTraderProfitSummary,
  CopyTradingSymbol,
  CopyClosePositionParams,
  CopyModifyTpslParams,
} from "../types";
import {
  SlippageProtector,
  SlippageConfig,
  SlippageResult,
  CopyTradeContext,
  type OHLCVCandle,
} from "../../copy-trading/slippage-protector";

/**
 * Binance Copy Trading Client Mixin
 * Provides copy trading functionality for BinanceClient
 * 
 * Features:
 * - Lead Trader status management
 * - Copy Trading symbol whitelist
 * - Slippage Protection for follower executions
 */
export class BinanceCopyTrading {
  private exchangeId: ExchangeId = "binance";
  private signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>;
  private slippageProtector: SlippageProtector;
  private publicRequest?: (endpoint: string, params?: Record<string, unknown>) => Promise<unknown>;

  constructor(
    signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>,
    publicRequest?: (endpoint: string, params?: Record<string, unknown>) => Promise<unknown>,
    slippageConfig?: Partial<SlippageConfig>
  ) {
    this.signedRequest = signedRequest;
    this.publicRequest = publicRequest;
    this.slippageProtector = new SlippageProtector(slippageConfig);
    
    // Set up price fetcher for slippage protection
    if (publicRequest) {
      this.slippageProtector.setPriceFetcher(async (symbol: string) => {
        try {
          const data = await publicRequest("/fapi/v1/ticker/price", { symbol }) as {
            price: string;
          };
          return parseFloat(data.price);
        } catch {
          return null;
        }
      });
      
      // Set up OHLCV fetcher for volatility calculations
      this.slippageProtector.setOhlcvFetcher(async (symbol: string, _exchange: ExchangeId, limit: number) => {
        try {
          const data = await publicRequest("/fapi/v1/klines", {
            symbol,
            interval: "1h",
            limit,
          }) as Array<[
            number, // Open time
            string, // Open
            string, // High
            string, // Low
            string, // Close
            string, // Volume
          ]>;
          
          return data.map((candle) => ({
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            timestamp: new Date(candle[0]),
          }));
        } catch {
          return [];
        }
      });
    }
  }

  // ==================== LEAD TRADER STATUS ====================

  /**
   * Get Futures Lead Trader Status
   * Returns whether the authenticated user is a Lead Trader
   */
  async getLeadTraderStatus(): Promise<LeadTraderStatus> {
    try {
      const data = await this.signedRequest("GET", "/sapi/v1/copyTrading/futures/userStatus") as {
        isLeadTrader: boolean;
        time?: number;
      };

      return {
        isLeadTrader: data.isLeadTrader,
        since: data.time ? new Date(data.time) : undefined,
      };
    } catch (error) {
      return {
        isLeadTrader: false,
      };
    }
  }

  // ==================== COPY TRADING SYMBOLS ====================

  /**
   * Get Futures Lead Trading Symbol Whitelist
   * Returns list of symbols available for Lead Trading
   */
  async getCopyTradingSymbols(): Promise<CopyTradingSymbol[]> {
    try {
      const data = await this.signedRequest("GET", "/sapi/v1/copyTrading/futures/leadSymbol") as {
        symbols?: Array<{
          symbol: string;
          maxLeverage?: number;
          minQuantity?: string;
          maxQuantity?: string;
          quantityPrecision?: number;
          pricePrecision?: number;
        }>;
      };

      if (!data.symbols) {
        return [];
      }

      return data.symbols.map((s) => ({
        symbol: s.symbol,
        exchange: this.exchangeId,
        enabled: true,
        maxLeverage: s.maxLeverage,
        minQuantity: s.minQuantity ? parseFloat(s.minQuantity) : undefined,
        maxQuantity: s.maxQuantity ? parseFloat(s.maxQuantity) : undefined,
        quantityPrecision: s.quantityPrecision,
        pricePrecision: s.pricePrecision,
      }));
    } catch (error) {
      console.error("[Binance] Failed to get copy trading symbols:", error);
      return [];
    }
  }

  // ==================== TRADER LIST & STATS ====================

  /**
   * Get list of top traders for copy trading
   * Note: Binance doesn't have a public API for this.
   */
  async getCopyTraderList(limit?: number, sortBy?: string): Promise<CopyTraderStats[]> {
    console.warn("[Binance] getCopyTraderList: Binance doesn't expose public trader ranking API");
    return [];
  }

  /**
   * Get statistics for a specific trader
   * Note: Binance doesn't have a public API for this.
   */
  async getCopyTraderStats(traderId: string): Promise<CopyTraderStats> {
    throw new Error("Binance doesn't expose public trader statistics API. Use the Copy Trading platform UI.");
  }

  // ==================== TRADER POSITIONS ====================

  /**
   * Get current positions of a master trader
   * Note: Not available via API
   */
  async getCopyTraderPositions(traderId: string): Promise<CopyTraderPosition[]> {
    console.warn("[Binance] getCopyTraderPositions: Not available via API");
    return [];
  }

  /**
   * Get trade history of a master trader
   * Note: Not available via API
   */
  async getCopyTraderTradeHistory(traderId: string, limit?: number, startTime?: Date): Promise<CopyTraderTrade[]> {
    console.warn("[Binance] getCopyTraderTradeHistory: Not available via API");
    return [];
  }

  // ==================== FOLLOWER OPERATIONS ====================

  /**
   * Subscribe to copy a trader
   * Note: Binance Copy Trading is primarily UI-based
   */
  async copyTraderSubscribe(params: CopySubscribeParams): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Binance Copy Trading subscription is only available through the platform UI",
      errorCode: "NOT_SUPPORTED",
    };
  }

  /**
   * Unsubscribe from a trader
   */
  async copyTraderUnsubscribe(traderId: string): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Binance Copy Trading unsubscription is only available through the platform UI",
      errorCode: "NOT_SUPPORTED",
    };
  }

  /**
   * Get follower's copy trading settings
   */
  async getCopyFollowerSettings(traderId?: string): Promise<CopyFollowerSettings[]> {
    return [];
  }

  /**
   * Update follower's copy trading settings
   */
  async updateCopyFollowerSettings(params: CopyFollowerSettings): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Binance Copy Trading settings are managed through the platform UI",
      errorCode: "NOT_SUPPORTED",
    };
  }

  // ==================== MASTER TRADER OPERATIONS ====================

  /**
   * Get list of followers (for master trader)
   */
  async getCopyFollowers(limit?: number): Promise<CopyFollowerInfo[]> {
    return [];
  }

  /**
   * Remove a follower
   */
  async removeCopyFollower(followerId: string): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Follower management is only available through the platform UI",
      errorCode: "NOT_SUPPORTED",
    };
  }

  /**
   * Get profit summary for master trader
   */
  async getCopyTraderProfitSummary(startDate?: Date, endDate?: Date): Promise<CopyTraderProfitSummary[]> {
    return [];
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Close position (for master trader)
   */
  async copyClosePosition(params: CopyClosePositionParams): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Use standard futures trading endpoints for position management",
      errorCode: "USE_STANDARD_API",
    };
  }

  /**
   * Modify TP/SL for position
   */
  async copyModifyTpsl(params: CopyModifyTpslParams): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Use standard futures trading endpoints for TP/SL management",
      errorCode: "USE_STANDARD_API",
    };
  }

  // ==================== SLIPPAGE PROTECTION ====================

  /**
   * Check slippage before executing a copy trade
   * 
   * @param masterEntry - Master trader's entry price
   * @param direction - Trade direction (LONG or SHORT)
   * @param context - Copy trade context
   * @returns SlippageResult indicating if trade is acceptable
   */
  async checkCopySlippage(
    masterEntry: number,
    direction: 'LONG' | 'SHORT',
    context: CopyTradeContext
  ): Promise<SlippageResult> {
    // Fetch current price
    const currentPrice = await this.slippageProtector.getCurrentPrice(context.symbol, this.exchangeId);
    
    if (currentPrice === null) {
      return {
        masterPrice: masterEntry,
        currentPrice: 0,
        slippagePercent: 0,
        slippageDirection: 'none',
        acceptable: false,
        reason: 'Unable to fetch current price for slippage check',
        appliedThreshold: this.slippageProtector.getConfig().maxSlippagePercent,
        latencyMs: Date.now() - context.masterTradeTime.getTime(),
        warningLevel: 'critical',
      };
    }
    
    // Fetch volatility data for dynamic threshold
    await this.slippageProtector.fetchVolatilityData(context.symbol, this.exchangeId);
    
    // Check slippage
    return this.slippageProtector.checkSlippage(masterEntry, currentPrice, direction, context);
  }

  /**
   * Execute copy trade with slippage protection
   * 
   * @param masterEntry - Master trader's entry price
   * @param direction - Trade direction
   * @param context - Copy trade context
   * @param executeFn - Function to execute the trade
   * @returns CopyTradingResult with slippage information
   */
  async executeWithSlippageProtection(
    masterEntry: number,
    direction: 'LONG' | 'SHORT',
    context: CopyTradeContext,
    executeFn: () => Promise<CopyTradingResult>
  ): Promise<CopyTradingResult & { slippage?: SlippageResult }> {
    const slippageResult = await this.checkCopySlippage(masterEntry, direction, context);
    
    if (!slippageResult.acceptable) {
      console.warn('[Binance] Copy trade rejected due to slippage:', {
        symbol: context.symbol,
        masterPrice: slippageResult.masterPrice,
        currentPrice: slippageResult.currentPrice,
        slippage: `${slippageResult.slippagePercent.toFixed(4)}%`,
        threshold: `${slippageResult.appliedThreshold.toFixed(4)}%`,
        reason: slippageResult.reason,
      });
      
      return {
        success: false,
        error: slippageResult.reason,
        errorCode: 'SLIPPAGE_EXCEEDED',
        slippage: slippageResult,
      };
    }
    
    // Execute the trade
    const result = await executeFn();
    
    return {
      ...result,
      slippage: slippageResult,
    };
  }

  /**
   * Get the slippage protector instance
   */
  getSlippageProtector(): SlippageProtector {
    return this.slippageProtector;
  }

  /**
   * Update slippage protection configuration
   */
  updateSlippageConfig(config: Partial<SlippageConfig>): void {
    this.slippageProtector.updateConfig(config);
  }

  /**
   * Get slippage statistics
   */
  getSlippageStats() {
    return this.slippageProtector.getSlippageStats();
  }

  /**
   * Get recent slippage log entries
   */
  getSlippageLog(limit: number = 100) {
    return this.slippageProtector.getSlippageLog(limit);
  }
}
