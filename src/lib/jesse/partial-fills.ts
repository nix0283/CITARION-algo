/**
 * Partial Fills System
 * 
 * Система поддержки частичного исполнения ордеров.
 * Вдохновлено подходом Jesse (https://jesse.trade)
 * 
 * Partial fills - это ситуация, когда ордер исполняется
 * не полностью, а частями по разным ценам.
 * Это важно для реалистичного бэктестинга.
 * 
 * Особенности:
 * - Моделирование частичного исполнения
 * - Поддержка multiple fills
 * - Учёт slippage для каждого fill
 * - Интеграция с order book simulation
 * - Метрики исполнения ордеров
 * 
 * @see https://github.com/sjstheesar/jesse-trading-framework
 */

import { Candle } from "../strategy/types";

// ==================== TYPES ====================

/**
 * Статус ордера
 */
export type OrderStatus =
  | "pending"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected";

/**
 * Тип ордера
 */
export type OrderType =
  | "market"
  | "limit"
  | "stop_market"
  | "stop_limit"
  | "take_profit"
  | "trailing_stop";

/**
 * Направление ордера
 */
export type OrderSide = "buy" | "sell";

/**
 * Одна частичная сделка (fill)
 */
export interface OrderFill {
  /** Идентификатор fill */
  id: string;
  /** Цена исполнения */
  price: number;
  /** Размер исполненной части */
  size: number;
  /** Комиссия */
  fee: number;
  /** Время исполнения */
  timestamp: number;
  /** Slippage */
  slippage: number;
  /** Индекс свечи */
  candleIndex: number;
}

/**
 * Ордер с поддержкой partial fills
 */
export interface Order {
  /** Идентификатор */
  id: string;
  /** Символ */
  symbol: string;
  /** Тип ордера */
  type: OrderType;
  /** Направление */
  side: OrderSide;
  /** Размер ордера */
  size: number;
  /** Цена (для limit ордеров) */
  price?: number;
  /** Stop цена (для stop ордеров) */
  stopPrice?: number;
  /** Статус */
  status: OrderStatus;
  /** Частичные исполнения */
  fills: OrderFill[];
  /** Общий исполненный размер */
  filledSize: number;
  /** Средняя цена исполнения */
  avgPrice: number;
  /** Общая комиссия */
  totalFee: number;
  /** Время создания */
  createdAt: number;
  /** Время последнего обновления */
  updatedAt: number;
  /** Время полного исполнения */
  completedAt?: number;
  /** Причина отмены/отказа */
  reason?: string;
  /** Метаданные */
  metadata?: Record<string, unknown>;
}

/**
 * Конфигурация partial fills
 */
export interface PartialFillsConfig {
  /** Включить частичное исполнение */
  enabled: boolean;
  /** Минимальный размер fill (%) */
  minFillPercent: number;
  /** Максимальный slippage (%) */
  maxSlippage: number;
  /** Комиссия (%) */
  feePercent: number;
  /** Имитировать order book */
  simulateOrderBook: boolean;
  /** Глубина order book для симуляции */
  orderBookDepth: number;
  /** Случайность в размере fills */
  randomizeFillSize: boolean;
  /** Максимальное количество fills на ордер */
  maxFillsPerOrder: number;
  /** Задержка между fills (в свечах) */
  fillDelayCandles: number;
}

/**
 * Результат исполнения ордера
 */
export interface ExecutionResult {
  /** Ордер */
  order: Order;
  /** Было ли полное исполнение */
  fullyExecuted: boolean;
  /** Оставшийся размер */
  remainingSize: number;
  /** Метрики исполнения */
  metrics: ExecutionMetrics;
}

/**
 * Метрики исполнения ордера
 */
export interface ExecutionMetrics {
  /** Количество fills */
  fillCount: number;
  /** Средняя цена исполнения */
  avgPrice: number;
  /** Средний slippage */
  avgSlippage: number;
  /** Максимальный slippage */
  maxSlippage: number;
  /** Общая комиссия */
  totalFee: number;
  /** Эффективный спред */
  effectiveSpread: number;
  /** Время исполнения (свечи) */
  executionDuration: number;
  /** Процент исполнения */
  fillPercent: number;
}

/**
 * Уровень order book
 */
export interface OrderBookLevel {
  price: number;
  size: number;
}

/**
 * Имитация order book
 */
export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: PartialFillsConfig = {
  enabled: true,
  minFillPercent: 10,
  maxSlippage: 0.5,
  feePercent: 0.1,
  simulateOrderBook: true,
  orderBookDepth: 10,
  randomizeFillSize: true,
  maxFillsPerOrder: 5,
  fillDelayCandles: 0
};

// ==================== PARTIAL FILLS ENGINE ====================

/**
 * Движок частичного исполнения ордеров
 */
export class PartialFillsEngine {
  private config: PartialFillsConfig;
  private orders: Map<string, Order> = new Map();
  private orderCounter: number = 0;

  constructor(config: Partial<PartialFillsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Создать новый ордер
   */
  createOrder(params: {
    symbol: string;
    type: OrderType;
    side: OrderSide;
    size: number;
    price?: number;
    stopPrice?: number;
    metadata?: Record<string, unknown>;
  }): Order {
    const order: Order = {
      id: `order-${++this.orderCounter}`,
      symbol: params.symbol,
      type: params.type,
      side: params.side,
      size: params.size,
      price: params.price,
      stopPrice: params.stopPrice,
      status: "pending",
      fills: [],
      filledSize: 0,
      avgPrice: 0,
      totalFee: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: params.metadata
    };

    this.orders.set(order.id, order);
    return order;
  }

  /**
   * Исполнить ордер (полностью или частично)
   */
  executeOrder(
    order: Order,
    candle: Candle,
    orderBook?: OrderBookSnapshot
  ): ExecutionResult {
    if (order.status === "filled" || order.status === "cancelled") {
      return {
        order,
        fullyExecuted: order.status === "filled",
        remainingSize: order.size - order.filledSize,
        metrics: this.calculateMetrics(order)
      };
    }

    const remainingSize = order.size - order.filledSize;

    if (!this.config.enabled) {
      // Полное исполнение без partial fills
      return this.fillCompletely(order, candle);
    }

    // Симулируем order book или используем предоставленный
    const ob = orderBook || this.simulateOrderBook(candle);

    // Определяем цену исполнения
    const executionPrice = this.determineExecutionPrice(order, candle, ob);

    // Определяем размер fill
    const fillSize = this.determineFillSize(
      order,
      remainingSize,
      executionPrice,
      ob
    );

    if (fillSize <= 0) {
      return {
        order,
        fullyExecuted: false,
        remainingSize,
        metrics: this.calculateMetrics(order)
      };
    }

    // Создаём fill
    const slippage = this.calculateSlippage(order, candle, executionPrice);
    const fee = fillSize * executionPrice * (this.config.feePercent / 100);

    const fill: OrderFill = {
      id: `fill-${order.fills.length + 1}`,
      price: executionPrice,
      size: fillSize,
      fee,
      timestamp: Date.now(),
      slippage,
      candleIndex: 0 // Will be set by caller
    };

    // Обновляем ордер
    order.fills.push(fill);
    order.filledSize += fillSize;
    order.totalFee += fee;

    // Пересчитываем среднюю цену
    let totalValue = 0;
    let totalSize = 0;
    for (const f of order.fills) {
      totalValue += f.price * f.size;
      totalSize += f.size;
    }
    order.avgPrice = totalSize > 0 ? totalValue / totalSize : 0;

    order.updatedAt = Date.now();

    // Обновляем статус
    if (order.filledSize >= order.size * 0.999) {
      order.status = "filled";
      order.completedAt = Date.now();
    } else {
      order.status = "partially_filled";
    }

    return {
      order,
      fullyExecuted: order.status === "filled",
      remainingSize: order.size - order.filledSize,
      metrics: this.calculateMetrics(order)
    };
  }

  /**
   * Отменить ордер
   */
  cancelOrder(orderId: string, reason?: string): Order | null {
    const order = this.orders.get(orderId);
    if (!order) return null;

    if (order.status === "filled") {
      return order; // Нельзя отменить исполненный ордер
    }

    order.status = "cancelled";
    order.reason = reason || "User cancelled";
    order.updatedAt = Date.now();

    return order;
  }

  /**
   * Получить ордер по ID
   */
  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Получить все активные ордера
   */
  getActiveOrders(): Order[] {
    return Array.from(this.orders.values()).filter(
      o => o.status === "pending" || o.status === "partially_filled"
    );
  }

  /**
   * Получить все ордера
   */
  getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  /**
   * Очистить историю ордеров
   */
  clearOrders(): void {
    this.orders.clear();
    this.orderCounter = 0;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Полное исполнение ордера
   */
  private fillCompletely(order: Order, candle: Candle): ExecutionResult {
    const price = order.side === "buy" ? candle.high : candle.low;
    const slippage = this.calculateSlippage(order, candle, price);
    const executionPrice = order.side === "buy"
      ? price * (1 + slippage / 100)
      : price * (1 - slippage / 100);

    const fee = order.size * executionPrice * (this.config.feePercent / 100);

    const fill: OrderFill = {
      id: `fill-1`,
      price: executionPrice,
      size: order.size,
      fee,
      timestamp: Date.now(),
      slippage,
      candleIndex: 0
    };

    order.fills.push(fill);
    order.filledSize = order.size;
    order.avgPrice = executionPrice;
    order.totalFee = fee;
    order.status = "filled";
    order.completedAt = Date.now();
    order.updatedAt = Date.now();

    return {
      order,
      fullyExecuted: true,
      remainingSize: 0,
      metrics: this.calculateMetrics(order)
    };
  }

  /**
   * Определить цену исполнения
   */
  private determineExecutionPrice(
    order: Order,
    candle: Candle,
    orderBook: OrderBookSnapshot
  ): number {
    if (order.type === "limit" && order.price) {
      return order.price;
    }

    if (order.type === "stop_limit" && order.stopPrice && order.price) {
      return order.price;
    }

    // Для market ордеров используем order book
    if (order.side === "buy") {
      // Покупаем у asks
      const askLevels = orderBook.asks.sort((a, b) => a.price - b.price);
      return askLevels.length > 0 ? askLevels[0].price : candle.close;
    } else {
      // Продаём у bids
      const bidLevels = orderBook.bids.sort((a, b) => b.price - a.price);
      return bidLevels.length > 0 ? bidLevels[0].price : candle.close;
    }
  }

  /**
   * Определить размер fill
   */
  private determineFillSize(
    order: Order,
    remainingSize: number,
    price: number,
    orderBook: OrderBookSnapshot
  ): number {
    if (!this.config.simulateOrderBook) {
      // Без order book - полное исполнение
      return remainingSize;
    }

    // Находим доступную ликвидность на уровне цены
    const levels = order.side === "buy" ? orderBook.asks : orderBook.bids;
    const sortedLevels = order.side === "buy"
      ? levels.sort((a, b) => a.price - b.price)
      : levels.sort((a, b) => b.price - a.price);

    let availableLiquidity = 0;
    const priceThreshold = price * (order.side === "buy" ? 1.001 : 0.999);

    for (const level of sortedLevels) {
      if (order.side === "buy" && level.price <= priceThreshold) {
        availableLiquidity += level.size;
      } else if (order.side === "sell" && level.price >= priceThreshold) {
        availableLiquidity += level.size;
      }
    }

    // Определяем размер fill
    let fillSize = Math.min(remainingSize, availableLiquidity);

    if (this.config.randomizeFillSize && fillSize > 0) {
      // Случайное количество от minFillPercent до 100%
      const minFill = remainingSize * (this.config.minFillPercent / 100);
      const randomFill = minFill + Math.random() * (remainingSize - minFill);
      fillSize = Math.min(fillSize, randomFill);
    }

    // Ограничиваем минимальным процентом
    const minFill = remainingSize * (this.config.minFillPercent / 100);
    fillSize = Math.max(fillSize, minFill);

    return Math.min(fillSize, remainingSize);
  }

  /**
   * Рассчитать slippage
   */
  private calculateSlippage(
    order: Order,
    candle: Candle,
    executionPrice: number
  ): number {
    const basePrice = candle.close;
    const actualSlippage = Math.abs(executionPrice - basePrice) / basePrice * 100;

    return Math.min(actualSlippage, this.config.maxSlippage);
  }

  /**
   * Симулировать order book
   */
  private simulateOrderBook(candle: Candle): OrderBookSnapshot {
    const midPrice = candle.close;
    const spread = (candle.high - candle.low) / midPrice * 0.1; // 10% от range

    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    // Генерируем уровни
    for (let i = 0; i < this.config.orderBookDepth; i++) {
      const bidPrice = midPrice * (1 - spread * (i + 1) / this.config.orderBookDepth);
      const askPrice = midPrice * (1 + spread * (i + 1) / this.config.orderBookDepth);

      // Случайный размер с убыванием по глубине
      const baseSize = candle.volume * 0.1;
      const randomFactor = 0.5 + Math.random();

      bids.push({
        price: bidPrice,
        size: baseSize * randomFactor * (1 - i / this.config.orderBookDepth)
      });

      asks.push({
        price: askPrice,
        size: baseSize * randomFactor * (1 - i / this.config.orderBookDepth)
      });
    }

    return {
      bids,
      asks,
      timestamp: Date.now()
    };
  }

  /**
   * Рассчитать метрики исполнения
   */
  private calculateMetrics(order: Order): ExecutionMetrics {
    const fills = order.fills;

    if (fills.length === 0) {
      return {
        fillCount: 0,
        avgPrice: 0,
        avgSlippage: 0,
        maxSlippage: 0,
        totalFee: 0,
        effectiveSpread: 0,
        executionDuration: 0,
        fillPercent: 0
      };
    }

    const avgSlippage = fills.reduce((sum, f) => sum + f.slippage, 0) / fills.length;
    const maxSlippage = Math.max(...fills.map(f => f.slippage));

    const firstFill = fills[0];
    const lastFill = fills[fills.length - 1];
    const duration = lastFill.candleIndex - firstFill.candleIndex;

    return {
      fillCount: fills.length,
      avgPrice: order.avgPrice,
      avgSlippage,
      maxSlippage,
      totalFee: order.totalFee,
      effectiveSpread: avgSlippage * 2,
      executionDuration: duration,
      fillPercent: (order.filledSize / order.size) * 100
    };
  }
}

// ==================== POSITION WITH PARTIAL FILLS ====================

/**
 * Позиция с поддержкой частичных открытий и закрытий
 */
export class PartialPosition {
  private symbol: string;
  private side: "long" | "short";
  private totalSize: number = 0;
  private entries: OrderFill[] = [];
  private exits: OrderFill[] = [];
  private avgEntryPrice: number = 0;
  private avgExitPrice: number = 0;
  private totalFees: number = 0;
  private openTime: number;
  private closeTime?: number;

  constructor(symbol: string, side: "long" | "short") {
    this.symbol = symbol;
    this.side = side;
    this.openTime = Date.now();
  }

  /**
   * Добавить вход (entry fill)
   */
  addEntry(fill: OrderFill): void {
    this.entries.push(fill);

    // Пересчитываем среднюю цену входа
    let totalValue = 0;
    let totalSize = 0;
    for (const e of this.entries) {
      totalValue += e.price * e.size;
      totalSize += e.size;
    }
    this.avgEntryPrice = totalSize > 0 ? totalValue / totalSize : 0;
    this.totalSize += fill.size;
    this.totalFees += fill.fee;
  }

  /**
   * Добавить выход (exit fill)
   */
  addExit(fill: OrderFill): void {
    this.exits.push(fill);

    // Пересчитываем среднюю цену выхода
    let totalValue = 0;
    let totalSize = 0;
    for (const e of this.exits) {
      totalValue += e.price * e.size;
      totalSize += e.size;
    }
    this.avgExitPrice = totalSize > 0 ? totalValue / totalSize : 0;
    this.totalSize -= fill.size;
    this.totalFees += fill.fee;

    if (this.totalSize <= 0) {
      this.closeTime = Date.now();
    }
  }

  /**
   * Получить PnL
   */
  getPnL(currentPrice: number): number {
    const totalEntryValue = this.entries.reduce((sum, e) => sum + e.price * e.size, 0);
    const currentValue = this.totalSize * currentPrice;

    if (this.side === "long") {
      return currentValue - totalEntryValue - this.totalFees;
    } else {
      return totalEntryValue - currentValue - this.totalFees;
    }
  }

  /**
   * Получить PnL%
   */
  getPnLPercent(currentPrice: number): number {
    const totalEntryValue = this.entries.reduce((sum, e) => sum + e.price * e.size, 0);
    const pnl = this.getPnL(currentPrice);

    return totalEntryValue > 0 ? (pnl / totalEntryValue) * 100 : 0;
  }

  /**
   * Позиция закрыта?
   */
  isClosed(): boolean {
    return this.totalSize <= 0;
  }

  /**
   * Получить информацию о позиции
   */
  getInfo(): {
    symbol: string;
    side: "long" | "short";
    totalSize: number;
    avgEntryPrice: number;
    avgExitPrice: number;
    totalFees: number;
    entryCount: number;
    exitCount: number;
    openTime: number;
    closeTime?: number;
  } {
    return {
      symbol: this.symbol,
      side: this.side,
      totalSize: this.totalSize,
      avgEntryPrice: this.avgEntryPrice,
      avgExitPrice: this.avgExitPrice,
      totalFees: this.totalFees,
      entryCount: this.entries.length,
      exitCount: this.exits.length,
      openTime: this.openTime,
      closeTime: this.closeTime
    };
  }
}

// ==================== EXECUTION STATISTICS ====================

/**
 * Статистика исполнения ордеров
 */
export class ExecutionStatistics {
  private fills: OrderFill[] = [];
  private orders: Order[] = [];

  /**
   * Добавить ордер в статистику
   */
  recordOrder(order: Order): void {
    this.orders.push(order);
    this.fills.push(...order.fills);
  }

  /**
   * Получить общую статистику
   */
  getSummary(): {
    totalOrders: number;
    totalFills: number;
    avgFillsPerOrder: number;
    avgSlippage: number;
    maxSlippage: number;
    avgFillSize: number;
    totalFees: number;
    avgFeePercent: number;
    partialFillRate: number;
    avgExecutionDuration: number;
  } {
    const partialOrders = this.orders.filter(o => o.fills.length > 1);

    const totalSlippage = this.fills.reduce((sum, f) => sum + f.slippage, 0);
    const totalFeeValue = this.fills.reduce((sum, f) => sum + f.fee, 0);
    const totalFillSize = this.fills.reduce((sum, f) => sum + f.size, 0);
    const totalFillValue = this.fills.reduce((sum, f) => sum + f.size * f.price, 0);

    const executionDurations = this.orders.map(o => {
      if (o.fills.length < 2) return 0;
      const first = o.fills[0];
      const last = o.fills[o.fills.length - 1];
      return last.candleIndex - first.candleIndex;
    });

    return {
      totalOrders: this.orders.length,
      totalFills: this.fills.length,
      avgFillsPerOrder: this.orders.length > 0
        ? this.fills.length / this.orders.length
        : 0,
      avgSlippage: this.fills.length > 0
        ? totalSlippage / this.fills.length
        : 0,
      maxSlippage: this.fills.length > 0
        ? Math.max(...this.fills.map(f => f.slippage))
        : 0,
      avgFillSize: this.fills.length > 0
        ? totalFillSize / this.fills.length
        : 0,
      totalFees: totalFeeValue,
      avgFeePercent: totalFillValue > 0
        ? (totalFeeValue / totalFillValue) * 100
        : 0,
      partialFillRate: this.orders.length > 0
        ? (partialOrders.length / this.orders.length) * 100
        : 0,
      avgExecutionDuration: executionDurations.length > 0
        ? executionDurations.reduce((a, b) => a + b, 0) / executionDurations.length
        : 0
    };
  }

  /**
   * Очистить статистику
   */
  clear(): void {
    this.fills = [];
    this.orders = [];
  }
}

// ==================== EXPORTS ====================

export {
  PartialFillsEngine,
  PartialPosition,
  ExecutionStatistics,
  DEFAULT_CONFIG
};
