/**
 * Bot Control API - Single Bot Operations
 * 
 * GET    /api/bots/[botType]      - Get bot info
 * POST   /api/bots/[botType]/start - Start bot
 * POST   /api/bots/[botType]/stop  - Stop bot
 * PATCH  /api/bots/[botType]       - Update config
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBotManager, type BotType } from '@/lib/bot-manager'

interface RouteParams {
  params: Promise<{ botType: string }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { botType } = await params
    const manager = getBotManager()
    
    const bot = manager.getBot(botType.toUpperCase() as BotType)
    
    if (!bot) {
      return NextResponse.json(
        { error: `Bot ${botType} not found` },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ bot })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { botType } = await params
    const manager = getBotManager()
    const body = await request.json().catch(() => ({}))
    
    const action = body.action || 'start'
    const code = botType.toUpperCase() as BotType
    
    let result
    
    switch (action) {
      case 'start':
        result = await manager.startBot(code)
        break
      case 'stop':
        result = await manager.stopBot(code)
        break
      case 'pause':
        // For now, pause is same as stop
        result = await manager.stopBot(code)
        break
      case 'resume':
        result = await manager.startBot(code)
        break
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
    
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { botType } = await params
    const manager = getBotManager()
    const config = await request.json()
    
    const result = manager.updateBotConfig(
      botType.toUpperCase() as BotType,
      config
    )
    
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
