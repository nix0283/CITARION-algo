/**
 * Execute Indicator API
 * 
 * POST /api/indicators/execute - Execute indicator on OHLCV data
 * 
 * Uses PineTS to run custom indicators
 */

import { NextRequest, NextResponse } from 'next/server';

// Indicator execution without PineTS (using direct calculation)
// This is a simpler approach that works in browser

interface OHLCVCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorResult {
  name: string;
  type: 'line' | 'histogram' | 'area';
  color?: string;
  values: { time: number; value: number }[];
}

// POST - Execute indicator
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      indicator,
      ohlcv,
      inputs = {},
    } = body as {
      indicator: string;
      ohlcv: OHLCVCandle[];
      inputs: Record<string, number | string | boolean>;
    };

    if (!ohlcv || ohlcv.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'OHLCV data is required',
      }, { status: 400 });
    }

    // Parse and execute indicator
    const results = await executeIndicator(indicator, ohlcv, inputs);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Failed to execute indicator:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute indicator',
    }, { status: 500 });
  }
}

/**
 * Execute built-in or custom indicator
 */
async function executeIndicator(
  indicator: string,
  ohlcv: OHLCVCandle[],
  inputs: Record<string, number | string | boolean>
): Promise<IndicatorResult[]> {
  const closes = ohlcv.map(c => c.close);
  const highs = ohlcv.map(c => c.high);
  const lows = ohlcv.map(c => c.low);
  const volumes = ohlcv.map(c => c.volume);
  const times = ohlcv.map(c => c.time);

  // Built-in indicators
  const indicatorLower = indicator.toLowerCase();

  // SMA
  if (indicatorLower === 'sma' || indicatorLower.includes('sma')) {
    const length = (inputs.length as number) || 20;
    const values = calculateSMA(closes, length);
    return [{
      name: `SMA ${length}`,
      type: 'line',
      color: '#2962FF',
      values: times.slice(length - 1).map((t, i) => ({ time: t, value: values[i] })),
    }];
  }

  // EMA
  if (indicatorLower === 'ema' || indicatorLower.includes('ema')) {
    const length = (inputs.length as number) || 20;
    const values = calculateEMA(closes, length);
    return [{
      name: `EMA ${length}`,
      type: 'line',
      color: '#00C853',
      values: times.map((t, i) => ({ time: t, value: values[i] })),
    }];
  }

  // RSI
  if (indicatorLower === 'rsi' || indicatorLower.includes('rsi')) {
    const length = (inputs.length as number) || 14;
    const values = calculateRSI(closes, length);
    return [{
      name: `RSI ${length}`,
      type: 'line',
      color: '#D500F9',
      values: times.slice(length).map((t, i) => ({ time: t, value: values[i] })),
    }];
  }

  // MACD
  if (indicatorLower === 'macd' || indicatorLower.includes('macd')) {
    const fastLength = (inputs.fastLength as number) || 12;
    const slowLength = (inputs.slowLength as number) || 26;
    const signalLength = (inputs.signalLength as number) || 9;
    
    const { macd, signal, histogram } = calculateMACD(closes, fastLength, slowLength, signalLength);
    const startIdx = slowLength + signalLength - 2;
    
    return [
      {
        name: 'MACD',
        type: 'line',
        color: '#2962FF',
        values: times.slice(startIdx).map((t, i) => ({ time: t, value: macd[i] })),
      },
      {
        name: 'Signal',
        type: 'line',
        color: '#FF6D00',
        values: times.slice(startIdx).map((t, i) => ({ time: t, value: signal[i] })),
      },
      {
        name: 'Histogram',
        type: 'histogram',
        color: '#26a69a',
        values: times.slice(startIdx).map((t, i) => ({ time: t, value: histogram[i] })),
      },
    ];
  }

  // Bollinger Bands
  if (indicatorLower === 'bb' || indicatorLower.includes('bollinger')) {
    const length = (inputs.length as number) || 20;
    const mult = (inputs.mult as number) || 2;
    
    const { upper, middle, lower } = calculateBollingerBands(closes, length, mult);
    const startIdx = length - 1;
    
    return [
      {
        name: 'BB Upper',
        type: 'line',
        color: '#2962FF',
        values: times.slice(startIdx).map((t, i) => ({ time: t, value: upper[i] })),
      },
      {
        name: 'BB Middle',
        type: 'line',
        color: '#FF6D00',
        values: times.slice(startIdx).map((t, i) => ({ time: t, value: middle[i] })),
      },
      {
        name: 'BB Lower',
        type: 'line',
        color: '#2962FF',
        values: times.slice(startIdx).map((t, i) => ({ time: t, value: lower[i] })),
      },
    ];
  }

  // ATR
  if (indicatorLower === 'atr' || indicatorLower.includes('atr')) {
    const length = (inputs.length as number) || 14;
    const values = calculateATR(highs, lows, closes, length);
    return [{
      name: `ATR ${length}`,
      type: 'line',
      color: '#FF6D00',
      values: times.slice(length).map((t, i) => ({ time: t, value: values[i] })),
    }];
  }

  // Volume SMA
  if (indicatorLower === 'vol_sma' || indicatorLower.includes('volume')) {
    const length = (inputs.length as number) || 20;
    const values = calculateSMA(volumes, length);
    return [{
      name: `Vol SMA ${length}`,
      type: 'line',
      color: '#00C853',
      values: times.slice(length - 1).map((t, i) => ({ time: t, value: values[i] })),
    }];
  }

  // Default: return close prices
  return [{
    name: 'Close',
    type: 'line',
    color: '#2962FF',
    values: times.map((t, i) => ({ time: t, value: closes[i] })),
  }];
}

// ==================== INDICATOR CALCULATIONS ====================

function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result.push(sum / period);
  }
  return result;
}

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  let ema = sum / period;
  result.push(ema);

  // Calculate EMA
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }

  return result;
}

function calculateRSI(closes: number[], period: number): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate gains and losses
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // First RSI
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) {
    result.push(100);
  } else {
    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }

  // Subsequent RSI
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}

function calculateMACD(
  closes: number[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  // MACD line
  const macd: number[] = [];
  const offset = slowPeriod - fastPeriod;
  for (let i = 0; i < slowEMA.length; i++) {
    macd.push(fastEMA[i + offset] - slowEMA[i]);
  }

  // Signal line
  const signal = calculateEMA(macd, signalPeriod);

  // Histogram
  const histogram: number[] = [];
  const signalOffset = signalPeriod - 1;
  for (let i = 0; i < signal.length; i++) {
    histogram.push(macd[i + signalOffset] - signal[i]);
  }

  return { macd, signal, histogram };
}

function calculateBollingerBands(
  closes: number[],
  period: number,
  mult: number
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = calculateSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i - period + 1];
    
    // Calculate standard deviation
    const squaredDiffs = slice.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(avgSquaredDiff);

    upper.push(mean + mult * stdDev);
    lower.push(mean - mult * stdDev);
  }

  return { upper, middle, lower };
}

function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number
): number[] {
  const trueRanges: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  // First ATR is SMA of TR
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [atr];

  // Subsequent ATRs
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push(atr);
  }

  return result;
}
