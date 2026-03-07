/**
 * Grid Bot Engine
 * 
 * Полнофункциональный движок сеточного торгового бота.
 * 
 * Features:
 * - Arithmetic, Geometric, Adaptive grids
 * - Exchange integration via adapter pattern
 * - Paper trading support
 * - Trailing grid
 * - Risk management
 * - Real-time price feed
 */

import { EventEmitter } from 'events';
import {
  GridBotConfig,
  GridBotState,
  GridBotStatus,
  GridBotEvent,
  GridBotEventType,
  GridLevel,
  GridOrder,
  GridTrade,
  GridSignal,
  GridBotMetrics,
  GridBotAdapter,
  PriceUpdate,
  OrderbookSnapshot,
} from './types';

// ==================== GRID BOT ENGINE ====================

export class GridBotEngine extends EventEmitter {
  private config: GridBotConfig;
  private state: GridBotState;
  private adapter: GridBotAdapter;
  private trades: GridTrade[] = [];
  private pendingSignals: GridSignal[] = [];
  
  // Price tracking
  private currentPrice: number = 0;
  private priceHistory: number[] = [];
  private lastPriceUpdate: Date = new Date();
  
  // Intervals
  private priceCheckInterval: NodeJS.Timeout | null = null;
  private orderCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  // Trading state
  private isProcessing: boolean = false;
  private orderQueue: string[] = [];

  constructor(config: GridBotConfig, adapter: GridBotAdapter) {
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
      
      // Устанавливаем плечо
      await this.adapter.setLeverage(this.config.leverage);
      
      // Инициализируем сетку
      await this.initializeGrid();
      
      // Запускаем мониторинг
      this.startPriceMonitoring();
      this.startOrderMonitoring();
      this.startMetricsCalculation();
      
      this.state.status = 'RUNNING';
      this.state.startedAt = new Date();
      this.state.lastUpdate = new Date();
      
      this.emitEvent('GRID_INITIALIZED', {
        levels: this.state.gridLevels.length,
        upperPrice: this.state.currentUpperPrice,
        lowerPrice: this.state.currentLowerPrice,
      });

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
  async stop(cancelOrders: boolean = true): Promise<void> {
    this.state.status = 'STOPPING';
    
    // Останавливаем мониторинг
    this.stopMonitoring();
    
    // Отменяем ордера
    if (cancelOrders) {
      await this.cancelAllOrders();
    }
    
    // Закрываем соединение
    await this.adapter.disconnect();
    
    this.state.status = 'STOPPED';
    this.state.stoppedAt = new Date();
    
    this.emitEvent('BOT_STOPPED', { 
      finalPnl: this.state.realizedPnl,
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
    await this.cancelAllOrders();
    
    this.emitEvent('BOT_PAUSED', {});
  }

  /**
   * Возобновление работы
   */
  async resume(): Promise<void> {
    if (this.state.status !== 'PAUSED') return;
    
    this.state.status = 'RUNNING';
    await this.placeGridOrders();
    this.startPriceMonitoring();
    this.startOrderMonitoring();
    
    this.emitEvent('BOT_RESUMED', {});
  }

  // ==================== GRID INITIALIZATION ====================

  /**
   * Инициализировать сетку
   */
  private async initializeGrid(): Promise<void> {
    const { upperPrice, lowerPrice, gridLevels, gridType } = this.config;
    
    let prices: number[];
    
    switch (gridType) {
      case 'arithmetic':
        prices = this.createArithmeticGrid(lowerPrice, upperPrice, gridLevels);
        break;
      case 'geometric':
        prices = this.createGeometricGrid(lowerPrice, upperPrice, gridLevels);
        break;
      case 'adaptive':
        prices = await this.createAdaptiveGrid(lowerPrice, upperPrice, gridLevels);
        break;
      default:
        prices = this.createArithmeticGrid(lowerPrice, upperPrice, gridLevels);
    }
    
    this.state.gridLevels = prices.map((price, index) => ({
      index,
      price,
      quantity: this.calculateLevelQuantity(price),
      filled: false,
    }));
    
    this.state.currentUpperPrice = upperPrice;
    this.state.currentLowerPrice = lowerPrice;
    
    // Выставляем начальные ордера
    await this.placeGridOrders();
  }

  /**
   * Арифметическая сетка (равные интервалы)
   */
  private createArithmeticGrid(
    lower: number, 
    upper: number, 
    levels: number
  ): number[] {
    const step = (upper - lower) / (levels - 1);
    return Array.from({ length: levels }, (_, i) => lower + step * i);
  }

  /**
   * Геометрическая сетка (равные проценты)
   */
  private createGeometricGrid(
    lower: number, 
    upper: number, 
    levels: number
  ): number[] {
    const ratio = Math.pow(upper / lower, 1 / (levels - 1));
    return Array.from({ length: levels }, (_, i) => lower * Math.pow(ratio, i));
  }

  /**
   * Адаптивная сетка (на основе волатильности)
   */
  private async createAdaptiveGrid(
    lower: number, 
    upper: number, 
    levels: number
  ): Promise<number[]> {
    // Получаем волатильность для адаптации сетки
    const orderbook = await this.adapter.getOrderbook(20);
    const volatility = this.calculateOrderbookVolatility(orderbook);
    
    // Больше уровней в зонах высокой ликвидности
    const prices: number[] = [];
    const baseStep = (upper - lower) / levels;
    
    for (let i = 0; i < levels; i++) {
      const basePrice = lower + baseStep * i;
      
      // Корректируем цену на основе ликвидности
      const liquidity = this.getLiquidityAtPrice(orderbook, basePrice);
      const adjustment = (liquidity - 0.5) * baseStep * 0.3;
      
      prices.push(Math.max(lower, Math.min(upper, basePrice + adjustment)));
    }
    
    return prices.sort((a, b) => a - b);
  }

  // ==================== ORDER MANAGEMENT ====================

  /**
   * Выставить ордера сетки
   */
  private async placeGridOrders(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    try {
      const balance = await this.adapter.getBalance();
      
      for (const level of this.state.gridLevels) {
        if (level.filled) continue;
        
        // Определяем тип ордера на основе цены
        const isBelowCurrent = level.price < this.currentPrice;
        
        // Пропускаем уровни слишком близко к текущей цене
        const priceDiff = Math.abs(level.price - this.currentPrice) / this.currentPrice;
        if (priceDiff < 0.001) continue;
        
        // Проверяем достаточно ли баланса
        const requiredQuote = level.quantity * level.price;
        if (isBelowCurrent && balance.availableQuote < requiredQuote) continue;
        
        // Выставляем ордер
        const order = await this.adapter.placeOrder({
          symbol: this.config.symbol,
          side: isBelowCurrent ? 'BUY' : 'SELL',
          type: this.config.orderType,
          quantity: level.quantity,
          price: level.price,
          clientOrderId: `grid_${this.config.id}_${level.index}`,
        });
        
        if (order.success && order.order) {
          if (isBelowCurrent) {
            level.buyOrder = order.order;
          } else {
            level.sellOrder = order.order;
          }
          
          this.emitEvent('ORDER_PLACED', {
            level: level.index,
            order: order.order,
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Отменить все ордера
   */
  private async cancelAllOrders(): Promise<void> {
    const openOrders = await this.adapter.getOpenOrders();
    
    for (const order of openOrders) {
      try {
        await this.adapter.cancelOrder(order.id);
        this.emitEvent('ORDER_CANCELLED', { orderId: order.id });
      } catch (error) {
        console.error(`Failed to cancel order ${order.id}:`, error);
      }
    }
    
    // Очищаем ордера в уровнях
    for (const level of this.state.gridLevels) {
      level.buyOrder = undefined;
      level.sellOrder = undefined;
    }
  }

  /**
   * Обновить сетку после исполнения ордера
   */
  private async handleFilledOrder(filledOrder: GridOrder): Promise<void> {
    // Находим уровень
    const level = this.state.gridLevels.find(
      l => l.buyOrder?.id === filledOrder.id || l.sellOrder?.id === filledOrder.id
    );
    
    if (!level) return;
    
    const isBuy = filledOrder.side === 'BUY';
    
    // Обновляем уровень
    level.filled = true;
    level.filledAt = new Date();
    level.avgFillPrice = filledOrder.avgPrice;
    
    this.emitEvent('ORDER_FILLED', {
      level: level.index,
      order: filledOrder,
    });
    
    // Создаём сделку
    const trade = this.createTrade(level, filledOrder);
    this.trades.push(trade);
    
    // Выставляем противоположный ордер
    await this.placeCounterOrder(level, isBuy);
    
    // Обновляем статистику
    this.state.totalTrades++;
    if (trade.pnl > 0) {
      this.state.winTrades++;
    } else {
      this.state.lossTrades++;
    }
    
    this.state.totalVolume += filledOrder.filledQuantity * filledOrder.avgPrice;
    this.state.totalFees += filledOrder.fee;
  }

  /**
   * Выставить противоположный ордер
   */
  private async placeCounterOrder(level: GridLevel, wasBuy: boolean): Promise<void> {
    // Находим следующий уровень для продажи/покупки
    const targetLevel = wasBuy 
      ? this.findNextUpperLevel(level.price)
      : this.findNextLowerLevel(level.price);
    
    if (!targetLevel) {
      // Если нет уровня, создаем новый на том же расстоянии
      const spread = this.calculateGridSpread();
      const newPrice = wasBuy 
        ? level.price + spread
        : level.price - spread;
      
      // Выставляем ордер
      const order = await this.adapter.placeOrder({
        symbol: this.config.symbol,
        side: wasBuy ? 'SELL' : 'BUY',
        type: this.config.orderType,
        quantity: level.quantity,
        price: newPrice,
      });
      
      if (order.success && order.order) {
        if (wasBuy) {
          targetLevel.sellOrder = order.order;
        } else {
          targetLevel.buyOrder = order.order;
        }
      }
    }
  }

  // ==================== MONITORING ====================

  /**
   * Запустить мониторинг цен
   */
  private startPriceMonitoring(): void {
    // Подписываемся на обновления цен через WebSocket
    this.adapter.subscribePrice((price: number) => {
      this.handlePriceUpdate(price);
    });
    
    // Fallback polling
    this.priceCheckInterval = setInterval(async () => {
      try {
        const price = await this.adapter.getCurrentPrice();
        this.handlePriceUpdate(price);
      } catch (error) {
        console.error('Price check error:', error);
      }
    }, 5000);
  }

  /**
   * Обработка обновления цены
   */
  private handlePriceUpdate(price: number): void {
    this.currentPrice = price;
    this.priceHistory.push(price);
    this.lastPriceUpdate = new Date();
    
    // Ограничиваем историю
    if (this.priceHistory.length > 1000) {
      this.priceHistory = this.priceHistory.slice(-500);
    }
    
    // Обновляем PnL
    this.updateUnrealizedPnl();
    
    // Проверяем trailing
    if (this.config.trailingEnabled) {
      this.updateTrailing(price);
    }
    
    // Проверяем risk limits
    this.checkRiskLimits();
    
    // Адаптивная ребалансировка
    if (this.config.rebalanceEnabled) {
      this.checkRebalance();
    }
    
    this.emitEvent('PRICE_UPDATE', { price });
  }

  /**
   * Запустить мониторинг ордеров
   */
  private startOrderMonitoring(): void {
    this.orderCheckInterval = setInterval(async () => {
      if (this.state.status !== 'RUNNING') return;
      
      try {
        const openOrders = await this.adapter.getOpenOrders();
        const openOrderIds = new Set(openOrders.map(o => o.id));
        
        // Проверяем исполненные ордера
        for (const level of this.state.gridLevels) {
          if (level.buyOrder && !openOrderIds.has(level.buyOrder.id)) {
            // Ордер исполнен
            const orderStatus = await this.adapter.getOrderStatus(level.buyOrder.id);
            if (orderStatus.status === 'FILLED') {
              await this.handleFilledOrder(orderStatus);
            }
          }
          
          if (level.sellOrder && !openOrderIds.has(level.sellOrder.id)) {
            const orderStatus = await this.adapter.getOrderStatus(level.sellOrder.id);
            if (orderStatus.status === 'FILLED') {
              await this.handleFilledOrder(orderStatus);
            }
          }
        }
      } catch (error) {
        console.error('Order check error:', error);
      }
    }, 3000);
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
   * Остановить мониторинг
   */
  private stopMonitoring(): void {
    if (this.priceCheckInterval) {
      clearInterval(this.priceCheckInterval);
      this.priceCheckInterval = null;
    }
    
    if (this.orderCheckInterval) {
      clearInterval(this.orderCheckInterval);
      this.orderCheckInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    this.adapter.unsubscribePrice();
  }

  // ==================== TRAILING ====================

  /**
   * Обновить trailing
   */
  private updateTrailing(price: number): void {
    if (!this.state.trailingActivated) {
      // Проверяем активацию
      const pnlPercent = this.state.unrealizedPnl / this.state.totalInvested * 100;
      if (pnlPercent >= this.config.trailingActivationPercent) {
        this.state.trailingActivated = true;
        this.state.trailingHighestPrice = price;
        this.state.trailingLowestPrice = price;
        
        this.emitEvent('TRAILING_ACTIVATED', { price });
      }
      return;
    }
    
    // Обновляем экстремумы
    if (price > this.state.trailingHighestPrice) {
      this.state.trailingHighestPrice = price;
      
      // Обновляем trailing stop для long позиций
      const newStop = price * (1 - this.config.trailingDistancePercent / 100);
      if (!this.state.trailingStopPrice || newStop > this.state.trailingStopPrice) {
        this.state.trailingStopPrice = newStop;
        
        this.emitEvent('TRAILING_STOP_UPDATED', { 
          newStop, 
          highestPrice: this.state.trailingHighestPrice 
        });
      }
    }
    
    if (price < this.state.trailingLowestPrice) {
      this.state.trailingLowestPrice = price;
      
      // Обновляем trailing stop для short позиций
      const newStop = price * (1 + this.config.trailingDistancePercent / 100);
      // ... similar logic for short
    }
    
    // Проверяем срабатывание trailing stop
    if (this.state.trailingStopPrice && price <= this.state.trailingStopPrice) {
      this.emitEvent('STOP_LOSS_TRIGGERED', { 
        price, 
        stopPrice: this.state.trailingStopPrice 
      });
      this.stop(true);
    }
  }

  // ==================== RISK MANAGEMENT ====================

  /**
   * Проверка risk limits
   */
  private checkRiskLimits(): void {
    const drawdownPercent = this.calculateDrawdownPercent();
    
    if (drawdownPercent >= this.config.maxDrawdown) {
      this.emitEvent('MAX_DRAWDOWN_REACHED', { 
        drawdown: drawdownPercent,
        maxAllowed: this.config.maxDrawdown 
      });
      this.stop(true);
    }
    
    // Проверяем stop loss
    if (this.config.stopLossPercent) {
      const lossPercent = -this.state.unrealizedPnl / this.state.totalInvested * 100;
      if (lossPercent >= this.config.stopLossPercent) {
        this.emitEvent('STOP_LOSS_TRIGGERED', { lossPercent });
        this.stop(true);
      }
    }
    
    // Проверяем take profit
    if (this.config.takeProfitPercent) {
      const profitPercent = this.state.unrealizedPnl / this.state.totalInvested * 100;
      if (profitPercent >= this.config.takeProfitPercent) {
        this.emitEvent('TAKE_PROFIT_TRIGGERED', { profitPercent });
        this.stop(false);
      }
    }
  }

  /**
   * Проверка необходимости ребалансировки
   */
  private checkRebalance(): void {
    const priceDeviation = Math.abs(this.currentPrice - this.state.gridLevels[Math.floor(this.state.gridLevels.length / 2)].price) 
      / this.currentPrice;
    
    if (priceDeviation > this.config.rebalanceThreshold) {
      this.rebalanceGrid();
    }
  }

  /**
   * Ребалансировка сетки
   */
  private async rebalanceGrid(): Promise<void> {
    await this.cancelAllOrders();
    
    // Пересоздаём сетку вокруг текущей цены
    const spread = this.state.currentUpperPrice - this.state.currentLowerPrice;
    const newLower = this.currentPrice - spread / 2;
    const newUpper = this.currentPrice + spread / 2;
    
    this.state.currentLowerPrice = newLower;
    this.state.currentUpperPrice = newUpper;
    
    // Пересоздаём уровни
    const prices = this.config.gridType === 'geometric'
      ? this.createGeometricGrid(newLower, newUpper, this.config.gridLevels)
      : this.createArithmeticGrid(newLower, newUpper, this.config.gridLevels);
    
    this.state.gridLevels = prices.map((price, index) => ({
      index,
      price,
      quantity: this.calculateLevelQuantity(price),
      filled: false,
    }));
    
    await this.placeGridOrders();
    
    this.emitEvent('GRID_REBALANCED', {
      newLower,
      newUpper,
      levels: this.state.gridLevels.length
    });
  }

  // ==================== CALCULATIONS ====================

  /**
   * Рассчитать количество для уровня
   */
  private calculateLevelQuantity(price: number): number {
    switch (this.config.positionSizeType) {
      case 'fixed':
        return this.config.positionSize;
        
      case 'percent':
        // Процент от баланса
        const balance = this.state.quoteAssetBalance || 10000;
        return (balance * this.config.positionSize / 100) / price;
        
      case 'risk_based':
        // На основе волатильности
        const volatility = this.calculateVolatility();
        const riskAmount = (this.state.quoteAssetBalance || 10000) * 0.01; // 1% risk
        return riskAmount / (price * volatility);
        
      default:
        return this.config.positionSize;
    }
  }

  /**
   * Рассчитать спред сетки
   */
  private calculateGridSpread(): number {
    return (this.state.currentUpperPrice - this.state.currentLowerPrice) / this.config.gridLevels;
  }

  /**
   * Обновить нереализованный PnL
   */
  private updateUnrealizedPnl(): void {
    let totalPnl = 0;
    
    for (const level of this.state.gridLevels) {
      if (level.filled && level.avgFillPrice) {
        const pnl = (this.currentPrice - level.avgFillPrice) * level.quantity;
        totalPnl += pnl;
      }
    }
    
    this.state.unrealizedPnl = totalPnl;
    this.state.currentValue = this.state.totalInvested + totalPnl;
  }

  /**
   * Рассчитать просадку
   */
  private calculateDrawdownPercent(): number {
    if (this.state.totalInvested === 0) return 0;
    
    const equity = this.state.totalInvested + this.state.unrealizedPnl + this.state.realizedPnl;
    const peak = Math.max(this.state.totalInvested, this.state.currentValue);
    
    return ((peak - equity) / peak) * 100;
  }

  /**
   * Рассчитать волатильность
   */
  private calculateVolatility(): number {
    if (this.priceHistory.length < 2) return 0.02;
    
    const returns = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      returns.push((this.priceHistory[i] - this.priceHistory[i - 1]) / this.priceHistory[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Рассчитать волатильность из стакана
   */
  private calculateOrderbookVolatility(orderbook: OrderbookSnapshot): number {
    const bidVolume = orderbook.bids.reduce((sum, b) => sum + b.quantity, 0);
    const askVolume = orderbook.asks.reduce((sum, a) => sum + a.quantity, 0);
    
    // Imbalance как прокси для волатильности
    return Math.abs(bidVolume - askVolume) / (bidVolume + askVolume);
  }

  /**
   * Получить ликвидность на уровне цены
   */
  private getLiquidityAtPrice(orderbook: OrderbookSnapshot, price: number): number {
    const midPrice = (orderbook.bids[0]?.price || 0 + orderbook.asks[0]?.price || 0) / 2;
    const spread = Math.abs(price - midPrice) / midPrice;
    
    // Больше ликвидности ближе к mid price
    return Math.max(0, 1 - spread * 10);
  }

  /**
   * Рассчитать метрики
   */
  private calculateMetrics(): GridBotMetrics {
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl <= 0);
    
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    
    const totalReturn = this.state.realizedPnl + this.state.unrealizedPnl;
    const totalReturnPercent = totalReturn / this.state.totalInvested * 100;
    
    return {
      totalReturn,
      totalReturnPercent,
      annualizedReturn: totalReturnPercent * 365, // Simplified
      dailyReturn: totalReturnPercent / 30,
      
      maxDrawdown: this.state.maxDrawdown,
      maxDrawdownPercent: this.state.maxDrawdownPercent,
      sharpeRatio: this.calculateSharpeRatio(),
      sortinoRatio: this.calculateSortinoRatio(),
      calmarRatio: this.state.maxDrawdown > 0 ? totalReturnPercent / this.state.maxDrawdown : 0,
      
      totalTrades: this.state.totalTrades,
      winRate: this.state.totalTrades > 0 ? (this.state.winTrades / this.state.totalTrades) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      avgWin: wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0,
      avgTradeDuration: closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => sum + (t.exitTime?.getTime() || 0) - t.entryTime.getTime(), 0) / closedTrades.length / 60000
        : 0,
      
      gridEfficiency: this.calculateGridEfficiency(),
      avgGridSpread: this.calculateGridSpread(),
      rebalanceCount: 0, // Track this
      
      totalFees: this.state.totalFees,
      avgSlippage: 0,
      orderFillRate: this.state.totalTrades > 0 
        ? this.state.totalTrades / (this.state.gridLevels.length * 2) 
        : 0,
    };
  }

  /**
   * Рассчитать Sharpe Ratio
   */
  private calculateSharpeRatio(): number {
    if (this.priceHistory.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      returns.push((this.priceHistory[i] - this.priceHistory[i - 1]) / this.priceHistory[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length);
    
    return std > 0 ? (mean / std) * Math.sqrt(365) : 0;
  }

  /**
   * Рассчитать Sortino Ratio
   */
  private calculateSortinoRatio(): number {
    if (this.priceHistory.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      returns.push((this.priceHistory[i] - this.priceHistory[i - 1]) / this.priceHistory[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const negativeReturns = returns.filter(r => r < 0);
    const downsideStd = Math.sqrt(
      negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
    );
    
    return downsideStd > 0 ? (mean / downsideStd) * Math.sqrt(365) : 0;
  }

  /**
   * Рассчитать эффективность сетки
   */
  private calculateGridEfficiency(): number {
    const filledLevels = this.state.gridLevels.filter(l => l.filled).length;
    return filledLevels / this.state.gridLevels.length;
  }

  // ==================== HELPERS ====================

  /**
   * Создать начальное состояние
   */
  private createInitialState(): GridBotState {
    return {
      id: this.config.id,
      status: 'IDLE',
      gridLevels: [],
      currentUpperPrice: this.config.upperPrice,
      currentLowerPrice: this.config.lowerPrice,
      totalInvested: 0,
      currentValue: 0,
      baseAssetBalance: 0,
      quoteAssetBalance: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalFees: 0,
      totalFunding: 0,
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      totalVolume: 0,
      trailingActivated: false,
      trailingHighestPrice: 0,
      trailingLowestPrice: Infinity,
      lastUpdate: new Date(),
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      profitFactor: 0,
    };
  }

  /**
   * Создать сделку
   */
  private createTrade(level: GridLevel, order: GridOrder): GridTrade {
    return {
      id: `trade_${Date.now()}_${level.index}`,
      botId: this.config.id,
      symbol: this.config.symbol,
      entryPrice: order.avgPrice,
      entryQuantity: order.filledQuantity,
      entryTime: order.createdAt,
      entryReason: order.side === 'BUY' ? 'GRID_BUY' : 'GRID_SELL',
      gridLevel: level.index,
      pnl: 0,
      pnlPercent: 0,
      fees: order.fee,
      funding: 0,
      status: 'OPEN',
      leverage: this.config.leverage,
      margin: (order.filledQuantity * order.avgPrice) / this.config.leverage,
    };
  }

  /**
   * Найти следующий верхний уровень
   */
  private findNextUpperLevel(price: number): GridLevel | null {
    const upper = this.state.gridLevels
      .filter(l => l.price > price)
      .sort((a, b) => a.price - b.price);
    return upper[0] || null;
  }

  /**
   * Найти следующий нижний уровень
   */
  private findNextLowerLevel(price: number): GridLevel | null {
    const lower = this.state.gridLevels
      .filter(l => l.price < price)
      .sort((a, b) => b.price - a.price);
    return lower[0] || null;
  }

  /**
   * Отправить событие
   */
  private emitEvent(type: GridBotEventType, data: any): void {
    const event: GridBotEvent = {
      type,
      timestamp: new Date(),
      botId: this.config.id,
      data,
    };
    
    this.emit(type, event);
    this.emit('event', event);
  }

  // ==================== GETTERS ====================

  getConfig(): GridBotConfig {
    return this.config;
  }

  getState(): GridBotState {
    return this.state;
  }

  getTrades(): GridTrade[] {
    return this.trades;
  }

  getMetrics(): GridBotMetrics {
    return this.calculateMetrics();
  }

  getCurrentPrice(): number {
    return this.currentPrice;
  }
}
