/**
 * ML Stats API
 * 
 * Endpoints for ML filter and classifier statistics
 */

import { NextRequest, NextResponse } from 'next/server'
import { getMLSignalFilter } from '@/lib/ml/ml-signal-filter'
import { getLawrenceClassifier } from '@/lib/ml/lawrence-classifier'

/**
 * GET /api/ml/stats
 * 
 * Get comprehensive ML statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const detailed = searchParams.get('detailed') === 'true'
    
    const filter = getMLSignalFilter()
    const classifier = getLawrenceClassifier()
    
    const filterStats = filter.getStats()
    const classifierStats = classifier.getStats()
    const classifierConfig = classifier.getConfig()
    
    const response: Record<string, unknown> = {
      success: true,
      timestamp: Date.now(),
      filter: {
        totalSignals: filterStats.totalSignals,
        passedSignals: filterStats.passedSignals,
        rejectedSignals: filterStats.rejectedSignals,
        adjustedSignals: filterStats.adjustedSignals,
        passRate: filterStats.totalSignals > 0 
          ? filterStats.passedSignals / filterStats.totalSignals 
          : 0,
        avgOriginalConfidence: filterStats.avgOriginalConfidence,
        avgFilteredConfidence: filterStats.avgFilteredConfidence,
        avgMLScore: filterStats.avgMLScore,
        avgQualityScore: filterStats.avgQualityScore,
        longApprovals: filterStats.longApprovals,
        shortApprovals: filterStats.shortApprovals,
        neutralSignals: filterStats.neutralSignals,
        lastReset: filterStats.lastReset,
      },
      classifier: {
        totalSamples: classifierStats.totalSamples,
        longCount: classifierStats.longCount,
        shortCount: classifierStats.shortCount,
        neutralCount: classifierStats.neutralCount,
        avgConfidence: classifierStats.avgConfidence,
        winRate: classifierStats.winRate,
        lastUpdated: classifierStats.lastUpdated,
      },
    }
    
    if (detailed) {
      response.filterConfig = filter.getConfig()
      response.classifierConfig = classifierConfig
      response.rejectionReasons = filterStats.rejectionReasons
    }
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('[ML Stats API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get ML statistics', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ml/stats
 * 
 * Reset ML statistics
 */
export async function DELETE() {
  try {
    const filter = getMLSignalFilter()
    filter.resetStats()
    
    return NextResponse.json({
      success: true,
      message: 'ML statistics reset',
      timestamp: Date.now(),
    })
    
  } catch (error) {
    console.error('[ML Stats API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to reset statistics', message: String(error) },
      { status: 500 }
    )
  }
}
