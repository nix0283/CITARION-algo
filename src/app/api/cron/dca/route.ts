/**
 * Cron Job: DCA Bot Worker
 * 
 * Call this endpoint periodically (e.g., every minute) to process DCA bots
 */

import { NextRequest, NextResponse } from "next/server";
import { processAllDcaBots, processDcaBot } from "@/lib/bot-workers";

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
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body = await request.json().catch(() => ({}));
    const botId = body.botId;
    
    if (botId) {
      const result = await processDcaBot(botId);
      return NextResponse.json({
        success: result.success,
        botId,
        actions: result.actions,
        error: result.error,
      });
    }
    
    const result = await processAllDcaBots();
    
    return NextResponse.json({
      success: true,
      processed: result.processed,
      bots: result.results,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error("DCA cron error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
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
    message: "DCA Bot Cron endpoint ready",
  });
}
