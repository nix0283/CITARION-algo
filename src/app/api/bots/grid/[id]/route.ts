/**
 * Grid Bot Instance API Routes
 * 
 * Start, stop, pause, resume operations for a specific bot.
 * Aligned with Prisma schema.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDefaultUserId } from '@/lib/default-user';

// Bot instances storage (in memory for demo)
const botInstances = new Map<string, any>();

// GET /api/bots/grid/[id] - Get bot status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();

    const bot = await db.gridBot.findFirst({
      where: { id, userId },
      include: {
        account: true,
        gridOrders: {
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
    const runtimeState = engine ? { running: true } : null;
    const metrics = engine ? { totalProfit: bot.totalProfit, totalTrades: bot.totalTrades } : null;

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

// POST /api/bots/grid/[id] - Start/Stop bot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();
    const body = await request.json();
    const action = body.action || 'start';

    const bot = await db.gridBot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    if (action === 'start') {
      if (botInstances.has(id)) {
        return NextResponse.json({ error: 'Bot already running' }, { status: 400 });
      }

      // Store running instance
      botInstances.set(id, {
        startTime: Date.now(),
        config: bot,
      });
      
      await db.gridBot.update({
        where: { id },
        data: { 
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      return NextResponse.json({ status: 'started', botId: id });
    } else if (action === 'stop') {
      botInstances.delete(id);
      
      await db.gridBot.update({
        where: { id },
        data: { 
          status: 'STOPPED',
          stoppedAt: new Date(),
        },
      });

      return NextResponse.json({ status: 'stopped', botId: id });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error managing grid bot:', error);
    return NextResponse.json(
      { error: 'Failed to manage grid bot' },
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
    const userId = await getDefaultUserId();

    // Stop bot if running
    botInstances.delete(id);

    // Delete related orders first
    await db.gridOrder.deleteMany({
      where: { gridBotId: id },
    });

    // Delete bot
    await db.gridBot.delete({
      where: { id, userId },
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
