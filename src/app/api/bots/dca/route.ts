/**
 * DCA Bot API Routes
 * 
 * Endpoints for managing DCA (Dollar Cost Averaging) trading bots.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DCABotEngine } from '@/lib/dca-bot/dca-bot-engine';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';

// GET /api/bots/dca - List all DCA bots
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bots = await db.dCABot.findMany({
      where: { userId: session.user.id },
      include: {
        positions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return NextResponse.json({ bots });
  } catch (error) {
    console.error('Error fetching DCA bots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch DCA bots' },
      { status: 500 }
    );
  }
}

// POST /api/bots/dca - Create new DCA bot
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      symbol,
      exchange,
      accountType,
      baseOrderAmount,
      baseOrderType,
      safetyOrdersEnabled,
      safetyOrdersCount,
      safetyOrderPriceDeviation,
      safetyOrderVolumeScale,
      maxSafetyOrders,
      takeProfitEnabled,
      takeProfitPercent,
      takeProfitType,
      stopLossEnabled,
      stopLossPercent,
      trailingStopEnabled,
      trailingStopActivation,
      trailingStopDistance,
      averagingEnabled,
      averagingThreshold,
      averagingScale,
      leverage,
      maxDrawdown,
      maxDailyLoss,
      maxOpenTime,
    } = body;

    const bot = await db.dCABot.create({
      data: {
        userId: session.user.id,
        name,
        symbol,
        exchange,
        accountType: accountType || 'DEMO',
        baseOrderAmount,
        baseOrderType: baseOrderType || 'fixed',
        safetyOrdersEnabled: safetyOrdersEnabled ?? true,
        safetyOrdersCount: safetyOrdersCount || 5,
        safetyOrderPriceDeviation: safetyOrderPriceDeviation || 2,
        safetyOrderVolumeScale: safetyOrderVolumeScale || 1.5,
        maxSafetyOrders: maxSafetyOrders || 5,
        takeProfitEnabled: takeProfitEnabled ?? true,
        takeProfitPercent: takeProfitPercent || 3,
        takeProfitType: takeProfitType || 'total',
        stopLossEnabled: stopLossEnabled ?? true,
        stopLossPercent: stopLossPercent || 10,
        trailingStopEnabled: trailingStopEnabled || false,
        trailingStopActivation: trailingStopActivation || 5,
        trailingStopDistance: trailingStopDistance || 2,
        averagingEnabled: averagingEnabled || false,
        averagingThreshold: averagingThreshold || 5,
        averagingScale: averagingScale || 1,
        leverage: leverage || 1,
        maxDrawdown: maxDrawdown || 20,
        maxDailyLoss: maxDailyLoss || 5,
        maxOpenTime: maxOpenTime || 24,
        status: 'IDLE',
        totalTrades: 0,
        totalPnl: 0,
      },
    });

    return NextResponse.json({ bot }, { status: 201 });
  } catch (error) {
    console.error('Error creating DCA bot:', error);
    return NextResponse.json(
      { error: 'Failed to create DCA bot' },
      { status: 500 }
    );
  }
}
