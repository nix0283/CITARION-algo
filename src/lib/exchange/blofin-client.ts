// ============================================================
// DISABLED EXCHANGE CLIENT
// Uncomment to re-enable this exchange
// ============================================================
// /**
//  * BloFin Exchange Client
//  * 
//  * Supports:
//  * - Futures Trading (USDT-M)
//  * - Demo Trading via demo API keys
//  * 
//  * Demo Details:
//  * - Uses same endpoint as production
//  * - Requires demo-specific API keys
//  * - Initial balance: 100,000 USDT
//  * - API structure similar to OKX V1
//  */
// 
// import crypto from "crypto";
// import { BaseExchangeClient } from "./base-client";
// import {
//   ApiCredentials,
//   MarketType,
//   OrderResult,
//   CreateOrderParams,
//   CancelOrderParams,
//   ClosePositionParams,
//   SetLeverageParams,
//   AccountInfo,
//   Position,
//   Ticker,
//   FundingRate,
//   Balance,
//   PositionSide,
//   TradingMode,
//   Orderbook,
//   OrderbookEntry,
// } from "./types";
// 
// export class BlofinClient extends BaseExchangeClient {
//   constructor(
//     credentials: ApiCredentials,
//     marketType: MarketType = "futures",
//     testnet: boolean = false,
//     tradingMode?: TradingMode
//   ) {
//     super("blofin", credentials, marketType, testnet, tradingMode);
//   }
// 
//   private generateSignature(timestamp: string, method: string, path: string, body?: string): string {
//     const message = timestamp + method + path + (body || "");
//     return crypto
//       .createHmac("sha256", this.credentials.apiSecret)
//       .update(message)
//       .digest("base64");
//   }
// 
//   private getHeaders(method: string, path: string, body?: string): Record<string, string> {
//     const timestamp = new Date().toISOString();
//     return {
//       "ACCESS-KEY": this.credentials.apiKey,
//       "ACCESS-SIGN": this.generateSignature(timestamp, method, path, body),
//       "ACCESS-TIMESTAMP": timestamp,
//       "ACCESS-PASSPHRASE": this.credentials.passphrase || "",
//       "Content-Type": "application/json",
//     };
//   }
// 
//   private async signedRequest(
//     method: "GET" | "POST" | "DELETE",
//     path: string,
//     params: Record<string, unknown> = {},
//     isOrder: boolean = false
//   ): Promise<unknown> {
//     await this.rateLimit(1, isOrder);
// 
//     let fullPath = path;
//     let body: string | undefined;
// 
//     if (method === "GET" && Object.keys(params).length > 0) {
//       const queryString = Object.entries(params)
//         .filter(([_, v]) => v !== undefined && v !== null)
//         .map(([k, v]) => `${k}=${v}`)
//         .join("&");
//       fullPath = `${path}?${queryString}`;
//     } else if (method !== "GET") {
//       body = JSON.stringify(params);
//     }
// 
//     const headers = this.getHeaders(method, fullPath, body);
// 
//     const response = await fetch(`${this.getBaseUrl()}${fullPath}`, {
//       method,
//       headers,
//       body,
//     });
// 
//     const data = await response.json() as {
//       code: string;
//       msg: string;
//       data: unknown;
//     };
// 
//     if (data.code !== "0") {
//       throw {
//         exchange: "blofin",
//         code: data.code,
//         message: data.msg,
//         timestamp: new Date(),
//         retriable: false,
//       };
//     }
// 
//     return data.data;
//   }
// 
//   // ==================== ACCOUNT INFO ====================
// 
//   async getAccountInfo(): Promise<AccountInfo> {
//     const data = await this.signedRequest("GET", "/api/v1/account/balance") as Array<{
//       details: Array<{ ccy: string; cashBal: string; availBal: string; frozenBal: string }>;
//       totalEq: string;
//     }>;
// 
//     const account = data?.[0];
//     const balances: Balance[] = (account?.details || [])
//       .map((d) => ({
//         currency: d.ccy,
//         total: parseFloat(d.cashBal),
//         available: parseFloat(d.availBal),
//         frozen: parseFloat(d.frozenBal),
//         isDemo: this.isDemo(),
//       }))
//       .filter((b) => b.total > 0);
// 
//     return {
//       exchange: "blofin",
//       balances,
//       totalEquity: parseFloat(account?.totalEq || "0"),
//       availableMargin: balances.reduce((s, b) => s + b.available, 0),
//       marginUsed: balances.reduce((s, b) => s + b.frozen, 0),
//       unrealizedPnl: 0,
//       isDemo: this.isDemo(),
//     };
//   }
// 
//   // ==================== ORDER MANAGEMENT ====================
// 
//   async createOrder(params: CreateOrderParams): Promise<OrderResult> {
//     try {
//       const data = await this.signedRequest("POST", "/api/v1/trade/order", {
//         instId: params.symbol,
//         tdMode: "cross",
//         side: params.side === "buy" ? "buy" : "sell",
//         posSide: params.positionSide === "short" ? "short" : "long",
//         ordType: params.type === "market" ? "market" : "limit",
//         sz: String(params.quantity),
//         px: params.price ? String(params.price) : undefined,
//         clOrdId: params.clientOrderId,
//       }, true) as { ordId: string };
// 
//       return {
//         success: true,
//         order: {
//           id: data.ordId,
//           exchange: "blofin",
//           symbol: params.symbol,
//           side: params.side,
//           type: params.type,
//           status: "open",
//           price: params.price || 0,
//           quantity: params.quantity,
//           filledQuantity: 0,
//           remainingQuantity: params.quantity,
//           createdAt: new Date(),
//           updatedAt: new Date(),
//           fee: 0,
//           feeCurrency: "",
//           isDemo: this.isDemo(),
//         },
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: error instanceof Error ? error.message : "Unknown error",
//       };
//     }
//   }
// 
//   async cancelOrder(params: CancelOrderParams): Promise<OrderResult> {
//     try {
//       await this.signedRequest("POST", "/api/v1/trade/cancel-order", {
//         instId: params.symbol,
//         ordId: params.orderId,
//       }, true);
// 
//       return { success: true };
//     } catch (error) {
//       return {
//         success: false,
//         error: error instanceof Error ? error.message : "Unknown error",
//       };
//     }
//   }
// 
//   // ==================== POSITION MANAGEMENT ====================
// 
//   async getPosition(symbol: string): Promise<Position | null> {
//     const positions = await this.getPositions();
//     return positions.find((p) => p.symbol === symbol) || null;
//   }
// 
//   async getPositions(): Promise<Position[]> {
//     const data = await this.signedRequest("GET", "/api/v1/account/positions") as Array<{
//       instId: string;
//       posSide: string;
//       pos: string;
//       avgPx: string;
//       markPx: string;
//       upl: string;
//       lever: string;
//       margin: string;
//       liqPx: string;
//       cTime: string;
//       uTime: string;
//     }>;
// 
//     return (data || [])
//       .filter((p) => parseFloat(p.pos) !== 0)
//       .map((p) => ({
//         id: p.instId,
//         exchange: "blofin" as const,
//         symbol: p.instId,
//         side: p.posSide.toLowerCase() as PositionSide,
//         quantity: Math.abs(parseFloat(p.pos)),
//         entryPrice: parseFloat(p.avgPx),
//         markPrice: parseFloat(p.markPx),
//         unrealizedPnl: parseFloat(p.upl),
//         realizedPnl: 0,
//         leverage: parseInt(p.lever),
//         marginMode: "cross" as const,
//         margin: parseFloat(p.margin),
//         liquidationPrice: parseFloat(p.liqPx) || undefined,
//         createdAt: new Date(parseInt(p.cTime)),
//         updatedAt: new Date(parseInt(p.uTime)),
//       }));
//   }
// 
//   async closePosition(params: ClosePositionParams): Promise<OrderResult> {
//     const position = await this.getPosition(params.symbol);
//     if (!position) {
//       return { success: false, error: "Position not found" };
//     }
// 
//     return this.createOrder({
//       symbol: params.symbol,
//       side: position.side === "long" ? "sell" : "buy",
//       type: "market",
//       quantity: params.quantity || position.quantity,
//       reduceOnly: true,
//     });
//   }
// 
//   // ==================== LEVERAGE ====================
// 
//   async setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
//     try {
//       await this.signedRequest("POST", "/api/v1/account/set-leverage", {
//         instId: params.symbol,
//         lever: String(params.leverage),
//         mgnMode: params.marginMode === "isolated" ? "isolated" : "cross",
//       });
//       return { success: true, leverage: params.leverage };
//     } catch {
//       return { success: false, leverage: 0 };
//     }
//   }
// 
//   // ==================== MARKET DATA ====================
// 
//   async getTicker(symbol: string): Promise<Ticker> {
//     const response = await fetch(`${this.getBaseUrl()}/api/v1/market/tickers?instType=SWAP`);
//     const data = await response.json() as {
//       code: string;
//       data: Array<{
//         instId: string;
//         last: string;
//         bidPx: string;
//         askPx: string;
//         high24h: string;
//         low24h: string;
//         vol24h: string;
//       }>;
//     };
// 
//     const ticker = data.data?.find((t) => t.instId === symbol);
//     
//     return {
//       symbol,
//       exchange: "blofin",
//       bid: parseFloat(ticker?.bidPx || "0"),
//       ask: parseFloat(ticker?.askPx || "0"),
//       last: parseFloat(ticker?.last || "0"),
//       high24h: parseFloat(ticker?.high24h || "0"),
//       low24h: parseFloat(ticker?.low24h || "0"),
//       volume24h: parseFloat(ticker?.vol24h || "0"),
//       change24h: 0,
//       changePercent24h: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getFundingRate(symbol: string): Promise<FundingRate> {
//     const response = await fetch(
//       `${this.getBaseUrl()}/api/v1/public/funding-rate?instId=${symbol}`
//     );
//     const data = await response.json() as {
//       code: string;
//       data: {
//         fundingRate: string;
//         nextFundingRate: string;
//         nextFundingTime: string;
//         method: string;
//       };
//     };
// 
//     return {
//       symbol,
//       exchange: "blofin",
//       rate: parseFloat(data.data?.fundingRate || "0"),
//       nextFundingTime: new Date(parseInt(data.data?.nextFundingTime || "0")),
//       markPrice: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
//     throw new Error("getOrderbook not implemented for blofin");
//   }
// 
//   // ==================== CONNECTION TEST ====================
// 
//   async testConnection(): Promise<{ success: boolean; message: string }> {
//     try {
//       await this.getAccountInfo();
//       return { 
//         success: true, 
//         message: this.isDemo() 
//           ? "Demo connection successful" 
//           : "Connection successful" 
//       };
//     } catch (error) {
//       return { 
//         success: false, 
//         message: error instanceof Error ? error.message : "Connection failed" 
//       };
//     }
//   }
//   // ==================== POSITION SYNC METHODS ====================
// 
//   async getFuturesPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
//     return [];
//   }
// 
//   async getSpotPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
//     return [];
//   }
// }
