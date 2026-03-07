import { usePriceContext } from "@/components/providers/price-provider";
import { usePriceWebSocket, type PriceSource, type ConnectionStatus } from "@/lib/price-websocket";
import type { MarketPrice } from "@/types";

/**
 * Get real-time price for a single symbol
 * Uses the unified price context from PriceProvider
 */
export function useRealtimePrice(symbol: string): MarketPrice | null {
  const { prices } = usePriceContext();
  return prices[symbol] || null;
}

/**
 * Get all real-time prices
 */
export function useAllRealtimePrices(): Record<string, MarketPrice> {
  const { prices } = usePriceContext();
  return prices;
}

/**
 * Get 24h price change for a symbol
 */
export function usePriceChange(symbol: string): { 
  change: number; 
  direction: "up" | "down" | "neutral" 
} {
  const price = useRealtimePrice(symbol);
  
  if (!price) {
    return { change: 0, direction: "neutral" };
  }

  return {
    change: price.change24h,
    direction: price.change24h > 0 ? "up" : price.change24h < 0 ? "down" : "neutral",
  };
}

/**
 * Get formatted price string
 */
export function useFormattedPrice(symbol: string): string {
  const price = useRealtimePrice(symbol);
  
  if (!price) return "---";
  
  return price.price.toLocaleString("en-US", {
    minimumFractionDigits: price.price >= 1 ? 2 : 4,
    maximumFractionDigits: price.price >= 1 ? 2 : 6,
  });
}

/**
 * Get formatted change percentage
 */
export function useFormattedChange(symbol: string): string {
  const { change } = usePriceChange(symbol);
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Get prices for specific symbols
 */
export function usePricesBySymbols(symbols: string[]): Record<string, MarketPrice> {
  const prices = useAllRealtimePrices();
  
  const result: Record<string, MarketPrice> = {};
  symbols.forEach(symbol => {
    if (prices[symbol]) {
      result[symbol] = prices[symbol];
    }
  });
  
  return result;
}

/**
 * Get top performers (best and worst 24h change)
 */
export function useTopPerformers(count = 3): {
  best: MarketPrice[];
  worst: MarketPrice[];
} {
  const prices = useAllRealtimePrices();
  
  const sorted = Object.values(prices).sort((a, b) => b.change24h - a.change24h);
  
  return {
    best: sorted.slice(0, count),
    worst: sorted.slice(-count).reverse(),
  };
}

/**
 * Calculate portfolio value from holdings
 */
export function usePortfolioValue(holdings: Record<string, number>): {
  total: number;
  breakdown: Record<string, { amount: number; value: number; price: number }>;
} {
  const prices = useAllRealtimePrices();
  
  const breakdown: Record<string, { amount: number; value: number; price: number }> = {};
  let total = 0;
  
  Object.entries(holdings).forEach(([symbol, amount]) => {
    const priceSymbol = symbol === "USDT" ? null : `${symbol}USDT`;
    const price = priceSymbol ? prices[priceSymbol]?.price || 0 : 1;
    const value = amount * price;
    
    breakdown[symbol] = { amount, value, price };
    total += value;
  });
  
  return { total, breakdown };
}

/**
 * Get price trend direction
 */
export function usePriceTrend(symbol: string): "up" | "down" | "neutral" {
  const { direction } = usePriceChange(symbol);
  return direction;
}

/**
 * Get Tailwind color class based on price change
 */
export function usePriceColor(symbol: string): string {
  const { direction } = usePriceChange(symbol);
  
  switch (direction) {
    case "up":
      return "text-green-500";
    case "down":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Get connection status for all exchanges
 */
export function useConnectionStatuses(): Record<PriceSource, ConnectionStatus> {
  const { statuses } = usePriceContext();
  return statuses;
}

/**
 * Get active price source
 */
export function useActivePriceSource(): { 
  source: PriceSource; 
  setSource: (source: PriceSource) => void;
} {
  const { activeSource, setActiveSource } = usePriceContext();
  
  return {
    source: activeSource,
    setSource: setActiveSource,
  };
}

/**
 * Get prices from specific exchange
 */
export function usePricesFromExchange(source: PriceSource): Record<string, MarketPrice> {
  const { getPricesBySource } = usePriceContext();
  return getPricesBySource(source);
}

/**
 * Get exchange connection info
 */
export function useExchangeConnectionInfo(): {
  connectedCount: number;
  totalCount: number;
  connectionStatus: ConnectionStatus;
  statuses: Record<PriceSource, ConnectionStatus>;
  exchangeNames: Record<PriceSource, string>;
} {
  const { connectedCount, connectionStatus, statuses, sources, exchangeNames } = usePriceContext();
  
  return {
    connectedCount,
    totalCount: sources.length,
    connectionStatus,
    statuses,
    exchangeNames,
  };
}

/**
 * Hook for direct WebSocket connection (standalone, not using PriceProvider)
 * Use this when you need WebSocket prices outside of PriceProvider context
 */
export function useStandalonePrices(symbols: string[] = ["BTCUSDT", "ETHUSDT"]) {
  return usePriceWebSocket(symbols);
}
