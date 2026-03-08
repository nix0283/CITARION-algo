/**
 * Bot Integration Layer
 * 
 * Connects trading bots to market data and event bus.
 * Provides real-time data streaming and signal publishing.
 */

import { getMarketDataService, type MarketDataConfig } from './market-data-service'
import { getEventBus } from '../orchestration'
import { getBotManager, type BotType } from './index'

// ============================================================================
// TYPES
// ============================================================================

export interface BotIntegrationConfig {
  botCode: BotType
  exchange: string
  symbol: string
  interval?: string
  credentials?: {
    apiKey: string
    apiSecret: string
    passphrase?: string
  }
}

export interface SignalData {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
  metadata?: Record<string, unknown>
}

// ============================================================================
// BOT INTEGRATION MANAGER
// ============================================================================

class BotIntegrationManager {
  private marketData = getMarketDataService()
  private eventBus = getEventBus()
  private botManager = getBotManager()
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private wsConnections: Map<string, WebSocket> = new Map()

  /**
   * Start bot integration
   */
  async startBot(config: BotIntegrationConfig): Promise<void> {
    const key = `${config.botCode}_${config.exchange}_${config.symbol}`

    // Stop existing interval if any
    if (this.intervals.has(key)) {
      clearInterval(this.intervals.get(key)!)
    }

    // Get bot interval based on type
    const interval = this.getBotInterval(config.botCode)
    const marketConfig: MarketDataConfig = {
      exchange: config.exchange as any,
      symbol: config.symbol,
      credentials: config.credentials,
    }

    // Start polling loop
    const pollInterval = setInterval(async () => {
      try {
        await this.pollAndProcess(config, marketConfig)
      } catch (error) {
        console.error(`[${config.botCode}] Poll error:`, error)
      }
    }, interval)

    this.intervals.set(key, pollInterval)
    
    console.log(`[BotIntegration] Started ${config.botCode} for ${config.symbol} on ${config.exchange}`)
  }

  /**
   * Stop bot integration
   */
  stopBot(botCode: BotType): void {
    for (const [key, interval] of this.intervals) {
      if (key.startsWith(botCode)) {
        clearInterval(interval)
        this.intervals.delete(key)
      }
    }
    
    // Close WebSocket if any
    for (const [key, ws] of this.wsConnections) {
      if (key.startsWith(botCode)) {
        ws.close()
        this.wsConnections.delete(key)
      }
    }
    
    console.log(`[BotIntegration] Stopped ${botCode}`)
  }

  /**
   * Get polling interval based on bot type
   */
  private getBotInterval(botCode: BotType): number {
    switch (botCode) {
      case 'HFT':
        return 100 // 100ms for HFT
      case 'MFT':
        return 5000 // 5s for MFT
      case 'LFT':
        return 60000 // 1min for LFT
      default:
        return 1000 // 1s default
    }
  }

  /**
   * Poll market data and process signals
   */
  private async poll(
    config: BotIntegrationConfig,
    marketConfig: MarketDataConfig
  ): Promise<void> {
    // Get market data
    const [ticker, candles] = await Promise.all([
      this.marketData.getTicker(marketConfig),
      this.marketData.getCandles(marketConfig, '1m', 100),
    ])

    return { ticker, candles } as any
  }

  private async pollAndProcess(
    config: BotIntegrationConfig,
    marketConfig: MarketDataConfig
  ): Promise<void> {
    // Get market data
    const ticker = await this.marketData.getTicker(marketConfig)
    
    // Process based on bot type
    const signal = await this.processSignal(config, ticker)
    
    if (signal && signal.direction !== 'NEUTRAL') {
      await this.publishSignal(config, signal)
      this.botManager.recordSignal(config.botCode)
    }
  }

  /**
   * Process signal based on bot type
   */
  private async processSignal(
    config: BotIntegrationConfig,
    ticker: any
  ): Promise<SignalData | null> {
    // Import bot engines dynamically
    switch (config.botCode) {
      case 'HFT': {
        const { HFTEngine } = await import('../hft-bot/engine')
        // For now, return a simple signal based on spread
        const spread = (ticker.ask - ticker.bid) / ticker.last
        return {
          direction: spread > 0.001 ? 'SHORT' : spread < -0.001 ? 'LONG' : 'NEUTRAL',
          confidence: Math.min(1, Math.abs(spread) * 1000),
          entryPrice: ticker.last,
        }
      }
      case 'MFT': {
        const { MFTEngine } = await import('../mft-bot/engine')
        // Return placeholder signal
        return {
          direction: 'NEUTRAL',
          confidence: 0,
        }
      }
      case 'LFT': {
        const { LFTEngine } = await import('../lft-bot/engine')
        // Return placeholder signal
        return {
          direction: 'NEUTRAL',
          confidence: 0,
        }
      }
      case 'LOGOS': {
        const { LOGOSEngine } = await import('../logos-bot/engine')
        // LOGOS receives signals, doesn't generate them
        return null
      }
      default:
        return null
    }
  }

  /**
   * Publish signal to event bus
   */
  private async publishSignal(
    config: BotIntegrationConfig,
    signal: SignalData
  ): Promise<void> {
    await this.eventBus.publish(`analytics.signal.${config.botCode}`, {
      id: `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      category: 'analytics',
      source: config.botCode,
      type: 'signal.generated',
      data: {
        botId: config.botCode,
        symbol: config.symbol,
        exchange: config.exchange,
        direction: signal.direction,
        confidence: signal.confidence,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        metadata: signal.metadata,
      },
    })
  }

  /**
   * Get integration status
   */
  getStatus(): { activeIntegrations: string[] } {
    return {
      activeIntegrations: Array.from(this.intervals.keys()),
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let integrationInstance: BotIntegrationManager | null = null

export function getBotIntegration(): BotIntegrationManager {
  if (!integrationInstance) {
    integrationInstance = new BotIntegrationManager()
  }
  return integrationInstance
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { BotIntegrationConfig, SignalData }
