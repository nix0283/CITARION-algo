/**
 * Grid Bot Worker
 * 
 * Фоновый процесс для исполнения грид-ордеров:
 * - Мониторинг цен
 * - Размещение реальных ордеров на бирже через Exchange Clients
 * - Автоматическое исполнение при достижении цены
 * - Интеграция с Position Monitor и Notifications
 * 
 * IMPORTANT: Uses real exchange orders when connected to an account!
 * 
 * Distributed Lock Integration:
 * - Each bot is locked during processing to prevent race conditions
 * - Lock TTL: 30 seconds (configurable)
 * - Auto-retry with exponential backoff for lock acquisition
 * 
 * Per-Symbol Mutex:
 * - Prevents concurrent order execution for the same symbol
 * - Uses Promise-based mutex for serialization
 * - Ensures order state validation before execution
 */

import { db } from "@/lib/db";
import {
  notifyTelegram,
  notifyUI,
} from "@/lib/notification-service";
import { getCurrentPrice } from "@/lib/position-monitor";
import { getDefaultUserId } from "@/lib/default-user";
import { BinanceClient } from "@/lib/exchange/binance-client";
import { BybitClient } from "@/lib/exchange/bybit-client";
import { OKXClient } from "@/lib/exchange/okx-client";
import {
  acquireBotLock,
  releaseBotLock,
  extendBotLock,
  withBotLock,
  isBotLocked,
  initializeLockProvider,
  BotLockOptions,
} from "@/lib/locks";

// ==================== TYPES ====================

/**
 * Lock configuration for grid bot worker
 */
const GRID_BOT_LOCK_OPTIONS: BotLockOptions = {
  ttl: 30000, // 30 seconds
  maxRetries: 3,
};

// ==================== PER-SYMBOL MUTEX ====================

/**
 * Simple Promise-based mutex for serializing order execution per symbol
 * Prevents race conditions when multiple grid levels trigger simultaneously
 */
class SymbolMutex {
  private locks: Map<string, Promise<void>> = new Map();
  private queue: Map<string, Array<() => void>> = new Map();
  
  /**
   * Acquire lock for a symbol
   * Returns a release function that must be called when done
   */
  async acquire(symbol: string): Promise<() => void> {
    const key = symbol.toUpperCase();
    
    // If there's an existing lock, wait for it
    if (this.locks.has(key)) {
      return new Promise<() => void>((resolve) => {
        const queue = this.queue.get(key) || [];
        queue.push(() => resolve(this.createReleaseFn(key)));
        this.queue.set(key, queue);
      });
    }
    
    // Create new lock
    this.locks.set(key, new Promise(() => {}));
    return this.createReleaseFn(key);
  }
  
  /**
   * Create release function for a symbol lock
   */
  private createReleaseFn(key: string): () => void {
    return () => {
      const queue = this.queue.get(key);
      
      if (queue && queue.length > 0) {
        // Pass lock to next in queue
        const next = queue.shift()!;
        next();
        
        if (queue.length === 0) {
          this.queue.delete(key);
        }
      } else {
        // No one waiting, release the lock
        this.locks.delete(key);
        this.queue.delete(key);
      }
    };
  }
  
  /**
   * Check if a symbol is currently locked
   */
  isLocked(symbol: string): boolean {
    return this.locks.has(symbol.toUpperCase());
  }
  
  /**
   * Get number of symbols currently locked
   */
  getLockedCount(): number {
    return this.locks.size;
  }
}

// Global symbol mutex instance
const symbolMutex = new SymbolMutex();

export interface GridLevel {
  price: number;
  side: "BUY" | "SELL";
  status: "PENDING" | "FILLED" | "CANCELLED" | "FAILED";
  orderId?: string;
  filledAt?: Date;
  filledPrice?: number;
  filledQuantity?: number;
  error?: string;
}

export interface GridBot {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  totalInvestment: number;
  leverage: number;
  levels: GridLevel[];
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  profitTarget?: number;
  stopLoss?: number;
  createdAt: Date;
  realizedPnl: number;
}

// ==================== EXCHANGE CLIENT FACTORY ====================

type ExchangeClient = BinanceClient | BybitClient | OKXClient;

/**
 * Get exchange client for an account
 */
async function getExchangeClientForAccount(accountId: string): Promise<ExchangeClient | null> {
  const account = await db.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    console.error(`[GridWorker] Account ${accountId} not found`);
    return null;
  }

  const credentials = {
    apiKey: account.apiKey || "",
    apiSecret: account.apiSecret || "",
    passphrase: account.apiPassphrase || undefined,
  };

  // Check if credentials are encrypted and decrypt if needed
  // For now, assume they're stored as-is (single user mode)

  const exchangeId = account.exchangeId as "binance" | "bybit" | "okx";
  const isTestnet = account.isTestnet;

  try {
    switch (exchangeId) {
      case "binance":
        return new BinanceClient(credentials, "futures", isTestnet);
      case "bybit":
        return new BybitClient(credentials, "futures", isTestnet);
      case "okx":
        return new OKXClient(credentials, "futures", isTestnet);
      default:
        console.error(`[GridWorker] Unsupported exchange: ${exchangeId}`);
        return null;
    }
  } catch (error) {
    console.error(`[GridWorker] Failed to create client for ${exchangeId}:`, error);
    return null;
  }
}

// ==================== GRID CALCULATIONS ====================

/**
 * Рассчитать уровни сетки
 */
export function calculateGridLevels(
  lowerPrice: number,
  upperPrice: number,
  gridCount: number,
  direction: "LONG" | "SHORT"
): GridLevel[] {
  const levels: GridLevel[] = [];
  const step = (upperPrice - lowerPrice) / (gridCount - 1);

  for (let i = 0; i < gridCount; i++) {
    const price = lowerPrice + step * i;
    
    // Для LONG: покупаем на нижних уровнях, продаём на верхних
    // Для SHORT: продаём на верхних уровнях, покупаем на нижних
    const isBuyLevel = direction === "LONG" ? i < gridCount / 2 : i >= gridCount / 2;
    
    levels.push({
      price: parseFloat(price.toFixed(8)),
      side: isBuyLevel ? "BUY" : "SELL",
      status: "PENDING",
    });
  }

  return levels;
}

/**
 * Рассчитать размер позиции на уровень
 */
export function calculatePositionSizePerLevel(
  totalInvestment: number,
  gridCount: number,
  leverage: number,
  price: number
): number {
  const investmentPerLevel = totalInvestment / gridCount;
  return (investmentPerLevel * leverage) / price;
}

/**
 * Format quantity according to exchange precision
 */
function formatQuantity(quantity: number, symbol: string): number {
  // Common precision rules - most exchanges use 3 decimal places for crypto
  // In production, fetch from exchange info
  const precision = symbol.includes("USDT") ? 3 : 8;
  const multiplier = Math.pow(10, precision);
  return Math.floor(quantity * multiplier) / multiplier;
}

// ==================== GRID BOT EXECUTION ====================

/**
 * Проверить и исполнить грид-ордера
 * Uses distributed locks to prevent race conditions across multiple workers
 */
export async function executeGridOrders(): Promise<void> {
  try {
    // Ensure lock provider is initialized
    await initializeLockProvider();
    
    // Получаем все активные грид-боты
    const activeGridBots = await db.gridBot.findMany({
      where: { status: "ACTIVE" },
    });

    if (activeGridBots.length === 0) {
      return;
    }

    console.log(`[GridWorker] Checking ${activeGridBots.length} active grid bots`);

    // Process bots with distributed locks
    const processingPromises = activeGridBots.map(async (bot) => {
      // Try to acquire lock for this bot
      const lockResult = await acquireBotLock('grid', bot.id, GRID_BOT_LOCK_OPTIONS);
      
      if (!lockResult.acquired) {
        console.log(`[GridWorker] Bot ${bot.id} is already being processed by another worker`);
        return { botId: bot.id, processed: false, reason: 'locked' };
      }
      
      try {
        await processGridBot(bot);
        return { botId: bot.id, processed: true };
      } catch (error) {
        console.error(`[GridWorker] Error processing bot ${bot.id}:`, error);
        return { botId: bot.id, processed: false, error: String(error) };
      } finally {
        // Always release the lock
        await releaseBotLock('grid', bot.id, lockResult.holder!);
        console.log(`[GridWorker] Released lock for bot ${bot.id}`);
      }
    });
    
    // Wait for all processing to complete
    const results = await Promise.allSettled(processingPromises);
    
    // Log summary
    const processed = results.filter(r => r.status === 'fulfilled' && (r.value as any).processed).length;
    const skipped = results.filter(r => r.status === 'fulfilled' && !(r.value as any).processed).length;
    console.log(`[GridWorker] Processed: ${processed}, Skipped: ${skipped}`);
    
  } catch (error) {
    console.error("[GridWorker] Error in executeGridOrders:", error);
  }
}

/**
 * Обработать один грид-бот
 * This function should only be called after acquiring a lock
 */
async function processGridBot(bot: {
  id: string;
  symbol: string;
  direction: string;
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  totalInvestment: number;
  leverage: number;
  levels?: string | null;
  status: string;
  takeProfit?: number | null;
  stopLoss?: number | null;
  realizedPnL: number;
  accountId?: string | null;
}): Promise<void> {
  const currentPrice = await getCurrentPrice(bot.symbol);
  
  // Парсим уровни сетки
  const levels: GridLevel[] = bot.levels ? JSON.parse(bot.levels) : 
    calculateGridLevels(bot.lowerPrice, bot.upperPrice, bot.gridCount, bot.direction as "LONG" | "SHORT");

  let updated = false;
  const executedLevels: GridLevel[] = [];

  // Get exchange client if account is connected
  let exchangeClient: ExchangeClient | null = null;
  let isDemoMode = true;

  if (bot.accountId) {
    exchangeClient = await getExchangeClientForAccount(bot.accountId);
    if (exchangeClient) {
      isDemoMode = false;
      console.log(`[GridWorker] Bot ${bot.id} using LIVE trading on connected account`);
    }
  }

  // Проверяем каждый уровень
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    
    if (level.status !== "PENDING") continue;

    const shouldExecute = bot.direction === "LONG"
      ? (level.side === "BUY" && currentPrice <= level.price) ||
        (level.side === "SELL" && currentPrice >= level.price)
      : (level.side === "SELL" && currentPrice >= level.price) ||
        (level.side === "BUY" && currentPrice <= level.price);

    if (shouldExecute) {
      // Рассчитываем количество
      const rawQuantity = calculatePositionSizePerLevel(
        bot.totalInvestment,
        bot.gridCount,
        bot.leverage,
        level.price
      );
      const quantity = formatQuantity(rawQuantity, bot.symbol);

      if (exchangeClient && !isDemoMode) {
        // === REAL EXCHANGE ORDER WITH PER-SYMBOL MUTEX ===
        // Acquire mutex for this symbol to prevent concurrent order execution
        const releaseMutex = await symbolMutex.acquire(bot.symbol);
        
        try {
          // Validate order state before execution
          const currentLevelState = levels[i];
          if (currentLevelState.status !== "PENDING") {
            console.log(`[GridWorker] Level ${i} status changed to ${currentLevelState.status}, skipping`);
            continue;
          }
          
          console.log(`[GridWorker] Placing ${level.side} order for ${bot.symbol}: ${quantity} @ ${level.price}`);
          
          const result = await exchangeClient.createOrder({
            symbol: bot.symbol,
            side: level.side.toLowerCase() as "buy" | "sell",
            type: "limit",
            quantity,
            price: level.price,
            timeInForce: "GTC",
          });

          if (result.success && result.order) {
            levels[i] = {
              ...level,
              status: "FILLED",
              orderId: result.order.id,
              filledAt: new Date(),
              filledPrice: result.order.averagePrice || level.price,
              filledQuantity: result.order.filledQuantity || quantity,
            };
            executedLevels.push(levels[i]);
            updated = true;
            console.log(`[GridWorker] Order placed successfully: ${result.order.id}`);
          } else {
            // Order failed
            levels[i] = {
              ...level,
              status: "FAILED",
              error: result.error || "Unknown error",
            };
            updated = true;
            console.error(`[GridWorker] Order failed: ${result.error}`);
            
            await notifyTelegram({
              type: "ORDER_REJECTED",
              title: "❌ Grid Order Failed",
              message: `${bot.symbol} ${level.side} @ $${level.price}\nError: ${result.error}`,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          levels[i] = {
            ...level,
            status: "FAILED",
            error: errorMessage,
          };
          updated = true;
          console.error(`[GridWorker] Exception placing order:`, error);
        } finally {
          // Always release the mutex
          releaseMutex();
        }
      } else {
        // === DEMO/SIMULATION MODE ===
        levels[i] = {
          ...level,
          status: "FILLED",
          orderId: `demo-grid-${bot.id}-${i}-${Date.now()}`,
          filledAt: new Date(),
          filledPrice: level.price,
          filledQuantity: quantity,
        };
        executedLevels.push(levels[i]);
        updated = true;
      }

      // Создаём трейд запись в БД
      if (bot.accountId && (levels[i].status === "FILLED")) {
        try {
          const userId = await getDefaultUserId();
          await db.trade.create({
            data: {
              userId,
              accountId: bot.accountId,
              symbol: bot.symbol,
              direction: levels[i].side === "BUY" ? "LONG" : "SHORT",
              status: "OPEN",
              entryPrice: levels[i].filledPrice || level.price,
              entryTime: new Date(),
              amount: levels[i].filledQuantity || quantity,
              leverage: bot.leverage,
              signalSource: "GRID_BOT",
              isDemo: isDemoMode,
            },
          });
        } catch (error) {
          console.error(`[GridWorker] Failed to create trade record:`, error);
        }
      }
    }
  }

  // Проверяем Stop Loss
  if (bot.stopLoss && currentPrice <= bot.stopLoss) {
    console.log(`[GridWorker] Stop loss triggered for bot ${bot.id}`);
    
    // Cancel all pending orders on exchange
    if (exchangeClient && !isDemoMode) {
      for (const level of levels) {
        if (level.status === "PENDING" && level.orderId) {
          try {
            await exchangeClient.cancelOrder({
              symbol: bot.symbol,
              orderId: level.orderId,
            });
          } catch (error) {
            console.error(`[GridWorker] Failed to cancel order ${level.orderId}:`, error);
          }
        }
      }
    }

    // Mark all pending as cancelled
    for (let i = 0; i < levels.length; i++) {
      if (levels[i].status === "PENDING") {
        levels[i].status = "CANCELLED";
        updated = true;
      }
    }

    await db.gridBot.update({
      where: { id: bot.id },
      data: {
        status: "STOPPED",
        levels: JSON.stringify(levels),
      },
    });

    await notifyTelegram({
      type: "SL_HIT",
      title: "🛑 Grid Bot Stopped - Stop Loss",
      message: `${bot.symbol} ${bot.direction}\nSL: $${bot.stopLoss}\nPrice: $${currentPrice.toFixed(2)}`,
    });

    return;
  }

  // Проверяем Profit Target
  if (bot.takeProfit && bot.realizedPnL >= bot.takeProfit) {
    console.log(`[GridWorker] Take profit reached for bot ${bot.id}`);
    
    await db.gridBot.update({
      where: { id: bot.id },
      data: { status: "STOPPED" },
    });

    await notifyTelegram({
      type: "TP_HIT",
      title: "🎯 Grid Bot - Profit Target Reached",
      message: `${bot.symbol} ${bot.direction}\nRealized PnL: $${bot.realizedPnL.toFixed(2)}`,
    });

    return;
  }

  // Сохраняем обновлённые уровни
  if (updated) {
    await db.gridBot.update({
      where: { id: bot.id },
      data: { levels: JSON.stringify(levels) },
    });

    // Отправляем уведомления об исполненных уровнях
    if (executedLevels.length > 0) {
      const filledCount = levels.filter(l => l.status === "FILLED").length;
      const failedCount = levels.filter(l => l.status === "FAILED").length;
      
      let message = `${bot.symbol} - ${executedLevels.length} level(s) filled\nTotal: ${filledCount}/${bot.gridCount}`;
      if (failedCount > 0) {
        message += `\nFailed: ${failedCount}`;
      }
      message += `\nMode: ${isDemoMode ? "DEMO" : "LIVE"}`;

      await notifyUI({
        type: "ORDER_FILLED",
        title: `📊 Grid Level Executed`,
        message,
        data: { botId: bot.id, executedLevels },
      });
    }
  }
}

// ==================== GRID BOT MANAGEMENT ====================

/**
 * Создать новый грид-бот
 * Acquires a lock during creation to prevent duplicate bots
 */
export async function createGridBot(params: {
  symbol: string;
  direction: "LONG" | "SHORT";
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  totalInvestment: number;
  leverage: number;
  takeProfit?: number;
  stopLoss?: number;
  accountId?: string;
}): Promise<{ success: boolean; botId?: string; error?: string }> {
  try {
    // Валидация
    if (params.lowerPrice >= params.upperPrice) {
      return { success: false, error: "Lower price must be less than upper price" };
    }

    if (params.gridCount < 2 || params.gridCount > 100) {
      return { success: false, error: "Grid count must be between 2 and 100" };
    }

    // Рассчитываем уровни
    const levels = calculateGridLevels(
      params.lowerPrice,
      params.upperPrice,
      params.gridCount,
      params.direction
    );

    // Получаем userId
    const userId = await getDefaultUserId();

    // Проверяем подключение к бирже если указан accountId
    let isLiveMode = false;
    if (params.accountId) {
      const client = await getExchangeClientForAccount(params.accountId);
      if (client) {
        const testResult = await client.testConnection();
        if (testResult.success) {
          isLiveMode = true;
          console.log(`[GridWorker] Account ${params.accountId} connected, bot will use LIVE trading`);
        } else {
          console.warn(`[GridWorker] Account ${params.accountId} connection test failed: ${testResult.message}`);
        }
      }
    }

    // Создаём бота в БД
    const bot = await db.gridBot.create({
      data: {
        userId,
        name: `Grid ${params.symbol} ${params.direction}`,
        symbol: params.symbol.toUpperCase(),
        direction: params.direction,
        lowerPrice: params.lowerPrice,
        upperPrice: params.upperPrice,
        gridCount: params.gridCount,
        totalInvestment: params.totalInvestment,
        leverage: params.leverage,
        levels: JSON.stringify(levels),
        status: "ACTIVE",
        takeProfit: params.takeProfit,
        stopLoss: params.stopLoss,
        realizedPnL: 0,
        accountId: params.accountId || "",
      },
    });
    
    // Initialize a lock for the new bot to mark it as active
    const lockResult = await acquireBotLock('grid', bot.id, { ttl: 5000, maxRetries: 1 });
    if (lockResult.acquired) {
      await releaseBotLock('grid', bot.id, lockResult.holder!);
    }

    // Уведомление
    await notifyTelegram({
      type: "POSITION_OPENED",
      title: "📊 Grid Bot Created",
      message: `${params.symbol} ${params.direction}\nRange: $${params.lowerPrice} - $${params.upperPrice}\nLevels: ${params.gridCount}\nInvestment: $${params.totalInvestment}\nMode: ${isLiveMode ? "🔴 LIVE" : "🟡 DEMO"}`,
    });

    return { success: true, botId: bot.id };
  } catch (error) {
    console.error("Create grid bot error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Остановить грид-бота и отменить все ордера
 * Uses lock to ensure clean shutdown without race conditions
 */
export async function stopGridBot(botId: string): Promise<{ success: boolean; error?: string }> {
  // Acquire lock first to ensure no other worker is processing this bot
  const lockResult = await acquireBotLock('grid', botId, { ttl: 10000, maxRetries: 5 });
  
  if (!lockResult.acquired) {
    // Another worker has the bot locked - wait and try to signal it to stop
    console.log(`[GridWorker] Bot ${botId} is locked, waiting for release...`);
    // Wait a bit for the other worker to finish
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  try {
    const bot = await db.gridBot.findUnique({
      where: { id: botId },
    });

    if (!bot) {
      return { success: false, error: "Bot not found" };
    }

    // Cancel all pending orders on exchange
    if (bot.accountId) {
      const exchangeClient = await getExchangeClientForAccount(bot.accountId);
      if (exchangeClient) {
        const levels: GridLevel[] = bot.levels ? JSON.parse(bot.levels) : [];
        for (const level of levels) {
          if (level.status === "PENDING" && level.orderId) {
            try {
              await exchangeClient.cancelOrder({
                symbol: bot.symbol,
                orderId: level.orderId,
              });
              console.log(`[GridWorker] Cancelled order ${level.orderId}`);
            } catch (error) {
              console.error(`[GridWorker] Failed to cancel order ${level.orderId}:`, error);
            }
          }
        }
      }
    }

    await db.gridBot.update({
      where: { id: botId },
      data: { status: "STOPPED" },
    });

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  } finally {
    // Release lock if we acquired it
    if (lockResult.acquired) {
      await releaseBotLock('grid', botId, lockResult.holder!);
    }
  }
}

/**
 * Поставить грид-бота на паузу
 * Uses lock to prevent race conditions
 */
export async function pauseGridBot(botId: string): Promise<{ success: boolean }> {
  const lockResult = await acquireBotLock('grid', botId, { ttl: 5000, maxRetries: 3 });
  
  try {
    await db.gridBot.update({
      where: { id: botId },
      data: { status: "PAUSED" },
    });

    return { success: true };
  } catch {
    return { success: false };
  } finally {
    if (lockResult.acquired) {
      await releaseBotLock('grid', botId, lockResult.holder!);
    }
  }
}

/**
 * Возобновить работу грид-бота
 * Uses lock to prevent race conditions
 */
export async function resumeGridBot(botId: string): Promise<{ success: boolean }> {
  const lockResult = await acquireBotLock('grid', botId, { ttl: 5000, maxRetries: 3 });
  
  try {
    await db.gridBot.update({
      where: { id: botId },
      data: { status: "ACTIVE" },
    });

    return { success: true };
  } catch {
    return { success: false };
  } finally {
    if (lockResult.acquired) {
      await releaseBotLock('grid', botId, lockResult.holder!);
    }
  }
}

/**
 * Получить статистику грид-бота
 */
export async function getGridBotStats(botId: string): Promise<{
  filledLevels: number;
  pendingLevels: number;
  failedLevels: number;
  totalPnl: number;
  avgEntryPrice: number;
  isLive: boolean;
} | null> {
  try {
    const bot = await db.gridBot.findUnique({
      where: { id: botId },
    });

    if (!bot) return null;

    const levels: GridLevel[] = bot.levels ? JSON.parse(bot.levels) : [];
    const filledLevels = levels.filter(l => l.status === "FILLED");
    const pendingLevels = levels.filter(l => l.status === "PENDING");
    const failedLevels = levels.filter(l => l.status === "FAILED");

    const avgEntryPrice = filledLevels.length > 0
      ? filledLevels.reduce((sum, l) => sum + (l.filledPrice || l.price), 0) / filledLevels.length
      : 0;

    // Check if connected to exchange
    let isLive = false;
    if (bot.accountId) {
      const client = await getExchangeClientForAccount(bot.accountId);
      isLive = client !== null;
    }

    return {
      filledLevels: filledLevels.length,
      pendingLevels: pendingLevels.length,
      failedLevels: failedLevels.length,
      totalPnl: bot.realizedPnL,
      avgEntryPrice,
      isLive,
    };
  } catch {
    return null;
  }
}

// ==================== WORKER INTERVAL ====================

let gridWorkerInterval: NodeJS.Timeout | null = null;

/**
 * Запустить грид-воркера
 */
export async function startGridWorker(intervalMs: number = 10000): Promise<void> {
  if (gridWorkerInterval) {
    console.log("[GridWorker] Already running");
    return;
  }

  console.log("[GridWorker] Starting grid bot worker...");
  
  // Initialize lock provider before starting
  await initializeLockProvider();

  gridWorkerInterval = setInterval(async () => {
    try {
      await executeGridOrders();
    } catch (error) {
      console.error("[GridWorker] Error:", error);
    }
  }, intervalMs);

  // Первый запуск сразу
  executeGridOrders().catch(console.error);
}

/**
 * Остановить грид-воркера
 */
export function stopGridWorker(): void {
  if (gridWorkerInterval) {
    clearInterval(gridWorkerInterval);
    gridWorkerInterval = null;
    console.log("[GridWorker] Stopped");
  }
}

/**
 * Проверить, запущен ли воркер
 */
export function isGridWorkerRunning(): boolean {
  return gridWorkerInterval !== null;
}
