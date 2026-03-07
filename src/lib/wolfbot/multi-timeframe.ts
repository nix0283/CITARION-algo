/**
 * Multi-Timeframe Strategy Engine
 * Ported from WolfBot - Strategy chaining and signal pipeline
 * 
 * Allows strategies on different timeframes to chain signals:
 * Example: 12h trend -> 1h MACD -> 10min RSI for entry
 */

import { Candle, IndicatorResult } from './indicators';

// ============== Types ==============

export type TimeframeInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' | '3d' | '1w';

export interface TimeframeConfig {
  interval: TimeframeInterval;
  strategy: string;
  weight?: number; // Weight in final signal (default: 1)
  required?: boolean; // If true, this timeframe must give signal to proceed
}

export interface SignalPipeline {
  name: string;
  timeframes: TimeframeConfig[];
  aggregation: 'all' | 'majority' | 'weighted' | 'any';
  minConfidence: number; // 0-1
}

export interface StrategySignal {
  type: 'buy' | 'sell' | 'hold';
  confidence: number; // 0-1
  reason?: string;
  metadata?: Record<string, number | string>;
  timestamp: number;
  timeframe: TimeframeInterval;
  strategy: string;
}

export interface MultiTimeframeState {
  signals: Map<string, StrategySignal>;
  candles: Map<TimeframeInterval, Candle[]>;
  lastUpdate: number;
}

export interface TimeframeData {
  interval: TimeframeInterval;
  candles: Candle[];
  currentCandle?: Candle;
}

// ============== Timeframe Utilities ==============

export const TIMEFRAME_MS: Record<TimeframeInterval, number> = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

export function getTimeframeMs(interval: TimeframeInterval): number {
  return TIMEFRAME_MS[interval];
}

export function getCandleTimestamp(time: number, interval: TimeframeInterval): number {
  const ms = TIMEFRAME_MS[interval];
  return Math.floor(time / ms) * ms;
}

// ============== Candle Aggregation ==============

export function aggregateCandles(
  sourceCandles: Candle[],
  sourceInterval: TimeframeInterval,
  targetInterval: TimeframeInterval
): Candle[] {
  if (TIMEFRAME_MS[targetInterval] <= TIMEFRAME_MS[sourceInterval]) {
    return sourceCandles; // Cannot aggregate to smaller timeframe
  }

  const ratio = TIMEFRAME_MS[targetInterval] / TIMEFRAME_MS[sourceInterval];
  const result: Candle[] = [];

  for (let i = 0; i < sourceCandles.length; i += ratio) {
    const slice = sourceCandles.slice(i, i + ratio);
    if (slice.length === 0) continue;

    const aggregated: Candle = {
      time: getCandleTimestamp(slice[0].time, targetInterval),
      open: slice[0].open,
      high: Math.max(...slice.map(c => c.high)),
      low: Math.min(...slice.map(c => c.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((sum, c) => sum + c.volume, 0)
    };

    result.push(aggregated);
  }

  return result;
}

// ============== Base Strategy Class ==============

export abstract class BaseStrategy {
  name: string;
  timeframe: TimeframeInterval;
  
  constructor(name: string, timeframe: TimeframeInterval) {
    this.name = name;
    this.timeframe = timeframe;
  }
  
  abstract evaluate(candles: Candle[]): StrategySignal;
  
  protected createSignal(
    type: 'buy' | 'sell' | 'hold',
    confidence: number,
    reason?: string,
    metadata?: Record<string, number | string>
  ): StrategySignal {
    return {
      type,
      confidence,
      reason,
      metadata,
      timestamp: Date.now(),
      timeframe: this.timeframe,
      strategy: this.name
    };
  }
}

// ============== Built-in Multi-Timeframe Strategies ==============

export class TrendDetectorStrategy extends BaseStrategy {
  constructor(timeframe: TimeframeInterval = '12h') {
    super('TrendDetector', timeframe);
  }
  
  evaluate(candles: Candle[]): StrategySignal {
    if (candles.length < 50) {
      return this.createSignal('hold', 0, 'Insufficient data');
    }
    
    const closes = candles.map(c => c.close);
    const sma20 = this.sma(closes, 20);
    const sma50 = this.sma(closes, 50);
    const currentPrice = closes[closes.length - 1];
    
    if (sma20 === null || sma50 === null) {
      return this.createSignal('hold', 0, 'Cannot calculate SMAs');
    }
    
    const trend = sma20 > sma50 ? 'bullish' : 'bearish';
    const strength = Math.abs(sma20 - sma50) / sma50;
    
    if (currentPrice > sma20 && currentPrice > sma50 && trend === 'bullish') {
      return this.createSignal('buy', Math.min(strength * 10, 1), 'Bullish trend confirmed', { sma20, sma50, strength });
    } else if (currentPrice < sma20 && currentPrice < sma50 && trend === 'bearish') {
      return this.createSignal('sell', Math.min(strength * 10, 1), 'Bearish trend confirmed', { sma20, sma50, strength });
    }
    
    return this.createSignal('hold', 0.3, 'No clear trend', { sma20, sma50 });
  }
  
  private sma(data: number[], period: number): number | null {
    if (data.length < period) return null;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
}

export class MACDConfirmationStrategy extends BaseStrategy {
  constructor(timeframe: TimeframeInterval = '1h') {
    super('MACDConfirmation', timeframe);
  }
  
  evaluate(candles: Candle[]): StrategySignal {
    if (candles.length < 35) {
      return this.createSignal('hold', 0, 'Insufficient data');
    }
    
    const closes = candles.map(c => c.close);
    const macd = this.macd(closes, 12, 26, 9);
    
    if (macd === null) {
      return this.createSignal('hold', 0, 'Cannot calculate MACD');
    }
    
    const { macdLine, signalLine, histogram } = macd;
    
    if (histogram !== null && histogram > 0 && macdLine > signalLine) {
      return this.createSignal('buy', Math.min(Math.abs(histogram) / closes[closes.length - 1] * 1000, 1), 
        'MACD bullish crossover', { macd: macdLine, signal: signalLine, histogram });
    } else if (histogram !== null && histogram < 0 && macdLine < signalLine) {
      return this.createSignal('sell', Math.min(Math.abs(histogram) / closes[closes.length - 1] * 1000, 1), 
        'MACD bearish crossover', { macd: macdLine, signal: signalLine, histogram });
    }
    
    return this.createSignal('hold', 0.3, 'MACD neutral', { macd: macdLine, signal: signalLine });
  }
  
  private ema(data: number[], period: number): number | null {
    if (data.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
  }
  
  private macd(data: number[], fast: number, slow: number, signal: number): { macdLine: number; signalLine: number; histogram: number } | null {
    const fastEma = this.ema(data, fast);
    const slowEma = this.ema(data, slow);
    
    if (fastEma === null || slowEma === null) return null;
    
    const macdLine = fastEma - slowEma;
    
    // Simplified signal calculation
    const signalLine = macdLine * 0.8; // Approximate
    
    return {
      macdLine,
      signalLine,
      histogram: macdLine - signalLine
    };
  }
}

export class RSIEntryStrategy extends BaseStrategy {
  private oversold: number;
  private overbought: number;
  
  constructor(timeframe: TimeframeInterval = '5m', oversold: number = 30, overbought: number = 70) {
    super('RSIEntry', timeframe);
    this.oversold = oversold;
    this.overbought = overbought;
  }
  
  evaluate(candles: Candle[]): StrategySignal {
    if (candles.length < 15) {
      return this.createSignal('hold', 0, 'Insufficient data');
    }
    
    const closes = candles.map(c => c.close);
    const rsi = this.rsi(closes, 14);
    
    if (rsi === null) {
      return this.createSignal('hold', 0, 'Cannot calculate RSI');
    }
    
    if (rsi < this.oversold) {
      return this.createSignal('buy', (this.oversold - rsi) / this.oversold, 
        `RSI oversold at ${rsi.toFixed(1)}`, { rsi });
    } else if (rsi > this.overbought) {
      return this.createSignal('sell', (rsi - this.overbought) / (100 - this.overbought), 
        `RSI overbought at ${rsi.toFixed(1)}`, { rsi });
    }
    
    return this.createSignal('hold', 0.3, `RSI neutral at ${rsi.toFixed(1)}`, { rsi });
  }
  
  private rsi(data: number[], period: number): number | null {
    if (data.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    for (let i = period + 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      avgGain = ((avgGain * (period - 1)) + (change > 0 ? change : 0)) / period;
      avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
    }
    
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }
}

export class BollingerBandsEntryStrategy extends BaseStrategy {
  constructor(timeframe: TimeframeInterval = '15m') {
    super('BBEntry', timeframe);
  }
  
  evaluate(candles: Candle[]): StrategySignal {
    if (candles.length < 20) {
      return this.createSignal('hold', 0, 'Insufficient data');
    }
    
    const closes = candles.map(c => c.close);
    const bb = this.bollingerBands(closes, 20, 2);
    
    if (bb === null) {
      return this.createSignal('hold', 0, 'Cannot calculate BB');
    }
    
    const currentPrice = closes[closes.length - 1];
    const { upper, middle, lower } = bb;
    
    if (currentPrice < lower) {
      return this.createSignal('buy', 0.7, 'Price below lower BB', { upper, middle, lower, price: currentPrice });
    } else if (currentPrice > upper) {
      return this.createSignal('sell', 0.7, 'Price above upper BB', { upper, middle, lower, price: currentPrice });
    }
    
    return this.createSignal('hold', 0.3, 'Price within BB', { upper, middle, lower, price: currentPrice });
  }
  
  private bollingerBands(data: number[], period: number, stdDev: number): { upper: number; middle: number; lower: number } | null {
    if (data.length < period) return null;
    
    const slice = data.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    
    let sumSquares = 0;
    for (const val of slice) {
      sumSquares += Math.pow(val - sma, 2);
    }
    const std = Math.sqrt(sumSquares / period);
    
    return {
      upper: sma + stdDev * std,
      middle: sma,
      lower: sma - stdDev * std
    };
  }
}

// ============== Multi-Timeframe Engine ==============

export class MultiTimeframeEngine {
  private strategies: Map<string, BaseStrategy> = new Map();
  private pipelines: Map<string, SignalPipeline> = new Map();
  private state: MultiTimeframeState;
  
  constructor() {
    this.state = {
      signals: new Map(),
      candles: new Map(),
      lastUpdate: 0
    };
    
    // Register built-in strategies
    this.registerStrategy(new TrendDetectorStrategy());
    this.registerStrategy(new MACDConfirmationStrategy());
    this.registerStrategy(new RSIEntryStrategy());
    this.registerStrategy(new BollingerBandsEntryStrategy());
  }
  
  registerStrategy(strategy: BaseStrategy): void {
    const key = `${strategy.name}:${strategy.timeframe}`;
    this.strategies.set(key, strategy);
  }
  
  createPipeline(config: SignalPipeline): void {
    this.pipelines.set(config.name, config);
  }
  
  updateCandles(interval: TimeframeInterval, candles: Candle[]): void {
    this.state.candles.set(interval, candles);
    this.state.lastUpdate = Date.now();
  }
  
  evaluateTimeframe(tfConfig: TimeframeConfig): StrategySignal | null {
    const candles = this.state.candles.get(tfConfig.interval);
    if (!candles || candles.length === 0) return null;
    
    const key = `${tfConfig.strategy}:${tfConfig.interval}`;
    const strategy = this.strategies.get(key);
    
    if (!strategy) {
      console.warn(`Strategy not found: ${key}`);
      return null;
    }
    
    const signal = strategy.evaluate(candles);
    this.state.signals.set(key, signal);
    
    return signal;
  }
  
  runPipeline(name: string): StrategySignal | null {
    const pipeline = this.pipelines.get(name);
    if (!pipeline) return null;
    
    const signals: StrategySignal[] = [];
    
    // Evaluate each timeframe
    for (const tf of pipeline.timeframes) {
      const signal = this.evaluateTimeframe(tf);
      if (signal) {
        signals.push(signal);
      } else if (tf.required) {
        // Required timeframe didn't produce signal
        return {
          type: 'hold',
          confidence: 0,
          reason: `Required timeframe ${tf.interval} did not produce signal`,
          timestamp: Date.now(),
          timeframe: tf.interval,
          strategy: 'Pipeline'
        };
      }
    }
    
    // Aggregate signals
    return this.aggregateSignals(signals, pipeline);
  }
  
  private aggregateSignals(signals: StrategySignal[], pipeline: SignalPipeline): StrategySignal {
    if (signals.length === 0) {
      return {
        type: 'hold',
        confidence: 0,
        reason: 'No signals to aggregate',
        timestamp: Date.now(),
        timeframe: '1h',
        strategy: 'Pipeline'
      };
    }
    
    const buySignals = signals.filter(s => s.type === 'buy');
    const sellSignals = signals.filter(s => s.type === 'sell');
    
    let finalType: 'buy' | 'sell' | 'hold' = 'hold';
    let finalConfidence = 0;
    let reason = '';
    
    switch (pipeline.aggregation) {
      case 'all':
        // All must agree
        if (buySignals.length === signals.length) {
          finalType = 'buy';
          finalConfidence = buySignals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
          reason = 'All timeframes bullish';
        } else if (sellSignals.length === signals.length) {
          finalType = 'sell';
          finalConfidence = sellSignals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
          reason = 'All timeframes bearish';
        }
        break;
        
      case 'majority':
        // Majority wins
        if (buySignals.length > sellSignals.length && buySignals.length > signals.length / 2) {
          finalType = 'buy';
          finalConfidence = buySignals.reduce((sum, s) => sum + s.confidence, 0) / buySignals.length;
          reason = `Majority bullish (${buySignals.length}/${signals.length})`;
        } else if (sellSignals.length > buySignals.length && sellSignals.length > signals.length / 2) {
          finalType = 'sell';
          finalConfidence = sellSignals.reduce((sum, s) => sum + s.confidence, 0) / sellSignals.length;
          reason = `Majority bearish (${sellSignals.length}/${signals.length})`;
        }
        break;
        
      case 'weighted':
        // Weight by timeframe config weights
        const weights = pipeline.timeframes.map(tf => tf.weight || 1);
        let buyScore = 0;
        let sellScore = 0;
        let totalWeight = 0;
        
        signals.forEach((signal, i) => {
          const weight = weights[i] || 1;
          totalWeight += weight;
          
          if (signal.type === 'buy') {
            buyScore += signal.confidence * weight;
          } else if (signal.type === 'sell') {
            sellScore += signal.confidence * weight;
          }
        });
        
        if (buyScore > sellScore && buyScore > totalWeight * pipeline.minConfidence) {
          finalType = 'buy';
          finalConfidence = buyScore / totalWeight;
          reason = 'Weighted analysis bullish';
        } else if (sellScore > buyScore && sellScore > totalWeight * pipeline.minConfidence) {
          finalType = 'sell';
          finalConfidence = sellScore / totalWeight;
          reason = 'Weighted analysis bearish';
        }
        break;
        
      case 'any':
        // Any strong signal
        const strongBuy = buySignals.find(s => s.confidence >= pipeline.minConfidence);
        const strongSell = sellSignals.find(s => s.confidence >= pipeline.minConfidence);
        
        if (strongBuy) {
          finalType = 'buy';
          finalConfidence = strongBuy.confidence;
          reason = `Strong buy signal from ${strongBuy.strategy} on ${strongBuy.timeframe}`;
        } else if (strongSell) {
          finalType = 'sell';
          finalConfidence = strongSell.confidence;
          reason = `Strong sell signal from ${strongSell.strategy} on ${strongSell.timeframe}`;
        }
        break;
    }
    
    return {
      type: finalType,
      confidence: finalConfidence,
      reason,
      timestamp: Date.now(),
      timeframe: '1h',
      strategy: `Pipeline:${pipeline.name}`,
      metadata: {
        buyCount: buySignals.length,
        sellCount: sellSignals.length,
        totalSignals: signals.length
      }
    };
  }
  
  // Get signal history for a specific strategy/timeframe
  getSignal(strategy: string, timeframe: TimeframeInterval): StrategySignal | undefined {
    return this.state.signals.get(`${strategy}:${timeframe}`);
  }
  
  // Get all current signals
  getAllSignals(): StrategySignal[] {
    return Array.from(this.state.signals.values());
  }
}

// ============== Pre-built Pipelines ==============

export const PREBUILT_PIPELINES: SignalPipeline[] = [
  {
    name: 'TrendFollowing',
    timeframes: [
      { interval: '12h', strategy: 'TrendDetector', required: true },
      { interval: '1h', strategy: 'MACDConfirmation', required: true },
      { interval: '5m', strategy: 'RSIEntry', required: false }
    ],
    aggregation: 'all',
    minConfidence: 0.5
  },
  {
    name: 'Scalping',
    timeframes: [
      { interval: '15m', strategy: 'BBEntry', required: true },
      { interval: '5m', strategy: 'RSIEntry', required: true }
    ],
    aggregation: 'all',
    minConfidence: 0.6
  },
  {
    name: 'SwingTrading',
    timeframes: [
      { interval: '1d', strategy: 'TrendDetector', required: true, weight: 2 },
      { interval: '4h', strategy: 'MACDConfirmation', required: true, weight: 1.5 },
      { interval: '1h', strategy: 'BBEntry', required: false, weight: 1 }
    ],
    aggregation: 'weighted',
    minConfidence: 0.5
  },
  {
    name: 'MomentumCatch',
    timeframes: [
      { interval: '4h', strategy: 'TrendDetector', required: false },
      { interval: '1h', strategy: 'MACDConfirmation', required: true }
    ],
    aggregation: 'any',
    minConfidence: 0.7
  }
];

// ============== Export ==============

export default MultiTimeframeEngine;
