/**
 * Institutional Bot Stop API
 */

import { NextRequest, NextResponse } from 'next/server';

declare global { var institutionalBots: Map<string, any>; }
if (!global.institutionalBots) { global.institutionalBots = new Map(); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const bot = global.institutionalBots.get(code);
  if (!bot) {
    return NextResponse.json({ error: 'Bot not running' }, { status: 400 });
  }
  const result = await bot.stop();
  global.institutionalBots.delete(code);
  return NextResponse.json({ status: 'stopped', code, message: result.message });
}
