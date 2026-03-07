/**
 * ML Classification API Route
 * 
 * Provides endpoints for Lawrence Classifier operations:
 * - POST /api/ml/classify - Run classification
 * - POST /api/ml/train - Train classifier
 * - GET /api/ml/stats - Get classifier statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnhancedLawrenceClassifier } from '@/lib/ml/lawrence-extensions';
import { getSignalAdapter, createSignalFromClassifierResult, TRADING_SESSIONS } from '@/lib/ml/signal-adapter';

// ==================== TYPES ====================

interface ClassifyRequest {
  symbol: string;
  timeframe: string;
  priceData: {
    high: number[];
    low: number[];
    close: number[];
    volume?: number[];
  };
  config?: {
    usePlattScaling?: boolean;
    useKernelSmoothing?: boolean;
    useSessionFilter?: boolean;
    minConfidence?: number;
    minProbability?: number;
  };
}

// ==================== POST: CLASSIFY ====================

export async function POST(request: NextRequest) {
  try {
    const body: ClassifyRequest = await request.json();
    
    const {
      symbol,
      timeframe,
      priceData,
      config = {},
    } = body;

    // Validate input
    if (!priceData?.close?.length) {
      return NextResponse.json(
        { error: 'Price data is required' },
        { status: 400 }
      );
    }

    // Get classifier instance
    const classifier = getEnhancedLawrenceClassifier({
      neighborCount: 8,
      filterSettings: {
        useVolatilityFilter: true,
        useRegimeFilter: true,
        useAdxFilter: true,
      },
    });

    // Prepare features (simplified - in production would calculate from priceData)
    const features = {
      indicators: {
        rsi: calculateRSI(priceData.close),
        ema20: calculateEMA(priceData.close, 20),
        ema50: calculateEMA(priceData.close, 50),
        atr: calculateATR(priceData.high, priceData.low, priceData.close),
        volumeRatio: priceData.volume 
          ? priceData.volume[priceData.volume.length - 1] / (priceData.volume.reduce((a, b) => a + b, 0) / priceData.volume.length)
          : 1,
      },
      context: {
        trend: priceData.close[priceData.close.length - 1] > priceData.close[0] ? 'TRENDING_UP' : 
               priceData.close[priceData.close.length - 1] < priceData.close[0] ? 'TRENDING_DOWN' : 'RANGING',
        volatility: 'MEDIUM',
        volume: 'MEDIUM',
      },
      signal: {
        direction: 'LONG',
        symbol,
        timeframe,
        entryPrice: priceData.close[priceData.close.length - 1],
      },
      time: {
        hour: new Date().getUTCHours(),
        dayOfWeek: new Date().getUTCDay(),
        isSessionOverlap: isSessionOverlap(),
      },
    };

    // Run classification
    const result = classifier.classifyEnhanced(features, priceData);

    // Process through SignalAdapter
    const adapter = getSignalAdapter({
      useSessionFilter: config.useSessionFilter ?? true,
      sessions: [TRADING_SESSIONS.LONDON, TRADING_SESSIONS.NEW_YORK],
      minConfidence: config.minConfidence ?? 0.6,
      minProbability: config.minProbability ?? 0.55,
    });

    const rawSignal = createSignalFromClassifierResult(
      {
        direction: result.direction,
        probability: result.calibratedProbability,
        confidence: result.confidence,
        features: result.features,
      },
      {
        timestamp: Date.now(),
        price: priceData.close[priceData.close.length - 1],
        source: 'lawrence-classifier',
        symbol,
        timeframe,
      }
    );

    const processedSignal = adapter.processSignal(rawSignal, {
      timestamp: Date.now(),
      price: priceData.close[priceData.close.length - 1],
      confidence: result.confidence,
      probability: result.calibratedProbability,
      source: 'enhanced-lawrence',
      symbol,
      timeframe,
      features: result.features,
    });

    return NextResponse.json({
      success: true,
      result: {
        direction: result.direction,
        probability: result.probability,
        confidence: result.confidence,
        calibratedProbability: result.calibratedProbability,
        features: result.features,
        kernelEstimate: result.kernelEstimate,
        sessionValid: result.sessionValid,
        activeSession: result.activeSession,
        featureImportance: result.featureImportance,
      },
      signal: {
        type: processedSignal.type,
        direction: processedSignal.direction,
        action: processedSignal.action,
        passed: processedSignal.metadata.filters?.passed ?? false,
        reasons: processedSignal.metadata.filters?.reasons ?? [],
      },
    });
  } catch (error) {
    console.error('Classification error:', error);
    return NextResponse.json(
      { error: 'Classification failed', message: String(error) },
      { status: 500 }
    );
  }
}

// ==================== GET: STATS ====================

export async function GET(request: NextRequest) {
  try {
    const classifier = getEnhancedLawrenceClassifier();
    const stats = classifier.getStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    );
  }
}

// ==================== HELPER FUNCTIONS ====================

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smooth for remaining prices
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

function calculateATR(high: number[], low: number[], close: number[], period: number = 14): number {
  if (close.length < period + 1) return 0;

  const trValues: number[] = [];
  
  for (let i = 1; i < close.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    trValues.push(tr);
  }

  return trValues.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function isSessionOverlap(): boolean {
  const hour = new Date().getUTCHours();
  // London-NY overlap: 13:00-16:00 UTC
  if (hour >= 13 && hour < 16) return true;
  // Asian-London overlap: 07:00-09:00 UTC
  if (hour >= 7 && hour < 9) return true;
  return false;
}
