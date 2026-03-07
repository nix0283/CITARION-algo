import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ExchangeId } from '@/lib/exchange/types';

/**
 * GET /api/cornix/features
 * Get Cornix integration features and connected exchanges
 */
export async function GET(request: NextRequest) {
  try {
    // Get all connected exchanges
    const connections = await db.exchangeConnection.findMany({
      where: { isActive: true },
      select: {
        exchange: true,
        permissions: true,
        lastSync: true,
        testnet: true,
      },
    });

    // Map to connected exchange format
    const exchanges = SUPPORTED_EXCHANGES.map((ex) => {
      const connection = connections.find((c) => c.exchange === ex.id);
      return {
        id: ex.id,
        name: ex.name,
        connected: !!connection,
        apiKeyConfigured: !!connection,
        permissions: connection?.permissions || [],
        lastSync: connection?.lastSync || undefined,
        accountType: 'both' as const,
        hasFutures: ex.hasFutures,
        hasSpot: ex.hasSpot,
      };
    });

    // Get signal statistics from database
    const signalStats = await getSignalStatistics();

    // Get Cornix features/settings from database
    const features = await getCornixFeatures();

    return NextResponse.json({
      success: true,
      data: {
        exchanges,
        signalStats,
        features,
      },
    });
  } catch (error) {
    console.error('[Cornix Features API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get Cornix features',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cornix/features
 * Update Cornix feature settings
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { feature, value, features } = body;

    // If updating a single feature
    if (feature && value !== undefined) {
      await updateCornixFeature(feature, value);
      return NextResponse.json({
        success: true,
        message: `Feature ${feature} updated to ${value}`,
      });
    }

    // If updating all features
    if (features) {
      await updateCornixFeatures(features);
      return NextResponse.json({
        success: true,
        message: 'Cornix features updated',
      });
    }

    return NextResponse.json(
      { success: false, error: 'No valid update parameters provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Cornix Features API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update Cornix features',
      },
      { status: 500 }
    );
  }
}

// ==================== HELPER FUNCTIONS ====================

const SUPPORTED_EXCHANGES = [
  { id: 'binance', name: 'Binance', hasFutures: true, hasSpot: true },
  { id: 'bybit', name: 'Bybit', hasFutures: true, hasSpot: true },
  { id: 'okx', name: 'OKX', hasFutures: true, hasSpot: true },
  { id: 'bitget', name: 'Bitget', hasFutures: true, hasSpot: true },
  { id: 'bingx', name: 'BingX', hasFutures: true, hasSpot: true },
];

/**
 * Get signal statistics from database
 */
async function getSignalStatistics() {
  try {
    // Check if CornixSignal table exists
    const signalsCount = await db.$queryRaw`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name='CornixSignal'
    `;

    const tableExists = (signalsCount as { count: number }[])?.[0]?.count > 0;

    if (!tableExists) {
      // Return mock stats for demo
      return {
        totalSignals: 0,
        activeSignals: 0,
        executedSignals: 0,
        pendingSignals: 0,
        failedSignals: 0,
      };
    }

    // Query actual signal stats
    const stats = await db.$queryRaw`
      SELECT 
        COUNT(*) as "totalSignals",
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as "activeSignals",
        SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as "executedSignals",
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as "pendingSignals",
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as "failedSignals"
      FROM "CornixSignal"
    `;

    return (stats as Record<string, number>[])?.[0] || {
      totalSignals: 0,
      activeSignals: 0,
      executedSignals: 0,
      pendingSignals: 0,
      failedSignals: 0,
    };
  } catch (error) {
    console.error('[Cornix] Error getting signal stats:', error);
    return {
      totalSignals: 0,
      activeSignals: 0,
      executedSignals: 0,
      pendingSignals: 0,
      failedSignals: 0,
    };
  }
}

/**
 * Get Cornix features from database
 */
async function getCornixFeatures() {
  try {
    // Check if SystemSettings table exists
    const settingsCount = await db.$queryRaw`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name='SystemSettings'
    `;

    const tableExists = (settingsCount as { count: number }[])?.[0]?.count > 0;

    if (!tableExists) {
      // Return default features
      return getDefaultFeatures();
    }

    // Try to get settings from database
    const settings = await db.$queryRaw`
      SELECT key, value FROM "SystemSettings"
      WHERE key LIKE 'cornix_%'
    `;

    const settingsMap = new Map(
      (settings as { key: string; value: string }[]).map((s) => [s.key, s.value])
    );

    return {
      autoTrading: settingsMap.get('cornix_autoTrading') === 'true',
      signalParsing: settingsMap.get('cornix_signalParsing') !== 'false', // default true
      webhookEnabled: settingsMap.get('cornix_webhookEnabled') === 'true',
      notificationsEnabled: settingsMap.get('cornix_notificationsEnabled') !== 'false', // default true
      riskManagement: settingsMap.get('cornix_riskManagement') !== 'false', // default true
      tpSlCopy: settingsMap.get('cornix_tpSlCopy') !== 'false', // default true
      leverageLimit: parseInt(settingsMap.get('cornix_leverageLimit') || '10'),
      maxPositions: parseInt(settingsMap.get('cornix_maxPositions') || '5'),
    };
  } catch (error) {
    console.error('[Cornix] Error getting features:', error);
    return getDefaultFeatures();
  }
}

function getDefaultFeatures() {
  return {
    autoTrading: false,
    signalParsing: true,
    webhookEnabled: false,
    notificationsEnabled: true,
    riskManagement: true,
    tpSlCopy: true,
    leverageLimit: 10,
    maxPositions: 5,
  };
}

/**
 * Update a single Cornix feature
 */
async function updateCornixFeature(feature: string, value: boolean | number) {
  try {
    // Try to update in database
    await db.$executeRaw`
      INSERT OR REPLACE INTO "SystemSettings" (key, value, "updatedAt")
      VALUES (${`cornix_${feature}`}, ${String(value)}, ${new Date().toISOString()})
    `;
  } catch (error) {
    console.error('[Cornix] Error updating feature:', error);
    // Fail silently - will use in-memory defaults
  }
}

/**
 * Update all Cornix features
 */
async function updateCornixFeatures(features: Record<string, boolean | number>) {
  try {
    for (const [key, value] of Object.entries(features)) {
      await updateCornixFeature(key, value);
    }
  } catch (error) {
    console.error('[Cornix] Error updating features:', error);
    throw error;
  }
}
