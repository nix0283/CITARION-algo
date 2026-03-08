/**
 * ML-Adaptive SuperTrend Indicator with K-Means Volatility Clustering
 *
 * This indicator enhances the traditional SuperTrend by using machine learning
 * (K-Means clustering) to adaptively adjust the multiplier factor based on
 * volatility regimes.
 *
 * The indicator clusters ATR values into LOW, MEDIUM, and HIGH volatility
 * regimes and adjusts the factor accordingly:
 * - LOW volatility → higher factor (4.0) - wider bands, fewer false signals
 * - MEDIUM volatility → medium factor (3.0) - balanced approach
 * - HIGH volatility → lower factor (2.0) - tighter bands, faster reaction
 */

// ==================== TYPES ====================

/**
 * Candle data structure for the indicator
 */
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Configuration for the ML-Adaptive SuperTrend indicator
 */
export interface MLAdaptiveSuperTrendConfig {
  /** ATR calculation period (default: 10) */
  atrLength: number;
  /** Base multiplier factor (default: 3) */
  baseFactor: number;
  /** Number of candles to use for K-Means training (default: 100) */
  trainingPeriod: number;
  /** Percentile thresholds for initializing cluster centroids */
  volatilityPercentiles: {
    /** High volatility percentile (default: 0.75) */
    high: number;
    /** Medium volatility percentile (default: 0.50) */
    medium: number;
    /** Low volatility percentile (default: 0.25) */
    low: number;
  };
}

/**
 * Result from the ML-Adaptive SuperTrend calculation
 */
export interface MLAdaptiveSuperTrendResult {
  /** SuperTrend value */
  superTrend: number;
  /** Direction: 1 = uptrend, -1 = downtrend */
  direction: -1 | 1;
  /** Current volatility cluster */
  volatilityCluster: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Centroid value of the assigned cluster */
  clusterCentroid: number;
  /** Adaptive factor used for this candle */
  factor: number;
  /** Trading signal */
  signal: 'BUY' | 'SELL' | 'HOLD';
}

/**
 * Internal structure for K-Means clustering results
 */
interface KMeansResult {
  /** Cluster assignments for each data point */
  assignments: number[];
  /** Final centroids for each cluster */
  centroids: number[];
  /** Number of iterations performed */
  iterations: number;
  /** Whether the algorithm converged */
  converged: boolean;
}

/**
 * Volatility cluster information
 */
interface VolatilityCluster {
  label: 'LOW' | 'MEDIUM' | 'HIGH';
  centroid: number;
  factor: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate True Range for a single candle
 */
function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );
}

/**
 * Calculate ATR (Average True Range) using Wilder's smoothing
 */
function calculateATR(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length < period) return result;

  // Calculate TR values
  const trValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trValues.push(candles[i].high - candles[i].low);
    } else {
      trValues.push(
        trueRange(
          candles[i].high,
          candles[i].low,
          candles[i - 1].close
        )
      );
    }
  }

  // First ATR is SMA of TR
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trValues[i];
  }
  result[period - 1] = sum / period;

  // Subsequent ATR values use Wilder's smoothing
  for (let i = period; i < trValues.length; i++) {
    const prevATR = result[i - 1] as number;
    result[i] = (prevATR * (period - 1) + trValues[i]) / period;
  }

  return result;
}

/**
 * Calculate percentile value from a sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = Math.min(
    Math.floor(p * (sortedValues.length - 1)),
    sortedValues.length - 1
  );
  return sortedValues[index];
}

/**
 * Calculate Euclidean distance between two points
 */
function distance(a: number, b: number): number {
  return Math.abs(a - b);
}

/**
 * K-Means clustering implementation for 1D data (ATR values)
 * Clusters data into k=3 groups representing LOW, MEDIUM, and HIGH volatility
 */
function kMeans(
  data: number[],
  initialCentroids: number[],
  maxIterations: number = 50,
  tolerance: number = 1e-6
): KMeansResult {
  if (data.length === 0) {
    return {
      assignments: [],
      centroids: initialCentroids,
      iterations: 0,
      converged: true,
    };
  }

  let centroids = [...initialCentroids];
  let assignments = new Array(data.length).fill(0);
  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;

    // Assignment step: assign each point to nearest centroid
    const newAssignments = data.map((value) => {
      let minDist = Infinity;
      let cluster = 0;
      for (let i = 0; i < centroids.length; i++) {
        const dist = distance(value, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          cluster = i;
        }
      }
      return cluster;
    });

    // Check if assignments changed
    const assignmentsChanged = !newAssignments.every(
      (a, i) => a === assignments[i]
    );
    assignments = newAssignments;

    // Update step: recalculate centroids
    const newCentroids: number[] = [];
    for (let i = 0; i < centroids.length; i++) {
      const clusterPoints = data.filter((_, idx) => assignments[idx] === i);
      if (clusterPoints.length > 0) {
        newCentroids.push(
          clusterPoints.reduce((sum, val) => sum + val, 0) / clusterPoints.length
        );
      } else {
        // Keep old centroid if cluster is empty
        newCentroids.push(centroids[i]);
      }
    }

    // Check for convergence
    const centroidShift = centroids.reduce(
      (sum, c, i) => sum + Math.abs(c - newCentroids[i]),
      0
    );

    centroids = newCentroids;

    if (centroidShift < tolerance && !assignmentsChanged) {
      converged = true;
      break;
    }
  }

  return {
    assignments,
    centroids,
    iterations,
    converged,
  };
}

/**
 * Map cluster indices to volatility labels and factors
 */
function mapClustersToVolatility(
  centroids: number[]
): VolatilityCluster[] {
  // Sort centroids to determine which cluster corresponds to which volatility level
  const sortedIndices = centroids
    .map((c, i) => ({ centroid: c, index: i }))
    .sort((a, b) => a.centroid - b.centroid);

  // Create mapping: LOW (smallest centroid), MEDIUM, HIGH (largest centroid)
  const clusterMapping: VolatilityCluster[] = new Array(3);

  // LOW volatility - smallest ATR values - higher factor (wider bands)
  clusterMapping[sortedIndices[0].index] = {
    label: 'LOW',
    centroid: sortedIndices[0].centroid,
    factor: 4.0,
  };

  // MEDIUM volatility - medium ATR values - medium factor
  clusterMapping[sortedIndices[1].index] = {
    label: 'MEDIUM',
    centroid: sortedIndices[1].centroid,
    factor: 3.0,
  };

  // HIGH volatility - largest ATR values - lower factor (tighter bands)
  clusterMapping[sortedIndices[2].index] = {
    label: 'HIGH',
    centroid: sortedIndices[2].centroid,
    factor: 2.0,
  };

  return clusterMapping;
}

// ==================== MAIN CLASS ====================

/**
 * ML-Adaptive SuperTrend Indicator
 *
 * Uses K-Means clustering on ATR values to dynamically adjust
 * the SuperTrend multiplier based on market volatility regime.
 */
export class MLAdaptiveSuperTrend {
  private config: MLAdaptiveSuperTrendConfig;
  private clusterMapping: VolatilityCluster[] | null = null;
  private lastATRValues: number[] = [];
  private currentVolatilityRegime: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: MLAdaptiveSuperTrendConfig = {
    atrLength: 10,
    baseFactor: 3,
    trainingPeriod: 100,
    volatilityPercentiles: {
      high: 0.75,
      medium: 0.50,
      low: 0.25,
    },
  };

  constructor(config?: Partial<MLAdaptiveSuperTrendConfig>) {
    this.config = {
      ...MLAdaptiveSuperTrend.DEFAULT_CONFIG,
      ...config,
      volatilityPercentiles: {
        ...MLAdaptiveSuperTrend.DEFAULT_CONFIG.volatilityPercentiles,
        ...config?.volatilityPercentiles,
      },
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): MLAdaptiveSuperTrendConfig {
    return { ...this.config };
  }

  /**
   * Get the current volatility regime
   */
  getVolatilityRegime(): 'LOW' | 'MEDIUM' | 'HIGH' {
    return this.currentVolatilityRegime;
  }

  /**
   * Get the cluster mapping (LOW, MEDIUM, HIGH clusters with their factors)
   */
  getClusterMapping(): VolatilityCluster[] | null {
    return this.clusterMapping ? [...this.clusterMapping] : null;
  }

  /**
   * Train the K-Means model on historical ATR values
   */
  private trainModel(atrValues: (number | null)[]): void {
    // Filter valid ATR values for training
    const validATR = atrValues.filter((v): v is number => v !== null);

    if (validATR.length < 10) {
      // Not enough data for meaningful clustering
      this.clusterMapping = [
        { label: 'LOW', centroid: 0, factor: 4.0 },
        { label: 'MEDIUM', centroid: 0, factor: 3.0 },
        { label: 'HIGH', centroid: 0, factor: 2.0 },
      ];
      return;
    }

    // Store for reference
    this.lastATRValues = validATR;

    // Sort values for percentile calculation
    const sortedATR = [...validATR].sort((a, b) => a - b);

    // Initialize centroids from percentiles
    const { low, medium, high } = this.config.volatilityPercentiles;
    const initialCentroids = [
      percentile(sortedATR, low),
      percentile(sortedATR, medium),
      percentile(sortedATR, high),
    ];

    // Run K-Means clustering
    const result = kMeans(validATR, initialCentroids, 50);

    // Map cluster indices to volatility levels and factors
    this.clusterMapping = mapClustersToVolatility(result.centroids);
  }

  /**
   * Determine the volatility cluster for a given ATR value
   */
  private getVolatilityCluster(atr: number): VolatilityCluster {
    if (!this.clusterMapping) {
      return { label: 'MEDIUM', centroid: atr, factor: this.config.baseFactor };
    }

    // Find the nearest cluster
    let minDist = Infinity;
    let nearestCluster = this.clusterMapping[0];

    for (const cluster of this.clusterMapping) {
      const dist = distance(atr, cluster.centroid);
      if (dist < minDist) {
        minDist = dist;
        nearestCluster = cluster;
      }
    }

    return nearestCluster;
  }

  /**
   * Calculate the ML-Adaptive SuperTrend indicator for a series of candles
   */
  calculate(candles: Candle[]): MLAdaptiveSuperTrendResult[] {
    if (candles.length === 0) {
      return [];
    }

    const results: MLAdaptiveSuperTrendResult[] = new Array(candles.length);

    // Calculate ATR values
    const atrValues = calculateATR(candles, this.config.atrLength);

    // Train K-Means model on available ATR data
    this.trainModel(atrValues);

    // SuperTrend calculation variables
    let prevSuperTrend: number | null = null;
    let prevDirection: -1 | 1 = 1;
    let prevUpperBand: number | null = null;
    let prevLowerBand: number | null = null;

    for (let i = 0; i < candles.length; i++) {
      const atr = atrValues[i];

      if (atr === null) {
        // Not enough data for ATR calculation
        const candle = candles[i];
        const hl2 = (candle.high + candle.low) / 2;

        results[i] = {
          superTrend: hl2,
          direction: 1,
          volatilityCluster: 'MEDIUM',
          clusterCentroid: 0,
          factor: this.config.baseFactor,
          signal: 'HOLD',
        };
        continue;
      }

      const candle = candles[i];
      const hl2 = (candle.high + candle.low) / 2;

      // Get volatility cluster and adaptive factor
      const cluster = this.getVolatilityCluster(atr);
      const adaptiveFactor = cluster.factor;

      // Update current volatility regime
      this.currentVolatilityRegime = cluster.label;

      // Calculate basic bands with adaptive factor
      const basicUpper = hl2 + adaptiveFactor * atr;
      const basicLower = hl2 - adaptiveFactor * atr;

      // Calculate final bands
      let finalUpper: number;
      let finalLower: number;

      if (prevUpperBand === null || prevLowerBand === null) {
        // First calculation
        finalUpper = basicUpper;
        finalLower = basicLower;
      } else {
        // Final Upper Band
        if (basicUpper < prevUpperBand || candle.close > prevUpperBand) {
          finalUpper = basicUpper;
        } else {
          finalUpper = prevUpperBand;
        }

        // Final Lower Band
        if (basicLower > prevLowerBand || candle.close < prevLowerBand) {
          finalLower = basicLower;
        } else {
          finalLower = prevLowerBand;
        }
      }

      // Determine SuperTrend value and direction
      let superTrend: number;
      let direction: -1 | 1;

      if (prevSuperTrend === null) {
        // Initial direction based on close position relative to bands
        if (candle.close <= finalUpper) {
          superTrend = finalUpper;
          direction = -1;
        } else {
          superTrend = finalLower;
          direction = 1;
        }
      } else {
        if (prevDirection === 1) {
          // Currently in uptrend
          if (candle.close < finalLower) {
            // Trend reversal to downtrend
            superTrend = finalUpper;
            direction = -1;
          } else {
            // Continue uptrend
            superTrend = finalLower;
            direction = 1;
          }
        } else {
          // Currently in downtrend
          if (candle.close > finalUpper) {
            // Trend reversal to uptrend
            superTrend = finalLower;
            direction = 1;
          } else {
            // Continue downtrend
            superTrend = finalUpper;
            direction = -1;
          }
        }
      }

      // Determine signal
      let signal: 'BUY' | 'SELL' | 'HOLD';
      if (prevDirection !== direction) {
        signal = direction === 1 ? 'BUY' : 'SELL';
      } else {
        signal = 'HOLD';
      }

      // Store result
      results[i] = {
        superTrend,
        direction,
        volatilityCluster: cluster.label,
        clusterCentroid: cluster.centroid,
        factor: adaptiveFactor,
        signal,
      };

      // Update previous values
      prevSuperTrend = superTrend;
      prevDirection = direction;
      prevUpperBand = finalUpper;
      prevLowerBand = finalLower;
    }

    return results;
  }

  /**
   * Calculate indicator for a single candle (incremental update)
   * Requires previous candles for context
   */
  calculateSingle(
    candle: Candle,
    prevCandles: Candle[],
    prevSuperTrend: number,
    prevDirection: -1 | 1,
    prevUpperBand: number,
    prevLowerBand: number
  ): MLAdaptiveSuperTrendResult | null {
    // Need at least atrLength candles for ATR calculation
    const allCandles = [...prevCandles, candle];
    const atrValues = calculateATR(allCandles, this.config.atrLength);
    const atr = atrValues[atrValues.length - 1];

    if (atr === null) {
      return null;
    }

    const hl2 = (candle.high + candle.low) / 2;
    const cluster = this.getVolatilityCluster(atr);
    const adaptiveFactor = cluster.factor;

    this.currentVolatilityRegime = cluster.label;

    // Calculate basic bands
    const basicUpper = hl2 + adaptiveFactor * atr;
    const basicLower = hl2 - adaptiveFactor * atr;

    // Calculate final bands
    let finalUpper: number;
    let finalLower: number;

    if (basicUpper < prevUpperBand || candle.close > prevUpperBand) {
      finalUpper = basicUpper;
    } else {
      finalUpper = prevUpperBand;
    }

    if (basicLower > prevLowerBand || candle.close < prevLowerBand) {
      finalLower = basicLower;
    } else {
      finalLower = prevLowerBand;
    }

    // Determine SuperTrend value and direction
    let superTrend: number;
    let direction: -1 | 1;

    if (prevDirection === 1) {
      if (candle.close < finalLower) {
        superTrend = finalUpper;
        direction = -1;
      } else {
        superTrend = finalLower;
        direction = 1;
      }
    } else {
      if (candle.close > finalUpper) {
        superTrend = finalLower;
        direction = 1;
      } else {
        superTrend = finalUpper;
        direction = -1;
      }
    }

    // Determine signal
    const signal: 'BUY' | 'SELL' | 'HOLD' =
      prevDirection !== direction
        ? direction === 1 ? 'BUY' : 'SELL'
        : 'HOLD';

    return {
      superTrend,
      direction,
      volatilityCluster: cluster.label,
      clusterCentroid: cluster.centroid,
      factor: adaptiveFactor,
      signal,
    };
  }

  /**
   * Get the latest result from a series of candles
   */
  getLatestResult(candles: Candle[]): MLAdaptiveSuperTrendResult | null {
    const results = this.calculate(candles);
    return results.length > 0 ? results[results.length - 1] : null;
  }

  /**
   * Extract signals from calculation results
   */
  static extractSignals(
    results: MLAdaptiveSuperTrendResult[]
  ): Array<{ index: number; signal: 'BUY' | 'SELL' }> {
    return results
      .map((r, i) => ({ index: i, signal: r.signal }))
      .filter((r) => r.signal !== 'HOLD') as Array<{
      index: number;
      signal: 'BUY' | 'SELL';
    }>;
  }

  /**
   * Get statistical summary of the clustering
   */
  getClusterStats(): {
    lowVolatility: { count: number; avgATR: number };
    mediumVolatility: { count: number; avgATR: number };
    highVolatility: { count: number; avgATR: number };
  } | null {
    if (!this.clusterMapping || this.lastATRValues.length === 0) {
      return null;
    }

    const stats = {
      lowVolatility: { count: 0, sum: 0 },
      mediumVolatility: { count: 0, sum: 0 },
      highVolatility: { count: 0, sum: 0 },
    };

    for (const atr of this.lastATRValues) {
      const cluster = this.getVolatilityCluster(atr);
      switch (cluster.label) {
        case 'LOW':
          stats.lowVolatility.count++;
          stats.lowVolatility.sum += atr;
          break;
        case 'MEDIUM':
          stats.mediumVolatility.count++;
          stats.mediumVolatility.sum += atr;
          break;
        case 'HIGH':
          stats.highVolatility.count++;
          stats.highVolatility.sum += atr;
          break;
      }
    }

    return {
      lowVolatility: {
        count: stats.lowVolatility.count,
        avgATR:
          stats.lowVolatility.count > 0
            ? stats.lowVolatility.sum / stats.lowVolatility.count
            : 0,
      },
      mediumVolatility: {
        count: stats.mediumVolatility.count,
        avgATR:
          stats.mediumVolatility.count > 0
            ? stats.mediumVolatility.sum / stats.mediumVolatility.count
            : 0,
      },
      highVolatility: {
        count: stats.highVolatility.count,
        avgATR:
          stats.highVolatility.count > 0
            ? stats.highVolatility.sum / stats.highVolatility.count
            : 0,
      },
    };
  }
}

// ==================== FACTORY FUNCTION ====================

/**
 * Create an ML-Adaptive SuperTrend indicator instance
 */
export function createMLAdaptiveSuperTrend(
  config?: Partial<MLAdaptiveSuperTrendConfig>
): MLAdaptiveSuperTrend {
  return new MLAdaptiveSuperTrend(config);
}

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Quick calculation function for one-off indicator calculations
 */
export function calculateMLAdaptiveSuperTrend(
  candles: Candle[],
  config?: Partial<MLAdaptiveSuperTrendConfig>
): MLAdaptiveSuperTrendResult[] {
  const indicator = new MLAdaptiveSuperTrend(config);
  return indicator.calculate(candles);
}

/**
 * Get trading signals from candle data
 */
export function getMLSuperTrendSignals(
  candles: Candle[],
  config?: Partial<MLAdaptiveSuperTrendConfig>
): Array<{
  index: number;
  candle: Candle;
  result: MLAdaptiveSuperTrendResult;
}> {
  const indicator = new MLAdaptiveSuperTrend(config);
  const results = indicator.calculate(candles);

  return results
    .map((result, index) => ({
      index,
      candle: candles[index],
      result,
    }))
    .filter((item) => item.result.signal !== 'HOLD');
}
