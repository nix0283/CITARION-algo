import { NextRequest, NextResponse } from "next/server";
import { getCornixClient, isCornixConfigured } from "@/lib/cornix-api";
import { db } from "@/lib/db";

/**
 * POST /api/cornix/sync
 * Synchronize signals and positions from Cornix API
 */
export async function POST(request: NextRequest) {
  try {
    if (!isCornixConfigured()) {
      return NextResponse.json({
        success: false,
        error: "Cornix API not configured. Set CORNIX_API_KEY and CORNIX_API_SECRET",
      }, { status: 400 });
    }

    const client = getCornixClient();
    if (!client) {
      return NextResponse.json({
        success: false,
        error: "Cornix client not initialized",
      }, { status: 500 });
    }

    // Fetch signals and positions from Cornix
    const [signals, positions] = await Promise.all([
      client.getActiveSignals(),
      client.getOpenPositions(),
    ]);

    let syncedSignals = 0;
    let syncedPositions = 0;

    // Sync signals to database
    for (const signal of signals) {
      const existing = await db.signal.findFirst({
        where: { source: "CORNIX", sourceMessage: signal.id },
      });

      if (!existing) {
        // Get next signal ID
        const counter = await db.signalIdCounter.upsert({
          where: { id: "signal_counter" },
          update: { lastId: { increment: 1 } },
          create: { id: "signal_counter", lastId: 1 },
        });

        await db.signal.create({
          data: {
            signalId: counter.lastId,
            source: "CORNIX",
            sourceMessage: signal.id,
            symbol: signal.symbol,
            direction: signal.direction,
            action: signal.direction === "LONG" ? "BUY" : "SELL",
            marketType: signal.marketType,
            entryPrices: JSON.stringify(signal.entryPrices),
            takeProfits: JSON.stringify(signal.takeProfits),
            stopLoss: signal.stopLoss,
            leverage: signal.leverage,
            status: signal.status,
            processedAt: new Date(),
          },
        });
        syncedSignals++;
      }
    }

    // Sync positions to database
    for (const position of positions) {
      const existing = await db.externalPosition.findFirst({
        where: { externalId: position.id },
      });

      if (!existing) {
        await db.externalPosition.create({
          data: {
            externalId: position.id,
            source: "CORNIX",
            symbol: position.symbol,
            direction: position.direction,
            status: position.status,
            avgEntryPrice: position.entryPrice,
            currentPrice: position.currentPrice,
            amount: position.amount,
            amountUsd: position.amount * position.currentPrice,
            leverage: position.leverage,
            unrealizedPnl: position.unrealizedPnl,
            detectedAt: new Date(),
            escortStatus: "PENDING_APPROVAL",
          },
        });
        syncedPositions++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Cornix sync completed",
      data: {
        signals: {
          total: signals.length,
          synced: syncedSignals,
        },
        positions: {
          total: positions.length,
          synced: syncedPositions,
        },
      },
    });
  } catch (error) {
    console.error("[CornixSync] Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

/**
 * GET /api/cornix/sync
 * Get Cornix sync status
 */
export async function GET() {
  try {
    if (!isCornixConfigured()) {
      return NextResponse.json({
        success: false,
        configured: false,
        message: "Cornix API not configured",
      });
    }

    const client = getCornixClient();
    if (!client) {
      return NextResponse.json({
        success: false,
        configured: true,
        connected: false,
        message: "Cornix client not initialized",
      });
    }

    // Try to fetch accounts to verify connection
    const accounts = await client.getAccounts();

    return NextResponse.json({
      success: true,
      configured: true,
      connected: true,
      accounts: accounts.length,
      message: "Cornix API connected",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
