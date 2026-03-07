/**
 * BB Signal Filter
 * 
 * Signal filter for Bollinger Band Bot strategies.
 * Analyzes Double BB positions with Stochastic confirmation.
 */

// ==================== TYPES ====================

export interface BBSignal {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  
  // BB values
  bbInnerUpper: number;
  bbInnerLower: number;
  bbOuterUpper: number;
  bbOuterLower: number;
  bbMiddle: number;
  percentB: number;          // Position within bands (0-1)
  bandwidth: number;
  
  // Stochastic
  stochK: number;
  stochD: number;
  
  // Context
  trend: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING';
}

export interface BBFilterResult {
  approved: boolean;
  probability: number;
  confidence: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  reasons: string[];
  signalType: 'INNER_TOUCH' | 'OUTER_TOUCH' | 'BAND_WALK' | 'SQUEEZE' | 'REVERSAL';
}

export interface BBFilterConfig {
  // Stochastic thresholds
  stochOversold: number;
  stochOverbought: number;
  
  // Band position thresholds
  outerBandWeight: number;
  innerBandWeight: number;
  
  // Squeeze detection
  squeezeBandwidthThreshold: number;
  
  // Confidence modifiers
  trendAlignmentBonus: number;
  divergenceBonus: number;
  
  // Minimum thresholds
  minProbability: number;
  minConfidence: number;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_BB_FILTER_CONFIG: BBFilterConfig = {
  stochOversold: 20,
  stochOverbought: 80,
  outerBandWeight: 1.0,
  innerBandWeight: 0.7,
  squeezeBandwidthThreshold: 0.05,
  trendAlignmentBonus: 0.15,
  divergenceBonus: 0.2,
  minProbability: 0.6,
  minConfidence: 0.5,
};

// ==================== BB SIGNAL FILTER CLASS ====================

export class BBSignalFilter {
  private config: BBFilterConfig;
  private signalHistory: Map<string, BBSignal[]> = new Map();
  private readonly maxHistoryLength = 50;

  constructor(config: Partial<BBFilterConfig> = {}) {
    this.config = { ...DEFAULT_BB_FILTER_CONFIG, ...config };
  }

  /**
   * Evaluate a BB signal and return filter result
   */
  async evaluate(signal: BBSignal): Promise<BBFilterResult> {
    const reasons: string[] = [];
    let probability = 0.5;
    let confidence = 0.5;
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let signalType: BBFilterResult['signalType'] = 'INNER_TOUCH';

    // Store signal in history
    this.storeSignal(signal);

    // Detect signal type
    signalType = this.detectSignalType(signal);
    reasons.push(`Signal type: ${signalType}`);

    // Analyze based on signal type
    const analysis = this.analyzeSignal(signal, signalType);
    probability = analysis.probability;
    confidence = analysis.confidence;
    direction = analysis.direction;
    reasons.push(...analysis.reasons);

    // Apply trend alignment bonus
    const trendBonus = this.checkTrendAlignment(signal, direction);
    if (trendBonus > 0) {
      probability = Math.min(1, probability + trendBonus);
      reasons.push(`Trend alignment bonus: +${(trendBonus * 100).toFixed(1)}%`);
    }

    // Check for squeeze pattern (low volatility, high probability breakout)
    if (signalType === 'SQUEEZE') {
      const squeezeAnalysis = this.analyzeSqueeze(signal);
      probability = squeezeAnalysis.probability;
      confidence = squeezeAnalysis.confidence;
      direction = squeezeAnalysis.direction;
      reasons.push(...squeezeAnalysis.reasons);
    }

    // Final approval decision
    const approved = probability >= this.config.minProbability && 
                     confidence >= this.config.minConfidence &&
                     direction !== 'NEUTRAL';

    if (!approved && direction === 'NEUTRAL') {
      reasons.push('Signal rejected: Neutral direction');
    }
    if (!approved && probability < this.config.minProbability) {
      reasons.push(`Signal rejected: Low probability (${(probability * 100).toFixed(1)}%)`);
    }
    if (!approved && confidence < this.config.minConfidence) {
      reasons.push(`Signal rejected: Low confidence (${(confidence * 100).toFixed(1)}%)`);
    }

    return {
      approved,
      probability,
      confidence,
      direction,
      reasons,
      signalType,
    };
  }

  /**
   * Detect signal type based on BB position
   */
  private detectSignalType(signal: BBSignal): BBFilterResult['signalType'] {
    const { currentPrice, bbInnerUpper, bbInnerLower, bbOuterUpper, bbOuterLower, bandwidth } = signal;

    // Check for squeeze (very narrow bands)
    if (bandwidth < this.config.squeezeBandwidthThreshold) {
      return 'SQUEEZE';
    }

    // Check for outer band touch
    if (currentPrice >= bbOuterUpper || currentPrice <= bbOuterLower) {
      return 'OUTER_TOUCH';
    }

    // Check for inner band touch
    if (currentPrice >= bbInnerUpper || currentPrice <= bbInnerLower) {
      // Check if it's a band walk (price staying outside inner band)
      if (this.isBandWalk(signal)) {
        return 'BAND_WALK';
      }
      return 'INNER_TOUCH';
    }

    // Check for reversal pattern
    if (this.isReversalPattern(signal)) {
      return 'REVERSAL';
    }

    return 'INNER_TOUCH';
  }

  /**
   * Check if price is walking the bands
   */
  private isBandWalk(signal: BBSignal): boolean {
    const history = this.signalHistory.get(signal.symbol) || [];
    if (history.length < 3) return false;

    const recent = history.slice(-3);
    
    // Check if price has been consistently above/below inner band
    let aboveCount = 0;
    let belowCount = 0;

    for (const s of recent) {
      if (s.currentPrice >= s.bbInnerUpper) aboveCount++;
      if (s.currentPrice <= s.bbInnerLower) belowCount++;
    }

    return aboveCount >= 2 || belowCount >= 2;
  }

  /**
   * Check for reversal pattern
   */
  private isReversalPattern(signal: BBSignal): boolean {
    const history = this.signalHistory.get(signal.symbol) || [];
    if (history.length < 5) return false;

    const recent = history.slice(-5);
    
    // Check for percentB divergence
    let percentBRising = 0;
    let percentBFalling = 0;

    for (let i = 1; i < recent.length; i++) {
      if (recent[i].percentB > recent[i - 1].percentB) percentBRising++;
      if (recent[i].percentB < recent[i - 1].percentB) percentBFalling++;
    }

    // Reversal if strong momentum shift
    return (percentBRising >= 3 && signal.percentB < 0.3) || 
           (percentBFalling >= 3 && signal.percentB > 0.7);
  }

  /**
   * Analyze signal based on type
   */
  private analyzeSignal(
    signal: BBSignal, 
    signalType: BBFilterResult['signalType']
  ): { probability: number; confidence: number; direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reasons: string[] } {
    const reasons: string[] = [];
    let probability = 0.5;
    let confidence = 0.5;
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

    switch (signalType) {
      case 'OUTER_TOUCH':
        return this.analyzeOuterTouch(signal);
      
      case 'INNER_TOUCH':
        return this.analyzeInnerTouch(signal);
      
      case 'BAND_WALK':
        return this.analyzeBandWalk(signal);
      
      case 'REVERSAL':
        return this.analyzeReversal(signal);
      
      case 'SQUEEZE':
        return this.analyzeSqueeze(signal);
      
      default:
        return { probability, confidence, direction, reasons };
    }
  }

  /**
   * Analyze outer band touch signals
   */
  private analyzeOuterTouch(signal: BBSignal): { probability: number; confidence: number; direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reasons: string[] } {
    const reasons: string[] = [];
    let probability = 0.65;
    let confidence = 0.7;
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

    const { currentPrice, bbOuterUpper, bbOuterLower, stochK, stochD } = signal;

    // LONG signal: Price at lower outer band + Stochastic oversold
    if (currentPrice <= bbOuterLower) {
      direction = 'LONG';
      reasons.push('Price touched lower outer band');
      
      // Check stochastic confirmation
      if (stochK <= this.config.stochOversold && stochD <= this.config.stochOversold) {
        probability += 0.15;
        confidence += 0.1;
        reasons.push(`Stochastic oversold confirmation (K: ${stochK.toFixed(1)}, D: ${stochD.toFixed(1)})`);
      } else if (stochK <= this.config.stochOversold) {
        probability += 0.1;
        confidence += 0.05;
        reasons.push(`Stochastic K oversold (${stochK.toFixed(1)})`);
      }

      // Check for K/D crossover (bullish)
      if (stochK > stochD) {
        probability += 0.1;
        reasons.push('Bullish stochastic crossover');
      }
    }

    // SHORT signal: Price at upper outer band + Stochastic overbought
    if (currentPrice >= bbOuterUpper) {
      direction = 'SHORT';
      reasons.push('Price touched upper outer band');
      
      // Check stochastic confirmation
      if (stochK >= this.config.stochOverbought && stochD >= this.config.stochOverbought) {
        probability += 0.15;
        confidence += 0.1;
        reasons.push(`Stochastic overbought confirmation (K: ${stochK.toFixed(1)}, D: ${stochD.toFixed(1)})`);
      } else if (stochK >= this.config.stochOverbought) {
        probability += 0.1;
        confidence += 0.05;
        reasons.push(`Stochastic K overbought (${stochK.toFixed(1)})`);
      }

      // Check for K/D crossover (bearish)
      if (stochK < stochD) {
        probability += 0.1;
        reasons.push('Bearish stochastic crossover');
      }
    }

    return { probability: Math.min(1, probability), confidence: Math.min(1, confidence), direction, reasons };
  }

  /**
   * Analyze inner band touch signals
   */
  private analyzeInnerTouch(signal: BBSignal): { probability: number; confidence: number; direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reasons: string[] } {
    const reasons: string[] = [];
    let probability = 0.55;
    let confidence = 0.6;
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

    const { currentPrice, bbInnerUpper, bbInnerLower, bbMiddle, stochK, stochD } = signal;

    // LONG signal: Price crosses above lower inner band
    if (currentPrice > bbInnerLower && currentPrice < bbMiddle) {
      direction = 'LONG';
      reasons.push('Price above lower inner band');
      
      // Check momentum
      if (stochK > stochD && stochK > this.config.stochOversold) {
        probability += 0.1;
        reasons.push('Momentum confirmation (K > D, rising)');
      }

      // Distance from middle (more room to run)
      const roomToMiddle = (bbMiddle - currentPrice) / currentPrice;
      if (roomToMiddle > 0.01) {
        probability += 0.05;
        reasons.push(`Room to middle band: ${(roomToMiddle * 100).toFixed(2)}%`);
      }
    }

    // SHORT signal: Price crosses below upper inner band
    if (currentPrice < bbInnerUpper && currentPrice > bbMiddle) {
      direction = 'SHORT';
      reasons.push('Price below upper inner band');
      
      // Check momentum
      if (stochK < stochD && stochK < this.config.stochOverbought) {
        probability += 0.1;
        reasons.push('Momentum confirmation (K < D, falling)');
      }

      // Distance from middle (more room to run)
      const roomToMiddle = (currentPrice - bbMiddle) / currentPrice;
      if (roomToMiddle > 0.01) {
        probability += 0.05;
        reasons.push(`Room to middle band: ${(roomToMiddle * 100).toFixed(2)}%`);
      }
    }

    return { probability: Math.min(1, probability), confidence: Math.min(1, confidence), direction, reasons };
  }

  /**
   * Analyze band walk signals
   */
  private analyzeBandWalk(signal: BBSignal): { probability: number; confidence: number; direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reasons: string[] } {
    const reasons: string[] = [];
    let probability = 0.6;
    let confidence = 0.65;
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

    const { currentPrice, bbInnerUpper, bbInnerLower, bbOuterUpper, bbOuterLower, stochK } = signal;

    // Uptrend band walk
    if (currentPrice >= bbInnerUpper) {
      direction = 'LONG';
      reasons.push('Band walk: price riding upper bands');
      
      // Strong trend if price between inner and outer
      if (currentPrice < bbOuterUpper) {
        probability += 0.1;
        reasons.push('Strong uptrend confirmed');
      }

      // But be careful of overextended
      if (stochK > 90) {
        probability -= 0.15;
        reasons.push('Warning: Overextended (Stoch K > 90)');
      }
    }

    // Downtrend band walk
    if (currentPrice <= bbInnerLower) {
      direction = 'SHORT';
      reasons.push('Band walk: price riding lower bands');
      
      // Strong trend if price between inner and outer
      if (currentPrice > bbOuterLower) {
        probability += 0.1;
        reasons.push('Strong downtrend confirmed');
      }

      // But be careful of oversold bounce
      if (stochK < 10) {
        probability -= 0.15;
        reasons.push('Warning: Oversold bounce risk (Stoch K < 10)');
      }
    }

    return { probability: Math.min(1, Math.max(0, probability)), confidence, direction, reasons };
  }

  /**
   * Analyze reversal signals
   */
  private analyzeReversal(signal: BBSignal): { probability: number; confidence: number; direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reasons: string[] } {
    const reasons: string[] = [];
    let probability = 0.55;
    let confidence = 0.6;
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

    const { percentB, stochK, stochD } = signal;

    // Bullish reversal
    if (percentB < 0.3) {
      direction = 'LONG';
      reasons.push('Potential bullish reversal (low %B)');
      
      if (stochK > stochD && stochK < 30) {
        probability += 0.15;
        confidence += 0.1;
        reasons.push('Stochastic turning up from oversold');
      }
    }

    // Bearish reversal
    if (percentB > 0.7) {
      direction = 'SHORT';
      reasons.push('Potential bearish reversal (high %B)');
      
      if (stochK < stochD && stochK > 70) {
        probability += 0.15;
        confidence += 0.1;
        reasons.push('Stochastic turning down from overbought');
      }
    }

    return { probability: Math.min(1, probability), confidence: Math.min(1, confidence), direction, reasons };
  }

  /**
   * Analyze squeeze signals (low volatility, potential breakout)
   */
  private analyzeSqueeze(signal: BBSignal): { probability: number; confidence: number; direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reasons: string[] } {
    const reasons: string[] = [];
    let probability = 0.5;
    let confidence = 0.7;
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

    const { currentPrice, bbMiddle, stochK, stochD, trend } = signal;

    reasons.push('Squeeze detected: low volatility, potential breakout');

    // Use trend to determine likely breakout direction
    if (trend === 'TRENDING_UP') {
      direction = 'LONG';
      probability = 0.6;
      reasons.push('Bullish bias from uptrend');
    } else if (trend === 'TRENDING_DOWN') {
      direction = 'SHORT';
      probability = 0.6;
      reasons.push('Bearish bias from downtrend');
    } else {
      // Use price position relative to middle
      if (currentPrice > bbMiddle) {
        direction = 'LONG';
        probability = 0.55;
        reasons.push('Price above middle, slight bullish bias');
      } else if (currentPrice < bbMiddle) {
        direction = 'SHORT';
        probability = 0.55;
        reasons.push('Price below middle, slight bearish bias');
      }
    }

    // Stochastic helps confirm direction
    if (stochK > stochD && direction === 'LONG') {
      probability += 0.1;
      reasons.push('Stochastic confirms bullish bias');
    } else if (stochK < stochD && direction === 'SHORT') {
      probability += 0.1;
      reasons.push('Stochastic confirms bearish bias');
    }

    return { probability: Math.min(1, probability), confidence, direction, reasons };
  }

  /**
   * Check trend alignment
   */
  private checkTrendAlignment(signal: BBSignal, direction: 'LONG' | 'SHORT' | 'NEUTRAL'): number {
    if (direction === 'NEUTRAL') return 0;

    const { trend } = signal;

    if (direction === 'LONG' && trend === 'TRENDING_UP') {
      return this.config.trendAlignmentBonus;
    }
    if (direction === 'SHORT' && trend === 'TRENDING_DOWN') {
      return this.config.trendAlignmentBonus;
    }

    return 0;
  }

  /**
   * Store signal in history
   */
  private storeSignal(signal: BBSignal): void {
    const key = `${signal.symbol}-${signal.timeframe}`;
    const history = this.signalHistory.get(key) || [];
    history.push(signal);
    
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
    
    this.signalHistory.set(key, history);
  }

  /**
   * Get signal history for a symbol
   */
  getSignalHistory(symbol: string, timeframe: string): BBSignal[] {
    return this.signalHistory.get(`${symbol}-${timeframe}`) || [];
  }

  /**
   * Clear signal history
   */
  clearHistory(symbol?: string, timeframe?: string): void {
    if (symbol && timeframe) {
      this.signalHistory.delete(`${symbol}-${timeframe}`);
    } else {
      this.signalHistory.clear();
    }
  }

  /**
   * Update filter configuration
   */
  updateConfig(config: Partial<BBFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): BBFilterConfig {
    return { ...this.config };
  }
}

// ==================== FACTORY FUNCTION ====================

let bbSignalFilterInstance: BBSignalFilter | null = null;

export function getBBSignalFilter(config?: Partial<BBFilterConfig>): BBSignalFilter {
  if (!bbSignalFilterInstance) {
    bbSignalFilterInstance = new BBSignalFilter(config);
  } else if (config) {
    bbSignalFilterInstance.updateConfig(config);
  }
  return bbSignalFilterInstance;
}

export function createBBSignalFilter(config?: Partial<BBFilterConfig>): BBSignalFilter {
  return new BBSignalFilter(config);
}
