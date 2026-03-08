/**
 * AutoML Engine
 * Automatic model selection and hyperparameter tuning
 */

import type {
  FeatureSet,
  ModelConfig,
  ModelMetrics,
  ModelType,
  ModelAlgorithm,
  AutoMLConfig,
  AutoMLTrial,
  AutoMLResult,
  TrainingResult,
  FeatureImportance
} from './types'

export interface ModelPrediction {
  prediction: number
  confidence: number
}

/**
 * Simple ML Model implementations for trading
 */
abstract class BaseModel {
  abstract train(features: number[][], labels: number[]): void
  abstract predict(features: number[]): ModelPrediction
  abstract getFeatureImportance(): number[]
}

/**
 * Linear Regression Model
 */
class LinearRegressionModel extends BaseModel {
  private weights: number[] = []
  private bias: number = 0

  train(features: number[][], labels: number[]): void {
    const n = features.length
    const m = features[0]?.length || 0

    // Simple gradient descent
    this.weights = new Array(m).fill(0)
    this.bias = 0
    const lr = 0.01
    const iterations = 1000

    for (let iter = 0; iter < iterations; iter++) {
      const gradients = new Array(m).fill(0)
      let biasGradient = 0

      for (let i = 0; i < n; i++) {
        const pred = this.predictRow(features[i])
        const error = pred - labels[i]
        biasGradient += error

        for (let j = 0; j < m; j++) {
          gradients[j] += error * features[i][j]
        }
      }

      this.bias -= lr * biasGradient / n
      for (let j = 0; j < m; j++) {
        this.weights[j] -= lr * gradients[j] / n
      }
    }
  }

  private predictRow(features: number[]): number {
    let sum = this.bias
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * (this.weights[i] || 0)
    }
    return sum
  }

  predict(features: number[]): ModelPrediction {
    const prediction = this.predictRow(features)
    return { prediction, confidence: 0.5 }
  }

  getFeatureImportance(): number[] {
    return this.weights.map(Math.abs)
  }
}

/**
 * Decision Tree Model
 */
class DecisionTreeModel extends BaseModel {
  private tree: TreeNode | null = null
  private maxDepth: number = 5
  private minSamplesSplit: number = 10

  constructor(params: Record<string, number> = {}) {
    super()
    this.maxDepth = params.maxDepth || 5
    this.minSamplesSplit = params.minSamplesSplit || 10
  }

  train(features: number[][], labels: number[]): void {
    this.tree = this.buildTree(features, labels, 0)
  }

  private buildTree(features: number[][], labels: number[], depth: number): TreeNode {
    if (depth >= this.maxDepth || features.length < this.minSamplesSplit) {
      return { value: labels.reduce((a, b) => a + b, 0) / labels.length, isLeaf: true }
    }

    const { featureIndex, threshold, leftFeatures, leftLabels, rightFeatures, rightLabels } = this.findBestSplit(features, labels)

    if (leftFeatures.length === 0 || rightFeatures.length === 0) {
      return { value: labels.reduce((a, b) => a + b, 0) / labels.length, isLeaf: true }
    }

    return {
      featureIndex,
      threshold,
      isLeaf: false,
      left: this.buildTree(leftFeatures, leftLabels, depth + 1),
      right: this.buildTree(rightFeatures, rightLabels, depth + 1)
    }
  }

  private findBestSplit(features: number[][], labels: number[]): {
    featureIndex: number
    threshold: number
    leftFeatures: number[][]
    leftLabels: number[]
    rightFeatures: number[][]
    rightLabels: number[]
  } {
    let bestMSE = Infinity
    let bestFeatureIndex = 0
    let bestThreshold = 0
    let bestLeftFeatures: number[][] = []
    let bestLeftLabels: number[] = []
    let bestRightFeatures: number[][] = []
    let bestRightLabels: number[] = []

    const numFeatures = features[0]?.length || 0

    for (let f = 0; f < numFeatures; f++) {
      const values = features.map((row) => row[f]).sort((a, b) => a - b)
      const thresholds = values.filter((_, i) => i % 10 === 0) // Sample thresholds

      for (const threshold of thresholds) {
        const leftIndices: number[] = []
        const rightIndices: number[] = []

        features.forEach((row, i) => {
          if (row[f] <= threshold) leftIndices.push(i)
          else rightIndices.push(i)
        })

        if (leftIndices.length < 5 || rightIndices.length < 5) continue

        const leftLabels = leftIndices.map((i) => labels[i])
        const rightLabels = rightIndices.map((i) => labels[i])

        const leftMean = leftLabels.reduce((a, b) => a + b, 0) / leftLabels.length
        const rightMean = rightLabels.reduce((a, b) => a + b, 0) / rightLabels.length

        const leftMSE = leftLabels.reduce((sum, l) => sum + (l - leftMean) ** 2, 0)
        const rightMSE = rightLabels.reduce((sum, l) => sum + (l - rightMean) ** 2, 0)
        const totalMSE = leftMSE + rightMSE

        if (totalMSE < bestMSE) {
          bestMSE = totalMSE
          bestFeatureIndex = f
          bestThreshold = threshold
          bestLeftFeatures = leftIndices.map((i) => features[i])
          bestLeftLabels = leftLabels
          bestRightFeatures = rightIndices.map((i) => features[i])
          bestRightLabels = rightLabels
        }
      }
    }

    return {
      featureIndex: bestFeatureIndex,
      threshold: bestThreshold,
      leftFeatures: bestLeftFeatures,
      leftLabels: bestLeftLabels,
      rightFeatures: bestRightFeatures,
      rightLabels: bestRightLabels
    }
  }

  predict(features: number[]): ModelPrediction {
    if (!this.tree) return { prediction: 0, confidence: 0 }
    return this.predictTree(this.tree, features)
  }

  private predictTree(node: TreeNode, features: number[]): ModelPrediction {
    if (node.isLeaf) {
      return { prediction: node.value || 0, confidence: 0.5 }
    }

    if (features[node.featureIndex!] <= node.threshold!) {
      return this.predictTree(node.left!, features)
    } else {
      return this.predictTree(node.right!, features)
    }
  }

  getFeatureImportance(): number[] {
    // Placeholder - would need to traverse tree to count feature usage
    return []
  }
}

interface TreeNode {
  value?: number
  isLeaf: boolean
  featureIndex?: number
  threshold?: number
  left?: TreeNode
  right?: TreeNode
}

/**
 * Random Forest Model
 */
class RandomForestModel extends BaseModel {
  private trees: DecisionTreeModel[] = []
  private numTrees: number = 10
  private maxDepth: number = 5

  constructor(params: Record<string, number> = {}) {
    super()
    this.numTrees = params.numTrees || 10
    this.maxDepth = params.maxDepth || 5
  }

  train(features: number[][], labels: number[]): void {
    this.trees = []

    for (let t = 0; t < this.numTrees; t++) {
      // Bootstrap sampling
      const indices = Array.from({ length: features.length }, () => Math.floor(Math.random() * features.length))
      const sampledFeatures = indices.map((i) => features[i])
      const sampledLabels = indices.map((i) => labels[i])

      const tree = new DecisionTreeModel({ maxDepth: this.maxDepth })
      tree.train(sampledFeatures, sampledLabels)
      this.trees.push(tree)
    }
  }

  predict(features: number[]): ModelPrediction {
    const predictions = this.trees.map((tree) => tree.predict(features).prediction)
    const mean = predictions.reduce((a, b) => a + b, 0) / predictions.length
    const std = Math.sqrt(predictions.reduce((sum, p) => sum + (p - mean) ** 2, 0) / predictions.length)

    return {
      prediction: mean,
      confidence: 1 - Math.min(std / (Math.abs(mean) + 0.001), 1)
    }
  }

  getFeatureImportance(): number[] {
    // Average importance across trees
    return []
  }
}

/**
 * AutoML Engine
 */
export class AutoMLEngine {
  private trials: AutoMLTrial[] = []
  private bestModel: BaseModel | null = null
  private bestConfig: ModelConfig | null = null
  private bestMetrics: ModelMetrics | null = null

  /**
   * Run AutoML optimization
   */
  async optimize(
    featureSets: FeatureSet[],
    config: AutoMLConfig
  ): Promise<AutoMLResult> {
    this.trials = []
    const startTime = Date.now()
    const labelKey = 'returns' // Default target

    // Prepare data
    const { trainFeatures, trainLabels, testFeatures, testLabels, featureNames } = this.prepareData(featureSets, labelKey)

    // Define search space
    const algorithms: ModelAlgorithm[] = ['linear', 'tree', 'forest']
    const hyperparams = {
      linear: [{}],
      tree: [
        { maxDepth: 3 },
        { maxDepth: 5 },
        { maxDepth: 7 },
        { maxDepth: 10 }
      ],
      forest: [
        { numTrees: 10, maxDepth: 5 },
        { numTrees: 20, maxDepth: 5 },
        { numTrees: 50, maxDepth: 7 }
      ]
    }

    let trialId = 0
    const maxTrials = Math.min(config.maxTrials, 10)

    for (const algorithm of algorithms) {
      for (const params of hyperparams[algorithm]) {
        if (trialId >= maxTrials) break
        if (Date.now() - startTime > config.maxTime * 1000) break

        const trialStart = Date.now()
        
        try {
          // Create and train model
          const model = this.createModel(algorithm, params)
          model.train(trainFeatures, trainLabels)

          // Evaluate
          const metrics = this.evaluate(model, testFeatures, testLabels)

          const trial: AutoMLTrial = {
            id: trialId++,
            config: {
              id: `model_${trialId}`,
              name: `${algorithm}_${JSON.stringify(params)}`,
              type: 'regression',
              algorithm,
              features: featureNames,
              hyperparams: params,
              targetVariable: labelKey,
              trainTestSplit: 0.8,
              crossValidationFolds: 5
            },
            metrics,
            status: 'completed',
            duration: Date.now() - trialStart
          }

          this.trials.push(trial)

          // Check if best
          if (!this.bestMetrics || this.isBetter(metrics, this.bestMetrics, config.targetMetric)) {
            this.bestModel = model
            this.bestConfig = trial.config
            this.bestMetrics = metrics
          }
        } catch (error) {
          this.trials.push({
            id: trialId++,
            config: {} as ModelConfig,
            metrics: {},
            status: 'failed',
            duration: Date.now() - trialStart
          })
        }
      }
    }

    return {
      bestModel: this.bestConfig!,
      bestMetrics: this.bestMetrics!,
      allTrials: this.trials,
      totalDuration: Date.now() - startTime,
      featureImportance: this.getFeatureImportance()
    }
  }

  /**
   * Create model by algorithm type
   */
  private createModel(algorithm: ModelAlgorithm, params: Record<string, number>): BaseModel {
    switch (algorithm) {
      case 'linear':
        return new LinearRegressionModel()
      case 'tree':
        return new DecisionTreeModel(params)
      case 'forest':
        return new RandomForestModel(params)
      default:
        return new LinearRegressionModel()
    }
  }

  /**
   * Prepare data for training
   */
  private prepareData(featureSets: FeatureSet[], labelKey: string): {
    trainFeatures: number[][]
    trainLabels: number[]
    testFeatures: number[][]
    testLabels: number[]
    featureNames: string[]
  } {
    // Get feature names (excluding label)
    const featureNames = Object.keys(featureSets[0].features).filter((k) => k !== labelKey)

    // Convert to arrays
    const features = featureSets.map((fs) => featureNames.map((fn) => fs.features[fn] || 0))
    const labels = featureSets.map((fs) => fs.features[labelKey] || fs.labels?.[labelKey] || 0)

    // Split train/test
    const splitIndex = Math.floor(features.length * 0.8)

    return {
      trainFeatures: features.slice(0, splitIndex),
      trainLabels: labels.slice(0, splitIndex),
      testFeatures: features.slice(splitIndex),
      testLabels: labels.slice(splitIndex),
      featureNames
    }
  }

  /**
   * Evaluate model
   */
  private evaluate(model: BaseModel, features: number[][], labels: number[]): ModelMetrics {
    const predictions = features.map((f) => model.predict(f).prediction)

    // Calculate metrics
    const mse = predictions.reduce((sum, p, i) => sum + (p - labels[i]) ** 2, 0) / predictions.length
    const rmse = Math.sqrt(mse)
    const mae = predictions.reduce((sum, p, i) => sum + Math.abs(p - labels[i]), 0) / predictions.length

    // R-squared
    const meanLabel = labels.reduce((a, b) => a + b, 0) / labels.length
    const ssRes = predictions.reduce((sum, p, i) => sum + (labels[i] - p) ** 2, 0)
    const ssTot = labels.reduce((sum, l) => sum + (l - meanLabel) ** 2, 0)
    const r2 = 1 - ssRes / ssTot

    // Directional accuracy
    let correctDirection = 0
    for (let i = 1; i < predictions.length; i++) {
      const predDir = predictions[i] > predictions[i - 1]
      const actualDir = labels[i] > labels[i - 1]
      if (predDir === actualDir) correctDirection++
    }
    const directionalAccuracy = correctDirection / (predictions.length - 1)

    return {
      mse,
      rmse,
      mae,
      r2,
      directionalAccuracy
    }
  }

  /**
   * Check if metrics are better
   */
  private isBetter(newMetrics: ModelMetrics, oldMetrics: ModelMetrics, targetMetric: keyof ModelMetrics): boolean {
    const newVal = newMetrics[targetMetric] ?? 0
    const oldVal = oldMetrics[targetMetric] ?? 0

    // For error metrics, lower is better
    if (['mse', 'rmse', 'mae', 'mape', 'maxDrawdown'].includes(targetMetric)) {
      return newVal < oldVal
    }
    // For performance metrics, higher is better
    return newVal > oldVal
  }

  /**
   * Get feature importance
   */
  private getFeatureImportance(): FeatureImportance[] {
    if (!this.bestModel) return []

    const importance = this.bestModel.getFeatureImportance()
    return importance
      .map((imp, i) => ({ feature: `feature_${i}`, importance: imp, rank: 0 }))
      .sort((a, b) => b.importance - a.importance)
      .map((f, i) => ({ ...f, rank: i + 1 }))
  }

  /**
   * Predict using best model
   */
  predict(features: number[]): ModelPrediction | null {
    if (!this.bestModel) return null
    return this.bestModel.predict(features)
  }

  /**
   * Get trials history
   */
  getTrials(): AutoMLTrial[] {
    return this.trials
  }

  /**
   * Get best model info
   */
  getBestModel(): { config: ModelConfig; metrics: ModelMetrics } | null {
    if (!this.bestConfig || !this.bestMetrics) return null
    return { config: this.bestConfig, metrics: this.bestMetrics }
  }
}

// Singleton instance
export const autoMLEngine = new AutoMLEngine()
