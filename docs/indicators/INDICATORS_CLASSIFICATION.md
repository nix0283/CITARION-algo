# Классификация индикаторов CITARION

## Обзор

Проект CITARION содержит **200+ индикаторных функций** для технического анализа финансовых рынков. Данный документ классифицирует все индикаторы по категориям и определяет, какие из них подходят для графического отображения в UI.

---

## 1. Категория: Moving Averages (Скользящие средние) - 14 индикаторов

**Назначение**: Сглаживание ценовых данных для определения тренда.

**Графическое отображение**: ✅ Все поддерживают (overlay на ценовой график)

| ID | Название | Файл | Описание |
|----|----------|------|----------|
| sma | Simple Moving Average | builtin.ts | Простая скользящая средняя |
| ema | Exponential Moving Average | builtin.ts | Экспоненциальная скользящая средняя |
| ema_cross | EMA Cross | builtin.ts | Две EMA для определения точек входа/выхода |
| wma | Weighted Moving Average | builtin.ts | Взвешенная скользящая средняя |
| hma | Hull Moving Average | builtin.ts | Скользящая средняя Халла (быстрая, малый лаг) |
| vwma | Volume Weighted MA | builtin.ts | Скользящая средняя, взвешенная по объёму |
| smma | Smoothed Moving Average | builtin.ts | Сглаженная скользящая средняя (Wilder's) |
| lsma | Linear Regression MA | builtin.ts | Скользящая средняя линейной регрессии |
| dema | Double EMA | builtin.ts | Двойная экспоненциальная скользящая средняя |
| tema | Triple EMA | builtin.ts | Тройная экспоненциальная скользящая средняя |
| kama | Kaufman Adaptive MA | builtin.ts | Адаптивная скользящая средняя Кауфмана |
| vidya | Variable Index DYMA | builtin.ts | Переменная индексная динамическая средняя |
| mcginley | McGinley Dynamic | builtin.ts | Динамическая средняя МакГинли |
| rolling_vwap | Rolling VWAP | builtin.ts | Скользящая VWAP за период |

**Статус UI**: ✅ Все 14 индикаторов реализованы в builtin.ts

---

## 2. Категория: Oscillators (Осцилляторы) - 17 индикаторов

**Назначение**: Определение перекупленности/перепроданности и моментов разворота.

**Графическое отображение**: ✅ Все поддерживают (отдельная панель под графиком)

| ID | Название | Файл | Описание |
|----|----------|------|----------|
| rsi | Relative Strength Index | builtin.ts | Индекс относительной силы (0-100) |
| macd | MACD | builtin.ts | Схождение/расхождение скользящих средних |
| stochrsi | Stochastic RSI | builtin.ts | Стохастический осциллятор RSI |
| ppo | PPO | builtin.ts | Процентный ценовой осциллятор |
| williams_r | Williams %R | builtin.ts | Процентный диапазон Вильямса (-100 до 0) |
| cci | Commodity Channel Index | builtin.ts | Индекс товарного канала |
| mfi | Money Flow Index | builtin.ts | Индекс денежного потока (RSI + объём) |
| roc | Rate of Change | builtin.ts | Скорость изменения цены |
| momentum | Momentum | builtin.ts | Разница цен за период |
| cmo | Chande Momentum Oscillator | builtin.ts | Осциллятор моментума Чанде |
| ultimate_osc | Ultimate Oscillator | builtin.ts | Взвешенный осциллятор Вильямса |
| ao | Awesome Oscillator | builtin.ts | Осциллятор Билла Вильямса |
| ac | Accelerator Oscillator | builtin.ts | Ускоритель осциллятора |
| tsi | True Strength Index | builtin.ts | Индекс истинной силы |
| vortex | Vortex Indicator | builtin.ts | Индикатор вихря (+VI/-VI) |
| aroon | Aroon | builtin.ts | Определение силы тренда |
| stochastic | Stochastic | quantclub-port.ts | Стохастический осциллятор (%K/%D) |

**Статус UI**: ✅ Все 17 индикаторов реализованы

---

## 3. Категория: Volatility (Волатильность) - 9 индикаторов

**Назначение**: Измерение волатильности рынка.

**Графическое отображение**: ✅ Большинство поддерживают

| ID | Название | Тип отображения | Файл |
|----|----------|-----------------|------|
| bb | Bollinger Bands | overlay (канал) | builtin.ts |
| atr | Average True Range | oscillator | builtin.ts |
| true_range | True Range | oscillator | builtin.ts |
| donchian | Donchian Channels | overlay (канал) | builtin.ts |
| stddev | Standard Deviation | oscillator | builtin.ts |
| hist_vol | Historical Volatility | oscillator | builtin.ts |
| natr | Normalized ATR | oscillator | builtin.ts |
| psar | Parabolic SAR | overlay (точки) | builtin.ts |
| keltner | Keltner Channel | overlay (канал) | keltner.ts, ta4j-indicators.ts |

**Статус UI**: ✅ Все 9 индикаторов реализованы

---

## 4. Категория: Volume (Объём) - 7 индикаторов

**Назначение**: Анализ торговой активности.

**Графическое отображение**: ✅ Все поддерживают

| ID | Название | Тип отображения | Файл |
|----|----------|-----------------|------|
| vol_sma | Volume SMA | histogram + line | builtin.ts |
| obv | On-Balance Volume | line (oscillator) | builtin.ts |
| cmf | Chaikin Money Flow | oscillator | builtin.ts |
| adl | Accumulation/Distribution | oscillator | builtin.ts |
| vol_osc | Volume Oscillator | histogram | builtin.ts |
| emv | Ease of Movement | oscillator | builtin.ts |
| vwap | VWAP | overlay (линия) | vwap.ts |

**Статус UI**: ✅ Все 7 индикаторов реализованы

---

## 5. Категория: Pivot Points (Точки разворота) - 5 индикаторов

**Назначение**: Расчёт уровней поддержки и сопротивления.

**Графическое отображение**: ✅ Все поддерживают (overlay горизонтальные линии)

| ID | Название | Файл |
|----|----------|------|
| pivot_standard | Standard Pivot | builtin.ts |
| pivot_fibonacci | Fibonacci Pivot | builtin.ts |
| pivot_camarilla | Camarilla Pivot | builtin.ts |
| pivot_woodie | Woodie Pivot | builtin.ts |
| pivot_demark | Demark Pivot | pivot.ts |

**Статус UI**: ✅ Все 5 индикаторов реализованы

---

## 6. Категория: Chart Types (Типы графиков) - 5 индикаторов

**Назначение**: Альтернативные способы визуализации ценовых данных.

**Графическое отображение**: ✅ Специальные типы визуализации

| ID | Название | Описание | Файл |
|----|----------|----------|------|
| heikin_ashi | Heikin-Ashi | Сглаженные свечи (усреднённые) | heikin-ashi.ts |
| renko | Renko | Кирпичный график (цена, не время) | renko.ts |
| supertrend | SuperTrend | Трендовый индикатор на ATR | supertrend.ts, ta4j-indicators.ts |
| ichimoku | Ichimoku Cloud | Облако Ишимоку (5 линий) | ichimoku.ts |
| fractals | Williams Fractals | Фракталы (маркеры разворота) | fractals.ts |

**Статус UI**: ❌ Требует добавления категории `chart_type`

---

## 7. Категория: Depth Indicators (Индикаторы глубины) - 6 функций

**Назначение**: Анализ стакана заявок (Order Book).

**Графическое отображение**: Частично

| ID | Название | Графика | Описание |
|----|----------|---------|----------|
| depth_delta | Depth Delta | ✅ histogram | Дисбаланс объёма Bid/Ask |
| depth_middle_price | Depth Middle Price | ✅ overlay | Средневзвешенная средняя цена |
| depth_imbalance | Depth Imbalance | ✅ oscillator | Дисбаланс от -1 до 1 |
| depth_true_range | Depth True Range | ❌ число | Истинный диапазон стакана |
| depth_weighted_points | Depth Weighted Points | ❌ список | Уровни поддержки/сопротивления |
| depth_block_points | Depth Block Points | ❌ список | Крупные ордера в стакане |

**Статус UI**: ❌ 3 индикатора требуют добавления (графические)

**Файл**: depth.ts

---

## 8. Категория: Candlestick Patterns (Свечные паттерны) - 24 паттерна

**Назначение**: Автоматическое распознавание разворотных паттернов.

**Графическое отображение**: ✅ Маркеры на графике (▲/▼ или значки)

### Односвечные (9):
| Название | Тип | Сигнал |
|----------|-----|--------|
| Doji | Нейтральный | Ожидание |
| Dragonfly Doji | Бычий | Покупка |
| Gravestone Doji | Медвежий | Продажа |
| Hammer | Бычий | Покупка |
| Inverted Hammer | Бычий | Покупка |
| Hanging Man | Медвежий | Продажа |
| Shooting Star | Медвежий | Продажа |
| Marubozu | Продолжение | По тренду |
| Spinning Top | Нейтральный | Ожидание |

### Двухсвечные (6):
| Название | Тип | Сигнал |
|----------|-----|--------|
| Bullish Engulfing | Бычий разворот | Покупка |
| Bearish Engulfing | Медвежий разворот | Продажа |
| Tweezer Top | Медвежий разворот | Продажа |
| Tweezer Bottom | Бычий разворот | Покупка |
| Piercing Line | Бычий разворот | Покупка |
| Dark Cloud Cover | Медвежий разворот | Продажа |

### Трёхсвечные (7):
| Название | Тип | Сигнал |
|----------|-----|--------|
| Morning Star | Бычий разворот | Покупка |
| Evening Star | Медвежий разворот | Продажа |
| Three White Soldiers | Бычий разворот | Покупка |
| Three Black Crows | Медвежий разворот | Продажа |
| Three Inside Up | Бычий разворот | Покупка |
| Three Inside Down | Медвежий разворот | Продажа |
| Tri-Star | Разворот | Зависит от контекста |

### Пятисвечные (2):
| Название | Тип | Сигнал |
|----------|-----|--------|
| Rising Three Methods | Бычье продолжение | Покупка |
| Falling Three Methods | Медвежье продолжение | Продажа |

**Статус UI**: ❌ Требует добавления категории `patterns/candlestick`

**Файл**: wolfbot/candlestick-patterns.ts

---

## 9. Категория: Statistics Functions (Статистика) - 6 функций

**Назначение**: Вычислительные функции для внутреннего использования.

**Графическое отображение**: ❌ Не предназначены для графики

| Функция | Описание |
|---------|----------|
| stddev() | Стандартное отклонение |
| variance() | Дисперсия |
| correlation() | Корреляция |
| beta() | Бета-коэффициент |
| linearRegression() | Линейная регрессия |
| historicalVolatility() | Историческая волатильность |

**Примечание**: Используются внутри других индикаторов (например, Bollinger Bands использует stddev). Могут отображаться как текстовые метрики.

---

## 10. Категория: Cycle Functions (Циклы) - 3 функции

**Назначение**: Определение циклов рынка для алгоритмических стратегий.

**Графическое отображение**: ❌ Не предназначены для графики (возвращают числа)

| Функция | Описание | Вывод |
|---------|----------|-------|
| Hilbert Transform | Преобразование Гильберта | Число (фаза) |
| Dominant Cycle | Доминантный цикл | Число (период) |
| Phase | Фазовый анализ | Число (фаза) |

**Примечание**: Могут отображаться как текстовая информация или использоваться в стратегиях.

---

## Сводная таблица статуса UI

| Категория | Всего функций | В UI | Требует добавления | Поддерживает графику |
|-----------|---------------|------|-------------------|---------------------|
| Moving Averages | 14 | 14 | 0 | ✅ |
| Oscillators | 17 | 17 | 0 | ✅ |
| Volatility | 9 | 9 | 0 | ✅ |
| Volume | 7 | 7 | 0 | ✅ |
| Pivot Points | 5 | 5 | 0 | ✅ |
| Chart Types | 5 | 0 | 5 | ✅ |
| Depth Indicators | 6 | 0 | 3 (граф.) | Частично |
| Candlestick Patterns | 24 | 0 | 24 | ✅ (маркеры) |
| Statistics Functions | 6 | — | Не требуются | ❌ |
| Cycle Functions | 3 | — | Не требуются | ❌ |

---

## Приоритеты добавления в UI

### Приоритет 1: Candlestick Patterns (24 паттерна)
- Создать категорию `patterns` с подклассом `candlestick`
- Добавить маркеры на графике (▲/▼ или цветные значки)
- Показывать название паттерна и тип сигнала при наведении

### Приоритет 2: Chart Types (5 индикаторов)
- Создать категорию `chart_type`
- Heikin-Ashi и Renko — альтернативная визуализация свечей
- SuperTrend и Ichimoku — overlay индикаторы
- Fractals — маркеры разворота

### Приоритет 3: Depth Indicators (3 графических)
- DepthDelta — гистограмма (oscillator)
- DepthMiddlePrice — overlay линия
- DepthImbalance — oscillator от -1 до 1

---

## Файловая структура индикаторов

```
/src/lib/indicators/
├── builtin.ts              # Метаданные индикаторов для UI (52 индикатора)
├── calculator.ts           # Функции расчёта индикаторов
├── depth.ts                # Индикаторы глубины (6 функций)
├── heikin-ashi.ts          # Heikin-Ashi свечи
├── renko.ts                # Renko кирпичи
├── fractals.ts             # Фракталы Вильямса
├── pivot.ts                # Pivot Points
├── ichimoku.ts             # Облако Ишимоку
├── supertrend.ts           # SuperTrend
├── keltner.ts              # Канал Кельтнера
├── vwap.ts                 # VWAP
├── ta4j-indicators.ts      # Продвинутые индикаторы (SuperTrend, VWAP, HA, Renko, Keltner, Mass Index)
├── quantclub-port.ts       # Stochastic, ADX (из QuantClub)
└── extended-calculators.ts # Расширенные калькуляторы

/src/lib/wolfbot/
├── candlestick-patterns.ts # 24 свечных паттерна (распознавание)
├── patterns.ts             # Графические паттерны (детекторы)
└── indicators.ts           # ~50 индикаторов WolfBot

/src/lib/jesse/
└── indicators.ts           # ~70 индикаторов Jesse (JesseIndicators class)
```

---

## Заключение

- **Всего функций в проекте**: 200+
- **Реализовано в UI (builtin.ts)**: 52 индикатора
- **Требует добавления в UI**: 32 индикатора
  - Candlestick Patterns: 24
  - Chart Types: 5
  - Depth (графические): 3
- **Не требуют графики**: 9 функций (Statistics + Cycle)
