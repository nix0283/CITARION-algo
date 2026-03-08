/**
 * Binance Exchange Adapter
 * 
 * Production-ready adapter for Binance Spot and Futures.
 * Implements WebSocket streams and REST API integration.
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
// BINANCE ADAPTER
// =============================================================================

export class BinanceAdapter extends BaseExchangeAdapter {
  exchangeId: ExchangeId = 'binance';
  
  private baseUrl: string;
  private wsUrl: string;
  private marketType: 'spot' | 'futures';
  private wsConnections: Map<string, WebSocket> = new Map();
  private lastRequestTime: number = 0;
  private readonly minRequestInterval: number = 50;
  private listenKey: string | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor(marketType: 'spot' | 'futures' = 'futures') {
    super();
    this.marketType = marketType;
    
    if (marketType === 'futures') {
      this.baseUrl = 'https://fapi.binance.com';
      this.wsUrl = 'wss://fstream.binance.com';
    } else {
      this.baseUrl = 'https://api.binance.com';
      this.wsUrl = 'wss://stream.binance.com:9443';
    }
  }

  async connect(credentials: ExchangeCredentials): Promise<void> {
    this.credentials = credentials;
    
    try {
      const endpoint = this.marketType === 'futures' ? '/fapi/v2/account' : '/api/v3/account';
      const response = await this.privateRequest('GET', endpoint, {});
      if (response) {
        this.connected = true;
        console.log(`[BinanceAdapter] Connected to ${this.marketType}`);
        
        if (this.marketType === 'futures') {
          await this.startUserDataStream();
        }
      }
    } catch (error) {
      console.error('[BinanceAdapter] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    for (const [key, ws] of this.wsConnections) {
      ws.close();
      this.wsConnections.delete(key);
    }
    
    if (this.listenKey) {
      try {
        await this.privateRequest('DELETE', '/fapi/v1/listenKey', {});
      } catch {}
      this.listenKey = null;
    }
    
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    this.connected = false;
  }

  // =========================================================================
  // MARKET DATA
  // =========================================================================

  async getTicker(symbol: string): Promise<UnifiedTicker> {
    const endpoint = this.marketType === 'futures' 
      ? '/fapi/v1/ticker/24hr' 
      : '/api/v3/ticker/24hr';
    
    const data = await this.publicRequest('GET', endpoint, { symbol });
    
    return {
      exchange: this.exchangeId,
      symbol: data.symbol,
      bid: parseFloat(data.bidPrice),
      ask: parseFloat(data.askPrice),
      lastPrice: parseFloat(data.lastPrice),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume24h: parseFloat(data.volume),
      timestamp: Date.now(),
    };
  }

  async getOrderbook(symbol: string, depth: number = 20): Promise<UnifiedOrderbook> {
    const endpoint = this.marketType === 'futures' ? '/fapi/v1/depth' : '/api/v3/depth';
    const response = await this.publicRequest('GET', endpoint, { symbol, limit: depth });
    
    return {
      exchange: this.exchangeId,
      symbol,
      bids: response.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
      asks: response.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, interval: string, limit: number = 500): Promise<UnifiedCandle[]> {
    const endpoint = this.marketType === 'futures' ? '/fapi/v1/klines' : '/api/v3/klines';
    const response = await this.publicRequest('GET', endpoint, { symbol, interval, limit });
    
    return response.map((c: any[]) => ({
      exchange: this.exchangeId,
      symbol,
      interval,
      openTime: c[0],
      closeTime: c[6],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      quoteVolume: parseFloat(c[7]),
      trades: c[8],
    }));
  }

  // =========================================================================
  // TRADING
  // =========================================================================

  async createOrder(params: UnifiedOrderParams): Promise<UnifiedOrder> {
    const endpoint = this.marketType === 'futures' ? '/fapi/v1/order' : '/api/v3/order';
    
    const orderParams: Record<string, any> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      newClientOrderId: params.clientOrderId || this.generateClientId(),
    };
    
    if (params.price !== undefined) orderParams.price = params.price;
    if (params.stopPrice !== undefined) orderParams.stopPrice = params.stopPrice;
    if (params.timeInForce) orderParams.timeInForce = params.timeInForce;
    if (params.reduceOnly) orderParams.reduceOnly = 'true';
    if (params.positionSide && this.marketType === 'futures') orderParams.positionSide = params.positionSide;
    
    const response = await this.privateRequest('POST', endpoint, orderParams);
    return this.parseOrder(response);
  }

  async cancelOrder(symbol: string, orderId: string): Promise<UnifiedOrder> {
    const endpoint = this.marketType === 'futures' ? '/fapi/v1/order' : '/api/v3/order';
    const response = await this.privateRequest('DELETE', endpoint, { symbol, orderId });
    return this.parseOrder(response);
  }

  async cancelAllOrders(symbol?: string): Promise<void> {
    const endpoint = this.marketType === 'futures' ? '/fapi/v1/allOpenOrders' : '/api/v3/openOrders';
    const params: Record<string, any> = symbol ? { symbol } : {};
    await this.privateRequest('DELETE', endpoint, params);
  }

  async getOrder(symbol: string, orderId: string): Promise<UnifiedOrder> {
    const endpoint = this.marketType === 'futures' ? '/fapi/v1/order' : '/api/v3/order';
    const response = await this.privateRequest('GET', endpoint, { symbol, orderId });
    return this.parseOrder(response);
  }

  async getOpenOrders(symbol?: string): Promise<UnifiedOrder[]> {
    const endpoint = this.marketType === 'futures' ? '/fapi/v1/openOrders' : '/api/v3/openOrders';
    const params: Record<string, any> = symbol ? { symbol } : {};
    const response = await this.privateRequest('GET', endpoint, params);
    return response.map((o: any) => this.parseOrder(o));
  }

  // =========================================================================
  // POSITION MANAGEMENT
  // =========================================================================

  async getPositions(symbol?: string): Promise<UnifiedPosition[]> {
    if (this.marketType !== 'futures') return [];
    
    const response = await this.privateRequest('GET', '/fapi/v2/positionRisk', {});
    let positions = response.filter((p: any) => parseFloat(p.positionAmt) !== 0);
    if (symbol) positions = positions.filter((p: any) => p.symbol === symbol);
    
    return positions.map((p: any) => ({
      positionId: `${this.exchangeId}_${p.symbol}_${p.positionSide}`,
      exchange: this.exchangeId,
      symbol: p.symbol,
      side: p.positionSide,
      quantity: Math.abs(parseFloat(p.positionAmt)),
      entryPrice: parseFloat(p.entryPrice),
      markPrice: parseFloat(p.markPrice),
      liquidationPrice: parseFloat(p.liquidationPrice) || undefined,
      unrealizedPnl: parseFloat(p.unRealizedProfit),
      realizedPnl: 0,
      leverage: parseFloat(p.leverage),
      margin: parseFloat(p.isolatedMargin) || 0,
      marginMode: p.marginType.toLowerCase(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    if (this.marketType !== 'futures') throw new Error('Leverage only for futures');
    await this.privateRequest('POST', '/fapi/v1/leverage', { symbol, leverage });
  }

  async setMarginMode(symbol: string, mode: 'cross' | 'isolated'): Promise<void> {
    if (this.marketType !== 'futures') throw new Error('Margin mode only for futures');
    await this.privateRequest('POST', '/fapi/v1/marginType', {
      symbol,
      marginType: mode === 'cross' ? 'CROSSED' : 'ISOLATED',
    });
  }

  // =========================================================================
  // ACCOUNT
  // =========================================================================

  async getBalances(): Promise<UnifiedBalance[]> {
    if (this.marketType === 'futures') {
      const response = await this.privateRequest('GET', '/fapi/v2/balance', {});
      return response
        .filter((b: any) => parseFloat(b.balance) > 0)
        .map((b: any) => ({
          exchange: this.exchangeId,
          asset: b.asset,
          total: parseFloat(b.balance),
          available: parseFloat(b.availableBalance),
          locked: parseFloat(b.balance) - parseFloat(b.availableBalance),
        }));
    } else {
      const response = await this.privateRequest('GET', '/api/v3/account', {});
      return response.balances
        .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b: any) => ({
          exchange: this.exchangeId,
          asset: b.asset,
          total: parseFloat(b.free) + parseFloat(b.locked),
          available: parseFloat(b.free),
          locked: parseFloat(b.locked),
        }));
    }
  }

  // =========================================================================
  // WEBSOCKET
  // =========================================================================

  async subscribeTicker(symbol: string, callback: (ticker: UnifiedTicker) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/ws/${symbol.toLowerCase()}@ticker`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      callback({
        exchange: this.exchangeId,
        symbol: data.s,
        bid: parseFloat(data.b),
        ask: parseFloat(data.a),
        lastPrice: parseFloat(data.c),
        high24h: parseFloat(data.h),
        low24h: parseFloat(data.l),
        volume24h: parseFloat(data.v),
        timestamp: data.E,
      });
    };
    this.wsConnections.set(`ticker_${symbol}`, ws);
  }

  async subscribeOrderbook(symbol: string, callback: (orderbook: UnifiedOrderbook) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/ws/${symbol.toLowerCase()}@depth20@100ms`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      callback({
        exchange: this.exchangeId,
        symbol: data.s || symbol,
        bids: (data.b || []).map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: (data.a || []).map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
        timestamp: Date.now(),
      });
    };
    this.wsConnections.set(`orderbook_${symbol}`, ws);
  }

  async subscribeCandles(symbol: string, interval: string, callback: (candle: UnifiedCandle) => void): Promise<void> {
    const ws = new WebSocket(`${this.wsUrl}/ws/${symbol.toLowerCase()}@kline_${interval}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const k = data.k;
      callback({
        exchange: this.exchangeId,
        symbol: k.s,
        interval: k.i,
        openTime: k.t,
        closeTime: k.T,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        quoteVolume: parseFloat(k.q),
        trades: k.n,
      });
    };
    this.wsConnections.set(`candle_${symbol}_${interval}`, ws);
  }

  async subscribeOrders(callback: (order: UnifiedOrder) => void): Promise<void> {
    if (!this.listenKey) await this.startUserDataStream();
    if (!this.listenKey) return;
    
    const ws = new WebSocket(`${this.wsUrl}/ws/${this.listenKey}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.e === 'ORDER_TRADE_UPDATE') {
        const o = data.o;
        callback({
          orderId: o.c,
          exchangeOrderId: String(o.i),
          clientOrderId: o.c,
          exchange: this.exchangeId,
          symbol: o.s,
          side: o.S,
          type: o.o,
          status: this.mapStatus(o.X),
          quantity: parseFloat(o.q),
          filledQuantity: parseFloat(o.z),
          remainingQuantity: parseFloat(o.q) - parseFloat(o.z),
          price: o.p ? parseFloat(o.p) : undefined,
          timeInForce: o.f,
          createdAt: o.T,
          updatedAt: data.E,
        });
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
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.msg || `HTTP ${response.status}`);
    }
    return response.json();
  }

  private async privateRequest(method: string, endpoint: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.credentials) throw new Error('Not authenticated');
    params.timestamp = Date.now();
    const query = new URLSearchParams(params).toString();
    const signature = crypto.createHmac('sha256', this.credentials.apiSecret).update(query).digest('hex');
    const url = `${this.baseUrl}${endpoint}?${query}&signature=${signature}`;
    const response = await fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': this.credentials.apiKey },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.msg || `HTTP ${response.status}`);
    }
    return response.json();
  }

  private parseOrder(o: any): UnifiedOrder {
    return {
      orderId: o.clientOrderId,
      exchangeOrderId: String(o.orderId),
      clientOrderId: o.clientOrderId,
      exchange: this.exchangeId,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      status: this.mapStatus(o.status),
      quantity: parseFloat(o.origQty),
      filledQuantity: parseFloat(o.executedQty),
      remainingQuantity: parseFloat(o.origQty) - parseFloat(o.executedQty),
      price: o.price ? parseFloat(o.price) : undefined,
      stopPrice: o.stopPrice ? parseFloat(o.stopPrice) : undefined,
      timeInForce: o.timeInForce,
      createdAt: o.updateTime,
      updatedAt: o.updateTime,
    };
  }

  private mapStatus(status: string): any {
    const map: Record<string, string> = {
      NEW: 'NEW', PARTIALLY_FILLED: 'PARTIALLY_FILLED', FILLED: 'FILLED',
      CANCELED: 'CANCELLED', REJECTED: 'REJECTED', EXPIRED: 'EXPIRED',
    };
    return map[status] || status;
  }

  private generateClientId(): string {
    return `x-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private async startUserDataStream(): Promise<void> {
    if (!this.credentials) return;
    const response = await this.privateRequest('POST', '/fapi/v1/listenKey', {});
    this.listenKey = response.listenKey;
    this.keepAliveInterval = setInterval(async () => {
      try { await this.privateRequest('PUT', '/fapi/v1/listenKey', {}); } catch {}
    }, 30 * 60 * 1000);
  }
}

export default BinanceAdapter;
