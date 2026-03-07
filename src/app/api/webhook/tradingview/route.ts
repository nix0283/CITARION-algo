/**
 * TradingView Webhook Handler
 * 
 * Security Features:
 * - HMAC-SHA256 Signature Validation
 * - Rate Limiting (10 requests per minute per IP)
 * 
 * Поддержка autoExecute флага из настроек бота:
 * - Если autoExecuteEnabled = true и источник TRADINGVIEW - автоматическое исполнение
 * - Если autoExecuteRequiresConfirmation = true - требуется подтверждение через UI
 * - Логирование всех webhook запросов
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseSignal, formatSignal, type ParsedSignal } from "@/lib/signal-parser";
import { notifyAll, notifyPositionOpened, notifyTelegram } from "@/lib/notification-service";
import { getDefaultUserId } from "@/lib/default-user";

// ==================== RATE LIMITING ====================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory rate limit store (resets on server restart)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  maxRequests: 10,           // Maximum requests per window
  windowMs: 60 * 1000,       // Window size in milliseconds (1 minute)
  cleanupInterval: 5 * 60 * 1000, // Cleanup old entries every 5 minutes
};

// Cleanup old rate limit entries periodically
let lastCleanup = Date.now();
function cleanupRateLimitStore() {
  const now = Date.now();
  if (now - lastCleanup > RATE_LIMIT_CONFIG.cleanupInterval) {
    for (const [ip, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(ip);
      }
    }
    lastCleanup = now;
  }
}

/**
 * Check rate limit for an IP address
 * @returns { allowed: boolean, remaining: number, resetTime: number }
 */
function checkRateLimit(ipAddress: string): { allowed: boolean; remaining: number; resetTime: number; retryAfter?: number } {
  cleanupRateLimitStore();
  
  const now = Date.now();
  const entry = rateLimitStore.get(ipAddress);
  
  if (!entry || now > entry.resetTime) {
    // Create new entry
    rateLimitStore.set(ipAddress, {
      count: 1,
      resetTime: now + RATE_LIMIT_CONFIG.windowMs,
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT_CONFIG.maxRequests - 1,
      resetTime: now + RATE_LIMIT_CONFIG.windowMs,
    };
  }
  
  if (entry.count >= RATE_LIMIT_CONFIG.maxRequests) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
    };
  }
  
  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: RATE_LIMIT_CONFIG.maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

// ==================== SIGNATURE VALIDATION ====================

/**
 * Validate HMAC-SHA256 signature from TradingView
 * 
 * TradingView sends signature in X-TradingView-Signature header
 * The signature is HMAC-SHA256 of the raw request body
 */
function validateSignature(body: string, signature: string | null, secret: string | undefined): { valid: boolean; error?: string } {
  // If no secret configured, skip validation (development mode)
  if (!secret) {
    console.warn("[TradingView] WARNING: TRADINGVIEW_WEBHOOK_SECRET not configured - signature validation skipped");
    return { valid: true };
  }
  
  // If secret is configured but no signature provided
  if (!signature) {
    return { 
      valid: false, 
      error: "Missing X-TradingView-Signature header. Configure your TradingView alert to include signature." 
    };
  }
  
  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: "Invalid signature format" };
    }
    
    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    
    if (!isValid) {
      return { valid: false, error: "Invalid signature - request could not be authenticated" };
    }
    
    return { valid: true };
  } catch {
    // Handle invalid hex format
    return { valid: false, error: "Invalid signature format" };
  }
}

// ==================== SIGNAL ID MANAGEMENT ====================

async function getNextSignalId(): Promise<number> {
  const counter = await db.signalIdCounter.upsert({
    where: { id: "signal_counter" },
    update: { lastId: { increment: 1 } },
    create: { id: "signal_counter", lastId: 1 },
  });
  return counter.lastId;
}

// ==================== EXECUTE SIGNAL ====================

async function executeSignal(
  signal: ParsedSignal,
  signalId: number,
  autoExecute: boolean = true
): Promise<{ success: boolean; message: string; tradeId?: string; requiresConfirmation?: boolean }> {
  try {
    // Determine exchange type based on market type
    const exchangeType = signal.marketType === "SPOT" ? "spot" : "futures";

    // Get bot config for settings
    const botConfig = await db.botConfig.findFirst({
      where: { isActive: true },
    });

    // Check autoExecute settings
    if (botConfig && !botConfig.autoExecuteEnabled && autoExecute) {
      // Signal parsed but not executed - waiting for confirmation
      return {
        success: true,
        message: `Signal #${signalId} parsed and waiting for confirmation`,
        requiresConfirmation: true,
      };
    }

    // Check source restrictions
    if (botConfig?.autoExecuteSources) {
      const allowedSources = JSON.parse(botConfig.autoExecuteSources);
      if (!allowedSources.includes("TRADINGVIEW")) {
        return {
          success: true,
          message: `Signal #${signalId} parsed but TradingView auto-execute not allowed`,
          requiresConfirmation: true,
        };
      }
    }

    // Get demo account
    let account = await db.account.findFirst({
      where: {
        accountType: "DEMO",
        exchangeType: exchangeType,
      },
    });

    if (!account) {
      const userId = await getDefaultUserId();
      account = await db.account.create({
        data: {
          userId,
          accountType: "DEMO",
          exchangeId: "binance",
          exchangeType: exchangeType,
          exchangeName: signal.marketType === "SPOT" ? "Binance Spot" : "Binance Futures",
          virtualBalance: JSON.stringify({ USDT: 10000 }),
          isActive: true,
        },
      });
    }

    const leverage = signal.marketType === "SPOT" ? 1 : signal.leverage || botConfig?.leverage || 10;
    const tradeAmount = botConfig?.tradeAmount || 100;

    // If it's a close signal, find and close position
    if (signal.action === "CLOSE") {
      const position = await db.position.findFirst({
        where: {
          symbol: signal.symbol,
          status: "OPEN",
        },
      });

      if (position) {
        await db.position.update({
          where: { id: position.id },
          data: { status: "CLOSED" },
        });

        await db.signal.update({
          where: { signalId },
          data: { status: "CLOSED", closedAt: new Date(), closeReason: "SIGNAL" },
        });

        return { success: true, message: `Position ${signal.symbol} closed`, tradeId: position.id };
      }

      return { success: false, message: `No open position found for ${signal.symbol}` };
    }

    // Get current price (use first entry price or demo price)
    const entryPrice = signal.entryPrices[0] || 60000;

    // Create position
    const position = await db.position.create({
      data: {
        accountId: account.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: "OPEN",
        totalAmount: (tradeAmount * leverage) / entryPrice,
        filledAmount: (tradeAmount * leverage) / entryPrice,
        avgEntryPrice: entryPrice,
        currentPrice: entryPrice,
        leverage,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfits[0]?.price,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isDemo: true,
      },
    });

    // Create trade
    const userId = await getDefaultUserId();
    const trade = await db.trade.create({
      data: {
        userId,
        accountId: account.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: "OPEN",
        entryPrice,
        entryTime: new Date(),
        amount: (tradeAmount * leverage) / entryPrice,
        leverage,
        stopLoss: signal.stopLoss,
        fee: tradeAmount * leverage * 0.0004,
        isDemo: true,
        signalSource: "TRADINGVIEW",
        positionId: position.id,
      },
    });

    // Update signal with position reference
    await db.signal.update({
      where: { signalId },
      data: {
        status: "ACTIVE",
        positionId: position.id,
        processedAt: new Date(),
      },
    });

    // Log
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        message: `TradingView signal #${signalId} executed: ${signal.symbol} ${signal.direction} (${signal.marketType})`,
        details: JSON.stringify({ signalId, tradeId: trade.id, marketType: signal.marketType, autoExecute }),
      },
    });

    // Send notifications
    const modeLabel = "[DEMO] ";
    await notifyTelegram({
      type: "POSITION_OPENED",
      title: `${modeLabel}📡 TradingView Signal #${signalId}`,
      message: `${signal.direction === "LONG" ? "🟢" : "🔴"} ${signal.symbol} ${signal.direction}\nEntry: $${entryPrice.toLocaleString()}\nLeverage: ${leverage}x\nSource: TradingView`,
      data: { signalId, symbol: signal.symbol, direction: signal.direction },
      priority: "normal",
    });

    return {
      success: true,
      message: `Signal #${signalId}: ${signal.direction} ${signal.symbol} @ $${entryPrice} (${signal.marketType}, Leverage: ${leverage}x)`,
      tradeId: trade.id,
    };
  } catch (error) {
    console.error("Execute signal error:", error);
    return { success: false, message: "Failed to execute signal" };
  }
}

// ==================== API ROUTES ====================

// POST - Receive TradingView webhook
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  try {
    // ==================== RATE LIMITING ====================
    const rateLimitResult = checkRateLimit(ipAddress);
    
    if (!rateLimitResult.allowed) {
      // Log rate limit hit
      await db.systemLog.create({
        data: {
          level: "WARN",
          category: "SECURITY",
          message: `Rate limit exceeded for TradingView webhook`,
          details: JSON.stringify({ 
            ipAddress, 
            retryAfter: rateLimitResult.retryAfter,
            userAgent 
          }),
        },
      });
      
      return NextResponse.json(
        { 
          error: "Rate limit exceeded", 
          retryAfter: rateLimitResult.retryAfter,
          message: `Too many requests. Try again in ${rateLimitResult.retryAfter} seconds.`
        },
        { 
          status: 429,
          headers: {
            "Retry-After": String(rateLimitResult.retryAfter),
            "X-RateLimit-Limit": String(RATE_LIMIT_CONFIG.maxRequests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetTime / 1000)),
          }
        }
      );
    }

    // Get raw body for signature validation
    const body = await request.text();
    const signature = request.headers.get("X-TradingView-Signature");
    const secret = process.env.TRADINGVIEW_WEBHOOK_SECRET;

    // ==================== SIGNATURE VALIDATION ====================
    const signatureResult = validateSignature(body, signature, secret);
    
    if (!signatureResult.valid) {
      // Log invalid signature attempt
      await db.systemLog.create({
        data: {
          level: "ERROR",
          category: "SECURITY",
          message: `Invalid TradingView webhook signature`,
          details: JSON.stringify({ 
            ipAddress, 
            error: signatureResult.error,
            hasSignature: !!signature,
            userAgent 
          }),
        },
      });
      
      return NextResponse.json(
        { 
          error: "Unauthorized", 
          message: signatureResult.error,
          hint: "Ensure your TradingView alert includes the correct secret key."
        },
        { status: 401 }
      );
    }

    console.log("[TradingView] Webhook received:", body.substring(0, 500));

    // Parse the signal using common parser
    const parsedSignal = parseSignal(body);

    if (!parsedSignal) {
      // Log failed parse
      await db.tradingViewWebhookLog.create({
        data: {
          rawPayload: body,
          contentType: "application/json",
          status: "FAILED",
          parseError: "Could not parse signal - invalid format or missing required fields",
          ipAddress,
          userAgent,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: "Could not parse TradingView alert",
          hint: "Ensure signal contains coin pair (e.g., BTC/USDT) and entry/exit targets",
          received: body.substring(0, 1000),
        },
        { 
          status: 400,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMIT_CONFIG.maxRequests),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
            "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetTime / 1000)),
          }
        }
      );
    }

    // Get next signal ID
    const signalId = await getNextSignalId();

    // Save signal to database
    const signal = await db.signal.create({
      data: {
        signalId,
        source: "TRADINGVIEW",
        sourceMessage: body,
        symbol: parsedSignal.symbol,
        direction: parsedSignal.direction,
        action: parsedSignal.action,
        marketType: parsedSignal.marketType,
        entryPrices: JSON.stringify(parsedSignal.entryPrices),
        entryZone: parsedSignal.entryZone ? JSON.stringify(parsedSignal.entryZone) : null,
        takeProfits: JSON.stringify(parsedSignal.takeProfits),
        stopLoss: parsedSignal.stopLoss,
        leverage: parsedSignal.leverage,
        leverageType: parsedSignal.leverageType,
        signalType: parsedSignal.signalType,
        trailingConfig: parsedSignal.trailingConfig ? JSON.stringify(parsedSignal.trailingConfig) : null,
        amountPerTrade: parsedSignal.amountPerTrade,
        riskPercentage: parsedSignal.riskPercentage,
        exchanges: JSON.stringify(parsedSignal.exchanges),
        status: "PENDING",
      },
    });

    // Log successful parse
    await db.tradingViewWebhookLog.create({
      data: {
        rawPayload: body,
        contentType: "application/json",
        symbol: parsedSignal.symbol,
        action: parsedSignal.action,
        direction: parsedSignal.direction,
        stopLoss: parsedSignal.stopLoss,
        takeProfits: JSON.stringify(parsedSignal.takeProfits),
        leverage: parsedSignal.leverage,
        status: "PARSED",
        confidence: parsedSignal.confidence,
        ipAddress,
        userAgent,
      },
    });

    // Execute the signal (with autoExecute from bot config)
    const result = await executeSignal(parsedSignal, signalId);

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: result.success,
      signalId,
      signal: {
        symbol: parsedSignal.symbol,
        direction: parsedSignal.direction,
        marketType: parsedSignal.marketType,
        action: parsedSignal.action,
        entryPrices: parsedSignal.entryPrices,
        stopLoss: parsedSignal.stopLoss,
        takeProfits: parsedSignal.takeProfits,
        leverage: parsedSignal.leverage,
        signalType: parsedSignal.signalType,
        formatted: formatSignal(parsedSignal),
      },
      message: result.message,
      tradeId: result.tradeId,
      requiresConfirmation: result.requiresConfirmation,
      processingTime: `${processingTime}ms`,
    }, {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT_CONFIG.maxRequests),
        "X-RateLimit-Remaining": String(rateLimitResult.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetTime / 1000)),
      }
    });
  } catch (error) {
    console.error("[TradingView] Webhook error:", error);

    // Log error
    await db.systemLog.create({
      data: {
        level: "ERROR",
        category: "SIGNAL",
        message: "TradingView webhook processing failed",
        details: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", ipAddress }),
      },
    });

    return NextResponse.json(
      { error: "Webhook processing failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET - Webhook info and documentation
export async function GET() {
  // Get bot config for autoExecute info
  const botConfig = await db.botConfig.findFirst({
    where: { isActive: true },
    select: {
      autoExecuteEnabled: true,
      autoExecuteSources: true,
      autoExecuteRequiresConfirmation: true,
    },
  });

  const secretConfigured = !!process.env.TRADINGVIEW_WEBHOOK_SECRET;

  return NextResponse.json({
    success: true,
    message: "TradingView Webhook Endpoint - Cornix Compatible",
    security: {
      signatureValidation: {
        enabled: secretConfigured,
        algorithm: "HMAC-SHA256",
        header: "X-TradingView-Signature",
        note: secretConfigured 
          ? "Signature validation is ENABLED. Ensure your TradingView alerts include the secret key."
          : "Signature validation is DISABLED. Set TRADINGVIEW_WEBHOOK_SECRET environment variable to enable.",
      },
      rateLimiting: {
        enabled: true,
        limit: `${RATE_LIMIT_CONFIG.maxRequests} requests per minute per IP`,
        headers: {
          "X-RateLimit-Limit": "Maximum requests allowed",
          "X-RateLimit-Remaining": "Requests remaining in current window",
          "X-RateLimit-Reset": "Unix timestamp when the window resets",
        },
      },
    },
    autoExecute: {
      enabled: botConfig?.autoExecuteEnabled ?? false,
      sources: botConfig?.autoExecuteSources ? JSON.parse(botConfig.autoExecuteSources) : [],
      requiresConfirmation: botConfig?.autoExecuteRequiresConfirmation ?? true,
    },
    usage: {
      method: "POST",
      contentType: "application/json or text/plain",
      importantNote: "Signals containing word 'spot' or 'спот' are SPOT trades. All others are FUTURES.",
      setupInstructions: {
        step1: "Go to TradingView Alert dialog",
        step2: "Set webhook URL to your endpoint",
        step3: "If secret is configured, add the secret key in alert message",
        step4: "Use provided alert templates (see /docs/tradingview-templates.md)",
      },
    },
    commands: {
      signalManagement: {
        "id reset / сброс id": "Reset signal ID counter",
        "clear base / очистить базу": "Clear all signals and reset ID",
        "BTCUSDT tp2 100": "Update TP2 for BTCUSDT",
        "BTCUSDT sl 95": "Update stop loss for BTCUSDT",
        "BTCUSDT close": "Close active signal for BTCUSDT",
      },
    },
    formats: [
      {
        name: "Cornix Free Text (Futures)",
        example: `⚡⚡ #BTC/USDT ⚡⚡
Exchanges: Binance Futures
Signal Type: Regular (Long)
Leverage: Isolated (5X)
Entry Zone: 38766.9 - 38766.9
Take-Profit Targets: 1) 39000 2) 39500 3) 40000
Stop Targets: 1) 38000`,
        description: "Full format for futures signals. No 'spot' keyword means futures.",
      },
      {
        name: "Cornix Free Text (Spot)",
        example: `#ETH/USDT SPOT
Exchanges: Binance
Buy: 2500
Take-Profit: 2600, 2700, 2800
Stop: 2400`,
        description: "SPOT signal - contains 'spot' keyword. No leverage applied.",
      },
      {
        name: "Simple Long Signal",
        example: `#BTCUSDT
LONG
Entry: 67000
TP1: 68000
TP2: 69000
SL: 66000
Leverage: 10x`,
        description: "Simple long signal for futures",
      },
    ],
    parsedFields: {
      symbol: "Coin pair (BTC/USDT, BTCUSDT, #BTC/USDT)",
      direction: "LONG or SHORT (inferred from prices or explicit)",
      marketType: "SPOT (if 'spot'/'спот' in text) or FUTURES (default)",
      entryPrices: "Entry prices from Entry/Buy keywords",
      entryZone: "Range entry from 'Entry Zone' keyword",
      stopLoss: "Stop loss from Stop/SL keywords",
      takeProfits: "TP targets from TP/Target/Take Profit keywords",
      leverage: "Leverage from Leverage/Lev keywords or X notation",
      signalType: "REGULAR or BREAKOUT (if 'above'/'below' in text)",
    },
    cornixCompatibility: {
      maxEntries: 10,
      maxTakeProfits: 10,
      maxStopLoss: 1,
      spotKeyword: "Include 'spot' or 'спот' word anywhere for spot trading",
      trailingSupport: "Entry, TP, and Stop trailing configurations",
      riskManagement: "Amount per trade and risk percentage",
    },
  });
}
