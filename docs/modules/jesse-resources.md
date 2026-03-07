# Jesse AI Resources Integration

## Обзор

Интеграция ресурсов из организации [jesse-ai](https://github.com/jesse-ai) в CITARION. Эти компоненты не требуют AI и работают автономно.

## Интегрированные компоненты

### 1. Jesse Indicators (`jesse-indicators.ts`)

Порт библиотеки [jesse-ai/indicators](https://github.com/jesse-ai/indicators) - TypeScript библиотека технического анализа.

**Особенности:**
- 30+ технических индикаторов
- Оптимизировано для потоковой обработки
- Нативная TypeScript реализация
- Совместимость с Candle интерфейсом CITARION

**Поддерживаемые индикаторы:**

| Категория | Индикаторы |
|-----------|------------|
| **Moving Averages** | SMA, EMA, WMA, HMA, VWMA, SMMA, DEMA, TEMA |
| **Oscillators** | RSI, Stochastic, StochRSI, Williams %R, CCI, MFI, ROC |
| **MACD** | MACD, PPO |
| **Volatility** | ATR, TrueRange, Bollinger Bands, StdDev |
| **Trend** | ADX, SAR, SuperTrend |
| **Volume** | OBV, VWAP, CMF |

**Пример использования:**

```typescript
import { SMA, EMA, RSI, MACD, BollingerBands, ATR } from "@/lib/jesse/jesse-indicators";

// Получить массив значений индикатора
const closes = candles.map(c => c.close);

// Moving Averages
const sma20 = SMA(closes, 20);
const ema50 = EMA(closes, 50);

// Oscillators
const rsi = RSI(closes, 14);

// MACD
const macd = MACD(closes, 12, 26, 9);
console.log(macd.macd);    // MACD line
console.log(macd.signal);  // Signal line
console.log(macd.histogram);

// Bollinger Bands
const bb = BollingerBands(closes, 20, 2);
console.log(bb.upper, bb.middle, bb.lower);

// ATR (requires candles)
const atr = ATR(candles, 14);
```

---

### 2. Jesse Example Strategies (`jesse-strategies.ts`)

Порт стратегий из [jesse-ai/example-strategies](https://github.com/jesse-ai/example-strategies).

**Доступные стратегии:**

#### RSI2 Mean Reversion
```typescript
import { RSI2Strategy } from "@/lib/jesse/jesse-strategies";

// Mean reversion на основе RSI(2)
// Long: RSI(2) < 10 + цена выше SMA(200)
// Short: RSI(2) > 90 + цена ниже SMA(200)
// Exit: RSI(2) > 70 (long) или < 30 (short)
```

#### Dual Thrust Breakout
```typescript
import { DualThrustStrategy } from "@/lib/jesse/jesse-strategies";

// Классическая стратегия прорыва
// Range = max(HH, HC) - min(LL, LC)
// Upper = Open + K1 * Range
// Lower = Open - K2 * Range
// Long: цена > Upper
// Short: цена < Lower
```

#### TradingView RSI
```typescript
import { TradingViewRSIStrategy } from "@/lib/jesse/jesse-strategies";

// Классическая RSI стратегия
// Long: RSI crosses above 30 (from below)
// Short: RSI crosses below 70 (from above)
```

#### EMA Crossover
```typescript
import { EMACrossStrategy } from "@/lib/jesse/jesse-strategies";

// Пересечение двух EMA
// Long: EMA(9) crosses above EMA(21)
// Short: EMA(9) crosses below EMA(21)
// Опционально: RSI фильтр
```

#### Bollinger Bands Mean Reversion
```typescript
import { BBMeanReversionStrategy } from "@/lib/jesse/jesse-strategies";

// Mean reversion на BB
// Long: price <= lower BB + RSI oversold
// Short: price >= upper BB + RSI overbought
// Exit: price reaches middle BB
```

**Использование со StrategyManager:**

```typescript
import { getStrategyManager } from "@/lib/strategy/manager";
import { RSI2Strategy, DualThrustStrategy } from "@/lib/jesse/jesse-strategies";

const manager = getStrategyManager();

// Регистрация
manager.registerStrategy(new RSI2Strategy());
manager.registerStrategy(new DualThrustStrategy());

// Получение сигнала
const strategy = manager.getStrategy("jesse-rsi2");
strategy.initialize({ oversoldLevel: 15, overboughtLevel: 85 });

const indicators = strategy.populateIndicators(candles);
const signal = strategy.populateEntrySignal(candles, indicators, currentPrice);
```

---

### 3. Candle Importer (`candle-importer.ts`)

Порт скрипта из [jesse-ai/candle-importer-script](https://github.com/jesse-ai/candle-importer-script) для импорта исторических свечей.

**Поддерживаемые биржи:**
- Binance
- Bybit
- OKX
- Bitget
- BingX

**Поддерживаемые таймфреймы:**
`1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `12h`, `1d`, `1w`, `1M`

**Пример использования:**

```typescript
import { createCandleImporter, createScheduledImporter } from "@/lib/jesse/candle-importer";

// Однократный импорт
const importer = createCandleImporter();

const results = await importer.import({
  exchange: "binance",
  symbols: ["BTCUSDT", "ETHUSDT"],
  timeframe: "1h",
  startDate: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 год назад
  onProgress: (progress) => {
    console.log(`[${progress.symbol}] ${progress.percent.toFixed(1)}%`);
  },
  onCandles: (symbol, candles) => {
    console.log(`Received ${candles.length} candles for ${symbol}`);
    // Сохранить в БД или обработать
  }
});

// Результаты
for (const result of results) {
  console.log(`${result.symbol}: ${result.candlesImported} candles in ${result.duration}ms`);
}
```

**Непрерывное обновление (scheduled):**

```typescript
import { createScheduledImporter } from "@/lib/jesse/candle-importer";

const scheduled = createScheduledImporter();

// Запустить hourly обновление
scheduled.startScheduledImport({
  exchange: "binance",
  symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  timeframe: "1h",
  startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 дней
}, 60 * 60 * 1000); // Каждый час

// Остановить
scheduled.stopAll();
```

**Управление импортом:**

```typescript
// Приостановить
importer.pause();

// Продолжить
importer.resume();

// Остановить
importer.abort();

// Получить прогресс
const progress = importer.getProgress("BTCUSDT");
```

---

## Сравнение с оригинальными репозиториями

| Компонент | Оригинал | CITARION | Изменения |
|-----------|----------|----------|-----------|
| **jesse-ai/indicators** | TypeScript npm пакет | Интегрирован напрямую | Адаптирован под Candle интерфейс |
| **example-strategies** | Python (Jesse framework) | TypeScript (CITARION) | Полный порт с адаптацией API |
| **candle-importer-script** | Python скрипт | TypeScript класс | Поддержка 5 бирж, scheduled mode |

---

## Интеграция с существующими системами

### С Backtesting Engine

```typescript
import { RSI2Strategy } from "@/lib/jesse/jesse-strategies";
import { BacktestEngine } from "@/lib/backtesting/engine";
import { createCandleImporter } from "@/lib/jesse/candle-importer";

// Импорт данных
const importer = createCandleImporter();
const results = await importer.import({
  exchange: "binance",
  symbols: ["BTCUSDT"],
  timeframe: "1h",
  startDate: Date.now() - 365 * 24 * 60 * 60 * 1000
});

// Бэктест
const engine = new BacktestEngine({
  strategyId: "jesse-rsi2",
  symbol: "BTCUSDT",
  initialBalance: 10000
});

const backtestResult = await engine.run(candles);
```

### С OHLCV Service

```typescript
// CandleImporter можно использовать для наполнения OHLCV таблицы
import { createScheduledImporter } from "@/lib/jesse/candle-importer";
import { prisma } from "@/lib/db";

const scheduled = createScheduledImporter();

await importer.import({
  exchange: "binance",
  symbols: ["BTCUSDT"],
  timeframe: "1h",
  startDate: Date.now() - 365 * 24 * 60 * 60 * 1000,
  onCandles: async (symbol, candles) => {
    // Сохранить в Prisma
    await prisma.ohlcv.createMany({
      data: candles.map(c => ({
        symbol,
        timeframe: "1h",
        timestamp: new Date(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      })),
      skipDuplicates: true
    });
  }
});
```

---

## Файлы

| Файл | Описание | Строк |
|------|----------|-------|
| `/src/lib/jesse/jesse-indicators.ts` | Индикаторы | ~700 |
| `/src/lib/jesse/jesse-strategies.ts` | Стратегии | ~600 |
| `/src/lib/jesse/candle-importer.ts` | Импорт свечей | ~500 |

---

## Рекомендации

1. **Индикаторы** - используйте напрямую для расчётов в стратегиях
2. **Стратегии** -可以作为 шаблоны для создания собственных стратегий
3. **Candle Importer** - запускайте через cron или scheduled importer для поддержания актуальности данных
