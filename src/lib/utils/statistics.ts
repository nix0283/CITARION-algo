/**
 * CITARION Statistics Utilities
 * 
 * Статистические функции для анализа торговых данных.
 * Все функции чистые (pure) и не имеют побочных эффектов.
 * 
 * @created 2025-01 - Stage 3 Code Audit Fix
 */

// =============================================================================
// BASIC STATISTICS
// =============================================================================

/**
 * Вычислить среднее значение
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Вычислить медиану
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Вычислить моду (самое частое значение)
 */
export function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  
  const counts = new Map<number, number>();
  let maxCount = 0;
  let modeValue: number | null = null;
  
  for (const value of values) {
    const count = (counts.get(value) || 0) + 1;
    counts.set(value, count);
    
    if (count > maxCount) {
      maxCount = count;
      modeValue = value;
    }
  }
  
  return modeValue;
}

/**
 * Вычислить дисперсию (variance)
 * @param population Если true, вычисляет популяционную дисперсию (делит на N)
 *                   Если false, вычисляет выборочную дисперсию (делит на N-1)
 */
export function variance(values: number[], population: boolean = false): number {
  if (values.length === 0) return 0;
  if (values.length === 1 && !population) return 0;
  
  const avg = mean(values);
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
  const sum = squaredDiffs.reduce((s, v) => s + v, 0);
  
  return population ? sum / values.length : sum / (values.length - 1);
}

/**
 * Вычислить стандартное отклонение
 */
export function standardDeviation(values: number[], population: boolean = false): number {
  return Math.sqrt(variance(values, population));
}

/**
 * Вычислить стандартную ошибку среднего
 */
export function standardError(values: number[]): number {
  if (values.length === 0) return 0;
  return standardDeviation(values) / Math.sqrt(values.length);
}

/**
 * Вычислить коэффициент вариации (CV)
 */
export function coefficientOfVariation(values: number[]): number {
  const avg = mean(values);
  if (avg === 0) return 0;
  return (standardDeviation(values) / Math.abs(avg)) * 100;
}

/**
 * Вычислить размах (range)
 */
export function range(values: number[]): { min: number; max: number; range: number } {
  if (values.length === 0) {
    return { min: 0, max: 0, range: 0 };
  }
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  return { min, max, range: max - min };
}

/**
 * Вычислить интерквартильный размах (IQR)
 */
export function interquartileRange(values: number[]): { q1: number; q3: number; iqr: number } {
  if (values.length === 0) {
    return { q1: 0, q3: 0, iqr: 0 };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  
  return { q1, q3, iqr: q3 - q1 };
}

/**
 * Вычислить перцентиль
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (p < 0 || p > 100) throw new Error('Percentile must be between 0 and 100');
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  
  if (Number.isInteger(index)) {
    return sorted[index];
  }
  
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Вычислить асимметрию (skewness)
 */
export function skewness(values: number[]): number {
  if (values.length < 3) return 0;
  
  const n = values.length;
  const avg = mean(values);
  const std = standardDeviation(values, true);
  
  if (std === 0) return 0;
  
  const cubedDiffs = values.map(v => Math.pow((v - avg) / std, 3));
  const sum = cubedDiffs.reduce((s, v) => s + v, 0);
  
  return (n / ((n - 1) * (n - 2))) * sum;
}

/**
 * Вычислить эксцесс (kurtosis)
 */
export function kurtosis(values: number[]): number {
  if (values.length < 4) return 0;
  
  const n = values.length;
  const avg = mean(values);
  const std = standardDeviation(values, true);
  
  if (std === 0) return 0;
  
  const fourthPowers = values.map(v => Math.pow((v - avg) / std, 4));
  const sum = fourthPowers.reduce((s, v) => s + v, 0);
  
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
}

// =============================================================================
// TRADING-SPECIFIC STATISTICS
// =============================================================================

/**
 * Рассчитать Win Rate
 */
export function winRate(trades: { pnl: number }[]): number {
  if (trades.length === 0) return 0;
  
  const wins = trades.filter(t => t.pnl > 0).length;
  return (wins / trades.length) * 100;
}

/**
 * Рассчитать Profit Factor
 */
export function profitFactor(trades: { pnl: number }[]): number {
  if (trades.length === 0) return 0;
  
  const grossProfit = trades
    .filter(t => t.pnl > 0)
    .reduce((sum, t) => sum + t.pnl, 0);
  
  const grossLoss = Math.abs(
    trades
      .filter(t => t.pnl < 0)
      .reduce((sum, t) => sum + t.pnl, 0)
  );
  
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

/**
 * Рассчитать Sharpe Ratio
 * @param returns Массив доходностей (в процентах или абсолютных значениях)
 * @param riskFreeRate Безрисковая ставка (годовая, в процентах)
 * @param periodsPerYear Количество периодов в году (252 для дней, 52 для недель, 12 для месяцев)
 */
export function sharpeRatio(
  returns: number[],
  riskFreeRate: number = 0,
  periodsPerYear: number = 252
): number {
  if (returns.length < 2) return 0;
  
  const avgReturn = mean(returns);
  const stdReturn = standardDeviation(returns);
  
  if (stdReturn === 0) return 0;
  
  // Аннуализируем безрисковую ставку
  const periodRiskFreeRate = riskFreeRate / periodsPerYear;
  
  // Sharpe = (R_p - R_f) / sigma_p
  return (avgReturn - periodRiskFreeRate) / stdReturn;
}

/**
 * Рассчитать Sortino Ratio
 * Учитывает только отрицательную волатильность
 */
export function sortinoRatio(
  returns: number[],
  riskFreeRate: number = 0,
  periodsPerYear: number = 252
): number {
  if (returns.length < 2) return 0;
  
  const avgReturn = mean(returns);
  const periodRiskFreeRate = riskFreeRate / periodsPerYear;
  
  // Вычисляем downside deviation
  const negativeReturns = returns.filter(r => r < periodRiskFreeRate);
  if (negativeReturns.length === 0) return avgReturn > periodRiskFreeRate ? Infinity : 0;
  
  const squaredDownside = negativeReturns.map(r => Math.pow(r - periodRiskFreeRate, 2));
  const downsideDeviation = Math.sqrt(squaredDownside.reduce((s, v) => s + v, 0) / returns.length);
  
  if (downsideDeviation === 0) return 0;
  
  return (avgReturn - periodRiskFreeRate) / downsideDeviation;
}

/**
 * Рассчитать Calmar Ratio
 * Отношение годовой доходности к максимальной просадке
 */
export function calmarRatio(
  annualizedReturn: number,
  maxDrawdownPercent: number
): number {
  if (maxDrawdownPercent === 0) return annualizedReturn > 0 ? Infinity : 0;
  return annualizedReturn / Math.abs(maxDrawdownPercent);
}

/**
 * Рассчитать Maximum Drawdown
 */
export function maxDrawdown(equityCurve: number[]): {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  peakIndex: number;
  troughIndex: number;
} {
  if (equityCurve.length < 2) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0, peakIndex: 0, troughIndex: 0 };
  }
  
  let peak = equityCurve[0];
  let peakIndex = 0;
  let maxDD = 0;
  let maxDDPercent = 0;
  let maxDDPeakIndex = 0;
  let maxDDTroughIndex = 0;
  
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) {
      peak = equityCurve[i];
      peakIndex = i;
    }
    
    const dd = peak - equityCurve[i];
    const ddPercent = peak > 0 ? (dd / peak) * 100 : 0;
    
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPercent = ddPercent;
      maxDDPeakIndex = peakIndex;
      maxDDTroughIndex = i;
    }
  }
  
  return {
    maxDrawdown: maxDD,
    maxDrawdownPercent: maxDDPercent,
    peakIndex: maxDDPeakIndex,
    troughIndex: maxDDTroughIndex,
  };
}

/**
 * Рассчитать Average Drawdown
 */
export function averageDrawdown(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;
  
  let peak = equityCurve[0];
  let totalDD = 0;
  let ddCount = 0;
  
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) {
      peak = equityCurve[i];
    } else if (peak > 0) {
      totalDD += (peak - equityCurve[i]) / peak;
      ddCount++;
    }
  }
  
  return ddCount > 0 ? (totalDD / ddCount) * 100 : 0;
}

/**
 * Рассчитать Recovery Factor
 */
export function recoveryFactor(totalPnl: number, maxDrawdown: number): number {
  if (maxDrawdown === 0) return totalPnl > 0 ? Infinity : 0;
  return totalPnl / Math.abs(maxDrawdown);
}

/**
 * Рассчитать Risk/Reward Ratio
 */
export function riskRewardRatio(
  avgWin: number,
  avgLoss: number
): number {
  if (avgLoss === 0) return avgWin > 0 ? Infinity : 0;
  return Math.abs(avgWin / avgLoss);
}

// =============================================================================
// CORRELATION AND COVARIANCE
// =============================================================================

/**
 * Вычислить ковариацию
 */
export function covariance(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  
  const meanX = mean(x);
  const meanY = mean(y);
  
  const sum = x.reduce((acc, xi, i) => acc + (xi - meanX) * (y[i] - meanY), 0);
  
  return sum / (x.length - 1);
}

/**
 * Вычислить корреляцию Пирсона
 */
export function correlation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  
  const stdX = standardDeviation(x);
  const stdY = standardDeviation(y);
  
  if (stdX === 0 || stdY === 0) return 0;
  
  return covariance(x, y) / (stdX * stdY);
}

/**
 * Вычислить корреляционную матрицу
 */
export function correlationMatrix(data: number[][]): number[][] {
  const n = data.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (i < j) {
        matrix[i][j] = correlation(data[i], data[j]);
        matrix[j][i] = matrix[i][j];
      }
    }
  }
  
  return matrix;
}

// =============================================================================
// MOVING STATISTICS
// =============================================================================

/**
 * Простое скользящее среднее (SMA)
 */
export function simpleMovingAverage(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  
  const result: number[] = [];
  
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(mean(slice));
  }
  
  return result;
}

/**
 * Экспоненциальное скользящее среднее (EMA)
 */
export function exponentialMovingAverage(values: number[], period: number): number[] {
  if (period <= 0 || values.length === 0) return [];
  
  const multiplier = 2 / (period + 1);
  const result: number[] = [values[0]];
  
  for (let i = 1; i < values.length; i++) {
    const ema = (values[i] * multiplier) + (result[i - 1] * (1 - multiplier));
    result.push(ema);
  }
  
  return result;
}

/**
 * Скользящее стандартное отклонение
 */
export function rollingStandardDeviation(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  
  const result: number[] = [];
  
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(standardDeviation(slice));
  }
  
  return result;
}

/**
 * Скользящий максимум
 */
export function rollingMax(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  
  const result: number[] = [];
  
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(Math.max(...slice));
  }
  
  return result;
}

/**
 * Скользящий минимум
 */
export function rollingMin(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  
  const result: number[] = [];
  
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(Math.min(...slice));
  }
  
  return result;
}

// =============================================================================
// DISTRIBUTION FUNCTIONS
// =============================================================================

/**
 * Z-score (стандартизированное значение)
 */
export function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

/**
 * Нормализация данных (Min-Max scaling)
 */
export function normalize(values: number[], newMin: number = 0, newMax: number = 1): number[] {
  const { min, max } = range(values);
  if (max === min) return values.map(() => (newMin + newMax) / 2);
  
  return values.map(v => newMin + ((v - min) / (max - min)) * (newMax - newMin));
}

/**
 * Стандартизация данных (Z-score normalization)
 */
export function standardize(values: number[]): number[] {
  const avg = mean(values);
  const std = standardDeviation(values);
  
  if (std === 0) return values.map(() => 0);
  
  return values.map(v => (v - avg) / std);
}

// =============================================================================
// REGRESSION
// =============================================================================

/**
 * Результат линейной регрессии
 */
export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  predictions: number[];
}

/**
 * Простая линейная регрессия
 */
export function linearRegression(x: number[], y: number[]): LinearRegressionResult {
  if (x.length !== y.length || x.length < 2) {
    return { slope: 0, intercept: 0, rSquared: 0, predictions: [] };
  }
  
  const n = x.length;
  const meanX = mean(x);
  const meanY = mean(y);
  
  let sumXY = 0;
  let sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumXY += (x[i] - meanX) * (y[i] - meanY);
    sumX2 += Math.pow(x[i] - meanX, 2);
  }
  
  const slope = sumX2 > 0 ? sumXY / sumX2 : 0;
  const intercept = meanY - slope * meanX;
  
  // Вычисляем R²
  const predictions = x.map(xi => slope * xi + intercept);
  const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - predictions[i], 2), 0);
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  
  return { slope, intercept, rSquared, predictions };
}

/**
 * Ранговая корреляция Спирмена
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  
  const rankX = getRanks(x);
  const rankY = getRanks(y);
  
  return correlation(rankX, rankY);
}

/**
 * Получить ранги значений
 */
function getRanks(values: number[]): number[] {
  const sorted = [...values].map((v, i) => ({ value: v, index: i }));
  sorted.sort((a, b) => a.value - b.value);
  
  const ranks = new Array(values.length);
  
  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i].index] = i + 1;
  }
  
  return ranks;
}

// =============================================================================
// HYPOTHESIS TESTING
// =============================================================================

/**
 * T-статистика для одного образца
 */
export function tStatistic(sample: number[], populationMean: number): number {
  const sampleMean = mean(sample);
  const sampleStd = standardDeviation(sample);
  const n = sample.length;
  
  if (sampleStd === 0 || n === 0) return 0;
  
  return (sampleMean - populationMean) / (sampleStd / Math.sqrt(n));
}

/**
 * Вычислить VaR (Value at Risk)
 * @param returns Массив доходностей
 * @param confidence Уровень доверия (например, 0.95 для 95%)
 */
export function valueAtRisk(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  
  return -sorted[index];
}

/**
 * Expected Shortfall (Conditional VaR)
 */
export function expectedShortfall(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const tailIndex = Math.floor((1 - confidence) * sorted.length);
  const tailReturns = sorted.slice(0, Math.max(1, tailIndex));
  
  return -mean(tailReturns);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Создать гистограмму
 */
export function histogram(values: number[], bins: number): { binStart: number; binEnd: number; count: number; frequency: number }[] {
  if (values.length === 0 || bins <= 0) return [];
  
  const { min, max } = range(values);
  const binWidth = (max - min) / bins;
  
  if (binWidth === 0) {
    return [{ binStart: min, binEnd: max, count: values.length, frequency: 1 }];
  }
  
  const result: { binStart: number; binEnd: number; count: number; frequency: number }[] = [];
  
  for (let i = 0; i < bins; i++) {
    const binStart = min + i * binWidth;
    const binEnd = min + (i + 1) * binWidth;
    const count = values.filter(v => 
      (i === bins - 1 ? v >= binStart && v <= binEnd : v >= binStart && v < binEnd)
    ).length;
    
    result.push({
      binStart,
      binEnd,
      count,
      frequency: count / values.length,
    });
  }
  
  return result;
}

/**
 * Сумма
 */
export function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

/**
 * Произведение
 */
export function product(values: number[]): number {
  return values.reduce((p, v) => p * v, 1);
}

/**
 * Количество уникальных значений
 */
export function uniqueCount(values: number[]): number {
  return new Set(values).size;
}

/**
 * Проверка на нормальность (тест на асимметрию и эксцесс)
 * Упрощённая версия
 */
export function isNormalDistribution(values: number[], alpha: number = 0.05): boolean {
  if (values.length < 20) return false; // Нужно достаточно данных
  
  const skew = skewness(values);
  const kurt = kurtosis(values);
  const n = values.length;
  
  // Критические значения для больших выборок
  const zCritical = 1.96; // для alpha = 0.05
  
  // Z-score для асимметрии
  const seSkew = Math.sqrt(6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3)));
  const zSkew = Math.abs(skew / seSkew);
  
  // Z-score для эксцесса
  const seKurt = 2 * seSkew * Math.sqrt((n * n - 1) / ((n - 3) * (n + 5)));
  const zKurt = Math.abs(kurt / seKurt);
  
  return zSkew < zCritical && zKurt < zCritical;
}

// =============================================================================
// COMPREHENSIVE METRICS CALCULATION
// =============================================================================

/**
 * Полные метрики торговли из списка сделок
 */
export interface TradeMetrics {
  // Basic
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  // PnL
  totalPnl: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  maxWin: number;
  maxLoss: number;
  
  // Ratios
  profitFactor: number;
  riskRewardRatio: number;
  
  // Risk
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  // Advanced
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  recoveryFactor: number;
}

/**
 * Вычислить полные метрики торговли
 */
export function calculateTradeMetrics(
  trades: { pnl: number }[],
  equityCurve?: number[],
  riskFreeRate: number = 0
): TradeMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      avgPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      maxWin: 0,
      maxLoss: 0,
      profitFactor: 0,
      riskRewardRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      recoveryFactor: 0,
    };
  }
  
  const pnls = trades.map(t => t.pnl);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);
  
  const totalPnl = sum(pnls);
  const avgPnl = mean(pnls);
  const avgWin = wins.length > 0 ? mean(wins) : 0;
  const avgLoss = losses.length > 0 ? Math.abs(mean(losses)) : 0;
  
  // Drawdown calculation
  let dd = { maxDrawdown: 0, maxDrawdownPercent: 0 };
  if (equityCurve && equityCurve.length > 1) {
    dd = maxDrawdown(equityCurve);
  }
  
  // Sharpe and Sortino from returns
  const sharpe = sharpeRatio(pnls, riskFreeRate);
  const sortino = sortinoRatio(pnls, riskFreeRate);
  
  // Annualized return (assuming daily returns)
  const annualizedReturn = avgPnl * 252;
  const calmar = calmarRatio(annualizedReturn, dd.maxDrawdownPercent);
  
  return {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: winRate(trades),
    totalPnl,
    avgPnl,
    avgWin,
    avgLoss,
    maxWin: wins.length > 0 ? Math.max(...wins) : 0,
    maxLoss: losses.length > 0 ? Math.min(...losses) : 0,
    profitFactor: profitFactor(trades),
    riskRewardRatio: riskRewardRatio(avgWin, avgLoss),
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownPercent: dd.maxDrawdownPercent,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    recoveryFactor: recoveryFactor(totalPnl, dd.maxDrawdown),
  };
}
