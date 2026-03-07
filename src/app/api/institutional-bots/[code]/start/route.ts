/**
 * Institutional Bot Start API
 */

import { NextRequest, NextResponse } from 'next/server';
import { ReedBot, ArchitectBot, EquilibristBot, KronBot } from '@/lib/institutional-bots';

declare global { var institutionalBots: Map<string, any>; }
if (!global.institutionalBots) { global.institutionalBots = new Map(); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (global.institutionalBots.has(code)) {
    return NextResponse.json({ error: 'Bot already running' }, { status: 400 });
  }
  
  let bot;
  switch (code) {
    case 'STA': bot = new ReedBot(); break;
    case 'MM': bot = new ArchitectBot(); break;
    case 'MR': bot = new EquilibristBot(); break;
    case 'TRF': bot = new KronBot(); break;
    default: return NextResponse.json({ error: 'Unknown bot' }, { status: 404 });
  }
  
  const result = await bot.start();
  if (result.success) {
    global.institutionalBots.set(code, bot);
    return NextResponse.json({ status: 'started', code, message: result.message });
  }
  return NextResponse.json({ error: result.message }, { status: 500 });
}
