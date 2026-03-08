/**
 * Bot Monitor WebSocket Service
 * Real-time monitoring of bot status, positions, and trades
 *
 * Port: 3003
 */

import { Server } from "socket.io";

const PORT = 3003;

// CORS Configuration
const getAllowedOrigins = (): string[] => {
  const env = process.env.NODE_ENV || 'development';
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  if (allowedOriginsEnv) {
    return allowedOriginsEnv.split(',').map(origin => origin.trim()).filter(Boolean);
  }

  if (env === 'production') {
    console.error(
      '[SECURITY] ALLOWED_ORIGINS not set in production. ' +
      'CORS will block all cross-origin requests.'
    );
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

// Types
interface BotStatus {
  id: string;
  type: string;
  name: string;
  status: string;
  exchangeId: string;
  symbol: string;
  mode: string;
  metrics: {
    totalTrades: number;
    totalPnL: number;
    unrealizedPnL: number;
    winRate: number;
  };
  lastUpdate: Date;
}

interface BotEvent {
  type: 'status_change' | 'trade' | 'position_update' | 'error' | 'log';
  botId: string;
  data: any;
  timestamp: Date;
}

// In-memory bot registry
const botRegistry = new Map<string, BotStatus>();
const eventHistory: BotEvent[] = [];

// Initialize Socket.IO server
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

console.log(`Bot Monitor Service running on port ${PORT}`);
console.log(`CORS allowed origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'All (development only)'}`);

// ==================== Helper Functions ====================

function broadcastBotUpdate(botId: string, update: Partial<BotStatus>) {
  const bot = botRegistry.get(botId);
  if (bot) {
    Object.assign(bot, update, { lastUpdate: new Date() });
    io.emit('bot_update', bot);
  }
}

function addEvent(event: BotEvent) {
  eventHistory.push(event);
  // Keep only last 1000 events
  if (eventHistory.length > 1000) {
    eventHistory.shift();
  }
  io.emit('bot_event', event);
}

// ==================== API Simulation Functions ====================

// These would normally call the Next.js API
async function fetchBotStatus(botId: string): Promise<BotStatus | null> {
  // Simulate API call - in production, this would fetch from database
  return botRegistry.get(botId) || null;
}

async function fetchActiveBots(): Promise<BotStatus[]> {
  return Array.from(botRegistry.values());
}

// ==================== Bot Monitoring Loop ====================

async function monitorBots() {
  for (const [botId, bot] of botRegistry) {
    if (bot.status === 'RUNNING') {
      // Simulate metrics update
      const pnlChange = (Math.random() - 0.5) * 100;

      bot.metrics.unrealizedPnL += pnlChange;
      bot.lastUpdate = new Date();

      // Broadcast update
      io.emit('bot_metrics', {
        botId,
        metrics: bot.metrics,
        timestamp: new Date(),
      });

      // Random trade simulation
      if (Math.random() < 0.05) {
        const trade = {
          id: `trade-${Date.now()}`,
          botId,
          symbol: bot.symbol,
          side: Math.random() > 0.5 ? 'BUY' : 'SELL',
          amount: (Math.random() * 0.1).toFixed(4),
          price: 65000 + (Math.random() - 0.5) * 1000,
          pnl: pnlChange,
          timestamp: new Date(),
        };

        bot.metrics.totalTrades++;
        bot.metrics.totalPnL += trade.pnl;

        addEvent({
          type: 'trade',
          botId,
          data: trade,
          timestamp: new Date(),
        });
      }
    }
  }
}

// Start monitoring interval
setInterval(monitorBots, 5000);

// ==================== Demo Data ====================

function initDemoBots() {
  const demoBots: BotStatus[] = [
    {
      id: 'grid-bot-1',
      type: 'grid',
      name: 'BTC Grid Master',
      status: 'RUNNING',
      exchangeId: 'binance',
      symbol: 'BTCUSDT',
      mode: 'PAPER',
      metrics: {
        totalTrades: 156,
        totalPnL: 2340.50,
        unrealizedPnL: 125.30,
        winRate: 0.68,
      },
      lastUpdate: new Date(),
    },
    {
      id: 'dca-bot-1',
      type: 'dca',
      name: 'ETH DCA Accumulator',
      status: 'RUNNING',
      exchangeId: 'bybit',
      symbol: 'ETHUSDT',
      mode: 'PAPER',
      metrics: {
        totalTrades: 45,
        totalPnL: 890.20,
        unrealizedPnL: -45.10,
        winRate: 0.75,
      },
      lastUpdate: new Date(),
    },
    {
      id: 'bb-bot-1',
      type: 'bb',
      name: 'BB Signal Trader',
      status: 'PAUSED',
      exchangeId: 'okx',
      symbol: 'SOLUSDT',
      mode: 'PAPER',
      metrics: {
        totalTrades: 89,
        totalPnL: 1560.80,
        unrealizedPnL: 0,
        winRate: 0.62,
      },
      lastUpdate: new Date(),
    },
  ];

  for (const bot of demoBots) {
    botRegistry.set(bot.id, bot);
  }

  console.log(`Initialized ${demoBots.length} demo bots`);
}

initDemoBots();

// ==================== Socket.IO Event Handlers ====================

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial data
  socket.emit("initial_data", {
    bots: Array.from(botRegistry.values()),
    events: eventHistory.slice(-50),
  });

  // Handle bot status request
  socket.on("get_bot_status", async (botId: string) => {
    const bot = await fetchBotStatus(botId);
    socket.emit("bot_status", bot);
  });

  // Handle all bots request
  socket.on("get_all_bots", async () => {
    const bots = await fetchActiveBots();
    socket.emit("all_bots", bots);
  });

  // Handle bot start request
  socket.on("start_bot", async (data: { botId: string }) => {
    const bot = botRegistry.get(data.botId);
    if (bot) {
      bot.status = 'RUNNING';
      bot.lastUpdate = new Date();

      addEvent({
        type: 'status_change',
        botId: data.botId,
        data: { status: 'RUNNING' },
        timestamp: new Date(),
      });

      io.emit('bot_update', bot);
    }
  });

  // Handle bot stop request
  socket.on("stop_bot", async (data: { botId: string }) => {
    const bot = botRegistry.get(data.botId);
    if (bot) {
      bot.status = 'STOPPED';
      bot.lastUpdate = new Date();

      addEvent({
        type: 'status_change',
        botId: data.botId,
        data: { status: 'STOPPED' },
        timestamp: new Date(),
      });

      io.emit('bot_update', bot);
    }
  });

  // Handle bot pause request
  socket.on("pause_bot", async (data: { botId: string }) => {
    const bot = botRegistry.get(data.botId);
    if (bot) {
      bot.status = 'PAUSED';
      bot.lastUpdate = new Date();

      addEvent({
        type: 'status_change',
        botId: data.botId,
        data: { status: 'PAUSED' },
        timestamp: new Date(),
      });

      io.emit('bot_update', bot);
    }
  });

  // Handle manual trade execution
  socket.on("execute_trade", async (data: {
    botId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    amount: number;
    price?: number;
  }) => {
    const bot = botRegistry.get(data.botId);
    if (bot && bot.status === 'RUNNING') {
      const trade = {
        id: `trade-${Date.now()}`,
        botId: data.botId,
        symbol: data.symbol,
        side: data.side,
        amount: data.amount,
        price: data.price || 65000 + (Math.random() - 0.5) * 1000,
        pnl: (Math.random() - 0.5) * 200,
        timestamp: new Date(),
        manual: true,
      };

      bot.metrics.totalTrades++;
      bot.metrics.totalPnL += trade.pnl;

      addEvent({
        type: 'trade',
        botId: data.botId,
        data: trade,
        timestamp: new Date(),
      });
    }
  });

  // Handle subscribe to specific bot
  socket.on("subscribe_bot", (botId: string) => {
    socket.join(`bot:${botId}`);
    const bot = botRegistry.get(botId);
    if (bot) {
      socket.emit("bot_update", bot);
    }
  });

  // Handle unsubscribe
  socket.on("unsubscribe_bot", (botId: string) => {
    socket.leave(`bot:${botId}`);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ==================== Graceful Shutdown ====================

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  io.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

console.log("Bot Monitor Service initialized");
console.log("Features: Real-time bot status, trade notifications, position updates");
