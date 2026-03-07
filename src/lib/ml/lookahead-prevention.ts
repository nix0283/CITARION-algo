/**
 * ML Look-Ahead Bias Prevention Module
 * 
 * Production-ready utilities to prevent look-ahead bias in ML training.
 * 
 * Key features:
 * - TimeSeriesSplit for proper train/test splitting
 * - Purge and embargo periods
 * - Feature leakage detection
 * - Temporal validation
 * 
 * CIT-030: Look-ahead bias prevention for ML training
 */

// ==================== TYPES ====================

export interface TimeSeriesSplitConfig {
  /** Number of splits */
  nSplits: number;
  
  /** Size of test set in each split (as fraction or absolute count) */
  testSize: number | number;
  
  /** Gap between train and test (embargo) */
  gap: number;
  
  /** Purge period - remove recent data from train to prevent leakage */
  purgePeriod: number;
  
  /** Enable expanding window (vs rolling) */
  expandingWindow: boolean;
}

export interface TimeSeriesSplit {
  trainIndices: number[];
  testIndices: number[];
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
}

export interface FeatureLeakageReport {
  hasLeakage: boolean;
  leakageFeatures: string[];
  recommendations: string[];
  correlationMatrix?: Map<string, Map<string, number>>;
}

export interface TemporalFeature {
  name: string;
  usesFutureData: boolean;
  description: string;
  recommendation: string;
}

// ==================== TIME SERIES SPLIT ====================

/**
 * Create TimeSeriesSplit iterator for proper temporal validation
 * 
 * Unlike random splits, this respects temporal ordering:
 * - Training data always comes before test data
 * - Gap (embargo) prevents leakage between train and test
 * - Purge removes recent training data that might leak future info
 */
export class TimeSeriesSplitter {
  private config: TimeSeriesSplitConfig;

  constructor(config: Partial<TimeSeriesSplitConfig> = {}) {
    this.config = {
      nSplits: config.nSplits ?? 5,
      testSize: config.testSize ?? 0.2,
      gap: config.gap ?? 0,
      purgePeriod: config.purgePeriod ?? 0,
      expandingWindow: config.expandingWindow ?? false,
    };
  }

  /**
   * Split data into train/test sets respecting temporal order
   */
  *split(dataLength: number): Generator<TimeSeriesSplit> {
    const { nSplits, testSize, gap, purgePeriod, expandingWindow } = this.config;

    // Calculate test size in samples
    const testSamples = typeof testSize === 'number' && testSize < 1
      ? Math.floor(dataLength * testSize)
      : testSize as number;

    // Calculate step size for rolling window
    const stepSize = expandingWindow
      ? testSamples
      : Math.floor((dataLength - testSamples - gap) / (nSplits - 1));

    for (let i = 0; i < nSplits; i++) {
      // Test set: from end backwards
      const testEnd = dataLength - i * stepSize;
      const testStart = testEnd - testSamples;

      // Train set: before test, with gap and purge
      let trainEnd = testStart - gap;
      let trainStart = expandingWindow ? 0 : trainEnd - (dataLength - testSamples - gap);

      // Apply purge - remove most recent training data
      if (purgePeriod > 0) {
        trainEnd -= purgePeriod;
      }

      // Ensure valid indices
      if (trainStart < 0 || trainEnd <= trainStart || testStart < trainEnd) {
        continue;
      }

      const trainIndices = Array.from(
        { length: trainEnd - trainStart },
        (_, j) => trainStart + j
      );
      const testIndices = Array.from(
        { length: testEnd - testStart },
        (_, j) => testStart + j
      );

      yield {
        trainIndices,
        testIndices,
        trainStart,
        trainEnd,
        testStart,
        testEnd,
      };
    }
  }

  /**
   * Get all splits as array
   */
  getSplits(dataLength: number): TimeSeriesSplit[] {
    return Array.from(this.split(dataLength));
  }

  /**
   * Validate that no look-ahead bias exists in splits
   */
  validate(splits: TimeSeriesSplit[]): boolean {
    for (const split of splits) {
      // Check train data comes before test
      if (split.trainEnd >= split.testStart) {
        console.error(
          `[TimeSeriesSplit] Train data overlaps test: trainEnd=${split.trainEnd}, testStart=${split.testStart}`
        );
        return false;
      }

      // Check all train indices are before test
      const maxTrain = Math.max(...split.trainIndices);
      const minTest = Math.min(...split.testIndices);
      if (maxTrain >= minTest) {
        console.error(
          `[TimeSeriesSplit] Train indices overlap test: maxTrain=${maxTrain}, minTest=${minTest}`
        );
        return false;
      }
    }
    return true;
  }
}

// ==================== FEATURE LEAKAGE DETECTOR ====================

/**
 * Detect potential feature leakage in ML features
 */
export class FeatureLeakageDetector {
  private knownFutureFeatures: Set<string>;
  private suspiciousFeaturePatterns: RegExp[];

  constructor() {
    // Features that typically use future data
    this.knownFutureFeatures = new Set([
      'future_return',
      'future_price',
      'next_close',
      'next_high',
      'next_low',
      'next_return',
      'future_volatility',
      'label',
      'target',
      'outcome',
    ]);

    // Patterns that suggest future data usage
    this.suspiciousFeaturePatterns = [
      /next_/i,
      /future_/i,
      /forward_/i,
      /ahead_/i,
      /coming_/i,
      /subsequent_/i,
      /following_/i,
      /lead_/i,
    ];
  }

  /**
   * Check if feature name suggests future data usage
   */
  isFutureFeature(featureName: string): boolean {
    const lowerName = featureName.toLowerCase();
    
    // Check exact matches
    if (this.knownFutureFeatures.has(lowerName)) {
      return true;
    }

    // Check patterns
    for (const pattern of this.suspiciousFeaturePatterns) {
      if (pattern.test(featureName)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Scan features for potential leakage
   */
  scanFeatures(featureNames: string[]): FeatureLeakageReport {
    const leakageFeatures: string[] = [];
    const recommendations: string[] = [];

    for (const name of featureNames) {
      if (this.isFutureFeature(name)) {
        leakageFeatures.push(name);
        recommendations.push(
          `Remove or transform feature '${name}' - it appears to use future data`
        );
      }
    }

    return {
      hasLeakage: leakageFeatures.length > 0,
      leakageFeatures,
      recommendations,
    };
  }

  /**
   * Calculate correlation between features and target at different time lags
   * High correlation at negative lags suggests look-ahead
   */
  analyzeFeatureTargetCorrelation(
    features: Record<string, number[]>,
    target: number[],
    maxLag: number = 10
  ): Map<string, Map<number, number>> {
    const correlations = new Map<string, Map<number, number>>();

    for (const [featureName, featureValues] of Object.entries(features)) {
      const lagCorrelations = new Map<number, number>();

      for (let lag = -maxLag; lag <= maxLag; lag++) {
        const correlation = this.calculateLaggedCorrelation(
          featureValues,
          target,
          lag
        );
        lagCorrelations.set(lag, correlation);
      }

      correlations.set(featureName, lagCorrelations);
    }

    return correlations;
  }

  /**
   * Calculate correlation at specific lag
   */
  private calculateLaggedCorrelation(
    x: number[],
    y: number[],
    lag: number
  ): number {
    let xSlice: number[];
    let ySlice: number[];

    if (lag >= 0) {
      xSlice = x.slice(0, x.length - lag);
      ySlice = y.slice(lag);
    } else {
      xSlice = x.slice(-lag);
      ySlice = y.slice(0, y.length + lag);
    }

    if (xSlice.length === 0) return 0;

    return this.pearsonCorrelation(xSlice, ySlice);
  }

  /**
   * Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n !== y.length || n === 0) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Detect leakage through permutation importance
   * If permuting a feature has no effect, it might be leaking
   */
  detectLeakageThroughPermutation(
    model: { predict: (features: number[][]) => number[] },
    features: number[][],
    labels: number[],
    nIterations: number = 10
  ): Map<number, number> {
    const basePredictions = model.predict(features);
    const baseAccuracy = this.calculateAccuracy(basePredictions, labels);

    const importanceMap = new Map<number, number>();
    const nFeatures = features[0].length;

    for (let featureIdx = 0; featureIdx < nFeatures; featureIdx++) {
      let totalImportance = 0;

      for (let iter = 0; iter < nIterations; iter++) {
        // Permute this feature
        const permutedFeatures = features.map(row => [...row]);
        const permutedValues = permutedFeatures.map(row => row[featureIdx]);
        this.shuffleArray(permutedValues);
        permutedFeatures.forEach((row, i) => {
          row[featureIdx] = permutedValues[i];
        });

        const permutedPredictions = model.predict(permutedFeatures);
        const permutedAccuracy = this.calculateAccuracy(permutedPredictions, labels);

        // Importance = decrease in accuracy
        totalImportance += baseAccuracy - permutedAccuracy;
      }

      importanceMap.set(featureIdx, totalImportance / nIterations);
    }

    return importanceMap;
  }

  /**
   * Calculate accuracy
   */
  private calculateAccuracy(predictions: number[], labels: number[]): number {
    let correct = 0;
    for (let i = 0; i < predictions.length; i++) {
      if (Math.round(predictions[i]) === labels[i]) {
        correct++;
      }
    }
    return correct / predictions.length;
  }

  /**
   * Shuffle array in place
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

// ==================== TEMPORAL FEATURE VALIDATOR ====================

/**
 * Validate that features don't use future data
 */
export class TemporalFeatureValidator {
  private commonTemporalFeatures: TemporalFeature[] = [
    {
      name: 'returns',
      usesFutureData: false,
      description: 'Price returns - safe if calculated from past prices',
      recommendation: 'Use returns calculated from previous bar only',
    },
    {
      name: 'volatility',
      usesFutureData: false,
      description: 'Historical volatility - safe if using past data',
      recommendation: 'Calculate using only historical bars within the window',
    },
    {
      name: 'volume_profile',
      usesFutureData: false,
      description: 'Volume profile - safe if historical',
      recommendation: 'Ensure volume profile doesn\'t include current bar',
    },
    {
      name: 'vwap',
      usesFutureData: false,
      description: 'Volume-weighted average price - careful with session VWAP',
      recommendation: 'Rolling VWAP is safe; session VWAP may leak intraday',
    },
    {
      name: 'orderbook_imbalance',
      usesFutureData: false,
      description: 'Current orderbook state - safe as it\'s current state',
      recommendation: 'Safe for real-time, but record timestamp for backtesting',
    },
    {
      name: 'funding_rate',
      usesFutureData: false,
      description: 'Current funding rate - safe',
      recommendation: 'Use current funding rate, not predicted',
    },
    {
      name: 'liquidation_levels',
      usesFutureData: false,
      description: 'Estimated liquidation levels - safe if calculated',
      recommendation: 'Calculate from current positions and leverage',
    },
  ];

  /**
   * Get temporal feature safety info
   */
  getFeatureInfo(featureName: string): TemporalFeature | null {
    const normalized = featureName.toLowerCase().replace(/[^a-z_]/g, '');
    
    return this.commonTemporalFeatures.find(f => 
      normalized.includes(f.name)
    ) || null;
  }

  /**
   * Validate feature construction
   */
  validateFeatureConstruction(
    featureName: string,
    featureCalculation: string
  ): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check for future data references
    const futurePatterns = [
      /\[\s*i\s*\+\s*[1-9]/,  // Array access at i+1, i+2, etc.
      /\[\s*index\s*\+\s*[1-9]/,
      /\.future\b/i,
      /next\b/i,
      /shift\s*\(\s*-[1-9]/,  // Negative shift (forward in time)
    ];

    for (const pattern of futurePatterns) {
      if (pattern.test(featureCalculation)) {
        warnings.push(
          `Potential future data usage detected: pattern "${pattern.source}" found`
        );
      }
    }

    return {
      isValid: warnings.length === 0,
      warnings,
    };
  }
}

// ==================== PURGE AND EMBARGO ====================

/**
 * Apply purge and embargo to prevent label leakage
 * 
 * Purge: Remove samples near label boundaries
 * Embargo: Add gap between train and test sets
 */
export class PurgeAndEmbargo {
  /**
   * Apply purge to remove samples near label transitions
   * 
   * @param labels Array of labels
   * @param purgeCount Number of samples to remove after each label change
   * @returns Indices to keep
   */
  static applyPurge(
    labels: number[],
    purgeCount: number = 5
  ): number[] {
    const keepIndices: number[] = [];

    for (let i = 0; i < labels.length; i++) {
      // Check if this sample is within purge window after a label change
      let shouldPurge = false;

      for (let j = 1; j <= purgeCount && i - j >= 0; j++) {
        if (labels[i - j] !== labels[i]) {
          shouldPurge = true;
          break;
        }
      }

      if (!shouldPurge) {
        keepIndices.push(i);
      }
    }

    return keepIndices;
  }

  /**
   * Apply embargo between train and test sets
   * 
   * @param trainEnd Last index of training set
   * @param testStart First index of test set
   * @param embargoDays Number of days to embargo
   * @param timestamps Array of timestamps
   * @returns Adjusted train end index
   */
  static applyEmbargo(
    trainEnd: number,
    testStart: number,
    embargoDays: number,
    timestamps: number[]
  ): number {
    if (embargoDays === 0) return trainEnd;

    const embargoMs = embargoDays * 24 * 60 * 60 * 1000;
    const testStartTime = timestamps[testStart];

    // Find new train end that is embargoDays before test start
    let newTrainEnd = trainEnd;
    for (let i = trainEnd; i >= 0; i--) {
      if (testStartTime - timestamps[i] >= embargoMs) {
        newTrainEnd = i;
        break;
      }
    }

    return newTrainEnd;
  }

  /**
   * Create purged and embargoed train/test split
   */
  static createSafeSplit(
    labels: number[],
    timestamps: number[],
    testSize: number = 0.2,
    purgeCount: number = 5,
    embargoDays: number = 5
  ): { trainIndices: number[]; testIndices: number[] } {
    const testStart = Math.floor(labels.length * (1 - testSize));

    // Apply embargo
    const embargoedTrainEnd = PurgeAndEmbargo.applyEmbargo(
      testStart - 1,
      testStart,
      embargoDays,
      timestamps
    );

    // Get initial train indices
    let trainIndices = Array.from(
      { length: embargoedTrainEnd + 1 },
      (_, i) => i
    );

    // Apply purge to train indices
    const trainLabels = trainIndices.map(i => labels[i]);
    const keepInTrain = PurgeAndEmbargo.applyPurge(trainLabels, purgeCount);
    trainIndices = keepInTrain.map(i => trainIndices[i]);

    // Test indices
    const testIndices = Array.from(
      { length: labels.length - testStart },
      (_, i) => testStart + i
    );

    return { trainIndices, testIndices };
  }
}

// ==================== EXPORTS ====================

export {
  TimeSeriesSplitter,
  FeatureLeakageDetector,
  TemporalFeatureValidator,
  PurgeAndEmbargo,
};
