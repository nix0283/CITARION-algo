/**
 * OKX Master Trader API Implementation
 * 
 * Documentation: https://www.okx.com/docs-v5/en/#copy-trading-rest-api
 * 
 * Master Trader Endpoints:
 * - POST /api/v5/copytrading/apply-lead-trader - Apply to become lead trader
 * - GET /api/v5/copytrading/lead-traders - Get lead trader profile
 * - POST /api/v5/copytrading/amend-lead-trader - Update lead trader settings
 * - GET /api/v5/copytrading/copy-followers - Get followers list
 * - POST /api/v5/copytrading/remove-copy-followers - Remove follower
 * - GET /api/v5/copytrading/copy-trading-profit-sharing-details - Profit sharing details
 */

import {
  ExchangeId,
  LeadTraderStatus,
  MasterTraderSettings,
  MasterTraderApplication,
  MasterFollowerInfo,
  MasterProfitSummary,
  MasterTraderPosition,
  MasterTraderResult,
  CopyTradingSymbol,
} from "../types";

export class OKXMasterTrader {
  private exchangeId: ExchangeId = "okx";
  private signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>;

  constructor(
    signedRequest: (method: "GET" | "POST" | "DELETE", endpoint: string, params?: Record<string, unknown>) => Promise<unknown>
  ) {
    this.signedRequest = signedRequest;
  }

  // ==================== LEAD TRADER STATUS ====================

  /**
   * Check if user is a Lead Trader
   */
  async getLeadTraderStatus(): Promise<LeadTraderStatus> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/copytrading/lead-traders", {}) as {
        data?: {
          uniqueCode?: string;
          nickName?: string;
          status?: string;
          followerNum?: string;
          createDate?: string;
        }[];
      };

      if (data.data && data.data.length > 0) {
        const trader = data.data[0];
        return {
          isLeadTrader: true,
          since: trader.createDate ? new Date(parseInt(trader.createDate)) : undefined,
          followersCount: trader.followerNum ? parseInt(trader.followerNum) : 0,
          active: trader.status === "running",
        };
      }

      return { isLeadTrader: false };
    } catch {
      return { isLeadTrader: false };
    }
  }

  // ==================== BECOME LEAD TRADER ====================

  /**
   * Apply to become a Lead Trader
   */
  async applyAsLeadTrader(application: MasterTraderApplication): Promise<MasterTraderResult> {
    try {
      const params: Record<string, unknown> = {
        profitSharingPct: application.profitSharePercent.toString(),
      };

      if (application.nickname) params.nickName = application.nickname;
      if (application.minCopyAmount) params.minCopyAmount = application.minCopyAmount.toString();

      const data = await this.signedRequest("POST", "/api/v5/copytrading/apply-lead-trader", params);

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to apply as lead trader",
      };
    }
  }

  // ==================== SETTINGS MANAGEMENT ====================

  /**
   * Get current Lead Trader settings
   */
  async getMasterTraderSettings(): Promise<MasterTraderSettings | null> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/copytrading/lead-traders", {}) as {
        data?: {
          uniqueCode?: string;
          nickName?: string;
          avatar?: string;
          profitSharingPct?: string;
          status?: string;
          followerNum?: string;
          totalProfit?: string;
          tradeNum?: string;
          minCopyAmount?: string;
        }[];
      };

      if (!data.data || data.data.length === 0) {
        return null;
      }

      const t = data.data[0];
      return {
        exchange: this.exchangeId,
        nickname: t.nickName,
        avatar: t.avatar,
        profitShareEnabled: true,
        profitSharePercent: t.profitSharingPct ? parseFloat(t.profitSharingPct) : 0,
        minCopyAmount: t.minCopyAmount ? parseFloat(t.minCopyAmount) : 10,
        requireApproval: false,
        active: t.status === "running",
        visible: true,
        totalFollowers: t.followerNum ? parseInt(t.followerNum) : 0,
        activeFollowers: t.followerNum ? parseInt(t.followerNum) : 0,
        totalProfitShared: t.totalProfit ? parseFloat(t.totalProfit) : 0,
        totalTradesCopied: t.tradeNum ? parseInt(t.tradeNum) : 0,
      };
    } catch (error) {
      console.error("[OKX] Failed to get master trader settings:", error);
      return null;
    }
  }

  /**
   * Update Lead Trader settings
   */
  async updateMasterTraderSettings(settings: Partial<MasterTraderSettings>): Promise<MasterTraderResult> {
    try {
      const params: Record<string, unknown> = {};

      if (settings.nickname) params.nickName = settings.nickname;
      if (settings.profitSharePercent !== undefined) {
        params.profitSharingPct = settings.profitSharePercent.toString();
      }
      if (settings.minCopyAmount !== undefined) {
        params.minCopyAmount = settings.minCopyAmount.toString();
      }

      const data = await this.signedRequest("POST", "/api/v5/copytrading/amend-lead-trader", params);

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

  // ==================== FOLLOWERS MANAGEMENT ====================

  /**
   * Get list of followers
   */
  async getFollowers(limit: number = 50): Promise<MasterFollowerInfo[]> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/copytrading/copy-followers", {
        limit,
      }) as {
        data?: Array<{
          followerUniqueCode?: string;
          nickName?: string;
          status?: string;
          totalPnl?: string;
          profitSharing?: string;
          copyNum?: string;
          createDate?: string;
          copyType?: string;
          copyAmount?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((f) => ({
        followerId: f.followerUniqueCode || "",
        exchange: this.exchangeId,
        nickname: f.nickName,
        subscribedAt: f.createDate ? new Date(parseInt(f.createDate)) : new Date(),
        active: f.status === "running",
        copyMode: f.copyType === "fixed" ? "fixed" : f.copyType === "ratio" ? "ratio" : "percentage",
        copyAmount: f.copyAmount ? parseFloat(f.copyAmount) : 0,
        totalCopiedTrades: f.copyNum ? parseInt(f.copyNum) : 0,
        totalVolume: 0,
        totalPnl: f.totalPnl ? parseFloat(f.totalPnl) : 0,
        totalProfitShared: f.profitSharing ? parseFloat(f.profitSharing) : 0,
        currentPositions: 0,
      }));
    } catch (error) {
      console.error("[OKX] Failed to get followers:", error);
      return [];
    }
  }

  /**
   * Remove a follower
   */
  async removeFollower(followerId: string): Promise<MasterTraderResult> {
    try {
      const data = await this.signedRequest("POST", "/api/v5/copytrading/remove-copy-followers", {
        followerUniqueCodes: [followerId],
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

  // ==================== PROFIT SHARING ====================

  /**
   * Get profit sharing details
   */
  async getProfitSharingDetails(startDate?: Date, endDate?: Date): Promise<MasterProfitSummary[]> {
    try {
      const params: Record<string, unknown> = {};
      if (startDate) params.after = startDate.getTime();
      if (endDate) params.before = endDate.getTime();

      const data = await this.signedRequest(
        "GET", 
        "/api/v5/copytrading/copy-trading-profit-sharing-details",
        params
      ) as {
        data?: Array<{
          date?: string;
          profitSharing?: string;
          followerNum?: string;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((d) => ({
        exchange: this.exchangeId,
        period: "day" as const,
        tradingPnl: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        profitSharedReceived: d.profitSharing ? parseFloat(d.profitSharing) : 0,
        followersProfit: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        newFollowers: 0,
        removedFollowers: 0,
        activeFollowers: d.followerNum ? parseInt(d.followerNum) : 0,
      }));
    } catch (error) {
      console.error("[OKX] Failed to get profit sharing details:", error);
      return [];
    }
  }

  // ==================== POSITIONS ====================

  /**
   * Get current positions (as Master Trader)
   * These positions are visible to followers
   */
  async getMasterPositions(): Promise<MasterTraderPosition[]> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/copytrading/current-subpositions", {}) as {
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
          followerNum?: number;
        }>;
      };

      if (!data.data) {
        return [];
      }

      return data.data.map((p) => ({
        positionId: p.subPosId || "",
        exchange: this.exchangeId,
        traderId: "",
        symbol: p.instId || "",
        side: (p.posSide?.toLowerCase() || "long") as "long" | "short",
        quantity: parseFloat(p.posSz || "0"),
        entryPrice: parseFloat(p.avgPx || "0"),
        markPrice: parseFloat(p.markPx || "0"),
        unrealizedPnl: parseFloat(p.upl || "0"),
        leverage: parseFloat(p.lever || "1"),
        marginMode: (p.mgnMode?.toLowerCase() || "cross") as "cross" | "isolated",
        margin: 0,
        openedAt: new Date(parseInt(p.cTime || "0")),
        updatedAt: new Date(parseInt(p.uTime || "0")),
        trackingId: p.subPosId || "",
        followersCopyingCount: p.followerNum || 0,
        totalCopiedVolume: 0,
      }));
    } catch (error) {
      console.error("[OKX] Failed to get master positions:", error);
      return [];
    }
  }

  // ==================== SYMBOLS ====================

  /**
   * Get symbols available for copy trading as Master Trader
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
        quantityPrecision: s.lotSz ? Math.ceil(-Math.log10(parseFloat(s.lotSz))) : 0,
        pricePrecision: s.tickSz ? Math.ceil(-Math.log10(parseFloat(s.tickSz))) : 0,
      }));
    } catch (error) {
      console.error("[OKX] Failed to get copy trading symbols:", error);
      return [];
    }
  }
}
