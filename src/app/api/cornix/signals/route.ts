import { NextRequest, NextResponse } from "next/server";
import { getCornixClient, isCornixConfigured, formatCornixSignal } from "@/lib/cornix-api";

/**
 * GET /api/cornix/signals
 * Get signals from Cornix API
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
    const status = searchParams.get("status") as "PENDING" | "ACTIVE" | "CLOSED" | null;
    const limit = parseInt(searchParams.get("limit") || "50");

    const signals = await client.getSignals({ status: status || undefined, limit });

    return NextResponse.json({
      success: true,
      count: signals.length,
      signals: signals.map(s => ({
        ...s,
        formatted: formatCornixSignal(s),
      })),
    });
  } catch (error) {
    console.error("[CornixSignals] Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
