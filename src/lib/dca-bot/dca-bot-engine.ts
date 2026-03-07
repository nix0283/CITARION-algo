/**
 * DCA Bot Engine
 * 
 * Полнофункциональный движок DCA (Dollar Cost Averaging) бота.
 * 
 * Features:
 * - Base + Safety orders
 * - Multi-level Take Profit
 * - Trailing Stop
 * - Averaging down
 * - Risk management
 * - Paper trading support
 */

import { EventEmitter } from 'events';
import {
  DCABotConfig,
  DCABotState,
  DCABotStatus,
  DCABotEvent,
  DCABotEventType,
  DCAPosition,
  DCAEntry,
  DCAOrder,
  SafetyOrder,
  TakeProfitLevel,
  DCASignal,
  DCABotMetrics,
  DCABotAdapter,
} from './types';

// ==================== DCA BOT ENGINE ====================

export class DCABotEngine extends EventEmitter {
  private config: DCABotConfig;
  private state: DCABotState;
  private adapter: DCABotAdapter;
  
  // Price tracking
  private currentPrice: number = 0;
  private priceHistory: number[] = [];
  
  // Intervals
  private priceCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private scheduledEntryInterval: NodeJS.Timeout | null = null;
  
  // State
  private isProcessing: boolean = false;
  private safetyOrderIndex: number = 0;

  constructor(config: DCABotConfig, adapter: DCABotAdapter) {
    super();
    this.config = config;
    this.adapter = adapter;
    this.state = this.createInitialState();
  }

  // ==================== LIFECYCLE ====================

  /**
   * Запустить бота
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    try {
      this.state.status = 'STARTING';
      this.emitEvent('BOT_STARTED', { config: this.config });

      // Подключаемся к бирже
      await this.adapter.connect();
      
      // Получаем текущую цену
      this.currentPrice = await this.adapter.getCurrentPrice();
      this.state.currentPrice = this.currentPrice;
      this.state.highestPrice = this.currentPrice;
      this.state.lowestPrice = this.currentPrice;
      
      // Устанавливаем плечо
      await this.adapter.setLeverage(this.config.leverage);
      
      // Инициализируем safety orders
      this.initializeSafetyOrders();
      
      // Инициализируем take profit levels
      this.initializeTakeProfitLevels();
      
      // Запускаем мониторинг
      this.startPriceMonitoring();
      this.startMetricsCalculation();
      
      // Запускаем scheduled entries если нужно
      if (this.config.entryType === 'scheduled' || this.config.entryType === 'hybrid') {
        this.startScheduledEntries();
      }
      
      this.state.status = 'RUNNING';
      this.state.startedAt = new Date();
      this.state.lastUpdate = new Date();
      
      // Открываем начальную позицию если тип signal или hybrid
      if (this.config.entryType === 'signal' || this.config.entryType === 'hybrid') {
        await this.openBasePosition();
      }

      return { success: true };
    } catch (error) {
      this.state.status = 'ERROR';
      this.emitEvent('ERROR', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Остановить бота
   */
  async stop(closePosition: boolean = true): Promise<void> {
    this.state.status = 'STOPPING';
    
    // Останавливаем мониторинг
    this.stopMonitoring();
    
    // Закрываем позицию
    if (closePosition && this.state.position) {
      await this.closePosition('MANUAL');
    }
    
    // Закрываем соединение
    await this.adapter.disconnect();
    
    this.state.status = 'STOPPED';
    this.state.stoppedAt = new Date();
    
    this.emitEvent('BOT_STOPPED', { 
      totalPnl: this.state.totalPnl,
      totalTrades: this.state.totalTrades 
    });
  }

  /**
   * Пауза бота
   */
  async pause(): Promise<void> {
    if (this.state.status !== 'RUNNING') return;
    
    this.state.status = 'PAUSED';
    this.stopMonitoring();
    
    this.emitEvent('BOT_PAUSED', {});
  }

  /**
   * Возобновление работы
   */
  async resume(): Promise<void> {
    if (this.state.status !== 'PAUSED') return;
    
    this.state.status = 'RUNNING';
    this.startPriceMonitoring();
    
    this.emitEvent('BOT_RESUMED', {});
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Открыть базовую позицию
   */
  private async openBasePosition(): Promise<void> {
    if (this.state.position) return;
    
    // Рассчитываем размер позиции
    const quantity = this.calculateBaseQuantity();
    
    // Размещаем ордер
    const orderResult = await this.adapter.placeOrder({
      symbol: this.config.symbol,
      side: 'BUY',  // DCA обычно long
      type: 'MARKET',
      quantity,
      clientOrderId: `dca_${this.config.id}_base_${Date.now()}`,
    });
    
    if (!orderResult.success || !orderResult.order) {
      this.emitEvent('ERROR', { error: orderResult.error || 'Failed to open base position' });
      return;
    }
    
    // Создаём позицию
    const entry: DCAEntry = {
      index: 0,
      type: 'BASE',
      price: orderResult.order.avgPrice,
      quantity: orderResult.order.filledQuantity,
      amount: orderResult.order.avgPrice * orderResult.order.filledQuantity,
      order: orderResult.order,
      timestamp: new Date(),
    };
    
    const position: DCAPosition = {
      id: `pos_${this.config.id}_${Date.now()}`,
      symbol: this.config.symbol,
      side: 'LONG',
      entries: [entry],
      totalQuantity: entry.quantity,
      avgEntryPrice: entry.price,
      totalInvested: entry.amount,
      safetyOrdersUsed: 0,
      safetyOrdersRemaining: this.config.safetyOrdersCount,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      realizedPnl: 0,
      fees: orderResult.order.fee,
      funding: 0,
      currentLevel: 0,
      nextSafetyOrderPrice: this.calculateNextSafetyOrderPrice(entry.price, 1),
      takeProfitPrice: this.calculateTakeProfitPrice(entry.price),
      stopLossPrice: this.calculateStopLossPrice(entry.price),
      openedAt: new Date(),
      lastUpdate: new Date(),
      durationMinutes: 0,
      status: 'OPEN',
    };
    
    this.state.position = position;
    this.state.entryPrice = entry.price;
    this.state.lastEntryTime = new Date();
    this.state.status = 'IN_POSITION';
    
    this.emitEvent('POSITION_OPENED', { position, entry });
  }

  /**
   * Добавить safety order
   */
  private async addSafetyOrder(): Promise<void> {
    if (!this.state.position) return;
    if (this.state.position.safetyOrdersUsed >= this.config.maxSafetyOrders) return;
    
    const position = this.state.position;
    const safetyLevel = position.safetyOrdersUsed + 1;
    
    // Находим pending safety order
    const safetyOrder = this.state.safetyOrders.find(
      so => so.level === safetyLevel && so.status === 'TRIGGERED'
    );
    
    if (!safetyOrder) return;
    
    // Рассчитываем количество с масштабированием
    const baseQuantity = this.calculateBaseQuantity();
    const scaledQuantity = baseQuantity * Math.pow(this.config.safetyOrderVolumeScale, safetyLevel - 1);
    
    // Размещаем ордер
    const orderResult = await this.adapter.placeOrder({
      symbol: this.config.symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: scaledQuantity,
      clientOrderId: `dca_${this.config.id}_safety_${safetyLevel}_${Date.now()}`,
    });
    
    if (!orderResult.success || !orderResult.order) {
      this.emitEvent('ERROR', { error: orderResult.error || 'Failed to place safety order' });
      return;
    }
    
    // Обновляем safety order
    safetyOrder.status = 'FILLED';
    safetyOrder.order = orderResult.order;
    safetyOrder.filledAt = new Date();
    
    // Добавляем entry в позицию
    const entry: DCAEntry = {
      index: position.entries.length,
      type: 'SAFETY',
      price: orderResult.order.avgPrice,
      quantity: orderResult.order.filledQuantity,
      amount: orderResult.order.avgPrice * orderResult.order.filledQuantity,
      order: orderResult.order,
      timestamp: new Date(),
    };
    
    position.entries.push(entry);
    
    // Пересчитываем среднюю цену
    const totalQuantity = position.entries.reduce((sum, e) => sum + e.quantity, 0);
    const totalInvested = position.entries.reduce((sum, e) => sum + e.amount, 0);
    
    position.totalQuantity = totalQuantity;
    position.avgEntryPrice = totalInvested / totalQuantity;
    position.totalInvested = totalInvested;
    position.safetyOrdersUsed = safetyLevel;
    position.safetyOrdersRemaining = this.config.safetyOrdersCount - safetyLevel;
    position.currentLevel = safetyLevel;
    position.fees += orderResult.order.fee;
    position.nextSafetyOrderPrice = this.calculateNextSafetyOrderPrice(
      position.avgEntryPrice,
      safetyLevel + 1
    );
    position.lastUpdate = new Date();
    
    this.state.lastEntryTime = new Date();
    
    this.emitEvent('SAFETY_ORDER_FILLED', { safetyOrder: entry, level: safetyLevel, position });
  }

  /**
   * Усреднение позиции
   */
  private async averageDown(): Promise<void> {
    if (!this.state.position) return;
    if (!this.config.averagingEnabled) return;
    
    const position = this.state.position;
    
    // Рассчитываем количество с масштабированием
    const baseQuantity = this.calculateBaseQuantity();
    const scaledQuantity = baseQuantity * this.config.averagingScale;
    
    // Размещаем ордер
    const orderResult = await this.adapter.placeOrder({
      symbol: this.config.symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: scaledQuantity,
      clientOrderId: `dca_${this.config.id}_avg_${Date.now()}`,
    });
    
    if (!orderResult.success || !orderResult.order) {
      return;
    }
    
    // Добавляем entry
    const entry: DCAEntry = {
      index: position.entries.length,
      type: 'AVERAGING',
      price: orderResult.order.avgPrice,
      quantity: orderResult.order.filledQuantity,
      amount: orderResult.order.avgPrice * orderResult.order.filledQuantity,
      order: orderResult.order,
      timestamp: new Date(),
    };
    
    position.entries.push(entry);
    
    // Пересчитываем
    const totalQuantity = position.entries.reduce((sum, e) => sum + e.quantity, 0);
    const totalInvested = position.entries.reduce((sum, e) => sum + e.amount, 0);
    
    position.totalQuantity = totalQuantity;
    position.avgEntryPrice = totalInvested / totalQuantity;
    position.totalInvested = totalInvested;
    position.fees += orderResult.order.fee;
    position.lastUpdate = new Date();
    
    this.emitEvent('AVERAGING_TRIGGERED', { entry, position });
  }

  /**
   * Закрыть позицию
   */
  private async closePosition(reason: DCAPosition['closeReason']): Promise<void> {
    if (!this.state.position) return;
    
    const position = this.state.position;
    position.status = 'CLOSING';
    
    // Закрываем все ордера
    const closeQuantity = position.totalQuantity;
    
    const orderResult = await this.adapter.placeOrder({
      symbol: this.config.symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: closeQuantity,
      clientOrderId: `dca_${this.config.id}_close_${Date.now()}`,
    });
    
    if (!orderResult.success || !orderResult.order) {
      this.emitEvent('ERROR', { error: orderResult.error || 'Failed to close position' });
      position.status = 'OPEN';
      return;
    }
    
    // Рассчитываем финальный PnL
    const closePrice = orderResult.order.avgPrice;
    const closeAmount = closePrice * closeQuantity;
    const pnl = closeAmount - position.totalInvested - position.fees - orderResult.order.fee;
    const pnlPercent = (pnl / position.totalInvested) * 100;
    
    position.status = 'CLOSED';
    position.closeReason = reason;
    position.realizedPnl = pnl;
    position.unrealizedPnl = 0;
    position.unrealizedPnlPercent = 0;
    position.fees += orderResult.order.fee;
    
    // Обновляем статистику
    this.state.totalTrades++;
    this.state.totalPnl += pnl;
    this.state.totalFees += position.fees;
    this.state.totalVolume += position.totalInvested + closeAmount;
    
    if (pnl > 0) {
      this.state.winTrades++;
    } else {
      this.state.lossTrades++;
    }
    
    // Reset position
    this.state.position = null;
    this.state.entryPrice = undefined;
    this.state.status = 'RUNNING';
    
    this.emitEvent('POSITION_CLOSED', { 
      position, 
      closePrice, 
      pnl, 
      pnlPercent, 
      reason 
    });
    
    // Переинициализируем safety orders для следующей позиции
    this.initializeSafetyOrders();
    this.initializeTakeProfitLevels();
  }

  // ==================== TAKE PROFIT ====================

  /**
   * Проверить take profit
   */
  private checkTakeProfit(): void {
    if (!this.state.position) return;
    if (!this.config.takeProfitEnabled) return;
    
    const position = this.state.position;
    const pnlPercent = position.unrealizedPnlPercent;
    
    if (this.config.takeProfitType === 'total') {
      // Простой TP - закрыть всю позицию
      if (pnlPercent >= this.config.takeProfitPercent) {
        this.emitEvent('TAKE_PROFIT_TRIGGERED', { pnlPercent, level: 'total' });
        this.closePosition('TAKE_PROFIT');
      }
    } else {
      // Multi-level TP
      for (const tpLevel of this.state.takeProfitLevels) {
        if (tpLevel.status !== 'PENDING') continue;
        
        if (pnlPercent >= tpLevel.profitPercent) {
          this.executeTakeProfitLevel(tpLevel);
        }
      }
    }
  }

  /**
   * Исполнить уровень TP
   */
  private async executeTakeProfitLevel(tpLevel: TakeProfitLevel): Promise<void> {
    if (!this.state.position) return;
    
    const position = this.state.position;
    const closeQuantity = position.totalQuantity * (tpLevel.closePercent / 100);
    
    tpLevel.status = 'TRIGGERED';
    
    const orderResult = await this.adapter.placeOrder({
      symbol: this.config.symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: closeQuantity,
      clientOrderId: `dca_${this.config.id}_tp_${tpLevel.level}_${Date.now()}`,
    });
    
    if (orderResult.success && orderResult.order) {
      tpLevel.status = 'FILLED';
      tpLevel.filledAt = new Date();
      tpLevel.filledPrice = orderResult.order.avgPrice;
      
      position.totalQuantity -= closeQuantity;
      position.fees += orderResult.order.fee;
      
      this.emitEvent('TAKE_PROFIT_FILLED', { level: tpLevel, filledQuantity: closeQuantity });
      
      // Если позиция закрыта полностью
      if (position.totalQuantity <= 0) {
        position.status = 'CLOSED';
        position.closeReason = 'TAKE_PROFIT';
        this.state.position = null;
        this.state.status = 'RUNNING';
      }
    }
  }

  // ==================== STOP LOSS ====================

  /**
   * Проверить stop loss
   */
  private checkStopLoss(): void {
    if (!this.state.position) return;
    if (!this.config.stopLossEnabled) return;
    
    const position = this.state.position;
    const pnlPercent = position.unrealizedPnlPercent;
    
    if (this.config.stopLossType === 'total') {
      if (pnlPercent <= -this.config.stopLossPercent) {
        this.emitEvent('STOP_LOSS_TRIGGERED', { pnlPercent });
        this.closePosition('STOP_LOSS');
      }
    } else if (this.config.trailingStopEnabled) {
      // Trailing stop обрабатывается отдельно
    }
  }

  /**
   * Обновить trailing stop
   */
  private updateTrailingStop(): void {
    if (!this.state.position) return;
    if (!this.config.trailingStopEnabled) return;
    
    const position = this.state.position;
    const pnlPercent = position.unrealizedPnlPercent;
    
    // Активация trailing stop
    if (!this.state.trailingActivated && pnlPercent >= this.config.trailingStopActivation) {
      this.state.trailingActivated = true;
      this.state.trailingStopPrice = this.currentPrice * (1 - this.config.trailingStopDistance / 100);
      
      this.emitEvent('TRAILING_STOP_ACTIVATED', { 
        activationPrice: this.currentPrice,
        trailingStopPrice: this.state.trailingStopPrice 
      });
    }
    
    // Обновление trailing stop
    if (this.state.trailingActivated) {
      const newTrailingPrice = this.currentPrice * (1 - this.config.trailingStopDistance / 100);
      
      if (newTrailingPrice > (this.state.trailingStopPrice || 0)) {
        this.state.trailingStopPrice = newTrailingPrice;
        
        this.emitEvent('TRAILING_STOP_UPDATED', { trailingStopPrice: newTrailingPrice });
      }
      
      // Проверка срабатывания
      if (this.currentPrice <= (this.state.trailingStopPrice || 0)) {
        this.emitEvent('STOP_LOSS_TRIGGERED', { type: 'TRAILING', price: this.currentPrice });
        this.closePosition('STOP_LOSS');
      }
    }
  }

  // ==================== SAFETY ORDERS ====================

  /**
   * Инициализировать safety orders
   */
  private initializeSafetyOrders(): void {
    if (!this.config.safetyOrdersEnabled) {
      this.state.safetyOrders = [];
      return;
    }
    
    const safetyOrders: SafetyOrder[] = [];
    const basePrice = this.currentPrice;
    
    for (let i = 1; i <= this.config.safetyOrdersCount; i++) {
      const deviation = this.config.safetyOrderPriceDeviation * i;
      const triggerPrice = basePrice * (1 - deviation / 100);
      const quantity = this.calculateBaseQuantity() * Math.pow(this.config.safetyOrderVolumeScale, i - 1);
      
      safetyOrders.push({
        level: i,
        triggerPrice,
        triggerDeviation: deviation,
        quantity,
        amount: triggerPrice * quantity,
        status: 'PENDING',
      });
    }
    
    this.state.safetyOrders = safetyOrders;
    this.state.pendingSafetyOrders = safetyOrders.length;
  }

  /**
   * Проверить триггеры safety orders
   */
  private checkSafetyOrders(): void {
    if (!this.state.position) return;
    
    for (const safetyOrder of this.state.safetyOrders) {
      if (safetyOrder.status !== 'PENDING') continue;
      
      // Проверяем достижение цены триггера
      if (this.currentPrice <= safetyOrder.triggerPrice) {
        safetyOrder.status = 'TRIGGERED';
        this.state.pendingSafetyOrders--;
        
        this.emitEvent('SAFETY_ORDER_TRIGGERED', { 
          level: safetyOrder.level, 
          triggerPrice: safetyOrder.triggerPrice,
          currentPrice: this.currentPrice 
        });
        
        // Исполняем safety order
        this.addSafetyOrder();
      }
    }
  }

  /**
   * Рассчитать цену следующего safety order
   */
  private calculateNextSafetyOrderPrice(avgPrice: number, level: number): number {
    const deviation = this.config.safetyOrderPriceDeviation * level;
    return avgPrice * (1 - deviation / 100);
  }

  // ==================== TAKE PROFIT LEVELS ====================

  /**
   * Инициализировать take profit levels
   */
  private initializeTakeProfitLevels(): void {
    if (!this.config.takeProfitPerLevel) {
      this.state.takeProfitLevels = [];
      return;
    }
    
    this.state.takeProfitLevels = this.config.takeProfitPerLevel.map((tp, index) => ({
      level: index + 1,
      profitPercent: tp.profitPercent,
      closePercent: tp.closePercent,
      status: 'PENDING',
    }));
  }

  /**
   * Рассчитать цену take profit
   */
  private calculateTakeProfitPrice(entryPrice: number): number {
    return entryPrice * (1 + this.config.takeProfitPercent / 100);
  }

  /**
   * Рассчитать цену stop loss
   */
  private calculateStopLossPrice(entryPrice: number): number {
    return entryPrice * (1 - this.config.stopLossPercent / 100);
  }

  // ==================== MONITORING ====================

  /**
   * Запустить мониторинг цен
   */
  private startPriceMonitoring(): void {
    this.adapter.subscribePrice((price: number) => {
      this.handlePriceUpdate(price);
    });
    
    // Fallback polling
    this.priceCheckInterval = setInterval(async () => {
      if (this.state.status !== 'RUNNING' && this.state.status !== 'IN_POSITION') return;
      
      try {
        const price = await this.adapter.getCurrentPrice();
        this.handlePriceUpdate(price);
      } catch (error) {
        console.error('[DCABot] Price check error:', error);
      }
    }, 5000);
  }

  /**
   * Обработка обновления цены
   */
  private handlePriceUpdate(price: number): void {
    this.currentPrice = price;
    this.state.currentPrice = price;
    
    // Обновляем экстремумы
    if (price > this.state.highestPrice) {
      this.state.highestPrice = price;
    }
    if (price < this.state.lowestPrice) {
      this.state.lowestPrice = price;
    }
    
    // Обновляем позицию
    if (this.state.position) {
      this.updatePositionMetrics(price);
      
      // Проверяем safety orders
      this.checkSafetyOrders();
      
      // Проверяем averaging
      if (this.config.averagingEnabled) {
        this.checkAveraging();
      }
      
      // Проверяем take profit
      this.checkTakeProfit();
      
      // Проверяем stop loss
      this.checkStopLoss();
      
      // Обновляем trailing stop
      this.updateTrailingStop();
      
      // Проверяем max time
      this.checkMaxOpenTime();
    }
    
    // Проверяем risk limits
    this.checkRiskLimits();
    
    this.state.lastUpdate = new Date();
    
    this.emitEvent('PRICE_UPDATE', { price });
  }

  /**
   * Обновить метрики позиции
   */
  private updatePositionMetrics(price: number): void {
    if (!this.state.position) return;
    
    const position = this.state.position;
    
    // Нереализованный PnL
    position.unrealizedPnl = (price - position.avgEntryPrice) * position.totalQuantity;
    position.unrealizedPnlPercent = (position.unrealizedPnl / position.totalInvested) * 100;
    
    // Длительность
    position.durationMinutes = (Date.now() - position.openedAt.getTime()) / 60000;
    position.lastUpdate = new Date();
  }

  /**
   * Проверить averaging
   */
  private checkAveraging(): void {
    if (!this.state.position) return;
    
    const position = this.state.position;
    const priceDrop = ((position.avgEntryPrice - this.currentPrice) / position.avgEntryPrice) * 100;
    
    if (priceDrop >= this.config.averagingThreshold) {
      this.averageDown();
    }
  }

  /**
   * Проверить максимальное время открытой позиции
   */
  private checkMaxOpenTime(): void {
    if (!this.state.position) return;
    if (!this.config.maxOpenTime) return;
    
    const position = this.state.position;
    
    if (position.durationMinutes >= this.config.maxOpenTime * 60) {
      this.emitEvent('MAX_TIME_REACHED', { duration: position.durationMinutes });
      this.closePosition('MAX_TIME');
    }
  }

  /**
   * Проверить risk limits
   */
  private checkRiskLimits(): void {
    // Max drawdown
    if (this.state.currentDrawdown >= this.config.maxDrawdown) {
      this.emitEvent('MAX_DRAWDOWN_REACHED', { 
        drawdown: this.state.currentDrawdown,
        maxAllowed: this.config.maxDrawdown 
      });
      this.stop(true);
    }
    
    // Max daily loss
    if (this.state.dailyLoss >= this.config.maxDailyLoss) {
      this.emitEvent('ERROR', { error: 'Max daily loss reached' });
      this.stop(true);
    }
  }

  /**
   * Запустить расчёт метрик
   */
  private startMetricsCalculation(): void {
    this.metricsInterval = setInterval(() => {
      this.calculateMetrics();
    }, 60000);
  }

  /**
   * Запустить scheduled entries
   */
  private startScheduledEntries(): void {
    if (!this.config.entryInterval) return;
    
    this.scheduledEntryInterval = setInterval(async () => {
      if (this.state.status !== 'RUNNING') return;
      
      // Добавляем к позиции или создаём новую
      if (this.state.position) {
        await this.averageDown();
      } else {
        await this.openBasePosition();
      }
    }, this.config.entryInterval * 60000);
  }

  /**
   * Остановить мониторинг
   */
  private stopMonitoring(): void {
    if (this.priceCheckInterval) {
      clearInterval(this.priceCheckInterval);
      this.priceCheckInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    if (this.scheduledEntryInterval) {
      clearInterval(this.scheduledEntryInterval);
      this.scheduledEntryInterval = null;
    }
    
    this.adapter.unsubscribePrice();
  }

  // ==================== CALCULATIONS ====================

  /**
   * Рассчитать количество базового ордера
   */
  private calculateBaseQuantity(): number {
    if (this.config.baseOrderType === 'fixed') {
      return this.config.baseOrderAmount / this.currentPrice;
    } else {
      // Percent of balance
      const balance = 10000; // TODO: get from adapter
      return (balance * this.config.baseOrderAmount / 100) / this.currentPrice;
    }
  }

  /**
   * Рассчитать метрики
   */
  private calculateMetrics(): DCABotMetrics {
    const trades = this.state.totalTrades;
    const wins = this.state.winTrades;
    const losses = this.state.lossTrades;
    
    return {
      totalReturn: this.state.totalPnl,
      totalReturnPercent: this.state.totalPnl / 10000 * 100, // TODO: use actual balance
      avgReturnPerTrade: trades > 0 ? this.state.totalPnl / trades : 0,
      
      maxDrawdown: this.state.maxDrawdown,
      maxDrawdownPercent: this.state.maxDrawdownPercent,
      sharpeRatio: this.calculateSharpeRatio(),
      sortinoRatio: this.calculateSortinoRatio(),
      calmarRatio: this.state.maxDrawdown > 0 ? (this.state.totalPnl / 10000 * 100) / this.state.maxDrawdown : 0,
      
      totalTrades: trades,
      winRate: trades > 0 ? (wins / trades) * 100 : 0,
      profitFactor: this.calculateProfitFactor(),
      avgWin: 0, // TODO
      avgLoss: 0, // TODO
      avgTradeDuration: 0, // TODO
      
      avgSafetyOrdersUsed: trades > 0 ? 0 : 0, // TODO
      avgEntriesPerPosition: trades > 0 ? 0 : 0, // TODO
      avgCostReduction: 0,
      safetyOrderSuccessRate: 0,
      
      totalFees: this.state.totalFees,
      avgSlippage: 0,
      orderFillRate: 1,
    };
  }

  private calculateSharpeRatio(): number {
    return 0; // TODO
  }

  private calculateSortinoRatio(): number {
    return 0; // TODO
  }

  private calculateProfitFactor(): number {
    return this.state.lossTrades > 0 ? this.state.winTrades / this.state.lossTrades : 1;
  }

  // ==================== HELPERS ====================

  /**
   * Создать начальное состояние
   */
  private createInitialState(): DCABotState {
    return {
      id: this.config.id,
      status: 'IDLE',
      position: null,
      safetyOrders: [],
      pendingSafetyOrders: 0,
      takeProfitLevels: [],
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      totalPnl: 0,
      totalFees: 0,
      totalVolume: 0,
      currentDrawdown: 0,
      maxDrawdown: 0,
      dailyPnl: 0,
      dailyLoss: 0,
      lastUpdate: new Date(),
      currentPrice: 0,
      highestPrice: 0,
      lowestPrice: Infinity,
      trailingActivated: false,
    };
  }

  /**
   * Отправить событие
   */
  private emitEvent(type: DCABotEventType, data: any): void {
    const event: DCABotEvent = {
      type,
      timestamp: new Date(),
      botId: this.config.id,
      data,
    };
    
    this.emit(type, event);
    this.emit('event', event);
  }

  // ==================== GETTERS ====================

  getConfig(): DCABotConfig {
    return this.config;
  }

  getState(): DCABotState {
    return this.state;
  }

  getMetrics(): DCABotMetrics {
    return this.calculateMetrics();
  }

  getCurrentPrice(): number {
    return this.currentPrice;
  }
}
