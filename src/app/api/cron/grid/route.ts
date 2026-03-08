/**
 * Cron Job: Grid Bot Worker
 * 
 * Call this endpoint periodically (e.g., every minute) to process grid bots
 * 
 * Setup:
 * 1. Vercel Cron: Add to vercel.json
 * 2. External Cron: curl -X POST https://your-domain/api/cron/grid
 * 3. GitHub Actions: Scheduled workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { processAllGridBots, processGridBot } from "@/lib/bot-workers";

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow if no secret is configured (development)
  if (!cronSecret) {
    return true;
  }
  
  // Verify Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return token === cronSecret;
  }
  
  // Verify query param
  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  return secretParam === cronSecret;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Check if specific bot ID is provided
    const body = await request.json().catch(() => ({}));
    const botId = body.botId;
    
    if (botId) {
      // Process single bot
      const result = await processGridBot(botId);
      return NextResponse.json({
        success: result.success,
        botId,
        actions: result.actions,
        error: result.error,
      });
    }
    
    // Process all active grid bots
    const result = await processAllGridBots();
    
    return NextResponse.json({
      success: true,
      processed: result.processed,
      bots: result.results,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error("Grid cron error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// GET for easy testing
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  return NextResponse.json({
    status: "ok",
    message: "Grid Bot Cron endpoint ready",
    usage: {
      POST: {
        description: "Process all grid bots or a specific one",
        body: {
          botId: "optional - process specific bot",
        },
      },
    },
  });
}
