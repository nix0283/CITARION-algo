/**
 * Position Escort API
 * 
 * Endpoints:
 * - POST: Confirm or decline position escort
 * - PUT: Update escort parameters (SL, TP, Trailing)
 * - DELETE: Close escorted position
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  confirmEscort, 
  declineEscort, 
  updateEscortParams,
  closeExternalPosition,
} from "@/lib/position-sync-service";
import { db } from "@/lib/db";

// ==================== CONFIRM/DECLINE ESCORT ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { positionId, action, params } = body;

    if (!positionId || !action) {
      return NextResponse.json(
        { success: false, error: "positionId and action are required" },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case "confirm": {
        // Confirm escort with optional SL/TP/Trailing
        result = await confirmEscort(positionId, params);
        break;
      }

      case "decline": {
        // Decline escort
        result = await declineEscort(positionId);
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("[Escort] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// ==================== UPDATE ESCORT PARAMS ====================

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { positionId, stopLoss, takeProfit, trailingStop } = body;

    if (!positionId) {
      return NextResponse.json(
        { success: false, error: "positionId is required" },
        { status: 400 }
      );
    }

    const result = await updateEscortParams(positionId, {
      stopLoss,
      takeProfit,
      trailingStop,
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error("[Escort] Update error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// ==================== CLOSE POSITION ====================

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const positionId = url.searchParams.get("positionId");
    const reason = url.searchParams.get("reason") || "MANUAL";

    if (!positionId) {
      return NextResponse.json(
        { success: false, error: "positionId is required" },
        { status: 400 }
      );
    }

    const result = await closeExternalPosition(positionId, reason);

    return NextResponse.json(result);

  } catch (error) {
    console.error("[Escort] Close error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// ==================== GET POSITION DETAILS ====================

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const positionId = url.searchParams.get("positionId");

    if (!positionId) {
      return NextResponse.json(
        { success: false, error: "positionId is required" },
        { status: 400 }
      );
    }

    const position = await db.position.findUnique({
      where: { id: positionId },
      include: {
        account: {
          select: {
            exchangeName: true,
            exchangeType: true,
          },
        },
      },
    });

    if (!position) {
      return NextResponse.json(
        { success: false, error: "Position not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      position: {
        id: position.id,
        symbol: position.symbol,
        direction: position.direction,
        entryPrice: position.avgEntryPrice,
        currentPrice: position.currentPrice,
        size: position.totalAmount,
        leverage: position.leverage,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        trailingStop: position.trailingStop ? JSON.parse(position.trailingStop) : null,
        trailingActivated: position.trailingActivated,
        unrealizedPnl: position.unrealizedPnl,
        escortEnabled: position.escortEnabled,
        escortStatus: position.escortStatus,
        source: position.source,
        isDemo: position.isDemo,
        createdAt: position.createdAt,
        account: position.account,
      },
    });

  } catch (error) {
    console.error("[Escort] Get error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
