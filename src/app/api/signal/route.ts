import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUserId } from "@/lib/default-user";
import { 
  parseSignal, 
  parseManagementCommand, 
  formatSignal,
  validateSignal,
  type ParsedSignal,
  type SignalManagementCommand 
} from "@/lib/signal-parser";

// ==================== SIGNAL ID MANAGEMENT ====================

async function getNextSignalId(): Promise<number> {
  const counter = await db.signalIdCounter.upsert({
    where: { id: "signal_counter" },
    update: { lastId: { increment: 1 } },
    create: { id: "signal_counter", lastId: 1 },
  });
  return counter.lastId;
}

async function resetSignalId(): Promise<number> {
  await db.signalIdCounter.upsert({
    where: { id: "signal_counter" },
    update: { lastId: 0 },
    create: { id: "signal_counter", lastId: 0 },
  });
  return 0;
}

async function getCurrentSignalId(): Promise<number> {
  const counter = await db.signalIdCounter.findUnique({
    where: { id: "signal_counter" },
  });
  return counter?.lastId || 0;
}

// ==================== SIGNAL DATABASE OPERATIONS ====================

async function saveSignal(parsedSignal: ParsedSignal, source: string): Promise<{ success: boolean; signalId?: number; error?: string }> {
  try {
    const validation = validateSignal(parsedSignal);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(", ") };
    }

    const signalId = await getNextSignalId();

    const signal = await db.signal.create({
      data: {
        signalId,
        source,
        sourceMessage: parsedSignal.rawText,
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

    return { success: true, signalId: signal.signalId };
  } catch (error) {
    console.error("Save signal error:", error);
    return { success: false, error: "Failed to save signal" };
  }
}

async function clearAllSignals(): Promise<{ success: boolean; count: number }> {
  try {
    const result = await db.signal.deleteMany({});
    await resetSignalId();
    return { success: true, count: result.count };
  } catch (error) {
    console.error("Clear signals error:", error);
    return { success: false, count: 0 };
  }
}

/**
 * Find active signal by symbol, direction and market type
 * Direction is now required to distinguish between long/short signals on same pair
 */
async function findActiveSignal(
  symbol: string, 
  marketType: "SPOT" | "FUTURES",
  direction?: "LONG" | "SHORT"
) {
  const where: Record<string, unknown> = {
    symbol: symbol.toUpperCase(),
    marketType,
    status: { in: ["PENDING", "ACTIVE"] },
  };
  
  // Direction is now important to distinguish signals
  if (direction) {
    where.direction = direction;
  }
  
  return db.signal.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
}

async function updateSignalTP(
  symbol: string, 
  marketType: "SPOT" | "FUTURES", 
  tpIndex: number, 
  tpPrice: number,
  direction?: "LONG" | "SHORT"
): Promise<{ success: boolean; signalId?: number; error?: string }> {
  try {
    const signal = await findActiveSignal(symbol, marketType, direction);
    if (!signal) {
      const dirText = direction ? ` ${direction}` : "";
      return { success: false, error: `No active${dirText} signal found for ${symbol} (${marketType})` };
    }

    const takeProfits = signal.takeProfits ? JSON.parse(signal.takeProfits) : [];
    
    if (tpIndex <= takeProfits.length) {
      takeProfits[tpIndex - 1] = { ...takeProfits[tpIndex - 1], price: tpPrice };
    } else {
      takeProfits.push({ price: tpPrice, percentage: 100 / tpIndex });
    }

    await db.signal.update({
      where: { id: signal.id },
      data: { takeProfits: JSON.stringify(takeProfits) },
    });

    return { success: true, signalId: signal.signalId };
  } catch (error) {
    console.error("Update TP error:", error);
    return { success: false, error: "Failed to update take profit" };
  }
}

async function updateSignalSL(
  symbol: string, 
  marketType: "SPOT" | "FUTURES", 
  slPrice: number,
  direction?: "LONG" | "SHORT"
): Promise<{ success: boolean; signalId?: number; error?: string }> {
  try {
    const signal = await findActiveSignal(symbol, marketType, direction);
    if (!signal) {
      const dirText = direction ? ` ${direction}` : "";
      return { success: false, error: `No active${dirText} signal found for ${symbol} (${marketType})` };
    }

    await db.signal.update({
      where: { id: signal.id },
      data: { stopLoss: slPrice },
    });

    return { success: true, signalId: signal.signalId };
  } catch (error) {
    console.error("Update SL error:", error);
    return { success: false, error: "Failed to update stop loss" };
  }
}

async function closeSignal(
  symbol: string, 
  marketType: "SPOT" | "FUTURES",
  direction?: "LONG" | "SHORT"
): Promise<{ success: boolean; signalId?: number; error?: string }> {
  try {
    const signal = await findActiveSignal(symbol, marketType, direction);
    if (!signal) {
      const dirText = direction ? ` ${direction}` : "";
      return { success: false, error: `No active${dirText} signal found for ${symbol} (${marketType})` };
    }

    await db.signal.update({
      where: { id: signal.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closeReason: "MANUAL",
      },
    });

    if (signal.positionId) {
      await db.position.update({
        where: { id: signal.positionId },
        data: { status: "CLOSED" },
      });
    }

    return { success: true, signalId: signal.signalId };
  } catch (error) {
    console.error("Close signal error:", error);
    return { success: false, error: "Failed to close signal" };
  }
}

/**
 * Execute market entry for a signal
 */
async function executeMarketEntry(
  symbol: string,
  marketType: "SPOT" | "FUTURES",
  direction?: "LONG" | "SHORT"
): Promise<{ success: boolean; signalId?: number; tradeId?: string; error?: string }> {
  try {
    // Find pending signal
    const signal = await findActiveSignal(symbol, marketType, direction);
    
    if (!signal) {
      // Create a new signal if none exists
      const newSignalId = await getNextSignalId();
      
      // Default direction is LONG if not specified
      const signalDirection = direction || "LONG";
      const exchangeType = marketType === "SPOT" ? "spot" : "futures";
      
      // Get or create account
      let account = await db.account.findFirst({
        where: { accountType: "DEMO", exchangeType },
      });
      
      const userId = await getDefaultUserId();
      
      if (!account) {
        account = await db.account.create({
          data: {
            userId,
            accountType: "DEMO",
            exchangeId: "binance",
            exchangeType,
            exchangeName: marketType === "SPOT" ? "Binance Spot" : "Binance Futures",
            virtualBalance: JSON.stringify({ USDT: 10000 }),
            isActive: true,
          },
        });
      }
      
      // Get current market price (demo)
      const DEMO_PRICES: Record<string, number> = {
        BTCUSDT: 67500, ETHUSDT: 3500, BNBUSDT: 600, SOLUSDT: 175,
        XRPUSDT: 0.52, DOGEUSDT: 0.15, ADAUSDT: 0.45,
      };
      const marketPrice = DEMO_PRICES[symbol] || 100;
      
      // Create signal
      const newSignal = await db.signal.create({
        data: {
          signalId: newSignalId,
          source: "MARKET_ENTRY",
          sourceMessage: `Market entry: ${symbol} ${signalDirection} ${marketType}`,
          symbol,
          direction: signalDirection,
          action: "BUY",
          marketType,
          status: "ACTIVE",
          processedAt: new Date(),
        },
      });
      
      // Create position
      const leverage = marketType === "SPOT" ? 1 : 10;
      const tradeAmount = 100;
      const quantity = (tradeAmount * leverage) / marketPrice;
      
      const position = await db.position.create({
        data: {
          accountId: account.id,
          symbol,
          direction: signalDirection,
          status: "OPEN",
          totalAmount: quantity,
          filledAmount: quantity,
          avgEntryPrice: marketPrice,
          currentPrice: marketPrice,
          leverage,
          unrealizedPnl: 0,
          realizedPnl: 0,
          isDemo: true,
        },
      });
      
      // Update signal with position
      await db.signal.update({
        where: { id: newSignal.id },
        data: { positionId: position.id },
      });
      
      return { success: true, signalId: newSignalId, tradeId: position.id };
    }
    
    // Signal exists - execute entry
    const exchangeType = marketType === "SPOT" ? "spot" : "futures";
    let account = await db.account.findFirst({
      where: { accountType: "DEMO", exchangeType },
    });
    
    const userId = await getDefaultUserId();
    
    if (!account) {
      account = await db.account.create({
        data: {
          userId,
          accountType: "DEMO",
          exchangeId: "binance",
          exchangeType,
          exchangeName: marketType === "SPOT" ? "Binance Spot" : "Binance Futures",
          virtualBalance: JSON.stringify({ USDT: 10000 }),
          isActive: true,
        },
      });
    }
    
    const DEMO_PRICES: Record<string, number> = {
      BTCUSDT: 67500, ETHUSDT: 3500, BNBUSDT: 600, SOLUSDT: 175,
      XRPUSDT: 0.52, DOGEUSDT: 0.15, ADAUSDT: 0.45,
    };
    const marketPrice = DEMO_PRICES[symbol] || 100;
    
    const leverage = signal.leverage || (marketType === "SPOT" ? 1 : 10);
    const tradeAmount = 100;
    const quantity = (tradeAmount * leverage) / marketPrice;
    
    const position = await db.position.create({
      data: {
        accountId: account.id,
        symbol,
        direction: signal.direction,
        status: "OPEN",
        totalAmount: quantity,
        filledAmount: quantity,
        avgEntryPrice: marketPrice,
        currentPrice: marketPrice,
        leverage,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfits ? JSON.parse(signal.takeProfits)[0]?.price : null,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isDemo: true,
      },
    });
    
    await db.signal.update({
      where: { id: signal.id },
      data: {
        status: "ACTIVE",
        positionId: position.id,
        processedAt: new Date(),
      },
    });
    
    return { success: true, signalId: signal.signalId, tradeId: position.id };
  } catch (error) {
    console.error("Market entry error:", error);
    return { success: false, error: "Failed to execute market entry" };
  }
}

async function executeManagementCommand(command: SignalManagementCommand): Promise<{ success: boolean; message: string; data?: unknown }> {
  const dirText = command.direction ? ` ${command.direction}` : "";
  
  switch (command.type) {
    case "RESET_ID":
      const newId = await resetSignalId();
      return { success: true, message: `🔄 Signal ID counter reset. Next signal will be #${newId + 1}` };

    case "CLEAR_BASE":
      const result = await clearAllSignals();
      return { success: true, message: `🗑️ Database cleared. ${result.count} signals removed. ID counter reset.` };

    case "MARKET_ENTRY":
      if (!command.symbol) {
        return { success: false, message: "❌ Symbol required. Format: `BTCUSDT enter` or `BTCUSDT long enter`" };
      }
      const entryResult = await executeMarketEntry(
        command.symbol,
        command.marketType || "FUTURES",
        command.direction
      );
      if (entryResult.success) {
        return { 
          success: true, 
          message: `✅ Market entry executed: ${command.symbol}${dirText} (${command.marketType})\nSignal #${entryResult.signalId}` 
        };
      }
      return { success: false, message: entryResult.error || "Failed to execute market entry" };

    case "UPDATE_TP":
      if (!command.symbol || !command.tpIndex || !command.tpPrice) {
        return { success: false, message: "❌ Invalid TP update. Format: `BTCUSDT long tp2 100`" };
      }
      const tpResult = await updateSignalTP(
        command.symbol,
        command.marketType || "FUTURES",
        command.tpIndex,
        command.tpPrice,
        command.direction
      );
      if (tpResult.success) {
        return { success: true, message: `✅ Signal #${tpResult.signalId}: ${command.symbol}${dirText} TP${command.tpIndex} → $${command.tpPrice}` };
      }
      return { success: false, message: tpResult.error || "Failed to update TP" };

    case "UPDATE_SL":
      if (!command.symbol || !command.slPrice) {
        return { success: false, message: "❌ Invalid SL update. Format: `BTCUSDT long sl 95`" };
      }
      const slResult = await updateSignalSL(
        command.symbol,
        command.marketType || "FUTURES",
        command.slPrice,
        command.direction
      );
      if (slResult.success) {
        return { success: true, message: `✅ Signal #${slResult.signalId}: ${command.symbol}${dirText} SL → $${command.slPrice}` };
      }
      return { success: false, message: slResult.error || "Failed to update SL" };

    case "CLOSE_SIGNAL":
      if (!command.symbol) {
        return { success: false, message: "❌ Symbol required. Format: `BTCUSDT long close`" };
      }
      const closeResult = await closeSignal(
        command.symbol,
        command.marketType || "FUTURES",
        command.direction
      );
      if (closeResult.success) {
        return { success: true, message: `✅ Signal #${closeResult.signalId} closed: ${command.symbol}${dirText}` };
      }
      return { success: false, message: closeResult.error || "Failed to close signal" };

    default:
      return { success: false, message: "Unknown command type" };
  }
}

// ==================== API ROUTES ====================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const symbol = searchParams.get("symbol");
  const direction = searchParams.get("direction") as "LONG" | "SHORT" | null;
  const marketType = searchParams.get("marketType") as "SPOT" | "FUTURES" | null;
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    if (action === "current_id") {
      const currentId = await getCurrentSignalId();
      return NextResponse.json({ success: true, currentId });
    }

    if (action === "active") {
      const where: Record<string, unknown> = { status: { in: ["PENDING", "ACTIVE"] } };
      if (symbol) where.symbol = symbol.toUpperCase();
      if (marketType) where.marketType = marketType;
      if (direction) where.direction = direction;

      const signals = await db.signal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return NextResponse.json({
        success: true,
        count: signals.length,
        signals: signals.map(s => ({
          signalId: s.signalId,
          symbol: s.symbol,
          direction: s.direction,
          marketType: s.marketType,
          status: s.status,
          entryPrices: s.entryPrices ? JSON.parse(s.entryPrices) : [],
          takeProfits: s.takeProfits ? JSON.parse(s.takeProfits) : [],
          stopLoss: s.stopLoss,
          leverage: s.leverage,
          createdAt: s.createdAt,
        })),
      });
    }

    const where: Record<string, unknown> = {};
    if (symbol) where.symbol = symbol.toUpperCase();
    if (marketType) where.marketType = marketType;
    if (direction) where.direction = direction;
    if (status) where.status = status;

    const signals = await db.signal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const currentId = await getCurrentSignalId();

    return NextResponse.json({
      success: true,
      currentId,
      count: signals.length,
      signals: signals.map(s => ({
        signalId: s.signalId,
        symbol: s.symbol,
        direction: s.direction,
        marketType: s.marketType,
        action: s.action,
        status: s.status,
        entryPrices: s.entryPrices ? JSON.parse(s.entryPrices) : [],
        takeProfits: s.takeProfits ? JSON.parse(s.takeProfits) : [],
        stopLoss: s.stopLoss,
        leverage: s.leverage,
        source: s.source,
        createdAt: s.createdAt,
        closedAt: s.closedAt,
        closeReason: s.closeReason,
      })),
    });
  } catch (error) {
    console.error("GET signals error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch signals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, source = "API" } = body;

    if (!text) {
      return NextResponse.json({ success: false, error: "Text is required" }, { status: 400 });
    }

    const mgmtCommand = parseManagementCommand(text);
    if (mgmtCommand) {
      const result = await executeManagementCommand(mgmtCommand);
      return NextResponse.json(result);
    }

    const parsedSignal = parseSignal(text);
    if (!parsedSignal) {
      return NextResponse.json({
        success: false,
        error: "Could not parse signal. Ensure it contains a valid coin pair.",
      }, { status: 400 });
    }

    const saveResult = await saveSignal(parsedSignal, source);
    if (!saveResult.success) {
      return NextResponse.json({
        success: false,
        error: saveResult.error,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      signalId: saveResult.signalId,
      signal: {
        ...parsedSignal,
        id: saveResult.signalId,
        formatted: formatSignal(parsedSignal),
      },
      message: `Signal #${saveResult.signalId}: ${parsedSignal.direction} ${parsedSignal.symbol} (${parsedSignal.marketType})`,
    });
  } catch (error) {
    console.error("POST signal error:", error);
    return NextResponse.json({ success: false, error: "Failed to process signal" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const signalId = searchParams.get("signalId");

  try {
    if (action === "clear_all") {
      const result = await clearAllSignals();
      return NextResponse.json({
        success: true,
        message: `Database cleared. ${result.count} signals removed.`,
      });
    }

    if (signalId) {
      await db.signal.delete({
        where: { signalId: parseInt(signalId) },
      });
      return NextResponse.json({
        success: true,
        message: `Signal #${signalId} deleted`,
      });
    }

    return NextResponse.json({ success: false, error: "Specify action=clear_all or signalId" }, { status: 400 });
  } catch (error) {
    console.error("DELETE signal error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { signalId, takeProfits, stopLoss, status } = body;

    if (!signalId) {
      return NextResponse.json({ success: false, error: "signalId is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    if (takeProfits) {
      updateData.takeProfits = JSON.stringify(takeProfits);
    }
    if (stopLoss !== undefined) {
      updateData.stopLoss = stopLoss;
    }
    if (status) {
      updateData.status = status;
      if (status === "CLOSED") {
        updateData.closedAt = new Date();
        updateData.closeReason = "MANUAL";
      }
    }

    const signal = await db.signal.update({
      where: { signalId: parseInt(signalId) },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      signal: {
        signalId: signal.signalId,
        symbol: signal.symbol,
        direction: signal.direction,
        status: signal.status,
        takeProfits: signal.takeProfits ? JSON.parse(signal.takeProfits) : [],
        stopLoss: signal.stopLoss,
      },
    });
  } catch (error) {
    console.error("PUT signal error:", error);
    return NextResponse.json({ success: false, error: "Failed to update signal" }, { status: 500 });
  }
}
