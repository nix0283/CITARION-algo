/**
 * Bitget Copy Trading API Implementation
 * 
 * Documentation: https://bitgetlimited.github.io/apidoc/en/copyTrade
 * 
 * Bitget имеет наиболее развитый API для копитрейдинга:
 * - Separate endpoints for Futures and Spot CopyTrading
 * - Full position management for Master Traders
 * - Follower management and profit tracking
 * - TP/SL ratio configuration
 * 
 * Rate Limits (updated Aug 2024):
 * - Most endpoints: 5 req/sec/UID
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
 * Bitget Copy Trading Client
 * Implements both Futures and Spot CopyTrading
 */
export class BitgetCopyTrading {
  private exchangeId: ExchangeId = "bitget";
  private signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>;

  constructor(
    signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>
  ) {
    this.signedRequest = signedRequest;
  }

  // ==================== LEAD TRADER STATUS ====================

  /**
   * Check if the authenticated user is an Elite/Master Trader
   */
  async getLeadTraderStatus(): Promise<LeadTraderStatus> {
    try {
      // Try to access trader-specific endpoints
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/currentTrack", {}) as {
        data?: unknown;
      };

      return {
        isLeadTrader: true,
        active: true,
      };
    } catch (error) {
      return {
        isLeadTrader: false,
      };
    }
  }

  // ==================== COPY TRADING SYMBOLS ====================

  /**
   * Get symbols available for copy trading
   */
  async getCopyTradingSymbols(): Promise<CopyTradingSymbol[]> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/traderSymbols", {}) as {
        data?: {
          traderSymbols?: Array<{
            symbol?: string;
            maxLeverage?: number;
            minAmount?: string;
            maxAmount?: string;
            volumePrecision?: number;
            pricePrecision?: number;
          }>;
        };
      };

      if (!data.data?.traderSymbols) {
        return [];
      }

      return data.data.traderSymbols.map((s) => ({
        symbol: s.symbol || "",
        exchange: this.exchangeId,
        enabled: true,
        maxLeverage: s.maxLeverage,
        minQuantity: s.minAmount ? parseFloat(s.minAmount) : undefined,
        maxQuantity: s.maxAmount ? parseFloat(s.maxAmount) : undefined,
        quantityPrecision: s.volumePrecision,
        pricePrecision: s.pricePrecision,
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get copy trading symbols:", error);
      return [];
    }
  }

  // ==================== TRADER LIST & STATS ====================

  /**
   * Get list of traders for copy trading
   */
  async getCopyTraderList(limit: number = 20, sortBy?: string): Promise<CopyTraderStats[]> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/traderList", {
        pageSize: limit,
      }) as {
        data?: {
          result?: Array<{
            traderId?: string;
            nickName?: string;
            avatar?: string;
            roi?: string;
            winRate?: string;
            totalTrades?: number;
            followerNum?: number;
            traderDays?: number;
            avgLeverage?: number;
            totalPnl?: string;
            maxDrawdown?: string;
            lastTradeTime?: string;
          }>;
        };
      };

      if (!data.data?.result) {
        return [];
      }

      return data.data.result.map((t) => ({
        traderId: t.traderId || "",
        nickname: t.nickName,
        avatar: t.avatar,
        exchange: this.exchangeId,
        roi: parseFloat(t.roi || "0"),
        winRate: parseFloat(t.winRate || "0"),
        totalTrades: t.totalTrades || 0,
        followersCount: t.followerNum || 0,
        tradingDays: t.traderDays,
        totalPnl: parseFloat(t.totalPnl || "0"),
        maxDrawdown: parseFloat(t.maxDrawdown || "0"),
        avgLeverage: t.avgLeverage,
        lastTradeTime: t.lastTradeTime ? new Date(parseInt(t.lastTradeTime)) : undefined,
        positionSide: "both",
        timestamp: new Date(),
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get trader list:", error);
      return [];
    }
  }

  /**
   * Get statistics for a specific trader
   */
  async getCopyTraderStats(traderId: string): Promise<CopyTraderStats> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/traderDetail", {
        traderId,
      }) as {
        data?: {
          traderId?: string;
          nickName?: string;
          avatar?: string;
          roi?: string;
          winRate?: string;
          totalTrades?: number;
          followerNum?: number;
          traderDays?: number;
          avgLeverage?: number;
          totalPnl?: string;
          maxDrawdown?: string;
          totalProfit?: string;
          weekProfit?: string;
          monthProfit?: string;
          todayProfit?: string;
          lastTradeTime?: string;
          rank?: number;
        };
      };

      if (!data.data) {
        throw new Error("Trader not found");
      }

      const t = data.data;
      return {
        traderId: t.traderId || traderId,
        nickname: t.nickName,
        avatar: t.avatar,
        exchange: this.exchangeId,
        roi: parseFloat(t.roi || "0"),
        winRate: parseFloat(t.winRate || "0"),
        totalTrades: t.totalTrades || 0,
        followersCount: t.followerNum || 0,
        tradingDays: t.traderDays,
        totalPnl: parseFloat(t.totalPnl || "0"),
        todayPnl: parseFloat(t.todayProfit || "0"),
        weekPnl: parseFloat(t.weekProfit || "0"),
        monthPnl: parseFloat(t.monthProfit || "0"),
        maxDrawdown: parseFloat(t.maxDrawdown || "0"),
        avgLeverage: t.avgLeverage,
        lastTradeTime: t.lastTradeTime ? new Date(parseInt(t.lastTradeTime)) : undefined,
        rank: t.rank,
        positionSide: "both",
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to get trader stats: ${error}`);
    }
  }

  // ==================== TRADER POSITIONS ====================

  /**
   * Get current positions of a master trader
   */
  async getCopyTraderPositions(traderId: string): Promise<CopyTraderPosition[]> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/currentTrack", {
        traderId,
      }) as {
        data?: Array<{
          trackingNo?: string;
          symbol?: string;
          holdSide?: string;
          size?: string;
          openPrice?: string;
          marketPrice?: string;
          unrealizedProfit?: string;
          leverage?: number;
          marginMode?: string;
          margin?: string;
          liquidationPrice?: string;
          takeProfitPrice?: string;
          stopLossPrice?: string;
          openFee?: string;
          cTime?: string;
          uTime?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((p) => ({
        positionId: p.trackingNo || "",
        exchange: this.exchangeId,
        traderId,
        symbol: p.symbol || "",
        side: (p.holdSide?.toLowerCase() || "long") as PositionSide,
        quantity: parseFloat(p.size || "0"),
        entryPrice: parseFloat(p.openPrice || "0"),
        markPrice: parseFloat(p.marketPrice || "0"),
        unrealizedPnl: parseFloat(p.unrealizedProfit || "0"),
        leverage: p.leverage || 1,
        marginMode: (p.marginMode?.toLowerCase() || "cross") as MarginMode,
        margin: parseFloat(p.margin || "0"),
        liquidationPrice: p.liquidationPrice ? parseFloat(p.liquidationPrice) : undefined,
        takeProfit: p.takeProfitPrice ? parseFloat(p.takeProfitPrice) : undefined,
        stopLoss: p.stopLossPrice ? parseFloat(p.stopLossPrice) : undefined,
        openedAt: new Date(parseInt(p.cTime || "0")),
        updatedAt: new Date(parseInt(p.uTime || "0")),
        trackingNumber: p.trackingNo,
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get trader positions:", error);
      return [];
    }
  }

  /**
   * Get trade history of a master trader
   */
  async getCopyTraderTradeHistory(traderId: string, limit?: number, startTime?: Date): Promise<CopyTraderTrade[]> {
    try {
      const params: Record<string, unknown> = {
        traderId,
      };
      if (limit) params.pageSize = limit;
      if (startTime) params.startTime = startTime.getTime();

      const data = await this.signedRequest("GET", "/api/mix/v1/trace/historyTrack", params) as {
        data?: Array<{
          trackingNo?: string;
          symbol?: string;
          holdSide?: string;
          size?: string;
          openPrice?: string;
          closePrice?: string;
          realizedProfit?: string;
          fee?: string;
          leverage?: number;
          openTime?: string;
          closeTime?: string;
          maxDrawdown?: string;
          followerNum?: number;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((t) => ({
        tradeId: t.trackingNo || "",
        exchange: this.exchangeId,
        traderId,
        symbol: t.symbol || "",
        side: (t.holdSide?.toLowerCase() || "long") as PositionSide,
        orderType: "market",
        quantity: parseFloat(t.size || "0"),
        entryPrice: parseFloat(t.openPrice || "0"),
        exitPrice: parseFloat(t.closePrice || "0"),
        realizedPnl: parseFloat(t.realizedProfit || "0"),
        fee: parseFloat(t.fee || "0"),
        feeCurrency: "USDT",
        openedAt: new Date(parseInt(t.openTime || "0")),
        closedAt: new Date(parseInt(t.closeTime || "0")),
        leverage: t.leverage || 1,
        maxDrawdown: parseFloat(t.maxDrawdown || "0"),
        copiedByCount: t.followerNum,
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get trade history:", error);
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
        traderId: params.traderId,
        copyType: params.copyMode === "fixed" ? 1 : 
                  params.copyMode === "ratio" ? 2 : 3,
      };

      if (params.copyMode === "fixed" && params.amount) {
        subscribeParams.fixAmount = params.amount;
      } else if (params.copyMode === "ratio" && params.amount) {
        subscribeParams.copyRatio = params.amount;
      } else if (params.copyMode === "percentage" && params.amount) {
        subscribeParams.percent = params.amount;
      }

      const data = await this.signedRequest("POST", 
        "/api/mix/v1/trace/followerSetBatchTraceConfig", 
        subscribeParams
      );

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
      const data = await this.signedRequest("POST", "/api/mix/v1/trace/cancelCopyTrader", {
        traderId,
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
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/queryTraceConfig", {
        traderId,
      }) as {
        data?: Array<{
          traderId?: string;
          copyType?: number;
          fixAmount?: string;
          copyRatio?: string;
          percent?: string;
          maxAmount?: string;
          state?: number;
          cTime?: string;
          uTime?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((s) => ({
        traderId: s.traderId || "",
        exchange: this.exchangeId,
        copyMode: s.copyType === 1 ? "fixed" : 
                  s.copyType === 2 ? "ratio" : 
                  "percentage",
        fixedAmount: s.fixAmount ? parseFloat(s.fixAmount) : undefined,
        ratio: s.copyRatio ? parseFloat(s.copyRatio) : undefined,
        percentage: s.percent ? parseFloat(s.percent) : undefined,
        maxAmountPerTrade: s.maxAmount ? parseFloat(s.maxAmount) : undefined,
        active: s.state === 1,
        subscribedAt: s.cTime ? new Date(parseInt(s.cTime)) : undefined,
        updatedAt: s.uTime ? new Date(parseInt(s.uTime)) : new Date(),
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get follower settings:", error);
      return [];
    }
  }

  /**
   * Update follower's copy trading settings
   */
  async updateCopyFollowerSettings(params: CopyFollowerSettings): Promise<CopyTradingResult> {
    try {
      const updateParams: Record<string, unknown> = {
        traderId: params.traderId,
        copyType: params.copyMode === "fixed" ? 1 : 
                  params.copyMode === "ratio" ? 2 : 3,
      };

      if (params.fixedAmount) updateParams.fixAmount = params.fixedAmount;
      if (params.ratio) updateParams.copyRatio = params.ratio;
      if (params.percentage) updateParams.percent = params.percentage;
      if (params.maxAmountPerTrade) updateParams.maxAmount = params.maxAmountPerTrade;

      const data = await this.signedRequest("POST", 
        "/api/mix/v1/trace/followerSetBatchTraceConfig", 
        updateParams
      );

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
  async getCopyFollowers(limit: number = 20): Promise<CopyFollowerInfo[]> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/myFollowerList", {
        pageSize: limit,
      }) as {
        data?: Array<{
          followerId?: string;
          nickName?: string;
          cTime?: string;
          state?: number;
          totalPnl?: string;
          copyNum?: number;
          totalAmount?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((f) => ({
        followerId: f.followerId || "",
        exchange: this.exchangeId,
        traderId: "",
        nickname: f.nickName,
        subscribedAt: new Date(parseInt(f.cTime || "0")),
        active: f.state === 1,
        totalPnl: parseFloat(f.totalPnl || "0"),
        copiedTradesCount: f.copyNum || 0,
        investedAmount: parseFloat(f.totalAmount || "0"),
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get followers:", error);
      return [];
    }
  }

  /**
   * Remove a follower (for master trader)
   */
  async removeCopyFollower(followerId: string): Promise<CopyTradingResult> {
    try {
      const data = await this.signedRequest("POST", "/api/mix/v1/trace/removeFollower", {
        followerId,
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
    try {
      const params: Record<string, unknown> = {};
      if (startDate) params.startTime = startDate.getTime();
      if (endDate) params.endTime = endDate.getTime();

      const data = await this.signedRequest("GET", 
        "/api/mix/v1/trace/profitDateGroupList", 
        params
      ) as {
        data?: Array<{
          date?: string;
          profit?: string;
          fee?: string;
          followerNum?: number;
          tradeNum?: number;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((s) => ({
        exchange: this.exchangeId,
        traderId: "",
        date: new Date(s.date || ""),
        dailyPnl: parseFloat(s.profit || "0"),
        dailyFee: parseFloat(s.fee || "0"),
        activeFollowers: s.followerNum || 0,
        dailyTrades: s.tradeNum || 0,
        totalPnl: 0,
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get profit summary:", error);
      return [];
    }
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Close position (for master trader)
   */
  async copyClosePosition(params: CopyClosePositionParams): Promise<CopyTradingResult> {
    try {
      const closeParams: Record<string, unknown> = {
        symbol: params.symbol,
      };

      if (params.trackingNumber) {
        closeParams.trackingNo = params.trackingNumber;
      }

      const endpoint = params.market !== false ? 
        "/api/mix/v1/trace/closeTrackOrder" :
        "/api/mix/v1/trace/closeTrackOrderBySymbol";

      const data = await this.signedRequest("POST", endpoint, closeParams);

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
      const modifyParams: Record<string, unknown> = {
        symbol: params.symbol,
      };

      if (params.trackingNumber) {
        modifyParams.trackingNo = params.trackingNumber;
      }
      if (params.takeProfit) {
        modifyParams.takeProfitPrice = params.takeProfit.toString();
      }
      if (params.stopLoss) {
        modifyParams.stopLossPrice = params.stopLoss.toString();
      }

      const data = await this.signedRequest("POST", 
        "/api/mix/v1/trace/modifyTPSL", 
        modifyParams
      );

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
