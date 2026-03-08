# Интеграция Zenbot + Abu + Trader

## Обзор

Полная интеграция компонентов из трёх open-source проектов для создания мощной торговой системы.

**Версия:** 2.0.0  
**Автор:** CITARION Team  
**Дата:** Январь 2026

---

## Архитектура интеграции

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CITARION Trading System                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐    │
│  │   ZENBOT (15+  │    │   ABU (ML +    │    │   TRADER       │    │
│  │   Strategies)  │    │   Alpha)       │    │   (Async)      │    │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘    │
│          │                     │                      │              │
│          v                     v                      v              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    STRATEGY LAYER                            │   │
│  │  • 15+ Zenbot Strategies    • Alpha Factors (12)            │   │
│  │  • Neural Strategy          • Self-Learning Engine          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│          │                                                           │
│          v                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    INTEGRATION LAYER                         │   │
│  │  • SignalIntegrator         • OrderAnalyzer                 │   │
│  │  • Trailing Stop Manager    • Risk Manager                  │   │
│  │  • MessageQueue (async)     • Position Tracker              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│          │                                                           │
│          v                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    EXECUTION LAYER                           │   │
│  │  • Exchange Clients (5+)    • Paper Trading                  │   │
│  │  • Order Management         • Position Management            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Фаза 1: Zenbot Integration

### Стратегии (15+)

Все стратегии портированы и оптимизированы:

| Стратегия | Тип | Таймфрейм | Описание |
|-----------|-----|-----------|----------|
| `zenbot-bollinger` | Mean Reversion | 1h | Bollinger Bands |
| `zenbot-vwap-crossover` | Trend | 2h | VWAP/EMA Crossover |
| `zenbot-dema` | Trend | 1h | Double EMA Crossover |
| `zenbot-sar` | Trend | 2m | Parabolic SAR |
| `zenbot-momentum` | Momentum | 15m | Momentum Strategy |
| `zenbot-srsi-macd` | Oscillator | 30m | Stochastic RSI + MACD |
| `zenbot-wavetrend` | Oscillator | 1h | Wave Trend |
| `zenbot-cci-srsi` | Oscillator | 20m | Stochastic CCI |
| `zenbot-trix` | Oscillator | 5m | TRIX Oscillator |
| `zenbot-ultosc` | Oscillator | 5m | Ultimate Oscillator |
| `zenbot-hma` | Trend | 15m | Hull Moving Average |
| `zenbot-ppo` | Momentum | 10m | Percentage Price Oscillator |
| `zenbot-trust-distrust` | Reversal | 30m | Trust/Distrust |
| `zenbot-tsi` | Momentum | 1h | True Strength Index |
| `neural` | AI-powered | Multi | Neural Network Strategy |

### Trailing Stop (High-Water Mark)

```typescript
import { createTrailingStop, TRAILING_STOP_PRESETS } from "@/lib/strategy/trailing-stop";

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
  console.log("Trailing activated:", result.newStopLoss);
}

if (result.shouldClose) {
  console.log("Position should be closed:", result.reason);
}
```

### Risk Manager

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
  balance: { asset: 0.5, currency: 10000, deposit: 50000 },
  trades: [{ type: "buy", price: 48000, size: 0.1, time: Date.now() }],
});

if (!result.allowed) {
  console.log("Trade rejected:", result.reason);
}
```

---

## Фаза 2: Abu Integration

### Self-Learning Module

Автоматическое улучшение стратегий:

```typescript
import { createSelfLearningEngine } from "@/lib/strategy/self-learning";

const engine = createSelfLearningEngine("rsi-reversal", {
  learningMode: "moderate",
  minTradesForLearning: 30,
  sources: {
    backtest: true,
    paper: true,
    live: false,
    aiAnalysis: true,
  },
});

// Запись результатов
await engine.recordTrade("rsi-reversal", {
  symbol: "BTCUSDT",
  timeframe: "1h",
  direction: "LONG",
  entryPrice: 50000,
  exitPrice: 51500,
  pnl: 150,
  // ...
});

// Оптимизация
const result = await engine.optimize("rsi-reversal", "BTCUSDT", "1h");
```

### Alpha Factors (12 факторов)

```typescript
import { createAlphaFactorsEngine } from "@/lib/strategy/alpha-factors";

const engine = createAlphaFactorsEngine({
  enabledFactors: [
    "price_vs_ema", "ema_crossover", "macd_signal",
    "rsi_mean_reversion", "bollinger_position",
    "roc", "momentum_score", "volume_trend",
  ],
  combineMethod: "weighted_average",
});

const signal = engine.getSignal(candles);
// signal.overallSignal: "buy" | "sell" | "neutral"
// signal.confidence: 0-1
```

### Neural Strategy (AI Integration)

```typescript
import { ZenbotNeuralStrategy } from "@/lib/strategy/neural-strategy";

const strategy = new ZenbotNeuralStrategy();
strategy.setParameters({
  useAI: true,
  minConfidence: 60,
  predictionThreshold: 0.5,
});

// Асинхронный анализ
const signal = await strategy.analyzeWithAI(candles, currentPrice);
```

---

## Фаза 3: Integration Layer

### SignalIntegrator

Объединяет все компоненты:

```typescript
import { createSignalIntegrator } from "@/lib/strategy/integration";

const integrator = createSignalIntegrator({
  trailingStopPreset: "moderate",
  riskPreset: "moderate",
  riskPerTrade: 2,  // 2% per trade
  preventLossTrades: true,
});

// Улучшение сигнала
const enhancedSignal = integrator.enhanceSignal(signal, {
  balance: 10000,
  recentTrades: [],
  currentPrice: 50000,
});

// Создание позиции с trailing stop
const position = integrator.createPosition(enhancedSignal, "BTCUSDT", 0.1);

// Обновление позиции
const update = integrator.updatePosition(position.id, currentPrice);
if (update.shouldClose) {
  console.log("Close reason:", update.closeReason);
}
```

### OrderAnalyzer

Предотвращение убыточных сделок:

```typescript
import { createOrderAnalyzer } from "@/lib/strategy/integration";

const analyzer = createOrderAnalyzer();

const analysis = analyzer.analyzeOrder(signal, candles, indicators);

if (!analysis.shouldProceed) {
  console.log("Order rejected:", analysis.reason);
  console.log("Suggestions:", analysis.suggestions);
}

console.log("Risk level:", analysis.riskLevel);
console.log("Expected profit:", analysis.expectedProfit);
```

### MessageQueue (Async Patterns)

Redis-style асинхронная обработка:

```typescript
import { createMessageQueue } from "@/lib/strategy/integration";

const queue = createMessageQueue();

// Подписка на события
queue.subscribe("signal", async (message) => {
  const signal = message.payload as StrategySignal;
  await processSignal(signal);
});

queue.subscribe("risk_alert", async (message) => {
  await handleRiskAlert(message.payload);
});

// Публикация сообщений
await queue.publish({
  type: "signal",
  payload: signal,
  priority: "high",
  maxRetries: 3,
});
```

---

## Структура файлов

```
/src/lib/strategy/
├── types.ts                  # Типы и интерфейсы
├── builtin.ts                # Встроенные стратегии
├── index.ts                  # Экспорты
│
├── # Zenbot Port
├── zenbot-strategies.ts      # 15+ стратегий
├── trailing-stop.ts          # Trailing stop
├── risk-manager.ts           # Risk management
├── plugin-system.ts          # Plugin architecture
├── neural-strategy.ts        # AI-powered стратегия
│
├── # Abu Port
├── self-learning.ts          # Self-learning engine
├── alpha-factors.ts          # 12 Alpha факторов
├── phenotypes.ts             # Genetic algorithms
│
├── # Integration Layer
├── integration.ts            # SignalIntegrator, OrderAnalyzer, MessageQueue
│
├── # Strategy Management
├── manager.ts                # StrategyManager
├── indicators.ts             # Indicator calculations
│
└── tactics/
    ├── types.ts              # Tactics types
    ├── executor.ts           # Tactics executor
    └── index.ts              # Tactics exports
```

---

## Конфигурации по умолчанию

### Trailing Stop Presets

| Пресет | Активация | Trailing | Применение |
|--------|-----------|----------|------------|
| conservative | 5% | 2% | Низкий риск |
| moderate | 8% | 3% | Баланс |
| aggressive | 10% | 4% | Zenbot default |
| scalping | 2% | 1% | Быстрые сделки |
| swing | 15% | 5% | Долгосрочные |

### Risk Presets

| Пресет | Max Sell Loss | Max Buy Loss | Slippage | Trade % |
|--------|---------------|--------------|----------|---------|
| conservative | 2% | 2% | 0.5% | 50% |
| moderate | 5% | 5% | 1% | 75% |
| aggressive | - | - | 2% | 95% |
| zenbotDefault | - | - | - | 100% |

### Alpha Factors Weights

| Категория | Факторы | Вес |
|-----------|---------|-----|
| Trend | ema_crossover, price_vs_ema, macd_signal | 1.0-1.2 |
| Mean Reversion | bollinger_position, price_vs_vwap, rsi_mean_reversion | 0.8-1.0 |
| Momentum | momentum_score, roc | 0.7-0.9 |
| Volatility | atr_ratio, volatility_trend | 0.4-0.5 |
| Volume | volume_trend, obv_trend | 0.7-0.8 |

---

## Метрики производительности

### Self-Learning метрики

- **Win Rate**: Доля прибыльных сделок
- **Profit Factor**: Отношение прибыли к убыткам
- **Sharpe Ratio**: Доходность с учётом риска
- **Max Drawdown**: Максимальная просадка
- **Improvement Score**: Улучшение после оптимизации

### Alpha Factors метрики

- **Factor Value**: Сила сигнала (-1 до 1)
- **Confidence**: Уверенность (0 до 1)
- **Overall Signal**: Комбинированный сигнал
- **Factor Correlation**: Корреляция между факторами

---

## Лучшие практики

### 1. Выбор стратегии по рынку

| Рынок | Рекомендуемые стратегии |
|-------|------------------------|
| Боковик | Bollinger, CCI_SRSI, StochMACD |
| Тренд | DEMA, VWAP, HMA, SAR |
| Волатильный | WaveTrend, TSI, PPO |
| Все | Momentum, Trust_Distrust, Neural |

### 2. Настройка Risk Management

```typescript
// Для долгосрочных позиций
const longTermRisk = {
  maxSellLossPct: 5,
  maxBuyLossPct: 5,
  maxSlippagePct: 1,
  tradePct: 70,
};

// Для скальпинга
const scalpingRisk = {
  maxSellLossPct: null,
  maxBuyLossPct: null,
  maxSlippagePct: 0.5,
  tradePct: 90,
};
```

### 3. Комбинация компонентов

```typescript
// Полный пайплайн
const signal = strategy.populateEntrySignal(candles, indicators, price);

// 1. Анализ ордера
const analysis = orderAnalyzer.analyzeOrder(signal, candles, indicators);
if (!analysis.shouldProceed) return;

// 2. Интеграция с рисками
const enhanced = integrator.enhanceSignal(signal, context);

// 3. Создание позиции
const position = integrator.createPosition(enhanced, symbol, size);

// 4. Запись для self-learning
await selfLearning.recordTrade(strategyId, tradeData);
```

---

## Источники

- [Zenbot Repository](https://github.com/DeviaVir/zenbot)
- [Abu Repository](https://github.com/bbfamily/abu)
- [Trader Repository](https://github.com/timercrack/trader)
- [SuperTrend Repository](https://github.com/maxgfr/supertrend)

---

## История изменений

| Версия | Дата | Изменения |
|--------|------|-----------|
| 2.0.0 | Январь 2026 | Integration layer, MessageQueue, OrderAnalyzer |
| 1.5.0 | Январь 2026 | Alpha factors, Self-learning |
| 1.0.0 | Декабрь 2025 | Initial Zenbot port |
