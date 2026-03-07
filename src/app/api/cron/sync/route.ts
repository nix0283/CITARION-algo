/**
 * Cron Sync Endpoint
 * 
 * Периодическая синхронизация позиций с биржей:
 * - Обнаружение новых внешних позиций
 * - Обновление статусов существующих позиций
 * - Проверка закрытых позиций
 * 
 * Вызывается через Vercel Cron или внешний cron сервис
 */

import { NextRequest, NextResponse } from "next/server";
import { syncAllAccounts } from "@/lib/position-sync-service";
import { monitorExternalPositions } from "@/lib/position-monitor";

// GET - Проверка статуса (для health check)
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "ok",
    service: "position-sync",
    timestamp: new Date().toISOString(),
  });
}

// POST - Запуск синхронизации (для Vercel Cron)
export async function POST(request: NextRequest) {
  try {
    // Проверяем авторизацию (если настроена)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("[CronSync] Starting scheduled position sync...");

    // Запускаем синхронизацию всех аккаунтов
    const syncResults = await syncAllAccounts();
    
    // Aggregate results
    let totalNewPositions = 0;
    let totalClosedPositions = 0;
    let totalUpdatedPositions = 0;
    const allErrors: string[] = [];
    
    for (const [accountId, result] of Object.entries(syncResults)) {
      totalNewPositions += result.newPositions.length;
      totalClosedPositions += result.closedPositions.length;
      totalUpdatedPositions += result.updatedPositions.length;
      allErrors.push(...result.errors);
    }

    // Запускаем мониторинг внешних позиций
    const monitorResult = await monitorExternalPositions();

    const result = {
      success: allErrors.length === 0 && monitorResult.errors.length === 0,
      sync: {
        accountsChecked: Object.keys(syncResults).length,
        newPositions: totalNewPositions,
        closedPositions: totalClosedPositions,
        updatedPositions: totalUpdatedPositions,
        errors: allErrors,
      },
      monitor: {
        checked: monitorResult.checked,
        updated: monitorResult.updated,
        closed: monitorResult.closed,
        errors: monitorResult.errors,
      },
      timestamp: new Date().toISOString(),
    };

    console.log("[CronSync] Result:", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CronSync] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
