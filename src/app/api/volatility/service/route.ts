/**
 * GARCH Integration Service API Endpoints
 * 
 * GET  /api/volatility/service - Get service summary
 * POST /api/volatility/service/initialize - Initialize symbol with data
 * POST /api/volatility/service/update - Update with new price
 * GET  /api/volatility/service/adjustment - Get risk adjustment for bot
 * GET  /api/volatility/service/forecast - Get volatility forecast
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getGARCHIntegrationService,
  type BotType,
  type VolatilityRegime,
} from '@/lib/volatility/garch-integration-service';

// =============================================================================
// TYPES
// =============================================================================

interface InitializeRequest {
  symbol: string;
  prices: number[];
}

interface UpdateRequest {
  symbol: string;
  newPrice: number;
}

interface AdjustmentRequest {
  symbol: string;
  botType: BotType;
}

interface ForecastRequest {
  symbol: string;
  days?: number;
}

// =============================================================================
// HELPER: Fetch prices from Binance
// =============================================================================

async function fetchPricesFromBinance(symbol: string, limit: number = 365): Promise<number[]> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    return data.map((kline: (string | number)[]) => parseFloat(kline[4] as string));
  } catch (error) {
    console.error('Failed to fetch from Binance:', error);
    throw error;
  }
}

// =============================================================================
// GET: Service Summary
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';

  const service = getGARCHIntegrationService();

  try {
    switch (action) {
      case 'summary':
        return NextResponse.json({
          success: true,
          summary: service.getSummary(),
        });

      case 'adjustment': {
        const symbol = searchParams.get('symbol');
        const botType = searchParams.get('botType') as BotType;

        if (!symbol || !botType) {
          return NextResponse.json(
            { success: false, error: 'Missing symbol or botType' },
            { status: 400 }
          );
        }

        // Initialize if not cached
        let context = service.getVolatilityContext(symbol);
        if (!context) {
          const prices = await fetchPricesFromBinance(symbol);
          context = await service.initializeSymbol(symbol, prices);
        }

        const adjustment = service.getRiskAdjustment(symbol, botType);
        return NextResponse.json({
          success: true,
          adjustment,
          context,
        });
      }

      case 'forecast': {
        const symbol = searchParams.get('symbol');
        const days = parseInt(searchParams.get('days') || '10');

        if (!symbol) {
          return NextResponse.json(
            { success: false, error: 'Missing symbol' },
            { status: 400 }
          );
        }

        let context = service.getVolatilityContext(symbol);
        if (!context) {
          const prices = await fetchPricesFromBinance(symbol);
          context = await service.initializeSymbol(symbol, prices);
        }

        const forecast = service.getVolatilityForecast(symbol, days);
        const accuracy = service.getForecastAccuracy(symbol);

        return NextResponse.json({
          success: true,
          symbol,
          forecast,
          accuracy,
          context,
        });
      }

      case 'context': {
        const symbol = searchParams.get('symbol');

        if (!symbol) {
          return NextResponse.json(
            { success: false, error: 'Missing symbol' },
            { status: 400 }
          );
        }

        let context = service.getVolatilityContext(symbol);
        if (!context) {
          const prices = await fetchPricesFromBinance(symbol);
          context = await service.initializeSymbol(symbol, prices);
        }

        return NextResponse.json({
          success: true,
          context,
        });
      }

      case 'accuracy': {
        const symbol = searchParams.get('symbol');

        if (!symbol) {
          return NextResponse.json(
            { success: false, error: 'Missing symbol' },
            { status: 400 }
          );
        }

        const accuracy = service.getForecastAccuracy(symbol);
        return NextResponse.json({
          success: true,
          symbol,
          accuracy,
        });
      }

      case 'halt': {
        const symbol = searchParams.get('symbol');

        if (!symbol) {
          return NextResponse.json(
            { success: false, error: 'Missing symbol' },
            { status: 400 }
          );
        }

        const shouldHalt = service.shouldHaltTrading(symbol);
        return NextResponse.json({
          success: true,
          symbol,
          shouldHaltTrading: shouldHalt,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('GARCH Service API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST: Initialize, Update
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'initialize';

  const service = getGARCHIntegrationService();

  try {
    const body = await request.json();

    switch (action) {
      case 'initialize': {
        const { symbol, prices } = body as InitializeRequest;

        if (!symbol) {
          return NextResponse.json(
            { success: false, error: 'Missing symbol' },
            { status: 400 }
          );
        }

        let context;

        if (prices && prices.length >= 30) {
          // Use provided prices
          context = await service.initializeSymbol(symbol, prices);
        } else {
          // Fetch from Binance
          const fetchedPrices = await fetchPricesFromBinance(symbol);
          context = await service.initializeSymbol(symbol, fetchedPrices);
        }

        return NextResponse.json({
          success: true,
          context,
          message: `Initialized ${symbol} with ${context ? 'success' : 'failure'}`,
        });
      }

      case 'update': {
        const { symbol, newPrice } = body as UpdateRequest;

        if (!symbol || !newPrice) {
          return NextResponse.json(
            { success: false, error: 'Missing symbol or newPrice' },
            { status: 400 }
          );
        }

        const context = service.updateWithNewPrice(symbol, newPrice);

        if (!context) {
          return NextResponse.json(
            { success: false, error: 'Symbol not initialized' },
            { status: 400 }
          );
        }

        return NextResponse.json({
          success: true,
          context,
        });
      }

      case 'batch-adjustments': {
        const { symbols, botType } = body as { symbols: string[]; botType: BotType };

        if (!symbols || !Array.isArray(symbols) || !botType) {
          return NextResponse.json(
            { success: false, error: 'Missing symbols or botType' },
            { status: 400 }
          );
        }

        const adjustments: Record<string, unknown> = {};

        for (const symbol of symbols) {
          // Initialize if needed
          let context = service.getVolatilityContext(symbol);
          if (!context) {
            try {
              const prices = await fetchPricesFromBinance(symbol);
              context = await service.initializeSymbol(symbol, prices);
            } catch {
              continue; // Skip symbols that fail to fetch
            }
          }

          adjustments[symbol] = service.getRiskAdjustment(symbol, botType);
        }

        return NextResponse.json({
          success: true,
          adjustments,
          botType,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('GARCH Service POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
