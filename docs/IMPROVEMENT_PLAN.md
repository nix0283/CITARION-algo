# 🚀 ПЛАН ПРИВЕДЕНИЯ ПРОЕКТА К PRODUCTION-READY

**Версия:** 1.0.0  
**Дата:** 2025-01-XX  
**Цель:** Привести все компоненты в статус "Отлично" (🟢)

---

## 📊 ОБЗОР ЗАДАЧ

| Категория | Компонентов | Приоритет | Оценка времени |
|-----------|-------------|-----------|----------------|
| Частично реализованные боты | 6 | P0 | 40ч |
| Заглушки ботов | 6 | P1 | 50ч |
| ML/AI компоненты | 3 | P1 | 35ч |
| Архитектурные проблемы | 4 | P0 | 30ч |
| UI интеграция | 5 | P2 | 20ч |
| **ИТОГО** | **24** | | **~175ч (22 дня)** |

---

## 🎯 ЭТАП 1: КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ (P0) — 70ч

### 1.1 Grid Bot — Полная реализация [10ч]

**Текущее состояние:**
- ✅ Adaptive Grid Engine
- ✅ Trailing Grid
- ✅ Profit Tracker
- ❌ Нет подключения к бирже
- ❌ Нет Paper Trading интеграции

**Задачи:**

```
📁 Структура файлов:
src/lib/grid-bot/
├── index.ts              — Экспорты
├── adaptive-grid.ts      — ✅ Готово
├── trailing-grid.ts      — ✅ Готово
├── profit-tracker.ts     — ✅ Готово
├── grid-bot-engine.ts    — 🆕 Главный движок
├── exchange-adapter.ts   — 🆕 Адаптер для бирж
├── paper-adapter.ts      — 🆕 Paper trading
└── types.ts              — 🆕 Типы
```

**Шаги:**

| # | Задача | Время | Файл |
|---|--------|-------|------|
| 1.1.1 | Создать GridBotEngine класс | 2ч | grid-bot-engine.ts |
| 1.1.2 | Реализовать GridBotExchangeAdapter | 2ч | exchange-adapter.ts |
| 1.1.3 | Реализовать GridBotPaperAdapter | 1.5ч | paper-adapter.ts |
| 1.1.4 | Добавить WebSocket price feed | 1.5ч | exchange-adapter.ts |
| 1.1.5 | Интегрировать с API routes | 1ч | src/app/api/bots/grid/ |
| 1.1.6 | Добавить lifecycle management | 1ч | grid-bot-engine.ts |
| 1.1.7 | Тестирование | 1ч | — |

**Код реализации:**

```typescript
// src/lib/grid-bot/grid-bot-engine.ts

import { BaseExchangeClient } from '../exchange/base-client';
import { AdaptiveGrid } from './adaptive-grid';
import { TrailingGrid } from './trailing-grid';
import { ProfitTracker } from './profit-tracker';
import { EventEmitter } from 'events';

export interface GridBotConfig {
  id: string;
  symbol: string;
  exchange: string;
  accountType: 'DEMO' | 'REAL';
  
  // Grid settings
  gridLevels: number;
  upperPrice: number;
  lowerPrice: number;
  gridType: 'arithmetic' | 'geometric';
  
  // Position settings
  positionSize: number;
  positionSizeType: 'fixed' | 'percent';
  leverage: number;
  
  // Advanced
  trailingEnabled: boolean;
  trailingActivationPercent: number;
  trailingDistancePercent: number;
  
  // Risk
  maxDrawdown: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface GridLevel {
  price: number;
  buyOrder?: string;  // Order ID
  sellOrder?: string;
  filled: boolean;
  quantity: number;
}

export interface GridBotState {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED';
  gridLevels: GridLevel[];
  totalInvested: number;
  currentValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
}

export class GridBotEngine extends EventEmitter {
  private config: GridBotConfig;
  private state: GridBotState;
  private exchangeClient: BaseExchangeClient;
  private adaptiveGrid: AdaptiveGrid;
  private trailingGrid: TrailingGrid | null = null;
  private profitTracker: ProfitTracker;
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private wsConnection: WebSocket | null = null;

  constructor(
    config: GridBotConfig,
    exchangeClient: BaseExchangeClient
  ) {
    super();
    this.config = config;
    this.exchangeClient = exchangeClient;
    this.adaptiveGrid = new AdaptiveGrid(config);
    this.profitTracker = new ProfitTracker();
    
    if (config.trailingEnabled) {
      this.trailingGrid = new TrailingGrid({
        activationPercent: config.trailingActivationPercent,
        distancePercent: config.trailingDistancePercent,
      });
    }
    
    this.state = this.createInitialState();
  }

  /**
   * Запуск бота
   */
  async start(): Promise<{ success: boolean; error?: string }> {
    try {
      this.state.status = 'RUNNING';
      
      // Получаем текущую цену
      const ticker = await this.exchangeClient.getTicker(this.config.symbol);
      const currentPrice = ticker.last;
      
      // Инициализируем сетку
      this.state.gridLevels = this.adaptiveGrid.createLevels(
        currentPrice,
        this.config.upperPrice,
        this.config.lowerPrice,
        this.config.gridLevels
      );
      
      // Выставляем ордера
      await this.placeGridOrders();
      
      // Запускаем WebSocket для цен
      await this.startPriceFeed();
      
      this.emit('started', { config: this.config, state: this.state });
      
      return { success: true };
    } catch (error) {
      this.state.status = 'STOPPED';
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Остановка бота
   */
  async stop(cancelOrders: boolean = true): Promise<void> {
    this.state.status = 'STOPPED';
    
    // Останавливаем WebSocket
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    
    // Отменяем ордера
    if (cancelOrders) {
      await this.cancelAllOrders();
    }
    
    this.emit('stopped', { state: this.state });
  }

  /**
   * Пауза бота
   */
  async pause(): Promise<void> {
    this.state.status = 'PAUSED';
    await this.cancelAllOrders();
    this.emit('paused', { state: this.state });
  }

  /**
   * Возобновление работы
   */
  async resume(): Promise<void> {
    this.state.status = 'RUNNING';
    await this.placeGridOrders();
    this.emit('resumed', { state: this.state });
  }

  /**
   * Выставить ордера сетки
   */
  private async placeGridOrders(): Promise<void> {
    const ticker = await this.exchangeClient.getTicker(this.config.symbol);
    const currentPrice = ticker.last;
    
    for (const level of this.state.gridLevels) {
      // Пропускаем уровни около текущей цены
      if (Math.abs(level.price - currentPrice) / currentPrice < 0.001) {
        continue;
      }
      
      const isBuyLevel = level.price < currentPrice;
      
      const orderResult = await this.exchangeClient.createOrder({
        symbol: this.config.symbol,
        side: isBuyLevel ? 'buy' : 'sell',
        type: 'limit',
        quantity: this.calculateOrderQuantity(level),
        price: level.price,
      });
      
      if (orderResult.success && orderResult.order) {
        if (isBuyLevel) {
          level.buyOrder = orderResult.order.id;
        } else {
          level.sellOrder = orderResult.order.id;
        }
      }
    }
  }

  /**
   * Отменить все ордера
   */
  private async cancelAllOrders(): Promise<void> {
    for (const level of this.state.gridLevels) {
      if (level.buyOrder) {
        try {
          await this.exchangeClient.cancelOrder({
            symbol: this.config.symbol,
            orderId: level.buyOrder,
          });
        } catch {}
      }
      if (level.sellOrder) {
        try {
          await this.exchangeClient.cancelOrder({
            symbol: this.config.symbol,
            orderId: level.sellOrder,
          });
        } catch {}
      }
    }
  }

  /**
   * Запустить WebSocket для цен
   */
  private async startPriceFeed(): Promise<void> {
    // Используем price-service через Socket.IO
    const io = require('socket.io-client');
    const socket = io('/?XTransformPort=3002');
    
    socket.on('price_update', (data: any) => {
      if (data.symbol === this.config.symbol) {
        this.handlePriceUpdate(data.price);
      }
    });
    
    socket.on('connect', () => {
      socket.emit('subscribe_exchange', {
        exchange: this.config.exchange,
        type: 'futures',
      });
    });
  }

  /**
   * Обработка обновления цены
   */
  private async handlePriceUpdate(price: number): Promise<void> {
    if (this.state.status !== 'RUNNING') return;
    
    // Проверяем заполненные ордера
    await this.checkFilledOrders();
    
    // Обновляем trailing grid
    if (this.trailingGrid) {
      const trailingUpdate = this.trailingGrid.update(price, this.state);
      if (trailingUpdate.newStopLoss) {
        // Переставляем стоп-лосс
      }
    }
    
    // Обновляем PnL
    this.updatePnL(price);
    
    // Проверяем риск-лимиты
    this.checkRiskLimits();
    
    this.emit('price_update', { price, state: this.state });
  }

  /**
   * Проверить заполненные ордера
   */
  private async checkFilledOrders(): Promise<void> {
    const openOrders = await this.exchangeClient.getOpenOrders(this.config.symbol);
    const openOrderIds = new Set(openOrders.map(o => o.id));
    
    for (const level of this.state.gridLevels) {
      // Проверяем buy order
      if (level.buyOrder && !openOrderIds.has(level.buyOrder)) {
        // Ордер исполнен - выставляем sell на уровень выше
        level.filled = true;
        this.state.totalTrades++;
        
        // Найти ближайший уровень выше для sell
        const sellLevel = this.findNextUpperLevel(level.price);
        if (sellLevel) {
          await this.placeSellOrder(sellLevel, level.quantity);
        }
      }
      
      // Аналогично для sell order
      if (level.sellOrder && !openOrderIds.has(level.sellOrder)) {
        level.filled = true;
        this.state.totalTrades++;
        
        const buyLevel = this.findNextLowerLevel(level.price);
        if (buyLevel) {
          await this.placeBuyOrder(buyLevel, level.quantity);
        }
      }
    }
  }

  // ... вспомогательные методы ...
  
  private calculateOrderQuantity(level: GridLevel): number {
    if (this.config.positionSizeType === 'fixed') {
      return this.config.positionSize;
    }
    // percent of balance
    return 0; // TODO: implement
  }
  
  private updatePnL(currentPrice: number): void {
    this.state.unrealizedPnl = this.calculateUnrealizedPnl(currentPrice);
    this.profitTracker.update(this.state);
  }
  
  private checkRiskLimits(): void {
    const drawdownPercent = this.calculateDrawdown();
    if (drawdownPercent >= this.config.maxDrawdown) {
      this.emit('max_drawdown_reached', { drawdown: drawdownPercent });
      this.stop(true);
    }
  }
  
  private createInitialState(): GridBotState {
    return {
      status: 'IDLE',
      gridLevels: [],
      totalInvested: 0,
      currentValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
    };
  }
  
  private findNextUpperLevel(price: number): GridLevel | null {
    const upper = this.state.gridLevels
      .filter(l => l.price > price)
      .sort((a, b) => a.price - b.price);
    return upper[0] || null;
  }
  
  private findNextLowerLevel(price: number): GridLevel | null {
    const lower = this.state.gridLevels
      .filter(l => l.price < price)
      .sort((a, b) => b.price - a.price);
    return lower[0] || null;
  }
  
  private async placeSellOrder(level: GridLevel, quantity: number): Promise<void> {
    // Implementation
  }
  
  private async placeBuyOrder(level: GridLevel, quantity: number): Promise<void> {
    // Implementation
  }
  
  private calculateUnrealizedPnl(currentPrice: number): number {
    // Implementation
    return 0;
  }
  
  private calculateDrawdown(): number {
    // Implementation
    return 0;
  }
}
```

---

### 1.2 DCA Bot — Полная реализация [8ч]

**Текущее состояние:**
- ✅ Safety Orders
- ✅ TP-per-level
- ✅ Risk Manager
- ❌ Нет подключения к бирже
- ❌ Нет интеграции с Paper Trading

**Задачи:**

| # | Задача | Время | Файл |
|---|--------|-------|------|
| 1.2.1 | Создать DCABotEngine класс | 2ч | dca-bot-engine.ts |
| 1.2.2 | Реализовать DCABotExchangeAdapter | 2ч | exchange-adapter.ts |
| 1.2.3 | Реализовать averaging down logic | 1.5ч | averaging.ts |
| 1.2.4 | Добавить price feed integration | 1ч | exchange-adapter.ts |
| 1.2.5 | Интегрировать с API routes | 1ч | src/app/api/bots/dca/ |
| 1.2.6 | Тестирование | 0.5ч | — |

**Структура:**

```
src/lib/dca-bot/
├── index.ts              — Экспорты
├── safety-orders.ts      — ✅ Готово
├── tp-per-level.ts       — ✅ Готово
├── risk-manager.ts       — ✅ Готово
├── dca-bot-engine.ts     — 🆕 Главный движок
├── averaging.ts          — 🆕 Усреднение
├── exchange-adapter.ts   — 🆕 Адаптер
└── types.ts              — 🆕 Типы
```

---

### 1.3 WebSocket Infrastructure [8ч]

**Проблема:** Боты не используют real-time данные

**Решение:** Единая WebSocket инфраструктура

```
src/lib/websocket/
├── index.ts
├── exchange-websocket-manager.ts  — Менеджер подключений
├── price-feed.ts                  — Цены
├── orderbook-feed.ts              — Стакан
├── order-feed.ts                  — Ордера
├── position-feed.ts               — Позиции
└── types.ts
```

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 1.3.1 | Создать ExchangeWebSocketManager | 2ч |
| 1.3.2 | Реализовать Binance WebSocket streams | 2ч |
| 1.3.3 | Реализовать Bybit WebSocket streams | 1.5ч |
| 1.3.4 | Добавить reconnection logic | 1ч |
| 1.3.5 | Интегрировать с ботами | 1.5ч |

**Код:**

```typescript
// src/lib/websocket/exchange-websocket-manager.ts

import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface WSConfig {
  exchange: string;
  channels: string[];
  symbol: string;
  onMessage: (data: any) => void;
  onError?: (error: Error) => void;
  onReconnect?: () => void;
}

export class ExchangeWebSocketManager extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  
  // WebSocket URLs
  private static WS_URLS = {
    binance: {
      spot: 'wss://stream.binance.com:9443/ws',
      futures: 'wss://fstream.binance.com/ws',
    },
    bybit: {
      spot: 'wss://stream.bybit.com/v5/public/spot',
      futures: 'wss://stream.bybit.com/v5/public/linear',
    },
    okx: {
      public: 'wss://ws.okx.com:8443/ws/v5/public',
      private: 'wss://ws.okx.com:8443/ws/v5/private',
    },
  };

  /**
   * Подключиться к WebSocket биржи
   */
  connect(config: WSConfig): void {
    const key = `${config.exchange}-${config.symbol}`;
    
    if (this.connections.has(key)) {
      console.log(`[WS] Already connected to ${key}`);
      return;
    }
    
    const url = this.getWebSocketUrl(config);
    const ws = new WebSocket(url);
    
    ws.on('open', () => {
      console.log(`[WS] Connected to ${config.exchange}`);
      this.reconnectAttempts.set(key, 0);
      
      // Подписываемся на каналы
      this.subscribe(ws, config);
    });
    
    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString());
        config.onMessage(parsed);
      } catch (error) {
        console.error(`[WS] Parse error:`, error);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`[WS] Error:`, error);
      config.onError?.(error);
    });
    
    ws.on('close', () => {
      console.log(`[WS] Connection closed: ${key}`);
      this.connections.delete(key);
      
      // Автоматическое переподключение
      this.handleReconnect(config);
    });
    
    this.connections.set(key, ws);
  }

  /**
   * Отключиться
   */
  disconnect(exchange: string, symbol: string): void {
    const key = `${exchange}-${symbol}`;
    const ws = this.connections.get(key);
    
    if (ws) {
      ws.close();
      this.connections.delete(key);
    }
  }

  /**
   * Отключиться от всех
   */
  disconnectAll(): void {
    for (const [key, ws] of this.connections) {
      ws.close();
    }
    this.connections.clear();
  }

  private getWebSocketUrl(config: WSConfig): string {
    const urls = ExchangeWebSocketManager.WS_URLS[config.exchange as keyof typeof ExchangeWebSocketManager.WS_URLS];
    return urls?.futures || urls?.spot || '';
  }

  private subscribe(ws: WebSocket, config: WSConfig): void {
    let subscribeMsg: any;
    
    switch (config.exchange) {
      case 'binance':
        // Binance: /ws/btcusdt@ticker/btcusdt@depth
        subscribeMsg = {
          method: 'SUBSCRIBE',
          params: config.channels.map(ch => `${config.symbol.toLowerCase()}@${ch}`),
          id: Date.now(),
        };
        break;
        
      case 'bybit':
        subscribeMsg = {
          op: 'subscribe',
          args: config.channels.map(ch => `${ch}.${config.symbol}`),
        };
        break;
        
      case 'okx':
        subscribeMsg = {
          op: 'subscribe',
          args: config.channels.map(ch => ({ channel: ch, instId: config.symbol })),
        };
        break;
    }
    
    ws.send(JSON.stringify(subscribeMsg));
  }

  private handleReconnect(config: WSConfig): void {
    const key = `${config.exchange}-${config.symbol}`;
    const attempts = this.reconnectAttempts.get(key) || 0;
    
    if (attempts < this.maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
      
      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attempts + 1})`);
      
      setTimeout(() => {
        this.reconnectAttempts.set(key, attempts + 1);
        this.connect(config);
        config.onReconnect?.();
      }, delay);
    }
  }
}

// Singleton
export const wsManager = new ExchangeWebSocketManager();
```

---

### 1.4 HFT Bot — Архитектурное исправление [12ч]

**Проблема:** JavaScript не подходит для реального HFT (< 10ms)

**Решение:** Go/Rust microservice + WebSocket

**Архитектура:**

```
┌─────────────────────────────────────────────────────────────────┐
│                         HFT ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Frontend   │────▶│   Next.js    │────▶│   Go/Rust    │    │
│  │   (React)    │     │    API       │     │  HFT Engine  │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                              │                      │           │
│                              │                      │           │
│                              ▼                      ▼           │
│                       ┌──────────────┐     ┌──────────────┐    │
│                       │   Redis      │◀───▶│  WebSocket   │    │
│                       │   (state)    │     │  Exchange    │    │
│                       └──────────────┘     └──────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Задачи:**

| # | Задача | Время | Технология |
|---|--------|-------|------------|
| 1.4.1 | Создать Go HFT microservice | 4ч | Go |
| 1.4.2 | Реализовать orderbook manager | 2ч | Go |
| 1.4.3 | Добавить latency monitoring | 1.5ч | Go |
| 1.4.4 | Создать Redis integration | 1.5ч | Go + Redis |
| 1.4.5 | Создать Next.js API bridge | 1.5ч | TypeScript |
| 1.4.6 | Обновить UI | 1.5ч | React |

**Go microservice структура:**

```
mini-services/hft-service/
├── main.go
├── go.mod
├── internal/
│   ├── orderbook/
│   │   └── orderbook.go      — Управление стаканом
│   ├── engine/
│   │   └── hft.go            — HFT логика
│   ├── ws/
│   │   └── client.go         — WebSocket клиент
│   └── api/
│       └── server.go         — HTTP API
└── config/
    └── config.yaml
```

**Код (Go):**

```go
// mini-services/hft-service/internal/engine/hft.go

package engine

import (
	"sync"
	"time"
)

// HFTEngine - высокочастотный торговый движок
type HFTEngine struct {
	orderbook    *Orderbook
	strategies   []Strategy
	latencyMeter *LatencyMeter
	mu           sync.RWMutex
	running      bool
}

// Orderbook - локальный стакан
type Orderbook struct {
	Symbol string
	Bids   []PriceLevel // По убыванию цены
	Asks   []PriceLevel // По возрастанию цены
	mu     sync.RWMutex
}

// PriceLevel - уровень цены
type PriceLevel struct {
	Price    float64
	Quantity float64
	Orders   int
}

// Strategy - интерфейс стратегии
type Strategy interface {
	OnOrderbookUpdate(ob *Orderbook) *Signal
	Name() string
}

// Signal - торговый сигнал
type Signal struct {
	Action    string    // BUY, SELL, HOLD
	Size      float64
	Price     float64
	Timestamp time.Time
	Latency   time.Duration
}

// LatencyMeter - измеритель задержки
type LatencyMeter struct {
	measurements []time.Duration
	mu           sync.Mutex
}

// NewHFTEngine создаёт новый HFT движок
func NewHFTEngine(symbol string) *HFTEngine {
	return &HFTEngine{
		orderbook: &Orderbook{
			Symbol: symbol,
			Bids:   make([]PriceLevel, 0, 1000),
			Asks:   make([]PriceLevel, 0, 1000),
		},
		strategies:   make([]Strategy, 0),
		latencyMeter: &LatencyMeter{},
	}
}

// Start запускает движок
func (e *HFTEngine) Start() {
	e.mu.Lock()
	e.running = true
	e.mu.Unlock()
}

// Stop останавливает движок
func (e *HFTEngine) Stop() {
	e.mu.Lock()
	e.running = false
	e.mu.Unlock()
}

// OnOrderbookUpdate обрабатывает обновление стакана
func (e *HFTEngine) OnOrderbookUpdate(bids, asks []PriceLevel) *Signal {
	start := time.Now()
	
	e.orderbook.mu.Lock()
	e.orderbook.Bids = bids
	e.orderbook.Asks = asks
	e.orderbook.mu.Unlock()
	
	// Запускаем стратегии
	for _, strategy := range e.strategies {
		signal := strategy.OnOrderbookUpdate(e.orderbook)
		if signal != nil {
			signal.Latency = time.Since(start)
			e.latencyMeter.Record(signal.Latency)
			return signal
		}
	}
	
	return nil
}

// GetLatencyStats возвращает статистику задержки
func (e *HFTEngine) GetLatencyStats() (avg, min, max time.Duration) {
	return e.latencyMeter.Stats()
}

// ImbalanceStrategy - стратегия на дисбалансе стакана
type ImbalanceStrategy struct {
	threshold float64
}

func NewImbalanceStrategy(threshold float64) *ImbalanceStrategy {
	return &ImbalanceStrategy{threshold: threshold}
}

func (s *ImbalanceStrategy) Name() string {
	return "OrderbookImbalance"
}

func (s *ImbalanceStrategy) OnOrderbookUpdate(ob *Orderbook) *Signal {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	
	if len(ob.Bids) == 0 || len(ob.Asks) == 0 {
		return nil
	}
	
	// Считаем дисбаланс
	bidVolume := 0.0
	for _, bid := range ob.Bids[:10] {
		bidVolume += bid.Quantity
	}
	
	askVolume := 0.0
	for _, ask := range ob.Asks[:10] {
		askVolume += ask.Quantity
	}
	
	imbalance := (bidVolume - askVolume) / (bidVolume + askVolume)
	
	if imbalance > s.threshold {
		return &Signal{
			Action:    "BUY",
			Size:      0.01,
			Price:     ob.Bids[0].Price,
			Timestamp: time.Now(),
		}
	} else if imbalance < -s.threshold {
		return &Signal{
			Action:    "SELL",
			Size:      0.01,
			Price:     ob.Asks[0].Price,
			Timestamp: time.Now(),
		}
	}
	
	return nil
}

// Record записывает измерение
func (lm *LatencyMeter) Record(d time.Duration) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	
	lm.measurements = append(lm.measurements, d)
	
	// Храним последние 1000 измерений
	if len(lm.measurements) > 1000 {
		lm.measurements = lm.measurements[1:]
	}
}

// Stats возвращает статистику
func (lm *LatencyMeter) Stats() (avg, min, max time.Duration) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	
	if len(lm.measurements) == 0 {
		return 0, 0, 0
	}
	
	var sum time.Duration
	min = lm.measurements[0]
	max = lm.measurements[0]
	
	for _, m := range lm.measurements {
		sum += m
		if m < min {
			min = m
		}
		if m > max {
			max = m
		}
	}
	
	avg = sum / time.Duration(len(lm.measurements))
	return
}
```

---

### 1.5 Multi-tenant Implementation [8ч]

**Проблема:** Нет реального разделения пользователей

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 1.5.1 | Добавить tenant_id во все модели Prisma | 1.5ч |
| 1.5.2 | Реализовать TenantContext middleware | 1.5ч |
| 1.5.3 | Добавить tenant isolation в API | 2ч |
| 1.5.4 | Обновить exchange clients с tenant support | 1.5ч |
| 1.5.5 | Тестирование | 1.5ч |

---

## 🎯 ЭТАП 2: ML/AI КОМПОНЕНТЫ (P1) — 35ч

### 2.1 ML Pipeline — Полная реализация [12ч]

**Текущее состояние:**
- ✅ Feature Engineer
- ⚠️ AutoML Engine — stub
- ⚠️ Model Registry — stub

**Решение:** Интеграция с Python ML service

**Архитектура:**

```
┌─────────────────────────────────────────────────────────────────┐
│                       ML PIPELINE ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Next.js    │────▶│   Python     │────▶│   Model      │    │
│  │   App        │     │   ML Service │     │   Storage    │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                    │             │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Feature    │     │  TensorFlow  │     │    Redis     │    │
│  │   Cache      │     │  / PyTorch   │     │   Models     │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Задачи:**

| # | Задача | Время | Технология |
|---|--------|-------|------------|
| 2.1.1 | Создать Python ML service | 3ч | Python/FastAPI |
| 2.1.2 | Реализовать TensorFlow модели | 3ч | TensorFlow |
| 2.1.3 | Создать API bridge | 2ч | TypeScript |
| 2.1.4 | Реализовать model versioning | 2ч | Python |
| 2.1.5 | Добавить training pipeline | 2ч | Python |

**Python ML Service:**

```
mini-services/ml-service/
├── main.py
├── requirements.txt
├── models/
│   ├── __init__.py
│   ├── price_predictor.py
│   ├── signal_classifier.py
│   └── regime_detector.py
├── training/
│   ├── __init__.py
│   ├── trainer.py
│   └── hyperopt.py
├── api/
│   ├── __init__.py
│   ├── routes.py
│   └── schemas.py
└── config/
    └── config.yaml
```

**Код (Python):**

```python
# mini-services/ml-service/models/price_predictor.py

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import numpy as np
from typing import Tuple, Optional
import joblib
import os

class PricePredictorModel:
    """
    LSTM + Attention модель для прогнозирования цен
    """
    
    def __init__(
        self,
        sequence_length: int = 60,
        features: int = 20,
        hidden_units: int = 128,
        num_layers: int = 2,
        dropout: float = 0.2
    ):
        self.sequence_length = sequence_length
        self.features = features
        self.hidden_units = hidden_units
        self.num_layers = num_layers
        self.dropout = dropout
        self.model = self._build_model()
        self.scaler = None
        
    def _build_model(self) -> keras.Model:
        """
        Построение модели
        """
        inputs = layers.Input(shape=(self.sequence_length, self.features))
        
        # LSTM layers
        x = inputs
        for i in range(self.num_layers):
            return_sequences = i < self.num_layers - 1
            x = layers.LSTM(
                self.hidden_units,
                return_sequences=return_sequences,
                dropout=self.dropout,
                recurrent_dropout=self.dropout,
                name=f'lstm_{i}'
            )(x)
        
        # Attention mechanism
        attention = layers.Dense(1, activation='tanh')(x)
        attention = layers.Flatten()(attention)
        attention = layers.Activation('softmax')(attention)
        attention = layers.RepeatVector(self.hidden_units)(attention)
        attention = layers.Permute([2, 1])(attention)
        
        # Dense layers
        x = layers.Dense(64, activation='relu')(x)
        x = layers.Dropout(self.dropout)(x)
        x = layers.Dense(32, activation='relu')(x)
        
        # Output layer - predict next price change
        outputs = layers.Dense(1, activation='tanh', name='price_change')(x)
        
        model = keras.Model(inputs=inputs, outputs=outputs)
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        return model
    
    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        validation_split: float = 0.2,
        epochs: int = 100,
        batch_size: int = 32,
        early_stopping_patience: int = 10
    ) -> keras.callbacks.History:
        """
        Обучение модели
        """
        callbacks = [
            keras.callbacks.EarlyStopping(
                monitor='val_loss',
                patience=early_stopping_patience,
                restore_best_weights=True
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=5,
                min_lr=0.0001
            ),
            keras.callbacks.ModelCheckpoint(
                'checkpoints/best_model.h5',
                monitor='val_loss',
                save_best_only=True
            )
        ]
        
        history = self.model.fit(
            X, y,
            validation_split=validation_split,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        return history
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Прогнозирование
        """
        return self.model.predict(X, verbose=0)
    
    def predict_with_confidence(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Прогнозирование с confidence interval
        """
        predictions = []
        n_samples = 100
        
        # Monte Carlo Dropout для uncertainty estimation
        for _ in range(n_samples):
            pred = self.model(X, training=True)  # Enable dropout
            predictions.append(pred)
        
        predictions = np.array(predictions)
        mean = predictions.mean(axis=0)
        std = predictions.std(axis=0)
        
        return mean, std
    
    def save(self, path: str):
        """
        Сохранение модели
        """
        self.model.save(f'{path}/model.h5')
        if self.scaler:
            joblib.dump(self.scaler, f'{path}/scaler.pkl')
    
    def load(self, path: str):
        """
        Загрузка модели
        """
        self.model = keras.models.load_model(f'{path}/model.h5')
        if os.path.exists(f'{path}/scaler.pkl'):
            self.scaler = joblib.load(f'{path}/scaler.pkl')


class SignalClassifierModel:
    """
    Gradient Boosting классификатор для сигналов
    """
    
    def __init__(
        self,
        n_estimators: int = 200,
        max_depth: int = 6,
        learning_rate: float = 0.1
    ):
        from sklearn.ensemble import GradientBoostingClassifier
        self.model = GradientBoostingClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            random_state=42
        )
        self.scaler = None
        self.feature_importance = None
        
    def train(self, X: np.ndarray, y: np.ndarray) -> dict:
        """
        Обучение классификатора
        """
        from sklearn.model_selection import cross_val_score
        from sklearn.preprocessing import StandardScaler
        
        # Normalize features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        # Cross-validation
        cv_scores = cross_val_score(self.model, X_scaled, y, cv=5)
        
        # Fit final model
        self.model.fit(X_scaled, y)
        self.feature_importance = self.model.feature_importances_
        
        return {
            'cv_scores_mean': cv_scores.mean(),
            'cv_scores_std': cv_scores.std(),
            'feature_importance': self.feature_importance.tolist()
        }
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Предсказание класса сигнала
        """
        X_scaled = self.scaler.transform(X)
        return self.model.predict(X_scaled)
    
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Предсказание вероятностей
        """
        X_scaled = self.scaler.transform(X)
        return self.model.predict_proba(X_scaled)
```

---

### 2.2 RL Agents — Полная реализация [10ч]

**Текущее состояние:**
- ⚠️ PPO Agent — simplified JS implementation
- ⚠️ SAC Agent — simplified JS implementation
- ❌ Нет реального обучения

**Решение:** Python RL service с stable-baselines3

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 2.2.1 | Создать Python RL service | 3ч |
| 2.2.2 | Реализовать trading environment | 2ч |
| 2.2.3 | Интегрировать stable-baselines3 | 2ч |
| 2.2.4 | Создать API bridge | 2ч |
| 2.2.5 | Добавить model serving | 1ч |

**Python RL Service:**

```python
# mini-services/rl-service/environment/trading_env.py

import gym
import numpy as np
from gym import spaces
from typing import Tuple, Dict, Any

class TradingEnvironment(gym.Env):
    """
    Custom Trading Environment для RL
    """
    
    metadata = {'render.modes': ['human']}
    
    def __init__(
        self,
        prices: np.ndarray,
        features: np.ndarray,
        initial_balance: float = 10000,
        commission: float = 0.001,
        leverage: float = 1.0
    ):
        super().__init__()
        
        self.prices = prices
        self.features = features
        self.initial_balance = initial_balance
        self.commission = commission
        self.leverage = leverage
        
        # Action space: 0=hold, 1=long, 2=short, 3=close_long, 4=close_short
        self.action_space = spaces.Discrete(5)
        
        # Observation space
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(features.shape[1] + 3,),  # features + position info
            dtype=np.float32
        )
        
        # State
        self.reset()
    
    def reset(self) -> np.ndarray:
        """Reset environment"""
        self.balance = self.initial_balance
        self.position = None  # None, 'long', 'short'
        self.position_size = 0
        self.entry_price = 0
        self.current_step = 0
        self.total_pnl = 0
        self.trades = []
        
        return self._get_observation()
    
    def step(self, action: int) -> Tuple[np.ndarray, float, bool, Dict[str, Any]]:
        """Execute action"""
        current_price = self.prices[self.current_step]
        prev_balance = self.balance
        
        # Execute action
        if action == 1 and self.position is None:  # Open long
            self.position = 'long'
            self.entry_price = current_price
            self.position_size = (self.balance * self.leverage) / current_price
            self.balance -= self.balance * self.commission
            
        elif action == 2 and self.position is None:  # Open short
            self.position = 'short'
            self.entry_price = current_price
            self.position_size = (self.balance * self.leverage) / current_price
            self.balance -= self.balance * self.commission
            
        elif action == 3 and self.position == 'long':  # Close long
            pnl = (current_price - self.entry_price) * self.position_size
            self.balance += self.position_size * current_price - self.balance * self.commission
            self.trades.append({
                'type': 'long',
                'entry': self.entry_price,
                'exit': current_price,
                'pnl': pnl
            })
            self.position = None
            self.position_size = 0
            
        elif action == 4 and self.position == 'short':  # Close short
            pnl = (self.entry_price - current_price) * self.position_size
            self.balance += self.position_size * self.entry_price - self.balance * self.commission
            self.trades.append({
                'type': 'short',
                'entry': self.entry_price,
                'exit': current_price,
                'pnl': pnl
            })
            self.position = None
            self.position_size = 0
        
        # Move to next step
        self.current_step += 1
        
        # Calculate reward
        reward = self._calculate_reward(prev_balance)
        
        # Check done
        done = self.current_step >= len(self.prices) - 1
        
        # Additional info
        info = {
            'balance': self.balance,
            'position': self.position,
            'total_pnl': self.balance - self.initial_balance,
            'num_trades': len(self.trades)
        }
        
        return self._get_observation(), reward, done, info
    
    def _get_observation(self) -> np.ndarray:
        """Get current observation"""
        features = self.features[self.current_step]
        
        # Position encoding
        position_encoding = [
            1 if self.position == 'long' else 0,
            1 if self.position == 'short' else 0,
            self.position_size / 100 if self.position else 0
        ]
        
        return np.concatenate([features, position_encoding]).astype(np.float32)
    
    def _calculate_reward(self, prev_balance: float) -> float:
        """Calculate reward"""
        # PnL reward
        pnl_reward = (self.balance - prev_balance) / prev_balance * 100
        
        # Position holding reward (encourage shorter positions)
        if self.position:
            holding_penalty = -0.01
        else:
            holding_penalty = 0
        
        # Risk-adjusted reward
        if len(self.trades) > 0:
            wins = sum(1 for t in self.trades if t['pnl'] > 0)
            win_rate = wins / len(self.trades)
            risk_reward = win_rate * 0.1
        else:
            risk_reward = 0
        
        return pnl_reward + holding_penalty + risk_reward
    
    def render(self, mode='human'):
        """Render environment"""
        pnl = self.balance - self.initial_balance
        pnl_pct = pnl / self.initial_balance * 100
        print(f"Step: {self.current_step}, Balance: ${self.balance:.2f}, PnL: ${pnl:.2f} ({pnl_pct:.2f}%)")


# training/trainer.py

from stable_baselines3 import PPO, SAC, A2C
from stable_baselines3.common.callbacks import EvalCallback
from stable_baselines3.common.vec_env import DummyVecEnv
import optuna

class RLTrainer:
    """
    Обучение RL агентов
    """
    
    def __init__(self, env_class, env_params: dict):
        self.env_class = env_class
        self.env_params = env_params
        
    def train_ppo(
        self,
        total_timesteps: int = 100000,
        learning_rate: float = 0.0003,
        n_steps: int = 2048,
        batch_size: int = 64,
        n_epochs: int = 10,
        gamma: float = 0.99
    ) -> PPO:
        """
        Обучение PPO агента
        """
        env = DummyVecEnv([lambda: self.env_class(**self.env_params)])
        
        model = PPO(
            "MlpPolicy",
            env,
            learning_rate=learning_rate,
            n_steps=n_steps,
            batch_size=batch_size,
            n_epochs=n_epochs,
            gamma=gamma,
            verbose=1,
            tensorboard_log="./logs/"
        )
        
        # Evaluation callback
        eval_env = DummyVecEnv([lambda: self.env_class(**self.env_params)])
        eval_callback = EvalCallback(
            eval_env,
            best_model_save_path='./models/',
            log_path='./logs/',
            eval_freq=10000,
            deterministic=True,
            render=False
        )
        
        model.learn(total_timesteps=total_timesteps, callback=eval_callback)
        
        return model
    
    def hyperopt(
        self,
        n_trials: int = 50,
        total_timesteps: int = 50000
    ) -> dict:
        """
        Оптимизация гиперпараметров
        """
        def objective(trial):
            learning_rate = trial.suggest_float('learning_rate', 1e-5, 1e-2, log=True)
            n_steps = trial.suggest_categorical('n_steps', [1024, 2048, 4096])
            batch_size = trial.suggest_categorical('batch_size', [32, 64, 128])
            n_epochs = trial.suggest_int('n_epochs', 5, 20)
            gamma = trial.suggest_float('gamma', 0.9, 0.9999)
            
            model = self.train_ppo(
                total_timesteps=total_timesteps,
                learning_rate=learning_rate,
                n_steps=n_steps,
                batch_size=batch_size,
                n_epochs=n_epochs,
                gamma=gamma
            )
            
            # Evaluate
            env = self.env_class(**self.env_params)
            obs = env.reset()
            total_reward = 0
            
            for _ in range(1000):
                action, _ = model.predict(obs, deterministic=True)
                obs, reward, done, _ = env.step(action)
                total_reward += reward
                if done:
                    break
            
            return total_reward
        
        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=n_trials)
        
        return study.best_params
```

---

### 2.3 AI Risk Management — Полная реализация [8ч]

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 2.3.1 | Реализовать VaR ML model | 2ч |
| 2.3.2 | Реализовать Anomaly Detection | 2ч |
| 2.3.3 | Реализовать Position Sizing AI | 2ч |
| 2.3.4 | Интегрировать с Risk Manager | 2ч |

**Код:**

```typescript
// src/lib/ai-risk/risk-predictor.ts

import { Position, AccountInfo } from '../exchange/types';

export interface RiskPrediction {
  var95: number;           // Value at Risk 95%
  var99: number;           // Value at Risk 99%
  expectedShortfall: number; // CVaR
  probabilityOfLiquidation: number;
  recommendedPositionSize: number;
  riskScore: number;       // 0-100
  warnings: string[];
}

export interface MarketConditions {
  volatility: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  correlation: number;
  fundingRate: number;
  openInterest: number;
  liquidationHeatmap: Record<string, number>;
}

export class AIRiskPredictor {
  private modelEndpoint: string;
  
  constructor(modelEndpoint: string = 'http://localhost:8001') {
    this.modelEndpoint = modelEndpoint;
  }
  
  /**
   * Предсказать риск портфеля
   */
  async predictRisk(
    positions: Position[],
    account: AccountInfo,
    marketConditions: MarketConditions
  ): Promise<RiskPrediction> {
    // Формируем features
    const features = this.extractFeatures(positions, account, marketConditions);
    
    // Отправляем на ML service
    const response = await fetch(`${this.modelEndpoint}/predict/risk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
    });
    
    const prediction = await response.json();
    
    return {
      var95: prediction.var_95,
      var99: prediction.var_99,
      expectedShortfall: prediction.expected_shortfall,
      probabilityOfLiquidation: prediction.liquidation_prob,
      recommendedPositionSize: this.calculateSafePositionSize(prediction, account),
      riskScore: prediction.risk_score,
      warnings: this.generateWarnings(prediction),
    };
  }
  
  /**
   * Обнаружить аномалии
   */
  async detectAnomalies(
    positions: Position[],
    recentTrades: any[]
  ): Promise<AnomalyDetectionResult> {
    const features = this.extractAnomalyFeatures(positions, recentTrades);
    
    const response = await fetch(`${this.modelEndpoint}/predict/anomaly`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
    });
    
    return response.json();
  }
  
  /**
   * Оптимальный размер позиции (Kelly + ML)
   */
  async calculateOptimalPositionSize(
    symbol: string,
    account: AccountInfo,
    signal: { winRate: number; avgWin: number; avgLoss: number }
  ): Promise<number> {
    // Kelly Criterion
    const kelly = (signal.winRate * signal.avgWin - (1 - signal.winRate) * signal.avgLoss) / signal.avgWin;
    
    // ML-adjusted Kelly
    const response = await fetch(`${this.modelEndpoint}/predict/kelly_adjustment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kelly,
        symbol,
        accountBalance: account.totalEquity,
        marketConditions: await this.getMarketConditions(symbol),
      }),
    });
    
    const adjustment = await response.json();
    
    // Adjusted Kelly (fractional)
    return kelly * adjustment.multiplier * account.totalEquity;
  }
  
  private extractFeatures(
    positions: Position[],
    account: AccountInfo,
    market: MarketConditions
  ): number[] {
    return [
      // Position features
      positions.length,
      positions.reduce((sum, p) => sum + Math.abs(p.unrealizedPnl), 0),
      positions.reduce((sum, p) => sum + p.margin, 0) / account.totalEquity,
      
      // Leverage features
      Math.max(...positions.map(p => p.leverage)),
      positions.reduce((sum, p) => sum + p.quantity * p.markPrice, 0) / account.totalEquity,
      
      // Market features
      market.volatility,
      market.correlation,
      Math.abs(market.fundingRate),
      market.openInterest,
      
      // Account features
      account.availableMargin / account.totalEquity,
      account.unrealizedPnl / account.totalEquity,
    ];
  }
  
  private extractAnomalyFeatures(positions: Position[], trades: any[]): number[] {
    // Extract features for anomaly detection
    return [
      positions.length,
      trades.length,
      trades.filter(t => t.pnl < 0).length / (trades.length || 1),
      // ... more features
    ];
  }
  
  private calculateSafePositionSize(prediction: any, account: AccountInfo): number {
    const maxRisk = account.totalEquity * 0.02; // 2% max risk
    const varBasedSize = maxRisk / prediction.var_95;
    return Math.min(varBasedSize, account.availableMargin * 0.1);
  }
  
  private generateWarnings(prediction: any): string[] {
    const warnings: string[] = [];
    
    if (prediction.liquidation_prob > 0.1) {
      warnings.push('High liquidation probability detected');
    }
    if (prediction.risk_score > 70) {
      warnings.push('Portfolio risk score is elevated');
    }
    if (prediction.var_95 > 0.05) {
      warnings.push('Value at Risk exceeds 5% of portfolio');
    }
    
    return warnings;
  }
  
  private async getMarketConditions(symbol: string): Promise<MarketConditions> {
    // Fetch market conditions
    return {
      volatility: 0,
      trend: 'neutral',
      correlation: 0,
      fundingRate: 0,
      openInterest: 0,
      liquidationHeatmap: {},
    };
  }
}

interface AnomalyDetectionResult {
  isAnomaly: boolean;
  anomalyScore: number;
  anomalyTypes: string[];
  recommendedActions: string[];
}
```

---

### 2.4 Deep Learning Module — Полная реализация [5ч]

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 2.4.1 | Создать LSTM price predictor | 2ч |
| 2.4.2 | Создать Transformer model | 1.5ч |
| 2.4.3 | Интегрировать с ML service | 1.5ч |

---

## 🎯 ЭТАП 3: ЗАГЛУШКИ БОТОВ (P1) — 50ч

### 3.1 Institutional Bots [20ч]

#### 3.1.1 Reed Bot (Statistical Arbitrage) [5ч]

**Стратегия:**
- Identify correlated pairs
- Calculate z-score spread
- Trade mean reversion

```typescript
// src/lib/institutional-bots/reed-bot.ts

export class ReedBot {
  /**
   * Statistical Arbitrage Bot
   * 
   * Strategy: Trade mean reversion in correlated pairs
   */
  
  async findCorrelatedPairs(
    symbols: string[],
    lookbackDays: number = 30
  ): Promise<CorrelatedPair[]> {
    const pairs: CorrelatedPair[] = [];
    
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const correlation = await this.calculateCorrelation(
          symbols[i],
          symbols[j],
          lookbackDays
        );
        
        if (Math.abs(correlation) > 0.7) {
          // Cointegration test
          const cointegration = await this.testCointegration(
            symbols[i],
            symbols[j]
          );
          
          if (cointegration.isCointegrated) {
            pairs.push({
              symbol1: symbols[i],
              symbol2: symbols[j],
              correlation,
              hedgeRatio: cointegration.hedgeRatio,
              halfLife: cointegration.halfLife,
            });
          }
        }
      }
    }
    
    return pairs;
  }
  
  async generateSignal(pair: CorrelatedPair): Promise<StatArbSignal> {
    // Get current prices
    const [price1, price2] = await Promise.all([
      this.getPrice(pair.symbol1),
      this.getPrice(pair.symbol2),
    ]);
    
    // Calculate spread
    const spread = price1 - pair.hedgeRatio * price2;
    
    // Calculate z-score
    const { mean, std } = await this.getSpreadStats(pair);
    const zScore = (spread - mean) / std;
    
    // Generate signal
    if (zScore > 2) {
      // Spread too high - short spread
      return {
        type: 'SHORT_SPREAD',
        symbol1: pair.symbol1,
        symbol2: pair.symbol2,
        side1: 'sell',
        side2: 'buy',
        zScore,
        confidence: Math.min(zScore / 3, 1),
      };
    } else if (zScore < -2) {
      // Spread too low - long spread
      return {
        type: 'LONG_SPREAD',
        symbol1: pair.symbol1,
        symbol2: pair.symbol2,
        side1: 'buy',
        side2: 'sell',
        zScore,
        confidence: Math.min(Math.abs(zScore) / 3, 1),
      };
    }
    
    return { type: 'HOLD' };
  }
}
```

#### 3.1.2 Architect Bot (Market Making) [5ч]

**Стратегия:**
- Quote bid/ask around mid price
- Manage inventory risk
- Capture spread

#### 3.1.3 Equilibrist Bot (Mean Reversion) [5ч]

**Стратегия:**
- Bollinger Bands mean reversion
- RSI overbought/oversold
- Volume confirmation

#### 3.1.4 Kron Bot (Trend Following) [5ч]

**Стратегия:**
- Multi-timeframe trend detection
- Momentum indicators
- Position scaling

---

### 3.2 BB Bot (Bollinger Bands) [8ч]

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 3.2.1 | Реализовать BB signal generator | 2ч |
| 3.2.2 | Добавить MTF confirmation | 2ч |
| 3.2.3 | Реализовать exchange adapter | 2ч |
| 3.2.4 | Добавить risk management | 2ч |

---

### 3.3 LFT Bot (Low Frequency) [8ч]

**Задачи:**

| # | Задача | Время |
|---|--------|-------|
| 3.3.1 | Реализовать trend detection | 2ч |
| 3.3.2 | Добавить multi-timeframe analysis | 2ч |
| 3.3.3 | Реализовать position management | 2ч |
| 3.3.4 | Добавить exchange integration | 2ч |

---

## 🎯 ЭТАП 4: UI ИНТЕГРАЦИЯ (P2) — 20ч

### 4.1 RL Agents Panel [4ч]

**Задачи:**
- Подключить к Python RL service
- Добавить real-time training progress
- Показать metrics и charts

### 4.2 ML Pipeline Panel [4ч]

**Задачи:**
- Подключить к ML service
- Добавить training controls
- Показать model metrics

### 4.3 Institutional Bots Panels [6ч]

**Задачи:**
- Reed Bot panel
- Architect Bot panel
- Equilibrist Bot panel
- Kron Bot panel

### 4.4 Paper Trading Dashboard [3ч]

**Задачи:**
- Real-time equity curve
- Position tracking
- Metrics display

### 4.5 Risk Dashboard [3ч]

**Задачи:**
- VaR display
- Drawdown chart
- Position risk breakdown

---

## 📋 КОНСОЛИДИРОВАННЫЙ ПЛАН

### Неделя 1 (40ч) — P0 Critical

| День | Задачи | Время |
|------|--------|-------|
| Пн | Grid Bot Engine + Exchange Adapter | 8ч |
| Вт | DCA Bot Engine + Exchange Adapter | 8ч |
| Ср | WebSocket Infrastructure | 8ч |
| Чт | HFT Go Service (setup + core) | 8ч |
| Пт | HFT Go Service (integration) + Multi-tenant | 8ч |

### Неделя 2 (40ч) — P1 ML/AI

| День | Задачи | Время |
|------|--------|-------|
| Пн | Python ML Service (setup + models) | 8ч |
| Вт | ML Pipeline Integration | 8ч |
| Ср | Python RL Service (environment) | 8ч |
| Чт | RL Training Pipeline | 8ч |
| Пт | AI Risk Management | 8ч |

### Неделя 3 (40ч) — P1 Bots

| День | Задачи | Время |
|------|--------|-------|
| Пн | Reed Bot (Stat Arb) | 8ч |
| Вт | Architect Bot (MM) + Equilibrist (MR) | 8ч |
| Ср | Kron Bot (Trend) | 8ч |
| Чт | BB Bot + LFT Bot | 8ч |
| Пт | Deep Learning Module | 8ч |

### Неделя 4 (20ч) — P2 UI

| День | Задачи | Время |
|------|--------|-------|
| Пн | RL Agents Panel + ML Pipeline Panel | 8ч |
| Вт | Institutional Bots Panels | 8ч |
| Ср | Risk Dashboard + Final Integration | 4ч |

---

## 🏁 КРИТЕРИИ УСПЕХА

### Grid Bot ✅
- [ ] Запуск/остановка через UI
- [ ] Real-time price feed
- [ ] Order placement на бирже
- [ ] Paper trading mode
- [ ] Metrics calculation

### DCA Bot ✅
- [ ] Averaging down logic
- [ ] Safety orders execution
- [ ] TP-per-level
- [ ] Exchange integration

### HFT Bot ✅
- [ ] Latency < 50ms (Go service)
- [ ] Orderbook streaming
- [ ] Real signal generation

### ML Pipeline ✅
- [ ] Model training
- [ ] Model serving
- [ ] Feature engineering
- [ ] Prediction API

### RL Agents ✅
- [ ] Training environment
- [ ] Model training
- [ ] Real predictions

### Institutional Bots ✅
- [ ] Reed: Correlation analysis + signals
- [ ] Architect: Orderbook management
- [ ] Equilibrist: Mean reversion signals
- [ ] Kron: Trend following logic

---

## 📊 РЕСУРСЫ

### Технологии

| Компонент | Технология |
|-----------|------------|
| Frontend | Next.js 16, React 19, Tailwind |
| Backend API | Next.js API Routes |
| Database | SQLite → PostgreSQL (prod) |
| WebSocket | Socket.IO |
| ML Service | Python, FastAPI, TensorFlow |
| RL Service | Python, stable-baselines3 |
| HFT Service | Go |
| Cache | Redis |
| Queue | BullMQ |

### Порты сервисов

| Сервис | Порт |
|--------|------|
| Next.js App | 3000 |
| Price Service | 3002 |
| ML Service | 8001 |
| RL Service | 8002 |
| HFT Service | 8003 |

---

## 📝 ЗАКЛЮЧЕНИЕ

Данный план покрывает все выявленные недостатки и приводит проект к production-ready состоянию. 

**Общая оценка после выполнения:** 9/10

**Оставшиеся работы (после плана):**
- Comprehensive testing
- Performance optimization
- Security audit
- Documentation updates
