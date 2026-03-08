/**
 * Binance API Client with Response Logging
 * 
 * This client wraps all Binance API calls with comprehensive logging:
 * - All requests are logged with parameters
 * - All responses are logged with timing
 * - All errors are categorized and stored
 * - Order events are tracked separately
 * 
 * Based on official Binance documentation:
 * - https://github.com/binance/binance-spot-api-docs
 * - https://github.com/binance/binance-connector-js
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

// ==================== TYPES ====================

export interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  recvWindow?: number;
  accountId?: string;
  userId?: string;
}

export interface OrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT' | 'LIMIT_MAKER';
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  quantity?: string;
  quoteOrderQty?: string;
  price?: string;
  stopPrice?: string;
  icebergQty?: string;
  newClientOrderId?: string;
  newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
}

export interface OrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'PENDING_CANCEL' | 'REJECTED' | 'EXPIRED';
  timeInForce: string;
  type: string;
  side: string;
  workingTime: number;
  selfTradePreventionMode: string;
}

export interface BinanceApiError {
  code: number;
  msg: string;
  status?: number;
}

// Error categories for classification
export enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_REQUEST = 'INVALID_REQUEST',
  ORDER_REJECTED = 'ORDER_REJECTED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  UNKNOWN = 'UNKNOWN'
}

// ==================== ERROR CLASSIFIER ====================

class ErrorClassifier {
  static categorize(error: BinanceApiError): ErrorCategory {
    if (!error.code) return ErrorCategory.UNKNOWN;

    const code = error.code;

    // Authentication errors
    if ([-1002, -2014, -2015].includes(code)) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Rate limit errors
    if ([-1003, -1015].includes(code)) {
      return ErrorCategory.RATE_LIMIT;
    }

    // Invalid request
    if (code >= -1199 && code <= -1100) {
      return ErrorCategory.INVALID_REQUEST;
    }

    // Order rejected
    if (code === -2010) {
      return ErrorCategory.ORDER_REJECTED;
    }

    // Check error message
    const msg = (error.msg || '').toLowerCase();

    if (msg.includes('insufficient balance') || msg.includes('insufficient funds')) {
      return ErrorCategory.INSUFFICIENT_FUNDS;
    }

    if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
      return ErrorCategory.NETWORK;
    }

    return ErrorCategory.UNKNOWN;
  }

  static isRecoverable(error: BinanceApiError): boolean {
    const category = this.categorize(error);
    return [ErrorCategory.NETWORK, ErrorCategory.RATE_LIMIT].includes(category);
  }
}

// ==================== BINANCE CLIENT ====================

export class BinanceClient {
  private baseUrl: string;
  private recvWindow: number;
  private prisma: PrismaClient;
  private config: BinanceConfig;
  private clockOffset: number = 0;

  constructor(config: BinanceConfig, prisma: PrismaClient) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.binance.com';
    this.recvWindow = config.recvWindow || 5000;
    this.prisma = prisma;
  }

  // ==================== PUBLIC METHODS ====================

  /**
   * Sync clock with Binance server
   */
  async syncClock(): Promise<void> {
    const localTime = Date.now();
    const response = await this.publicRequest('GET', '/api/v3/time');
    const serverTime = response.serverTime;
    this.clockOffset = serverTime - localTime;
    console.log(`[Binance] Clock synced, offset: ${this.clockOffset}ms`);
  }

  /**
   * Get exchange information
   */
  async getExchangeInfo(symbol?: string): Promise<any> {
    const params = symbol ? { symbol } : {};
    return this.publicRequest('GET', '/api/v3/exchangeInfo', params);
  }

  /**
   * Get account information
   */
  async getAccount(): Promise<any> {
    return this.signedRequest('GET', '/api/v3/account');
  }

  /**
   * Get current prices
   */
  async getPrices(symbols?: string[]): Promise<any> {
    if (symbols && symbols.length > 0) {
      return this.publicRequest('GET', '/api/v3/ticker/price', { symbols: JSON.stringify(symbols) });
    }
    return this.publicRequest('GET', '/api/v3/ticker/price');
  }

  /**
   * Get order book
   */
  async getOrderBook(symbol: string, limit: number = 100): Promise<any> {
    return this.publicRequest('GET', '/api/v3/depth', { symbol, limit });
  }

  /**
   * Get klines/candlesticks
   */
  async getKlines(symbol: string, interval: string, options?: {
    limit?: number;
    startTime?: number;
    endTime?: number;
  }): Promise<any> {
    const params = { symbol, interval, ...options };
    return this.publicRequest('GET', '/api/v3/klines', params);
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(symbol: string, limit: number = 500): Promise<any> {
    return this.publicRequest('GET', '/api/v3/trades', { symbol, limit });
  }

  // ==================== TRADING METHODS ====================

  /**
   * Place a new order
   */
  async placeOrder(params: OrderParams): Promise<OrderResponse> {
    const response = await this.signedRequest('POST', '/api/v3/order', params as any);
    
    // Log order event
    await this.logOrderEvent(response, 'CREATED');
    
    return response;
  }

  /**
   * Test order placement (validation only)
   */
  async testOrder(params: OrderParams): Promise<any> {
    return this.signedRequest('POST', '/api/v3/order/test', params as any);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol: string, orderId?: number, clientOrderId?: string): Promise<any> {
    const params: any = { symbol };
    if (orderId) params.orderId = orderId;
    if (clientOrderId) params.origClientOrderId = clientOrderId;
    
    const response = await this.signedRequest('DELETE', '/api/v3/order', params);
    
    // Log order event
    await this.logOrderEvent(response, 'CANCELLED');
    
    return response;
  }

  /**
   * Cancel all open orders for a symbol
   */
  async cancelAllOrders(symbol: string): Promise<any> {
    return this.signedRequest('DELETE', '/api/v3/openOrders', { symbol });
  }

  /**
   * Query order status
   */
  async getOrder(symbol: string, orderId?: number, clientOrderId?: string): Promise<any> {
    const params: any = { symbol };
    if (orderId) params.orderId = orderId;
    if (clientOrderId) params.origClientOrderId = clientOrderId;
    return this.signedRequest('GET', '/api/v3/order', params);
  }

  /**
   * Get open orders
   */
  async getOpenOrders(symbol?: string): Promise<any> {
    const params = symbol ? { symbol } : {};
    return this.signedRequest('GET', '/api/v3/openOrders', params);
  }

  /**
   * Get all orders
   */
  async getAllOrders(symbol: string, options?: {
    orderId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<any> {
    return this.signedRequest('GET', '/api/v3/allOrders', { symbol, ...options });
  }

  /**
   * Get my trades
   */
  async getMyTrades(symbol: string, options?: {
    orderId?: number;
    startTime?: number;
    endTime?: number;
    fromId?: number;
    limit?: number;
  }): Promise<any> {
    return this.signedRequest('GET', '/api/v3/myTrades', { symbol, ...options });
  }

  // ==================== INTERNAL METHODS ====================

  /**
   * Make a public (non-signed) request
   */
  private async publicRequest(
    method: string,
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    const startTime = Date.now();
    let statusCode = 200;
    let response: any;

    try {
      const url = this.buildUrl(endpoint, params);
      const httpResponse = await fetch(url, { method });
      statusCode = httpResponse.status;
      response = await httpResponse.json();

      if (!httpResponse.ok) {
        throw this.createError(response, statusCode);
      }

      return response;
    } catch (error: any) {
      statusCode = error.status || 500;
      response = { code: error.code || -1000, msg: error.message };
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await this.logRequest(method, endpoint, params, statusCode, response, duration);
    }
  }

  /**
   * Make a signed request
   */
  private async signedRequest(
    method: string,
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    const startTime = Date.now();
    let statusCode = 200;
    let response: any;

    try {
      // Add timestamp
      params.timestamp = Date.now() + this.clockOffset;
      params.recvWindow = this.recvWindow;

      // Build query string
      const queryString = Object.keys(params)
        .map(key => `${key}=${params[key]}`)
        .join('&');

      // Generate signature
      const signature = crypto
        .createHmac('sha256', this.config.apiSecret)
        .update(queryString)
        .digest('hex');

      // Build URL with signature
      const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;

      // Make request
      const httpResponse = await fetch(url, {
        method,
        headers: {
          'X-MBX-APIKEY': this.config.apiKey
        }
      });

      statusCode = httpResponse.status;
      response = await httpResponse.json();

      if (!httpResponse.ok) {
        // Log error for order rejections
        if (endpoint.includes('/order') && method !== 'GET') {
          await this.logOrderError(params, response, statusCode);
        }
        throw this.createError(response, statusCode);
      }

      return response;
    } catch (error: any) {
      statusCode = error.status || 500;
      if (!response) {
        response = { code: error.code || -1000, msg: error.message };
      }
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await this.logRequest(method, endpoint, params, statusCode, response, duration);
    }
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params: Record<string, any>): string {
    const queryString = Object.keys(params)
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return queryString
      ? `${this.baseUrl}${endpoint}?${queryString}`
      : `${this.baseUrl}${endpoint}`;
  }

  /**
   * Create standardized error
   */
  private createError(response: any, statusCode: number): BinanceApiError {
    return {
      code: response.code || -1000,
      msg: response.msg || 'Unknown error',
      status: statusCode
    };
  }

  // ==================== LOGGING METHODS ====================

  /**
   * Log API request
   */
  private async logRequest(
    method: string,
    endpoint: string,
    params: Record<string, any>,
    statusCode: number,
    response: any,
    duration: number
  ): Promise<void> {
    try {
      // Sanitize params
      const sanitizedParams = this.sanitizeParams(params);
      
      // Truncate response if too large
      const responseStr = JSON.stringify(response);
      const truncatedResponse = responseStr.length > 5000
        ? responseStr.substring(0, 5000) + '...[truncated]'
        : responseStr;

      await this.prisma.binanceApiRequestLog.create({
        data: {
          timestamp: new Date(),
          endpoint,
          method,
          params: JSON.stringify(sanitizedParams),
          apiKeyMasked: this.maskApiKey(this.config.apiKey),
          responseCode: statusCode,
          responseBody: truncatedResponse,
          duration,
          errorMessage: statusCode >= 400 ? response?.msg : null,
          accountId: this.config.accountId,
          userId: this.config.userId
        }
      });

      // Log error separately for easier querying
      if (statusCode >= 400) {
        await this.logError(endpoint, params, response, statusCode);
      }
    } catch (error) {
      console.error('[Binance] Failed to log request:', error);
    }
  }

  /**
   * Log order event
   */
  private async logOrderEvent(response: OrderResponse, event: string): Promise<void> {
    try {
      await this.prisma.binanceOrderEventLog.create({
        data: {
          timestamp: new Date(response.transactTime || Date.now()),
          orderId: response.orderId?.toString(),
          clientOrderId: response.clientOrderId,
          symbol: response.symbol,
          side: response.side,
          type: response.type,
          status: response.status,
          price: parseFloat(response.price) || null,
          quantity: parseFloat(response.origQty) || null,
          executedQty: parseFloat(response.executedQty) || null,
          event,
          rawData: JSON.stringify(response),
          accountId: this.config.accountId,
          userId: this.config.userId
        }
      });
    } catch (error) {
      console.error('[Binance] Failed to log order event:', error);
    }
  }

  /**
   * Log order error (rejection)
   */
  private async logOrderError(
    params: Record<string, any>,
    response: any,
    statusCode: number
  ): Promise<void> {
    try {
      const error: BinanceApiError = {
        code: response.code || -1000,
        msg: response.msg || 'Unknown error',
        status: statusCode
      };

      const category = ErrorClassifier.categorize(error);

      await this.prisma.binanceOrderEventLog.create({
        data: {
          timestamp: new Date(),
          symbol: params.symbol || 'UNKNOWN',
          side: params.side || 'UNKNOWN',
          type: params.type || 'UNKNOWN',
          status: 'REJECTED',
          price: params.price ? parseFloat(params.price) : null,
          quantity: params.quantity ? parseFloat(params.quantity) : null,
          event: 'REJECTED',
          errorCode: error.code,
          errorMessage: error.msg,
          rawData: JSON.stringify({ params, response }),
          accountId: this.config.accountId,
          userId: this.config.userId
        }
      });

      await this.prisma.binanceErrorLog.create({
        data: {
          timestamp: new Date(),
          errorCode: error.code,
          errorMessage: error.msg,
          httpStatus: statusCode,
          endpoint: '/api/v3/order',
          params: JSON.stringify(this.sanitizeParams(params)),
          category,
          isRecoverable: ErrorClassifier.isRecoverable(error),
          accountId: this.config.accountId,
          userId: this.config.userId
        }
      });
    } catch (error) {
      console.error('[Binance] Failed to log order error:', error);
    }
  }

  /**
   * Log error
   */
  private async logError(
    endpoint: string,
    params: Record<string, any>,
    response: any,
    statusCode: number
  ): Promise<void> {
    try {
      const error: BinanceApiError = {
        code: response.code || -1000,
        msg: response.msg || 'Unknown error',
        status: statusCode
      };

      const category = ErrorClassifier.categorize(error);

      await this.prisma.binanceErrorLog.create({
        data: {
          timestamp: new Date(),
          errorCode: error.code,
          errorMessage: error.msg,
          httpStatus: statusCode,
          endpoint,
          params: JSON.stringify(this.sanitizeParams(params)),
          category,
          isRecoverable: ErrorClassifier.isRecoverable(error),
          accountId: this.config.accountId,
          userId: this.config.userId
        }
      });
    } catch (error) {
      console.error('[Binance] Failed to log error:', error);
    }
  }

  /**
   * Sanitize parameters (remove sensitive data)
   */
  private sanitizeParams(params: Record<string, any>): Record<string, any> {
    const sanitized = { ...params };
    delete sanitized.signature;
    delete sanitized.apiKey;
    delete sanitized.apiSecret;
    return sanitized;
  }

  /**
   * Mask API key (show only last 8 characters)
   */
  private maskApiKey(apiKey: string | undefined): string | null {
    if (!apiKey) return null;
    if (apiKey.length <= 8) return '********';
    return '...' + apiKey.slice(-8);
  }
}

// ==================== EXPORT SINGLETON FACTORY ====================

let binanceClientInstance: BinanceClient | null = null;

export function getBinanceClient(config?: BinanceConfig): BinanceClient {
  if (!binanceClientInstance && config) {
    const prisma = new PrismaClient();
    binanceClientInstance = new BinanceClient(config, prisma);
  }
  if (!binanceClientInstance) {
    throw new Error('BinanceClient not initialized. Call getBinanceClient with config first.');
  }
  return binanceClientInstance;
}

export default BinanceClient;
