/**
 * Candlestick Pattern Recognition
 * Ported from WolfBot - 20+ candlestick patterns
 * 
 * Categories:
 * - Reversal Patterns (Doji, Hammer, Morning Star...)
 * - Continuation Patterns (Marubozu, Spinning Top...)
 * - Bearish Patterns (Evening Star, Shooting Star...)
 * - Bullish Patterns (Bullish Engulfing, Three White Soldiers...)
 */

import { Candle } from './indicators';

// ============== Types ==============

export type PatternType = 'bullish' | 'bearish' | 'neutral' | 'continuation';

export interface PatternResult {
  name: string;
  type: PatternType;
  confidence: number; // 0-1
  candles: number; // How many candles involved
  description: string;
  signal: 'buy' | 'sell' | 'hold';
}

// ============== Helper Functions ==============

function bodySize(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

function upperWick(candle: Candle): number {
  return candle.high - Math.max(candle.open, candle.close);
}

function lowerWick(candle: Candle): number {
  return Math.min(candle.open, candle.close) - candle.low;
}

function totalRange(candle: Candle): number {
  return candle.high - candle.low;
}

function isBullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

function isBearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

function bodyMidpoint(candle: Candle): number {
  return (candle.open + candle.close) / 2;
}

function averageBodySize(candles: Candle[], period: number = 10): number {
  const bodies = candles.slice(-period).map(c => bodySize(c));
  return bodies.reduce((a, b) => a + b, 0) / bodies.length;
}

function averageRange(candles: Candle[], period: number = 10): number {
  const ranges = candles.slice(-period).map(c => totalRange(c));
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

// ============== Single Candle Patterns ==============

/**
 * Doji - Indecision pattern
 */
export function Doji(candle: Candle, avgBody: number): PatternResult | null {
  const body = bodySize(candle);
  const range = totalRange(candle);
  
  // Doji: body is very small relative to range
  if (body < range * 0.1) {
    return {
      name: 'Doji',
      type: 'neutral',
      confidence: range > 0 ? 1 - body / range : 0.5,
      candles: 1,
      description: 'Market indecision - open and close nearly equal',
      signal: 'hold'
    };
  }
  
  return null;
}

/**
 * Dragonfly Doji - Bullish reversal
 */
export function DragonflyDoji(candle: Candle): PatternResult | null {
  const body = bodySize(candle);
  const range = totalRange(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  
  // Dragonfly: no upper wick, long lower wick, small body at top
  if (body < range * 0.1 && upper < range * 0.05 && lower > range * 0.6) {
    return {
      name: 'Dragonfly Doji',
      type: 'bullish',
      confidence: lower / range,
      candles: 1,
      description: 'Bullish reversal signal - buyers stepped in at lows',
      signal: 'buy'
    };
  }
  
  return null;
}

/**
 * Gravestone Doji - Bearish reversal
 */
export function GravestoneDoji(candle: Candle): PatternResult | null {
  const body = bodySize(candle);
  const range = totalRange(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  
  // Gravestone: no lower wick, long upper wick, small body at bottom
  if (body < range * 0.1 && lower < range * 0.05 && upper > range * 0.6) {
    return {
      name: 'Gravestone Doji',
      type: 'bearish',
      confidence: upper / range,
      candles: 1,
      description: 'Bearish reversal signal - sellers rejected highs',
      signal: 'sell'
    };
  }
  
  return null;
}

/**
 * Hammer - Bullish reversal
 */
export function Hammer(candle: Candle, avgBody: number): PatternResult | null {
  const body = bodySize(candle);
  const range = totalRange(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  
  // Hammer: small body at top, little/no upper wick, long lower wick (2x+ body)
  if (body > 0 && lower >= body * 2 && upper < body * 0.5 && body < avgBody * 1.5) {
    return {
      name: 'Hammer',
      type: 'bullish',
      confidence: Math.min(lower / body / 3, 1),
      candles: 1,
      description: 'Bullish reversal after downtrend',
      signal: 'buy'
    };
  }
  
  return null;
}

/**
 * Inverted Hammer - Bullish reversal
 */
export function InvertedHammer(candle: Candle, avgBody: number): PatternResult | null {
  const body = bodySize(candle);
  const range = totalRange(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  
  // Inverted Hammer: small body at bottom, long upper wick, little/no lower wick
  if (body > 0 && upper >= body * 2 && lower < body * 0.5 && body < avgBody * 1.5) {
    return {
      name: 'Inverted Hammer',
      type: 'bullish',
      confidence: Math.min(upper / body / 3, 1),
      candles: 1,
      description: 'Potential bullish reversal',
      signal: 'buy'
    };
  }
  
  return null;
}

/**
 * Hanging Man - Bearish reversal
 */
export function HangingMan(candle: Candle, prevCandle: Candle, avgBody: number): PatternResult | null {
  // Must occur after uptrend (previous candle bullish)
  if (!isBullish(prevCandle)) return null;
  
  const body = bodySize(candle);
  const range = totalRange(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  
  // Same shape as Hammer but after uptrend
  if (body > 0 && lower >= body * 2 && upper < body * 0.5 && body < avgBody * 1.5) {
    return {
      name: 'Hanging Man',
      type: 'bearish',
      confidence: Math.min(lower / body / 3, 1),
      candles: 1,
      description: 'Bearish reversal after uptrend',
      signal: 'sell'
    };
  }
  
  return null;
}

/**
 * Shooting Star - Bearish reversal
 */
export function ShootingStar(candle: Candle, prevCandle: Candle, avgBody: number): PatternResult | null {
  // Must occur after uptrend
  if (!isBullish(prevCandle)) return null;
  
  const body = bodySize(candle);
  const range = totalRange(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  
  // Same shape as Inverted Hammer but after uptrend
  if (body > 0 && upper >= body * 2 && lower < body * 0.5 && body < avgBody * 1.5) {
    return {
      name: 'Shooting Star',
      type: 'bearish',
      confidence: Math.min(upper / body / 3, 1),
      candles: 1,
      description: 'Bearish reversal signal',
      signal: 'sell'
    };
  }
  
  return null;
}

/**
 * Marubozu - Strong continuation
 */
export function Marubozu(candle: Candle): PatternResult | null {
  const body = bodySize(candle);
  const range = totalRange(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  
  // Marubozu: no wicks, body fills entire range
  if (body >= range * 0.95) {
    const type = isBullish(candle) ? 'bullish' : 'bearish';
    return {
      name: isBullish(candle) ? 'Bullish Marubozu' : 'Bearish Marubozu',
      type,
      confidence: 0.9,
      candles: 1,
      description: `${type} continuation - strong momentum`,
      signal: isBullish(candle) ? 'buy' : 'sell'
    };
  }
  
  return null;
}

/**
 * Spinning Top - Indecision
 */
export function SpinningTop(candle: Candle, avgBody: number): PatternResult | null {
  const body = bodySize(candle);
  const range = totalRange(candle);
  const upper = upperWick(candle);
  const lower = lowerWick(candle);
  
  // Spinning top: small body, wicks on both sides
  if (body < range * 0.3 && body > 0 && upper > body && lower > body) {
    return {
      name: 'Spinning Top',
      type: 'neutral',
      confidence: 0.5,
      candles: 1,
      description: 'Market indecision - waiting for direction',
      signal: 'hold'
    };
  }
  
  return null;
}

// ============== Two Candle Patterns ==============

/**
 * Bullish Engulfing
 */
export function BullishEngulfing(candle: Candle, prevCandle: Candle): PatternResult | null {
  // Previous must be bearish, current must be bullish
  if (!isBearish(prevCandle) || !isBullish(candle)) return null;
  
  // Current body must engulf previous body
  const currentBodyStart = Math.min(candle.open, candle.close);
  const currentBodyEnd = Math.max(candle.open, candle.close);
  const prevBodyStart = Math.min(prevCandle.open, prevCandle.close);
  const prevBodyEnd = Math.max(prevCandle.open, prevCandle.close);
  
  if (currentBodyStart <= prevBodyStart && currentBodyEnd >= prevBodyEnd) {
    return {
      name: 'Bullish Engulfing',
      type: 'bullish',
      confidence: 0.8,
      candles: 2,
      description: 'Strong bullish reversal - buyers take control',
      signal: 'buy'
    };
  }
  
  return null;
}

/**
 * Bearish Engulfing
 */
export function BearishEngulfing(candle: Candle, prevCandle: Candle): PatternResult | null {
  // Previous must be bullish, current must be bearish
  if (!isBullish(prevCandle) || !isBearish(candle)) return null;
  
  const currentBodyStart = Math.min(candle.open, candle.close);
  const currentBodyEnd = Math.max(candle.open, candle.close);
  const prevBodyStart = Math.min(prevCandle.open, prevCandle.close);
  const prevBodyEnd = Math.max(prevCandle.open, prevCandle.close);
  
  if (currentBodyStart <= prevBodyStart && currentBodyEnd >= prevBodyEnd) {
    return {
      name: 'Bearish Engulfing',
      type: 'bearish',
      confidence: 0.8,
      candles: 2,
      description: 'Strong bearish reversal - sellers take control',
      signal: 'sell'
    };
  }
  
  return null;
}

/**
 * Tweezer Top - Bearish reversal
 */
export function TweezerTop(candle: Candle, prevCandle: Candle): PatternResult | null {
  // Both candles have same high (approximately)
  const highDiff = Math.abs(candle.high - prevCandle.high) / prevCandle.high;
  
  if (highDiff < 0.002 && isBullish(prevCandle) && isBearish(candle)) {
    return {
      name: 'Tweezer Top',
      type: 'bearish',
      confidence: 0.7,
      candles: 2,
      description: 'Double rejection at resistance level',
      signal: 'sell'
    };
  }
  
  return null;
}

/**
 * Tweezer Bottom - Bullish reversal
 */
export function TweezerBottom(candle: Candle, prevCandle: Candle): PatternResult | null {
  const lowDiff = Math.abs(candle.low - prevCandle.low) / prevCandle.low;
  
  if (lowDiff < 0.002 && isBearish(prevCandle) && isBullish(candle)) {
    return {
      name: 'Tweezer Bottom',
      type: 'bullish',
      confidence: 0.7,
      candles: 2,
      description: 'Double support at same level',
      signal: 'buy'
    };
  }
  
  return null;
}

/**
 * Piercing Line - Bullish reversal
 */
export function PiercingLine(candle: Candle, prevCandle: Candle): PatternResult | null {
  if (!isBearish(prevCandle) || !isBullish(candle)) return null;
  
  const prevMidpoint = bodyMidpoint(prevCandle);
  
  // Current closes above midpoint of previous bearish candle
  if (candle.close > prevMidpoint && candle.open < prevCandle.close) {
    return {
      name: 'Piercing Line',
      type: 'bullish',
      confidence: 0.7,
      candles: 2,
      description: 'Bullish reversal - buyers push above midpoint',
      signal: 'buy'
    };
  }
  
  return null;
}

/**
 * Dark Cloud Cover - Bearish reversal
 */
export function DarkCloudCover(candle: Candle, prevCandle: Candle): PatternResult | null {
  if (!isBullish(prevCandle) || !isBearish(candle)) return null;
  
  const prevMidpoint = bodyMidpoint(prevCandle);
  
  // Current closes below midpoint of previous bullish candle
  if (candle.close < prevMidpoint && candle.open > prevCandle.close) {
    return {
      name: 'Dark Cloud Cover',
      type: 'bearish',
      confidence: 0.7,
      candles: 2,
      description: 'Bearish reversal - sellers push below midpoint',
      signal: 'sell'
    };
  }
  
  return null;
}

// ============== Three Candle Patterns ==============

/**
 * Morning Star - Bullish reversal
 */
export function MorningStar(candles: Candle[]): PatternResult | null {
  if (candles.length < 3) return null;
  
  const [first, second, third] = candles.slice(-3);
  
  // First: large bearish
  // Second: small body (gap down)
  // Third: large bullish closing into first candle
  const firstBody = bodySize(first);
  const thirdBody = bodySize(third);
  
  if (
    isBearish(first) && firstBody > bodySize(second) * 2 &&
    bodySize(second) < firstBody * 0.3 && // Second is small
    isBullish(third) && thirdBody > firstBody * 0.5 &&
    third.close > (first.open + first.close) / 2 // Closes above midpoint of first
  ) {
    return {
      name: 'Morning Star',
      type: 'bullish',
      confidence: 0.85,
      candles: 3,
      description: 'Strong bullish reversal pattern',
      signal: 'buy'
    };
  }
  
  return null;
}

/**
 * Evening Star - Bearish reversal
 */
export function EveningStar(candles: Candle[]): PatternResult | null {
  if (candles.length < 3) return null;
  
  const [first, second, third] = candles.slice(-3);
  
  const firstBody = bodySize(first);
  const thirdBody = bodySize(third);
  
  if (
    isBullish(first) && firstBody > bodySize(second) * 2 &&
    bodySize(second) < firstBody * 0.3 &&
    isBearish(third) && thirdBody > firstBody * 0.5 &&
    third.close < (first.open + first.close) / 2
  ) {
    return {
      name: 'Evening Star',
      type: 'bearish',
      confidence: 0.85,
      candles: 3,
      description: 'Strong bearish reversal pattern',
      signal: 'sell'
    };
  }
  
  return null;
}

/**
 * Three White Soldiers - Bullish continuation
 */
export function ThreeWhiteSoldiers(candles: Candle[]): PatternResult | null {
  if (candles.length < 3) return null;
  
  const [first, second, third] = candles.slice(-3);
  
  // All three bullish, each closing higher
  if (
    isBullish(first) && isBullish(second) && isBullish(third) &&
    second.close > first.close && third.close > second.close &&
    bodySize(first) > 0 && bodySize(second) > 0 && bodySize(third) > 0
  ) {
    // Check for reasonable body sizes (not dojis)
    const avgBody = (bodySize(first) + bodySize(second) + bodySize(third)) / 3;
    const avgRange = averageRange(candles);
    
    if (avgBody > avgRange * 0.3) {
      return {
        name: 'Three White Soldiers',
        type: 'bullish',
        confidence: 0.9,
        candles: 3,
        description: 'Strong bullish continuation',
        signal: 'buy'
      };
    }
  }
  
  return null;
}

/**
 * Three Black Crows - Bearish continuation
 */
export function ThreeBlackCrows(candles: Candle[]): PatternResult | null {
  if (candles.length < 3) return null;
  
  const [first, second, third] = candles.slice(-3);
  
  if (
    isBearish(first) && isBearish(second) && isBearish(third) &&
    second.close < first.close && third.close < second.close &&
    bodySize(first) > 0 && bodySize(second) > 0 && bodySize(third) > 0
  ) {
    const avgBody = (bodySize(first) + bodySize(second) + bodySize(third)) / 3;
    const avgRange = averageRange(candles);
    
    if (avgBody > avgRange * 0.3) {
      return {
        name: 'Three Black Crows',
        type: 'bearish',
        confidence: 0.9,
        candles: 3,
        description: 'Strong bearish continuation',
        signal: 'sell'
      };
    }
  }
  
  return null;
}

/**
 * Three Inside Up - Bullish reversal
 */
export function ThreeInsideUp(candles: Candle[]): PatternResult | null {
  if (candles.length < 3) return null;
  
  const [first, second, third] = candles.slice(-3);
  
  // First: bearish
  // Second: bullish inside first
  // Third: bullish closing higher than second
  if (
    isBearish(first) &&
    isBullish(second) &&
    second.open > first.close && second.close < first.open && // Inside first
    isBullish(third) && third.close > second.close
  ) {
    return {
      name: 'Three Inside Up',
      type: 'bullish',
      confidence: 0.8,
      candles: 3,
      description: 'Bullish reversal confirmation',
      signal: 'buy'
    };
  }
  
  return null;
}

/**
 * Three Inside Down - Bearish reversal
 */
export function ThreeInsideDown(candles: Candle[]): PatternResult | null {
  if (candles.length < 3) return null;
  
  const [first, second, third] = candles.slice(-3);
  
  if (
    isBullish(first) &&
    isBearish(second) &&
    second.open < first.close && second.close > first.open &&
    isBearish(third) && third.close < second.close
  ) {
    return {
      name: 'Three Inside Down',
      type: 'bearish',
      confidence: 0.8,
      candles: 3,
      description: 'Bearish reversal confirmation',
      signal: 'sell'
    };
  }
  
  return null;
}

/**
 * Tri-Star - Reversal pattern
 */
export function TriStar(candles: Candle[]): PatternResult | null {
  if (candles.length < 3) return null;
  
  const [first, second, third] = candles.slice(-3);
  const avgBody = averageBodySize(candles);
  
  // All three are dojis
  const doji1 = Doji(first, avgBody);
  const doji2 = Doji(second, avgBody);
  const doji3 = Doji(third, avgBody);
  
  if (doji1 && doji2 && doji3) {
    // Check for gap pattern
    if (second.high < first.low && third.low > second.high) {
      return {
        name: 'Bullish Tri-Star',
        type: 'bullish',
        confidence: 0.75,
        candles: 3,
        description: 'Bullish reversal with extreme indecision',
        signal: 'buy'
      };
    } else if (second.low > first.high && third.high < second.low) {
      return {
        name: 'Bearish Tri-Star',
        type: 'bearish',
        confidence: 0.75,
        candles: 3,
        description: 'Bearish reversal with extreme indecision',
        signal: 'sell'
      };
    }
  }
  
  return null;
}

// ============== Pattern Scanner ==============

export interface PatternScannerResult {
  patterns: PatternResult[];
  strongestPattern: PatternResult | null;
  overallSignal: 'buy' | 'sell' | 'hold';
  confidence: number;
}

export function scanCandlestickPatterns(candles: Candle[]): PatternScannerResult {
  if (candles.length < 3) {
    return {
      patterns: [],
      strongestPattern: null,
      overallSignal: 'hold',
      confidence: 0
    };
  }
  
  const patterns: PatternResult[] = [];
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const avgBody = averageBodySize(candles);
  
  // Single candle patterns
  patterns.push(
    Doji(current, avgBody),
    DragonflyDoji(current),
    GravestoneDoji(current),
    Hammer(current, avgBody),
    InvertedHammer(current, avgBody),
    HangingMan(current, prev, avgBody),
    ShootingStar(current, prev, avgBody),
    Marubozu(current),
    SpinningTop(current, avgBody)
  ).filter(Boolean) as PatternResult[];
  
  // Two candle patterns
  patterns.push(
    BullishEngulfing(current, prev),
    BearishEngulfing(current, prev),
    TweezerTop(current, prev),
    TweezerBottom(current, prev),
    PiercingLine(current, prev),
    DarkCloudCover(current, prev)
  ).filter(Boolean) as PatternResult[];
  
  // Three candle patterns
  patterns.push(
    MorningStar(candles),
    EveningStar(candles),
    ThreeWhiteSoldiers(candles),
    ThreeBlackCrows(candles),
    ThreeInsideUp(candles),
    ThreeInsideDown(candles),
    TriStar(candles)
  ).filter(Boolean) as PatternResult[];
  
  // Find strongest pattern
  const sortedPatterns = patterns.sort((a, b) => b.confidence - a.confidence);
  const strongestPattern = sortedPatterns[0] || null;
  
  // Calculate overall signal
  const bullishPatterns = patterns.filter(p => p.type === 'bullish');
  const bearishPatterns = patterns.filter(p => p.type === 'bearish');
  
  let overallSignal: 'buy' | 'sell' | 'hold' = 'hold';
  let confidence = 0;
  
  const bullishScore = bullishPatterns.reduce((sum, p) => sum + p.confidence, 0);
  const bearishScore = bearishPatterns.reduce((sum, p) => sum + p.confidence, 0);
  
  if (bullishScore > bearishScore && bullishPatterns.length > 0) {
    overallSignal = 'buy';
    confidence = bullishScore / patterns.length;
  } else if (bearishScore > bullishScore && bearishPatterns.length > 0) {
    overallSignal = 'sell';
    confidence = bearishScore / patterns.length;
  }
  
  return {
    patterns,
    strongestPattern,
    overallSignal,
    confidence
  };
}

// ============== Export ==============

export const CandlestickPatterns = {
  // Single candle
  Doji, DragonflyDoji, GravestoneDoji, Hammer, InvertedHammer,
  HangingMan, ShootingStar, Marubozu, SpinningTop,
  
  // Two candle
  BullishEngulfing, BearishEngulfing, TweezerTop, TweezerBottom,
  PiercingLine, DarkCloudCover,
  
  // Three candle
  MorningStar, EveningStar, ThreeWhiteSoldiers, ThreeBlackCrows,
  ThreeInsideUp, ThreeInsideDown, TriStar,
  
  // Scanner
  scanCandlestickPatterns
};

export default CandlestickPatterns;
