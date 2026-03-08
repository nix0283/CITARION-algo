// ============================================================
// DISABLED EXCHANGE CLIENT
// Uncomment to re-enable this exchange
// ============================================================
// /**
//  * KuCoin Exchange Client
//  * 
//  * Supports:
//  * - Spot Trading
//  * - Futures Trading
//  * - Sandbox: openapi-sandbox.kucoin.com
//  * 
//  * Uses V1/V2 API
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
//   Order,
//   PositionSide,
//   TradingMode,
//   EXCHANGE_CONFIGS,
//   Orderbook,
//   OrderbookEntry,
// } from "./types";
// 
// export class KucoinClient extends BaseExchangeClient {
//   constructor(
//     credentials: ApiCredentials,
//     marketType: MarketType = "spot",
//     testnet: boolean = false,
//     tradingMode?: TradingMode
//   ) {
//     super("kucoin", credentials, marketType, testnet, tradingMode);
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
//     const timestamp = Date.now().toString();
//     const signature = this.generateSignature(timestamp, method, path, body);
//     
//     return {
//       "KC-API-KEY": this.credentials.apiKey,
//       "KC-API-SIGN": signature,
//       "KC-API-TIMESTAMP": timestamp,
//       "KC-API-PASSPHRASE": this.credentials.passphrase || "",
//       "KC-API-KEY-VERSION": "2",
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
//     if (data.code !== "200000") {
//       throw {
//         exchange: "kucoin",
//         code: data.code,
//         message: data.msg,
//         timestamp: new Date(),
//         retriable: data.code === "429000" || data.code === "400100",
//       };
//     }
// 
//     return data.data;
//   }
// 
//   // ==================== ACCOUNT INFO ====================
// 
//   async getAccountInfo(): Promise<AccountInfo> {
//     if (this.marketType === "spot") {
//       const data = await this.signedRequest("GET", "/api/v1/accounts") as Array<{
//         id: string;
//         currency: string;
//         type: string;
//         balance: string;
//         available: string;
//         holds: string;
//       }>;
// 
//       const balances: Balance[] = data
//         .filter((a) => parseFloat(a.balance) > 0)
//         .map((a) => ({
//           currency: a.currency,
//           total: parseFloat(a.balance),
//           available: parseFloat(a.available),
//           frozen: parseFloat(a.holds),
//           isDemo: this.isTestnet(),
//         }));
// 
//       return {
//         exchange: "kucoin",
//         balances,
//         totalEquity: balances.reduce((s, b) => s + b.total, 0),
//         availableMargin: balances.find((b) => b.currency === "USDT")?.available || 0,
//         marginUsed: 0,
//         unrealizedPnl: 0,
//         isDemo: this.isTestnet(),
//       };
//     }
// 
//     // Futures account
//     const data = await this.signedRequest("GET", "/api/v1/account-overview", {
//       currency: "USDT",
//     }) as {
//       accountEquity: string;
//       availableBalance: string;
//       frozenFunds: string;
//       unrealisedPNL: string;
//     };
// 
//     const balances: Balance[] = [{
//       currency: "USDT",
//       total: parseFloat(data.accountEquity),
//       available: parseFloat(data.availableBalance),
//       frozen: parseFloat(data.frozenFunds),
//       isDemo: this.isTestnet(),
//     }];
// 
//     return {
//       exchange: "kucoin",
//       balances,
//       totalEquity: parseFloat(data.accountEquity),
//       availableMargin: parseFloat(data.availableBalance),
//       marginUsed: parseFloat(data.frozenFunds),
//       unrealizedPnl: parseFloat(data.unrealisedPNL),
//       isDemo: this.isTestnet(),
//     };
//   }
// 
//   // ==================== ORDER MANAGEMENT ====================
// 
//   async createOrder(params: CreateOrderParams): Promise<OrderResult> {
//     try {
//       if (this.marketType === "spot") {
//         const orderParams: Record<string, unknown> = {
//           symbol: params.symbol,
//           side: params.side,
//           type: params.type,
//           size: String(params.quantity),
//         };
// 
//         if (params.price && params.type === "limit") {
//           orderParams.price = String(params.price);
//         }
// 
//         if (params.clientOrderId) {
//           orderParams.clientOid = params.clientOrderId;
//         }
// 
//         const data = await this.signedRequest("POST", "/api/v1/orders", orderParams, true) as {
//           orderId: string;
//         };
// 
//         return {
//           success: true,
//           order: {
//             id: data.orderId,
//             exchange: "kucoin",
//             symbol: params.symbol,
//             side: params.side,
//             type: params.type,
//             status: "open",
//             price: params.price || 0,
//             quantity: params.quantity,
//             filledQuantity: 0,
//             remainingQuantity: params.quantity,
//             createdAt: new Date(),
//             updatedAt: new Date(),
//             fee: 0,
//             feeCurrency: "",
//             isDemo: this.isTestnet(),
//           },
//         };
//       }
// 
//       // Futures order
//       const orderParams: Record<string, unknown> = {
//         symbol: params.symbol,
//         side: params.side === "buy" ? "buy" : "sell",
//         type: params.type === "market" ? "market" : "limit",
//         size: String(params.quantity),
//         lever: params.leverage || 10,
//       };
// 
//       if (params.price && params.type === "limit") {
//         orderParams.price = String(params.price);
//       }
// 
//       if (params.clientOrderId) {
//         orderParams.clientOid = params.clientOrderId;
//       }
// 
//       const data = await this.signedRequest("POST", "/api/v1/orders", orderParams, true) as {
//         orderId: string;
//       };
// 
//       return {
//         success: true,
//         order: {
//           id: data.orderId,
//           exchange: "kucoin",
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
//           feeCurrency: "USDT",
//           isDemo: this.isTestnet(),
//         },
//       };
//     } catch (error) {
//       const err = error as { message?: string };
//       return {
//         success: false,
//         error: err.message || "Unknown error",
//       };
//     }
//   }
// 
//   async cancelOrder(params: CancelOrderParams): Promise<OrderResult> {
//     try {
//       if (this.marketType === "spot") {
//         await this.signedRequest("DELETE", `/api/v1/orders/${params.orderId}`, {}, true);
//       } else {
//         await this.signedRequest("DELETE", `/api/v1/orders/${params.orderId}`, {}, true);
//       }
// 
//       return {
//         success: true,
//         order: {
//           id: params.orderId || "",
//           exchange: "kucoin",
//           symbol: params.symbol,
//           side: "buy",
//           type: "limit",
//           status: "cancelled",
//           price: 0,
//           quantity: 0,
//           filledQuantity: 0,
//           remainingQuantity: 0,
//           createdAt: new Date(),
//           updatedAt: new Date(),
//           fee: 0,
//           feeCurrency: "",
//           isDemo: this.isTestnet(),
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
//   // ==================== POSITION MANAGEMENT ====================
// 
//   async getPosition(symbol: string): Promise<Position | null> {
//     const positions = await this.getPositions();
//     return positions.find((p) => p.symbol === symbol) || null;
//   }
// 
//   async getPositions(): Promise<Position[]> {
//     if (this.marketType === "spot") {
//       return [];
//     }
// 
//     const data = await this.signedRequest("GET", "/api/v1/positions") as Array<{
//       id: string;
//       symbol: string;
//       side: string;
//       size: number;
//       entryPrice: number;
//       markPrice: number;
//       unrealisedPnl: number;
//       leverage: number;
//       margin: number;
//       liquidationPrice: number;
//       createdAt: number;
//       updatedAt: number;
//     }>;
// 
//     return (data || [])
//       .filter((p) => p.size !== 0)
//       .map((p) => ({
//         id: p.id,
//         exchange: "kucoin" as const,
//         symbol: p.symbol,
//         side: p.side.toLowerCase() as PositionSide,
//         quantity: Math.abs(p.size),
//         entryPrice: p.entryPrice,
//         markPrice: p.markPrice,
//         unrealizedPnl: p.unrealisedPnl,
//         realizedPnl: 0,
//         leverage: p.leverage,
//         marginMode: "cross" as const,
//         margin: p.margin,
//         liquidationPrice: p.liquidationPrice || undefined,
//         createdAt: new Date(p.createdAt),
//         updatedAt: new Date(p.updatedAt),
//       }));
//   }
// 
//   async closePosition(params: ClosePositionParams): Promise<OrderResult> {
//     const position = await this.getPosition(params.symbol);
//     if (!position) {
//       return { success: false, error: "Position not found" };
//     }
// 
//     const closeSide = position.side === "long" ? "sell" : "buy";
//     
//     return this.createOrder({
//       symbol: params.symbol,
//       side: closeSide,
//       type: "market",
//       quantity: params.quantity || position.quantity,
//       reduceOnly: true,
//     });
//   }
// 
//   // ==================== LEVERAGE ====================
// 
//   async setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
//     if (this.marketType === "spot") {
//       throw new Error("Leverage not available for spot trading");
//     }
// 
//     await this.signedRequest("POST", "/api/v1/position/leverage", {
//       symbol: params.symbol,
//       leverage: String(params.leverage),
//     });
// 
//     return { success: true, leverage: params.leverage };
//   }
// 
//   // ==================== MARKET DATA ====================
// 
//   async getTicker(symbol: string): Promise<Ticker> {
//     if (this.marketType === "spot") {
//       const response = await fetch(
//         `${this.getBaseUrl()}/api/v1/market/orderbook/level1?symbol=${symbol}`
//       );
//       const data = await response.json() as {
//         code: string;
//         data: {
//           sequence: string;
//           size: string;
//           price: string;
//           bestBid: string;
//           bestAsk: string;
//         };
//       };
// 
//       return {
//         symbol,
//         exchange: "kucoin",
//         bid: parseFloat(data.data.bestBid),
//         ask: parseFloat(data.data.bestAsk),
//         last: parseFloat(data.data.price),
//         high24h: 0,
//         low24h: 0,
//         volume24h: 0,
//         change24h: 0,
//         changePercent24h: 0,
//         timestamp: new Date(),
//       };
//     }
// 
//     // Futures ticker
//     const response = await fetch(
//       `${this.getBaseUrl()}/api/v1/ticker?symbol=${symbol}`
//     );
//     const data = await response.json() as {
//       code: string;
//       data: {
//         symbol: string;
//         buy: number;
//         sell: number;
//         last: number;
//         high: number;
//         low: number;
//         vol: number;
//         changeRate: number;
//       };
//     };
// 
//     return {
//       symbol,
//       exchange: "kucoin",
//       bid: data.data.buy,
//       ask: data.data.sell,
//       last: data.data.last,
//       high24h: data.data.high,
//       low24h: data.data.low,
//       volume24h: data.data.vol,
//       change24h: data.data.changeRate * data.data.last,
//       changePercent24h: data.data.changeRate * 100,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getFundingRate(symbol: string): Promise<FundingRate> {
//     const response = await fetch(
//       `${this.getBaseUrl()}/api/v1/funding-rate?symbol=${symbol}`
//     );
//     const data = await response.json() as {
//       code: string;
//       data: {
//         symbol: string;
//         fundingRate: number;
//         timepoint: number;
//       };
//     };
// 
//     return {
//       symbol,
//       exchange: "kucoin",
//       rate: data.data.fundingRate,
//       nextFundingTime: new Date(data.data.timepoint + 8 * 60 * 60 * 1000),
//       markPrice: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
//     throw new Error("getOrderbook not implemented for kucoin");
//   }
// 
//   // ==================== INNER TRANSFER ====================
// 
//   /**
//    * Transfer funds between accounts (main <-> trade)
//    * Required in KuCoin Sandbox before trading
//    */
//   async innerTransfer(params: {
//     currency: string;
//     from: "main" | "trade" | "contract";
//     to: "main" | "trade" | "contract";
//     amount: number;
//   }): Promise<{ success: boolean; orderId: string }> {
//     const data = await this.signedRequest("POST", "/api/v1/accounts/inner-transfer", {
//       clientOid: `transfer_${Date.now()}`,
//       currency: params.currency,
//       from: params.from,
//       to: params.to,
//       amount: String(params.amount),
//     }) as { orderId: string };
// 
//     return { success: true, orderId: data.orderId };
//   }
// 
//   // ==================== CONNECTION TEST ====================
// 
//   async testConnection(): Promise<{ success: boolean; message: string }> {
//     try {
//       await this.getAccountInfo();
//       return { 
//         success: true, 
//         message: this.isTestnet() 
//           ? "Sandbox connection successful" 
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
