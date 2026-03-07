/**
 * Backtesting Engine
 * 
 * Основной движок для проведения бэктестов стратегий.
 */

import { 
  BacktestConfig, 
  BacktestResult, 
  BacktestPosition, 
  BacktestTrade,
  BacktestEntry,
  BacktestExit,
  BacktestTPTarget,
  EquityPoint,
  BacktestMetrics,
  createEmptyBacktestResult,
} from "./types";
import { Candle, Timeframe, StrategySignal } from "../strategy/types";
import { TacticsExecutor, TacticsExecutionContext } from "../strategy/tactics/executor";
import { TacticsSet, TacticsExecutionState, TrailingStopConfig } from "../strategy/tactics/types";
import { getStrategyManager } from "../strategy/manager";
import { ATR } from "../strategy/indicators";

// ==================== BACKTEST ENGINE ====================

export class BacktestEngine {
  private config: BacktestConfig;
  private result: BacktestResult;
  private positions: BacktestPosition[] = [];
  private balance: number;
  private equity: number;
  private candles: Candle[] = [];
  private positionIdCounter: number = 0;

  // Metrics tracking
  private equityCurve: EquityPoint[] = [];
  private maxEquity: number = 0;
  private currentDrawdown: number = 0;
  private maxDrawdown: number = 0;
  private dailyPnl: number = 0;
  private lastDay: number = 0;

  constructor(config: BacktestConfig) {
    this.config = config;
    this.result = createEmptyBacktestResult(config);
    this.balance = config.initialBalance;
    this.equity = config.initialBalance;
    this.maxEquity = config.initialBalance;
  }

  /**
   * Запустить бэктест
   */
  async run(
    candles: Candle[],
    onProgress?: (progress: number) => void
  ): Promise<BacktestResult> {
    this.candles = candles;
    this.result.status = "RUNNING";
    this.result.startedAt = new Date();

    try {
      const strategyManager = getStrategyManager();
      const strategy = strategyManager.getStrategy(this.config.strategyId);

      if (!strategy) {
        throw new Error(`Strategy ${this.config.strategyId} not found`);
      }

      // Инициализируем стратегию
      strategy.initialize(this.config.strategyParameters);

      const minCandles = strategy.getConfig().minCandlesRequired;
      const totalCandles = candles.length;

      // Проходим по всем свечам
      for (let i = minCandles; i < totalCandles; i++) {
        const candle = candles[i];
        const historicalCandles = candles.slice(0, i + 1);

        // Обновляем текущие позиции
        this.updatePositions(candle, i);

        // Проверяем условия выхода для открытых позиций
        this.checkExitConditions(historicalCandles, candle, i);

        // Генерируем сигнал
        const signal = strategy.populateEntrySignal(
          historicalCandles,
          strategy.populateIndicators(historicalCandles),
          candle.close
        );

        // Если есть сигнал и можно открыть позицию
        if (signal && this.canOpenPosition()) {
          this.processEntrySignal(signal, candle, i);
          this.result.signalsGenerated++;
        }

        // Обновляем кривую эквити
        this.updateEquityCurve(candle, i);

        // Прогресс
        if (onProgress && i % 100 === 0) {
          const progress = ((i - minCandles) / (totalCandles - minCandles)) * 100;
          onProgress(progress);
          this.result.progress = progress;
        }

        // Проверяем максимальную просадку
        if (this.config.maxDrawdown && this.currentDrawdown > this.config.maxDrawdown) {
          this.log(i, "WARNING", `Max drawdown exceeded: ${this.currentDrawdown.toFixed(2)}%`);
          this.closeAllPositions(candle, i, "MANUAL");
          break;
        }

        this.result.candlesProcessed++;
      }

      // Закрываем все открытые позиции в конце
      const lastCandle = candles[candles.length - 1];
      this.closeAllPositions(lastCandle, candles.length - 1, "MANUAL");

      // Рассчитываем метрики
      this.result.metrics = this.calculateMetrics();
      this.result.equityCurve = this.equityCurve;
      this.result.finalBalance = this.balance;
      this.result.finalEquity = this.equity;
      this.result.status = "COMPLETED";
      this.result.progress = 100;
      this.result.completedAt = new Date();
      this.result.duration = this.result.completedAt.getTime() - (this.result.startedAt?.getTime() || 0);

    } catch (error) {
      this.result.status = "FAILED";
      this.result.error = error instanceof Error ? error.message : "Unknown error";
      this.log(0, "ERROR", this.result.error);
    }

    return this.result;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Обновить позиции текущей ценой
   */
  private updatePositions(candle: Candle, index: number): void {
    for (const position of this.positions) {
      if (position.status !== "OPEN") continue;

      position.currentPrice = candle.close;

      // Обновляем нереализованный PnL
      if (position.direction === "LONG") {
        position.unrealizedPnl = (candle.close - position.avgEntryPrice) * position.totalSize;
      } else {
        position.unrealizedPnl = (position.avgEntryPrice - candle.close) * position.totalSize;
      }

      // Проверяем ликвидацию
      if (position.liquidationPrice) {
        const isLiquidated = position.direction === "LONG"
          ? candle.low <= position.liquidationPrice
          : candle.high >= position.liquidationPrice;

        if (isLiquidated) {
          this.closePosition(position, candle, index, "LIQUIDATION");
        }
      }

      // Обновляем макс прибыль/убыток
      const pnlPercent = (position.unrealizedPnl / position.margin) * 100;
      // Tracking max profit/drawdown for this position
    }
  }

  /**
   * Проверить условия выхода
   */
  private checkExitConditions(candles: Candle[], currentCandle: Candle, index: number): void {
    for (const position of this.positions) {
      if (position.status !== "OPEN") continue;

      // Stop Loss
      if (position.stopLoss) {
        const isSLHit = position.direction === "LONG"
          ? currentCandle.low <= position.stopLoss
          : currentCandle.high >= position.stopLoss;

        if (isSLHit) {
          this.closePosition(position, currentCandle, index, "SL");
          continue;
        }
      }

      // Take Profit targets
      for (const tp of position.takeProfitTargets) {
        if (tp.filled) continue;

        const isTPHit = position.direction === "LONG"
          ? currentCandle.high >= tp.price
          : currentCandle.low <= tp.price;

        if (isTPHit) {
          this.partialClose(position, tp, currentCandle, index);
        }
      }

      // Trailing Stop
      this.updateTrailingStop(position, currentCandle, candles, index);
    }
  }

  /**
   * Обновить трейлинг-стоп
   */
  private updateTrailingStop(
    position: BacktestPosition,
    candle: Candle,
    candles: Candle[],
    index: number
  ): void {
    const trailingState = position.tacticsState.trailingState;
    if (!trailingState || !trailingState.activated) return;

    const config = trailingState;
    let updated = false;

    if (position.direction === "LONG") {
      if (!config.highestPrice || candle.high > config.highestPrice) {
        config.highestPrice = candle.high;

        // Рассчитываем новый SL
        let trailingDistance = 0;
        if (config.type === "PERCENT" && config.percentValue) {
          trailingDistance = candle.close * (config.percentValue / 100);
        } else if (config.type === "FIXED" && config.fixedValue) {
          trailingDistance = config.fixedValue;
        } else if (config.type === "ATR_BASED" && config.atrMultiplier) {
          const atrValues = ATR(candles, config.atrPeriod || 14);
          const atr = atrValues[index] || candle.close * 0.02;
          trailingDistance = atr * config.atrMultiplier;
        }

        const newSL = candle.close - trailingDistance;

        if (!position.stopLoss || newSL > position.stopLoss) {
          position.stopLoss = newSL;
          config.currentStopPrice = newSL;
          updated = true;
          this.log(index, "DEBUG", `Trailing SL updated to ${newSL.toFixed(2)}`);
        }
      }
    } else {
      if (!config.lowestPrice || candle.low < config.lowestPrice) {
        config.lowestPrice = candle.low;

        let trailingDistance = 0;
        if (config.type === "PERCENT" && config.percentValue) {
          trailingDistance = candle.close * (config.percentValue / 100);
        } else if (config.type === "FIXED" && config.fixedValue) {
          trailingDistance = config.fixedValue;
        } else if (config.type === "ATR_BASED" && config.atrMultiplier) {
          const atrValues = ATR(candles, config.atrPeriod || 14);
          const atr = atrValues[index] || candle.close * 0.02;
          trailingDistance = atr * config.atrMultiplier;
        }

        const newSL = candle.close + trailingDistance;

        if (!position.stopLoss || newSL < position.stopLoss) {
          position.stopLoss = newSL;
          config.currentStopPrice = newSL;
          updated = true;
        }
      }
    }
  }

  /**
   * Обработать сигнал входа
   */
  private processEntrySignal(signal: StrategySignal, candle: Candle, index: number): void {
    // Определяем направление
    if (signal.type !== "LONG" && signal.type !== "SHORT") return;
    if (signal.type === "SHORT" && !this.config.allowShort) {
      this.result.signalsSkipped++;
      return;
    }

    const direction = signal.type;
    const tactics = this.config.tacticsSet;

    // Рассчитываем размер позиции
    const positionSize = this.calculatePositionSize(candle.close, tactics.entry.positionSizeValue, tactics.entry.positionSize);

    // Создаём позицию
    const position = this.createPosition(direction, candle, index, positionSize);

    // Устанавливаем SL
    if (tactics.stopLoss.slPrice) {
      position.stopLoss = tactics.stopLoss.slPrice;
    } else if (tactics.stopLoss.slPercent) {
      position.stopLoss = direction === "LONG"
        ? candle.close * (1 - tactics.stopLoss.slPercent / 100)
        : candle.close * (1 + tactics.stopLoss.slPercent / 100);
    }

    // Устанавливаем TP
    if (tactics.takeProfit.targets) {
      position.takeProfitTargets = tactics.takeProfit.targets.map((t, i) => ({
        index: i + 1,
        price: t.price || (direction === "LONG"
          ? candle.close * (1 + (t.profitPercent || 0) / 100)
          : candle.close * (1 - (t.profitPercent || 0) / 100)),
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
          ? candle.close * (1 + tactics.takeProfit.tpPercent / 100)
          : candle.close * (1 - tactics.takeProfit.tpPercent / 100),
        closePercent: 100,
        filled: false,
      }];
    }

    // Устанавливаем трейлинг
    if (tactics.takeProfit.trailingConfig) {
      position.tacticsState.trailingState = { ...tactics.takeProfit.trailingConfig };
    }

    this.positions.push(position);

    // Списываем комиссию
    const fee = position.totalSize * candle.close * (this.config.feePercent / 100);
    position.totalFees += fee;
    this.balance -= fee;

    this.log(index, "INFO", `Opened ${direction} position at ${candle.close.toFixed(2)}, size: ${positionSize.toFixed(4)}`);
  }

  /**
   * Создать новую позицию
   */
  private createPosition(
    direction: "LONG" | "SHORT",
    candle: Candle,
    index: number,
    size: number
  ): BacktestPosition {
    const leverage = Math.min(this.config.maxLeverage, this.config.tacticsSet.entry.positionSizeValue || 1);
    const margin = (size * candle.close) / leverage;

    const position: BacktestPosition = {
      id: `pos-${++this.positionIdCounter}`,
      symbol: this.config.symbol,
      direction,
      status: "OPEN",
      avgEntryPrice: candle.close,
      entries: [{
        index: 1,
        price: candle.close,
        size,
        fee: size * candle.close * (this.config.feePercent / 100),
        timestamp: new Date(candle.timestamp),
        candleIndex: index,
      }],
      totalSize: size,
      openedAt: new Date(candle.timestamp),
      openedAtIndex: index,
      exits: [],
      currentPrice: candle.close,
      takeProfitTargets: [],
      unrealizedPnl: 0,
      realizedPnl: 0,
      totalFees: 0,
      totalFunding: 0,
      tacticsState: {
        positionId: `pos-${this.positionIdCounter}`,
        tacticsSetId: this.config.tacticsSet.id,
        entryStatus: "COMPLETED",
        executedEntries: [],
        executedTPs: [],
        stopLossHistory: [],
        updatedAt: new Date(),
      },
      leverage,
      marginMode: this.config.marginMode,
      margin,
      liquidationPrice: this.calculateLiquidationPrice(candle.close, direction, leverage),
    };

    this.balance -= margin;

    return position;
  }

  /**
   * Частичное закрытие по TP
   */
  private partialClose(
    position: BacktestPosition,
    tp: BacktestTPTarget,
    candle: Candle,
    index: number
  ): void {
    const closeSize = position.totalSize * (tp.closePercent / 100);
    const fee = closeSize * tp.price * (this.config.feePercent / 100);

    const pnl = position.direction === "LONG"
      ? (tp.price - position.avgEntryPrice) * closeSize
      : (position.avgEntryPrice - tp.price) * closeSize;

    const exit: BacktestExit = {
      index: position.exits.length + 1,
      price: tp.price,
      size: closeSize,
      fee,
      pnl,
      reason: "TP",
      timestamp: new Date(candle.timestamp),
      candleIndex: index,
      tpIndex: tp.index,
    };

    position.exits.push(exit);
    position.totalSize -= closeSize;
    position.realizedPnl += pnl - fee;
    position.totalFees += fee;
    tp.filled = true;
    tp.filledAt = new Date(candle.timestamp);
    tp.filledAtIndex = index;

    this.balance += pnl - fee + (closeSize * position.avgEntryPrice / position.leverage);

    this.log(index, "INFO", `TP${tp.index} hit at ${tp.price.toFixed(2)}, closed ${tp.closePercent}%`);

    // Если позиция закрыта полностью
    if (position.totalSize <= 0) {
      this.finalizePosition(position, candle, index, "TP");
    }
  }

  /**
   * Закрыть позицию
   */
  private closePosition(
    position: BacktestPosition,
    candle: Candle,
    index: number,
    reason: BacktestTrade["closeReason"]
  ): void {
    const closePrice = reason === "SL" && position.stopLoss
      ? position.stopLoss
      : reason === "LIQUIDATION" && position.liquidationPrice
        ? position.liquidationPrice
        : candle.close;

    const fee = position.totalSize * closePrice * (this.config.feePercent / 100);
    const pnl = position.direction === "LONG"
      ? (closePrice - position.avgEntryPrice) * position.totalSize
      : (position.avgEntryPrice - closePrice) * position.totalSize;

    const exit: BacktestExit = {
      index: position.exits.length + 1,
      price: closePrice,
      size: position.totalSize,
      fee,
      pnl,
      reason: reason === "SL" ? "SL" : reason === "LIQUIDATION" ? "PARTIAL" : "PARTIAL",
      timestamp: new Date(candle.timestamp),
      candleIndex: index,
    };

    position.exits.push(exit);
    position.realizedPnl += pnl - fee;
    position.totalFees += fee;

    this.finalizePosition(position, candle, index, reason);
  }

  /**
   * Завершить позицию
   */
  private finalizePosition(
    position: BacktestPosition,
    candle: Candle,
    index: number,
    reason: BacktestTrade["closeReason"]
  ): void {
    position.status = reason === "LIQUIDATION" ? "LIQUIDATED" : "CLOSED";
    position.closedAt = new Date(candle.timestamp);
    position.closedAtIndex = index;
    position.closeReason = reason;
    position.avgExitPrice = this.calculateAvgExitPrice(position);
    position.currentPrice = position.avgExitPrice;

    // Возвращаем остаток маржи
    if (position.status !== "LIQUIDATED") {
      this.balance += position.margin + position.realizedPnl;
    }

    this.equity = this.balance + this.calculateUnrealizedPnL();

    // Создаём сделку
    const trade = this.createTrade(position);
    this.result.trades.push(trade);

    this.log(index, "INFO", `Closed ${position.direction} position, PnL: ${trade.pnl.toFixed(2)}, Reason: ${reason}`);
  }

  /**
   * Закрыть все позиции
   */
  private closeAllPositions(candle: Candle, index: number, reason: BacktestTrade["closeReason"]): void {
    for (const position of this.positions) {
      if (position.status === "OPEN") {
        this.closePosition(position, candle, index, reason);
      }
    }
  }

  /**
   * Рассчитать размер позиции
   */
  private calculatePositionSize(
    price: number,
    sizeValue: number,
    sizeMode: string
  ): number {
    let size: number;

    if (sizeMode === "PERCENT") {
      size = (this.balance * sizeValue / 100) / price;
    } else if (sizeMode === "FIXED") {
      size = sizeValue / price;
    } else {
      // RISK_BASED - упрощённая версия
      size = (this.balance * 0.02) / price;
    }

    return size;
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
  private calculateAvgExitPrice(position: BacktestPosition): number {
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
   * Рассчитать нереализованный PnL
   */
  private calculateUnrealizedPnL(): number {
    let total = 0;
    for (const position of this.positions) {
      if (position.status === "OPEN") {
        total += position.unrealizedPnl;
      }
    }
    return total;
  }

  /**
   * Проверить можно ли открыть позицию
   */
  private canOpenPosition(): boolean {
    const openPositions = this.positions.filter(p => p.status === "OPEN").length;
    return openPositions < (this.config.maxOpenPositions || 3);
  }

  /**
   * Обновить кривую эквити
   */
  private updateEquityCurve(candle: Candle, index: number): void {
    this.equity = this.balance + this.calculateUnrealizedPnL();

    // Обновляем максимум эквити
    if (this.equity > this.maxEquity) {
      this.maxEquity = this.equity;
    }

    // Рассчитываем просадку
    this.currentDrawdown = ((this.maxEquity - this.equity) / this.maxEquity) * 100;
    if (this.currentDrawdown > this.maxDrawdown) {
      this.maxDrawdown = this.currentDrawdown;
    }

    // Дневной PnL
    const currentDay = Math.floor(candle.timestamp / (24 * 60 * 60 * 1000));
    if (currentDay !== this.lastDay) {
      this.dailyPnl = 0;
      this.lastDay = currentDay;
    }

    const point: EquityPoint = {
      timestamp: new Date(candle.timestamp),
      candleIndex: index,
      price: candle.close,
      balance: this.balance,
      equity: this.equity,
      availableMargin: this.balance,
      unrealizedPnl: this.calculateUnrealizedPnL(),
      realizedPnl: this.result.trades.reduce((sum, t) => sum + t.netPnl, 0),
      dailyPnl: this.dailyPnl,
      cumulativePnl: this.equity - this.config.initialBalance,
      drawdown: this.maxEquity - this.equity,
      drawdownPercent: this.currentDrawdown,
      maxDrawdown: this.maxEquity - this.config.initialBalance + (this.maxEquity - this.equity),
      maxDrawdownPercent: this.maxDrawdown,
      openPositions: this.positions.filter(p => p.status === "OPEN").length,
      tradesCount: this.result.trades.length,
      winsCount: this.result.trades.filter(t => t.pnl > 0).length,
      lossesCount: this.result.trades.filter(t => t.pnl <= 0).length,
    };

    this.equityCurve.push(point);
  }

  /**
   * Создать сделку из позиции
   */
  private createTrade(position: BacktestPosition): BacktestTrade {
    const pnl = position.realizedPnl;
    const pnlPercent = (pnl / position.margin) * 100;
    const netPnl = pnl - position.totalFees;

    return {
      id: `trade-${position.id}`,
      positionId: position.id,
      symbol: position.symbol,
      direction: position.direction,
      avgEntryPrice: position.avgEntryPrice,
      totalSize: position.entries.reduce((sum, e) => sum + e.size, 0),
      openedAt: position.openedAt,
      openedAtIndex: position.openedAtIndex,
      avgExitPrice: position.avgExitPrice || 0,
      closedAt: position.closedAt || new Date(),
      closedAtIndex: position.closedAtIndex || 0,
      closeReason: position.closeReason || "MANUAL",
      pnl,
      pnlPercent,
      fees: position.totalFees,
      funding: position.totalFunding,
      netPnl,
      durationMinutes: position.closedAt
        ? (position.closedAt.getTime() - position.openedAt.getTime()) / (1000 * 60)
        : 0,
      durationCandles: position.closedAtIndex
        ? position.closedAtIndex - position.openedAtIndex
        : 0,
      maxProfit: 0, // TODO: track during position lifetime
      maxProfitPercent: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      tacticsSetId: this.config.tacticsSet.id,
    };
  }

  /**
   * Рассчитать метрики
   */
  private calculateMetrics(): BacktestMetrics {
    const trades = this.result.trades;
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnl = trades.length > 0 ? totalPnl / trades.length : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0;

    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    // Sharpe Ratio (упрощённый)
    const returns = this.equityCurve.map((p, i) => {
      if (i === 0) return 0;
      return (p.equity - this.equityCurve[i - 1].equity) / this.equityCurve[i - 1].equity;
    }).filter(r => r !== 0);

    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0;

    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

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

    return {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      totalPnl,
      totalPnlPercent: ((this.equity - this.config.initialBalance) / this.config.initialBalance) * 100,
      avgPnl,
      avgWin,
      avgLoss,
      maxWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
      maxLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      riskRewardRatio: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0,
      sharpeRatio,
      sortinoRatio: 0, // TODO: implement
      calmarRatio: this.maxDrawdown > 0 ? (totalPnl / this.maxDrawdown) : 0,
      maxDrawdown: this.maxEquity - this.config.initialBalance,
      maxDrawdownPercent: this.maxDrawdown,
      avgDrawdown: 0, // TODO: implement
      timeInDrawdown: 0, // TODO: implement
      maxDrawdownDuration: 0, // TODO: implement
      avgTradeDuration: trades.length > 0
        ? trades.reduce((sum, t) => sum + t.durationMinutes, 0) / trades.length
        : 0,
      avgWinDuration: wins.length > 0
        ? wins.reduce((sum, t) => sum + t.durationMinutes, 0) / wins.length
        : 0,
      avgLossDuration: losses.length > 0
        ? losses.reduce((sum, t) => sum + t.durationMinutes, 0) / losses.length
        : 0,
      maxWinStreak,
      maxLossStreak,
      currentStreak: { type: currentType, count: currentStreak },
      avgDailyReturn: 0, // TODO: implement
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
   * Логирование
   */
  private log(candleIndex: number, level: "INFO" | "WARNING" | "ERROR" | "DEBUG", message: string): void {
    this.result.logs.push({
      timestamp: new Date(),
      candleIndex,
      level,
      message,
    });
  }
}
