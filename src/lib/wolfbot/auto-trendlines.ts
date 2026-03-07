/**
 * Auto Trendlines - Automatic Support/Resistance Detection
 * Port from WolfBot for CITARION
 * 
 * Features:
 * - Automatic trendline detection
 * - Support and resistance level identification
 * - Breakout signals
 * - Channel detection
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Point {
  index: number;
  price: number;
  time?: number;
}

export interface Trendline {
  start: Point;
  end: Point;
  type: 'support' | 'resistance';
  slope: number;
  intercept: number;
  touches: number;
  strength: number; // 0-100 based on touches and length
  broken: boolean;
  breakIndex?: number;
}

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  touches: number;
  firstTouch: number;
  lastTouch: number;
  strength: number;
}

export interface Channel {
  upperLine: Trendline;
  lowerLine: Trendline;
  width: number;
  midpoint: number;
  trend: 'bullish' | 'bearish' | 'sideways';
}

export interface BreakoutSignal {
  trendline: Trendline;
  direction: 'up' | 'down';
  price: number;
  index: number;
  strength: number;
}

export interface Candle {
  high: number;
  low: number;
  close: number;
  open: number;
  time?: number;
}

// =============================================================================
// PIVOT POINT DETECTION
// =============================================================================

export interface PivotPoints {
  highs: Point[];
  lows: Point[];
}

/**
 * Detect pivot points (local highs and lows)
 * Uses the ZigZag approach with configurable threshold
 */
export function detectPivotPoints(
  candles: Candle[],
  leftBars: number = 3,
  rightBars: number = 3,
  threshold: number = 0
): PivotPoints {
  const highs: Point[] = [];
  const lows: Point[] = [];
  
  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    
    // Check for local high
    let isHigh = true;
    let isLow = true;
    
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentHigh) isHigh = false;
      if (candles[j].low <= currentLow) isLow = false;
    }
    
    if (isHigh) {
      highs.push({ index: i, price: currentHigh });
    }
    if (isLow) {
      lows.push({ index: i, price: currentLow });
    }
  }
  
  return { highs, lows };
}

/**
 * Detect significant pivots using percentage threshold
 */
export function detectSignificantPivots(
  candles: Candle[],
  minChangePercent: number = 3
): PivotPoints {
  const highs: Point[] = [];
  const lows: Point[] = [];
  
  if (candles.length < 5) return { highs, lows };
  
  let lastHigh = { index: 0, price: candles[0].high };
  let lastLow = { index: 0, price: candles[0].low };
  let trend: 'up' | 'down' = 'up';
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    
    const changeFromHigh = ((high - lastHigh.price) / lastHigh.price) * 100;
    const changeFromLow = ((low - lastLow.price) / lastLow.price) * 100;
    
    if (trend === 'up') {
      if (high > lastHigh.price) {
        lastHigh = { index: i, price: high };
      } else if (changeFromHigh < -minChangePercent) {
        highs.push(lastHigh);
        trend = 'down';
        lastLow = { index: i, price: low };
      }
    } else {
      if (low < lastLow.price) {
        lastLow = { index: i, price: low };
      } else if (changeFromLow > minChangePercent) {
        lows.push(lastLow);
        trend = 'up';
        lastHigh = { index: i, price: high };
      }
    }
  }
  
  // Add final points
  if (trend === 'up') {
    highs.push(lastHigh);
  } else {
    lows.push(lastLow);
  }
  
  return { highs, lows };
}

// =============================================================================
// TRENDLINE DETECTION
// =============================================================================

/**
 * Find trendlines connecting pivot points
 */
export function findTrendlines(
  candles: Candle[],
  pivots: PivotPoints,
  minTouches: number = 2,
  maxTouchDistance: number = 0.02 // 2% of price
): Trendline[] {
  const trendlines: Trendline[] = [];
  
  // Find support lines from pivot lows
  for (let i = 0; i < pivots.lows.length - 1; i++) {
    for (let j = i + 1; j < pivots.lows.length; j++) {
      const start = pivots.lows[i];
      const end = pivots.lows[j];
      
      // Calculate line equation: y = slope * x + intercept
      const dx = end.index - start.index;
      if (dx < 5) continue; // Minimum distance
      
      const slope = (end.price - start.price) / dx;
      const intercept = start.price - slope * start.index;
      
      // Count touches (lows that fall near the line)
      let touches = 2; // Start and end points
      const touchPoints: number[] = [start.index, end.index];
      
      for (let k = 0; k < pivots.lows.length; k++) {
        if (k === i || k === j) continue;
        const point = pivots.lows[k];
        const lineValue = slope * point.index + intercept;
        const distance = Math.abs(point.price - lineValue) / lineValue;
        
        if (distance < maxTouchDistance) {
          touches++;
          touchPoints.push(point.index);
        }
      }
      
      // Check if price breaks the line
      let broken = false;
      let breakIndex: number | undefined;
      
      for (let k = end.index + 1; k < candles.length; k++) {
        const lineValue = slope * k + intercept;
        if (candles[k].close < lineValue * (1 - maxTouchDistance)) {
          broken = true;
          breakIndex = k;
          break;
        }
      }
      
      if (touches >= minTouches) {
        const strength = calculateTrendlineStrength(touches, dx, slope);
        
        trendlines.push({
          start,
          end,
          type: 'support',
          slope,
          intercept,
          touches,
          strength,
          broken,
          breakIndex,
        });
      }
    }
  }
  
  // Find resistance lines from pivot highs
  for (let i = 0; i < pivots.highs.length - 1; i++) {
    for (let j = i + 1; j < pivots.highs.length; j++) {
      const start = pivots.highs[i];
      const end = pivots.highs[j];
      
      const dx = end.index - start.index;
      if (dx < 5) continue;
      
      const slope = (end.price - start.price) / dx;
      const intercept = start.price - slope * start.index;
      
      let touches = 2;
      const touchPoints: number[] = [start.index, end.index];
      
      for (let k = 0; k < pivots.highs.length; k++) {
        if (k === i || k === j) continue;
        const point = pivots.highs[k];
        const lineValue = slope * point.index + intercept;
        const distance = Math.abs(point.price - lineValue) / lineValue;
        
        if (distance < maxTouchDistance) {
          touches++;
          touchPoints.push(point.index);
        }
      }
      
      let broken = false;
      let breakIndex: number | undefined;
      
      for (let k = end.index + 1; k < candles.length; k++) {
        const lineValue = slope * k + intercept;
        if (candles[k].close > lineValue * (1 + maxTouchDistance)) {
          broken = true;
          breakIndex = k;
          break;
        }
      }
      
      if (touches >= minTouches) {
        const strength = calculateTrendlineStrength(touches, dx, slope);
        
        trendlines.push({
          start,
          end,
          type: 'resistance',
          slope,
          intercept,
          touches,
          strength,
          broken,
          breakIndex,
        });
      }
    }
  }
  
  // Sort by strength
  return trendlines.sort((a, b) => b.strength - a.strength);
}

/**
 * Calculate trendline strength based on various factors
 */
function calculateTrendlineStrength(touches: number, length: number, slope: number): number {
  // Base strength from touches
  const touchStrength = Math.min(40, touches * 8);
  
  // Length contribution
  const lengthStrength = Math.min(30, length / 2);
  
  // Slope contribution (steeper = more significant)
  const slopeStrength = Math.min(30, Math.abs(slope) * 10000);
  
  return touchStrength + lengthStrength + slopeStrength;
}

// =============================================================================
// SUPPORT/RESISTANCE LEVELS
// =============================================================================

/**
 * Find horizontal support and resistance levels
 */
export function findSupportResistanceLevels(
  candles: Candle[],
  lookback: number = 50,
  tolerance: number = 0.015, // 1.5%
  minTouches: number = 2
): SupportResistanceLevel[] {
  const levels: Map<number, { count: number; first: number; last: number; type: 'support' | 'resistance' }> = new Map();
  
  // Find potential levels from highs and lows
  for (let i = Math.max(0, candles.length - lookback); i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    
    // Check against existing levels
    let foundHigh = false;
    let foundLow = false;
    
    for (const [levelPrice, data] of levels) {
      // High as resistance
      if (!foundHigh && Math.abs(high - levelPrice) / levelPrice < tolerance) {
        data.count++;
        data.last = i;
        data.type = 'resistance';
        foundHigh = true;
      }
      // Low as support
      if (!foundLow && Math.abs(low - levelPrice) / levelPrice < tolerance) {
        data.count++;
        data.last = i;
        data.type = 'support';
        foundLow = true;
      }
    }
    
    // Create new levels
    if (!foundHigh) {
      levels.set(high, { count: 1, first: i, last: i, type: 'resistance' });
    }
    if (!foundLow) {
      levels.set(low, { count: 1, first: i, last: i, type: 'support' });
    }
  }
  
  // Convert to array and filter
  const result: SupportResistanceLevel[] = [];
  
  for (const [price, data] of levels) {
    if (data.count >= minTouches) {
      result.push({
        price,
        type: data.type,
        touches: data.count,
        firstTouch: data.first,
        lastTouch: data.last,
        strength: Math.min(100, data.count * 15 + (data.last - data.first) / 2),
      });
    }
  }
  
  // Sort by strength and merge close levels
  result.sort((a, b) => b.strength - a.strength);
  
  return mergeCloseLevels(result, tolerance);
}

/**
 * Merge levels that are too close together
 */
function mergeCloseLevels(
  levels: SupportResistanceLevel[],
  tolerance: number
): SupportResistanceLevel[] {
  const merged: SupportResistanceLevel[] = [];
  
  for (const level of levels) {
    let foundClose = false;
    
    for (const existing of merged) {
      if (Math.abs(level.price - existing.price) / existing.price < tolerance) {
        // Merge into existing
        existing.touches += level.touches;
        existing.strength = Math.max(existing.strength, level.strength);
        existing.firstTouch = Math.min(existing.firstTouch, level.firstTouch);
        existing.lastTouch = Math.max(existing.lastTouch, level.lastTouch);
        foundClose = true;
        break;
      }
    }
    
    if (!foundClose) {
      merged.push(level);
    }
  }
  
  return merged;
}

// =============================================================================
// CHANNEL DETECTION
// =============================================================================

/**
 * Detect price channels (parallel trendlines)
 */
export function detectChannels(
  candles: Candle[],
  trendlines: Trendline[],
  tolerance: number = 0.02
): Channel[] {
  const channels: Channel[] = [];
  
  // Find pairs of support and resistance lines with similar slopes
  const supportLines = trendlines.filter(t => t.type === 'support' && !t.broken);
  const resistanceLines = trendlines.filter(t => t.type === 'resistance' && !t.broken);
  
  for (const support of supportLines) {
    for (const resistance of resistanceLines) {
      // Check if slopes are similar (parallel)
      const slopeDiff = Math.abs(support.slope - resistance.slope);
      const avgSlope = (Math.abs(support.slope) + Math.abs(resistance.slope)) / 2;
      
      if (avgSlope > 0 && slopeDiff / avgSlope > tolerance) continue;
      
      // Check if lines overlap in time
      const startIdx = Math.max(support.start.index, resistance.start.index);
      const endIdx = Math.min(support.end.index, resistance.end.index);
      
      if (endIdx <= startIdx) continue;
      
      // Calculate channel properties
      const midIdx = (startIdx + endIdx) / 2;
      const supportValue = support.slope * midIdx + support.intercept;
      const resistanceValue = resistance.slope * midIdx + resistance.intercept;
      
      const width = resistanceValue - supportValue;
      const midpoint = (supportValue + resistanceValue) / 2;
      
      // Determine trend
      let trend: 'bullish' | 'bearish' | 'sideways';
      if (support.slope > 0.0001) {
        trend = 'bullish';
      } else if (support.slope < -0.0001) {
        trend = 'bearish';
      } else {
        trend = 'sideways';
      }
      
      channels.push({
        upperLine: resistance,
        lowerLine: support,
        width,
        midpoint,
        trend,
      });
    }
  }
  
  return channels.sort((a, b) => (b.upperLine.strength + b.lowerLine.strength) - (a.upperLine.strength + a.lowerLine.strength));
}

// =============================================================================
// BREAKOUT DETECTION
// =============================================================================

/**
 * Detect breakouts from trendlines
 */
export function detectBreakouts(
  candles: Candle[],
  trendlines: Trendline[],
  confirmationBars: number = 3,
  minBreakPercent: number = 0.5
): BreakoutSignal[] {
  const signals: BreakoutSignal[] = [];
  
  for (const trendline of trendlines) {
    if (trendline.broken) continue; // Already broken
    
    // Calculate line values
    for (let i = trendline.end.index + 1; i < candles.length; i++) {
      const lineValue = trendline.slope * i + trendline.intercept;
      const close = candles[i].close;
      
      const breakPercent = ((close - lineValue) / lineValue) * 100;
      
      let direction: 'up' | 'down' | null = null;
      
      if (trendline.type === 'resistance' && breakPercent > minBreakPercent) {
        direction = 'up';
      } else if (trendline.type === 'support' && breakPercent < -minBreakPercent) {
        direction = 'down';
      }
      
      if (direction) {
        // Check for confirmation (price stays broken)
        let confirmed = true;
        for (let j = 1; j <= confirmationBars && i + j < candles.length; j++) {
          const confirmLine = trendline.slope * (i + j) + trendline.intercept;
          const confirmClose = candles[i + j].close;
          
          if (direction === 'up' && confirmClose < confirmLine) {
            confirmed = false;
            break;
          }
          if (direction === 'down' && confirmClose > confirmLine) {
            confirmed = false;
            break;
          }
        }
        
        if (confirmed) {
          signals.push({
            trendline,
            direction,
            price: close,
            index: i,
            strength: trendline.strength + Math.abs(breakPercent) * 2,
          });
          
          // Mark trendline as broken
          trendline.broken = true;
          trendline.breakIndex = i;
          break;
        }
      }
    }
  }
  
  return signals.sort((a, b) => b.strength - a.strength);
}

// =============================================================================
// MAIN TRENDLINE ANALYZER CLASS
// =============================================================================

export class TrendlineAnalyzer {
  private candles: Candle[] = [];
  private pivots: PivotPoints | null = null;
  private trendlines: Trendline[] = [];
  private levels: SupportResistanceLevel[] = [];
  private channels: Channel[] = [];
  
  constructor(
    private config: {
      leftBars?: number;
      rightBars?: number;
      minTouches?: number;
      maxTouchDistance?: number;
      srTolerance?: number;
    } = {}
  ) {}
  
  update(candles: Candle[]): void {
    this.candles = candles;
    this.analyze();
  }
  
  private analyze(): void {
    // Detect pivot points
    this.pivots = detectPivotPoints(
      this.candles,
      this.config.leftBars || 3,
      this.config.rightBars || 3
    );
    
    // Find trendlines
    this.trendlines = findTrendlines(
      this.candles,
      this.pivots,
      this.config.minTouches || 2,
      this.config.maxTouchDistance || 0.02
    );
    
    // Find support/resistance levels
    this.levels = findSupportResistanceLevels(
      this.candles,
      50,
      this.config.srTolerance || 0.015
    );
    
    // Detect channels
    this.channels = detectChannels(this.candles, this.trendlines);
  }
  
  getTrendlines(): Trendline[] {
    return this.trendlines;
  }
  
  getActiveTrendlines(): Trendline[] {
    return this.trendlines.filter(t => !t.broken);
  }
  
  getSupportLevels(): SupportResistanceLevel[] {
    return this.levels.filter(l => l.type === 'support');
  }
  
  getResistanceLevels(): SupportResistanceLevel[] {
    return this.levels.filter(l => l.type === 'resistance');
  }
  
  getLevels(): SupportResistanceLevel[] {
    return this.levels;
  }
  
  getChannels(): Channel[] {
    return this.channels;
  }
  
  getCurrentTrendlineValue(trendline: Trendline): number {
    const index = this.candles.length - 1;
    return trendline.slope * index + trendline.intercept;
  }
  
  getDistanceToNearestLevel(price: number): { level: SupportResistanceLevel; distance: number } | null {
    if (this.levels.length === 0) return null;
    
    let nearest = this.levels[0];
    let minDistance = Math.abs(price - nearest.price) / nearest.price;
    
    for (const level of this.levels.slice(1)) {
      const distance = Math.abs(price - level.price) / level.price;
      if (distance < minDistance) {
        minDistance = distance;
        nearest = level;
      }
    }
    
    return { level: nearest, distance: minDistance * 100 };
  }
  
  checkBreakout(): BreakoutSignal | null {
    const signals = detectBreakouts(this.candles, this.trendlines);
    return signals.length > 0 ? signals[0] : null;
  }
  
  /**
   * Get trend analysis summary
   */
  getTrendAnalysis(): {
    trend: 'bullish' | 'bearish' | 'sideways';
    strength: number;
    support: number[];
    resistance: number[];
    channels: number;
  } {
    const activeTrendlines = this.getActiveTrendlines();
    const supportTrendlines = activeTrendlines.filter(t => t.type === 'support');
    const resistanceTrendlines = activeTrendlines.filter(t => t.type === 'resistance');
    
    // Determine trend from trendline slopes
    let bullishScore = 0;
    let bearishScore = 0;
    
    for (const t of activeTrendlines) {
      if (t.slope > 0) bullishScore += t.strength;
      else bearishScore += t.strength;
    }
    
    let trend: 'bullish' | 'bearish' | 'sideways';
    let strength: number;
    
    if (bullishScore > bearishScore * 1.5) {
      trend = 'bullish';
      strength = Math.min(100, bullishScore / activeTrendlines.length);
    } else if (bearishScore > bullishScore * 1.5) {
      trend = 'bearish';
      strength = Math.min(100, bearishScore / activeTrendlines.length);
    } else {
      trend = 'sideways';
      strength = 50;
    }
    
    return {
      trend,
      strength,
      support: supportTrendlines.map(t => this.getCurrentTrendlineValue(t)),
      resistance: resistanceTrendlines.map(t => this.getCurrentTrendlineValue(t)),
      channels: this.channels.length,
    };
  }
}

// Export singleton instance
export const trendlineAnalyzer = new TrendlineAnalyzer();

export default TrendlineAnalyzer;
