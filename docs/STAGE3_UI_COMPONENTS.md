# CITARION Stage 3 UI Components

## Overview

This document describes all new UI components added in Stage 3 for institutional trading, risk management, and advanced analytics.

## Table of Contents

1. [Institutional Bots Panel](#institutional-bots-panel)
2. [Risk Management Dashboard](#risk-management-dashboard)
3. [Alert System Panel](#alert-system-panel)
4. [Signal Scorer Panel](#signal-scorer-panel)
5. [Genetic Optimizer Panel](#genetic-optimizer-panel)
6. [Volatility Panel](#volatility-panel)

---

## Institutional Bots Panel

**Location:** `/src/components/institutional-bots/institutional-bots-panel.tsx`

**Navigation:** Sidebar → "Inst. Bots"

### Description

Unified panel for managing 5 institutional-grade trading bots:

### Bots Included

| Bot | Code | Strategy | Description |
|-----|------|----------|-------------|
| **Spectrum** | PR | Pairs Trading | Cointegration-based pairs trading with Z-Score signals |
| **Reed** | STA | Statistical Arbitrage | PCA-based factor model trading |
| **Architect** | MM | Market Making | Inventory-skewed market making |
| **Equilibrist** | MR | Mean Reversion | KAMA-based mean reversion strategy |
| **Kron** | TRF | Trend Following | Multi-indicator trend following with pyramiding |

### Features

- **Tabbed Interface**: Easy switching between bots
- **Real-time Stats**: Total trades, win rate, PnL, drawdown, Sharpe ratio
- **Configuration Panel**: All strategy parameters in one place
- **Start/Stop Controls**: Quick bot management
- **Status Indicators**: Visual bot status (STOPPED/STARTING/RUNNING/ERROR)

### Usage

```tsx
import { InstitutionalBotsPanel } from "@/components/institutional-bots";

// In page.tsx
case "institutional-bots":
  return <InstitutionalBotsPanel />;
```

---

## Risk Management Dashboard

**Location:** `/src/components/risk-management/risk-dashboard.tsx`

**Navigation:** Sidebar → "Risk Mgmt"

### Description

Comprehensive risk management interface with 4 sub-panels:

### Components

#### 1. VaR Calculator

- **Methods**: Historical, Parametric, Monte Carlo
- **Confidence Levels**: 90%, 95%, 99%
- **Outputs**: VaR, Expected Shortfall (CVaR), Risk Percentage
- **Visual**: Risk gauge with LOW/MEDIUM/HIGH/CRITICAL levels

#### 2. Position Limiter

- **Limits**: Max position size, total exposure, positions per symbol
- **Real-time**: Current exposure tracking
- **Validation**: Pre-trade position validation
- **Visualization**: Exposure by symbol and sector

#### 3. Drawdown Monitor

- **Thresholds**: Warning (5%), Critical (10%), Breach (20%)
- **Timeframes**: Daily, weekly, monthly drawdown
- **Visual**: Color-coded drawdown gauge
- **Recovery**: Shows recovery percentage needed

#### 4. Kill Switch

- **States**: ARMED, TRIGGERED, RECOVERING, DISARMED
- **Auto-triggers**: Drawdown, VaR breach, Correlation, Liquidity
- **Manual Control**: Emergency trigger button
- **History**: Trigger event log

### Usage

```tsx
import { RiskDashboard } from "@/components/risk-management";

// In page.tsx
case "risk-management":
  return <RiskDashboard />;
```

---

## Alert System Panel

**Location:** `/src/components/alerts/alert-system-panel.tsx`

**Navigation:** Bottom sidebar → "Alerts"

### Description

Complete alert management system with multi-channel notifications.

### Features

#### Channels Tab
- **Telegram**: Bot token, chat ID configuration
- **Email**: SMTP settings (host, port, credentials)
- **Webhook**: URL and custom headers

#### Alert Rules Tab
- **Price Alerts**: Breakout, price change
- **Trade Alerts**: Execution notifications
- **Risk Alerts**: Drawdown warnings, limit breaches
- **Enable/Disable**: Toggle individual rules

#### Settings Tab
- **Rate Limiting**: Max per minute, hour, day, burst
- **Priority Levels**: Low, Normal, High, Critical
- **Global Toggle**: Enable/disable all alerts

#### History Tab
- **Alert Log**: Recent alerts with status
- **Clear Function**: Reset history

#### Test Tab
- **Test Alerts**: Send test notifications
- **Channel Selection**: Choose specific channels
- **Priority Setting**: Set alert priority

### Usage

```tsx
import { AlertSystemPanel } from "@/components/alerts";

// In page.tsx
case "alerts":
  return <AlertSystemPanel />;
```

---

## Signal Scorer Panel

**Location:** `/src/components/ml/signal-scorer-panel.tsx`

**Navigation:** Sidebar → "Signal Scorer"

### Description

Gradient Boosting-based signal quality scorer with 18 features.

### Features

#### Signal Input
- **Manual Entry**: Input all 18 features manually
- **Auto Mode**: Automatic feature extraction

#### Score Display
- **Circular Gauge**: 0-100 score with color coding
- **Quality Badges**: Poor/Fair/Good/Excellent
- **Confidence Level**: Signal confidence percentage

#### Feature Breakdown

**Price Features:**
- RSI (0-100)
- MACD Value
- Bollinger Position (0-1)
- Price vs SMA/EMA

**Technical Features:**
- Volume Ratio
- ATR Ratio
- Stochastic RSI
- ADX (Trend Strength)

**Volume Features:**
- Volume Change
- OBV Slope
- Volume Trend

**Trend Features:**
- EMA Cross Signal
- Supertrend Direction
- Ichimoku Signal

**Market Context:**
- BTC Correlation
- Market Sentiment
- Funding Rate

#### Feature Importance Chart
- **Bar Chart**: Horizontal bars showing feature importance
- **Sorted**: Most important features first

### Usage

```tsx
import { SignalScorerPanel } from "@/components/ml";

// In page.tsx
case "signal-scorer":
  return <SignalScorerPanel />;
```

---

## Genetic Optimizer Panel

**Location:** `/src/components/self-learning/genetic-optimizer-panel.tsx`

**Navigation:** Sidebar → "Self Learning"

### Description

Self-learning genetic algorithm for strategy optimization.

### Features

#### Population Configuration
- **Population Size**: Number of chromosomes
- **Max Generations**: Evolution limit
- **Elite Count**: Top performers preserved
- **Mutation Rate**: Probability of mutation
- **Crossover Rate**: Probability of crossover
- **Early Stopping**: Stop if no improvement

#### Selection Methods
- **Tournament**: Select best from random subset
- **Roulette Wheel**: Probability proportional to fitness
- **Rank Selection**: Selection by fitness ranking
- **Elitist**: Always preserve top performers

#### Crossover Methods
- **Single Point**: One crossover point
- **Two Point**: Two crossover points
- **Uniform**: Random gene selection
- **Blend (BLX-α)**: Intermediate values

#### Mutation Methods
- **Random**: Random value in range
- **Gaussian**: Normal distribution perturbation
- **Adaptive**: Self-adjusting rate

#### Visualization
- **Fitness Evolution Chart**: Best/Average/Worst fitness over generations
- **Population Diversity**: Genetic diversity tracking
- **Top Chromosomes Table**: Best performing genomes

### Usage

```tsx
import { GeneticOptimizerPanel } from "@/components/self-learning";

// In page.tsx
case "self-learning":
  return <GeneticOptimizerPanel />;
```

---

## Volatility Panel

**Location:** `/src/components/volatility/volatility-panel.tsx`

**Navigation:** Sidebar → "Volatility"

### Description

GARCH-based volatility analysis and forecasting.

### Features

#### Model Selection
- **GARCH(1,1)**: Standard GARCH model
- **GJR-GARCH**: Asymmetric (leverage effect)
- **EGARCH**: Exponential GARCH

#### Parameters Configuration
- **Omega (ω)**: Constant term
- **Alpha (α)**: ARCH coefficient
- **Beta (β)**: GARCH coefficient
- **Gamma (γ)**: Asymmetry parameter

#### Volatility Display
- **Current Volatility**: Real-time percentage
- **Volatility Regime**: Low/Normal/High/Extreme
- **Historical Summary**: Min/Max/Mean/StdDev

#### Charts
- **Volatility Forecast**: Historical + forecasted volatility
- **Conditional Volatility**: Last 100 data points

#### Model Fit Statistics
- **AIC**: Akaike Information Criterion
- **BIC**: Bayesian Information Criterion
- **Log-likelihood**: Model fit quality

### Usage

```tsx
import { VolatilityPanel } from "@/components/volatility";

// In page.tsx
case "volatility":
  return <VolatilityPanel />;
```

---

## Component Architecture

### File Structure

```
src/components/
├── institutional-bots/
│   ├── index.ts
│   └── institutional-bots-panel.tsx
├── risk-management/
│   ├── index.ts
│   └── risk-dashboard.tsx
├── alerts/
│   ├── index.ts
│   └── alert-system-panel.tsx
├── ml/
│   ├── signal-scorer-panel.tsx
│   └── ml-filtering-panel.tsx
├── self-learning/
│   ├── index.ts
│   └── genetic-optimizer-panel.tsx
└── volatility/
    └── volatility-panel.tsx
```

### Integration Pattern

All components follow the same pattern:

1. **Import** in `/src/app/page.tsx`
2. **Add case** to `renderContent()` switch
3. **Add menu item** to sidebar navigation

---

## Backend Integration

Each UI component connects to corresponding backend module:

| UI Component | Backend Module | API Routes |
|--------------|----------------|------------|
| Institutional Bots | `/src/lib/institutional-bots/` | `/api/bots/institutional/` |
| Risk Dashboard | `/src/lib/risk-management/` | `/api/risk/` |
| Alert System | `/src/lib/alert-system/` | `/api/alerts/` |
| Signal Scorer | `/src/lib/gradient-boosting/` | `/api/ml/gradient-boosting/` |
| Genetic Optimizer | `/src/lib/self-learning/` | `/api/optimization/genetic/` |
| Volatility | `/src/lib/volatility/` | `/api/volatility/` |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.4.0 | 2025-01 | Initial Stage 3 UI components |
| 1.4.1 | 2025-01 | Added common-types.ts and statistics.ts utilities |

---

## Support

For issues or questions about these components:

1. Check component documentation
2. Review backend module types
3. Consult API documentation
4. Contact development team
