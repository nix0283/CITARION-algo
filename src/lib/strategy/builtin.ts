/**
 * Built-in Strategies
 * 
 * Готовые стратегии для использования.
 */

import { Candle, IndicatorResult, StrategySignal, StrategyConfig, BaseStrategy, SignalType } from "./types";
import { RSI, EMA, MACD, BollingerBands, ATR, SMA } from "./indicators";
import { TacticsSet, PREDEFINED_TACTICS_SETS } from "./tactics/types";

// ==================== RSI STRATEGY ====================

/**
 * RSI Strategy Configuration
 */
const RSI_STRATEGY_CONFIG: StrategyConfig = {
  id: "rsi-reversal",
  name: "RSI Reversal",
  description: "Торговля по уровням перекупленности/перепроданности RSI с подтверждением EMA",
  version: "1.0.0",
  author: "CITARION",
  timeframes: ["5m", "15m", "1h", "4h"],
  defaultTimeframe: "15m",
  parameters: [
    {
      name: "rsiPeriod",
      description: "Период RSI",
      type: "integer",
      defaultValue: 14,
      min: 7,
      max: 30,
      category: "RSI",
    },
    {
      name: "rsiOverbought",
      description: "Уровень перекупленности",
      type: "number",
      defaultValue: 70,
      min: 60,
      max: 85,
      category: "RSI",
    },
    {
      name: "rsiOversold",
      description: "Уровень перепроданности",
      type: "number",
      defaultValue: 30,
      min: 15,
      max: 40,
      category: "RSI",
    },
    {
      name: "emaPeriod",
      description: "Период EMA для тренда",
      type: "integer",
      defaultValue: 200,
      min: 50,
      max: 300,
      category: "Trend",
    },
    {
      name: "useTrendFilter",
      description: "Фильтровать по тренду EMA",
      type: "boolean",
      defaultValue: true,
      category: "Trend",
    },
    {
      name: "rsiExitLevel",
      description: "Уровень RSI для выхода (противоположный)",
      type: "number",
      defaultValue: 50,
      min: 40,
      max: 60,
      category: "Exit",
    },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]], // Conservative
  tags: ["momentum", "reversal", "beginner"],
  minCandlesRequired: 200,
};

/**
 * RSI Reversal Strategy
 */
export class RSIStrategy extends BaseStrategy {
  private rsiValues: number[] = [];
  private emaValues: number[] = [];

  constructor() {
    super(RSI_STRATEGY_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const rsiPeriod = Number(this.parameters.rsiPeriod);
    const emaPeriod = Number(this.parameters.emaPeriod);

    this.rsiValues = RSI(closes, rsiPeriod);
    this.emaValues = EMA(closes, emaPeriod);

    return {
      rsi: { [rsiPeriod]: this.rsiValues },
      ema: { [emaPeriod]: this.emaValues },
    };
  }

  populateEntrySignal(
    candles: Candle[],
    indicators: IndicatorResult,
    currentPrice: number
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const rsi = this.rsiValues[lastIndex];
    const rsiPrev = this.rsiValues[lastIndex - 1];
    const ema = this.emaValues[lastIndex];

    if (isNaN(rsi) || isNaN(ema)) return null;

    const overbought = Number(this.parameters.rsiOverbought);
    const oversold = Number(this.parameters.rsiOversold);
    const useTrendFilter = Boolean(this.parameters.useTrendFilter);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // LONG: RSI выходит из перепроданности
    if (rsiPrev <= oversold && rsi > oversold) {
      if (useTrendFilter && currentPrice < ema) {
        // Не входим против тренда
      } else {
        signalType = "LONG";
        reason = `RSI crossing above oversold level ${oversold}`;
      }
    }

    // SHORT: RSI выходит из перекупленности
    if (rsiPrev >= overbought && rsi < overbought) {
      if (useTrendFilter && currentPrice > ema) {
        // Не входим против тренда
      } else {
        signalType = "SHORT";
        reason = `RSI crossing below overbought level ${overbought}`;
      }
    }

    if (signalType === "NO_SIGNAL") return null;

    // Рассчитываем SL на основе ATR
    const atrValues = ATR(candles, 14);
    const atr = atrValues[lastIndex] || currentPrice * 0.02;

    const slDistance = atr * 2;
    const tpDistance = atr * 3;

    const signal: StrategySignal = {
      type: signalType,
      confidence: Math.min(100, Math.abs(rsi - 50) * 2),
      symbol: "", // Заполняется извне
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: signalType === "LONG" 
        ? currentPrice - slDistance 
        : currentPrice + slDistance,
      suggestedTakeProfits: [
        { price: signalType === "LONG" ? currentPrice + tpDistance : currentPrice - tpDistance, percent: 100 },
      ],
      reason,
      metadata: {
        rsi,
        ema,
        atr,
      },
    };

    this.state.lastSignal = signal;
    return signal;
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: {
      direction: "LONG" | "SHORT";
      entryPrice: number;
      currentPrice: number;
      size: number;
      openTime: Date;
    }
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const rsi = this.rsiValues[lastIndex];
    const exitLevel = Number(this.parameters.rsiExitLevel);

    if (isNaN(rsi)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && rsi >= exitLevel + 20) {
      shouldExit = true;
      reason = `RSI reached ${rsi.toFixed(2)}, taking profit`;
    }

    if (position.direction === "SHORT" && rsi <= exitLevel - 20) {
      shouldExit = true;
      reason = `RSI reached ${rsi.toFixed(2)}, taking profit`;
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 80,
      symbol: "", // Заполняется извне
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
      metadata: { rsi },
    };
  }
}

// ==================== MACD CROSSOVER STRATEGY ====================

/**
 * MACD Crossover Strategy Configuration
 */
const MACD_STRATEGY_CONFIG: StrategyConfig = {
  id: "macd-crossover",
  name: "MACD Crossover",
  description: "Торговля по пересечению MACD и сигнальной линии",
  version: "1.0.0",
  author: "CITARION",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    {
      name: "fastPeriod",
      description: "Быстрый период EMA",
      type: "integer",
      defaultValue: 12,
      min: 5,
      max: 20,
      category: "MACD",
    },
    {
      name: "slowPeriod",
      description: "Медленный период EMA",
      type: "integer",
      defaultValue: 26,
      min: 15,
      max: 40,
      category: "MACD",
    },
    {
      name: "signalPeriod",
      description: "Период сигнальной линии",
      type: "integer",
      defaultValue: 9,
      min: 5,
      max: 15,
      category: "MACD",
    },
    {
      name: "useHistogramConfirmation",
      description: "Требовать подтверждение гистограммой",
      type: "boolean",
      defaultValue: true,
      category: "Confirmation",
    },
    {
      name: "minHistogramStrength",
      description: "Минимальная сила гистограммы",
      type: "number",
      defaultValue: 0.0001,
      min: 0,
      max: 0.01,
      category: "Confirmation",
    },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]], // Aggressive
  tags: ["trend", "momentum", "intermediate"],
  minCandlesRequired: 100,
};

/**
 * MACD Crossover Strategy
 */
export class MACDStrategy extends BaseStrategy {
  private macdLine: number[] = [];
  private signalLine: number[] = [];
  private histogram: number[] = [];

  constructor() {
    super(MACD_STRATEGY_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const fast = Number(this.parameters.fastPeriod);
    const slow = Number(this.parameters.slowPeriod);
    const signal = Number(this.parameters.signalPeriod);

    const macdResult = MACD(closes, fast, slow, signal);
    this.macdLine = macdResult.macd;
    this.signalLine = macdResult.signal;
    this.histogram = macdResult.histogram;

    return {
      macd: macdResult,
    };
  }

  populateEntrySignal(
    candles: Candle[],
    indicators: IndicatorResult,
    currentPrice: number
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const macd = this.macdLine[lastIndex];
    const macdPrev = this.macdLine[lastIndex - 1];
    const signal = this.signalLine[lastIndex];
    const signalPrev = this.signalLine[lastIndex - 1];
    const hist = this.histogram[lastIndex];

    if (isNaN(macd) || isNaN(signal)) return null;

    const useHistogram = Boolean(this.parameters.useHistogramConfirmation);
    const minHist = Number(this.parameters.minHistogramStrength);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Bullish crossover: MACD пересекает signal снизу вверх
    if (macdPrev <= signalPrev && macd > signal) {
      if (useHistogram && hist < minHist) {
        // Недостаточная сила
      } else {
        signalType = "LONG";
        reason = "Bullish MACD crossover";
      }
    }

    // Bearish crossover: MACD пересекает signal сверху вниз
    if (macdPrev >= signalPrev && macd < signal) {
      if (useHistogram && hist > -minHist) {
        // Недостаточная сила
      } else {
        signalType = "SHORT";
        reason = "Bearish MACD crossover";
      }
    }

    if (signalType === "NO_SIGNAL") return null;

    const atr = ATR(candles, 14)[lastIndex] || currentPrice * 0.02;
    const slDistance = atr * 2;

    return {
      type: signalType,
      confidence: Math.min(100, Math.abs(hist) * 10000),
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: signalType === "LONG" 
        ? currentPrice - slDistance 
        : currentPrice + slDistance,
      reason,
      metadata: {
        macd,
        signal,
        histogram: hist,
      },
    };
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: {
      direction: "LONG" | "SHORT";
      entryPrice: number;
      currentPrice: number;
      size: number;
      openTime: Date;
    }
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const macd = this.macdLine[lastIndex];
    const signal = this.signalLine[lastIndex];
    const hist = this.histogram[lastIndex];

    if (isNaN(macd) || isNaN(signal)) return null;

    let shouldExit = false;
    let reason = "";

    // Exit LONG при bearish crossover
    if (position.direction === "LONG" && macd < signal && hist < 0) {
      shouldExit = true;
      reason = "Bearish MACD crossover - exit long";
    }

    // Exit SHORT при bullish crossover
    if (position.direction === "SHORT" && macd > signal && hist > 0) {
      shouldExit = true;
      reason = "Bullish MACD crossover - exit short";
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

// ==================== BOLLINGER BANDS STRATEGY ====================

/**
 * Bollinger Bands Strategy Configuration
 */
const BB_STRATEGY_CONFIG: StrategyConfig = {
  id: "bollinger-bands",
  name: "Bollinger Bands Mean Reversion",
  description: "Торговля на откате от границ Bollinger Bands к средней линии",
  version: "1.0.0",
  author: "CITARION",
  timeframes: ["5m", "15m", "1h"],
  defaultTimeframe: "15m",
  parameters: [
    {
      name: "bbPeriod",
      description: "Период Bollinger Bands",
      type: "integer",
      defaultValue: 20,
      min: 10,
      max: 30,
      category: "Bollinger",
    },
    {
      name: "bbStdDev",
      description: "Стандартное отклонение",
      type: "number",
      defaultValue: 2,
      min: 1,
      max: 3,
      category: "Bollinger",
    },
    {
      name: "requireSqueeze",
      description: "Требовать сужение полос перед входом",
      type: "boolean",
      defaultValue: false,
      category: "Confirmation",
    },
    {
      name: "squeezeThreshold",
      description: "Порог сужения в % от цены",
      type: "number",
      defaultValue: 2,
      min: 0.5,
      max: 5,
      category: "Confirmation",
    },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]], // Conservative
  tags: ["mean-reversion", "volatility", "intermediate"],
  minCandlesRequired: 50,
};

/**
 * Bollinger Bands Strategy
 */
export class BollingerBandsStrategy extends BaseStrategy {
  private upper: number[] = [];
  private middle: number[] = [];
  private lower: number[] = [];

  constructor() {
    super(BB_STRATEGY_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.bbPeriod);
    const stdDev = Number(this.parameters.bbStdDev);

    const bb = BollingerBands(closes, period, stdDev);
    this.upper = bb.upper;
    this.middle = bb.middle;
    this.lower = bb.lower;

    return {
      bollingerBands: bb,
    };
  }

  populateEntrySignal(
    candles: Candle[],
    indicators: IndicatorResult,
    currentPrice: number
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const upper = this.upper[lastIndex];
    const lower = this.lower[lastIndex];
    const middle = this.middle[lastIndex];

    if (isNaN(upper) || isNaN(lower)) return null;

    const requireSqueeze = Boolean(this.parameters.requireSqueeze);
    const squeezeThreshold = Number(this.parameters.squeezeThreshold);
    const bandwidth = ((upper - lower) / middle) * 100;

    if (requireSqueeze && bandwidth > squeezeThreshold) {
      return null;
    }

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Price touches lower band - potential LONG
    if (currentPrice <= lower) {
      signalType = "LONG";
      reason = `Price at lower BB (${currentPrice.toFixed(2)} <= ${lower.toFixed(2)})`;
    }

    // Price touches upper band - potential SHORT
    if (currentPrice >= upper) {
      signalType = "SHORT";
      reason = `Price at upper BB (${currentPrice.toFixed(2)} >= ${upper.toFixed(2)})`;
    }

    if (signalType === "NO_SIGNAL") return null;

    const atr = ATR(candles, 14)[lastIndex] || currentPrice * 0.02;

    return {
      type: signalType,
      confidence: Math.min(100, bandwidth * 10),
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedEntryPrices: [currentPrice],
      suggestedStopLoss: signalType === "LONG" 
        ? lower - atr 
        : upper + atr,
      suggestedTakeProfits: [
        { price: middle, percent: 50 },
        { price: signalType === "LONG" ? upper : lower, percent: 50 },
      ],
      reason,
      metadata: {
        upper,
        lower,
        middle,
        bandwidth,
      },
    };
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: {
      direction: "LONG" | "SHORT";
      entryPrice: number;
      currentPrice: number;
      size: number;
      openTime: Date;
    }
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const middle = this.middle[lastIndex];

    if (isNaN(middle)) return null;

    let shouldExit = false;
    let reason = "";

    // Exit LONG when price reaches middle band
    if (position.direction === "LONG" && position.currentPrice >= middle) {
      shouldExit = true;
      reason = "Price reached middle BB - taking profit";
    }

    // Exit SHORT when price reaches middle band
    if (position.direction === "SHORT" && position.currentPrice <= middle) {
      shouldExit = true;
      reason = "Price reached middle BB - taking profit";
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

// ==================== EMA CROSSOVER STRATEGY ====================

/**
 * EMA Crossover Strategy Configuration
 */
const EMA_CROSSOVER_CONFIG: StrategyConfig = {
  id: "ema-crossover",
  name: "EMA Crossover",
  description: "Торговля по пересечению быстрой и медленной EMA",
  version: "1.0.0",
  author: "CITARION",
  timeframes: ["15m", "1h", "4h", "1d"],
  defaultTimeframe: "1h",
  parameters: [
    {
      name: "fastPeriod",
      description: "Быстрая EMA",
      type: "integer",
      defaultValue: 9,
      min: 5,
      max: 20,
      category: "EMA",
    },
    {
      name: "slowPeriod",
      description: "Медленная EMA",
      type: "integer",
      defaultValue: 21,
      min: 15,
      max: 50,
      category: "EMA",
    },
    {
      name: "trendPeriod",
      description: "EMA для определения тренда",
      type: "integer",
      defaultValue: 200,
      min: 100,
      max: 300,
      category: "Trend",
    },
    {
      name: "useTrendFilter",
      description: "Фильтровать по глобальному тренду",
      type: "boolean",
      defaultValue: true,
      category: "Trend",
    },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[3]], // Swing
  tags: ["trend", "beginner"],
  minCandlesRequired: 200,
};

/**
 * EMA Crossover Strategy
 */
export class EMACrossoverStrategy extends BaseStrategy {
  private fastEMA: number[] = [];
  private slowEMA: number[] = [];
  private trendEMA: number[] = [];

  constructor() {
    super(EMA_CROSSOVER_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const fast = Number(this.parameters.fastPeriod);
    const slow = Number(this.parameters.slowPeriod);
    const trend = Number(this.parameters.trendPeriod);

    this.fastEMA = EMA(closes, fast);
    this.slowEMA = EMA(closes, slow);
    this.trendEMA = EMA(closes, trend);

    return {
      ema: {
        [fast]: this.fastEMA,
        [slow]: this.slowEMA,
        [trend]: this.trendEMA,
      },
    };
  }

  populateEntrySignal(
    candles: Candle[],
    indicators: IndicatorResult,
    currentPrice: number
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const fast = this.fastEMA[lastIndex];
    const fastPrev = this.fastEMA[lastIndex - 1];
    const slow = this.slowEMA[lastIndex];
    const slowPrev = this.slowEMA[lastIndex - 1];
    const trend = this.trendEMA[lastIndex];

    if (isNaN(fast) || isNaN(slow) || isNaN(trend)) return null;

    const useTrendFilter = Boolean(this.parameters.useTrendFilter);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Bullish crossover
    if (fastPrev <= slowPrev && fast > slow) {
      if (useTrendFilter && currentPrice < trend) {
        // Против тренда
      } else {
        signalType = "LONG";
        reason = "Fast EMA crossed above slow EMA";
      }
    }

    // Bearish crossover
    if (fastPrev >= slowPrev && fast < slow) {
      if (useTrendFilter && currentPrice > trend) {
        // Против тренда
      } else {
        signalType = "SHORT";
        reason = "Fast EMA crossed below slow EMA";
      }
    }

    if (signalType === "NO_SIGNAL") return null;

    const atr = ATR(candles, 14)[lastIndex] || currentPrice * 0.02;

    return {
      type: signalType,
      confidence: useTrendFilter ? 85 : 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      suggestedStopLoss: signalType === "LONG" 
        ? currentPrice - atr * 2 
        : currentPrice + atr * 2,
      suggestedTakeProfits: [
        { price: signalType === "LONG" 
          ? currentPrice + atr * 3 
          : currentPrice - atr * 3, percent: 100 },
      ],
      reason,
      metadata: {
        fastEMA: fast,
        slowEMA: slow,
        trendEMA: trend,
      },
    };
  }

  populateExitSignal(
    candles: Candle[],
    indicators: IndicatorResult,
    position: {
      direction: "LONG" | "SHORT";
      entryPrice: number;
      currentPrice: number;
      size: number;
      openTime: Date;
    }
  ): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const fast = this.fastEMA[lastIndex];
    const slow = this.slowEMA[lastIndex];

    if (isNaN(fast) || isNaN(slow)) return null;

    let shouldExit = false;
    let reason = "";

    // Exit LONG on bearish crossover
    if (position.direction === "LONG" && fast < slow) {
      shouldExit = true;
      reason = "Bearish EMA crossover - exit long";
    }

    // Exit SHORT on bullish crossover
    if (position.direction === "SHORT" && fast > slow) {
      shouldExit = true;
      reason = "Bullish EMA crossover - exit short";
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

// ==================== ZENBOT STRATEGIES ====================

import {
  ZENBOT_STRATEGIES,
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
} from "./zenbot-strategies";
import { ZenbotNeuralStrategy, NEURAL_STRATEGY_CONFIG } from "./neural-strategy";

// ==================== EXPORT ALL STRATEGIES ====================

export const BUILTIN_STRATEGIES = [
  // Original CITARION strategies
  RSIStrategy,
  MACDStrategy,
  BollingerBandsStrategy,
  EMACrossoverStrategy,
  // Zenbot ported strategies (14 strategies)
  ...ZENBOT_STRATEGIES,
  // AI-powered strategy
  ZenbotNeuralStrategy,
];

export {
  // Original configs
  RSI_STRATEGY_CONFIG,
  MACD_STRATEGY_CONFIG,
  BB_STRATEGY_CONFIG,
  EMA_CROSSOVER_CONFIG,
  // Zenbot configs
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
  // AI-powered config
  NEURAL_STRATEGY_CONFIG,
};
