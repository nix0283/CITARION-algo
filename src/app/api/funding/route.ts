/**
 * Funding Rate API Endpoint
 *
 * GET /api/funding - Get current funding rates
 * GET /api/funding?rates=true - Get all funding rates
 * GET /api/funding?history=true - Get funding rate history
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFundingRateWebSocket, fetchFundingRateHistory } from '@/lib/funding';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rates = searchParams.get('rates');
  const history = searchParams.get('history');
  const symbol = searchParams.get('symbol');

  try {
    // Get historical funding rates
    if (history === 'true') {
      const historyData = await db.fundingRateHistory.findMany({
        where: symbol ? { symbol } : undefined,
        orderBy: { fundingTime: 'desc' },
        take: 100,
      });

      return NextResponse.json({
        success: true,
        history: historyData,
      });
    }

    // Get current funding rates from WebSocket
    const fundingWs = getFundingRateWebSocket();
    const currentRates = fundingWs.getAllFundingRates();

    // Also try to get recent rates from database
    const dbRates = await db.fundingRateHistory.findMany({
      where: symbol ? { symbol } : undefined,
      orderBy: { fundingTime: 'desc' },
      distinct: ['symbol', 'exchange'],
      take: 50,
    });

    // Merge WebSocket and DB rates
    const allRates = [...currentRates];

    // Add DB rates that aren't already in WebSocket rates
    for (const dbRate of dbRates) {
      const exists = allRates.some(
        r => r.symbol === dbRate.symbol && r.exchange === dbRate.exchange
      );
      if (!exists) {
        allRates.push({
          symbol: dbRate.symbol,
          exchange: dbRate.exchange,
          fundingRate: dbRate.fundingRate,
          fundingTime: dbRate.fundingTime,
          markPrice: dbRate.markPrice || undefined,
          indexPrice: dbRate.indexPrice || undefined,
          timestamp: dbRate.fundingTime,
        });
      }
    }

    // Calculate total funding (mock for demo)
    const totalFunding = allRates.reduce((sum, rate) => {
      // Simulate position-based funding
      const mockPositionSize = 1000; // $1000 position
      return sum + (mockPositionSize * rate.fundingRate);
    }, 0);

    return NextResponse.json({
      success: true,
      rates: allRates.map(r => ({
        symbol: r.symbol,
        exchange: r.exchange,
        rate: r.fundingRate,
        markPrice: r.markPrice,
        timestamp: r.timestamp.toISOString(),
      })),
      totalFunding: totalFunding,
      count: allRates.length,
    });
  } catch (error) {
    console.error('Funding API error:', error);

    // Return mock data if database fails
    const mockRates = [
      { symbol: 'BTCUSDT', exchange: 'binance', rate: 0.0001, markPrice: 97000, timestamp: new Date().toISOString() },
      { symbol: 'ETHUSDT', exchange: 'binance', rate: 0.00012, markPrice: 3200, timestamp: new Date().toISOString() },
      { symbol: 'SOLUSDT', exchange: 'binance', rate: 0.00005, markPrice: 180, timestamp: new Date().toISOString() },
    ];

    return NextResponse.json({
      success: true,
      rates: mockRates,
      totalFunding: 0,
      count: mockRates.length,
      note: 'Mock data - database unavailable',
    });
  }
}
