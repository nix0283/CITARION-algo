/**
 * ML Filter API
 * 
 * Endpoints for filtering signals through ML pipeline
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getMLSignalFilter,
  type SignalForFiltering,
  type MLFilterConfig,
} from '@/lib/ml/ml-signal-filter'

/**
 * POST /api/ml/filter
 * 
 * Filter a signal through ML pipeline
 * 
 * Request body:
 * {
 *   signal: SignalForFiltering
 *   config?: Partial<MLFilterConfig>  // Optional config overrides
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { signal, config } = body as { 
      signal: SignalForFiltering
      config?: Partial<MLFilterConfig>
    }
    
    if (!signal) {
      return NextResponse.json(
        { error: 'Signal is required' },
        { status: 400 }
      )
    }
    
    // Validate signal
    if (!signal.botCode || !signal.symbol || !signal.exchange) {
      return NextResponse.json(
        { error: 'Missing required signal fields: botCode, symbol, exchange' },
        { status: 400 }
      )
    }
    
    // Get filter instance
    const filter = getMLSignalFilter(config)
    
    // Filter signal
    const result = await filter.filter(signal)
    
    return NextResponse.json({
      success: true,
      result,
    })
    
  } catch (error) {
    console.error('[ML Filter API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to filter signal', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ml/filter
 * 
 * Get ML filter configuration and statistics
 */
export async function GET() {
  try {
    const filter = getMLSignalFilter()
    
    return NextResponse.json({
      success: true,
      config: filter.getConfig(),
      stats: filter.getStats(),
    })
    
  } catch (error) {
    console.error('[ML Filter API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get filter info', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ml/filter
 * 
 * Update ML filter configuration
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { config } = body as { config: Partial<MLFilterConfig> }
    
    const filter = getMLSignalFilter()
    filter.setConfig(config)
    
    return NextResponse.json({
      success: true,
      config: filter.getConfig(),
    })
    
  } catch (error) {
    console.error('[ML Filter API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update config', message: String(error) },
      { status: 500 }
    )
  }
}
