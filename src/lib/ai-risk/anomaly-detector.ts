/**
 * Anomaly Detector
 * Detects market anomalies using multiple methods
 */

import type { OHLCV } from '../ml-pipeline/types'

export interface Anomaly {
  timestamp: number
  type: 'price' | 'volume' | 'volatility' | 'spread' | 'pattern'
  severity: 'low' | 'medium' | 'high' | 'critical'
  score: number // 0-1
  description: string
  context: Record<string, number>
}

export interface AnomalyAlert {
  timestamp: number
  anomalies: Anomaly[]
  totalScore: number
  recommendation: string
}

/**
 * Anomaly Detector Class
 */
export class AnomalyDetector {
  private history: Anomaly[] = []
  private thresholds = {
    price: 3.0, // Standard deviations
    volume: 5.0,
    volatility: 3.0,
    spread: 4.0
  }

  /**
   * Detect all types of anomalies
   */
  detect(ohlcv: OHLCV[]): AnomalyAlert {
    const anomalies: Anomaly[] = []

    // Price anomalies
    anomalies.push(...this.detectPriceAnomalies(ohlcv))

    // Volume anomalies
    anomalies.push(...this.detectVolumeAnomalies(ohlcv))

    // Volatility anomalies
    anomalies.push(...this.detectVolatilityAnomalies(ohlcv))

    // Pattern anomalies
    anomalies.push(...this.detectPatternAnomalies(ohlcv))

    // Calculate total score
    const totalScore = anomalies.reduce((max, a) => Math.max(max, a.score), 0)

    // Generate recommendation
    const recommendation = this.generateRecommendation(anomalies)

    // Store history
    this.history.push(...anomalies)

    return {
      timestamp: ohlcv[ohlcv.length - 1].timestamp,
      anomalies,
      totalScore,
      recommendation
    }
  }

  /**
   * Detect price anomalies using Z-score and IQR methods
   */
  private detectPriceAnomalies(ohlcv: OHLCV[]): Anomaly[] {
    const anomalies: Anomaly[] = []
    const closes = ohlcv.map((o) => o.close)
    const window = 20

    if (closes.length < window) return anomalies

    // Calculate returns
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i])

    // Z-score method
    const recentReturns = returns.slice(-window)
    const mean = recentReturns.reduce((a, b) => a + b, 0) / window
    const std = Math.sqrt(recentReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / window)
    const currentReturn = returns[returns.length - 1]

    const zScore = std > 0 ? Math.abs(currentReturn - mean) / std : 0

    if (zScore > this.thresholds.price) {
      const severity = this.getSeverity(zScore, 'price')
      anomalies.push({
        timestamp: ohlcv[ohlcv.length - 1].timestamp,
        type: 'price',
        severity,
        score: Math.min(1, zScore / 5),
        description: `Unusual price movement: ${(currentReturn * 100).toFixed(2)}% (${zScore.toFixed(2)}σ)`,
        context: { zScore, return: currentReturn, mean, std }
      })
    }

    // IQR method
    const sortedReturns = [...recentReturns].sort((a, b) => a - b)
    const q1 = sortedReturns[Math.floor(window * 0.25)]
    const q3 = sortedReturns[Math.floor(window * 0.75)]
    const iqr = q3 - q1

    const lowerBound = q1 - 1.5 * iqr
    const upperBound = q3 + 1.5 * iqr

    if (currentReturn < lowerBound || currentReturn > upperBound) {
      const severity = currentReturn < lowerBound - iqr || currentReturn > upperBound + iqr ? 'high' : 'medium'
      anomalies.push({
        timestamp: ohlcv[ohlcv.length - 1].timestamp,
        type: 'price',
        severity,
        score: Math.min(1, Math.abs(currentReturn - (currentReturn < lowerBound ? lowerBound : upperBound)) / iqr),
        description: `Price outside IQR bounds: ${(currentReturn * 100).toFixed(2)}%`,
        context: { iqr, lowerBound, upperBound, return: currentReturn }
      })
    }

    return anomalies
  }

  /**
   * Detect volume anomalies
   */
  private detectVolumeAnomalies(ohlcv: OHLCV[]): Anomaly[] {
    const anomalies: Anomaly[] = []
    const volumes = ohlcv.map((o) => o.volume)
    const window = 20

    if (volumes.length < window) return anomalies

    const recentVolumes = volumes.slice(-window)
    const currentVolume = volumes[volumes.length - 1]

    // Log-normal approach for volume
    const logVolumes = recentVolumes.map(Math.log)
    const mean = logVolumes.reduce((a, b) => a + b, 0) / window
    const std = Math.sqrt(logVolumes.reduce((sum, v) => sum + (v - mean) ** 2, 0) / window)
    const logCurrent = Math.log(currentVolume)

    const zScore = std > 0 ? Math.abs(logCurrent - mean) / std : 0

    if (zScore > this.thresholds.volume) {
      const severity = this.getSeverity(zScore, 'volume')
      anomalies.push({
        timestamp: ohlcv[ohlcv.length - 1].timestamp,
        type: 'volume',
        severity,
        score: Math.min(1, zScore / 7),
        description: `Unusual volume: ${currentVolume.toFixed(0)} (${zScore.toFixed(2)}σ above normal)`,
        context: { zScore, volume: currentVolume, avgVolume: Math.exp(mean) }
      })
    }

    return anomalies
  }

  /**
   * Detect volatility anomalies
   */
  private detectVolatilityAnomalies(ohlcv: OHLCV[]): Anomaly[] {
    const anomalies: Anomaly[] = []
    const window = 20

    if (ohlcv.length < window * 2) return anomalies

    // Calculate historical volatilities
    const volatilities: number[] = []
    for (let i = window; i < ohlcv.length; i++) {
      const slice = ohlcv.slice(i - window, i)
      const returns = slice.slice(1).map((o, j) => (o.close - slice[j].close) / slice[j].close)
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length
      const vol = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length)
      volatilities.push(vol)
    }

    // Current volatility
    const currentVol = volatilities[volatilities.length - 1]
    const historicalVols = volatilities.slice(0, -1)

    const meanVol = historicalVols.reduce((a, b) => a + b, 0) / historicalVols.length
    const stdVol = Math.sqrt(historicalVols.reduce((sum, v) => sum + (v - meanVol) ** 2, 0) / historicalVols.length)

    const zScore = stdVol > 0 ? Math.abs(currentVol - meanVol) / stdVol : 0

    if (zScore > this.thresholds.volatility) {
      const severity = this.getSeverity(zScore, 'volatility')
      anomalies.push({
        timestamp: ohlcv[ohlcv.length - 1].timestamp,
        type: 'volatility',
        severity,
        score: Math.min(1, zScore / 4),
        description: `Volatility regime change: ${zScore > 0 ? 'increased' : 'decreased'}`,
        context: { zScore, currentVol, meanVol, stdVol }
      })
    }

    return anomalies
  }

  /**
   * Detect pattern anomalies
   */
  private detectPatternAnomalies(ohlcv: OHLCV[]): Anomaly[] {
    const anomalies: Anomaly[] = []
    if (ohlcv.length < 10) return anomalies

    const last = ohlcv[ohlcv.length - 1]

    // Flash crash / pump detection
    const priceChange = (last.close - last.open) / last.open
    const wickRatio = Math.max(
      Math.abs(last.high - Math.max(last.open, last.close)),
      Math.abs(last.low - Math.min(last.open, last.close))
    ) / (last.high - last.low || 1)

    if (Math.abs(priceChange) > 0.05) { // 5% move
      anomalies.push({
        timestamp: last.timestamp,
        type: 'pattern',
        severity: Math.abs(priceChange) > 0.1 ? 'critical' : 'high',
        score: Math.min(1, Math.abs(priceChange) * 5),
        description: `Flash ${priceChange > 0 ? 'pump' : 'crash'}: ${(priceChange * 100).toFixed(2)}%`,
        context: { priceChange, wickRatio }
      })
    }

    // Gap detection
    if (ohlcv.length > 1) {
      const prev = ohlcv[ohlcv.length - 2]
      const gap = Math.abs(last.open - prev.close) / prev.close

      if (gap > 0.02) { // 2% gap
        anomalies.push({
          timestamp: last.timestamp,
          type: 'pattern',
          severity: gap > 0.05 ? 'high' : 'medium',
          score: Math.min(1, gap * 10),
          description: `Price gap: ${(gap * 100).toFixed(2)}%`,
          context: { gap, direction: last.open > prev.close ? 'up' : 'down' }
        })
      }
    }

    return anomalies
  }

  /**
   * Isolation Forest-like anomaly scoring (simplified)
   */
  isolationScore(value: number, data: number[]): number {
    if (data.length < 10) return 0.5

    // Simplified: count how many values are "closer to center" than this value
    const sorted = [...data].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const distance = Math.abs(value - median)
    const mad = sorted.reduce((sum, v) => sum + Math.abs(v - median), 0) / sorted.length

    // Normalize distance
    const normalizedDistance = mad > 0 ? distance / mad : 0

    // Convert to anomaly score (higher = more anomalous)
    return Math.min(1, normalizedDistance / 3)
  }

  /**
   * Autoencoder-like reconstruction error (simplified)
   */
  reconstructionError(ohlcv: OHLCV[]): number {
    if (ohlcv.length < 20) return 0

    const features = this.extractFeatures(ohlcv)
    const recentFeatures = features.slice(-1)[0]

    // Compare to recent average
    const avgFeatures = this.averageFeatures(features.slice(-20))

    let error = 0
    for (const key of Object.keys(recentFeatures)) {
      error += Math.abs(recentFeatures[key] - avgFeatures[key])
    }

    return Math.min(1, error / Object.keys(recentFeatures).length)
  }

  /**
   * Get severity level
   */
  private getSeverity(zScore: number, type: 'price' | 'volume' | 'volatility' | 'spread'): 'low' | 'medium' | 'high' | 'critical' {
    const threshold = this.thresholds[type]

    if (zScore > threshold * 2) return 'critical'
    if (zScore > threshold * 1.5) return 'high'
    if (zScore > threshold) return 'medium'
    return 'low'
  }

  /**
   * Generate recommendation
   */
  private generateRecommendation(anomalies: Anomaly[]): string {
    if (anomalies.length === 0) {
      return 'Normal market conditions. Standard risk management applies.'
    }

    const criticalCount = anomalies.filter((a) => a.severity === 'critical').length
    const highCount = anomalies.filter((a) => a.severity === 'high').length

    if (criticalCount > 0) {
      return 'CRITICAL: Immediate risk reduction recommended. Consider closing positions.'
    }
    if (highCount > 1) {
      return 'WARNING: Multiple high-severity anomalies detected. Reduce position sizes.'
    }
    if (highCount === 1) {
      return 'CAUTION: High-severity anomaly detected. Monitor closely and consider reducing exposure.'
    }

    return 'Anomalies detected. Exercise additional caution with new positions.'
  }

  /**
   * Extract features for anomaly detection
   */
  private extractFeatures(ohlcv: OHLCV[]): Array<Record<string, number>> {
    return ohlcv.map((o) => ({
      close: o.close,
      volume: o.volume,
      range: (o.high - o.low) / o.close,
      bodySize: Math.abs(o.close - o.open) / o.close,
      upperWick: (o.high - Math.max(o.open, o.close)) / (o.high - o.low || 1),
      lowerWick: (Math.min(o.open, o.close) - o.low) / (o.high - o.low || 1)
    }))
  }

  /**
   * Average features
   */
  private averageFeatures(features: Array<Record<string, number>>): Record<string, number> {
    const avg: Record<string, number> = {}
    const keys = Object.keys(features[0] || {})

    for (const key of keys) {
      avg[key] = features.reduce((sum, f) => sum + (f[key] || 0), 0) / features.length
    }

    return avg
  }

  /**
   * Get anomaly history
   */
  getHistory(): Anomaly[] {
    return [...this.history]
  }

  /**
   * Set custom thresholds
   */
  setThresholds(thresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds }
  }
}

// Singleton instance
export const anomalyDetector = new AnomalyDetector()
