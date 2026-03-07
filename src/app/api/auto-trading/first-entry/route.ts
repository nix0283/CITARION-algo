import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  executeFirstEntryAsMarket,
  validateFirstEntryConfig,
  type FirstEntryConfig,
  type FirstEntryMode
} from "@/lib/auto-trading/first-entry-market";

/**
 * POST /api/auto-trading/first-entry
 * Test First Entry as Market functionality
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      signalId,
      config,
      currentPrice
    } = body;

    // Validate required fields
    if (!signalId) {
      return NextResponse.json(
        { success: false, error: "signalId is required" },
        { status: 400 }
      );
    }

    // Get signal from database
    const signal = await db.signal.findUnique({
      where: { id: signalId }
    });

    if (!signal) {
      return NextResponse.json(
        { success: false, error: "Signal not found" },
        { status: 404 }
      );
    }

    // Validate config
    const entryConfig: FirstEntryConfig = {
      enabled: config?.enabled ?? true,
      mode: (config?.mode as FirstEntryMode) || "ENTRY_PRICE_REACHED",
      maxPriceCap: config?.maxPriceCap ?? 1,
      onlyIfNotDefinedByGroup: config?.onlyIfNotDefinedByGroup ?? false
    };

    const validation = validateFirstEntryConfig(entryConfig);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    // Execute First Entry as Market
    const result = await executeFirstEntryAsMarket(
      signal,
      entryConfig,
      currentPrice || signal.entryPrice
    );

    return NextResponse.json({
      success: result.success,
      state: result.state,
      orderPlaced: result.orderPlaced,
      orderPrice: result.orderPrice,
      orderAmount: result.orderAmount,
      error: result.error
    });

  } catch (error) {
    console.error("First Entry API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auto-trading/first-entry
 * Get First Entry as Market configuration for a bot
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botConfigId = searchParams.get("botConfigId");

    if (!botConfigId) {
      return NextResponse.json(
        { success: false, error: "botConfigId is required" },
        { status: 400 }
      );
    }

    const botConfig = await db.botConfig.findUnique({
      where: { id: botConfigId },
      select: {
        firstEntryAsMarketEnabled: true,
        firstEntryAsMarketCap: true,
        firstEntryAsMarketActivate: true
      }
    });

    if (!botConfig) {
      return NextResponse.json(
        { success: false, error: "BotConfig not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      config: {
        enabled: botConfig.firstEntryAsMarketEnabled,
        mode: botConfig.firstEntryAsMarketActivate,
        maxPriceCap: botConfig.firstEntryAsMarketCap
      }
    });

  } catch (error) {
    console.error("First Entry GET API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
