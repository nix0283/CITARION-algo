/**
 * Trading Journal System for Logos Bot
 * Stage 2.4: Logos автономная торговля
 */

// ============================================================================
// TYPES
// ============================================================================

export interface JournalEntry {
  id: string
  timestamp: Date
  
  trade: {
    symbol: string
    side: 'LONG' | 'SHORT'
    entryPrice: number
    exitPrice?: number
    size: number
    pnl?: number
    pnlPercent?: number
    status: 'OPEN' | 'CLOSED'
    exitReason?: string
    duration?: number // milliseconds
  }
  
  context: {
    marketCondition: 'trending' | 'ranging' | 'volatile' | 'choppy'
    signalSource: string
    confidence: number
    indicators: Record<string, number>
    forecastDirection?: string
    forecastConfidence?: number
    volatility: number
    volume: number
    dayOfWeek: number
    hourOfDay: number
  }
  
  analysis: {
    entryQuality: number      // 0-1
    exitQuality?: number      // 0-1
    executionQuality?: number // 0-1
    riskManagement: number    // 0-1
    lessons: string[]
    mistakes: string[]
    improvements: string[]
  }
  
  tags: string[]
  
  notes?: string
  
  reviewStatus: 'pending' | 'reviewed' | 'archived'
}

export interface DetectedPattern {
  pattern: string
  frequency: number
  avgPnl: number
  winRate: number
  confidence: number
  description: string
}

export interface JournalStats {
  totalTrades: number
  openTrades: number
  closedTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  avgPnl: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  sharpeRatio: number
  maxDrawdown: number
  avgHoldingTime: number
  
  bySymbol: Record<string, { trades: number; pnl: number; winRate: number }>
  bySide: { long: { trades: number; pnl: number }; short: { trades: number; pnl: number } }
  byCondition: Record<string, { trades: number; pnl: number; winRate: number }>
  byHour: Record<number, { trades: number; pnl: number; winRate: number }>
  byDayOfWeek: Record<number, { trades: number; pnl: number; winRate: number }>
}

// ============================================================================
// JOURNAL ANALYZER
// ============================================================================

export class JournalAnalyzer {
  private entries: JournalEntry[] = []

  addEntry(entry: JournalEntry): void {
    this.entries.push(entry)
  }

  getEntries(): JournalEntry[] {
    return [...this.entries]
  }

  getEntriesByFilter(filter: Partial<JournalEntry>): JournalEntry[] {
    return this.entries.filter(entry => {
      for (const [key, value] of Object.entries(filter)) {
        if (entry[key as keyof JournalEntry] !== value) return false
      }
      return true
    })
  }

  calculateStats(): JournalStats {
    const closed = this.entries.filter(e => e.trade.status === 'CLOSED')
    const winning = closed.filter(e => (e.trade.pnl || 0) > 0)
    const losing = closed.filter(e => (e.trade.pnl || 0) < 0)

    const totalPnl = closed.reduce((s, e) => s + (e.trade.pnl || 0), 0)
    const totalWins = winning.reduce((s, e) => s + (e.trade.pnl || 0), 0)
    const totalLosses = Math.abs(losing.reduce((s, e) => s + (e.trade.pnl || 0), 0))

    // By symbol
    const bySymbol: Record<string, { trades: number; pnl: number; winRate: number }> = {}
    for (const entry of closed) {
      const symbol = entry.trade.symbol
      if (!bySymbol[symbol]) bySymbol[symbol] = { trades: 0, pnl: 0, winRate: 0 }
      bySymbol[symbol].trades++
      bySymbol[symbol].pnl += entry.trade.pnl || 0
    }
    for (const symbol of Object.keys(bySymbol)) {
      const symbolTrades = closed.filter(e => e.trade.symbol === symbol)
      bySymbol[symbol].winRate = symbolTrades.filter(e => (e.trade.pnl || 0) > 0).length / symbolTrades.length
    }

    // By side
    const longTrades = closed.filter(e => e.trade.side === 'LONG')
    const shortTrades = closed.filter(e => e.trade.side === 'SHORT')

    // By condition
    const byCondition: Record<string, { trades: number; pnl: number; winRate: number }> = {}
    for (const entry of closed) {
      const cond = entry.context.marketCondition
      if (!byCondition[cond]) byCondition[cond] = { trades: 0, pnl: 0, winRate: 0 }
      byCondition[cond].trades++
      byCondition[cond].pnl += entry.trade.pnl || 0
    }
    for (const cond of Object.keys(byCondition)) {
      const condTrades = closed.filter(e => e.context.marketCondition === cond)
      byCondition[cond].winRate = condTrades.filter(e => (e.trade.pnl || 0) > 0).length / condTrades.length
    }

    // By hour
    const byHour: Record<number, { trades: number; pnl: number; winRate: number }> = {}
    for (const entry of closed) {
      const hour = entry.context.hourOfDay
      if (!byHour[hour]) byHour[hour] = { trades: 0, pnl: 0, winRate: 0 }
      byHour[hour].trades++
      byHour[hour].pnl += entry.trade.pnl || 0
    }
    for (const hour of Object.keys(byHour).map(Number)) {
      const hourTrades = closed.filter(e => e.context.hourOfDay === hour)
      byHour[hour].winRate = hourTrades.filter(e => (e.trade.pnl || 0) > 0).length / hourTrades.length
    }

    // By day of week
    const byDayOfWeek: Record<number, { trades: number; pnl: number; winRate: number }> = {}
    for (const entry of closed) {
      const day = entry.context.dayOfWeek
      if (!byDayOfWeek[day]) byDayOfWeek[day] = { trades: 0, pnl: 0, winRate: 0 }
      byDayOfWeek[day].trades++
      byDayOfWeek[day].pnl += entry.trade.pnl || 0
    }
    for (const day of Object.keys(byDayOfWeek).map(Number)) {
      const dayTrades = closed.filter(e => e.context.dayOfWeek === day)
      byDayOfWeek[day].winRate = dayTrades.filter(e => (e.trade.pnl || 0) > 0).length / dayTrades.length
    }

    // Sharpe ratio (simplified)
    const returns = closed.map(e => e.trade.pnlPercent || 0)
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const stdReturn = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length)
    const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn * Math.sqrt(252) : 0

    // Max drawdown
    let peak = 0, maxDd = 0, current = 0
    for (const entry of closed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
      current += entry.trade.pnl || 0
      if (current > peak) peak = current
      const dd = peak - current
      if (dd > maxDd) maxDd = dd
    }

    // Average holding time
    const durations = closed.filter(e => e.trade.duration).map(e => e.trade.duration!)
    const avgHoldingTime = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    return {
      totalTrades: this.entries.length,
      openTrades: this.entries.filter(e => e.trade.status === 'OPEN').length,
      closedTrades: closed.length,
      winningTrades: winning.length,
      losingTrades: losing.length,
      winRate: closed.length > 0 ? winning.length / closed.length : 0,
      avgPnl: closed.length > 0 ? totalPnl / closed.length : 0,
      avgWin: winning.length > 0 ? totalWins / winning.length : 0,
      avgLoss: losing.length > 0 ? totalLosses / losing.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
      sharpeRatio,
      maxDrawdown: maxDd,
      avgHoldingTime,
      bySymbol,
      bySide: {
        long: { trades: longTrades.length, pnl: longTrades.reduce((s, e) => s + (e.trade.pnl || 0), 0) },
        short: { trades: shortTrades.length, pnl: shortTrades.reduce((s, e) => s + (e.trade.pnl || 0), 0) },
      },
      byCondition,
      byHour,
      byDayOfWeek,
    }
  }

  detectPatterns(): DetectedPattern[] {
    const patterns: DetectedPattern[] = []
    const closed = this.entries.filter(e => e.trade.status === 'CLOSED')

    if (closed.length < 10) return patterns

    // Pattern: Best market conditions
    const stats = this.calculateStats()
    const sortedConditions = Object.entries(stats.byCondition)
      .sort((a, b) => b[1].winRate - a[1].winRate)

    if (sortedConditions.length > 0) {
      const [best, data] = sortedConditions[0]
      if (data.trades >= 3) {
        patterns.push({
          pattern: `Best Condition: ${best}`,
          frequency: data.trades,
          avgPnl: data.pnl / data.trades,
          winRate: data.winRate,
          confidence: Math.min(1, data.trades / 20),
          description: `Most profitable in ${best} markets with ${(data.winRate * 100).toFixed(1)}% win rate`,
        })
      }
    }

    // Pattern: Worst hours
    const sortedHours = Object.entries(stats.byHour)
      .filter(([, d]) => d.trades >= 3)
      .sort((a, b) => a[1].winRate - b[1].winRate)

    if (sortedHours.length > 0) {
      const [worstHour, data] = sortedHours[0]
      if (data.winRate < 0.4) {
        patterns.push({
          pattern: `Worst Hour: ${worstHour}:00`,
          frequency: data.trades,
          avgPnl: data.pnl / data.trades,
          winRate: data.winRate,
          confidence: Math.min(1, data.trades / 10),
          description: `Avoid trading at ${worstHour}:00 - only ${(data.winRate * 100).toFixed(1)}% win rate`,
        })
      }
    }

    // Pattern: High confidence wins
    const highConfTrades = closed.filter(e => e.context.confidence > 0.8)
    if (highConfTrades.length >= 5) {
      const winRate = highConfTrades.filter(e => (e.trade.pnl || 0) > 0).length / highConfTrades.length
      patterns.push({
        pattern: 'High Confidence Trades',
        frequency: highConfTrades.length,
        avgPnl: highConfTrades.reduce((s, e) => s + (e.trade.pnl || 0), 0) / highConfTrades.length,
        winRate,
        confidence: Math.min(1, highConfTrades.length / 10),
        description: `Trades with >80% confidence have ${(winRate * 100).toFixed(1)}% win rate`,
      })
    }

    // Pattern: Tag-based patterns
    const tagStats: Record<string, { wins: number; losses: number; pnl: number }> = {}
    for (const entry of closed) {
      for (const tag of entry.tags) {
        if (!tagStats[tag]) tagStats[tag] = { wins: 0, losses: 0, pnl: 0 }
        if ((entry.trade.pnl || 0) > 0) tagStats[tag].wins++
        else tagStats[tag].losses++
        tagStats[tag].pnl += entry.trade.pnl || 0
      }
    }

    for (const [tag, data] of Object.entries(tagStats)) {
      const total = data.wins + data.losses
      if (total >= 5 && (data.wins / total > 0.7 || data.wins / total < 0.3)) {
        const winRate = data.wins / total
        patterns.push({
          pattern: `Tag: ${tag}`,
          frequency: total,
          avgPnl: data.pnl / total,
          winRate,
          confidence: Math.min(1, total / 10),
          description: `Trades tagged "${tag}" have ${(winRate * 100).toFixed(1)}% win rate`,
        })
      }
    }

    return patterns.sort((a, b) => b.confidence - a.confidence)
  }

  findSimilar(trade: Partial<JournalEntry['trade']>, context: Partial<JournalEntry['context']>): JournalEntry[] {
    return this.entries.filter(entry => {
      let score = 0
      if (trade.symbol && entry.trade.symbol === trade.symbol) score += 0.3
      if (trade.side && entry.trade.side === trade.side) score += 0.2
      if (context.marketCondition && entry.context.marketCondition === context.marketCondition) score += 0.3
      if (context.confidence && Math.abs(entry.context.confidence - context.confidence) < 0.2) score += 0.2
      return score >= 0.5
    })
  }
}

// ============================================================================
// TRADE ANALYZER (AI-POWERED)
// ============================================================================

export class TradeAnalyzer {
  analyzeEntry(trade: JournalEntry['trade'], context: JournalEntry['context']): JournalEntry['analysis'] {
    const analysis: JournalEntry['analysis'] = {
      entryQuality: 0,
      riskManagement: 0,
      lessons: [],
      mistakes: [],
      improvements: [],
    }

    // Entry quality assessment
    if (context.marketCondition === 'trending' && context.forecastDirection === trade.side) {
      analysis.entryQuality += 0.3
    }
    if (context.confidence > 0.7) {
      analysis.entryQuality += 0.3
    }
    if (context.volatility < 0.05) {
      analysis.entryQuality += 0.2
    }
    if (context.volume > 1.5) {
      analysis.entryQuality += 0.2
    }
    analysis.entryQuality = Math.min(1, analysis.entryQuality)

    // Risk management assessment
    analysis.riskManagement = 0.5 // Base
    if (trade.side === 'LONG' && context.indicators.rsi < 70) {
      analysis.riskManagement += 0.2
    }
    if (trade.side === 'SHORT' && context.indicators.rsi > 30) {
      analysis.riskManagement += 0.2
    }
    analysis.riskManagement = Math.min(1, analysis.riskManagement)

    // Generate lessons/mistakes
    if (context.confidence < 0.5) {
      analysis.mistakes.push('Low confidence entry')
      analysis.improvements.push('Wait for higher confidence signals')
    }
    if (context.marketCondition === 'choppy') {
      analysis.mistakes.push('Trading in choppy conditions')
      analysis.improvements.push('Avoid entries during low volatility consolidation')
    }
    if (analysis.entryQuality > 0.7) {
      analysis.lessons.push('Good entry conditions')
    }

    return analysis
  }

  analyzeExit(entry: JournalEntry): JournalEntry['analysis'] {
    const analysis = { ...entry.analysis }

    if (entry.trade.status !== 'CLOSED') return analysis

    const pnl = entry.trade.pnl || 0
    const pnlPercent = entry.trade.pnlPercent || 0

    // Exit quality
    if (pnl > 0) {
      analysis.exitQuality = Math.min(1, 0.5 + pnlPercent * 10)
      analysis.lessons.push('Profitable trade')
    } else if (entry.trade.exitReason === 'STOP_LOSS') {
      analysis.exitQuality = 0.6
      analysis.lessons.push('Risk management respected')
    } else if (entry.trade.exitReason === 'TAKE_PROFIT') {
      analysis.exitQuality = 0.8
      analysis.lessons.push('Target achieved')
    } else {
      analysis.exitQuality = 0.3
      analysis.mistakes.push('Exit without clear plan')
    }

    // Execution quality
    const duration = entry.trade.duration || 0
    const hours = duration / (1000 * 60 * 60)
    
    if (hours < 1 && pnl < 0) {
      analysis.mistakes.push('Quick loss - possibly impulsive entry')
    }
    if (hours > 72 && Math.abs(pnlPercent) < 0.02) {
      analysis.mistakes.push('Held too long for minimal result')
    }

    return analysis
  }

  autoTag(entry: JournalEntry): string[] {
    const tags: string[] = []

    // Performance tags
    if ((entry.trade.pnlPercent || 0) > 0.05) tags.push('big_winner')
    if ((entry.trade.pnlPercent || 0) < -0.05) tags.push('big_loser')
    if (entry.trade.pnl && entry.trade.pnl > 0) tags.push('winner')
    if (entry.trade.pnl && entry.trade.pnl < 0) tags.push('loser')

    // Condition tags
    if (entry.context.marketCondition === 'trending') tags.push('trend_trade')
    if (entry.context.marketCondition === 'ranging') tags.push('range_trade')
    if (entry.context.volatility > 0.05) tags.push('high_volatility')

    // Quality tags
    if (entry.analysis.entryQuality > 0.7) tags.push('good_entry')
    if (entry.analysis.entryQuality < 0.3) tags.push('bad_entry')
    if (entry.analysis.exitQuality && entry.analysis.exitQuality > 0.7) tags.push('good_exit')

    // Psychology tags
    if (entry.context.confidence < 0.5) tags.push('low_confidence')
    if (entry.context.confidence > 0.8) tags.push('high_confidence')

    // Duration tags
    const hours = (entry.trade.duration || 0) / (1000 * 60 * 60)
    if (hours < 1) tags.push('scalp')
    if (hours > 24) tags.push('swing')

    return tags
  }
}

// ============================================================================
// TRADING JOURNAL (MAIN CLASS)
// ============================================================================

export class TradingJournal {
  private analyzer: JournalAnalyzer
  private tradeAnalyzer: TradeAnalyzer
  private entries: Map<string, JournalEntry> = new Map()

  constructor() {
    this.analyzer = new JournalAnalyzer()
    this.tradeAnalyzer = new TradeAnalyzer()
  }

  recordEntry(
    trade: JournalEntry['trade'],
    context: JournalEntry['context'],
    notes?: string
  ): JournalEntry {
    const analysis = this.tradeAnalyzer.analyzeEntry(trade, context)
    
    const entry: JournalEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      trade,
      context,
      analysis,
      tags: [],
      notes,
      reviewStatus: 'pending',
    }

    // Auto-tag
    entry.tags = this.tradeAnalyzer.autoTag(entry)

    this.entries.set(entry.id, entry)
    this.analyzer.addEntry(entry)

    return entry
  }

  closeEntry(
    entryId: string,
    exitPrice: number,
    exitReason: string
  ): JournalEntry | null {
    const entry = this.entries.get(entryId)
    if (!entry) return null

    entry.trade.exitPrice = exitPrice
    entry.trade.pnl = (exitPrice - entry.trade.entryPrice) * entry.trade.size * (entry.trade.side === 'LONG' ? 1 : -1)
    entry.trade.pnlPercent = entry.trade.pnl / (entry.trade.entryPrice * entry.trade.size)
    entry.trade.status = 'CLOSED'
    entry.trade.exitReason = exitReason
    entry.trade.duration = Date.now() - entry.timestamp.getTime()

    // Re-analyze
    entry.analysis = this.tradeAnalyzer.analyzeExit(entry)
    entry.tags = this.tradeAnalyzer.autoTag(entry)

    return entry
  }

  getEntry(id: string): JournalEntry | undefined {
    return this.entries.get(id)
  }

  getAllEntries(): JournalEntry[] {
    return Array.from(this.entries.values())
  }

  getOpenEntries(): JournalEntry[] {
    return this.getAllEntries().filter(e => e.trade.status === 'OPEN')
  }

  getClosedEntries(): JournalEntry[] {
    return this.getAllEntries().filter(e => e.trade.status === 'CLOSED')
  }

  getStats(): JournalStats {
    return this.analyzer.calculateStats()
  }

  getPatterns(): DetectedPattern[] {
    return this.analyzer.detectPatterns()
  }

  findSimilar(trade: Partial<JournalEntry['trade']>, context: Partial<JournalEntry['context']>): JournalEntry[] {
    return this.analyzer.findSimilar(trade, context)
  }

  getLessonsLearned(): string[] {
    const lessons: string[] = []
    for (const entry of this.getClosedEntries()) {
      lessons.push(...entry.analysis.lessons)
      lessons.push(...entry.analysis.mistakes)
      lessons.push(...entry.analysis.improvements)
    }
    return [...new Set(lessons)]
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { TradingJournal as default, JournalAnalyzer, TradeAnalyzer }
