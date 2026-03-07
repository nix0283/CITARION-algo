# GARCH Volatility Analysis

## Overview

GARCH (Generalized Autoregressive Conditional Heteroskedasticity) volatility analysis module for the CITARION trading platform. Provides institutional-grade volatility forecasting and risk management.

## Features

### Core GARCH Models
- **GARCH(1,1)** - Standard volatility model
- **GJR-GARCH** - Asymmetric volatility model (captures leverage effect)
- **EGARCH** - Exponential GARCH (logarithmic formulation)

### Integration Components

#### 1. Trading Bots Integration
Location: `/src/lib/volatility/garch-integration-service.ts`

Provides risk adjustments for:
- **DCA Bot** - Position sizing based on volatility regime
- **BB Bot** - Dynamic stop-loss/take-profit adjustment
- **ORION Bot** - Risk-weighted signal filtering
- **GRID Bot** - Volatility-adaptive grid spacing
- **MFT Bot** - Frequency-based risk adjustment

```typescript
import { getGARCHIntegrationService, type BotType } from '@/lib/volatility';

const service = getGARCHIntegrationService();
const adjustment = service.getRiskAdjustment('BTCUSDT', 'DCA');

// Returns:
// {
//   positionSizeMultiplier: 0.6,     // Reduce in high vol
//   stopLossMultiplier: 1.5,         // Wider in high vol
//   shouldHaltTrading: false,        // True in extreme vol
//   ...
// }
```

#### 2. LOGOS Meta Bot Integration
Location: `/src/lib/logos-bot/garch-integration.ts`

Adjusts signal weights based on volatility:
- Low volatility: Boost signal confidence (+5%)
- Normal volatility: No adjustment
- High volatility: Reduce confidence (-10%)
- Extreme volatility: Significant reduction (-25%), consider halting

```typescript
import { getLOGOSGARCHIntegration } from '@/lib/logos-bot/garch-integration';

const logosGarch = getLOGOSGARCHIntegration();
const adjusted = logosGarch.adjustAggregatedSignal(signal, context);
```

#### 3. Gradient Boosting Features
Location: `/src/lib/volatility/garch-feature-provider.ts`

Provides GARCH-based features for ML models:
- `garch_forecast_1d` - 1-day ahead volatility forecast
- `garch_forecast_5d` - 5-day ahead forecast
- `garch_forecast_10d` - 10-day ahead forecast
- `volatility_regime` - Encoded regime (0-1)
- `volatility_trend` - Trend direction (0-1)
- `volatility_persistence` - GARCH persistence (α + β)
- `conditional_volatility_ratio` - Current vs average ratio

```typescript
import { getGARCHFeatureProvider } from '@/lib/volatility';

const provider = getGARCHFeatureProvider();
const features = await provider.getFeatures('BTCUSDT');
```

#### 4. Training Data Collector
Location: `/src/lib/volatility/garch-training-collector.ts`

Collects forecasts and actual outcomes for:
- Forecast accuracy measurement (MAPE)
- Bias detection (over/under estimation)
- Model drift detection
- Adaptive parameter improvement

```typescript
import { getGARCHTrainingCollector } from '@/lib/volatility';

const collector = getGARCHTrainingCollector();
collector.start(); // Begin monitoring

// Record forecast
collector.recordForecast('BTCUSDT', context);

// Update with actual
collector.updateWithActual('BTCUSDT', actualVolatility);

// Get metrics
const metrics = collector.getAccuracyMetrics('BTCUSDT');
```

## API Endpoints

### GARCH Analysis
- `GET /api/volatility?symbol=BTCUSDT&model=GARCH` - Quick analysis
- `POST /api/volatility` - Full analysis with parameters

### GARCH Service (Bot Integration)
- `GET /api/volatility/service?action=summary` - Service summary
- `GET /api/volatility/service?action=adjustment&symbol=BTCUSDT&botType=DCA` - Get risk adjustment
- `GET /api/volatility/service?action=forecast&symbol=BTCUSDT&days=10` - Get forecast
- `POST /api/volatility/service?action=initialize` - Initialize symbol
- `POST /api/volatility/service?action=update` - Update with new price

## Volatility Regimes

| Regime | Ratio to Average | Position Size | Stop Loss | Action |
|--------|-----------------|---------------|-----------|--------|
| Low | < 50% | +20% | 0.8x | Increase positions |
| Normal | 50-100% | Standard | 1.0x | Standard trading |
| High | 100-150% | -40% | 1.5x | Reduce risk |
| Extreme | > 150% | -80% | 2.0x | Consider halting |

## Model Parameters

### GARCH(1,1)
- ω (omega) - Constant term
- α (alpha) - ARCH coefficient (recent shocks)
- β (beta) - GARCH coefficient (past volatility)
- Persistence = α + β (should be < 1 for stationarity)

### GJR-GARCH
- Additional γ (gamma) for asymmetric response
- Captures leverage effect (negative returns → higher volatility)

### EGARCH
- Logarithmic formulation (no positivity constraints)
- Better handling of asymmetric effects

## Technical Implementation

### No Neural Networks
This module uses classical econometric methods only:
- Maximum Likelihood Estimation (MLE)
- Numerical gradient optimization
- AIC/BIC model selection

### Real-time Data
- Fetches historical prices from Binance API
- Updates model on new price data
- Caches volatility context for performance

## References

1. Bollerslev, T. (1986). "Generalized Autoregressive Conditional Heteroskedasticity"
2. Glosten, L.R., Jagannathan, R., Runkle, D.E. (1993). "On the Relation between the Expected Value and the Volatility of the Nominal Excess Return on Stocks" (GJR-GARCH)
3. Nelson, D.B. (1991). "Conditional Heteroskedasticity in Asset Returns: A New Approach" (EGARCH)
