/**
 * Grid Bot API Routes
 * 
 * Endpoints for managing grid trading bots.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GridBotEngine } from '@/lib/grid-bot/grid-bot-engine';
import { GridBotExchangeAdapter } from '@/lib/grid-bot/exchange-adapter';
import { GridBotPaperAdapter } from '@/lib/grid-bot/paper-adapter';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';

// Bot instances storage (in production, use Redis or similar)
const botInstances = new Map<string, GridBotEngine>();

// GET /api/bots/grid - List all grid bots
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bots = await db.gridBot.findMany({
      where: { userId: session.user.id },
      include: {
        trades: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Add runtime status
    const botsWithStatus = bots.map(bot => ({
      ...bot,
      runtimeStatus: botInstances.has(bot.id) ? 'running' : 'stopped',
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
      gridLevels,
      upperPrice,
      lowerPrice,
      gridType,
      positionSize,
      positionSizeType,
      leverage,
      trailingEnabled,
      trailingActivationPercent,
      trailingDistancePercent,
      maxDrawdown,
      stopLossPercent,
      takeProfitPercent,
    } = body;

    // Create bot in database
    const bot = await db.gridBot.create({
      data: {
        userId: session.user.id,
        name,
        symbol,
        exchange,
        accountType: accountType || 'DEMO',
        gridLevels,
        upperPrice,
        lowerPrice,
        gridType: gridType || 'arithmetic',
        positionSize,
        positionSizeType: positionSizeType || 'fixed',
        leverage: leverage || 1,
        trailingEnabled: trailingEnabled || false,
        trailingActivationPercent: trailingActivationPercent || 5,
        trailingDistancePercent: trailingDistancePercent || 2,
        maxDrawdown: maxDrawdown || 20,
        stopLossPercent,
        takeProfitPercent,
        status: 'IDLE',
        totalTrades: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
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
