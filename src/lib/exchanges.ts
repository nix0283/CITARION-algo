/**
 * Exchange configuration for GLYDEO Trading Platform
 * 
 * ACTIVE EXCHANGES (5): Binance, Bybit, OKX, Bitget, BingX
 * DISABLED EXCHANGES (8): KuCoin, Coinbase, Huobi, HyperLiquid, BitMEX, BloFin, Aster DEX, Gate.io
 * 
 * All exchanges support:
 * - Real-time data via WebSocket (public, no API key required)
 * - Historical data via REST API
 * - Trading via REST API
 * - Demo/Testnet trading for testing
 */

export type ExchangeType = "spot" | "futures" | "inverse"

export interface ExchangeFee {
  maker: number
  taker: number
}

export interface ExchangeFeatures {
  hedgeMode: boolean
  trailingStop: boolean
  dca: boolean
  testnet: boolean
  demo: boolean
}

export interface Exchange {
  id: string
  displayName: string
  logo?: string
  type: ExchangeType
  fees: ExchangeFee
  features: ExchangeFeatures
  apiBaseUrl: string
  testnetUrl?: string
  demoUrl?: string
  requiresPassphrase: boolean
  requiresUid: boolean
  requiresWallet?: boolean // For DEXs like HyperLiquid, Aster
  wsUrl?: string
  wsTestnetUrl?: string
  gzipCompression?: boolean
}

// ============================================================
// ACTIVE EXCHANGES
// ============================================================

// ==================== BINANCE ====================
// WebSocket: Yes (public without API key)
// Demo: Testnet only (testnet.binance.vision, testnet.binancefuture.com)
// GZIP: No

const BINANCE_SPOT: Exchange = {
  id: "binance",
  displayName: "Binance",
  type: "spot",
  fees: { maker: 0.001, taker: 0.001 },
  features: { hedgeMode: false, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.binance.com",
  testnetUrl: "https://testnet.binance.vision",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://stream.binance.com:9443/stream",
  wsTestnetUrl: "wss://testnet.binance.vision/stream",
  gzipCompression: false,
}

const BINANCE_FUTURES: Exchange = {
  id: "binance",
  displayName: "Binance Futures",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.0005 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://fapi.binance.com",
  testnetUrl: "https://testnet.binancefuture.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://fstream.binance.com/stream",
  wsTestnetUrl: "wss://stream.binancefuture.com/stream",
  gzipCompression: false,
}

const BINANCE_INVERSE: Exchange = {
  id: "binance",
  displayName: "Binance Inverse",
  type: "inverse",
  fees: { maker: 0.0002, taker: 0.0005 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://dapi.binance.com",
  testnetUrl: "https://testnet.binancefuture.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://dstream.binance.com/stream",
  gzipCompression: false,
}

// ==================== BYBIT ====================
// WebSocket: Yes (V5 API, public without API key)
// Demo: Testnet only (api-testnet.bybit.com)
// GZIP: No

const BYBIT_SPOT: Exchange = {
  id: "bybit",
  displayName: "Bybit",
  type: "spot",
  fees: { maker: 0.001, taker: 0.001 },
  features: { hedgeMode: false, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.bybit.com",
  testnetUrl: "https://api-testnet.bybit.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://stream.bybit.com/v5/public/spot",
  wsTestnetUrl: "wss://stream-testnet.bybit.com/v5/public/spot",
  gzipCompression: false,
}

const BYBIT_FUTURES: Exchange = {
  id: "bybit",
  displayName: "Bybit Futures",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.00055 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.bybit.com",
  testnetUrl: "https://api-testnet.bybit.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://stream.bybit.com/v5/public/linear",
  wsTestnetUrl: "wss://stream-testnet.bybit.com/v5/public/linear",
  gzipCompression: false,
}

const BYBIT_INVERSE: Exchange = {
  id: "bybit",
  displayName: "Bybit Inverse",
  type: "inverse",
  fees: { maker: 0.0001, taker: 0.0001 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.bybit.com",
  testnetUrl: "https://api-testnet.bybit.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://stream.bybit.com/v5/public/inverse",
  wsTestnetUrl: "wss://stream-testnet.bybit.com/v5/public/inverse",
  gzipCompression: false,
}

// ==================== OKX ====================
// WebSocket: Yes (public without API key)
// Demo: Yes (x-simulated-trading: 1 header, demo API key required)
// GZIP: No

const OKX_SPOT: Exchange = {
  id: "okx",
  displayName: "OKX",
  type: "spot",
  fees: { maker: 0.0008, taker: 0.001 },
  features: { hedgeMode: false, trailingStop: true, dca: true, testnet: false, demo: true },
  apiBaseUrl: "https://www.okx.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://ws.okx.com:8443/ws/v5/public",
  gzipCompression: false,
}

const OKX_FUTURES: Exchange = {
  id: "okx",
  displayName: "OKX Futures",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.0005 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: false, demo: true },
  apiBaseUrl: "https://www.okx.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://ws.okx.com:8443/ws/v5/public",
  gzipCompression: false,
}

const OKX_INVERSE: Exchange = {
  id: "okx",
  displayName: "OKX Inverse",
  type: "inverse",
  fees: { maker: 0.0002, taker: 0.0005 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: false, demo: true },
  apiBaseUrl: "https://www.okx.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://ws.okx.com:8443/ws/v5/public",
  gzipCompression: false,
}

// ==================== BITGET ====================
// WebSocket: Yes (V2 API, public without API key)
// Demo: Yes (S-prefix symbols, SUSDT currency)
// GZIP: No

const BITGET_SPOT: Exchange = {
  id: "bitget",
  displayName: "Bitget",
  type: "spot",
  fees: { maker: 0.0008, taker: 0.001 },
  features: { hedgeMode: false, trailingStop: true, dca: true, testnet: false, demo: true },
  apiBaseUrl: "https://api.bitget.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://ws.bitget.com/v2/ws/public",
  gzipCompression: false,
}

const BITGET_FUTURES: Exchange = {
  id: "bitget",
  displayName: "Bitget Futures",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.0006 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: false, demo: true },
  apiBaseUrl: "https://api.bitget.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://ws.bitget.com/v2/ws/public",
  gzipCompression: false,
}

const BITGET_INVERSE: Exchange = {
  id: "bitget",
  displayName: "Bitget Inverse",
  type: "inverse",
  fees: { maker: 0.0002, taker: 0.0006 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: false, demo: true },
  apiBaseUrl: "https://api.bitget.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://ws.bitget.com/v2/ws/public",
  gzipCompression: false,
}

// ==================== BINGX ====================
// WebSocket: Yes (public without API key)
// Demo: Yes (VST - Virtual Simulation Token, 100,000 initial balance)
// GZIP: Yes (IMPORTANT: requires decompression)

const BINGX_SPOT: Exchange = {
  id: "bingx",
  displayName: "BingX",
  type: "spot",
  fees: { maker: 0.001, taker: 0.001 },
  features: { hedgeMode: false, trailingStop: true, dca: false, testnet: false, demo: true },
  apiBaseUrl: "https://open-api.bingx.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://open-api-ws.bingx.com/market",
  gzipCompression: true,
}

const BINGX_FUTURES: Exchange = {
  id: "bingx",
  displayName: "BingX Futures",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.0005 },
  features: { hedgeMode: true, trailingStop: true, dca: false, testnet: false, demo: true },
  apiBaseUrl: "https://open-api.bingx.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://open-api-swap.bingx.com/ws",
  gzipCompression: true,
}

// ============================================================
// DISABLED EXCHANGES (Commented out from UI, kept for future)
// Uncomment the sections below to re-enable these exchanges
// ============================================================

/*
// ==================== KUCOIN ====================
// WebSocket: Yes (requires dynamic token via REST API)
// Demo: Testnet only (openapi-sandbox.kucoin.com)
// GZIP: No

const KUCOIN_SPOT: Exchange = {
  id: "kucoin",
  displayName: "KuCoin",
  type: "spot",
  fees: { maker: 0.001, taker: 0.001 },
  features: { hedgeMode: false, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.kucoin.com",
  testnetUrl: "https://openapi-sandbox.kucoin.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://ws-api-spot.kucoin.com", // Dynamic token required
  gzipCompression: false,
}

const KUCOIN_FUTURES: Exchange = {
  id: "kucoin",
  displayName: "KuCoin Futures",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.0006 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api-futures.kucoin.com",
  testnetUrl: "https://openapi-sandbox.kucoin.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://ws-api-futures.kucoin.com", // Dynamic token required
  gzipCompression: false,
}

// ==================== COINBASE ====================
// WebSocket: Yes (public without API key, wss://advanced-trade-ws.coinbase.com)
// Demo: Testnet only (api-public.sandbox.exchange.coinbase.com)
// GZIP: No

const COINBASE_SPOT: Exchange = {
  id: "coinbase",
  displayName: "Coinbase",
  type: "spot",
  fees: { maker: 0.005, taker: 0.005 },
  features: { hedgeMode: false, trailingStop: false, dca: false, testnet: true, demo: false },
  apiBaseUrl: "https://api.exchange.coinbase.com",
  testnetUrl: "https://api-public.sandbox.exchange.coinbase.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://advanced-trade-ws.coinbase.com",
  wsTestnetUrl: "wss://ws-feed-public.sandbox.exchange.coinbase.com",
  gzipCompression: false,
}

// ==================== HUOBI/HTX ====================
// WebSocket: Yes (public without API key)
// Demo: Testnet only
// GZIP: Yes (IMPORTANT: requires decompression)

const HUOBI_SPOT: Exchange = {
  id: "huobi",
  displayName: "HTX (Huobi)",
  type: "spot",
  fees: { maker: 0.002, taker: 0.002 },
  features: { hedgeMode: false, trailingStop: true, dca: false, testnet: true, demo: false },
  apiBaseUrl: "https://api.huobi.pro",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://api.huobi.pro/ws",
  gzipCompression: true,
}

const HUOBI_FUTURES: Exchange = {
  id: "huobi",
  displayName: "HTX Futures",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.0005 },
  features: { hedgeMode: true, trailingStop: true, dca: false, testnet: true, demo: false },
  apiBaseUrl: "https://api.hbdm.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://api.hbdm.com/ws",
  gzipCompression: true,
}

// ==================== HYPERLIQUID ====================
// WebSocket: Yes (public without API key)
// Demo: Testnet only (api.hyperliquid-testnet.xyz)
// GZIP: No
// Auth: Web3 wallet signature (no API keys)

const HYPERLIQUID_FUTURES: Exchange = {
  id: "hyperliquid",
  displayName: "HyperLiquid",
  type: "futures",
  fees: { maker: 0.0001, taker: 0.00025 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.hyperliquid.xyz",
  testnetUrl: "https://api.hyperliquid-testnet.xyz",
  requiresPassphrase: false,
  requiresUid: false,
  requiresWallet: true,
  wsUrl: "wss://api.hyperliquid.xyz/ws",
  wsTestnetUrl: "wss://api.hyperliquid-testnet.xyz/ws",
  gzipCompression: false,
}

// ==================== BITMEX ====================
// WebSocket: Yes (public without API key)
// Demo: Testnet only (testnet.bitmex.com)
// GZIP: No

const BITMEX_INVERSE: Exchange = {
  id: "bitmex",
  displayName: "BitMEX",
  type: "inverse",
  fees: { maker: 0.0001, taker: 0.00075 },
  features: { hedgeMode: false, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://www.bitmex.com",
  testnetUrl: "https://testnet.bitmex.com",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://www.bitmex.com/realtime",
  wsTestnetUrl: "wss://testnet.bitmex.com/realtime",
  gzipCompression: false,
}

// ==================== BLOFIN ====================
// WebSocket: Yes (public without API key)
// Demo: Yes (USDT demo currency, 100,000 initial balance)
// GZIP: No
// Similar to OKX architecture

const BLOFIN_FUTURES: Exchange = {
  id: "blofin",
  displayName: "BloFin",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.0006 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: false, demo: true },
  apiBaseUrl: "https://openapi.blofin.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://openapi.blofin.com/ws/public",
  gzipCompression: false,
}

const BLOFIN_INVERSE: Exchange = {
  id: "blofin",
  displayName: "BloFin Inverse",
  type: "inverse",
  fees: { maker: 0.0002, taker: 0.0006 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: false, demo: true },
  apiBaseUrl: "https://openapi.blofin.com",
  requiresPassphrase: true,
  requiresUid: false,
  wsUrl: "wss://openapi.blofin.com/ws/public",
  gzipCompression: false,
}

// ==================== ASTER DEX ====================
// WebSocket: Yes (via Orderly Network, public without API key)
// Demo: Testnet only (testnet-api.asterdex.com)
// GZIP: No
// Auth: Web3 wallet signature (ORDERLY_KEY)

const ASTER_SPOT: Exchange = {
  id: "aster",
  displayName: "Aster DEX",
  type: "spot",
  fees: { maker: 0.0001, taker: 0.0001 },
  features: { hedgeMode: false, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.asterdex.com",
  testnetUrl: "https://testnet-api.asterdex.com",
  requiresPassphrase: false,
  requiresUid: false,
  requiresWallet: true,
  wsUrl: "wss://ws.orderly.org/v2/public",
  gzipCompression: false,
}

const ASTER_FUTURES: Exchange = {
  id: "aster",
  displayName: "Aster DEX Futures",
  type: "futures",
  fees: { maker: 0.0001, taker: 0.0002 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.asterdex.com",
  testnetUrl: "https://testnet-api.asterdex.com",
  requiresPassphrase: false,
  requiresUid: false,
  requiresWallet: true,
  wsUrl: "wss://ws.orderly.org/v2/public",
  gzipCompression: false,
}

// ==================== GATE.IO ====================
// WebSocket: Yes (public without API key)
// Demo: Testnet only (fx-api-testnet.gateio.ws)
// GZIP: No
// Signature: SHA512 (unlike most exchanges using SHA256)

const GATE_SPOT: Exchange = {
  id: "gate",
  displayName: "Gate.io",
  type: "spot",
  fees: { maker: 0.002, taker: 0.002 },
  features: { hedgeMode: false, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.gateio.ws/api/v4",
  testnetUrl: "https://fx-api-testnet.gateio.ws/api/v4",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://api.gateio.ws/ws/v4/",
  wsTestnetUrl: "wss://fx-api-testnet.gateio.ws/ws/v4/",
  gzipCompression: false,
}

const GATE_FUTURES: Exchange = {
  id: "gate",
  displayName: "Gate.io Futures",
  type: "futures",
  fees: { maker: 0.0002, taker: 0.0005 },
  features: { hedgeMode: true, trailingStop: true, dca: true, testnet: true, demo: false },
  apiBaseUrl: "https://api.gateio.ws/api/v4",
  testnetUrl: "https://fx-api-testnet.gateio.ws/api/v4",
  requiresPassphrase: false,
  requiresUid: false,
  wsUrl: "wss://fx-api.gateio.ws/ws/v1/",
  wsTestnetUrl: "wss://fx-api-testnet.gateio.ws/ws/v1/",
  gzipCompression: false,
}
*/

// ============================================================
// EXCHANGE GROUPS - ACTIVE ONLY
// ============================================================

export const EXCHANGE_GROUPS = {
  spot: [
    BINANCE_SPOT, 
    BYBIT_SPOT, 
    OKX_SPOT, 
    BITGET_SPOT, 
    // KUCOIN_SPOT,      // DISABLED
    BINGX_SPOT, 
    // COINBASE_SPOT,    // DISABLED
    // HUOBI_SPOT,       // DISABLED
    // ASTER_SPOT,       // DISABLED
    // GATE_SPOT         // DISABLED
  ],
  futures: [
    BINANCE_FUTURES, 
    BYBIT_FUTURES, 
    OKX_FUTURES, 
    BITGET_FUTURES, 
    // KUCOIN_FUTURES,   // DISABLED
    BINGX_FUTURES,
    // HUOBI_FUTURES,    // DISABLED
    // HYPERLIQUID_FUTURES, // DISABLED
    // BLOFIN_FUTURES,   // DISABLED
    // ASTER_FUTURES,    // DISABLED
    // GATE_FUTURES      // DISABLED
  ],
  inverse: [
    BINANCE_INVERSE, 
    BYBIT_INVERSE, 
    OKX_INVERSE, 
    BITGET_INVERSE, 
    // BITMEX_INVERSE,   // DISABLED
    // BLOFIN_INVERSE    // DISABLED
  ],
}

// ============================================================
// DISABLED EXCHANGE GROUPS (uncomment to enable)
// ============================================================

/*
// Disabled exchanges grouped by type
const DISABLED_EXCHANGE_GROUPS = {
  spot: [
    KUCOIN_SPOT,
    COINBASE_SPOT,
    HUOBI_SPOT,
    ASTER_SPOT,
    GATE_SPOT
  ],
  futures: [
    KUCOIN_FUTURES,
    HUOBI_FUTURES,
    HYPERLIQUID_FUTURES,
    BLOFIN_FUTURES,
    ASTER_FUTURES,
    GATE_FUTURES
  ],
  inverse: [
    BITMEX_INVERSE,
    BLOFIN_INVERSE
  ],
}
*/

// All active exchanges flat list
export const SUPPORTED_EXCHANGES: Exchange[] = [
  ...EXCHANGE_GROUPS.spot,
  ...EXCHANGE_GROUPS.futures,
  ...EXCHANGE_GROUPS.inverse,
]

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getExchangeById(id: string, type?: ExchangeType): Exchange | undefined {
  if (type) {
    return EXCHANGE_GROUPS[type].find(e => e.id === id)
  }
  return SUPPORTED_EXCHANGES.find(e => e.id === id)
}

export function getExchangesByType(type: ExchangeType): Exchange[] {
  return EXCHANGE_GROUPS[type]
}

export function getUniqueExchangeNames(): string[] {
  const names = new Set<string>()
  SUPPORTED_EXCHANGES.forEach(e => names.add(e.id))
  return Array.from(names)
}

// Get exchanges that support demo or testnet trading
export function getDemoCapableExchanges(): Exchange[] {
  return SUPPORTED_EXCHANGES.filter(e => e.features.demo || e.features.testnet)
}

// Get exchanges that support WebSocket
export function getWebSocketCapableExchanges(): Exchange[] {
  return SUPPORTED_EXCHANGES.filter(e => e.wsUrl)
}

// Get exchanges that require GZIP decompression
export function getGzipExchanges(): Exchange[] {
  return SUPPORTED_EXCHANGES.filter(e => e.gzipCompression)
}

// Get exchanges that require Web3 wallet (DEX)
export function getWalletAuthExchanges(): Exchange[] {
  return SUPPORTED_EXCHANGES.filter(e => e.requiresWallet)
}

// ============================================================
// EXCHANGE SUMMARY
// ============================================================

export const EXCHANGE_SUMMARY = {
  totalExchanges: 5,
  activeExchanges: [
    { id: "binance", name: "Binance", demo: false, testnet: true, ws: true },
    { id: "bybit", name: "Bybit", demo: false, testnet: true, ws: true },
    { id: "okx", name: "OKX", demo: true, testnet: false, ws: true },
    { id: "bitget", name: "Bitget", demo: true, testnet: false, ws: true },
    { id: "bingx", name: "BingX", demo: true, testnet: false, ws: true, gzip: true },
  ],
  // DISABLED EXCHANGES (uncomment to enable)
  /*
  disabledExchanges: [
    { id: "kucoin", name: "KuCoin", demo: false, testnet: true, ws: true },
    { id: "coinbase", name: "Coinbase", demo: false, testnet: true, ws: true },
    { id: "huobi", name: "HTX (Huobi)", demo: false, testnet: true, ws: true, gzip: true },
    { id: "hyperliquid", name: "HyperLiquid", demo: false, testnet: true, ws: true, wallet: true },
    { id: "bitmex", name: "BitMEX", demo: false, testnet: true, ws: true },
    { id: "blofin", name: "BloFin", demo: true, testnet: false, ws: true },
    { id: "aster", name: "Aster DEX", demo: false, testnet: true, ws: true, wallet: true },
    { id: "gate", name: "Gate.io", demo: false, testnet: true, ws: true },
  ],
  */
}
