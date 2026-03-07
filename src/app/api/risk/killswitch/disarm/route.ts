/**
 * Kill Switch Disarm API Endpoint
 */

import { NextResponse } from 'next/server';
import { getRiskService } from '@/lib/risk-management/risk-service';

export async function POST() {
  try {
    const riskService = getRiskService();
    riskService.disarmKillSwitch();

    return NextResponse.json({
      success: true,
      message: 'Kill switch disarmed',
    });
  } catch (error) {
    console.error('[API] Error disarming kill switch:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
