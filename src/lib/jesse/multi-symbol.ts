/**
 * Multi-Symbol Strategy System
 * 
 * Система для торговли несколькими инструментами одновременно.
 * Вдохновлено подходом Jesse (https://jesse.trade)
 * 
 * Multi-symbol стратегии позволяют:
 * - Диверсификацию портфеля
 * - Pairs trading
 * - Portfolio rebalancing
 * - Корреляционный анализ
 * - Cross-market arbitrage
 * 
 * Особенности:
 * - Поддержка "routes" (символ/таймфрейм комбинации)
 * - Общие переменные между символами
 * - Координация действий между маршрутами
 * - Корреляционная матрица
 * - Cross-route события
 * 
 * @see https://deepwiki.com/jesse-ai/gpt-instructions/3.10-multi-strategy-coordination
 */

import { Candle, SignalType } from "../strategy/types";

// ==================== TYPES ====================

/**
 * Маршрут (route) - комбинация символ/таймфрейм
 */
export interface Route {
  /** Идентификатор маршрута */
  id: string;
  /** Символ */
  symbol: string;
  /** Таймфрейм */
  timeframe: string;
  /** Включён ли маршрут */
  enabled: boolean;
  /** Свечи для маршрута */
  candles: Candle[];
  /** Текущий индекс */
  currentIndex: number;
}

/**
 * Сигнал для маршрута
 */
export interface RouteSignal {
  /** Маршрут */
  routeId: string;
  /** Тип сигнала */
  type: SignalType;
  /** Цена */
  price: number;
  /** Размер */
  size?: number;
  /** Уверенность */
  confidence?: number;
  /** Причина */
  reason?: string;
  /** Временная метка */
  timestamp: number;
  /** Метаданные */
  metadata?: Record<string, unknown>;
}

/**
 * Позиция для маршрута
 */
export interface RoutePosition {
  /** Маршрут */
  routeId: string;
  /** Направление */
  direction: "LONG" | "SHORT" | "NONE";
  /** Размер */
  size: number;
  /** Средняя цена входа */
  avgEntryPrice: number;
  /** Текущая цена */
  currentPrice: number;
  /** PnL */
  unrealizedPnl: number;
  /** PnL% */
  pnlPercent: number;
  /** Время открытия */
  openedAt?: number;
}

/**
 * Общие переменные между маршрутами
 */
export interface SharedVariables {
  /** Переменные */
  [key: string]: unknown;
}

/**
 * Событие маршрута
 */
export interface RouteEvent {
  /** Тип события */
  type: "signal" | "position_opened" | "position_closed" | "stop_hit" | "tp_hit" | "custom";
  /** Маршрут-источник */
  sourceRouteId: string;
  /** Данные события */
  data: Record<string, unknown>;
  /** Временная метка */
  timestamp: number;
}

/**
 * Корреляционные данные
 */
export interface CorrelationData {
  /** Пара символов */
  pair: [string, string];
  /** Коэффициент корреляции */
  correlation: number;
  /** Период расчёта */
  period: number;
  /** Временная метка */
  timestamp: number;
}

/**
 * Конфигурация multi-symbol стратегии
 */
export interface MultiSymbolConfig {
  /** Маршруты */
  routes: Route[];
  /** Максимальное количество открытых позиций */
  maxOpenPositions: number;
  /** Максимальная корреляция между позициями */
  maxCorrelation: number;
  /** Использовать общие переменные */
  useSharedVariables: boolean;
  /** Обрабатывать события маршрутов */
  enableCrossRouteEvents: boolean;
  /** Период расчёта корреляции */
  correlationPeriod: number;
}

/**
 * Результат анализа портфеля
 */
export interface PortfolioAnalysis {
  /** Общий PnL */
  totalPnl: number;
  /** Общий PnL% */
  totalPnlPercent: number;
  /** Количество открытых позиций */
  openPositions: number;
  /** Распределение по символам */
  symbolDistribution: Record<string, number>;
  /** Корреляционная матрица */
  correlationMatrix: Record<string, Record<string, number>>;
  /// Риск портфеля */
  portfolioRisk: number;
  /// Диверсификация */
  diversificationScore: number;
}

// ==================== MULTI-SYMBOL ENGINE ====================

/**
 * Движок multi-symbol стратегий
 */
export class MultiSymbolEngine {
  private routes: Map<string, Route> = new Map();
  private positions: Map<string, RoutePosition> = new Map();
  private sharedVariables: SharedVariables = {};
  private events: RouteEvent[] = [];
  private correlations: Map<string, CorrelationData> = new Map();
  private config: MultiSymbolConfig;

  constructor(config: MultiSymbolConfig) {
    this.config = config;

    for (const route of config.routes) {
      this.routes.set(route.id, { ...route, candles: [], currentIndex: 0 });
      this.positions.set(route.id, {
        routeId: route.id,
        direction: "NONE",
        size: 0,
        avgEntryPrice: 0,
        currentPrice: 0,
        unrealizedPnl: 0,
        pnlPercent: 0
      });
    }
  }

  /**
   * Добавить маршрут
   */
  addRoute(route: Route): void {
    this.routes.set(route.id, { ...route, candles: [], currentIndex: 0 });
    this.positions.set(route.id, {
      routeId: route.id,
      direction: "NONE",
      size: 0,
      avgEntryPrice: 0,
      currentPrice: 0,
      unrealizedPnl: 0,
      pnlPercent: 0
    });
  }

  /**
   * Удалить маршрут
   */
  removeRoute(routeId: string): void {
    this.routes.delete(routeId);
    this.positions.delete(routeId);
  }

  /**
   * Обновить свечи для маршрута
   */
  updateCandles(routeId: string, candles: Candle[]): void {
    const route = this.routes.get(routeId);
    if (route) {
      route.candles = candles;
      route.currentIndex = candles.length - 1;
    }
  }

  /**
   * Добавить свечу к маршруту
   */
  addCandle(routeId: string, candle: Candle): void {
    const route = this.routes.get(routeId);
    if (route) {
      route.candles.push(candle);
      route.currentIndex = route.candles.length - 1;
    }
  }

  /**
   * Получить маршрут
   */
  getRoute(routeId: string): Route | undefined {
    return this.routes.get(routeId);
  }

  /**
   * Получить все маршруты
   */
  getRoutes(): Route[] {
    return Array.from(this.routes.values());
  }

  /**
   * Получить позицию для маршрута
   */
  getPosition(routeId: string): RoutePosition | undefined {
    return this.positions.get(routeId);
  }

  /**
   * Получить все позиции
   */
  getPositions(): RoutePosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Получить открытые позиции
   */
  getOpenPositions(): RoutePosition[] {
    return Array.from(this.positions.values()).filter(p => p.direction !== "NONE");
  }

  // ==================== SHARED VARIABLES ====================

  /**
   * Установить общую переменную
   */
  setSharedVariable(key: string, value: unknown): void {
    this.sharedVariables[key] = value;
  }

  /**
   * Получить общую переменную
   */
  getSharedVariable<T = unknown>(key: string): T | undefined {
    return this.sharedVariables[key] as T | undefined;
  }

  /**
   * Получить все общие переменные
   */
  getSharedVariables(): SharedVariables {
    return { ...this.sharedVariables };
  }

  /**
   * Очистить общие переменные
   */
  clearSharedVariables(): void {
    this.sharedVariables = {};
  }

  // ==================== EVENTS ====================

  /**
   * Отправить событие маршрута
   */
  emitEvent(event: Omit<RouteEvent, "timestamp">): void {
    this.events.push({
      ...event,
      timestamp: Date.now()
    });
  }

  /**
   * Получить события
   */
  getEvents(since?: number): RouteEvent[] {
    if (since) {
      return this.events.filter(e => e.timestamp >= since);
    }
    return [...this.events];
  }

  /**
   * Получить события для маршрута
   */
  getEventsForRoute(routeId: string, since?: number): RouteEvent[] {
    return this.getEvents(since).filter(e =>
      e.sourceRouteId === routeId ||
      (e.data.targetRouteId && e.data.targetRouteId === routeId)
    );
  }

  /**
   * Очистить события
   */
  clearEvents(): void {
    this.events = [];
  }

  // ==================== CORRELATIONS ====================

  /**
   * Рассчитать корреляцию между двумя маршрутами
   */
  calculateCorrelation(routeId1: string, routeId2: string): number {
    const route1 = this.routes.get(routeId1);
    const route2 = this.routes.get(routeId2);

    if (!route1 || !route2) return 0;

    const returns1 = this.calculateReturns(route1.candles);
    const returns2 = this.calculateReturns(route2.candles);

    const minLength = Math.min(returns1.length, returns2.length);
    if (minLength < this.config.correlationPeriod) return 0;

    // Берём последние N значений
    const r1 = returns1.slice(-minLength);
    const r2 = returns2.slice(-minLength);

    return this.pearsonCorrelation(r1, r2);
  }

  /**
   * Рассчитать корреляционную матрицу
   */
  calculateCorrelationMatrix(): Record<string, Record<string, number>> {
    const routeIds = Array.from(this.routes.keys());
    const matrix: Record<string, Record<string, number>> = {};

    for (const id1 of routeIds) {
      matrix[id1] = {};
      for (const id2 of routeIds) {
        if (id1 === id2) {
          matrix[id1][id2] = 1;
        } else {
          const correlation = this.calculateCorrelation(id1, id2);
          matrix[id1][id2] = correlation;

          // Сохраняем в кэш
          const key = [id1, id2].sort().join("-");
          this.correlations.set(key, {
            pair: [id1, id2],
            correlation,
            period: this.config.correlationPeriod,
            timestamp: Date.now()
          });
        }
      }
    }

    return matrix;
  }

  /**
   * Получить корреляцию из кэша
   */
  getCachedCorrelation(routeId1: string, routeId2: string): number | undefined {
    const key = [routeId1, routeId2].sort().join("-");
    return this.correlations.get(key)?.correlation;
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Открыть позицию
   */
  openPosition(
    routeId: string,
    direction: "LONG" | "SHORT",
    size: number,
    price: number
  ): RoutePosition | null {
    // Проверяем лимит позиций
    const openPositions = this.getOpenPositions();
    if (openPositions.length >= this.config.maxOpenPositions) {
      return null;
    }

    // Проверяем корреляцию с существующими позициями
    if (this.config.maxCorrelation < 1) {
      for (const pos of openPositions) {
        const correlation = this.getCachedCorrelation(routeId, pos.routeId);
        if (correlation !== undefined && Math.abs(correlation) > this.config.maxCorrelation) {
          // Слишком высокая корреляция
          return null;
        }
      }
    }

    const position = this.positions.get(routeId);
    if (!position) return null;

    position.direction = direction;
    position.size = size;
    position.avgEntryPrice = price;
    position.currentPrice = price;
    position.openedAt = Date.now();

    this.emitEvent({
      type: "position_opened",
      sourceRouteId: routeId,
      data: { direction, size, price }
    });

    return position;
  }

  /**
   * Закрыть позицию
   */
  closePosition(routeId: string, price: number): RoutePosition | null {
    const position = this.positions.get(routeId);
    if (!position || position.direction === "NONE") return null;

    const pnl = this.calculatePnL(position, price);

    this.emitEvent({
      type: "position_closed",
      sourceRouteId: routeId,
      data: {
        direction: position.direction,
        size: position.size,
        entryPrice: position.avgEntryPrice,
        exitPrice: price,
        pnl
      }
    });

    position.direction = "NONE";
    position.size = 0;
    position.unrealizedPnl = pnl;
    position.pnlPercent = (pnl / (position.avgEntryPrice * position.size)) * 100;

    return position;
  }

  /**
   * Обновить позицию текущей ценой
   */
  updatePositionPrice(routeId: string, currentPrice: number): void {
    const position = this.positions.get(routeId);
    if (!position || position.direction === "NONE") return;

    position.currentPrice = currentPrice;
    position.unrealizedPnl = this.calculatePnL(position, currentPrice);
    position.pnlPercent = (position.unrealizedPnl / (position.avgEntryPrice * position.size)) * 100;
  }

  // ==================== PORTFOLIO ANALYSIS ====================

  /**
   * Анализ портфеля
   */
  analyzePortfolio(): PortfolioAnalysis {
    const positions = this.getOpenPositions();
    const routes = this.getRoutes();

    // Общий PnL
    let totalPnl = 0;
    let totalValue = 0;

    for (const position of positions) {
      totalPnl += position.unrealizedPnl;
      totalValue += position.avgEntryPrice * position.size;
    }

    // Распределение по символам
    const symbolDistribution: Record<string, number> = {};
    for (const route of routes) {
      const position = this.positions.get(route.id);
      if (position && position.direction !== "NONE") {
        symbolDistribution[route.symbol] = (symbolDistribution[route.symbol] || 0) + position.size;
      }
    }

    // Корреляционная матрица
    const correlationMatrix = this.calculateCorrelationMatrix();

    // Риск портфеля (на основе корреляций)
    let portfolioRisk = 0;
    if (positions.length > 1) {
      let sumCorrelations = 0;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const corr = this.getCachedCorrelation(positions[i].routeId, positions[j].routeId);
          if (corr !== undefined) {
            sumCorrelations += Math.abs(corr);
          }
        }
      }
      const pairCount = (positions.length * (positions.length - 1)) / 2;
      portfolioRisk = pairCount > 0 ? sumCorrelations / pairCount : 0;
    }

    // Оценка диверсификации
    const diversificationScore = Math.max(0, 1 - portfolioRisk);

    return {
      totalPnl,
      totalPnlPercent: totalValue > 0 ? (totalPnl / totalValue) * 100 : 0,
      openPositions: positions.length,
      symbolDistribution,
      correlationMatrix,
      portfolioRisk,
      diversificationScore
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Рассчитать доходности
   */
  private calculateReturns(candles: Candle[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const ret = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
      returns.push(ret);
    }
    return returns;
  }

  /**
   * Корреляция Пирсона
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Рассчитать PnL позиции
   */
  private calculatePnL(position: RoutePosition, currentPrice: number): number {
    if (position.direction === "NONE") return 0;

    if (position.direction === "LONG") {
      return (currentPrice - position.avgEntryPrice) * position.size;
    } else {
      return (position.avgEntryPrice - currentPrice) * position.size;
    }
  }
}

// ==================== PAIRS TRADING ====================

/**
 * Параметры pairs trading
 */
export interface PairsTradingParams {
  /** Маршрут 1 */
  routeId1: string;
  /** Маршрут 2 */
  routeId2: string;
  /** Период lookback */
  lookbackPeriod: number;
  /** Порог z-score для входа */
  entryZScore: number;
  /** Порог z-score для выхода */
  exitZScore: number;
  /** Размер позиции */
  positionSize: number;
}

/**
 * Сигнал pairs trading
 */
export interface PairsSignal {
  /** Тип спреда */
  spreadType: "long_short" | "short_long" | "exit_long_short" | "exit_short_long" | "none";
  /** Z-score */
  zScore: number;
  /** Спред */
  spread: number;
  /** Средний спред */
  meanSpread: number;
  /** Std спред */
  stdSpread: number;
  /** Корреляция */
  correlation: number;
}

/**
 * Стратегия pairs trading
 */
export class PairsTradingStrategy {
  private engine: MultiSymbolEngine;

  constructor(engine: MultiSymbolEngine) {
    this.engine = engine;
  }

  /**
   * Рассчитать спред между двумя инструментами
   */
  calculateSpread(routeId1: string, routeId2: string, lookback: number): {
    spread: number[];
    mean: number;
    std: number;
    zScore: number;
    correlation: number;
  } {
    const route1 = this.engine.getRoute(routeId1);
    const route2 = this.engine.getRoute(routeId2);

    if (!route1 || !route2) {
      return { spread: [], mean: 0, std: 0, zScore: 0, correlation: 0 };
    }

    const closes1 = route1.candles.map(c => c.close);
    const closes2 = route2.candles.map(c => c.close);

    const minLength = Math.min(closes1.length, closes2.length);
    const spread: number[] = [];

    for (let i = 0; i < minLength; i++) {
      spread.push(closes1[i] - closes2[i]);
    }

    // Берём последние lookback значений
    const recentSpread = spread.slice(-lookback);
    const mean = recentSpread.reduce((a, b) => a + b, 0) / recentSpread.length;
    const variance = recentSpread.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentSpread.length;
    const std = Math.sqrt(variance);

    const currentSpread = spread[spread.length - 1];
    const zScore = std > 0 ? (currentSpread - mean) / std : 0;

    const correlation = this.engine.calculateCorrelation(routeId1, routeId2);

    return { spread, mean, std, zScore, correlation };
  }

  /**
   * Сгенерировать сигнал pairs trading
   */
  generateSignal(params: PairsTradingParams): PairsSignal {
    const { routeId1, routeId2, lookbackPeriod, entryZScore, exitZScore } = params;

    const { zScore, spread, mean, std, correlation } = this.calculateSpread(
      routeId1,
      routeId2,
      lookbackPeriod
    );

    const pos1 = this.engine.getPosition(routeId1);
    const pos2 = this.engine.getPosition(routeId2);

    const hasLongShort = pos1?.direction === "LONG" && pos2?.direction === "SHORT";
    const hasShortLong = pos1?.direction === "SHORT" && pos2?.direction === "LONG";

    let spreadType: PairsSignal["spreadType"] = "none";

    // Если нет позиций
    if (!hasLongShort && !hasShortLong) {
      if (zScore > entryZScore) {
        // Спред высокий - продавать спред (short 1, long 2)
        spreadType = "short_long";
      } else if (zScore < -entryZScore) {
        // Спред низкий - покупать спред (long 1, short 2)
        spreadType = "long_short";
      }
    }
    // Если есть позиция long_short
    else if (hasLongShort) {
      if (zScore > -exitZScore) {
        spreadType = "exit_long_short";
      }
    }
    // Если есть позиция short_long
    else if (hasShortLong) {
      if (zScore < exitZScore) {
        spreadType = "exit_short_long";
      }
    }

    return {
      spreadType,
      zScore,
      spread,
      meanSpread: mean,
      stdSpread: std,
      correlation
    };
  }

  /**
   * Исполнить сигнал pairs trading
   */
  executeSignal(
    params: PairsTradingParams,
    signal: PairsSignal,
    price1: number,
    price2: number
  ): boolean {
    const { routeId1, routeId2, positionSize } = params;

    switch (signal.spreadType) {
      case "long_short":
        this.engine.openPosition(routeId1, "LONG", positionSize, price1);
        this.engine.openPosition(routeId2, "SHORT", positionSize, price2);
        return true;

      case "short_long":
        this.engine.openPosition(routeId1, "SHORT", positionSize, price1);
        this.engine.openPosition(routeId2, "LONG", positionSize, price2);
        return true;

      case "exit_long_short":
        this.engine.closePosition(routeId1, price1);
        this.engine.closePosition(routeId2, price2);
        return true;

      case "exit_short_long":
        this.engine.closePosition(routeId1, price1);
        this.engine.closePosition(routeId2, price2);
        return true;

      default:
        return false;
    }
  }
}

// ==================== PORTFOLIO REBALANCING ====================

/**
 * Параметры ребалансировки
 */
export interface RebalanceParams {
  /** Целевые веса */
  targetWeights: Record<string, number>;
  /** Порог отклонения для ребалансировки */
  threshold: number;
  /// Размер портфеля */
  portfolioValue: number;
}

/**
 * Действие ребалансировки
 */
export interface RebalanceAction {
  /** Маршрут */
  routeId: string;
  /** Символ */
  symbol: string;
  /** Действие */
  action: "buy" | "sell";
  /** Размер */
  size: number;
  /** Текущий вес */
  currentWeight: number;
  /** Целевой вес */
  targetWeight: number;
}

/**
 * Стратегия ребалансировки портфеля
 */
export class PortfolioRebalancing {
  private engine: MultiSymbolEngine;

  constructor(engine: MultiSymbolEngine) {
    this.engine = engine;
  }

  /**
   * Рассчитать текущие веса портфеля
   */
  calculateCurrentWeights(): Record<string, number> {
    const positions = this.engine.getOpenPositions();
    const routes = this.engine.getRoutes();

    let totalValue = 0;
    const values: Record<string, number> = {};

    for (const route of routes) {
      const position = this.engine.getPosition(route.id);
      if (position && position.direction !== "NONE") {
        const value = position.size * position.currentPrice;
        values[route.id] = value;
        totalValue += value;
      }
    }

    const weights: Record<string, number> = {};
    for (const routeId of Object.keys(values)) {
      weights[routeId] = totalValue > 0 ? values[routeId] / totalValue : 0;
    }

    return weights;
  }

  /**
   * Определить необходимые действия для ребалансировки
   */
  determineRebalanceActions(params: RebalanceParams): RebalanceAction[] {
    const currentWeights = this.calculateCurrentWeights();
    const actions: RebalanceAction[] = [];
    const routes = this.engine.getRoutes();

    for (const route of routes) {
      const targetWeight = params.targetWeights[route.id] || 0;
      const currentWeight = currentWeights[route.id] || 0;
      const deviation = Math.abs(targetWeight - currentWeight);

      if (deviation > params.threshold) {
        const targetValue = params.portfolioValue * targetWeight;
        const currentValue = params.portfolioValue * currentWeight;
        const diff = targetValue - currentValue;

        const position = this.engine.getPosition(route.id);
        const price = position?.currentPrice || 0;

        if (price > 0) {
          const size = Math.abs(diff) / price;

          actions.push({
            routeId: route.id,
            symbol: route.symbol,
            action: diff > 0 ? "buy" : "sell",
            size,
            currentWeight,
            targetWeight
          });
        }
      }
    }

    return actions;
  }

  /**
   * Проверить нужна ли ребалансировка
   */
  needsRebalancing(params: RebalanceParams): boolean {
    const currentWeights = this.calculateCurrentWeights();

    for (const [routeId, targetWeight] of Object.entries(params.targetWeights)) {
      const currentWeight = currentWeights[routeId] || 0;
      if (Math.abs(targetWeight - currentWeight) > params.threshold) {
        return true;
      }
    }

    return false;
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Создать multi-symbol движок
 */
export function createMultiSymbolEngine(
  routes: Array<{
    symbol: string;
    timeframe: string;
    enabled?: boolean;
  }>,
  config?: Partial<MultiSymbolConfig>
): MultiSymbolEngine {
  const fullRoutes: Route[] = routes.map((r, i) => ({
    id: `route-${i}-${r.symbol}-${r.timeframe}`,
    symbol: r.symbol,
    timeframe: r.timeframe,
    enabled: r.enabled ?? true,
    candles: [],
    currentIndex: 0
  }));

  return new MultiSymbolEngine({
    routes: fullRoutes,
    maxOpenPositions: 5,
    maxCorrelation: 0.7,
    useSharedVariables: true,
    enableCrossRouteEvents: true,
    correlationPeriod: 20,
    ...config
  });
}

// ==================== EXPORTS ====================

export {
  MultiSymbolEngine,
  PairsTradingStrategy,
  PortfolioRebalancing
};
