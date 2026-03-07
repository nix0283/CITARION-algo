import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketPrice } from "@/types";

// ==================== EXCHANGE CONFIGURATION ====================

export type PriceSource = 
  | "binance" 
  | "bybit" 
  | "okx" 
  | "bitget" 
  | "kucoin" 
  | "bingx" 
  | "coinbase" 
  | "huobi" 
  | "hyperliquid" 
  | "bitmex" 
  | "blofin" 
  | "gate"
  | "aster";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface ExchangeWsConfig {
  name: string;
  spotWsUrl: string;
  futuresWsUrl: string;
  requiresGzip: boolean;
  requiresToken: boolean;      // KuCoin needs token via REST
  pingType: "client" | "server"; // Who initiates ping
  pingInterval: number;        // Seconds
  formatSymbol: (symbol: string, isFutures: boolean) => string;
  buildSubscribe: (symbols: string[], isFutures: boolean) => string | object;
  parseMessage: (data: unknown) => { symbol: string; price: MarketPrice } | null;
  buildPing: () => string | object;
}

// ==================== EXCHANGE CONFIGS ====================

const EXCHANGE_WS_CONFIGS: Record<PriceSource, ExchangeWsConfig> = {
  // ============ BINANCE ============
  binance: {
    name: "Binance",
    spotWsUrl: "wss://stream.binance.com:9443/stream",
    futuresWsUrl: "wss://fstream.binance.com/stream",
    requiresGzip: false,
    requiresToken: false,
    pingType: "server",
    pingInterval: 180, // 3 minutes
    formatSymbol: (symbol) => symbol.toLowerCase(),
    buildSubscribe: (symbols) => JSON.stringify({
      method: "SUBSCRIBE",
      params: symbols.map(s => `${s.toLowerCase()}@ticker`),
      id: Date.now()
    }),
    parseMessage: (data) => {
      const msg = data as { 
        stream?: string; 
        data?: { s: string; c: string; P: string; h: string; l: string; v: string; p: string } 
      };
      if (!msg.data) return null;
      const d = msg.data;
      return {
        symbol: d.s,
        price: {
          symbol: d.s,
          price: parseFloat(d.c),
          change24h: parseFloat(d.P),
          high24h: parseFloat(d.h),
          low24h: parseFloat(d.l),
          volume24h: parseFloat(d.v) * parseFloat(d.p || d.c),
        }
      };
    },
    buildPing: () => JSON.stringify({ pong: Date.now() }),
  },

  // ============ BYBIT ============
  bybit: {
    name: "Bybit",
    spotWsUrl: "wss://stream.bybit.com/v5/public/spot",
    futuresWsUrl: "wss://stream.bybit.com/v5/public/linear",
    requiresGzip: false,
    requiresToken: false,
    pingType: "client",
    pingInterval: 20,
    formatSymbol: (symbol) => symbol.toUpperCase(),
    buildSubscribe: (symbols) => JSON.stringify({
      op: "subscribe",
      args: symbols.map(s => `tickers.${s}`)
    }),
    parseMessage: (data) => {
      const msg = data as { 
        topic?: string; 
        data?: { s: string; lp: string; p24hPcnt?: string; h24h?: string; l24h?: string; v24h?: string } 
      };
      if (!msg.topic?.includes("tickers") || !msg.data) return null;
      const d = msg.data;
      if (!d.s || !d.lp) return null;
      return {
        symbol: d.s,
        price: {
          symbol: d.s,
          price: parseFloat(d.lp),
          change24h: (parseFloat(d.p24hPcnt || "0")) * 100,
          high24h: parseFloat(d.h24h || "0"),
          low24h: parseFloat(d.l24h || "0"),
          volume24h: parseFloat(d.v24h || "0"),
        }
      };
    },
    buildPing: () => JSON.stringify({ op: "ping" }),
  },

  // ============ OKX ============
  okx: {
    name: "OKX",
    spotWsUrl: "wss://ws.okx.com:8443/ws/v5/public",
    futuresWsUrl: "wss://ws.okx.com:8443/ws/v5/public",
    requiresGzip: false,
    requiresToken: false,
    pingType: "client",
    pingInterval: 25,
    formatSymbol: (symbol) => symbol.replace("USDT", "-USDT"),
    buildSubscribe: (symbols) => JSON.stringify({
      op: "subscribe",
      args: symbols.map(s => ({
        channel: "tickers",
        instId: s.replace("USDT", "-USDT")
      }))
    }),
    parseMessage: (data) => {
      const msg = data as { 
        arg?: { channel: string; instId: string }; 
        data?: Array<{ instId?: string; last?: string; open24h?: string; high24h?: string; low24h?: string; vol24h?: string }> 
      };
      if (!msg.data?.[0] || msg.arg?.channel !== "tickers") return null;
      const d = msg.data[0];
      const symbol = (msg.arg?.instId || d.instId || "").replace("-", "");
      const last = parseFloat(d.last || "0");
      const open = parseFloat(d.open24h || last.toString());
      return {
        symbol,
        price: {
          symbol,
          price: last,
          change24h: open > 0 ? ((last - open) / open) * 100 : 0,
          high24h: parseFloat(d.high24h || "0"),
          low24h: parseFloat(d.low24h || "0"),
          volume24h: parseFloat(d.vol24h || "0"),
        }
      };
    },
    buildPing: () => "ping",
  },

  // ============ BITGET ============
  bitget: {
    name: "Bitget",
    spotWsUrl: "wss://ws.bitget.com/v2/ws/public",
    futuresWsUrl: "wss://ws.bitget.com/v2/ws/public",
    requiresGzip: false,
    requiresToken: false,
    pingType: "client",
    pingInterval: 30,
    formatSymbol: (symbol) => symbol.toUpperCase(),
    buildSubscribe: (symbols, isFutures) => JSON.stringify({
      op: "subscribe",
      args: symbols.map(s => ({
        instType: isFutures ? "USDT-FUTURES" : "SPOT",
        channel: "ticker",
        instId: s
      }))
    }),
    parseMessage: (data) => {
      const msg = data as { 
        arg?: { instId: string }; 
        data?: { close: string; open24h: string; high24h: string; low24h: string; baseVolume: string } 
      };
      if (!msg.data || !msg.arg) return null;
      const d = msg.data;
      const symbol = msg.arg.instId;
      const close = parseFloat(d.close || "0");
      const open = parseFloat(d.open24h || close.toString());
      return {
        symbol,
        price: {
          symbol,
          price: close,
          change24h: open > 0 ? ((close - open) / open) * 100 : 0,
          high24h: parseFloat(d.high24h || "0"),
          low24h: parseFloat(d.low24h || "0"),
          volume24h: parseFloat(d.baseVolume || "0"),
        }
      };
    },
    buildPing: () => "ping",
  },

  // ============ KUCOIN ============
  kucoin: {
    name: "KuCoin",
    spotWsUrl: "", // Dynamic - requires token via REST
    futuresWsUrl: "", // Dynamic - requires token via REST
    requiresGzip: false,
    requiresToken: true,
    pingType: "client",
    pingInterval: 30,
    formatSymbol: (symbol) => symbol.toUpperCase(),
    buildSubscribe: (symbols) => JSON.stringify({
      id: Date.now(),
      type: "subscribe",
      topic: `/market/ticker:${symbols.join(",")}`,
      response: true
    }),
    parseMessage: (data) => {
      const msg = data as { 
        subject?: string; 
        data?: { symbol: string; price: string; changePrice: string; high: string; low: string; vol: string } 
      };
      if (msg.subject !== "trade.ticker" || !msg.data) return null;
      const d = msg.data;
      return {
        symbol: d.symbol,
        price: {
          symbol: d.symbol,
          price: parseFloat(d.price),
          change24h: parseFloat(d.changePrice || "0"),
          high24h: parseFloat(d.high || "0"),
          low24h: parseFloat(d.low || "0"),
          volume24h: parseFloat(d.vol || "0"),
        }
      };
    },
    buildPing: () => JSON.stringify({ id: Date.now(), type: "pong" }),
  },

  // ============ BINGX ============
  bingx: {
    name: "BingX",
    spotWsUrl: "wss://open-api-ws.bingx.com/market",
    futuresWsUrl: "wss://open-api-swap.bingx.com/ws",
    requiresGzip: true, // IMPORTANT: GZIP compression!
    requiresToken: false,
    pingType: "server",
    pingInterval: 5,
    formatSymbol: (symbol, isFutures) => isFutures ? symbol.toUpperCase() : symbol.replace("USDT", "-USDT"),
    buildSubscribe: (symbols, isFutures) => {
      if (isFutures) {
        return JSON.stringify({
          id: Date.now().toString(),
          reqType: "sub",
          dataType: symbols.map(s => `${s}@ticker`).join(",")
        });
      }
      return JSON.stringify({
        id: Date.now().toString(),
        reqType: "sub",
        dataType: symbols.map(s => `${s.replace("USDT", "-USDT")}@ticker`).join(",")
      });
    },
    parseMessage: (data) => {
      const msg = data as { 
        dataType?: string;
        data?: { 
          symbol?: string; 
          lastPrice?: string; 
          priceChange?: string;
          highPrice?: string;
          lowPrice?: string;
          volume?: string;
        } 
      };
      if (!msg.data || !msg.data.symbol) return null;
      const d = msg.data;
      const symbol = (d.symbol || "").replace("-", "");
      if (!symbol) return null;
      return {
        symbol,
        price: {
          symbol,
          price: parseFloat(d.lastPrice || "0"),
          change24h: parseFloat(d.priceChange || "0"),
          high24h: parseFloat(d.highPrice || "0"),
          low24h: parseFloat(d.lowPrice || "0"),
          volume24h: parseFloat(d.volume || "0"),
        }
      };
    },
    buildPing: () => "Pong",
  },

  // ============ COINBASE ============
  coinbase: {
    name: "Coinbase",
    spotWsUrl: "wss://advanced-trade-ws.coinbase.com",
    futuresWsUrl: "wss://advanced-trade-ws.coinbase.com", // Same for Coinbase
    requiresGzip: false,
    requiresToken: false,
    pingType: "client",
    pingInterval: 30,
    formatSymbol: (symbol) => symbol.replace("USDT", "-USD"),
    buildSubscribe: (symbols) => JSON.stringify({
      type: "subscribe",
      product_ids: symbols.map(s => s.replace("USDT", "-USD")),
      channels: ["ticker", "heartbeats"]
    }),
    parseMessage: (data) => {
      const msg = data as { 
        type?: string;
        product_id?: string;
        price?: string;
        open_24h?: string;
        high_24h?: string;
        low_24h?: string;
        volume_24h?: string;
      };
      if (msg.type !== "ticker" || !msg.product_id) return null;
      const symbol = msg.product_id.replace("-", "USDT").replace("-USD", "USDT");
      const price = parseFloat(msg.price || "0");
      const open = parseFloat(msg.open_24h || price.toString());
      return {
        symbol,
        price: {
          symbol,
          price,
          change24h: open > 0 ? ((price - open) / open) * 100 : 0,
          high24h: parseFloat(msg.high_24h || "0"),
          low24h: parseFloat(msg.low_24h || "0"),
          volume24h: parseFloat(msg.volume_24h || "0"),
        }
      };
    },
    buildPing: () => JSON.stringify({ type: "heartbeat" }),
  },

  // ============ HUOBI (HTX) ============
  huobi: {
    name: "HTX (Huobi)",
    spotWsUrl: "wss://api.huobi.pro/ws",
    futuresWsUrl: "wss://api.hbdm.com/ws",
    requiresGzip: true, // IMPORTANT: GZIP compression!
    requiresToken: false,
    pingType: "server",
    pingInterval: 5,
    formatSymbol: (symbol) => symbol.toLowerCase(),
    buildSubscribe: (symbols) => JSON.stringify({
      sub: `market.${symbols[0].toLowerCase()}.detail`,
      id: Date.now().toString()
    }),
    parseMessage: (data) => {
      const msg = data as { 
        ch?: string;
        tick?: { 
          symbol?: string;
          close?: number;
          open?: number;
          high?: number;
          low?: number;
          vol?: number;
        } 
      };
      if (!msg.ch?.includes(".detail") || !msg.tick) return null;
      const d = msg.tick;
      const symbol = (msg.ch.split(".")[1] || "").toUpperCase();
      const close = d.close || 0;
      const open = d.open || close;
      return {
        symbol,
        price: {
          symbol,
          price: close,
          change24h: open > 0 ? ((close - open) / open) * 100 : 0,
          high24h: d.high || 0,
          low24h: d.low || 0,
          volume24h: d.vol || 0,
        }
      };
    },
    buildPing: () => JSON.stringify({ pong: Date.now() }),
  },

  // ============ HYPERLIQUID ============
  hyperliquid: {
    name: "HyperLiquid",
    spotWsUrl: "wss://api.hyperliquid.xyz/ws",
    futuresWsUrl: "wss://api.hyperliquid.xyz/ws",
    requiresGzip: false,
    requiresToken: false,
    pingType: "client",
    pingInterval: 30,
    formatSymbol: (symbol) => symbol.replace("USDT", ""),
    buildSubscribe: (symbols) => JSON.stringify({
      method: "subscribe",
      subscription: { type: "allMids" }
    }),
    parseMessage: (data) => {
      const msg = data as { 
        channel?: string;
        mids?: Record<string, string>;
      };
      if (msg.channel !== "allMids" || !msg.mids) return null;
      // Return first symbol's price (caller should handle multiple)
      const entries = Object.entries(msg.mids);
      if (entries.length === 0) return null;
      const [coin, priceStr] = entries[0];
      const price = parseFloat(priceStr);
      return {
        symbol: coin + "USDT",
        price: {
          symbol: coin + "USDT",
          price,
          change24h: 0, // HyperLiquid doesn't provide 24h change in mids
          high24h: 0,
          low24h: 0,
          volume24h: 0,
        }
      };
    },
    buildPing: () => JSON.stringify({ method: "ping" }),
  },

  // ============ BITMEX ============
  bitmex: {
    name: "BitMEX",
    spotWsUrl: "wss://www.bitmex.com/realtime",
    futuresWsUrl: "wss://www.bitmex.com/realtime",
    requiresGzip: false,
    requiresToken: false,
    pingType: "server",
    pingInterval: 30,
    formatSymbol: (symbol) => symbol.replace("USDT", "USD"), // XBTUSD, ETHUSD
    buildSubscribe: (symbols) => JSON.stringify({
      op: "subscribe",
      args: symbols.map(s => `instrument:${s.replace("USDT", "USD")}`)
    }),
    parseMessage: (data) => {
      const msg = data as { 
        table?: string;
        data?: Array<{
          symbol?: string;
          lastPrice?: number;
          markPrice?: number;
          highPrice?: number;
          lowPrice?: number;
          volume24h?: number;
        }>;
      };
      if (msg.table !== "instrument" || !msg.data?.[0]) return null;
      const d = msg.data[0];
      if (!d.symbol || !d.lastPrice) return null;
      const symbol = d.symbol.replace("USD", "USDT");
      return {
        symbol,
        price: {
          symbol,
          price: d.lastPrice,
          change24h: 0, // BitMEX doesn't provide in instrument
          high24h: d.highPrice || 0,
          low24h: d.lowPrice || 0,
          volume24h: d.volume24h || 0,
        }
      };
    },
    buildPing: () => "pong",
  },

  // ============ BLOFIN ============
  blofin: {
    name: "BloFin",
    spotWsUrl: "wss://openapi.blofin.com/ws/public",
    futuresWsUrl: "wss://openapi.blofin.com/ws/public",
    requiresGzip: false,
    requiresToken: false,
    pingType: "client",
    pingInterval: 25,
    formatSymbol: (symbol) => symbol.replace("USDT", "-USDT"),
    buildSubscribe: (symbols) => JSON.stringify({
      op: "subscribe",
      args: symbols.map(s => ({
        channel: "tickers",
        instId: s.replace("USDT", "-USDT")
      }))
    }),
    parseMessage: (data) => {
      const msg = data as { 
        arg?: { channel: string; instId: string };
        data?: Array<{
          last?: string;
          open24h?: string;
          high24h?: string;
          low24h?: string;
          vol24h?: string;
        }>;
      };
      if (msg.arg?.channel !== "tickers" || !msg.data?.[0]) return null;
      const d = msg.data[0];
      const symbol = msg.arg.instId.replace("-", "");
      const last = parseFloat(d.last || "0");
      const open = parseFloat(d.open24h || last.toString());
      return {
        symbol,
        price: {
          symbol,
          price: last,
          change24h: open > 0 ? ((last - open) / open) * 100 : 0,
          high24h: parseFloat(d.high24h || "0"),
          low24h: parseFloat(d.low24h || "0"),
          volume24h: parseFloat(d.vol24h || "0"),
        }
      };
    },
    buildPing: () => "ping",
  },

  // ============ GATE.IO ============
  gate: {
    name: "Gate.io",
    spotWsUrl: "wss://api.gateio.ws/ws/v4/",
    futuresWsUrl: "wss://fx-api.gateio.ws/ws/v1/",
    requiresGzip: false,
    requiresToken: false,
    pingType: "client",
    pingInterval: 30,
    formatSymbol: (symbol, isFutures) => isFutures ? symbol : symbol.replace("USDT", "_USDT"),
    buildSubscribe: (symbols, isFutures) => {
      if (isFutures) {
        return JSON.stringify({
          time: Math.floor(Date.now() / 1000),
          channel: "futures.tickers",
          event: "subscribe",
          payload: symbols
        });
      }
      return JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: "spot.tickers",
        event: "subscribe",
        payload: symbols.map(s => s.replace("USDT", "_USDT"))
      });
    },
    parseMessage: (data) => {
      const msg = data as { 
        channel?: string;
        event?: string;
        result?: {
          currency_pair?: string;
          contract?: string;
          last?: string;
          change_percentage?: string;
          high_24h?: string;
          low_24h?: string;
          base_volume?: string;
        };
      };
      if (msg.event !== "update" || !msg.result) return null;
      const d = msg.result;
      const symbol = (d.currency_pair || d.contract || "").replace("_", "").replace("-", "");
      return {
        symbol,
        price: {
          symbol,
          price: parseFloat(d.last || "0"),
          change24h: parseFloat(d.change_percentage || "0"),
          high24h: parseFloat(d.high_24h || "0"),
          low24h: parseFloat(d.low_24h || "0"),
          volume24h: parseFloat(d.base_volume || "0"),
        }
      };
    },
    buildPing: () => JSON.stringify({ method: "server.ping", id: Date.now() }),
  },

  // ============ ASTER DEX (via Orderly Network) ============
  aster: {
    name: "Aster DEX",
    spotWsUrl: "wss://ws.orderly.org/v2/public",
    futuresWsUrl: "wss://ws.orderly.org/v2/public",
    requiresGzip: false,
    requiresToken: false,
    pingType: "client",
    pingInterval: 30,
    formatSymbol: (symbol) => symbol.replace("USDT", "-USDT"),
    buildSubscribe: (symbols) => JSON.stringify({
      id: Date.now().toString(),
      event: "subscribe",
      topic: symbols.map(s => `perp@${s.replace("USDT", "-USDT")}@ticker`).join(",")
    }),
    parseMessage: (data) => {
      const msg = data as { 
        topic?: string;
        data?: {
          symbol?: string;
          last?: string;
          open?: string;
          high?: string;
          low?: string;
          volume?: string;
        };
      };
      if (!msg.topic?.includes("@ticker") || !msg.data) return null;
      const d = msg.data;
      const symbol = (d.symbol || "").replace("-", "");
      const last = parseFloat(d.last || "0");
      const open = parseFloat(d.open || last.toString());
      return {
        symbol,
        price: {
          symbol,
          price: last,
          change24h: open > 0 ? ((last - open) / open) * 100 : 0,
          high24h: parseFloat(d.high || "0"),
          low24h: parseFloat(d.low || "0"),
          volume24h: parseFloat(d.volume || "0"),
        }
      };
    },
    buildPing: () => JSON.stringify({ event: "ping" }),
  },
};

// ==================== KUCOIN TOKEN FETCHER ====================

async function getKuCoinWsToken(isFutures: boolean = false): Promise<{ token: string; endpoint: string } | null> {
  try {
    const baseUrl = isFutures 
      ? "https://api-futures.kucoin.com" 
      : "https://api.kucoin.com";
    
    const response = await fetch(`${baseUrl}/api/v1/bullet-public`, {
      method: "POST",
    });
    
    const data = await response.json() as {
      code?: string;
      data?: {
        token: string;
        instanceServers: Array<{
          endpoint: string;
          pingInterval: number;
        }>;
      };
    };
    
    if (data.code === "200000" && data.data) {
      return {
        token: data.data.token,
        endpoint: data.data.instanceServers[0]?.endpoint || "wss://ws-api-spot.kucoin.com",
      };
    }
    return null;
  } catch (error) {
    console.error("[KuCoin] Failed to get WebSocket token:", error);
    return null;
  }
}

// ==================== GZIP DECOMPRESSION ====================

async function decompressGzip(data: ArrayBuffer): Promise<string> {
  try {
    // Use DecompressionStream if available (modern browsers)
    if (typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("gzip");
      const decompressedStream = new Response(
        new Response(data).body?.pipeThrough(ds)
      );
      return await decompressedStream.text();
    }
    
    // Fallback: assume already decompressed (Node.js environment)
    return new TextDecoder().decode(data);
  } catch (error) {
    // If decompression fails, try raw text
    return new TextDecoder().decode(data);
  }
}

// ==================== DEFAULT SYMBOLS ====================

const DEFAULT_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT"
];

// ==================== WEBSOCKET CLOSE CODE HELPER ====================

function getCloseReason(code: number): string {
  const reasons: Record<number, string> = {
    1000: "Normal Closure",
    1001: "Going Away",
    1002: "Protocol Error",
    1003: "Unsupported Data",
    1005: "No Status Received",
    1006: "Abnormal Closure",
    1007: "Invalid Frame Payload Data",
    1008: "Policy Violation",
    1009: "Message Too Big",
    1010: "Mandatory Extension",
    1011: "Internal Server Error",
    1012: "Service Restart",
    1013: "Try Again Later",
    1014: "Bad Gateway",
    1015: "TLS Handshake",
  };
  return reasons[code] || "Unknown";
}

// ==================== MULTI-EXCHANGE WEBSOCKET CLASS ====================

class MultiExchangeWebSocket {
  private sockets: Map<PriceSource, WebSocket> = new Map();
  private subscribers: Set<(prices: Record<string, MarketPrice>, source: PriceSource) => void> = new Set();
  private prices: Partial<Record<PriceSource, Record<string, MarketPrice>>> = {};
  private connectionStatus: Map<PriceSource, ConnectionStatus> = new Map();
  private reconnectAttempts: Map<PriceSource, number> = new Map();
  private pingIntervals: Map<PriceSource, NodeJS.Timeout> = new Map();
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private symbols: string[];
  private useFutures: boolean;

  constructor(symbols: string[] = DEFAULT_SYMBOLS, useFutures = true) {
    this.symbols = symbols;
    this.useFutures = useFutures;
  }

  async connect(source: PriceSource): Promise<void> {
    if (this.sockets.has(source) && this.sockets.get(source)?.readyState === WebSocket.OPEN) {
      return;
    }

    const config = EXCHANGE_WS_CONFIGS[source];
    if (!config) {
      console.error(`Unknown exchange: ${source}`);
      return;
    }

    this.connectionStatus.set(source, "connecting");

    // Handle KuCoin dynamic token
    let wsUrl = this.useFutures ? config.futuresWsUrl : config.spotWsUrl;
    if (config.requiresToken) {
      const tokenData = await getKuCoinWsToken(this.useFutures);
      if (!tokenData) {
        console.error(`[${config.name}] Failed to get WebSocket token`);
        this.connectionStatus.set(source, "error");
        this.handleReconnect(source);
        return;
      }
      wsUrl = `${tokenData.endpoint}?token=${tokenData.token}`;
    }

    if (!wsUrl) {
      console.error(`[${config.name}] No WebSocket URL configured`);
      this.connectionStatus.set(source, "error");
      return;
    }

    try {
      const ws = new WebSocket(wsUrl);
      
      ws.binaryType = "arraybuffer"; // For GZIP decompression
      
      ws.onopen = () => {
        console.log(`[${config.name}] WebSocket connected`);
        this.connectionStatus.set(source, "connected");
        this.reconnectAttempts.set(source, 0);
        
        // Send subscription
        const subscribeMsg = config.buildSubscribe(this.symbols, this.useFutures);
        ws.send(typeof subscribeMsg === "string" ? subscribeMsg : JSON.stringify(subscribeMsg));
        
        // Setup ping interval for client-initiated pings
        if (config.pingType === "client") {
          this.startPingInterval(source, ws);
        }
      };

      ws.onmessage = async (event) => {
        try {
          let data: unknown;
          
          // Handle GZIP compressed data
          if (config.requiresGzip && event.data instanceof ArrayBuffer) {
            const decompressed = await decompressGzip(event.data);
            data = JSON.parse(decompressed);
          } else if (typeof event.data === "string") {
            data = JSON.parse(event.data);
          } else {
            data = JSON.parse(new TextDecoder().decode(event.data));
          }

          // Handle ping/pong
          if (this.isPingMessage(source, data)) {
            this.handlePing(source, ws, data);
            return;
          }

          const result = config.parseMessage(data);
          if (result) {
            this.updatePrice(source, result.symbol, result.price);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onclose = (event) => {
        const reason = event.reason || getCloseReason(event.code);
        console.log(`[${config.name}] WebSocket disconnected: ${reason} (code: ${event.code})`);
        this.connectionStatus.set(source, "disconnected");
        this.sockets.delete(source);
        this.stopPingInterval(source);
        this.handleReconnect(source);
      };

      ws.onerror = (error) => {
        // WebSocket error events often have empty details in browsers
        // This is normal - check onclose for actual error reason
        console.warn(`[${config.name}] WebSocket connection error (will attempt reconnect)`);
        this.connectionStatus.set(source, "error");
      };

      this.sockets.set(source, ws);
    } catch (error) {
      console.error(`Failed to connect to ${config.name}:`, error);
      this.connectionStatus.set(source, "error");
      this.handleReconnect(source);
    }
  }

  private isPingMessage(source: PriceSource, data: unknown): boolean {
    switch (source) {
      case "binance":
        return !!(data as { ping?: number }).ping;
      case "bybit":
        return (data as { op?: string }).op === "pong";
      case "okx":
      case "bitget":
      case "blofin":
      case "gate":
        return data === "pong";
      case "bingx":
        return typeof data === "string" && data.toLowerCase().includes("ping");
      case "huobi":
        return !!(data as { ping?: number }).ping;
      case "bitmex":
        return data === "ping";
      case "kucoin":
        return (data as { type?: string }).type === "ping";
      case "hyperliquid":
        return (data as { channel?: string }).channel === "pong";
      case "aster":
        return (data as { event?: string }).event === "pong";
      default:
        return false;
    }
  }

  private handlePing(source: PriceSource, ws: WebSocket, data: unknown): void {
    const config = EXCHANGE_WS_CONFIGS[source];
    const pingResponse = config.buildPing();
    
    if (typeof pingResponse === "string") {
      ws.send(pingResponse);
    } else {
      ws.send(JSON.stringify(pingResponse));
    }
  }

  private startPingInterval(source: PriceSource, ws: WebSocket): void {
    const config = EXCHANGE_WS_CONFIGS[source];
    this.stopPingInterval(source);
    
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const pingMsg = config.buildPing();
        ws.send(typeof pingMsg === "string" ? pingMsg : JSON.stringify(pingMsg));
      }
    }, config.pingInterval * 1000);
    
    this.pingIntervals.set(source, interval);
  }

  private stopPingInterval(source: PriceSource): void {
    const interval = this.pingIntervals.get(source);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(source);
    }
  }

  private handleReconnect(source: PriceSource): void {
    const attempts = this.reconnectAttempts.get(source) || 0;
    if (attempts < this.maxReconnectAttempts) {
      // Exponential backoff with max delay of 60 seconds
      const delay = Math.min(this.reconnectDelay * Math.pow(2, attempts), 60000);
      console.log(`Reconnecting to ${source} in ${delay}ms (attempt ${attempts + 1})`);
      
      setTimeout(() => {
        this.reconnectAttempts.set(source, attempts + 1);
        this.connect(source);
      }, delay);
    }
  }

  private updatePrice(source: PriceSource, symbol: string, price: MarketPrice): void {
    if (!this.prices[source]) {
      this.prices[source] = {};
    }
    this.prices[source][symbol] = price;
    
    this.subscribers.forEach(callback => {
      callback(this.prices[source] || {}, source);
    });
  }

  subscribe(callback: (prices: Record<string, MarketPrice>, source: PriceSource) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getPrices(source: PriceSource): Record<string, MarketPrice> {
    return this.prices[source] || {};
  }

  getAllPrices(): Record<string, MarketPrice & { source: PriceSource }> {
    const allPrices: Record<string, MarketPrice & { source: PriceSource }> = {};
    
    // Priority: Gate > BloFin > HyperLiquid > BitMEX > Huobi > Coinbase > BingX > KuCoin > Bitget > OKX > Bybit > Binance
    const priority: PriceSource[] = [
      "aster", "blofin", "hyperliquid", "bitmex", "huobi", "coinbase", 
      "bingx", "kucoin", "bitget", "okx", "bybit", "binance", "gate"
    ];
    
    priority.forEach(source => {
      const sourcePrices = this.prices[source];
      if (sourcePrices) {
        Object.entries(sourcePrices).forEach(([symbol, price]) => {
          allPrices[symbol] = { ...price, source };
        });
      }
    });
    
    return allPrices;
  }

  getStatus(source: PriceSource): ConnectionStatus {
    return this.connectionStatus.get(source) || "disconnected";
  }

  getAllStatuses(): Record<PriceSource, ConnectionStatus> {
    const statuses: Record<PriceSource, ConnectionStatus> = {} as Record<PriceSource, ConnectionStatus>;
    Object.keys(EXCHANGE_WS_CONFIGS).forEach((source) => {
      statuses[source as PriceSource] = this.connectionStatus.get(source as PriceSource) || "disconnected";
    });
    return statuses;
  }

  connectAll(): void {
    Object.keys(EXCHANGE_WS_CONFIGS).forEach((source) => {
      this.connect(source as PriceSource);
    });
  }

  disconnect(source: PriceSource): void {
    this.stopPingInterval(source);
    const ws = this.sockets.get(source);
    if (ws) {
      ws.close();
      this.sockets.delete(source);
    }
  }

  disconnectAll(): void {
    this.pingIntervals.forEach((_, source) => this.stopPingInterval(source));
    this.sockets.forEach((ws) => ws.close());
    this.sockets.clear();
  }

  setSymbols(symbols: string[]): void {
    this.symbols = symbols;
    this.sockets.forEach((_, source) => {
      this.disconnect(source);
      this.connect(source);
    });
  }
}

// ==================== SINGLETON & HOOKS ====================

let multiExchangeWs: MultiExchangeWebSocket | null = null;

function getMultiExchangeWs(symbols?: string[], useFutures?: boolean): MultiExchangeWebSocket {
  if (!multiExchangeWs) {
    multiExchangeWs = new MultiExchangeWebSocket(symbols, useFutures);
  }
  return multiExchangeWs;
}

export function useMultiExchangePriceWebSocket(
  sources: PriceSource[] = ["binance", "bybit", "okx"],
  symbols: string[] = DEFAULT_SYMBOLS,
  useFutures = true
) {
  const [prices, setPrices] = useState<Record<string, MarketPrice>>({});
  const [statuses, setStatuses] = useState<Record<PriceSource, ConnectionStatus>>({} as Record<PriceSource, ConnectionStatus>);
  const [activeSource, setActiveSource] = useState<PriceSource>("binance");
  const wsRef = useRef<MultiExchangeWebSocket | null>(null);

  useEffect(() => {
    const ws = getMultiExchangeWs(symbols, useFutures);
    wsRef.current = ws;

    const unsubscribe = ws.subscribe((newPrices, source) => {
      requestAnimationFrame(() => {
        setPrices(ws.getAllPrices());
        setStatuses(ws.getAllStatuses());
      });
    });

    sources.forEach(source => ws.connect(source));

    return () => {
      unsubscribe();
    };
  }, [sources.join(","), symbols.join(","), useFutures]);

  const reconnect = useCallback((source?: PriceSource) => {
    if (wsRef.current) {
      if (source) {
        wsRef.current.disconnect(source);
        wsRef.current.connect(source);
      } else {
        wsRef.current.disconnectAll();
        wsRef.current.connectAll();
      }
    }
  }, []);

  const getPricesBySource = useCallback((source: PriceSource) => {
    return wsRef.current?.getPrices(source) || {};
  }, []);

  return {
    prices,
    statuses,
    activeSource,
    setActiveSource,
    reconnect,
    getPricesBySource,
    sources: Object.keys(EXCHANGE_WS_CONFIGS) as PriceSource[],
    exchangeNames: Object.fromEntries(
      Object.entries(EXCHANGE_WS_CONFIGS).map(([k, v]) => [k, v.name])
    ) as Record<PriceSource, string>,
  };
}

export function usePriceWebSocket(symbols: string[] = DEFAULT_SYMBOLS) {
  const { prices, statuses, reconnect } = useMultiExchangePriceWebSocket(["binance"], symbols);
  
  return {
    prices,
    connectionStatus: statuses["binance"] || "disconnected",
    reconnect: () => reconnect("binance"),
    lastUpdated: new Date(),
  };
}

export { EXCHANGE_WS_CONFIGS };
