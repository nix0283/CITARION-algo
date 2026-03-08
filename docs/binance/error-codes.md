# Binance API Error Codes Reference

This document provides a comprehensive reference for all Binance API error codes, their meanings, and recommended handling strategies.

## Table of Contents

1. [Error Response Format](#error-response-format)
2. [HTTP Status Codes](#http-status-codes)
3. [General Server Errors (10xx)](#general-server-errors-10xx)
4. [Request Issues (11xx)](#request-issues-11xx)
5. [Order Errors (20xx)](#order-errors-20xx)
6. [Filter Failures](#filter-failures)
7. [Matching Engine Errors](#matching-engine-errors)
8. [Error Handling Best Practices](#error-handling-best-practices)

## Error Response Format

All errors from Binance API follow this JSON format:

```json
{
  "code": -1121,
  "msg": "Invalid symbol."
}
```

## HTTP Status Codes

| HTTP Code | Meaning | Action |
|-----------|---------|--------|
| `200` | Success | Process response |
| `4XX` | Malformed request (client error) | Fix the request |
| `403` | WAF violation (security block) | Check request content |
| `409` | Cancel-replace partially succeeded | Check order status |
| `418` | IP banned | Stop requests, wait for ban to expire |
| `429` | Rate limit exceeded | Back off and retry |
| `5XX` | Server error | DO NOT assume failure; check order status |

### Critical: Handling 5XX Errors

When you receive a 5XX error, the execution status is **UNKNOWN**. The order may have succeeded!

```typescript
async function handle5xxError(error: any, orderParams: any) {
  // DO NOT assume failure
  // Wait a moment and check order status
  await sleep(1000);
  const orderStatus = await checkOrderStatus(orderParams.symbol, orderParams.clientOrderId);
  return orderStatus;
}
```

## General Server Errors (10xx)

### -1000 UNKNOWN
```
An unknown error occurred while processing the request.
```
**Action**: Retry with exponential backoff. If persistent, contact support.

### -1001 DISCONNECTED
```
Internal error; unable to process your request. Please try again.
```
**Action**: Retry the request. Check connectivity.

### -1002 UNAUTHORIZED
```
You are not authorized to execute this request.
```
**Action**: Verify API key permissions. Check if API key has required permissions (TRADE, USER_DATA, etc.)

### -1003 TOO_MANY_REQUESTS
```
Too many requests queued.
Too much request weight used; current limit is %s request weight per %s.
Way too much request weight used; IP banned until %s.
```
**Action**:
- Check `Retry-After` header for wait time
- Implement request weight tracking
- Use WebSocket streams instead of polling

```typescript
// Track weight from response headers
function trackWeight(response: Response) {
  const weight = response.headers.get('X-MBX-USED-WEIGHT-1M');
  if (parseInt(weight || '0') > 1000) {
    console.warn(`High API weight usage: ${weight}/1200`);
  }
}
```

### -1006 UNEXPECTED_RESP
```
An unexpected response was received from the message bus. Execution status unknown.
```
**Action**: Check order status via API or User Data Stream before retrying.

### -1007 TIMEOUT
```
Timeout waiting for response from backend server. Send status unknown; execution status unknown.
```
**Action**: This is critical - the order may have succeeded! Always check order status.

```typescript
async function handleTimeout(orderParams: any, client: BinanceClient) {
  // Wait briefly
  await sleep(2000);

  // Check if order exists
  try {
    const orders = await client.openOrders({ symbol: orderParams.symbol });
    const myOrder = orders.find(o => o.clientOrderId === orderParams.newClientOrderId);
    return myOrder || { status: 'UNKNOWN' };
  } catch {
    // If we can't check, log for manual review
    logUnknownStatus(orderParams);
    return { status: 'UNKNOWN' };
  }
}
```

### -1008 SERVER_BUSY
```
Server is currently overloaded with other requests. Please try again in a few minutes.
```
**Action**: Wait and retry with exponential backoff.

### -1013 INVALID_MESSAGE
```
The request is rejected by the API. (i.e. The request didn't reach the Matching Engine.)
```
**Action**: Check for filter failures or invalid order parameters.

### -1015 TOO_MANY_ORDERS
```
Too many new orders.
Too many new orders; current limit is %s orders per %s.
```
**Action**: Reduce order frequency. Check `X-MBX-ORDER-COUNT-*` headers.

### -1020 UNSUPPORTED_OPERATION
```
This operation is not supported.
```
**Action**: Check API documentation for supported operations.

### -1021 INVALID_TIMESTAMP
```
Timestamp for this request is outside of the recvWindow.
Timestamp for this request was 1000ms ahead of the server's time.
```
**Action**: Sync your clock with server time.

```typescript
async function syncClock() {
  const localTime = Date.now();
  const response = await fetch('https://api.binance.com/api/v3/time');
  const { serverTime } = await response.json();
  const offset = serverTime - localTime;
  return offset; // Add this offset to all timestamps
}
```

### -1022 INVALID_SIGNATURE
```
Signature for this request is not valid.
```
**Action**:
- Verify secret key is correct
- Check signature encoding
- For RSA/Ed25519: verify case sensitivity
- Ensure parameters are properly encoded

## Request Issues (11xx)

### -1100 ILLEGAL_CHARS
```
Illegal characters found in a parameter.
Illegal characters found in parameter '%s'; legal range is '%s'.
```
**Action**: Sanitize input parameters.

### -1101 TOO_MANY_PARAMETERS
```
Too many parameters sent for this endpoint.
Too many parameters; expected '%s' and received '%s'.
```
**Action**: Remove unnecessary parameters.

### -1102 MANDATORY_PARAM_EMPTY_OR_MALFORMED
```
A mandatory parameter was not sent, was empty/null, or malformed.
Mandatory parameter '%s' was not sent, was empty/null, or malformed.
```
**Action**: Check all required parameters for the endpoint.

### -1111 BAD_PRECISION
```
Parameter '%s' has too much precision.
```
**Action**: Round to symbol's tick size or step size.

```typescript
function roundToTickSize(price: number, tickSize: number): string {
  const precision = Math.ceil(-Math.log10(tickSize));
  return price.toFixed(precision);
}

// Example: tickSize = 0.01, price = 123.456 -> "123.46"
```

### -1120 BAD_INTERVAL
```
Invalid interval.
```
**Action**: Use valid kline intervals: `1s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M`

### -1121 BAD_SYMBOL
```
Invalid symbol.
```
**Action**: Check symbol exists and is spelled correctly. Use uppercase.

### -1125 INVALID_LISTEN_KEY
```
This listenKey does not exist.
```
**Action**: Create new listen key or renew existing one.

### -1022 INVALID_SIGNATURE
```
Signature for this request is not valid.
```

## Order Errors (20xx)

### -2010 NEW_ORDER_REJECTED
Order rejected by matching engine. See [Matching Engine Errors](#matching-engine-errors).

### -2011 CANCEL_REJECTED
```
CANCEL_REJECTED
```
**Action**: Check order ID is valid and order is still open.

### -2013 NO_SUCH_ORDER
```
Order does not exist.
```
**Action**: Verify order ID and symbol.

### -2014 BAD_API_KEY_FMT
```
API-key format invalid.
```
**Action**: Check API key format in header.

### -2015 REJECTED_MBX_KEY
```
Invalid API-key, IP, or permissions for action.
```
**Action**:
- Verify API key is valid
- Check IP whitelist
- Verify API key has required permissions

### -2026 ORDER_ARCHIVED
```
Order was canceled or expired with no executed qty over 90 days ago and has been archived.
```
**Action**: Historical order, no action needed.

### Cancel-Replace Errors

### -2021 Order cancel-replace partially failed
Either cancellation failed or new order placement failed (but not both).

### -2022 Order cancel-replace failed
Both cancellation and new order placement failed.

## Filter Failures

Filter failures occur when order parameters violate symbol filters.

### PRICE_FILTER
```
Filter failure: PRICE_FILTER
```
**Cause**: Price too high, too low, or doesn't follow tick size.
**Action**: Check symbol's price filter.

```typescript
interface PriceFilter {
  minPrice: string;
  maxPrice: string;
  tickSize: string;
}

function validatePrice(price: number, filter: PriceFilter): boolean {
  const p = parseFloat(price.toFixed(8));
  const min = parseFloat(filter.minPrice);
  const max = parseFloat(filter.maxPrice);
  const tick = parseFloat(filter.tickSize);

  if (p < min || p > max) return false;
  if ((p - min) % tick !== 0) return false;
  return true;
}
```

### LOT_SIZE
```
Filter failure: LOT_SIZE
```
**Cause**: Quantity too high, too low, or doesn't follow step size.
**Action**: Check symbol's lot size filter.

```typescript
interface LotSizeFilter {
  minQty: string;
  maxQty: string;
  stepSize: string;
}
```

### MIN_NOTIONAL / NOTIONAL
```
Filter failure: MIN_NOTIONAL
Filter failure: NOTIONAL
```
**Cause**: Order value (price × quantity) below minimum.
**Action**: Increase order size.

### MARKET_LOT_SIZE
```
Filter failure: MARKET_LOT_SIZE
```
**Cause**: Market order quantity violates market lot size filter.

### MAX_NUM_ORDERS
```
Filter failure: MAX_NUM_ORDERS
```
**Cause**: Too many open orders on symbol.
**Action**: Cancel existing orders before placing new ones.

### MAX_NUM_ALGO_ORDERS
```
Filter failure: MAX_NUM_ALGO_ORDERS
```
**Cause**: Too many stop-loss/take-profit orders on symbol.

### MAX_POSITION
```
Filter failure: MAX_POSITION
```
**Cause**: Position would exceed maximum allowed.

### TRAILING_DELTA
```
Filter failure: TRAILING_DELTA
```
**Cause**: Invalid trailing delta for trailing stop orders.

## Matching Engine Errors

These errors are returned with code -1010, -2010, -2011, or -2038:

| Error Message | Description | Action |
|--------------|-------------|--------|
| Unknown order sent | Order not found | Check order ID |
| Duplicate order sent | Client order ID already used | Use unique client order ID |
| Market is closed | Symbol not trading | Wait for market open |
| Account has insufficient balance | Not enough funds | Check balance |
| Market orders are not supported | MARKET not enabled | Use limit order |
| Iceberg orders are not supported | icebergQty not enabled | Remove icebergQty |
| Stop loss orders are not supported | STOP_LOSS not enabled | Check symbol capabilities |
| Order would trigger immediately | Stop price invalid | Adjust stop price |
| Order would immediately match and take | LIMIT_MAKER would execute | Adjust limit maker price |
| This action is disabled on this account | Account restricted | Contact support |
| Unsupported order combination | Invalid order type/timeInForce combo | Check documentation |
| The relationship of the prices for the orders is not correct | OCO price constraints violated | Fix OCO prices |
| Order book liquidity is too low | Not enough liquidity | Wait for liquidity |
| Rest API trading is not enabled | API trading disabled | Enable in account settings |

## Error Handling Best Practices

### 1. Structured Error Handling

```typescript
interface BinanceError {
  code: number;
  msg: string;
  httpStatus: number;
  timestamp: number;
  request?: any;
}

class BinanceErrorHandler {
  private errors: BinanceError[] = [];

  async handle(error: any, request?: any): Promise<void> {
    const binanceError: BinanceError = {
      code: error.code || -1000,
      msg: error.msg || error.message,
      httpStatus: error.status || 500,
      timestamp: Date.now(),
      request
    };

    // Log error
    this.logError(binanceError);

    // Store for analysis
    await this.storeError(binanceError);

    // Notify if critical
    if (this.isCritical(binanceError)) {
      await this.notify(binanceError);
    }
  }

  private isCritical(error: BinanceError): boolean {
    // Critical errors that need immediate attention
    const criticalCodes = [-1002, -1022, -2015];
    return criticalCodes.includes(error.code);
  }

  private async logError(error: BinanceError): Promise<void> {
    console.error({
      level: 'ERROR',
      code: error.code,
      msg: error.msg,
      timestamp: new Date(error.timestamp).toISOString(),
      request: error.request
    });
  }

  private async storeError(error: BinanceError): Promise<void> {
    // Store in database for analysis
    this.errors.push(error);
    // Could also write to file or send to logging service
  }
}
```

### 2. Retry Strategy

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry client errors (4XX except 429)
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }

  throw lastError;
}
```

### 3. Rate Limit Handling

```typescript
class RateLimitHandler {
  private weightUsed: number = 0;
  private lastRequestTime: number = 0;

  async waitForRateLimit(weight: number = 1): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Reset weight counter every minute
    if (timeSinceLastRequest > 60000) {
      this.weightUsed = 0;
    }

    // Check if we need to wait
    if (this.weightUsed + weight > 1200) {
      const waitTime = 60000 - timeSinceLastRequest;
      await sleep(waitTime);
      this.weightUsed = 0;
    }

    this.weightUsed += weight;
    this.lastRequestTime = now;
  }
}
```

### 4. Store All Responses

```typescript
interface ApiResponseLog {
  timestamp: number;
  endpoint: string;
  method: string;
  params: any;
  response: any;
  statusCode: number;
  duration: number;
  headers: Record<string, string>;
}

async function logResponse(
  endpoint: string,
  method: string,
  params: any,
  response: Response,
  duration: number
): Promise<void> {
  const log: ApiResponseLog = {
    timestamp: Date.now(),
    endpoint,
    method,
    params,
    response: await response.clone().json().catch(() => null),
    statusCode: response.status,
    duration,
    headers: Object.fromEntries(response.headers.entries())
  };

  // Write to file or database
  await writeFile(`logs/api_${Date.now()}.json`, JSON.stringify(log, null, 2));
}
```
