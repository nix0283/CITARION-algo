// ============================================================
// DISABLED EXCHANGE CLIENT
// Uncomment to re-enable this exchange
// ============================================================
// /**
//  * Aster DEX Exchange Client
//  * 
//  * Supports:
//  * - Spot Trading
//  * - Perpetual Futures Trading (up to 1001x leverage)
//  * - Testnet: testnet-api.asterdex.com
//  * - Yield-bearing collateral (asBNB, USDF)
//  * 
//  * Special Notes:
//  * - Decentralized L1 exchange on Aster Chain
//  * - Uses EIP-712 wallet signatures (like HyperLiquid)
//  * - Requires wallet address for API access
//  * - Testnet has Faucet for test tokens
//  * - Supports tokenized stocks (Apple, Tesla) with 50x leverage
//  * - Hidden Orders available in Pro Mode
//  * 
//  * Documentation: https://docs.asterdex.com
//  * GitHub: asterdex/api-docs
//  */
// 
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
// export class AsterClient extends BaseExchangeClient {
//   private apiVersion = "v1";
// 
//   constructor(
//     credentials: ApiCredentials,
//     marketType: MarketType = "futures",
//     testnet: boolean = false,
//     tradingMode?: TradingMode
//   ) {
//     super("aster", credentials, marketType, testnet, tradingMode);
//     
//     // Aster uses wallet address as primary identifier
//     if (!credentials.walletAddress && !credentials.apiKey) {
//       console.warn("[Aster] walletAddress or apiKey required for API access");
//     }
//   }
// 
//   private getApiUrl(): string {
//     const baseUrl = this.isTestnet()
//       ? "https://testnet-api.asterdex.com"
//       : "https://api.asterdex.com";
//     return `${baseUrl}/${this.apiVersion}`;
//   }
// 
//   private async asterRequest<T>(
//     endpoint: string,
//     method: "GET" | "POST" = "GET",
//     body?: Record<string, unknown>
//   ): Promise<T> {
//     await this.rateLimit(1);
// 
//     const url = `${this.getApiUrl()}${endpoint}`;
//     const headers: Record<string, string> = {
//       "Content-Type": "application/json",
//     };
// 
//     // Add wallet address header for authentication
//     const wallet = this.credentials.walletAddress || this.credentials.apiKey;
//     if (wallet) {
//       headers["X-Wallet-Address"] = wallet;
//     }
// 
//     const response = await fetch(url, {
//       method,
//       headers,
//       body: body ? JSON.stringify(body) : undefined,
//     });
// 
//     if (!response.ok) {
//       const error = await response.text();
//       throw new Error(`Aster API error: ${response.status} - ${error}`);
//     }
// 
//     return response.json();
//   }
// 
//   // ==================== ACCOUNT INFO ====================
// 
//   async getAccountInfo(): Promise<AccountInfo> {
//     const wallet = this.credentials.walletAddress || this.credentials.apiKey;
//     
//     try {
//       // Get account balance
//       const data = await this.asterRequest<{
//         balances: Array<{
//           asset: string;
//           total: string;
//           available: string;
//           frozen: string;
//           isYieldBearing?: boolean;
//           apy?: string;
//         }>;
//         totalEquity: string;
//         availableMargin: string;
//         marginUsed: string;
//         unrealizedPnl: string;
//       }>(`/account/${wallet}`);
// 
//       const totalEquity = parseFloat(data.totalEquity || "0");
// 
//       const balances: Balance[] = (data.balances || []).map((b) => ({
//         currency: b.asset,
//         total: parseFloat(b.total),
//         available: parseFloat(b.available),
//         frozen: parseFloat(b.frozen),
//         isDemo: this.isTestnet(),
//         usdValue: parseFloat(b.total), // Approximation
//       }));
// 
//       // Add default USDF if no balances
//       if (balances.length === 0) {
//         balances.push({
//           currency: "USDF",
//           total: this.isTestnet() ? 10000 : 0,
//           available: this.isTestnet() ? 10000 : 0,
//           frozen: 0,
//           isDemo: this.isTestnet(),
//         });
//       }
// 
//       return {
//         exchange: "aster",
//         balances,
//         totalEquity,
//         availableMargin: parseFloat(data.availableMargin || String(totalEquity)),
//         marginUsed: parseFloat(data.marginUsed || "0"),
//         unrealizedPnl: parseFloat(data.unrealizedPnl || "0"),
//         isDemo: this.isTestnet(),
//       };
//     } catch {
//       // Return default account for demo/testnet
//       return {
//         exchange: "aster",
//         balances: [{
//           currency: "USDF",
//           total: 10000,
//           available: 10000,
//           frozen: 0,
//           isDemo: true,
//         }],
//         totalEquity: 10000,
//         availableMargin: 10000,
//         marginUsed: 0,
//         unrealizedPnl: 0,
//         isDemo: true,
//       };
//     }
//   }
// 
//   // ==================== ORDER MANAGEMENT ====================
// 
//   async createOrder(params: CreateOrderParams): Promise<OrderResult> {
//     // Aster requires EIP-712 signing for order placement
//     // Full implementation requires walletPrivateKey or external signer
//     
//     if (!this.credentials.walletPrivateKey && !this.credentials.apiSecret) {
//       return {
//         success: false,
//         error: "Aster order placement requires wallet private key for EIP-712 signing. Provide walletPrivateKey in credentials or use the official Aster SDK.",
//       };
//     }
// 
//     try {
//       await this.rateLimit(1);
// 
//       const wallet = this.credentials.walletAddress || this.credentials.apiKey;
//       
//       // Construct order payload
//       const orderPayload = {
//         wallet,
//         symbol: params.symbol,
//         side: params.side.toUpperCase(),
//         type: params.type.toUpperCase(),
//         quantity: params.quantity.toString(),
//         price: params.price?.toString(),
//         leverage: params.leverage || 1,
//         marginMode: params.marginMode || "cross",
//         reduceOnly: params.reduceOnly || false,
//         clientOrderId: params.clientOrderId,
//       };
// 
//       // For full implementation, we would sign with EIP-712 here
//       // This is a placeholder that shows the structure
//       const response = await this.asterRequest<{
//         orderId: string;
//         status: string;
//         timestamp: string;
//       }>("/orders", "POST", orderPayload);
// 
//       return {
//         success: true,
//         order: {
//           id: response.orderId,
//           exchange: "aster",
//           symbol: params.symbol,
//           side: params.side,
//           type: params.type,
//           status: "open",
//           price: params.price || 0,
//           quantity: params.quantity,
//           filledQuantity: 0,
//           remainingQuantity: params.quantity,
//           leverage: params.leverage,
//           fee: 0,
//           feeCurrency: "USDF",
//           createdAt: new Date(),
//           updatedAt: new Date(),
//         },
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: error instanceof Error ? error.message : "Order creation failed",
//       };
//     }
//   }
// 
//   async cancelOrder(params: CancelOrderParams): Promise<OrderResult> {
//     if (!this.credentials.walletPrivateKey && !this.credentials.apiSecret) {
//       return {
//         success: false,
//         error: "Aster cancel requires EIP-712 signing. Provide walletPrivateKey or use the official SDK.",
//       };
//     }
// 
//     try {
//       await this.asterRequest(`/orders/${params.orderId || params.clientOrderId}`, "POST", {
//         action: "cancel",
//       });
// 
//       return { success: true };
//     } catch (error) {
//       return {
//         success: false,
//         error: error instanceof Error ? error.message : "Cancel failed",
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
//     const wallet = this.credentials.walletAddress || this.credentials.apiKey;
// 
//     try {
//       const data = await this.asterRequest<{
//         positions: Array<{
//           symbol: string;
//           side: string;
//           size: string;
//           entryPrice: string;
//           markPrice: string;
//           unrealizedPnl: string;
//           leverage: number;
//           marginMode: string;
//           liquidationPrice?: string;
//           margin: string;
//           createdAt: string;
//           updatedAt: string;
//         }>;
//       }>(`/positions/${wallet}`);
// 
//       return (data.positions || [])
//         .filter((p) => parseFloat(p.size) !== 0)
//         .map((p) => ({
//           id: `${p.symbol}-${p.side}`,
//           exchange: "aster" as const,
//           symbol: p.symbol,
//           side: p.side.toLowerCase() as "long" | "short",
//           quantity: Math.abs(parseFloat(p.size)),
//           entryPrice: parseFloat(p.entryPrice),
//           markPrice: parseFloat(p.markPrice),
//           unrealizedPnl: parseFloat(p.unrealizedPnl),
//           realizedPnl: 0,
//           leverage: p.leverage || 1,
//           marginMode: (p.marginMode || "cross") as "isolated" | "cross",
//           margin: parseFloat(p.margin),
//           liquidationPrice: p.liquidationPrice ? parseFloat(p.liquidationPrice) : undefined,
//           createdAt: new Date(p.createdAt),
//           updatedAt: new Date(p.updatedAt),
//         }));
//     } catch {
//       return [];
//     }
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
//     // Aster leverage can be set up to 1001x for perpetuals
//     if (params.leverage < 1 || params.leverage > 1001) {
//       return { success: false, leverage: 0 };
//     }
// 
//     try {
//       await this.asterRequest("/leverage", "POST", {
//         symbol: params.symbol,
//         leverage: params.leverage,
//         marginMode: params.marginMode || "cross",
//       });
// 
//       return { success: true, leverage: params.leverage };
//     } catch {
//       return { success: false, leverage: 0 };
//     }
//   }
// 
//   // ==================== MARKET DATA ====================
// 
//   async getTicker(symbol: string): Promise<Ticker> {
//     try {
//       const data = await this.asterRequest<{
//         symbol: string;
//         bid: string;
//         ask: string;
//         last: string;
//         high24h: string;
//         low24h: string;
//         volume24h: string;
//         change24h: string;
//         changePercent24h: string;
//       }>(`/ticker/${symbol}`);
// 
//       return {
//         symbol,
//         exchange: "aster",
//         bid: parseFloat(data.bid || "0"),
//         ask: parseFloat(data.ask || "0"),
//         last: parseFloat(data.last || "0"),
//         high24h: parseFloat(data.high24h || "0"),
//         low24h: parseFloat(data.low24h || "0"),
//         volume24h: parseFloat(data.volume24h || "0"),
//         change24h: parseFloat(data.change24h || "0"),
//         changePercent24h: parseFloat(data.changePercent24h || "0"),
//         timestamp: new Date(),
//       };
//     } catch {
//       // Return mock data for demo/testnet
//       return {
//         symbol,
//         exchange: "aster",
//         bid: 0,
//         ask: 0,
//         last: 0,
//         high24h: 0,
//         low24h: 0,
//         volume24h: 0,
//         change24h: 0,
//         changePercent24h: 0,
//         timestamp: new Date(),
//       };
//     }
//   }
// 
//   async getFundingRate(symbol: string): Promise<FundingRate> {
//     try {
//       const data = await this.asterRequest<{
//         symbol: string;
//         fundingRate: string;
//         nextFundingTime: string;
//         markPrice: string;
//         indexPrice: string;
//       }>(`/funding/${symbol}`);
// 
//       return {
//         symbol,
//         exchange: "aster",
//         rate: parseFloat(data.fundingRate || "0"),
//         nextFundingTime: new Date(data.nextFundingTime || Date.now() + 8 * 60 * 60 * 1000),
//         markPrice: parseFloat(data.markPrice || "0"),
//         indexPrice: data.indexPrice ? parseFloat(data.indexPrice) : undefined,
//         timestamp: new Date(),
//       };
//     } catch {
//       return {
//         symbol,
//         exchange: "aster",
//         rate: 0,
//         nextFundingTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
//         markPrice: 0,
//         timestamp: new Date(),
//       };
//     }
//   }
// 
//   async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
//     throw new Error("getOrderbook not implemented for aster");
//   }
// 
//   // ==================== CONNECTION TEST ====================
// 
//   async testConnection(): Promise<{ success: boolean; message: string }> {
//     try {
//       // Try to get tickers as connection test
//       await this.asterRequest("/tickers");
//       return {
//         success: true,
//         message: this.isTestnet()
//           ? "Aster Testnet connection successful"
//           : "Aster Mainnet connection successful",
//       };
//     } catch (error) {
//       return {
//         success: false,
//         message: error instanceof Error ? error.message : "Connection failed",
//       };
//     }
//   }
// 
//   // ==================== POSITION SYNC METHODS ====================
// 
//   async getFuturesPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
//     const positions = await this.getPositions();
//     return positions.map(p => ({
//       symbol: p.symbol,
//       direction: p.side === "long" ? "LONG" as const : "SHORT" as const,
//       size: p.quantity,
//       entryPrice: p.entryPrice,
//       markPrice: p.markPrice,
//       unrealizedPnl: p.unrealizedPnl,
//       leverage: p.leverage,
//       marginMode: p.marginMode === "isolated" ? "ISOLATED" as const : "CROSS" as const,
//       liquidationPrice: p.liquidationPrice,
//       updatedAt: p.updatedAt,
//     }));
//   }
// 
//   async getSpotPositions(): Promise<import("../position-sync-service").ExchangePosition[]> {
//     return [];
//   }
// }
