/**
 * Exchange Order Service
 * Real order execution for trading bots
 *
 * Supports: Binance, Bybit, OKX with PAPER, TESTNET, DEMO, LIVE modes
 */

import type { PrismaClient } from "@prisma/client";
import {
  ExchangeClientFactory,
  type ExchangeId,
  type TradingMode,
  type MarketType,
  type ExchangeCredentials,
  type OrderParams,
  type ExchangeOrder,
  type ExchangeOrderResult,
  type ExchangeBalance,
  type ExchangePosition,
  type TickerInfo,
} from './exchange-clients';

// Re-export types for backward compatibility
export type { ExchangeId, TradingMode, ExchangeOrder, ExchangeOrderResult, ExchangeBalance, ExchangePosition };

export interface ExchangeOrderConfig {
  exchangeId: ExchangeId;
  mode: TradingMode;
  marketType?: MarketType;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string; // For OKX, Bitget
}

// Paper trading simulation state
const paperTradingState: {
  orders: Map<string, ExchangeOrder>;
  balances: Map<string, ExchangeBalance>;
  positions: Map<string, ExchangePosition>;
} = {
  orders: new Map(),
  balances: new Map([
    ['USDT', { asset: 'USDT', free: 10000, locked: 0, total: 10000 }],
    ['BTC', { asset: 'BTC', free: 0.1, locked: 0, total: 0.1 }],
    ['ETH', { asset: 'ETH', free: 0.5, locked: 0, total: 0.5 }],
  ]),
  positions: new Map(),
};

/**
 * Get exchange API base URL based on mode
 */
export function getExchangeBaseUrl(
  exchangeId: ExchangeId,
  mode: TradingMode
): string {
  const urls: Record<ExchangeId, { live: string; testnet: string; demo: string }> = {
    binance: {
      live: "https://fapi.binance.com",
      testnet: "https://testnet.binancefuture.com",
      demo: "https://testnet.binancefuture.com"
    },
    bybit: {
      live: "https://api.bybit.com",
      testnet: "https://api-testnet.bybit.com",
      demo: "https://api-testnet.bybit.com"
    },
    okx: {
      live: "https://www.okx.com",
      testnet: "https://www.okx.com",
      demo: "https://www.okx.com"
    },
    bitget: {
      live: "https://api.bitget.com",
      testnet: "https://api.bitget.com",
      demo: "https://api.bitget.com"
    },
    bingx: {
      live: "https://open-api.bingx.com",
      testnet: "https://open-api.bingx.com",
      demo: "https://open-api.bingx.com"
    }
  };

  if (mode === "TESTNET" && exchangeId === "okx") {
    return urls[exchangeId].demo;
  }

  return mode === "LIVE"
    ? urls[exchangeId].live
    : mode === "TESTNET"
      ? urls[exchangeId].testnet
      : urls[exchangeId].demo;
}

/**
 * Check if exchange has testnet support
 */
export function exchangeHasTestnet(exchangeId: ExchangeId): boolean {
  return exchangeId === "binance" || exchangeId === "bybit";
}

/**
 * Check if exchange has demo support
 */
export function exchangeHasDemo(exchangeId: ExchangeId): boolean {
  return exchangeId === "okx" || exchangeId === "bitget" || exchangeId === "bingx";
}

/**
 * Get credentials from config
 */
function getCredentials(config: ExchangeOrderConfig): ExchangeCredentials | null {
  if (!config.apiKey || !config.apiSecret) {
    return null;
  }
  return {
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    passphrase: config.passphrase,
  };
}

/**
 * Place order on exchange
 */
export async function placeOrder(
  config: ExchangeOrderConfig,
  symbol: string,
  side: "BUY" | "SELL",
  type: "LIMIT" | "MARKET" | "STOP_LIMIT",
  amount: number,
  price?: number,
  stopPrice?: number
): Promise<ExchangeOrderResult> {
  // Paper trading simulation
  if (config.mode === "PAPER") {
    return placePaperOrder(symbol, side, type, amount, price, stopPrice);
  }

  // Real exchange execution
  const credentials = getCredentials(config);
  if (!credentials) {
    return {
      success: false,
      error: `API credentials not provided for ${config.exchangeId}`,
    };
  }

  try {
    const client = ExchangeClientFactory.createClient({
      exchangeId: config.exchangeId,
      mode: config.mode,
      marketType: config.marketType || 'futures',
      credentials,
    });

    if (!client) {
      return {
        success: false,
        error: `Unsupported exchange: ${config.exchangeId}`,
      };
    }

    const orderParams: OrderParams = {
      symbol,
      side,
      type,
      amount,
      price,
      stopPrice,
    };

    // Different methods for different exchanges
    if ('placeOrder' in client) {
      return await client.placeOrder(orderParams);
    }
    if ('placeFuturesOrder' in client && config.marketType === 'futures') {
      return await (client as any).placeFuturesOrder(orderParams);
    }

    return {
      success: false,
      error: `Order method not implemented for ${config.exchangeId}`,
    };
  } catch (error) {
    console.error(`Order placement error on ${config.exchangeId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Paper trading order simulation
 */
function placePaperOrder(
  symbol: string,
  side: "BUY" | "SELL",
  type: "LIMIT" | "MARKET" | "STOP_LIMIT",
  amount: number,
  price?: number,
  stopPrice?: number
): ExchangeOrderResult {
  const orderId = `paper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const order: ExchangeOrder = {
    id: orderId,
    exchangeOrderId: `PAPER-${Date.now()}`,
    clientOrderId: `client-${Date.now()}`,
    symbol,
    side,
    type,
    price: price || 0,
    amount,
    filledAmount: type === "MARKET" ? amount : 0,
    status: type === "MARKET" ? "FILLED" : "OPEN",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  paperTradingState.orders.set(orderId, order);

  // Update balances for market orders
  if (type === "MARKET" && price) {
    const baseAsset = symbol.replace('USDT', '');
    const quoteAsset = 'USDT';

    if (side === "BUY") {
      const cost = amount * price;
      const usdtBalance = paperTradingState.balances.get('USDT');
      if (usdtBalance && usdtBalance.free >= cost) {
        usdtBalance.free -= cost;
        usdtBalance.total -= cost;

        const baseBalance = paperTradingState.balances.get(baseAsset) || {
          asset: baseAsset,
          free: 0,
          locked: 0,
          total: 0,
        };
        baseBalance.free += amount;
        baseBalance.total += amount;
        paperTradingState.balances.set(baseAsset, baseBalance);
      }
    } else {
      const baseBalance = paperTradingState.balances.get(baseAsset);
      if (baseBalance && baseBalance.free >= amount) {
        baseBalance.free -= amount;
        baseBalance.total -= amount;

        const usdtBalance = paperTradingState.balances.get('USDT');
        if (usdtBalance) {
          const proceeds = amount * price;
          usdtBalance.free += proceeds;
          usdtBalance.total += proceeds;
        }
      }
    }
  }

  return { success: true, order };
}

/**
 * Cancel order on exchange
 */
export async function cancelOrder(
  config: ExchangeOrderConfig,
  symbol: string,
  orderId: string
): Promise<ExchangeOrderResult> {
  // Paper trading
  if (config.mode === "PAPER") {
    const order = paperTradingState.orders.get(orderId);
    if (order) {
      order.status = "CANCELLED";
      order.updatedAt = new Date();
      return { success: true, order };
    }
    return { success: false, error: "Order not found" };
  }

  // Real exchange
  const credentials = getCredentials(config);
  if (!credentials) {
    return {
      success: false,
      error: `API credentials not provided for ${config.exchangeId}`,
    };
  }

  try {
    const client = ExchangeClientFactory.createClient({
      exchangeId: config.exchangeId,
      mode: config.mode,
      marketType: config.marketType || 'futures',
      credentials,
    });

    if (!client) {
      return {
        success: false,
        error: `Unsupported exchange: ${config.exchangeId}`,
      };
    }

    return await client.cancelOrder(symbol, orderId);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get order status from exchange
 */
export async function getOrderStatus(
  config: ExchangeOrderConfig,
  symbol: string,
  orderId: string
): Promise<ExchangeOrderResult> {
  // Paper trading
  if (config.mode === "PAPER") {
    const order = paperTradingState.orders.get(orderId);
    if (order) {
      // Simulate limit order fills randomly
      if (order.status === "OPEN" && Math.random() > 0.8) {
        order.status = "FILLED";
        order.filledAmount = order.amount;
        order.updatedAt = new Date();
      }
      return { success: true, order };
    }
    return { success: false, error: "Order not found" };
  }

  // For real exchanges, query order status
  // This would require implementing query endpoints for each exchange
  return {
    success: false,
    error: `Get order status not implemented for ${config.exchangeId}`,
  };
}

/**
 * Get account balances
 */
export async function getBalances(
  config: ExchangeOrderConfig
): Promise<{ success: boolean; balances: ExchangeBalance[]; error?: string }> {
  // Paper trading
  if (config.mode === "PAPER") {
    return {
      success: true,
      balances: Array.from(paperTradingState.balances.values()),
    };
  }

  // Real exchange
  const credentials = getCredentials(config);
  if (!credentials) {
    return {
      success: false,
      balances: [],
      error: `API credentials not provided for ${config.exchangeId}`,
    };
  }

  try {
    const client = ExchangeClientFactory.createClient({
      exchangeId: config.exchangeId,
      mode: config.mode,
      marketType: config.marketType || 'futures',
      credentials,
    });

    if (!client) {
      return {
        success: false,
        balances: [],
        error: `Unsupported exchange: ${config.exchangeId}`,
      };
    }

    let balances: ExchangeBalance[];

    // Different methods for different exchanges
    if (config.exchangeId === 'binance' && config.marketType === 'futures') {
      balances = await (client as any).getFuturesBalances();
    } else {
      balances = await client.getBalances();
    }

    return { success: true, balances };
  } catch (error) {
    return {
      success: false,
      balances: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get open positions
 */
export async function getPositions(
  config: ExchangeOrderConfig
): Promise<{ success: boolean; positions: ExchangePosition[]; error?: string }> {
  // Paper trading
  if (config.mode === "PAPER") {
    return {
      success: true,
      positions: Array.from(paperTradingState.positions.values()),
    };
  }

  // Real exchange
  const credentials = getCredentials(config);
  if (!credentials) {
    return {
      success: false,
      positions: [],
      error: `API credentials not provided for ${config.exchangeId}`,
    };
  }

  try {
    const client = ExchangeClientFactory.createClient({
      exchangeId: config.exchangeId,
      mode: config.mode,
      marketType: config.marketType || 'futures',
      credentials,
    });

    if (!client) {
      return {
        success: false,
        positions: [],
        error: `Unsupported exchange: ${config.exchangeId}`,
      };
    }

    const positions = await client.getPositions();
    return { success: true, positions };
  } catch (error) {
    return {
      success: false,
      positions: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Set leverage for symbol
 */
export async function setLeverage(
  config: ExchangeOrderConfig,
  symbol: string,
  leverage: number
): Promise<{ success: boolean; error?: string; leverage?: number }> {
  // Paper trading
  if (config.mode === "PAPER") {
    return { success: true, leverage };
  }

  // Real exchange
  const credentials = getCredentials(config);
  if (!credentials) {
    return {
      success: false,
      error: `API credentials not provided for ${config.exchangeId}`,
    };
  }

  try {
    const client = ExchangeClientFactory.createClient({
      exchangeId: config.exchangeId,
      mode: config.mode,
      marketType: config.marketType || 'futures',
      credentials,
    });

    if (!client) {
      return {
        success: false,
        error: `Unsupported exchange: ${config.exchangeId}`,
      };
    }

    const result = await client.setLeverage(symbol, leverage);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get current ticker
 */
export async function getTicker(
  config: ExchangeOrderConfig,
  symbol: string
): Promise<{ success: boolean; ticker?: TickerInfo; error?: string }> {
  try {
    const client = ExchangeClientFactory.createClient({
      exchangeId: config.exchangeId,
      mode: config.mode,
      marketType: config.marketType || 'futures',
      credentials: getCredentials(config) || { apiKey: '', apiSecret: '' },
    });

    if (!client) {
      return {
        success: false,
        error: `Unsupported exchange: ${config.exchangeId}`,
      };
    }

    const ticker = await client.getTicker(symbol);
    return { success: true, ticker };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test exchange connection
 */
export async function testConnection(
  config: ExchangeOrderConfig
): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now();

  // Paper trading
  if (config.mode === "PAPER") {
    return {
      success: true,
      message: "Paper trading connection successful",
      latency: 1,
    };
  }

  try {
    const credentials = getCredentials(config);
    if (!credentials) {
      return {
        success: false,
        message: "API credentials not provided",
      };
    }

    const client = ExchangeClientFactory.createClient({
      exchangeId: config.exchangeId,
      mode: config.mode,
      marketType: config.marketType || 'futures',
      credentials,
    });

    if (!client) {
      return {
        success: false,
        message: `Unsupported exchange: ${config.exchangeId}`,
      };
    }

    // Test by getting balances
    const balances = await client.getBalances();
    const latency = Date.now() - startTime;

    return {
      success: true,
      message: `Connected to ${config.exchangeId} (${config.mode}) - ${balances.length} assets found`,
      latency,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
      latency: Date.now() - startTime,
    };
  }
}

export default {
  getExchangeBaseUrl,
  exchangeHasTestnet,
  exchangeHasDemo,
  placeOrder,
  cancelOrder,
  getOrderStatus,
  getBalances,
  getPositions,
  setLeverage,
  getTicker,
  testConnection,
};
