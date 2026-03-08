/**
 * ORION Bot API Routes
 *
 * REST API for managing the Orion trend-following bot.
 *
 * Named after the Greek mythological hunter who pursues targets across the sky.
 * Pairs with Argus (market watchman) for comprehensive trading system.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OrionEngine, ORION_NAME, ORION_VERSION, type OrionBotConfig, type TrendSignal } from '@/lib/orion-bot';

// Singleton bot instance
let orionInstance: OrionEngine | null = null;

// ============================================================================
// GET - Get bot status
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    if (!orionInstance) {
      return NextResponse.json({
        success: true,
        bot: null,
        message: 'Orion not initialized. Use POST /start to launch.',
        info: {
          name: ORION_NAME,
          version: ORION_VERSION,
          description: 'Trend-Following Hunter using EMA + Supertrend strategy',
        }
      });
    }

    const state = orionInstance.getState();
    const config = orionInstance.getConfig();
    const validation = orionInstance.getValidationStatus();

    return NextResponse.json({
      success: true,
      bot: {
        name: ORION_NAME,
        version: ORION_VERSION,
        status: state.status,
        mode: state.mode,
        instanceId: state.instanceId,
        uptime: state.startTime ? Date.now() - state.startTime : 0,
        positions: Array.from(state.positions.values()),
        pendingSignals: state.pendingSignals.length,
        riskMetrics: state.riskMetrics,
        dailyStats: state.dailyStats,
        lifetimeStats: state.lifetimeStats,
        errors: state.errors.slice(-10),
        lastHeartbeat: state.lastHeartbeat,
      },
      validation: {
        status: validation.status,
        progress: validation.progress,
        canGoLive: validation.status === 'VALIDATED',
      },
      config: {
        strategy: config.strategy,
        risk: {
          mode: config.risk.riskPerTrade.mode,
          maxRiskPct: config.risk.riskPerTrade.maxRiskPct,
          maxPositions: config.risk.limits.maxPositions,
        },
        hedging: config.hedging,
      }
    });
  } catch (error) {
    console.error('[Orion API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// ============================================================================
// POST - Control bot operations
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config: customConfig } = body;

    switch (action) {
      case 'start': {
        if (orionInstance) {
          const state = orionInstance.getState();
          if (state.status !== 'STOPPED') {
            return NextResponse.json({
              success: false,
              error: 'Orion is already running',
              status: state.status
            }, { status: 400 });
          }
        }

        // Create new instance with custom config
        const config: Partial<OrionBotConfig> = customConfig || {};
        orionInstance = new OrionEngine(config);

        const result = await orionInstance.start();

        return NextResponse.json({
          success: result.success,
          message: result.message,
          bot: {
            name: ORION_NAME,
            version: ORION_VERSION,
            instanceId: orionInstance.getState().instanceId,
          }
        });
      }

      case 'stop': {
        if (!orionInstance) {
          return NextResponse.json({
            success: false,
            error: 'Orion is not running'
          }, { status: 400 });
        }

        const result = await orionInstance.stop();

        return NextResponse.json({
          success: result.success,
          message: result.message
        });
      }

      case 'halt': {
        if (!orionInstance) {
          return NextResponse.json({
            success: false,
            error: 'Orion is not running'
          }, { status: 400 });
        }

        orionInstance.halt(body.reason || 'Manual halt');
        const state = orionInstance.getState();

        return NextResponse.json({
          success: true,
          message: `Orion halted: ${body.reason || 'Manual halt'}`,
          status: state.status
        });
      }

      case 'resume': {
        if (!orionInstance) {
          return NextResponse.json({
            success: false,
            error: 'Orion is not running'
          }, { status: 400 });
        }

        orionInstance.resume();
        const state = orionInstance.getState();

        return NextResponse.json({
          success: true,
          message: 'Orion resumed trading',
          status: state.status
        });
      }

      case 'goLive': {
        if (!orionInstance) {
          return NextResponse.json({
            success: false,
            error: 'Orion is not running'
          }, { status: 400 });
        }

        const result = await orionInstance.goLive();

        return NextResponse.json({
          success: result.success,
          message: result.message
        });
      }

      case 'closePosition': {
        if (!orionInstance) {
          return NextResponse.json({
            success: false,
            error: 'Orion is not running'
          }, { status: 400 });
        }

        const { positionId } = body;
        if (!positionId) {
          return NextResponse.json({
            success: false,
            error: 'positionId is required'
          }, { status: 400 });
        }

        const result = await orionInstance.closePosition(positionId, body.reason || 'API request');

        return NextResponse.json({
          success: result,
          message: result ? 'Position closed' : 'Failed to close position'
        });
      }

      case 'closeAll': {
        if (!orionInstance) {
          return NextResponse.json({
            success: false,
            error: 'Orion is not running'
          }, { status: 400 });
        }

        await orionInstance.closeAllPositions();

        return NextResponse.json({
          success: true,
          message: 'All positions closed'
        });
      }

      case 'status': {
        if (!orionInstance) {
          return NextResponse.json({
            success: true,
            status: null,
            message: 'Orion not initialized'
          });
        }

        const state = orionInstance.getState();
        const validation = orionInstance.getValidationStatus();

        return NextResponse.json({
          success: true,
          status: state.status,
          mode: state.mode,
          positions: state.positions.size,
          validation: validation.status,
          config: orionInstance.getConfig()
        });
      }

      case 'reset': {
        if (orionInstance) {
          await orionInstance.stop();
        }
        orionInstance = null;

        return NextResponse.json({
          success: true,
          message: 'Orion instance reset'
        });
      }

      case 'validate': {
        if (!orionInstance) {
          return NextResponse.json({
            success: false,
            error: 'Orion is not running'
          }, { status: 400 });
        }

        const validation = orionInstance.getValidationStatus();

        return NextResponse.json({
          success: true,
          validation,
          canGoLive: validation.status === 'VALIDATED'
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
          validActions: [
            'start',
            'stop',
            'halt',
            'resume',
            'goLive',
            'closePosition',
            'closeAll',
            'status',
            'reset',
            'validate'
          ]
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Orion API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
