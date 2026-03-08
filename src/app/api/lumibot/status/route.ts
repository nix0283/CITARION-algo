/**
 * Lumibot Service Status API Route
 * GET /api/lumibot/status
 */

import { NextResponse } from 'next/server';
import { lumibotClient } from '@/lib/lumibot/client';

export async function GET() {
  try {
    const status = await lumibotClient.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Lumibot status error:', error);
    
    // Return fallback status if service is unavailable
    return NextResponse.json({
      service: 'Lumibot Trading Service',
      version: '1.0.0',
      status: 'unavailable',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Service unavailable',
    }, { status: 503 });
  }
}
