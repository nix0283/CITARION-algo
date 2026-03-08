/**
 * Real Trading API Endpoint
 * 
 * Handles trading operations using exchange clients
 * Supports: LIVE, TESTNET, DEMO trading modes
 * 
 * Authentication:
 * - Session-based for web users
 * - X-API-Key header for bot/service access
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { 
  createExchangeClient, 
  ExchangeId, 
  MarketType, 
  TradingMode,
  EXCHANGE_CONFIGS,
  toDemoSymbol,
} from "@/lib/exchange";
import { withAuth, AuthContext, getDefaultUser } from "@/lib/auth-utils";

interface TradeRequest {
  symbol: string;
  direction: "LONG" | "SHORT";
  amount: number;
  leverage: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  isDemo: boolean;
  accountId?: string;
  exchangeId?: string;
  orderType?: "market" | "limit";
  price?: number;
  clientOrderId?: string;
  tradingMode?: TradingMode;
}

interface TradeRequestBody extends TradeRequest {
  // Optional field to skip auth for demo trading
  _skipAuth?: boolean;
}

/**
 * Main POST handler - wrapped with authentication
 */
const handlePost = async (request: NextRequest, context: AuthContext) => {
  try {
    const body: TradeRequestBody = await request.json();
    const {
      symbol,
      direction,
      amount,
      leverage,
      stopLoss,
      takeProfit,
      isDemo,
      accountId,
      orderType = "market",
      price,
      clientOrderId,
      tradingMode,
    } = body;

    // Validate required fields
    if (!symbol || !direction || !amount || !leverage) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, direction, amount, leverage" },
        { status: 400 }
      );
    }

    // Validate amount
    if (amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Validate leverage (Aster supports up to 1001x, others up to 125x)
    const targetExchangeId = body.exchangeId || "binance";
    const maxLeverage = targetExchangeId === "aster" ? 1001 : 125;
    if (leverage < 1 || leverage > maxLeverage) {
      return NextResponse.json(
        { error: `Leverage must be between 1 and ${maxLeverage} for ${targetExchangeId}` },
        { status: 400 }
      );
    }

    // Determine trading mode
    let actualTradingMode: TradingMode;
    if (tradingMode) {
      actualTradingMode = tradingMode;
    } else if (isDemo) {
      actualTradingMode = "DEMO";
    } else {
      actualTradingMode = "LIVE";
    }

    // Log the authenticated request
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        userId: context.userId,
        message: `[AUTH] Trade request from ${context.authType}`,
        details: JSON.stringify({
          authType: context.authType,
          apiKeyId: context.apiKeyId,
          symbol,
          direction,
          amount,
          leverage,
          tradingMode: actualTradingMode,
        }),
      },
    });

    // Get or create account
    let account;
    
    if (accountId) {
      account = await db.account.findUnique({
        where: { id: accountId },
      });
      
      // Verify account belongs to authenticated user
      if (account && account.userId !== context.userId) {
        return NextResponse.json(
          { error: "Account not found or access denied" },
          { status: 403 }
        );
      }
    }
    
    // If no account found, get or create account for the authenticated user
    if (!account) {
      // Find existing account for this user and exchange
      account = await db.account.findFirst({
        where: { 
          userId: context.userId, 
          accountType: isDemo ? "DEMO" : "REAL", 
          exchangeId: targetExchangeId 
        }
      });
      
      if (!account) {
        // Get exchange display name
        const exchangeName = EXCHANGE_CONFIGS[targetExchangeId as ExchangeId]?.name || targetExchangeId;
        
        // Create new account for this user
        account = await db.account.create({
          data: {
            userId: context.userId,
            accountType: isDemo ? "DEMO" : "REAL",
            exchangeId: targetExchangeId,
            exchangeType: "futures",
            exchangeName: `${exchangeName} ${isDemo ? "Demo" : "Live"}`,
            virtualBalance: isDemo ? JSON.stringify({ USDT: 10000 }) : null,
            isActive: true,
          }
        });
      }
    }

    // Handle different trading modes
    switch (actualTradingMode) {
      case "DEMO":
        // Check if exchange supports demo mode AND has API credentials
        const exchangeConfig = EXCHANGE_CONFIGS[account.exchangeId as ExchangeId];
        const hasCredentials = account.apiKey && account.apiSecret;
        
        if (!exchangeConfig?.hasDemo || !hasCredentials) {
          // Fallback to virtual trading if no demo support or no credentials
          return handleVirtualDemoTrade(body, account, context);
        }
        return handleExchangeTrade(body, account, "DEMO", context);
      
      case "TESTNET":
        // Check if exchange supports testnet AND has API credentials
        const testnetConfig = EXCHANGE_CONFIGS[account.exchangeId as ExchangeId];
        const hasTestnetCredentials = account.apiKey && account.apiSecret;
        
        if (!testnetConfig?.hasTestnet) {
          return NextResponse.json(
            { error: `${account.exchangeId} does not support testnet` },
            { status: 400 }
          );
        }
        
        if (!hasTestnetCredentials) {
          // Fallback to virtual trading for testnet without credentials
          return handleVirtualDemoTrade(body, account, context);
        }
        return handleExchangeTrade(body, account, "TESTNET", context);
      
      case "LIVE":
      default:
        // For LIVE mode without credentials, use virtual demo
        if (!account.apiKey || !account.apiSecret) {
          return handleVirtualDemoTrade(body, account, context);
        }
        return handleExchangeTrade(body, account, "LIVE", context);
    }
  } catch (error) {
    console.error("Trade open error:", error);
    return NextResponse.json(
      { error: "Failed to execute trade", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
};

/**
 * GET endpoint to fetch open positions - also wrapped with auth
 */
const handleGet = async (request: NextRequest, context: AuthContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const isDemo = searchParams.get("demo") === "true";
    const accountId = searchParams.get("accountId");
    const tradingMode = searchParams.get("tradingMode") as TradingMode | null;

    const whereClause: {
      status: string;
      isDemo?: boolean;
      accountId?: string;
      account?: { userId: string };
    } = {
      status: "OPEN",
      account: { userId: context.userId }, // Only show user's own positions
    };

    if (tradingMode === "LIVE") {
      whereClause.isDemo = false;
    } else if (tradingMode === "DEMO" || tradingMode === "TESTNET") {
      whereClause.isDemo = true;
    } else if (isDemo !== undefined) {
      whereClause.isDemo = isDemo;
    }

    if (accountId) {
      whereClause.accountId = accountId;
    }

    const positions = await db.position.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        account: {
          select: {
            exchangeId: true,
            exchangeName: true,
            isTestnet: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      positions,
      count: positions.length,
      authType: context.authType,
    });
  } catch (error) {
    console.error("Fetch positions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
};

// Export wrapped handlers
export const POST = withAuth(handlePost);
export const GET = withAuth(handleGet);

/**
 * Handle Virtual Demo Trading (internal simulation)
 */
async function handleVirtualDemoTrade(
  body: TradeRequest, 
  account: {
    id: string;
    userId: string;
    virtualBalance: string | null;
  },
  context: AuthContext
) {
  const { symbol, direction, amount, leverage, stopLoss, takeProfit, orderType, price } = body;

  // Get current price from market price cache
  const marketPrice = await db.marketPrice.findUnique({
    where: { symbol },
  });

  const currentPrice = marketPrice?.price || price || 50000;

  // Calculate position details
  const positionSize = amount * leverage;
  const margin = amount;
  const quantity = positionSize / currentPrice;
  const fee = positionSize * 0.0004;

  // Check balance
  const balanceData = account.virtualBalance ? JSON.parse(account.virtualBalance) : { USDT: 10000 };
  const usdtBalance = balanceData.USDT || 0;

  if (usdtBalance < amount + fee) {
    return NextResponse.json(
      { error: `Insufficient balance. Available: ${usdtBalance.toFixed(2)} USDT` },
      { status: 400 }
    );
  }

  // Deduct margin and fee
  balanceData.USDT = usdtBalance - amount - fee;
  await db.account.update({
    where: { id: account.id },
    data: { virtualBalance: JSON.stringify(balanceData) },
  });

  // Calculate liquidation price
  let liquidationPrice: number;
  if (direction === "LONG") {
    liquidationPrice = currentPrice * (1 - (1 / leverage) + 0.005);
  } else {
    liquidationPrice = currentPrice * (1 + (1 / leverage) - 0.005);
  }

  // Create position
  const position = await db.position.create({
    data: {
      accountId: account.id,
      symbol,
      direction,
      status: "OPEN",
      totalAmount: quantity,
      filledAmount: quantity,
      avgEntryPrice: currentPrice,
      currentPrice,
      leverage,
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      unrealizedPnl: 0,
      realizedPnl: 0,
      openFee: fee,
      isDemo: true,
    },
  });

  // Create trade record
  const trade = await db.trade.create({
    data: {
      userId: context.userId,
      accountId: account.id,
      symbol,
      direction,
      status: "OPEN",
      entryPrice: currentPrice,
      entryTime: new Date(),
      amount: quantity,
      leverage,
      stopLoss: stopLoss || null,
      fee,
      isDemo: true,
      positionId: position.id,
      signalSource: context.authType === "api_key" ? "API" : "APP",
    },
  });

  // Log the trade
  await db.systemLog.create({
    data: {
      level: "INFO",
      category: "TRADE",
      userId: context.userId,
      message: `[VIRTUAL DEMO] Opened ${direction} position: ${symbol} @ $${currentPrice}`,
      details: JSON.stringify({
        positionId: position.id,
        tradeId: trade.id,
        quantity,
        leverage,
        margin,
        fee,
        liquidationPrice,
        authType: context.authType,
        apiKeyId: context.apiKeyId,
      }),
    },
  });

  return NextResponse.json({
    success: true,
    trade: {
      id: trade.id,
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      amount: trade.amount,
      leverage: trade.leverage,
      fee: trade.fee,
      status: trade.status,
    },
    position: {
      id: position.id,
      symbol: position.symbol,
      direction: position.direction,
      totalAmount: position.totalAmount,
      avgEntryPrice: position.avgEntryPrice,
      currentPrice: position.currentPrice,
      leverage: position.leverage,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      liquidationPrice,
      margin,
      fee,
      unrealizedPnl: 0,
    },
    balance: balanceData,
    tradingMode: "DEMO",
    isDemo: true,
    authType: context.authType,
    message: `[VIRTUAL DEMO] Позиция ${direction} открыта: ${quantity.toFixed(6)} ${symbol.replace("USDT", "")} @ $${currentPrice.toFixed(2)}`,
  });
}

/**
 * Handle Exchange Trading (LIVE, TESTNET, DEMO via exchange)
 */
async function handleExchangeTrade(
  body: TradeRequest,
  account: {
    id: string;
    userId: string;
    exchangeId: string;
    exchangeType: string;
    isTestnet: boolean;
    apiKey: string | null;
    apiSecret: string | null;
    apiPassphrase: string | null;
    accountType: string;
  },
  tradingMode: TradingMode,
  context: AuthContext
) {
  const { symbol, direction, amount, leverage, stopLoss, takeProfit, orderType, price, clientOrderId } = body;

  // For non-LIVE modes, we need API credentials
  if (tradingMode !== "LIVE" && (!account.apiKey || !account.apiSecret)) {
    return NextResponse.json(
      { error: "API credentials required for testnet/demo trading" },
      { status: 400 }
    );
  }

  // For LIVE mode, ensure we have credentials
  if (tradingMode === "LIVE" && account.accountType !== "DEMO" && (!account.apiKey || !account.apiSecret)) {
    return NextResponse.json(
      { error: "API credentials not configured for this account" },
      { status: 400 }
    );
  }

  // Decrypt API credentials if available
  let decryptedApiKey: string | undefined;
  let decryptedApiSecret: string | undefined;

  if (account.apiKey && account.apiSecret) {
    try {
      decryptedApiKey = decryptApiKey(account.apiKey);
      decryptedApiSecret = decryptApiKey(account.apiSecret);
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt API credentials" },
        { status: 500 }
      );
    }
  }

  const exchangeId = account.exchangeId as ExchangeId;
  const marketType = account.exchangeType as MarketType;

  try {
    const client = createExchangeClient(exchangeId, {
      credentials: {
        apiKey: decryptedApiKey || "",
        apiSecret: decryptedApiSecret || "",
        passphrase: account.apiPassphrase || undefined,
      },
      marketType,
      testnet: tradingMode === "TESTNET",
      tradingMode,
    });

    // Test connection first
    const connectionTest = await client.testConnection();
    if (!connectionTest.success) {
      return NextResponse.json(
        { error: `Exchange connection failed: ${connectionTest.message}` },
        { status: 400 }
      );
    }

    // Get current price
    const ticker = await client.getTicker(symbol);
    const currentPrice = ticker.last;

    // Convert symbol for demo mode if needed (e.g., Bitget: BTCUSDT -> SBTCUSDT)
    const tradingSymbol = tradingMode === "DEMO" ? toDemoSymbol(symbol, exchangeId) : symbol;

    // Set leverage for futures
    if (marketType !== "spot" && leverage > 1) {
      await client.setLeverage({
        symbol: tradingSymbol,
        leverage,
        marginMode: "isolated",
      });
    }

    // Calculate quantity
    const quantity = (amount * leverage) / currentPrice;

    // Create order
    const orderResult = await client.createOrder({
      symbol: tradingSymbol,
      side: direction === "LONG" ? "buy" : "sell",
      type: orderType || "market",
      quantity,
      price: orderType === "limit" ? price : undefined,
      leverage,
      clientOrderId,
      reduceOnly: false,
    });

    // Set SL/TP after order if needed (handled separately on most exchanges)
    if (orderResult.success && (stopLoss || takeProfit)) {
      try {
        // Note: SL/TP orders would be set via separate API calls on most exchanges
        console.log(`[Trade] Order placed, SL/TP would need separate handling: SL=${stopLoss}, TP=${takeProfit}`);
      } catch (slTpError) {
        console.warn(`[Trade] Failed to set SL/TP:`, slTpError);
      }
    }

    if (!orderResult.success) {
      return NextResponse.json(
        { error: orderResult.error || "Order failed" },
        { status: 400 }
      );
    }

    // Log the trade
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        userId: context.userId,
        message: `[${tradingMode}] Opened ${direction} position on ${exchangeId}: ${symbol} @ $${currentPrice}`,
        details: JSON.stringify({
          orderId: orderResult.order?.id,
          symbol,
          tradingSymbol,
          direction,
          quantity,
          leverage,
          currentPrice,
          account: account.id,
          tradingMode,
          authType: context.authType,
          apiKeyId: context.apiKeyId,
        }),
      },
    });

    // Create local position record
    const position = await db.position.create({
      data: {
        accountId: account.id,
        symbol,
        direction,
        status: "OPEN",
        totalAmount: quantity,
        filledAmount: quantity,
        avgEntryPrice: currentPrice,
        currentPrice,
        leverage,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        unrealizedPnl: 0,
        realizedPnl: 0,
        openFee: 0,
        isDemo: tradingMode !== "LIVE",
      },
    });

    // Create trade record
    const trade = await db.trade.create({
      data: {
        userId: context.userId,
        accountId: account.id,
        symbol,
        direction,
        status: "OPEN",
        entryPrice: currentPrice,
        entryTime: new Date(),
        amount: quantity,
        leverage,
        stopLoss: stopLoss || null,
        fee: 0,
        isDemo: tradingMode !== "LIVE",
        positionId: position.id,
        signalSource: context.authType === "api_key" ? "API" : "APP",
      },
    });

    return NextResponse.json({
      success: true,
      trade: {
        id: trade.id,
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice: currentPrice,
        amount: quantity,
        leverage: trade.leverage,
        status: trade.status,
      },
      position: {
        id: position.id,
        symbol: position.symbol,
        direction: position.direction,
        totalAmount: quantity,
        avgEntryPrice: currentPrice,
        leverage: position.leverage,
      },
      order: orderResult.order,
      exchange: exchangeId,
      tradingMode,
      isDemo: tradingMode !== "LIVE",
      authType: context.authType,
      message: `[${tradingMode}] Позиция ${direction} открыта на ${exchangeId}: ${quantity.toFixed(6)} ${symbol.replace("USDT", "")} @ $${currentPrice.toFixed(2)}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    await db.systemLog.create({
      data: {
        level: "ERROR",
        category: "TRADE",
        userId: context.userId,
        message: `[${tradingMode}] Failed to open position on ${exchangeId}: ${errorMessage}`,
        details: JSON.stringify({
          symbol,
          direction,
          amount,
          leverage,
          account: account.id,
          tradingMode,
          error: errorMessage,
          authType: context.authType,
        }),
      },
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
