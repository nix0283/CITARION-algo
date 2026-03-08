import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Type for demo price data
interface DemoPriceData {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

// Demo market data with realistic prices
const DEMO_PRICES: Record<string, DemoPriceData> = {
  BTCUSDT: {
    symbol: "BTCUSDT",
    price: 67432.50,
    change24h: 2.45,
    high24h: 68100,
    low24h: 65800,
    volume24h: 28500000000,
  },
  ETHUSDT: {
    symbol: "ETHUSDT",
    price: 3521.80,
    change24h: -0.82,
    high24h: 3600,
    low24h: 3450,
    volume24h: 15200000000,
  },
  BNBUSDT: {
    symbol: "BNBUSDT",
    price: 598.45,
    change24h: 1.23,
    high24h: 610,
    low24h: 585,
    volume24h: 1850000000,
  },
  SOLUSDT: {
    symbol: "SOLUSDT",
    price: 172.30,
    change24h: 4.56,
    high24h: 178,
    low24h: 162,
    volume24h: 3200000000,
  },
  XRPUSDT: {
    symbol: "XRPUSDT",
    price: 0.5234,
    change24h: -1.15,
    high24h: 0.54,
    low24h: 0.51,
    volume24h: 1250000000,
  },
  DOGEUSDT: {
    symbol: "DOGEUSDT",
    price: 0.1542,
    change24h: 3.28,
    high24h: 0.16,
    low24h: 0.148,
    volume24h: 890000000,
  },
  ADAUSDT: {
    symbol: "ADAUSDT",
    price: 0.4521,
    change24h: -0.45,
    high24h: 0.47,
    low24h: 0.44,
    volume24h: 450000000,
  },
  AVAXUSDT: {
    symbol: "AVAXUSDT",
    price: 35.82,
    change24h: 1.89,
    high24h: 37,
    low24h: 34.5,
    volume24h: 380000000,
  },
};

// Update prices in database
async function updatePricesInDB(prices: Record<string, DemoPriceData>) {
  const updates = Object.entries(prices).map(async ([symbol, data]) => {
    try {
      await db.marketPrice.upsert({
        where: { symbol },
        create: {
          symbol,
          exchange: "BINANCE",
          price: data.price,
          high24h: data.high24h,
          low24h: data.low24h,
          volume24h: data.volume24h,
          priceChangePercent: data.change24h,
        },
        update: {
          price: data.price,
          high24h: data.high24h,
          low24h: data.low24h,
          volume24h: data.volume24h,
          priceChangePercent: data.change24h,
          lastUpdate: new Date(),
        }
      });
    } catch (error) {
      console.error(`Failed to update price for ${symbol}:`, error);
    }
  });

  await Promise.all(updates);
}

export async function GET() {
  try {
    // Generate prices with slight random variation to simulate live updates
    const prices = Object.fromEntries(
      Object.entries(DEMO_PRICES).map(([symbol, data]) => {
        // Add slight random variation (-0.1% to +0.1%)
        const changePercent = (Math.random() - 0.5) * 0.2;
        const newPrice = data.price * (1 + changePercent / 100);

        return [
          symbol,
          {
            ...data,
            price: newPrice,
            change24h: data.change24h + (Math.random() - 0.5) * 0.1,
          },
        ];
      })
    );

    // Update prices in database (async, don't wait)
    updatePricesInDB(prices).catch(console.error);

    return NextResponse.json({
      success: true,
      prices,
      timestamp: Date.now(),
      source: "demo",
    });

  } catch (error) {
    console.error("Fetch prices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}

// GET single price
export async function POST(request: Request) {
  try {
    const { symbol } = await request.json();
    
    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    // Check database first
    const dbPrice = await db.marketPrice.findUnique({
      where: { symbol }
    });

    if (dbPrice && (Date.now() - dbPrice.lastUpdate.getTime() < 60000)) {
      return NextResponse.json({
        success: true,
        price: {
          symbol: dbPrice.symbol,
          price: dbPrice.price,
          change24h: dbPrice.priceChangePercent || 0,
          high24h: dbPrice.high24h,
          low24h: dbPrice.low24h,
          volume24h: dbPrice.volume24h,
        },
        timestamp: dbPrice.lastUpdate,
        source: "cache",
      });
    }

    // Fallback to demo price
    const demoPrice = DEMO_PRICES[symbol as keyof typeof DEMO_PRICES];
    if (!demoPrice) {
      return NextResponse.json(
        { error: `Unknown symbol: ${symbol}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      price: demoPrice,
      timestamp: Date.now(),
      source: "demo",
    });

  } catch (error) {
    console.error("Fetch single price error:", error);
    return NextResponse.json(
      { error: "Failed to fetch price" },
      { status: 500 }
    );
  }
}
