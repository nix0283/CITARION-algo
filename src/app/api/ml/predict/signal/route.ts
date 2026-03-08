/**
 * ML Signal Prediction API
 */

import { NextRequest, NextResponse } from 'next/server';

const ML_SERVICE_URL = 'http://localhost:3006';

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const port = searchParams.get('XTransformPort') || '3006';
  
  try {
    const body = await request.json();
    const response = await fetch(`${ML_SERVICE_URL.replace('3006', port)}/api/v1/predict/signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: 'ML service unavailable' }, { status: 503 });
  }
}
