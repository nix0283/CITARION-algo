/**
 * Bot Control API - List all bots and system status
 * 
 * GET /api/bots - Get all bots
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBotManager } from '@/lib/bot-manager'

export async function GET(request: NextRequest) {
  try {
    const manager = getBotManager()
    const { searchParams } = new URL(request.url)
    
    const category = searchParams.get('category')
    
    let bots
    if (category) {
      bots = manager.getBotsByCategory(category as any)
    } else {
      bots = manager.getAllBots()
    }
    
    const systemStatus = manager.getSystemStatus()
    
    return NextResponse.json({
      bots,
      systemStatus,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
