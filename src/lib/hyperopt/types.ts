/**
 * Hyperopt Types
 * 
 * Типы и интерфейсы для оптимизации параметров стратегий и тактик.
 * Поддерживает: Backtesting и Paper Trading
 * 
 * IMPORTANT: Now includes walk-forward validation for out-of-sample testing.
 */

import { StrategyParameter } from "../strategy/types";
import { TacticsSet } from "../strategy/tactics/types";
import { BacktestResult, BacktestMetrics } from "../backtesting/types";
import { PaperTradingMetrics, PaperEquityPoint, PaperTrade } from "../paper-trading/types";

// ==================== OPTIMIZATION MODE ====================

/**
 * Режим оптимизации
 */
export type OptimizationMode = "BACKTESTING" | "PAPER_TRADING" | "BOTH";

// ==================== WALK-FORWARD VALIDATION ====================

/**
 * Walk-forward validation type
 */
export type WalkForwardType = "anchored" | "expanding" | "rolling";

/**
 * Walk-forward validation configuration
 */
export interface WalkForwardValidationConfig {
  /** Type of walk-forward validation */
  type: WalkForwardType;
  /** Initial training window size (in bars or percentage) */
  initialTrainWindow: number;
  /** Test window size (in bars or percentage) */
  testWindow: number;
  /** Step size between folds (in bars or percentage) */
  stepSize: number;
  /** Embargo period between train and test (in bars) */
  embargoBars: number;
  /** Purge period at boundaries (in bars) */
  purgeBars: number;
  /** Whether initialTrainWindow is percentage (true) or bars (false) */
  usePercentageWindows?: boolean;
  /** Minimum training window size (for expanding) */
  minTrainWindow?: number;
  /** Maximum training window size (for expanding) */
  maxTrainWindow?: number;
}

/**
 * Single walk-forward fold result
 */
export interface WalkForwardFoldResult {
  foldIndex: number;
  params: Record<string, number | string | boolean>;
  trainResult: BacktestResult;
  testResult: BacktestResult;
  trainObjectiveValue: number;
  testObjectiveValue: number;
  overfittingScore: number; // train - test performance gap
  trainPeriod: { start: number; end: number };
  testPeriod: { start: number; end: number };
}

/**
 * Walk-forward optimization result
 */
export interface WalkForwardOptimizationResult {
  config: WalkForwardValidationConfig;
  folds: WalkForwardFoldResult[];
  avgTrainPerformance: number;
  avgTestPerformance: number;
  stdTestPerformance: number;
  outOfSamplePerformance: number;
  stabilityScore: number; // Consistency across folds
  overfittingRisk: 'low' | 'medium' | 'high';
  bestFold: WalkForwardFoldResult | null;
  robustParams: Record<string, number | string | boolean> | null;
}

// ==================== HYPEROPT CONFIGURATION ====================

/**
 * Параметр для оптимизации
 */
export interface HyperoptParameter {
  /** Имя параметра */
  name: string;
  /** Пространство значений */
  space: "categorical" | "uniform" | "loguniform" | "normal" | "quniform" | "qloguniform";
  
  // === Для categorical ===
  /** Категории */
  choices?: (string | number | boolean)[];
  
  // === Для uniform/loguniform/normal ===
  /** Минимум */
  min?: number;
  /** Максимум */
  max?: number;
  
  // === Для quniform/qloguniform ===
  /** Шаг квантования */
  q?: number;
  
  // === Для normal ===
  /** Среднее */
  mu?: number;
  /** Стандартное отклонение */
  sigma?: number;
  
  // === Метаданные ===
  /** Значение по умолчанию */
  defaultValue?: number | string | boolean;
  /** Категория параметра */
  category?: string;
}

/**
 * Конфигурация оптимизации
 */
export interface HyperoptConfig {
  /** ID оптимизации */
  id: string;
  /** Название */
  name: string;
  
  // === Target ===
  /** Что оптимизируем: стратегию или тактики */
  target: "STRATEGY" | "TACTICS" | "BOTH";
  /** ID стратегии */
  strategyId?: string;
  /** Базовый набор тактик */
  baseTacticsSet?: TacticsSet;
  
  // === Parameters ===
  /** Параметры стратегии для оптимизации */
  strategyParameters?: HyperoptParameter[];
  /** Параметры тактик для оптимизации */
  tacticsParameters?: TacticsHyperoptParams;
  
  // === Optimization Settings ===
  /** Метод оптимизации */
  method: "RANDOM" | "GRID" | "BAYESIAN" | "TPE" | "CMAES" | "GENETIC";
  /** Количество итераций */
  maxEvals: number;
  /** Метрика для оптимизации */
  objective: OptimizationObjective;
  /** Направление: максимизировать или минимизировать */
  direction: "maximize" | "minimize";
  
  // === Mode ===
  /** Режим оптимизации: Backtesting, Paper Trading или оба */
  mode: OptimizationMode;
  
  // === Backtest Settings (для режима BACKTESTING) ===
  /** Символ */
  symbol: string;
  /** Таймфрейм */
  timeframe: string;
  /** Начальная дата */
  startDate?: Date;
  /** Конечная дата */
  endDate?: Date;
  /** Начальный баланс */
  initialBalance: number;
  
  // === Paper Trading Settings (для режима PAPER_TRADING) ===
  /** Длительность Paper Trading в минутах */
  paperTradingDuration?: number;
  /** Интервал обновления цен в мс */
  priceUpdateInterval?: number;
  
  // === Constraints ===
  /** Минимальное количество сделок */
  minTrades?: number;
  /** Максимальная просадка (%) */
  maxDrawdown?: number;
  /** Минимальный win rate (%) */
  minWinRate?: number;
  
  // === Parallelization ===
  /** Параллельные вычисления */
  parallel: boolean;
  /** Количество параллельных процессов */
  workers?: number;
  
  // === Progressive Optimization ===
  /** Прогрессивная оптимизация: сперва Backtesting, потом Paper Trading */
  progressive?: boolean;
  /** Процент лучших результатов Backtesting для Paper Trading */
  topPercentForPaper?: number;
  
  // === Walk-Forward Validation ===
  /** Enable walk-forward validation for out-of-sample testing */
  useWalkForwardValidation?: boolean;
  /** Walk-forward validation configuration */
  walkForwardConfig?: WalkForwardValidationConfig;
}

/**
 * Параметры тактик для оптимизации
 */
export interface TacticsHyperoptParams {
  // Entry
  entryType?: HyperoptParameter;
  positionSize?: HyperoptParameter;
  entryTimeout?: HyperoptParameter;
  
  // Take Profit
  tpType?: HyperoptParameter;
  tpPercent?: HyperoptParameter;
  multiTPCount?: HyperoptParameter;
  multiTPDistribution?: HyperoptParameter;
  
  // Stop Loss
  slType?: HyperoptParameter;
  slPercent?: HyperoptParameter;
  
  // Trailing
  trailingType?: HyperoptParameter;
  trailingPercent?: HyperoptParameter;
  trailingActivation?: HyperoptParameter;
}

/**
 * Метрика для оптимизации
 */
export type OptimizationObjective = 
  | "totalPnl" 
  | "totalPnlPercent"
  | "winRate" 
  | "profitFactor" 
  | "sharpeRatio" 
  | "sortinoRatio"
  | "calmarRatio"
  | "maxDrawdown"
  | "maxDrawdownPercent"
  | "avgPnl"
  | "riskAdjustedReturn"
  | "custom";

// ==================== HYPEROPT TRIAL ====================

/**
 * Проба оптимизации
 */
export interface HyperoptTrial {
  /** ID пробы */
  id: number;
  /** Параметры пробы */
  params: Record<string, number | string | boolean>;
  
  // === Backtesting Result ===
  /** Результат бэктеста */
  backtestResult?: BacktestResult;
  /** Значение целевой функции (backtest) */
  backtestObjectiveValue?: number;
  
  // === Paper Trading Result ===
  /** Метрики Paper Trading */
  paperTradingMetrics?: PaperTradingMetrics;
  /** Кривая эквити Paper Trading */
  paperTradingEquityCurve?: PaperEquityPoint[];
  /** История сделок Paper Trading */
  paperTradingTrades?: PaperTrade[];
  /** Значение целевой функции (paper trading) */
  paperTradingObjectiveValue?: number;
  
  // === Combined (для режима BOTH) ===
  /** Комбинированное значение целевой функции */
  combinedObjectiveValue?: number;
  /** Значение целевой функции (текущий режим) */
  objectiveValue?: number;
  
  /** Статус */
  status: "PENDING" | "RUNNING" | "BACKTESTING" | "PAPER_TRADING" | "COMPLETED" | "FAILED" | "PRUNED";
  /** Ошибка */
  error?: string;
  /** Время начала */
  startedAt?: Date;
  /** Время завершения */
  completedAt?: Date;
  /** Длительность (мс) */
  duration?: number;
  
  /** Режим выполнения */
  executedMode?: "BACKTESTING" | "PAPER_TRADING" | "BOTH";
}

// ==================== HYPEROPT RESULT ====================

/**
 * Результат оптимизации
 */
export interface HyperoptResult {
  /** ID результата */
  id: string;
  /** Конфигурация */
  config: HyperoptConfig;
  
  // === Status ===
  /** Статус */
  status: "PENDING" | "RUNNING" | "BACKTESTING" | "PAPER_TRADING" | "COMPLETED" | "FAILED" | "CANCELLED";
  /** Прогресс (%) */
  progress: number;
  /** Текущий этап */
  currentPhase?: "BACKTESTING" | "PAPER_TRADING";
  
  // === Best Result ===
  /** Лучшие параметры */
  bestParams?: Record<string, number | string | boolean>;
  /** Лучший результат бэктеста */
  bestBacktestResult?: BacktestResult;
  /** Лучшие метрики Paper Trading */
  bestPaperTradingMetrics?: PaperTradingMetrics;
  /** Лучшее значение целевой функции */
  bestObjectiveValue?: number;
  /** ID лучшей пробы */
  bestTrialId?: number;
  
  // === All Trials ===
  /** Все пробы */
  trials: HyperoptTrial[];
  /** Количество завершённых проб */
  completedTrials: number;
  /** Количество неудачных проб */
  failedTrials: number;
  
  // === Statistics ===
  /** Статистика оптимизации */
  statistics: HyperoptStatistics;
  
  // === Timing ===
  /** Время начала */
  startedAt?: Date;
  /** Время завершения */
  completedAt?: Date;
  /** Общая длительность (мс) */
  duration?: number;
  
  // === History ===
  /** История значений целевой функции */
  objectiveHistory: { trialId: number; value: number; mode: "BACKTESTING" | "PAPER_TRADING" }[];
  /** История лучших значений */
  bestValueHistory: { trialId: number; value: number; mode: "BACKTESTING" | "PAPER_TRADING" }[];
}

/**
 * Статистика оптимизации
 */
export interface HyperoptStatistics {
  // === Objective ===
  /** Среднее значение */
  avgObjective: number;
  /** Стандартное отклонение */
  stdObjective: number;
  /** Минимум */
  minObjective: number;
  /** Максимум */
  maxObjective: number;
  /** Медиана */
  medianObjective: number;
  
  // === Improvement ===
  /** Улучшение относительно baseline (%) */
  improvement: number;
  /** Baseline значение (параметры по умолчанию) */
  baselineValue: number;
  
  // === Convergence ===
  /** Сходимость (последние N проб) */
  convergenceRate: number;
  /** Плато достигнуто */
  plateauReached: boolean;
  /** Количество проб без улучшения */
  trialsWithoutImprovement: number;
  
  // === Distribution ===
  /** Квантили */
  quantiles: {
    q25: number;
    q50: number;
    q75: number;
    q90: number;
    q95: number;
  };
  
  // === Parameters ===
  /** Важность параметров */
  parameterImportance?: Record<string, number>;
}

// ==================== HYPEROPT COMPARISON ====================

/**
 * Сравнение результатов оптимизации
 */
export interface HyperoptComparison {
  /** ID сравнения */
  id: string;
  /** Результаты для сравнения */
  results: HyperoptResult[];
  /** Рейтинг */
  ranking: {
    resultId: string;
    rank: number;
    score: number;
    params: Record<string, number | string | boolean>;
  }[];
  /** Лучший результат */
  bestOverall?: {
    resultId: string;
    params: Record<string, number | string | boolean>;
    metrics: BacktestMetrics;
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Создать конфигурацию по умолчанию (Backtesting)
 */
export function createDefaultHyperoptConfig(
  strategyId: string,
  symbol: string,
  parameters: HyperoptParameter[]
): HyperoptConfig {
  return {
    id: `hyperopt-${Date.now()}`,
    name: `Hyperopt ${strategyId} ${symbol}`,
    target: "STRATEGY",
    strategyId,
    strategyParameters: parameters,
    method: "TPE",
    maxEvals: 100,
    objective: "sharpeRatio",
    direction: "maximize",
    mode: "BACKTESTING",
    symbol,
    timeframe: "1h",
    startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    initialBalance: 10000,
    parallel: false,
  };
}

/**
 * Создать конфигурацию для Paper Trading оптимизации
 */
export function createPaperTradingHyperoptConfig(
  strategyId: string,
  symbol: string,
  parameters: HyperoptParameter[],
  durationMinutes: number = 1440 // 24 hours default
): HyperoptConfig {
  return {
    id: `hyperopt-paper-${Date.now()}`,
    name: `Paper Trading Hyperopt ${strategyId} ${symbol}`,
    target: "STRATEGY",
    strategyId,
    strategyParameters: parameters,
    method: "TPE",
    maxEvals: 50,
    objective: "sharpeRatio",
    direction: "maximize",
    mode: "PAPER_TRADING",
    symbol,
    timeframe: "1h",
    initialBalance: 10000,
    paperTradingDuration: durationMinutes,
    priceUpdateInterval: 1000,
    parallel: false,
  };
}

/**
 * Создать конфигурацию для прогрессивной оптимизации
 * (сначала Backtesting, потом Paper Trading)
 */
export function createProgressiveHyperoptConfig(
  strategyId: string,
  symbol: string,
  parameters: HyperoptParameter[]
): HyperoptConfig {
  return {
    id: `hyperopt-prog-${Date.now()}`,
    name: `Progressive Hyperopt ${strategyId} ${symbol}`,
    target: "STRATEGY",
    strategyId,
    strategyParameters: parameters,
    method: "TPE",
    maxEvals: 100,
    objective: "sharpeRatio",
    direction: "maximize",
    mode: "BOTH",
    symbol,
    timeframe: "1h",
    startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    initialBalance: 10000,
    progressive: true,
    topPercentForPaper: 20, // Top 20% from backtesting go to paper trading
    paperTradingDuration: 1440, // 24 hours
    parallel: false,
  };
}

/**
 * Получить метрику из результата бэктеста
 */
export function getObjectiveValue(
  result: BacktestResult,
  objective: OptimizationObjective
): number {
  const metrics = result.metrics;

  switch (objective) {
    case "totalPnl":
      return metrics.totalPnl;
    case "totalPnlPercent":
      return metrics.totalPnlPercent;
    case "winRate":
      return metrics.winRate;
    case "profitFactor":
      return metrics.profitFactor;
    case "sharpeRatio":
      return metrics.sharpeRatio;
    case "sortinoRatio":
      return metrics.sortinoRatio;
    case "calmarRatio":
      return metrics.calmarRatio;
    case "maxDrawdown":
      return -metrics.maxDrawdown; // Minimize drawdown
    case "maxDrawdownPercent":
      return -metrics.maxDrawdownPercent;
    case "avgPnl":
      return metrics.avgPnl;
    case "riskAdjustedReturn":
      return metrics.sharpeRatio * metrics.totalPnlPercent;
    default:
      return metrics.totalPnl;
  }
}

/**
 * Получить метрику из Paper Trading метрик
 */
export function getObjectiveValueFromPaperTrading(
  metrics: PaperTradingMetrics,
  objective: OptimizationObjective
): number {
  switch (objective) {
    case "totalPnl":
      return metrics.totalPnl;
    case "totalPnlPercent":
      return metrics.totalPnlPercent;
    case "winRate":
      return metrics.winRate;
    case "profitFactor":
      return metrics.profitFactor;
    case "sharpeRatio":
      return metrics.sharpeRatio;
    case "sortinoRatio":
      return metrics.sortinoRatio;
    case "calmarRatio":
      return metrics.calmarRatio;
    case "maxDrawdown":
      return -metrics.maxDrawdown; // Minimize drawdown
    case "maxDrawdownPercent":
      return -metrics.maxDrawdownPercent;
    case "avgPnl":
      return metrics.avgPnl;
    case "riskAdjustedReturn":
      return metrics.sharpeRatio * metrics.totalPnlPercent;
    default:
      return metrics.totalPnl;
  }
}

/**
 * Проверить ограничения для Backtest
 */
export function checkConstraints(
  result: BacktestResult,
  config: HyperoptConfig
): { valid: boolean; reason?: string } {
  const metrics = result.metrics;

  if (config.minTrades && metrics.totalTrades < config.minTrades) {
    return { valid: false, reason: `Not enough trades: ${metrics.totalTrades} < ${config.minTrades}` };
  }

  if (config.maxDrawdown && metrics.maxDrawdownPercent > config.maxDrawdown) {
    return { valid: false, reason: `Max drawdown exceeded: ${metrics.maxDrawdownPercent}% > ${config.maxDrawdown}%` };
  }

  if (config.minWinRate && metrics.winRate < config.minWinRate) {
    return { valid: false, reason: `Win rate too low: ${metrics.winRate}% < ${config.minWinRate}%` };
  }

  return { valid: true };
}

/**
 * Проверить ограничения для Paper Trading
 */
export function checkPaperTradingConstraints(
  metrics: PaperTradingMetrics,
  config: HyperoptConfig
): { valid: boolean; reason?: string } {
  if (config.minTrades && metrics.totalTrades < config.minTrades) {
    return { valid: false, reason: `Not enough trades: ${metrics.totalTrades} < ${config.minTrades}` };
  }

  if (config.maxDrawdown && metrics.maxDrawdownPercent > config.maxDrawdown) {
    return { valid: false, reason: `Max drawdown exceeded: ${metrics.maxDrawdownPercent}% > ${config.maxDrawdown}%` };
  }

  if (config.minWinRate && metrics.winRate < config.minWinRate) {
    return { valid: false, reason: `Win rate too low: ${metrics.winRate}% < ${config.minWinRate}%` };
  }

  return { valid: true };
}
