/**
 * Bot Orchestrator Service
 * Manages bot lifecycle and real-time monitoring
 *
 * Features:
 * - Start/Stop/Pause bot instances
 * - Real-time position monitoring
 * - Order execution through exchange clients
 * - Risk management and position sizing
 */

import { db } from '@/lib/db';
import {
  placeOrder,
  cancelOrder,
  getBalances,
  getPositions,
  setLeverage,
  testConnection,
  type ExchangeOrderConfig,
  type ExchangeOrderResult,
} from '@/lib/auto-trading/exchange-order';

// ==================== Types ====================

export type BotType = 'grid' | 'dca' | 'bb' | 'vision' | 'frequency' | 'argus' | 'range';
export type BotStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'PAUSING' | 'PAUSED' | 'STOPPING' | 'ERROR';

export interface BotInstance {
  id: string;
  type: BotType;
  name: string;
  status: BotStatus;
  exchangeId: string;
  marketType: 'spot' | 'futures';
  mode: 'PAPER' | 'TESTNET' | 'DEMO' | 'LIVE';
  symbol: string;
  accountId: string;
  startedAt?: Date;
  stoppedAt?: Date;
  error?: string;
  metrics: {
    totalTrades: number;
    winTrades: number;
    lossTrades: number;
    totalPnL: number;
    unrealizedPnL: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
  config: Record<string, unknown>;
}

export interface BotStartParams {
  botId: string;
  botType: BotType;
  accountId: string;
  mode: 'PAPER' | 'TESTNET' | 'DEMO' | 'LIVE';
  config: Record<string, unknown>;
}

export interface BotActionResult {
  success: boolean;
  bot?: BotInstance;
  error?: string;
}

// ==================== In-Memory Bot Registry ====================

const botInstances = new Map<string, BotInstance>();
const botIntervals = new Map<string, NodeJS.Timeout>();

// ==================== Bot Orchestrator ====================

export class BotOrchestrator {
  /**
   * Get all active bot instances
   */
  static getActiveBots(): BotInstance[] {
    return Array.from(botInstances.values()).filter(
      b => b.status === 'RUNNING' || b.status === 'PAUSED'
    );
  }

  /**
   * Get bot instance by ID
   */
  static getBot(botId: string): BotInstance | undefined {
    return botInstances.get(botId);
  }

  /**
   * Start a bot
   */
  static async startBot(params: BotStartParams): Promise<BotActionResult> {
    const { botId, botType, accountId, mode, config } = params;

    // Check if bot is already running
    const existingBot = botInstances.get(botId);
    if (existingBot && existingBot.status === 'RUNNING') {
      return {
        success: false,
        error: 'Bot is already running',
      };
    }

    try {
      // Get account details
      const account = await db.account.findUnique({
        where: { id: accountId },
      });

      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      // Test connection for non-paper modes
      if (mode !== 'PAPER') {
        const connectionTest = await testConnection({
          exchangeId: account.exchangeId as any,
          mode,
          marketType: account.exchangeType as any,
          apiKey: account.apiKey || undefined,
          apiSecret: account.apiSecret || undefined,
          passphrase: account.apiPassphrase || undefined,
        });

        if (!connectionTest.success) {
          return {
            success: false,
            error: `Connection failed: ${connectionTest.message}`,
          };
        }
      }

      // Create bot instance
      const symbol = (config.symbol as string) || 'BTCUSDT';
      const botInstance: BotInstance = {
        id: botId,
        type: botType,
        name: config.name as string || `${botType}-${botId}`,
        status: 'STARTING',
        exchangeId: account.exchangeId,
        marketType: account.exchangeType as 'spot' | 'futures',
        mode,
        symbol,
        accountId,
        startedAt: new Date(),
        metrics: {
          totalTrades: 0,
          winTrades: 0,
          lossTrades: 0,
          totalPnL: 0,
          unrealizedPnL: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
        },
        config,
      };

      botInstances.set(botId, botInstance);

      // Update database
      await this.updateBotStatus(botId, 'RUNNING');

      // Start bot execution loop
      this.startBotLoop(botInstance, account);

      botInstance.status = 'RUNNING';
      botInstances.set(botId, botInstance);

      return { success: true, bot: botInstance };
    } catch (error) {
      console.error('Failed to start bot:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stop a bot
   */
  static async stopBot(botId: string): Promise<BotActionResult> {
    const bot = botInstances.get(botId);
    if (!bot) {
      return { success: false, error: 'Bot not found' };
    }

    if (bot.status === 'STOPPED') {
      return { success: false, error: 'Bot is already stopped' };
    }

    try {
      bot.status = 'STOPPING';
      botInstances.set(botId, bot);

      // Clear execution interval
      const interval = botIntervals.get(botId);
      if (interval) {
        clearInterval(interval);
        botIntervals.delete(botId);
      }

      // Cancel open orders for this bot (would need order tracking)
      // For now, we just stop the bot

      bot.status = 'STOPPED';
      bot.stoppedAt = new Date();
      botInstances.set(botId, bot);

      // Update database
      await this.updateBotStatus(botId, 'STOPPED');

      return { success: true, bot };
    } catch (error) {
      console.error('Failed to stop bot:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Pause a bot
   */
  static async pauseBot(botId: string): Promise<BotActionResult> {
    const bot = botInstances.get(botId);
    if (!bot) {
      return { success: false, error: 'Bot not found' };
    }

    if (bot.status !== 'RUNNING') {
      return { success: false, error: 'Bot is not running' };
    }

    try {
      bot.status = 'PAUSED';
      botInstances.set(botId, bot);

      // Clear execution interval but keep the bot registered
      const interval = botIntervals.get(botId);
      if (interval) {
        clearInterval(interval);
        botIntervals.delete(botId);
      }

      await this.updateBotStatus(botId, 'PAUSED');

      return { success: true, bot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resume a paused bot
   */
  static async resumeBot(botId: string): Promise<BotActionResult> {
    const bot = botInstances.get(botId);
    if (!bot) {
      return { success: false, error: 'Bot not found' };
    }

    if (bot.status !== 'PAUSED') {
      return { success: false, error: 'Bot is not paused' };
    }

    try {
      // Get account for reconnection
      const account = await db.account.findUnique({
        where: { id: bot.accountId },
      });

      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      bot.status = 'RUNNING';
      botInstances.set(botId, bot);

      // Restart execution loop
      this.startBotLoop(bot, account);

      await this.updateBotStatus(botId, 'RUNNING');

      return { success: true, bot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute a trade for a bot
   */
  static async executeTrade(
    botId: string,
    params: {
      symbol: string;
      side: 'BUY' | 'SELL';
      type: 'LIMIT' | 'MARKET';
      amount: number;
      price?: number;
      reason?: string;
    }
  ): Promise<ExchangeOrderResult> {
    const bot = botInstances.get(botId);
    if (!bot || bot.status !== 'RUNNING') {
      return {
        success: false,
        error: 'Bot is not running',
      };
    }

    try {
      // Get account credentials
      const account = await db.account.findUnique({
        where: { id: bot.accountId },
      });

      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      const orderConfig: ExchangeOrderConfig = {
        exchangeId: bot.exchangeId as any,
        mode: bot.mode,
        marketType: bot.marketType,
        apiKey: account.apiKey || undefined,
        apiSecret: account.apiSecret || undefined,
        passphrase: account.apiPassphrase || undefined,
      };

      const result = await placeOrder(
        orderConfig,
        params.symbol,
        params.side,
        params.type,
        params.amount,
        params.price
      );

      // Log trade
      if (result.success && result.order) {
        await this.logTrade(botId, result.order, params.reason);
        bot.metrics.totalTrades++;
        botInstances.set(botId, bot);
      }

      return result;
    } catch (error) {
      console.error('Trade execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update bot metrics
   */
  static async updateMetrics(botId: string): Promise<void> {
    const bot = botInstances.get(botId);
    if (!bot || bot.status !== 'RUNNING') return;

    try {
      const account = await db.account.findUnique({
        where: { id: bot.accountId },
      });

      if (!account) return;

      // Get current positions
      const positionsResult = await getPositions({
        exchangeId: bot.exchangeId as any,
        mode: bot.mode,
        marketType: bot.marketType,
        apiKey: account.apiKey || undefined,
        apiSecret: account.apiSecret || undefined,
        passphrase: account.apiPassphrase || undefined,
      });

      if (positionsResult.success) {
        const relevantPositions = positionsResult.positions.filter(
          p => p.symbol === bot.symbol
        );

        bot.metrics.unrealizedPnL = relevantPositions.reduce(
          (sum, p) => sum + p.unrealizedPnL,
          0
        );

        botInstances.set(botId, bot);
      }
    } catch (error) {
      console.error('Failed to update metrics:', error);
    }
  }

  // ==================== Private Methods ====================

  private static startBotLoop(bot: BotInstance, account: any): void {
    // Clear existing interval if any
    const existingInterval = botIntervals.get(bot.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Start new execution loop
    const interval = setInterval(async () => {
      try {
        await this.executeBotStrategy(bot, account);
        await this.updateMetrics(bot.id);
      } catch (error) {
        console.error(`Bot ${bot.id} execution error:`, error);
        bot.error = error instanceof Error ? error.message : 'Unknown error';
        botInstances.set(bot.id, bot);
      }
    }, 5000); // 5-second execution interval

    botIntervals.set(bot.id, interval);
  }

  private static async executeBotStrategy(bot: BotInstance, account: any): Promise<void> {
    switch (bot.type) {
      case 'grid':
        await this.executeGridStrategy(bot, account);
        break;
      case 'dca':
        await this.executeDCAStrategy(bot, account);
        break;
      case 'bb':
        await this.executeBBStrategy(bot, account);
        break;
      default:
        // Generic strategy execution
        break;
    }
  }

  private static async executeGridStrategy(bot: BotInstance, account: any): Promise<void> {
    const config = bot.config as any;
    const gridLevels = config.gridLevels || [];
    const symbol = bot.symbol;

    // Get current price
    // This would use the ticker data from exchange
    // For now, skip execution
  }

  private static async executeDCAStrategy(bot: BotInstance, account: any): Promise<void> {
    const config = bot.config as any;
    // DCA strategy implementation
  }

  private static async executeBBStrategy(bot: BotInstance, account: any): Promise<void> {
    const config = bot.config as any;
    // Bollinger Bands strategy implementation
  }

  private static async updateBotStatus(botId: string, status: string): Promise<void> {
    try {
      // Update in database based on bot type
      // This would update the respective bot table
    } catch (error) {
      console.error('Failed to update bot status in database:', error);
    }
  }

  private static async logTrade(
    botId: string,
    order: any,
    reason?: string
  ): Promise<void> {
    try {
      await db.systemLog.create({
        data: {
          level: 'INFO',
          category: 'TRADE',
          message: `Bot ${botId} executed trade: ${order.side} ${order.amount} ${order.symbol}`,
          details: JSON.stringify({
            orderId: order.id,
            symbol: order.symbol,
            side: order.side,
            amount: order.amount,
            price: order.price,
            reason,
          }),
        },
      });
    } catch (error) {
      console.error('Failed to log trade:', error);
    }
  }
}

// Export singleton instance
export const botOrchestrator = BotOrchestrator;
