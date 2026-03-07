/**
 * Gradient Boosting Real-time Integration API
 *
 * POST /api/ml/gradient-boosting/realtime
 * Scores a signal with real exchange data
 *
 * GET /api/ml/gradient-boosting/realtime
 * Gets integration status and pending signals
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGBIntegration, type BotSignalInput } from '@/lib/gradient-boosting/gb-integration-service'
import { type OHLCV } from '@/lib/gradient-boosting/exchange-feature-provider'

interface RealtimeScoreRequest {
  action: 'score' | 'outcome' | 'status' | 'configure'
  
  // For 'score' action
  signal?: {
    botCode: string
    symbol: string
    exchange: string
    direction: 'LONG' | 'SHORT'
    confidence: number
    entryPrice: number
  }
  candles?: OHLCV[]
  
  // For 'outcome' action
  sampleId?: string
  outcome?: {
    exitPrice: number
    pnlPercent: number
    holdTimeMs: number
    maxDrawdown?: number
    maxProfit?: number
  }
  
  // For 'configure' action
  config?: {
    enabled?: boolean
    minScoreToPass?: number
    minConfidenceToPass?: number
    filterMode?: 'STRICT' | 'MODERATE' | 'LENIENT'
  }
  botIntegration?: {
    botCode: string
    enabled?: boolean
    minScore?: number
    weight?: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: RealtimeScoreRequest = await request.json()
    const { action, signal, candles, sampleId, outcome, config, botIntegration } = body

    const gbIntegration = getGBIntegration()

    switch (action) {
      case 'score': {
        if (!signal) {
          return NextResponse.json(
            { error: 'Signal required for score action' },
            { status: 400 }
          )
        }

        const signalInput: BotSignalInput = {
          ...signal,
          candles,
        }

        const result = await gbIntegration.scoreBotSignal(signalInput, candles)

        return NextResponse.json({
          success: true,
          result: {
            ...result,
            gbScore: {
              ...result.gbScore,
              score: result.normalizedScore,
            },
          },
          timestamp: Date.now(),
        })
      }

      case 'outcome': {
        if (!sampleId || !outcome) {
          return NextResponse.json(
            { error: 'sampleId and outcome required for outcome action' },
            { status: 400 }
          )
        }

        const success = gbIntegration.recordOutcome(sampleId, outcome)

        return NextResponse.json({
          success,
          message: success 
            ? 'Outcome recorded successfully' 
            : 'Failed to record outcome',
          timestamp: Date.now(),
        })
      }

      case 'configure': {
        if (config) {
          gbIntegration.updateConfig(config)
        }

        if (botIntegration) {
          gbIntegration.updateBotIntegration(
            botIntegration.botCode,
            botIntegration
          )
        }

        return NextResponse.json({
          success: true,
          config: gbIntegration.getConfig(),
          botIntegrations: gbIntegration.getBotIntegrations(),
          timestamp: Date.now(),
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[GB Realtime API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'status'

    const gbIntegration = getGBIntegration()

    switch (action) {
      case 'status': {
        const pendingSignals = gbIntegration.getPendingSignals()
        const trainingStats = gbIntegration.getTrainingStats()
        const featureImportance = gbIntegration.getFeatureImportance()
        const botIntegrations = gbIntegration.getBotIntegrations()
        const config = gbIntegration.getConfig()

        return NextResponse.json({
          success: true,
          status: {
            enabled: config.enabled,
            pendingSignalsCount: pendingSignals.size,
            trainingStats,
            featureImportance: Object.entries(featureImportance)
              .map(([name, importance]) => ({ name, importance }))
              .sort((a, b) => b.importance - a.importance)
              .slice(0, 10),
            botIntegrations,
            config,
          },
          timestamp: Date.now(),
        })
      }

      case 'pending': {
        const pendingSignals = gbIntegration.getPendingSignals()
        
        return NextResponse.json({
          success: true,
          pending: Array.from(pendingSignals.entries()).map(([id, signal]) => ({
            sampleId: id,
            ...signal,
          })),
          count: pendingSignals.size,
          timestamp: Date.now(),
        })
      }

      case 'export': {
        const data = gbIntegration.exportAll()
        
        return new NextResponse(data, {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="gb-integration-backup.json"',
          },
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[GB Realtime API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 }
    )
  }
}
