/**
 * Bybit Copy Trading API Implementation
 * 
 * Documentation: https://bybit-exchange.github.io/docs/v5/copytrade
 * 
 * Bybit Copy Trading работает через стандартный V5 API.
 * Мастер-трейдеры используют обычные торговые endpoints,
 * и сделки автоматически копируются подписчиками.
 * 
 * Features:
 * - Copy Trading Classic
 * - Copy Trading through V5 API
 * - Master/Follower relationship management
 * - Slippage Protection for follower executions
 * - FIFO Queue for order management
 * - Fill Ratio Tracking for partial fills
 * 
 * API Availability Notes:
 * - Bybit doesn't expose public APIs for trader rankings or statistics
 * - Follower subscription/settings must be managed through Bybit Copy Trading UI
 * - Master traders use standard V5 trading endpoints
 * - Copy trading execution happens automatically by Bybit platform
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
  PositionSide,
  OrderSide,
  MarginMode,
} from "../types";
import {
  SlippageProtector,
  SlippageConfig,
  SlippageResult,
  CopyTradeContext,
} from "../../copy-trading/slippage-protector";
import {
  CopyTradingFIFOQueue,
  QueueMessage,
  OpenPositionPayload,
  ClosePositionPayload,
  getDefaultFIFOQueue,
} from "../../copy-trading/fifo-queue";
import {
  FillRatioTracker,
  FillRatioResult,
  OrderFillRecord,
  FillRatioConfig,
  getDefaultFillRatioTracker,
} from "../../copy-trading/fill-ratio-tracker";

/**
 * Bybit Copy Trading Client
 * 
 * Features:
 * - Master Trader status management
 * - Copy Trading symbol info
 * - Slippage Protection for follower executions
 */
export class BybitCopyTrading {
  private exchangeId: ExchangeId = "bybit";
  private baseUrl: string;
  private signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>, isV5?: boolean) => Promise<unknown>;
  private slippageProtector: SlippageProtector;
  private publicRequest?: (endpoint: string, params?: Record<string, unknown>) => Promise<unknown>;

  constructor(
    baseUrl: string,
    signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>, isV5?: boolean) => Promise<unknown>,
    publicRequest?: (endpoint: string, params?: Record<string, unknown>) => Promise<unknown>,
    slippageConfig?: Partial<SlippageConfig>
  ) {
    this.baseUrl = baseUrl;
    this.signedRequest = signedRequest;
    this.publicRequest = publicRequest;
    this.slippageProtector = new SlippageProtector(slippageConfig);
    
    // Set up price fetcher for slippage protection
    if (publicRequest) {
      this.slippageProtector.setPriceFetcher(async (symbol: string) => {
        try {
          const data = await publicRequest("/v5/market/tickers", {
            category: "linear",
            symbol,
          }) as {
            result?: {
              list?: Array<{
                lastPrice: string;
              }>;
            };
          };
          
          if (data.result?.list?.[0]) {
            return parseFloat(data.result.list[0].lastPrice);
          }
          return null;
        } catch {
          return null;
        }
      });
      
      // Set up OHLCV fetcher for volatility calculations
      this.slippageProtector.setOhlcvFetcher(async (symbol: string, _exchange: ExchangeId, limit: number) => {
        try {
          const data = await publicRequest("/v5/market/kline", {
            category: "linear",
            symbol,
            interval: "60", // 1 hour
            limit: limit.toString(),
          }) as {
            result?: {
              list?: Array<[
                string, // Start time
                string, // Open
                string, // High
                string, // Low
                string, // Close
                string, // Volume
                string, // Turnover
              ]>;
            };
          };
          
          if (!data.result?.list) {
            return [];
          }
          
          // Bybit returns newest first, we need oldest first
          return data.result.list.reverse().map((candle) => ({
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            timestamp: new Date(parseInt(candle[0])),
          }));
        } catch {
          return [];
        }
      });
    }
  }

  // ==================== LEAD TRADER STATUS ====================

  /**
   * Get Master Trader Status
   * Bybit doesn't have a specific endpoint for this in V5 API
   * but Master Traders can use standard trading endpoints
   */
  async getLeadTraderStatus(): Promise<LeadTraderStatus> {
    // Bybit V5 doesn't have a specific endpoint to check Master Trader status
    // This would need to be checked through the Copy Trading platform UI
    // or by attempting to access Copy Trading specific endpoints
    
    try {
      // Try to get copy trading positions as a test
      const data = await this.signedRequest("GET", "/v5/copy-trading/position", {}, true);
      
      return {
        isLeadTrader: true,
        active: true,
      };
    } catch {
      return {
        isLeadTrader: false,
      };
    }
  }

  // ==================== COPY TRADING SYMBOLS ====================

  /**
   * Get symbols available for copy trading
   * Uses standard instrument info endpoint
   */
  async getCopyTradingSymbols(): Promise<CopyTradingSymbol[]> {
    try {
      const data = await this.signedRequest("GET", "/v5/market/instruments-info", {
        category: "linear",
      }, false) as {
        result?: {
          list?: Array<{
            symbol: string;
            leverageFilter?: {
              maxLeverage: string;
              minLeverage: string;
            };
            lotSizeFilter?: {
              minOrderQty: string;
              maxOrderQty: string;
              qtyStep: string;
            };
            priceFilter?: {
              tickSize: string;
            };
          }>;
        };
      };

      if (!data.result?.list) {
        return [];
      }

      return data.result.list.map((s) => ({
        symbol: s.symbol,
        exchange: this.exchangeId,
        enabled: true,
        maxLeverage: s.leverageFilter ? parseFloat(s.leverageFilter.maxLeverage) : 100,
        minQuantity: s.lotSizeFilter ? parseFloat(s.lotSizeFilter.minOrderQty) : undefined,
        maxQuantity: s.lotSizeFilter ? parseFloat(s.lotSizeFilter.maxOrderQty) : undefined,
        quantityPrecision: s.lotSizeFilter?.qtyStep ? 
          Math.ceil(-Math.log10(parseFloat(s.lotSizeFilter.qtyStep))) : 0,
        pricePrecision: s.priceFilter?.tickSize ? 
          Math.ceil(-Math.log10(parseFloat(s.priceFilter.tickSize))) : 0,
      }));
    } catch (error) {
      console.error("[Bybit] Failed to get copy trading symbols:", error);
      return [];
    }
  }

  // ==================== TRADER LIST & STATS ====================

  /**
   * Get list of top traders for copy trading
   * Note: Bybit doesn't expose a public ranking API
   */
  async getCopyTraderList(limit?: number, sortBy?: string): Promise<CopyTraderStats[]> {
    console.warn("[Bybit] getCopyTraderList: Not available via public API");
    return [];
  }

  /**
   * Get statistics for a specific trader
   * Note: Not available via public API
   */
  async getCopyTraderStats(traderId: string): Promise<CopyTraderStats> {
    throw new Error("Bybit doesn't expose public trader statistics API");
  }

  // ==================== TRADER POSITIONS ====================

  /**
   * Get current positions of a master trader
   * Note: This is for the authenticated user's positions
   */
  async getCopyTraderPositions(traderId: string): Promise<CopyTraderPosition[]> {
    console.warn("[Bybit] getCopyTraderPositions: Only available for authenticated user");
    return [];
  }

  /**
   * Get trade history of a master trader
   */
  async getCopyTraderTradeHistory(traderId: string, limit?: number, startTime?: Date): Promise<CopyTraderTrade[]> {
    console.warn("[Bybit] getCopyTraderTradeHistory: Not available via API");
    return [];
  }

  // ==================== FOLLOWER OPERATIONS ====================

  /**
   * Subscribe to copy a trader (Follower)
   * Note: Managed through UI
   */
  async copyTraderSubscribe(params: CopySubscribeParams): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Bybit Copy Trading subscription is managed through the platform UI",
      errorCode: "NOT_SUPPORTED",
    };
  }

  /**
   * Unsubscribe from a trader
   */
  async copyTraderUnsubscribe(traderId: string): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Bybit Copy Trading unsubscription is managed through the platform UI",
      errorCode: "NOT_SUPPORTED",
    };
  }

  /**
   * Get follower's copy trading settings
   */
  async getCopyFollowerSettings(traderId?: string): Promise<CopyFollowerSettings[]> {
    // Bybit followers manage settings through UI
    return [];
  }

  /**
   * Update follower's copy trading settings
   */
  async updateCopyFollowerSettings(params: CopyFollowerSettings): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Bybit Copy Trading settings are managed through the platform UI",
      errorCode: "NOT_SUPPORTED",
    };
  }

  // ==================== MASTER TRADER OPERATIONS ====================

  /**
   * Get list of followers (for master trader)
   * Note: Not available via API
   */
  async getCopyFollowers(limit?: number): Promise<CopyFollowerInfo[]> {
    console.warn("[Bybit] getCopyFollowers: Not available via API");
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
   * Uses standard V5 position API
   */
  async copyClosePosition(params: CopyClosePositionParams): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Use standard V5 trading endpoints (/v5/position/close-pnl)",
      errorCode: "USE_STANDARD_API",
    };
  }

  /**
   * Modify TP/SL for position
   */
  async copyModifyTpsl(params: CopyModifyTpslParams): Promise<CopyTradingResult> {
    return {
      success: false,
      error: "Use standard V5 trading endpoints (/v5/position/trading-stop)",
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
      console.warn('[Bybit] Copy trade rejected due to slippage:', {
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
