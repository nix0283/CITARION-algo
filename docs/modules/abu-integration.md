# Abu Integration Documentation

## Overview

Интеграция компонентов из [Abu](https://github.com/bbfamily/abu) -量化交易平台 с самообучающимися модулями.

**Версия:** 2.0.0  
**Автор:** CITARION Team (inspired by Abu)  
**Дата обновления:** Январь 2026  
**Статус:** ✅ ПОЛНОСТЬЮ ИНТЕГРИРОВАНО

---

## Статус интеграции

| Компонент | Статус | Файл |
|-----------|--------|------|
| Self-Learning Module | ✅ Завершено | `self-learning.ts` |
| Alpha Factors (12 факторов) | ✅ Завершено | `alpha-factors.ts` |
| ML Integration (z-ai-sdk) | ✅ Завершено | `self-learning.ts` |
| Order Analyzer | ✅ Завершено | `self-learning.ts` |

---

## 1. Self-Learning Module

Файл: `/src/lib/strategy/self-learning.ts`

Автоматическое улучшение параметров стратегий на основе истории сделок.

### 1.1 Возможности

- **Автоматическое обучение**: Периодическая оптимизация параметров
- **AI-анализ**: Интеграция с z-ai-sdk для анализа стратегий
- **История обучения**: Сохранение результатов обучения
- **Проверка улучшений**: Применение только при значимом улучшении

### 1.2 Использование

```typescript
import { SelfLearner, createSelfLearner } from "@/lib/strategy/self-learning";

// Создание Self-Learner
const learner = createSelfLearner({
  learningInterval: 3600000,      // 1 час
  minTradesForLearning: 30,       // Минимум 30 сделок
  improvementThreshold: 5,        // Минимум 5% улучшения
  maxParamChange: 20,             // Макс. 20% изменение параметра
  useAI: true,                    // Использовать AI
});

// Обучение стратегии
const result = await learner.learn(
  strategy,
  candles,
  trades
);

if (result) {
  console.log(`Улучшение: ${result.improvement.toFixed(1)}%`);
  console.log(`Новые параметры:`, result.newParams);
  
  // Применение параметров
  if (result.confidence > 70) {
    strategy.setParameters(result.newParams);
  }
}
```

### 1.3 AI-анализ стратегий

```typescript
// Анализ с помощью z-ai-sdk
const analysis = await learner.analyzeWithAI(
  strategy,
  candles,
  recentSignals
);

console.log("Insights:", analysis.insights);
console.log("Suggestions:", analysis.suggestions);
console.log("Confidence:", analysis.confidence);
```

### 1.4 Конфигурация

```typescript
interface SelfLearnerConfig {
  learningInterval: number;       // Интервал обучения (ms)
  minTradesForLearning: number;   // Мин. сделок для обучения
  improvementThreshold: number;   // Порог улучшения (%)
  maxParamChange: number;         // Макс. изменение параметра (%)
  useAI: boolean;                 // Использовать AI
  keepHistory: boolean;           // Сохранять историю
  maxHistorySize: number;         // Макс. размер истории
}
```

---

## 2. Alpha Factors

Файл: `/src/lib/strategy/alpha-factors.ts`

12 факторных моделей для генерации торговых сигналов.

### 2.1 Категории факторов

| Категория | Факторы | Описание |
|-----------|---------|----------|
| **Trend** | Price vs EMA, EMA Crossover, MACD Signal | Следование за трендом |
| **Mean Reversion** | RSI Mean Reversion, Bollinger Position, Price vs VWAP | Возврат к среднему |
| **Momentum** | ROC, Momentum Score | Импульс |
| **Volatility** | ATR Ratio, Volatility Trend | Волатильность |
| **Volume** | Volume Trend, OBV Trend | Объём |

### 2.2 Результат фактора

```typescript
interface AlphaFactorResult {
  name: string;                  // Название фактора
  category: string;              // Категория
  value: number;                 // -1 to 1
  confidence: number;            // 0 to 1
  signal: "buy" | "sell" | "neutral";
  metadata?: Record<string, unknown>;
}
```

### 2.3 Использование

```typescript
import { 
  AlphaFactorsEngine, 
  createAlphaFactorsEngine,
  alphaPriceVsEMA,
  alphaRSIMeanReversion
} from "@/lib/strategy/alpha-factors";

// Создание движка
const engine = createAlphaFactorsEngine({
  enabledFactors: [
    "price_vs_ema",
    "ema_crossover",
    "macd_signal",
    "rsi_mean_reversion",
    "bollinger_position",
  ],
  combineMethod: "weighted_average",
  neutralThreshold: 0.2,
  minConfidence: 0.3,
});

// Расчёт всех факторов
const factors = engine.calculateFactors(candles);

// Комбинированный сигнал
const signal = engine.getSignal(candles);

console.log(`Overall: ${signal.overallSignal}`);
console.log(`Value: ${signal.overallValue.toFixed(3)}`);
console.log(`Confidence: ${signal.confidence.toFixed(2)}`);

// Детализация по факторам
for (const factor of signal.factors) {
  console.log(`${factor.name}: ${factor.value.toFixed(3)} (${factor.signal})`);
}
```

### 2.4 Описание факторов

#### Trend Factors

**Price vs EMA**
- Измеряет расстояние цены от EMA
- Положительное значение = цена выше EMA (бычий сигнал)
- Негативное значение = цена ниже EMA (медвежий сигнал)

**EMA Crossover**
- Определяет пересечение короткой и длинной EMA
- Усиливает сигнал при пересечении

**MACD Signal**
- Анализирует гистограмму MACD
- Положительная гистограмма = бычий импульс

#### Mean Reversion Factors

**RSI Mean Reversion**
- Покупать на перепроданности (RSI < 30)
- Продавать на перекупленности (RSI > 70)

**Bollinger Position**
- %B: позиция цены в полосах Боллинджера
- Покупать у нижней полосы, продавать у верхней

**Price vs VWAP**
- Цена ниже VWAP = потенциальная покупка
- Цена выше VWAP = потенциальная продажа

#### Momentum Factors

**ROC (Rate of Change)**
- Скорость изменения цены за период
- Положительный ROC = растущий импульс

**Momentum Score**
- Комбинированный импульс с взвешиванием по времени
- Более недавние движения имеют больший вес

#### Volatility Factors

**ATR Ratio**
- Отношение текущего ATR к среднему
- Низкая волатильность = потенциал для breakout

**Volatility Trend**
- Тренд волатильности
- Информационный фактор

#### Volume Factors

**Volume Trend**
- Анализ тренда объёма с подтверждением цены
- Растущий объём + растущая цена = сильный бычий сигнал

**OBV Trend**
- Тренд On-Balance Volume
- Растущий OBV = накопление

---

## 3. Order Analyzer

Файл: `/src/lib/strategy/self-learning.ts`

Анализ потенциальных ордеров для предотвращения убыточных сделок.

### 3.1 Возможности

- **Market Condition Analysis**: trending, ranging, volatile
- **Liquidity Score**: Оценка ликвидности
- **Spread Score**: Оценка спреда
- **Volume Score**: Оценка объёма
- **Momentum Score**: Оценка импульса

### 3.2 Использование

```typescript
import { OrderAnalyzer, createOrderAnalyzer } from "@/lib/strategy/self-learning";

const analyzer = createOrderAnalyzer();

// Анализ ордера
const analysis = await analyzer.analyze(
  "BTCUSDT",
  "buy",
  50000,
  0.1,
  candles
);

if (!analysis.shouldProceed) {
  console.log("Order rejected:");
  for (const warning of analysis.warnings) {
    console.log(`  ⚠️ ${warning}`);
  }
  for (const suggestion of analysis.suggestions) {
    console.log(`  💡 ${suggestion}`);
  }
}

console.log(`Risk Score: ${analysis.riskScore}/100`);
console.log(`Market: ${analysis.factors.marketCondition}`);
console.log(`Liquidity: ${analysis.factors.liquidityScore.toFixed(1)}`);
```

### 3.3 Результат анализа

```typescript
interface OrderAnalysisResult {
  shouldProceed: boolean;       // Продолжить ли сделку
  riskScore: number;            // 0-100
  confidence: number;           // 0-100
  warnings: string[];           // Предупреждения
  suggestions: string[];        // Рекомендации
  factors: {
    marketCondition: "trending" | "ranging" | "volatile" | "unknown";
    liquidityScore: number;     // 0-100
    spreadScore: number;        // 0-100
    volumeScore: number;        // 0-100
    momentumScore: number;      // -100 to 100
  };
}
```

---

## 4. ML Integration (z-ai-sdk)

Интеграция с `z-ai-web-dev-sdk` для AI-powered анализа.

### 4.1 Использование в Self-Learner

```typescript
// Автоматический анализ через AI
const analysis = await learner.analyzeWithAI(strategy, candles, signals);

// analysis.insights - массив инсайтов от AI
// analysis.suggestions - рекомендации по параметрам
// analysis.confidence - уверенность AI
```

### 4.2 Пример AI-анализа

```typescript
// Self-Learner использует z-ai-sdk для:
const prompt = `Analyze this trading strategy and suggest parameter improvements:

Strategy: ${config.name}
Current Parameters: ${JSON.stringify(params)}
Recent Signals: ${JSON.stringify(recentSignals)}
Market Context: ${candles.length} candles analyzed

Provide:
1. Analysis of current strategy performance
2. Suggested parameter adjustments
3. Risk assessment

Respond in JSON format.`;

const completion = await zai.chat.completions.create({
  messages: [
    { role: "system", content: "You are a quantitative trading strategy analyst." },
    { role: "user", content: prompt },
  ],
  temperature: 0.3,
});
```

---

## 5. Интеграция со стратегиями

### 5.1 Использование Alpha Factors в стратегии

```typescript
import { AlphaFactorsEngine, createAlphaFactorsEngine } from "@/lib/strategy/alpha-factors";

class MyStrategy extends BaseStrategy {
  private alphaEngine: AlphaFactorsEngine;
  
  constructor() {
    super(config);
    this.alphaEngine = createAlphaFactorsEngine();
  }
  
  populateEntrySignal(candles, indicators, price) {
    // Получаем альфа-сигнал
    const alphaSignal = this.alphaEngine.getSignal(candles);
    
    // Комбинируем с основным сигналом
    if (alphaSignal.overallSignal === "buy" && alphaSignal.confidence > 0.6) {
      return {
        type: "LONG",
        confidence: alphaSignal.confidence * 100,
        // ...
      };
    }
    
    return null;
  }
}
```

### 5.2 Использование Self-Learning

```typescript
import { getSelfLearner } from "@/lib/strategy/self-learning";

// Получаем singleton
const learner = getSelfLearner();

// Периодическое обучение
setInterval(async () => {
  const result = await learner.learn(strategy, candles, trades);
  
  if (result && result.improvement > 5) {
    console.log(`Self-learning improved strategy by ${result.improvement.toFixed(1)}%`);
    strategy.setParameters(result.newParams);
  }
}, 3600000); // Каждый час
```

---

## 6. Структура файлов

```
/src/lib/strategy/
├── self-learning.ts            # Self-Learner + Order Analyzer
├── alpha-factors.ts            # 12 Alpha Factors
├── neural-strategy.ts          # Neural Network стратегия
└── index.ts                    # Модульные экспорты
```

---

## 7. Лучшие практики

### 7.1 Настройка Self-Learning

| Сценарий | learningInterval | minTrades | improvementThreshold |
|----------|------------------|-----------|---------------------|
| Scalping | 15 мин | 50 | 3% |
| Day Trading | 1 час | 30 | 5% |
| Swing | 6 часов | 20 | 8% |
| Position | 24 часа | 15 | 10% |

### 7.2 Выбор Alpha Factors

| Рынок | Рекомендуемые факторы |
|-------|----------------------|
| Трендовый | price_vs_ema, ema_crossover, macd_signal |
| Боковик | rsi_mean_reversion, bollinger_position |
| Волатильный | atr_ratio, volatility_trend |
| Низкая ликвидность | volume_trend, obv_trend |

---

## 8. Ссылки

- [Abu Repository](https://github.com/bbfamily/abu) (может быть недоступен)
- [z-ai-sdk Documentation](/docs/frameworks/z-ai-sdk.md)
- [Zenbot Integration](/docs/modules/zenbot-integration.md)
