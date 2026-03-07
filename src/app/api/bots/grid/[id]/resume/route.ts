/**
 * Grid Bot Resume API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';

// POST /api/bots/grid/[id]/resume - Resume bot
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

    const botEngine = (global as any).gridBots?.get(id);
    
    if (!botEngine) {
      return NextResponse.json({ error: 'Bot not running' }, { status: 400 });
    }

    await botEngine.resume();
    
    await db.gridBot.update({
      where: { id },
      data: { status: 'RUNNING' },
    });

    return NextResponse.json({ status: 'resumed' });
  } catch (error) {
    console.error('Error resuming grid bot:', error);
    return NextResponse.json(
      { error: 'Failed to resume grid bot' },
      { status: 500 }
    );
  }
}
