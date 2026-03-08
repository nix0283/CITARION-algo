/**
 * ORION Signal Engine
 *
 * Generates trend-following signals using EMA alignment + Supertrend confirmation.
 *
 * Strategy Logic:
 * 1. EMA Alignment: EMA20 > EMA50 > EMA200 = Bullish, reverse = Bearish
 * 2. Supertrend: Confirms direction and provides dynamic support/resistance
 * 3. Filters: Volume, momentum (RSI), regime detection (ADX)
 *
 * Signal Strength Components:
 * - EMA alignment score (0-0.3)
 * - Supertrend distance score (0-0.3)
 * - Volume confirmation (0-0.2)
 * - Momentum confirmation (0-0.2)
 */

import type {
  Candle,
  TrendSignal,
  TrendDirection,
  MarketRegime,
  StrategyConfig,
} from './types';

// =============================================================================
// TECHNICAL INDICATORS
// =============================================================================

/**
 * Calculate Exponential Moving Average
 */
export function calculateEMA(data: number[], period: number): number[] {
  if (data.length < period) {
    return new Array(data.length).fill(NaN);
  }

  const multiplier = 2 / (period + 1);
  const ema: number[] = new Array(data.length).fill(NaN);

  // Initial SMA for first EMA value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  ema[period - 1] = sum / period;

  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (candles.length < period + 1) {
    return new Array(candles.length).fill(NaN);
  }

  const trueRanges: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }

  // Calculate ATR using EMA of True Range
  return calculateEMA(trueRanges, period);
}

/**
 * Calculate Supertrend
 * Returns: { value: number, direction: 1 | -1 }
 * direction: 1 = uptrend (green), -1 = downtrend (red)
 */
export function calculateSupertrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3.0
): { value: number; direction: number; upperBand: number; lowerBand: number }[] {
  const atr = calculateATR(candles, period);
  const result: { value: number; direction: number; upperBand: number; lowerBand: number }[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(atr[i])) {
      result.push({ value: NaN, direction: 0, upperBand: NaN, lowerBand: NaN });
      continue;
    }

    const hl2 = (candles[i].high + candles[i].low) / 2;
    const upperBand = hl2 + multiplier * atr[i];
    const lowerBand = hl2 - multiplier * atr[i];

    if (i === 0 || isNaN(result[i - 1].value)) {
      // Initial values
      const direction = candles[i].close > hl2 ? 1 : -1;
      result.push({
        value: direction === 1 ? lowerBand : upperBand,
        direction,
        upperBand,
        lowerBand,
      });
      continue;
    }

    const prev = result[i - 1];

    // Adjust bands
    const adjustedLowerBand =
      lowerBand > prev.lowerBand || prev.value < candles[i - 1].close
        ? lowerBand
        : prev.lowerBand;

    const adjustedUpperBand =
      upperBand < prev.upperBand || prev.value > candles[i - 1].close
        ? upperBand
        : prev.upperBand;

    // Determine direction
    let direction: number;
    let value: number;

    if (prev.direction === 1) {
      // Was in uptrend
      if (candles[i].close < adjustedLowerBand) {
        // Trend reversal to downtrend
        direction = -1;
        value = adjustedUpperBand;
      } else {
        // Continue uptrend
        direction = 1;
        value = adjustedLowerBand;
      }
    } else {
      // Was in downtrend
      if (candles[i].close > adjustedUpperBand) {
        // Trend reversal to uptrend
        direction = 1;
        value = adjustedLowerBand;
      } else {
        // Continue downtrend
        direction = -1;
        value = adjustedUpperBand;
      }
    }

    result.push({
      value,
      direction,
      upperBand: adjustedUpperBand,
      lowerBand: adjustedLowerBand,
    });
  }

  return result;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(candles: Candle[], period: number = 14): number[] {
  if (candles.length < period + 1) {
    return new Array(candles.length).fill(NaN);
  }

  const rsi: number[] = new Array(candles.length).fill(NaN);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // Initial average gain/loss
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Calculate subsequent RSI values
  for (let i = period + 1; i < candles.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;

    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return rsi;
}

/**
 * Calculate ADX (Average Directional Index)
 * Returns: { adx: number, plusDI: number, minusDI: number }
 */
export function calculateADX(candles: Candle[], period: number = 14): { adx: number; plusDI: number; minusDI: number }[] {
  if (candles.length < period * 2) {
    return new Array(candles.length).fill({ adx: NaN, plusDI: NaN, minusDI: NaN });
  }

  const result: { adx: number; plusDI: number; minusDI: number }[] = [];

  // Calculate True Range, +DM, -DM
  const tr: number[] = [candles[0].high - candles[0].low];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    // True Range
    tr.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    ));

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smoothed values
  const smoothedTR = calculateEMA(tr, period);
  const smoothedPlusDM = calculateEMA(plusDM, period);
  const smoothedMinusDM = calculateEMA(minusDM, period);

  // Calculate +DI, -DI, DX, ADX
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(smoothedTR[i]) || smoothedTR[i] === 0) {
      result.push({ adx: NaN, plusDI: NaN, minusDI: NaN });
      continue;
    }

    const plusDI = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
    const minusDI = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

    result.push({ adx: dx, plusDI, minusDI });
  }

  // Smooth ADX
  const adxValues = result.map(r => r.adx);
  const smoothedADX = calculateEMA(adxValues, period);

  return result.map((r, i) => ({
    ...r,
    adx: smoothedADX[i],
  }));
}

/**
 * Calculate Volume SMA
 */
export function calculateVolumeSMA(candles: Candle[], period: number = 20): number[] {
  const volumes = candles.map(c => c.volume);
  const sma: number[] = new Array(candles.length).fill(NaN);

  for (let i = period - 1; i < candles.length; i++) {
    const sum = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma[i] = sum / period;
  }

  return sma;
}

// =============================================================================
// SIGNAL GENERATION
// =============================================================================

export type SignalEngineConfig = StrategyConfig;

export class SignalEngine {
  private config: SignalEngineConfig;

  constructor(config: SignalEngineConfig) {
    this.config = config;
  }

  /**
   * Analyze candles and generate trend signal
   */
  public analyze(
    candles: Candle[],
    exchange: string,
    symbol: string
  ): TrendSignal | null {
    if (candles.length < Math.max(
      this.config.ema.slow,
      this.config.supertrend.period,
      this.config.filters.momentum.rsiPeriod
    ) + 10) {
      return null; // Not enough data
    }

    const lastIndex = candles.length - 1;
    const close = candles[lastIndex].close;

    // Calculate indicators
    const closes = candles.map(c => c.close);
    const ema20 = calculateEMA(closes, this.config.ema.fast);
    const ema50 = calculateEMA(closes, this.config.ema.medium);
    const ema200 = calculateEMA(closes, this.config.ema.slow);
    const supertrend = calculateSupertrend(
      candles,
      this.config.supertrend.period,
      this.config.supertrend.multiplier
    );
    const atr = calculateATR(candles, 14);
    const rsi = calculateRSI(candles, this.config.filters.momentum.rsiPeriod);
    const adx = calculateADX(candles, 14);
    const volumeSMA = calculateVolumeSMA(candles, 20);

    const current = {
      ema20: ema20[lastIndex],
      ema50: ema50[lastIndex],
      ema200: ema200[lastIndex],
      supertrend: supertrend[lastIndex],
      atr: atr[lastIndex],
      rsi: rsi[lastIndex],
      adx: adx[lastIndex],
      volume: candles[lastIndex].volume,
      volumeSMA: volumeSMA[lastIndex],
    };

    // Determine EMA alignment
    const emaAlignment = this.calculateEMAAlignment(current);
    const emaAligned = Math.abs(emaAlignment) >= 0.7;

    // Supertrend confirmation
    const supertrendConfirmed = current.supertrend.direction !== 0;
    const supertrendDirection = current.supertrend.direction as 1 | -1;

    // Volume confirmation
    const volumeRatio = current.volume / current.volumeSMA;
    const volumeConfirmed = !this.config.filters.volume.enabled ||
      volumeRatio >= this.config.filters.volume.minRatio;

    // Momentum confirmation
    let momentumConfirmed = true;
    if (this.config.filters.momentum.enabled) {
      const rsiOversold = this.config.filters.momentum.rsiOversold;
      const rsiOverbought = this.config.filters.momentum.rsiOverbought;

      if (supertrendDirection === 1) {
        // Long signal: RSI should not be overbought
        momentumConfirmed = current.rsi < rsiOverbought;
      } else {
        // Short signal: RSI should not be oversold
        momentumConfirmed = current.rsi > rsiOversold;
      }
    }

    // Determine direction
    let direction: TrendDirection = 'FLAT';
    if (emaAligned && supertrendConfirmed) {
      if (emaAlignment > 0 && supertrendDirection === 1) {
        direction = 'LONG';
      } else if (emaAlignment < 0 && supertrendDirection === -1) {
        direction = 'SHORT';
      }
    }

    // Calculate signal strength
    const strength = this.calculateStrength({
      emaAlignment,
      supertrendDistance: Math.abs(close - current.supertrend.value) / close,
      volumeRatio,
      momentumConfirmed,
    });

    // Calculate confidence
    const confidence = this.calculateConfidence({
      emaAligned,
      supertrendConfirmed,
      volumeConfirmed,
      momentumConfirmed,
      adx: current.adx.adx,
    });

    // Determine market regime
    const regime = this.determineRegime(current.adx, current.atr, close, candles.slice(-50));

    // Apply filters
    if (strength < this.config.filters.minStrength) {
      return null;
    }
    if (confidence < this.config.filters.minConfidence) {
      return null;
    }
    if (this.config.filters.requireEmaAlignment && !emaAligned) {
      return null;
    }
    if (this.config.filters.requireSupertrendConfirm && !supertrendConfirmed) {
      return null;
    }

    return {
      id: `orion-${exchange}-${symbol}-${Date.now()}`,
      timestamp: Date.now(),
      symbol,
      exchange,
      direction,
      strength,
      confidence,
      regime,
      ema: {
        ema20: current.ema20,
        ema50: current.ema50,
        ema200: current.ema200,
        alignment: emaAlignment,
      },
      supertrend: {
        value: current.supertrend.value,
        direction: supertrendDirection,
        distance: Math.abs(close - current.supertrend.value) / close * 100,
      },
      atr: current.atr,
      price: close,
      components: {
        emaAligned,
        supertrendConfirmed,
        volumeConfirmed,
        momentumConfirmed,
      },
    };
  }

  /**
   * Calculate EMA alignment score
   * Returns: 1 (perfect bullish) to -1 (perfect bearish)
   */
  private calculateEMAAlignment(current: {
    ema20: number;
    ema50: number;
    ema200: number;
  }): number {
    const { ema20, ema50, ema200 } = current;

    if (isNaN(ema20) || isNaN(ema50) || isNaN(ema200)) {
      return 0;
    }

    let score = 0;

    // EMA20 vs EMA50
    if (ema20 > ema50) score += 0.33;
    else if (ema20 < ema50) score -= 0.33;

    // EMA50 vs EMA200
    if (ema50 > ema200) score += 0.33;
    else if (ema50 < ema200) score -= 0.33;

    // EMA20 vs EMA200
    if (ema20 > ema200) score += 0.34;
    else if (ema20 < ema200) score -= 0.34;

    return score;
  }

  /**
   * Calculate signal strength (0-1)
   */
  private calculateStrength(params: {
    emaAlignment: number;
    supertrendDistance: number;
    volumeRatio: number;
    momentumConfirmed: boolean;
  }): number {
    let strength = 0;

    // EMA alignment contribution (0-0.3)
    strength += Math.abs(params.emaAlignment) * 0.3;

    // Supertrend distance contribution (0-0.3)
    // Closer to supertrend = stronger signal
    const stScore = Math.max(0, 0.3 - params.supertrendDistance * 2);
    strength += stScore;

    // Volume contribution (0-0.2)
    if (params.volumeRatio >= 1) {
      strength += Math.min(0.2, params.volumeRatio * 0.1);
    }

    // Momentum contribution (0-0.2)
    if (params.momentumConfirmed) {
      strength += 0.2;
    }

    return Math.min(1, strength);
  }

  /**
   * Calculate confidence (0-1)
   */
  private calculateConfidence(params: {
    emaAligned: boolean;
    supertrendConfirmed: boolean;
    volumeConfirmed: boolean;
    momentumConfirmed: boolean;
    adx: number;
  }): number {
    let confidence = 0.4; // Base confidence

    // Component confirmations
    if (params.emaAligned) confidence += 0.15;
    if (params.supertrendConfirmed) confidence += 0.15;
    if (params.volumeConfirmed) confidence += 0.1;
    if (params.momentumConfirmed) confidence += 0.1;

    // ADX contribution (trending market = more confidence)
    if (!isNaN(params.adx)) {
      if (params.adx > 25) {
        confidence += 0.1;
      }
      if (params.adx > 40) {
        confidence += 0.1;
      }
    }

    return Math.min(1, confidence);
  }

  /**
   * Determine market regime
   */
  private determineRegime(
    adx: { adx: number; plusDI: number; minusDI: number },
    atr: number,
    close: number,
    recentCandles: Candle[]
  ): MarketRegime {
    // Check for trending market
    if (!isNaN(adx.adx) && adx.adx > this.config.regime.adxTrendThreshold) {
      return 'trending';
    }

    // Check for volatile market
    const avgRange = recentCandles.reduce(
      (sum, c) => sum + (c.high - c.low),
      0
    ) / recentCandles.length;
    const rangeRatio = atr / avgRange;

    if (rangeRatio > 1.5) {
      return 'volatile';
    }

    // Check for transitioning
    if (!isNaN(adx.adx) && adx.adx > 20 && adx.adx < 25) {
      return 'transitioning';
    }

    return 'ranging';
  }
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export const defaultStrategyConfig: StrategyConfig = {
  ema: {
    fast: 20,
    medium: 50,
    slow: 200,
  },
  supertrend: {
    period: 10,
    multiplier: 3.0,
  },
  filters: {
    minStrength: 0.5,
    minConfidence: 0.6,
    requireEmaAlignment: true,
    requireSupertrendConfirm: true,
    volume: {
      enabled: true,
      minRatio: 1.2,
    },
    momentum: {
      enabled: true,
      rsiPeriod: 14,
      rsiOversold: 30,
      rsiOverbought: 70,
    },
  },
  regime: {
    adxTrendThreshold: 25,
    atrVolatilePercentile: 80,
  },
  timeframes: {
    primary: '1h',
    higher: '4h',
    lower: '15m',
  },
};
