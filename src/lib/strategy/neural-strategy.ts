/**
 * Neural Strategy - AI-Powered Price Prediction
 * 
 * Портировано и адаптировано из Zenbot (https://github.com/DeviaVir/zenbot)
 * Интеграция с z-ai-web-dev-sdk для предсказания цен
 * 
 * Компоненты:
 * - Feature Engineering: нормализация и подготовка данных
 * - Prediction Model: использование LLM для прогноза
 * - Signal Generation: конвертация прогноза в торговый сигнал
 * 
 * @author CITARION (ported from Zenbot + enhanced with z-ai-sdk)
 * @version 1.0.0
 */

import { Candle, IndicatorResult, StrategySignal, StrategyConfig, BaseStrategy, SignalType } from "./types";
import { RSI, EMA, SMA } from "./indicators";
import { PREDEFINED_TACTICS_SETS } from "./tactics/types";

// ==================== TYPES ====================

export interface NeuralPrediction {
  direction: "up" | "down" | "neutral";
  confidence: number;
  predictedPrice?: number;
  priceChangePercent?: number;
  reasoning?: string;
}

export interface NeuralFeatures {
  // Price features
  closeNorm: number[];
  returnsNorm: number[];
  volatilityNorm: number[];
  
  // Trend features
  emaTrend: number[];
  smaTrend: number[];
  
  // Momentum features
  rsiNorm: number[];
  momentumNorm: number[];
  
  // Volume features
  volumeNorm: number[];
  volumeChangeNorm: number[];
}

export interface NeuralConfig {
  lookbackPeriod: number;
  predictionHorizon: number;
  minConfidence: number;
  useAI: boolean;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Min-Max нормализация
 */
function normalize(data: number[]): number[] {
  if (data.length === 0) return [];
  
  const validData = data.filter(v => !isNaN(v));
  if (validData.length === 0) return data.map(() => 0);
  
  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min;
  
  if (range === 0) return data.map(() => 0.5);
  
  return data.map(v => {
    if (isNaN(v)) return 0.5;
    return (v - min) / range;
  });
}

/**
 * Z-score нормализация
 */
function zScoreNormalize(data: number[]): number[] {
  if (data.length === 0) return [];
  
  const validData = data.filter(v => !isNaN(v));
  if (validData.length === 0) return data.map(() => 0);
  
  const mean = validData.reduce((a, b) => a + b, 0) / validData.length;
  const variance = validData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / validData.length;
  const std = Math.sqrt(variance);
  
  if (std === 0) return data.map(() => 0);
  
  return data.map(v => {
    if (isNaN(v)) return 0;
    return (v - mean) / std;
  });
}

/**
 * Рассчитать returns (процентное изменение)
 */
function calculateReturns(data: number[]): number[] {
  const result: number[] = [0];
  
  for (let i = 1; i < data.length; i++) {
    if (isNaN(data[i]) || isNaN(data[i - 1]) || data[i - 1] === 0) {
      result.push(0);
    } else {
      result.push((data[i] - data[i - 1]) / data[i - 1]);
    }
  }
  
  return result;
}

/**
 * Рассчитать волатильность (rolling std)
 */
function calculateVolatility(returns: number[], period: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < returns.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    
    const slice = returns.slice(i - period + 1, i + 1).filter(v => !isNaN(v));
    if (slice.length === 0) {
      result.push(NaN);
      continue;
    }
    
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / slice.length;
    result.push(Math.sqrt(variance));
  }
  
  return result;
}

/**
 * Рассчитать momentum
 */
function calculateMomentum(data: number[], period: number): number[] {
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

// ==================== FEATURE ENGINEERING ====================

/**
 * Подготовка признаков для модели
 */
function prepareFeatures(candles: Candle[], lookback: number): NeuralFeatures {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  // Price features
  const closeNorm = normalize(closes);
  const returns = calculateReturns(closes);
  const returnsNorm = zScoreNormalize(returns);
  const volatility = calculateVolatility(returns, lookback);
  const volatilityNorm = normalize(volatility);
  
  // Trend features
  const ema20 = EMA(closes, 20);
  const ema50 = EMA(closes, 50);
  const sma20 = SMA(closes, 20);
  
  const emaTrend = ema20.map((e, i) => {
    if (isNaN(e) || isNaN(ema50[i])) return 0;
    return e > ema50[i] ? 1 : -1;
  });
  
  const smaTrend = closes.map((c, i) => {
    if (isNaN(sma20[i])) return 0;
    return c > sma20[i] ? 1 : -1;
  });
  
  // Momentum features
  const rsi = RSI(closes, 14);
  const rsiNorm = rsi.map(v => isNaN(v) ? 0.5 : v / 100);
  const momentum = calculateMomentum(closes, 10);
  const momentumNorm = zScoreNormalize(momentum);
  
  // Volume features
  const volumeNorm = normalize(volumes);
  const volumeChange = calculateReturns(volumes);
  const volumeChangeNorm = zScoreNormalize(volumeChange);
  
  return {
    closeNorm,
    returnsNorm,
    volatilityNorm,
    emaTrend,
    smaTrend,
    rsiNorm,
    momentumNorm,
    volumeNorm,
    volumeChangeNorm,
  };
}

/**
 * Создать контекст для AI модели
 */
function createAIContext(candles: Candle[], features: NeuralFeatures): string {
  const lastIndex = candles.length - 1;
  const lookback = Math.min(20, candles.length);
  
  // Recent price action
  const recentCloses = candles.slice(-lookback).map(c => c.close);
  const recentReturns = recentCloses.slice(1).map((c, i) => 
    ((c - recentCloses[i]) / recentCloses[i] * 100).toFixed(2)
  );
  
  // Current indicators
  const rsiValues = features.rsiNorm.slice(-1)[0] * 100;
  const currentTrend = features.emaTrend[lastIndex];
  const currentMomentum = features.momentumNorm[lastIndex];
  
  // Volatility
  const recentHigh = Math.max(...candles.slice(-lookback).map(c => c.high));
  const recentLow = Math.min(...candles.slice(-lookback).map(c => c.low));
  const priceRange = ((recentHigh - recentLow) / candles[lastIndex].close * 100).toFixed(2);
  
  return `
Trading Analysis Context:
- Current Price: ${candles[lastIndex].close.toFixed(2)}
- Recent Returns (last ${lookback-1} periods): ${recentReturns.join(', ')}%
- RSI: ${rsiValues.toFixed(1)}
- Trend: ${currentTrend > 0 ? 'Bullish' : 'Bearish'} (EMA crossover)
- Momentum Z-Score: ${currentMomentum.toFixed(2)}
- Price Range: ${priceRange}%
- Volume Trend: ${features.volumeChangeNorm[lastIndex] > 0 ? 'Increasing' : 'Decreasing'}

Based on this data, predict the price direction for the next candle.
Respond with JSON format: {"direction": "up/down/neutral", "confidence": 0-100, "priceChangePercent": -5 to 5, "reasoning": "brief explanation"}
`;
}

// ==================== AI PREDICTION ====================

/**
 * Получить предсказание от AI модели
 */
async function getAIPrediction(context: string): Promise<NeuralPrediction> {
  try {
    // Динамический импорт z-ai-web-dev-sdk (только на сервере)
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a financial trading AI assistant. Analyze the provided market data and predict price direction.
Always respond with valid JSON only, no markdown or additional text.
Your prediction should be based on technical analysis principles.
Be conservative - only predict strong moves when indicators clearly align.`
        },
        {
          role: 'user',
          content: context
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    
    const responseText = completion.choices[0]?.message?.content || '';
    
    // Парсим JSON из ответа
    try {
      const parsed = JSON.parse(responseText);
      return {
        direction: parsed.direction || 'neutral',
        confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
        priceChangePercent: parsed.priceChangePercent,
        reasoning: parsed.reasoning,
      };
    } catch {
      // Если не удалось распарсить JSON, пытаемся извлечь из текста
      const directionMatch = responseText.match(/"direction"\s*:\s*"(up|down|neutral)"/i);
      const confidenceMatch = responseText.match(/"confidence"\s*:\s*(\d+)/i);
      
      return {
        direction: (directionMatch?.[1] as NeuralPrediction['direction']) || 'neutral',
        confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 50,
        reasoning: 'Parsed from AI response',
      };
    }
  } catch (error) {
    console.error('AI prediction error:', error);
    return {
      direction: 'neutral',
      confidence: 0,
      reasoning: 'AI prediction failed',
    };
  }
}

/**
 * Простой статистический прогноз (fallback без AI)
 */
function getStatisticalPrediction(candles: Candle[], features: NeuralFeatures): NeuralPrediction {
  const lastIndex = candles.length - 1;
  const lookback = Math.min(20, candles.length);
  
  // Trend analysis
  const recentCloses = candles.slice(-lookback).map(c => c.close);
  const trendSlope = (recentCloses[recentCloses.length - 1] - recentCloses[0]) / lookback;
  
  // RSI signal
  const rsi = features.rsiNorm[lastIndex] * 100;
  
  // Momentum signal
  const momentum = features.momentumNorm[lastIndex];
  
  // Volume confirmation
  const volumeTrend = features.volumeChangeNorm[lastIndex];
  
  // Composite score
  let score = 0;
  let confidence = 50;
  
  // Trend contribution
  score += trendSlope > 0 ? 0.3 : -0.3;
  
  // RSI contribution (oversold = bullish, overbought = bearish)
  if (rsi < 30) score += 0.3;
  else if (rsi > 70) score -= 0.3;
  
  // Momentum contribution
  score += momentum * 0.2;
  
  // Volume confirmation
  if ((score > 0 && volumeTrend > 0) || (score < 0 && volumeTrend < 0)) {
    confidence += 10;
  }
  
  // Direction
  let direction: NeuralPrediction['direction'] = 'neutral';
  if (score > 0.3) direction = 'up';
  else if (score < -0.3) direction = 'down';
  
  // Adjust confidence based on score magnitude
  confidence = Math.min(100, Math.max(0, confidence + Math.abs(score) * 30));
  
  return {
    direction,
    confidence,
    predictedPrice: recentCloses[recentCloses.length - 1] * (1 + score * 0.02),
    priceChangePercent: score * 2,
    reasoning: `Statistical analysis: trend=${trendSlope > 0 ? 'up' : 'down'}, RSI=${rsi.toFixed(0)}, momentum_z=${momentum.toFixed(2)}`,
  };
}

// ==================== NEURAL STRATEGY ====================

const NEURAL_STRATEGY_CONFIG: StrategyConfig = {
  id: "zenbot-neural",
  name: "Zenbot Neural (AI-Powered)",
  description: "AI-powered price prediction using z-ai-sdk with statistical fallback",
  version: "1.0.0",
  author: "Zenbot + CITARION",
  timeframes: ["15m", "1h", "4h"],
  defaultTimeframe: "1h",
  parameters: [
    { name: "lookbackPeriod", type: "integer", defaultValue: 20, min: 10, max: 50, category: "Neural" },
    { name: "minConfidence", type: "number", defaultValue: 60, min: 50, max: 80, category: "Neural" },
    { name: "useAI", type: "boolean", defaultValue: true, category: "Neural" },
    { name: "predictionThreshold", type: "number", defaultValue: 0.5, min: 0.1, max: 2, category: "Signal" },
    { name: "rsiOversold", type: "number", defaultValue: 30, min: 20, max: 40, category: "Filter" },
    { name: "rsiOverbought", type: "number", defaultValue: 70, min: 60, max: 80, category: "Filter" },
  ],
  defaultTactics: [PREDEFINED_TACTICS_SETS[1]],
  tags: ["ai", "neural", "prediction", "zenbot"],
  minCandlesRequired: 50,
};

export class ZenbotNeuralStrategy extends BaseStrategy {
  private prediction: NeuralPrediction | null = null;
  private features: NeuralFeatures | null = null;
  private lastPredictionTime: number = 0;
  private predictionCache: NeuralPrediction | null = null;
  private cacheExpiry: number = 0;

  constructor() {
    super(NEURAL_STRATEGY_CONFIG);
  }

  async populateIndicatorsAsync(candles: Candle[]): Promise<IndicatorResult> {
    const lookback = Number(this.parameters.lookbackPeriod);
    this.features = prepareFeatures(candles, lookback);
    
    // Кэширование предсказания на 5 минут
    const now = Date.now();
    const useAI = Boolean(this.parameters.useAI);
    
    if (now > this.cacheExpiry || !this.predictionCache) {
      if (useAI) {
        const context = createAIContext(candles, this.features);
        this.prediction = await getAIPrediction(context);
      } else {
        this.prediction = getStatisticalPrediction(candles, this.features);
      }
      
      this.predictionCache = this.prediction;
      this.cacheExpiry = now + 5 * 60 * 1000; // 5 минут
    } else {
      this.prediction = this.predictionCache;
    }
    
    return {
      custom: {
        prediction: this.prediction ? [this.prediction.confidence] : [0],
        rsiNorm: this.features.rsiNorm,
        momentumNorm: this.features.momentumNorm,
      },
      rsi: { 14: this.features.rsiNorm.map(v => v * 100) },
    };
  }

  populateIndicators(candles: Candle[]): IndicatorResult {
    const lookback = Number(this.parameters.lookbackPeriod);
    this.features = prepareFeatures(candles, lookback);
    
    // Синхронная версия использует статистическое предсказание
    this.prediction = getStatisticalPrediction(candles, this.features);
    
    return {
      custom: {
        prediction: this.prediction ? [this.prediction.confidence] : [0],
      },
      rsi: { 14: this.features.rsiNorm.map(v => v * 100) },
    };
  }

  populateEntrySignal(candles: Candle[], indicators: IndicatorResult, currentPrice: number): StrategySignal | null {
    if (!this.prediction || !this.features) return null;
    
    const minConfidence = Number(this.parameters.minConfidence);
    const threshold = Number(this.parameters.predictionThreshold);
    const rsiOversold = Number(this.parameters.rsiOversold);
    const rsiOverbought = Number(this.parameters.rsiOverbought);
    
    const lastIndex = candles.length - 1;
    const rsi = this.features.rsiNorm[lastIndex] * 100;
    
    let signalType: SignalType = "NO_SIGNAL";
    let reason = "";
    
    // Проверяем уверенность
    if (this.prediction.confidence < minConfidence) {
      return null;
    }
    
    // Генерируем сигнал на основе предсказания
    if (this.prediction.direction === "up" && this.prediction.priceChangePercent && this.prediction.priceChangePercent > threshold) {
      // Дополнительный фильтр RSI
      if (rsi < rsiOverbought) {
        signalType = "LONG";
        reason = `AI predicts UP ${this.prediction.priceChangePercent.toFixed(2)}% (confidence: ${this.prediction.confidence}%)`;
        if (this.prediction.reasoning) {
          reason += ` - ${this.prediction.reasoning}`;
        }
      }
    } else if (this.prediction.direction === "down" && this.prediction.priceChangePercent && this.prediction.priceChangePercent < -threshold) {
      // Дополнительный фильтр RSI
      if (rsi > rsiOversold) {
        signalType = "SHORT";
        reason = `AI predicts DOWN ${this.prediction.priceChangePercent.toFixed(2)}% (confidence: ${this.prediction.confidence}%)`;
        if (this.prediction.reasoning) {
          reason += ` - ${this.prediction.reasoning}`;
        }
      }
    }
    
    if (signalType === "NO_SIGNAL") return null;
    
    return {
      type: signalType,
      confidence: this.prediction.confidence,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: currentPrice,
      reason,
      metadata: {
        prediction: this.prediction,
        rsi,
      },
    };
  }

  populateExitSignal(candles: Candle[], indicators: IndicatorResult, position: { direction: "LONG" | "SHORT"; entryPrice: number; currentPrice: number; size: number; openTime: Date; }): StrategySignal | null {
    if (!this.prediction) return null;
    
    let shouldExit = false;
    let reason = "";
    
    // Exit when prediction reverses
    if (position.direction === "LONG" && this.prediction.direction === "down" && this.prediction.confidence > 60) {
      shouldExit = true;
      reason = `AI prediction reversed to DOWN`;
    }
    if (position.direction === "SHORT" && this.prediction.direction === "up" && this.prediction.confidence > 60) {
      shouldExit = true;
      reason = `AI prediction reversed to UP`;
    }
    
    if (!shouldExit) return null;
    
    return {
      type: position.direction === "LONG" ? "EXIT_LONG" : "EXIT_SHORT",
      confidence: this.prediction.confidence,
      symbol: "",
      timeframe: this.config.defaultTimeframe,
      timestamp: new Date(),
      price: position.currentPrice,
      reason,
    };
  }
}

// ==================== EXPORT ====================

export { NEURAL_STRATEGY_CONFIG };
