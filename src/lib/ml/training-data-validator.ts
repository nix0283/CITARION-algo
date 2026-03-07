/**
 * Training Data Validator
 * 
 * Validates training data for ML models, detecting:
 * - Label leakage (labels using future information)
 * - Look-ahead bias in features
 * - Improper time-based splitting
 * 
 * IMPORTANT: This validator ensures that training data respects
 * temporal ordering and doesn't use future information.
 */

import type {
  TrainingSample,
  LabelLeakageResult,
  LabelLeakageIssue,
  TimeSplitConfig,
  TimeSplit,
  TimeSplitResult,
  PurgedCrossValidationConfig,
  PurgedCVFold,
  PurgedCVResult,
  TrainingDataValidationResult,
  WalkForwardConfig,
  WalkForwardFold,
  WalkForwardResult,
} from './types'

/**
 * Training Data Validator
 * 
 * Provides methods to validate training data for common ML issues
 * in financial applications, particularly label leakage and
 * improper time-based splitting.
 */
export class TrainingDataValidator {
  private config: {
    maxFeatureLabelCorrelation: number
    minEmbargoBars: number
    minTimeGap: number
    strictMode: boolean
  }

  constructor(config?: Partial<{
    maxFeatureLabelCorrelation: number
    minEmbargoBars: number
    minTimeGap: number
    strictMode: boolean
  }>) {
    this.config = {
      maxFeatureLabelCorrelation: config?.maxFeatureLabelCorrelation ?? 0.7,
      minEmbargoBars: config?.minEmbargoBars ?? 5,
      minTimeGap: config?.minTimeGap ?? 1000, // 1 second minimum
      strictMode: config?.strictMode ?? true,
    }
  }

  // ==========================================================================
  // LABEL LEAKAGE DETECTION
  // ==========================================================================

  /**
   * Check for label leakage in training data
   * 
   * Label leakage occurs when:
   * 1. Labels are calculated using information that wouldn't be available at prediction time
   * 2. Features contain information about the label (e.g., future returns)
   * 3. Data is split improperly, allowing train/test overlap
   * 
   * @param samples - Training samples to validate
   * @param featureNames - Names of features to check
   * @returns Label leakage detection result
   */
  checkLabelLeakage(samples: TrainingSample[], featureNames?: string[]): LabelLeakageResult {
    const issues: LabelLeakageIssue[] = []
    const suspiciousFeatures: string[] = []
    const affectedSamples: number[] = []
    const recommendations: string[] = []

    if (samples.length === 0) {
      return {
        hasLeakage: false,
        severity: 'none',
        issues: [],
        suspiciousFeatures: [],
        affectedSamples: [],
        recommendations: ['No samples to validate'],
      }
    }

    // Get all feature names if not provided
    const allFeatureNames = featureNames || Object.keys(samples[0]?.features || {})
    
    // 1. Check temporal ordering
    const timeOrderIssues = this.checkTimeOrdering(samples)
    issues.push(...timeOrderIssues.issues)
    affectedSamples.push(...timeOrderIssues.affectedSamples)

    // 2. Check feature-label correlations
    const correlationIssues = this.checkFeatureLabelCorrelation(samples, allFeatureNames)
    issues.push(...correlationIssues.issues)
    suspiciousFeatures.push(...correlationIssues.suspiciousFeatures)
    affectedSamples.push(...correlationIssues.affectedSamples)

    // 3. Check for future timestamps in labels
    const futureTimestampIssues = this.checkFutureTimestamps(samples)
    issues.push(...futureTimestampIssues.issues)
    affectedSamples.push(...futureTimestampIssues.affectedSamples)

    // 4. Check label calculation methodology
    const labelIssues = this.checkLabelMethodology(samples)
    issues.push(...labelIssues.issues)
    affectedSamples.push(...labelIssues.affectedSamples)

    // Determine severity
    let severity: LabelLeakageResult['severity'] = 'none'
    if (issues.some(i => i.severity === 'critical')) {
      severity = 'critical'
    } else if (issues.some(i => i.severity === 'error')) {
      severity = 'high'
    } else if (issues.some(i => i.severity === 'warning')) {
      severity = 'medium'
    } else if (issues.length > 0) {
      severity = 'low'
    }

    // Generate recommendations
    if (severity !== 'none') {
      recommendations.push('Use proper time-based train/test splitting')
      recommendations.push('Ensure labels are calculated only from data available after feature timestamp')
      recommendations.push(`Use at least ${this.config.minEmbargoBars} bars embargo period between train and test`)
      
      if (suspiciousFeatures.length > 0) {
        recommendations.push(
          `Review features: ${suspiciousFeatures.slice(0, 5).join(', ')}${suspiciousFeatures.length > 5 ? '...' : ''}`
        )
      }
    }

    return {
      hasLeakage: issues.length > 0,
      severity,
      issues,
      suspiciousFeatures: [...new Set(suspiciousFeatures)],
      affectedSamples: [...new Set(affectedSamples)].sort((a, b) => a - b),
      recommendations,
    }
  }

  /**
   * Check temporal ordering of samples
   */
  private checkTimeOrdering(samples: TrainingSample[]): {
    issues: LabelLeakageIssue[]
    affectedSamples: number[]
  } {
    const issues: LabelLeakageIssue[] = []
    const affectedSamples: number[] = []

    // Check if samples are sorted by timestamp
    let isSorted = true
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].timestamp < samples[i - 1].timestamp) {
        isSorted = false
        affectedSamples.push(i)
      }
    }

    if (!isSorted) {
      issues.push({
        type: 'improper_time_split',
        description: 'Samples are not sorted by timestamp. This can lead to look-ahead bias.',
        severity: 'warning',
        sampleIndices: affectedSamples,
        suggestion: 'Sort samples by timestamp before training',
      })
    }

    // Check feature timestamp vs label timestamp
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]
      if (sample.featureTimestamp && sample.labelTimestamp) {
        if (sample.labelTimestamp < sample.featureTimestamp) {
          issues.push({
            type: 'label_from_future',
            description: `Sample ${i}: Label timestamp is before feature timestamp`,
            severity: 'critical',
            sampleIndices: [i],
            suggestion: 'Label must be determined after features are available',
          })
          affectedSamples.push(i)
        }
      }
    }

    return { issues, affectedSamples }
  }

  /**
   * Check feature-label correlations for potential leakage
   */
  private checkFeatureLabelCorrelation(
    samples: TrainingSample[],
    featureNames: string[]
  ): {
    issues: LabelLeakageIssue[]
    suspiciousFeatures: string[]
    affectedSamples: number[]
  } {
    const issues: LabelLeakageIssue[] = []
    const suspiciousFeatures: string[] = []
    const affectedSamples: number[] = []

    // Convert labels to numbers
    const labelMap: Record<string, number> = { LONG: 1, NEUTRAL: 0, SHORT: -1 }
    const labels = samples.map(s => labelMap[s.label] || 0)

    // Check each feature
    for (const featureName of featureNames) {
      const values = samples.map(s => s.features[featureName]).filter(v => v !== undefined)
      
      if (values.length < 10) continue // Need enough samples

      // Calculate correlation
      const correlation = this.calculateCorrelation(
        samples.map(s => s.features[featureName] || 0),
        labels
      )

      if (Math.abs(correlation) > this.config.maxFeatureLabelCorrelation) {
        suspiciousFeatures.push(featureName)
        
        issues.push({
          type: 'feature_label_correlation',
          description: `Feature "${featureName}" has high correlation (${correlation.toFixed(3)}) with label`,
          featureName,
          severity: Math.abs(correlation) > 0.9 ? 'critical' : 'error',
          suggestion: 'This feature may contain future information. Review its calculation.',
        })

        // Add samples with extreme values as affected
        samples.forEach((s, i) => {
          const val = s.features[featureName]
          if (val !== undefined && (Math.abs(val) > 2 || isNaN(val))) {
            affectedSamples.push(i)
          }
        })
      }
    }

    return { issues, suspiciousFeatures, affectedSamples }
  }

  /**
   * Check for future timestamps in samples
   */
  private checkFutureTimestamps(samples: TrainingSample[]): {
    issues: LabelLeakageIssue[]
    affectedSamples: number[]
  } {
    const issues: LabelLeakageIssue[] = []
    const affectedSamples: number[] = []
    const now = Date.now()

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]
      
      // Check if timestamp is in the future
      if (sample.timestamp > now) {
        issues.push({
          type: 'future_data_in_features',
          description: `Sample ${i} has timestamp in the future`,
          severity: 'error',
          sampleIndices: [i],
          suggestion: 'Remove samples with future timestamps',
        })
        affectedSamples.push(i)
      }
    }

    return { issues, affectedSamples }
  }

  /**
   * Check label calculation methodology
   */
  private checkLabelMethodology(samples: TrainingSample[]): {
    issues: LabelLeakageIssue[]
    affectedSamples: number[]
  } {
    const issues: LabelLeakageIssue[] = []
    const affectedSamples: number[] = []

    // Check for suspicious label patterns
    const labelCounts: Record<string, number> = { LONG: 0, SHORT: 0, NEUTRAL: 0 }
    samples.forEach(s => {
      labelCounts[s.label] = (labelCounts[s.label] || 0) + 1
    })

    // Check for extreme imbalance
    const total = samples.length
    const maxLabelPct = Math.max(...Object.values(labelCounts)) / total
    
    if (maxLabelPct > 0.95) {
      issues.push({
        type: 'label_from_future',
        description: `Extreme label imbalance: ${maxLabelPct * 100}% of samples have the same label`,
        severity: 'warning',
        suggestion: 'Review label calculation methodology for potential bias',
      })
    }

    // Check for perfect prediction patterns (all same label after certain point)
    let consecutiveSame = 1
    let maxConsecutive = 1
    let consecutiveStart = 0
    const firstLabel = samples[0]?.label
    
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].label === firstLabel) {
        consecutiveSame++
        if (consecutiveSame > maxConsecutive) {
          maxConsecutive = consecutiveSame
        }
      } else {
        consecutiveSame = 1
      }
    }

    if (maxConsecutive > samples.length * 0.5) {
      issues.push({
        type: 'label_from_future',
        description: `Suspicious label pattern: ${maxConsecutive} consecutive same labels`,
        severity: 'warning',
        suggestion: 'Label calculation may be using information that creates artificial patterns',
      })
    }

    return { issues, affectedSamples }
  }

  // ==========================================================================
  // TIME VALIDATION
  // ==========================================================================

  /**
   * Validate time ordering of training data
   */
  validateTimeOrder(samples: TrainingSample[]): {
    valid: boolean
    issues: string[]
    sortedFrom: number
    sortedTo: number
  } {
    const issues: string[] = []
    let sortedFrom = -1
    let sortedTo = samples.length

    // Find where sorting breaks
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].timestamp < samples[i - 1].timestamp) {
        if (sortedFrom === -1) sortedFrom = i - 1
        sortedTo = i
      }
    }

    if (sortedFrom !== -1) {
      issues.push(`Data not sorted from index ${sortedFrom} to ${sortedTo}`)
    }

    // Check for duplicate timestamps
    const timestamps = new Map<number, number>()
    for (let i = 0; i < samples.length; i++) {
      const ts = samples[i].timestamp
      if (timestamps.has(ts)) {
        issues.push(`Duplicate timestamp at index ${i} and ${timestamps.get(ts)}`)
      }
      timestamps.set(ts, i)
    }

    return {
      valid: issues.length === 0,
      issues,
      sortedFrom,
      sortedTo,
    }
  }

  // ==========================================================================
  // TIME-BASED SPLITTING
  // ==========================================================================

  /**
   * Create time-based train/test split
   */
  createTimeSplit(samples: TrainingSample[], config: TimeSplitConfig): TimeSplitResult {
    const issues: string[] = []
    const splits: TimeSplit[] = []

    const totalSamples = samples.length
    const trainSize = Math.floor(totalSamples * config.trainRatio)
    const embargoSize = config.embargoBars

    // Simple split
    if (config.type === 'simple') {
      const trainEnd = trainSize
      const testStart = trainEnd + embargoSize + config.purgeBars
      const testEnd = totalSamples

      if (testStart >= testEnd) {
        issues.push('Not enough samples for test set after embargo/purge')
      } else {
        splits.push({
          splitIndex: 0,
          trainIndices: Array.from({ length: trainEnd }, (_, i) => i),
          testIndices: Array.from({ length: testEnd - testStart }, (_, i) => testStart + i),
          trainPeriod: {
            start: samples[0]?.timestamp || 0,
            end: samples[trainEnd - 1]?.timestamp || 0,
          },
          testPeriod: {
            start: samples[testStart]?.timestamp || 0,
            end: samples[testEnd - 1]?.timestamp || 0,
          },
          embargoPeriod: {
            start: samples[trainEnd]?.timestamp || 0,
            end: samples[testStart - 1]?.timestamp || 0,
          },
        })
      }
    }

    // Walk-forward splits
    else if (config.type === 'walk_forward' && config.nFolds) {
      const foldSize = Math.floor((totalSamples - trainSize) / config.nFolds)
      
      for (let fold = 0; fold < config.nFolds; fold++) {
        const trainEnd = trainSize + fold * foldSize
        const testStart = trainEnd + embargoSize + config.purgeBars
        const testEnd = Math.min(testStart + foldSize, totalSamples)

        if (testStart < testEnd) {
          splits.push({
            splitIndex: fold,
            trainIndices: Array.from({ length: trainEnd }, (_, i) => i),
            testIndices: Array.from({ length: testEnd - testStart }, (_, i) => testStart + i),
            trainPeriod: {
              start: samples[0]?.timestamp || 0,
              end: samples[trainEnd - 1]?.timestamp || 0,
            },
            testPeriod: {
              start: samples[testStart]?.timestamp || 0,
              end: samples[testEnd - 1]?.timestamp || 0,
            },
            embargoPeriod: {
              start: samples[trainEnd]?.timestamp || 0,
              end: samples[testStart - 1]?.timestamp || 0,
            },
          })
        }
      }
    }

    // Anchored walk-forward
    else if (config.type === 'anchored' && config.windowSize && config.stepSize) {
      let testStart = config.windowSize + embargoSize + config.purgeBars
      let splitIndex = 0

      while (testStart < totalSamples) {
        const trainEnd = testStart - embargoSize - config.purgeBars
        const testEnd = Math.min(testStart + config.windowSize, totalSamples)

        if (trainEnd > 0 && testStart < testEnd) {
          splits.push({
            splitIndex,
            trainIndices: Array.from({ length: trainEnd }, (_, i) => i),
            testIndices: Array.from({ length: testEnd - testStart }, (_, i) => testStart + i),
            trainPeriod: {
              start: samples[0]?.timestamp || 0,
              end: samples[trainEnd - 1]?.timestamp || 0,
            },
            testPeriod: {
              start: samples[testStart]?.timestamp || 0,
              end: samples[testEnd - 1]?.timestamp || 0,
            },
            embargoPeriod: {
              start: samples[trainEnd]?.timestamp || 0,
              end: samples[testStart - 1]?.timestamp || 0,
            },
          })
        }

        testStart += config.stepSize
        splitIndex++
      }
    }

    // Expanding window
    else if (config.type === 'expanding' && config.windowSize && config.stepSize) {
      const initialTrainSize = config.windowSize
      let testStart = initialTrainSize + embargoSize + config.purgeBars
      let splitIndex = 0

      while (testStart < totalSamples) {
        const trainEnd = testStart - embargoSize - config.purgeBars
        const testEnd = Math.min(testStart + config.stepSize, totalSamples)

        if (trainEnd > 0 && testStart < testEnd) {
          splits.push({
            splitIndex,
            trainIndices: Array.from({ length: trainEnd }, (_, i) => i),
            testIndices: Array.from({ length: testEnd - testStart }, (_, i) => testStart + i),
            trainPeriod: {
              start: samples[0]?.timestamp || 0,
              end: samples[trainEnd - 1]?.timestamp || 0,
            },
            testPeriod: {
              start: samples[testStart]?.timestamp || 0,
              end: samples[testEnd - 1]?.timestamp || 0,
            },
            embargoPeriod: {
              start: samples[trainEnd]?.timestamp || 0,
              end: samples[testStart - 1]?.timestamp || 0,
            },
          })
        }

        testStart += config.stepSize
        splitIndex++
      }
    }

    // Rolling window
    else if (config.type === 'rolling' && config.windowSize && config.stepSize) {
      let windowStart = 0
      let splitIndex = 0

      while (windowStart + config.windowSize + embargoSize + config.purgeBars < totalSamples) {
        const trainEnd = windowStart + config.windowSize
        const testStart = trainEnd + embargoSize + config.purgeBars
        const testEnd = Math.min(testStart + config.stepSize, totalSamples)

        if (testStart < testEnd) {
          splits.push({
            splitIndex,
            trainIndices: Array.from({ length: config.windowSize }, (_, i) => windowStart + i),
            testIndices: Array.from({ length: testEnd - testStart }, (_, i) => testStart + i),
            trainPeriod: {
              start: samples[windowStart]?.timestamp || 0,
              end: samples[trainEnd - 1]?.timestamp || 0,
            },
            testPeriod: {
              start: samples[testStart]?.timestamp || 0,
              end: samples[testEnd - 1]?.timestamp || 0,
            },
            embargoPeriod: {
              start: samples[trainEnd]?.timestamp || 0,
              end: samples[testStart - 1]?.timestamp || 0,
            },
          })
        }

        windowStart += config.stepSize
        splitIndex++
      }
    }

    // Calculate statistics
    const avgTrainSize = splits.length > 0
      ? splits.reduce((sum, s) => sum + s.trainIndices.length, 0) / splits.length
      : 0
    const avgTestSize = splits.length > 0
      ? splits.reduce((sum, s) => sum + s.testIndices.length, 0) / splits.length
      : 0

    return {
      config,
      splits,
      valid: issues.length === 0 && splits.length > 0,
      issues,
      statistics: {
        totalSamples,
        avgTrainSize,
        avgTestSize,
        minGapBetweenTrainTest: config.embargoBars + config.purgeBars,
        maxGapBetweenTrainTest: config.embargoBars + config.purgeBars,
      },
    }
  }

  // ==========================================================================
  // PURGED CROSS-VALIDATION
  // ==========================================================================

  /**
   * Calculate purged cross-validation folds
   * 
   * Purged CV is essential for financial data to prevent:
   * 1. Label leakage from overlapping periods
   * 2. Look-ahead bias from train/test proximity
   */
  calculatePurgedCrossValidation(
    samples: TrainingSample[],
    config: PurgedCrossValidationConfig
  ): PurgedCVResult {
    const issues: string[] = []
    const folds: PurgedCVFold[] = []
    const totalSamples = samples.length
    const foldSize = Math.floor(totalSamples / config.nFolds)

    if (foldSize < config.purgeBars * 2 + config.embargoBars) {
      issues.push('Fold size too small for purge and embargo periods')
    }

    for (let fold = 0; fold < config.nFolds; fold++) {
      const testStart = fold * foldSize
      const testEnd = (fold + 1) * foldSize

      // Purge periods before and after test
      const purgeBeforeStart = Math.max(0, testStart - config.purgeBars)
      const purgeAfterEnd = Math.min(totalSamples, testEnd + config.purgeBars)

      // Embargo period after test
      const embargoStart = purgeAfterEnd
      const embargoEnd = Math.min(totalSamples, embargoStart + config.embargoBars)

      // Training indices (everything except test, purge, and embargo)
      const trainIndices: number[] = []
      for (let i = 0; i < totalSamples; i++) {
        if (i < purgeBeforeStart || i >= embargoEnd) {
          // Not in purge or embargo
          if (i < testStart || i >= testEnd) {
            // Not in test
            trainIndices.push(i)
          }
        }
      }

      // Test indices
      const testIndices = Array.from({ length: testEnd - testStart }, (_, i) => testStart + i)

      // Purged indices
      const purgedIndices = [
        ...Array.from({ length: testStart - purgeBeforeStart }, (_, i) => purgeBeforeStart + i),
        ...Array.from({ length: purgeAfterEnd - testEnd }, (_, i) => testEnd + i),
      ]

      // Embargo indices
      const embargoIndices = Array.from(
        { length: embargoEnd - embargoStart },
        (_, i) => embargoStart + i
      )

      folds.push({
        foldIndex: fold,
        trainIndices,
        testIndices,
        purgedIndices,
        embargoIndices,
        trainPeriod: {
          start: samples[trainIndices[0]]?.timestamp || 0,
          end: samples[trainIndices[trainIndices.length - 1]]?.timestamp || 0,
        },
        testPeriod: {
          start: samples[testStart]?.timestamp || 0,
          end: samples[testEnd - 1]?.timestamp || 0,
        },
        purgePeriod: {
          beforeTest: {
            start: samples[purgeBeforeStart]?.timestamp || 0,
            end: samples[testStart - 1]?.timestamp || 0,
          },
          afterTest: {
            start: samples[testEnd]?.timestamp || 0,
            end: samples[purgeAfterEnd - 1]?.timestamp || 0,
          },
        },
        embargoPeriod: {
          start: samples[embargoStart]?.timestamp || 0,
          end: samples[embargoEnd - 1]?.timestamp || 0,
        },
      })
    }

    return {
      config,
      folds,
      valid: issues.length === 0,
      issues,
      statistics: {
        totalSamples,
        avgTrainSize: folds.reduce((sum, f) => sum + f.trainIndices.length, 0) / folds.length,
        avgTestSize: folds.reduce((sum, f) => sum + f.testIndices.length, 0) / folds.length,
        avgPurgedSize: folds.reduce((sum, f) => sum + f.purgedIndices.length, 0) / folds.length,
        avgEmbargoSize: folds.reduce((sum, f) => sum + f.embargoIndices.length, 0) / folds.length,
      },
    }
  }

  // ==========================================================================
  // WALK-FORWARD VALIDATION
  // ==========================================================================

  /**
   * Generate walk-forward validation folds
   */
  generateWalkForwardFolds(
    samples: TrainingSample[],
    config: WalkForwardConfig
  ): WalkForwardResult {
    const issues: string[] = []
    const folds: WalkForwardFold[] = []
    const totalSamples = samples.length

    if (config.initialTrainWindow + config.testWindow + config.embargoBars > totalSamples) {
      issues.push('Not enough samples for initial training window and test window')
    }

    let testStart = config.initialTrainWindow + config.embargoBars + config.purgeBars
    let foldIndex = 0

    while (testStart + config.testWindow <= totalSamples) {
      let trainEnd: number
      
      if (config.type === 'anchored') {
        // Fixed start, growing end
        trainEnd = testStart - config.embargoBars - config.purgeBars
      } else if (config.type === 'expanding') {
        // Growing window
        trainEnd = testStart - config.embargoBars - config.purgeBars
        const minTrain = config.minTrainWindow || config.initialTrainWindow
        const maxTrain = config.maxTrainWindow || trainEnd
        
        // Ensure minimum train size
        if (trainEnd < minTrain) {
          testStart += config.stepSize
          continue
        }
        
        // Cap at maximum train size
        if (trainEnd > maxTrain) {
          trainEnd = maxTrain
        }
      } else {
        // Rolling window
        trainEnd = testStart - config.embargoBars - config.purgeBars
        const trainStart = trainEnd - config.initialTrainWindow
        if (trainStart < 0) {
          testStart += config.stepSize
          continue
        }
      }

      const testEnd = testStart + config.testWindow

      // Training indices depend on type
      let trainIndices: number[]
      if (config.type === 'rolling') {
        const trainStart = trainEnd - config.initialTrainWindow
        trainIndices = Array.from({ length: config.initialTrainWindow }, (_, i) => trainStart + i)
      } else {
        trainIndices = Array.from({ length: trainEnd }, (_, i) => i)
      }

      const testIndices = Array.from({ length: config.testWindow }, (_, i) => testStart + i)

      folds.push({
        foldIndex,
        trainIndices,
        testIndices,
        trainPeriod: {
          start: samples[trainIndices[0]]?.timestamp || 0,
          end: samples[trainIndices[trainIndices.length - 1]]?.timestamp || 0,
        },
        testPeriod: {
          start: samples[testStart]?.timestamp || 0,
          end: samples[testEnd - 1]?.timestamp || 0,
        },
        trainSize: trainIndices.length,
        testSize: testIndices.length,
        embargoPeriod: config.embargoBars > 0 ? {
          start: samples[trainEnd]?.timestamp || 0,
          end: samples[testStart - 1]?.timestamp || 0,
        } : undefined,
      })

      testStart += config.stepSize
      foldIndex++
    }

    return {
      config,
      folds,
      valid: issues.length === 0 && folds.length > 0,
      issues,
      statistics: {
        totalFolds: folds.length,
        totalSamples,
        avgTrainSize: folds.length > 0
          ? folds.reduce((sum, f) => sum + f.trainSize, 0) / folds.length
          : 0,
        avgTestSize: folds.length > 0
          ? folds.reduce((sum, f) => sum + f.testSize, 0) / folds.length
          : 0,
        coverageRatio: folds.length > 0
          ? (folds[folds.length - 1].testPeriod.end - folds[0].trainPeriod.start) /
            (samples[samples.length - 1].timestamp - samples[0].timestamp)
          : 0,
      },
    }
  }

  // ==========================================================================
  // COMPREHENSIVE VALIDATION
  // ==========================================================================

  /**
   * Perform comprehensive validation of training data
   */
  validateTrainingData(samples: TrainingSample[]): TrainingDataValidationResult {
    // Check label leakage
    const labelLeakage = this.checkLabelLeakage(samples)

    // Check time order
    const timeOrder = this.validateTimeOrder(samples)

    // Calculate feature statistics
    const featureNames = Object.keys(samples[0]?.features || {})
    const featuresWithMissingValues: string[] = []
    const featuresWithConstantValues: string[] = []
    const featuresWithHighCorrelation: string[] = labelLeakage.suspiciousFeatures

    for (const name of featureNames) {
      const values = samples.map(s => s.features[name])
      const missing = values.filter(v => v === undefined || isNaN(v)).length
      
      if (missing > samples.length * 0.1) {
        featuresWithMissingValues.push(name)
      }

      const uniqueValues = new Set(values.filter(v => v !== undefined && !isNaN(v)))
      if (uniqueValues.size <= 1) {
        featuresWithConstantValues.push(name)
      }
    }

    // Calculate label distribution
    const labelCounts: Record<string, number> = { LONG: 0, SHORT: 0, NEUTRAL: 0 }
    samples.forEach(s => {
      labelCounts[s.label] = (labelCounts[s.label] || 0) + 1
    })

    const totalLabels = samples.length
    const maxLabelCount = Math.max(...Object.values(labelCounts))
    const imbalance = totalLabels > 0 ? (maxLabelCount / totalLabels - 0.33) / 0.67 : 0

    // Calculate overall score
    let score = 1.0
    if (labelLeakage.severity === 'critical') score = 0
    else if (labelLeakage.severity === 'high') score *= 0.3
    else if (labelLeakage.severity === 'medium') score *= 0.6
    else if (labelLeakage.severity === 'low') score *= 0.9

    if (!timeOrder.valid) score *= 0.7
    if (featuresWithMissingValues.length > 0) score *= 0.9
    if (featuresWithConstantValues.length > 0) score *= 0.95
    if (imbalance > 0.5) score *= 0.8

    // Generate recommendations
    const recommendations: string[] = []
    recommendations.push(...labelLeakage.recommendations)
    
    if (!timeOrder.valid) {
      recommendations.push('Sort training data by timestamp before training')
    }
    
    if (featuresWithMissingValues.length > 0) {
      recommendations.push(`Handle missing values in features: ${featuresWithMissingValues.slice(0, 3).join(', ')}`)
    }
    
    if (featuresWithConstantValues.length > 0) {
      recommendations.push(`Remove constant features: ${featuresWithConstantValues.join(', ')}`)
    }
    
    if (imbalance > 0.5) {
      recommendations.push('Address label imbalance through resampling or weighting')
    }

    return {
      valid: labelLeakage.severity !== 'critical' && timeOrder.valid,
      score,
      labelLeakage,
      timeOrder,
      featureStats: {
        totalFeatures: featureNames.length,
        featuresWithMissingValues,
        featuresWithConstantValues,
        featuresWithHighCorrelation,
      },
      labelDistribution: {
        long: labelCounts.LONG,
        short: labelCounts.SHORT,
        neutral: labelCounts.NEUTRAL,
        total: totalLabels,
        imbalance,
      },
      recommendations,
      validatedAt: Date.now(),
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length)
    if (n < 2) return 0

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0

    for (let i = 0; i < n; i++) {
      const xi = x[i] ?? 0
      const yi = y[i] ?? 0
      sumX += xi
      sumY += yi
      sumXY += xi * yi
      sumX2 += xi * xi
      sumY2 += yi * yi
    }

    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

    return denominator === 0 ? 0 : numerator / denominator
  }
}

// Singleton instance
let validatorInstance: TrainingDataValidator | null = null

/**
 * Get the singleton TrainingDataValidator instance
 */
export function getTrainingDataValidator(): TrainingDataValidator {
  if (!validatorInstance) {
    validatorInstance = new TrainingDataValidator()
  }
  return validatorInstance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetTrainingDataValidator(): void {
  validatorInstance = null
}

export default TrainingDataValidator
