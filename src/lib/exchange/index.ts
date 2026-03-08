/**
 * Exchange Client Factory
 * 
 * Creates exchange clients based on exchange ID and configuration
 * Supports LIVE, TESTNET, and DEMO trading modes
 * 
 * ACTIVE EXCHANGES: Binance, Bybit, OKX, Bitget, BingX
 * DISABLED: KuCoin, Coinbase, Huobi, HyperLiquid, BitMEX, BloFin, Aster, Gate.io
 */

import { 
  ApiCredentials, 
  MarketType, 
  ExchangeId,
  AllExchangeId,
  TradingMode,
  EXCHANGE_CONFIGS,
} from "./types";
import { BaseExchangeClient } from "./base-client";

// ============================================================
// ACTIVE EXCHANGE CLIENTS
// ============================================================
import { BinanceClient } from "./binance-client";
import { BybitClient } from "./bybit-client";
import { OKXClient } from "./okx-client";
import { BitgetClient } from "./bitget-client";
import { BingxClient } from "./bingx-client";

// ============================================================
// DISABLED EXCHANGE CLIENTS (uncomment to enable)
// ============================================================
// import { KucoinClient } from "./kucoin-client";
// import { HuobiClient } from "./huobi-client";
// import { HyperliquidClient } from "./hyperliquid-client";
// import { BitmexClient } from "./bitmex-client";
// import { BlofinClient } from "./blofin-client";
// import { CoinbaseClient } from "./coinbase-client";
// import { AsterClient } from "./aster-client";

export interface ExchangeClientOptions {
  credentials: ApiCredentials;
  marketType?: MarketType;
  testnet?: boolean;
  tradingMode?: TradingMode;
}

/**
 * Create an exchange client for the specified exchange
 * Supports both active and disabled exchanges (for internal use)
 */
export function createExchangeClient(
  exchangeId: AllExchangeId,
  options: ExchangeClientOptions
): BaseExchangeClient {
  const { credentials, marketType = "futures", testnet = false, tradingMode } = options;
  
  // Check if exchange is active
  const isActiveExchange = (id: string): id is ExchangeId => {
    return id in EXCHANGE_CONFIGS;
  };

  // Get config for active exchanges, or use defaults for disabled
  const config = isActiveExchange(exchangeId) ? EXCHANGE_CONFIGS[exchangeId] : null;
  
  // Determine actual trading mode
  let actualMode: TradingMode;
  if (tradingMode) {
    actualMode = tradingMode;
  } else if (testnet) {
    actualMode = "TESTNET";
  } else {
    actualMode = "LIVE";
  }
  
  // Validate trading mode is supported (only for active exchanges)
  if (config) {
    if (actualMode === "TESTNET" && !config.hasTestnet) {
      console.warn(`[Exchange] ${exchangeId} does not support testnet, using production`);
      actualMode = "LIVE";
    }
    
    if (actualMode === "DEMO" && !config.hasDemo) {
      console.warn(`[Exchange] ${exchangeId} does not support demo mode, using production`);
      actualMode = "LIVE";
    }
    
    // Check if market type is supported
    if (!config.markets.includes(marketType)) {
      throw new Error(`${exchangeId} does not support ${marketType} trading. Supported: ${config.markets.join(", ")}`);
    }
    
    // Check if passphrase is required
    if (config.requiresPassphrase && !credentials.passphrase) {
      throw new Error(`${exchangeId} requires a passphrase`);
    }
  }

  // Create appropriate client
  const useTestnet = actualMode === "TESTNET";
  
  // ============================================================
  // ACTIVE EXCHANGES
  // ============================================================
  switch (exchangeId) {
    case "binance":
      return new BinanceClient(credentials, marketType, useTestnet, actualMode);
    
    case "bybit":
      return new BybitClient(credentials, marketType, useTestnet, actualMode);
    
    case "okx":
      return new OKXClient(credentials, marketType, false, actualMode);
    
    case "bitget":
      return new BitgetClient(credentials, marketType, false, actualMode === "DEMO");
    
    case "bingx":
      return new BingxClient(credentials, marketType, false, actualMode === "DEMO");
    
    // ============================================================
    // DISABLED EXCHANGES (uncomment to enable)
    // ============================================================
    /*
    case "kucoin":
      return new KucoinClient(credentials, marketType, useTestnet, actualMode);
    
    case "huobi":
      return new HuobiClient(credentials, marketType, useTestnet, actualMode);
    
    case "hyperliquid":
      return new HyperliquidClient(credentials, marketType, useTestnet, actualMode);
    
    case "bitmex":
      return new BitmexClient(credentials, marketType, useTestnet, actualMode);
    
    case "blofin":
      return new BlofinClient(credentials, marketType, false, actualMode);
    
    case "coinbase":
      return new CoinbaseClient(credentials, marketType, useTestnet, actualMode);
    
    case "aster":
      return new AsterClient(credentials, marketType, useTestnet, actualMode);
    */
    
    default:
      throw new Error(`Unsupported exchange: ${exchangeId}`);
  }
}

/**
 * Get list of supported exchanges (active only)
 */
export function getSupportedExchanges(): ExchangeId[] {
  return Object.keys(EXCHANGE_CONFIGS) as ExchangeId[];
}

/**
 * Get exchange configuration
 */
export function getExchangeConfig(exchangeId: ExchangeId) {
  return EXCHANGE_CONFIGS[exchangeId];
}

/**
 * Get exchange client (wrapper for createExchangeClient)
 * Accepts a single options object for convenience
 */
export function getExchangeClient(options: ExchangeClientOptions & { exchangeId: ExchangeId }): BaseExchangeClient {
  const { exchangeId, ...clientOptions } = options;
  return createExchangeClient(exchangeId, clientOptions);
}

/**
 * Check if exchange supports a specific market type
 */
export function supportsMarketType(exchangeId: ExchangeId, marketType: MarketType): boolean {
  return EXCHANGE_CONFIGS[exchangeId].markets.includes(marketType);
}

/**
 * Check if exchange has testnet
 */
export function hasTestnet(exchangeId: ExchangeId): boolean {
  return EXCHANGE_CONFIGS[exchangeId].hasTestnet;
}

/**
 * Check if exchange has demo mode
 */
export function hasDemoMode(exchangeId: ExchangeId): boolean {
  return EXCHANGE_CONFIGS[exchangeId].hasDemo;
}

/**
 * Get all exchanges that support a specific trading mode
 */
export function getExchangesByMode(mode: TradingMode): ExchangeId[] {
  return Object.entries(EXCHANGE_CONFIGS)
    .filter(([_, config]) => {
      if (mode === "TESTNET") return config.hasTestnet;
      if (mode === "DEMO") return config.hasDemo;
      return true; // All support LIVE
    })
    .map(([id]) => id as ExchangeId);
}

/**
 * Get trading mode info for exchange
 */
export function getTradingModeInfo(exchangeId: ExchangeId): {
  hasLive: boolean;
  hasTestnet: boolean;
  hasDemo: boolean;
  testnetConfig?: typeof EXCHANGE_CONFIGS[ExchangeId]["testnetConfig"];
  demoConfig?: typeof EXCHANGE_CONFIGS[ExchangeId]["demoConfig"];
} {
  const config = EXCHANGE_CONFIGS[exchangeId];
  return {
    hasLive: true,
    hasTestnet: config.hasTestnet,
    hasDemo: config.hasDemo,
    testnetConfig: config.testnetConfig,
    demoConfig: config.demoConfig,
  };
}

// Re-export types and configs
export * from "./types";
export { BaseExchangeClient } from "./base-client";

// ============================================================
// ACTIVE EXCHANGE CLIENT EXPORTS
// ============================================================
export { BinanceClient } from "./binance-client";
export { BybitClient } from "./bybit-client";
export { OKXClient } from "./okx-client";
export { BitgetClient } from "./bitget-client";
export { BingxClient } from "./bingx-client";

// ============================================================
// DISABLED EXCHANGE CLIENT EXPORTS (uncomment to enable)
// ============================================================
// export { KucoinClient } from "./kucoin-client";
// export { HuobiClient } from "./huobi-client";
// export { HyperliquidClient } from "./hyperliquid-client";
// export { BitmexClient } from "./bitmex-client";
// export { BlofinClient } from "./blofin-client";
// export { CoinbaseClient } from "./coinbase-client";
// export { AsterClient } from "./aster-client";

// Re-export API monitor
export * from "./api-monitor";

// Re-export circuit breaker
export {
  ExchangeCircuitBreaker,
  CircuitBreakerOpenError,
  circuitBreakerManager,
  type ExchangeCircuitBreakerConfig,
  type CircuitBreakerState as ExchangeCircuitBreakerState,
} from "./exchange-circuit-breaker";
