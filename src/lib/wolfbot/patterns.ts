/**
 * Candlestick Pattern Recognition
 * Ported from WolfBot
 * 20+ candlestick patterns for trading signal generation
 */

import { Candle } from './indicators';

// ============== Types ==============

export type PatternSignal = 'bullish' | 'bearish' | 'neutral' | 'continuation' | 'reversal';

export interface PatternResult {
  name: string;
  signal: PatternSignal;
  confidence: number; // 0-1
  candles: number; // Number of candles in pattern
  description: string;
}

export interface PatternDetector {
  name: string;
  candles: number;
  detect(candles: Candle[]): PatternResult | null;
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

function isDoji(candle: Candle, threshold: number = 0.1): boolean {
  const range = totalRange(candle);
  return range > 0 && bodySize(candle) / range < threshold;
}

function gap(current: Candle, previous: Candle): { up: boolean; down: boolean; size: number } {
  const up = current.low > previous.high;
  const down = current.high < previous.low;
  const size = up ? current.low - previous.high : down ? previous.low - current.high : 0;
  return { up, down, size };
}

// ============== Single Candle Patterns ==============

export class DojiPattern implements PatternDetector {
  name = 'Doji';
  candles = 1;

  detect(candles: Candle[]): PatternResult | null {
    const c = candles[candles.length - 1];
    if (!isDoji(c, 0.05)) return null;

    return {
      name: 'Doji',
      signal: 'neutral',
      confidence: 0.6,
      candles: 1,
      description: 'Indecision - open and close nearly equal',
    };
  }
}

export class DragonflyDojiPattern implements PatternDetector {
  name = 'Dragonfly Doji';
  candles = 1;

  detect(candles: Candle[]): PatternResult | null {
    const c = candles[candles.length - 1];
    const range = totalRange(c);

    if (range === 0) return null;

    // Doji with long lower wick and no upper wick
    const lowerWickRatio = lowerWick(c) / range;
    const upperWickRatio = upperWick(c) / range;
    const bodyRatio = bodySize(c) / range;

    if (bodyRatio < 0.1 && lowerWickRatio > 0.6 && upperWickRatio < 0.1) {
      return {
        name: 'Dragonfly Doji',
        signal: 'bullish',
        confidence: 0.75,
        candles: 1,
        description: 'Bullish reversal - strong buying pressure after selling',
      };
    }

    return null;
  }
}

export class GravestoneDojiPattern implements PatternDetector {
  name = 'Gravestone Doji';
  candles = 1;

  detect(candles: Candle[]): PatternResult | null {
    const c = candles[candles.length - 1];
    const range = totalRange(c);

    if (range === 0) return null;

    const lowerWickRatio = lowerWick(c) / range;
    const upperWickRatio = upperWick(c) / range;
    const bodyRatio = bodySize(c) / range;

    if (bodyRatio < 0.1 && upperWickRatio > 0.6 && lowerWickRatio < 0.1) {
      return {
        name: 'Gravestone Doji',
        signal: 'bearish',
        confidence: 0.75,
        candles: 1,
        description: 'Bearish reversal - rejection of higher prices',
      };
    }

    return null;
  }
}

export class HammerPattern implements PatternDetector {
  name = 'Hammer';
  candles = 1;

  detect(candles: Candle[]): PatternResult | null {
    const c = candles[candles.length - 1];
    const range = totalRange(c);

    if (range === 0) return null;

    const lowerWickRatio = lowerWick(c) / range;
    const upperWickRatio = upperWick(c) / range;
    const bodyRatio = bodySize(c) / range;

    // Small body at top, long lower wick, minimal upper wick
    if (lowerWickRatio > 0.6 && bodyRatio < 0.35 && upperWickRatio < 0.1) {
      return {
        name: 'Hammer',
        signal: 'bullish',
        confidence: 0.7,
        candles: 1,
        description: 'Bullish reversal - buyers stepped in after selling',
      };
    }

    return null;
  }
}

export class InvertedHammerPattern implements PatternDetector {
  name = 'Inverted Hammer';
  candles = 1;

  detect(candles: Candle[]): PatternResult | null {
    const c = candles[candles.length - 1];
    const range = totalRange(c);

    if (range === 0) return null;

    const lowerWickRatio = lowerWick(c) / range;
    const upperWickRatio = upperWick(c) / range;
    const bodyRatio = bodySize(c) / range;

    // Small body at bottom, long upper wick, minimal lower wick
    if (upperWickRatio > 0.6 && bodyRatio < 0.35 && lowerWickRatio < 0.1) {
      return {
        name: 'Inverted Hammer',
        signal: 'bullish',
        confidence: 0.65,
        candles: 1,
        description: 'Potential bullish reversal - buyers pushing up',
      };
    }

    return null;
  }
}

export class HangingManPattern implements PatternDetector {
  name = 'Hanging Man';
  candles = 2;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 2) return null;

    const prev = candles[candles.length - 2];
    const c = candles[candles.length - 1];
    const range = totalRange(c);

    if (range === 0) return null;

    // Must be in uptrend
    if (!isBullish(prev)) return null;

    const lowerWickRatio = lowerWick(c) / range;
    const upperWickRatio = upperWick(c) / range;
    const bodyRatio = bodySize(c) / range;

    if (lowerWickRatio > 0.6 && bodyRatio < 0.35 && upperWickRatio < 0.1) {
      return {
        name: 'Hanging Man',
        signal: 'bearish',
        confidence: 0.7,
        candles: 1,
        description: 'Bearish reversal in uptrend - potential top',
      };
    }

    return null;
  }
}

export class ShootingStarPattern implements PatternDetector {
  name = 'Shooting Star';
  candles = 2;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 2) return null;

    const prev = candles[candles.length - 2];
    const c = candles[candles.length - 1];
    const range = totalRange(c);

    if (range === 0) return null;

    // Must be in uptrend
    if (!isBullish(prev)) return null;

    const lowerWickRatio = lowerWick(c) / range;
    const upperWickRatio = upperWick(c) / range;
    const bodyRatio = bodySize(c) / range;

    // Small body at bottom, long upper wick
    if (upperWickRatio > 0.6 && bodyRatio < 0.35 && lowerWickRatio < 0.1) {
      return {
        name: 'Shooting Star',
        signal: 'bearish',
        confidence: 0.75,
        candles: 1,
        description: 'Bearish reversal - rejection of higher prices in uptrend',
      };
    }

    return null;
  }
}

export class MarubozuPattern implements PatternDetector {
  name = 'Marubozu';
  candles = 1;

  detect(candles: Candle[]): PatternResult | null {
    const c = candles[candles.length - 1];
    const range = totalRange(c);

    if (range === 0) return null;

    const wickRatio = (upperWick(c) + lowerWick(c)) / range;

    // No or minimal wicks
    if (wickRatio < 0.1 && bodySize(c) / range > 0.9) {
      return {
        name: 'Marubozu',
        signal: isBullish(c) ? 'bullish' : 'bearish',
        confidence: 0.8,
        candles: 1,
        description: isBullish(c)
          ? 'Bullish continuation - strong buying pressure'
          : 'Bearish continuation - strong selling pressure',
      };
    }

    return null;
  }
}

export class SpinningTopPattern implements PatternDetector {
  name = 'Spinning Top';
  candles = 1;

  detect(candles: Candle[]): PatternResult | null {
    const c = candles[candles.length - 1];
    const range = totalRange(c);

    if (range === 0) return null;

    const bodyRatio = bodySize(c) / range;
    const upperWickRatio = upperWick(c) / range;
    const lowerWickRatio = lowerWick(c) / range;

    // Small body, wicks on both sides
    if (bodyRatio < 0.35 && upperWickRatio > 0.25 && lowerWickRatio > 0.25) {
      return {
        name: 'Spinning Top',
        signal: 'neutral',
        confidence: 0.5,
        candles: 1,
        description: 'Indecision - buyers and sellers balanced',
      };
    }

    return null;
  }
}

// ============== Two Candle Patterns ==============

export class BullishEngulfingPattern implements PatternDetector {
  name = 'Bullish Engulfing';
  candles = 2;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 2) return null;

    const prev = candles[candles.length - 2];
    const c = candles[candles.length - 1];

    // Previous candle bearish, current bullish
    if (!isBearish(prev) || !isBullish(c)) return null;

    // Current candle engulfs previous
    if (c.open <= prev.close && c.close >= prev.open) {
      return {
        name: 'Bullish Engulfing',
        signal: 'bullish',
        confidence: 0.8,
        candles: 2,
        description: 'Strong bullish reversal - buyers take control',
      };
    }

    return null;
  }
}

export class BearishEngulfingPattern implements PatternDetector {
  name = 'Bearish Engulfing';
  candles = 2;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 2) return null;

    const prev = candles[candles.length - 2];
    const c = candles[candles.length - 1];

    // Previous candle bullish, current bearish
    if (!isBullish(prev) || !isBearish(c)) return null;

    // Current candle engulfs previous
    if (c.open >= prev.close && c.close <= prev.open) {
      return {
        name: 'Bearish Engulfing',
        signal: 'bearish',
        confidence: 0.8,
        candles: 2,
        description: 'Strong bearish reversal - sellers take control',
      };
    }

    return null;
  }
}

export class PiercingPattern implements PatternDetector {
  name = 'Piercing Line';
  candles = 2;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 2) return null;

    const prev = candles[candles.length - 2];
    const c = candles[candles.length - 1];

    // Previous bearish, current bullish
    if (!isBearish(prev) || !isBullish(c)) return null;

    // Opens below previous low, closes above midpoint of previous body
    const prevMidpoint = (prev.open + prev.close) / 2;

    if (c.open < prev.low && c.close > prevMidpoint && c.close < prev.open) {
      return {
        name: 'Piercing Line',
        signal: 'bullish',
        confidence: 0.7,
        candles: 2,
        description: 'Bullish reversal - buyers push above midpoint',
      };
    }

    return null;
  }
}

export class DarkCloudCoverPattern implements PatternDetector {
  name = 'Dark Cloud Cover';
  candles = 2;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 2) return null;

    const prev = candles[candles.length - 2];
    const c = candles[candles.length - 1];

    // Previous bullish, current bearish
    if (!isBullish(prev) || !isBearish(c)) return null;

    // Opens above previous high, closes below midpoint of previous body
    const prevMidpoint = (prev.open + prev.close) / 2;

    if (c.open > prev.high && c.close < prevMidpoint && c.close > prev.open) {
      return {
        name: 'Dark Cloud Cover',
        signal: 'bearish',
        confidence: 0.7,
        candles: 2,
        description: 'Bearish reversal - sellers push below midpoint',
      };
    }

    return null;
  }
}

export class TweezerTopPattern implements PatternDetector {
  name = 'Tweezer Top';
  candles = 2;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 2) return null;

    const prev = candles[candles.length - 2];
    const c = candles[candles.length - 1];

    // Both candles have similar highs (within 0.1% of each other)
    const highDiff = Math.abs(prev.high - c.high) / prev.high;

    if (highDiff < 0.001) {
      return {
        name: 'Tweezer Top',
        signal: 'bearish',
        confidence: 0.65,
        candles: 2,
        description: 'Bearish reversal - double rejection at same level',
      };
    }

    return null;
  }
}

export class TweezerBottomPattern implements PatternDetector {
  name = 'Tweezer Bottom';
  candles = 2;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 2) return null;

    const prev = candles[candles.length - 2];
    const c = candles[candles.length - 1];

    // Both candles have similar lows (within 0.1% of each other)
    const lowDiff = Math.abs(prev.low - c.low) / prev.low;

    if (lowDiff < 0.001) {
      return {
        name: 'Tweezer Bottom',
        signal: 'bullish',
        confidence: 0.65,
        candles: 2,
        description: 'Bullish reversal - double support at same level',
      };
    }

    return null;
  }
}

// ============== Three Candle Patterns ==============

export class MorningStarPattern implements PatternDetector {
  name = 'Morning Star';
  candles = 3;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 3) return null;

    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 1];

    // First: Large bearish
    // Second: Small body (star) below first, can be bullish or bearish
    // Third: Large bullish, closes well into first candle's body

    if (!isBearish(c1)) return null;

    const c1Body = bodySize(c1);
    const c2Body = bodySize(c2);
    const c3Body = bodySize(c3);

    // c2 is a small body star
    if (c2Body > c1Body * 0.3) return null;

    // c2 gaps down from c1
    if (c2.high >= c1.low) return null;

    // c3 is bullish and closes into c1 body
    if (!isBullish(c3)) return null;

    if (c3.close > c1.open + (c1.open - c1.close) * 0.5) {
      return {
        name: 'Morning Star',
        signal: 'bullish',
        confidence: 0.85,
        candles: 3,
        description: 'Strong bullish reversal pattern',
      };
    }

    return null;
  }
}

export class EveningStarPattern implements PatternDetector {
  name = 'Evening Star';
  candles = 3;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 3) return null;

    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 1];

    // First: Large bullish
    // Second: Small body (star) above first
    // Third: Large bearish, closes well into first candle's body

    if (!isBullish(c1)) return null;

    const c1Body = bodySize(c1);
    const c2Body = bodySize(c2);
    const c3Body = bodySize(c3);

    // c2 is a small body star
    if (c2Body > c1Body * 0.3) return null;

    // c2 gaps up from c1
    if (c2.low <= c1.high) return null;

    // c3 is bearish and closes into c1 body
    if (!isBearish(c3)) return null;

    if (c3.close < c1.open - (c1.close - c1.open) * 0.5) {
      return {
        name: 'Evening Star',
        signal: 'bearish',
        confidence: 0.85,
        candles: 3,
        description: 'Strong bearish reversal pattern',
      };
    }

    return null;
  }
}

export class ThreeWhiteSoldiersPattern implements PatternDetector {
  name = 'Three White Soldiers';
  candles = 3;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 3) return null;

    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 1];

    // Three consecutive bullish candles
    if (!isBullish(c1) || !isBullish(c2) || !isBullish(c3)) return null;

    // Each closes higher than the previous
    if (c2.close <= c1.close || c3.close <= c2.close) return null;

    // Each opens within previous body
    if (c2.open < c1.open || c2.open > c1.close) return null;
    if (c3.open < c2.open || c3.open > c2.close) return null;

    // Small upper wicks (closing near high)
    if (upperWick(c3) / totalRange(c3) > 0.3) return null;

    return {
      name: 'Three White Soldiers',
      signal: 'bullish',
      confidence: 0.85,
      candles: 3,
      description: 'Strong bullish continuation pattern',
    };
  }
}

export class ThreeBlackCrowsPattern implements PatternDetector {
  name = 'Three Black Crows';
  candles = 3;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 3) return null;

    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 1];

    // Three consecutive bearish candles
    if (!isBearish(c1) || !isBearish(c2) || !isBearish(c3)) return null;

    // Each closes lower than the previous
    if (c2.close >= c1.close || c3.close >= c2.close) return null;

    // Each opens within previous body
    if (c2.open > c1.open || c2.open < c1.close) return null;
    if (c3.open > c2.open || c3.open < c2.close) return null;

    // Small lower wicks (closing near low)
    if (lowerWick(c3) / totalRange(c3) > 0.3) return null;

    return {
      name: 'Three Black Crows',
      signal: 'bearish',
      confidence: 0.85,
      candles: 3,
      description: 'Strong bearish continuation pattern',
    };
  }
}

export class TriStarPattern implements PatternDetector {
  name = 'Tri-Star';
  candles = 3;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 3) return null;

    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 1];

    // All three are dojis
    if (!isDoji(c1, 0.1) || !isDoji(c2, 0.1) || !isDoji(c3, 0.1)) return null;

    // Check for gaps
    const gap1 = gap(c2, c1);
    const gap2 = gap(c3, c2);

    // Bullish: gap down then gap up
    if (gap1.down && gap2.up) {
      return {
        name: 'Bullish Tri-Star',
        signal: 'bullish',
        confidence: 0.75,
        candles: 3,
        description: 'Bullish reversal with three dojis',
      };
    }

    // Bearish: gap up then gap down
    if (gap1.up && gap2.down) {
      return {
        name: 'Bearish Tri-Star',
        signal: 'bearish',
        confidence: 0.75,
        candles: 3,
        description: 'Bearish reversal with three dojis',
      };
    }

    return null;
  }
}

export class AbandonedBabyPattern implements PatternDetector {
  name = 'Abandoned Baby';
  candles = 3;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 3) return null;

    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    const c3 = candles[candles.length - 1];

    // c2 must be a doji
    if (!isDoji(c2, 0.1)) return null;

    // Check gaps
    const gap1 = gap(c2, c1);
    const gap2 = gap(c3, c2);

    // Bullish: bearish candle, gap down doji, gap up bullish
    if (isBearish(c1) && gap1.down && gap2.up && isBullish(c3)) {
      return {
        name: 'Bullish Abandoned Baby',
        signal: 'bullish',
        confidence: 0.85,
        candles: 3,
        description: 'Rare bullish reversal pattern',
      };
    }

    // Bearish: bullish candle, gap up doji, gap down bearish
    if (isBullish(c1) && gap1.up && gap2.down && isBearish(c3)) {
      return {
        name: 'Bearish Abandoned Baby',
        signal: 'bearish',
        confidence: 0.85,
        candles: 3,
        description: 'Rare bearish reversal pattern',
      };
    }

    return null;
  }
}

export class RisingThreeMethodsPattern implements PatternDetector {
  name = 'Rising Three Methods';
  candles = 5;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 5) return null;

    const c1 = candles[candles.length - 5];
    const c2 = candles[candles.length - 4];
    const c3 = candles[candles.length - 3];
    const c4 = candles[candles.length - 2];
    const c5 = candles[candles.length - 1];

    // First and last are bullish
    if (!isBullish(c1) || !isBullish(c5)) return null;

    // Middle three are bearish (or small)
    const middleBearish = [c2, c3, c4].every(c => isBearish(c) || bodySize(c) < bodySize(c1) * 0.5);
    if (!middleBearish) return null;

    // Last candle closes above first
    if (c5.close <= c1.close) return null;

    // Middle candles stay within range of first
    const inRange = [c2, c3, c4].every(c => c.high <= c1.high && c.low >= c1.low);
    if (!inRange) return null;

    return {
      name: 'Rising Three Methods',
      signal: 'bullish',
      confidence: 0.75,
      candles: 5,
      description: 'Bullish continuation pattern',
    };
  }
}

export class FallingThreeMethodsPattern implements PatternDetector {
  name = 'Falling Three Methods';
  candles = 5;

  detect(candles: Candle[]): PatternResult | null {
    if (candles.length < 5) return null;

    const c1 = candles[candles.length - 5];
    const c2 = candles[candles.length - 4];
    const c3 = candles[candles.length - 3];
    const c4 = candles[candles.length - 2];
    const c5 = candles[candles.length - 1];

    // First and last are bearish
    if (!isBearish(c1) || !isBearish(c5)) return null;

    // Middle three are bullish (or small)
    const middleBullish = [c2, c3, c4].every(c => isBullish(c) || bodySize(c) < bodySize(c1) * 0.5);
    if (!middleBullish) return null;

    // Last candle closes below first
    if (c5.close >= c1.close) return null;

    // Middle candles stay within range of first
    const inRange = [c2, c3, c4].every(c => c.high <= c1.high && c.low >= c1.low);
    if (!inRange) return null;

    return {
      name: 'Falling Three Methods',
      signal: 'bearish',
      confidence: 0.75,
      candles: 5,
      description: 'Bearish continuation pattern',
    };
  }
}

// ============== Pattern Registry ==============

export const PATTERN_REGISTRY: PatternDetector[] = [
  // Single candle
  new DojiPattern(),
  new DragonflyDojiPattern(),
  new GravestoneDojiPattern(),
  new HammerPattern(),
  new InvertedHammerPattern(),
  new HangingManPattern(),
  new ShootingStarPattern(),
  new MarubozuPattern(),
  new SpinningTopPattern(),

  // Two candle
  new BullishEngulfingPattern(),
  new BearishEngulfingPattern(),
  new PiercingPattern(),
  new DarkCloudCoverPattern(),
  new TweezerTopPattern(),
  new TweezerBottomPattern(),

  // Three+ candle
  new MorningStarPattern(),
  new EveningStarPattern(),
  new ThreeWhiteSoldiersPattern(),
  new ThreeBlackCrowsPattern(),
  new TriStarPattern(),
  new AbandonedBabyPattern(),

  // Five candle
  new RisingThreeMethodsPattern(),
  new FallingThreeMethodsPattern(),
];

// ============== Pattern Scanner ==============

export class PatternScanner {
  private patterns: PatternDetector[];

  constructor(patterns: PatternDetector[] = PATTERN_REGISTRY) {
    this.patterns = patterns;
  }

  /**
   * Scan for all patterns in the given candles
   */
  scan(candles: Candle[]): PatternResult[] {
    const results: PatternResult[] = [];

    for (const pattern of this.patterns) {
      if (candles.length >= pattern.candles) {
        const result = pattern.detect(candles);
        if (result) {
          results.push(result);
        }
      }
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get the strongest pattern
   */
  getStrongestPattern(candles: Candle[]): PatternResult | null {
    const patterns = this.scan(candles);
    return patterns.length > 0 ? patterns[0] : null;
  }

  /**
   * Get all bullish patterns
   */
  getBullishPatterns(candles: Candle[]): PatternResult[] {
    return this.scan(candles).filter(p => p.signal === 'bullish');
  }

  /**
   * Get all bearish patterns
   */
  getBearishPatterns(candles: Candle[]): PatternResult[] {
    return this.scan(candles).filter(p => p.signal === 'bearish');
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: PatternDetector): void {
    this.patterns.push(pattern);
  }
}

// ============== Export ==============

export function createPatternScanner(): PatternScanner {
  return new PatternScanner();
}

export function detectPatterns(candles: Candle[]): PatternResult[] {
  const scanner = new PatternScanner();
  return scanner.scan(candles);
}
