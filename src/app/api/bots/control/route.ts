/**
 * Bot Control API
 * Start, Stop, Pause, Resume bots with real trading
 */

import { NextRequest, NextResponse } from 'next/server';
import { BotOrchestrator, type BotType } from '@/lib/bot-orchestrator';
import { db } from '@/lib/db';
import { testConnection } from '@/lib/auto-trading/exchange-order';

/**
 * GET /api/bots/control
 * Get all active bot instances
 */
export async function GET(request: NextRequest) {
  try {
    const activeBots = BotOrchestrator.getActiveBots();

    return NextResponse.json({
      success: true,
      bots: activeBots,
      count: activeBots.length,
    });
  } catch (error) {
    console.error('Failed to get active bots:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get active bots' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bots/control
 * Start a bot
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, botId, botType, accountId, mode, config } = body;

    // Handle different actions
    switch (action) {
      case 'start': {
        if (!botId || !botType || !accountId || !mode) {
          return NextResponse.json(
            { success: false, error: 'Missing required fields: botId, botType, accountId, mode' },
            { status: 400 }
          );
        }

        const result = await BotOrchestrator.startBot({
          botId,
          botType: botType as BotType,
          accountId,
          mode,
          config: config || {},
        });

        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: 400 }
          );
        }

        // Update database
        await updateBotInDatabase(botId, botType, {
          isActive: true,
          status: 'RUNNING',
        });

        return NextResponse.json({
          success: true,
          bot: result.bot,
          message: `Bot ${botId} started successfully in ${mode} mode`,
        });
      }

      case 'stop': {
        if (!botId) {
          return NextResponse.json(
            { success: false, error: 'Missing botId' },
            { status: 400 }
          );
        }

        const result = await BotOrchestrator.stopBot(botId);

        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: 400 }
          );
        }

        // Update database
        if (result.bot) {
          await updateBotInDatabase(botId, result.bot.type, {
            isActive: false,
            status: 'STOPPED',
          });
        }

        return NextResponse.json({
          success: true,
          bot: result.bot,
          message: `Bot ${botId} stopped`,
        });
      }

      case 'pause': {
        if (!botId) {
          return NextResponse.json(
            { success: false, error: 'Missing botId' },
            { status: 400 }
          );
        }

        const result = await BotOrchestrator.pauseBot(botId);

        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: 400 }
          );
        }

        // Update database
        if (result.bot) {
          await updateBotInDatabase(botId, result.bot.type, {
            status: 'PAUSED',
          });
        }

        return NextResponse.json({
          success: true,
          bot: result.bot,
          message: `Bot ${botId} paused`,
        });
      }

      case 'resume': {
        if (!botId) {
          return NextResponse.json(
            { success: false, error: 'Missing botId' },
            { status: 400 }
          );
        }

        const result = await BotOrchestrator.resumeBot(botId);

        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: 400 }
          );
        }

        // Update database
        if (result.bot) {
          await updateBotInDatabase(botId, result.bot.type, {
            status: 'RUNNING',
            isActive: true,
          });
        }

        return NextResponse.json({
          success: true,
          bot: result.bot,
          message: `Bot ${botId} resumed`,
        });
      }

      case 'test-connection': {
        const { exchangeId, mode, marketType, apiKey, apiSecret, passphrase } = body;

        if (!exchangeId || !mode) {
          return NextResponse.json(
            { success: false, error: 'Missing exchangeId or mode' },
            { status: 400 }
          );
        }

        const result = await testConnection({
          exchangeId,
          mode,
          marketType: marketType || 'futures',
          apiKey,
          apiSecret,
          passphrase,
        });

        return NextResponse.json({
          success: result.success,
          message: result.message,
          latency: result.latency,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use: start, stop, pause, resume, test-connection' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Bot control API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bots/control
 * Execute a trade for a bot
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId, action, trade } = body;

    if (action === 'trade') {
      if (!botId || !trade) {
        return NextResponse.json(
          { success: false, error: 'Missing botId or trade params' },
          { status: 400 }
        );
      }

      const result = await BotOrchestrator.executeTrade(botId, {
        symbol: trade.symbol,
        side: trade.side,
        type: trade.type || 'MARKET',
        amount: trade.amount,
        price: trade.price,
        reason: trade.reason,
      });

      return NextResponse.json(result);
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Bot trade API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper to update bot in database
 */
async function updateBotInDatabase(
  botId: string,
  botType: string,
  updates: Record<string, unknown>
): Promise<void> {
  try {
    const modelMap: Record<string, string> = {
      grid: 'gridBot',
      dca: 'dcaBot',
      bb: 'bBBot',
      vision: 'visionBot',
    };

    const model = modelMap[botType];
    if (!model) return;

    // @ts-expect-error - Dynamic model access
    await db[model].update({
      where: { id: botId },
      data: updates,
    });
  } catch (error) {
    console.error('Failed to update bot in database:', error);
  }
}
