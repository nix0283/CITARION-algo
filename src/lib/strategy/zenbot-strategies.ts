/**
 * Zenbot Strategies Port
 * 
 * Портированные стратегии из Zenbot (https://github.com/DeviaVir/zenbot)
 * 
 * Стратегии:
 * - bollinger: Bollinger Bands Mean Reversion
 * - crossover_vwap: VWAP/EMA Crossover
 * - dema: Double EMA Crossover
 * - momentum: Momentum Strategy
 * - neural: Neural Network Prediction
 * - sar: Parabolic SAR
 * - srsi_macd: Stochastic RSI + MACD
 * - ta_ema: Trend EMA with RSI filter
 * - ta_ppo: Percentage Price Oscillator
 * - ta_trix: TRIX Oscillator
 * - ta_ultosc: Ultimate Oscillator
 * - ti_hma: Hull Moving Average
 * - trust_distrust: Trust/Distrust Reversal
 * - wavetrend: Wave Trend
 * - cci_srsi: Stochastic CCI
 * 
 * @author CITARION (ported from Zenbot)
 * @version 1.0.0
 */

import { Candle, IndicatorResult, StrategySignal, StrategyConfig, BaseStrategy, SignalType } from "./types";
import { RSI, EMA, SMA } from "./indicators";
import { PREDEFINED_TACTICS_SETS } from "./tactics/types";

// ==================== INDICATOR HELPERS ====================

/**
 * Standard Deviation
 */
function standardDeviation(data: number[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    result.push(Math.sqrt(variance));
  }
  
  return result;
}

/**
 * Bollinger Bands calculation
 */
function bollingerBands(data: number[], period: number, stdDev: number): {
  upper: number[];
  middle: number[];
  lower: number[];
} {
  const middle = SMA(data, period);
  const std = standardDeviation(data, period);
  
  const upper = middle.map((m, i) => m + std[i] * stdDev);
  const lower = middle.map((m, i) => m - std[i] * stdDev);
  
  return { upper, middle, lower };
}

/**
 * VWAP calculation
 */
function calculateVWAP(candles: Candle[], maxPeriods: number = 8000): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const startIdx = Math.max(0, i - maxPeriods + 1);
    
    if (i >= maxPeriods) {
      // Remove old values
      for (let j = startIdx - 1; j < i - maxPeriods + 1; j++) {
        const oldTp = (candles[j].high + candles[j].low + candles[j].close) / 3;
        cumulativeTPV -= oldTp * candles[j].volume;
        cumulativeVolume -= candles[j].volume;
      }
    }
    
    cumulativeTPV += tp * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    
    result.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : tp);
  }
  
  return result;
}

/**
 * Parabolic SAR
 */
function parabolicSAR(candles: Candle[], af: number = 0.015, maxAF: number = 0.3): number[] {
  const result: number[] = [];
  let isUptrend = true;
  let ep = candles[0].low;
  let sar = candles[0].high;
  let accelerationFactor = af;
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(candles[0].close);
      continue;
    }
    
    const prevSAR = result[i - 1];
    
    if (isUptrend) {
      sar = prevSAR + accelerationFactor * (ep - prevSAR);
      sar = Math.min(sar, candles[i - 1].low, candles[i].low);
      
      if (candles[i].low < sar) {
        isUptrend = false;
        sar = ep;
        accelerationFactor = af;
        ep = candles[i].low;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          accelerationFactor = Math.min(accelerationFactor + af, maxAF);
        }
      }
    } else {
      sar = prevSAR - accelerationFactor * (prevSAR - ep);
      sar = Math.max(sar, candles[i - 1].high, candles[i].high);
      
      if (candles[i].high > sar) {
        isUptrend = true;
        sar = ep;
        accelerationFactor = af;
        ep = candles[i].high;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          accelerationFactor = Math.min(accelerationFactor + af, maxAF);
        }
      }
    }
    
    result.push(sar);
  }
  
  return result;
}

/**
 * Stochastic RSI
 */
function stochasticRSI(data: number[], rsiPeriod: number, stochPeriod: number, kPeriod: number, dPeriod: number): {
  k: number[];
  d: number[];
} {
  const rsi = RSI(data, rsiPeriod);
  const kRaw: number[] = [];
  
  for (let i = 0; i < rsi.length; i++) {
    if (i < stochPeriod - 1) {
      kRaw.push(NaN);
      continue;
    }
    
    const slice = rsi.slice(i - stochPeriod + 1, i + 1);
    const highest = Math.max(...slice.filter(v => !isNaN(v)));
    const lowest = Math.min(...slice.filter(v => !isNaN(v)));
    
    if (highest === lowest) {
      kRaw.push(50);
    } else {
      kRaw.push(((rsi[i] - lowest) / (highest - lowest)) * 100);
    }
  }
  
  const k = SMA(kRaw, kPeriod);
  const d = SMA(k, dPeriod);
  
  return { k, d };
}

/**
 * CCI (Commodity Channel Index)
 */
function CCI(candles: Candle[], period: number, constant: number = 0.015): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    
    const slice = candles.slice(i - period + 1, i + 1);
    const tpValues = slice.map(c => (c.high + c.low + c.close) / 3);
    const sma = tpValues.reduce((a, b) => a + b, 0) / period;
    const meanDev = tpValues.reduce((acc, val) => acc + Math.abs(val - sma), 0) / period;
    
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    result.push(meanDev > 0 ? (tp - sma) / (constant * meanDev) : 0);
  }
  
  return result;
}

/**
 * TRIX Indicator
 */
function TRIX(data: number[], period: number): number[] {
  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1, period);
  const ema3 = EMA(ema2, period);
  
  const result: number[] = [];
  let prevEma3 = 0;
  
  for (let i = 0; i < ema3.length; i++) {
    if (isNaN(ema3[i]) || i === 0) {
      result.push(NaN);
      prevEma3 = ema3[i] || 0;
      continue;
    }
    
    if (prevEma3 !== 0) {
      result.push(((ema3[i] - prevEma3) / prevEma3) * 100);
    } else {
      result.push(0);
    }
    prevEma3 = ema3[i];
  }
  
  return result;
}

/**
 * Ultimate Oscillator
 */
function ultimateOscillator(candles: Candle[], period1: number, period2: number, period3: number): number[] {
  const result: number[] = [];
  const bp: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    bp.push(candles[i].close - Math.min(candles[i].low, prevClose));
    tr.push(Math.max(candles[i].high, prevClose) - Math.min(candles[i].low, prevClose));
  }
  
  for (let i = 0; i < candles.length; i++) {
    if (i < Math.max(period1, period2, period3) - 1) {
      result.push(NaN);
      continue;
    }
    
    const sumBP1 = bp.slice(i - period1 + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumTR1 = tr.slice(i - period1 + 1, i + 1).reduce((a, b) => a + b, 0);
    const avg1 = sumTR1 > 0 ? sumBP1 / sumTR1 : 0;
    
    const sumBP2 = bp.slice(i - period2 + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumTR2 = tr.slice(i - period2 + 1, i + 1).reduce((a, b) => a + b, 0);
    const avg2 = sumTR2 > 0 ? sumBP2 / sumTR2 : 0;
    
    const sumBP3 = bp.slice(i - period3 + 1, i + 1).reduce((a, b) => a + b, 0);
    const sumTR3 = tr.slice(i - period3 + 1, i + 1).reduce((a, b) => a + b, 0);
    const avg3 = sumTR3 > 0 ? sumBP3 / sumTR3 : 0;
    
    result.push(100 * ((4 * avg1 + 2 * avg2 + avg3) / 7));
  }
  
  return result;
}

/**
 * Hull Moving Average
 */
function hullMA(data: number[], period: number): number[] {
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));
  
  const wmaHalf = WMA(data, halfPeriod);
  const wmaFull = WMA(data, period);
  
  const rawHMA = wmaHalf.map((v, i) => 2 * v - wmaFull[i]);
  return WMA(rawHMA, sqrtPeriod);
}

/**
 * Weighted Moving Average
 */
function WMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const weightSum = (period * (period + 1)) / 2;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - period + 1 + j] * (j + 1);
    }
    result.push(sum / weightSum);
  }
  
  return result;
}

/**
 * Wave Trend Indicator
 */
function waveTrend(candles: Candle[], channelLength: number, avgLength: number): {
  wave1: number[];
  wave2: number[];
} {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3);
  const esa = EMA(hlc3, channelLength);
  
  const diff = hlc3.map((h, i) => Math.abs(h - esa[i]));
  const ci = diff.map((d, i) => esa[i] > 0 ? d / EMA(diff, channelLength)[i] : 0);
  
  const tci = EMA(ci, avgLength);
  const wave1 = tci.map(v => v * 100);
  const wave2 = SMA(wave1, 3);
  
  return { wave1, wave2 };
}

/**
 * Momentum Indicator
 */
function momentum(data: number[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
      continue;
    }
    result.push(data[i] - data[i - period]);
  }
  
  return result;
}

/**
 * Percentage Price Oscillator (PPO)
 */
function PPO(data: number[], fastPeriod: number, slowPeriod: number, signalPeriod: number): {
  ppo: number[];
  signal: number[];
  histogram: number[];
} {
  const fastEMA = EMA(data, fastPeriod);
  const slowEMA = EMA(data, slowPeriod);
  
  const ppo = fastEMA.map((f, i) => {
    if (isNaN(f) || isNaN(slowEMA[i]) || slowEMA[i] === 0) return NaN;
    return ((f - slowEMA[i]) / slowEMA[i]) * 100;
  });
  
  const signal = EMA(ppo, signalPeriod);
  const histogram = ppo.map((p, i) => p - signal[i]);
  
  return { ppo, signal, histogram };
}

// ==================== ZENBOT STRATEGIES ====================

// ==================== 1. BOLLINGER BANDS (Zenbot) ====================

const ZENBOT_BOLLINGER_CONFIG: StrategyConfig = {
  id: "zenbot-bollinger",
  name: "Zenbot Bollinger Bands",
  description: "Buy when price touches lower band, sell when touches upper band",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["5m", "15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "period", type: "integer", defaultValue: 20, min: 10, max: 50, category: "Bollinger" },
    { name: "stdDev", type: "number", defaultValue: 2, min: 1, max: 3, category: "Bollinger" },
    { name: "upperBoundPct", type: "number", defaultValue: 0, min: 0, max: 5, category: "Bollinger" },
    { name: "lowerBoundPct", type: "number", defaultValue: 0, min: 0, max: 5, category: "Bollinger" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["mean-reversion", "zenbot", "bollinger"],
  minCandlesRequired: 52,
};

export class ZenbotBollingerStrategy extends BaseStrategy {
  private upper: number[] = [];
  private middle: number[] = [];
  private lower: number[] = [];

  constructor() {
    super(ZENBOT_BOLLINGER_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.period);
    const stdDev = Number(this.parameters.stdDev);

    const bb = bollingerBands(closes, period, stdDev);
    this.upper = bb.upper;
    this.middle = bb.middle;
    this.lower = bb.lower;

    return { bollingerBands: bb };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const upper = this.upper[lastIndex];
    const lower = this.lower[lastIndex];

    if (isNaN(upper) || isNaN(lower)) return null;

    const upperBoundPct = Number(this.parameters.upperBoundPct) / 100;
    const lowerBoundPct = Number(this.parameters.lowerBoundPct) / 100;

    const upperThreshold = upper * (1 - upperBoundPct);
    const lowerThreshold = lower * (1 + lowerBoundPct);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    if (currentPrice <= lowerThreshold) {
      signalType = "LONG";
      reason = `Price near lower BB (${currentPrice.toFixed(2)} <= ${lowerThreshold.toFixed(2)})`;
    } else if (currentPrice >= upperThreshold) {
      signalType = "SHORT";
      reason = `Price near upper BB (${currentPrice.toFixed(2)} >= ${upperThreshold.toFixed(2)})`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: signalType === "LONG"
        ? currentPrice * 0.98
        : currentPrice * 1.02,
      reason,
      metadata: { upper, lower, middle: this.middle[lastIndex] },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const middle = this.middle[lastIndex];

    if (isNaN(middle)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && position.currentPrice >= middle) {
      shouldExit = true;
      reason = "Price reached middle BB - exit long";
    }
    if (position.direction === "SHORT" && position.currentPrice <= middle) {
      shouldExit = true;
      reason = "Price reached middle BB - exit short";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 2. VWAP CROSSOVER (Zenbot) ====================

const ZENBOT_VWAP_CONFIG: StrategyConfig = {
  id: "zenbot-vwap-crossover",
  name: "Zenbot VWAP Crossover",
  description: "Trade based on VWAP vs EMA crossover",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "2h",
  parameters: [
    { name: "emaLength", type: "integer", defaultValue: 30, min: 10, max: 100, category: "EMA" },
    { name: "smaLength1", type: "integer", defaultValue: 108, min: 50, max: 200, category: "SMA" },
    { name: "smaLength2", type: "integer", defaultValue: 60, min: 20, max: 100, category: "SMA" },
    { name: "vwapLength", type: "integer", defaultValue: 10, min: 5, max: 50, category: "VWAP" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["trend", "zenbot", "vwap"],
  minCandlesRequired: 200,
};

export class ZenbotVWAPStrategy extends BaseStrategy {
  private vwap: number[] = [];
  private ema: number[] = [];

  constructor() {
    super(ZENBOT_VWAP_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const emaLength = Number(this.parameters.emaLength);

    this.vwap = calculateVWAP(candles, 8000);
    this.ema = EMA(closes, emaLength);

    return {
      vwap: this.vwap,
      ema: { [emaLength]: this.ema },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const vwap = this.vwap[lastIndex];
    const ema = this.ema[lastIndex];

    if (isNaN(vwap) || isNaN(ema)) return null;

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // VWAP above EMA = bullish
    if (vwap > ema) {
      signalType = "LONG";
      reason = `VWAP (${vwap.toFixed(2)}) above EMA (${ema.toFixed(2)})`;
    } else if (vwap < ema) {
      signalType = "SHORT";
      reason = `VWAP (${vwap.toFixed(2)}) below EMA (${ema.toFixed(2)})`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 65,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { vwap, ema },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const vwap = this.vwap[lastIndex];
    const ema = this.ema[lastIndex];

    if (isNaN(vwap) || isNaN(ema)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && vwap < ema) {
      shouldExit = true;
      reason = "VWAP crossed below EMA - exit long";
    }
    if (position.direction === "SHORT" && vwap > ema) {
      shouldExit = true;
      reason = "VWAP crossed above EMA - exit short";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 65,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 3. DEMA (Double EMA) ====================

const ZENBOT_DEMA_CONFIG: StrategyConfig = {
  id: "zenbot-dema",
  name: "Zenbot DEMA Crossover",
  description: "Trade on short/long EMA crossover with RSI filter",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "emaShort", type: "integer", defaultValue: 10, min: 5, max: 30, category: "EMA" },
    { name: "emaLong", type: "integer", defaultValue: 21, min: 10, max: 50, category: "EMA" },
    { name: "upTrendThreshold", type: "number", defaultValue: 0, min: -1, max: 1, category: "Signal" },
    { name: "downTrendThreshold", type: "number", defaultValue: 0, min: -1, max: 1, category: "Signal" },
    { name: "overboughtRSI", type: "number", defaultValue: 80, min: 70, max: 95, category: "RSI" },
    { name: "noiseLevelPct", type: "number", defaultValue: 0, min: 0, max: 5, category: "Filter" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["trend", "zenbot", "ema"],
  minCandlesRequired: 21,
};

export class ZenbotDEMAStrategy extends BaseStrategy {
  private shortEMA: number[] = [];
  private longEMA: number[] = [];
  private rsiValues: number[] = [];

  constructor() {
    super(ZENBOT_DEMA_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const shortPeriod = Number(this.parameters.emaShort);
    const longPeriod = Number(this.parameters.emaLong);

    this.shortEMA = EMA(closes, shortPeriod);
    this.longEMA = EMA(closes, longPeriod);
    this.rsiValues = RSI(closes, 9);

    return {
      ema: { [shortPeriod]: this.shortEMA, [longPeriod]: this.longEMA },
      rsi: { 9: this.rsiValues },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const short = this.shortEMA[lastIndex];
    const shortPrev = this.shortEMA[lastIndex - 1];
    const long = this.longEMA[lastIndex];
    const rsi = this.rsiValues[lastIndex];

    if (isNaN(short) || isNaN(long) || isNaN(rsi)) return null;

    const upTrend = Number(this.parameters.upTrendThreshold);
    const downTrend = Number(this.parameters.downTrendThreshold);
    const overbought = Number(this.parameters.overboughtRSI);
    const noiseLevel = Number(this.parameters.noiseLevelPct) / 100;

    const trend = short - long;
    const trendPrev = shortPrev - long;

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Check noise filter
    if (noiseLevel > 0 && Math.abs(short - shortPrev) / shortPrev < noiseLevel) {
      return null;
    }

    // Bullish crossover
    if (trend > upTrend && trendPrev <= upTrend && rsi < overbought) {
      signalType = "LONG";
      reason = `DEMA bullish crossover, RSI: ${rsi.toFixed(1)}`;
    }
    // Bearish crossover
    else if (trend < downTrend && trendPrev >= downTrend) {
      signalType = "SHORT";
      reason = `DEMA bearish crossover`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { shortEMA: short, longEMA: long, rsi, trend },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const short = this.shortEMA[lastIndex];
    const long = this.longEMA[lastIndex];

    if (isNaN(short) || isNaN(long)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && short < long) {
      shouldExit = true;
      reason = "DEMA bearish crossover - exit long";
    }
    if (position.direction === "SHORT" && short > long) {
      shouldExit = true;
      reason = "DEMA bullish crossover - exit short";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 4. PARABOLIC SAR ====================

const ZENBOT_SAR_CONFIG: StrategyConfig = {
  id: "zenbot-sar",
  name: "Zenbot Parabolic SAR",
  description: "Trade on Parabolic SAR reversals",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["1m", "5m", "15m"],
  defaultTimeframe: "2m",
  parameters: [
    { name: "af", type: "number", defaultValue: 0.015, min: 0.005, max: 0.05, category: "SAR" },
    { name: "maxAF", type: "number", defaultValue: 0.3, min: 0.1, max: 0.5, category: "SAR" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["trend", "zenbot", "sar"],
  minCandlesRequired: 52,
};

export class ZenbotSARStrategy extends BaseStrategy {
  private sarValues: number[] = [];
  private trendDirection: boolean[] = [];

  constructor() {
    super(ZENBOT_SAR_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const af = Number(this.parameters.af);
    const maxAF = Number(this.parameters.maxAF);

    this.sarValues = parabolicSAR(candles, af, maxAF);
    
    // Determine trend direction
    this.trendDirection = candles.map((c, i) => c.close > this.sarValues[i]);

    return {
      custom: { sar: this.sarValues },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const sar = this.sarValues[lastIndex];
    const sarPrev = this.sarValues[lastIndex - 1];
    const isUptrend = this.trendDirection[lastIndex];
    const wasUptrend = this.trendDirection[lastIndex - 1];

    if (isNaN(sar) || isNaN(sarPrev)) return null;

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Trend reversal
    if (!wasUptrend && isUptrend) {
      signalType = "LONG";
      reason = "SAR reversed to uptrend";
    } else if (wasUptrend && !isUptrend) {
      signalType = "SHORT";
      reason = "SAR reversed to downtrend";
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 75,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: sar,
      reason,
      metadata: { sar, isUptrend },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const isUptrend = this.trendDirection[lastIndex];

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && !isUptrend) {
      shouldExit = true;
      reason = "SAR trend reversed - exit long";
    }
    if (position.direction === "SHORT" && isUptrend) {
      shouldExit = true;
      reason = "SAR trend reversed - exit short";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 75,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 5. MOMENTUM ====================

const ZENBOT_MOMENTUM_CONFIG: StrategyConfig = {
  id: "zenbot-momentum",
  name: "Zenbot Momentum",
  description: "Trade based on price momentum",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["5m", "15m", "1h"],
  defaultTimeframe: "15m",
  parameters: [
    { name: "momentumPeriod", type: "integer", defaultValue: 5, min: 2, max: 20, category: "Momentum" },
    { name: "threshold", type: "number", defaultValue: 0, min: -1, max: 1, category: "Signal" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["momentum", "zenbot"],
  minCandlesRequired: 30,
};

export class ZenbotMomentumStrategy extends BaseStrategy {
  private momentumValues: number[] = [];

  constructor() {
    super(ZENBOT_MOMENTUM_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.momentumPeriod);

    this.momentumValues = momentum(closes, period);

    return {
      custom: { momentum: this.momentumValues },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const mom = this.momentumValues[lastIndex];
    const momPrev = this.momentumValues[lastIndex - 1];

    if (isNaN(mom) || isNaN(momPrev)) return null;

    const threshold = Number(this.parameters.threshold);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    if (mom > threshold && momPrev <= threshold) {
      signalType = "LONG";
      reason = `Momentum turned positive: ${mom.toFixed(4)}`;
    } else if (mom < threshold && momPrev >= threshold) {
      signalType = "SHORT";
      reason = `Momentum turned negative: ${mom.toFixed(4)}`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 65,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { momentum: mom },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const mom = this.momentumValues[lastIndex];

    if (isNaN(mom)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && mom < 0) {
      shouldExit = true;
      reason = "Momentum turned negative - exit long";
    }
    if (position.direction === "SHORT" && mom > 0) {
      shouldExit = true;
      reason = "Momentum turned positive - exit short";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 65,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 6. STOCHASTIC RSI + MACD ====================

const ZENBOT_SRSI_MACD_CONFIG: StrategyConfig = {
  id: "zenbot-srsi-macd",
  name: "Zenbot Stochastic MACD",
  description: "Combined Stochastic RSI with MACD for signal generation",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["15m", "30m", "1h"],
  defaultTimeframe: "30m",
  parameters: [
    { name: "rsiPeriod", type: "integer", defaultValue: 14, min: 7, max: 21, category: "RSI" },
    { name: "srsiPeriod", type: "integer", defaultValue: 9, min: 5, max: 14, category: "StochRSI" },
    { name: "srsiK", type: "integer", defaultValue: 5, min: 3, max: 10, category: "StochRSI" },
    { name: "srsiD", type: "integer", defaultValue: 3, min: 2, max: 5, category: "StochRSI" },
    { name: "oversoldRSI", type: "number", defaultValue: 20, min: 10, max: 30, category: "Levels" },
    { name: "overboughtRSI", type: "number", defaultValue: 80, min: 70, max: 90, category: "Levels" },
    { name: "emaShort", type: "integer", defaultValue: 24, min: 12, max: 30, category: "MACD" },
    { name: "emaLong", type: "integer", defaultValue: 200, min: 100, max: 300, category: "MACD" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["oscillator", "zenbot", "stochastic", "macd"],
  minCandlesRequired: 200,
};

export class ZenbotStochMACDStrategy extends BaseStrategy {
  private k: number[] = [];
  private d: number[] = [];
  private macd: number[] = [];
  private signal: number[] = [];

  constructor() {
    super(ZENBOT_SRSI_MACD_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const rsiPeriod = Number(this.parameters.rsiPeriod);
    const srsiPeriod = Number(this.parameters.srsiPeriod);
    const srsiK = Number(this.parameters.srsiK);
    const srsiD = Number(this.parameters.srsiD);
    const emaShort = Number(this.parameters.emaShort);
    const emaLong = Number(this.parameters.emaLong);

    const srsi = stochasticRSI(closes, rsiPeriod, srsiPeriod, srsiK, srsiD);
    this.k = srsi.k;
    this.d = srsi.d;

    const fastEMA = EMA(closes, emaShort);
    const slowEMA = EMA(closes, emaLong);
    this.macd = fastEMA.map((f, i) => f - slowEMA[i]);
    this.signal = EMA(this.macd, 9);

    return {
      stoch: { k: this.k, d: this.d },
      macd: { macd: this.macd, signal: this.signal, histogram: this.macd.map((m, i) => m - this.signal[i]) },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const k = this.k[lastIndex];
    const d = this.d[lastIndex];
    const macd = this.macd[lastIndex];
    const signal = this.signal[lastIndex];

    if (isNaN(k) || isNaN(d) || isNaN(macd) || isNaN(signal)) return null;

    const oversold = Number(this.parameters.oversoldRSI);
    const overbought = Number(this.parameters.overboughtRSI);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // LONG: K crosses above D in oversold zone + MACD bullish
    if (k < oversold && k > d && macd > signal) {
      signalType = "LONG";
      reason = `StochRSI oversold crossover + MACD bullish (K: ${k.toFixed(1)})`;
    }
    // SHORT: K crosses below D in overbought zone + MACD bearish
    else if (k > overbought && k < d && macd < signal) {
      signalType = "SHORT";
      reason = `StochRSI overbought crossover + MACD bearish (K: ${k.toFixed(1)})`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 75,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { k, d, macd, signal },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const k = this.k[lastIndex];
    const macd = this.macd[lastIndex];
    const signal = this.signal[lastIndex];

    if (isNaN(k) || isNaN(macd)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && (k > 80 || macd < signal)) {
      shouldExit = true;
      reason = k > 80 ? "StochRSI overbought" : "MACD bearish crossover";
    }
    if (position.direction === "SHORT" && (k < 20 || macd > signal)) {
      shouldExit = true;
      reason = k < 20 ? "StochRSI oversold" : "MACD bullish crossover";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 7. WAVE TREND ====================

const ZENBOT_WAVETREND_CONFIG: StrategyConfig = {
  id: "zenbot-wavetrend",
  name: "Zenbot Wave Trend",
  description: "Trade using Wave Trend oscillator",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "channelLength", type: "integer", defaultValue: 10, min: 5, max: 20, category: "Wave" },
    { name: "avgLength", type: "integer", defaultValue: 21, min: 10, max: 30, category: "Wave" },
    { name: "overbought1", type: "number", defaultValue: 60, min: 50, max: 70, category: "Levels" },
    { name: "overbought2", type: "number", defaultValue: 53, min: 45, max: 60, category: "Levels" },
    { name: "oversold1", type: "number", defaultValue: -60, min: -70, max: -50, category: "Levels" },
    { name: "oversold2", type: "number", defaultValue: -53, min: -60, max: -45, category: "Levels" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["oscillator", "zenbot", "wavetrend"],
  minCandlesRequired: 21,
};

export class ZenbotWaveTrendStrategy extends BaseStrategy {
  private wave1: number[] = [];
  private wave2: number[] = [];

  constructor() {
    super(ZENBOT_WAVETREND_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const channelLength = Number(this.parameters.channelLength);
    const avgLength = Number(this.parameters.avgLength);

    const wt = waveTrend(candles, channelLength, avgLength);
    this.wave1 = wt.wave1;
    this.wave2 = wt.wave2;

    return {
      custom: { wave1: this.wave1, wave2: this.wave2 },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const w1 = this.wave1[lastIndex];
    const w2 = this.wave2[lastIndex];
    const w1Prev = this.wave1[lastIndex - 1];
    const w2Prev = this.wave2[lastIndex - 1];

    if (isNaN(w1) || isNaN(w2)) return null;

    const ob1 = Number(this.parameters.overbought1);
    const ob2 = Number(this.parameters.overbought2);
    const os1 = Number(this.parameters.oversold1);
    const os2 = Number(this.parameters.oversold2);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // LONG: Wave crosses above signal in oversold
    if (w1 < os1 && w1Prev > w2Prev && w1 < w2) {
      signalType = "LONG";
      reason = `Wave Trend oversold crossover (${w1.toFixed(1)})`;
    }
    // SHORT: Wave crosses below signal in overbought
    else if (w1 > ob1 && w1Prev < w2Prev && w1 > w2) {
      signalType = "SHORT";
      reason = `Wave Trend overbought crossover (${w1.toFixed(1)})`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { wave1: w1, wave2: w2 },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const w1 = this.wave1[lastIndex];

    if (isNaN(w1)) return null;

    const ob2 = Number(this.parameters.overbought2);
    const os2 = Number(this.parameters.oversold2);

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && w1 > ob2) {
      shouldExit = true;
      reason = "Wave Trend reached overbought zone";
    }
    if (position.direction === "SHORT" && w1 < os2) {
      shouldExit = true;
      reason = "Wave Trend reached oversold zone";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 8. CCI SRSI ====================

const ZENBOT_CCI_SRSI_CONFIG: StrategyConfig = {
  id: "zenbot-cci-srsi",
  name: "Zenbot Stochastic CCI",
  description: "Combined CCI with Stochastic RSI for mean reversion",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["10m", "20m", "30m"],
  defaultTimeframe: "20m",
  parameters: [
    { name: "cciPeriod", type: "integer", defaultValue: 14, min: 7, max: 21, category: "CCI" },
    { name: "rsiPeriod", type: "integer", defaultValue: 14, min: 7, max: 21, category: "RSI" },
    { name: "srsiPeriod", type: "integer", defaultValue: 9, min: 5, max: 14, category: "StochRSI" },
    { name: "oversoldCCI", type: "number", defaultValue: -90, min: -150, max: -50, category: "Levels" },
    { name: "overboughtCCI", type: "number", defaultValue: 140, min: 100, max: 200, category: "Levels" },
    { name: "oversoldRSI", type: "number", defaultValue: 18, min: 10, max: 25, category: "Levels" },
    { name: "overboughtRSI", type: "number", defaultValue: 85, min: 75, max: 95, category: "Levels" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["oscillator", "zenbot", "cci", "stochastic"],
  minCandlesRequired: 30,
};

export class ZenbotCCISRSIStrategy extends BaseStrategy {
  private cci: number[] = [];
  private k: number[] = [];
  private d: number[] = [];

  constructor() {
    super(ZENBOT_CCI_SRSI_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const cciPeriod = Number(this.parameters.cciPeriod);
    const rsiPeriod = Number(this.parameters.rsiPeriod);
    const srsiPeriod = Number(this.parameters.srsiPeriod);

    this.cci = CCI(candles, cciPeriod);
    const srsi = stochasticRSI(closes, rsiPeriod, srsiPeriod, 5, 3);
    this.k = srsi.k;
    this.d = srsi.d;

    return {
      cci: this.cci,
      stoch: { k: this.k, d: this.d },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const cci = this.cci[lastIndex];
    const k = this.k[lastIndex];

    if (isNaN(cci) || isNaN(k)) return null;

    const osCCI = Number(this.parameters.oversoldCCI);
    const obCCI = Number(this.parameters.overboughtCCI);
    const osRSI = Number(this.parameters.oversoldRSI);
    const obRSI = Number(this.parameters.overboughtRSI);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // LONG: Both CCI and StochRSI oversold
    if (cci < osCCI && k < osRSI) {
      signalType = "LONG";
      reason = `CCI (${cci.toFixed(0)}) and StochRSI (${k.toFixed(0)}) both oversold`;
    }
    // SHORT: Both CCI and StochRSI overbought
    else if (cci > obCCI && k > obRSI) {
      signalType = "SHORT";
      reason = `CCI (${cci.toFixed(0)}) and StochRSI (${k.toFixed(0)}) both overbought`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 75,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { cci, k },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const cci = this.cci[lastIndex];
    const k = this.k[lastIndex];

    if (isNaN(cci) || isNaN(k)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && (cci > 0 || k > 50)) {
      shouldExit = true;
      reason = cci > 0 ? "CCI crossed above zero" : "StochRSI neutral zone";
    }
    if (position.direction === "SHORT" && (cci < 0 || k < 50)) {
      shouldExit = true;
      reason = cci < 0 ? "CCI crossed below zero" : "StochRSI neutral zone";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 9. TRIX ====================

const ZENBOT_TRIX_CONFIG: StrategyConfig = {
  id: "zenbot-trix",
  name: "Zenbot TRIX",
  description: "TRIX oscillator with RSI filter",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["5m", "10m", "15m"],
  defaultTimeframe: "5m",
  parameters: [
    { name: "trixPeriod", type: "integer", defaultValue: 30, min: 14, max: 50, category: "TRIX" },
    { name: "overboughtRSI", type: "number", defaultValue: 70, min: 60, max: 80, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["oscillator", "zenbot", "trix"],
  minCandlesRequired: 52,
};

export class ZenbotTRIXStrategy extends BaseStrategy {
  private trix: number[] = [];
  private rsi: number[] = [];

  constructor() {
    super(ZENBOT_TRIX_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.trixPeriod);

    this.trix = TRIX(closes, period);
    this.rsi = RSI(closes, 25);

    return {
      custom: { trix: this.trix },
      rsi: { 25: this.rsi },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const trix = this.trix[lastIndex];
    const trixPrev = this.trix[lastIndex - 1];
    const rsi = this.rsi[lastIndex];

    if (isNaN(trix) || isNaN(rsi)) return null;

    const obRSI = Number(this.parameters.overboughtRSI);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    if (trix > 0 && trixPrev <= 0 && rsi < obRSI) {
      signalType = "LONG";
      reason = `TRIX crossed above zero, RSI: ${rsi.toFixed(1)}`;
    } else if (trix < 0 && trixPrev >= 0) {
      signalType = "SHORT";
      reason = `TRIX crossed below zero`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 65,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { trix, rsi },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const trix = this.trix[lastIndex];

    if (isNaN(trix)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && trix < 0) {
      shouldExit = true;
      reason = "TRIX crossed below zero";
    }
    if (position.direction === "SHORT" && trix > 0) {
      shouldExit = true;
      reason = "TRIX crossed above zero";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 65,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 10. ULTIMATE OSCILLATOR ====================

const ZENBOT_ULTOSC_CONFIG: StrategyConfig = {
  id: "zenbot-ultosc",
  name: "Zenbot Ultimate Oscillator",
  description: "Trade using Ultimate Oscillator with multiple timeframes",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["5m", "15m", "30m"],
  defaultTimeframe: "5m",
  parameters: [
    { name: "period1", type: "integer", defaultValue: 7, min: 5, max: 14, category: "UO" },
    { name: "period2", type: "integer", defaultValue: 14, min: 10, max: 20, category: "UO" },
    { name: "period3", type: "integer", defaultValue: 28, min: 20, max: 40, category: "UO" },
    { name: "signalType", type: "select", defaultValue: "simple", options: ["simple", "low", "trend"], category: "Signal" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["oscillator", "zenbot", "ultimate"],
  minCandlesRequired: 52,
};

export class ZenbotUltOscStrategy extends BaseStrategy {
  private ultOsc: number[] = [];

  constructor() {
    super(ZENBOT_ULTOSC_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const p1 = Number(this.parameters.period1);
    const p2 = Number(this.parameters.period2);
    const p3 = Number(this.parameters.period3);

    this.ultOsc = ultimateOscillator(candles, p1, p2, p3);

    return {
      custom: { ultOsc: this.ultOsc },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const uo = this.ultOsc[lastIndex];
    const uoPrev = this.ultOsc[lastIndex - 1];

    if (isNaN(uo)) return null;

    const signalType = String(this.parameters.signalType);
    let signalType_: SignalType = "NO_SIGNAL";
    let reason = "";

    // Different signal interpretations
    if (signalType === "simple") {
      if (uo < 30 && uoPrev >= 30) {
        signalType_ = "LONG";
        reason = `UO crossed above 30 (${uo.toFixed(1)})`;
      } else if (uo > 70 && uoPrev <= 70) {
        signalType_ = "SHORT";
        reason = `UO crossed below 70 (${uo.toFixed(1)})`;
      }
    } else if (signalType === "low") {
      if (uo < 30) {
        signalType_ = "LONG";
        reason = `UO oversold (${uo.toFixed(1)})`;
      } else if (uo > 70) {
        signalType_ = "SHORT";
        reason = `UO overbought (${uo.toFixed(1)})`;
      }
    } else { // trend
      if (uo > 30 && uoPrev <= 30) {
        signalType_ = "LONG";
        reason = `UO bullish trend (${uo.toFixed(1)})`;
      } else if (uo < 70 && uoPrev >= 70) {
        signalType_ = "SHORT";
        reason = `UO bearish trend (${uo.toFixed(1)})`;
      }
    }

    if (signalType_ === "NO_SIGNAL") return null;

    return {
      type: signalType_,
      confidence: 65,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { ultOsc: uo },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const uo = this.ultOsc[lastIndex];

    if (isNaN(uo)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && uo > 70) {
      shouldExit = true;
      reason = "UO overbought";
    }
    if (position.direction === "SHORT" && uo < 30) {
      shouldExit = true;
      reason = "UO oversold";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 65,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 11. HULL MOVING AVERAGE ====================

const ZENBOT_HMA_CONFIG: StrategyConfig = {
  id: "zenbot-hma",
  name: "Zenbot Hull MA",
  description: "Trade using Hull Moving Average trend",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["10m", "15m", "30m"],
  defaultTimeframe: "15m",
  parameters: [
    { name: "hmaPeriod", type: "integer", defaultValue: 36, min: 20, max: 50, category: "HMA" },
    { name: "overboughtRSI", type: "number", defaultValue: 70, min: 60, max: 80, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["trend", "zenbot", "hma"],
  minCandlesRequired: 52,
};

export class ZenbotHMAStrategy extends BaseStrategy {
  private hma: number[] = [];
  private rsi: number[] = [];

  constructor() {
    super(ZENBOT_HMA_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.hmaPeriod);

    this.hma = hullMA(closes, period);
    this.rsi = RSI(closes, 25);

    return {
      custom: { hma: this.hma },
      rsi: { 25: this.rsi },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const hma = this.hma[lastIndex];
    const hmaPrev = this.hma[lastIndex - 1];
    const rsi = this.rsi[lastIndex];

    if (isNaN(hma) || isNaN(rsi)) return null;

    const obRSI = Number(this.parameters.overboughtRSI);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    const hmaDelta = hma - hmaPrev;

    if (hmaDelta > 0 && hmaPrev <= hma[lastIndex - 2] && rsi < obRSI) {
      signalType = "LONG";
      reason = `HMA turning up, RSI: ${rsi.toFixed(1)}`;
    } else if (hmaDelta < 0 && hmaPrev >= hma[lastIndex - 2]) {
      signalType = "SHORT";
      reason = `HMA turning down`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: signalType === "LONG" ? hma : hma,
      reason,
      metadata: { hma, hmaDelta, rsi },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const hma = this.hma[lastIndex];
    const hmaPrev = this.hma[lastIndex - 1];

    if (isNaN(hma)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && hma < hmaPrev) {
      shouldExit = true;
      reason = "HMA turned down";
    }
    if (position.direction === "SHORT" && hma > hmaPrev) {
      shouldExit = true;
      reason = "HMA turned up";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 12. PPO (Percentage Price Oscillator) ====================

const ZENBOT_PPO_CONFIG: StrategyConfig = {
  id: "zenbot-ppo",
  name: "Zenbot PPO",
  description: "Percentage Price Oscillator with RSI filter",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["10m", "15m", "30m"],
  defaultTimeframe: "10m",
  parameters: [
    { name: "fastPeriod", type: "integer", defaultValue: 12, min: 5, max: 20, category: "PPO" },
    { name: "slowPeriod", type: "integer", defaultValue: 26, min: 15, max: 40, category: "PPO" },
    { name: "signalPeriod", type: "integer", defaultValue: 9, min: 5, max: 15, category: "PPO" },
    { name: "overboughtRSI", type: "number", defaultValue: 70, min: 60, max: 80, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["momentum", "zenbot", "ppo"],
  minCandlesRequired: 52,
};

export class ZenbotPPOStrategy extends BaseStrategy {
  private ppo: number[] = [];
  private signal: number[] = [];
  private histogram: number[] = [];
  private rsi: number[] = [];

  constructor() {
    super(ZENBOT_PPO_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const fast = Number(this.parameters.fastPeriod);
    const slow = Number(this.parameters.slowPeriod);
    const sig = Number(this.parameters.signalPeriod);

    const ppoResult = PPO(closes, fast, slow, sig);
    this.ppo = ppoResult.ppo;
    this.signal = ppoResult.signal;
    this.histogram = ppoResult.histogram;
    this.rsi = RSI(closes, 25);

    return {
      custom: { ppo: this.ppo, ppoSignal: this.signal, ppoHistogram: this.histogram },
      rsi: { 25: this.rsi },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const ppo = this.ppo[lastIndex];
    const sig = this.signal[lastIndex];
    const ppoPrev = this.ppo[lastIndex - 1];
    const sigPrev = this.signal[lastIndex - 1];
    const rsi = this.rsi[lastIndex];

    if (isNaN(ppo) || isNaN(sig) || isNaN(rsi)) return null;

    const obRSI = Number(this.parameters.overboughtRSI);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    if (ppo > sig && ppoPrev <= sigPrev && rsi < obRSI) {
      signalType = "LONG";
      reason = `PPO bullish crossover, RSI: ${rsi.toFixed(1)}`;
    } else if (ppo < sig && ppoPrev >= sigPrev) {
      signalType = "SHORT";
      reason = `PPO bearish crossover`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { ppo, signal: sig, histogram: this.histogram[lastIndex], rsi },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const ppo = this.ppo[lastIndex];
    const sig = this.signal[lastIndex];

    if (isNaN(ppo) || isNaN(sig)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && ppo < sig) {
      shouldExit = true;
      reason = "PPO bearish crossover";
    }
    if (position.direction === "SHORT" && ppo > sig) {
      shouldExit = true;
      reason = "PPO bullish crossover";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 13. TRUST/DISTRUST ====================

const ZENBOT_TRUST_CONFIG: StrategyConfig = {
  id: "zenbot-trust-distrust",
  name: "Zenbot Trust/Distrust",
  description: "Reversal strategy based on price swings",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["30m", "1h"],
  defaultTimeframe: "30m",
  parameters: [
    { name: "sellThreshold", type: "number", defaultValue: 2, min: 1, max: 5, category: "Exit" },
    { name: "sellMin", type: "number", defaultValue: 1, min: 0, max: 5, category: "Exit" },
    { name: "buyThreshold", type: "number", defaultValue: 2, min: 1, max: 5, category: "Entry" },
    { name: "greed", type: "number", defaultValue: 0, min: 0, max: 50, category: "Risk" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[2]],
  tags: ["reversal", "zenbot"],
  minCandlesRequired: 52,
};

export class ZenbotTrustDistrustStrategy extends BaseStrategy {
  private highestPrice: number = 0;
  private lowestPrice: number = Infinity;
  private lastPrice: number = 0;

  constructor() {
    super(ZENBOT_TRUST_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    // Track high/low for swing detection
    const closes = candles.map(c => c.close);
    this.highestPrice = Math.max(...closes.slice(-100));
    this.lowestPrice = Math.min(...closes.slice(-100));
    this.lastPrice = closes[closes.length - 1];

    return {};
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const sellThreshold = Number(this.parameters.sellThreshold) / 100;
    const sellMin = Number(this.parameters.sellMin) / 100;
    const buyThreshold = Number(this.parameters.buyThreshold) / 100;

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Calculate thresholds relative to high/low
    const sellTrigger = this.highestPrice * (1 - sellThreshold);
    const buyTrigger = this.lowestPrice * (1 + buyThreshold);
    const minProfitPrice = this.lowestPrice * (1 + sellMin);

    // LONG: Price bounced from low
    if (currentPrice > buyTrigger && currentPrice > this.lowestPrice * (1 + buyThreshold / 2)) {
      signalType = "LONG";
      reason = `Price bounced from low (${currentPrice.toFixed(2)} > ${buyTrigger.toFixed(2)})`;
    }
    // SHORT: Price dropped from high with minimum profit
    else if (currentPrice < sellTrigger && currentPrice > minProfitPrice) {
      signalType = "SHORT";
      reason = `Price dropped from high (${currentPrice.toFixed(2)} < ${sellTrigger.toFixed(2)})`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 60,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { highestPrice: this.highestPrice, lowestPrice: this.lowestPrice },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const greed = Number(this.parameters.greed) / 100;

    // Greed = 0 means exit on any profit
    if (greed > 0) {
      const profitPct = Math.abs(position.currentPrice - position.entryPrice) / position.entryPrice;
      if (profitPct >= greed) {
        return {
          type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
          confidence: 80,
          symbol: "",
          timeframe: this.config.defaultTimeframe,
          timestamp: new Date(),
          price: position.currentPrice,
          reason: `Greed target reached: ${(profitPct * 100).toFixed(1)}%`,
        };
      }
    }

    return null;
  }
}

// ==================== 14. TSI (True Strength Index) ====================

/**
 * True Strength Index (TSI)
 * 
 * TSI = EMA(EMA(momentum, long), short) / EMA(EMA(abs(momentum), long), short) * 100
 * 
 * Осциллятор, который показывает направление и силу тренда.
 * Положительные значения = бычий тренд, отрицательные = медвежий.
 */
function trueStrengthIndex(data: number[], longPeriod: number, shortPeriod: number): number[] {
  // Momentum = price - price[1]
  const momentum: number[] = [0];
  for (let i = 1; i < data.length; i++) {
    momentum.push(data[i] - data[i - 1]);
  }
  
  // Double-smoothed momentum
  const ema1 = EMA(momentum, longPeriod);
  const ema2 = EMA(ema1, shortPeriod);
  
  // Double-smoothed absolute momentum
  const absMomentum = momentum.map(m => Math.abs(m));
  const absEma1 = EMA(absMomentum, longPeriod);
  const absEma2 = EMA(absEma1, shortPeriod);
  
  // TSI = 100 * (DSM / DSA)
  const tsi = ema2.map((v, i) => {
    if (isNaN(v) || isNaN(absEma2[i]) || absEma2[i] === 0) return NaN;
    return (v / absEma2[i]) * 100;
  });
  
  return tsi;
}

const ZENBOT_TSI_CONFIG: StrategyConfig = {
  id: "zenbot-tsi",
  name: "Zenbot TSI (True Strength Index)",
  description: "Trade based on True Strength Index oscillator",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "longPeriod", type: "integer", defaultValue: 25, min: 15, max: 35, category: "TSI" },
    { name: "shortPeriod", type: "integer", defaultValue: 13, min: 5, max: 20, category: "TSI" },
    { name: "signalPeriod", type: "integer", defaultValue: 7, min: 3, max: 15, category: "Signal" },
    { name: "overbought", type: "number", defaultValue: 25, min: 15, max: 35, category: "Levels" },
    { name: "oversold", type: "number", defaultValue: -25, min: -35, max: -15, category: "Levels" },
    { name: "emaFilter", type: "integer", defaultValue: 100, min: 50, max: 200, category: "Filter" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["oscillator", "momentum", "zenbot", "tsi"],
  minCandlesRequired: 50,
};

export class ZenbotTSIStrategy extends BaseStrategy {
  private tsi: number[] = [];
  private tsiSignal: number[] = [];
  private trendEMA: number[] = [];

  constructor() {
    super(ZENBOT_TSI_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const longPeriod = Number(this.parameters.longPeriod);
    const shortPeriod = Number(this.parameters.shortPeriod);
    const signalPeriod = Number(this.parameters.signalPeriod);
    const emaPeriod = Number(this.parameters.emaFilter);
    
    this.tsi = trueStrengthIndex(closes, longPeriod, shortPeriod);
    this.tsiSignal = EMA(this.tsi, signalPeriod);
    this.trendEMA = EMA(closes, emaPeriod);
    
    return {
      custom: { tsi: this.tsi, tsiSignal: this.tsiSignal },
      ema: { [emaPeriod]: this.trendEMA },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const tsi = this.tsi[lastIndex];
    const tsiPrev = this.tsi[lastIndex - 1];
    const signal = this.tsiSignal[lastIndex];
    const signalPrev = this.tsiSignal[lastIndex - 1];
    const trend = this.trendEMA[lastIndex];
    
    if (isNaN(tsi) || isNaN(signal) || isNaN(trend)) return null;
    
    const overbought = Number(this.parameters.overbought);
    const oversold = Number(this.parameters.oversold);
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    // LONG signals
    // 1. TSI crosses above signal in oversold zone
    if (tsi > signal && tsiPrev <= signalPrev && tsi < oversold * 0.5) {
      signalType = "LONG";
      reason = `TSI bullish crossover in oversold zone (${tsi.toFixed(1)})`;
    }
    // 2. TSI crosses above zero with trend confirmation
    else if (tsi > 0 && tsiPrev <= 0 && currentPrice > trend) {
      signalType = "LONG";
      reason = `TSI crossed above zero with uptrend (${tsi.toFixed(1)})`;
    }
    
    // SHORT signals
    // 1. TSI crosses below signal in overbought zone
    if (signalType === "NO_SIGNAL" && tsi < signal && tsiPrev >= signalPrev && tsi > overbought * 0.5) {
      signalType = "SHORT";
      reason = `TSI bearish crossover in overbought zone (${tsi.toFixed(1)})`;
    }
    // 2. TSI crosses below zero with trend confirmation
    else if (signalType === "NO_SIGNAL" && tsi < 0 && tsiPrev >= 0 && currentPrice < trend) {
      signalType = "SHORT";
      reason = `TSI crossed below zero with downtrend (${tsi.toFixed(1)})`;
    }
    
    if (signalType === "NO_SIGNAL") return null;
    
    return {
      type: signalType,
      confidence: Math.min(100, Math.abs(tsi) * 2 + 50),
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: signalType === "LONG"
        ? currentPrice * 0.98
        : currentPrice * 1.02,
      reason,
      metadata: { tsi, signal, trend },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const tsi = this.tsi[lastIndex];
    const signal = this.tsiSignal[lastIndex];
    
    if (isNaN(tsi) || isNaN(signal)) return null;
    
    const overbought = Number(this.parameters.overbought);
    const oversold = Number(this.parameters.oversold);
    
    let shouldExit = false;
    let reason = "";
    
    if (position.direction === "LONG") {
      // Exit on bearish crossover or overbought
      if (tsi < signal && tsi > overbought) {
        shouldExit = true;
        reason = `TSI bearish crossover in overbought zone`;
      } else if (tsi < 0) {
        shouldExit = true;
        reason = `TSI crossed below zero`;
      }
    }
    
    if (position.direction === "SHORT") {
      // Exit on bullish crossover or oversold
      if (tsi > signal && tsi < oversold) {
        shouldExit = true;
        reason = `TSI bullish crossover in oversold zone`;
      } else if (tsi > 0) {
        shouldExit = true;
        reason = `TSI crossed above zero`;
      }
    }
    
    if (!shouldExit) return null;
    
    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== EXPORTS ====================

export const ZENBOT_STRATEGIES = [
  ZenbotBollingerStrategy,
  ZenbotVWAPStrategy,
  ZenbotDEMAStrategy,
  ZenbotSARStrategy,
  ZenbotMomentumStrategy,
  ZenbotStochMACDStrategy,
  ZenbotWaveTrendStrategy,
  ZenbotCCISRSIStrategy,
  ZenbotTRIXStrategy,
  ZenbotUltOscStrategy,
  ZenbotHMAStrategy,
  ZenbotPPOStrategy,
  ZenbotTrustDistrustStrategy,
  ZenbotTSIStrategy,
];

export {
  ZENBOT_BOLLINGER_CONFIG,
  ZENBOT_VWAP_CONFIG,
  ZENBOT_DEMA_CONFIG,
  ZENBOT_SAR_CONFIG,
  ZENBOT_MOMENTUM_CONFIG,
  ZENBOT_SRSI_MACD_CONFIG,
  ZENBOT_WAVETREND_CONFIG,
  ZENBOT_CCI_SRSI_CONFIG,
  ZENBOT_TRIX_CONFIG,
  ZENBOT_ULTOSC_CONFIG,
  ZENBOT_HMA_CONFIG,
  ZENBOT_PPO_CONFIG,
  ZENBOT_TRUST_CONFIG,
  ZENBOT_TSI_CONFIG,
};
