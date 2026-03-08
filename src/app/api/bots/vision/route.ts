/**
 * Vision Bot API - Enhanced with Real Data and ML Integration
 * 
 * Provides:
 * - GET: Get bot status and forecasts
 * - POST: Create/run bot
 * - PUT: Update configuration
 * - DELETE: Stop and remove bot
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnhancedVisionManager } from '@/lib/vision-bot/vision-ml-integration';
import { getMLServiceClient } from '@/lib/vision-bot/ml-service-client';
import { getRealDataProvider } from '@/lib/vision-bot/real-data-provider';
import { DEFAULT_VISION_CONFIG, type VisionBotConfig } from '@/lib/vision-bot/types';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// GET - Status and Forecast
// =====================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'status';
  const botId = searchParams.get('botId');
  
  const manager = getEnhancedVisionManager();
  
  try {
    switch (action) {
      case 'status': {
        // Get all bot statuses
        const statuses = manager.getAllStatuses();
        
        return NextResponse.json({
          success: true,
          bots: statuses,
          mlService: await getMLServiceClient().healthCheck(),
        });
      }
      
      case 'forecast': {
        // Run a forecast for a symbol
        const symbol = searchParams.get('symbol') || 'BTCUSDT';
        const timeframe = searchParams.get('timeframe') || '1h';
        const lookbackDays = parseInt(searchParams.get('lookbackDays') || '30');
        
        const provider = getRealDataProvider();
        const mlClient = getMLServiceClient();
        
        // Fetch real data
        const marketData = await provider.fetchMarketData(symbol, timeframe, lookbackDays);
        
        // Get ML status
        const mlHealth = await mlClient.healthCheck();
        
        return NextResponse.json({
          success: true,
          symbol,
          dataPoints: marketData.data.length,
          exchange: marketData.exchange,
          timestamp: marketData.timestamp,
          cached: marketData.cached,
          mlService: mlHealth,
          latestPrice: marketData.data[marketData.data.length - 1]?.close || 0,
        });
      }
      
      case 'ml-status': {
        // Check ML Service health
        const mlClient = getMLServiceClient();
        const health = await mlClient.healthCheck();
        const models = await mlClient.getModels();
        
        return NextResponse.json({
          success: true,
          health,
          models: models.models,
        });
      }
      
      case 'training-stats': {
        // Get training data statistics
        const feedbackService = manager.getFeedbackService();
        const symbol = searchParams.get('symbol') || undefined;
        const stats = await feedbackService.getStats(symbol);
        
        return NextResponse.json({
          success: true,
          stats,
        });
      }
      
      case 'bot': {
        // Get specific bot status
        if (!botId) {
          return NextResponse.json(
            { success: false, error: 'botId required' },
            { status: 400 }
          );
        }
        
        const bot = manager.getBot(botId);
        if (!bot) {
          return NextResponse.json(
            { success: false, error: 'Bot not found' },
            { status: 404 }
          );
        }
        
        return NextResponse.json({
          success: true,
          status: bot.getStatus(),
          mlStatus: bot.getMLStatus(),
        });
      }
      
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Vision API] GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// =====================================================
// POST - Create and Start Bot
// =====================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config, mlConfig } = body;
    
    const manager = getEnhancedVisionManager();
    
    switch (action) {
      case 'create': {
        // Create new bot
        const botId = config?.id || uuidv4();
        
        const botConfig: VisionBotConfig = {
          ...DEFAULT_VISION_CONFIG,
          ...config,
          id: botId,
          name: config?.name || `Vision-${botId.slice(0, 8)}`,
        } as VisionBotConfig;
        
        const bot = await manager.createBot(botConfig, mlConfig);
        
        return NextResponse.json({
          success: true,
          botId,
          message: 'Bot created successfully',
          status: bot.getStatus(),
        });
      }
      
      case 'start': {
        // Start existing bot
        const botId = body.botId;
        if (!botId) {
          return NextResponse.json(
            { success: false, error: 'botId required' },
            { status: 400 }
          );
        }
        
        await manager.startBot(botId);
        
        return NextResponse.json({
          success: true,
          botId,
          message: 'Bot started',
        });
      }
      
      case 'forecast': {
        // Run single forecast without creating bot
        const symbol = body.symbol || 'BTCUSDT';
        const timeframe = body.timeframe || '1h';
        const lookbackDays = body.lookbackDays || 30;
        
        const provider = getRealDataProvider();
        
        // Create temporary bot for forecast
        const tempId = `temp-${Date.now()}`;
        const tempConfig: VisionBotConfig = {
          ...DEFAULT_VISION_CONFIG,
          id: tempId,
          name: 'Temp Forecast',
          cryptoSymbols: [symbol],
          timeframe: timeframe as '1h' | '4h' | '1d',
          lookbackDays,
        } as VisionBotConfig;
        
        const bot = await manager.createBot(tempConfig, { useRealData: true });
        const forecast = await bot.runForecast();
        manager.removeBot(tempId);
        
        return NextResponse.json({
          success: true,
          forecast,
        });
      }
      
      case 'train': {
        // Trigger ML model training
        const mlClient = getMLServiceClient();
        const symbol = body.symbol;
        
        // Export training data
        const feedbackService = manager.getFeedbackService();
        const { X, y } = await feedbackService.exportTrainingData(symbol);
        
        if (X.length < 10) {
          return NextResponse.json({
            success: false,
            error: 'Insufficient training data (need at least 10 samples)',
            dataCount: X.length,
          });
        }
        
        // Train model
        const result = await mlClient.trainModel({
          model_type: 'signal_classifier',
          X,
          y,
          epochs: body.epochs || 100,
          batch_size: body.batchSize || 32,
        });
        
        return NextResponse.json({
          success: true,
          result,
          samplesTrained: X.length,
        });
      }
      
      case 'update-outcomes': {
        // Update training data with actual outcomes
        const symbol = body.symbol;
        const feedbackService = manager.getFeedbackService();
        const updated = await feedbackService.updateOutcomes(symbol);
        
        return NextResponse.json({
          success: true,
          updated,
        });
      }
      
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Vision API] POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// =====================================================
// PUT - Update Configuration
// =====================================================

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId, config } = body;
    
    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'botId required' },
        { status: 400 }
      );
    }
    
    const manager = getEnhancedVisionManager();
    const bot = manager.getBot(botId);
    
    if (!bot) {
      return NextResponse.json(
        { success: false, error: 'Bot not found' },
        { status: 404 }
      );
    }
    
    bot.updateConfig(config);
    
    return NextResponse.json({
      success: true,
      botId,
      message: 'Configuration updated',
      status: bot.getStatus(),
    });
  } catch (error) {
    console.error('[Vision API] PUT error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// =====================================================
// DELETE - Stop and Remove Bot
// =====================================================

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const botId = searchParams.get('botId');
  
  if (!botId) {
    return NextResponse.json(
      { success: false, error: 'botId required' },
      { status: 400 }
    );
  }
  
  try {
    const manager = getEnhancedVisionManager();
    manager.removeBot(botId);
    
    return NextResponse.json({
      success: true,
      botId,
      message: 'Bot stopped and removed',
    });
  } catch (error) {
    console.error('[Vision API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
