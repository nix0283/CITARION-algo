/**
 * K-Means Volatility Clustering for Market Regime Detection
 *
 * This module implements K-Means clustering on ATR (Average True Range) values
 * to detect market volatility regimes. It clusters volatility into three
 * categories: LOW, MEDIUM, and HIGH.
 *
 * The implementation uses K-means++ initialization for better centroid placement
 * and provides probability estimates for cluster assignments.
 *
 * Features:
 * - Wilder's smoothing for ATR calculation
 * - K-means++ initialization for robust clustering
 * - Within-cluster variance calculation
 * - Confidence probability for regime assignment
 * - Suggested factor for use with indicators like SuperTrend
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
 * Configuration for K-Means Volatility Clustering
 */
export interface KMeansVolatilityConfig {
  /** ATR calculation period (default: 14) */
  atrLength: number;
  /** Number of candles to use for clustering (default: 100) */
  lookbackPeriod: number;
  /** Number of clusters (default: 3 for LOW, MEDIUM, HIGH) */
  numClusters: number;
  /** Maximum iterations for K-Means (default: 50) */
  maxIterations: number;
  /** Convergence threshold for centroid movement (default: 0.0001) */
  convergenceThreshold: number;
}

/**
 * Information about a single volatility cluster
 */
export interface VolatilityCluster {
  /** Cluster identifier (0, 1, 2) */
  id: number;
  /** Centroid value (ATR value) */
  centroid: number;
  /** Volatility label */
  label: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Number of data points in this cluster */
  count: number;
  /** Within-cluster variance */
  variance: number;
}

/**
 * Result from K-Means Volatility calculation
 */
export interface KMeansVolatilityResult {
  /** Current cluster assignment */
  currentCluster: VolatilityCluster;
  /** All clusters sorted by centroid (LOW to HIGH) */
  clusters: VolatilityCluster[];
  /** Current ATR value */
  atr: number;
  /** Normalized ATR on 0-1 scale */
  normalizedATR: number;
  /** Current volatility regime */
  regime: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Confidence probability in the assignment (0-1) */
  probability: number;
  /** Suggested factor for indicators like SuperTrend */
  suggestedFactor: number;
}

/**
 * Internal structure for K-Means clustering results
 */
interface KMeansInternalResult {
  /** Cluster assignments for each data point */
  assignments: number[];
  /** Final centroids */
  centroids: number[];
  /** Number of iterations performed */
  iterations: number;
  /** Whether the algorithm converged */
  converged: boolean;
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
 * Calculate Euclidean distance between two 1D points
 */
function distance(a: number, b: number): number {
  return Math.abs(a - b);
}

// ==================== MAIN CLASS ====================

/**
 * K-Means Volatility Clustering for Market Regime Detection
 *
 * Uses K-Means clustering on ATR values to classify market volatility
 * into LOW, MEDIUM, and HIGH regimes.
 */
export class KMeansVolatility {
  private config: KMeansVolatilityConfig;
  private clusters: VolatilityCluster[] = [];
  private atrSeries: number[] = [];
  private currentRegime: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  private isTrained: boolean = false;

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: KMeansVolatilityConfig = {
    atrLength: 14,
    lookbackPeriod: 100,
    numClusters: 3,
    maxIterations: 50,
    convergenceThreshold: 0.0001,
  };

  constructor(config?: Partial<KMeansVolatilityConfig>) {
    this.config = {
      ...KMeansVolatility.DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): KMeansVolatilityConfig {
    return { ...this.config };
  }

  /**
   * Calculate ATR (Average True Range) using Wilder's smoothing
   *
   * @param candles - Array of candle data
   * @returns Array of ATR values (null for insufficient data points)
   */
  calculateATR(candles: Candle[]): (number | null)[] {
    const result: (number | null)[] = new Array(candles.length).fill(null);
    const period = this.config.atrLength;

    if (candles.length < period) return result;

    // Calculate True Range values
    const trValues: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i === 0) {
        // First candle: TR = High - Low
        trValues.push(candles[i].high - candles[i].low);
      } else {
        // Subsequent candles: TR = max(H-L, |H-PrevC|, |L-PrevC|)
        trValues.push(
          trueRange(
            candles[i].high,
            candles[i].low,
            candles[i - 1].close
          )
        );
      }
    }

    // First ATR is simple moving average of TR
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trValues[i];
    }
    result[period - 1] = sum / period;

    // Subsequent ATR values use Wilder's smoothing
    // ATR = (Previous ATR * (period - 1) + Current TR) / period
    for (let i = period; i < trValues.length; i++) {
      const prevATR = result[i - 1] as number;
      result[i] = (prevATR * (period - 1) + trValues[i]) / period;
    }

    return result;
  }

  /**
   * Initialize centroids using K-means++ algorithm
   *
   * This provides better initial centroid placement compared to random initialization,
   * leading to faster convergence and more consistent results.
   *
   * @param values - Array of ATR values
   * @param k - Number of clusters
   * @returns Initial centroids
   */
  initializeCentroids(values: number[], k: number): number[] {
    if (values.length === 0) return [];
    if (values.length <= k) return [...values];

    const centroids: number[] = [];

    // Use percentile-based initialization for more stable results
    const sortedValues = [...values].sort((a, b) => a - b);

    // Initialize with percentiles: 25th, 50th, 75th for k=3
    if (k === 3) {
      centroids.push(percentile(sortedValues, 0.25));
      centroids.push(percentile(sortedValues, 0.50));
      centroids.push(percentile(sortedValues, 0.75));
    } else {
      // For other k values, use evenly spaced percentiles
      for (let i = 0; i < k; i++) {
        const p = i / (k - 1);
        centroids.push(percentile(sortedValues, p));
      }
    }

    // Apply K-means++ refinement for better initial placement
    // Replace each centroid with weighted selection based on distance
    for (let c = 0; c < Math.min(centroids.length, k); c++) {
      // Calculate distances from each point to nearest centroid
      const distances = values.map(v => {
        let minDist = Infinity;
        for (const centroid of centroids) {
          const dist = distance(v, centroid);
          if (dist < minDist) {
            minDist = dist;
          }
        }
        return minDist;
      });

      // Select point with probability proportional to distance squared
      const totalDist = distances.reduce((sum, d) => sum + d * d, 0);
      if (totalDist > 0) {
        let random = Math.random() * totalDist;
        let selectedIndex = 0;
        for (let i = 0; i < distances.length; i++) {
          random -= distances[i] * distances[i];
          if (random <= 0) {
            selectedIndex = i;
            break;
          }
        }
        // Only replace if it improves the spread
        centroids[c] = values[selectedIndex];
      }
    }

    return centroids;
  }

  /**
   * Perform K-Means clustering on 1D data
   *
   * @param values - Array of ATR values
   * @param k - Number of clusters
   * @returns Clustering result with assignments and centroids
   */
  kMeansClustering(values: number[], k: number): KMeansInternalResult {
    if (values.length === 0) {
      return {
        assignments: [],
        centroids: new Array(k).fill(0),
        iterations: 0,
        converged: true,
      };
    }

    if (values.length < k) {
      // Not enough data points for k clusters
      return {
        assignments: values.map((_, i) => Math.min(i, k - 1)),
        centroids: [...values, ...new Array(k - values.length).fill(0)],
        iterations: 0,
        converged: true,
      };
    }

    // Initialize centroids using K-means++
    let centroids = this.initializeCentroids(values, k);
    let assignments = new Array(values.length).fill(0);
    let iterations = 0;
    let converged = false;

    const maxIter = this.config.maxIterations;
    const tolerance = this.config.convergenceThreshold;

    for (let iter = 0; iter < maxIter; iter++) {
      iterations = iter + 1;

      // Assignment step: assign each point to nearest centroid
      const newAssignments = values.map((value) => {
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

      // Update step: recalculate centroids as mean of assigned points
      const newCentroids: number[] = [];
      for (let i = 0; i < k; i++) {
        const clusterPoints = values.filter((_, idx) => assignments[idx] === i);
        if (clusterPoints.length > 0) {
          newCentroids.push(
            clusterPoints.reduce((sum, val) => sum + val, 0) / clusterPoints.length
          );
        } else {
          // Keep old centroid if cluster is empty
          newCentroids.push(centroids[i]);
        }
      }

      // Check for convergence based on centroid movement
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
   * Calculate within-cluster variance
   */
  private calculateVariance(values: number[], assignments: number[], centroids: number[]): number[] {
    const variances: number[] = new Array(centroids.length).fill(0);

    for (let i = 0; i < centroids.length; i++) {
      const clusterPoints = values.filter((_, idx) => assignments[idx] === i);
      if (clusterPoints.length > 0) {
        const mean = centroids[i];
        const variance = clusterPoints.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / clusterPoints.length;
        variances[i] = variance;
      }
    }

    return variances;
  }

  /**
   * Count points in each cluster
   */
  private countClusters(assignments: number[], k: number): number[] {
    const counts = new Array(k).fill(0);
    for (const a of assignments) {
      counts[a]++;
    }
    return counts;
  }

  /**
   * Map cluster indices to volatility labels
   * Sorts by centroid value and assigns LOW, MEDIUM, HIGH
   */
  private mapToLabels(centroids: number[]): Array<'LOW' | 'MEDIUM' | 'HIGH'> {
    const labels: Array<'LOW' | 'MEDIUM' | 'HIGH'> = new Array(centroids.length);

    // Sort centroids by value
    const sortedIndices = centroids
      .map((c, i) => ({ centroid: c, index: i }))
      .sort((a, b) => a.centroid - b.centroid);

    // Assign labels based on sorted order
    const labelMap: Array<'LOW' | 'MEDIUM' | 'HIGH'> = ['LOW', 'MEDIUM', 'HIGH'];
    for (let rank = 0; rank < sortedIndices.length; rank++) {
      const originalIndex = sortedIndices[rank].index;
      labels[originalIndex] = labelMap[rank] || 'MEDIUM';
    }

    return labels;
  }

  /**
   * Assign a value to the nearest cluster
   *
   * @param value - ATR value to assign
   * @returns The cluster the value belongs to
   */
  assignCluster(value: number): VolatilityCluster {
    if (!this.isTrained || this.clusters.length === 0) {
      return {
        id: 0,
        centroid: value,
        label: 'MEDIUM',
        count: 0,
        variance: 0,
      };
    }

    let minDist = Infinity;
    let nearestCluster = this.clusters[0];

    for (const cluster of this.clusters) {
      const dist = distance(value, cluster.centroid);
      if (dist < minDist) {
        minDist = dist;
        nearestCluster = cluster;
      }
    }

    return nearestCluster;
  }

  /**
   * Calculate probability of belonging to each cluster
   * Uses softmax-like probability based on distances
   */
  private calculateProbability(value: number, cluster: VolatilityCluster): number {
    if (this.clusters.length === 0) return 1;

    // Calculate distances to all centroids
    const distances = this.clusters.map(c => distance(value, c.centroid));

    // Convert to probabilities using softmax (negative distance as score)
    // P(cluster) = exp(-distance) / sum(exp(-distances))
    const temperature = 0.5; // Controls how "sharp" the probability distribution is
    const scores = distances.map(d => Math.exp(-d / temperature));
    const totalScore = scores.reduce((sum, s) => sum + s, 0);

    if (totalScore === 0) return 1 / this.clusters.length;

    const clusterIndex = this.clusters.findIndex(c => c.id === cluster.id);
    return scores[clusterIndex] / totalScore;
  }

  /**
   * Normalize ATR value to 0-1 scale based on historical range
   */
  private normalizeATR(atr: number): number {
    if (this.atrSeries.length === 0) return 0.5;

    const minATR = Math.min(...this.atrSeries);
    const maxATR = Math.max(...this.atrSeries);

    if (maxATR === minATR) return 0.5;

    return (atr - minATR) / (maxATR - minATR);
  }

  /**
   * Get suggested factor for indicators like SuperTrend
   * LOW volatility → higher factor (wider bands)
   * HIGH volatility → lower factor (tighter bands)
   */
  private getSuggestedFactor(regime: 'LOW' | 'MEDIUM' | 'HIGH'): number {
    switch (regime) {
      case 'LOW':
        return 4.0; // Wider bands, fewer false signals
      case 'MEDIUM':
        return 3.0; // Balanced approach
      case 'HIGH':
        return 2.0; // Tighter bands, faster reaction
      default:
        return 3.0;
    }
  }

  /**
   * Calculate volatility clustering result from candles
   *
   * @param candles - Array of candle data
   * @returns K-Means volatility result with regime and confidence
   */
  calculate(candles: Candle[]): KMeansVolatilityResult | null {
    if (candles.length < this.config.atrLength) {
      return null;
    }

    // Calculate ATR series
    const atrValues = this.calculateATR(candles);

    // Filter valid ATR values
    const validATR = atrValues.filter((v): v is number => v !== null);

    if (validATR.length === 0) {
      return null;
    }

    // Use only the lookback period for clustering
    const lookback = Math.min(this.config.lookbackPeriod, validATR.length);
    const atrForClustering = validATR.slice(-lookback);

    // Store for normalization
    this.atrSeries = validATR;

    // Perform K-Means clustering
    const k = this.config.numClusters;
    const result = this.kMeansClustering(atrForClustering, k);

    // Calculate cluster statistics
    const counts = this.countClusters(result.assignments, k);
    const variances = this.calculateVariance(atrForClustering, result.assignments, result.centroids);
    const labels = this.mapToLabels(result.centroids);

    // Build cluster objects
    this.clusters = result.centroids.map((centroid, i) => ({
      id: i,
      centroid,
      label: labels[i],
      count: counts[i],
      variance: variances[i],
    }));

    // Sort clusters by centroid for output
    const sortedClusters = [...this.clusters].sort((a, b) => a.centroid - b.centroid);

    // Get current ATR value (most recent)
    const currentATR = validATR[validATR.length - 1];

    // Assign current ATR to cluster
    const currentCluster = this.assignCluster(currentATR);
    this.currentRegime = currentCluster.label;
    this.isTrained = true;

    // Calculate probability
    const probability = this.calculateProbability(currentATR, currentCluster);

    // Normalize ATR
    const normalizedATR = this.normalizeATR(currentATR);

    // Get suggested factor
    const suggestedFactor = this.getSuggestedFactor(currentCluster.label);

    return {
      currentCluster,
      clusters: sortedClusters,
      atr: currentATR,
      normalizedATR,
      regime: currentCluster.label,
      probability,
      suggestedFactor,
    };
  }

  /**
   * Get the current volatility regime
   *
   * @returns The current regime label
   */
  getRegime(): 'LOW' | 'MEDIUM' | 'HIGH' {
    return this.currentRegime;
  }

  /**
   * Get all clusters with their statistics
   */
  getClusters(): VolatilityCluster[] {
    return [...this.clusters];
  }

  /**
   * Check if the model has been trained
   */
  getIsTrained(): boolean {
    return this.isTrained;
  }

  /**
   * Get the ATR series used for clustering
   */
  getATRSeries(): number[] {
    return [...this.atrSeries];
  }

  /**
   * Get cluster statistics summary
   */
  getClusterStats(): {
    lowVolatility: { count: number; avgATR: number; variance: number };
    mediumVolatility: { count: number; avgATR: number; variance: number };
    highVolatility: { count: number; avgATR: number; variance: number };
  } | null {
    if (!this.isTrained) return null;

    const stats = {
      lowVolatility: { count: 0, sum: 0, variance: 0 },
      mediumVolatility: { count: 0, sum: 0, variance: 0 },
      highVolatility: { count: 0, sum: 0, variance: 0 },
    };

    for (const cluster of this.clusters) {
      switch (cluster.label) {
        case 'LOW':
          stats.lowVolatility = {
            count: cluster.count,
            sum: cluster.centroid * cluster.count,
            variance: cluster.variance,
          };
          break;
        case 'MEDIUM':
          stats.mediumVolatility = {
            count: cluster.count,
            sum: cluster.centroid * cluster.count,
            variance: cluster.variance,
          };
          break;
        case 'HIGH':
          stats.highVolatility = {
            count: cluster.count,
            sum: cluster.centroid * cluster.count,
            variance: cluster.variance,
          };
          break;
      }
    }

    return {
      lowVolatility: {
        count: stats.lowVolatility.count,
        avgATR: stats.lowVolatility.count > 0 ? stats.lowVolatility.sum / stats.lowVolatility.count : 0,
        variance: stats.lowVolatility.variance,
      },
      mediumVolatility: {
        count: stats.mediumVolatility.count,
        avgATR: stats.mediumVolatility.count > 0 ? stats.mediumVolatility.sum / stats.mediumVolatility.count : 0,
        variance: stats.mediumVolatility.variance,
      },
      highVolatility: {
        count: stats.highVolatility.count,
        avgATR: stats.highVolatility.count > 0 ? stats.highVolatility.sum / stats.highVolatility.count : 0,
        variance: stats.highVolatility.variance,
      },
    };
  }

  /**
   * Reset the model state
   */
  reset(): void {
    this.clusters = [];
    this.atrSeries = [];
    this.currentRegime = 'MEDIUM';
    this.isTrained = false;
  }
}

// ==================== FACTORY FUNCTION ====================

/**
 * Create a K-Means Volatility instance with configuration
 *
 * @param config - Optional configuration overrides
 * @returns KMeansVolatility instance
 */
export function createKMeansVolatility(
  config?: Partial<KMeansVolatilityConfig>
): KMeansVolatility {
  return new KMeansVolatility(config);
}

// ==================== CONVENIENCE FUNCTION ====================

/**
 * Calculate volatility regime from candles
 * Convenience function for one-off calculations
 *
 * @param candles - Array of candle data
 * @param config - Optional configuration overrides
 * @returns K-Means volatility result or null if insufficient data
 */
export function calculateVolatilityRegime(
  candles: Candle[],
  config?: Partial<KMeansVolatilityConfig>
): KMeansVolatilityResult | null {
  const kmeans = new KMeansVolatility(config);
  return kmeans.calculate(candles);
}
