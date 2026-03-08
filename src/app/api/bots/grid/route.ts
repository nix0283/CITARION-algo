/**
 * Grid Bot API Routes
 * 
 * Endpoints for managing grid trading bots.
 * Aligned with Prisma schema.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDefaultUserId } from '@/lib/default-user';

// GET /api/bots/grid - List all grid bots
export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    const bots = await db.gridBot.findMany({
      where: { userId },
      include: {
        account: true,
        gridOrders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Add runtime status
    const botsWithStatus = bots.map(bot => ({
      ...bot,
      runtimeStatus: bot.status === 'RUNNING' ? 'running' : 'stopped',
    }));

    return NextResponse.json({ bots: botsWithStatus });
  } catch (error) {
    console.error('Error fetching grid bots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grid bots' },
      { status: 500 }
    );
  }
}

// POST /api/bots/grid - Create new grid bot
export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    
    // Get or create default account
    let account = await db.account.findFirst({
      where: { userId, accountType: 'DEMO' },
    });

    if (!account) {
      account = await db.account.create({
        data: {
          userId,
          accountType: 'DEMO',
          exchangeId: body.exchangeId || 'binance',
          exchangeName: 'Binance',
          virtualBalance: JSON.stringify({ USDT: 10000 }),
        },
      });
    }

    const {
      name,
      symbol,
      exchangeId = 'binance',
      direction = 'LONG',
      gridType = 'ARITHMETIC',
      gridCount = 10,
      upperPrice,
      lowerPrice,
      totalInvestment,
      leverage = 1,
      marginMode = 'ISOLATED',
      takeProfit,
      stopLoss,
      triggerPrice,
      triggerType,
      adaptiveEnabled = false,
      trailingGrid = false,
    } = body;

    // Create bot in database
    const bot = await db.gridBot.create({
      data: {
        userId,
        accountId: account.id,
        name: name || `Grid ${symbol}`,
        symbol,
        exchangeId,
        direction,
        gridType,
        gridCount,
        upperPrice,
        lowerPrice,
        totalInvestment: totalInvestment || 1000,
        leverage,
        marginMode,
        takeProfit,
        stopLoss,
        triggerPrice,
        triggerType,
        adaptiveEnabled,
        trailingGrid,
        status: 'STOPPED',
        totalProfit: 0,
        totalTrades: 0,
        realizedPnL: 0,
      },
    });

    return NextResponse.json({ bot }, { status: 201 });
  } catch (error) {
    console.error('Error creating grid bot:', error);
    return NextResponse.json(
      { error: 'Failed to create grid bot' },
      { status: 500 }
    );
  }
}
