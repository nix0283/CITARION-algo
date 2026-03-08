/**
 * AI Risk Management Module
 * Comprehensive AI-driven risk management system
 */

// Types
export type { RiskMetrics, RiskScore } from './risk-predictor'
export type { Anomaly, AnomalyAlert } from './anomaly-detector'
export type { PositionSizeResult, PortfolioAllocation, SizingConfig } from './position-sizer'
export type { Position, HedgeRecommendation, HedgeStatus } from './auto-hedger'

// Components
export { RiskPredictor, riskPredictor } from './risk-predictor'
export { AnomalyDetector, anomalyDetector } from './anomaly-detector'
export { PositionSizer, positionSizer } from './position-sizer'
export { AutoHedger, autoHedger } from './auto-hedger'

// Convenience functions
import { riskPredictor } from './risk-predictor'
import { anomalyDetector } from './anomaly-detector'
import { positionSizer } from './position-sizer'
import { autoHedger } from './auto-hedger'
import type { OHLCV } from '../ml-pipeline/types'

export interface RiskAssessment {
  timestamp: number
  riskScore: number
  anomalies: string[]
  positionSizing: {
    recommended: number
    maxAllowed: number
    current: number
  }
  hedging: {
    hedgeRatio: number
    recommendations: string[]
    cost: number
  }
  alerts: string[]
  recommendation: string
}

/**
 * Comprehensive risk assessment
 */
export function assessRisk(
  ohlcv: OHLCV[],
  portfolioValue: number,
  currentPositions: Array<{ symbol: string; size: number; entryPrice: number }> = []
): RiskAssessment {
  // Get risk metrics
  const riskMetrics = riskPredictor.estimate(ohlcv)
  const riskScore = riskPredictor.calculateRiskScore(ohlcv, currentPositions)

  // Detect anomalies
  const anomalyAlert = anomalyDetector.detect(ohlcv)
  const anomalies = anomalyAlert.anomalies.map((a) => a.description)

  // Calculate position sizing
  const sizing = positionSizer.volatilityAdjustedSize(
    portfolioValue,
    riskMetrics.volatility.volatility,
    2 // 2% target risk
  )

  // Get hedging status
  const positions = currentPositions.map((p) => ({
    symbol: p.symbol,
    exchange: '',
    side: p.size > 0 ? 'long' : 'short' as const,
    size: Math.abs(p.size),
    entryPrice: p.entryPrice,
    currentPrice: ohlcv[ohlcv.length - 1].close,
    unrealizedPnl: 0,
    delta: 1,
    gamma: 0
  }))

  const hedgeStatus = autoHedger.analyze(
    positions,
    new Map([['default', ohlcv]])
  )

  // Generate alerts
  const alerts: string[] = []

  if (riskScore.overall > 70) {
    alerts.push('HIGH RISK: Overall risk score exceeds 70%')
  }

  if (riskMetrics.var['95'] < -0.05) {
    alerts.push(`VaR alert: 5% risk of ${(riskMetrics.var['95'] * 100).toFixed(2)}% loss`)
  }

  if (riskMetrics.drawdownProbability > 0.3) {
    alerts.push(`Drawdown risk: ${(riskMetrics.drawdownProbability * 100).toFixed(1)}% probability`)
  }

  if (anomalyAlert.totalScore > 0.5) {
    alerts.push(`Anomaly detected: ${anomalyAlert.recommendation}`)
  }

  // Generate recommendation
  let recommendation = 'Normal risk levels. Standard position sizing applies.'

  if (riskScore.overall > 70) {
    recommendation = 'REDUCE: High risk detected. Consider reducing positions by 30-50%.'
  } else if (riskScore.overall > 50) {
    recommendation = 'CAUTION: Elevated risk. Monitor positions closely and avoid new entries.'
  } else if (riskScore.overall < 30) {
    recommendation = 'FAVORABLE: Low risk environment. Consider scaling up positions.'
  }

  return {
    timestamp: ohlcv[ohlcv.length - 1].timestamp,
    riskScore: riskScore.overall,
    anomalies,
    positionSizing: {
      recommended: sizing.sizePercent,
      maxAllowed: positionSizer.getConfig().maxPositionSize,
      current: currentPositions.reduce((sum, p) => sum + Math.abs(p.size), 0)
    },
    hedging: {
      hedgeRatio: hedgeStatus.hedgeRatio,
      recommendations: hedgeStatus.recommendations.map((r) => r.reason),
      cost: hedgeStatus.hedgeCost
    },
    alerts,
    recommendation
  }
}

/**
 * Quick risk check
 */
export function quickRiskCheck(ohlcv: OHLCV[]): {
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  score: number
  warning: string | null
} {
  const metrics = riskPredictor.estimate(ohlcv)
  const score = riskPredictor.calculateRiskScore(ohlcv)

  let riskLevel: 'low' | 'medium' | 'high' | 'critical'
  let warning: string | null = null

  if (score.overall >= 80) {
    riskLevel = 'critical'
    warning = 'Critical risk level. Immediate action required.'
  } else if (score.overall >= 60) {
    riskLevel = 'high'
    warning = 'High risk. Consider reducing exposure.'
  } else if (score.overall >= 40) {
    riskLevel = 'medium'
    warning = 'Moderate risk. Monitor closely.'
  } else {
    riskLevel = 'low'
  }

  return { riskLevel, score: score.overall, warning }
}

/**
 * Calculate optimal position size
 */
export function calculateOptimalSize(
  portfolioValue: number,
  winRate: number,
  avgWinLossRatio: number,
  volatility: number
): {
  size: number
  stopLoss: number
  takeProfit: number
  riskAmount: number
} {
  // Use Kelly criterion
  const kelly = positionSizer.kellyCriterion(
    winRate,
    avgWinLossRatio,
    1,
    portfolioValue
  )

  // Adjust for volatility
  const volAdjusted = positionSizer.volatilityAdjustedSize(
    portfolioValue,
    volatility,
    2,
    kelly.stopLoss * portfolioValue
  )

  return {
    size: Math.min(kelly.size, volAdjusted.size),
    stopLoss: kelly.stopLoss,
    takeProfit: kelly.takeProfit,
    riskAmount: kelly.riskAmount
  }
}

/**
 * Monitor risk in real-time
 */
export class RiskMonitor {
  private history: RiskAssessment[] = []
  private alertCallbacks: Array<(alert: string) => void> = []

  /**
   * Add alert callback
   */
  onAlert(callback: (alert: string) => void): void {
    this.alertCallbacks.push(callback)
  }

  /**
   * Update with new data
   */
  update(
    ohlcv: OHLCV[],
    portfolioValue: number,
    positions: Array<{ symbol: string; size: number; entryPrice: number }>
  ): RiskAssessment {
    const assessment = assessRisk(ohlcv, portfolioValue, positions)
    this.history.push(assessment)

    // Trigger alerts
    for (const alert of assessment.alerts) {
      for (const callback of this.alertCallbacks) {
        callback(alert)
      }
    }

    return assessment
  }

  /**
   * Get history
   */
  getHistory(): RiskAssessment[] {
    return [...this.history]
  }

  /**
   * Get current risk trend
   */
  getTrend(): 'improving' | 'stable' | 'worsening' {
    if (this.history.length < 3) return 'stable'

    const recent = this.history.slice(-3).map((h) => h.riskScore)
    const trend = recent[2] - recent[0]

    if (trend > 10) return 'worsening'
    if (trend < -10) return 'improving'
    return 'stable'
  }
}

// Export monitor instance
export const riskMonitor = new RiskMonitor()
