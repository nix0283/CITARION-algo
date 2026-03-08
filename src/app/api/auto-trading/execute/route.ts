import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  executeFirstEntryAsMarket,
  type FirstEntryConfig,
  type FirstEntryMode
} from "@/lib/auto-trading/first-entry-market";
import {
  executeTPGrace,
  type TPGraceConfig
} from "@/lib/auto-trading/tp-grace";
import {
  processTrailingStop,
  validateTrailingConfig,
  type TrailingStopConfig,
  type TrailingType
} from "@/lib/auto-trading/trailing-stop";
import {
  filterSignal,
  type SignalFilterConfig
} from "@/lib/auto-trading/signal-filter";

/**
 * POST /api/auto-trading/execute
 * Execute a signal with all auto-trading features
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      signalId,
      botConfigId,
      currentPrice,
      enableMetrics = true
    } = body;

    // Validate required fields
    if (!signalId || !botConfigId) {
      return NextResponse.json(
        { success: false, error: "signalId and botConfigId are required" },
        { status: 400 }
      );
    }

    // Get signal and bot config
    const [signal, botConfig] = await Promise.all([
      db.signal.findUnique({ where: { id: signalId } }),
      db.botConfig.findUnique({ where: { id: botConfigId } })
    ]);

    if (!signal || !botConfig) {
      return NextResponse.json(
        { success: false, error: "Signal or BotConfig not found" },
        { status: 404 }
      );
    }

    const startTime = Date.now();
    const executionResults: {
      signalFilter?: { passed: boolean; score: number };
      firstEntry?: { success: boolean; orderPlaced: boolean; orderPrice?: number };
      tpGrace?: { success: boolean; retriesNeeded: number };
      trailingStop?: { success: boolean; newSL?: number };
    } = {};

    const direction = signal.direction as "LONG" | "SHORT";
    const marketPrice = currentPrice || signal.entryPrice;

    // 1. Signal Filtering
    const filterConfig: SignalFilterConfig = {
      requireSL: botConfig.ignoreSignalsWithoutSL,
      requireTP: botConfig.ignoreSignalsWithoutTP,
      minRiskRewardRatio: botConfig.minRiskRewardRatio ?? undefined,
      directionFilter: undefined, // Would need to add to schema
      allowedSymbols: botConfig.allowedSymbols 
        ? JSON.parse(botConfig.allowedSymbols) 
        : undefined,
      blockedSymbols: botConfig.blacklistedSymbols 
        ? JSON.parse(botConfig.blacklistedSymbols) 
        : undefined
    };

    const filterResult = filterSignal(signal, filterConfig, marketPrice);
    executionResults.signalFilter = {
      passed: filterResult.passed,
      score: filterResult.score
    };

    if (!filterResult.passed) {
      // Record metric
      if (enableMetrics) {
        await recordMetric("signal_filter", "filter", false, Date.now() - startTime, 
          `Failed: ${filterResult.filters.filter(f => !f.passed).map(f => f.name).join(", ")}`);
      }

      return NextResponse.json({
        success: false,
        error: "Signal filtered out",
        filterResults: filterResult.filters,
        executionResults
      });
    }

    // 2. First Entry as Market
    if (botConfig.firstEntryAsMarketEnabled) {
      const firstEntryConfig: FirstEntryConfig = {
        enabled: true,
        mode: botConfig.firstEntryAsMarketActivate as FirstEntryMode,
        maxPriceCap: botConfig.firstEntryAsMarketCap
      };

      const firstEntryResult = await executeFirstEntryAsMarket(
        signal,
        firstEntryConfig,
        marketPrice
      );

      executionResults.firstEntry = {
        success: firstEntryResult.success,
        orderPlaced: firstEntryResult.orderPlaced,
        orderPrice: firstEntryResult.orderPrice
      };
    }

    // 3. TP Grace (setup for when TPs are hit)
    if (botConfig.tpGraceEnabled) {
      const tpGraceConfig: TPGraceConfig = {
        enabled: true,
        capPercent: botConfig.tpGraceMaxCap,
        maxRetries: 3 // Default
      };

      // Parse TP targets
      let tpTargets: Array<{ price: number; amount: number }> = [];
      if (signal.takeProfits) {
        try {
          const tps = JSON.parse(signal.takeProfits);
          tpTargets = tps.map((tp: any) => ({
            price: tp.price,
            amount: tp.percentage || 100 / tps.length
          }));
        } catch (e) {
          // Use single TP if available
          if (signal.takeProfit) {
            tpTargets = [{ price: signal.takeProfit, amount: 100 }];
          }
        }
      }

      const tpGraceResults = await executeTPGrace(
        signal.id,
        tpTargets,
        tpGraceConfig,
        direction
      );

      executionResults.tpGrace = {
        success: tpGraceResults[0]?.success ?? false,
        retriesNeeded: tpGraceResults.filter(r => r.retryPlaced).length
      };
    }

    // 4. Trailing Stop (setup)
    if (botConfig.trailingEnabled) {
      const trailingConfig: TrailingStopConfig = {
        enabled: true,
        type: botConfig.trailingType as TrailingType,
        triggerType: botConfig.trailingTriggerType as "TARGET_REACHED" | "PERCENT_ABOVE_ENTRY",
        triggerValue: botConfig.trailingTriggerValue ?? undefined,
        trailingPercent: botConfig.trailingPercent ?? undefined
      };

      const validation = validateTrailingConfig(trailingConfig);
      if (validation.valid && signal.stopLoss) {
        const trailingState = {
          id: `ts-${Date.now()}`,
          positionId: signal.id,
          type: trailingConfig.type,
          status: "INACTIVE" as const,
          originalSL: signal.stopLoss,
          currentSL: signal.stopLoss,
          avgEntryPrice: signal.entryPrice,
          highestPrice: signal.entryPrice,
          lowestPrice: signal.entryPrice,
          triggerTargetIndex: -1,
          lastTPPrice: null,
          last2TPPrice: null,
          trailingDistance: trailingConfig.trailingPercent || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          activatedAt: null
        };

        // Parse TP targets for trailing
        let tpPrices: number[] = [];
        if (signal.takeProfits) {
          try {
            const tps = JSON.parse(signal.takeProfits);
            tpPrices = tps.map((tp: any) => tp.price);
          } catch (e) {
            if (signal.takeProfit) {
              tpPrices = [signal.takeProfit];
            }
          }
        }

        const trailingResult = processTrailingStop(
          trailingState,
          trailingConfig,
          marketPrice,
          tpPrices,
          0, // filledTPCount
          direction
        );

        executionResults.trailingStop = {
          success: trailingResult.success,
          newSL: trailingResult.newSL
        };
      }
    }

    // Record execution metric
    const totalTime = Date.now() - startTime;
    if (enableMetrics) {
      await recordMetric("signal_execute", "execute", true, totalTime);
    }

    return NextResponse.json({
      success: true,
      executionResults,
      executionTime: totalTime,
      signal: {
        id: signal.id,
        symbol: signal.symbol,
        direction: signal.direction
      }
    });

  } catch (error) {
    console.error("Auto-trading execute API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Record metric to database
 */
async function recordMetric(
  featureName: string,
  command: string,
  success: boolean,
  executionTime: number,
  errorMessage?: string
) {
  try {
    await db.cornixFeatureMetric.create({
      data: {
        featureName,
        command,
        success,
        executionTime,
        errorMessage
      }
    });
  } catch (e) {
    console.error("Failed to record metric:", e);
  }
}

/**
 * GET /api/auto-trading/execute
 * Get execution statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const featureName = searchParams.get("feature");
    const days = parseInt(searchParams.get("days") || "7");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const whereClause: any = {
      createdAt: { gte: startDate }
    };

    if (featureName) {
      whereClause.featureName = featureName;
    }

    const metrics = await db.cornixFeatureMetric.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 100
    });

    // Calculate statistics
    const totalExecutions = metrics.length;
    const successfulExecutions = metrics.filter(m => m.success).length;
    const avgExecutionTime = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.executionTime, 0) / metrics.length
      : 0;

    // Group by feature
    const featureStats: Record<string, { count: number; success: number; avgTime: number }> = {};
    for (const metric of metrics) {
      if (!featureStats[metric.featureName]) {
        featureStats[metric.featureName] = { count: 0, success: 0, avgTime: 0 };
      }
      featureStats[metric.featureName].count++;
      if (metric.success) featureStats[metric.featureName].success++;
      featureStats[metric.featureName].avgTime += metric.executionTime;
    }

    // Calculate averages
    for (const feature of Object.keys(featureStats)) {
      featureStats[feature].avgTime /= featureStats[feature].count;
    }

    return NextResponse.json({
      success: true,
      statistics: {
        totalExecutions,
        successfulExecutions,
        successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
        avgExecutionTime,
        featureStats
      },
      recentMetrics: metrics.slice(0, 20)
    });

  } catch (error) {
    console.error("Auto-trading GET API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
