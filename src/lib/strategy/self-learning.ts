/**
 * Self-Learning Strategy Module
 * 
 * Автоматическое улучшение стратегий с интеграцией z-ai-sdk.
 * 
 * Компоненты:
 * - SelfLearner: Автоматическое улучшение параметров стратегий
 * - AlphaFactors: Факторные модели для индикаторов
 * - MLIntegration: Интеграция с z-ai-sdk для анализа
 * - OrderAnalyzer: Анализ ордеров для предотвращения убыточных сделок
 * 
 * @author CITARION (inspired by Abu trading system)
 * @version 1.0.0
 */

import { 
  IStrategy, 
  StrategyConfig, 
  StrategySignal, 
  Candle,
  SignalType,
} from "./types";

// ==================== TYPES ====================

/**
 * Результат обучения
 */
export interface LearningResult {
  strategyId: string;
  timestamp: Date;
  improvement: number;       // % улучшения
  oldParams: Record<string, number>;
  newParams: Record<string, number>;
  backtestMetrics: {
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalTrades: number;
  };
  confidence: number;
  reason: string;
}

/**
 * Конфигурация Self-Learner
 */
export interface SelfLearnerConfig {
  /** Интервал автоматического обучения (ms) */
  learningInterval: number;
  /** Минимальное количество сделок для обучения */
  minTradesForLearning: number;
  /** Минимальный порог улучшения для применения (%) */
  improvementThreshold: number;
  /** Максимальное изменение параметра (%) */
  maxParamChange: number;
  /** Использовать AI для анализа */
  useAI: boolean;
  /** Сохранять историю обучения */
  keepHistory: boolean;
  /** Максимальная история */
  maxHistorySize: number;
}

/**
 * Alpha Factor
 */
export interface AlphaFactor {
  id: string;
  name: string;
  description: string;
  category: "momentum" | "value" | "quality" | "volatility" | "volume" | "sentiment";
  calculate: (candles: Candle[]) => number[];
  normalize: (values: number[]) => number[];
  weight: number;
}

/**
 * Результат анализа ордера
 */
export interface OrderAnalysisResult {
  shouldProceed: boolean;
  riskScore: number;          // 0-100
  confidence: number;
  warnings: string[];
  suggestions: string[];
  factors: {
    marketCondition: "trending" | "ranging" | "volatile" | "unknown";
    liquidityScore: number;
    spreadScore: number;
    volumeScore: number;
    momentumScore: number;
  };
}

/**
 * История обучения
 */
export interface LearningHistory {
  strategyId: string;
  results: LearningResult[];
  bestParams: Record<string, number>;
  totalImprovements: number;
  lastLearning: Date;
}

// ==================== ALPHA FACTORS ====================

/**
 * Momentum Alpha Factors
 */
export const MOMENTUM_FACTORS: AlphaFactor[] = [
  {
    id: "price_momentum",
    name: "Price Momentum",
    description: "Rate of change of price over period",
    category: "momentum",
    weight: 1.0,
    calculate: (candles: Candle[]) => {
      const closes = candles.map(c => c.close);
      const result: number[] = [];
      const period = 10;
      
      for (let i = 0; i < closes.length; i++) {
        if (i < period) {
          result.push(0);
        } else {
          result.push((closes[i] - closes[i - period]) / closes[i - period]);
        }
      }
      return result;
    },
    normalize: (values: number[]) => {
      const std = Math.sqrt(values.reduce((acc, v) => acc + v * v, 0) / values.length);
      return values.map(v => std > 0 ? v / std : 0);
    },
  },
  {
    id: "rsi_factor",
    name: "RSI Factor",
    description: "Normalized RSI as factor",
    category: "momentum",
    weight: 0.8,
    calculate: (candles: Candle[]) => {
      const closes = candles.map(c => c.close);
      const period = 14;
      const result: number[] = [];
      
      let gains = 0;
      let losses = 0;
      
      for (let i = 0; i < closes.length; i++) {
        if (i < period) {
          result.push(50);
          continue;
        }
        
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        
        if (i === period) {
          gains = gain;
          losses = loss;
        } else {
          gains = (gains * (period - 1) + gain) / period;
          losses = (losses * (period - 1) + loss) / period;
        }
        
        const rs = losses > 0 ? gains / losses : 100;
        result.push(100 - (100 / (1 + rs)));
      }
      return result;
    },
    normalize: (values: number[]) => {
      return values.map(v => (v - 50) / 50); // -1 to 1
    },
  },
  {
    id: "macd_factor",
    name: "MACD Factor",
    description: "MACD histogram normalized",
    category: "momentum",
    weight: 0.9,
    calculate: (candles: Candle[]) => {
      const closes = candles.map(c => c.close);
      const ema = (data: number[], period: number) => {
        const k = 2 / (period + 1);
        const result: number[] = [data[0]];
        for (let i = 1; i < data.length; i++) {
          result.push(data[i] * k + result[i - 1] * (1 - k));
        }
        return result;
      };
      
      const ema12 = ema(closes, 12);
      const ema26 = ema(closes, 26);
      const macd = ema12.map((e, i) => e - ema26[i]);
      const signal = ema(macd, 9);
      
      return macd.map((m, i) => m - signal[i]);
    },
    normalize: (values: number[]) => {
      const std = Math.sqrt(values.reduce((acc, v) => acc + v * v, 0) / values.length);
      return values.map(v => std > 0 ? v / std : 0);
    },
  },
];

/**
 * Volatility Alpha Factors
 */
export const VOLATILITY_FACTORS: AlphaFactor[] = [
  {
    id: "atr_factor",
    name: "ATR Factor",
    description: "Normalized ATR for volatility",
    category: "volatility",
    weight: 0.7,
    calculate: (candles: Candle[]) => {
      const period = 14;
      const result: number[] = [];
      
      for (let i = 0; i < candles.length; i++) {
        if (i < period) {
          result.push(0);
          continue;
        }
        
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
          const tr = Math.max(
            candles[j].high - candles[j].low,
            Math.abs(candles[j].high - candles[j - 1].close),
            Math.abs(candles[j].low - candles[j - 1].close)
          );
          sum += tr;
        }
        
        result.push((sum / period) / candles[i].close);
      }
      return result;
    },
    normalize: (values: number[]) => {
      const max = Math.max(...values);
      return values.map(v => max > 0 ? v / max : 0);
    },
  },
  {
    id: "bollinger_width",
    name: "Bollinger Width",
    description: "Bollinger Band width as volatility measure",
    category: "volatility",
    weight: 0.6,
    calculate: (candles: Candle[]) => {
      const closes = candles.map(c => c.close);
      const period = 20;
      const result: number[] = [];
      
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
          result.push(0);
          continue;
        }
        
        const slice = closes.slice(i - period + 1, i + 1);
        const sma = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((acc, v) => acc + (v - sma) ** 2, 0) / period;
        const std = Math.sqrt(variance);
        
        result.push((2 * std) / sma);
      }
      return result;
    },
    normalize: (values: number[]) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return values.map(v => mean > 0 ? v / mean : 0);
    },
  },
];

/**
 * Volume Alpha Factors
 */
export const VOLUME_FACTORS: AlphaFactor[] = [
  {
    id: "volume_ratio",
    name: "Volume Ratio",
    description: "Current volume vs average volume",
    category: "volume",
    weight: 0.8,
    calculate: (candles: Candle[]) => {
      const volumes = candles.map(c => c.volume);
      const period = 20;
      const result: number[] = [];
      
      for (let i = 0; i < volumes.length; i++) {
        if (i < period - 1) {
          result.push(1);
          continue;
        }
        
        const avgVolume = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        result.push(avgVolume > 0 ? volumes[i] / avgVolume : 1);
      }
      return result;
    },
    normalize: (values: number[]) => {
      const max = Math.max(...values);
      return values.map(v => max > 0 ? v / max : 0);
    },
  },
  {
    id: "obv_factor",
    name: "OBV Factor",
    description: "On-Balance Volume momentum",
    category: "volume",
    weight: 0.7,
    calculate: (candles: Candle[]) => {
      const result: number[] = [0];
      
      for (let i = 1; i < candles.length; i++) {
        const prevObv = result[i - 1];
        if (candles[i].close > candles[i - 1].close) {
          result.push(prevObv + candles[i].volume);
        } else if (candles[i].close < candles[i - 1].close) {
          result.push(prevObv - candles[i].volume);
        } else {
          result.push(prevObv);
        }
      }
      return result;
    },
    normalize: (values: number[]) => {
      const max = Math.max(...values.map(Math.abs));
      return values.map(v => max > 0 ? v / max : 0);
    },
  },
];

// ==================== SELF-LEARNER CLASS ====================

/**
 * Self-Learning Engine для стратегий
 */
export class SelfLearner {
  private config: SelfLearnerConfig;
  private history: Map<string, LearningHistory> = new Map();
  private learningInProgress: Map<string, boolean> = new Map();
  
  constructor(config: Partial<SelfLearnerConfig> = {}) {
    this.config = {
      learningInterval: config.learningInterval ?? 3600000, // 1 hour
      minTradesForLearning: config.minTradesForLearning ?? 30,
      improvementThreshold: config.improvementThreshold ?? 5,
      maxParamChange: config.maxParamChange ?? 20,
      useAI: config.useAI ?? true,
      keepHistory: config.keepHistory ?? true,
      maxHistorySize: config.maxHistorySize ?? 100,
    };
  }
  
  /**
   * Обучить стратегию на основе истории сделок
   */
  async learn(
    strategy: IStrategy,
    candles: Candle[],
    trades: Array<{
      type: "buy" | "sell";
      price: number;
      size: number;
      pnl: number;
      timestamp: Date;
    }>
  ): Promise<LearningResult | null> {
    const strategyId = strategy.getConfig().id;
    
    // Проверяем, не正在进行 ли уже обучение
    if (this.learningInProgress.get(strategyId)) {
      return null;
    }
    
    // Проверяем минимальное количество сделок
    if (trades.length < this.config.minTradesForLearning) {
      return null;
    }
    
    this.learningInProgress.set(strategyId, true);
    
    try {
      // Анализируем текущие метрики
      const currentMetrics = this.calculateMetrics(trades);
      
      // Генерируем кандидатов параметров
      const candidates = this.generateParameterCandidates(strategy);
      
      // Тестируем каждого кандидата
      let bestResult: LearningResult | null = null;
      let bestImprovement = 0;
      
      for (const candidate of candidates) {
        // Применяем параметры временно
        const oldParams = { ...strategy.getParameters() };
        strategy.setParameters(candidate);
        
        // Симулируем на исторических данных
        const simulatedTrades = this.simulateStrategy(strategy, candles);
        const newMetrics = this.calculateMetrics(simulatedTrades);
        
        // Восстанавливаем параметры
        strategy.setParameters(oldParams);
        
        // Рассчитываем улучшение
        const improvement = this.calculateImprovement(currentMetrics, newMetrics);
        
        if (improvement > bestImprovement && improvement >= this.config.improvementThreshold) {
          bestImprovement = improvement;
          bestResult = {
            strategyId,
            timestamp: new Date(),
            improvement,
            oldParams,
            newParams: candidate,
            backtestMetrics: newMetrics,
            confidence: this.calculateConfidence(newMetrics, simulatedTrades.length),
            reason: this.generateLearningReason(currentMetrics, newMetrics, improvement),
          };
        }
      }
      
      // Сохраняем результат в историю
      if (bestResult && this.config.keepHistory) {
        this.addToHistory(bestResult);
      }
      
      return bestResult;
    } finally {
      this.learningInProgress.set(strategyId, false);
    }
  }
  
  /**
   * Использовать AI для анализа стратегии
   */
  async analyzeWithAI(
    strategy: IStrategy,
    candles: Candle[],
    recentSignals: StrategySignal[]
  ): Promise<{
    insights: string[];
    suggestions: Record<string, number>;
    confidence: number;
  }> {
    if (!this.config.useAI) {
      return { insights: [], suggestions: {}, confidence: 0 };
    }
    
    try {
      // Динамический импорт z-ai-sdk
      const ZAI = await import("z-ai-web-dev-sdk").then(m => m.default || m);
      const zai = await ZAI.create();
      
      const config = strategy.getConfig();
      const params = strategy.getParameters();
      
      const prompt = `Analyze this trading strategy and suggest parameter improvements:

Strategy: ${config.name}
Description: ${config.description}
Current Parameters: ${JSON.stringify(params, null, 2)}
Recent Signals: ${JSON.stringify(recentSignals.slice(-10), null, 2)}
Market Context: ${candles.length} candles analyzed

Provide:
1. Analysis of current strategy performance
2. Suggested parameter adjustments (as JSON)
3. Risk assessment

Respond in JSON format:
{
  "insights": ["insight1", "insight2"],
  "suggestions": {"paramName": newValue},
  "confidence": 0-100
}`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: "You are a quantitative trading strategy analyst. Provide actionable insights in JSON format." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      });
      
      const response = completion.choices[0]?.message?.content;
      
      if (response) {
        try {
          return JSON.parse(response);
        } catch {
          return { insights: [response], suggestions: {}, confidence: 50 };
        }
      }
    } catch (error) {
      console.error("AI analysis failed:", error);
    }
    
    return { insights: [], suggestions: {}, confidence: 0 };
  }
  
  /**
   * Рассчитать метрики стратегии
   */
  private calculateMetrics(trades: Array<{ pnl: number }>): {
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalTrades: number;
  } {
    const pnls = trades.map(t => t.pnl);
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p < 0);
    
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    
    const totalWins = wins.reduce((a, b) => a + b, 0);
    const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    
    // Sharpe approximation
    const meanPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const stdPnl = Math.sqrt(pnls.reduce((acc, p) => acc + (p - meanPnl) ** 2, 0) / pnls.length);
    const sharpeRatio = stdPnl > 0 ? (meanPnl / stdPnl) * Math.sqrt(252) : 0;
    
    // Max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    
    for (const pnl of pnls) {
      cumulative += pnl;
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    }
    
    return {
      winRate,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      totalTrades: trades.length,
    };
  }
  
  /**
   * Генерировать кандидатов параметров
   */
  private generateParameterCandidates(strategy: IStrategy): Record<string, number>[] {
    const config = strategy.getConfig();
    const currentParams = strategy.getParameters();
    const candidates: Record<string, number>[] = [];
    
    // Генерируем вариации для каждого параметра
    for (const param of config.parameters) {
      if (param.type !== "integer" && param.type !== "number") continue;
      
      const currentValue = Number(currentParams[param.name]);
      const range = (param.max - param.min) * (this.config.maxParamChange / 100);
      
      // Три варианта: уменьшить, оставить, увеличить
      const variations = [
        Math.max(param.min, currentValue - range / 2),
        currentValue,
        Math.min(param.max, currentValue + range / 2),
      ];
      
      for (const variation of variations) {
        candidates.push({
          ...currentParams,
          [param.name]: param.type === "integer" ? Math.round(variation) : variation,
        });
      }
    }
    
    return candidates;
  }
  
  /**
   * Симулировать стратегию на исторических данных
   */
  private simulateStrategy(
    strategy: IStrategy,
    candles: Candle[]
  ): Array<{ pnl: number }> {
    const trades: Array<{ pnl: number }> = [];
    let position: { entryPrice: number; direction: "LONG" | "SHORT" } | null = null;
    
    const minCandles = strategy.getConfig().minCandlesRequired;
    
    for (let i = minCandles; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      const indicators = strategy.populateIndicators(slice);
      
      if (!position) {
        const signal = strategy.populateEntrySignal(slice, indicators, candles[i].close);
        if (signal && signal.type !== "NO_SIGNAL") {
          position = {
            entryPrice: candles[i].close,
            direction: signal.type as "LONG" | "SHORT",
          };
        }
      } else {
        const signal = strategy.populateExitSignal(slice, indicators, {
          direction: position.direction,
          entryPrice: position.entryPrice,
          currentPrice: candles[i].close,
          size: 1,
          openTime: new Date(candles[i].time as number),
        });
        
        if (signal) {
          const pnl = position.direction === "LONG"
            ? candles[i].close - position.entryPrice
            : position.entryPrice - candles[i].close;
          
          trades.push({ pnl });
          position = null;
        }
      }
    }
    
    return trades;
  }
  
  /**
   * Рассчитать улучшение метрик
   */
  private calculateImprovement(
    oldMetrics: ReturnType<typeof this.calculateMetrics>,
    newMetrics: ReturnType<typeof this.calculateMetrics>
  ): number {
    // Взвешенная комбинация метрик
    const oldScore = 
      oldMetrics.winRate * 0.3 +
      oldMetrics.profitFactor * 10 * 0.3 +
      oldMetrics.sharpeRatio * 20 * 0.3 -
      oldMetrics.maxDrawdown * 0.1;
    
    const newScore = 
      newMetrics.winRate * 0.3 +
      newMetrics.profitFactor * 10 * 0.3 +
      newMetrics.sharpeRatio * 20 * 0.3 -
      newMetrics.maxDrawdown * 0.1;
    
    return ((newScore - oldScore) / Math.abs(oldScore)) * 100;
  }
  
  /**
   * Рассчитать уверенность в результате
   */
  private calculateConfidence(metrics: ReturnType<typeof this.calculateMetrics>, tradesCount: number): number {
    // Больше сделок = выше уверенность
    const tradeConfidence = Math.min(tradesCount / 100, 1) * 30;
    
    // Лучшие метрики = выше уверенность
    const metricConfidence = 
      (metrics.winRate / 100) * 30 +
      (Math.min(metrics.profitFactor, 3) / 3) * 20 +
      (Math.min(metrics.sharpeRatio, 2) / 2) * 20;
    
    return Math.min(tradeConfidence + metricConfidence, 100);
  }
  
  /**
   * Сгенерировать причину обучения
   */
  private generateLearningReason(
    oldMetrics: ReturnType<typeof this.calculateMetrics>,
    newMetrics: ReturnType<typeof this.calculateMetrics>,
    improvement: number
  ): string {
    const changes: string[] = [];
    
    if (newMetrics.winRate > oldMetrics.winRate) {
      changes.push(`win rate +${(newMetrics.winRate - oldMetrics.winRate).toFixed(1)}%`);
    }
    if (newMetrics.profitFactor > oldMetrics.profitFactor) {
      changes.push(`profit factor +${(newMetrics.profitFactor - oldMetrics.profitFactor).toFixed(2)}`);
    }
    if (newMetrics.sharpeRatio > oldMetrics.sharpeRatio) {
      changes.push(`Sharpe +${(newMetrics.sharpeRatio - oldMetrics.sharpeRatio).toFixed(2)}`);
    }
    if (newMetrics.maxDrawdown < oldMetrics.maxDrawdown) {
      changes.push(`drawdown -${(oldMetrics.maxDrawdown - newMetrics.maxDrawdown).toFixed(2)}`);
    }
    
    return `Overall improvement: ${improvement.toFixed(1)}%. Changes: ${changes.join(", ")}`;
  }
  
  /**
   * Добавить результат в историю
   */
  private addToHistory(result: LearningResult): void {
    let history = this.history.get(result.strategyId);
    
    if (!history) {
      history = {
        strategyId: result.strategyId,
        results: [],
        bestParams: result.newParams,
        totalImprovements: 0,
        lastLearning: new Date(),
      };
      this.history.set(result.strategyId, history);
    }
    
    history.results.push(result);
    history.totalImprovements += result.improvement;
    history.lastLearning = new Date();
    
    // Обновляем лучшие параметры если улучшение значительное
    if (result.improvement > 10) {
      history.bestParams = result.newParams;
    }
    
    // Ограничиваем размер истории
    if (history.results.length > this.config.maxHistorySize) {
      history.results = history.results.slice(-this.config.maxHistorySize);
    }
  }
  
  /**
   * Получить историю обучения
   */
  getHistory(strategyId: string): LearningHistory | undefined {
    return this.history.get(strategyId);
  }
  
  /**
   * Получить лучшие параметры
   */
  getBestParams(strategyId: string): Record<string, number> | undefined {
    return this.history.get(strategyId)?.bestParams;
  }
}

// ==================== ORDER ANALYZER ====================

/**
 * Анализатор ордеров для предотвращения убыточных сделок
 */
export class OrderAnalyzer {
  private historicalData: Map<string, Candle[]> = new Map();
  
  /**
   * Проанализировать потенциальный ордер
   */
  async analyze(
    symbol: string,
    direction: "buy" | "sell",
    price: number,
    size: number,
    candles: Candle[]
  ): Promise<OrderAnalysisResult> {
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Анализируем рыночные условия
    const factors = this.analyzeFactors(candles);
    
    // Проверяем условия рынка
    if (factors.spreadScore < 30) {
      warnings.push("High spread detected - consider waiting for better liquidity");
    }
    
    if (factors.volumeScore < 30) {
      warnings.push("Low volume - may experience slippage");
    }
    
    // Momentum анализ
    if (direction === "buy" && factors.momentumScore < -50) {
      warnings.push("Strong bearish momentum - buying against trend");
      suggestions.push("Consider waiting for momentum reversal");
    }
    
    if (direction === "sell" && factors.momentumScore > 50) {
      warnings.push("Strong bullish momentum - selling against trend");
      suggestions.push("Consider waiting for momentum reversal");
    }
    
    // Volatility анализ
    if (factors.marketCondition === "volatile") {
      warnings.push("High volatility - increased risk of stop-out");
      suggestions.push("Consider reducing position size or widening stop loss");
    }
    
    // Рассчитываем общий риск-скор
    const riskScore = this.calculateRiskScore(factors, warnings);
    
    // Определяем, стоит ли продолжать
    const shouldProceed = riskScore < 70 && warnings.length < 3;
    
    return {
      shouldProceed,
      riskScore,
      confidence: Math.max(0, 100 - riskScore),
      warnings,
      suggestions,
      factors,
    };
  }
  
  /**
   * Анализировать факторы рынка
   */
  private analyzeFactors(candles: Candle[]): OrderAnalysisResult["factors"] {
    const lastCandles = candles.slice(-50);
    
    // Market condition
    const closes = lastCandles.map(c => c.close);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.reduce((a, b) => a + b, 0) / closes.length;
    
    const trend = sma20 > sma50 * 1.02 ? "trending" : 
                  sma20 < sma50 * 0.98 ? "ranging" : "unknown";
    
    // Volatility
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const volatility = Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length);
    const marketCondition = volatility > 0.03 ? "volatile" : trend;
    
    // Liquidity score (based on volume)
    const volumes = lastCandles.map(c => c.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const liquidityScore = Math.min(100, (recentVolume / avgVolume) * 50);
    
    // Spread score (approximation)
    const spreads = lastCandles.map(c => (c.high - c.low) / c.close);
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const spreadScore = Math.max(0, 100 - avgSpread * 1000);
    
    // Volume score
    const volumeScore = Math.min(100, liquidityScore);
    
    // Momentum score
    const momentum = MOMENTUM_FACTORS[0].calculate(candles);
    const lastMomentum = momentum[momentum.length - 1];
    const momentumScore = lastMomentum * 100;
    
    return {
      marketCondition,
      liquidityScore,
      spreadScore,
      volumeScore,
      momentumScore,
    };
  }
  
  /**
   * Рассчитать риск-скор
   */
  private calculateRiskScore(
    factors: OrderAnalysisResult["factors"],
    warnings: string[]
  ): number {
    let risk = 0;
    
    // Базовый риск на основе факторов
    risk += (100 - factors.liquidityScore) * 0.2;
    risk += (100 - factors.spreadScore) * 0.15;
    risk += (100 - factors.volumeScore) * 0.15;
    
    // Риск от рыночных условий
    if (factors.marketCondition === "volatile") {
      risk += 20;
    }
    
    // Риск от предупреждений
    risk += warnings.length * 10;
    
    return Math.min(100, risk);
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Создать Self-Learner
 */
export function createSelfLearner(config: Partial<SelfLearnerConfig> = {}): SelfLearner {
  return new SelfLearner(config);
}

/**
 * Создать Order Analyzer
 */
export function createOrderAnalyzer(): OrderAnalyzer {
  return new OrderAnalyzer();
}

/**
 * Получить все Alpha факторы
 */
export function getAllAlphaFactors(): AlphaFactor[] {
  return [
    ...MOMENTUM_FACTORS,
    ...VOLATILITY_FACTORS,
    ...VOLUME_FACTORS,
  ];
}

/**
 * Рассчитать composite Alpha score
 */
export function calculateAlphaScore(
  candles: Candle[],
  factors: AlphaFactor[] = getAllAlphaFactors()
): number {
  const scores: number[] = [];
  
  for (const factor of factors) {
    const values = factor.calculate(candles);
    const normalized = factor.normalize(values);
    const lastValue = normalized[normalized.length - 1];
    
    if (!isNaN(lastValue)) {
      scores.push(lastValue * factor.weight);
    }
  }
  
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  return scores.reduce((a, b) => a + b, 0) / totalWeight;
}

// ==================== SINGLETON INSTANCE ====================

let selfLearnerInstance: SelfLearner | null = null;
let orderAnalyzerInstance: OrderAnalyzer | null = null;

export function getSelfLearner(): SelfLearner {
  if (!selfLearnerInstance) {
    selfLearnerInstance = new SelfLearner();
  }
  return selfLearnerInstance;
}

export function getOrderAnalyzer(): OrderAnalyzer {
  if (!orderAnalyzerInstance) {
    orderAnalyzerInstance = new OrderAnalyzer();
  }
  return orderAnalyzerInstance;
}
