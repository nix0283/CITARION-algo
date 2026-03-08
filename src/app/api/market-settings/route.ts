import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Get market settings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    let settings = await db.marketSettings.findFirst({
      where: userId ? { userId } : { userId: null }
    });
    
    if (!settings) {
      // Create default settings
      const defaultPairs = [
        { symbol: 'BTCUSDT', exchange: 'binance' },
        { symbol: 'ETHUSDT', exchange: 'binance' },
        { symbol: 'BNBUSDT', exchange: 'binance' },
        { symbol: 'SOLUSDT', exchange: 'binance' },
        { symbol: 'XRPUSDT', exchange: 'binance' },
        { symbol: 'DOGEUSDT', exchange: 'binance' },
        { symbol: 'ADAUSDT', exchange: 'binance' },
        { symbol: 'AVAXUSDT', exchange: 'binance' },
      ];
      
      settings = await db.marketSettings.create({
        data: {
          userId: userId || null,
          selectedPairs: JSON.stringify(defaultPairs),
          showExchangeColumn: true,
          show24hChange: true,
          showVolume: false,
          sortBy: 'symbol',
          sortDirection: 'asc'
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      settings: {
        ...settings,
        selectedPairs: JSON.parse(settings.selectedPairs)
      }
    });
  } catch (error) {
    console.error('Error fetching market settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch market settings' },
      { status: 500 }
    );
  }
}

// PUT - Update market settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      selectedPairs,
      showExchangeColumn,
      show24hChange,
      showVolume,
      sortBy,
      sortDirection
    } = body;
    
    // Limit to 30 pairs
    const limitedPairs = (selectedPairs || []).slice(0, 30);
    
    // Find existing settings
    let settings = await db.marketSettings.findFirst({
      where: userId ? { userId } : { userId: null }
    });
    
    if (settings) {
      settings = await db.marketSettings.update({
        where: { id: settings.id },
        data: {
          selectedPairs: JSON.stringify(limitedPairs),
          showExchangeColumn: showExchangeColumn ?? settings.showExchangeColumn,
          show24hChange: show24hChange ?? settings.show24hChange,
          showVolume: showVolume ?? settings.showVolume,
          sortBy: sortBy ?? settings.sortBy,
          sortDirection: sortDirection ?? settings.sortDirection
        }
      });
    } else {
      settings = await db.marketSettings.create({
        data: {
          userId: userId || null,
          selectedPairs: JSON.stringify(limitedPairs),
          showExchangeColumn: showExchangeColumn ?? true,
          show24hChange: show24hChange ?? true,
          showVolume: showVolume ?? false,
          sortBy: sortBy ?? 'symbol',
          sortDirection: sortDirection ?? 'asc'
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      settings: {
        ...settings,
        selectedPairs: JSON.parse(settings.selectedPairs)
      }
    });
  } catch (error) {
    console.error('Error updating market settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update market settings' },
      { status: 500 }
    );
  }
}
