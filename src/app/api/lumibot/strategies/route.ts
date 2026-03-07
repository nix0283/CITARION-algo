/**
 * Lumibot Strategies API Route
 * GET /api/lumibot/strategies - List all strategies
 * GET /api/lumibot/strategies?name=rsi_reversal - Get strategy details
 */

import { NextRequest, NextResponse } from 'next/server';
import { lumibotClient } from '@/lib/lumibot/client';
import { PREDEFINED_STRATEGIES } from '@/lib/lumibot/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');

  try {
    // Try to get strategies from Python service
    if (name) {
      const strategy = await lumibotClient.getStrategy(name);
      return NextResponse.json(strategy);
    } else {
      const result = await lumibotClient.listStrategies();
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('Lumibot strategies error:', error);
    
    // Return predefined strategies as fallback
    if (name) {
      const strategy = PREDEFINED_STRATEGIES.find(s => s.id === name);
      if (!strategy) {
        return NextResponse.json(
          { error: `Strategy ${name} not found` },
          { status: 404 }
        );
      }
      return NextResponse.json({
        name: strategy.id,
        class: strategy.name,
        description: strategy.description,
        default_parameters: Object.fromEntries(
          Object.entries(strategy.parameters).map(([key, value]) => [
            key,
            value.default,
          ])
        ),
      });
    }

    return NextResponse.json({
      strategies: PREDEFINED_STRATEGIES.map(s => ({
        name: s.id,
        class: s.name,
        description: s.description,
      })),
      source: 'fallback',
    });
  }
}
