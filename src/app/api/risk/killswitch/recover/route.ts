/**
 * Kill Switch Recover API Endpoint
 */

import { NextResponse } from 'next/server';
import { getRiskService } from '@/lib/risk-management/risk-service';

export async function POST() {
  try {
    const riskService = getRiskService();
    riskService.disarmKillSwitch(); // Reset to allow recovery

    return NextResponse.json({
      success: true,
      message: 'Kill switch recovered - trading can resume',
    });
  } catch (error) {
    console.error('[API] Error recovering kill switch:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
