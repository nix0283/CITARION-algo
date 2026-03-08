# Jesse Integration Module

## Обзор

Модуль интеграции Jesse (https://jesse.trade) в CITARION. Jesse - это продвинутый Python фреймворк для алгоритмической торговли криптовалютами. Этот модуль портирует ключевые концепции и компоненты в TypeScript.

## Компоненты

### 1. Component Indicators System (`component-indicators.ts`)

Компонентная система индикаторов в стиле Jesse. Индикаторы являются "первоклассными гражданами" - их можно компоновать, кэшировать и переиспользовать.

**Особенности:**
- 70+ технических индикаторов
- Автоматическое кэширование результатов
- Композиция индикаторов через `CompositeIndicator`
- Look-ahead protection встроенная в каждый индикатор
- Lazy evaluation

**Индикаторы:**
- **Moving Averages:** SMA, EMA, HMA, WMA, DEMA, TEMA, KAMA, VWMA, VIDYA, McGinley
- **Momentum:** RSI, MACD, Stochastic, CCI, MFI, Williams %R, ROC, CMO, TSI, Awesome Oscillator
- **Volatility:** ATR, Bollinger Bands, Keltner Channels, Standard Deviation, Historical Volatility
- **Trend:** ADX, Parabolic SAR, Aroon, Ichimoku, Supertrend

**Пример использования:**
```typescript
import { indicatorRegistry } from "@/lib/jesse";

// Вычислить RSI
const rsiResult = indicatorRegistry.compute("rsi", candles, { period: 14 });

// Вычислить MACD
const macdResult = indicatorRegistry.compute("macd", candles, {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9
});

// Создать составной индикатор
const composite = new CompositeIndicator("my-indicator", "My Custom Indicator");
composite
  .addIndicator("rsi", "rsi14", { period: 14 })
  .addIndicator("macd", "macdDefault", {});
```

### 2. Look-Ahead Protection (`lookahead-protection.ts`)

Система защиты от look-ahead bias в бэктестах. Look-ahead bias - это использование будущей информации для принятия решений в текущий момент времени.

**Особенности:**
- Три режима: `strict`, `moderate`, `disabled`
- Автоматическая проверка доступа к данным
- Валидация индикаторов и стратегий
- Защищённый итератор свечей
- Логирование нарушений

**Пример использования:**
```typescript
import { LookAheadProtector, createProtectedBacktestContext } from "@/lib/jesse";

// Создать защитник
const protector = new LookAheadProtector({ mode: "strict" });

// Создать контекст
const context = createProtectedBacktestContext(candles, "strict");

// Использовать защищённый итератор
while (context.iterator.hasNext()) {
  context.iterator.next();
  const currentCandle = context.iterator.current();
  const previousCandles = context.iterator.getPrevious(20);
  
  // Стратегия не сможет получить доступ к будущим данным
}

// Проверить нарушения
const stats = protector.getStats();
console.log(`Violations: ${stats.total} (critical: ${stats.critical})`);
```

### 3. Partial Fills (`partial-fills.ts`)

Моделирование частичного исполнения ордеров. В реальной торговле ордера часто исполняются частями по разным ценам.

**Особенности:**
- Моделирование order book
- Настраиваемый slippage
- Multiple fills per order
- Метрики исполнения
- Интеграция с позициями

**Пример использования:**
```typescript
import { PartialFillsEngine, PartialPosition } from "@/lib/jesse";

const engine = new PartialFillsEngine({
  enabled: true,
  minFillPercent: 10,
  maxSlippage: 0.5,
  simulateOrderBook: true
});

// Создать ордер
const order = engine.createOrder({
  symbol: "BTCUSDT",
  type: "market",
  side: "buy",
  size: 1.0
});

// Исполнить с текущей свечой
const result = engine.executeOrder(order, candle);

console.log(`Filled: ${result.order.filledSize}/${order.size}`);
console.log(`Avg price: ${result.order.avgPrice}`);
console.log(`Fills count: ${result.metrics.fillCount}`);

// Создать позицию с частичными fills
const position = new PartialPosition("BTCUSDT", "long");
position.addEntry(result.order.fills[0]);
```

### 4. Multi-Symbol Strategies (`multi-symbol.ts`)

Система для торговли несколькими инструментами одновременно.

**Особенности:**
- Поддержка "routes" (символ/таймфрейм комбинации)
- Общие переменные между маршрутами
- Корреляционная матрица
- Pairs trading стратегия
- Portfolio rebalancing
- Cross-route события

**Пример использования:**
```typescript
import { MultiSymbolEngine, PairsTradingStrategy, createMultiSymbolEngine } from "@/lib/jesse";

// Создать движок
const engine = createMultiSymbolEngine([
  { symbol: "BTCUSDT", timeframe: "1h" },
  { symbol: "ETHUSDT", timeframe: "1h" },
  { symbol: "SOLUSDT", timeframe: "1h" }
], {
  maxOpenPositions: 3,
  maxCorrelation: 0.7
});

// Обновить данные
engine.updateCandles("route-0-BTCUSDT-1h", btcCandles);
engine.updateCandles("route-1-ETHUSDT-1h", ethCandles);

// Использовать общие переменные
engine.setSharedVariable("marketTrend", "bullish");
const trend = engine.getSharedVariable("marketTrend");

// Pairs trading
const pairsStrategy = new PairsTradingStrategy(engine);
const signal = pairsStrategy.generateSignal({
  routeId1: "route-0-BTCUSDT-1h",
  routeId2: "route-1-ETHUSDT-1h",
  lookbackPeriod: 20,
  entryZScore: 2.0,
  exitZScore: 0.5,
  positionSize: 0.1
});

// Анализ портфеля
const analysis = engine.analyzePortfolio();
console.log(`Total PnL: ${analysis.totalPnl}`);
console.log(`Diversification: ${analysis.diversificationScore}`);
```

### 5. Indicators Library (`indicators.ts`)

Полная библиотека технических индикаторов (300+ в оригинальном Jesse, 70+ портировано).

**Класс JesseIndicators:**
```typescript
import { JesseIndicators } from "@/lib/jesse";

const indicators = new JesseIndicators(candles);

// Moving Averages
const sma20 = indicators.sma(20);
const ema50 = indicators.ema(50);
const hma10 = indicators.hma(10);

// Momentum
const rsi = indicators.rsi(14);
const macd = indicators.macd(12, 26, 9);
const stoch = indicators.stoch(14, 3, 1);

// Volatility
const atr = indicators.atr(14);
const bb = indicators.bollingerBands(20, 2);

// Trend
const adx = indicators.adx(14);
const supertrend = indicators.supertrend(10, 3);
const ichimoku = indicators.ichimoku(9, 26, 52);
```

## Интеграция с CITARION

### Использование в стратегиях

```typescript
import { BaseStrategy, Candle, StrategySignal } from "@/lib/strategy/types";
import { indicatorRegistry, LookAheadProtector } from "@/lib/jesse";

export class MyJesseStrategy extends BaseStrategy {
  private protector = new LookAheadProtector({ mode: "strict" });

  populateIndicators(candles: Candle[]) {
    const rsi = indicatorRegistry.compute("rsi", candles, { period: 14 });
    const macd = indicatorRegistry.compute("macd", candles, {});
    return { rsi, macd };
  }

  populateEntrySignal(candles: Candle[], indicators: any, price: number) {
    const idx = candles.length - 1;
    this.protector.setCurrentIndex(idx);

    const rsiVal = indicators.rsi?.values[idx];
    const macdVal = indicators.macd?.values[idx];

    if (rsiVal < 30 && macdVal?.macd > macdVal?.signal) {
      return {
        type: "LONG",
        confidence: 80,
        // ...
      };
    }

    return null;
  }
}
```

### Использование в бэктестах

```typescript
import { BacktestEngine } from "@/lib/backtesting/engine";
import { 
  createProtectedBacktestContext, 
  PartialFillsEngine 
} from "@/lib/jesse";

async function runBacktest(candles: Candle[]) {
  const { protector, iterator, validator } = createProtectedBacktestContext(candles);
  const fillsEngine = new PartialFillsEngine({ enabled: true });

  // Валидация стратегии на look-ahead bias
  const strategy = {
    populateIndicators: (c) => indicatorRegistry.compute("rsi", c, {}),
    populateEntrySignal: (c, i, p) => ({ type: "LONG" })
  };
  
  const validation = validator.validateStrategy(strategy, candles);
  if (!validation.valid) {
    console.warn("Strategy has look-ahead bias!");
  }

  // Запуск бэктеста с защитой
  // ...
}
```

## Конфигурация

```typescript
import { createJesseIntegration } from "@/lib/jesse";

const jesse = createJesseIntegration({
  lookAheadMode: "strict",      // Защита от look-ahead
  partialFillsEnabled: true,    // Частичное исполнение
  maxOpenPositions: 5           // Максимум позиций
});

// Использование
jesse.protector.canAccess(index);
jesse.fillsEngine.createOrder({ ... });
jesse.multiSymbolEngine.addRoute({ ... });
```

## Сравнение с оригинальным Jesse

| Функция | Jesse (Python) | CITARION (TypeScript) |
|---------|----------------|----------------------|
| Индикаторы | 300+ (TA-Lib) | 70+ (native) |
| Look-ahead protection | Автоматический | Настраиваемый |
| Partial fills | ✓ | ✓ |
| Multi-symbol | Routes | Routes + Pairs |
| Backtesting | Отчёты HTML | Интеграция с BacktestEngine |

## Рекомендации

1. **Всегда включайте look-ahead protection** при бэктестинге
2. **Используйте partial fills** для реалистичного моделирования
3. **Проверяйте корреляции** при торговле несколькими инструментами
4. **Валидируйте стратегии** перед live торговлей

## Ссылки

- [Jesse Documentation](https://jesse.trade)
- [Jesse GitHub](https://github.com/jesse-ai/jesse)
- [Multi-Strategy Coordination](https://deepwiki.com/jesse-ai/gpt-instructions/3.10-multi-strategy-coordination)
