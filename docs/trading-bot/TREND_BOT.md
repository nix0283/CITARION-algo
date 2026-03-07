# Trend Bot - Production Documentation

## Обзор

Trend Bot — это production-ready трендовый торговый бот для криптовалютных рынков с поддержкой мульти-биржевого режима, paper trading и профессиональным риск-менеджментом.

## Ключевые решения архитектуры

### Почему один бот, а не отдельные Long/Short?

| Подход | Обоснование |
|--------|-------------|
| **Единый бот** | Рынок симметричен. Тренд вверх → Long, тренд вниз → Short. Один алгоритм, одна кодовая база, консолидированный P&L |
| **Раздельные боты** | Anti-pattern: неполная капитализация, дублирование логики, рассинхронизация позиций |

---

## Стратегия: EMA + SuperTrend

### Логика входа

```
1. EMA Alignment Filter
   - Bullish: EMA200 < EMA50 < EMA20
   - Bearish: EMA200 > EMA50 > EMA20

2. SuperTrend Confirmation
   - Direction flip = trend change
   - Price above/below SuperTrend line = confirmation

3. Volume Confirmation
   - Volume > 1.2x average volume
```

### Параметры по умолчанию

| Параметр | Значение | Обоснование |
|----------|----------|-------------|
| EMA Fast | 20 | Краткосрочный тренд |
| EMA Mid | 50 | Среднесрочный тренд |
| EMA Slow | 200 | Долгосрочный тренд |
| SuperTrend Period | 10 | ATR период |
| SuperTrend Multiplier | 3.0 | Стандартный множитель |

### Логика выхода

1. **Stop Loss** = SuperTrend line ± 0.5% buffer
2. **Take Profit** = 2R, 3R, 5R (частичное закрытие 50/30/20%)
3. **Trailing Stop** = активация при 1.5% прибыли, отступ 1% от пика
4. **Trend Reversal** = SuperTrend flip

---

## Risk Management

### Параметры

| Параметр | Значение | Обоснование |
|----------|----------|-------------|
| Risk per trade | 0.5% equity | Позволяет 20+ убыточных сделок подряд |
| Max positions | 5 | Диверсификация без over-exposure |
| Max correlation | 0.6 | Отклонять при корреляции > 60% |
| Max drawdown | 10% | После 10% — halt trading |
| Kelly fraction | 0.25 | Quarter-Kelly для production |

### Position Sizing Formula

```
Position Size = min(
    RiskBased: Risk% × Equity / |Entry - StopLoss|,
    Kelly: Kelly% × 0.25 × Equity,
    MaxPosition: 20% × Equity
)
```

---

## Paper Trading

### Особенности симуляции

| Функция | Описание |
|---------|----------|
| Bid/Ask spread | 0.01-0.03% симуляция order book |
| Slippage | 0.05% для market orders, 0.1% для stops |
| Latency | 50-200ms задержка выполнения |
| Fees | 0.02% maker, 0.05% taker |

---

## API Endpoints

```bash
# Запуск бота
POST /api/trend-bot
{ "action": "start", "mode": "PAPER" }

# Остановка бота
POST /api/trend-bot
{ "action": "stop" }

# Получить статус
GET /api/trend-bot

# Приостановить торговлю
POST /api/trend-bot
{ "action": "halt", "reason": "Manual halt" }

# Возобновить торговлю
POST /api/trend-bot
{ "action": "resume" }
```

---

## Структура файлов

```
/src/lib/trading-bot/
├── types.ts           # Все типы и интерфейсы
├── strategy.ts        # EMA + SuperTrend стратегия
├── risk-manager.ts    # Risk management + Kelly
├── paper-engine.ts    # Paper trading симуляция
├── index.ts           # Main TrendBot controller
└── main.ts            # Module exports
```

---

## Мониторинг

### Метрики для отслеживания

| Метрика | Описание |
|---------|----------|
| Win Rate | % прибыльных сделок |
| Sharpe Ratio | Риск-adjusted доходность |
| Max Drawdown | Максимальная просадка |
| Daily P&L | Дневной профит |

### Алерты

- **Drawdown Warning**: При достижении 8% DD
- **Bot Halted**: При 10% DD
- **Daily Loss Limit**: При дневном убытке 5%

---

## Заключение

Эта архитектура следует профессиональным стандартам хедж-фондов:

1. ✅ Единый бот для обоих направлений
2. ✅ Kelly Criterion position sizing
3. ✅ Correlation filter
4. ✅ Drawdown protection
5. ✅ Paper trading validation
6. ✅ Hedging mode support
7. ✅ 24/7 operation ready

**Код production-ready с обработкой ошибок, логированием и валидацией.**
