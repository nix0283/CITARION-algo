/**
 * Trend Strategy: EMA + SuperTrend
 * Production implementation of trend-following strategy
 * 
 * Logic:
 * 1. EMA Alignment Filter (200 > 50 > 20 = Bullish, reverse = Bearish)
 * 2. SuperTrend for entry/exit signals
 * 3. Dynamic stop-loss on SuperTrend line
 * 4. Volume confirmation
 */

import type { Candle } from './types';
import { TradeDirection, TrendState, SignalStrength, type TradingSignal, type TrendStrategyConfig } from './types';

// ============================================================================
// INDICATOR CALCULATIONS
// ============================================================================

/**
 * Calculate Exponential Moving Average
 */
export function calculateEMA(data: number[], period: number): (number | null)[] {
  if (data.length < period) {
    return data.map(() => null);
  }

  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);

  // First value is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i] ?? 0;
    result.push(null);
  }
  result[period - 1] = sum / period;

  // Subsequent values are EMA
  for (let i = period; i < data.length; i++) {
    const prevEMA = result[i - 1];
    if (prevEMA !== null) {
      result.push((data[i]! - prevEMA) * multiplier + prevEMA);
    } else {
      result.push(null);
    }
  }

  return result;
}

/**
 * Calculate Average True Range
 */
export function calculateATR(
  candles: Candle[],
  period: number
): (number | null)[] {
  if (candles.length < period + 1) {
    return candles.map(() => null);
  }

  const trueRanges: number[] = [];

  // Calculate True Range for each candle
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // First ATR is SMA of True Ranges
  const result: (number | null)[] = [null]; // First candle has no TR
  for (let i = 1; i < period; i++) {
    result.push(null);
  }

  // Calculate initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i] ?? 0;
  }
  result.push(sum / period);

  // Calculate subsequent ATR values using smoothing
  for (let i = period; i < trueRanges.length; i++) {
    const prevATR = result[result.length - 1];
    if (prevATR !== null) {
      result.push((prevATR * (period - 1) + (trueRanges[i] ?? 0)) / period);
    } else {
      result.push(null);
    }
  }

  return result;
}

/**
 * SuperTrend Indicator Result
 */
export interface SuperTrendResult {
  value: (number | null)[];      // SuperTrend line value
  direction: (number | null)[];  // 1 = uptrend, -1 = downtrend
  upperBand: (number | null)[];
  lowerBand: (number | null)[];
}

/**
 * Calculate SuperTrend Indicator
 */
export function calculateSuperTrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3.0
): SuperTrendResult {
  const atr = calculateATR(candles, period);
  
  const value: (number | null)[] = [];
  const direction: (number | null)[] = [];
  const upperBand: (number | null)[] = [];
  const lowerBand: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (atr[i] === null) {
      value.push(null);
      direction.push(null);
      upperBand.push(null);
      lowerBand.push(null);
      continue;
    }

    const hl2 = (candles[i].high + candles[i].low) / 2;
    const atrVal = atr[i]!;

    // Calculate basic bands
    const basicUpperBand = hl2 + multiplier * atrVal;
    const basicLowerBand = hl2 - multiplier * atrVal;

    // Determine final bands
    let finalUpperBand = basicUpperBand;
    let finalLowerBand = basicLowerBand;

    if (i > 0 && lowerBand[i - 1] !== null && upperBand[i - 1] !== null) {
      const prevLowerBand = lowerBand[i - 1]!;
      const prevUpperBand = upperBand[i - 1]!;

      finalLowerBand = 
        basicLowerBand > prevLowerBand || candles[i - 1].close < prevLowerBand
          ? basicLowerBand
          : prevLowerBand;

      finalUpperBand =
        basicUpperBand < prevUpperBand || candles[i - 1].close > prevUpperBand
          ? basicUpperBand
          : prevUpperBand;
    }

    lowerBand.push(finalLowerBand);
    upperBand.push(finalUpperBand);

    // Determine SuperTrend value and direction
    if (i === 0) {
      value.push(finalLowerBand);
      direction.push(1);
    } else {
      const prevValue = value[i - 1];
      const prevDirection = direction[i - 1];

      if (prevValue !== null && prevDirection !== null) {
        if (prevDirection === 1) {
          if (candles[i].close < finalLowerBand) {
            value.push(finalUpperBand);
            direction.push(-1);
          } else {
            value.push(finalLowerBand);
            direction.push(1);
          }
        } else {
          if (candles[i].close > finalUpperBand) {
            value.push(finalLowerBand);
            direction.push(1);
          } else {
            value.push(finalUpperBand);
            direction.push(-1);
          }
        }
      } else {
        value.push(finalLowerBand);
        direction.push(1);
      }
    }
  }

  return { value, direction, upperBand, lowerBand };
}

/**
 * Calculate Simple Moving Average for Volume
 */
export function calculateSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }

    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j] ?? 0;
    }
    result.push(sum / period);
  }

  return result;
}

// ============================================================================
// STRATEGY IMPLEMENTATION
// ============================================================================

/**
 * Strategy state for a symbol
 */
export interface StrategyState {
  emaFast: number[];
  emaMid: number[];
  emaSlow: number[];
  supertrend: SuperTrendResult;
  avgVolume: number[];
  currentTrend: TrendState;
}

/**
 * Calculate all indicators for the strategy
 */
export function calculateStrategyState(
  candles: Candle[],
  config: TrendStrategyConfig
): StrategyState {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);

  const emaFast = calculateEMA(closes, config.emaFastPeriod);
  const emaMid = calculateEMA(closes, config.emaMidPeriod);
  const emaSlow = calculateEMA(closes, config.emaSlowPeriod);

  const supertrend = calculateSuperTrend(
    candles,
    config.supertrendPeriod,
    config.supertrendMultiplier
  );

  const avgVolume = calculateSMA(volumes, 20);

  return {
    emaFast: emaFast.map(v => v ?? 0),
    emaMid: emaMid.map(v => v ?? 0),
    emaSlow: emaSlow.map(v => v ?? 0),
    supertrend,
    avgVolume: avgVolume.map(v => v ?? 0),
    currentTrend: TrendState.RANGING
  };
}

/**
 * Determine trend state from EMA alignment
 */
export function determineTrendState(
  emaFast: number,
  emaMid: number,
  emaSlow: number
): TrendState {
  // Bullish alignment: slow < mid < fast
  if (emaSlow < emaMid && emaMid < emaFast) {
    return TrendState.BULLISH;
  }

  // Bearish alignment: slow > mid > fast
  if (emaSlow > emaMid && emaMid > emaFast) {
    return TrendState.BEARISH;
  }

  // Check for potential reversal
  const fastMidDiff = emaFast - emaMid;
  const midSlowDiff = emaMid - emaSlow;

  // Reversal detection
  if (Math.abs(fastMidDiff) < Math.abs(midSlowDiff) * 0.1) {
    return TrendState.REVERSAL;
  }

  return TrendState.RANGING;
}

/**
 * Calculate signal strength based on multiple factors
 */
export function calculateSignalStrength(
  trendState: TrendState,
  supertrendDirection: number,
  currentVolume: number,
  avgVolume: number,
  config: TrendStrategyConfig
): SignalStrength {
  let score = 0;

  // Trend alignment (40% weight)
  if (trendState === TrendState.BULLISH && supertrendDirection === 1) {
    score += 0.4;
  } else if (trendState === TrendState.BEARISH && supertrendDirection === -1) {
    score += 0.4;
  } else if (trendState === TrendState.REVERSAL) {
    score += 0.2;
  }

  // Volume confirmation (30% weight)
  if (avgVolume > 0) {
    const volumeRatio = currentVolume / avgVolume;
    if (volumeRatio >= config.minVolumeMultiplier) {
      score += 0.3 * Math.min(1, (volumeRatio - 1) / 2); // Cap at 2x volume
    }
  }

  // EMA alignment bonus (30% weight)
  if (config.requireAllEMAAlign) {
    score += 0.3; // Already confirmed by trend state
  } else {
    score += 0.15; // Partial bonus
  }

  // Map to signal strength enum
  if (score >= 0.7) return SignalStrength.STRONG;
  if (score >= 0.4) return SignalStrength.MODERATE;
  return SignalStrength.WEAK;
}

/**
 * Generate trading signal from current market state
 */
export function generateSignal(
  symbol: string,
  candles: Candle[],
  state: StrategyState,
  config: TrendStrategyConfig
): TradingSignal | null {
  const len = candles.length;
  if (len < Math.max(config.emaSlowPeriod, config.supertrendPeriod) + 1) {
    return null; // Not enough data
  }

  const i = len - 1;
  const close = candles[i].close;
  const volume = candles[i].volume;

  // Get current indicator values
  const emaFast = state.emaFast[i];
  const emaMid = state.emaMid[i];
  const emaSlow = state.emaSlow[i];
  const stDirection = state.supertrend.direction[i];
  const stValue = state.supertrend.value[i];
  const avgVol = state.avgVolume[i];

  if (!emaFast || !emaMid || !emaSlow || stDirection === null || stValue === null) {
    return null;
  }

  // Determine trend state
  const trendState = determineTrendState(emaFast, emaMid, emaSlow);

  // Check for signal conditions
  let direction: TradeDirection = TradeDirection.FLAT;
  let entryReason = '';

  // Long signal conditions
  if (
    trendState === TrendState.BULLISH &&
    stDirection === 1 &&
    close > stValue &&
    (!config.requireAllEMAAlign || (emaFast > emaMid && emaMid > emaSlow))
  ) {
    direction = TradeDirection.LONG;
    entryReason = 'EMA bullish alignment + SuperTrend uptrend + price above ST line';
  }

  // Short signal conditions
  if (
    trendState === TrendState.BEARISH &&
    stDirection === -1 &&
    close < stValue &&
    (!config.requireAllEMAAlign || (emaFast < emaMid && emaMid < emaSlow))
  ) {
    direction = TradeDirection.SHORT;
    entryReason = 'EMA bearish alignment + SuperTrend downtrend + price below ST line';
  }

  if (direction === TradeDirection.FLAT) {
    return null;
  }

  // Calculate signal strength
  const strength = calculateSignalStrength(
    trendState,
    stDirection,
    volume,
    avgVol,
    config
  );

  // Skip weak signals
  if (strength === SignalStrength.WEAK) {
    return null;
  }

  // Calculate stop loss (SuperTrend line with buffer)
  const stopLoss = direction === TradeDirection.LONG
    ? stValue * 0.995  // 0.5% below SuperTrend
    : stValue * 1.005; // 0.5% above SuperTrend

  // Calculate take profit levels (2R, 3R, 5R)
  const risk = Math.abs(close - stopLoss);
  const takeProfits = [
    close + (direction === TradeDirection.LONG ? risk * 2 : -risk * 2),
    close + (direction === TradeDirection.LONG ? risk * 3 : -risk * 3),
    close + (direction === TradeDirection.LONG ? risk * 5 : -risk * 5),
  ];

  // Calculate confidence
  const confidence = 
    (strength === SignalStrength.STRONG ? 0.8 : 0.6) +
    (volume > avgVol * 1.5 ? 0.1 : 0) +
    (trendState !== TrendState.REVERSAL ? 0.1 : 0);

  return {
    symbol,
    exchange: undefined as any, // Set by caller
    direction,
    strength,
    confidence: Math.min(1, confidence),
    entryPrice: close,
    stopLoss,
    takeProfits,
    trendState,
    supertrendValue: stValue,
    emaValues: {
      fast: emaFast,
      mid: emaMid,
      slow: emaSlow
    },
    timestamp: candles[i].time,
    reason: entryReason
  };
}

/**
 * Check for exit signal (trend reversal)
 */
export function checkExitSignal(
  position: { direction: TradeDirection; entryPrice: number; stopLoss: number },
  candles: Candle[],
  state: StrategyState,
  config: TrendStrategyConfig
): { shouldExit: boolean; reason: string } {
  const i = candles.length - 1;
  const close = candles[i].close;

  const stDirection = state.supertrend.direction[i];
  const stValue = state.supertrend.value[i];

  if (stDirection === null || stValue === null) {
    return { shouldExit: false, reason: '' };
  }

  // Long exit conditions
  if (position.direction === TradeDirection.LONG) {
    if (stDirection === -1) {
      return { shouldExit: true, reason: 'SuperTrend flipped to downtrend' };
    }
    if (close < stValue) {
      return { shouldExit: true, reason: 'Price broke below SuperTrend line' };
    }
    if (close <= position.stopLoss) {
      return { shouldExit: true, reason: 'Stop loss hit' };
    }
  }

  // Short exit conditions
  if (position.direction === TradeDirection.SHORT) {
    if (stDirection === 1) {
      return { shouldExit: true, reason: 'SuperTrend flipped to uptrend' };
    }
    if (close > stValue) {
      return { shouldExit: true, reason: 'Price broke above SuperTrend line' };
    }
    if (close >= position.stopLoss) {
      return { shouldExit: true, reason: 'Stop loss hit' };
    }
  }

  return { shouldExit: false, reason: '' };
}

/**
 * Update trailing stop for a position
 */
export function updateTrailingStop(
  position: {
    direction: TradeDirection;
    entryPrice: number;
    stopLoss: number;
    highestPrice?: number;
    lowestPrice?: number;
    trailingStopActivated: boolean;
    trailingStopPrice?: number;
  },
  currentPrice: number,
  config: TrendStrategyConfig
): number | null {
  if (!config.useTrailingStop) {
    return null;
  }

  const pnlPercent = position.direction === TradeDirection.LONG
    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    : ((position.entryPrice - currentPrice) / position.entryPrice) * 100;

  // Check activation
  if (!position.trailingStopActivated) {
    if (pnlPercent >= config.trailingStopActivation) {
      position.trailingStopActivated = true;
    } else {
      return null;
    }
  }

  // Update highest/lowest price
  if (position.direction === TradeDirection.LONG) {
    position.highestPrice = Math.max(position.highestPrice ?? currentPrice, currentPrice);
    const newStop = position.highestPrice * (1 - config.trailingStopDistance / 100);
    return Math.max(position.stopLoss, newStop);
  } else {
    position.lowestPrice = Math.min(position.lowestPrice ?? currentPrice, currentPrice);
    const newStop = position.lowestPrice * (1 + config.trailingStopDistance / 100);
    return Math.min(position.stopLoss, newStop);
  }
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_STRATEGY_CONFIG: TrendStrategyConfig = {
  emaFastPeriod: 20,
  emaMidPeriod: 50,
  emaSlowPeriod: 200,
  supertrendPeriod: 10,
  supertrendMultiplier: 3.0,
  requireAllEMAAlign: true,
  minVolumeMultiplier: 1.2,
  useTrailingStop: true,
  trailingStopActivation: 1.5, // Activate at 1.5% profit
  trailingStopDistance: 1.0    // 1% trailing distance
};
