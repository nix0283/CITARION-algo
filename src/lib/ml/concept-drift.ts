/**
 * Concept Drift Detection Module
 * 
 * Implements ADWIN (Adaptive Windowing) and other drift detection algorithms
 * for monitoring model performance and detecting distribution changes in
 * streaming data.
 * 
 * @module lib/ml/concept-drift
 * @see "Early Drift Detection Method" by Baena-García et al.
 * @see "ADWIN: Adaptive Windowing for Concept Drift Detection" by Bifet & Gavaldà
 */

// ==================== TYPE DEFINITIONS ====================

export interface DriftDetectionResult {
  /** Whether drift was detected */
  detected: boolean;
  /** Type of drift detected */
  driftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null;
  /** Confidence level of the detection (0-1) */
  confidence: number;
  /** Timestamp of detection */
  timestamp: number;
  /** Size of the window when drift was detected */
  windowSize: number;
  /** Estimated change point */
  changePoint?: number;
  /** Warning level (0: stable, 1: warning, 2: drift) */
  warningLevel: number;
  /** Additional statistics */
  stats: {
    mean: number;
    variance: number;
    nSamples: number;
  };
}

export interface ADWINConfig {
  /** Confidence parameter (delta) - lower = more sensitive */
  delta: number;
  /** Minimum window size before checking for drift */
  minWindowLength: number;
  /** Maximum window size (for memory management) */
  maxWindowLength: number;
  /** Clock threshold for checking drift */
  clock: number;
}

export interface DriftMonitorStats {
  totalSamples: number;
  driftCount: number;
  warningCount: number;
  lastDriftTime: number | null;
  avgTimeBetweenDrifts: number;
  currentWindowSize: number;
  meanError: number;
  varianceError: number;
}

// ==================== ADWIN IMPLEMENTATION ====================

/**
 * ADWIN (Adaptive Windowing) for Concept Drift Detection
 * 
 * ADWIN automatically adapts its window size to the current concept.
 * When the mean of the window changes significantly, it drops older elements
 * to maintain a consistent concept within the window.
 * 
 * Key features:
 * - Automatically adjusts window size
 * - Provides theoretical guarantees on false positive rate
 * - Works with streaming data
 * - Detects both sudden and gradual drift
 */
export class ADWINDriftDetector {
  private bucketList: Bucket[] = [];
  private config: ADWINConfig;
  private nSamples: number = 0;
  private sum: number = 0;
  private sumSquares: number = 0;
  private lastDriftTime: number = 0;
  private driftHistory: DriftDetectionResult[] = [];

  constructor(config?: Partial<ADWINConfig>) {
    this.config = {
      delta: 0.002,
      minWindowLength: 5,
      maxWindowLength: 10000,
      clock: 32,
      ...config,
    };
  }

  /**
   * Add a new value to the window and check for drift
   * 
   * @param value - New observation (typically error rate or prediction confidence)
   * @returns Drift detection result
   */
  addElement(value: number): DriftDetectionResult {
    this.nSamples++;
    this.sum += value;
    this.sumSquares += value * value;

    // Add to first bucket
    this.bucketList.unshift({
      size: 1,
      sum: value,
      sumSquares: value * value,
    });

    // Compress buckets
    this.compressBuckets();

    // Check for drift periodically
    const shouldCheck = this.nSamples % this.config.clock === 0;

    if (shouldCheck && this.getWidth() >= this.config.minWindowLength) {
      return this.detectDrift();
    }

    // Return stable result
    return this.createResult(false, null, 0);
  }

  /**
   * Detect drift by checking if window should be cut
   */
  private detectDrift(): DriftDetectionResult {
    let driftDetected = false;
    let changePoint = 0;
    let maxDriftConfidence = 0;

    // Check for cut points in the window
    let width = this.getWidth();

    while (width > this.config.minWindowLength) {
      const n0 = Math.floor(width / 2);
      const n1 = width - n0;

      // Split window at midpoint
      const { sum0, sumSquares0, sum1, sumSquares1 } = this.splitWindow(n0);

      // Calculate means
      const mean0 = n0 > 0 ? sum0 / n0 : 0;
      const mean1 = n1 > 0 ? sum1 / n1 : 0;

      // Calculate variance for Hoeffding bound
      const variance = this.getVariance();
      const epsilon = this.calculateEpsilon(n0, n1, variance);

      // Check if difference is significant
      if (Math.abs(mean0 - mean1) > epsilon) {
        driftDetected = true;
        changePoint = n0;
        maxDriftConfidence = Math.min(1, Math.abs(mean0 - mean1) / (2 * epsilon));

        // Drop oldest bucket
        const dropped = this.bucketList.pop();
        if (dropped) {
          this.sum -= dropped.sum;
          this.sumSquares -= dropped.sumSquares;
        }
        width = this.getWidth();
      } else {
        break;
      }
    }

    const result = this.createResult(
      driftDetected,
      driftDetected ? this.classifyDriftType() : null,
      maxDriftConfidence
    );

    if (driftDetected) {
      result.changePoint = changePoint;
      this.lastDriftTime = Date.now();
      this.driftHistory.push(result);
    }

    return result;
  }

  /**
   * Calculate Hoeffding bound for detecting significant change
   */
  private calculateEpsilon(n0: number, n1: number, variance: number): number {
    const delta = this.config.delta;
    const n = n0 + n1;
    const m = 1 / n0 + 1 / n1;

    // Hoeffding bound
    const epsilon = Math.sqrt(2 * m * variance * Math.log(2 / delta)) +
                   (2 / 3) * m * Math.log(2 / delta);

    return epsilon;
  }

  /**
   * Split window at given position and return statistics
   */
  private splitWindow(splitPoint: number): { sum0: number; sumSquares0: number; sum1: number; sumSquares1: number } {
    let sum0 = 0, sumSquares0 = 0, sum1 = 0, sumSquares1 = 0;
    let count = 0;

    for (const bucket of this.bucketList) {
      const bucketEnd = count + bucket.size;
      
      if (count < splitPoint) {
        if (bucketEnd <= splitPoint) {
          // Entire bucket in first half
          sum0 += bucket.sum;
          sumSquares0 += bucket.sumSquares;
        } else {
          // Bucket straddles split point - interpolate
          const fraction = (splitPoint - count) / bucket.size;
          sum0 += bucket.sum * fraction;
          sumSquares0 += bucket.sumSquares * fraction;
          sum1 += bucket.sum * (1 - fraction);
          sumSquares1 += bucket.sumSquares * (1 - fraction);
        }
      } else {
        // Entire bucket in second half
        sum1 += bucket.sum;
        sumSquares1 += bucket.sumSquares;
      }
      
      count += bucket.size;
    }

    return { sum0, sumSquares0, sum1, sumSquares1 };
  }

  /**
   * Compress adjacent buckets of the same size
   */
  private compressBuckets(): void {
    for (let i = 0; i < this.bucketList.length - 1; i++) {
      if (this.bucketList[i].size === this.bucketList[i + 1].size) {
        // Merge buckets
        const merged: Bucket = {
          size: this.bucketList[i].size + this.bucketList[i + 1].size,
          sum: this.bucketList[i].sum + this.bucketList[i + 1].sum,
          sumSquares: this.bucketList[i].sumSquares + this.bucketList[i + 1].sumSquares,
        };
        this.bucketList.splice(i, 2, merged);
        i--; // Check again at same position
      }
    }
  }

  /**
   * Classify the type of drift based on recent history
   */
  private classifyDriftType(): 'sudden' | 'incremental' | 'gradual' | 'recurring' {
    if (this.driftHistory.length < 2) {
      return 'sudden';
    }

    const recentDrifts = this.driftHistory.slice(-5);
    const timeDiff = recentDrifts[recentDrifts.length - 1].timestamp - 
                     recentDrifts[0].timestamp;

    // Short time between drifts suggests sudden change
    if (timeDiff < 10000) {
      return 'sudden';
    }

    // Check for recurring pattern (drifts at regular intervals)
    if (recentDrifts.length >= 3) {
      const intervals = [];
      for (let i = 1; i < recentDrifts.length; i++) {
        intervals.push(recentDrifts[i].timestamp - recentDrifts[i - 1].timestamp);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
      
      if (variance < avgInterval * 0.2) {
        return 'recurring';
      }
    }

    // Default to gradual for moderate frequency drifts
    return 'gradual';
  }

  /**
   * Create detection result
   */
  private createResult(
    detected: boolean,
    driftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null,
    confidence: number
  ): DriftDetectionResult {
    return {
      detected,
      driftType,
      confidence,
      timestamp: Date.now(),
      windowSize: this.getWidth(),
      warningLevel: detected ? 2 : (confidence > 0.5 ? 1 : 0),
      stats: {
        mean: this.getMean(),
        variance: this.getVariance(),
        nSamples: this.nSamples,
      },
    };
  }

  /**
   * Get current window width (number of samples)
   */
  getWidth(): number {
    return this.bucketList.reduce((sum, b) => sum + b.size, 0);
  }

  /**
   * Get current mean of the window
   */
  getMean(): number {
    const width = this.getWidth();
    return width > 0 ? this.sum / width : 0;
  }

  /**
   * Get current variance of the window
   */
  getVariance(): number {
    const width = this.getWidth();
    if (width === 0) return 0;
    const mean = this.getMean();
    return (this.sumSquares / width) - (mean * mean);
  }

  /**
   * Get detection history
   */
  getDriftHistory(): DriftDetectionResult[] {
    return [...this.driftHistory];
  }

  /**
   * Get statistics
   */
  getStats(): DriftMonitorStats {
    const driftTimes = this.driftHistory.map(d => d.timestamp);
    let avgTimeBetweenDrifts = 0;

    if (driftTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < driftTimes.length; i++) {
        intervals.push(driftTimes[i] - driftTimes[i - 1]);
      }
      avgTimeBetweenDrifts = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    }

    return {
      totalSamples: this.nSamples,
      driftCount: this.driftHistory.length,
      warningCount: this.driftHistory.filter(d => d.warningLevel === 1).length,
      lastDriftTime: this.lastDriftTime || null,
      avgTimeBetweenDrifts,
      currentWindowSize: this.getWidth(),
      meanError: this.getMean(),
      varianceError: this.getVariance(),
    };
  }

  /**
   * Reset the detector
   */
  reset(): void {
    this.bucketList = [];
    this.nSamples = 0;
    this.sum = 0;
    this.sumSquares = 0;
    this.lastDriftTime = 0;
    this.driftHistory = [];
  }
}

// ==================== BUCKET INTERFACE ====================

interface Bucket {
  size: number;
  sum: number;
  sumSquares: number;
}

// ==================== DDM IMPLEMENTATION ====================

/**
 * DDM (Drift Detection Method)
 * 
 * Uses binomial distribution to detect changes in error rate.
 * Simpler than ADWIN but effective for sudden drifts.
 */
export class DDMDriftDetector {
  private n: number = 0;
  private p: number = 0;
  private s: number = 0;
  private pMin: number = Infinity;
  private sMin: number = Infinity;
  private warningLevel: number;
  private driftLevel: number;
  private driftHistory: DriftDetectionResult[] = [];

  constructor(warningLevel: number = 2, driftLevel: number = 3) {
    this.warningLevel = warningLevel;
    this.driftLevel = driftLevel;
  }

  /**
   * Add a new error value (0 or 1) and check for drift
   */
  addElement(error: number): DriftDetectionResult {
    this.n++;

    // Update mean and std using incremental formula
    this.p += (error - this.p) / this.n;
    this.s += (Math.abs(error - this.p) - this.s) / this.n;

    const ps = this.p + this.s;
    const psMin = this.pMin + this.sMin;

    // Track minimum
    if (ps < psMin) {
      this.pMin = this.p;
      this.sMin = this.s;
    }

    // Calculate threshold
    const threshold = ps - psMin;

    // Determine status
    let detected = false;
    let warning = 0;
    let driftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null = null;

    if (threshold > this.driftLevel * Math.sqrt(this.sMin / this.n)) {
      detected = true;
      warning = 2;
      driftType = 'sudden';
      this.driftHistory.push(this.createResult(true, driftType, threshold / this.driftLevel));
    } else if (threshold > this.warningLevel * Math.sqrt(this.sMin / this.n)) {
      warning = 1;
    }

    return this.createResult(detected, driftType, threshold / this.driftLevel);
  }

  /**
   * Create result
   */
  private createResult(
    detected: boolean,
    driftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null,
    confidence: number
  ): DriftDetectionResult {
    return {
      detected,
      driftType,
      confidence: Math.min(1, confidence),
      timestamp: Date.now(),
      windowSize: this.n,
      warningLevel: detected ? 2 : (confidence > 0.5 ? 1 : 0),
      stats: {
        mean: this.p,
        variance: this.s * this.s,
        nSamples: this.n,
      },
    };
  }

  /**
   * Reset the detector
   */
  reset(): void {
    this.n = 0;
    this.p = 0;
    this.s = 0;
    this.pMin = Infinity;
    this.sMin = Infinity;
    this.driftHistory = [];
  }

  /**
   * Get detection history
   */
  getDriftHistory(): DriftDetectionResult[] {
    return [...this.driftHistory];
  }
}

// ==================== EDDM IMPLEMENTATION ====================

/**
 * EDDM (Early Drift Detection Method)
 * 
 * Detects drift by monitoring the distance between classification errors.
 * More sensitive to gradual drift than DDM.
 */
export class EDDMDriftDetector {
  private n: number = 0;
  private lastErrorIndex: number = 0;
  private distance: number = 0;
  private meanDistance: number = 0;
  private stdDistance: number = 0;
  private maxMeanPlus2Std: number = 0;
  private warningLevel: number;
  private driftLevel: number;
  private driftHistory: DriftDetectionResult[] = [];

  constructor(warningLevel: number = 0.95, driftLevel: number = 0.9) {
    this.warningLevel = warningLevel;
    this.driftLevel = driftLevel;
  }

  /**
   * Add a new error value (0 or 1) and check for drift
   */
  addElement(error: number): DriftDetectionResult {
    this.n++;

    if (error === 1) {
      // Calculate distance from last error
      this.distance = this.n - this.lastErrorIndex;
      this.lastErrorIndex = this.n;

      // Update mean and std incrementally
      const delta = this.distance - this.meanDistance;
      this.meanDistance += delta / this.n;
      this.stdDistance += delta * (this.distance - this.meanDistance);

      if (this.n > 1) {
        this.stdDistance = Math.sqrt(this.stdDistance / (this.n - 1));
      }

      // Track maximum
      const currentMeanPlus2Std = this.meanDistance + 2 * this.stdDistance;
      if (currentMeanPlus2Std > this.maxMeanPlus2Std) {
        this.maxMeanPlus2Std = currentMeanPlus2Std;
      }

      // Check for drift
      const ratio = currentMeanPlus2Std / (this.maxMeanPlus2Std || 1);

      let detected = false;
      let warning = 0;
      let driftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null = null;

      if (ratio < this.driftLevel) {
        detected = true;
        warning = 2;
        driftType = 'gradual';
        this.driftHistory.push(this.createResult(true, driftType, 1 - ratio));
        this.reset();
      } else if (ratio < this.warningLevel) {
        warning = 1;
      }

      return this.createResult(detected, driftType, 1 - ratio);
    }

    return this.createResult(false, null, 0);
  }

  /**
   * Create result
   */
  private createResult(
    detected: boolean,
    driftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null,
    confidence: number
  ): DriftDetectionResult {
    return {
      detected,
      driftType,
      confidence: Math.min(1, Math.max(0, confidence)),
      timestamp: Date.now(),
      windowSize: this.n,
      warningLevel: detected ? 2 : (confidence > 0.5 ? 1 : 0),
      stats: {
        mean: this.meanDistance,
        variance: this.stdDistance * this.stdDistance,
        nSamples: this.n,
      },
    };
  }

  /**
   * Reset the detector
   */
  reset(): void {
    this.n = 0;
    this.lastErrorIndex = 0;
    this.distance = 0;
    this.meanDistance = 0;
    this.stdDistance = 0;
    this.maxMeanPlus2Std = 0;
  }

  /**
   * Get detection history
   */
  getDriftHistory(): DriftDetectionResult[] {
    return [...this.driftHistory];
  }
}

// ==================== PAGE-HINKLEY IMPLEMENTATION ====================

/**
 * Page-Hinkley Test for Drift Detection
 * 
 * A sequential analysis test for detecting mean changes.
 * Good for detecting sudden changes quickly.
 */
export class PageHinkleyDriftDetector {
  private sum: number = 0;
  private sumMin: number = 0;
  private n: number = 0;
  private xMean: number = 0;
  private delta: number;
  private lambda: number;
  private alpha: number;
  private driftHistory: DriftDetectionResult[] = [];

  constructor(delta: number = 0.005, lambda: number = 50, alpha: number = 0.99) {
    this.delta = delta;
    this.lambda = lambda;
    this.alpha = alpha;
  }

  /**
   * Add a new value and check for drift
   */
  addElement(value: number): DriftDetectionResult {
    this.n++;
    this.xMean = this.xMean + (value - this.xMean) / this.n;
    this.sum += value - this.xMean - this.delta;
    this.sumMin = Math.min(this.sumMin, this.sum);

    const testStatistic = this.sum - this.sumMin;
    const detected = testStatistic > this.lambda;

    if (detected) {
      this.driftHistory.push(this.createResult(true, 'sudden', testStatistic / this.lambda));
      this.reset();
    }

    return this.createResult(detected, detected ? 'sudden' : null, testStatistic / this.lambda);
  }

  /**
   * Create result
   */
  private createResult(
    detected: boolean,
    driftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null,
    confidence: number
  ): DriftDetectionResult {
    return {
      detected,
      driftType,
      confidence: Math.min(1, Math.max(0, confidence)),
      timestamp: Date.now(),
      windowSize: this.n,
      warningLevel: detected ? 2 : (confidence > 0.5 ? 1 : 0),
      stats: {
        mean: this.xMean,
        variance: 0,
        nSamples: this.n,
      },
    };
  }

  /**
   * Reset the detector
   */
  reset(): void {
    this.sum = 0;
    this.sumMin = 0;
    this.n = 0;
    this.xMean = 0;
  }

  /**
   * Get detection history
   */
  getDriftHistory(): DriftDetectionResult[] {
    return [...this.driftHistory];
  }
}

// ==================== ENSEMBLE DRIFT DETECTOR ====================

/**
 * Ensemble Drift Detector
 * 
 * Combines multiple drift detection methods for more robust detection.
 * Uses voting to determine if drift has occurred.
 */
export class EnsembleDriftDetector {
  private detectors: Map<string, ADWINDriftDetector | DDMDriftDetector | EDDMDriftDetector | PageHinkleyDriftDetector>;
  private weights: Map<string, number>;
  private votingThreshold: number;
  private driftHistory: DriftDetectionResult[] = [];

  constructor(
    config?: Partial<{
      useADWIN: boolean;
      useDDM: boolean;
      useEDDM: boolean;
      usePageHinkley: boolean;
      votingThreshold: number;
      weights: Record<string, number>;
    }>
  ) {
    const cfg = {
      useADWIN: true,
      useDDM: true,
      useEDDM: false,
      usePageHinkley: false,
      votingThreshold: 0.5,
      ...config,
    };

    this.detectors = new Map();
    this.weights = new Map();
    this.votingThreshold = cfg.votingThreshold;

    if (cfg.useADWIN) {
      this.detectors.set('ADWIN', new ADWINDriftDetector());
      this.weights.set('ADWIN', cfg.weights?.ADWIN || 0.4);
    }
    if (cfg.useDDM) {
      this.detectors.set('DDM', new DDMDriftDetector());
      this.weights.set('DDM', cfg.weights?.DDM || 0.3);
    }
    if (cfg.useEDDM) {
      this.detectors.set('EDDM', new EDDMDriftDetector());
      this.weights.set('EDDM', cfg.weights?.EDDM || 0.2);
    }
    if (cfg.usePageHinkley) {
      this.detectors.set('PageHinkley', new PageHinkleyDriftDetector());
      this.weights.set('PageHinkley', cfg.weights?.PageHinkley || 0.1);
    }
  }

  /**
   * Add element to all detectors and combine results
   */
  addElement(value: number): DriftDetectionResult {
    const results: DriftDetectionResult[] = [];
    let totalWeight = 0;
    let driftWeight = 0;
    let maxConfidence = 0;
    let detectedDriftType: 'sudden' | 'incremental' | 'gradual' | 'recurring' | null = null;

    for (const [name, detector] of this.detectors) {
      const result = detector.addElement(value);
      results.push(result);

      const weight = this.weights.get(name) || 0;
      totalWeight += weight;

      if (result.detected) {
        driftWeight += weight;
        if (result.confidence > maxConfidence) {
          maxConfidence = result.confidence;
          detectedDriftType = result.driftType;
        }
      }
    }

    const driftRatio = driftWeight / totalWeight;
    const detected = driftRatio >= this.votingThreshold;

    const result: DriftDetectionResult = {
      detected,
      driftType: detected ? detectedDriftType : null,
      confidence: maxConfidence,
      timestamp: Date.now(),
      windowSize: results.reduce((sum, r) => sum + r.windowSize, 0) / results.length,
      warningLevel: detected ? 2 : (driftRatio > this.votingThreshold * 0.5 ? 1 : 0),
      stats: {
        mean: results.reduce((sum, r) => sum + r.stats.mean, 0) / results.length,
        variance: results.reduce((sum, r) => sum + r.stats.variance, 0) / results.length,
        nSamples: results.reduce((sum, r) => sum + r.stats.nSamples, 0) / results.length,
      },
    };

    if (detected) {
      this.driftHistory.push(result);
    }

    return result;
  }

  /**
   * Get detection history
   */
  getDriftHistory(): DriftDetectionResult[] {
    return [...this.driftHistory];
  }

  /**
   * Reset all detectors
   */
  reset(): void {
    for (const detector of this.detectors.values()) {
      detector.reset();
    }
    this.driftHistory = [];
  }

  /**
   * Get individual detector results
   */
  getDetectorResults(value: number): Map<string, DriftDetectionResult> {
    const results = new Map<string, DriftDetectionResult>();
    for (const [name, detector] of this.detectors) {
      results.set(name, detector.addElement(value));
    }
    return results;
  }
}

// ==================== DRIFT MONITOR FOR CLASSIFIER ====================

/**
 * Drift Monitor for ML Classifiers
 * 
 * Monitors classifier predictions and labels for concept drift.
 * Integrates with the Lawrence Classifier and other ML models.
 */
export class ClassifierDriftMonitor {
  private errorDetector: EnsembleDriftDetector;
  private featureDetectors: Map<string, ADWINDriftDetector> = new Map();
  private predictionBuffer: Array<{ prediction: number; label?: number; features: number[] }> = [];
  private bufferSize: number;
  private driftCallbacks: Array<(result: DriftDetectionResult) => void> = [];

  constructor(
    bufferSize: number = 1000,
    detectorConfig?: ConstructorParameters<typeof EnsembleDriftDetector>[0]
  ) {
    this.bufferSize = bufferSize;
    this.errorDetector = new EnsembleDriftDetector(detectorConfig);
  }

  /**
   * Add a prediction and optionally a label
   */
  addPrediction(
    prediction: number,
    features: number[],
    label?: number
  ): DriftDetectionResult | null {
    // Add to buffer
    this.predictionBuffer.push({ prediction, label, features });
    if (this.predictionBuffer.length > this.bufferSize) {
      this.predictionBuffer.shift();
    }

    // Monitor feature drift
    this.monitorFeatureDrift(features);

    // If we have a label, monitor error drift
    if (label !== undefined) {
      const error = Math.abs(prediction - label);
      const result = this.errorDetector.addElement(error);

      if (result.detected) {
        this.notifyDriftCallbacks(result);
      }

      return result;
    }

    return null;
  }

  /**
   * Monitor individual feature distributions for drift
   */
  private monitorFeatureDrift(features: number[]): void {
    features.forEach((value, index) => {
      const key = `feature_${index}`;
      
      if (!this.featureDetectors.has(key)) {
        this.featureDetectors.set(key, new ADWINDriftDetector({ delta: 0.01 }));
      }

      const detector = this.featureDetectors.get(key)!;
      const result = detector.addElement(value);

      if (result.detected) {
        // Feature drift detected - could trigger model retraining
        this.notifyDriftCallbacks({
          ...result,
          driftType: 'incremental',
        });
      }
    });
  }

  /**
   * Register callback for drift notifications
   */
  onDrift(callback: (result: DriftDetectionResult) => void): void {
    this.driftCallbacks.push(callback);
  }

  /**
   * Notify all registered callbacks
   */
  private notifyDriftCallbacks(result: DriftDetectionResult): void {
    for (const callback of this.driftCallbacks) {
      try {
        callback(result);
      } catch (e) {
        console.error('Drift callback error:', e);
      }
    }
  }

  /**
   * Get current drift status
   */
  getDriftStatus(): {
    errorDrift: boolean;
    featureDriftCount: number;
    driftedFeatures: string[];
    recentDrifts: DriftDetectionResult[];
  } {
    const driftedFeatures: string[] = [];
    
    for (const [key, detector] of this.featureDetectors) {
      const history = detector.getDriftHistory();
      if (history.length > 0 && Date.now() - history[history.length - 1].timestamp < 60000) {
        driftedFeatures.push(key);
      }
    }

    const errorHistory = this.errorDetector.getDriftHistory();
    const recentDrifts = errorHistory.filter(
      d => Date.now() - d.timestamp < 300000 // Last 5 minutes
    );

    return {
      errorDrift: recentDrifts.length > 0,
      featureDriftCount: driftedFeatures.length,
      driftedFeatures,
      recentDrifts,
    };
  }

  /**
   * Reset all monitors
   */
  reset(): void {
    this.errorDetector.reset();
    this.featureDetectors.clear();
    this.predictionBuffer = [];
  }
}

// ==================== EXPORTS ====================

export {
  ADWINDriftDetector,
  DDMDriftDetector,
  EDDMDriftDetector,
  PageHinkleyDriftDetector,
  EnsembleDriftDetector,
  ClassifierDriftMonitor,
};

export default {
  ADWINDriftDetector,
  DDMDriftDetector,
  EDDMDriftDetector,
  PageHinkleyDriftDetector,
  EnsembleDriftDetector,
  ClassifierDriftMonitor,
};
