# QuantClub Indicators Module

## Обзор

Модуль `quantclub-port.ts` содержит индикаторы, портированные из библиотеки [the-quantclub-iitbhu/Technical-indicators](https://github.com/the-quantclub-iitbhu/Technical-indicators) - академической Python библиотеки от IIT (BHU).

Портированные индикаторы прошли проверку на корректность и были расширены дополнительными функциями анализа и генерации сигналов.

## Портированные индикаторы

### 1. Stochastic Oscillator

**Файл:** `/src/lib/indicators/quantclub-port.ts`

Stochastic Oscillator - это импульсный индикатор, сравнивающий цену закрытия с диапазоном High-Low за определённый период.

#### Формула

```
%K = ((Close - Lowest Low) / (Highest High - Lowest Low)) × 100
%D = SMA(%K, dPeriod)
```

#### Параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `kPeriod` | number | 14 | Период для расчёта %K |
| `dPeriod` | number | 3 | Период сглаживания %D (SMA от %K) |
| `smoothK` | number | 1 | Дополнительное сглаживание %K |

#### Интерпретация

- **%K >= 80**: Зона перекупленности (overbought)
- **%K <= 20**: Зона перепроданности (oversold)
- **Бычий сигнал**: %K пересекает %D снизу вверх в зоне перепроданности
- **Медвежий сигнал**: %K пересекает %D сверху вниз в зоне перекупленности

#### Использование

```typescript
import { calculateStochastic, getStochasticSignals } from '@/lib/indicators/quantclub-port';

// Базовый расчёт для графика
const result = calculateStochastic(candles, {
  kPeriod: 14,
  dPeriod: 3,
  smoothK: 1,
});

// Получение сигналов с анализом зон
const signals = getStochasticSignals(candles, { kPeriod: 14, dPeriod: 3 });
// signals[i].signal = 'buy' | 'sell' | null
// signals[i].zone = 'overbought' | 'oversold' | 'neutral'
```

#### Выходные данные

| Линия | Цвет | Описание |
|-------|------|----------|
| `k` | #2962FF | %K линия (быстрая) |
| `d` | #FF6D00 | %D линия (медленная, SMA от %K) |

---

### 2. ADX (Average Directional Index)

**Файл:** `/src/lib/indicators/quantclub-port.ts`

ADX измеряет силу тренда (не направление). Разработан Welles Wilder как часть Directional Movement System.

#### Формула

```
+DM = High - Previous High (если > 0, иначе 0)
-DM = Previous Low - Low (если > 0, иначе 0)
TR = max(H-L, |H-PrevC|, |L-PrevC|)
+DI = 100 × EMA(+DM) / EMA(TR)
-DI = 100 × EMA(-DM) / EMA(TR)
DX = 100 × |+DI - -DI| / (+DI + -DI)
ADX = EMA(DX)
```

#### Параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `period` | number | 14 | Период для расчёта ADX и DI |

#### Интерпретация

- **ADX >= 25**: Сильный тренд
- **ADX < 20**: Слабый или отсутствующий тренд
- **ADX растёт**: Тренд усиливается
- **ADX падает**: Тренд ослабевает
- **+DI > -DI**: Бычий тренд
- **-DI > +DI**: Медвежий тренд

#### Использование

```typescript
import { calculateADX, getADXAnalysis } from '@/lib/indicators/quantclub-port';

// Базовый расчёт для графика
const result = calculateADX(candles, { period: 14 });

// Полный анализ с определением тренда
const analysis = getADXAnalysis(candles, { period: 14 });
// analysis[i].trend = 'strong_bullish' | 'bullish' | 'weak' | 'bearish' | 'strong_bearish'
// analysis[i].trendStrength = 0-100
```

#### Выходные данные

| Линия | Цвет | Описание |
|-------|------|----------|
| `adx` | #2962FF | ADX линия (сила тренда) |
| `plusDI` | #26A69A | +DI (положительный направленный индикатор) |
| `minusDI` | #EF5350 | -DI (отрицательный направленный индикатор) |

---

## Утилиты валидации

Модуль включает утилиты для проверки корректности реализаций:

### validateIndicator

Сравнивает рассчитанные значения с эталонными:

```typescript
import { validateIndicator } from '@/lib/indicators/quantclub-port';

const validation = validateIndicator(calculated, expected, 0.01);
// validation.valid - true если максимальная ошибка в пределах допуска
// validation.maxError - максимальная ошибка
// validation.avgError - средняя ошибка
```

### compareRSIImplementations

Сравнивает две реализации RSI:

```typescript
import { compareRSIImplementations } from '@/lib/indicators/quantclub-port';

const comparison = compareRSIImplementations(closes, 14);
// comparison.valid - true если реализации совпадают
```

---

## Интеграция с системой

### builtin.ts

Индикаторы зарегистрированы в системе:

```typescript
// Stochastic
{
  id: 'stochastic',
  name: 'Stochastic Oscillator',
  category: 'oscillator',
  author: 'quantclub',
}

// ADX
{
  id: 'adx',
  name: 'ADX (Average Directional Index)',
  category: 'trend',
  author: 'quantclub',
}
```

### calculator.ts

Интегрированы в систему расчёта:

```typescript
import { calculateStochastic, calculateADX } from './quantclub-port';

// В indicatorCalculators
stochastic: calculateStochasticIndicator,
adx: calculateADXIndicator,
```

---

## Сравнение с оригинальной библиотекой

### QuantClub (Python)

- Реализации на Python
- Базовые алгоритмы без сигналов
- Требует pandas/numpy
- 6 индикаторов

### CITARION (TypeScript)

- Нативные TypeScript реализации
- Расширенные функции (сигналы, анализ)
- Интеграция с lightweight-charts
- 28+ индикаторов (включая портированные)

---

## Примеры использования

### Определение тренда с ADX

```typescript
const analysis = getADXAnalysis(candles, { period: 14 });
const lastAnalysis = analysis[analysis.length - 1];

if (lastAnalysis.trend === 'strong_bullish') {
  console.log('Сильный бычий тренд, сила:', lastAnalysis.trendStrength);
} else if (lastAnalysis.trend === 'strong_bearish') {
  console.log('Сильный медвежий тренд, сила:', lastAnalysis.trendStrength);
}
```

### Торговые сигналы Stochastic

```typescript
const signals = getStochasticSignals(candles, {
  kPeriod: 14,
  dPeriod: 3,
});

const buySignals = signals.filter(s => s.signal === 'buy');
const sellSignals = signals.filter(s => s.signal === 'sell');

console.log(`Buy signals: ${buySignals.length}`);
console.log(`Sell signals: ${sellSignals.length}`);
```

---

## Источник

Оригинальная библиотека: [the-quantclub-iitbhu/Technical-indicators](https://github.com/the-quantclub-iitbhu/Technical-indicators)

Лицензия: MIT

Портировано с проверкой корректности и расширением функционала для CITARION.
