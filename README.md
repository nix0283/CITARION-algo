# CITARION - Institutional Trading Platform

> **Next-generation algorithmic trading platform with AI-powered analytics, multi-exchange support, and institutional-grade features.**

![Next.js](https://img.shields.io/badge/Next.js%2016-000000?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript%205-3178C6?style=flat&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%204-06B6D4?style=flat&logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

---

## 🎯 Overview

CITARION is a comprehensive algorithmic trading platform designed for institutional traders, featuring:

- **17 Specialized Trading Bots** - Grid, DCA, Arbitrage, HFT, ML-based, and more
- **5 Exchange Integrations** - Binance, Bybit, OKX, Bitget, BingX (Real API Clients)
- **ML Integration Ecosystem** - Lawrence Classifier, Bot-specific ML, LOGOS Aggregation
- **Copy Trading Support** - Master Trader and Follower modes with full API integration
- **AI/ML Analytics** - Deep learning, sentiment analysis, predictive models
- **Real-time Dashboard** - Professional trading terminal with live data
- **WebSocket Monitoring** - Real-time bot status and trade notifications

---

## 🚀 Key Features

### 📊 Trading Bots (17 Types)

| Bot Type | Description | ML Integration | Exchange Support |
|----------|-------------|----------------|------------------|
| **Grid Bot** | Grid trading with auto-levels | ❌ Direction-agnostic | All 5 exchanges |
| **DCA Bot** | Dollar-cost averaging | ✅ Entry timing | All 5 exchanges |
| **BB Bot** | Bollinger Bands oscillator | ✅ Breakout classification | All 5 exchanges |
| **Trend Bot** | Trend-following strategies | Indirect (via LOGOS) | All 5 exchanges |
| **Arbitrage Bot** | Cross-exchange arbitrage | ❌ N/A | Multi-exchange |
| **HFT/MFT/LFT Bot** | High/Medium/Low frequency trading | ❌ Latency critical | All 5 exchanges |
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
| **Logos Bot** | Self-learning AI meta bot | ✅ Core (ML-weighted aggregation) | All 5 exchanges |
| **Zenbot Engine** | Strategy execution engine | ✅ Signal filtering | All 5 exchanges |

### 🤖 ML Integration Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ML INTEGRATION ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌───────────────┐    ┌─────────────────┐    ┌─────────────────────────┐   │
│   │   Trading     │    │  ML Bot         │    │  Enhanced Signal        │   │
│   │     Bots      │───▶│  Integration    │───▶│  Output                 │   │
│   └───────────────┘    └─────────────────┘    └─────────────────────────┘   │
│          │                      │                       │                    │
│          │                      ▼                       │                    │
│          │            ┌─────────────────┐              │                    │
│          │            │ Lawrence        │              │                    │
│          │            │ Classifier      │              │                    │
│          │            │ (k-NN Lorentzian)│             │                    │
│          │            └─────────────────┘              │                    │
│          │                      │                       │                    │
│          │                      ▼                       ▼                    │
│          │            ┌─────────────────┐    ┌─────────────────────────┐   │
│          └───────────▶│  ML-Enhanced    │───▶│  Backtesting            │   │
│                       │  LOGOS Engine   │    │  Validation             │   │
│                       └─────────────────┘    └─────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Lawrence Classifier
- k-NN classifier using Lorentzian distance for robust outlier handling
- Feature extraction: RSI, CCI, WaveTrend, ADX, Volume
- Built-in filters: Regime, ADX, Volatility
- Confidence calibration and weighted voting

#### Bot-Specific ML Services
| Bot | ML Analysis Type | Benefits |
|-----|-----------------|----------|
| **DCA** | Entry timing, market phase detection | Better level selection, phase-aware DCA |
| **BB** | Breakout classification | Distinguish Genuine/False/Squeeze breakouts |
| **ORION** | Trend confirmation, EMA alignment | Higher quality trend signals |
| **Zenbot** | Signal filtering, strategy fit | Improved signal quality scoring |

#### Gradient Boosting Integration
- Real-time feature extraction (18 features) from exchange data
- Signal quality scoring with confidence adjustment
- Training data collection with real trade outcomes
- Integration with DCA, BB, ORION, Zenbot bots
- LOGOS engine weighted aggregation support

#### ML Filter Modes
| Mode | Min Confidence | Use Case |
|------|----------------|----------|
| **STRICT** | 0.6 | Conservative, high precision |
| **MODERATE** | 0.4 | Balanced precision/recall |
| **LENIENT** | 0.25 | Aggressive, high recall |

### 🔗 Exchange Connectivity

| Exchange | Trading | Testnet | Demo | Real API Client |
|----------|---------|---------|------|-----------------|
| **Binance** | ✅ | ✅ | ❌ | ✅ Full Implementation |
| **Bybit** | ✅ | ✅ | ❌ | ✅ V5 API Support |
| **OKX** | ✅ | ❌ | ✅ | ✅ Demo Mode Support |
| **Bitget** | ✅ | ❌ | ✅ | ✅ Full Implementation |
| **BingX** | ✅ | ❌ | ✅ | ✅ Full Implementation |

#### Exchange Client Features
- Order placement (Market, Limit, Stop-Limit)
- Order cancellation and modification
- Balance queries
- Position management (Futures)
- Leverage setting
- Real-time ticker data
- WebSocket streams support

### 📈 Copy Trading

**Master Trader Features:**
- Apply to become Master Trader via API (OKX)
- Manage followers list
- Set profit sharing percentage
- Configure TP/SL ratio (Bitget)
- Real-time position broadcasting

**Follower Features:**
- Browse top traders
- Copy with customizable settings
- Set risk limits
- Real-time position sync

### 🧠 AI/ML Features

- **Deep Learning Panel** - Neural network predictions
- **ML Classification** - Trade classification models
- **Lawrence Classifier** - k-NN with Lorentzian distance
- **ML Signal Pipeline** - Signal enhancement and filtering
- **ML-Enhanced LOGOS** - Weighted signal aggregation
- **Sentiment Analysis** - Market sentiment from news/social
- **Self-Learning Bot** - Adaptive strategies

---

## 🛠️ Technology Stack

### Core Framework
- **Next.js 16** - App Router, Server Components
- **TypeScript 5** - Full type safety
- **Tailwind CSS 4** - Utility-first styling

### UI Components
- **shadcn/ui** - Component library (New York style)
- **Lucide React** - Icon library
- **Recharts** - Data visualization
- **Framer Motion** - Animations
- **Lightweight Charts** - Trading chart library

### State & Data
- **Zustand** - Client state management
- **TanStack Query** - Server state
- **Prisma** - Database ORM (SQLite)

### Exchange Integration
- **CCXT** - Unified exchange API
- **WebSocket** - Real-time data streams
- **Custom Clients** - Exchange-specific implementations (Binance, Bybit, OKX, Bitget, BingX)

### ML/AI
- **Lawrence Classifier** - k-NN with Lorentzian distance
- **ML Signal Filter** - Signal quality enhancement
- **ML Bot Integration** - Bot-specific ML services

---

## 📁 Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes
│   │   ├── ml/               # ML Integration APIs
│   │   │   ├── filter/       # Signal filtering
│   │   │   ├── stats/        # ML statistics
│   │   │   ├── train/        # Training data
│   │   │   ├── pipeline/     # ML Pipeline
│   │   │   └── bot-integration/ # Bot ML integration
│   │   ├── bots/             # Bot management
│   │   │   └── control/      # Start/Stop/Pause API
│   │   ├── cornix/           # Cornix integration
│   │   ├── master-trader/    # Master Trader API
│   │   └── exchange/         # Exchange connections
│   └── page.tsx              # Main dashboard
├── components/
│   ├── bots/                 # Bot panels (17 types)
│   │   ├── dca-bot-manager.tsx
│   │   ├── bb-bot-manager.tsx
│   │   ├── orion-bot-manager.tsx
│   │   ├── vision-bot-manager.tsx
│   │   └── ...
│   ├── ml/                   # ML Components
│   │   ├── ml-filtering-panel.tsx  # Main ML Panel
│   │   └── ml-integration-nav.tsx  # Navigation
│   ├── copy-trading/         # Copy trading components
│   ├── analytics/            # AI/ML analytics
│   ├── layout/               # Layout components
│   └── ui/                   # shadcn/ui components
├── lib/
│   ├── ml/                   # ML Services
│   │   ├── lawrence-classifier.ts  # k-NN Classifier
│   │   ├── ml-signal-filter.ts     # Signal Filter
│   │   └── bot-ml-integration.ts   # Bot ML Service
│   ├── logos-bot/            # LOGOS Meta Bot
│   │   ├── engine.ts         # Aggregation Engine
│   │   └── ml-integration.ts # ML-Enhanced LOGOS
│   ├── bot-filters/          # Signal Filters
│   │   ├── enhanced-signal-filter.ts
│   │   ├── bb-signal-filter.ts
│   │   ├── dca-entry-filter.ts
│   │   └── vision-signal-filter.ts
│   ├── exchange/             # Exchange clients
│   │   ├── base-client.ts    # Abstract base class
│   │   ├── binance-client.ts
│   │   ├── bybit-client.ts
│   │   ├── okx-client.ts
│   │   ├── bitget-client.ts
│   │   └── bingx-client.ts
│   ├── auto-trading/         # Auto Trading
│   │   ├── exchange-clients.ts     # Real API Clients
│   │   └── exchange-order.ts       # Order Execution
│   ├── bots/                 # Bot algorithms
│   ├── analytics/            # Analytics engines
│   ├── bot-orchestrator.ts   # Bot Lifecycle Management
│   └── db.ts                 # Prisma client
├── docs/                     # Documentation
│   ├── ML_BOT_INTEGRATION.md # ML Bot Integration
│   ├── ML_INTEGRATION.md     # ML Integration Guide
│   ├── ML_SIGNAL_PIPELINE.md # Signal Pipeline
│   ├── LOGOS_BOT.md          # LOGOS Documentation
│   └── TRADING_SYSTEM_ARCHITECTURE.md
├── mini-services/            # Microservices
│   └── bot-monitor/          # WebSocket Monitor (port 3003)
└── prisma/
    └── schema.prisma         # Database schema
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install base dependencies
bun install

# Setup database
bun run db:push
```

### 2. Install shadcn/ui Components

This project uses **shadcn/ui** (New York style). Install the required components:

```bash
# Core components
npx shadcn@latest add accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button calendar carousel chart checkbox collapsible command context-menu dialog drawer dropdown-menu form hover-card input input-otp label menubar navigation-menu pagination popover progress radio-group resizable scroll-area select separator sheet sidebar skeleton slider sonner switch table tabs textarea toast toggle toggle-group tooltip

# Start development server
bun run dev
```

### 3. Start Mini Services

```bash
# Start WebSocket bot monitor (port 3003)
cd mini-services/bot-monitor && bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

---

## 📊 Dashboard Features

### Main Views
- **Dashboard** - Overview with equity curve, positions, signals
- **Bots** - Grid of bot cards with status and controls
- **Signals** - Active signals with progress indicators
- **Positions** - Real-time position table
- **Trades** - Trade history with analytics
- **Analytics** - Performance metrics and charts
- **ML Filtering** - ML configuration and statistics
- **Journal** - Trading journal with lessons
- **Portfolio** - Exchange balances overview
- **Funding** - Funding rates monitoring
- **News** - Market news and events

### Trading Terminal
- Left panel: Balance widget, quick trade
- Center: Price chart (TradingView-style)
- Right panel: Positions, signals feed
- Bottom: Configuration panels with color indicators

---

## 🔐 API Documentation

### ML Integration API

```typescript
// Analyze signal for specific bot
POST /api/ml/bot-integration
{
  "action": "analyze",
  "botCode": "DCA",
  "signal": {
    "direction": "LONG",
    "confidence": 0.65,
    "symbol": "BTCUSDT"
  },
  "marketData": { ... }
}

// Get ML statistics
GET /api/ml/stats

// Filter signal through ML pipeline
POST /api/ml/filter
{
  "signal": { ... },
  "config": { ... }
}
```

### Bot Control API

```typescript
// Start bot
POST /api/bots/control
{
  "action": "start",
  "botCode": "DCA",
  "config": {
    "symbol": "BTCUSDT",
    "exchange": "binance",
    "mode": "PAPER"
  }
}

// Stop bot
POST /api/bots/control
{
  "action": "stop",
  "botCode": "DCA"
}

// Get active bots
GET /api/bots/control
```

### Cornix Integration

```typescript
// Get features and connected exchanges
GET /api/cornix/features

// Update feature settings
POST /api/cornix/features
{
  "feature": "autoTrading",
  "value": true
}

// Get performance metrics
GET /api/cornix/metrics?period=30d
```

### Master Trader

```typescript
// Get Master Trader status
GET /api/master-trader?exchange=okx

// Apply as Master Trader
POST /api/master-trader
{
  "exchange": "okx",
  "action": "apply",
  "profitSharePercent": 10
}
```

---

## 📈 Copy Trading Support Matrix

### Master Trader API

| Feature | OKX | Bitget | Binance | Bybit | BingX |
|---------|-----|--------|---------|-------|-------|
| Apply via API | ✅ | ❌ | ❌ | ❌ | ❌ |
| Get Settings | ✅ | ✅ | ⚠️ | ❌ | ❌ |
| Update Settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| List Followers | ✅ | ✅ | ❌ | ❌ | ❌ |
| Remove Follower | ✅ | ✅ | ❌ | ❌ | ❌ |
| Profit Sharing Stats | ✅ | ✅ | ❌ | ❌ | ❌ |

### Recommended Exchanges for Master Traders
1. **OKX** - Best API support, full control
2. **Bitget** - Excellent API, unique TP/SL ratio feature

---

## 🎨 UI Design

### Color Palette (Binance-inspired)
- **Primary Gold**: `#F0B90B`
- **Success Green**: `#0ECB81`
- **Error Red**: `#F6465D`
- **Background Dark**: `#0B0E11`
- **Card Dark**: `#1E2329`

### Theme
- Dark mode by default
- Light mode supported
- Mobile-responsive design

---

## 📚 Documentation

### ML Integration
- [ML Bot Integration](docs/ML_BOT_INTEGRATION.md) - Bot-specific ML services
- [ML Integration Guide](docs/ML_INTEGRATION.md) - Lawrence Classifier integration
- [ML Signal Pipeline](docs/ML_SIGNAL_PIPELINE.md) - Signal enhancement pipeline
- [ML Indicators & Filters](docs/ML_INDICATORS_AND_FILTERS.md) - Advanced indicators

### Architecture
- [Trading System Architecture](docs/TRADING_SYSTEM_ARCHITECTURE.md) - System overview
- [LOGOS Bot](docs/LOGOS_BOT.md) - Meta bot documentation
- [Bot Manager API](docs/BOT_MANAGER_API.md) - Bot management

### Exchange Integration
- [Exchange Integration](docs/exchanges/README.md) - Exchange API guides
- [Copy Trading API](docs/copy-trading.md) - Full copy trading documentation

### Bot Development
- [Institutional Bots](docs/INSTITUTIONAL_BOTS.md) - Bot architecture
- [Bot Development Standards](docs/BOT_CODES_STANDARD.md)

---

## 🔧 Development

```bash
# Run linter
bun run lint

# Type check
bun run type-check

# Build for production
bun run build

# Database operations
bun run db:push
bun run db:studio
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
```

---

## 🔄 WebSocket Monitoring

The platform includes a real-time WebSocket monitoring service:

- **Port**: 3003
- **Events**: Bot status, trades, positions, alerts
- **Auto-reconnection**: Supported
- **React Hook**: `use-bot-monitor`

```typescript
import { useBotMonitor } from '@/hooks/use-bot-monitor'

const { events, botStatuses, isConnected } = useBotMonitor()
```

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

## 📋 Recent Updates

### ML Integration Ecosystem (Latest)
- ✅ Lawrence Classifier (k-NN with Lorentzian distance)
- ✅ ML Bot Integration Service for DCA, BB, ORION, Zenbot
- ✅ ML-Enhanced LOGOS Engine
- ✅ ML Filtering Panel with 5 tabs
- ✅ UI Navigation: ML Filter ↔ LOGOS ↔ Backtesting
- ✅ Signal Pipeline with quality assessment

### Exchange Integration
- ✅ Real API Clients (Binance, Bybit, OKX, Bitget, BingX)
- ✅ HMAC-SHA256 Authentication
- ✅ Paper Trading, Testnet, Demo, Live modes
- ✅ Order placement, cancellation, balance queries

### Bot Control
- ✅ Bot Orchestrator Service
- ✅ Start/Stop/Pause/Resume API
- ✅ WebSocket Monitoring Service
- ✅ Real-time trade notifications

---

Built with ❤️ for algorithmic traders. Powered by Next.js, TypeScript, and AI.
