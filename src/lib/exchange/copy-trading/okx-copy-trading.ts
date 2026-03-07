/**
 * OKX Copy Trading API Implementation
 * 
 * Documentation: https://www.okx.com/docs-v5/en/#copy-trading
 * 
 * OKX предоставляет расширенные возможности для копитрейдинга:
 * - Public API for trader rankings and statistics
 * - Private API for managing copy trading
 * - Support for proportional copy trading
 * 
 * API Zone: https://www.okx.com/campaigns/copytrading-apizone
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

/**
 * OKX Copy Trading Client
 */
export class OKXCopyTrading {
  private exchangeId: ExchangeId = "okx";
  private signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>;

  constructor(
    signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>
  ) {
    this.signedRequest = signedRequest;
  }

  // ==================== LEAD TRADER STATUS ====================

  /**
   * Get Lead Trader Status
   * OKX doesn't have a specific endpoint, but we can check
   * by trying to access lead trader specific endpoints
   */
  async getLeadTraderStatus(): Promise<LeadTraderStatus> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/copytrading/current-subpositions", {}) as {
        data?: unknown[];
      };

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
   * Uses instruments endpoint
   */
  async getCopyTradingSymbols(): Promise<CopyTradingSymbol[]> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/public/instruments", {
        instType: "SWAP",
      }) as {
        data?: Array<{
          instId: string;
          lever?: string;
          minSz?: string;
          maxSz?: string;
          lotSz?: string;
          tickSz?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((s) => ({
        symbol: s.instId,
        exchange: this.exchangeId,
        enabled: true,
        maxLeverage: s.lever ? parseFloat(s.lever) : 125,
        minQuantity: s.minSz ? parseFloat(s.minSz) : undefined,
        maxQuantity: s.maxSz ? parseFloat(s.maxSz) : undefined,
        quantityPrecision: s.lotSz ? 
          Math.ceil(-Math.log10(parseFloat(s.lotSz))) : 0,
        pricePrecision: s.tickSz ? 
          Math.ceil(-Math.log10(parseFloat(s.tickSz))) : 0,
      }));
    } catch (error) {
      console.error("[OKX] Failed to get copy trading symbols:", error);
      return [];
    }
  }

  // ==================== TRADER LIST & STATS ====================

  /**
   * Get list of top traders for copy trading
   * Note: OKX may have public endpoints for this
   */
  async getCopyTraderList(limit?: number, sortBy?: string): Promise<CopyTraderStats[]> {
    // OKX may expose public trader ranking data
    // This would need investigation of their public APIs
    console.warn("[OKX] getCopyTraderList: Limited public API access");
    return [];
  }

  /**
   * Get statistics for a specific trader
   * Note: May be available through public endpoints
   */
  async getCopyTraderStats(traderId: string): Promise<CopyTraderStats> {
    try {
      // Try to get public trader data
      const data = await this.signedRequest("GET", "/api/v5/copytrading/public-config", {
        uniqueCode: traderId,
      }) as {
        data?: {
          uniqueCode?: string;
          nickName?: string;
          avatarUrl?: string;
          totalPnl?: string;
          roi?: string;
          winRate?: string;
          followerNum?: string;
          tradingDays?: string;
        };
      };

      if (!data.data) {
        throw new Error("Trader not found");
      }

      const t = data.data;
      return {
        traderId: t.uniqueCode || traderId,
        nickname: t.nickName,
        avatar: t.avatarUrl,
        exchange: this.exchangeId,
        roi: parseFloat(t.roi || "0"),
        winRate: parseFloat(t.winRate || "0"),
        totalTrades: 0,
        followersCount: parseInt(t.followerNum || "0"),
        totalPnl: parseFloat(t.totalPnl || "0"),
        tradingDays: parseInt(t.tradingDays || "0"),
        positionSide: "both",
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to get trader stats: ${error}`);
    }
  }

  // ==================== TRADER POSITIONS ====================

  /**
   * Get current positions of a master trader (public)
   */
  async getCopyTraderPositions(traderId: string): Promise<CopyTraderPosition[]> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/copytrading/public-current-subpositions", {
        uniqueCode: traderId,
      }) as {
        data?: Array<{
          subPosId?: string;
          instId?: string;
          posSide?: string;
          posSz?: string;
          avgPx?: string;
          markPx?: string;
          upl?: string;
          lever?: string;
          mgnMode?: string;
          cTime?: string;
          uTime?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((p) => ({
        positionId: p.subPosId || "",
        exchange: this.exchangeId,
        traderId,
        symbol: p.instId || "",
        side: (p.posSide?.toLowerCase() || "long") as PositionSide,
        quantity: parseFloat(p.posSz || "0"),
        entryPrice: parseFloat(p.avgPx || "0"),
        markPrice: parseFloat(p.markPx || "0"),
        unrealizedPnl: parseFloat(p.upl || "0"),
        leverage: parseFloat(p.lever || "1"),
        marginMode: (p.mgnMode?.toLowerCase() || "cross") as MarginMode,
        margin: 0,
        openedAt: new Date(parseInt(p.cTime || "0")),
        updatedAt: new Date(parseInt(p.uTime || "0")),
      }));
    } catch (error) {
      console.error("[OKX] Failed to get trader positions:", error);
      return [];
    }
  }

  /**
   * Get trade history of a master trader
   */
  async getCopyTraderTradeHistory(traderId: string, limit?: number, startTime?: Date): Promise<CopyTraderTrade[]> {
    try {
      const params: Record<string, unknown> = {
        uniqueCode: traderId,
      };
      if (limit) params.limit = limit;
      if (startTime) params.after = startTime.getTime();

      const data = await this.signedRequest("GET", "/api/v5/copytrading/public-subpositions-history", params) as {
        data?: Array<{
          subPosId?: string;
          instId?: string;
          posSide?: string;
          posSz?: string;
          avgOpenPx?: string;
          avgClosePx?: string;
          pnl?: string;
          fee?: string;
          lever?: string;
          cTime?: string;
          closeTime?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((t) => ({
        tradeId: t.subPosId || "",
        exchange: this.exchangeId,
        traderId,
        symbol: t.instId || "",
        side: (t.posSide?.toLowerCase() || "long") as PositionSide,
        orderType: "market",
        quantity: parseFloat(t.posSz || "0"),
        entryPrice: parseFloat(t.avgOpenPx || "0"),
        exitPrice: parseFloat(t.avgClosePx || "0"),
        realizedPnl: parseFloat(t.pnl || "0"),
        fee: parseFloat(t.fee || "0"),
        feeCurrency: "USDT",
        openedAt: new Date(parseInt(t.cTime || "0")),
        closedAt: new Date(parseInt(t.closeTime || "0")),
        leverage: parseFloat(t.lever || "1"),
      }));
    } catch (error) {
      console.error("[OKX] Failed to get trade history:", error);
      return [];
    }
  }

  // ==================== FOLLOWER OPERATIONS ====================

  /**
   * Subscribe to copy a trader (Follower)
   */
  async copyTraderSubscribe(params: CopySubscribeParams): Promise<CopyTradingResult> {
    try {
      const subscribeParams: Record<string, unknown> = {
        uniqueCode: params.traderId,
        copyMode: params.copyMode === "fixed" ? "fixed" : 
                  params.copyMode === "percentage" ? "percent" : 
                  "ratio",
      };

      if (params.copyMode === "fixed" && params.amount) {
        subscribeParams.copyAmount = params.amount;
      } else if (params.copyMode === "ratio" && params.amount) {
        subscribeParams.copyRatio = params.amount;
      } else if (params.copyMode === "percentage" && params.amount) {
        subscribeParams.copyPercent = params.amount;
      }

      const data = await this.signedRequest("POST", "/api/v5/copytrading/algo-order", subscribeParams);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Subscription failed",
      };
    }
  }

  /**
   * Unsubscribe from a trader
   */
  async copyTraderUnsubscribe(traderId: string): Promise<CopyTradingResult> {
    try {
      const data = await this.signedRequest("POST", "/api/v5/copytrading/stop-copy-trading", {
        uniqueCode: traderId,
      });

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unsubscription failed",
      };
    }
  }

  /**
   * Get follower's copy trading settings
   */
  async getCopyFollowerSettings(traderId?: string): Promise<CopyFollowerSettings[]> {
    try {
      const params: Record<string, unknown> = {};
      if (traderId) params.uniqueCode = traderId;

      const data = await this.signedRequest("GET", "/api/v5/copytrading/config", params) as {
        data?: Array<{
          uniqueCode?: string;
          copyMode?: string;
          copyAmount?: string;
          copyRatio?: string;
          copyPercent?: string;
          maxPosAmt?: string;
          state?: string;
          cTime?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((s) => ({
        traderId: s.uniqueCode || "",
        exchange: this.exchangeId,
        copyMode: (s.copyMode === "fixed" ? "fixed" : 
                  s.copyMode === "percent" ? "percentage" : 
                  "ratio") as "fixed" | "ratio" | "percentage",
        fixedAmount: s.copyAmount ? parseFloat(s.copyAmount) : undefined,
        ratio: s.copyRatio ? parseFloat(s.copyRatio) : undefined,
        percentage: s.copyPercent ? parseFloat(s.copyPercent) : undefined,
        maxAmountPerTrade: s.maxPosAmt ? parseFloat(s.maxPosAmt) : undefined,
        active: s.state === "running",
        subscribedAt: s.cTime ? new Date(parseInt(s.cTime)) : undefined,
        updatedAt: new Date(),
      }));
    } catch (error) {
      console.error("[OKX] Failed to get follower settings:", error);
      return [];
    }
  }

  /**
   * Update follower's copy trading settings
   */
  async updateCopyFollowerSettings(params: CopyFollowerSettings): Promise<CopyTradingResult> {
    try {
      const updateParams: Record<string, unknown> = {
        uniqueCode: params.traderId,
        copyMode: params.copyMode,
      };

      if (params.fixedAmount) updateParams.copyAmount = params.fixedAmount;
      if (params.ratio) updateParams.copyRatio = params.ratio;
      if (params.percentage) updateParams.copyPercent = params.percentage;
      if (params.maxAmountPerTrade) updateParams.maxPosAmt = params.maxAmountPerTrade;

      const data = await this.signedRequest("POST", "/api/v5/copytrading/amend-algo-order", updateParams);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Update failed",
      };
    }
  }

  // ==================== MASTER TRADER OPERATIONS ====================

  /**
   * Get list of followers (for master trader)
   */
  async getCopyFollowers(limit?: number): Promise<CopyFollowerInfo[]> {
    try {
      const params: Record<string, unknown> = {};
      if (limit) params.limit = limit;

      const data = await this.signedRequest("GET", "/api/v5/copytrading/copy-followers", params) as {
        data?: Array<{
          followerCode?: string;
          state?: string;
          cTime?: string;
          pnl?: string;
          copyNum?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((f) => ({
        followerId: f.followerCode || "",
        exchange: this.exchangeId,
        traderId: "",
        subscribedAt: new Date(parseInt(f.cTime || "0")),
        active: f.state === "running",
        totalPnl: parseFloat(f.pnl || "0"),
        copiedTradesCount: parseInt(f.copyNum || "0"),
      }));
    } catch (error) {
      console.error("[OKX] Failed to get followers:", error);
      return [];
    }
  }

  /**
   * Remove a follower
   */
  async removeCopyFollower(followerId: string): Promise<CopyTradingResult> {
    try {
      const data = await this.signedRequest("POST", "/api/v5/copytrading/close-subposition", {
        subPosId: followerId,
      });

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to remove follower",
      };
    }
  }

  /**
   * Get profit summary for master trader
   */
  async getCopyTraderProfitSummary(startDate?: Date, endDate?: Date): Promise<CopyTraderProfitSummary[]> {
    // OKX may have profit summary endpoints
    return [];
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Close position (for master trader)
   */
  async copyClosePosition(params: CopyClosePositionParams): Promise<CopyTradingResult> {
    try {
      const closeParams: Record<string, unknown> = {
        instId: params.symbol,
      };

      if (params.trackingNumber) {
        closeParams.clOrdId = params.trackingNumber;
      }

      const data = await this.signedRequest("POST", "/api/v5/trade/close-position", closeParams);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to close position",
      };
    }
  }

  /**
   * Modify TP/SL for position
   */
  async copyModifyTpsl(params: CopyModifyTpslParams): Promise<CopyTradingResult> {
    try {
      const amendParams: Record<string, unknown> = {
        instId: params.symbol,
      };

      if (params.takeProfit) amendParams.tpTriggerPx = params.takeProfit.toString();
      if (params.stopLoss) amendParams.slTriggerPx = params.stopLoss.toString();

      const data = await this.signedRequest("POST", "/api/v5/trade/order-algo", amendParams);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to modify TP/SL",
      };
    }
  }
}
