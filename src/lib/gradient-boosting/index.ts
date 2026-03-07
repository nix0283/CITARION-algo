/**
 * GRADIENT BOOSTING - Signal Quality Scoring
 *
 * Classical gradient boosting implementation for signal quality prediction.
 * NO NEURAL NETWORKS - Uses decision tree ensembles only.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface BoostingConfig {
  /** Number of trees */
  nEstimators: number;
  /** Learning rate */
  learningRate: number;
  /** Maximum tree depth */
  maxDepth: number;
  /** Minimum samples to split */
  minSamplesSplit: number;
  /** Minimum samples in leaf */
  minSamplesLeaf: number;
  /** Subsample ratio */
  subsample: number;
  /** Loss function */
  loss: 'squared' | 'absolute' | 'huber';
  /** Early stopping rounds */
  earlyStoppingRounds: number;
  /** Validation split */
  validationSplit: number;
}

export interface TreeNode {
  feature: number;
  threshold: number;
  left: TreeNode | null;
  right: TreeNode | null;
  value: number;
  samples: number;
}

export interface DecisionTree {
  root: TreeNode | null;
  featureImportance: number[];
}

export interface BoostingModel {
  trees: DecisionTree[];
  initialPrediction: number;
  featureCount: number;
  trained: boolean;
  trainScore: number;
  validationScore: number;
}

export interface SignalFeatures {
  // Price-based features
  return_1: number;
  return_5: number;
  return_10: number;
  volatility_10: number;
  volatility_20: number;
  
  // Technical indicators
  rsi_14: number;
  macd: number;
  macd_signal: number;
  bollinger_position: number;
  adx: number;
  
  // Volume features
  volume_ratio: number;
  volume_trend: number;
  
  // Trend features
  ema_cross: number;
  supertrend_direction: number;
  trend_strength: number;
  
  // Market context
  funding_rate: number;
  basis: number;
  open_interest_change: number;
}

export interface SignalScore {
  score: number;
  confidence: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  quality: 'HIGH' | 'MEDIUM' | 'LOW';
  features: Partial<SignalFeatures>;
}

// =============================================================================
// DECISION TREE
// =============================================================================

class DecisionTreeImpl {
  private config: BoostingConfig;
  private root: TreeNode | null = null;
  private featureImportance: number[] = [];
  private nFeatures: number = 0;

  constructor(config: BoostingConfig) {
    this.config = config;
  }

  /**
   * Train the tree on residuals
   */
  public fit(X: number[][], y: number[]): void {
    this.nFeatures = X[0]?.length || 0;
    this.featureImportance = new Array(this.nFeatures).fill(0);
    this.root = this.buildTree(X, y, 0);
  }

  /**
   * Build tree recursively
   */
  private buildTree(X: number[][], y: number[], depth: number): TreeNode | null {
    const nSamples = X.length;

    // Stopping conditions
    if (nSamples < this.config.minSamplesSplit || depth >= this.config.maxDepth) {
      return this.createLeaf(y);
    }

    // Find best split
    const split = this.findBestSplit(X, y);
    
    if (!split || split.gain <= 0) {
      return this.createLeaf(y);
    }

    // Update feature importance
    this.featureImportance[split.feature] += split.gain * nSamples;

    // Split data
    const leftIndices: number[] = [];
    const rightIndices: number[] = [];

    for (let i = 0; i < nSamples; i++) {
      if (X[i][split.feature] <= split.threshold) {
        leftIndices.push(i);
      } else {
        rightIndices.push(i);
      }
    }

    if (leftIndices.length < this.config.minSamplesLeaf || 
        rightIndices.length < this.config.minSamplesLeaf) {
      return this.createLeaf(y);
    }

    const leftX = leftIndices.map(i => X[i]);
    const leftY = leftIndices.map(i => y[i]);
    const rightX = rightIndices.map(i => X[i]);
    const rightY = rightIndices.map(i => y[i]);

    const node: TreeNode = {
      feature: split.feature,
      threshold: split.threshold,
      left: this.buildTree(leftX, leftY, depth + 1),
      right: this.buildTree(rightX, rightY, depth + 1),
      value: 0,
      samples: nSamples,
    };

    return node;
  }

  /**
   * Find best split
   */
  private findBestSplit(X: number[][], y: number[]): { feature: number; threshold: number; gain: number } | null {
    let bestSplit: { feature: number; threshold: number; gain: number } | null = null;
    let bestGain = -Infinity;

    for (let feature = 0; feature < this.nFeatures; feature++) {
      const values = X.map(row => row[feature]).sort((a, b) => a - b);
      const uniqueValues = [...new Set(values)];

      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;
        const gain = this.calculateGain(X, y, feature, threshold);

        if (gain > bestGain) {
          bestGain = gain;
          bestSplit = { feature, threshold, gain };
        }
      }
    }

    return bestSplit;
  }

  /**
   * Calculate split gain using variance reduction
   */
  private calculateGain(X: number[][], y: number[], feature: number, threshold: number): number {
    const leftY: number[] = [];
    const rightY: number[] = [];

    for (let i = 0; i < X.length; i++) {
      if (X[i][feature] <= threshold) {
        leftY.push(y[i]);
      } else {
        rightY.push(y[i]);
      }
    }

    if (leftY.length === 0 || rightY.length === 0) return -Infinity;

    const totalVar = this.variance(y);
    const leftVar = this.variance(leftY);
    const rightVar = this.variance(rightY);

    const n = y.length;
    const gain = totalVar - (leftY.length / n) * leftVar - (rightY.length / n) * rightVar;

    return gain;
  }

  /**
   * Create leaf node
   */
  private createLeaf(y: number[]): TreeNode {
    const value = y.reduce((s, v) => s + v, 0) / y.length;
    return {
      feature: -1,
      threshold: 0,
      left: null,
      right: null,
      value,
      samples: y.length,
    };
  }

  /**
   * Predict single sample
   */
  public predict(x: number[]): number {
    if (!this.root) return 0;
    return this.predictNode(this.root, x);
  }

  private predictNode(node: TreeNode, x: number[]): number {
    if (node.left === null || node.right === null) {
      return node.value;
    }

    if (x[node.feature] <= node.threshold) {
      return this.predictNode(node.left, x);
    } else {
      return this.predictNode(node.right, x);
    }
  }

  /**
   * Get feature importance
   */
  public getFeatureImportance(): number[] {
    const total = this.featureImportance.reduce((s, v) => s + v, 0);
    if (total === 0) return this.featureImportance;
    return this.featureImportance.map(v => v / total);
  }

  private variance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  }
}

// =============================================================================
// GRADIENT BOOSTING CLASSIFIER
// =============================================================================

export class GradientBoostingClassifier {
  private config: BoostingConfig;
  private model: BoostingModel;
  private featureNames: string[] = [];

  constructor(config: Partial<BoostingConfig> = {}) {
    this.config = {
      nEstimators: 100,
      learningRate: 0.1,
      maxDepth: 5,
      minSamplesSplit: 10,
      minSamplesLeaf: 5,
      subsample: 0.8,
      loss: 'squared',
      earlyStoppingRounds: 10,
      validationSplit: 0.2,
      ...config,
    };

    this.model = {
      trees: [],
      initialPrediction: 0,
      featureCount: 0,
      trained: false,
      trainScore: 0,
      validationScore: 0,
    };
  }

  /**
   * Train the model
   */
  public fit(X: number[][], y: number[], featureNames?: string[]): {
    trainScore: number;
    validationScore: number;
    converged: boolean;
  } {
    const nSamples = X.length;
    const nFeatures = X[0]?.length || 0;

    if (featureNames) {
      this.featureNames = featureNames;
    } else {
      this.featureNames = Array.from({ length: nFeatures }, (_, i) => `feature_${i}`);
    }

    // Split into train/validation
    const splitIdx = Math.floor(nSamples * (1 - this.config.validationSplit));
    const trainX = X.slice(0, splitIdx);
    const trainY = y.slice(0, splitIdx);
    const valX = X.slice(splitIdx);
    const valY = y.slice(splitIdx);

    // Initialize with mean
    this.model.initialPrediction = trainY.reduce((s, v) => s + v, 0) / trainY.length;
    this.model.featureCount = nFeatures;
    this.model.trees = [];

    // Initialize predictions
    let trainPreds = new Array(trainX.length).fill(this.model.initialPrediction);
    let valPreds = new Array(valX.length).fill(this.model.initialPrediction);

    let bestValScore = -Infinity;
    let noImprovement = 0;
    let converged = false;

    // Train trees
    for (let i = 0; i < this.config.nEstimators; i++) {
      // Calculate residuals
      const residuals = trainY.map((yi, j) => yi - trainPreds[j]);

      // Subsample
      const subsampleIndices = this.getSubsampleIndices(trainX.length);
      const subsampleX = subsampleIndices.map(idx => trainX[idx]);
      const subsampleResiduals = subsampleIndices.map(idx => residuals[idx]);

      // Train tree on residuals
      const tree = new DecisionTreeImpl(this.config);
      tree.fit(subsampleX, subsampleResiduals);

      // Update predictions
      for (let j = 0; j < trainX.length; j++) {
        trainPreds[j] += this.config.learningRate * tree.predict(trainX[j]);
      }
      for (let j = 0; j < valX.length; j++) {
        valPreds[j] += this.config.learningRate * tree.predict(valX[j]);
      }

      // Store tree
      this.model.trees.push({
        root: (tree as any).root,
        featureImportance: tree.getFeatureImportance(),
      });

      // Calculate validation score
      const valScore = this.calculateScore(valY, valPreds);

      if (valScore > bestValScore) {
        bestValScore = valScore;
        noImprovement = 0;
      } else {
        noImprovement++;
      }

      if (noImprovement >= this.config.earlyStoppingRounds) {
        converged = true;
        break;
      }
    }

    this.model.trainScore = this.calculateScore(trainY, trainPreds);
    this.model.validationScore = bestValScore;
    this.model.trained = true;

    return {
      trainScore: this.model.trainScore,
      validationScore: this.model.validationScore,
      converged,
    };
  }

  /**
   * Predict for single sample
   */
  public predict(x: number[]): number {
    if (!this.model.trained) return 0.5;

    let prediction = this.model.initialPrediction;

    for (const tree of this.model.trees) {
      const treePred = this.predictTree(tree.root, x);
      prediction += this.config.learningRate * treePred;
    }

    return prediction;
  }

  /**
   * Predict probability (sigmoid transformation)
   */
  public predictProbability(x: number[]): number {
    const raw = this.predict(x);
    return 1 / (1 + Math.exp(-raw));
  }

  /**
   * Predict for multiple samples
   */
  public predictBatch(X: number[][]): number[] {
    return X.map(x => this.predict(x));
  }

  /**
   * Score signal quality
   */
  public scoreSignal(features: Partial<SignalFeatures>): SignalScore {
    const x = this.featuresToArray(features);
    const rawScore = this.predict(x);
    const probability = this.predictProbability(x);

    // Determine direction
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    if (probability > 0.6) {
      direction = 'LONG';
    } else if (probability < 0.4) {
      direction = 'SHORT';
    } else {
      direction = 'NEUTRAL';
    }

    // Determine quality
    let quality: 'HIGH' | 'MEDIUM' | 'LOW';
    const confidence = Math.abs(probability - 0.5) * 2;
    if (confidence > 0.7) {
      quality = 'HIGH';
    } else if (confidence > 0.4) {
      quality = 'MEDIUM';
    } else {
      quality = 'LOW';
    }

    return {
      score: rawScore,
      confidence,
      direction,
      quality,
      features,
    };
  }

  /**
   * Get feature importance
   */
  public getFeatureImportance(): Record<string, number> {
    if (!this.model.trained || this.model.trees.length === 0) {
      return {};
    }

    // Average feature importance across all trees
    const avgImportance = new Array(this.model.featureCount).fill(0);
    
    for (const tree of this.model.trees) {
      for (let i = 0; i < tree.featureImportance.length; i++) {
        avgImportance[i] += tree.featureImportance[i];
      }
    }

    for (let i = 0; i < avgImportance.length; i++) {
      avgImportance[i] /= this.model.trees.length;
    }

    const importance: Record<string, number> = {};
    for (let i = 0; i < this.featureNames.length; i++) {
      importance[this.featureNames[i]] = avgImportance[i];
    }

    return importance;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private predictTree(node: TreeNode | null, x: number[]): number {
    if (!node) return 0;
    if (node.left === null || node.right === null) {
      return node.value;
    }
    if (x[node.feature] <= node.threshold) {
      return this.predictTree(node.left, x);
    }
    return this.predictTree(node.right, x);
  }

  private getSubsampleIndices(n: number): number[] {
    const indices: number[] = [];
    const sampleSize = Math.floor(n * this.config.subsample);
    
    while (indices.length < sampleSize) {
      const idx = Math.floor(Math.random() * n);
      if (!indices.includes(idx)) {
        indices.push(idx);
      }
    }

    return indices;
  }

  private calculateScore(y: number[], predictions: number[]): number {
    // R-squared
    const mean = y.reduce((s, v) => s + v, 0) / y.length;
    const ssTot = y.reduce((s, yi) => s + Math.pow(yi - mean, 2), 0);
    const ssRes = y.reduce((s, yi, i) => s + Math.pow(yi - predictions[i], 2), 0);
    
    return 1 - ssRes / ssTot;
  }

  private featuresToArray(features: Partial<SignalFeatures>): number[] {
    const defaultFeatures: SignalFeatures = {
      return_1: 0,
      return_5: 0,
      return_10: 0,
      volatility_10: 0.02,
      volatility_20: 0.02,
      rsi_14: 50,
      macd: 0,
      macd_signal: 0,
      bollinger_position: 0,
      adx: 25,
      volume_ratio: 1,
      volume_trend: 0,
      ema_cross: 0,
      supertrend_direction: 0,
      trend_strength: 0,
      funding_rate: 0,
      basis: 0,
      open_interest_change: 0,
    };

    const fullFeatures = { ...defaultFeatures, ...features };
    
    return [
      fullFeatures.return_1,
      fullFeatures.return_5,
      fullFeatures.return_10,
      fullFeatures.volatility_10,
      fullFeatures.volatility_20,
      fullFeatures.rsi_14,
      fullFeatures.macd,
      fullFeatures.macd_signal,
      fullFeatures.bollinger_position,
      fullFeatures.adx,
      fullFeatures.volume_ratio,
      fullFeatures.volume_trend,
      fullFeatures.ema_cross,
      fullFeatures.supertrend_direction,
      fullFeatures.trend_strength,
      fullFeatures.funding_rate,
      fullFeatures.basis,
      fullFeatures.open_interest_change,
    ];
  }

  /**
   * Save model to JSON
   */
  public saveModel(): string {
    return JSON.stringify(this.model);
  }

  /**
   * Load model from JSON
   */
  public loadModel(json: string): void {
    this.model = JSON.parse(json);
  }

  /**
   * Check if model is trained
   */
  public isTrained(): boolean {
    return this.model.trained;
  }
}

// =============================================================================
// SIGNAL QUALITY SCORER
// =============================================================================

export class SignalQualityScorer {
  private classifier: GradientBoostingClassifier;
  private trained: boolean = false;

  constructor(config?: Partial<BoostingConfig>) {
    this.classifier = new GradientBoostingClassifier(config);
  }

  /**
   * Train on historical signal outcomes
   */
  public train(
    signals: Array<{ features: Partial<SignalFeatures>; outcome: number }>
  ): { trainScore: number; validationScore: number } {
    const X: number[][] = [];
    const y: number[] = [];

    for (const signal of signals) {
      const x = this.featuresToArray(signal.features);
      X.push(x);
      y.push(signal.outcome);
    }

    const featureNames = Object.keys(signals[0]?.features || {});
    const result = this.classifier.fit(X, y, featureNames);
    this.trained = true;

    return {
      trainScore: result.trainScore,
      validationScore: result.validationScore,
    };
  }

  /**
   * Score a signal
   */
  public score(features: Partial<SignalFeatures>): SignalScore {
    return this.classifier.scoreSignal(features);
  }

  /**
   * Get feature importance
   */
  public getFeatureImportance(): Record<string, number> {
    return this.classifier.getFeatureImportance();
  }

  private featuresToArray(features: Partial<SignalFeatures>): number[] {
    const defaultFeatures: SignalFeatures = {
      return_1: 0,
      return_5: 0,
      return_10: 0,
      volatility_10: 0.02,
      volatility_20: 0.02,
      rsi_14: 50,
      macd: 0,
      macd_signal: 0,
      bollinger_position: 0,
      adx: 25,
      volume_ratio: 1,
      volume_trend: 0,
      ema_cross: 0,
      supertrend_direction: 0,
      trend_strength: 0,
      funding_rate: 0,
      basis: 0,
      open_interest_change: 0,
    };

    const fullFeatures = { ...defaultFeatures, ...features };
    
    return Object.values(fullFeatures);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const defaultBoostingConfig: BoostingConfig = {
  nEstimators: 100,
  learningRate: 0.1,
  maxDepth: 5,
  minSamplesSplit: 10,
  minSamplesLeaf: 5,
  subsample: 0.8,
  loss: 'squared',
  earlyStoppingRounds: 10,
  validationSplit: 0.2,
};

// Re-export from sub-modules
export { 
  ExchangeFeatureProvider, 
  getFeatureProvider, 
  clearProviders,
  type ExchangeFeatureConfig,
  type OHLCV,
  type MarketDataContext,
} from './exchange-feature-provider'

export {
  TrainingDataCollector,
  getTrainingCollector,
  resetCollector,
  type TrainingSample,
  type TrainingStats,
  type TrainingConfig,
} from './training-collector'

export {
  GBIntegrationService,
  getGBIntegration,
  resetGBIntegration,
  DEFAULT_GB_CONFIG,
  DEFAULT_BOT_INTEGRATIONS,
  type GBIntegrationConfig,
  type BotSignalInput,
  type EnhancedSignal,
  type GBBotIntegration,
} from './gb-integration-service'
