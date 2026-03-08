import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Fetch signals with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const botId = searchParams.get('botId');
    const type = searchParams.get('type');
    const timeframe = searchParams.get('timeframe');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: Record<string, unknown> = {};
    
    if (botId) {
      where.bbBotId = botId;
    }
    
    if (type && type !== 'ALL') {
      where.type = type;
    }
    
    if (timeframe && timeframe !== 'ALL') {
      where.timeframe = timeframe;
    }
    
    if (dateFrom || dateTo) {
      where.timestamp = {};
      if (dateFrom) {
        (where.timestamp as Record<string, unknown>).gte = new Date(dateFrom);
      }
      if (dateTo) {
        (where.timestamp as Record<string, unknown>).lte = new Date(dateTo);
      }
    }

    const signals = await db.bBSignal.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const total = await db.bBSignal.count({ where });

    return NextResponse.json({
      success: true,
      signals,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + signals.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching BB signals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}

// POST - Create a new signal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      bbBotId,
      symbol,
      timeframe,
      type,
      price,
      timestamp,
      bbUpper,
      bbLower,
      bbMiddle,
      stochK,
      stochD,
      reason,
      executed,
      positionId,
    } = body;

    // Validate required fields
    if (!bbBotId || !symbol || !timeframe || !type || price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const signal = await db.bBSignal.create({
      data: {
        bbBotId,
        symbol,
        timeframe,
        type,
        price,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        bbUpper: bbUpper || 0,
        bbLower: bbLower || 0,
        bbMiddle: bbMiddle || 0,
        stochK: stochK || 0,
        stochD: stochD || 0,
        reason,
        executed: executed || false,
        positionId,
      },
    });

    return NextResponse.json({
      success: true,
      signal,
    });
  } catch (error) {
    console.error('Error creating BB signal:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create signal' },
      { status: 500 }
    );
  }
}

// DELETE - Delete signals (by botId or older than date)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('botId');
    const olderThan = searchParams.get('olderThan');
    const signalId = searchParams.get('signalId');

    if (signalId) {
      // Delete single signal
      await db.bBSignal.delete({
        where: { id: signalId },
      });
    } else if (botId) {
      // Delete all signals for a bot
      await db.bBSignal.deleteMany({
        where: { bbBotId: botId },
      });
    } else if (olderThan) {
      // Delete signals older than date
      await db.bBSignal.deleteMany({
        where: {
          timestamp: {
            lt: new Date(olderThan),
          },
        },
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Missing deletion criteria' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting BB signals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete signals' },
      { status: 500 }
    );
  }
}

// PATCH - Update signal (mark as executed)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { signalId, executed, positionId } = body;

    if (!signalId) {
      return NextResponse.json(
        { success: false, error: 'Missing signal ID' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (executed !== undefined) {
      updateData.executed = executed;
    }
    if (positionId !== undefined) {
      updateData.positionId = positionId;
    }

    const signal = await db.bBSignal.update({
      where: { id: signalId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      signal,
    });
  } catch (error) {
    console.error('Error updating BB signal:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update signal' },
      { status: 500 }
    );
  }
}
