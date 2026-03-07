# Binance Trading Guide

Comprehensive guide for trading operations on Binance Spot API.

## Table of Contents

1. [Order Types](#order-types)
2. [Placing Orders](#placing-orders)
3. [Managing Orders](#managing-orders)
4. [Order Lists (OCO)](#order-lists-oco)
5. [Account Information](#account-information)
6. [Trade History](#trade-history)
7. [Implementation Examples](#implementation-examples)

## Order Types

### Basic Order Types

| Type | Description | Required Parameters |
|------|-------------|---------------------|
| `LIMIT` | Limit order | price, quantity, timeInForce |
| `MARKET` | Market order | quantity OR quoteOrderQty |
| `STOP_LOSS` | Stop loss market | quantity, stopPrice |
| `STOP_LOSS_LIMIT` | Stop loss limit | price, quantity, stopPrice, timeInForce |
| `TAKE_PROFIT` | Take profit market | quantity, stopPrice |
| `TAKE_PROFIT_LIMIT` | Take profit limit | price, quantity, stopPrice, timeInForce |
| `LIMIT_MAKER` | Limit order (maker only) | price, quantity |

### Time in Force

| Value | Description |
|-------|-------------|
| `GTC` | Good Till Cancel - order remains until cancelled |
| `IOC` | Immediate or Cancel - fill immediately or cancel |
| `FOK` | Fill or Kill - fill entire order or cancel |

### Order Side

| Value | Description |
|-------|-------------|
| `BUY` | Buy order |
| `SELL` | Sell order |

## Placing Orders

### New Order Endpoint

```
POST /api/v3/order
```

**Weight**: 1

**Required Parameters**:
- `symbol` - Trading pair symbol (e.g., BTCUSDT)
- `side` - BUY or SELL
- `type` - Order type
- `timestamp` - Request timestamp

### Limit Order

```typescript
// Basic limit order
const limitOrder = await client.newOrder('BTCUSDT', 'BUY', 'LIMIT', {
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '50000'
});

// Response
{
  "symbol": "BTCUSDT",
  "orderId": 28,
  "orderListId": -1,        // -1 for non-OCO orders
  "clientOrderId": "6gCrw2kRUAF9CvJDGP16IP",
  "transactTime": 1507725176595,
  "price": "50000.00000000",
  "origQty": "0.00100000",
  "executedQty": "0.00000000",
  "cummulativeQuoteQty": "0.00000000",
  "status": "NEW",
  "timeInForce": "GTC",
  "type": "LIMIT",
  "side": "BUY",
  "workingTime": 1507725176595,
  "selfTradePreventionMode": "EXPIRE_MAKER"
}
```

### Market Order

```typescript
// Market order by quantity
const marketOrder = await client.newOrder('BTCUSDT', 'SELL', 'MARKET', {
  quantity: '0.001'
});

// Market order by quote quantity (buy $100 worth)
const marketOrderByQuote = await client.newOrder('BTCUSDT', 'BUY', 'MARKET', {
  quoteOrderQty: '100'
});
```

### Stop Loss Order

```typescript
// Stop loss limit order
const stopLossLimit = await client.newOrder('BTCUSDT', 'SELL', 'STOP_LOSS_LIMIT', {
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '49000',      // Limit price
  stopPrice: '49500'   // Trigger price
});

// Stop loss market order
const stopLossMarket = await client.newOrder('BTCUSDT', 'SELL', 'STOP_LOSS', {
  quantity: '0.001',
  stopPrice: '49500'
});
```

### Take Profit Order

```typescript
const takeProfit = await client.newOrder('BTCUSDT', 'SELL', 'TAKE_PROFIT_LIMIT', {
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '55000',      // Limit price
  stopPrice: '54500'   // Trigger price
});
```

### Limit Maker Order

A limit maker order will be rejected if it would immediately match and trade.

```typescript
const limitMaker = await client.newOrder('BTCUSDT', 'BUY', 'LIMIT_MAKER', {
  quantity: '0.001',
  price: '49000'  // Must be below current price for buy
});
```

### Iceberg Order

```typescript
const icebergOrder = await client.newOrder('BTCUSDT', 'BUY', 'LIMIT', {
  timeInForce: 'GTC',
  quantity: '1.0',      // Total quantity
  price: '50000',
  icebergQty: '0.1'     // Visible quantity
});
```

### Client Order ID

Use custom client order ID for tracking:

```typescript
const order = await client.newOrder('BTCUSDT', 'BUY', 'LIMIT', {
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '50000',
  newClientOrderId: 'my_order_' + Date.now()  // Unique ID
});
```

### Order Response

```typescript
// Response fields
interface OrderResponse {
  symbol: string;              // Trading pair
  orderId: number;             // Exchange order ID
  orderListId: number;         // OCO list ID (-1 if not OCO)
  clientOrderId: string;       // Client order ID
  transactTime: number;        // Transaction timestamp
  price: string;               // Price
  origQty: string;             // Original quantity
  executedQty: string;         // Executed quantity
  cummulativeQuoteQty: string; // Total quote quantity
  status: OrderStatus;         // Order status
  timeInForce: TimeInForce;    // Time in force
  type: OrderType;             // Order type
  side: OrderSide;             // Order side
  workingTime: number;         // Working time
  selfTradePreventionMode: string;
}
```

## Managing Orders

### Order Status Values

| Status | Description |
|--------|-------------|
| `NEW` | Order placed on book |
| `PARTIALLY_FILLED` | Order partially filled |
| `FILLED` | Order fully filled |
| `CANCELED` | Order cancelled |
| `PENDING_CANCEL` | Order pending cancellation |
| `REJECTED` | Order rejected |
| `EXPIRED` | Order expired |

### Query Order

```typescript
// By order ID
const order = await client.getOrder({
  symbol: 'BTCUSDT',
  orderId: 28
});

// By client order ID
const order = await client.getOrder({
  symbol: 'BTCUSDT',
  origClientOrderId: 'my_order_123'
});
```

### Cancel Order

```typescript
// Cancel by order ID
const cancelled = await client.cancelOrder({
  symbol: 'BTCUSDT',
  orderId: 28
});

// Cancel by client order ID
const cancelled = await client.cancelOrder({
  symbol: 'BTCUSDT',
  origClientOrderId: 'my_order_123'
});
```

### Cancel All Orders

```typescript
const cancelled = await client.cancelOpenOrders({
  symbol: 'BTCUSDT'
});
```

### Cancel and Replace

```typescript
// Cancel existing order and place new one atomically
const result = await client.cancelReplaceOrder(
  'BTCUSDT', 'BUY', 'LIMIT',
  {
    cancelOrderId: 28,
    timeInForce: 'GTC',
    quantity: '0.002',
    price: '51000'
  }
);
```

### Query Open Orders

```typescript
// All open orders
const allOpenOrders = await client.openOrders();

// Open orders for symbol
const symbolOpenOrders = await client.openOrders({
  symbol: 'BTCUSDT'
});
```

### Query All Orders

```typescript
const allOrders = await client.allOrders({
  symbol: 'BTCUSDT',
  startTime: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
  limit: 500
});
```

## Order Lists (OCO)

OCO (One-Cancels-the-Other) allows placing two orders simultaneously.

### New OCO Order

```typescript
const ocoOrder = await client.newOCOOrder({
  symbol: 'BTCUSDT',
  side: 'SELL',
  price: '55000',           // Limit maker price
  quantity: '0.001',
  stopPrice: '49000',       // Stop loss trigger
  stopLimitPrice: '48500',  // Stop loss limit price (optional)
  stopLimitTimeInForce: 'GTC',
  listClientOrderId: 'oco_' + Date.now()
});
```

### OCO Response

```typescript
interface OCOResponse {
  orderListId: number;
  contingencyType: 'OCO';
  listStatusType: 'EXEC_STARTED' | 'ALL_DONE';
  listOrderStatus: 'EXECUTING' | 'DONE' | 'REJECTED';
  listClientOrderId: string;
  transactionTime: number;
  symbol: string;
  orders: [
    {
      symbol: string;
      orderId: number;
      clientOrderId: string;
    },
    {
      symbol: string;
      orderId: number;
      clientOrderId: string;
    }
  ];
  orderReports: [OrderResponse, OrderResponse];
}
```

### Cancel OCO

```typescript
const cancelled = await client.cancelOCOOrder({
  symbol: 'BTCUSDT',
  orderListId: 123
});
```

## Account Information

### Account Info

```typescript
const account = await client.account();

interface AccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  commissionRates: {
    maker: string;
    taker: string;
    buyer: string;
    seller: string;
  };
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  brokered: boolean;
  requireSelfTradePrevention: boolean;
  preventSor: boolean;
  updateTime: number;
  accountType: string;
  balances: Balance[];
  permissions: string[];
  uid: number;
}

interface Balance {
  asset: string;
  free: string;
  locked: string;
}
```

### Query Commission Rates

```typescript
const rates = await client.commissionRate('BTCUSDT');
// { makerCommissionRate: "0.001", takerCommissionRate: "0.001" }
```

## Trade History

### Account Trade List

```typescript
const trades = await client.myTrades({
  symbol: 'BTCUSDT',
  startTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
  limit: 500
});

interface Trade {
  symbol: string;
  id: number;
  orderId: number;
  orderListId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  tradeType: number;  // 0 = Spot, 1 = Margin
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
}
```

## Implementation Examples

### Complete Trading Client

```typescript
import crypto from 'crypto';

interface TradingConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
}

interface OrderParams {
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

class BinanceTradingClient {
  private baseUrl: string;

  constructor(private config: TradingConfig) {
    this.baseUrl = config.baseUrl || 'https://api.binance.com';
  }

  async placeOrder(params: OrderParams): Promise<any> {
    const query: Record<string, any> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      timestamp: Date.now()
    };

    if (params.timeInForce) query.timeInForce = params.timeInForce;
    if (params.quantity) query.quantity = params.quantity;
    if (params.quoteOrderQty) query.quoteOrderQty = params.quoteOrderQty;
    if (params.price) query.price = params.price;
    if (params.stopPrice) query.stopPrice = params.stopPrice;
    if (params.icebergQty) query.icebergQty = params.icebergQty;
    if (params.newClientOrderId) query.newClientOrderId = params.newClientOrderId;

    return this.signedRequest('POST', '/api/v3/order', query);
  }

  async cancelOrder(symbol: string, orderId?: number, clientOrderId?: string): Promise<any> {
    const query: Record<string, any> = { symbol, timestamp: Date.now() };
    if (orderId) query.orderId = orderId;
    if (clientOrderId) query.origClientOrderId = clientOrderId;
    return this.signedRequest('DELETE', '/api/v3/order', query);
  }

  async getOpenOrders(symbol?: string): Promise<any[]> {
    const query: Record<string, any> = { timestamp: Date.now() };
    if (symbol) query.symbol = symbol;
    return this.signedRequest('GET', '/api/v3/openOrders', query);
  }

  async getOrder(symbol: string, orderId?: number, clientOrderId?: string): Promise<any> {
    const query: Record<string, any> = { symbol, timestamp: Date.now() };
    if (orderId) query.orderId = orderId;
    if (clientOrderId) query.origClientOrderId = clientOrderId;
    return this.signedRequest('GET', '/api/v3/order', query);
  }

  async getAccount(): Promise<any> {
    return this.signedRequest('GET', '/api/v3/account', { timestamp: Date.now() });
  }

  private async signedRequest(method: string, path: string, params: Record<string, any>): Promise<any> {
    const queryString = Object.keys(params)
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const signature = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(queryString)
      .digest('hex');

    const url = `${this.baseUrl}${path}?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method,
      headers: {
        'X-MBX-APIKEY': this.config.apiKey
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Binance API Error ${error.code}: ${error.msg}`);
    }

    return response.json();
  }
}

// Usage
const client = new BinanceTradingClient({
  apiKey: process.env.BINANCE_API_KEY!,
  apiSecret: process.env.BINANCE_API_SECRET!
});

// Place limit order
const order = await client.placeOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  timeInForce: 'GTC',
  quantity: '0.001',
  price: '50000',
  newClientOrderId: `buy_${Date.now()}`
});
```

### Position Manager

```typescript
class PositionManager {
  private positions: Map<string, Position> = new Map();

  constructor(private client: BinanceTradingClient) {}

  async sync(): Promise<void> {
    const account = await this.client.getAccount();

    for (const balance of account.balances) {
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;

      if (total > 0) {
        this.positions.set(balance.asset, {
          asset: balance.asset,
          free,
          locked,
          total
        });
      }
    }
  }

  get(asset: string): Position | undefined {
    return this.positions.get(asset);
  }

  getAll(): Position[] {
    return Array.from(this.positions.values());
  }

  async getAvailableBalance(asset: string): Promise<number> {
    const account = await this.client.getAccount();
    const balance = account.balances.find(b => b.asset === asset);
    return balance ? parseFloat(balance.free) : 0;
  }
}

interface Position {
  asset: string;
  free: number;
  locked: number;
  total: number;
}
```

### Order Manager

```typescript
class OrderManager {
  private orders: Map<string, Order> = new Map();

  constructor(private client: BinanceTradingClient) {}

  async placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string
  ): Promise<Order> {
    const response = await this.client.placeOrder({
      symbol,
      side,
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity,
      price,
      newClientOrderId: `${symbol}_${side}_${Date.now()}`
    });

    const order = this.parseResponse(response);
    this.orders.set(order.clientOrderId, order);
    return order;
  }

  async cancelOrder(clientOrderId: string, symbol: string): Promise<void> {
    await this.client.cancelOrder(symbol, undefined, clientOrderId);
    this.orders.delete(clientOrderId);
  }

  async syncOpenOrders(symbol?: string): Promise<void> {
    const openOrders = await this.client.getOpenOrders(symbol);

    this.orders.clear();
    for (const order of openOrders) {
      this.orders.set(order.clientOrderId, this.parseResponse(order));
    }
  }

  private parseResponse(response: any): Order {
    return {
      orderId: response.orderId,
      clientOrderId: response.clientOrderId,
      symbol: response.symbol,
      side: response.side,
      type: response.type,
      status: response.status,
      price: parseFloat(response.price),
      quantity: parseFloat(response.origQty),
      executedQty: parseFloat(response.executedQty),
      time: response.transactTime || response.time
    };
  }
}

interface Order {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  price: number;
  quantity: number;
  executedQty: number;
  time: number;
}
```
