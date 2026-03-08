/**
 * Funding Rate Module for CITARION
 * 
 * Implements:
 * - Real-time funding rate via WebSocket (Binance, Bybit, OKX)
 * - Historical funding rate via REST API
 * - Funding rate calculation for PnL
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export interface FundingRate {
  symbol: string;
  exchange: string;
  fundingRate: number;        // Decimal: 0.0001 = 0.01%
  fundingTime: Date;          // Next funding time
  markPrice?: number;
  indexPrice?: number;
  estimatedSettlePrice?: number;
  timestamp: Date;
}

export interface FundingRateHistory {
  symbol: string;
  exchange: string;
  fundingRate: number;
  fundingTime: Date;
  markPrice?: number;
}

export interface FundingPayment {
  positionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  fundingRate: number;
  fundingPayment: number;     // Positive = receive, Negative = pay
  timestamp: Date;
}

// ==================== EXCHANGE CONFIGS ====================

type ExchangeType = "binance" | "bybit" | "okx" | "bitget" | "bingx" | "kucoin";

const EXCHANGE_FUNDING_CONFIGS = {
  binance: {
    name: "Binance",
    wsUrl: "wss://fstream.binance.com/ws",
    restUrl: "https://fapi.binance.com",
    fundingInterval: 8, // hours
    formatSymbol: (symbol: string) => symbol.toLowerCase(),
    wsSubscribe: (symbol: string) => JSON.stringify({
      method: "SUBSCRIBE",
      params: [`${symbol.toLowerCase()}@markPrice`],
      id: Date.now()
    }),
    parseWsMessage: (data: unknown): FundingRate | null => {
      const msg = data as { 
        e?: string; 
        s?: string; 
        r?: string; 
        T?: number;
        p?: string;
        i?: string;
      };
      if (msg.e !== "markPriceUpdate" || !msg.s) return null;
      return {
        symbol: msg.s,
        exchange: "binance",
        fundingRate: parseFloat(msg.r || "0"),
        fundingTime: new Date(msg.T || Date.now()),
        markPrice: parseFloat(msg.p || "0"),
        indexPrice: parseFloat(msg.i || "0"),
        timestamp: new Date(),
      };
    },
    getHistoryUrl: (symbol: string, limit: number) => 
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=${limit}`,
  },
  
  bybit: {
    name: "Bybit",
    wsUrl: "wss://stream.bybit.com/v5/public/linear",
    restUrl: "https://api.bybit.com",
    fundingInterval: 8,
    formatSymbol: (symbol: string) => symbol.toUpperCase(),
    wsSubscribe: (symbol: string) => JSON.stringify({
      op: "subscribe",
      args: [`tickers.${symbol}`]
    }),
    parseWsMessage: (data: unknown): FundingRate | null => {
      const msg = data as {
        topic?: string;
        data?: {
          symbol?: string;
          fundingRate?: string;
          nextFundingTime?: string;
          markPrice?: string;
          indexPrice?: string;
        };
      };
      if (!msg.topic?.includes("tickers") || !msg.data) return null;
      const d = msg.data;
      return {
        symbol: d.symbol || "",
        exchange: "bybit",
        fundingRate: parseFloat(d.fundingRate || "0"),
        fundingTime: new Date(parseInt(d.nextFundingTime || "0")),
        markPrice: parseFloat(d.markPrice || "0"),
        indexPrice: parseFloat(d.indexPrice || "0"),
        timestamp: new Date(),
      };
    },
    getHistoryUrl: (symbol: string, limit: number) =>
      `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=${limit}`,
  },
  
  okx: {
    name: "OKX",
    wsUrl: "wss://ws.okx.com:8443/ws/v5/public",
    restUrl: "https://www.okx.com",
    fundingInterval: 8,
    formatSymbol: (symbol: string) => symbol.replace("USDT", "-USDT-SWAP"),
    wsSubscribe: (symbol: string) => JSON.stringify({
      op: "subscribe",
      args: [{ channel: "funding-rate", instId: symbol.replace("USDT", "-USDT-SWAP") }]
    }),
    parseWsMessage: (data: unknown): FundingRate | null => {
      const msg = data as {
        arg?: { channel: string; instId: string };
        data?: {
          fundingRate?: string;
          fundingTime?: string;
          markPx?: string;
          idxPx?: string;
        }[];
      };
      if (msg.arg?.channel !== "funding-rate" || !msg.data?.[0]) return null;
      const d = msg.data[0];
      const symbol = msg.arg.instId.replace("-USDT-SWAP", "USDT");
      return {
        symbol,
        exchange: "okx",
        fundingRate: parseFloat(d.fundingRate || "0"),
        fundingTime: new Date(parseInt(d.fundingTime || "0")),
        markPrice: parseFloat(d.markPx || "0"),
        indexPrice: parseFloat(d.idxPx || "0"),
        timestamp: new Date(),
      };
    },
    getHistoryUrl: (symbol: string, limit: number) =>
      `https://www.okx.com/api/v5/public/funding-rate-history?instId=${symbol.replace("USDT", "-USDT-SWAP")}&limit=${limit}`,
  },
  
  bitget: {
    name: "Bitget",
    wsUrl: "wss://ws.bitget.com/v2/ws/public",
    restUrl: "https://api.bitget.com",
    fundingInterval: 8,
    formatSymbol: (symbol: string) => symbol.toUpperCase(),
    wsSubscribe: (symbol: string) => JSON.stringify({
      op: "subscribe",
      args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: symbol.toUpperCase() }]
    }),
    parseWsMessage: (data: unknown): FundingRate | null => {
      // Bitget sends funding rate in ticker channel
      const msg = data as {
        arg?: { channel: string; instId: string };
        data?: Array<{
          fundingRate?: string;
          ts?: string;
          markPrice?: string;
          lastPr?: string;
        }>;
      };
      if (msg.arg?.channel !== "ticker" || !msg.data?.[0]) return null;
      const d = msg.data[0];
      return {
        symbol: msg.arg.instId || "",
        exchange: "bitget",
        fundingRate: parseFloat(d.fundingRate || "0"),
        fundingTime: d.ts ? new Date(parseInt(d.ts)) : new Date(),
        markPrice: parseFloat(d.markPrice || d.lastPr || "0"),
        timestamp: new Date(),
      };
    },
    // Bitget returns funding rate in ticker endpoint, not separate funding endpoint
    getHistoryUrl: (symbol: string, _limit: number) =>
      `https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol.toUpperCase()}`,
  },
  
  kucoin: {
    name: "KuCoin",
    wsUrl: "wss://ws-api.kucoin.com",
    restUrl: "https://api-futures.kucoin.com",
    fundingInterval: 8,
    formatSymbol: (symbol: string) => symbol.toUpperCase(),
    // KuCoin requires getting a token first via REST, so we'll use REST polling primarily
    wsSubscribe: (_symbol: string) => JSON.stringify({
      id: Date.now(),
      type: "subscribe",
      topic: "/contract/fundingRate"
    }),
    parseWsMessage: (data: unknown): FundingRate | null => {
      const msg = data as {
        subject?: string;
        data?: {
          symbol?: string;
          fundingRate?: string;
          markPrice?: string;
          indexPrice?: string;
          timestamp?: number;
        };
      };
      if (msg.subject !== "fundingRate.tick" || !msg.data) return null;
      const d = msg.data;
      return {
        symbol: d.symbol || "",
        exchange: "kucoin",
        fundingRate: parseFloat(d.fundingRate || "0"),
        fundingTime: new Date(d.timestamp || Date.now()),
        markPrice: parseFloat(d.markPrice || "0"),
        indexPrice: parseFloat(d.indexPrice || "0"),
        timestamp: new Date(),
      };
    },
    getHistoryUrl: (symbol: string, limit: number) =>
      `https://api-futures.kucoin.com/api/v1/funding-history?symbol=${symbol.toUpperCase()}&maxCount=${limit}`,
  },
  
  bingx: {
    name: "BingX",
    wsUrl: "wss://open-api-swap.bingx.com/ws",
    restUrl: "https://open-api.bingx.com",
    fundingInterval: 8,
    formatSymbol: (symbol: string) => symbol.replace("USDT", "-USDT"),
    wsSubscribe: (symbol: string) => JSON.stringify({
      id: Date.now(),
      reqType: "sub",
      dataType: `${symbol.replace("USDT", "-USDT")}@fundingRate`
    }),
    parseWsMessage: (data: unknown): FundingRate | null => {
      const msg = data as {
        dataType?: string;
        data?: {
          symbol?: string;
          fundingRate?: string;
          fundingTime?: number;
          markPrice?: string;
        };
      };
      if (!msg.dataType?.includes("fundingRate") || !msg.data) return null;
      const d = msg.data;
      return {
        symbol: d.symbol?.replace("-USDT", "USDT") || "",
        exchange: "bingx",
        fundingRate: parseFloat(d.fundingRate || "0"),
        fundingTime: new Date(d.fundingTime || Date.now()),
        markPrice: parseFloat(d.markPrice || "0"),
        timestamp: new Date(),
      };
    },
    getHistoryUrl: (symbol: string, _limit: number) =>
      `https://open-api.bingx.com/openApi/swap/v2/quote/fundingRate?symbol=${symbol.replace("USDT", "-USDT")}`,
  },
};

// ==================== WEBSOCKET FUNDING ====================

type FundingCallback = (data: FundingRate) => void;

class FundingRateWebSocket {
  private sockets: Map<string, WebSocket> = new Map();
  private subscribers: Set<FundingCallback> = new Set();
  private fundingRates: Map<string, FundingRate> = new Map();
  private symbols: string[] = [];
  
  constructor(symbols: string[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
    this.symbols = symbols;
  }
  
  connect(exchange: ExchangeType = "binance"): void {
    const config = EXCHANGE_FUNDING_CONFIGS[exchange];
    const key = `${exchange}-funding`;
    
    if (this.sockets.has(key) && this.sockets.get(key)?.readyState === WebSocket.OPEN) {
      return;
    }
    
    try {
      const ws = new WebSocket(config.wsUrl);
      
      ws.onopen = () => {
        console.log(`[Funding] ${config.name} WebSocket connected`);
        
        // Subscribe to symbols
        this.symbols.forEach(symbol => {
          const formattedSymbol = config.formatSymbol(symbol);
          ws.send(config.wsSubscribe(formattedSymbol));
        });
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle ping/pong
          if (data.ping || data.op === "ping") {
            ws.send(JSON.stringify({ pong: data.ping || Date.now() }));
            return;
          }
          
          const fundingRate = config.parseWsMessage(data);
          if (fundingRate) {
            this.updateFundingRate(fundingRate);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };
      
      ws.onclose = () => {
        console.log(`[Funding] ${config.name} WebSocket disconnected`);
        this.sockets.delete(key);
        // Reconnect after 5 seconds
        setTimeout(() => this.connect(exchange), 5000);
      };
      
      ws.onerror = (error) => {
        console.error(`[Funding] ${config.name} WebSocket error:`, error);
      };
      
      this.sockets.set(key, ws);
    } catch (error) {
      console.error(`[Funding] Failed to connect to ${config.name}:`, error);
    }
  }
  
  private updateFundingRate(data: FundingRate): void {
    const key = `${data.exchange}-${data.symbol}`;
    this.fundingRates.set(key, data);
    
    // Notify subscribers
    this.subscribers.forEach(callback => callback(data));
    
    // Store in database
    this.storeFundingRate(data).catch(console.error);
  }
  
  private async storeFundingRate(data: FundingRate): Promise<void> {
    try {
      // Store in FundingRateHistory table for proper tracking
      await db.fundingRateHistory.create({
        data: {
          symbol: data.symbol,
          exchange: data.exchange,
          fundingRate: data.fundingRate,
          fundingTime: data.fundingTime,
          markPrice: data.markPrice,
          indexPrice: data.indexPrice,
        }
      });
    } catch (error) {
      // Ignore duplicate errors - funding rate already stored
    }
  }
  
  subscribe(callback: FundingCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  getFundingRate(symbol: string, exchange: string = "binance"): FundingRate | undefined {
    return this.fundingRates.get(`${exchange}-${symbol}`);
  }
  
  getAllFundingRates(): FundingRate[] {
    return Array.from(this.fundingRates.values());
  }
  
  disconnect(): void {
    this.sockets.forEach(ws => ws.close());
    this.sockets.clear();
  }
  
  setSymbols(symbols: string[]): void {
    this.symbols = symbols;
    // Reconnect with new symbols
    this.disconnect();
    this.connect("binance");
  }
}

// Singleton instance
let fundingWsInstance: FundingRateWebSocket | null = null;

export function getFundingRateWebSocket(symbols?: string[]): FundingRateWebSocket {
  if (!fundingWsInstance) {
    fundingWsInstance = new FundingRateWebSocket(symbols);
  }
  return fundingWsInstance;
}

// ==================== REST API FUNDING HISTORY ====================

/**
 * Fetch historical funding rates from exchange
 */
export async function fetchFundingRateHistory(
  symbol: string,
  exchange: ExchangeType = "binance",
  limit: number = 100
): Promise<FundingRateHistory[]> {
  const config = EXCHANGE_FUNDING_CONFIGS[exchange];
  
  try {
    const url = config.getHistoryUrl(symbol, limit);
    const response = await fetch(url);
    const data = await response.json();
    
    // Parse based on exchange
    switch (exchange) {
      case "binance":
        // Binance returns array directly
        return (data as Array<{
          symbol: string;
          fundingRate: string;
          fundingTime: number;
          markPrice?: string;
        }>).map(item => ({
          symbol: item.symbol,
          exchange: "binance",
          fundingRate: parseFloat(item.fundingRate),
          fundingTime: new Date(item.fundingTime),
          markPrice: item.markPrice ? parseFloat(item.markPrice) : undefined,
        }));
      
      case "bybit":
        // Bybit returns { result: { list: [...] } }
        const bybitData = data as { result?: { list?: Array<{
          symbol: string;
          fundingRate: string;
          fundingRateTimestamp: string;
        }> } };
        return (bybitData.result?.list || []).map(item => ({
          symbol: item.symbol,
          exchange: "bybit",
          fundingRate: parseFloat(item.fundingRate),
          fundingTime: new Date(parseInt(item.fundingRateTimestamp)),
        }));
      
      case "okx":
        // OKX returns { data: [...] }
        const okxData = data as { data?: Array<{
          fundingRate: string;
          fundingTime: string;
          instId: string;
        }> };
        return (okxData.data || []).map(item => ({
          symbol: item.instId.replace("-USDT-SWAP", "USDT"),
          exchange: "okx",
          fundingRate: parseFloat(item.fundingRate),
          fundingTime: new Date(parseInt(item.fundingTime)),
        }));
      
      case "bitget":
        // Bitget returns funding rate in ticker endpoint
        const bitgetData = data as { data?: Array<{
          fundingRate?: string;
          ts?: string;
          markPrice?: string;
        }> };
        const bitgetItem = bitgetData.data?.[0];
        if (bitgetItem) {
          return [{
            symbol: symbol,
            exchange: "bitget",
            fundingRate: parseFloat(bitgetItem.fundingRate || "0"),
            fundingTime: bitgetItem.ts ? new Date(parseInt(bitgetItem.ts)) : new Date(),
            markPrice: bitgetItem.markPrice ? parseFloat(bitgetItem.markPrice) : undefined,
          }];
        }
        return [];
      
      case "kucoin":
        // KuCoin returns { data: { dataList: [...] } }
        const kucoinData = data as { data?: { dataList?: Array<{
          symbol: string;
          fundingRate: string;
          timepoint: number;
        }> } };
        return (kucoinData.data?.dataList || []).map(item => ({
          symbol: item.symbol,
          exchange: "kucoin",
          fundingRate: parseFloat(item.fundingRate),
          fundingTime: new Date(item.timepoint),
        }));
      
      case "bingx":
        // BingX returns { code: 0, data: [...] }
        const bingxData = data as { data?: Array<{
          symbol: string;
          fundingRate: string;
          fundingTime: number;
          markPrice?: string;
        }> };
        return (bingxData.data || []).map(item => ({
          symbol: item.symbol.replace("-USDT", "USDT"),
          exchange: "bingx",
          fundingRate: parseFloat(item.fundingRate),
          fundingTime: new Date(item.fundingTime),
          markPrice: item.markPrice ? parseFloat(item.markPrice) : undefined,
        }));
      
      default:
        return [];
    }
  } catch (error) {
    console.error(`[Funding] Failed to fetch history for ${symbol}:`, error);
    return [];
  }
}

// ==================== FUNDING CALCULATION ====================

/**
 * Calculate funding payment for a position
 * 
 * Funding is paid every 8 hours (typically at 00:00, 08:00, 16:00 UTC)
 * 
 * Formula:
 * Funding Payment = Position Size × Funding Rate
 * 
 * For LONG positions:
 *   - Positive funding rate: Pay funding
 *   - Negative funding rate: Receive funding
 * 
 * For SHORT positions:
 *   - Positive funding rate: Receive funding
 *   - Negative funding rate: Pay funding
 */
export function calculateFundingPayment(
  positionSize: number,      // In USDT
  fundingRate: number,       // Decimal: 0.0001 = 0.01%
  direction: "LONG" | "SHORT"
): number {
  // Base funding payment
  const basePayment = positionSize * fundingRate;
  
  // LONG pays when funding is positive, receives when negative
  // SHORT receives when funding is positive, pays when negative
  return direction === "LONG" ? -basePayment : basePayment;
}

/**
 * Calculate total funding paid/received for a position over time
 */
export function calculateTotalFunding(
  positionSize: number,
  fundingRates: number[],   // Array of funding rates during position
  direction: "LONG" | "SHORT"
): { totalFunding: number; fundingCount: number } {
  let totalFunding = 0;
  
  for (const rate of fundingRates) {
    totalFunding += calculateFundingPayment(positionSize, rate, direction);
  }
  
  return {
    totalFunding,
    fundingCount: fundingRates.length,
  };
}

/**
 * Check if funding settlement should occur
 * Funding occurs every 8 hours: 00:00, 08:00, 16:00 UTC
 */
export function shouldSettleFunding(lastSettlement: Date, now: Date = new Date()): boolean {
  const hoursSinceLastSettlement = (now.getTime() - lastSettlement.getTime()) / (1000 * 60 * 60);
  return hoursSinceLastSettlement >= 8;
}

/**
 * Get next funding time
 */
export function getNextFundingTime(): Date {
  const now = new Date();
  const hours = now.getUTCHours();
  
  let nextHour: number;
  if (hours < 8) {
    nextHour = 8;
  } else if (hours < 16) {
    nextHour = 16;
  } else {
    nextHour = 24; // Next day 00:00 UTC
  }
  
  const next = new Date(now);
  next.setUTCHours(nextHour, 0, 0, 0);
  if (nextHour === 24) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0, 0, 0, 0);
  }
  
  return next;
}

// ==================== PNL WITH FUNDING ====================

export interface PnLWithFunding {
  unrealizedPnL: number;
  realizedPnL: number;
  totalFundingPaid: number;
  totalFundingReceived: number;
  netFunding: number;
  totalFees: number;
  netPnL: number;
}

/**
 * Calculate comprehensive PnL including funding and fees
 */
export function calculatePnLWithFunding(params: {
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  direction: "LONG" | "SHORT";
  leverage: number;
  openFee: number;
  fundingPayments: number[];  // Array of funding payments (positive = received)
  closeFee?: number;
}): PnLWithFunding {
  const { entryPrice, currentPrice, quantity, direction, leverage, openFee, fundingPayments, closeFee = 0 } = params;
  
  // Calculate unrealized PnL
  const positionValue = quantity * entryPrice;
  let pricePnL: number;
  
  if (direction === "LONG") {
    pricePnL = (currentPrice - entryPrice) * quantity;
  } else {
    pricePnL = (entryPrice - currentPrice) * quantity;
  }
  
  // Calculate funding
  const totalFundingReceived = fundingPayments.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const totalFundingPaid = Math.abs(fundingPayments.filter(p => p < 0).reduce((a, b) => a + b, 0));
  const netFunding = totalFundingReceived - totalFundingPaid;
  
  // Total fees
  const totalFees = openFee + closeFee;
  
  // Net PnL
  const netPnL = pricePnL + netFunding - totalFees;
  
  return {
    unrealizedPnL: pricePnL,
    realizedPnL: 0, // Will be set when position is closed
    totalFundingPaid,
    totalFundingReceived,
    netFunding,
    totalFees,
    netPnL,
  };
}

// ==================== EXPORTS ====================

export { EXCHANGE_FUNDING_CONFIGS };
