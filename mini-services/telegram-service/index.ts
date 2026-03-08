/**
 * Telegram Bot Service for Oracle
 * Standalone Telegram bot with full trading functionality
 *
 * Port: 3006
 * Features:
 * - Telegram Bot API polling
 * - Command handling
 * - Signal parsing and execution
 * - Position management
 * - Real-time notifications via WebSocket
 * - Inline keyboards
 */

import { Server } from "socket.io";
import { io as ioClient } from "socket.io-client";

const PORT = 3006;
const MAIN_API = "http://localhost:3000";
const CHAT_SERVICE = "http://localhost:3005";

// Telegram API configuration
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;

// CORS Configuration
const getAllowedOrigins = (): string[] => {
  const env = process.env.NODE_ENV || 'development';
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  if (allowedOriginsEnv) {
    return allowedOriginsEnv.split(',').map(origin => origin.trim()).filter(Boolean);
  }

  return [
    'http://localhost:3000',
    'http://localhost:3005',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3005',
  ];
};

const allowedOrigins = getAllowedOrigins();

// ==================== Types ====================

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramEntity[];
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

interface TelegramEntity {
  type: "bot_command" | "url" | "mention" | "hashtag" | "cashtag" | string;
  offset: number;
  length: number;
}

interface UserSession {
  telegramId: number;
  chatId: number;
  mode: "DEMO" | "REAL";
  selectedExchange: string;
  lastCommand?: string;
  lastActivity: Date;
}

// ==================== State ====================

const sessions = new Map<number, UserSession>();
let lastUpdateId = 0;
let isPolling = false;

// ==================== Helper Functions ====================

async function callTelegramAPI(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (!BOT_TOKEN) {
    console.error("[TelegramService] BOT_TOKEN not configured");
    return null;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`[TelegramService] API error: ${data.description}`);
      return null;
    }
    return data.result;
  } catch (error) {
    console.error(`[TelegramService] API call failed: ${method}`, error);
    return null;
  }
}

async function callMainAPI(endpoint: string, method: string = "GET", body?: unknown) {
  try {
    const response = await fetch(`${MAIN_API}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await response.json();
  } catch (error) {
    console.error(`[TelegramService] API call failed: ${endpoint}`, error);
    return { success: false, error: "API call failed" };
  }
}

function getSession(telegramId: number, chatId: number): UserSession {
  if (!sessions.has(telegramId)) {
    sessions.set(telegramId, {
      telegramId,
      chatId,
      mode: "DEMO",
      selectedExchange: "binance",
      lastActivity: new Date(),
    });
  }
  return sessions.get(telegramId)!;
}

// ==================== Message Sending ====================

async function sendMessage(
  chatId: number,
  text: string,
  options: {
    parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
    reply_markup?: Record<string, unknown>;
  } = {}
): Promise<void> {
  await callTelegramAPI("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || "Markdown",
    reply_markup: options.reply_markup,
  });
}

async function sendInlineKeyboard(
  chatId: number,
  text: string,
  buttons: { text: string; callback_data: string }[][]
): Promise<void> {
  await callTelegramAPI("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await callTelegramAPI("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

// ==================== Signal Parsing ====================

function parseSignal(text: string): {
  symbol: string;
  direction: "LONG" | "SHORT";
  action: "BUY" | "SELL" | "CLOSE";
  entryPrices: number[];
  takeProfits: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage: number;
  marketType: "SPOT" | "FUTURES";
} | null {
  const upperText = text.toUpperCase();

  // Detect symbol
  const symbolMatch = text.match(/#?([A-Z]{2,10})[\/\-]?([A-Z]{2,10})?/i);
  let symbol = "";
  if (symbolMatch) {
    const base = symbolMatch[1].toUpperCase();
    const quote = symbolMatch[2]?.toUpperCase() || "USDT";
    symbol = base.includes("USDT") ? base : `${base}${quote}`;
  }

  if (!symbol) return null;

  // Detect direction
  let direction: "LONG" | "SHORT" = "LONG";
  if (/short|шорт|sell/i.test(text)) {
    direction = "SHORT";
  }

  // Detect market type
  const marketType: "SPOT" | "FUTURES" = /spot|спот/i.test(text) ? "SPOT" : "FUTURES";

  // Detect action
  const action: "BUY" | "SELL" | "CLOSE" = direction === "LONG" ? "BUY" : "SELL";

  // Parse entry prices
  const entryPrices: number[] = [];
  const entryMatch = text.match(/entry[:\s]+([\d\s.,]+)/i) ||
                     text.match(/вход[:\s]+([\d\s.,]+)/i) ||
                     text.match(/buy[:\s]+([\d\s.,]+)/i);
  if (entryMatch) {
    entryPrices.push(...entryMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n)));
  }

  // Parse take profits
  const takeProfits: { price: number; percentage: number }[] = [];
  const tpMatches = text.matchAll(/tp\d?[:\s]+(\d+(?:\.\d+)?)/gi);
  for (const match of tpMatches) {
    takeProfits.push({ price: parseFloat(match[1]), percentage: 100 / (takeProfits.length + 1) });
  }

  // Parse stop loss
  let stopLoss: number | undefined;
  const slMatch = text.match(/(?:sl|stop|стоп)[:\s]+(\d+(?:\.\d+)?)/i);
  if (slMatch) {
    stopLoss = parseFloat(slMatch[1]);
  }

  // Parse leverage
  let leverage = 10;
  const levMatch = text.match(/leverage|плечо|x(\d+)/i);
  if (levMatch) {
    leverage = parseInt(levMatch[1]) || parseInt(text.match(/(\d+)x/i)?.[1] || "10");
  }

  return {
    symbol,
    direction,
    action,
    entryPrices,
    takeProfits,
    stopLoss,
    leverage,
    marketType,
  };
}

// ==================== Command Handlers ====================

async function handleCommand(message: TelegramMessage): Promise<void> {
  const text = message.text || "";
  const chatId = message.chat.id;
  const telegramId = message.from?.id;

  if (!telegramId) return;

  const session = getSession(telegramId, chatId);
  session.lastActivity = new Date();

  // Parse command
  const command = text.split(" ")[0].toLowerCase();
  const args = text.split(" ").slice(1);

  switch (command) {
    case "/start":
      await sendMessage(chatId, `🤖 *Welcome to Oracle Bot!*

Advanced trading assistant with Cornix signal support.

📊 *Commands:*
/status — System status
/positions — Open positions
/balance — Account balance
/settings — Bot settings
/help — Full help

⚡ *Features:*
• Signal parsing (Cornix format)
• Real-time notifications
• Risk management alerts
• External position tracking

💡 Send a signal to execute a trade.`);
      break;

    case "/help":
      await sendMessage(chatId, `📚 *Oracle Bot Help*

🎮 *Trading Modes:*
• DEMO — Virtual trading ($10,000)
• REAL — Live trading (requires API keys)

📝 *Signal Format (Cornix):*
\`\`\`
BTCUSDT LONG
Entry: 67000
TP: 68000, 69000
SL: 66000
Leverage: 10x
\`\`\`

🔹 *Keywords:*
• Direction: long/лонг, short/шорт
• Entry: entry/вход, buy
• TP: tp/тп, target/цель
• SL: sl, stop/стоп
• Leverage: leverage/плечо, x50

🔹 *Management:*
• BTCUSDT tp2 100 — Update TP2
• BTCUSDT sl 95 — Update SL
• BTCUSDT close — Close position`);
      break;

    case "/status":
      const statusResult = await callMainAPI("/api/trade/open?demo=true");
      const riskResult = await callMainAPI("/api/risk");

      let statusMsg = `📊 *Oracle Status*\n\n`;
      statusMsg += `• Mode: ${session.mode}\n`;
      statusMsg += `• Exchange: ${session.selectedExchange}\n`;
      statusMsg += `• Open Positions: ${statusResult.count || 0}\n`;

      if (riskResult.success && riskResult.data) {
        statusMsg += `• Risk Level: ${riskResult.data.riskLevel}\n`;
        statusMsg += `• Risk Score: ${riskResult.data.riskScore}\n`;
      }

      await sendMessage(chatId, statusMsg);
      break;

    case "/positions":
      const positionsResult = await callMainAPI("/api/trade/open?demo=true");

      if (positionsResult.success && positionsResult.positions?.length > 0) {
        let posMsg = `📊 *Open Positions (${positionsResult.count})*\n\n`;
        for (const pos of positionsResult.positions.slice(0, 10)) {
          const emoji = pos.direction === "LONG" ? "🟢" : "🔴";
          posMsg += `${emoji} *${pos.symbol}* ${pos.direction}\n`;
          posMsg += `  Entry: $${pos.avgEntryPrice?.toLocaleString()}\n`;
          posMsg += `  Lev: ${pos.leverage}x\n\n`;
        }
        await sendMessage(chatId, posMsg);
      } else {
        await sendMessage(chatId, "📭 No open positions");
      }
      break;

    case "/balance":
      const balanceResult = await callMainAPI("/api/chat/parse-signal", "POST", { message: "balance" });
      await sendMessage(chatId, balanceResult.message || "Balance unavailable");
      break;

    case "/settings":
      await sendInlineKeyboard(chatId, `⚙️ *Settings*\n\nMode: ${session.mode}\nExchange: ${session.selectedExchange}`, [
        [
          { text: session.mode === "DEMO" ? "✅ DEMO" : "🎮 DEMO", callback_data: "mode_demo" },
          { text: session.mode === "REAL" ? "✅ REAL" : "💰 REAL", callback_data: "mode_real" },
        ],
        [
          { text: "📊 Binance", callback_data: "exchange_binance" },
          { text: "📊 Bybit", callback_data: "exchange_bybit" },
        ],
        [
          { text: "📊 OKX", callback_data: "exchange_okx" },
          { text: "📊 Gate", callback_data: "exchange_gate" },
        ],
      ]);
      break;

    case "/sync":
      const syncResult = await callMainAPI("/api/positions/sync", "POST");
      await sendMessage(chatId, syncResult.success
        ? `🔄 *Sync Complete*\n\nNew positions: ${syncResult.newPositions || 0}`
        : "❌ Sync failed"
      );
      break;

    case "/close":
      if (args[0]?.toLowerCase() === "all") {
        const closeResult = await callMainAPI("/api/trade/close-all", "POST", { isDemo: session.mode === "DEMO" });
        await sendMessage(chatId, closeResult.success
          ? `🚫 *Closed All*\n\nClosed: ${closeResult.closedCount}\nPnL: $${closeResult.totalPnL?.toFixed(2) || "0.00"}`
          : "❌ Failed to close positions"
        );
      } else {
        await sendMessage(chatId, "Usage: /close all");
      }
      break;

    default:
      // Try to parse as signal
      const signal = parseSignal(text);
      if (signal && signal.entryPrices.length > 0) {
        const result = await callMainAPI("/api/trade/open", "POST", {
          ...signal,
          isDemo: session.mode === "DEMO",
          exchangeId: session.selectedExchange,
          amount: 100,
        });

        if (result.success) {
          await sendMessage(chatId, `✅ *Position Opened*\n\n${signal.symbol} ${signal.direction}\nExchange: ${session.selectedExchange}\nMode: ${session.mode}`);
        } else {
          await sendMessage(chatId, `❌ Failed: ${result.error || "Unknown error"}`);
        }
      } else {
        // Try main API parser
        const parseResult = await callMainAPI("/api/chat/parse-signal", "POST", { message: text });
        if (parseResult.success && parseResult.signal) {
          const result = await callMainAPI("/api/trade/open", "POST", {
            ...parseResult.signal,
            isDemo: session.mode === "DEMO",
            exchangeId: session.selectedExchange,
            amount: 100,
          });

          if (result.success) {
            await sendMessage(chatId, `✅ *Position Opened*\n\n${parseResult.signal.symbol} ${parseResult.signal.direction}`);
          } else {
            await sendMessage(chatId, `❌ Failed: ${result.error || "Unknown error"}`);
          }
        } else {
          await sendMessage(chatId, "❓ Unknown command. Send a signal or use /help");
        }
      }
  }
}

// ==================== Callback Query Handler ====================

async function handleCallbackQuery(callback: TelegramCallbackQuery): Promise<void> {
  const chatId = callback.message?.chat.id;
  const telegramId = callback.from.id;
  const data = callback.data;

  if (!chatId || !telegramId || !data) return;

  const session = getSession(telegramId, chatId);

  if (data === "mode_demo") {
    session.mode = "DEMO";
    await answerCallbackQuery(callback.id, "Switched to DEMO mode");
    await sendMessage(chatId, "🎮 Switched to DEMO mode");
  } else if (data === "mode_real") {
    session.mode = "REAL";
    await answerCallbackQuery(callback.id, "Switched to REAL mode");
    await sendMessage(chatId, "💰 Switched to REAL mode");
  } else if (data.startsWith("exchange_")) {
    const exchange = data.replace("exchange_", "");
    session.selectedExchange = exchange;
    await answerCallbackQuery(callback.id, `Exchange set to ${exchange.toUpperCase()}`);
    await sendMessage(chatId, `🏦 Exchange set to ${exchange.toUpperCase()}`);
  }
}

// ==================== Polling ====================

async function getUpdates(): Promise<TelegramUpdate[]> {
  const result = await callTelegramAPI("getUpdates", {
    offset: lastUpdateId + 1,
    timeout: 30,
    allowed_updates: ["message", "callback_query"],
  });
  return result as TelegramUpdate[] || [];
}

async function startPolling(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  console.log("[TelegramService] Starting polling...");

  while (isPolling) {
    try {
      const updates = await getUpdates();

      for (const update of updates) {
        lastUpdateId = update.update_id;

        if (update.message) {
          await handleCommand(update.message);
        } else if (update.callback_query) {
          await handleCallbackQuery(update.callback_query);
        }
      }
    } catch (error) {
      console.error("[TelegramService] Polling error:", error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// ==================== Initialize Socket.IO ====================

const io = new Server(PORT, {
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all for now
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(`Telegram Service running on port ${PORT}`);

// ==================== WebSocket Events ====================

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send notification to Telegram
  socket.on("send_notification", async (data: { telegramId: number; message: string }) => {
    const session = sessions.get(data.telegramId);
    if (session) {
      await sendMessage(session.chatId, data.message);
    }
  });

  // Broadcast to all Telegram users
  socket.on("broadcast", async (data: { message: string }) => {
    for (const session of sessions.values()) {
      await sendMessage(session.chatId, data.message);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ==================== Chat Service Integration ====================

const chatServiceClient = ioClient(CHAT_SERVICE, {
  transports: ["websocket"],
});

chatServiceClient.on("connect", () => {
  console.log("[TelegramService] Connected to Chat Service");
});

chatServiceClient.on("chat_message", async (message: { role: string; content: string; type: string }) => {
  // Forward important messages to Telegram
  if (message.type === "notification" || message.type === "external-position") {
    for (const session of sessions.values()) {
      await sendMessage(session.chatId, message.content);
    }
  }
});

// ==================== Start ====================

if (BOT_TOKEN) {
  startPolling();
  console.log("[TelegramService] Bot started");
} else {
  console.log("[TelegramService] No BOT_TOKEN configured - polling disabled");
  console.log("[TelegramService] Set TELEGRAM_BOT_TOKEN environment variable");
}

// ==================== Graceful Shutdown ====================

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  isPolling = false;
  io.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

console.log("Telegram Service initialized");
console.log("Features: Telegram Bot polling, WebSocket notifications, Chat Service integration");
