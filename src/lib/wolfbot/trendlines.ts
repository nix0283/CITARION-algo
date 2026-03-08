/**
 * Auto Trendline Detection
 * Ported from WolfBot - Automatic support/resistance and trendline detection
 * 
 * Features:
 * - Automatic pivot point detection
 * - Trendline drawing and validation
 * - Support/Resistance level identification
 * - Breakout signals
 */

import { Candle } from './indicators';

// ============== Types ==============

export interface PivotPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
  timestamp: number;
  strength: number; // How significant the pivot is
}

export interface Trendline {
  start: PivotPoint;
  end: PivotPoint;
  type: 'support' | 'resistance';
  slope: number; // Price change per candle
  isValid: boolean;
  touchPoints: number; // Number of times price touched this line
  breakouts: number; // Times price crossed this line
  currentPrice: number; // Current price on trendline
}

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number; // 0-1 based on touches and volume
  touches: number;
  firstTouch: number;
  lastTouch: number;
  broken: boolean;
}

export interface TrendlineAnalysis {
  trendlines: Trendline[];
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
  currentTrend: 'bullish' | 'bearish' | 'sideways';
  nearestSupport: number | null;
  nearestResistance: number | null;
  breakoutSignals: BreakoutSignal[];
}

export interface BreakoutSignal {
  type: 'breakout' | 'breakdown';
  level: number;
  confidence: number;
  timestamp: number;
  trendline?: Trendline;
}

// ============== Pivot Point Detection ==============

/**
 * Find pivot points (local highs and lows)
 * Uses the zigzag method with configurable sensitivity
 */
export function findPivotPoints(
  candles: Candle[],
  lookback: number = 5,
  minStrength: number = 0.001 // Minimum price movement to consider
): PivotPoint[] {
  if (candles.length < lookback * 2 + 1) return [];
  
  const pivots: PivotPoint[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;
    
    // Check if current is highest/lowest in lookback range
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      
      if (candles[j].high >= current.high) isHigh = false;
      if (candles[j].low <= current.low) isLow = false;
    }
    
    if (isHigh) {
      const strength = calculatePivotStrength(candles, i, 'high');
      pivots.push({
        index: i,
        price: current.high,
        type: 'high',
        timestamp: current.time,
        strength
      });
    } else if (isLow) {
      const strength = calculatePivotStrength(candles, i, 'low');
      pivots.push({
        index: i,
        price: current.low,
        type: 'low',
        timestamp: current.time,
        strength
      });
    }
  }
  
  // Filter by minimum strength
  return pivots.filter(p => p.strength >= minStrength);
}

/**
 * Calculate how significant a pivot point is
 */
function calculatePivotStrength(
  candles: Candle[],
  index: number,
  type: 'high' | 'low',
  lookback: number = 10
): number {
  const start = Math.max(0, index - lookback);
  const end = Math.min(candles.length - 1, index + lookback);
  
  let priceSum = 0;
  let count = 0;
  
  for (let i = start; i <= end; i++) {
    priceSum += type === 'high' ? candles[i].high : candles[i].low;
    count++;
  }
  
  const avgPrice = priceSum / count;
  const currentPrice = type === 'high' ? candles[index].high : candles[index].low;
  
  // Strength is how far the pivot is from average
  return Math.abs(currentPrice - avgPrice) / avgPrice;
}

// ============== Trendline Construction ==============

/**
 * Build trendlines from pivot points
 */
export function buildTrendlines(
  candles: Candle[],
  pivots: PivotPoint[],
  minTouchPoints: number = 2,
  maxBreakouts: number = 1
): Trendline[] {
  const trendlines: Trendline[] = [];
  
  // Find support trendlines (connecting lows)
  const lowPivots = pivots.filter(p => p.type === 'low');
  for (let i = 0; i < lowPivots.length; i++) {
    for (let j = i + 1; j < lowPivots.length; j++) {
      const trendline = createTrendline(
        lowPivots[i],
        lowPivots[j],
        candles,
        'support',
        maxBreakouts
      );
      
      if (trendline && trendline.touchPoints >= minTouchPoints) {
        trendlines.push(trendline);
      }
    }
  }
  
  // Find resistance trendlines (connecting highs)
  const highPivots = pivots.filter(p => p.type === 'high');
  for (let i = 0; i < highPivots.length; i++) {
    for (let j = i + 1; j < highPivots.length; j++) {
      const trendline = createTrendline(
        highPivots[i],
        highPivots[j],
        candles,
        'resistance',
        maxBreakouts
      );
      
      if (trendline && trendline.touchPoints >= minTouchPoints) {
        trendlines.push(trendline);
      }
    }
  }
  
  // Sort by strength (touch points)
  return trendlines.sort((a, b) => b.touchPoints - a.touchPoints);
}

/**
 * Create a trendline from two pivot points
 */
function createTrendline(
  start: PivotPoint,
  end: PivotPoint,
  candles: Candle[],
  type: 'support' | 'resistance',
  maxBreakouts: number
): Trendline | null {
  // Calculate slope
  const candleDistance = end.index - start.index;
  const slope = (end.price - start.price) / candleDistance;
  
  // Count touches and breakouts
  let touchPoints = 2; // Start and end points
  let breakouts = 0;
  const tolerance = 0.002; // 0.2% tolerance for touches
  
  for (let i = start.index + 1; i < end.index; i++) {
    const expectedPrice = start.price + slope * (i - start.index);
    const actualPrice = type === 'support' ? candles[i].low : candles[i].high;
    const diff = Math.abs(actualPrice - expectedPrice) / expectedPrice;
    
    if (diff <= tolerance) {
      touchPoints++;
    } else if (
      (type === 'support' && candles[i].low < expectedPrice) ||
      (type === 'resistance' && candles[i].high > expectedPrice)
    ) {
      breakouts++;
    }
  }
  
  // Check if trendline extends beyond end point
  for (let i = end.index + 1; i < candles.length; i++) {
    const expectedPrice = start.price + slope * (i - start.index);
    const actualPrice = type === 'support' ? candles[i].low : candles[i].high;
    
    if (
      (type === 'support' && candles[i].close < expectedPrice * (1 - tolerance * 2)) ||
      (type === 'resistance' && candles[i].close > expectedPrice * (1 + tolerance * 2))
    ) {
      breakouts++;
    }
  }
  
  // Calculate current price on trendline
  const currentIndex = candles.length - 1;
  const currentPrice = start.price + slope * (currentIndex - start.index);
  
  const isValid = breakouts <= maxBreakouts;
  
  return {
    start,
    end,
    type,
    slope,
    isValid,
    touchPoints,
    breakouts,
    currentPrice
  };
}

// ============== Support/Resistance Detection ==============

/**
 * Find support and resistance levels using cluster analysis
 */
export function findSupportResistanceLevels(
  candles: Candle[],
  lookback: number = 50,
  tolerance: number = 0.005, // 0.5% clustering tolerance
  minTouches: number = 2
): { support: SupportResistanceLevel[]; resistance: SupportResistanceLevel[] } {
  const levels: Map<number, { price: number; touches: number; timestamps: number[]; type: 'support' | 'resistance' }> = new Map();
  
  const recentCandles = candles.slice(-lookback);
  const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
  
  // Collect all potential levels
  for (const candle of recentCandles) {
    // Highs as potential resistance
    const highRounded = roundToLevel(candle.high, tolerance);
    const highKey = Math.round(highRounded / (candle.high * tolerance));
    
    if (levels.has(highKey)) {
      const level = levels.get(highKey)!;
      level.touches++;
      level.timestamps.push(candle.time);
    } else {
      levels.set(highKey, {
        price: highRounded,
        touches: 1,
        timestamps: [candle.time],
        type: 'resistance'
      });
    }
    
    // Lows as potential support
    const lowRounded = roundToLevel(candle.low, tolerance);
    const lowKey = Math.round(lowRounded / (candle.low * tolerance));
    
    if (levels.has(lowKey)) {
      const level = levels.get(lowKey)!;
      level.touches++;
      level.timestamps.push(candle.time);
    } else {
      levels.set(lowKey, {
        price: lowRounded,
        touches: 1,
        timestamps: [candle.time],
        type: 'support'
      });
    }
  }
  
  // Convert to levels array and filter
  const support: SupportResistanceLevel[] = [];
  const resistance: SupportResistanceLevel[] = [];
  
  const currentPrice = candles[candles.length - 1].close;
  
  for (const [_, level] of levels) {
    if (level.touches < minTouches) continue;
    
    // Determine if support or resistance based on current price
    const isSupport = level.price < currentPrice;
    const type = isSupport ? 'support' : 'resistance';
    
    // Check if level has been broken
    let broken = false;
    for (const candle of recentCandles.slice(-10)) {
      if (isSupport && candle.close < level.price * 0.99) {
        broken = true;
        break;
      }
      if (!isSupport && candle.close > level.price * 1.01) {
        broken = true;
        break;
      }
    }
    
    const srLevel: SupportResistanceLevel = {
      price: level.price,
      type,
      strength: Math.min(level.touches / 5, 1), // Normalize to 0-1
      touches: level.touches,
      firstTouch: Math.min(...level.timestamps),
      lastTouch: Math.max(...level.timestamps),
      broken
    };
    
    if (isSupport) {
      support.push(srLevel);
    } else {
      resistance.push(srLevel);
    }
  }
  
  return {
    support: support.sort((a, b) => b.price - a.price), // Highest support first
    resistance: resistance.sort((a, b) => a.price - b.price) // Lowest resistance first
  };
}

/**
 * Round price to nearest level
 */
function roundToLevel(price: number, tolerance: number): number {
  const step = price * tolerance;
  return Math.round(price / step) * step;
}

// ============== Main Analysis Function ==============

/**
 * Perform complete trendline analysis
 */
export function analyzeTrendlines(
  candles: Candle[],
  pivotLookback: number = 5,
  srLookback: number = 50
): TrendlineAnalysis {
  // Find pivot points
  const pivots = findPivotPoints(candles, pivotLookback);
  
  // Build trendlines
  const trendlines = buildTrendlines(candles, pivots);
  
  // Find support/resistance levels
  const { support, resistance } = findSupportResistanceLevels(candles, srLookback);
  
  // Determine current trend
  const currentTrend = determineTrend(candles, trendlines);
  
  // Find nearest levels
  const currentPrice = candles[candles.length - 1].close;
  
  const nearestSupport = support
    .filter(s => s.price < currentPrice && !s.broken)
    .sort((a, b) => currentPrice - a.price - (currentPrice - b.price))[0]?.price || null;
  
  const nearestResistance = resistance
    .filter(r => r.price > currentPrice)
    .sort((a, b) => a.price - currentPrice - (b.price - currentPrice))[0]?.price || null;
  
  // Find breakout signals
  const breakoutSignals = detectBreakouts(candles, trendlines, support, resistance);
  
  return {
    trendlines,
    supportLevels: support,
    resistanceLevels: resistance,
    currentTrend,
    nearestSupport,
    nearestResistance,
    breakoutSignals
  };
}

/**
 * Determine overall trend
 */
function determineTrend(candles: Candle[], trendlines: Trendline[]): 'bullish' | 'bearish' | 'sideways' {
  if (candles.length < 20) return 'sideways';
  
  const closes = candles.map(c => c.close);
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.length >= 50 
    ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 
    : sma20;
  
  const currentPrice = closes[closes.length - 1];
  
  // Check trendlines
  const validSupportTrendlines = trendlines.filter(t => t.type === 'support' && t.isValid);
  const validResistanceTrendlines = trendlines.filter(t => t.type === 'resistance' && t.isValid);
  
  // Bullish: price above SMAs, support trendlines intact
  if (currentPrice > sma20 && currentPrice > sma50 && validSupportTrendlines.length > validResistanceTrendlines.length) {
    return 'bullish';
  }
  
  // Bearish: price below SMAs, resistance trendlines intact
  if (currentPrice < sma20 && currentPrice < sma50 && validResistanceTrendlines.length > validSupportTrendlines.length) {
    return 'bearish';
  }
  
  return 'sideways';
}

/**
 * Detect breakout signals
 */
function detectBreakouts(
  candles: Candle[],
  trendlines: Trendline[],
  support: SupportResistanceLevel[],
  resistance: SupportResistanceLevel[]
): BreakoutSignal[] {
  const signals: BreakoutSignal[] = [];
  
  if (candles.length < 2) return signals;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // Check for resistance breakout (bullish)
  for (const level of resistance) {
    if (prev.close < level.price && current.close > level.price) {
      signals.push({
        type: 'breakout',
        level: level.price,
        confidence: level.strength,
        timestamp: current.time
      });
    }
  }
  
  // Check for support breakdown (bearish)
  for (const level of support) {
    if (prev.close > level.price && current.close < level.price) {
      signals.push({
        type: 'breakdown',
        level: level.price,
        confidence: level.strength,
        timestamp: current.time
      });
    }
  }
  
  // Check trendline breakouts
  for (const trendline of trendlines) {
    if (!trendline.isValid) continue;
    
    const expectedPrice = trendline.currentPrice;
    
    if (trendline.type === 'resistance' && current.close > expectedPrice) {
      signals.push({
        type: 'breakout',
        level: expectedPrice,
        confidence: trendline.touchPoints / 5,
        timestamp: current.time,
        trendline
      });
    } else if (trendline.type === 'support' && current.close < expectedPrice) {
      signals.push({
        type: 'breakdown',
        level: expectedPrice,
        confidence: trendline.touchPoints / 5,
        timestamp: current.time,
        trendline
      });
    }
  }
  
  return signals;
}

// ============== Export ==============

export const TrendlineDetector = {
  findPivotPoints,
  buildTrendlines,
  findSupportResistanceLevels,
  analyzeTrendlines
};

export default TrendlineDetector;
