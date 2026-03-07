/**
 * WolfBot Integration Module
 * Ported from WolfBot - Crypto trading bot features for CITARION
 * 
 * Components:
 * - 200+ Technical Indicators
 * - Multi-Timeframe Strategy Engine
 * - 20+ Candlestick Patterns
 * - Auto Trendline Detection
 * - Arbitrage Module
 */

// Indicators
export * from './indicators';
export { IndicatorLibrary, type IndicatorName } from './indicators';

// Multi-Timeframe Engine
export * from './multi-timeframe';
export { 
  MultiTimeframeEngine, 
  PREBUILT_PIPELINES,
  type TimeframeInterval,
  type TimeframeConfig,
  type SignalPipeline,
  type StrategySignal
} from './multi-timeframe';

// Candlestick Patterns
export * from './candlestick-patterns';
export {
  CandlestickPatterns,
  scanCandlestickPatterns,
  type PatternResult,
  type PatternType
} from './candlestick-patterns';

// Trendline Detection
export * from './trendlines';
export {
  TrendlineDetector,
  analyzeTrendlines,
  type Trendline,
  type SupportResistanceLevel,
  type TrendlineAnalysis,
  type BreakoutSignal
} from './trendlines';

// Arbitrage
export * from './arbitrage';
export {
  ArbitrageEngine,
  PriceMonitor,
  DEFAULT_ARBITRAGE_CONFIG,
  EXCHANGE_FEES,
  calculateTriangularArbitrage,
  findBestTriangularPath,
  type ArbitrageOpportunity,
  type ArbitrageConfig,
  type ExchangePrice
} from './arbitrage';

// Convenience: Create a full analysis for a symbol
export interface FullAnalysis {
  symbol: string;
  timestamp: number;
  
  // Trend
  trend: 'bullish' | 'bearish' | 'sideways';
  trendStrength: number;
  
  // Support/Resistance
  nearestSupport: number | null;
  nearestResistance: number | null;
  
  // Patterns
  patterns: ReturnType<typeof scanCandlestickPatterns>;
  
  // Breakout signals
  breakouts: BreakoutSignal[];
  
  // Multi-timeframe signal
  mtfSignal?: StrategySignal;
  
  // Key indicators
  indicators: {
    rsi: number | null;
    macd: { macd: number | null; signal: number | null; histogram: number | null };
    bb: { upper: number | null; middle: number | null; lower: number | null };
    atr: number | null;
    adx: number | null;
  };
}

import { Candle, RSI, MACD, BollingerBands, ATR, ADX } from './indicators';
import { MultiTimeframeEngine, PREBUILT_PIPELINES } from './multi-timeframe';
import { scanCandlestickPatterns } from './candlestick-patterns';
import { analyzeTrendlines, type BreakoutSignal } from './trendlines';
import type { StrategySignal } from './multi-timeframe';

/**
 * Perform comprehensive analysis on candles
 */
export function performFullAnalysis(
  symbol: string,
  candles: Candle[],
  timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' = '1h'
): FullAnalysis {
  const closes = candles.map(c => c.close);
  
  // Calculate indicators
  const rsi = RSI(closes, 14);
  const macd = MACD(closes, 12, 26, 9);
  const bb = BollingerBands(closes, 20, 2);
  const atr = ATR(candles, 14);
  const adxResult = ADX(candles, 14);
  
  // Analyze trendlines
  const trendlineAnalysis = analyzeTrendlines(candles);
  
  // Scan candlestick patterns
  const patterns = scanCandlestickPatterns(candles);
  
  // Determine overall trend
  const trend = trendlineAnalysis.currentTrend;
  const trendStrength = adxResult.adx ? Math.min(adxResult.adx / 50, 1) : 0.3;
  
  return {
    symbol,
    timestamp: Date.now(),
    
    trend,
    trendStrength,
    
    nearestSupport: trendlineAnalysis.nearestSupport,
    nearestResistance: trendlineAnalysis.nearestResistance,
    
    patterns,
    
    breakouts: trendlineAnalysis.breakoutSignals,
    
    indicators: {
      rsi,
      macd: { macd: macd.macd, signal: macd.signal, histogram: macd.histogram },
      bb: { upper: bb.upper, middle: bb.middle, lower: bb.lower },
      atr,
      adx: adxResult.adx
    }
  };
}

/**
 * Generate trading signal from full analysis
 */
export function generateSignal(analysis: FullAnalysis): {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let buyScore = 0;
  let sellScore = 0;
  
  // RSI signals
  if (analysis.indicators.rsi !== null) {
    if (analysis.indicators.rsi < 30) {
      buyScore += 0.3;
      reasons.push(`RSI oversold (${analysis.indicators.rsi.toFixed(1)})`);
    } else if (analysis.indicators.rsi > 70) {
      sellScore += 0.3;
      reasons.push(`RSI overbought (${analysis.indicators.rsi.toFixed(1)})`);
    }
  }
  
  // MACD signals
  if (analysis.indicators.macd.histogram !== null) {
    if (analysis.indicators.macd.histogram > 0) {
      buyScore += 0.2;
      reasons.push('MACD bullish');
    } else {
      sellScore += 0.2;
      reasons.push('MACD bearish');
    }
  }
  
  // Pattern signals
  if (analysis.patterns.strongestPattern) {
    const pattern = analysis.patterns.strongestPattern;
    if (pattern.type === 'bullish') {
      buyScore += pattern.confidence * 0.3;
      reasons.push(`Pattern: ${pattern.name}`);
    } else if (pattern.type === 'bearish') {
      sellScore += pattern.confidence * 0.3;
      reasons.push(`Pattern: ${pattern.name}`);
    }
  }
  
  // Breakout signals
  for (const breakout of analysis.breakouts) {
    if (breakout.type === 'breakout') {
      buyScore += breakout.confidence * 0.2;
      reasons.push(`Breakout above ${breakout.level.toFixed(2)}`);
    } else {
      sellScore += breakout.confidence * 0.2;
      reasons.push(`Breakdown below ${breakout.level.toFixed(2)}`);
    }
  }
  
  // Trend alignment
  if (analysis.trend === 'bullish') {
    buyScore += 0.2;
    reasons.push('Uptrend');
  } else if (analysis.trend === 'bearish') {
    sellScore += 0.2;
    reasons.push('Downtrend');
  }
  
  // Determine action
  let action: 'buy' | 'sell' | 'hold' = 'hold';
  let confidence = 0;
  
  if (buyScore > sellScore && buyScore >= 0.5) {
    action = 'buy';
    confidence = Math.min(buyScore, 1);
  } else if (sellScore > buyScore && sellScore >= 0.5) {
    action = 'sell';
    confidence = Math.min(sellScore, 1);
  }
  
  return { action, confidence, reasons };
}
