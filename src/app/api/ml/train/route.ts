/**
 * ML Train API
 * 
 * Endpoints for training the ML classifier
 */

import { NextRequest, NextResponse } from 'next/server'
import { 
  getMLSignalFilter, 
  type SignalForFiltering 
} from '@/lib/ml/ml-signal-filter'
import {
  getLawrenceClassifier,
  type TrainingSample,
} from '@/lib/ml/lawrence-classifier'

/**
 * POST /api/ml/train
 * 
 * Add training samples to the classifier
 * 
 * Request body:
 * {
 *   samples: TrainingSample[]  // Array of training samples
 * }
 * 
 * Or for auto-training from filtered signal:
 * {
 *   signal: SignalForFiltering,
 *   outcome: 'LONG' | 'SHORT' | 'NEUTRAL',
 *   correct: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Direct sample training
    if (body.samples) {
      const { samples } = body as { samples: TrainingSample[] }
      
      if (!Array.isArray(samples) || samples.length === 0) {
        return NextResponse.json(
          { error: 'Samples array is required' },
          { status: 400 }
        )
      }
      
      const classifier = getLawrenceClassifier()
      classifier.trainBatch(samples)
      
      return NextResponse.json({
        success: true,
        trainedSamples: samples.length,
        totalSamples: classifier.getStats().totalSamples,
      })
    }
    
    // Training from signal outcome
    if (body.signal && body.outcome) {
      const { signal, outcome, correct } = body as {
        signal: SignalForFiltering
        outcome: 'LONG' | 'SHORT' | 'NEUTRAL'
        correct?: boolean
      }
      
      const filter = getMLSignalFilter()
      
      // Filter signal first to get ML result
      const filteredResult = await filter.filter(signal)
      
      // Create training sample
      const sample: TrainingSample = {
        features: filteredResult.mlResult.features,
        label: outcome,
        weight: correct !== undefined 
          ? (correct ? 1.0 : 0.5)
          : filteredResult.qualityScore,
        timestamp: Date.now(),
      }
      
      // Add training sample
      filter.addTrainingSample(sample)
      
      return NextResponse.json({
        success: true,
        trained: true,
        sample: {
          label: sample.label,
          weight: sample.weight,
          featuresCount: Object.keys(sample.features).length,
        },
        totalSamples: filter.getClassifier().getStats().totalSamples,
      })
    }
    
    return NextResponse.json(
      { error: 'Either samples array or signal+outcome is required' },
      { status: 400 }
    )
    
  } catch (error) {
    console.error('[ML Train API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to train classifier', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ml/train
 * 
 * Get training data export
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'json'
    
    const classifier = getLawrenceClassifier()
    const trainingData = classifier.exportTrainingData()
    const stats = classifier.getStats()
    
    if (format === 'summary') {
      return NextResponse.json({
        success: true,
        stats,
        sampleCount: trainingData.length,
      })
    }
    
    return NextResponse.json({
      success: true,
      stats,
      trainingData: trainingData.slice(0, 100), // Limit to 100 samples
      totalSamples: trainingData.length,
    })
    
  } catch (error) {
    console.error('[ML Train API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get training data', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ml/train
 * 
 * Import training data
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { trainingData, clearExisting } = body as {
      trainingData: TrainingSample[]
      clearExisting?: boolean
    }
    
    if (!Array.isArray(trainingData)) {
      return NextResponse.json(
        { error: 'trainingData array is required' },
        { status: 400 }
      )
    }
    
    const classifier = getLawrenceClassifier()
    
    if (clearExisting) {
      classifier.clear()
    }
    
    classifier.importTrainingData(trainingData)
    
    return NextResponse.json({
      success: true,
      importedSamples: trainingData.length,
      totalSamples: classifier.getStats().totalSamples,
      cleared: clearExisting || false,
    })
    
  } catch (error) {
    console.error('[ML Train API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to import training data', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ml/train
 * 
 * Clear all training data
 */
export async function DELETE() {
  try {
    const classifier = getLawrenceClassifier()
    classifier.clear()
    
    return NextResponse.json({
      success: true,
      message: 'Training data cleared',
      stats: classifier.getStats(),
    })
    
  } catch (error) {
    console.error('[ML Train API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to clear training data', message: String(error) },
      { status: 500 }
    )
  }
}
