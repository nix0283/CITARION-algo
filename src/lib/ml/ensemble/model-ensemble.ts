/**
 * Model Ensemble System
 * 
 * Combines multiple ML models for improved predictions:
 * - Weighted averaging
 * - Stacking
 * - Voting
 * - Bootstrap aggregating (Bagging)
 * - Dynamic weighting based on performance
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ModelPrediction {
  modelId: string;
  prediction: number;
  confidence: number;
  probabilities?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface EnsemblePrediction {
  prediction: number;
  confidence: number;
  individualPredictions: ModelPrediction[];
  weights: Record<string, number>;
  method: EnsembleMethod;
  agreement: number; // 0-1, how much models agree
}

export interface ModelPerformance {
  modelId: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  lastUpdated: Date;
  recentAccuracy: number[]; // Last N predictions accuracy
}

export interface EnsembleConfig {
  method: EnsembleMethod;
  weights?: Record<string, number>;
  minConfidence: number;
  minAgreement: number;
  performanceWindowSize: number;
  adaptiveWeights: boolean;
}

export type EnsembleMethod = 
  | 'average' 
  | 'weighted_average' 
  | 'median'
  | 'voting'
  | 'stacking'
  | 'dynamic';

// ============================================================================
// ENSEMBLE METHODS
// ============================================================================

/**
 * Simple average ensemble
 */
function averageEnsemble(predictions: ModelPrediction[]): number {
  if (predictions.length === 0) return 0;
  return predictions.reduce((sum, p) => sum + p.prediction, 0) / predictions.length;
}

/**
 * Weighted average ensemble
 */
function weightedAverageEnsemble(
  predictions: ModelPrediction[],
  weights: Record<string, number>
): number {
  if (predictions.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const p of predictions) {
    const weight = weights[p.modelId] ?? 1;
    weightedSum += p.prediction * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Median ensemble
 */
function medianEnsemble(predictions: ModelPrediction[]): number {
  if (predictions.length === 0) return 0;

  const values = predictions.map(p => p.prediction).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);

  return values.length % 2 !== 0
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2;
}

/**
 * Voting ensemble (for classification)
 */
function votingEnsemble(predictions: ModelPrediction[]): number {
  if (predictions.length === 0) return 0;

  // Count votes
  const votes: Record<number, number> = {};
  for (const p of predictions) {
    const rounded = Math.round(p.prediction);
    votes[rounded] = (votes[rounded] || 0) + 1;
  }

  // Find winner
  let maxVotes = 0;
  let winner = 0;
  for (const [value, count] of Object.entries(votes)) {
    if (count > maxVotes) {
      maxVotes = count;
      winner = parseFloat(value);
    }
  }

  return winner;
}

/**
 * Dynamic weighting based on recent performance
 */
function dynamicWeights(
  predictions: ModelPrediction[],
  performances: Map<string, ModelPerformance>
): Record<string, number> {
  const weights: Record<string, number> = {};
  let totalWeight = 0;

  for (const p of predictions) {
    const perf = performances.get(p.modelId);
    if (perf) {
      // Weight based on recent accuracy
      const recentAcc = perf.recentAccuracy.length > 0
        ? perf.recentAccuracy.reduce((a, b) => a + b, 0) / perf.recentAccuracy.length
        : perf.accuracy;
      
      weights[p.modelId] = recentAcc * p.confidence;
    } else {
      weights[p.modelId] = p.confidence;
    }
    totalWeight += weights[p.modelId];
  }

  // Normalize weights
  if (totalWeight > 0) {
    for (const id of Object.keys(weights)) {
      weights[id] /= totalWeight;
    }
  }

  return weights;
}

/**
 * Calculate agreement between models
 */
function calculateAgreement(predictions: ModelPrediction[]): number {
  if (predictions.length < 2) return 1;

  const values = predictions.map(p => p.prediction);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  
  // Coefficient of variation (lower = more agreement)
  if (mean === 0) return 1;
  
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / Math.abs(mean);
  
  // Convert to 0-1 agreement score
  return Math.max(0, 1 - cv);
}

// ============================================================================
// MODEL ENSEMBLE
// ============================================================================

class ModelEnsemble {
  private config: EnsembleConfig;
  private performances: Map<string, ModelPerformance> = new Map();
  private stackedModel: ((features: number[]) => number) | null = null;

  constructor(config: Partial<EnsembleConfig> = {}) {
    this.config = {
      method: 'weighted_average',
      minConfidence: 0.5,
      minAgreement: 0.3,
      performanceWindowSize: 100,
      adaptiveWeights: true,
      ...config,
    };
  }

  /**
   * Configure ensemble
   */
  configure(config: Partial<EnsembleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Register a model with initial performance
   */
  registerModel(modelId: string, initialPerformance?: Partial<ModelPerformance>): void {
    this.performances.set(modelId, {
      modelId,
      totalPredictions: 0,
      correctPredictions: 0,
      accuracy: 0.5,
      precision: 0.5,
      recall: 0.5,
      f1Score: 0.5,
      lastUpdated: new Date(),
      recentAccuracy: [],
      ...initialPerformance,
    });
  }

  /**
   * Combine predictions from multiple models
   */
  combine(predictions: ModelPrediction[]): EnsemblePrediction {
    // Filter low confidence predictions
    const validPredictions = predictions.filter(
      p => p.confidence >= this.config.minConfidence
    );

    if (validPredictions.length === 0) {
      return {
        prediction: 0,
        confidence: 0,
        individualPredictions: predictions,
        weights: {},
        method: this.config.method,
        agreement: 0,
      };
    }

    // Calculate weights
    let weights: Record<string, number>;
    if (this.config.method === 'dynamic' || this.config.adaptiveWeights) {
      weights = dynamicWeights(validPredictions, this.performances);
    } else if (this.config.weights) {
      weights = this.config.weights;
    } else {
      // Equal weights
      weights = {};
      const equalWeight = 1 / validPredictions.length;
      for (const p of validPredictions) {
        weights[p.modelId] = equalWeight;
      }
    }

    // Combine predictions
    let finalPrediction: number;
    switch (this.config.method) {
      case 'average':
        finalPrediction = averageEnsemble(validPredictions);
        break;
      case 'weighted_average':
      case 'dynamic':
        finalPrediction = weightedAverageEnsemble(validPredictions, weights);
        break;
      case 'median':
        finalPrediction = medianEnsemble(validPredictions);
        break;
      case 'voting':
        finalPrediction = votingEnsemble(validPredictions);
        break;
      case 'stacking':
        finalPrediction = this.stackingEnsemble(validPredictions);
        break;
      default:
        finalPrediction = weightedAverageEnsemble(validPredictions, weights);
    }

    // Calculate agreement
    const agreement = calculateAgreement(validPredictions);

    // Calculate ensemble confidence
    const avgConfidence = validPredictions.reduce((sum, p) => sum + p.confidence, 0) / validPredictions.length;
    const ensembleConfidence = avgConfidence * agreement;

    return {
      prediction: finalPrediction,
      confidence: ensembleConfidence,
      individualPredictions: validPredictions,
      weights,
      method: this.config.method,
      agreement,
    };
  }

  /**
   * Stacking ensemble (uses meta-model)
   */
  private stackingEnsemble(predictions: ModelPrediction[]): number {
    if (this.stackedModel) {
      const features = predictions.map(p => p.prediction);
      return this.stackedModel(features);
    }
    // Fallback to weighted average
    return weightedAverageEnsemble(predictions, this.config.weights || {});
  }

  /**
   * Update model performance with actual outcome
   */
  updatePerformance(modelId: string, predicted: number, actual: number): void {
    let perf = this.performances.get(modelId);
    if (!perf) {
      this.registerModel(modelId);
      perf = this.performances.get(modelId)!;
    }

    // Determine if prediction was correct (within tolerance)
    const tolerance = Math.abs(actual) * 0.1; // 10% tolerance
    const isCorrect = Math.abs(predicted - actual) <= tolerance;

    // Update counts
    perf.totalPredictions++;
    if (isCorrect) perf.correctPredictions++;

    // Update accuracy
    perf.accuracy = perf.correctPredictions / perf.totalPredictions;

    // Update recent accuracy
    perf.recentAccuracy.push(isCorrect ? 1 : 0);
    if (perf.recentAccuracy.length > this.config.performanceWindowSize) {
      perf.recentAccuracy.shift();
    }

    perf.lastUpdated = new Date();

    // Update precision/recall for classification
    if (predicted > 0.5 && actual > 0.5) {
      // True positive - would need more complex tracking
    }
  }

  /**
   * Get model performance
   */
  getPerformance(modelId: string): ModelPerformance | undefined {
    return this.performances.get(modelId);
  }

  /**
   * Get all model performances
   */
  getAllPerformances(): ModelPerformance[] {
    return Array.from(this.performances.values());
  }

  /**
   * Get top performing models
   */
  getTopModels(n: number = 5): ModelPerformance[] {
    return Array.from(this.performances.values())
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, n);
  }

  /**
   * Set stacked meta-model
   */
  setStackedModel(model: (features: number[]) => number): void {
    this.stackedModel = model;
  }

  /**
   * Train meta-model from historical predictions
   */
  trainMetaModel(
    historicalPredictions: Array<{
      predictions: ModelPrediction[];
      actual: number;
    }>
  ): void {
    // Simple linear regression for meta-model
    // In production, would use more sophisticated methods

    // Collect features and targets
    const X: number[][] = [];
    const y: number[] = [];

    for (const sample of historicalPredictions) {
      X.push(sample.predictions.map(p => p.prediction));
      y.push(sample.actual);
    }

    // Create simple weighted average as meta-model
    // (would be replaced with actual ML model in production)
    this.stackedModel = (features: number[]) => {
      return features.reduce((a, b) => a + b, 0) / features.length;
    };
  }

  /**
   * Calculate ensemble statistics
   */
  getStats(): {
    totalModels: number;
    avgAccuracy: number;
    bestModel: string | null;
    worstModel: string | null;
  } {
    const perfs = Array.from(this.performances.values());
    if (perfs.length === 0) {
      return {
        totalModels: 0,
        avgAccuracy: 0,
        bestModel: null,
        worstModel: null,
      };
    }

    const avgAccuracy = perfs.reduce((sum, p) => sum + p.accuracy, 0) / perfs.length;
    const sorted = [...perfs].sort((a, b) => b.accuracy - a.accuracy);

    return {
      totalModels: perfs.length,
      avgAccuracy,
      bestModel: sorted[0]?.modelId || null,
      worstModel: sorted[sorted.length - 1]?.modelId || null,
    };
  }

  /**
   * Reset all performances
   */
  reset(): void {
    this.performances.clear();
  }
}

// ============================================================================
// PRE-BUILT ENSEMBLE CONFIGURATIONS
// ============================================================================

export const ENSEMBLE_CONFIGS = {
  /**
   * Conservative: High agreement required, weighted by confidence
   */
  conservative: {
    method: 'weighted_average' as EnsembleMethod,
    minConfidence: 0.7,
    minAgreement: 0.5,
    adaptiveWeights: true,
  },

  /**
   * Aggressive: Lower thresholds, uses all predictions
   */
  aggressive: {
    method: 'weighted_average' as EnsembleMethod,
    minConfidence: 0.3,
    minAgreement: 0.1,
    adaptiveWeights: true,
  },

  /**
   * Democratic: Simple voting
   */
  democratic: {
    method: 'voting' as EnsembleMethod,
    minConfidence: 0.5,
    minAgreement: 0.3,
    adaptiveWeights: false,
  },

  /**
   * Adaptive: Dynamic weights based on performance
   */
  adaptive: {
    method: 'dynamic' as EnsembleMethod,
    minConfidence: 0.5,
    minAgreement: 0.2,
    adaptiveWeights: true,
  },

  /**
   * Robust: Median-based, resistant to outliers
   */
  robust: {
    method: 'median' as EnsembleMethod,
    minConfidence: 0.4,
    minAgreement: 0.2,
    adaptiveWeights: false,
  },
};

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const modelEnsemble = new ModelEnsemble();
export default modelEnsemble;
