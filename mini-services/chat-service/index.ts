/**
 * Oracle WebSocket Chat Service
 * Real-time two-way communication for trading signals and commands
 *
 * Port: 3005
 * Features:
 * - Two-way WebSocket communication
 * - Signal parsing and execution
 * - Real trading via exchange clients
 * - Position tracking notifications
 * - Risk management integration
 * - Cornix API integration
 * - External position discovery
 */

import { Server } from "socket.io";

const PORT = 3005;
const MAIN_API = "http://localhost:3000";

// CORS Configuration
const getAllowedOrigins = (): string[] => {
  const env = process.env.NODE_ENV || 'development';
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  if (allowedOriginsEnv) {
    return allowedOriginsEnv.split(',').map(origin => origin.trim()).filter(Boolean);
  }

  if (env === 'production') {
    console.error('[SECURITY] ALLOWED_ORIGINS not set in production.');
    return [];
  }

  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];
};

const allowedOrigins = getAllowedOrigins();

// ==================== Types ====================

interface ChatMessage {
  id: string;
  role: "user" | "bot" | "system" | "notification";
  content: string;
  timestamp: Date;
  type?: "signal" | "command" | "notification" | "external-position" | "error";
  data?: SignalData | ExternalPosition | NotificationData | CommandResult;
}

interface SignalData {
  symbol: string;
  direction: "LONG" | "SHORT";
  action: "BUY" | "SELL" | "CLOSE";
  entryPrices: number[];
  takeProfits: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage: number;
  marketType: "SPOT" | "FUTURES";
  exchanges?: string[];
}

interface ExternalPosition {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  exchangeName: string;
  amount: number;
  amountUsd: number;
  avgEntryPrice: number;
  currentPrice?: number;
  leverage: number;
  unrealizedPnl?: number;
  detectedAt: string;
}

interface NotificationData {
  type: string;
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "critical";
}

interface CommandResult {
  command: string;
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

interface UserSession {
  id: string;
  mode: "DEMO" | "REAL";
  selectedExchange: string;
  connectedAt: Date;
  lastActivity: Date;
}

// ==================== State ====================

const sessions = new Map<string, UserSession>();
const messageHistory: ChatMessage[] = [];
const MAX_HISTORY = 100;

// ==================== Helper Functions ====================

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function addMessage(message: Omit<ChatMessage, "id" | "timestamp">): ChatMessage {
  const newMessage: ChatMessage = {
    ...message,
    id: generateId(),
    timestamp: new Date(),
  };

  messageHistory.unshift(newMessage);
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory.pop();
  }

  return newMessage;
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
    console.error(`[ChatService] API call failed: ${endpoint}`, error);
    return { success: false, error: "API call failed" };
  }
}

// ==================== Signal Parsing ====================

function parseSignal(text: string): SignalData | null {
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

async function handleCommand(command: string, session: UserSession): Promise<CommandResult> {
  const cmd = command.toLowerCase().trim();

  // Help command
  if (cmd === "help" || cmd === "справка" || cmd === "помощь") {
    return {
      command: "help",
      success: true,
      message: `📖 **Oracle Chat Commands**

📊 **Status:**
• \`позиции\` - Show open positions
• \`статус\` - System status

📈 **Trading:**
• Send a signal in Cornix format
• Example: BTCUSDT LONG Entry: 67000 TP: 68000 SL: 66000 Leverage: 10x

🚫 **Close Positions:**
• \`close all\` - Close all positions
• \`close BTCUSDT\` - Close by symbol
• \`close BTCUSDT short\` - Close by symbol & direction

⚙️ **Settings:**
• \`demo\` / \`real\` - Switch mode
• \`exchange binance\` - Select exchange

🔄 **Sync:**
• \`sync\` - Sync positions with exchange
• \`external\` - Show external positions

🗑️ **Data:**
• \`clear signals\` - Delete all signals
• \`reset\` - Full database reset`,
    };
  }

  // Status command
  if (cmd === "status" || cmd === "статус") {
    const result = await callMainAPI("/api/trade/open?demo=true");
    if (result.success) {
      return {
        command: "status",
        success: true,
        message: `📊 **Status**\n\nMode: ${session.mode}\nExchange: ${session.selectedExchange}\nOpen Positions: ${result.count || 0}`,
        data: result,
      };
    }
    return { command: "status", success: false, message: "Failed to get status" };
  }

  // Positions command
  if (cmd === "позиции" || cmd === "positions") {
    const result = await callMainAPI("/api/trade/open?demo=true");
    if (result.success && result.positions) {
      let msg = `📊 **Open Positions** (${result.count})\n\n`;
      for (const pos of result.positions.slice(0, 10)) {
        const emoji = pos.direction === "LONG" ? "🟢" : "🔴";
        msg += `${emoji} ${pos.symbol} ${pos.direction}\n`;
        msg += `  Entry: $${pos.avgEntryPrice?.toLocaleString()}\n`;
        msg += `  Lev: ${pos.leverage}x\n\n`;
      }
      return { command: "positions", success: true, message: msg, data: result };
    }
    return { command: "positions", success: false, message: "No open positions" };
  }

  // Mode switching
  if (cmd === "demo") {
    session.mode = "DEMO";
    return { command: "mode", success: true, message: "🎮 Switched to DEMO mode" };
  }
  if (cmd === "real") {
    session.mode = "REAL";
    return { command: "mode", success: true, message: "💰 Switched to REAL mode" };
  }

  // Exchange selection
  const exchangeMatch = cmd.match(/exchange\s+(\w+)/);
  if (exchangeMatch) {
    session.selectedExchange = exchangeMatch[1];
    return { command: "exchange", success: true, message: `🏦 Exchange set to ${exchangeMatch[1].toUpperCase()}` };
  }

  // Sync positions
  if (cmd === "sync") {
    const result = await callMainAPI("/api/positions/sync", "POST");
    if (result.success) {
      return {
        command: "sync",
        success: true,
        message: `🔄 **Sync Complete**\n\nNew positions: ${result.newPositions || 0}\nAccounts checked: ${result.accountsChecked || 0}`,
        data: result,
      };
    }
    return { command: "sync", success: false, message: "Sync failed" };
  }

  // External positions
  if (cmd === "external" || cmd === "внешние") {
    const result = await callMainAPI("/api/positions/escort?status=PENDING_APPROVAL");
    if (result.success && result.positions?.length > 0) {
      let msg = `🔍 **External Positions** (${result.positions.length})\n\n`;
      for (const pos of result.positions) {
        msg += `• ${pos.symbol} ${pos.direction} @ ${pos.exchangeName}\n`;
      }
      return { command: "external", success: true, message: msg, data: result };
    }
    return { command: "external", success: true, message: "No pending external positions" };
  }

  // Close all positions
  if (cmd === "close all" || cmd === "закрыть все") {
    const result = await callMainAPI("/api/trade/close-all", "POST", { isDemo: session.mode === "DEMO" });
    if (result.success) {
      return {
        command: "close-all",
        success: true,
        message: `🚫 **Closed All Positions**\n\nClosed: ${result.closedCount || 0}\nPnL: $${result.totalPnL?.toFixed(2) || "0.00"}`,
        data: result,
      };
    }
    return { command: "close-all", success: false, message: "Failed to close positions" };
  }

  // Clear signals
  if (cmd === "clear signals" || cmd === "удалить сигналы") {
    const result = await callMainAPI("/api/chat/parse-signal", "POST", { message: "delete signals" });
    return {
      command: "clear-signals",
      success: result.success,
      message: result.message || "Signals cleared",
    };
  }

  // Reset database
  if (cmd === "reset" || cmd === "сброс" || cmd === "очистить базу") {
    const result = await callMainAPI("/api/chat/parse-signal", "POST", { message: "clear database" });
    return {
      command: "reset",
      success: result.success,
      message: result.message || "Database reset",
    };
  }

  return {
    command: "unknown",
    success: false,
    message: `Unknown command: ${command}\n\nType **help** for available commands.`,
  };
}

// ==================== Signal Execution ====================

async function executeSignal(signal: SignalData, session: UserSession): Promise<CommandResult> {
  const result = await callMainAPI("/api/trade/open", "POST", {
    ...signal,
    isDemo: session.mode === "DEMO",
    exchangeId: session.selectedExchange,
    amount: 100,
  });

  if (result.success) {
    return {
      command: "execute-signal",
      success: true,
      message: `✅ **Position Opened**\n\n${signal.symbol} ${signal.direction}\nExchange: ${session.selectedExchange}\nMode: ${session.mode}`,
      data: result,
    };
  }

  return {
    command: "execute-signal",
    success: false,
    message: `❌ Failed to execute signal: ${result.error || "Unknown error"}`,
  };
}

// ==================== External Position Discovery ====================

async function discoverExternalPositions(): Promise<ExternalPosition[]> {
  const result = await callMainAPI("/api/positions/sync", "POST");
  if (result.success && result.newPositions > 0) {
    const escortResult = await callMainAPI("/api/positions/escort?status=PENDING_APPROVAL");
    if (escortResult.success && escortResult.positions) {
      return escortResult.positions;
    }
  }
  return [];
}

// Poll for external positions every 60 seconds
setInterval(async () => {
  const positions = await discoverExternalPositions();
  if (positions.length > 0) {
    for (const pos of positions) {
      const message = addMessage({
        role: "notification",
        content: `🔍 **External Position Detected**\n\n${pos.symbol} ${pos.direction}\nExchange: ${pos.exchangeName}\nEntry: $${pos.avgEntryPrice.toLocaleString()}`,
        type: "external-position",
        data: pos,
      });
      io.emit("chat_message", message);
    }
  }
}, 60000);

// ==================== Risk Management Integration ====================

async function checkRiskAndNotify() {
  const result = await callMainAPI("/api/risk");
  if (result.success && result.data) {
    const risk = result.data;
    if (risk.riskLevel === "critical" || risk.riskLevel === "high") {
      const message = addMessage({
        role: "notification",
        content: `⚠️ **Risk Alert**\n\nRisk Level: ${risk.riskLevel.toUpperCase()}\nRisk Score: ${risk.riskScore}\nDrawdown: ${risk.drawdown?.state?.currentDrawdown?.toFixed(2)}%`,
        type: "notification",
        data: {
          type: "RISK_WARNING",
          title: "Risk Alert",
          message: `Risk level: ${risk.riskLevel}`,
          priority: risk.riskLevel === "critical" ? "critical" : "high",
        },
      });
      io.emit("chat_message", message);
    }
  }
}

// Check risk every 30 seconds
setInterval(checkRiskAndNotify, 30000);

// ==================== Initialize Socket.IO ====================

const io = new Server(PORT, {
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.length === 0) {
        const env = process.env.NODE_ENV || 'development';
        if (env === 'production') {
          callback(new Error('CORS policy: No origins configured'), false);
        } else {
          callback(null, true);
        }
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy: Origin not allowed'), false);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(`Oracle Chat Service running on port ${PORT}`);
console.log(`CORS allowed origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'All (development only)'}`);

// ==================== Socket.IO Event Handlers ====================

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Create session
  const session: UserSession = {
    id: socket.id,
    mode: "DEMO",
    selectedExchange: "binance",
    connectedAt: new Date(),
    lastActivity: new Date(),
  };
  sessions.set(socket.id, session);

  // Send welcome message
  const welcomeMessage = addMessage({
    role: "bot",
    content: `👋 Welcome to **Oracle** - AI Trading Assistant\n\n📌 **Features:**\n• Send signals in Cornix format\n• Real-time position tracking\n• Risk management alerts\n• External position discovery\n\nType **help** for commands.\n🔮 *I see signals where others see chaos.*`,
    type: "signal",
  });
  socket.emit("chat_message", welcomeMessage);

  // Send message history
  socket.emit("message_history", messageHistory.slice(0, 20));

  // Handle incoming messages
  socket.on("send_message", async (data: { content: string }) => {
    session.lastActivity = new Date();

    // Add user message
    const userMessage = addMessage({
      role: "user",
      content: data.content,
    });
    io.emit("chat_message", userMessage);

    // Try to parse as command
    if (data.content.startsWith("/") || data.content.length < 50 || /^[a-zа-яё\s]+$/i.test(data.content)) {
      const result = await handleCommand(data.content, session);
      const botMessage = addMessage({
        role: result.success ? "bot" : "system",
        content: result.message,
        type: result.success ? "command" : "error",
        data: result,
      });
      io.emit("chat_message", botMessage);
      return;
    }

    // Try to parse as signal
    const signal = parseSignal(data.content);
    if (signal && signal.entryPrices.length > 0) {
      const result = await executeSignal(signal, session);
      const botMessage = addMessage({
        role: result.success ? "bot" : "system",
        content: result.message,
        type: result.success ? "signal" : "error",
        data: result,
      });
      io.emit("chat_message", botMessage);
      return;
    }

    // Try main API parser
    const parseResult = await callMainAPI("/api/chat/parse-signal", "POST", { message: data.content });
    if (parseResult.success && parseResult.signal) {
      const result = await executeSignal(parseResult.signal, session);
      const botMessage = addMessage({
        role: result.success ? "bot" : "system",
        content: result.message,
        type: result.success ? "signal" : "error",
        data: result,
      });
      io.emit("chat_message", botMessage);
      return;
    }

    // Unknown message
    const errorMessage = addMessage({
      role: "system",
      content: `❓ Could not parse message.\n\nType **help** for available commands or send a signal in Cornix format.`,
      type: "error",
    });
    io.emit("chat_message", errorMessage);
  });

  // Handle signal execution
  socket.on("execute_signal", async (data: { signal: SignalData }) => {
    session.lastActivity = new Date();
    const result = await executeSignal(data.signal, session);
    const message = addMessage({
      role: result.success ? "bot" : "system",
      content: result.message,
      type: result.success ? "signal" : "error",
      data: result,
    });
    io.emit("chat_message", message);
  });

  // Handle mode change
  socket.on("set_mode", (data: { mode: "DEMO" | "REAL" }) => {
    session.mode = data.mode;
    const message = addMessage({
      role: "system",
      content: `Mode changed to **${data.mode}**`,
      type: "notification",
    });
    socket.emit("chat_message", message);
  });

  // Handle exchange change
  socket.on("set_exchange", (data: { exchange: string }) => {
    session.selectedExchange = data.exchange;
    const message = addMessage({
      role: "system",
      content: `Exchange set to **${data.exchange}**`,
      type: "notification",
    });
    socket.emit("chat_message", message);
  });

  // Handle position escort (accept/ignore external positions)
  socket.on("escort_position", async (data: { positionId: string; action: "accept" | "ignore" }) => {
    const result = await callMainAPI("/api/positions/escort", "POST", {
      externalPositionId: data.positionId,
      action: data.action,
    });

    const message = addMessage({
      role: result.success ? "bot" : "system",
      content: result.success
        ? `✅ Position ${data.action === "accept" ? "accepted for escort" : "ignored"}`
        : `❌ Failed to ${data.action} position`,
      type: "notification",
    });
    io.emit("chat_message", message);
  });

  // Handle sync request
  socket.on("sync_positions", async () => {
    const positions = await discoverExternalPositions();
    if (positions.length > 0) {
      for (const pos of positions) {
        const message = addMessage({
          role: "notification",
          content: `🔍 **External Position**\n\n${pos.symbol} ${pos.direction}\nExchange: ${pos.exchangeName}`,
          type: "external-position",
          data: pos,
        });
        socket.emit("chat_message", message);
      }
    } else {
      const message = addMessage({
        role: "bot",
        content: "🔄 No new external positions found",
        type: "notification",
      });
      socket.emit("chat_message", message);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    sessions.delete(socket.id);
  });
});

// ==================== Risk Monitor Integration ====================

// Connect to risk monitor and forward alerts
async function connectToRiskMonitor() {
  try {
    // Poll risk monitor for alerts
    setInterval(async () => {
      try {
        const response = await fetch("http://localhost:3004/?XTransformPort=3004", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        // Risk monitor broadcasts via socket.io, we handle via API
      } catch {
        // Risk monitor not available
      }
    }, 60000);
  } catch (error) {
    console.error("[ChatService] Risk monitor connection error:", error);
  }
}

connectToRiskMonitor();

// ==================== Graceful Shutdown ====================

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  io.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

console.log("Oracle Chat Service initialized");
console.log("Features: WebSocket chat, signal parsing, real trading, risk integration");
