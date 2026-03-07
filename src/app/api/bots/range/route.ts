import { NextRequest, NextResponse } from "next/server";
import { RangeBot, DEFAULT_RANGE_CONFIG, type RangeConfig } from "@/lib/range-bot/engine";

let rangeBot: RangeBot | null = null;

function getRangeBot(config?: Partial<RangeConfig>) {
  if (!rangeBot || config) {
    rangeBot = new RangeBot(config || DEFAULT_RANGE_CONFIG);
  }
  return rangeBot;
}

export async function GET(request: NextRequest) {
  try {
    const bot = getRangeBot();
    const state = bot.getState();
    
    return NextResponse.json({
      success: true,
      config: state.config,
      rangeState: state.rangeState,
      levels: state.levels,
      positions: state.positions,
      signals: state.signals,
      metrics: state.metrics,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config, price, high, low, volume } = body;

    const bot = getRangeBot(config);

    switch (action) {
      case "update":
        // Update bot with new price data
        bot.update(price, high || price, low || price, volume || 0);
        const signal = bot.generateSignal(price);
        
        return NextResponse.json({
          success: true,
          signal,
          state: bot.getState(),
        });

      case "analyze":
        // Analyze price history to detect range
        const prices = body.prices as number[];
        if (!prices || prices.length === 0) {
          return NextResponse.json({ success: false, error: "No prices provided" }, { status: 400 });
        }
        
        for (const p of prices) {
          bot.update(p, p, p, 0);
        }
        
        return NextResponse.json({
          success: true,
          state: bot.getState(),
        });

      case "execute":
        // Execute a signal
        const signalToExecute = body.signal;
        if (!signalToExecute) {
          return NextResponse.json({ success: false, error: "No signal provided" }, { status: 400 });
        }
        
        const position = bot.executeSignal(signalToExecute);
        
        return NextResponse.json({
          success: true,
          position,
        });

      case "close":
        // Close a position
        const positionId = body.positionId;
        const closePrice = body.price;
        
        if (!positionId || !closePrice) {
          return NextResponse.json({ success: false, error: "Missing positionId or price" }, { status: 400 });
        }
        
        const closedPosition = bot.closePosition(positionId, closePrice);
        
        return NextResponse.json({
          success: true,
          position: closedPosition,
          metrics: bot.getState().metrics,
        });

      case "config":
        // Update configuration
        return NextResponse.json({
          success: true,
          config: bot.getConfig(),
        });

      case "simulate":
        // Run simulation with historical data
        const simPrices = body.prices as number[];
        if (!simPrices || simPrices.length < 50) {
          return NextResponse.json({ success: false, error: "Need at least 50 prices for simulation" }, { status: 400 });
        }
        
        const signals = [];
        for (let i = 0; i < simPrices.length; i++) {
          const p = simPrices[i];
          bot.update(p, p, p, 0);
          
          const sig = bot.generateSignal(p);
          if (sig) {
            signals.push({ ...sig, priceIndex: i });
            
            // Auto-execute in simulation
            if (sig.type === 'BUY' || sig.type === 'SELL') {
              bot.executeSignal(sig);
            }
          }
        }
        
        return NextResponse.json({
          success: true,
          signals,
          finalState: bot.getState(),
        });

      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
