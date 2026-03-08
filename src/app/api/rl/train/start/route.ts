/**
 * RL Training Start API
 */

import { NextRequest, NextResponse } from 'next/server';

const RL_SERVICE_URL = 'http://localhost:3007';

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const port = searchParams.get('XTransformPort') || '3007';
  
  try {
    const body = await request.json();
    const response = await fetch(`${RL_SERVICE_URL.replace('3007', port)}/api/v1/train/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: 'RL service unavailable' }, { status: 503 });
  }
}
