/**
 * Tactics Types
 * 
 * Tactics (Тактики) - это слой управления позицией после определения сигнала.
 * Включает: Entry Tactics, Exit Tactics, Position Management Tactics
 * 
 * Интеграция:
 * - Strategy Framework - использует Tactics для определения точек входа/выхода
 * - Backtesting Engine - тестирует стратегии с разными тактиками
 * - Paper Trading Engine - виртуальная торговля с тактиками
 * - Hyperopt Engine - оптимизация параметров тактик
 */

// ==================== ENTRY TACTICS ====================

/**
 * Тип входа в позицию
 */
export type EntryType = 
  | "MARKET"           // Рыночный ордер - немедленное исполнение
  | "LIMIT"            // Лимитный ордер - по указанной цене
  | "LIMIT_ZONE"       // Лимитный ордер в зоне (диапазон цен)
  | "BREAKOUT"         // Пробой уровня - вход при пробое сопротивления/поддержки
  | "PULLBACK"         // Откат - вход на откате после пробоя
  | "DCA";             // Dollar Cost Averaging - усреднение несколькими входами

/**
 * Тактика входа в позицию
 */
export interface EntryTactic {
  /** Уникальный идентификатор тактики */
  id: string;
  /** Название тактики */
  name: string;
  /** Тип входа */
  type: EntryType;
  
  // === Параметры для LIMIT / LIMIT_ZONE ===
  /** Цены входа (для множественных входов) */
  entryPrices?: number[];
  /** Зона входа (мин/макс) */
  entryZone?: { min: number; max: number };
  /** Время ожидания входа в минутах (0 = бессрочно) */
  entryTimeout?: number;
  /** Действие по истечении времени: CANCEL (отменить) или MARKET (рыночный вход) */
  onTimeout?: "CANCEL" | "MARKET";
  
  // === Параметры для BREAKOUT ===
  /** Уровень пробоя */
  breakoutLevel?: number;
  /** Направление пробоя: ABOVE (пробой вверх), BELOW (пробой вниз) */
  breakoutDirection?: "ABOVE" | "BELOW";
  /** Подтверждение пробоя в % (ждём закрытия свечи выше/ниже уровня) */
  breakoutConfirmation?: number;
  
  // === Параметры для PULLBACK ===
  /** Уровень, после отката от которого входить */
  pullbackLevel?: number;
  /** Глубина отката в % от движения */
  pullbackPercent?: number;
  
  // === Параметры для DCA ===
  /** Количество входов */
  dcaCount?: number;
  /** Расстояние между входами в % */
  dcaStep?: number;
  /** Множитель размера позиции для каждого следующего входа */
  dcaSizeMultiplier?: number;
  /** Максимальное отклонение от средней цены входа в % */
  dcaMaxDeviation?: number;
  
  // === Общие параметры ===
  /** Размер позиции (% от баланса или фиксированная сумма) */
  positionSize: PositionSizeMode;
  /** Размер в абсолютном значении */
  positionSizeValue: number;
  
  /** Приоритет выполнения (1 = высший) */
  priority?: number;
  /** Активна ли тактика */
  active?: boolean;
}

export type PositionSizeMode = "PERCENT" | "FIXED" | "RISK_BASED";

// ==================== EXIT TACTICS ====================

/**
 * Тип выхода из позиции
 */
export type ExitType =
  | "FIXED_TP"         // Фиксированный Take Profit
  | "MULTI_TP"         // Множественные Take Profits с % закрытия
  | "TRAILING_STOP"    // Скользящий Stop Loss
  | "BREAKEVEN"        // Выход в безубыток
  | "TIME_BASED"       // Выход по времени
  | "SIGNAL_BASED";    // Выход по сигналу стратегии

/**
 * Тактика Take Profit
 */
export interface TakeProfitTactic {
  /** Уникальный идентификатор */
  id: string;
  /** Название */
  name: string;
  /** Тип выхода */
  type: ExitType;
  
  // === FIXED_TP ===
  /** Фиксированная цена TP */
  tpPrice?: number;
  /** Фиксированный % прибыли для TP */
  tpPercent?: number;
  
  // === MULTI_TP ===
  /** Множественные цели TP */
  targets?: TPTarget[];
  
  // === TRAILING_STOP ===
  /** Конфигурация трейлинг-стопа */
  trailingConfig?: TrailingStopConfig;
  
  // === BREAKEVEN ===
  /** Активировать breakeven при достижении % прибыли */
  breakevenTrigger?: number;
  
  // === TIME_BASED ===
  /** Максимальное время удержания позиции в минутах */
  maxHoldingTime?: number;
  /** Действие по истечении: CLOSE_ALL (закрыть всё) или TRAILING (активировать трейлинг) */
  onTimeExpired?: "CLOSE_ALL" | "TRAILING";
  
  /** Приоритет выполнения */
  priority?: number;
  /** Активна ли тактика */
  active?: boolean;
}

/**
 * Цель Take Profit с % закрытия позиции
 */
export interface TPTarget {
  /** Порядковый номер */
  index: number;
  /** Цена цели */
  price?: number;
  /** Или % от цены входа */
  profitPercent?: number;
  /** % позиции для закрытия на этой цели */
  closePercent: number;
  /** Исполнено ли */
  filled?: boolean;
  /** Время исполнения */
  filledAt?: Date;
}

/**
 * Конфигурация трейлинг-стопа
 */
export interface TrailingStopConfig {
  /** Тип трейлинга */
  type: "PERCENT" | "FIXED" | "ATR_BASED" | "PRICE";
  
  // === PERCENT ===
  /** Процент от цены для трейлинга */
  percentValue?: number;
  
  // === FIXED ===
  /** Фиксированное расстояние в цене */
  fixedValue?: number;
  
  // === ATR_BASED ===
  /** Множитель ATR для расстояния */
  atrMultiplier?: number;
  /** Период ATR */
  atrPeriod?: number;
  
  // === PRICE ===
  /** Фиксированная цена стопа */
  priceValue?: number;
  
  // === Параметры активации ===
  /** Активировать при достижении % прибыли */
  activationProfit?: number;
  /** Активировать при достижении цены */
  activationPrice?: number;
  /** Активировать при достижении TP номера */
  activationAfterTP?: number;
  
  // === Состояние ===
  /** Активирован ли трейлинг */
  activated?: boolean;
  /** Максимальная достигнутая цена (для LONG) */
  highestPrice?: number;
  /** Минимальная достигнутая цена (для SHORT) */
  lowestPrice?: number;
  /** Текущий уровень стопа */
  currentStopPrice?: number;
}

/**
 * Тактика Stop Loss
 */
export interface StopLossTactic {
  /** Уникальный идентификатор */
  id: string;
  /** Название */
  name: string;
  
  /** Тип стоп-лосса */
  type: "FIXED" | "PERCENT" | "ATR_BASED" | "SUPPORT_BASED";
  
  // === FIXED ===
  /** Фиксированная цена SL */
  slPrice?: number;
  
  // === PERCENT ===
  /** Процент от цены входа */
  slPercent?: number;
  
  // === ATR_BASED ===
  /** Множитель ATR */
  atrMultiplier?: number;
  /** Период ATR */
  atrPeriod?: number;
  
  // === SUPPORT_BASED ===
  /** Использовать ближайшую поддержку/сопротивление */
  useSupportLevel?: boolean;
  /** Отступ от уровня в % */
  levelOffset?: number;
  
  // === Дополнительные параметры ===
  /** Переместить SL на breakeven после достижения % прибыли */
  moveToBreakevenAfter?: number;
  /** Уменьшить размер SL при достижении TP (в % от оригинала) */
  reduceOnTP?: number;
  
  /** Активна ли тактика */
  active?: boolean;
}

// ==================== POSITION MANAGEMENT TACTICS ====================

/**
 * Тактика управления позицией
 */
export interface PositionManagementTactic {
  /** Уникальный идентификатор */
  id: string;
  /** Название */
  name: string;
  
  // === Scaling (масштабирование) ===
  /** Доливка позиции (DCA после входа) */
  addToPosition?: AddToPositionConfig;
  /** Частичное закрытие */
  partialClose?: PartialCloseConfig[];
  
  // === Risk Management ===
  /** Максимальный риск на сделку в % */
  maxRiskPercent?: number;
  /** Максимальная просадка позиции в % (принудительное закрытие) */
  maxDrawdownPercent?: number;
  /** Максимальный убыток в день в % от баланса */
  maxDailyLossPercent?: number;
  
  // === Martingale (ОСТОРОЖНО!) ===
  /** Конфигурация мартингейла (не рекомендуется) */
  martingale?: MartingaleConfig;
  
  /** Активна ли тактика */
  active?: boolean;
}

/**
 * Конфигурация доливки позиции
 */
export interface AddToPositionConfig {
  /** Включена ли доливка */
  enabled: boolean;
  /** Условие: PROFIT (доливка в прибыли) или LOSS (доливка в убытке/DCA) */
  condition: "PROFIT" | "LOSS";
  /** Порог для доливки в % прибыли/убытка */
  triggerPercent: number;
  /** Размер доливки относительно оригинальной позиции (1 = 100%) */
  sizeMultiplier: number;
  /** Максимальное количество доливок */
  maxAdditions: number;
  /** Изменять ли SL после доливки */
  adjustStopLoss?: boolean;
}

/**
 * Конфигурация частичного закрытия
 */
export interface PartialCloseConfig {
  /** Условие: PROFIT_PERCENT или TIME */
  trigger: "PROFIT_PERCENT" | "TIME" | "PRICE";
  /** Значение триггера (% прибыли, минуты или цена) */
  triggerValue: number;
  /** % позиции для закрытия */
  closePercent: number;
}

/**
 * Конфигурация мартингейла (ОСТОРОЖНО!)
 */
export interface MartingaleConfig {
  /** Включён ли мартингейл */
  enabled: boolean;
  /** Множитель размера после убытка */
  multiplier: number;
  /** Максимальное количество удвоений */
  maxSteps: number;
  /** Сбрасывать ли после прибыльной сделки */
  resetOnProfit: boolean;
}

// ==================== COMPOSITE TACTICS ====================

/**
 * Полный набор тактик для позиции
 * Объединяет Entry, Exit и Management тактики
 */
export interface TacticsSet {
  /** Уникальный идентификатор набора */
  id: string;
  /** Название набора */
  name: string;
  /** Описание */
  description?: string;
  
  /** Тактика входа */
  entry: EntryTactic;
  /** Тактика Take Profit */
  takeProfit: TakeProfitTactic;
  /** Тактика Stop Loss */
  stopLoss: StopLossTactic;
  /** Тактика управления позицией (опционально) */
  management?: PositionManagementTactic;
  
  /** Теги для классификации */
  tags?: string[];
  /** Рейтинг эффективности (0-100) по результатам бэктестинга */
  performanceRating?: number;
  
  /** Создатель (системный или пользователь) */
  createdBy: "SYSTEM" | "USER";
  /** Время создания */
  createdAt: Date;
  /** Время последнего использования */
  lastUsedAt?: Date;
}

// ==================== TACTICS EXECUTION STATE ====================

/**
 * Состояние выполнения тактик для открытой позиции
 */
export interface TacticsExecutionState {
  /** ID позиции */
  positionId: string;
  /** ID набора тактик */
  tacticsSetId: string;
  
  // === Entry State ===
  /** Статус входа */
  entryStatus: "PENDING" | "PARTIAL" | "COMPLETED" | "CANCELLED";
  /** Исполненные входы (для DCA) */
  executedEntries?: ExecutedEntry[];
  
  // === Take Profit State ===
  /** Исполненные TP */
  executedTPs?: ExecutedTP[];
  /** Следующий TP для исполнения */
  nextTPIndex?: number;
  
  // === Stop Loss State ===
  /** Текущая цена SL */
  currentStopLoss?: number;
  /** История изменений SL */
  stopLossHistory?: StopLossChange[];
  
  // === Trailing Stop State ===
  /** Текущая конфигурация трейлинга */
  trailingState?: TrailingStopConfig;
  
  // === Management State ===
  /** Количество выполненных доливок */
  additionsCount?: number;
  /** Количество частичных закрытий */
  partialClosesCount?: number;
  
  /** Последнее обновление */
  updatedAt: Date;
}

/**
 * Исполненный вход (для DCA)
 */
export interface ExecutedEntry {
  /** Индекс входа */
  index: number;
  /** Цена исполнения */
  price: number;
  /** Размер */
  amount: number;
  /** Время */
  executedAt: Date;
}

/**
 * Исполненный Take Profit
 */
export interface ExecutedTP {
  /** Индекс TP */
  index: number;
  /** Цена исполнения */
  price: number;
  /** % закрытия */
  closedPercent: number;
  /** Размер закрытия */
  closedAmount: number;
  /** PnL закрытия */
  pnl: number;
  /** Время */
  executedAt: Date;
}

/**
 * Изменение Stop Loss
 */
export interface StopLossChange {
  /** Предыдущая цена */
  oldPrice: number;
  /** Новая цена */
  newPrice: number;
  /** Причина изменения */
  reason: "TRAILING" | "BREAKEVEN" | "MANUAL" | "TP_ADJUSTMENT";
  /** Время */
  changedAt: Date;
}

// ==================== PREDEFINED TACTICS ====================

/**
 * Предустановленные наборы тактик
 */
export const PREDEFINED_TACTICS_SETS: TacticsSet[] = [
  // === CONSERVATIVE ===
  {
    id: "conservative-1",
    name: "Conservative - Fixed TP/SL",
    description: "Консервативный подход: фиксированные TP и SL, без трейлинга",
    entry: {
      id: "entry-conservative",
      name: "Limit Entry",
      type: "LIMIT",
      positionSize: "PERCENT",
      positionSizeValue: 2,
      entryTimeout: 60,
      onTimeout: "CANCEL",
    },
    takeProfit: {
      id: "tp-conservative",
      name: "Single TP",
      type: "FIXED_TP",
      tpPercent: 3,
    },
    stopLoss: {
      id: "sl-conservative",
      name: "Fixed SL",
      type: "PERCENT",
      slPercent: 1.5,
      moveToBreakevenAfter: 2,
    },
    tags: ["conservative", "beginner"],
    createdBy: "SYSTEM",
    createdAt: new Date(),
  },
  
  // === AGGRESSIVE ===
  {
    id: "aggressive-1",
    name: "Aggressive - Multi TP with Trailing",
    description: "Агрессивный подход: множественные TP с трейлинг-стопом",
    entry: {
      id: "entry-aggressive",
      name: "Market Entry",
      type: "MARKET",
      positionSize: "PERCENT",
      positionSizeValue: 5,
    },
    takeProfit: {
      id: "tp-aggressive",
      name: "Multi TP + Trailing",
      type: "MULTI_TP",
      targets: [
        { index: 1, profitPercent: 2, closePercent: 25 },
        { index: 2, profitPercent: 4, closePercent: 25 },
        { index: 3, profitPercent: 6, closePercent: 25 },
        { index: 4, profitPercent: 10, closePercent: 25 },
      ],
      trailingConfig: {
        type: "PERCENT",
        percentValue: 1.5,
        activationProfit: 3,
      },
    },
    stopLoss: {
      id: "sl-aggressive",
      name: "ATR-based SL",
      type: "ATR_BASED",
      atrMultiplier: 2,
      atrPeriod: 14,
      moveToBreakevenAfter: 3,
    },
    management: {
      id: "mgmt-aggressive",
      name: "Risk Management",
      maxRiskPercent: 5,
      maxDrawdownPercent: 15,
    },
    tags: ["aggressive", "experienced"],
    createdBy: "SYSTEM",
    createdAt: new Date(),
  },
  
  // === SCALPING ===
  {
    id: "scalping-1",
    name: "Scalping - Quick In/Out",
    description: "Скальпинг: быстрый вход и выход, минимальные цели",
    entry: {
      id: "entry-scalping",
      name: "Market Entry",
      type: "MARKET",
      positionSize: "FIXED",
      positionSizeValue: 100, // $100 per trade
    },
    takeProfit: {
      id: "tp-scalping",
      name: "Quick TP",
      type: "FIXED_TP",
      tpPercent: 0.5,
    },
    stopLoss: {
      id: "sl-scalping",
      name: "Tight SL",
      type: "PERCENT",
      slPercent: 0.3,
    },
    management: {
      id: "mgmt-scalping",
      name: "Scalping Management",
      maxRiskPercent: 0.5,
    },
    tags: ["scalping", "quick"],
    createdBy: "SYSTEM",
    createdAt: new Date(),
  },
  
  // === SWING ===
  {
    id: "swing-1",
    name: "Swing - Position Trading",
    description: "Свинг-трейдинг: удержание позиции несколько дней",
    entry: {
      id: "entry-swing",
      name: "Limit Zone Entry",
      type: "LIMIT_ZONE",
      positionSize: "PERCENT",
      positionSizeValue: 3,
      entryTimeout: 1440, // 24 hours
      onTimeout: "CANCEL",
    },
    takeProfit: {
      id: "tp-swing",
      name: "Multi TP",
      type: "MULTI_TP",
      targets: [
        { index: 1, profitPercent: 5, closePercent: 33 },
        { index: 2, profitPercent: 10, closePercent: 33 },
        { index: 3, profitPercent: 15, closePercent: 34 },
      ],
      trailingConfig: {
        type: "PERCENT",
        percentValue: 3,
        activationAfterTP: 1,
      },
    },
    stopLoss: {
      id: "sl-swing",
      name: "Support-based SL",
      type: "SUPPORT_BASED",
      useSupportLevel: true,
      levelOffset: 0.5,
      moveToBreakevenAfter: 5,
    },
    tags: ["swing", "position"],
    createdBy: "SYSTEM",
    createdAt: new Date(),
  },
  
  // === DCA ===
  {
    id: "dca-1",
    name: "DCA - Dollar Cost Averaging",
    description: "Усреднение долларовой стоимости: несколько входов",
    entry: {
      id: "entry-dca",
      name: "DCA Entry",
      type: "DCA",
      positionSize: "PERCENT",
      positionSizeValue: 1,
      dcaCount: 5,
      dcaStep: 2,
      dcaSizeMultiplier: 1.5,
      dcaMaxDeviation: 10,
    },
    takeProfit: {
      id: "tp-dca",
      name: "Average-based TP",
      type: "FIXED_TP",
      tpPercent: 5, // 5% от средней цены входа
    },
    stopLoss: {
      id: "sl-dca",
      name: "Wide SL",
      type: "PERCENT",
      slPercent: 15, // Широкий стоп для DCA
    },
    management: {
      id: "mgmt-dca",
      name: "DCA Management",
      maxDrawdownPercent: 25,
    },
    tags: ["dca", "averaging"],
    createdBy: "SYSTEM",
    createdAt: new Date(),
  },
];

// ==================== UTILITY FUNCTIONS ====================

/**
 * Создать набор тактик из сигнала
 */
export function createTacticsFromSignal(signal: {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrices?: number[];
  entryZone?: { min: number; max: number };
  takeProfits?: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage?: number;
  isMarketEntry?: boolean;
}): TacticsSet {
  const entryType: EntryType = signal.isMarketEntry 
    ? "MARKET" 
    : signal.entryZone 
      ? "LIMIT_ZONE" 
      : signal.entryPrices && signal.entryPrices.length > 1 
        ? "DCA" 
        : "LIMIT";

  const entryTactic: EntryTactic = {
    id: `entry-${Date.now()}`,
    name: "Signal Entry",
    type: entryType,
    entryPrices: signal.entryPrices,
    entryZone: signal.entryZone,
    positionSize: "PERCENT",
    positionSizeValue: 2, // Default 2%
  };

  const tpTargets: TPTarget[] | undefined = signal.takeProfits?.map((tp, i) => ({
    index: i + 1,
    price: tp.price,
    closePercent: tp.percentage,
    filled: false,
  }));

  const takeProfitTactic: TakeProfitTactic = {
    id: `tp-${Date.now()}`,
    name: "Signal TP",
    type: tpTargets && tpTargets.length > 1 ? "MULTI_TP" : "FIXED_TP",
    targets: tpTargets,
    tpPrice: tpTargets?.[0]?.price,
  };

  const stopLossTactic: StopLossTactic = {
    id: `sl-${Date.now()}`,
    name: "Signal SL",
    type: "FIXED",
    slPrice: signal.stopLoss,
  };

  return {
    id: `tactics-${Date.now()}`,
    name: `Tactics for ${signal.symbol} ${signal.direction}`,
    entry: entryTactic,
    takeProfit: takeProfitTactic,
    stopLoss: stopLossTactic,
    createdBy: "USER",
    createdAt: new Date(),
  };
}

/**
 * Валидация набора тактик
 */
export function validateTacticsSet(tactics: TacticsSet): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Entry validation
  if (tactics.entry.type === "LIMIT" && !tactics.entry.entryPrices?.length) {
    errors.push("Limit entry requires entry prices");
  }
  if (tactics.entry.type === "LIMIT_ZONE" && !tactics.entry.entryZone) {
    errors.push("Limit zone entry requires entry zone");
  }
  if (tactics.entry.type === "DCA" && (!tactics.entry.dcaCount || tactics.entry.dcaCount < 2)) {
    errors.push("DCA entry requires dcaCount >= 2");
  }

  // TP validation
  if (tactics.takeProfit.type === "MULTI_TP") {
    const totalPercent = tactics.takeProfit.targets?.reduce((sum, t) => sum + t.closePercent, 0) || 0;
    if (totalPercent !== 100) {
      errors.push(`Multi TP close percentages must sum to 100 (got ${totalPercent})`);
    }
  }

  // SL validation
  if (!tactics.stopLoss.slPrice && !tactics.stopLoss.slPercent && !tactics.stopLoss.atrMultiplier) {
    errors.push("Stop loss requires a price, percent, or ATR multiplier");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
