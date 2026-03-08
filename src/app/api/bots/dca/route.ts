/**
 * DCA Bot API Routes
 * 
 * Endpoints for managing DCA (Dollar Cost Averaging) trading bots.
 * Aligned with Prisma schema.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDefaultUserId } from '@/lib/default-user';

// GET /api/bots/dca - List all DCA bots
export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    const bots = await db.dcaBot.findMany({
      where: { userId },
      include: {
        account: true,
        dcaOrders: {
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
      entryType = 'MARKET',
      entryPrice,
      baseAmount = 100,
      dcaLevels = 5,
      dcaPercent = 5,
      dcaMultiplier = 1.5,
      tpType = 'PERCENT',
      tpValue = 10,
      tpSellBase = false,
      slEnabled = false,
      slType = 'PERCENT',
      slValue,
      leverage = 1,
      marginMode = 'ISOLATED',
      trailingEnabled = false,
      trailingPercent,
    } = body;

    const bot = await db.dcaBot.create({
      data: {
        userId,
        accountId: account.id,
        name: name || `DCA ${symbol}`,
        symbol,
        exchangeId,
        direction,
        entryType,
        entryPrice,
        baseAmount,
        dcaLevels,
        dcaPercent,
        dcaMultiplier,
        tpType,
        tpValue,
        tpSellBase,
        slEnabled,
        slType,
        slValue,
        leverage,
        marginMode,
        trailingEnabled,
        trailingPercent,
        status: 'STOPPED',
        totalInvested: 0,
        totalAmount: 0,
        currentLevel: 0,
        realizedPnL: 0,
        totalTrades: 0,
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
