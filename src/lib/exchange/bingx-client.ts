/**
 * BingX Exchange Client
 * 
 * Supports:
 * - Spot Trading
 * - Futures Trading (Swap V2 API)
 * - Demo Trading via VST (Virtual Simulation Token)
 * 
 * Demo Mode Details (2026):
 * - Uses same API endpoint: https://open-api.bingx.com
 * - Virtual currency: VST (Virtual Simulation Token)
 * - Initial balance: 100,000 VST
 * - Recharge: Available every 7 days if balance < 20,000 VST
 * - Rate limit: 10 requests/second for orders
 * 
 * Note: From March 2, 2026, BingX introduces updated API trading fees (up to 50%)
 */

import crypto from "crypto";
import { BaseExchangeClient } from "./base-client";
import {
  ApiCredentials,
  MarketType,
  OrderResult,
  CreateOrderParams,
  CancelOrderParams,
  ClosePositionParams,
  SetLeverageParams,
  AccountInfo,
  Position,
  Ticker,
  FundingRate,
  Orderbook,
  OrderbookEntry,
  Balance,
  Order,
  PositionSide,
  getDemoCurrency,
} from "./types";

export class BingxClient extends BaseExchangeClient {
  private demoMode: boolean;

  constructor(
    credentials: ApiCredentials,
    marketType: MarketType = "futures",
    testnet: boolean = false,
    demoMode: boolean = false
  ) {
    super("bingx", credentials, marketType, testnet);
    this.demoMode = demoMode;
  }

  /**
   * Check if demo mode is active
   */
  isDemoMode(): boolean {
    return this.demoMode;
  }

  /**
   * Enable or disable demo mode
   */
  setDemoMode(enabled: boolean): void {
    this.demoMode = enabled;
  }

  private generateSignature(queryString: string): string {
    return crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(queryString)
      .digest("hex");
  }

  private async signedRequest(
    method: "GET" | "POST" | "DELETE",
    path: string,
    params: Record<string, unknown> = {},
    isOrder: boolean = false
  ): Promise<unknown> {
    await this.rateLimit(1, isOrder);

    const timestamp = Date.now().toString();
    const allParams = { ...params, timestamp, recvWindow: 5000 };
    
    const queryString = Object.entries(allParams)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");

    const signature = this.generateSignature(queryString);
    const url = `${this.getBaseUrl()}${path}?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method,
      headers: {
        "X-BX-APIKEY": this.credentials.apiKey,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json() as {
      code: number;
      msg: string;
      data: unknown;
    };

    if (data.code !== 0) {
      throw {
        exchange: "bingx",
        code: String(data.code),
        message: data.msg,
        timestamp: new Date(),
        retriable: false,
      };
    }

    return data.data;
  }

  // ==================== ACCOUNT INFO ====================

  async getAccountInfo(): Promise<AccountInfo> {
    if (this.marketType === "spot") {
      const data = await this.signedRequest("GET", "/openApi/spot/v1/account/balance") as {
        balances: Array<{
          asset: string;
          free: string;
          locked: string;
        }>;
      };

      const balances: Balance[] = (data.balances || [])
        .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b) => ({
          currency: b.asset,
          total: parseFloat(b.free) + parseFloat(b.locked),
          available: parseFloat(b.free),
          frozen: parseFloat(b.locked),
          isDemo: this.demoMode && b.asset === "VST",
        }));

      return {
        exchange: "bingx",
        balances,
        totalEquity: balances.reduce((s, b) => s + b.total, 0),
        availableMargin: balances.find((b) => b.currency === (this.demoMode ? "VST" : "USDT"))?.available || 0,
        marginUsed: 0,
        unrealizedPnl: 0,
        isDemo: this.demoMode,
      };
    }

    // Futures account
    const data = await this.signedRequest("GET", "/openApi/swap/v2/user/balance") as {
      balance: Array<{
        asset: string;
        totalAmount: string;
        availableAmount: string;
        frozenAmount: string;
      }>;
    };

    const balances: Balance[] = (data.balance || []).map((b) => ({
      currency: b.asset,
      total: parseFloat(b.totalAmount),
      available: parseFloat(b.availableAmount),
      frozen: parseFloat(b.frozenAmount),
      isDemo: this.demoMode && b.asset === "VST",
    }));

    return {
      exchange: "bingx",
      balances,
      totalEquity: balances.reduce((s, b) => s + b.total, 0),
      availableMargin: balances.find((b) => b.currency === (this.demoMode ? "VST" : "USDT"))?.available || 0,
      marginUsed: balances.reduce((s, b) => s + b.frozen, 0),
      unrealizedPnl: 0,
      isDemo: this.demoMode,
    };
  }

  // ==================== ORDER MANAGEMENT ====================

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    try {
      if (this.marketType === "spot") {
        const data = await this.signedRequest("POST", "/openApi/spot/v1/trade/order", {
          symbol: params.symbol,
          side: params.side.toUpperCase(),
          type: params.type.toUpperCase(),
          quantity: params.quantity,
          quoteOrderQty: params.type === "market" ? params.quantity : undefined,
          price: params.price,
          newClientOrderId: params.clientOrderId,
        }, true) as { orderId: number };

        return {
          success: true,
          order: {
            id: String(data.orderId),
            exchange: "bingx",
            symbol: params.symbol,
            side: params.side,
            type: params.type,
            status: "open",
            price: params.price || 0,
            quantity: params.quantity,
            filledQuantity: 0,
            remainingQuantity: params.quantity,
            createdAt: new Date(),
            updatedAt: new Date(),
            fee: 0,
            feeCurrency: this.demoMode ? "VST" : "USDT",
            isDemo: this.demoMode,
          },
        };
      }

      // Futures order
      const data = await this.signedRequest("POST", "/openApi/swap/v2/trade/order", {
        symbol: params.symbol,
        side: params.side.toUpperCase(),
        type: params.type.toUpperCase(),
        quantity: params.quantity,
        price: params.price,
        positionSide: params.positionSide?.toUpperCase(),
        reduceOnly: params.reduceOnly,
        clientOrderId: params.clientOrderId,
      }, true) as { orderId: string };

      return {
        success: true,
        order: {
          id: data.orderId,
          exchange: "bingx",
          symbol: params.symbol,
          side: params.side,
          type: params.type,
          status: "open",
          price: params.price || 0,
          quantity: params.quantity,
          filledQuantity: 0,
          remainingQuantity: params.quantity,
          createdAt: new Date(),
          updatedAt: new Date(),
          fee: 0,
          feeCurrency: this.demoMode ? "VST" : "USDT",
          isDemo: this.demoMode,
        },
      };
    } catch (error) {
      const err = error as { message?: string; code?: string };
      return {
        success: false,
        error: err.message || "Unknown error",
        errorCode: err.code,
      };
    }
  }

  async cancelOrder(params: CancelOrderParams): Promise<OrderResult> {
    try {
      const endpoint = this.marketType === "spot"
        ? "/openApi/spot/v1/trade/cancelOrder"
        : "/openApi/swap/v2/trade/order";

      await this.signedRequest("DELETE", endpoint, {
        symbol: params.symbol,
        orderId: params.orderId,
        clientOrderId: params.clientOrderId,
      }, true);

      return {
        success: true,
        order: {
          id: params.orderId || "",
          exchange: "bingx",
          symbol: params.symbol,
          side: "buy",
          type: "limit",
          status: "cancelled",
          price: 0,
          quantity: 0,
          filledQuantity: 0,
          remainingQuantity: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          fee: 0,
          feeCurrency: "",
          isDemo: this.demoMode,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ==================== POSITION MANAGEMENT ====================

  async getPosition(symbol: string): Promise<Position | null> {
    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol) || null;
  }

  async getPositions(): Promise<Position[]> {
    if (this.marketType === "spot") {
      return [];
    }

    const data = await this.signedRequest("GET", "/openApi/swap/v2/user/positions", {
      symbol: undefined, // Get all positions
    }) as Array<{
      symbol: string;
      positionSide: string;
      positionAmt: string;
      entryPrice: string;
      markPrice: string;
      unRealizedProfit: string;
      leverage: string;
      initialMargin: string;
      liquidationPrice: string;
      updateTime: string;
    }>;

    return (data || [])
      .filter((p) => parseFloat(p.positionAmt) !== 0)
      .map((p) => ({
        id: p.symbol,
        exchange: "bingx" as const,
        symbol: p.symbol,
        side: p.positionSide.toLowerCase() as PositionSide,
        quantity: Math.abs(parseFloat(p.positionAmt)),
        entryPrice: parseFloat(p.entryPrice),
        markPrice: parseFloat(p.markPrice),
        unrealizedPnl: parseFloat(p.unRealizedProfit),
        realizedPnl: 0,
        leverage: parseInt(p.leverage),
        marginMode: "cross" as const,
        margin: parseFloat(p.initialMargin),
        liquidationPrice: parseFloat(p.liquidationPrice) || undefined,
        createdAt: new Date(),
        updatedAt: new Date(parseInt(p.updateTime)),
      }));
  }

  async closePosition(params: ClosePositionParams): Promise<OrderResult> {
    const position = await this.getPosition(params.symbol);
    if (!position) {
      return { success: false, error: "Position not found" };
    }

    const closeSide = position.side === "long" ? "sell" : "buy";
    return this.createOrder({
      symbol: params.symbol,
      side: closeSide,
      type: "market",
      quantity: params.quantity || position.quantity,
      reduceOnly: true,
    });
  }

  // ==================== LEVERAGE ====================

  async setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
    await this.signedRequest("POST", "/openApi/swap/v2/trade/leverage", {
      symbol: params.symbol,
      leverage: params.leverage,
    });
    return { success: true, leverage: params.leverage };
  }

  // ==================== MARKET DATA ====================

  async getTicker(symbol: string): Promise<Ticker> {
    if (this.marketType === "spot") {
      const response = await fetch(
        `${this.getBaseUrl()}/openApi/spot/v1/ticker/price?symbol=${symbol}`
      );
      const data = await response.json() as {
        code: number;
        data: {
          symbol: string;
          price: string;
        };
      };

      return {
        symbol,
        exchange: "bingx",
        bid: parseFloat(data.data.price),
        ask: parseFloat(data.data.price),
        last: parseFloat(data.data.price),
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        change24h: 0,
        changePercent24h: 0,
        timestamp: new Date(),
      };
    }

    const response = await fetch(
      `${this.getBaseUrl()}/openApi/swap/v2/quote/price?symbol=${symbol}`
    );
    const data = await response.json() as {
      code: number;
      data: {
        symbol: string;
        price: string;
        bidPrice?: string;
        askPrice?: string;
        high24h?: string;
        low24h?: string;
        volume24h?: string;
      };
    };

    return {
      symbol,
      exchange: "bingx",
      bid: parseFloat(data.data.bidPrice || data.data.price),
      ask: parseFloat(data.data.askPrice || data.data.price),
      last: parseFloat(data.data.price),
      high24h: parseFloat(data.data.high24h || "0"),
      low24h: parseFloat(data.data.low24h || "0"),
      volume24h: parseFloat(data.data.volume24h || "0"),
      change24h: 0,
      changePercent24h: 0,
      timestamp: new Date(),
    };
  }

  async getFundingRate(symbol: string): Promise<FundingRate> {
    const response = await fetch(
      `${this.getBaseUrl()}/openApi/swap/v2/quote/fundingRate?symbol=${symbol}`
    );
    const data = await response.json() as {
      code: number;
      data: {
        symbol: string;
        fundingRate: string;
        nextFundingTime: string;
        markPrice: string;
        indexPrice?: string;
      };
    };

    return {
      symbol,
      exchange: "bingx",
      rate: parseFloat(data.data.fundingRate),
      nextFundingTime: new Date(parseInt(data.data.nextFundingTime)),
      markPrice: parseFloat(data.data.markPrice),
      indexPrice: data.data.indexPrice ? parseFloat(data.data.indexPrice) : undefined,
      timestamp: new Date(),
    };
  }

  async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
    if (this.marketType === "spot") {
      const response = await fetch(
        `${this.getBaseUrl()}/openApi/spot/v1/depth?symbol=${symbol}&limit=${depth}`
      );
      const data = await response.json() as {
        code: number;
        data: {
          bids: Array<{ price: string; qty: string }>;
          asks: Array<{ price: string; qty: string }>;
        };
      };

      if (data.code !== 0) {
        throw new Error(`BingX spot orderbook error: ${data.code}`);
      }

      const bids: OrderbookEntry[] = (data.data?.bids || []).map((b) => ({
        price: parseFloat(b.price),
        quantity: parseFloat(b.qty),
      }));

      const asks: OrderbookEntry[] = (data.data?.asks || []).map((a) => ({
        price: parseFloat(a.price),
        quantity: parseFloat(a.qty),
      }));

      return {
        symbol,
        exchange: "bingx",
        bids: bids.sort((a, b) => b.price - a.price),
        asks: asks.sort((a, b) => a.price - b.price),
        timestamp: new Date(),
      };
    }

    // Futures orderbook (Swap V2 API)
    const response = await fetch(
      `${this.getBaseUrl()}/openApi/swap/v2/quote/depth?symbol=${symbol}&limit=${depth}`
    );
    const data = await response.json() as {
      code: number;
      data: {
        bids: Array<{ price: string; qty: string }>;
        asks: Array<{ price: string; qty: string }>;
      };
    };

    if (data.code !== 0) {
      throw new Error(`BingX futures orderbook error: ${data.code}`);
    }

    const bids: OrderbookEntry[] = (data.data?.bids || []).map((b) => ({
      price: parseFloat(b.price),
      quantity: parseFloat(b.qty),
    }));

    const asks: OrderbookEntry[] = (data.data?.asks || []).map((a) => ({
      price: parseFloat(a.price),
      quantity: parseFloat(a.qty),
    }));

    return {
      symbol,
      exchange: "bingx",
      bids: bids.sort((a, b) => b.price - a.price),
      asks: asks.sort((a, b) => a.price - b.price),
      timestamp: new Date(),
    };
  }

  // ==================== DEMO SPECIFIC ====================

  /**
   * Get VST balance for demo trading
   */
  async getVSTBalance(): Promise<{ available: number; total: number }> {
    const accountInfo = await this.getAccountInfo();
    const vstBalance = accountInfo.balances.find((b) => b.currency === "VST");
    
    return {
      available: vstBalance?.available || 0,
      total: vstBalance?.total || 0,
    };
  }

  /**
   * Check if VST recharge is available
   * Available every 7 days if balance < 20,000 VST
   */
  async checkRechargeStatus(): Promise<{
    eligible: boolean;
    currentBalance: number;
    minRequired: number;
  }> {
    const { available } = await this.getVSTBalance();
    
    return {
      eligible: available < 20000,
      currentBalance: available,
      minRequired: 20000,
    };
  }

  /**
   * Get trade history for demo account
   */
  async getTradeHistory(symbol?: string): Promise<unknown[]> {
    const endpoint = this.marketType === "spot"
      ? "/openApi/spot/v1/trade/myTrades"
      : "/openApi/swap/v2/trade/userTradeRecord";

    const data = await this.signedRequest("GET", endpoint, {
      symbol,
    });

    return data as unknown[];
  }

  /**
   * Set position mode (One-Way or Hedge)
   */
  async setPositionMode(hedgeMode: boolean): Promise<{ success: boolean }> {
    await this.signedRequest("POST", "/openApi/swap/v2/trade/positionSide/dual", {
      dualSidePosition: hedgeMode ? "true" : "false",
    });
    return { success: true };
  }

  // ==================== CONNECTION TEST ====================

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAccountInfo();
      return { 
        success: true, 
        message: this.demoMode 
          ? "Demo connection successful (VST balance)" 
          : "Connection successful" 
      };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : "Connection failed" 
      };
    }
  }
  // ==================== POSITION SYNC METHODS ====================

  async getFuturesPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
    // Temporarily switch to futures if needed
    const originalMarketType = this.marketType;
    if (this.marketType === "spot") {
      (this as any).marketType = "futures";
    }

    try {
      const data = await this.signedRequest("GET", "/openApi/swap/v2/user/positions", {}) as Array<{
        symbol: string;
        positionSide: string;
        positionAmt: string;
        entryPrice: string;
        markPrice: string;
        unRealizedProfit: string;
        leverage: string;
        initialMargin: string;
        liquidationPrice: string;
        updateTime: string;
      }>;

      return (data || [])
        .filter((p) => parseFloat(p.positionAmt) !== 0)
        .map((p) => ({
          symbol: p.symbol,
          direction: p.positionSide.toLowerCase() === "long" ? "LONG" as const : "SHORT" as const,
          size: Math.abs(parseFloat(p.positionAmt)),
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          unrealizedPnl: parseFloat(p.unRealizedProfit),
          leverage: parseInt(p.leverage),
          marginMode: "CROSS" as const, // BingX defaults to cross
          liquidationPrice: parseFloat(p.liquidationPrice) || undefined,
          updatedAt: new Date(parseInt(p.updateTime)),
        }));
    } finally {
      // Restore original market type
      if (originalMarketType === "spot") {
        (this as any).marketType = originalMarketType;
      }
    }
  }

  async getSpotPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
    const accountInfo = await this.getAccountInfo();
    const positions: import("../position-sync-service").ExchangePosition[] = [];

    for (const balance of accountInfo.balances) {
      // Skip USDT and VST (demo currency), focus on actual crypto holdings
      const currency = balance.currency;
      if (balance.total > 0 && 
          currency !== "USDT" && 
          currency !== "VST" && 
          !currency.startsWith("LD")) {
        const symbol = `${currency}USDT`;
        
        try {
          const ticker = await this.getTicker(symbol);
          positions.push({
            symbol,
            direction: "LONG" as const,
            size: balance.total,
            entryPrice: 0, // Unknown for spot - would need trade history
            markPrice: ticker.last,
            unrealizedPnl: 0,
            leverage: 1,
            updatedAt: new Date(),
          });
        } catch {
          // Skip if we can't get price
        }
      }
    }

    return positions;
  }

  // ==================== MARK PRICE ====================

  async getMarkPrice(symbol: string): Promise<import("./types").MarkPrice> {
    // BingX uses different symbol format for futures
    const apiSymbol = this.marketType === "spot" ? symbol : symbol.replace("USDT", "-USDT");
    
    // Get mark price from price endpoint
    const response = await fetch(
      `${this.getBaseUrl()}/openApi/swap/v2/quote/price?symbol=${apiSymbol}`
    );
    const data = await response.json() as {
      code: number;
      data: {
        symbol: string;
        markPrice?: string;
        indexPrice?: string;
        price?: string;
        fundingRate?: string;
        nextFundingTime?: string;
      };
    };

    if (data.code !== 0) {
      throw new Error(`Failed to get mark price for ${symbol}`);
    }

    // BingX doesn't provide index price in public API
    // Mark price is returned as 'price' in the response
    const markPrice = parseFloat(data.data.markPrice || data.data.price || "0");
    
    // Try to get index price from funding rate endpoint
    let indexPrice = 0;
    try {
      const fundingResponse = await fetch(
        `${this.getBaseUrl()}/openApi/swap/v2/quote/fundingRate?symbol=${apiSymbol}`
      );
      const fundingData = await fundingResponse.json() as {
        code: number;
        data: Array<{
          markPrice?: string;
          indexPrice?: string;
        }>;
      };
      
      if (fundingData.code === 0 && fundingData.data?.[0]) {
        // BingX funding rate endpoint also only returns markPrice, not indexPrice
        // Index price is not publicly available
      }
    } catch {
      // Index price not available
    }

    return {
      symbol,
      exchange: "bingx",
      markPrice,
      indexPrice, // BingX doesn't provide index price publicly
      fundingRate: data.data.fundingRate ? parseFloat(data.data.fundingRate) : undefined,
      nextFundingTime: data.data.nextFundingTime ? new Date(parseInt(data.data.nextFundingTime)) : undefined,
      timestamp: new Date(),
    };
  }

  // ==================== OPEN ORDERS ====================

  async getOpenOrders(symbol?: string): Promise<import("./types").OpenOrder[]> {
    const endpoint = this.marketType === "spot"
      ? "/openApi/spot/v1/trade/openOrders"
      : "/openApi/swap/v2/trade/openOrders";

    const params: Record<string, unknown> = {};
    if (symbol) {
      params.symbol = this.marketType === "spot" ? symbol : symbol.replace("USDT", "-USDT");
    }

    const data = await this.signedRequest("GET", endpoint, params) as {
      orders?: Array<{
        orderId: string;
        clientOrderId?: string;
        symbol: string;
        side: string;
        type: string;
        status: string;
        price: string;
        avgPrice?: string;
        origQty: string;
        executedQty?: string;
        time: number;
        updateTime: number;
        stopPrice?: string;
        positionSide?: string;
      }>;
    };

    return (data.orders || []).map((o) => ({
      id: o.orderId,
      clientOrderId: o.clientOrderId,
      exchange: "bingx" as const,
      symbol: o.symbol.replace("-USDT", "USDT"),
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.type.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.status),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.avgPrice || "0"),
      quantity: parseFloat(o.origQty),
      filledQuantity: parseFloat(o.executedQty || "0"),
      remainingQuantity: parseFloat(o.origQty) - parseFloat(o.executedQty || "0"),
      fee: 0,
      feeCurrency: this.demoMode ? "VST" : "USDT",
      createdAt: new Date(o.time),
      updatedAt: new Date(o.updateTime),
      stopPrice: o.stopPrice ? parseFloat(o.stopPrice) : undefined,
      positionSide: o.positionSide?.toLowerCase() as "long" | "short" | undefined,
      isDemo: this.demoMode,
    }));
  }

  private parseOrderStatus(status: string): "open" | "partial" | "filled" | "cancelled" | "expired" | "rejected" {
    const statusMap: Record<string, "open" | "partial" | "filled" | "cancelled" | "expired" | "rejected"> = {
      "NEW": "open",
      "PARTIALLY_FILLED": "partial",
      "FILLED": "filled",
      "CANCELED": "cancelled",
      "EXPIRED": "expired",
      "REJECTED": "rejected",
    };
    return statusMap[status] || "open";
  }

  // ==================== ORDER HISTORY ====================

  async getOrderHistory(
    symbol?: string,
    limit: number = 100,
    startTime?: Date,
    endTime?: Date
  ): Promise<import("./types").OrderHistoryItem[]> {
    const endpoint = this.marketType === "spot"
      ? "/openApi/spot/v1/trade/historyOrders"
      : "/openApi/swap/v1/trade/allOrders";

    const params: Record<string, unknown> = { limit };
    if (symbol) {
      params.symbol = this.marketType === "spot" ? symbol : symbol.replace("USDT", "-USDT");
    }
    if (startTime) params.startTime = startTime.getTime();
    if (endTime) params.endTime = endTime.getTime();

    const data = await this.signedRequest("GET", endpoint, params) as {
      orders?: Array<{
        orderId: string;
        clientOrderId?: string;
        symbol: string;
        side: string;
        type: string;
        status: string;
        price: string;
        avgPrice?: string;
        origQty: string;
        executedQty?: string;
        cumQuote?: string;
        commission?: string;
        commissionAsset?: string;
        realizedProfit?: string;
        time: number;
        updateTime: number;
        stopPrice?: string;
        positionSide?: string;
      }>;
    };

    return (data.orders || []).map((o) => ({
      id: o.orderId,
      clientOrderId: o.clientOrderId,
      exchange: "bingx" as const,
      symbol: o.symbol.replace("-USDT", "USDT"),
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.type.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.status),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.avgPrice || "0"),
      quantity: parseFloat(o.origQty),
      filledQuantity: parseFloat(o.executedQty || "0"),
      remainingQuantity: parseFloat(o.origQty) - parseFloat(o.executedQty || "0"),
      fee: parseFloat(o.commission || "0"),
      feeCurrency: o.commissionAsset || (this.demoMode ? "VST" : "USDT"),
      realizedPnl: o.realizedProfit ? parseFloat(o.realizedProfit) : undefined,
      createdAt: new Date(o.time),
      updatedAt: new Date(o.updateTime),
      stopPrice: o.stopPrice ? parseFloat(o.stopPrice) : undefined,
      positionSide: o.positionSide?.toLowerCase() as "long" | "short" | undefined,
      isDemo: this.demoMode,
    }));
  }

  // ==================== BALANCE HISTORY ====================

  async getBalanceHistory(params?: import("./types").BalanceHistoryParams): Promise<import("./types").BalanceHistoryItem[]> {
    // BingX doesn't have a dedicated balance history API
    // We can use income history for futures
    if (this.marketType === "spot") {
      return [];
    }

    try {
      const requestParams: Record<string, unknown> = {
        limit: params?.limit || 100,
      };
      if (params?.startTime) requestParams.startTime = params.startTime.getTime();
      if (params?.endTime) requestParams.endTime = params.endTime.getTime();

      const data = await this.signedRequest("GET", "/openApi/swap/v1/user/income", requestParams) as {
        income?: Array<{
          incomeId?: string;
          symbol?: string;
          incomeType: string;
          income: string;
          asset: string;
          time: number;
          tranId?: string;
        }>;
      };

      return (data.income || []).map((item, index) => ({
        id: item.incomeId || `bingx-income-${index}`,
        exchange: "bingx" as const,
        accountId: "",
        currency: item.asset,
        changeType: this.mapIncomeTypeToChangeType(item.incomeType),
        amount: parseFloat(item.income),
        balanceBefore: 0,
        balanceAfter: 0,
        relatedId: item.tranId,
        relatedType: item.incomeType.includes("REALIZED_PNL") ? "TRADE" : "FUNDING",
        timestamp: new Date(item.time),
        description: item.incomeType,
      }));
    } catch {
      return [];
    }
  }

  private mapIncomeTypeToChangeType(type: string): import("./types").BalanceHistoryItem['changeType'] {
    switch (type) {
      case "TRANSFER":
        return "TRANSFER";
      case "REALIZED_PNL":
        return "TRADE";
      case "FUNDING_FEE":
        return "FUNDING";
      case "COMMISSION":
      case "COMMISSION_REBATE":
        return "FEE";
      case "LIQUIDATION":
        return "LIQUIDATION";
      default:
        return "OTHER";
    }
  }

  // ==================== OPEN INTEREST ====================

  async getOpenInterest(symbol: string): Promise<import("./types").OpenInterest> {
    if (this.marketType === "spot") {
      throw new Error("Open Interest is only available for futures");
    }

    // BingX uses BTC-USDT format for futures
    const apiSymbol = symbol.replace("USDT", "-USDT");
    
    const response = await fetch(
      `${this.getBaseUrl()}/openApi/swap/v2/quote/openInterest?symbol=${apiSymbol}`
    );
    const data = await response.json() as {
      code: number;
      msg: string;
      data: {
        openInterest: string;
        symbol: string;
        time: number;
      };
    };

    if (data.code !== 0) {
      throw new Error(`Failed to get open interest for ${symbol}: ${data.msg || data.code}`);
    }

    // BingX returns openInterest in USDT value
    const openInterestUsd = parseFloat(data.data.openInterest);

    // Get current price to calculate OI in contracts
    let price = 0;
    try {
      const ticker = await this.getTicker(symbol);
      price = ticker.last;
    } catch {
      // Price not available
    }

    // OI in contracts = OI in USDT / price
    const openInterest = price > 0 ? openInterestUsd / price : 0;

    return {
      symbol,
      exchange: "bingx",
      openInterest,
      openInterestUsd,
      timestamp: new Date(data.data.time),
      price,
    };
  }
}
