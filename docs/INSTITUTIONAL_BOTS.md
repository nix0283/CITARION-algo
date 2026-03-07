# Institutional Bots Documentation

## Overview

Institutional-grade algorithmic trading bots for professional traders.

## Структура меню в Sidebar

Раздел **Институциональные** является декоративным контейнером со следующими подразделами:

| Подраздел | ID | Описание |
|-----------|-----|----------|
| ПАНЕЛЬ | `institutional-bots` | Обзор всех институциональных ботов |
| PR (Spectrum) | `spectrum-bot` | Pairs Trading |
| STA (Reed) | `reed-bot` | Statistical Arbitrage |
| MM (Architect) | `architect-bot` | Market Making |
| MR (Equilibrist) | `equilibrist-bot` | Mean Reversion |
| TRF (Kron) | `kron-bot` | Trend Following |

## Bots

### 1. Reed (STA) - Statistical Arbitrage

**Strategy:** Multi-factor statistical arbitrage using PCA and factor models.

**Features:**
- Momentum factor
- Mean reversion factor
- Volume factor
- Volatility factor
- PCA dimensionality reduction
- Market neutral positioning

**Configuration:**
```typescript
{
  strategy: {
    factorModels: ['MOMENTUM', 'MEAN_REVERSION', 'VOLUME', 'VOLATILITY'],
    lookbackPeriod: 60,
    minExpectedReturn: 0.02,
    maxHoldingPeriod: 5 * 24 * 60 * 60 * 1000, // 5 days
    rebalanceFrequency: 24 * 60 * 60 * 1000, // Daily
    universeSize: 50,
    sectorNeutral: true,
    marketNeutral: true,
    pcaComponents: 3,
  }
}
```

---

### 2. Architect (MM) - Market Making

**Strategy:** Provides liquidity by quoting bid/ask spreads.

**Features:**
- Avellaneda-Stoikov spread optimization
- Inventory-based pricing
- Adverse selection protection
- Volatility adjustment
- Real-time spread adjustment

**Configuration:**
```typescript
{
  strategy: {
    baseSpreadPct: 0.002,
    minSpreadPct: 0.0005,
    maxSpreadPct: 0.01,
    orderSize: 100,
    maxInventory: 1000,
    inventorySkewFactor: 0.1,
    refreshRate: 1000,
    adverseSelectionProtection: true,
    latencyMs: 50,
    volatilityAdjustment: true,
  }
}
```

---

### 3. Equilibrist (MR) - Mean Reversion

**Strategy:** Trades mean reversion using Bollinger Bands, RSI, and Z-score.

**Features:**
- Multiple mean calculation methods (SMA, EMA, KAMA, Regression)
- Multiple std methods (Simple, EWMA, Parkinson)
- Z-score entry/exit
- RSI confirmation
- Volume confirmation

**Configuration:**
```typescript
{
  strategy: {
    lookbackPeriod: 50,
    zScoreEntry: 2.0,
    zScoreExit: 0.5,
    zScoreStopLoss: 3.5,
    meanCalcMethod: 'SMA',
    stdCalcMethod: 'SIMPLE',
    bollingerBands: true,
    rsiConfirmation: true,
    volumeConfirmation: true,
    maxHoldingPeriod: 24 * 60 * 60 * 1000, // 24 hours
  }
}
```

---

### 4. Kron (TRF) - Trend Following

**Strategy:** Systematic trend following using multiple indicators.

**Features:**
- EMA crossover signals
- ADX trend strength
- Supertrend indicator
- MACD confirmation
- Combined signal scoring
- Pyramiding support
- ATR-based trailing stop

**Configuration:**
```typescript
{
  strategy: {
    trendMethod: 'COMBINED', // EMA_CROSS, ADX, SUPERTREND, COMBINED
    emaPeriods: { fast: 9, medium: 21, slow: 55 },
    adxThreshold: 25,
    supertrendPeriod: 10,
    supertrendMultiplier: 3,
    minTrendStrength: 0.6,
    trailingStop: {
      enabled: true,
      atrPeriod: 14,
      atrMultiplier: 3,
    },
    pyramidEnabled: true,
    maxPyramidLevels: 3,
    positionSizing: 'VOLATILITY_ADJUSTED',
  }
}
```

---

## Usage

### Starting a Bot

```typescript
// Start Reed (Statistical Arbitrage)
const response = await fetch('/api/institutional-bots/STA/start', {
  method: 'POST',
});
```

### Stopping a Bot

```typescript
// Stop Reed
const response = await fetch('/api/institutional-bots/STA/stop', {
  method: 'POST',
});
```

### Getting Bot Status

```typescript
// Get all bots status
const response = await fetch('/api/institutional-bots/status');
const { bots } = await response.json();
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/institutional-bots/status` | GET | Get all bots status |
| `/api/institutional-bots/[code]/start` | POST | Start a bot |
| `/api/institutional-bots/[code]/stop` | POST | Stop a bot |

---

## Risk Management

All bots share common risk configuration:

```typescript
{
  riskConfig: {
    maxPositionSize: number,     // Maximum position size in USD
    maxTotalExposure: number,    // Maximum total exposure
    maxDrawdownPct: number,      // Maximum drawdown percentage
    riskPerTrade: number,        // Risk per trade (fraction)
    maxLeverage: number,         // Maximum leverage
  }
}
```

---

## Implementation Notes

1. **No Neural Networks** - All bots use classical statistical methods only
2. **Event-driven** - Bots respond to price updates in real-time
3. **Stateful** - Each bot maintains its own state (positions, signals, stats)
4. **Tested** - All calculations are unit tested

---

## Performance Metrics

Each bot tracks:
- Total trades
- Win rate
- Average PnL
- Maximum drawdown
- Sharpe ratio
- Strategy-specific metrics
