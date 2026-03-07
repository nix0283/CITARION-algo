/**
 * LFT Bot - Atlas
 * 
 * Low Frequency Trading Bot
 * Target latency: < 1s per trade
 * Trading frequency: 1-10 trades per day
 * 
 * Strategy: Trend following, multi-timeframe analysis
 */

import { getEventBus } from '../orchestration'
import type { PlatformEvent } from '../orchestration/types'

// ============================================================================
// BOT METADATA
// ============================================================================

export const LFT_BOT_METADATA = {
  code: 'LFT' as const,
  name: 'Atlas',
  fullName: 'Atlas Low Frequency Trading Bot',
  category: 'frequency' as const,
  description: 'Low frequency trading with trend following and multi-timeframe analysis',
  frequency: 'low' as const,
  latencyTarget: 1000000, // 1s in microseconds
  exchanges: ['binance', 'bybit', 'okx', 'bitget', 'bingx'],
  features: [
    'trend_following',
    'multi_timeframe',
    'support_resistance',
    'fibonacci_levels',
    'position_scaling',
  ],
  riskLevel: 'conservative' as const,
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface LFTConfig {
  // Trading parameters
  symbol: string
  exchange: string
  leverage: number
  
  // Timeframes
  primaryTimeframe: string      // e.g., '4h'
  higherTimeframe: string       // e.g., '1d'
  lowerTimeframe: string        // e.g., '1h'
  
  // Trend parameters
  trendPeriod: number           // EMA period for trend
  trendThreshold: number        // Min slope for trend confirmation
  
  // Entry parameters
  entryThreshold: number        // Minimum signal strength (0-1)
  requireHigherTFConfirmation: boolean
  pullbackEntry: boolean        // Wait for pullback to enter
  
  // Exit parameters
  takeProfitRR: number          // Risk:Reward ratio for TP
  stopLossATR: number           // Stop loss in ATR multiples
  trailingStopATR: number       // Trailing stop in ATR multiples
  timeBasedExit: number         // Exit after X hours if no movement
  
  // Position management
  maxPositionSize: number       // Maximum position in base currency
  positionScaleIn: boolean      // Enable scaling in
  positionScaleOut: boolean     // Enable scaling out
  scaleInPercent: number        // Scale in at X% drawdown
  scaleOutPercent: number       // Scale out at X% profit
  
  // Risk management
  maxWeeklyTrades: number
  maxDrawdownPercent: number
  riskPerTrade: number          // % of account per trade
  
  // Timing parameters
  analysisIntervalMs: number    // Analysis interval (default: 60000)
  
  // Feature flags
  enableTrendFollowing: boolean
  enableSupportResistance: boolean
  enableFibonacci: boolean
  enablePositionScaling: boolean
}

export const DEFAULT_LFT_CONFIG: LFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  leverage: 2,
  
  primaryTimeframe: '4h',
  higherTimeframe: '1d',
  lowerTimeframe: '1h',
  
  trendPeriod: 50,
  trendThreshold: 0.02,
  
  entryThreshold: 0.7,
  requireHigherTFConfirmation: true,
  pullbackEntry: true,
  
  takeProfitRR: 3.0,
  stopLossATR: 2.0,
  trailingStopATR: 1.5,
  timeBasedExit: 72,  // 72 hours
  
  maxPositionSize: 1.0,
  positionScaleIn: true,
  positionScaleOut: true,
  scaleInPercent: 2,
  scaleOutPercent: 5,
  
  maxWeeklyTrades: 5,
  maxDrawdownPercent: 15,
  riskPerTrade: 2,
  
  analysisIntervalMs: 60000,
  
  enableTrendFollowing: true,
  enableSupportResistance: true,
  enableFibonacci: true,
  enablePositionScaling: true,
}

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'sideways'
  strength: number          // 0-1
  slope: number             // Price change per period
  ema: number               // Current EMA value
  pricePosition: 'above' | 'below' | 'neutral'
  confidence: number
  timestamp: number
}

export interface SupportResistance {
  levels: Level[]
  nearestSupport: number | null
  nearestResistance: number | null
  strength: number
  timestamp: number
}

export interface Level {
  price: number
  type: 'support' | 'resistance'
  strength: number          // 0-1
  touches: number           // Number of times price touched
  lastTouch: number         // Timestamp of last touch
}

export interface FibonacciLevels {
  symbol: string
  highPrice: number
  lowPrice: number
  levels: {
    level: number           // 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1
    price: number
    type: 'retracement' | 'extension'
  }[]
  direction: 'up' | 'down'
  timestamp: number
}

export interface MultiTimeframeAnalysis {
  higherTF: {
    trend: TrendAnalysis
    bias: 'bullish' | 'bearish' | 'neutral'
  }
  primaryTF: {
    trend: TrendAnalysis
    sr: SupportResistance | null
    fib: FibonacciLevels | null
  }
  lowerTF: {
    trend: TrendAnalysis
    entry: {
      optimal: boolean
      price: number | null
    }
  }
  alignment: 'aligned' | 'conflicting' | 'neutral'
  overallBias: 'bullish' | 'bearish' | 'neutral'
  confidence: number
}

export interface LFTSignal {
  timestamp: number
  signalType: 
    | 'trend_continuation_long'
    | 'trend_continuation_short'
    | 'pullback_long'
    | 'pullback_short'
    | 'breakout_long'
    | 'breakout_short'
    | 'support_bounce'
    | 'resistance_rejection'
    | 'fib_retracement'
    | 'none'
  
  strength: number
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  
  entryPrice: number
  stopLoss: number
  takeProfit: number
  takeProfit2?: number      // Second TP level
  takeProfit3?: number      // Third TP level
  
  confidence: number
  metadata: {
    mtfAnalysis?: MultiTimeframeAnalysis
    trend?: TrendAnalysis
    sr?: SupportResistance
    fib?: FibonacciLevels
    atr?: number
  }
}

// ============================================================================
// POSITION & TRADE TYPES
// ============================================================================

export interface LFTPosition {
  id: string
  symbol: string
  exchange: string
  side: 'LONG' | 'SHORT'
  
  // Position sizing
  baseQuantity: number
  currentQuantity: number
  scaledIn: boolean
  
  // Prices
  avgEntryPrice: number
  stopLoss: number
  takeProfit1: number
  takeProfit2?: number
  takeProfit3?: number
  trailingStop: number
  
  // PnL
  unrealizedPnl: number
  realizedPnl: number
  maxProfit: number
  maxDrawdown: number
  
  // Timing
  openedAt: number
  signal: LFTSignal
  
  // Status
  tp1Hit: boolean
  tp2Hit: boolean
  tp3Hit: boolean
}

export interface LFTTrade {
  id: string
  positionId: string
  symbol: string
  exchange: string
  side: 'LONG' | 'SHORT'
  
  entryPrice: number
  exitPrice: number
  quantity: number
  
  pnl: number
  pnlPercent: number
  fee: number
  holdingTime: number      // hours
  
  openedAt: number
  closedAt: number
  exitReason: 'take_profit_1' | 'take_profit_2' | 'take_profit_3' | 'stop_loss' | 'trailing_stop' | 'time_exit' | 'signal_reversal' | 'manual'
}

// ============================================================================
// ENGINE STATE
// ============================================================================

export interface LFTEngineState {
  status: 'idle' | 'running' | 'paused' | 'error'
  
  config: LFTConfig
  
  // Analysis data
  candles: Map<string, Candle[]>
  trends: Map<string, TrendAnalysis>
  supportResistance: Map<string, SupportResistance>
  fibonacci: Map<string, FibonacciLevels>
  atr: number | null
  
  // Multi-timeframe
  mtfAnalysis: MultiTimeframeAnalysis | null
  
  // Current state
  currentPosition: LFTPosition | null
  lastSignal: LFTSignal | null
  
  // Statistics
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  totalFees: number
  maxDrawdown: number
  currentDrawdown: number
  weeklyTrades: number
  lastWeekReset: number
  
  // Performance
  avgHoldingTime: number    // hours
  avgRR: number
  winRate: number
  
  // Error tracking
  lastError?: string
  lastErrorTime?: number
}

export interface Candle {
  openTime: number
  closeTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  trades?: number
}

// ============================================================================
// TREND ANALYZER
// ============================================================================

class TrendAnalyzer {
  /**
   * Analyze trend from candles
   */
  analyze(candles: Candle[], period: number = 50, threshold: number = 0.02): TrendAnalysis {
    if (candles.length < period) {
      return {
        direction: 'sideways',
        strength: 0,
        slope: 0,
        ema: 0,
        pricePosition: 'neutral',
        confidence: 0,
        timestamp: Date.now(),
      }
    }

    const closes = candles.map(c => c.close)
    const currentPrice = closes[closes.length - 1]

    // Calculate EMA
    const ema = this.calculateEMA(closes, period)
    
    // Calculate slope (linear regression on last 20 candles)
    const slope = this.calculateSlope(closes.slice(-20))
    const normalizedSlope = slope / currentPrice

    // Determine direction
    let direction: TrendAnalysis['direction']
    if (normalizedSlope > threshold && currentPrice > ema) {
      direction = 'up'
    } else if (normalizedSlope < -threshold && currentPrice < ema) {
      direction = 'down'
    } else {
      direction = 'sideways'
    }

    // Calculate strength
    const distanceFromEMA = Math.abs(currentPrice - ema) / ema
    const strength = Math.min(1, Math.abs(normalizedSlope) / threshold * 0.5 + distanceFromEMA * 10)

    // Price position relative to EMA
    const pricePosition = currentPrice > ema * 1.01 ? 'above' : currentPrice < ema * 0.99 ? 'below' : 'neutral'

    // Confidence based on consistency
    const recentCandles = candles.slice(-10)
    const consistentCandles = recentCandles.filter(c => 
      (direction === 'up' && c.close > c.open) ||
      (direction === 'down' && c.close < c.open)
    ).length
    const confidence = consistentCandles / 10

    return {
      direction,
      strength,
      slope: normalizedSlope,
      ema,
      pricePosition,
      confidence,
      timestamp: Date.now(),
    }
  }

  private calculateEMA(prices: number[], period: number): number {
    const multiplier = 2 / (period + 1)
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema
    }
    
    return ema
  }

  private calculateSlope(prices: number[]): number {
    const n = prices.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    
    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += prices[i]
      sumXY += i * prices[i]
      sumX2 += i * i
    }
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  }
}

// ============================================================================
// SUPPORT/RESISTANCE ANALYZER
// ============================================================================

class SupportResistanceAnalyzer {
  private minTouches = 2
  private tolerance = 0.005  // 0.5% tolerance

  /**
   * Find support and resistance levels from candles
   */
  analyze(candles: Candle[]): SupportResistance {
    const levels: Map<number, { type: 'support' | 'resistance'; touches: number }> = new Map()

    // Find swing highs and lows
    for (let i = 5; i < candles.length - 5; i++) {
      const candle = candles[i]
      
      // Check for swing high
      const isSwingHigh = candles.slice(i - 5, i + 6).every((c, idx) => 
        idx === 5 || c.high <= candle.high
      )
      
      // Check for swing low
      const isSwingLow = candles.slice(i - 5, i + 6).every((c, idx) => 
        idx === 5 || c.low >= candle.low
      )

      if (isSwingHigh) {
        this.addLevel(levels, candle.high, 'resistance')
      }
      if (isSwingLow) {
        this.addLevel(levels, candle.low, 'support')
      }
    }

    // Convert to array and filter
    const levelArray: Level[] = Array.from(levels.entries())
      .filter(([_, data]) => data.touches >= this.minTouches)
      .map(([price, data]) => ({
        price,
        type: data.type,
        strength: Math.min(1, data.touches / 5),
        touches: data.touches,
        lastTouch: Date.now(),
      }))
      .sort((a, b) => a.price - b.price)

    const currentPrice = candles[candles.length - 1]?.close || 0

    // Find nearest levels
    const supports = levelArray.filter(l => l.type === 'support' && l.price < currentPrice)
    const resistances = levelArray.filter(l => l.type === 'resistance' && l.price > currentPrice)

    return {
      levels: levelArray,
      nearestSupport: supports.length > 0 ? supports[supports.length - 1].price : null,
      nearestResistance: resistances.length > 0 ? resistances[0].price : null,
      strength: levelArray.length > 0 ? levelArray.reduce((sum, l) => sum + l.strength, 0) / levelArray.length : 0,
      timestamp: Date.now(),
    }
  }

  private addLevel(
    levels: Map<number, { type: 'support' | 'resistance'; touches: number }>,
    price: number,
    type: 'support' | 'resistance'
  ): void {
    // Check for existing level within tolerance
    for (const [existingPrice, data] of levels) {
      if (Math.abs(existingPrice - price) / price < this.tolerance) {
        data.touches++
        return
      }
    }
    
    // Add new level
    levels.set(price, { type, touches: 1 })
  }
}

// ============================================================================
// LFT ENGINE
// ============================================================================

export class LFTEngine {
  private state: LFTEngineState
  private trendAnalyzer: TrendAnalyzer
  private srAnalyzer: SupportResistanceAnalyzer
  private eventBus = getEventBus()
  private intervalId: NodeJS.Timeout | null = null
  private trades: LFTTrade[] = []

  constructor(config: Partial<LFTConfig> = {}) {
    const fullConfig = { ...DEFAULT_LFT_CONFIG, ...config }
    
    this.state = {
      status: 'idle',
      config: fullConfig,
      candles: new Map(),
      trends: new Map(),
      supportResistance: new Map(),
      fibonacci: new Map(),
      atr: null,
      mtfAnalysis: null,
      currentPosition: null,
      lastSignal: null,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnl: 0,
      totalFees: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      weeklyTrades: 0,
      lastWeekReset: Date.now(),
      avgHoldingTime: 0,
      avgRR: 0,
      winRate: 0,
    }

    this.trendAnalyzer = new TrendAnalyzer()
    this.srAnalyzer = new SupportResistanceAnalyzer()
  }

  /**
   * Start the LFT engine
   */
  async start(): Promise<void> {
    if (this.state.status === 'running') return

    this.state.status = 'running'

    this.intervalId = setInterval(() => {
      this.analysisCycle()
    }, this.state.config.analysisIntervalMs)

    console.log('[LFT] Engine started')
  }

  /**
   * Stop the LFT engine
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.state.status = 'idle'
    console.log('[LFT] Engine stopped')
  }

  /**
   * Main analysis cycle
   */
  private async analysisCycle(): Promise<void> {
    if (this.state.status !== 'running') return

    try {
      // Update weekly counter
      this.updateWeeklyCounter()

      // In real implementation, fetch candles and perform analysis
      const signal = this.generateSignal()

      if (signal && signal.strength >= this.state.config.entryThreshold) {
        await this.processSignal(signal)
      }

    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error'
      this.state.lastErrorTime = Date.now()
      console.error('[LFT] Analysis error:', error)
    }
  }

  /**
   * Generate trading signal
   */
  private generateSignal(): LFTSignal | null {
    // Placeholder - would use real multi-timeframe analysis
    return {
      timestamp: Date.now(),
      signalType: 'none',
      strength: 0,
      direction: 'NEUTRAL',
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      confidence: 0,
      metadata: {},
    }
  }

  /**
   * Process trading signal
   */
  private async processSignal(signal: LFTSignal): Promise<void> {
    // Check weekly trade limit
    if (this.state.weeklyTrades >= this.state.config.maxWeeklyTrades) return

    // Check drawdown
    if (this.state.currentDrawdown >= this.state.config.maxDrawdownPercent) return

    if (this.state.currentPosition) {
      // Check for scale in/out
      if (this.state.config.enablePositionScaling) {
        await this.checkPositionScaling(signal)
      }
      await this.checkPositionExit(signal)
    } else {
      await this.openPosition(signal)
    }
  }

  /**
   * Open new position
   */
  private async openPosition(signal: LFTSignal): Promise<void> {
    if (signal.direction === 'NEUTRAL') return

    const position: LFTPosition = {
      id: `pos_${Date.now()}`,
      symbol: this.state.config.symbol,
      exchange: this.state.config.exchange,
      side: signal.direction,
      baseQuantity: this.state.config.maxPositionSize,
      currentQuantity: this.state.config.maxPositionSize,
      scaledIn: false,
      avgEntryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit1: signal.takeProfit,
      takeProfit2: signal.takeProfit2,
      takeProfit3: signal.takeProfit3,
      trailingStop: signal.stopLoss,
      unrealizedPnl: 0,
      realizedPnl: 0,
      maxProfit: 0,
      maxDrawdown: 0,
      openedAt: Date.now(),
      signal,
      tp1Hit: false,
      tp2Hit: false,
      tp3Hit: false,
    }

    this.state.currentPosition = position
    this.state.lastSignal = signal
    this.state.weeklyTrades++

    console.log(`[LFT] Opened ${signal.direction} position at ${signal.entryPrice}`)
  }

  /**
   * Check position scaling
   */
  private async checkPositionScaling(_signal: LFTSignal): Promise<void> {
    // Would implement scale in/out logic
  }

  /**
   * Check for position exit
   */
  private async checkPositionExit(_signal: LFTSignal): Promise<void> {
    // Would check exit conditions
  }

  /**
   * Update weekly counter
   */
  private updateWeeklyCounter(): void {
    const now = Date.now()
    const weekMs = 7 * 24 * 60 * 60 * 1000
    
    if (now - this.state.lastWeekReset > weekMs) {
      this.state.weeklyTrades = 0
      this.state.lastWeekReset = now
    }
  }

  /**
   * Get engine state
   */
  getState(): LFTEngineState {
    return { ...this.state }
  }

  /**
   * Get trades
   */
  getTrades(): LFTTrade[] {
    return [...this.trades]
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { LFT_BOT_METADATA }
