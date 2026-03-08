// ============================================================
// DISABLED EXCHANGE CLIENT
// Uncomment to re-enable this exchange
// ============================================================
// /**
//  * BitMEX Exchange Client
//  * 
//  * Supports:
//  * - Inverse Futures (XBT-margined)
//  * - Testnet: testnet.bitmex.com
//  * 
//  * Testnet Details:
//  * - Separate registration on testnet.bitmex.com
//  * - Faucet for test XBT
//  * - Supports bulk orders (up to 10 per request)
//  * - Rate limit uses "points" system
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
// export class BitmexClient extends BaseExchangeClient {
//   constructor(
//     credentials: ApiCredentials,
//     marketType: MarketType = "inverse",
//     testnet: boolean = false,
//     tradingMode?: TradingMode
//   ) {
//     super("bitmex", credentials, "inverse", testnet, tradingMode);
//   }
// 
//   private generateSignature(verb: string, path: string, expires: number, data?: string): string {
//     const message = verb + path + expires + (data || "");
//     return crypto
//       .createHmac("sha256", this.credentials.apiSecret)
//       .update(message)
//       .digest("hex");
//   }
// 
//   private getHeaders(verb: string, path: string, data?: string): Record<string, string> {
//     const expires = Math.floor(Date.now() / 1000) + 5;
//     return {
//       "api-expires": String(expires),
//       "api-key": this.credentials.apiKey,
//       "api-signature": this.generateSignature(verb, path, expires, data),
//       "Content-Type": "application/json",
//     };
//   }
// 
//   // ==================== ACCOUNT INFO ====================
// 
//   async getAccountInfo(): Promise<AccountInfo> {
//     const path = "/api/v1/user/margin";
//     const headers = this.getHeaders("GET", path);
//     const response = await fetch(`${this.getBaseUrl()}${path}`, { headers });
//     const data = await response.json() as {
//       marginBalance: number;
//       availableMargin: number;
//       marginUsedPcnt: number;
//       unrealisedPnl: number;
//     };
// 
//     const totalXbt = data.marginBalance / 100000000;
// 
//     return {
//       exchange: "bitmex",
//       balances: [{ 
//         currency: "XBT", 
//         total: totalXbt, 
//         available: data.availableMargin / 100000000, 
//         frozen: (data.marginBalance - data.availableMargin) / 100000000,
//         isDemo: this.isTestnet(),
//       }],
//       totalEquity: totalXbt,
//       availableMargin: data.availableMargin / 100000000,
//       marginUsed: data.marginBalance * data.marginUsedPcnt / 100000000,
//       unrealizedPnl: data.unrealisedPnl / 100000000,
//       isDemo: this.isTestnet(),
//     };
//   }
// 
//   // ==================== ORDER MANAGEMENT ====================
// 
//   async createOrder(params: CreateOrderParams): Promise<OrderResult> {
//     const body = JSON.stringify({
//       symbol: params.symbol,
//       side: params.side === "buy" ? "Buy" : "Sell",
//       orderQty: params.quantity,
//       ordType: params.type === "market" ? "Market" : "Limit",
//       price: params.price,
//       clOrdID: params.clientOrderId,
//     });
// 
//     const path = "/api/v1/order";
//     const headers = this.getHeaders("POST", path, body);
// 
//     try {
//       const response = await fetch(`${this.getBaseUrl()}${path}`, {
//         method: "POST",
//         headers,
//         body,
//       });
//       const data = await response.json() as { orderID: string; error?: string };
// 
//       if (data.error) {
//         return { success: false, error: data.error };
//       }
// 
//       return {
//         success: true,
//         order: {
//           id: data.orderID,
//           exchange: "bitmex",
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
//           feeCurrency: "XBT",
//           isDemo: this.isTestnet(),
//         },
//       };
//     } catch (error) {
//       return { 
//         success: false, 
//         error: error instanceof Error ? error.message : "Unknown error" 
//       };
//     }
//   }
// 
//   async cancelOrder(params: CancelOrderParams): Promise<OrderResult> {
//     const body = JSON.stringify({ orderID: params.orderId });
//     const path = "/api/v1/order";
//     const headers = this.getHeaders("DELETE", path, body);
// 
//     try {
//       await fetch(`${this.getBaseUrl()}${path}`, { method: "DELETE", headers, body });
//       return { success: true };
//     } catch (error) {
//       return { 
//         success: false, 
//         error: error instanceof Error ? error.message : "Unknown error" 
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
//     const path = "/api/v1/position";
//     const headers = this.getHeaders("GET", path);
//     const response = await fetch(`${this.getBaseUrl()}${path}`, { headers });
//     const data = await response.json() as Array<{
//       symbol: string;
//       currentQty: number;
//       avgEntryPrice: number;
//       markPrice: number;
//       unrealisedPnl: number;
//       leverage: number;
//       maintMargin: number;
//       liquidationPrice: number;
//     }>;
// 
//     return data
//       .filter((p) => p.currentQty !== 0)
//       .map((p) => ({
//         id: p.symbol,
//         exchange: "bitmex" as const,
//         symbol: p.symbol,
//         side: p.currentQty > 0 ? "long" as const : "short" as const,
//         quantity: Math.abs(p.currentQty),
//         entryPrice: p.avgEntryPrice,
//         markPrice: p.markPrice,
//         unrealizedPnl: p.unrealisedPnl / 100000000,
//         realizedPnl: 0,
//         leverage: p.leverage,
//         marginMode: "cross" as const,
//         margin: p.maintMargin / 100000000,
//         liquidationPrice: p.liquidationPrice || undefined,
//         createdAt: new Date(),
//         updatedAt: new Date(),
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
//     });
//   }
// 
//   // ==================== LEVERAGE ====================
// 
//   async setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
//     const body = JSON.stringify({ symbol: params.symbol, leverage: params.leverage });
//     const path = "/api/v1/position/leverage";
//     const headers = this.getHeaders("POST", path, body);
// 
//     try {
//       await fetch(`${this.getBaseUrl()}${path}`, { method: "POST", headers, body });
//       return { success: true, leverage: params.leverage };
//     } catch {
//       return { success: false, leverage: 0 };
//     }
//   }
// 
//   // ==================== MARKET DATA ====================
// 
//   async getTicker(symbol: string): Promise<Ticker> {
//     const response = await fetch(`${this.getBaseUrl()}/api/v1/instrument?symbol=${symbol}`);
//     const data = await response.json() as Array<{
//       bidPrice: number;
//       askPrice: number;
//       lastPrice: number;
//       highPrice: number;
//       lowPrice: number;
//       volume24h: number;
//     }>;
// 
//     const ticker = data[0];
//     if (!ticker) throw new Error(`Ticker not found for ${symbol}`);
// 
//     return {
//       symbol,
//       exchange: "bitmex",
//       bid: ticker.bidPrice,
//       ask: ticker.askPrice,
//       last: ticker.lastPrice,
//       high24h: ticker.highPrice,
//       low24h: ticker.lowPrice,
//       volume24h: ticker.volume24h,
//       change24h: 0,
//       changePercent24h: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getFundingRate(symbol: string): Promise<FundingRate> {
//     const response = await fetch(`${this.getBaseUrl()}/api/v1/instrument?symbol=${symbol}`);
//     const data = await response.json() as Array<{
//       fundingRate: number;
//       fundingTimestamp: string;
//       markPrice: number;
//     }>;
// 
//     const ticker = data[0];
//     return {
//       symbol,
//       exchange: "bitmex",
//       rate: ticker?.fundingRate || 0,
//       nextFundingTime: new Date(ticker?.fundingTimestamp || Date.now()),
//       markPrice: ticker?.markPrice || 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
//     throw new Error("getOrderbook not implemented for bitmex");
//   }
// 
//   // ==================== BULK ORDERS ====================
// 
//   /**
//    * Place multiple orders in a single request (up to 10)
//    */
//   async createBulkOrders(orders: CreateOrderParams[]): Promise<OrderResult[]> {
//     const body = JSON.stringify({
//       orders: orders.map((o) => ({
//         symbol: o.symbol,
//         side: o.side === "buy" ? "Buy" : "Sell",
//         orderQty: o.quantity,
//         ordType: o.type === "market" ? "Market" : "Limit",
//         price: o.price,
//       })),
//     });
// 
//     const path = "/api/v1/order/bulk";
//     const headers = this.getHeaders("POST", path, body);
// 
//     try {
//       const response = await fetch(`${this.getBaseUrl()}${path}`, {
//         method: "POST",
//         headers,
//         body,
//       });
//       const data = await response.json() as Array<{ orderID: string }> | { error: string };
// 
//       if ("error" in data) {
//         return orders.map(() => ({ success: false, error: data.error }));
//       }
// 
//       return data.map((o, i) => ({
//         success: true,
//         order: {
//           id: o.orderID,
//           exchange: "bitmex",
//           symbol: orders[i].symbol,
//           side: orders[i].side,
//           type: orders[i].type,
//           status: "open" as const,
//           price: orders[i].price || 0,
//           quantity: orders[i].quantity,
//           filledQuantity: 0,
//           remainingQuantity: orders[i].quantity,
//           createdAt: new Date(),
//           updatedAt: new Date(),
//           fee: 0,
//           feeCurrency: "XBT",
//           isDemo: this.isTestnet(),
//         },
//       }));
//     } catch (error) {
//       const errorMsg = error instanceof Error ? error.message : "Unknown error";
//       return orders.map(() => ({ success: false, error: errorMsg }));
//     }
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
//           ? "Testnet connection successful" 
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
