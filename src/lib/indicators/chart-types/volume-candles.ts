/**
 * Volume Candlesticks Chart Implementation
 *
 * Volume Candlesticks combine price action with volume information.
 * The width or color intensity of each candle represents the volume,
 * providing insight into the strength of price movements.
 *
 * Types of Volume Candles:
 * 1. Width-based: Candle width proportional to volume
 * 2. Color intensity: Candle color intensity based on volume
 * 3. Volume-weighted: Volume information embedded in the candle
 *
 * References:
 * - Various trading platforms implement volume candles differently
 */

import type { Time, LineData, WhitespaceData } from "lightweight-charts";
import type { Candle, IndicatorResult } from "../calculator";

// ==================== TYPES ====================

export interface VolumeCandleConfig {
  volumePeriod: number;    // Period for volume average
  widthScaleMin: number;   // Minimum width scale (0-1)
  widthScaleMax: number;   // Maximum width scale (0-1)
}

export interface VolumeCandle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeRatio: number;     // Volume relative to average
  width: number;           // Relative width (0-1)
  intensity: number;       // Color intensity (0-1)
  direction: 'bullish' | 'bearish';
  strength: 'high' | 'normal' | 'low';
}

// ==================== HELPER FUNCTIONS ====================

function calculateAverageVolume(candles: Candle[], period: number): number {
  if (candles.length === 0) return 0;

  const volumes = candles.slice(-period).map(c => c.volume || 0);
  return volumes.reduce((a, b) => a + b, 0) / volumes.length;
}

// ==================== MAIN CALCULATION ====================

/**
 * Calculate Volume Candlesticks
 */
export function calculateVolumeCandles(
  candles: Candle[],
  config: Partial<VolumeCandleConfig> = {}
): IndicatorResult {
  const volumePeriod = config.volumePeriod ?? 20;
  const openValues: (number | null)[] = new Array(candles.length).fill(null);
  const closeValues: (number | null)[] = new Array(candles.length).fill(null);
  const highValues: (number | null)[] = new Array(candles.length).fill(null);
  const lowValues: (number | null)[] = new Array(candles.length).fill(null);
  const volumeValues: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length === 0) {
    return {
      id: 'volume_candles',
      overlay: true,
      lines: [],
      histograms: [],
    };
  }

  for (let i = 0; i < candles.length; i++) {
    openValues[i] = candles[i].open;
    closeValues[i] = candles[i].close;
    highValues[i] = candles[i].high;
    lowValues[i] = candles[i].low;
    volumeValues[i] = candles[i].volume || 0;
  }

  // Build line data
  const buildLineData = (
    values: (number | null)[]
  ): (LineData<Time> | WhitespaceData<Time>)[] => {
    return candles.map((c, i) => {
      const value = values[i];
      if (value !== null && !isNaN(value) && isFinite(value)) {
        return { time: c.time, value };
      }
      return { time: c.time };
    });
  };

  return {
    id: 'volume_candles',
    overlay: true,
    lines: [
      { name: 'vc_open', data: buildLineData(openValues), color: '#2962FF' },
      { name: 'vc_close', data: buildLineData(closeValues), color: '#FF6D00' },
      { name: 'vc_high', data: buildLineData(highValues), color: '#26A69A' },
      { name: 'vc_low', data: buildLineData(lowValues), color: '#EF5350' },
      { name: 'vc_volume', data: buildLineData(volumeValues), color: '#9C27B0' },
    ],
    histograms: [],
  };
}

/**
 * Get Volume Candlesticks with volume information
 */
export function getVolumeCandles(
  candles: Candle[],
  config: Partial<VolumeCandleConfig> = {}
): VolumeCandle[] {
  const result: VolumeCandle[] = [];
  const volumePeriod = config.volumePeriod ?? 20;
  const widthScaleMin = config.widthScaleMin ?? 0.3;
  const widthScaleMax = config.widthScaleMax ?? 1.0;

  if (candles.length === 0) return result;

  // Calculate max volume for scaling
  const maxVolume = Math.max(...candles.map(c => c.volume || 0));

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const avgVolume = calculateAverageVolume(candles.slice(0, i + 1), volumePeriod);
    const volume = candle.volume || 0;

    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

    // Width based on volume ratio
    const normalizedVolume = maxVolume > 0 ? volume / maxVolume : 0;
    const width = widthScaleMin + normalizedVolume * (widthScaleMax - widthScaleMin);

    // Intensity based on volume ratio
    const intensity = Math.min(1, volumeRatio / 2);

    // Strength classification
    let strength: VolumeCandle['strength'];
    if (volumeRatio > 1.5) {
      strength = 'high';
    } else if (volumeRatio < 0.7) {
      strength = 'low';
    } else {
      strength = 'normal';
    }

    result.push({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume,
      volumeRatio,
      width,
      intensity,
      direction: candle.close > candle.open ? 'bullish' : 'bearish',
      strength,
    });
  }

  return result;
}

/**
 * Analyze Volume Candlestick patterns
 */
export function analyzeVolumeCandlePattern(candles: Candle[]): {
  trend: 'bullish' | 'bearish' | 'neutral';
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  signal: string;
} {
  if (candles.length < 3) {
    return {
      trend: 'neutral',
      volumeTrend: 'stable',
      signal: 'Insufficient data',
    };
  }

  const volumeCandles = getVolumeCandles(candles);
  const recent = volumeCandles.slice(-5);

  // Analyze price trend
  let bullishCount = 0;
  let bearishCount = 0;

  for (const vc of recent) {
    if (vc.direction === 'bullish') bullishCount++;
    else bearishCount++;
  }

  const trend = bullishCount > bearishCount ? 'bullish'
    : bearishCount > bullishCount ? 'bearish'
    : 'neutral';

  // Analyze volume trend
  const volumes = recent.map(vc => vc.volume);
  const avgFirstHalf = (volumes[0] + volumes[1] + volumes[2]) / 3;
  const avgSecondHalf = (volumes[2] + volumes[3] + volumes[4]) / 3;

  const volumeTrend = avgSecondHalf > avgFirstHalf * 1.2 ? 'increasing'
    : avgSecondHalf < avgFirstHalf * 0.8 ? 'decreasing'
    : 'stable';

  // Generate signal
  let signal = '';
  const lastVc = recent[recent.length - 1];

  if (trend === 'bullish' && volumeTrend === 'increasing' && lastVc.strength === 'high') {
    signal = 'Strong bullish signal - high volume buying';
  } else if (trend === 'bearish' && volumeTrend === 'increasing' && lastVc.strength === 'high') {
    signal = 'Strong bearish signal - high volume selling';
  } else if (trend === 'bullish' && volumeTrend === 'decreasing') {
    signal = 'Weak bullish - declining volume on rally';
  } else if (trend === 'bearish' && volumeTrend === 'decreasing') {
    signal = 'Weak bearish - declining volume on decline';
  } else {
    signal = 'Neutral - mixed signals';
  }

  return { trend, volumeTrend, signal };
}

export default {
  calculateVolumeCandles,
  getVolumeCandles,
  analyzeVolumeCandlePattern,
};
