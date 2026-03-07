/**
 * Exchange Connection Test API
 * Test connection to exchanges without executing trades
 */

import { NextRequest, NextResponse } from 'next/server';
import { testConnection, getBalances, getTicker } from '@/lib/auto-trading/exchange-order';

/**
 * POST /api/test-exchange
 * Test exchange connection
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { exchangeId, mode, marketType, apiKey, apiSecret, passphrase, testType } = body;

    if (!exchangeId || !mode) {
      return NextResponse.json(
        { success: false, error: 'Missing exchangeId or mode' },
        { status: 400 }
      );
    }

    // Validate required credentials for non-paper modes
    if (mode !== 'PAPER' && (!apiKey || !apiSecret)) {
      return NextResponse.json(
        { success: false, error: 'API key and secret required for non-paper trading' },
        { status: 400 }
      );
    }

    const config = {
      exchangeId,
      mode,
      marketType: marketType || 'futures',
      apiKey,
      apiSecret,
      passphrase,
    };

    const results: Record<string, any> = {};

    // Run tests based on testType
    switch (testType) {
      case 'connection':
        results.connection = await testConnection(config);
        break;

      case 'balances':
        results.connection = await testConnection(config);
        results.balances = await getBalances(config);
        break;

      case 'ticker':
        const symbol = body.symbol || 'BTCUSDT';
        results.ticker = await getTicker(config, symbol);
        break;

      case 'full':
      default:
        results.connection = await testConnection(config);
        if (results.connection.success) {
          results.balances = await getBalances(config);
        }
        break;
    }

    // Determine overall success
    const success = Object.values(results).every((r: any) => r?.success !== false);

    return NextResponse.json({
      success,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Exchange test API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/test-exchange
 * Get supported exchanges and their testnet/demo availability
 */
export async function GET() {
  return NextResponse.json({
    exchanges: [
      {
        id: 'binance',
        name: 'Binance',
        hasTestnet: true,
        hasDemo: false,
        supportedMarkets: ['spot', 'futures'],
        testnetUrl: 'https://testnet.binancefuture.com',
        liveUrl: 'https://fapi.binance.com',
      },
      {
        id: 'bybit',
        name: 'Bybit',
        hasTestnet: true,
        hasDemo: false,
        supportedMarkets: ['spot', 'futures'],
        testnetUrl: 'https://api-testnet.bybit.com',
        liveUrl: 'https://api.bybit.com',
      },
      {
        id: 'okx',
        name: 'OKX',
        hasTestnet: false,
        hasDemo: true,
        supportedMarkets: ['spot', 'futures'],
        demoUrl: 'https://www.okx.com',
        liveUrl: 'https://www.okx.com',
        requiresPassphrase: true,
      },
    ],
    modes: [
      { id: 'PAPER', name: 'Paper Trading', description: 'Simulated trading, no real orders' },
      { id: 'TESTNET', name: 'Testnet', description: 'Exchange testnet (requires testnet API keys)' },
      { id: 'DEMO', name: 'Demo', description: 'Exchange demo mode (OKX)' },
      { id: 'LIVE', name: 'Live Trading', description: 'Real trading with real funds' },
    ],
  });
}
