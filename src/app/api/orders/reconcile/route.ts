/**
 * Order Reconciliation API Endpoint
 * 
 * POST /api/orders/reconcile
 * Manually triggers order reconciliation to detect "ghost orders"
 * 
 * GET /api/orders/reconcile
 * Gets the current reconciliation scheduler status
 * 
 * Request body (POST):
 * - accountId: string (optional) - Reconcile specific account
 * - config: Partial<ReconciliationConfig> (optional) - Override default config
 * - startScheduler: boolean (optional) - Start the periodic scheduler
 * - stopScheduler: boolean (optional) - Stop the periodic scheduler
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  OrderReconciler,
  startPeriodicReconciliation,
  stopPeriodicReconciliation,
  getSchedulerStatus,
  quickReconcileAccount,
  quickReconcileAll,
  type ReconciliationConfig,
  type BulkReconciliationResult,
  type ReconciliationResult,
} from "@/lib/order-reconciliation";

interface ReconcileRequest {
  accountId?: string;
  config?: Partial<ReconciliationConfig>;
  startScheduler?: boolean;
  stopScheduler?: boolean;
}

/**
 * GET - Get reconciliation status and history
 */
const handleGet = async (request: NextRequest, context: AuthContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const limit = parseInt(searchParams.get("limit") || "10");

    // Get scheduler status
    const schedulerStatus = getSchedulerStatus();

    // Get recent reconciliation logs
    const whereClause: {
      category: string;
      accountId?: string;
    } = {
      category: "RECONCILIATION",
    };

    if (accountId) {
      whereClause.accountId = accountId;
    }

    const logs = await db.systemLog.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Parse log details
    const parsedLogs = logs.map(log => {
      let details = null;
      try {
        details = log.details ? JSON.parse(log.details) : null;
      } catch {
        // Keep details as null if parsing fails
      }
      return {
        id: log.id,
        level: log.level,
        message: log.message,
        createdAt: log.createdAt,
        details,
      };
    });

    return NextResponse.json({
      success: true,
      scheduler: schedulerStatus,
      recentLogs: parsedLogs,
      summary: {
        totalReconciliations: logs.length,
        lastReconciliation: logs[0]?.createdAt || null,
      },
    });
  } catch (error) {
    console.error("[ReconcileAPI] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get reconciliation status" },
      { status: 500 }
    );
  }
};

/**
 * POST - Trigger reconciliation
 */
const handlePost = async (request: NextRequest, context: AuthContext) => {
  try {
    const body: ReconcileRequest = await request.json();
    const { accountId, config, startScheduler, stopScheduler } = body;

    // Log the request
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        userId: context.userId,
        message: `[RECONCILE] Manual reconciliation triggered via ${context.authType}`,
        details: JSON.stringify({
          accountId,
          config,
          startScheduler,
          stopScheduler,
        }),
      },
    });

    // Handle scheduler control
    if (startScheduler) {
      const scheduler = startPeriodicReconciliation(config || {});
      return NextResponse.json({
        success: true,
        message: "Reconciliation scheduler started",
        status: scheduler.status(),
      });
    }

    if (stopScheduler) {
      stopPeriodicReconciliation();
      return NextResponse.json({
        success: true,
        message: "Reconciliation scheduler stopped",
        status: getSchedulerStatus(),
      });
    }

    // Run reconciliation
    let result: ReconciliationResult | BulkReconciliationResult;

    if (accountId) {
      // Verify account belongs to user
      const account = await db.account.findUnique({
        where: { id: accountId },
      });

      if (!account || account.userId !== context.userId) {
        return NextResponse.json(
          { error: "Account not found or access denied" },
          { status: 403 }
        );
      }

      // Run reconciliation for specific account
      result = await quickReconcileAccount(accountId, config || {});
    } else {
      // Run reconciliation for all accounts
      result = await quickReconcileAll(config || {});
    }

    // Log the result
    await db.systemLog.create({
      data: {
        level: result.summary.totalOrphanedOrders > 0 || result.summary.totalMissingOrders > 0 ? "WARNING" : "INFO",
        category: "RECONCILIATION",
        userId: context.userId,
        message: `[RECONCILE] Manual reconciliation completed`,
        details: JSON.stringify({
          type: accountId ? 'single_account' : 'all_accounts',
          accountId,
          summary: result.summary,
          durationMs: 'durationMs' in result ? result.durationMs : 0,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      result,
      authType: context.authType,
    });
  } catch (error) {
    console.error("[ReconcileAPI] POST error:", error);
    
    return NextResponse.json(
      { 
        error: "Reconciliation failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
};

// Export wrapped handlers with authentication
export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
