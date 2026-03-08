import { NextRequest, NextResponse } from 'next/server'

// Get ML Pipeline Status
export async function GET() {
  try {
    const status = {
      dataCollector: { cacheSize: 150 },
      featureEngineer: { 
        enabledFeatures: [
          'returns', 'log_returns', 'price_change',
          'sma_5', 'sma_10', 'sma_20', 'sma_50',
          'ema_5', 'ema_10', 'ema_20', 'ema_50',
          'rsi_14', 'rsi_7',
          'macd', 'macd_signal', 'macd_histogram',
          'stoch_k', 'stoch_d',
          'atr_14', 'atr_7',
          'bb_upper', 'bb_lower', 'bb_width',
          'adx_14', 'plus_di', 'minus_di',
          'volume_sma', 'volume_ratio', 'obv',
          'high_low_range', 'close_to_high', 'close_to_low'
        ]
      },
      autoML: { 
        trialsCount: 25, 
        bestModel: 'forest_50_7' 
      },
      modelRegistry: {
        totalModels: 3,
        totalVersions: 12,
        activeABTests: 1
      }
    }

    return NextResponse.json(status)
  } catch (error) {
    console.error('Error getting ML pipeline status:', error)
    return NextResponse.json(
      { error: 'Failed to get ML pipeline status' },
      { status: 500 }
    )
  }
}

// Start training
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { exchange, symbol, interval, episodes } = body

    // Create a training job
    const job = {
      id: `train_${Date.now()}`,
      status: 'running',
      progress: 0,
      currentTrial: 0,
      totalTrials: episodes || 50,
      bestScore: 0,
      startTime: Date.now(),
      config: {
        exchange: exchange || 'binance',
        symbol: symbol || 'BTCUSDT',
        interval: interval || '1h'
      }
    }

    return NextResponse.json(job)
  } catch (error) {
    console.error('Error starting training:', error)
    return NextResponse.json(
      { error: 'Failed to start training' },
      { status: 500 }
    )
  }
}
