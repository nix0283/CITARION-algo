/**
 * Bot Adapters
 * 
 * Универсальные адаптеры для интеграции Grid Bot, DCA Bot, BBot
 * с Backtesting и Paper Trading системами.
 * 
 * Позволяет:
 * - Тестировать ботов на исторических данных
 * - Запускать ботов в Paper Trading режиме
 * - Получать метрики и кривую эквити
 */

import { Candle, Timeframe } from "../strategy/types";
import { 
  BotPosition, 
  BotTrade, 
  BotEquityPoint, 
  BotLogEntry,
  BotMode,
} from "../strategy-bot/types";

// ==================== COMMON TYPES ====================

/**
 * Тип бота
 */
export type BotType = "GRID" | "DCA" | "BBOT" | "ARGUS" | "STRATEGY";

/**
 * Базовая конфигурация для любого бота
 */
export interface BaseBotConfig {
  id: string;
  name: string;
  type: BotType;
  symbol: string;
  isActive: boolean;
  
  // Risk Management
  initialBalance: number;
  maxDrawdown?: number;
  takeProfit?: number;
  stopLoss?: number;
  
  // Mode
  mode: BotMode;
  accountId?: string;
}

/**
 * Результат симуляции бота
 */
export interface BotSimulationResult {
  botId: string;
  botType: BotType;
  mode: BotMode;
  
  // Performance
  initialBalance: number;
  finalBalance: number;
  finalEquity: number;
  totalPnl: number;
  totalPnlPercent: number;
  
  // Metrics
  metrics: BotSimulationMetrics;
  
  // Data
  trades: BotTrade[];
  equityCurve: BotEquityPoint[];
  positions: BotPosition[];
  
  // Timing
  startedAt: Date;
  completedAt: Date;
  duration: number;
  
  // Logs
  logs: BotLogEntry[];
}

/**
 * Метрики симуляции
 */
export interface BotSimulationMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  totalPnl: number;
  totalPnlPercent: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
  maxLoss: number;
  
  profitFactor: number;
  riskRewardRatio: number;
  
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  sharpeRatio: number;
  calmarRatio: number;
  
  avgTradeDuration: number;
  tradingDays: number;
}

// ==================== GRID BOT ADAPTER ====================

/**
 * Конфигурация Grid Bot для симуляции
 */
export interface GridBotSimulationConfig extends BaseBotConfig {
  type: "GRID";
  
  // Grid Settings
  upperPrice: number;
  lowerPrice: number;
  gridCount: number;
  gridType: "ARITHMETIC" | "GEOMETRIC";
  direction: "LONG" | "SHORT" | "NEUTRAL";
  
  // Position
  totalInvestment: number;
  perGridAmount?: number;
  leverage: number;
}

/**
 * Адаптер для симуляции Grid Bot
 */
export class GridBotSimulator {
  private config: GridBotSimulationConfig;
  private balance: number;
  private equity: number;
  private maxEquity: number;
  private gridLevels: number[] = [];
  private gridOrders: Map<number, GridOrder> = new Map();
  private positions: BotPosition[] = [];
  private trades: BotTrade[] = [];
  private equityCurve: BotEquityPoint[] = [];
  private logs: BotLogEntry[] = [];
  private positionIdCounter: number = 0;

  constructor(config: GridBotSimulationConfig) {
    this.config = config;
    this.balance = config.initialBalance;
    this.equity = config.initialBalance;
    this.maxEquity = config.initialBalance;
    this.calculateGridLevels();
  }

  /**
   * Запустить симуляцию на исторических данных
   */
  async runBacktest(candles: Candle[]): Promise<BotSimulationResult> {
    const startedAt = new Date();
    this.log("INFO", `Starting Grid Bot backtest with ${candles.length} candles`);

    // Инициализируем грид-ордера
    this.initializeGridOrders(candles[0].close);

    // Проходим по всем свечам
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      
      // Проверяем исполнение ордеров
      this.processCandle(candle, i);

      // Обновляем эквити
      this.updateEquity(candle.close, i);

      // Проверяем TP/SL
      if (this.config.takeProfit && this.equity >= this.config.initialBalance + this.config.takeProfit) {
        this.log("INFO", `Take profit reached at equity ${this.equity}`);
        this.closeAllPositions(candle.close, i, "TP");
        break;
      }

      if (this.config.stopLoss && this.equity <= this.config.initialBalance - this.config.stopLoss) {
        this.log("INFO", `Stop loss reached at equity ${this.equity}`);
        this.closeAllPositions(candle.close, i, "SL");
        break;
      }

      // Проверяем выход цены за диапазон
      if (candle.close > this.config.upperPrice || candle.close < this.config.lowerPrice) {
        this.log("WARNING", `Price ${candle.close} out of grid range`);
      }
    }

    // Закрываем все позиции в конце
    const lastCandle = candles[candles.length - 1];
    this.closeAllPositions(lastCandle.close, candles.length - 1, "MANUAL");

    const completedAt = new Date();

    return {
      botId: this.config.id,
      botType: "GRID",
      mode: "BACKTEST",
      initialBalance: this.config.initialBalance,
      finalBalance: this.balance,
      finalEquity: this.equity,
      totalPnl: this.equity - this.config.initialBalance,
      totalPnlPercent: ((this.equity - this.config.initialBalance) / this.config.initialBalance) * 100,
      metrics: this.calculateMetrics(candles.length),
      trades: this.trades,
      equityCurve: this.equityCurve,
      positions: this.positions,
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      logs: this.logs,
    };
  }

  /**
   * Рассчитать уровни сетки
   */
  private calculateGridLevels(): void {
    const { upperPrice, lowerPrice, gridCount, gridType } = this.config;
    this.gridLevels = [];

    if (gridType === "ARITHMETIC") {
      const step = (upperPrice - lowerPrice) / (gridCount - 1);
      for (let i = 0; i < gridCount; i++) {
        this.gridLevels.push(lowerPrice + step * i);
      }
    } else {
      // Geometric
      const ratio = Math.pow(upperPrice / lowerPrice, 1 / (gridCount - 1));
      for (let i = 0; i < gridCount; i++) {
        this.gridLevels.push(lowerPrice * Math.pow(ratio, i));
      }
    }
  }

  /**
   * Инициализировать грид-ордера
   */
  private initializeGridOrders(currentPrice: number): void {
    const perGridAmount = this.config.perGridAmount || 
      this.config.totalInvestment / this.config.gridCount;

    for (let i = 0; i < this.gridLevels.length; i++) {
      const levelPrice = this.gridLevels[i];
      const side = this.getGridOrderSide(levelPrice, currentPrice);

      this.gridOrders.set(i, {
        levelIndex: i,
        price: levelPrice,
        side,
        status: "PENDING",
        amount: perGridAmount / levelPrice,
        filled: false,
      });
    }
  }

  /**
   * Определить сторону ордера на уровне
   */
  private getGridOrderSide(levelPrice: number, currentPrice: number): "BUY" | "SELL" {
    if (this.config.direction === "LONG") {
      return levelPrice < currentPrice ? "BUY" : "SELL";
    } else if (this.config.direction === "SHORT") {
      return levelPrice > currentPrice ? "SELL" : "BUY";
    } else {
      // NEUTRAL
      return levelPrice < currentPrice ? "BUY" : "SELL";
    }
  }

  /**
   * Обработать свечу
   */
  private processCandle(candle: Candle, index: number): void {
    // Проверяем каждый уровень
    for (const [levelIndex, order] of this.gridOrders) {
      if (order.status !== "PENDING") continue;

      // Проверяем исполнение
      const isFilled = order.side === "BUY"
        ? candle.low <= order.price
        : candle.high >= order.price;

      if (isFilled) {
        this.executeGridOrder(order, levelIndex, candle, index);
      }
    }

    // Обновляем существующие позиции
    this.updatePositions(candle, index);
  }

  /**
   * Исполнить грид-ордер
   */
  private executeGridOrder(order: GridOrder, levelIndex: number, candle: Candle, index: number): void {
    order.status = "FILLED";
    order.filled = true;
    order.filledAt = new Date(candle.timestamp);
    order.filledPrice = order.price;

    const fee = order.amount * order.price * 0.0004; // 0.04% fee

    if (order.side === "BUY") {
      // Открываем LONG позицию
      const position: BotPosition = {
        id: `pos-${++this.positionIdCounter}`,
        symbol: this.config.symbol,
        direction: "LONG",
        status: "OPEN",
        avgEntryPrice: order.price,
        entries: [{
          index: 1,
          price: order.price,
          size: order.amount,
          fee,
          timestamp: new Date(candle.timestamp),
          orderType: "LIMIT",
        }],
        totalSize: order.amount,
        openedAt: new Date(candle.timestamp),
        exits: [],
        currentPrice: order.price,
        takeProfitTargets: [{
          index: 1,
          price: this.gridLevels[Math.min(levelIndex + 1, this.gridLevels.length - 1)],
          closePercent: 100,
          filled: false,
        }],
        unrealizedPnl: 0,
        realizedPnl: 0,
        totalFees: fee,
        leverage: this.config.leverage,
        margin: (order.amount * order.price) / this.config.leverage,
        tacticsSetId: "grid-bot",
        gridLevel: levelIndex,
      };

      this.positions.push(position);
      this.balance -= (order.amount * order.price) + fee;

      this.log("DEBUG", `BUY order filled at level ${levelIndex}, price ${order.price}`);
    } else {
      // SELL - закрываем LONG позицию на этом уровне или открываем SHORT
      const openLong = this.positions.find(p => 
        p.status === "OPEN" && 
        p.direction === "LONG" && 
        p.gridLevel !== undefined && 
        p.gridLevel < levelIndex
      );

      if (openLong) {
        // Закрываем существующую позицию
        const pnl = (order.price - openLong.avgEntryPrice) * openLong.totalSize - fee;
        openLong.status = "CLOSED";
        openLong.closedAt = new Date(candle.timestamp);
        openLong.closeReason = "TP";
        openLong.avgExitPrice = order.price;
        openLong.realizedPnl = pnl;
        openLong.exits.push({
          index: 1,
          price: order.price,
          size: openLong.totalSize,
          fee,
          pnl,
          reason: "TP",
          timestamp: new Date(candle.timestamp),
        });

        this.balance += openLong.totalSize * order.price - fee;
        this.trades.push(this.createTrade(openLong));

        this.log("DEBUG", `SELL order filled at level ${levelIndex}, PnL: ${pnl}`);
      }
    }
  }

  /**
   * Обновить позиции
   */
  private updatePositions(candle: Candle, index: number): void {
    for (const position of this.positions) {
      if (position.status !== "OPEN") continue;

      position.currentPrice = candle.close;
      position.unrealizedPnl = (candle.close - position.avgEntryPrice) * position.totalSize;
    }
  }

  /**
   * Обновить эквити
   */
  private updateEquity(currentPrice: number, index: number): void {
    let unrealizedPnl = 0;
    for (const position of this.positions) {
      if (position.status === "OPEN") {
        unrealizedPnl += position.unrealizedPnl;
      }
    }

    this.equity = this.balance + unrealizedPnl;

    if (this.equity > this.maxEquity) {
      this.maxEquity = this.equity;
    }

    const drawdown = this.maxEquity - this.equity;
    const drawdownPercent = (drawdown / this.maxEquity) * 100;

    this.equityCurve.push({
      timestamp: new Date(),
      balance: this.balance,
      equity: this.equity,
      unrealizedPnl,
      realizedPnl: this.trades.reduce((sum, t) => sum + t.pnl, 0),
      drawdown,
      drawdownPercent,
      openPositions: this.positions.filter(p => p.status === "OPEN").length,
      tradesCount: this.trades.length,
    });
  }

  /**
   * Закрыть все позиции
   */
  private closeAllPositions(price: number, index: number, reason: BotPosition["closeReason"]): void {
    for (const position of this.positions) {
      if (position.status !== "OPEN") continue;

      const fee = position.totalSize * price * 0.0004;
      const pnl = position.direction === "LONG"
        ? (price - position.avgEntryPrice) * position.totalSize - fee
        : (position.avgEntryPrice - price) * position.totalSize - fee;

      position.status = "CLOSED";
      position.closedAt = new Date();
      position.closeReason = reason;
      position.avgExitPrice = price;
      position.realizedPnl = pnl;
      position.exits.push({
        index: 1,
        price,
        size: position.totalSize,
        fee,
        pnl,
        reason: reason === "TP" ? "TP" : reason === "SL" ? "SL" : "MANUAL",
        timestamp: new Date(),
      });

      this.balance += position.totalSize * price - fee;
      this.trades.push(this.createTrade(position));
    }
  }

  /**
   * Создать сделку из позиции
   */
  private createTrade(position: BotPosition): BotTrade {
    const totalSize = position.entries.reduce((sum, e) => sum + e.size, 0);
    return {
      id: `trade-${position.id}`,
      positionId: position.id,
      symbol: position.symbol,
      direction: position.direction,
      avgEntryPrice: position.avgEntryPrice,
      avgExitPrice: position.avgExitPrice || 0,
      totalSize,
      openedAt: position.openedAt,
      closedAt: position.closedAt || new Date(),
      closeReason: position.closeReason,
      pnl: position.realizedPnl,
      pnlPercent: (position.realizedPnl / position.margin) * 100,
      fees: position.totalFees,
      netPnl: position.realizedPnl - position.totalFees,
      durationMinutes: position.closedAt
        ? (position.closedAt.getTime() - position.openedAt.getTime()) / (1000 * 60)
        : 0,
      tacticsSetId: position.tacticsSetId,
    };
  }

  /**
   * Рассчитать метрики
   */
  private calculateMetrics(candleCount: number): BotSimulationMetrics {
    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl <= 0);
    const totalPnl = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    // Sharpe Ratio (simplified)
    const returns = this.equityCurve.map((p, i) => {
      if (i === 0) return 0;
      return (p.equity - this.equityCurve[i - 1].equity) / this.equityCurve[i - 1].equity;
    }).filter(r => r !== 0);

    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0;

    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    // Max Drawdown
    let maxDrawdown = 0;
    for (const point of this.equityCurve) {
      if (point.drawdownPercent > maxDrawdown) {
        maxDrawdown = point.drawdownPercent;
      }
    }

    return {
      totalTrades: this.trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: this.trades.length > 0 ? (wins.length / this.trades.length) * 100 : 0,
      totalPnl,
      totalPnlPercent: ((this.equity - this.config.initialBalance) / this.config.initialBalance) * 100,
      avgPnl: this.trades.length > 0 ? totalPnl / this.trades.length : 0,
      avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
      avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
      maxWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
      maxLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      riskRewardRatio: 0,
      maxDrawdown: maxDrawdown * this.config.initialBalance / 100,
      maxDrawdownPercent: maxDrawdown,
      sharpeRatio,
      calmarRatio: maxDrawdown > 0 ? ((this.equity - this.config.initialBalance) / this.config.initialBalance) / (maxDrawdown / 100) : 0,
      avgTradeDuration: this.trades.length > 0
        ? this.trades.reduce((sum, t) => sum + t.durationMinutes, 0) / this.trades.length
        : 0,
      tradingDays: Math.ceil(candleCount / (24 * 60)), // Assuming 1h candles
    };
  }

  /**
   * Записать лог
   */
  private log(level: BotLogEntry["level"], message: string): void {
    this.logs.push({
      timestamp: new Date(),
      level,
      message,
    });
  }
}

/**
 * Ордер сетки
 */
interface GridOrder {
  levelIndex: number;
  price: number;
  side: "BUY" | "SELL";
  status: "PENDING" | "FILLED" | "CANCELLED";
  amount: number;
  filled: boolean;
  filledAt?: Date;
  filledPrice?: number;
}

// ==================== DCA BOT ADAPTER ====================

/**
 * Конфигурация DCA Bot для симуляции
 */
export interface DCABotSimulationConfig extends BaseBotConfig {
  type: "DCA";
  
  // DCA Settings
  baseAmount: number;
  dcaLevels: number;
  dcaPercent: number;
  dcaMultiplier: number;
  
  // Direction
  direction: "LONG" | "SHORT";
  
  // TP/SL
  tpType: "PERCENT" | "FIXED";
  tpValue: number;
  slEnabled: boolean;
  slType?: "PERCENT" | "FIXED";
  slValue?: number;
}

/**
 * Адаптер для симуляции DCA Bot
 */
export class DCABotSimulator {
  private config: DCABotSimulationConfig;
  private balance: number;
  private equity: number;
  private maxEquity: number;
  private positions: BotPosition[] = [];
  private trades: BotTrade[] = [];
  private equityCurve: BotEquityPoint[] = [];
  private logs: BotLogEntry[] = [];
  
  // DCA State
  private currentLevel: number = 0;
  private totalInvested: number = 0;
  private totalAmount: number = 0;
  private avgEntryPrice: number = 0;
  private positionIdCounter: number = 0;

  constructor(config: DCABotSimulationConfig) {
    this.config = config;
    this.balance = config.initialBalance;
    this.equity = config.initialBalance;
    this.maxEquity = config.initialBalance;
  }

  /**
   * Запустить симуляцию
   */
  async runBacktest(candles: Candle[]): Promise<BotSimulationResult> {
    const startedAt = new Date();
    this.log("INFO", `Starting DCA Bot backtest with ${candles.length} candles`);

    // Первый вход
    const firstCandle = candles[0];
    this.executeEntry(firstCandle.close, firstCandle, 0);

    // Проходим по свечам
    for (let i = 1; i < candles.length; i++) {
      const candle = candles[i];
      
      // Проверяем DCA уровни
      this.checkDCALevels(candle, i);
      
      // Проверяем TP
      this.checkTakeProfit(candle, i);
      
      // Проверяем SL
      this.checkStopLoss(candle, i);
      
      // Обновляем эквити
      this.updateEquity(candle.close, i);
    }

    // Закрываем позицию в конце
    const lastCandle = candles[candles.length - 1];
    if (this.positions.some(p => p.status === "OPEN")) {
      this.closePosition(lastCandle.close, lastCandle, candles.length - 1, "MANUAL");
    }

    const completedAt = new Date();

    return {
      botId: this.config.id,
      botType: "DCA",
      mode: "BACKTEST",
      initialBalance: this.config.initialBalance,
      finalBalance: this.balance,
      finalEquity: this.equity,
      totalPnl: this.equity - this.config.initialBalance,
      totalPnlPercent: ((this.equity - this.config.initialBalance) / this.config.initialBalance) * 100,
      metrics: this.calculateMetrics(candles.length),
      trades: this.trades,
      equityCurve: this.equityCurve,
      positions: this.positions,
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      logs: this.logs,
    };
  }

  /**
   * Выполнить вход
   */
  private executeEntry(price: number, candle: Candle, index: number): void {
    const amount = this.config.baseAmount * Math.pow(this.config.dcaMultiplier, this.currentLevel);
    const size = amount / price;
    const fee = amount * 0.0004;

    this.totalInvested += amount;
    this.totalAmount += size;
    this.avgEntryPrice = this.totalInvested / this.totalAmount;
    this.balance -= amount + fee;

    this.log("DEBUG", `DCA Level ${this.currentLevel}: Entry at ${price}, amount: ${amount}`);

    // Создаём или обновляем позицию
    let position = this.positions.find(p => p.status === "OPEN");
    
    if (!position) {
      position = {
        id: `pos-${++this.positionIdCounter}`,
        symbol: this.config.symbol,
        direction: this.config.direction,
        status: "OPEN",
        avgEntryPrice: price,
        entries: [],
        totalSize: 0,
        openedAt: new Date(candle.timestamp),
        exits: [],
        currentPrice: price,
        takeProfitTargets: [],
        unrealizedPnl: 0,
        realizedPnl: 0,
        totalFees: 0,
        leverage: 1,
        margin: 0,
        tacticsSetId: "dca-bot",
      };
      this.positions.push(position);
    }

    position.entries.push({
      index: position.entries.length + 1,
      price,
      size,
      fee,
      timestamp: new Date(candle.timestamp),
      orderType: "MARKET",
    });
    position.totalSize += size;
    position.avgEntryPrice = this.avgEntryPrice;
    position.totalFees += fee;
  }

  /**
   * Проверить DCA уровни
   */
  private checkDCALevels(candle: Candle, index: number): void {
    if (this.currentLevel >= this.config.dcaLevels) return;
    if (this.avgEntryPrice === 0) return;

    // Для LONG: вход при падении цены
    const priceDropPercent = ((this.avgEntryPrice - candle.close) / this.avgEntryPrice) * 100;
    
    if (this.config.direction === "LONG" && priceDropPercent >= this.config.dcaPercent * (this.currentLevel + 1)) {
      this.currentLevel++;
      this.executeEntry(candle.close, candle, index);
    }
  }

  /**
   * Проверить Take Profit
   */
  private checkTakeProfit(candle: Candle, index: number): void {
    if (this.avgEntryPrice === 0) return;

    const tpPrice = this.config.tpType === "PERCENT"
      ? this.avgEntryPrice * (1 + this.config.tpValue / 100)
      : this.config.tpValue;

    if (this.config.direction === "LONG" && candle.high >= tpPrice) {
      this.closePosition(tpPrice, candle, index, "TP");
    }
  }

  /**
   * Проверить Stop Loss
   */
  private checkStopLoss(candle: Candle, index: number): void {
    if (!this.config.slEnabled || !this.config.slValue || this.avgEntryPrice === 0) return;

    const slPrice = this.config.slType === "PERCENT"
      ? this.avgEntryPrice * (1 - this.config.slValue / 100)
      : this.config.slValue;

    if (this.config.direction === "LONG" && candle.low <= slPrice) {
      this.closePosition(slPrice, candle, index, "SL");
    }
  }

  /**
   * Закрыть позицию
   */
  private closePosition(price: number, candle: Candle, index: number, reason: BotPosition["closeReason"]): void {
    const position = this.positions.find(p => p.status === "OPEN");
    if (!position) return;

    const fee = this.totalAmount * price * 0.0004;
    const pnl = this.config.direction === "LONG"
      ? (price - this.avgEntryPrice) * this.totalAmount - fee
      : (this.avgEntryPrice - price) * this.totalAmount - fee;

    position.status = "CLOSED";
    position.closedAt = new Date(candle.timestamp);
    position.closeReason = reason;
    position.avgExitPrice = price;
    position.realizedPnl = pnl;
    position.totalFees += fee;

    this.balance += this.totalAmount * price - fee;
    this.trades.push(this.createTrade(position));

    this.log("INFO", `Position closed at ${price}, PnL: ${pnl}, Reason: ${reason}`);

    // Reset DCA state
    this.currentLevel = 0;
    this.totalInvested = 0;
    this.totalAmount = 0;
    this.avgEntryPrice = 0;
  }

  /**
   * Обновить эквити
   */
  private updateEquity(currentPrice: number, index: number): void {
    let unrealizedPnl = 0;
    for (const position of this.positions) {
      if (position.status === "OPEN") {
        position.currentPrice = currentPrice;
        position.unrealizedPnl = (currentPrice - this.avgEntryPrice) * this.totalAmount;
        unrealizedPnl += position.unrealizedPnl;
      }
    }

    this.equity = this.balance + unrealizedPnl;

    if (this.equity > this.maxEquity) {
      this.maxEquity = this.equity;
    }

    const drawdown = this.maxEquity - this.equity;
    const drawdownPercent = this.maxEquity > 0 ? (drawdown / this.maxEquity) * 100 : 0;

    this.equityCurve.push({
      timestamp: new Date(),
      balance: this.balance,
      equity: this.equity,
      unrealizedPnl,
      realizedPnl: this.trades.reduce((sum, t) => sum + t.pnl, 0),
      drawdown,
      drawdownPercent,
      openPositions: this.positions.filter(p => p.status === "OPEN").length,
      tradesCount: this.trades.length,
    });
  }

  /**
   * Создать сделку
   */
  private createTrade(position: BotPosition): BotTrade {
    return {
      id: `trade-${position.id}`,
      positionId: position.id,
      symbol: position.symbol,
      direction: position.direction,
      avgEntryPrice: position.avgEntryPrice,
      avgExitPrice: position.avgExitPrice || 0,
      totalSize: position.totalSize,
      openedAt: position.openedAt,
      closedAt: position.closedAt || new Date(),
      closeReason: position.closeReason,
      pnl: position.realizedPnl,
      pnlPercent: (position.realizedPnl / this.totalInvested) * 100,
      fees: position.totalFees,
      netPnl: position.realizedPnl - position.totalFees,
      durationMinutes: position.closedAt
        ? (position.closedAt.getTime() - position.openedAt.getTime()) / (1000 * 60)
        : 0,
      tacticsSetId: "dca-bot",
    };
  }

  /**
   * Рассчитать метрики
   */
  private calculateMetrics(candleCount: number): BotSimulationMetrics {
    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl <= 0);
    const totalPnl = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    let maxDrawdown = 0;
    for (const point of this.equityCurve) {
      if (point.drawdownPercent > maxDrawdown) {
        maxDrawdown = point.drawdownPercent;
      }
    }

    return {
      totalTrades: this.trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: this.trades.length > 0 ? (wins.length / this.trades.length) * 100 : 0,
      totalPnl,
      totalPnlPercent: ((this.equity - this.config.initialBalance) / this.config.initialBalance) * 100,
      avgPnl: this.trades.length > 0 ? totalPnl / this.trades.length : 0,
      avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
      avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
      maxWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
      maxLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      riskRewardRatio: 0,
      maxDrawdown: maxDrawdown * this.config.initialBalance / 100,
      maxDrawdownPercent: maxDrawdown,
      sharpeRatio: 0,
      calmarRatio: maxDrawdown > 0 ? ((this.equity - this.config.initialBalance) / this.config.initialBalance) / (maxDrawdown / 100) : 0,
      avgTradeDuration: this.trades.length > 0
        ? this.trades.reduce((sum, t) => sum + t.durationMinutes, 0) / this.trades.length
        : 0,
      tradingDays: Math.ceil(candleCount / (24 * 60)),
    };
  }

  /**
   * Записать лог
   */
  private log(level: BotLogEntry["level"], message: string): void {
    this.logs.push({
      timestamp: new Date(),
      level,
      message,
    });
  }
}

// ==================== BBOT ADAPTER ====================

/**
 * Конфигурация BBot для симуляции
 */
export interface BBotSimulationConfig extends BaseBotConfig {
  type: "BBOT";
  
  // BBot Settings
  direction: "LONG" | "SHORT";
  positionSize: number;
  leverage: number;
  
  // Entry
  entryType: "MARKET" | "LIMIT";
  entryPrice?: number;
  
  // Risk Management
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopEnabled: boolean;
  trailingStopPercent?: number;
  trailingActivationPercent?: number;
}

/**
 * Адаптер для симуляции BBot
 */
export class BBotSimulator {
  private config: BBotSimulationConfig;
  private balance: number;
  private equity: number;
  private maxEquity: number;
  private positions: BotPosition[] = [];
  private trades: BotTrade[] = [];
  private equityCurve: BotEquityPoint[] = [];
  private logs: BotLogEntry[] = [];
  private positionIdCounter: number = 0;

  constructor(config: BBotSimulationConfig) {
    this.config = config;
    this.balance = config.initialBalance;
    this.equity = config.initialBalance;
    this.maxEquity = config.initialBalance;
  }

  /**
   * Запустить симуляцию
   */
  async runBacktest(candles: Candle[]): Promise<BotSimulationResult> {
    const startedAt = new Date();
    this.log("INFO", `Starting BBot backtest with ${candles.length} candles`);

    let position: BotPosition | null = null;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];

      // Если нет открытой позиции - проверяем вход
      if (!position || position.status !== "OPEN") {
        position = this.checkEntry(candle, i);
      }

      // Если есть открытая позиция - проверяем выходы
      if (position && position.status === "OPEN") {
        this.checkExits(position, candle, i);
      }

      // Обновляем эквити
      this.updateEquity(candle.close, i);
    }

    // Закрываем позицию в конце
    const lastCandle = candles[candles.length - 1];
    if (position && position.status === "OPEN") {
      this.closePosition(position, lastCandle.close, lastCandle, candles.length - 1, "MANUAL");
    }

    const completedAt = new Date();

    return {
      botId: this.config.id,
      botType: "BBOT",
      mode: "BACKTEST",
      initialBalance: this.config.initialBalance,
      finalBalance: this.balance,
      finalEquity: this.equity,
      totalPnl: this.equity - this.config.initialBalance,
      totalPnlPercent: ((this.equity - this.config.initialBalance) / this.config.initialBalance) * 100,
      metrics: this.calculateMetrics(candles.length),
      trades: this.trades,
      equityCurve: this.equityCurve,
      positions: this.positions,
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      logs: this.logs,
    };
  }

  /**
   * Проверить условия входа
   */
  private checkEntry(candle: Candle, index: number): BotPosition | null {
    // Для упрощения - вход по рынку на первой свече
    // В реальности тут была бы логика определения точки входа
    
    if (this.trades.length > 0 && this.trades[this.trades.length - 1].closeReason !== "TP") {
      // Не входим если предыдущая сделка закрыта не по TP
      // Это защита от повторных входов в плохой тренд
      return null;
    }

    const price = candle.close;
    const size = this.config.positionSize / price;
    const fee = this.config.positionSize * 0.0004;
    const margin = this.config.positionSize / this.config.leverage;

    const position: BotPosition = {
      id: `pos-${++this.positionIdCounter}`,
      symbol: this.config.symbol,
      direction: this.config.direction,
      status: "OPEN",
      avgEntryPrice: price,
      entries: [{
        index: 1,
        price,
        size,
        fee,
        timestamp: new Date(candle.timestamp),
        orderType: "MARKET",
      }],
      totalSize: size,
      openedAt: new Date(candle.timestamp),
      exits: [],
      currentPrice: price,
      stopLoss: this.config.direction === "LONG"
        ? price * (1 - this.config.stopLossPercent / 100)
        : price * (1 + this.config.stopLossPercent / 100),
      takeProfitTargets: [{
        index: 1,
        price: this.config.direction === "LONG"
          ? price * (1 + this.config.takeProfitPercent / 100)
          : price * (1 - this.config.takeProfitPercent / 100),
        closePercent: 100,
        filled: false,
      }],
      unrealizedPnl: 0,
      realizedPnl: 0,
      totalFees: fee,
      leverage: this.config.leverage,
      margin,
      tacticsSetId: "bbot",
      trailingState: this.config.trailingStopEnabled ? {
        activated: false,
      } : undefined,
    };

    this.positions.push(position);
    this.balance -= margin + fee;

    this.log("DEBUG", `Opened ${this.config.direction} at ${price}`);

    return position;
  }

  /**
   * Проверить условия выхода
   */
  private checkExits(position: BotPosition, candle: Candle, index: number): void {
    // Stop Loss
    if (position.stopLoss) {
      const isSLHit = position.direction === "LONG"
        ? candle.low <= position.stopLoss
        : candle.high >= position.stopLoss;

      if (isSLHit) {
        this.closePosition(position, position.stopLoss, candle, index, "SL");
        return;
      }
    }

    // Take Profit
    const tp = position.takeProfitTargets[0];
    if (tp && !tp.filled) {
      const isTPHit = position.direction === "LONG"
        ? candle.high >= tp.price
        : candle.low <= tp.price;

      if (isTPHit) {
        this.closePosition(position, tp.price, candle, index, "TP");
        return;
      }
    }

    // Trailing Stop
    if (position.trailingState && this.config.trailingStopEnabled) {
      this.updateTrailingStop(position, candle);
    }
  }

  /**
   * Обновить трейлинг-стоп
   */
  private updateTrailingStop(position: BotPosition, candle: Candle): void {
    const trailing = position.trailingState!;
    const profitPercent = position.direction === "LONG"
      ? ((candle.close - position.avgEntryPrice) / position.avgEntryPrice) * 100
      : ((position.avgEntryPrice - candle.close) / position.avgEntryPrice) * 100;

    // Активация
    if (!trailing.activated && this.config.trailingActivationPercent) {
      if (profitPercent >= this.config.trailingActivationPercent) {
        trailing.activated = true;
        trailing.highestPrice = candle.close;
        this.log("DEBUG", "Trailing stop activated");
      }
    }

    // Обновление
    if (trailing.activated && this.config.trailingStopPercent) {
      if (position.direction === "LONG") {
        if (!trailing.highestPrice || candle.high > trailing.highestPrice) {
          trailing.highestPrice = candle.high;
          const newSL = candle.high * (1 - this.config.trailingStopPercent / 100);
          if (!position.stopLoss || newSL > position.stopLoss) {
            position.stopLoss = newSL;
            trailing.currentStopPrice = newSL;
            this.log("DEBUG", `Trailing SL updated to ${newSL}`);
          }
        }
      } else {
        if (!trailing.lowestPrice || candle.low < trailing.lowestPrice) {
          trailing.lowestPrice = candle.low;
          const newSL = candle.low * (1 + this.config.trailingStopPercent / 100);
          if (!position.stopLoss || newSL < position.stopLoss) {
            position.stopLoss = newSL;
            trailing.currentStopPrice = newSL;
          }
        }
      }
    }
  }

  /**
   * Закрыть позицию
   */
  private closePosition(
    position: BotPosition, 
    price: number, 
    candle: Candle, 
    index: number, 
    reason: BotPosition["closeReason"]
  ): void {
    const fee = position.totalSize * price * 0.0004;
    const pnl = position.direction === "LONG"
      ? (price - position.avgEntryPrice) * position.totalSize - fee
      : (position.avgEntryPrice - price) * position.totalSize - fee;

    position.status = "CLOSED";
    position.closedAt = new Date(candle.timestamp);
    position.closeReason = reason;
    position.avgExitPrice = price;
    position.realizedPnl = pnl;
    position.totalFees += fee;

    this.balance += position.margin + pnl - fee;
    this.trades.push(this.createTrade(position));

    this.log("INFO", `Closed at ${price}, PnL: ${pnl}, Reason: ${reason}`);
  }

  /**
   * Обновить эквити
   */
  private updateEquity(currentPrice: number, index: number): void {
    let unrealizedPnl = 0;
    for (const position of this.positions) {
      if (position.status === "OPEN") {
        position.currentPrice = currentPrice;
        position.unrealizedPnl = position.direction === "LONG"
          ? (currentPrice - position.avgEntryPrice) * position.totalSize
          : (position.avgEntryPrice - currentPrice) * position.totalSize;
        unrealizedPnl += position.unrealizedPnl;
      }
    }

    this.equity = this.balance + unrealizedPnl;

    if (this.equity > this.maxEquity) {
      this.maxEquity = this.equity;
    }

    const drawdown = this.maxEquity - this.equity;
    const drawdownPercent = this.maxEquity > 0 ? (drawdown / this.maxEquity) * 100 : 0;

    this.equityCurve.push({
      timestamp: new Date(),
      balance: this.balance,
      equity: this.equity,
      unrealizedPnl,
      realizedPnl: this.trades.reduce((sum, t) => sum + t.pnl, 0),
      drawdown,
      drawdownPercent,
      openPositions: this.positions.filter(p => p.status === "OPEN").length,
      tradesCount: this.trades.length,
    });
  }

  /**
   * Создать сделку
   */
  private createTrade(position: BotPosition): BotTrade {
    return {
      id: `trade-${position.id}`,
      positionId: position.id,
      symbol: position.symbol,
      direction: position.direction,
      avgEntryPrice: position.avgEntryPrice,
      avgExitPrice: position.avgExitPrice || 0,
      totalSize: position.totalSize,
      openedAt: position.openedAt,
      closedAt: position.closedAt || new Date(),
      closeReason: position.closeReason,
      pnl: position.realizedPnl,
      pnlPercent: (position.realizedPnl / position.margin) * 100,
      fees: position.totalFees,
      netPnl: position.realizedPnl - position.totalFees,
      durationMinutes: position.closedAt
        ? (position.closedAt.getTime() - position.openedAt.getTime()) / (1000 * 60)
        : 0,
      tacticsSetId: "bbot",
    };
  }

  /**
   * Рассчитать метрики
   */
  private calculateMetrics(candleCount: number): BotSimulationMetrics {
    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl <= 0);
    const totalPnl = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    let maxDrawdown = 0;
    for (const point of this.equityCurve) {
      if (point.drawdownPercent > maxDrawdown) {
        maxDrawdown = point.drawdownPercent;
      }
    }

    return {
      totalTrades: this.trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: this.trades.length > 0 ? (wins.length / this.trades.length) * 100 : 0,
      totalPnl,
      totalPnlPercent: ((this.equity - this.config.initialBalance) / this.config.initialBalance) * 100,
      avgPnl: this.trades.length > 0 ? totalPnl / this.trades.length : 0,
      avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
      avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
      maxWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
      maxLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      riskRewardRatio: 0,
      maxDrawdown: maxDrawdown * this.config.initialBalance / 100,
      maxDrawdownPercent: maxDrawdown,
      sharpeRatio: 0,
      calmarRatio: maxDrawdown > 0 ? ((this.equity - this.config.initialBalance) / this.config.initialBalance) / (maxDrawdown / 100) : 0,
      avgTradeDuration: this.trades.length > 0
        ? this.trades.reduce((sum, t) => sum + t.durationMinutes, 0) / this.trades.length
        : 0,
      tradingDays: Math.ceil(candleCount / (24 * 60)),
    };
  }

  /**
   * Записать лог
   */
  private log(level: BotLogEntry["level"], message: string): void {
    this.logs.push({
      timestamp: new Date(),
      level,
      message,
    });
  }
}

// ==================== EXTENDED BOT POSITION ====================

/**
 * Расширенная позиция с дополнительными полями для Grid Bot
 */
interface GridBotPosition extends BotPosition {
  gridLevel?: number;
}
