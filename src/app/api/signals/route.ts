/**
 * Signal Aggregation API
 * 
 * GET /api/signals - Get aggregated signals from LOGOS
 * POST /api/signals - Publish a signal (internal use)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getEventBus } from '@/lib/orchestration'

// In-memory signal store (would be database in production)
const recentSignals: any[] = []
const MAX_SIGNALS = 100

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const botCode = searchParams.get('bot')
    const limit = parseInt(searchParams.get('limit') || '50')
    
    let signals = recentSignals
    
    if (botCode) {
      signals = signals.filter(s => s.source === botCode)
    }
    
    return NextResponse.json({
      signals: signals.slice(-limit),
      total: recentSignals.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const eventBus = getEventBus()
    
    const signal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...body,
    }
    
    // Store signal
    recentSignals.push(signal)
    if (recentSignals.length > MAX_SIGNALS) {
      recentSignals.shift()
    }
    
    // Publish to event bus
    await eventBus.publish(`analytics.signal.${body.source}`, signal)
    
    return NextResponse.json({ success: true, signal })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
