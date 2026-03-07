/**
 * Lawrence Classifier Extensions
 * 
 * Enhanced features for ML Lorentzian Classification:
 * - P0: Platt Scaling for probability calibration
 * - P0: Extended feature support
 * - P1: Nadaraya-Watson kernel regression
 * - P1: Session-based filtering
 * 
 * @see https://www.tradingview.com/script/Ts0sn9jl-ML-Lorentzian-Classification/
 */

import {
  LawrenceClassifier,
  TrainingSample,
  LawrenceFeatures,
  LawrenceResult,
  lorentzianDistance,
} from './lawrence-classifier';

// ==================== TYPE DEFINITIONS ====================

/**
 * Platt Scaling parameters for probability calibration
 */
export interface PlattScalingParams {
  a: number;  // Slope parameter
  b: number;  // Intercept parameter
  trained: boolean;
}

/**
 * Extended feature configuration
 */
export interface ExtendedFeatureConfig {
  name: string;
  enabled: boolean;
  weight: number;
  normalize: boolean;
  range: [number, number];  // [min, max] for normalization
}

/**
 * Kernel regression configuration
 */
export interface KernelRegressionConfig {
  bandwidth: number;  // Kernel bandwidth (h)
  kernelType: 'gaussian' | 'epanechnikov' | 'uniform' | 'triangular';
  minSamples: number;  // Minimum samples for regression
}

/**
 * Session filter configuration
 */
export interface SessionFilterConfig {
  enabled: boolean;
  sessions: Array<{
    name: string;
    startHour: number;
    endHour: number;
    daysOfWeek: number[];
  }>;
  requireOverlap: boolean;
  useEconomicCalendar: boolean;
}

/**
 * Extended classifier result with additional metadata
 */
export interface ExtendedLawrenceResult extends LawrenceResult {
  calibratedProbability: number;
  kernelEstimate?: {
    value: number;
    confidence: number;
    sampleCount: number;
  };
  sessionValid: boolean;
  activeSession?: string;
  featureImportance: Record<string, number>;
}

// ==================== P0: PLATT SCALING ====================

/**
 * Platt Scaling for Probability Calibration
 * 
 * Converts classifier scores to well-calibrated probabilities.
 * Uses logistic regression on the scores to find optimal scaling parameters.
 * 
 * Based on: "Probabilistic Outputs for Support Vector Machines"
 * by John C. Platt (1999)
 */
export class PlattScaler {
  private params: PlattScalingParams = { a: 1, b: 0, trained: false };
  private scores: number[] = [];
  private labels: number[] = [];

  /**
   * Add a training sample for calibration
   */
  addSample(score: number, label: 'LONG' | 'SHORT' | 'NEUTRAL'): void {
    this.scores.push(score);
    // Convert to binary: LONG = 1, SHORT/NEUTRAL = 0
    this.labels.push(label === 'LONG' ? 1 : 0);
  }

  /**
   * Add batch of samples
   */
  addBatch(samples: Array<{ score: number; label: 'LONG' | 'SHORT' | 'NEUTRAL' }>): void {
    for (const sample of samples) {
      this.addSample(sample.score, sample.label);
    }
  }

  /**
   * Train the Platt scaler using Newton-Raphson optimization
   */
  train(maxIterations: number = 100, tolerance: number = 1e-5): void {
    if (this.scores.length < 10) {
      console.warn('PlattScaler: Need at least 10 samples for calibration');
      return;
    }

    const n = this.scores.length;
    
    // Initialize parameters
    let a = 0;
    let b = Math.log((n + 2) / (n - 2 + 0.001)); // Prior
    
    // Count positives and negatives
    const positives = this.labels.reduce((sum, l) => sum + l, 0);
    const negatives = n - positives;
    
    // Handle edge cases
    if (positives === 0 || negatives === 0) {
      this.params = { a: 1, b: 0, trained: true };
      return;
    }

    // Target probabilities with Bayes adjustment
    const targets = this.labels.map(l => (l + 1) / (n + 2));

    // Newton-Raphson optimization
    for (let iter = 0; iter < maxIterations; iter++) {
      let hess00 = 0;
      let hess01 = 0;
      let hess11 = 0;
      let grad0 = 0;
      let grad1 = 0;

      for (let i = 0; i < n; i++) {
        const f = a * this.scores[i] + b;
        const p = 1 / (1 + Math.exp(-f));
        const t = targets[i];
        
        // Gradient
        grad0 += this.scores[i] * (p - t);
        grad1 += p - t;
        
        // Hessian
        const d = p * (1 - p);
        hess00 += this.scores[i] * this.scores[i] * d;
        hess01 += this.scores[i] * d;
        hess11 += d;
      }

      // Regularization
      hess00 += 1e-6;
      hess11 += 1e-6;

      // Solve 2x2 system
      const det = hess00 * hess11 - hess01 * hess01;
      if (Math.abs(det) < 1e-10) break;

      const stepA = (hess11 * grad0 - hess01 * grad1) / det;
      const stepB = (-hess01 * grad0 + hess00 * grad1) / det;

      a -= stepA;
      b -= stepB;

      // Check convergence
      if (Math.abs(stepA) < tolerance && Math.abs(stepB) < tolerance) {
        break;
      }
    }

    this.params = { a, b, trained: true };
  }

  /**
   * Calibrate a raw score to probability
   */
  calibrate(score: number): number {
    if (!this.params.trained) {
      return 1 / (1 + Math.exp(-score)); // Sigmoid fallback
    }
    
    const logit = this.params.a * score + this.params.b;
    
    // Prevent overflow
    if (logit > 20) return 0.99999;
    if (logit < -20) return 0.00001;
    
    return 1 / (1 + Math.exp(-logit));
  }

  /**
   * Get current parameters
   */
  getParams(): PlattScalingParams {
    return { ...this.params };
  }

  /**
   * Set parameters from external source
   */
  setParams(params: PlattScalingParams): void {
    this.params = { ...params };
  }

  /**
   * Reset scaler
   */
  reset(): void {
    this.params = { a: 1, b: 0, trained: false };
    this.scores = [];
    this.labels = [];
  }
}

// ==================== P0: EXTENDED FEATURES ====================

/**
 * Extended Feature Calculator
 * 
 * Calculates additional features beyond the standard indicators.
 */
export class ExtendedFeatureCalculator {
  private configs: Map<string, ExtendedFeatureConfig> = new Map();

  constructor() {
    // Default extended features
    this.registerFeature({
      name: 'momentum',
      enabled: true,
      weight: 1.0,
      normalize: true,
      range: [-1, 1],
    });
    
    this.registerFeature({
      name: 'volatility_ratio',
      enabled: true,
      weight: 1.0,
      normalize: true,
      range: [0, 3],
    });
    
    this.registerFeature({
      name: 'trend_strength',
      enabled: true,
      weight: 1.2,
      normalize: true,
      range: [0, 100],
    });
    
    this.registerFeature({
      name: 'volume_profile',
      enabled: true,
      weight: 0.8,
      normalize: true,
      range: [0, 5],
    });
    
    this.registerFeature({
      name: 'price_velocity',
      enabled: true,
      weight: 1.0,
      normalize: true,
      range: [-1, 1],
    });
    
    this.registerFeature({
      name: 'efficiency_ratio',
      enabled: true,
      weight: 1.1,
      normalize: true,
      range: [0, 1],
    });
    
    this.registerFeature({
      name: 'session_factor',
      enabled: true,
      weight: 0.7,
      normalize: true,
      range: [0, 1],
    });
    
    this.registerFeature({
      name: 'day_of_week_factor',
      enabled: true,
      weight: 0.5,
      normalize: true,
      range: [0, 1],
    });
  }

  /**
   * Register a new feature configuration
   */
  registerFeature(config: ExtendedFeatureConfig): void {
    this.configs.set(config.name, config);
  }

  /**
   * Calculate all enabled extended features
   */
  calculate(
    high: number[],
    low: number[],
    close: number[],
    volume: number[],
    timestamp?: number
  ): Record<string, number> {
    const features: Record<string, number> = {};

    for (const [name, config] of this.configs) {
      if (!config.enabled) continue;

      let value = 0;
      
      switch (name) {
        case 'momentum':
          value = this.calculateMomentum(close);
          break;
        case 'volatility_ratio':
          value = this.calculateVolatilityRatio(high, low, close);
          break;
        case 'trend_strength':
          value = this.calculateTrendStrength(close);
          break;
        case 'volume_profile':
          value = this.calculateVolumeProfile(volume);
          break;
        case 'price_velocity':
          value = this.calculatePriceVelocity(close);
          break;
        case 'efficiency_ratio':
          value = this.calculateEfficiencyRatio(close);
          break;
        case 'session_factor':
          value = this.calculateSessionFactor(timestamp || Date.now());
          break;
        case 'day_of_week_factor':
          value = this.calculateDayOfWeekFactor(timestamp || Date.now());
          break;
      }

      // Normalize if configured
      if (config.normalize) {
        value = this.normalizeValue(value, config.range);
      }

      features[name] = value * config.weight;
    }

    return features;
  }

  /**
   * Normalize value to 0-1 range
   */
  private normalizeValue(value: number, range: [number, number]): number {
    const [min, max] = range;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  /**
   * Calculate momentum (rate of change)
   */
  private calculateMomentum(close: number[], period: number = 14): number {
    if (close.length < period + 1) return 0;
    
    const current = close[close.length - 1];
    const past = close[close.length - period - 1];
    
    if (past === 0) return 0;
    return (current - past) / past;
  }

  /**
   * Calculate volatility ratio (current ATR / historical ATR)
   */
  private calculateVolatilityRatio(
    high: number[],
    low: number[],
    close: number[],
    period: number = 14
  ): number {
    if (close.length < period * 2) return 1;

    // Current ATR
    let currentATR = 0;
    for (let i = close.length - period; i < close.length; i++) {
      currentATR += Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      );
    }
    currentATR /= period;

    // Historical ATR
    let historicalATR = 0;
    for (let i = close.length - period * 2; i < close.length - period; i++) {
      historicalATR += Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      );
    }
    historicalATR /= period;

    if (historicalATR === 0) return 1;
    return currentATR / historicalATR;
  }

  /**
   * Calculate trend strength using ADX-like metric
   */
  private calculateTrendStrength(close: number[], period: number = 14): number {
    if (close.length < period + 1) return 50;

    let upMoves = 0;
    let downMoves = 0;

    for (let i = close.length - period; i < close.length; i++) {
      if (close[i] > close[i - 1]) upMoves++;
      else if (close[i] < close[i - 1]) downMoves++;
    }

    const total = upMoves + downMoves;
    if (total === 0) return 50;

    const ratio = Math.abs(upMoves - downMoves) / total;
    return ratio * 100;
  }

  /**
   * Calculate volume profile (current vs average)
   */
  private calculateVolumeProfile(volume: number[], period: number = 20): number {
    if (volume.length < period) return 1;

    const currentVolume = volume[volume.length - 1];
    const avgVolume = volume.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgVolume === 0) return 1;
    return currentVolume / avgVolume;
  }

  /**
   * Calculate price velocity (rate of price change per bar)
   */
  private calculatePriceVelocity(close: number[], period: number = 5): number {
    if (close.length < period + 1) return 0;

    const recentChange = close[close.length - 1] - close[close.length - period - 1];
    const avgPrice = close.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgPrice === 0) return 0;
    return recentChange / (avgPrice * period);
  }

  /**
   * Calculate Kaufman's Efficiency Ratio
   */
  private calculateEfficiencyRatio(close: number[], period: number = 10): number {
    if (close.length < period + 1) return 0.5;

    // Net change
    const netChange = Math.abs(close[close.length - 1] - close[close.length - period - 1]);

    // Sum of individual changes
    let sumChange = 0;
    for (let i = close.length - period; i < close.length; i++) {
      sumChange += Math.abs(close[i] - close[i - 1]);
    }

    if (sumChange === 0) return 0.5;
    return netChange / sumChange;
  }

  /**
   * Calculate session factor based on time
   */
  private calculateSessionFactor(timestamp: number): number {
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    
    // Higher activity during major session overlaps
    // London-NY overlap: 13:00-16:00 UTC
    if (hour >= 13 && hour < 16) return 1.0;
    // Asian-London overlap: 07:00-09:00 UTC
    if (hour >= 7 && hour < 9) return 0.9;
    // London session: 08:00-16:00 UTC
    if (hour >= 8 && hour < 16) return 0.8;
    // NY session: 13:00-21:00 UTC
    if (hour >= 13 && hour < 21) return 0.7;
    // Asian session: 00:00-08:00 UTC
    if (hour >= 0 && hour < 8) return 0.5;
    // Low activity
    return 0.3;
  }

  /**
   * Calculate day of week factor
   */
  private calculateDayOfWeekFactor(timestamp: number): number {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    
    // Tuesday, Wednesday, Thursday have highest activity
    // Monday and Friday have lower activity
    // Weekend has minimal activity
    const factors: Record<number, number> = {
      0: 0.2,  // Sunday
      1: 0.7,  // Monday
      2: 1.0,  // Tuesday
      3: 1.0,  // Wednesday
      4: 0.9,  // Thursday
      5: 0.6,  // Friday
      6: 0.1,  // Saturday
    };
    
    return factors[day] || 0.5;
  }

  /**
   * Get feature importance scores
   */
  getFeatureImportance(): Record<string, number> {
    const importance: Record<string, number> = {};
    
    for (const [name, config] of this.configs) {
      if (config.enabled) {
        importance[name] = config.weight;
      }
    }
    
    return importance;
  }
}

// ==================== P1: KERNEL REGRESSION ====================

/**
 * Kernel Functions for Nadaraya-Watson Regression
 */
export const KernelFunctions = {
  gaussian: (u: number): number => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI),
  
  epanechnikov: (u: number): number => {
    return Math.abs(u) <= 1 ? 0.75 * (1 - u * u) : 0;
  },
  
  uniform: (u: number): number => {
    return Math.abs(u) <= 1 ? 0.5 : 0;
  },
  
  triangular: (u: number): number => {
    return Math.abs(u) <= 1 ? (1 - Math.abs(u)) : 0;
  },
};

/**
 * Nadaraya-Watson Kernel Regression
 * 
 * Non-parametric regression technique for smoothing predictions.
 * Uses kernel functions to weight nearby samples based on their distance.
 * 
 * @see https://en.wikipedia.org/wiki/Nadaraya%E2%80%93Watson_kernel_regression
 */
export class NadarayaWatsonRegressor {
  private config: KernelRegressionConfig;

  constructor(config?: Partial<KernelRegressionConfig>) {
    this.config = {
      bandwidth: 1.0,
      kernelType: 'gaussian',
      minSamples: 5,
      ...config,
    };
  }

  /**
   * Perform kernel regression estimate
   */
  estimate(
    queryPoint: number[],
    samples: Array<{ features: number[]; label: number; weight?: number }>
  ): { value: number; confidence: number; sampleCount: number } {
    if (samples.length < this.config.minSamples) {
      return { value: 0, confidence: 0, sampleCount: samples.length };
    }

    const kernel = KernelFunctions[this.config.kernelType];
    const h = this.config.bandwidth;

    let weightedSum = 0;
    let weightSum = 0;
    let maxWeight = 0;

    for (const sample of samples) {
      // Calculate Euclidean distance
      let distance = 0;
      for (let i = 0; i < queryPoint.length; i++) {
        distance += Math.pow(queryPoint[i] - sample.features[i], 2);
      }
      distance = Math.sqrt(distance);

      // Apply kernel
      const u = distance / h;
      const kernelWeight = kernel(u) * (sample.weight || 1);

      weightedSum += kernelWeight * sample.label;
      weightSum += kernelWeight;
      maxWeight = Math.max(maxWeight, kernelWeight);
    }

    if (weightSum === 0) {
      return { value: 0, confidence: 0, sampleCount: samples.length };
    }

    const value = weightedSum / weightSum;
    
    // Confidence based on weight distribution
    const confidence = Math.min(1, maxWeight / (weightSum / samples.length));

    return { value, confidence, sampleCount: samples.length };
  }

  /**
   * Multi-dimensional kernel regression for classifier output smoothing
   */
  smoothClassifierOutput(
    queryFeatures: number[],
    trainingData: TrainingSample[],
    k: number = 10
  ): { smoothedProbability: number; direction: 'LONG' | 'SHORT' | 'NEUTRAL'; confidence: number } {
    // Find k nearest neighbors
    const distances = trainingData.map(sample => {
      const featureVector = Object.values(sample.features);
      const distance = lorentzianDistance(queryFeatures, featureVector);
      return { sample, distance };
    });

    distances.sort((a, b) => a.distance - b.distance);
    const neighbors = distances.slice(0, k);

    // Convert labels to numeric
    const numericSamples = neighbors.map(n => ({
      features: Object.values(n.sample.features),
      label: n.sample.label === 'LONG' ? 1 : (n.sample.label === 'SHORT' ? -1 : 0),
      weight: n.sample.weight / (1 + n.distance),
    }));

    const estimate = this.estimate(queryFeatures, numericSamples);

    // Convert back to direction
    let direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    if (estimate.value > 0.2) direction = 'LONG';
    else if (estimate.value < -0.2) direction = 'SHORT';
    else direction = 'NEUTRAL';

    // Convert estimate to probability
    const smoothedProbability = (estimate.value + 1) / 2;

    return {
      smoothedProbability: Math.max(0, Math.min(1, smoothedProbability)),
      direction,
      confidence: estimate.confidence,
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<KernelRegressionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): KernelRegressionConfig {
    return { ...this.config };
  }
}

// ==================== P1: SESSION FILTER ====================

/**
 * Session Filter for signal validation
 */
export class SessionFilter {
  private config: SessionFilterConfig;

  constructor(config?: Partial<SessionFilterConfig>) {
    this.config = {
      enabled: true,
      sessions: [
        { name: 'London', startHour: 8, endHour: 16, daysOfWeek: [1, 2, 3, 4, 5] },
        { name: 'New York', startHour: 13, endHour: 21, daysOfWeek: [1, 2, 3, 4, 5] },
        { name: 'Asian', startHour: 0, endHour: 8, daysOfWeek: [1, 2, 3, 4, 5] },
      ],
      requireOverlap: false,
      useEconomicCalendar: false,
      ...config,
    };
  }

  /**
   * Check if timestamp is within any active session
   */
  isValidTime(timestamp: number): { valid: boolean; sessions: string[]; isOverlap: boolean } {
    if (!this.config.enabled) {
      return { valid: true, sessions: ['Always'], isOverlap: false };
    }

    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    const day = date.getUTCDay();

    const activeSessions: string[] = [];

    for (const session of this.config.sessions) {
      // Check day of week
      if (!session.daysOfWeek.includes(day)) continue;

      // Check hour
      if (hour >= session.startHour && hour < session.endHour) {
        activeSessions.push(session.name);
      }
    }

    const isOverlap = activeSessions.length > 1;
    const valid = this.config.requireOverlap ? isOverlap : activeSessions.length > 0;

    return {
      valid,
      sessions: activeSessions,
      isOverlap,
    };
  }

  /**
   * Get session factor (activity level) for timestamp
   */
  getSessionFactor(timestamp: number): number {
    const { valid, isOverlap } = this.isValidTime(timestamp);
    
    if (!valid) return 0.1;
    if (isOverlap) return 1.0;
    return 0.7;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SessionFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): SessionFilterConfig {
    return { ...this.config };
  }
}

// ==================== ENHANCED CLASSIFIER ====================

/**
 * Enhanced Lawrence Classifier with all extensions
 */
export class EnhancedLawrenceClassifier extends LawrenceClassifier {
  private plattScaler: PlattScaler;
  private featureCalculator: ExtendedFeatureCalculator;
  private kernelRegressor: NadarayaWatsonRegressor;
  private sessionFilter: SessionFilter;
  private useKernelSmoothing: boolean = true;

  constructor(config?: Parameters<typeof LawrenceClassifier>[0]) {
    super(config);
    this.plattScaler = new PlattScaler();
    this.featureCalculator = new ExtendedFeatureCalculator();
    this.kernelRegressor = new NadarayaWatsonRegressor();
    this.sessionFilter = new SessionFilter();
  }

  /**
   * Enhanced classification with all features
   */
  classifyEnhanced(
    features: LawrenceFeatures,
    priceData: {
      high: number[];
      low: number[];
      close: number[];
      volume?: number[];
    }
  ): ExtendedLawrenceResult {
    // Get base classification
    const baseResult = super.classify(features);

    // Calculate extended features
    const extendedFeatures = this.featureCalculator.calculate(
      priceData.high,
      priceData.low,
      priceData.close,
      priceData.volume || [],
      features.time?.hour ? Date.now() : undefined
    );

    // Combine features for kernel regression
    const allFeatures = { ...baseResult.features, ...extendedFeatures };
    const featureVector = Object.values(allFeatures);

    // Apply kernel smoothing if enabled
    let kernelEstimate: ExtendedLawrenceResult['kernelEstimate'];
    let smoothedDirection = baseResult.direction;
    let smoothedProbability = baseResult.probability;

    if (this.useKernelSmoothing) {
      const kernelResult = this.kernelRegressor.smoothClassifierOutput(
        featureVector,
        this.exportTrainingData()
      );
      
      kernelEstimate = {
        value: kernelResult.smoothedProbability,
        confidence: kernelResult.confidence,
        sampleCount: kernelEstimate?.sampleCount || 0,
      };

      // Blend kernel estimate with base result
      if (kernelResult.confidence > 0.5) {
        smoothedDirection = kernelResult.direction;
        smoothedProbability = (baseResult.probability + kernelResult.smoothedProbability) / 2;
      }
    }

    // Apply Platt scaling
    const calibratedProbability = this.plattScaler.calibrate(smoothedProbability - 0.5);

    // Check session validity
    const sessionCheck = this.sessionFilter.isValidTime(Date.now());

    // Get feature importance
    const featureImportance = this.featureCalculator.getFeatureImportance();

    return {
      direction: smoothedDirection,
      probability: smoothedProbability,
      confidence: baseResult.confidence,
      features: allFeatures,
      calibratedProbability,
      kernelEstimate,
      sessionValid: sessionCheck.valid,
      activeSession: sessionCheck.sessions.join(', '),
      featureImportance,
    };
  }

  /**
   * Train classifier with automatic Platt scaling
   */
  trainWithCalibration(sample: TrainingSample): void {
    // Train base classifier
    super.train(sample);

    // Add to Platt scaler
    const featureVector = Object.values(sample.features);
    const avgFeature = featureVector.reduce((a, b) => a + b, 0) / featureVector.length;
    this.plattScaler.addSample(avgFeature, sample.label);
  }

  /**
   * Calibrate Platt scaler with current training data
   */
  calibrateProbabilities(): void {
    const trainingData = this.exportTrainingData();
    
    this.plattScaler.reset();
    for (const sample of trainingData) {
      const featureVector = Object.values(sample.features);
      const avgFeature = featureVector.reduce((a, b) => a + b, 0) / featureVector.length;
      this.plattScaler.addSample(avgFeature, sample.label);
    }
    
    this.plattScaler.train();
  }

  /**
   * Enable/disable kernel smoothing
   */
  setKernelSmoothing(enabled: boolean): void {
    this.useKernelSmoothing = enabled;
  }

  /**
   * Configure session filter
   */
  configureSessionFilter(config: Partial<SessionFilterConfig>): void {
    this.sessionFilter.setConfig(config);
  }

  /**
   * Configure kernel regression
   */
  configureKernelRegression(config: Partial<KernelRegressionConfig>): void {
    this.kernelRegressor.setConfig(config);
  }

  /**
   * Get Platt scaler for external serialization
   */
  getPlattScaler(): PlattScaler {
    return this.plattScaler;
  }

  /**
   * Get extended feature calculator
   */
  getFeatureCalculator(): ExtendedFeatureCalculator {
    return this.featureCalculator;
  }

  /**
   * Get kernel regressor
   */
  getKernelRegressor(): NadarayaWatsonRegressor {
    return this.kernelRegressor;
  }

  /**
   * Get session filter
   */
  getSessionFilter(): SessionFilter {
    return this.sessionFilter;
  }
}

// ==================== SINGLETON INSTANCE ====================

let enhancedInstance: EnhancedLawrenceClassifier | null = null;

/**
 * Get Enhanced Lawrence Classifier instance (singleton factory)
 */
export function getEnhancedLawrenceClassifier(
  config?: Parameters<typeof LawrenceClassifier>[0]
): EnhancedLawrenceClassifier {
  if (!enhancedInstance) {
    enhancedInstance = new EnhancedLawrenceClassifier(config);
  }
  return enhancedInstance;
}

/**
 * Reset the singleton instance
 */
export function resetEnhancedLawrenceClassifier(): void {
  enhancedInstance = null;
}

// Named export for all functions and classes
const lawrenceExtensionsModule = {
  // Classes
  PlattScaler,
  ExtendedFeatureCalculator,
  NadarayaWatsonRegressor,
  SessionFilter,
  EnhancedLawrenceClassifier,
  
  // Factory functions
  getEnhancedLawrenceClassifier,
  resetEnhancedLawrenceClassifier,
  
  // Kernel functions
  KernelFunctions,
};

export default lawrenceExtensionsModule;
