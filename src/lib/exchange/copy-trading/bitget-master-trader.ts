/**
 * Bitget Master Trader API Implementation
 * 
 * Documentation: https://bitgetlimited.github.io/apidoc/en/copyTrade
 * 
 * Master Trader (Elite Trader) Endpoints:
 * - GET /api/mix/v1/trace/traderSymbols - Get trader symbols
 * - POST /api/mix/v1/trace/setUpCopySymbols - Set copy symbols
 * - GET /api/mix/v1/trace/myFollowerList - Get followers list
 * - POST /api/mix/v1/trace/removeFollower - Remove follower
 * - GET /api/mix/v1/trace/profitDateGroupList - Profit summary by date
 * - POST /api/mix/v1/trace/closeTrackOrder - Close position (broadcasts to followers)
 * - POST /api/mix/v1/trace/modifyTPSL - Modify TP/SL (broadcasts to followers)
 * - POST /api/mix/v1/trace/traderUpdateConfig - Update trader config
 * - GET /api/mix/v1/trace/queryTraderTpslRatioConfig - Get TP/SL ratio config
 * - POST /api/mix/v1/trace/traderUpdateTpslRatioConfig - Update TP/SL ratio
 */

import {
  ExchangeId,
  LeadTraderStatus,
  MasterTraderSettings,
  MasterFollowerInfo,
  MasterProfitSummary,
  MasterTraderPosition,
  MasterTraderResult,
  CopyTradingSymbol,
  PositionSide,
  MarginMode,
} from "../types";

export class BitgetMasterTrader {
  private exchangeId: ExchangeId = "bitget";
  private signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>;

  constructor(
    signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>
  ) {
    this.signedRequest = signedRequest;
  }

  // ==================== LEAD TRADER STATUS ====================

  /**
   * Check if user is an Elite Trader
   */
  async getLeadTraderStatus(): Promise<LeadTraderStatus> {
    try {
      // Try to access trader-specific endpoints
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/currentTrack", {}) as {
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

  // ==================== SETTINGS MANAGEMENT ====================

  /**
   * Get trader configuration
   */
  async getMasterTraderSettings(): Promise<MasterTraderSettings | null> {
    try {
      // Get trader symbols to verify trader status
      const symbolsData = await this.signedRequest("GET", "/api/mix/v1/trace/traderSymbols", {}) as {
        data?: {
          traderSymbols?: Array<{
            symbol?: string;
            status?: number;
          }>;
        };
      };

      // Get followers count
      const followersData = await this.signedRequest("GET", "/api/mix/v1/trace/myFollowerList", {
        pageSize: 1,
      }) as {
        data?: unknown[];
      };

      return {
        exchange: this.exchangeId,
        profitShareEnabled: true,
        profitSharePercent: 10, // Bitget default
        minCopyAmount: 10,
        requireApproval: false,
        active: true,
        visible: true,
        totalFollowers: Array.isArray(followersData.data) ? followersData.data.length : 0,
        activeFollowers: Array.isArray(followersData.data) ? followersData.data.length : 0,
        totalProfitShared: 0,
        totalTradesCopied: 0,
      };
    } catch (error) {
      console.error("[Bitget] Failed to get master trader settings:", error);
      return null;
    }
  }

  /**
   * Update trader configuration
   */
  async updateMasterTraderSettings(params: {
    symbol?: string;
    enabled?: boolean;
    maxCopyAmount?: number;
    tpslRatioEnabled?: boolean;
  }): Promise<MasterTraderResult> {
    try {
      const updateParams: Record<string, unknown> = {};
      
      if (params.symbol && params.enabled !== undefined) {
        updateParams.symbol = params.symbol;
        updateParams.status = params.enabled ? 1 : 0;
      }

      const data = await this.signedRequest(
        "POST",
        "/api/mix/v1/trace/traderUpdateConfig",
        updateParams
      );

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update settings",
      };
    }
  }

  // ==================== SYMBOLS MANAGEMENT ====================

  /**
   * Get symbols enabled for copy trading
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
            status?: number;
          }>;
        };
      };

      if (!data.data?.traderSymbols) {
        return [];
      }

      return data.data.traderSymbols.map((s) => ({
        symbol: s.symbol || "",
        exchange: this.exchangeId,
        enabled: s.status === 1,
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

  /**
   * Enable/disable symbol for copy trading
   */
  async setCopyTradingSymbol(symbol: string, enabled: boolean): Promise<MasterTraderResult> {
    try {
      const data = await this.signedRequest("POST", "/api/mix/v1/trace/setUpCopySymbols", {
        symbol,
        status: enabled ? 1 : 0,
      });

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set symbol",
      };
    }
  }

  // ==================== FOLLOWERS MANAGEMENT ====================

  /**
   * Get list of followers
   */
  async getFollowers(limit: number = 50): Promise<MasterFollowerInfo[]> {
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
        nickname: f.nickName,
        subscribedAt: new Date(parseInt(f.cTime || "0")),
        active: f.state === 1,
        copyMode: "fixed",
        copyAmount: 0,
        totalCopiedTrades: f.copyNum || 0,
        totalVolume: f.totalAmount ? parseFloat(f.totalAmount) : 0,
        totalPnl: f.totalPnl ? parseFloat(f.totalPnl) : 0,
        totalProfitShared: 0,
        currentPositions: 0,
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get followers:", error);
      return [];
    }
  }

  /**
   * Remove a follower
   */
  async removeFollower(followerId: string): Promise<MasterTraderResult> {
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

  // ==================== PROFIT SUMMARY ====================

  /**
   * Get profit summary grouped by date
   */
  async getProfitSummary(startDate?: Date, endDate?: Date): Promise<MasterProfitSummary[]> {
    try {
      const params: Record<string, unknown> = {};
      if (startDate) params.startTime = startDate.getTime();
      if (endDate) params.endTime = endDate.getTime();

      const data = await this.signedRequest(
        "GET",
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

      return data.data.map((d) => ({
        exchange: this.exchangeId,
        period: "day" as const,
        tradingPnl: d.profit ? parseFloat(d.profit) : 0,
        realizedPnl: d.profit ? parseFloat(d.profit) : 0,
        unrealizedPnl: 0,
        profitSharedReceived: 0,
        followersProfit: 0,
        totalTrades: d.tradeNum || 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        newFollowers: 0,
        removedFollowers: 0,
        activeFollowers: d.followerNum || 0,
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get profit summary:", error);
      return [];
    }
  }

  // ==================== POSITIONS ====================

  /**
   * Get current tracking positions
   */
  async getMasterPositions(): Promise<MasterTraderPosition[]> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/currentTrack", {}) as {
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
          takeProfitPrice?: string;
          stopLossPrice?: string;
          cTime?: string;
          uTime?: string;
          followerNum?: number;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((p) => ({
        positionId: p.trackingNo || "",
        exchange: this.exchangeId,
        traderId: "",
        symbol: p.symbol || "",
        side: (p.holdSide?.toLowerCase() || "long") as PositionSide,
        quantity: parseFloat(p.size || "0"),
        entryPrice: parseFloat(p.openPrice || "0"),
        markPrice: parseFloat(p.marketPrice || "0"),
        unrealizedPnl: parseFloat(p.unrealizedProfit || "0"),
        leverage: p.leverage || 1,
        marginMode: (p.marginMode?.toLowerCase() || "cross") as MarginMode,
        margin: parseFloat(p.margin || "0"),
        takeProfit: p.takeProfitPrice ? parseFloat(p.takeProfitPrice) : undefined,
        stopLoss: p.stopLossPrice ? parseFloat(p.stopLossPrice) : undefined,
        openedAt: new Date(parseInt(p.cTime || "0")),
        updatedAt: new Date(parseInt(p.uTime || "0")),
        trackingId: p.trackingNo || "",
        followersCopyingCount: p.followerNum || 0,
        totalCopiedVolume: 0,
      }));
    } catch (error) {
      console.error("[Bitget] Failed to get master positions:", error);
      return [];
    }
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Close position - broadcasts to all followers
   */
  async closePosition(params: {
    symbol: string;
    trackingNo?: string;
    holdSide?: "long" | "short";
  }): Promise<MasterTraderResult> {
    try {
      const closeParams: Record<string, unknown> = {
        symbol: params.symbol,
      };

      if (params.trackingNo) {
        closeParams.trackingNo = params.trackingNo;
      }
      if (params.holdSide) {
        closeParams.holdSide = params.holdSide;
      }

      const data = await this.signedRequest(
        "POST",
        "/api/mix/v1/trace/closeTrackOrder",
        closeParams
      );

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
   * Close all positions by symbol
   */
  async closeAllPositionsBySymbol(symbol: string): Promise<MasterTraderResult> {
    try {
      const data = await this.signedRequest(
        "POST",
        "/api/mix/v1/trace/closeTrackOrderBySymbol",
        { symbol }
      );

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to close positions",
      };
    }
  }

  /**
   * Modify TP/SL for position - broadcasts to followers
   */
  async modifyTpsl(params: {
    symbol: string;
    trackingNo?: string;
    takeProfitPrice?: number;
    stopLossPrice?: number;
  }): Promise<MasterTraderResult> {
    try {
      const modifyParams: Record<string, unknown> = {
        symbol: params.symbol,
      };

      if (params.trackingNo) modifyParams.trackingNo = params.trackingNo;
      if (params.takeProfitPrice) modifyParams.takeProfitPrice = params.takeProfitPrice.toString();
      if (params.stopLossPrice) modifyParams.stopLossPrice = params.stopLossPrice.toString();

      const data = await this.signedRequest(
        "POST",
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

  // ==================== TP/SL RATIO CONFIG ====================

  /**
   * Get TP/SL ratio configuration
   * This sets what % of followers should set TP/SL
   */
  async getTpslRatioConfig(): Promise<{
    takeProfitRatio?: number;
    stopLossRatio?: number;
  } | null> {
    try {
      const data = await this.signedRequest(
        "GET",
        "/api/mix/v1/trace/queryTraderTpslRatioConfig",
        {}
      ) as {
        data?: {
          takeProfitRatio?: string;
          stopLossRatio?: string;
        };
      };

      if (!data.data) return null;

      return {
        takeProfitRatio: data.data.takeProfitRatio ? parseFloat(data.data.takeProfitRatio) : undefined,
        stopLossRatio: data.data.stopLossRatio ? parseFloat(data.data.stopLossRatio) : undefined,
      };
    } catch (error) {
      console.error("[Bitget] Failed to get TP/SL ratio config:", error);
      return null;
    }
  }

  /**
   * Update TP/SL ratio configuration
   * Sets what % of followers will auto-copy TP/SL
   */
  async updateTpslRatioConfig(params: {
    takeProfitRatio?: number;
    stopLossRatio?: number;
  }): Promise<MasterTraderResult> {
    try {
      const updateParams: Record<string, unknown> = {};

      if (params.takeProfitRatio !== undefined) {
        updateParams.takeProfitRatio = params.takeProfitRatio.toString();
      }
      if (params.stopLossRatio !== undefined) {
        updateParams.stopLossRatio = params.stopLossRatio.toString();
      }

      const data = await this.signedRequest(
        "POST",
        "/api/mix/v1/trace/traderUpdateTpslRatioConfig",
        updateParams
      );

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update TP/SL ratio",
      };
    }
  }
}
