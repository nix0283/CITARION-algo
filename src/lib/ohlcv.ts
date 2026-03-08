/**
 * OHLCV (Candlestick) Data Service
 * 
 * Implements:
 * - Fetching historical candles from exchanges (Binance, Bybit, OKX, Bitget, KuCoin)
 * - Local storage in database
 * - Sync status tracking
 * - WebSocket real-time candle updates
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export interface OhlcvCandle {
  symbol: string;
  exchange: string;
  marketType: "spot" | "futures" | "inverse";
  timeframe: string;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  trades?: number;
  takerBuyVolume?: number;
  takerBuyQuoteVolume?: number;
  isFinal: boolean;
}

export type TimeFrame = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

export interface ExchangeOhlcvConfig {
  name: string;
  restUrl: string;
  wsUrl: string;
  timeframeMap: Record<TimeFrame, string>;
  formatSymbol: (symbol: string, marketType: string) => string;
  parseKlines: (data: unknown, symbol: string, timeframe: string) => OhlcvCandle[];
  getKlinesUrl: (symbol: string, timeframe: string, limit: number, startTime?: number, endTime?: number) => string;
  wsSubscribe: (symbol: string, timeframe: string) => string;
  parseWsMessage: (data: unknown) => OhlcvCandle | null;
}

// ==================== EXCHANGE CONFIGURATIONS ====================

const BINANCE_SPOT_CONFIG: ExchangeOhlcvConfig = {
  name: "Binance Spot",
  restUrl: "https://api.binance.com",
  wsUrl: "wss://stream.binance.com:9443/ws",
  timeframeMap: {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w"
  },
  formatSymbol: (symbol: string) => symbol.toUpperCase(),
  parseKlines: (data: unknown, symbol: string, timeframe: string): OhlcvCandle[] => {
    const klines = data as Array<[number, string, string, string, string, string, number, string, number, string, string, string]>;
    return klines.map(k => ({
      symbol,
      exchange: "binance",
      marketType: "spot" as const,
      timeframe,
      openTime: new Date(k[0]),
      closeTime: new Date(k[6]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[7]),
      trades: k[8],
      takerBuyVolume: parseFloat(k[9]),
      takerBuyQuoteVolume: parseFloat(k[10]),
      isFinal: true,
    }));
  },
  getKlinesUrl: (symbol: string, timeframe: string, limit: number, startTime?: number, endTime?: number) => {
    let url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${timeframe}&limit=${limit}`;
    if (startTime) url += `&startTime=${startTime}`;
    if (endTime) url += `&endTime=${endTime}`;
    return url;
  },
  wsSubscribe: (symbol: string, timeframe: string) => JSON.stringify({
    method: "SUBSCRIBE",
    params: [`${symbol.toLowerCase()}@kline_${timeframe}`],
    id: Date.now()
  }),
  parseWsMessage: (data: unknown): OhlcvCandle | null => {
    const msg = data as { e?: string; s?: string; k?: { t?: number; T?: number; o?: string; h?: string; l?: string; c?: string; v?: string; q?: string; n?: number; V?: string; Q?: string; x?: boolean; i?: string } };
    if (msg.e !== "kline" || !msg.k) return null;
    const k = msg.k;
    return {
      symbol: msg.s || "",
      exchange: "binance",
      marketType: "spot",
      timeframe: k.i || "1m",
      openTime: new Date(k.t || 0),
      closeTime: new Date(k.T || 0),
      open: parseFloat(k.o || "0"),
      high: parseFloat(k.h || "0"),
      low: parseFloat(k.l || "0"),
      close: parseFloat(k.c || "0"),
      volume: parseFloat(k.v || "0"),
      quoteVolume: parseFloat(k.q || "0"),
      trades: k.n,
      takerBuyVolume: parseFloat(k.V || "0"),
      takerBuyQuoteVolume: parseFloat(k.Q || "0"),
      isFinal: k.x || false,
    };
  }
};

const BINANCE_FUTURES_CONFIG: ExchangeOhlcvConfig = {
  name: "Binance Futures",
  restUrl: "https://fapi.binance.com",
  wsUrl: "wss://fstream.binance.com/ws",
  timeframeMap: {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w"
  },
  formatSymbol: (symbol: string) => symbol.toUpperCase(),
  parseKlines: (data: unknown, symbol: string, timeframe: string): OhlcvCandle[] => {
    const klines = data as Array<[number, string, string, string, string, string, number, string, number, string, string, string]>;
    return klines.map(k => ({
      symbol,
      exchange: "binance",
      marketType: "futures" as const,
      timeframe,
      openTime: new Date(k[0]),
      closeTime: new Date(k[6]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[7]),
      trades: k[8],
      takerBuyVolume: parseFloat(k[9]),
      takerBuyQuoteVolume: parseFloat(k[10]),
      isFinal: true,
    }));
  },
  getKlinesUrl: (symbol: string, timeframe: string, limit: number, startTime?: number, endTime?: number) => {
    let url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${timeframe}&limit=${limit}`;
    if (startTime) url += `&startTime=${startTime}`;
    if (endTime) url += `&endTime=${endTime}`;
    return url;
  },
  wsSubscribe: (symbol: string, timeframe: string) => JSON.stringify({
    method: "SUBSCRIBE",
    params: [`${symbol.toLowerCase()}@kline_${timeframe}`],
    id: Date.now()
  }),
  parseWsMessage: (data: unknown): OhlcvCandle | null => {
    const msg = data as { e?: string; s?: string; k?: { t?: number; T?: number; o?: string; h?: string; l?: string; c?: string; v?: string; q?: string; n?: number; V?: string; Q?: string; x?: boolean; i?: string } };
    if (msg.e !== "kline" || !msg.k) return null;
    const k = msg.k;
    return {
      symbol: msg.s || "",
      exchange: "binance",
      marketType: "futures",
      timeframe: k.i || "1m",
      openTime: new Date(k.t || 0),
      closeTime: new Date(k.T || 0),
      open: parseFloat(k.o || "0"),
      high: parseFloat(k.h || "0"),
      low: parseFloat(k.l || "0"),
      close: parseFloat(k.c || "0"),
      volume: parseFloat(k.v || "0"),
      quoteVolume: parseFloat(k.q || "0"),
      trades: k.n,
      takerBuyVolume: parseFloat(k.V || "0"),
      takerBuyQuoteVolume: parseFloat(k.Q || "0"),
      isFinal: k.x || false,
    };
  }
};

const BYBIT_CONFIG: ExchangeOhlcvConfig = {
  name: "Bybit",
  restUrl: "https://api.bybit.com",
  wsUrl: "wss://stream.bybit.com/v5/public/linear",
  timeframeMap: {
    "1m": "1", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "4h": "240", "1d": "D", "1w": "W"
  },
  formatSymbol: (symbol: string) => symbol.toUpperCase(),
  parseKlines: (data: unknown, symbol: string, timeframe: string): OhlcvCandle[] => {
    const response = data as { result?: { list?: Array<[string, string, string, string, string, string]> } };
    const klines = response.result?.list || [];
    return klines.map(k => ({
      symbol,
      exchange: "bybit",
      marketType: "futures" as const,
      timeframe,
      openTime: new Date(parseInt(k[0])),
      closeTime: new Date(parseInt(k[0]) + getTimeframeMs(timeframe)),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      isFinal: true,
    }));
  },
  getKlinesUrl: (symbol: string, timeframe: string, limit: number, startTime?: number, endTime?: number) => {
    const bybitTf = BYBIT_CONFIG.timeframeMap[timeframe as TimeFrame] || "60";
    let url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol.toUpperCase()}&interval=${bybitTf}&limit=${limit}`;
    if (startTime) url += `&start=${startTime}`;
    if (endTime) url += `&end=${endTime}`;
    return url;
  },
  wsSubscribe: (symbol: string, timeframe: string) => JSON.stringify({
    op: "subscribe",
    args: [`kline.${BYBIT_CONFIG.timeframeMap[timeframe as TimeFrame] || "60"}.${symbol.toUpperCase()}`]
  }),
  parseWsMessage: (data: unknown): OhlcvCandle | null => {
    const msg = data as { topic?: string; data?: { start?: number; end?: number; open?: string; high?: string; low?: string; close?: string; volume?: string; confirm?: boolean }[] };
    if (!msg.topic?.includes("kline") || !msg.data?.[0]) return null;
    const k = msg.data[0];
    const symbol = msg.topic.split(".").pop() || "";
    return {
      symbol,
      exchange: "bybit",
      marketType: "futures",
      timeframe: msg.topic.split(".")[1] || "60",
      openTime: new Date(k.start || 0),
      closeTime: new Date(k.end || 0),
      open: parseFloat(k.open || "0"),
      high: parseFloat(k.high || "0"),
      low: parseFloat(k.low || "0"),
      close: parseFloat(k.close || "0"),
      volume: parseFloat(k.volume || "0"),
      isFinal: k.confirm || false,
    };
  }
};

const OKX_CONFIG: ExchangeOhlcvConfig = {
  name: "OKX",
  restUrl: "https://www.okx.com",
  wsUrl: "wss://ws.okx.com:8443/ws/v5/public",
  timeframeMap: {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W"
  },
  formatSymbol: (symbol: string) => symbol.replace("USDT", "-USDT-SWAP"),
  parseKlines: (data: unknown, symbol: string, timeframe: string): OhlcvCandle[] => {
    const response = data as { data?: Array<[string, string, string, string, string, string, string, string, string, string, string, string]> };
    const klines = response.data || [];
    return klines.map(k => ({
      symbol: symbol.replace("-USDT-SWAP", "USDT"),
      exchange: "okx",
      marketType: "futures" as const,
      timeframe,
      openTime: new Date(parseInt(k[0])),
      closeTime: new Date(parseInt(k[0]) + getTimeframeMs(timeframe)),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[6]),
      isFinal: true,
    }));
  },
  getKlinesUrl: (symbol: string, timeframe: string, limit: number, startTime?: number, endTime?: number) => {
    const okxTf = OKX_CONFIG.timeframeMap[timeframe as TimeFrame] || "1H";
    const instId = symbol.replace("USDT", "-USDT-SWAP");
    let url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${okxTf}&limit=${limit}`;
    if (startTime) url += `&before=${startTime}`;
    if (endTime) url += `&after=${endTime}`;
    return url;
  },
  wsSubscribe: (symbol: string, timeframe: string) => JSON.stringify({
    op: "subscribe",
    args: [{ channel: `candle${OKX_CONFIG.timeframeMap[timeframe as TimeFrame] || "1H"}`, instId: symbol.replace("USDT", "-USDT-SWAP") }]
  }),
  parseWsMessage: (data: unknown): OhlcvCandle | null => {
    const msg = data as { arg?: { channel?: string; instId?: string }; data?: Array<[string, string, string, string, string, string, string, string]> };
    if (!msg.arg?.channel?.includes("candle") || !msg.data?.[0]) return null;
    const k = msg.data[0];
    return {
      symbol: msg.arg.instId?.replace("-USDT-SWAP", "USDT") || "",
      exchange: "okx",
      marketType: "futures",
      timeframe: msg.arg.channel.replace("candle", ""),
      openTime: new Date(parseInt(k[0])),
      closeTime: new Date(parseInt(k[0]) + getTimeframeMs(msg.arg.channel.replace("candle", ""))),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[6]),
      isFinal: true,
    };
  }
};

const BITGET_CONFIG: ExchangeOhlcvConfig = {
  name: "Bitget",
  restUrl: "https://api.bitget.com",
  wsUrl: "wss://ws.bitget.com/v2/ws/public",
  timeframeMap: {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W"
  },
  formatSymbol: (symbol: string) => symbol.toUpperCase(),
  parseKlines: (data: unknown, symbol: string, timeframe: string): OhlcvCandle[] => {
    const response = data as { data?: Array<[number, string, string, string, string, string, string]> };
    const klines = response.data || [];
    return klines.map(k => ({
      symbol,
      exchange: "bitget",
      marketType: "futures" as const,
      timeframe,
      openTime: new Date(k[0]),
      closeTime: new Date(k[0] + getTimeframeMs(timeframe)),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[6]),
      isFinal: true,
    }));
  },
  getKlinesUrl: (symbol: string, timeframe: string, limit: number, startTime?: number, endTime?: number) => {
    const bitgetTf = BITGET_CONFIG.timeframeMap[timeframe as TimeFrame] || "1H";
    let url = `https://api.bitget.com/api/v2/mix/market/candles?productType=USDT-FUTURES&symbol=${symbol.toUpperCase()}&granularity=${bitgetTf}&limit=${limit}`;
    if (startTime) url += `&startTime=${startTime}`;
    if (endTime) url += `&endTime=${endTime}`;
    return url;
  },
  wsSubscribe: (symbol: string, timeframe: string) => JSON.stringify({
    op: "subscribe",
    args: [{ instType: "USDT-FUTURES", channel: `candle${BITGET_CONFIG.timeframeMap[timeframe as TimeFrame] || "1H"}`, instId: symbol.toUpperCase() }]
  }),
  parseWsMessage: (data: unknown): OhlcvCandle | null => {
    const msg = data as { arg?: { channel?: string; instId?: string }; data?: Array<[string, string, string, string, string, string, string]> };
    if (!msg.arg?.channel?.includes("candle") || !msg.data?.[0]) return null;
    const k = msg.data[0];
    return {
      symbol: msg.arg.instId || "",
      exchange: "bitget",
      marketType: "futures",
      timeframe: msg.arg.channel.replace("candle", ""),
      openTime: new Date(parseInt(k[0])),
      closeTime: new Date(parseInt(k[0]) + getTimeframeMs(msg.arg.channel.replace("candle", ""))),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      quoteVolume: parseFloat(k[6]),
      isFinal: true,
    };
  }
};

const KUCOIN_CONFIG: ExchangeOhlcvConfig = {
  name: "KuCoin",
  restUrl: "https://api-futures.kucoin.com",
  wsUrl: "wss://ws-api.kucoin.com",
  timeframeMap: {
    "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
    "1h": "1hour", "4h": "4hour", "1d": "1day", "1w": "1week"
  },
  formatSymbol: (symbol: string) => symbol.toUpperCase(),
  parseKlines: (data: unknown, symbol: string, timeframe: string): OhlcvCandle[] => {
    const response = data as { data?: Array<[number, string, string, string, string, string]> };
    const klines = response.data || [];
    return klines.map(k => ({
      symbol,
      exchange: "kucoin",
      marketType: "futures" as const,
      timeframe,
      openTime: new Date(k[0]),
      closeTime: new Date(k[0] + getTimeframeMs(timeframe)),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      isFinal: true,
    }));
  },
  getKlinesUrl: (symbol: string, timeframe: string, limit: number, startTime?: number, endTime?: number) => {
    const kucoinTf = KUCOIN_CONFIG.timeframeMap[timeframe as TimeFrame] || "1hour";
    let url = `https://api-futures.kucoin.com/api/v1/kline/query?symbol=${symbol.toUpperCase()}&granularity=${kucoinTf}&limit=${limit}`;
    if (startTime) url += `&from=${startTime}`;
    if (endTime) url += `&to=${endTime}`;
    return url;
  },
  wsSubscribe: (symbol: string, timeframe: string) => JSON.stringify({
    id: Date.now(),
    type: "subscribe",
    topic: `/market/candles:${symbol.toUpperCase()}_${KUCOIN_CONFIG.timeframeMap[timeframe as TimeFrame] || "1hour"}`
  }),
  parseWsMessage: (data: unknown): OhlcvCandle | null => {
    const msg = data as { topic?: string; data?: { candles?: string[] } };
    if (!msg.topic?.includes("candles") || !msg.data?.candles) return null;
    const k = msg.data.candles;
    const symbol = msg.topic.split(":")[1]?.split("_")[0] || "";
    return {
      symbol,
      exchange: "kucoin",
      marketType: "futures",
      timeframe: msg.topic.split("_")[1] || "1hour",
      openTime: new Date(parseInt(k[0])),
      closeTime: new Date(parseInt(k[0]) + getTimeframeMs(msg.topic.split("_")[1] || "1hour")),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      isFinal: true,
    };
  }
};

// Exchange config map
const EXCHANGE_CONFIGS: Record<string, ExchangeOhlcvConfig> = {
  "binance_spot": BINANCE_SPOT_CONFIG,
  "binance_futures": BINANCE_FUTURES_CONFIG,
  "binance": BINANCE_FUTURES_CONFIG,
  "bybit": BYBIT_CONFIG,
  "okx": OKX_CONFIG,
  "bitget": BITGET_CONFIG,
  "kucoin": KUCOIN_CONFIG,
};

// ==================== HELPER FUNCTIONS ====================

function getTimeframeMs(timeframe: string): number {
  const tfMap: Record<string, number> = {
    "1m": 60000, "5m": 300000, "15m": 900000, "30m": 1800000,
    "1h": 3600000, "4h": 14400000, "1d": 86400000, "1w": 604800000,
    "1": 60000, "5": 300000, "15": 900000, "30": 1800000,
    "60": 3600000, "240": 14400000, "D": 86400000, "W": 604800000,
    "1H": 3600000, "4H": 14400000, "1D": 86400000, "1W": 604800000,
    "1min": 60000, "5min": 300000, "15min": 900000, "30min": 1800000,
    "1hour": 3600000, "4hour": 14400000, "1day": 86400000, "1week": 604800000,
  };
  return tfMap[timeframe] || 3600000; // Default to 1h
}

function getConfigKey(exchange: string, marketType: string): string {
  if (exchange === "binance" && marketType === "spot") return "binance_spot";
  if (exchange === "binance" && marketType === "futures") return "binance_futures";
  return exchange;
}

// ==================== API FUNCTIONS ====================

/**
 * Fetch historical OHLCV candles from exchange
 */
export async function fetchOhlcvFromExchange(params: {
  symbol: string;
  exchange: string;
  marketType?: "spot" | "futures" | "inverse";
  timeframe?: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
}): Promise<OhlcvCandle[]> {
  const { symbol, exchange, marketType = "futures", timeframe = "1h", limit = 500, startTime, endTime } = params;
  
  const configKey = getConfigKey(exchange, marketType);
  const config = EXCHANGE_CONFIGS[configKey];
  
  if (!config) {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }
  
  try {
    const url = config.getKlinesUrl(symbol, timeframe, limit, startTime, endTime);
    const response = await fetch(url);
    const data = await response.json();
    
    return config.parseKlines(data, symbol, timeframe);
  } catch (error) {
    console.error(`Failed to fetch OHLCV from ${exchange}:`, error);
    return [];
  }
}

/**
 * Store OHLCV candles in database
 */
export async function storeOhlcvCandles(candles: OhlcvCandle[]): Promise<number> {
  let stored = 0;
  
  for (const candle of candles) {
    try {
      await db.ohlcvCandle.upsert({
        where: {
          symbol_exchange_timeframe_openTime: {
            symbol: candle.symbol,
            exchange: candle.exchange,
            timeframe: candle.timeframe,
            openTime: candle.openTime,
          }
        },
        update: {
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          quoteVolume: candle.quoteVolume,
          trades: candle.trades,
          takerBuyVolume: candle.takerBuyVolume,
          takerBuyQuoteVolume: candle.takerBuyQuoteVolume,
          isFinal: candle.isFinal,
        },
        create: {
          symbol: candle.symbol,
          exchange: candle.exchange,
          marketType: candle.marketType,
          timeframe: candle.timeframe,
          openTime: candle.openTime,
          closeTime: candle.closeTime,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          quoteVolume: candle.quoteVolume,
          trades: candle.trades,
          takerBuyVolume: candle.takerBuyVolume,
          takerBuyQuoteVolume: candle.takerBuyQuoteVolume,
          isFinal: candle.isFinal,
        }
      });
      stored++;
    } catch (error) {
      // Ignore duplicate key errors
    }
  }
  
  return stored;
}

/**
 * Sync historical candles for a symbol
 */
export async function syncOhlcvHistory(params: {
  symbol: string;
  exchange: string;
  marketType?: "spot" | "futures" | "inverse";
  timeframe?: string;
  days?: number;
}): Promise<{ success: boolean; candlesStored: number; error?: string }> {
  const { symbol, exchange, marketType = "futures", timeframe = "1h", days = 30 } = params;
  
  // Check/update sync status
  const existingSync = await db.exchangeSyncStatus.findUnique({
    where: {
      exchange_symbol_marketType_timeframe: {
        exchange,
        symbol,
        marketType,
        timeframe,
      }
    }
  });
  
  if (existingSync?.isSyncing) {
    return { success: false, candlesStored: 0, error: "Sync already in progress" };
  }
  
  // Mark as syncing
  await db.exchangeSyncStatus.upsert({
    where: {
      exchange_symbol_marketType_timeframe: {
        exchange,
        symbol,
        marketType,
        timeframe,
      }
    },
    update: { isSyncing: true },
    create: {
      exchange,
      symbol,
      marketType,
      timeframe,
      isSyncing: true,
    }
  });
  
  try {
    const now = Date.now();
    const startTime = existingSync?.lastCandleTime?.getTime() || now - days * 24 * 60 * 60 * 1000;
    
    // Fetch candles
    const candles = await fetchOhlcvFromExchange({
      symbol,
      exchange,
      marketType,
      timeframe,
      limit: 1000,
      startTime,
    });
    
    // Store candles
    const stored = await storeOhlcvCandles(candles);
    
    // Update sync status
    const lastCandle = candles[candles.length - 1];
    await db.exchangeSyncStatus.update({
      where: {
        exchange_symbol_marketType_timeframe: {
          exchange,
          symbol,
          marketType,
          timeframe,
        }
      },
      data: {
        isSyncing: false,
        lastSyncTime: new Date(),
        lastCandleTime: lastCandle?.openTime,
        candlesCount: { increment: stored },
      }
    });
    
    return { success: true, candlesStored: stored };
  } catch (error) {
    // Update error status
    await db.exchangeSyncStatus.update({
      where: {
        exchange_symbol_marketType_timeframe: {
          exchange,
          symbol,
          marketType,
          timeframe,
        }
      },
      data: {
        isSyncing: false,
        lastError: error instanceof Error ? error.message : "Unknown error",
      }
    });
    
    return { success: false, candlesStored: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Get OHLCV candles from database
 */
export async function getOhlvcCandles(params: {
  symbol: string;
  exchange?: string;
  timeframe?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}): Promise<OhlcvCandle[]> {
  const { symbol, exchange = "binance", timeframe = "1h", startTime, endTime, limit = 500 } = params;
  
  const where: {
    symbol: string;
    exchange?: string;
    timeframe?: string;
    openTime?: { gte?: Date; lte?: Date };
  } = { symbol };
  
  if (exchange) where.exchange = exchange;
  if (timeframe) where.timeframe = timeframe;
  if (startTime || endTime) {
    where.openTime = {};
    if (startTime) where.openTime.gte = startTime;
    if (endTime) where.openTime.lte = endTime;
  }
  
  const candles = await db.ohlcvCandle.findMany({
    where,
    orderBy: { openTime: "asc" },
    take: limit,
  });
  
  return candles.map(c => ({
    symbol: c.symbol,
    exchange: c.exchange,
    marketType: c.marketType as "spot" | "futures" | "inverse",
    timeframe: c.timeframe,
    openTime: c.openTime,
    closeTime: c.closeTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    quoteVolume: c.quoteVolume || undefined,
    trades: c.trades || undefined,
    takerBuyVolume: c.takerBuyVolume || undefined,
    takerBuyQuoteVolume: c.takerBuyQuoteVolume || undefined,
    isFinal: c.isFinal,
  }));
}

/**
 * Get aggregated daily stats
 */
export async function getDailyStats(params: {
  symbol: string;
  exchange?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<Array<{
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  avgFundingRate: number | null;
}>> {
  const { symbol, exchange = "binance", startDate, endDate } = params;
  
  // Get 1d candles
  const candles = await getOhlvcCandles({
    symbol,
    exchange,
    timeframe: "1d",
    startTime: startDate,
    endTime: endDate,
    limit: 365,
  });
  
  // Get funding rates for the same period
  const fundingRates = await db.fundingRateHistory.findMany({
    where: {
      symbol,
      exchange,
      fundingTime: {
        gte: startDate,
        lte: endDate,
      }
    },
    orderBy: { fundingTime: "asc" }
  });
  
  // Group funding by day
  const fundingByDay = new Map<string, { total: number; count: number }>();
  for (const f of fundingRates) {
    const day = f.fundingTime.toISOString().split("T")[0];
    const existing = fundingByDay.get(day) || { total: 0, count: 0 };
    existing.total += f.fundingRate;
    existing.count++;
    fundingByDay.set(day, existing);
  }
  
  // Combine data
  return candles.map(c => {
    const day = c.openTime.toISOString().split("T")[0];
    const funding = fundingByDay.get(day);
    return {
      date: c.openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      avgFundingRate: funding ? funding.total / funding.count : null,
    };
  });
}

// ==================== EXPORTS ====================

export { EXCHANGE_CONFIGS };
