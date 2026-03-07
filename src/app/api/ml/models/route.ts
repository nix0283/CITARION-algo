/**
 * ML Service Proxy - Models
 */

import { NextRequest, NextResponse } from 'next/server';

const ML_SERVICE_URL = 'http://localhost:3006';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const port = searchParams.get('XTransformPort') || '3006';
  
  try {
    const response = await fetch(`${ML_SERVICE_URL.replace('3006', port)}/api/v1/models`);
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ models: [], error: 'ML service unavailable' }, { status: 503 });
  }
}
