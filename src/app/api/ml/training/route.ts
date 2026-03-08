/**
 * ML Training API
 * 
 * Endpoints for training data collection and model training
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getTrainingDataCollector,
  type CollectionConfig,
  type SignalOutcome,
} from '@/lib/ml/training-data-collector'
import { getLawrenceClassifier } from '@/lib/ml/lawrence-classifier'

/**
 * GET /api/ml/training
 * 
 * Get training data statistics and configuration
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'stats'
    
    const collector = getTrainingDataCollector()
    
    switch (action) {
      case 'stats':
        const stats = collector.getStats()
        const dbStats = await collector.getDatabaseStats()
        const classifierStats = getLawrenceClassifier().getStats()
        
        return NextResponse.json({
          success: true,
          collector: stats,
          database: dbStats,
          classifier: classifierStats,
        })
      
      case 'config':
        return NextResponse.json({
          success: true,
          config: collector.getConfig(),
        })
      
      case 'export':
        const samples = await collector.collectAll()
        
        return NextResponse.json({
          success: true,
          samples: samples.slice(0, 100), // Limit output
          totalSamples: samples.length,
        })
      
      default:
        return NextResponse.json({
          error: 'Invalid action. Use: stats, config, export',
        }, { status: 400 })
    }
  } catch (error) {
    console.error('[ML Training API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get training data', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ml/training
 * 
 * Collect training data or record signal outcome
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body
    
    const collector = getTrainingDataCollector()
    
    switch (action) {
      case 'collect':
        // Collect training data from database
        const samples = await collector.collectAll()
        
        return NextResponse.json({
          success: true,
          collected: samples.length,
          message: `Collected ${samples.length} training samples`,
        })
      
      case 'record_outcome':
        // Record a signal outcome
        const outcome = body.outcome as SignalOutcome
        
        if (!outcome || !outcome.signalId || !outcome.symbol || !outcome.direction) {
          return NextResponse.json(
            { error: 'Missing required outcome fields' },
            { status: 400 }
          )
        }
        
        await collector.recordSignalOutcome(outcome)
        
        return NextResponse.json({
          success: true,
          message: 'Outcome recorded',
        })
      
      case 'train':
        // Manually trigger training
        const trainingSamples = await collector.collectAll()
        
        if (trainingSamples.length < 10) {
          return NextResponse.json({
            success: false,
            error: 'Not enough samples for training',
            samplesCount: trainingSamples.length,
          }, { status: 400 })
        }
        
        await collector.trainClassifier(trainingSamples)
        
        return NextResponse.json({
          success: true,
          trained: trainingSamples.length,
          message: `Model trained with ${trainingSamples.length} samples`,
        })
      
      case 'update_outcome':
        // Update signal outcome after trade closes
        const { signalId, exitPrice, pnlPercent } = body
        
        if (!signalId || exitPrice === undefined || pnlPercent === undefined) {
          return NextResponse.json(
            { error: 'Missing required fields: signalId, exitPrice, pnlPercent' },
            { status: 400 }
          )
        }
        
        await collector.updateSignalOutcome(signalId, exitPrice, pnlPercent)
        
        return NextResponse.json({
          success: true,
          message: 'Signal outcome updated',
        })
      
      default:
        return NextResponse.json({
          error: 'Invalid action. Use: collect, record_outcome, train, update_outcome',
        }, { status: 400 })
    }
  } catch (error) {
    console.error('[ML Training API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process training request', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ml/training
 * 
 * Update collection configuration
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { config } = body as { config: Partial<CollectionConfig> }
    
    const collector = getTrainingDataCollector()
    collector.setConfig(config)
    
    return NextResponse.json({
      success: true,
      config: collector.getConfig(),
    })
  } catch (error) {
    console.error('[ML Training API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update config', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ml/training
 * 
 * Clear training data
 */
export async function DELETE() {
  try {
    const classifier = getLawrenceClassifier()
    classifier.clear()
    
    return NextResponse.json({
      success: true,
      message: 'Training data cleared',
    })
  } catch (error) {
    console.error('[ML Training API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to clear training data', message: String(error) },
      { status: 500 }
    )
  }
}
