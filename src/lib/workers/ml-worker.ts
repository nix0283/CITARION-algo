/**
 * ML Worker Thread Script
 * 
 * Handles CPU-intensive ML operations in a separate thread
 * to avoid blocking the main event loop.
 * 
 * CIT-041: Production-ready worker thread implementation
 * 
 * Supported operations:
 * - model_train: Train ML models (Linear Regression, Decision Tree, Random Forest)
 * - model_predict: Make predictions with trained models
 * - lstm_train: Train LSTM models (TensorFlow.js)
 * - lstm_predict: LSTM predictions
 * - calculate_indicators: Calculate technical indicators
 * - feature_engineering: Generate ML features from market data
 */

import { parentPort, workerData } from 'worker_threads';

// ============================================================================
// TYPES
// ============================================================================

interface WorkerMessage {
  id: string;
  type: string;
  data: unknown;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

interface TrainingData {
  features: number[][];
  labels: number[];
  config?: Record<string, unknown>;
}

interface PredictionData {
  features: number[];
  modelData: SerializedModel;
}

interface SerializedModel {
  type: 'linear' | 'tree' | 'forest';
  weights?: number[];
  bias?: number;
  tree?: TreeNode;
  trees?: { tree: TreeNode }[];
}

interface TreeNode {
  value?: number;
  isLeaf: boolean;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

// ============================================================================
// LINEAR REGRESSION
// ============================================================================

class LinearRegressionModel {
  private weights: number[] = [];
  private bias: number = 0;

  train(features: number[][], labels: number[], config?: { learningRate?: number; iterations?: number }): void {
    const n = features.length;
    const m = features[0]?.length || 0;
    const lr = config?.learningRate || 0.01;
    const iterations = config?.iterations || 1000;

    this.weights = new Array(m).fill(0);
    this.bias = 0;

    for (let iter = 0; iter < iterations; iter++) {
      const gradients = new Array(m).fill(0);
      let biasGradient = 0;

      for (let i = 0; i < n; i++) {
        const pred = this.predictRow(features[i]);
        const error = pred - labels[i];
        biasGradient += error;

        for (let j = 0; j < m; j++) {
          gradients[j] += error * features[i][j];
        }
      }

      this.bias -= (lr * biasGradient) / n;
      for (let j = 0; j < m; j++) {
        this.weights[j] -= (lr * gradients[j]) / n;
      }
    }
  }

  private predictRow(features: number[]): number {
    let sum = this.bias;
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * (this.weights[i] || 0);
    }
    return sum;
  }

  predict(features: number[]): { prediction: number; confidence: number } {
    const prediction = this.predictRow(features);
    return { prediction, confidence: 0.5 };
  }

  serialize(): { weights: number[]; bias: number } {
    return { weights: this.weights, bias: this.bias };
  }

  deserialize(data: { weights: number[]; bias: number }): void {
    this.weights = data.weights;
    this.bias = data.bias;
  }
}

// ============================================================================
// DECISION TREE
// ============================================================================

class DecisionTreeModel {
  private tree: TreeNode | null = null;
  private maxDepth: number = 5;
  private minSamplesSplit: number = 10;

  constructor(config?: { maxDepth?: number; minSamplesSplit?: number }) {
    this.maxDepth = config?.maxDepth || 5;
    this.minSamplesSplit = config?.minSamplesSplit || 10;
  }

  train(features: number[][], labels: number[]): void {
    this.tree = this.buildTree(features, labels, 0);
  }

  private buildTree(features: number[][], labels: number[], depth: number): TreeNode {
    if (depth >= this.maxDepth || features.length < this.minSamplesSplit) {
      return { value: labels.reduce((a, b) => a + b, 0) / labels.length, isLeaf: true };
    }

    const { featureIndex, threshold, leftFeatures, leftLabels, rightFeatures, rightLabels } =
      this.findBestSplit(features, labels);

    if (leftFeatures.length === 0 || rightFeatures.length === 0) {
      return { value: labels.reduce((a, b) => a + b, 0) / labels.length, isLeaf: true };
    }

    return {
      featureIndex,
      threshold,
      isLeaf: false,
      left: this.buildTree(leftFeatures, leftLabels, depth + 1),
      right: this.buildTree(rightFeatures, rightLabels, depth + 1),
    };
  }

  private findBestSplit(features: number[][], labels: number[]): {
    featureIndex: number;
    threshold: number;
    leftFeatures: number[][];
    leftLabels: number[];
    rightFeatures: number[][];
    rightLabels: number[];
  } {
    let bestMSE = Infinity;
    let bestFeatureIndex = 0;
    let bestThreshold = 0;
    let bestLeftFeatures: number[][] = [];
    let bestLeftLabels: number[] = [];
    let bestRightFeatures: number[][] = [];
    let bestRightLabels: number[] = [];

    const numFeatures = features[0]?.length || 0;

    for (let f = 0; f < numFeatures; f++) {
      const values = features.map((row) => row[f]).sort((a, b) => a - b);
      const thresholds = values.filter((_, i) => i % 10 === 0);

      for (const threshold of thresholds) {
        const leftIndices: number[] = [];
        const rightIndices: number[] = [];

        features.forEach((row, i) => {
          if (row[f] <= threshold) leftIndices.push(i);
          else rightIndices.push(i);
        });

        if (leftIndices.length < 5 || rightIndices.length < 5) continue;

        const leftLabels = leftIndices.map((i) => labels[i]);
        const rightLabels = rightIndices.map((i) => labels[i]);

        const leftMean = leftLabels.reduce((a, b) => a + b, 0) / leftLabels.length;
        const rightMean = rightLabels.reduce((a, b) => a + b, 0) / rightLabels.length;

        const leftMSE = leftLabels.reduce((sum, l) => sum + (l - leftMean) ** 2, 0);
        const rightMSE = rightLabels.reduce((sum, l) => sum + (l - rightMean) ** 2, 0);
        const totalMSE = leftMSE + rightMSE;

        if (totalMSE < bestMSE) {
          bestMSE = totalMSE;
          bestFeatureIndex = f;
          bestThreshold = threshold;
          bestLeftFeatures = leftIndices.map((i) => features[i]);
          bestLeftLabels = leftLabels;
          bestRightFeatures = rightIndices.map((i) => features[i]);
          bestRightLabels = rightLabels;
        }
      }
    }

    return {
      featureIndex: bestFeatureIndex,
      threshold: bestThreshold,
      leftFeatures: bestLeftFeatures,
      leftLabels: bestLeftLabels,
      rightFeatures: bestRightFeatures,
      rightLabels: bestRightLabels,
    };
  }

  predict(features: number[]): { prediction: number; confidence: number } {
    if (!this.tree) return { prediction: 0, confidence: 0 };
    return this.predictTree(this.tree, features);
  }

  private predictTree(node: TreeNode, features: number[]): { prediction: number; confidence: number } {
    if (node.isLeaf) {
      return { prediction: node.value || 0, confidence: 0.5 };
    }

    if (features[node.featureIndex!] <= node.threshold!) {
      return this.predictTree(node.left!, features);
    } else {
      return this.predictTree(node.right!, features);
    }
  }

  serialize(): { tree: TreeNode } {
    return { tree: this.tree! };
  }

  deserialize(data: { tree: TreeNode }): void {
    this.tree = data.tree;
  }
}

// ============================================================================
// RANDOM FOREST
// ============================================================================

class RandomForestModel {
  private trees: DecisionTreeModel[] = [];
  private numTrees: number = 10;
  private maxDepth: number = 5;

  constructor(config?: { numTrees?: number; maxDepth?: number }) {
    this.numTrees = config?.numTrees || 10;
    this.maxDepth = config?.maxDepth || 5;
  }

  train(features: number[][], labels: number[]): void {
    this.trees = [];

    for (let t = 0; t < this.numTrees; t++) {
      const indices = Array.from({ length: features.length }, () =>
        Math.floor(Math.random() * features.length)
      );
      const sampledFeatures = indices.map((i) => features[i]);
      const sampledLabels = indices.map((i) => labels[i]);

      const tree = new DecisionTreeModel({ maxDepth: this.maxDepth });
      tree.train(sampledFeatures, sampledLabels);
      this.trees.push(tree);
    }
  }

  predict(features: number[]): { prediction: number; confidence: number } {
    const predictions = this.trees.map((tree) => tree.predict(features).prediction);
    const mean = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    const std = Math.sqrt(
      predictions.reduce((sum, p) => sum + (p - mean) ** 2, 0) / predictions.length
    );

    return {
      prediction: mean,
      confidence: 1 - Math.min(std / (Math.abs(mean) + 0.001), 1),
    };
  }

  serialize(): { trees: { tree: TreeNode }[] } {
    return {
      trees: this.trees.map((t) => t.serialize()),
    };
  }

  deserialize(data: { trees: { tree: TreeNode }[] }): void {
    this.trees = data.trees.map((t) => {
      const tree = new DecisionTreeModel();
      tree.deserialize(t);
      return tree;
    });
  }
}

// ============================================================================
// INDICATOR CALCULATIONS
// ============================================================================

function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    result.push(NaN);
  }
  result[period - 1] = sum / period;

  // Subsequent EMAs
  for (let i = period; i < data.length; i++) {
    result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
  }

  return result;
}

function calculateRSI(closes: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;

      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      }
    }
  }

  return result;
}

function calculateMACD(closes: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const macd = emaFast.map((f, i) => {
    if (isNaN(f) || isNaN(emaSlow[i])) return NaN;
    return f - emaSlow[i];
  });

  const signal = calculateEMA(macd.filter((v) => !isNaN(v)), signalPeriod);
  
  // Pad signal to match macd length
  const paddedSignal: number[] = [];
  let signalIdx = 0;
  for (let i = 0; i < macd.length; i++) {
    if (isNaN(macd[i])) {
      paddedSignal.push(NaN);
    } else {
      paddedSignal.push(signal[signalIdx++] ?? NaN);
    }
  }

  const histogram = macd.map((m, i) => {
    if (isNaN(m) || isNaN(paddedSignal[i])) return NaN;
    return m - paddedSignal[i];
  });

  return { macd, signal: paddedSignal, histogram };
}

function calculateBollingerBands(closes: number[], period: number = 20, stdDev: number = 2): {
  upper: number[];
  middle: number[];
  lower: number[];
} {
  const middle = calculateSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
  }

  return { upper, middle, lower };
}

// ============================================================================
// FEATURE ENGINEERING
// ============================================================================

interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
}

function engineerFeatures(candles: CandleData[]): number[][] {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const rsi = calculateRSI(closes, 14);
  const { macd, signal, histogram } = calculateMACD(closes);
  const { upper, middle, lower } = calculateBollingerBands(closes);

  const features: number[][] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // Skip if we don't have enough data for all indicators
    if (isNaN(sma50[i]) || isNaN(rsi[i]) || isNaN(macd[i])) {
      continue;
    }

    const featureSet = [
      // Price features
      (candle.close - candle.open) / candle.open, // Body ratio
      (candle.high - candle.low) / candle.close, // Volatility
      (candle.close - candle.low) / (candle.high - candle.low || 1), // Close position

      // Moving average features
      (candle.close - sma20[i]) / sma20[i], // Distance from SMA20
      (candle.close - sma50[i]) / sma50[i], // Distance from SMA50
      (sma20[i] - sma50[i]) / sma50[i], // SMA crossover

      // EMA features
      (ema12[i] - ema26[i]) / ema26[i], // EMA crossover

      // Oscillator features
      rsi[i] / 100, // Normalized RSI
      macd[i] / candle.close, // Normalized MACD
      histogram[i] / candle.close, // Normalized histogram

      // Bollinger features
      (candle.close - middle[i]) / (upper[i] - lower[i] || 1), // BB position
      (upper[i] - lower[i]) / middle[i], // BB width (volatility)

      // Volume features
      volumes[i] / (volumes.slice(Math.max(0, i - 20), i).reduce((a, b) => a + b, 0) / 20 || 1), // Volume ratio
    ];

    features.push(featureSet);
  }

  return features;
}

// ============================================================================
// MODEL REGISTRY
// ============================================================================

const models = new Map<string, LinearRegressionModel | DecisionTreeModel | RandomForestModel>();

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

function handleMessage(message: WorkerMessage): WorkerResponse {
  try {
    switch (message.type) {
      case 'model_train': {
        const data = message.data as TrainingData & { modelType: string; modelId: string };
        let model: LinearRegressionModel | DecisionTreeModel | RandomForestModel;

        switch (data.modelType) {
          case 'linear':
            model = new LinearRegressionModel();
            break;
          case 'tree':
            model = new DecisionTreeModel(data.config as { maxDepth?: number });
            break;
          case 'forest':
            model = new RandomForestModel(data.config as { numTrees?: number; maxDepth?: number });
            break;
          default:
            throw new Error(`Unknown model type: ${data.modelType}`);
        }

        model.train(data.features, data.labels, data.config as Record<string, number>);

        // Serialize and store
        const serialized = model.serialize();
        models.set(data.modelId, model);

        return {
          id: message.id,
          success: true,
          result: {
            modelId: data.modelId,
            type: data.modelType,
            serialized,
          },
        };
      }

      case 'model_predict': {
        const data = message.data as PredictionData & { modelId: string };
        const model = models.get(data.modelId);

        if (!model) {
          throw new Error(`Model not found: ${data.modelId}`);
        }

        const result = model.predict(data.features);
        return {
          id: message.id,
          success: true,
          result,
        };
      }

      case 'model_load': {
        const data = message.data as { modelId: string; serialized: SerializedModel };
        let model: LinearRegressionModel | DecisionTreeModel | RandomForestModel;

        switch (data.serialized.type) {
          case 'linear':
            model = new LinearRegressionModel();
            model.deserialize(data.serialized as { weights: number[]; bias: number });
            break;
          case 'tree':
            model = new DecisionTreeModel();
            model.deserialize({ tree: data.serialized.tree! });
            break;
          case 'forest':
            model = new RandomForestModel();
            model.deserialize({ trees: data.serialized.trees! });
            break;
          default:
            throw new Error(`Unknown model type: ${data.serialized.type}`);
        }

        models.set(data.modelId, model);
        return {
          id: message.id,
          success: true,
          result: { modelId: data.modelId },
        };
      }

      case 'calculate_indicators': {
        const data = message.data as {
          candles: CandleData[];
          indicators: string[];
        };

        const closes = data.candles.map((c) => c.close);
        const results: Record<string, number[]> = {};

        for (const indicator of data.indicators) {
          switch (indicator) {
            case 'sma20':
              results.sma20 = calculateSMA(closes, 20);
              break;
            case 'sma50':
              results.sma50 = calculateSMA(closes, 50);
              break;
            case 'ema12':
              results.ema12 = calculateEMA(closes, 12);
              break;
            case 'ema26':
              results.ema26 = calculateEMA(closes, 26);
              break;
            case 'rsi':
              results.rsi = calculateRSI(closes, 14);
              break;
            case 'macd':
              const macdResult = calculateMACD(closes);
              results.macd = macdResult.macd;
              results.macd_signal = macdResult.signal;
              results.macd_histogram = macdResult.histogram;
              break;
            case 'bollinger':
              const bbResult = calculateBollingerBands(closes);
              results.bb_upper = bbResult.upper;
              results.bb_middle = bbResult.middle;
              results.bb_lower = bbResult.lower;
              break;
          }
        }

        return {
          id: message.id,
          success: true,
          result: results,
        };
      }

      case 'feature_engineering': {
        const data = message.data as { candles: CandleData[] };
        const features = engineerFeatures(data.candles);

        return {
          id: message.id,
          success: true,
          result: features,
        };
      }

      default:
        return {
          id: message.id,
          success: false,
          error: `Unknown message type: ${message.type}`,
        };
    }
  } catch (error) {
    return {
      id: message.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// WORKER INITIALIZATION
// ============================================================================

if (parentPort) {
  parentPort.on('message', (message: WorkerMessage) => {
    const response = handleMessage(message);
    parentPort!.postMessage(response);
  });

  // Signal ready
  parentPort.postMessage({ type: 'ready', workerData });
}

export { handleMessage, LinearRegressionModel, DecisionTreeModel, RandomForestModel };
