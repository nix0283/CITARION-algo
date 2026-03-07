import { Server } from "socket.io";

const PORT = 3002;

// CORS Configuration - Production Ready
// Set ALLOWED_ORIGINS environment variable for production
// Example: ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,https://app.citarion.com
const getAllowedOrigins = (): string[] => {
  const env = process.env.NODE_ENV || 'development';
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  
  if (allowedOriginsEnv) {
    return allowedOriginsEnv.split(',').map(origin => origin.trim()).filter(Boolean);
  }
  
  // Default origins based on environment
  if (env === 'production') {
    console.error(
      '[SECURITY] ALLOWED_ORIGINS not set in production. ' +
      'CORS will block all cross-origin requests. ' +
      'Set ALLOWED_ORIGINS environment variable.'
    );
    return []; // Block all cross-origin requests in production
  }
  
  // Development defaults
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];
};

const allowedOrigins = getAllowedOrigins();

// Supported exchanges
const EXCHANGES = {
  binance: {
    name: "Binance",
    spot: {
      wsUrl: "wss://stream.binance.com:9443/ws",
      symbols: ["btcusdt", "ethusdt", "bnbusdt", "solusdt", "xrpusdt", "dogeusdt"],
    },
    futures: {
      wsUrl: "wss://fstream.binance.com/ws",
      symbols: ["btcusdt", "ethusdt", "bnbusdt", "solusdt", "xrpusdt", "dogeusdt"],
    },
  },
  bybit: {
    name: "Bybit",
    spot: {
      wsUrl: "wss://stream.bybit.com/v5/public/spot",
      symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
    },
    futures: {
      wsUrl: "wss://stream.bybit.com/v5/public/linear",
      symbols: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
    },
  },
  okx: {
    name: "OKX",
    spot: {
      wsUrl: "wss://ws.okx.com:8443/ws/v5/public",
      symbols: ["BTC-USDT", "ETH-USDT", "SOL-USDT"],
    },
    futures: {
      wsUrl: "wss://ws.okx.com:8443/ws/v5/public",
      symbols: ["BTC-USDT-SWAP", "ETH-USDT-SWAP"],
    },
  },
};

interface PriceData {
  exchange: string;
  type: string;
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

// Store latest prices by exchange
const pricesByExchange: Record<string, Record<string, PriceData>> = {};

// Initialize Socket.IO server with secure CORS
const io = new Server(PORT, {
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.length === 0) {
        // No origins configured - reject in production, allow in dev
        const env = process.env.NODE_ENV || 'development';
        if (env === 'production') {
          console.error(`[CORS] Blocked request from origin: ${origin} (no allowed origins configured)`);
          callback(new Error('CORS policy: No origins configured'), false);
        } else {
          callback(null, true);
        }
        return;
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
        callback(new Error('CORS policy: Origin not allowed'), false);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(`Multi-Exchange Price Service running on port ${PORT}`);
console.log(`CORS allowed origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'All (development only)'}`);

// Connect to Binance WebSocket
function connectToBinance(type: "spot" | "futures") {
  const config = EXCHANGES.binance[type];
  if (!config) return;

  const streams = config.symbols.map((s) => `${s}@ticker`).join("/");
  const wsUrl = `${config.wsUrl}/${streams}`;

  console.log(`Connecting to Binance ${type}...`);

  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const symbol = data.s?.toUpperCase();

      if (symbol) {
        const priceData: PriceData = {
          exchange: "binance",
          type,
          symbol: symbol,
          price: parseFloat(data.c),
          change24h: parseFloat(data.P),
          high24h: parseFloat(data.h),
          low24h: parseFloat(data.l),
          volume24h: parseFloat(data.v) * parseFloat(data.c),
        };

        const key = `binance_${type}`;
        if (!pricesByExchange[key]) pricesByExchange[key] = {};
        pricesByExchange[key][symbol] = priceData;

        // Emit to clients
        io.emit("price_update", priceData);
      }
    } catch (error) {
      // Ignore parse errors
    }
  };

  ws.onerror = (error) => {
    console.error(`Binance ${type} WebSocket error:`, error);
  };

  ws.onclose = () => {
    console.log(`Binance ${type} WebSocket closed, reconnecting in 5s...`);
    setTimeout(() => connectToBinance(type), 5000);
  };
}

// Connect to Bybit WebSocket
function connectToBybit(type: "spot" | "futures") {
  const config = EXCHANGES.bybit[type];
  if (!config) return;

  console.log(`Connecting to Bybit ${type}...`);

  const ws = new WebSocket(config.wsUrl);

  // Subscribe to ticker channel
  ws.onopen = () => {
    console.log(`Bybit ${type} connected, subscribing...`);
    const subscribeMsg = {
      op: "subscribe",
      args: config.symbols.map((s) => `tickers.${s}`),
    };
    ws.send(JSON.stringify(subscribeMsg));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.topic && data.topic.startsWith("tickers.")) {
        const ticker = data.data;
        const symbol = ticker.symbol;

        const priceData: PriceData = {
          exchange: "bybit",
          type,
          symbol: symbol,
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.price24hPcnt) * 100,
          high24h: parseFloat(ticker.highPrice24h),
          low24h: parseFloat(ticker.lowPrice24h),
          volume24h: parseFloat(ticker.volume24h) * parseFloat(ticker.lastPrice),
        };

        const key = `bybit_${type}`;
        if (!pricesByExchange[key]) pricesByExchange[key] = {};
        pricesByExchange[key][symbol] = priceData;

        io.emit("price_update", priceData);
      }
    } catch (error) {
      // Ignore parse errors
    }
  };

  ws.onerror = (error) => {
    console.error(`Bybit ${type} WebSocket error:`, error);
  };

  ws.onclose = () => {
    console.log(`Bybit ${type} WebSocket closed, reconnecting in 5s...`);
    setTimeout(() => connectToBybit(type), 5000);
  };
}

// Connect to all exchanges
function connectAllExchanges() {
  // Binance
  connectToBinance("spot");
  connectToBinance("futures");

  // Bybit
  connectToBybit("spot");
  connectToBybit("futures");
}

// Start connections
connectAllExchanges();

// Handle client connections
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send all current prices
  socket.emit("initial_prices", pricesByExchange);

  // Handle exchange subscription
  socket.on("subscribe_exchange", (data: { exchange: string; type: string }) => {
    const key = `${data.exchange}_${data.type}`;
    if (pricesByExchange[key]) {
      socket.emit("exchange_prices", {
        exchange: data.exchange,
        type: data.type,
        prices: pricesByExchange[key],
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Simulate prices as fallback
function simulatePrices() {
  const basePrices: Record<string, number> = {
    BTCUSDT: 67432.5,
    ETHUSDT: 3521.8,
    BNBUSDT: 598.45,
    SOLUSDT: 172.3,
    XRPUSDT: 0.5234,
    DOGEUSDT: 0.1542,
  };

  Object.entries(basePrices).forEach(([symbol, basePrice]) => {
    const changePercent = (Math.random() - 0.5) * 0.1;
    const price = basePrice * (1 + changePercent / 100);

    const priceData: PriceData = {
      exchange: "binance",
      type: "futures",
      symbol,
      price,
      change24h: (Math.random() - 0.5) * 10,
      high24h: price * 1.02,
      low24h: price * 0.98,
      volume24h: Math.random() * 1000000000,
    };

    io.emit("price_update", priceData);
  });
}

// Fallback simulation
setInterval(() => {
  if (Object.keys(pricesByExchange).length === 0) {
    simulatePrices();
  }
}, 1000);

console.log("Multi-exchange price service initialized");
console.log("Supported exchanges: Binance (spot/futures), Bybit (spot/futures)");
