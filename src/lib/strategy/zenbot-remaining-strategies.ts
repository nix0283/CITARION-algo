/**
 * Zenbot Remaining Strategies
 * 
 * Дополнительные стратегии из Zenbot (https://github.com/DeviaVir/zenbot)
 * 
 * Стратегии:
 * - neural: Neural Network prediction strategy
 * - macd: MACD strategy (standard)
 * - ta_ppo: Percentage Price Oscillator
 * - ta_trix: TRIX Oscillator
 * - ta_ultosc: Ultimate Oscillator
 * - trust_distrust: Trust/Distrust Reversal
 * - ta_macd_ext: Extended MACD with different MA types
 * 
 * @author CITARION (ported from Zenbot)
 * @version 1.0.0
 */

import { Candle, IndicatorResult, StrategySignal, StrategyConfig, BaseStrategy, SignalType } from "./types";
import { RSI, EMA, SMA } from "./indicators";
import { PREDEFINED_TACTICS_SETS } from "./tactics/types";

// ==================== HELPER FUNCTIONS ====================

/**
 * True Strength Index (TSI)
 * 
 * TSI = 100 * EMA(EMA(momentum, long), short) / EMA(EMA(abs(momentum), long), short)
 * Where momentum = price - prev_price
 */
function calculateTSI(data: number[], longPeriod: number, shortPeriod: number, signalPeriod: number): {
  tsi: number[];
  signal: number[];
} {
  // Calculate momentum
  const momentum: number[] = [0];
  for (let i = 1; i < data.length; i++) {
    momentum.push(data[i] - data[i - 1]);
  }
  
  // Calculate absolute momentum
  const absMomentum = momentum.map(m => Math.abs(m));
  
  // Double-smooth momentum
  const smoothedMomentum = EMA(momentum, longPeriod);
  const doubleSmoothedMomentum = EMA(smoothedMomentum, shortPeriod);
  
  // Double-smooth absolute momentum
  const smoothedAbsMomentum = EMA(absMomentum, longPeriod);
  const doubleSmoothedAbsMomentum = EMA(smoothedAbsMomentum, shortPeriod);
  
  // Calculate TSI
  const tsi: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(doubleSmoothedMomentum[i]) || isNaN(doubleSmoothedAbsMomentum[i]) || doubleSmoothedAbsMomentum[i] === 0) {
      tsi.push(NaN);
    } else {
      tsi.push(100 * (doubleSmoothedMomentum[i] / doubleSmoothedAbsMomentum[i]));
    }
  }
  
  // Calculate signal line
  const signal = EMA(tsi, signalPeriod);
  
  return { tsi, signal };
}

/**
 * Triple EMA for TRIX
 */
function tripleEMA(data: number[], period: number): number[] {
  const ema1 = EMA(data, period);
  const ema2 = EMA(ema1, period);
  return EMA(ema2, period);
}

/**
 * Ultimate Oscillator calculation
 */
function calculateUltimateOscillator(candles: Candle[], period1: number, period2: number, period3: number): number[] {
  const result: number[] = [];
  const bp: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    bp.push(candles[i].close - Math.min(candles[i].low, prevClose));
    tr.push(Math.max(candles[i].high, prevClose) - Math.min(candles[i].low, prevClose));
  }
  
  const maxPeriod = Math.max(period1, period2, period3);
  
  for (let i = 0; i < candles.length; i++) {
    if (i < maxPeriod - 1) {
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
 * Simple Neural Network prediction (simplified from Zenbot)
 */
class SimpleNeuralNet {
  private weights: number[][] = [];
  private neurons1: number;
  private depth: number;
  private momentum: number;
  private decay: number;
  
  constructor(neurons1: number, depth: number, momentum: number, decay: number) {
    this.neurons1 = neurons1;
    this.depth = depth;
    this.momentum = momentum;
    this.decay = decay;
  }
  
  train(inputs: number[][], targets: number[], learns: number): void {
    // Initialize weights if not done
    if (this.weights.length === 0) {
      for (let i = 0; i < this.neurons1; i++) {
        this.weights.push([]);
        for (let j = 0; j < inputs[0].length; j++) {
          this.weights[i].push(Math.random() * 2 - 1);
        }
      }
    }
    
    // Simple gradient descent training
    for (let learn = 0; learn < learns; learn++) {
      for (let i = 0; i < inputs.length; i++) {
        const prediction = this.predict(inputs[i]);
        const error = targets[i] - prediction;
        
        // Update weights
        for (let j = 0; j < this.neurons1; j++) {
          for (let k = 0; k < inputs[i].length; k++) {
            this.weights[j][k] += this.momentum * error * inputs[i][k] * this.decay;
          }
        }
      }
    }
  }
  
  predict(input: number[]): number {
    if (this.weights.length === 0) return 0;
    
    let sum = 0;
    for (let i = 0; i < this.neurons1; i++) {
      let neuronSum = 0;
      for (let j = 0; j < input.length; j++) {
        neuronSum += input[j] * (this.weights[i]?.[j] ?? 0);
      }
      // Sigmoid activation
      sum += 1 / (1 + Math.exp(-neuronSum));
    }
    
    return sum / this.neurons1;
  }
  
  reset(): void {
    this.weights = [];
  }
}

// ==================== 1. NEURAL STRATEGY ====================

const ZENBOT_NEURAL_CONFIG: StrategyConfig = {
  id: "zenbot-neural",
  name: "Zenbot Neural Network",
  description: "Use neural learning to predict future price. Buy = mean(last real prices) < mean(current & last prediction)",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["1m", "5m"],
  defaultTimeframe: "1m",
  parameters: [
    { name: "neurons1", type: "integer", defaultValue: 100, min: 10, max: 500, category: "Neural" },
    { name: "depth", type: "integer", defaultValue: 1, min: 1, max: 10, category: "Neural" },
    { name: "minPeriods", type: "integer", defaultValue: 1000, min: 100, max: 5000, category: "Training" },
    { name: "minPredict", type: "integer", defaultValue: 1, min: 1, max: 10, category: "Prediction" },
    { name: "momentum", type: "number", defaultValue: 0.9, min: 0.1, max: 1.0, category: "Training" },
    { name: "decay", type: "number", defaultValue: 0.1, min: 0.01, max: 0.5, category: "Training" },
    { name: "learns", type: "integer", defaultValue: 2, min: 1, max: 10, category: "Training" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[2]],
  tags: ["experimental", "zenbot", "neural", "ml"],
  minCandlesRequired: 1000,
};

export class ZenbotNeuralStrategy extends BaseStrategy {
  private neuralNet: SimpleNeuralNet;
  private predictions: number[] = [];
  private lastPredictions: number[] = [];
  
  constructor() {
    super(ZENBOT_NEURAL_CONFIG);
    this.neuralNet = new SimpleNeuralNet(100, 1, 0.9, 0.1);
  }
  
  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const neurons1 = Number(this.parameters.neurons1);
    const depth = Number(this.parameters.depth);
    const minPeriods = Number(this.parameters.minPeriods);
    const minPredict = Number(this.parameters.minPredict);
    const momentum = Number(this.parameters.momentum);
    const decay = Number(this.parameters.decay);
    const learns = Number(this.parameters.learns);
    
    // Reinitialize neural net if parameters changed
    this.neuralNet = new SimpleNeuralNet(neurons1, depth, momentum, decay);
    
    // Prepare training data
    const inputs: number[][] = [];
    const targets: number[] = [];
    
    for (let i = minPredict; i < Math.min(closes.length, minPeriods); i++) {
      const input = closes.slice(i - minPredict, i);
      inputs.push(input);
      targets.push(closes[i]);
    }
    
    // Train the network
    if (inputs.length > 0) {
      this.neuralNet.train(inputs, targets, learns);
    }
    
    // Generate predictions
    this.predictions = [];
    this.lastPredictions = [];
    
    for (let i = minPredict; i < closes.length; i++) {
      const input = closes.slice(i - minPredict, i);
      const prediction = this.neuralNet.predict(input);
      this.predictions.push(prediction);
      
      if (i >= closes.length - 3) {
        this.lastPredictions.push(prediction);
      }
    }
    
    return {
      custom: { predictions: this.predictions },
    };
  }
  
  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const closes = candles.map(c => c.close);
    
    if (this.lastPredictions.length < 2 || closes.length < 3) return null;
    
    // Get recent prices and predictions
    const recentPrices = closes.slice(-3);
    const meanReal = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const meanPrediction = this.lastPredictions.reduce((a, b) => a + b, 0) / this.lastPredictions.length;
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    // Buy signal: mean of last real prices < mean of predictions
    if (meanReal < meanPrediction) {
      signalType = "LONG";
      reason = `Neural predicts uptrend (real: ${meanReal.toFixed(2)} < pred: ${meanPrediction.toFixed(2)})`;
    }
    // Sell signal: mean of last real prices > mean of predictions  
    else if (meanReal > meanPrediction) {
      signalType = "SHORT";
      reason = `Neural predicts downtrend (real: ${meanReal.toFixed(2)} > pred: ${meanPrediction.toFixed(2)})`;
    }
    
    if (signalType === "NO_SIGNAL") return null;
    
    return {
      type: signalType,
      confidence: 55,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: { meanReal, meanPrediction },
    };
  }
  
  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const closes = candles.map(c => c.close);
    
    if (this.lastPredictions.length < 2) return null;
    
    const recentPrices = closes.slice(-3);
    const meanReal = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const meanPrediction = this.lastPredictions.reduce((a, b) => a + b, 0) / this.lastPredictions.length;
    
    let shouldExit = false;
    let reason = "";
    
    if (position.direction === "LONG" && meanReal > meanPrediction) {
      shouldExit = true;
      reason = "Neural predicts reversal to downtrend";
    }
    if (position.direction === "SHORT" && meanReal < meanPrediction) {
      shouldExit = true;
      reason = "Neural predicts reversal to uptrend";
    }
    
    if (!shouldExit) return null;
    
    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: 55,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
  
  reset(): void {
    super.reset();
    this.neuralNet.reset();
    this.predictions = [];
    this.lastPredictions = [];
  }
}

// ==================== 2. MACD STRATEGY ====================

const ZENBOT_MACD_CONFIG: StrategyConfig = {
  id: "zenbot-macd",
  name: "Zenbot MACD",
  description: "Buy when (MACD - Signal > 0) and sell when (MACD - Signal < 0)",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "emaShortPeriod", type: "integer", defaultValue: 12, min: 5, max: 30, category: "MACD" },
    { name: "emaLongPeriod", type: "integer", defaultValue: 26, min: 15, max: 50, category: "MACD" },
    { name: "signalPeriod", type: "integer", defaultValue: 9, min: 5, max: 15, category: "MACD" },
    { name: "upTrendThreshold", type: "number", defaultValue: 0, min: -1, max: 1, category: "Signal" },
    { name: "downTrendThreshold", type: "number", defaultValue: 0, min: -1, max: 1, category: "Signal" },
    { name: "overboughtRsiPeriods", type: "integer", defaultValue: 25, min: 10, max: 50, category: "RSI" },
    { name: "overboughtRsi", type: "number", defaultValue: 70, min: 60, max: 90, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["trend", "zenbot", "macd"],
  minCandlesRequired: 52,
};

export class ZenbotMACDStrategy extends BaseStrategy {
  private macd: number[] = [];
  private signal: number[] = [];
  private histogram: number[] = [];
  private rsi: number[] = [];
  
  constructor() {
    super(ZENBOT_MACD_CONFIG);
  }
  
  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const shortPeriod = Number(this.parameters.emaShortPeriod);
    const longPeriod = Number(this.parameters.emaLongPeriod);
    const signalPeriod = Number(this.parameters.signalPeriod);
    const rsiPeriod = Number(this.parameters.overboughtRsiPeriods);
    
    // Calculate MACD
    const shortEMA = EMA(closes, shortPeriod);
    const longEMA = EMA(closes, longPeriod);
    
    this.macd = shortEMA.map((s, i) => s - longEMA[i]);
    this.signal = EMA(this.macd, signalPeriod);
    this.histogram = this.macd.map((m, i) => m - this.signal[i]);
    this.rsi = RSI(closes, rsiPeriod);
    
    return {
      macd: { macd: this.macd, signal: this.signal, histogram: this.histogram },
      rsi: { [rsiPeriod]: this.rsi },
    };
  }
  
  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const macd = this.macd[lastIndex];
    const signal = this.signal[lastIndex];
    const prevMacd = this.macd[lastIndex - 1];
    const prevSignal = this.signal[lastIndex - 1];
    const rsi = this.rsi[lastIndex];
    
    if (isNaN(macd) || isNaN(signal)) return null;
    
    const upTrend = Number(this.parameters.upTrendThreshold);
    const downTrend = Number(this.parameters.downTrendThreshold);
    const overbought = Number(this.parameters.overboughtRsi);
    
    const macdValue = macd - signal;
    const prevMacdValue = prevMacd - prevSignal;
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    // Bullish crossover
    if (macdValue > upTrend && prevMacdValue <= upTrend && rsi < overbought) {
      signalType = "LONG";
      reason = `MACD bullish crossover (RSI: ${rsi?.toFixed(1) ?? 'N/A'})`;
    }
    // Bearish crossover
    else if (macdValue < downTrend && prevMacdValue >= downTrend) {
      signalType = "SHORT";
      reason = `MACD bearish crossover`;
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
      metadata: { macd, signal, histogram: this.histogram[lastIndex], rsi },
    };
  }
  
  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const macd = this.macd[lastIndex];
    const signal = this.signal[lastIndex];
    
    if (isNaN(macd) || isNaN(signal)) return null;
    
    let shouldExit = false;
    let reason = "";
    
    const macdValue = macd - signal;
    
    if (position.direction === "LONG" && macdValue < 0) {
      shouldExit = true;
      reason = "MACD turned bearish";
    }
    if (position.direction === "SHORT" && macdValue > 0) {
      shouldExit = true;
      reason = "MACD turned bullish";
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

// ==================== 3. TSI (True Strength Index) ====================

const ZENBOT_TSI_CONFIG: StrategyConfig = {
  id: "zenbot-tsi",
  name: "Zenbot True Strength Index",
  description: "Trade based on TSI oscillator crossovers",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "longPeriod", type: "integer", defaultValue: 25, min: 10, max: 50, category: "TSI" },
    { name: "shortPeriod", type: "integer", defaultValue: 13, min: 5, max: 25, category: "TSI" },
    { name: "signalPeriod", type: "integer", defaultValue: 7, min: 3, max: 15, category: "TSI" },
    { name: "oversold", type: "number", defaultValue: -25, min: -40, max: -10, category: "Levels" },
    { name: "overbought", type: "number", defaultValue: 25, min: 10, max: 40, category: "Levels" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["oscillator", "zenbot", "tsi"],
  minCandlesRequired: 50,
};

export class ZenbotTSIStrategy extends BaseStrategy {
  private tsi: number[] = [];
  private signal: number[] = [];
  
  constructor() {
    super(ZENBOT_TSI_CONFIG);
  }
  
  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const longPeriod = Number(this.parameters.longPeriod);
    const shortPeriod = Number(this.parameters.shortPeriod);
    const signalPeriod = Number(this.parameters.signalPeriod);
    
    const tsiResult = calculateTSI(closes, longPeriod, shortPeriod, signalPeriod);
    this.tsi = tsiResult.tsi;
    this.signal = tsiResult.signal;
    
    return {
      custom: { tsi: this.tsi, tsiSignal: this.signal },
    };
  }
  
  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const tsi = this.tsi[lastIndex];
    const signal = this.signal[lastIndex];
    const prevTsi = this.tsi[lastIndex - 1];
    const prevSignal = this.signal[lastIndex - 1];
    
    if (isNaN(tsi) || isNaN(signal)) return null;
    
    const oversold = Number(this.parameters.oversold);
    const overbought = Number(this.parameters.overbought);
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    // TSI crosses above signal in oversold
    if (tsi < oversold && tsi > signal && prevTsi <= prevSignal) {
      signalType = "LONG";
      reason = `TSI bullish crossover in oversold (${tsi.toFixed(1)})`;
    }
    // TSI crosses below signal in overbought
    else if (tsi > overbought && tsi < signal && prevTsi >= prevSignal) {
      signalType = "SHORT";
      reason = `TSI bearish crossover in overbought (${tsi.toFixed(1)})`;
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
      metadata: { tsi, signal },
    };
  }
  
  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const tsi = this.tsi[lastIndex];
    const signal = this.signal[lastIndex];
    
    if (isNaN(tsi)) return null;
    
    const overbought = Number(this.parameters.overbought);
    const oversold = Number(this.parameters.oversold);
    
    let shouldExit = false;
    let reason = "";
    
    if (position.direction === "LONG" && (tsi > overbought || tsi < signal)) {
      shouldExit = true;
      reason = tsi > overbought ? "TSI overbought" : "TSI crossed below signal";
    }
    if (position.direction === "SHORT" && (tsi < oversold || tsi > signal)) {
      shouldExit = true;
      reason = tsi < oversold ? "TSI oversold" : "TSI crossed above signal";
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

// ==================== 4. TRUST/DISTRUST ====================

const ZENBOT_TRUST_DISTRUST_CONFIG: StrategyConfig = {
  id: "zenbot-trust-distrust",
  name: "Zenbot Trust/Distrust",
  description: "Sell when price higher than sell_min% and highest point - sell_threshold% is reached. Buy when lowest price point + buy_threshold% reached.",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["15m", "30m", "1h"],
  defaultTimeframe: "30m",
  parameters: [
    { name: "sellThreshold", type: "number", defaultValue: 2, min: 0.5, max: 10, category: "Sell", description: "Sell when top drops at least this %" },
    { name: "sellThresholdMax", type: "number", defaultValue: 0, min: 0, max: 20, category: "Sell", description: "Panic sell when top drops this % (0 = disabled)" },
    { name: "sellMin", type: "number", defaultValue: 1, min: 0, max: 10, category: "Sell", description: "Only act when price is this % above original" },
    { name: "buyThreshold", type: "number", defaultValue: 2, min: 0.5, max: 10, category: "Buy", description: "Buy when bottom increased this %" },
    { name: "buyThresholdMax", type: "number", defaultValue: 0, min: 0, max: 20, category: "Buy", description: "Kill whipsaw (0 = disabled)" },
    { name: "greed", type: "number", defaultValue: 0, min: 0, max: 100, category: "Exit", description: "Sell at this profit % (0 = greedy)" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["reversal", "zenbot", "trust-distrust"],
  minCandlesRequired: 52,
};

export class ZenbotTrustDistrustStrategy extends BaseStrategy {
  private highestPrice: number = 0;
  private lowestPrice: number = Infinity;
  private originalPrice: number = 0;
  private buySignals: number = 0;
  
  constructor() {
    super(ZENBOT_TRUST_DISTRUST_CONFIG);
  }
  
  populateIndicators(candles: Candle[]): IndicatorResult {
    // Track high and low prices
    const lastCandle = candles[candles.length - 1];
    
    if (this.originalPrice === 0) {
      this.originalPrice = lastCandle.close;
    }
    
    this.highestPrice = Math.max(this.highestPrice, lastCandle.high);
    this.lowestPrice = Math.min(this.lowestPrice, lastCandle.low);
    
    return {
      custom: { highestPrice: this.highestPrice, lowestPrice: this.lowestPrice, originalPrice: this.originalPrice },
    };
  }
  
  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const sellThreshold = Number(this.parameters.sellThreshold);
    const sellThresholdMax = Number(this.parameters.sellThresholdMax);
    const sellMin = Number(this.parameters.sellMin);
    const buyThreshold = Number(this.parameters.buyThreshold);
    const buyThresholdMax = Number(this.parameters.buyThresholdMax);
    const greed = Number(this.parameters.greed);
    
    const pctAboveOriginal = ((currentPrice - this.originalPrice) / this.originalPrice) * 100;
    const pctFromHigh = ((this.highestPrice - currentPrice) / this.highestPrice) * 100;
    const pctFromLow = ((currentPrice - this.lowestPrice) / this.lowestPrice) * 100;
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    // SELL conditions
    if (pctAboveOriginal >= sellMin) {
      // Normal sell: price dropped from high
      if (pctFromHigh >= sellThreshold) {
        signalType = "SHORT";
        reason = `Price dropped ${pctFromHigh.toFixed(1)}% from high (threshold: ${sellThreshold}%)`;
        this.resetTracking(currentPrice);
      }
      // Panic sell
      else if (sellThresholdMax > 0 && pctFromHigh >= sellThresholdMax) {
        signalType = "SHORT";
        reason = `PANIC SELL: dropped ${pctFromHigh.toFixed(1)}% from high`;
        this.resetTracking(currentPrice);
      }
      // Greed exit
      else if (greed > 0 && pctAboveOriginal >= greed) {
        signalType = "SHORT";
        reason = `Greed exit at ${pctAboveOriginal.toFixed(1)}% profit`;
        this.resetTracking(currentPrice);
      }
    }
    
    // BUY conditions
    if (signalType === "NO_SIGNAL") {
      if (pctFromLow >= buyThreshold) {
        if (buyThresholdMax > 0) {
          this.buySignals++;
          if (this.buySignals >= buyThresholdMax) {
            signalType = "LONG";
            reason = `Buy after ${this.buySignals} signals, up ${pctFromLow.toFixed(1)}% from low`;
            this.resetTracking(currentPrice);
            this.buySignals = 0;
          }
        } else {
          signalType = "LONG";
          reason = `Price up ${pctFromLow.toFixed(1)}% from low (threshold: ${buyThreshold}%)`;
          this.resetTracking(currentPrice);
        }
      }
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
      metadata: { pctAboveOriginal, pctFromHigh, pctFromLow },
    };
  }
  
  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const greed = Number(this.parameters.greed);
    const sellThreshold = Number(this.parameters.sellThreshold);
    
    const pnlPct = position.direction === "LONG"
      ? ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - position.currentPrice) / position.entryPrice) * 100;
    
    let shouldExit = false;
    let reason = "";
    
    // Greed exit
    if (greed > 0 && pnlPct >= greed) {
      shouldExit = true;
      reason = `Target profit reached: ${pnlPct.toFixed(1)}%`;
    }
    
    // Trailing exit (use sellThreshold as trailing)
    if (position.direction === "LONG") {
      const pctFromHigh = ((this.highestPrice - position.currentPrice) / this.highestPrice) * 100;
      if (pctFromHigh >= sellThreshold && pnlPct > 0) {
        shouldExit = true;
        reason = `Trailing stop hit: dropped ${pctFromHigh.toFixed(1)}% from high`;
      }
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
  
  private resetTracking(price: number): void {
    this.highestPrice = price;
    this.lowestPrice = price;
    this.originalPrice = price;
  }
  
  reset(): void {
    super.reset();
    this.highestPrice = 0;
    this.lowestPrice = Infinity;
    this.originalPrice = 0;
    this.buySignals = 0;
  }
}

// ==================== 5. PPO (Percentage Price Oscillator) ====================

const ZENBOT_PPO_CONFIG: StrategyConfig = {
  id: "zenbot-ppo",
  name: "Zenbot PPO",
  description: "Percentage Price Oscillator with RSI filter",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["10m", "15m", "30m"],
  defaultTimeframe: "10m",
  parameters: [
    { name: "emaShortPeriod", type: "integer", defaultValue: 12, min: 5, max: 30, category: "PPO" },
    { name: "emaLongPeriod", type: "integer", defaultValue: 26, min: 15, max: 50, category: "PPO" },
    { name: "signalPeriod", type: "integer", defaultValue: 9, min: 5, max: 15, category: "PPO" },
    { name: "overboughtRsiPeriods", type: "integer", defaultValue: 25, min: 10, max: 50, category: "RSI" },
    { name: "overboughtRsi", type: "number", defaultValue: 70, min: 60, max: 90, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["oscillator", "zenbot", "ppo"],
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
    const shortPeriod = Number(this.parameters.emaShortPeriod);
    const longPeriod = Number(this.parameters.emaLongPeriod);
    const signalPeriod = Number(this.parameters.signalPeriod);
    const rsiPeriod = Number(this.parameters.overboughtRsiPeriods);
    
    // Calculate PPO
    const shortEMA = EMA(closes, shortPeriod);
    const longEMA = EMA(closes, longPeriod);
    
    this.ppo = shortEMA.map((s, i) => {
      if (isNaN(s) || isNaN(longEMA[i]) || longEMA[i] === 0) return NaN;
      return ((s - longEMA[i]) / longEMA[i]) * 100;
    });
    
    this.signal = EMA(this.ppo, signalPeriod);
    this.histogram = this.ppo.map((p, i) => p - this.signal[i]);
    this.rsi = RSI(closes, rsiPeriod);
    
    return {
      custom: { ppo: this.ppo, ppoSignal: this.signal, histogram: this.histogram },
      rsi: { [rsiPeriod]: this.rsi },
    };
  }
  
  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const ppo = this.ppo[lastIndex];
    const signal = this.signal[lastIndex];
    const prevPpo = this.ppo[lastIndex - 1];
    const prevSignal = this.signal[lastIndex - 1];
    const rsi = this.rsi[lastIndex];
    
    if (isNaN(ppo) || isNaN(signal)) return null;
    
    const overbought = Number(this.parameters.overboughtRsi);
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    // Bullish crossover
    if (ppo > signal && prevPpo <= prevSignal && rsi < overbought) {
      signalType = "LONG";
      reason = `PPO bullish crossover (${ppo.toFixed(2)})`;
    }
    // Bearish crossover
    else if (ppo < signal && prevPpo >= prevSignal) {
      signalType = "SHORT";
      reason = `PPO bearish crossover (${ppo.toFixed(2)})`;
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
      metadata: { ppo, signal, rsi },
    };
  }
  
  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const ppo = this.ppo[lastIndex];
    const signal = this.signal[lastIndex];
    
    if (isNaN(ppo)) return null;
    
    let shouldExit = false;
    let reason = "";
    
    if (position.direction === "LONG" && ppo < signal) {
      shouldExit = true;
      reason = "PPO turned bearish";
    }
    if (position.direction === "SHORT" && ppo > signal) {
      shouldExit = true;
      reason = "PPO turned bullish";
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

// ==================== 6. TRIX ====================

const ZENBOT_TRIX_CONFIG: StrategyConfig = {
  id: "zenbot-trix",
  name: "Zenbot TRIX",
  description: "TRIX - 1-day Rate-Of-Change of a Triple Smooth EMA with RSI filter",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["5m", "10m", "15m"],
  defaultTimeframe: "5m",
  parameters: [
    { name: "timeperiod", type: "integer", defaultValue: 30, min: 10, max: 50, category: "TRIX" },
    { name: "overboughtRsiPeriods", type: "integer", defaultValue: 25, min: 10, max: 50, category: "RSI" },
    { name: "overboughtRsi", type: "number", defaultValue: 70, min: 60, max: 90, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["oscillator", "zenbot", "trix"],
  minCandlesRequired: 90,
};

export class ZenbotTRIXStrategy extends BaseStrategy {
  private trix: number[] = [];
  private rsi: number[] = [];
  
  constructor() {
    super(ZENBOT_TRIX_CONFIG);
  }
  
  populateIndicators(candles: Candle[]): IndicatorResult {
    const closes = candles.map(c => c.close);
    const period = Number(this.parameters.timeperiod);
    const rsiPeriod = Number(this.parameters.overboughtRsiPeriods);
    
    // Calculate TRIX
    const tripleEma = tripleEMA(closes, period);
    
    this.trix = [];
    let prevEma = 0;
    
    for (let i = 0; i < tripleEma.length; i++) {
      if (isNaN(tripleEma[i]) || i === 0) {
        this.trix.push(NaN);
        prevEma = tripleEma[i] || 0;
        continue;
      }
      
      if (prevEma !== 0) {
        this.trix.push(((tripleEma[i] - prevEma) / Math.abs(prevEma)) * 100);
      } else {
        this.trix.push(0);
      }
      prevEma = tripleEma[i];
    }
    
    this.rsi = RSI(closes, rsiPeriod);
    
    return {
      custom: { trix: this.trix },
      rsi: { [rsiPeriod]: this.rsi },
    };
  }
  
  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const trix = this.trix[lastIndex];
    const prevTrix = this.trix[lastIndex - 1];
    const rsi = this.rsi[lastIndex];
    
    if (isNaN(trix)) return null;
    
    const overbought = Number(this.parameters.overboughtRsi);
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    // TRIX crosses above zero
    if (trix > 0 && prevTrix <= 0 && rsi < overbought) {
      signalType = "LONG";
      reason = `TRIX turned positive (${trix.toFixed(3)})`;
    }
    // TRIX crosses below zero
    else if (trix < 0 && prevTrix >= 0) {
      signalType = "SHORT";
      reason = `TRIX turned negative (${trix.toFixed(3)})`;
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
      reason = "TRIX turned negative";
    }
    if (position.direction === "SHORT" && trix > 0) {
      shouldExit = true;
      reason = "TRIX turned positive";
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

// ==================== 7. ULTIMATE OSCILLATOR ====================

const ZENBOT_ULTOSC_CONFIG: StrategyConfig = {
  id: "zenbot-ultosc",
  name: "Zenbot Ultimate Oscillator",
  description: "Ultimate Oscillator with RSI filter for trade signals",
  version: "1.0.0",
  author: "Zenbot",
  timeframes: ["5m", "10m", "15m"],
  defaultTimeframe: "5m",
  parameters: [
    { name: "timeperiod1", type: "integer", defaultValue: 7, min: 3, max: 15, category: "ULTOSC" },
    { name: "timeperiod2", type: "integer", defaultValue: 14, min: 7, max: 30, category: "ULTOSC" },
    { name: "timeperiod3", type: "integer", defaultValue: 28, min: 14, max: 50, category: "ULTOSC" },
    { name: "signalType", type: "string", defaultValue: "simple", options: ["simple", "low", "trend"], category: "Signal" },
    { name: "overboughtRsiPeriods", type: "integer", defaultValue: 25, min: 10, max: 50, category: "RSI" },
    { name: "overboughtRsi", type: "number", defaultValue: 90, min: 70, max: 95, category: "RSI" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[0]],
  tags: ["oscillator", "zenbot", "ultosc"],
  minCandlesRequired: 52,
};

export class ZenbotUltOscStrategy extends BaseStrategy {
  private ultosc: number[] = [];
  private rsi: number[] = [];
  
  constructor() {
    super(ZENBOT_ULTOSC_CONFIG);
  }
  
  populateIndicators(candles: Candle[]): IndicatorResult {
    const period1 = Number(this.parameters.timeperiod1);
    const period2 = Number(this.parameters.timeperiod2);
    const period3 = Number(this.parameters.timeperiod3);
    const rsiPeriod = Number(this.parameters.overboughtRsiPeriods);
    
    this.ultosc = calculateUltimateOscillator(candles, period1, period2, period3);
    
    const closes = candles.map(c => c.close);
    this.rsi = RSI(closes, rsiPeriod);
    
    return {
      custom: { ultosc: this.ultosc },
      rsi: { [rsiPeriod]: this.rsi },
    };
  }
  
  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const ultosc = this.ultosc[lastIndex];
    const rsi = this.rsi[lastIndex];
    
    if (isNaN(ultosc)) return null;
    
    const signalTypeParam = String(this.parameters.signalType);
    const overbought = Number(this.parameters.overboughtRsi);
    
    // Define levels based on signal type
    let buyLevel: number;
    let sellLevel: number;
    
    switch (signalTypeParam) {
      case "low":
        buyLevel = 65;
        sellLevel = 30;
        break;
      case "trend":
        buyLevel = 30;
        sellLevel = 70;
        break;
      default: // simple
        buyLevel = 65;
        sellLevel = 50;
    }
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    if (ultosc < buyLevel && rsi < overbought) {
      signalType = "LONG";
      reason = `Ultimate Oscillator oversold (${ultosc.toFixed(1)} < ${buyLevel})`;
    } else if (ultosc > sellLevel) {
      signalType = "SHORT";
      reason = `Ultimate Oscillator overbought (${ultosc.toFixed(1)} > ${sellLevel})`;
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
      metadata: { ultosc, rsi },
    };
  }
  
  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    const lastIndex = candles.length - 1;
    const ultosc = this.ultosc[lastIndex];
    
    if (isNaN(ultosc)) return null;
    
    const signalTypeParam = String(this.parameters.signalType);
    
    let sellLevel = signalTypeParam === "trend" ? 70 : 50;
    let buyLevel = signalTypeParam === "trend" ? 30 : 65;
    
    let shouldExit = false;
    let reason = "";
    
    if (position.direction === "LONG" && ultosc > sellLevel) {
      shouldExit = true;
      reason = `Ultimate Oscillator reached sell level (${ultosc.toFixed(1)})`;
    }
    if (position.direction === "SHORT" && ultosc < buyLevel) {
      shouldExit = true;
      reason = `Ultimate Oscillator reached buy level (${ultosc.toFixed(1)})`;
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

export const ZENBOT_REMAINING_STRATEGIES = [
  ZenbotNeuralStrategy,
  ZenbotMACDStrategy,
  ZenbotTSIStrategy,
  ZenbotTrustDistrustStrategy,
  ZenbotPPOStrategy,
  ZenbotTRIXStrategy,
  ZenbotUltOscStrategy,
];

export {
  ZENBOT_NEURAL_CONFIG,
  ZENBOT_MACD_CONFIG,
  ZENBOT_TSI_CONFIG,
  ZENBOT_TRUST_DISTRUST_CONFIG,
  ZENBOT_PPO_CONFIG,
  ZENBOT_TRIX_CONFIG,
  ZENBOT_ULTOSC_CONFIG,
  calculateTSI,
  calculateUltimateOscillator,
};
