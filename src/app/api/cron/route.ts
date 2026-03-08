/**
 * Cron API Endpoint
 * 
 * Запускает фоновые воркеры:
 * - Grid Bot Worker - исполнение грид-ордеров
 * - Position Monitor - проверка TP/SL
 * - Price Updater - обновление цен
 * 
 * Вызов через cron job или внешние сервисы (Vercel Cron, cron-job.org)
 */

import { NextRequest, NextResponse } from "next/server";
import { 
  executeGridOrders, 
  startGridWorker, 
  stopGridWorker, 
  isGridWorkerRunning 
} from "@/lib/grid-bot-worker";
import { 
  startPositionMonitor, 
  stopPositionMonitor 
} from "@/lib/position-monitor";

// Секрет для защиты эндпоинта
const CRON_SECRET = process.env.CRON_SECRET || "development";

/**
 * GET /api/cron - Запустить все воркеры один раз
 * POST /api/cron - Управление воркерами (start/stop/status)
 */
export async function GET(request: NextRequest) {
  // Проверяем авторизацию
  const authHeader = request.headers.get("authorization");
  const providedSecret = authHeader?.replace("Bearer ", "");
  
  // В development режиме разрешаем без секрета
  const isDev = process.env.NODE_ENV === "development";
  
  if (!isDev && providedSecret !== CRON_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const results: {
    gridWorker: { executed: boolean; botsProcessed: number; error?: string };
    positionMonitor: { executed: boolean; error?: string };
  } = {
    gridWorker: { executed: false, botsProcessed: 0 },
    positionMonitor: { executed: false },
  };

  // Запускаем Grid Worker
  try {
    await executeGridOrders();
    results.gridWorker.executed = true;
    
    // Получаем количество активных ботов
    const { db } = await import("@/lib/db");
    const count = await db.gridBot.count({ where: { status: "ACTIVE" } });
    results.gridWorker.botsProcessed = count;
  } catch (error) {
    results.gridWorker.error = error instanceof Error ? error.message : "Unknown error";
  }

  // Position Monitor запускается автоматически при первом вызове
  try {
    startPositionMonitor();
    results.positionMonitor.executed = true;
  } catch (error) {
    results.positionMonitor.error = error instanceof Error ? error.message : "Unknown error";
  }

  const duration = Date.now() - startTime;

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    results,
    workers: {
      gridWorker: isGridWorkerRunning() ? "running" : "stopped",
      positionMonitor: "active",
    },
  });
}

/**
 * POST /api/cron - Управление воркерами
 * 
 * Body:
 * - action: "start" | "stop" | "status"
 * - workers: ["grid", "position"] (optional)
 */
export async function POST(request: NextRequest) {
  // Проверяем авторизацию
  const authHeader = request.headers.get("authorization");
  const providedSecret = authHeader?.replace("Bearer ", "");
  
  const isDev = process.env.NODE_ENV === "development";
  
  if (!isDev && providedSecret !== CRON_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { action, workers } = body;
    const targetWorkers = workers || ["grid", "position"];

    const results: Record<string, { action: string; success: boolean; message?: string }> = {};

    // Grid Worker
    if (targetWorkers.includes("grid")) {
      switch (action) {
        case "start":
          startGridWorker(10000);
          results.grid = { action: "start", success: true, message: "Grid worker started" };
          break;
        case "stop":
          stopGridWorker();
          results.grid = { action: "stop", success: true, message: "Grid worker stopped" };
          break;
        case "status":
          results.grid = { 
            action: "status", 
            success: true, 
            message: isGridWorkerRunning() ? "running" : "stopped" 
          };
          break;
        default:
          results.grid = { action: "unknown", success: false, message: "Unknown action" };
      }
    }

    // Position Monitor
    if (targetWorkers.includes("position")) {
      switch (action) {
        case "start":
          startPositionMonitor(5000);
          results.position = { action: "start", success: true, message: "Position monitor started" };
          break;
        case "stop":
          stopPositionMonitor();
          results.position = { action: "stop", success: true, message: "Position monitor stopped" };
          break;
        case "status":
          results.position = { 
            action: "status", 
            success: true, 
            message: "active" 
          };
          break;
        default:
          results.position = { action: "unknown", success: false, message: "Unknown action" };
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      action,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 400 }
    );
  }
}
