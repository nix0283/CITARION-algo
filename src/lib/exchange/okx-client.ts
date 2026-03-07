/**
 * OKX Exchange Client
 * 
 * Supports:
 * - Spot Trading
 * - USDT-M Futures (Swap)
 * - Inverse Futures
 * - Demo Trading: Same endpoints with x-simulated-trading header
 * 
 * Uses V5 API
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
  PositionSide,
  TradingMode,
  EXCHANGE_CONFIGS,
  Orderbook,
  OrderbookEntry,
} from "./types";

export class OKXClient extends BaseExchangeClient {
  private instType: string;

  constructor(
    credentials: ApiCredentials,
    marketType: MarketType = "futures",
    testnet: boolean = false,
    tradingMode?: TradingMode
  ) {
    super("okx", credentials, marketType, testnet, tradingMode);
    
    // Determine instrument type
    if (marketType === "spot") {
      this.instType = "SPOT";
    } else if (marketType === "futures") {
      this.instType = "SWAP";
    } else {
      this.instType = "FUTURES";
    }
  }

  private generateSignature(timestamp: string, method: string, path: string, body?: string): string {
    const message = timestamp + method + path + (body || "");
    return crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(message)
      .digest("base64");
  }

  private getHeaders(method: string, path: string, body?: string): Record<string, string> {
    const timestamp = new Date().toISOString();
    const signature = this.generateSignature(timestamp, method, path, body);
    
    const headers: Record<string, string> = {
      "OK-ACCESS-KEY": this.credentials.apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.credentials.passphrase || "",
      "Content-Type": "application/json",
    };

    // Add demo trading header if in demo mode
    if (this.tradingMode === "DEMO") {
      headers["x-simulated-trading"] = "1";
    }

    return headers;
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

    if (data.code !== "0") {
      throw {
        exchange: "okx",
        code: data.code,
        message: data.msg,
        timestamp: new Date(),
        retriable: data.code === "50011" || data.code === "50014", // Rate limit errors
      };
    }

    return data.data;
  }

  // ==================== ACCOUNT INFO ====================

  async getAccountInfo(): Promise<AccountInfo> {
    const data = await this.signedRequest("GET", "/api/v5/account/balance") as Array<{
      uTime: string;
      totalEq: string;
      details: Array<{
        ccy: string;
        cashBal: string;
        availBal: string;
        frozenBal: string;
        eqUsd: string;
      }>;
    }>;

    const account = data?.[0];
    const balances: Balance[] = (account?.details || [])
      .filter((d) => parseFloat(d.cashBal) > 0 || parseFloat(d.frozenBal) > 0)
      .map((d) => ({
        currency: d.ccy,
        total: parseFloat(d.cashBal),
        available: parseFloat(d.availBal),
        frozen: parseFloat(d.frozenBal),
        usdValue: parseFloat(d.eqUsd),
        isDemo: this.isDemo(),
      }));

    return {
      exchange: "okx",
      balances,
      totalEquity: parseFloat(account?.totalEq || "0"),
      availableMargin: balances.reduce((s, b) => s + b.available, 0),
      marginUsed: balances.reduce((s, b) => s + b.frozen, 0),
      unrealizedPnl: 0,
      isDemo: this.isDemo(),
    };
  }

  // ==================== ORDER MANAGEMENT ====================

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    try {
      // Convert symbol format: BTCUSDT -> BTC-USDT-SWAP
      let instId = params.symbol;
      if (this.marketType === "futures" && !instId.includes("-")) {
        instId = params.symbol.replace("USDT", "-USDT-SWAP");
      } else if (this.marketType === "spot" && !instId.includes("-")) {
        instId = params.symbol.replace("USDT", "-USDT");
      }

      const orderParams: Record<string, unknown> = {
        instId,
        tdMode: params.marginMode === "isolated" ? "isolated" : "cross",
        side: params.side === "buy" ? "buy" : "sell",
        ordType: params.type === "market" ? "market" : "limit",
        sz: String(params.quantity),
      };

      // Position side for futures
      if (this.marketType !== "spot" && params.positionSide) {
        orderParams.posSide = params.positionSide === "long" ? "long" : "short";
      }

      if (params.price && params.type !== "market") {
        orderParams.px = String(params.price);
      }

      if (params.stopPrice) {
        orderParams.triggerPx = String(params.stopPrice);
        orderParams.ordType = params.type === "stop_limit" ? "trigger" : "market";
      }

      if (params.clientOrderId) {
        orderParams.clOrdId = params.clientOrderId;
      }

      if (params.reduceOnly) {
        orderParams.reduceOnly = true;
      }

      const data = await this.signedRequest("POST", "/api/v5/trade/order", orderParams, true) as {
        ordId: string;
        clOrdId: string;
      };

      return {
        success: true,
        order: {
          id: data.ordId,
          clientOrderId: data.clOrdId,
          exchange: "okx",
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
          feeCurrency: "",
          isDemo: this.isDemo(),
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
      // Convert symbol format
      let instId = params.symbol;
      if (this.marketType === "futures" && !instId.includes("-")) {
        instId = params.symbol.replace("USDT", "-USDT-SWAP");
      }

      const cancelParams: Record<string, unknown> = {
        instId,
      };

      if (params.orderId) {
        cancelParams.ordId = params.orderId;
      }
      if (params.clientOrderId) {
        cancelParams.clOrdId = params.clientOrderId;
      }

      await this.signedRequest("POST", "/api/v5/trade/cancel-order", cancelParams, true);

      return {
        success: true,
        order: {
          id: params.orderId || "",
          exchange: "okx",
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
          isDemo: this.isDemo(),
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

    const data = await this.signedRequest("GET", "/api/v5/account/positions", {
      instType: this.instType,
    }) as Array<{
      instId: string;
      posSide: string;
      pos: string;
      avgPx: string;
      markPx: string;
      upl: string;
      lever: string;
      margin: string;
      liqPx: string;
      cTime: string;
      uTime: string;
      slTriggerPx: string;
      tpTriggerPx: string;
    }>;

    return (data || [])
      .filter((p) => parseFloat(p.pos) !== 0)
      .map((p) => ({
        id: p.instId,
        exchange: "okx" as const,
        symbol: p.instId,
        side: p.posSide.toLowerCase() as PositionSide,
        quantity: Math.abs(parseFloat(p.pos)),
        entryPrice: parseFloat(p.avgPx),
        markPrice: parseFloat(p.markPx),
        unrealizedPnl: parseFloat(p.upl),
        realizedPnl: 0,
        leverage: parseInt(p.lever),
        marginMode: "cross" as const,
        margin: parseFloat(p.margin),
        liquidationPrice: parseFloat(p.liqPx) || undefined,
        stopLoss: parseFloat(p.slTriggerPx) || undefined,
        takeProfit: parseFloat(p.tpTriggerPx) || undefined,
        createdAt: new Date(parseInt(p.cTime)),
        updatedAt: new Date(parseInt(p.uTime)),
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
      positionSide: position.side,
      reduceOnly: true,
    });
  }

  // ==================== LEVERAGE ====================

  async setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
    // Convert symbol format
    let instId = params.symbol;
    if (!instId.includes("-")) {
      instId = params.symbol.replace("USDT", "-USDT-SWAP");
    }

    await this.signedRequest("POST", "/api/v5/account/set-leverage", {
      instId,
      lever: String(params.leverage),
      mgnMode: params.marginMode === "isolated" ? "isolated" : "cross",
    });

    return { success: true, leverage: params.leverage };
  }

  // ==================== MARKET DATA ====================

  async getTicker(symbol: string): Promise<Ticker> {
    // Convert symbol format
    let instId = symbol;
    if (this.marketType === "futures" && !instId.includes("-")) {
      instId = symbol.replace("USDT", "-USDT-SWAP");
    } else if (this.marketType === "spot" && !instId.includes("-")) {
      instId = symbol.replace("USDT", "-USDT");
    }

    const response = await fetch(
      `${this.getBaseUrl()}/api/v5/market/tickers?instType=${this.instType}`
    );
    const data = await response.json() as {
      code: string;
      data: Array<{
        instId: string;
        bidPx: string;
        askPx: string;
        last: string;
        high24h: string;
        low24h: string;
        vol24h: string;
        open24h: string;
      }>;
    };

    const ticker = data.data?.find((t) => t.instId === instId);
    if (!ticker) {
      throw new Error(`Ticker not found for ${symbol}`);
    }

    const openPrice = parseFloat(ticker.open24h);
    const lastPrice = parseFloat(ticker.last);

    return {
      symbol,
      exchange: "okx",
      bid: parseFloat(ticker.bidPx),
      ask: parseFloat(ticker.askPx),
      last: lastPrice,
      high24h: parseFloat(ticker.high24h),
      low24h: parseFloat(ticker.low24h),
      volume24h: parseFloat(ticker.vol24h),
      change24h: lastPrice - openPrice,
      changePercent24h: openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0,
      timestamp: new Date(),
    };
  }

  async getFundingRate(symbol: string): Promise<FundingRate> {
    // Convert symbol format
    let instId = symbol;
    if (!instId.includes("-")) {
      instId = symbol.replace("USDT", "-USDT-SWAP");
    }

    const response = await fetch(
      `${this.getBaseUrl()}/api/v5/public/funding-rate?instId=${instId}`
    );
    const data = await response.json() as {
      code: string;
      data: {
        fundingRate: string;
        nextFundingRate: string;
        fundingTime: string;
        method: string;
      };
    };

    if (data.code !== "0") {
      throw new Error("Failed to fetch funding rate");
    }

    return {
      symbol,
      exchange: "okx",
      rate: parseFloat(data.data.fundingRate),
      nextFundingTime: new Date(parseInt(data.data.fundingTime)),
      markPrice: 0,
      timestamp: new Date(),
    };
  }

  async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
    const instType = this.marketType === "spot" ? "SPOT" : "SWAP";
    const response = await fetch(
      `${this.getBaseUrl()}/api/v5/market/books?instType=${instType}&instId=${symbol}&sz=${depth}`
    );
    const data = await response.json() as {
      code: string;
      data: Array<{ bids: Array<[string, string, string]>; asks: Array<[string, string, string]> }>;
    };
    
    const bids: OrderbookEntry[] = (data.data?.[0]?.bids || []).map(([price, qty]) => ({
      price: parseFloat(price),
      quantity: parseFloat(qty),
    }));
    const asks: OrderbookEntry[] = (data.data?.[0]?.asks || []).map(([price, qty]) => ({
      price: parseFloat(price),
      quantity: parseFloat(qty),
    }));
    
    return { symbol, exchange: "okx", bids: bids.sort((a, b) => b.price - a.price), asks: asks.sort((a, b) => a.price - b.price), timestamp: new Date() };
  }

  // ==================== ACCOUNT CONFIG ====================

  async getAccountConfig(): Promise<{
    acctLv: number;
    posMode: string;
    autoLoan: boolean;
  }> {
    const data = await this.signedRequest("GET", "/api/v5/account/config") as {
      acctLv: number;
      posMode: string;
      autoLoan: boolean;
    };
    return data;
  }

  // ==================== CONNECTION TEST ====================

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAccountInfo();
      return { 
        success: true, 
        message: this.isDemo() 
          ? "Demo connection successful (x-simulated-trading: 1)" 
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
      (this as any).instType = "SWAP";
    }

    try {
      const data = await this.signedRequest("GET", "/api/v5/account/positions", {
        instType: "SWAP",
      }) as Array<{
        instId: string;
        posSide: string;
        pos: string;
        avgPx: string;
        markPx: string;
        upl: string;
        lever: string;
        margin: string;
        liqPx: string;
        mgnMode: string;
        cTime: string;
        uTime: string;
      }>;

      return (data || [])
        .filter((p) => parseFloat(p.pos) !== 0)
        .map((p) => ({
          symbol: p.instId,
          direction: p.posSide.toLowerCase() === "long" ? "LONG" as const : "SHORT" as const,
          size: Math.abs(parseFloat(p.pos)),
          entryPrice: parseFloat(p.avgPx),
          markPrice: parseFloat(p.markPx),
          unrealizedPnl: parseFloat(p.upl),
          leverage: parseInt(p.lever),
          marginMode: p.mgnMode?.toUpperCase() as "ISOLATED" | "CROSS" | undefined,
          liquidationPrice: parseFloat(p.liqPx) || undefined,
          updatedAt: new Date(parseInt(p.uTime)),
        }));
    } finally {
      // Restore original market type
      if (originalMarketType === "spot") {
        (this as any).marketType = originalMarketType;
        (this as any).instType = "SPOT";
      }
    }
  }

  async getSpotPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
    const accountInfo = await this.getAccountInfo();
    const positions: import("../position-sync-service").ExchangePosition[] = [];

    for (const balance of accountInfo.balances) {
      if (balance.total > 0 && balance.currency !== "USDT" && !balance.currency.startsWith("LD")) {
        // Convert symbol format: BTC -> BTC-USDT for OKX
        const symbol = `${balance.currency}-USDT`;
        
        try {
          const ticker = await this.getTicker(symbol.replace("-", ""));
          positions.push({
            symbol: `${balance.currency}USDT`,
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
    // Convert symbol format if needed
    let instId = symbol;
    if (this.marketType === "futures" && !instId.includes("-")) {
      instId = symbol.replace("USDT", "-USDT-SWAP");
    } else if (this.marketType === "spot" && !instId.includes("-")) {
      instId = symbol.replace("USDT", "-USDT");
    }

    // Get mark price from mark-price endpoint
    const markResponse = await fetch(
      `${this.getBaseUrl()}/api/v5/public/mark-price?instId=${instId}`
    );
    const markData = await markResponse.json() as {
      code: string;
      data: Array<{
        instId: string;
        markPx: string;
        ts: string;
      }>;
    };

    if (markData.code !== "0" || !markData.data?.[0]) {
      throw new Error(`Failed to get mark price for ${symbol}`);
    }

    const markPx = parseFloat(markData.data[0].markPx);
    const timestamp = new Date(parseInt(markData.data[0].ts));

    // Get index price from tickers endpoint (OKX separates these)
    let indexPx = 0;
    try {
      const tickerResponse = await fetch(
        `${this.getBaseUrl()}/api/v5/market/ticker?instId=${instId}`
      );
      const tickerData = await tickerResponse.json() as {
        code: string;
        data: Array<{
          idxPx?: string;
        }>;
      };
      
      if (tickerData.code === "0" && tickerData.data?.[0]?.idxPx) {
        indexPx = parseFloat(tickerData.data[0].idxPx);
      }
    } catch {
      // Index price not available, use 0
    }

    return {
      symbol,
      exchange: "okx",
      markPrice: markPx,
      indexPrice: indexPx,
      timestamp,
    };
  }

  // ==================== OPEN ORDERS ====================

  async getOpenOrders(symbol?: string): Promise<import("./types").OpenOrder[]> {
    const params: Record<string, unknown> = {
      instType: this.instType,
    };
    
    // Convert symbol format if provided
    if (symbol) {
      let instId = symbol;
      if (this.marketType === "futures" && !instId.includes("-")) {
        instId = symbol.replace("USDT", "-USDT-SWAP");
      } else if (this.marketType === "spot" && !instId.includes("-")) {
        instId = symbol.replace("USDT", "-USDT");
      }
      params.instId = instId;
    }

    const data = await this.signedRequest("GET", "/api/v5/trade/orders-pending", params) as {
      data: Array<{
        ordId: string;
        clOrdId: string;
        instId: string;
        side: string;
        ordType: string;
        state: string;
        px: string;
        avgPx?: string;
        sz: string;
        accFillSz?: string;
        cTime: string;
        uTime: string;
        slTriggerPx?: string;
        tpTriggerPx?: string;
        tgtCcy?: string;
        posSide?: string;
        reduceOnly?: boolean;
      }>;
    };

    return (data.data || []).map((o) => ({
      id: o.ordId,
      clientOrderId: o.clOrdId,
      exchange: "okx" as const,
      symbol: o.instId.replace("-USDT-SWAP", "USDT").replace("-USDT", "USDT"),
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.ordType.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.state),
      price: parseFloat(o.px),
      avgPrice: parseFloat(o.avgPx || "0"),
      quantity: parseFloat(o.sz),
      filledQuantity: parseFloat(o.accFillSz || "0"),
      remainingQuantity: parseFloat(o.sz) - parseFloat(o.accFillSz || "0"),
      fee: 0,
      feeCurrency: "USDT",
      createdAt: new Date(parseInt(o.cTime)),
      updatedAt: new Date(parseInt(o.uTime)),
      stopPrice: o.slTriggerPx ? parseFloat(o.slTriggerPx) : o.tpTriggerPx ? parseFloat(o.tpTriggerPx) : undefined,
      reduceOnly: o.reduceOnly,
      positionSide: o.posSide?.toLowerCase() as "long" | "short" | undefined,
      takeProfitPrice: o.tpTriggerPx ? parseFloat(o.tpTriggerPx) : undefined,
      stopLossPrice: o.slTriggerPx ? parseFloat(o.slTriggerPx) : undefined,
      isDemo: this.isDemo(),
    }));
  }

  private parseOrderStatus(state: string): "open" | "partial" | "filled" | "cancelled" | "expired" | "rejected" {
    const statusMap: Record<string, "open" | "partial" | "filled" | "cancelled" | "expired" | "rejected"> = {
      "live": "open",
      "partially_filled": "partial",
      "filled": "filled",
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
    const params: Record<string, unknown> = {
      instType: this.instType,
      limit,
    };
    
    // Convert symbol format if provided
    if (symbol) {
      let instId = symbol;
      if (this.marketType === "futures" && !instId.includes("-")) {
        instId = symbol.replace("USDT", "-USDT-SWAP");
      } else if (this.marketType === "spot" && !instId.includes("-")) {
        instId = symbol.replace("USDT", "-USDT");
      }
      params.instId = instId;
    }
    
    if (startTime) params.before = startTime.getTime().toString();
    if (endTime) params.after = endTime.getTime().toString();

    const data = await this.signedRequest("GET", "/api/v5/trade/orders-history", params) as {
      data: Array<{
        ordId: string;
        clOrdId: string;
        instId: string;
        side: string;
        ordType: string;
        state: string;
        px: string;
        avgPx?: string;
        sz: string;
        accFillSz?: string;
        fee?: string;
        feeCcy?: string;
        pnl?: string;
        cTime: string;
        uTime: string;
        slTriggerPx?: string;
        tpTriggerPx?: string;
        posSide?: string;
        reduceOnly?: boolean;
      }>;
    };

    return (data.data || []).map((o) => ({
      id: o.ordId,
      clientOrderId: o.clOrdId,
      exchange: "okx" as const,
      symbol: o.instId.replace("-USDT-SWAP", "USDT").replace("-USDT", "USDT"),
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.ordType.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.state),
      price: parseFloat(o.px),
      avgPrice: parseFloat(o.avgPx || "0"),
      quantity: parseFloat(o.sz),
      filledQuantity: parseFloat(o.accFillSz || "0"),
      remainingQuantity: parseFloat(o.sz) - parseFloat(o.accFillSz || "0"),
      fee: parseFloat(o.fee || "0"),
      feeCurrency: o.feeCcy || "USDT",
      realizedPnl: o.pnl ? parseFloat(o.pnl) : undefined,
      createdAt: new Date(parseInt(o.cTime)),
      updatedAt: new Date(parseInt(o.uTime)),
      stopPrice: o.slTriggerPx ? parseFloat(o.slTriggerPx) : o.tpTriggerPx ? parseFloat(o.tpTriggerPx) : undefined,
      reduceOnly: o.reduceOnly,
      positionSide: o.posSide?.toLowerCase() as "long" | "short" | undefined,
      isDemo: this.isDemo(),
    }));
  }

  // ==================== BALANCE HISTORY ====================

  async getBalanceHistory(params?: import("./types").BalanceHistoryParams): Promise<import("./types").BalanceHistoryItem[]> {
    // OKX provides bills via /api/v5/account/bills
    try {
      const requestParams: Record<string, unknown> = {
        limit: params?.limit || 100,
      };
      if (params?.currency) requestParams.ccy = params.currency;
      if (params?.startTime) requestParams.before = params.startTime.getTime().toString();
      if (params?.endTime) requestParams.after = params.endTime.getTime().toString();

      const data = await this.signedRequest("GET", "/api/v5/account/bills", requestParams) as {
        data: Array<{
          billId: string;
          ccy: string;
          type: string;
          subType?: string;
          amt: string;
          bal: string;
          ts: string;
          ordId?: string;
        }>;
      };

      return (data.data || []).map((item) => ({
        id: item.billId,
        exchange: "okx" as const,
        accountId: "",
        currency: item.ccy,
        changeType: this.mapBillTypeToChangeType(item.type),
        amount: parseFloat(item.amt),
        balanceBefore: 0, // Not directly provided
        balanceAfter: parseFloat(item.bal),
        relatedId: item.ordId,
        relatedType: item.type.includes("trade") ? "TRADE" : "FUNDING",
        timestamp: new Date(parseInt(item.ts)),
      }));
    } catch {
      return [];
    }
  }

  private mapBillTypeToChangeType(type: string): import("./types").BalanceHistoryItem['changeType'] {
    switch (type) {
      case "1": // Transfer
        return "TRANSFER";
      case "2": // Trade
        return "TRADE";
      case "3": // Funding
        return "FUNDING";
      case "4": // Fee
        return "FEE";
      case "5": // Liquidation
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

    // Convert symbol format if needed
    let instId = symbol;
    if (!instId.includes("-")) {
      instId = symbol.replace("USDT", "-USDT-SWAP");
    }

    const response = await fetch(
      `${this.getBaseUrl()}/api/v5/public/open-interest?instType=SWAP&instId=${instId}`
    );
    const data = await response.json() as {
      code: string;
      data: Array<{
        instId: string;
        oi: string;
        oiCcy: string;
        ts: string;
      }>;
    };

    if (data.code !== "0" || !data.data?.[0]) {
      throw new Error(`Failed to get open interest for ${symbol}`);
    }

    const oiData = data.data[0];

    // Get current price for USD calculation
    let price = 0;
    try {
      const ticker = await this.getTicker(symbol);
      price = ticker.last;
    } catch {
      // Price not available
    }

    // OKX returns oi in contracts, oiCcy in currency
    const openInterest = parseFloat(oiData.oi);
    const openInterestUsd = parseFloat(oiData.oiCcy);

    return {
      symbol,
      exchange: "okx",
      openInterest,
      openInterestUsd: openInterestUsd > 0 ? openInterestUsd : (price > 0 ? openInterest * price : undefined),
      timestamp: new Date(parseInt(oiData.ts)),
      price,
    };
  }

  // ==================== COPY TRADING (LEGACY - FOLLOWER) ====================

  async getLeadTraderStatus(): Promise<import("./types").LeadTraderStatus> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.getLeadTraderStatus();
  }

  async getCopyTraderList(limit?: number, sortBy?: string): Promise<import("./types").CopyTraderStats[]> {
    // OKX may expose public trader ranking data
    console.warn("[OKX] getCopyTraderList: Limited public API access");
    return [];
  }

  async getCopyTraderStats(traderId: string): Promise<import("./types").CopyTraderStats> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/copytrading/public-config", {
        uniqueCode: traderId,
      }) as {
        uniqueCode?: string;
        nickName?: string;
        avatarUrl?: string;
        totalPnl?: string;
        roi?: string;
        winRate?: string;
        followerNum?: string;
        tradingDays?: string;
      };

      return {
        traderId: data.uniqueCode || traderId,
        nickname: data.nickName,
        avatar: data.avatarUrl,
        exchange: "okx",
        roi: parseFloat(data.roi || "0"),
        winRate: parseFloat(data.winRate || "0"),
        totalTrades: 0,
        followersCount: parseInt(data.followerNum || "0"),
        totalPnl: parseFloat(data.totalPnl || "0"),
        tradingDays: parseInt(data.tradingDays || "0"),
        positionSide: "both" as const,
        timestamp: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to get trader stats: ${error}`);
    }
  }

  async getCopyTraderPositions(traderId: string): Promise<import("./types").CopyTraderPosition[]> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/copytrading/public-current-subpositions", {
        uniqueCode: traderId,
      }) as Array<{
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
      }>;

      return (data || []).map((p) => ({
        positionId: p.subPosId || "",
        exchange: "okx" as const,
        traderId,
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
        updatedAt: new Date(),
      }));
    } catch {
      return [];
    }
  }

  async getCopyTraderTradeHistory(traderId: string, limit?: number, startTime?: Date): Promise<import("./types").CopyTraderTrade[]> {
    return [];
  }

  async copyTraderSubscribe(params: import("./types").CopySubscribeParams): Promise<import("./types").CopyTradingResult> {
    return { success: false, error: "Use OKX Master Trader methods" };
  }

  async copyTraderUnsubscribe(traderId: string): Promise<import("./types").CopyTradingResult> {
    return { success: false, error: "Use OKX Master Trader methods" };
  }

  async getCopyFollowerSettings(traderId?: string): Promise<import("./types").CopyFollowerSettings[]> {
    return [];
  }

  async updateCopyFollowerSettings(params: import("./types").CopyFollowerSettings): Promise<import("./types").CopyTradingResult> {
    return { success: false, error: "Not supported" };
  }

  async getCopyFollowers(limit?: number): Promise<import("./types").CopyFollowerInfo[]> {
    const masterTrader = await this.getMasterTrader();
    const followers = await masterTrader.getFollowers(limit);
    return followers.map(f => ({
      followerId: f.followerId,
      exchange: "okx" as const,
      traderId: "",
      subscribedAt: f.subscribedAt,
      active: f.active,
      totalPnl: f.totalPnl,
      copiedTradesCount: f.totalCopiedTrades,
      totalVolume: f.totalVolume,
    }));
  }

  async removeCopyFollower(followerId: string): Promise<import("./types").CopyTradingResult> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.removeFollower(followerId);
  }

  async getCopyTraderProfitSummary(startDate?: Date, endDate?: Date): Promise<import("./types").CopyTraderProfitSummary[]> {
    return [];
  }

  async getCopyTradingSymbols(): Promise<import("./types").CopyTradingSymbol[]> {
    try {
      const data = await this.signedRequest("GET", "/api/v5/public/instruments", {
        instType: "SWAP",
      }) as Array<{
        instId: string;
        lever?: string;
        minSz?: string;
        maxSz?: string;
        lotSz?: string;
        tickSz?: string;
      }>;

      return (data || []).map((s) => ({
        symbol: s.instId,
        exchange: "okx" as const,
        enabled: true,
        maxLeverage: s.lever ? parseFloat(s.lever) : 125,
        minQuantity: s.minSz ? parseFloat(s.minSz) : undefined,
        maxQuantity: s.maxSz ? parseFloat(s.maxSz) : undefined,
        quantityPrecision: s.lotSz ? Math.ceil(-Math.log10(parseFloat(s.lotSz))) : 0,
        pricePrecision: s.tickSz ? Math.ceil(-Math.log10(parseFloat(s.tickSz))) : 0,
      }));
    } catch {
      return [];
    }
  }

  async copyClosePosition(params: import("./types").CopyClosePositionParams): Promise<import("./types").CopyTradingResult> {
    try {
      const closeParams: Record<string, unknown> = { instId: params.symbol };
      if (params.trackingNumber) closeParams.clOrdId = params.trackingNumber;

      const data = await this.signedRequest("POST", "/api/v5/trade/close-position", closeParams);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed" };
    }
  }

  async copyModifyTpsl(params: import("./types").CopyModifyTpslParams): Promise<import("./types").CopyTradingResult> {
    try {
      const modifyParams: Record<string, unknown> = { instId: params.symbol };
      if (params.takeProfit) modifyParams.tpTriggerPx = params.takeProfit.toString();
      if (params.stopLoss) modifyParams.slTriggerPx = params.stopLoss.toString();

      const data = await this.signedRequest("POST", "/api/v5/trade/order-algo", modifyParams);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed" };
    }
  }

  // ==================== MASTER TRADER METHODS ====================

  private masterTrader: import("./copy-trading/okx-master-trader").OKXMasterTrader | null = null;

  private async getMasterTrader(): Promise<import("./copy-trading/okx-master-trader").OKXMasterTrader> {
    if (!this.masterTrader) {
      const { OKXMasterTrader } = await import("./copy-trading/okx-master-trader");
      this.masterTrader = new OKXMasterTrader(this.signedRequest.bind(this));
    }
    return this.masterTrader;
  }

  async applyAsMasterTrader(application: import("./types").MasterTraderApplication): Promise<import("./types").MasterTraderResult> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.applyAsLeadTrader(application);
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
    return masterTrader.getProfitSharingDetails(startDate, endDate);
  }

  async getMasterPositions(): Promise<import("./types").MasterTraderPosition[]> {
    const masterTrader = await this.getMasterTrader();
    return masterTrader.getMasterPositions();
  }
}
