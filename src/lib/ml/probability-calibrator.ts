/**
 * Probability Calibrator
 * 
 * Implements probability calibration methods for machine learning classifiers.
 * Converts raw classifier scores into well-calibrated probabilities.
 * 
 * Methods implemented:
 * - Platt Scaling (Logistic Regression calibration)
 * - Isotonic Regression (Non-parametric calibration)
 * - Beta Calibration (Flexible parametric calibration)
 * - Temperature Scaling (Simple neural network calibration)
 * 
 * @see https://arxiv.org/abs/1706.04599 "On Calibration of Modern Neural Networks"
 * @see https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.41.1639 - Platt's original paper
 */

// ==================== TYPE DEFINITIONS ====================

export interface CalibrationSample {
  score: number;        // Raw classifier score (distance-based or similar)
  label: number;        // Binary label: 1 for positive (LONG), 0 for negative (SHORT)
  weight?: number;      // Optional sample weight
  timestamp?: number;   // For temporal weighting
}

export interface CalibratedResult {
  probability: number;  // Calibrated probability (0-1)
  confidence: number;   // Confidence score (0-1)
  rawScore: number;     // Original raw score
  method: string;       // Calibration method used
}

export interface PlattParameters {
  a: number;  // Scale parameter
  b: number;  // Shift parameter
}

export interface IsotonicPoint {
  score: number;
  probability: number;
}

export interface BetaParameters {
  alpha: number;
  beta: number;
  loc: number;   // Location shift
  scale: number; // Scale factor
}

export interface CalibrationMetrics {
  ece: number;          // Expected Calibration Error
  mce: number;          // Maximum Calibration Error
  brier: number;        // Brier Score
  logLoss: number;      // Log Loss
  samples: number;      // Number of calibration samples
  lastUpdated: number;  // Timestamp of last update
}

export interface CalibratorConfig {
  method: 'platt' | 'isotonic' | 'beta' | 'temperature' | 'ensemble';
  minSamples: number;        // Minimum samples before calibration
  updateInterval: number;    // MS between recalibration
  validationSplit: number;   // Fraction of data for validation
  temporalDecay: number;     // Decay factor for older samples (0-1, 0=no decay)
  binCount: number;          // Number of bins for ECE/MCE calculation
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Sigmoid function (logistic function)
 */
function sigmoid(x: number): number {
  if (x > 20) return 0.9999999;
  if (x < -20) return 0.0000001;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Log-loss for a single sample
 */
function logLoss(predicted: number, actual: number): number {
  const eps = 1e-15;
  const p = Math.max(eps, Math.min(1 - eps, predicted));
  return -actual * Math.log(p) - (1 - actual) * Math.log(1 - p);
}

/**
 * Brier score for a single sample
 */
function brierScore(predicted: number, actual: number): number {
  return Math.pow(predicted - actual, 2);
}

/**
 * Softmax for temperature scaling
 */
function softmax(logits: number[], temperature: number): number[] {
  const scaled = logits.map(l => l / temperature);
  const maxLogit = Math.max(...scaled);
  const expSum = scaled.reduce((sum, l) => sum + Math.exp(l - maxLogit), 0);
  return scaled.map(l => Math.exp(l - maxLogit) / expSum);
}

// ==================== PLATT SCALING ====================

/**
 * Platt Scaling Calibrator
 * 
 * Uses logistic regression to map raw scores to probabilities.
 * The transformation is: p = sigmoid(a * score + b)
 * 
 * Parameters a and b are learned by maximum likelihood estimation.
 */
export class PlattScaling {
  private params: PlattParameters = { a: 1, b: 0 };
  private samples: CalibrationSample[] = [];
  private config: { minSamples: number; regularization: number };
  
  constructor(config?: { minSamples?: number; regularization?: number }) {
    this.config = {
      minSamples: config?.minSamples ?? 50,
      regularization: config?.regularization ?? 0.01
    };
  }
  
  /**
   * Add calibration sample
   */
  addSample(sample: CalibrationSample): void {
    this.samples.push({
      ...sample,
      weight: sample.weight ?? 1,
      timestamp: sample.timestamp ?? Date.now()
    });
  }
  
  /**
   * Fit Platt scaling parameters using Newton-Raphson optimization
   * 
   * Minimizes: -sum(w_i * [y_i * log(p_i) + (1-y_i) * log(1-p_i)])
   * where p_i = sigmoid(a * score_i + b)
   */
  fit(): { converged: boolean; iterations: number; finalLoss: number } {
    if (this.samples.length < this.config.minSamples) {
      return { converged: false, iterations: 0, finalLoss: Infinity };
    }
    
    // Initialize parameters
    let a = 1.0;
    let b = 0.0;
    
    const maxIterations = 100;
    const tolerance = 1e-6;
    let prevLoss = Infinity;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      // Compute gradient and Hessian
      let gradA = 0, gradB = 0;
      let hessAA = 0, hessAB = 0, hessBB = 0;
      let loss = 0;
      
      for (const sample of this.samples) {
        const w = sample.weight ?? 1;
        const t = a * sample.score + b;
        const p = sigmoid(t);
        
        // Gradient
        const residual = p - sample.label;
        gradA += w * residual * sample.score;
        gradB += w * residual;
        
        // Hessian (negative because we're minimizing negative log-likelihood)
        const pDeriv = p * (1 - p);
        hessAA += w * pDeriv * sample.score * sample.score;
        hessAB += w * pDeriv * sample.score;
        hessBB += w * pDeriv;
        
        // Loss
        loss += w * logLoss(p, sample.label);
      }
      
      // Add regularization
      hessAA += this.config.regularization;
      hessBB += this.config.regularization;
      
      // Newton-Raphson update: solve H * delta = -grad
      const det = hessAA * hessBB - hessAB * hessAB;
      if (Math.abs(det) < 1e-10) break;
      
      const deltaA = -(hessBB * gradA - hessAB * gradB) / det;
      const deltaB = -(-hessAB * gradA + hessAA * gradB) / det;
      
      // Update parameters
      a += deltaA;
      b += deltaB;
      
      // Check convergence
      if (Math.abs(loss - prevLoss) < tolerance) {
        this.params = { a, b };
        return { converged: true, iterations: iter + 1, finalLoss: loss };
      }
      prevLoss = loss;
    }
    
    this.params = { a, b };
    return { converged: false, iterations: maxIterations, finalLoss: prevLoss };
  }
  
  /**
   * Calibrate a raw score
   */
  calibrate(score: number): number {
    return sigmoid(this.params.a * score + this.params.b);
  }
  
  /**
   * Get current parameters
   */
  getParameters(): PlattParameters {
    return { ...this.params };
  }
  
  /**
   * Set parameters directly
   */
  setParameters(params: PlattParameters): void {
    this.params = { ...params };
  }
  
  /**
   * Get sample count
   */
  getSampleCount(): number {
    return this.samples.length;
  }
  
  /**
   * Clear samples (keep parameters)
   */
  clearSamples(): void {
    this.samples = [];
  }
}

// ==================== ISOTONIC REGRESSION ====================

/**
 * Isotonic Regression Calibrator
 * 
 * Non-parametric method that fits a monotonically increasing step function.
 * More flexible than Platt scaling but requires more data.
 * 
 * Uses the Pool Adjacent Violators Algorithm (PAVA).
 */
export class IsotonicRegression {
  private points: IsotonicPoint[] = [];
  private samples: CalibrationSample[] = [];
  private config: { minSamples: number; smoothing: boolean };
  
  constructor(config?: { minSamples?: number; smoothing?: boolean }) {
    this.config = {
      minSamples: config?.minSamples ?? 100,
      smoothing: config?.smoothing ?? true
    };
  }
  
  /**
   * Add calibration sample
   */
  addSample(sample: CalibrationSample): void {
    this.samples.push({
      ...sample,
      weight: sample.weight ?? 1,
      timestamp: sample.timestamp ?? Date.now()
    });
  }
  
  /**
   * Fit isotonic regression using PAVA
   */
  fit(): { converged: boolean; segments: number } {
    if (this.samples.length < this.config.minSamples) {
      // Not enough data, fall back to identity mapping
      this.points = [
        { score: -Infinity, probability: 0 },
        { score: 0, probability: 0.5 },
        { score: Infinity, probability: 1 }
      ];
      return { converged: false, segments: 1 };
    }
    
    // Sort samples by score
    const sorted = [...this.samples].sort((a, b) => a.score - b.score);
    
    // Group by score and compute empirical probabilities
    const groups: Map<number, { sum: number; count: number }> = new Map();
    for (const sample of sorted) {
      const key = sample.score;
      const existing = groups.get(key) ?? { sum: 0, count: 0 };
      existing.sum += sample.label * (sample.weight ?? 1);
      existing.count += sample.weight ?? 1;
      groups.set(key, existing);
    }
    
    // Convert to array of (score, probability) pairs
    let data: { score: number; prob: number; weight: number }[] = [];
    for (const [score, { sum, count }] of groups) {
      data.push({ score, prob: sum / count, weight: count });
    }
    
    // PAVA algorithm
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < data.length - 1; i++) {
        if (data[i].prob > data[i + 1].prob) {
          // Merge adjacent groups
          const totalWeight = data[i].weight + data[i + 1].weight;
          const mergedProb = (data[i].prob * data[i].weight + data[i + 1].prob * data[i + 1].weight) / totalWeight;
          data[i] = { score: data[i].score, prob: mergedProb, weight: totalWeight };
          data.splice(i + 1, 1);
          changed = true;
          break;
        }
      }
    }
    
    // Apply smoothing if enabled
    if (this.config.smoothing && data.length > 2) {
      data = this.smoothData(data);
    }
    
    // Convert to interpolation points
    this.points = data.map(d => ({ score: d.score, probability: d.prob }));
    
    // Add boundary points
    if (this.points.length > 0) {
      this.points.unshift({ score: -Infinity, probability: this.points[0].probability });
      this.points.push({ score: Infinity, probability: this.points[this.points.length - 1].probability });
    }
    
    return { converged: true, segments: data.length };
  }
  
  /**
   * Apply exponential smoothing to the step function
   */
  private smoothData(data: { score: number; prob: number; weight: number }[]): { score: number; prob: number; weight: number }[] {
    const smoothed: { score: number; prob: number; weight: number }[] = [];
    const alpha = 0.3; // Smoothing factor
    
    for (let i = 0; i < data.length; i++) {
      let smoothedProb = data[i].prob;
      
      if (i > 0) {
        smoothedProb = alpha * data[i].prob + (1 - alpha) * smoothed[i - 1].prob;
      }
      
      smoothed.push({ ...data[i], prob: smoothedProb });
    }
    
    return smoothed;
  }
  
  /**
   * Calibrate a raw score using linear interpolation
   */
  calibrate(score: number): number {
    // Binary search for the correct segment
    let left = 0;
    let right = this.points.length - 1;
    
    while (left < right - 1) {
      const mid = Math.floor((left + right) / 2);
      if (this.points[mid].score <= score) {
        left = mid;
      } else {
        right = mid;
      }
    }
    
    const p0 = this.points[left];
    const p1 = this.points[right];
    
    // Linear interpolation
    if (p1.score === p0.score || p0.score === -Infinity || p1.score === Infinity) {
      return p0.probability;
    }
    
    const t = (score - p0.score) / (p1.score - p0.score);
    return p0.probability + t * (p1.probability - p0.probability);
  }
  
  /**
   * Get calibration points
   */
  getPoints(): IsotonicPoint[] {
    return [...this.points];
  }
  
  /**
   * Get sample count
   */
  getSampleCount(): number {
    return this.samples.length;
  }
  
  /**
   * Clear samples
   */
  clearSamples(): void {
    this.samples = [];
  }
}

// ==================== BETA CALIBRATION ====================

/**
 * Beta Calibration
 * 
 * Fits a Beta distribution to the scores, providing more flexibility
 * than Platt scaling for non-symmetric calibration curves.
 * 
 * The calibration function is: p = F_beta(alpha, beta, (score - loc) / scale)
 * where F_beta is the CDF of the Beta distribution.
 */
export class BetaCalibration {
  private params: BetaParameters = { alpha: 1, beta: 1, loc: 0, scale: 1 };
  private samples: CalibrationSample[] = [];
  private config: { minSamples: number };
  
  constructor(config?: { minSamples?: number }) {
    this.config = {
      minSamples: config?.minSamples ?? 100
    };
  }
  
  /**
   * Add calibration sample
   */
  addSample(sample: CalibrationSample): void {
    this.samples.push({
      ...sample,
      weight: sample.weight ?? 1,
      timestamp: sample.timestamp ?? Date.now()
    });
  }
  
  /**
   * Fit beta calibration parameters using method of moments
   * 
   * This is a simplified fit. For production, consider using MLE.
   */
  fit(): { converged: boolean } {
    if (this.samples.length < this.config.minSamples) {
      return { converged: false };
    }
    
    // Normalize scores to [0, 1]
    const scores = this.samples.map(s => s.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const range = maxScore - minScore || 1;
    
    // Compute empirical mean and variance
    let sum = 0, sumSq = 0, sumW = 0;
    for (const sample of this.samples) {
      const w = sample.weight ?? 1;
      const normalized = (sample.score - minScore) / range;
      sum += w * sample.label * normalized;
      sumSq += w * sample.label * normalized * normalized;
      sumW += w * sample.label;
    }
    
    if (sumW === 0) return { converged: false };
    
    const mean = sum / sumW;
    const variance = sumSq / sumW - mean * mean;
    
    // Method of moments for Beta distribution
    if (mean <= 0 || mean >= 1 || variance <= 0) {
      return { converged: false };
    }
    
    const factor = mean * (1 - mean) / variance - 1;
    const alpha = mean * factor;
    const betaParam = (1 - mean) * factor;
    
    // Ensure valid parameters
    this.params = {
      alpha: Math.max(0.1, alpha),
      beta: Math.max(0.1, betaParam),
      loc: minScore,
      scale: range
    };
    
    return { converged: true };
  }
  
  /**
   * Regularized incomplete beta function (simplified approximation)
   * 
   * For production, use a proper implementation like jStat or scipy.
   */
  private incompleteBeta(x: number, a: number, b: number): number {
    // Use approximation for now
    // This is the CDF of the Beta distribution
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    
    // Use binomial approximation for integer parameters
    if (Number.isInteger(a) && Number.isInteger(b)) {
      let result = 0;
      for (let i = a; i < a + b - 1; i++) {
        const n = a + b - 1;
        const k = i;
        result += this.binomial(n, k) * Math.pow(x, k) * Math.pow(1 - x, n - k);
      }
      return result;
    }
    
    // Fallback to simple approximation
    return sigmoid(5 * (x - 0.5));
  }
  
  /**
   * Binomial coefficient
   */
  private binomial(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    
    let result = 1;
    for (let i = 0; i < k; i++) {
      result = result * (n - i) / (i + 1);
    }
    return result;
  }
  
  /**
   * Calibrate a raw score
   */
  calibrate(score: number): number {
    const normalized = (score - this.params.loc) / this.params.scale;
    const clamped = Math.max(0.001, Math.min(0.999, normalized));
    return this.incompleteBeta(clamped, this.params.alpha, this.params.beta);
  }
  
  /**
   * Get parameters
   */
  getParameters(): BetaParameters {
    return { ...this.params };
  }
  
  /**
   * Get sample count
   */
  getSampleCount(): number {
    return this.samples.length;
  }
  
  /**
   * Clear samples
   */
  clearSamples(): void {
    this.samples = [];
  }
}

// ==================== TEMPERATURE SCALING ====================

/**
 * Temperature Scaling Calibrator
 * 
 * Simple but effective calibration method for neural networks.
 * Scales logits by a learned temperature parameter.
 * 
 * p = softmax(logits / temperature)
 */
export class TemperatureScaling {
  private temperature: number = 1.0;
  private samples: CalibrationSample[] = [];
  private config: { minSamples: number };
  
  constructor(config?: { minSamples?: number }) {
    this.config = {
      minSamples: config?.minSamples ?? 30
    };
  }
  
  /**
   * Add calibration sample
   */
  addSample(sample: CalibrationSample): void {
    this.samples.push({
      ...sample,
      weight: sample.weight ?? 1,
      timestamp: sample.timestamp ?? Date.now()
    });
  }
  
  /**
   * Fit temperature parameter using binary search
   */
  fit(): { converged: boolean; iterations: number } {
    if (this.samples.length < this.config.minSamples) {
      return { converged: false, iterations: 0 };
    }
    
    // Binary search for optimal temperature
    let tMin = 0.01;
    let tMax = 10.0;
    const maxIterations = 50;
    
    for (let i = 0; i < maxIterations; i++) {
      const t1 = tMin + (tMax - tMin) / 3;
      const t2 = tMax - (tMax - tMin) / 3;
      
      const loss1 = this.computeNLL(t1);
      const loss2 = this.computeNLL(t2);
      
      if (loss1 < loss2) {
        tMax = t2;
      } else {
        tMin = t1;
      }
    }
    
    this.temperature = (tMin + tMax) / 2;
    return { converged: true, iterations: maxIterations };
  }
  
  /**
   * Compute negative log-likelihood for given temperature
   */
  private computeNLL(temperature: number): number {
    let nll = 0;
    for (const sample of this.samples) {
      // Assume score is logit, convert to probability
      const prob = sigmoid(sample.score / temperature);
      nll += logLoss(prob, sample.label);
    }
    return nll;
  }
  
  /**
   * Calibrate a raw score (logit)
   */
  calibrate(score: number): number {
    return sigmoid(score / this.temperature);
  }
  
  /**
   * Get temperature
   */
  getTemperature(): number {
    return this.temperature;
  }
  
  /**
   * Set temperature
   */
  setTemperature(temperature: number): void {
    this.temperature = temperature;
  }
  
  /**
   * Get sample count
   */
  getSampleCount(): number {
    return this.samples.length;
  }
  
  /**
   * Clear samples
   */
  clearSamples(): void {
    this.samples = [];
  }
}

// ==================== ENSEMBLE CALIBRATOR ====================

/**
 * Ensemble Calibrator
 * 
 * Combines multiple calibration methods and selects the best one
 * based on validation performance.
 */
export class EnsembleCalibrator {
  private platt: PlattScaling;
  private isotonic: IsotonicRegression;
  private beta: BetaCalibration;
  private temperature: TemperatureScaling;
  
  private bestMethod: 'platt' | 'isotonic' | 'beta' | 'temperature' = 'platt';
  private validationData: CalibrationSample[] = [];
  
  private config: CalibratorConfig;
  
  constructor(config?: Partial<CalibratorConfig>) {
    this.config = {
      method: 'ensemble',
      minSamples: 50,
      updateInterval: 86400000, // 24 hours
      validationSplit: 0.2,
      temporalDecay: 0.95,
      binCount: 10,
      ...config
    };
    
    this.platt = new PlattScaling({ minSamples: 30 });
    this.isotonic = new IsotonicRegression({ minSamples: 80, smoothing: true });
    this.beta = new BetaCalibration({ minSamples: 80 });
    this.temperature = new TemperatureScaling({ minSamples: 30 });
  }
  
  /**
   * Add sample to all calibrators
   */
  addSample(sample: CalibrationSample): void {
    // Apply temporal decay weight
    const now = Date.now();
    const age = now - (sample.timestamp ?? now);
    const decayWeight = Math.pow(this.config.temporalDecay, age / 86400000); // Daily decay
    
    const weightedSample = {
      ...sample,
      weight: (sample.weight ?? 1) * decayWeight
    };
    
    this.platt.addSample(weightedSample);
    this.isotonic.addSample(weightedSample);
    this.beta.addSample(weightedSample);
    this.temperature.addSample(weightedSample);
    
    // Store for validation
    if (Math.random() < this.config.validationSplit) {
      this.validationData.push(weightedSample);
    }
  }
  
  /**
   * Fit all calibrators and select best
   */
  fit(): { bestMethod: string; metrics: Record<string, CalibrationMetrics> } {
    // Fit all methods
    this.platt.fit();
    this.isotonic.fit();
    this.beta.fit();
    this.temperature.fit();
    
    // Evaluate on validation data
    const metrics: Record<string, CalibrationMetrics> = {
      platt: this.evaluateMethod('platt'),
      isotonic: this.evaluateMethod('isotonic'),
      beta: this.evaluateMethod('beta'),
      temperature: this.evaluateMethod('temperature')
    };
    
    // Select best method (lowest ECE)
    let bestECE = Infinity;
    for (const [method, metric] of Object.entries(metrics)) {
      if (metric.ece < bestECE) {
        bestECE = metric.ece;
        this.bestMethod = method as typeof this.bestMethod;
      }
    }
    
    return { bestMethod: this.bestMethod, metrics };
  }
  
  /**
   * Evaluate a calibration method
   */
  private evaluateMethod(method: 'platt' | 'isotonic' | 'beta' | 'temperature'): CalibrationMetrics {
    const calibrator = this.getCalibrator(method);
    const samples = this.validationData.length > 0 ? this.validationData : this.getTrainingSamples(method);
    
    if (samples.length < 10) {
      return { ece: 0.5, mce: 1, brier: 0.25, logLoss: 0.693, samples: samples.length, lastUpdated: Date.now() };
    }
    
    // Bin samples for ECE/MCE
    const bins: CalibrationSample[][] = Array.from({ length: this.config.binCount }, () => []);
    
    for (const sample of samples) {
      const prob = calibrator.calibrate(sample.score);
      const binIdx = Math.min(Math.floor(prob * this.config.binCount), this.config.binCount - 1);
      bins[binIdx].push({ ...sample, weight: sample.weight ?? 1 });
    }
    
    // Compute ECE and MCE
    let ece = 0;
    let mce = 0;
    let totalWeight = 0;
    let totalBrier = 0;
    let totalLogLoss = 0;
    
    for (let i = 0; i < this.config.binCount; i++) {
      const binSamples = bins[i];
      if (binSamples.length === 0) continue;
      
      const binWeight = binSamples.reduce((sum, s) => sum + (s.weight ?? 1), 0);
      totalWeight += binWeight;
      
      const binProb = (i + 0.5) / this.config.binCount; // Bin center
      const binAccuracy = binSamples.reduce((sum, s) => sum + (s.weight ?? 1) * s.label, 0) / binWeight;
      
      const gap = Math.abs(binProb - binAccuracy);
      ece += gap * binWeight;
      mce = Math.max(mce, gap);
      
      // Brier and log loss
      for (const sample of binSamples) {
        const prob = calibrator.calibrate(sample.score);
        totalBrier += brierScore(prob, sample.label) * (sample.weight ?? 1);
        totalLogLoss += logLoss(prob, sample.label) * (sample.weight ?? 1);
      }
    }
    
    ece /= totalWeight || 1;
    totalBrier /= totalWeight || 1;
    totalLogLoss /= totalWeight || 1;
    
    return {
      ece,
      mce,
      brier: totalBrier,
      logLoss: totalLogLoss,
      samples: samples.length,
      lastUpdated: Date.now()
    };
  }
  
  /**
   * Get calibrator by method name
   */
  private getCalibrator(method: string): PlattScaling | IsotonicRegression | BetaCalibration | TemperatureScaling {
    switch (method) {
      case 'platt': return this.platt;
      case 'isotonic': return this.isotonic;
      case 'beta': return this.beta;
      case 'temperature': return this.temperature;
      default: return this.platt;
    }
  }
  
  /**
   * Get training samples from a calibrator
   */
  private getTrainingSamples(method: string): CalibrationSample[] {
    // This is a workaround since we can't access private samples
    // In production, store samples separately
    return this.validationData;
  }
  
  /**
   * Calibrate using best method
   */
  calibrate(score: number): CalibratedResult {
    const calibrator = this.getCalibrator(this.bestMethod);
    const probability = calibrator.calibrate(score);
    
    return {
      probability,
      confidence: Math.abs(probability - 0.5) * 2, // Distance from 0.5
      rawScore: score,
      method: this.bestMethod
    };
  }
  
  /**
   * Calibrate using specific method
   */
  calibrateWithMethod(score: number, method: 'platt' | 'isotonic' | 'beta' | 'temperature'): CalibratedResult {
    const calibrator = this.getCalibrator(method);
    const probability = calibrator.calibrate(score);
    
    return {
      probability,
      confidence: Math.abs(probability - 0.5) * 2,
      rawScore: score,
      method
    };
  }
  
  /**
   * Get best method
   */
  getBestMethod(): string {
    return this.bestMethod;
  }
  
  /**
   * Get metrics for all methods
   */
  getMetrics(): Record<string, CalibrationMetrics> {
    return {
      platt: this.evaluateMethod('platt'),
      isotonic: this.evaluateMethod('isotonic'),
      beta: this.evaluateMethod('beta'),
      temperature: this.evaluateMethod('temperature')
    };
  }
  
  /**
   * Clear all samples
   */
  clearSamples(): void {
    this.platt.clearSamples();
    this.isotonic.clearSamples();
    this.beta.clearSamples();
    this.temperature.clearSamples();
    this.validationData = [];
  }
  
  /**
   * Get total sample count
   */
  getSampleCount(): number {
    return Math.max(
      this.platt.getSampleCount(),
      this.isotonic.getSampleCount(),
      this.beta.getSampleCount(),
      this.temperature.getSampleCount()
    );
  }
}

// ==================== PROBABILITY CALIBRATOR (MAIN CLASS) ====================

/**
 * Probability Calibrator
 * 
 * Main class that provides a unified interface for probability calibration.
 * Automatically selects the best calibration method based on data.
 */
export class ProbabilityCalibrator {
  private ensembleCalibrator: EnsembleCalibrator;
  private config: CalibratorConfig;
  private lastFit: number = 0;
  
  constructor(config?: Partial<CalibratorConfig>) {
    this.config = {
      method: 'ensemble',
      minSamples: 50,
      updateInterval: 86400000,
      validationSplit: 0.2,
      temporalDecay: 0.95,
      binCount: 10,
      ...config
    };
    
    this.ensembleCalibrator = new EnsembleCalibrator(this.config);
  }
  
  /**
   * Add training sample
   */
  addSample(score: number, label: number, weight?: number): void {
    this.ensembleCalibrator.addSample({
      score,
      label,
      weight,
      timestamp: Date.now()
    });
  }
  
  /**
   * Add batch of samples
   */
  addSamples(samples: CalibrationSample[]): void {
    for (const sample of samples) {
      this.ensembleCalibrator.addSample(sample);
    }
  }
  
  /**
   * Fit calibrator if needed
   */
  fitIfNeeded(): { fitted: boolean; bestMethod?: string } {
    const now = Date.now();
    const needsFit = 
      now - this.lastFit > this.config.updateInterval ||
      this.ensembleCalibrator.getSampleCount() >= this.config.minSamples;
    
    if (needsFit) {
      const result = this.ensembleCalibrator.fit();
      this.lastFit = now;
      return { fitted: true, bestMethod: result.bestMethod };
    }
    
    return { fitted: false };
  }
  
  /**
   * Force refit
   */
  fit(): { bestMethod: string; metrics: Record<string, CalibrationMetrics> } {
    const result = this.ensembleCalibrator.fit();
    this.lastFit = Date.now();
    return result;
  }
  
  /**
   * Calibrate a score
   */
  calibrate(score: number): CalibratedResult {
    // Auto-fit if needed
    if (this.ensembleCalibrator.getSampleCount() >= this.config.minSamples) {
      this.fitIfNeeded();
    }
    
    return this.ensembleCalibrator.calibrate(score);
  }
  
  /**
   * Calibrate with specific method
   */
  calibrateWithMethod(
    score: number, 
    method: 'platt' | 'isotonic' | 'beta' | 'temperature'
  ): CalibratedResult {
    return this.ensembleCalibrator.calibrateWithMethod(score, method);
  }
  
  /**
   * Get calibration metrics
   */
  getMetrics(): Record<string, CalibrationMetrics> {
    return this.ensembleCalibrator.getMetrics();
  }
  
  /**
   * Get best calibration method
   */
  getBestMethod(): string {
    return this.ensembleCalibrator.getBestMethod();
  }
  
  /**
   * Get sample count
   */
  getSampleCount(): number {
    return this.ensembleCalibrator.getSampleCount();
  }
  
  /**
   * Clear all data
   */
  clear(): void {
    this.ensembleCalibrator.clearSamples();
    this.lastFit = 0;
  }
  
  /**
   * Export calibrator state
   */
  export(): { config: CalibratorConfig; lastFit: number; sampleCount: number } {
    return {
      config: this.config,
      lastFit: this.lastFit,
      sampleCount: this.getSampleCount()
    };
  }
}

// ==================== SINGLETON INSTANCE ====================

let calibratorInstance: ProbabilityCalibrator | null = null;

/**
 * Get probability calibrator instance
 */
export function getProbabilityCalibrator(config?: Partial<CalibratorConfig>): ProbabilityCalibrator {
  if (!calibratorInstance) {
    calibratorInstance = new ProbabilityCalibrator(config);
  }
  return calibratorInstance;
}

/**
 * Reset calibrator instance
 */
export function resetProbabilityCalibrator(): void {
  calibratorInstance = null;
}

// ==================== EXPORTS ====================

export default {
  PlattScaling,
  IsotonicRegression,
  BetaCalibration,
  TemperatureScaling,
  EnsembleCalibrator,
  ProbabilityCalibrator,
  getProbabilityCalibrator,
  resetProbabilityCalibrator
};
