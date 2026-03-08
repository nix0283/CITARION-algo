/**
 * LOGOS Self-Learning System
 * 
 * Learns from:
 * 1. Manual trades (user executes manually via UI)
 * 2. Signal trades (from chatbot signals)
 * 
 * Improves bot weights and confidence adjustments over time
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ============================================================================
// TYPES
// ============================================================================

export type TradeSource = 'manual' | 'signal' | 'bot'

export interface TradeOutcome {
  id: string
  source: TradeSource
  botCode?: string  // for signal/bot trades
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT'
  entryPrice: number
  exitPrice: number
  size: number
  pnl: number
  pnlPercent: number
  duration: number  // ms
  timestamp: number
  success: boolean
  marketConditions?: MarketConditions
  signalConfidence?: number  // original signal confidence
  signalReason?: string
}

export interface MarketConditions {
  volatility: number
  trend: 'up' | 'down' | 'sideways'
  volume: number
  fundingRate?: number
  dominance?: number  // BTC dominance
}

export interface BotPerformance {
  botCode: string
  totalSignals: number
  successfulSignals: number
  failedSignals: number
  accuracy: number
  avgPnl: number
  avgPnlPercent: number
  bestConditions: string[]
  worstConditions: string[]
  preferredSymbols: string[]
  avoidedSymbols: string[]
  lastUpdated: number
}

export interface LearningModel {
  botWeights: Map<string, number>  // trust weight per bot (0-1)
  symbolPreferences: Map<string, string[]>  // best bots per symbol
  conditionMultipliers: Map<string, number>  // market condition adjustments
  timePreferences: Map<number, number>  // hour -> success rate
  totalSamples: number
  lastUpdated: number
}

export interface LearningInsight {
  type: 'success' | 'warning' | 'info'
  message: string
  botCode?: string
  symbol?: string
  recommendation?: string
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Record a trade outcome for learning
 */
export async function recordTrade(trade: TradeOutcome): Promise<void> {
  try {
    // Store in database
    await prisma.learningTrade.create({
      data: {
        id: trade.id,
        source: trade.source,
        botCode: trade.botCode,
        symbol: trade.symbol,
        exchange: trade.exchange,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        size: trade.size,
        pnl: trade.pnl,
        pnlPercent: trade.pnlPercent,
        duration: trade.duration,
        timestamp: new Date(trade.timestamp),
        success: trade.success,
        marketConditions: trade.marketConditions || {},
        signalConfidence: trade.signalConfidence,
        signalReason: trade.signalReason,
      }
    })

    // Update bot performance if applicable
    if (trade.botCode) {
      await updateBotPerformance(trade.botCode, trade)
    }

    // Update learning model
    await updateLearningModel(trade)

    console.log(`[LOGOS Learning] Recorded ${trade.source} trade: ${trade.symbol} ${trade.direction} - ${trade.success ? 'SUCCESS' : 'FAIL'}`)
  } catch (error) {
    console.error('[LOGOS Learning] Error recording trade:', error)
  }
}

/**
 * Update bot performance metrics
 */
async function updateBotPerformance(botCode: string, outcome: TradeOutcome): Promise<void> {
  try {
    const existing = await prisma.botPerformance.findUnique({
      where: { botCode }
    })

    if (existing) {
      const totalSignals = existing.totalSignals + 1
      const successfulSignals = existing.successfulSignals + (outcome.success ? 1 : 0)
      const accuracy = successfulSignals / totalSignals
      
      // Update preferred/avoided symbols
      const preferredSymbols = existing.preferredSymbols as string[] || []
      const avoidedSymbols = existing.avoidedSymbols as string[] || []
      
      if (outcome.success && outcome.pnlPercent > 2) {
        if (!preferredSymbols.includes(outcome.symbol)) {
          preferredSymbols.push(outcome.symbol)
        }
      } else if (!outcome.success && outcome.pnlPercent < -2) {
        if (!avoidedSymbols.includes(outcome.symbol)) {
          avoidedSymbols.push(outcome.symbol)
        }
      }

      await prisma.botPerformance.update({
        where: { botCode },
        data: {
          totalSignals,
          successfulSignals,
          failedSignals: existing.failedSignals + (outcome.success ? 0 : 1),
          accuracy,
          avgPnl: (existing.avgPnl * existing.totalSignals + outcome.pnl) / totalSignals,
          avgPnlPercent: (existing.avgPnlPercent * existing.totalSignals + outcome.pnlPercent) / totalSignals,
          preferredSymbols,
          avoidedSymbols,
          lastUpdated: new Date(),
        }
      })
    } else {
      await prisma.botPerformance.create({
        data: {
          botCode,
          totalSignals: 1,
          successfulSignals: outcome.success ? 1 : 0,
          failedSignals: outcome.success ? 0 : 1,
          accuracy: outcome.success ? 1 : 0,
          avgPnl: outcome.pnl,
          avgPnlPercent: outcome.pnlPercent,
          bestConditions: [],
          worstConditions: [],
          preferredSymbols: outcome.success ? [outcome.symbol] : [],
          avoidedSymbols: !outcome.success ? [outcome.symbol] : [],
          lastUpdated: new Date(),
        }
      })
    }
  } catch (error) {
    console.error('[LOGOS Learning] Error updating bot performance:', error)
  }
}

/**
 * Update the learning model with new trade data
 */
async function updateLearningModel(trade: TradeOutcome): Promise<void> {
  try {
    // Get or create learning model
    let model = await prisma.learningModel.findFirst()
    
    if (!model) {
      model = await prisma.learningModel.create({
        data: {
          botWeights: {},
          symbolPreferences: {},
          conditionMultipliers: {},
          timePreferences: {},
          totalSamples: 0,
        }
      })
    }

    const botWeights = model.botWeights as Record<string, number> || {}
    const symbolPreferences = model.symbolPreferences as Record<string, string[]> || {}
    const timePreferences = model.timePreferences as Record<string, number> || {}
    const totalSamples = model.totalSamples + 1

    // Update bot weight if this was a signal/bot trade
    if (trade.botCode) {
      const currentWeight = botWeights[trade.botCode] || 0.5
      const adjustment = trade.success ? 0.02 : -0.02
      botWeights[trade.botCode] = Math.max(0.1, Math.min(1, currentWeight + adjustment))
    }

    // Update symbol preferences
    if (!symbolPreferences[trade.symbol]) {
      symbolPreferences[trade.symbol] = []
    }
    if (trade.botCode && trade.success && !symbolPreferences[trade.symbol].includes(trade.botCode)) {
      symbolPreferences[trade.symbol].push(trade.botCode)
    }

    // Update time preferences (hour of day)
    const hour = new Date(trade.timestamp).getHours()
    const hourKey = hour.toString()
    const currentHourRate = timePreferences[hourKey] || 0.5
    const hourAdjustment = trade.success ? 0.05 : -0.05
    timePreferences[hourKey] = Math.max(0, Math.min(1, currentHourRate + hourAdjustment))

    // Save updated model
    await prisma.learningModel.update({
      where: { id: model.id },
      data: {
        botWeights,
        symbolPreferences,
        timePreferences,
        totalSamples,
        lastUpdated: new Date(),
      }
    })
  } catch (error) {
    console.error('[LOGOS Learning] Error updating learning model:', error)
  }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get bot performance metrics
 */
export async function getBotPerformance(botCode: string): Promise<BotPerformance | null> {
  try {
    const perf = await prisma.botPerformance.findUnique({
      where: { botCode }
    })
    
    if (!perf) return null
    
    return {
      botCode: perf.botCode,
      totalSignals: perf.totalSignals,
      successfulSignals: perf.successfulSignals,
      failedSignals: perf.failedSignals,
      accuracy: perf.accuracy,
      avgPnl: perf.avgPnl,
      avgPnlPercent: perf.avgPnlPercent,
      bestConditions: perf.bestConditions as string[] || [],
      worstConditions: perf.worstConditions as string[] || [],
      preferredSymbols: perf.preferredSymbols as string[] || [],
      avoidedSymbols: perf.avoidedSymbols as string[] || [],
      lastUpdated: perf.lastUpdated.getTime(),
    }
  } catch (error) {
    console.error('[LOGOS Learning] Error getting bot performance:', error)
    return null
  }
}

/**
 * Get all bot performances
 */
export async function getAllBotPerformances(): Promise<BotPerformance[]> {
  try {
    const perfs = await prisma.botPerformance.findMany({
      orderBy: { accuracy: 'desc' }
    })
    
    return perfs.map(p => ({
      botCode: p.botCode,
      totalSignals: p.totalSignals,
      successfulSignals: p.successfulSignals,
      failedSignals: p.failedSignals,
      accuracy: p.accuracy,
      avgPnl: p.avgPnl,
      avgPnlPercent: p.avgPnlPercent,
      bestConditions: p.bestConditions as string[] || [],
      worstConditions: p.worstConditions as string[] || [],
      preferredSymbols: p.preferredSymbols as string[] || [],
      avoidedSymbols: p.avoidedSymbols as string[] || [],
      lastUpdated: p.lastUpdated.getTime(),
    }))
  } catch (error) {
    console.error('[LOGOS Learning] Error getting all bot performances:', error)
    return []
  }
}

/**
 * Calculate bot weight based on performance
 */
export async function calculateBotWeight(botCode: string): Promise<number> {
  try {
    const model = await prisma.learningModel.findFirst()
    if (!model) return 0.5
    
    const weights = model.botWeights as Record<string, number>
    return weights?.[botCode] || 0.5
  } catch (error) {
    console.error('[LOGOS Learning] Error calculating bot weight:', error)
    return 0.5
  }
}

/**
 * Get optimal bots for a symbol
 */
export async function getOptimalBotsForSymbol(symbol: string): Promise<string[]> {
  try {
    const model = await prisma.learningModel.findFirst()
    if (!model) return []
    
    const prefs = model.symbolPreferences as Record<string, string[]>
    return prefs?.[symbol] || []
  } catch (error) {
    console.error('[LOGOS Learning] Error getting optimal bots:', error)
    return []
  }
}

/**
 * Adjust signal confidence based on learning
 */
export async function adjustConfidence(
  baseConfidence: number,
  botCode: string,
  symbol: string,
  conditions?: Partial<MarketConditions>
): Promise<number> {
  try {
    const model = await prisma.learningModel.findFirst()
    if (!model || model.totalSamples < 10) return baseConfidence
    
    const botWeights = model.botWeights as Record<string, number>
    const timePrefs = model.timePreferences as Record<string, number>
    
    // Get bot weight
    const botWeight = botWeights?.[botCode] || 0.5
    
    // Get time preference
    const hour = new Date().getHours()
    const hourKey = hour.toString()
    const timePref = timePrefs?.[hourKey] || 0.5
    
    // Calculate adjustment
    const weightFactor = (botWeight - 0.5) * 0.3  // -0.15 to +0.15
    const timeFactor = (timePref - 0.5) * 0.1     // -0.05 to +0.05
    
    let adjusted = baseConfidence + weightFactor + timeFactor
    
    // Clamp to valid range
    adjusted = Math.max(0.1, Math.min(0.95, adjusted))
    
    return adjusted
  } catch (error) {
    console.error('[LOGOS Learning] Error adjusting confidence:', error)
    return baseConfidence
  }
}

/**
 * Get learning insights
 */
export async function getLearningInsights(): Promise<LearningInsight[]> {
  const insights: LearningInsight[] = []
  
  try {
    const model = await prisma.learningModel.findFirst()
    const performances = await getAllBotPerformances()
    
    if (!model || model.totalSamples < 5) {
      insights.push({
        type: 'info',
        message: 'Learning system needs more data. Continue trading to improve accuracy.',
        recommendation: 'Execute at least 10 trades for meaningful insights.'
      })
      return insights
    }
    
    // Find best performing bot
    if (performances.length > 0) {
      const best = performances[0]
      if (best.accuracy > 0.6) {
        insights.push({
          type: 'success',
          message: `${best.botCode} has ${ (best.accuracy * 100).toFixed(0)}% accuracy`,
          botCode: best.botCode,
          recommendation: `Consider giving more weight to ${best.botCode} signals.`
        })
      }
      
      // Find worst performing bot
      const worst = performances[performances.length - 1]
      if (worst.accuracy < 0.4 && worst.totalSignals >= 5) {
        insights.push({
          type: 'warning',
          message: `${worst.botCode} has low accuracy (${(worst.accuracy * 100).toFixed(0)}%)`,
          botCode: worst.botCode,
          recommendation: `Consider reducing weight of ${worst.botCode} signals.`
        })
      }
    }
    
    // Check for symbol preferences
    const symbolPrefs = model.symbolPreferences as Record<string, string[]>
    if (symbolPrefs) {
      const symbols = Object.keys(symbolPrefs)
      if (symbols.length > 0) {
        insights.push({
          type: 'info',
          message: `Learning has identified optimal bots for ${symbols.length} symbols`,
          recommendation: 'Check symbol-specific recommendations before trading.'
        })
      }
    }
    
    // Add general insight
    insights.push({
      type: 'info',
      message: `Learning model trained on ${model.totalSamples} trades`,
      recommendation: 'Continue trading to improve model accuracy.'
    })
    
  } catch (error) {
    console.error('[LOGOS Learning] Error getting insights:', error)
    insights.push({
      type: 'warning',
      message: 'Could not load learning insights',
      recommendation: 'Check database connection.'
    })
  }
  
  return insights
}

/**
 * Get learning stats
 */
export async function getLearningStats(): Promise<{
  totalTrades: number
  manualTrades: number
  signalTrades: number
  botTrades: number
  overallAccuracy: number
  avgPnl: number
  topBot: string | null
  topBotAccuracy: number
}> {
  try {
    const trades = await prisma.learningTrade.findMany()
    const performances = await getAllBotPerformances()
    
    const manualTrades = trades.filter(t => t.source === 'manual').length
    const signalTrades = trades.filter(t => t.source === 'signal').length
    const botTrades = trades.filter(t => t.source === 'bot').length
    
    const successfulTrades = trades.filter(t => t.success).length
    const overallAccuracy = trades.length > 0 ? successfulTrades / trades.length : 0
    
    const avgPnl = trades.length > 0 
      ? trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length 
      : 0
    
    const topBot = performances.length > 0 ? performances[0].botCode : null
    const topBotAccuracy = performances.length > 0 ? performances[0].accuracy : 0
    
    return {
      totalTrades: trades.length,
      manualTrades,
      signalTrades,
      botTrades,
      overallAccuracy,
      avgPnl,
      topBot,
      topBotAccuracy
    }
  } catch (error) {
    console.error('[LOGOS Learning] Error getting stats:', error)
    return {
      totalTrades: 0,
      manualTrades: 0,
      signalTrades: 0,
      botTrades: 0,
      overallAccuracy: 0,
      avgPnl: 0,
      topBot: null,
      topBotAccuracy: 0
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const LOGOS_LEARNING_VERSION = '1.0.0'

export default {
  recordTrade,
  getBotPerformance,
  getAllBotPerformances,
  calculateBotWeight,
  getOptimalBotsForSymbol,
  adjustConfidence,
  getLearningInsights,
  getLearningStats,
}
