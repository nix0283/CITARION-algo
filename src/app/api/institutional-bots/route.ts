/**
 * Institutional Bots API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  ReedBot, 
  ArchitectBot, 
  EquilibristBot, 
  KronBot 
} from '@/lib/institutional-bots';

// Bot instances storage (in production, use Redis)
const botInstances = new Map<string, any>();

// GET /api/institutional-bots/status - Get all bots status
export async function GET(request: NextRequest) {
  const bots = [
    { code: 'STA', name: 'Reed', strategy: 'Statistical Arbitrage', status: { status: 'STOPPED', stats: {} }, signals: [] },
    { code: 'MM', name: 'Architect', strategy: 'Market Making', status: { status: 'STOPPED', stats: {} }, signals: [] },
    { code: 'MR', name: 'Equilibrist', strategy: 'Mean Reversion', status: { status: 'STOPPED', stats: {} }, signals: [] },
    { code: 'TRF', name: 'Kron', strategy: 'Trend Following', status: { status: 'STOPPED', stats: {} }, signals: [] },
  ];
  
  // Get actual status from running instances
  for (const bot of bots) {
    const instance = botInstances.get(bot.code);
    if (instance) {
      const state = instance.getState();
      bot.status = { status: state.status, stats: state.stats };
      bot.signals = state.signals?.slice(0, 10) || [];
    }
  }

  return NextResponse.json({ bots });
}

// POST /api/institutional-bots/[code]/start - Start a bot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  
  // Check if already running
  if (botInstances.has(code)) {
    return NextResponse.json({ error: 'Bot already running' }, { status: 400 });
  }
  
  // Create bot instance
  let bot;
  switch (code) {
    case 'STA':
      bot = new ReedBot();
      break;
    case 'MM':
      bot = new ArchitectBot();
      break;
    case 'MR':
      bot = new EquilibristBot();
      break;
    case 'TRF':
      bot = new KronBot();
      break;
    default:
      return NextResponse.json({ error: 'Unknown bot' }, { status: 404 });
  }
  
  // Start the bot
  const result = await bot.start();
  
  if (result.success) {
    botInstances.set(code, bot);
    return NextResponse.json({ status: 'started', code, message: result.message });
  } else {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }
}

// DELETE /api/institutional-bots/[code]/stop - Stop a bot
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  
  const bot = botInstances.get(code);
  if (!bot) {
    return NextResponse.json({ error: 'Bot not running' }, { status: 400 });
  }
  
  const result = await bot.stop();
  botInstances.delete(code);
  
  return NextResponse.json({ status: 'stopped', code, message: result.message });
}
