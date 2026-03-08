# Lumibot Integration Documentation

## Overview

Lumibot is a Python library for algorithmic trading that integrates with CITARION to provide powerful backtesting and live trading capabilities. This document describes the complete integration architecture, API endpoints, and usage examples.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CITARION Platform                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  Next.js App    │  │  Lightweight    │  │   Trading Bots              │  │
│  │  (Frontend)     │  │  Charts         │  │   (DCA, Grid, BB, Argus)    │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                  │
│           │      ┌─────────────┴─────────────┐            │                  │
│           │      │   TypeScript Client       │            │                  │
│           │      │   /lib/lumibot/           │            │                  │
│           │      └─────────────┬─────────────┘            │                  │
│           │                    │                          │                  │
│           │      ┌─────────────┴─────────────┐            │                  │
│           │      │   API Routes              │            │                  │
│           │      │   /api/lumibot/*          │            │                  │
│           │      └─────────────┬─────────────┘            │                  │
└───────────┼────────────────────┼──────────────────────────┼──────────────────┘
            │                    │                          │
            │                    │ HTTP/WebSocket           │
            │                    ▼                          │
┌───────────┼───────────────────────────────────────────────────────────────────┐
│           │              Lumibot Python Service                               │
│           │              (Port 8001)                                          │
│  ┌────────┴────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   FastAPI Server    │  │  Strategy Engine │  │  Broker Connections      │  │
│  │   /main.py          │  │  /strategies/    │  │  (CCXT, Alpaca, IB)     │  │
│  └─────────────────────┘  └──────────────────┘  └──────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    CITARION Integration Strategies                       │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │  │
│  │  │ DCAIntegration  │ │ GridIntegration │ │ BBIntegration   │            │  │
│  │  │ Strategy        │ │ Strategy        │ │ Strategy        │            │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘            │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │  │
│  │  │ ArgusIntegration│ │ Supertrend      │ │ EMACross        │            │  │
│  │  │ Strategy        │ │ Strategy        │ │ Strategy        │            │  │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘            │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Python Service (lumibot-service/)

The Python microservice provides the core trading functionality:

#### Directory Structure

```
lumibot-service/
├── main.py                    # FastAPI application
├── config.py                  # Configuration and strategy definitions
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Docker configuration
├── docker-compose.yml         # Docker Compose setup
├── strategies/
│   ├── __init__.py
│   ├── base.py               # Base strategy classes
│   ├── extended_strategies.py # Additional strategies (Supertrend, DCA, EMA Cross, Breakout)
│   ├── ai_strategies.py      # AI-powered strategies
│   └── citarion_integration.py # CITARION bot integration strategies
```

#### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service status |
| GET | `/health` | Health check |
| GET | `/strategies` | List all strategies |
| GET | `/strategies/{id}` | Get strategy details |
| POST | `/backtest` | Run backtest |
| POST | `/backtest/simulate` | Simulate backtest (mock) |
| GET | `/live` | List active strategies |
| POST | `/live/start` | Start live trading |
| POST | `/live/{id}/stop` | Stop strategy |
| DELETE | `/live` | Stop all strategies |
| GET | `/signals` | Get recent signals |
| GET | `/signals/{id}` | Get strategy signals |
| GET | `/brokers` | List supported brokers |
| GET | `/timeframes` | List supported timeframes |
| GET | `/config` | Get service config |

### 2. TypeScript Client (/lib/lumibot/)

The TypeScript client provides type-safe access to the Lumibot service:

```typescript
import { lumibotClient, PREDEFINED_STRATEGIES, SUPPORTED_BROKERS } from '@/lib/lumibot';

// Check service status
const status = await lumibotClient.getStatus();

// List strategies
const strategies = await lumibotClient.getStrategies();

// Run backtest
const result = await lumibotClient.runBacktest({
  strategy: 'rsi_reversal',
  symbol: 'BTC/USDT',
  start_date: '2023-01-01',
  end_date: '2023-12-31',
  initial_cash: 100000,
  parameters: { rsi_period: 14 }
});

// Start live trading
const live = await lumibotClient.startLiveTrading({
  strategy: 'grid_trading',
  symbol: 'BTC/USDT',
  broker: 'paper',
  paper_trading: true,
  parameters: { grid_levels: 10 }
});
```

### 3. API Routes (/api/lumibot/)

Next.js API routes proxy requests to the Python service:

- `/api/lumibot/status` - Service status
- `/api/lumibot/strategies` - Strategy management
- `/api/lumibot/backtest` - Backtesting operations
- `/api/lumibot/live` - Live trading management

### 4. UI Components (/components/lumibot/)

React components for the Lumibot interface:

- `LumibotPanel` - Main panel with tabs for backtesting, live trading, and strategies
- `BacktestResults` - Displays backtest results with charts
- `StrategySelector` - Dropdown for strategy selection
- `ActiveStrategiesList` - Lists running strategies

## Available Strategies

### Standard Strategies

| ID | Name | Category | Timeframe | Description |
|----|------|----------|-----------|-------------|
| `rsi_reversal` | RSI Reversal | mean-reversion | 1h | Trades RSI oversold/overbought levels |
| `macd_trend` | MACD Trend | trend-following | 4h | MACD crossover strategy |
| `bollinger_reversion` | BB Reversion | mean-reversion | 1h | Bollinger Bands mean reversion |
| `grid_trading` | Grid Trading | grid | 1h | Grid trading for sideways markets |
| `ema_cross` | EMA Cross | trend-following | 1h | EMA crossover strategy |
| `triple_rsi` | Triple RSI | mean-reversion | 1h | Multi-timeframe RSI confirmation |
| `supertrend` | Supertrend | trend-following | 1h | Supertrend indicator strategy |
| `momentum_breakout` | Momentum Breakout | breakout | 4h | Volume-confirmed breakouts |

### Extended Strategies

| ID | Name | Category | Description |
|----|------|----------|-------------|
| `supertrend` | Supertrend Strategy | trend-following | ATR-based trend detection |
| `dca` | DCA Strategy | accumulation | Dollar-cost averaging with safety orders |
| `ema_cross` | EMA Cross | trend-following | Fast/slow EMA crossover |
| `breakout` | Breakout Strategy | breakout | Consolidation breakout trading |

### CITARION Integration Strategies

| ID | Name | Target Bot | Description |
|----|------|------------|-------------|
| `dca_integration` | DCA Integration | DCA Bot | Technical analysis for DCA entries |
| `grid_integration` | Grid Integration | Grid Bot | Dynamic grid level calculation |
| `bb_integration` | BB Integration | BB Bot | Bollinger Band signals |
| `argus_integration` | Argus Integration | Argus Bot | Whale tracking alerts |

## Integration with CITARION Bots

### DCA Bot Integration

The `DCAIntegrationStrategy` provides intelligent DCA entry signals:

```python
# Signal emitted when optimal DCA entry detected
{
    "type": "DCA_BUY",
    "data": {
        "symbol": "BTC/USDT",
        "price": 45000,
        "size": 0.01,
        "level": 2,
        "rsi": 28.5,
        "bb_lower": 44800,
        "reason": "RSI oversold (28.5) + Below lower BB",
        "action": "safety_order",
        "target_bot": "dca_bot"
    }
}
```

### Grid Bot Integration

The `GridIntegrationStrategy` dynamically adjusts grid parameters:

```python
# Signal emitted when grid rebalancing needed
{
    "type": "GRID_REBALANCE",
    "data": {
        "symbol": "BTC/USDT",
        "current_price": 45000,
        "grid_upper": 47000,
        "grid_lower": 43000,
        "grid_spacing": 0.01,
        "grid_levels": 10,
        "action": "reconfigure_grid",
        "target_bot": "grid_bot"
    }
}
```

### BB Bot Integration

The `BBIntegrationStrategy` detects Bollinger Band patterns:

```python
# Signal emitted on squeeze detection
{
    "type": "BB_SQUEEZE",
    "data": {
        "symbol": "BTC/USDT",
        "price": 45000,
        "bandwidth": 1.8,
        "action": "prepare_breakout",
        "target_bot": "bb_bot"
    }
}
```

### Argus Bot Integration

The `ArgusIntegrationStrategy` detects whale activity:

```python
# Signal emitted on large price move
{
    "type": "ARGUS_WHALE_MOVE",
    "data": {
        "symbol": "BTC/USDT",
        "price": 45500,
        "price_change_pct": 2.5,
        "direction": "up",
        "action": "monitor_closely",
        "target_bot": "argus_bot"
    }
}
```

## Running the Service

### Development Mode

```bash
# Install dependencies
cd lumibot-service
pip install -r requirements.txt

# Run with uvicorn
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

### Docker Deployment

```bash
# Build and run with Docker Compose
cd lumibot-service
docker-compose up -d

# Check logs
docker-compose logs -f lumibot
```

### Environment Variables

```bash
# .env file
SERVICE_NAME=CITARION Lumibot Trading Service
SERVICE_VERSION=1.0.0
HOST=0.0.0.0
PORT=8001
DEBUG=false

# Redis (for production)
REDIS_URL=redis://localhost:6379/0

# Exchange API Keys (optional)
BINANCE_API_KEY=your_key
BINANCE_API_SECRET=your_secret
BYBIT_API_KEY=your_key
BYBIT_API_SECRET=your_secret
OKX_API_KEY=your_key
OKX_API_SECRET=your_secret
OKX_PASSPHRASE=your_passphrase

# Alpaca (for stocks)
ALPACA_API_KEY=your_key
ALPACA_API_SECRET=your_secret
ALPACA_PAPER=true

# Interactive Brokers
IB_HOST=127.0.0.1
IB_PORT=7497
IB_CLIENT_ID=1
```

## Backtesting

### Running a Backtest

```typescript
// Frontend code
const result = await fetch('/api/lumibot/backtest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    strategy: 'rsi_reversal',
    symbol: 'BTC/USDT',
    start_date: '2023-01-01',
    end_date: '2023-12-31',
    initial_cash: 100000,
    timeframe: '1h',
    parameters: {
      rsi_period: 14,
      oversold: 30,
      overbought: 70
    }
  })
});

const data = await result.json();
// Returns: { total_return_pct, sharpe_ratio, max_drawdown, equity_curve, signals, ... }
```

### Backtest Results Structure

```typescript
interface BacktestResult {
  strategy: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_cash: number;
  final_value: number;
  total_return: number;
  total_return_pct: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  win_rate: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  signals: Signal[];
  equity_curve: EquityPoint[];
}
```

## Live Trading

### Starting Live Trading

```typescript
const response = await fetch('/api/lumibot/live', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    strategy: 'supertrend',
    symbol: 'BTC/USDT',
    broker: 'paper',
    paper_trading: true,
    parameters: {
      atr_period: 10,
      atr_multiplier: 3.0,
      position_size: 0.1
    }
  })
});
```

### Monitoring Active Strategies

```typescript
// Get active strategies
const active = await fetch('/api/lumibot/live');
const data = await active.json();
// Returns: { active_strategies: [...], count: number }

// Stop a strategy
await fetch(`/api/lumibot/live?strategy_id=${id}`, { method: 'DELETE' });
```

## Supported Brokers

| Broker ID | Name | Type | Paper Trading |
|-----------|------|------|---------------|
| `ccxt` | CCXT (Crypto) | Crypto | Yes |
| `alpaca` | Alpaca | Stocks | Yes |
| `ib` | Interactive Brokers | Multi-asset | Yes |
| `paper` | Paper Trading Only | Simulation | Yes |

### CCXT Supported Exchanges

- Binance
- Bybit
- OKX
- Bitget
- KuCoin
- Coinbase

## Risk Management

### Position Sizing

Strategies use fractional position sizing (0.01 - 1.0) to manage risk:

```python
# In strategy configuration
position_size: float = 0.1  # 10% of portfolio per trade
```

### Stop Loss / Take Profit

Most strategies include built-in risk management:

```python
# DCA Strategy
take_profit_pct: float = 0.10  # 10% take profit

# Breakout Strategy
stop_loss_pct: float = 0.03  # 3% stop loss
```

## Best Practices

### 1. Always Test with Paper Trading

```typescript
// Always enable paper trading for testing
const config = {
  paper_trading: true,  // Required for safety
  broker: 'paper'
};
```

### 2. Run Backtests First

Before live trading, always:

1. Run historical backtest
2. Analyze drawdown and Sharpe ratio
3. Review equity curve for consistency
4. Check win rate and trade frequency

### 3. Monitor Active Strategies

```typescript
// Set up monitoring interval
setInterval(async () => {
  const status = await lumibotClient.getActiveStrategies();
  // Check for errors, review signals
}, 60000); // Every minute
```

### 4. Use Appropriate Timeframes

| Strategy Type | Recommended Timeframe |
|---------------|----------------------|
| Scalping | 1m - 5m |
| Day Trading | 15m - 1h |
| Swing Trading | 4h - 1d |
| Position Trading | 1d+ |

## Troubleshooting

### Service Not Running

```bash
# Check if service is running
curl http://localhost:8001/health

# Check Docker logs
docker-compose logs lumibot
```

### Strategy Not Found

Ensure strategy ID matches one in the registry:

```bash
# List available strategies
curl http://localhost:8001/strategies
```

### Connection Errors

1. Verify service is running on correct port
2. Check CORS settings in `main.py`
3. Verify API routes are correctly proxied

## Future Enhancements

1. **WebSocket Support** - Real-time signal streaming
2. **Redis Integration** - Persistent signal storage
3. **Multi-strategy Portfolios** - Combine multiple strategies
4. **AI Strategy Generation** - GPT-powered strategy creation
5. **Advanced Analytics** - Walk-forward analysis, Monte Carlo simulation

## References

- [Lumibot Documentation](https://lumibot.lumiwealth.com/)
- [Lumibot GitHub](https://github.com/Lumiwealth/lumibot)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [CCXT Library](https://github.com/ccxt/ccxt)
