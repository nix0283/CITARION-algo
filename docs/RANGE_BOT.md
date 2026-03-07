# Range Bot Documentation

## Overview

Range Bot - торговый бот для бокового/диапазонного рынка (sideways/ranging markets).

### Особенности:
- Автоматическое определение границ диапазона (support/resistance)
- Торговля внутри диапазона
- Обнаружение пробоев (breakout detection)
- Подтверждение осцилляторами (RSI, Stochastic)
- Динамическая подстройка диапазона

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                        Range Bot Engine                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Range     │  │   Signal    │  │    Position Manager     │  │
│  │  Detection  │  │  Generator  │  │                         │  │
│  │             │  │             │  │ • Open/Close positions  │  │
│  │ • Support   │  │ • Buy/Sell  │  │ • Stop Loss monitoring  │  │
│  │ • Resistance│  │ • Breakout  │  │ • Take Profit tracking  │  │
│  │ • Touches   │  │ • Close     │  │ • PnL calculation       │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                       │                │
│         └────────────────┴───────────────────────┘                │
│                          │                                       │
│                  ┌───────┴───────┐                               │
│                  │  Oscillators   │                               │
│                  │               │                               │
│                  │ • RSI         │                               │
│                  │ • Stochastic  │                               │
│                  └───────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

## Конфигурация

```typescript
interface RangeConfig {
  symbol: string;
  
  // Range detection
  lookbackPeriod: number;       // Период для анализа (default: 50)
  minTouches: number;           // Минимум касаний для уровня (default: 2)
  touchThreshold: number;       // % отклонения для касания (default: 0.3)
  maxRangeWidth: number;        // Макс. ширина диапазона % (default: 5)
  minRangeWidth: number;        // Мин. ширина диапазона % (default: 0.5)
  
  // Entry/Exit
  entryFromSupport: number;     // % над поддержкой для покупки (default: 0.2)
  entryFromResistance: number;  // % под сопротивлением для продажи (default: 0.2)
  takeProfitPercent: number;    // TP от entry (default: 1.5)
  stopLossPercent: number;      // SL от entry (default: 1.0)
  
  // Oscillator confirmation
  useRSI: boolean;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  
  useStochastic: boolean;
  stochK: number;
  stochD: number;
  stochOversold: number;
  stochOverbought: number;
  
  // Breakout settings
  breakoutConfirmation: number; // % за уровнем для подтверждения (default: 0.5)
  breakoutRetest: boolean;      // Ждать ретеста после пробоя
  
  // Position sizing
  positionSize: number;         // USDT за сделку (default: 100)
  maxPositions: number;         // Макс. позиций (default: 3)
  
  // Risk management
  maxDailyLoss: number;         // Макс. дневной убыток % (default: 3)
  maxDrawdown: number;          // Макс. просадка % (default: 10)
}
```

## Использование

### Базовый пример

```typescript
import { RangeBot, DEFAULT_RANGE_CONFIG } from '@/lib/range-bot'

// Создаём бота с настройками по умолчанию
const bot = new RangeBot({
  symbol: 'BTCUSDT',
  positionSize: 100,
  maxPositions: 3
})

// Обновляем цену (вызывать на каждом тике)
bot.update(price, high, low, volume)

// Генерируем сигнал
const signal = bot.generateSignal(price)

if (signal) {
  console.log(`Signal: ${signal.type}`)
  console.log(`Reason: ${signal.reason}`)
  console.log(`Confidence: ${signal.confidence}`)
  
  // Исполняем сигнал
  if (signal.type === 'BUY' || signal.type === 'SELL') {
    const position = bot.executeSignal(signal)
    console.log(`Position opened: ${position?.id}`)
  }
}

// Получаем состояние
const state = bot.getState()
console.log('Range:', state.rangeState)
console.log('Positions:', state.positions)
console.log('Metrics:', state.metrics)
```

### Интеграция с WebSocket

```typescript
import { RangeBot } from '@/lib/range-bot'

const bot = new RangeBot({ symbol: 'BTCUSDT' })

// WebSocket обработка
ws.onmessage = (event) => {
  const tick = JSON.parse(event.data)
  
  bot.update(
    tick.price,
    tick.high,
    tick.low,
    tick.volume
  )
  
  const signal = bot.generateSignal(tick.price)
  
  if (signal) {
    handleSignal(signal)
  }
}
```

## Типы сигналов

| Тип | Описание | Условие |
|-----|----------|----------|
| `BUY` | Покупка | Цена около поддержки + RSI перепродан |
| `SELL` | Продажа | Цена около сопротивления + RSI перекуплен |
| `CLOSE_LONG` | Закрыть long | Цена у сопротивления |
| `CLOSE_SHORT` | Закрыть short | Цена у поддержки |
| `BREAKOUT_UP` | Пробой вверх | Цена выше сопротивления + confirmation |
| `BREAKOUT_DOWN` | Пробой вниз | Цена ниже поддержки + confirmation |

## Метрики

```typescript
interface RangeMetrics {
  totalTrades: number      // Всего сделок
  winTrades: number        // Прибыльных
  lossTrades: number       // Убыточных
  winRate: number          // Win rate (0-1)
  totalPnL: number         // Общий PnL
  avgPnL: number           // Средний PnL
  avgWin: number           // Средняя прибыль
  avgLoss: number          // Средний убыток
  profitFactor: number     // Profit factor
  largestWin: number       // Макс. прибыль
  largestLoss: number      // Макс. убыток
  currentStreak: number    // Текущая серия
  maxStreak: number        // Макс. серия
  avgHoldingTime: number   // Ср. время удержания
}
```

## Определение диапазона

Алгоритм определения поддержки и сопротивления:

1. **Поиск локальных экстремумов**
   - Local High (resistance) - максимум среди соседних баров
   - Local Low (support) - минимум среди соседних баров

2. **Группировка уровней**
   - Уровни в пределах `touchThreshold` объединяются
   - Количество касаний записывается

3. **Валидация диапазона**
   - Проверка `minTouches` для каждого уровня
   - Проверка ширины диапазона (`minRangeWidth` - `maxRangeWidth`)

## Осцилляторы

### RSI (Relative Strength Index)

```typescript
// Используется для подтверждения сигналов
// При покупке: RSI должен быть <= rsiOversold (30)
// При продаже: RSI должен быть >= rsiOverbought (70)

bot.update(price, high, low, volume)
const signal = bot.generateSignal(price)

if (signal?.oscillatorConfirm) {
  // RSI подтверждает сигнал
}
```

### Stochastic

```typescript
// Дополнительное подтверждение
// K линия должна быть в зоне перекупленности/перепроданности

const config = {
  useStochastic: true,
  stochK: 14,
  stochD: 3,
  stochOversold: 20,
  stochOverbought: 80
}
```

## API Endpoint

### GET /api/bots/range

Получить состояние Range Bot.

### POST /api/bots/range

Управление Range Bot.

```json
{
  "action": "start" | "stop" | "update_config",
  "config": {
    // RangeConfig
  }
}
```

## UI компонент

`<RangeBotManager />` - компонент управления Range Bot.

### Возможности UI:
- Запуск/остановка бота
- Настройка параметров
- Визуализация диапазона
- История сигналов
- Метрики производительности

## Стратегии торговли

### Консервативная

```typescript
const conservativeConfig = {
  minTouches: 3,            // Больше касаний для подтверждения
  touchThreshold: 0.2,      // Меньше отклонение
  maxRangeWidth: 3,         // Уже диапазон
  takeProfitPercent: 1.0,   // Меньше TP
  stopLossPercent: 0.5,     // Меньше SL
  useRSI: true,
  useStochastic: true       // Оба осциллятора
}
```

### Агрессивная

```typescript
const aggressiveConfig = {
  minTouches: 2,
  touchThreshold: 0.5,
  maxRangeWidth: 7,
  takeProfitPercent: 2.5,
  stopLossPercent: 1.5,
  useRSI: true,
  useStochastic: false,
  breakoutRetest: false     // Не ждать ретест
}
```

## Риск-менеджмент

1. **Stop Loss** - автоматическое закрытие при достижении SL
2. **Take Profit** - автоматическое закрытие при достижении TP
3. **Max Daily Loss** - остановка торговли при достижении лимита
4. **Max Drawdown** - остановка при критической просадке
5. **Max Positions** - ограничение одновременных позиций

## Мониторинг

```typescript
const state = bot.getState()

// Текущий диапазон
console.log('Range High:', state.rangeState?.rangeHigh)
console.log('Range Low:', state.rangeState?.rangeLow)
console.log('In Range:', state.rangeState?.inRange)

// Позиции
state.positions.forEach(p => {
  console.log(`${p.type}: ${p.pnlPercent.toFixed(2)}%`)
})

// Метрики
console.log('Win Rate:', (state.metrics.winRate * 100).toFixed(1) + '%')
console.log('Total PnL:', state.metrics.totalPnL.toFixed(2))
```

## Best Practices

1. **Выбор рынка** - Range Bot работает лучше на боковом рынке
2. **Подтверждение** - используйте RSI/Stochastic для фильтрации
3. **Пробои** - учитывайте смену режима (range → trend)
4. **Период** - анализируйте lookbackPeriod для точного определения диапазона
5. **Риск** - не превышайте maxDailyLoss и maxDrawdown
