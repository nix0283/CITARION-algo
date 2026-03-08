/**
 * ML Bot Integration API
 * 
 * Endpoints for ML signal analysis for trading bots:
 * - DCA Bot: Entry timing and exit optimization
 * - BB Bot: Breakout classification
 * - ORION Bot: Trend confirmation
 * - Zenbot: Signal filtering
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getMLBotIntegration,
  type MLIntegratedBotType,
  type SignalForFiltering,
  DEFAULT_ML_BOT_CONFIGS,
} from '@/lib/ml/bot-ml-integration'

// ============================================================================
// TYPES
// ============================================================================

interface AnalyzeRequest {
  botType: MLIntegratedBotType
  signal: SignalForFiltering
  botSpecificData?: {
    // DCA
    currentPrice?: number
    historicalPrices?: number[]
    // BB
    bbData?: {
      upperBand: number
      middleBand: number
      lowerBand: number
      currentPrice: number
      stochK: number
      stochD: number
      volumeRatio: number
    }
    // ORION
    trendData?: {
      ema20: number
      ema50: number
      ema200: number
      supertrend: number
      supertrendDirection: 'UP' | 'DOWN'
      currentPrice: number
    }
    // Zenbot
    strategyConfidence?: number
    // Exit analysis
    positionData?: {
      entryPrice: number
      currentPrice: number
      direction: 'LONG' | 'SHORT'
      unrealizedPnl: number
      unrealizedPnlPercent: number
      holdingTimeMinutes: number
      takeProfit?: number
      stopLoss?: number
    }
  }
  analysisType: 'entry' | 'exit'
}

interface ConfigRequest {
  botType: MLIntegratedBotType
  config: Partial<typeof DEFAULT_ML_BOT_CONFIGS[MLIntegratedBotType]>
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * POST /api/ml/bot-integration
 * Analyze signal for a specific bot
 */
export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json()
    const { botType, signal, botSpecificData, analysisType } = body

    const integration = getMLBotIntegration()

    if (analysisType === 'exit' && botSpecificData?.positionData) {
      // Exit analysis
      const result = await integration.analyzeExit(
        botType,
        signal,
        botSpecificData.positionData
      )
      return NextResponse.json({ success: true, result })
    }

    // Entry analysis based on bot type
    let result

    switch (botType) {
      case 'DCA':
        result = await integration.analyzeDCAEntry(
          signal,
          botSpecificData?.currentPrice || signal.entryPrice || 0,
          botSpecificData?.historicalPrices
        )
        break

      case 'BB':
        if (!botSpecificData?.bbData) {
          return NextResponse.json(
            { success: false, error: 'BB data required for BB analysis' },
            { status: 400 }
          )
        }
        result = await integration.analyzeBBSignal(signal, botSpecificData.bbData)
        break

      case 'ORION':
        if (!botSpecificData?.trendData) {
          return NextResponse.json(
            { success: false, error: 'Trend data required for ORION analysis' },
            { status: 400 }
          )
        }
        result = await integration.analyzeOrionSignal(signal, botSpecificData.trendData)
        break

      case 'ZENBOT':
        result = await integration.analyzeZenbotSignal(
          signal,
          botSpecificData?.strategyConfidence || 0.5
        )
        break

      case 'VISION':
        result = await integration.analyzeSignal('VISION', signal)
        break

      default:
        return NextResponse.json(
          { success: false, error: `Unknown bot type: ${botType}` },
          { status: 400 }
        )
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('[ML Bot Integration API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ml/bot-integration
 * Update configuration for a bot type
 */
export async function PUT(request: NextRequest) {
  try {
    const body: ConfigRequest = await request.json()
    const { botType, config } = body

    const integration = getMLBotIntegration()
    integration.setConfig(botType, config)

    return NextResponse.json({ 
      success: true, 
      message: `Config updated for ${botType}`,
      config: integration.getConfig(botType),
    })
  } catch (error) {
    console.error('[ML Bot Integration API] Config update error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ml/bot-integration
 * Get statistics and configurations
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    const integration = getMLBotIntegration()

    if (action === 'stats') {
      const botType = searchParams.get('botType') as MLIntegratedBotType | null
      const stats = botType 
        ? integration.getStats(botType) 
        : integration.getAllStats()
      return NextResponse.json({ success: true, stats })
    }

    if (action === 'config') {
      const botType = searchParams.get('botType') as MLIntegratedBotType | null
      if (botType) {
        const config = integration.getConfig(botType)
        return NextResponse.json({ success: true, config })
      }
      // Return all configs
      const configs: Record<string, typeof DEFAULT_ML_BOT_CONFIGS[MLIntegratedBotType]> = {}
      const botTypes: MLIntegratedBotType[] = ['DCA', 'BB', 'ORION', 'ZENBOT', 'VISION']
      for (const bt of botTypes) {
        configs[bt] = integration.getConfig(bt)
      }
      return NextResponse.json({ success: true, configs })
    }

    // Default: return all stats and configs
    return NextResponse.json({
      success: true,
      stats: integration.getAllStats(),
      configs: DEFAULT_ML_BOT_CONFIGS,
    })
  } catch (error) {
    console.error('[ML Bot Integration API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
