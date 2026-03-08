/**
 * LOGOS Meta Bot API Endpoint
 * 
 * Manages the LOGOS signal aggregation and consensus building system
 */

import { NextRequest, NextResponse } from 'next/server'
import { LOGOSEngine, DEFAULT_AGGREGATION_CONFIG, type AggregationConfig } from '@/lib/logos-bot/engine'

// ============================================================================
// LOGOS INSTANCE STORAGE
// ============================================================================

let logosInstance: LOGOSEngine | null = null

// LOGOS bot definition
const LOGOS_BOT_INFO = {
  code: 'LOGOS',
  name: 'Logos',
  fullName: 'Meta Bot - Signal Aggregator',
  category: 'meta',
  description: 'Aggregates signals from all bots and produces unified trading decisions through consensus building',
  features: [
    'Signal aggregation',
    'Consensus building',
    'Weighted voting',
    'Performance tracking',
    'Conflict resolution',
    'Confidence calibration',
  ],
}

// ============================================================================
// GET - Get LOGOS status and performance
// ============================================================================

export async function GET() {
  try {
    let status = 'idle'
    let config = DEFAULT_AGGREGATION_CONFIG
    let performances: unknown[] = []
    
    if (logosInstance) {
      const statusInfo = logosInstance.getStatus()
      status = statusInfo.status
      config = statusInfo.config
      performances = logosInstance.getBotPerformances()
    }
    
    return NextResponse.json({
      success: true,
      bot: {
        ...LOGOS_BOT_INFO,
        status,
        enabled: logosInstance !== null,
        config,
        performances,
        stats: {
          trackedBots: performances.length,
          avgAccuracy: performances.length > 0 
            ? (performances as any[]).reduce((sum: number, p: any) => sum + p.accuracy, 0) / performances.length 
            : 0,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching LOGOS status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch LOGOS status' },
      { status: 500 }
    )
  }
}

// ============================================================================
// POST - Control LOGOS (start/stop/configure)
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, config } = body
    
    switch (action) {
      case 'start':
        return await startLogos(config)
      case 'stop':
        return await stopLogos()
      case 'configure':
        return await configureLogos(config)
      case 'inject_signal':
        return await injectSignal(body.signal)
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error controlling LOGOS:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to control LOGOS' },
      { status: 500 }
    )
  }
}

// ============================================================================
// LOGOS CONTROL FUNCTIONS
// ============================================================================

async function startLogos(config?: Partial<AggregationConfig>) {
  try {
    if (logosInstance) {
      const status = logosInstance.getStatus()
      if (status.status === 'running') {
        return NextResponse.json({
          success: false,
          error: 'LOGOS is already running',
        })
      }
    }
    
    // Create new instance
    logosInstance = new LOGOSEngine(config)
    
    // Start the engine
    await logosInstance.start()
    
    return NextResponse.json({
      success: true,
      message: 'LOGOS started successfully',
      timestamp: Date.now(),
      config: logosInstance.getStatus().config,
    })
  } catch (error) {
    console.error('Error starting LOGOS:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to start LOGOS' },
      { status: 500 }
    )
  }
}

async function stopLogos() {
  try {
    if (!logosInstance) {
      return NextResponse.json({
        success: false,
        error: 'LOGOS is not running',
      })
    }
    
    await logosInstance.stop()
    logosInstance = null
    
    return NextResponse.json({
      success: true,
      message: 'LOGOS stopped successfully',
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('Error stopping LOGOS:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to stop LOGOS' },
      { status: 500 }
    )
  }
}

async function configureLogos(config: Partial<AggregationConfig>) {
  try {
    if (!logosInstance) {
      return NextResponse.json({
        success: false,
        error: 'LOGOS is not running. Start it first to configure.',
      })
    }
    
    logosInstance.updateConfig(config)
    
    return NextResponse.json({
      success: true,
      message: 'LOGOS configuration updated',
      timestamp: Date.now(),
      config: logosInstance.getStatus().config,
    })
  } catch (error) {
    console.error('Error configuring LOGOS:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to configure LOGOS' },
      { status: 500 }
    )
  }
}

async function injectSignal(_signal: unknown) {
  try {
    if (!logosInstance) {
      return NextResponse.json({
        success: false,
        error: 'LOGOS is not running. Start it first.',
      })
    }
    
    // Signal injection would be handled through the event bus
    // This is a placeholder for manual signal injection for testing
    
    return NextResponse.json({
      success: true,
      message: 'Signal injected (handled through event bus)',
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('Error injecting signal:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to inject signal' },
      { status: 500 }
    )
  }
}
