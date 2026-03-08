/**
 * ML Signal Filter Enhancement with Real Backtesting Integration
 * 
 * Enhances the ML Signal Filter with:
 * 1. Backtesting-based signal validation
 * 2. Historical performance correlation
 * 3. Win rate prediction
 * 4. Expected value calculation
 * 5. Risk-adjusted confidence scoring
 * 
 * This module connects signal filtering to actual backtesting results
 * to improve filtering accuracy over time.
 */

import { BacktestEngine, type BacktestConfig, type BacktestMetrics } from '../backtesting/engine';
import { getMLSignalFilter, type SignalForFiltering, type FilteredSignal, type MLFilterConfig } from '../ml-signal-filter';
import { getLawrenceClassifier, type TrainingSample } from '../ml/lawrence-classifier';

// ==================== TYPES ====================

export interface BacktestValidationConfig {
  /** Enable backtesting validation */
  enabled: boolean;
  
  /** Minimum backtest sample size for validation */
  minSampleSize: number;
  
  /** Lookback period for historical analysis (days) */
  lookbackDays: number;
  
  /** Win rate threshold for signal approval */
  minWinRate: number;
  
  /** Minimum expected value for approval */
  minExpectedValue: number;
  
  /** Use weighted average by recency */
  useRecencyWeighting: boolean;
  
  /** Confidence adjustment based on backtest results */
  adjustConfidenceFromBacktest: boolean;
  
  /** Store validation results for learning */
  storeValidationResults: boolean;
}

export interface SignalBacktestResult {
  /** Signal identifier */
  signalId: string;
  
  /** Whether signal was validated */
  validated: boolean;
  
  /** Historical win rate for similar signals */
  historicalWinRate: number;
  
  /** Historical profit factor */
  historicalProfitFactor: number;
  
  /** Expected value (in R multiples) */
  expectedValue: number;
  
  /** Sample size used for calculation */
  sampleSize: number;
  
  /** Confidence level of backtest data */
  dataConfidence: number;
  
  /** Similar historical trades */
  similarTrades: SimilarTrade[];
  
  /** Risk-adjusted score */
  riskAdjustedScore: number;
  
  /** Recommendation based on backtest */
  backtestRecommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'STRONG_AVOID';
}

export interface SimilarTrade {
  /** Trade entry time */
  entryTime: Date;
  
  /** Trade direction */
  direction: 'LONG' | 'SHORT';
  
  /** Entry price */
  entryPrice: number;
  
  /** Exit price */
  exitPrice: number;
  
  /** PnL in R multiples */
  pnlR: number;
  
  /** Win or loss */
  isWin: boolean;
  
  /** Similarity score to current signal */
  similarity: number;
}

export interface HistoricalPerformance {
  /** Symbol */
  symbol: string;
  
  /** Direction */
  direction: 'LONG' | 'SHORT';
  
  /** Total trades */
  totalTrades: number;
  
  /** Win count */
  wins: number;
  
  /** Loss count */
  losses: number;
  
  /** Win rate */
  winRate: number;
  
  /** Average win (R) */
  avgWinR: number;
  
  /** Average loss (R) */
  avgLossR: number;
  
  /** Expected value (R) */
  expectedValue: number;
  
  /** Profit factor */
  profitFactor: number;
  
  /** Last updated */
  lastUpdated: Date;
}

export interface ValidationRecord {
  /** Record ID */
  id: string;
  
  /** Original signal */
  signal: SignalForFiltering;
  
  /** Filtered result */
  filteredResult: FilteredSignal;
  
  /** Backtest validation result */
  backtestResult: SignalBacktestResult;
  
  /** Actual outcome (if known) */
  actualOutcome?: {
    pnl: number;
    pnlR: number;
    isWin: boolean;
    exitTime: Date;
  };
  
  /** Validation timestamp */
  timestamp: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_BACKTEST_VALIDATION_CONFIG: BacktestValidationConfig = {
  enabled: true,
  minSampleSize: 5,
  lookbackDays: 90,
  minWinRate: 0.45,
  minExpectedValue: 0.1,
  useRecencyWeighting: true,
  adjustConfidenceFromBacktest: true,
  storeValidationResults: true,
};

// ==================== ML SIGNAL FILTER ENHANCEMENT CLASS ====================

export class MLSignalFilterEnhancement {
  private config: BacktestValidationConfig;
  private historicalPerformance: Map<string, HistoricalPerformance> = new Map();
  private validationRecords: ValidationRecord[] = [];
  private backtestEngine: BacktestEngine | null = null;
  
  constructor(config: Partial<BacktestValidationConfig> = {}) {
    this.config = { ...DEFAULT_BACKTEST_VALIDATION_CONFIG, ...config };
    
    // Initialize backtest engine if needed
    if (this.config.enabled) {
      this.backtestEngine = new BacktestEngine({
        symbol: 'PLACEHOLDER',
        timeframe: '1h',
        startDate: new Date(Date.now() - this.config.lookbackDays * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        initialCapital: 10000,
        fee: 0.0004,
      });
    }
  }
  
  /**
   * Validate a signal using backtesting data
   */
  async validateSignalWithBacktest(
    signal: SignalForFiltering,
    filteredResult: FilteredSignal
  ): Promise<SignalBacktestResult> {
    if (!this.config.enabled) {
      return this.getDefaultResult(signal);
    }
    
    const key = `${signal.symbol}:${signal.direction}`;
    const performance = this.historicalPerformance.get(key);
    
    // Get similar trades
    const similarTrades = this.findSimilarTrades(signal);
    
    // Calculate metrics
    let historicalWinRate = 0.5;
    let historicalProfitFactor = 1.0;
    let expectedValue = 0;
    let sampleSize = 0;
    let dataConfidence = 0;
    
    if (performance && performance.totalTrades >= this.config.minSampleSize) {
      historicalWinRate = performance.winRate;
      historicalProfitFactor = performance.profitFactor;
      expectedValue = performance.expectedValue;
      sampleSize = performance.totalTrades;
      dataConfidence = Math.min(1, sampleSize / 30); // Max confidence at 30 samples
    } else if (similarTrades.length >= this.config.minSampleSize) {
      // Calculate from similar trades
      const result = this.calculateFromSimilarTrades(similarTrades, signal);
      historicalWinRate = result.winRate;
      historicalProfitFactor = result.profitFactor;
      expectedValue = result.expectedValue;
      sampleSize = similarTrades.length;
      dataConfidence = Math.min(1, sampleSize / 20);
    }
    
    // Calculate risk-adjusted score
    const riskAdjustedScore = this.calculateRiskAdjustedScore(
      filteredResult,
      historicalWinRate,
      expectedValue,
      dataConfidence
    );
    
    // Determine recommendation
    const backtestRecommendation = this.determineRecommendation(
      historicalWinRate,
      expectedValue,
      riskAdjustedScore
    );
    
    // Determine if validated
    const validated = 
      historicalWinRate >= this.config.minWinRate &&
      expectedValue >= this.config.minExpectedValue &&
      sampleSize >= this.config.minSampleSize;
    
    return {
      signalId: `${signal.symbol}:${signal.direction}:${Date.now()}`,
      validated,
      historicalWinRate,
      historicalProfitFactor,
      expectedValue,
      sampleSize,
      dataConfidence,
      similarTrades: similarTrades.slice(0, 10), // Top 10 most similar
      riskAdjustedScore,
      backtestRecommendation,
    };
  }
  
  /**
   * Enhance filtered signal with backtest validation
   */
  async enhanceFilteredSignal(
    signal: SignalForFiltering,
    filteredResult: FilteredSignal
  ): Promise<FilteredSignal> {
    const backtestResult = await this.validateSignalWithBacktest(signal, filteredResult);
    
    // Adjust confidence if enabled
    if (this.config.adjustConfidenceFromBacktest) {
      filteredResult.adjustedConfidence = this.adjustConfidence(
        filteredResult.adjustedConfidence,
        backtestResult
      );
    }
    
    // Update recommendation based on backtest
    if (backtestResult.backtestRecommendation === 'STRONG_AVOID' || 
        backtestResult.backtestRecommendation === 'AVOID') {
      filteredResult.recommendation = 'REJECT';
      filteredResult.passed = false;
      filteredResult.rejectionReasons.push(
        `Backtest validation failed: ${backtestResult.backtestRecommendation}`
      );
    } else if (backtestResult.backtestRecommendation === 'STRONG_BUY' &&
               filteredResult.recommendation === 'MONITOR') {
      filteredResult.recommendation = 'APPROVE';
      filteredResult.passed = true;
    }
    
    // Update quality and risk scores
    filteredResult.qualityScore = (filteredResult.qualityScore + backtestResult.dataConfidence) / 2;
    filteredResult.riskScore = Math.max(
      filteredResult.riskScore,
      1 - backtestResult.historicalWinRate
    );
    
    // Store validation record if enabled
    if (this.config.storeValidationResults) {
      this.storeValidationRecord(signal, filteredResult, backtestResult);
    }
    
    return filteredResult;
  }
  
  /**
   * Update historical performance with new trade result
   */
  updatePerformance(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    pnlR: number,
    isWin: boolean
  ): void {
    const key = `${symbol}:${direction}`;
    let performance = this.historicalPerformance.get(key);
    
    if (!performance) {
      performance = {
        symbol,
        direction,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0.5,
        avgWinR: 0,
        avgLossR: 0,
        expectedValue: 0,
        profitFactor: 1,
        lastUpdated: new Date(),
      };
    }
    
    // Update counts
    performance.totalTrades++;
    if (isWin) {
      performance.wins++;
      performance.avgWinR = ((performance.avgWinR * (performance.wins - 1)) + pnlR) / performance.wins;
    } else {
      performance.losses++;
      performance.avgLossR = ((performance.avgLossR * (performance.losses - 1)) + Math.abs(pnlR)) / performance.losses;
    }
    
    // Recalculate metrics
    performance.winRate = performance.wins / performance.totalTrades;
    performance.expectedValue = 
      (performance.winRate * performance.avgWinR) - 
      ((1 - performance.winRate) * performance.avgLossR);
    
    if (performance.avgLossR > 0) {
      performance.profitFactor = (performance.winRate * performance.avgWinR) / 
        ((1 - performance.winRate) * performance.avgLossR);
    }
    
    performance.lastUpdated = new Date();
    
    this.historicalPerformance.set(key, performance);
    
    // Use as training sample for ML
    this.updateMLFromPerformance(symbol, direction, performance);
  }
  
  /**
   * Load historical performance from backtest results
   */
  async loadFromBacktest(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    trades: Array<{ pnlR: number; isWin: boolean }>
  ): Promise<void> {
    const key = `${symbol}:${direction}`;
    
    let totalTrades = trades.length;
    let wins = 0;
    let losses = 0;
    let totalWinR = 0;
    let totalLossR = 0;
    
    for (const trade of trades) {
      if (trade.isWin) {
        wins++;
        totalWinR += trade.pnlR;
      } else {
        losses++;
        totalLossR += Math.abs(trade.pnlR);
      }
    }
    
    const winRate = wins / totalTrades;
    const avgWinR = wins > 0 ? totalWinR / wins : 0;
    const avgLossR = losses > 0 ? totalLossR / losses : 0;
    const expectedValue = (winRate * avgWinR) - ((1 - winRate) * avgLossR);
    const profitFactor = avgLossR > 0 ? (winRate * avgWinR) / ((1 - winRate) * avgLossR) : 1;
    
    const performance: HistoricalPerformance = {
      symbol,
      direction,
      totalTrades,
      wins,
      losses,
      winRate,
      avgWinR,
      avgLossR,
      expectedValue,
      profitFactor,
      lastUpdated: new Date(),
    };
    
    this.historicalPerformance.set(key, performance);
  }
  
  /**
   * Get performance for a symbol/direction
   */
  getPerformance(symbol: string, direction: 'LONG' | 'SHORT'): HistoricalPerformance | undefined {
    return this.historicalPerformance.get(`${symbol}:${direction}`);
  }
  
  /**
   * Get all performance data
   */
  getAllPerformance(): HistoricalPerformance[] {
    return Array.from(this.historicalPerformance.values());
  }
  
  /**
   * Get validation records
   */
  getValidationRecords(limit: number = 100): ValidationRecord[] {
    return this.validationRecords.slice(-limit);
  }
  
  /**
   * Record actual outcome for a validation
   */
  recordOutcome(
    signalId: string,
    pnl: number,
    pnlR: number,
    isWin: boolean
  ): void {
    const record = this.validationRecords.find(r => r.signalId === signalId);
    if (record) {
      record.actualOutcome = {
        pnl,
        pnlR,
        isWin,
        exitTime: new Date(),
      };
      
      // Update performance metrics
      this.updatePerformance(
        record.signal.symbol,
        record.signal.direction,
        pnlR,
        isWin
      );
    }
  }
  
  // ==================== PRIVATE METHODS ====================
  
  private getDefaultResult(signal: SignalForFiltering): SignalBacktestResult {
    return {
      signalId: `${signal.symbol}:${signal.direction}:${Date.now()}`,
      validated: true,
      historicalWinRate: 0.5,
      historicalProfitFactor: 1.0,
      expectedValue: 0,
      sampleSize: 0,
      dataConfidence: 0,
      similarTrades: [],
      riskAdjustedScore: 0.5,
      backtestRecommendation: 'HOLD',
    };
  }
  
  private findSimilarTrades(signal: SignalForFiltering): SimilarTrade[] {
    const similarTrades: SimilarTrade[] = [];
    
    // Look through validation records for similar trades
    for (const record of this.validationRecords) {
      if (record.actualOutcome &&
          record.signal.symbol === signal.symbol &&
          record.signal.direction === signal.direction) {
        
        const entryPrice = record.signal.entryPrice || 0;
        const exitPrice = entryPrice * (1 + record.actualOutcome.pnlR * 0.02);
        
        similarTrades.push({
          entryTime: record.timestamp,
          direction: record.signal.direction,
          entryPrice,
          exitPrice,
          pnlR: record.actualOutcome.pnlR,
          isWin: record.actualOutcome.isWin,
          similarity: this.calculateSimilarity(signal, record.signal),
        });
      }
    }
    
    // Sort by similarity (descending)
    similarTrades.sort((a, b) => b.similarity - a.similarity);
    
    return similarTrades;
  }
  
  private calculateSimilarity(signal1: SignalForFiltering, signal2: SignalForFiltering): number {
    let similarity = 0;
    let factors = 0;
    
    // Symbol match (highest weight)
    if (signal1.symbol === signal2.symbol) {
      similarity += 1;
    }
    factors++;
    
    // Direction match
    if (signal1.direction === signal2.direction) {
      similarity += 1;
    }
    factors++;
    
    // Price proximity (if available)
    if (signal1.entryPrice && signal2.entryPrice) {
      const priceDiff = Math.abs(signal1.entryPrice - signal2.entryPrice) / signal1.entryPrice;
      similarity += Math.max(0, 1 - priceDiff * 10);
      factors++;
    }
    
    // Context similarity
    if (signal1.context && signal2.context) {
      if (signal1.context.trend === signal2.context.trend) similarity += 0.5;
      if (signal1.context.volatility === signal2.context.volatility) similarity += 0.5;
      factors++;
    }
    
    return similarity / factors;
  }
  
  private calculateFromSimilarTrades(
    trades: SimilarTrade[],
    _signal: SignalForFiltering
  ): { winRate: number; profitFactor: number; expectedValue: number } {
    let wins = 0;
    let losses = 0;
    let totalWinR = 0;
    let totalLossR = 0;
    
    // Apply recency weighting if enabled
    const weights = trades.map((trade, index) => {
      if (this.config.useRecencyWeighting) {
        // More recent trades get higher weight
        return Math.pow(0.95, trades.length - index - 1);
      }
      return 1;
    });
    
    const totalWeight = weights.reduce((a, b) => a + b,0);
    
    for (let i = 0; i < trades.length; i++) {
      const weight = weights[i] / totalWeight;
      const trade = trades[i];
      
      if (trade.isWin) {
        wins += weight;
        totalWinR += trade.pnlR * weight;
      } else {
        losses += weight;
        totalLossR += Math.abs(trade.pnlR) * weight;
      }
    }
    
    const winRate = wins;
    const avgWinR = wins > 0 ? totalWinR / wins : 0;
    const avgLossR = losses > 0 ? totalLossR / losses : 0;
    const expectedValue = (winRate * avgWinR) - (losses * avgLossR);
    const profitFactor = avgLossR > 0 ? (winRate * avgWinR) / (losses * avgLossR) : 1;
    
    return { winRate, profitFactor, expectedValue };
  }
  
  private calculateRiskAdjustedScore(
    filteredResult: FilteredSignal,
    winRate: number,
    expectedValue: number,
    dataConfidence: number
  ): number {
    // Start with ML quality score
    let score = filteredResult.qualityScore;
    
    // Adjust by win rate
    score *= (0.5 + winRate * 0.5);
    
    // Adjust by expected value
    if (expectedValue > 0) {
      score *= (1 + expectedValue * 0.1);
    } else {
      score *= (1 + expectedValue * 0.2);
    }
    
    // Adjust by data confidence
    score *= dataConfidence;
    
    // Adjust by risk score (lower is better)
    score *= (1 - filteredResult.riskScore * 0.5);
    
    return Math.min(1, Math.max(0, score));
  }
  
  private determineRecommendation(
    winRate: number,
    expectedValue: number,
    riskAdjustedScore: number
  ): 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'STRONG_AVOID' {
    // Strong signals
    if (winRate >= 0.6 && expectedValue >= 0.5 && riskAdjustedScore >= 0.7) {
      return 'STRONG_BUY';
    }
    
    if (winRate >= 0.55 && expectedValue >= 0.2 && riskAdjustedScore >= 0.5) {
      return 'BUY';
    }
    
    // Weak signals
    if (winRate < 0.4 || expectedValue < -0.1 || riskAdjustedScore < 0.3) {
      return 'AVOID';
    }
    
    if (winRate < 0.35 || expectedValue < -0.3 || riskAdjustedScore < 0.2) {
      return 'STRONG_AVOID';
    }
    
    return 'HOLD';
  }
  
  private adjustConfidence(
    originalConfidence: number,
    backtestResult: SignalBacktestResult
  ): number {
    // Base adjustment on win rate vs threshold
    const winRateAdjustment = (backtestResult.historicalWinRate - 0.5) * 0.3;
    
    // Additional adjustment from expected value
    const evAdjustment = Math.min(0.2, backtestResult.expectedValue * 0.1);
    
    // Data confidence scaling
    const confidenceScale = 0.7 + (backtestResult.dataConfidence * 0.3);
    
    // Apply adjustments
    let adjusted = originalConfidence + winRateAdjustment + evAdjustment;
    adjusted *= confidenceScale;
    
    return Math.min(1, Math.max(0, adjusted));
  }
  
  private storeValidationRecord(
    signal: SignalForFiltering,
    filteredResult: FilteredSignal,
    backtestResult: SignalBacktestResult
  ): void {
    const record: ValidationRecord = {
      id: crypto.randomUUID(),
      signal,
      filteredResult,
      backtestResult,
      timestamp: new Date(),
    };
    
    this.validationRecords.push(record);
    
    // Keep only last 1000 records
    if (this.validationRecords.length > 1000) {
      this.validationRecords = this.validationRecords.slice(-1000);
    }
  }
  
  private updateMLFromPerformance(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    performance: HistoricalPerformance
  ): void {
    // Create training sample from performance data
    const classifier = getLawrenceClassifier();
    
    const sample: TrainingSample = {
      features: {
        indicators: {},
        context: {
          trend: performance.winRate > 0.55 ? 'TRENDING_UP' : 
                   performance.winRate < 0.45 ? 'TRENDING_DOWN' : 'RANGING',
          volatility: 'MEDIUM',
          volume: 'MEDIUM',
        },
        signal: {
          direction,
          symbol,
          timeframe: '1h',
          entryPrice: 0,
        },
        time: {
          hour: new Date().getUTCHours(),
          dayOfWeek: new Date().getUTCDay(),
          isSessionOverlap: false,
        },
      },
      label: direction,
      weight: performance.winRate,
      timestamp: Date.now(),
    };
    
    classifier.train(sample);
  }
  
  // ==================== CONFIG ====================
  
  getConfig(): BacktestValidationConfig {
    return { ...this.config };
  }
  
  setConfig(config: Partial<BacktestValidationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ==================== SINGLETON ====================

let enhancementInstance: MLSignalFilterEnhancement | null = null;

export function getMLSignalFilterEnhancement(
  config?: Partial<BacktestValidationConfig>
): MLSignalFilterEnhancement {
  if (!enhancementInstance) {
    enhancementInstance = new MLSignalFilterEnhancement(config);
  } else if (config) {
    enhancementInstance.setConfig(config);
  }
  return enhancementInstance;
}

export default MLSignalFilterEnhancement;
