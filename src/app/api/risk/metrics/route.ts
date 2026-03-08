/**
 * Risk Metrics API
 * Provides risk metrics for the trading platform.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDefaultUserId } from '@/lib/default-user';

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    // Get user's accounts first
    const accounts = await db.account.findMany({
      where: { userId },
      select: { id: true },
    });
    const accountIds = accounts.map(a => a.id);

    // Get open positions for user's accounts
    const positions = await db.position.findMany({
      where: { 
        status: 'OPEN',
        accountId: { in: accountIds },
      },
      include: { account: true },
    });

    let totalExposure = 0, totalPnL = 0, maxLeverage = 1;
    const positionRisks = positions.map(pos => {
      const exposure = pos.totalAmount * pos.avgEntryPrice;
      totalExposure += exposure;
      totalPnL += pos.unrealizedPnl;
      if (pos.leverage > maxLeverage) maxLeverage = pos.leverage;
      return {
        symbol: pos.symbol, 
        side: pos.direction, 
        size: pos.totalAmount,
        entryPrice: pos.avgEntryPrice, 
        currentPrice: pos.currentPrice || pos.avgEntryPrice,
        pnl: pos.unrealizedPnl, 
        pnlPercent: pos.avgEntryPrice > 0 ? (pos.unrealizedPnl / (pos.totalAmount * pos.avgEntryPrice)) * 100 : 0,
        leverage: pos.leverage, 
        liquidationPrice: null,
        exchange: pos.account?.exchangeName || 'unknown',
      };
    });

    // Calculate drawdown
    const balance = 100000; // Default balance
    const currentDrawdown = totalPnL < 0 ? (Math.abs(totalPnL) / balance) * 100 : 0;

    const metrics = {
      totalExposure, 
      maxExposure: 100000, 
      currentDrawdown, 
      maxDrawdown: 20,
      leverage: maxLeverage, 
      maxLeverage: 10, 
      openPositions: positions.length,
      maxPositions: 10, 
      dailyPnL: totalPnL, 
      dailyLossLimit: 5,
      balance,
      equity: balance + totalPnL,
    };

    const alerts = [];
    if (metrics.currentDrawdown > metrics.maxDrawdown * 0.7) {
      alerts.push({ 
        id: 'drawdown-warning', 
        type: 'warning', 
        message: `Drawdown at ${metrics.currentDrawdown.toFixed(1)}%`, 
        timestamp: new Date() 
      });
    }
    if (maxLeverage > 5) {
      alerts.push({
        id: 'high-leverage',
        type: 'warning',
        message: `High leverage detected: ${maxLeverage}x`,
        timestamp: new Date(),
      });
    }

    return NextResponse.json({ metrics, alerts, positions: positionRisks });
  } catch (error) {
    console.error('Error fetching risk metrics:', error);
    return NextResponse.json({ 
      metrics: {
        totalExposure: 0,
        maxExposure: 100000,
        currentDrawdown: 0,
        maxDrawdown: 20,
        leverage: 1,
        maxLeverage: 10,
        openPositions: 0,
        maxPositions: 10,
        dailyPnL: 0,
        dailyLossLimit: 5,
        balance: 100000,
        equity: 100000,
      },
      alerts: [],
      positions: [],
    });
  }
}
