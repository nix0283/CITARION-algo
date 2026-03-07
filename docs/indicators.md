# Индикаторы и типы графиков CITARION

## Обзор

CITARION включает более 130+ встроенных индикаторов, организованных по категориям для удобного доступа и использования.

## Категории индикаторов

### 1. Chart Types (Типы графиков)

Специальные типы отображения ценовых данных.

| ID | Название | Описание |
|----|----------|----------|
| `ct_bars` | Bars (OHLC) | Стандартный барный график |
| `ct_line` | Line Chart | Линейный график закрытий |
| `ct_area` | Area Chart | График с заполненной областью |
| `ct_crosses` | Crosses | Кресты на ценах закрытия |
| `ct_columns` | Columns (HLC) | Вертикальные столбцы High-Low |
| `ct_kagi` | Kagi | График спроса/предложения |
| `ct_line_break` | Line Break (Three Line) | Трёхлинейный разворот |
| `ct_range_bars` | Range Bars | Бары фиксированного диапазона |
| `ct_point_figure` | Point & Figure | График X/O |
| `ct_hollow_candles` | Hollow Candles | Свечи с заполнением по тренду |
| `ct_volume_candles` | Volume Candles | Свечи с учётом объёма |
| `heikin_ashi` | Heikin-Ashi | Сглаженные свечи |
| `renko` | Renko | Кирпичный график |

### 2. Patterns (Паттерны)

#### 2.1 Candlestick Patterns (Свечные паттерны)

**Односвечные паттерны:**

| ID | Название | Тип | Описание |
|----|----------|-----|----------|
| `cp_doji` | Doji | Нейтральный | Свеча нерешительности |
| `cp_dragonfly_doji` | Dragonfly Doji | Бычий | Разворот с длинной нижней тенью |
| `cp_gravestone_doji` | Gravestone Doji | Медвежий | Разворот с длинной верхней тенью |
| `cp_hammer` | Hammer | Бычий | Разворот с маленьким телом сверху |
| `cp_inverted_hammer` | Inverted Hammer | Бычий | Разворот с маленьким телом снизу |
| `cp_hanging_man` | Hanging Man | Медвежий | Разворот после uptrend |
| `cp_shooting_star` | Shooting Star | Медвежий | Разворот после uptrend |
| `cp_marubozu` | Marubozu | Оба | Свеча без теней |
| `cp_spinning_top` | Spinning Top | Нейтральный | Малое тело, длинные тени |

**Двухсвечные паттерны:**

| ID | Название | Тип | Описание |
|----|----------|-----|----------|
| `cp_bullish_engulfing` | Bullish Engulfing | Бычий | Бычья свеча поглощает медвежью |
| `cp_bearish_engulfing` | Bearish Engulfing | Медвежий | Медвежья свеча поглощает бычью |
| `cp_piercing_line` | Piercing Line | Бычий | Закрытие выше середины предыдущей |
| `cp_dark_cloud_cover` | Dark Cloud Cover | Медвежий | Закрытие ниже середины предыдущей |
| `cp_tweezer_top` | Tweezer Top | Медвежий | Два одинаковых максимума |
| `cp_tweezer_bottom` | Tweezer Bottom | Бычий | Два одинаковых минимума |

**Трёхсвечные паттерны:**

| ID | Название | Тип | Описание |
|----|----------|-----|----------|
| `cp_morning_star` | Morning Star | Бычий | Сильный бычий разворот |
| `cp_evening_star` | Evening Star | Медвежий | Сильный медвежий разворот |
| `cp_three_white_soldiers` | Three White Soldiers | Бычий | Три подряд растущие свечи |
| `cp_three_black_crows` | Three Black Crows | Медвежий | Три подряд падающие свечи |

**Пятисвечные паттерны:**

| ID | Название | Тип | Описание |
|----|----------|-----|----------|
| `cp_rising_three_methods` | Rising Three Methods | Бычий | Бычье продолжение |
| `cp_falling_three_methods` | Falling Three Methods | Медвежий | Медвежье продолжение |

#### 2.2 Chart Patterns (Графические паттерны)

| ID | Название | Тип | Описание |
|----|----------|-----|----------|
| `gp_double_top` | Double Top | Медвежий | Два пика на одном уровне |
| `gp_double_bottom` | Double Bottom | Бычий | Два минимума на одном уровне |
| `gp_head_shoulders` | Head and Shoulders | Медвежий | Голова и плечи |
| `gp_inverse_head_shoulders` | Inverse H&S | Бычий | Перевёрнутая голова и плечи |
| `gp_ascending_triangle` | Ascending Triangle | Бычий | Горизонтальное сопротивление |
| `gp_descending_triangle` | Descending Triangle | Медвежий | Горизонтальная поддержка |
| `gp_symmetrical_triangle` | Symmetrical Triangle | Нейтральный | Сужающийся диапазон |
| `gp_flag` | Flag Pattern | Оба | Продолжение после сильного движения |
| `gp_wedge_rising` | Rising Wedge | Медвежий | Повышающийся клин |
| `gp_wedge_falling` | Falling Wedge | Бычий | Понижающийся клин |
| `gp_channel_up` | Up Channel | Бычий | Восходящий канал |
| `gp_channel_down` | Down Channel | Медвежий | Нисходящий канал |

### 3. Moving Averages (Скользящие средние)

| ID | Название | Описание |
|----|----------|----------|
| `sma` | Simple Moving Average | Простое среднее арифметическое |
| `ema` | Exponential Moving Average | Экспоненциальное среднее |
| `wma` | Weighted Moving Average | Взвешенное среднее |
| `hma` | Hull Moving Average | Быстрое сглаженное среднее |
| `vwma` | Volume Weighted MA | Среднее с учётом объёма |
| `smma` | Smoothed Moving Average | Сглаженное среднее (Wilder's) |
| `lsma` | Linear Regression MA | Среднее на основе регрессии |
| `dema` | Double EMA | Двойное экспоненциальное |
| `tema` | Triple EMA | Тройное экспоненциальное |
| `kama` | Kaufman Adaptive MA | Адаптивное среднее Кауфмана |
| `vidya` | Variable Index DYMA | Переменное индексное среднее |
| `mcginley` | McGinley Dynamic | Адаптивное среднее МакГинли |
| `rolling_vwap` | Rolling VWAP | Скользящая VWAP |

### 4. Oscillators (Осцилляторы)

| ID | Название | Диапазон | Описание |
|----|----------|----------|----------|
| `rsi` | RSI | 0-100 | Индекс относительной силы |
| `macd` | MACD | - | Схождение/расхождение средних |
| `stochastic` | Stochastic | 0-100 | Позиция закрытия в диапазоне |
| `stochrsi` | StochRSI | 0-100 | Стохастик RSI |
| `ppo` | PPO | - | Процентный MACD |
| `williams_r` | Williams %R | -100-0 | Уровень закрытия |
| `cci` | CCI | - | Индекс товарного канала |
| `mfi` | MFI | 0-100 | Индекс денежного потока |
| `roc` | ROC | - | Скорость изменения |
| `momentum` | Momentum | - | Разница цен |
| `cmo` | CMO | -100-+100 | Осциллятор Чанде |
| `ultimate_osc` | Ultimate Oscillator | 0-100 | Три таймфрейма |
| `ao` | Awesome Oscillator | - | Разница SMA 5/34 |
| `ac` | Accelerator Oscillator | - | Ускорение AO |
| `tsi` | True Strength Index | - | Двойное сглаживание |
| `vortex` | Vortex Indicator | - | Начало тренда |
| `aroon` | Aroon | 0-100 | Время с последнего экстремума |

### 5. Volatility (Волатильность)

| ID | Название | Описание |
|----|----------|----------|
| `bb` | Bollinger Bands | Каналы волатильности |
| `atr` | ATR | Средний истинный диапазон |
| `true_range` | True Range | Истинный диапазон |
| `donchian` | Donchian Channels | Канал High-Low |
| `stddev` | Standard Deviation | Стандартное отклонение |
| `hist_vol` | Historical Volatility | Историческая волатильность |
| `natr` | Normalized ATR | Нормализованный ATR |
| `psar` | Parabolic SAR | Stop And Reverse |
| `keltner_channel` | Keltner Channel | Канал на основе ATR |

### 6. Volume (Объём)

| ID | Название | Описание |
|----|----------|----------|
| `vol_sma` | Volume SMA | Средний объём |
| `obv` | On-Balance Volume | Кумулятивный объём |
| `cmf` | Chaikin Money Flow | Денежный поток Чайкина |
| `adl` | Accumulation/Distribution | Накопление/распределение |
| `vol_osc` | Volume Oscillator | Разница MA объёма |
| `emv` | Ease of Movement | Лёгкость движения |
| `vwap` | VWAP | Средневзвешенная цена |

### 7. Trend (Тренд)

| ID | Название | Описание |
|----|----------|----------|
| `dmi` | DMI | Индекс направленного движения |
| `adx` | ADX | Сила тренда |
| `mass_index` | Mass Index | Индикатор разворота |

### 8. Pivot Points (Точки разворота)

| ID | Название | Описание |
|----|----------|----------|
| `pivot_standard` | Standard Pivots | Стандартные пивоты |
| `pivot_fibonacci` | Fibonacci Pivots | Пивоты Фибоначчи |
| `pivot_camarilla` | Camarilla Pivots | Пивоты Камарилла |
| `pivot_woodie` | Woodie Pivots | Пивоты Вуди |
| `pivot_demark` | Demark Pivots | Пивоты Демарка |

### 9. Fibonacci (Фибоначчи)

| ID | Название | Описание |
|----|----------|----------|
| `fib_retracement` | Fibonacci Retracement | Уровни коррекции |
| `fib_extensions` | Fibonacci Extensions | Уровни расширения |
| `fib_levels` | Fibonacci Levels | Динамические уровни |

### 10. Depth (Глубина рынка)

| ID | Название | Описание |
|----|----------|----------|
| `depth_delta` | Depth Delta | Дисбаланс bids/asks |
| `depth_imbalance` | Depth Imbalance | Нормализованный дисбаланс |
| `depth_weighted_mid` | Weighted Mid Price | Взвешенная средняя цена |
| `depth_true_range` | Depth True Range | Волатильность стакана |
| `depth_block_points` | Block Points | Крупные ордера |
| `depth_pressure` | Depth Pressure | Давление рынка |

## Индикаторы без категории

Следующие индикаторы не имеют категории и доступны напрямую:

| ID | Название | Описание |
|----|----------|----------|
| `ichimoku` | Ichimoku Cloud | Комплексный трендовый индикатор |
| `supertrend` | SuperTrend | Трендовый индикатор на ATR |
| `fractals` | Williams Fractals | Маркеры разворота |

## Реализации графиков

### Kagi Chart
**Файл:** `/src/lib/indicators/chart-types/kagi.ts`

**Параметры:**
- `reversalAmount` - размер разворота (или ATR)
- `useATR` - использовать ATR для расчёта размера
- `atrPeriod` - период ATR

**Особенности:**
- Линии меняют направление при движении цены на размер разворота
- Толстые линии = подтверждённый тренд
- Тонкие линии = потенциальный разворот

### Line Break Chart
**Файл:** `/src/lib/indicators/chart-types/line-break.ts`

**Параметры:**
- `lineCount` - количество линий для разворота (по умолчанию 3)

**Особенности:**
- Новая линия добавляется при пробое High/Low предыдущих N линий
- Белые/зелёные линии = рост
- Чёрные/красные линии = падение

### Range Bars
**Файл:** `/src/lib/indicators/chart-types/range-bars.ts`

**Параметры:**
- `rangeSize` - фиксированный размер диапазона
- `useATR` - использовать ATR
- `atrPeriod` - период ATR

**Особенности:**
- Каждый бар имеет одинаковый диапазон High-Low
- Не зависит от времени
- Фильтрует шум

### Point & Figure
**Файл:** `/src/lib/indicators/chart-types/point-figure.ts`

**Параметры:**
- `boxSize` - размер коробки
- `reversal` - количество коробок для разворота
- `useATR` - адаптивный размер коробки

**Особенности:**
- X колонки = рост
- O колонки = падение
- Игнорирует время и незначительные движения

### Hollow Candles
**Файл:** `/src/lib/indicators/chart-types/hollow-candles.ts`

**Правила заполнения:**
- Полая зелёная: Close > Open И Close > PrevClose (сильный бычий)
- Заполненная зелёная: Close < Open И Close > PrevClose (слабый медвежий)
- Полая красная: Close > Open И Close < PrevClose (слабый бычий)
- Заполненная красная: Close < Open И Close < PrevClose (сильный медвежий)

### Volume Candles
**Файл:** `/src/lib/indicators/chart-types/volume-candles.ts`

**Параметры:**
- `volumePeriod` - период для расчёта среднего объёма

**Особенности:**
- Ширина/интенсивность свечи пропорциональна объёму
- Высокий объём = сильный сигнал
- Низкий объём = слабый сигнал

## Использование

### Получение индикаторов по категории

```typescript
import { getIndicatorsByCategory } from '@/lib/indicators/builtin';

// Получить все типы графиков
const chartTypes = getIndicatorsByCategory('chart_types');

// Получить все свечные паттерны
const candlePatterns = getIndicatorsByCategory('patterns')
  .filter(ind => ind.subcategory === 'candlestick_patterns');
```

### Получение индикаторов по подкатегории

```typescript
import { getIndicatorsBySubcategory } from '@/lib/indicators/builtin';

// Получить только свечные паттерны
const candlePatterns = getIndicatorsBySubcategory('patterns', 'candlestick_patterns');

// Получить только графические паттерны
const chartPatterns = getIndicatorsBySubcategory('patterns', 'chart_patterns');
```

### Группировка индикаторов

```typescript
import { 
  getIndicatorsGroupedByCategory,
  getIndicatorsGroupedBySubcategory 
} from '@/lib/indicators/builtin';

// Группировка по категории
const byCategory = getIndicatorsGroupedByCategory();

// Группировка паттернов по подкатегории
const patternsBySubcat = getIndicatorsGroupedBySubcategory('patterns');
```

## Ссылки

### Реализации и исследования

1. **Kagi Charts**
   - TradingView: https://www.tradingview.com/support/solutions/43000502272
   - Investopedia: https://www.investopedia.com/terms/k/kagichart.asp

2. **Three Line Break**
   - StockCharts: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-types/three-line-break-charts
   - Investopedia: https://www.investopedia.com/terms/t/three-line-break.asp

3. **Range Bars**
   - Quantower KB: https://github.com/Quantower/QuantowerKB/blob/master/analytics-panels/chart/chart-types/range-bars.md

4. **Point & Figure**
   - TradingView: https://www.tradingview.com/support/solutions/43000502276
   - StockCharts: https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-types/point-and-figure-chart

5. **Hollow Candlesticks**
   - Highcharts: https://www.highcharts.com/blog/tutorials/how-to-read-hollow-candlesticks
   - TrendSpider: https://trendspider.com/learning-center/introduction-to-chart-types

6. **Heikin-Ashi**
   - Investopedia: https://www.investopedia.com/trading/heikin-ashi-better-candlestick
   - TradingView: https://www.tradingview.com/scripts/heikinashi/

7. **Renko Charts**
   - Investopedia: https://www.investopedia.com/terms/r/renkochart.asp
   - TradingView: https://www.tradingview.com/scripts/renko/

## Обновления

- **2025-01**: Добавлена категория `chart_types` с 14 типами графиков
- **2025-01**: Добавлена категория `patterns` с подкатегориями
- **2025-01**: Добавлено 20+ свечных паттернов
- **2025-01**: Добавлено 12 графических паттернов
- **2025-01**: Ichimoku, SuperTrend, Fractals перемещены в без категории
- **2025-01**: Добавлены реализации Kagi, Line Break, Range Bars, Point & Figure, Hollow Candles, Volume Candles
