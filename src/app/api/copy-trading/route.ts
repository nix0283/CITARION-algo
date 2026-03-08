import { NextRequest, NextResponse } from 'next/server';
import { getExchangeClient } from '@/lib/exchange';
import { db } from '@/lib/db';
import { ExchangeId } from '@/lib/exchange/types';

/**
 * GET /api/copy-trading
 * Get copy trading status and settings for all exchanges
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const exchange = searchParams.get('exchange') as ExchangeId | null;

    // Get all active exchange connections
    const connections = await db.exchangeConnection.findMany({
      where: {
        isActive: true,
        ...(exchange && { exchange }),
      },
    });

    const results = [];

    for (const connection of connections) {
      try {
        const client = await getExchangeClient(connection.exchange as ExchangeId, {
          apiKey: connection.apiKey,
          apiSecret: connection.apiSecret,
          passphrase: connection.passphrase || undefined,
        });

        const copyTrading = client.getCopyTrading();
        const status = await copyTrading.getLeadTraderStatus();

        // Get subscriptions
        const subscriptions = await db.copyTradingSubscription.findMany({
          where: {
            userId: connection.userId,
            exchange: connection.exchange as ExchangeId,
            active: true,
          },
        }).catch(() => []);

        results.push({
          exchange: connection.exchange,
          isLeadTrader: status.isLeadTrader,
          followersCount: status.followersCount,
          subscriptions: subscriptions.length,
          apiSupport: {
            publicApi: connection.exchange === 'okx' || connection.exchange === 'bitget',
            subscribe: connection.exchange === 'okx' || connection.exchange === 'bitget',
            manageFollowers: connection.exchange === 'okx' || connection.exchange === 'bitget',
          },
        });
      } catch (error) {
        results.push({
          exchange: connection.exchange,
          error: error instanceof Error ? error.message : 'Failed to get status',
          apiSupport: {
            publicApi: connection.exchange === 'okx' || connection.exchange === 'bitget',
            subscribe: connection.exchange === 'okx' || connection.exchange === 'bitget',
            manageFollowers: connection.exchange === 'okx' || connection.exchange === 'bitget',
          },
        });
      }
    }

    // API Support summary
    const apiSupport = {
      okx: { publicApi: true, subscribe: true, manageFollowers: true, docs: 'https://www.okx.com/docs-v5/en/#copy-trading-rest-api' },
      bitget: { publicApi: true, subscribe: true, manageFollowers: true, docs: 'https://bitgetlimited.github.io/apidoc/en/copyTrade' },
      binance: { publicApi: false, subscribe: false, manageFollowers: false, docs: 'https://developers.binance.com/docs/copy_trading/future-copy-trading' },
      bybit: { publicApi: false, subscribe: false, manageFollowers: false, docs: 'https://bybit-exchange.github.io/docs/v5/copytrade' },
      bingx: { publicApi: false, subscribe: false, manageFollowers: false, docs: 'https://bingx-api.github.io/docs/' },
    };

    return NextResponse.json({
      success: true,
      data: results,
      apiSupport,
      totalConnections: connections.length,
      activeSubscriptions: results.reduce((acc, r) => acc + (r.subscriptions || 0), 0),
    });
  } catch (error) {
    console.error('[Copy Trading API] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get copy trading status',
        success: false 
      },
      { status: 500 }
    );
  }
}
