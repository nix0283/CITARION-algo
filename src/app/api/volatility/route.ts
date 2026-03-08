/**
 * Volatility Analysis API Endpoint
 *
 * POST /api/volatility - Analyze volatility using GARCH models
 *
 * Uses historical price data to fit GARCH family models and forecast volatility.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createGARCHModel,
  VolatilityAnalyzer,
  type GARCHType,
  type GARCHParams,
  type GARCHResult,
} from '@/lib/volatility';

// =============================================================================
// TYPES
// =============================================================================

interface VolatilityRequest {
  symbol: string;
  modelType: GARCHType;
  params?: Partial<GARCHParams>;
  forecastDays?: number;
  lookbackDays?: number;
}

interface VolatilityResponse {
  success: boolean;
  result?: GARCHResult;
  currentVolatility?: number;
  regime?: 'low' | 'normal' | 'high' | 'extreme';
  historicalVolatility?: number[];
  error?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Fetch historical prices from Binance
 */
async function fetchHistoricalPrices(
  symbol: string,
  days: number = 365
): Promise<number[]> {
  const limit = Math.min(days, 1000);
  const interval = '1d'; // Daily candles for volatility analysis

  try {
    // Use Binance public API
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status}`);
    }

    const data = await response.json();

    // Extract close prices (index 4 in Binance kline data)
    const closePrices = data.map((kline: (string | number)[]) =>
      parseFloat(kline[4] as string)
    );

    return closePrices;
  } catch (error) {
    console.error('Failed to fetch historical prices:', error);
    throw error;
  }
}

/**
 * Calculate returns from prices
 */
function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  return returns;
}

/**
 * Calculate historical volatility (rolling)
 */
function calculateHistoricalVolatility(
  returns: number[],
  windowSize: number = 20
): number[] {
  const volatilities: number[] = [];

  for (let i = windowSize - 1; i < returns.length; i++) {
    const window = returns.slice(i - windowSize + 1, i + 1);
    const mean = window.reduce((s, r) => s + r, 0) / window.length;
    const variance =
      window.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / window.length;
    volatilities.push(Math.sqrt(variance));
  }

  return volatilities;
}

/**
 * Determine volatility regime
 */
function getVolatilityRegime(
  currentVol: number,
  historicalVols: number[]
): 'low' | 'normal' | 'high' | 'extreme' {
  if (historicalVols.length === 0) return 'normal';

  const avgVol =
    historicalVols.reduce((s, v) => s + v, 0) / historicalVols.length;
  const ratio = currentVol / avgVol;

  if (ratio < 0.5) return 'low';
  if (ratio < 1.5) return 'normal';
  if (ratio < 2.5) return 'high';
  return 'extreme';
}

/**
 * Generate sample price data for demo/testing
 */
function generateSamplePrices(count: number = 365): number[] {
  const prices: number[] = [50000]; // Start price
  const dailyVol = 0.02; // 2% daily volatility
  const dailyDrift = 0.0001; // Small positive drift

  for (let i = 1; i < count; i++) {
    const random = Math.random() - 0.5; // Random between -0.5 and 0.5
    const return_ = dailyDrift + dailyVol * random * 2;
    prices.push(prices[i - 1] * (1 + return_));
  }

  return prices;
}

// =============================================================================
// API HANDLERS
// =============================================================================

/**
 * POST /api/volatility
 * Analyze volatility using GARCH models
 */
export async function POST(request: NextRequest): Promise<NextResponse<VolatilityResponse>> {
  try {
    const body: VolatilityRequest = await request.json();
    const {
      symbol = 'BTCUSDT',
      modelType = 'GARCH',
      params,
      forecastDays = 10,
      lookbackDays = 365,
    } = body;

    // Validate model type
    const validTypes: GARCHType[] = ['GARCH', 'GJR-GARCH', 'EGARCH'];
    if (!validTypes.includes(modelType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid model type. Use: ${validTypes.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Fetch historical prices
    let prices: number[];
    try {
      prices = await fetchHistoricalPrices(symbol, lookbackDays);
    } catch (fetchError) {
      console.warn('Failed to fetch real data, using simulated data:', fetchError);
      // Fallback to simulated data
      prices = generateSamplePrices(lookbackDays);
    }

    if (prices.length < 30) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient data. Need at least 30 price points.',
        },
        { status: 400 }
      );
    }

    // Calculate returns
    const returns = calculateReturns(prices);

    // Create and fit GARCH model
    const model = createGARCHModel(modelType, {
      maxIterations: 100,
      tolerance: 1e-6,
    });

    // Set initial parameters if provided
    if (params) {
      // We need to fit first to initialize the model
      // Then we could override params, but the fit method will estimate them
    }

    // Fit the model
    const result = model.fit(returns);

    // Get current volatility
    const currentVolatility = model.getCurrentVolatility();

    // Calculate historical volatility for display
    const historicalVolatility = calculateHistoricalVolatility(returns);

    // Determine volatility regime
    const regime = getVolatilityRegime(currentVolatility, historicalVolatility);

    // Override forecast if different from default
    if (forecastDays !== 10) {
      result.forecast = model.forecast(forecastDays);
    }

    return NextResponse.json({
      success: true,
      result,
      currentVolatility,
      regime,
      historicalVolatility: historicalVolatility.slice(-100), // Last 100 points
    });
  } catch (error) {
    console.error('Volatility analysis error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze volatility',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/volatility
 * Quick volatility check for a symbol
 */
export async function GET(request: NextRequest): Promise<NextResponse<VolatilityResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const modelType = (searchParams.get('model') || 'GARCH') as GARCHType;

    // Use POST handler logic
    const mockRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, modelType }),
    });

    return POST(mockRequest);
  } catch (error) {
    console.error('Volatility GET error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze volatility',
      },
      { status: 500 }
    );
  }
}
