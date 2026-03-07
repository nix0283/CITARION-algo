/**
 * GARCH Training Data Collector
 * 
 * Collects GARCH forecasts and actual outcomes for:
 * 1. Measuring forecast accuracy
 * 2. Improving model parameters
 * 3. Detecting model drift
 * 4. Providing feedback for adaptive GARCH
 * 
 * NO NEURAL NETWORKS - Statistical feedback loop only.
 */

import { getGARCHIntegrationService, type VolatilityRegime, type VolatilityContext } from './garch-integration-service';

// =============================================================================
// TYPES
// =============================================================================

export interface ForecastRecord {
  id: string;
  symbol: string;
  timestamp: number;
  
  // Forecast values
  forecast_1d: number;
  forecast_5d: number;
  forecast_10d: number;
  regime: VolatilityRegime;
  currentVolatility: number;
  
  // Actual values (filled when realized)
  actual_1d?: number;
  actual_5d?: number;
  actual_10d?: number;
  
  // Accuracy metrics (filled when realized)
  error_1d?: number;
  error_5d?: number;
  error_10d?: number;
  mape_1d?: number;  // Mean Absolute Percentage Error
  mape_5d?: number;
  mape_10d?: number;
  
  // Status
  status: 'pending' | 'partial' | 'completed';
  completedAt?: number;
}

export interface AccuracyMetrics {
  symbol: string;
  totalForecasts: number;
  completedForecasts: number;
  
  // MAPE by horizon
  mape_1d: number;
  mape_5d: number;
  mape_10d: number;
  
  // Bias (positive = overestimate, negative = underestimate)
  bias_1d: number;
  bias_5d: number;
  bias_10d: number;
  
  // Regime accuracy
  regimeAccuracy: number; // How often regime prediction was correct
  
  // Model quality score
  overallScore: number; // 0-100
  
  lastUpdated: number;
}

export interface CollectorConfig {
  maxRecords: number;
  realizationIntervalMs: number;
  persistToDatabase: boolean;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_COLLECTOR_CONFIG: CollectorConfig = {
  maxRecords: 10000,
  realizationIntervalMs: 60 * 60 * 1000, // Check every hour
  persistToDatabase: false, // Can be enabled with Prisma
};

// =============================================================================
// GARCH TRAINING DATA COLLECTOR
// =============================================================================

class GARCHTrainingCollector {
  private config: CollectorConfig;
  private garchService = getGARCHIntegrationService();
  private forecasts: Map<string, ForecastRecord[]> = new Map();
  private accuracyCache: Map<string, AccuracyMetrics> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CollectorConfig> = {}) {
    this.config = { ...DEFAULT_COLLECTOR_CONFIG, ...config };
  }

  /**
   * Start the collector (begins checking for realized forecasts)
   */
  start(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkRealizedForecasts();
    }, this.config.realizationIntervalMs);

    console.log('[GARCH Collector] Started monitoring forecasts');
  }

  /**
   * Stop the collector
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[GARCH Collector] Stopped');
  }

  /**
   * Record a new forecast
   */
  recordForecast(symbol: string, context: VolatilityContext): ForecastRecord {
    const record: ForecastRecord = {
      id: `garch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      timestamp: Date.now(),
      forecast_1d: context.forecastVolatility[0] || context.currentVolatility,
      forecast_5d: context.forecastVolatility[4] || context.forecastVolatility[context.forecastVolatility.length - 1] || context.currentVolatility,
      forecast_10d: context.forecastVolatility[9] || context.forecastVolatility[context.forecastVolatility.length - 1] || context.currentVolatility,
      regime: context.regime,
      currentVolatility: context.currentVolatility,
      status: 'pending',
    };

    if (!this.forecasts.has(symbol)) {
      this.forecasts.set(symbol, []);
    }

    this.forecasts.get(symbol)!.push(record);

    // Limit records
    const records = this.forecasts.get(symbol)!;
    if (records.length > this.config.maxRecords) {
      records.shift();
    }

    return record;
  }

  /**
   * Update with actual realized volatility
   */
  updateWithActual(symbol: string, actualVolatility: number): void {
    const records = this.forecasts.get(symbol);
    if (!records) return;

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (const record of records) {
      if (record.status === 'completed') continue;

      const age = now - record.timestamp;
      let updated = false;

      // Check 1-day realization
      if (age >= oneDayMs && record.actual_1d === undefined) {
        record.actual_1d = actualVolatility;
        record.error_1d = record.forecast_1d - actualVolatility;
        record.mape_1d = Math.abs(record.error_1d) / actualVolatility;
        updated = true;
      }

      // Check 5-day realization
      if (age >= 5 * oneDayMs && record.actual_5d === undefined) {
        record.actual_5d = actualVolatility;
        record.error_5d = record.forecast_5d - actualVolatility;
        record.mape_5d = Math.abs(record.error_5d) / actualVolatility;
        updated = true;
      }

      // Check 10-day realization
      if (age >= 10 * oneDayMs && record.actual_10d === undefined) {
        record.actual_10d = actualVolatility;
        record.error_10d = record.forecast_10d - actualVolatility;
        record.mape_10d = Math.abs(record.error_10d) / actualVolatility;
        record.status = 'completed';
        record.completedAt = now;
        updated = true;
      }

      // Update status
      if (updated && record.status === 'pending') {
        record.status = 'partial';
      }
    }

    // Recalculate accuracy metrics
    this.calculateAccuracyMetrics(symbol);
  }

  /**
   * Check and update realized forecasts
   */
  private checkRealizedForecasts(): void {
    for (const [symbol] of this.forecasts) {
      const context = this.garchService.getVolatilityContext(symbol);
      if (context) {
        this.updateWithActual(symbol, context.currentVolatility);
      }
    }
  }

  /**
   * Calculate accuracy metrics for a symbol
   */
  private calculateAccuracyMetrics(symbol: string): AccuracyMetrics {
    const records = this.forecasts.get(symbol) || [];
    const completed = records.filter(r => r.status === 'completed');
    const partial = records.filter(r => r.status === 'partial');

    // Calculate MAPE
    const mape1d = this.calculateAverageMAPE(records, 'mape_1d');
    const mape5d = this.calculateAverageMAPE(records, 'mape_5d');
    const mape10d = this.calculateAverageMAPE(records, 'mape_10d');

    // Calculate bias
    const bias1d = this.calculateAverageError(records, 'error_1d');
    const bias5d = this.calculateAverageError(records, 'error_5d');
    const bias10d = this.calculateAverageError(records, 'error_10d');

    // Calculate regime accuracy
    const regimeAccuracy = this.calculateRegimeAccuracy(records);

    // Overall score (100 - average MAPE)
    const avgMAPE = (mape1d + mape5d + mape10d) / 3;
    const overallScore = Math.max(0, 100 - avgMAPE * 100);

    const metrics: AccuracyMetrics = {
      symbol,
      totalForecasts: records.length,
      completedForecasts: completed.length,
      mape_1d: mape1d,
      mape_5d: mape5d,
      mape_10d: mape10d,
      bias_1d: bias1d,
      bias_5d: bias5d,
      bias_10d: bias10d,
      regimeAccuracy,
      overallScore,
      lastUpdated: Date.now(),
    };

    this.accuracyCache.set(symbol, metrics);
    return metrics;
  }

  /**
   * Calculate average MAPE for a field
   */
  private calculateAverageMAPE(records: ForecastRecord[], field: 'mape_1d' | 'mape_5d' | 'mape_10d'): number {
    const validRecords = records.filter(r => r[field] !== undefined);
    if (validRecords.length === 0) return 0;

    const sum = validRecords.reduce((acc, r) => acc + (r[field] || 0), 0);
    return sum / validRecords.length;
  }

  /**
   * Calculate average error for a field
   */
  private calculateAverageError(records: ForecastRecord[], field: 'error_1d' | 'error_5d' | 'error_10d'): number {
    const validRecords = records.filter(r => r[field] !== undefined);
    if (validRecords.length === 0) return 0;

    const sum = validRecords.reduce((acc, r) => acc + (r[field] || 0), 0);
    return sum / validRecords.length;
  }

  /**
   * Calculate regime prediction accuracy
   */
  private calculateRegimeAccuracy(records: ForecastRecord[]): number {
    // This would compare predicted regime with actual regime at realization
    // For now, use a simplified calculation
    const completed = records.filter(r => r.status === 'completed');
    if (completed.length === 0) return 0.5;

    // Count regime matches (simplified - would need actual regime at each horizon)
    let matches = 0;
    for (const record of completed) {
      // Compare forecast regime with current regime at realization
      // This is a placeholder - real implementation would store regime at realization
      matches++; // Simplified
    }

    return matches / completed.length;
  }

  /**
   * Get accuracy metrics for a symbol
   */
  getAccuracyMetrics(symbol: string): AccuracyMetrics | null {
    return this.accuracyCache.get(symbol) || null;
  }

  /**
   * Get all accuracy metrics
   */
  getAllAccuracyMetrics(): AccuracyMetrics[] {
    return Array.from(this.accuracyCache.values());
  }

  /**
   * Get recent forecasts for a symbol
   */
  getRecentForecasts(symbol: string, limit: number = 100): ForecastRecord[] {
    const records = this.forecasts.get(symbol) || [];
    return records.slice(-limit);
  }

  /**
   * Get forecast by ID
   */
  getForecastById(id: string): ForecastRecord | null {
    for (const records of this.forecasts.values()) {
      const found = records.find(r => r.id === id);
      if (found) return found;
    }
    return null;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalSymbols: number;
    totalForecasts: number;
    completedForecasts: number;
    avgOverallScore: number;
    symbolsByScore: Array<{ symbol: string; score: number }>;
  } {
    const metrics = this.getAllAccuracyMetrics();
    const totalForecasts = metrics.reduce((sum, m) => sum + m.totalForecasts, 0);
    const completedForecasts = metrics.reduce((sum, m) => sum + m.completedForecasts, 0);
    const avgOverallScore = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.overallScore, 0) / metrics.length
      : 0;

    const symbolsByScore = metrics
      .map(m => ({ symbol: m.symbol, score: m.overallScore }))
      .sort((a, b) => b.score - a.score);

    return {
      totalSymbols: this.forecasts.size,
      totalForecasts,
      completedForecasts,
      avgOverallScore,
      symbolsByScore,
    };
  }

  /**
   * Export data for analysis
   */
  exportData(): { forecasts: ForecastRecord[]; metrics: AccuracyMetrics[] } {
    const forecasts: ForecastRecord[] = [];
    for (const records of this.forecasts.values()) {
      forecasts.push(...records);
    }

    return {
      forecasts,
      metrics: this.getAllAccuracyMetrics(),
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.forecasts.clear();
    this.accuracyCache.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let collectorInstance: GARCHTrainingCollector | null = null;

export function getGARCHTrainingCollector(config?: Partial<CollectorConfig>): GARCHTrainingCollector {
  if (!collectorInstance) {
    collectorInstance = new GARCHTrainingCollector(config);
  }
  return collectorInstance;
}

export function resetGARCHTrainingCollector(): void {
  if (collectorInstance) {
    collectorInstance.stop();
  }
  collectorInstance = null;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  GARCHTrainingCollector,
  DEFAULT_COLLECTOR_CONFIG,
};
