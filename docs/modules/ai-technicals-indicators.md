# AI-Technicals Indicators

> Ported from [ai-technicals](https://github.com/sanzol-tech/ai-technicals) - Java library with 40+ technical indicators

This document describes the advanced indicators ported from the ai-technicals library to CITARION. These indicators provide unique capabilities for market analysis, including order book depth analysis, pivot points with 5 calculation methods, and the comprehensive Ichimoku Cloud system.

## Overview

The ai-technicals library provided several unique indicators not commonly found in trading platforms:

| Category | Indicators | Unique Feature |
|----------|------------|----------------|
| **Depth** | 6 indicators | Order book microstructure analysis |
| **Pivot Points** | 5 types | Multiple calculation methods |
| **Ichimoku** | Full system | 5-line trend analysis |
| **Fractals** | Williams | Reversal detection |

## Table of Contents

1. [Pivot Points](#pivot-points)
2. [Ichimoku Cloud](#ichimoku-cloud)
3. [Depth Indicators](#depth-indicators)
4. [Williams Fractals](#williams-fractals)
5. [Usage Examples](#usage-examples)
6. [API Reference](#api-reference)

---

## Pivot Points

Pivot Points are significant price levels used by traders to determine potential support and resistance levels. CITARION implements 5 different calculation methods, each with its own characteristics and use cases.

### Supported Types

#### 1. Standard (Floor) Pivot Points

The most commonly used pivot point calculation, based on the previous period's High, Low, and Close prices.

```
Pivot (PP) = (High + Low + Close) / 3
R1 = 2 * PP - Low
S1 = 2 * PP - High
R2 = PP + (High - Low)
S2 = PP - (High - Low)
R3 = High + 2 * (PP - Low)
S3 = Low - 2 * (High - PP)
```

**Best for:** General trading, intraday support/resistance levels.

#### 2. Fibonacci Pivot Points

Uses Fibonacci retracement levels to calculate support and resistance, popular among traders who use Fibonacci analysis.

```
Pivot (PP) = (High + Low + Close) / 3
R1 = PP + 0.382 * (High - Low)
S1 = PP - 0.382 * (High - Low)
R2 = PP + 0.618 * (High - Low)
S2 = PP - 0.618 * (High - Low)
R3 = PP + 1.000 * (High - Low)
S3 = PP - 1.000 * (High - Low)
```

**Best for:** Markets with strong Fibonacci-based trading communities, cryptocurrency trading.

#### 3. Camarilla Pivot Points

Developed by Nick Stott, uses a unique formula that tends to be more precise for intraday trading.

```
R4 = Close + (High - Low) * 1.1 / 2
R3 = Close + (High - Low) * 1.1 / 4
R2 = Close + (High - Low) * 1.1 / 6
R1 = Close + (High - Low) * 1.1 / 12
S1 = Close - (High - Low) * 1.1 / 12
S2 = Close - (High - Low) * 1.1 / 6
S3 = Close - (High - Low) * 1.1 / 4
S4 = Close - (High - Low) * 1.1 / 2
```

**Best for:** Day trading, scalping, high-frequency trading strategies.

#### 4. Woodie Pivot Points

Gives more weight to the closing price in the calculation, making it more responsive to recent price action.

```
Pivot (PP) = (High + Low + 2 * Close) / 4
R1 = 2 * PP - Low
S1 = 2 * PP - High
R2 = PP + High - Low
S2 = PP - High + Low
```

**Best for:** Trend-following strategies, markets where close price is significant.

#### 5. Demark Pivot Points

Created by Tom DeMark, uses the relationship between open and close prices to determine the calculation formula.

```
If Close < Open: X = High + 2 * Low + Close
If Close > Open: X = 2 * High + Low + Close
If Close = Open: X = High + Low + 2 * Close

Pivot (PP) = X / 4
R1 = X / 2 - Low
S1 = X / 2 - High
```

**Best for:** Markets with clear open/close sessions (stocks, futures), reversal trading.

### Period Support

All pivot point types support three timeframes:

- **Daily** (default): Uses previous day's HLC
- **Weekly**: Uses previous week's HLC
- **Monthly**: Uses previous month's HLC

### Configuration

```typescript
interface PivotConfig {
  type: 'standard' | 'fibonacci' | 'camarilla' | 'woodie' | 'demark';
  useWeekly: boolean;      // Use weekly instead of daily
  useMonthly: boolean;     // Use monthly instead of daily
}
```

---

## Ichimoku Cloud

Ichimoku Kinko Hyo ("one glance equilibrium chart") is a comprehensive indicator that defines support and resistance, identifies trend direction, measures momentum, and provides trading signals.

### Components

| Component | Japanese | Default Period | Formula |
|-----------|----------|----------------|---------|
| **Tenkan-sen** | Conversion Line | 9 | (9-period High + 9-period Low) / 2 |
| **Kijun-sen** | Base Line | 26 | (26-period High + 26-period Low) / 2 |
| **Senkou Span A** | Leading Span A | 26 (displaced) | (Tenkan + Kijun) / 2 |
| **Senkou Span B** | Leading Span B | 52 (displaced) | (52-period High + 52-period Low) / 2 |
| **Chikou Span** | Lagging Span | 26 (back) | Close price |

### Cloud (Kumo)

The cloud is formed between Senkou Span A and Senkou Span B:

- **Bullish Cloud**: Senkou A > Senkou B (green)
- **Bearish Cloud**: Senkou A < Senkou B (red)

### Trading Signals

The Ichimoku system provides four main signal types:

#### 1. TK Cross (Tenkan-Kijun Cross)

A momentum signal when the Tenkan-sen crosses the Kijun-sen.

- **Bullish**: Tenkan crosses above Kijun
- **Bearish**: Tenkan crosses below Kijun
- **Strength**: Determined by price position relative to cloud

#### 2. Kumo Breakout

Price breaks through the cloud boundary.

- **Bullish**: Price closes above cloud top
- **Bearish**: Price closes below cloud bottom
- **Strong signal**: Often indicates trend change

#### 3. Chikou Cross

The Chikou Span (lagging span) crosses the price 26 periods ago.

- **Bullish**: Chikou crosses above historical price
- **Bearish**: Chikou crosses below historical price

#### 4. Kijun Cross

Price crosses the Kijun-sen (base line).

- **Bullish**: Price crosses above Kijun
- **Bearish**: Price crosses below Kijun
- **Use for**: Entry/exit timing in trending markets

### Configuration

```typescript
interface IchimokuConfig {
  tenkanPeriod: number;    // Default: 9
  kijunPeriod: number;     // Default: 26
  senkouBPeriod: number;   // Default: 52
  displacement: number;    // Default: 26
}
```

### Market Analysis

The `analyzeIchimokuMarket()` function provides comprehensive market state:

```typescript
{
  trend: 'bullish' | 'bearish' | 'neutral',
  cloudPosition: 'above' | 'below' | 'inside',
  signal: string,
  recommendations: string[]
}
```

---

## Depth Indicators

Depth indicators analyze order book (Level 2) data to extract trading signals that traditional price-based indicators cannot capture. These indicators provide insights into market microstructure.

### Available Indicators

#### 1. Depth Delta

Measures the bid/ask volume imbalance.

```
Delta = Bid Volume - Ask Volume
```

- **Positive Delta**: Buy pressure (more bids than asks)
- **Negative Delta**: Sell pressure (more asks than bids)

**Use for:** Identifying short-term price direction, detecting hidden liquidity.

#### 2. Depth Imbalance

Normalized version of delta, ranging from -1 to 1.

```
Imbalance = (Bid Volume - Ask Volume) / (Bid Volume + Ask Volume)
```

- **+1**: 100% bids (extreme buy pressure)
- **-1**: 100% asks (extreme sell pressure)
- **0**: Balanced book

**Use for:** Comparing imbalance across different assets, oscillator-style analysis.

#### 3. Weighted Mid Price

A more accurate price estimate than simple mid-price when there's volume imbalance.

```
Weighted Mid = (BidVWAP * BidVolume + AskVWAP * AskVolume) / TotalVolume
```

**Use for:** Entry/exit pricing, algorithmic trading, reducing slippage.

#### 4. Depth True Range

Similar to ATR but calculated from order book depth.

```
DTR = max(BidRange, AskRange, Spread)
```

**Use for:** Measuring market liquidity, volatility from microstructure.

#### 5. Weighted Points

Identifies significant price levels based on volume concentration.

```typescript
interface WeightedPoint {
  price: number;
  volume: number;
  weight: number;
  cumulativeVolume: number;
  type: 'support' | 'resistance';
}
```

**Use for:** Finding hidden support/resistance levels, volume profile analysis.

#### 6. Block Points

Detects large orders (whale orders) in the order book.

```typescript
interface BlockPoint {
  time: Time;
  side: 'bid' | 'ask';
  price: number;
  volume: number;
  notional: number;
  isLarge: boolean;
  distanceFromMid: number;
}
```

**Use for:** Whale watching, identifying significant price levels.

### Configuration

```typescript
interface DepthConfig {
  levels: number;           // Number of depth levels to analyze (default: 20)
  aggregation: number;      // Price aggregation step (default: 0)
  minVolume: number;        // Minimum volume to consider (default: 0)
  largeOrderThreshold: number; // Volume threshold for large orders (default: auto)
}
```

### Order Book Data Structure

```typescript
interface OrderBookSnapshot {
  time: Time;
  symbol: string;
  bids: DepthLevel[];  // Sorted by price descending (best bid first)
  asks: DepthLevel[];  // Sorted by price ascending (best ask first)
  timestamp: number;
}

interface DepthLevel {
  price: number;
  volume: number;
}
```

### Support/Resistance Detection

The `detectSupportResistance()` function combines block points and weighted points to identify key levels:

```typescript
{
  supports: Array<{ price: number; strength: number }>;
  resistances: Array<{ price: number; strength: number }>;
}
```

---

## Williams Fractals

Williams Fractals are reversal patterns developed by Bill Williams that identify potential turning points in price action. A fractal is a series of at least 5 consecutive bars where the middle bar has the highest high (bearish fractal) or lowest low (bullish fractal).

### Pattern Formation

#### Bullish Fractal
A bullish fractal forms when a candle has the lowest low surrounded by higher lows on both sides:

```
Pattern: High Low High Low (LOWEST) Low High Low High
                             ^ Fractal Low (Support)
```

- **Middle candle** has the lowest low
- **2 candles on each side** have higher lows
- Indicates potential **support level**
- Buy signal when price breaks above the fractal

#### Bearish Fractal
A bearish fractal forms when a candle has the highest high surrounded by lower highs on both sides:

```
Pattern: Low High Low High (HIGHEST) High Low High Low
                             ^ Fractal High (Resistance)
```

- **Middle candle** has the highest high
- **2 candles on each side** have lower highs
- Indicates potential **resistance level**
- Sell signal when price breaks below the fractal

### Configuration

```typescript
interface FractalsConfig {
  period: number;         // Number of bars on each side (default: 2)
  showBullish: boolean;   // Show bullish fractals (default: true)
  showBearish: boolean;   // Show bearish fractals (default: true)
}
```

### Detection Functions

| Function | Description |
|----------|-------------|
| `detectFractals(candles, config)` | Detect all fractals and return analysis |
| `calculateFractals(candles, config)` | Calculate fractals for chart rendering |
| `detectFractalSignals(candles, config)` | Generate trading signals from fractal breaks |
| `getFractalLevels(candles, config)` | Get support/resistance levels from fractals |
| `findNearestFractalLevels(candles, price, config)` | Find nearest fractal levels to current price |

### Trading Signals

Fractals generate trading signals when price breaks through a fractal level:

1. **Bullish Signal**: Price breaks above a bearish fractal (resistance becomes support)
2. **Bearish Signal**: Price breaks below a bullish fractal (support becomes resistance)

Signal strength is determined by the recency of the fractal:
- **Strong**: Fractal formed within last 5 candles
- **Moderate**: Fractal formed within last 15 candles
- **Weak**: Fractal formed more than 15 candles ago

### Fractal Analysis Result

```typescript
interface FractalsAnalysis {
  bullishFractals: FractalPoint[];   // All bullish fractals
  bearishFractals: FractalPoint[];   // All bearish fractals
  lastBullish: FractalPoint | null;  // Most recent bullish fractal
  lastBearish: FractalPoint | null;  // Most recent bearish fractal
  supportLevels: number[];           // Recent bullish fractal lows
  resistanceLevels: number[];        // Recent bearish fractal highs
}
```

### Use Cases

| Use Case | Description |
|----------|-------------|
| **Support/Resistance** | Fractal levels act as dynamic S/R |
| **Trend Reversal** | Fractal breaks indicate potential reversals |
| **Entry Timing** | Enter on fractal breakouts |
| **Stop Loss** | Place stops behind recent fractals |
| **Multi-timeframe** | Combine fractals from different timeframes |

---

## Usage Examples

### Pivot Points

```typescript
import { calculatePivotPoints, calculateCurrentPivots, PivotType } from '@/lib/indicators/pivot';

// Calculate pivot points from candles
const result = calculatePivotPoints(candles, {
  type: 'standard',
  useWeekly: false,
  useMonthly: false
});

// Get current pivot levels for display
const pivots = calculateCurrentPivots(high, low, close, open);
const standardPivot = pivots.get('standard');
console.log(`PP: ${standardPivot.pivot}, R1: ${standardPivot.r1}, S1: ${standardPivot.s1}`);
```

### Ichimoku Cloud

```typescript
import {
  calculateIchimoku,
  detectIchimokuSignals,
  analyzeIchimokuMarket
} from '@/lib/indicators/ichimoku';

// Calculate Ichimoku with custom parameters
const result = calculateIchimoku(candles, {
  tenkanPeriod: 9,
  kijunPeriod: 26,
  senkouBPeriod: 52,
  displacement: 26
});

// Detect trading signals
const signals = detectIchimokuSignals(candles, ichimokuData);

// Analyze current market state
const analysis = analyzeIchimokuMarket(currentPrice, currentIchimoku);
console.log(`Trend: ${analysis.trend}, Signal: ${analysis.signal}`);
```

### Depth Indicators

```typescript
import {
  analyzeDepth,
  calculateBlockPoints,
  detectSupportResistance
} from '@/lib/indicators/depth';

// Analyze order book
const analysis = analyzeDepth(orderBook, { levels: 20 });
console.log(`Pressure: ${analysis.pressure}, Strength: ${analysis.strength}%`);
console.log(`Imbalance: ${(analysis.imbalance * 100).toFixed(2)}%`);

// Find large orders
const blocks = calculateBlockPoints(orderBook, {
  largeOrderThreshold: 1000 // Custom threshold
});
const largeOrders = blocks.filter(b => b.isLarge);

// Detect support/resistance
const levels = detectSupportResistance(orderBook);
console.log('Supports:', levels.supports.slice(0, 3));
console.log('Resistances:', levels.resistances.slice(0, 3));
```

### Williams Fractals

```typescript
import {
  detectFractals,
  detectFractalSignals,
  findNearestFractalLevels
} from '@/lib/indicators/fractals';

// Detect all fractals
const analysis = detectFractals(candles, { period: 2 });
console.log(`Bullish fractals: ${analysis.bullishFractals.length}`);
console.log(`Bearish fractals: ${analysis.bearishFractals.length}`);

// Get trading signals from fractal breaks
const signals = detectFractalSignals(candles);
const bullishSignals = signals.filter(s => s.type === 'bullish');

// Find nearest support/resistance from fractals
const currentPrice = 45000;
const nearest = findNearestFractalLevels(candles, currentPrice);
console.log(`Nearest support: ${nearest.nearestSupport?.price}`);
console.log(`Nearest resistance: ${nearest.nearestResistance?.price}`);
```

---

## API Reference

### Pivot Points Module

| Function | Description |
|----------|-------------|
| `calculatePivotPoints(candles, config)` | Calculate pivot points for all candles |
| `calculateCurrentPivots(h, l, c, o)` | Get current pivot levels |
| `findNearestLevel(price, pivot)` | Find nearest support/resistance |
| `formatPivotPoints(pivots)` | Format for display |

### Ichimoku Module

| Function | Description |
|----------|-------------|
| `calculateIchimoku(candles, config)` | Calculate full Ichimoku system |
| `calculateIchimokuWithFuture(candles, config)` | Include future cloud projection |
| `detectIchimokuSignals(candles, data)` | Detect trading signals |
| `analyzeIchimokuMarket(price, ichimoku)` | Analyze market state |
| `getIchimokuAtCandle(candles, index, config)` | Get Ichimoku at specific candle |

### Depth Module

| Function | Description |
|----------|-------------|
| `analyzeDepth(orderBook, config)` | Complete depth analysis |
| `calculateDepthDelta(orderBook, config)` | Bid/ask volume delta |
| `calculateDepthImbalance(orderBook, config)` | Normalized imbalance |
| `calculateWeightedMidPrice(orderBook, config)` | Volume-weighted mid price |
| `calculateDepthTrueRange(orderBook, config)` | Depth-based range |
| `calculateWeightedPoints(orderBook, config)` | Volume-weighted levels |
| `calculateBlockPoints(orderBook, config)` | Large order detection |
| `detectSupportResistance(orderBook, config)` | S/R from order book |

### Fractals Module

| Function | Description |
|----------|-------------|
| `detectFractals(candles, config)` | Detect all fractals and return analysis |
| `calculateFractals(candles, config)` | Calculate fractals for chart rendering |
| `detectFractalSignals(candles, config)` | Generate trading signals from fractal breaks |
| `getFractalLevels(candles, config)` | Get support/resistance levels from fractals |
| `findNearestFractalLevels(candles, price, config)` | Find nearest fractal levels to current price |
| `formatFractals(analysis)` | Format for display |

---

## Implementation Files

| File | Description |
|------|-------------|
| `/src/lib/indicators/pivot.ts` | Pivot Points implementation |
| `/src/lib/indicators/ichimoku.ts` | Ichimoku Cloud implementation |
| `/src/lib/indicators/depth.ts` | Depth Indicators implementation |
| `/src/lib/indicators/fractals.ts` | Williams Fractals implementation |
| `/src/lib/indicators/builtin.ts` | Indicator definitions |
| `/src/lib/indicators/calculator.ts` | Calculator integration |

---

## Integration with CITARION

### Chart Rendering

All indicators return `IndicatorResult` compatible with lightweight-charts:

```typescript
interface IndicatorResult {
  id: string;
  overlay: boolean;
  lines: Array<{
    name: string;
    data: (LineData<Time> | WhitespaceData<Time>)[];
    color: string;
  }>;
  histograms: Array<{
    name: string;
    data: (HistogramData<Time> | WhitespaceData<Time>)[];
    color: string;
  }>;
}
```

### Signal Engine Integration

Ichimoku signals can be integrated with the Signal Engine:

```typescript
const ichimokuSignals = detectIchimokuSignals(candles, ichimokuData);
// Convert to Signal Engine format
const signals = ichimokuSignals.map(s => ({
  type: s.direction === 'bullish' ? 'BUY' : 'SELL',
  strength: s.strength === 'strong' ? 3 : s.strength === 'weak' ? 1 : 2,
  indicator: 'ichimoku',
  reason: s.type
}));
```

### Risk Manager Integration

Depth indicators can inform risk decisions:

```typescript
const depth = analyzeDepth(orderBook);
// Adjust position size based on liquidity
const liquidityFactor = Math.min(1, depth.strength / 100);
const adjustedSize = baseSize * liquidityFactor;
```

---

## Notes

1. **Depth Indicators** require real-time order book data, which is not available from OHLCV candles. These indicators need a WebSocket connection to exchange depth endpoints.

2. **Pivot Points** are calculated from previous period data, so the first period will have null values.

3. **Ichimoku Cloud** requires at least 52 candles (default Senkou B period) for full calculation.

4. **Signal Detection** works best with higher timeframes (1H, 4H, Daily) for Ichimoku, while Depth indicators are useful for all timeframes including tick data.
