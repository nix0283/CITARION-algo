/**
 * Binance Exchange Client
 * 
 * Supports:
 * - Spot Trading (api.binance.com)
 * - USDT-M Futures (fapi.binance.com)
 * - Coin-M Inverse (dapi.binance.com)
 * - Testnet for all markets
 * 
 * Testnet Details:
 * - Futures: testnet.binancefuture.com (15,000 USDT initial balance)
 * - Spot: testnet.binance.vision
 * - Requires separate registration on testnet
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
  OrderSide,
  PositionSide,
  TradingMode,
} from "./types";

export class BinanceClient extends BaseExchangeClient {
  private recvWindow: number = 5000;

  constructor(
    credentials: ApiCredentials,
    marketType: MarketType = "futures",
    testnet: boolean = false,
    tradingMode?: TradingMode
  ) {
    super("binance", credentials, marketType, testnet, tradingMode);
  }

  // ==================== SIGNING ====================

  private async signedRequest(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    params: Record<string, unknown> = {},
    isOrder: boolean = false
  ): Promise<unknown> {
    const timestamp = Date.now();
    const allParams = { ...params, timestamp, recvWindow: this.recvWindow };
    
    const queryString = Object.entries(allParams)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");

    const signature = crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(queryString)
      .digest("hex");

    const signedParams = { ...allParams, signature };
    
    const url = new URL(endpoint, this.getBaseUrl());
    
    if (method === "GET") {
      Object.entries(signedParams).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    await this.rateLimit(1, isOrder);

    const response = await fetch(url.toString(), {
      method,
      headers: {
        "X-MBX-APIKEY": this.credentials.apiKey,
        "Content-Type": "application/json",
      },
      body: method !== "GET" ? JSON.stringify(signedParams) : undefined,
    });

    const data = await response.json();

    // Check for rate limit in headers (important for testnet)
    const usedWeight = response.headers.get("X-MBX-USED-WEIGHT-1M");
    if (usedWeight && parseInt(usedWeight) > 1000) {
      console.warn(`[Binance] Rate limit usage: ${usedWeight}/1200`);
    }

    if (!response.ok) {
      throw this.parseError(data);
    }

    return data;
  }

  // ==================== ACCOUNT INFO ====================

  async getAccountInfo(): Promise<AccountInfo> {
    let endpoint: string;
    
    if (this.marketType === "spot") {
      endpoint = "/api/v3/account";
    } else if (this.marketType === "futures") {
      endpoint = "/fapi/v2/account";
    } else {
      endpoint = "/dapi/v2/account";
    }

    const data = await this.signedRequest("GET", endpoint) as {
      balances?: Array<{ asset: string; free: string; locked: string }>;
      assets?: Array<{ asset: string; walletBalance: string; availableBalance: string }>;
      totalWalletBalance?: string;
      totalAvailableBalance?: string;
      totalUnrealizedProfit?: string;
    };

    const balances: Balance[] = [];

    if (this.marketType === "spot" && data.balances) {
      for (const b of data.balances) {
        const total = parseFloat(b.free) + parseFloat(b.locked);
        if (total > 0) {
          balances.push({
            currency: b.asset,
            total,
            available: parseFloat(b.free),
            frozen: parseFloat(b.locked),
            isDemo: this.isTestnet(),
          });
        }
      }
    } else if (data.assets) {
      for (const a of data.assets) {
        const total = parseFloat(a.walletBalance);
        if (total > 0) {
          balances.push({
            currency: a.asset,
            total,
            available: parseFloat(a.availableBalance),
            frozen: total - parseFloat(a.availableBalance),
            isDemo: this.isTestnet(),
          });
        }
      }
    }

    return {
      exchange: "binance",
      balances,
      totalEquity: parseFloat(data.totalWalletBalance || "0"),
      availableMargin: parseFloat(data.totalAvailableBalance || "0"),
      marginUsed: 0,
      unrealizedPnl: parseFloat(data.totalUnrealizedProfit || "0"),
      isDemo: this.isTestnet(),
    };
  }

  // ==================== ORDER MANAGEMENT ====================

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    try {
      let endpoint: string;
      const orderParams: Record<string, unknown> = {
        symbol: params.symbol,
        side: params.side.toUpperCase() as OrderSide,
        type: params.type.toUpperCase(),
        quantity: params.quantity,
      };

      if (this.marketType === "spot") {
        endpoint = "/api/v3/order";
        if (params.type === "limit") {
          orderParams.timeInForce = params.timeInForce || "GTC";
          orderParams.price = params.price;
        }
      } else {
        endpoint = this.marketType === "futures" 
          ? "/fapi/v1/order" 
          : "/dapi/v1/order";
        
        if (params.positionSide && params.positionSide !== "both") {
          orderParams.positionSide = params.positionSide.toUpperCase();
        }
        
        if (params.reduceOnly) {
          orderParams.reduceOnly = true;
        }

        // Stop orders
        if (params.type === "stop_market" || params.type === "stop_limit") {
          orderParams.stopPrice = params.stopPrice;
        }
      }

      if (params.clientOrderId) {
        orderParams.newClientOrderId = params.clientOrderId;
      }

      if (params.price && params.type !== "market") {
        orderParams.price = params.price;
      }

      const data = await this.signedRequest("POST", endpoint, orderParams, true) as {
        orderId: number;
        clientOrderId?: string;
        symbol: string;
        status: string;
        price: string;
        avgPrice?: string;
        origQty: string;
        executedQty: string;
        type: string;
        side: string;
        updateTime: number;
      };

      return {
        success: true,
        order: {
          id: String(data.orderId),
          clientOrderId: data.clientOrderId,
          exchange: "binance",
          symbol: data.symbol,
          side: data.side.toLowerCase() as OrderSide,
          type: data.type.toLowerCase() as any,
          status: this.parseOrderStatus(data.status),
          price: parseFloat(data.price) || parseFloat(data.avgPrice || "0"),
          averagePrice: parseFloat(data.avgPrice || "0"),
          quantity: parseFloat(data.origQty),
          filledQuantity: parseFloat(data.executedQty),
          remainingQuantity: parseFloat(data.origQty) - parseFloat(data.executedQty),
          createdAt: new Date(),
          updatedAt: new Date(data.updateTime),
          fee: 0,
          feeCurrency: "",
          isDemo: this.isTestnet(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async cancelOrder(params: CancelOrderParams): Promise<OrderResult> {
    try {
      let endpoint: string;
      const cancelParams: Record<string, unknown> = {
        symbol: params.symbol,
      };

      if (this.marketType === "spot") {
        endpoint = "/api/v3/order";
      } else {
        endpoint = this.marketType === "futures" 
          ? "/fapi/v1/order" 
          : "/dapi/v1/order";
      }

      if (params.orderId) {
        cancelParams.orderId = params.orderId;
      }
      if (params.clientOrderId) {
        cancelParams.origClientOrderId = params.clientOrderId;
      }

      const data = await this.signedRequest("DELETE", endpoint, cancelParams) as {
        orderId: number;
        status: string;
      };

      return {
        success: true,
        order: {
          id: String(data.orderId),
          exchange: "binance",
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
          isDemo: this.isTestnet(),
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
    if (this.marketType === "spot") {
      throw new Error("Positions are not available for spot trading");
    }

    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol) || null;
  }

  async getPositions(): Promise<Position[]> {
    if (this.marketType === "spot") {
      return [];
    }

    const endpoint = this.marketType === "futures" 
      ? "/fapi/v2/positionRisk" 
      : "/dapi/v2/positionRisk";

    const data = await this.signedRequest("GET", endpoint) as Array<{
      symbol: string;
      positionSide: string;
      positionAmt: string;
      entryPrice: string;
      markPrice: string;
      unRealizedProfit: string;
      liquidationPrice: string;
      leverage: string;
      marginType: string;
      positionInitialMargin: string;
      updateTime: number;
    }>;

    return data
      .filter((p) => parseFloat(p.positionAmt) !== 0)
      .map((p) => ({
        id: `${p.symbol}-${p.positionSide}`,
        exchange: "binance" as const,
        symbol: p.symbol,
        side: p.positionSide.toLowerCase() as PositionSide,
        quantity: Math.abs(parseFloat(p.positionAmt)),
        entryPrice: parseFloat(p.entryPrice),
        markPrice: parseFloat(p.markPrice),
        unrealizedPnl: parseFloat(p.unRealizedProfit),
        realizedPnl: 0,
        leverage: parseInt(p.leverage),
        marginMode: p.marginType.toLowerCase() === "isolated" ? "isolated" as const : "cross" as const,
        margin: parseFloat(p.positionInitialMargin),
        liquidationPrice: parseFloat(p.liquidationPrice) || undefined,
        createdAt: new Date(),
        updatedAt: new Date(p.updateTime),
      }));
  }

  async closePosition(params: ClosePositionParams): Promise<OrderResult> {
    const position = await this.getPosition(params.symbol);
    if (!position) {
      return { success: false, error: "Position not found" };
    }

    const closeSide = position.side === "long" ? "sell" : "buy";
    const quantity = params.quantity || position.quantity;

    return this.createOrder({
      symbol: params.symbol,
      side: closeSide,
      type: "market",
      quantity,
      positionSide: position.side,
      reduceOnly: true,
    });
  }

  async setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
    if (this.marketType === "spot") {
      throw new Error("Leverage is not available for spot trading");
    }

    const endpoint = this.marketType === "futures" 
      ? "/fapi/v1/leverage" 
      : "/dapi/v1/leverage";

    await this.signedRequest("POST", endpoint, {
      symbol: params.symbol,
      leverage: params.leverage,
    });

    // Set margin mode if specified
    if (params.marginMode) {
      const marginEndpoint = this.marketType === "futures" 
        ? "/fapi/v1/marginType" 
        : "/dapi/v1/marginType";
      
      try {
        await this.signedRequest("POST", marginEndpoint, {
          symbol: params.symbol,
          marginType: params.marginMode === "isolated" ? "ISOLATED" : "CROSSED",
        });
      } catch {
        // Ignore if already set
      }
    }

    return { success: true, leverage: params.leverage };
  }

  // ==================== POSITION MODE ====================

  /**
   * Get current position mode (One-Way or Hedge)
   */
  async getPositionMode(): Promise<{ dualSidePosition: boolean }> {
    const endpoint = this.marketType === "futures" 
      ? "/fapi/v1/positionSide/dual" 
      : "/dapi/v1/positionSide/dual";
    
    const data = await this.signedRequest("GET", endpoint) as {
      dualSidePosition: boolean;
    };
    
    return data;
  }

  /**
   * Set position mode
   */
  async setPositionMode(hedgeMode: boolean): Promise<void> {
    const endpoint = this.marketType === "futures" 
      ? "/fapi/v1/positionSide/dual" 
      : "/dapi/v1/positionSide/dual";
    
    await this.signedRequest("POST", endpoint, {
      dualSidePosition: hedgeMode,
    });
  }

  // ==================== MARKET DATA ====================

  async getTicker(symbol: string): Promise<Ticker> {
    let endpoint: string;
    
    if (this.marketType === "spot") {
      endpoint = `/api/v3/ticker/24hr?symbol=${symbol}`;
    } else if (this.marketType === "futures") {
      endpoint = `/fapi/v1/ticker/24hr?symbol=${symbol}`;
    } else {
      endpoint = `/dapi/v1/ticker/24hr?symbol=${symbol}`;
    }

    const response = await fetch(`${this.getBaseUrl()}${endpoint}`);
    const data = await response.json() as {
      symbol: string;
      bidPrice: string;
      askPrice: string;
      lastPrice: string;
      highPrice: string;
      lowPrice: string;
      volume: string;
      priceChange: string;
      priceChangePercent: string;
    };

    return {
      symbol: data.symbol,
      exchange: "binance",
      bid: parseFloat(data.bidPrice),
      ask: parseFloat(data.askPrice),
      last: parseFloat(data.lastPrice),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume24h: parseFloat(data.volume),
      change24h: parseFloat(data.priceChange),
      changePercent24h: parseFloat(data.priceChangePercent),
      timestamp: new Date(),
    };
  }

  async getFundingRate(symbol: string): Promise<FundingRate> {
    if (this.marketType !== "futures") {
      throw new Error("Funding rate is only available for futures");
    }

    const response = await fetch(
      `${this.getBaseUrl()}/fapi/v1/premiumIndex?symbol=${symbol}`
    );
    const data = await response.json() as {
      symbol: string;
      markPrice: string;
      indexPrice: string;
      lastFundingRate: string;
      nextFundingTime: number;
    };

    return {
      symbol: data.symbol,
      exchange: "binance",
      rate: parseFloat(data.lastFundingRate),
      nextFundingTime: new Date(data.nextFundingTime),
      markPrice: parseFloat(data.markPrice),
      indexPrice: parseFloat(data.indexPrice),
      timestamp: new Date(),
    };
  }

  async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
    let endpoint: string;
    
    if (this.marketType === "spot") {
      endpoint = `/api/v3/depth?symbol=${symbol}&limit=${depth}`;
    } else if (this.marketType === "futures") {
      endpoint = `/fapi/v1/depth?symbol=${symbol}&limit=${depth}`;
    } else {
      endpoint = `/dapi/v1/depth?symbol=${symbol}&limit=${depth}`;
    }

    const response = await fetch(`${this.getBaseUrl()}${endpoint}`);
    const data = await response.json() as {
      bids: Array<[string, string]>;
      asks: Array<[string, string]>;
      lastUpdateId?: number;
    };

    const bids: OrderbookEntry[] = (data.bids || []).map(([price, qty]) => ({
      price: parseFloat(price),
      quantity: parseFloat(qty),
    }));

    const asks: OrderbookEntry[] = (data.asks || []).map(([price, qty]) => ({
      price: parseFloat(price),
      quantity: parseFloat(qty),
    }));

    return {
      symbol,
      exchange: "binance",
      bids: bids.sort((a, b) => b.price - a.price), // Descending
      asks: asks.sort((a, b) => a.price - b.price), // Ascending
      timestamp: new Date(),
    };
  }

  // ==================== CONNECTION TEST ====================

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const endpoint = this.marketType === "spot" 
        ? "/api/v3/ping" 
        : this.marketType === "futures" 
        ? "/fapi/v1/ping" 
        : "/dapi/v1/ping";

      const response = await fetch(`${this.getBaseUrl()}${endpoint}`);
      const data = await response.json();
      
      if (data) {
        // Test API key
        await this.getAccountInfo();
        return { 
          success: true, 
          message: this.isTestnet() 
            ? "Testnet connection successful" 
            : "Connection successful" 
        };
      }
      
      return { success: false, message: "Invalid response" };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : "Connection failed" 
      };
    }
  }

  // ==================== HELPERS ====================

  private parseOrderStatus(status: string): Order["status"] {
    const statusMap: Record<string, Order["status"]> = {
      NEW: "open",
      PARTIALLY_FILLED: "partial",
      FILLED: "filled",
      CANCELED: "cancelled",
      EXPIRED: "expired",
      REJECTED: "rejected",
    };
    return statusMap[status] || "open";
  }

  // ==================== POSITION SYNC METHODS ====================

  async getFuturesPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
    if (this.marketType !== "futures") {
      // Temporarily switch to futures
      const originalMarketType = this.marketType;
      (this as any).marketType = "futures";
      
      try {
        const positions = await this.getPositions();
        return positions
          .filter(p => p.quantity > 0)
          .map(p => ({
            symbol: p.symbol,
            direction: p.side === "long" ? "LONG" as const : "SHORT" as const,
            size: p.quantity,
            entryPrice: p.entryPrice,
            markPrice: p.markPrice,
            unrealizedPnl: p.unrealizedPnl,
            leverage: p.leverage,
            marginMode: p.marginMode ? (p.marginMode.toUpperCase() as "ISOLATED" | "CROSS") : undefined,
            liquidationPrice: p.liquidationPrice,
            updatedAt: p.updatedAt,
          }));
      } finally {
        (this as any).marketType = originalMarketType;
      }
    }

    const positions = await this.getPositions();
    return positions
      .filter(p => p.quantity > 0)
      .map(p => ({
        symbol: p.symbol,
        direction: p.side === "long" ? "LONG" as const : "SHORT" as const,
        size: p.quantity,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
        unrealizedPnl: p.unrealizedPnl,
        leverage: p.leverage,
        marginMode: p.marginMode ? (p.marginMode.toUpperCase() as "ISOLATED" | "CROSS") : undefined,
        liquidationPrice: p.liquidationPrice,
        updatedAt: p.updatedAt,
      }));
  }

  async getSpotPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
    // For spot, we get balances and treat non-zero balances as "positions"
    const accountInfo = await this.getAccountInfo();
    const positions: import("../position-sync-service").ExchangePosition[] = [];

    for (const balance of accountInfo.balances) {
      if (balance.total > 0 && balance.currency !== "USDT" && !balance.currency.startsWith("LD")) {
        // Get current price (approximate - in production you'd want to fetch actual prices)
        const symbol = `${balance.currency}USDT`;
        
        try {
          const ticker = await this.getTicker(symbol);
          const currentValue = balance.total * ticker.last;
          
          positions.push({
            symbol,
            direction: "LONG",
            size: balance.total,
            entryPrice: 0, // Unknown for spot - would need trade history
            markPrice: ticker.last,
            unrealizedPnl: 0, // Unknown without entry price
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
    const endpoint = this.marketType === "spot" 
      ? `/api/v3/ticker/24hr?symbol=${symbol}`
      : this.marketType === "futures"
      ? `/fapi/v1/premiumIndex?symbol=${symbol}`
      : `/dapi/v1/premiumIndex?symbol=${symbol}`;

    const response = await fetch(`${this.getBaseUrl()}${endpoint}`);
    const data = await response.json() as {
      symbol: string;
      markPrice?: string;
      indexPrice?: string;
      lastPrice?: string;
      estimatedSettlePrice?: string;
      time?: number;
      closeTime?: number;
    };

    if (!response.ok) {
      throw new Error(`Failed to get mark price: ${JSON.stringify(data)}`);
    }

    return {
      symbol,
      exchange: "binance",
      markPrice: parseFloat(data.markPrice || data.lastPrice || "0"),
      indexPrice: parseFloat(data.indexPrice || "0"),
      estimatedSettlePrice: data.estimatedSettlePrice ? parseFloat(data.estimatedSettlePrice) : undefined,
      timestamp: new Date(data.time || data.closeTime || Date.now()),
    };
  }

  // ==================== OPEN ORDERS ====================

  async getOpenOrders(symbol?: string): Promise<import("./types").OpenOrder[]> {
    const endpoint = this.marketType === "spot" 
      ? "/api/v3/openOrders" 
      : this.marketType === "futures"
      ? "/fapi/v1/openOrders"
      : "/dapi/v1/openOrders";

    const params: Record<string, unknown> = {};
    if (symbol) params.symbol = symbol;

    const data = await this.signedRequest("GET", endpoint, params) as Array<{
      orderId: number;
      clientOrderId: string;
      symbol: string;
      side: string;
      type: string;
      status: string;
      price: string;
      avgPrice?: string;
      origQty: string;
      executedQty: string;
      time: number;
      updateTime: number;
      stopPrice?: string;
      timeInForce?: string;
      positionSide?: string;
      reduceOnly?: boolean;
    }>;

    return data.map((o) => ({
      id: String(o.orderId),
      clientOrderId: o.clientOrderId,
      exchange: "binance" as const,
      symbol: o.symbol,
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.type.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.status),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.avgPrice || "0"),
      quantity: parseFloat(o.origQty),
      filledQuantity: parseFloat(o.executedQty),
      remainingQuantity: parseFloat(o.origQty) - parseFloat(o.executedQty),
      fee: 0,
      feeCurrency: "",
      createdAt: new Date(o.time),
      updatedAt: new Date(o.updateTime),
      stopPrice: o.stopPrice ? parseFloat(o.stopPrice) : undefined,
      timeInForce: o.timeInForce,
      reduceOnly: o.reduceOnly,
      positionSide: o.positionSide?.toLowerCase() as "long" | "short" | undefined,
      isDemo: this.isTestnet(),
    }));
  }

  // ==================== ORDER HISTORY ====================

  async getOrderHistory(
    symbol?: string, 
    limit: number = 100,
    startTime?: Date,
    endTime?: Date
  ): Promise<import("./types").OrderHistoryItem[]> {
    const endpoint = this.marketType === "spot"
      ? "/api/v3/allOrders"
      : this.marketType === "futures"
      ? "/fapi/v1/allOrders"
      : "/dapi/v1/allOrders";

    const params: Record<string, unknown> = { limit };
    if (symbol) params.symbol = symbol;
    if (startTime) params.startTime = startTime.getTime();
    if (endTime) params.endTime = endTime.getTime();
    
    // Binance requires symbol for spot orders
    if (this.marketType === "spot" && !symbol) {
      // Return empty for spot without symbol - Binance limitation
      return [];
    }

    const data = await this.signedRequest("GET", endpoint, params) as Array<{
      orderId: number;
      clientOrderId: string;
      symbol: string;
      side: string;
      type: string;
      status: string;
      price: string;
      avgPrice?: string;
      avgPrice?: string;
      origQty: string;
      executedQty: string;
      cumQuote?: string;
      time: number;
      updateTime: number;
      stopPrice?: string;
      timeInForce?: string;
      positionSide?: string;
      reduceOnly?: boolean;
      commission?: string;
      commissionAsset?: string;
      realizedProfit?: string;
    }>;

    return data.map((o) => ({
      id: String(o.orderId),
      clientOrderId: o.clientOrderId,
      exchange: "binance" as const,
      symbol: o.symbol,
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.type.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.status),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.avgPrice || "0"),
      quantity: parseFloat(o.origQty),
      filledQuantity: parseFloat(o.executedQty),
      remainingQuantity: parseFloat(o.origQty) - parseFloat(o.executedQty),
      fee: parseFloat(o.commission || "0"),
      feeCurrency: o.commissionAsset || "USDT",
      realizedPnl: o.realizedProfit ? parseFloat(o.realizedProfit) : undefined,
      createdAt: new Date(o.time),
      updatedAt: new Date(o.updateTime),
      stopPrice: o.stopPrice ? parseFloat(o.stopPrice) : undefined,
      timeInForce: o.timeInForce,
      reduceOnly: o.reduceOnly,
      positionSide: o.positionSide?.toLowerCase() as "long" | "short" | undefined,
      isDemo: this.isTestnet(),
    }));
  }

  // ==================== BALANCE HISTORY ====================

  async getBalanceHistory(params?: import("./types").BalanceHistoryParams): Promise<import("./types").BalanceHistoryItem[]> {
    // Binance doesn't have a direct balance history API
    // We can use /sapi/v1/asset/getFundingAsset or /sapi/v1/capital/deposit/hisrec
    // For now, return empty as this requires special permissions
    // Alternative: Use income history for futures
    if (this.marketType === "futures") {
      try {
        const data = await this.signedRequest("GET", "/fapi/v1/income", {
          limit: params?.limit || 100,
          startTime: params?.startTime?.getTime(),
          endTime: params?.endTime?.getTime(),
        }) as Array<{
          income: string;
          asset: string;
          time: number;
          type: string;
          info?: string;
          tranId?: number;
        }>;

        return data.map((item, index) => ({
          id: `binance-income-${index}`,
          exchange: "binance" as const,
          accountId: "",
          currency: item.asset,
          changeType: this.mapIncomeTypeToChangeType(item.type),
          amount: parseFloat(item.income),
          balanceBefore: 0, // Not provided by Binance
          balanceAfter: 0, // Not provided by Binance
          relatedId: item.tranId ? String(item.tranId) : undefined,
          relatedType: item.type.includes("REALIZED_PNL") ? "TRADE" : "FUNDING",
          timestamp: new Date(item.time),
          description: item.info || item.type,
        }));
      } catch {
        return [];
      }
    }
    
    return [];
  }

  private mapIncomeTypeToChangeType(type: string): import("./types").BalanceHistoryItem['changeType'] {
    switch (type) {
      case "TRANSFER":
        return "TRANSFER";
      case "WELCOME_BONUS":
      case "REALIZED_PNL":
        return "TRADE";
      case "FUNDING_FEE":
        return "FUNDING";
      case "COMMISSION":
      case "COMMISSION_REBATE":
        return "FEE";
      default:
        return "OTHER";
    }
  }

  // ==================== OPEN INTEREST ====================

  async getOpenInterest(symbol: string): Promise<import("./types").OpenInterest> {
    if (this.marketType === "spot") {
      throw new Error("Open Interest is only available for futures");
    }

    const endpoint = this.marketType === "futures" 
      ? `/fapi/v1/openInterest?symbol=${symbol}`
      : `/dapi/v1/openInterest?symbol=${symbol}`;

    const response = await fetch(`${this.getBaseUrl()}${endpoint}`);
    const data = await response.json() as {
      symbol: string;
      openInterest: string;
      time: number;
    };

    if (!response.ok) {
      throw new Error(`Failed to get open interest: ${JSON.stringify(data)}`);
    }

    // Get current price for USD calculation
    let price = 0;
    try {
      const ticker = await this.getTicker(symbol);
      price = ticker.last;
    } catch {
      // Price not available
    }

    const openInterest = parseFloat(data.openInterest);

    return {
      symbol,
      exchange: "binance",
      openInterest,
      openInterestUsd: price > 0 ? openInterest * price : undefined,
      timestamp: new Date(data.time),
      price,
    };
  }
}
