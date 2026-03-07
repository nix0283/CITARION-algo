/**
 * Lumibot Backtest API Route
 * POST /api/lumibot/backtest - Run backtest
 * POST /api/lumibot/backtest?simulate=true - Simulate backtest
 */

import { NextRequest, NextResponse } from 'next/server';
import { lumibotClient } from '@/lib/lumibot/client';
import type { BacktestRequest } from '@/lib/lumibot/types';

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const simulate = searchParams.get('simulate') === 'true';

  try {
    const body: BacktestRequest = await request.json();

    // Validate request
    if (!body.strategy) {
      return NextResponse.json(
        { error: 'Strategy name is required' },
        { status: 400 }
      );
    }

    if (!body.symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    // Set defaults
    const backtestRequest: BacktestRequest = {
      strategy: body.strategy,
      symbol: body.symbol,
      start_date: body.start_date || '2023-01-01',
      end_date: body.end_date || new Date().toISOString().split('T')[0],
      initial_cash: body.initial_cash || 100000,
      parameters: body.parameters || {},
    };

    let result;
    if (simulate) {
      // Use simulated backtest (for demo/testing)
      result = await lumibotClient.simulateBacktest(backtestRequest);
    } else {
      // Try real backtest
      try {
        result = await lumibotClient.runBacktest(backtestRequest);
      } catch {
        // Fallback to simulation if real backtest fails
        console.log('Falling back to simulated backtest');
        result = await lumibotClient.simulateBacktest(backtestRequest);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Backtest error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backtest failed' },
      { status: 500 }
    );
  }
}
