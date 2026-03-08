/**
 * Position Sync API
 * 
 * Endpoints:
 * - POST: Sync positions from all connected REAL accounts
 * - GET: Get sync status and pending escort requests
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  syncPositionsFromAccount, 
  syncAllAccounts,
  getPendingEscortRequests,
  getEscortingPositions,
} from "@/lib/position-sync-service";
import { db } from "@/lib/db";

// ==================== SYNC POSITIONS ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountId = body.accountId;

    let result;

    if (accountId) {
      // Sync specific account
      result = await syncPositionsFromAccount(accountId);
    } else {
      // Sync all REAL accounts
      result = await syncAllAccounts();
    }

    // Summary
    const summary = {
      totalNewPositions: Object.values(result).reduce(
        (sum: number, r: any) => sum + (r.newPositions?.length || 0), 
        0
      ),
      totalClosed: Object.values(result).reduce(
        (sum: number, r: any) => sum + (r.closedPositions?.length || 0), 
        0
      ),
      totalUpdated: Object.values(result).reduce(
        (sum: number, r: any) => sum + (r.updatedPositions?.length || 0), 
        0
      ),
      errors: Object.entries(result)
        .filter(([_, r]: [string, any]) => r.errors?.length > 0)
        .map(([id, r]: [string, any]) => ({ accountId: id, errors: r.errors })),
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      details: result,
    });

  } catch (error) {
    console.error("[PositionSync] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// ==================== GET STATUS ====================

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    switch (action) {
      case "pending": {
        // Get pending escort requests
        const pending = await getPendingEscortRequests();
        return NextResponse.json({
          success: true,
          pendingRequests: pending,
        });
      }

      case "escorting": {
        // Get positions being escorted
        const escorting = await getEscortingPositions();
        return NextResponse.json({
          success: true,
          escortingPositions: escorting,
        });
      }

      case "accounts": {
        // Get connected REAL accounts with their sync status
        const accounts = await db.account.findMany({
          where: {
            accountType: "REAL",
            isActive: true,
            apiKey: { not: null },
          },
          select: {
            id: true,
            exchangeId: true,
            exchangeName: true,
            exchangeType: true,
            lastSyncAt: true,
            lastError: true,
          },
        });

        return NextResponse.json({
          success: true,
          accounts,
        });
      }

      default: {
        // Return full status
        const [pending, escorting, accounts] = await Promise.all([
          getPendingEscortRequests(),
          getEscortingPositions(),
          db.account.findMany({
            where: {
              accountType: "REAL",
              isActive: true,
              apiKey: { not: null },
            },
            select: {
              id: true,
              exchangeId: true,
              exchangeName: true,
              exchangeType: true,
              lastSyncAt: true,
              lastError: true,
            },
          }),
        ]);

        return NextResponse.json({
          success: true,
          status: {
            pendingRequests: pending.length,
            escortingPositions: escorting.length,
            connectedAccounts: accounts.length,
          },
          pending,
          escorting,
          accounts,
        });
      }
    }

  } catch (error) {
    console.error("[PositionSync] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
