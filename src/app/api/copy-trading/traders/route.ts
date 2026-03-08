import { NextRequest, NextResponse } from 'next/server';
import { getExchangeClient } from '@/lib/exchange';
import { db } from '@/lib/db';
import { ExchangeId } from '@/lib/exchange/types';

/**
 * GET /api/copy-trading/traders
 * Get list of copy traders for a specific exchange
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const exchange = searchParams.get('exchange') as ExchangeId;
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'roi';

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
    
    // Get trader list
    const traders = await copyTrading.getCopyTraderList(limit, sortBy);

    return NextResponse.json({
      success: true,
      data: traders,
      exchange,
      apiSupport: {
        publicApi: exchange === 'okx' || exchange === 'bitget',
        subscribe: exchange === 'okx' || exchange === 'bitget',
        manageFollowers: exchange === 'okx' || exchange === 'bitget',
      },
    });
  } catch (error) {
    console.error('[Copy Trading API] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get traders',
        success: false 
      },
      { status: 500 }
    );
  }
}
