# @vibetrader/pinets

@vibetrader/pinets - это TypeScript библиотека для работы с Pine Script, включая транскомпиляцию и выполнение торговых индикаторов.

## Обзор

### Возможности

- Парсинг Pine Script кода
- Транскомпиляция в TypeScript/JavaScript
- Встроенные индикаторы (SMA, EMA, RSI, MACD и др.)
- Вычисление индикаторов на OHLCV данных

### Установка

```bash
bun add @vibetrader/pinets
```

---

## Использование

### Импорт

```typescript
import { transpile, Indicator } from '@vibetrader/pinets'
```

### Примеры использования

```typescript
// src/lib/indicators/pine-transpiler.ts
import { transpile } from '@vibetrader/pinets'

// Pine Script код
const pineScript = `
//@version=5
indicator("My MA", overlay=true)
length = input(20, "Length")
ma = ta.sma(close, length)
plot(ma, "MA", color=color.blue)
`

// Транскомпиляция
const result = transpile(pineScript)
console.log(result.code) // TypeScript код
```

---

## Встроенные индикаторы

### Список поддерживаемых индикаторов

| Индикатор | Pine Script функция | Описание |
|-----------|-------------------|----------|
| SMA | `ta.sma(source, length)` | Простая скользящая средняя |
| EMA | `ta.ema(source, length)` | Экспоненциальная скользящая средняя |
| RSI | `ta.rsi(source, length)` | Индекс относительной силы |
| MACD | `ta.macd(...)` | MACD индикатор |
| BB | `ta.bb(...)` | Bollinger Bands |
| ATR | `ta.atr(length)` | Average True Range |
| Stochastic | `ta.stoch(...)` | Стохастический осциллятор |
| VWAP | `ta.vwap(source)` | Volume Weighted Average Price |

---

## Вычисление индикаторов

### Подготовка данных

```typescript
interface Candle {
  time: number    // Unix timestamp (секунды)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Конвертация данных из API биржи
function convertOHLCV(apiData: number[][]): Candle[] {
  return apiData.map(candle => ({
    time: Math.floor(candle[0] / 1000), // ms -> seconds
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
    volume: candle[5]
  }))
}
```

### SMA (Simple Moving Average)

```typescript
import { SMA } from '@vibetrader/pinets'

// Или собственная реализация
function calculateSMA(data: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = []

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
      continue
    }

    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close
    }
    result.push(sum / period)
  }

  return result
}

// Использование
const sma20 = calculateSMA(candles, 20)
```

### EMA (Exponential Moving Average)

```typescript
function calculateEMA(data: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  const multiplier = 2 / (period + 1)

  // Первое значение - SMA
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += data[i].close
    result.push(null)
  }
  result[period - 1] = sum / period

  // Последующие - EMA
  for (let i = period; i < data.length; i++) {
    const prevEMA = result[i - 1]!
    const ema = (data[i].close - prevEMA) * multiplier + prevEMA
    result.push(ema)
  }

  return result
}
```

### RSI (Relative Strength Index)

```typescript
function calculateRSI(data: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = []
  const gains: number[] = []
  const losses: number[] = []

  // Вычисляем изменения
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? Math.abs(change) : 0)
  }

  // Первые period-1 значений - null
  for (let i = 0; i < period; i++) {
    result.push(null)
  }

  // Вычисляем RSI
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < data.length; i++) {
    if (i > period) {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period
    }

    if (avgLoss === 0) {
      result.push(100)
    } else {
      const rs = avgGain / avgLoss
      result.push(100 - (100 / (1 + rs)))
    }
  }

  return result
}
```

### MACD

```typescript
interface MACDResult {
  macd: (number | null)[]
  signal: (number | null)[]
  histogram: (number | null)[]
}

function calculateMACD(
  data: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEMA = calculateEMA(data, fastPeriod)
  const slowEMA = calculateEMA(data, slowPeriod)

  // MACD Line
  const macd: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macd.push(null)
    } else {
      macd.push(fastEMA[i]! - slowEMA[i]!)
    }
  }

  // Signal Line (EMA of MACD)
  const macdData = macd.map((v, i) => ({
    close: v || 0,
    time: data[i].time
  })) as Candle[]

  const signal = calculateEMA(macdData, signalPeriod)

  // Histogram
  const histogram: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (macd[i] === null || signal[i] === null) {
      histogram.push(null)
    } else {
      histogram.push(macd[i]! - signal[i]!)
    }
  }

  return { macd, signal, histogram }
}
```

### Bollinger Bands

```typescript
interface BBResult {
  upper: (number | null)[]
  middle: (number | null)[]
  lower: (number | null)[]
}

function calculateBollingerBands(
  data: Candle[],
  period: number = 20,
  stdDev: number = 2
): BBResult {
  const sma = calculateSMA(data, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []

  for (let i = 0; i < data.length; i++) {
    if (sma[i] === null) {
      upper.push(null)
      lower.push(null)
      continue
    }

    // Вычисляем стандартное отклонение
    let sumSqDiff = 0
    for (let j = i - period + 1; j <= i; j++) {
      sumSqDiff += Math.pow(data[j].close - sma[i]!, 2)
    }
    const std = Math.sqrt(sumSqDiff / period)

    upper.push(sma[i]! + stdDev * std)
    lower.push(sma[i]! - stdDev * std)
  }

  return { upper, middle: sma, lower }
}
```

---

## Интеграция с проектом CITARION

### Калькулятор индикаторов

```typescript
// src/lib/indicators/calculator.ts
import type { Candle } from '@/types'

export interface IndicatorResult {
  lines: Array<{
    name: string
    color: string
    data: Array<{ time: number; value: number }>
  }>
  histograms: Array<{
    name: string
    data: Array<{ time: number; value: number; color?: string }>
  }>
}

export type IndicatorType = 'sma' | 'ema' | 'rsi' | 'macd' | 'bb' | 'stoch'

export interface IndicatorConfig {
  type: IndicatorType
  inputs: Record<string, number>
  colors: string[]
}

export function calculateIndicator(
  config: IndicatorConfig,
  candles: Candle[]
): IndicatorResult {
  switch (config.type) {
    case 'sma':
      return calculateSMAIndicator(candles, config.inputs.period, config.colors[0])
    case 'ema':
      return calculateEMAIndicator(candles, config.inputs.period, config.colors[0])
    case 'rsi':
      return calculateRSIIndicator(candles, config.inputs.period, config.colors[0])
    case 'macd':
      return calculateMACDIndicator(candles, config.colors)
    case 'bb':
      return calculateBBIndicator(
        candles,
        config.inputs.period,
        config.inputs.stdDev,
        config.colors
      )
    default:
      throw new Error(`Unknown indicator: ${config.type}`)
  }
}

function calculateSMAIndicator(
  candles: Candle[],
  period: number,
  color: string
): IndicatorResult {
  const sma = calculateSMA(candles, period)

  return {
    lines: [{
      name: `SMA ${period}`,
      color,
      data: candles
        .map((c, i) => ({ time: c.time, value: sma[i] }))
        .filter(d => d.value !== null) as Array<{ time: number; value: number }>
    }],
    histograms: []
  }
}
```

### Использование в API

```typescript
// src/app/api/indicators/route.ts
import { calculateIndicator } from '@/lib/indicators/calculator'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { symbol, timeframe, indicators } = await request.json()

  // Получаем OHLCV данные
  const candles = await db.ohlcvCandle.findMany({
    where: {
      symbol,
      timeframe,
      exchange: 'binance'
    },
    orderBy: { openTime: 'asc' },
    take: 500
  })

  // Конвертируем в нужный формат
  const ohlcvData = candles.map(c => ({
    time: Math.floor(c.openTime.getTime() / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  }))

  // Вычисляем индикаторы
  const results = indicators.map((config: IndicatorConfig) =>
    calculateIndicator(config, ohlcvData)
  )

  return NextResponse.json({ indicators: results })
}
```

---

## Pine Script транскомпиляция

### Пример транскомпиляции

```typescript
import { transpile } from '@vibetrader/pinets'

const pineCode = `
//@version=5
indicator("BB Bot Signal", overlay=false)

// Bollinger Bands
length = input(20, "BB Length")
mult = input(2.0, "BB Multiplier")

[upper, middle, lower] = ta.bb(close, length, mult)

// Сигналы
buySignal = ta.crossover(close, lower)
sellSignal = ta.crossunder(close, upper)

plot(upper, "Upper BB", color=color.red)
plot(middle, "Middle BB", color=color.gray)
plot(lower, "Lower BB", color=color.green)

plotshape(buySignal, "Buy", shape.triangleup, location.belowbar, color.green)
plotshape(sellSignal, "Sell", shape.triangledown, location.abovebar, color.red)
`

const transpiled = transpile(pineCode)

// transpiled.code содержит JavaScript код
// transpiled.errors содержит ошибки парсинга, если есть
```

### Выполнение транскомпилированного кода

```typescript
// Осторожно: eval небезопасен для непроверенного кода!
function executeIndicator(code: string, data: Candle[]) {
  // Создаём контекст выполнения
  const context = {
    close: data.map(d => d.close),
    open: data.map(d => d.open),
    high: data.map(d => d.high),
    low: data.map(d => d.low),
    volume: data.map(d => d.volume),
    time: data.map(d => d.time)
  }

  // Выполняем в sandbox (упрощённый пример)
  const fn = new Function('context', code)
  return fn(context)
}
```

---

## Лучшие практики

### 1. Кэширование результатов

```typescript
const indicatorCache = new Map<string, IndicatorResult>()

function getCachedIndicator(
  key: string,
  calculator: () => IndicatorResult
): IndicatorResult {
  if (indicatorCache.has(key)) {
    return indicatorCache.get(key)!
  }

  const result = calculator()
  indicatorCache.set(key, result)
  return result
}
```

### 2. Web Workers для тяжёлых вычислений

```typescript
// src/workers/indicator.worker.ts
self.onmessage = (e) => {
  const { type, data, config } = e.data

  const result = calculateIndicator(config, data)

  self.postMessage(result)
}
```

### 3. Incremental Updates

```typescript
// Вместо пересчёта всего индикатора
function updateEMA(
  prevEMA: number,
  newClose: number,
  period: number
): number {
  const multiplier = 2 / (period + 1)
  return (newClose - prevEMA) * multiplier + prevEMA
}
```

---

## Решение проблем

### Ошибка: "Cannot find module '@vibetrader/pinets'"

```bash
# Установите пакет
bun add @vibetrader/pinets
```

### Неверные значения индикаторов

1. Проверьте порядок данных (chronological)
2. Проверьте формат времени (секунды, не миллисекунды)
3. Убедитесь в достаточном количестве данных для периода

```typescript
// Для SMA с периодом 20 нужно минимум 20 свечей
if (candles.length < period) {
  throw new Error(`Need at least ${period} candles for period ${period}`)
}
```

---

## Связанные документы

- [lightweight-charts](./lightweight-charts.md) - Отображение индикаторов на графиках
- [OHLCV System](../OHLCV-SYSTEM.md) - Хранение исторических данных
