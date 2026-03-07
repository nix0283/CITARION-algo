# Investing Algorithm Framework (IAF) Integration

## Overview

The Investing Algorithm Framework (IAF) integration provides a Python-based service for creating, testing, and deploying algorithmic trading strategies within the CITARION platform. This integration bridges the TypeScript Next.js application with a powerful Python backend for strategy execution and backtesting.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CITARION Platform                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Next.js Frontend (TypeScript)                              │
│  ├── /src/lib/iaf/               ← IAF TypeScript Client    │
│  ├── /src/lib/strategy/          ← Existing Strategy Engine │
│  └── /src/lib/backtesting/       ← Existing Backtesting     │
│                                                              │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API (FastAPI)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    IAF Service (Python)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  /iaf-service/                                               │
│  ├── strategies/                ← Strategy implementations  │
│  │   ├── base.py               ← Abstract base class        │
│  │   ├── types.py              ← Strategy types             │
│  │   ├── risk.py               ← Risk management rules      │
│  │   ├── indicators.py         ← Technical indicators       │
│  │   └── builtin.py            ← Built-in strategies        │
│  │                                                          │
│  ├── backtesting/               ← Backtesting engine        │
│  │   ├── types.py              ← Backtest types             │
│  │   └── engine.py             ← Event-driven engine        │
│  │                                                          │
│  ├── portfolio/                 ← Portfolio management      │
│  │   ├── types.py              ← Portfolio types            │
│  │   └── manager.py            ← Position management        │
│  │                                                          │
│  ├── data_providers/            ← Exchange data providers   │
│  │   └── __init__.py           ← All exchanges              │
│  │                                                          │
│  └── api/                       ← FastAPI endpoints         │
│      └── __init__.py           ← REST API                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Python 3.10+
- FastAPI
- pandas, numpy
- aiohttp

### Setup

1. **Install Python dependencies:**

```bash
cd iaf-service
pip install fastapi uvicorn pandas numpy aiohttp pydantic
```

2. **Start the IAF service:**

```bash
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

3. **Configure environment variable in Next.js:**

```env
IAF_SERVICE_URL=http://localhost:8000
```

## Built-in Strategies

### 1. RSI Reversal Strategy

**Algorithm ID:** `rsi-reversal`

Generates buy signals when RSI crosses above oversold threshold and sell signals when RSI crosses below overbought threshold.

```python
from iaf_service.strategies import RSIReversalStrategy

strategy = RSIReversalStrategy(
    symbol="BTCUSDT",
    exchange="binance",
    timeframe="4h",
    rsi_period=14,
    oversold_threshold=30,
    overbought_threshold=70,
    position_size_pct=10.0,
    take_profit_pct=5.0,
    stop_loss_pct=3.0
)
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `symbol` | str | "BTCUSDT" | Trading symbol |
| `exchange` | str | "binance" | Exchange name |
| `timeframe` | str | "4h" | Candle timeframe |
| `rsi_period` | int | 14 | RSI calculation period |
| `oversold_threshold` | float | 30.0 | RSI oversold level |
| `overbought_threshold` | float | 70.0 | RSI overbought level |

### 2. MACD Crossover Strategy

**Algorithm ID:** `macd-crossover`

Generates signals based on MACD line crossing the signal line.

```python
from iaf_service.strategies import MACDCrossoverStrategy

strategy = MACDCrossoverStrategy(
    symbol="BTCUSDT",
    timeframe="1h",
    fast_period=12,
    slow_period=26,
    signal_period=9
)
```

### 3. Bollinger Bands Strategy

**Algorithm ID:** `bollinger-bands`

Mean reversion strategy using Bollinger Bands.

```python
from iaf_service.strategies import BollingerBandsStrategy

strategy = BollingerBandsStrategy(
    symbol="BTCUSDT",
    timeframe="1h",
    period=20,
    std_dev=2.0
)
```

### 4. EMA Crossover Strategy

**Algorithm ID:** `ema-crossover`

Trend following strategy based on EMA crossovers.

```python
from iaf_service.strategies import EMACrossoverStrategy

strategy = EMACrossoverStrategy(
    symbol="BTCUSDT",
    timeframe="1h",
    short_period=9,
    long_period=21,
    trailing_stop=True
)
```

### 5. Grid Trading Strategy

**Algorithm ID:** `grid-trading`

Grid trading strategy for range-bound markets.

```python
from iaf_service.strategies import GridStrategy

strategy = GridStrategy(
    symbol="BTCUSDT",
    timeframe="15m",
    grid_levels=10,
    grid_spacing_pct=1.0,
    position_size_pct=5.0
)
```

### 6. DCA Strategy

**Algorithm ID:** `dca`

Dollar Cost Averaging strategy with optional RSI filter.

```python
from iaf_service.strategies import DCAStrategy

strategy = DCAStrategy(
    symbol="BTCUSDT",
    timeframe="1d",
    buy_amount=100.0,
    buy_interval_hours=24,
    use_rsi_filter=True,
    rsi_threshold=45.0,
    max_positions=10
)
```

## Risk Management

### Position Sizing

```python
from iaf_service.strategies.risk import PositionSize

position_size = PositionSize(
    symbol="BTCUSDT",
    percentage_of_portfolio=10.0,  # 10% of portfolio
    max_amount=1000.0,             # Max $1000 per position
    risk_per_trade=2.0             # Max 2% risk per trade
)

# Calculate size
size = position_size.calculate_size(
    portfolio_value=10000,
    current_price=45000,
    stop_loss_price=43500
)
```

### Take Profit Rules

```python
from iaf_service.strategies.risk import TakeProfitRule, TakeProfitType

take_profit = TakeProfitRule(
    symbol="BTCUSDT",
    percentage_threshold=10.0,     # 10% profit target
    tp_type=TakeProfitType.TRAILING,
    trailing=True,
    trailing_offset=2.0,           # Trail by 2%
    sell_percentage=100.0          # Close full position
)

# Calculate target price
target = take_profit.calculate_target_price(
    entry_price=45000,
    side="long"
)  # Returns 49500
```

### Stop Loss Rules

```python
from iaf_service.strategies.risk import StopLossRule, StopLossType

stop_loss = StopLossRule(
    symbol="BTCUSDT",
    percentage_threshold=5.0,      # 5% stop loss
    sl_type=StopLossType.TRAILING,
    trailing=True,
    trailing_offset=2.0,           # Trail by 2%
    trailing_activation=3.0        # Activate after 3% profit
)

# Calculate stop price
stop_price = stop_loss.calculate_stop_price(
    entry_price=45000,
    side="long",
    atr=500  # Optional for ATR-based stops
)  # Returns 42750
```

### Risk Presets

```python
from iaf_service.strategies.risk import (
    CONSERVATIVE_RISK,
    MODERATE_RISK,
    AGGRESSIVE_RISK
)

# Conservative: 1-2% risk per trade
strategy.risk_config = CONSERVATIVE_RISK

# Moderate: 2-5% risk per trade
strategy.risk_config = MODERATE_RISK

# Aggressive: 5-10% risk per trade
strategy.risk_config = AGGRESSIVE_RISK
```

## Technical Indicators

The IAF service includes a comprehensive indicator library:

| Indicator | Function | Parameters |
|-----------|----------|------------|
| SMA | `sma()` | period, source |
| EMA | `ema()` | period, source |
| RSI | `rsi()` | period, source |
| MACD | `macd()` | fast_period, slow_period, signal_period |
| Bollinger Bands | `bollinger_bands()` | period, std_dev |
| ATR | `atr()` | period |
| Stochastic | `stochastic()` | k_period, d_period, smooth_k |
| ADX | `adx()` | period |
| VWAP | `vwap()` | - |
| OBV | `obv()` | - |
| Supertrend | `supertrend()` | period, multiplier |
| Ichimoku | `ichimoku()` | tenkan, kijun, senkou_b |
| Heikin Ashi | `heikin_ashi()` | - |

### Usage Example

```python
from iaf_service.strategies.indicators import IndicatorCalculator
import pandas as pd

# Load data
df = pd.DataFrame(ohlcv_data)

# Calculate indicators
df = IndicatorCalculator.rsi(df, period=14)
df = IndicatorCalculator.ema(df, period=20)
df = IndicatorCalculator.macd(df, fast_period=12, slow_period=26)

# Detect crossovers
df = IndicatorCalculator.crossover(
    df,
    first_column="ema_9",
    second_column="ema_21",
    result_column="ema_cross_up"
)
```

## Backtesting

### Configuration

```python
from iaf_service.backtesting import BacktestConfig, BacktestEngine
from datetime import datetime

config = BacktestConfig(
    start_date=datetime(2023, 1, 1),
    end_date=datetime(2024, 1, 1),
    initial_capital=10000.0,
    commission=0.001,         # 0.1% commission
    slippage=0.0005,          # 0.05% slippage
    max_positions=5,
    default_stop_loss=5.0,    # 5% default stop
    default_take_profit=10.0, # 10% default TP
    trailing_stop=True,
    trailing_stop_percent=2.0
)
```

### Running Backtests

```python
from iaf_service.backtesting import BacktestEngine
import asyncio

async def run_backtest():
    engine = BacktestEngine(config)
    result = await engine.run(strategy)

    print(f"Total Return: {result.metrics.total_return_percentage:.2f}%")
    print(f"Win Rate: {result.metrics.win_rate:.2f}%")
    print(f"Max Drawdown: {result.metrics.max_drawdown_percentage:.2f}%")
    print(f"Sharpe Ratio: {result.metrics.sharpe_ratio:.2f}")

asyncio.run(run_backtest())
```

### Backtest Metrics

| Metric | Description |
|--------|-------------|
| `total_return` | Absolute profit/loss |
| `total_return_percentage` | Return as percentage |
| `annualized_return` | Annualized return |
| `total_trades` | Number of trades |
| `winning_trades` | Profitable trades |
| `losing_trades` | Unprofitable trades |
| `win_rate` | Win percentage |
| `avg_win` | Average winning trade |
| `avg_loss` | Average losing trade |
| `profit_factor` | Gross profit / Gross loss |
| `max_drawdown` | Maximum drawdown |
| `max_drawdown_percentage` | Drawdown as percentage |
| `sharpe_ratio` | Risk-adjusted return |
| `sortino_ratio` | Downside risk-adjusted return |
| `calmar_ratio` | Return / Max drawdown |

## API Endpoints

### Health

```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Strategies

```
GET /strategies
```

Response:
```json
{
  "strategies": [
    {
      "algorithm_id": "rsi-reversal",
      "description": "RSI Reversal Strategy",
      "version": "1.0.0",
      "exchanges": ["binance", "bybit", "okx"],
      "time_unit": "hour",
      "interval": 4
    }
  ]
}
```

```
POST /strategies/create
```

Request:
```json
{
  "strategy_type": "rsi-reversal",
  "symbol": "BTCUSDT",
  "exchange": "binance",
  "timeframe": "4h",
  "custom_params": {
    "rsi_period": 14,
    "oversold_threshold": 30
  }
}
```

### Signals

```
POST /strategies/{instance_id}/signals
```

Response:
```json
{
  "instance_id": "rsi-reversal_BTCUSDT_1705312200",
  "signals": [
    {
      "type": "buy",
      "symbol": "BTCUSDT",
      "price": 42500.00,
      "timestamp": "2024-01-15T10:30:00Z",
      "confidence": 0.85,
      "reason": "RSI crossed above 30"
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Backtesting

```
POST /backtest
```

Request:
```json
{
  "strategy_id": "rsi-reversal_BTCUSDT_1705312200",
  "start_date": "2023-01-01",
  "end_date": "2024-01-01",
  "initial_capital": 10000,
  "commission": 0.001
}
```

### Indicators

```
POST /indicators/calculate?indicator_name=rsi
```

Request:
```json
{
  "data": [
    {"timestamp": 1705312200000, "open": 42500, "high": 42600, "low": 42400, "close": 42550, "volume": 1000}
  ],
  "params": {"period": 14}
}
```

### Risk Presets

```
GET /risk/presets
```

Response:
```json
{
  "presets": {
    "conservative": {
      "position_sizes": [{"symbol": "*", "percentage_of_portfolio": 5.0}],
      "max_open_positions": 3,
      "max_portfolio_risk": 10.0
    },
    "moderate": {...},
    "aggressive": {...}
  }
}
```

## TypeScript Client

### Usage

```typescript
import { IAFClient, iafClient } from '@/lib/iaf/client';

// Create custom client
const client = new IAFClient({
  baseUrl: 'http://localhost:8000',
  timeout: 30000
});

// Or use default client
const strategies = await iafClient.listStrategies();

// Create strategy
const { instance_id } = await iafClient.createStrategy({
  strategy_type: 'rsi-reversal',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  timeframe: '4h',
  custom_params: {
    rsi_period: 14,
    oversold_threshold: 30
  }
});

// Generate signals
const { signals } = await iafClient.generateSignals(instance_id);

// Run backtest
const result = await iafClient.runBacktest({
  strategy_id: instance_id,
  start_date: '2023-01-01',
  end_date: '2024-01-01',
  initial_capital: 10000,
  commission: 0.001
});
```

### React Hook Example

```typescript
import { useState, useEffect } from 'react';
import { iafClient, Signal } from '@/lib/iaf/client';

export function useStrategySignals(instanceId: string | null) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!instanceId) return;

    const fetchSignals = async () => {
      setLoading(true);
      try {
        const result = await iafClient.generateSignals(instanceId);
        setSignals(result.signals);
      } catch (error) {
        console.error('Failed to generate signals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
    const interval = setInterval(fetchSignals, 60000); // Every minute

    return () => clearInterval(interval);
  }, [instanceId]);

  return { signals, loading };
}
```

## Creating Custom Strategies

### Basic Structure

```python
from iaf_service.strategies import TradingStrategy, StrategyRegistry
from iaf_service.strategies.types import TimeUnit, DataType, DataSource, ExchangeType
import pandas as pd

@StrategyRegistry.register
class MyCustomStrategy(TradingStrategy):
    """Custom strategy description."""

    algorithm_id = "my-custom-strategy"
    time_unit = TimeUnit.HOUR
    interval = 1
    symbols = []
    exchanges = [ExchangeType.BINANCE, ExchangeType.BYBIT]
    description = "My custom trading strategy"
    version = "1.0.0"

    def __init__(self, symbol: str = "BTCUSDT", **kwargs):
        # Initialize data sources and risk config
        super().__init__(**kwargs)
        self.symbol = symbol

    def generate_buy_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Implement buy signal logic."""
        signals = {}

        for identifier, df in data.items():
            # Your buy signal logic here
            buy_signal = df["close"] > df["sma_20"]
            signals[identifier.replace("_data", "")] = buy_signal

        return signals

    def generate_sell_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Implement sell signal logic."""
        signals = {}

        for identifier, df in data.items():
            # Your sell signal logic here
            sell_signal = df["close"] < df["sma_20"]
            signals[identifier.replace("_data", "")] = sell_signal

        return signals
```

## Supported Exchanges

| Exchange | Provider | Features |
|----------|----------|----------|
| Binance | `BinanceProvider` | Spot + Futures, OHLCV, Ticker, Funding |
| Bybit | `BybitProvider` | V5 API, OHLCV, Ticker |
| OKX | `OKXProvider` | V5 API, OHLCV, Ticker |
| Bitget | `BitgetProvider` | V2 API, OHLCV, Ticker, Funding |
| BingX | `BingXProvider` | V2 API, OHLCV, Ticker, Funding |

## File Structure

```
/iaf-service/
├── __init__.py                 # Module exports
├── strategies/
│   ├── __init__.py
│   ├── base.py                 # TradingStrategy base class
│   ├── types.py                # Strategy types
│   ├── risk.py                 # Risk management
│   ├── indicators.py           # Technical indicators
│   └── builtin.py              # Built-in strategies
├── backtesting/
│   ├── __init__.py
│   ├── types.py                # Backtest types
│   └── engine.py               # Backtest engine
├── portfolio/
│   ├── __init__.py
│   ├── types.py                # Portfolio types
│   └── manager.py              # Portfolio manager
├── data_providers/
│   └── __init__.py             # Exchange providers
├── api/
│   └── __init__.py             # FastAPI endpoints
└── utils/
    └── __init__.py             # Utility functions
```

## Integration with Existing CITARION Components

### Bridge to TypeScript Strategies

The IAF service can work alongside the existing TypeScript strategy engine:

```typescript
// In CITARION, you can use both engines
import { StrategyManager } from '@/lib/strategy';
import { iafClient } from '@/lib/iaf';

// Use TypeScript strategy for real-time execution
const tsSignals = await strategyManager.executeStrategy('rsi-reversal');

// Use IAF for backtesting
const backtestResult = await iafClient.runBacktest({
  strategy_id: 'rsi-reversal_BTCUSDT',
  start_date: '2023-01-01',
  end_date: '2024-01-01',
  initial_capital: 10000
});
```

### Using IAF Risk Rules in CITARION

```typescript
// Fetch risk presets from IAF
const { presets } = await iafClient.getRiskPresets();

// Apply to CITARION bots
const botConfig = {
  ...botConfig,
  riskManagement: presets.moderate
};
```

## Performance Considerations

1. **Backtesting Speed**: Use vectorized mode for quick parameter optimization, event-driven for accurate results.

2. **API Calls**: Cache strategy instances and data to minimize API calls.

3. **Memory Usage**: For large datasets, use streaming or chunked data loading.

4. **Concurrent Requests**: The FastAPI service handles concurrent requests efficiently with async/await.

## Troubleshooting

### Common Issues

1. **Service not responding**
   - Check if uvicorn is running: `ps aux | grep uvicorn`
   - Verify port 8000 is not in use: `lsof -i :8000`

2. **Import errors**
   - Ensure all dependencies are installed
   - Check Python path includes iaf-service directory

3. **No signals generated**
   - Verify data is loaded in data sources
   - Check indicator calculations don't have NaN values
   - Review signal thresholds

4. **Backtest returning zero trades**
   - Verify date range has data
   - Check signal logic is correct
   - Ensure sufficient warm-up period

## References

- [Investing Algorithm Framework](https://github.com/coding-kitties/investing-algorithm-framework)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pandas Documentation](https://pandas.pydata.org/)
