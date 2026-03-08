/**
 * ML Pipeline API Endpoint
 * 
 * Manages the ML Signal Pipeline for signal enhancement
 */

import { NextRequest, NextResponse } from 'next/server'
import { 
  getMLSignalPipeline, 
  type SignalSource, 
  type MarketContext,
  type MLPipelineConfig,
} from '@/lib/ml/ml-signal-pipeline'

// ============================================================================
// GET - Get ML Pipeline status and stats
// ============================================================================

export async function GET() {
  try {
    const pipeline = getMLSignalPipeline()
    const stats = pipeline.getStats()
    const config = pipeline.getConfig()
    
    return NextResponse.json({
      success: true,
      pipeline: {
        status: 'active',
        config,
        stats: {
          totalSignals: stats.totalSignals,
          confirmedSignals: stats.confirmedSignals,
          rejectedSignals: stats.rejectedSignals,
          avgProcessingTime: stats.avgProcessingTime.toFixed(2) + 'μs',
          confirmationRate: stats.totalSignals > 0 
            ? ((stats.confirmedSignals / stats.totalSignals) * 100).toFixed(1) + '%'
            : '0%',
        },
        classifier: {
          totalSamples: stats.classifierStats.totalSamples,
          longCount: stats.classifierStats.longCount,
          shortCount: stats.classifierStats.shortCount,
          neutralCount: stats.classifierStats.neutralCount,
          avgConfidence: stats.classifierStats.avgConfidence.toFixed(2),
          winRate: (stats.classifierStats.winRate * 100).toFixed(1) + '%',
        },
      },
    })
  } catch (error) {
    console.error('Error fetching ML Pipeline status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch ML Pipeline status' },
      { status: 500 }
    )
  }
}

// ============================================================================
// POST - Control ML Pipeline
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, config, signal, context, signalId, outcome } = body
    
    switch (action) {
      case 'configure':
        return await configurePipeline(config)
      case 'enhance':
        return await enhanceSignal(signal, context)
      case 'train':
        return await trainWithOutcome(signalId, outcome)
      case 'export_training':
        return await exportTrainingData()
      case 'import_training':
        return await importTrainingData(body.data)
      case 'reset':
        return await resetPipeline()
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error in ML Pipeline:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process ML Pipeline request' },
      { status: 500 }
    )
  }
}

// ============================================================================
// PIPELINE CONTROL FUNCTIONS
// ============================================================================

async function configurePipeline(config: Partial<MLPipelineConfig>) {
  try {
    const pipeline = getMLSignalPipeline()
    pipeline.setConfig(config)
    
    return NextResponse.json({
      success: true,
      message: 'ML Pipeline configuration updated',
      config: pipeline.getConfig(),
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to configure pipeline' },
      { status: 500 }
    )
  }
}

async function enhanceSignal(signal: SignalSource, context: MarketContext) {
  try {
    if (!signal || !context) {
      return NextResponse.json(
        { success: false, error: 'Signal and context are required' },
        { status: 400 }
      )
    }
    
    const pipeline = getMLSignalPipeline()
    const enhanced = await pipeline.processSignal(signal, context)
    
    return NextResponse.json({
      success: true,
      enhanced,
      recommendation: {
        action: enhanced.filtersPassed && enhanced.quality !== 'LOW' ? 'TRADE' : 'SKIP',
        reason: !enhanced.filtersPassed 
          ? 'Filters not passed'
          : enhanced.quality === 'LOW'
            ? 'Low quality signal'
            : 'Signal approved',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to enhance signal' },
      { status: 500 }
    )
  }
}

async function trainWithOutcome(signalId: string, outcome: 'WIN' | 'LOSS' | 'NEUTRAL') {
  try {
    if (!signalId || !outcome) {
      return NextResponse.json(
        { success: false, error: 'Signal ID and outcome are required' },
        { status: 400 }
      )
    }
    
    const pipeline = getMLSignalPipeline()
    pipeline.trainWithOutcome(signalId, outcome)
    
    return NextResponse.json({
      success: true,
      message: `Trained with outcome: ${outcome}`,
      signalId,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to train with outcome' },
      { status: 500 }
    )
  }
}

async function exportTrainingData() {
  try {
    const pipeline = getMLSignalPipeline()
    const data = pipeline.exportTrainingData()
    
    return NextResponse.json({
      success: true,
      sampleCount: data.length,
      data,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to export training data' },
      { status: 500 }
    )
  }
}

async function importTrainingData(data: any[]) {
  try {
    if (!Array.isArray(data)) {
      return NextResponse.json(
        { success: false, error: 'Data must be an array' },
        { status: 400 }
      )
    }
    
    const pipeline = getMLSignalPipeline()
    pipeline.importTrainingData(data)
    
    return NextResponse.json({
      success: true,
      message: `Imported ${data.length} training samples`,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to import training data' },
      { status: 500 }
    )
  }
}

async function resetPipeline() {
  try {
    const { resetMLSignalPipeline } = await import('@/lib/ml/ml-signal-pipeline')
    resetMLSignalPipeline()
    
    return NextResponse.json({
      success: true,
      message: 'ML Pipeline reset',
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to reset pipeline' },
      { status: 500 }
    )
  }
}
