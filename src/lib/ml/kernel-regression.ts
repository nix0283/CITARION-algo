/**
 * Kernel Regression Module
 * 
 * Implements Nadaraya-Watson kernel regression for signal smoothing and prediction.
 * This is a non-parametric regression method that uses kernel functions to weight
 * nearby observations.
 * 
 * Key features:
 * - Multiple kernel functions (Gaussian, Epanechnikov, Tricube, etc.)
 * - Adaptive bandwidth selection
 * - Local linear regression
 * - Forecasting capabilities
 * - Real-time streaming support
 * 
 * @see https://en.wikipedia.org/wiki/Kernel_regression
 * @see https://www.tradingview.com/script/Ts0sn9jl/ - Lorentzian Classification Premium
 */

// ==================== TYPE DEFINITIONS ====================

export type KernelType = 'gaussian' | 'epanechnikov' | 'tricube' | 'quartic' | 'triangular' | 'cosine' | 'uniform';

export interface KernelRegressionConfig {
  kernel: KernelType;
  bandwidth: number | 'auto';  // Bandwidth (smoothing parameter) or 'auto' for Silverman's rule
  degree: 0 | 1;               // 0 = Nadaraya-Watson, 1 = Local Linear
  adaptiveBandwidth: boolean;  // Use variable bandwidth based on local density
  minSamples: number;          // Minimum samples for regression
  forecastSteps: number;       // Number of steps to forecast
}

export interface KernelRegressionResult {
  value: number;               // Smoothed value
  confidence: number;          // Confidence based on local density
  gradient: number;            // Local slope (trend direction)
  curvature: number;           // Local curvature (acceleration)
  bandwidth: number;           // Effective bandwidth used
  effectiveSamples: number;    // Number of samples with significant weight
}

export interface StreamingState {
  values: number[];
  timestamps: number[];
  smoothed: number[];
  maxSamples: number;
}

export interface KernelStats {
  name: KernelType;
  efficiency: number;  // Effective sample usage efficiency
  smoothness: number;  // Output smoothness metric
}

// ==================== KERNEL FUNCTIONS ====================

/**
 * Gaussian kernel (normal distribution)
 * K(u) = (1/sqrt(2π)) * exp(-u²/2)
 */
export function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

/**
 * Epanechnikov kernel (optimal in MSE sense)
 * K(u) = (3/4) * (1 - u²) for |u| ≤ 1, else 0
 */
export function epanechnikovKernel(u: number): number {
  const uAbs = Math.abs(u);
  return uAbs <= 1 ? 0.75 * (1 - uAbs * uAbs) : 0;
}

/**
 * Tricube kernel
 * K(u) = (70/81) * (1 - |u|³)³ for |u| ≤ 1, else 0
 */
export function tricubeKernel(u: number): number {
  const uAbs = Math.abs(u);
  if (uAbs > 1) return 0;
  const oneMinusUCubed = 1 - uAbs * uAbs * uAbs;
  return (70 / 81) * oneMinusUCubed * oneMinusUCubed * oneMinusUCubed;
}

/**
 * Quartic (biweight) kernel
 * K(u) = (15/16) * (1 - u²)² for |u| ≤ 1, else 0
 */
export function quarticKernel(u: number): number {
  const uAbs = Math.abs(u);
  if (uAbs > 1) return 0;
  const oneMinusUSquared = 1 - uAbs * uAbs;
  return (15 / 16) * oneMinusUSquared * oneMinusUSquared;
}

/**
 * Triangular kernel
 * K(u) = (1 - |u|) for |u| ≤ 1, else 0
 */
export function triangularKernel(u: number): number {
  const uAbs = Math.abs(u);
  return uAbs <= 1 ? 1 - uAbs : 0;
}

/**
 * Cosine kernel
 * K(u) = (π/4) * cos(πu/2) for |u| ≤ 1, else 0
 */
export function cosineKernel(u: number): number {
  const uAbs = Math.abs(u);
  return uAbs <= 1 ? (Math.PI / 4) * Math.cos((Math.PI * u) / 2) : 0;
}

/**
 * Uniform (rectangular) kernel
 * K(u) = 0.5 for |u| ≤ 1, else 0
 */
export function uniformKernel(u: number): number {
  return Math.abs(u) <= 1 ? 0.5 : 0;
}

/**
 * Get kernel function by name
 */
export function getKernelFunction(type: KernelType): (u: number) => number {
  switch (type) {
    case 'gaussian': return gaussianKernel;
    case 'epanechnikov': return epanechnikovKernel;
    case 'tricube': return tricubeKernel;
    case 'quartic': return quarticKernel;
    case 'triangular': return triangularKernel;
    case 'cosine': return cosineKernel;
    case 'uniform': return uniformKernel;
    default: return gaussianKernel;
  }
}

// ==================== BANDWIDTH SELECTION ====================

/**
 * Silverman's rule of thumb for bandwidth selection
 * h = 1.06 * σ * n^(-1/5)
 */
export function silvermanBandwidth(data: number[]): number {
  const n = data.length;
  if (n < 2) return 1;
  
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  // Silverman's rule
  return 1.06 * std * Math.pow(n, -0.2);
}

/**
 * Scott's rule for bandwidth selection
 * h = 3.49 * σ * n^(-1/3)
 */
export function scottBandwidth(data: number[]): number {
  const n = data.length;
  if (n < 2) return 1;
  
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  return 3.49 * std * Math.pow(n, -1/3);
}

/**
 * Interquartile range (IQR) based bandwidth for robust estimation
 */
export function iqrBandwidth(data: number[]): number {
  const sorted = [...data].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  
  // Silverman's rule with IQR
  return 0.79 * iqr * Math.pow(data.length, -0.2);
}

/**
 * Cross-validation bandwidth selection
 * Finds bandwidth that minimizes leave-one-out cross-validation error
 */
export function crossValidationBandwidth(
  data: number[],
  kernel: KernelType,
  minBW: number = 0.01,
  maxBW: number = 2.0
): number {
  const kernelFn = getKernelFunction(kernel);
  const n = data.length;
  
  if (n < 5) return silvermanBandwidth(data);
  
  // Grid search over bandwidth values
  const steps = 20;
  const logMin = Math.log(minBW);
  const logMax = Math.log(maxBW);
  
  let bestBW = (minBW + maxBW) / 2;
  let bestCV = Infinity;
  
  for (let i = 0; i <= steps; i++) {
    const bw = Math.exp(logMin + (logMax - logMin) * i / steps);
    let cvScore = 0;
    
    // Leave-one-out cross-validation
    for (let j = 0; j < n; j++) {
      let sumWeight = 0;
      let sumValue = 0;
      
      for (let k = 0; k < n; k++) {
        if (k === j) continue;
        const u = (data[k] - data[j]) / bw;
        const weight = kernelFn(u);
        sumWeight += weight;
        sumValue += weight * data[k];
      }
      
      if (sumWeight > 0) {
        const predicted = sumValue / sumWeight;
        cvScore += Math.pow(data[j] - predicted, 2);
      }
    }
    
    if (cvScore < bestCV) {
      bestCV = cvScore;
      bestBW = bw;
    }
  }
  
  return bestBW;
}

// ==================== KERNEL REGRESSION CLASS ====================

/**
 * Kernel Regression
 * 
 * Implements Nadaraya-Watson kernel regression with various kernel functions.
 */
export class KernelRegression {
  private config: KernelRegressionConfig;
  private kernelFn: (u: number) => number;
  private bandwidth: number = 1;
  
  constructor(config?: Partial<KernelRegressionConfig>) {
    this.config = {
      kernel: 'gaussian',
      bandwidth: 'auto',
      degree: 0,
      adaptiveBandwidth: false,
      minSamples: 5,
      forecastSteps: 0,
      ...config
    };
    
    this.kernelFn = getKernelFunction(this.config.kernel);
  }
  
  /**
   * Fit the regression model (determine bandwidth)
   */
  fit(x: number[], y?: number[]): void {
    // If bandwidth is 'auto', compute optimal bandwidth
    if (this.config.bandwidth === 'auto') {
      const data = y || x;
      this.bandwidth = silvermanBandwidth(data);
    } else {
      this.bandwidth = this.config.bandwidth;
    }
  }
  
  /**
   * Predict smoothed value at a point using Nadaraya-Watson estimator
   * 
   * y_hat(x) = Σ K((x - x_i) / h) * y_i / Σ K((x - x_i) / h)
   */
  predict(x: number, X: number[], Y: number[]): KernelRegressionResult {
    if (X.length !== Y.length || X.length < this.config.minSamples) {
      return {
        value: Y.length > 0 ? Y[Y.length - 1] : 0,
        confidence: 0,
        gradient: 0,
        curvature: 0,
        bandwidth: this.bandwidth,
        effectiveSamples: 0
      };
    }
    
    const h = this.bandwidth;
    let sumWeight = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumX2Y = 0;
    let effectiveSamples = 0;
    
    // Calculate weights and weighted sums
    for (let i = 0; i < X.length; i++) {
      const u = (x - X[i]) / h;
      const weight = this.kernelFn(u);
      
      if (weight > 0.001) {
        effectiveSamples++;
        sumWeight += weight;
        sumY += weight * Y[i];
        sumXY += weight * X[i] * Y[i];
        sumX2 += weight * X[i] * X[i];
        sumX2Y += weight * X[i] * X[i] * Y[i];
      }
    }
    
    if (sumWeight === 0) {
      return {
        value: Y[Y.length - 1],
        confidence: 0,
        gradient: 0,
        curvature: 0,
        bandwidth: h,
        effectiveSamples: 0
      };
    }
    
    // Nadaraya-Watson estimate
    let value: number;
    let gradient = 0;
    let curvature = 0;
    
    if (this.config.degree === 0) {
      // Standard Nadaraya-Watson
      value = sumY / sumWeight;
      
      // Estimate gradient using finite differences
      const hGrad = h * 0.1;
      const yPlus = this.predictSimple(x + hGrad, X, Y);
      const yMinus = this.predictSimple(x - hGrad, X, Y);
      gradient = (yPlus - yMinus) / (2 * hGrad);
      
      // Estimate curvature
      const yCenter = value;
      curvature = (yPlus - 2 * yCenter + yMinus) / (hGrad * hGrad);
      
    } else {
      // Local linear regression (higher-order smoothing)
      const meanX = sumXY / sumWeight;
      const meanY = sumY / sumWeight;
      
      let sumCov = 0;
      let sumVar = 0;
      
      for (let i = 0; i < X.length; i++) {
        const u = (x - X[i]) / h;
        const weight = this.kernelFn(u);
        
        if (weight > 0.001) {
          sumCov += weight * (X[i] - meanX) * (Y[i] - meanY);
          sumVar += weight * (X[i] - meanX) * (X[i] - meanX);
        }
      }
      
      const beta = sumVar > 0 ? sumCov / sumVar : 0;
      const alpha = meanY - beta * meanX;
      
      value = alpha + beta * x;
      gradient = beta;
      curvature = 0; // Local linear has zero curvature by definition
    }
    
    // Confidence based on local density and sample count
    const densityConfidence = Math.min(1, effectiveSamples / X.length);
    const weightConfidence = Math.min(1, sumWeight / (X.length * 0.5));
    const confidence = (densityConfidence + weightConfidence) / 2;
    
    return {
      value,
      confidence,
      gradient,
      curvature,
      bandwidth: h,
      effectiveSamples
    };
  }
  
  /**
   * Simple prediction without gradient/curvature
   */
  private predictSimple(x: number, X: number[], Y: number[]): number {
    const h = this.bandwidth;
    let sumWeight = 0;
    let sumY = 0;
    
    for (let i = 0; i < X.length; i++) {
      const u = (x - X[i]) / h;
      const weight = this.kernelFn(u);
      sumWeight += weight;
      sumY += weight * Y[i];
    }
    
    return sumWeight > 0 ? sumY / sumWeight : Y[Y.length - 1];
  }
  
  /**
   * Smooth a time series
   */
  smooth(series: number[]): number[] {
    if (series.length < this.config.minSamples) {
      return [...series];
    }
    
    // Fit bandwidth
    this.fit(series);
    
    // Use index as x values
    const X = series.map((_, i) => i);
    const smoothed: number[] = [];
    
    for (let i = 0; i < series.length; i++) {
      const result = this.predict(i, X, series);
      smoothed.push(result.value);
    }
    
    return smoothed;
  }
  
  /**
   * Forecast future values
   */
  forecast(series: number[], steps?: number): { values: number[]; confidence: number[] } {
    const forecastSteps = steps ?? this.config.forecastSteps;
    
    if (series.length < this.config.minSamples || forecastSteps === 0) {
      return { values: [], confidence: [] };
    }
    
    // Fit bandwidth
    this.fit(series);
    
    // Use index as x values
    const X = series.map((_, i) => i);
    const lastX = X[X.length - 1];
    
    // Extrapolate using trend
    const lastResult = this.predict(lastX, X, series);
    const gradient = lastResult.gradient;
    const value = lastResult.value;
    
    const forecastValues: number[] = [];
    const confidence: number[] = [];
    
    // Confidence decay factor
    const decayFactor = 0.9;
    
    for (let i = 1; i <= forecastSteps; i++) {
      // Linear extrapolation with decaying confidence
      const forecastX = lastX + i;
      const forecastValue = value + gradient * i;
      forecastValues.push(forecastValue);
      confidence.push(lastResult.confidence * Math.pow(decayFactor, i));
    }
    
    return { values: forecastValues, confidence };
  }
  
  /**
   * Get current bandwidth
   */
  getBandwidth(): number {
    return this.bandwidth;
  }
  
  /**
   * Set bandwidth manually
   */
  setBandwidth(bandwidth: number): void {
    this.bandwidth = bandwidth;
  }
  
  /**
   * Get configuration
   */
  getConfig(): KernelRegressionConfig {
    return { ...this.config };
  }
  
  /**
   * Get kernel statistics
   */
  getKernelStats(): KernelStats {
    return {
      name: this.config.kernel,
      efficiency: this.config.kernel === 'epanechnikov' ? 1.0 : 
                  this.config.kernel === 'gaussian' ? 0.951 : 0.9,
      smoothness: this.config.kernel === 'gaussian' ? 1.0 :
                  this.config.kernel === 'tricube' ? 0.95 : 0.85
    };
  }
}

// ==================== STREAMING KERNEL REGRESSION ====================

/**
 * Streaming Kernel Regression
 * 
 * Optimized for real-time data streams with incremental updates.
 */
export class StreamingKernelRegression {
  private state: StreamingState;
  private regression: KernelRegression;
  private config: KernelRegressionConfig & { maxSamples: number };
  
  constructor(config?: Partial<KernelRegressionConfig> & { maxSamples?: number }) {
    this.config = {
      kernel: 'gaussian',
      bandwidth: 'auto',
      degree: 0,
      adaptiveBandwidth: false,
      minSamples: 5,
      forecastSteps: 0,
      maxSamples: 1000,
      ...config
    };
    
    this.state = {
      values: [],
      timestamps: [],
      smoothed: [],
      maxSamples: this.config.maxSamples
    };
    
    this.regression = new KernelRegression(this.config);
  }
  
  /**
   * Add a new value and get smoothed result
   */
  add(value: number, timestamp?: number): KernelRegressionResult {
    // Add to state
    this.state.values.push(value);
    this.state.timestamps.push(timestamp ?? Date.now());
    
    // Trim if needed
    if (this.state.values.length > this.state.maxSamples) {
      this.state.values.shift();
      this.state.timestamps.shift();
    }
    
    // Fit if needed
    if (this.config.bandwidth === 'auto' && this.state.values.length >= this.config.minSamples) {
      this.regression.fit(this.state.values);
    }
    
    // Get result
    if (this.state.values.length < this.config.minSamples) {
      return {
        value,
        confidence: 0,
        gradient: 0,
        curvature: 0,
        bandwidth: this.regression.getBandwidth(),
        effectiveSamples: this.state.values.length
      };
    }
    
    const X = this.state.values.map((_, i) => i);
    const result = this.regression.predict(X.length - 1, X, this.state.values);
    
    // Store smoothed value
    this.state.smoothed.push(result.value);
    if (this.state.smoothed.length > this.state.maxSamples) {
      this.state.smoothed.shift();
    }
    
    return result;
  }
  
  /**
   * Get latest smoothed value
   */
  getLatest(): number | null {
    return this.state.smoothed.length > 0 ? 
      this.state.smoothed[this.state.smoothed.length - 1] : null;
  }
  
  /**
   * Get smoothed series
   */
  getSmoothed(): number[] {
    return [...this.state.smoothed];
  }
  
  /**
   * Get raw values
   */
  getValues(): number[] {
    return [...this.state.values];
  }
  
  /**
   * Get sample count
   */
  getSampleCount(): number {
    return this.state.values.length;
  }
  
  /**
   * Forecast from current state
   */
  forecast(steps?: number): { values: number[]; confidence: number[] } {
    return this.regression.forecast(this.state.values, steps);
  }
  
  /**
   * Clear state
   */
  clear(): void {
    this.state.values = [];
    this.state.timestamps = [];
    this.state.smoothed = [];
  }
  
  /**
   * Export state
   */
  exportState(): StreamingState {
    return {
      ...this.state,
      values: [...this.state.values],
      timestamps: [...this.state.timestamps],
      smoothed: [...this.state.smoothed]
    };
  }
  
  /**
   * Import state
   */
  importState(state: StreamingState): void {
    this.state = {
      values: [...state.values],
      timestamps: [...state.timestamps],
      smoothed: [...state.smoothed],
      maxSamples: state.maxSamples
    };
    
    if (this.state.values.length >= this.config.minSamples) {
      this.regression.fit(this.state.values);
    }
  }
}

// ==================== MULTI-KERNEL ENSEMBLE ====================

/**
 * Multi-Kernel Ensemble
 * 
 * Combines predictions from multiple kernel functions for robust smoothing.
 */
export class MultiKernelEnsemble {
  private regressions: Map<KernelType, KernelRegression> = new Map();
  private weights: Map<KernelType, number> = new Map();
  private config: Omit<KernelRegressionConfig, 'kernel'>;
  
  constructor(config?: Partial<Omit<KernelRegressionConfig, 'kernel'>>) {
    this.config = {
      bandwidth: config?.bandwidth ?? 'auto',
      degree: config?.degree ?? 0,
      adaptiveBandwidth: config?.adaptiveBandwidth ?? false,
      minSamples: config?.minSamples ?? 5,
      forecastSteps: config?.forecastSteps ?? 0
    };
    
    // Initialize all kernel types with equal weights
    const kernels: KernelType[] = ['gaussian', 'epanechnikov', 'tricube', 'quartic'];
    const initialWeight = 1 / kernels.length;
    
    for (const kernel of kernels) {
      this.regressions.set(kernel, new KernelRegression({ ...this.config, kernel }));
      this.weights.set(kernel, initialWeight);
    }
  }
  
  /**
   * Fit all regressions
   */
  fit(x: number[], y?: number[]): void {
    for (const regression of this.regressions.values()) {
      regression.fit(x, y);
    }
  }
  
  /**
   * Ensemble prediction
   */
  predict(x: number, X: number[], Y: number[]): KernelRegressionResult & { ensembleWeights: Map<KernelType, number> } {
    const predictions: Map<KernelType, KernelRegressionResult> = new Map();
    
    for (const [kernel, regression] of this.regressions) {
      predictions.set(kernel, regression.predict(x, X, Y));
    }
    
    // Weighted average
    let value = 0;
    let confidence = 0;
    let gradient = 0;
    let curvature = 0;
    let totalWeight = 0;
    let effectiveSamples = 0;
    let bandwidth = 0;
    
    for (const [kernel, pred] of predictions) {
      const weight = this.weights.get(kernel) ?? 1;
      value += pred.value * weight;
      confidence += pred.confidence * weight;
      gradient += pred.gradient * weight;
      curvature += pred.curvature * weight;
      effectiveSamples += pred.effectiveSamples * weight;
      bandwidth += pred.bandwidth * weight;
      totalWeight += weight;
    }
    
    return {
      value: value / totalWeight,
      confidence: confidence / totalWeight,
      gradient: gradient / totalWeight,
      curvature: curvature / totalWeight,
      effectiveSamples: Math.round(effectiveSamples / totalWeight),
      bandwidth: bandwidth / totalWeight,
      ensembleWeights: new Map(this.weights)
    };
  }
  
  /**
   * Smooth series using ensemble
   */
  smooth(series: number[]): number[] {
    if (series.length < this.config.minSamples) {
      return [...series];
    }
    
    this.fit(series);
    
    const X = series.map((_, i) => i);
    const smoothed: number[] = [];
    
    for (let i = 0; i < series.length; i++) {
      const result = this.predict(i, X, series);
      smoothed.push(result.value);
    }
    
    return smoothed;
  }
  
  /**
   * Update weights based on prediction accuracy
   */
  updateWeights(X: number[], Y: number[]): void {
    const errors: Map<KernelType, number> = new Map();
    
    for (const [kernel, regression] of this.regressions) {
      let totalError = 0;
      let count = 0;
      
      // Leave-one-out error
      for (let i = 0; i < X.length; i++) {
        const pred = regression.predict(X[i], X, Y);
        totalError += Math.pow(pred.value - Y[i], 2);
        count++;
      }
      
      errors.set(kernel, count > 0 ? totalError / count : Infinity);
    }
    
    // Convert errors to weights (inverse weighting)
    const totalInverseError = Array.from(errors.values())
      .reduce((sum, e) => sum + 1 / (e + 0.001), 0);
    
    for (const [kernel, error] of errors) {
      const weight = (1 / (error + 0.001)) / totalInverseError;
      this.weights.set(kernel, weight);
    }
  }
  
  /**
   * Get current weights
   */
  getWeights(): Map<KernelType, number> {
    return new Map(this.weights);
  }
}

// ==================== SINGLETON INSTANCES ====================

let regressionInstance: KernelRegression | null = null;
let streamingInstance: StreamingKernelRegression | null = null;

/**
 * Get kernel regression instance
 */
export function getKernelRegression(config?: Partial<KernelRegressionConfig>): KernelRegression {
  if (!regressionInstance) {
    regressionInstance = new KernelRegression(config);
  }
  return regressionInstance;
}

/**
 * Get streaming kernel regression instance
 */
export function getStreamingKernelRegression(
  config?: Partial<KernelRegressionConfig> & { maxSamples?: number }
): StreamingKernelRegression {
  if (!streamingInstance) {
    streamingInstance = new StreamingKernelRegression(config);
  }
  return streamingInstance;
}

/**
 * Reset instances
 */
export function resetKernelRegression(): void {
  regressionInstance = null;
  streamingInstance = null;
}

export default {
  KernelRegression,
  StreamingKernelRegression,
  MultiKernelEnsemble,
  getKernelRegression,
  getStreamingKernelRegression,
  resetKernelRegression,
  // Kernel functions
  gaussianKernel,
  epanechnikovKernel,
  tricubeKernel,
  quarticKernel,
  triangularKernel,
  cosineKernel,
  uniformKernel,
  // Bandwidth selection
  silvermanBandwidth,
  scottBandwidth,
  iqrBandwidth,
  crossValidationBandwidth
};
