/**
 * HFT Engine - Helios
 * 
 * High Frequency Trading Engine
 * Latency target: < 10ms per trade
 */

import { getEventBus, TOPICS } from '../orchestration'
import type { PlatformEvent } from '../orchestration/types'
import {
  HFTConfig,
  DEFAULT_HFT_CONFIG,
  OrderbookSnapshot,
  MicrostructureSignal,
  HFTPosition,
  HFTTrade,
  HFTEngineState,
  HFT_BOT_METADATA,
  createHFTRegistration,
} from './types'

// ============================================================================
// MICROSTRUCTURE ANALYZER
// ============================================================================

class MicrostructureAnalyzer {
  private orderbookHistory: OrderbookSnapshot[] = []
  private maxHistoryLength = 100

  /**
   * Analyze orderbook and generate microstructure metrics
   */
  analyzeOrderbook(
    bids: [number, number][],
    asks: [number, number][],
    symbol: string,
    exchange: string
  ): OrderbookSnapshot {
    const timestamp = Date.now()
    
    // Calculate volumes
    const bidVolume = bids.reduce((sum, [_, qty]) => sum + qty, 0)
    const askVolume = asks.reduce((sum, [_, qty]) => sum + qty, 0)
    const totalVolume = bidVolume + askVolume
    
    // Calculate imbalance (-1 to 1)
    const imbalance = totalVolume > 0 ? (bidVolume - askVolume) / totalVolume : 0
    
    // Calculate spread
    const bestBid = bids[0]?.[0] ?? 0
    const bestAsk = asks[0]?.[0] ?? 0
    const spread = bestAsk - bestBid
    const midPrice = (bestBid + bestAsk) / 2
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0
    
    // Calculate VWAP
    let totalValue = 0
    let totalQty = 0
    for (const [price, qty] of [...bids, ...asks]) {
      totalValue += price * qty
      totalQty += qty
    }
    const vwap = totalQty > 0 ? totalValue / totalQty : midPrice

    const snapshot: OrderbookSnapshot = {
      symbol,
      exchange,
      timestamp,
      bids,
      asks,
      bidVolume,
      askVolume,
      imbalance,
      spread,
      spreadPercent,
      midPrice,
      vwap,
    }

    // Store in history
    this.orderbookHistory.push(snapshot)
    if (this.orderbookHistory.length > this.maxHistoryLength) {
      this.orderbookHistory.shift()
    }

    return snapshot
  }

  /**
   * Calculate momentum from orderbook history
   */
  calculateMomentum(): number {
    if (this.orderbookHistory.length < 10) return 0

    const recent = this.orderbookHistory.slice(-10)
    const prices = recent.map(s => s.midPrice)
    
    // Simple linear regression slope
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    const n = prices.length
    
    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += prices[i]
      sumXY += i * prices[i]
      sumX2 += i * i
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const avgPrice = sumY / n
    
    // Normalize to -1 to 1
    return Math.max(-1, Math.min(1, slope / avgPrice * 1000))
  }

  /**
   * Calculate volume surge
   */
  calculateVolumeSurge(): number {
    if (this.orderbookHistory.length < 20) return 1

    const recent = this.orderbookHistory.slice(-5)
    const historical = this.orderbookHistory.slice(-20, -5)

    const recentVolume = recent.reduce((sum, s) => sum + s.bidVolume + s.askVolume, 0) / 5
    const historicalVolume = historical.reduce((sum, s) => sum + s.bidVolume + s.askVolume, 0) / 15

    return historicalVolume > 0 ? recentVolume / historicalVolume : 1
  }

  /**
   * Get orderbook history
   */
  getHistory(): OrderbookSnapshot[] {
    return [...this.orderbookHistory]
  }
}

// ============================================================================
// SIGNAL GENERATOR
// ============================================================================

class SignalGenerator {
  private config: HFTConfig

  constructor(config: HFTConfig) {
    this.config = config
  }

  /**
   * Generate trading signal from microstructure data
   */
  generateSignal(
    orderbook: OrderbookSnapshot,
    momentum: number,
    volumeSurge: number
  ): MicrostructureSignal {
    const { imbalance, midPrice, spreadPercent } = orderbook
    const timestamp = Date.now()

    // Default signal
    let signal: MicrostructureSignal = {
      timestamp,
      signalType: 'none',
      strength: 0,
      direction: 'NEUTRAL',
      entryPrice: midPrice,
      stopLoss: midPrice,
      takeProfit: midPrice,
      confidence: 0,
      metadata: {
        imbalance,
        spread: spreadPercent,
        momentum,
        volume: volumeSurge,
      },
    }

    // Check for imbalance signal
    if (Math.abs(imbalance) >= this.config.imbalanceThreshold) {
      const direction = imbalance > 0 ? 'LONG' : 'SHORT'
      const strength = Math.min(1, Math.abs(imbalance) * 2)
      
      // Calculate entry, SL, TP
      const slPercent = this.config.stopLossPercent / 100
      const tpPercent = this.config.takeProfitPercent / 100
      
      const entryPrice = midPrice
      const stopLoss = direction === 'LONG' 
        ? entryPrice * (1 - slPercent)
        : entryPrice * (1 + slPercent)
      const takeProfit = direction === 'LONG'
        ? entryPrice * (1 + tpPercent)
        : entryPrice * (1 - tpPercent)

      signal = {
        timestamp,
        signalType: imbalance > 0 ? 'imbalance_long' : 'imbalance_short',
        strength,
        direction,
        entryPrice,
        stopLoss,
        takeProfit,
        confidence: strength * 0.8,
        metadata: {
          imbalance,
          spread: spreadPercent,
          momentum,
          volume: volumeSurge,
        },
      }
    }

    // Check for momentum signal (if enabled)
    if (this.config.enableMomentumSignals && signal.strength < 0.5) {
      const absMomentum = Math.abs(momentum)
      if (absMomentum >= 0.5 && volumeSurge >= 1.5) {
        const direction = momentum > 0 ? 'LONG' : 'SHORT'
        const strength = Math.min(1, absMomentum * volumeSurge / 2)
        
        const slPercent = this.config.stopLossPercent / 100
        const tpPercent = this.config.takeProfitPercent / 100
        
        signal = {
          timestamp,
          signalType: momentum > 0 ? 'momentum_up' : 'momentum_down',
          strength,
          direction,
          entryPrice: midPrice,
          stopLoss: direction === 'LONG' 
            ? midPrice * (1 - slPercent)
            : midPrice * (1 + slPercent),
          takeProfit: direction === 'LONG'
            ? midPrice * (1 + tpPercent)
            : midPrice * (1 - tpPercent),
          confidence: strength * 0.7,
          metadata: {
            imbalance,
            spread: spreadPercent,
            momentum,
            volume: volumeSurge,
          },
        }
      }
    }

    return signal
  }
}

// ============================================================================
// HFT ENGINE
// ============================================================================

export class HFTEngine {
  private state: HFTEngineState
  private analyzer: MicrostructureAnalyzer
  private signalGenerator: SignalGenerator
  private eventBus = getEventBus()
  private intervalId: NodeJS.Timeout | null = null
  private trades: HFTTrade[] = []

  constructor(config: Partial<HFTConfig> = {}) {
    const fullConfig = { ...DEFAULT_HFT_CONFIG, ...config }
    
    this.state = {
      status: 'idle',
      config: fullConfig,
      currentPosition: null,
      lastSignal: null,
      lastOrderbook: null,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnl: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      avgLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      ordersLastMinute: 0,
      lastMinuteReset: Date.now(),
      consecutiveErrors: 0,
    }

    this.analyzer = new MicrostructureAnalyzer()
    this.signalGenerator = new SignalGenerator(fullConfig)
  }

  /**
   * Start the HFT engine
   */
  async start(): Promise<void> {
    if (this.state.status === 'running') {
      console.warn('[HFT] Engine already running')
      return
    }

    // Register bot with event bus
    this.eventBus.registerBot(createHFTRegistration(this.state.config))

    this.state.status = 'running'
    
    // Start analysis loop
    this.intervalId = setInterval(() => {
      this.analysisCycle()
    }, this.state.config.analysisIntervalMs)

    // Subscribe to order updates
    await this.eventBus.subscribeToTrading((event) => {
      this.handleOrderEvent(event)
    })

    console.log('[HFT] Engine started')
    
    // Publish start event
    await this.eventBus.publish('system.bot.started', {
      id: `hft_${Date.now()}`,
      timestamp: Date.now(),
      category: 'system',
      source: 'HFT',
      type: 'bot.started',
      data: {
        botId: 'HFT',
        botCode: 'HFT',
        status: 'running',
      },
    } as PlatformEvent)
  }

  /**
   * Stop the HFT engine
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.state.status = 'idle'
    this.eventBus.unregisterBot('HFT')

    console.log('[HFT] Engine stopped')
  }

  /**
   * Pause the engine
   */
  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused'
      console.log('[HFT] Engine paused')
    }
  }

  /**
   * Resume the engine
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running'
      console.log('[HFT] Engine resumed')
    }
  }

  /**
   * Main analysis cycle
   */
  private async analysisCycle(): Promise<void> {
    if (this.state.status !== 'running') return

    const startTime = performance.now()

    try {
      // In real implementation, this would fetch live orderbook
      // For now, we simulate with placeholder data
      const orderbook = this.simulateOrderbook()
      
      // Analyze microstructure
      const snapshot = this.analyzer.analyzeOrderbook(
        orderbook.bids,
        orderbook.asks,
        this.state.config.symbol,
        this.state.config.exchange
      )
      this.state.lastOrderbook = snapshot

      // Calculate derived metrics
      const momentum = this.analyzer.calculateMomentum()
      const volumeSurge = this.analyzer.calculateVolumeSurge()

      // Generate signal
      const signal = this.signalGenerator.generateSignal(snapshot, momentum, volumeSurge)
      this.state.lastSignal = signal

      // Check if we should trade
      if (signal.strength >= this.state.config.entryThreshold) {
        await this.processSignal(signal)
      }

      // Update performance metrics
      const latency = performance.now() - startTime
      this.updateLatencyMetrics(latency)

    } catch (error) {
      this.state.consecutiveErrors++
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error'
      this.state.lastErrorTime = Date.now()
      
      console.error('[HFT] Analysis error:', error)

      if (this.state.consecutiveErrors >= 10) {
        this.state.status = 'error'
        console.error('[HFT] Too many errors, stopping engine')
      }
    }
  }

  /**
   * Process trading signal
   */
  private async processSignal(signal: MicrostructureSignal): Promise<void> {
    // Check rate limits
    if (this.state.ordersLastMinute >= this.state.config.maxOrdersPerMinute) {
      return
    }

    // Check drawdown
    if (this.state.currentDrawdown >= this.state.config.maxDrawdownPercent) {
      return
    }

    // If we have a position, check for exit
    if (this.state.currentPosition) {
      await this.checkPositionExit(signal)
    } else {
      // Open new position
      await this.openPosition(signal)
    }

    // Publish signal event
    await this.eventBus.publishSignal('HFT', {
      id: `sig_${Date.now()}`,
      timestamp: Date.now(),
      category: 'analytics',
      source: 'HFT',
      type: 'signal.generated',
      data: {
        botId: 'HFT',
        signalType: signal.direction === 'LONG' ? 'entry' : signal.direction === 'SHORT' ? 'entry' : 'modify',
        direction: signal.direction,
        confidence: signal.confidence,
      },
    } as PlatformEvent)
  }

  /**
   * Open new position
   */
  private async openPosition(signal: MicrostructureSignal): Promise<void> {
    if (signal.direction === 'NEUTRAL') return

    const position: HFTPosition = {
      id: `pos_${Date.now()}`,
      symbol: this.state.config.symbol,
      exchange: this.state.config.exchange,
      side: signal.direction,
      entryPrice: signal.entryPrice,
      quantity: this.state.config.maxPositionSize,
      unrealizedPnl: 0,
      maxProfit: 0,
      trailingStop: signal.stopLoss,
      openedAt: Date.now(),
    }

    this.state.currentPosition = position
    this.state.ordersLastMinute++

    console.log(`[HFT] Opened ${signal.direction} position at ${signal.entryPrice}`)
  }

  /**
   * Check for position exit
   */
  private async checkPositionExit(signal: MicrostructureSignal): Promise<void> {
    const position = this.state.currentPosition
    if (!position || !this.state.lastOrderbook) return

    const currentPrice = this.state.lastOrderbook.midPrice
    let shouldExit = false
    let exitReason: HFTTrade['exitReason'] = 'signal_reversal'

    // Check take profit
    if (position.side === 'LONG' && currentPrice >= signal.takeProfit) {
      shouldExit = true
      exitReason = 'take_profit'
    } else if (position.side === 'SHORT' && currentPrice <= signal.takeProfit) {
      shouldExit = true
      exitReason = 'take_profit'
    }

    // Check stop loss
    if (position.side === 'LONG' && currentPrice <= position.trailingStop) {
      shouldExit = true
      exitReason = 'stop_loss'
    } else if (position.side === 'SHORT' && currentPrice >= position.trailingStop) {
      shouldExit = true
      exitReason = 'stop_loss'
    }

    // Check signal reversal
    if ((position.side === 'LONG' && signal.direction === 'SHORT') ||
        (position.side === 'SHORT' && signal.direction === 'LONG')) {
      if (signal.strength >= this.state.config.entryThreshold) {
        shouldExit = true
        exitReason = 'signal_reversal'
      }
    }

    if (shouldExit) {
      await this.closePosition(currentPrice, exitReason)
    }
  }

  /**
   * Close position
   */
  private async closePosition(exitPrice: number, exitReason: HFTTrade['exitReason']): Promise<void> {
    const position = this.state.currentPosition
    if (!position) return

    const pnl = position.side === 'LONG'
      ? (exitPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - exitPrice) * position.quantity

    const trade: HFTTrade = {
      id: `trade_${Date.now()}`,
      positionId: position.id,
      symbol: position.symbol,
      exchange: position.exchange,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      pnl,
      pnlPercent: (pnl / (position.entryPrice * position.quantity)) * 100,
      fee: 0, // Would calculate based on exchange fees
      openedAt: position.openedAt,
      closedAt: Date.now(),
      duration: Date.now() - position.openedAt,
      exitReason,
    }

    this.trades.push(trade)
    this.state.currentPosition = null
    this.state.totalTrades++
    this.state.totalPnl += pnl

    if (pnl > 0) {
      this.state.winningTrades++
    } else {
      this.state.losingTrades++
    }

    console.log(`[HFT] Closed position: ${exitReason}, PnL: ${pnl.toFixed(4)}`)
  }

  /**
   * Handle order events from event bus
   */
  private handleOrderEvent(event: PlatformEvent): void {
    console.log('[HFT] Order event:', event.type)
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latency: number): void {
    if (latency < this.state.minLatency) {
      this.state.minLatency = latency
    }
    if (latency > this.state.maxLatency) {
      this.state.maxLatency = latency
    }
    
    // Rolling average
    const alpha = 0.1
    this.state.avgLatency = this.state.avgLatency * (1 - alpha) + latency * alpha
  }

  /**
   * Simulate orderbook (placeholder for real data)
   */
  private simulateOrderbook(): { bids: [number, number][]; asks: [number, number][] } {
    // This would be replaced with real orderbook data
    const basePrice = 50000 // BTC price
    const spread = 10
    const bids: [number, number][] = []
    const asks: [number, number][] = []

    for (let i = 0; i < 20; i++) {
      bids.push([basePrice - spread - i * 5, Math.random() * 10])
      asks.push([basePrice + spread + i * 5, Math.random() * 10])
    }

    return { bids, asks }
  }

  /**
   * Get engine state
   */
  getState(): HFTEngineState {
    return { ...this.state }
  }

  /**
   * Get trade history
   */
  getTrades(): HFTTrade[] {
    return [...this.trades]
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HFTConfig>): void {
    this.state.config = { ...this.state.config, ...config }
    this.signalGenerator = new SignalGenerator(this.state.config)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { HFT_BOT_METADATA, createHFTRegistration }
export type { HFTConfig, HFTEngineState, HFTTrade, HFTPosition, MicrostructureSignal, OrderbookSnapshot }
