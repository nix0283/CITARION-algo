/**
 * Telegram Bot Utilities for CITARION
 * Handles message sending, signal parsing, and command processing
 * 
 * Uses unified Cornix-compatible signal parser with:
 * - Russian keywords support
 * - Arbitrary keyword order
 * - Direction-based signal management
 */

import { db } from "@/lib/db";
import { 
  parseSignal, 
  parseManagementCommand,
  formatSignal,
  type ParsedSignal,
  type SignalManagementCommand 
} from "@/lib/signal-parser";
import { getDefaultUserId } from "@/lib/default-user";

// ==================== TYPES ====================

export interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  chat: {
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
    title?: string;
    username?: string;
  };
  date: number;
  text?: string;
  entities?: TelegramEntity[];
}

export interface TelegramEntity {
  type: "bot_command" | "url" | "mention" | "hashtag" | "cashtag" | string;
  offset: number;
  length: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

// ==================== CONFIGURATION ====================

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export function getTelegramApiUrl(): string {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return `${TELEGRAM_API_BASE}${botToken}`;
}

// ==================== SIGNAL ID MANAGEMENT ====================

async function getNextSignalId(): Promise<number> {
  const counter = await db.signalIdCounter.upsert({
    where: { id: "signal_counter" },
    update: { lastId: { increment: 1 } },
    create: { id: "signal_counter", lastId: 1 },
  });
  return counter.lastId;
}

async function getCurrentSignalId(): Promise<number> {
  const counter = await db.signalIdCounter.findUnique({
    where: { id: "signal_counter" },
  });
  return counter?.lastId || 0;
}

async function resetSignalIdCounter(): Promise<void> {
  await db.signalIdCounter.upsert({
    where: { id: "signal_counter" },
    update: { lastId: 0 },
    create: { id: "signal_counter", lastId: 0 },
  });
}

// ==================== API FUNCTIONS ====================

export async function sendMessage(
  chatId: number,
  text: string,
  options: {
    parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
    disable_notification?: boolean;
    reply_to_message_id?: number;
    reply_markup?: object;
  } = {}
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const apiUrl = `${getTelegramApiUrl()}/sendMessage`;
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || "Markdown",
        disable_notification: options.disable_notification || false,
        reply_to_message_id: options.reply_to_message_id,
        reply_markup: options.reply_markup,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("Telegram API error:", data.description);
      return { success: false, error: data.description };
    }

    return { success: true, messageId: data.result.message_id };
  } catch (error) {
    console.error("Send message error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ==================== SIGNAL PARSING ====================

export function parseSignalFromMessage(text: string): ParsedSignal | null {
  if (!text || text.trim().length === 0) {
    return null;
  }
  return parseSignal(text);
}

// ==================== MESSAGE FORMATTING ====================

export function formatPositionMessage(position: {
  symbol: string;
  direction: string;
  totalAmount: number;
  avgEntryPrice: number;
  currentPrice?: number;
  leverage: number;
  unrealizedPnl?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}): string {
  const directionEmoji = position.direction === "LONG" ? "🟢" : "🔴";
  const pnlEmoji = (position.unrealizedPnl || 0) >= 0 ? "📈" : "📉";
  
  let message = `${directionEmoji} *${position.symbol}* ${position.direction}\n\n`;
  message += `📊 *Position Details:*\n`;
  message += `• Size: \`${position.totalAmount.toFixed(6)}\`\n`;
  message += `• Entry: \`$${position.avgEntryPrice.toLocaleString()}\`\n`;
  message += `• Leverage: \`${position.leverage}x\`\n`;
  
  if (position.currentPrice) {
    message += `• Current: \`$${position.currentPrice.toLocaleString()}\`\n`;
  }
  
  if (position.unrealizedPnl !== undefined) {
    const pnlValue = position.unrealizedPnl.toFixed(2);
    const pnlSign = position.unrealizedPnl >= 0 ? "+" : "";
    message += `• PnL: ${pnlEmoji} \`${pnlSign}$${pnlValue}\`\n`;
  }
  
  if (position.stopLoss) {
    message += `• Stop Loss: \`$${position.stopLoss.toLocaleString()}\`\n`;
  }
  
  if (position.takeProfit) {
    message += `• Take Profit: \`$${position.takeProfit.toLocaleString()}\`\n`;
  }
  
  return message;
}

export function formatSignalMessage(signal: ParsedSignal): string {
  const directionEmoji = signal.direction === "LONG" ? "🟢📈" : "🔴📉";
  const marketEmoji = signal.marketType === "SPOT" ? "💱" : "⚡";
  
  let message = `${directionEmoji} *#${signal.symbol}* ${signal.direction}\n`;
  message += `${marketEmoji} *Market:* ${signal.marketType}\n\n`;
  
  if (signal.entryZone) {
    message += `📍 *Entry Zone:* \`${signal.entryZone.min.toLocaleString()} - ${signal.entryZone.max.toLocaleString()}\`\n`;
  } else if (signal.entryPrices.length > 0) {
    if (signal.entryPrices.length === 1) {
      message += `📍 *Entry:* \`$${signal.entryPrices[0].toLocaleString()}\`\n`;
    } else {
      message += `📍 *Entries:*\n`;
      signal.entryPrices.forEach((price, i) => {
        message += `  ${i + 1}. \`$${price.toLocaleString()}\`\n`;
      });
    }
  }
  
  if (signal.takeProfits.length > 0) {
    message += `\n🎯 *Take Profits:*\n`;
    signal.takeProfits.forEach((tp, i) => {
      message += `  TP${i + 1}: \`$${tp.price.toLocaleString()}\` (${tp.percentage}%)\n`;
    });
  }
  
  if (signal.stopLoss) {
    message += `\n🛑 *Stop Loss:* \`$${signal.stopLoss.toLocaleString()}\`\n`;
  }
  
  if (signal.marketType === "FUTURES") {
    message += `\n⚡ *Leverage:* ${signal.leverageType} \`${signal.leverage}x\`\n`;
  }
  
  return message;
}

export function formatBalanceMessage(balance: Record<string, number>): string {
  let message = "💰 *Account Balance*\n\n";
  
  const entries = Object.entries(balance)
    .filter(([_, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  
  let totalUsd = 0;
  
  for (const [asset, amount] of entries) {
    if (asset === "USDT" || asset === "USDC") {
      totalUsd += amount;
      message += `💵 *${asset}:* \`${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`\n`;
    } else {
      message += `🪙 *${asset}:* \`${amount.toFixed(6)}\`\n`;
    }
  }
  
  message += `\n💵 *Total USDT:* \`${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`\n`;
  
  return message;
}

// ==================== MANAGEMENT COMMAND HANDLERS ====================

export async function handleResetIdCommand(): Promise<string> {
  try {
    await resetSignalIdCounter();
    const currentId = await getCurrentSignalId();
    return `🔄 *Signal ID Counter Reset*\n\nNext signal will be #1\nCurrent counter: ${currentId}`;
  } catch (error) {
    console.error("Reset ID error:", error);
    return "❌ Failed to reset signal ID counter.";
  }
}

export async function handleClearBaseCommand(): Promise<string> {
  try {
    const result = await db.signal.deleteMany({});
    await resetSignalIdCounter();
    return `🗑️ *Database Cleared*\n\n• ${result.count} signals removed\n• ID counter reset to 0\n\nNext signal will be #1`;
  } catch (error) {
    console.error("Clear base error:", error);
    return "❌ Failed to clear database.";
  }
}

/**
 * Handle signal update commands (TP, SL, Close, Market Entry)
 * Now supports direction to distinguish long/short signals
 */
export async function handleSignalUpdateCommand(command: SignalManagementCommand): Promise<string> {
  try {
    const marketType = command.marketType || "FUTURES";
    const marketLabel = marketType === "SPOT" ? "SPOT" : "FUTURES";
    const dirText = command.direction ? ` ${command.direction}` : "";

    switch (command.type) {
      case "MARKET_ENTRY": {
        if (!command.symbol) {
          return "❌ Invalid market entry. Format: `BTCUSDT enter` or `BTCUSDT long enter`";
        }

        // Find or create signal
        let signal = await db.signal.findFirst({
          where: {
            symbol: command.symbol.toUpperCase(),
            marketType,
            direction: command.direction || undefined,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!signal) {
          // Create new signal
          const signalId = await getNextSignalId();
          signal = await db.signal.create({
            data: {
              signalId,
              source: "MARKET_ENTRY",
              sourceMessage: `Market entry: ${command.symbol} ${command.direction || "LONG"} ${marketType}`,
              symbol: command.symbol.toUpperCase(),
              direction: command.direction || "LONG",
              action: "BUY",
              marketType,
              status: "ACTIVE",
              processedAt: new Date(),
            },
          });
        }

        // Execute market entry
        const exchangeType = marketType === "SPOT" ? "spot" : "futures";
        let account = await db.account.findFirst({
          where: { accountType: "DEMO", exchangeType },
        });

        if (!account) {
          const userIdForAccount = await getDefaultUserId();
          account = await db.account.create({
            data: {
              userId: userIdForAccount,
              accountType: "DEMO",
              exchangeId: "binance",
              exchangeType,
              exchangeName: marketType === "SPOT" ? "Binance Spot" : "Binance Futures",
              virtualBalance: JSON.stringify({ USDT: 10000 }),
              isActive: true,
            },
          });
        }

        const DEMO_PRICES: Record<string, number> = {
          BTCUSDT: 67500, ETHUSDT: 3500, BNBUSDT: 600, SOLUSDT: 175,
          XRPUSDT: 0.52, DOGEUSDT: 0.15, ADAUSDT: 0.45,
        };
        const marketPrice = DEMO_PRICES[command.symbol.toUpperCase()] || 100;
        const leverage = marketType === "SPOT" ? 1 : (signal.leverage || 10);
        const quantity = (100 * leverage) / marketPrice;

        const position = await db.position.create({
          data: {
            accountId: account.id,
            symbol: command.symbol.toUpperCase(),
            direction: signal.direction,
            status: "OPEN",
            totalAmount: quantity,
            filledAmount: quantity,
            avgEntryPrice: marketPrice,
            currentPrice: marketPrice,
            leverage,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfits ? JSON.parse(signal.takeProfits)[0]?.price : null,
            unrealizedPnl: 0,
            realizedPnl: 0,
            isDemo: true,
          },
        });

        await db.signal.update({
          where: { id: signal.id },
          data: { positionId: position.id, status: "ACTIVE" },
        });

        return `✅ *Market Entry Executed*\n\n#${signal.signalId} ${command.symbol.toUpperCase()}${dirText} ${marketLabel}\nEntry: \`$${marketPrice.toLocaleString()}\`\nLeverage: \`${leverage}x\``;
      }

      case "UPDATE_TP": {
        if (!command.symbol || !command.tpIndex || !command.tpPrice) {
          return "❌ Invalid TP update. Format: `BTCUSDT long tp2 100`";
        }

        const signal = await db.signal.findFirst({
          where: {
            symbol: command.symbol.toUpperCase(),
            marketType,
            direction: command.direction || undefined,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!signal) {
          return `❌ No active${dirText} ${marketLabel} signal found for ${command.symbol.toUpperCase()}`;
        }

        const takeProfits = signal.takeProfits ? JSON.parse(signal.takeProfits) : [];
        takeProfits[command.tpIndex - 1] = { price: command.tpPrice, percentage: 100 / Math.max(command.tpIndex, takeProfits.length) };

        await db.signal.update({
          where: { id: signal.id },
          data: { takeProfits: JSON.stringify(takeProfits) },
        });

        return `✅ *Signal #${signal.signalId} Updated*\n\n${command.symbol.toUpperCase()}${dirText} TP${command.tpIndex}: \`$${command.tpPrice.toLocaleString()}\``;
      }

      case "UPDATE_SL": {
        if (!command.symbol || !command.slPrice) {
          return "❌ Invalid SL update. Format: `BTCUSDT long sl 95`";
        }

        const signal = await db.signal.findFirst({
          where: {
            symbol: command.symbol.toUpperCase(),
            marketType,
            direction: command.direction || undefined,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!signal) {
          return `❌ No active${dirText} ${marketLabel} signal found for ${command.symbol.toUpperCase()}`;
        }

        await db.signal.update({
          where: { id: signal.id },
          data: { stopLoss: command.slPrice },
        });

        return `✅ *Signal #${signal.signalId} Updated*\n\n${command.symbol.toUpperCase()}${dirText} Stop Loss: \`$${command.slPrice.toLocaleString()}\``;
      }

      case "CLOSE_SIGNAL": {
        if (!command.symbol) {
          return "❌ Invalid close command. Format: `BTCUSDT long close`";
        }

        const signal = await db.signal.findFirst({
          where: {
            symbol: command.symbol.toUpperCase(),
            marketType,
            direction: command.direction || undefined,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!signal) {
          return `❌ No active${dirText} ${marketLabel} signal found for ${command.symbol.toUpperCase()}`;
        }

        await db.signal.update({
          where: { id: signal.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closeReason: "MANUAL",
          },
        });

        if (signal.positionId) {
          await db.position.update({
            where: { id: signal.positionId },
            data: { status: "CLOSED" },
          });
        }

        return `✅ *Signal #${signal.signalId} Closed*\n\n${command.symbol.toUpperCase()}${dirText} ${marketLabel} signal closed`;
      }

      default:
        return "❌ Unknown command type";
    }
  } catch (error) {
    console.error("Signal update error:", error);
    return "❌ Failed to execute command.";
  }
}

// ==================== COMMAND HANDLERS ====================

export function handleStartCommand(): string {
  return `🤖 *Welcome to CITARION!*

Cornix-compatible signal parser with Russian support.

🔹 *Key Features:*
• Keywords in ANY order
• English + Russian keywords
• SPOT/FUTURES auto-detection
• Direction-based signal management
• Range/Zone entry support
• Demo/Real trading modes

📋 *Commands:*
/start - Show welcome message
/help - Display detailed help
/balance - Check account balance
/positions - View open positions
/signals - Active signals
/status - Bot status
/switch_mode - Toggle DEMO/REAL mode
/stop - Stop auto-trading

💡 *Signal Examples:*

*FUTURES (default):*
\`\`\`
solusdt long leverage 50x cross
stop 20 tp 30 40 50 60 entry 22
\`\`\`

*With Range/Zone:*
\`\`\`
btcusdt long range 1000 1100
tp 1200 sl 900
\`\`\`

*Russian:*
\`\`\`
solusdt лонг диапазон 1000-1100
тп 1200 стоп 900
\`\`\`

*SPOT (add "spot"):*
\`\`\`
eth spot buy 2500
tp 2600 2700 stop 2400
\`\`\`

⚠️ *Key Rules:*
• "spot"/"спот" = SPOT market
• Without = FUTURES
• Specify direction (long/short) for management`;
}

export function handleHelpCommand(): string {
  return `📚 *CITARION Help*

🎮 *Trading Modes:*
• DEMO - Virtual trading with 10,000 USDT
• REAL - Live trading (requires API keys)
• Use /switch_mode to change

🔹 *Signal Keywords (EN/RU):*
• Direction: long/лонг, short/шорт, buy/покупка
• Entry: entry/вход, buy, enter
• Range: range/диапазон, zone/зона
• TP: tp/тп, take profit, target/цель
• SL: sl, stop/стоп, stop loss
• Leverage: leverage/плечо, lev/лев
• Type: cross/крос, isolated/изол

🔹 *Pair Formats:*
• BTCUSDT, BTC/USDT, BTC USDT, BTC
• BTC → defaults to BTCUSDT

🔹 *Range/Zone Formats:*
• range 1000 1100
• range 1000-1100 (any dash spacing)
• диапазон 1000 1100
• zone 1000 1100
• зона 1000-1100

🔹 *Signal Examples:*

*Arbitrary order:*
\`\`\`
solusdt long leverage 50 cross
stop 20 tp 30 40 50 60 entry 22
\`\`\`

*With range:*
\`\`\`
btcusdt long range 67000 68000
tp 70000 sl 66000
\`\`\`

*Russian keywords:*
\`\`\`
solusdt лонг диапазон 1000-1100
тп 1200 стоп 900
\`\`\`

*TP formats:*
\`\`\`
tp 30 40 50 60
tp1 30 tp2 40 tp3 50 tp4 60
\`\`\`

🔹 *Management Commands:*
• \`id reset\` / \`сброс id\` - Reset ID
• \`clear base\` / \`очистить базу\` - Clear all
• \`BTCUSDT long tp2 100\` - Update TP2
• \`BTCUSDT short sl 95\` - Update SL
• \`BTCUSDT long close\` - Close signal
• \`BTCUSDT long enter\` / \`вход\` - Market entry

⚠️ Use direction (long/short) for management commands.`;
}

export async function handleBalanceCommand(chatId: number): Promise<string> {
  try {
    const account = await db.account.findFirst({
      where: { accountType: "DEMO" },
    });

    if (!account) {
      return "❌ No account found.";
    }

    const balance = account.virtualBalance 
      ? JSON.parse(account.virtualBalance) 
      : { USDT: 0 };

    return formatBalanceMessage(balance);
  } catch (error) {
    console.error("Balance command error:", error);
    return "❌ Failed to fetch balance.";
  }
}

export async function handlePositionsCommand(): Promise<string> {
  try {
    const positions = await db.position.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (positions.length === 0) {
      return "📭 *No open positions*";
    }

    let message = `📊 *Open Positions (${positions.length})*\n\n`;
    
    for (const pos of positions) {
      const directionEmoji = pos.direction === "LONG" ? "🟢" : "🔴";
      message += `${directionEmoji} *${pos.symbol}* ${pos.direction}\n`;
      message += `  Entry: \`$${pos.avgEntryPrice.toLocaleString()}\`\n`;
      message += `  Lev: \`${pos.leverage}x\`\n\n`;
    }

    return message;
  } catch (error) {
    console.error("Positions command error:", error);
    return "❌ Failed to fetch positions.";
  }
}

export async function handleStatusCommand(): Promise<string> {
  try {
    const activeConfigs = await db.botConfig.count({ where: { isActive: true } });
    const openPositions = await db.position.count({ where: { status: "OPEN" } });
    const activeSignals = await db.signal.count({ where: { status: { in: ["PENDING", "ACTIVE"] } } });
    const currentId = await getCurrentSignalId();
    const demoAccount = await db.account.findFirst({ where: { accountType: "DEMO" } });
    const balance = demoAccount?.virtualBalance ? JSON.parse(demoAccount.virtualBalance) : { USDT: 0 };

    let message = "🤖 *CITARION Status*\n\n";
    message += `📊 *Statistics:*\n`;
    message += `• Open Positions: \`${openPositions}\`\n`;
    message += `• Active Signals: \`${activeSignals}\`\n`;
    message += `• Current Signal ID: \`#${currentId}\`\n`;
    message += `• Demo Balance: \`$${(balance.USDT || 0).toLocaleString()}\`\n\n`;
    
    message += `⚙️ *Features:*\n`;
    message += `• Format: Cornix Compatible\n`;
    message += `• Languages: EN + RU\n`;
    message += `• SPOT/FUTURES: Auto-detect\n`;

    return message;
  } catch (error) {
    console.error("Status command error:", error);
    return "❌ Failed to fetch status.";
  }
}

export async function handleStopCommand(): Promise<string> {
  try {
    const result = await db.botConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    if (result.count > 0) {
      return `⏸️ *Auto-trading stopped*\n\nDisabled ${result.count} bot(s).`;
    }
    
    return "ℹ️ No active bots to stop.";
  } catch (error) {
    console.error("Stop command error:", error);
    return "❌ Failed to stop bot.";
  }
}

/**
 * Handle /switch_mode command - switch between DEMO and REAL trading
 */
export async function handleSwitchModeCommand(args: string[]): Promise<string> {
  try {
    // Get or create a default user for demo purposes
    let user = await db.user.findFirst();
    
    if (!user) {
      // Create a default demo user
      user = await db.user.create({
        data: {
          email: "user@citarion.local",
          name: "User",
          currentMode: "DEMO",
        },
      });
    }
    
    // Parse target mode from args
    let targetMode: "DEMO" | "REAL";
    
    if (args.length > 0) {
      const arg = args[0].toUpperCase();
      if (arg === "DEMO" || arg === "ДЕМО") {
        targetMode = "DEMO";
      } else if (arg === "REAL" || arg === "РЕАЛ") {
        targetMode = "REAL";
      } else {
        return `❌ Invalid mode: ${args[0]}\n\nUsage: /switch_mode demo|real`;
      }
    } else {
      // Toggle current mode
      targetMode = user.currentMode === "DEMO" ? "REAL" : "DEMO";
    }
    
    // Update user mode
    await db.user.update({
      where: { id: user.id },
      data: { currentMode: targetMode },
    });
    
    const modeEmoji = targetMode === "DEMO" ? "🎮" : "💰";
    const warningText = targetMode === "REAL" 
      ? "\n\n⚠️ *Warning:* REAL mode requires configured exchange API keys!"
      : "\n\n💡 Demo mode uses virtual balance.";
    
    return `${modeEmoji} *Trading Mode Changed*\n\n` +
           `Account Type: *${targetMode}*${warningText}`;
  } catch (error) {
    console.error("Switch mode error:", error);
    return "❌ Failed to switch mode.";
  }
}

/**
 * Get current trading mode
 */
export async function getCurrentMode(): Promise<"DEMO" | "REAL"> {
  try {
    const user = await db.user.findFirst();
    return (user?.currentMode as "DEMO" | "REAL") || "DEMO";
  } catch {
    return "DEMO";
  }
}

/**
 * Add [DEMO] prefix to message if in demo mode
 */
export function formatDemoMessage(message: string, isDemo: boolean): string {
  if (isDemo) {
    return `[DEMO] ${message}`;
  }
  return message;
}

// ==================== SIGNAL EXECUTION ====================

export async function executeSignal(
  signal: ParsedSignal,
  isDemo: boolean = true
): Promise<{ success: boolean; signalId?: number; trade?: object; error?: string }> {
  try {
    const exchangeType = signal.marketType === "SPOT" ? "spot" : "futures";
    
    let account = await db.account.findFirst({
      where: { accountType: "DEMO", exchangeType },
    });

    if (!account) {
      const userIdForAccount = await getDefaultUserId();
      account = await db.account.create({
        data: {
          userId: userIdForAccount,
          accountType: "DEMO",
          exchangeId: "binance",
          exchangeType,
          exchangeName: signal.marketType === "SPOT" ? "Binance Spot" : "Binance Futures",
          virtualBalance: JSON.stringify({ USDT: 10000 }),
          isActive: true,
        },
      });
    }

    const signalId = await getNextSignalId();

    const DEMO_PRICES: Record<string, number> = {
      BTCUSDT: 67500, ETHUSDT: 3500, BNBUSDT: 600, SOLUSDT: 175,
    };

    const price = signal.entryPrices[0] || DEMO_PRICES[signal.symbol] || 100;
    const balance = account.virtualBalance ? JSON.parse(account.virtualBalance) : { USDT: 10000 };
    const positionSize = Math.min(balance.USDT * 0.01, 100);
    const leverage = signal.marketType === "SPOT" ? 1 : signal.leverage;
    const quantity = (positionSize * leverage) / price;
    const fee = positionSize * leverage * 0.0004;

    if (balance.USDT < positionSize + fee) {
      return { success: false, error: "Insufficient balance" };
    }

    balance.USDT -= (positionSize + fee);
    await db.account.update({
      where: { id: account.id },
      data: { virtualBalance: JSON.stringify(balance) },
    });

    const position = await db.position.create({
      data: {
        accountId: account.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: "OPEN",
        totalAmount: quantity,
        filledAmount: quantity,
        avgEntryPrice: price,
        currentPrice: price,
        leverage,
        stopLoss: signal.stopLoss || null,
        takeProfit: signal.takeProfits[0]?.price || null,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isDemo,
      },
    });

    const trade = await db.trade.create({
      data: {
        userId: account.userId,
        accountId: account.id,
        symbol: signal.symbol,
        direction: signal.direction,
        status: "OPEN",
        entryPrice: price,
        entryTime: new Date(),
        amount: quantity,
        leverage,
        stopLoss: signal.stopLoss || null,
        fee,
        signalSource: "TELEGRAM",
        isDemo,
        positionId: position.id,
      },
    });

    await db.signal.create({
      data: {
        signalId,
        source: "TELEGRAM",
        sourceMessage: signal.rawText,
        symbol: signal.symbol,
        direction: signal.direction,
        action: signal.action,
        marketType: signal.marketType,
        entryPrices: JSON.stringify(signal.entryPrices),
        takeProfits: JSON.stringify(signal.takeProfits),
        stopLoss: signal.stopLoss,
        leverage,
        status: "ACTIVE",
        positionId: position.id,
        processedAt: new Date(),
      },
    });

    return {
      success: true,
      signalId,
      trade: {
        id: trade.id,
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        marketType: signal.marketType,
        positionId: position.id,
      },
    };
  } catch (error) {
    console.error("Execute signal error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ==================== WEBHOOK VERIFICATION ====================

export function verifyTelegramWebhook(
  body: unknown,
  botToken?: string
): body is TelegramUpdate {
  if (!body || typeof body !== "object") {
    return false;
  }

  const update = body as Record<string, unknown>;
  
  if (typeof update.update_id !== "number") {
    return false;
  }
  
  return true;
}

export type { ParsedSignal, SignalManagementCommand };

// ==================== TELEGRAM BOT V2 EXPORTS ====================

export { 
  TelegramBotV2, 
  getTelegramBotV2, 
  initializeTelegramBotV2,
  type BotContext,
  type SessionData,
  type PositionInfo 
} from "./telegram-bot-v2";
