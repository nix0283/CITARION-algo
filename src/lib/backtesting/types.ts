/**
 * Backtesting Types
 * 
 * Типы и интерфейсы для бэктестинга стратегий.
 */

import { Candle, Timeframe, StrategySignal, StrategyConfig, IndicatorResult } from "../strategy/types";
import { TacticsSet, TacticsExecutionState } from "../strategy/tactics/types";

// ==================== BACKTEST CONFIGURATION ====================

/**
 * Конфигурация бэктеста
 */
export interface BacktestConfig {
  /** ID бэктеста */
  id: string;
  /** Название */
  name: string;
  
  // === Data Settings ===
  /** Символ */
  symbol: string;
  /** Таймфрейм */
  timeframe: Timeframe;
  /** Начальная дата */
  startDate: Date;
  /** Конечная дата */
  endDate: Date;
  /** Начальный баланс */
  initialBalance: number;
  /** Валюта баланса */
  balanceCurrency: string;
  
  // === Strategy Settings ===
  /** ID стратегии */
  strategyId: string;
  /** Параметры стратегии */
  strategyParameters?: Record<string, number | boolean | string>;
  /** Набор тактик */
  tacticsSet: TacticsSet;
  
  // === Trading Settings ===
  /** Комиссия биржи (%) */
  feePercent: number;
  /** Slippage (%) */
  slippagePercent: number;
  /** Максимальное плечо */
  maxLeverage: number;
  /** Режим маржи */
  marginMode: "isolated" | "cross";
  /** Разрешить шорт */
  allowShort: boolean;
  
  // === Risk Management ===
  /** Максимальный риск на сделку (%) */
  maxRiskPerTrade?: number;
  /** Максимальная просадка (%) - остановка бэктеста */
  maxDrawdown?: number;
  /** Максимальное количество открытых позиций */
  maxOpenPositions?: number;
}

// ==================== BACKTEST POSITION ====================

/**
 * Позиция в бэктесте
 */
export interface BacktestPosition {
  /** ID позиции */
  id: string;
  /** Символ */
  symbol: string;
  /** Направление */
  direction: "LONG" | "SHORT";
  /** Статус */
  status: "OPEN" | "CLOSED" | "LIQUIDATED";
  
  // === Entry ===
  /** Цена входа (средняя) */
  avgEntryPrice: number;
  /** Записи о входах (для DCA) */
  entries: BacktestEntry[];
  /** Общий размер позиции */
  totalSize: number;
  /** Время открытия */
  openedAt: Date;
  /** Индекс свечи открытия */
  openedAtIndex: number;
  
  // === Exit ===
  /** Цена выхода (средняя) */
  avgExitPrice?: number;
  /** Записи о выходах */
  exits: BacktestExit[];
  /** Время закрытия */
  closedAt?: Date;
  /** Индекс свечи закрытия */
  closedAtIndex?: number;
  /** Причина закрытия */
  closeReason?: "TP" | "SL" | "SIGNAL" | "MANUAL" | "LIQUIDATION" | "TIME" | "TRAILING_STOP";
  
  // === Prices ===
  /** Текущая цена */
  currentPrice: number;
  /** Stop Loss */
  stopLoss?: number;
  /** Take Profit targets */
  takeProfitTargets: BacktestTPTarget[];
  
  // === PnL ===
  /** Нереализованный PnL */
  unrealizedPnl: number;
  /** Реализованный PnL */
  realizedPnl: number;
  /** Комиссии */
  totalFees: number;
  /** Фандинг (для фьючерсов) */
  totalFunding: number;
  
  // === Tactics State ===
  /** Состояние выполнения тактик */
  tacticsState: TacticsExecutionState;
  
  // === Leverage ===
  /** Плечо */
  leverage: number;
  /** Режим маржи */
  marginMode: "isolated" | "cross";
  /** Залог */
  margin: number;
  /** Цена ликвидации */
  liquidationPrice?: number;
}

/**
 * Запись о входе
 */
export interface BacktestEntry {
  index: number;
  price: number;
  size: number;
  fee: number;
  timestamp: Date;
  candleIndex: number;
}

/**
 * Запись о выходе
 */
export interface BacktestExit {
  index: number;
  price: number;
  size: number;
  fee: number;
  pnl: number;
  reason: "TP" | "SL" | "SIGNAL" | "PARTIAL" | "TRAILING_STOP";
  timestamp: Date;
  candleIndex: number;
  tpIndex?: number;
}

/**
 * Цель Take Profit в бэктесте
 */
export interface BacktestTPTarget {
  index: number;
  price: number;
  closePercent: number;
  filled: boolean;
  filledAt?: Date;
  filledAtIndex?: number;
}

// ==================== BACKTEST TRADE ====================

/**
 * Завершённая сделка
 */
export interface BacktestTrade {
  /** ID сделки */
  id: string;
  /** ID позиции */
  positionId: string;
  /** Символ */
  symbol: string;
  /** Направление */
  direction: "LONG" | "SHORT";
  
  // === Entry ===
  avgEntryPrice: number;
  totalSize: number;
  openedAt: Date;
  openedAtIndex: number;
  
  // === Exit ===
  avgExitPrice: number;
  closedAt: Date;
  closedAtIndex: number;
  closeReason: "TP" | "SL" | "SIGNAL" | "MANUAL" | "LIQUIDATION" | "TIME" | "TRAILING_STOP";
  
  // === PnL ===
  pnl: number;
  pnlPercent: number;
  fees: number;
  funding: number;
  netPnl: number;
  
  // === Duration ===
  durationMinutes: number;
  durationCandles: number;
  
  // === Extreme Values ===
  maxProfit: number;
  maxProfitPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  // === Tactics Info ===
  tacticsSetId: string;
  strategySignalId?: string;
}

// ==================== BACKTEST EQUITY CURVE ====================

/**
 * Точка на кривой эквити
 */
export interface EquityPoint {
  timestamp: Date;
  candleIndex: number;
  price: number;
  
  // Balance
  balance: number;
  equity: number;
  availableMargin: number;
  
  // PnL
  unrealizedPnl: number;
  realizedPnl: number;
  dailyPnl: number;
  cumulativePnl: number;
  
  // Drawdown
  drawdown: number;
  drawdownPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  // Stats
  openPositions: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
}

// ==================== BACKTEST METRICS ====================

/**
 * Метрики бэктеста
 */
export interface BacktestMetrics {
  // === Basic Stats ===
  /** Общее количество сделок */
  totalTrades: number;
  /** Количество прибыльных сделок */
  winningTrades: number;
  /** Количество убыточных сделок */
  losingTrades: number;
  /** Win Rate (%) */
  winRate: number;
  
  // === PnL ===
  /** Общий PnL */
  totalPnl: number;
  /** Общий PnL (%) */
  totalPnlPercent: number;
  /** Средняя прибыль на сделку */
  avgPnl: number;
  /** Средняя прибыль на выигрышную сделку */
  avgWin: number;
  /** Средний убыток на проигрышную сделку */
  avgLoss: number;
  /** Максимальная прибыль */
  maxWin: number;
  /** Максимальный убыток */
  maxLoss: number;
  
  // === Ratios ===
  /** Profit Factor */
  profitFactor: number;
  /** Risk/Reward Ratio */
  riskRewardRatio: number;
  /** Sharpe Ratio */
  sharpeRatio: number;
  /** Sortino Ratio */
  sortinoRatio: number;
  /** Calmar Ratio */
  calmarRatio: number;
  
  // === Drawdown ===
  /** Максимальная просадка */
  maxDrawdown: number;
  /** Максимальная просадка (%) */
  maxDrawdownPercent: number;
  /** Средняя просадка */
  avgDrawdown: number;
  /** Время в просадке (%) */
  timeInDrawdown: number;
  /** Максимальная длительность просадки (дней) */
  maxDrawdownDuration: number;
  
  // === Duration ===
  /** Средняя длительность сделки (минуты) */
  avgTradeDuration: number;
  /** Средняя длительность выигрышной сделки */
  avgWinDuration: number;
  /** Средняя длительность проигрышной сделки */
  avgLossDuration: number;
  
  // === Streaks ===
  /** Максимальная серия побед */
  maxWinStreak: number;
  /** Максимальная серия поражений */
  maxLossStreak: number;
  /** Текущая серия */
  currentStreak: { type: "WIN" | "LOSS" | "NONE"; count: number };
  
  // === Returns ===
  /** Средний дневной доход (%) */
  avgDailyReturn: number;
  /** Средний недельный доход (%) */
  avgWeeklyReturn: number;
  /** Средний месячный доход (%) */
  avgMonthlyReturn: number;
  /** Годовой доход (%) */
  annualizedReturn: number;
  /** Волатильность доходности (годовая) */
  annualizedVolatility: number;
  
  // === Exposure ===
  /** Время в рынке (%) */
  marketExposure: number;
  /** Средний размер позиции */
  avgPositionSize: number;
  /** Среднее плечо */
  avgLeverage: number;
  
  // === Risk ===
  /** Value at Risk 95% */
  var95: number;
  /** Expected Shortfall 95% */
  expectedShortfall95: number;
}

// ==================== BACKTEST RESULT ====================

/**
 * Результат бэктеста
 */
export interface BacktestResult {
  /** ID */
  id: string;
  /** Конфигурация */
  config: BacktestConfig;
  
  // === Status ===
  /** Статус */
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  /** Прогресс (%) */
  progress: number;
  /** Ошибка (если есть) */
  error?: string;
  
  // === Data ===
  /** Все сделки */
  trades: BacktestTrade[];
  /** Кривая эквити */
  equityCurve: EquityPoint[];
  /** Метрики */
  metrics: BacktestMetrics;
  
  // === Summary ===
  /** Начальный баланс */
  initialBalance: number;
  /** Финальный баланс */
  finalBalance: number;
  /** Финальный эквити */
  finalEquity: number;
  
  // === Timing ===
  /** Время начала */
  startedAt?: Date;
  /** Время завершения */
  completedAt?: Date;
  /** Длительность (мс) */
  duration?: number;
  
  // === Additional Info ===
  /** Количество обработанных свечей */
  candlesProcessed: number;
  /** Количество сигналов стратегии */
  signalsGenerated: number;
  /** Количество пропущенных сигналов */
  signalsSkipped: number;
  
  /** Логи */
  logs: BacktestLogEntry[];
}

/**
 * Запись лога бэктеста
 */
export interface BacktestLogEntry {
  timestamp: Date;
  candleIndex: number;
  level: "INFO" | "WARNING" | "ERROR" | "DEBUG";
  message: string;
  data?: Record<string, unknown>;
}

// ==================== BACKTEST COMPARISON ====================

/**
 * Результат сравнения бэктестов
 */
export interface BacktestComparison {
  /** ID сравнения */
  id: string;
  /** Сравниваемые результаты */
  results: BacktestResult[];
  /** Метрики для сравнения */
  metricsComparison: Record<string, { values: number[]; best: number; worst: number }>;
  /** Рейтинг */
  ranking: { resultId: string; score: number; rank: number }[];
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Создать конфигурацию бэктеста по умолчанию
 */
export function createDefaultBacktestConfig(
  strategyId: string,
  symbol: string,
  timeframe: Timeframe,
  tacticsSet: TacticsSet
): BacktestConfig {
  return {
    id: `backtest-${Date.now()}`,
    name: `Backtest ${strategyId} ${symbol}`,
    symbol,
    timeframe,
    startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 год назад
    endDate: new Date(),
    initialBalance: 10000,
    balanceCurrency: "USDT",
    strategyId,
    tacticsSet,
    feePercent: 0.1,
    slippagePercent: 0.05,
    maxLeverage: 10,
    marginMode: "isolated",
    allowShort: true,
    maxRiskPerTrade: 2,
    maxDrawdown: 50,
    maxOpenPositions: 3,
  };
}

/**
 * Создать пустой результат бэктеста
 */
export function createEmptyBacktestResult(config: BacktestConfig): BacktestResult {
  return {
    id: config.id,
    config,
    status: "PENDING",
    progress: 0,
    trades: [],
    equityCurve: [],
    metrics: {
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
      avgTradeDuration: 0,
      avgWinDuration: 0,
      avgLossDuration: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      currentStreak: { type: "NONE", count: 0 },
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
    },
    initialBalance: config.initialBalance,
    finalBalance: config.initialBalance,
    finalEquity: config.initialBalance,
    candlesProcessed: 0,
    signalsGenerated: 0,
    signalsSkipped: 0,
    logs: [],
  };
}
