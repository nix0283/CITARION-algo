/**
 * Model Registry
 * Version control and management for ML models
 */

import type {
  ModelConfig,
  ModelVersion,
  ModelMetrics,
  ABTest,
  ABTestResult
} from './types'

export interface StoredModel {
  config: ModelConfig
  weights: unknown
  metrics: ModelMetrics
  createdAt: number
}

export class ModelRegistry {
  private models: Map<string, StoredModel> = new Map()
  private versions: Map<string, ModelVersion[]> = new Map()
  private activeModels: Map<string, string> = new Map() // modelId -> versionId
  private abTests: Map<string, ABTest> = new Map()

  /**
   * Register a new model
   */
  registerModel(
    config: ModelConfig,
    weights: unknown,
    metrics: ModelMetrics
  ): ModelVersion {
    const versionId = `${config.id}_v${Date.now()}`
    
    const version: ModelVersion = {
      id: versionId,
      modelId: config.id,
      version: `1.${this.versions.get(config.id)?.length || 0}`,
      createdAt: Date.now(),
      createdBy: 'system',
      metrics,
      status: 'testing',
      config
    }

    // Store model
    this.models.set(versionId, {
      config,
      weights,
      metrics,
      createdAt: Date.now()
    })

    // Add to versions
    const modelVersions = this.versions.get(config.id) || []
    modelVersions.push(version)
    this.versions.set(config.id, modelVersions)

    return version
  }

  /**
   * Get model by version ID
   */
  getModel(versionId: string): StoredModel | null {
    return this.models.get(versionId) || null
  }

  /**
   * Get all versions of a model
   */
  getVersions(modelId: string): ModelVersion[] {
    return this.versions.get(modelId) || []
  }

  /**
   * Get active version for a model
   */
  getActiveVersion(modelId: string): ModelVersion | null {
    const versionId = this.activeModels.get(modelId)
    if (!versionId) return null

    const versions = this.versions.get(modelId) || []
    return versions.find((v) => v.id === versionId) || null
  }

  /**
   * Set active version
   */
  setActiveVersion(modelId: string, versionId: string): boolean {
    const versions = this.versions.get(modelId) || []
    const version = versions.find((v) => v.id === versionId)

    if (!version) return false

    // Deprecate previous active
    versions.forEach((v) => {
      if (v.status === 'active') v.status = 'deprecated'
    })

    // Set new active
    version.status = 'active'
    this.activeModels.set(modelId, versionId)

    return true
  }

  /**
   * Create A/B test
   */
  createABTest(
    name: string,
    modelAId: string,
    modelBId: string,
    trafficSplit: number = 0.5
  ): ABTest {
    const test: ABTest = {
      id: `abtest_${Date.now()}`,
      name,
      modelA: modelAId,
      modelB: modelBId,
      startDate: Date.now(),
      trafficSplit,
      status: 'running'
    }

    this.abTests.set(test.id, test)
    return test
  }

  /**
   * Get A/B test
   */
  getABTest(testId: string): ABTest | null {
    return this.abTests.get(testId) || null
  }

  /**
   * Update A/B test results
   */
  updateABTestResults(
    testId: string,
    modelAMetrics: ModelMetrics,
    modelBMetrics: ModelMetrics
  ): ABTest | null {
    const test = this.abTests.get(testId)
    if (!test) return null

    // Determine winner based on Sharpe ratio or directional accuracy
    const metricA = modelAMetrics.sharpeRatio ?? modelAMetrics.directionalAccuracy ?? 0
    const metricB = modelBMetrics.sharpeRatio ?? modelBMetrics.directionalAccuracy ?? 0

    const confidence = Math.abs(metricA - metricB) / Math.max(metricA, metricB, 0.001)

    test.results = {
      modelAMetrics,
      modelBMetrics,
      winner: metricA >= metricB ? 'A' : 'B',
      confidence
    }

    return test
  }

  /**
   * End A/B test
   */
  endABTest(testId: string): ABTest | null {
    const test = this.abTests.get(testId)
    if (!test) return null

    test.status = 'completed'
    test.endDate = Date.now()

    // Promote winner to active
    if (test.results?.winner === 'A') {
      this.setActiveVersion(test.modelA.split('_v')[0], test.modelA)
    } else if (test.results?.winner === 'B') {
      this.setActiveVersion(test.modelB.split('_v')[0], test.modelB)
    }

    return test
  }

  /**
   * Select model for inference (A/B test aware)
   */
  selectModelForInference(modelId: string): StoredModel | null {
    // Check for running A/B tests
    for (const test of this.abTests.values()) {
      if (test.status !== 'running') continue

      const modelAId = test.modelA.split('_v')[0]
      if (modelAId === modelId) {
        // Random selection based on traffic split
        const useModelA = Math.random() < test.trafficSplit
        const versionId = useModelA ? test.modelA : test.modelB
        return this.models.get(versionId) || null
      }
    }

    // No A/B test, use active version
    const activeVersion = this.getActiveVersion(modelId)
    if (!activeVersion) return null

    return this.models.get(activeVersion.id) || null
  }

  /**
   * Deprecate old versions
   */
  deprecateOldVersions(modelId: string, keepVersions: number = 5): void {
    const versions = this.versions.get(modelId) || []
    const activeVersion = this.activeModels.get(modelId)

    // Sort by creation date (newest first)
    const sorted = [...versions].sort((a, b) => b.createdAt - a.createdAt)

    // Mark old versions as deprecated
    sorted.forEach((v, i) => {
      if (i >= keepVersions && v.id !== activeVersion) {
        v.status = 'deprecated'
        this.models.delete(v.id)
      }
    })
  }

  /**
   * Get model statistics
   */
  getStats(): {
    totalModels: number
    totalVersions: number
    activeABTests: number
    modelsByType: Record<string, number>
  } {
    let totalVersions = 0
    const modelsByType: Record<string, number> = {}

    for (const versions of this.versions.values()) {
      totalVersions += versions.length
      if (versions.length > 0) {
        const type = versions[0].config.type
        modelsByType[type] = (modelsByType[type] || 0) + 1
      }
    }

    let activeABTests = 0
    for (const test of this.abTests.values()) {
      if (test.status === 'running') activeABTests++
    }

    return {
      totalModels: this.versions.size,
      totalVersions,
      activeABTests,
      modelsByType
    }
  }

  /**
   * Export model for backup
   */
  exportModel(versionId: string): string | null {
    const model = this.models.get(versionId)
    if (!model) return null

    return JSON.stringify({
      config: model.config,
      metrics: model.metrics,
      createdAt: model.createdAt
    })
  }

  /**
   * Import model from backup
   */
  importModel(data: string): ModelVersion | null {
    try {
      const parsed = JSON.parse(data) as StoredModel
      return this.registerModel(parsed.config, null, parsed.metrics)
    } catch {
      return null
    }
  }

  /**
   * Clear all models (for testing)
   */
  clear(): void {
    this.models.clear()
    this.versions.clear()
    this.activeModels.clear()
    this.abTests.clear()
  }
}

// Singleton instance
export const modelRegistry = new ModelRegistry()
