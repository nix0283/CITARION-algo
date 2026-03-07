/**
 * Universal Bot Adapter
 * Unified exchange adapter for all trading bots
 * Supports: Binance, Bybit, OKX, Bitget, BingX
 * Modes: PAPER, TESTNET, DEMO, LIVE
 */

import { db } from "@/lib/db";

// Types
export type ExchangeId = "binance" | "bybit" | "okx" | "bitget" | "bingx";
export type TradingMode = "PAPER" | "TESTNET" | "DEMO" | "LIVE";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP_MARKET" | "STOP_LIMIT";

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  uid?: string;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  positionSide?: "LONG" | "SHORT" | "BOTH";
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  executedPrice?: number;
  executedAmount?: number;
  error?: string;
}

export interface PositionInfo {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnL: number;
  leverage: number;
  liquidationPrice?: number;
  marginMode: "ISOLATED" | "CROSSED";
}

export interface BalanceInfo {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue?: number;
}

export interface TickerInfo {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  priceChangePercent: number;
}

// Exchange API endpoints
const EXCHANGE_ENDPOINTS: Record<ExchangeId, { live: string; testnet: string }> = {
  binance: {
    live: "https://fapi.binance.com",
    testnet: "https://testnet.binancefuture.com"
  },
  bybit: {
    live: "https://api.bybit.com",
    testnet: "https://api-testnet.bybit.com"
  },
  okx: {
    live: "https://www.okx.com",
    testnet: "https://www.okx.com" // OKX uses demo mode, not testnet
  },
  bitget: {
    live: "https://api.bitget.com",
    testnet: "https://api.bitget.com" // Bitget uses demo mode
  },
  bingx: {
    live: "https://open-api.bingx.com",
    testnet: "https://open-api.bingx.com" // BingX uses demo mode
  }
};

// Exchange capabilities
const EXCHANGE_CAPABILITIES: Record<ExchangeId, {
  hasTestnet: boolean;
  hasDemo: boolean;
  supportsHedgeMode: boolean;
  supportsTrailingStop: boolean;
  maxLeverage: number;
}> = {
  binance: { hasTestnet: true, hasDemo: false, supportsHedgeMode: true, supportsTrailingStop: true, maxLeverage: 125 },
  bybit: { hasTestnet: true, hasDemo: false, supportsHedgeMode: true, supportsTrailingStop: true, maxLeverage: 100 },
  okx: { hasTestnet: false, hasDemo: true, supportsHedgeMode: true, supportsTrailingStop: true, maxLeverage: 125 },
  bitget: { hasTestnet: false, hasDemo: true, supportsHedgeMode: true, supportsTrailingStop: true, maxLeverage: 125 },
  bingx: { hasTestnet: false, hasDemo: true, supportsHedgeMode: false, supportsTrailingStop: false, maxLeverage: 50 }
};

/**
 * Universal Bot Adapter Class
 */
export class UniversalBotAdapter {
  private exchange: ExchangeId;
  private mode: TradingMode;
  private credentials?: ExchangeCredentials;
  private accountId?: string;
  private botId?: string;

  constructor(
    exchange: ExchangeId,
    mode: TradingMode = "PAPER",
    credentials?: ExchangeCredentials,
    accountId?: string,
    botId?: string
  ) {
    this.exchange = exchange;
    this.mode = mode;
    this.credentials = credentials;
    this.accountId = accountId;
    this.botId = botId;
  }

  /**
   * Create adapter from database configuration
   */
  static async fromBotConfig(botConfigId: string): Promise<UniversalBotAdapter> {
    const config = await db.botConfig.findUnique({
      where: { id: botConfigId },
      include: { account: true }
    });

    if (!config) {
      throw new Error(`BotConfig not found: ${botConfigId}`);
    }

    const exchange = config.exchangeId as ExchangeId;
    let mode: TradingMode = "PAPER";
    let credentials: ExchangeCredentials | undefined;

    if (config.account) {
      // Determine mode from account settings
      if (config.account.accountType === "DEMO") {
        mode = config.account.isTestnet ? "TESTNET" : "DEMO";
      } else {
        mode = "LIVE";
      }

      if (config.account.apiKey && config.account.apiSecret) {
        credentials = {
          apiKey: config.account.apiKey,
          apiSecret: config.account.apiSecret,
          passphrase: config.account.apiPassphrase || undefined,
          uid: config.account.apiUid || undefined
        };
      }
    }

    return new UniversalBotAdapter(
      exchange,
      mode,
      credentials,
      config.accountId || undefined,
      botConfigId
    );
  }

  /**
   * Get exchange capabilities
   */
  getCapabilities() {
    return EXCHANGE_CAPABILITIES[this.exchange];
  }

  /**
   * Get API base URL
   */
  getBaseUrl(): string {
    const endpoints = EXCHANGE_ENDPOINTS[this.exchange];
    return this.mode === "TESTNET" && EXCHANGE_CAPABILITIES[this.exchange].hasTestnet
      ? endpoints.testnet
      : endpoints.live;
  }

  /**
   * Check if paper trading
   */
  isPaperTrading(): boolean {
    return this.mode === "PAPER";
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (this.mode === "PAPER") {
      return { success: true };
    }

    if (!this.credentials?.apiKey || !this.credentials?.apiSecret) {
      return { success: false, error: "API credentials required" };
    }

    try {
      const result = await this.makeRequest("GET", "/api/v1/ping", {}, false);
      return { success: result.success };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get account balances
   */
  async getBalances(): Promise<{ success: boolean; balances: BalanceInfo[]; error?: string }> {
    if (this.mode === "PAPER") {
      return {
        success: true,
        balances: [{ asset: "USDT", free: 10000, locked: 0, total: 10000 }]
      };
    }

    try {
      // Implementation would vary by exchange
      const result = await this.makeRequest("GET", this.getBalanceEndpoint(), {}, true);
      
      if (result.success) {
        return {
          success: true,
          balances: this.parseBalanceResponse(result.data)
        };
      }
      
      return { success: false, balances: [], error: result.error };
    } catch (error) {
      return { success: false, balances: [], error: String(error) };
    }
  }

  /**
   * Get open positions
   */
  async getPositions(): Promise<{ success: boolean; positions: PositionInfo[]; error?: string }> {
    if (this.mode === "PAPER") {
      return { success: true, positions: [] };
    }

    try {
      const result = await this.makeRequest("GET", this.getPositionsEndpoint(), {}, true);
      
      if (result.success) {
        return {
          success: true,
          positions: this.parsePositionsResponse(result.data)
        };
      }
      
      return { success: false, positions: [], error: result.error };
    } catch (error) {
      return { success: false, positions: [], error: String(error) };
    }
  }

  /**
   * Get ticker info
   */
  async getTicker(symbol: string): Promise<{ success: boolean; ticker?: TickerInfo; error?: string }> {
    try {
      const endpoint = this.getTickerEndpoint(symbol);
      const result = await this.makeRequest("GET", endpoint, {}, false);
      
      if (result.success) {
        return {
          success: true,
          ticker: this.parseTickerResponse(result.data, symbol)
        };
      }
      
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Place order
   */
  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (this.mode === "PAPER") {
      return this.simulatePaperOrder(order);
    }

    try {
      const body = this.buildOrderRequestBody(order);
      const result = await this.makeRequest("POST", this.getOrderEndpoint(), body, true);
      
      if (result.success) {
        return this.parseOrderResponse(result.data);
      }
      
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(symbol: string, orderId: string): Promise<OrderResult> {
    if (this.mode === "PAPER") {
      return { success: true, orderId };
    }

    try {
      const body = this.buildCancelRequestBody(symbol, orderId);
      const result = await this.makeRequest("DELETE", this.getOrderEndpoint(), body, true);
      
      if (result.success) {
        return { success: true, orderId };
      }
      
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Set leverage
   */
  async setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; error?: string }> {
    if (this.mode === "PAPER") {
      return { success: true };
    }

    try {
      const body = this.buildLeverageRequestBody(symbol, leverage);
      const result = await this.makeRequest("POST", this.getLeverageEndpoint(), body, true);
      
      return { success: result.success, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // Private methods for exchange-specific implementations

  private async makeRequest(
    method: string,
    endpoint: string,
    body: any,
    requiresAuth: boolean
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    // This is a placeholder - real implementation would use fetch with proper
    // authentication headers for each exchange
    return { success: false, error: "Exchange API not implemented" };
  }

  private getBalanceEndpoint(): string {
    switch (this.exchange) {
      case "binance": return "/fapi/v2/balance";
      case "bybit": return "/v5/account/wallet-balance";
      case "okx": return "/api/v5/account/balance";
      case "bitget": return "/api/v2/mix/account/accounts";
      case "bingx": return "/openApi/swap/v2/user/balance";
      default: return "";
    }
  }

  private getPositionsEndpoint(): string {
    switch (this.exchange) {
      case "binance": return "/fapi/v2/positionRisk";
      case "bybit": return "/v5/position/list";
      case "okx": return "/api/v5/account/positions";
      case "bitget": return "/api/v2/mix/position/all-position";
      case "bingx": return "/openApi/swap/v2/user/positions";
      default: return "";
    }
  }

  private getTickerEndpoint(symbol: string): string {
    switch (this.exchange) {
      case "binance": return `/fapi/v1/ticker/24hr?symbol=${symbol}`;
      case "bybit": return `/v5/market/tickers?category=linear&symbol=${symbol}`;
      case "okx": return `/api/v5/market/ticker?instId=${symbol}`;
      case "bitget": return `/api/v2/mix/market/ticker?symbol=${symbol}`;
      case "bingx": return `/openApi/swap/v2/quote/ticker?symbol=${symbol}`;
      default: return "";
    }
  }

  private getOrderEndpoint(): string {
    switch (this.exchange) {
      case "binance": return "/fapi/v1/order";
      case "bybit": return "/v5/order/create";
      case "okx": return "/api/v5/trade/order";
      case "bitget": return "/api/v2/mix/order/place-order";
      case "bingx": return "/openApi/swap/v2/trade/order";
      default: return "";
    }
  }

  private getLeverageEndpoint(): string {
    switch (this.exchange) {
      case "binance": return "/fapi/v1/leverage";
      case "bybit": return "/v5/position/set-leverage";
      case "okx": return "/api/v5/account/set-leverage";
      case "bitget": return "/api/v2/mix/account/set-leverage";
      case "bingx": return "/openApi/swap/v2/trade/leverage";
      default: return "";
    }
  }

  private parseBalanceResponse(data: any): BalanceInfo[] {
    // Implementation varies by exchange
    return [];
  }

  private parsePositionsResponse(data: any): PositionInfo[] {
    // Implementation varies by exchange
    return [];
  }

  private parseTickerResponse(data: any, symbol: string): TickerInfo | undefined {
    // Implementation varies by exchange
    return undefined;
  }

  private parseOrderResponse(data: any): OrderResult {
    // Implementation varies by exchange
    return { success: false, error: "Not implemented" };
  }

  private buildOrderRequestBody(order: OrderRequest): any {
    // Implementation varies by exchange
    return {};
  }

  private buildCancelRequestBody(symbol: string, orderId: string): any {
    // Implementation varies by exchange
    return {};
  }

  private buildLeverageRequestBody(symbol: string, leverage: number): any {
    // Implementation varies by exchange
    return {};
  }

  private simulatePaperOrder(order: OrderRequest): OrderResult {
    const orderId = `paper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      success: true,
      orderId,
      clientOrderId: orderId,
      executedPrice: order.price || 50000, // Placeholder price
      executedAmount: order.amount
    };
  }
}

export default UniversalBotAdapter;
