/**
 * Bitget Exchange Client
 * 
 * Supports:
 * - Spot Trading
 * - USDT-M Futures
 * - Coin-M Inverse
 * - Demo Trading (2026): Uses S-prefixed symbols (SBTCUSDT, SETHUSDT)
 * 
 * Demo Mode Details:
 * - Uses same API endpoint: https://api.bitget.com
 * - Trading pairs with "S" prefix simulate real market
 * - Virtual balance: 50,000 SUSDT (rechargeable every 72 hours)
 * - Set leverage via POST /api/v2/mix/account/set-leverage
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
  Balance,
  Order,
  OrderSide,
  PositionSide,
  toDemoSymbol,
  isDemoSymbol,
  Orderbook,
  OrderbookEntry,
} from "./types";

export class BitgetClient extends BaseExchangeClient {
  private productType: string;
  private demoMode: boolean;

  constructor(
    credentials: ApiCredentials,
    marketType: MarketType = "futures",
    testnet: boolean = false,
    demoMode: boolean = false
  ) {
    super("bitget", credentials, marketType, testnet);
    
    this.demoMode = demoMode;
    
    if (marketType === "spot") {
      this.productType = "SPOT";
    } else if (marketType === "futures") {
      this.productType = "USDT-FUTURES";
    } else {
      this.productType = "COIN-FUTURES";
    }
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

  /**
   * Convert symbol to demo symbol if in demo mode
   */
  private getSymbol(symbol: string): string {
    if (this.demoMode) {
      return toDemoSymbol(symbol, "bitget");
    }
    return symbol;
  }

  private generateSignature(
    timestamp: string,
    method: string,
    path: string,
    body?: string
  ): string {
    const message = timestamp + method.toUpperCase() + path + (body || "");
    return crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(message)
      .digest("base64");
  }

  private getHeaders(method: string, path: string, body?: string): Record<string, string> {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, path, body);

    return {
      "ACCESS-KEY": this.credentials.apiKey,
      "ACCESS-SIGN": signature,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": this.credentials.passphrase || "",
      "Content-Type": "application/json",
      "locale": "en-US",
    };
  }

  private async signedRequest(
    method: "GET" | "POST" | "DELETE",
    path: string,
    params: Record<string, unknown> = {},
    isOrder: boolean = false
  ): Promise<unknown> {
    await this.rateLimit(1, isOrder);

    let fullPath = path;
    let body: string | undefined;

    if (method === "GET" && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
      fullPath = `${path}?${queryString}`;
    } else if (method !== "GET") {
      body = JSON.stringify(params);
    }

    const headers = this.getHeaders(method, fullPath, body);

    const response = await fetch(`${this.getBaseUrl()}${fullPath}`, {
      method,
      headers,
      body,
    });

    const data = await response.json() as {
      code: string;
      msg: string;
      data: unknown;
    };

    if (data.code !== "00000") {
      throw {
        exchange: "bitget",
        code: data.code,
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
      const data = await this.signedRequest("GET", "/api/v2/spot/account/assets") as Array<{
        coin: string;
        available: string;
        frozen: string;
      }>;

      const balances: Balance[] = data
        .filter((b) => parseFloat(b.available) > 0 || parseFloat(b.frozen) > 0)
        .map((b) => ({
          currency: b.coin,
          total: parseFloat(b.available) + parseFloat(b.frozen),
          available: parseFloat(b.available),
          frozen: parseFloat(b.frozen),
          isDemo: this.demoMode && (b.coin === "SUSDT" || isDemoSymbol(b.coin, "bitget")),
        }));

      return {
        exchange: "bitget",
        balances,
        totalEquity: balances.reduce((s, b) => s + b.total, 0),
        availableMargin: balances.find((b) => b.currency === (this.demoMode ? "SUSDT" : "USDT"))?.available || 0,
        marginUsed: 0,
        unrealizedPnl: 0,
        isDemo: this.demoMode,
      };
    }

    // Futures account
    const data = await this.signedRequest("GET", "/api/v2/mix/account/accounts", {
      productType: this.productType,
    }) as Array<{
      marginCoin: string;
      accountAvailable: string;
      accountFrozen: string;
      totalEquity: string;
      unrealizedPL: string;
    }>;

    const balances: Balance[] = [];
    const account = data[0];

    if (account) {
      balances.push({
        currency: account.marginCoin,
        total: parseFloat(account.totalEquity),
        available: parseFloat(account.accountAvailable),
        frozen: parseFloat(account.accountFrozen),
        isDemo: this.demoMode,
      });
    }

    return {
      exchange: "bitget",
      balances,
      totalEquity: parseFloat(account?.totalEquity || "0"),
      availableMargin: parseFloat(account?.accountAvailable || "0"),
      marginUsed: parseFloat(account?.accountFrozen || "0"),
      unrealizedPnl: parseFloat(account?.unrealizedPL || "0"),
      isDemo: this.demoMode,
    };
  }

  // ==================== ORDER MANAGEMENT ====================

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    try {
      const symbol = this.getSymbol(params.symbol);
      
      // For futures, determine side based on direction
      let side: string;
      if (this.marketType === "spot") {
        side = params.side === "buy" ? "buy" : "sell";
      } else {
        // Futures: open_long, open_short, close_long, close_short
        if (params.side === "buy") {
          side = params.reduceOnly ? "close_short" : "open_long";
        } else {
          side = params.reduceOnly ? "close_long" : "open_short";
        }
      }

      const orderParams: Record<string, unknown> = {
        symbol,
        productType: this.productType,
        marginMode: params.marginMode || "crossed",
        marginCoin: this.demoMode ? "SUSDT" : "USDT",
        size: String(params.quantity),
        side,
        orderType: params.type === "market" ? "market" : "limit",
        price: params.price ? String(params.price) : undefined,
        clientOid: params.clientOrderId || `bot_${Date.now()}`,
      };

      // Add stop price for trigger orders
      if (params.stopPrice && (params.type === "stop_market" || params.type === "stop_limit" || params.type === "trigger")) {
        orderParams.triggerPrice = String(params.stopPrice);
        orderParams.orderType = params.type === "stop_limit" ? "limit" : "market";
      }

      const endpoint = this.marketType === "spot" 
        ? "/api/v2/spot/trade/place-order"
        : "/api/v2/mix/order/place-order";

      const data = await this.signedRequest("POST", endpoint, orderParams, true) as {
        orderId: string;
        clientOid: string;
      };

      return {
        success: true,
        order: {
          id: data.orderId,
          clientOrderId: data.clientOid,
          exchange: "bitget",
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
          feeCurrency: this.demoMode ? "SUSDT" : "USDT",
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
      const symbol = this.getSymbol(params.symbol);
      
      const endpoint = this.marketType === "spot"
        ? "/api/v2/spot/trade/cancel-order"
        : "/api/v2/mix/order/cancel-order";

      await this.signedRequest("POST", endpoint, {
        symbol,
        productType: this.productType,
        orderId: params.orderId,
        clientOid: params.clientOrderId,
      }, true);

      return {
        success: true,
        order: {
          id: params.orderId || "",
          exchange: "bitget",
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

    const data = await this.signedRequest("GET", "/api/v2/mix/position/all-position", {
      productType: this.productType,
    }) as Array<{
      symbol: string;
      holdSide: string;
      total: string;
      averageOpenPrice: string;
      marketPrice: string;
      unrealizedPL: string;
      leverage: string;
      marginSize: string;
      marginCoin: string;
      liquidationPrice: string;
      cTime: string;
      uTime: string;
    }>;

    return data
      .filter((p) => parseFloat(p.total) !== 0)
      .map((p) => ({
        id: p.symbol,
        exchange: "bitget" as const,
        symbol: p.symbol,
        side: p.holdSide.toLowerCase() as PositionSide,
        quantity: parseFloat(p.total),
        entryPrice: parseFloat(p.averageOpenPrice),
        markPrice: parseFloat(p.marketPrice),
        unrealizedPnl: parseFloat(p.unrealizedPL),
        realizedPnl: 0,
        leverage: parseInt(p.leverage),
        marginMode: "cross" as const,
        margin: parseFloat(p.marginSize),
        liquidationPrice: parseFloat(p.liquidationPrice) || undefined,
        createdAt: new Date(parseInt(p.cTime)),
        updatedAt: new Date(parseInt(p.uTime)),
      }));
  }

  async closePosition(params: ClosePositionParams): Promise<OrderResult> {
    const position = await this.getPosition(params.symbol);
    if (!position) {
      return { success: false, error: "Position not found" };
    }

    const closeSide = position.side === "long" ? "close_long" : "close_short";

    try {
      const symbol = this.getSymbol(params.symbol);
      
      const data = await this.signedRequest("POST", "/api/v2/mix/order/place-order", {
        symbol,
        productType: this.productType,
        marginMode: "crossed",
        marginCoin: this.demoMode ? "SUSDT" : "USDT",
        size: String(params.quantity || position.quantity),
        side: closeSide,
        orderType: params.market !== false ? "market" : "limit",
      }, true) as { orderId: string };

      return { 
        success: true, 
        order: { 
          id: data.orderId,
          exchange: "bitget",
          symbol: params.symbol,
          side: position.side === "long" ? "sell" : "buy",
          type: "market",
          status: "open",
          price: 0,
          quantity: params.quantity || position.quantity,
          filledQuantity: 0,
          remainingQuantity: params.quantity || position.quantity,
          createdAt: new Date(),
          updatedAt: new Date(),
          fee: 0,
          feeCurrency: "",
          isDemo: this.demoMode,
        } as Order 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ==================== LEVERAGE ====================

  async setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
    const symbol = this.getSymbol(params.symbol);
    
    await this.signedRequest("POST", "/api/v2/mix/account/set-leverage", {
      symbol,
      productType: this.productType,
      marginCoin: this.demoMode ? "SUSDT" : "USDT",
      leverage: String(params.leverage),
    });

    // Set margin mode if specified
    if (params.marginMode) {
      try {
        await this.signedRequest("POST", "/api/v2/mix/account/set-margin-mode", {
          symbol,
          productType: this.productType,
          marginCoin: this.demoMode ? "SUSDT" : "USDT",
          marginMode: params.marginMode === "isolated" ? "isolated" : "crossed",
        });
      } catch {
        // Ignore if already set
      }
    }

    return { success: true, leverage: params.leverage };
  }

  // ==================== MARKET DATA ====================

  async getTicker(symbol: string): Promise<Ticker> {
    const apiSymbol = this.getSymbol(symbol);
    
    let endpoint: string;
    if (this.marketType === "spot") {
      endpoint = `/api/v2/spot/market/tickers?symbol=${apiSymbol}`;
    } else {
      endpoint = `/api/v2/mix/market/tickers?productType=${this.productType}&symbol=${apiSymbol}`;
    }

    const response = await fetch(`${this.getBaseUrl()}${endpoint}`);
    const data = await response.json() as {
      code: string;
      data: Array<{
        symbol: string;
        bidPr?: string;
        askPr?: string;
        lastPr?: string;
        high24h?: string;
        low24h?: string;
        baseVolume?: string;
        quoteVolume?: string;
        change24h?: string;
        changeUtc24h?: string;
      }>;
    };

    if (data.code !== "00000" || !data.data?.[0]) {
      throw new Error(`Ticker not found for ${symbol}`);
    }

    const ticker = data.data[0];

    return {
      symbol,
      exchange: "bitget",
      bid: parseFloat(ticker.bidPr || "0"),
      ask: parseFloat(ticker.askPr || "0"),
      last: parseFloat(ticker.lastPr || "0"),
      high24h: parseFloat(ticker.high24h || "0"),
      low24h: parseFloat(ticker.low24h || "0"),
      volume24h: parseFloat(ticker.baseVolume || ticker.quoteVolume || "0"),
      change24h: parseFloat(ticker.change24h || "0"),
      changePercent24h: parseFloat(ticker.changeUtc24h || "0"),
      timestamp: new Date(),
    };
  }

  async getFundingRate(symbol: string): Promise<FundingRate> {
    const apiSymbol = this.getSymbol(symbol);
    
    // Bitget V2 API: funding rate is included in ticker endpoint
    const response = await fetch(
      `${this.getBaseUrl()}/api/v2/mix/market/tickers?productType=${this.productType}&symbol=${apiSymbol}`
    );
    const data = await response.json() as {
      code: string;
      data: Array<{
        symbol: string;
        fundingRate?: string;
        nextFundingTime?: string;
        markPrice?: string;
      }>;
    };

    if (data.code !== "00000" || !data.data?.[0]) {
      throw new Error("Failed to fetch funding rate");
    }

    const ticker = data.data[0];

    return {
      symbol,
      exchange: "bitget",
      rate: parseFloat(ticker.fundingRate || "0"),
      nextFundingTime: ticker.nextFundingTime ? new Date(parseInt(ticker.nextFundingTime)) : new Date(Date.now() + 8 * 60 * 60 * 1000),
      markPrice: parseFloat(ticker.markPrice || "0"),
      timestamp: new Date(),
    };
  }

  async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
    throw new Error("getOrderbook not implemented for bitget");
  }

  // ==================== DEMO SPECIFIC ====================

  /**
   * Get list of demo symbols available
   */
  async getDemoSymbols(): Promise<string[]> {
    if (!this.demoMode) {
      return [];
    }

    const response = await fetch(
      `${this.getBaseUrl()}/api/v2/mix/market/contracts?productType=${this.productType}`
    );
    const data = await response.json() as {
      code: string;
      data: Array<{ symbol: string }>;
    };

    if (data.code !== "00000") {
      return [];
    }

    return data.data
      .filter((s) => s.symbol.startsWith("S"))
      .map((s) => s.symbol);
  }

  /**
   * Check demo account balance
   */
  async getDemoBalance(): Promise<{ available: number; frozen: number }> {
    if (!this.demoMode) {
      throw new Error("Not in demo mode");
    }

    const accountInfo = await this.getAccountInfo();
    const susdtBalance = accountInfo.balances.find((b) => b.currency === "SUSDT");
    
    return {
      available: susdtBalance?.available || 0,
      frozen: susdtBalance?.frozen || 0,
    };
  }

  /**
   * Get plan orders (TP/SL)
   */
  async getPlanOrders(symbol?: string): Promise<unknown[]> {
    const apiSymbol = symbol ? this.getSymbol(symbol) : undefined;
    
    const data = await this.signedRequest("GET", "/api/v2/mix/order/plan-order-list", {
      symbol: apiSymbol,
      productType: this.productType,
    });

    return data as unknown[];
  }

  // ==================== CONNECTION TEST ====================

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAccountInfo();
      return { 
        success: true, 
        message: this.demoMode 
          ? "Demo connection successful (S-prefixed symbols)" 
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
    const originalProductType = this.productType;
    
    if (this.marketType === "spot") {
      (this as any).marketType = "futures";
      (this as any).productType = "USDT-FUTURES";
    }

    try {
      const data = await this.signedRequest("GET", "/api/v2/mix/position/all-position", {
        productType: "USDT-FUTURES",
      }) as Array<{
        symbol: string;
        holdSide: string;
        total: string;
        averageOpenPrice: string;
        marketPrice: string;
        unrealizedPL: string;
        leverage: string;
        marginSize: string;
        marginCoin: string;
        marginMode: string;
        liquidationPrice: string;
        cTime: string;
        uTime: string;
      }>;

      return (data || [])
        .filter((p) => parseFloat(p.total) !== 0)
        .map((p) => ({
          symbol: p.symbol,
          direction: p.holdSide.toLowerCase() === "long" ? "LONG" as const : "SHORT" as const,
          size: parseFloat(p.total),
          entryPrice: parseFloat(p.averageOpenPrice),
          markPrice: parseFloat(p.marketPrice),
          unrealizedPnl: parseFloat(p.unrealizedPL),
          leverage: parseInt(p.leverage),
          marginMode: p.marginMode?.toUpperCase() as "ISOLATED" | "CROSS" | undefined,
          liquidationPrice: parseFloat(p.liquidationPrice) || undefined,
          updatedAt: new Date(parseInt(p.uTime)),
        }));
    } finally {
      // Restore original settings
      if (originalMarketType === "spot") {
        (this as any).marketType = originalMarketType;
        (this as any).productType = originalProductType;
      }
    }
  }

  async getSpotPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
    const accountInfo = await this.getAccountInfo();
    const positions: import("../position-sync-service").ExchangePosition[] = [];

    for (const balance of accountInfo.balances) {
      // Skip USDT and demo currency, focus on actual crypto holdings
      const currency = balance.currency;
      if (balance.total > 0 && 
          currency !== "USDT" && 
          currency !== "SUSDT" && 
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
    const apiSymbol = this.getSymbol(symbol);
    
    const response = await fetch(
      `${this.getBaseUrl()}/api/v2/mix/market/tickers?productType=${this.productType}&symbol=${apiSymbol}`
    );
    const data = await response.json() as {
      code: string;
      data: Array<{
        symbol: string;
        markPrice?: string;
        indexPrice?: string;
        lastPr?: string;
        fundingRate?: string;
        ts?: number;
      }>;
    };

    if (data.code !== "00000" || !data.data?.[0]) {
      throw new Error(`Failed to get mark price for ${symbol}`);
    }

    const ticker = data.data[0];

    return {
      symbol,
      exchange: "bitget",
      markPrice: parseFloat(ticker.markPrice || ticker.lastPr || "0"),
      indexPrice: parseFloat(ticker.indexPrice || "0"),
      fundingRate: ticker.fundingRate ? parseFloat(ticker.fundingRate) : undefined,
      timestamp: ticker.ts ? new Date(ticker.ts) : new Date(),
    };
  }

  // ==================== OPEN ORDERS ====================

  async getOpenOrders(symbol?: string): Promise<import("./types").OpenOrder[]> {
    const endpoint = this.marketType === "spot"
      ? "/api/v2/spot/trade/unfilled-orders"
      : "/api/v2/mix/order/current";

    const params: Record<string, unknown> = {
      productType: this.productType,
    };
    if (symbol) {
      params.symbol = this.getSymbol(symbol);
    }

    const data = await this.signedRequest("GET", endpoint, params) as {
      orderList?: Array<{
        orderId: string;
        clientOid: string;
        symbol: string;
        side: string;
        orderType: string;
        state: string;
        price: string;
        avgPrice?: string;
        size: string;
        baseVolume?: string;
        enterPointSource?: string;
        priceAvg?: string;
        cTime: string;
        uTime: string;
        marginMode?: string;
        reduceOnly?: boolean;
        triggerPrice?: string;
      }>;
    };

    const orders = data.orderList || [];
    
    return orders.map((o) => ({
      id: o.orderId,
      clientOrderId: o.clientOid,
      exchange: "bitget" as const,
      symbol: o.symbol,
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.orderType.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.state),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.priceAvg || o.avgPrice || "0"),
      quantity: parseFloat(o.size),
      filledQuantity: parseFloat(o.baseVolume || "0"),
      remainingQuantity: parseFloat(o.size) - parseFloat(o.baseVolume || "0"),
      fee: 0,
      feeCurrency: this.demoMode ? "SUSDT" : "USDT",
      createdAt: new Date(parseInt(o.cTime)),
      updatedAt: new Date(parseInt(o.uTime)),
      stopPrice: o.triggerPrice ? parseFloat(o.triggerPrice) : undefined,
      reduceOnly: o.reduceOnly,
      isDemo: this.demoMode,
    }));
  }

  private parseOrderStatus(state: string): "open" | "partial" | "filled" | "cancelled" | "expired" | "rejected" {
    const statusMap: Record<string, "open" | "partial" | "filled" | "cancelled" | "expired" | "rejected"> = {
      "live": "open",
      "partially_filled": "partial",
      "filled": "filled",
      "cancelled": "cancelled",
      "canceled": "cancelled",
      "expired": "expired",
      "failed": "rejected",
    };
    return statusMap[state] || "open";
  }

  // ==================== ORDER HISTORY ====================

  async getOrderHistory(
    symbol?: string,
    limit: number = 100,
    startTime?: Date,
    endTime?: Date
  ): Promise<import("./types").OrderHistoryItem[]> {
    const endpoint = this.marketType === "spot"
      ? "/api/v2/spot/trade/orderHistory"
      : "/api/v2/mix/order/history";

    const params: Record<string, unknown> = {
      productType: this.productType,
      limit,
    };
    if (symbol) {
      params.symbol = this.getSymbol(symbol);
    }
    if (startTime) params.startTime = startTime.getTime();
    if (endTime) params.endTime = endTime.getTime();

    const data = await this.signedRequest("GET", endpoint, params) as {
      orderList?: Array<{
        orderId: string;
        clientOid: string;
        symbol: string;
        side: string;
        orderType: string;
        state: string;
        price: string;
        priceAvg?: string;
        size: string;
        baseVolume?: string;
        fee?: string;
        feeCcy?: string;
        profit?: string;
        cTime: string;
        uTime: string;
        marginMode?: string;
        reduceOnly?: boolean;
        triggerPrice?: string;
      }>;
    };

    const orders = data.orderList || [];
    
    return orders.map((o) => ({
      id: o.orderId,
      clientOrderId: o.clientOid,
      exchange: "bitget" as const,
      symbol: o.symbol,
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.orderType.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.state),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.priceAvg || "0"),
      quantity: parseFloat(o.size),
      filledQuantity: parseFloat(o.baseVolume || "0"),
      remainingQuantity: parseFloat(o.size) - parseFloat(o.baseVolume || "0"),
      fee: parseFloat(o.fee || "0"),
      feeCurrency: o.feeCcy || (this.demoMode ? "SUSDT" : "USDT"),
      realizedPnl: o.profit ? parseFloat(o.profit) : undefined,
      createdAt: new Date(parseInt(o.cTime)),
      updatedAt: new Date(parseInt(o.uTime)),
      stopPrice: o.triggerPrice ? parseFloat(o.triggerPrice) : undefined,
      reduceOnly: o.reduceOnly,
      isDemo: this.demoMode,
    }));
  }

  // ==================== BALANCE HISTORY ====================

  async getBalanceHistory(params?: import("./types").BalanceHistoryParams): Promise<import("./types").BalanceHistoryItem[]> {
    // Bitget provides bills via /api/v2/account/bill
    try {
      const requestParams: Record<string, unknown> = {
        limit: params?.limit || 100,
      };
      if (params?.currency) requestParams.coin = params.currency;
      if (params?.startTime) requestParams.startTime = params.startTime.getTime();
      if (params?.endTime) requestParams.endTime = params.endTime.getTime();

      const data = await this.signedRequest("GET", "/api/v2/account/bill", requestParams) as {
        billList?: Array<{
          id: string;
          coin: string;
          type: string;
          amount: string;
          balance: string;
          fee?: string;
          cTime: string;
          orderId?: string;
        }>;
      };

      return (data.billList || []).map((item) => ({
        id: item.id,
        exchange: "bitget" as const,
        accountId: "",
        currency: item.coin,
        changeType: this.mapBillTypeToChangeType(item.type),
        amount: parseFloat(item.amount),
        balanceBefore: 0,
        balanceAfter: parseFloat(item.balance),
        relatedId: item.orderId,
        timestamp: new Date(parseInt(item.cTime)),
        fee: item.fee ? parseFloat(item.fee) : undefined,
      }));
    } catch {
      return [];
    }
  }

  private mapBillTypeToChangeType(type: string): import("./types").BalanceHistoryItem['changeType'] {
    switch (type.toLowerCase()) {
      case "transfer":
        return "TRANSFER";
      case "trade":
        return "TRADE";
      case "funding":
      case "funding_fee":
        return "FUNDING";
      case "fee":
        return "FEE";
      case "liquidation":
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

    const apiSymbol = this.getSymbol(symbol);

    const response = await fetch(
      `${this.getBaseUrl()}/api/v2/mix/market/open-interest?productType=${this.productType}&symbol=${apiSymbol}`
    );
    const data = await response.json() as {
      code: string;
      msg?: string;
      data?: {
        openInterestList?: Array<{
          symbol: string;
          size?: string;
          openInterest?: string;
        }>;
        ts?: string;
      };
    };

    if (data.code !== "00000") {
      throw new Error(`Failed to get open interest for ${symbol}: ${data.msg || data.code}`);
    }

    const oiData = data.data?.openInterestList?.[0];
    if (!oiData) {
      throw new Error(`No open interest data for ${symbol}`);
    }

    const openInterest = parseFloat(oiData.size || oiData.openInterest || "0");

    // Get current price for USD calculation
    let price = 0;
    try {
      const ticker = await this.getTicker(symbol);
      price = ticker.last;
    } catch {
      // Price not available
    }

    return {
      symbol,
      exchange: "bitget",
      openInterest,
      openInterestUsd: price > 0 ? openInterest * price : undefined,
      timestamp: data.data?.ts ? new Date(parseInt(data.data.ts)) : new Date(),
      price,
    };
  }

  // ==================== COPY TRADING (LEGACY - FOLLOWER) ====================

  async getLeadTraderStatus(): Promise<import("./types").LeadTraderStatus> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/currentTrack", {});
      return { isLeadTrader: true, active: true };
    } catch {
      return { isLeadTrader: false };
    }
  }

  async getCopyTraderList(limit?: number, sortBy?: string): Promise<import("./types").CopyTraderStats[]> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/traderList", {
        pageSize: limit || 20,
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
            totalPnl?: string;
            maxDrawdown?: string;
          }>;
        };
      };

      if (!data.data?.result) return [];

      return data.data.result.map((t) => ({
        traderId: t.traderId || "",
        nickname: t.nickName,
        avatar: t.avatar,
        exchange: "bitget",
        roi: parseFloat(t.roi || "0"),
        winRate: parseFloat(t.winRate || "0"),
        totalTrades: t.totalTrades || 0,
        followersCount: t.followerNum || 0,
        tradingDays: t.traderDays,
        totalPnl: parseFloat(t.totalPnl || "0"),
        maxDrawdown: parseFloat(t.maxDrawdown || "0"),
        positionSide: "both" as const,
        timestamp: new Date(),
      }));
    } catch {
      return [];
    }
  }

  async getCopyTraderStats(traderId: string): Promise<import("./types").CopyTraderStats> {
    const data = await this.signedRequest("GET", "/api/mix/v1/trace/traderDetail", { traderId });
    throw new Error("Not implemented");
  }

  async getCopyTraderPositions(traderId: string): Promise<import("./types").CopyTraderPosition[]> {
    return [];
  }

  async getCopyTraderTradeHistory(traderId: string, limit?: number, startTime?: Date): Promise<import("./types").CopyTraderTrade[]> {
    return [];
  }

  async copyTraderSubscribe(params: import("./types").CopySubscribeParams): Promise<import("./types").CopyTradingResult> {
    return { success: false, error: "Use Bitget Master Trader methods" };
  }

  async copyTraderUnsubscribe(traderId: string): Promise<import("./types").CopyTradingResult> {
    return { success: false, error: "Use Bitget Master Trader methods" };
  }

  async getCopyFollowerSettings(traderId?: string): Promise<import("./types").CopyFollowerSettings[]> {
    return [];
  }

  async updateCopyFollowerSettings(params: import("./types").CopyFollowerSettings): Promise<import("./types").CopyTradingResult> {
    return { success: false, error: "Not supported" };
  }

  async getCopyFollowers(limit?: number): Promise<import("./types").CopyFollowerInfo[]> {
    return [];
  }

  async removeCopyFollower(followerId: string): Promise<import("./types").CopyTradingResult> {
    return { success: false, error: "Use removeMasterFollower instead" };
  }

  async getCopyTraderProfitSummary(startDate?: Date, endDate?: Date): Promise<import("./types").CopyTraderProfitSummary[]> {
    return [];
  }

  async getCopyTradingSymbols(): Promise<import("./types").CopyTradingSymbol[]> {
    try {
      const data = await this.signedRequest("GET", "/api/mix/v1/trace/traderSymbols", {}) as {
        data?: {
          traderSymbols?: Array<{
            symbol?: string;
            maxLeverage?: number;
            minAmount?: string;
            maxAmount?: string;
          }>;
        };
      };

      if (!data.data?.traderSymbols) return [];

      return data.data.traderSymbols.map((s) => ({
        symbol: s.symbol || "",
        exchange: "bitget",
        enabled: true,
        maxLeverage: s.maxLeverage,
        minQuantity: s.minAmount ? parseFloat(s.minAmount) : undefined,
        maxQuantity: s.maxAmount ? parseFloat(s.maxAmount) : undefined,
      }));
    } catch {
      return [];
    }
  }

  async copyClosePosition(params: import("./types").CopyClosePositionParams): Promise<import("./types").CopyTradingResult> {
    try {
      const closeParams: Record<string, unknown> = { symbol: params.symbol };
      if (params.trackingNumber) closeParams.trackingNo = params.trackingNumber;

      const data = await this.signedRequest("POST", "/api/mix/v1/trace/closeTrackOrder", closeParams);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed" };
    }
  }

  async copyModifyTpsl(params: import("./types").CopyModifyTpslParams): Promise<import("./types").CopyTradingResult> {
    try {
      const modifyParams: Record<string, unknown> = { symbol: params.symbol };
      if (params.trackingNumber) modifyParams.trackingNo = params.trackingNumber;
      if (params.takeProfit) modifyParams.takeProfitPrice = params.takeProfit.toString();
      if (params.stopLoss) modifyParams.stopLossPrice = params.stopLoss.toString();

      const data = await this.signedRequest("POST", "/api/mix/v1/trace/modifyTPSL", modifyParams);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed" };
    }
  }

  // ==================== MASTER TRADER METHODS ====================

  private masterTrader: import("./copy-trading/bitget-master-trader").BitgetMasterTrader | null = null;

  private async getMasterTrader(): Promise<import("./copy-trading/bitget-master-trader").BitgetMasterTrader> {
    if (!this.masterTrader) {
      const { BitgetMasterTrader } = await import("./copy-trading/bitget-master-trader");
      this.masterTrader = new BitgetMasterTrader(this.signedRequest.bind(this));
    }
    return this.masterTrader;
  }

  async applyAsMasterTrader(application: import("./types").MasterTraderApplication): Promise<import("./types").MasterTraderResult> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.updateMasterTraderSettings({ 
      profitSharePercent: application.profitSharePercent 
    });
  }

  async getMasterTraderSettings(): Promise<import("./types").MasterTraderSettings | null> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.getMasterTraderSettings();
  }

  async updateMasterTraderSettings(settings: Partial<import("./types").MasterTraderSettings>): Promise<import("./types").MasterTraderResult> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.updateMasterTraderSettings(settings);
  }

  async getMasterFollowers(limit?: number): Promise<import("./types").MasterFollowerInfo[]> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.getFollowers(limit);
  }

  async removeMasterFollower(followerId: string): Promise<import("./types").MasterTraderResult> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.removeFollower(followerId);
  }

  async getMasterProfitSummary(startDate?: Date, endDate?: Date): Promise<import("./types").MasterProfitSummary[]> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.getProfitSummary(startDate, endDate);
  }

  async getMasterPositions(): Promise<import("./types").MasterTraderPosition[]> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.getMasterPositions();
  }
}
