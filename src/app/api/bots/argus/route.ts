/**
 * Argus Bot API - Enhanced Version
 * 
 * Real-time pump/dump detection with WebSocket streams.
 * 
 * Endpoints:
 * - GET: List bots and status
 * - POST: Create/start bot
 * - PUT: Update bot config
 * - DELETE: Remove bot
 * 
 * Query params:
 * - signals=true: Get recent signals
 * - alerts=true: Get whale alerts
 * - status=true: Get engine status
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUserId } from "@/lib/default-user";
import { getArgusBotManager, getArgusEngine } from "@/lib/argus-bot";

// ==================== GET - List bots and status ====================

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    
    const bots = await db.argusBot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Get recent signals from database
    const recentSignals = await db.argusSignal.findMany({
      where: { 
        processed: false,
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      orderBy: { timestamp: "desc" },
      take: 50,
    });

    // Get engine status if requested
    let engineStatus = null;
    if (searchParams.get("status") === "true") {
      try {
        const engine = getArgusEngine();
        engineStatus = engine.getState();
      } catch {
        // Engine not initialized
      }
    }

    // Get real-time signals if requested
    let realtimeSignals = null;
    if (searchParams.get("signals") === "true") {
      try {
        const engine = getArgusEngine();
        realtimeSignals = engine.getRecentSignals(20);
      } catch {
        // Engine not initialized
      }
    }

    // Get whale alerts if requested
    let whaleAlerts = null;
    if (searchParams.get("alerts") === "true") {
      try {
        const engine = getArgusEngine();
        whaleAlerts = engine.getWhaleAlerts(20);
      } catch {
        // Engine not initialized
      }
    }

    return NextResponse.json({
      success: true,
      bots,
      recentSignals,
      engineStatus,
      realtimeSignals,
      whaleAlerts,
    });
  } catch (error) {
    console.error("[Argus API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch bots" },
      { status: 500 }
    );
  }
}

// ==================== POST - Create bot ====================

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();

    // Handle action-based requests
    if (body.action) {
      return handleAction(body);
    }

    const bot = await db.argusBot.create({
      data: {
        userId,
        name: body.name || `Argus ${Date.now()}`,
        status: "ACTIVE",
        exchange: body.exchange || "binance",
        accountId: body.accountId,
        
        // Strategy toggles
        enable5Long: body.enable5Long ?? true,
        enable5Short: body.enable5Short ?? true,
        enable12Long: body.enable12Long ?? true,
        enable12Short: body.enable12Short ?? true,
        
        // Detection thresholds
        pumpThreshold5m: body.pumpThreshold5m ?? 0.05,
        pumpThreshold15m: body.pumpThreshold15m ?? 0.10,
        dumpThreshold5m: body.dumpThreshold5m ?? -0.05,
        dumpThreshold15m: body.dumpThreshold15m ?? -0.10,
        
        // Market cap filter
        maxMarketCap: body.maxMarketCap ?? 100000000,
        minMarketCap: body.minMarketCap ?? 1000000,
        
        // Orderbook filter
        useImbalanceFilter: body.useImbalanceFilter ?? false,
        imbalanceThreshold: body.imbalanceThreshold ?? 0.2,
        
        // Risk management
        leverage: body.leverage ?? 10,
        positionSize: body.positionSize ?? 50,
        stopLoss5: body.stopLoss5 ?? 0.05,
        stopLoss12: body.stopLoss12 ?? 0.12,
        takeProfit5: JSON.stringify(body.takeProfit5 ?? [0.05, 0.10, 0.15]),
        takeProfit12: JSON.stringify(body.takeProfit12 ?? [0.12, 0.18, 0.25]),
        
        // Trailing stop
        useTrailing: body.useTrailing ?? false,
        trailingActivation5: body.trailingActivation5 ?? 0.03,
        trailingActivation12: body.trailingActivation12 ?? 0.06,
        trailingDistance5: body.trailingDistance5 ?? 0.015,
        trailingDistance12: body.trailingDistance12 ?? 0.03,
        
        // Cooldown
        cooldownMinutes: body.cooldownMinutes ?? 30,
        
        // Notifications
        notifyOnSignal: body.notifyOnSignal ?? true,
        notifyOnTrade: body.notifyOnTrade ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      bot,
    });
  } catch (error) {
    console.error("[Argus API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create bot" },
      { status: 500 }
    );
  }
}

// ==================== Action Handler ====================

async function handleAction(body: { action: string; botId?: string; symbols?: string[] }): Promise<NextResponse> {
  const { action, botId, symbols } = body;
  const manager = getArgusBotManager();

  switch (action) {
    case "start": {
      if (!botId) {
        return NextResponse.json(
          { success: false, error: "Bot ID required" },
          { status: 400 }
        );
      }
      
      const bot = manager.getBot(botId);
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Bot not found" },
          { status: 404 }
        );
      }
      
      await bot.start();
      return NextResponse.json({ success: true, message: "Bot started" });
    }

    case "stop": {
      if (!botId) {
        return NextResponse.json(
          { success: false, error: "Bot ID required" },
          { status: 400 }
        );
      }
      
      const bot = manager.getBot(botId);
      if (!bot) {
        return NextResponse.json(
          { success: false, error: "Bot not found" },
          { status: 404 }
        );
      }
      
      bot.stop();
      return NextResponse.json({ success: true, message: "Bot stopped" });
    }

    case "start_all": {
      await manager.startAll();
      return NextResponse.json({ success: true, message: "All bots started" });
    }

    case "stop_all": {
      manager.stopAll();
      return NextResponse.json({ success: true, message: "All bots stopped" });
    }

    case "add_symbols": {
      if (!symbols || symbols.length === 0) {
        return NextResponse.json(
          { success: false, error: "Symbols required" },
          { status: 400 }
        );
      }
      
      try {
        const engine = getArgusEngine();
        for (const symbol of symbols) {
          engine.addSymbol(symbol);
        }
        return NextResponse.json({ 
          success: true, 
          message: `Added ${symbols.length} symbols`,
          symbols: engine.getState().symbols 
        });
      } catch {
        return NextResponse.json(
          { success: false, error: "Engine not initialized" },
          { status: 400 }
        );
      }
    }

    case "get_status": {
      try {
        const engine = getArgusEngine();
        return NextResponse.json({ 
          success: true, 
          status: engine.getState() 
        });
      } catch {
        return NextResponse.json(
          { success: false, error: "Engine not initialized" },
          { status: 400 }
        );
      }
    }

    case "get_signals": {
      try {
        const engine = getArgusEngine();
        return NextResponse.json({ 
          success: true, 
          signals: engine.getRecentSignals(50) 
        });
      } catch {
        return NextResponse.json(
          { success: false, error: "Engine not initialized" },
          { status: 400 }
        );
      }
    }

    case "get_alerts": {
      try {
        const engine = getArgusEngine();
        return NextResponse.json({ 
          success: true, 
          alerts: engine.getWhaleAlerts(50) 
        });
      } catch {
        return NextResponse.json(
          { success: false, error: "Engine not initialized" },
          { status: 400 }
        );
      }
    }

    default:
      return NextResponse.json(
        { success: false, error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}

// ==================== PUT - Update bot ====================

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Bot ID required" },
        { status: 400 }
      );
    }

    // Prepare updates
    const data: Record<string, unknown> = { ...updates, updatedAt: new Date() };
    
    // Handle JSON fields
    if (updates.takeProfit5) {
      data.takeProfit5 = JSON.stringify(updates.takeProfit5);
    }
    if (updates.takeProfit12) {
      data.takeProfit12 = JSON.stringify(updates.takeProfit12);
    }

    const bot = await db.argusBot.update({
      where: { id },
      data,
    });

    // Update running bot if exists
    const manager = getArgusBotManager();
    const runningBot = manager.getBot(id);
    if (runningBot) {
      runningBot.updateConfig(updates);
    }

    return NextResponse.json({
      success: true,
      bot,
    });
  } catch (error) {
    console.error("[Argus API] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update bot" },
      { status: 500 }
    );
  }
}

// ==================== DELETE - Remove bot ====================

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Bot ID required" },
        { status: 400 }
      );
    }

    // Stop bot if running
    const manager = getArgusBotManager();
    const bot = manager.getBot(id);
    if (bot) {
      bot.stop();
    }

    await db.argusBot.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("[Argus API] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete bot" },
      { status: 500 }
    );
  }
}
