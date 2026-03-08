import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - List all BB Bots
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    const bots = await db.bBBot.findMany({
      where: userId ? { userId } : undefined,
      include: {
        timeframeConfigs: {
          orderBy: { timeframe: 'asc' }
        },
        account: {
          select: {
            id: true,
            exchangeId: true,
            exchangeName: true,
            accountType: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({
      success: true,
      bots
    });
  } catch (error) {
    console.error('Error fetching BB bots:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch BB bots' },
      { status: 500 }
    );
  }
}

// POST - Create new BB Bot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      userId = 'demo-user',
      accountId,
      name,
      description,
      symbol,
      exchangeId = 'binance',
      marketType = 'FUTURES', // SPOT or FUTURES
      timeframes = ['15m'],
      direction = 'BOTH',
      tradeAmount = 100,
      leverage = 1,
      marginMode = 'ISOLATED',
      stopLoss,
      takeProfit,
      trailingStop,
      timeframeConfigs = [],
      // Manual mode fields
      isManualMode = false,
      manualEntryPrice,
      manualTargets,
      manualStopLoss
    } = body;
    
    // Validate market type and direction
    const validMarketType = marketType.toUpperCase();
    let validDirection = direction.toUpperCase();
    
    // For SPOT, direction is always LONG (buy then sell)
    if (validMarketType === 'SPOT') {
      validDirection = 'LONG';
    }
    
    // Validate timeframes (max 3)
    const validTimeframes = timeframes.slice(0, 3);
    
    // Check for existing running bots with same symbol/direction (FUTURES only)
    if (validMarketType === 'FUTURES') {
      const existingActiveBots = await db.bBBot.findMany({
        where: {
          symbol,
          marketType: 'FUTURES',
          isActive: true
        }
      });
      
      // Check for direction conflicts
      for (const existingBot of existingActiveBots) {
        // If creating BOTH direction bot, conflicts with any active bot
        if (validDirection === 'BOTH') {
          return NextResponse.json(
            { 
              success: false, 
              error: `Cannot create: An active bot for ${symbol} already exists in ${existingBot.direction} direction. Only one bot per direction allowed for futures.` 
            },
            { status: 400 }
          );
        }
        
        // If existing bot is BOTH, conflicts with any direction
        if (existingBot.direction === 'BOTH') {
          return NextResponse.json(
            { 
              success: false, 
              error: `Cannot create: An active bot for ${symbol} in BOTH direction already exists.` 
            },
            { status: 400 }
          );
        }
        
        // If same direction
        if (existingBot.direction === validDirection) {
          return NextResponse.json(
            { 
              success: false, 
              error: `Cannot create: An active bot for ${symbol} ${validDirection} already exists. Only one bot per direction allowed for futures.` 
            },
            { status: 400 }
          );
        }
      }
    }
    
    // Get or create demo account
    let account = accountId ? await db.account.findUnique({ where: { id: accountId } }) : null;
    
    if (!account) {
      // Find or create demo user
      let user = await db.user.findFirst({
        where: { email: 'user@citarion.local' }
      });
      
      if (!user) {
        user = await db.user.create({
          data: {
            email: 'user@citarion.local',
            name: 'User',
            currentMode: 'DEMO'
          }
        });
      }
      
      // Find existing demo account for this exchange
      account = await db.account.findFirst({
        where: { userId: user.id, accountType: 'DEMO', exchangeId }
      });
      
      if (!account) {
        account = await db.account.create({
          data: {
            userId: user.id,
            accountType: 'DEMO',
            exchangeId,
            exchangeName: exchangeId.charAt(0).toUpperCase() + exchangeId.slice(1),
            virtualBalance: JSON.stringify({ USDT: 10000 })
          }
        });
      }
    }
    
    // Create bot with timeframe configs
    const bot = await db.bBBot.create({
      data: {
        userId: account.userId,
        accountId: account.id,
        name,
        description,
        symbol,
        exchangeId,
        marketType: validMarketType,
        timeframes: JSON.stringify(validTimeframes),
        direction: validDirection,
        tradeAmount,
        leverage: validMarketType === 'SPOT' ? 1 : leverage, // No leverage for SPOT
        marginMode: validMarketType === 'SPOT' ? 'CASH' : marginMode,
        stopLoss,
        takeProfit,
        trailingStop,
        isManualMode,
        manualEntryPrice: isManualMode ? manualEntryPrice : null,
        manualTargets: isManualMode && manualTargets ? JSON.stringify(manualTargets) : null,
        manualStopLoss: isManualMode ? manualStopLoss : null,
        timeframeConfigs: {
          create: validTimeframes.map((tf: string) => {
            const customConfig = timeframeConfigs.find((c: { timeframe: string }) => c.timeframe === tf) || {};
            return {
              timeframe: tf,
              // Bollinger Bands
              bbEnabled: customConfig.bbEnabled ?? true,
              bbInnerPeriod: customConfig.bbInnerPeriod ?? 20,
              bbInnerDeviation: customConfig.bbInnerDeviation ?? 1.0,
              bbOuterPeriod: customConfig.bbOuterPeriod ?? 20,
              bbOuterDeviation: customConfig.bbOuterDeviation ?? 2.0,
              bbSource: customConfig.bbSource ?? 'close',
              // Stochastic
              stochEnabled: customConfig.stochEnabled ?? true,
              stochKPeriod: customConfig.stochKPeriod ?? 14,
              stochDPeriod: customConfig.stochDPeriod ?? 3,
              stochSlowing: customConfig.stochSlowing ?? 3,
              stochOverbought: customConfig.stochOverbought ?? 80,
              stochOversold: customConfig.stochOversold ?? 20,
              // Moving Averages
              emaEnabled: customConfig.emaEnabled ?? false,
              emaPeriod: customConfig.emaPeriod ?? 20,
              emaSource: customConfig.emaSource ?? 'close',
              smaEnabled: customConfig.smaEnabled ?? false,
              smaPeriod: customConfig.smaPeriod ?? 50,
              smaSource: customConfig.smaSource ?? 'close',
              smmaEnabled: customConfig.smmaEnabled ?? false,
              smmaPeriod: customConfig.smmaPeriod ?? 20,
              smmaSource: customConfig.smmaSource ?? 'close'
            };
          })
        }
      },
      include: {
        timeframeConfigs: true
      }
    });
    
    return NextResponse.json({
      success: true,
      bot
    });
  } catch (error) {
    console.error('Error creating BB bot:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create BB bot' },
      { status: 500 }
    );
  }
}

// PATCH - Update BB Bot status (start/stop/pause/delete)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId, action } = body;
    
    const bot = await db.bBBot.findUnique({
      where: { id: botId }
    });
    
    if (!bot) {
      return NextResponse.json(
        { success: false, error: 'Bot not found' },
        { status: 404 }
      );
    }
    
    // For start action, check limitations
    if (action === 'start') {
      // For FUTURES: Check if there's already a running bot for this symbol/direction
      if (bot.marketType === 'FUTURES') {
        const checkDirection = bot.direction === 'BOTH' ? 'BOTH' : bot.direction;
        
        // Check for conflicting running bots
        const existingBots = await db.bBBot.findMany({
          where: {
            symbol: bot.symbol,
            marketType: 'FUTURES',
            isActive: true,
            id: { not: botId }
          }
        });
        
        // Check for conflicts
        for (const existingBot of existingBots) {
          // If new bot is BOTH, it conflicts with any existing bot
          if (checkDirection === 'BOTH') {
            return NextResponse.json(
              { 
                success: false, 
                error: `Cannot start: A bot for ${bot.symbol} is already running in ${existingBot.direction} direction. Only one bot per direction allowed.` 
              },
              { status: 400 }
            );
          }
          
          // If existing bot is BOTH, it conflicts with any direction
          if (existingBot.direction === 'BOTH') {
            return NextResponse.json(
              { 
                success: false, 
                error: `Cannot start: A bot for ${bot.symbol} is already running in BOTH direction.` 
              },
              { status: 400 }
            );
          }
          
          // If same direction
          if (existingBot.direction === checkDirection) {
            return NextResponse.json(
              { 
                success: false, 
                error: `Cannot start: A bot for ${bot.symbol} ${checkDirection} is already running. Only one bot per direction allowed for futures.` 
              },
              { status: 400 }
            );
          }
        }
      }
      // For SPOT: No limitations, multiple bots can run on same symbol
      
      const updatedBot = await db.bBBot.update({
        where: { id: botId },
        data: {
          isActive: true,
          status: 'RUNNING',
          startedAt: new Date()
        },
        include: {
          timeframeConfigs: true
        }
      });
      
      return NextResponse.json({
        success: true,
        bot: updatedBot
      });
    }
    
    let updateData: Record<string, unknown> = {};
    
    switch (action) {
      case 'stop':
        updateData = {
          isActive: false,
          status: 'STOPPED',
          stoppedAt: new Date()
        };
        break;
      case 'pause':
        updateData = {
          isActive: false,
          status: 'PAUSED'
        };
        break;
      case 'delete':
        await db.bBBot.delete({ where: { id: botId } });
        return NextResponse.json({
          success: true,
          message: 'Bot deleted'
        });
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
    
    const updatedBot = await db.bBBot.update({
      where: { id: botId },
      data: updateData,
      include: {
        timeframeConfigs: true
      }
    });
    
    return NextResponse.json({
      success: true,
      bot: updatedBot
    });
  } catch (error) {
    console.error('Error updating BB bot:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update BB bot' },
      { status: 500 }
    );
  }
}

// PUT - Update BB Bot configuration
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId, config } = body;
    
    const {
      name,
      description,
      symbol,
      marketType,
      timeframes,
      direction,
      tradeAmount,
      leverage,
      marginMode,
      stopLoss,
      takeProfit,
      trailingStop,
      timeframeConfigs,
      isManualMode,
      manualEntryPrice,
      manualTargets,
      manualStopLoss
    } = config;
    
    // Validate market type and direction
    let validDirection = direction;
    if (marketType === 'SPOT') {
      validDirection = 'LONG';
    }
    
    // Update bot basic info
    const updateData: Record<string, unknown> = {
      name,
      description,
      symbol,
      marketType,
      timeframes: JSON.stringify(timeframes),
      direction: validDirection,
      tradeAmount,
      leverage: marketType === 'SPOT' ? 1 : leverage,
      marginMode: marketType === 'SPOT' ? 'CASH' : marginMode,
      stopLoss,
      takeProfit,
      trailingStop,
      isManualMode,
      manualEntryPrice: isManualMode ? manualEntryPrice : null,
      manualTargets: isManualMode && manualTargets ? JSON.stringify(manualTargets) : null,
      manualStopLoss: isManualMode ? manualStopLoss : null
    };
    
    // Update timeframe configs
    if (timeframeConfigs && Array.isArray(timeframeConfigs)) {
      // Delete existing configs
      await db.bBotTimeframeConfig.deleteMany({
        where: { bbBotId: botId }
      });
      
      // Create new configs
      await db.bBotTimeframeConfig.createMany({
        data: timeframeConfigs.map((tf: Record<string, unknown>) => ({
          bbBotId: botId,
          timeframe: String(tf.timeframe ?? '15m'),
          bbEnabled: Boolean(tf.bbEnabled ?? true),
          bbInnerPeriod: Number(tf.bbInnerPeriod ?? 20),
          bbInnerDeviation: Number(tf.bbInnerDeviation ?? 1.0),
          bbOuterPeriod: Number(tf.bbOuterPeriod ?? 20),
          bbOuterDeviation: Number(tf.bbOuterDeviation ?? 2.0),
          bbSource: String(tf.bbSource ?? 'close'),
          stochEnabled: Boolean(tf.stochEnabled ?? true),
          stochKPeriod: Number(tf.stochKPeriod ?? 14),
          stochDPeriod: Number(tf.stochDPeriod ?? 3),
          stochSlowing: Number(tf.stochSlowing ?? 3),
          stochOverbought: Number(tf.stochOverbought ?? 80),
          stochOversold: Number(tf.stochOversold ?? 20),
          emaEnabled: Boolean(tf.emaEnabled ?? false),
          emaPeriod: Number(tf.emaPeriod ?? 20),
          emaSource: String(tf.emaSource ?? 'close'),
          smaEnabled: Boolean(tf.smaEnabled ?? false),
          smaPeriod: Number(tf.smaPeriod ?? 50),
          smaSource: String(tf.smaSource ?? 'close'),
          smmaEnabled: Boolean(tf.smmaEnabled ?? false),
          smmaPeriod: Number(tf.smmaPeriod ?? 20),
          smmaSource: String(tf.smmaSource ?? 'close')
        }))
      });
    }
    
    const bot = await db.bBBot.update({
      where: { id: botId },
      data: updateData,
      include: {
        timeframeConfigs: true
      }
    });
    
    return NextResponse.json({
      success: true,
      bot
    });
  } catch (error) {
    console.error('Error updating BB bot config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update BB bot config' },
      { status: 500 }
    );
  }
}

// DELETE - Delete BB Bot
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('botId');
    
    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'Bot ID required' },
        { status: 400 }
      );
    }
    
    await db.bBBot.delete({
      where: { id: botId }
    });
    
    return NextResponse.json({
      success: true,
      message: 'Bot deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting BB bot:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete BB bot' },
      { status: 500 }
    );
  }
}
