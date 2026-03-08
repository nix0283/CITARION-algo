/**
 * DCA Bot Instance API Routes
 * Aligned with Prisma schema.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDefaultUserId } from '@/lib/default-user';

// Bot instances storage (in memory for demo)
const botInstances = new Map<string, any>();

// GET /api/bots/dca/[id] - Get bot status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();

    const bot = await db.dcaBot.findFirst({
      where: { id, userId },
      include: {
        account: true,
        dcaOrders: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const engine = botInstances.get(id);
    const runtimeState = engine ? { running: true, ...engine } : null;
    const metrics = engine ? { totalInvested: bot.totalInvested, totalTrades: bot.totalTrades } : null;

    return NextResponse.json({
      bot,
      runtimeState,
      metrics,
    });
  } catch (error) {
    console.error('Error fetching DCA bot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch DCA bot' },
      { status: 500 }
    );
  }
}

// POST /api/bots/dca/[id] - Start/Stop bot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();
    const body = await request.json();
    const action = body.action || 'start';

    const bot = await db.dcaBot.findFirst({
      where: { id, userId },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    if (action === 'start') {
      if (botInstances.has(id)) {
        return NextResponse.json({ error: 'Bot already running' }, { status: 400 });
      }

      botInstances.set(id, {
        startTime: Date.now(),
        config: bot,
      });
      
      await db.dcaBot.update({
        where: { id },
        data: { 
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      return NextResponse.json({ status: 'started', botId: id });
    } else if (action === 'stop') {
      botInstances.delete(id);
      
      await db.dcaBot.update({
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
    console.error('Error managing DCA bot:', error);
    return NextResponse.json(
      { error: 'Failed to manage DCA bot' },
      { status: 500 }
    );
  }
}

// DELETE /api/bots/dca/[id] - Delete bot
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();

    botInstances.delete(id);

    // Delete related orders first
    await db.dcaOrder.deleteMany({
      where: { dcaBotId: id },
    });

    await db.dcaBot.delete({
      where: { id, userId },
    });

    return NextResponse.json({ status: 'deleted' });
  } catch (error) {
    console.error('Error deleting DCA bot:', error);
    return NextResponse.json(
      { error: 'Failed to delete DCA bot' },
      { status: 500 }
    );
  }
}
