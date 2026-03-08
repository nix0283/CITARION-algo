"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// Types
export type ExchangeId = "binance" | "bybit" | "okx" | "bitget" | "bingx";
export type TradingMode = "PAPER" | "TESTNET" | "DEMO" | "LIVE";
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface ExchangeConfig {
  exchange: ExchangeId;
  mode: TradingMode;
  credentials?: ExchangeCredentials;
}

export interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnL: number;
  leverage: number;
  liquidationPrice?: number;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

export interface UseBotExchangeOptions {
  botId?: string;
  initialConfig?: ExchangeConfig;
  autoConnect?: boolean;
}

export interface UseBotExchangeReturn {
  // State
  exchange: ExchangeId;
  mode: TradingMode;
  status: ConnectionStatus;
  error: string | null;
  balances: Balance[];
  positions: Position[];
  currentPrice: number | null;
  
  // Actions
  setExchange: (exchange: ExchangeId) => void;
  setMode: (mode: TradingMode) => void;
  setCredentials: (credentials: ExchangeCredentials) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  
  // Trading
  placeOrder: (
    symbol: string,
    side: "BUY" | "SELL",
    type: "MARKET" | "LIMIT",
    amount: number,
    price?: number
  ) => Promise<OrderResult>;
  cancelOrder: (orderId: string) => Promise<OrderResult>;
  closePosition: (symbol: string) => Promise<OrderResult>;
  
  // Data
  fetchBalances: () => Promise<Balance[]>;
  fetchPositions: () => Promise<Position[]>;
  subscribeToPrice: (symbol: string) => void;
  unsubscribeFromPrice: () => void;
  
  // Utils
  isPaperTrading: boolean;
  isTestnet: boolean;
  isLive: boolean;
}

// Exchange WebSocket URLs
const WS_URLS: Record<ExchangeId, { live: string; testnet: string }> = {
  binance: {
    live: "wss://fstream.binance.com/ws",
    testnet: "wss://stream.binancefuture.com/ws"
  },
  bybit: {
    live: "wss://stream.bybit.com/v5/public/linear",
    testnet: "wss://stream-testnet.bybit.com/v5/public/linear"
  },
  okx: {
    live: "wss://ws.okx.com:8443/ws/v5/public",
    testnet: "wss://wspap.okx.com:8443/ws/v5/public?brokerId=9999"
  },
  bitget: {
    live: "wss://ws.bitget.com/v2/ws/public",
    testnet: "wss://ws.bitget.com/v2/ws/public"
  },
  bingx: {
    live: "wss://open-api-ws.bingx.com/market",
    testnet: "wss://open-api-ws.bingx.com/market"
  }
};

export function useBotExchange(options: UseBotExchangeOptions = {}): UseBotExchangeReturn {
  const { botId, initialConfig, autoConnect = false } = options;
  
  // State
  const [exchange, setExchangeState] = useState<ExchangeId>(initialConfig?.exchange || "binance");
  const [mode, setModeState] = useState<TradingMode>(initialConfig?.mode || "PAPER");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [credentials, setCredentialsState] = useState<ExchangeCredentials | undefined>(
    initialConfig?.credentials
  );
  
  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  const priceSymbolRef = useRef<string | null>(null);

  // Computed values
  const isPaperTrading = mode === "PAPER";
  const isTestnet = mode === "TESTNET";
  const isLive = mode === "LIVE";

  // Set exchange
  const setExchange = useCallback((newExchange: ExchangeId) => {
    setExchangeState(newExchange);
    setStatus("disconnected");
    setError(null);
  }, []);

  // Set mode
  const setMode = useCallback((newMode: TradingMode) => {
    setModeState(newMode);
    setStatus("disconnected");
    setError(null);
  }, []);

  // Set credentials
  const setCredentials = useCallback((newCredentials: ExchangeCredentials) => {
    setCredentialsState(newCredentials);
  }, []);

  // Connect
  const connect = useCallback(async (): Promise<boolean> => {
    if (mode === "PAPER") {
      setStatus("connected");
      setBalances([{ asset: "USDT", free: 10000, locked: 0, total: 10000 }]);
      return true;
    }

    if (!credentials?.apiKey || !credentials?.apiSecret) {
      setError("API credentials required for non-paper trading");
      setStatus("error");
      return false;
    }

    setStatus("connecting");
    setError(null);

    try {
      const response = await fetch("/api/exchange/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          mode,
          ...credentials
        })
      });

      const data = await response.json();

      if (data.success) {
        setStatus("connected");
        return true;
      } else {
        setError(data.error || "Connection failed");
        setStatus("error");
        return false;
      }
    } catch (err) {
      setError("Failed to connect to exchange");
      setStatus("error");
      return false;
    }
  }, [exchange, mode, credentials]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
    setBalances([]);
    setPositions([]);
    setCurrentPrice(null);
  }, []);

  // Place order
  const placeOrder = useCallback(async (
    symbol: string,
    side: "BUY" | "SELL",
    type: "MARKET" | "LIMIT",
    amount: number,
    price?: number
  ): Promise<OrderResult> => {
    if (status !== "connected") {
      return { success: false, error: "Not connected to exchange" };
    }

    if (mode === "PAPER") {
      // Simulate order execution
      const orderId = `paper-${Date.now()}`;
      return { success: true, orderId };
    }

    try {
      const response = await fetch("/api/exchange/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          mode,
          symbol,
          side,
          type,
          amount,
          price,
          ...credentials
        })
      });

      const data = await response.json();
      return data;
    } catch (err) {
      return { success: false, error: "Failed to place order" };
    }
  }, [exchange, mode, credentials, status]);

  // Cancel order
  const cancelOrder = useCallback(async (orderId: string): Promise<OrderResult> => {
    if (mode === "PAPER") {
      return { success: true, orderId };
    }

    try {
      const response = await fetch("/api/exchange/order", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          mode,
          orderId,
          ...credentials
        })
      });

      const data = await response.json();
      return data;
    } catch (err) {
      return { success: false, error: "Failed to cancel order" };
    }
  }, [exchange, mode, credentials]);

  // Close position
  const closePosition = useCallback(async (symbol: string): Promise<OrderResult> => {
    if (mode === "PAPER") {
      const position = positions.find(p => p.symbol === symbol);
      if (position) {
        setPositions(prev => prev.filter(p => p.symbol !== symbol));
      }
      return { success: true, orderId: `close-${Date.now()}` };
    }

    try {
      const response = await fetch("/api/exchange/position/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          mode,
          symbol,
          ...credentials
        })
      });

      const data = await response.json();
      return data;
    } catch (err) {
      return { success: false, error: "Failed to close position" };
    }
  }, [exchange, mode, credentials, positions]);

  // Fetch balances
  const fetchBalances = useCallback(async (): Promise<Balance[]> => {
    if (mode === "PAPER") {
      return balances;
    }

    try {
      const response = await fetch("/api/exchange/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          mode,
          ...credentials
        })
      });

      const data = await response.json();
      if (data.success) {
        setBalances(data.balances);
        return data.balances;
      }
      return [];
    } catch (err) {
      return [];
    }
  }, [exchange, mode, credentials, balances]);

  // Fetch positions
  const fetchPositions = useCallback(async (): Promise<Position[]> => {
    if (mode === "PAPER") {
      return positions;
    }

    try {
      const response = await fetch("/api/exchange/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          mode,
          ...credentials
        })
      });

      const data = await response.json();
      if (data.success) {
        setPositions(data.positions);
        return data.positions;
      }
      return [];
    } catch (err) {
      return [];
    }
  }, [exchange, mode, credentials, positions]);

  // Subscribe to price
  const subscribeToPrice = useCallback((symbol: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    priceSymbolRef.current = symbol;

    // For paper trading, simulate price updates
    if (mode === "PAPER") {
      const interval = setInterval(() => {
        setCurrentPrice(prev => {
          const base = prev || 50000;
          const change = (Math.random() - 0.5) * base * 0.001;
          return base + change;
        });
      }, 1000);

      return () => clearInterval(interval);
    }

    // For real exchanges, use WebSocket
    const wsUrl = mode === "TESTNET" ? WS_URLS[exchange].testnet : WS_URLS[exchange].live;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe to ticker
        const subscribeMsg = getSubscribeMessage(exchange, symbol);
        ws.send(JSON.stringify(subscribeMsg));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const price = parsePriceFromMessage(exchange, data);
        if (price) {
          setCurrentPrice(price);
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch (err) {
      setError("Failed to connect to price stream");
    }
  }, [exchange, mode]);

  // Unsubscribe from price
  const unsubscribeFromPrice = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    priceSymbolRef.current = null;
    setCurrentPrice(null);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && status === "disconnected") {
      // Use queueMicrotask to defer state update outside render phase
      queueMicrotask(() => {
        connect();
      });
    }
  }, [autoConnect, status, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    exchange,
    mode,
    status,
    error,
    balances,
    positions,
    currentPrice,
    setExchange,
    setMode,
    setCredentials,
    connect,
    disconnect,
    placeOrder,
    cancelOrder,
    closePosition,
    fetchBalances,
    fetchPositions,
    subscribeToPrice,
    unsubscribeFromPrice,
    isPaperTrading,
    isTestnet,
    isLive
  };
}

// Helper functions for WebSocket message handling
function getSubscribeMessage(exchange: ExchangeId, symbol: string): object {
  const lowerSymbol = symbol.toLowerCase();
  
  switch (exchange) {
    case "binance":
      return { method: "SUBSCRIBE", params: [`${lowerSymbol}@ticker`], id: Date.now() };
    case "bybit":
      return { op: "subscribe", args: [`tickers.${symbol}`] };
    case "okx":
      return { op: "subscribe", args: [{ channel: "tickers", instId: symbol }] };
    case "bitget":
      return { op: "subscribe", args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: symbol }] };
    case "bingx":
      return { id: Date.now(), reqType: "sub", dataType: `${lowerSymbol}@ticker` };
    default:
      return {};
  }
}

function parsePriceFromMessage(exchange: ExchangeId, data: any): number | null {
  try {
    switch (exchange) {
      case "binance":
        return data.p ? parseFloat(data.p) : null;
      case "bybit":
        return data.data?.lastPrice ? parseFloat(data.data.lastPrice) : null;
      case "okx":
        return data.data?.[0]?.last ? parseFloat(data.data[0].last) : null;
      case "bitget":
        return data.data?.last ? parseFloat(data.data.last) : null;
      case "bingx":
        return data.data?.lastPrice ? parseFloat(data.data.lastPrice) : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export default useBotExchange;
