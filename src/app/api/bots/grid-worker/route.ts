/**
 * Grid Bot Worker API
 * 
 * Управление фоновым worker'ом для Grid ботов:
 * - Запуск/остановка worker
 * - Инициализация Grid ботов
 * - Получение статуса
 */

import { NextRequest, NextResponse } from "next/server";
import {
  startGridWorker,
  stopGridWorker,
  createGridBot,
  stopGridBot,
  getGridBotStats,
  isGridWorkerRunning,
} from "@/lib/grid-bot-worker";
import { db } from "@/lib/db";
import { getDefaultUserId } from "@/lib/default-user";

// Запускаем worker при первом запросе
let workerStarted = false;

export async function GET(request: NextRequest) {
  // Автозапуск worker
  if (!workerStarted) {
    startGridWorker(10000);
    workerStarted = true;
  }
  
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  
  try {
    switch (action) {
      case "status": {
        const isRunning = isGridWorkerRunning();
        const activeBots = await db.gridBot.count({
          where: { isActive: true, status: "ACTIVE" },
        });
        
        return NextResponse.json({
          isRunning,
          activeBots,
          message: isRunning ? "Grid bot worker is running" : "Grid bot worker is stopped",
        });
      }
      
      case "start": {
        startGridWorker(10000);
        return NextResponse.json({
          success: true,
          message: "Grid bot worker started",
        });
      }
      
      case "stop": {
        stopGridWorker();
        return NextResponse.json({
          success: true,
          message: "Grid bot worker stopped",
        });
      }
      
      case "list": {
        const bots = await db.gridBot.findMany({
          where: { isActive: true },
          include: {
            gridOrders: {
              where: { status: { in: ["PENDING", "OPEN"] } },
              select: {
                id: true,
                gridLevel: true,
                price: true,
                side: true,
                status: true,
                amount: true,
              },
            },
            _count: {
              select: { gridOrders: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });
        
        return NextResponse.json({
          bots,
          count: bots.length,
        });
      }
      
      default:
        return NextResponse.json({
          status: "ok",
          actions: ["status", "start", "stop", "list", "init", "stop-bot"],
          usage: {
            status: "GET /api/bots/grid-worker?action=status",
            start: "GET /api/bots/grid-worker?action=start",
            stop: "GET /api/bots/grid-worker?action=stop",
            list: "GET /api/bots/grid-worker?action=list",
            initBot: "POST /api/bots/grid-worker with { action: 'init', botId: '...' }",
            stopBot: "POST /api/bots/grid-worker with { action: 'stop-bot', botId: '...' }",
          },
        });
    }
  } catch (error) {
    console.error("Grid worker API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Автозапуск worker
  if (!workerStarted) {
    startGridWorker(10000);
    workerStarted = true;
  }
  
  try {
    const body = await request.json();
    const { action, botId } = body;
    
    switch (action) {
      case "init": {
        if (!botId) {
          return NextResponse.json({ error: "botId is required" }, { status: 400 });
        }
        
        // Get bot and activate it
        const bot = await db.gridBot.update({
          where: { id: botId },
          data: { status: "ACTIVE", isActive: true },
        });
        
        if (bot) {
          return NextResponse.json({
            success: true,
            message: "Grid bot initialized and started",
            botId,
          });
        } else {
          return NextResponse.json({
            success: false,
            error: "Bot not found",
          }, { status: 400 });
        }
      }
      
      case "stop-bot": {
        if (!botId) {
          return NextResponse.json({ error: "botId is required" }, { status: 400 });
        }
        
        await stopGridBot(botId);
        
        return NextResponse.json({
          success: true,
          message: "Grid bot stopped",
          botId,
        });
      }
      
      case "create": {
        // Создание нового Grid бота
        const {
          name,
          symbol,
          exchangeId = "binance",
          gridType = "ARITHMETIC",
          gridCount = 10,
          upperPrice,
          lowerPrice,
          totalInvestment,
          leverage = 1,
          marginMode = "ISOLATED",
          takeProfit,
          stopLoss,
          triggerPrice,
          triggerType,
        } = body;
        
        if (!name || !symbol || !upperPrice || !lowerPrice || !totalInvestment) {
          return NextResponse.json({
            error: "Missing required fields: name, symbol, upperPrice, lowerPrice, totalInvestment",
          }, { status: 400 });
        }
        
        // Получаем или создаём demo аккаунт
        let account = await db.account.findFirst({
          where: { accountType: "DEMO", exchangeType: "futures" },
        });
        
        const userId = await getDefaultUserId();
        
        if (!account) {
          account = await db.account.create({
            data: {
              userId,
              accountType: "DEMO",
              exchangeId,
              exchangeType: "futures",
              exchangeName: `${exchangeId} Futures`,
              virtualBalance: JSON.stringify({ USDT: 10000 }),
              isActive: true,
            },
          });
        }
        
        const bot = await db.gridBot.create({
          data: {
            userId,
            name,
            symbol: symbol.toUpperCase(),
            exchangeId,
            direction: "LONG",
            gridType,
            gridCount,
            upperPrice,
            lowerPrice,
            totalInvestment,
            leverage,
            marginMode,
            takeProfit,
            stopLoss,
            triggerPrice,
            triggerType,
            status: "STOPPED",
            isActive: false,
            accountId: account.id,
          },
        });
        
        return NextResponse.json({
          success: true,
          bot,
          message: "Grid bot created. Use action=init to start it.",
        });
      }
      
      default:
        return NextResponse.json({
          error: "Unknown action",
          actions: ["init", "stop-bot", "create"],
        }, { status: 400 });
    }
  } catch (error) {
    console.error("Grid worker POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
