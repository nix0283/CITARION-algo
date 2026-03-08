/**
 * Cron Job: Position Sync
 * 
 * Синхронизация позиций с биржей каждые 30 секунд
 * Обнаружение внешних позиций и запрос на сопровождение
 */

import { NextRequest, NextResponse } from "next/server";
import { syncAllAccounts } from "@/lib/position-sync-service";

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) return true;
  
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7) === cronSecret;
  }
  
  const url = new URL(request.url);
  return url.searchParams.get("secret") === cronSecret;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    console.log("[PositionSync] Starting position sync...");
    
    const results = await syncAllAccounts();
    
    // Summary
    let totalNew = 0;
    let totalClosed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    
    for (const [accountId, result] of Object.entries(results)) {
      totalNew += result.newPositions?.length || 0;
      totalClosed += result.closedPositions?.length || 0;
      totalUpdated += result.updatedPositions?.length || 0;
      totalErrors += result.errors?.length || 0;
    }
    
    const duration = Date.now() - startTime;
    
    console.log(`[PositionSync] Completed in ${duration}ms: ${totalNew} new, ${totalClosed} closed, ${totalUpdated} updated, ${totalErrors} errors`);
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      summary: {
        newPositions: totalNew,
        closedPositions: totalClosed,
        updatedPositions: totalUpdated,
        errors: totalErrors,
      },
      details: results,
    });
    
  } catch (error) {
    console.error("[PositionSync] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        duration: `${Date.now() - startTime}ms`,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  return NextResponse.json({
    status: "ok",
    message: "Position Sync Cron endpoint ready",
    usage: {
      description: "Syncs positions from all connected REAL exchange accounts",
      schedule: "Every 30 seconds recommended",
    },
  });
}
