/**
 * Strategy Integration Module
 * 
 * Интеграционный слой для объединения компонентов:
 * - Trailing Stop интеграция в сигналы
 * - Risk Management валидация
 * - Order analysis для предотвращения убыточных сделок
 * - Async message patterns (Redis-style)
 * 
 * @author CITARION
 * @version 1.0.0
 */

import { 
  StrategySignal, 
  Candle, 
  SignalType,
  BaseStrategy,
  IndicatorResult,
} from "./types";
import { 
  TrailingStopManager, 
  createTrailingStop, 
  TRAILING_STOP_PRESETS,
  TrailingStopResult,
} from "./trailing-stop";
import { 
  RiskManager, 
  RiskCheckResult, 
  RISK_PRESETS,
  RiskContext,
} from "./risk-manager";

// ==================== TYPES ====================

/**
 * Расширенный сигнал с интегрированными рисками
 */
export interface EnhancedSignal extends StrategySignal {
  trailingStop?: {
    manager: TrailingStopManager;
    config: {
      enablePct: number;
      trailPct: number;
    };
  };
  riskCheck?: RiskCheckResult;
  positionSize?: {
    recommended: number;
    maxAllowed: number;
    riskAmount: number;
  };
}

/**
 * Позиция с trailing stop
 */
export interface PositionWithTrailing {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  size: number;
  openTime: Date;
  trailingStop?: TrailingStopManager;
  stopLoss?: number;
  takeProfit?: number[];
}

/**
 * Конфигурация интеграции
 */
export interface IntegrationConfig {
  // Trailing Stop defaults
  trailingStopPreset: keyof typeof TRAILING_STOP_PRESETS;
  trailingStopEnabled: boolean;
  
  // Risk Management defaults
  riskPreset: keyof typeof RISK_PRESETS;
  riskEnabled: boolean;
  
  // Position sizing
  riskPerTrade: number;  // % of balance per trade
  maxPositionSize: number;
  minPositionSize: number;
  
  // Order analysis
  preventLossTrades: boolean;
  minProfitThreshold: number;  // Minimum expected profit %
}

/**
 * Результат анализа ордера
 */
export interface OrderAnalysisResult {
  shouldProceed: boolean;
  reason: string;
  suggestions: string[];
  riskLevel: "low" | "medium" | "high";
  expectedProfit?: number;
  expectedLoss?: number;
}

// ==================== SIGNAL INTEGRATOR ====================

/**
 * Класс для интеграции всех компонентов в сигнал
 */
export class SignalIntegrator {
  private config: IntegrationConfig;
  private activePositions: Map<string, PositionWithTrailing> = new Map();
  
  constructor(config?: Partial<IntegrationConfig>) {
    this.config = {
      trailingStopPreset: "moderate",
      trailingStopEnabled: true,
      riskPreset: "moderate",
      riskEnabled: true,
      riskPerTrade: 2,  // 2% per trade
      maxPositionSize: Infinity,
      minPositionSize: 0,
      preventLossTrades: true,
      minProfitThreshold: 0.5,
      ...config,
    };
  }
  
  /**
   * Улучшить сигнал с trailing stop и risk management
   */
  enhanceSignal(
    signal: StrategySignal,
    context: {
      balance: number;
      recentTrades: Array<{ type: "buy" | "sell"; price: number; size: number; time: number }>;
      currentPrice: number;
    }
  ): EnhancedSignal {
    const enhanced: EnhancedSignal = { ...signal };
    
    // 1. Risk Management проверка
    if (this.config.riskEnabled) {
      const riskManager = new RiskManager(RISK_PRESETS[this.config.riskPreset]);
      const riskContext: RiskContext = {
        currentPrice: context.currentPrice,
        proposedPrice: signal.price,
        proposedSize: this.calculatePositionSize(context.balance, signal.price),
        direction: signal.type === "LONG" ? "buy" : "sell",
        balance: {
          asset: 0,
          currency: context.balance,
          deposit: context.balance,
        },
        trades: context.recentTrades,
      };
      
      enhanced.riskCheck = riskManager.checkRisk(riskContext);
    }
    
    // 2. Trailing Stop настройка
    if (this.config.trailingStopEnabled && signal.type !== "NO_SIGNAL") {
      const preset = TRAILING_STOP_PRESETS[this.config.trailingStopPreset];
      const trailingManager = createTrailingStop(
        signal.price,
        signal.type as "LONG" | "SHORT",
        preset.profitStopEnablePct,
        preset.profitStopPct
      );
      
      enhanced.trailingStop = {
        manager: trailingManager,
        config: {
          enablePct: preset.profitStopEnablePct,
          trailPct: preset.profitStopPct,
        },
      };
    }
    
    // 3. Position sizing
    enhanced.positionSize = {
      recommended: this.calculatePositionSize(context.balance, signal.price),
      maxAllowed: Math.min(context.balance * (this.config.riskPerTrade / 100) / signal.price, this.config.maxPositionSize),
      riskAmount: context.balance * (this.config.riskPerTrade / 100),
    };
    
    return enhanced;
  }
  
  /**
   * Рассчитать размер позиции
   */
  private calculatePositionSize(balance: number, price: number): number {
    const riskAmount = balance * (this.config.riskPerTrade / 100);
    let size = riskAmount / price;
    
    if (size > this.config.maxPositionSize) {
      size = this.config.maxPositionSize;
    }
    
    if (size < this.config.minPositionSize) {
      return 0;
    }
    
    return size;
  }
  
  /**
   * Создать позицию с trailing stop
   */
  createPosition(
    signal: EnhancedSignal,
    symbol: string,
    size: number
  ): PositionWithTrailing | null {
    if (signal.type === "NO_SIGNAL" || signal.type === "EXIT_LONG" || signal.type === "EXIT_SHORT") {
      return null;
    }
    
    const position: PositionWithTrailing = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      direction: signal.type as "LONG" | "SHORT",
      entryPrice: signal.price,
      size,
      openTime: new Date(),
      stopLoss: signal.suggestedStopLoss,
      takeProfit: signal.suggestedTakeProfits?.map(tp => tp.price),
    };
    
    if (signal.trailingStop) {
      position.trailingStop = signal.trailingStop.manager;
    }
    
    this.activePositions.set(position.id, position);
    return position;
  }
  
  /**
   * Обновить позицию с проверкой trailing stop
   */
  updatePosition(
    positionId: string,
    currentPrice: number
  ): {
    position: PositionWithTrailing | undefined;
    trailingResult?: TrailingStopResult;
    shouldClose: boolean;
    closeReason?: string;
  } {
    const position = this.activePositions.get(positionId);
    
    if (!position) {
      return { position: undefined, shouldClose: false };
    }
    
    let trailingResult: TrailingStopResult | undefined;
    let shouldClose = false;
    let closeReason: string | undefined;
    
    // Проверяем trailing stop
    if (position.trailingStop) {
      trailingResult = position.trailingStop.check(currentPrice);
      
      if (trailingResult.shouldClose) {
        shouldClose = true;
        closeReason = trailingResult.reason;
      }
    }
    
    // Проверяем stop loss
    if (position.stopLoss) {
      if (position.direction === "LONG" && currentPrice <= position.stopLoss) {
        shouldClose = true;
        closeReason = `Stop loss triggered at ${position.stopLoss}`;
      } else if (position.direction === "SHORT" && currentPrice >= position.stopLoss) {
        shouldClose = true;
        closeReason = `Stop loss triggered at ${position.stopLoss}`;
      }
    }
    
    // Проверяем take profit
    if (position.takeProfit && position.takeProfit.length > 0) {
      for (const tp of position.takeProfit) {
        if (position.direction === "LONG" && currentPrice >= tp) {
          shouldClose = true;
          closeReason = `Take profit reached at ${tp}`;
          break;
        } else if (position.direction === "SHORT" && currentPrice <= tp) {
          shouldClose = true;
          closeReason = `Take profit reached at ${tp}`;
          break;
        }
      }
    }
    
    return { position, trailingResult, shouldClose, closeReason };
  }
  
  /**
   * Закрыть позицию
   */
  closePosition(positionId: string): PositionWithTrailing | undefined {
    const position = this.activePositions.get(positionId);
    if (position) {
      this.activePositions.delete(positionId);
    }
    return position;
  }
  
  /**
   * Получить все активные позиции
   */
  getActivePositions(): PositionWithTrailing[] {
    return Array.from(this.activePositions.values());
  }
}

// ==================== ORDER ANALYZER ====================

/**
 * Анализатор ордеров для предотвращения убыточных сделок
 * 
 * Портировано из Abu (https://github.com/bbfamily/abu)
 */
export class OrderAnalyzer {
  private history: Array<{
    signal: StrategySignal;
    result: "profit" | "loss";
    pnl: number;
    timestamp: Date;
  }> = [];
  
  /**
   * Проанализировать потенциальный ордер
   */
  analyzeOrder(
    signal: StrategySignal,
    candles: Candle[],
    indicators: IndicatorResult
  ): OrderAnalysisResult {
    const suggestions: string[] = [];
    let riskLevel: "low" | "medium" | "high" = "medium";
    
    // 1. Проверка на низкую уверенность
    if (signal.confidence < 50) {
      suggestions.push("Signal confidence is below 50%. Consider waiting for confirmation.");
      riskLevel = "high";
    }
    
    // 2. Проверка на тренд против сигнала
    const lastIndex = candles.length - 1;
    const recentCloses = candles.slice(-20).map(c => c.close);
    const trendUp = recentCloses[recentCloses.length - 1] > recentCloses[0];
    
    if (signal.type === "SHORT" && trendUp) {
      suggestions.push("Signal is SHORT but recent trend is UP. Be cautious.");
      riskLevel = "high";
    } else if (signal.type === "LONG" && !trendUp) {
      suggestions.push("Signal is LONG but recent trend is DOWN. Be cautious.");
      riskLevel = "high";
    }
    
    // 3. Проверка на волатильность
    const ranges = candles.slice(-14).map(c => (c.high - c.low) / c.close);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    
    if (avgRange > 0.05) {
      suggestions.push(`High volatility detected (${(avgRange * 100).toFixed(1)}% avg range). Consider reducing position size.`);
      riskLevel = riskLevel === "high" ? "high" : "medium";
    }
    
    // 4. Проверка на RSI уровни (если есть)
    if (indicators.rsi) {
      const rsiValues = Object.values(indicators.rsi)[0];
      const currentRSI = rsiValues?.[lastIndex];
      
      if (currentRSI !== undefined && !isNaN(currentRSI)) {
        if (signal.type === "LONG" && currentRSI > 70) {
          suggestions.push(`RSI is overbought (${currentRSI.toFixed(1)}). LONG signal may be risky.`);
          riskLevel = "high";
        } else if (signal.type === "SHORT" && currentRSI < 30) {
          suggestions.push(`RSI is oversold (${currentRSI.toFixed(1)}). SHORT signal may be risky.`);
          riskLevel = "high";
        }
      }
    }
    
    // 5. Проверка истории подобных сигналов
    const similarSignals = this.history.filter(h => 
      h.signal.type === signal.type && 
      h.signal.reason === signal.reason
    );
    
    if (similarSignals.length >= 5) {
      const profitRate = similarSignals.filter(h => h.result === "profit").length / similarSignals.length;
      
      if (profitRate < 0.4) {
        suggestions.push(`Historical win rate for similar signals: ${(profitRate * 100).toFixed(1)}%. Consider skipping.`);
        riskLevel = "high";
      }
    }
    
    // 6. Расчёт ожидаемого профита/убытка
    const atr = this.calculateATR(candles, 14);
    const expectedProfit = signal.type === "LONG" 
      ? (signal.suggestedTakeProfits?.[0]?.price || signal.price + atr * 2) - signal.price
      : signal.price - (signal.suggestedTakeProfits?.[0]?.price || signal.price - atr * 2);
    
    const expectedLoss = signal.suggestedStopLoss
      ? Math.abs(signal.price - signal.suggestedStopLoss)
      : atr;
    
    const riskRewardRatio = expectedProfit / expectedLoss;
    
    if (riskRewardRatio < 1.5) {
      suggestions.push(`Risk/Reward ratio is ${riskRewardRatio.toFixed(2)}. Recommended minimum is 1.5.`);
      if (riskLevel !== "high") riskLevel = "medium";
    }
    
    // Определяем, следует ли продолжить
    const shouldProceed = riskLevel !== "high" || suggestions.length === 0;
    
    return {
      shouldProceed,
      reason: suggestions.length > 0 ? suggestions[0] : "Order analysis passed",
      suggestions,
      riskLevel,
      expectedProfit: (expectedProfit / signal.price) * 100,
      expectedLoss: (expectedLoss / signal.price) * 100,
    };
  }
  
  /**
   * Записать результат сделки в историю
   */
  recordResult(
    signal: StrategySignal,
    result: "profit" | "loss",
    pnl: number
  ): void {
    this.history.push({
      signal,
      result,
      pnl,
      timestamp: new Date(),
    });
    
    // Ограничиваем историю
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
  }
  
  /**
   * Рассчитать ATR
   */
  private calculateATR(candles: Candle[], period: number): number {
    if (candles.length < period) {
      return candles[candles.length - 1].high - candles[candles.length - 1].low;
    }
    
    let atrSum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1]?.close || candles[i].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      atrSum += tr;
    }
    
    return atrSum / period;
  }
}

// ==================== ASYNC MESSAGE PATTERNS ====================

/**
 * Async Message Pattern для обработки сигналов
 * 
 * Портировано из timercrack/trader
 */
export interface AsyncMessage {
  id: string;
  type: "signal" | "order" | "position_update" | "risk_alert";
  payload: unknown;
  timestamp: Date;
  priority: "low" | "normal" | "high" | "critical";
  retryCount: number;
  maxRetries: number;
}

export interface MessageHandler {
  (message: AsyncMessage): Promise<void>;
}

/**
 * Простая очередь сообщений (Redis-style)
 */
export class MessageQueue {
  private queue: AsyncMessage[] = [];
  private handlers: Map<string, MessageHandler[]> = new Map();
  private processing: boolean = false;
  private maxQueueSize: number = 10000;
  
  /**
   * Добавить сообщение в очередь
   */
  async publish(message: Omit<AsyncMessage, "id" | "timestamp" | "retryCount">): Promise<string> {
    if (this.queue.length >= this.maxQueueSize) {
      // Удаляем старые низкоприоритетные сообщения
      this.queue = this.queue.filter(m => m.priority !== "low").slice(-this.maxQueueSize * 0.9);
    }
    
    const fullMessage: AsyncMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      retryCount: 0,
    };
    
    // Добавляем с учётом приоритета
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    const insertIndex = this.queue.findIndex(
      m => priorityOrder[m.priority] > priorityOrder[fullMessage.priority]
    );
    
    if (insertIndex === -1) {
      this.queue.push(fullMessage);
    } else {
      this.queue.splice(insertIndex, 0, fullMessage);
    }
    
    // Запускаем обработку
    this.processQueue();
    
    return fullMessage.id;
  }
  
  /**
   * Подписаться на тип сообщений
   */
  subscribe(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }
  
  /**
   * Отписаться от сообщений
   */
  unsubscribe(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  /**
   * Обработать очередь
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const message = this.queue.shift();
      if (!message) break;
      
      const handlers = this.handlers.get(message.type) || [];
      
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          console.error(`Handler error for ${message.type}:`, error);
          
          // Retry logic
          if (message.retryCount < message.maxRetries) {
            message.retryCount++;
            this.queue.unshift(message);
            break;
          }
        }
      }
    }
    
    this.processing = false;
  }
  
  /**
   * Получить размер очереди
   */
  getQueueSize(): number {
    return this.queue.length;
  }
  
  /**
   * Очистить очередь
   */
  clear(): void {
    this.queue = [];
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Создать SignalIntegrator
 */
export function createSignalIntegrator(config?: Partial<IntegrationConfig>): SignalIntegrator {
  return new SignalIntegrator(config);
}

/**
 * Создать OrderAnalyzer
 */
export function createOrderAnalyzer(): OrderAnalyzer {
  return new OrderAnalyzer();
}

/**
 * Создать MessageQueue
 */
export function createMessageQueue(): MessageQueue {
  return new MessageQueue();
}

// ==================== EXPORT ====================

export {
  SignalIntegrator as default,
  TRAILING_STOP_PRESETS,
  RISK_PRESETS,
};
