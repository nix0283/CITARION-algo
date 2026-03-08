// ============================================================
// DISABLED EXCHANGE CLIENT
// Uncomment to re-enable this exchange
// ============================================================
// /**
//  * Huobi/HTX Exchange Client
//  * 
//  * Supports:
//  * - Spot Trading
//  * - Futures Trading (linear_swap)
//  * - Testnet: Separate environment with Faucet
//  * 
//  * Testnet Details:
//  * - Registration: Huobi AWS Testnet (separate account)
//  * - Assets: Faucet for BTC, USDT, ETH
//  * - Rate limits: 10-50 requests per minute (stricter than main)
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
// export class HuobiClient extends BaseExchangeClient {
//   private accountId: string | null = null;
// 
//   constructor(
//     credentials: ApiCredentials,
//     marketType: MarketType = "spot",
//     testnet: boolean = false,
//     tradingMode?: TradingMode
//   ) {
//     super("huobi", credentials, marketType, testnet, tradingMode);
//   }
// 
//   private getHeaders(): Record<string, string> {
//     return {
//       "Content-Type": "application/json",
//       "User-Agent": "CITARION/1.0",
//     };
//   }
// 
//   private async signedRequest(
//     method: "GET" | "POST",
//     path: string,
//     params: Record<string, unknown> = {},
//     isOrder: boolean = false
//   ): Promise<unknown> {
//     await this.rateLimit(1, isOrder);
// 
//     const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "");
//     const allParams = { 
//       ...params, 
//       AccessKeyId: this.credentials.apiKey, 
//       SignatureMethod: "HmacSHA256", 
//       SignatureVersion: "2", 
//       Timestamp: timestamp 
//     };
//     
//     // Sort params
//     const sortedParams = Object.entries(allParams)
//       .filter(([_, v]) => v !== undefined && v !== null)
//       .sort(([a], [b]) => a.localeCompare(b));
//     
//     const queryString = sortedParams
//       .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
//       .join("&");
//     
//     // Create signature
//     const host = new URL(this.getBaseUrl()).host;
//     const message = `${method}\n${host}\n${path}\n${queryString}`;
//     const signature = crypto
//       .createHmac("sha256", this.credentials.apiSecret)
//       .update(message)
//       .digest("base64");
// 
//     const url = `${this.getBaseUrl()}${path}?${queryString}&Signature=${encodeURIComponent(signature)}`;
// 
//     const response = await fetch(url, {
//       method,
//       headers: this.getHeaders(),
//     });
// 
//     const data = await response.json() as {
//       status: string;
//       "err-code"?: string;
//       "err-msg"?: string;
//       data: unknown;
//     };
// 
//     if (data.status !== "ok") {
//       throw {
//         exchange: "huobi",
//         code: data["err-code"] || "UNKNOWN",
//         message: data["err-msg"] || "Unknown error",
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
//     if (this.marketType === "spot") {
//       const data = await this.signedRequest("GET", "/v1/account/accounts") as Array<{
//         id: number;
//         type: string;
//         state: string;
//       }>;
// 
//       // Get account ID
//       const spotAccount = data.find((a) => a.type === "spot");
//       if (spotAccount) {
//         this.accountId = String(spotAccount.id);
//       }
// 
//       // Get balances
//       const balancesData = await this.signedRequest(
//         "GET", 
//         `/v1/account/accounts/${this.accountId || "0"}/balance`
//       ) as {
//         list: Array<{ currency: string; type: string; balance: string }>;
//       };
// 
//       const balances: Balance[] = balancesData.list
//         .filter((b) => parseFloat(b.balance) > 0)
//         .reduce((acc, b) => {
//           const existing = acc.find((x) => x.currency === b.currency);
//           if (existing) {
//             if (b.type === "trade") {
//               existing.available = parseFloat(b.balance);
//             } else {
//               existing.frozen = parseFloat(b.balance);
//             }
//             existing.total = existing.available + existing.frozen;
//           } else {
//             acc.push({
//               currency: b.currency.toUpperCase(),
//               total: parseFloat(b.balance),
//               available: b.type === "trade" ? parseFloat(b.balance) : 0,
//               frozen: b.type !== "trade" ? parseFloat(b.balance) : 0,
//               isDemo: this.isTestnet(),
//             });
//           }
//           return acc;
//         }, [] as Balance[]);
// 
//       return {
//         exchange: "huobi",
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
//     const data = await this.signedRequest("GET", "/linear-swap-api/v1/swap_cross_account_info") as {
//       data: Array<{
//         margin_coin: string;
//         margin_balance: string;
//         margin_available: string;
//         profit_unreal: string;
//       }>;
//     };
// 
//     const account = data.data?.[0];
//     const balances: Balance[] = account ? [{
//       currency: account.margin_coin.toUpperCase(),
//       total: parseFloat(account.margin_balance),
//       available: parseFloat(account.margin_available),
//       frozen: parseFloat(account.margin_balance) - parseFloat(account.margin_available),
//       isDemo: this.isTestnet(),
//     }] : [];
// 
//     return {
//       exchange: "huobi",
//       balances,
//       totalEquity: parseFloat(account?.margin_balance || "0"),
//       availableMargin: parseFloat(account?.margin_available || "0"),
//       marginUsed: 0,
//       unrealizedPnl: parseFloat(account?.profit_unreal || "0"),
//       isDemo: this.isTestnet(),
//     };
//   }
// 
//   // ==================== ORDER MANAGEMENT ====================
// 
//   async createOrder(params: CreateOrderParams): Promise<OrderResult> {
//     try {
//       let endpoint: string;
//       const orderParams: Record<string, unknown> = {};
// 
//       if (this.marketType === "spot") {
//         endpoint = "/v1/order/orders/place";
//         orderParams.symbol = params.symbol.toLowerCase();
//         orderParams.type = params.side === "buy" 
//           ? (params.type === "market" ? "buy-market" : "buy-limit")
//           : (params.type === "market" ? "sell-market" : "sell-limit");
//         orderParams.amount = String(params.quantity);
//         if (params.price) orderParams.price = String(params.price);
//         orderParams["client-order-id"] = params.clientOrderId;
//       } else {
//         // Futures
//         endpoint = "/linear-swap-api/v1/swap_cross_order";
//         orderParams.contract_code = params.symbol.toUpperCase();
//         orderParams.direction = params.side === "buy" ? "buy" : "sell";
//         orderParams.offset = params.reduceOnly ? "close" : "open";
//         orderParams.lever_rate = params.leverage || 10;
//         orderParams.volume = String(params.quantity);
//         orderParams.order_price_type = params.type === "market" ? "opponent" : "limit";
//         if (params.price) orderParams.price = String(params.price);
//         orderParams.client_order_id = params.clientOrderId;
//       }
// 
//       const data = await this.signedRequest("POST", endpoint, orderParams, true) as {
//         order_id: string | number;
//         order_id_str: string;
//       };
// 
//       return {
//         success: true,
//         order: {
//           id: String(data.order_id_str || data.order_id),
//           exchange: "huobi",
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
//       let endpoint: string;
//       const cancelParams: Record<string, unknown> = {};
// 
//       if (this.marketType === "spot") {
//         endpoint = `/v1/order/orders/${params.orderId}/submitcancel`;
//       } else {
//         endpoint = "/linear-swap-api/v1/swap_cross_cancel";
//         cancelParams.order_id = params.orderId;
//       }
// 
//       await this.signedRequest("POST", endpoint, cancelParams, true);
// 
//       return {
//         success: true,
//         order: {
//           id: params.orderId || "",
//           exchange: "huobi",
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
//     const data = await this.signedRequest("POST", "/linear-swap-api/v1/swap_cross_position_info") as {
//       data: Array<{
//         contract_code: string;
//         direction: string;
//         volume: string;
//         cost_hold: string;
//         last_price: string;
//         profit_unreal: string;
//         lever_rate: string;
//         margin_available: string;
//         liquidation_price: string;
//         created_at: string;
//         updated_at: string;
//       }>;
//     };
// 
//     return (data.data || [])
//       .filter((p) => parseFloat(p.volume) !== 0)
//       .map((p) => ({
//         id: p.contract_code,
//         exchange: "huobi" as const,
//         symbol: p.contract_code,
//         side: (p.direction === "buy" ? "long" : "short") as PositionSide,
//         quantity: parseFloat(p.volume),
//         entryPrice: parseFloat(p.cost_hold),
//         markPrice: parseFloat(p.last_price),
//         unrealizedPnl: parseFloat(p.profit_unreal),
//         realizedPnl: 0,
//         leverage: parseInt(p.lever_rate),
//         marginMode: "cross" as const,
//         margin: parseFloat(p.margin_available),
//         liquidationPrice: parseFloat(p.liquidation_price) || undefined,
//         createdAt: new Date(parseInt(p.created_at)),
//         updatedAt: new Date(parseInt(p.updated_at)),
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
//     await this.signedRequest("POST", "/linear-swap-api/v1/swap_cross_switch_leverage", {
//       contract_code: params.symbol,
//       lever_rate: params.leverage,
//     });
//     return { success: true, leverage: params.leverage };
//   }
// 
//   // ==================== MARKET DATA ====================
// 
//   async getTicker(symbol: string): Promise<Ticker> {
//     const endpoint = this.marketType === "spot"
//       ? `/market/detail/merged?symbol=${symbol.toLowerCase()}`
//       : `/linear-swap-ex/market/detail/merged?contract_code=${symbol.toUpperCase()}`;
// 
//     const response = await fetch(`${this.getBaseUrl()}${endpoint}`);
//     const data = await response.json() as {
//       status: string;
//       tick: {
//         bid: number[];
//         ask: number[];
//         close: number;
//         high: number;
//         low: number;
//         vol: number;
//         amount: number;
//         count: number;
//       };
//     };
// 
//     if (data.status !== "ok") {
//       throw new Error("Failed to fetch ticker");
//     }
// 
//     return {
//       symbol,
//       exchange: "huobi",
//       bid: data.tick.bid[0],
//       ask: data.tick.ask[0],
//       last: data.tick.close,
//       high24h: data.tick.high,
//       low24h: data.tick.low,
//       volume24h: data.tick.vol,
//       change24h: 0,
//       changePercent24h: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getFundingRate(symbol: string): Promise<FundingRate> {
//     const response = await fetch(
//       `${this.getBaseUrl()}/linear-swap-api/v1/swap_funding_rate?contract_code=${symbol.toUpperCase()}`
//     );
//     const data = await response.json() as {
//       status: string;
//       data: {
//         funding_rate: string;
//         funding_time: string;
//         contract_code: string;
//       };
//     };
// 
//     if (data.status !== "ok") {
//       throw new Error("Failed to fetch funding rate");
//     }
// 
//     return {
//       symbol,
//       exchange: "huobi",
//       rate: parseFloat(data.data.funding_rate),
//       nextFundingTime: new Date(parseInt(data.data.funding_time)),
//       markPrice: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
//     throw new Error("getOrderbook not implemented for huobi");
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
