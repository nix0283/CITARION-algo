/**
 * Walk-Forward Optimization
 * 
 * Продвинутая методология тестирования стратегий с разделением на train/test сегменты
 * для оценки устойчивости и предотвращения overfitting.
 */

import { Candle } from "../strategy/types";
import { 
  BacktestConfig, 
  BacktestResult, 
  BacktestMetrics,
  BacktestTrade,
  EquityPoint,
  createEmptyBacktestResult,
} from "./types";
import { BacktestEngine } from "./engine";

// ==================== WALK-FORWARD TYPES ====================

/**
 * Конфигурация Walk-Forward оптимизации
 */
export interface WalkForwardConfig {
  /** Период обучения (дней) */
  trainPeriod: number;
  /** Период тестирования (дней) */
  testPeriod: number;
  /** Шаг между сегментами (дней) */
  stepPeriod: number;
  /** Минимум сделок для валидности сегмента */
  minTrades: number;
  /** Оптимизировать параметры на train периоде */
  optimizeOnTrain?: boolean;
  /** Параметры для оптимизации */
  optimizationParams?: Record<string, { min: number; max: number; step: number }>;
}

/**
 * Результат отдельного сегмента
 */
export interface SegmentResult {
  /** ID сегмента */
  id: string;
  /** Номер сегмента */
  segmentNumber: number;
  
  // === Train Period ===
  /** Начало train периода */
  trainStart: Date;
  /** Конец train периода */
  trainEnd: Date;
  /** Результат бэктеста на train */
  trainResult: BacktestResult;
  /** Оптимизированные параметры */
  optimizedParams?: Record<string, number | boolean | string>;
  
  // === Test Period ===
  /** Начало test периода */
  testStart: Date;
  /** Конец test периода */
  testEnd: Date;
  /** Результат бэктеста на test */
  testResult: BacktestResult;
  
  // === Validation ===
  /** Валидность сегмента */
  isValid: boolean;
  /** Причина невалидности */
  invalidReason?: string;
  
  // === Performance Comparison ===
  /** Degradation от train к test (%) */
  performanceDegradation: number;
  /** Стабильность метрик */
  metricsStability: number;
}

/**
 * Результат Walk-Forward оптимизации
 */
export interface WalkForwardResult {
  /** ID результата */
  id: string;
  /** Конфигурация */
  config: WalkForwardConfig;
  
  // === Segments ===
  /** Все сегменты */
  segments: SegmentResult[];
  /** Количество валидных сегментов */
  validSegmentsCount: number;
  /** Количество невалидных сегментов */
  invalidSegmentsCount: number;
  
  // === Aggregated Metrics ===
  /** Агрегированные метрики (только test периоды) */
  aggregatedMetrics: BacktestMetrics;
  /** Агрегированные метрики train периодов */
  aggregatedTrainMetrics: BacktestMetrics;
  
  // === Robustness Analysis ===
  /** Оценка устойчивости (0-1) */
  robustnessScore: number;
  /** Доля прибыльных сегментов (%) */
  consistencyRatio: number;
  /** Средняя деградация производительности (%) */
  avgPerformanceDegradation: number;
  /** Стандартное отклонение доходности */
  returnStdDev: number;
  
  // === Summary ===
  /** Все сделки (test периоды) */
  allTrades: BacktestTrade[];
  /** Объединённая кривая эквити */
  combinedEquityCurve: EquityPoint[];
  
  // === Timing ===
  /** Время выполнения */
  executionTime: number;
  /** Дата создания */
  createdAt: Date;
}

// ==================== WALK-FORWARD OPTIMIZER ====================

/**
 * Класс для проведения Walk-Forward оптимизации
 */
export class WalkForwardOptimizer {
  private config: WalkForwardConfig;
  private baseBacktestConfig: BacktestConfig;
  private segments: SegmentResult[] = [];
  private startTime: number = 0;

  constructor(
    walkForwardConfig: WalkForwardConfig,
    backtestConfig: BacktestConfig
  ) {
    this.config = walkForwardConfig;
    this.baseBacktestConfig = backtestConfig;
  }

  /**
   * Запустить Walk-Forward оптимизацию
   */
  async run(
    candles: Candle[],
    onProgress?: (progress: number, segmentNumber: number) => void
  ): Promise<WalkForwardResult> {
    this.startTime = Date.now();
    this.segments = [];

    // Генерируем сегменты
    const segmentsConfig = this.generateSegments(candles);
    
    if (segmentsConfig.length === 0) {
      throw new Error("Not enough data for walk-forward analysis");
    }

    // Обрабатываем каждый сегмент
    for (let i = 0; i < segmentsConfig.length; i++) {
      const segmentCfg = segmentsConfig[i];
      
      try {
        const segmentResult = await this.processSegment(
          segmentCfg,
          candles,
          i + 1
        );
        
        this.segments.push(segmentResult);
        
        if (onProgress) {
          const progress = ((i + 1) / segmentsConfig.length) * 100;
          onProgress(progress, i + 1);
        }
      } catch (error) {
        // Добавляем невалидный сегмент
        this.segments.push({
          id: `segment-${i + 1}`,
          segmentNumber: i + 1,
          trainStart: segmentCfg.trainStart,
          trainEnd: segmentCfg.trainEnd,
          trainResult: createEmptyBacktestResult(this.baseBacktestConfig),
          testStart: segmentCfg.testStart,
          testEnd: segmentCfg.testEnd,
          testResult: createEmptyBacktestResult(this.baseBacktestConfig),
          isValid: false,
          invalidReason: error instanceof Error ? error.message : "Unknown error",
          performanceDegradation: 0,
          metricsStability: 0,
        });
      }
    }

    // Агрегируем результаты
    const aggregatedMetrics = this.aggregateResults("test");
    const aggregatedTrainMetrics = this.aggregateResults("train");
    
    // Рассчитываем метрики устойчивости
    const robustness = this.calculateRobustness();
    
    // Собираем все сделки и кривую эквити
    const allTrades = this.collectAllTrades();
    const combinedEquityCurve = this.buildCombinedEquityCurve();

    return {
      id: `wf-${Date.now()}`,
      config: this.config,
      segments: this.segments,
      validSegmentsCount: this.segments.filter(s => s.isValid).length,
      invalidSegmentsCount: this.segments.filter(s => !s.isValid).length,
      aggregatedMetrics,
      aggregatedTrainMetrics,
      robustnessScore: robustness.robustnessScore,
      consistencyRatio: robustness.consistencyRatio,
      avgPerformanceDegradation: robustness.avgDegradation,
      returnStdDev: robustness.returnStdDev,
      allTrades,
      combinedEquityCurve,
      executionTime: Date.now() - this.startTime,
      createdAt: new Date(),
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Генерация конфигурации сегментов
   */
  private generateSegments(candles: Candle[]): Array<{
    trainStart: Date;
    trainEnd: Date;
    testStart: Date;
    testEnd: Date;
    trainCandles: Candle[];
    testCandles: Candle[];
  }> {
    const segments: Array<{
      trainStart: Date;
      trainEnd: Date;
      testStart: Date;
      testEnd: Date;
      trainCandles: Candle[];
      testCandles: Candle[];
    }> = [];

    if (candles.length === 0) return segments;

    const msPerDay = 24 * 60 * 60 * 1000;
    const trainMs = this.config.trainPeriod * msPerDay;
    const testMs = this.config.testPeriod * msPerDay;
    const stepMs = this.config.stepPeriod * msPerDay;

    const startTime = candles[0].timestamp;
    const endTime = candles[candles.length - 1].timestamp;

    let currentStart = startTime;

    while (currentStart + trainMs + testMs <= endTime) {
      const trainStart = new Date(currentStart);
      const trainEnd = new Date(currentStart + trainMs);
      const testStart = new Date(currentStart + trainMs);
      const testEnd = new Date(currentStart + trainMs + testMs);

      // Находим свечи для train и test периодов
      const trainCandles = candles.filter(
        c => c.timestamp >= trainStart.getTime() && c.timestamp < trainEnd.getTime()
      );
      const testCandles = candles.filter(
        c => c.timestamp >= testStart.getTime() && c.timestamp < testEnd.getTime()
      );

      if (trainCandles.length > 0 && testCandles.length > 0) {
        segments.push({
          trainStart,
          trainEnd,
          testStart,
          testEnd,
          trainCandles,
          testCandles,
        });
      }

      currentStart += stepMs;
    }

    return segments;
  }

  /**
   * Обработка одного сегмента
   */
  private async processSegment(
    segmentCfg: {
      trainStart: Date;
      trainEnd: Date;
      testStart: Date;
      testEnd: Date;
      trainCandles: Candle[];
      testCandles: Candle[];
    },
    segmentNumber: number
  ): Promise<SegmentResult> {
    // Создаём конфигурации для train и test
    const trainConfig = this.createSegmentConfig(segmentCfg.trainStart, segmentCfg.trainEnd);
    const testConfig = this.createSegmentConfig(segmentCfg.testStart, segmentCfg.testEnd);

    // Запускаем бэктест на train периоде
    const trainEngine = new BacktestEngine(trainConfig);
    const trainResult = await trainEngine.run(segmentCfg.trainCandles);

    // Проверяем минимальное количество сделок
    const trainTrades = trainResult.trades.length;
    
    // Если включена оптимизация, выполняем её на train периоде
    let optimizedParams: Record<string, number | boolean | string> | undefined;
    if (this.config.optimizeOnTrain && trainTrades >= this.config.minTrades) {
      optimizedParams = await this.optimizeParameters(
        segmentCfg.trainCandles,
        trainConfig
      );
    }

    // Запускаем бэктест на test периоде
    const testEngine = new BacktestEngine(testConfig);
    const testResult = await testEngine.run(segmentCfg.testCandles);

    // Проверяем валидность сегмента
    const testTrades = testResult.trades.length;
    const isValid = testTrades >= this.config.minTrades;

    // Рассчитываем деградацию производительности
    const performanceDegradation = this.calculatePerformanceDegradation(
      trainResult.metrics,
      testResult.metrics
    );

    // Рассчитываем стабильность метрик
    const metricsStability = this.calculateMetricsStability(
      trainResult.metrics,
      testResult.metrics
    );

    return {
      id: `segment-${segmentNumber}`,
      segmentNumber,
      trainStart: segmentCfg.trainStart,
      trainEnd: segmentCfg.trainEnd,
      trainResult,
      optimizedParams,
      testStart: segmentCfg.testStart,
      testEnd: segmentCfg.testEnd,
      testResult,
      isValid,
      invalidReason: isValid ? undefined : `Insufficient trades: ${testTrades} < ${this.config.minTrades}`,
      performanceDegradation,
      metricsStability,
    };
  }

  /**
   * Создать конфигурацию для сегмента
   */
  private createSegmentConfig(startDate: Date, endDate: Date): BacktestConfig {
    return {
      ...this.baseBacktestConfig,
      id: `${this.baseBacktestConfig.id}-segment-${Date.now()}`,
      startDate,
      endDate,
    };
  }

  /**
   * Оптимизация параметров (заглушка для будущего расширения)
   */
  private async optimizeParameters(
    _candles: Candle[],
    _config: BacktestConfig
  ): Promise<Record<string, number | boolean | string>> {
    // Базовая реализация без оптимизации
    // В будущем можно добавить grid search или генетический алгоритм
    return { ...this.baseBacktestConfig.strategyParameters } || {};
  }

  /**
   * Агрегация результатов всех сегментов
   */
  private aggregateResults(period: "train" | "test"): BacktestMetrics {
    const validSegments = this.segments.filter(s => s.isValid);
    
    if (validSegments.length === 0) {
      return this.createEmptyMetrics();
    }

    // Собираем метрики со всех сегментов
    const allMetrics = validSegments.map(s => 
      period === "train" ? s.trainResult.metrics : s.testResult.metrics
    );

    // Агрегируем базовые метрики
    const totalTrades = allMetrics.reduce((sum, m) => sum + m.totalTrades, 0);
    const totalWinning = allMetrics.reduce((sum, m) => sum + m.winningTrades, 0);
    const totalLosing = allMetrics.reduce((sum, m) => sum + m.losingTrades, 0);
    
    // Взвешенное среднее для winRate
    const winRate = totalTrades > 0 ? (totalWinning / totalTrades) * 100 : 0;

    // Суммарный PnL
    const totalPnl = allMetrics.reduce((sum, m) => sum + m.totalPnl, 0);
    const totalPnlPercent = allMetrics.reduce((sum, m) => sum + m.totalPnlPercent, 0) / allMetrics.length;

    // Средние значения
    const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;
    
    // Взвешенные средние для win/loss
    const avgWin = totalWinning > 0 
      ? allMetrics.reduce((sum, m) => sum + m.avgWin * m.winningTrades, 0) / totalWinning 
      : 0;
    const avgLoss = totalLosing > 0 
      ? allMetrics.reduce((sum, m) => sum + m.avgLoss * m.losingTrades, 0) / totalLosing 
      : 0;

    // Максимальные значения
    const maxWin = Math.max(...allMetrics.map(m => m.maxWin), 0);
    const maxLoss = Math.min(...allMetrics.map(m => m.maxLoss), 0);

    // Profit Factor (агрегированный)
    const grossProfit = allMetrics.reduce((sum, m) => sum + m.avgWin * m.winningTrades, 0);
    const grossLoss = Math.abs(allMetrics.reduce((sum, m) => sum + m.avgLoss * m.losingTrades, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Risk/Reward
    const riskRewardRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

    // Sharpe Ratio (среднее)
    const sharpeRatio = this.calculateAverageMetric(allMetrics.map(m => m.sharpeRatio));

    // Sortino Ratio (среднее)
    const sortinoRatio = this.calculateAverageMetric(allMetrics.map(m => m.sortinoRatio));

    // Calmar Ratio (среднее)
    const calmarRatio = this.calculateAverageMetric(allMetrics.map(m => m.calmarRatio));

    // Drawdown (максимальный из всех сегментов)
    const maxDrawdown = Math.max(...allMetrics.map(m => m.maxDrawdown), 0);
    const maxDrawdownPercent = Math.max(...allMetrics.map(m => m.maxDrawdownPercent), 0);
    const avgDrawdown = this.calculateAverageMetric(allMetrics.map(m => m.avgDrawdown));
    const timeInDrawdown = this.calculateAverageMetric(allMetrics.map(m => m.timeInDrawdown));
    const maxDrawdownDuration = Math.max(...allMetrics.map(m => m.maxDrawdownDuration), 0);

    // Duration
    const avgTradeDuration = this.calculateAverageMetric(allMetrics.map(m => m.avgTradeDuration));
    const avgWinDuration = this.calculateAverageMetric(allMetrics.map(m => m.avgWinDuration));
    const avgLossDuration = this.calculateAverageMetric(allMetrics.map(m => m.avgLossDuration));

    // Streaks (агрегированные)
    const maxWinStreak = Math.max(...allMetrics.map(m => m.maxWinStreak), 0);
    const maxLossStreak = Math.max(...allMetrics.map(m => m.maxLossStreak), 0);

    // Returns
    const avgDailyReturn = this.calculateAverageMetric(allMetrics.map(m => m.avgDailyReturn));
    const avgWeeklyReturn = this.calculateAverageMetric(allMetrics.map(m => m.avgWeeklyReturn));
    const avgMonthlyReturn = this.calculateAverageMetric(allMetrics.map(m => m.avgMonthlyReturn));
    const annualizedReturn = this.calculateAverageMetric(allMetrics.map(m => m.annualizedReturn));
    const annualizedVolatility = this.calculateAverageMetric(allMetrics.map(m => m.annualizedVolatility));

    // Exposure
    const marketExposure = this.calculateAverageMetric(allMetrics.map(m => m.marketExposure));
    const avgPositionSize = this.calculateAverageMetric(allMetrics.map(m => m.avgPositionSize));
    const avgLeverage = this.calculateAverageMetric(allMetrics.map(m => m.avgLeverage));

    // Risk
    const var95 = this.calculateAverageMetric(allMetrics.map(m => m.var95));
    const expectedShortfall95 = this.calculateAverageMetric(allMetrics.map(m => m.expectedShortfall95));

    return {
      totalTrades,
      winningTrades: totalWinning,
      losingTrades: totalLosing,
      winRate,
      totalPnl,
      totalPnlPercent,
      avgPnl,
      avgWin,
      avgLoss,
      maxWin,
      maxLoss,
      profitFactor,
      riskRewardRatio,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxDrawdown,
      maxDrawdownPercent,
      avgDrawdown,
      timeInDrawdown,
      maxDrawdownDuration,
      avgTradeDuration,
      avgWinDuration,
      avgLossDuration,
      maxWinStreak,
      maxLossStreak,
      currentStreak: { type: "NONE", count: 0 },
      avgDailyReturn,
      avgWeeklyReturn,
      avgMonthlyReturn,
      annualizedReturn,
      annualizedVolatility,
      marketExposure,
      avgPositionSize,
      avgLeverage,
      var95,
      expectedShortfall95,
    };
  }

  /**
   * Расчёт оценки устойчивости стратегии
   */
  private calculateRobustness(): {
    robustnessScore: number;
    consistencyRatio: number;
    avgDegradation: number;
    returnStdDev: number;
  } {
    const validSegments = this.segments.filter(s => s.isValid);
    
    if (validSegments.length === 0) {
      return {
        robustnessScore: 0,
        consistencyRatio: 0,
        avgDegradation: 100,
        returnStdDev: 0,
      };
    }

    // 1. Consistency Ratio - доля прибыльных сегментов
    const profitableSegments = validSegments.filter(
      s => s.testResult.metrics.totalPnl > 0
    );
    const consistencyRatio = (profitableSegments.length / validSegments.length) * 100;

    // 2. Средняя деградация производительности
    const avgDegradation = validSegments.reduce((sum, s) => sum + s.performanceDegradation, 0) / validSegments.length;

    // 3. Стандартное отклонение доходности
    const returns = validSegments.map(s => s.testResult.metrics.totalPnlPercent);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const returnStdDev = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0;

    // 4. Оценка устойчивости (0-1)
    // Формула: взвешенное сочетание consistency, degradation и std dev
    const consistencyScore = consistencyRatio / 100; // 0-1
    const degradationScore = Math.max(0, 1 - (avgDegradation / 100)); // 0-1 (100% degradation = 0)
    const stabilityScore = Math.max(0, 1 - Math.min(returnStdDev / 50, 1)); // 0-1 (50% std = 0)

    // Взвешенный итог
    const robustnessScore = 
      consistencyScore * 0.4 + 
      degradationScore * 0.35 + 
      stabilityScore * 0.25;

    return {
      robustnessScore: Math.min(1, Math.max(0, robustnessScore)),
      consistencyRatio,
      avgDegradation,
      returnStdDev,
    };
  }

  /**
   * Расчёт деградации производительности
   */
  private calculatePerformanceDegradation(
    trainMetrics: BacktestMetrics,
    testMetrics: BacktestMetrics
  ): number {
    // Если train убыточен, деградация = 0
    if (trainMetrics.totalPnlPercent <= 0) {
      return testMetrics.totalPnlPercent >= 0 ? 0 : 100;
    }

    // Если test прибыльнее train, деградация = 0
    if (testMetrics.totalPnlPercent >= trainMetrics.totalPnlPercent) {
      return 0;
    }

    // Рассчитываем процент деградации
    const degradation = ((trainMetrics.totalPnlPercent - testMetrics.totalPnlPercent) / trainMetrics.totalPnlPercent) * 100;
    
    return Math.max(0, Math.min(100, degradation));
  }

  /**
   * Расчёт стабильности метрик (0-1)
   */
  private calculateMetricsStability(
    trainMetrics: BacktestMetrics,
    testMetrics: BacktestMetrics
  ): number {
    // Сравниваем ключевые метрики
    const winRateDiff = Math.abs(trainMetrics.winRate - testMetrics.winRate) / 100;
    const profitFactorDiff = trainMetrics.profitFactor > 0
      ? Math.abs(trainMetrics.profitFactor - testMetrics.profitFactor) / trainMetrics.profitFactor
      : 1;
    const sharpeDiff = trainMetrics.sharpeRatio !== 0
      ? Math.abs(trainMetrics.sharpeRatio - testMetrics.sharpeRatio) / Math.abs(trainMetrics.sharpeRatio)
      : 1;

    // Взвешенная стабильность
    const stability = 1 - (winRateDiff * 0.4 + profitFactorDiff * 0.35 + sharpeDiff * 0.25);
    
    return Math.max(0, Math.min(1, stability));
  }

  /**
   * Сбор всех сделок из test периодов
   */
  private collectAllTrades(): BacktestTrade[] {
    const allTrades: BacktestTrade[] = [];
    
    for (const segment of this.segments) {
      if (segment.isValid) {
        allTrades.push(...segment.testResult.trades);
      }
    }

    // Сортируем по времени
    return allTrades.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  }

  /**
   * Построение объединённой кривой эквити
   */
  private buildCombinedEquityCurve(): EquityPoint[] {
    const validSegments = this.segments.filter(s => s.isValid);
    
    if (validSegments.length === 0) {
      return [];
    }

    const combinedCurve: EquityPoint[] = [];
    let cumulativePnl = 0;
    let globalIndex = 0;

    for (const segment of validSegments) {
      const segmentCurve = segment.testResult.equityCurve;
      
      for (const point of segmentCurve) {
        combinedCurve.push({
          ...point,
          candleIndex: globalIndex++,
          cumulativePnl: cumulativePnl + point.cumulativePnl,
        });
      }
      
      // Обновляем кумулятивный PnL для следующего сегмента
      if (segmentCurve.length > 0) {
        cumulativePnl += segmentCurve[segmentCurve.length - 1].cumulativePnl;
      }
    }

    return combinedCurve;
  }

  /**
   * Вычисление среднего значения метрики
   */
  private calculateAverageMetric(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Создание пустых метрик
   */
  private createEmptyMetrics(): BacktestMetrics {
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
    };
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Создать конфигурацию Walk-Forward по умолчанию
 */
export function createDefaultWalkForwardConfig(): WalkForwardConfig {
  return {
    trainPeriod: 90,   // 90 дней обучения
    testPeriod: 30,    // 30 дней тестирования
    stepPeriod: 30,    // шаг 30 дней
    minTrades: 10,     // минимум 10 сделок
    optimizeOnTrain: false,
  };
}

/**
 * Интерпретация оценки устойчивости
 */
export function interpretRobustnessScore(score: number): {
  rating: string;
  description: string;
  color: string;
} {
  if (score >= 0.8) {
    return {
      rating: "Excellent",
      description: "Стратегия показывает высокую устойчивость на out-of-sample данных",
      color: "green",
    };
  } else if (score >= 0.6) {
    return {
      rating: "Good",
      description: "Стратегия демонстрирует хорошую стабильность результатов",
      color: "blue",
    };
  } else if (score >= 0.4) {
    return {
      rating: "Moderate",
      description: "Умеренная устойчивость, возможен overfitting",
      color: "yellow",
    };
  } else if (score >= 0.2) {
    return {
      rating: "Weak",
      description: "Низкая устойчивость, высокий риск переобучения",
      color: "orange",
    };
  } else {
    return {
      rating: "Poor",
      description: "Стратегия не прошла валидацию, не рекомендуется к использованию",
      color: "red",
    };
  }
}
