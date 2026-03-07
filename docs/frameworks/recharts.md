# Recharts

Recharts - это библиотека для построения графиков на React. Используется в CITARION для аналитики P&L, статистики и дашбордов.

## Обзор

### Особенности

- Декларативный React-подход
- Responsive контейнеры
- Анимации из коробки
- Поддержка SVG кастомизации
- Интеграция с темами

### Когда использовать

| График | Библиотека | Назначение |
|--------|------------|------------|
| Свечи, OHLCV | lightweight-charts | Торговые графики |
| Линии, области, бары | Recharts | Аналитика, статистика |
| Pie charts | Recharts | Распределения |

### Установка

```bash
bun add recharts
```

---

## Основные компоненты

### Импорты

```typescript
import {
  // Контейнеры
  ResponsiveContainer,
  ComposedChart,
  
  // Типы графиков
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  
  // Оси и сетка
  XAxis,
  YAxis,
  CartesianGrid,
  
  // Дополнительно
  Tooltip,
  Legend,
  Cell,
} from "recharts"
```

---

## Типы графиков

### Area Chart (Кривая капитала)

```tsx
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const data = [
  { date: "1 янв", balance: 10000, equity: 10000 },
  { date: "2 янв", balance: 10100, equity: 10150 },
  { date: "3 янв", balance: 10050, equity: 9900 },
  { date: "4 янв", balance: 10200, equity: 10400 },
]

export function EquityChart() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data}>
        {/* Градиент для заливки */}
        <defs>
          <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Area
          type="monotone"
          dataKey="equity"
          stroke="hsl(var(--primary))"
          fill="url(#colorEquity)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

### Bar Chart (Дневной P&L)

```tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"

const data = [
  { date: "1 янв", pnl: 150 },
  { date: "2 янв", pnl: -50 },
  { date: "3 янв", pnl: 200 },
  { date: "4 янв", pnl: -30 },
]

const COLORS = {
  positive: "#22c55e",
  negative: "#ef4444",
}

export function DailyPnLChart() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          formatter={(value: number) => [`$${value.toFixed(2)}`, "P&L"]}
        />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
          {/* Динамический цвет в зависимости от значения */}
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.pnl >= 0 ? COLORS.positive : COLORS.negative}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
```

### Line Chart (Тренды)

```tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

const data = [
  { month: "Янв", profit: 4000, loss: 2400 },
  { month: "Фев", profit: 3000, loss: 1398 },
  { month: "Мар", profit: 2000, loss: 9800 },
  { month: "Апр", profit: 2780, loss: 3908 },
]

export function ProfitLossChart() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="profit"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ fill: "#22c55e", strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="loss"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ fill: "#ef4444", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

### Pie Chart (Распределение)

```tsx
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

const data = [
  { name: "Прибыльные", value: 65 },
  { name: "Убыточные", value: 35 },
]

const COLORS = ["#22c55e", "#ef4444"]

export function WinLossChart() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}     // Donut chart
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

### Composed Chart (Комбинированный)

```tsx
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const data = [
  { period: "1 день", pnl: 100, trades: 5 },
  { period: "1 нед", pnl: 500, trades: 25 },
  { period: "1 мес", pnl: 2000, trades: 100 },
]

export function PeriodComparisonChart() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="period" />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" />
        <Tooltip />
        
        {/* Бар для количества сделок */}
        <Bar yAxisId="right" dataKey="trades" fill="hsl(var(--primary))" opacity={0.3} />
        
        {/* Линия для P&L */}
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="pnl"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ fill: "#22c55e", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

---

## Интеграция с shadcn/ui

### Chart Container

```tsx
// src/components/ui/chart.tsx
"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<string, string> }
  )
}

function ChartContainer({
  config,
  children,
  className,
}: {
  config: ChartConfig
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("aspect-video", className)}>
      <RechartsPrimitive.ResponsiveContainer>
        {children}
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  )
}

export { ChartContainer }
```

### Использование

```tsx
import { ChartContainer } from "@/components/ui/chart"
import { AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"

const chartConfig = {
  equity: {
    label: "Капитал",
    color: "hsl(var(--primary))",
  },
}

export function MyChart() {
  return (
    <ChartContainer config={chartConfig}>
      <AreaChart data={data}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="equity"
          stroke="var(--color-equity)"
          fill="var(--color-equity)"
        />
      </AreaChart>
    </ChartContainer>
  )
}
```

---

## Полный пример из CITARION

```tsx
// src/components/analytics/pnl-analytics.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from "recharts";

interface EquityPoint {
  timestamp: string;
  balance: number;
  equity: number;
  realizedPnL: number;
}

interface PnLStats {
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

export function PnLAnalytics() {
  const [timeRange, setTimeRange] = useState("1m");
  const [apiData, setApiData] = useState<{
    stats: PnLStats;
    equityCurve: EquityPoint[];
  } | null>(null);

  const fetchPnLData = useCallback(async () => {
    const response = await fetch(`/api/pnl-stats?period=${timeRange}`);
    const data = await response.json();
    if (data.success) {
      setApiData(data);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchPnLData();
  }, [fetchPnLData]);

  // Подготовка данных для графика капитала
  const equityChartData = useMemo(() => {
    if (!apiData?.equityCurve) return [];
    return apiData.equityCurve.map((point) => ({
      date: new Date(point.timestamp).toLocaleDateString("ru-RU", {
        month: "short",
        day: "numeric",
      }),
      balance: point.balance,
      equity: point.equity,
    }));
  }, [apiData]);

  const stats = apiData?.stats || {
    totalPnL: 0,
    winRate: 0,
    totalTrades: 0,
  };

  // Win/Loss данные для Pie Chart
  const winLossData = [
    { name: "Прибыльные", value: stats.winningTrades, color: "#22c55e" },
    { name: "Убыточные", value: stats.losingTrades, color: "#ef4444" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Общий P&L</p>
            <p className={stats.totalPnL >= 0 ? "text-green-500" : "text-red-500"}>
              ${stats.totalPnL.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Equity Curve */}
      <Card>
        <CardHeader>
          <CardTitle>Кривая капитала</CardTitle>
        </CardHeader>
        <CardContent>
          {equityChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={equityChartData}>
                <defs>
                  <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="hsl(var(--primary))"
                  fill="url(#colorEquity)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground">
              Нет данных для отображения
            </div>
          )}
        </CardContent>
      </Card>

      {/* Win/Loss Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Win/Loss</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={winLossData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {winLossData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Стилизация под тему

### Использование CSS переменных

```tsx
// Вместо хардкода цветов
<Line stroke="#22c55e" />

// Используйте CSS переменные
<Line stroke="hsl(var(--primary))" />
<CartesianGrid stroke="hsl(var(--border))" />
<XAxis stroke="hsl(var(--muted-foreground))" />
```

### Tooltip стилизация

```tsx
<Tooltip
  contentStyle={{
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    color: "hsl(var(--foreground))",
  }}
  labelStyle={{
    color: "hsl(var(--foreground))",
  }}
/>
```

---

## Лучшие практики

### 1. Всегда используйте ResponsiveContainer

```tsx
// ✅ Правильно
<ResponsiveContainer width="100%" height={350}>
  <AreaChart data={data}>...</AreaChart>
</ResponsiveContainer>

// ❌ Неправильно - фиксированная ширина
<AreaChart width={500} height={350} data={data}>...</AreaChart>
```

### 2. Форматирование значений в Tooltip

```tsx
<Tooltip
  formatter={(value: number, name: string) => {
    if (name === "pnl") return [`$${value.toFixed(2)}`, "P&L"]
    if (name === "winRate") return [`${value.toFixed(1)}%`, "Win Rate"]
    return [value, name]
  }}
  labelFormatter={(label) => `Дата: ${label}`}
/>
```

### 3. Условное отображение

```tsx
{data.length > 0 ? (
  <ResponsiveContainer>
    <AreaChart data={data}>...</AreaChart>
  </ResponsiveContainer>
) : (
  <div className="flex items-center justify-center h-[350px]">
    Нет данных
  </div>
)}
```

### 4. Мемоизация данных

```tsx
const chartData = useMemo(() => {
  return rawData.map(item => ({
    date: formatDate(item.timestamp),
    value: calculateValue(item),
  }))
}, [rawData])
```

---

## Решение проблем

### График не отображается

1. Проверьте формат данных
2. Убедитесь, что dataKey совпадает с ключами в данных
3. Проверьте высоту контейнера

```tsx
// Данные должны быть массивом объектов
const data = [
  { date: "1 янв", value: 100 },  // ✅
]

// dataKey должен совпадать
<Line dataKey="value" />  // ✅
<Line dataKey="name" />   // ❌ Не существует в данных
```

### Tooltip не работает

```tsx
// Убедитесь, что Tooltip внутри графика
<AreaChart data={data}>
  <Tooltip />  {/* ✅ Внутри */}
</AreaChart>
```

### Градиент не работает

```tsx
// Убедитесь, что defs определён и ID совпадает
<defs>
  <linearGradient id="myGradient">...</linearGradient>
</defs>
<Area fill="url(#myGradient)" />  // ID должен совпадать
```

---

## Связанные документы

- [lightweight-charts](./lightweight-charts.md) - Торговые графики
- [shadcn/ui](./shadcn-ui.md) - Компоненты интерфейса
