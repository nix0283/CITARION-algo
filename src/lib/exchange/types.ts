/**
 * Exchange Client Types
 * 
 * Common types for all exchange implementations
 * Updated with 2026 testnet/demo configurations for all exchanges
 * 
 * ACTIVE EXCHANGES: Binance, Bybit, OKX, Bitget, BingX
 * DISABLED (commented): KuCoin, Coinbase, Huobi, HyperLiquid, BitMEX, BloFin, Aster, Gate.io
 */

// ==================== COMMON TYPES ====================

/**
 * Active exchange IDs - only these are shown in UI
 */
export type ExchangeId = 
  | "binance" 
  | "bybit" 
  | "okx" 
  | "bitget" 
  | "bingx";
  // DISABLED EXCHANGES - Uncomment to enable in future:
  // | "kucoin" 
  // | "coinbase" 
  // | "huobi" 
  // | "hyperliquid" 
  // | "bitmex" 
  // | "blofin"
  // | "aster"
  // | "gate";

/**
 * All exchange IDs including disabled ones - for internal use
 */
export type AllExchangeId = 
  | "binance" 
  | "bybit" 
  | "okx" 
  | "bitget" 
  | "bingx"
  | "kucoin" 
  | "coinbase" 
  | "huobi" 
  | "hyperliquid" 
  | "bitmex" 
  | "blofin"
  | "aster"
  | "gate";

export type MarketType = "spot" | "futures" | "inverse";

export type OrderSide = "buy" | "sell";

export type OrderType = "market" | "limit" | "stop_market" | "stop_limit" | "trigger";

export type OrderStatus = "pending" | "open" | "partial" | "filled" | "cancelled" | "rejected" | "expired";

export type PositionSide = "long" | "short" | "both";

export type MarginMode = "isolated" | "cross";

export type TimeInForce = "GTC" | "IOC" | "FOK" | "GTX" | "POST_ONLY";

// ==================== TRADING MODE ====================

/**
 * Trading mode determines how orders are executed
 * - LIVE: Real trading with actual funds
 * - TESTNET: Dedicated testnet environment (separate endpoints, separate registration)
 * - DEMO: Simulation mode within production API (special headers/symbols/balance)
 */
export type TradingMode = "LIVE" | "TESTNET" | "DEMO";

/**
 * Testnet configuration for exchanges with dedicated test environments
 */
export interface TestnetConfig {
  /** Whether testnet is supported */
  supported: boolean;
  /** Separate registration required */
  separateRegistration: boolean;
  /** Testnet registration URL */
  registrationUrl?: string;
  /** Initial virtual balance */
  initialBalance?: number;
  /** Currency of initial balance */
  balanceCurrency?: string;
  /** Faucet available */
  hasFaucet: boolean;
}

/**
 * Demo configuration for exchanges with simulation within production
 */
export interface DemoConfig {
  /** Whether demo mode is supported */
  supported: boolean;
  /** Type of demo: simulation (same endpoint, special handling) */
  type: "simulation";
  /** Symbol prefix for demo trading (e.g., "S" for Bitget: SBTCUSDT) */
  symbolPrefix?: string;
  /** Demo currency name (e.g., "VST" for BingX, "SUSDT" for Bitget) */
  demoCurrency?: string;
  /** Initial demo balance */
  initialBalance?: number;
  /** Minimum balance before recharge */
  minBalanceForRecharge?: number;
  /** Recharge cooldown in hours */
  rechargeCooldownHours?: number;
  /** Special header required (e.g., OKX: x-simulated-trading: 1) */
  specialHeader?: { name: string; value: string };
  /** Demo API key type required */
  demoApiKeyRequired?: boolean;
}

// ==================== API CREDENTIALS ====================

export interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;  // Required for OKX, KuCoin, Bitget, BloFin
  uid?: string;         // Required for some exchanges
  parentUid?: string;   // For sub-accounts
  walletAddress?: string; // For HyperLiquid
  walletPrivateKey?: string; // For HyperLiquid signing
}

// ==================== RATE LIMITS ====================

export interface RateLimit {
  maxRequests: number;
  windowMs: number;       // Time window in milliseconds
  cost: number;           // Cost per request (some exchanges use weighted costs)
}

export interface RateLimitConfig {
  general: RateLimit;
  orders?: RateLimit;     // Separate limit for order placement
  ordersWeight?: number;  // Weight for order requests
  defaultWeight?: number; // Default request weight
}

// Exchange-specific rate limits (2026 values)
// Includes both active and disabled exchanges for future use
export const EXCHANGE_RATE_LIMITS: Record<AllExchangeId, RateLimitConfig> = {
  // === ACTIVE EXCHANGES ===
  binance: {
    // Testnet has stricter limits - check X-MBX-USED-WEIGHT-1M header
    general: { maxRequests: 1200, windowMs: 60000, cost: 1 },
    orders: { maxRequests: 50, windowMs: 10000, cost: 1 },
    ordersWeight: 1,
    defaultWeight: 1,
  },
  bybit: {
    general: { maxRequests: 120, windowMs: 60000, cost: 1 },
    orders: { maxRequests: 100, windowMs: 60000, cost: 1 },
    defaultWeight: 1,
  },
  okx: {
    general: { maxRequests: 20, windowMs: 2000, cost: 1 },
    orders: { maxRequests: 60, windowMs: 2000, cost: 1 },
    defaultWeight: 1,
  },
  bitget: {
    general: { maxRequests: 15, windowMs: 1000, cost: 1 },
    orders: { maxRequests: 30, windowMs: 1000, cost: 1 },
    defaultWeight: 1,
  },
  bingx: {
    // 10 requests per second for orders (2026)
    general: { maxRequests: 10, windowMs: 1000, cost: 1 },
    orders: { maxRequests: 10, windowMs: 1000, cost: 1 },
    defaultWeight: 1,
  },
  
  // === DISABLED EXCHANGES (kept for future use) ===
  // KuCoin - Sandbox often has stricter limits
  kucoin: {
    general: { maxRequests: 2000, windowMs: 60000, cost: 1 },
    orders: { maxRequests: 180, windowMs: 3000, cost: 1 },
    defaultWeight: 1,
  },
  // Coinbase - Sandbox: ~5 requests per second
  coinbase: {
    general: { maxRequests: 5, windowMs: 1000, cost: 1 },
    orders: { maxRequests: 5, windowMs: 1000, cost: 1 },
    defaultWeight: 1,
  },
  // Huobi - Testnet: 10-50 requests per minute (stricter than main)
  huobi: {
    general: { maxRequests: 50, windowMs: 60000, cost: 1 },
    defaultWeight: 1,
  },
  // HyperLiquid
  hyperliquid: {
    general: { maxRequests: 1200, windowMs: 60000, cost: 1 },
    defaultWeight: 1,
  },
  // BitMEX - Uses "points" system, check x-ratelimit-remaining header
  bitmex: {
    general: { maxRequests: 120, windowMs: 60000, cost: 1 },
    orders: { maxRequests: 300, windowMs: 60000, cost: 1 },
    defaultWeight: 1,
  },
  // BloFin
  blofin: {
    general: { maxRequests: 20, windowMs: 2000, cost: 1 },
    orders: { maxRequests: 60, windowMs: 2000, cost: 1 },
    defaultWeight: 1,
  },
  // Gate.io V4 API
  gate: {
    general: { maxRequests: 1000, windowMs: 60000, cost: 1 },
    orders: { maxRequests: 100, windowMs: 1000, cost: 1 },
    defaultWeight: 1,
  },
  // Aster DEX via Orderly Network
  aster: {
    general: { maxRequests: 100, windowMs: 1000, cost: 1 },
    orders: { maxRequests: 50, windowMs: 1000, cost: 1 },
    defaultWeight: 1,
  },
};

// ==================== ORDER TYPES ====================

export interface CreateOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  leverage?: number;
  marginMode?: MarginMode;
  positionSide?: PositionSide;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  clientOrderId?: string;
  /** For demo trading, use demo symbol (e.g., SBTCUSDT instead of BTCUSDT) */
  useDemoSymbol?: boolean;
}

export interface Order {
  id: string;
  clientOrderId?: string;
  exchange: AllExchangeId;  // Use AllExchangeId for internal compatibility
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: number;
  averagePrice?: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  stopPrice?: number;
  leverage?: number;
  marginMode?: MarginMode;
  positionSide?: PositionSide;
  fee: number;
  feeCurrency: string;
  createdAt: Date;
  updatedAt: Date;
  reduceOnly?: boolean;
  isDemo?: boolean;
}

export interface CancelOrderParams {
  symbol: string;
  orderId?: string;
  clientOrderId?: string;
}

export interface OrderResult {
  success: boolean;
  order?: Order;
  error?: string;
  errorCode?: string;
}

// ==================== POSITION TYPES ====================

export interface Position {
  id: string;
  exchange: AllExchangeId;  // Use AllExchangeId for internal compatibility
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage: number;
  marginMode: MarginMode;
  margin: number;
  liquidationPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClosePositionParams {
  symbol: string;
  quantity?: number;  // If not specified, close entire position
  positionSide?: PositionSide;
  market?: boolean;   // Use market order instead of limit
}

// ==================== ACCOUNT TYPES ====================

export interface Balance {
  currency: string;
  total: number;
  available: number;
  frozen: number;
  usdValue?: number;
  isDemo?: boolean;  // For demo currencies like VST, SUSDT
}

export interface AccountInfo {
  exchange: AllExchangeId;  // Use AllExchangeId for internal compatibility
  balances: Balance[];
  totalEquity: number;
  availableMargin: number;
  marginUsed: number;
  unrealizedPnl: number;
  marginRatio?: number;
  isDemo?: boolean;
}

export interface SetLeverageParams {
  symbol: string;
  leverage: number;
  marginMode?: MarginMode;
  positionSide?: PositionSide;
}

// ==================== MARKET DATA ====================

export interface Ticker {
  symbol: string;
  exchange: AllExchangeId;  // Use AllExchangeId for internal compatibility
  bid: number;
  ask: number;
  last: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: Date;
}

export interface FundingRate {
  symbol: string;
  exchange: AllExchangeId;  // Use AllExchangeId for internal compatibility
  rate: number;
  nextFundingTime: Date;
  markPrice: number;
  indexPrice?: number;
  timestamp: Date;
}

// ==================== ORDERBOOK TYPES ====================

export interface OrderbookEntry {
  price: number;
  quantity: number;
}

export interface Orderbook {
  symbol: string;
  exchange: AllExchangeId;  // Use AllExchangeId for internal compatibility
  bids: OrderbookEntry[];  // Sorted descending by price
  asks: OrderbookEntry[];  // Sorted ascending by price
  timestamp: Date;
}

// ==================== MARK PRICE TYPES ====================

export interface MarkPrice {
  symbol: string;
  exchange: AllExchangeId;
  markPrice: number;        // Цена маркировки (для расчёта PnL и ликвидации)
  indexPrice: number;       // Индексная цена (средняя по биржам)
  estimatedSettlePrice?: number;
  timestamp: Date;
  
  // Дополнительные поля
  basisRate?: number;       // Разница между mark и index в %
  fundingRate?: number;     // Текущий funding rate
  nextFundingTime?: Date;   // Время следующего funding
}

// ==================== OPEN INTEREST TYPES ====================

/**
 * Open Interest - общее количество открытых позиций по контракту
 * Публичные данные, не требуют аутентификации
 */
export interface OpenInterest {
  symbol: string;
  exchange: AllExchangeId;
  /** Общий открытый интерес в базовой валюте (например, BTC) */
  openInterest: number;
  /** Общий открытый интерес в USDT (если доступно) */
  openInterestUsd?: number;
  /** Время данных */
  timestamp: Date;
  
  // Дополнительные поля
  /** Изменение за 24ч в % */
  change24h?: number;
  /** Изменение за 24ч в абсолютном значении */
  change24hValue?: number;
  /** Максимальный OI за 24ч */
  high24h?: number;
  /** Минимальный OI за 24ч */
  low24h?: number;
  /** Объем торгов 24ч */
  volume24h?: number;
  /** Цена (mark или last) на момент данных */
  price?: number;
}

// ==================== ORDER HISTORY TYPES ====================

export interface OrderHistoryItem {
  id: string;
  clientOrderId?: string;
  exchange: AllExchangeId;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  
  // Цены и объёмы
  price: number;
  avgPrice: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  
  // Финансы
  fee: number;
  feeCurrency: string;
  realizedPnl?: number;
  
  // Время
  createdAt: Date;
  updatedAt: Date;
  
  // Дополнительно
  reduceOnly?: boolean;
  positionSide?: PositionSide;
  stopPrice?: number;
  timeInForce?: string;
  
  // Для демо
  isDemo?: boolean;
}

export interface OpenOrder extends OrderHistoryItem {
  // Дополнительные поля для открытых ордеров
  takeProfitPrice?: number;
  stopLossPrice?: number;
  activatePrice?: number;   // Для трейлинг-стопа
  priceRate?: number;       // Для трейлинг-стопа
}

// ==================== BALANCE HISTORY TYPES ====================

export interface BalanceHistoryItem {
  id: string;
  exchange: AllExchangeId;
  accountId: string;
  
  // Валюта и тип
  currency: string;
  changeType: 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE' | 'FEE' | 'FUNDING' | 'TRANSFER' | 'LIQUIDATION' | 'OTHER';
  
  // Суммы
  amount: number;           // Изменение (может быть отрицательным)
  balanceBefore: number;    // Баланс до
  balanceAfter: number;     // Баланс после
  
  // Связанные данные
  relatedId?: string;       // ID связанной сделки/ордера
  relatedType?: 'ORDER' | 'TRADE' | 'TRANSFER' | 'FUNDING';
  
  // Время
  timestamp: Date;
  
  // Дополнительно
  description?: string;
  fee?: number;
}

export interface BalanceHistoryParams {
  currency?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  changeType?: BalanceHistoryItem['changeType'];
}

// ==================== API VERSION TRACKING ====================

export interface ApiVersion {
  exchange: ExchangeId;
  currentVersion: string;
  lastChecked: Date;
  deprecated?: boolean;
  sunsetDate?: Date;
  changes?: string[];
}

// API versions for all exchanges (active + disabled)
export const CURRENT_API_VERSIONS: Record<AllExchangeId, string> = {
  // Active
  binance: "v3",
  bybit: "v5",
  okx: "v5",
  bitget: "v2",
  bingx: "v2",
  // Disabled
  kucoin: "v2",
  coinbase: "v3",  // Advanced Trade API
  huobi: "v2",
  hyperliquid: "v1",
  bitmex: "v1",
  blofin: "v1",
  aster: "v1",
  gate: "v4",
};

// ==================== EXCHANGE CONFIG ====================

export interface ExchangeConfig {
  id: ExchangeId;
  name: string;
  markets: MarketType[];
  hasTestnet: boolean;
  hasDemo: boolean;
  requiresPassphrase: boolean;
  requiresUid: boolean;
  supportsHedgeMode: boolean;
  supportsTrailingStop: boolean;
  supportsReduceOnly: boolean;
  apiVersion: string;
  
  // URLs
  spotUrl?: string;
  futuresUrl?: string;
  inverseUrl?: string;
  spotTestnetUrl?: string;
  futuresTestnetUrl?: string;
  inverseTestnetUrl?: string;
  wsUrl?: string;
  wsTestnetUrl?: string;
  
  // Testnet configuration
  testnetConfig?: TestnetConfig;
  
  // Demo configuration
  demoConfig?: DemoConfig;
  
  // Rate limits
  rateLimits: RateLimitConfig;
  
  // Documentation links
  docsUrl?: string;
  testnetDocsUrl?: string;
}

/**
 * Active exchange configurations - shown in UI
 */
export const EXCHANGE_CONFIGS: Record<ExchangeId, ExchangeConfig> = {
  // ============================================================
  // ACTIVE EXCHANGES (Binance, Bybit, OKX, Bitget, BingX)
  // ============================================================
  
  binance: {
    id: "binance",
    name: "Binance",
    markets: ["spot", "futures", "inverse"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v3",
    spotUrl: "https://api.binance.com",
    futuresUrl: "https://fapi.binance.com",
    inverseUrl: "https://dapi.binance.com",
    spotTestnetUrl: "https://testnet.binance.vision",
    futuresTestnetUrl: "https://testnet.binancefuture.com",
    wsUrl: "wss://stream.binance.com",
    wsTestnetUrl: "wss://stream.binancefuture.com",
    testnetConfig: {
      supported: true,
      separateRegistration: true,
      registrationUrl: "https://testnet.binancefuture.com",
      initialBalance: 15000,
      balanceCurrency: "USDT",
      hasFaucet: true,
    },
    docsUrl: "https://binance-docs.github.io/apidocs/",
    rateLimits: EXCHANGE_RATE_LIMITS.binance,
  },
  
  bybit: {
    id: "bybit",
    name: "Bybit",
    markets: ["spot", "futures", "inverse"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v5",
    spotUrl: "https://api.bybit.com",
    futuresUrl: "https://api.bybit.com",
    inverseUrl: "https://api.bybit.com",
    spotTestnetUrl: "https://api-testnet.bybit.com",
    futuresTestnetUrl: "https://api-testnet.bybit.com",
    wsUrl: "wss://stream.bybit.com",
    wsTestnetUrl: "wss://stream-testnet.bybit.com",
    testnetConfig: {
      supported: true,
      separateRegistration: true,
      registrationUrl: "https://testnet.bybit.com",
      initialBalance: 50000,
      balanceCurrency: "USDT",
      hasFaucet: true,
    },
    docsUrl: "https://bybit-exchange.github.io/docs/",
    rateLimits: EXCHANGE_RATE_LIMITS.bybit,
  },
  
  okx: {
    id: "okx",
    name: "OKX",
    markets: ["spot", "futures", "inverse"],
    hasTestnet: false,
    hasDemo: true,
    requiresPassphrase: true,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v5",
    spotUrl: "https://www.okx.com",
    futuresUrl: "https://www.okx.com",
    inverseUrl: "https://www.okx.com",
    wsUrl: "wss://wspap.okx.com",
    demoConfig: {
      supported: true,
      type: "simulation",
      demoCurrency: "USDT",
      initialBalance: 10000,
      specialHeader: { name: "x-simulated-trading", value: "1" },
      demoApiKeyRequired: true,
    },
    docsUrl: "https://www.okx.com/docs-v5/",
    rateLimits: EXCHANGE_RATE_LIMITS.okx,
  },
  
  bitget: {
    id: "bitget",
    name: "Bitget",
    markets: ["spot", "futures", "inverse"],
    hasTestnet: false,
    hasDemo: true,
    requiresPassphrase: true,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v2",
    spotUrl: "https://api.bitget.com",
    futuresUrl: "https://api.bitget.com",
    inverseUrl: "https://api.bitget.com",
    // Bitget Demo: Uses S-prefix symbols (SBTCUSDT, SETHUSDT)
    demoConfig: {
      supported: true,
      type: "simulation",
      symbolPrefix: "S",
      demoCurrency: "SUSDT",
      initialBalance: 50000,
      rechargeCooldownHours: 72,
    },
    docsUrl: "https://bitgetlimited.github.io/apidoc/",
    rateLimits: EXCHANGE_RATE_LIMITS.bitget,
  },
  
  bingx: {
    id: "bingx",
    name: "BingX",
    markets: ["spot", "futures"],
    hasTestnet: false,
    hasDemo: true,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: false,
    apiVersion: "v2",
    spotUrl: "https://open-api.bingx.com",
    futuresUrl: "https://open-api.bingx.com",
    // BingX Demo: Uses VST (Virtual Simulation Token)
    demoConfig: {
      supported: true,
      type: "simulation",
      demoCurrency: "VST",
      initialBalance: 100000,
      minBalanceForRecharge: 20000,
      rechargeCooldownHours: 168, // 7 days
    },
    docsUrl: "https://bingx-api.github.io/docs/",
    rateLimits: EXCHANGE_RATE_LIMITS.bingx,
  },
  
  // ============================================================
  // DISABLED EXCHANGES (Commented out from UI, kept for future)
  // Uncomment the entries below to re-enable these exchanges
  // ============================================================
  
  /*
  // KuCoin - DISABLED
  kucoin: {
    id: "kucoin",
    name: "KuCoin",
    markets: ["spot", "futures"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: true,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v2",
    spotUrl: "https://api.kucoin.com",
    futuresUrl: "https://api-futures.kucoin.com",
    spotTestnetUrl: "https://openapi-sandbox.kucoin.com",
    futuresTestnetUrl: "https://openapi-sandbox.kucoin.com",
    testnetConfig: {
      supported: true,
      separateRegistration: true,
      registrationUrl: "https://sandbox.kucoin.com",
      initialBalance: 10000,
      balanceCurrency: "USDT",
      hasFaucet: true,
    },
    docsUrl: "https://docs.kucoin.com/",
    rateLimits: EXCHANGE_RATE_LIMITS.kucoin,
  },
  
  // Coinbase - DISABLED
  coinbase: {
    id: "coinbase",
    name: "Coinbase Exchange",
    markets: ["spot"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: false,
    supportsTrailingStop: false,
    supportsReduceOnly: false,
    apiVersion: "v3",
    spotUrl: "https://api.exchange.coinbase.com",
    spotTestnetUrl: "https://api-public.sandbox.exchange.coinbase.com",
    wsUrl: "wss://ws-feed.exchange.coinbase.com",
    wsTestnetUrl: "wss://ws-feed-public.sandbox.exchange.coinbase.com",
    testnetConfig: {
      supported: true,
      separateRegistration: true,
      registrationUrl: "https://public.sandbox.exchange.coinbase.com",
      hasFaucet: true,
    },
    docsUrl: "https://docs.cloud.coinbase.com/exchange/",
    rateLimits: EXCHANGE_RATE_LIMITS.coinbase,
  },
  
  // Huobi/HTX - DISABLED
  huobi: {
    id: "huobi",
    name: "HTX (Huobi)",
    markets: ["spot", "futures"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: false,
    apiVersion: "v2",
    spotUrl: "https://api.huobi.pro",
    futuresUrl: "https://api.huobi.pro",
    testnetConfig: {
      supported: true,
      separateRegistration: true,
      registrationUrl: "https://huobiapi.github.io/docs/spot/v1/en/#testnet",
      hasFaucet: true,
    },
    docsUrl: "https://huobiapi.github.io/docs/",
    rateLimits: EXCHANGE_RATE_LIMITS.huobi,
  },
  
  // HyperLiquid - DISABLED
  hyperliquid: {
    id: "hyperliquid",
    name: "HyperLiquid",
    markets: ["futures"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v1",
    futuresUrl: "https://api.hyperliquid.xyz",
    futuresTestnetUrl: "https://api.hyperliquid-testnet.xyz",
    // HyperLiquid uses wallet-based auth (EIP-712 signing)
    testnetConfig: {
      supported: true,
      separateRegistration: false, // Uses wallet address
      registrationUrl: "https://app.hyperliquid-testnet.xyz",
      hasFaucet: true,
    },
    docsUrl: "https://hyperliquid.gitbook.io/hyperliquid-docs/",
    rateLimits: EXCHANGE_RATE_LIMITS.hyperliquid,
  },
  
  // BitMEX - DISABLED
  bitmex: {
    id: "bitmex",
    name: "BitMEX",
    markets: ["inverse"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: false,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v1",
    inverseUrl: "https://www.bitmex.com",
    inverseTestnetUrl: "https://testnet.bitmex.com",
    wsUrl: "wss://www.bitmex.com/realtime",
    wsTestnetUrl: "wss://testnet.bitmex.com/realtime",
    testnetConfig: {
      supported: true,
      separateRegistration: true,
      registrationUrl: "https://testnet.bitmex.com",
      initialBalance: 0, // XBT from faucet
      balanceCurrency: "XBT",
      hasFaucet: true,
    },
    docsUrl: "https://www.bitmex.com/app/apiOverview",
    rateLimits: EXCHANGE_RATE_LIMITS.bitmex,
  },
  
  // BloFin - DISABLED
  blofin: {
    id: "blofin",
    name: "BloFin",
    markets: ["futures"],
    hasTestnet: false,
    hasDemo: true,
    requiresPassphrase: true,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v1",
    futuresUrl: "https://openapi.blofin.com",
    demoConfig: {
      supported: true,
      type: "simulation",
      demoCurrency: "USDT",
      initialBalance: 100000,
      demoApiKeyRequired: true,
    },
    docsUrl: "https://blofin.com/docs",
    rateLimits: EXCHANGE_RATE_LIMITS.blofin,
  },
  
  // Gate.io - DISABLED
  gate: {
    id: "gate",
    name: "Gate.io",
    markets: ["spot", "futures"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v4",
    spotUrl: "https://api.gateio.ws/api/v4",
    futuresUrl: "https://api.gateio.ws/api/v4",
    spotTestnetUrl: "https://fx-api-testnet.gateio.ws/api/v4",
    futuresTestnetUrl: "https://fx-api-testnet.gateio.ws/api/v4",
    wsUrl: "wss://api.gateio.ws/ws/v4/",
    testnetConfig: {
      supported: true,
      separateRegistration: false,
      registrationUrl: "https://www.gate.io/testnet/futures_trade/USDT",
      hasFaucet: true,
    },
    docsUrl: "https://www.gate.io/docs/developers/apiv4/en/",
    rateLimits: EXCHANGE_RATE_LIMITS.gate,
  },
  
  // Aster DEX - DISABLED
  aster: {
    id: "aster",
    name: "Aster DEX",
    markets: ["spot", "futures"],
    hasTestnet: true,
    hasDemo: false,
    requiresPassphrase: false,
    requiresUid: false,
    supportsHedgeMode: true,
    supportsTrailingStop: true,
    supportsReduceOnly: true,
    apiVersion: "v1",
    spotUrl: "https://api.asterdex.com",
    futuresUrl: "https://api.asterdex.com",
    spotTestnetUrl: "https://testnet-api.asterdex.com",
    futuresTestnetUrl: "https://testnet-api.asterdex.com",
    wsUrl: "wss://ws.orderly.org/v2/public",
    testnetConfig: {
      supported: true,
      separateRegistration: false, // Uses wallet address
      registrationUrl: "https://testnet.asterdex.com",
      hasFaucet: true,
    },
    docsUrl: "https://docs.asterdex.com",
    rateLimits: EXCHANGE_RATE_LIMITS.aster,
  },
  */
};

// ==================== ERROR TYPES ====================

export interface ExchangeError {
  exchange: AllExchangeId;  // Use AllExchangeId for internal compatibility
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  retriable: boolean;
}

export const EXCHANGE_ERROR_CODES = {
  // Common error codes
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_SYMBOL: "INVALID_SYMBOL",
  INVALID_QUANTITY: "INVALID_QUANTITY",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  POSITION_NOT_FOUND: "POSITION_NOT_FOUND",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  API_KEY_INVALID: "API_KEY_INVALID",
  API_KEY_EXPIRED: "API_KEY_EXPIRED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  DEMO_MODE_REQUIRED: "DEMO_MODE_REQUIRED",
  SYMBOL_NOT_IN_DEMO: "SYMBOL_NOT_IN_DEMO",
  TIMESTAMP_EXPIRED: "TIMESTAMP_EXPIRED",
  
  // Exchange-specific
  BINANCE_NEW_ORDER_REJECTED: "NEW_ORDER_REJECTED",
  BYBIT_REQUEST_EXPIRED: "10002",
  BYBIT_INSUFFICIENT_MARGIN: "110007",
  OKX_ORDER_FAILED: "51000",
  BITGET_ORDER_FAIL: "40001",
  KUCOIN_ORDER_FAILED: "200000",
  BINGX_DEMO_BALANCE_LOW: "100501",
  BITMEX_RATE_LIMIT: "429",
} as const;

// ==================== LOG TYPES ====================

export interface TradeLog {
  id: string;
  exchange: AllExchangeId;  // Use AllExchangeId for internal compatibility
  marketType: MarketType;
  tradingMode: TradingMode;
  operation: "create_order" | "cancel_order" | "close_position" | "set_leverage" | "get_balance" | "api_call";
  symbol?: string;
  orderId?: string;
  positionId?: string;
  params: Record<string, unknown>;
  result: "success" | "failure" | "partial";
  response?: Record<string, unknown>;
  error?: string;
  duration: number; // ms
  timestamp: Date;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Convert symbol to demo symbol for exchanges that use prefix
 * e.g., BTCUSDT -> SBTCUSDT for Bitget demo
 */
export function toDemoSymbol(symbol: string, exchangeId: ExchangeId): string {
  const config = EXCHANGE_CONFIGS[exchangeId];
  if (config?.demoConfig?.symbolPrefix && !symbol.startsWith(config.demoConfig.symbolPrefix)) {
    return config.demoConfig.symbolPrefix + symbol;
  }
  return symbol;
}

/**
 * Convert demo symbol back to regular symbol
 * e.g., SBTCUSDT -> BTCUSDT for Bitget
 */
export function fromDemoSymbol(symbol: string, exchangeId: ExchangeId): string {
  const config = EXCHANGE_CONFIGS[exchangeId];
  if (config?.demoConfig?.symbolPrefix && symbol.startsWith(config.demoConfig.symbolPrefix)) {
    return symbol.slice(config.demoConfig.symbolPrefix.length);
  }
  return symbol;
}

/**
 * Check if symbol is a demo symbol
 */
export function isDemoSymbol(symbol: string, exchangeId: ExchangeId): boolean {
  const config = EXCHANGE_CONFIGS[exchangeId];
  if (config?.demoConfig?.symbolPrefix) {
    return symbol.startsWith(config.demoConfig.symbolPrefix);
  }
  return false;
}

/**
 * Get demo currency for exchange
 */
export function getDemoCurrency(exchangeId: ExchangeId): string | undefined {
  return EXCHANGE_CONFIGS[exchangeId]?.demoConfig?.demoCurrency;
}

/**
 * Check if exchange supports demo mode
 */
export function hasDemoMode(exchangeId: ExchangeId): boolean {
  return EXCHANGE_CONFIGS[exchangeId]?.hasDemo ?? false;
}

/**
 * Check if exchange has testnet
 */
export function hasTestnetSupport(exchangeId: ExchangeId): boolean {
  return EXCHANGE_CONFIGS[exchangeId]?.hasTestnet ?? false;
}

/**
 * Get testnet URL for exchange and market type
 */
export function getTestnetUrl(exchangeId: ExchangeId, marketType: MarketType): string | undefined {
  const config = EXCHANGE_CONFIGS[exchangeId];
  if (!config) return undefined;
  
  switch (marketType) {
    case "spot":
      return config.spotTestnetUrl;
    case "futures":
      return config.futuresTestnetUrl;
    case "inverse":
      return config.inverseTestnetUrl;
  }
}

/**
 * Get list of active exchange IDs
 */
export function getActiveExchangeIds(): ExchangeId[] {
  return Object.keys(EXCHANGE_CONFIGS) as ExchangeId[];
}

// ==================== COPY TRADING TYPES ====================

/**
 * Copy Trading - Trader Statistics
 * Статистика мастер-трейдера для копитрейдинга
 */
export interface CopyTraderStats {
  /** ID трейдера на бирже */
  traderId: string;
  /** Никнейм трейдера */
  nickname?: string;
  /** Аватар */
  avatar?: string;
  /** Биржа */
  exchange: ExchangeId;
  
  // Статистика торговли
  /** ROI за период (в процентах) */
  roi: number;
  /** ROI за 7 дней */
  roi7d?: number;
  /** ROI за 30 дней */
  roi30d?: number;
  /** ROI за 90 дней */
  roi90d?: number;
  
  /** Win rate (в процентах) */
  winRate: number;
  /** Общее количество сделок */
  totalTrades: number;
  /** Количество прибыльных сделок */
  winningTrades?: number;
  /** Количество убыточных сделок */
  losingTrades?: number;
  
  /** Максимальная просадка (в процентах) */
  maxDrawdown?: number;
  /** Текущая просадка */
  currentDrawdown?: number;
  
  /** Средняя прибыль на сделку */
  avgProfit?: number;
  /** Средний убыток на сделку */
  avgLoss?: number;
  /** Profit Factor */
  profitFactor?: number;
  /** Sharpe Ratio */
  sharpeRatio?: number;
  
  /** AUM - Assets Under Management (под управлением) */
  aum?: number;
  /** Количество followers */
  followersCount: number;
  /** Количество копируемых позиций */
  copyingCount?: number;
  
  /** Период торговли (дней) */
  tradingDays?: number;
  /** Дата регистрации как трейдер */
  traderSince?: Date;
  /** Последняя активность */
  lastTradeTime?: Date;
  
  /** Позиции: long/short/both */
  positionSide: 'long' | 'short' | 'both';
  /** Предпочтительные символы */
  preferredSymbols?: string[];
  /** Средний leverage */
  avgLeverage?: number;
  
  // Дополнительные метрики
  /** PnL за сегодня */
  todayPnl?: number;
  /** PnL за неделю */
  weekPnl?: number;
  /** PnL за месяц */
  monthPnl?: number;
  /** PnL за всё время */
  totalPnl?: number;
  
  /** Рейтинг на бирже */
  rank?: number;
  /** Уровень трейдера (если есть система уровней) */
  level?: string;
  
  /** Описание/био трейдера */
  description?: string;
  
  /** Время последнего обновления данных */
  timestamp: Date;
}

/**
 * Copy Trading - Текущая позиция мастер-трейдера
 */
export interface CopyTraderPosition {
  /** ID позиции */
  positionId: string;
  /** Биржа */
  exchange: ExchangeId;
  /** ID трейдера */
  traderId: string;
  /** Символ */
  symbol: string;
  /** Сторона: long/short */
  side: PositionSide;
  /** Размер позиции */
  quantity: number;
  /** Цена входа */
  entryPrice: number;
  /** Текущая цена маркировки */
  markPrice: number;
  /** Нереализованный PnL */
  unrealizedPnl: number;
  /** Нереализованный PnL в % */
  unrealizedPnlPercent?: number;
  /** Плечо */
  leverage: number;
  /** Режим маржи */
  marginMode: MarginMode;
  /** Размер маржи */
  margin: number;
  /** Цена ликвидации */
  liquidationPrice?: number;
  /** Take Profit */
  takeProfit?: number;
  /** Stop Loss */
  stopLoss?: number;
  /** Время открытия */
  openedAt: Date;
  /** Время обновления */
  updatedAt: Date;
  /** ID для копирования */
  trackingNumber?: string;
}

/**
 * Copy Trading - История сделки мастер-трейдера
 */
export interface CopyTraderTrade {
  /** ID сделки */
  tradeId: string;
  /** Биржа */
  exchange: ExchangeId;
  /** ID трейдера */
  traderId: string;
  /** Символ */
  symbol: string;
  /** Сторона входа */
  side: PositionSide;
  /** Тип ордера */
  orderType: OrderType;
  /** Размер */
  quantity: number;
  /** Цена входа */
  entryPrice: number;
  /** Цена выхода */
  exitPrice: number;
  /** Реализованный PnL */
  realizedPnl: number;
  /** Реализованный PnL в % */
  realizedPnlPercent?: number;
  /** ROI сделки */
  roi?: number;
  /** Комиссия */
  fee: number;
  /** Валюта комиссии */
  feeCurrency: string;
  /** Время открытия */
  openedAt: Date;
  /** Время закрытия */
  closedAt: Date;
  /** Длительность в минутах */
  durationMinutes?: number;
  /** Плечо */
  leverage: number;
  /** Максимальная просадка в сделке */
  maxDrawdown?: number;
  /** Количество followers, скопировавших сделку */
  copiedByCount?: number;
}

/**
 * Copy Trading - Настройки подписчика (Follower)
 */
export interface CopyFollowerSettings {
  /** ID настроек */
  settingsId?: string;
  /** Биржа */
  exchange: ExchangeId;
  /** ID трейдера, на которого подписан */
  traderId: string;
  /** ID подписчика */
  followerId?: string;
  
  // Режим копирования
  /** Режим: fixed - фиксированная сумма, ratio - пропорционально */
  copyMode: 'fixed' | 'ratio' | 'percentage';
  /** Фиксированная сумма на сделку (в USDT) */
  fixedAmount?: number;
  /** Коэффициент пропорции (1 = столько же, 2 = в 2 раза больше) */
  ratio?: number;
  /** Процент от баланса на сделку */
  percentage?: number;
  
  // Ограничения
  /** Максимальная сумма на сделку */
  maxAmountPerTrade?: number;
  /** Максимальное количество открытых позиций */
  maxOpenPositions?: number;
  /** Максимальный leverage */
  maxLeverage?: number;
  /** Разрешённые символы (null = все) */
  allowedSymbols?: string[];
  /** Запрещённые символы */
  blockedSymbols?: string[];
  
  // Stop Loss / Take Profit
  /** Автоматический SL в % от цены входа */
  autoStopLoss?: number;
  /** Автоматический TP в % от цены входа */
  autoTakeProfit?: number;
  /** Копировать SL/TP трейдера */
  copyTraderTpsl?: boolean;
  
  // Фильтры
  /** Минимальный ROI трейдера для копирования (%) */
  minTraderRoi?: number;
  /** Минимальный win rate трейдера (%) */
  minTraderWinRate?: number;
  /** Максимальная просадка трейдера (%) */
  maxTraderDrawdown?: number;
  
  /** Активно ли копирование */
  active: boolean;
  /** Дата подписки */
  subscribedAt?: Date;
  /** Время последнего обновления */
  updatedAt: Date;
}

/**
 * Copy Trading - Информация о подписчике (для мастер-трейдера)
 */
export interface CopyFollowerInfo {
  /** ID подписчика (зашифрованный) */
  followerId: string;
  /** Биржа */
  exchange: ExchangeId;
  /** ID трейдера */
  traderId: string;
  /** Никнейм подписчика */
  nickname?: string;
  /** Дата подписки */
  subscribedAt: Date;
  /** Активен ли */
  active: boolean;
  /** Общий PnL подписчика */
  totalPnl?: number;
  /** Количество скопированных сделок */
  copiedTradesCount?: number;
  /** Инвестированная сумма */
  investedAmount?: number;
  /** Текущая стоимость портфеля */
  currentValue?: number;
}

/**
 * Copy Trading - Статистика прибыли мастер-трейдера
 */
export interface CopyTraderProfitSummary {
  /** Биржа */
  exchange: ExchangeId;
  /** ID трейдера */
  traderId: string;
  /** Дата */
  date: Date;
  
  // Прибыль
  /** Прибыль за день */
  dailyPnl: number;
  /** Прибыль за неделю */
  weeklyPnl?: number;
  /** Прибыль за месяц */
  monthlyPnl?: number;
  /** Прибыль за всё время */
  totalPnl: number;
  
  // Комиссия
  /** Комиссия за день */
  dailyFee?: number;
  /** Общая комиссия */
  totalFee?: number;
  
  // Followers
  /** Активные followers */
  activeFollowers: number;
  /** Новые followers за день */
  newFollowers?: number;
  /** Отписавшиеся за день */
  unsubscribed?: number;
  
  /** Количество сделок за день */
  dailyTrades?: number;
}

/**
 * Copy Trading - Параметры для подписки на трейдера
 */
export interface CopySubscribeParams {
  /** ID трейдера */
  traderId: string;
  /** Режим копирования */
  copyMode: 'fixed' | 'ratio' | 'percentage';
  /** Сумма/коэффициент */
  amount?: number;
  /** Ограничения */
  maxAmountPerTrade?: number;
  maxOpenPositions?: number;
  maxLeverage?: number;
  allowedSymbols?: string[];
  autoStopLoss?: number;
  autoTakeProfit?: number;
}

/**
 * Copy Trading - Результат операции копитрейдинга
 */
export interface CopyTradingResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
}

/**
 * Copy Trading - Lead/Master Trader Status
 */
export interface LeadTraderStatus {
  /** Является ли пользователь Lead Trader */
  isLeadTrader: boolean;
  /** Время получения статуса */
  since?: Date;
  /** Количество followers */
  followersCount?: number;
  /** Активен ли статус */
  active?: boolean;
}

/**
 * Copy Trading - Символы, доступные для копитрейдинга
 */
export interface CopyTradingSymbol {
  symbol: string;
  exchange: ExchangeId;
  /** Разрешён для копитрейдинга */
  enabled: boolean;
  /** Максимальное плечо */
  maxLeverage?: number;
  /** Минимальный размер позиции */
  minQuantity?: number;
  /** Максимальный размер позиции */
  maxQuantity?: number;
  /** Точность количества */
  quantityPrecision?: number;
  /** Точность цены */
  pricePrecision?: number;
}

/**
 * Copy Trading - Параметры закрытия позиции для трейдера
 */
export interface CopyClosePositionParams {
  symbol: string;
  positionId?: string;
  trackingNumber?: string;
  quantity?: number;
  market?: boolean;
}

/**
 * Copy Trading - Параметры изменения TP/SL
 */
export interface CopyModifyTpslParams {
  symbol: string;
  positionId?: string;
  trackingNumber?: string;
  takeProfit?: number;
  stopLoss?: number;
  takeProfitRatio?: number;
  stopLossRatio?: number;
}

// ==================== MASTER TRADER TYPES ====================

/**
 * Master Trader - Заявка на получение статуса
 */
export interface MasterTraderApplication {
  exchange: ExchangeId;
  nickname?: string;
  description?: string;
  profitSharePercent: number;  // % прибыли от followers (обычно 0-30%)
  minCopyAmount?: number;      // Минимальная сумма для копирования
  allowedSymbols?: string[];   // Разрешённые символы (пусто = все)
}

/**
 * Master Trader - Настройки профиля
 */
export interface MasterTraderSettings {
  exchange: ExchangeId;
  nickname?: string;
  description?: string;
  avatar?: string;
  
  // Profit Sharing
  profitShareEnabled: boolean;
  profitSharePercent: number;
  
  // Copy Settings
  minCopyAmount: number;
  maxCopyAmount?: number;
  allowedSymbols?: string[];      // null = все разрешены
  blockedSymbols?: string[];
  
  // Restrictions
  maxFollowers?: number;
  requireApproval: boolean;       // Требовать одобрение подписчиков
  minFollowerBalance?: number;   // Минимальный баланс follower
  
  // Status
  active: boolean;
  visible: boolean;              // Виден в публичном рейтинге
  
  // Statistics (read-only)
  totalFollowers: number;
  activeFollowers: number;
  totalProfitShared: number;
  totalTradesCopied: number;
}

/**
 * Master Trader - Информация о подписчике
 */
export interface MasterFollowerInfo {
  followerId: string;
  exchange: ExchangeId;
  nickname?: string;
  avatar?: string;
  
  // Подписка
  subscribedAt: Date;
  active: boolean;
  copyMode: 'fixed' | 'ratio' | 'percentage';
  copyAmount: number;
  
  // Статистика
  totalCopiedTrades: number;
  totalVolume: number;
  totalPnl: number;
  totalProfitShared: number;
  
  // Текущее состояние
  currentPositions: number;
  lastActivity?: Date;
}

/**
 * Master Trader - Сводка прибыли
 */
export interface MasterProfitSummary {
  exchange: ExchangeId;
  period: 'day' | 'week' | 'month' | 'all';
  
  // Профит от trading
  tradingPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  
  // Профит от profit sharing
  profitSharedReceived: number;
  followersProfit: number;
  
  // Метрики
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  // Followers
  newFollowers: number;
  removedFollowers: number;
  activeFollowers: number;
}

/**
 * Master Trader - Позиция с информацией о копированиях
 */
export interface MasterTraderPosition extends CopyTraderPosition {
  // Сколько followers копируют
  followersCopyingCount: number;
  
  // Общий объём копирований
  totalCopiedVolume: number;
  
  // Tracking ID для followers
  trackingId: string;
}

/**
 * Результат операции Master Trader
 */
export interface MasterTraderResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
}

// ==================== ORPHANED ORDER DETECTION TYPES ====================

/**
 * Orphaned order - order that exists locally but not on exchange
 */
export interface OrphanedOrder {
  /** Local database ID */
  localId: string;
  /** Exchange order ID */
  orderId: string;
  /** Trading symbol */
  symbol: string;
  /** Reason for being orphaned */
  reason: 'NOT_FOUND_ON_EXCHANGE' | 'STATUS_MISMATCH' | 'QUANTITY_MISMATCH';
  /** When the orphan was detected */
  detectedAt: Date;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Result of orphaned order detection
 */
export interface OrphanedOrderResult {
  /** List of orphaned orders */
  orphaned: OrphanedOrder[];
  /** Orders confirmed to exist on exchange */
  confirmed: Array<{
    localId: string;
    orderId: string;
    symbol: string;
  }>;
  /** Errors during detection */
  errors: Array<{
    symbol: string;
    error: string;
  }>;
  /** When the detection was run */
  timestamp: Date;
}

/**
 * Result of orphaned order reconciliation
 */
export interface ReconciliationResult {
  /** Successfully reconciled orders */
  reconciled: Array<{
    localId: string;
    orderId: string;
    symbol: string;
    finalStatus: string;
    filledQuantity: number;
    avgPrice: number;
    reconciledAt: Date;
  }>;
  /** Failed reconciliation attempts */
  failed: Array<{
    localId: string;
    orderId: string;
    error: string;
  }>;
  /** Strategy used for reconciliation */
  strategy: 'MARK_CANCELLED' | 'CHECK_HISTORY';
}
