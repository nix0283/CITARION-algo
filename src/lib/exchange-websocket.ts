/**
 * Unified Exchange WebSocket Module
 * 
 * Supports 13 exchanges with real-time price data:
 * - Binance, Bybit, OKX, Bitget, KuCoin
 * - BingX, Coinbase, Huobi/HTX
 * - HyperLiquid, BitMEX, BloFin, Aster DEX (Orderly)
 * - Gate.io (NEW)
 * 
 * Features:
 * - Public market data (no API key required)
 * - Automatic reconnection with exponential backoff
 * - Heartbeat/Ping-Pong handling
 * - GZIP decompression for BingX, Huobi
 * - Dynamic token fetch for KuCoin
 */

import { EventEmitter } from 'events';
import { inflateSync } from 'zlib';

// ==================== TYPES ====================

export type ExchangeId = 
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
  | "aster"
  | "gate";

export type MarketType = "spot" | "futures" | "inverse";

export interface MarketPrice {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h?: number;
  timestamp: Date;
}

export interface TickerUpdate {
  exchange: ExchangeId;
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  change24h?: number;
  changePercent24h?: number;
  volume24h?: number;
  quoteVolume24h?: number;
  high24h?: number;
  low24h?: number;
  timestamp: Date;
}

export type ConnectionStatus = "connecting" | "connected" | "authenticated" | "disconnected" | "error";

export interface ExchangeWsConfig {
  id: ExchangeId;
  name: string;
  spotWsUrl: string;
  futuresWsUrl: string;
  inverseWsUrl?: string;
  supportsSpot: boolean;
  supportsFutures: boolean;
  supportsInverse: boolean;
  requiresGzip: boolean;
  requiresDynamicToken: boolean; // KuCoin
  pingInterval?: number; // ms
  pongTimeout?: number; // ms
}

// ==================== EXCHANGE CONFIGURATIONS ====================

export const EXCHANGE_WS_CONFIGS: Record<ExchangeId, ExchangeWsConfig> = {
  binance: {
    id: "binance",
    name: "Binance",
    spotWsUrl: "wss://stream.binance.com:9443/stream",
    futuresWsUrl: "wss://fstream.binance.com/stream",
    inverseWsUrl: "wss://dstream.binance.com/stream",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: true,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 180000, // 3 min
  },
  
  bybit: {
    id: "bybit",
    name: "Bybit",
    spotWsUrl: "wss://stream.bybit.com/v5/public/spot",
    futuresWsUrl: "wss://stream.bybit.com/v5/public/linear",
    inverseWsUrl: "wss://stream.bybit.com/v5/public/inverse",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: true,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 20000,
  },
  
  okx: {
    id: "okx",
    name: "OKX",
    spotWsUrl: "wss://ws.okx.com:8443/ws/v5/public",
    futuresWsUrl: "wss://ws.okx.com:8443/ws/v5/public",
    inverseWsUrl: "wss://ws.okx.com:8443/ws/v5/public",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: true,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 25000,
  },
  
  bitget: {
    id: "bitget",
    name: "Bitget",
    spotWsUrl: "wss://ws.bitget.com/v2/ws/public",
    futuresWsUrl: "wss://ws.bitget.com/v2/ws/public",
    inverseWsUrl: "wss://ws.bitget.com/v2/ws/public",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: true,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 30000,
  },
  
  kucoin: {
    id: "kucoin",
    name: "KuCoin",
    // KuCoin requires dynamic token via REST API
    spotWsUrl: "https://api.kucoin.com/api/v1/bullet-public",
    futuresWsUrl: "https://api-futures.kucoin.com/api/v1/bullet-public",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: false,
    requiresGzip: false,
    requiresDynamicToken: true,
    pingInterval: 180000,
  },
  
  bingx: {
    id: "bingx",
    name: "BingX",
    spotWsUrl: "wss://open-api-ws.bingx.com/market",
    futuresWsUrl: "wss://open-api-swap.bingx.com/ws",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: false,
    requiresGzip: true, // Important: BingX uses GZIP compression
    requiresDynamicToken: false,
    pingInterval: 5000,
  },
  
  coinbase: {
    id: "coinbase",
    name: "Coinbase",
    spotWsUrl: "wss://advanced-trade-ws.coinbase.com",
    futuresWsUrl: "",
    supportsSpot: true,
    supportsFutures: false,
    supportsInverse: false,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 30000,
  },
  
  huobi: {
    id: "huobi",
    name: "Huobi/HTX",
    spotWsUrl: "wss://api.huobi.pro/ws",
    futuresWsUrl: "wss://api.hbdm.com/ws",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: false,
    requiresGzip: true, // Important: Huobi uses GZIP compression
    requiresDynamicToken: false,
    pingInterval: 5000,
  },
  
  hyperliquid: {
    id: "hyperliquid",
    name: "HyperLiquid",
    spotWsUrl: "wss://api.hyperliquid.xyz/ws",
    futuresWsUrl: "wss://api.hyperliquid.xyz/ws",
    supportsSpot: false,
    supportsFutures: true,
    supportsInverse: false,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 30000,
  },
  
  bitmex: {
    id: "bitmex",
    name: "BitMEX",
    spotWsUrl: "",
    futuresWsUrl: "",
    inverseWsUrl: "wss://www.bitmex.com/realtime",
    supportsSpot: false,
    supportsFutures: false,
    supportsInverse: true,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 30000,
  },
  
  blofin: {
    id: "blofin",
    name: "BloFin",
    spotWsUrl: "wss://openapi.blofin.com/ws/public",
    futuresWsUrl: "wss://openapi.blofin.com/ws/public",
    supportsSpot: false,
    supportsFutures: true,
    supportsInverse: true,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 25000,
  },
  
  aster: {
    id: "aster",
    name: "Aster DEX",
    // Aster DEX uses Orderly Network infrastructure
    spotWsUrl: "wss://ws.orderly.org/v2/public",
    futuresWsUrl: "wss://ws.orderly.org/v2/public",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: false,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 30000,
  },
  
  gate: {
    id: "gate",
    name: "Gate.io",
    spotWsUrl: "wss://api.gateio.ws/ws/v4/",
    futuresWsUrl: "wss://fx-api.gateio.ws/ws/v1/",
    supportsSpot: true,
    supportsFutures: true,
    supportsInverse: false,
    requiresGzip: false,
    requiresDynamicToken: false,
    pingInterval: 30000,
  },
};

// ==================== EXCHANGE-SPECIFIC HANDLERS ====================

interface MessageHandler {
  subscribe: (ws: WebSocket, symbols: string[], marketType: MarketType) => void;
  parse: (data: unknown, exchange: ExchangeId) => TickerUpdate | null;
  handlePing: (ws: WebSocket, data: unknown) => boolean;
}

const MESSAGE_HANDLERS: Record<ExchangeId, MessageHandler> = {
  binance: {
    subscribe: (ws, symbols) => {
      const streams = symbols.map(s => `${s.toLowerCase()}@ticker`);
      ws.send(JSON.stringify({
        method: "SUBSCRIBE",
        params: streams,
        id: Date.now()
      }));
    },
    parse: (data) => {
      const msg = data as { 
        stream?: string; 
        data?: { 
          s: string; 
          c: string; 
          P: string; 
          h: string; 
          l: string; 
          v: string; 
          q: string;
          p: string;
        } 
      };
      if (!msg.data) return null;
      const d = msg.data;
      return {
        exchange: "binance",
        symbol: d.s,
        price: parseFloat(d.c),
        change24h: parseFloat(d.p),
        changePercent24h: parseFloat(d.P),
        high24h: parseFloat(d.h),
        low24h: parseFloat(d.l),
        volume24h: parseFloat(d.v),
        quoteVolume24h: parseFloat(d.q),
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      const msg = data as { ping?: number };
      if (msg.ping) {
        ws.send(JSON.stringify({ pong: msg.ping }));
        return true;
      }
      return false;
    }
  },
  
  bybit: {
    subscribe: (ws, symbols) => {
      ws.send(JSON.stringify({
        op: "subscribe",
        args: symbols.map(s => `tickers.${s}`)
      }));
    },
    parse: (data) => {
      const msg = data as { 
        topic?: string; 
        data?: { 
          symbol?: string; 
          lastPrice?: string;
          bid1Price?: string;
          ask1Price?: string;
          price24hPcnt?: string;
          volume24h?: string;
          turnover24h?: string;
          highPrice24h?: string;
          lowPrice24h?: string;
        } 
      };
      if (!msg.topic?.includes("tickers") || !msg.data) return null;
      const d = msg.data;
      return {
        exchange: "bybit",
        symbol: d.symbol || "",
        price: parseFloat(d.lastPrice || "0"),
        bid: parseFloat(d.bid1Price || "0"),
        ask: parseFloat(d.ask1Price || "0"),
        changePercent24h: parseFloat(d.price24hPcnt || "0") * 100,
        volume24h: parseFloat(d.volume24h || "0"),
        quoteVolume24h: parseFloat(d.turnover24h || "0"),
        high24h: parseFloat(d.highPrice24h || "0"),
        low24h: parseFloat(d.lowPrice24h || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      const msg = data as { op?: string; data?: { ts?: number } };
      if (msg.op === "ping") {
        ws.send(JSON.stringify({ op: "pong", data: { ts: Date.now() } }));
        return true;
      }
      return false;
    }
  },
  
  okx: {
    subscribe: (ws, symbols) => {
      ws.send(JSON.stringify({
        op: "subscribe",
        args: symbols.map(s => ({
          channel: "tickers",
          instId: s.replace("USDT", "-USDT")
        }))
      }));
    },
    parse: (data) => {
      const msg = data as { 
        arg?: { channel: string; instId: string }; 
        data?: Array<{
          instId?: string;
          last?: string;
          bidPx?: string;
          askPx?: string;
          open24h?: string;
          high24h?: string;
          low24h?: string;
          vol24h?: string;
          volCcy24h?: string;
        }>;
      };
      if (msg.arg?.channel !== "tickers" || !msg.data?.[0]) return null;
      const d = msg.data[0];
      const last = parseFloat(d.last || "0");
      const open = parseFloat(d.open24h || last.toString());
      return {
        exchange: "okx",
        symbol: d.instId?.replace("-", "") || "",
        price: last,
        bid: parseFloat(d.bidPx || "0"),
        ask: parseFloat(d.askPx || "0"),
        change24h: last - open,
        changePercent24h: open > 0 ? ((last - open) / open) * 100 : 0,
        high24h: parseFloat(d.high24h || "0"),
        low24h: parseFloat(d.low24h || "0"),
        volume24h: parseFloat(d.vol24h || "0"),
        quoteVolume24h: parseFloat(d.volCcy24h || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      const msg = data as { op?: string };
      if (msg.op === "ping") {
        ws.send("pong");
        return true;
      }
      return false;
    }
  },
  
  bitget: {
    subscribe: (ws, symbols, marketType) => {
      const instType = marketType === "spot" ? "SPOT" : "USDT-FUTURES";
      ws.send(JSON.stringify({
        op: "subscribe",
        args: symbols.map(s => ({
          instType,
          channel: "ticker",
          instId: s
        }))
      }));
    },
    parse: (data) => {
      const msg = data as { 
        arg?: { channel: string; instId: string }; 
        data?: {
          close?: string;
          open24h?: string;
          high24h?: string;
          low24h?: string;
          baseVolume?: string;
          quoteVolume?: string;
          bidPr?: string;
          askPr?: string;
        };
      };
      if (msg.arg?.channel !== "ticker" || !msg.data) return null;
      const d = msg.data;
      const close = parseFloat(d.close || "0");
      const open = parseFloat(d.open24h || close.toString());
      return {
        exchange: "bitget",
        symbol: msg.arg.instId || "",
        price: close,
        bid: parseFloat(d.bidPr || "0"),
        ask: parseFloat(d.askPr || "0"),
        change24h: close - open,
        changePercent24h: open > 0 ? ((close - open) / open) * 100 : 0,
        high24h: parseFloat(d.high24h || "0"),
        low24h: parseFloat(d.low24h || "0"),
        volume24h: parseFloat(d.baseVolume || "0"),
        quoteVolume24h: parseFloat(d.quoteVolume || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: (ws) => {
      ws.send("pong");
      return true;
    }
  },
  
  kucoin: {
    subscribe: (ws, symbols) => {
      symbols.forEach(symbol => {
        ws.send(JSON.stringify({
          id: Date.now(),
          type: "subscribe",
          topic: `/market/ticker:${symbol}`,
          response: true
        }));
      });
    },
    parse: (data) => {
      const msg = data as { 
        type?: string;
        topic?: string;
        data?: {
          symbol?: string;
          price?: string;
          size?: string;
          bestBid?: string;
          bestAsk?: string;
          high?: string;
          low?: string;
          vol?: string;
          volValue?: string;
          changePrice?: string;
          changeRate?: string;
        };
      };
      if (msg.type !== "message" || !msg.topic?.includes("ticker") || !msg.data) return null;
      const d = msg.data;
      return {
        exchange: "kucoin",
        symbol: d.symbol || "",
        price: parseFloat(d.price || "0"),
        bid: parseFloat(d.bestBid || "0"),
        ask: parseFloat(d.bestAsk || "0"),
        change24h: parseFloat(d.changePrice || "0"),
        changePercent24h: parseFloat(d.changeRate || "0") * 100,
        high24h: parseFloat(d.high || "0"),
        low24h: parseFloat(d.low || "0"),
        volume24h: parseFloat(d.vol || "0"),
        quoteVolume24h: parseFloat(d.volValue || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      const msg = data as { type?: string; id?: number };
      if (msg.type === "ping" && msg.id) {
        ws.send(JSON.stringify({ type: "pong", id: msg.id }));
        return true;
      }
      return false;
    }
  },
  
  bingx: {
    subscribe: (ws, symbols) => {
      symbols.forEach(symbol => {
        ws.send(JSON.stringify({
          id: `sub_${Date.now()}`,
          reqType: "sub",
          dataType: `${symbol}@ticker`
        }));
      });
    },
    parse: (data) => {
      const msg = data as {
        dataType?: string;
        data?: {
          symbol?: string;
          lastPrice?: string;
          openPrice?: string;
          highPrice?: string;
          lowPrice?: string;
          volume?: string;
          quoteVolume?: string;
          bidPrice?: string;
          askPrice?: string;
          priceChange?: string;
          priceChangePercent?: string;
        };
      };
      if (!msg.dataType?.includes("ticker") || !msg.data) return null;
      const d = msg.data;
      return {
        exchange: "bingx",
        symbol: d.symbol || "",
        price: parseFloat(d.lastPrice || "0"),
        bid: parseFloat(d.bidPrice || "0"),
        ask: parseFloat(d.askPrice || "0"),
        change24h: parseFloat(d.priceChange || "0"),
        changePercent24h: parseFloat(d.priceChangePercent || "0"),
        high24h: parseFloat(d.highPrice || "0"),
        low24h: parseFloat(d.lowPrice || "0"),
        volume24h: parseFloat(d.volume || "0"),
        quoteVolume24h: parseFloat(d.quoteVolume || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      const msg = data as { ping?: number | string };
      if (msg.ping) {
        ws.send("Pong");
        return true;
      }
      return false;
    }
  },
  
  coinbase: {
    subscribe: (ws, symbols) => {
      ws.send(JSON.stringify({
        type: "subscribe",
        product_ids: symbols.map(s => s.replace("USDT", "-USD")),
        channels: ["ticker", "heartbeats"]
      }));
    },
    parse: (data) => {
      const msg = data as {
        type?: string;
        product_id?: string;
        price?: string;
        open_24h?: string;
        high_24h?: string;
        low_24h?: string;
        volume_24h?: string;
        best_bid?: string;
        best_ask?: string;
      };
      if (msg.type !== "ticker" || !msg.product_id) return null;
      const price = parseFloat(msg.price || "0");
      const open = parseFloat(msg.open_24h || price.toString());
      return {
        exchange: "coinbase",
        symbol: msg.product_id.replace("-", ""),
        price,
        bid: parseFloat(msg.best_bid || "0"),
        ask: parseFloat(msg.best_ask || "0"),
        change24h: price - open,
        changePercent24h: open > 0 ? ((price - open) / open) * 100 : 0,
        high24h: parseFloat(msg.high_24h || "0"),
        low24h: parseFloat(msg.low_24h || "0"),
        volume24h: parseFloat(msg.volume_24h || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: () => false // Coinbase uses heartbeats channel
  },
  
  huobi: {
    subscribe: (ws, symbols) => {
      symbols.forEach(symbol => {
        ws.send(JSON.stringify({
          sub: `market.${symbol.toLowerCase()}.ticker`,
          id: `id_${Date.now()}`
        }));
      });
    },
    parse: (data) => {
      const msg = data as {
        ch?: string;
        tick?: {
          symbol?: string;
          close?: number;
          open?: number;
          high?: number;
          low?: number;
          vol?: number;
          amount?: number;
          bid?: number;
          ask?: number;
          count?: number;
        };
      };
      if (!msg.ch?.includes("ticker") || !msg.tick) return null;
      const d = msg.tick;
      return {
        exchange: "huobi",
        symbol: (msg.ch.split(".")[1] || "").toUpperCase(),
        price: d.close || 0,
        bid: d.bid || 0,
        ask: d.ask || 0,
        change24h: (d.close || 0) - (d.open || 0),
        changePercent24h: d.open ? ((d.close || 0) - d.open) / d.open * 100 : 0,
        high24h: d.high || 0,
        low24h: d.low || 0,
        volume24h: d.vol || 0,
        quoteVolume24h: d.amount || 0,
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      const msg = data as { ping?: number };
      if (msg.ping) {
        ws.send(JSON.stringify({ pong: msg.ping }));
        return true;
      }
      return false;
    }
  },
  
  hyperliquid: {
    subscribe: (ws, symbols) => {
      symbols.forEach(symbol => {
        ws.send(JSON.stringify({
          method: "subscribe",
          subscription: { type: "l2Book", coin: symbol.replace("USDT", "") }
        }));
      });
    },
    parse: (data) => {
      const msg = data as {
        channel?: string;
        data?: {
          coin?: string;
          levels?: Array<Array<{ px?: string; sz?: string }>>;
        };
      };
      if (msg.channel !== "l2Book" || !msg.data) return null;
      const d = msg.data;
      const bids = d.levels?.[0] || [];
      const asks = d.levels?.[1] || [];
      const bestBid = bids[0]?.px ? parseFloat(bids[0].px) : 0;
      const bestAsk = asks[0]?.px ? parseFloat(asks[0].px) : 0;
      const midPrice = (bestBid + bestAsk) / 2 || bestBid || bestAsk;
      return {
        exchange: "hyperliquid",
        symbol: (d.coin || "") + "USDT",
        price: midPrice,
        bid: bestBid,
        ask: bestAsk,
        timestamp: new Date(),
      };
    },
    handlePing: () => false // HyperLiquid doesn't use standard ping/pong
  },
  
  bitmex: {
    subscribe: (ws, symbols) => {
      ws.send(JSON.stringify({
        op: "subscribe",
        args: symbols.map(s => `instrument:${s}`)
      }));
    },
    parse: (data) => {
      const msg = data as {
        table?: string;
        data?: Array<{
          symbol?: string;
          lastPrice?: number;
          bidPrice?: number;
          askPrice?: number;
          highPrice?: number;
          lowPrice?: number;
          volume24h?: number;
          turnover24h?: number;
          prevClosePrice?: number;
        }>;
      };
      if (msg.table !== "instrument" || !msg.data?.[0]) return null;
      const d = msg.data[0];
      return {
        exchange: "bitmex",
        symbol: d.symbol || "",
        price: d.lastPrice || 0,
        bid: d.bidPrice || 0,
        ask: d.askPrice || 0,
        high24h: d.highPrice || 0,
        low24h: d.lowPrice || 0,
        volume24h: d.volume24h || 0,
        quoteVolume24h: d.turnover24h || 0,
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      if (data === "ping") {
        ws.send("pong");
        return true;
      }
      return false;
    }
  },
  
  blofin: {
    subscribe: (ws, symbols) => {
      ws.send(JSON.stringify({
        op: "subscribe",
        args: symbols.map(s => ({
          channel: "tickers",
          instId: s.replace("USDT", "-USDT")
        }))
      }));
    },
    parse: (data) => {
      const msg = data as {
        arg?: { channel: string; instId: string };
        data?: Array<{
          last?: string;
          open24h?: string;
          high24h?: string;
          low24h?: string;
          vol24h?: string;
          volCcy24h?: string;
          bidPx?: string;
          askPx?: string;
        }>;
      };
      if (msg.arg?.channel !== "tickers" || !msg.data?.[0]) return null;
      const d = msg.data[0];
      const last = parseFloat(d.last || "0");
      const open = parseFloat(d.open24h || last.toString());
      return {
        exchange: "blofin",
        symbol: msg.arg.instId.replace("-", ""),
        price: last,
        bid: parseFloat(d.bidPx || "0"),
        ask: parseFloat(d.askPx || "0"),
        change24h: last - open,
        changePercent24h: open > 0 ? ((last - open) / open) * 100 : 0,
        high24h: parseFloat(d.high24h || "0"),
        low24h: parseFloat(d.low24h || "0"),
        volume24h: parseFloat(d.vol24h || "0"),
        quoteVolume24h: parseFloat(d.volCcy24h || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: (ws) => {
      ws.send("ping");
      return true;
    }
  },
  
  aster: {
    subscribe: (ws, symbols) => {
      symbols.forEach(symbol => {
        ws.send(JSON.stringify({
          id: `sub_${Date.now()}`,
          event: "subscribe",
          topic: `perp@${symbol}@ticker`
        }));
      });
    },
    parse: (data) => {
      const msg = data as {
        topic?: string;
        data?: {
          symbol?: string;
          close?: string;
          open?: string;
          high?: string;
          low?: string;
          volume?: string;
          turnover?: string;
          bid?: string;
          ask?: string;
        };
      };
      if (!msg.topic?.includes("ticker") || !msg.data) return null;
      const d = msg.data;
      const close = parseFloat(d.close || "0");
      const open = parseFloat(d.open || close.toString());
      return {
        exchange: "aster",
        symbol: d.symbol || "",
        price: close,
        bid: parseFloat(d.bid || "0"),
        ask: parseFloat(d.ask || "0"),
        change24h: close - open,
        changePercent24h: open > 0 ? ((close - open) / open) * 100 : 0,
        high24h: parseFloat(d.high || "0"),
        low24h: parseFloat(d.low || "0"),
        volume24h: parseFloat(d.volume || "0"),
        quoteVolume24h: parseFloat(d.turnover || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      const msg = data as { event?: string };
      if (msg.event === "ping") {
        ws.send(JSON.stringify({ event: "pong" }));
        return true;
      }
      return false;
    }
  },
  
  gate: {
    subscribe: (ws, symbols) => {
      ws.send(JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: "spot.tickers",
        event: "subscribe",
        payload: symbols.map(s => s.replace("USDT", "_USDT"))
      }));
    },
    parse: (data) => {
      const msg = data as {
        event?: string;
        channel?: string;
        result?: {
          currency_pair?: string;
          last?: string;
          open_24h?: string;
          high_24h?: string;
          low_24h?: string;
          base_volume_24h?: string;
          quote_volume_24h?: string;
          highest_bid?: string;
          lowest_ask?: string;
        };
      };
      if (msg.event !== "update" || msg.channel !== "spot.tickers" || !msg.result) return null;
      const d = msg.result;
      const last = parseFloat(d.last || "0");
      const open = parseFloat(d.open_24h || last.toString());
      return {
        exchange: "gate",
        symbol: (d.currency_pair || "").replace("_", ""),
        price: last,
        bid: parseFloat(d.highest_bid || "0"),
        ask: parseFloat(d.lowest_ask || "0"),
        change24h: last - open,
        changePercent24h: open > 0 ? ((last - open) / open) * 100 : 0,
        high24h: parseFloat(d.high_24h || "0"),
        low24h: parseFloat(d.low_24h || "0"),
        volume24h: parseFloat(d.base_volume_24h || "0"),
        quoteVolume24h: parseFloat(d.quote_volume_24h || "0"),
        timestamp: new Date(),
      };
    },
    handlePing: (ws, data) => {
      const msg = data as { method?: string };
      if (msg.method === "server.ping") {
        ws.send(JSON.stringify({ method: "server.pong" }));
        return true;
      }
      return false;
    }
  }
};

// ==================== KUCOIN TOKEN FETCHER ====================

interface KuCoinTokenResponse {
  code: string;
  data: {
    instanceServers: Array<{
      endpoint: string;
      pingInterval: number;
      pongTimeout: number;
    }>;
    token: string;
  };
}

async function getKuCoinWebSocketToken(marketType: MarketType): Promise<{ wsUrl: string; pingInterval: number } | null> {
  const baseUrl = marketType === "futures" 
    ? "https://api-futures.kucoin.com" 
    : "https://api.kucoin.com";
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/bullet-public`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const result: KuCoinTokenResponse = await response.json();
    
    if (result.code === "200000" && result.data.instanceServers[0]) {
      const server = result.data.instanceServers[0];
      return {
        wsUrl: `${server.endpoint}?token=${result.data.token}`,
        pingInterval: server.pingInterval
      };
    }
    return null;
  } catch (error) {
    console.error("[KuCoin] Failed to get WebSocket token:", error);
    return null;
  }
}

// ==================== EXCHANGE WEBSOCKET CLASS ====================

export class ExchangeWebSocket extends EventEmitter {
  private exchange: ExchangeId;
  private config: ExchangeWsConfig;
  private handler: MessageHandler;
  private ws: WebSocket | null = null;
  private symbols: string[] = [];
  private marketType: MarketType;
  private status: ConnectionStatus = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 60000; // 60 seconds max
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private prices: Map<string, TickerUpdate> = new Map();
  private lastPongTime: number = 0;
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;
  private readonly PONG_TIMEOUT = 60000; // 60 seconds without pong = reconnect
  
  constructor(exchange: ExchangeId, symbols: string[] = [], marketType: MarketType = "futures") {
    super();
    this.exchange = exchange;
    this.config = EXCHANGE_WS_CONFIGS[exchange];
    this.handler = MESSAGE_HANDLERS[exchange];
    this.symbols = symbols;
    this.marketType = marketType;
  }
  
  async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "connecting") {
      return;
    }
    
    this.status = "connecting";
    this.emit("status", this.status);
    
    let wsUrl: string;
    
    // Special handling for KuCoin (requires dynamic token)
    if (this.config.requiresDynamicToken) {
      const tokenData = await getKuCoinWebSocketToken(this.marketType);
      if (!tokenData) {
        this.status = "error";
        this.emit("status", this.status);
        this.emit("error", "Failed to get KuCoin WebSocket token");
        this.scheduleReconnect();
        return;
      }
      wsUrl = tokenData.wsUrl;
    } else {
      // Select URL based on market type
      if (this.marketType === "futures" && this.config.supportsFutures) {
        wsUrl = this.config.futuresWsUrl;
      } else if (this.marketType === "inverse" && this.config.supportsInverse && this.config.inverseWsUrl) {
        wsUrl = this.config.inverseWsUrl;
      } else {
        wsUrl = this.config.spotWsUrl;
      }
    }
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log(`[${this.config.name}] WebSocket connected`);
        this.status = "connected";
        this.resetReconnectState();
        this.lastPongTime = Date.now();
        this.emit("status", this.status);
        
        // Subscribe to symbols
        if (this.symbols.length > 0) {
          this.handler.subscribe(this.ws!, this.symbols, this.marketType);
        }
        
        // Start ping interval
        this.startPingInterval();
        // Start heartbeat check
        this.startHeartbeatCheck();
      };
      
      this.ws.onmessage = (event) => {
        try {
          // Update last pong time - any message means connection is alive
          this.lastPongTime = Date.now();
          
          // Handle GZIP compression
            let data: unknown;
            if (this.config.requiresGzip && event.data instanceof Buffer) {
              const decompressed = inflateSync(event.data).toString();
              data = JSON.parse(decompressed);
            } else if (typeof event.data === 'string') {
              // Check if it's a plain string like "ping" or "Pong"
              if (event.data === "ping" || event.data === "Pong") {
                this.handler.handlePing(this.ws!, event.data);
                return;
              }
              data = JSON.parse(event.data);
            } else {
              data = event.data;
            }
            
            // Handle ping/pong
            if (this.handler.handlePing(this.ws!, data)) {
              return;
            }
            
            // Parse ticker update
            const update = this.handler.parse(data, this.exchange);
            if (update) {
              this.prices.set(update.symbol, update);
              this.emit("ticker", update);
            }
          } catch (e) {
            // Ignore parse errors
          }
      };
      
      this.ws.onclose = () => {
        console.log(`[${this.config.name}] WebSocket disconnected`);
        this.status = "disconnected";
        this.emit("status", this.status);
        this.stopPingInterval();
        this.stopHeartbeatCheck();
        this.scheduleReconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error(`[${this.config.name}] WebSocket error:`, error);
        this.status = "error";
        this.emit("status", this.status);
        this.emit("error", error);
      };
      
    } catch (error) {
      console.error(`[${this.config.name}] Failed to connect:`, error);
      this.status = "error";
      this.emit("status", this.status);
      this.scheduleReconnect();
    }
  }
  
  private startPingInterval(): void {
    this.stopPingInterval();
    
    const interval = this.config.pingInterval || 30000;
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Exchange-specific ping messages
        switch (this.exchange) {
          case "bybit":
            this.ws.send(JSON.stringify({ op: "ping" }));
            break;
          case "okx":
          case "bitget":
          case "blofin":
            this.ws.send("ping");
            break;
          case "coinbase":
            // Coinbase uses heartbeats channel
            break;
          case "gate":
            this.ws.send(JSON.stringify({ method: "server.ping" }));
            break;
          default:
            // Most exchanges handle ping internally
            break;
        }
      }
    }, interval);
  }
  
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  private startHeartbeatCheck(): void {
    this.stopHeartbeatCheck();
    
    // Check every 10 seconds if we received any message
    this.heartbeatCheckInterval = setInterval(() => {
      const now = Date.now();
      if (now - this.lastPongTime > this.PONG_TIMEOUT) {
        console.warn(`[${this.config.name}] Heartbeat timeout - no message for ${Math.round((now - this.lastPongTime) / 1000)}s`);
        // Force close to trigger reconnect
        if (this.ws) {
          this.ws.close();
        }
      }
    }, 10000);
  }
  
  private stopHeartbeatCheck(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
  }
  
  private scheduleReconnect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Exponential backoff with jitter to prevent thundering herd
      // Using full jitter strategy: delay = random(0, min(cap, base * 2 ^ attempt))
      const exponentialDelay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      const cappedDelay = Math.min(exponentialDelay, this.maxReconnectDelay);
      
      // Full jitter: random between 0 and capped delay
      // This prevents synchronized reconnection attempts across multiple clients
      const jitter = Math.random() * cappedDelay * 0.3; // 30% jitter
      const delay = Math.floor(cappedDelay + jitter);
      
      console.log(`[${this.config.name}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else {
      console.error(`[${this.config.name}] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      this.status = "error";
      this.emit("status", this.status);
      this.emit("error", new Error("Max reconnection attempts reached"));
    }
  }
  
  /**
   * Reset reconnection state (call after successful connection)
   */
  private resetReconnectState(): void {
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
  
  disconnect(): void {
    this.stopPingInterval();
    this.stopHeartbeatCheck();
    
    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Reset reconnection state
    this.resetReconnectState();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = "disconnected";
    this.emit("status", this.status);
  }
  
  setSymbols(symbols: string[]): void {
    this.symbols = symbols;
    if (this.status === "connected" && this.ws) {
      this.handler.subscribe(this.ws, symbols, this.marketType);
    }
  }
  
  getStatus(): ConnectionStatus {
    return this.status;
  }
  
  getPrices(): Map<string, TickerUpdate> {
    return this.prices;
  }
  
  getPrice(symbol: string): TickerUpdate | undefined {
    return this.prices.get(symbol);
  }
}

// ==================== MULTI-EXCHANGE MANAGER ====================

export class MultiExchangeWebSocketManager extends EventEmitter {
  private connections: Map<ExchangeId, ExchangeWebSocket> = new Map();
  private allPrices: Map<string, Map<string, TickerUpdate>> = new Map();
  private defaultSymbols: string[];
  
  constructor(defaultSymbols: string[] = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]) {
    super();
    this.defaultSymbols = defaultSymbols;
  }
  
  connect(exchange: ExchangeId, symbols?: string[], marketType?: MarketType): ExchangeWebSocket {
    if (this.connections.has(exchange)) {
      return this.connections.get(exchange)!;
    }
    
    const ws = new ExchangeWebSocket(
      exchange, 
      symbols || this.defaultSymbols, 
      marketType || "futures"
    );
    
    ws.on("ticker", (update: TickerUpdate) => {
      if (!this.allPrices.has(exchange)) {
        this.allPrices.set(exchange, new Map());
      }
      this.allPrices.get(exchange)!.set(update.symbol, update);
      this.emit("ticker", update);
    });
    
    ws.on("status", (status: ConnectionStatus) => {
      this.emit("status", { exchange, status });
    });
    
    ws.on("error", (error) => {
      this.emit("error", { exchange, error });
    });
    
    this.connections.set(exchange, ws);
    ws.connect();
    
    return ws;
  }
  
  connectAll(symbols?: string[]): void {
    const allExchanges = Object.keys(EXCHANGE_WS_CONFIGS) as ExchangeId[];
    allExchanges.forEach(exchange => {
      const config = EXCHANGE_WS_CONFIGS[exchange];
      // Skip exchanges that don't support the market type
      if (!config.supportsFutures && !config.supportsSpot) return;
      this.connect(exchange, symbols);
    });
  }
  
  disconnect(exchange: ExchangeId): void {
    const ws = this.connections.get(exchange);
    if (ws) {
      ws.disconnect();
      this.connections.delete(exchange);
    }
  }
  
  disconnectAll(): void {
    this.connections.forEach(ws => ws.disconnect());
    this.connections.clear();
  }
  
  getPrices(exchange: ExchangeId): Map<string, TickerUpdate> | undefined {
    return this.allPrices.get(exchange);
  }
  
  getAllPrices(): Map<string, TickerUpdate> {
    // Merge all prices with priority (later exchanges override earlier ones)
    const merged = new Map<string, TickerUpdate>();
    const priority: ExchangeId[] = ["gate", "aster", "blofin", "bitmex", "hyperliquid", "huobi", "coinbase", "bingx", "kucoin", "bitget", "okx", "bybit", "binance"];
    
    priority.forEach(exchange => {
      const prices = this.allPrices.get(exchange);
      if (prices) {
        prices.forEach((update, symbol) => {
          merged.set(symbol, update);
        });
      }
    });
    
    return merged;
  }
  
  getStatus(exchange: ExchangeId): ConnectionStatus | undefined {
    return this.connections.get(exchange)?.getStatus();
  }
  
  getAllStatuses(): Record<ExchangeId, ConnectionStatus> {
    const statuses: Record<ExchangeId, ConnectionStatus> = {} as Record<ExchangeId, ConnectionStatus>;
    this.connections.forEach((ws, exchange) => {
      statuses[exchange] = ws.getStatus();
    });
    return statuses;
  }
}

// ==================== SINGLETON INSTANCE ====================

let managerInstance: MultiExchangeWebSocketManager | null = null;

export function getExchangeWebSocketManager(): MultiExchangeWebSocketManager {
  if (!managerInstance) {
    managerInstance = new MultiExchangeWebSocketManager();
  }
  return managerInstance;
}

// ==================== REACT HOOKS ====================

import { useState, useEffect, useCallback, useRef } from 'react';

export function useExchangePrices(
  exchanges: ExchangeId[] = ["binance", "bybit", "okx"],
  symbols: string[] = ["BTCUSDT", "ETHUSDT"]
) {
  const [prices, setPrices] = useState<Map<string, TickerUpdate>>(new Map());
  const [statuses, setStatuses] = useState<Record<ExchangeId, ConnectionStatus>>({} as Record<ExchangeId, ConnectionStatus>);
  const managerRef = useRef<MultiExchangeWebSocketManager | null>(null);
  
  useEffect(() => {
    const manager = getExchangeWebSocketManager();
    managerRef.current = manager;
    
    const handleTicker = (update: TickerUpdate) => {
      setPrices(prev => {
        const newMap = new Map(prev);
        newMap.set(update.symbol, update);
        return newMap;
      });
    };
    
    const handleStatus = ({ exchange, status }: { exchange: ExchangeId; status: ConnectionStatus }) => {
      setStatuses(prev => ({ ...prev, [exchange]: status }));
    };
    
    manager.on("ticker", handleTicker);
    manager.on("status", handleStatus);
    
    // Connect to specified exchanges
    exchanges.forEach(exchange => {
      manager.connect(exchange, symbols);
    });
    
    return () => {
      manager.off("ticker", handleTicker);
      manager.off("status", handleStatus);
    };
  }, [exchanges.join(","), symbols.join(",")]);
  
  const reconnect = useCallback((exchange: ExchangeId) => {
    if (managerRef.current) {
      managerRef.current.disconnect(exchange);
      managerRef.current.connect(exchange, symbols);
    }
  }, [symbols]);
  
  return {
    prices: Object.fromEntries(prices),
    statuses,
    reconnect,
    exchanges: Object.keys(EXCHANGE_WS_CONFIGS) as ExchangeId[],
    exchangeNames: Object.fromEntries(
      Object.entries(EXCHANGE_WS_CONFIGS).map(([k, v]) => [k, v.name])
    ) as Record<ExchangeId, string>,
  };
}

// Legacy compatibility
export { EXCHANGE_WS_CONFIGS as EXCHANGE_CONFIGS };
