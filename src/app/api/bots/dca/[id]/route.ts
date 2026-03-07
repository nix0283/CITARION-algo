/**
 * DCA Bot Instance API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { DCABotEngine } from '@/lib/dca-bot/dca-bot-engine';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';

// Bot instances storage
const botInstances = new Map<string, DCABotEngine>();

// GET /api/bots/dca/[id] - Get bot status
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

    const bot = await db.dCABot.findFirst({
      where: { id, userId: session.user.id },
      include: {
        positions: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const engine = botInstances.get(id);
    const runtimeState = engine ? engine.getState() : null;
    const metrics = engine ? engine.getMetrics() : null;

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

// DELETE /api/bots/dca/[id] - Delete bot
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

    await db.dCABot.delete({
      where: { id, userId: session.user.id },
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
