/**
 * Lumibot Live Trading API Route
 * GET /api/lumibot/live - List active strategies
 * POST /api/lumibot/live - Start live trading
 * DELETE /api/lumibot/live?strategy_id=xxx - Stop live trading
 */

import { NextRequest, NextResponse } from 'next/server';
import { lumibotClient } from '@/lib/lumibot/client';
import type { LiveTradingRequest } from '@/lib/lumibot/types';

export async function GET() {
  try {
    const result = await lumibotClient.listActiveStrategies();
    return NextResponse.json(result);
  } catch (error) {
    console.error('List active strategies error:', error);
    
    // Return empty list if service unavailable
    return NextResponse.json({
      active_strategies: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Service unavailable',
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: LiveTradingRequest = await request.json();

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
    const liveRequest: LiveTradingRequest = {
      strategy: body.strategy,
      symbol: body.symbol,
      broker: body.broker || 'ccxt',
      paper_trading: body.paper_trading !== false, // Default to true for safety
      parameters: body.parameters || {},
    };

    const result = await lumibotClient.startLiveTrading(liveRequest);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Start live trading error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start trading' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const strategyId = searchParams.get('strategy_id');

  if (!strategyId) {
    return NextResponse.json(
      { error: 'strategy_id is required' },
      { status: 400 }
    );
  }

  try {
    const result = await lumibotClient.stopLiveTrading(strategyId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Stop live trading error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop trading' },
      { status: 500 }
    );
  }
}
