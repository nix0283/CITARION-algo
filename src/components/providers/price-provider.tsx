"use client";

import { createContext, useContext, useEffect, useCallback, useState, ReactNode } from "react";
import { 
  useMultiExchangePriceWebSocket,
  type PriceSource,
  type ConnectionStatus,
  EXCHANGE_WS_CONFIGS
} from "@/lib/price-websocket";
import { useCryptoStore } from "@/stores/crypto-store";
import type { MarketPrice } from "@/types";

// Context type
interface PriceContextType {
  prices: Record<string, MarketPrice>;
  statuses: Record<PriceSource, ConnectionStatus>;
  activeSource: PriceSource;
  setActiveSource: (source: PriceSource) => void;
  reconnect: (source?: PriceSource) => void;
  getPricesBySource: (source: PriceSource) => Record<string, MarketPrice>;
  lastUpdated: Date | null;
  sources: PriceSource[];
  exchangeNames: Record<PriceSource, string>;
  // Aggregated connection status
  connectionStatus: ConnectionStatus;
  // Count of connected exchanges
  connectedCount: number;
}

// Create context
const PriceContext = createContext<PriceContextType | null>(null);

// Default symbols
const DEFAULT_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT",
  "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT"
];

// Provider component
export function PriceProvider({ children }: { children: ReactNode }) {
  const { setMarketPrices } = useCryptoStore();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [enabledSources] = useState<PriceSource[]>(["binance", "bybit", "okx"]);

  const {
    prices,
    statuses,
    activeSource,
    setActiveSource,
    reconnect,
    getPricesBySource,
    sources,
    exchangeNames,
  } = useMultiExchangePriceWebSocket(enabledSources, DEFAULT_SYMBOLS, true);

  // Sync with global store
  useEffect(() => {
    if (Object.keys(prices).length > 0) {
      setMarketPrices(prices);
      // Use requestAnimationFrame to avoid synchronous setState
      requestAnimationFrame(() => {
        setLastUpdated(new Date());
      });
    }
  }, [prices, setMarketPrices]);

  // Calculate aggregated status
  const connectionStatus = calculateAggregatedStatus(statuses);
  const connectedCount = Object.values(statuses).filter(s => s === "connected").length;

  return (
    <PriceContext.Provider
      value={{
        prices,
        statuses,
        activeSource,
        setActiveSource,
        reconnect,
        getPricesBySource,
        lastUpdated,
        sources,
        exchangeNames,
        connectionStatus,
        connectedCount,
      }}
    >
      {children}
    </PriceContext.Provider>
  );
}

// Calculate aggregated connection status
function calculateAggregatedStatus(statuses: Record<PriceSource, ConnectionStatus>): ConnectionStatus {
  const statusValues = Object.values(statuses);
  
  if (statusValues.some(s => s === "connected")) {
    return "connected";
  }
  if (statusValues.some(s => s === "connecting")) {
    return "connecting";
  }
  if (statusValues.some(s => s === "error")) {
    return "error";
  }
  return "disconnected";
}

// Hook to use price context
export function usePriceContext() {
  const context = useContext(PriceContext);
  if (!context) {
    throw new Error("usePriceContext must be used within PriceProvider");
  }
  return context;
}

// Connection status indicator component
export function ConnectionStatusIndicator({ 
  showLabel = false,
  showMultiExchange = false 
}: { 
  showLabel?: boolean;
  showMultiExchange?: boolean;
}) {
  const { connectionStatus, statuses, connectedCount, exchangeNames, activeSource } = usePriceContext();

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "text-green-500";
      case "connecting":
        return "text-yellow-500";
      case "error":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case "connected":
        return (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
        );
      case "connecting":
        return (
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse inline-flex h-full w-full rounded-full bg-yellow-400"></span>
          </span>
        );
      case "error":
        return <span className="inline-flex rounded-full h-2 w-2 bg-red-500"></span>;
      default:
        return <span className="inline-flex rounded-full h-2 w-2 bg-gray-500"></span>;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {getStatusIcon()}
        {showLabel && (
          <span className={`text-xs font-medium ${getStatusColor()}`}>
            {connectionStatus === "connected" 
              ? `${connectedCount} connected` 
              : connectionStatus}
          </span>
        )}
      </div>
      
      {showMultiExchange && connectionStatus === "connected" && (
        <div className="flex items-center gap-1">
          {Object.entries(statuses).map(([source, status]) => (
            <span
              key={source}
              className={`text-xs px-1.5 py-0.5 rounded ${
                status === "connected" 
                  ? "bg-green-500/10 text-green-500" 
                  : status === "connecting"
                  ? "bg-yellow-500/10 text-yellow-500"
                  : "bg-gray-500/10 text-gray-500"
              } ${activeSource === source ? "ring-1 ring-primary" : ""}`}
              title={exchangeNames[source as PriceSource]}
            >
              {exchangeNames[source as PriceSource]?.slice(0, 3)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Exchange selector for prices
export function PriceSourceSelector() {
  const { activeSource, setActiveSource, statuses, exchangeNames } = usePriceContext();

  return (
    <div className="flex items-center gap-1">
      {Object.entries(statuses).map(([source, status]) => (
        <button
          key={source}
          onClick={() => setActiveSource(source as PriceSource)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            activeSource === source
              ? "bg-primary text-primary-foreground"
              : status === "connected"
              ? "bg-secondary hover:bg-secondary/80"
              : "bg-muted text-muted-foreground"
          }`}
          disabled={status !== "connected"}
        >
          {exchangeNames[source as PriceSource]}
        </button>
      ))}
    </div>
  );
}
