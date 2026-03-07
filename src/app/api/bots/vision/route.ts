/**
 * Vision Bot API Endpoint
 *
 * POST   /api/bots/vision      - Create new Vision bot
 * GET    /api/bots/vision      - List all Vision bots
 * GET    /api/bots/vision?id=X - Get specific bot status
 * DELETE /api/bots/vision?id=X - Delete a bot
 * PUT    /api/bots/vision      - Update bot configuration
 *
 * POST   /api/bots/vision?action=start    - Start a bot
 * POST   /api/bots/vision?action=stop     - Stop a bot
 * POST   /api/bots/vision?action=forecast - Run forecast
 * POST   /api/bots/vision?action=backtest - Run backtest
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getVisionManager,
  VisionBacktester,
} from '@/lib/vision-bot';
import type {
  VisionBotStatus,
  StrategyType,
} from '@/lib/vision-bot/types';
import { DEFAULT_VISION_CONFIG } from '@/lib/vision-bot/types';

// --------------------------------------------------
// GET handlers
// --------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const accountId = searchParams.get('accountId');

  try {
    // Get specific bot by ID
    if (id) {
      const bot = await db.visionBot.findUnique({
        where: { id },
      });

      if (!bot) {
        return NextResponse.json(
          { success: false, error: 'Bot not found' },
          { status: 404 }
        );
      }

      // Get runtime status from manager if running
      const manager = getVisionManager();
      const worker = manager.getBot(id);

      if (worker) {
        const status = worker.getStatus();
        return NextResponse.json({
          success: true,
          bot: {
            ...bot,
            runtimeStatus: status,
          },
        });
      }

      // Return static bot data if not running
      return NextResponse.json({
        success: true,
        bot: {
          ...bot,
          runtimeStatus: {
            id,
            isRunning: false,
            currentSignal: 'NEUTRAL',
            equity: bot.initialCapital,
            trades: [],
            totalReturn: 0,
            winRate: 0,
            sharpeRatio: 0,
            maxDrawdown: bot.maxDrawdown,
          } as VisionBotStatus,
        },
      });
    }

    // List all bots (optionally filtered by accountId)
    const where = accountId ? { accountId } : {};
    
    const bots = await db.visionBot.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Get running bots status
    const manager = getVisionManager();
    const runningStatuses = manager.getAllStatuses();
    const runningMap = new Map(runningStatuses.map(s => [s.id, s]));

    // Merge database data with runtime status
    const botsWithStatus = bots.map(bot => ({
      ...bot,
      runtimeStatus: runningMap.get(bot.id) || {
        id: bot.id,
        isRunning: false,
        currentSignal: 'NEUTRAL',
        equity: bot.initialCapital,
        trades: [],
        totalReturn: 0,
        winRate: 0,
        sharpeRatio: 0,
        maxDrawdown: bot.maxDrawdown,
      },
    }));

    return NextResponse.json({
      success: true,
      bots: botsWithStatus,
      count: bots.length,
    });
  } catch (error) {
    console.error('Vision GET error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// POST handlers
// --------------------------------------------------

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const body = await request.json().catch(() => ({}));

    // Handle different actions
    switch (action) {
      case 'start':
        return await handleStart(searchParams.get('id'));

      case 'stop':
        return await handleStop(searchParams.get('id'));

      case 'forecast':
        return await handleForecast(searchParams.get('id'));

      case 'backtest':
        return await handleBacktest(body);

      case 'create':
      default:
        return await handleCreate(body);
    }
  } catch (error) {
    console.error('Vision POST error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// PUT handler (Update bot configuration)
// --------------------------------------------------

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Bot ID required' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    // Check if bot exists
    const existing = await db.visionBot.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Bot not found' },
        { status: 404 }
      );
    }

    // Stop bot if running before update
    const manager = getVisionManager();
    const wasRunning = existing.status === 'RUNNING';
    if (wasRunning) {
      manager.stopBot(id);
    }

    // Update bot in database
    const updated = await db.visionBot.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        symbol: body.symbol ?? existing.symbol,
        exchangeId: body.exchangeId ?? existing.exchangeId,
        direction: body.direction ?? existing.direction,
        leverage: body.leverage ?? existing.leverage,
        marginMode: body.marginMode ?? existing.marginMode,
        tradeAmount: body.tradeAmount ?? existing.tradeAmount,
        useForecast: body.useForecast ?? existing.useForecast,
        confidenceThreshold: body.confidenceThreshold ?? existing.confidenceThreshold,
        riskProfile: body.riskProfile ?? existing.riskProfile,
        strategy: body.strategy ?? existing.strategy,
        stopLoss: body.stopLoss ?? existing.stopLoss,
        takeProfit: body.takeProfit ?? existing.takeProfit,
        trailingStop: body.trailingStop ? JSON.stringify(body.trailingStop) : existing.trailingStop,
        cryptoSymbols: body.cryptoSymbols ? JSON.stringify(body.cryptoSymbols) : existing.cryptoSymbols,
        stockIndices: body.stockIndices ? JSON.stringify(body.stockIndices) : existing.stockIndices,
        timeframe: body.timeframe ?? existing.timeframe,
        lookbackDays: body.lookbackDays ?? existing.lookbackDays,
        tradingEnabled: body.tradingEnabled ?? existing.tradingEnabled,
        tradingFee: body.tradingFee ?? existing.tradingFee,
        initialCapital: body.initialCapital ?? existing.initialCapital,
        forecastIntervalMinutes: body.forecastIntervalMinutes ?? existing.forecastIntervalMinutes,
        tradingCycleHours: body.tradingCycleHours ?? existing.tradingCycleHours,
        telegramEnabled: body.telegramEnabled ?? existing.telegramEnabled,
        telegramChatId: body.telegramChatId ?? existing.telegramChatId,
      },
    });

    // Restart bot if it was running
    if (wasRunning) {
      const config = dbBotToConfig(updated);
      await manager.createBot(config);
      await manager.startBot(id);
    }

    return NextResponse.json({
      success: true,
      bot: updated,
    });
  } catch (error) {
    console.error('Vision PUT error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// DELETE handler
// --------------------------------------------------

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Bot ID required' },
      { status: 400 }
    );
  }

  try {
    // Stop bot if running
    const manager = getVisionManager();
    manager.stopBot(id);
    manager.removeBot(id);

    // Delete from database
    await db.visionBot.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Bot ${id} deleted`,
    });
  } catch (error) {
    console.error('Vision DELETE error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// Action handlers
// --------------------------------------------------

async function handleCreate(body: {
  accountId: string;
  name?: string;
  description?: string;
  symbol?: string;
  exchangeId?: string;
  direction?: string;
  leverage?: number;
  marginMode?: string;
  tradeAmount?: number;
  useForecast?: boolean;
  confidenceThreshold?: number;
  riskProfile?: string;
  strategy?: string;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: { enabled: boolean; activationPercent: number; distancePercent: number };
  cryptoSymbols?: string[];
  stockIndices?: string[];
  timeframe?: string;
  lookbackDays?: number;
  tradingEnabled?: boolean;
  tradingFee?: number;
  initialCapital?: number;
  forecastIntervalMinutes?: number;
  tradingCycleHours?: number;
  telegramEnabled?: boolean;
  telegramChatId?: string;
}): Promise<NextResponse> {
  if (!body.accountId) {
    return NextResponse.json(
      { success: false, error: 'accountId is required' },
      { status: 400 }
    );
  }

  // Verify account exists
  const account = await db.account.findUnique({
    where: { id: body.accountId },
  });

  if (!account) {
    return NextResponse.json(
      { success: false, error: 'Account not found' },
      { status: 404 }
    );
  }

  // Create bot in database
  const bot = await db.visionBot.create({
    data: {
      accountId: body.accountId,
      name: body.name || `Vision-${Date.now()}`,
      description: body.description,
      symbol: body.symbol || 'BTC/USDT',
      exchangeId: body.exchangeId || 'binance',
      direction: body.direction || 'LONG',
      leverage: body.leverage ?? 10,
      marginMode: body.marginMode || 'ISOLATED',
      tradeAmount: body.tradeAmount ?? 100,
      useForecast: body.useForecast ?? true,
      confidenceThreshold: body.confidenceThreshold ?? 0.7,
      riskProfile: body.riskProfile || 'normal',
      strategy: body.strategy || 'reentry_24h',
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
      trailingStop: body.trailingStop ? JSON.stringify(body.trailingStop) : null,
      cryptoSymbols: body.cryptoSymbols ? JSON.stringify(body.cryptoSymbols) : '["BTC/USDT"]',
      stockIndices: body.stockIndices ? JSON.stringify(body.stockIndices) : '[]',
      timeframe: body.timeframe || '1h',
      lookbackDays: body.lookbackDays ?? 30,
      tradingEnabled: body.tradingEnabled ?? false,
      tradingFee: body.tradingFee ?? 0.001,
      initialCapital: body.initialCapital ?? 10000,
      forecastIntervalMinutes: body.forecastIntervalMinutes ?? 60,
      tradingCycleHours: body.tradingCycleHours ?? 24,
      telegramEnabled: body.telegramEnabled ?? false,
      telegramChatId: body.telegramChatId,
      status: 'STOPPED',
      isActive: false,
    },
  });

  return NextResponse.json({
    success: true,
    bot,
  });
}

async function handleStart(id: string | null): Promise<NextResponse> {
  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Bot ID required' },
      { status: 400 }
    );
  }

  // Get bot from database
  const bot = await db.visionBot.findUnique({
    where: { id },
  });

  if (!bot) {
    return NextResponse.json(
      { success: false, error: 'Bot not found' },
      { status: 404 }
    );
  }

  // Create worker and start
  const manager = getVisionManager();
  const config = dbBotToConfig(bot);
  
  let worker = manager.getBot(id);
  if (!worker) {
    worker = await manager.createBot(config);
  }

  await manager.startBot(id);

  // Update database status
  await db.visionBot.update({
    where: { id },
    data: {
      status: 'RUNNING',
      isActive: true,
      startedAt: new Date(),
      stoppedAt: null,
    },
  });

  return NextResponse.json({
    success: true,
    message: `Bot ${id} started`,
    status: worker.getStatus(),
  });
}

async function handleStop(id: string | null): Promise<NextResponse> {
  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Bot ID required' },
      { status: 400 }
    );
  }

  const manager = getVisionManager();
  manager.stopBot(id);

  // Update database status
  await db.visionBot.update({
    where: { id },
    data: {
      status: 'STOPPED',
      isActive: false,
      stoppedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    message: `Bot ${id} stopped`,
  });
}

async function handleForecast(id: string | null): Promise<NextResponse> {
  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Bot ID required' },
      { status: 400 }
    );
  }

  const worker = getVisionManager().getBot(id);
  if (!worker) {
    return NextResponse.json(
      { success: false, error: 'Bot not found or not started' },
      { status: 404 }
    );
  }

  const status = worker.getStatus();

  // Update last forecast time in database
  await db.visionBot.update({
    where: { id },
    data: { lastForecastAt: new Date() },
  });

  return NextResponse.json({
    success: true,
    forecast: status.currentForecast,
    signal: status.currentSignal,
  });
}

async function handleBacktest(body: {
  symbol?: string;
  strategy?: StrategyType;
  days?: number;
  initialCapital?: number;
  riskPerTrade?: number;
  leverage?: number;
}): Promise<NextResponse> {
  const {
    symbol = 'BTC/USDT',
    strategy = 'reentry_24h',
    days = 365,
    initialCapital = 10000,
    riskPerTrade = 0.1,
    leverage = 5,
  } = body;

  try {
    const result = await VisionBacktester.runBacktest(
      symbol,
      strategy,
      days,
      initialCapital,
      riskPerTrade,
      leverage
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Backtest error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function dbBotToConfig(bot: {
  id: string;
  name: string;
  symbol: string;
  exchangeId: string;
  direction: string;
  leverage: number;
  marginMode: string;
  tradeAmount: number;
  useForecast: boolean;
  confidenceThreshold: number;
  riskProfile: string;
  strategy: string;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStop: string | null;
  cryptoSymbols: string;
  stockIndices: string;
  goldSymbol: string;
  timeframe: string;
  lookbackDays: number;
  volatilityLow: number;
  volatilityHigh: number;
  trendThreshold: number;
  correlationWeight: number;
  tradingEnabled: boolean;
  tradingFee: number;
  initialCapital: number;
  forecastIntervalMinutes: number;
  tradingCycleHours: number;
  telegramEnabled: boolean;
  telegramChatId: string | null;
}): ReturnType<typeof DEFAULT_VISION_CONFIG> & { id: string; name: string } {
  return {
    id: bot.id,
    name: bot.name,
    enabled: true,
    cryptoSymbols: JSON.parse(bot.cryptoSymbols),
    stockIndices: JSON.parse(bot.stockIndices),
    goldSymbol: bot.goldSymbol,
    timeframe: bot.timeframe,
    lookbackDays: bot.lookbackDays,
    volatilityLow: bot.volatilityLow,
    volatilityHigh: bot.volatilityHigh,
    trendThreshold: bot.trendThreshold,
    correlationWeight: bot.correlationWeight,
    tradingEnabled: bot.tradingEnabled,
    strategy: bot.strategy as StrategyType,
    riskProfile: bot.riskProfile as 'easy' | 'normal' | 'hard' | 'scalper',
    initialCapital: bot.initialCapital,
    tradingFee: bot.tradingFee,
    telegramEnabled: bot.telegramEnabled,
    telegramChatId: bot.telegramChatId || undefined,
    forecastIntervalMinutes: bot.forecastIntervalMinutes,
    tradingCycleHours: bot.tradingCycleHours,
  };
}
