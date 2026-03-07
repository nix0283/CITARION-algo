import { NextRequest, NextResponse } from 'next/server';
import { getExchangeClient } from '@/lib/exchange';
import { db } from '@/lib/db';
import { ExchangeId } from '@/lib/exchange/types';

/**
 * POST /api/copy-trading/subscribe
 * Subscribe to copy a trader
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      exchange, 
      traderId, 
      copyMode, 
      amount,
      maxAmountPerTrade 
    } = body as {
      exchange: ExchangeId;
      traderId: string;
      copyMode: 'fixed' | 'ratio' | 'percentage';
      amount: number;
      maxAmountPerTrade?: number;
    };

    if (!exchange || !traderId || !copyMode || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: exchange, traderId, copyMode, amount' },
        { status: 400 }
      );
    }

    // Check if exchange supports API subscription
    const supportedExchanges: ExchangeId[] = ['okx', 'bitget'];
    if (!supportedExchanges.includes(exchange)) {
      return NextResponse.json(
        { 
          error: `${exchange} does not support API-based subscription. Use the exchange's web UI.`,
          errorCode: 'NOT_SUPPORTED',
          success: false 
        },
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
    
    // Subscribe to trader
    const result = await copyTrading.copyTraderSubscribe({
      traderId,
      copyMode,
      amount,
      maxAmountPerTrade,
    });

    if (result.success) {
      // Save subscription to database
      await db.copyTradingSubscription.create({
        data: {
          userId: connection.userId,
          exchange: exchange,
          traderId: traderId,
          copyMode: copyMode,
          fixedAmount: copyMode === 'fixed' ? amount : undefined,
          ratio: copyMode === 'ratio' ? amount : undefined,
          percentage: copyMode === 'percentage' ? amount : undefined,
          maxAmountPerTrade,
          active: true,
        },
      }).catch(() => {
        // Ignore if table doesn't exist or other db errors
        // The subscription is already made on the exchange
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Copy Trading Subscribe API] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to subscribe',
        success: false 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/copy-trading/subscribe
 * Unsubscribe from a trader
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const exchange = searchParams.get('exchange') as ExchangeId;
    const traderId = searchParams.get('traderId');

    if (!exchange || !traderId) {
      return NextResponse.json(
        { error: 'Missing required parameters: exchange, traderId' },
        { status: 400 }
      );
    }

    // Check if exchange supports API subscription
    const supportedExchanges: ExchangeId[] = ['okx', 'bitget'];
    if (!supportedExchanges.includes(exchange)) {
      return NextResponse.json(
        { 
          error: `${exchange} does not support API-based unsubscription. Use the exchange's web UI.`,
          errorCode: 'NOT_SUPPORTED',
          success: false 
        },
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
    
    // Unsubscribe from trader
    const result = await copyTrading.copyTraderUnsubscribe(traderId);

    if (result.success) {
      // Update subscription in database
      await db.copyTradingSubscription.updateMany({
        where: {
          userId: connection.userId,
          exchange: exchange,
          traderId: traderId,
        },
        data: {
          active: false,
        },
      }).catch(() => {
        // Ignore if table doesn't exist or other db errors
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Copy Trading Unsubscribe API] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to unsubscribe',
        success: false 
      },
      { status: 500 }
    );
  }
}
