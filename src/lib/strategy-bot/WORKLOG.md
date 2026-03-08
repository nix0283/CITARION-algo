# Strategy Bot & Bot Manager Worklog

## Overview

Создана система для автоматической торговли на основе Strategy Framework + Tactics с интеграцией существующих ботов (Grid Bot, DCA Bot, BBot) в Backtesting и Paper Trading.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED BOT MANAGER                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │Strategy  │ │ Grid Bot │ │ DCA Bot  │ │  BBot    │        │
│  │   Bot    │ │ Simulator│ │ Simulator│ │ Simulator│        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                           │                                  │
│              ┌────────────┴────────────┐                    │
│              │                         │                     │
│       ┌──────▼──────┐          ┌───────▼──────┐             │
│       │ Backtesting │          │ Paper Trading│             │
│       │   Engine    │          │    Engine    │             │
│       └─────────────┘          └──────────────┘             │
│                           │                                  │
│                   ┌───────▼───────┐                         │
│                   │   Hyperopt    │                         │
│                   │    Engine     │                         │
│                   └───────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Strategy Bot (`/src/lib/strategy-bot/`)

**Files:**
- `types.ts` - Типы и интерфейсы для ботов
- `engine.ts` - Основной класс StrategyBot и адаптеры
- `adapters.ts` - Симуляторы для Grid Bot, DCA Bot, BBot
- `index.ts` - Экспорт модуля

**Key Features:**
- Три режима работы: BACKTEST, PAPER, LIVE
- Интеграция с Strategy Framework и Tactics
- Автоматическое управление позициями
- SL/TP/Trailing Stop поддержка
- Event-driven архитектура

### 2. Bot Adapters (`/src/lib/strategy-bot/adapters.ts`)

**Grid Bot Simulator:**
- Симуляция сеточной торговли
- Поддержка LONG/SHORT/NEUTRAL направлений
- Arithmetic и Geometric сетки
- Полные метрики и equity curve

**DCA Bot Simulator:**
- Dollar Cost Averaging симуляция
- Множественные уровни входа
- Multiplier для размера позиции
- TP/SL для всей позиции

**BBot Simulator:**
- Простой бот с SL/TP/Trailing
- Поддержка LONG/SHORT
- Trailing stop с активацией

### 3. Unified Bot Manager (`/src/lib/bot-manager/`)

**Features:**
- Создание ботов любого типа
- Запуск Backtest для любого бота
- Запуск Paper Trading для любого бота
- Централизованное управление статусами
- Stop All функционал

## Workflow

```
1. CREATE BOT
   ├── Strategy Bot: Strategy + Tactics → Bot Config
   ├── Grid Bot: Upper/Lower Price, Grid Count → Bot Config
   ├── DCA Bot: Levels, Multiplier → Bot Config
   └── BBot: SL/TP/Trailing → Bot Config

2. BACKTEST
   ├── Load historical candles
   ├── Run simulation
   ├── Calculate metrics
   └── Generate equity curve

3. OPTIMIZE (Hyperopt)
   ├── Define parameters to optimize
   ├── Run multiple backtests
   └── Find best parameters

4. PAPER TRADING
   ├── Create virtual account
   ├── Start with real prices
   ├── Monitor performance
   └── Validate strategy

5. LIVE TRADING
   ├── Connect to exchange
   ├── Execute real trades
   └── Monitor & manage
```

## Integration Points

### Strategy Framework Integration
- `StrategyBot` использует `IStrategy` для генерации сигналов
- `TacticsSet` применяется для управления позициями
- `TacticsExecutor` для исполнения тактик

### Backtesting Integration
- `BacktestAdapter` для Strategy Bot
- Симуляторы для Grid/DCA/BBot
- Unified metrics format

### Paper Trading Integration
- `PaperAdapter` для Strategy Bot
- `PaperTradingEngine` для виртуальных счетов
- Real-time price updates

### Hyperopt Integration
- Optimization for Strategy parameters
- Optimization for Tactics parameters
- Grid/DCA/BBot parameter optimization

## API Endpoints (TODO)

```
POST /api/bots/create
  - Create bot of any type

POST /api/bots/[id]/backtest
  - Run backtest for bot

POST /api/bots/[id]/paper
  - Start paper trading

POST /api/bots/[id]/live
  - Start live trading

GET /api/bots/status
  - Get all bots status

POST /api/bots/stop-all
  - Stop all bots
```

## Database Models (TODO)

```prisma
model StrategyBot {
  id          String   @id
  userId      String
  name        String
  status      String
  mode        String
  strategyId  String
  tacticsSet  String   // JSON
  symbol      String
  timeframe   String
  // ... risk management settings
}

model BotBacktest {
  id          String   @id
  botId       String
  botType     String
  result      String   // JSON
  metrics     String   // JSON
  equityCurve String   // JSON
  createdAt   DateTime @default(now())
}
```

## Next Steps

1. [ ] Add API endpoints for bot management
2. [ ] Add database models for Strategy Bot
3. [ ] Implement Live Trading adapter
4. [ ] Add UI components for bot management
5. [ ] Integrate with existing bot workers
6. [ ] Add Hyperopt for Grid/DCA/BBot parameters
