/**
 * Tactics Executor
 * 
 * Выполнение тактик в реальном времени и при бэктестинге.
 * Управляет: входами, TP, SL, трейлинг-стопами, частичными закрытиями.
 */

import {
  TacticsSet,
  TacticsExecutionState,
  EntryTactic,
  TakeProfitTactic,
  StopLossTactic,
  TrailingStopConfig,
  TPTarget,
  ExecutedEntry,
  ExecutedTP,
  StopLossChange,
} from "./types";

// ==================== TYPES ====================

/**
 * Контекст выполнения тактик
 */
export interface TacticsExecutionContext {
  /** ID позиции */
  positionId: string;
  /** Символ */
  symbol: string;
  /** Направление */
  direction: "LONG" | "SHORT";
  /** Текущая цена */
  currentPrice: number;
  /** Цена входа (средняя) */
  avgEntryPrice: number;
  /** Размер позиции */
  positionSize: number;
  /** Баланс */
  balance: number;
  /** Текущий Stop Loss */
  stopLoss?: number;
  /** Текущий Take Profit */
  takeProfit?: number;
  /** ATR значение (если доступно) */
  atr?: number;
  /** Время открытия позиции */
  openedAt: Date;
  /** Текущее время */
  currentTime: Date;
  /** Уровни поддержки/сопротивления (если есть) */
  supportLevels?: number[];
  resistanceLevels?: number[];
}

/**
 * Результат проверки тактик
 */
export interface TacticsCheckResult {
  /** Нужно действие */
  actionRequired: boolean;
  /** Тип действия */
  actionType?: "ENTRY" | "TP_HIT" | "SL_HIT" | "TRAILING_UPDATE" | "PARTIAL_CLOSE" | "ADD_POSITION";
  /** Данные для действия */
  actionData?: {
    price?: number;
    amount?: number;
    percent?: number;
    newStopLoss?: number;
    newTakeProfit?: number;
    tpIndex?: number;
  };
  /** Обновлённое состояние */
  newState?: Partial<TacticsExecutionState>;
  /** Сообщение */
  message?: string;
}

/**
 * Результат исполнения тактики
 */
export interface TacticsExecutionResult {
  success: boolean;
  executed?: boolean;
  actionType?: string;
  price?: number;
  amount?: number;
  pnl?: number;
  error?: string;
  state: TacticsExecutionState;
}

// ==================== TACTICS EXECUTOR ====================

export class TacticsExecutor {
  private tacticsSet: TacticsSet;
  private state: TacticsExecutionState;

  constructor(tacticsSet: TacticsSet, initialState?: Partial<TacticsExecutionState>) {
    this.tacticsSet = tacticsSet;
    this.state = {
      positionId: initialState?.positionId || "",
      tacticsSetId: tacticsSet.id,
      entryStatus: "PENDING",
      executedEntries: [],
      executedTPs: [],
      stopLossHistory: [],
      additionsCount: 0,
      partialClosesCount: 0,
      updatedAt: new Date(),
      ...initialState,
    };
  }

  /**
   * Получить текущее состояние
   */
  getState(): TacticsExecutionState {
    return { ...this.state };
  }

  /**
   * Проверить и выполнить вход
   */
  checkEntry(
    currentPrice: number,
    direction: "LONG" | "SHORT"
  ): TacticsCheckResult {
    const entry = this.tacticsSet.entry;

    switch (entry.type) {
      case "MARKET":
        return this.executeMarketEntry(currentPrice, entry);

      case "LIMIT":
        return this.checkLimitEntry(currentPrice, direction, entry);

      case "LIMIT_ZONE":
        return this.checkZoneEntry(currentPrice, direction, entry);

      case "BREAKOUT":
        return this.checkBreakoutEntry(currentPrice, direction, entry);

      case "PULLBACK":
        return this.checkPullbackEntry(currentPrice, direction, entry);

      case "DCA":
        return this.checkDCAEntry(currentPrice, direction, entry);

      default:
        return { actionRequired: false };
    }
  }

  /**
   * Проверить Take Profit
   */
  checkTakeProfit(context: TacticsExecutionContext): TacticsCheckResult {
    const tp = this.tacticsSet.takeProfit;

    switch (tp.type) {
      case "FIXED_TP":
        return this.checkFixedTP(context, tp);

      case "MULTI_TP":
        return this.checkMultiTP(context, tp);

      case "TRAILING_STOP":
        return this.checkTrailingStop(context, tp);

      case "TIME_BASED":
        return this.checkTimeBased(context, tp);

      default:
        return { actionRequired: false };
    }
  }

  /**
   * Проверить Stop Loss
   */
  checkStopLoss(context: TacticsExecutionContext): TacticsCheckResult {
    const sl = this.tacticsSet.stopLoss;
    const { currentPrice, direction, avgEntryPrice, atr } = context;

    // Рассчитать цену SL если не задана
    let slPrice = this.state.currentStopLoss || context.stopLoss;

    if (!slPrice) {
      slPrice = this.calculateStopLossPrice(avgEntryPrice, direction, sl, atr);
      this.state.currentStopLoss = slPrice;
    }

    // Проверить достижение SL
    const isSLHit = direction === "LONG"
      ? currentPrice <= slPrice
      : currentPrice >= slPrice;

    if (isSLHit) {
      return {
        actionRequired: true,
        actionType: "SL_HIT",
        actionData: {
          price: slPrice,
          amount: context.positionSize,
        },
        message: `Stop Loss hit at ${slPrice}`,
      };
    }

    // Проверить Breakeven
    if (sl.moveToBreakevenAfter) {
      const profitPercent = ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100;
      const adjustedProfit = direction === "LONG" ? profitPercent : -profitPercent;

      if (adjustedProfit >= sl.moveToBreakevenAfter && slPrice !== avgEntryPrice) {
        const newSL = avgEntryPrice;
        this.addStopLossChange(slPrice, newSL, "BREAKEVEN");
        
        return {
          actionRequired: true,
          actionType: "TRAILING_UPDATE",
          actionData: {
            newStopLoss: newSL,
          },
          newState: {
            currentStopLoss: newSL,
          },
          message: `Stop Loss moved to breakeven at ${newSL}`,
        };
      }
    }

    return { actionRequired: false };
  }

  /**
   * Обновить трейлинг-стоп
   */
  updateTrailingStop(context: TacticsExecutionContext): TacticsCheckResult {
    const tp = this.tacticsSet.takeProfit;
    if (!tp.trailingConfig) {
      return { actionRequired: false };
    }

    const config = tp.trailingConfig;
    const { currentPrice, direction, avgEntryPrice } = context;

    // Инициализация состояния трейлинга
    if (!this.state.trailingState) {
      this.state.trailingState = { ...config };
    }

    const trailing = this.state.trailingState;

    // Проверка активации
    if (!trailing.activated) {
      const shouldActivate = this.checkTrailingActivation(context, trailing);
      if (shouldActivate) {
        trailing.activated = true;
        trailing.highestPrice = currentPrice;
        trailing.lowestPrice = currentPrice;
      }
      return {
        actionRequired: false,
        newState: { trailingState: trailing },
      };
    }

    // Обновление трейлинга
    let newStopLoss = this.state.currentStopLoss || context.stopLoss;
    let updated = false;

    if (direction === "LONG") {
      if (!trailing.highestPrice || currentPrice > trailing.highestPrice) {
        trailing.highestPrice = currentPrice;
        const trailingDistance = this.calculateTrailingDistance(currentPrice, trailing, context.atr);
        const calculatedSL = currentPrice - trailingDistance;

        if (!newStopLoss || calculatedSL > newStopLoss) {
          const oldSL = newStopLoss;
          newStopLoss = calculatedSL;
          trailing.currentStopPrice = newStopLoss;
          updated = true;
          this.addStopLossChange(oldSL || 0, newStopLoss, "TRAILING");
        }
      }
    } else {
      if (!trailing.lowestPrice || currentPrice < trailing.lowestPrice) {
        trailing.lowestPrice = currentPrice;
        const trailingDistance = this.calculateTrailingDistance(currentPrice, trailing, context.atr);
        const calculatedSL = currentPrice + trailingDistance;

        if (!newStopLoss || calculatedSL < newStopLoss) {
          const oldSL = newStopLoss;
          newStopLoss = calculatedSL;
          trailing.currentStopPrice = newStopLoss;
          updated = true;
          this.addStopLossChange(oldSL || 0, newStopLoss, "TRAILING");
        }
      }
    }

    if (updated) {
      return {
        actionRequired: true,
        actionType: "TRAILING_UPDATE",
        actionData: {
          newStopLoss: newStopLoss,
        },
        newState: {
          currentStopLoss: newStopLoss,
          trailingState: trailing,
        },
        message: `Trailing stop updated to ${newStopLoss}`,
      };
    }

    return { actionRequired: false };
  }

  // ==================== PRIVATE METHODS ====================

  private executeMarketEntry(price: number, entry: EntryTactic): TacticsCheckResult {
    const size = this.calculatePositionSize(price, entry);

    this.state.entryStatus = "COMPLETED";
    this.state.executedEntries = [{
      index: 1,
      price,
      amount: size,
      executedAt: new Date(),
    }];

    return {
      actionRequired: true,
      actionType: "ENTRY",
      actionData: {
        price,
        amount: size,
      },
      message: `Market entry at ${price}`,
    };
  }

  private checkLimitEntry(
    price: number,
    direction: "LONG" | "SHORT",
    entry: EntryTactic
  ): TacticsCheckResult {
    const entryPrices = entry.entryPrices || [];

    for (let i = 0; i < entryPrices.length; i++) {
      const entryPrice = entryPrices[i];
      const alreadyExecuted = this.state.executedEntries?.some(e => e.index === i + 1);

      if (alreadyExecuted) continue;

      // Для LONG: цена опускается до уровня входа
      // Для SHORT: цена поднимается до уровня входа
      const isPriceMatch = direction === "LONG"
        ? price <= entryPrice
        : price >= entryPrice;

      if (isPriceMatch) {
        const size = this.calculatePositionSize(price, entry);
        const entryRecord: ExecutedEntry = {
          index: i + 1,
          price: entryPrice,
          amount: size,
          executedAt: new Date(),
        };

        this.state.executedEntries = [...(this.state.executedEntries || []), entryRecord];
        this.state.entryStatus = entryPrices.length === i + 1 ? "COMPLETED" : "PARTIAL";

        return {
          actionRequired: true,
          actionType: "ENTRY",
          actionData: {
            price: entryPrice,
            amount: size,
          },
          message: `Limit entry ${i + 1} at ${entryPrice}`,
        };
      }
    }

    return { actionRequired: false };
  }

  private checkZoneEntry(
    price: number,
    direction: "LONG" | "SHORT",
    entry: EntryTactic
  ): TacticsCheckResult {
    const zone = entry.entryZone;
    if (!zone) return { actionRequired: false };

    const alreadyExecuted = this.state.executedEntries?.length;
    if (alreadyExecuted) return { actionRequired: false };

    const inZone = price >= zone.min && price <= zone.max;

    if (inZone) {
      const size = this.calculatePositionSize(price, entry);
      const entryRecord: ExecutedEntry = {
        index: 1,
        price,
        amount: size,
        executedAt: new Date(),
      };

      this.state.executedEntries = [entryRecord];
      this.state.entryStatus = "COMPLETED";

      return {
        actionRequired: true,
        actionType: "ENTRY",
        actionData: {
          price,
          amount: size,
        },
        message: `Zone entry at ${price} (zone: ${zone.min}-${zone.max})`,
      };
    }

    return { actionRequired: false };
  }

  private checkBreakoutEntry(
    price: number,
    direction: "LONG" | "SHORT",
    entry: EntryTactic
  ): TacticsCheckResult {
    const level = entry.breakoutLevel;
    if (!level) return { actionRequired: false };

    const alreadyExecuted = this.state.executedEntries?.length;
    if (alreadyExecuted) return { actionRequired: false };

    let isBreakout = false;

    if (direction === "LONG" && entry.breakoutDirection === "ABOVE") {
      isBreakout = price > level;
    } else if (direction === "SHORT" && entry.breakoutDirection === "BELOW") {
      isBreakout = price < level;
    }

    if (isBreakout) {
      const size = this.calculatePositionSize(price, entry);
      const entryRecord: ExecutedEntry = {
        index: 1,
        price,
        amount: size,
        executedAt: new Date(),
      };

      this.state.executedEntries = [entryRecord];
      this.state.entryStatus = "COMPLETED";

      return {
        actionRequired: true,
        actionType: "ENTRY",
        actionData: {
          price,
          amount: size,
        },
        message: `Breakout entry at ${price} (level: ${level})`,
      };
    }

    return { actionRequired: false };
  }

  private checkPullbackEntry(
    price: number,
    direction: "LONG" | "SHORT",
    entry: EntryTactic
  ): TacticsCheckResult {
    // Pullback более сложный - требует истории цен
    // Для упрощения, пока пропускаем
    return { actionRequired: false };
  }

  private checkDCAEntry(
    price: number,
    direction: "LONG" | "SHORT",
    entry: EntryTactic
  ): TacticsCheckResult {
    const count = entry.dcaCount || 5;
    const step = entry.dcaStep || 2; // %
    const baseSize = this.calculatePositionSize(price, entry);
    const sizeMultiplier = entry.dcaSizeMultiplier || 1;

    // Получаем среднюю цену входа
    const executedCount = this.state.executedEntries?.length || 0;

    if (executedCount >= count) {
      this.state.entryStatus = "COMPLETED";
      return { actionRequired: false };
    }

    // Рассчитываем цену следующего входа
    const avgEntry = this.calculateAvgEntryPrice();
    const nextEntryIndex = executedCount + 1;

    let nextEntryPrice: number;
    if (executedCount === 0) {
      nextEntryPrice = price; // Первый вход по текущей цене
    } else {
      const stepPercent = step / 100;
      nextEntryPrice = direction === "LONG"
        ? avgEntry * (1 - stepPercent * nextEntryIndex)
        : avgEntry * (1 + stepPercent * nextEntryIndex);
    }

    // Проверяем, достигла ли цена уровня входа
    const isPriceMatch = direction === "LONG"
      ? price <= nextEntryPrice
      : price >= nextEntryPrice;

    if (isPriceMatch || executedCount === 0) {
      const size = baseSize * Math.pow(sizeMultiplier, nextEntryIndex - 1);
      const entryRecord: ExecutedEntry = {
        index: nextEntryIndex,
        price: executedCount === 0 ? price : nextEntryPrice,
        amount: size,
        executedAt: new Date(),
      };

      this.state.executedEntries = [...(this.state.executedEntries || []), entryRecord];
      this.state.entryStatus = nextEntryIndex >= count ? "COMPLETED" : "PARTIAL";

      return {
        actionRequired: true,
        actionType: "ENTRY",
        actionData: {
          price: entryRecord.price,
          amount: size,
        },
        message: `DCA entry ${nextEntryIndex} at ${entryRecord.price}`,
      };
    }

    return { actionRequired: false };
  }

  private checkFixedTP(context: TacticsExecutionContext, tp: TakeProfitTactic): TacticsCheckResult {
    const { currentPrice, avgEntryPrice, direction, positionSize } = context;

    let tpPrice = tp.tpPrice;

    // Если TP задан в процентах
    if (!tpPrice && tp.tpPercent) {
      tpPrice = direction === "LONG"
        ? avgEntryPrice * (1 + tp.tpPercent / 100)
        : avgEntryPrice * (1 - tp.tpPercent / 100);
    }

    if (!tpPrice) return { actionRequired: false };

    const isTPHit = direction === "LONG"
      ? currentPrice >= tpPrice
      : currentPrice <= tpPrice;

    if (isTPHit) {
      return {
        actionRequired: true,
        actionType: "TP_HIT",
        actionData: {
          price: tpPrice,
          amount: positionSize,
          tpIndex: 1,
        },
        message: `Take Profit hit at ${tpPrice}`,
      };
    }

    return { actionRequired: false };
  }

  private checkMultiTP(context: TacticsExecutionContext, tp: TakeProfitTactic): TacticsCheckResult {
    const { currentPrice, avgEntryPrice, direction, positionSize } = context;
    const targets = tp.targets || [];

    for (const target of targets) {
      // Пропускаем уже исполненные
      if (target.filled) continue;

      // Рассчитываем цену TP
      let tpPrice = target.price;
      if (!tpPrice && target.profitPercent) {
        tpPrice = direction === "LONG"
          ? avgEntryPrice * (1 + target.profitPercent / 100)
          : avgEntryPrice * (1 - target.profitPercent / 100);
      }

      if (!tpPrice) continue;

      const isTPHit = direction === "LONG"
        ? currentPrice >= tpPrice
        : currentPrice <= tpPrice;

      if (isTPHit) {
        const closeAmount = positionSize * (target.closePercent / 100);

        // Записываем исполнение
        const executedTP: ExecutedTP = {
          index: target.index,
          price: tpPrice,
          closedPercent: target.closePercent,
          closedAmount: closeAmount,
          pnl: (tpPrice - avgEntryPrice) * closeAmount * (direction === "LONG" ? 1 : -1),
          executedAt: new Date(),
        };

        this.state.executedTPs = [...(this.state.executedTPs || []), executedTP];
        target.filled = true;

        return {
          actionRequired: true,
          actionType: "TP_HIT",
          actionData: {
            price: tpPrice,
            amount: closeAmount,
            percent: target.closePercent,
            tpIndex: target.index,
          },
          newState: {
            nextTPIndex: target.index + 1,
          },
          message: `TP ${target.index} hit at ${tpPrice} (${target.closePercent}% closed)`,
        };
      }
    }

    return { actionRequired: false };
  }

  private checkTrailingStop(context: TacticsExecutionContext, tp: TakeProfitTactic): TacticsCheckResult {
    return this.updateTrailingStop(context);
  }

  private checkTimeBased(context: TacticsExecutionContext, tp: TakeProfitTactic): TacticsCheckResult {
    const { openedAt, currentTime, positionSize } = context;
    const maxTime = tp.maxHoldingTime;

    if (!maxTime) return { actionRequired: false };

    const holdingMinutes = (currentTime.getTime() - openedAt.getTime()) / (1000 * 60);

    if (holdingMinutes >= maxTime) {
      if (tp.onTimeExpired === "CLOSE_ALL") {
        return {
          actionRequired: true,
          actionType: "TP_HIT",
          actionData: {
            price: context.currentPrice,
            amount: positionSize,
          },
          message: `Time-based exit after ${Math.round(holdingMinutes)} minutes`,
        };
      } else if (tp.onTimeExpired === "TRAILING" && tp.trailingConfig) {
        // Активируем трейлинг
        if (!this.state.trailingState?.activated) {
          this.state.trailingState = {
            ...tp.trailingConfig,
            activated: true,
            highestPrice: context.currentPrice,
            lowestPrice: context.currentPrice,
          };
        }
      }
    }

    return { actionRequired: false };
  }

  private checkTrailingActivation(
    context: TacticsExecutionContext,
    config: TrailingStopConfig
  ): boolean {
    const { currentPrice, avgEntryPrice } = context;
    const profitPercent = ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100;

    // Активация по % прибыли
    if (config.activationProfit && profitPercent >= config.activationProfit) {
      return true;
    }

    // Активация по цене
    if (config.activationPrice && currentPrice >= config.activationPrice) {
      return true;
    }

    // Активация после TP
    if (config.activationAfterTP) {
      const executedTPCount = this.state.executedTPs?.length || 0;
      if (executedTPCount >= config.activationAfterTP) {
        return true;
      }
    }

    return false;
  }

  private calculateTrailingDistance(
    price: number,
    config: TrailingStopConfig,
    atr?: number
  ): number {
    switch (config.type) {
      case "PERCENT":
        return price * ((config.percentValue || 2) / 100);

      case "FIXED":
        return config.fixedValue || 0;

      case "ATR_BASED":
        return (atr || 0) * (config.atrMultiplier || 2);

      case "PRICE":
        return config.priceValue || 0;

      default:
        return price * 0.02;
    }
  }

  private calculateStopLossPrice(
    entryPrice: number,
    direction: "LONG" | "SHORT",
    sl: StopLossTactic,
    atr?: number
  ): number {
    switch (sl.type) {
      case "FIXED":
        return sl.slPrice || entryPrice;

      case "PERCENT":
        const slPercent = sl.slPercent || 2;
        return direction === "LONG"
          ? entryPrice * (1 - slPercent / 100)
          : entryPrice * (1 + slPercent / 100);

      case "ATR_BASED":
        const atrMultiplier = sl.atrMultiplier || 2;
        const atrValue = atr || entryPrice * 0.02; // Fallback to 2% if ATR not available
        return direction === "LONG"
          ? entryPrice - atrValue * atrMultiplier
          : entryPrice + atrValue * atrMultiplier;

      case "SUPPORT_BASED":
        // Для поддержки нужна внешняя информация
        return entryPrice * (direction === "LONG" ? 0.95 : 1.05);

      default:
        return entryPrice * (direction === "LONG" ? 0.98 : 1.02);
    }
  }

  private calculatePositionSize(price: number, entry: EntryTactic): number {
    // Это будет определяться внешним контекстом (баланс, риск-менеджмент)
    // Здесь возвращаем базовое значение
    return entry.positionSizeValue;
  }

  private calculateAvgEntryPrice(): number {
    if (!this.state.executedEntries?.length) return 0;

    const total = this.state.executedEntries.reduce(
      (acc, e) => acc + e.price * e.amount,
      0
    );
    const totalAmount = this.state.executedEntries.reduce(
      (acc, e) => acc + e.amount,
      0
    );

    return totalAmount > 0 ? total / totalAmount : 0;
  }

  private addStopLossChange(oldPrice: number, newPrice: number, reason: StopLossChange["reason"]): void {
    this.state.stopLossHistory = [
      ...(this.state.stopLossHistory || []),
      {
        oldPrice,
        newPrice,
        reason,
        changedAt: new Date(),
      },
    ];
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Создать исполнитель тактик из сигнала
 */
export function createTacticsExecutor(
  tacticsSet: TacticsSet,
  positionId: string
): TacticsExecutor {
  return new TacticsExecutor(tacticsSet, { positionId });
}

/**
 * Рассчитать размер позиции на основе риска
 */
export function calculatePositionSizeByRisk(
  balance: number,
  riskPercent: number,
  entryPrice: number,
  stopLossPrice: number,
  leverage: number = 1
): number {
  // Риск в деньгах
  const riskAmount = balance * (riskPercent / 100);
  
  // Расстояние до SL в %
  const slDistancePercent = Math.abs((entryPrice - stopLossPrice) / entryPrice) * 100;
  
  // Размер позиции = Риск / Расстояние до SL
  const positionSize = (riskAmount / slDistancePercent) * 100 * leverage;
  
  return positionSize;
}
