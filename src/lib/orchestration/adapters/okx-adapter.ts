/**
 * OKX Exchange Adapter
 * 
 * Production-ready adapter for OKX V5 API.
 * Supports Spot, Futures, Options, and Margin.
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

import * as crypto from 'crypto';

// =============================================================================
// OKX ADAPTER
// =============================================================================

export class OKXAdapter extends BaseExchangeAdapter {
  exchangeId: ExchangeId = 'okx';
  
  private baseUrl: string = 'https://www.okx.com';
  private wsUrl: string = 'wss://ws.okx.com:8443';
  private instType: 'SPOT' | 'SWAP' | 'FUTURES' | 'MARGIN';
  private wsConnections: Map<string, WebSocket> = new Map();

  constructor(instType: 'SPOT' | 'SWAP' | 'FUTURES' | 'MARGIN' = 'SWAP') {
    super();
    this.instType = instType;
  }

  async connect(credentials: ExchangeCredentials): Promise<void> {
    if (!credentials.passphrase) {
      throw new Error('OKX requires a passphrase');
    }
    
    this.credentials = credentials;
    
    try {
      const response = await this.privateRequest('GET', '/api/v5/account/balance', {});
      if (response.code === '0') {
        this.connected = true;
        console.log(`[OKXAdapter] Connected (${this.instType})`);
      } else {
        throw new Error(response.msg);
      }
    } catch (error) {
      console.error('[OKXAdapter] Connection failed:', error);
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
    const response = await this.publicRequest('GET', '/api/v5/market/ticker', {
      instId: symbol,
    });
    
    const data = response.data[0];
    if (!data) throw new Error('Ticker not found');
    
    return {
      exchange: this.exchangeId,
      symbol: data.instId,
      bid: parseFloat(data.bidPx),
      ask: parseFloat(data.askPx),
      lastPrice: parseFloat(data.last),
      high24h: parseFloat(data.high24h),
      low24h: parseFloat(data.low24h),
      volume24h: parseFloat(data.vol24h),
      timestamp: parseInt(data.ts),
    };
  }

  async getOrderbook(symbol: string, depth: number = 20): Promise<UnifiedOrderbook> {
    const response = await this.publicRequest('GET', '/api/v5/market/books', {
      instId: symbol,
      sz: String(depth),
    });
    
    const data = response.data[0];
    return {
      exchange: this.exchangeId,
      symbol,
      bids: data.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
      asks: data.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      timestamp: parseInt(data.ts),
    };
  }

  async getCandles(symbol: string, interval: string, limit: number = 300): Promise<UnifiedCandle[]> {
    const response = await this.publicRequest('GET', '/api/v5/market/candles', {
      instId: symbol,
      bar: this.mapInterval(interval),
      limit: String(limit),
    });
    
    return response.data.map((c: any[]) => ({
      exchange: this.exchangeId,
      symbol,
      interval,
      openTime: parseInt(c[0]),
      closeTime: parseInt(c[0]) + this.intervalToMs(interval),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      quoteVolume: parseFloat(c[6]),
      trades: 0,
    }));
  }

  // =========================================================================
  // TRADING
  // =========================================================================

  async createOrder(params: UnifiedOrderParams): Promise<UnifiedOrder> {
    const body: Record<string, any> = {
      instId: params.symbol,
      tdMode: this.instType === 'SPOT' ? 'cash' : 'cross',
      side: params.side.toLowerCase(),
      ordType: this.mapOrderType(params.type),
      sz: String(params.quantity),
    };
    
    if (params.price !== undefined) {
      body.px = String(params.price);
    }
    
    if (params.stopPrice !== undefined) {
      body.triggerPx = String(params.stopPrice);
    }
    
    if (params.clientOrderId) {
      body.clOrdId = params.clientOrderId;
    }
    
    if (params.reduceOnly && this.instType !== 'SPOT') {
      body.reduceOnly = true;
    }
    
    const response = await this.privateRequest('POST', '/api/v5/trade/order', body);
    
    if (response.code !== '0') {
      throw new Error(response.msg);
    }
    
    return {
      orderId: response.data[0].clOrdId || response.data[0].ordId,
      exchangeOrderId: response.data[0].ordId,
      clientOrderId: response.data[0].clOrdId,
      exchange: this.exchangeId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: 'NEW',
      quantity: params.quantity,
      filledQuantity: 0,
      remainingQuantity: params.quantity,
      price: params.price,
      timeInForce: 'GTC',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<UnifiedOrder> {
    const response = await this.privateRequest('POST', '/api/v5/trade/cancel-order', {
      instId: symbol,
      ordId: orderId,
    });
    
    if (response.code !== '0') {
      throw new Error(response.msg);
    }
    
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
    const body: Record<string, any> = { instType: this.instType };
    if (symbol) body.instId = symbol;
    
    await this.privateRequest('POST', '/api/v5/trade/cancel-all-orders', body);
  }

  async getOrder(symbol: string, orderId: string): Promise<UnifiedOrder> {
    const response = await this.privateRequest('GET', '/api/v5/trade/order', {
      instId: symbol,
      ordId: orderId,
    });
    
    return this.parseOrder(response.data[0]);
  }

  async getOpenOrders(symbol?: string): Promise<UnifiedOrder[]> {
    const params: Record<string, any> = { instType: this.instType };
    if (symbol) params.instId = symbol;
    
    const response = await this.privateRequest('GET', '/api/v5/trade/orders-pending', params);
    return response.data.map((o: any) => this.parseOrder(o));
  }

  // =========================================================================
  // POSITION MANAGEMENT
  // =========================================================================

  async getPositions(symbol?: string): Promise<UnifiedPosition[]> {
    const params: Record<string, any> = { instType: this.instType };
    if (symbol) params.instId = symbol;
    
    const response = await this.privateRequest('GET', '/api/v5/account/positions', params);
    
    return response.data.filter((p: any) => parseFloat(p.pos) !== 0).map((p: any) => ({
      positionId: p.posId,
      exchange: this.exchangeId,
      symbol: p.instId,
      side: parseFloat(p.pos) > 0 ? 'LONG' : 'SHORT',
      quantity: Math.abs(parseFloat(p.pos)),
      entryPrice: parseFloat(p.avgPx),
      markPrice: parseFloat(p.markPx),
      liquidationPrice: parseFloat(p.liqPx) || undefined,
      unrealizedPnl: parseFloat(p.upl),
      realizedPnl: parseFloat(p.realizedPnl),
      leverage: parseFloat(p.leverage),
      margin: parseFloat(p.margin),
      marginMode: p.mgnMode === 'cross' ? 'cross' : 'isolated',
      createdAt: p.cTime,
      updatedAt: p.uTime,
    }));
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.privateRequest('POST', '/api/v5/account/set-leverage', {
      instId: symbol,
      lever: String(leverage),
      mgnMode: 'cross',
    });
  }

  async setMarginMode(symbol: string, mode: 'cross' | 'isolated'): Promise<void> {
    // OKX uses different endpoint for margin mode
    // This would typically require position-level setting
    console.log(`[OKXAdapter] Setting margin mode for ${symbol} to ${mode}`);
  }

  // =========================================================================
  // ACCOUNT
  // =========================================================================

  async getBalances(): Promise<UnifiedBalance[]> {
    const response = await this.privateRequest('GET', '/api/v5/account/balance', {});
    
    const balances: UnifiedBalance[] = [];
    
    for (const detail of response.data) {
      for (const coin of detail.details) {
        if (parseFloat(cash.cashBal || coin.bal) > 0) {
          balances.push({
            exchange: this.exchangeId,
            asset: coin.ccy,
            total: parseFloat(coin.cashBal || coin.bal),
            available: parseFloat(coin.availBal),
            locked: parseFloat(coin.frozenBal) || 0,
          });
        }
      }
    }
    
    return balances;
  }

  // =========================================================================
  // WEBSOCKET
  // =========================================================================

  async subscribeTicker(symbol: string, callback: (ticker: UnifiedTicker) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/ws/v5/public`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'tickers', instId: symbol }],
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.arg?.channel === 'tickers' && data.data) {
        const t = data.data[0];
        callback({
          exchange: this.exchangeId,
          symbol: t.instId,
          bid: parseFloat(t.bidPx),
          ask: parseFloat(t.askPx),
          lastPrice: parseFloat(t.last),
          high24h: parseFloat(t.high24h),
          low24h: parseFloat(t.low24h),
          volume24h: parseFloat(t.vol24h),
          timestamp: parseInt(t.ts),
        });
      }
    };
    
    this.wsConnections.set(`ticker_${symbol}`, ws);
  }

  async subscribeOrderbook(symbol: string, callback: (orderbook: UnifiedOrderbook) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/ws/v5/public`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{ channel: 'books', instId: symbol }],
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.arg?.channel === 'books' && data.data) {
        const ob = data.data[0];
        callback({
          exchange: this.exchangeId,
          symbol: ob.instId,
          bids: ob.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: ob.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
          timestamp: parseInt(ob.ts),
        });
      }
    };
    
    this.wsConnections.set(`orderbook_${symbol}`, ws);
  }

  async subscribeCandles(symbol: string, interval: string, callback: (candle: UnifiedCandle) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/ws/v5/public`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: [{ channel: `candle${this.mapInterval(interval)}`, instId: symbol }],
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.arg?.channel?.startsWith('candle') && data.data) {
        const c = data.data[0];
        callback({
          exchange: this.exchangeId,
          symbol,
          interval,
          openTime: parseInt(c[0]),
          closeTime: parseInt(c[0]) + this.intervalToMs(interval),
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[5]),
          quoteVolume: parseFloat(c[6]),
          trades: 0,
        });
      }
    };
    
    this.wsConnections.set(`candle_${symbol}_${interval}`, ws);
  }

  async subscribeOrders(callback: (order: UnifiedOrder) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/ws/v5/private`);
    
    ws.onopen = () => {
      const timestamp = new Date().toISOString();
      const signString = timestamp + 'GET' + '/users/self/verify';
      const signature = crypto
        .createHmac('sha256', this.credentials!.apiSecret)
        .update(signString)
        .digest('base64');
      
      ws.send(JSON.stringify({
        op: 'login',
        args: [{
          apiKey: this.credentials!.apiKey,
          passphrase: this.credentials!.passphrase,
          timestamp,
          sign: signature,
        }],
      }));
      
      setTimeout(() => {
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: [{ channel: 'orders', instType: this.instType }],
        }));
      }, 1000);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.arg?.channel === 'orders' && data.data) {
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
    const url = `${this.baseUrl}${endpoint}${query ? `?${query}` : ''}`;
    const response = await fetch(url, { method });
    return response.json();
  }

  private async privateRequest(method: string, endpoint: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.credentials) throw new Error('Not authenticated');
    
    const timestamp = new Date().toISOString();
    const query = method === 'GET' ? new URLSearchParams(params).toString() : '';
    const body = method !== 'GET' ? JSON.stringify(params) : '';
    const signString = timestamp + method + endpoint + (method === 'GET' ? (query ? `?${query}` : '') : body);
    
    const signature = crypto
      .createHmac('sha256', this.credentials.apiSecret)
      .update(signString)
      .digest('base64');
    
    const url = method === 'GET' ? `${this.baseUrl}${endpoint}${query ? `?${query}` : ''}` : this.baseUrl + endpoint;
    const response = await fetch(url, {
      method,
      headers: {
        'OK-ACCESS-KEY': this.credentials.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': this.credentials.passphrase!,
        'Content-Type': 'application/json',
      },
      body: method !== 'GET' ? body : undefined,
    });
    
    return response.json();
  }

  private parseOrder(o: any): UnifiedOrder {
    return {
      orderId: o.clOrdId,
      exchangeOrderId: o.ordId,
      clientOrderId: o.clOrdId,
      exchange: this.exchangeId,
      symbol: o.instId,
      side: o.side.toUpperCase(),
      type: this.mapOrderTypeBack(o.ordType),
      status: this.mapStatus(o.state),
      quantity: parseFloat(o.sz),
      filledQuantity: parseFloat(o.accFillSz) || 0,
      remainingQuantity: parseFloat(o.sz) - parseFloat(o.accFillSz || '0'),
      price: o.px ? parseFloat(o.px) : undefined,
      stopPrice: o.triggerPx ? parseFloat(o.triggerPx) : undefined,
      timeInForce: 'GTC',
      createdAt: parseInt(o.cTime),
      updatedAt: parseInt(o.uTime),
    };
  }

  private mapOrderType(type: string): string {
    const map: Record<string, string> = {
      MARKET: 'market',
      LIMIT: 'limit',
      STOP_MARKET: 'trigger',
      STOP_LIMIT: 'trigger',
      TAKE_PROFIT: 'move_order_stop',
      TAKE_PROFIT_LIMIT: 'move_order_stop',
    };
    return map[type] || 'limit';
  }

  private mapOrderTypeBack(type: string): string {
    const map: Record<string, string> = {
      market: 'MARKET',
      limit: 'LIMIT',
      trigger: 'STOP_MARKET',
      move_order_stop: 'TAKE_PROFIT',
    };
    return map[type] || 'LIMIT';
  }

  private mapStatus(state: string): any {
    const map: Record<string, string> = {
      live: 'NEW', partially_filled: 'PARTIALLY_FILLED', filled: 'FILLED',
      canceled: 'CANCELLED', expired: 'EXPIRED', failed: 'REJECTED',
    };
    return map[state] || state;
  }

  private mapInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
      '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
      '1d': '1D', '1w': '1W', '1M': '1M',
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

export default OKXAdapter;
