/**
 * Paper Trading Engine
 * 
 * Движок для виртуальной торговли с реальными ценами.
 * Полноценные метрики и кривая эквити, как в Backtesting.
 * 
 * Интеграция с Persistence Layer:
 * - Автосохранение каждые 5 минут
 * - Сохранение при каждом изменении позиции
 * - Восстановление состояния при старте
 */

import {
  PaperTradingConfig,
  PaperAccount,
  PaperPosition,
  PaperTrade,
  PaperTradeEntry,
  PaperTradeExit,
  PaperTPTarget,
  PaperTradingEvent,
  PaperTradingEventCallback,
  PaperTradingMetrics,
  PaperEquityPoint,
  SlippageRecord,
  FundingRecord,
} from "./types";
import { Candle, StrategySignal } from "../strategy/types";
import { TacticsSet, TacticsExecutionState, TrailingStopConfig } from "../strategy/tactics/types";
import { getStrategyManager } from "../strategy/manager";
import { ATR } from "../strategy/indicators";
import { getPaperTradingPersistence, PaperTradingPersistence } from "./persistence";

// ==================== CONSTANTS ====================

/** Базовый slippage (%) */
const DEFAULT_SLIPPAGE_PERCENT = 0.05; // 0.05%

/** Интервал funding (8 часов в миллисекундах) */
const DEFAULT_FUNDING_INTERVAL = 8 * 60 * 60 * 1000;

// ==================== PAPER TRADING ENGINE ====================

export class PaperTradingEngine {
  private accounts: Map<string, PaperAccount> = new Map();
  private eventCallbacks: PaperTradingEventCallback[] = [];
  private positionIdCounter: number = 0;
  private persistence: PaperTradingPersistence;
  
  // Tracking for metrics
  private lastEquityRecordTime: Map<string, number> = new Map();
  private dailyPnl: Map<string, number> = new Map();
  private lastDay: Map<string, number> = new Map();
  
  // Tracking for funding
  private lastFundingTime: Map<string, number> = new Map();

  constructor() {
    this.persistence = getPaperTradingPersistence();
    
    // Подписываемся на события для сохранения
    this.subscribe(this.handleEvent.bind(this));
  }

  /**
   * Обработчик событий для автоматического сохранения
   */
  private async handleEvent(event: PaperTradingEvent): Promise<void> {
    const account = this.accounts.get(event.accountId);
    if (!account) return;

    // Сохраняем при изменении позиций
    if (
      event.type === "POSITION_OPENED" ||
      event.type === "POSITION_CLOSED" ||
      event.type === "POSITION_UPDATED"
    ) {
      try {
        await this.persistence.saveAccount(account);
      } catch (error) {
        console.error(`[PaperTrading] Failed to save account after ${event.type}:`, error);
      }
    }
  }

  /**
   * Восстановить все активные счета из базы данных
   */
  async restoreAccounts(): Promise<number> {
    try {
      const accounts = await this.persistence.loadActiveAccounts();
      
      for (const account of accounts) {
        this.accounts.set(account.id, account);
        this.lastEquityRecordTime.set(account.id, Date.now());
        this.dailyPnl.set(account.id, 0);
        this.lastDay.set(account.id, Math.floor(Date.now() / (24 * 60 * 60 * 1000)));
        
        // Запускаем автосохранение
        this.persistence.startAutoSave(account.id, () => this.accounts.get(account.id));
        
        console.log(`[PaperTrading] Restored account ${account.id} (status: ${account.status}, balance: ${account.balance})`);
      }
      
      console.log(`[PaperTrading] Restored ${accounts.length} accounts from database`);
      return accounts.length;
    } catch (error) {
      console.error(`[PaperTrading] Failed to restore accounts:`, error);
      return 0;
    }
  }

  /**
   * Создать виртуальный счёт
   */
  async createAccount(config: PaperTradingConfig): Promise<PaperAccount> {
    const account: PaperAccount = {
      id: config.id,
      name: config.name,
      config,
      initialBalance: config.initialBalance,
      balance: config.initialBalance,
      equity: config.initialBalance,
      availableMargin: config.initialBalance,
      maxEquity: config.initialBalance,
      positions: [],
      tradeHistory: [],
      equityCurve: [],
      totalPnl: 0,
      totalPnlPercent: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      status: "IDLE",
      lastUpdate: new Date(),
      metrics: this.createEmptyMetrics(),
      slippageLog: [],
    };

    this.accounts.set(account.id, account);
    this.lastEquityRecordTime.set(account.id, Date.now());
    this.dailyPnl.set(account.id, 0);
    this.lastDay.set(account.id, Math.floor(Date.now() / (24 * 60 * 60 * 1000)));
    this.lastFundingTime.set(account.id, Date.now());

    // Записываем начальную точку эквити
    this.recordEquityPoint(account, {});

    // Сохраняем в базу данных
    try {
      await this.persistence.saveAccount(account);
    } catch (error) {
      console.error(`[PaperTrading] Failed to save new account:`, error);
    }

    this.emitEvent({
      type: "BALANCE_UPDATE",
      timestamp: new Date(),
      accountId: account.id,
      data: { balance: account.balance, equity: account.equity },
    });

    return account;
  }

  /**
   * Запустить торговлю
   */
  async start(accountId: string): Promise<{ success: boolean; error?: string }> {
    const account = this.accounts.get(accountId);
    if (!account) {
      return { success: false, error: "Account not found" };
    }

    account.status = "RUNNING";
    account.startedAt = new Date();
    account.lastUpdate = new Date();

    // Запускаем автосохранение
    this.persistence.startAutoSave(accountId, () => this.accounts.get(accountId));

    // Сохраняем изменение статуса
    try {
      await this.persistence.saveAccount(account);
    } catch (error) {
      console.error(`[PaperTrading] Failed to save account on start:`, error);
    }

    return { success: true };
  }

  /**
   * Остановить торговлю
   */
  async stop(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) return;

    account.status = "STOPPED";
    account.stoppedAt = new Date();

    // Останавливаем автосохранение
    this.persistence.stopAutoSave(accountId);

    // Финальное сохранение
    try {
      await this.persistence.saveAccount(account);
    } catch (error) {
      console.error(`[PaperTrading] Failed to save account on stop:`, error);
    }
  }

  /**
   * Приостановить торговлю
   */
  pause(accountId: string): void {
    const account = this.accounts.get(accountId);
    if (!account) return;

    account.status = "PAUSED";
  }

  /**
   * Возобновить торговлю
   */
  resume(accountId: string): void {
    const account = this.accounts.get(accountId);
    if (!account) return;

    account.status = "RUNNING";
  }

  /**
   * Обновить цены (вызывается при получении новых цен с биржи)
   */
  updatePrices(prices: Record<string, number>): void {
    for (const [accountId, account] of Array.from(this.accounts.entries())) {
      if (account.status !== "RUNNING") continue;

      for (const position of account.positions) {
        if (position.status !== "OPEN") continue;

        const price = prices[position.symbol];
        if (!price) continue;

        this.updatePositionPrice(position, price, account);
      }

      // Обновляем метрики счёта
      this.updateAccountMetrics(account);
      
      // Записываем точку эквити
      this.recordEquityPoint(account, prices);
    }
  }

  /**
   * Обработать новые свечи
   */
  async processCandles(
    accountId: string,
    symbol: string,
    candles: Candle[]
  ): Promise<StrategySignal | null> {
    const account = this.accounts.get(accountId);
    if (!account || account.status !== "RUNNING") {
      return null;
    }

    if (!account.config.autoTrading) {
      return null;
    }

    const strategyManager = getStrategyManager();
    const strategy = strategyManager.getStrategy(account.config.strategyId);

    if (!strategy) {
      this.emitEvent({
        type: "ERROR",
        timestamp: new Date(),
        accountId,
        data: { error: `Strategy ${account.config.strategyId} not found` },
      });
      return null;
    }

    try {
      // Анализируем рынок
      const indicators = strategy.populateIndicators(candles);
      const currentPrice = candles[candles.length - 1].close;
      const signal = strategy.populateEntrySignal(candles, indicators, currentPrice);

      if (signal && signal.symbol) {
        signal.symbol = symbol;
        this.emitEvent({
          type: "SIGNAL_GENERATED",
          timestamp: new Date(),
          accountId,
          data: { signal, symbol },
        });

        // Проверяем, можем ли открыть позицию
        if (this.canOpenPosition(account, symbol)) {
          this.executeSignal(account, signal, currentPrice, candles);
        }
      }

      // Проверяем выходы для открытых позиций
      for (const position of account.positions) {
        if (position.status === "OPEN" && position.symbol === symbol) {
          const exitSignal = strategy.populateExitSignal(candles, indicators, {
            direction: position.direction,
            entryPrice: position.avgEntryPrice,
            currentPrice,
            size: position.totalSize,
            openTime: position.openedAt,
          });

          if (exitSignal && (exitSignal.type === "EXIT_LONG" || exitSignal.type === "EXIT_SHORT")) {
            this.closePosition(account, position, currentPrice, "SIGNAL");
          }
        }
      }

      return signal;
    } catch (error) {
      this.emitEvent({
        type: "ERROR",
        timestamp: new Date(),
        accountId,
        data: { error: error instanceof Error ? error.message : "Unknown error" },
      });
      return null;
    }
  }

  /**
   * Открыть позицию вручную
   */
  openPosition(
    accountId: string,
    symbol: string,
    direction: "LONG" | "SHORT",
    size: number,
    price: number,
    options?: {
      stopLoss?: number;
      takeProfit?: number;
      leverage?: number;
      tacticsSet?: TacticsSet;
    }
  ): { success: boolean; position?: PaperPosition; error?: string } {
    const account = this.accounts.get(accountId);
    if (!account) {
      return { success: false, error: "Account not found" };
    }

    if (!this.canOpenPosition(account, symbol)) {
      return { success: false, error: "Cannot open position (limit reached)" };
    }

    const position = this.createPosition(
      account,
      symbol,
      direction,
      size,
      price,
      options?.leverage || account.config.maxLeverage,
      options?.tacticsSet
    );

    if (options?.stopLoss) {
      position.stopLoss = options.stopLoss;
    }

    if (options?.takeProfit) {
      position.takeProfitTargets = [{
        index: 1,
        price: options.takeProfit,
        closePercent: 100,
        filled: false,
      }];
    }

    account.positions.push(position);
    this.updateAccountMetrics(account);
    this.recordEquityPoint(account, { [symbol]: price });

    this.emitEvent({
      type: "POSITION_OPENED",
      timestamp: new Date(),
      accountId,
      data: { position },
    });

    return { success: true, position };
  }

  /**
   * Закрыть позицию
   */
  closePosition(
    account: PaperAccount,
    position: PaperPosition,
    price: number,
    reason: PaperTradeExit["reason"] = "MANUAL"
  ): PaperTrade | null {
    if (position.status !== "OPEN") return null;

    const fee = position.totalSize * price * (account.config.feePercent / 100);
    const pnl = position.direction === "LONG"
      ? (price - position.avgEntryPrice) * position.totalSize
      : (position.avgEntryPrice - price) * position.totalSize;

    const exit: PaperTradeExit = {
      index: position.exits.length + 1,
      price,
      size: position.totalSize,
      fee,
      pnl,
      reason,
      timestamp: new Date(),
    };

    position.exits.push(exit);
    position.realizedPnl += pnl - fee;
    position.totalFees += fee;
    position.status = "CLOSED";
    position.closedAt = new Date();
    position.avgExitPrice = price;
    position.closeReason = reason as PaperPosition["closeReason"];

    // Обновляем баланс
    account.balance += position.margin + position.realizedPnl;
    account.realizedPnl += position.realizedPnl;

    // Создаём сделку
    const trade = this.createTrade(position, account);
    account.tradeHistory.push(trade);

    // Обновляем метрики
    this.updateAccountMetrics(account);
    this.recordEquityPoint(account, { [position.symbol]: price });

    this.emitEvent({
      type: "POSITION_CLOSED",
      timestamp: new Date(),
      accountId: account.id,
      data: { position, trade },
    });

    return trade;
  }

  /**
   * Закрыть все позиции
   */
  closeAllPositions(accountId: string, prices: Record<string, number>): PaperTrade[] {
    const account = this.accounts.get(accountId);
    if (!account) return [];

    const trades: PaperTrade[] = [];

    for (const position of account.positions) {
      if (position.status === "OPEN") {
        const price = prices[position.symbol] || position.currentPrice;
        const trade = this.closePosition(account, position, price, "MANUAL");
        if (trade) trades.push(trade);
      }
    }

    return trades;
  }

  /**
   * Получить счёт
   */
  getAccount(accountId: string): PaperAccount | undefined {
    return this.accounts.get(accountId);
  }

  /**
   * Получить все счета
   */
  getAllAccounts(): PaperAccount[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Получить кривую эквити
   */
  getEquityCurve(accountId: string): PaperEquityPoint[] {
    const account = this.accounts.get(accountId);
    return account?.equityCurve || [];
  }

  /**
   * Удалить счёт
   */
  async deleteAccount(accountId: string): Promise<void> {
    // Останавливаем автосохранение
    this.persistence.stopAutoSave(accountId);
    
    // Удаляем из памяти
    this.accounts.delete(accountId);
    this.lastEquityRecordTime.delete(accountId);
    this.dailyPnl.delete(accountId);
    this.lastDay.delete(accountId);
    
    // Удаляем из базы данных
    try {
      await this.persistence.deleteAccount(accountId);
    } catch (error) {
      console.error(`[PaperTrading] Failed to delete account from database:`, error);
    }
  }

  /**
   * Получить persistence layer
   */
  getPersistence(): PaperTradingPersistence {
    return this.persistence;
  }

  /**
   * Подписаться на события
   */
  subscribe(callback: PaperTradingEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Отписаться от событий
   */
  unsubscribe(callback: PaperTradingEventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Обновить цену позиции
   */
  private updatePositionPrice(
    position: PaperPosition,
    price: number,
    account: PaperAccount
  ): void {
    position.currentPrice = price;

    // Обновляем нереализованный PnL
    if (position.direction === "LONG") {
      position.unrealizedPnl = (price - position.avgEntryPrice) * position.totalSize;
    } else {
      position.unrealizedPnl = (position.avgEntryPrice - price) * position.totalSize;
    }

    position.unrealizedPnlPercent = (position.unrealizedPnl / position.margin) * 100;

    // Проверяем funding rate (каждые 8 часов)
    this.checkFundingPayment(position, price, account);

    // Проверяем Stop Loss
    if (position.stopLoss) {
      const isSLHit = position.direction === "LONG"
        ? price <= position.stopLoss
        : price >= position.stopLoss;

      if (isSLHit) {
        this.closePosition(account, position, position.stopLoss, "SL");
        return;
      }
    }

    // Проверяем Take Profit
    for (const tp of position.takeProfitTargets) {
      if (tp.filled) continue;

      const isTPHit = position.direction === "LONG"
        ? price >= tp.price
        : price <= tp.price;

      if (isTPHit) {
        this.partialClose(account, position, tp, tp.price);
      }
    }

    // Проверяем трейлинг-стоп
    this.updateTrailingStop(position, price);

    // Проверяем ликвидацию
    if (position.liquidationPrice) {
      const isLiquidated = position.direction === "LONG"
        ? price <= position.liquidationPrice
        : price >= position.liquidationPrice;

      if (isLiquidated) {
        this.closePosition(account, position, position.liquidationPrice, "LIQUIDATION");
      }
    }
  }

  /**
   * Обновить трейлинг-стоп
   */
  private updateTrailingStop(position: PaperPosition, price: number): void {
    const trailingState = position.tacticsState.trailingState;
    if (!trailingState) return;

    // Проверяем активацию
    if (!trailingState.activated) {
      const profitPercent = position.unrealizedPnlPercent;
      if (trailingState.activationProfit && profitPercent >= trailingState.activationProfit) {
        trailingState.activated = true;
        trailingState.highestPrice = price;
        trailingState.lowestPrice = price;
      }
      return;
    }

    // Обновляем трейлинг
    if (position.direction === "LONG") {
      if (!trailingState.highestPrice || price > trailingState.highestPrice) {
        trailingState.highestPrice = price;

        if (trailingState.percentValue) {
          const newSL = price * (1 - trailingState.percentValue / 100);
          if (!position.stopLoss || newSL > position.stopLoss) {
            position.stopLoss = newSL;
            trailingState.currentStopPrice = newSL;
          }
        }
      }
    } else {
      if (!trailingState.lowestPrice || price < trailingState.lowestPrice) {
        trailingState.lowestPrice = price;

        if (trailingState.percentValue) {
          const newSL = price * (1 + trailingState.percentValue / 100);
          if (!position.stopLoss || newSL < position.stopLoss) {
            position.stopLoss = newSL;
            trailingState.currentStopPrice = newSL;
          }
        }
      }
    }
  }

  /**
   * Проверка и расчёт funding payment
   */
  private checkFundingPayment(
    position: PaperPosition,
    price: number,
    account: PaperAccount
  ): void {
    if (!position.fundingHistory) {
      position.fundingHistory = [];
    }

    const now = Date.now();
    const lastFunding = position.fundingHistory.length > 0
      ? position.fundingHistory[position.fundingHistory.length - 1].timestamp.getTime()
      : position.openedAt.getTime();

    // Проверяем, прошёл ли интервал funding (8 часов)
    if (now - lastFunding < DEFAULT_FUNDING_INTERVAL) {
      return;
    }

    // Симулируем funding rate (в реальности берётся с биржи)
    // Базовый funding rate ~0.01% каждые 8 часов
    const baseFundingRate = 0.0001; // 0.01%
    const fundingRate = (Math.random() - 0.5) * 0.0002 + baseFundingRate; // Случайная вариация

    // Расчёт payment
    const positionValue = position.totalSize * price;
    const payment = positionValue * fundingRate;

    // Для LONG: платим если rate > 0, получаем если rate < 0
    // Для SHORT: наоборот
    const fundingPayment = position.direction === "LONG" ? -payment : payment;

    // Обновляем баланс и историю
    account.balance += fundingPayment;
    position.totalFundingPaid = (position.totalFundingPaid || 0) + (fundingPayment < 0 ? -fundingPayment : 0);

    const fundingRecord: FundingRecord = {
      timestamp: new Date(),
      positionId: position.id,
      symbol: position.symbol,
      direction: position.direction,
      fundingRate,
      positionSize: position.totalSize,
      price,
      payment: fundingPayment,
      balanceAfter: account.balance,
    };

    position.fundingHistory.push(fundingRecord);

    this.emitEvent({
      type: "POSITION_UPDATED",
      timestamp: new Date(),
      accountId: account.id,
      data: { position, fundingPayment },
    });
  }

  /**
   * Частичное закрытие
   */
  private partialClose(
    account: PaperAccount,
    position: PaperPosition,
    tp: PaperTPTarget,
    price: number
  ): void {
    const closeSize = position.totalSize * (tp.closePercent / 100);
    const fee = closeSize * price * (account.config.feePercent / 100);
    const pnl = position.direction === "LONG"
      ? (price - position.avgEntryPrice) * closeSize
      : (position.avgEntryPrice - price) * closeSize;

    const exit: PaperTradeExit = {
      index: position.exits.length + 1,
      price,
      size: closeSize,
      fee,
      pnl,
      reason: "TP",
      timestamp: new Date(),
      tpIndex: tp.index,
    };

    position.exits.push(exit);
    position.totalSize -= closeSize;
    position.realizedPnl += pnl - fee;
    position.totalFees += fee;
    tp.filled = true;
    tp.filledAt = new Date();

    account.balance += pnl - fee;

    this.emitEvent({
      type: "POSITION_UPDATED",
      timestamp: new Date(),
      accountId: account.id,
      data: { position, partialClose: exit },
    });

    // Если позиция закрыта полностью
    if (position.totalSize <= 0) {
      position.status = "CLOSED";
      position.closedAt = new Date();
      position.avgExitPrice = this.calculateAvgExitPrice(position);
      position.closeReason = "TP";

      const trade = this.createTrade(position, account);
      account.tradeHistory.push(trade);

      this.emitEvent({
        type: "POSITION_CLOSED",
        timestamp: new Date(),
        accountId: account.id,
        data: { position, trade },
      });
    }

    this.updateAccountMetrics(account);
  }

  /**
   * Создать позицию
   */
  private createPosition(
    account: PaperAccount,
    symbol: string,
    direction: "LONG" | "SHORT",
    size: number,
    price: number,
    leverage: number,
    tacticsSet?: TacticsSet
  ): PaperPosition {
    // Расчёт executedPrice с учётом slippage
    const slippagePercent = account.config.slippagePercent || DEFAULT_SLIPPAGE_PERCENT;
    const slippageDirection = direction === "LONG" ? 1 : -1;
    const executedPrice = price * (1 + (slippageDirection * slippagePercent / 100));

    // Записываем в лог slippage
    account.slippageLog = account.slippageLog || [];
    account.slippageLog.push({
      timestamp: new Date(),
      symbol,
      side: direction === "LONG" ? "BUY" : "SELL",
      requestedPrice: price,
      executedPrice,
      slippage: executedPrice - price,
      slippagePercent: ((executedPrice - price) / price) * 100,
      orderType: "MARKET",
      positionSize: size,
    });

    const margin = (size * executedPrice) / leverage;
    const fee = size * executedPrice * (account.config.feePercent / 100);

    // Списываем с баланса
    account.balance -= margin + fee;

    const tactics = tacticsSet || account.config.tacticsSets[0];

    const position: PaperPosition = {
      id: `pos-${++this.positionIdCounter}`,
      symbol,
      direction,
      status: "OPEN",
      avgEntryPrice: executedPrice,
      entries: [{
        index: 1,
        price: executedPrice,
        size,
        fee,
        timestamp: new Date(),
        orderType: "MARKET",
      }],
      totalSize: size,
      openedAt: new Date(),
      exits: [],
      currentPrice: executedPrice,
      takeProfitTargets: [],
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      realizedPnl: 0,
      totalFees: fee,
      leverage,
      marginMode: "isolated",
      margin,
      liquidationPrice: this.calculateLiquidationPrice(executedPrice, direction, leverage),
      tacticsState: {
        positionId: `pos-${this.positionIdCounter}`,
        tacticsSetId: tactics?.id || "",
        entryStatus: "COMPLETED",
        executedEntries: [],
        executedTPs: [],
        stopLossHistory: [],
        updatedAt: new Date(),
      },
    };

    // Устанавливаем SL/TP из тактик (рассчитываем от executedPrice)
    if (tactics) {
      if (tactics.stopLoss.slPrice) {
        position.stopLoss = tactics.stopLoss.slPrice;
      } else if (tactics.stopLoss.slPercent) {
        position.stopLoss = direction === "LONG"
          ? executedPrice * (1 - tactics.stopLoss.slPercent / 100)
          : executedPrice * (1 + tactics.stopLoss.slPercent / 100);
      }

      if (tactics.takeProfit.targets) {
        position.takeProfitTargets = tactics.takeProfit.targets.map((t, i) => ({
          index: i + 1,
          price: t.price || (direction === "LONG"
            ? executedPrice * (1 + (t.profitPercent || 0) / 100)
            : executedPrice * (1 - (t.profitPercent || 0) / 100)),
          closePercent: t.closePercent,
          filled: false,
        }));
      } else if (tactics.takeProfit.tpPrice) {
        position.takeProfitTargets = [{
          index: 1,
          price: tactics.takeProfit.tpPrice,
          closePercent: 100,
          filled: false,
        }];
      } else if (tactics.takeProfit.tpPercent) {
        position.takeProfitTargets = [{
          index: 1,
          price: direction === "LONG"
            ? executedPrice * (1 + tactics.takeProfit.tpPercent / 100)
            : executedPrice * (1 - tactics.takeProfit.tpPercent / 100),
          closePercent: 100,
          filled: false,
        }];
      }

      // Trailing stop
      if (tactics.takeProfit.trailingConfig) {
        position.tacticsState.trailingState = { ...tactics.takeProfit.trailingConfig };
      }
    }

    return position;
  }

  /**
   * Выполнить сигнал
   */
  private executeSignal(
    account: PaperAccount,
    signal: StrategySignal,
    price: number,
    candles: Candle[]
  ): void {
    if (signal.type !== "LONG" && signal.type !== "SHORT") return;

    const direction = signal.type;

    // Размер позиции
    const positionSize = this.calculatePositionSize(account, price);

    // Выбираем тактики
    const tactics = this.selectTactics(account, signal);

    const position = this.createPosition(
      account,
      signal.symbol,
      direction,
      positionSize,
      price,
      account.config.maxLeverage,
      tactics
    );

    position.signalConfidence = signal.confidence;

    // Переопределяем SL/TP из сигнала если есть
    if (signal.suggestedStopLoss) {
      position.stopLoss = signal.suggestedStopLoss;
    }

    if (signal.suggestedTakeProfits && signal.suggestedTakeProfits.length > 0) {
      position.takeProfitTargets = signal.suggestedTakeProfits.map((tp, i) => ({
        index: i + 1,
        price: tp.price,
        closePercent: tp.percent,
        filled: false,
      }));
    }

    account.positions.push(position);

    this.emitEvent({
      type: "POSITION_OPENED",
      timestamp: new Date(),
      accountId: account.id,
      data: { position, signal },
    });
  }

  /**
   * Выбрать тактики для сигнала
   */
  private selectTactics(account: PaperAccount, signal: StrategySignal): TacticsSet | undefined {
    return account.config.tacticsSets[0];
  }

  /**
   * Проверить возможность открытия позиции
   */
  private canOpenPosition(account: PaperAccount, symbol: string): boolean {
    const openPositions = account.positions.filter(p => p.status === "OPEN").length;
    const hasSymbolPosition = account.positions.some(
      p => p.status === "OPEN" && p.symbol === symbol
    );

    return openPositions < account.config.maxOpenPositions && !hasSymbolPosition;
  }

  /**
   * Рассчитать размер позиции
   */
  private calculatePositionSize(account: PaperAccount, price: number): number {
    const riskAmount = account.balance * (account.config.maxRiskPerTrade / 100);
    return riskAmount / price;
  }

  /**
   * Рассчитать цену ликвидации
   */
  private calculateLiquidationPrice(
    entryPrice: number,
    direction: "LONG" | "SHORT",
    leverage: number
  ): number {
    const liquidationPercent = 100 / leverage;
    return direction === "LONG"
      ? entryPrice * (1 - liquidationPercent / 100)
      : entryPrice * (1 + liquidationPercent / 100);
  }

  /**
   * Рассчитать среднюю цену выхода
   */
  private calculateAvgExitPrice(position: PaperPosition): number {
    if (position.exits.length === 0) return 0;

    let totalValue = 0;
    let totalSize = 0;

    for (const exit of position.exits) {
      totalValue += exit.price * exit.size;
      totalSize += exit.size;
    }

    return totalSize > 0 ? totalValue / totalSize : 0;
  }

  /**
   * Создать сделку из позиции
   */
  private createTrade(position: PaperPosition, account: PaperAccount): PaperTrade {
    const totalSize = position.entries.reduce((sum, e) => sum + e.size, 0);
    const pnl = position.realizedPnl;
    const pnlPercent = (pnl / position.margin) * 100;

    return {
      id: `trade-${position.id}`,
      positionId: position.id,
      symbol: position.symbol,
      direction: position.direction,
      avgEntryPrice: position.avgEntryPrice,
      totalSize,
      openedAt: position.openedAt,
      avgExitPrice: position.avgExitPrice || 0,
      closedAt: position.closedAt || new Date(),
      closeReason: position.closeReason || "MANUAL",
      pnl,
      pnlPercent,
      fees: position.totalFees,
      netPnl: pnl - position.totalFees,
      durationMinutes: position.closedAt
        ? (position.closedAt.getTime() - position.openedAt.getTime()) / (1000 * 60)
        : 0,
      tacticsSetId: position.tacticsState.tacticsSetId,
    };
  }

  /**
   * Записать точку эквити
   */
  private recordEquityPoint(account: PaperAccount, prices: Record<string, number>): void {
    const now = Date.now();
    const lastRecord = this.lastEquityRecordTime.get(account.id) || 0;
    
    // Записываем не чаще раз в минуту
    if (now - lastRecord < 60000 && account.equityCurve.length > 0) {
      return;
    }
    
    this.lastEquityRecordTime.set(account.id, now);

    // Проверяем смену дня
    const currentDay = Math.floor(now / (24 * 60 * 60 * 1000));
    const prevDay = this.lastDay.get(account.id) || currentDay;
    
    if (currentDay !== prevDay) {
      this.dailyPnl.set(account.id, 0);
      this.lastDay.set(account.id, currentDay);
    }

    // Обновляем эквити
    account.unrealizedPnl = account.positions
      .filter(p => p.status === "OPEN")
      .reduce((sum, p) => sum + p.unrealizedPnl, 0);

    account.equity = account.balance + account.unrealizedPnl;

    // Обновляем максимальное эквити
    if (account.equity > account.maxEquity) {
      account.maxEquity = account.equity;
    }

    // Рассчитываем просадку
    account.currentDrawdown = ((account.maxEquity - account.equity) / account.maxEquity) * 100;
    if (account.currentDrawdown > account.maxDrawdown) {
      account.maxDrawdown = account.currentDrawdown;
    }

    // Обновляем PnL
    account.totalPnl = account.equity - account.initialBalance;
    account.totalPnlPercent = (account.totalPnl / account.initialBalance) * 100;

    const point: PaperEquityPoint = {
      timestamp: new Date(),
      balance: account.balance,
      equity: account.equity,
      availableMargin: account.availableMargin,
      unrealizedPnl: account.unrealizedPnl,
      realizedPnl: account.realizedPnl,
      dailyPnl: this.dailyPnl.get(account.id) || 0,
      cumulativePnl: account.totalPnl,
      drawdown: account.maxEquity - account.equity,
      drawdownPercent: account.currentDrawdown,
      maxDrawdown: account.maxEquity - account.initialBalance + (account.maxEquity - account.equity),
      maxDrawdownPercent: account.maxDrawdown,
      openPositions: account.positions.filter(p => p.status === "OPEN").length,
      tradesCount: account.tradeHistory.length,
      winsCount: account.tradeHistory.filter(t => t.pnl > 0).length,
      lossesCount: account.tradeHistory.filter(t => t.pnl <= 0).length,
      prices,
    };

    account.equityCurve.push(point);
    account.lastUpdate = new Date();
  }

  /**
   * Обновить метрики счёта
   */
  private updateAccountMetrics(account: PaperAccount): void {
    // Обновляем эквити
    account.unrealizedPnl = account.positions
      .filter(p => p.status === "OPEN")
      .reduce((sum, p) => sum + p.unrealizedPnl, 0);

    account.equity = account.balance + account.unrealizedPnl;
    account.availableMargin = account.balance;

    // Обновляем просадку
    if (account.equity > account.maxEquity) {
      account.maxEquity = account.equity;
    }

    account.currentDrawdown = ((account.maxEquity - account.equity) / account.maxEquity) * 100;
    account.maxDrawdown = Math.max(account.maxDrawdown, account.currentDrawdown);

    // Обновляем PnL
    account.totalPnl = account.equity - account.initialBalance;
    account.totalPnlPercent = (account.totalPnl / account.initialBalance) * 100;

    // Рассчитываем полные метрики
    account.metrics = this.calculateFullMetrics(account);

    // Проверяем максимальную просадку
    if (account.currentDrawdown >= account.config.maxDrawdown) {
      this.emitEvent({
        type: "MAX_DRAWDOWN_REACHED",
        timestamp: new Date(),
        accountId: account.id,
        data: { drawdown: account.currentDrawdown },
      });
    }

    account.lastUpdate = new Date();
  }

  /**
   * Рассчитать полные метрики
   */
  private calculateFullMetrics(account: PaperAccount): PaperTradingMetrics {
    const trades = account.tradeHistory;
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnl = trades.length > 0 ? totalPnl / trades.length : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0;

    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    // Streaks
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentStreak = 0;
    let currentType: "WIN" | "LOSS" | "NONE" = "NONE";

    for (const trade of trades) {
      if (trade.pnl > 0) {
        if (currentType === "WIN") {
          currentStreak++;
        } else {
          currentType = "WIN";
          currentStreak = 1;
        }
        maxWinStreak = Math.max(maxWinStreak, currentStreak);
      } else {
        if (currentType === "LOSS") {
          currentStreak++;
        } else {
          currentType = "LOSS";
          currentStreak = 1;
        }
        maxLossStreak = Math.max(maxLossStreak, currentStreak);
      }
    }

    // Sharpe Ratio из кривой эквити
    const returns = account.equityCurve.map((p, i) => {
      if (i === 0) return 0;
      return (p.equity - account.equityCurve[i - 1].equity) / account.equityCurve[i - 1].equity;
    }).filter(r => r !== 0);

    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0;

    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    // Trading days
    const tradingDays = account.startedAt
      ? Math.floor((Date.now() - account.startedAt.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    return {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      totalPnl,
      totalPnlPercent: account.totalPnlPercent,
      avgPnl,
      avgWin,
      avgLoss,
      maxWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
      maxLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      riskRewardRatio: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0,
      sharpeRatio,
      sortinoRatio: 0, // TODO
      calmarRatio: account.maxDrawdown > 0 ? (account.totalPnlPercent / account.maxDrawdown) : 0,
      maxDrawdown: account.maxDrawdown,
      maxDrawdownPercent: account.maxDrawdown,
      avgDrawdown: 0, // TODO
      timeInDrawdown: 0, // TODO
      maxDrawdownDuration: 0, // TODO
      maxWinStreak,
      maxLossStreak,
      currentStreak: { type: currentType, count: currentStreak },
      tradingDays,
      avgTradeDuration: trades.length > 0
        ? trades.reduce((sum, t) => sum + t.durationMinutes, 0) / trades.length
        : 0,
      avgWinDuration: wins.length > 0
        ? wins.reduce((sum, t) => sum + t.durationMinutes, 0) / wins.length
        : 0,
      avgLossDuration: losses.length > 0
        ? losses.reduce((sum, t) => sum + t.durationMinutes, 0) / losses.length
        : 0,
      avgDailyReturn: tradingDays > 0 ? account.totalPnlPercent / tradingDays : 0,
      avgWeeklyReturn: 0, // TODO
      avgMonthlyReturn: 0, // TODO
      annualizedReturn: tradingDays > 0 
        ? Math.pow(1 + account.totalPnlPercent / 100, 365 / tradingDays) - 1
        : 0,
      annualizedVolatility: stdReturn * Math.sqrt(252) * 100,
      marketExposure: 0, // TODO
      avgPositionSize: trades.length > 0
        ? trades.reduce((sum, t) => sum + t.totalSize, 0) / trades.length
        : 0,
      avgLeverage: account.positions.length > 0
        ? account.positions.reduce((sum, p) => sum + p.leverage, 0) / account.positions.length
        : account.config.maxLeverage,
      var95: 0, // TODO
      expectedShortfall95: 0, // TODO
    };
  }

  /**
   * Создать пустые метрики
   */
  private createEmptyMetrics(): PaperTradingMetrics {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      avgPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      maxWin: 0,
      maxLoss: 0,
      profitFactor: 0,
      riskRewardRatio: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      avgDrawdown: 0,
      timeInDrawdown: 0,
      maxDrawdownDuration: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      currentStreak: { type: "NONE", count: 0 },
      tradingDays: 0,
      avgTradeDuration: 0,
      avgWinDuration: 0,
      avgLossDuration: 0,
      avgDailyReturn: 0,
      avgWeeklyReturn: 0,
      avgMonthlyReturn: 0,
      annualizedReturn: 0,
      annualizedVolatility: 0,
      marketExposure: 0,
      avgPositionSize: 0,
      avgLeverage: 0,
      var95: 0,
      expectedShortfall95: 0,
    };
  }

  /**
   * Отправить событие
   */
  private emitEvent(event: PaperTradingEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("Event callback error:", error);
      }
    }
  }
}

// ==================== SINGLETON INSTANCE ====================

let paperTradingInstance: PaperTradingEngine | null = null;

/**
 * Получить singleton экземпляр PaperTradingEngine
 */
export function getPaperTradingEngine(): PaperTradingEngine {
  if (!paperTradingInstance) {
    paperTradingInstance = new PaperTradingEngine();
  }
  return paperTradingInstance;
}
