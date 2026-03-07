/**
 * VISION Signal Filter
 * 
 * Combines Lawrence Classifier with ML model predictions and market forecast
 * for comprehensive signal evaluation and approval.
 * 
 * Ensemble Scoring:
 * - Lawrence Classifier: 40% weight
 * - ML Model: 40% weight
 * - Forecast: 20% weight
 */

import {
  LawrenceClassifier,
  LawrenceFeatures,
  LawrenceResult,
  getLawrenceClassifier,
  TrainingSample,
  ClassifierStats,
} from '@/lib/ml/lawrence-classifier';
import { db } from '@/lib/db';

// ==================== TYPE DEFINITIONS ====================

export interface VISIONSignal {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  
  // ML Model predictions
  mlPrediction: {
    direction: 'UP' | 'DOWN' | 'NEUTRAL';
    confidence: number;
    targetPrice: number;
    stopLoss: number;
  };
  
  // Indicators
  rsi: number;
  macd: number;
  ema20: number;
  ema50: number;
  atr: number;
  volumeRatio: number;
  
  // Market forecast
  forecast: {
    direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
    confidence: number;
    upwardProb: number;
    downwardProb: number;
  };
  
  // Market context
  trend: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING';
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  correlation: { btc: number; eth: number };
  
  timestamp: Date;
}

export interface VISIONFilterConfig {
  ensembleWeights: {
    lawrence: number;   // Default: 0.4
    mlModel: number;    // Default: 0.4
    forecast: number;   // Default: 0.2
  };
  thresholds: {
    enter: number;      // Default: 0.70
    wait: number;       // Default: 0.55
  };
}

export interface VISIONFilterResult {
  approved: boolean;
  probability: number;
  confidence: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  ensembleScore: {
    lawrence: number;
    mlModel: number;
    forecast: number;
    combined: number;
  };
  reasons: string[];
  recommendedAction: 'ENTER_LONG' | 'ENTER_SHORT' | 'WAIT' | 'AVOID';
  targetPrice?: number;
  stopLoss?: number;
}

export interface VISIONFilterStats {
  totalEvaluations: number;
  approvedSignals: number;
  rejectedSignals: number;
  longSignals: number;
  shortSignals: number;
  neutralSignals: number;
  avgEnsembleScore: number;
  lawrenceStats: ClassifierStats;
  lastUpdated: number;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_VISION_FILTER_CONFIG: VISIONFilterConfig = {
  ensembleWeights: {
    lawrence: 0.4,
    mlModel: 0.4,
    forecast: 0.2,
  },
  thresholds: {
    enter: 0.70,
    wait: 0.55,
  },
};

// ==================== VISION SIGNAL FILTER CLASS ====================

export class VISIONSignalFilter {
  private config: VISIONFilterConfig;
  private classifier: LawrenceClassifier;
  private initialized: boolean = false;
  private stats: VISIONFilterStats;
  private symbol: string;

  constructor(symbol: string = 'default', config: Partial<VISIONFilterConfig> = {}) {
    this.symbol = symbol;
    this.config = { ...DEFAULT_VISION_FILTER_CONFIG, ...config };
    this.classifier = getLawrenceClassifier();
    
    this.stats = {
      totalEvaluations: 0,
      approvedSignals: 0,
      rejectedSignals: 0,
      longSignals: 0,
      shortSignals: 0,
      neutralSignals: 0,
      avgEnsembleScore: 0,
      lawrenceStats: this.classifier.getStats(),
      lastUpdated: Date.now(),
    };
  }

  /**
   * Initialize the filter by training the Lawrence classifier
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Train classifier with initial training data
    const initialSamples = await this.loadInitialTrainingData();
    
    if (initialSamples.length > 0) {
      this.classifier.trainBatch(initialSamples);
    } else {
      // Generate synthetic training data if no historical data exists
      const syntheticSamples = this.generateSyntheticTrainingData();
      this.classifier.trainBatch(syntheticSamples);
    }

    this.initialized = true;
    this.stats.lawrenceStats = this.classifier.getStats();
    this.stats.lastUpdated = Date.now();
  }

  /**
   * Evaluate a VISION signal and return filter result
   */
  async evaluate(signal: VISIONSignal): Promise<VISIONFilterResult> {
    // Ensure classifier is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    const reasons: string[] = [];

    // Step 1: Prepare Lawrence features and classify
    const lawrenceFeatures = this.prepareLawrenceFeatures(signal);
    const lawrenceResult = this.classifier.classify(lawrenceFeatures);
    const lawrenceScore = this.calculateLawrenceScore(lawrenceResult);

    // Step 2: Calculate ML model score
    const mlScore = this.calculateMLScore(signal);

    // Step 3: Calculate forecast score
    const forecastScore = this.calculateForecastScore(signal.forecast);

    // Step 4: Combine scores using ensemble weights
    const ensembleScore = this.combineScores(lawrenceScore, mlScore, forecastScore);

    // Step 5: Generate recommendation
    const result = this.generateRecommendation(ensembleScore, signal, lawrenceResult);

    // Update stats
    this.updateStats(result, ensembleScore.combined);

    return result;
  }

  /**
   * Convert VISION signal to Lawrence features
   */
  prepareLawrenceFeatures(signal: VISIONSignal): LawrenceFeatures {
    const hour = signal.timestamp.getUTCHours();
    const dayOfWeek = signal.timestamp.getUTCDay();
    const isSessionOverlap = this.isSessionOverlap(signal.timestamp);

    return {
      indicators: {
        rsi: signal.rsi,
        macd: signal.macd,
        ema20: signal.ema20,
        ema50: signal.ema50,
        atr: signal.atr,
        volumeRatio: signal.volumeRatio,
      },
      context: {
        trend: signal.trend,
        volatility: signal.volatility,
        volume: this.classifyVolume(signal.volumeRatio),
      },
      signal: {
        direction: signal.mlPrediction.direction === 'UP' ? 'LONG' : 
                   signal.mlPrediction.direction === 'DOWN' ? 'SHORT' : 'LONG',
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        entryPrice: signal.currentPrice,
      },
      time: {
        hour,
        dayOfWeek,
        isSessionOverlap,
      },
    };
  }

  /**
   * Calculate Lawrence score from classifier result
   */
  private calculateLawrenceScore(result: LawrenceResult): number {
    // Base score on probability and confidence
    let score = result.probability * result.confidence;

    // Adjust for direction certainty
    if (result.direction === 'NEUTRAL') {
      score *= 0.5; // Reduce score for neutral signals
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate ML model score (normalized to 0-1)
   */
  private calculateMLScore(signal: VISIONSignal): number {
    const { mlPrediction } = signal;

    // Base score is confidence
    let score = mlPrediction.confidence;

    // Adjust based on direction
    if (mlPrediction.direction === 'NEUTRAL') {
      score *= 0.5;
    }

    // Validate target and stop loss relationship
    const isTargetValid = mlPrediction.direction === 'UP' 
      ? mlPrediction.targetPrice > signal.currentPrice
      : mlPrediction.direction === 'DOWN'
      ? mlPrediction.targetPrice < signal.currentPrice
      : true;

    if (!isTargetValid) {
      score *= 0.7; // Penalize invalid targets
    }

    // Risk-reward ratio bonus
    const riskReward = Math.abs(mlPrediction.targetPrice - signal.currentPrice) /
                       Math.abs(signal.currentPrice - mlPrediction.stopLoss);
    
    if (riskReward >= 2) {
      score *= 1.1; // Bonus for good risk-reward
    } else if (riskReward < 1) {
      score *= 0.8; // Penalize poor risk-reward
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate forecast score
   */
  calculateForecastScore(forecast: VISIONSignal['forecast']): number {
    // Base score from confidence
    let score = forecast.confidence;

    // Adjust based on direction clarity
    const directionClarity = Math.abs(forecast.upwardProb - forecast.downwardProb);
    score = score * (0.5 + 0.5 * directionClarity);

    // Reduce score for consolidation
    if (forecast.direction === 'CONSOLIDATION') {
      score *= 0.6;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Combine individual scores into ensemble score
   */
  combineScores(
    lawrence: number,
    ml: number,
    forecast: number
  ): VISIONFilterResult['ensembleScore'] {
    const { ensembleWeights } = this.config;

    const combined = 
      lawrence * ensembleWeights.lawrence +
      ml * ensembleWeights.mlModel +
      forecast * ensembleWeights.forecast;

    return {
      lawrence,
      mlModel: ml,
      forecast,
      combined: Math.max(0, Math.min(1, combined)),
    };
  }

  /**
   * Generate final recommendation based on ensemble score
   */
  generateRecommendation(
    ensembleScore: VISIONFilterResult['ensembleScore'],
    signal: VISIONSignal,
    lawrenceResult: LawrenceResult
  ): VISIONFilterResult {
    const reasons: string[] = [];
    const { thresholds } = this.config;

    // Determine direction from ML prediction and Lawrence classifier
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    
    // Prefer Lawrence direction if confident, otherwise use ML
    if (lawrenceResult.confidence > 0.6 && lawrenceResult.direction !== 'NEUTRAL') {
      direction = lawrenceResult.direction;
      reasons.push(`Lawrence classifier direction: ${direction} (${(lawrenceResult.confidence * 100).toFixed(1)}% confidence)`);
    } else if (signal.mlPrediction.direction !== 'NEUTRAL') {
      direction = signal.mlPrediction.direction === 'UP' ? 'LONG' : 'SHORT';
      reasons.push(`ML model direction: ${direction} (${(signal.mlPrediction.confidence * 100).toFixed(1)}% confidence)`);
    } else {
      reasons.push('No clear direction from either classifier');
    }

    // Add forecast alignment check
    const forecastAligns = this.checkForecastAlignment(signal.forecast, direction);
    if (forecastAligns) {
      reasons.push('Forecast aligns with signal direction');
    } else {
      reasons.push('Warning: Forecast does not align with signal direction');
    }

    // Check session overlap
    if (this.isSessionOverlap(signal.timestamp)) {
      reasons.push('Trading during session overlap (higher liquidity)');
    }

    // Add volatility context
    reasons.push(`Market volatility: ${signal.volatility}`);

    // Determine recommended action
    let recommendedAction: VISIONFilterResult['recommendedAction'];
    let approved = false;

    if (ensembleScore.combined >= thresholds.enter) {
      if (direction === 'LONG') {
        recommendedAction = 'ENTER_LONG';
        approved = true;
        reasons.push(`Ensemble score ${(ensembleScore.combined * 100).toFixed(1)}% meets enter threshold`);
      } else if (direction === 'SHORT') {
        recommendedAction = 'ENTER_SHORT';
        approved = true;
        reasons.push(`Ensemble score ${(ensembleScore.combined * 100).toFixed(1)}% meets enter threshold`);
      } else {
        recommendedAction = 'WAIT';
        reasons.push('Ensemble score sufficient but direction unclear');
      }
    } else if (ensembleScore.combined >= thresholds.wait) {
      recommendedAction = 'WAIT';
      reasons.push(`Ensemble score ${(ensembleScore.combined * 100).toFixed(1)}% in wait zone`);
    } else {
      recommendedAction = 'AVOID';
      reasons.push(`Ensemble score ${(ensembleScore.combined * 100).toFixed(1)}% below threshold`);
    }

    // Add individual component scores
    reasons.push(
      `Lawrence: ${(ensembleScore.lawrence * 100).toFixed(1)}%`,
      `ML Model: ${(ensembleScore.mlModel * 100).toFixed(1)}%`,
      `Forecast: ${(ensembleScore.forecast * 100).toFixed(1)}%`
    );

    // Calculate overall probability and confidence
    const probability = ensembleScore.combined;
    const confidence = (ensembleScore.lawrence + ensembleScore.mlModel) / 2;

    return {
      approved,
      probability,
      confidence,
      direction,
      ensembleScore,
      reasons,
      recommendedAction,
      targetPrice: approved ? signal.mlPrediction.targetPrice : undefined,
      stopLoss: approved ? signal.mlPrediction.stopLoss : undefined,
    };
  }

  /**
   * Check if timestamp is during trading session overlap
   */
  isSessionOverlap(timestamp: Date): boolean {
    const hour = timestamp.getUTCHours();
    
    // London session: 08:00 - 17:00 UTC
    // New York session: 13:00 - 22:00 UTC
    // Tokyo session: 00:00 - 09:00 UTC
    
    // London-NY overlap: 13:00 - 17:00 UTC
    const isLondonNYOverlap = hour >= 13 && hour < 17;
    
    // Tokyo-London overlap: 08:00 - 09:00 UTC
    const isTokyoLondonOverlap = hour >= 8 && hour < 9;
    
    return isLondonNYOverlap || isTokyoLondonOverlap;
  }

  /**
   * Get filter statistics
   */
  async getStats(): Promise<VISIONFilterStats> {
    this.stats.lawrenceStats = this.classifier.getStats();
    this.stats.lastUpdated = Date.now();
    return { ...this.stats };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VISIONFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): VISIONFilterConfig {
    return { ...this.config };
  }

  /**
   * Record signal outcome for training
   */
  async recordOutcome(
    signal: VISIONSignal,
    result: VISIONFilterResult,
    outcome: 'WIN' | 'LOSS' | 'BREAKEVEN'
  ): Promise<void> {
    const label = outcome === 'WIN' ? result.direction : 
                  outcome === 'LOSS' ? (result.direction === 'LONG' ? 'SHORT' : 'LONG') : 
                  'NEUTRAL';

    const features = this.prepareLawrenceFeatures(signal);
    const featureVector = this.classifier.featuresToVector(features);
    
    const sample: TrainingSample = {
      features: this.vectorToFeatures(featureVector),
      label,
      weight: outcome === 'WIN' ? 1.2 : outcome === 'LOSS' ? 0.8 : 1.0,
      timestamp: Date.now(),
    };

    this.classifier.train(sample);
    this.stats.lawrenceStats = this.classifier.getStats();
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Classify volume ratio into category
   */
  private classifyVolume(volumeRatio: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (volumeRatio < 0.8) return 'LOW';
    if (volumeRatio > 1.2) return 'HIGH';
    return 'MEDIUM';
  }

  /**
   * Check if forecast aligns with signal direction
   */
  private checkForecastAlignment(
    forecast: VISIONSignal['forecast'],
    direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  ): boolean {
    if (direction === 'NEUTRAL') return true;
    
    if (direction === 'LONG' && forecast.direction === 'UPWARD') return true;
    if (direction === 'SHORT' && forecast.direction === 'DOWNWARD') return true;
    
    // Also check probability alignment
    if (direction === 'LONG' && forecast.upwardProb > forecast.downwardProb) return true;
    if (direction === 'SHORT' && forecast.downwardProb > forecast.upwardProb) return true;
    
    return false;
  }

  /**
   * Update internal statistics
   */
  private updateStats(result: VISIONFilterResult, combinedScore: number): void {
    this.stats.totalEvaluations++;
    
    if (result.approved) {
      this.stats.approvedSignals++;
    } else {
      this.stats.rejectedSignals++;
    }

    if (result.direction === 'LONG') {
      this.stats.longSignals++;
    } else if (result.direction === 'SHORT') {
      this.stats.shortSignals++;
    } else {
      this.stats.neutralSignals++;
    }

    // Update rolling average
    const prevAvg = this.stats.avgEnsembleScore;
    const n = this.stats.totalEvaluations;
    this.stats.avgEnsembleScore = prevAvg + (combinedScore - prevAvg) / n;

    this.stats.lastUpdated = Date.now();
  }

  /**
   * Load initial training data from database
   */
  private async loadInitialTrainingData(): Promise<TrainingSample[]> {
    try {
      // Try to load historical signals from database
      const signals = await db.signal.findMany({
        where: { symbol: this.symbol },
        orderBy: { timestamp: 'desc' },
        take: 100,
      });

      return signals.map(s => ({
        features: (s.features as Record<string, number>) || {},
        label: (s.outcome as 'LONG' | 'SHORT' | 'NEUTRAL') || 'NEUTRAL',
        weight: 1.0,
        timestamp: s.timestamp?.getTime() || Date.now(),
      }));
    } catch {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Generate synthetic training data for initial training
   */
  private generateSyntheticTrainingData(): TrainingSample[] {
    const samples: TrainingSample[] = [];
    const now = Date.now();

    // Generate diverse training samples
    for (let i = 0; i < 100; i++) {
      const trendRand = Math.random();
      const volRand = Math.random();
      const rsiRand = Math.random();

      // Determine label based on features
      let label: 'LONG' | 'SHORT' | 'NEUTRAL';
      let weight = 1.0;

      if (rsiRand < 0.3 && trendRand > 0.5) {
        label = 'LONG';
        weight = 0.8 + Math.random() * 0.4;
      } else if (rsiRand > 0.7 && trendRand < 0.5) {
        label = 'SHORT';
        weight = 0.8 + Math.random() * 0.4;
      } else {
        label = 'NEUTRAL';
        weight = 0.6;
      }

      samples.push({
        features: {
          n_rsi: rsiRand,
          n_macd: Math.random(),
          trend: trendRand,
          volatility: volRand,
          hour: Math.floor(Math.random() * 24) / 24,
          dayOfWeek: Math.floor(Math.random() * 7) / 7,
        },
        label,
        weight,
        timestamp: now - (100 - i) * 3600000, // Hourly samples
      });
    }

    return samples;
  }

  /**
   * Convert feature vector to features object
   */
  private vectorToFeatures(vector: number[]): Record<string, number> {
    const keys = [
      'n_rsi', 'n_macd', 'ema_dist', 'atr_rel', 'vol_ratio',
      'trend', 'volatility', 'volume', 'hour', 'day', 'session'
    ];
    
    const features: Record<string, number> = {};
    vector.forEach((v, i) => {
      features[keys[i] || `f${i}`] = v;
    });
    
    return features;
  }
}

// ==================== SINGLETON INSTANCES ====================

const visionFilterInstances = new Map<string, VISIONSignalFilter>();

/**
 * Get VISION Signal Filter instance (factory)
 */
export function getVISIONSignalFilter(
  symbol: string = 'default',
  config?: Partial<VISIONFilterConfig>
): VISIONSignalFilter {
  const key = symbol;
  
  if (!visionFilterInstances.has(key)) {
    visionFilterInstances.set(key, new VISIONSignalFilter(symbol, config));
  } else if (config) {
    visionFilterInstances.get(key)!.updateConfig(config);
  }
  
  return visionFilterInstances.get(key)!;
}

/**
 * Create new VISION Signal Filter instance
 */
export function createVISIONSignalFilter(
  symbol: string = 'default',
  config?: Partial<VISIONFilterConfig>
): VISIONSignalFilter {
  return new VISIONSignalFilter(symbol, config);
}

/**
 * Reset all filter instances
 */
export function resetVISIONSignalFilters(): void {
  visionFilterInstances.clear();
}

// ==================== NAMED EXPORTS ====================

const visionSignalFilterModule = {
  VISIONSignalFilter,
  getVISIONSignalFilter,
  createVISIONSignalFilter,
  resetVISIONSignalFilters,
  DEFAULT_VISION_FILTER_CONFIG,
};

export default visionSignalFilterModule;
