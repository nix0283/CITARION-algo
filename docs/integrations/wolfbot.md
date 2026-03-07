# WolfBot Integration Documentation

## Overview

WolfBot is a cryptocurrency trading bot written in TypeScript/Node.js. This integration brings WolfBot's powerful features to CITARION, including 200+ technical indicators, multi-timeframe strategy engine, candlestick pattern recognition, auto trendline detection, and arbitrage capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CITARION Platform                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                      WolfBot Integration Layer                          │ │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │ │
│  │  │   Indicators    │ │ Multi-Timeframe │ │ Candlestick     │            │ │
│  │  │   (200+)        │ │ Strategy Engine │ │ Patterns (20+)  │            │ │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘            │ │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │ │
│  │  │ Auto Trendlines │ │ Arbitrage Module│ │  Full Analysis  │            │ │
│  │  │  Detection      │ │                 │ │    Generator    │            │ │
│  │  └─────────────────┘ └─────────────────┘ └─────────────────┘            │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Extended Indicators Library (`/src/lib/wolfbot/indicators.ts`)

200+ technical indicators organized by category:

#### Moving Averages
| Indicator | Description | Usage |
|-----------|-------------|-------|
| SMA | Simple Moving Average | Trend identification |
| EMA | Exponential Moving Average | Faster trend response |
| WMA | Weighted Moving Average | Weight recent prices more |
| HMA | Hull Moving Average | Smooth, low lag |
| VWMA | Volume Weighted MA | Volume-adjusted trend |
| SMMA | Smoothed MA (Wilder's) | RSI, ATR calculations |
| LSMA | Linear Regression MA | Trend prediction |
| DEMA | Double EMA | Reduced lag |
| TEMA | Triple EMA | Even less lag |

#### Momentum Indicators
| Indicator | Description | Signal Range |
|-----------|-------------|--------------|
| RSI | Relative Strength Index | 0-100 |
| MACD | Moving Average Convergence Divergence | Oscillator |
| Stochastic | Stochastic Oscillator | 0-100 |
| StochRSI | Stochastic RSI | 0-100 |
| Williams %R | Williams Percent Range | -100 to 0 |
| CCI | Commodity Channel Index | Unbounded |
| ROC | Rate of Change | Percentage |
| Momentum | Price momentum | Price difference |
| AO | Awesome Oscillator | Histogram |
| AC | Accelerator Oscillator | Histogram |

#### Volatility Indicators
| Indicator | Description | Output |
|-----------|-------------|--------|
| ATR | Average True Range | Price units |
| Bollinger Bands | Volatility bands | Upper/Middle/Lower |
| Keltner Channels | ATR-based channels | Upper/Middle/Lower |
| Donchian Channels | High/Low channels | Upper/Middle/Lower |
| Standard Deviation | Price volatility | Price units |
| Historical Volatility | Annualized volatility | Percentage |

#### Trend Indicators
| Indicator | Description | Output |
|-----------|-------------|--------|
| ADX | Average Directional Index | 0-100 + DI lines |
| Ichimoku | Ichimoku Cloud | 5 lines + cloud |
| Parabolic SAR | Stop and Reverse | Price level |
| Supertrend | Trend indicator | Price level |
| Vortex | Vortex Indicator | +VI/-VI |

#### Volume Indicators
| Indicator | Description | Output |
|-----------|-------------|--------|
| OBV | On-Balance Volume | Cumulative |
| VWAP | Volume Weighted Avg Price | Price level |
| MFI | Money Flow Index | 0-100 |
| CMF | Chaikin Money Flow | -1 to 1 |
| ADL | Accumulation/Distribution | Cumulative |
| Volume Oscillator | Volume momentum | Percentage |

#### Support/Resistance
| Indicator | Description | Output |
|-----------|-------------|--------|
| Pivot Points | Daily pivot levels | PP, R1-3, S1-3 |
| Fibonacci | Fib retracement levels | 7 levels |

```typescript
import { RSI, MACD, BollingerBands, ATR, ADX } from '@/lib/wolfbot';

const closes = candles.map(c => c.close);
const rsi = RSI(closes, 14);
const macd = MACD(closes, 12, 26, 9);
const bb = BollingerBands(closes, 20, 2);
const atr = ATR(candles, 14);
```

### 2. Multi-Timeframe Strategy Engine (`/src/lib/wolfbot/multi-timeframe.ts`)

Enables strategy chaining across different timeframes:

```
12h Trend ──▶ 1h MACD ──▶ 5min RSI ──▶ Entry Signal
    │              │            │
  Required     Required     Optional
```

#### Features
- **Strategy Chaining**: Connect strategies on different timeframes
- **Signal Aggregation**: Multiple modes (all, majority, weighted, any)
- **Built-in Strategies**: TrendDetector, MACDConfirmation, RSIEntry, BBEntry
- **Pre-built Pipelines**: TrendFollowing, Scalping, SwingTrading, MomentumCatch

```typescript
import { MultiTimeframeEngine, PREBUILT_PIPELINES } from '@/lib/wolfbot';

const engine = new MultiTimeframeEngine();

// Load candles for different timeframes
engine.updateCandles('12h', candles12h);
engine.updateCandles('1h', candles1h);
engine.updateCandles('5m', candles5m);

// Create custom pipeline
engine.createPipeline({
  name: 'MyStrategy',
  timeframes: [
    { interval: '12h', strategy: 'TrendDetector', required: true },
    { interval: '1h', strategy: 'MACDConfirmation', required: true },
    { interval: '5m', strategy: 'RSIEntry', required: false }
  ],
  aggregation: 'all',
  minConfidence: 0.5
});

// Run pipeline
const signal = engine.runPipeline('MyStrategy');
```

#### Aggregation Modes

| Mode | Description |
|------|-------------|
| `all` | All timeframes must agree |
| `majority` | Most timeframes win |
| `weighted` | Weight by timeframe importance |
| `any` | Any strong signal triggers |

### 3. Candlestick Patterns (`/src/lib/wolfbot/candlestick-patterns.ts`)

20+ candlestick pattern recognition:

#### Single Candle Patterns
| Pattern | Type | Signal |
|---------|------|--------|
| Doji | Neutral | Indecision |
| Dragonfly Doji | Bullish | Reversal |
| Gravestone Doji | Bearish | Reversal |
| Hammer | Bullish | Reversal |
| Inverted Hammer | Bullish | Reversal |
| Hanging Man | Bearish | Reversal |
| Shooting Star | Bearish | Reversal |
| Marubozu | Continuation | Strong momentum |
| Spinning Top | Neutral | Indecision |

#### Two Candle Patterns
| Pattern | Type | Signal |
|---------|------|--------|
| Bullish Engulfing | Bullish | Strong reversal |
| Bearish Engulfing | Bearish | Strong reversal |
| Tweezer Top | Bearish | Double rejection |
| Tweezer Bottom | Bullish | Double support |
| Piercing Line | Bullish | Reversal |
| Dark Cloud Cover | Bearish | Reversal |

#### Three Candle Patterns
| Pattern | Type | Signal |
|---------|------|--------|
| Morning Star | Bullish | Strong reversal |
| Evening Star | Bearish | Strong reversal |
| Three White Soldiers | Bullish | Strong continuation |
| Three Black Crows | Bearish | Strong continuation |
| Three Inside Up | Bullish | Reversal confirmation |
| Three Inside Down | Bearish | Reversal confirmation |
| Tri-Star | Reversal | Extreme indecision |

```typescript
import { scanCandlestickPatterns } from '@/lib/wolfbot';

const result = scanCandlestickPatterns(candles);

console.log('Strongest pattern:', result.strongestPattern?.name);
console.log('Overall signal:', result.overallSignal);
console.log('Confidence:', result.confidence);
console.log('All patterns:', result.patterns);
```

### 4. Auto Trendline Detection (`/src/lib/wolfbot/trendlines.ts`)

Automatic support/resistance and trendline detection:

#### Features
- **Pivot Point Detection**: Find local highs/lows using zigzag method
- **Trendline Construction**: Build valid trendlines from pivots
- **Support/Resistance Levels**: Cluster-based level detection
- **Breakout Signals**: Detect when price crosses levels
- **Trend Analysis**: Determine overall market trend

```typescript
import { analyzeTrendlines } from '@/lib/wolfbot';

const analysis = analyzeTrendlines(candles);

console.log('Current trend:', analysis.currentTrend);
console.log('Nearest support:', analysis.nearestSupport);
console.log('Nearest resistance:', analysis.nearestResistance);
console.log('Active trendlines:', analysis.trendlines);
console.log('Breakout signals:', analysis.breakoutSignals);
```

#### Trendline Properties
```typescript
interface Trendline {
  start: PivotPoint;
  end: PivotPoint;
  type: 'support' | 'resistance';
  slope: number;        // Price change per candle
  isValid: boolean;     // Not broken
  touchPoints: number;  // Number of touches
  breakouts: number;    // Times crossed
  currentPrice: number; // Current line value
}
```

### 5. Arbitrage Module (`/src/lib/wolfbot/arbitrage.ts`)

Cross-exchange arbitrage opportunity detection:

#### Features
- **Price Monitoring**: Track prices across multiple exchanges
- **Spread Calculation**: Real-time spread computation
- **Fee Calculation**: Account for trading fees
- **Opportunity Detection**: Find profitable arbitrage
- **Triangular Arbitrage**: Find 3-pair arbitrage paths

```typescript
import { ArbitrageEngine, EXCHANGE_FEES } from '@/lib/wolfbot';

const engine = new ArbitrageEngine({
  minSpreadPercent: 0.5,
  minProfitPercent: 0.3,
  exchanges: ['binance', 'bybit', 'okx'],
  pairs: ['BTC/USDT', 'ETH/USDT']
});

// Update prices
engine.updatePrice('binance', 'BTC/USDT', {
  exchange: 'binance',
  symbol: 'BTC/USDT',
  bid: 45000,
  ask: 45001,
  last: 45000,
  volume24h: 1000000,
  timestamp: Date.now()
});

// Scan for opportunities
const opportunities = engine.scan();

for (const opp of opportunities) {
  console.log(`${opp.pair.symbol}: Buy on ${opp.buyExchange} @ ${opp.buyPrice}`);
  console.log(`Sell on ${opp.sellExchange} @ ${opp.sellPrice}`);
  console.log(`Profit: ${opp.profitPercent.toFixed(2)}%`);
}
```

#### Exchange Fees
```typescript
const EXCHANGE_FEES = {
  binance: { maker: 0.001, taker: 0.001 },
  bybit: { maker: 0.001, taker: 0.001 },
  okx: { maker: 0.0008, taker: 0.001 },
  bitget: { maker: 0.0002, taker: 0.0006 },
  // ...
};
```

### 6. Full Analysis Generator

Combined analysis with all components:

```typescript
import { performFullAnalysis, generateSignal } from '@/lib/wolfbot';

const analysis = performFullAnalysis('BTC/USDT', candles, '1h');
const signal = generateSignal(analysis);

console.log('Action:', signal.action);     // 'buy' | 'sell' | 'hold'
console.log('Confidence:', signal.confidence); // 0-1
console.log('Reasons:', signal.reasons);   // String[]
```

## Usage Examples

### Complete Trading Signal

```typescript
import { 
  performFullAnalysis, 
  generateSignal,
  RSI,
  MACD,
  scanCandlestickPatterns,
  analyzeTrendlines
} from '@/lib/wolfbot';

async function generateTradingSignal(candles: Candle[]) {
  // Full analysis
  const analysis = performFullAnalysis('BTC/USDT', candles, '1h');
  
  // Generate signal
  const signal = generateSignal(analysis);
  
  // Additional checks
  if (signal.action === 'buy' && analysis.indicators.rsi && analysis.indicators.rsi < 25) {
    signal.confidence = Math.min(signal.confidence + 0.2, 1);
    signal.reasons.push('Strong oversold condition');
  }
  
  return {
    symbol: 'BTC/USDT',
    timestamp: Date.now(),
    signal,
    analysis: {
      trend: analysis.trend,
      rsi: analysis.indicators.rsi,
      nearestSupport: analysis.nearestSupport,
      nearestResistance: analysis.nearestResistance,
      patterns: analysis.patterns.patterns.map(p => p.name)
    }
  };
}
```

### Multi-Timeframe Strategy

```typescript
import { MultiTimeframeEngine, TrendDetectorStrategy, MACDConfirmationStrategy } from '@/lib/wolfbot';

const engine = new MultiTimeframeEngine();

// Add custom strategies
class CustomRSIStrategy extends BaseStrategy {
  constructor() {
    super('CustomRSI', '5m');
  }
  
  evaluate(candles: Candle[]): StrategySignal {
    const rsi = RSI(candles.map(c => c.close), 14);
    
    if (rsi && rsi < 30) {
      return this.createSignal('buy', 0.7, 'RSI oversold', { rsi });
    }
    
    return this.createSignal('hold', 0.3, 'RSI neutral');
  }
}

engine.registerStrategy(new CustomRSIStrategy());

// Create pipeline
engine.createPipeline({
  name: 'CustomPipeline',
  timeframes: [
    { interval: '4h', strategy: 'TrendDetector', required: true, weight: 2 },
    { interval: '1h', strategy: 'MACDConfirmation', required: true, weight: 1.5 },
    { interval: '5m', strategy: 'CustomRSI', required: false, weight: 1 }
  ],
  aggregation: 'weighted',
  minConfidence: 0.5
});
```

### Pattern-Based Entry

```typescript
import { scanCandlestickPatterns, MorningStar, BullishEngulfing } from '@/lib/wolfbot';

function checkEntry(candles: Candle[]): { enter: boolean; reason: string } {
  // Check for specific patterns
  const morningStar = MorningStar(candles);
  const bullishEngulfing = BullishEngulfing(
    candles[candles.length - 1],
    candles[candles.length - 2]
  );
  
  if (morningStar) {
    return { enter: true, reason: `Morning Star detected (${morningStar.confidence})` };
  }
  
  if (bullishEngulfing) {
    return { enter: true, reason: `Bullish Engulfing (${bullishEngulfing.confidence})` };
  }
  
  // Full pattern scan
  const result = scanCandlestickPatterns(candles);
  
  if (result.overallSignal === 'buy' && result.confidence > 0.6) {
    return { 
      enter: true, 
      reason: `${result.strongestPattern?.name} (${result.confidence})` 
    };
  }
  
  return { enter: false, reason: 'No strong pattern detected' };
}
```

## Integration with CITARION Bots

### DCA Bot Integration

```typescript
// Use multi-timeframe analysis for DCA entries
const engine = new MultiTimeframeEngine();
engine.createPipeline({
  name: 'DCAEntry',
  timeframes: [
    { interval: '1d', strategy: 'TrendDetector', required: true },
    { interval: '4h', strategy: 'BBEntry', required: false }
  ],
  aggregation: 'any',
  minConfidence: 0.7
});

// When DCA bot needs signal
const signal = engine.runPipeline('DCAEntry');
if (signal?.type === 'buy') {
  // Trigger DCA safety order
  dcaBot.placeSafetyOrder(signal.confidence);
}
```

### Grid Bot Integration

```typescript
// Use trendline detection for grid boundaries
const analysis = analyzeTrendlines(candles);

gridBot.configure({
  upperPrice: analysis.nearestResistance || currentPrice * 1.05,
  lowerPrice: analysis.nearestSupport || currentPrice * 0.95,
  levels: 10
});
```

### BB Bot Integration

```typescript
// Use pattern detection for BB signals
const patterns = scanCandlestickPatterns(candles);

if (patterns.strongestPattern?.type === 'bullish' && patterns.confidence > 0.6) {
  bbBot.prepareEntry(patterns.strongestPattern.name);
}
```

## Performance Considerations

1. **Indicator Caching**: Cache computed indicators when possible
2. **Incremental Updates**: Update indicators incrementally for real-time data
3. **Web Workers**: Move heavy calculations to web workers
4. **Timeframe Aggregation**: Aggregate lower timeframe candles to higher timeframes

## References

- [WolfBot GitHub](https://github.com/Ekliptor/WolfBot)
- [WolfBot Features](https://wolfbot.org/features/)
- [WolfBot Strategies](https://wolfbot.org/strategies/)
- [WolfBot Indicators](https://wolfbot.org/features/indicators/)
