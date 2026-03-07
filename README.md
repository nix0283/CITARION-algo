# CITARION - Algorithmic Trading Platform

> **Professional-grade algorithmic trading platform with AI-powered analytics, multi-exchange support, and institutional features for VIP clients.**

![Next.js](https://img.shields.io/badge/Next.js%2016-000000?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript%205-3178C6?style=flat&logo=typescript)
![Python](https://img.shields.io/badge/Python%203.11-3776AB?style=flat&logo=python)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%204-06B6D4?style=flat&logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

---

## 🎯 Overview

CITARION is a comprehensive **algorithmic trading platform** designed for professional traders and VIP clients, featuring:

- **17 Specialized Trading Bots** - Grid, DCA, Arbitrage, HFT, ML-based, and more
- **5 Exchange Integrations** - Binance, Bybit, OKX, Bitget, BingX (Real API Clients)
- **Hybrid Architecture** - Next.js frontend + Python ML microservices
- **Real-time ML Predictions** - WebSocket-based prediction streaming
- **Copy Trading Support** - Master Trader and Follower modes with full API integration
- **AI/ML Analytics** - Deep learning, sentiment analysis, predictive models

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CITARION ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐   │
│   │   Next.js 16    │     │  Python ML      │     │    Exchange         │   │
│   │   Frontend      │────▶│  Services       │────▶│    APIs             │   │
│   │   (Port 3000)   │     │  (Ports 3006+)  │     │    (REST/WS)        │   │
│   └─────────────────┘     └─────────────────┘     └─────────────────────┘   │
│          │                        │                                         │
│          │                        │                                         │
│          ▼                        ▼                                         │
│   ┌─────────────────┐     ┌─────────────────┐                              │
│   │   SQLite/       │     │   TensorFlow    │                              │
│   │   Prisma ORM    │     │   scikit-learn  │                              │
│   └─────────────────┘     │   PyTorch       │                              │
│                           └─────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Microservices

| Service | Port | Technology | Description |
|---------|------|------------|-------------|
| **Main App** | 3000 | Next.js 16 | Dashboard & API Gateway |
| **ML Service** | 3006 | Python/FastAPI | Price prediction, signal classification, regime detection |
| **RL Service** | 3007 | Python/FastAPI | Reinforcement learning agents (PPO, SAC, DQN) |
| **Price Service** | 3002 | Bun/TypeScript | Real-time price feeds |
| **Bot Monitor** | 3003 | Bun/TypeScript | WebSocket bot monitoring |
| **Risk Monitor** | 3004 | Bun/TypeScript | Risk management WebSocket |
| **Chat Service** | 3005 | Bun/TypeScript | Oracle chat system |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** or **Bun** (recommended)
- **Python 3.11+**
- **pip** or **uv** (Python package manager)

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd citarion-project

# Install Node.js dependencies
bun install

# Install Python dependencies (IMPORTANT!)
pip install -r requirements.txt
```

### 2. Setup Database

```bash
# Push database schema
bun run db:push
```

### 3. Install shadcn/ui Components

```bash
npx shadcn@latest add accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button calendar carousel chart checkbox collapsible command context-menu dialog drawer dropdown-menu form hover-card input input-otp label menubar navigation-menu pagination popover progress radio-group resizable scroll-area select separator sheet sidebar skeleton slider sonner switch table tabs textarea toast toggle toggle-group tooltip
```

### 4. Start Services

```bash
# Start Next.js development server (automatically started)
bun run dev

# Start Python ML services (in a separate terminal)
cd mini-services/ml-service
python main.py

# Or start all Python services at once
./start-services.sh all
```

### 5. Open Dashboard

Open your browser and navigate to the **Preview Panel** on the right side of this interface, or click the **"Open in New Tab"** button above the Preview Panel.

---

## 📊 Trading Bots (17 Types)

| Bot Type | Description | ML Integration | Exchange Support |
|----------|-------------|----------------|------------------|
| **Grid Bot** | Grid trading with auto-levels | ❌ Direction-agnostic | All 5 exchanges |
| **DCA Bot** | Dollar-cost averaging | ✅ Entry timing | All 5 exchanges |
| **BB Bot** | Bollinger Bands oscillator | ✅ Breakout classification | All 5 exchanges |
| **Trend Bot** | Trend-following strategies | Indirect (via LOGOS) | All 5 exchanges |
| **Arbitrage Bot** | Cross-exchange arbitrage | ❌ N/A | Multi-exchange |
| **HFT/MFT/LFT Bot** | High/Medium/Low frequency | ❌ Latency critical | All 5 exchanges |
| **Wolf Bot** | Wolf pack hunting algorithm | Indirect (via LOGOS) | All 5 exchanges |
| **Frequency Bot** | Signal frequency analysis | Indirect (via LOGOS) | All 5 exchanges |
| **Argus Bot** | AI-powered signal detection | Indirect (via LOGOS) | All 5 exchanges |
| **Orion Bot** | Multi-strategy orchestrator | ✅ Trend confirmation | All 5 exchanges |
| **Vision Bot** | Computer vision patterns | ✅ Built-in Ensemble | All 5 exchanges |
| **Range Bot** | Range-bound trading | Indirect (via LOGOS) | All 5 exchanges |
| **Kron Bot** | Kronos time-based strategies | Indirect (via LOGOS) | All 5 exchanges |
| **Architect Bot** | Strategy builder & backtester | Indirect (via LOGOS) | All 5 exchanges |
| **Equilibrist Bot** | Balance-based strategies | Indirect (via LOGOS) | All 5 exchanges |
| **Lumibot** | Lumibot framework integration | Indirect (via LOGOS) | All 5 exchanges |
| **Logos Bot** | Self-learning AI meta bot | ✅ Core (ML-weighted) | All 5 exchanges |

---

## 🤖 ML Service

The ML Service provides real-time predictions via REST API and WebSocket.

### REST API Endpoints

```bash
# Health check
curl http://localhost:3006/health

# Price prediction
curl -X POST http://localhost:3006/api/v1/predict/price \
  -H "Content-Type: application/json" \
  -d '{"features": [[[...]]]}'

# Signal classification
curl -X POST http://localhost:3006/api/v1/predict/signal \
  -H "Content-Type: application/json" \
  -d '{"features": [[...]]}'

# Regime detection
curl -X POST http://localhost:3006/api/v1/predict/regime \
  -H "Content-Type: application/json" \
  -d '{"observations": [[...]]}'
```

### WebSocket Connection

```javascript
// Connect to ML Service WebSocket
const ws = new WebSocket('ws://localhost:3006/ws');

// Subscribe to predictions
ws.send(JSON.stringify({
  type: 'subscribe_predictions',
  data: { channels: ['price_predictions', 'signal_predictions'] }
}));

// Request on-demand prediction
ws.send(JSON.stringify({
  type: 'prediction_request',
  data: { prediction_type: 'price', features: [[[...]]] }
}));

// Listen for predictions
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'prediction') {
    console.log('Received prediction:', message.data);
  }
};
```

### ML Models

| Model | Purpose | Input | Output |
|-------|---------|-------|--------|
| **Price Predictor** | LSTM + Attention for price direction | Sequence of OHLCV | Price change predictions (1m, 5m, 15m, 1h) |
| **Signal Classifier** | Gradient Boosting for signal type | Technical indicators | BUY/SELL/HOLD with confidence |
| **Regime Detector** | Hidden Markov Model | Returns, volatility, volume | BULL/BEAR/SIDEWAYS regime |

---

## 🔗 Exchange Connectivity

| Exchange | Trading | Testnet | Demo | Real API Client |
|----------|---------|---------|------|-----------------|
| **Binance** | ✅ | ✅ | ❌ | ✅ Full Implementation |
| **Bybit** | ✅ | ✅ | ❌ | ✅ V5 API Support |
| **OKX** | ✅ | ❌ | ✅ | ✅ Demo Mode Support |
| **Bitget** | ✅ | ❌ | ✅ | ✅ Full Implementation |
| **BingX** | ✅ | ❌ | ✅ | ✅ Full Implementation |

---

## 📁 Project Structure

```
citarion-project/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # API Routes
│   │   │   ├── ml/               # ML Integration APIs
│   │   │   ├── bots/             # Bot management
│   │   │   └── ...
│   │   └── page.tsx              # Main dashboard
│   ├── components/
│   │   ├── bots/                 # Bot panels (17 types)
│   │   ├── ml/                   # ML Components
│   │   └── ui/                   # shadcn/ui components
│   └── lib/
│       ├── ml/                   # ML Services
│       ├── exchange/             # Exchange clients
│       ├── vision-bot/           # Vision Bot with real data
│       └── db.ts                 # Prisma client
├── mini-services/                # Python Microservices
│   ├── ml-service/               # ML Service (port 3006)
│   │   ├── main.py               # FastAPI application
│   │   ├── api/
│   │   │   ├── routes.py         # REST API routes
│   │   │   └── websocket.py      # WebSocket endpoint
│   │   ├── models/               # ML models
│   │   └── requirements.txt      # Python dependencies
│   └── rl-service/               # RL Service (port 3007)
├── prisma/
│   └── schema.prisma             # Database schema
├── requirements.txt              # Root Python dependencies
├── start-services.sh             # Python services startup script
└── README.md                     # This file
```

---

## 🔧 Development

### Run Linter

```bash
bun run lint
```

### Type Check

```bash
bun run type-check
```

### Database Operations

```bash
bun run db:push    # Push schema changes
bun run db:studio  # Open Prisma Studio
```

### Python Virtual Environment (Recommended)

```bash
# Create virtual environment
python -m venv venv

# Activate (Linux/macOS)
source venv/bin/activate

# Activate (Windows)
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## 📦 Environment Variables

```env
# Database
DATABASE_URL="file:./dev.db"

# NextAuth
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# Exchange API Keys (optional, configure in UI)
BINANCE_API_KEY=""
BINANCE_API_SECRET=""
BYBIT_API_KEY=""
BYBIT_API_SECRET=""
OKX_API_KEY=""
OKX_API_SECRET=""
OKX_PASSPHRASE=""
BITGET_API_KEY=""
BITGET_API_SECRET=""
BITGET_PASSPHRASE=""
BINGX_API_KEY=""
BINGX_API_SECRET=""

# ML Service
ML_SERVICE_URL="http://localhost:3006"
```

---

## 🔄 WebSocket Integration

The platform uses WebSocket for real-time communication:

### ML Predictions (Port 3006)

```typescript
// TypeScript client
import { getMLServiceClient } from '@/lib/vision-bot/ml-service-client';

const client = getMLServiceClient();

// Health check
const health = await client.healthCheck();

// Price prediction
const prediction = await client.predictPrice({
  features: [[sequence_data]],
  returnConfidence: true
});
```

### Bot Monitor (Port 3003)

```typescript
import { useBotMonitor } from '@/hooks/use-bot-monitor';

const { events, botStatuses, isConnected } = useBotMonitor();
```

---

## 📚 Documentation

### ML Integration
- [ML Bot Integration](docs/ML_BOT_INTEGRATION.md) - Bot-specific ML services
- [ML Integration Guide](docs/ML_INTEGRATION.md) - Lawrence Classifier integration
- [ML Signal Pipeline](docs/ML_SIGNAL_PIPELINE.md) - Signal enhancement pipeline

### Architecture
- [Trading System Architecture](docs/TRADING_SYSTEM_ARCHITECTURE.md) - System overview
- [LOGOS Bot](docs/LOGOS_BOT.md) - Meta bot documentation
- [Bot Manager API](docs/BOT_MANAGER_API.md) - Bot management

### Exchange Integration
- [Exchange Integration](docs/exchanges/README.md) - Exchange API guides
- [Copy Trading API](docs/copy-trading.md) - Full copy trading documentation

---

## 📋 Recent Updates

### ML Service WebSocket Integration
- ✅ Real-time prediction streaming via WebSocket
- ✅ Subscription channels for price, signal, and regime predictions
- ✅ Connection manager with heartbeat and stale client cleanup
- ✅ On-demand prediction requests
- ✅ TypeScript client with retry logic

### Vision Bot Real Data
- ✅ Real market data provider replacing synthetic data
- ✅ Multi-exchange data fetching with fallback
- ✅ Database caching for OHLCV candles
- ✅ Feature engineering for ML models

### Risk Management
- ✅ Kill Switch for all bot types
- ✅ Real-time portfolio data from exchanges
- ✅ GARCH-VaR integration
- ✅ WebSocket risk monitor

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

---

## 📞 Support

- **Documentation**: `/docs` folder
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

---

Built with ❤️ for algorithmic traders. Powered by Next.js, TypeScript, Python, and AI.
