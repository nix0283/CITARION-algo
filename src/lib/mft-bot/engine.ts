/**
 * MFT Bot - Selene
 * 
 * Medium Frequency Trading Bot
 * Target latency: < 100ms per trade
 * Trading frequency: 10-50 trades per day
 * 
 * Strategy: Volume profile analysis, regime detection
 */

import { getEventBus } from '../orchestration'
import type { PlatformEvent } from '../orchestration/types'

// ============================================================================
// BOT METADATA
// ============================================================================

export const MFT_BOT_METADATA = {
  code: 'MFT' as const,
  name: 'Selene',
  fullName: 'Selene Medium Frequency Trading Bot',
  category: 'frequency' as const,
  description: 'Medium frequency trading with volume profile analysis',
  frequency: 'medium' as const,
  latencyTarget: 100000, // 100ms in microseconds
  exchanges: ['binance', 'bybit', 'okx', 'bitget'],
  features: [
    'volume_profile',
    'vwap_analysis',
    'regime_detection',
    'multi_timeframe',
    'support_resistance',
  ],
  riskLevel: 'moderate' as const,
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface MFTConfig {
  // Trading parameters
  symbol: string
  exchange: string
  leverage: number
  
  // Timeframes
  primaryTimeframe: string      // e.g., '15m'
  higherTimeframe: string       // e.g., '1h'
  lowerTimeframe: string        // e.g., '5m'
  
  // Volume profile parameters
  volumeProfilePeriods: number  // Number of candles for VP
  volumeNodeThreshold: number   // High volume node threshold (0-1)
  
  // Entry parameters
  entryThreshold: number        // Minimum signal strength (0-1)
  requireHigherTFConfirmation: boolean
  
  // Exit parameters
  takeProfitRR: number          // Risk:Reward ratio for TP
  stopLossATR: number           // Stop loss in ATR multiples
  trailingStopATR: number       // Trailing stop in ATR multiples
  
  // Risk management
  maxPositionSize: number       // Maximum position in base currency
  maxDailyTrades: number
  maxDrawdownPercent: number
  
  // Timing parameters
  analysisIntervalMs: number    // Analysis interval (default: 5000)
  
  // Feature flags
  enableVolumeProfile: boolean
  enableRegimeDetection: boolean
  enableMTFConfirmation: boolean
}

export const DEFAULT_MFT_CONFIG: MFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  leverage: 3,
  
  primaryTimeframe: '15m',
  higherTimeframe: '1h',
  lowerTimeframe: '5m',
  
  volumeProfilePeriods: 100,
  volumeNodeThreshold: 0.7,
  
  entryThreshold: 0.6,
  requireHigherTFConfirmation: true,
  
  takeProfitRR: 2.0,
  stopLossATR: 1.5,
  trailingStopATR: 1.0,
  
  maxPositionSize: 0.5,
  maxDailyTrades: 10,
  maxDrawdownPercent: 10,
  
  analysisIntervalMs: 5000,
  
  enableVolumeProfile: true,
  enableRegimeDetection: true,
  enableMTFConfirmation: true,
}

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

export interface VolumeNode {
  price: number
  volume: number
  isHighVolume: boolean
  isPOC: boolean  // Point of Control
}

export interface VolumeProfile {
  symbol: string
  timeframe: string
  nodes: VolumeNode[]
  poc: number        // Point of Control (highest volume price)
  vah: number        // Value Area High (70% of volume)
  val: number        // Value Area Low
  timestamp: number
}

export interface MarketRegime {
  type: 'trending' | 'ranging' | 'volatile' | 'quiet'
  strength: number   // 0-1
  direction: 'up' | 'down' | 'sideways'
  confidence: number
  timestamp: number
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

export interface ATRData {
  value: number
  percent: number
  timestamp: number
}

export interface MFTSignal {
  timestamp: number
  signalType: 
    | 'vp_support_long'
    | 'vp_resistance_short'
    | 'vwap_bounce'
    | 'trend_continuation'
    | 'range_breakout'
    | 'regime_change'
    | 'none'
  
  strength: number
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  
  entryPrice: number
  stopLoss: number
  takeProfit: number
  
  confidence: number
  metadata: {
    regime?: MarketRegime
    volumeProfile?: VolumeProfile
    atr?: number
    vwap?: number
    higherTFTrend?: 'up' | 'down' | 'sideways'
  }
}

// ============================================================================
// POSITION & TRADE TYPES
// ============================================================================

export interface MFTPosition {
  id: string
  symbol: string
  exchange: string
  side: 'LONG' | 'SHORT'
  entryPrice: number
  quantity: number
  stopLoss: number
  takeProfit: number
  trailingStop: number
  unrealizedPnl: number
  maxProfit: number
  openedAt: number
  signal: MFTSignal
}

export interface MFTTrade {
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
  openedAt: number
  closedAt: number
  duration: number
  exitReason: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'signal_reversal' | 'time_exit' | 'manual'
}

// ============================================================================
// ENGINE STATE
// ============================================================================

export interface MFTEngineState {
  status: 'idle' | 'running' | 'paused' | 'error'
  
  config: MFTConfig
  
  // Analysis data
  candles: Map<string, Candle[]>
  volumeProfiles: Map<string, VolumeProfile>
  currentRegime: MarketRegime | null
  atr: ATRData | null
  vwap: number | null
  
  // Current state
  currentPosition: MFTPosition | null
  lastSignal: MFTSignal | null
  
  // Statistics
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  maxDrawdown: number
  currentDrawdown: number
  dailyTrades: number
  lastDayReset: number
  
  // Error tracking
  lastError?: string
  lastErrorTime?: number
}

// ============================================================================
// VOLUME PROFILE ANALYZER
// ============================================================================

class VolumeProfileAnalyzer {
  /**
   * Calculate volume profile from candles
   */
  calculate(candles: Candle[], threshold: number = 0.7): VolumeProfile {
    if (candles.length === 0) {
      throw new Error('No candles provided')
    }

    // Find price range
    let minPrice = Infinity
    let maxPrice = -Infinity
    for (const candle of candles) {
      minPrice = Math.min(minPrice, candle.low)
      maxPrice = Math.max(maxPrice, candle.high)
    }

    // Create price bins (approx 100 bins)
    const binSize = (maxPrice - minPrice) / 100
    const volumeByPrice: Map<number, number> = new Map()

    // Distribute volume across price range
    for (const candle of candles) {
      const binStart = Math.floor(candle.low / binSize) * binSize
      const binEnd = Math.ceil(candle.high / binSize) * binSize
      
      // Distribute volume evenly across the candle range
      const volumePerBin = candle.volume / ((binEnd - binStart) / binSize)
      
      for (let price = binStart; price < binEnd; price += binSize) {
        const current = volumeByPrice.get(price) || 0
        volumeByPrice.set(price, current + volumePerBin)
      }
    }

    // Find POC (Point of Control)
    let pocVolume = 0
    let pocPrice = minPrice
    for (const [price, volume] of volumeByPrice) {
      if (volume > pocVolume) {
        pocVolume = volume
        pocPrice = price
      }
    }

    // Calculate Value Area (70% of volume)
    const totalVolume = Array.from(volumeByPrice.values()).reduce((a, b) => a + b, 0)
    const targetVolume = totalVolume * 0.7

    // Sort nodes by volume descending
    const sortedNodes = Array.from(volumeByPrice.entries())
      .sort((a, b) => b[1] - a[1])

    let accumulatedVolume = 0
    const valueAreaPrices = new Set<number>()

    for (const [price, volume] of sortedNodes) {
      if (accumulatedVolume >= targetVolume) break
      accumulatedVolume += volume
      valueAreaPrices.add(price)
    }

    const vah = Math.max(...valueAreaPrices) + binSize
    const val = Math.min(...valueAreaPrices)

    // Create nodes
    const nodes: VolumeNode[] = Array.from(volumeByPrice.entries())
      .map(([price, volume]) => ({
        price,
        volume,
        isHighVolume: volume >= pocVolume * threshold,
        isPOC: price === pocPrice,
      }))
      .sort((a, b) => a.price - b.price)

    return {
      symbol: candles[0]?.openTime.toString() || '',
      timeframe: '',
      nodes,
      poc: pocPrice,
      vah,
      val,
      timestamp: Date.now(),
    }
  }

  /**
   * Find support/resistance from volume nodes
   */
  findSupportResistance(vp: VolumeProfile, currentPrice: number): {
    support: number[]
    resistance: number[]
  } {
    const support: number[] = []
    const resistance: number[] = []

    for (const node of vp.nodes) {
      if (node.isHighVolume) {
        if (node.price < currentPrice) {
          support.push(node.price)
        } else {
          resistance.push(node.price)
        }
      }
    }

    return {
      support: support.sort((a, b) => b - a).slice(0, 3),  // Nearest 3
      resistance: resistance.sort((a, b) => a - b).slice(0, 3),
    }
  }
}

// ============================================================================
// REGIME DETECTOR
// ============================================================================

class RegimeDetector {
  /**
   * Detect market regime from candles
   */
  detect(candles: Candle[]): MarketRegime {
    if (candles.length < 20) {
      return {
        type: 'quiet',
        strength: 0,
        direction: 'sideways',
        confidence: 0,
        timestamp: Date.now(),
      }
    }

    const recent = candles.slice(-50)
    const closes = recent.map(c => c.close)
    const volumes = recent.map(c => c.volume)
    const ranges = recent.map(c => c.high - c.low)

    // Calculate ADX-like trend strength
    const trendStrength = this.calculateTrendStrength(closes)
    
    // Calculate volatility
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length
    const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length
    const volatility = avgRange / avgPrice

    // Calculate volume surge
    const recentVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10
    const historicalVol = volumes.slice(-50, -10).reduce((a, b) => a + b, 0) / 40
    const volumeSurge = historicalVol > 0 ? recentVol / historicalVol : 1

    // Determine direction
    const priceChange = (closes[closes.length - 1] - closes[0]) / closes[0]
    const direction = priceChange > 0.01 ? 'up' : priceChange < -0.01 ? 'down' : 'sideways'

    // Determine regime type
    let type: MarketRegime['type']
    let strength: number
    let confidence: number

    if (trendStrength > 0.6 && volatility < 0.02) {
      type = 'trending'
      strength = trendStrength
      confidence = 0.8
    } else if (volatility > 0.03 || volumeSurge > 1.5) {
      type = 'volatile'
      strength = volatility * 10
      confidence = 0.6
    } else if (trendStrength < 0.3 && volatility < 0.01) {
      type = 'ranging'
      strength = 1 - trendStrength
      confidence = 0.7
    } else {
      type = 'quiet'
      strength = 0.3
      confidence = 0.5
    }

    return {
      type,
      strength,
      direction,
      confidence,
      timestamp: Date.now(),
    }
  }

  private calculateTrendStrength(closes: number[]): number {
    // Simple linear regression R-squared
    const n = closes.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0

    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += closes[i]
      sumXY += i * closes[i]
      sumX2 += i * i
      sumY2 += closes[i] * closes[i]
    }

    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

    return denominator === 0 ? 0 : Math.pow(numerator / denominator, 2)
  }
}

// ============================================================================
// MFT ENGINE
// ============================================================================

export class MFTEngine {
  private state: MFTEngineState
  private volumeProfileAnalyzer: VolumeProfileAnalyzer
  private regimeDetector: RegimeDetector
  private eventBus = getEventBus()
  private intervalId: NodeJS.Timeout | null = null
  private trades: MFTTrade[] = []

  constructor(config: Partial<MFTConfig> = {}) {
    const fullConfig = { ...DEFAULT_MFT_CONFIG, ...config }
    
    this.state = {
      status: 'idle',
      config: fullConfig,
      candles: new Map(),
      volumeProfiles: new Map(),
      currentRegime: null,
      atr: null,
      vwap: null,
      currentPosition: null,
      lastSignal: null,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnl: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      dailyTrades: 0,
      lastDayReset: Date.now(),
    }

    this.volumeProfileAnalyzer = new VolumeProfileAnalyzer()
    this.regimeDetector = new RegimeDetector()
  }

  /**
   * Start the MFT engine
   */
  async start(): Promise<void> {
    if (this.state.status === 'running') return

    this.state.status = 'running'

    this.intervalId = setInterval(() => {
      this.analysisCycle()
    }, this.state.config.analysisIntervalMs)

    console.log('[MFT] Engine started')
  }

  /**
   * Stop the MFT engine
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.state.status = 'idle'
    console.log('[MFT] Engine stopped')
  }

  /**
   * Main analysis cycle
   */
  private async analysisCycle(): Promise<void> {
    if (this.state.status !== 'running') return

    try {
      // Update daily counter
      this.updateDailyCounter()

      // In real implementation, fetch candles from exchange
      // For now, simulate analysis
      const signal = this.generateSignal()

      if (signal && signal.strength >= this.state.config.entryThreshold) {
        await this.processSignal(signal)
      }

    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error'
      this.state.lastErrorTime = Date.now()
      console.error('[MFT] Analysis error:', error)
    }
  }

  /**
   * Generate trading signal
   */
  private generateSignal(): MFTSignal | null {
    // Placeholder - would use real analysis
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
  private async processSignal(signal: MFTSignal): Promise<void> {
    // Check daily trade limit
    if (this.state.dailyTrades >= this.state.config.maxDailyTrades) return

    // Check drawdown
    if (this.state.currentDrawdown >= this.state.config.maxDrawdownPercent) return

    if (this.state.currentPosition) {
      await this.checkPositionExit(signal)
    } else {
      await this.openPosition(signal)
    }
  }

  /**
   * Open new position
   */
  private async openPosition(signal: MFTSignal): Promise<void> {
    if (signal.direction === 'NEUTRAL') return

    const position: MFTPosition = {
      id: `pos_${Date.now()}`,
      symbol: this.state.config.symbol,
      exchange: this.state.config.exchange,
      side: signal.direction,
      entryPrice: signal.entryPrice,
      quantity: this.state.config.maxPositionSize,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      trailingStop: signal.stopLoss,
      unrealizedPnl: 0,
      maxProfit: 0,
      openedAt: Date.now(),
      signal,
    }

    this.state.currentPosition = position
    this.state.lastSignal = signal
    this.state.dailyTrades++

    console.log(`[MFT] Opened ${signal.direction} position at ${signal.entryPrice}`)
  }

  /**
   * Check for position exit
   */
  private async checkPositionExit(_signal: MFTSignal): Promise<void> {
    // Would check exit conditions
  }

  /**
   * Update daily counter
   */
  private updateDailyCounter(): void {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    
    if (now - this.state.lastDayReset > dayMs) {
      this.state.dailyTrades = 0
      this.state.lastDayReset = now
    }
  }

  /**
   * Get engine state
   */
  getState(): MFTEngineState {
    return { ...this.state }
  }

  /**
   * Get trades
   */
  getTrades(): MFTTrade[] {
    return [...this.trades]
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { MFT_BOT_METADATA }
