# lightweight-charts

lightweight-charts - это библиотека от TradingView для создания финансовых графиков. Используется в CITARION для отображения свечных графиков, индикаторов и объёмов.

## Обзор

### Возможности

- Свечные графики (Candlestick)
- Линейные графики (Line)
- Гистограммы (Histogram)
- Несколько панелей (Panes)
- Крестик и сетка
- Zoom и pan
- Индикаторы поверх графика

### Установка

```bash
bun add lightweight-charts
```

---

## Базовая настройка

### Импорты

```typescript
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  ColorType,
  CrosshairMode,
  Time,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle
} from 'lightweight-charts'
```

### Создание графика

```typescript
"use client"

import { useEffect, useRef } from 'react'
import { createChart, IChartApi, ColorType, CandlestickSeries } from 'lightweight-charts'

export function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    // Создаём график
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#4c525e',
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      crosshair: {
        mode: 1, // CrosshairMode.Normal
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
      },
    })

    chartRef.current = chart

    // Создаём серию свечей
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    })

    // Устанавливаем данные
    candlestickSeries.setData([
      { time: 1672531200, open: 100, high: 110, low: 95, close: 105 },
      { time: 1672617600, open: 105, high: 115, low: 100, close: 110 },
      // ... больше данных
    ])

    // Подгоняем под контейнер
    chart.timeScale().fitContent()

    // Cleanup
    return () => {
      chart.remove()
    }
  }, [])

  return (
    <div
      ref={chartContainerRef}
      className="w-full h-[500px]"
    />
  )
}
```

---

## Типы данных

### Time

```typescript
// Unix timestamp (секунды)
type Time = number

// Или строка в формате YYYY-MM-DD
type Time = string

// Примеры
const time1: Time = 1672531200  // Unix timestamp
const time2: Time = '2023-01-01' // ISO дата
```

### CandlestickData

```typescript
interface CandlestickData<TimeType = Time> {
  time: TimeType
  open: number
  high: number
  low: number
  close: number
}
```

### LineData

```typescript
interface LineData<TimeType = Time> {
  time: TimeType
  value: number
}
```

### HistogramData

```typescript
interface HistogramData<TimeType = Time> {
  time: TimeType
  value: number
  color?: string
}
```

---

## Серии

### Candlestick Series

```typescript
import { CandlestickSeries } from 'lightweight-charts'

const candlestickSeries = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a',        // Цвет растущей свечи
  downColor: '#ef5350',      // Цвет падающей свечи
  borderUpColor: '#26a69a',  // Цвет границы растущей
  borderDownColor: '#ef5350',// Цвет границы падающей
  wickUpColor: '#26a69a',    // Цвет фитиля растущей
  wickDownColor: '#ef5350',  // Цвет фитиля падающей
  borderVisible: true,
  wickVisible: true,
})
```

### Line Series

```typescript
import { LineSeries, LineStyle } from 'lightweight-charts'

const lineSeries = chart.addSeries(LineSeries, {
  color: '#2962FF',
  lineWidth: 2,
  lineStyle: LineStyle.Solid,
  lineType: 0, // Simple
  crosshairMarkerVisible: true,
  crosshairMarkerRadius: 4,
  lastValueVisible: true,
  priceLineVisible: true,
})
```

### Histogram Series

```typescript
import { HistogramSeries } from 'lightweight-charts'

const volumeSeries = chart.addSeries(HistogramSeries, {
  color: '#26a69a',
  priceFormat: {
    type: 'volume',
  },
  priceScaleId: 'volume-scale',
})

// Настройка отдельной шкалы для объёма
volumeSeries.priceScale().applyOptions({
  scaleMargins: {
    top: 0.8,  // 20% высоты для объёма снизу
    bottom: 0,
  },
})
```

---

## Множественные панели (Panes)

### Создание панелей

```typescript
const chart = createChart(container, {
  // ... базовые опции
  panes: [
    { height: 0.7 },  // 70% для цены
    { height: 0.3 },  // 30% для RSI
  ],
  paneSeparator: {
    color: '#2a2e39',
    hoverColor: '#4c525e',
    width: 2,
  },
})

// Добавляем серии в разные панели
const priceSeries = chart.addSeries(CandlestickSeries, {}, 0) // pane 0
const rsiSeries = chart.addSeries(LineSeries, {}, 1)          // pane 1
```

### Динамическое управление панелями

```typescript
// Удалить серию из панели
chart.removeSeries(rsiSeries)

// Добавить новую серию в панель
const macdSeries = chart.addSeries(LineSeries, {}, 1)
```

---

## Цена и Время

### Price Lines

```typescript
// Горизонтальная линия на графике
const priceLine = candlestickSeries.createPriceLine({
  price: 100000,
  color: '#FF6B6B',
  lineWidth: 2,
  lineStyle: LineStyle.Dashed,
  axisLabelVisible: true,
  title: 'Target',
})

// Удалить линию
candlestickSeries.removePriceLine(priceLine)
```

### Time Scale

```typescript
// Прокрутка к времени
chart.timeScale().scrollToRealTime()

// Установка видимого диапазона
chart.timeScale().setVisibleRange({
  from: 1672531200 as Time,
  to: 1675296000 as Time,
})

// Подгонка под контент
chart.timeScale().fitContent()

// Получение видимого диапазона
const visibleRange = chart.timeScale().getVisibleRange()
```

---

## События

### Crosshair Move

```typescript
chart.subscribeCrosshairMove((param) => {
  if (!param.time || !param.point) {
    // Курсор вне графика
    return
  }

  // Получаем данные свечи под курсором
  const candleData = param.seriesData.get(candlestickSeries)

  if (candleData && 'open' in candleData) {
    console.log('Open:', candleData.open)
    console.log('High:', candleData.high)
    console.log('Low:', candleData.low)
    console.log('Close:', candleData.close)
  }
})
```

### Click

```typescript
chart.subscribeClick((param) => {
  if (!param.time) return

  console.log('Clicked at:', param.time)
  console.log('Point:', param.point)
})
```

### Visible Range Change

```typescript
chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
  if (!range) return

  console.log('Visible from:', range.from)
  console.log('Visible to:', range.to)

  // Можно подгрузить больше данных
})
```

---

## Полный пример из проекта

```typescript
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  LineData,
  ColorType,
  CrosshairMode,
  Time,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from "lightweight-charts";

interface ChartCandle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorConfig {
  id: string;
  type: 'sma' | 'ema' | 'rsi' | 'macd';
  inputs: Record<string, number>;
  visible: boolean;
}

export function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line">[]>>(new Map());

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // Инициализация графика
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const hasPaneIndicators = activeIndicators.some(
      i => i.visible && i.type === 'rsi'
    );

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#4c525e",
      },
      grid: {
        vertLines: { color: "#1e222d" },
        horzLines: { color: "#1e222d" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#758696',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: '#758696',
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: { borderColor: "#2a2e39" },
      timeScale: {
        borderColor: "#2a2e39",
        timeVisible: true,
      },
      panes: hasPaneIndicators ? [
        { height: 0.7 },
        { height: 0.3 },
      ] : [
        { height: 1.0 },
      ],
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderDownColor: "#ef5350",
      borderUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      wickUpColor: "#26a69a",
    });
    candleSeriesRef.current = candleSeries;

    // Volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume-scale",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [activeIndicators]);

  // Обновление данных
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || candles.length === 0) return;

    const candleData: CandlestickData<Time>[] = candles.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumeData: HistogramData<Time>[] = candles.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open
        ? "rgba(38, 166, 154, 0.5)"
        : "rgba(239, 83, 80, 0.5)",
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current?.setData(volumeData);
    chartRef.current.timeScale().fitContent();
  }, [candles]);

  // Обновление индикаторов
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    const chart = chartRef.current;

    // Удаляем старые серии
    overlaySeriesRef.current.forEach((series) => {
      series.forEach(s => {
        try { chart.removeSeries(s) } catch {}
      });
    });
    overlaySeriesRef.current.clear();

    // Добавляем новые
    activeIndicators.filter(i => i.visible).forEach(config => {
      if (config.type === 'sma' || config.type === 'ema') {
        const lineSeries = chart.addSeries(LineSeries, {
          color: config.type === 'sma' ? '#FF6B6B' : '#4CAF50',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        }, 0);

        // Вычисляем индикатор (упрощённо)
        const data = calculateSMA(candles, config.inputs.period || 20);
        lineSeries.setData(data);

        overlaySeriesRef.current.set(config.id, [lineSeries]);
      }
    });
  }, [candles, activeIndicators]);

  return (
    <div className="h-full flex flex-col">
      <div ref={chartContainerRef} className="flex-1 min-h-[400px]" />
    </div>
  );
}

// Вспомогательная функция
function calculateSMA(
  candles: ChartCandle[],
  period: number
): LineData<Time>[] {
  const result: LineData<Time>[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    result.push({
      time: candles[i].time,
      value: sum / period,
    });
  }

  return result;
}
```

---

## Стилизация

### CSS для скрытия логотипа

```css
/* globals.css */
.hide-tv-logo .tv-lightweight-charts {
  /* Скрыть логотип TradingView */
}

.hide-tv-logo [class*="copyright"] {
  display: none !important;
}
```

### Тёмная тема

```typescript
const darkTheme = {
  layout: {
    background: { type: ColorType.Solid, color: '#131722' },
    textColor: '#d1d4dc',
  },
  grid: {
    vertLines: { color: '#1e222d' },
    horzLines: { color: '#1e222d' },
  },
  crosshair: {
    vertLine: {
      color: '#758696',
      labelBackgroundColor: '#1e222d',
    },
    horzLine: {
      color: '#758696',
      labelBackgroundColor: '#1e222d',
    },
  },
  rightPriceScale: {
    borderColor: '#2a2e39',
  },
  timeScale: {
    borderColor: '#2a2e39',
  },
}
```

---

## Лучшие практики

### 1. Используйте useRef для хранения ссылок

```typescript
// ✅ Правильно
const chartRef = useRef<IChartApi | null>(null)

// ❌ Неправильно - будет пересоздаваться при ререндере
let chart: IChartApi | null = null
```

### 2. Очищайте ресурсы

```typescript
useEffect(() => {
  const chart = createChart(...)

  return () => {
    chart.remove() // Важно!
  }
}, [])
```

### 3. Обновляйте размеры при ресайзе

```typescript
useEffect(() => {
  const handleResize = () => {
    chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight,
    })
  }

  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
}, [])
```

### 4. Валидация данных

```typescript
function isValidCandle(d: ChartCandle): boolean {
  return (
    typeof d.time === 'number' &&
    typeof d.open === 'number' && !isNaN(d.open) &&
    typeof d.high === 'number' && !isNaN(d.high) &&
    typeof d.low === 'number' && !isNaN(d.low) &&
    typeof d.close === 'number' && !isNaN(d.close) &&
    d.high >= d.low &&
    d.high >= Math.max(d.open, d.close) &&
    d.low <= Math.min(d.open, d.close)
  )
}

// Фильтрация невалидных данных
const validData = candles.filter(isValidCandle)
```

---

## Решение проблем

### Ошибка: "Cannot read property 'addSeries' of undefined"

- Проверьте, что chartContainerRef.current существует
- Убедитесь, что контейнер имеет размеры (width/height > 0)

### График не отображается

1. Проверьте размеры контейнера
2. Убедитесь, что данные валидны
3. Проверьте формат времени

### Проблемы с производительностью

1. Ограничьте количество данных
2. Используйте memoization для вычислений
3. Debounce обновления

```typescript
const debouncedUpdate = useMemo(
  () => debounce((data) => {
    candleSeries.setData(data)
  }, 100),
  []
)
```

---

## Связанные документы

- [@vibetrader/pinets](./pinets.md) - Вычисление индикаторов
- [OHLCV System](../OHLCV-SYSTEM.md) - Получение данных
