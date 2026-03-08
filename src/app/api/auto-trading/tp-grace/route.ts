import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  executeTPGrace,
  validateTPGraceConfig,
  type TPGraceConfig
} from "@/lib/auto-trading/tp-grace";

/**
 * POST /api/auto-trading/tp-grace
 * Process TP Grace for a position
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      positionId,
      config,
      tpTargets,
      direction,
      existingStateId
    } = body;

    // Validate required fields
    if (!positionId) {
      return NextResponse.json(
        { success: false, error: "positionId is required" },
        { status: 400 }
      );
    }

    // Get position from database
    const position = await db.position.findUnique({
      where: { id: positionId }
    });

    if (!position) {
      return NextResponse.json(
        { success: false, error: "Position not found" },
        { status: 404 }
      );
    }

    // Validate config
    const graceConfig: TPGraceConfig = {
      enabled: config?.enabled ?? true,
      capPercent: config?.capPercent ?? 0.5,
      maxRetries: config?.maxRetries ?? 3,
      retryInterval: config?.retryInterval ?? 5000
    };

    const validation = validateTPGraceConfig(graceConfig);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    // Get existing state if provided
    let existingState = null;
    if (existingStateId) {
      const stateRecord = await db.tPGraceState.findUnique({
        where: { id: existingStateId }
      });
      if (stateRecord) {
        existingState = {
          ...stateRecord,
          tpTargets: JSON.parse(stateRecord.tpTargets)
        };
      }
    }

    // Parse TP targets
    const targets = tpTargets || [];
    const posDirection = direction || position.direction as "LONG" | "SHORT";

    // Execute TP Grace
    const results = await executeTPGrace(
      positionId,
      targets,
      graceConfig,
      posDirection,
      existingState
    );

    // Save state to database
    if (results[0]?.state) {
      await db.tPGraceState.upsert({
        where: { positionId },
        create: {
          positionId,
          signalId: position.signalId || undefined,
          tpTargets: JSON.stringify(results[0].state.tpTargets),
          totalRetries: results[0].state.totalRetries,
          maxRetries: results[0].state.maxRetries,
          capPercent: results[0].state.capPercent,
          direction: results[0].state.direction,
          status: results[0].state.status
        },
        update: {
          tpTargets: JSON.stringify(results[0].state.tpTargets),
          totalRetries: results[0].state.totalRetries,
          status: results[0].state.status
        }
      });
    }

    return NextResponse.json({
      success: true,
      results: results.map(r => ({
        success: r.success,
        retryPlaced: r.retryPlaced,
        retryPrice: r.retryPrice,
        retryAmount: r.retryAmount,
        targetId: r.targetId,
        error: r.error
      })),
      state: results[0]?.state
    });

  } catch (error) {
    console.error("TP Grace API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auto-trading/tp-grace
 * Get TP Grace state for a position
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const positionId = searchParams.get("positionId");
    const botConfigId = searchParams.get("botConfigId");

    if (positionId) {
      // Get TP Grace state for position
      const state = await db.tPGraceState.findUnique({
        where: { positionId }
      });

      if (!state) {
        return NextResponse.json(
          { success: true, state: null }
        );
      }

      return NextResponse.json({
        success: true,
        state: {
          ...state,
          tpTargets: JSON.parse(state.tpTargets)
        }
      });
    }

    if (botConfigId) {
      // Get TP Grace config from bot config
      const botConfig = await db.botConfig.findUnique({
        where: { id: botConfigId },
        select: {
          tpGraceEnabled: true,
          tpGraceMaxCap: true
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
          enabled: botConfig.tpGraceEnabled,
          capPercent: botConfig.tpGraceMaxCap
        }
      });
    }

    return NextResponse.json(
      { success: false, error: "positionId or botConfigId is required" },
      { status: 400 }
    );

  } catch (error) {
    console.error("TP Grace GET API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
