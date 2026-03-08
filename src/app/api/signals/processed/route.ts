/**
 * API Endpoint: /api/signals/processed
 * 
 * View recent processed signals for debugging and monitoring
 * double-entry protection system.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSignalDeduplicator } from '@/lib/signal-processing';
import { withAuth } from '@/lib/auth-utils';

/**
 * GET /api/signals/processed
 * 
 * Get recent processed signals
 * 
 * Query parameters:
 * - limit: Number of signals to return (default: 50, max: 100)
 * - symbol: Filter by symbol (optional)
 * - direction: Filter by direction (LONG/SHORT, optional)
 * - status: Filter by status (EXECUTED, IGNORED, FAILED, DUPLICATE, optional)
 */
export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await withAuth(request);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const symbol = searchParams.get('symbol')?.toUpperCase();
    const direction = searchParams.get('direction')?.toUpperCase() as 'LONG' | 'SHORT' | null;
    const status = searchParams.get('status')?.toUpperCase();

    // Build where clause
    const where: Record<string, unknown> = {
      expiresAt: { gt: new Date() }, // Only non-expired
    };

    if (symbol) {
      where.symbol = symbol;
    }
    if (direction && ['LONG', 'SHORT'].includes(direction)) {
      where.direction = direction;
    }
    if (status && ['EXECUTED', 'IGNORED', 'FAILED', 'DUPLICATE'].includes(status)) {
      where.status = status;
    }

    // Query database
    const signals = await db.processedSignalRecord.findMany({
      where,
      orderBy: { processedAt: 'desc' },
      take: limit,
    });

    // Get stats from deduplicator
    const deduplicator = getSignalDeduplicator();
    const stats = deduplicator.getStats();

    return NextResponse.json({
      success: true,
      data: {
        signals: signals.map(s => ({
          id: s.id,
          hash: s.signalHash,
          symbol: s.symbol,
          direction: s.direction,
          entryPrices: JSON.parse(s.entryPrices),
          status: s.status,
          positionId: s.positionId,
          tradeId: s.tradeId,
          signalId: s.signalId,
          processedAt: s.processedAt,
          expiresAt: s.expiresAt,
          signalSource: s.signalSource,
          rawTextHash: s.rawTextHash,
        })),
        stats: {
          cacheSize: stats.cacheSize,
          initialized: stats.initialized,
          config: {
            defaultTTL: stats.config.defaultTTL,
            priceSlidingWindow: stats.config.priceSlidingWindow,
            enableFuzzyMatching: stats.config.enableFuzzyMatching,
          },
        },
        filters: {
          symbol,
          direction,
          status,
          limit,
        },
      },
    });
  } catch (error) {
    console.error('[API] Error fetching processed signals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch processed signals' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/signals/processed
 * 
 * Clear the signal cache (for testing/debugging)
 * Requires authentication
 */
export async function DELETE(request: NextRequest) {
  // Check authentication
  const authResult = await withAuth(request);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const hash = searchParams.get('hash');
    const clearAll = searchParams.get('all') === 'true';

    if (clearAll) {
      // Clear all expired entries from database
      const result = await db.processedSignalRecord.deleteMany({
        where: {
          expiresAt: { lte: new Date() },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Cleared ${result.count} expired signals`,
      });
    }

    if (hash) {
      // Delete specific signal by hash
      await db.processedSignalRecord.delete({
        where: { signalHash: hash },
      }).catch(() => {
        // Ignore if not found
      });

      return NextResponse.json({
        success: true,
        message: `Deleted signal with hash: ${hash}`,
      });
    }

    return NextResponse.json(
      { error: 'Specify hash parameter or all=true' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Error clearing processed signals:', error);
    return NextResponse.json(
      { error: 'Failed to clear processed signals' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/signals/processed
 * 
 * Check if a signal would be considered a duplicate
 * (For testing/debugging)
 */
export async function POST(request: NextRequest) {
  // Check authentication
  const authResult = await withAuth(request);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const body = await request.json();
    const { signal } = body;

    if (!signal) {
      return NextResponse.json(
        { error: 'Signal is required' },
        { status: 400 }
      );
    }

    const deduplicator = getSignalDeduplicator();
    
    // Check if signal is duplicate
    const duplicateCheck = await deduplicator.isProcessed({
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrices: signal.entryPrices || [],
      stopLoss: signal.stopLoss,
      takeProfits: signal.takeProfits,
      marketType: signal.marketType,
      rawText: signal.rawText,
    });

    // Find similar signals
    const similarSignals = await deduplicator.findSimilar({
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrices: signal.entryPrices || [],
    });

    return NextResponse.json({
      success: true,
      data: {
        isDuplicate: duplicateCheck.isDuplicate,
        reason: duplicateCheck.reason,
        originalSignal: duplicateCheck.originalSignal,
        similarSignals: similarSignals.slice(0, 5), // Limit to 5
        signalHash: deduplicator.generateHash({
          symbol: signal.symbol,
          direction: signal.direction,
          entryPrices: signal.entryPrices || [],
          stopLoss: signal.stopLoss,
          takeProfits: signal.takeProfits,
          marketType: signal.marketType,
        }),
      },
    });
  } catch (error) {
    console.error('[API] Error checking signal:', error);
    return NextResponse.json(
      { error: 'Failed to check signal' },
      { status: 500 }
    );
  }
}
