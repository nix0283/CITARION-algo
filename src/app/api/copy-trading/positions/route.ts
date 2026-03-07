import { NextRequest, NextResponse } from 'next/server';
import { getExchangeClient } from '@/lib/exchange';
import { db } from '@/lib/db';
import { ExchangeId } from '@/lib/exchange/types';

/**
 * GET /api/copy-trading/positions
 * Get current positions of copy traders
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const exchange = searchParams.get('exchange') as ExchangeId;
    const traderId = searchParams.get('traderId');

    if (!exchange) {
      return NextResponse.json(
        { error: 'Exchange parameter is required' },
        { status: 400 }
      );
    }

    // Get user's exchange connection
    const connection = await db.exchangeConnection.findFirst({
      where: {
        exchange: exchange,
        isActive: true,
      },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'No active connection for this exchange' },
        { status: 404 }
      );
    }

    // Get exchange client
    const client = await getExchangeClient(exchange, {
      apiKey: connection.apiKey,
      apiSecret: connection.apiSecret,
      passphrase: connection.passphrase || undefined,
    });

    // Get copy trading instance
    const copyTrading = client.getCopyTrading();
    
    // Get positions
    let positions;
    if (traderId) {
      // Get positions for specific trader
      positions = await copyTrading.getCopyTraderPositions(traderId);
    } else {
      // Get all subscribed traders' positions
      const subscriptions = await db.copyTradingSubscription.findMany({
        where: {
          userId: connection.userId,
          exchange: exchange,
          active: true,
        },
      }).catch(() => []);

      positions = [];
      for (const sub of subscriptions) {
        try {
          const traderPositions = await copyTrading.getCopyTraderPositions(sub.traderId);
          positions.push(...traderPositions);
        } catch {
          // Continue if one trader fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: positions,
      exchange,
      count: positions.length,
    });
  } catch (error) {
    console.error('[Copy Trading Positions API] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get positions',
        success: false 
      },
      { status: 500 }
    );
  }
}
