// ============================================================
// DISABLED EXCHANGE CLIENT
// Uncomment to re-enable this exchange
// ============================================================
// /**
//  * HyperLiquid Exchange Client
//  * 
//  * Supports:
//  * - Futures Trading only
//  * - Testnet: api.hyperliquid-testnet.xyz
//  * 
//  * Special Notes:
//  * - Uses EIP-712 wallet signatures (not traditional API keys)
//  * - Requires wallet address and private key for trading
//  * - Testnet has Faucet for test HYPE and USDC
//  * - Decentralized L1 on Cosmos SDK
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
//   PositionSide,
//   TradingMode,
//   Orderbook,
//   OrderbookEntry,
// } from "./types";
// 
// export class HyperliquidClient extends BaseExchangeClient {
//   constructor(
//     credentials: ApiCredentials,
//     marketType: MarketType = "futures",
//     testnet: boolean = false,
//     tradingMode?: TradingMode
//   ) {
//     super("hyperliquid", credentials, marketType, testnet, tradingMode);
//     
//     // HyperLiquid uses wallet address as identifier
//     if (!credentials.walletAddress && !credentials.apiKey) {
//       console.warn("[HyperLiquid] walletAddress or apiKey required");
//     }
//   }
// 
//   private async hyperliquidRequest(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
//     await this.rateLimit(1);
// 
//     const response = await fetch(`${this.getBaseUrl()}/info`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ type: action, ...params }),
//     });
// 
//     return response.json();
//   }
// 
//   // ==================== ACCOUNT INFO ====================
// 
//   async getAccountInfo(): Promise<AccountInfo> {
//     const wallet = this.credentials.walletAddress || this.credentials.apiKey;
//     
//     const data = await this.hyperliquidRequest("clearinghouseState", {
//       user: wallet,
//     }) as {
//       marginSummary: {
//         accountValue: string;
//         totalMarginUsed: string;
//         totalNtlPos: string;
//       };
//       crossMarginSummary?: {
//         totalRawUsd: string;
//       };
//     };
// 
//     const totalEquity = parseFloat(data.marginSummary?.accountValue || "0");
// 
//     return {
//       exchange: "hyperliquid",
//       balances: [{ 
//         currency: "USDC", 
//         total: totalEquity, 
//         available: totalEquity - parseFloat(data.marginSummary?.totalMarginUsed || "0"), 
//         frozen: parseFloat(data.marginSummary?.totalMarginUsed || "0"),
//         isDemo: this.isTestnet(),
//       }],
//       totalEquity,
//       availableMargin: totalEquity - parseFloat(data.marginSummary?.totalMarginUsed || "0"),
//       marginUsed: parseFloat(data.marginSummary?.totalMarginUsed || "0"),
//       unrealizedPnl: 0,
//       isDemo: this.isTestnet(),
//     };
//   }
// 
//   // ==================== ORDER MANAGEMENT ====================
// 
//   async createOrder(params: CreateOrderParams): Promise<OrderResult> {
//     // HyperLiquid requires EIP-712 signing with wallet private key
//     // For full implementation, use official SDK or provide walletPrivateKey
//     return { 
//       success: false, 
//       error: "HyperLiquid order placement requires EIP-712 signing. Use the official SDK or provide walletPrivateKey in credentials." 
//     };
//   }
// 
//   async cancelOrder(params: CancelOrderParams): Promise<OrderResult> {
//     return { 
//       success: false, 
//       error: "HyperLiquid cancel requires EIP-712 signing. Use the official SDK." 
//     };
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
//     const data = await this.hyperliquidRequest("clearinghouseState", {
//       user: wallet,
//     }) as {
//       assetPositions: Array<{
//         position: {
//           coin: string;
//           entryPx: string;
//           szi: string;
//           positionValue: string;
//           unrealizedPnl: string;
//           leverage: string;
//           liquidationPx: string;
//           marginUsed: string;
//         };
//       }>;
//     };
// 
//     return (data.assetPositions || [])
//       .filter((p) => parseFloat(p.position.szi) !== 0)
//       .map((p) => ({
//         id: p.position.coin,
//         exchange: "hyperliquid" as const,
//         symbol: p.position.coin,
//         side: parseFloat(p.position.szi) > 0 ? "long" as const : "short" as const,
//         quantity: Math.abs(parseFloat(p.position.szi)),
//         entryPrice: parseFloat(p.position.entryPx),
//         markPrice: 0,
//         unrealizedPnl: parseFloat(p.position.unrealizedPnl),
//         realizedPnl: 0,
//         leverage: parseInt(p.position.leverage) || 1,
//         marginMode: "cross" as const,
//         margin: parseFloat(p.position.marginUsed),
//         liquidationPrice: parseFloat(p.position.liquidationPx) || undefined,
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
//     return { 
//       success: false, 
//       error: "HyperLiquid close requires EIP-712 signing. Use the official SDK." 
//     };
//   }
// 
//   // ==================== LEVERAGE ====================
// 
//   async setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }> {
//     // HyperLiquid leverage is set per-position via EIP-712 signed transaction
//     return { 
//       success: false, 
//       leverage: 0,
//     };
//   }
// 
//   // ==================== MARKET DATA ====================
// 
//   async getTicker(symbol: string): Promise<Ticker> {
//     const response = await fetch(`${this.getBaseUrl()}/info`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ type: "allMids" }),
//     });
//     const data = await response.json() as Record<string, string>;
// 
//     const price = parseFloat(data[symbol] || data[symbol + "-PERP"] || "0");
// 
//     return {
//       symbol,
//       exchange: "hyperliquid",
//       bid: price,
//       ask: price,
//       last: price,
//       high24h: 0,
//       low24h: 0,
//       volume24h: 0,
//       change24h: 0,
//       changePercent24h: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getFundingRate(symbol: string): Promise<FundingRate> {
//     const response = await fetch(`${this.getBaseUrl()}/info`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ type: "fundingHistory", coin: symbol }),
//     });
//     const data = await response.json() as Array<{
//       fundingRate: string;
//       time: number;
//       premium: string;
//     }>;
// 
//     const latestFunding = data?.[0];
// 
//     return {
//       symbol,
//       exchange: "hyperliquid",
//       rate: latestFunding ? parseFloat(latestFunding.fundingRate) : 0,
//       nextFundingTime: new Date(Date.now() + 8 * 60 * 60 * 1000), // ~8 hours
//       markPrice: 0,
//       timestamp: new Date(),
//     };
//   }
// 
//   async getOrderbook(symbol: string, depth: number = 100): Promise<Orderbook> {
//     throw new Error("getOrderbook not implemented for hyperliquid");
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
