# Binance API Response Logging

This document covers the implementation of comprehensive response logging for Binance API, including error tracking, order status monitoring, and audit trails.

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Response Logger Implementation](#response-logger-implementation)
4. [Error Tracking](#error-tracking)
5. [Order Status Monitoring](#order-status-monitoring)
6. [Audit Trail](#audit-trail)

## Overview

### What to Log

1. **All API Requests**
   - Endpoint
   - Method
   - Parameters
   - Timestamp
   - API key used

2. **All API Responses**
   - Status code
   - Response body
   - Headers (rate limit info)
   - Duration
   - Timestamp

3. **All Errors**
   - Error code
   - Error message
   - Stack trace
   - Request context
   - Retry attempts

4. **Order Events**
   - Order placement
   - Order updates
   - Order rejections
   - Order cancellations
   - Order fills

### Why Log Everything

1. **Debugging**: Track down issues with orders
2. **Audit Trail**: Compliance and accountability
3. **Performance Analysis**: Identify bottlenecks
4. **Error Recovery**: Reconstruct state after failures
5. **Rate Limit Management**: Track usage patterns

## Database Schema

### Prisma Schema

```prisma
// API Request Log
model ApiRequestLog {
  id            String   @id @default(cuid())
  timestamp     DateTime @default(now())
  endpoint      String
  method        String
  params        Json?
  apiKey        String?  // Last 8 characters only
  responseCode  Int
  responseBody  Json?
  duration      Int      // milliseconds
  ip            String?
  userAgent     String?
  rateLimitUsed Int?
  rateLimitRem  Int?
  error         Json?
  createdAt     DateTime @default(now())

  @@index([timestamp])
  @@index([endpoint])
  @@index([responseCode])
}

// Order Event Log
model OrderEventLog {
  id              String   @id @default(cuid())
  timestamp       DateTime @default(now())
  orderId         BigInt?
  clientOrderId   String?
  symbol          String
  side            String
  type            String
  status          String
  event           String   // CREATED, UPDATED, FILLED, CANCELLED, REJECTED
  price           Decimal? @db.Decimal(20, 8)
  quantity        Decimal? @db.Decimal(20, 8)
  executedQty     Decimal? @db.Decimal(20, 8)
  cumulativeQty   Decimal? @db.Decimal(20, 8)
  commission      Decimal? @db.Decimal(20, 8)
  commissionAsset String?
  errorCode       Int?
  errorMessage    String?
  rawData         Json?
  createdAt       DateTime @default(now())

  @@index([timestamp])
  @@index([symbol])
  @@index([orderId])
  @@index([clientOrderId])
  @@index([event])
}

// Error Log
model ErrorLog {
  id          String   @id @default(cuid())
  timestamp   DateTime @default(now())
  errorCode   Int
  errorMessage String
  httpStatus  Int
  endpoint    String
  params      Json?
  stackTrace  String?
  retryCount  Int      @default(0)
  resolved    Boolean  @default(false)
  resolvedAt  DateTime?
  notes       String?
  createdAt   DateTime @default(now())

  @@index([timestamp])
  @@index([errorCode])
  @@index([resolved])
}

// API Response Archive (for large responses)
model ApiResponseArchive {
  id        String   @id @default(cuid())
  timestamp DateTime @default(now())
  requestId String
  endpoint  String
  data      String   @db.Text
  compressed Boolean @default(false)
  createdAt DateTime @default(now())

  @@index([timestamp])
  @@index([requestId])
}
```

## Response Logger Implementation

### Core Logger Class

```typescript
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

interface LogContext {
  endpoint: string;
  method: string;
  params?: Record<string, any>;
  apiKey?: string;
}

interface ResponseLog {
  statusCode: number;
  body: any;
  duration: number;
  headers?: Record<string, string>;
}

class BinanceResponseLogger {
  private prisma: PrismaClient;
  private enabled: boolean = true;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async logRequest(
    context: LogContext,
    response: ResponseLog
  ): Promise<string> {
    if (!this.enabled) return '';

    try {
      const log = await this.prisma.apiRequestLog.create({
        data: {
          timestamp: new Date(),
          endpoint: context.endpoint,
          method: context.method,
          params: this.sanitizeParams(context.params),
          apiKey: this.maskApiKey(context.apiKey),
          responseCode: response.statusCode,
          responseBody: this.truncateResponse(response.body),
          duration: response.duration,
          rateLimitUsed: this.extractRateLimit(response.headers, 'used'),
          rateLimitRem: this.extractRateLimit(response.headers, 'remaining'),
          error: response.statusCode >= 400 ? response.body : undefined
        }
      });

      // Log errors separately for easier querying
      if (response.statusCode >= 400) {
        await this.logError(response.body, context);
      }

      return log.id;
    } catch (error) {
      console.error('Failed to log API response:', error);
      return '';
    }
  }

  private sanitizeParams(params?: Record<string, any>): Record<string, any> {
    if (!params) return {};

    const sanitized = { ...params };

    // Remove sensitive data
    delete sanitized.signature;
    delete sanitized.apiKey;
    if (sanitized.timestamp) {
      sanitized.timestamp = new Date(sanitized.timestamp).toISOString();
    }

    return sanitized;
  }

  private maskApiKey(apiKey?: string): string | null {
    if (!apiKey) return null;
    if (apiKey.length <= 8) return '********';
    return '...' + apiKey.slice(-8);
  }

  private truncateResponse(body: any): any {
    const str = JSON.stringify(body);
    if (str.length > 10000) {
      return {
        truncated: true,
        preview: str.slice(0, 1000),
        length: str.length
      };
    }
    return body;
  }

  private extractRateLimit(
    headers: Record<string, string> | undefined,
    type: 'used' | 'remaining'
  ): number | null {
    if (!headers) return null;

    // Try to find rate limit header
    for (const key of Object.keys(headers)) {
      if (key.startsWith('x-mbx-used-weight')) {
        if (type === 'used') return parseInt(headers[key]);
      }
      // Note: Remaining is not always provided
    }
    return null;
  }

  private async logError(
    error: any,
    context: LogContext
  ): Promise<void> {
    await this.prisma.errorLog.create({
      data: {
        timestamp: new Date(),
        errorCode: error.code || -1,
        errorMessage: error.msg || error.message || 'Unknown error',
        httpStatus: error.status || 500,
        endpoint: context.endpoint,
        params: this.sanitizeParams(context.params)
      }
    });
  }

  // Enable/disable logging
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
```

### Wrapped Client with Logging

```typescript
class LoggedBinanceClient {
  private client: BinanceTradingClient;
  private logger: BinanceResponseLogger;

  constructor(
    config: TradingConfig,
    logger: BinanceResponseLogger
  ) {
    this.client = new BinanceTradingClient(config);
    this.logger = logger;
  }

  async request<T>(
    method: string,
    endpoint: string,
    params: Record<string, any> = {},
    apiCall: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let response: any;
    let statusCode = 200;

    try {
      response = await apiCall();
      return response;
    } catch (error: any) {
      statusCode = error.status || 500;
      response = {
        code: error.code || -1000,
        msg: error.message
      };
      throw error;
    } finally {
      const duration = Date.now() - startTime;

      // Log in background (don't wait)
      this.logger.logRequest(
        {
          endpoint,
          method,
          params
        },
        {
          statusCode,
          body: response,
          duration
        }
      ).catch(console.error);
    }
  }

  async placeOrder(params: OrderParams): Promise<any> {
    return this.request(
      'POST',
      '/api/v3/order',
      params as any,
      () => this.client.placeOrder(params)
    );
  }

  async cancelOrder(symbol: string, orderId?: number, clientOrderId?: string): Promise<any> {
    const params: any = { symbol };
    if (orderId) params.orderId = orderId;
    if (clientOrderId) params.origClientOrderId = clientOrderId;

    return this.request(
      'DELETE',
      '/api/v3/order',
      params,
      () => this.client.cancelOrder(symbol, orderId, clientOrderId)
    );
  }
}
```

## Error Tracking

### Error Categorization

```typescript
enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_REQUEST = 'INVALID_REQUEST',
  ORDER_REJECTED = 'ORDER_REJECTED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  UNKNOWN = 'UNKNOWN'
}

class ErrorClassifier {
  static categorize(error: any): ErrorCategory {
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

  static isRecoverable(error: any): boolean {
    const category = this.categorize(error);

    return [
      ErrorCategory.NETWORK,
      ErrorCategory.RATE_LIMIT
    ].includes(category);
  }

  static getRecommendedAction(error: any): string {
    const category = this.categorize(error);

    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Retry with exponential backoff';
      case ErrorCategory.AUTHENTICATION:
        return 'Verify API key and permissions';
      case ErrorCategory.RATE_LIMIT:
        return 'Wait and reduce request frequency';
      case ErrorCategory.INVALID_REQUEST:
        return 'Fix request parameters';
      case ErrorCategory.ORDER_REJECTED:
        return 'Check order parameters and account status';
      case ErrorCategory.INSUFFICIENT_FUNDS:
        return 'Check account balance';
      default:
        return 'Investigate and retry if appropriate';
    }
  }
}
```

### Error Aggregation

```typescript
interface ErrorStats {
  total: number;
  byCode: Record<number, number>;
  byCategory: Record<string, number>;
  lastOccurrence: Date;
  trend: 'increasing' | 'stable' | 'decreasing';
}

class ErrorAggregator {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getStats(hours: number = 24): Promise<ErrorStats> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const errors = await this.prisma.errorLog.findMany({
      where: {
        timestamp: { gte: since }
      },
      orderBy: { timestamp: 'asc' }
    });

    const byCode: Record<number, number> = {};
    const byCategory: Record<string, number> = {};

    for (const error of errors) {
      byCode[error.errorCode] = (byCode[error.errorCode] || 0) + 1;

      const category = ErrorClassifier.categorize({
        code: error.errorCode,
        msg: error.errorMessage
      });
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    // Calculate trend (compare first half vs second half)
    const halfIndex = Math.floor(errors.length / 2);
    const firstHalf = errors.slice(0, halfIndex).length;
    const secondHalf = errors.slice(halfIndex).length;

    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (secondHalf > firstHalf * 1.2) trend = 'increasing';
    else if (secondHalf < firstHalf * 0.8) trend = 'decreasing';

    return {
      total: errors.length,
      byCode,
      byCategory,
      lastOccurrence: errors[errors.length - 1]?.timestamp || new Date(),
      trend
    };
  }

  async getUnresolved(): Promise<ErrorLog[]> {
    return this.prisma.errorLog.findMany({
      where: { resolved: false },
      orderBy: { timestamp: 'desc' },
      take: 100
    });
  }

  async markResolved(id: string, notes?: string): Promise<void> {
    await this.prisma.errorLog.update({
      where: { id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        notes
      }
    });
  }
}
```

## Order Status Monitoring

### Order Event Logger

```typescript
class OrderEventLogger {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async logCreated(response: OrderResponse): Promise<void> {
    await this.prisma.orderEventLog.create({
      data: {
        timestamp: new Date(response.transactTime),
        orderId: response.orderId,
        clientOrderId: response.clientOrderId,
        symbol: response.symbol,
        side: response.side,
        type: response.type,
        status: response.status,
        price: response.price,
        quantity: response.origQty,
        executedQty: response.executedQty,
        event: 'CREATED',
        rawData: response
      }
    });
  }

  async logUpdate(order: any, event: string): Promise<void> {
    await this.prisma.orderEventLog.create({
      data: {
        timestamp: new Date(),
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        status: order.status,
        price: order.price,
        quantity: order.origQty,
        executedQty: order.executedQty,
        cumulativeQty: order.cummulativeQuoteQty,
        event: event,
        rawData: order
      }
    });
  }

  async logRejected(
    params: OrderParams,
    error: any
  ): Promise<void> {
    await this.prisma.orderEventLog.create({
      data: {
        timestamp: new Date(),
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        status: 'REJECTED',
        price: params.price ? parseFloat(params.price) : null,
        quantity: params.quantity ? parseFloat(params.quantity) : null,
        event: 'REJECTED',
        errorCode: error.code,
        errorMessage: error.msg,
        rawData: { params, error }
      }
    });
  }

  async logFilled(
    order: any,
    trade: Trade
  ): Promise<void> {
    await this.prisma.orderEventLog.create({
      data: {
        timestamp: new Date(trade.time),
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        symbol: trade.symbol,
        side: trade.isBuyer ? 'BUY' : 'SELL',
        type: order.type,
        status: 'FILLED',
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.qty),
        executedQty: parseFloat(trade.qty),
        cumulativeQty: parseFloat(trade.quoteQty),
        commission: parseFloat(trade.commission),
        commissionAsset: trade.commissionAsset,
        event: 'FILLED',
        rawData: { order, trade }
      }
    });
  }

  async getOrderHistory(
    symbol?: string,
    hours: number = 24
  ): Promise<OrderEventLog[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.prisma.orderEventLog.findMany({
      where: {
        timestamp: { gte: since },
        ...(symbol && { symbol })
      },
      orderBy: { timestamp: 'desc' },
      take: 500
    });
  }

  async getRejections(hours: number = 24): Promise<OrderEventLog[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.prisma.orderEventLog.findMany({
      where: {
        event: 'REJECTED',
        timestamp: { gte: since }
      },
      orderBy: { timestamp: 'desc' }
    });
  }
}
```

## Audit Trail

### Complete Audit System

```typescript
interface AuditEntry {
  timestamp: Date;
  action: string;
  resource: string;
  resourceId?: string;
  actor: string;
  details: Record<string, any>;
  previousState?: any;
  newState?: any;
}

class AuditLogger {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        timestamp: entry.timestamp,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        actor: entry.actor,
        details: entry.details,
        previousState: entry.previousState,
        newState: entry.newState
      }
    });
  }

  async logOrderAction(
    action: 'CREATE' | 'CANCEL' | 'MODIFY',
    order: any,
    actor: string = 'system'
  ): Promise<void> {
    await this.log({
      timestamp: new Date(),
      action: `ORDER_${action}`,
      resource: 'ORDER',
      resourceId: order.orderId?.toString() || order.clientOrderId,
      actor,
      details: {
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.quantity || order.origQty,
        price: order.price
      },
      newState: order
    });
  }

  async logConfigChange(
    config: string,
    previousValue: any,
    newValue: any,
    actor: string
  ): Promise<void> {
    await this.log({
      timestamp: new Date(),
      action: 'CONFIG_CHANGE',
      resource: 'CONFIG',
      resourceId: config,
      actor,
      details: { config },
      previousState: previousValue,
      newState: newValue
    });
  }

  async getAuditTrail(
    resource?: string,
    resourceId?: string,
    hours: number = 24
  ): Promise<AuditEntry[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.prisma.auditLog.findMany({
      where: {
        timestamp: { gte: since },
        ...(resource && { resource }),
        ...(resourceId && { resourceId })
      },
      orderBy: { timestamp: 'desc' },
      take: 1000
    }) as Promise<AuditEntry[]>;
  }
}
```

### Query Utilities

```typescript
class LogQueryService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async searchErrors(query: {
    code?: number;
    endpoint?: string;
    from?: Date;
    to?: Date;
    resolved?: boolean;
  }): Promise<ErrorLog[]> {
    return this.prisma.errorLog.findMany({
      where: {
        ...(query.code && { errorCode: query.code }),
        ...(query.endpoint && { endpoint: { contains: query.endpoint } }),
        ...(query.from && { timestamp: { gte: query.from } }),
        ...(query.to && { timestamp: { lte: query.to } }),
        ...(query.resolved !== undefined && { resolved: query.resolved })
      },
      orderBy: { timestamp: 'desc' },
      take: 500
    });
  }

  async getApiStats(hours: number = 24): Promise<{
    totalRequests: number;
    successRate: number;
    avgDuration: number;
    endpointStats: Record<string, { count: number; avgDuration: number }>;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await this.prisma.apiRequestLog.findMany({
      where: { timestamp: { gte: since } }
    });

    const totalRequests = logs.length;
    const successCount = logs.filter(l => l.responseCode < 400).length;
    const avgDuration = logs.reduce((sum, l) => sum + l.duration, 0) / totalRequests;

    const endpointStats: Record<string, { count: number; avgDuration: number }> = {};
    for (const log of logs) {
      if (!endpointStats[log.endpoint]) {
        endpointStats[log.endpoint] = { count: 0, avgDuration: 0 };
      }
      endpointStats[log.endpoint].count++;
      endpointStats[log.endpoint].avgDuration += log.duration;
    }

    for (const endpoint of Object.keys(endpointStats)) {
      endpointStats[endpoint].avgDuration /= endpointStats[endpoint].count;
    }

    return {
      totalRequests,
      successRate: successCount / totalRequests,
      avgDuration,
      endpointStats
    };
  }

  async exportLogs(
    type: 'api' | 'error' | 'order',
    from: Date,
    to: Date
  ): Promise<string> {
    let data: any[];

    switch (type) {
      case 'api':
        data = await this.prisma.apiRequestLog.findMany({
          where: { timestamp: { gte: from, lte: to } }
        });
        break;
      case 'error':
        data = await this.prisma.errorLog.findMany({
          where: { timestamp: { gte: from, lte: to } }
        });
        break;
      case 'order':
        data = await this.prisma.orderEventLog.findMany({
          where: { timestamp: { gte: from, lte: to } }
        });
        break;
    }

    return JSON.stringify(data, null, 2);
  }
}
```
