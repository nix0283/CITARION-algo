/**
 * Jesse Example Strategies - TypeScript Port
 * 
 * Портированные стратегии из jesse-ai/example-strategies
 * @see https://github.com/jesse-ai/example-strategies
 * 
 * Стратегии:
 * - RSI2: Mean Reversion strategy based on RSI(2)
 * - DualThrust: Breakout strategy with dynamic range
 * - TradingViewRSI: Classic RSI strategy
 * - EMACross: EMA crossover strategy
 * - BollingerBands: Mean reversion with Bollinger Bands
 */

import { Candle, IndicatorResult, StrategySignal, StrategyConfig, BaseStrategy, SignalType } from "../strategy/types";
import { SMA, EMA, RSI, BollingerBands, ATR, ADX, MACD, Stochastic } from "./jesse-indicators";
import { PREDEFINED_TACTICS_SETS } from "../strategy/tactics/types";

// ==================== 1. RSI2 MEAN REVERSION STRATEGY ====================

/**
 * RSI2 Mean Reversion Strategy
 * 
 * Простая стратегия возврата к среднему на основе RSI с периодом 2.
 * 
 * Логика:
 * - Long: RSI(2) < 10 (oversold) и цена выше SMA(200)
 * - Exit Long: RSI(2) > 70
 * - Short: RSI(2) > 90 (overbought) и цена ниже SMA(200)
 * - Exit Short: RSI(2) < 30
 * 
 * @see https://github.com/jesse-ai/example-strategies/tree/master/RSI2
 */
const RSI2_CONFIG: StrategyConfig = {
  id: "jesse-rsi2",
  name: "RSI2 Mean Reversion",
  description: "Mean reversion strategy using RSI(2) with SMA(200) trend filter",
  version: "1.0.0",
  author: "jesse-ai (ported)",
  timeframes: ["5m", "15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "rsiPeriod", type: "integer", defaultValue: 2, min: 2, max: 5, category: "RSI" },
    { name: "smaPeriod", type: "integer", defaultValue: 200, min: 50, max: 300, category: "Trend" },
    { name: "oversoldLevel", type: "number", defaultValue: 10, min: 5, max: 20, category: "Levels" },
    { name: "overboughtLevel", type: "number", defaultValue: 90, min: 80, max: 95, category: "Levels" },
    { name: "exitLongLevel", type: "number", defaultValue: 70, min: 60, max: 80, category: "Exit" },
    { name: "exitShortLevel", type: "number", defaultValue: 30, min: 20, max: 40, category: "Exit" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]], // Conservative
  tags: ["mean-reversion", "rsi", "jesse"],
  minCandlesRequired: 200,
};

export class RSI2Strategy extends BaseStrategy {
  private rsiValues: number[] = [];
  private smaValues: number[] = [];

  constructor() {
    super(RSI2_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const rsiPeriod = Number(this.parameters.rsiPeriod);
    const smaPeriod = Number(this.parameters.smaPeriod);

    this.rsiValues = RSI(closes, rsiPeriod);
    this.smaValues = SMA(closes, smaPeriod);

    return {
      rsi: { [rsiPeriod]: this.rsiValues },
      sma: { [smaPeriod]: this.smaValues },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const rsi = this.rsiValues[lastIndex];
    const sma = this.smaValues[lastIndex];

    if (isNaN(rsi) || isNaN(sma)) return null;

    const oversold = Number(this.parameters.oversoldLevel);
    const overbought = Number(this.parameters.overboughtLevel);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Long: RSI oversold + price above SMA (uptrend)
    if (rsi < oversold && currentPrice > sma) {
      signalType = "LONG";
      reason = `RSI(${this.parameters.rsiPeriod}) oversold at ${rsi.toFixed(1)}, price above SMA(200)`;
    }
    // Short: RSI overbought + price below SMA (downtrend)
    else if (rsi > overbought && currentPrice < sma) {
      signalType = "SHORT";
      reason = `RSI(${this.parameters.rsiPeriod}) overbought at ${rsi.toFixed(1)}, price below SMA(200)`;
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
      metadata: { rsi, sma, trend: currentPrice > sma ? "up" : "down" },
    };
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date }
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const rsi = this.rsiValues[lastIndex];

    if (isNaN(rsi)) return null;

    const exitLong = Number(this.parameters.exitLongLevel);
    const exitShort = Number(this.parameters.exitShortLevel);

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && rsi > exitLong) {
      shouldExit = true;
      reason = `RSI reached ${rsi.toFixed(1)} > ${exitLong} - exit long`;
    }
    if (position.direction === "SHORT" && rsi < exitShort) {
      shouldExit = true;
      reason = `RSI reached ${rsi.toFixed(1)} < ${exitShort} - exit short`;
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

// ==================== 2. DUAL THRUST BREAKOUT STRATEGY ====================

/**
 * Dual Thrust Breakout Strategy
 * 
 * Классическая стратегия прорыва, разработанная Michael Chalek.
 * Использует исторический диапазон для определения уровней прорыва.
 * 
 * Логика:
 * - Range = max(HH, HC) - min(LL, LC) за N периодов
 * - Upper = Open + K1 * Range
 * - Lower = Open - K2 * Range
 * - Long: цена пробивает Upper
 * - Short: цена пробивает Lower
 * 
 * @see https://github.com/jesse-ai/example-strategies/tree/master/DUAL_THRUST
 */
const DUAL_THRUST_CONFIG: StrategyConfig = {
  id: "jesse-dual-thrust",
  name: "Dual Thrust Breakout",
  description: "Classic breakout strategy using historical range for level calculation",
  version: "1.0.0",
  author: "jesse-ai (ported)",
  timeframes: ["15m", "1h", "4h", "1d"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "rangePeriod", type: "integer", defaultValue: 4, min: 2, max: 20, category: "Range" },
    { name: "k1", type: "number", defaultValue: 0.5, min: 0.1, max: 1.0, category: "Levels" },
    { name: "k2", type: "number", defaultValue: 0.5, min: 0.1, max: 1.0, category: "Levels" },
    { name: "stopLossPct", type: "number", defaultValue: 2, min: 0.5, max: 5, category: "Risk" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]], // Aggressive
  tags: ["breakout", "trend", "jesse"],
  minCandlesRequired: 30,
};

export class DualThrustStrategy extends BaseStrategy {
  private upperLevel: number = 0;
  private lowerLevel: number = 0;
  private range: number = 0;

  constructor() {
    super(DUAL_THRUST_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const period = Number(this.parameters.rangePeriod);
    const k1 = Number(this.parameters.k1);
    const k2 = Number(this.parameters.k2);

    if (candles.length < period) {
      return { custom: {} };
    }

    // Calculate range over the period
    const recentCandles = candles.slice(-period);
    
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const closes = recentCandles.map(c => c.close);

    const hh = Math.max(...highs);
    const ll = Math.min(...lows);
    const hc = Math.max(...closes);
    const lc = Math.min(...closes);

    const rangeHigh = Math.max(hh, hc);
    const rangeLow = Math.min(ll, lc);
    this.range = rangeHigh - rangeLow;

    // Current open (first candle of session)
    const currentOpen = candles[candles.length - 1].open;

    this.upperLevel = currentOpen + k1 * this.range;
    this.lowerLevel = currentOpen - k2 * this.range;

    return {
      custom: {
        upperLevel: this.upperLevel,
        lowerLevel: this.lowerLevel,
        range: this.range,
      },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    if (this.range <= 0) return null;

    const lastIndex = candles.length - 1;
    const candle = candles[lastIndex];

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Breakout above upper level
    if (candle.close > this.upperLevel) {
      signalType = "LONG";
      reason = `Breakout above ${this.upperLevel.toFixed(2)} (range: ${this.range.toFixed(2)})`;
    }
    // Breakdown below lower level
    else if (candle.close < this.lowerLevel) {
      signalType = "SHORT";
      reason = `Breakdown below ${this.lowerLevel.toFixed(2)} (range: ${this.range.toFixed(2)})`;
    }

    if (signalType === "NO_SIGNAL") return null;

    const slPct = Number(this.parameters.stopLossPct) / 100;

    return {
      type: signalType,
      confidence: 75,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: signalType === "LONG"
        ? currentPrice * (1 - slPct)
        : currentPrice * (1 + slPct),
      reason,
      metadata: { upperLevel: this.upperLevel, lowerLevel: this.lowerLevel, range: this.range },
    };
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date }
  ): StrategySignal | null {
    // Exit on opposite breakout
    const lastIndex = candles.length - 1;
    const candle = candles[lastIndex];

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && candle.close < this.lowerLevel) {
      shouldExit = true;
      reason = "Opposite breakdown - exit long";
    }
    if (position.direction === "SHORT" && candle.close > this.upperLevel) {
      shouldExit = true;
      reason = "Opposite breakout - exit short";
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

// ==================== 3. TRADINGVIEW RSI STRATEGY ====================

/**
 * TradingView RSI Strategy
 * 
 * Классическая RSI стратегия в стиле TradingView.
 * Использует уровни перекупленности/перепроданности.
 * 
 * @see https://github.com/jesse-ai/example-strategies/tree/master/TradingView_RSI
 */
const TRADINGVIEW_RSI_CONFIG: StrategyConfig = {
  id: "jesse-tradingview-rsi",
  name: "TradingView RSI",
  description: "Classic RSI strategy with overbought/oversold levels",
  version: "1.0.0",
  author: "jesse-ai (ported)",
  timeframes: ["5m", "15m", "1h", "4h"],
  defaultTimeframe: "15m",
  parameters: [
    { name: "rsiPeriod", type: "integer", defaultValue: 14, min: 7, max: 21, category: "RSI" },
    { name: "oversold", type: "number", defaultValue: 30, min: 20, max: 35, category: "Levels" },
    { name: "overbought", type: "number", defaultValue: 70, min: 65, max: 80, category: "Levels" },
    { name: "useConfirmation", type: "boolean", defaultValue: true, category: "Signal" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["rsi", "oscillator", "jesse"],
  minCandlesRequired: 30,
};

export class TradingViewRSIStrategy extends BaseStrategy {
  private rsiValues: number[] = [];

  constructor() {
    super(TRADINGVIEW_RSI_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.rsiPeriod);

    this.rsiValues = RSI(closes, period);

    return {
      rsi: { [period]: this.rsiValues },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const rsi = this.rsiValues[lastIndex];
    const rsiPrev = this.rsiValues[lastIndex - 1];

    if (isNaN(rsi) || isNaN(rsiPrev)) return null;

    const oversold = Number(this.parameters.oversold);
    const overbought = Number(this.parameters.overbought);
    const useConfirmation = this.parameters.useConfirmation === true;

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Long: RSI crosses above oversold
    if (useConfirmation) {
      if (rsiPrev < oversold && rsi >= oversold) {
        signalType = "LONG";
        reason = `RSI crossed above ${oversold} from ${rsiPrev.toFixed(1)} to ${rsi.toFixed(1)}`;
      }
      // Short: RSI crosses below overbought
      else if (rsiPrev > overbought && rsi <= overbought) {
        signalType = "SHORT";
        reason = `RSI crossed below ${overbought} from ${rsiPrev.toFixed(1)} to ${rsi.toFixed(1)}`;
      }
    } else {
      if (rsi < oversold) {
        signalType = "LONG";
        reason = `RSI oversold at ${rsi.toFixed(1)}`;
      } else if (rsi > overbought) {
        signalType = "SHORT";
        reason = `RSI overbought at ${rsi.toFixed(1)}`;
      }
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
        ? currentPrice * 0.97
        : currentPrice * 1.03,
      reason,
      metadata: { rsi, rsiPrev },
    };
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date }
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const rsi = this.rsiValues[lastIndex];

    if (isNaN(rsi)) return null;

    const oversold = Number(this.parameters.oversold);
    const overbought = Number(this.parameters.overbought);

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && rsi > overbought) {
      shouldExit = true;
      reason = `RSI reached overbought at ${rsi.toFixed(1)}`;
    }
    if (position.direction === "SHORT" && rsi < oversold) {
      shouldExit = true;
      reason = `RSI reached oversold at ${rsi.toFixed(1)}`;
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

// ==================== 4. EMA CROSS STRATEGY ====================

/**
 * EMA Cross Strategy
 * 
 * Простейшая стратегия пересечения двух EMA.
 */
const EMA_CROSS_CONFIG: StrategyConfig = {
  id: "jesse-ema-cross",
  name: "EMA Crossover",
  description: "Simple EMA crossover trend following strategy",
  version: "1.0.0",
  author: "jesse-ai (ported)",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "fastPeriod", type: "integer", defaultValue: 9, min: 5, max: 20, category: "EMA" },
    { name: "slowPeriod", type: "integer", defaultValue: 21, min: 15, max: 50, category: "EMA" },
    { name: "useRsiFilter", type: "boolean", defaultValue: true, category: "Filter" },
    { name: "rsiPeriod", type: "integer", defaultValue: 14, min: 7, max: 21, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["trend", "ema", "jesse"],
  minCandlesRequired: 50,
};

export class EMACrossStrategy extends BaseStrategy {
  private fastEMA: number[] = [];
  private slowEMA: number[] = [];
  private rsiValues: number[] = [];

  constructor() {
    super(EMA_CROSS_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const fastPeriod = Number(this.parameters.fastPeriod);
    const slowPeriod = Number(this.parameters.slowPeriod);
    const rsiPeriod = Number(this.parameters.rsiPeriod);

    this.fastEMA = EMA(closes, fastPeriod);
    this.slowEMA = EMA(closes, slowPeriod);
    this.rsiValues = RSI(closes, rsiPeriod);

    return {
      ema: { [fastPeriod]: this.fastEMA, [slowPeriod]: this.slowEMA },
      rsi: { [rsiPeriod]: this.rsiValues },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const fast = this.fastEMA[lastIndex];
    const fastPrev = this.fastEMA[lastIndex - 1];
    const slow = this.slowEMA[lastIndex];
    const slowPrev = this.slowEMA[lastIndex - 1];
    const rsi = this.rsiValues[lastIndex];

    if (isNaN(fast) || isNaN(slow)) return null;

    const useRsiFilter = this.parameters.useRsiFilter === true;

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Bullish crossover
    if (fastPrev <= slowPrev && fast > slow) {
      if (!useRsiFilter || rsi < 70) {
        signalType = "LONG";
        reason = `EMA(${this.parameters.fastPeriod}) crossed above EMA(${this.parameters.slowPeriod})`;
      }
    }
    // Bearish crossover
    else if (fastPrev >= slowPrev && fast < slow) {
      if (!useRsiFilter || rsi > 30) {
        signalType = "SHORT";
        reason = `EMA(${this.parameters.fastPeriod}) crossed below EMA(${this.parameters.slowPeriod})`;
      }
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
        ? currentPrice * 0.97
        : currentPrice * 1.03,
      reason,
      metadata: { fastEMA: fast, slowEMA: slow, rsi },
    };
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date }
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const fast = this.fastEMA[lastIndex];
    const slow = this.slowEMA[lastIndex];

    if (isNaN(fast) || isNaN(slow)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && fast < slow) {
      shouldExit = true;
      reason = "EMA bearish crossover - exit long";
    }
    if (position.direction === "SHORT" && fast > slow) {
      shouldExit = true;
      reason = "EMA bullish crossover - exit short";
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

// ==================== 5. BOLLINGER BANDS MEAN REVERSION ====================

/**
 * Bollinger Bands Mean Reversion Strategy
 * 
 * Стратегия возврата к среднему на основе полос Боллинджера.
 */
const BB_MEAN_REVERSION_CONFIG: StrategyConfig = {
  id: "jesse-bb-mean-reversion",
  name: "Bollinger Bands Mean Reversion",
  description: "Mean reversion strategy using Bollinger Bands",
  version: "1.0.0",
  author: "jesse-ai (ported)",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "period", type: "integer", defaultValue: 20, min: 10, max: 30, category: "BB" },
    { name: "stdDev", type: "number", defaultValue: 2, min: 1.5, max: 3, category: "BB" },
    { name: "rsiPeriod", type: "integer", defaultValue: 14, min: 7, max: 21, category: "RSI" },
    { name: "rsiOversold", type: "number", defaultValue: 30, min: 20, max: 40, category: "RSI" },
    { name: "rsiOverbought", type: "number", defaultValue: 70, min: 60, max: 80, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["mean-reversion", "bollinger", "jesse"],
  minCandlesRequired: 30,
};

export class BBMeanReversionStrategy extends BaseStrategy {
  private upper: number[] = [];
  private middle: number[] = [];
  private lower: number[] = [];
  private rsiValues: number[] = [];

  constructor() {
    super(BB_MEAN_REVERSION_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.period);
    const stdDev = Number(this.parameters.stdDev);
    const rsiPeriod = Number(this.parameters.rsiPeriod);

    const bb = BollingerBands(closes, period, stdDev);
    this.upper = bb.upper;
    this.middle = bb.middle;
    this.lower = bb.lower;
    this.rsiValues = RSI(closes, rsiPeriod);

    return {
      bollingerBands: bb,
      rsi: { [rsiPeriod]: this.rsiValues },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const upper = this.upper[lastIndex];
    const lower = this.lower[lastIndex];
    const middle = this.middle[lastIndex];
    const rsi = this.rsiValues[lastIndex];

    if (isNaN(upper) || isNaN(lower) || isNaN(rsi)) return null;

    const rsiOversold = Number(this.parameters.rsiOversold);
    const rsiOverbought = Number(this.parameters.rsiOverbought);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Long: price at lower band + RSI oversold
    if (currentPrice <= lower && rsi < rsiOversold) {
      signalType = "LONG";
      reason = `Price at lower BB (${currentPrice.toFixed(2)} <= ${lower.toFixed(2)}) + RSI oversold (${rsi.toFixed(1)})`;
    }
    // Short: price at upper band + RSI overbought
    else if (currentPrice >= upper && rsi > rsiOverbought) {
      signalType = "SHORT";
      reason = `Price at upper BB (${currentPrice.toFixed(2)} >= ${upper.toFixed(2)}) + RSI overbought (${rsi.toFixed(1)})`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 75,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: signalType === "LONG"
        ? currentPrice * 0.97
        : currentPrice * 1.03,
      reason,
      metadata: { upper, middle, lower, rsi },
    };
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date }
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const middle = this.middle[lastIndex];
    const upper = this.upper[lastIndex];
    const lower = this.lower[lastIndex];

    if (isNaN(middle)) return null;

    let shouldExit = false;
    let reason = "";

    // Exit at middle band
    if (position.direction === "LONG" && currentPrice >= middle) {
      shouldExit = true;
      reason = `Price reached middle BB at ${middle.toFixed(2)}`;
    }
    if (position.direction === "SHORT" && currentPrice <= middle) {
      shouldExit = true;
      reason = `Price reached middle BB at ${middle.toFixed(2)}`;
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

export {
  RSI2_CONFIG,
  RSI2Strategy,
  DUAL_THRUST_CONFIG,
  DualThrustStrategy,
  TRADINGVIEW_RSI_CONFIG,
  TradingViewRSIStrategy,
  EMA_CROSS_CONFIG,
  EMACrossStrategy,
  BB_MEAN_REVERSION_CONFIG,
  BBMeanReversionStrategy,
};

export const JESSE_STRATEGIES = [
  { config: RSI2_CONFIG, strategy: RSI2Strategy },
  { config: DUAL_THRUST_CONFIG, strategy: DualThrustStrategy },
  { config: TRADINGVIEW_RSI_CONFIG, strategy: TradingViewRSIStrategy },
  { config: EMA_CROSS_CONFIG, strategy: EMACrossStrategy },
  { config: BB_MEAN_REVERSION_CONFIG, strategy: BBMeanReversionStrategy },
];
