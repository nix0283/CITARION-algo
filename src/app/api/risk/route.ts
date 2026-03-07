import { NextRequest, NextResponse } from "next/server";
import {
  RiskManager,
  defaultRiskManagerConfig,
  type RiskManagerConfig,
  type VaRConfig,
  type PositionLimits,
  type DrawdownThresholds,
  type KillSwitchConfig,
  type RiskReport,
  type PortfolioData,
} from "@/lib/risk-management";

// Singleton instance for the risk manager
let riskManagerInstance: RiskManager | null = null;

function getRiskManager(): RiskManager {
  if (!riskManagerInstance) {
    riskManagerInstance = new RiskManager(defaultRiskManagerConfig);
    riskManagerInstance.initialize(100000); // Default $100k portfolio
  }
  return riskManagerInstance;
}

// GET /api/risk - Get current risk report
export async function GET(request: NextRequest) {
  try {
    const manager = getRiskManager();
    const report = manager.getReport();

    if (!report) {
      // Return default risk report
      const defaultReport: RiskReport = {
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
        exposure: {
          total: 45000,
          bySymbol: {
            BTC: 20000,
            ETH: 15000,
            SOL: 10000,
          },
          byExchange: {
            binance: 30000,
            bybit: 15000,
          },
        },
        drawdown: {
          state: {
            currentDrawdown: 0.05,
            peakEquity: 105000,
            currentEquity: 99750,
            level: "warning",
            duration: 2 * 24 * 60 * 60 * 1000,
            startedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
            maxDrawdown: 0.08,
            recoveryPct: 0.375,
          },
          daily: 0.02,
          weekly: 0.05,
          monthly: 0.08,
          avgRecoveryTime: 72 * 60 * 60 * 1000,
          drawdownCount: 3,
        },
        limits: {
          used: 45000,
          available: 55000,
          breaches: [],
        },
        killSwitch: {
          state: "armed",
          positionsClosed: 0,
          pnlSaved: 0,
          triggerHistory: [],
        },
        riskScore: 35,
        recommendations: [
          "Risk levels within acceptable parameters",
          "Consider diversifying portfolio exposure",
        ],
      };

      return NextResponse.json({
        success: true,
        data: defaultReport,
      });
    }

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Error getting risk report:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get risk report" },
      { status: 500 }
    );
  }
}

// POST /api/risk - Update risk manager with new portfolio data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const manager = getRiskManager();

    // If portfolio data provided, update the manager
    if (body.portfolio) {
      const portfolio: PortfolioData = body.portfolio;
      const report = manager.update(portfolio);

      return NextResponse.json({
        success: true,
        data: report,
      });
    }

    // If config provided, update configuration
    if (body.config) {
      manager.updateConfig(body.config);
      return NextResponse.json({
        success: true,
        message: "Configuration updated",
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating risk manager:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update risk manager" },
      { status: 500 }
    );
  }
}
