/**
 * Strategy Bot Types
 * 
 * Типы для автоматического торгового бота на основе Strategy + Tactics.
 * Поддерживает три режима работы:
 * - BACKTEST: тестирование на исторических данных
 * - PAPER: виртуальная торговля с реальными ценами
 * - LIVE: реальная торговля на бирже
 */

import { TacticsSet } from "../strategy/tactics/types";
import { Timeframe, Candle, StrategySignal } from "../strategy/types";
import { BacktestMetrics } from "../backtesting/types";

// ==================== BOT MODES ====================

/**
 * Режим работы бота
 */
export type BotMode = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Статус бота
 */
export type BotStatus = 
  | "IDLE"           // Создан, но не запущен
  | "RUNNING"        // Работает
  | "PAUSED"         // Приостановлен
  | "STOPPED"        // Остановлен
  | "ERROR"          // Ошибка
  | "COMPLETED";     // Завершён (для бэктеста)

// ==================== BOT CONFIGURATION ====================

/**
 * Базовая конфигурация бота
 */
export interface StrategyBotConfig {
  /** Уникальный ID */
  id: string;
  /** Название */
  name: string;
  /** Режим работы */
  mode: BotMode;
  
  // === Strategy Settings ===
  /** ID стратегии */
  strategyId: string;
  /** Параметры стратегии */
  strategyParameters?: Record<string, number | boolean | string>;
  /** Набор тактик */
  tacticsSet: TacticsSet;
  
  // === Market Settings ===
  /** Символ для торговли */
  symbol: string;
  /** Таймфрейм */
  timeframe: Timeframe;
  
  // === Risk Management ===
  /** Начальный баланс */
  initialBalance: number;
  /** Максимальное количество открытых позиций */
  maxOpenPositions: number;
  /** Максимальный риск на сделку (%) */
  maxRiskPerTrade: number;
  /** Максимальная просадка (%) */
  maxDrawdown: number;
  /** Максимальное плечо */
  maxLeverage: number;
  /** Разрешить шорт */
  allowShort: boolean;
  
  // === Fees ===
  /** Комиссия (%) */
  feePercent: number;
  
  // === Mode-specific Settings ===
  /** Настройки для Backtest режима */
  backtestSettings?: BacktestSettings;
  /** Настройки для Paper режима */
  paperSettings?: PaperSettings;
  /** Настройки для Live режима */
  liveSettings?: LiveSettings;
  
  // === Notifications ===
  notifyOnSignal?: boolean;
  notifyOnTrade?: boolean;
  notifyOnError?: boolean;
  
  /** Время создания */
  createdAt: Date;
  /** Время последнего обновления */
  updatedAt: Date;
}

/**
 * Настройки для Backtest режима
 */
export interface BacktestSettings {
  /** Начальная дата */
  startDate?: Date;
  /** Конечная дата */
  endDate?: Date;
  /** Использовать сохранённые данные */
  useStoredData?: boolean;
  /** Показать прогресс */
  showProgress?: boolean;
}

/**
 * Настройки для Paper Trading режима
 */
export interface PaperSettings {
  /** ID виртуального счёта */
  accountId?: string;
  /** Автоматическая торговля */
  autoTrading?: boolean;
  /** Интервал проверки сигналов (ms) */
  checkInterval?: number;
  /** WebSocket подключение для цен */
  usePriceWebSocket?: boolean;
}

/**
 * Настройки для Live Trading режима
 */
export interface LiveSettings {
  /** ID подключённого аккаунта биржи */
  accountId: string;
  /** Использовать тестовую сеть */
  useTestnet?: boolean;
  /** Автоматическая торговля */
  autoTrading?: boolean;
  /** Интервал проверки сигналов (ms) */
  checkInterval?: number;
  /** Требовать подтверждение перед входом */
  requireConfirmation?: boolean;
  /** Максимальное количество сделок в день */
  maxDailyTrades?: number;
}

// ==================== BOT STATE ====================

/**
 * Состояние бота
 */
export interface StrategyBotState {
  /** ID бота */
  botId: string;
  /** Статус */
  status: BotStatus;
  /** Режим */
  mode: BotMode;
  
  // === Position Tracking ===
  /** Открытые позиции */
  openPositions: BotPosition[];
  /** История позиций */
  positionHistory: BotPosition[];
  
  // === Metrics ===
  /** Текущий баланс */
  balance: number;
  /** Текущее эквити */
  equity: number;
  /** Нереализованный PnL */
  unrealizedPnl: number;
  /** Реализованный PnL */
  realizedPnl: number;
  /** Общий PnL */
  totalPnl: number;
  /** Максимальная просадка */
  maxDrawdown: number;
  /** Текущая просадка */
  currentDrawdown: number;
  
  // === Statistics ===
  /** Количество сделок */
  tradesCount: number;
  /** Количество прибыльных сделок */
  winsCount: number;
  /** Количество убыточных сделок */
  lossesCount: number;
  /** Win Rate */
  winRate: number;
  
  // === Signals ===
  /** Последний сигнал */
  lastSignal?: StrategySignal;
  /** Количество сгенерированных сигналов */
  signalsGenerated: number;
  /** Количество пропущенных сигналов */
  signalsSkipped: number;
  
  // === Runtime ===
  /** Время запуска */
  startedAt?: Date;
  /** Время остановки */
  stoppedAt?: Date;
  /** Время последнего обновления */
  lastUpdate: Date;
  /** Ошибка (если есть) */
  error?: string;
  
  // === Backtest-specific ===
  /** Метрики бэктеста (только для режима BACKTEST) */
  backtestMetrics?: BacktestMetrics;
  /** Прогресс бэктеста (%) */
  backtestProgress?: number;
}

/**
 * Позиция бота
 */
export interface BotPosition {
  /** ID позиции */
  id: string;
  /** Символ */
  symbol: string;
  /** Направление */
  direction: "LONG" | "SHORT";
  /** Статус */
  status: "OPEN" | "CLOSED" | "LIQUIDATED";
  
  // === Entry ===
  /** Средняя цена входа */
  avgEntryPrice: number;
  /** Входы */
  entries: BotEntry[];
  /** Общий размер */
  totalSize: number;
  /** Время открытия */
  openedAt: Date;
  
  // === Exit ===
  /** Средняя цена выхода */
  avgExitPrice?: number;
  /** Выходы */
  exits: BotExit[];
  /** Время закрытия */
  closedAt?: Date;
  /** Причина закрытия */
  closeReason?: "TP" | "SL" | "TRAILING_STOP" | "SIGNAL" | "MANUAL" | "LIQUIDATION" | "MAX_DRAWDOWN";
  
  // === Risk Management ===
  /** Stop Loss */
  stopLoss?: number;
  /** Take Profit targets */
  takeProfitTargets: BotTPTarget[];
  /** Текущая цена */
  currentPrice: number;
  
  // === PnL ===
  /** Нереализованный PnL */
  unrealizedPnl: number;
  /** Реализованный PnL */
  realizedPnl: number;
  /** Общие комиссии */
  totalFees: number;
  
  // === Position Details ===
  /** Плечо */
  leverage: number;
  /** Маржа */
  margin: number;
  /** Цена ликвидации */
  liquidationPrice?: number;
  
  // === Signal Info ===
  /** Уверенность сигнала */
  signalConfidence?: number;
  /** ID набора тактик */
  tacticsSetId: string;
  
  // === Trailing State ===
  trailingState?: {
    activated: boolean;
    highestPrice?: number;
    lowestPrice?: number;
    currentStopPrice?: number;
  };
  
  // === Grid Bot specific ===
  /** Уровень сетки (для Grid Bot) */
  gridLevel?: number;
}

/**
 * Вход в позицию
 */
export interface BotEntry {
  index: number;
  price: number;
  size: number;
  fee: number;
  timestamp: Date;
  orderType: "MARKET" | "LIMIT";
}

/**
 * Выход из позиции
 */
export interface BotExit {
  index: number;
  price: number;
  size: number;
  fee: number;
  pnl: number;
  reason: "TP" | "SL" | "TRAILING_STOP" | "SIGNAL" | "MANUAL" | "PARTIAL";
  timestamp: Date;
  tpIndex?: number;
}

/**
 * Take Profit target
 */
export interface BotTPTarget {
  index: number;
  price: number;
  closePercent: number;
  filled: boolean;
  filledAt?: Date;
}

// ==================== BOT RESULT ====================

/**
 * Результат работы бота
 */
export interface StrategyBotResult {
  /** ID бота */
  botId: string;
  /** Режим */
  mode: BotMode;
  /** Статус */
  status: BotStatus;
  
  // === Performance ===
  /** Начальный баланс */
  initialBalance: number;
  /** Финальный баланс */
  finalBalance: number;
  /** Финальное эквити */
  finalEquity: number;
  /** Общий PnL */
  totalPnl: number;
  /** Общий PnL % */
  totalPnlPercent: number;
  
  // === Metrics ===
  metrics: BacktestMetrics;
  
  // === Trades ===
  /** Все сделки */
  trades: BotTrade[];
  
  // === Equity Curve ===
  equityCurve: BotEquityPoint[];
  
  // === Timing ===
  startedAt: Date;
  completedAt: Date;
  duration: number; // ms
  
  // === Logs ===
  logs: BotLogEntry[];
}

/**
 * Сделка бота
 */
export interface BotTrade {
  id: string;
  positionId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  
  avgEntryPrice: number;
  avgExitPrice: number;
  totalSize: number;
  
  openedAt: Date;
  closedAt: Date;
  closeReason: BotPosition["closeReason"];
  
  pnl: number;
  pnlPercent: number;
  fees: number;
  netPnl: number;
  
  durationMinutes: number;
  tacticsSetId: string;
}

/**
 * Точка на кривой эквити
 */
export interface BotEquityPoint {
  timestamp: Date;
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  drawdown: number;
  drawdownPercent: number;
  openPositions: number;
  tradesCount: number;
}

/**
 * Запись лога
 */
export interface BotLogEntry {
  timestamp: Date;
  level: "INFO" | "WARNING" | "ERROR" | "DEBUG";
  message: string;
  data?: Record<string, unknown>;
}

// ==================== EVENTS ====================

/**
 * Событие бота
 */
export interface StrategyBotEvent {
  type: 
    | "BOT_STARTED"
    | "BOT_STOPPED"
    | "BOT_PAUSED"
    | "BOT_RESUMED"
    | "BOT_ERROR"
    | "SIGNAL_GENERATED"
    | "SIGNAL_EXECUTED"
    | "SIGNAL_SKIPPED"
    | "POSITION_OPENED"
    | "POSITION_CLOSED"
    | "POSITION_UPDATED"
    | "TP_HIT"
    | "SL_HIT"
    | "TRAILING_ACTIVATED"
    | "TRAILING_UPDATED"
    | "MAX_DRAWDOWN_REACHED"
    | "DAILY_LIMIT_REACHED"
    | "BACKTEST_PROGRESS";
  timestamp: Date;
  botId: string;
  data?: Record<string, unknown>;
}

/**
 * Callback для событий бота
 */
export type StrategyBotEventCallback = (event: StrategyBotEvent) => void;

// ==================== ADAPTER INTERFACES ====================

/**
 * Интерфейс адаптера для бота
 * Позволяет унифицировать работу с разными режимами (Backtest, Paper, Live)
 */
export interface IBotAdapter {
  /** Тип адаптера */
  readonly type: BotMode;
  
  // === Lifecycle ===
  /** Инициализировать */
  initialize(config: StrategyBotConfig): Promise<void>;
  /** Запустить */
  start(): Promise<void>;
  /** Остановить */
  stop(): Promise<void>;
  /** Приостановить */
  pause(): Promise<void>;
  /** Возобновить */
  resume(): Promise<void>;
  
  // === Data ===
  /** Получить исторические свечи */
  getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<Candle[]>;
  /** Получить текущую цену */
  getCurrentPrice(symbol: string): Promise<number>;
  
  // === Trading ===
  /** Открыть позицию */
  openPosition(signal: StrategySignal, tactics: TacticsSet): Promise<BotPosition | null>;
  /** Закрыть позицию */
  closePosition(positionId: string, reason: BotPosition["closeReason"]): Promise<void>;
  /** Закрыть все позиции */
  closeAllPositions(reason: BotPosition["closeReason"]): Promise<void>;
  
  // === State ===
  /** Получить состояние */
  getState(): StrategyBotState;
  /** Получить результат */
  getResult(): StrategyBotResult;
  
  // === Events ===
  /** Подписаться на события */
  subscribe(callback: StrategyBotEventCallback): void;
  /** Отписаться */
  unsubscribe(callback: StrategyBotEventCallback): void;
}

// ==================== FACTORY ====================

/**
 * Конфигурация для создания бота из результата бэктеста
 */
export interface CreateBotFromBacktestConfig {
  /** ID бэктеста */
  backtestId: string;
  /** Название нового бота */
  name: string;
  /** Режим (PAPER или LIVE) */
  mode: "PAPER" | "LIVE";
  /** ID аккаунта (для LIVE режима) */
  accountId?: string;
  /** Начальный баланс */
  initialBalance: number;
}

/**
 * Результат создания бота из бэктеста
 */
export interface CreateBotFromBacktestResult {
  success: boolean;
  bot?: StrategyBotConfig;
  error?: string;
}
