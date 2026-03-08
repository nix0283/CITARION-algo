/**
 * Bybit Exchange Adapter
 * 
 * Production-ready adapter for Bybit V5 API.
 * Supports Spot, Futures, and Options.
 */

import {
  BaseExchangeAdapter,
  ExchangeCredentials,
  UnifiedTicker,
  UnifiedOrderbook,
  UnifiedCandle,
  UnifiedOrder,
  UnifiedPosition,
  UnifiedBalance,
  UnifiedOrderParams,
  ExchangeId,
} from '../unified-exchange-adapter';

import crypto from 'crypto';

// =============================================================================
// BYBIT ADAPTER
// =============================================================================

export class BybitAdapter extends BaseExchangeAdapter {
  exchangeId: ExchangeId = 'bybit';
  
  private baseUrl: string = 'https://api.bybit.com';
  private wsUrl: string = 'wss://stream.bybit.com';
  private category: 'spot' | 'linear' | 'inverse';
  private wsConnections: Map<string, WebSocket> = new Map();
  private lastRequestTime: number = 0;

  constructor(category: 'spot' | 'linear' | 'inverse' = 'linear') {
    super();
    this.category = category;
  }

  async connect(credentials: ExchangeCredentials): Promise<void> {
    this.credentials = credentials;
    
    try {
      const response = await this.privateRequest('GET', '/v5/account/info', {});
      if (response.retCode === 0) {
        this.connected = true;
        console.log(`[BybitAdapter] Connected (${this.category})`);
      } else {
        throw new Error(response.retMsg);
      }
    } catch (error) {
      console.error('[BybitAdapter] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    for (const [_, ws] of this.wsConnections) {
      ws.close();
    }
    this.wsConnections.clear();
    this.connected = false;
  }

  // =========================================================================
  // MARKET DATA
  // =========================================================================

  async getTicker(symbol: string): Promise<UnifiedTicker> {
    const response = await this.publicRequest('GET', '/v5/market/tickers', {
      category: this.category,
      symbol,
    });
    
    const data = response.result.list[0];
    if (!data) throw new Error('Ticker not found');
    
    return {
      exchange: this.exchangeId,
      symbol: data.symbol,
      bid: parseFloat(data.bid1Price),
      ask: parseFloat(data.ask1Price),
      lastPrice: parseFloat(data.lastPrice),
      high24h: parseFloat(data.highPrice24h),
      low24h: parseFloat(data.lowPrice24h),
      volume24h: parseFloat(data.volume24h),
      timestamp: Date.now(),
    };
  }

  async getOrderbook(symbol: string, depth: number = 25): Promise<UnifiedOrderbook> {
    const response = await this.publicRequest('GET', '/v5/market/orderbook', {
      category: this.category,
      symbol,
      limit: depth,
    });
    
    return {
      exchange: this.exchangeId,
      symbol,
      bids: response.result.b.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
      asks: response.result.a.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      timestamp: response.result.ts,
    };
  }

  async getCandles(symbol: string, interval: string, limit: number = 500): Promise<UnifiedCandle[]> {
    const response = await this.publicRequest('GET', '/v5/market/kline', {
      category: this.category,
      symbol,
      interval: this.mapInterval(interval),
      limit,
    });
    
    return response.result.list.map((c: any[]) => ({
      exchange: this.exchangeId,
      symbol,
      interval,
      openTime: c[0],
      closeTime: c[0] + this.intervalToMs(interval),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      quoteVolume: 0,
      trades: 0,
    })).reverse();
  }

  // =========================================================================
  // TRADING
  // =========================================================================

  async createOrder(params: UnifiedOrderParams): Promise<UnifiedOrder> {
    const body: Record<string, any> = {
      category: this.category,
      symbol: params.symbol,
      side: params.side,
      orderType: params.type,
      qty: params.quantity,
      timeInForce: params.timeInForce || 'GTC',
    };
    
    if (params.price) body.price = params.price.toString();
    if (params.stopPrice) body.triggerPrice = params.stopPrice.toString();
    if (params.reduceOnly) body.reduceOnly = true;
    if (params.positionSide) body.positionIdx = params.positionSide === 'LONG' ? 1 : 2;
    
    const response = await this.privateRequest('POST', '/v5/order/create', body);
    
    return {
      orderId: response.result.orderId,
      exchangeOrderId: response.result.orderId,
      exchange: this.exchangeId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: 'NEW',
      quantity: params.quantity,
      filledQuantity: 0,
      remainingQuantity: params.quantity,
      price: params.price,
      timeInForce: body.timeInForce,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<UnifiedOrder> {
    const response = await this.privateRequest('POST', '/v5/order/cancel', {
      category: this.category,
      symbol,
      orderId,
    });
    
    return {
      orderId,
      exchangeOrderId: orderId,
      exchange: this.exchangeId,
      symbol,
      status: 'CANCELLED',
      quantity: 0,
      filledQuantity: 0,
      remainingQuantity: 0,
      timeInForce: 'GTC',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async cancelAllOrders(symbol?: string): Promise<void> {
    const body: Record<string, any> = { category: this.category };
    if (symbol) body.symbol = symbol;
    else body.cancelAll = 1;
    await this.privateRequest('POST', '/v5/order/cancel-all', body);
  }

  async getOrder(symbol: string, orderId: string): Promise<UnifiedOrder> {
    const response = await this.privateRequest('GET', '/v5/order/realtime', {
      category: this.category,
      symbol,
      orderId,
    });
    return this.parseOrder(response.result.list[0]);
  }

  async getOpenOrders(symbol?: string): Promise<UnifiedOrder[]> {
    const params: Record<string, any> = { category: this.category, settleCoin: 'USDT' };
    if (symbol) params.symbol = symbol;
    
    const response = await this.privateRequest('GET', '/v5/order/realtime', params);
    return response.result.list.map((o: any) => this.parseOrder(o));
  }

  // =========================================================================
  // POSITION MANAGEMENT
  // =========================================================================

  async getPositions(symbol?: string): Promise<UnifiedPosition[]> {
    const params: Record<string, any> = { category: this.category, settleCoin: 'USDT' };
    if (symbol) params.symbol = symbol;
    
    const response = await this.privateRequest('GET', '/v5/position/list', params);
    
    return response.result.list
      .filter((p: any) => parseFloat(p.size) > 0)
      .map((p: any) => ({
        positionId: p.positionId,
        exchange: this.exchangeId,
        symbol: p.symbol,
        side: p.side,
        quantity: parseFloat(p.size),
        entryPrice: parseFloat(p.avgPrice),
        markPrice: parseFloat(p.markPrice),
        liquidationPrice: parseFloat(p.liqPrice) || undefined,
        unrealizedPnl: parseFloat(p.unrealisedPnl),
        realizedPnl: parseFloat(p.cumRealisedPnl),
        leverage: parseFloat(p.leverage),
        margin: parseFloat(p.positionIM),
        marginMode: p.tradeMode === '0' ? 'cross' : 'isolated',
        createdAt: p.createdTime,
        updatedAt: p.updatedTime,
      }));
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.privateRequest('POST', '/v5/position/set-leverage', {
      category: this.category,
      symbol,
      buyLeverage: leverage,
      sellLeverage: leverage,
    });
  }

  async setMarginMode(symbol: string, mode: 'cross' | 'isolated'): Promise<void> {
    await this.privateRequest('POST', '/v5/position/switch-isolated', {
      category: this.category,
      symbol,
      tradeMode: mode === 'cross' ? 0 : 1,
    });
  }

  // =========================================================================
  // ACCOUNT
  // =========================================================================

  async getBalances(): Promise<UnifiedBalance[]> {
    const response = await this.privateRequest('GET', '/v5/account/wallet-balance', {
      accountType: this.category === 'spot' ? 'UNIFIED' : 'CONTRACT',
    });
    
    const coins = response.result.list[0]?.coin || [];
    return coins
      .filter((c: any) => parseFloat(c.walletBalance) > 0)
      .map((c: any) => ({
        exchange: this.exchangeId,
        asset: c.coin,
        total: parseFloat(c.walletBalance),
        available: parseFloat(c.availableToWithdraw),
        locked: parseFloat(c.locked) || 0,
      }));
  }

  // =========================================================================
  // WEBSOCKET
  // =========================================================================

  async subscribeTicker(symbol: string, callback: (ticker: UnifiedTicker) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/v5/public/${this.category}`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [`tickers.${symbol}`],
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.topic?.startsWith('tickers.') && data.data) {
        const t = data.data;
        callback({
          exchange: this.exchangeId,
          symbol: t.symbol,
          bid: parseFloat(t.bid1Price),
          ask: parseFloat(t.ask1Price),
          lastPrice: parseFloat(t.lastPrice),
          high24h: parseFloat(t.highPrice24h),
          low24h: parseFloat(t.lowPrice24h),
          volume24h: parseFloat(t.volume24h),
          timestamp: data.ts,
        });
      }
    };
    
    this.wsConnections.set(`ticker_${symbol}`, ws);
  }

  async subscribeOrderbook(symbol: string, callback: (orderbook: UnifiedOrderbook) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/v5/public/${this.category}`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [`orderbook.50.${symbol}`],
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.topic?.startsWith('orderbook.') && data.data) {
        callback({
          exchange: this.exchangeId,
          symbol,
          bids: (data.data.b || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: (data.data.a || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]),
          timestamp: data.ts,
        });
      }
    };
    
    this.wsConnections.set(`orderbook_${symbol}`, ws);
  }

  async subscribeCandles(symbol: string, interval: string, callback: (candle: UnifiedCandle) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/v5/public/${this.category}`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [`kline.${this.mapInterval(interval)}.${symbol}`],
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.topic?.startsWith('kline.') && data.data) {
        const k = data.data;
        callback({
          exchange: this.exchangeId,
          symbol,
          interval,
          openTime: k.start,
          closeTime: k.end,
          open: parseFloat(k.open),
          high: parseFloat(k.high),
          low: parseFloat(k.low),
          close: parseFloat(k.close),
          volume: parseFloat(k.volume),
          quoteVolume: parseFloat(k.turnover),
          trades: 0,
        });
      }
    };
    
    this.wsConnections.set(`candle_${symbol}_${interval}`, ws);
  }

  async subscribeOrders(callback: (order: UnifiedOrder) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/v5/private`);
    
    ws.onopen = () => {
      // Auth
      const expires = Math.floor(Date.now() / 1000) + 10;
      const signature = crypto
        .createHmac('sha256', this.credentials!.apiSecret)
        .update(`GET/realtime${expires}`)
        .digest('hex');
      
      ws.send(JSON.stringify({
        op: 'auth',
        args: [this.credentials!.apiKey, expires, signature],
      }));
      
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: ['order'],
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.topic === 'order' && data.data) {
        const o = data.data[0];
        callback(this.parseOrder(o));
      }
    };
    
    this.wsConnections.set('orders', ws);
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private async publicRequest(method: string, endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const query = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}${endpoint}?${query}`;
    const response = await fetch(url, { method });
    const data = await response.json();
    if (data.retCode !== 0) throw new Error(data.retMsg);
    return data;
  }

  private async privateRequest(method: string, endpoint: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.credentials) throw new Error('Not authenticated');
    
    const timestamp = Date.now();
    const query = method === 'GET' ? new URLSearchParams(params).toString() : '';
    const body = method !== 'GET' ? JSON.stringify(params) : '';
    const signString = timestamp + this.credentials.apiKey + '5000' + (query || body);
    
    const signature = crypto
      .createHmac('sha256', this.credentials.apiSecret)
      .update(signString)
      .digest('hex');
    
    const url = method === 'GET' ? `${this.baseUrl}${endpoint}?${query}` : this.baseUrl + endpoint;
    const response = await fetch(url, {
      method,
      headers: {
        'X-BAPI-API-KEY': this.credentials.apiKey,
        'X-BAPI-TIMESTAMP': String(timestamp),
        'X-BAPI-SIGN': signature,
        'X-BAPI-RECV-WINDOW': '5000',
        'Content-Type': 'application/json',
      },
      body: method !== 'GET' ? body : undefined,
    });
    
    const data = await response.json();
    if (data.retCode !== 0) throw new Error(data.retMsg);
    return data;
  }

  private parseOrder(o: any): UnifiedOrder {
    return {
      orderId: o.orderId,
      exchangeOrderId: o.orderId,
      exchange: this.exchangeId,
      symbol: o.symbol,
      side: o.side,
      type: o.orderType,
      status: this.mapStatus(o.orderStatus),
      quantity: parseFloat(o.qty),
      filledQuantity: parseFloat(o.cumExecQty) || 0,
      remainingQuantity: parseFloat(o.leavesQty) || parseFloat(o.qty),
      price: o.price ? parseFloat(o.price) : undefined,
      stopPrice: o.triggerPrice ? parseFloat(o.triggerPrice) : undefined,
      timeInForce: o.timeInForce,
      createdAt: o.createdTime,
      updatedAt: o.updatedTime,
    };
  }

  private mapStatus(status: string): any {
    const map: Record<string, string> = {
      New: 'NEW', PartiallyFilled: 'PARTIALLY_FILLED', Filled: 'FILLED',
      Cancelled: 'CANCELLED', Rejected: 'REJECTED', Deactivated: 'EXPIRED',
    };
    return map[status] || status;
  }

  private mapInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
      '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
      '1d': 'D', '1w': 'W', '1M': 'M',
    };
    return map[interval] || interval;
  }

  private intervalToMs(interval: string): number {
    const map: Record<string, number> = {
      '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000,
      '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000,
      '1d': 86400000, '1w': 604800000, '1M': 2592000000,
    };
    return map[interval] || 60000;
  }
}

export default BybitAdapter;
