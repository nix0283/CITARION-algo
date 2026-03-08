/**
 * Demo Close Position API Endpoint
 * 
 * Closes a single demo position
 * No authentication required - uses default demo user
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDefaultUser } from "@/lib/auth-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { positionId } = body;

    if (!positionId) {
      return NextResponse.json(
        { success: false, error: "Position ID is required" },
        { status: 400 }
      );
    }

    // Get default demo user
    const user = await getDefaultUser();

    // Find the position
    const position = await db.position.findFirst({
      where: {
        id: positionId,
        status: "OPEN",
        isDemo: true,
        account: { userId: user.id },
      },
      include: {
        account: true,
      },
    });

    if (!position) {
      return NextResponse.json(
        { success: false, error: "Position not found" },
        { status: 404 }
      );
    }

    // Calculate PnL (simple demo calculation)
    const pnl = position.unrealizedPnl || 0;
    const margin = (position.totalAmount * position.avgEntryPrice) / position.leverage;
    const returnAmount = margin + pnl;

    // Update position status
    await db.position.update({
      where: { id: positionId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closeReason: "MANUAL",
        realizedPnl: pnl,
      },
    });

    // Return margin + PnL to balance
    const balanceData = position.account.virtualBalance
      ? JSON.parse(position.account.virtualBalance)
      : { USDT: 10000 };

    balanceData.USDT = (balanceData.USDT || 0) + returnAmount;

    await db.account.update({
      where: { id: position.account.id },
      data: { virtualBalance: JSON.stringify(balanceData) },
    });

    // Update trade record
    await db.trade.updateMany({
      where: { positionId, status: "OPEN" },
      data: {
        status: "CLOSED",
        exitPrice: position.currentPrice,
        exitTime: new Date(),
        closeReason: "MANUAL",
        pnl,
      },
    });

    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";

    return NextResponse.json({
      success: true,
      message: `${pnlEmoji} **Позиция закрыта**\n\n📊 ${position.symbol} ${position.direction}\n💰 PnL: $${pnl.toFixed(2)}\n💵 Возвращено: $${returnAmount.toFixed(2)}`,
      position: {
        id: position.id,
        symbol: position.symbol,
        direction: position.direction,
        entryPrice: position.avgEntryPrice,
        exitPrice: position.currentPrice,
        pnl,
      },
      balance: balanceData,
    });
  } catch (error) {
    console.error("[DemoClose] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
