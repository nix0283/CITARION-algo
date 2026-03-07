/**
 * Cron Job: All Bots Worker
 * 
 * Combined endpoint to process all trading bots
 * Grid, DCA, and Position Monitor in one call
 */

import { NextRequest, NextResponse } from "next/server";
import { processAllGridBots } from "@/lib/bot-workers";
import { processAllDcaBots } from "@/lib/bot-workers";
import { monitorAllPositions } from "@/lib/position-monitor";

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
    
    const body = await request.json().catch(() => ({}));
    const tasks = body.tasks || ["grid", "dca", "positions"];
    
    const results: Record<string, unknown> = {};
    
    // Process grid bots
    if (tasks.includes("grid")) {
      try {
        results.grid = await processAllGridBots();
      } catch (error) {
        results.grid = { error: error instanceof Error ? error.message : "Unknown error" };
      }
    }
    
    // Process DCA bots
    if (tasks.includes("dca")) {
      try {
        results.dca = await processAllDcaBots();
      } catch (error) {
        results.dca = { error: error instanceof Error ? error.message : "Unknown error" };
      }
    }
    
    // Monitor positions (TP/SL)
    if (tasks.includes("positions")) {
      try {
        await monitorAllPositions();
        results.positions = { success: true };
      } catch (error) {
        results.positions = { error: error instanceof Error ? error.message : "Unknown error" };
      }
    }
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      results,
    });
    
  } catch (error) {
    console.error("Cron all error:", error);
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
    message: "All Bots Cron endpoint ready",
    tasks: ["grid", "dca", "positions"],
    usage: {
      POST: {
        body: {
          tasks: "Array of tasks to run: ['grid', 'dca', 'positions']",
        },
      },
    },
  });
}

// Export monitor function for import
export { monitorAllPositions };
