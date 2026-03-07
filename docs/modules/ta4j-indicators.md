# Ta4j-Inspired Indicators

> Ported from [Ta4j](https://github.com/ta4j/ta4j) - Java library with 200+ technical indicators

This document describes the popular technical indicators ported from the Ta4j library to CITARION. These indicators cover trend following, volume analysis, price transformation, and reversal detection.

## Overview

| Indicator | Category | Purpose |
|-----------|----------|---------|
| **SuperTrend** | Trend | Trend-following with dynamic support/resistance |
| **VWAP** | Volume | Institutional price benchmark |
| **Heikin-Ashi** | Transform | Smoothed candlestick representation |
| **Renko** | Transform | Brick-based price movement |
| **Keltner Channel** | Volatility | ATR-based price envelope |
| **Mass Index** | Oscillator | Reversal detection |

---

## SuperTrend

SuperTrend is a trend-following indicator that uses ATR (Average True Range) to determine trend direction and provide dynamic support/resistance levels.

### Formula

```
Basic Upper Band = (High + Low) / 2 + (Multiplier × ATR)
Basic Lower Band = (High + Low) / 2 - (Multiplier × ATR)

Final Upper Band = Basic Upper if:
  - Basic Upper < Previous Final Upper, OR
  - Close > Previous Final Upper
Otherwise: Final Upper = Previous Final Upper

Final Lower Band = Basic Lower if:
  - Basic Lower > Previous Final Lower, OR
  - Close < Previous Final Lower
Otherwise: Final Lower = Previous Final Lower

SuperTrend = Final Upper if Close ≤ Final Upper
           = Final Lower if Close > Final Upper
```

### Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `period` | 10 | 1-100 | ATR calculation period |
| `multiplier` | 3.0 | 0.1-10.0 | ATR multiplier for bands |

### Usage

```typescript
import { calculateSuperTrend, getSuperTrendWithDirection } from '@/lib/indicators/ta4j-port';

// Calculate for chart display
const result = calculateSuperTrend(candles, {
  period: 10,
  multiplier: 3.0,
});

// Get detailed results with direction
const trendData = getSuperTrendWithDirection(candles, { period: 10, multiplier: 3 });

trendData.forEach(point => {
  console.log(`Time: ${point.time}`);
  console.log(`SuperTrend: ${point.value}`);
  console.log(`Direction: ${point.direction === 1 ? 'Bullish' : 'Bearish'}`);
  console.log(`Trend Changed: ${point.trendChanged}`);
});
```

### Trading Signals

| Signal | Condition |
|--------|-----------|
| **Buy** | SuperTrend flips from bearish to bullish (price closes above upper band) |
| **Sell** | SuperTrend flips from bullish to bearish (price closes below lower band) |
| **Support** | In bullish trend, SuperTrend line acts as dynamic support |
| **Resistance** | In bearish trend, SuperTrend line acts as dynamic resistance |

---

## VWAP (Volume Weighted Average Price)

VWAP calculates the average price weighted by volume. It's widely used by institutional traders as a benchmark for execution quality.

### Formula

```
Typical Price = (High + Low + Close) / 3
VWAP = Σ(Typical Price × Volume) / Σ(Volume)

Upper Band = VWAP + (1 × Standard Deviation)
Lower Band = VWAP - (1 × Standard Deviation)
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `stddevPeriod` | 20 | Period for standard deviation calculation |
| `resetDaily` | false | Reset VWAP at start of each session (planned) |

### Usage

```typescript
import { calculateVWAP, calculateRollingVWAP } from '@/lib/indicators/ta4j-port';

// Cumulative VWAP (session VWAP)
const vwap = calculateVWAP(candles, {
  stddevPeriod: 20,
});

// Rolling VWAP (fixed period)
const rollingVwap = calculateRollingVWAP(candles, 20);
```

### Interpretation

| Scenario | Interpretation |
|----------|---------------|
| Price > VWAP | Bullish - buyers in control |
| Price < VWAP | Bearish - sellers in control |
| Price near VWAP | Neutral - fair value zone |
| Upper/Lower bands | Volatility envelope |

### Institutional Usage

- **Execution benchmark**: Aim to buy below VWAP, sell above VWAP
- **Algorithm reference**: Many algorithms use VWAP as execution target
- **Intraday levels**: VWAP acts as dynamic support/resistance

---

## Heikin-Ashi

Heikin-Ashi means "average bar" in Japanese. It creates smoothed candlesticks that filter out market noise, making trends easier to identify.

### Formula

```
HA Close = (Open + High + Low + Close) / 4
HA Open = (Previous HA Open + Previous HA Close) / 2
HA High = Max(High, HA Open, HA Close)
HA Low = Min(Low, HA Open, HA Close)
```

### Usage

```typescript
import { calculateHeikinAshi, getHeikinAshiSignals } from '@/lib/indicators/ta4j-port';

// Calculate Heikin-Ashi candles
const haCandles = calculateHeikinAshi(candles);

// Get trend signals
const signals = getHeikinAshiSignals(haCandles);

signals.forEach(signal => {
  console.log(`${signal.time}: ${signal.type} - ${signal.reason}`);
});
```

### Candle Interpretation

| Candle Type | Appearance | Trend |
|-------------|------------|-------|
| **Strong Bullish** | No lower shadow, small upper shadow | Strong uptrend |
| **Weak Bullish** | Small body, both shadows | Weakening uptrend |
| **Strong Bearish** | No upper shadow, small lower shadow | Strong downtrend |
| **Weak Bearish** | Small body, both shadows | Weakening downtrend |
| **Doji-like** | Very small body | Indecision / potential reversal |

### Heikin-Ashi vs Regular Candles

| Feature | Regular | Heikin-Ashi |
|---------|---------|-------------|
| Noise | High | Low |
| Trend clarity | Moderate | High |
| Entry timing | Precise | Delayed |
| Best for | Entry/exit | Trend identification |

---

## Renko

Renko charts filter out noise by only showing price movements that exceed a predefined brick size. Time is not a factor - only price movement matters.

### Brick Formation

```
- New brick created when price moves by brick size
- Bricks are always 45-degree angles (up or down)
- Reversal requires 2 bricks movement in opposite direction
- No brick created if movement < brick size
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `brickSize` | 0 | Fixed brick size (0 = auto) |
| `useATR` | true | Use ATR for auto brick size |
| `atrPeriod` | 14 | ATR period for auto sizing |

### Usage

```typescript
import { calculateRenko, calculateRenkoIndicator } from '@/lib/indicators/ta4j-port';

// Calculate with ATR-based brick size
const bricks = calculateRenko(candles, {
  useATR: true,
  atrPeriod: 14,
});

// Or with fixed brick size
const fixedBricks = calculateRenko(candles, {
  brickSize: 100,  // $100 per brick
  useATR: false,
});

// For chart display
const result = calculateRenkoIndicator(candles, { useATR: true });
```

### Renko Signals

| Pattern | Signal |
|---------|--------|
| Green brick series | Uptrend |
| Red brick series | Downtrend |
| Color change | Trend reversal |
| Long series | Strong momentum |

---

## Keltner Channel

Keltner Channel is a volatility-based envelope using ATR. Similar to Bollinger Bands but uses ATR instead of standard deviation.

### Formula

```
Middle Line = EMA(Close, period)
Upper Channel = Middle Line + (Multiplier × ATR)
Lower Channel = Middle Line - (Multiplier × ATR)
Bandwidth = (Upper - Lower) / Middle × 100
```

### Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `period` | 20 | 1-200 | EMA period for middle line |
| `atrPeriod` | 10 | 1-100 | ATR calculation period |
| `multiplier` | 2.0 | 0.1-5.0 | ATR multiplier for channels |

### Usage

```typescript
import { 
  calculateKeltnerChannel, 
  getKeltnerChannelAnalysis,
  getKeltnerChannelSignals 
} from '@/lib/indicators/ta4j-port';

// Basic calculation
const channel = calculateKeltnerChannel(candles, {
  period: 20,
  atrPeriod: 10,
  multiplier: 2.0,
});

// Get detailed analysis
const analysis = getKeltnerChannelAnalysis(candles);
analysis.forEach(a => {
  console.log(`Bandwidth: ${a.bandwidth.toFixed(2)}%`);
});

// Get trading signals
const signals = getKeltnerChannelSignals(candles);
```

### Trading Strategies

| Strategy | Entry | Exit |
|----------|-------|------|
| **Channel Breakout** | Price closes above upper | Price closes below middle |
| **Mean Reversion** | Price touches lower | Price returns to middle |
| **Squeeze** | Low bandwidth | Breakout direction |
| **Trend Following** | Price > middle + ATR | Price < middle - ATR |

### Keltner vs Bollinger Bands

| Feature | Keltner | Bollinger |
|---------|---------|-----------|
| Basis | ATR | StdDev |
| Volatility response | Linear | Exponential |
| Bandwidth stability | More stable | More variable |
| Best for | Trend markets | Range/sideways |

---

## Mass Index

Mass Index identifies potential trend reversals by analyzing the narrowing and widening of trading ranges. Developed by Donald Dorsey.

### Formula

```
Range = High - Low
Single EMA = EMA(Range, 9)
Double EMA = EMA(Single EMA, 9)
EMA Ratio = Single EMA / Double EMA
Mass Index = Sum(EMA Ratio, 25)
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `emaPeriod` | 9 | EMA period for smoothing |
| `sumPeriod` | 25 | Sum period for Mass Index |

### Usage

```typescript
import { calculateMassIndex, getMassIndexWithSignals } from '@/lib/indicators/ta4j-port';

// Basic calculation
const massIndex = calculateMassIndex(candles, {
  emaPeriod: 9,
  sumPeriod: 25,
});

// Get with reversal signals
const results = getMassIndexWithSignals(candles);
results.forEach(r => {
  if (r.reversalSignal) {
    console.log(`Reversal signal at ${r.time}`);
  }
});
```

### Reversal Bulge

The key signal in Mass Index is the "reversal bulge":

1. Mass Index rises **above 27** (indicates range expansion)
2. Mass Index falls **below 26.5** (confirms reversal setup)
3. **Signal**: Expect trend reversal

### Interpretation

| Mass Index Value | Interpretation |
|-----------------|----------------|
| < 25 | Normal range |
| 25-27 | Widening range |
| > 27 | Significant expansion |
| 27 → 26.5 | **Reversal signal** |

---

## API Reference

### SuperTrend

| Function | Returns | Description |
|----------|---------|-------------|
| `calculateSuperTrend(candles, config)` | IndicatorResult | Chart-ready values |
| `getSuperTrendWithDirection(candles, config)` | SuperTrendResult[] | Detailed results with direction |

### VWAP

| Function | Returns | Description |
|----------|---------|-------------|
| `calculateVWAP(candles, config)` | IndicatorResult | Cumulative VWAP with bands |
| `calculateRollingVWAP(candles, period)` | IndicatorResult | Fixed-period VWAP |

### Heikin-Ashi

| Function | Returns | Description |
|----------|---------|-------------|
| `calculateHeikinAshi(candles)` | HeikinAshiCandle[] | Transformed candles |
| `calculateHeikinAshiIndicator(candles)` | IndicatorResult | Chart-ready values |
| `getHeikinAshiSignals(haCandles)` | Signal[] | Trend change signals |

### Renko

| Function | Returns | Description |
|----------|---------|-------------|
| `calculateRenko(candles, config)` | RenkoBrick[] | Brick data |
| `calculateRenkoIndicator(candles, config)` | IndicatorResult | Chart-ready values |

### Keltner Channel

| Function | Returns | Description |
|----------|---------|-------------|
| `calculateKeltnerChannel(candles, config)` | IndicatorResult | Chart-ready values |
| `getKeltnerChannelAnalysis(candles, config)` | KeltnerChannelResult[] | Detailed results |
| `getKeltnerChannelSignals(candles, config)` | Signal[] | Breakout signals |

### Mass Index

| Function | Returns | Description |
|----------|---------|-------------|
| `calculateMassIndex(candles, config)` | IndicatorResult | Chart-ready values |
| `getMassIndexWithSignals(candles, config)` | MassIndexResult[] | With reversal signals |

---

## Implementation Files

| File | Description |
|------|-------------|
| `/src/lib/indicators/ta4j-port.ts` | Main implementation (~1100 lines) |
| `/src/lib/indicators/builtin.ts` | Indicator definitions |
| `/src/lib/indicators/calculator.ts` | Calculator integration |

---

## Comparison Table

| Indicator | Overlay | Best Timeframe | Primary Use |
|-----------|---------|----------------|-------------|
| SuperTrend | Yes | Any | Trend direction |
| VWAP | Yes | Intraday | Execution benchmark |
| Heikin-Ashi | Yes | Any | Trend clarity |
| Renko | Yes | Any | Noise filtering |
| Keltner Channel | Yes | Any | Volatility envelope |
| Mass Index | No | Daily+ | Reversal detection |

---

## Notes

1. **SuperTrend** works best in trending markets. In ranging markets, it produces many false signals.

2. **VWAP** is most meaningful on intraday timeframes. For daily/weekly charts, use Rolling VWAP instead.

3. **Heikin-Ashi** delays price information - don't use for precise entry timing.

4. **Renko** ignores time completely - useful for pure price action analysis.

5. **Keltner Channel** uses ATR which responds linearly to volatility, making it more stable than Bollinger Bands.

6. **Mass Index** doesn't indicate direction - only that a reversal is likely. Use with other indicators for direction.
