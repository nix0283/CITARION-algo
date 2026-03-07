/**
 * Multi-Exchange OHLCV Sync Cron Job
 *
 * Automatically syncs historical candlestick data for configured symbols.
 * Supports Binance, Bybit, OKX exchanges.
 * 
 * Vercel Cron Configuration:
 * - Every hour: sync 1h, 4h, 1d timeframes (3 days back)
 * - Every 15 minutes: sync 1m, 5m, 15m timeframes (1 day back)
 */

import { NextRequest, NextResponse } from 'next/server';
import { MultiExchangeFetcher, OhlcvService, ExchangeId } from '@/lib/ohlcv-service';

// Popular symbols to sync by default
const DEFAULT_SYMBOLS: Record<ExchangeId, string[]> = {
  binance: [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  ],
  bybit: [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT',
  ],
  okx: [
    'BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT',
  ],
};

// Default timeframes to sync
const DEFAULT_TIMEFRAMES = ['1h', '4h', '1d'];

// Market types to sync
const MARKET_TYPES = ['futures', 'spot'] as const;

/**
 * GET /api/cron/ohlcv-sync
 * Sync OHLCV data for configured symbols
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify cron secret (optional but recommended for production)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: {
      exchange: string;
      symbol: string;
      timeframe: string;
      marketType: string;
      status: 'success' | 'skipped' | 'error';
      message?: string;
      candles?: number;
    }[] = [];

    // Get sync configuration from query params or use defaults
    const { searchParams } = new URL(request.url);
    const exchangesParam = searchParams.get('exchanges');
    const symbolsParam = searchParams.get('symbols');
    const timeframesParam = searchParams.get('timeframes');
    const daysBack = parseInt(searchParams.get('daysBack') || '7');

    // Determine which exchanges to sync
    const exchanges: ExchangeId[] = exchangesParam
      ? (exchangesParam.split(',') as ExchangeId[])
      : ['binance'];

    // Get timeframes
    const timeframes = timeframesParam?.split(',') || DEFAULT_TIMEFRAMES;

    for (const exchange of exchanges) {
      // Get symbols for this exchange
      const symbols = symbolsParam?.split(',') || DEFAULT_SYMBOLS[exchange] || [];

      for (const symbol of symbols) {
        for (const timeframe of timeframes) {
          for (const marketType of MARKET_TYPES) {
            try {
              // Check if we need to sync
              const status = await OhlcvService.getSyncStatus({
                exchange,
                symbol,
                marketType,
                timeframe,
              });

              const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

              if (status?.lastSyncTime && status.lastSyncTime > oneHourAgo && !status.isSyncing) {
                results.push({
                  exchange,
                  symbol,
                  timeframe,
                  marketType,
                  status: 'skipped',
                  message: 'Recently synced',
                });
                continue;
              }

              // Sync recent data
              const result = await MultiExchangeFetcher.syncHistory({
                exchange,
                symbol,
                interval: timeframe,
                marketType,
                daysBack: Math.min(daysBack, 7),
              });

              results.push({
                exchange,
                symbol,
                timeframe,
                marketType,
                status: 'success',
                candles: result.stored,
              });

              // Rate limiting between requests
              await new Promise((r) => setTimeout(r, 200));

            } catch (error) {
              results.push({
                exchange,
                symbol,
                timeframe,
                marketType,
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }
      }
    }

    const summary = {
      total: results.length,
      success: results.filter((r) => r.status === 'success').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    };

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      summary,
      results,
    });

  } catch (error) {
    console.error('OHLCV sync cron error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Cron job failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

/**
 * POST /api/cron/ohlcv-sync
 * Manual trigger for full historical sync
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      exchange = 'binance',
      symbol,
      timeframe = '1h',
      marketType = 'futures',
      daysBack = 30,
    } = body;

    if (!symbol) {
      return NextResponse.json({
        error: 'Symbol is required',
      }, { status: 400 });
    }

    // Start sync
    const result = await MultiExchangeFetcher.syncHistory({
      exchange: exchange as ExchangeId,
      symbol,
      interval: timeframe,
      marketType,
      daysBack,
    });

    return NextResponse.json({
      success: true,
      exchange,
      symbol,
      timeframe,
      marketType,
      daysBack,
      fetched: result.fetched,
      stored: result.stored,
    });

  } catch (error) {
    console.error('OHLCV manual sync error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    }, { status: 500 });
  }
}
