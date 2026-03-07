# Zenbot Integration Documentation

## Overview

Полная интеграция компонентов из [Zenbot](https://github.com/DeviaVir/zenbot) - криптовалютного торгового бота с открытым исходным кодом.

**Версия:** 2.0.0  
**Автор:** CITARION Team (ported from Zenbot)  
**Дата обновления:** Январь 2026  
**Статус:** ✅ ПОЛНОСТЬЮ ИНТЕГРИРОВАНО

---

## Статус интеграции

| Компонент | Статус | Файл |
|-----------|--------|------|
| 15+ стратегий | ✅ Завершено | `zenbot-strategies.ts`, `zenbot-extra-strategies.ts`, `zenbot-remaining-strategies.ts` |
| Trailing Stop | ✅ Завершено | `trailing-stop.ts` |
| Risk Manager | ✅ Завершено | `risk-manager.ts` |
| Plugin System | ✅ Завершено | `plugin-system.ts` |
| Trading Engine | ✅ Завершено | `zenbot-engine.ts` |
| Neural Strategy | ✅ Завершено | `neural-strategy.ts` |

---

## 1. Стратегии (20+ стратегий)

### 1.1 Основные Zenbot стратегии

Все стратегии портированы из Zenbot и адаптированы под архитектуру CITARION.

| Стратегия | ID | Тип | Описание |
|-----------|----|----|----------|
| **Bollinger Bands** | `zenbot-bollinger` | Mean Reversion | Buy при касании нижней полосы, sell при касании верхней |
| **VWAP Crossover** | `zenbot-vwap-crossover` | Trend | VWAP выше/ниже EMA определяет тренд |
| **DEMA Crossover** | `zenbot-dema` | Trend | Double EMA crossover с RSI фильтром |
| **Parabolic SAR** | `zenbot-sar` | Trend | Торговля по разворотам SAR |
| **Momentum** | `zenbot-momentum` | Momentum | Изменение цены за период |
| **Stochastic RSI + MACD** | `zenbot-srsi-macd` | Oscillator | Комбинация StochRSI и MACD |
| **Wave Trend** | `zenbot-wavetrend` | Oscillator | Wave Trend осциллятор |
| **CCI SRSI** | `zenbot-cci-srsi` | Oscillator | Stochastic CCI |
| **TRIX** | `zenbot-trix` | Oscillator | TRIX с RSI фильтром |
| **Ultimate Oscillator** | `zenbot-ultosc` | Oscillator | Ultimate Oscillator |
| **Hull MA** | `zenbot-hma` | Trend | Hull Moving Average |
| **PPO** | `zenbot-ppo` | Momentum | Percentage Price Oscillator |
| **Trust/Distrust** | `zenbot-trust-distrust` | Reversal | Логика доверия/недоверия |
| **TSI** | `zenbot-tsi` | Momentum | True Strength Index |

### 1.2 Дополнительные Zenbot стратегии

| Стратегия | ID | Тип | Описание |
|-----------|----|----|----------|
| **Trend EMA** | `zenbot-trend-ema` | Trend | Стратегия по умолчанию в Zenbot |
| **RSI High-Water** | `zenbot-rsi-highwater` | Mean Reversion | RSI с high-water mark |
| **Speed** | `zenbot-speed` | Volatility | Экспериментальная стратегия волатильности |
| **StdDev** | `zenbot-stddev` | Statistical | Standard Deviation стратегия |
| **Trendline** | `zenbot-trendline` | Trend | Торговля по трендовым линиям |

### 1.3 AI-powered стратегии

| Стратегия | ID | Тип | Описание |
|-----------|----|----|----------|
| **Neural Network** | `zenbot-neural` | ML | Предсказание цены нейросетью |

### 1.4 Использование стратегий

```typescript
import { 
  ZenbotBollingerStrategy, 
  ZenbotDEMAStrategy,
  ZenbotSARStrategy,
  BUILTIN_STRATEGIES 
} from "@/lib/strategy";

// Создание стратегии
const strategy = new ZenbotBollingerStrategy();
strategy.setParameters({
  period: 20,
  stdDev: 2,
  upperBoundPct: 0,
  lowerBoundPct: 0,
});

// Расчёт индикаторов
const indicators = strategy.populateIndicators(candles);

// Получение сигнала входа
const signal = strategy.populateEntrySignal(candles, indicators, currentPrice);

// Получение сигнала выхода
const exitSignal = strategy.populateExitSignal(candles, indicators, position);
```

---

## 2. Trailing Stop (High-Water Mark)

Файл: `/src/lib/strategy/trailing-stop.ts`

### 2.1 Логика из Zenbot

```javascript
// Пример из Zenbot config
profit_stop_enable_pct: 10,  // Активировать при 10% прибыли
profit_stop_pct: 4,          // Trailing 4% от пика
```

### 2.2 Использование

```typescript
import { createTrailingStop, TrailingStopManager, TRAILING_STOP_PRESETS } from "@/lib/strategy/trailing-stop";

// Создание trailing stop
const trailingStop = createTrailingStop(
  entryPrice,     // Цена входа
  "LONG",         // Направление
  10,             // profit_stop_enable_pct (%)
  4               // profit_stop_pct (%)
);

// Проверка на каждом тике
const result = trailingStop.check(currentPrice);

if (result.shouldActivate) {
  console.log("Trailing stop activated:", result.newStopLoss);
}

if (result.shouldClose) {
  console.log("Position should be closed:", result.reason);
}
```

### 2.3 Предустановки

| Пресет | Активация | Trailing | Применение |
|--------|-----------|----------|------------|
| `conservative` | 5% | 2% | Низкий риск |
| `moderate` | 8% | 3% | Баланс |
| `aggressive` | 10% | 4% | Zenbot default |
| `scalping` | 2% | 1% | Быстрые сделки |
| `swing` | 15% | 5% | Долгосрочные |

---

## 3. Risk Manager

Файл: `/src/lib/strategy/risk-manager.ts`

### 3.1 Компоненты защиты

1. **Loss Protection**
   - `max_sell_loss_pct` - защита от продажи ниже цены покупки
   - `max_buy_loss_pct` - защита от покупки выше последней продажи

2. **Slippage Protection**
   - `max_slippage_pct` - защита от исполнения по худшей цене

3. **Order Size Protection**
   - `minOrderSize`, `maxOrderSize`
   - `minOrderTotal` - минимальная стоимость ордера

4. **Balance Protection**
   - `tradePct` - процент депозита для торговли
   - `reservePct` - резервный процент

### 3.2 Использование

```typescript
import { RiskManager, RISK_PRESETS } from "@/lib/strategy/risk-manager";

// Создание с предустановкой
const riskManager = new RiskManager(RISK_PRESETS.conservative);

// Проверка сделки
const result = riskManager.checkRisk({
  currentPrice: 50000,
  proposedPrice: 50050,
  proposedSize: 0.1,
  direction: "buy",
  balance: {
    asset: 0.5,
    currency: 10000,
    deposit: 50000,
  },
  trades: [
    { type: "buy", price: 48000, size: 0.1, time: Date.now() - 3600000 }
  ],
});

if (!result.allowed) {
  console.log("Trade rejected:", result.reason, result.description);
}
```

### 3.3 Предустановки

| Пресет | Max Sell Loss | Max Buy Loss | Slippage | Trade % |
|--------|---------------|--------------|----------|---------|
| `conservative` | 2% | 2% | 0.5% | 50% |
| `moderate` | 5% | 5% | 1% | 75% |
| `aggressive` | - | - | 2% | 95% |
| `zenbotDefault` | - | - | - | 100% |

---

## 4. Plugin System

Файл: `/src/lib/strategy/plugin-system.ts`

Плагинная архитектура для расширения функциональности стратегий.

### 4.1 Типы хуков

```typescript
type PluginHook = 
  | "beforeAnalysis"
  | "afterAnalysis"
  | "onSignal"
  | "onPositionOpen"
  | "onPositionClose"
  | "onError"
  | "beforeTrade"
  | "afterTrade";
```

### 4.2 Встроенные плагины

| Плагин | Описание |
|--------|----------|
| `LoggingPlugin` | Логирование всех сигналов |
| `ConfidenceFilterPlugin` | Фильтрация по минимальной уверенности |
| `DeduplicationPlugin` | Предотвращение дублирующих сигналов |
| `RateLimitPlugin` | Ограничение частоты сигналов |
| `NotificationPlugin` | Отправка уведомлений |

### 4.3 Использование

```typescript
import { getPluginManager, IStrategyPlugin } from "@/lib/strategy/plugin-system";

const pluginManager = getPluginManager();

// Создание кастомного плагина
const customPlugin: IStrategyPlugin = {
  id: "custom-filter",
  name: "Custom Filter",
  version: "1.0.0",
  hooks: {
    onSignal: async (context) => {
      if (context.signal && context.signal.confidence < 70) {
        return { proceed: true, modifiedSignal: null };
      }
      return { proceed: true };
    },
  },
};

// Регистрация
pluginManager.registerPlugin(customPlugin);
```

---

## 5. Zenbot Trading Engine

Файл: `/src/lib/strategy/zenbot-engine.ts`

Полноценный торговый движок в стиле Zenbot.

### 5.1 Возможности

- **Режимы работы**: `watch`, `paper`, `live`
- **Trailing Stop**: High-water mark логика
- **Risk Management**: Интеграция с RiskManager
- **Order Types**: `maker` (limit), `taker` (market)
- **Stop Loss / Buy Stop**: Защитные ордера
- **Statistics**: Win rate, PnL, vs Buy/Hold

### 5.2 Использование

```typescript
import { 
  createZenbotEngine,
  createPaperTradingEngine,
  ZENBOT_PRESETS 
} from "@/lib/strategy/zenbot-engine";

// Создание движка для paper trading
const engine = createPaperTradingEngine(
  "BTCUSDT",
  "zenbot-trend-ema",
  {
    deposit: 10000,
    profitStopEnablePct: 10,
    profitStopPct: 4,
    ...ZENBOT_PRESETS.moderate,
  }
);

// Установка callbacks
engine.setCallbacks({
  onTrade: (trade) => console.log("Trade:", trade),
  onSignal: (signal) => console.log("Signal:", signal),
  onPositionChange: (position) => console.log("Position:", position),
});

// Добавление свечей
for (const candle of historicalCandles) {
  const result = await engine.addCandle(candle);
  if (result.shouldTrade) {
    console.log("Trade executed:", result.tradeReason);
  }
}

// Получение статистики
const stats = engine.getStats();
console.log(`Win rate: ${stats.winRate.toFixed(1)}%`);
console.log(`Total PnL: ${stats.totalPnl.toFixed(2)}`);
```

---

## 6. Интеграция с Tactics

Все Zenbot стратегии интегрированы с системой Tactics CITARION:

```typescript
import { ZenbotBollingerStrategy, PREDEFINED_TACTICS_SETS } from "@/lib/strategy";

const strategy = new ZenbotBollingerStrategy();
strategy.setParameters({
  period: 20,
  stdDev: 2,
});

// Стратегия автоматически использует Tactics
const config = strategy.getConfig();
console.log(config.defaultTactics); // Predefined tactics set
```

---

## 7. Структура файлов

```
/src/lib/strategy/
├── zenbot-strategies.ts        # 8 основных Zenbot стратегий
├── zenbot-extra-strategies.ts  # 5 дополнительных Zenbot стратегий
├── zenbot-remaining-strategies.ts # 7 оставшихся Zenbot стратегий
├── neural-strategy.ts          # AI-powered стратегия
├── trailing-stop.ts            # Trailing stop с high-water mark
├── risk-manager.ts             # Risk management модуль
├── plugin-system.ts            # Плагинная архитектура
├── zenbot-engine.ts            # Торговый движок Zenbot
├── builtin.ts                  # Экспорт всех стратегий
├── types.ts                    # Типы и интерфейсы
└── index.ts                    # Модульные экспорты
```

---

## 8. Лучшие практики

### 8.1 Выбор стратегии

| Рынок | Рекомендуемые стратегии |
|-------|------------------------|
| Боковик (Range) | Bollinger, CCI_SRSI, StochMACD |
| Тренд (Trending) | DEMA, VWAP, HMA, SAR |
| Волатильный (Volatile) | WaveTrend, TSI, PPO |
| Все рынки | Momentum, Trust_Distrust, Trend_EMA |

### 8.2 Настройка Risk Manager

```typescript
// Для долгосрочных позиций
const longTermRisk = new RiskManager({
  maxSellLossPct: 5,
  maxBuyLossPct: 5,
  maxSlippagePct: 1,
  tradePct: 70,
  reservePct: 10,
});

// Для скальпинга
const scalpingRisk = new RiskManager({
  maxSellLossPct: null,
  maxBuyLossPct: null,
  maxSlippagePct: 0.5,
  tradePct: 90,
  reservePct: 5,
});
```

### 8.3 Комбинация с Trailing Stop

```typescript
// Активная стратегия с автоматическим trailing
const signal = strategy.populateEntrySignal(candles, indicators, price);

if (signal?.type === "LONG") {
  const trailingStop = createTrailingStop(
    price,
    "LONG",
    10, // Активация при 10% прибыли
    3   // Trailing 3% от пика
  );
  
  // Добавить в позицию
  position.trailingStop = trailingStop;
}
```

---

## 9. Отличия от оригинального Zenbot

| Аспект | Zenbot | CITARION |
|--------|--------|----------|
| Архитектура | Монолитная | Модульная |
| Язык | JavaScript | TypeScript |
| Индикаторы | Встроенные | @junduck/trading-indi + собственные |
| Бэктестинг | Простой | Walk-Forward + Monte Carlo |
| ML | Нет | z-ai-sdk интеграция |
| Биржи | 20+ | 5+ (Binance, Bybit, OKX, Bitget, BingX) |
| Плагины | Нет | Полноценная система |

---

## 10. Ссылки

- [Zenbot Repository](https://github.com/DeviaVir/zenbot)
- [Zenbot Strategies Documentation](https://github.com/DeviaVir/zenbot/tree/master/extensions/strategies)
- [CITARION Strategy Framework](/docs/strategy-framework.md)
- [Abu Integration](/docs/modules/abu-integration.md)
