/**
 * Risk Metrics API
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const positions = await db.position.findMany({
      where: { status: 'OPEN' },
      include: { account: { where: { userId: session.user.id } } }
    });

    let totalExposure = 0, totalPnL = 0, maxLeverage = 1;
    const positionRisks = positions.map(pos => {
      const exposure = pos.totalAmount * pos.avgEntryPrice;
      totalExposure += exposure;
      totalPnL += pos.unrealizedPnl;
      if (pos.leverage > maxLeverage) maxLeverage = pos.leverage;
      return {
        symbol: pos.symbol, side: pos.direction, size: pos.totalAmount,
        entryPrice: pos.avgEntryPrice, currentPrice: pos.currentPrice || pos.avgEntryPrice,
        pnl: pos.unrealizedPnl, pnlPercent: pos.avgEntryPrice > 0 ? (pos.unrealizedPnl / (pos.totalAmount * pos.avgEntryPrice)) * 100 : 0,
        leverage: pos.leverage, liquidationPrice: null,
      };
    });

    const metrics = {
      totalExposure, maxExposure: 100000, currentDrawdown: 0, maxDrawdown: 20,
      leverage: maxLeverage, maxLeverage: 10, openPositions: positions.length,
      maxPositions: 10, dailyPnL: totalPnL, dailyLossLimit: 5,
    };

    const alerts = [];
    if (metrics.currentDrawdown > metrics.maxDrawdown * 0.7) {
      alerts.push({ id: 'drawdown-warning', type: 'warning', message: `Drawdown at ${metrics.currentDrawdown.toFixed(1)}%`, timestamp: new Date() });
    }

    return NextResponse.json({ metrics, alerts, positions: positionRisks });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch risk metrics' }, { status: 500 });
  }
}
