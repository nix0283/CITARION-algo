import { NextRequest, NextResponse } from 'next/server';
import { getExchangeClient } from '@/lib/exchange';
import { db } from '@/lib/db';
import { ExchangeId } from '@/lib/exchange/types';

/**
 * GET /api/master-trader
 * Get Master Trader status and data for a specific exchange
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const exchange = searchParams.get('exchange') as ExchangeId | null;

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
      return NextResponse.json({
        success: true,
        data: {
          exchange,
          isConnected: false,
          isLeadTrader: false,
          apiSupport: getApiSupport(exchange),
        },
      });
    }

    // Get exchange client
    const client = await getExchangeClient(exchange, {
      apiKey: connection.apiKey,
      apiSecret: connection.apiSecret,
      passphrase: connection.passphrase || undefined,
    });

    // Get status
    const status = await client.getLeadTraderStatus();
    
    // Get settings
    const settings = await client.getMasterTraderSettings();

    // Get followers if master trader
    let followers: unknown[] = [];
    let positions: unknown[] = [];
    let profitSummary: unknown[] = [];

    if (status.isLeadTrader) {
      followers = await client.getMasterFollowers(50);
      positions = await client.getMasterPositions();
    }

    return NextResponse.json({
      success: true,
      data: {
        exchange,
        isConnected: true,
        isLeadTrader: status.isLeadTrader,
        active: status.active,
        since: status.since,
        followersCount: status.followersCount || 0,
        settings,
        followers,
        positions,
        profitSummary,
        apiSupport: getApiSupport(exchange),
      },
    });
  } catch (error) {
    console.error('[Master Trader API] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to get master trader status',
        success: false 
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/master-trader
 * Apply as Master Trader or update settings
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { exchange, action, ...params } = body;

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

    switch (action) {
      case 'apply': {
        const result = await client.applyAsMasterTrader({
          profitSharePercent: params.profitSharePercent || 10,
          nickname: params.nickname,
          minCopyAmount: params.minCopyAmount,
        });
        return NextResponse.json({ success: result.success, data: result.data, error: result.error });
      }

      case 'updateSettings': {
        const result = await client.updateMasterTraderSettings(params);
        return NextResponse.json({ success: result.success, data: result.data, error: result.error });
      }

      case 'removeFollower': {
        const result = await client.removeMasterFollower(params.followerId);
        return NextResponse.json({ success: result.success, data: result.data, error: result.error });
      }

      case 'closePosition': {
        const result = await client.copyClosePosition(params);
        return NextResponse.json({ success: result.success, data: result.data, error: result.error });
      }

      case 'modifyTpsl': {
        const result = await client.copyModifyTpsl(params);
        return NextResponse.json({ success: result.success, data: result.data, error: result.error });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Master Trader API] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process request',
        success: false 
      },
      { status: 500 }
    );
  }
}

/**
 * Get API support info for each exchange
 */
function getApiSupport(exchange: string) {
  const support: Record<string, {
    full: boolean;
    apply: boolean;
    followers: boolean;
    profitSharing: boolean;
    closePosition: boolean;
    modifyTpsl: boolean;
    docs: string;
  }> = {
    okx: { 
      full: true, 
      apply: true, 
      followers: true, 
      profitSharing: true,
      closePosition: true,
      modifyTpsl: true,
      docs: 'https://www.okx.com/docs-v5/en/#copy-trading-rest-api'
    },
    bitget: { 
      full: true, 
      apply: false, // Through UI
      followers: true, 
      profitSharing: true,
      closePosition: true,
      modifyTpsl: true,
      docs: 'https://bitgetlimited.github.io/apidoc/en/copyTrade'
    },
    binance: { 
      full: false, 
      apply: false, 
      followers: false, 
      profitSharing: false,
      closePosition: false,
      modifyTpsl: false,
      docs: 'https://developers.binance.com/docs/copy_trading/future-copy-trading'
    },
    bybit: { 
      full: false, 
      apply: false, 
      followers: false, 
      profitSharing: false,
      closePosition: false,
      modifyTpsl: false,
      docs: 'https://bybit-exchange.github.io/docs/v5/copytrade'
    },
    bingx: { 
      full: false, 
      apply: false, 
      followers: false, 
      profitSharing: false,
      closePosition: false,
      modifyTpsl: false,
      docs: 'https://bingx-api.github.io/docs/'
    },
  };

  return support[exchange] || support.binance;
}
