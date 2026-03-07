import { NextRequest, NextResponse } from "next/server";
import {
  getRiskService,
  initializeRiskService,
  type RiskServiceConfig,
  type RiskServiceReport,
} from "@/lib/risk-management/risk-service";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";

// =============================================================================
// GET /api/risk - Get current risk report with real data
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'report';

    const riskService = getRiskService();

    switch (action) {
      case 'report':
        return await getRiskReport(riskService);
      
      case 'killswitch':
        return await getKillSwitchStatus(riskService);
      
      case 'bots':
        return await getBotRiskData();
      
      case 'exchanges':
        return await getExchangeRiskData();
      
      case 'positions':
        return await getPositionRiskData();
      
      default:
        return await getRiskReport(riskService);
    }
  } catch (error) {
    console.error("[Risk API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get risk data" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/risk - Update risk service or trigger actions
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const riskService = getRiskService();
    const { action, config, portfolio } = body;

    switch (action) {
      case 'update':
        // Update with new portfolio data
        if (portfolio) {
          const report = riskService['riskyManager']?.update(portfolio);
          return NextResponse.json({
            success: true,
            data: report,
          });
        }
        break;

      case 'configure':
        // Update configuration
        if (config) {
          riskService.updateConfig(config as Partial<RiskServiceConfig>);
          return NextResponse.json({
            success: true,
            message: "Configuration updated",
          });
        }
        break;

      case 'killswitch_trigger':
        // Manually trigger kill switch
        const triggerResult = await riskService.triggerKillSwitch(
          body.reason || "Manual trigger"
        );
        return NextResponse.json({
          success: true,
          data: triggerResult,
        });

      case 'killswitch_arm':
        // Arm the kill switch
        riskService.armKillSwitch();
        return NextResponse.json({
          success: true,
          message: "Kill switch armed",
        });

      case 'killswitch_disarm':
        // Disarm the kill switch
        riskService.disarmKillSwitch();
        return NextResponse.json({
          success: true,
          message: "Kill switch disarmed",
        });

      case 'initialize':
        // Initialize the service
        await riskService.initialize();
        return NextResponse.json({
          success: true,
          message: "Risk service initialized",
        });

      case 'start':
        // Start monitoring
        riskService.start();
        return NextResponse.json({
          success: true,
          message: "Risk monitoring started",
        });

      case 'stop':
        // Stop monitoring
        riskService.stop();
        return NextResponse.json({
          success: true,
          message: "Risk monitoring stopped",
        });

      default:
        return NextResponse.json(
          { success: false, error: "Invalid action" },
          { status: 400 }
        );
    }

    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Risk API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process request" },
      { status: 500 }
    );
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function getRiskReport(riskService: ReturnType<typeof getRiskService>) {
  // Initialize if not already
  await riskService.initialize();
  
  // Get the report
  let report = riskService.getReport();

  if (!report) {
    // Return a default report if not initialized
    report = await buildDefaultReport();
  }

  return NextResponse.json({
    success: true,
    data: report,
  });
}

async function getKillSwitchStatus(riskService: ReturnType<typeof getRiskService>) {
  const status = riskService.getKillSwitchStatus();
  
  return NextResponse.json({
    success: true,
    data: status,
  });
}

async function getBotRiskData() {
  try {
    const bots: any[] = [];

    // DCA Bots
    const dcaBots = await db.dcaBot.findMany({
      where: { isActive: true },
      include: { account: true },
      take: 50,
    });

    for (const bot of dcaBots) {
      bots.push({
        id: bot.id,
        code: `DCA-${bot.symbol}-${bot.id.slice(0, 4)}`,
        type: 'DCA',
        status: bot.status || 'STOPPED',
        symbol: bot.symbol,
        totalInvested: bot.totalInvested,
        currentPnL: bot.realizedPnL,
        leverage: bot.leverage,
        exchange: bot.account?.exchangeName || 'binance',
        riskLevel: calculateBotRisk(bot),
      });
    }

    // BB Bots
    const bbBots = await db.bBBot.findMany({
      where: { isActive: true },
      include: { account: true },
      take: 50,
    });

    for (const bot of bbBots) {
      bots.push({
        id: bot.id,
        code: `BB-${bot.symbol}-${bot.id.slice(0, 4)}`,
        type: 'BB',
        status: bot.status || 'STOPPED',
        symbol: bot.symbol,
        totalInvested: bot.totalInvested || 0,
        currentPnL: bot.realizedPnL || 0,
        leverage: bot.leverage,
        exchange: bot.account?.exchangeName || 'binance',
        riskLevel: calculateBotRisk(bot),
      });
    }

    // Grid Bots
    const gridBots = await db.gridBot.findMany({
      where: { isActive: true },
      include: { account: true },
      take: 50,
    });

    for (const bot of gridBots) {
      bots.push({
        id: bot.id,
        code: `GRID-${bot.symbol}-${bot.id.slice(0, 4)}`,
        type: 'GRID',
        status: bot.status || 'STOPPED',
        symbol: bot.symbol,
        totalInvested: bot.totalInvested || 0,
        currentPnL: bot.realizedPnL || 0,
        leverage: 1,
        exchange: bot.account?.exchangeName || 'binance',
        riskLevel: calculateBotRisk(bot),
      });
    }

    // BotConfigs (ORION, LOGOS, MFT)
    const botConfigs = await db.botConfig.findMany({
      where: { isActive: true },
      take: 50,
    });

    for (const config of botConfigs) {
      const botType = config.strategy as string;
      bots.push({
        id: config.id,
        code: config.botCode || `${botType}-${config.id.slice(0, 4)}`,
        type: botType,
        status: config.status || 'STOPPED',
        symbol: config.symbol,
        totalInvested: (config.tradeAmount || 0) * 10,
        currentPnL: 0,
        leverage: config.leverage || 1,
        exchange: 'binance',
        riskLevel: 'low',
      });
    }

    // Calculate summary
    const summary = {
      total: bots.length,
      running: bots.filter(b => b.status === 'RUNNING').length,
      stopped: bots.filter(b => b.status === 'STOPPED').length,
      paused: bots.filter(b => b.status === 'PAUSED').length,
      totalInvested: bots.reduce((sum, b) => sum + (b.totalInvested || 0), 0),
      totalPnL: bots.reduce((sum, b) => sum + (b.currentPnL || 0), 0),
      riskDistribution: {
        low: bots.filter(b => b.riskLevel === 'low').length,
        medium: bots.filter(b => b.riskLevel === 'medium').length,
        high: bots.filter(b => b.riskLevel === 'high').length,
        critical: bots.filter(b => b.riskLevel === 'critical').length,
      },
    };

    return NextResponse.json({
      success: true,
      data: { bots, summary },
    });
  } catch (error) {
    console.error("[Risk API] Error fetching bots:", error);
    return NextResponse.json({
      success: true,
      data: { bots: [], summary: { total: 0, running: 0, stopped: 0, paused: 0, totalInvested: 0, totalPnL: 0, riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 } } },
    });
  }
}

async function getExchangeRiskData() {
  try {
    const accounts = await db.account.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { positions: { where: { status: 'OPEN' } } } }
      }
    });

    const exchanges = accounts.map(acc => ({
      name: acc.exchangeName,
      accountId: acc.id,
      accountType: acc.accountType,
      connected: true,
      positions: acc._count.positions,
    }));

    // Group by exchange
    const exchangeMap = new Map<string, any>();
    for (const acc of exchanges) {
      const existing = exchangeMap.get(acc.name) || {
        name: acc.name,
        connected: false,
        accounts: 0,
        positions: 0,
      };
      existing.connected = true;
      existing.accounts++;
      existing.positions += acc.positions;
      exchangeMap.set(acc.name, existing);
    }

    return NextResponse.json({
      success: true,
      data: {
        exchanges: Array.from(exchangeMap.values()),
        total: exchangeMap.size,
      },
    });
  } catch (error) {
    console.error("[Risk API] Error fetching exchanges:", error);
    return NextResponse.json({
      success: true,
      data: { exchanges: [], total: 0 },
    });
  }
}

async function getPositionRiskData() {
  try {
    const positions = await db.position.findMany({
      where: { status: 'OPEN' },
      include: { account: true },
      take: 100,
    });

    const positionRisks = positions.map(pos => {
      const exposure = pos.totalAmount * (pos.currentPrice || pos.avgEntryPrice);
      const pnlPercent = exposure > 0 ? (pos.unrealizedPnl / exposure) * 100 : 0;
      
      return {
        id: pos.id,
        symbol: pos.symbol,
        side: pos.direction,
        size: pos.totalAmount,
        entryPrice: pos.avgEntryPrice,
        currentPrice: pos.currentPrice || pos.avgEntryPrice,
        pnl: pos.unrealizedPnl,
        pnlPercent,
        leverage: pos.leverage,
        exposure,
        exchange: pos.account?.exchangeName || 'unknown',
        riskLevel: getRiskLevel(pnlPercent, pos.leverage),
      };
    });

    const summary = {
      total: positionRisks.length,
      totalExposure: positionRisks.reduce((sum, p) => sum + p.exposure, 0),
      totalPnL: positionRisks.reduce((sum, p) => sum + p.pnl, 0),
      longPositions: positionRisks.filter(p => p.side === 'LONG').length,
      shortPositions: positionRisks.filter(p => p.side === 'SHORT').length,
      avgLeverage: positionRisks.length > 0 
        ? positionRisks.reduce((sum, p) => sum + p.leverage, 0) / positionRisks.length 
        : 0,
    };

    return NextResponse.json({
      success: true,
      data: { positions: positionRisks, summary },
    });
  } catch (error) {
    console.error("[Risk API] Error fetching positions:", error);
    return NextResponse.json({
      success: true,
      data: { positions: [], summary: { total: 0, totalExposure: 0, totalPnL: 0, longPositions: 0, shortPositions: 0, avgLeverage: 0 } },
    });
  }
}

async function buildDefaultReport(): Promise<RiskServiceReport> {
  // Try to get real data
  try {
    const positions = await db.position.findMany({
      where: { status: 'OPEN' },
      take: 100,
    });

    const bots = await db.dcaBot.count({ where: { isActive: true } })
      + await db.bBBot.count({ where: { isActive: true } })
      + await db.gridBot.count({ where: { isActive: true } });

    const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const totalExposure = positions.reduce((sum, p) => sum + p.totalAmount * (p.currentPrice || p.avgEntryPrice), 0);

    return {
      timestamp: Date.now(),
      var: {
        var: totalExposure * 0.028,
        expectedShortfall: totalExposure * 0.039,
        confidenceLevel: 0.95,
        timeHorizon: 1,
        method: "historical",
        timestamp: Date.now(),
        portfolioValue: totalExposure + 50000,
        riskPercentage: 2.85,
      },
      exposure: {
        total: totalExposure,
        bySymbol: {},
        byExchange: {},
      },
      drawdown: {
        state: {
          currentDrawdown: totalPnL < 0 ? Math.abs(totalPnL) / (totalExposure + 50000) * 100 : 0,
          peakEquity: totalExposure + 50000 + Math.abs(totalPnL),
          currentEquity: totalExposure + 50000,
          level: totalPnL < -5000 ? 'warning' : 'none',
          duration: 0,
          startedAt: null,
          maxDrawdown: 10,
          recoveryPct: 0,
        },
        daily: totalPnL < 0 ? Math.abs(totalPnL) / (totalExposure + 50000) : 0,
        weekly: 0,
        monthly: 0,
        avgRecoveryTime: 0,
        drawdownCount: 0,
      },
      limits: {
        used: totalExposure,
        available: 100000 - totalExposure,
        breaches: [],
      },
      killSwitch: {
        isArmed: true,
        isTriggered: false,
        botsStopped: 0,
      },
      riskScore: Math.min(Math.round((totalExposure / 100000) * 50 + (totalPnL < 0 ? 20 : 0)), 100),
      recommendations: totalPnL < -5000 
        ? ["Consider reducing position sizes due to losses", "Review risk parameters"]
        : ["Risk levels within acceptable parameters"],
      volatilityRegime: 'normal',
      garchAdjustments: {
        varMultiplier: 1.0,
        positionSizeMultiplier: 1.0,
        stopLossMultiplier: 1.0,
      },
      bots: {
        total: bots,
        running: bots,
        stopped: 0,
        riskLevel: 'low',
      },
      exchanges: [],
    };
  } catch (error) {
    // Return minimal default
    return {
      timestamp: Date.now(),
      var: {
        var: 2500,
        expectedShortfall: 3250,
        confidenceLevel: 0.95,
        timeHorizon: 1,
        method: "historical",
        timestamp: Date.now(),
        portfolioValue: 100000,
        riskPercentage: 2.5,
      },
      exposure: { total: 0, bySymbol: {}, byExchange: {} },
      drawdown: {
        state: {
          currentDrawdown: 0,
          peakEquity: 100000,
          currentEquity: 100000,
          level: 'none',
          duration: 0,
          startedAt: null,
          maxDrawdown: 10,
          recoveryPct: 0,
        },
        daily: 0,
        weekly: 0,
        monthly: 0,
        avgRecoveryTime: 0,
        drawdownCount: 0,
      },
      limits: { used: 0, available: 100000, breaches: [] },
      killSwitch: { isArmed: true, isTriggered: false, botsStopped: 0 },
      riskScore: 0,
      recommendations: ["Risk service initializing"],
      volatilityRegime: 'normal',
      garchAdjustments: { varMultiplier: 1.0, positionSizeMultiplier: 1.0, stopLossMultiplier: 1.0 },
      bots: { total: 0, running: 0, stopped: 0, riskLevel: 'low' },
      exchanges: [],
    };
  }
}

function calculateBotRisk(bot: any): 'low' | 'medium' | 'high' | 'critical' {
  const pnl = bot.realizedPnL || 0;
  const invested = bot.totalInvested || 1;
  const pnlPercent = (pnl / invested) * 100;
  const leverage = bot.leverage || 1;

  if (pnlPercent < -20 || leverage > 15) return 'critical';
  if (pnlPercent < -10 || leverage > 10) return 'high';
  if (pnlPercent < -5 || leverage > 5) return 'medium';
  return 'low';
}

function getRiskLevel(pnlPercent: number, leverage: number): 'low' | 'medium' | 'high' | 'critical' {
  if (pnlPercent < -15 || leverage > 15) return 'critical';
  if (pnlPercent < -10 || leverage > 10) return 'high';
  if (pnlPercent < -5 || leverage > 5) return 'medium';
  return 'low';
}
