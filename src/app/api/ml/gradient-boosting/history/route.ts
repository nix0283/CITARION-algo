/**
 * Gradient Boosting Score History API
 *
 * GET /api/ml/gradient-boosting/history
 * Returns historical scoring results
 */

import { NextResponse } from 'next/server'
import { scoreHistory } from '@/lib/gradient-boosting/scorer-instance'

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      history: scoreHistory,
      count: scoreHistory.length,
      timestamp: Date.now(),
    })

  } catch (error) {
    console.error('[Gradient Boosting History API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get score history', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ml/gradient-boosting/history
 * Clear score history
 */
export async function DELETE() {
  try {
    scoreHistory.length = 0

    return NextResponse.json({
      success: true,
      message: 'Score history cleared',
      timestamp: Date.now(),
    })

  } catch (error) {
    console.error('[Gradient Boosting History API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to clear history', message: String(error) },
      { status: 500 }
    )
  }
}
