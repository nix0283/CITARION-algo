// ============================================================
// DISABLED EXCHANGE CLIENT
// Uncomment to re-enable this exchange
// ============================================================
// /**
//  * Coinbase Exchange Client
//  * 
//  * Supports:
//  * - Spot Trading only
//  * - Sandbox: api-public.sandbox.exchange.coinbase.com
//  * 
//  * Sandbox Details:
//  * - Separate registration on public.sandbox.exchange.coinbase.com
//  * - Faucet for test BTC, ETH, USD
//  * - Uses Advanced Trade API (V3)
//  * - Strict rate limits: ~5 requests/second
//  * - Self-Trade Prevention (STP) enabled by default
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
//   TradingMode,
//   Orderbook,
//   OrderbookEntry,
// } from "./types";
// 
// export class CoinbaseClient extends BaseExchangeClient {
//   constructor(
//     credentials: ApiCredentials,
//     marketType: MarketType = "spot",
//     testnet: boolean = false,
//     tradingMode?: TradingMode
//   ) {
//     super("coinbase", credentials, "spot", testnet, tradingMode);
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
//     const timestamp = Math.floor(Date.now() / 1000).toString();
//     return {
//       "CB-ACCESS-KEY": this.credentials.apiKey,
//       "CB-ACCESS-SIGN": this.generateSignature(timestamp, method, path, body),
//       "CB-ACCESS-TIMESTAMP": timestamp,
//       "CB-ACCESS-PASSPHRASE": this.credentials.passphrase || "",
//       "Content-Type": "application/json",
//     };
//   }
// 
//   // ==================== ACCOUNT INFO ====================
// 
//   async getAccountInfo(): Promise<AccountInfo> {
//     const headers = this.getHeaders("GET", "/accounts");
//     const response = await fetch(`${this.getBaseUrl()}/accounts`, { headers });
//     const data = await response.json() as Array<{
//       currency: string;
//       balance: string;
//       available: string;
//       hold: string;
//     }>;
// 
//     const balances: Balance[] = data
//       .filter((a) => parseFloat(a.balance) > 0)
//       .map((a) => ({
//         currency: a.currency,
//         total: parseFloat(a.balance),
//         available: parseFloat(a.available),
//         frozen: parseFloat(a.hold),
//         isDemo: this.isTestnet(),
//       }));
// 
//     return {
//       exchange: "coinbase",
//       balances,
//       totalEquity: balances.reduce((s, b) => s + b.total, 0),
//       availableMargin: balances.reduce((s, b) => s + b.available, 0),
//       marginUsed: balances.reduce((s, b) => s + b.frozen, 0),
//       unrealizedPnl: 0,
//       isDemo: this.isTestnet(),
//     };
//   }
// 
//   // ==================== ORDER MANAGEMENT ====================
// 
//   async createOrder(params: CreateOrderParams): Promise<OrderResult> {
//     // Convert symbol format: BTCUSDT -> BTC-USDT
//     const productId = params.symbol.replace("USDT", "-USDT");
//     
//     const body = JSON.stringify({
//       product_id: productId,
//       side: params.side,
//       type: params.type,
//       size: String(params.quantity),
//       price: params.price ? String(params.price) : undefined,
//       client_oid: params.clientOrderId,
//     });
// 
//     const path = "/orders";
//     const headers = this.getHeaders("POST", path, body);
// 
//     try {
//       const response = await fetch(`${this.getBaseUrl()}${path}`, {
//         method: "POST",
//         headers,
//         body,
//       });
//       const data = await response.json() as { id: string; message?: string };
// 
//       if (data.message) {
//         return { success: false, error: data.message };
//       }
// 
//       return {
//         success: true,
//         order: {
//           id: data.id,
//           exchange: "coinbase",
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
//   async cancelOrder(params: CancelOrderParams): Promise<OrderResult> {
//     const path = `/orders/${params.orderId}`;
//     const headers = this.getHeaders("DELETE", path);
// 
//     try {
//       await fetch(`${this.getBaseUrl()}${path}`, { method: "DELETE", headers });
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
//   async getPosition(_symbol: string): Promise<Position | null> {
//     return null; // Coinbase is spot only
//   }
// 
//   async getPositions(): Promise<Position[]> {
//     return [];
//   }
// 
//   async closePosition(_params: ClosePositionParams): Promise<OrderResult> {
//     return { success: false, error: "Positions not available for spot trading" };
//   }
// 
//   // ==================== LEVERAGE ====================
// 
//   async setLeverage(_params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
//     return { success: false, leverage: 1 };
//   }
// 
//   // ==================== MARKET DATA ====================
// 
//   async getTicker(symbol: string): Promise<Ticker> {
//     const productId = symbol.replace("USDT", "-USDT");
//     const response = await fetch(`${this.getBaseUrl()}/products/${productId}/ticker`);
//     const data = await response.json() as {
//       bid: string;
//       ask: string;
//       price: string;
//       volume: string;
//       high_24h?: string;
//       low_24h?: string;
//     };
// 
//     return {
//       symbol,
//       exchange: "coinbase",
//       bid: parseFloat(data.bid),
//       ask: parseFloat(data.ask),
//       last: parseFloat(data.price),
//       high24h: parseFloat(data.high_24h || "0"),
//       low24h: parseFloat(data.low_24h || "0"),
//       volume24h: parseFloat(data.volume),
//       change24h: 0,
//       changePercent24h: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getFundingRate(_symbol: string): Promise<FundingRate> {
//     throw new Error("Funding rate not available for spot trading");
//   }
// 
//   async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
//     throw new Error("getOrderbook not implemented for coinbase");
//   }
// 
//   // ==================== PRODUCTS ====================
// 
//   /**
//    * Get list of available trading products
//    */
//   async getProducts(): Promise<Array<{
//     id: string;
//     base_currency: string;
//     quote_currency: string;
//     base_min_size: string;
//     base_max_size: string;
//     quote_increment: string;
//   }>> {
//     const response = await fetch(`${this.getBaseUrl()}/products`);
//     return response.json();
//   }
// 
//   /**
//    * Get product details
//    */
//   async getProduct(productId: string): Promise<{
//     id: string;
//     base_currency: string;
//     quote_currency: string;
//     base_min_size: string;
//     base_max_size: string;
//     quote_increment: string;
//     status: string;
//   }> {
//     const response = await fetch(`${this.getBaseUrl()}/products/${productId}`);
//     return response.json();
//   }
// 
//   // ==================== ORDER BOOK ====================
// 
//   /**
//    * Get order book for a product
//    */
//   async getOrderBook(symbol: string, level: 1 | 2 | 3 = 1): Promise<{
//     bids: Array<[string, string, string]>;
//     asks: Array<[string, string, string]>;
//     sequence: number;
//   }> {
//     const productId = symbol.replace("USDT", "-USDT");
//     const response = await fetch(
//       `${this.getBaseUrl()}/products/${productId}/book?level=${level}`
//     );
//     return response.json();
//   }
// 
//   // ==================== TRADES ====================
// 
//   /**
//    * Get recent trades for a product
//    */
//   async getTrades(symbol: string, limit: number = 100): Promise<Array<{
//     trade_id: number;
//     price: string;
//     size: string;
//     time: string;
//     side: string;
//   }>> {
//     const productId = symbol.replace("USDT", "-USDT");
//     const response = await fetch(
//       `${this.getBaseUrl()}/products/${productId}/trades?limit=${limit}`
//     );
//     return response.json();
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
