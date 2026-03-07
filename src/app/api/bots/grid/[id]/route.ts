/**
 * Grid Bot Instance API Routes
 * 
 * Start, stop, pause, resume operations for a specific bot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GridBotEngine } from '@/lib/grid-bot/grid-bot-engine';
import { GridBotExchangeAdapter } from '@/lib/grid-bot/exchange-adapter';
import { GridBotPaperAdapter } from '@/lib/grid-bot/paper-adapter';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';

// Bot instances storage
const botInstances = new Map<string, GridBotEngine>();

// GET /api/bots/grid/[id] - Get bot status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bot = await db.gridBot.findFirst({
      where: { id, userId: session.user.id },
      include: {
        trades: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Get runtime state if bot is running
    const engine = botInstances.get(id);
    const runtimeState = engine ? engine.getState() : null;
    const metrics = engine ? engine.getMetrics() : null;

    return NextResponse.json({
      bot,
      runtimeState,
      metrics,
    });
  } catch (error) {
    console.error('Error fetching grid bot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grid bot' },
      { status: 500 }
    );
  }
}

// POST /api/bots/grid/[id]/start - Start bot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bot = await db.gridBot.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Check if already running
    if (botInstances.has(id)) {
      return NextResponse.json({ error: 'Bot already running' }, { status: 400 });
    }

    // Create adapter based on account type
    const adapter = bot.accountType === 'DEMO'
      ? new GridBotPaperAdapter({ symbol: bot.symbol })
      : new GridBotExchangeAdapter({
          exchange: bot.exchange,
          symbol: bot.symbol,
          apiKey: '',
          apiSecret: '',
        });

    // Create engine
    const engine = new GridBotEngine({
      id: bot.id,
      symbol: bot.symbol,
      exchange: bot.exchange,
      accountType: bot.accountType as 'DEMO' | 'REAL',
      gridLevels: bot.gridLevels,
      upperPrice: bot.upperPrice,
      lowerPrice: bot.lowerPrice,
      gridType: bot.gridType as 'arithmetic' | 'geometric' | 'adaptive',
      positionSize: bot.positionSize,
      positionSizeType: bot.positionSizeType as 'fixed' | 'percent',
      leverage: bot.leverage,
      trailingEnabled: bot.trailingEnabled,
      trailingActivationPercent: bot.trailingActivationPercent,
      trailingDistancePercent: bot.trailingDistancePercent,
      maxDrawdown: bot.maxDrawdown,
      stopLossPercent: bot.stopLossPercent || undefined,
      takeProfitPercent: bot.takeProfitPercent || undefined,
    }, adapter);

    const result = await engine.start();

    if (result.success) {
      botInstances.set(id, engine);
      
      await db.gridBot.update({
        where: { id },
        data: { status: 'RUNNING' },
      });

      return NextResponse.json({ status: 'started', botId: id });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to start bot' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error starting grid bot:', error);
    return NextResponse.json(
      { error: 'Failed to start grid bot' },
      { status: 500 }
    );
  }
}

// DELETE /api/bots/grid/[id] - Stop and delete bot
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const engine = botInstances.get(id);
    if (engine) {
      await engine.stop(true);
      botInstances.delete(id);
    }

    await db.gridBot.delete({
      where: { id, userId: session.user.id },
    });

    return NextResponse.json({ status: 'deleted' });
  } catch (error) {
    console.error('Error deleting grid bot:', error);
    return NextResponse.json(
      { error: 'Failed to delete grid bot' },
      { status: 500 }
    );
  }
}
