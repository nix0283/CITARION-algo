/**
 * Online Learning Module
 * 
 * Provides adaptive ML models that update in real-time:
 * - Incremental learning algorithms
 * - Concept drift detection
 * - Model adaptation strategies
 * - Performance monitoring
 */

// ============================================================================
// TYPES
// ============================================================================

export interface OnlineSample {
  features: number[];
  label?: number;
  timestamp: number;
  weight?: number;
}

export interface ModelMetrics {
  samplesProcessed: number;
  accuracy: number;
  lastError: number;
  driftDetected: boolean;
  lastUpdated: Date;
}

export interface DriftDetectionResult {
  detected: boolean;
  driftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null;
  confidence: number;
  affectedFeatures: number[];
  timestamp: number;
}

export interface AdaptationStrategy {
  type: 'reset' | 'ensemble' | 'window' | 'weights' | 'none';
  trigger: (drift: DriftDetectionResult) => boolean;
  apply: () => void;
}

// ============================================================================
// DRIFT DETECTORS
// ============================================================================

/**
 * Page-Hinkley Test for drift detection
 */
class PageHinkleyTest {
  private sum: number = 0;
  private sumMin: number = 0;
  private n: number = 0;
  private xMean: number = 0;

  constructor(
    private readonly delta: number = 0.005,
    private readonly lambda: number = 50,
    private readonly alpha: number = 0.99
  ) {}

  update(error: number): boolean {
    this.n++;
    this.xMean = this.xMean + (error - this.xMean) / this.n;
    this.sum += error - this.xMean - this.delta;
    this.sumMin = Math.min(this.sumMin, this.sum);

    return this.sum - this.sumMin > this.lambda;
  }

  reset(): void {
    this.sum = 0;
    this.sumMin = 0;
    this.n = 0;
    this.xMean = 0;
  }
}

/**
 * ADWIN (Adaptive Windowing) for drift detection
 */
class ADWIN {
  private window: number[] = [];
  private readonly delta: number;

  constructor(delta: number = 0.002) {
    this.delta = delta;
  }

  update(value: number): boolean {
    this.window.push(value);
    
    // Check for cut points
    let driftDetected = false;
    while (this.window.length > 1) {
      const n = this.window.length;
      const mid = Math.floor(n / 2);
      
      const leftMean = this.window.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const rightMean = this.window.slice(mid).reduce((a, b) => a + b, 0) / (n - mid);
      
      const epsilon = Math.sqrt(
        2 * Math.log(2 / this.delta) * (1 / mid + 1 / (n - mid))
      );
      
      if (Math.abs(leftMean - rightMean) > epsilon) {
        // Drift detected, drop oldest elements
        this.window.shift();
        driftDetected = true;
      } else {
        break;
      }
    }
    
    return driftDetected;
  }

  getMean(): number {
    if (this.window.length === 0) return 0;
    return this.window.reduce((a, b) => a + b, 0) / this.window.length;
  }

  reset(): void {
    this.window = [];
  }
}

/**
 * DDM (Drift Detection Method)
 */
class DDM {
  private n: number = 0;
  private p: number = 0;
  private s: number = 0;
  private pMin: number = Infinity;
  private sMin: number = Infinity;

  constructor(
    private readonly warningLevel: number = 2,
    private readonly driftLevel: number = 3
  ) {}

  update(error: number): 'stable' | 'warning' | 'drift' {
    this.n++;
    this.p += (error - this.p) / this.n;
    this.s += (Math.abs(error - this.p) - this.s) / this.n;

    const ps = this.p + this.s;
    const psMin = this.pMin + this.sMin;

    if (ps < psMin) {
      this.pMin = this.p;
      this.sMin = this.s;
    }

    const threshold = ps - psMin;

    if (threshold > this.driftLevel * Math.sqrt(this.sMin / this.n)) {
      return 'drift';
    } else if (threshold > this.warningLevel * Math.sqrt(this.sMin / this.n)) {
      return 'warning';
    }

    return 'stable';
  }

  reset(): void {
    this.n = 0;
    this.p = 0;
    this.s = 0;
    this.pMin = Infinity;
    this.sMin = Infinity;
  }
}

// ============================================================================
// ONLINE LEARNING MODELS
// ============================================================================

/**
 * Online Perceptron
 */
class OnlinePerceptron {
  private weights: number[];
  private bias: number = 0;

  constructor(
    private readonly inputSize: number,
    private readonly learningRate: number = 0.01
  ) {
    this.weights = new Array(inputSize).fill(0);
  }

  predict(features: number[]): number {
    const sum = features.reduce((acc, f, i) => acc + f * this.weights[i], 0) + this.bias;
    return sum >= 0 ? 1 : 0;
  }

  update(features: number[], label: number): void {
    const prediction = this.predict(features);
    const error = label - prediction;

    if (error !== 0) {
      for (let i = 0; i < this.weights.length; i++) {
        this.weights[i] += this.learningRate * error * features[i];
      }
      this.bias += this.learningRate * error;
    }
  }

  getWeights(): number[] {
    return [...this.weights, this.bias];
  }

  reset(): void {
    this.weights = new Array(this.inputSize).fill(0);
    this.bias = 0;
  }
}

/**
 * Online Passive-Aggressive Classifier
 */
class OnlinePassiveAggressive {
  private weights: number[];
  private bias: number = 0;

  constructor(
    private readonly inputSize: number,
    private readonly c: number = 1.0 // Aggressiveness parameter
  ) {
    this.weights = new Array(inputSize).fill(0);
  }

  predict(features: number[]): number {
    const sum = features.reduce((acc, f, i) => acc + f * this.weights[i], 0) + this.bias;
    return Math.sign(sum) || 0;
  }

  predictProbability(features: number[]): number {
    const sum = features.reduce((acc, f, i) => acc + f * this.weights[i], 0) + this.bias;
    return 1 / (1 + Math.exp(-sum)); // Sigmoid
  }

  update(features: number[], label: number): void {
    const prediction = features.reduce((acc, f, i) => acc + f * this.weights[i], 0) + this.bias;
    const loss = Math.max(0, 1 - label * prediction);

    if (loss > 0) {
      const norm = features.reduce((acc, f) => acc + f * f, 0);
      const tau = loss / (norm + 1 / (2 * this.c));

      for (let i = 0; i < this.weights.length; i++) {
        this.weights[i] += tau * label * features[i];
      }
      this.bias += tau * label;
    }
  }

  reset(): void {
    this.weights = new Array(this.inputSize).fill(0);
    this.bias = 0;
  }
}

/**
 * Online Ridge Regression
 */
class OnlineRidgeRegression {
  private weights: number[];
  private A: number[][]; // Inverse of (X^T * X + lambda * I)

  constructor(
    private readonly inputSize: number,
    private readonly lambda: number = 1.0
  ) {
    this.weights = new Array(inputSize).fill(0);
    this.A = this.initializeA();
  }

  private initializeA(): number[][] {
    const A: number[][] = [];
    for (let i = 0; i < this.inputSize; i++) {
      A[i] = new Array(this.inputSize).fill(0);
      A[i][i] = 1 / this.lambda;
    }
    return A;
  }

  predict(features: number[]): number {
    return features.reduce((acc, f, i) => acc + f * this.weights[i], 0);
  }

  update(features: number[], label: number): void {
    // Sherman-Morrison update for A^-1
    // A^-1_new = A^-1 - (A^-1 * x * x^T * A^-1) / (1 + x^T * A^-1 * x)
    
    const Ax = this.multiplyMatrixVector(this.A, features);
    const xTAx = features.reduce((acc, f, i) => acc + f * Ax[i], 0);
    const scalar = 1 / (1 + xTAx);

    // Update A
    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        this.A[i][j] -= scalar * Ax[i] * Ax[j];
      }
    }

    // Update weights
    const error = label - this.predict(features);
    const Aerror = this.multiplyMatrixVector(this.A, features);
    for (let i = 0; i < this.inputSize; i++) {
      this.weights[i] += error * Aerror[i];
    }
  }

  private multiplyMatrixVector(M: number[][], v: number[]): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.inputSize; i++) {
      let sum = 0;
      for (let j = 0; j < this.inputSize; j++) {
        sum += M[i][j] * v[j];
      }
      result.push(sum);
    }
    return result;
  }

  reset(): void {
    this.weights = new Array(this.inputSize).fill(0);
    this.A = this.initializeA();
  }
}

// ============================================================================
// ONLINE LEARNING MANAGER
// ============================================================================

class OnlineLearningManager {
  private models: Map<string, OnlinePassiveAggressive | OnlineRidgeRegression | OnlinePerceptron> = new Map();
  private driftDetectors: Map<string, DDM | ADWIN | PageHinkleyTest> = new Map();
  private metrics: Map<string, ModelMetrics> = new Map();
  private windowSize: number = 100;
  private errorWindows: Map<string, number[]> = new Map();

  /**
   * Create a new online learning model
   */
  createModel(
    modelId: string,
    type: 'perceptron' | 'pa' | 'ridge',
    inputSize: number,
    options?: {
      learningRate?: number;
      c?: number;
      lambda?: number;
    }
  ): void {
    let model: OnlinePerceptron | OnlinePassiveAggressive | OnlineRidgeRegression;

    switch (type) {
      case 'perceptron':
        model = new OnlinePerceptron(inputSize, options?.learningRate || 0.01);
        break;
      case 'pa':
        model = new OnlinePassiveAggressive(inputSize, options?.c || 1.0);
        break;
      case 'ridge':
        model = new OnlineRidgeRegression(inputSize, options?.lambda || 1.0);
        break;
    }

    this.models.set(modelId, model);
    this.driftDetectors.set(modelId, new DDM());
    this.metrics.set(modelId, {
      samplesProcessed: 0,
      accuracy: 0,
      lastError: 0,
      driftDetected: false,
      lastUpdated: new Date(),
    });
    this.errorWindows.set(modelId, []);
  }

  /**
   * Process a sample and update the model
   */
  processSample(modelId: string, sample: OnlineSample): number {
    const model = this.models.get(modelId);
    const detector = this.driftDetectors.get(modelId);
    const metrics = this.metrics.get(modelId);
    const errorWindow = this.errorWindows.get(modelId);

    if (!model || !detector || !metrics || !errorWindow) {
      throw new Error(`Model ${modelId} not found`);
    }

    // Get prediction
    let prediction: number;
    if (model instanceof OnlineRidgeRegression) {
      prediction = model.predict(sample.features);
    } else {
      prediction = (model as OnlinePassiveAggressive).predictProbability(sample.features);
    }

    // If we have a label, update
    if (sample.label !== undefined) {
      const error = Math.abs(prediction - sample.label);
      
      // Update error window
      errorWindow.push(error);
      if (errorWindow.length > this.windowSize) {
        errorWindow.shift();
      }

      // Update model
      if (model instanceof OnlineRidgeRegression) {
        model.update(sample.features, sample.label);
      } else {
        (model as OnlinePassiveAggressive).update(sample.features, sample.label > 0.5 ? 1 : -1);
      }

      // Check for drift
      const driftStatus = detector.update(error);
      metrics.driftDetected = driftStatus === 'drift';

      // Update metrics
      metrics.samplesProcessed++;
      metrics.lastError = error;
      metrics.accuracy = 1 - (errorWindow.reduce((a, b) => a + b, 0) / errorWindow.length);
      metrics.lastUpdated = new Date();

      // Handle drift
      if (driftStatus === 'drift') {
        this.handleDrift(modelId);
      }
    }

    return prediction;
  }

  /**
   * Get prediction without updating
   */
  predict(modelId: string, features: number[]): number {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    if (model instanceof OnlineRidgeRegression) {
      return model.predict(features);
    } else {
      return (model as OnlinePassiveAggressive).predictProbability(features);
    }
  }

  /**
   * Handle detected drift
   */
  private handleDrift(modelId: string): void {
    console.log(`[OnlineLearning] Drift detected for model ${modelId}`);
    
    // Reset model on drift
    const model = this.models.get(modelId);
    const detector = this.driftDetectors.get(modelId);

    if (model) {
      model.reset();
    }
    if (detector) {
      detector.reset();
    }

    // Clear error window
    this.errorWindows.set(modelId, []);
  }

  /**
   * Get model metrics
   */
  getMetrics(modelId: string): ModelMetrics | undefined {
    return this.metrics.get(modelId);
  }

  /**
   * Get all model metrics
   */
  getAllMetrics(): Record<string, ModelMetrics> {
    const result: Record<string, ModelMetrics> = {};
    for (const [id, m] of this.metrics) {
      result[id] = m;
    }
    return result;
  }

  /**
   * Check if model exists
   */
  hasModel(modelId: string): boolean {
    return this.models.has(modelId);
  }

  /**
   * Delete a model
   */
  deleteModel(modelId: string): void {
    this.models.delete(modelId);
    this.driftDetectors.delete(modelId);
    this.metrics.delete(modelId);
    this.errorWindows.delete(modelId);
  }

  /**
   * Set window size for error tracking
   */
  setWindowSize(size: number): void {
    this.windowSize = size;
  }

  /**
   * Export model state
   */
  exportModel(modelId: string): unknown {
    const model = this.models.get(modelId);
    if (!model) return null;

    return {
      type: model.constructor.name,
      weights: model instanceof OnlineRidgeRegression 
        ? (model as OnlineRidgeRegression).getWeights?.() 
        : undefined,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const onlineLearningManager = new OnlineLearningManager();
export default onlineLearningManager;
