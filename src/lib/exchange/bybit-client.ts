/**
 * Bybit Exchange Client
 * 
 * Supports:
 * - Spot Trading
 * - USDT-M Futures (Linear)
 * - Inverse Futures
 * - Testnet: api-testnet.bybit.com
 * 
 * Uses V5 API (unified for all markets)
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
  TradingMode,
  EXCHANGE_CONFIGS,
} from "./types";

export class BybitClient extends BaseExchangeClient {
  private category: string;

  constructor(
    credentials: ApiCredentials,
    marketType: MarketType = "futures",
    testnet: boolean = false,
    tradingMode?: TradingMode
  ) {
    super("bybit", credentials, marketType, testnet, tradingMode);
    
    // Determine category for V5 API
    if (marketType === "spot") {
      this.category = "spot";
    } else if (marketType === "futures") {
      this.category = "linear";
    } else {
      this.category = "inverse";
    }
  }

  private generateSignature(timestamp: string, apiKey: string, recvWindow: number, queryString?: string): string {
    const message = timestamp + apiKey + recvWindow + (queryString || "");
    return crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(message)
      .digest("hex");
  }

  private async signedRequest(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    params: Record<string, unknown> = {},
    isOrder: boolean = false
  ): Promise<unknown> {
    await this.rateLimit(1, isOrder);

    const timestamp = Date.now().toString();
    const recvWindow = 10000; // Increased for testnet time sync issues

    let queryString = "";
    let body: string | undefined;

    if (method === "GET" && Object.keys(params).length > 0) {
      queryString = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
    } else if (method !== "GET") {
      body = JSON.stringify(params);
      queryString = JSON.stringify(params);
    }

    const signature = this.generateSignature(timestamp, this.credentials.apiKey, recvWindow, queryString);

    const url = new URL(endpoint, this.getBaseUrl());
    if (method === "GET" && queryString) {
      url.search = queryString;
    }

    const headers: Record<string, string> = {
      "X-BAPI-API-KEY": this.credentials.apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": String(recvWindow),
      "Content-Type": "application/json",
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
    });

    const data = await response.json() as {
      retCode: number;
      retMsg: string;
      result: unknown;
      time: number;
    };

    if (data.retCode !== 0) {
      // Special handling for timestamp issues
      if (data.retCode === 10002) {
        console.warn("[Bybit] Timestamp expired, consider syncing server time");
      }
      
      throw {
        exchange: "bybit",
        code: String(data.retCode),
        message: data.retMsg,
        timestamp: new Date(),
        retriable: data.retCode === 10002 || data.retCode === 429,
      };
    }

    return data.result;
  }

  // ==================== ACCOUNT INFO ====================

  async getAccountInfo(): Promise<AccountInfo> {
    const data = await this.signedRequest("GET", "/v5/account/wallet-balance", {
      accountType: this.category === "spot" ? "UNIFIED" : "UNIFIED",
    }) as {
      list: Array<{
        coin: Array<{
          coin: string;
          walletBalance: string;
          availableToWithdraw: string;
          locked: string;
          equity: string;
          unrealisedPnl: string;
          cumRealisedPnl: string;
        }>;
        totalEquity: string;
        totalAvailableBalance: string;
        totalMarginBalance: string;
        totalInitialMargin: string;
      }>;
    };

    const account = data.list?.[0];
    const balances: Balance[] = (account?.coin || [])
      .filter((c) => parseFloat(c.walletBalance) > 0)
      .map((c) => ({
        currency: c.coin,
        total: parseFloat(c.walletBalance),
        available: parseFloat(c.availableToWithdraw),
        frozen: parseFloat(c.locked),
        usdValue: parseFloat(c.equity),
        isDemo: this.isTestnet(),
      }));

    return {
      exchange: "bybit",
      balances,
      totalEquity: parseFloat(account?.totalEquity || "0"),
      availableMargin: parseFloat(account?.totalAvailableBalance || "0"),
      marginUsed: parseFloat(account?.totalInitialMargin || "0"),
      unrealizedPnl: 0,
      isDemo: this.isTestnet(),
    };
  }

  // ==================== ORDER MANAGEMENT ====================

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    try {
      const orderParams: Record<string, unknown> = {
        category: this.category,
        symbol: params.symbol,
        side: params.side.toUpperCase(),
        orderType: params.type === "market" ? "Market" : "Limit",
        qty: String(params.quantity),
        timeInForce: params.timeInForce || "GTC",
      };

      // For futures
      if (this.category !== "spot") {
        if (params.positionSide && params.positionSide !== "both") {
          orderParams.positionIdx = params.positionSide === "long" ? 1 : 2;
        }
        if (params.reduceOnly) {
          orderParams.reduceOnly = true;
        }
        if (params.leverage) {
          // Set leverage first
          await this.setLeverage({ symbol: params.symbol, leverage: params.leverage });
        }
      }

      if (params.price && params.type !== "market") {
        orderParams.price = String(params.price);
      }

      if (params.stopPrice) {
        orderParams.triggerPrice = String(params.stopPrice);
        orderParams.triggerDirection = params.side === "buy" ? 1 : 2;
      }

      if (params.clientOrderId) {
        orderParams.orderLinkId = params.clientOrderId;
      }

      const data = await this.signedRequest("POST", "/v5/order/create", orderParams, true) as {
        orderId: string;
        orderLinkId: string;
      };

      return {
        success: true,
        order: {
          id: data.orderId,
          clientOrderId: data.orderLinkId,
          exchange: "bybit",
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
          isDemo: this.isTestnet(),
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
      const cancelParams: Record<string, unknown> = {
        category: this.category,
        symbol: params.symbol,
      };

      if (params.orderId) {
        cancelParams.orderId = params.orderId;
      }
      if (params.clientOrderId) {
        cancelParams.orderLinkId = params.clientOrderId;
      }

      await this.signedRequest("POST", "/v5/order/cancel", cancelParams, true);

      return {
        success: true,
        order: {
          id: params.orderId || "",
          exchange: "bybit",
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
    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol) || null;
  }

  async getPositions(): Promise<Position[]> {
    if (this.category === "spot") {
      return [];
    }

    const data = await this.signedRequest("GET", "/v5/position/list", {
      category: this.category,
      settleCoin: "USDT",
    }) as {
      list: Array<{
        symbol: string;
        side: string;
        size: string;
        avgPrice: string;
        markPrice: string;
        unrealisedPnl: string;
        leverage: string;
        positionIM: string;
        liqPrice: string;
        createdTime: string;
        updatedTime: string;
        stopLoss: string;
        takeProfit: string;
      }>;
    };

    return (data.list || [])
      .filter((p) => parseFloat(p.size) !== 0)
      .map((p) => ({
        id: p.symbol,
        exchange: "bybit" as const,
        symbol: p.symbol,
        side: p.side.toLowerCase() as PositionSide,
        quantity: parseFloat(p.size),
        entryPrice: parseFloat(p.avgPrice),
        markPrice: parseFloat(p.markPrice),
        unrealizedPnl: parseFloat(p.unrealisedPnl),
        realizedPnl: 0,
        leverage: parseInt(p.leverage),
        marginMode: "cross" as const,
        margin: parseFloat(p.positionIM),
        liquidationPrice: parseFloat(p.liqPrice) || undefined,
        stopLoss: parseFloat(p.stopLoss) || undefined,
        takeProfit: parseFloat(p.takeProfit) || undefined,
        createdAt: new Date(parseInt(p.createdTime)),
        updatedAt: new Date(parseInt(p.updatedTime)),
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
    if (this.category === "spot") {
      throw new Error("Leverage not available for spot trading");
    }

    await this.signedRequest("POST", "/v5/position/set-leverage", {
      category: this.category,
      symbol: params.symbol,
      buyLeverage: String(params.leverage),
      sellLeverage: String(params.leverage),
    });

    return { success: true, leverage: params.leverage };
  }

  // ==================== MARKET DATA ====================

  async getTicker(symbol: string): Promise<Ticker> {
    const response = await fetch(
      `${this.getBaseUrl()}/v5/market/tickers?category=${this.category}&symbol=${symbol}`
    );
    const data = await response.json() as {
      retCode: number;
      result: {
        list: Array<{
          symbol: string;
          bid1Price: string;
          ask1Price: string;
          lastPrice: string;
          highPrice24h: string;
          lowPrice24h: string;
          volume24h: string;
          price24hPcnt: string;
        }>;
      };
    };

    if (data.retCode !== 0 || !data.result.list?.[0]) {
      throw new Error(`Ticker not found for ${symbol}`);
    }

    const ticker = data.result.list[0];

    return {
      symbol,
      exchange: "bybit",
      bid: parseFloat(ticker.bid1Price),
      ask: parseFloat(ticker.ask1Price),
      last: parseFloat(ticker.lastPrice),
      high24h: parseFloat(ticker.highPrice24h),
      low24h: parseFloat(ticker.lowPrice24h),
      volume24h: parseFloat(ticker.volume24h),
      change24h: parseFloat(ticker.price24hPcnt) * parseFloat(ticker.lastPrice),
      changePercent24h: parseFloat(ticker.price24hPcnt) * 100,
      timestamp: new Date(),
    };
  }

  async getFundingRate(symbol: string): Promise<FundingRate> {
    const response = await fetch(
      `${this.getBaseUrl()}/v5/market/funding/history?category=linear&symbol=${symbol}&limit=1`
    );
    const data = await response.json() as {
      retCode: number;
      result: {
        list: Array<{
          symbol: string;
          fundingRate: string;
          fundingRateTimestamp: string;
        }>;
      };
    };

    const funding = data.result.list?.[0];

    return {
      symbol,
      exchange: "bybit",
      rate: funding ? parseFloat(funding.fundingRate) : 0,
      nextFundingTime: new Date(Date.now() + 8 * 60 * 60 * 1000), // ~8 hours
      markPrice: 0,
      timestamp: new Date(),
    };
  }

  async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
    const response = await fetch(
      `${this.getBaseUrl()}/v5/market/orderbook?category=${this.category}&symbol=${symbol}&limit=${Math.min(depth, 200)}`
    );
    const data = await response.json() as {
      retCode: number;
      result: {
        b: Array<[string, string]>;  // [price, size]
        a: Array<[string, string]>;  // [price, size]
        ts: number;
      };
    };

    if (data.retCode !== 0) {
      throw new Error(`Bybit orderbook error: ${data.retCode}`);
    }

    const bids: OrderbookEntry[] = (data.result?.b || []).map(([price, size]) => ({
      price: parseFloat(price),
      quantity: parseFloat(size),
    }));

    const asks: OrderbookEntry[] = (data.result?.a || []).map(([price, size]) => ({
      price: parseFloat(price),
      quantity: parseFloat(size),
    }));

    return {
      symbol,
      exchange: "bybit",
      bids: bids.sort((a, b) => b.price - a.price), // Descending
      asks: asks.sort((a, b) => a.price - b.price), // Ascending
      timestamp: new Date(),
    };
  }

  // ==================== SERVER TIME SYNC ====================

  async getServerTime(): Promise<number> {
    const response = await fetch(`${this.getBaseUrl()}/v5/market/time`);
    const data = await response.json() as {
      retCode: number;
      result: { timeSecond: string; timeNano: string };
    };
    return parseInt(data.result.timeSecond) * 1000;
  }

  // ==================== CONNECTION TEST ====================

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAccountInfo();
      return { 
        success: true, 
        message: this.isTestnet() 
          ? "Testnet connection successful" 
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
    const positions = await this.getPositions();
    return positions.map(p => ({
      symbol: p.symbol,
      direction: p.side === "long" ? "LONG" as const : "SHORT" as const,
      size: p.quantity,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      unrealizedPnl: p.unrealizedPnl,
      leverage: p.leverage,
      marginMode: p.marginMode === "isolated" ? "ISOLATED" as const : "CROSS" as const,
      liquidationPrice: p.liquidationPrice,
      updatedAt: p.updatedAt,
    }));
  }

  async getSpotPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
    const accountInfo = await this.getAccountInfo();
    const positions: import("../position-sync-service").ExchangePosition[] = [];
    
    for (const balance of accountInfo.balances) {
      if (balance.total > 0 && balance.currency !== "USDT") {
        positions.push({
          symbol: `${balance.currency}USDT`,
          direction: "LONG",
          size: balance.total,
          entryPrice: 0,
          markPrice: balance.usdValue ? balance.usdValue / balance.total : 0,
          unrealizedPnl: 0,
          leverage: 1,
          updatedAt: new Date(),
        });
      }
    }
    
    return positions;
  }

  // ==================== MARK PRICE ====================

  async getMarkPrice(symbol: string): Promise<import("./types").MarkPrice> {
    const response = await fetch(
      `${this.getBaseUrl()}/v5/market/tickers?category=${this.category}&symbol=${symbol}`
    );
    const data = await response.json() as {
      retCode: number;
      result: {
        list: Array<{
          symbol: string;
          markPrice?: string;
          indexPrice?: string;
          lastPrice?: string;
          fundingRate?: string;
          nextFundingTime?: string;
        }>;
      };
    };

    if (data.retCode !== 0 || !data.result.list?.[0]) {
      throw new Error(`Failed to get mark price for ${symbol}`);
    }

    const ticker = data.result.list[0];

    return {
      symbol,
      exchange: "bybit",
      markPrice: parseFloat(ticker.markPrice || ticker.lastPrice || "0"),
      indexPrice: parseFloat(ticker.indexPrice || "0"),
      fundingRate: ticker.fundingRate ? parseFloat(ticker.fundingRate) : undefined,
      nextFundingTime: ticker.nextFundingTime ? new Date(parseInt(ticker.nextFundingTime)) : undefined,
      timestamp: new Date(),
    };
  }

  // ==================== OPEN ORDERS ====================

  async getOpenOrders(symbol?: string): Promise<import("./types").OpenOrder[]> {
    const params: Record<string, unknown> = {
      category: this.category,
      settleCoin: "USDT",
    };
    if (symbol) params.symbol = symbol;

    const data = await this.signedRequest("GET", "/v5/order/realtime", params) as {
      list: Array<{
        orderId: string;
        orderLinkId: string;
        symbol: string;
        side: string;
        orderType: string;
        orderStatus: string;
        price: string;
        avgPrice?: string;
        qty: string;
        cumExecQty?: string;
        createdTime: string;
        updatedTime: string;
        stopOrderType?: string;
        triggerPrice?: string;
        timeInForce?: string;
        positionIdx?: number;
        reduceOnly?: boolean;
        takeProfit?: string;
        stopLoss?: string;
      }>;
    };

    return (data.list || []).map((o) => ({
      id: o.orderId,
      clientOrderId: o.orderLinkId,
      exchange: "bybit" as const,
      symbol: o.symbol,
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.orderType.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.orderStatus),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.avgPrice || "0"),
      quantity: parseFloat(o.qty),
      filledQuantity: parseFloat(o.cumExecQty || "0"),
      remainingQuantity: parseFloat(o.qty) - parseFloat(o.cumExecQty || "0"),
      fee: 0,
      feeCurrency: "USDT",
      createdAt: new Date(parseInt(o.createdTime)),
      updatedAt: new Date(parseInt(o.updatedTime)),
      stopPrice: o.triggerPrice ? parseFloat(o.triggerPrice) : undefined,
      timeInForce: o.timeInForce,
      reduceOnly: o.reduceOnly,
      positionSide: o.positionIdx === 1 ? "long" : o.positionIdx === 2 ? "short" : undefined,
      takeProfitPrice: o.takeProfit ? parseFloat(o.takeProfit) : undefined,
      stopLossPrice: o.stopLoss ? parseFloat(o.stopLoss) : undefined,
      isDemo: this.isTestnet(),
    }));
  }

  private parseOrderStatus(status: string): "open" | "partial" | "filled" | "cancelled" | "expired" | "rejected" {
    const statusMap: Record<string, "open" | "partial" | "filled" | "cancelled" | "expired" | "rejected"> = {
      "New": "open",
      "PartiallyFilled": "partial",
      "Filled": "filled",
      "Cancelled": "cancelled",
      "Rejected": "rejected",
      "Deactivated": "expired",
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
    const params: Record<string, unknown> = {
      category: this.category,
      limit,
    };
    if (symbol) params.symbol = symbol;
    if (startTime) params.startTime = startTime.getTime();
    if (endTime) params.endTime = endTime.getTime();

    const data = await this.signedRequest("GET", "/v5/order/history", params) as {
      list: Array<{
        orderId: string;
        orderLinkId: string;
        symbol: string;
        side: string;
        orderType: string;
        orderStatus: string;
        price: string;
        avgPrice?: string;
        qty: string;
        cumExecQty?: string;
        cumExecFee?: string;
        feeCurrency?: string;
        createdTime: string;
        updatedTime: string;
        closedPnl?: string;
        stopOrderType?: string;
        triggerPrice?: string;
        timeInForce?: string;
        positionIdx?: number;
        reduceOnly?: boolean;
      }>;
    };

    return (data.list || []).map((o) => ({
      id: o.orderId,
      clientOrderId: o.orderLinkId,
      exchange: "bybit" as const,
      symbol: o.symbol,
      side: o.side.toLowerCase() as "buy" | "sell",
      type: o.orderType.toLowerCase() as "market" | "limit" | "stop_market" | "stop_limit",
      status: this.parseOrderStatus(o.orderStatus),
      price: parseFloat(o.price),
      avgPrice: parseFloat(o.avgPrice || "0"),
      quantity: parseFloat(o.qty),
      filledQuantity: parseFloat(o.cumExecQty || "0"),
      remainingQuantity: parseFloat(o.qty) - parseFloat(o.cumExecQty || "0"),
      fee: parseFloat(o.cumExecFee || "0"),
      feeCurrency: o.feeCurrency || "USDT",
      realizedPnl: o.closedPnl ? parseFloat(o.closedPnl) : undefined,
      createdAt: new Date(parseInt(o.createdTime)),
      updatedAt: new Date(parseInt(o.updatedTime)),
      stopPrice: o.triggerPrice ? parseFloat(o.triggerPrice) : undefined,
      timeInForce: o.timeInForce,
      reduceOnly: o.reduceOnly,
      positionSide: o.positionIdx === 1 ? "long" : o.positionIdx === 2 ? "short" : undefined,
      isDemo: this.isTestnet(),
    }));
  }

  // ==================== BALANCE HISTORY ====================

  async getBalanceHistory(params?: import("./types").BalanceHistoryParams): Promise<import("./types").BalanceHistoryItem[]> {
    // Bybit provides transaction history via /v5/account/transaction-logs
    try {
      const requestParams: Record<string, unknown> = {
        accountType: "UNIFIED",
        limit: params?.limit || 50,
      };
      if (params?.currency) requestParams.coin = params.currency;
      if (params?.startTime) requestParams.startTime = params.startTime.getTime();
      if (params?.endTime) requestParams.endTime = params.endTime.getTime();

      const data = await this.signedRequest("GET", "/v5/account/transaction-logs", requestParams) as {
        list: Array<{
          id: string;
          coin: string;
          type: string;
          amount: string;
          walletBalance?: string;
          transactionTime: string;
          info?: string;
        }>;
      };

      return (data.list || []).map((item) => ({
        id: item.id,
        exchange: "bybit" as const,
        accountId: "",
        currency: item.coin,
        changeType: this.mapTransactionTypeToChangeType(item.type),
        amount: parseFloat(item.amount),
        balanceBefore: 0, // Not directly provided
        balanceAfter: item.walletBalance ? parseFloat(item.walletBalance) : 0,
        timestamp: new Date(parseInt(item.transactionTime)),
        description: item.info || item.type,
      }));
    } catch {
      return [];
    }
  }

  private mapTransactionTypeToChangeType(type: string): import("./types").BalanceHistoryItem['changeType'] {
    switch (type) {
      case "TRANSFER_IN":
      case "TRANSFER_OUT":
        return "TRANSFER";
      case "TRADE":
        return "TRADE";
      case "FUNDING":
        return "FUNDING";
      case "FEE":
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

    const response = await fetch(
      `${this.getBaseUrl()}/v5/market/open-interest?category=${this.category}&symbol=${symbol}&intervalTime=5min`
    );
    const data = await response.json() as {
      retCode: number;
      retMsg?: string;
      result: {
        symbol: string;
        category: string;
        list: Array<{
          openInterest: string;
          timestamp: string;
        }>;
      };
    };

    if (data.retCode !== 0) {
      throw new Error(`Failed to get open interest for ${symbol}: ${data.retMsg || data.retCode}`);
    }

    // Get the most recent data point (first in the list)
    const latestOi = data.result.list?.[0];
    if (!latestOi) {
      throw new Error(`No open interest data available for ${symbol}`);
    }

    const openInterest = parseFloat(latestOi.openInterest);

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
      exchange: "bybit",
      openInterest,
      openInterestUsd: price > 0 ? openInterest * price : undefined,
      timestamp: new Date(parseInt(latestOi.timestamp)),
      price,
    };
  }
}
