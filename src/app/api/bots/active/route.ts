import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Get all active bots
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const botType = searchParams.get('type'); // 'grid', 'dca', 'bb', or null for all
    
    const whereClause = userId ? { userId, isActive: true } : { isActive: true };
    
    interface ActiveBotsResponse {
      grid: Array<{
        id: string;
        name: string;
        symbol: string;
        exchangeId: string;
        status: string;
        totalProfit: number;
        totalTrades: number;
        realizedPnL: number;
        gridCount: number;
        upperPrice: number;
        lowerPrice: number;
        leverage: number;
        startedAt: Date | null;
      }>;
      dca: Array<{
        id: string;
        name: string;
        symbol: string;
        exchangeId: string;
        status: string;
        direction: string;
        totalInvested: number;
        totalAmount: number;
        avgEntryPrice: number | null;
        realizedPnL: number;
        totalTrades: number;
        currentLevel: number;
        dcaLevels: number;
        startedAt: Date | null;
      }>;
      bb: Array<{
        id: string;
        name: string;
        symbol: string;
        exchangeId: string;
        marketType: string;
        direction: string;
        status: string;
        totalProfit: number;
        totalTrades: number;
        winTrades: number;
        lossTrades: number;
        realizedPnL: number;
        timeframes: string;
        leverage: number;
        startedAt: Date | null;
      }>;
    }
    
    const result: ActiveBotsResponse = {
      grid: [],
      dca: [],
      bb: []
    };
    
    // Fetch Grid Bots
    if (!botType || botType === 'grid') {
      const gridBots = await db.gridBot.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          symbol: true,
          exchangeId: true,
          status: true,
          totalProfit: true,
          totalTrades: true,
          realizedPnL: true,
          gridCount: true,
          upperPrice: true,
          lowerPrice: true,
          leverage: true,
          startedAt: true
        },
        orderBy: { startedAt: 'desc' }
      });
      result.grid = gridBots;
    }
    
    // Fetch DCA Bots
    if (!botType || botType === 'dca') {
      const dcaBots = await db.dcaBot.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          symbol: true,
          exchangeId: true,
          status: true,
          direction: true,
          totalInvested: true,
          totalAmount: true,
          avgEntryPrice: true,
          realizedPnL: true,
          totalTrades: true,
          currentLevel: true,
          dcaLevels: true,
          startedAt: true
        },
        orderBy: { startedAt: 'desc' }
      });
      result.dca = dcaBots;
    }
    
    // Fetch BB Bots
    if (!botType || botType === 'bb') {
      const bbBots = await db.bBBot.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          symbol: true,
          exchangeId: true,
          marketType: true,
          direction: true,
          status: true,
          totalProfit: true,
          totalTrades: true,
          winTrades: true,
          lossTrades: true,
          realizedPnL: true,
          timeframes: true,
          leverage: true,
          startedAt: true
        },
        orderBy: { startedAt: 'desc' }
      });
      result.bb = bbBots;
    }
    
    return NextResponse.json({
      success: true,
      bots: result
    });
  } catch (error) {
    console.error('Error fetching active bots:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch active bots' },
      { status: 500 }
    );
  }
}
