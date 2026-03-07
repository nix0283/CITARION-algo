import { NextRequest, NextResponse } from "next/server";
import { getCornixClient, isCornixConfigured, formatCornixPosition } from "@/lib/cornix-api";

/**
 * GET /api/cornix/positions
 * Get positions from Cornix API
 */
export async function GET(request: NextRequest) {
  try {
    if (!isCornixConfigured()) {
      return NextResponse.json({
        success: false,
        error: "Cornix API not configured",
      }, { status: 400 });
    }

    const client = getCornixClient();
    if (!client) {
      return NextResponse.json({
        success: false,
        error: "Cornix client not initialized",
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as "OPEN" | "CLOSED" | null;
    const limit = parseInt(searchParams.get("limit") || "50");

    const positions = await client.getPositions({ status: status || undefined, limit });

    return NextResponse.json({
      success: true,
      count: positions.length,
      positions: positions.map(p => ({
        ...p,
        formatted: formatCornixPosition(p),
      })),
    });
  } catch (error) {
    console.error("[CornixPositions] Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

/**
 * POST /api/cornix/positions
 * Execute action on Cornix position
 */
export async function POST(request: NextRequest) {
  try {
    if (!isCornixConfigured()) {
      return NextResponse.json({
        success: false,
        error: "Cornix API not configured",
      }, { status: 400 });
    }

    const client = getCornixClient();
    if (!client) {
      return NextResponse.json({
        success: false,
        error: "Cornix client not initialized",
      }, { status: 500 });
    }

    const body = await request.json();
    const { action, positionId, stopLoss, takeProfit } = body;

    if (!positionId) {
      return NextResponse.json({
        success: false,
        error: "positionId is required",
      }, { status: 400 });
    }

    let result: boolean;

    switch (action) {
      case "close":
        result = await client.closePosition(positionId);
        break;

      case "update":
        result = await client.updatePosition(positionId, { stopLoss, takeProfit });
        break;

      default:
        return NextResponse.json({
          success: false,
          error: "Invalid action. Use 'close' or 'update'",
        }, { status: 400 });
    }

    return NextResponse.json({
      success: result,
      message: result ? `Position ${action} successful` : `Position ${action} failed`,
    });
  } catch (error) {
    console.error("[CornixPositions] Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
