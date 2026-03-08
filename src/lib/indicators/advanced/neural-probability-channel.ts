/**
 * Neural Probability Channel (NPC) Indicator
 * 
 * A sophisticated channel indicator using Kernel Regression (Nadaraya-Watson estimator)
 * with Rational Quadratic Kernel. The NPC provides a smooth baseline with probability-based
 * bands that adapt to market volatility.
 * 
 * Mathematical Foundation:
 * - Nadaraya-Watson Kernel Regression: ŷ(t) = Σ w(i) * y(i) / Σ w(i)
 * - Rational Quadratic Kernel: w(i) = (1 + d²/(2αh²))^(-α)
 *   where d = |i - currentIndex|, h = bandwidth, α = kernel shape parameter
 * 
 * Key Features:
 * - Smooth baseline using kernel-weighted average
 * - Hybrid volatility measure combining mean deviation and ATR
 * - Inner and outer bands for different probability thresholds
 * - Mean reversion signals when price hits outer bands
 * 
 * Trading Strategy:
 * - BUY when price crosses above lower outer band (oversold mean reversion)
 * - SELL when price crosses below upper outer band (overbought mean reversion)
 * - Use inner bands for moderate signals, outer bands for strong signals
 */

import type { Candle } from '../calculator';

// ==================== TYPES ====================

/**
 * Configuration for Neural Probability Channel
 */
export interface NeuralProbabilityChannelConfig {
  /** Lookback window for kernel calculation (default: 24) */
  lookbackWindow: number;
  /** Bandwidth parameter (h) - controls kernel smoothness (default: 8.0) */
  bandwidth: number;
  /** Alpha parameter - kernel shape, higher = smoother (default: 2.0) */
  alpha: number;
  /** Inner channel multiplier (default: 1.5) */
  innerMultiplier: number;
  /** Outer channel multiplier (default: 2.5) */
  outerMultiplier: number;
}

/**
 * Result of Neural Probability Channel calculation
 */
export interface NPCResult {
  /** Kernel regression estimate - the smooth baseline */
  baseline: number;
  /** Upper inner band = baseline + volatility × innerMultiplier */
  upperInner: number;
  /** Lower inner band = baseline - volatility × innerMultiplier */
  lowerInner: number;
  /** Upper outer band = baseline + volatility × outerMultiplier */
  upperOuter: number;
  /** Lower outer band = baseline - volatility × outerMultiplier */
  lowerOuter: number;
  /** Hybrid volatility measure (mean deviation + ATR component) */
  volatility: number;
  /** Current trend direction */
  trend: 'BULLISH' | 'BEARISH';
  /** Trading signal based on mean reversion */
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
}

/**
 * Extended result with additional analysis data
 */
export interface NPCResultExtended extends NPCResult {
  /** Mean absolute deviation from baseline */
  meanDeviation: number;
  /** ATR component of volatility */
  atrComponent: number;
  /** Current price position relative to bands */
  position: 'ABOVE_OUTER' | 'ABOVE_INNER' | 'INSIDE' | 'BELOW_INNER' | 'BELOW_OUTER';
  /** Distance from baseline as percentage */
  baselineDistance: number;
}

/**
 * Historical NPC point for time series analysis
 */
export interface NPCPoint {
  time: number | string;
  result: NPCResult;
  price: number;
}

// ==================== NEURAL PROBABILITY CHANNEL CLASS ====================

/**
 * Neural Probability Channel indicator using Kernel Regression
 */
export class NeuralProbabilityChannel {
  private config: NeuralProbabilityChannelConfig;
  private previousResults: NPCResult[] = [];

  /**
   * Create a new Neural Probability Channel instance
   */
  constructor(config: Partial<NeuralProbabilityChannelConfig> = {}) {
    this.config = {
      lookbackWindow: config.lookbackWindow ?? 24,
      bandwidth: config.bandwidth ?? 8.0,
      alpha: config.alpha ?? 2.0,
      innerMultiplier: config.innerMultiplier ?? 1.5,
      outerMultiplier: config.outerMultiplier ?? 2.5,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): NeuralProbabilityChannelConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<NeuralProbabilityChannelConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
    this.previousResults = []; // Reset history on config change
  }

  /**
   * Calculate Rational Quadratic Kernel weight
   * 
   * Formula: w(i) = (1 + d²/(2αh²))^(-α)
   * where d = |i - currentIndex|, h = bandwidth, α = kernel shape
   * 
   * @param distance - Distance from current index (d)
   * @returns Kernel weight
   */
  calculateKernelWeight(distance: number): number {
    const { bandwidth, alpha } = this.config;
    const h = bandwidth;
    const d = distance;
    
    // Rational Quadratic Kernel: w(d) = (1 + d²/(2αh²))^(-α)
    const denominator = 2 * alpha * h * h;
    const weight = Math.pow(1 + (d * d) / denominator, -alpha);
    
    return weight;
  }

  /**
   * Calculate baseline using Nadaraya-Watson Kernel Regression
   * 
   * The Nadaraya-Watson estimator is a non-parametric regression method:
   * ŷ(t) = Σᵢ wᵢ * yᵢ / Σᵢ wᵢ
   * 
   * @param prices - Array of price values
   * @param currentIndex - Index to calculate baseline for
   * @returns Kernel-weighted baseline value
   */
  calculateBaseline(prices: number[], currentIndex: number): number {
    const { lookbackWindow } = this.config;
    
    if (prices.length === 0 || currentIndex < 0 || currentIndex >= prices.length) {
      return 0;
    }

    let weightedSum = 0;
    let weightSum = 0;

    // Iterate over the lookback window
    const startIndex = Math.max(0, currentIndex - lookbackWindow);
    const endIndex = Math.min(prices.length - 1, currentIndex + lookbackWindow);

    for (let i = startIndex; i <= endIndex; i++) {
      const distance = Math.abs(i - currentIndex);
      const weight = this.calculateKernelWeight(distance);
      const price = prices[i];

      if (!isNaN(price) && isFinite(price)) {
        weightedSum += weight * price;
        weightSum += weight;
      }
    }

    // Nadaraya-Watson estimate
    return weightSum > 0 ? weightedSum / weightSum : prices[currentIndex];
  }

  /**
   * Calculate Mean Absolute Deviation from baseline
   * 
   * MAD provides a robust measure of dispersion around the kernel baseline
   * 
   * @param prices - Array of price values
   * @param baseline - The calculated baseline value
   * @param currentIndex - Current index
   * @returns Mean absolute deviation
   */
  calculateMeanDeviation(
    prices: number[],
    baseline: number,
    currentIndex: number
  ): number {
    const { lookbackWindow } = this.config;

    if (prices.length === 0) {
      return 0;
    }

    let deviationSum = 0;
    let weightSum = 0;

    const startIndex = Math.max(0, currentIndex - lookbackWindow);
    const endIndex = Math.min(prices.length - 1, currentIndex + lookbackWindow);
    const count = endIndex - startIndex + 1;

    for (let i = startIndex; i <= endIndex; i++) {
      const distance = Math.abs(i - currentIndex);
      const weight = this.calculateKernelWeight(distance);
      const price = prices[i];

      if (!isNaN(price) && isFinite(price)) {
        deviationSum += weight * Math.abs(price - baseline);
        weightSum += weight;
      }
    }

    // Weighted mean absolute deviation
    return weightSum > 0 ? deviationSum / weightSum : 0;
  }

  /**
   * Calculate True Range
   */
  private trueRange(high: number, low: number, prevClose: number): number {
    return Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
  }

  /**
   * Calculate ATR component for hybrid volatility
   * Uses Wilder's smoothing method
   * 
   * @param candles - Array of candle data
   * @param currentIndex - Current index
   * @param period - ATR period (defaults to lookbackWindow)
   * @returns ATR value
   */
  calculateATR(
    candles: Candle[],
    currentIndex: number,
    period?: number
  ): number {
    const atrPeriod = period ?? this.config.lookbackWindow;

    if (currentIndex < atrPeriod || candles.length < atrPeriod + 1) {
      // Not enough data, return simple average
      let sum = 0;
      const count = Math.min(currentIndex + 1, candles.length);
      for (let i = 0; i < count; i++) {
        if (i === 0) {
          sum += candles[i].high - candles[i].low;
        } else {
          sum += this.trueRange(
            candles[i].high,
            candles[i].low,
            candles[i - 1].close
          );
        }
      }
      return count > 0 ? sum / count : 0;
    }

    // Calculate ATR using Wilder's smoothing
    let atrSum = 0;
    
    // First ATR is SMA of TR
    for (let i = currentIndex - atrPeriod + 1; i <= currentIndex; i++) {
      if (i === 0) {
        atrSum += candles[i].high - candles[i].low;
      } else {
        atrSum += this.trueRange(
          candles[i].high,
          candles[i].low,
          candles[i - 1].close
        );
      }
    }

    return atrSum / atrPeriod;
  }

  /**
   * Calculate hybrid volatility measure
   * Combines mean deviation with ATR for robust volatility estimation
   * 
   * @param meanDeviation - Mean absolute deviation from baseline
   * @param atr - ATR value
   * @returns Combined volatility measure
   */
  calculateVolatility(meanDeviation: number, atr: number): number {
    // Hybrid volatility: weighted combination of MAD and ATR
    // MAD provides kernel-smoothed dispersion, ATR captures recent volatility
    const volatility = 0.6 * meanDeviation + 0.4 * atr;
    return volatility;
  }

  /**
   * Determine trend direction based on baseline slope
   * 
   * @param currentBaseline - Current baseline value
   * @param previousBaseline - Previous baseline value
   * @returns Trend direction
   */
  determineTrend(currentBaseline: number, previousBaseline: number | null): 'BULLISH' | 'BEARISH' {
    if (previousBaseline === null) {
      return 'BULLISH'; // Default assumption
    }

    return currentBaseline >= previousBaseline ? 'BULLISH' : 'BEARISH';
  }

  /**
   * Determine price position relative to bands
   */
  determinePosition(
    price: number,
    result: NPCResult
  ): 'ABOVE_OUTER' | 'ABOVE_INNER' | 'INSIDE' | 'BELOW_INNER' | 'BELOW_OUTER' {
    if (price >= result.upperOuter) return 'ABOVE_OUTER';
    if (price >= result.upperInner) return 'ABOVE_INNER';
    if (price <= result.lowerOuter) return 'BELOW_OUTER';
    if (price <= result.lowerInner) return 'BELOW_INNER';
    return 'INSIDE';
  }

  /**
   * Get mean reversion signal based on price position
   * 
   * BUY when price crosses above lower outer band (oversold bounce)
   * SELL when price crosses below upper outer band (overbought decline)
   * 
   * @param price - Current price
   * @param result - NPC calculation result
   * @param previousPosition - Previous price position
   * @returns Trading signal
   */
  getMeanReversionSignal(
    price: number,
    result: NPCResult,
    previousPosition?: 'ABOVE_OUTER' | 'ABOVE_INNER' | 'INSIDE' | 'BELOW_INNER' | 'BELOW_OUTER'
  ): 'BUY' | 'SELL' | 'NEUTRAL' {
    const currentPosition = this.determinePosition(price, result);

    // Mean reversion signals - triggered on band crossovers
    if (previousPosition) {
      // BUY: Price was below outer band and now crosses above lower outer
      if (
        (previousPosition === 'BELOW_OUTER' && 
         (currentPosition === 'BELOW_INNER' || currentPosition === 'INSIDE')) ||
        (previousPosition === 'BELOW_INNER' && currentPosition === 'INSIDE')
      ) {
        return 'BUY';
      }

      // SELL: Price was above outer band and now crosses below upper outer
      if (
        (previousPosition === 'ABOVE_OUTER' && 
         (currentPosition === 'ABOVE_INNER' || currentPosition === 'INSIDE')) ||
        (previousPosition === 'ABOVE_INNER' && currentPosition === 'INSIDE')
      ) {
        return 'SELL';
      }
    }

    // Strong mean reversion signals at extreme positions
    if (currentPosition === 'BELOW_OUTER') {
      return 'BUY'; // Strong oversold - expect mean reversion up
    }
    if (currentPosition === 'ABOVE_OUTER') {
      return 'SELL'; // Strong overbought - expect mean reversion down
    }

    return 'NEUTRAL';
  }

  /**
   * Calculate full Neural Probability Channel for a single candle
   * 
   * @param candles - Array of candle data
   * @param currentIndex - Index to calculate for
   * @returns NPC calculation result
   */
  calculate(candles: Candle[], currentIndex: number): NPCResult {
    const prices = candles.map(c => c.close);
    
    // Calculate baseline using kernel regression
    const baseline = this.calculateBaseline(prices, currentIndex);
    
    // Calculate mean deviation from baseline
    const meanDeviation = this.calculateMeanDeviation(prices, baseline, currentIndex);
    
    // Calculate ATR component
    const atr = this.calculateATR(candles, currentIndex);
    
    // Calculate hybrid volatility
    const volatility = this.calculateVolatility(meanDeviation, atr);
    
    // Calculate bands
    const { innerMultiplier, outerMultiplier } = this.config;
    const upperInner = baseline + volatility * innerMultiplier;
    const lowerInner = baseline - volatility * innerMultiplier;
    const upperOuter = baseline + volatility * outerMultiplier;
    const lowerOuter = baseline - volatility * outerMultiplier;
    
    // Determine trend
    const previousBaseline = this.previousResults.length > 0 
      ? this.previousResults[this.previousResults.length - 1].baseline 
      : null;
    const trend = this.determineTrend(baseline, previousBaseline);
    
    // Get signal
    const currentPrice = prices[currentIndex];
    const previousPosition = this.previousResults.length > 0
      ? this.determinePosition(prices[currentIndex - 1] ?? currentPrice, this.previousResults[this.previousResults.length - 1])
      : undefined;
    const signal = this.getMeanReversionSignal(currentPrice, {
      baseline,
      upperInner,
      lowerInner,
      upperOuter,
      lowerOuter,
      volatility,
      trend,
      signal: 'NEUTRAL',
    }, previousPosition);

    const result: NPCResult = {
      baseline,
      upperInner,
      lowerInner,
      upperOuter,
      lowerOuter,
      volatility,
      trend,
      signal,
    };

    // Store for historical reference
    this.previousResults.push(result);
    // Keep only last 100 results for memory efficiency
    if (this.previousResults.length > 100) {
      this.previousResults.shift();
    }

    return result;
  }

  /**
   * Calculate extended result with additional analysis
   */
  calculateExtended(candles: Candle[], currentIndex: number): NPCResultExtended {
    const result = this.calculate(candles, currentIndex);
    const price = candles[currentIndex].close;
    const prices = candles.map(c => c.close);
    
    const meanDeviation = this.calculateMeanDeviation(prices, result.baseline, currentIndex);
    const atr = this.calculateATR(candles, currentIndex);
    const position = this.determinePosition(price, result);
    const baselineDistance = ((price - result.baseline) / result.baseline) * 100;

    return {
      ...result,
      meanDeviation,
      atrComponent: atr,
      position,
      baselineDistance,
    };
  }

  /**
   * Calculate NPC for all candles
   * 
   * @param candles - Array of candle data
   * @returns Array of NPC results for each candle
   */
  calculateAll(candles: Candle[]): NPCResult[] {
    this.previousResults = []; // Reset for fresh calculation
    const results: NPCResult[] = [];

    for (let i = 0; i < candles.length; i++) {
      results.push(this.calculate(candles, i));
    }

    return results;
  }

  /**
   * Calculate NPC points with time information
   */
  calculatePoints(candles: Candle[]): NPCPoint[] {
    this.previousResults = [];
    const points: NPCPoint[] = [];

    for (let i = 0; i < candles.length; i++) {
      points.push({
        time: candles[i].time,
        result: this.calculate(candles, i),
        price: candles[i].close,
      });
    }

    return points;
  }

  /**
   * Get recent signals from the channel
   * 
   * @param candles - Array of candle data
   * @param lookback - Number of recent candles to check
   * @returns Array of signal indices
   */
  getRecentSignals(
    candles: Candle[],
    lookback: number = 10
  ): Array<{ index: number; signal: 'BUY' | 'SELL'; price: number }> {
    const signals: Array<{ index: number; signal: 'BUY' | 'SELL'; price: number }> = [];
    const startIndex = Math.max(0, candles.length - lookback);

    this.previousResults = [];
    
    // Calculate up to startIndex
    for (let i = 0; i < startIndex; i++) {
      this.calculate(candles, i);
    }

    // Now check for signals
    for (let i = startIndex; i < candles.length; i++) {
      const result = this.calculate(candles, i);
      if (result.signal !== 'NEUTRAL') {
        signals.push({
          index: i,
          signal: result.signal,
          price: candles[i].close,
        });
      }
    }

    return signals;
  }

  /**
   * Analyze channel width for volatility state
   * 
   * @param result - Current NPC result
   * @returns Volatility state analysis
   */
  analyzeVolatilityState(result: NPCResult): {
    state: 'EXPANSION' | 'NORMAL' | 'COMPRESSION';
    bandwidthPercent: number;
  } {
    if (result.baseline === 0) {
      return { state: 'NORMAL', bandwidthPercent: 100 };
    }

    // Calculate channel width as percentage of baseline
    const bandwidth = ((result.upperOuter - result.lowerOuter) / result.baseline) * 100;

    // Compare with recent bandwidths
    const recentBandwidths = this.previousResults
      .slice(-20)
      .filter(r => r.baseline > 0)
      .map(r => ((r.upperOuter - r.lowerOuter) / r.baseline) * 100);

    if (recentBandwidths.length < 5) {
      return { state: 'NORMAL', bandwidthPercent: bandwidth };
    }

    const avgBandwidth = recentBandwidths.reduce((a, b) => a + b, 0) / recentBandwidths.length;
    const ratio = bandwidth / avgBandwidth;

    let state: 'EXPANSION' | 'NORMAL' | 'COMPRESSION';
    if (ratio > 1.3) {
      state = 'EXPANSION';
    } else if (ratio < 0.7) {
      state = 'COMPRESSION';
    } else {
      state = 'NORMAL';
    }

    return { state, bandwidthPercent: bandwidth };
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Create a Neural Probability Channel with default configuration
 */
export function createNeuralProbabilityChannel(
  config?: Partial<NeuralProbabilityChannelConfig>
): NeuralProbabilityChannel {
  return new NeuralProbabilityChannel(config);
}

/**
 * Quick calculation function for single NPC result
 */
export function calculateNPC(
  candles: Candle[],
  config?: Partial<NeuralProbabilityChannelConfig>
): NPCResult[] {
  const npc = new NeuralProbabilityChannel(config);
  return npc.calculateAll(candles);
}

/**
 * Calculate NPC for the latest candle
 */
export function calculateNPCLatest(
  candles: Candle[],
  config?: Partial<NeuralProbabilityChannelConfig>
): NPCResult | null {
  if (candles.length === 0) return null;
  
  const npc = new NeuralProbabilityChannel(config);
  return npc.calculate(candles, candles.length - 1);
}

// ==================== DEFAULT EXPORT ====================

export default NeuralProbabilityChannel;
