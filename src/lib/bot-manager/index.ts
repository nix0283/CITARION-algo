/**
 * CITARION Bot Manager
 * 
 * Central manager for all trading bots.
 * Handles bot lifecycle, configuration, and signal aggregation.
 */

import { getEventBus } from '../orchestration'
import type { BotCode, BotRegistration } from '../orchestration/types'

// ============================================================================
// TYPES
// ============================================================================

export type BotType = 'MESH' | 'SCALE' | 'BAND' | 'PND' | 'TRND' | 'FCST' | 'RNG' | 'LMB' | 'HFT' | 'MFT' | 'LFT' | 'LOGOS'

export type BotCategory = 'operational' | 'institutional' | 'frequency' | 'meta'

export type BotStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error' | 'paused'

export interface BotInfo {
  code: BotType
  name: string
  fullName: string
  category: BotCategory
  description: string
  status: BotStatus
  enabled: boolean
  config: Record<string, unknown>
  stats: BotStats
  lastError?: string
  lastErrorTime?: number
}

export interface BotStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  winRate: number
  avgLatency: number
  lastSignalTime?: number
  signalsGenerated: number
  uptime: number  // milliseconds
  startedAt?: number
}

export interface BotConfig {
  symbol: string
  exchange: string
  enabled: boolean
  leverage?: number
  maxPositionSize?: number
  riskPerTrade?: number
  // Bot-specific configs
  [key: string]: unknown
}

// ============================================================================
// BOT DEFINITIONS
// ============================================================================

const BOT_DEFINITIONS: Record<BotType, Omit<BotInfo, 'status' | 'enabled' | 'config' | 'stats' | 'lastError' | 'lastErrorTime'>> = {
  // Operational Bots
  MESH: {
    code: 'MESH',
    name: 'MESH',
    fullName: 'Grid Bot - Market Maker Strategy',
    category: 'operational',
    description: 'Grid trading with adaptive levels and trailing profit',
  },
  SCALE: {
    code: 'SCALE',
    name: 'SCALE',
    fullName: 'DCA Bot - Dollar Cost Averaging',
    category: 'operational',
    description: 'Dollar cost averaging with safety orders and multi-TP',
  },
  BAND: {
    code: 'BAND',
    name: 'BAND',
    fullName: 'BB Bot - Bollinger Band Mean Reversion',
    category: 'operational',
    description: 'Mean reversion strategy using Bollinger Bands',
  },
  // Institutional Bots
  PND: {
    code: 'PND',
    name: 'PND',
    fullName: 'Argus - Pump & Dump Detection',
    category: 'institutional',
    description: 'Detects and trades pump & dump patterns',
  },
  TRND: {
    code: 'TRND',
    name: 'TRND',
    fullName: 'Orion - Trend Following',
    category: 'institutional',
    description: 'Multi-timeframe trend following with confirmation',
  },
  FCST: {
    code: 'FCST',
    name: 'FCST',
    fullName: 'Vision - Price Forecasting',
    category: 'institutional',
    description: 'ML-based price forecasting and prediction',
  },
  RNG: {
    code: 'RNG',
    name: 'RNG',
    fullName: 'Range Bot - Range Trading',
    category: 'institutional',
    description: 'Range-bound trading with support/resistance',
  },
  LMB: {
    code: 'LMB',
    name: 'LMB',
    fullName: 'Lumibot - AI Assistant',
    category: 'institutional',
    description: 'AI-powered trading assistant',
  },
  // Frequency Bots
  HFT: {
    code: 'HFT',
    name: 'Helios',
    fullName: 'HFT Bot - High Frequency Trading',
    category: 'frequency',
    description: 'High frequency trading with microstructure analysis',
  },
  MFT: {
    code: 'MFT',
    name: 'Selene',
    fullName: 'MFT Bot - Medium Frequency Trading',
    category: 'frequency',
    description: 'Medium frequency with volume profile analysis',
  },
  LFT: {
    code: 'LFT',
    name: 'Atlas',
    fullName: 'LFT Bot - Low Frequency Trading',
    category: 'frequency',
    description: 'Low frequency trend following strategy',
  },
  // Meta Bot
  LOGOS: {
    code: 'LOGOS',
    name: 'Logos',
    fullName: 'Meta Bot - Signal Aggregator',
    category: 'meta',
    description: 'Aggregates signals from all bots for consensus',
  },
}

// Default configs for each bot type
const DEFAULT_CONFIGS: Record<BotType, BotConfig> = {
  MESH: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 3, maxPositionSize: 0.1 },
  SCALE: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 2, maxPositionSize: 0.5, riskPerTrade: 2 },
  BAND: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 2, maxPositionSize: 0.3 },
  PND: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 5, maxPositionSize: 0.2 },
  TRND: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 3, maxPositionSize: 0.5 },
  FCST: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 2, maxPositionSize: 0.3 },
  RNG: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 2, maxPositionSize: 0.3 },
  LMB: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 2, maxPositionSize: 0.2 },
  HFT: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 5, maxPositionSize: 0.1 },
  MFT: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 3, maxPositionSize: 0.5 },
  LFT: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false, leverage: 2, maxPositionSize: 1.0 },
  LOGOS: { symbol: 'BTCUSDT', exchange: 'binance', enabled: false },
}

// ============================================================================
// BOT MANAGER CLASS
// ============================================================================

class BotManager {
  private bots: Map<BotType, BotInfo> = new Map()
  private eventBus = getEventBus()
  private initialized = false

  constructor() {
    this.initializeBots()
  }

  /**
   * Initialize all bot info structures
   */
  private initializeBots(): void {
    for (const [code, definition] of Object.entries(BOT_DEFINITIONS)) {
      const emptyStats: BotStats = {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnl: 0,
        winRate: 0,
        avgLatency: 0,
        signalsGenerated: 0,
        uptime: 0,
      }

      this.bots.set(code as BotType, {
        ...definition,
        status: 'idle',
        enabled: false,
        config: { ...DEFAULT_CONFIGS[code as BotType] },
        stats: emptyStats,
      })
    }
    this.initialized = true
  }

  /**
   * Get all bots info
   */
  getAllBots(): BotInfo[] {
    return Array.from(this.bots.values())
  }

  /**
   * Get bots by category
   */
  getBotsByCategory(category: BotCategory): BotInfo[] {
    return this.getAllBots().filter(bot => bot.category === category)
  }

  /**
   * Get specific bot info
   */
  getBot(code: BotType): BotInfo | undefined {
    return this.bots.get(code)
  }

  /**
   * Start a bot
   */
  async startBot(code: BotType): Promise<{ success: boolean; message: string }> {
    const bot = this.bots.get(code)
    if (!bot) {
      return { success: false, message: `Bot ${code} not found` }
    }

    if (bot.status === 'running') {
      return { success: false, message: `Bot ${code} is already running` }
    }

    try {
      bot.status = 'starting'
      
      // Register with event bus
      this.eventBus.registerBot({
        metadata: {
          code: code as BotCode,
          name: bot.name,
          fullName: bot.fullName,
          category: bot.category,
          description: bot.description,
          frequency: code === 'HFT' ? 'high' : code === 'MFT' ? 'medium' : code === 'LFT' ? 'low' : 'variable',
          latencyTarget: code === 'HFT' ? 10000 : code === 'MFT' ? 100000 : code === 'LFT' ? 1000000 : 500000,
          exchanges: [bot.config.exchange as string],
          features: [],
          riskLevel: bot.category === 'institutional' ? 'aggressive' : 'moderate',
        },
        status: 'active',
        registeredAt: Date.now(),
        subscriptions: this.getSubscriptionsForBot(code),
      })

      bot.status = 'running'
      bot.enabled = true
      bot.stats.startedAt = Date.now()
      
      // Publish start event
      await this.eventBus.publish('system.bot.started', {
        id: `sys_${Date.now()}`,
        timestamp: Date.now(),
        category: 'system',
        source: 'BotManager',
        type: 'bot.started',
        data: {
          botId: code,
          botCode: code,
          status: 'running',
        },
      } as any)

      return { success: true, message: `Bot ${code} started successfully` }
    } catch (error) {
      bot.status = 'error'
      bot.lastError = error instanceof Error ? error.message : 'Unknown error'
      bot.lastErrorTime = Date.now()
      return { success: false, message: `Failed to start bot: ${bot.lastError}` }
    }
  }

  /**
   * Stop a bot
   */
  async stopBot(code: BotType): Promise<{ success: boolean; message: string }> {
    const bot = this.bots.get(code)
    if (!bot) {
      return { success: false, message: `Bot ${code} not found` }
    }

    if (bot.status !== 'running') {
      return { success: false, message: `Bot ${code} is not running` }
    }

    try {
      bot.status = 'stopping'
      
      // Unregister from event bus
      this.eventBus.unregisterBot(code as BotCode)
      
      bot.status = 'idle'
      bot.enabled = false
      bot.stats.uptime = Date.now() - (bot.stats.startedAt || Date.now())
      
      // Publish stop event
      await this.eventBus.publish('system.bot.stopped', {
        id: `sys_${Date.now()}`,
        timestamp: Date.now(),
        category: 'system',
        source: 'BotManager',
        type: 'bot.stopped',
        data: {
          botId: code,
          botCode: code,
          status: 'stopped',
        },
      } as any)

      return { success: true, message: `Bot ${code} stopped successfully` }
    } catch (error) {
      bot.status = 'error'
      bot.lastError = error instanceof Error ? error.message : 'Unknown error'
      bot.lastErrorTime = Date.now()
      return { success: false, message: `Failed to stop bot: ${bot.lastError}` }
    }
  }

  /**
   * Update bot configuration
   */
  updateBotConfig(code: BotType, config: Partial<BotConfig>): { success: boolean; message: string } {
    const bot = this.bots.get(code)
    if (!bot) {
      return { success: false, message: `Bot ${code} not found` }
    }

    bot.config = { ...bot.config, ...config }
    return { success: true, message: `Bot ${code} configuration updated` }
  }

  /**
   * Get subscriptions for a bot
   */
  private getSubscriptionsForBot(code: BotType): string[] {
    const baseSubs = ['trading.order.*', 'risk.position.*']
    
    switch (code) {
      case 'HFT':
        return [...baseSubs, 'market.orderbook.*', 'market.trade.*']
      case 'MFT':
        return [...baseSubs, 'market.price.*', 'analytics.signal.*']
      case 'LFT':
        return [...baseSubs, 'market.price.*', 'analytics.signal.*']
      case 'LOGOS':
        return ['analytics.signal.*', 'system.bot.*']
      default:
        return [...baseSubs, 'market.price.*', 'analytics.signal.*']
    }
  }

  /**
   * Update bot stats
   */
  updateBotStats(code: BotType, stats: Partial<BotStats>): void {
    const bot = this.bots.get(code)
    if (bot) {
      bot.stats = { ...bot.stats, ...stats }
      if (bot.stats.totalTrades > 0) {
        bot.stats.winRate = bot.stats.winningTrades / bot.stats.totalTrades
      }
    }
  }

  /**
   * Record a trade for a bot
   */
  recordTrade(code: BotType, pnl: number, isWin: boolean, latency: number): void {
    const bot = this.bots.get(code)
    if (bot) {
      bot.stats.totalTrades++
      if (isWin) {
        bot.stats.winningTrades++
      } else {
        bot.stats.losingTrades++
      }
      bot.stats.totalPnl += pnl
      bot.stats.winRate = bot.stats.winningTrades / bot.stats.totalTrades
      bot.stats.avgLatency = (bot.stats.avgLatency * (bot.stats.totalTrades - 1) + latency) / bot.stats.totalTrades
    }
  }

  /**
   * Record a signal generated by a bot
   */
  recordSignal(code: BotType): void {
    const bot = this.bots.get(code)
    if (bot) {
      bot.stats.signalsGenerated++
      bot.stats.lastSignalTime = Date.now()
    }
  }

  /**
   * Get system status
   */
  getSystemStatus(): {
    totalBots: number
    runningBots: number
    totalSignals: number
    totalPnl: number
    avgWinRate: number
  } {
    const bots = this.getAllBots()
    const runningBots = bots.filter(b => b.status === 'running')
    
    return {
      totalBots: bots.length,
      runningBots: runningBots.length,
      totalSignals: bots.reduce((sum, b) => sum + b.stats.signalsGenerated, 0),
      totalPnl: bots.reduce((sum, b) => sum + b.stats.totalPnl, 0),
      avgWinRate: bots.reduce((sum, b) => sum + b.stats.winRate, 0) / bots.length,
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let botManagerInstance: BotManager | null = null

export function getBotManager(): BotManager {
  if (!botManagerInstance) {
    botManagerInstance = new BotManager()
  }
  return botManagerInstance
}

// ============================================================================
// EXPORTS
// ============================================================================

export { BOT_DEFINITIONS, DEFAULT_CONFIGS }
export type { BotInfo, BotStats, BotConfig }
