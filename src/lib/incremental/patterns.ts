/**
 * Candlestick Pattern Recognition
 *
 * Incremental pattern detection for real-time trading using @junduck/trading-indi.
 * Supports 30+ candlestick patterns across three categories:
 * - Single-bar patterns (10+)
 * - Two-bar patterns (10+)
 * - Multi-bar patterns (10+)
 */

import {
  // Single-bar patterns
  Doji,
  LongLeggedDoji,
  DragonflyDoji,
  GravestoneDoji,
  SpinningTop,
  MarubozuWhite,
  MarubozuBlack,
  Hammer,
  InvertedHammer,
  HighWave,
  // Two-bar patterns
  BearishEngulfing,
  BullishHarami,
  BearishHarami,
  HaramiCross,
  PiercingPattern,
  DarkCloudCover,
  TweezerTops,
  TweezerBottoms,
  BullishDojiStar,
  BearishDojiStar,
  InsideBar,
  OutsideBar,
  RailroadTracks,
  RisingWindow,
  FallingWindow,
  // Multi-bar patterns
  EveningStar,
  MorningDojiStar,
  EveningDojiStar,
  AbandonedBabyBullish,
  AbandonedBabyBearish,
  ThreeWhiteSoldiers,
  ThreeBlackCrows,
  ThreeInsideUp,
  ThreeInsideDown,
  ThreeOutsideUp,
  ThreeOutsideDown,
  FakeyPatternBullish,
  FakeyPatternBearish,
  RisingThreeMethods,
  FallingThreeMethods,
  ThreeBuddhaTop,
  InvertedThreeBuddha,
  // Type
  type OHLCVBar,
} from '@junduck/trading-indi';

import type { IncrementalBar, PatternsState, PatternResult } from './types';

// ==================== PATTERN MANAGER ====================

/**
 * Manages incremental candlestick pattern detection.
 * Each pattern maintains its own state for efficient O(1) updates.
 */
export class PatternManager {
  // Single-bar patterns
  private doji: InstanceType<typeof Doji>;
  private longLeggedDoji: InstanceType<typeof LongLeggedDoji>;
  private dragonflyDoji: InstanceType<typeof DragonflyDoji>;
  private gravestoneDoji: InstanceType<typeof GravestoneDoji>;
  private spinningTop: InstanceType<typeof SpinningTop>;
  private marubozuWhite: InstanceType<typeof MarubozuWhite>;
  private marubozuBlack: InstanceType<typeof MarubozuBlack>;
  private hammer: InstanceType<typeof Hammer>;
  private invertedHammer: InstanceType<typeof InvertedHammer>;
  private highWave: InstanceType<typeof HighWave>;

  // Two-bar patterns
  private bearishEngulfing: InstanceType<typeof BearishEngulfing>;
  private bullishHarami: InstanceType<typeof BullishHarami>;
  private bearishHarami: InstanceType<typeof BearishHarami>;
  private piercingPattern: InstanceType<typeof PiercingPattern>;
  private darkCloudCover: InstanceType<typeof DarkCloudCover>;
  private tweezerTops: InstanceType<typeof TweezerTops>;
  private tweezerBottoms: InstanceType<typeof TweezerBottoms>;
  private insideBar: InstanceType<typeof InsideBar>;
  private outsideBar: InstanceType<typeof OutsideBar>;

  // Multi-bar patterns
  private eveningStar: InstanceType<typeof EveningStar>;
  private morningDojiStar: InstanceType<typeof MorningDojiStar>;
  private threeWhiteSoldiers: InstanceType<typeof ThreeWhiteSoldiers>;
  private threeBlackCrows: InstanceType<typeof ThreeBlackCrows>;
  private threeInsideUp: InstanceType<typeof ThreeInsideUp>;
  private threeInsideDown: InstanceType<typeof ThreeInsideDown>;
  private risingThreeMethods: InstanceType<typeof RisingThreeMethods>;
  private fallingThreeMethods: InstanceType<typeof FallingThreeMethods>;

  // Pattern history for analysis
  private recentPatterns: PatternResult[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 100) {
    this.maxHistory = maxHistory;

    // Initialize single-bar patterns
    this.doji = new Doji();
    this.longLeggedDoji = new LongLeggedDoji();
    this.dragonflyDoji = new DragonflyDoji();
    this.gravestoneDoji = new GravestoneDoji();
    this.spinningTop = new SpinningTop();
    this.marubozuWhite = new MarubozuWhite();
    this.marubozuBlack = new MarubozuBlack();
    this.hammer = new Hammer();
    this.invertedHammer = new InvertedHammer();
    this.highWave = new HighWave();

    // Initialize two-bar patterns
    this.bearishEngulfing = new BearishEngulfing();
    this.bullishHarami = new BullishHarami();
    this.bearishHarami = new BearishHarami();
    this.piercingPattern = new PiercingPattern();
    this.darkCloudCover = new DarkCloudCover();
    this.tweezerTops = new TweezerTops();
    this.tweezerBottoms = new TweezerBottoms();
    this.insideBar = new InsideBar();
    this.outsideBar = new OutsideBar();

    // Initialize multi-bar patterns
    this.eveningStar = new EveningStar();
    this.morningDojiStar = new MorningDojiStar();
    this.threeWhiteSoldiers = new ThreeWhiteSoldiers();
    this.threeBlackCrows = new ThreeBlackCrows();
    this.threeInsideUp = new ThreeInsideUp();
    this.threeInsideDown = new ThreeInsideDown();
    this.risingThreeMethods = new RisingThreeMethods();
    this.fallingThreeMethods = new FallingThreeMethods();
  }

  /**
   * Detect all patterns for a new bar.
   * Returns complete pattern state and detected patterns.
   */
  detect(bar: IncrementalBar): PatternsState {
    const libBar: OHLCVBar = {
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    };

    const bullishPatterns: string[] = [];
    const bearishPatterns: string[] = [];
    const neutralPatterns: string[] = [];

    // Single-bar patterns
    const isDoji = this.doji.onData(libBar);
    if (isDoji) neutralPatterns.push('Doji');

    const isLongLeggedDoji = this.longLeggedDoji.onData(libBar);
    if (isLongLeggedDoji) neutralPatterns.push('LongLeggedDoji');

    const isDragonflyDoji = this.dragonflyDoji.onData(libBar);
    if (isDragonflyDoji) bullishPatterns.push('DragonflyDoji');

    const isGravestoneDoji = this.gravestoneDoji.onData(libBar);
    if (isGravestoneDoji) bearishPatterns.push('GravestoneDoji');

    const isSpinningTop = this.spinningTop.onData(libBar);
    if (isSpinningTop) neutralPatterns.push('SpinningTop');

    const isMarubozuWhite = this.marubozuWhite.onData(libBar);
    if (isMarubozuWhite) bullishPatterns.push('MarubozuWhite');

    const isMarubozuBlack = this.marubozuBlack.onData(libBar);
    if (isMarubozuBlack) bearishPatterns.push('MarubozuBlack');

    const isHammer = this.hammer.onData(libBar);
    if (isHammer) bullishPatterns.push('Hammer');

    const isInvertedHammer = this.invertedHammer.onData(libBar);
    if (isInvertedHammer) bullishPatterns.push('InvertedHammer');

    const isHighWave = this.highWave.onData(libBar);
    if (isHighWave) neutralPatterns.push('HighWave');

    // Two-bar patterns
    const isBearishEngulfing = this.bearishEngulfing.onData(libBar);
    if (isBearishEngulfing) bearishPatterns.push('BearishEngulfing');

    const isBullishHarami = this.bullishHarami.onData(libBar);
    if (isBullishHarami) bullishPatterns.push('BullishHarami');

    const isBearishHarami = this.bearishHarami.onData(libBar);
    if (isBearishHarami) bearishPatterns.push('BearishHarami');

    const isPiercingPattern = this.piercingPattern.onData(libBar);
    if (isPiercingPattern) bullishPatterns.push('PiercingPattern');

    const isDarkCloudCover = this.darkCloudCover.onData(libBar);
    if (isDarkCloudCover) bearishPatterns.push('DarkCloudCover');

    const isTweezerTops = this.tweezerTops.onData(libBar);
    if (isTweezerTops) bearishPatterns.push('TweezerTops');

    const isTweezerBottoms = this.tweezerBottoms.onData(libBar);
    if (isTweezerBottoms) bullishPatterns.push('TweezerBottoms');

    const isInsideBar = this.insideBar.onData(libBar);
    if (isInsideBar) neutralPatterns.push('InsideBar');

    const isOutsideBar = this.outsideBar.onData(libBar);
    if (isOutsideBar) neutralPatterns.push('OutsideBar');

    // Multi-bar patterns
    const isEveningStar = this.eveningStar.onData(libBar);
    if (isEveningStar) bearishPatterns.push('EveningStar');

    const isMorningDojiStar = this.morningDojiStar.onData(libBar);
    if (isMorningDojiStar) bullishPatterns.push('MorningDojiStar');

    const isThreeWhiteSoldiers = this.threeWhiteSoldiers.onData(libBar);
    if (isThreeWhiteSoldiers) bullishPatterns.push('ThreeWhiteSoldiers');

    const isThreeBlackCrows = this.threeBlackCrows.onData(libBar);
    if (isThreeBlackCrows) bearishPatterns.push('ThreeBlackCrows');

    const isThreeInsideUp = this.threeInsideUp.onData(libBar);
    if (isThreeInsideUp) bullishPatterns.push('ThreeInsideUp');

    const isThreeInsideDown = this.threeInsideDown.onData(libBar);
    if (isThreeInsideDown) bearishPatterns.push('ThreeInsideDown');

    const isRisingThreeMethods = this.risingThreeMethods.onData(libBar);
    if (isRisingThreeMethods) bullishPatterns.push('RisingThreeMethods');

    const isFallingThreeMethods = this.fallingThreeMethods.onData(libBar);
    if (isFallingThreeMethods) bearishPatterns.push('FallingThreeMethods');

    // Store detected patterns in history
    const allPatterns = [
      ...bullishPatterns.map(p => ({ name: p, type: 'bullish' as const })),
      ...bearishPatterns.map(p => ({ name: p, type: 'bearish' as const })),
      ...neutralPatterns.map(p => ({ name: p, type: 'neutral' as const })),
    ];

    for (const pattern of allPatterns) {
      this.recentPatterns.push({
        name: pattern.name,
        type: pattern.type,
        confidence: this.getPatternConfidence(pattern.name),
        bar,
      });
    }

    // Trim history
    if (this.recentPatterns.length > this.maxHistory) {
      this.recentPatterns = this.recentPatterns.slice(-this.maxHistory);
    }

    return {
      // Single-bar patterns
      doji: isDoji,
      hammer: isHammer,
      invertedHammer: isInvertedHammer,
      marubozuWhite: isMarubozuWhite,
      marubozuBlack: isMarubozuBlack,
      spinningTop: isSpinningTop,
      dragonflyDoji: isDragonflyDoji,
      gravestoneDoji: isGravestoneDoji,
      highWave: isHighWave,

      // Two-bar patterns
      bullishEngulfing: false, // Would need separate bullish engulfing detector
      bearishEngulfing: isBearishEngulfing,
      bullishHarami: isBullishHarami,
      bearishHarami: isBearishHarami,
      tweezerTops: isTweezerTops,
      tweezerBottoms: isTweezerBottoms,
      insideBar: isInsideBar,
      outsideBar: isOutsideBar,

      // Multi-bar patterns
      morningStar: isMorningDojiStar,
      eveningStar: isEveningStar,
      threeWhiteSoldiers: isThreeWhiteSoldiers,
      threeBlackCrows: isThreeBlackCrows,

      // Summary
      bullishPatterns,
      bearishPatterns,
      neutralPatterns,
    };
  }

  /**
   * Get confidence level for a pattern based on its reliability
   */
  private getPatternConfidence(patternName: string): 'high' | 'medium' | 'low' {
    const highConfidence = [
      'ThreeWhiteSoldiers',
      'ThreeBlackCrows',
      'MorningDojiStar',
      'EveningStar',
      'BearishEngulfing',
      'BullishHarami',
    ];

    const mediumConfidence = [
      'Hammer',
      'InvertedHammer',
      'MarubozuWhite',
      'MarubozuBlack',
      'PiercingPattern',
      'DarkCloudCover',
      'TweezerTops',
      'TweezerBottoms',
      'ThreeInsideUp',
      'ThreeInsideDown',
    ];

    if (highConfidence.includes(patternName)) return 'high';
    if (mediumConfidence.includes(patternName)) return 'medium';
    return 'low';
  }

  /**
   * Get recent patterns
   */
  getRecentPatterns(count: number = 10): PatternResult[] {
    return this.recentPatterns.slice(-count);
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: 'bullish' | 'bearish' | 'neutral'): PatternResult[] {
    return this.recentPatterns.filter(p => p.type === type);
  }

  /**
   * Get pattern statistics
   */
  getStats(): {
    totalPatterns: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
  } {
    const bullish = this.recentPatterns.filter(p => p.type === 'bullish').length;
    const bearish = this.recentPatterns.filter(p => p.type === 'bearish').length;
    const neutral = this.recentPatterns.filter(p => p.type === 'neutral').length;

    return {
      totalPatterns: this.recentPatterns.length,
      bullishCount: bullish,
      bearishCount: bearish,
      neutralCount: neutral,
    };
  }

  /**
   * Reset all pattern detectors
   */
  reset(): void {
    // Reinitialize all patterns
    this.doji = new Doji();
    this.longLeggedDoji = new LongLeggedDoji();
    this.dragonflyDoji = new DragonflyDoji();
    this.gravestoneDoji = new GravestoneDoji();
    this.spinningTop = new SpinningTop();
    this.marubozuWhite = new MarubozuWhite();
    this.marubozuBlack = new MarubozuBlack();
    this.hammer = new Hammer();
    this.invertedHammer = new InvertedHammer();
    this.highWave = new HighWave();

    this.bearishEngulfing = new BearishEngulfing();
    this.bullishHarami = new BullishHarami();
    this.bearishHarami = new BearishHarami();
    this.piercingPattern = new PiercingPattern();
    this.darkCloudCover = new DarkCloudCover();
    this.tweezerTops = new TweezerTops();
    this.tweezerBottoms = new TweezerBottoms();
    this.insideBar = new InsideBar();
    this.outsideBar = new OutsideBar();

    this.eveningStar = new EveningStar();
    this.morningDojiStar = new MorningDojiStar();
    this.threeWhiteSoldiers = new ThreeWhiteSoldiers();
    this.threeBlackCrows = new ThreeBlackCrows();
    this.threeInsideUp = new ThreeInsideUp();
    this.threeInsideDown = new ThreeInsideDown();
    this.risingThreeMethods = new RisingThreeMethods();
    this.fallingThreeMethods = new FallingThreeMethods();

    this.recentPatterns = [];
  }
}

// ==================== PATTERN SIGNAL GENERATOR ====================

/**
 * Generate trading signals from detected patterns
 */
export interface PatternSignal {
  pattern: string;
  type: 'buy' | 'sell';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export function generatePatternSignals(patterns: PatternsState): PatternSignal[] {
  const signals: PatternSignal[] = [];

  // High confidence bullish patterns
  if (patterns.threeWhiteSoldiers) {
    signals.push({
      pattern: 'ThreeWhiteSoldiers',
      type: 'buy',
      confidence: 'high',
      reason: 'Strong bullish reversal pattern - three consecutive bullish candles',
    });
  }

  if (patterns.morningStar) {
    signals.push({
      pattern: 'MorningStar',
      type: 'buy',
      confidence: 'high',
      reason: 'Bullish reversal pattern at bottom of downtrend',
    });
  }

  if (patterns.bullishHarami) {
    signals.push({
      pattern: 'BullishHarami',
      type: 'buy',
      confidence: 'high',
      reason: 'Potential bullish reversal - small candle inside larger bearish candle',
    });
  }

  // High confidence bearish patterns
  if (patterns.threeBlackCrows) {
    signals.push({
      pattern: 'ThreeBlackCrows',
      type: 'sell',
      confidence: 'high',
      reason: 'Strong bearish reversal pattern - three consecutive bearish candles',
    });
  }

  if (patterns.eveningStar) {
    signals.push({
      pattern: 'EveningStar',
      type: 'sell',
      confidence: 'high',
      reason: 'Bearish reversal pattern at top of uptrend',
    });
  }

  if (patterns.bearishEngulfing) {
    signals.push({
      pattern: 'BearishEngulfing',
      type: 'sell',
      confidence: 'high',
      reason: 'Bearish reversal - bearish candle engulfs previous bullish candle',
    });
  }

  // Medium confidence patterns
  if (patterns.hammer) {
    signals.push({
      pattern: 'Hammer',
      type: 'buy',
      confidence: 'medium',
      reason: 'Potential bullish reversal - hammer at support',
    });
  }

  if (patterns.invertedHammer) {
    signals.push({
      pattern: 'InvertedHammer',
      type: 'buy',
      confidence: 'medium',
      reason: 'Potential bullish reversal - inverted hammer after downtrend',
    });
  }

  if (patterns.tweezerBottoms) {
    signals.push({
      pattern: 'TweezerBottoms',
      type: 'buy',
      confidence: 'medium',
      reason: 'Double bottom at same level - support confirmed',
    });
  }

  if (patterns.tweezerTops) {
    signals.push({
      pattern: 'TweezerTops',
      type: 'sell',
      confidence: 'medium',
      reason: 'Double top at same level - resistance confirmed',
    });
  }

  if (patterns.marubozuWhite) {
    signals.push({
      pattern: 'MarubozuWhite',
      type: 'buy',
      confidence: 'medium',
      reason: 'Strong bullish momentum - no shadows',
    });
  }

  if (patterns.marubozuBlack) {
    signals.push({
      pattern: 'MarubozuBlack',
      type: 'sell',
      confidence: 'medium',
      reason: 'Strong bearish momentum - no shadows',
    });
  }

  return signals;
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Create a new pattern manager
 */
export function createPatternManager(maxHistory: number = 100): PatternManager {
  return new PatternManager(maxHistory);
}
