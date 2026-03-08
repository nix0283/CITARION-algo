# ORION Bot - Trend-Following Hunter

## Название и философия

**ORION** назван в честь охотника из греческой мифологии, который преследует цели по небу. Как созвездие Орион неизменно появляется на небосводе, так и Orion Bot неустанно преследует тренды на криптовалютных рынках.

### Архитектурная пара

```
┌─────────────────────────────────────────────┐
│                  ORION                       │
│         Trend-Following Hunter              │
│   EMA + Supertrend | Hedging Mode           │
│   Multi-Exchange | Paper Validation         │
└─────────────────────────────────────────────┘
         ↓ signals confirmation ↓
┌─────────────────────────────────────────────┐
│                  ARGUS                       │
│         Market Watchman                     │
│   Orderbook | Whale Tracking                │
│   Circuit Breaker | Risk Sentinels          │
└─────────────────────────────────────────────┘
```

**Argus** (Страж) — наблюдает за рынком, детектирует аномалии.  
**Orion** (Охотник) — преследует тренды, исполняет сделки.

---

## Стратегия: EMA + Supertrend

### Принцип работы

Orion использует комбинацию двух проверенных индикаторов для идентификации трендов:

1. **EMA Alignment** — выстраивание экспоненциальных скользящих средних
2. **Supertrend** — динамический трендовый индикатор на основе ATR

### EMA Alignment

```
Bullish Alignment:
  EMA20 > EMA50 > EMA200
  
Bearish Alignment:
  EMA20 < EMA50 < EMA200
```

| EMA | Период | Назначение |
|-----|--------|------------|
| Fast | 20 | Краткосрочный импульс |
| Medium | 50 | Среднесрочный тренд |
| Slow | 200 | Долгосрочный тренд |

**Alignment Score** рассчитывается от -1 (идеальный bearish) до +1 (идеальный bullish):
```typescript
let score = 0;
if (ema20 > ema50) score += 0.33;
if (ema50 > ema200) score += 0.33;
if (ema20 > ema200) score += 0.34;
```

### Supertrend

Supertrend использует ATR (Average True Range) для определения волатильности и построения динамических уровней поддержки/сопротивления.

**Формула:**
```
Upper Band = HL2 + (Multiplier × ATR)
Lower Band = HL2 - (Multiplier × ATR)

Где HL2 = (High + Low) / 2
```

**Параметры по умолчанию:**
| Параметр | Значение | Обоснование |
|----------|----------|-------------|
| Period | 10 | Баланс между чувствительностью и шумом |
| Multiplier | 3.0 | Классическое значение для трендовых рынков |

**Сигналы:**
- Direction = 1 (uptrend): цена выше Supertrend line
- Direction = -1 (downtrend): цена ниже Supertrend line
- Flip направления = потенциальная смена тренда

### Генерация сигнала

```typescript
interface TrendSignal {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  strength: number;      // 0-1, сила сигнала
  confidence: number;    // 0-1, уверенность
  regime: 'trending' | 'ranging' | 'volatile' | 'transitioning';
  components: {
    emaAligned: boolean;
    supertrendConfirmed: boolean;
    volumeConfirmed: boolean;
    momentumConfirmed: boolean;
  };
}
```

**Условия для LONG сигнала:**
1. EMA alignment score > 0.7 (bullish)
2. Supertrend direction = 1 (uptrend)
3. Volume > 1.2× average volume (опционально)
4. RSI < 70 (не перекуплен, опционально)

**Условия для SHORT сигнала:**
1. EMA alignment score < -0.7 (bearish)
2. Supertrend direction = -1 (downtrend)
3. Volume > 1.2× average volume (опционально)
4. RSI > 30 (не перепродан, опционально)

**Signal Strength (0-1):**
```typescript
strength = 
  Math.abs(emaAlignment) * 0.3 +     // EMA вклад
  (1 - supertrendDistance) * 0.3 +    // Близость к ST
  volumeRatio * 0.2 +                  // Объём
  (momentumConfirmed ? 0.2 : 0);       // Моментум
```

---

## Risk Management

### Kelly Criterion

Orion использует Kelly Criterion для оптимального определения размера позиции.

**Формула Kelly:**
```
Kelly% = W - (1 - W) / R

Где:
  W = Win Rate (доля прибыльных сделок)
  R = Win/Loss Ratio (средняя прибыль / средний убыток)
```

**Fractional Kelly:**
Для production используется Quarter Kelly (1/4 от оптимального):
```typescript
quarterKelly = kellyOptimal * 0.25;
```

**Обоснование:** Полный Kelly даёт максимальный рост, но с огромной волатильностью. Quarter Kelly сохраняет 90% роста при снижении волатильности на 50%.

### Конфигурация риска

```typescript
const defaultRiskConfig = {
  riskPerTrade: {
    mode: 'fractional_kelly',
    kellyFraction: 0.25,      // Quarter Kelly
    maxRiskPct: 2,            // Максимум 2% на сделку
    minRiskPct: 0.25,         // Минимум 0.25% на сделку
  },
  limits: {
    maxPositions: 5,          // Максимум позиций
    maxPositionsPerSymbol: 2, // Максимум на символ
    maxPositionsPerExchange: 3,
    maxCorrelation: 0.6,      // Максимум корреляция
    maxDrawdown: 10,          // Halt при 10% DD
    dailyLossLimit: 3,        // Halt при 3% дневного убытка
  },
  leverage: {
    default: 3,
    max: 5,
    volatileRegimeMultiplier: 0.5,  // Снижение в volatile
  },
  stopLoss: {
    atrMultiplier: 2.0,       // Stop = 2 × ATR
    minPct: 0.5,
    maxPct: 5,
  },
};
```

### Position Sizing Algorithm

```typescript
function calculatePositionSize(signal, accountBalance, positions) {
  // 1. Определить базовый риск
  let riskPct = getKellyRisk();  // или fixed %
  
  // 2. Адаптировать под regime
  if (signal.regime === 'volatile') riskPct *= 0.5;
  if (signal.regime === 'ranging') riskPct *= 0.5;
  
  // 3. Проверить корреляцию
  if (hasCorrelatedPositions(signal, positions)) {
    riskPct *= 0.8;  // Снизить для коррелированных
  }
  
  // 4. Рассчитать размер
  const stopDistance = signal.atr * atrMultiplier;
  const positionSize = (accountBalance * riskPct) / stopDistance;
  
  return positionSize;
}
```

### Take Profit Levels

```typescript
takeProfit: {
  levels: {
    tp1: { riskRewardRatio: 1.5, sizePct: 30 },  // Консервативный
    tp2: { riskRewardRatio: 2.5, sizePct: 40 },  // Умеренный
    tp3: { riskRewardRatio: 4.0, sizePct: 30 },  // Агрессивный
  },
}
```

**Пример:**
- Entry: $50,000
- Stop Loss: $49,000 (1% риск)
- TP1: $51,500 (+1.5%), закрыть 30% позиции
- TP2: $52,500 (+2.5%), закрыть 40% позиции
- TP3: $54,000 (+4%), закрыть 30% позиции

---

## Hedging Mode

### State Machine

```
┌─────────────┐
│  UNHEDGED   │ ← Начальное состояние
└──────┬──────┘
       │ Открыта противоположная позиция
       ▼
┌─────────────┐
│  PARTIAL    │ ← Частичный хедж
└──────┬──────┘
       │ Полное покрытие
       ▼
┌─────────────┐
│   FULL      │ ← Полный хедж (net ~ 0)
└─────────────┘
```

### Hedge Ratio

```typescript
hedgeRatio = 1 - (|longValue - shortValue| / (longValue + shortValue))

// hedgeRatio = 0: полностью unhedged
// hedgeRatio = 1: полностью hedged (long ≈ short)
```

### Автоматические рекомендации

```typescript
interface HedgeDecision {
  action: 'OPEN_HEDGE' | 'CLOSE_HEDGE' | 'ADJUST_HEDGE' | 'NO_ACTION';
  reason: string;
  side: 'LONG' | 'SHORT' | null;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
}
```

**Сценарии:**
1. **OPEN_HEDGE**: Убыток > 5% на unhedged позиции → открыть hedge
2. **ADJUST_HEDGE**: Сильный сигнал против позиции → увеличить hedge
3. **CLOSE_HEDGE**: Позиция прибыльна, hedge мешает → закрыть hedge
4. **FULL hedge с дисбалансом**: Закрыть убыточную сторону

---

## Paper Trading Validation

### Обязательная валидация

Orion требует обязательную валидацию на paper trading перед переходом в live режим.

### Критерии валидации

| Критерий | Минимум | Обоснование |
|----------|---------|-------------|
| Duration | 7 дней | Достаточно для разных рыночных условий |
| Trades | 20 | Статистически значимая выборка |
| Win Rate | 40% | Ниже — стратегия не работает |
| Max Drawdown | 10% | Риск-менеджмент работает |
| Profit Factor | 1.0 | Минимум безубыточность |
| Sharpe Ratio | 0 | Положительная доходность |
| Consecutive Losses | 10 | Защита от серии убытков |

### Pipeline Stages

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   INIT       │ → │   RUNNING    │ → │   VALIDATED  │
└──────────────┘    └──────────────┘    └──────────────┘
                           ↓
                    ┌──────────────┐
                    │   FAILED     │
                    └──────────────┘
```

### ValidationResult

```typescript
interface ValidationResult {
  status: 'INIT' | 'RUNNING' | 'VALIDATED' | 'FAILED';
  progress: {
    duration: number;        // Прошло времени
    durationPercent: number; // % от минимума
    trades: number;
    tradesPercent: number;
  };
  metrics: {
    winRate: number;
    drawdown: number;
    profitFactor: number;
    sharpeRatio: number;
    consecutiveLosses: number;
    avgRiskReward: number;
  };
  checks: {
    [key: string]: {
      passed: boolean;
      value: number;
      threshold: number;
    };
  };
}
```

---

## Multi-Exchange Support

### Exchange Adapter Interface

```typescript
interface ExchangeAdapter {
  name: string;
  isPaperTrading: boolean;

  // Connection
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Market Data
  getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  getTicker(symbol: string): Promise<Ticker>;

  // Trading
  placeOrder(symbol: string, side: 'BUY' | 'SELL', type: 'MARKET' | 'LIMIT', 
             size: number, price?: number): Promise<ExchangeOrder>;
  placeStopLoss(symbol: string, side: 'BUY' | 'SELL', stopPrice: number, 
                size: number): Promise<ExchangeOrder>;
  placeTakeProfit(symbol: string, side: 'BUY' | 'SELL', price: number, 
                  size: number): Promise<ExchangeOrder>;
  cancelOrder(orderId: string, symbol: string): Promise<boolean>;

  // Positions
  getPositions(): Promise<ExchangePosition[]>;
  closePosition(symbol: string, side: PositionSide): Promise<ExchangeOrder>;

  // Account
  getBalances(): Promise<ExchangeBalance[]>;
  setLeverage(symbol: string, leverage: number): Promise<boolean>;
  setHedgingMode(enabled: boolean): Promise<boolean>;
}
```

### Поддерживаемые биржи

| Биржа | Status | Особенности |
|-------|--------|-------------|
| Binance | ✅ Full | Spot, Futures, Inverse |
| Bybit | ✅ Full | V5 API, Unified margin |
| OKX | ✅ Full | V5 API, Demo trading |
| Bitget | ✅ Full | V2 API |
| BingX | ✅ Full | V2 API |
| HyperLiquid | ✅ Full | DEX |
| BloFin | ✅ Full | Copy trading |

### Exchange Manager

```typescript
class ExchangeManager {
  registerAdapter(adapter: ExchangeAdapter): void;
  getAdapter(exchange: string): ExchangeAdapter | null;
  connectAll(): Promise<{ [exchange: string]: boolean }>;
  getAggregatedBalances(): Promise<ExchangeBalance[]>;
  getAllPositions(): Promise<ExchangePosition[]>;
  executeOrder(exchange: string, symbol: string, side: 'BUY' | 'SELL',
               type: 'MARKET' | 'LIMIT', size: number): Promise<ExchangeOrder>;
}
```

---

## API Reference

### Endpoints

```bash
# Получить статус бота
GET /api/trend-bot

# Запустить бота
POST /api/trend-bot
{ "action": "start" }

# Остановить бота
POST /api/trend-bot
{ "action": "stop" }

# Приостановить торговлю
POST /api/trend-bot
{ "action": "halt", "reason": "Manual halt" }

# Возобновить торговлю
POST /api/trend-bot
{ "action": "resume" }

# Перейти в live режим
POST /api/trend-bot
{ "action": "goLive" }

# Закрыть позицию
POST /api/trend-bot
{ "action": "closePosition", "positionId": "pos-xxx" }

# Закрыть все позиции
POST /api/trend-bot
{ "action": "closeAll" }

# Проверить валидацию
POST /api/trend-bot
{ "action": "validate" }

# Сбросить бота
POST /api/trend-bot
{ "action": "reset" }
```

### Response Format

```json
{
  "success": true,
  "bot": {
    "name": "Orion",
    "version": "1.0.0",
    "status": "RUNNING",
    "mode": "PAPER",
    "instanceId": "orion-1234567890",
    "uptime": 3600000,
    "positions": [...],
    "riskMetrics": {...},
    "lifetimeStats": {...}
  },
  "validation": {
    "status": "RUNNING",
    "progress": {...},
    "canGoLive": false
  }
}
```

---

## File Structure

```
/src/lib/orion-bot/
├── types.ts              # Все TypeScript типы
│   ├── TrendSignal
│   ├── OrionPosition
│   ├── RiskConfig
│   ├── OrionBotConfig
│   └── ...
│
├── signal-engine.ts      # EMA + Supertrend движок
│   ├── calculateEMA()
│   ├── calculateATR()
│   ├── calculateSupertrend()
│   ├── calculateRSI()
│   ├── calculateADX()
│   └── SignalEngine class
│
├── risk-manager.ts       # Risk management
│   ├── calculateKelly()
│   ├── RiskManager class
│   ├── calculatePositionSize()
│   ├── calculateStopLoss()
│   └── calculateTakeProfits()
│
├── hedging-engine.ts     # Hedging state machine
│   ├── HedgingEngine class
│   ├── HedgeDecisionEngine class
│   └── calculateHedgeRatio()
│
├── exchange-adapter.ts   # Multi-exchange support
│   ├── ExchangeAdapter interface
│   ├── BaseExchangeAdapter class
│   ├── ExchangeManager class
│   └── PaperTradingAdapter class
│
├── validation-pipeline.ts # Paper trading validation
│   ├── ValidationPipeline class
│   ├── ValidationManager class
│   └── defaultValidationCriteria
│
├── engine.ts             # Main Orion engine
│   └── OrionEngine class
│
└── index.ts              # Public API exports
```

---

## Configuration

### Full Configuration Example

```typescript
const orionConfig: OrionBotConfig = {
  name: "Orion",
  version: "1.0.0",
  mode: "PAPER",
  paperValidationRequired: true,
  minPaperDuration: 7 * 24 * 60 * 60 * 1000, // 7 дней

  exchanges: [
    {
      exchange: "binance",
      symbols: ["BTCUSDT", "ETHUSDT"],
      credentialRef: "binance-main",
      enabled: true,
    },
    {
      exchange: "bybit",
      symbols: ["BTCUSDT", "SOLUSDT"],
      credentialRef: "bybit-main",
      enabled: true,
    },
  ],

  strategy: {
    ema: { fast: 20, medium: 50, slow: 200 },
    supertrend: { period: 10, multiplier: 3.0 },
    filters: {
      minStrength: 0.5,
      minConfidence: 0.6,
      requireEmaAlignment: true,
      requireSupertrendConfirm: true,
      volume: { enabled: true, minRatio: 1.2 },
      momentum: { enabled: true, rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70 },
    },
    regime: {
      adxTrendThreshold: 25,
      atrVolatilePercentile: 80,
    },
    timeframes: {
      primary: "1h",
      higher: "4h",
      lower: "15m",
    },
  },

  risk: {
    riskPerTrade: {
      mode: "fractional_kelly",
      kellyFraction: 0.25,
      maxRiskPct: 2,
      minRiskPct: 0.25,
    },
    limits: {
      maxPositions: 5,
      maxPositionsPerSymbol: 2,
      maxPositionsPerExchange: 3,
      maxCorrelation: 0.6,
      maxDrawdown: 10,
      dailyLossLimit: 3,
    },
    leverage: { default: 3, max: 5, volatileRegimeMultiplier: 0.5 },
    stopLoss: { atrMultiplier: 2.0, minPct: 0.5, maxPct: 5 },
    takeProfit: {
      levels: {
        tp1: { riskRewardRatio: 1.5, sizePct: 30 },
        tp2: { riskRewardRatio: 2.5, sizePct: 40 },
        tp3: { riskRewardRatio: 4.0, sizePct: 30 },
      },
    },
  },

  hedging: {
    enabled: true,
    allowOppositePositions: true,
    autoHedgeCorrelation: 0.7,
  },

  notifications: {
    telegram: false,
    email: false,
    onSignal: true,
    onTrade: true,
    onRiskEvent: true,
  },

  logLevel: "INFO",
};
```

---

## Events

### Event Types

```typescript
type OrionEventType =
  | 'SIGNAL_GENERATED'     // Новый сигнал создан
  | 'SIGNAL_FILTERED'      // Сигнал отфильтрован
  | 'POSITION_OPENING'     // Открытие позиции
  | 'POSITION_OPENED'      // Позиция открыта
  | 'POSITION_UPDATED'     // Позиция обновлена
  | 'POSITION_CLOSING'     // Закрытие позиции
  | 'POSITION_CLOSED'      // Позиция закрыта
  | 'STOP_LOSS_HIT'        // Сработал SL
  | 'TAKE_PROFIT_HIT'      // Сработал TP
  | 'TRAILING_STOP_ACTIVATED'  // Активирован trailing
  | 'RISK_LIMIT_WARNING'   // Предупреждение о рисках
  | 'RISK_LIMIT_BREACH'    // Нарушение лимитов
  | 'DRAWDOWN_WARNING'     // Предупреждение о просадке
  | 'DRAWDOWN_HALT'        // Остановка из-за просадки
  | 'ERROR'                // Ошибка
  | 'RECOVERY';            // Восстановление
```

### Event Subscription

```typescript
const orion = new OrionEngine(config);

orion.on('POSITION_OPENED', (event) => {
  console.log('New position:', event.data);
  // Send notification...
});

orion.on('DRAWDOWN_WARNING', (event) => {
  console.warn('Drawdown warning:', event.data);
  // Alert user...
});
```

---

## Best Practices

### 1. Paper Trading First

Всегда запускайте бота в paper режиме минимум на 7 дней перед live торговлей. Это позволяет:
- Проверить корректность сигналов
- Оценить реальную win rate
- Протестировать risk management
- Выявить ошибки в коде

### 2. Conservative Kelly

Используйте Quarter Kelly (0.25) или даже Eighth Kelly (0.125) для консервативного подхода. Полный Kelly слишком агрессивен.

### 3. Regime Awareness

Бот автоматически снижает риск в volatile и ranging рынках. Не отключайте эту функцию.

### 4. Hedging Mode

Включайте hedging mode для возможности открытия противоположных позиций на том же символе.

### 5. Regular Monitoring

Отслеживайте ключевые метрики:
- Daily P&L
- Win Rate (rolling 100 trades)
- Max Drawdown
- Sharpe Ratio

### 6. Gradual Scaling

Начинайте с минимального капитала и увеличивайте только после подтверждения прибыльности.

---

## Troubleshooting

### Bot не открывает позиции

**Причины:**
1. Signal strength < minStrength (0.5)
2. Confidence < minConfidence (0.6)
3. EMA не выстроены (requireEmaAlignment = true)
4. Max positions достигнут
5. Drawdown > maxDrawdown

**Решение:** Проверьте логи и metrics.

### Kelly слишком агрессивен

**Симптом:** Position sizes слишком большие.

**Решение:** Уменьшите kellyFraction до 0.125 (eighth Kelly).

### Много ложных сигналов

**Причины:**
1. Ranging market (нет тренда)
2. Слишком низкие фильтры

**Решение:** 
- Увеличьте minStrength до 0.6-0.7
- Включите ADX фильтр (adxTrendThreshold = 25)
- Используйте higher timeframe для подтверждения

### Paper trading не проходит валидацию

**Причины:**
1. Win rate < 40%
2. Drawdown > 10%
3. Profit factor < 1.0

**Решение:** 
- Проанализируйте убыточные сделки
- Настройте параметры стратегии
- Проверьте risk management

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01 | Initial release |

---

## Related Documentation

- [Trading System Architecture](/docs/TRADING_SYSTEM_ARCHITECTURE.md)
- [Exchange API Documentation](/docs/exchanges/README.md)
- [Strategy Framework](/src/lib/strategy/README.md)
- [Risk Management](/src/lib/strategy/risk-manager.ts)
- [Argus Bot](/docs/bots/ARGUS_BOT.md) - Market Watchman
