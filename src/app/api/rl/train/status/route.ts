/**
 * RL Training Status API
 */

import { NextRequest, NextResponse } from 'next/server';

const RL_SERVICE_URL = 'http://localhost:3007';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const port = searchParams.get('XTransformPort') || '3007';
  
  try {
    const response = await fetch(`${RL_SERVICE_URL.replace('3007', port)}/api/v1/train/status`);
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ status: 'idle', error: 'RL service unavailable' }, { status: 503 });
  }
}
