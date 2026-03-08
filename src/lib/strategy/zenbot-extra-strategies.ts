/**
 * Zenbot Extra Strategies
 * 
 * Дополнительные стратегии из Zenbot (https://github.com/DeviaVir/zenbot)
 * 
 * Стратегии:
 * - trend_ema: Default Zenbot strategy - EMA trend with RSI filter
 * - rsi_highwater: RSI high-water readings strategy
 * - speed: Experimental volatility strategy
 * - stddev: Standard deviation strategy
 * - trendline: Trendline strategy
 * 
 * @author CITARION (ported from Zenbot)
 * @version 1.0.0
 */

import { Candle, IndicatorResult, StrategySignal, StrategyConfig, BaseStrategy, SignalType } from "./types";
import { RSI, EMA, SMA } from "./indicators";
import { PREDEFINED_TACTICS_SETS } from "./tactics/types";

// ==================== HELPER FUNCTIONS ====================

/**
 * Standard Deviation calculation
 */
function standardDeviationArr(data: number[], period: number): number[] {
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
 * Rate of change
 */
function rateOfChange(data: number[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < data.length; i++) {
    if (data[i - 1] === 0) {
      result.push(0);
    } else {
      result.push((data[i] - data[i - 1]) / data[i - 1]);
    }
  }
  return result;
}

// ==================== 1. TREND_EMA (Default Zenbot Strategy) ====================

const ZENBOT_TREND_EMA_CONFIG: StrategyConfig = {
  id: "zenbot-trend-ema",
  name: "Zenbot Trend EMA",
  description: "Default Zenbot strategy - Buy when EMA trend is up, sell when down. Optional RSI oversold buying.",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["1m", "2m", "5m", "10m", "15m"],
  defaultTimeframe: "2m",
  parameters: [
    { name: "trendEmaPeriod", type: "integer", defaultValue: 26, min: 10, max: 50, category: "Trend" },
    { name: "neutralRate", type: "number", defaultValue: 0, min: 0, max: 0.5, category: "Filter", description: "Avoid trades if trend rate under this value (0 = disabled, -1 = auto)" },
    { name: "oversoldRsiPeriods", type: "integer", defaultValue: 14, min: 5, max: 30, category: "RSI" },
    { name: "oversoldRsi", type: "number", defaultValue: 10, min: 5, max: 40, category: "RSI", description: "Buy when RSI reaches this value" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["trend", "zenbot", "ema", "default"],
  minCandlesRequired: 52,
};

export class ZenbotTrendEMAStrategy extends BaseStrategy {
  private ema: number[] = [];
  private rsi: number[] = [];
  private trendRate: number[] = [];
  private neutralRateAuto: number = 0;

  constructor() {
    super(ZENBOT_TREND_EMA_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const emaPeriod = Number(this.parameters.trendEmaPeriod);
    const rsiPeriod = Number(this.parameters.oversoldRsiPeriods);

    this.ema = EMA(closes, emaPeriod);
    this.rsi = RSI(closes, rsiPeriod);
    
    // Calculate trend rate (percent change of EMA)
    this.trendRate = [];
    for (let i = 0; i < this.ema.length; i++) {
      if (i === 0 || isNaN(this.ema[i]) || isNaN(this.ema[i - 1]) || this.ema[i - 1] === 0) {
        this.trendRate.push(0);
      } else {
        this.trendRate.push((this.ema[i] - this.ema[i - 1]) / this.ema[i - 1]);
      }
    }

    // Auto neutral rate = standard deviation of trend rates
    const validRates = this.trendRate.filter(r => !isNaN(r) && r !== 0);
    if (validRates.length > 20) {
      const mean = validRates.slice(-100).reduce((a, b) => a + b, 0) / Math.min(100, validRates.length);
      const variance = validRates.slice(-100).reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / Math.min(100, validRates.length);
      this.neutralRateAuto = Math.sqrt(variance);
    }

    return {
      ema: { [emaPeriod]: this.ema },
      rsi: { [rsiPeriod]: this.rsi },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const trendRate = this.trendRate[lastIndex];
    const prevTrendRate = this.trendRate[lastIndex - 1];
    const rsi = this.rsi[lastIndex];

    if (isNaN(trendRate)) return null;

    let neutralRate = Number(this.parameters.neutralRate);
    if (neutralRate < 0) {
      neutralRate = this.neutralRateAuto;
    }
    const oversoldRsi = Number(this.parameters.oversoldRsi);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Trend-based signals
    if (trendRate >= 0 && prevTrendRate < 0) {
      // Trend turned up
      if (neutralRate === 0 || Math.abs(trendRate) >= neutralRate) {
        signalType = "LONG";
        reason = `Trend EMA turned up (${(trendRate * 100).toFixed(3)}%)`;
      }
    } else if (trendRate < 0 && prevTrendRate >= 0) {
      // Trend turned down
      if (neutralRate === 0 || Math.abs(trendRate) >= neutralRate) {
        signalType = "SHORT";
        reason = `Trend EMA turned down (${(trendRate * 100).toFixed(3)}%)`;
      }
    }

    // RSI oversold buy signal (counter-trend)
    if (signalType === "NO_SIGNAL" && !isNaN(rsi) && rsi <= oversoldRsi && trendRate >= 0) {
      signalType = "LONG";
      reason = `RSI oversold (${rsi.toFixed(1)}) with uptrend`;
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: signalType === "LONG" && rsi <= oversoldRsi ? 80 : 70,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { trendRate, rsi, neutralRate },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const trendRate = this.trendRate[lastIndex];
    const prevTrendRate = this.trendRate[lastIndex - 1];

    if (isNaN(trendRate)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && trendRate < 0 && prevTrendRate >= 0) {
      shouldExit = true;
      reason = "Trend EMA turned down - exit long";
    }
    if (position.direction === "SHORT" && trendRate >= 0 && prevTrendRate < 0) {
      shouldExit = true;
      reason = "Trend EMA turned up - exit short";
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

// ==================== 2. RSI HIGH-WATER ====================

const ZENBOT_RSI_HIGHWATER_CONFIG: StrategyConfig = {
  id: "zenbot-rsi-highwater",
  name: "Zenbot RSI High-Water",
  description: "Attempts to buy low and sell high by tracking RSI high-water readings",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["1m", "2m", "5m", "15m"],
  defaultTimeframe: "2m",
  parameters: [
    { name: "rsiPeriods", type: "integer", defaultValue: 14, min: 7, max: 30, category: "RSI" },
    { name: "oversoldRsi", type: "number", defaultValue: 30, min: 15, max: 45, category: "Levels" },
    { name: "overboughtRsi", type: "number", defaultValue: 82, min: 70, max: 95, category: "Levels" },
    { name: "rsiRecover", type: "number", defaultValue: 3, min: 0, max: 15, category: "Entry", description: "Allow RSI to recover this many points before buying" },
    { name: "rsiDrop", type: "number", defaultValue: 0, min: 0, max: 15, category: "Exit", description: "Allow RSI to fall this many points before selling" },
    { name: "rsiDivisor", type: "number", defaultValue: 2, min: 1, max: 5, category: "Exit", description: "Sell when RSI reaches high-water reading divided by this value" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["mean-reversion", "zenbot", "rsi"],
  minCandlesRequired: 52,
};

export class ZenbotRSIHighwaterStrategy extends BaseStrategy {
  private rsi: number[] = [];
  private rsiHighwater: number = 0;
  private rsiLowwater: number = 100;
  private lastSignal: "buy" | "sell" | null = null;

  constructor() {
    super(ZENBOT_RSI_HIGHWATER_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.rsiPeriods);

    this.rsi = RSI(closes, period);
    
    // Track high-water mark
    const lastIndex = this.rsi.length - 1;
    const currentRsi = this.rsi[lastIndex];
    
    if (!isNaN(currentRsi)) {
      if (this.lastSignal === "buy") {
        this.rsiHighwater = Math.max(this.rsiHighwater, currentRsi);
      } else if (this.lastSignal === "sell") {
        this.rsiLowwater = Math.min(this.rsiLowwater, currentRsi);
      }
    }

    return {
      rsi: { [period]: this.rsi },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const rsi = this.rsi[lastIndex];
    const prevRsi = this.rsi[lastIndex - 1];

    if (isNaN(rsi) || isNaN(prevRsi)) return null;

    const oversold = Number(this.parameters.oversoldRsi);
    const overbought = Number(this.parameters.overboughtRsi);
    const recover = Number(this.parameters.rsiRecover);
    const divisor = Number(this.parameters.rsiDivisor);

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Buy when RSI was oversold and starts recovering
    if (prevRsi <= oversold && rsi > oversold + recover) {
      signalType = "LONG";
      reason = `RSI recovering from oversold (${prevRsi.toFixed(1)} -> ${rsi.toFixed(1)})`;
      this.lastSignal = "buy";
      this.rsiHighwater = rsi;
    }
    // Sell when RSI reaches high-water / divisor
    else if (this.lastSignal === "buy" && rsi >= this.rsiHighwater / divisor) {
      signalType = "SHORT";
      reason = `RSI reached high-water/divisor (${rsi.toFixed(1)} >= ${this.rsiHighwater.toFixed(1)}/${divisor})`;
      this.lastSignal = "sell";
      this.rsiLowwater = rsi;
    }
    // Also sell on overbought
    else if (rsi >= overbought) {
      signalType = "SHORT";
      reason = `RSI overbought (${rsi.toFixed(1)})`;
      this.lastSignal = "sell";
      this.rsiLowwater = rsi;
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
      metadata: { rsi, rsiHighwater: this.rsiHighwater, lastSignal: this.lastSignal },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const rsi = this.rsi[lastIndex];

    if (isNaN(rsi)) return null;

    const overbought = Number(this.parameters.overboughtRsi);
    const oversold = Number(this.parameters.oversoldRsi);
    const drop = Number(this.parameters.rsiDrop);
    const divisor = Number(this.parameters.rsiDivisor);

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG") {
      // Exit on overbought
      if (rsi >= overbought) {
        shouldExit = true;
        reason = `RSI overbought (${rsi.toFixed(1)})`;
      }
      // Exit on high-water / divisor
      else if (rsi >= this.rsiHighwater / divisor) {
        shouldExit = true;
        reason = `RSI at high-water/divisor`;
      }
    }
    
    if (position.direction === "SHORT") {
      if (rsi <= oversold) {
        shouldExit = true;
        reason = `RSI oversold (${rsi.toFixed(1)})`;
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

  reset(): void {
    super.reset();
    this.rsiHighwater = 0;
    this.rsiLowwater = 100;
    this.lastSignal = null;
  }
}

// ==================== 3. SPEED (Experimental) ====================

const ZENBOT_SPEED_CONFIG: StrategyConfig = {
  id: "zenbot-speed",
  name: "Zenbot Speed",
  description: "EXPERIMENTAL - Trade when % change from last two periods is higher than average volatility",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["1m"],
  defaultTimeframe: "1m",
  parameters: [
    { name: "baselinePeriods", type: "integer", defaultValue: 3000, min: 100, max: 5000, category: "Baseline" },
    { name: "triggerFactor", type: "number", defaultValue: 1.6, min: 1, max: 3, category: "Trigger" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[2]],
  tags: ["experimental", "zenbot", "volatility"],
  minCandlesRequired: 100,
};

export class ZenbotSpeedStrategy extends BaseStrategy {
  private priceChanges: number[] = [];
  private baseline: number = 0;

  constructor() {
    super(ZENBOT_SPEED_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const baselinePeriods = Number(this.parameters.baselinePeriods);
    const closes = candles.map(c => c.close);
    
    // Calculate % change from last two periods
    this.priceChanges = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] !== 0) {
        this.priceChanges.push(Math.abs((closes[i] - closes[i - 1]) / closes[i - 1]));
      } else {
        this.priceChanges.push(0);
      }
    }
    
    // Calculate baseline EMA of price changes
    const changesForBaseline = this.priceChanges.slice(-baselinePeriods);
    if (changesForBaseline.length > 0) {
      this.baseline = changesForBaseline.reduce((a, b) => a + b, 0) / changesForBaseline.length;
    }

    return {
      custom: { priceChanges: this.priceChanges, baseline: this.baseline },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    if (this.priceChanges.length < 2) return null;
    
    const triggerFactor = Number(this.parameters.triggerFactor);
    const lastChange = this.priceChanges[this.priceChanges.length - 1];
    const prevChange = this.priceChanges[this.priceChanges.length - 2];
    
    // Calculate trigger threshold
    const trigger = this.baseline * triggerFactor;
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Check if recent changes exceed trigger
    if (lastChange > trigger && prevChange > trigger) {
      // Determine direction from price movement
      const closes = candles.map(c => c.close);
      const lastClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      
      if (lastClose > prevClose) {
        signalType = "LONG";
        reason = `High volatility uptrend (${(lastChange * 100).toFixed(2)}% > ${(trigger * 100).toFixed(2)}% trigger)`;
      } else {
        signalType = "SHORT";
        reason = `High volatility downtrend (${(lastChange * 100).toFixed(2)}% > ${(trigger * 100).toFixed(2)}% trigger)`;
      }
    }

    if (signalType === "NO_SIGNAL") return null;

    return {
      type: signalType,
      confidence: 50, // Experimental, low confidence
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { lastChange, baseline: this.baseline, trigger },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const triggerFactor = Number(this.parameters.triggerFactor);
    const trigger = this.baseline * triggerFactor;
    const lastChange = this.priceChanges[this.priceChanges.length - 1];
    
    // Exit when volatility drops below trigger
    if (lastChange < trigger) {
      return {
        type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
        confidence: 50,
        symbol: "",
        timeframe: this.config.defaultTimeframe,
        timestamp: new Date(),
        price: position.currentPrice,
        reason: `Volatility normalized (${(lastChange * 100).toFixed(2)}% < ${(trigger * 100).toFixed(2)}%)`,
      };
    }
    
    return null;
  }
}

// ==================== 4. STDDEV ====================

const ZENBOT_STDDEV_CONFIG: StrategyConfig = {
  id: "zenbot-stddev",
  name: "Zenbot StdDev",
  description: "Buy when standard deviation and mean increase, sell on mean decrease",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["1m", "5m"],
  defaultTimeframe: "1m",
  parameters: [
    { name: "trendTrades1", type: "integer", defaultValue: 5, min: 2, max: 20, category: "Short" },
    { name: "trendTrades2", type: "integer", defaultValue: 53, min: 20, max: 100, category: "Long" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[2]],
  tags: ["statistical", "zenbot", "stddev"],
  minCandlesRequired: 100,
};

export class ZenbotStdDevStrategy extends BaseStrategy {
  private stdDevShort: number[] = [];
  private stdDevLong: number[] = [];
  private meanShort: number[] = [];
  private meanLong: number[] = [];

  constructor() {
    super(ZENBOT_STDDEV_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const shortPeriod = Number(this.parameters.trendTrades1);
    const longPeriod = Number(this.parameters.trendTrades2);

    this.stdDevShort = standardDeviationArr(closes, shortPeriod);
    this.stdDevLong = standardDeviationArr(closes, longPeriod);
    
    // Calculate means
    this.meanShort = [];
    this.meanLong = [];
    
    for (let i = 0; i < closes.length; i++) {
      if (i < shortPeriod - 1) {
        this.meanShort.push(NaN);
      } else {
        const slice = closes.slice(i - shortPeriod + 1, i + 1);
        this.meanShort.push(slice.reduce((a, b) => a + b, 0) / shortPeriod);
      }
      
      if (i < longPeriod - 1) {
        this.meanLong.push(NaN);
      } else {
        const slice = closes.slice(i - longPeriod + 1, i + 1);
        this.meanLong.push(slice.reduce((a, b) => a + b, 0) / longPeriod);
      }
    }

    return {
      custom: { 
        stdDevShort: this.stdDevShort, 
        stdDevLong: this.stdDevLong,
        meanShort: this.meanShort,
        meanLong: this.meanLong,
      },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const stdShort = this.stdDevShort[lastIndex];
    const stdShortPrev = this.stdDevShort[lastIndex - 1];
    const meanShort = this.meanShort[lastIndex];
    const meanShortPrev = this.meanShort[lastIndex - 1];

    if (isNaN(stdShort) || isNaN(meanShort)) return null;

    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Buy when both stddev and mean are increasing
    if (stdShort > stdShortPrev && meanShort > meanShortPrev) {
      signalType = "LONG";
      reason = `StdDev and mean both increasing`;
    }
    // Sell when mean is decreasing
    else if (meanShort < meanShortPrev) {
      signalType = "SHORT";
      reason = `Mean decreasing`;
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
      metadata: { stdDev: stdShort, mean: meanShort },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const meanShort = this.meanShort[lastIndex];
    const meanShortPrev = this.meanShort[lastIndex - 1];

    if (isNaN(meanShort)) return null;

    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && meanShort < meanShortPrev) {
      shouldExit = true;
      reason = "Mean started decreasing";
    }
    if (position.direction === "SHORT" && meanShort > meanShortPrev) {
      shouldExit = true;
      reason = "Mean started increasing";
    }

    if (!shouldExit) return null;

    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 60,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== 5. TRENDLINE ====================

const ZENBOT_TRENDLINE_CONFIG: StrategyConfig = {
  id: "zenbot-trendline",
  name: "Zenbot Trendline",
  description: "Calculate a trendline and trade when trend is positive vs negative",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["30s", "1m", "5m"],
  defaultTimeframe: "30s",
  parameters: [
    { name: "lastPoints", type: "integer", defaultValue: 100, min: 10, max: 500, category: "Short", description: "Number of trades for short trend average" },
    { name: "avgPoints", type: "integer", defaultValue: 1000, min: 100, max: 5000, category: "Long", description: "Number of trades for long trend average" },
    { name: "lastPoints2", type: "integer", defaultValue: 10, min: 5, max: 50, category: "Short2" },
    { name: "avgPoints2", type: "integer", defaultValue: 100, min: 20, max: 500, category: "Long2" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["trend", "zenbot", "trendline"],
  minCandlesRequired: 100,
};

export class ZenbotTrendlineStrategy extends BaseStrategy {
  private shortTrend: number = 0;
  private longTrend: number = 0;
  private shortTrend2: number = 0;
  private longTrend2: number = 0;

  constructor() {
    super(ZENBOT_TRENDLINE_CONFIG);
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const lastPoints = Number(this.parameters.lastPoints);
    const avgPoints = Number(this.parameters.avgPoints);
    const lastPoints2 = Number(this.parameters.lastPoints2);
    const avgPoints2 = Number(this.parameters.avgPoints2);

    // Calculate short trend (average of recent price changes)
    const recentCloses = closes.slice(-lastPoints);
    if (recentCloses.length >= 2) {
      let changes = 0;
      for (let i = 1; i < recentCloses.length; i++) {
        changes += recentCloses[i] - recentCloses[i - 1];
      }
      this.shortTrend = changes / (recentCloses.length - 1);
    }

    // Calculate long trend
    const longCloses = closes.slice(-avgPoints);
    if (longCloses.length >= 2) {
      let changes = 0;
      for (let i = 1; i < longCloses.length; i++) {
        changes += longCloses[i] - longCloses[i - 1];
      }
      this.longTrend = changes / (longCloses.length - 1);
    }

    // Secondary trends
    const recent2 = closes.slice(-lastPoints2);
    if (recent2.length >= 2) {
      let changes = 0;
      for (let i = 1; i < recent2.length; i++) {
        changes += recent2[i] - recent2[i - 1];
      }
      this.shortTrend2 = changes / (recent2.length - 1);
    }

    const long2 = closes.slice(-avgPoints2);
    if (long2.length >= 2) {
      let changes = 0;
      for (let i = 1; i < long2.length; i++) {
        changes += long2[i] - long2[i - 1];
      }
      this.longTrend2 = changes / (long2.length - 1);
    }

    return {
      custom: { 
        shortTrend: this.shortTrend, 
        longTrend: this.longTrend,
        shortTrend2: this.shortTrend2,
        longTrend2: this.longTrend2,
      },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";

    // Trade when short trend is stronger than long trend
    if (this.shortTrend > 0 && this.shortTrend > this.longTrend) {
      signalType = "LONG";
      reason = `Short trend (${this.shortTrend.toFixed(4)}) > Long trend (${this.longTrend.toFixed(4)})`;
    } else if (this.shortTrend < 0 && this.shortTrend < this.longTrend) {
      signalType = "SHORT";
      reason = `Short trend (${this.shortTrend.toFixed(4)}) < Long trend (${this.longTrend.toFixed(4)})`;
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
      metadata: { shortTrend: this.shortTrend, longTrend: this.longTrend },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    let shouldExit = false;
    let reason = "";

    if (position.direction === "LONG" && this.shortTrend < this.longTrend) {
      shouldExit = true;
      reason = "Short trend crossed below long trend";
    }
    if (position.direction === "SHORT" && this.shortTrend > this.longTrend) {
      shouldExit = true;
      reason = "Short trend crossed above long trend";
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

// ==================== EXPORTS ====================

export const ZENBOT_EXTRA_STRATEGIES = [
  ZenbotTrendEMAStrategy,
  ZenbotRSIHighwaterStrategy,
  ZenbotSpeedStrategy,
  ZenbotStdDevStrategy,
  ZenbotTrendlineStrategy,
];

export {
  ZENBOT_TREND_EMA_CONFIG,
  ZENBOT_RSI_HIGHWATER_CONFIG,
  ZENBOT_SPEED_CONFIG,
  ZENBOT_STDDEV_CONFIG,
  ZENBOT_TRENDLINE_CONFIG,
};
