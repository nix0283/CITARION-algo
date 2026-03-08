/**
 * Exchange API Logger Service
 * 
 * Comprehensive logging service for all exchange API interactions.
 * Stores all requests, responses, and errors locally for analysis.
 * 
 * Supported exchanges: Binance, Bybit, OKX, etc.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Types
// Active exchanges only (Binance, Bybit, OKX, Bitget, BingX)
// Disabled exchanges kept as comments for future re-enablement
export type Exchange = 
  | 'binance' 
  | 'bybit' 
  | 'okx' 
  | 'bitget' 
  | 'bingx';
  // DISABLED - Uncomment to enable:
  // | 'kucoin' 
  // | 'coinbase' 
  // | 'huobi' 
  // | 'hyperliquid' 
  // | 'bitmex' 
  // | 'blofin';
export type Environment = 'mainnet' | 'testnet';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type RequestType = 'market' | 'trade' | 'account' | 'websocket' | 'position';
export type BybitCategory = 'spot' | 'linear' | 'inverse' | 'option';

export interface ApiLogOptions {
  exchange: Exchange;
  environment?: Environment;
  endpoint: string;
  method: HttpMethod;
  category?: BybitCategory;
  requestType: RequestType;
  params?: Record<string, any>;
  headers?: Record<string, string>;
  accountId?: string;
  userId?: string;
}

export interface ApiLogResult {
  success: boolean;
  logId?: string;
  error?: string;
}

// Sensitive headers to mask
const SENSITIVE_HEADERS = [
  'X-MBX-APIKEY',
  'X-BAPI-API-KEY',
  'X-API-KEY',
  'Authorization',
  'Cookie',
  'signature',
];

/**
 * Mask sensitive data in headers
 */
function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.some(h => h.toLowerCase() === key.toLowerCase())) {
      masked[key] = '***MASKED***';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * Mask sensitive data in params (like API keys, signatures, secrets)
 */
function maskSensitiveParams(params: Record<string, any>): Record<string, any> {
  const masked: Record<string, any> = {};
  const sensitiveKeys = ['apiKey', 'api_key', 'signature', 'secret', 'password', 'passphrase'];
  
  for (const [key, value] of Object.entries(params)) {
    if (sensitiveKeys.some(k => k.toLowerCase() === key.toLowerCase())) {
      masked[key] = '***MASKED***';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveParams(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

/**
 * Extract error information from Binance response
 */
function extractBinanceError(response: any): { code: number; message: string; data: any } | null {
  if (response?.code && response.code !== 0 && response.code !== 200) {
    return {
      code: response.code,
      message: response.msg || 'Unknown error',
      data: response.data || null,
    };
  }
  return null;
}

/**
 * Extract error information from Bybit response
 */
function extractBybitError(response: any): { code: number; message: string; data: any } | null {
  if (response?.retCode && response.retCode !== 0) {
    return {
      code: response.retCode,
      message: response.retMsg || 'Unknown error',
      data: response.result || null,
    };
  }
  return null;
}

/**
 * Determine if response indicates an order rejection
 */
function isOrderRejection(
  exchange: Exchange,
  errorCode: number | null,
  endpoint: string
): boolean {
  if (!errorCode) return false;
  
  // Binance order rejection codes
  const binanceOrderErrors = [-2010, -2011, -2013, -2014, -2015, -2016];
  
  // Bybit order rejection codes
  const bybitOrderErrors = [10001, 10015, 10016, 10017, 110007, 110009, 110010, 110011];
  
  // Check if endpoint is order-related
  const isOrderEndpoint = endpoint.includes('/order') || 
                          endpoint.includes('/position') ||
                          endpoint.includes('/trade');
  
  if (exchange === 'binance' && binanceOrderErrors.includes(errorCode) && isOrderEndpoint) {
    return true;
  }
  
  if (exchange === 'bybit' && bybitOrderErrors.includes(errorCode) && isOrderEndpoint) {
    return true;
  }
  
  return false;
}

/**
 * Log an API request and response
 */
export async function logApiRequest(
  options: ApiLogOptions,
  response: {
    status: number;
    data: any;
    responseTime: number;
  }
): Promise<ApiLogResult> {
  try {
    const { exchange, endpoint, method, category, requestType, params, headers, accountId, userId } = options;
    const environment = options.environment || 'mainnet';
    
    // Extract error based on exchange
    let errorInfo: { code: number; message: string; data: any } | null = null;
    
    if (exchange === 'binance') {
      errorInfo = extractBinanceError(response.data);
    } else if (exchange === 'bybit') {
      errorInfo = extractBybitError(response.data);
    } else {
      // Generic error extraction for other exchanges
      if (response.status >= 400 || response.data?.error) {
        errorInfo = {
          code: response.data?.code || response.status,
          message: response.data?.error || response.data?.message || 'Unknown error',
          data: response.data,
        };
      }
    }
    
    const isError = errorInfo !== null || response.status >= 400;
    const errorCode = errorInfo?.code || (response.status >= 400 ? response.status : null);
    
    // Create log entry
    const logEntry = await prisma.exchangeApiLog.create({
      data: {
        exchange,
        environment,
        endpoint,
        method,
        category,
        requestParams: params ? JSON.stringify(maskSensitiveParams(params)) : null,
        requestHeaders: headers ? JSON.stringify(maskSensitiveHeaders(headers)) : null,
        responseStatus: response.status,
        responseTime: response.responseTime,
        responseBody: JSON.stringify(response.data).slice(0, 10000), // Limit size
        isError,
        errorCode,
        errorMessage: errorInfo?.message || null,
        errorData: errorInfo?.data ? JSON.stringify(errorInfo.data) : null,
        requestType,
        isOrderRejection: isOrderRejection(exchange, errorCode, endpoint),
        accountId,
        userId,
      },
    });
    
    return { success: true, logId: logEntry.id };
  } catch (error) {
    console.error('Failed to log API request:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Log an API error (when request fails completely)
 */
export async function logApiError(
  options: ApiLogOptions,
  error: Error | any
): Promise<ApiLogResult> {
  try {
    const { exchange, endpoint, method, category, requestType, params, headers, accountId, userId } = options;
    const environment = options.environment || 'mainnet';
    
    const logEntry = await prisma.exchangeApiLog.create({
      data: {
        exchange,
        environment,
        endpoint,
        method,
        category,
        requestParams: params ? JSON.stringify(maskSensitiveParams(params)) : null,
        requestHeaders: headers ? JSON.stringify(maskSensitiveHeaders(headers)) : null,
        responseStatus: error?.response?.status || 0,
        responseTime: 0,
        responseBody: error?.response?.data ? JSON.stringify(error.response.data).slice(0, 10000) : null,
        isError: true,
        errorCode: error?.response?.data?.code || error?.response?.data?.retCode || 0,
        errorMessage: error?.message || 'Request failed',
        errorData: error?.response?.data ? JSON.stringify(error.response.data) : null,
        requestType,
        isOrderRejection: false,
        accountId,
        userId,
      },
    });
    
    return { success: true, logId: logEntry.id };
  } catch (logError) {
    console.error('Failed to log API error:', logError);
    return { success: false, error: String(logError) };
  }
}

/**
 * Get recent API errors for an exchange
 */
export async function getRecentErrors(
  exchange: Exchange,
  limit: number = 100,
  includeOrderRejections: boolean = true
) {
  const where: any = {
    exchange,
    isError: true,
  };
  
  if (!includeOrderRejections) {
    where.isOrderRejection = false;
  }
  
  return prisma.exchangeApiLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

/**
 * Get order rejections for analysis
 */
export async function getOrderRejections(
  exchange?: Exchange,
  limit: number = 100
) {
  const where: any = {
    isOrderRejection: true,
  };
  
  if (exchange) {
    where.exchange = exchange;
  }
  
  return prisma.exchangeApiLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

/**
 * Get API statistics for a time period
 */
export async function getApiStats(
  exchange: Exchange,
  startDate: Date,
  endDate: Date
) {
  const logs = await prisma.exchangeApiLog.findMany({
    where: {
      exchange,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
  });
  
  const total = logs.length;
  const errors = logs.filter(l => l.isError).length;
  const orderRejections = logs.filter(l => l.isOrderRejection).length;
  const avgResponseTime = logs.reduce((sum, l) => sum + l.responseTime, 0) / (total || 1);
  
  // Group by request type
  const byType: Record<string, number> = {};
  for (const log of logs) {
    byType[log.requestType] = (byType[log.requestType] || 0) + 1;
  }
  
  // Group by error code
  const errorsByCode: Record<number, number> = {};
  for (const log of logs.filter(l => l.errorCode)) {
    errorsByCode[log.errorCode!] = (errorsByCode[log.errorCode!] || 0) + 1;
  }
  
  return {
    total,
    errors,
    errorRate: total > 0 ? (errors / total) * 100 : 0,
    orderRejections,
    avgResponseTime: Math.round(avgResponseTime),
    byType,
    errorsByCode,
  };
}

/**
 * Wrapper function to log API calls automatically
 */
export async function withApiLogging<T>(
  options: ApiLogOptions,
  apiCall: () => Promise<{ status: number; data: T }>
): Promise<{ data: T; logId?: string }> {
  const startTime = Date.now();
  
  try {
    const response = await apiCall();
    const responseTime = Date.now() - startTime;
    
    const logResult = await logApiRequest(options, {
      status: response.status,
      data: response.data,
      responseTime,
    });
    
    return {
      data: response.data,
      logId: logResult.logId,
    };
  } catch (error) {
    await logApiError(options, error);
    throw error;
  }
}

const exchangeApiLogger = {
  logApiRequest,
  logApiError,
  getRecentErrors,
  getOrderRejections,
  getApiStats,
  withApiLogging,
};

export default exchangeApiLogger;
