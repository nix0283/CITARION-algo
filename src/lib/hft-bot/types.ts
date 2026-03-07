/**
 * HFT Bot - Helios
 * 
 * High Frequency Trading Bot
 * Target latency: < 10ms per trade
 * Trading frequency: 100+ trades per day
 * 
 * Strategy: Market microstructure analysis
 */

import type { BotCode, BotMetadata, BotRegistration } from '../orchestration/types'

// ============================================================================
// BOT METADATA
// ============================================================================

export const HFT_BOT_METADATA: BotMetadata = {
  code: 'HFT',
  name: 'Helios',
  fullName: 'Helios High Frequency Trading Bot',
  category: 'frequency',
  description: 'High frequency trading with microstructure analysis',
  frequency: 'high',
  latencyTarget: 10000, // 10ms in microseconds
  exchanges: ['binance', 'bybit', 'okx'],
  features: [
    'orderbook_imbalance',
    'latency_arbitrage',
    'spread_capture',
    'momentum_signals',
    'micro_trend_following',
  ],
  riskLevel: 'aggressive',
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface HFTConfig {
  // Trading parameters
  symbol: string
  exchange: string
  leverage: number
  
  // Entry parameters
  entryThreshold: number       // Minimum signal strength to enter (0-1)
  orderbookDepth: number       // Orderbook levels to analyze (default: 20)
  imbalanceThreshold: number   // Orderbook imbalance threshold
  
  // Exit parameters
  takeProfitPercent: number
  stopLossPercent: number
  trailingStopPercent: number
  
  // Risk management
  maxPositionSize: number      // Maximum position size in base currency
  maxOrdersPerMinute: number   // Rate limiting
  maxDrawdownPercent: number   // Maximum drawdown before pause
  
  // Timing parameters
  analysisIntervalMs: number   // Analysis interval in milliseconds (default: 100)
  orderTimeoutMs: number       // Order execution timeout
  
  // Feature flags
  enableLatencyArbitrage: boolean
  enableSpreadCapture: boolean
  enableMomentumSignals: boolean
}

export const DEFAULT_HFT_CONFIG: HFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  leverage: 5,
  
  entryThreshold: 0.7,
  orderbookDepth: 20,
  imbalanceThreshold: 0.3,
  
  takeProfitPercent: 0.1,
  stopLossPercent: 0.05,
  trailingStopPercent: 0.03,
  
  maxPositionSize: 0.1,
  maxOrdersPerMinute: 30,
  maxDrawdownPercent: 5,
  
  analysisIntervalMs: 100,
  orderTimeoutMs: 50,
  
  enableLatencyArbitrage: false,
  enableSpreadCapture: true,
  enableMomentumSignals: true,
}

// ============================================================================
// SIGNAL TYPES
// ============================================================================

export interface OrderbookSnapshot {
  symbol: string
  exchange: string
  timestamp: number
  
  bids: [number, number][]  // [price, quantity]
  asks: [number, number][]
  
  // Calculated metrics
  bidVolume: number
  askVolume: number
  imbalance: number           // (bidVol - askVol) / (bidVol + askVol)
  spread: number              // Best ask - best bid
  spreadPercent: number
  midPrice: number
  vwap: number               // Volume weighted average price
}

export interface MicrostructureSignal {
  timestamp: number
  signalType: 
    | 'imbalance_long'
    | 'imbalance_short'
    | 'spread_capture'
    | 'momentum_up'
    | 'momentum_down'
    | 'latency_arb'
    | 'none'
  
  strength: number            // 0-1
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  
  entryPrice: number
  stopLoss: number
  takeProfit: number
  
  confidence: number
  metadata: {
    imbalance?: number
    spread?: number
    momentum?: number
    volume?: number
  }
}

export interface HFTPosition {
  id: string
  symbol: string
  exchange: string
  side: 'LONG' | 'SHORT'
  entryPrice: number
  quantity: number
  unrealizedPnl: number
  maxProfit: number
  trailingStop: number
  openedAt: number
}

export interface HFTTrade {
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
  duration: number            // milliseconds
  exitReason: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'signal_reversal' | 'manual'
}

// ============================================================================
// ENGINE STATE
// ============================================================================

export interface HFTEngineState {
  status: 'idle' | 'running' | 'paused' | 'error'
  
  config: HFTConfig
  
  // Current state
  currentPosition: HFTPosition | null
  lastSignal: MicrostructureSignal | null
  lastOrderbook: OrderbookSnapshot | null
  
  // Statistics
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  maxDrawdown: number
  currentDrawdown: number
  
  // Performance metrics
  avgLatency: number          // microseconds
  minLatency: number
  maxLatency: number
  ordersLastMinute: number
  lastMinuteReset: number
  
  // Error tracking
  lastError?: string
  lastErrorTime?: number
  consecutiveErrors: number
}

// ============================================================================
// REGISTRATION
// ============================================================================

export function createHFTRegistration(config: Partial<HFTConfig> = {}): BotRegistration {
  return {
    metadata: HFT_BOT_METADATA,
    status: 'registered',
    registeredAt: Date.now(),
    subscriptions: [
      'market.orderbook.*',
      'market.trade.*',
      'trading.order.*',
    ],
  }
}
