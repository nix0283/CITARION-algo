/**
 * Argus Bot API
 * 
 * Named after the mythological hundred-eyed giant, Argus watches
 * the markets for pump and dump patterns across multiple exchanges.
 * 
 * Endpoints for managing Argus detection and trading bot
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUserId } from "@/lib/default-user";
import { getArgusBotManager } from "@/lib/argus-bot";

// ==================== GET - List bots ====================

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    
    const bots = await db.argusBot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Get recent signals
    const recentSignals = await db.argusSignal.findMany({
      where: { 
        processed: false,
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      orderBy: { timestamp: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      bots,
      recentSignals,
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

    const bot = await db.argusBot.create({
      data: {
        userId,
        name: body.name || `Argus ${Date.now()}`,
        status: "ACTIVE",
        exchange: body.exchange || "bingx",
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

    // Start the bot
    const manager = getArgusBotManager();
    // Bot will be started when manager.startAll() is called

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
    const data: Record<string, unknown> = { ...updates };
    
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
