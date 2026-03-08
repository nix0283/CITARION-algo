/**
 * Gradient Boosting Signal Scoring API
 *
 * POST /api/ml/gradient-boosting/score
 * Scores a signal using the gradient boosting model
 */

import { NextRequest, NextResponse } from 'next/server'
import { type SignalFeatures } from '@/lib/gradient-boosting'
import { getScorer, scoreHistory } from '@/lib/gradient-boosting/scorer-instance'

interface ScoreRequest {
  features: Partial<SignalFeatures>
  source?: string
  symbol?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ScoreRequest = await request.json()
    const { features, source, symbol } = body

    // Get the scorer
    const scorer = getScorer()

    // Score the signal
    const result = scorer.score(features)

    // Normalize score for display (raw score to 0-100)
    const normalizedScore = Math.max(0, Math.min(100, (result.score + 1) * 50))

    // Create history entry
    const historyEntry = {
      id: `score_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      score: normalizedScore,
      confidence: result.confidence * 100,
      direction: result.direction,
      quality: result.quality,
      symbol: symbol || source || 'Manual',
    }

    // Add to history (keep last 50)
    scoreHistory.unshift(historyEntry)
    if (scoreHistory.length > 50) {
      scoreHistory.pop()
    }

    return NextResponse.json({
      success: true,
      score: {
        ...result,
        score: normalizedScore,
        confidence: result.confidence * 100,
      },
      historyId: historyEntry.id,
      timestamp: Date.now(),
    })

  } catch (error) {
    console.error('[Gradient Boosting Score API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to score signal', message: String(error) },
      { status: 500 }
    )
  }
}
