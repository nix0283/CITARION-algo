/**
 * Real Exchange Clients for Trading Bot Execution
 * Production-ready implementation with proper authentication
 *
 * Supports: Binance, Bybit, OKX
 * Modes: PAPER, TESTNET, DEMO, LIVE
 */

import crypto from 'crypto';

// ==================== Types ====================

export type ExchangeId = 'binance' | 'bybit' | 'okx' | 'bitget' | 'bingx';
export type TradingMode = 'PAPER' | 'TESTNET' | 'DEMO' | 'LIVE';
export type MarketType = 'spot' | 'futures';

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // For OKX, Bitget
}

export interface ExchangeOrderConfig {
  exchangeId: ExchangeId;
  mode: TradingMode;
  marketType: MarketType;
  credentials: ExchangeCredentials;
}

export interface OrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP_LIMIT' | 'STOP_MARKET';
  amount: number;
  price?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  clientOrderId?: string;
}

export interface ExchangeOrder {
  id: string;
  exchangeOrderId: string;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP_LIMIT' | 'STOP_MARKET';
  price?: number;
  amount: number;
  filledAmount: number;
  status: 'PENDING' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  createdAt: Date;
  updatedAt: Date;
  fee?: number;
  feeCurrency?: string;
}

export interface ExchangeBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface ExchangePosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnL: number;
  leverage: number;
  liquidationPrice?: number;
  marginMode: 'ISOLATED' | 'CROSS';
}

export interface ExchangeOrderResult {
  success: boolean;
  order?: ExchangeOrder;
  error?: string;
  errorCode?: string;
}

export interface TickerInfo {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

// ==================== Utility Functions ====================

/**
 * Generate query string from object
 */
function queryString(params: Record<string, string | number | boolean>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * HMAC SHA256 signature
 */
function hmacSha256(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

/**
 * HMAC SHA256 for Base64 output (OKX)
 */
function hmacSha256Base64(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

// ==================== Binance Client ====================

const BINANCE_URLS = {
  spot: {
    live: 'https://api.binance.com',
    testnet: 'https://testnet.binance.vision',
  },
  futures: {
    live: 'https://fapi.binance.com',
    testnet: 'https://testnet.binancefuture.com',
  },
};

export class BinanceClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(mode: TradingMode, marketType: MarketType, credentials: ExchangeCredentials) {
    const urls = marketType === 'futures' ? BINANCE_URLS.futures : BINANCE_URLS.spot;
    this.baseUrl = mode === 'LIVE' ? urls.live : urls.testnet;
    this.apiKey = credentials.apiKey;
    this.apiSecret = credentials.apiSecret;
  }

  private getTimestamp(): number {
    return Date.now();
  }

  private async signRequest(params: Record<string, unknown>): Promise<string> {
    const query = queryString(params as Record<string, string | number | boolean>);
    return hmacSha256(this.apiSecret, query);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, unknown> = {},
    isSigned = false
  ): Promise<T> {
    if (isSigned) {
      params.timestamp = this.getTimestamp();
      params.recvWindow = 5000;
      const signature = await this.signRequest(params);
      params.signature = signature;
    }

    const query = queryString(params as Record<string, string | number | boolean>);
    const url = `${this.baseUrl}${endpoint}?${query}`;

    const response = await fetch(url, {
      method,
      headers: {
        'X-MBX-APIKEY': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.msg || `Binance API error: ${response.status}`);
    }

    return data;
  }

  async getServerTime(): Promise<number> {
    const data = await this.request<{ serverTime: number }>('GET', '/api/v3/time');
    return data.serverTime;
  }

  async getAccountBalances(): Promise<ExchangeBalance[]> {
    const data = await this.request<{ balances: Array<{ asset: string; free: string; locked: string }> }>(
      'GET',
      '/api/v3/account',
      {},
      true
    );

    return data.balances
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }));
  }

  async getFuturesBalances(): Promise<ExchangeBalance[]> {
    const data = await this.request<Array<{ asset: string; availableBalance: string; balance: string }>>(
      'GET',
      '/fapi/v2/balance',
      {},
      true
    );

    return data
      .filter(b => parseFloat(b.balance) > 0)
      .map(b => ({
        asset: b.asset,
        free: parseFloat(b.availableBalance),
        locked: 0,
        total: parseFloat(b.balance),
      }));
  }

  async placeOrder(params: OrderParams): Promise<ExchangeOrderResult> {
    try {
      const endpoint = '/api/v3/order'; // spot
      const orderParams: Record<string, unknown> = {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: params.amount,
      };

      if (params.price && params.type !== 'MARKET') {
        orderParams.price = params.price;
      }
      if (params.stopPrice && params.type.includes('STOP')) {
        orderParams.stopPrice = params.stopPrice;
      }
      if (params.timeInForce) {
        orderParams.timeInForce = params.timeInForce;
      }
      if (params.clientOrderId) {
        orderParams.newClientOrderId = params.clientOrderId;
      }

      const data = await this.request<{
        orderId: number;
        clientOrderId: string;
        symbol: string;
        status: string;
        price: string;
        origQty: string;
        executedQty: string;
        transactTime: number;
      }>('POST', endpoint, orderParams, true);

      return {
        success: true,
        order: {
          id: data.orderId.toString(),
          exchangeOrderId: data.orderId.toString(),
          clientOrderId: data.clientOrderId,
          symbol: data.symbol,
          side: params.side,
          type: params.type,
          price: parseFloat(data.price) || params.price,
          amount: parseFloat(data.origQty),
          filledAmount: parseFloat(data.executedQty),
          status: this.mapStatus(data.status),
          createdAt: new Date(data.transactTime),
          updatedAt: new Date(data.transactTime),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async placeFuturesOrder(params: OrderParams): Promise<ExchangeOrderResult> {
    try {
      const orderParams: Record<string, unknown> = {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: params.amount,
      };

      if (params.price && params.type !== 'MARKET') {
        orderParams.price = params.price;
      }
      if (params.stopPrice && params.type.includes('STOP')) {
        orderParams.stopPrice = params.stopPrice;
      }
      if (params.reduceOnly) {
        orderParams.reduceOnly = 'true';
      }

      const data = await this.request<{
        orderId: number;
        clientOrderId: string;
        symbol: string;
        status: string;
        price: string;
        origQty: string;
        executedQty: string;
        updateTime: number;
      }>('POST', '/fapi/v1/order', orderParams, true);

      return {
        success: true,
        order: {
          id: data.orderId.toString(),
          exchangeOrderId: data.orderId.toString(),
          clientOrderId: data.clientOrderId,
          symbol: data.symbol,
          side: params.side,
          type: params.type,
          price: parseFloat(data.price) || params.price,
          amount: parseFloat(data.origQty),
          filledAmount: parseFloat(data.executedQty),
          status: this.mapStatus(data.status),
          createdAt: new Date(),
          updatedAt: new Date(data.updateTime),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<ExchangeOrderResult> {
    try {
      const data = await this.request<{
        orderId: number;
        status: string;
      }>('DELETE', '/fapi/v1/order', { symbol, orderId }, true);

      return {
        success: true,
        order: {
          id: data.orderId.toString(),
          exchangeOrderId: data.orderId.toString(),
          clientOrderId: '',
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          amount: 0,
          filledAmount: 0,
          status: 'CANCELLED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; leverage: number }> {
    try {
      const data = await this.request<{ leverage: number }>(
        'POST',
        '/fapi/v1/leverage',
        { symbol, leverage },
        true
      );
      return { success: true, leverage: data.leverage };
    } catch {
      return { success: false, leverage };
    }
  }

  async getPositions(): Promise<ExchangePosition[]> {
    try {
      const data = await this.request<Array<{
        symbol: string;
        positionAmt: string;
        entryPrice: string;
        markPrice: string;
        unRealizedProfit: string;
        leverage: string;
        liquidationPrice: string;
        marginType: string;
        positionSide: string;
      }>>('GET', '/fapi/v2/positionRisk', {}, true);

      return data
        .filter(p => parseFloat(p.positionAmt) !== 0)
        .map(p => ({
          symbol: p.symbol,
          side: parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT',
          size: Math.abs(parseFloat(p.positionAmt)),
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          unrealizedPnL: parseFloat(p.unRealizedProfit),
          leverage: parseInt(p.leverage),
          liquidationPrice: parseFloat(p.liquidationPrice) || undefined,
          marginMode: p.marginType.toUpperCase() as 'ISOLATED' | 'CROSS',
        }));
    } catch {
      return [];
    }
  }

  async getTicker(symbol: string): Promise<TickerInfo> {
    const data = await this.request<{
      symbol: string;
      bidPrice: string;
      askPrice: string;
      lastPrice: string;
      highPrice: string;
      lowPrice: string;
      volume: string;
    }>('GET', '/fapi/v1/ticker/24hr', { symbol });

    return {
      symbol: data.symbol,
      bid: parseFloat(data.bidPrice),
      ask: parseFloat(data.askPrice),
      last: parseFloat(data.lastPrice),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume24h: parseFloat(data.volume),
      timestamp: Date.now(),
    };
  }

  private mapStatus(status: string): ExchangeOrder['status'] {
    const map: Record<string, ExchangeOrder['status']> = {
      NEW: 'OPEN',
      PARTIALLY_FILLED: 'PARTIALLY_FILLED',
      FILLED: 'FILLED',
      CANCELED: 'CANCELLED',
      EXPIRED: 'CANCELLED',
      REJECTED: 'REJECTED',
    };
    return map[status] || 'PENDING';
  }
}

// ==================== Bybit Client ====================

const BYBIT_URLS = {
  live: 'https://api.bybit.com',
  testnet: 'https://api-testnet.bybit.com',
};

export class BybitClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(mode: TradingMode, credentials: ExchangeCredentials) {
    this.baseUrl = mode === 'LIVE' ? BYBIT_URLS.live : BYBIT_URLS.testnet;
    this.apiKey = credentials.apiKey;
    this.apiSecret = credentials.apiSecret;
  }

  private getTimestamp(): string {
    return Date.now().toString();
  }

  private generateSignature(params: Record<string, unknown>): string {
    const timestamp = this.getTimestamp();
    const paramString = Object.entries({ ...params, api_key: this.apiKey, timestamp })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    return hmacSha256(this.apiSecret, paramString);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params: Record<string, unknown> = {},
    isSigned = false
  ): Promise<T> {
    const timestamp = this.getTimestamp();
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    let body: string | undefined;
    let url = `${this.baseUrl}${endpoint}`;

    if (isSigned) {
      const signParams = { ...params, api_key: this.apiKey, timestamp };
      const paramString = Object.entries(signParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      const signature = hmacSha256(this.apiSecret, paramString);

      headers = {
        ...headers,
        'X-BAPI-API-KEY': this.apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-SIGN': signature,
      };
    }

    if (method === 'GET' && Object.keys(params).length > 0) {
      url += '?' + queryString(params as Record<string, string | number | boolean>);
    } else if (method === 'POST') {
      body = JSON.stringify(params);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    const data = await response.json();

    if (data.retCode !== 0) {
      throw new Error(data.retMsg || `Bybit API error: ${data.retCode}`);
    }

    return data.result;
  }

  async getBalances(): Promise<ExchangeBalance[]> {
    try {
      const data = await this.request<{
        list: Array<{
          coin: Array<{
            coin: string;
            availableToWithdraw: string;
            walletBalance: string;
            locked: string;
          }>;
        }>;
      }>('GET', '/v5/account/wallet-balance', { accountType: 'UNIFIED' }, true);

      const balances: ExchangeBalance[] = [];
      for (const account of data.list) {
        for (const coin of account.coin) {
          if (parseFloat(coin.walletBalance) > 0) {
            balances.push({
              asset: coin.coin,
              free: parseFloat(coin.availableToWithdraw),
              locked: parseFloat(coin.locked),
              total: parseFloat(coin.walletBalance),
            });
          }
        }
      }

      return balances;
    } catch {
      return [];
    }
  }

  async placeOrder(params: OrderParams): Promise<ExchangeOrderResult> {
    try {
      const orderParams: Record<string, unknown> = {
        category: 'linear',
        symbol: params.symbol,
        side: params.side === 'BUY' ? 'Buy' : 'Sell',
        orderType: params.type === 'MARKET' ? 'Market' : 'Limit',
        qty: params.amount.toString(),
        timeInForce: params.timeInForce || 'GTC',
      };

      if (params.price && params.type !== 'MARKET') {
        orderParams.price = params.price.toString();
      }
      if (params.stopPrice) {
        orderParams.triggerPrice = params.stopPrice.toString();
      }
      if (params.reduceOnly) {
        orderParams.reduceOnly = true;
      }

      const data = await this.request<{
        orderId: string;
        orderLinkId: string;
      }>('POST', '/v5/order/create', orderParams, true);

      return {
        success: true,
        order: {
          id: data.orderId,
          exchangeOrderId: data.orderId,
          clientOrderId: data.orderLinkId,
          symbol: params.symbol,
          side: params.side,
          type: params.type,
          price: params.price,
          amount: params.amount,
          filledAmount: 0,
          status: 'OPEN',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<ExchangeOrderResult> {
    try {
      await this.request('POST', '/v5/order/cancel', {
        category: 'linear',
        symbol,
        orderId,
      }, true);

      return {
        success: true,
        order: {
          id: orderId,
          exchangeOrderId: orderId,
          clientOrderId: '',
          symbol,
          side: 'BUY',
          type: 'LIMIT',
          amount: 0,
          filledAmount: 0,
          status: 'CANCELLED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; leverage: number }> {
    try {
      await this.request('POST', '/v5/position/set-leverage', {
        category: 'linear',
        symbol,
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString(),
      }, true);
      return { success: true, leverage };
    } catch {
      return { success: false, leverage };
    }
  }

  async getPositions(): Promise<ExchangePosition[]> {
    try {
      const data = await this.request<{
        list: Array<{
          symbol: string;
          side: string;
          size: string;
          avgPrice: string;
          markPrice: string;
          unrealisedPnl: string;
          leverage: string;
          liqPrice: string;
          positionIM: string;
        }>;
      }>('GET', '/v5/position/list', { category: 'linear', settleCoin: 'USDT' }, true);

      return data.list
        .filter(p => parseFloat(p.size) > 0)
        .map(p => ({
          symbol: p.symbol,
          side: p.side.toUpperCase() as 'LONG' | 'SHORT',
          size: parseFloat(p.size),
          entryPrice: parseFloat(p.avgPrice),
          markPrice: parseFloat(p.markPrice),
          unrealizedPnL: parseFloat(p.unrealisedPnl),
          leverage: parseInt(p.leverage),
          liquidationPrice: parseFloat(p.liqPrice) || undefined,
          marginMode: 'ISOLATED' as const,
        }));
    } catch {
      return [];
    }
  }

  async getTicker(symbol: string): Promise<TickerInfo> {
    const data = await this.request<{
      list: Array<{
        symbol: string;
        bid1Price: string;
        ask1Price: string;
        lastPrice: string;
        highPrice24h: string;
        lowPrice24h: string;
        volume24h: string;
      }>;
    }>('GET', '/v5/market/tickers', { category: 'linear', symbol });

    const ticker = data.list[0];
    if (!ticker) throw new Error('Ticker not found');

    return {
      symbol: ticker.symbol,
      bid: parseFloat(ticker.bid1Price),
      ask: parseFloat(ticker.ask1Price),
      last: parseFloat(ticker.lastPrice),
      high24h: parseFloat(ticker.highPrice24h),
      low24h: parseFloat(ticker.lowPrice24h),
      volume24h: parseFloat(ticker.volume24h),
      timestamp: Date.now(),
    };
  }
}

// ==================== OKX Client ====================

const OKX_URL = 'https://www.okx.com';

export class OkxClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private passphrase: string;
  private isDemo: boolean;

  constructor(mode: TradingMode, credentials: ExchangeCredentials) {
    this.baseUrl = OKX_URL;
    this.apiKey = credentials.apiKey;
    this.apiSecret = credentials.apiSecret;
    this.passphrase = credentials.passphrase || '';
    this.isDemo = mode === 'DEMO' || mode === 'TESTNET';
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private generateSignature(timestamp: string, method: string, endpoint: string, body?: string): string {
    const message = timestamp + method + endpoint + (body || '');
    return hmacSha256Base64(this.apiSecret, message);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const timestamp = this.getTimestamp();
    const body = method !== 'GET' && Object.keys(params).length > 0 ? JSON.stringify(params) : '';
    const query = method === 'GET' && Object.keys(params).length > 0 ? '?' + queryString(params as Record<string, string | number | boolean>) : '';

    const signature = this.generateSignature(timestamp, method, endpoint + query, body);

    const headers: Record<string, string> = {
      'OK-ACCESS-KEY': this.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json',
    };

    if (this.isDemo) {
      headers['x-simulated-trading'] = '1';
    }

    const response = await fetch(`${this.baseUrl}${endpoint}${query}`, {
      method,
      headers,
      body: body || undefined,
    });

    const data = await response.json();

    if (data.code !== '0') {
      throw new Error(data.msg || `OKX API error: ${data.code}`);
    }

    return data.data;
  }

  async getBalances(): Promise<ExchangeBalance[]> {
    try {
      const data = await this.request<Array<{
        ccy: string;
        availBal: string;
        frozenBal: string;
        cashBal: string;
      }>>('GET', '/api/v5/account/balance');

      return data.map(b => ({
        asset: b.ccy,
        free: parseFloat(b.availBal),
        locked: parseFloat(b.frozenBal),
        total: parseFloat(b.cashBal),
      }));
    } catch {
      return [];
    }
  }

  async placeOrder(params: OrderParams): Promise<ExchangeOrderResult> {
    try {
      const instId = params.symbol.replace('USDT', '-USDT-SWAP');
      const orderParams: Record<string, unknown> = {
        instId,
        tdMode: 'cross',
        side: params.side.toLowerCase(),
        ordType: params.type === 'MARKET' ? 'market' : 'limit',
        sz: params.amount.toString(),
      };

      if (params.price && params.type !== 'MARKET') {
        orderParams.px = params.price.toString();
      }
      if (params.reduceOnly) {
        orderParams.reduceOnly = 'true';
      }

      const data = await this.request<Array<{
        ordId: string;
        clOrdId: string;
        sCode: string;
      }>>('POST', '/api/v5/trade/order', orderParams);

      const result = data[0];
      if (result.sCode !== '0') {
        return { success: false, error: result.sCode };
      }

      return {
        success: true,
        order: {
          id: result.ordId,
          exchangeOrderId: result.ordId,
          clientOrderId: result.clOrdId,
          symbol: params.symbol,
          side: params.side,
          type: params.type,
          price: params.price,
          amount: params.amount,
          filledAmount: 0,
          status: 'OPEN',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async cancelOrder(instId: string, ordId: string): Promise<ExchangeOrderResult> {
    try {
      await this.request('POST', '/api/v5/trade/cancel-order', { instId, ordId });

      return {
        success: true,
        order: {
          id: ordId,
          exchangeOrderId: ordId,
          clientOrderId: '',
          symbol: instId,
          side: 'BUY',
          type: 'LIMIT',
          amount: 0,
          filledAmount: 0,
          status: 'CANCELLED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async setLeverage(instId: string, leverage: number): Promise<{ success: boolean; leverage: number }> {
    try {
      await this.request('POST', '/api/v5/account/set-leverage', {
        instId,
        lever: leverage.toString(),
        mgnMode: 'cross',
      });
      return { success: true, leverage };
    } catch {
      return { success: false, leverage };
    }
  }

  async getPositions(): Promise<ExchangePosition[]> {
    try {
      const data = await this.request<Array<{
        instId: string;
        pos: string;
        posSide: string;
        avgPx: string;
        markPx: string;
        upl: string;
        lever: string;
        liqPx: string;
      }>>('GET', '/api/v5/account/positions');

      return data
        .filter(p => parseFloat(p.pos) !== 0)
        .map(p => ({
          symbol: p.instId.replace('-USDT-SWAP', 'USDT'),
          side: p.posSide.toUpperCase() as 'LONG' | 'SHORT',
          size: Math.abs(parseFloat(p.pos)),
          entryPrice: parseFloat(p.avgPx),
          markPrice: parseFloat(p.markPx),
          unrealizedPnL: parseFloat(p.upl),
          leverage: parseInt(p.lever),
          liquidationPrice: parseFloat(p.liqPx) || undefined,
          marginMode: 'CROSS' as const,
        }));
    } catch {
      return [];
    }
  }

  async getTicker(symbol: string): Promise<TickerInfo> {
    const instId = symbol.replace('USDT', '-USDT-SWAP');
    const data = await this.request<Array<{
      instId: string;
      bidPx: string;
      askPx: string;
      last: string;
      high24h: string;
      low24h: string;
      vol24h: string;
      ts: string;
    }>>('GET', '/api/v5/market/ticker', { instId });

    const ticker = data[0];
    if (!ticker) throw new Error('Ticker not found');

    return {
      symbol,
      bid: parseFloat(ticker.bidPx),
      ask: parseFloat(ticker.askPx),
      last: parseFloat(ticker.last),
      high24h: parseFloat(ticker.high24h),
      low24h: parseFloat(ticker.low24h),
      volume24h: parseFloat(ticker.vol24h),
      timestamp: parseInt(ticker.ts),
    };
  }
}

// ==================== Unified Exchange Factory ====================

export class ExchangeClientFactory {
  static createClient(config: ExchangeOrderConfig): BinanceClient | BybitClient | OkxClient | null {
    if (config.mode === 'PAPER') {
      return null; // Paper trading handled separately
    }

    switch (config.exchangeId) {
      case 'binance':
        return new BinanceClient(config.mode, config.marketType, config.credentials);
      case 'bybit':
        return new BybitClient(config.mode, config.credentials);
      case 'okx':
        return new OkxClient(config.mode, config.credentials);
      default:
        throw new Error(`Unsupported exchange: ${config.exchangeId}`);
    }
  }
}

export type ExchangeClient = BinanceClient | BybitClient | OkxClient;
