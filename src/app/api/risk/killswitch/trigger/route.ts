/**
 * Kill Switch Trigger API Endpoint
 *
 * POST /api/risk/killswitch/trigger
 * Triggers the kill switch and stops all running bots
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRiskService } from '@/lib/risk-management/risk-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'Manual trigger from API';

    const riskService = getRiskService();

    // Trigger kill switch and stop all bots
    const result = await riskService.triggerKillSwitch(reason);

    console.log('[API] Kill switch triggered:', result);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[API] Error triggering kill switch:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
