/**
 * Bot Workers - Background processing for trading bots
 * 
 * Grid Bot Worker:
 * - Monitors price and executes grid orders
 * - Places buy orders at lower grid levels
 * - Places sell orders at upper grid levels
 * - Tracks filled orders and updates positions
 * 
 * DCA Bot Worker:
 * - Monitors price for DCA entry triggers
 * - Executes DCA levels when price drops
 * - Manages take profit targets
 * 
 * Distributed Lock Integration:
 * - All bot processing is protected by distributed locks
 * - Prevents race conditions across multiple workers/processes
 * - Lock TTL: 30 seconds with automatic retry
 * 
 * Performance Features:
 * - Per-bot timeout handling (default: 25 seconds)
 * - Processing metrics tracking (duration, success rate)
 * - Error isolation (one bot failure doesn't affect others)
 */

import { db } from "@/lib/db";
import { getCurrentPrice } from "@/lib/position-monitor";
import { notifyAll } from "@/lib/notification-service";
import {
  acquireBotLock,
  releaseBotLock,
  initializeLockProvider,
  BotLockOptions,
} from "@/lib/locks";

// ==================== LOCK CONFIGURATION ====================

/**
 * Default lock options for bot processing
 */
const BOT_LOCK_OPTIONS: BotLockOptions = {
  ttl: 30000, // 30 seconds
  maxRetries: 3,
};

/**
 * Default timeout for bot processing (must be less than lock TTL)
 */
const BOT_PROCESSING_TIMEOUT = 25000; // 25 seconds

// ==================== PROCESSING METRICS ====================

/**
 * Metrics for bot processing
 */
interface BotProcessingMetrics {
  totalProcessed: number;
  successful: number;
  failed: number;
  timeouts: number;
  avgDuration: number;
  maxDuration: number;
  lastProcessingTime: number;
}

/**
 * Global metrics storage
 */
const botMetrics: Map<string, BotProcessingMetrics> = new Map();

/**
 * Get or create metrics for a bot type
 */
function getMetrics(botType: 'grid' | 'dca'): BotProcessingMetrics {
  if (!botMetrics.has(botType)) {
    botMetrics.set(botType, {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      timeouts: 0,
      avgDuration: 0,
      maxDuration: 0,
      lastProcessingTime: 0,
    });
  }
  return botMetrics.get(botType)!;
}

/**
 * Record processing result in metrics
 */
function recordMetrics(
  botType: 'grid' | 'dca',
  success: boolean,
  duration: number,
  timedOut: boolean = false
): void {
  const metrics = getMetrics(botType);
  
  metrics.totalProcessed++;
  if (success) metrics.successful++;
  else if (timedOut) metrics.timeouts++;
  else metrics.failed++;
  
  // Update duration stats
  metrics.avgDuration = (metrics.avgDuration * (metrics.totalProcessed - 1) + duration) / metrics.totalProcessed;
  metrics.maxDuration = Math.max(metrics.maxDuration, duration);
  metrics.lastProcessingTime = Date.now();
}

/**
 * Get processing metrics for a bot type
 */
export function getBotMetrics(botType: 'grid' | 'dca'): BotProcessingMetrics {
  return { ...getMetrics(botType) };
}

/**
 * Reset metrics for a bot type
 */
export function resetBotMetrics(botType: 'grid' | 'dca'): void {
  botMetrics.delete(botType);
}

/**
 * Create a timeout wrapper for bot processing
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  botId: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Bot ${botId} processing timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ==================== GRID BOT WORKER ====================

export interface GridBotState {
  id: string;
  symbol: string;
  currentPrice: number;
  upperPrice: number;
  lowerPrice: number;
  gridCount: number;
  gridLevels: number[];
  activeOrders: {
    id: string;
    gridLevel: number;
    price: number;
    side: "BUY" | "SELL";
    status: string;
  }[];
  totalInvested: number;
  totalProfit: number;
}

/**
 * Calculate grid levels based on bot configuration
 */
function calculateGridLevels(
  upperPrice: number,
  lowerPrice: number,
  gridCount: number,
  gridType: "ARITHMETIC" | "GEOMETRIC"
): number[] {
  const levels: number[] = [];
  
  if (gridType === "ARITHMETIC") {
    const step = (upperPrice - lowerPrice) / (gridCount - 1);
    for (let i = 0; i < gridCount; i++) {
      levels.push(lowerPrice + step * i);
    }
  } else {
    // Geometric
    const ratio = Math.pow(upperPrice / lowerPrice, 1 / (gridCount - 1));
    for (let i = 0; i < gridCount; i++) {
      levels.push(lowerPrice * Math.pow(ratio, i));
    }
  }
  
  return levels;
}

/**
 * Process a single grid bot
 * Uses distributed lock to prevent race conditions
 * Includes timeout handling to prevent stuck processing
 */
export async function processGridBot(botId: string, timeoutMs: number = BOT_PROCESSING_TIMEOUT): Promise<{
  success: boolean;
  actions: string[];
  profit?: number;
  error?: string;
  timedOut?: boolean;
  duration?: number;
}> {
  const startTime = Date.now();
  const actions: string[] = [];
  
  // Acquire lock for this bot
  const lockResult = await acquireBotLock('grid', botId, BOT_LOCK_OPTIONS);
  
  if (!lockResult.acquired) {
    actions.push("Bot is already being processed by another worker");
    return { success: true, actions, error: "locked" };
  }
  
  try {
    // Execute with timeout
    const result = await withTimeout(
      processGridBotInternal(botId, actions),
      timeoutMs,
      botId
    );
    
    const duration = Date.now() - startTime;
    recordMetrics('grid', result.success, duration);
    
    return { ...result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const timedOut = errorMessage.includes('timed out');
    
    recordMetrics('grid', false, duration, timedOut);
    
    return {
      success: false,
      actions,
      error: errorMessage,
      timedOut,
      duration,
    };
  } finally {
    // Always release the lock
    await releaseBotLock('grid', botId, lockResult.holder!);
    console.log(`[BotWorker] Released lock for grid bot ${botId}`);
  }
}

/**
 * Internal grid bot processing logic
 */
async function processGridBotInternal(botId: string, actions: string[]): Promise<{
  success: boolean;
  actions: string[];
  profit?: number;
  error?: string;
}> {
    // Get bot with orders
    const bot = await db.gridBot.findUnique({
      where: { id: botId },
      include: {
        gridOrders: true,
        account: true,
      },
    });
    
    if (!bot) {
      return { success: false, actions: [], error: "Bot not found" };
    }
    
    if (!bot.isActive || bot.status !== "RUNNING") {
      return { success: true, actions: ["Bot is not running"] };
    }
    
    // Get current price
    const currentPrice = await getCurrentPrice(bot.symbol);
    actions.push(`Current price: $${currentPrice.toFixed(2)}`);
    
    // Check if price is within range
    if (currentPrice < bot.lowerPrice || currentPrice > bot.upperPrice) {
      actions.push(`Price out of range (${bot.lowerPrice} - ${bot.upperPrice})`);
      
      // Pause bot if price exceeds range
      if (currentPrice > bot.upperPrice * 1.05 || currentPrice < bot.lowerPrice * 0.95) {
        await db.gridBot.update({
          where: { id: botId },
          data: { status: "PAUSED" },
        });
        actions.push("Bot paused due to price out of range");
      }
      
      return { success: true, actions };
    }
    
    // Calculate grid levels
    const gridLevels = calculateGridLevels(
      bot.upperPrice,
      bot.lowerPrice,
      bot.gridCount,
      bot.gridType as "ARITHMETIC" | "GEOMETRIC"
    );
    
    // Find the current grid level
    let currentLevel = 0;
    for (let i = 0; i < gridLevels.length; i++) {
      if (currentPrice >= gridLevels[i]) {
        currentLevel = i;
      }
    }
    
    actions.push(`Current grid level: ${currentLevel + 1}/${bot.gridCount}`);
    
    // Process each grid level
    let totalProfit = 0;
    
    for (let i = 0; i < gridLevels.length; i++) {
      const levelPrice = gridLevels[i];
      const existingOrder = bot.gridOrders.find(o => o.gridLevel === i + 1);
      
      if (i < currentLevel) {
        // Below current price - should have BUY order
        if (!existingOrder || existingOrder.status === "FILLED") {
          // Check if we need to place SELL order (we bought, now sell at higher price)
          if (existingOrder?.status === "FILLED" && existingOrder.side === "BUY") {
            const sellPrice = gridLevels[Math.min(i + 1, gridLevels.length - 1)];
            const profit = (sellPrice - levelPrice) * existingOrder.amount;
            totalProfit += profit;
            
            // Create sell order
            await db.gridOrder.create({
              data: {
                gridBotId: bot.id,
                gridLevel: i + 1,
                price: sellPrice,
                side: "SELL",
                status: "PENDING",
                amount: existingOrder.filled,
              },
            });
            
            actions.push(`Level ${i + 1}: Placed SELL at $${sellPrice.toFixed(2)}`);
          }
        }
      } else if (i > currentLevel) {
        // Above current price - should have SELL order
        if (!existingOrder || existingOrder.status === "FILLED") {
          // Check if we need to place BUY order (we sold, now buy at lower price)
          if (existingOrder?.status === "FILLED" && existingOrder.side === "SELL") {
            const buyPrice = gridLevels[Math.max(i - 1, 0)];
            const profit = (levelPrice - buyPrice) * existingOrder.amount;
            totalProfit += profit;
            
            // Create buy order
            await db.gridOrder.create({
              data: {
                gridBotId: bot.id,
                gridLevel: i + 1,
                price: buyPrice,
                side: "BUY",
                status: "PENDING",
                amount: existingOrder.filled,
              },
            });
            
            actions.push(`Level ${i + 1}: Placed BUY at $${buyPrice.toFixed(2)}`);
          }
        }
      }
    }
    
    // Update bot stats
    if (totalProfit > 0) {
      await db.gridBot.update({
        where: { id: botId },
        data: {
          totalProfit: { increment: totalProfit },
          totalTrades: { increment: 1 },
          realizedPnL: { increment: totalProfit },
        },
      });
      
      actions.push(`Profit this cycle: $${totalProfit.toFixed(2)}`);
    }
    
    // Check take profit / stop loss
    if (bot.takeProfit && currentPrice >= bot.takeProfit) {
      await closeGridBot(botId, "TAKE_PROFIT");
      actions.push("Take profit triggered - closing bot");
      
      await notifyAll({
        type: "POSITION_CLOSED",
        title: `🎯 Grid Bot TP Reached`,
        message: `${bot.symbol} grid bot closed at TP\nProfit: $${bot.totalProfit.toFixed(2)}`,
        priority: "high",
      });
    }
    
    if (bot.stopLoss && currentPrice <= bot.stopLoss) {
      await closeGridBot(botId, "STOP_LOSS");
      actions.push("Stop loss triggered - closing bot");
      
      await notifyAll({
        type: "POSITION_CLOSED",
        title: `🛑 Grid Bot SL Triggered`,
        message: `${bot.symbol} grid bot closed at SL\nProfit: $${bot.totalProfit.toFixed(2)}`,
        priority: "high",
      });
    }
    
    return { success: true, actions, profit: totalProfit };
}

/**
 * Close a grid bot
 */
async function closeGridBot(botId: string, reason: string): Promise<void> {
  await db.gridBot.update({
    where: { id: botId },
    data: {
      status: reason === "STOP_LOSS" ? "STOPPED_LOSS" : "COMPLETED",
      stoppedAt: new Date(),
    },
  });
  
  // Cancel all pending orders
  await db.gridOrder.updateMany({
    where: {
      gridBotId: botId,
      status: "PENDING",
    },
    data: { status: "CANCELLED" },
  });
}

/**
 * Start a grid bot
 */
export async function startGridBot(botId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const bot = await db.gridBot.findUnique({
      where: { id: botId },
    });
    
    if (!bot) {
      return { success: false, error: "Bot not found" };
    }
    
    if (bot.isActive) {
      return { success: false, error: "Bot is already running" };
    }
    
    // Calculate grid levels
    const gridLevels = calculateGridLevels(
      bot.upperPrice,
      bot.lowerPrice,
      bot.gridCount,
      bot.gridType as "ARITHMETIC" | "GEOMETRIC"
    );
    
    // Calculate amount per grid
    const perGridAmount = bot.perGridAmount || bot.totalInvestment / bot.gridCount;
    
    // Create initial grid orders
    const currentPrice = await getCurrentPrice(bot.symbol);
    
    for (let i = 0; i < gridLevels.length; i++) {
      const levelPrice = gridLevels[i];
      const side = levelPrice < currentPrice ? "BUY" : "SELL";
      
      await db.gridOrder.create({
        data: {
          gridBotId: bot.id,
          gridLevel: i + 1,
          price: levelPrice,
          side,
          status: "PENDING",
          amount: perGridAmount,
        },
      });
    }
    
    // Update bot status
    await db.gridBot.update({
      where: { id: botId },
      data: {
        isActive: true,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    
    return { success: true };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process all active grid bots
 * Uses distributed locks to prevent race conditions
 */
export async function processAllGridBots(): Promise<{
  processed: number;
  results: { botId: string; success: boolean; actions: string[] }[];
}> {
  // Ensure lock provider is initialized
  await initializeLockProvider();
  
  const results: { botId: string; success: boolean; actions: string[] }[] = [];
  
  const bots = await db.gridBot.findMany({
    where: {
      isActive: true,
      status: "RUNNING",
    },
    select: { id: true },
  });
  
  // Process bots in parallel with locks
  const processPromises = bots.map(async (bot) => {
    const result = await processGridBot(bot.id);
    return {
      botId: bot.id,
      success: result.success,
      actions: result.actions,
    };
  });
  
  const settledResults = await Promise.allSettled(processPromises);
  
  for (const result of settledResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        botId: 'unknown',
        success: false,
        actions: [],
      });
    }
  }
  
  return { processed: bots.length, results };
}

// ==================== DCA BOT WORKER ====================

/**
 * Process a single DCA bot
 * Uses distributed lock to prevent race conditions
 * Includes timeout handling to prevent stuck processing
 */
export async function processDcaBot(botId: string, timeoutMs: number = BOT_PROCESSING_TIMEOUT): Promise<{
  success: boolean;
  actions: string[];
  error?: string;
  timedOut?: boolean;
  duration?: number;
}> {
  const startTime = Date.now();
  const actions: string[] = [];
  
  // Acquire lock for this bot
  const lockResult = await acquireBotLock('dca', botId, BOT_LOCK_OPTIONS);
  
  if (!lockResult.acquired) {
    actions.push("Bot is already being processed by another worker");
    return { success: true, actions, error: "locked" };
  }
  
  try {
    // Execute with timeout
    const result = await withTimeout(
      processDcaBotInternal(botId, actions),
      timeoutMs,
      botId
    );
    
    const duration = Date.now() - startTime;
    recordMetrics('dca', result.success, duration);
    
    return { ...result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const timedOut = errorMessage.includes('timed out');
    
    recordMetrics('dca', false, duration, timedOut);
    
    return {
      success: false,
      actions,
      error: errorMessage,
      timedOut,
      duration,
    };
  } finally {
    // Always release the lock
    await releaseBotLock('dca', botId, lockResult.holder!);
    console.log(`[BotWorker] Released lock for DCA bot ${botId}`);
  }
}

/**
 * Internal DCA bot processing logic
 */
async function processDcaBotInternal(botId: string, actions: string[]): Promise<{
  success: boolean;
  actions: string[];
  error?: string;
}> {
  const bot = await db.dcaBot.findUnique({
    where: { id: botId },
    include: {
      dcaOrders: true,
      account: true,
    },
  });
  
  if (!bot) {
    return { success: false, actions: [], error: "Bot not found" };
  }
  
  if (!bot.isActive || bot.status !== "RUNNING") {
    return { success: true, actions: ["Bot is not running"] };
  }
  
  const currentPrice = await getCurrentPrice(bot.symbol);
  actions.push(`Current price: $${currentPrice.toFixed(2)}`);
  
  // Check if we need to trigger a DCA level
  if (bot.avgEntryPrice && bot.direction === "LONG") {
    const priceDropPercent = ((bot.avgEntryPrice - currentPrice) / bot.avgEntryPrice) * 100;
    const nextLevel = bot.currentLevel + 1;
    
    if (nextLevel <= bot.dcaLevels && priceDropPercent >= bot.dcaPercent * nextLevel) {
      // Trigger DCA level
      const dcaAmount = bot.baseAmount * Math.pow(bot.dcaMultiplier, nextLevel);
      
      await db.dcaOrder.create({
        data: {
          dcaBotId: bot.id,
          dcaLevel: nextLevel,
          price: currentPrice,
          side: "BUY",
          orderType: "MARKET",
          status: "FILLED",
          amount: dcaAmount,
          quantity: dcaAmount / currentPrice,
          filled: dcaAmount,
          filledAt: new Date(),
        },
      });
      
      // Update bot
      const newTotalInvested = bot.totalInvested + dcaAmount;
      const newTotalAmount = bot.totalAmount + (dcaAmount / currentPrice);
      const newAvgPrice = newTotalInvested / newTotalAmount;
      
      await db.dcaBot.update({
        where: { id: botId },
        data: {
          currentLevel: nextLevel,
          totalInvested: newTotalInvested,
          totalAmount: newTotalAmount,
          avgEntryPrice: newAvgPrice,
        },
      });
      
      actions.push(`DCA Level ${nextLevel} executed at $${currentPrice.toFixed(2)}`);
      
      await notifyAll({
        type: "ORDER_FILLED",
        title: `📊 DCA Level ${nextLevel}`,
        message: `${bot.symbol} DCA executed\nAmount: $${dcaAmount.toFixed(2)}\nNew avg: $${newAvgPrice.toFixed(2)}`,
        priority: "normal",
      });
    }
  }
  
  // Check take profit
  if (bot.direction === "LONG" && bot.avgEntryPrice) {
    const tpPrice = bot.tpType === "PERCENT"
      ? bot.avgEntryPrice * (1 + bot.tpValue / 100)
      : bot.tpValue;
    
    if (currentPrice >= tpPrice) {
      actions.push("Take profit target reached!");
      // TODO: Execute TP sell
    }
  }
  
  // Check stop loss
  if (bot.slEnabled && bot.slValue) {
    const slPrice = bot.slType === "PERCENT"
      ? (bot.avgEntryPrice || currentPrice) * (1 - bot.slValue / 100)
      : bot.slValue;
    
    if (currentPrice <= slPrice) {
      actions.push("Stop loss triggered!");
      // TODO: Execute SL sell
    }
  }
  
  return { success: true, actions };
}

/**
 * Process all active DCA bots
 * Uses distributed locks to prevent race conditions
 */
export async function processAllDcaBots(): Promise<{
  processed: number;
  results: { botId: string; success: boolean; actions: string[] }[];
}> {
  // Ensure lock provider is initialized
  await initializeLockProvider();
  
  const results: { botId: string; success: boolean; actions: string[] }[] = [];
  
  const bots = await db.dcaBot.findMany({
    where: {
      isActive: true,
      status: "RUNNING",
    },
    select: { id: true },
  });
  
  // Process bots in parallel with locks
  const processPromises = bots.map(async (bot) => {
    const result = await processDcaBot(bot.id);
    return {
      botId: bot.id,
      success: result.success,
      actions: result.actions,
    };
  });
  
  const settledResults = await Promise.allSettled(processPromises);
  
  for (const result of settledResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        botId: 'unknown',
        success: false,
        actions: [],
      });
    }
  }
  
  return { processed: bots.length, results };
}
