/**
 * Alpha Factors Module
 * 
 * Портировано и адаптировано из Abu (https://github.com/bbfamily/abu)
 * 
 * Alpha факторы - количественные меры для предсказания движения цен.
 * Каждый фактор генерирует сигнал от -1 (сильный sell) до 1 (сильный buy).
 * 
 * Категории факторов:
 * - Trend: Следование за трендом
 * - Mean Reversion: Возврат к среднему
 * - Momentum: Импульс
 * - Volatility: Волатильность
 * - Volume: Объём
 * 
 * @author CITARION (ported from Abu)
 * @version 1.0.0
 */

import { Candle } from "./types";
import { EMA, SMA, RSI, MACD, ATR, BollingerBands } from "./indicators";

// ==================== TYPES ====================

/**
 * Результат расчёта альфа-фактора
 */
export interface AlphaFactorResult {
  name: string;
  category: string;
  value: number;          // -1 to 1
  confidence: number;     // 0 to 1
  signal: "buy" | "sell" | "neutral";
  metadata?: Record<string, unknown>;
}

/**
 * Комбинированный сигнал
 */
export interface CombinedAlphaSignal {
  overallValue: number;
  overallSignal: "buy" | "sell" | "neutral";
  confidence: number;
  factors: AlphaFactorResult[];
  weights: Record<string, number>;
  timestamp: Date;
}

/**
 * Конфигурация Alpha Factors
 */
export interface AlphaFactorsConfig {
  enabledFactors: string[];
  weights: Record<string, number>;
  combineMethod: "weighted_average" | "majority" | "unanimous" | "custom";
  neutralThreshold: number;
  minConfidence: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Z-score нормализация
 */
function zScore(data: number[]): number[] {
  if (data.length === 0) return [];
  
  const validData = data.filter(v => !isNaN(v));
  if (validData.length === 0) return data.map(() => 0);
  
  const mean = validData.reduce((a, b) => a + b, 0) / validData.length;
  const variance = validData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / validData.length;
  const std = Math.sqrt(variance);
  
  if (std === 0) return data.map(() => 0);
  
  return data.map(v => (isNaN(v) ? 0 : (v - mean) / std));
}

/**
 * Rank нормализация (percentile)
 */
function rank(data: number[]): number[] {
  if (data.length === 0) return [];
  
  const sorted = [...data].filter(v => !isNaN(v)).sort((a, b) => a - b);
  
  return data.map(v => {
    if (isNaN(v)) return 0;
    const rank = sorted.findIndex(s => s >= v);
    return rank / sorted.length * 2 - 1; // -1 to 1
  });
}

/**
 * Сигмоидная нормализация к [-1, 1]
 */
function sigmoidNormalize(value: number, center: number = 0, scale: number = 1): number {
  const x = (value - center) / scale;
  return 2 / (1 + Math.exp(-x)) - 1;
}

// ==================== TREND FACTORS ====================

/**
 * Alpha 1: Price vs EMA
 * Цена относительно EMA - трендовый фактор
 */
function alphaPriceVsEMA(candles: Candle[], period: number = 20): AlphaFactorResult {
  const closes = candles.map(c => c.close);
  const ema = EMA(closes, period);
  
  const lastIndex = candles.length - 1;
  const price = closes[lastIndex];
  const emaValue = ema[lastIndex];
  
  if (isNaN(emaValue)) {
    return {
      name: "price_vs_ema",
      category: "trend",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  const distance = (price - emaValue) / emaValue;
  const value = sigmoidNormalize(distance, 0, 0.05);
  
  return {
    name: "price_vs_ema",
    category: "trend",
    value,
    confidence: Math.min(1, Math.abs(distance) * 10),
    signal: value > 0.2 ? "buy" : value < -0.2 ? "sell" : "neutral",
    metadata: { price, ema: emaValue, distance: distance * 100 },
  };
}

/**
 * Alpha 2: EMA Crossover
 * Пересечение короткой и длинной EMA
 */
function alphaEMACrossover(candles: Candle[], shortPeriod: number = 10, longPeriod: number = 30): AlphaFactorResult {
  const closes = candles.map(c => c.close);
  const shortEMA = EMA(closes, shortPeriod);
  const longEMA = EMA(closes, longPeriod);
  
  const lastIndex = candles.length - 1;
  const short = shortEMA[lastIndex];
  const long = longEMA[lastIndex];
  const shortPrev = shortEMA[lastIndex - 1];
  const longPrev = longEMA[lastIndex - 1];
  
  if (isNaN(short) || isNaN(long)) {
    return {
      name: "ema_crossover",
      category: "trend",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  const trend = (short - long) / long;
  const crossover = (short - long) * (shortPrev - longPrev) < 0;
  
  let value = sigmoidNormalize(trend, 0, 0.03);
  
  // Усиливаем сигнал при пересечении
  if (crossover) {
    value *= 1.5;
  }
  
  return {
    name: "ema_crossover",
    category: "trend",
    value: Math.max(-1, Math.min(1, value)),
    confidence: crossover ? 0.9 : 0.6,
    signal: value > 0.3 ? "buy" : value < -0.3 ? "sell" : "neutral",
    metadata: { short, long, crossover },
  };
}

/**
 * Alpha 3: MACD Signal
 * Сигнал MACD
 */
function alphaMACDSignal(candles: Candle[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): AlphaFactorResult {
  const closes = candles.map(c => c.close);
  const macd = MACD(closes, fastPeriod, slowPeriod, signalPeriod);
  
  const lastIndex = candles.length - 1;
  const macdValue = macd.macd[lastIndex];
  const signalValue = macd.signal[lastIndex];
  const histogram = macd.histogram[lastIndex];
  
  if (isNaN(macdValue) || isNaN(signalValue)) {
    return {
      name: "macd_signal",
      category: "trend",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  const value = sigmoidNormalize(histogram, 0, 0.01);
  
  return {
    name: "macd_signal",
    category: "trend",
    value,
    confidence: Math.min(1, Math.abs(histogram) * 100 + 0.3),
    signal: value > 0.2 ? "buy" : value < -0.2 ? "sell" : "neutral",
    metadata: { macd: macdValue, signal: signalValue, histogram },
  };
}

// ==================== MEAN REVERSION FACTORS ====================

/**
 * Alpha 4: RSI Mean Reversion
 * RSI для возврата к среднему
 */
function alphaRSIMeanReversion(candles: Candle[], period: number = 14): AlphaFactorResult {
  const closes = candles.map(c => c.close);
  const rsi = RSI(closes, period);
  
  const lastIndex = candles.length - 1;
  const rsiValue = rsi[lastIndex];
  
  if (isNaN(rsiValue)) {
    return {
      name: "rsi_mean_reversion",
      category: "mean_reversion",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  // Mean reversion: покупать на перепроданности, продавать на перекупленности
  const value = sigmoidNormalize(50 - rsiValue, 0, 30);
  
  return {
    name: "rsi_mean_reversion",
    category: "mean_reversion",
    value,
    confidence: Math.abs(rsiValue - 50) / 50,
    signal: rsiValue < 30 ? "buy" : rsiValue > 70 ? "sell" : "neutral",
    metadata: { rsi: rsiValue },
  };
}

/**
 * Alpha 5: Bollinger Position
 * Позиция цены в Bollinger Bands
 */
function alphaBollingerPosition(candles: Candle[], period: number = 20, stdDev: number = 2): AlphaFactorResult {
  const closes = candles.map(c => c.close);
  const bb = BollingerBands(closes, period, stdDev);
  
  const lastIndex = candles.length - 1;
  const price = closes[lastIndex];
  const upper = bb.upper[lastIndex];
  const lower = bb.lower[lastIndex];
  const middle = bb.middle[lastIndex];
  
  if (isNaN(upper) || isNaN(lower)) {
    return {
      name: "bollinger_position",
      category: "mean_reversion",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  // %B: позиция цены в полосах (0 = нижняя, 1 = верхняя)
  const percentB = (price - lower) / (upper - lower);
  
  // Mean reversion: покупать у нижней, продавать у верхней
  const value = sigmoidNormalize(0.5 - percentB, 0, 0.4);
  
  return {
    name: "bollinger_position",
    category: "mean_reversion",
    value,
    confidence: Math.abs(percentB - 0.5) * 2,
    signal: percentB < 0.2 ? "buy" : percentB > 0.8 ? "sell" : "neutral",
    metadata: { percentB, upper, lower, middle },
  };
}

/**
 * Alpha 6: Price vs VWAP
 * Цена относительно VWAP
 */
function alphaPriceVsVWAP(candles: Candle[]): AlphaFactorResult {
  const lastIndex = candles.length - 1;
  const price = candles[lastIndex].close;
  
  // Рассчитываем VWAP
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const tp = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += tp * candle.volume;
    cumulativeVolume += candle.volume;
  }
  
  const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : price;
  
  const distance = (price - vwap) / vwap;
  const value = sigmoidNormalize(distance, 0, 0.03);
  
  return {
    name: "price_vs_vwap",
    category: "mean_reversion",
    value,
    confidence: Math.min(1, Math.abs(distance) * 20),
    signal: value < -0.3 ? "buy" : value > 0.3 ? "sell" : "neutral",
    metadata: { price, vwap, distance: distance * 100 },
  };
}

// ==================== MOMENTUM FACTORS ====================

/**
 * Alpha 7: Rate of Change (ROC)
 * Скорость изменения цены
 */
function alphaROC(candles: Candle[], period: number = 14): AlphaFactorResult {
  const closes = candles.map(c => c.close);
  
  const lastIndex = candles.length - 1;
  if (lastIndex < period) {
    return {
      name: "roc",
      category: "momentum",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  const currentPrice = closes[lastIndex];
  const pastPrice = closes[lastIndex - period];
  
  const roc = ((currentPrice - pastPrice) / pastPrice) * 100;
  const value = sigmoidNormalize(roc, 0, 10);
  
  return {
    name: "roc",
    category: "momentum",
    value,
    confidence: Math.min(1, Math.abs(roc) / 10),
    signal: value > 0.3 ? "buy" : value < -0.3 ? "sell" : "neutral",
    metadata: { roc },
  };
}

/**
 * Alpha 8: Momentum Score
 * Комбинированный momentum фактор
 */
function alphaMomentumScore(candles: Candle[], lookback: number = 20): AlphaFactorResult {
  const closes = candles.map(c => c.close);
  const lastIndex = candles.length - 1;
  
  if (lastIndex < lookback) {
    return {
      name: "momentum_score",
      category: "momentum",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  // Рассчитываем returns
  const returns: number[] = [];
  for (let i = 1; i <= lookback; i++) {
    const ret = (closes[lastIndex] - closes[lastIndex - i]) / closes[lastIndex - i];
    returns.push(ret);
  }
  
  // Взвешиваем по времени (более недавние - больше вес)
  let weightedReturn = 0;
  let totalWeight = 0;
  
  for (let i = 0; i < returns.length; i++) {
    const weight = (i + 1) / returns.length;
    weightedReturn += returns[i] * weight;
    totalWeight += weight;
  }
  
  weightedReturn /= totalWeight;
  const value = sigmoidNormalize(weightedReturn, 0, 0.05);
  
  return {
    name: "momentum_score",
    category: "momentum",
    value,
    confidence: Math.min(1, Math.abs(weightedReturn) * 10),
    signal: value > 0.2 ? "buy" : value < -0.2 ? "sell" : "neutral",
    metadata: { weightedReturn: weightedReturn * 100 },
  };
}

// ==================== VOLATILITY FACTORS ====================

/**
 * Alpha 9: ATR Ratio
 * Отношение текущего ATR к историческому
 */
function alphaATRRatio(candles: Candle[], period: number = 14): AlphaFactorResult {
  const atr = ATR(candles, period);
  const closes = candles.map(c => c.close);
  
  const lastIndex = candles.length - 1;
  const currentATR = atr[lastIndex];
  
  if (isNaN(currentATR)) {
    return {
      name: "atr_ratio",
      category: "volatility",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  // Средний ATR за 100 периодов
  const atrHistory = atr.slice(-100).filter(v => !isNaN(v));
  const avgATR = atrHistory.length > 0 
    ? atrHistory.reduce((a, b) => a + b, 0) / atrHistory.length 
    : currentATR;
  
  const ratio = currentATR / avgATR;
  
  // Низкая волатильность = потенциальный breakout (buy)
  // Высокая волатильность = потенциальная консолидация (neutral/sell)
  const value = sigmoidNormalize(1 - ratio, 0, 0.5);
  
  return {
    name: "atr_ratio",
    category: "volatility",
    value,
    confidence: Math.min(1, Math.abs(ratio - 1)),
    signal: "neutral", // Volatility factor mostly informational
    metadata: { currentATR, avgATR, ratio },
  };
}

/**
 * Alpha 10: Volatility Trend
 * Тренд волатильности
 */
function alphaVolatilityTrend(candles: Candle[], period: number = 20): AlphaFactorResult {
  const closes = candles.map(c => c.close);
  
  // Рассчитываем rolling volatility
  const volatilities: number[] = [];
  
  for (let i = period; i < closes.length; i++) {
    const slice = closes.slice(i - period, i);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    volatilities.push(Math.sqrt(variance));
  }
  
  if (volatilities.length < 2) {
    return {
      name: "volatility_trend",
      category: "volatility",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  // Тренд волатильности
  const recent = volatilities.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const older = volatilities.slice(-20, -5).reduce((a, b) => a + b, 0) / 15;
  
  const trend = (recent - older) / older;
  const value = sigmoidNormalize(trend, 0, 0.3);
  
  return {
    name: "volatility_trend",
    category: "volatility",
    value,
    confidence: Math.min(1, Math.abs(trend) * 3),
    signal: "neutral",
    metadata: { trend: trend * 100 },
  };
}

// ==================== VOLUME FACTORS ====================

/**
 * Alpha 11: Volume Trend
 * Тренд объёма
 */
function alphaVolumeTrend(candles: Candle[], period: number = 20): AlphaFactorResult {
  const volumes = candles.map(c => c.volume);
  const closes = candles.map(c => c.close);
  
  if (candles.length < period) {
    return {
      name: "volume_trend",
      category: "volume",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  // Средний объём за последние периоды
  const recentVolume = volumes.slice(-period).reduce((a, b) => a + b, 0) / period;
  const olderVolume = volumes.slice(-period * 2, -period).reduce((a, b) => a + b, 0) / period;
  
  // Объём растёт при росте цены = бычий сигнал
  const priceChange = (closes[closes.length - 1] - closes[closes.length - period]) / closes[closes.length - period];
  const volumeChange = (recentVolume - olderVolume) / olderVolume;
  
  let value = 0;
  
  if (priceChange > 0 && volumeChange > 0) {
    // Bullish confirmation
    value = Math.min(1, volumeChange);
  } else if (priceChange < 0 && volumeChange > 0) {
    // Bearish confirmation
    value = Math.max(-1, -volumeChange);
  } else if (priceChange > 0 && volumeChange < 0) {
    // Weak bullish (divergence)
    value = 0.3 * Math.sign(priceChange);
  } else {
    value = -0.3 * Math.sign(priceChange);
  }
  
  return {
    name: "volume_trend",
    category: "volume",
    value,
    confidence: Math.min(1, Math.abs(volumeChange)),
    signal: value > 0.3 ? "buy" : value < -0.3 ? "sell" : "neutral",
    metadata: { volumeChange: volumeChange * 100, priceChange: priceChange * 100 },
  };
}

/**
 * Alpha 12: OBV Trend
 * Тренд On-Balance Volume
 */
function alphaOBVTrend(candles: Candle[], period: number = 20): AlphaFactorResult {
  // Рассчитываем OBV
  const obv: number[] = [0];
  
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const currentClose = candles[i].close;
    
    if (currentClose > prevClose) {
      obv.push(obv[i - 1] + candles[i].volume);
    } else if (currentClose < prevClose) {
      obv.push(obv[i - 1] - candles[i].volume);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  
  if (obv.length < period) {
    return {
      name: "obv_trend",
      category: "volume",
      value: 0,
      confidence: 0,
      signal: "neutral",
    };
  }
  
  // Тренд OBV
  const recentOBV = obv.slice(-period);
  const slope = (recentOBV[recentOBV.length - 1] - recentOBV[0]) / period;
  const avgOBV = recentOBV.reduce((a, b) => a + b, 0) / period;
  
  const normalizedSlope = avgOBV !== 0 ? slope / Math.abs(avgOBV) : 0;
  const value = sigmoidNormalize(normalizedSlope, 0, 0.01);
  
  return {
    name: "obv_trend",
    category: "volume",
    value,
    confidence: Math.min(1, Math.abs(normalizedSlope) * 100),
    signal: value > 0.2 ? "buy" : value < -0.2 ? "sell" : "neutral",
    metadata: { obvSlope: normalizedSlope },
  };
}

// ==================== ALPHA FACTORS ENGINE ====================

/**
 * Движок Alpha Factors
 */
export class AlphaFactorsEngine {
  private config: AlphaFactorsConfig;
  private factors: Map<string, (candles: Candle[]) => AlphaFactorResult> = new Map();
  
  constructor(config?: Partial<AlphaFactorsConfig>) {
    this.config = {
      enabledFactors: [
        "price_vs_ema", "ema_crossover", "macd_signal",
        "rsi_mean_reversion", "bollinger_position", "price_vs_vwap",
        "roc", "momentum_score",
        "atr_ratio", "volatility_trend",
        "volume_trend", "obv_trend",
      ],
      weights: {
        price_vs_ema: 1.0,
        ema_crossover: 1.2,
        macd_signal: 1.0,
        rsi_mean_reversion: 0.8,
        bollinger_position: 0.9,
        price_vs_vwap: 1.0,
        roc: 0.7,
        momentum_score: 0.9,
        atr_ratio: 0.5,
        volatility_trend: 0.4,
        volume_trend: 0.8,
        obv_trend: 0.7,
      },
      combineMethod: "weighted_average",
      neutralThreshold: 0.2,
      minConfidence: 0.3,
      ...config,
    };
    
    // Регистрируем факторы
    this.registerDefaultFactors();
  }
  
  /**
   * Регистрируем стандартные факторы
   */
  private registerDefaultFactors(): void {
    this.factors.set("price_vs_ema", (c) => alphaPriceVsEMA(c));
    this.factors.set("ema_crossover", (c) => alphaEMACrossover(c));
    this.factors.set("macd_signal", (c) => alphaMACDSignal(c));
    this.factors.set("rsi_mean_reversion", (c) => alphaRSIMeanReversion(c));
    this.factors.set("bollinger_position", (c) => alphaBollingerPosition(c));
    this.factors.set("price_vs_vwap", (c) => alphaPriceVsVWAP(c));
    this.factors.set("roc", (c) => alphaROC(c));
    this.factors.set("momentum_score", (c) => alphaMomentumScore(c));
    this.factors.set("atr_ratio", (c) => alphaATRRatio(c));
    this.factors.set("volatility_trend", (c) => alphaVolatilityTrend(c));
    this.factors.set("volume_trend", (c) => alphaVolumeTrend(c));
    this.factors.set("obv_trend", (c) => alphaOBVTrend(c));
  }
  
  /**
   * Рассчитать все факторы
   */
  calculateFactors(candles: Candle[]): AlphaFactorResult[] {
    const results: AlphaFactorResult[] = [];
    
    for (const factorName of this.config.enabledFactors) {
      const calculator = this.factors.get(factorName);
      if (calculator) {
        try {
          const result = calculator(candles);
          results.push(result);
        } catch (error) {
          console.error(`Error calculating factor ${factorName}:`, error);
        }
      }
    }
    
    return results;
  }
  
  /**
   * Комбинировать сигналы факторов
   */
  combineSignals(factors: AlphaFactorResult[]): CombinedAlphaSignal {
    let overallValue = 0;
    let totalWeight = 0;
    let buyCount = 0;
    let sellCount = 0;
    
    const weights: Record<string, number> = {};
    
    for (const factor of factors) {
      const weight = this.config.weights[factor.name] || 1;
      weights[factor.name] = weight;
      
      if (factor.confidence >= this.config.minConfidence) {
        overallValue += factor.value * weight * factor.confidence;
        totalWeight += weight * factor.confidence;
        
        if (factor.signal === "buy") buyCount++;
        if (factor.signal === "sell") sellCount++;
      }
    }
    
    if (totalWeight > 0) {
      overallValue /= totalWeight;
    }
    
    let overallSignal: "buy" | "sell" | "neutral" = "neutral";
    
    switch (this.config.combineMethod) {
      case "weighted_average":
        overallSignal = overallValue > this.config.neutralThreshold 
          ? "buy" 
          : overallValue < -this.config.neutralThreshold 
            ? "sell" 
            : "neutral";
        break;
        
      case "majority":
        overallSignal = buyCount > sellCount 
          ? "buy" 
          : sellCount > buyCount 
            ? "sell" 
            : "neutral";
        break;
        
      case "unanimous":
        if (buyCount > 0 && sellCount === 0) overallSignal = "buy";
        else if (sellCount > 0 && buyCount === 0) overallSignal = "sell";
        break;
    }
    
    const confidence = totalWeight / this.config.enabledFactors.length;
    
    return {
      overallValue,
      overallSignal,
      confidence,
      factors,
      weights,
      timestamp: new Date(),
    };
  }
  
  /**
   * Полный расчёт сигнала
   */
  getSignal(candles: Candle[]): CombinedAlphaSignal {
    const factors = this.calculateFactors(candles);
    return this.combineSignals(factors);
  }
  
  /**
   * Зарегистрировать кастомный фактор
   */
  registerFactor(name: string, calculator: (candles: Candle[]) => AlphaFactorResult): void {
    this.factors.set(name, calculator);
  }
}

// ==================== EXPORT ====================

export {
  alphaPriceVsEMA,
  alphaEMACrossover,
  alphaMACDSignal,
  alphaRSIMeanReversion,
  alphaBollingerPosition,
  alphaPriceVsVWAP,
  alphaROC,
  alphaMomentumScore,
  alphaATRRatio,
  alphaVolatilityTrend,
  alphaVolumeTrend,
  alphaOBVTrend,
};

export function createAlphaFactorsEngine(config?: Partial<AlphaFactorsConfig>): AlphaFactorsEngine {
  return new AlphaFactorsEngine(config);
}
