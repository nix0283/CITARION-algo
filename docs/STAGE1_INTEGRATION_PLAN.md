# ЭТАП 1: ПЛАН АВТОМАТИЗАЦИИ СВЯЗЕЙ И ИНТЕГРАЦИЙ

**Дата:** 2025-01-XX  
**Версия документа:** 1.0.0  
**Статус:** Готов к реализации

---

## 1.1. ЕДИНЫЙ ОРКЕСТРАЦИОННЫЙ СЛОЙ / БРОКЕР СООБЩЕНИЙ

### 1.1.1. Выбор технологии

| Технология | Плюсы | Минусы | Вердикт |
|------------|-------|--------|---------|
| **NATS JetStream** | Low latency, простота, persistence, clustering | Меньше ecosystem чем Kafka | ⭐ **РЕКОМЕНДУЕТСЯ** |
| Redis Streams | Уже есть в стеке, simple | Нет гарантии доставки, memory-bound | Альтернатива |
| Apache Kafka | Enterprise-grade, massive scale | Overkill для текущего масштаба | Избыточно |
| RabbitMQ | Гибкость routing | Медленнее NATS, сложнее | Не рекомендуется |

**Решение: NATS JetStream**

**Обоснование:**
- Microsecond latency (критично для HFT)
- Built-in persistence (не теряем сообщения)
- Simple deployment (один бинарник)
- Kubernetes-native
- Кластеризация из коробки
- 1M+ msg/sec на один сервер

### 1.1.2. Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NATS JETSTREAM CLUSTER                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     STREAMS (Persistent)                     │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │    │
│  │  │ SIGNALS  │ │ TRADES   │ │ POSITIONS│ │  EVENTS  │       │    │
│  │  │ Stream   │ │ Stream   │ │ Stream   │ │ Stream   │       │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     CONSUMERS                                │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │    │
│  │  │ Bot      │ │ Risk     │ │ Oracle   │ │ Logos    │       │    │
│  │  │ Consumers│ │ Monitor  │ │ Notifier │ │ Aggregator│      │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.1.3. Схема топиков (Subjects)

```yaml
# Сигналы
SIGNAL.GRID.BTCUSDT      # Сигнал от Grid бота для BTCUSDT
SIGNAL.DCA.ETHUSDT       # Сигнал от DCA бота
SIGNAL.BB.XRPUSDT        # Сигнал от BB бота
SIGNAL.ARGUS.*           # Все сигналы Argus (pump/dump detection)
SIGNAL.VISION.FORECAST   # Прогноз от Vision
SIGNAL.LOGOS.CONSENSUS   # Консенсус от Logos

# Торговля
TRADE.OPEN               # Открытие позиции
TRADE.CLOSE              # Закрытие позиции
TRADE.UPDATE             # Обновление позиции (TP/SL)
TRADE.ERROR              # Ошибка исполнения

# Позиции
POSITION.NEW             # Новая позиция
POSITION.UPDATE          # Изменение позиции
POSITION.CLOSE           # Закрытие позиции
POSITION.LIQUIDATION     # Ликвидация

# Системные события
BOT.START                # Запуск бота
BOT.STOP                 # Остановка бота
BOT.ERROR                # Ошибка бота
BOT.CONFIG_CHANGE        # Изменение конфигурации

# Риск-события
RISK.LIMIT_EXCEEDED      # Превышен лимит
RISK.DRAWDOWN_WARNING    # Предупреждение о просадке
RISK.KILL_SWITCH         # Экстренная остановка

# Рыночные данные
MARKET.TICKER.BTCUSDT    # Тикер
MARKET.ORDERBOOK.BTCUSDT # Стакан
MARKET.FUNDING.BTCUSDT   # Funding rate
```

### 1.1.4. Реализация

**Файл:** `src/lib/orchestration/nats-client.ts`

```typescript
// Структура NATS клиента
interface NatsConfig {
  servers: string[]
  user?: string
  pass?: string
  reconnect: boolean
  maxReconnect: number
  reconnectTimeWait: number
}

interface EventMessage {
  id: string
  timestamp: Date
  source: string
  type: EventType
  payload: any
  metadata?: Record<string, any>
}

class NatsOrchestrator {
  // Connection management
  async connect(): Promise<void>
  async disconnect(): Promise<void>
  isConnected(): boolean
  
  // Publishing
  async publish<T>(subject: string, message: T): Promise<void>
  async publishSignal(signal: Signal): Promise<void>
  async publishTrade(trade: Trade): Promise<void>
  async publishPosition(position: Position): Promise<void>
  
  // Subscribing
  subscribe<T>(subject: string, handler: (msg: T) => Promise<void>): Subscription
  subscribeToSignals(botId: string, handler: SignalHandler): Subscription
  subscribeToPositions(handler: PositionHandler): Subscription
  
  // Request-Reply pattern
  async request<T>(subject: string, payload: any, timeout?: number): Promise<T>
  
  // Health check
  healthCheck(): Promise<HealthStatus>
}
```

### 1.1.5. Обработка отказов

```typescript
// Reconnection strategy
const reconnectStrategy = {
  maxReconnectAttempts: 10,
  reconnectTimeWait: 1000,      // 1s initial
  reconnectBackoff: 'exponential',
  maxReconnectTimeWait: 30000,  // 30s max
}

// Message persistence
const streamConfig = {
  name: 'SIGNALS',
  subjects: ['SIGNAL.*'],
  retention: 'limits',
  maxAge: 7 * 24 * 60 * 60 * 1000000,  // 7 дней
  maxMsgs: 1000000,
  storage: 'file',
}

// Dead letter queue
const dlqConfig = {
  name: 'DEAD_LETTER_QUEUE',
  subjects: ['DLQ.*'],
  retention: 'limits',
  maxAge: 30 * 24 * 60 * 60 * 1000000,  // 30 дней
}
```

### 1.1.6. Оценка времени

| Этап | Время |
|------|-------|
| Установка и конфигурация NATS | 2 часа |
| Реализация NatsOrchestrator | 4 часа |
| Тестирование и документация | 2 часа |
| **Итого** | **8 часов** |

---

## 1.2. ИНТЕГРАЦИЯ ВСЕХ БОТОВ В ЕДИНИУ ШИНУ ДАННЫХ

### 1.2.1. Типы событий ботов

```typescript
// src/lib/orchestration/types.ts

enum BotEventType {
  // Lifecycle
  BOT_STARTED = 'BOT.STARTED',
  BOT_STOPPED = 'BOT.STOPPED',
  BOT_ERROR = 'BOT.ERROR',
  
  // Trading
  SIGNAL_GENERATED = 'SIGNAL.GENERATED',
  SIGNAL_FILTERED = 'SIGNAL.FILTERED',
  TRADE_OPENED = 'TRADE.OPENED',
  TRADE_CLOSED = 'TRADE.CLOSED',
  POSITION_UPDATED = 'POSITION.UPDATED',
  
  // Analytics
  METRICS_UPDATED = 'METRICS.UPDATED',
  FORECAST_GENERATED = 'FORECAST.GENERATED',
  
  // Risk
  RISK_WARNING = 'RISK.WARNING',
  RISK_LIMIT_HIT = 'RISK.LIMIT_HIT',
}
```

### 1.2.2. Интеграция по ботам

| Бот | Публикует | Подписывается |
|-----|-----------|---------------|
| **GRID** | SIGNAL.GRID.*, POSITION.* | MARKET.TICKER.*, RISK.* |
| **DCA** | SIGNAL.DCA.*, POSITION.* | MARKET.TICKER.*, SIGNAL.VISION.* |
| **BB** | SIGNAL.BB.*, POSITION.* | MARKET.TICKER.*, MARKET.ORDERBOOK.* |
| **Argus** | SIGNAL.ARGUS.*, ALERT.* | MARKET.ORDERBOOK.*, MARKET.TICKER.* |
| **Vision** | FORECAST.*, METRICS.* | MARKET.* |
| **Orion** | SIGNAL.ORION.*, POSITION.* | FORECAST.*, MARKET.* |
| **Logos** | CONSENSUS.*, ANALYTICS.* | SIGNAL.**, POSITION.**, TRADE.** |
| **Spectrum** | SIGNAL.SPECTRUM.* | MARKET.* (multi-symbol) |
| **Architect** | QUOTE.*, POSITION.* | MARKET.ORDERBOOK.* |
| **HFT/MFT/LFT** | SIGNAL.FREQ.*, TRADE.* | MARKET.** (all market data) |

### 1.2.3. Базовый класс BotClient

```typescript
// src/lib/orchestration/bot-client.ts

abstract class BotClient {
  protected orchestrator: NatsOrchestrator
  protected botId: string
  protected botType: string
  
  constructor(config: BotClientConfig) {
    this.orchestrator = config.orchestrator
    this.botId = config.botId
    this.botType = config.botType
  }
  
  // Publishing methods
  async publishSignal(signal: Signal): Promise<void> {
    await this.orchestrator.publish(
      `SIGNAL.${this.botType}.${signal.symbol}`,
      { ...signal, botId: this.botId, timestamp: new Date() }
    )
  }
  
  async publishTrade(trade: Trade): Promise<void> {
    await this.orchestrator.publish('TRADE.OPEN', trade)
  }
  
  async publishPosition(position: Position): Promise<void> {
    await this.orchestrator.publish('POSITION.UPDATE', position)
  }
  
  async publishError(error: BotError): Promise<void> {
    await this.orchestrator.publish('BOT.ERROR', {
      botId: this.botId,
      botType: this.botType,
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
    })
  }
  
  // Subscription methods
  subscribeToMarketData(symbol: string, handler: TickHandler): Subscription {
    return this.orchestrator.subscribe(`MARKET.TICKER.${symbol}`, handler)
  }
  
  subscribeToRisk(handler: RiskHandler): Subscription {
    return this.orchestrator.subscribe('RISK.*', handler)
  }
  
  subscribeToForecasts(handler: ForecastHandler): Subscription {
    return this.orchestrator.subscribe('FORECAST.*', handler)
  }
  
  // Lifecycle
  abstract onStart(): Promise<void>
  abstract onStop(): Promise<void>
  abstract onSignal(signal: Signal): Promise<void>
}
```

### 1.2.4. Адаптеры для существующих ботов

```typescript
// src/lib/orchestration/adapters/grid-bot-adapter.ts

class GridBotAdapter extends BotClient {
  private gridBot: GridBot
  
  constructor(gridBot: GridBot, orchestrator: NatsOrchestrator) {
    super({ botId: gridBot.id, botType: 'GRID', orchestrator })
    this.gridBot = gridBot
  }
  
  async onStart(): Promise<void> {
    // Подписываемся на тикеры
    this.subscribeToMarketData(this.gridBot.symbol, async (tick) => {
      await this.gridBot.processTick(tick)
    })
    
    // Подписываемся на риск-события
    this.subscribeToRisk(async (event) => {
      if (event.type === 'KILL_SWITCH') {
        await this.gridBot.stop()
      }
    })
  }
  
  // Перехватываем события GridBot
  onGridSignal(signal: GridSignal): void {
    this.publishSignal({
      symbol: signal.symbol,
      side: signal.side,
      price: signal.price,
      type: 'GRID',
      confidence: 1.0,
    })
  }
}
```

### 1.2.5. Оценка времени

| Этап | Время |
|------|-------|
| Типы и интерфейсы | 2 часа |
| Базовый BotClient | 3 часа |
| Адаптеры для 10 ботов | 8 часов |
| Тестирование | 4 часа |
| **Итого** | **17 часов** |

---

## 1.3. ГЛУБОКАЯ ИНТЕГРАЦИЯ ОРАКУЛА

### 1.3.1. Архитектура Оракула

```
┌─────────────────────────────────────────────────────────────────────┐
│                           ORACLE (Оракул)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │   INPUT LAYER   │  │  PROCESSING     │  │  OUTPUT LAYER   │     │
│  │                 │  │                 │  │                 │     │
│  │ • Chat commands │  │ • NLP Parser    │  │ • Telegram      │     │
│  │ • NATS events   │  │ • Command Router│  │ • Push          │     │
│  │ • Webhooks      │  │ • Aggregator    │  │ • Email         │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SUBSCRIPTIONS                             │    │
│  │  SIGNAL.**  │  TRADE.**  │  POSITION.**  │  RISK.**  │ BOT.** │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3.2. Команды Оракула

```typescript
// src/lib/oracle/command-parser.ts

interface OracleCommand {
  type: CommandType
  action: string
  params: Record<string, any>
  userId: string
  timestamp: Date
}

enum CommandType {
  // Торговля
  OPEN_LONG = 'OPEN_LONG',
  OPEN_SHORT = 'OPEN_SHORT',
  CLOSE_POSITION = 'CLOSE_POSITION',
  CLOSE_ALL = 'CLOSE_ALL',
  SET_TP = 'SET_TP',
  SET_SL = 'SET_SL',
  
  // Боты
  START_BOT = 'START_BOT',
  STOP_BOT = 'STOP_BOT',
  BOT_STATUS = 'BOT_STATUS',
  
  // Информация
  PORTFOLIO = 'PORTFOLIO',
  BALANCE = 'BALANCE',
  POSITIONS = 'POSITIONS',
  PNL = 'PNL',
  
  // Аналитика
  FORECAST = 'FORECAST',
  SIGNALS = 'SIGNALS',
  LOGOS_CONSENSUS = 'LOGOS_CONSENSUS',
}

// Parser examples
const COMMAND_PATTERNS = {
  // "buy BTC 0.1" -> OPEN_LONG BTC 0.1
  OPEN_LONG: /^(buy|long|покупай|лонг)\s+([A-Z]+)\s*([\d.]+)?$/i,
  
  // "sell ETH 0.5" -> OPEN_SHORT ETH 0.5
  OPEN_SHORT: /^(sell|short|продавай|шорт)\s+([A-Z]+)\s*([\d.]+)?$/i,
  
  // "stop BTC" -> CLOSE_POSITION BTC
  CLOSE_POSITION: /^(stop|close|закрой|стоп)\s+([A-Z]+)$/i,
  
  // "close all" -> CLOSE_ALL
  CLOSE_ALL: /^(close all|закрой всё|стоп всё)$/i,
  
  // "start grid BTC" -> START_BOT GRID BTC
  START_BOT: /^(start|запусти)\s+(grid|dca|bb|argus)\s*([A-Z]+)?$/i,
  
  // "stop bot grid" -> STOP_BOT GRID
  STOP_BOT: /^(stop|останови)\s+bot\s+(grid|dca|bb|argus)$/i,
  
  // "status" -> BOT_STATUS
  BOT_STATUS: /^(status|статус|состояние)$/i,
  
  // "balance" -> BALANCE
  BALANCE: /^(balance|баланс)$/i,
  
  // "positions" -> POSITIONS
  POSITIONS: /^(positions|позиции|позы)$/i,
  
  // "pnl" -> PNL
  PNL: /^(pnl|пнл|прибыль)$/i,
  
  // "forecast BTC" -> FORECAST BTC
  FORECAST: /^(forecast|прогноз)\s*([A-Z]+)?$/i,
  
  // "signals" -> SIGNALS
  SIGNALS: /^(signals|сигналы)$/i,
}
```

### 1.3.3. Обработчик команд

```typescript
// src/lib/oracle/command-handler.ts

class OracleCommandHandler {
  private orchestrator: NatsOrchestrator
  private exchangeClient: ExchangeClient
  
  async handleCommand(command: OracleCommand): Promise<OracleResponse> {
    switch (command.type) {
      case CommandType.OPEN_LONG:
        return this.handleOpenLong(command)
      case CommandType.OPEN_SHORT:
        return this.handleOpenShort(command)
      case CommandType.CLOSE_POSITION:
        return this.handleClosePosition(command)
      case CommandType.START_BOT:
        return this.handleStartBot(command)
      case CommandType.BOT_STATUS:
        return this.handleBotStatus(command)
      case CommandType.FORECAST:
        return this.handleForecast(command)
      default:
        return { success: false, message: 'Неизвестная команда' }
    }
  }
  
  private async handleOpenLong(command: OracleCommand): Promise<OracleResponse> {
    const symbol = command.params.symbol
    const size = command.params.size
    
    // Публикуем событие для исполнения
    await this.orchestrator.publish('TRADE.OPEN', {
      type: 'MARKET',
      side: 'LONG',
      symbol,
      size,
      userId: command.userId,
      source: 'ORACLE',
    })
    
    return {
      success: true,
      message: `Открываю LONG ${symbol} размером ${size}`,
    }
  }
}
```

### 1.3.4. Уведомления

```typescript
// src/lib/oracle/notification-service.ts

class OracleNotificationService {
  private orchestrator: NatsOrchestrator
  private telegram: TelegramBot
  
  constructor() {
    this.subscribeToAllEvents()
  }
  
  private subscribeToAllEvents(): void {
    // Подписываемся на все торговые события
    this.orchestrator.subscribe('TRADE.**', async (event) => {
      await this.sendNotification(event)
    })
    
    // Подписываемся на позиции
    this.orchestrator.subscribe('POSITION.**', async (event) => {
      await this.sendNotification(event)
    })
    
    // Подписываемся на риск-события
    this.orchestrator.subscribe('RISK.**', async (event) => {
      await this.sendAlert(event)
    })
    
    // Подписываемся на сигналы
    this.orchestrator.subscribe('SIGNAL.**', async (event) => {
      await this.sendSignalNotification(event)
    })
  }
  
  private async sendNotification(event: EventMessage): Promise<void> {
    const message = this.formatEventMessage(event)
    await this.telegram.sendMessage(message)
  }
  
  private formatEventMessage(event: EventMessage): string {
    const emoji = this.getEventEmoji(event.type)
    const time = new Date(event.timestamp).toLocaleString('ru-RU')
    
    return `${emoji} **${event.type}**
    
📊 ${event.payload.symbol || 'N/A'}
💰 ${event.payload.size || 'N/A'} @ ${event.payload.price || 'N/A'}
🕐 ${time}
📝 Source: ${event.source}`
  }
  
  private getEventEmoji(type: string): string {
    const emojis = {
      'TRADE.OPEN': '🟢',
      'TRADE.CLOSE': '🔴',
      'POSITION.UPDATE': '📝',
      'RISK.WARNING': '⚠️',
      'RISK.LIMIT_HIT': '🚨',
      'SIGNAL.GENERATED': '📡',
    }
    return emojis[type] || '📢'
  }
}
```

### 1.3.5. Оценка времени

| Этап | Время |
|------|-------|
| NLP парсер команд | 4 часа |
| Обработчик команд | 4 часа |
| Notification service | 3 часа |
| Интеграция с Telegram | 2 часа |
| Тестирование | 3 часа |
| **Итого** | **16 часов** |

---

## 1.4. ИНТЕГРАЦИЯ VISION

### 1.4.1. Публикация прогнозов

```typescript
// src/lib/vision-bot/publisher.ts

interface VisionForecast {
  symbol: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  timeframe: string
  targetPrice: number
  stopLoss: number
  takeProfit: number[]
  validUntil: Date
  indicators: {
    name: string
    value: number
    signal: 'bullish' | 'bearish' | 'neutral'
  }[]
}

class VisionPublisher {
  private orchestrator: NatsOrchestrator
  
  async publishForecast(forecast: VisionForecast): Promise<void> {
    await this.orchestrator.publish('FORECAST.VISION', {
      ...forecast,
      source: 'VISION',
      timestamp: new Date(),
    })
  }
  
  async publishMetrics(metrics: VisionMetrics): Promise<void> {
    await this.orchestrator.publish('METRICS.VISION', {
      ...metrics,
      timestamp: new Date(),
    })
  }
}
```

### 1.4.2. Подписчики прогнозов

```typescript
// Боты подписываются на прогнозы Vision
class DcaBotClient extends BotClient {
  onStart(): Promise<void> {
    // Подписываемся на прогнозы для нашего символа
    this.orchestrator.subscribe('FORECAST.VISION', async (forecast) => {
      if (forecast.symbol === this.symbol) {
        await this.adjustStrategy(forecast)
      }
    })
  }
  
  private async adjustStrategy(forecast: VisionForecast): Promise<void> {
    // Если Vision прогнозирует падение, приостанавливаем DCA
    if (forecast.direction === 'SHORT' && forecast.confidence > 0.7) {
      this.pauseEntry()
      this.logger.info('DCA paused due to bearish Vision forecast')
    }
    
    // Если прогнозирует рост, увеличиваем агрессивность
    if (forecast.direction === 'LONG' && forecast.confidence > 0.8) {
      this.increaseAggression()
    }
  }
}
```

### 1.4.3. Self-learning цикл

```typescript
// src/lib/vision-bot/feedback.ts

class VisionFeedbackLoop {
  private orchestrator: NatsOrchestrator
  private db: PrismaClient
  
  constructor() {
    // Подписываемся на закрытые позиции для анализа
    this.orchestrator.subscribe('POSITION.CLOSE', async (position) => {
      await this.analyzePrediction(position)
    })
  }
  
  private async analyzePrediction(position: ClosedPosition): Promise<void> {
    // Находим прогноз Vision для этой позиции
    const forecast = await this.db.visionForecast.findFirst({
      where: {
        symbol: position.symbol,
        createdAt: { lt: position.openedAt },
        validUntil: { gt: position.openedAt },
      },
    })
    
    if (!forecast) return
    
    // Оцениваем точность прогноза
    const wasCorrect = this.evaluateForecast(forecast, position)
    
    // Публикуем результат для ML обучения
    await this.orchestrator.publish('ML.FEEDBACK', {
      forecastId: forecast.id,
      positionId: position.id,
      wasCorrect,
      pnl: position.pnl,
      holdingTime: position.closedAt - position.openedAt,
    })
    
    // Обновляем статистику Vision
    await this.updateVisionStats(forecast, wasCorrect)
  }
}
```

### 1.4.4. Оценка времени

| Этап | Время |
|------|-------|
| Vision Publisher | 2 часа |
| Интеграция с ботами | 4 часа |
| Feedback loop | 3 часа |
| Тестирование | 2 часа |
| **Итого** | **11 часов** |

---

## 1.5. УНИФИКАЦИЯ СПОТОВОЙ И ФЬЮЧЕРСНОЙ ТОРГОВЛИ + RISK-СЛОЙ

### 1.5.1. Абстракция рынка

```typescript
// src/lib/trading/unified-market.ts

enum MarketType {
  SPOT = 'SPOT',
  FUTURES_USDT = 'FUTURES_USDT',
  FUTURES_COIN = 'FUTURES_COIN',
}

interface UnifiedPosition {
  id: string
  symbol: string
  marketType: MarketType
  side: 'LONG' | 'SHORT'
  size: number
  entryPrice: number
  currentPrice: number
  leverage: number
  margin: number
  unrealizedPnl: number
  liquidationPrice?: number
  tp: number[]
  sl?: number
  trailingSl?: { distance: number; activated: boolean }
}

interface UnifiedOrder {
  id: string
  symbol: string
  marketType: MarketType
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
  side: 'BUY' | 'SELL'
  size: number
  price?: number
  stopPrice?: number
  reduceOnly: boolean
  timeInForce: 'GTC' | 'IOC' | 'FOK'
}

class UnifiedTradingEngine {
  private exchangeClients: Map<string, ExchangeClient>
  private riskEngine: RiskEngine
  
  async openPosition(params: OpenPositionParams): Promise<UnifiedPosition> {
    // 1. Risk check
    const riskCheck = await this.riskEngine.validateOpenPosition(params)
    if (!riskCheck.allowed) {
      throw new RiskError(riskCheck.reason)
    }
    
    // 2. Select exchange
    const client = this.selectExchange(params.exchange)
    
    // 3. Execute based on market type
    let position: UnifiedPosition
    switch (params.marketType) {
      case MarketType.SPOT:
        position = await this.openSpotPosition(client, params)
        break
      case MarketType.FUTURES_USDT:
        position = await this.openFuturesPosition(client, params)
        break
    }
    
    // 4. Publish event
    await this.orchestrator.publish('POSITION.NEW', position)
    
    return position
  }
  
  async closePosition(positionId: string, reason: string): Promise<void> {
    const position = await this.getPosition(positionId)
    
    // Close based on market type
    const client = this.exchangeClients.get(position.exchange)
    await client.closePosition(position)
    
    await this.orchestrator.publish('POSITION.CLOSE', {
      ...position,
      closeReason: reason,
    })
  }
}
```

### 1.5.2. Risk Engine

```typescript
// src/lib/risk/risk-engine.ts

interface RiskConfig {
  // Position limits
  maxPositionSize: number        // Max size per position (USD)
  maxPositionCount: number       // Max open positions
  maxLeverage: number            // Max leverage
  
  // Portfolio limits
  maxPortfolioValue: number      // Max total exposure
  maxSingleAssetWeight: number   // Max % in single asset
  
  // Drawdown limits
  maxDrawdown: number            // Max drawdown %
  dailyLossLimit: number         // Daily loss limit
  
  // Risk per trade
  maxRiskPerTrade: number        // Max % risk per trade
  kellyFraction: number          // Kelly criterion fraction
}

class RiskEngine {
  private config: RiskConfig
  private portfolio: PortfolioState
  private orchestrator: NatsOrchestrator
  
  async validateOpenPosition(params: OpenPositionParams): Promise<RiskCheckResult> {
    const checks = await Promise.all([
      this.checkPositionSize(params),
      this.checkPositionCount(),
      this.checkLeverage(params),
      this.checkPortfolioExposure(params),
      this.checkDrawdown(),
      this.checkDailyLoss(),
      this.checkKellyCriterion(params),
    ])
    
    const failures = checks.filter(c => !c.passed)
    
    if (failures.length > 0) {
      return {
        allowed: false,
        reason: failures.map(f => f.reason).join('; '),
        warnings: checks.filter(c => c.warning).map(c => c.reason),
      }
    }
    
    return { allowed: true, warnings: [] }
  }
  
  private async checkDrawdown(): Promise<RiskCheck> {
    const drawdown = this.portfolio.currentDrawdown
    
    if (drawdown >= this.config.maxDrawdown) {
      // Trigger kill switch
      await this.orchestrator.publish('RISK.KILL_SWITCH', {
        reason: 'Max drawdown exceeded',
        drawdown,
        limit: this.config.maxDrawdown,
      })
      
      return { passed: false, reason: `Drawdown ${drawdown}% exceeds limit` }
    }
    
    if (drawdown >= this.config.maxDrawdown * 0.8) {
      await this.orchestrator.publish('RISK.DRAWDOWN_WARNING', {
        drawdown,
        limit: this.config.maxDrawdown,
      })
      return { passed: true, warning: true, reason: 'Approaching drawdown limit' }
    }
    
    return { passed: true }
  }
}
```

### 1.5.3. Kill Switch

```typescript
// src/lib/risk/kill-switch.ts

class KillSwitch {
  private orchestrator: NatsOrchestrator
  private tradingEngine: UnifiedTradingEngine
  private active: boolean = false
  
  constructor() {
    this.subscribeToTriggers()
  }
  
  private subscribeToTriggers(): void {
    // Подписываемся на события, которые могут триггерить kill switch
    this.orchestrator.subscribe('RISK.KILL_SWITCH', async (event) => {
      await this.activate(event.reason)
    })
    
    this.orchestrator.subscribe('BOT.ERROR', async (event) => {
      // Если критическая ошибка - активируем
      if (event.severity === 'CRITICAL') {
        await this.activate(`Critical bot error: ${event.message}`)
      }
    })
  }
  
  async activate(reason: string): Promise<void> {
    if (this.active) return
    this.active = true
    
    console.error(`🚨 KILL SWITCH ACTIVATED: ${reason}`)
    
    // 1. Остановить всех ботов
    await this.orchestrator.publish('SYSTEM.KILL_SWITCH', { reason })
    
    // 2. Закрыть все позиции (опционально)
    await this.tradingEngine.closeAllPositions('KILL_SWITCH')
    
    // 3. Отменить все ордера
    await this.tradingEngine.cancelAllOrders()
    
    // 4. Уведомить пользователя
    await this.orchestrator.publish('NOTIFICATION.ALERT', {
      level: 'CRITICAL',
      title: 'KILL SWITCH ACTIVATED',
      message: reason,
    })
  }
  
  async deactivate(): Promise<void> {
    this.active = false
    await this.orchestrator.publish('SYSTEM.KILL_SWITCH_DEACTIVATED', {})
  }
}
```

### 1.5.4. Оценка времени

| Этап | Время |
|------|-------|
| Unified Trading Engine | 6 часов |
| Risk Engine | 6 часов |
| Kill Switch | 3 часа |
| Интеграция | 4 часа |
| Тестирование | 4 часа |
| **Итого** | **23 часа** |

---

## 1.6. МУЛЬТИ-БИРЖЕВОЙ ШЛЮЗ

### 1.6.1. Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MULTI-EXCHANGE GATEWAY                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  UNIFIED API LAYER                           │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │    │
│  │  │ getTicker │ │ getOrder  │ │ getPos    │ │ placeOrder│   │    │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                │                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  RATE LIMITER LAYER                          │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  Per-exchange rate limiting + request queuing       │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                │                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  EXCHANGE ADAPTERS                           │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │    │
│  │  │ Binance │ │  Bybit  │ │   OKX   │ │ Bitget  │ │ BingX │ │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────┘ │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                │                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  WEBSOCKET MULTIPLEXER                       │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │  Single connection per exchange, multiple streams   │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.6.2. Unified Exchange Interface

```typescript
// src/lib/exchange/unified-interface.ts

interface UnifiedExchangeClient {
  // Identification
  name: string
  id: string
  
  // Market Data
  getTicker(symbol: string): Promise<Ticker>
  getOrderbook(symbol: string, depth?: number): Promise<Orderbook>
  getKlines(symbol: string, interval: string, limit?: number): Promise<Kline[]>
  getFundingRate(symbol: string): Promise<FundingRate>
  
  // Account
  getBalance(): Promise<Balance[]>
  getPositions(): Promise<Position[]>
  getOpenOrders(symbol?: string): Promise<Order[]>
  
  // Trading
  placeOrder(order: OrderParams): Promise<Order>
  cancelOrder(orderId: string, symbol: string): Promise<void>
  cancelAllOrders(symbol?: string): Promise<void>
  modifyOrder(orderId: string, params: ModifyParams): Promise<Order>
  
  // Leverage & Margin
  setLeverage(symbol: string, leverage: number): Promise<void>
  setMarginMode(symbol: string, mode: 'cross' | 'isolated'): Promise<void>
  
  // WebSocket
  subscribeTicker(symbol: string, callback: (ticker: Ticker) => void): void
  subscribeOrderbook(symbol: string, callback: (ob: Orderbook) => void): void
  subscribeKlines(symbol: string, interval: string, callback: (k: Kline) => void): void
  subscribeOrders(callback: (order: Order) => void): void
  subscribePositions(callback: (pos: Position) => void): void
  
  // Lifecycle
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
}
```

### 1.6.3. Multi-Exchange Router

```typescript
// src/lib/exchange/multi-exchange-router.ts

class MultiExchangeRouter {
  private exchanges: Map<string, UnifiedExchangeClient>
  private rateLimiters: Map<string, RateLimiter>
  private failover: FailoverConfig
  
  constructor(exchanges: UnifiedExchangeClient[], config: RouterConfig) {
    exchanges.forEach(e => {
      this.exchanges.set(e.id, e)
      this.rateLimiters.set(e.id, new RateLimiter(config.rateLimits[e.id]))
    })
    this.failover = config.failover
  }
  
  // Best price execution
  async placeOrderBestPrice(params: OrderParams): Promise<ExecutionResult> {
    // 1. Получаем цены со всех бирж
    const prices = await this.getAllTickers(params.symbol)
    
    // 2. Выбираем лучшую
    const best = params.side === 'BUY' 
      ? prices.sort((a, b) => a.bid - b.bid)[0]
      : prices.sort((a, b) => b.ask - a.ask)[0]
    
    // 3. Исполняем на лучшей бирже
    const client = this.exchanges.get(best.exchangeId)
    return client.placeOrder(params)
  }
  
  // Arbitrage execution
  async executeArbitrage(params: ArbitrageParams): Promise<ArbitrageResult> {
    const { buyExchange, sellExchange, symbol, size } = params
    
    const [buyClient, sellClient] = [
      this.exchanges.get(buyExchange),
      this.exchanges.get(sellExchange),
    ]
    
    // Параллельное исполнение
    const [buyOrder, sellOrder] = await Promise.all([
      buyClient.placeOrder({ symbol, side: 'BUY', size, type: 'MARKET' }),
      sellClient.placeOrder({ symbol, side: 'SELL', size, type: 'MARKET' }),
    ])
    
    return {
      buyOrder,
      sellOrder,
      spread: sellOrder.price - buyOrder.price,
      profit: (sellOrder.price - buyOrder.price) * size,
    }
  }
  
  // Failover
  async placeOrderWithFailover(params: OrderParams): Promise<Order> {
    const exchanges = this.failover.order[params.symbol] || [...this.exchanges.keys()]
    
    for (const exchangeId of exchanges) {
      try {
        const client = this.exchanges.get(exchangeId)
        if (!client.isConnected()) continue
        
        return await client.placeOrder(params)
      } catch (error) {
        console.warn(`Order failed on ${exchangeId}, trying next...`)
        continue
      }
    }
    
    throw new Error('All exchanges failed to execute order')
  }
}
```

### 1.6.4. Rate Limiter

```typescript
// src/lib/exchange/rate-limiter.ts

interface RateLimitConfig {
  requestsPerSecond: number
  requestsPerMinute: number
  ordersPerSecond: number
  ordersPerDay: number
  burstSize: number
}

// Binance: 1200 req/min, 50 orders/10s
// Bybit: 120 req/min, 100 orders/min
// OKX: 20 req/2s, 60 orders/2s
// Bitget: 15 req/s, 30 orders/s
// BingX: 10 req/s

const EXCHANGE_RATE_LIMITS: Record<string, RateLimitConfig> = {
  binance: { requestsPerSecond: 20, requestsPerMinute: 1200, ordersPerSecond: 5, ordersPerDay: 200000, burstSize: 50 },
  bybit: { requestsPerSecond: 2, requestsPerMinute: 120, ordersPerSecond: 2, ordersPerDay: 10000, burstSize: 20 },
  okx: { requestsPerSecond: 10, requestsPerMinute: 600, ordersPerSecond: 30, ordersPerDay: 50000, burstSize: 30 },
  bitget: { requestsPerSecond: 15, requestsPerMinute: 900, ordersPerSecond: 30, ordersPerDay: 50000, burstSize: 15 },
  bingx: { requestsPerSecond: 10, requestsPerMinute: 600, ordersPerSecond: 10, ordersPerDay: 10000, burstSize: 10 },
}

class ExchangeRateLimiter {
  private config: RateLimitConfig
  private tokenBucket: TokenBucket
  private orderBucket: TokenBucket
  
  constructor(config: RateLimitConfig) {
    this.tokenBucket = new TokenBucket(config.requestsPerSecond, config.burstSize)
    this.orderBucket = new TokenBucket(config.ordersPerSecond, config.burstSize)
  }
  
  async waitForToken(): Promise<void> {
    await this.tokenBucket.acquire()
  }
  
  async waitForOrderToken(): Promise<void> {
    await this.orderBucket.acquire()
  }
}
```

### 1.6.5. Оценка времени

| Этап | Время |
|------|-------|
| Unified Interface | 4 часа |
| Exchange Adapters (5) | 10 часов |
| Rate Limiter | 3 часа |
| Multi-Exchange Router | 4 часа |
| Failover logic | 3 часа |
| Тестирование | 4 часа |
| **Итого** | **28 часов** |

---

## 1.7. РЕДИЗАЙН UI (CORNIX-LIKE)

### 1.7.1. Анализ Cornix интерфейса

**Ключевые элементы Cornix:**
1. Боковая панель с навигацией
2. Карточки ботов с быстрыми действиями
3. Таблица позиций с real-time обновлением
4. Форма создания сигнала
5. График PnL
6. Уведомления в отдельной панели

### 1.7.2. Компромиссное решение

**Рекомендация:** Оставить shadcn/ui + Radix, но адаптировать стиль под Cornix/Binance

**Обоснование:**
- Миграция на Ant Design = переписать 92 компонента
- shadcn/ui уже настроен и работает
- Можно достичь Cornix-like вида через CSS
- AG Grid добавить для таблиц

### 1.7.3. Цветовая схема (Binance-like)

```css
/* src/app/globals.css */

:root {
  /* Background */
  --background: 14, 14, 18;           /* #0E0E12 */
  --card: 20, 20, 26;                 /* #14141A */
  --card-hover: 30, 30, 38;           /* #1E1E26 */
  
  /* Primary (Binance Yellow) */
  --primary: 240, 185, 11;            /* #F0B90B */
  --primary-hover: 212, 160, 10;      /* #D4A00A */
  --primary-foreground: 0, 0, 0;      /* #000000 */
  
  /* Semantic */
  --success: 14, 203, 129;            /* #0ECB81 */
  --error: 246, 70, 93;               /* #F6465D */
  --warning: 240, 185, 11;            /* #F0B90B */
  
  /* Text */
  --foreground: 234, 234, 234;        /* #EAEAEA */
  --muted: 112, 112, 126;             /* #70707E */
  
  /* Borders */
  --border: 46, 46, 56;               /* #2E2E38 */
}

/* Dark theme by default */
.dark {
  color-scheme: dark;
}
```

### 1.7.4. Структура страниц

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER: Logo | Account | Balance | Risk Status | Notifications     │
├─────────────────────────────────────────────────────────────────────┤
│ SIDEBAR │                     MAIN CONTENT                          │
│ 60px    │                                                          │
│ ┌─────┐ │  ┌─────────────────────────────────────────────────────┐ │
│ │ 📊  │ │  │                                                     │ │
│ │Dash │ │  │                                                     │ │
│ ├─────┤ │  │              CONTENT AREA                           │ │
│ │ 🤖  │ │  │                                                     │ │
│ │Bots │ │  │                                                     │ │
│ ├─────┤ │  │                                                     │ │
│ │ 📈  │ │  │                                                     │ │
│ │Trade│ │  │                                                     │ │
│ ├─────┤ │  │                                                     │ │
│ │ 📉  │ │  │                                                     │ │
│ │Pos  │ │  │                                                     │ │
│ ├─────┤ │  │                                                     │ │
│ │ ⚙️  │ │  └─────────────────────────────────────────────────────┘ │
│ │Conf │ │                                                          │
│ └─────┘ │                                                          │
├─────────┴──────────────────────────────────────────────────────────┤
│ FOOTER: v1.0.0 | Status: Connected | Last Update: 12:34:56         │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.7.5. Компоненты для доработки

| Компонент | Изменения |
|-----------|-----------|
| **Sidebar** | Сократить до 60px, иконки + tooltips |
| **Dashboard** | Карточки ботов в стиле Cornix |
| **Positions Table** | AG Grid с real-time |
| **Trading Form** | Компактная форма как у Cornix |
| **Charts** | Тёмная тема TradingView |
| **Notifications** | Правая выдвижная панель |
| **Footer** | Добавить версию и статус |

### 1.7.6. Версия платформы

```typescript
// src/lib/version.ts

export const VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
  build: process.env.BUILD_NUMBER || 'dev',
}

export const VERSION_STRING = `v${VERSION.major}.${VERSION.minor}.${VERSION.patch}-${VERSION.build}`

// src/components/layout/footer.tsx
export function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 h-8 bg-card border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground">
      <span>CITARION {VERSION_STRING}</span>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          Connected
        </span>
        <span>Last update: {new Date().toLocaleTimeString()}</span>
      </div>
    </footer>
  )
}
```

### 1.7.7. Оценка времени

| Этап | Время |
|------|-------|
| Цветовая схема | 2 часа |
| Sidebar редизайн | 4 часа |
| Dashboard карточки | 6 часов |
| AG Grid интеграция | 4 часа |
| Footer + версия | 1 час |
| Тестирование | 3 часа |
| **Итого** | **20 часов** |

---

## 1.8. ДОБАВЛЕНИЕ НЕДОСТАЮЩИХ КОМПОНЕНТОВ

### 1.8.1. Alert System

```typescript
// src/lib/alerts/alert-system.ts

interface Alert {
  id: string
  type: AlertType
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  title: string
  message: string
  source: string
  timestamp: Date
  read: boolean
  actions?: AlertAction[]
}

enum AlertType {
  TRADE_OPENED = 'TRADE_OPENED',
  TRADE_CLOSED = 'TRADE_CLOSED',
  POSITION_LIQUIDATED = 'POSITION_LIQUIDATED',
  DRAWDOWN_WARNING = 'DRAWDOWN_WARNING',
  RISK_LIMIT = 'RISK_LIMIT',
  BOT_ERROR = 'BOT_ERROR',
  SIGNAL_GENERATED = 'SIGNAL_GENERATED',
  EXCHANGE_DISCONNECT = 'EXCHANGE_DISCONNECT',
}

class AlertSystem {
  private orchestrator: NatsOrchestrator
  private channels: AlertChannel[]
  
  constructor() {
    this.subscribeToEvents()
  }
  
  private subscribeToEvents(): void {
    this.orchestrator.subscribe('**', async (event) => {
      const alert = this.eventToAlert(event)
      if (alert) {
        await this.dispatch(alert)
      }
    })
  }
  
  async dispatch(alert: Alert): Promise<void> {
    // Store
    await this.store(alert)
    
    // Push to channels based on severity
    switch (alert.severity) {
      case 'CRITICAL':
        await Promise.all([
          this.sendTelegram(alert),
          this.sendPush(alert),
          this.sendEmail(alert),
        ])
        break
      case 'WARNING':
        await Promise.all([
          this.sendTelegram(alert),
          this.storeInApp(alert),
        ])
        break
      case 'INFO':
        await this.storeInApp(alert)
        break
    }
  }
}
```

### 1.8.2. Position Reconciler

```typescript
// src/lib/position/reconciler.ts

class PositionReconciler {
  private exchanges: MultiExchangeRouter
  private db: PrismaClient
  private orchestrator: NatsOrchestrator
  
  async reconcile(): Promise<ReconciliationResult> {
    // 1. Получаем позиции с бирж
    const exchangePositions = await this.getAllExchangePositions()
    
    // 2. Получаем позиции из БД
    const dbPositions = await this.db.position.findMany({ where: { status: 'OPEN' } })
    
    // 3. Сравниваем
    const { missing, extra, mismatched } = this.compare(exchangePositions, dbPositions)
    
    // 4. Синхронизируем
    for (const pos of missing) {
      await this.orchestrator.publish('RECONCILE.POSITION_MISSING', pos)
    }
    
    for (const pos of extra) {
      await this.orchestrator.publish('RECONCILE.POSITION_EXTRA', pos)
    }
    
    return { missing, extra, mismatched }
  }
  
  async runScheduled(): Promise<void> {
    // Каждые 5 минут
    setInterval(() => this.reconcile(), 5 * 60 * 1000)
  }
}
```

### 1.8.3. Audit Trail

```typescript
// src/lib/audit/audit-logger.ts

interface AuditLog {
  id: string
  timestamp: Date
  userId: string
  action: string
  resource: string
  resourceId?: string
  details: Record<string, any>
  ipAddress?: string
  userAgent?: string
  result: 'SUCCESS' | 'FAILURE'
  errorMessage?: string
}

class AuditLogger {
  private db: PrismaClient
  
  async log(params: AuditLogParams): Promise<void> {
    await this.db.auditLog.create({
      data: {
        timestamp: new Date(),
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: params.details,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        result: params.result,
        errorMessage: params.errorMessage,
      },
    })
  }
  
  // SOC2 compliance queries
  async getFailedLogins(hours: number): Promise<AuditLog[]> {
    return this.db.auditLog.findMany({
      where: {
        action: 'LOGIN',
        result: 'FAILURE',
        timestamp: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) },
      },
    })
  }
}
```

### 1.8.4. Оценка времени

| Компонент | Время |
|-----------|-------|
| Alert System | 6 часов |
| Position Reconciler | 4 часа |
| Audit Trail | 4 часа |
| Тестирование | 4 часа |
| **Итого** | **18 часов** |

---

## СВОДНАЯ ОЦЕНКА ВРЕМЕНИ

| Раздел | Время | Приоритет |
|--------|-------|-----------|
| 1.1 Оркестрационный слой (NATS) | 8 часов | P0 |
| 1.2 Интеграция ботов | 17 часов | P0 |
| 1.3 Интеграция Оракула | 16 часов | P1 |
| 1.4 Интеграция Vision | 11 часов | P2 |
| 1.5 Унификация + Risk | 23 часа | P1 |
| 1.6 Мульти-биржевой шлюз | 28 часов | P1 |
| 1.7 Редизайн UI | 20 часов | P1 |
| 1.8 Недостающие компоненты | 18 часов | P2 |
| **ИТОГО** | **141 час** | - |

**Календарный план (при 8ч/день): ~18 рабочих дней**

---

## ПОСЛЕДОВАТЕЛЬНОСТЬ РЕАЛИЗАЦИИ

```
Week 1:
├── 1.1 NATS JetStream setup
├── 1.2 Базовый BotClient + адаптеры
└── 1.3 Оракул (базовая интеграция)

Week 2:
├── 1.5 Unified Trading Engine
├── 1.5 Risk Engine
└── 1.5 Kill Switch

Week 3:
├── 1.6 Multi-Exchange Gateway
├── 1.7 UI Редизайн (части 1-3)
└── 1.4 Vision интеграция

Week 4:
├── 1.7 UI Редизайн (завершение)
├── 1.8 Alert System
├── 1.8 Position Reconciler
└── 1.8 Audit Trail
```

---

*План Этапа 1 завершён. Жду подтверждения для перехода к реализации.*
