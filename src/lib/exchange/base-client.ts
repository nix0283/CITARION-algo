/**
 * Base Exchange Client
 * 
 * Provides common functionality for all exchange implementations:
 * - Rate limiting with request queues
 * - Request signing and authentication
 * - Error handling and retries
 * - Logging of all operations
 * - Support for LIVE, TESTNET, and DEMO trading modes
 * - Circuit breaker pattern to prevent flooding failing exchanges
 */

import crypto from "crypto";
import {
  ExchangeId,
  AllExchangeId,
  MarketType,
  ApiCredentials,
  ExchangeConfig,
  RateLimitConfig,
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
  TradeLog,
  ExchangeError,
  TradingMode,
  OrphanedOrderResult,
  ReconciliationResult,
  EXCHANGE_CONFIGS,
  EXCHANGE_RATE_LIMITS,
} from "./types";
import { db } from "@/lib/db";
import {
  ExchangeCircuitBreaker,
  CircuitBreakerOpenError,
  circuitBreakerManager,
  ExchangeCircuitBreakerConfig,
} from "./exchange-circuit-breaker";

// ==================== RATE LIMITER ====================

interface RateLimitEntry {
  timestamp: number;
  cost: number;
}

class RateLimiter {
  private requests: RateLimitEntry[] = [];
  private config: RateLimitConfig;
  private exchangeId: AllExchangeId;

  constructor(exchangeId: AllExchangeId) {
    this.exchangeId = exchangeId;
    this.config = EXCHANGE_RATE_LIMITS[exchangeId];
  }

  /**
   * Check if we can make a request, wait if necessary
   */
  async acquire(cost: number = 1, isOrder: boolean = false): Promise<void> {
    const now = Date.now();
    const limit = isOrder && this.config.orders 
      ? this.config.orders 
      : this.config.general;

    // Clean old entries
    this.requests = this.requests.filter(
      (r) => now - r.timestamp < limit.windowMs
    );

    // Calculate current usage
    const currentUsage = this.requests.reduce((sum, r) => sum + r.cost, 0);

    // Check if we need to wait
    if (currentUsage + cost > limit.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest 
        ? oldestRequest.timestamp + limit.windowMs - now 
        : limit.windowMs;

      if (waitTime > 0) {
        console.log(`[RateLimit] ${this.exchangeId} waiting ${waitTime}ms`);
        await this.sleep(waitTime);
      }
    }

    // Record this request
    this.requests.push({ timestamp: Date.now(), cost });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status
   */
  getStatus(): { used: number; limit: number; resetIn: number } {
    const now = Date.now();
    this.requests = this.requests.filter(
      (r) => now - r.timestamp < this.config.general.windowMs
    );
    const used = this.requests.reduce((sum, r) => sum + r.cost, 0);
    const oldestRequest = this.requests[0];
    const resetIn = oldestRequest 
      ? Math.max(0, oldestRequest.timestamp + this.config.general.windowMs - now) 
      : 0;

    return {
      used,
      limit: this.config.general.maxRequests,
      resetIn,
    };
  }
}

// =================--- BASE CLIENT -------------------//

export abstract class BaseExchangeClient {
  protected exchangeId: AllExchangeId;
  protected credentials: ApiCredentials;
  protected marketType: MarketType;
  protected testnet: boolean;
  protected tradingMode: TradingMode;
  protected rateLimiter: RateLimiter;
  /** Circuit breaker instance for this exchange */
  protected circuitBreaker: ExchangeCircuitBreaker;

  constructor(
    exchangeId: AllExchangeId,
    credentials: ApiCredentials,
    marketType: MarketType = "futures",
    testnet: boolean = false,
    tradingMode?: TradingMode,
    circuitBreakerConfig?: Partial<ExchangeCircuitBreakerConfig>
  ) {
    this.exchangeId = exchangeId;
    this.credentials = credentials;
    this.marketType = marketType;
    this.testnet = testnet;
    
    // Determine trading mode
    if (tradingMode) {
      this.tradingMode = tradingMode;
    } else if (testnet) {
      this.tradingMode = "TESTNET";
    } else {
      this.tradingMode = "LIVE";
    }
    
    this.rateLimiter = new RateLimiter(exchangeId);
    
    // Initialize circuit breaker from manager or create new instance
    this.circuitBreaker = circuitBreakerManager.get(exchangeId, circuitBreakerConfig);

    // Validate credentials
    this.validateCredentials();
  }

  // ==================== ABSTRACT METHODS ====================

  abstract createOrder(params: CreateOrderParams): Promise<OrderResult>;
  abstract cancelOrder(params: CancelOrderParams): Promise<OrderResult>;
  abstract closePosition(params: ClosePositionParams): Promise<OrderResult>;
  abstract getPosition(symbol: string): Promise<Position | null>;
  abstract getPositions(): Promise<Position[]>;
  abstract getAccountInfo(): Promise<AccountInfo>;
  abstract getTicker(symbol: string): Promise<Ticker>;
  abstract getFundingRate(symbol: string): Promise<FundingRate>;
  abstract getOrderbook(symbol: string, depth?: number): Promise<Orderbook>;
  abstract setLeverage(params: SetLeverageParams): Promise<{ success: boolean; leverage: number }>;
  abstract testConnection(): Promise<{ success: boolean; message: string }>;
  
  // Methods for position sync service
  abstract getFuturesPositions(): Promise<import("../position-sync-service").ExchangePosition[]>;
  abstract getSpotPositions(): Promise<import("../position-sync-service").ExchangePosition[]>;
  
  // ==================== NEW ABSTRACT METHODS ====================
  
  /**
   * Get mark price and index price for a symbol
   * PUBLIC - No authentication required
   */
  abstract getMarkPrice(symbol: string): Promise<import("./types").MarkPrice>;
  
  /**
   * Get open orders for the authenticated account
   * PRIVATE - Requires API authentication
   */
  abstract getOpenOrders(symbol?: string): Promise<import("./types").OpenOrder[]>;
  
  /**
   * Get order history for the authenticated account
   * PRIVATE - Requires API authentication
   */
  abstract getOrderHistory(symbol?: string, limit?: number, startTime?: Date, endTime?: Date): Promise<import("./types").OrderHistoryItem[]>;
  
  /**
   * Get balance history for the authenticated account
   * PRIVATE - Requires API authentication
   * Note: Not all exchanges support full history
   */
  abstract getBalanceHistory(params?: import("./types").BalanceHistoryParams): Promise<import("./types").BalanceHistoryItem[]>;
  
  /**
   * Get open interest for a symbol
   * PUBLIC - No authentication required
   */
  abstract getOpenInterest(symbol: string): Promise<import("./types").OpenInterest>;

  // ==================== COPY TRADING METHODS ====================

  /**
   * Get Lead/Master Trader status for the authenticated account
   * PRIVATE - Requires API authentication
   */
  abstract getLeadTraderStatus(): Promise<import("./types").LeadTraderStatus>;

  /**
   * Get list of top traders for copy trading (public data)
   * PUBLIC - No authentication required (usually)
   * @param limit Number of traders to return
   * @param sortBy Sort field (roi, winRate, followersCount, etc.)
   */
  abstract getCopyTraderList(limit?: number, sortBy?: string): Promise<import("./types").CopyTraderStats[]>;

  /**
   * Get statistics for a specific trader
   * PUBLIC - No authentication required (usually)
   * @param traderId The trader's ID on the exchange
   */
  abstract getCopyTraderStats(traderId: string): Promise<import("./types").CopyTraderStats>;

  /**
   * Get current positions of a master trader
   * PUBLIC/PRIVATE - Depends on exchange
   * @param traderId The trader's ID
   */
  abstract getCopyTraderPositions(traderId: string): Promise<import("./types").CopyTraderPosition[]>;

  /**
   * Get trade history of a master trader
   * PUBLIC/PRIVATE - Depends on exchange
   * @param traderId The trader's ID
   * @param limit Number of trades to return
   * @param startTime Start time filter
   */
  abstract getCopyTraderTradeHistory(traderId: string, limit?: number, startTime?: Date): Promise<import("./types").CopyTraderTrade[]>;

  /**
   * Subscribe to copy a trader (as follower)
   * PRIVATE - Requires API authentication
   * @param params Subscription parameters
   */
  abstract copyTraderSubscribe(params: import("./types").CopySubscribeParams): Promise<import("./types").CopyTradingResult>;

  /**
   * Unsubscribe from a trader (as follower)
   * PRIVATE - Requires API authentication
   * @param traderId The trader to unsubscribe from
   */
  abstract copyTraderUnsubscribe(traderId: string): Promise<import("./types").CopyTradingResult>;

  /**
   * Get follower's copy trading settings
   * PRIVATE - Requires API authentication
   * @param traderId Optional: get settings for specific trader
   */
  abstract getCopyFollowerSettings(traderId?: string): Promise<import("./types").CopyFollowerSettings[]>;

  /**
   * Update follower's copy trading settings
   * PRIVATE - Requires API authentication
   * @param params Updated settings
   */
  abstract updateCopyFollowerSettings(params: import("./types").CopyFollowerSettings): Promise<import("./types").CopyTradingResult>;

  /**
   * Get list of followers (for master trader)
   * PRIVATE - Requires API authentication as Master Trader
   * @param limit Number of followers to return
   */
  abstract getCopyFollowers(limit?: number): Promise<import("./types").CopyFollowerInfo[]>;

  /**
   * Remove a follower (as master trader)
   * PRIVATE - Requires API authentication as Master Trader
   * @param followerId The follower to remove
   */
  abstract removeCopyFollower(followerId: string): Promise<import("./types").CopyTradingResult>;

  /**
   * Get profit summary for master trader
   * PRIVATE - Requires API authentication as Master Trader
   * @param startDate Start date filter
   * @param endDate End date filter
   */
  abstract getCopyTraderProfitSummary(startDate?: Date, endDate?: Date): Promise<import("./types").CopyTraderProfitSummary[]>;

  /**
   * Get symbols available for copy trading
   * PUBLIC/PRIVATE - Depends on exchange
   */
  abstract getCopyTradingSymbols(): Promise<import("./types").CopyTradingSymbol[]>;

  /**
   * Close position (for master trader, broadcasts to followers)
   * PRIVATE - Requires API authentication as Master Trader
   * @param params Close position parameters
   */
  abstract copyClosePosition(params: import("./types").CopyClosePositionParams): Promise<import("./types").CopyTradingResult>;

  /**
   * Modify TP/SL for position (for master trader)
   * PRIVATE - Requires API authentication as Master Trader
   * @param params Modify TP/SL parameters
   */
  abstract copyModifyTpsl(params: import("./types").CopyModifyTpslParams): Promise<import("./types").CopyTradingResult>;

  // ==================== MASTER TRADER METHODS ====================

  /**
   * Apply to become a Master/Lead Trader
   * PRIVATE - Requires API authentication
   * @param application Application parameters
   */
  abstract applyAsMasterTrader(application: import("./types").MasterTraderApplication): Promise<import("./types").MasterTraderResult>;

  /**
   * Get Master Trader settings
   * PRIVATE - Requires API authentication as Master Trader
   */
  abstract getMasterTraderSettings(): Promise<import("./types").MasterTraderSettings | null>;

  /**
   * Update Master Trader settings
   * PRIVATE - Requires API authentication as Master Trader
   */
  abstract updateMasterTraderSettings(settings: Partial<import("./types").MasterTraderSettings>): Promise<import("./types").MasterTraderResult>;

  /**
   * Get list of followers (for Master Trader)
   * PRIVATE - Requires API authentication as Master Trader
   * @param limit Maximum followers to return
   */
  abstract getMasterFollowers(limit?: number): Promise<import("./types").MasterFollowerInfo[]>;

  /**
   * Remove a follower (for Master Trader)
   * PRIVATE - Requires API authentication as Master Trader
   * @param followerId Follower ID to remove
   */
  abstract removeMasterFollower(followerId: string): Promise<import("./types").MasterTraderResult>;

  /**
   * Get profit summary (for Master Trader)
   * PRIVATE - Requires API authentication as Master Trader
   * @param startDate Start date
   * @param endDate End date
   */
  abstract getMasterProfitSummary(startDate?: Date, endDate?: Date): Promise<import("./types").MasterProfitSummary[]>;

  /**
   * Get Master Trader positions with follower info
   * PRIVATE - Requires API authentication as Master Trader
   */
  abstract getMasterPositions(): Promise<import("./types").MasterTraderPosition[]>;

  // ==================== COMMON METHODS ====================

  protected validateCredentials(): void {
    if (!this.credentials.apiKey || !this.credentials.apiSecret) {
      throw new Error(`${this.exchangeId}: API Key and Secret are required`);
    }
  }

  /**
   * Get base URL based on market type and trading mode
   * Override in subclass for exchange-specific URLs
   */
  protected getBaseUrl(): string {
    // Override in subclasses
    return "";
  }

  /**
   * Get additional headers for demo mode
   * Override in subclass for exchange-specific headers
   */
  protected getDemoHeaders(): Record<string, string> {
    return {};
  }

  /**
   * Get trading mode
   */
  getTradingMode(): TradingMode {
    return this.tradingMode;
  }

  /**
   * Set trading mode
   */
  setTradingMode(mode: TradingMode): void {
    this.tradingMode = mode;
    if (mode === "TESTNET") {
      this.testnet = true;
    }
  }

  protected async rateLimit(cost: number = 1, isOrder: boolean = false): Promise<void> {
    await this.rateLimiter.acquire(cost, isOrder);
  }

  // ==================== HTTP METHODS ====================

  /**
   * Make an HTTP request to the exchange API
   * 
   * This method implements:
   * 1. Circuit breaker check - blocks requests if exchange is failing
   * 2. Rate limiting - prevents exceeding API rate limits
   * 3. Retry logic - retries retriable errors with exponential backoff
   * 4. Request logging - logs all requests for audit trail
   * 
   * @throws CircuitBreakerOpenError if circuit breaker is open
   */
  protected async request(
    method: "GET" | "POST" | "DELETE" | "PUT",
    endpoint: string,
    params: Record<string, unknown> = {},
    isSigned: boolean = true,
    isOrder: boolean = false
  ): Promise<{ data: unknown; headers: Headers }> {
    // Check circuit breaker before making request
    if (!this.circuitBreaker.canExecute()) {
      throw new CircuitBreakerOpenError(this.circuitBreaker);
    }

    const startTime = Date.now();
    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.rateLimit(1, isOrder);

        const url = new URL(endpoint, this.getBaseUrl());
        let body: string | undefined;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...this.getDemoHeaders(),
        };

        if (method === "GET" && Object.keys(params).length > 0) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              url.searchParams.append(key, String(value));
            }
          });
        }

        if (isSigned) {
          const signedHeaders = this.signRequest(method, url.pathname + url.search, params);
          Object.assign(headers, signedHeaders);
        }

        if (method !== "GET" && Object.keys(params).length > 0) {
          body = JSON.stringify(params);
        }

        const response = await fetch(url.toString(), {
          method,
          headers,
          body,
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        // Log the request
        await this.logRequest({
          operation: isOrder ? "create_order" : "api_call",
          params: { method, endpoint, ...params },
          result: response.ok ? "success" : "failure",
          response: response.ok ? data : undefined,
          error: response.ok ? undefined : JSON.stringify(data),
          duration,
        });

        if (!response.ok) {
          const error = this.parseError(data);
          // Record failure in circuit breaker
          this.circuitBreaker.recordFailure();
          throw error;
        }

        // Record success in circuit breaker
        this.circuitBreaker.recordSuccess();

        return { data, headers: response.headers };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Record failure in circuit breaker for network/connection errors
        if (this.isNetworkError(lastError)) {
          this.circuitBreaker.recordFailure();
        }
        
        // Check if error is retriable
        if (this.isRetriable(lastError) && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`[Exchange] ${this.exchangeId} retry ${attempt}/${maxRetries} after ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        
        throw lastError;
      }
    }

    // All retries failed
    throw lastError;
  }

  /**
   * Check if an error is a network/connection error
   */
  private isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("etimedout") ||
      message.includes("network") ||
      message.includes("socket hang up") ||
      message.includes("fetch failed")
    );
  }

  // ==================== SIGNING ====================

  protected signRequest(
    method: string,
    path: string,
    params: Record<string, unknown>
  ): Record<string, string> {
    // Default HMAC-SHA256 signing (used by most exchanges)
    // Override in subclasses for exchange-specific signing
    const timestamp = Date.now();
    const queryString = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");

    const message = method === "GET" 
      ? `${path}?${queryString}` 
      : JSON.stringify(params);

    const signature = crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(message)
      .digest("hex");

    return {
      "X-MBX-APIKEY": this.credentials.apiKey,
      "X-MBX-SIGNATURE": signature,
      "X-MBX-TIMESTAMP": String(timestamp),
    };
  }

  // ==================== ERROR HANDLING ====================

  protected parseError(response: unknown): ExchangeError {
    const error = response as { code?: number | string; msg?: string; message?: string };
    const code = String(error.code || "UNKNOWN");
    const message = error.msg || error.message || "Unknown error";

    return {
      exchange: this.exchangeId as ExchangeId,
      code,
      message,
      timestamp: new Date(),
      retriable: this.isRetriableByCode(code),
    };
  }

  protected isRetriable(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("503") ||
      message.includes("502") ||
      message.includes("500")
    );
  }

  protected isRetriableByCode(code: string): boolean {
    const retriableCodes = ["429", "500", "502", "503", "504", "ETIMEDOUT", "10002"];
    return retriableCodes.includes(code);
  }

  // ==================== LOGGING ====================

  protected async logRequest(log: Partial<TradeLog>): Promise<void> {
    try {
      await db.systemLog.create({
        data: {
          level: log.result === "success" ? "INFO" : "WARNING",
          category: "TRADE",
          message: `[${this.exchangeId.toUpperCase()}] ${log.operation || "api_call"}: ${log.result}`,
          details: JSON.stringify({
            exchange: this.exchangeId,
            marketType: this.marketType,
            tradingMode: this.tradingMode,
            testnet: this.testnet,
            ...log,
          }),
        },
      });
    } catch (error) {
      console.error("Failed to log request:", error);
    }
  }

  // ==================== UTILITY METHODS ====================

  protected getSymbolFormatted(symbol: string): string {
    // Override in subclasses for exchange-specific formatting
    return symbol.toUpperCase();
  }

  protected getSideFormatted(side: string): string {
    return side.toUpperCase();
  }

  getRateLimitStatus(): { used: number; limit: number; resetIn: number } {
    return this.rateLimiter.getStatus();
  }

  getExchangeInfo(): { 
    id: AllExchangeId; 
    marketType: MarketType; 
    testnet: boolean;
    tradingMode: TradingMode;
  } {
    return {
      id: this.exchangeId,
      marketType: this.marketType,
      testnet: this.testnet,
      tradingMode: this.tradingMode,
    };
  }

  /**
   * Check if current mode is demo
   */
  isDemo(): boolean {
    return this.tradingMode === "DEMO";
  }

  /**
   * Check if current mode is testnet
   */
  isTestnet(): boolean {
    return this.tradingMode === "TESTNET" || this.testnet;
  }

  // ==================== CIRCUIT BREAKER METHODS ====================

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): "CLOSED" | "OPEN" | "HALF_OPEN" {
    return this.circuitBreaker.getState();
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats(): ReturnType<ExchangeCircuitBreaker["getStats"]> {
    return this.circuitBreaker.getStats();
  }

  /**
   * Force open the circuit breaker (stop all requests)
   */
  forceCircuitBreakerOpen(): void {
    this.circuitBreaker.forceOpen();
  }

  /**
   * Force close the circuit breaker (allow all requests)
   */
  forceCircuitBreakerClose(): void {
    this.circuitBreaker.forceClose();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  // ==================== ORPHANED ORDER DETECTION ====================

  /**
   * Detect orphaned orders - orders that exist locally but not on exchange
   * 
   * Orphaned orders can occur when:
   * - Network issues cause local state to be out of sync
   * - Exchange API returns incomplete data
   * - System crashes before state is updated
   * 
   * @param localOrders - Orders from local database/state
   * @param symbols - Symbols to check (optional, checks all if not provided)
   * @returns Orphaned orders that need reconciliation
   */
  async detectOrphanedOrders(
    localOrders: Array<{ id: string; orderId: string; symbol: string; status: string }>,
    symbols?: string[]
  ): Promise<OrphanedOrderResult> {
    const result: OrphanedOrderResult = {
      orphaned: [],
      confirmed: [],
      errors: [],
      timestamp: new Date(),
    };

    try {
      // Get all open orders from exchange
      const symbolsToCheck = symbols || [...new Set(localOrders.map(o => o.symbol))];
      
      for (const symbol of symbolsToCheck) {
        try {
          const exchangeOrders = await this.getOpenOrders(symbol);
          const exchangeOrderIds = new Set(exchangeOrders.map(o => o.id));
          
          // Find local orders not on exchange
          for (const localOrder of localOrders.filter(o => o.symbol === symbol)) {
            // Only check orders that should be open
            if (!['open', 'pending', 'partial'].includes(localOrder.status.toLowerCase())) {
              continue;
            }
            
            if (!exchangeOrderIds.has(localOrder.orderId)) {
              result.orphaned.push({
                localId: localOrder.id,
                orderId: localOrder.orderId,
                symbol: localOrder.symbol,
                reason: 'NOT_FOUND_ON_EXCHANGE',
                detectedAt: new Date(),
              });
            } else {
              result.confirmed.push({
                localId: localOrder.id,
                orderId: localOrder.orderId,
                symbol: localOrder.symbol,
              });
            }
          }
        } catch (error) {
          result.errors.push({
            symbol,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      
      console.log(`[BaseClient] Orphan detection: ${result.orphaned.length} orphaned, ${result.confirmed.length} confirmed, ${result.errors.length} errors`);
      
    } catch (error) {
      console.error('[BaseClient] Error detecting orphaned orders:', error);
      result.errors.push({
        symbol: 'ALL',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return result;
  }

  /**
   * Reconcile orphaned orders with exchange state
   * 
   * @param orphanedOrders - List of orphaned orders to reconcile
   * @param reconciliationStrategy - How to handle orphaned orders
   * @returns Reconciliation result
   */
  async reconcileOrphanedOrders(
    orphanedOrders: Array<{ localId: string; orderId: string; symbol: string }>,
    reconciliationStrategy: 'MARK_CANCELLED' | 'CHECK_HISTORY' = 'CHECK_HISTORY'
  ): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      reconciled: [],
      failed: [],
      strategy: reconciliationStrategy,
    };

    for (const orphan of orphanedOrders) {
      try {
        let finalStatus = 'CANCELLED'; // Default assumption
        let filledQuantity = 0;
        let avgPrice = 0;

        if (reconciliationStrategy === 'CHECK_HISTORY') {
          // Try to find order in history to determine actual final state
          try {
            const history = await this.getOrderHistory(orphan.symbol, 100);
            const historicalOrder = history.find(o => o.id === orphan.orderId);
            
            if (historicalOrder) {
              finalStatus = historicalOrder.status.toUpperCase();
              filledQuantity = historicalOrder.filledQuantity;
              avgPrice = historicalOrder.avgPrice;
            }
          } catch (historyError) {
            console.warn(`[BaseClient] Could not fetch history for ${orphan.orderId}:`, historyError);
          }
        }

        result.reconciled.push({
          localId: orphan.localId,
          orderId: orphan.orderId,
          symbol: orphan.symbol,
          finalStatus,
          filledQuantity,
          avgPrice,
          reconciledAt: new Date(),
        });

        console.log(`[BaseClient] Reconciled order ${orphan.orderId} as ${finalStatus}`);
        
      } catch (error) {
        result.failed.push({
          localId: orphan.localId,
          orderId: orphan.orderId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Schedule periodic orphan detection
   * 
   * @param intervalMs - Interval in milliseconds (default: 5 minutes)
   * @param localOrdersProvider - Function to get local orders
   * @param onOrphaned - Callback when orphaned orders are detected
   * @returns Cleanup function to stop periodic checks
   */
  scheduleOrphanDetection(
    intervalMs: number,
    localOrdersProvider: () => Promise<Array<{ id: string; orderId: string; symbol: string; status: string }>>,
    onOrphaned?: (result: OrphanedOrderResult) => Promise<void>
  ): () => void {
    const interval = setInterval(async () => {
      try {
        const localOrders = await localOrdersProvider();
        const result = await this.detectOrphanedOrders(localOrders);
        
        if (result.orphaned.length > 0 && onOrphaned) {
          await onOrphaned(result);
        }
      } catch (error) {
        console.error('[BaseClient] Periodic orphan detection error:', error);
      }
    }, intervalMs);

    console.log(`[BaseClient] Scheduled orphan detection every ${intervalMs}ms`);

    return () => {
      clearInterval(interval);
      console.log('[BaseClient] Stopped periodic orphan detection');
    };
  }
}

// =================--- EXPORTS -------------------//

export { RateLimiter };
