/**
 * Frequency Bots API Endpoint
 * 
 * Manages HFT (Helios), MFT (Selene), LFT (Atlas) frequency trading bots
 */

import { NextRequest, NextResponse } from 'next/server'

// Bot engines
import { HFTEngine } from '@/lib/hft-bot/engine'
import { MFTEngine } from '@/lib/mft-bot/engine'
import { LFTEngine } from '@/lib/lft-bot/engine'

// Types
import type { HFTConfig } from '@/lib/hft-bot/types'
import type { MFTConfig } from '@/lib/mft-bot'
import type { LFTConfig } from '@/lib/lft-bot'

// ============================================================================
// BOT INSTANCES STORAGE
// ============================================================================

// In-memory storage for bot instances (in production would use proper state management)
const botInstances = new Map<string, HFTEngine | MFTEngine | LFTEngine>()

// Bot type definitions
const FREQUENCY_BOTS = {
  HFT: {
    code: 'HFT',
    name: 'Helios',
    fullName: 'High Frequency Trading Bot',
    category: 'frequency',
    description: 'Microstructure analysis and high-speed order execution',
    latencyTarget: '< 10ms',
    features: ['Orderbook imbalance', 'Momentum detection', 'Volume surge analysis'],
  },
  MFT: {
    code: 'MFT',
    name: 'Selene',
    fullName: 'Medium Frequency Trading Bot',
    category: 'frequency',
    description: 'Statistical arbitrage and mean reversion strategies',
    latencyTarget: '< 1s',
    features: ['Statistical arbitrage', 'Mean reversion', 'Pairs trading'],
  },
  LFT: {
    code: 'LFT',
    name: 'Atlas',
    fullName: 'Low Frequency Trading Bot',
    category: 'frequency',
    description: 'Trend following and swing trading strategies',
    latencyTarget: '< 1min',
    features: ['Trend following', 'Swing trading', 'Multi-timeframe analysis'],
  },
}

// ============================================================================
// GET - List all frequency bots with status
// ============================================================================

export async function GET() {
  try {
    const bots = Object.values(FREQUENCY_BOTS).map(bot => {
      const instance = botInstances.get(bot.code)
      let status = 'idle'
      let stats = null
      
      if (instance) {
        if (instance instanceof HFTEngine) {
          const state = instance.getState()
          status = state.status
          stats = {
            totalTrades: state.totalTrades,
            winningTrades: state.winningTrades,
            losingTrades: state.losingTrades,
            totalPnl: state.totalPnl,
            winRate: state.totalTrades > 0 ? state.winningTrades / state.totalTrades : 0,
            avgLatency: state.avgLatency,
            maxDrawdown: state.maxDrawdown,
          }
        } else if (instance instanceof MFTEngine) {
          const state = instance.getState()
          status = state.status
          stats = {
            totalTrades: state.totalTrades,
            winningTrades: state.winningTrades,
            totalPnl: state.totalPnl,
            winRate: state.totalTrades > 0 ? state.winningTrades / state.totalTrades : 0,
          }
        } else if (instance instanceof LFTEngine) {
          const state = instance.getState()
          status = state.status
          stats = {
            totalTrades: state.totalTrades,
            winningTrades: state.winningTrades,
            totalPnl: state.totalPnl,
            winRate: state.totalTrades > 0 ? state.winningTrades / state.totalTrades : 0,
          }
        }
      }
      
      return {
        ...bot,
        status,
        enabled: instance !== undefined,
        stats,
      }
    })
    
    return NextResponse.json({
      success: true,
      bots,
      systemStatus: {
        totalBots: bots.length,
        runningBots: bots.filter(b => b.status === 'running').length,
        category: 'frequency',
      },
    })
  } catch (error) {
    console.error('Error fetching frequency bots:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch frequency bots' },
      { status: 500 }
    )
  }
}

// ============================================================================
// POST - Control frequency bots (start/stop/configure)
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, botCode, config } = body
    
    if (!botCode || !['HFT', 'MFT', 'LFT'].includes(botCode)) {
      return NextResponse.json(
        { success: false, error: 'Invalid bot code' },
        { status: 400 }
      )
    }
    
    switch (action) {
      case 'start':
        return await startBot(botCode, config)
      case 'stop':
        return await stopBot(botCode)
      case 'configure':
        return await configureBot(botCode, config)
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error controlling frequency bot:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to control bot' },
      { status: 500 }
    )
  }
}

// ============================================================================
// BOT CONTROL FUNCTIONS
// ============================================================================

async function startBot(botCode: string, config?: Record<string, unknown>) {
  try {
    // Check if already running
    if (botInstances.has(botCode)) {
      const instance = botInstances.get(botCode)!
      let status = 'unknown'
      
      if (instance instanceof HFTEngine) {
        status = instance.getState().status
      } else if (instance instanceof MFTEngine) {
        status = instance.getState().status
      } else if (instance instanceof LFTEngine) {
        status = instance.getState().status
      }
      
      if (status === 'running') {
        return NextResponse.json({
          success: false,
          error: `${botCode} is already running`,
        })
      }
    }
    
    // Create new instance with config
    let engine: HFTEngine | MFTEngine | LFTEngine
    
    switch (botCode) {
      case 'HFT':
        engine = new HFTEngine(config as Partial<HFTConfig>)
        break
      case 'MFT':
        engine = new MFTEngine(config as Partial<MFTConfig>)
        break
      case 'LFT':
        engine = new LFTEngine(config as Partial<LFTConfig>)
        break
      default:
        return NextResponse.json(
          { success: false, error: 'Unknown bot code' },
          { status: 400 }
        )
    }
    
    // Start the engine
    await engine.start()
    
    // Store instance
    botInstances.set(botCode, engine)
    
    return NextResponse.json({
      success: true,
      message: `${botCode} started successfully`,
      botCode,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error(`Error starting ${botCode}:`, error)
    return NextResponse.json(
      { success: false, error: `Failed to start ${botCode}` },
      { status: 500 }
    )
  }
}

async function stopBot(botCode: string) {
  try {
    const instance = botInstances.get(botCode)
    
    if (!instance) {
      return NextResponse.json({
        success: false,
        error: `${botCode} is not running`,
      })
    }
    
    // Stop the engine
    await instance.stop()
    
    // Remove instance
    botInstances.delete(botCode)
    
    return NextResponse.json({
      success: true,
      message: `${botCode} stopped successfully`,
      botCode,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error(`Error stopping ${botCode}:`, error)
    return NextResponse.json(
      { success: false, error: `Failed to stop ${botCode}` },
      { status: 500 }
    )
  }
}

async function configureBot(botCode: string, config: Record<string, unknown>) {
  try {
    const instance = botInstances.get(botCode)
    
    if (!instance) {
      return NextResponse.json({
        success: false,
        error: `${botCode} is not running. Start it first to configure.`,
      })
    }
    
    // Update configuration
    if (instance instanceof HFTEngine) {
      instance.updateConfig(config as Partial<HFTConfig>)
    } else if (instance instanceof MFTEngine) {
      instance.updateConfig(config as Partial<MFTConfig>)
    } else if (instance instanceof LFTEngine) {
      instance.updateConfig(config as Partial<LFTConfig>)
    }
    
    return NextResponse.json({
      success: true,
      message: `${botCode} configuration updated`,
      botCode,
      config,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error(`Error configuring ${botCode}:`, error)
    return NextResponse.json(
      { success: false, error: `Failed to configure ${botCode}` },
      { status: 500 }
    )
  }
}
