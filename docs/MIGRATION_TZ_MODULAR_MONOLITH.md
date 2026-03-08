# ТЕХНИЧЕСКОЕ ЗАДАНИЕ
## Миграция CITARION на Modular Monolith архитектуру

**Версия:** 1.0.0  
**Дата:** Январь 2026  
**Статус:** Утверждено  

---

# ЧАСТЬ 1: АНАЛИЗ ТЕКУЩЕГО СОСТОЯНИЯ

## 1.1 Текущий технологический стек

### Frontend
| Компонент | Технология | Версия |
|-----------|------------|--------|
| Framework | Next.js | 16.1.3 |
| UI Library | React | 19.0.0 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Components | Shadcn/ui | - |
| Charts | Recharts, Lightweight Charts | 5.1.0 |
| State | Zustand | - |
| Data Fetching | TanStack Query | 5.82.0 |

### Backend
| Компонент | Технология | Версия |
|-----------|------------|--------|
| Runtime | Bun | - |
| ORM | Prisma | 6.11.1 |
| Database | SQLite | - |
| Auth | NextAuth.js | 4.24.11 |

### Mini-services (существующие)
| Сервис | Язык | Порт | Назначение |
|--------|------|------|------------|
| hft-service | Go | 3004 | HFT engine |
| ml-service | Python | 3002 | ML pipeline |
| rl-service | Python | 3003 | RL agents |
| price-service | TypeScript/Bun | 3001 | Price caching |

## 1.2 Статистика кодовой базы

```
┌─────────────────────────────────────────────────────────────────┐
│                    Current Codebase Statistics                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TypeScript Files:     ~175 файлов                              │
│  Total Lines:          ~293,000 строк                           │
│  React Components:     ~150+ компонентов                        │
│  API Routes:           35+ endpoints                            │
│  Prisma Models:        57 моделей                               │
│  Exchange Clients:     12 бирж                                  │
│  Bot Types:            15+ типов ботов                          │
│  Lib Modules:          60+ модулей                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 1.3 Критичные компоненты для миграции

### Приоритет 1: Trading Core
```
src/lib/
├── grid-bot/          → Rust: trading::grid_bot
├── dca-bot/           → Rust: trading::dca_bot
├── bb-bot/            → Rust: trading::bb_bot
├── argus-bot/         → Rust: trading::argus_bot
├── hft-bot/           → Rust: trading::hft_bot
├── range-bot/         → Rust: trading::range_bot
├── orion-bot/         → Rust: trading::orion_bot
├── vision-bot/        → Rust: trading::vision_bot
└── institutional-bots/→ Rust: trading::institutional
```

### Приоритет 2: Exchange Integration
```
src/lib/exchange/
├── binance-client.ts  → Rust: exchanges::binance
├── bybit-client.ts    → Rust: exchanges::bybit
├── okx-client.ts      → Rust: exchanges::okx
├── bitget-client.ts   → Rust: exchanges::bitget
├── kucoin-client.ts   → Rust: exchanges::kucoin
├── hyperliquid-client.ts → Rust: exchanges::hyperliquid
├── bingx-client.ts    → Rust: exchanges::bingx
├── coinbase-client.ts → Rust: exchanges::coinbase
├── huobi-client.ts    → Rust: exchanges::huobi
├── bitmex-client.ts   → Rust: exchanges::bitmex
├── blofin-client.ts   → Rust: exchanges::blofin
└── base-client.ts     → Rust: exchanges::traits
```

### Приоритет 3: Risk Management
```
src/lib/
├── risk-management/   → Rust: risk
├── ai-risk/           → Rust: risk::ai
└── protection/        → Rust: risk::protection
```

### Приоритет 4: Data & Storage
```
src/lib/
├── ohlcv.ts           → Rust: data::ohlcv
├── funding.ts         → Rust: data::funding
├── exchange-websocket.ts → Rust: data::websocket
└── price-service/     → Rust: data::price
```

---

# ЧАСТЬ 2: ЦЕЛЕВАЯ АРХИТЕКТУРА

## 2.1 Общая схема

```
┌─────────────────────────────────────────────────────────────────┐
│                 CITARION Target Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    FRONTEND LAYER                        │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │  Vite + React 19 + TypeScript                   │    │   │
│  │  │  ├── Dashboard (SPA)                            │    │   │
│  │  │  ├── Lightweight Charts                         │    │   │
│  │  │  ├── TanStack Query (data fetching)             │    │   │
│  │  │  └── Zustand (state management)                 │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                         │                                │   │
│  │                   HTTP/WebSocket                         │   │
│  └─────────────────────────┼───────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────┼───────────────────────────────┐   │
│  │                    RUST BACKEND                          │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │            MODULAR MONOLITH                      │    │   │
│  │  │                                                  │    │   │
│  │  │  api/              HTTP + WebSocket handlers     │    │   │
│  │  │  trading/          Order execution engine        │    │   │
│  │  │  risk/             Risk management               │    │   │
│  │  │  exchanges/        Exchange clients (12+)        │    │   │
│  │  │  data/             OHLCV, funding, prices        │    │   │
│  │  │  bots/             All bot types                 │    │   │
│  │  │  indicators/       Technical indicators          │    │   │
│  │  │  backtesting/      Strategy backtesting          │    │   │
│  │  │  shared/           Common types, config          │    │   │
│  │  │                                                  │    │   │
│  │  │  Single Binary | In-memory calls | <1μs latency │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                         │                                │   │
│  └─────────────────────────┼───────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────┼───────────────────────────────┐   │
│  │                    DATA LAYER                            │   │
│  │                                                          │   │
│  │  ┌─────────────┐     ┌─────────────┐                    │   │
│  │  │ TimescaleDB │     │   Redis     │                    │   │
│  │  │ (Primary)   │     │  (Cache)    │                    │   │
│  │  │             │     │             │                    │   │
│  │  │ • OHLCV     │     │ • Prices    │                    │   │
│  │  │ • Trades    │     │ • Sessions  │                    │   │
│  │  │ • Positions │     │ • Pub/Sub   │                    │   │
│  │  │ • Signals   │     │ • OrderBook │                    │   │
│  │  │ • Bot state │     │             │                    │   │
│  │  └─────────────┘     └─────────────┘                    │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 ML SERVICE (Optional)                    │   │
│  │                                                          │   │
│  │  Python + FastAPI + gRPC                                │   │
│  │  • Signal classification                                │   │
│  │  • Price prediction                                     │   │
│  │  • Regime detection                                     │   │
│  │  Separate process | Crash isolation                     │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2.2 Архитектурные принципы (Anti-Big-Ball-of-Mud)

### 2.2.1 Границы модулей и правила импортов

```
┌─────────────────────────────────────────────────────────────────┐
│              MODULE BOUNDARY RULES (Strict Enforcement)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ПРИНЦИП: Инверсия зависимостей через traits                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    ЗАПРЕЩЁННЫЕ ИМПОРТЫ                   │   │
│  │                                                          │   │
│  │  ❌ api → trading (напрямую)                             │   │
│  │  ❌ api → exchanges (напрямую)                           │   │
│  │  ❌ api → risk (напрямую)                                │   │
│  │  ❌ trading → api (любой)                                │   │
│  │  ❌ exchanges → trading (любой)                          │   │
│  │  ❌ Межмодульные импорты implementation типов            │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   РАЗРЕШЁННЫЕ ИМПОРТЫ                    │   │
│  │                                                          │   │
│  │  ✅ Любой модуль → shared (types, traits, config)        │   │
│  │  ✅ api → shared::traits (интерфейсы)                    │   │
│  │  ✅ api внедряет зависимости через DI container          │   │
│  │  ✅ Модули реализуют traits из shared                    │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  СЛОИСТАЯ АРХИТЕКТУРА:                                         │
│                                                                 │
│      ┌─────────────┐                                           │
│      │     API     │  ← HTTP handlers, WebSocket               │
│      └──────┬──────┘                                           │
│             │ (внедрение через traits, НЕ прямые импорты)      │
│             ▼                                                   │
│      ┌─────────────┐                                           │
│      │   CORE      │  ← trading, risk, bots, exchanges         │
│      └──────┬──────┘                                           │
│             │ (реализация traits)                              │
│             ▼                                                   │
│      ┌─────────────┐                                           │
│      │   SHARED    │  ← traits, types, config, errors         │
│      └─────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Структура shared модуля

```rust
// src/shared/mod.rs
pub mod traits;      // Все trait definitions
pub mod types;       // Общие типы (Symbol, Order, Position, etc.)
pub mod config;      // Конфигурация
pub mod errors;      // Типы ошибок
pub mod events;      // Event types для шины событий

// src/shared/traits/mod.rs
pub mod exchange;
pub mod trading;
pub mod risk;
pub mod bot;
pub mod data;

// Трейты для внедрения зависимости
pub use exchange::ExchangeClient;
pub use trading::TradingEngine;
pub use risk::RiskManager;
pub use bot::Bot;
pub use data::Repository;
```

#### Пример правильной архитектуры

```rust
// ============ НЕПРАВИЛЬНО (Big Ball of Mud) ============
// src/api/handlers/orders.rs
use crate::trading::engine::TradingEngineImpl;  // ❌ Прямой импорт

async fn place_order(engine: TradingEngineImpl) { ... }

// ============ ПРАВИЛЬНО (Clean Architecture) ============
// src/shared/traits/trading.rs
#[async_trait]
pub trait TradingService: Send + Sync {
    async fn execute_order(&self, order: OrderRequest) -> Result<Order>;
}

// src/trading/engine.rs
pub struct TradingEngineImpl { ... }

impl TradingService for TradingEngineImpl {
    async fn execute_order(&self, order: OrderRequest) -> Result<Order> { ... }
}

// src/api/handlers/orders.rs
use crate::shared::traits::TradingService;  // ✅ Импорт trait, не implementation

async fn place_order(
    engine: Arc<dyn TradingService>  // ✅ Через trait
) -> Result<Json<Order>> {
    engine.execute_order(...).await
}

// src/main.rs - DI Container
fn build_app() -> Router {
    // Создаём implementation
    let trading_engine = Arc::new(TradingEngineImpl::new(...));
    
    // Внедряем как trait object
    Router::new()
        .route("/api/orders", post(place_order))
        .with_state(trading_engine as Arc<dyn TradingService>)
}
```

#### Правила visibility

```rust
// src/trading/mod.rs
mod engine;           // Private - implementation detail
mod order_book;       // Private
mod execution;        // Private

// Публично экспортируем только trait implementation
pub use engine::TradingEngineImpl;

// НЕ экспортируем внутренние типы!
// pub use order_book::OrderBook;  // ❌ Это создаёт coupling
```

---

### 2.2.2 Внутренняя шина событий (tokio::broadcast)

```
┌─────────────────────────────────────────────────────────────────┐
│                   INTERNAL EVENT BUS                             │
│              (Вместо Kafka для single-binary)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ИСПОЛЬЗОВАТЬ: tokio::broadcast + typed events                  │
│                                                                 │
│  НЕ ИСПОЛЬЗОВАТЬ:                                               │
│  ❌ Kafka (overhead, network)                                   │
│  ❌ Прямые вызовы между модулями для событий                    │
│  ❌ Глобальные static переменные                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Реализация Event Bus

```rust
// src/shared/events/mod.rs
use tokio::sync::broadcast;
use serde::{Serialize, Deserialize};

/// Типизированные события системы
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SystemEvent {
    // Trading events
    OrderCreated(OrderCreatedEvent),
    OrderFilled(OrderFilledEvent),
    OrderCancelled(OrderCancelledEvent),
    
    // Position events
    PositionOpened(PositionOpenedEvent),
    PositionUpdated(PositionUpdatedEvent),
    PositionClosed(PositionClosedEvent),
    
    // Price events
    PriceUpdate(PriceUpdateEvent),
    FundingRateUpdate(FundingRateEvent),
    
    // Bot events
    BotStarted(BotStartedEvent),
    BotStopped(BotStoppedEvent),
    BotError(BotErrorEvent),
    
    // Risk events
    RiskLimitWarning(RiskWarningEvent),
    KillSwitchTriggered(KillSwitchEvent),
    
    // System events
    ExchangeConnected(ExchangeConnectedEvent),
    ExchangeDisconnected(ExchangeDisconnectedEvent),
}

// Event payloads
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderFilledEvent {
    pub order_id: uuid::Uuid,
    pub symbol: String,
    pub side: OrderSide,
    pub price: Decimal,
    pub quantity: Decimal,
    pub timestamp: DateTime<Utc>,
    pub correlation_id: CorrelationId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceUpdateEvent {
    pub symbol: String,
    pub exchange: String,
    pub price: Decimal,
    pub timestamp: DateTime<Utc>,
    pub correlation_id: CorrelationId,
}

/// Корреляционный ID для трассировки
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CorrelationId(pub uuid::Uuid);

impl CorrelationId {
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4())
    }
}

/// Event Bus - единственная точка для публикации/подписки
pub struct EventBus {
    sender: broadcast::Sender<SystemEvent>,
}

impl EventBus {
    pub fn new(buffer_size: usize) -> Self {
        let (sender, _) = broadcast::channel(buffer_size);
        Self { sender }
    }
    
    /// Публикация события (для producers)
    pub fn publish(&self, event: SystemEvent) {
        // Игнорируем ошибку если нет подписчиков
        let _ = self.sender.send(event);
    }
    
    /// Подписка на события (для consumers)
    pub fn subscribe(&self) -> broadcast::Receiver<SystemEvent> {
        self.sender.subscribe()
    }
    
    /// Подписка с фильтрацией по типу
    pub async fn subscribe_filtered<F>(
        &self,
        filter: F,
    ) -> impl futures::Stream<Item = SystemEvent>
    where
        F: Fn(&SystemEvent) -> bool + Send + 'static,
    {
        let mut receiver = self.sender.subscribe();
        async_stream::stream! {
            while let Ok(event) = receiver.recv().await {
                if filter(&event) {
                    yield event;
                }
            }
        }
    }
}

impl Clone for EventBus {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
        }
    }
}
```

#### Использование Event Bus в модулях

```rust
// src/trading/engine.rs
use crate::shared::events::{EventBus, SystemEvent, OrderFilledEvent};

pub struct TradingEngine {
    event_bus: EventBus,
    // ...
}

impl TradingEngine {
    pub async fn execute_order(&self, order: OrderRequest) -> Result<Order> {
        let correlation_id = CorrelationId::new();
        
        // Выполняем ордер
        let filled_order = self.exchange.execute(order).await?;
        
        // Публикуем событие (НЕ вызываем другие модули напрямую!)
        self.event_bus.publish(SystemEvent::OrderFilled(OrderFilledEvent {
            order_id: filled_order.id,
            symbol: filled_order.symbol.clone(),
            side: filled_order.side,
            price: filled_order.price,
            quantity: filled_order.quantity,
            timestamp: Utc::now(),
            correlation_id,
        }));
        
        Ok(filled_order)
    }
}

// src/risk/manager.rs
use crate::shared::events::{EventBus, SystemEvent};

impl RiskManager {
    /// Запуск слушателя событий
    pub fn start_event_listener(&self, event_bus: EventBus) {
        tokio::spawn(async move {
            let mut receiver = event_bus.subscribe();
            
            while let Ok(event) = receiver.recv().await {
                match &event {
                    SystemEvent::OrderFilled(e) => {
                        // Обновляем exposure
                        self.update_exposure(e).await;
                    }
                    SystemEvent::PositionOpened(e) => {
                        // Проверяем risk limits
                        self.check_limits(e).await;
                    }
                    _ => {}
                }
            }
        });
    }
}

// src/data/repository/positions.rs
impl PositionRepository {
    pub fn start_event_listener(&self, event_bus: EventBus) {
        tokio::spawn(async move {
            let mut receiver = event_bus.subscribe();
            
            while let Ok(event) = receiver.recv().await {
                match &event {
                    SystemEvent::PositionOpened(e) => {
                        // Сохраняем в БД
                        self.save_position(e).await;
                    }
                    SystemEvent::PositionClosed(e) => {
                        self.close_position(e).await;
                    }
                    _ => {}
                }
            }
        });
    }
}
```

---

### 2.2.3 Централизованная конфигурация

```
┌─────────────────────────────────────────────────────────────────┐
│                  CONFIGURATION ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ПРИНЦИП: Единственный источник истины для конфигурации         │
│                                                                 │
│  config/                                                        │
│  ├── default.toml        # Базовая конфигурация                 │
│  ├── development.toml    # Development overrides                │
│  ├── production.toml     # Production overrides                 │
│  └── test.toml           # Test overrides                       │
│                                                                 │
│  .env                   # Секреты (НЕ в config files)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Реализация конфигурации

```rust
// src/shared/config/mod.rs
use config::{Config, ConfigError, File, Environment};
use serde::Deserialize;

/// Главный конфиг приложения
#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub app: AppSettings,
    pub api: ApiConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub trading: TradingConfig,
    pub risk: RiskConfig,
    pub exchanges: ExchangesConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AppSettings {
    pub name: String,
    pub environment: Environment,
    pub debug: bool,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Environment {
    Development,
    Production,
    Test,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ApiConfig {
    pub host: String,
    pub port: u16,
    pub cors_origins: Vec<String>,
    pub rate_limit: RateLimitConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connect_timeout_secs: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TradingConfig {
    pub order_timeout_ms: u64,
    pub max_concurrent_orders: usize,
    pub auto_retry: bool,
    pub max_retries: u32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RiskConfig {
    pub max_total_position_usd: Decimal,
    pub max_position_usd_per_symbol: Decimal,
    pub max_leverage: u32,
    pub max_daily_drawdown_percent: Decimal,
    pub enable_kill_switch: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ExchangesConfig {
    pub default_exchange: String,
    pub connection_timeout_ms: u64,
    pub request_timeout_ms: u64,
    pub ws_reconnect_delay_ms: u64,
    pub rate_limits: std::collections::HashMap<String, RateLimitConfig>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LoggingConfig {
    pub level: String,
    pub format: LogFormat,
    pub file: Option<String>,
    pub json: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    Pretty,
    Json,
    Compact,
}

impl AppConfig {
    /// Загрузка конфигурации
    pub fn load() -> Result<Self, ConfigError> {
        let environment = std::env::var("APP_ENV")
            .unwrap_or_else(|_| "development".into());
        
        let config = Config::builder()
            // Базовая конфигурация
            .add_source(File::with_name("config/default"))
            // Environment-specific overrides
            .add_source(File::with_name(&format!("config/{}", environment)).required(false))
            // Environment variables override (для секретов)
            .add_source(Environment::with_prefix("CITARION").separator("__"))
            .build()?;
        
        config.try_deserialize()
    }
    
    /// Проверка environment
    pub fn is_production(&self) -> bool {
        matches!(self.app.environment, Environment::Production)
    }
    
    pub fn is_development(&self) -> bool {
        matches!(self.app.environment, Environment::Development)
    }
}

// Пример config/default.toml
/*
[app]
name = "citarion"
environment = "development"
debug = true

[api]
host = "0.0.0.0"
port = 8080
cors_origins = ["http://localhost:3000"]

[api.rate_limit]
requests_per_second = 100
burst_size = 200

[database]
url = "postgresql://localhost/citarion"
max_connections = 20
min_connections = 5
connect_timeout_secs = 30

[redis]
url = "redis://localhost:6379"
pool_size = 10

[trading]
order_timeout_ms = 5000
max_concurrent_orders = 100
auto_retry = true
max_retries = 3

[risk]
max_total_position_usd = 100000.0
max_position_usd_per_symbol = 10000.0
max_leverage = 10
max_daily_drawdown_percent = 5.0
enable_kill_switch = true

[logging]
level = "info"
format = "pretty"
json = false
*/
```

#### Профили модулей

```rust
// src/trading/mod.rs
use crate::shared::config::AppConfig;

pub struct TradingModule {
    config: TradingConfig,
}

impl TradingModule {
    pub fn from_config(config: &AppConfig) -> Self {
        Self {
            config: config.trading.clone(),
        }
    }
}

// src/risk/mod.rs
pub struct RiskModule {
    config: RiskConfig,
}

impl RiskModule {
    pub fn from_config(config: &AppConfig) -> Self {
        Self {
            config: config.risk.clone(),
        }
    }
}

// src/main.rs - Единая точка инициализации
fn main() {
    // Загружаем конфиг один раз
    let config = AppConfig::load().expect("Failed to load config");
    
    // Создаём модули с их конфигурацией
    let trading = TradingModule::from_config(&config);
    let risk = RiskModule::from_config(&config);
    let exchanges = ExchangesModule::from_config(&config);
    
    // ...
}
```

---

### 2.2.4 Структурированное логирование с корреляцией

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOGGING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ИСПОЛЬЗОВАТЬ: tracing crate с structured logging               │
│                                                                 │
│  ОБЯЗАТЕЛЬНО:                                                   │
│  ✅ Correlation ID через весь пайплайн                         │
│  ✅ Structured fields (НЕ string concatenation)                 │
│  ✅ Different levels per module                                │
│  ✅ JSON format для production                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Настройка tracing

```rust
// src/shared/logging/mod.rs
use tracing_subscriber::{
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, fmt, Layer,
};
use tracing::{Span, Instrument};

/// Инициализация логирования
pub fn init_logging(config: &LoggingConfig) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&config.level));
    
    let fmt_layer = fmt::layer()
        .with_file(true)
        .with_line_number(true)
        .with_thread_ids(true)
        .with_target(true);
    
    // JSON format для production
    let fmt_layer = if config.json || config.format == LogFormat::Json {
        fmt_layer.json().boxed()
    } else {
        fmt_layer.pretty().boxed()
    };
    
    // File output если настроен
    let file_layer = if let Some(ref path) = config.file {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("Failed to open log file");
        
        Some(fmt::layer()
            .with_writer(std::sync::Arc::new(file))
            .json()
            .boxed())
    } else {
        None
    };
    
    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .with(file_layer)
        .init();
}
```

#### Correlation ID middleware

```rust
// src/api/middleware/correlation.rs
use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
};
use headers::Header;
use tracing::{Span, Instrument};
use uuid::Uuid;

static CORRELATION_ID_HEADER: &str = "x-correlation-id";

/// Middleware для установки correlation ID
pub async fn correlation_layer(request: Request, next: Next) -> Response {
    // Получаем или создаём correlation ID
    let correlation_id = request
        .headers()
        .get(CORRELATION_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    
    // Устанавливаем в tracing span
    let span = tracing::info_span!(
        "request",
        correlation_id = %correlation_id,
        method = %request.method(),
        path = %request.uri().path(),
    );
    
    // Выполняем request в span
    let response = next.run(request).instrument(span.clone()).await;
    
    // Добавляем correlation ID в response
    let mut response = response;
    response.headers_mut().insert(
        CORRELATION_ID_HEADER,
        correlation_id.parse().unwrap(),
    );
    
    response
}
```

#### Логирование с structured fields

```rust
// src/trading/engine.rs
use tracing::{info, warn, error, instrument, span, Level};

impl TradingEngine {
    #[instrument(
        name = "trading.execute_order",
        skip(self, order),
        fields(
            symbol = %order.symbol,
            side = ?order.side,
            quantity = %order.quantity,
        )
    )]
    pub async fn execute_order(&self, order: OrderRequest) -> Result<Order> {
        let correlation_id = Span::current().field("correlation_id")
            .map(|v| v.to_string())
            .unwrap_or_default();
        
        info!(
            symbol = %order.symbol,
            side = ?order.side,
            price = %order.price.unwrap_or_default(),
            quantity = %order.quantity,
            "Executing order"
        );
        
        match self.exchange.place_order(order.clone()).await {
            Ok(filled) => {
                info!(
                    order_id = %filled.id,
                    filled_quantity = %filled.filled_quantity,
                    average_price = ?filled.average_price,
                    "Order filled successfully"
                );
                Ok(filled)
            }
            Err(e) => {
                error!(
                    error = %e,
                    symbol = %order.symbol,
                    "Order execution failed"
                );
                Err(e)
            }
        }
    }
}

// src/risk/manager.rs
impl RiskManager {
    #[instrument(
        name = "risk.check_order",
        skip(self, order),
        fields(
            symbol = %order.symbol,
            position_value = %order.quantity * order.price.unwrap_or_default(),
        )
    )]
    pub async fn check_order(&self, order: &OrderRequest) -> Result<()> {
        let position_value = order.quantity * order.price.unwrap_or_default();
        let total_exposure = self.exposure.get_total().await;
        
        info!(
            current_exposure = %total_exposure,
            new_position_value = %position_value,
            max_exposure = %self.config.max_total_position_usd,
            "Checking risk limits"
        );
        
        if total_exposure + position_value > self.config.max_total_position_usd {
            warn!(
                current_exposure = %total_exposure,
                requested = %position_value,
                max = %self.config.max_total_position_usd,
                "Risk limit exceeded"
            );
            return Err(RiskError::TotalExposureExceeded.into());
        }
        
        Ok(())
    }
}
```

#### Формат логов

```json
// Production JSON log example
{
  "timestamp": "2026-01-15T10:30:45.123456Z",
  "level": "INFO",
  "target": "citarion::trading::engine",
  "module_path": "citarion::trading::engine",
  "file": "src/trading/engine.rs",
  "line": 145,
  "span": {
    "name": "trading.execute_order",
    "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
    "method": "POST",
    "path": "/api/orders"
  },
  "fields": {
    "symbol": "BTCUSDT",
    "side": "Buy",
    "price": "67500.00",
    "quantity": "0.1",
    "message": "Executing order"
  }
}
```

---

### 2.2.5 Правила модульной изоляции

```
┌─────────────────────────────────────────────────────────────────┐
│              MODULE ISOLATION CHECKLIST                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  КАЖДЫЙ МОДУЛЬ ДОЛЖЕН:                                          │
│                                                                 │
│  ✅ Иметь чётко определённый публичный API (traits)            │
│  ✅ Скрывать implementation details (private types)            │
│  ✅ Не импортировать другие модули напрямую                     │
│  ✅ Взаимодействовать через EventBus или traits                │
│  ✅ Иметь свой конфигурационный profile                        │
│  ✅ Логировать с correlation_id                                 │
│                                                                 │
│  КАЖДЫЙ МОДУЛЬ НЕ ДОЛЖЕН:                                       │
│                                                                 │
│  ❌ Эксроптировать внутренние типы                             │
│  ❌ Прямо вызывать методы других модулей                       │
│  ❌ Иметь cyclic dependencies                                   │
│  ❌ Использовать global state                                   │
│  ❌ Хардкодить конфигурацию                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### CI проверки архитектуры

```yaml
# .github/workflows/architecture-check.yml
name: Architecture Check

on: [push, pull_request]

jobs:
  check-module-boundaries:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Check forbidden imports
        run: |
          # Check api → trading direct imports
          if grep -r "use crate::trading::" src/api/; then
            echo "❌ Forbidden import: api → trading"
            exit 1
          fi
          
          # Check api → exchanges direct imports  
          if grep -r "use crate::exchanges::" src/api/; then
            echo "❌ Forbidden import: api → exchanges"
            exit 1
          fi
          
          # Check api → risk direct imports
          if grep -r "use crate::risk::" src/api/; then
            echo "❌ Forbidden import: api → risk"
            exit 1
          fi
          
          echo "✅ Module boundaries OK"
      
      - name: Check trait imports
        run: |
          # API should only import traits from shared
          if grep -r "use crate::trading::.*Impl" src/api/; then
            echo "❌ API importing implementation types"
            exit 1
          fi
          
          echo "✅ Trait imports OK"
```

---

## 2.3 Структура Rust проекта

```
citarion-server/
├── Cargo.toml                      # Workspace configuration
├── Cargo.lock
├── .env
├── config/
│   ├── default.toml               # Default configuration
│   ├── production.toml            # Production overrides
│   └── test.toml                  # Test configuration
│
├── src/
│   ├── main.rs                    # Entry point
│   ├── lib.rs                     # Library root
│   │
│   ├── api/                       # API MODULE
│   │   ├── mod.rs
│   │   ├── routes.rs              # Route definitions
│   │   ├── handlers/              # HTTP handlers
│   │   │   ├── mod.rs
│   │   │   ├── account.rs
│   │   │   ├── bots.rs
│   │   │   ├── orders.rs
│   │   │   ├── positions.rs
│   │   │   ├── signals.rs
│   │   │   ├── ohlcv.rs
│   │   │   └── backtesting.rs
│   │   ├── websocket/             # WebSocket handlers
│   │   │   ├── mod.rs
│   │   │   ├── price_stream.rs
│   │   │   ├── order_updates.rs
│   │   │   └── bot_status.rs
│   │   ├── middleware/            # HTTP middleware
│   │   │   ├── mod.rs
│   │   │   ├── auth.rs
│   │   │   ├── rate_limit.rs
│   │   │   └── logging.rs
│   │   └── error.rs               # API error types
│   │
│   ├── trading/                   # TRADING MODULE
│   │   ├── mod.rs
│   │   ├── engine.rs              # Main trading engine
│   │   ├── order_book.rs          # Order book management
│   │   ├── execution.rs           # Order execution
│   │   ├── position.rs            # Position management
│   │   ├── bots/                  # Bot implementations
│   │   │   ├── mod.rs
│   │   │   ├── traits.rs          # Bot trait definitions
│   │   │   ├── grid.rs
│   │   │   ├── dca.rs
│   │   │   ├── bb.rs              # Bollinger Band bot
│   │   │   ├── argus.rs
│   │   │   ├── vision.rs
│   │   │   ├── orion.rs
│   │   │   ├── range.rs
│   │   │   ├── hft.rs
│   │   │   ├── kron.rs
│   │   │   ├── reed.rs
│   │   │   ├── spectrum.rs
│   │   │   ├── equilibrist.rs
│   │   │   ├── architect.rs
│   │   │   ├── frequency.rs
│   │   │   ├── lft.rs
│   │   │   └── mft.rs
│   │   ├── signal_processor.rs    # Signal processing
│   │   └── backtesting/           # Backtesting engine
│   │       ├── mod.rs
│   │       ├── engine.rs
│   │       └── metrics.rs
│   │
│   ├── risk/                      # RISK MODULE
│   │   ├── mod.rs
│   │   ├── manager.rs             # Risk manager
│   │   ├── limits.rs              # Position limits
│   │   ├── exposure.rs            # Exposure tracking
│   │   ├── drawdown.rs            # Drawdown monitoring
│   │   ├── kill_switch.rs         # Emergency stop
│   │   ├── liquidation.rs         # Liquidation protection
│   │   ├── var.rs                 # Value at Risk
│   │   └── ai/                    # AI risk features
│   │       ├── mod.rs
│   │       ├── predictor.rs
│   │       ├── hedger.rs
│   │       └── anomaly.rs
│   │
│   ├── exchanges/                 # EXCHANGES MODULE
│   │   ├── mod.rs
│   │   ├── traits.rs              # Exchange trait
│   │   ├── types.rs               # Common types
│   │   ├── binance/
│   │   │   ├── mod.rs
│   │   │   ├── client.rs
│   │   │   ├── websocket.rs
│   │   │   └── types.rs
│   │   ├── bybit/
│   │   │   ├── mod.rs
│   │   │   ├── client.rs
│   │   │   ├── websocket.rs
│   │   │   └── types.rs
│   │   ├── okx/
│   │   ├── bitget/
│   │   ├── kucoin/
│   │   ├── hyperliquid/
│   │   ├── bingx/
│   │   ├── coinbase/
│   │   ├── huobi/
│   │   ├── bitmex/
│   │   ├── blofin/
│   │   └── circuit_breaker.rs     # Circuit breaker pattern
│   │
│   ├── data/                      # DATA MODULE
│   │   ├── mod.rs
│   │   ├── db.rs                  # Database connection
│   │   ├── redis.rs               # Redis client
│   │   ├── repository/            # Data repositories
│   │   │   ├── mod.rs
│   │   │   ├── ohlcv.rs
│   │   │   ├── trades.rs
│   │   │   ├── positions.rs
│   │   │   ├── signals.rs
│   │   │   ├── bots.rs
│   │   │   ├── funding.rs
│   │   │   └── users.rs
│   │   ├── models/                # Database models
│   │   │   ├── mod.rs
│   │   │   ├── user.rs
│   │   │   ├── account.rs
│   │   │   ├── bot.rs
│   │   │   ├── trade.rs
│   │   │   ├── position.rs
│   │   │   └── signal.rs
│   │   ├── websocket/             # WebSocket managers
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs
│   │   │   └── reconnection.rs
│   │   └── migrations/            # SQL migrations
│   │       └── 001_initial.sql
│   │
│   ├── indicators/                # INDICATORS MODULE
│   │   ├── mod.rs
│   │   ├── traits.rs
│   │   ├── ma.rs                  # Moving averages
│   │   ├── ema.rs
│   │   ├── rsi.rs
│   │   ├── macd.rs
│   │   ├── bollinger.rs
│   │   ├── atr.rs
│   │   ├── supertrend.rs
│   │   ├── ichimoku.rs
│   │   ├── keltner.rs
│   │   ├── vwap.rs
│   │   ├── pivot.rs
│   │   ├── fractals.rs
│   │   ├── heikin_ashi.rs
│   │   ├── renko.rs
│   │   ├── kagi.rs
│   │   ├── point_figure.rs
│   │   └── advanced/              # Advanced indicators
│   │       ├── mod.rs
│   │       ├── squeeze.rs
│   │       ├── wave_trend.rs
│   │       └── kmeans_volatility.rs
│   │
│   ├── ml/                        # ML INTEGRATION MODULE
│   │   ├── mod.rs
│   │   ├── client.rs              # gRPC client to Python ML
│   │   ├── types.rs               # ML types
│   │   └── signal_filter.rs       # ML signal filtering
│   │
│   ├── copy_trading/              # COPY TRADING MODULE
│   │   ├── mod.rs
│   │   ├── follower.rs
│   │   ├── master.rs
│   │   └── risk.rs
│   │
│   ├── notifications/             # NOTIFICATIONS MODULE
│   │   ├── mod.rs
│   │   ├── telegram.rs
│   │   └── alert_system.rs
│   │
│   └── shared/                    # SHARED MODULE
│       ├── mod.rs
│       ├── types.rs               # Common types
│       ├── config.rs              # Configuration
│       ├── errors.rs              # Error types
│       ├── utils.rs               # Utilities
│       ├── decimal.rs             # Decimal handling
│       └── constants.rs           # Constants
│
├── tests/                         # Integration tests
│   ├── api_tests.rs
│   ├── trading_tests.rs
│   ├── exchange_tests.rs
│   └── fixtures/
│
├── benches/                       # Benchmarks
│   └── trading_bench.rs
│
└── proto/                         # Protocol buffers for ML
    └── ml.proto
```

## 2.3 Структура Frontend проекта

```
citarion-frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── index.html
│
├── public/
│   ├── favicon.ico
│   └── icons/
│
├── src/
│   ├── main.tsx                   # Entry point
│   ├── App.tsx                    # Root component
│   │
│   ├── api/                       # API Layer
│   │   ├── client.ts              # Base API client
│   │   ├── websocket.ts           # WebSocket client
│   │   ├── bots.ts
│   │   ├── orders.ts
│   │   ├── positions.ts
│   │   ├── signals.ts
│   │   ├── ohlcv.ts
│   │   └── backtesting.ts
│   │
│   ├── components/                # React Components
│   │   ├── ui/                    # Shadcn/ui components
│   │   ├── chart/                 # Chart components
│   │   │   ├── PriceChart.tsx
│   │   │   ├── MiniChart.tsx
│   │   │   └── OrderMarkers.tsx
│   │   ├── dashboard/             # Dashboard widgets
│   │   ├── bots/                  # Bot management
│   │   ├── trading/               # Trading forms
│   │   ├── positions/             # Position tables
│   │   ├── signals/               # Signal components
│   │   ├── analytics/             # Analytics panels
│   │   └── layout/                # Layout components
│   │
│   ├── hooks/                     # Custom hooks
│   │   ├── useWebSocket.ts
│   │   ├── usePrices.ts
│   │   ├── useBots.ts
│   │   └── usePositions.ts
│   │
│   ├── stores/                    # Zustand stores
│   │   ├── authStore.ts
│   │   ├── tradingStore.ts
│   │   └── uiStore.ts
│   │
│   ├── types/                     # TypeScript types
│   │   ├── bot.ts
│   │   ├── order.ts
│   │   ├── position.ts
│   │   └── signal.ts
│   │
│   └── styles/                    # Styles
│       └── globals.css
│
└── tests/                         # Tests
    └── components/
```

---

# ЧАСТЬ 3: ДЕТАЛЬНЫЕ СПЕЦИФИКАЦИИ

## 3.1 Rust Backend Specifications

### 3.1.1 Зависимости (Cargo.toml)

```toml
[package]
name = "citarion-server"
version = "2.0.0"
edition = "2021"
rust-version = "1.75"

[dependencies]
# Async runtime
tokio = { version = "1.35", features = ["full"] }

# Web framework
axum = { version = "0.7", features = ["ws", "macros"] }
axum-extra = { version = "0.9", features = ["typed-header"] }
tower = { version = "0.4", features = ["full"] }
tower-http = { version = "0.5", features = ["cors", "fs", "trace"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Database
sqlx = { version = "0.7", features = ["runtime-tokio", "postgres", "chrono", "uuid", "rust_decimal"] }
redis = { version = "0.24", features = ["tokio-comp", "connection-manager"] }

# Time-series optimizations
timescaledb-toolkit = "0.1"

# Decimal for financial calculations
rust_decimal = { version = "1.33", features = ["serde-with-str"] }
rust_decimal_macros = "1.33"

# Date/Time
chrono = { version = "0.4", features = ["serde"] }

# UUID
uuid = { version = "1.6", features = ["v4", "serde"] }

# WebSocket
tokio-tungstenite = { version = "0.21", features = ["native-tls"] }
futures-util = "0.3"

# HTTP Client for exchanges
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }
reqwest-websocket = "0.3"

# Cryptography for API signatures
hmac = "0.12"
sha2 = "0.10"
hex = "0.4"
base64 = "0.21"

# Configuration
config = "0.14"
dotenvy = "0.15"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Authentication
jsonwebtoken = "9.2"
argon2 = "0.5"

# gRPC for ML service
tonic = "0.10"
prost = "0.12"

# Async traits
async-trait = "0.1"

# Parallel processing
rayon = "1.8"

# Circuit breaker
resilience4j = "0.1"

# Metrics
prometheus = "0.13"

# Backoff for retries
backoff = { version = "0.4", features = ["tokio"] }

[dependencies.indicators]
# Technical indicators - custom or from crates
ta = "0.5"  # Technical analysis library

[dev-dependencies]
tokio-test = "0.4"
criterion = "0.5"
mockall = "0.12"

[build-dependencies]
tonic-build = "0.10"

[[bin]]
name = "citarion-server"
path = "src/main.rs"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

### 3.1.2 Exchange Trait Specification

```rust
// src/exchanges/traits.rs

use async_trait::async_trait;
use rust_decimal::Decimal;
use chrono::{DateTime, Utc};
use crate::shared::types::{Symbol, TimeFrame};
use crate::shared::errors::Result;

/// Exchange client trait - all exchanges must implement this
#[async_trait]
pub trait ExchangeClient: Send + Sync {
    /// Get exchange name
    fn name(&self) -> &str;
    
    /// Get exchange ID
    fn id(&self) -> &str;
    
    // ============ Market Data ============
    
    /// Get current price for symbol
    async fn get_ticker(&self, symbol: &Symbol) -> Result<Ticker>;
    
    /// Get order book
    async fn get_orderbook(&self, symbol: &Symbol, depth: u32) -> Result<OrderBook>;
    
    /// Get OHLCV candles
    async fn get_klines(
        &self, 
        symbol: &Symbol, 
        interval: TimeFrame, 
        limit: u32,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>
    ) -> Result<Vec<Candle>>;
    
    /// Get recent trades
    async fn get_trades(&self, symbol: &Symbol, limit: u32) -> Result<Vec<Trade>>;
    
    /// Get funding rate (for futures)
    async fn get_funding_rate(&self, symbol: &Symbol) -> Result<FundingRate>;
    
    // ============ Account ============
    
    /// Get account balance
    async fn get_balance(&self) -> Result<Vec<Balance>>;
    
    /// Get open positions
    async fn get_positions(&self) -> Result<Vec<Position>>;
    
    // ============ Trading ============
    
    /// Place order
    async fn place_order(&self, order: OrderRequest) -> Result<Order>;
    
    /// Cancel order
    async fn cancel_order(&self, symbol: &Symbol, order_id: &str) -> Result<Order>;
    
    /// Cancel all orders for symbol
    async fn cancel_all_orders(&self, symbol: Option<&Symbol>) -> Result<Vec<Order>>;
    
    /// Get open orders
    async fn get_open_orders(&self, symbol: Option<&Symbol>) -> Result<Vec<Order>>;
    
    /// Get order by ID
    async fn get_order(&self, symbol: &Symbol, order_id: &str) -> Result<Order>;
    
    /// Modify order
    async fn amend_order(&self, symbol: &Symbol, order_id: &str, params: AmendParams) -> Result<Order>;
    
    // ============ WebSocket ============
    
    /// Subscribe to ticker updates
    async fn subscribe_ticker(&self, symbol: &Symbol) -> Result<()>;
    
    /// Subscribe to order book updates
    async fn subscribe_orderbook(&self, symbol: &Symbol) -> Result<()>;
    
    /// Subscribe to kline updates
    async fn subscribe_klines(&self, symbol: &Symbol, interval: TimeFrame) -> Result<()>;
    
    /// Subscribe to order updates
    async fn subscribe_orders(&self) -> Result<()>;
    
    /// Unsubscribe from all
    async fn unsubscribe_all(&self) -> Result<()>;
    
    // ============ Connection ============
    
    /// Connect to exchange
    async fn connect(&self) -> Result<()>;
    
    /// Disconnect from exchange
    async fn disconnect(&self) -> Result<()>;
    
    /// Check connection status
    fn is_connected(&self) -> bool;
    
    /// Ping exchange
    async fn ping(&self) -> Result<()>;
}

/// Common types used across exchanges
#[derive(Debug, Clone)]
pub struct Ticker {
    pub symbol: Symbol,
    pub last: Decimal,
    pub bid: Decimal,
    pub ask: Decimal,
    pub high_24h: Decimal,
    pub low_24h: Decimal,
    pub volume_24h: Decimal,
    pub change_24h: Decimal,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct OrderBook {
    pub symbol: Symbol,
    pub bids: Vec<(Decimal, Decimal)>,  // (price, size)
    pub asks: Vec<(Decimal, Decimal)>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct Candle {
    pub symbol: Symbol,
    pub interval: TimeFrame,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub volume: Decimal,
    pub open_time: DateTime<Utc>,
    pub close_time: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct OrderRequest {
    pub symbol: Symbol,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub quantity: Decimal,
    pub price: Option<Decimal>,
    pub stop_price: Option<Decimal>,
    pub time_in_force: Option<TimeInForce>,
    pub reduce_only: bool,
    pub client_order_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Order {
    pub id: String,
    pub client_order_id: Option<String>,
    pub symbol: Symbol,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub status: OrderStatus,
    pub price: Decimal,
    pub average_price: Option<Decimal>,
    pub quantity: Decimal,
    pub filled_quantity: Decimal,
    pub remaining_quantity: Decimal,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy)]
pub enum OrderType {
    Market,
    Limit,
    StopMarket,
    StopLimit,
    TakeProfitMarket,
    TakeProfitLimit,
    TrailingStop,
}

#[derive(Debug, Clone, Copy)]
pub enum OrderStatus {
    New,
    PartiallyFilled,
    Filled,
    Canceled,
    Rejected,
    Expired,
}

#[derive(Debug, Clone, Copy)]
pub enum TimeInForce {
    GTC,  // Good Till Cancel
    IOC,  // Immediate Or Cancel
    FOK,  // Fill Or Kill
    GTX,  // Good Till Crossing (Post Only)
}
```

### 3.1.3 Trading Engine Specification

```rust
// src/trading/engine.rs

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use rust_decimal::Decimal;
use chrono::{DateTime, Utc};

use crate::exchanges::{ExchangeClient, ExchangeId};
use crate::risk::RiskManager;
use crate::data::repository::{PositionRepository, OrderRepository};
use crate::trading::bots::{Bot, BotId, BotConfig};
use crate::shared::errors::Result;

/// Main trading engine - coordinates all trading operations
pub struct TradingEngine {
    /// Exchange clients
    exchanges: HashMap<ExchangeId, Arc<dyn ExchangeClient>>,
    
    /// Active bots
    bots: RwLock<HashMap<BotId, Arc<dyn Bot>>>,
    
    /// Risk manager
    risk: Arc<RiskManager>,
    
    /// Position repository
    positions: Arc<PositionRepository>,
    
    /// Order repository
    orders: Arc<OrderRepository>,
    
    /// Configuration
    config: EngineConfig,
}

/// Engine configuration
#[derive(Debug, Clone)]
pub struct EngineConfig {
    /// Maximum concurrent orders
    pub max_concurrent_orders: usize,
    
    /// Order timeout in milliseconds
    pub order_timeout_ms: u64,
    
    /// Enable auto-retry on failures
    pub auto_retry: bool,
    
    /// Maximum retry attempts
    pub max_retries: u32,
    
    /// Enable position sync
    pub position_sync: bool,
    
    /// Position sync interval in seconds
    pub position_sync_interval_secs: u64,
}

impl TradingEngine {
    /// Create new trading engine
    pub fn new(
        exchanges: HashMap<ExchangeId, Arc<dyn ExchangeClient>>,
        risk: Arc<RiskManager>,
        positions: Arc<PositionRepository>,
        orders: Arc<OrderRepository>,
        config: EngineConfig,
    ) -> Self {
        Self {
            exchanges,
            bots: RwLock::new(HashMap::new()),
            risk,
            positions,
            orders,
            config,
        }
    }
    
    /// Execute order with full validation and risk checks
    pub async fn execute_order(&self, request: OrderRequest) -> Result<Order> {
        // 1. Validate order
        self.validate_order(&request).await?;
        
        // 2. Risk check
        self.risk.check_order(&request).await?;
        
        // 3. Get exchange client
        let exchange = self.exchanges.get(&request.exchange_id)
            .ok_or(Error::ExchangeNotFound(request.exchange_id))?;
        
        // 4. Execute order
        let order = exchange.place_order(request).await?;
        
        // 5. Store order
        self.orders.save(&order).await?;
        
        // 6. Update position
        self.positions.update_from_order(&order).await?;
        
        // 7. Check risk limits
        self.risk.check_positions().await?;
        
        Ok(order)
    }
    
    /// Cancel order
    pub async fn cancel_order(&self, exchange_id: ExchangeId, symbol: &Symbol, order_id: &str) -> Result<Order> {
        let exchange = self.exchanges.get(&exchange_id)
            .ok_or(Error::ExchangeNotFound(exchange_id))?;
        
        let order = exchange.cancel_order(symbol, order_id).await?;
        self.orders.update(&order).await?;
        
        Ok(order)
    }
    
    /// Start bot
    pub async fn start_bot(&self, bot_id: BotId) -> Result<()> {
        let mut bots = self.bots.write().await;
        
        let bot = bots.get(&bot_id)
            .ok_or(Error::BotNotFound(bot_id))?;
        
        bot.start().await?;
        
        Ok(())
    }
    
    /// Stop bot
    pub async fn stop_bot(&self, bot_id: BotId) -> Result<()> {
        let bots = self.bots.read().await;
        
        let bot = bots.get(&bot_id)
            .ok_or(Error::BotNotFound(bot_id))?;
        
        bot.stop().await?;
        
        Ok(())
    }
    
    /// Get all positions
    pub async fn get_positions(&self) -> Result<Vec<Position>> {
        self.positions.get_all().await
    }
    
    /// Sync positions from all exchanges
    pub async fn sync_positions(&self) -> Result<()> {
        for (exchange_id, client) in &self.exchanges {
            let positions = client.get_positions().await?;
            self.positions.sync_from_exchange(*exchange_id, positions).await?;
        }
        Ok(())
    }
    
    /// Validate order before execution
    async fn validate_order(&self, request: &OrderRequest) -> Result<()> {
        // Check quantity is positive
        if request.quantity <= Decimal::ZERO {
            return Err(Error::InvalidQuantity(request.quantity));
        }
        
        // Check price for limit orders
        if request.order_type == OrderType::Limit && request.price.is_none() {
            return Err(Error::MissingPriceForLimitOrder);
        }
        
        // Check symbol exists
        // TODO: Implement symbol validation
        
        Ok(())
    }
}
```

### 3.1.4 Bot Trait Specification

```rust
// src/trading/bots/traits.rs

use async_trait::async_trait;
use rust_decimal::Decimal;
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};

use crate::shared::types::{Symbol, ExchangeId};
use crate::shared::errors::Result;
use crate::trading::{Order, Position};

/// Bot trait - all trading bots must implement this
#[async_trait]
pub trait Bot: Send + Sync {
    /// Get bot ID
    fn id(&self) -> BotId;
    
    /// Get bot name
    fn name(&self) -> &str;
    
    /// Get bot type
    fn bot_type(&self) -> BotType;
    
    /// Get current status
    fn status(&self) -> BotStatus;
    
    /// Start the bot
    async fn start(&self) -> Result<()>;
    
    /// Stop the bot
    async fn stop(&self) -> Result<()>;
    
    /// Pause the bot (keep positions, stop trading)
    async fn pause(&self) -> Result<()>;
    
    /// Resume the bot
    async fn resume(&self) -> Result<()>;
    
    /// Get current positions managed by this bot
    async fn get_positions(&self) -> Result<Vec<Position>>;
    
    /// Get statistics
    fn get_stats(&self) -> BotStats;
    
    /// Get configuration
    fn get_config(&self) -> &BotConfig;
    
    /// Update configuration (requires restart)
    async fn update_config(&mut self, config: BotConfig) -> Result<()>;
    
    /// Process tick update
    async fn on_tick(&self, tick: Tick) -> Result<()>;
    
    /// Process kline update
    async fn on_kline(&self, kline: Candle) -> Result<()>;
    
    /// Process signal
    async fn on_signal(&self, signal: Signal) -> Result<()>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BotType {
    Grid,
    DCA,
    BB,         // Bollinger Band
    Argus,      // Order book analysis
    Vision,     // ML-based
    Orion,      // Hedging
    Range,
    HFT,
    Kron,       // Market making
    Reed,       // Mean reversion
    Spectrum,   // Multi-strategy
    Equilibrist,// Balance-based
    Architect,  // Portfolio builder
    Frequency,  // Signal frequency
    LFT,        // Low frequency
    MFT,        // Medium frequency
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BotStatus {
    Stopped,
    Starting,
    Running,
    Pausing,
    Paused,
    Stopping,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotConfig {
    pub id: BotId,
    pub name: String,
    pub bot_type: BotType,
    pub exchange_id: ExchangeId,
    pub symbol: Symbol,
    pub leverage: u32,
    pub position_size: Decimal,
    pub max_positions: u32,
    pub risk_per_trade: Decimal,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default)]
pub struct BotStats {
    pub total_trades: u64,
    pub winning_trades: u64,
    pub losing_trades: u64,
    pub total_pnl: Decimal,
    pub total_pnl_percent: Decimal,
    pub win_rate: Decimal,
    pub max_drawdown: Decimal,
    pub sharpe_ratio: Option<Decimal>,
    pub profit_factor: Decimal,
    pub average_win: Decimal,
    pub average_loss: Decimal,
    pub largest_win: Decimal,
    pub largest_loss: Decimal,
    pub average_holding_time_secs: u64,
    pub started_at: Option<DateTime<Utc>>,
    pub last_trade_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BotId(pub uuid::Uuid);

impl BotId {
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4())
    }
}
```

### 3.1.5 Risk Manager Specification

```rust
// src/risk/manager.rs

use std::sync::Arc;
use rust_decimal::Decimal;
use chrono::{DateTime, Utc};

use crate::trading::OrderRequest;
use crate::shared::types::{ExchangeId, Symbol};
use crate::shared::errors::{Result, RiskError};

/// Risk manager - validates all orders before execution
pub struct RiskManager {
    config: RiskConfig,
    limits: RiskLimits,
    exposure: ExposureTracker,
    drawdown: DrawdownMonitor,
}

#[derive(Debug, Clone)]
pub struct RiskConfig {
    /// Maximum total position size in USD
    pub max_total_position_usd: Decimal,
    
    /// Maximum position size per symbol in USD
    pub max_position_usd_per_symbol: Decimal,
    
    /// Maximum leverage
    pub max_leverage: u32,
    
    /// Maximum daily drawdown percentage
    pub max_daily_drawdown_percent: Decimal,
    
    /// Maximum total drawdown percentage
    pub max_total_drawdown_percent: Decimal,
    
    /// Maximum orders per minute
    pub max_orders_per_minute: u32,
    
    /// Maximum orders per hour
    pub max_orders_per_hour: u32,
    
    /// Enable kill switch on max drawdown
    pub enable_kill_switch: bool,
}

#[derive(Debug, Clone)]
pub struct RiskLimits {
    /// Position limits per exchange
    exchange_limits: HashMap<ExchangeId, ExchangeLimit>,
    
    /// Position limits per symbol
    symbol_limits: HashMap<Symbol, SymbolLimit>,
}

#[derive(Debug, Clone)]
pub struct ExchangeLimit {
    max_position_usd: Decimal,
    max_orders: u32,
    current_position_usd: Decimal,
    current_orders: u32,
}

#[derive(Debug, Clone)]
pub struct SymbolLimit {
    max_position_usd: Decimal,
    max_leverage: u32,
    current_position_usd: Decimal,
}

impl RiskManager {
    pub fn new(config: RiskConfig) -> Self {
        Self {
            config,
            limits: RiskLimits::default(),
            exposure: ExposureTracker::new(),
            drawdown: DrawdownMonitor::new(),
        }
    }
    
    /// Check order against all risk limits
    pub async fn check_order(&self, order: &OrderRequest) -> Result<()> {
        // 1. Check position size
        self.check_position_size(order)?;
        
        // 2. Check leverage
        self.check_leverage(order)?;
        
        // 3. Check exposure
        self.check_exposure(order)?;
        
        // 4. Check drawdown
        self.check_drawdown()?;
        
        // 5. Check rate limits
        self.check_rate_limits()?;
        
        Ok(())
    }
    
    /// Check position size limits
    fn check_position_size(&self, order: &OrderRequest) -> Result<()> {
        let position_value = order.quantity * order.price.unwrap_or(Decimal::ZERO);
        
        if position_value > self.config.max_position_usd_per_symbol {
            return Err(RiskError::PositionSizeExceeded {
                requested: position_value,
                max: self.config.max_position_usd_per_symbol,
            }.into());
        }
        
        Ok(())
    }
    
    /// Check leverage limits
    fn check_leverage(&self, order: &OrderRequest) -> Result<()> {
        if order.leverage > self.config.max_leverage {
            return Err(RiskError::LeverageExceeded {
                requested: order.leverage,
                max: self.config.max_leverage,
            }.into());
        }
        
        Ok(())
    }
    
    /// Check total exposure
    fn check_exposure(&self, order: &OrderRequest) -> Result<()> {
        let total_exposure = self.exposure.get_total();
        let new_exposure = total_exposure + order.quantity * order.price.unwrap_or(Decimal::ZERO);
        
        if new_exposure > self.config.max_total_position_usd {
            return Err(RiskError::TotalExposureExceeded {
                current: total_exposure,
                requested: new_exposure,
                max: self.config.max_total_position_usd,
            }.into());
        }
        
        Ok(())
    }
    
    /// Check drawdown limits
    fn check_drawdown(&self) -> Result<()> {
        let daily_dd = self.drawdown.get_daily_drawdown();
        
        if daily_dd > self.config.max_daily_drawdown_percent {
            return Err(RiskError::DailyDrawdownExceeded {
                current: daily_dd,
                max: self.config.max_daily_drawdown_percent,
            }.into());
        }
        
        let total_dd = self.drawdown.get_total_drawdown();
        
        if total_dd > self.config.max_total_drawdown_percent {
            if self.config.enable_kill_switch {
                // Trigger kill switch
                self.trigger_kill_switch().await?;
            }
            
            return Err(RiskError::TotalDrawdownExceeded {
                current: total_dd,
                max: self.config.max_total_drawdown_percent,
            }.into());
        }
        
        Ok(())
    }
    
    /// Trigger emergency kill switch
    async fn trigger_kill_switch(&self) -> Result<()> {
        tracing::error!("KILL SWITCH TRIGGERED - Stopping all trading");
        
        // 1. Stop all bots
        // 2. Cancel all orders
        // 3. Close all positions (optional)
        // 4. Send notifications
        
        Ok(())
    }
}
```

### 3.1.6 Database Schema (TimescaleDB)

```sql
-- 001_initial.sql

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============ USERS & AUTH ============

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    password_hash VARCHAR(255),
    current_mode VARCHAR(10) DEFAULT 'DEMO',
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    permissions JSONB DEFAULT '["trade:read", "trade:write"]',
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- ============ ACCOUNTS & EXCHANGES ============

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_type VARCHAR(10) DEFAULT 'DEMO',
    exchange_id VARCHAR(20) NOT NULL,
    exchange_type VARCHAR(20) DEFAULT 'spot',
    exchange_name VARCHAR(50) NOT NULL,
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    api_passphrase_encrypted TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_accounts_exchange ON accounts(exchange_id);

-- ============ OHLCV (Time-series) ============

CREATE TABLE ohlcv (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    exchange_id VARCHAR(20) NOT NULL,
    interval VARCHAR(10) NOT NULL,
    open NUMERIC(20, 8) NOT NULL,
    high NUMERIC(20, 8) NOT NULL,
    low NUMERIC(20, 8) NOT NULL,
    close NUMERIC(20, 8) NOT NULL,
    volume NUMERIC(30, 8) NOT NULL
);

-- Convert to hypertable
SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE);

-- Indexes for common queries
CREATE INDEX idx_ohlcv_symbol_exchange ON ohlcv(symbol, exchange_id, time DESC);
CREATE INDEX idx_ohlcv_interval ON ohlcv(interval, time DESC);

-- Continuous aggregates for different timeframes
CREATE MATERIALIZED VIEW ohlcv_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    symbol,
    exchange_id,
    first(open, time) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close, time) AS close,
    sum(volume) AS volume
FROM ohlcv
WHERE interval = '1m'
GROUP BY bucket, symbol, exchange_id
WITH DATA;

CREATE MATERIALIZED VIEW ohlcv_1d
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    symbol,
    exchange_id,
    first(open, time) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close, time) AS close,
    sum(volume) AS volume
FROM ohlcv
WHERE interval = '1h'
GROUP BY bucket, symbol, exchange_id
WITH DATA;

-- ============ TRADES ============

CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    exchange_id VARCHAR(20) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    price NUMERIC(20, 8) NOT NULL,
    quantity NUMERIC(30, 8) NOT NULL,
    quote_quantity NUMERIC(30, 8),
    fee NUMERIC(30, 8),
    fee_currency VARCHAR(20),
    pnl NUMERIC(30, 8),
    realized_pnl NUMERIC(30, 8),
    exchange_order_id VARCHAR(100),
    client_order_id VARCHAR(100),
    bot_id UUID,
    executed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable
SELECT create_hypertable('trades', 'executed_at', if_not_exists => TRUE);

CREATE INDEX idx_trades_user ON trades(user_id, executed_at DESC);
CREATE INDEX idx_trades_symbol ON trades(symbol, executed_at DESC);
CREATE INDEX idx_trades_bot ON trades(bot_id, executed_at DESC);

-- ============ POSITIONS ============

CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    exchange_id VARCHAR(20) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    size NUMERIC(30, 8) NOT NULL,
    entry_price NUMERIC(20, 8) NOT NULL,
    mark_price NUMERIC(20, 8),
    liquidation_price NUMERIC(20, 8),
    leverage INTEGER DEFAULT 1,
    margin NUMERIC(30, 8),
    unrealized_pnl NUMERIC(30, 8),
    realized_pnl NUMERIC(30, 8) DEFAULT 0,
    bot_id UUID,
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_user ON positions(user_id);
CREATE INDEX idx_positions_open ON positions(user_id, closed_at) WHERE closed_at IS NULL;
CREATE INDEX idx_positions_symbol ON positions(exchange_id, symbol);

-- ============ ORDERS ============

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    exchange_id VARCHAR(20) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    price NUMERIC(20, 8),
    average_price NUMERIC(20, 8),
    quantity NUMERIC(30, 8) NOT NULL,
    filled_quantity NUMERIC(30, 8) DEFAULT 0,
    stop_price NUMERIC(20, 8),
    time_in_force VARCHAR(10),
    reduce_only BOOLEAN DEFAULT FALSE,
    exchange_order_id VARCHAR(100),
    client_order_id VARCHAR(100),
    bot_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX idx_orders_exchange ON orders(exchange_order_id);

-- ============ BOTS ============

CREATE TABLE bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    bot_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'stopped',
    symbol VARCHAR(20) NOT NULL,
    config JSONB NOT NULL,
    stats JSONB DEFAULT '{}',
    leverage INTEGER DEFAULT 1,
    position_size NUMERIC(30, 8),
    enabled BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bots_user ON bots(user_id);
CREATE INDEX idx_bots_status ON bots(status);
CREATE INDEX idx_bots_type ON bots(bot_type);

-- ============ SIGNALS ============

CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    exchange_id VARCHAR(20),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    signal_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    entry_price NUMERIC(20, 8),
    target_price NUMERIC(20, 8),
    stop_loss NUMERIC(20, 8),
    leverage INTEGER DEFAULT 1,
    confidence NUMERIC(5, 2),
    source VARCHAR(100),
    provider VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_user ON signals(user_id, created_at DESC);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_symbol ON signals(symbol, created_at DESC);

-- ============ FUNDING RATES ============

CREATE TABLE funding_rates (
    time TIMESTAMPTZ NOT NULL,
    exchange_id VARCHAR(20) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    rate NUMERIC(10, 6) NOT NULL,
    next_funding_time TIMESTAMPTZ
);

SELECT create_hypertable('funding_rates', 'time', if_not_exists => TRUE);

CREATE INDEX idx_funding_symbol ON funding_rates(exchange_id, symbol, time DESC);

-- ============ AUDIT LOG ============

CREATE TABLE audit_log (
    time TIMESTAMPTZ NOT NULL,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT
);

SELECT create_hypertable('audit_log', 'time', if_not_exists => TRUE);

CREATE INDEX idx_audit_user ON audit_log(user_id, time DESC);
CREATE INDEX idx_audit_action ON audit_log(action, time DESC);

-- ============ COMPRESSION POLICIES ============

-- Compress old data
ALTER TABLE ohlcv SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol, exchange_id, interval'
);

SELECT add_compression_policy('ohlcv', INTERVAL '30 days');

ALTER TABLE trades SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'user_id, symbol'
);

SELECT add_compression_policy('trades', INTERVAL '90 days');

-- ============ RETENTION POLICIES ============

-- Keep 1-minute data for 7 days
SELECT add_retention_policy('ohlcv', INTERVAL '7 days', hypetable => 'ohlcv', if_not_exists => TRUE);

-- Keep funding rates for 1 year
SELECT add_retention_policy('funding_rates', INTERVAL '1 year', if_not_exists => TRUE);
```

---

## 3.2 Frontend Specifications

### 3.2.1 Зависимости (package.json)

```json
{
  "name": "citarion-frontend",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.21.0",
    "@tanstack/react-query": "^5.82.0",
    "@tanstack/react-table": "^8.21.3",
    "zustand": "^4.4.7",
    "lightweight-charts": "^5.1.0",
    "lucide-react": "^0.525.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.2.0",
    "@radix-ui/react-accordion": "^1.2.11",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slider": "^1.3.5",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-tooltip": "^1.2.7",
    "date-fns": "^4.1.0",
    "decimal.js": "^10.4.3"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^6.16.0",
    "@typescript-eslint/parser": "^6.16.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.56.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.32",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.3.3",
    "vite": "^6.0.0",
    "vitest": "^2.0.0"
  }
}
```

### 3.2.2 API Client Specification

```typescript
// src/api/client.ts

import { QueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(response.status, error.message || 'Request failed');
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const apiClient = new ApiClient();
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});
```

### 3.2.3 WebSocket Client Specification

```typescript
// src/api/websocket.ts

type MessageHandler = (data: unknown) => void;
type ConnectionHandler = () => void;
type ErrorHandler = (error: Event) => void;

export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private onConnect: ConnectionHandler | null = null;
  private onDisconnect: ConnectionHandler | null = null;
  private onError: ErrorHandler | null = null;
  private pingInterval: number | null = null;

  constructor(url: string = `ws://localhost:8080/ws`) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.reconnectAttempts = 0;
        this.startPing();
        this.onConnect?.();
        resolve();
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this.stopPing();
        this.onDisconnect?.();
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.onError?.(error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };
    });
  }

  disconnect() {
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }

  private startPing() {
    this.pingInterval = window.setInterval(() => {
      this.send('ping', {});
    }, 30000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  private handleMessage(message: { type: string; data: unknown }) {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message.data));
    }
  }

  subscribe(type: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.get(type)?.delete(handler);
    };
  }

  send(type: string, data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  // Subscribe to specific channels
  subscribeToTicker(symbol: string, handler: MessageHandler): () => void {
    this.send('subscribe', { channel: 'ticker', symbol });
    return this.subscribe(`ticker:${symbol}`, handler);
  }

  subscribeToKlines(symbol: string, interval: string, handler: MessageHandler): () => void {
    this.send('subscribe', { channel: 'klines', symbol, interval });
    return this.subscribe(`klines:${symbol}:${interval}`, handler);
  }

  subscribeToOrders(handler: MessageHandler): () => void {
    this.send('subscribe', { channel: 'orders' });
    return this.subscribe('orders', handler);
  }

  subscribeToPositions(handler: MessageHandler): () => void {
    this.send('subscribe', { channel: 'positions' });
    return this.subscribe('positions', handler);
  }
}

export const wsClient = new WebSocketClient();
```

---

## 3.3 API Endpoints Specification

### 3.3.1 REST API Endpoints

```
┌─────────────────────────────────────────────────────────────────┐
│                      REST API Endpoints                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AUTH                                                           │
│  POST   /api/auth/login           - Login                       │
│  POST   /api/auth/logout          - Logout                      │
│  POST   /api/auth/refresh         - Refresh token               │
│  POST   /api/auth/2fa/enable      - Enable 2FA                  │
│  POST   /api/auth/2fa/verify      - Verify 2FA                  │
│                                                                 │
│  ACCOUNT                                                        │
│  GET    /api/account              - Get current account         │
│  GET    /api/accounts             - List all accounts           │
│  POST   /api/accounts             - Create account              │
│  PUT    /api/accounts/:id         - Update account              │
│  DELETE /api/accounts/:id         - Delete account              │
│  POST   /api/accounts/:id/connect - Connect exchange            │
│  GET    /api/accounts/:id/balance - Get balance                 │
│                                                                 │
│  OHLCV                                                          │
│  GET    /api/ohlcv                - Get OHLCV data              │
│  GET    /api/ohlcv/latest         - Get latest candles          │
│  GET    /api/ticker/:symbol       - Get ticker                  │
│  GET    /api/orderbook/:symbol    - Get orderbook               │
│                                                                 │
│  TRADING                                                        │
│  POST   /api/orders               - Place order                 │
│  DELETE /api/orders/:id           - Cancel order                │
│  GET    /api/orders               - List orders                 │
│  GET    /api/orders/:id           - Get order                   │
│  PUT    /api/orders/:id           - Amend order                 │
│  GET    /api/positions            - List positions              │
│  GET    /api/positions/:id        - Get position                │
│  POST   /api/positions/:id/close  - Close position              │
│                                                                 │
│  BOTS                                                           │
│  GET    /api/bots                 - List bots                   │
│  POST   /api/bots                 - Create bot                  │
│  GET    /api/bots/:id             - Get bot                     │
│  PUT    /api/bots/:id             - Update bot                  │
│  DELETE /api/bots/:id             - Delete bot                  │
│  POST   /api/bots/:id/start       - Start bot                   │
│  POST   /api/bots/:id/stop        - Stop bot                    │
│  POST   /api/bots/:id/pause       - Pause bot                   │
│  GET    /api/bots/:id/stats       - Get bot stats               │
│  GET    /api/bots/:id/positions   - Get bot positions           │
│  GET    /api/bots/:id/trades      - Get bot trades              │
│                                                                 │
│  SIGNALS                                                        │
│  GET    /api/signals              - List signals                │
│  POST   /api/signals              - Create signal               │
│  GET    /api/signals/:id          - Get signal                  │
│  PUT    /api/signals/:id          - Update signal               │
│  DELETE /api/signals/:id          - Delete signal               │
│  POST   /api/signals/:id/execute  - Execute signal              │
│                                                                 │
│  BACKTESTING                                                    │
│  POST   /api/backtest             - Run backtest                │
│  GET    /api/backtest/:id         - Get backtest result         │
│  GET    /api/backtest/:id/trades  - Get backtest trades         │
│                                                                 │
│  RISK                                                           │
│  GET    /api/risk/limits          - Get risk limits             │
│  PUT    /api/risk/limits          - Update risk limits          │
│  GET    /api/risk/exposure        - Get exposure                │
│  GET    /api/risk/drawdown        - Get drawdown                │
│  POST   /api/risk/kill-switch     - Trigger kill switch         │
│                                                                 │
│  NOTIFICATIONS                                                  │
│  GET    /api/notifications        - List notifications          │
│  POST   /api/notifications/read   - Mark as read                │
│  POST   /api/notifications/settings - Update settings           │
│                                                                 │
│  FUNDING                                                        │
│  GET    /api/funding               - Get funding rates          │
│  GET    /api/funding/history       - Get funding history        │
│                                                                 │
│  TELEGRAM                                                       │
│  POST   /api/telegram/link        - Link Telegram               │
│  DELETE /api/telegram/unlink      - Unlink Telegram             │
│  GET    /api/telegram/status      - Get Telegram status         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3.2 WebSocket Channels

```
┌─────────────────────────────────────────────────────────────────┐
│                    WebSocket Channels                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SUBSCRIPTION                                                   │
│  { "type": "subscribe", "channel": "ticker", "symbol": "BTCUSDT" }│
│  { "type": "subscribe", "channel": "klines", "symbol": "BTCUSDT"│
│    , "interval": "1m" }                                         │
│  { "type": "subscribe", "channel": "orderbook", "symbol": "..." }│
│  { "type": "subscribe", "channel": "orders" }                   │
│  { "type": "subscribe", "channel": "positions" }                │
│  { "type": "subscribe", "channel": "bot_status", "bot_id": "..."│
│  }                                                              │
│                                                                 │
│  MESSAGES (Server → Client)                                     │
│                                                                 │
│  ticker:{symbol}                                                │
│  {                                                              │
│    "type": "ticker:BTCUSDT",                                    │
│    "data": {                                                    │
│      "symbol": "BTCUSDT",                                       │
│      "last": "67500.00",                                        │
│      "bid": "67499.50",                                         │
│      "ask": "67500.50",                                         │
│      "change_24h": "2.5",                                       │
│      "timestamp": "2026-01-15T10:30:00Z"                        │
│    }                                                            │
│  }                                                              │
│                                                                 │
│  klines:{symbol}:{interval}                                     │
│  {                                                              │
│    "type": "klines:BTCUSDT:1m",                                 │
│    "data": {                                                    │
│      "symbol": "BTCUSDT",                                       │
│      "interval": "1m",                                          │
│      "open": "67490.00",                                        │
│      "high": "67505.00",                                        │
│      "low": "67485.00",                                         │
│      "close": "67500.00",                                       │
│      "volume": "125.5",                                         │
│      "open_time": "2026-01-15T10:29:00Z",                       │
│      "close_time": "2026-01-15T10:30:00Z"                       │
│    }                                                            │
│  }                                                              │
│                                                                 │
│  orders                                                         │
│  {                                                              │
│    "type": "orders",                                            │
│    "data": {                                                    │
│      "event": "filled",                                         │
│      "order": { ... }                                           │
│    }                                                            │
│  }                                                              │
│                                                                 │
│  positions                                                      │
│  {                                                              │
│    "type": "positions",                                         │
│    "data": {                                                    │
│      "event": "opened" | "updated" | "closed",                  │
│      "position": { ... }                                        │
│    }                                                            │
│  }                                                              │
│                                                                 │
│  bot_status:{bot_id}                                            │
│  {                                                              │
│    "type": "bot_status:...",                                    │
│    "data": {                                                    │
│      "status": "running" | "paused" | "stopped" | "error",      │
│      "stats": { ... },                                          │
│      "last_trade": { ... }                                      │
│    }                                                            │
│  }                                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# ЧАСТЬ 4: ПЛАН МИГРАЦИИ

## 4.1 Фазы миграции

```
┌─────────────────────────────────────────────────────────────────┐
│                    Migration Timeline                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: Foundation (Weeks 1-4)                                │
│  ├── Rust project setup                                        │
│  ├── TimescaleDB setup                                         │
│  ├── Redis setup                                               │
│  ├── Basic API server                                          │
│  └── Auth system                                               │
│                                                                 │
│  PHASE 2: Core Trading (Weeks 5-10)                             │
│  ├── Exchange clients (Binance, Bybit, OKX)                    │
│  ├── Order execution engine                                    │
│  ├── Position management                                       │
│  ├── WebSocket infrastructure                                  │
│  └── Risk management basics                                    │
│                                                                 │
│  PHASE 3: Bots Migration (Weeks 11-16)                          │
│  ├── Grid bot                                                  │
│  ├── DCA bot                                                   │
│  ├── BB bot                                                    │
│  ├── Argus bot                                                 │
│  └── Other bots                                                │
│                                                                 │
│  PHASE 4: Frontend Migration (Weeks 17-20)                      │
│  ├── Vite + React setup                                        │
│  ├── Component migration                                       │
│  ├── API integration                                           │
│  └── WebSocket integration                                     │
│                                                                 │
│  PHASE 5: ML Integration (Weeks 21-22)                          │
│  ├── Python ML service setup                                   │
│  ├── gRPC integration                                          │
│  └── Signal filtering                                          │
│                                                                 │
│  PHASE 6: Testing & Deployment (Weeks 23-26)                    │
│  ├── Integration testing                                       │
│  ├── Performance testing                                       │
│  ├── Security audit                                            │
│  └── Production deployment                                     │
│                                                                 │
│  TOTAL: 26 weeks (~6 months)                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 4.2 Детальный план по фазам

### PHASE 1: Foundation (Weeks 1-4)

#### Week 1: Project Setup

```
Задачи:
├── Создать Rust проект (cargo init)
├── Настроить Cargo.toml с зависимостями
├── Создать структуру директорий (modules)
├── Настроить конфигурацию (config/)
├── Создать .env template
├── Настроить logging (tracing)
└── Создать базовые типы ошибок

Артефакты:
├── citarion-server/Cargo.toml
├── citarion-server/src/main.rs
├── citarion-server/src/lib.rs
├── citarion-server/config/default.toml
└── citarion-server/.env.example
```

#### Week 2: Database Setup

```
Задачи:
├── Установить TimescaleDB (Docker или локально)
├── Создать схему БД (migrations)
├── Настроить Redis
├── Создать database connection pool
├── Реализовать базовые repository patterns
└── Создать models для User, Account

Артефакты:
├── src/data/db.rs
├── src/data/redis.rs
├── src/data/migrations/001_initial.sql
├── src/data/models/user.rs
└── src/data/models/account.rs
```

#### Week 3: API Server

```
Задачи:
├── Настроить Axum server
├── Создать middleware (logging, CORS)
├── Реализовать health check endpoint
├── Создать базовые error handling
├── Настроить graceful shutdown
└── Создать API documentation (OpenAPI)

Артефакты:
├── src/api/routes.rs
├── src/api/handlers/health.rs
├── src/api/middleware/mod.rs
├── src/api/error.rs
└── openapi.yaml
```

#### Week 4: Authentication

```
Задачи:
├── Реализовать JWT authentication
├── Создать login/logout endpoints
├── Реализовать API key authentication
├── Добавить 2FA support (TOTP)
├── Создать session management
└── Написать auth tests

Артефакты:
├── src/api/handlers/auth.rs
├── src/api/middleware/auth.rs
├── src/shared/auth/jwt.rs
├── src/shared/auth/totp.rs
└── tests/auth_tests.rs
```

### PHASE 2: Core Trading (Weeks 5-10)

#### Week 5-6: Exchange Clients (Binance)

```
Задачи:
├── Создать Exchange trait
├── Реализовать Binance REST client
│   ├── Authentication (HMAC)
│   ├── Market data endpoints
│   ├── Trading endpoints
│   └── Account endpoints
├── Реализовать Binance WebSocket client
│   ├── Connection management
│   ├── Subscription handling
│   └── Reconnection logic
└── Создать types для Binance API

Артефакты:
├── src/exchanges/traits.rs
├── src/exchanges/types.rs
├── src/exchanges/binance/mod.rs
├── src/exchanges/binance/client.rs
├── src/exchanges/binance/websocket.rs
└── src/exchanges/binance/types.rs
```

#### Week 7: Exchange Clients (Bybit, OKX)

```
Задачи:
├── Реализовать Bybit client
├── Реализовать OKX client
├── Создать circuit breaker pattern
├── Реализовать rate limiting
├── Добавить retry logic
└── Создать exchange factory

Артефакты:
├── src/exchanges/bybit/*
├── src/exchanges/okx/*
├── src/exchanges/circuit_breaker.rs
└── src/exchanges/factory.rs
```

#### Week 8: Trading Engine

```
Задачи:
├── Создать TradingEngine struct
├── Реализовать order execution
├── Создать OrderBook management
├── Реализовать position tracking
├── Добавить order validation
└── Создать execution metrics

Артефакты:
├── src/trading/engine.rs
├── src/trading/order_book.rs
├── src/trading/execution.rs
├── src/trading/position.rs
└── src/trading/metrics.rs
```

#### Week 9: WebSocket Infrastructure

```
Задачи:
├── Создать WebSocket server (axum)
├── Реализовать subscription manager
├── Добавить broadcast channels
├── Реализовать price streaming
├── Добавить order updates streaming
└── Создать WebSocket metrics

Артефакты:
├── src/api/websocket/mod.rs
├── src/api/websocket/manager.rs
├── src/api/websocket/channels.rs
└── src/api/websocket/broadcast.rs
```

#### Week 10: Risk Management Basics

```
Задачи:
├── Создать RiskManager struct
├── Реализовать position limits
├── Добавить exposure tracking
├── Реализовать drawdown monitoring
├── Создать kill switch
└── Добавить risk metrics

Артефакты:
├── src/risk/manager.rs
├── src/risk/limits.rs
├── src/risk/exposure.rs
├── src/risk/drawdown.rs
└── src/risk/kill_switch.rs
```

### PHASE 3: Bots Migration (Weeks 11-16)

#### Week 11-12: Grid Bot

```
Задачи:
├── Создать Bot trait
├── Реализовать Grid bot logic
├── Добавить grid level calculation
├── Реализовать order placement logic
├── Добавить profit taking
└── Создать bot state persistence

Артефакты:
├── src/trading/bots/traits.rs
├── src/trading/bots/grid.rs
└── src/data/repository/bots.rs
```

#### Week 13: DCA & BB Bots

```
Задачи:
├── Реализовать DCA bot
├── Реализовать BB (Bollinger Band) bot
├── Создать indicator calculations
├── Добавить signal generation
└── Реализовать bot statistics

Артефакты:
├── src/trading/bots/dca.rs
├── src/trading/bots/bb.rs
├── src/indicators/bollinger.rs
└── src/trading/bots/stats.rs
```

#### Week 14-15: Advanced Bots

```
Задачи:
├── Реализовать Argus bot (order book analysis)
├── Реализовать Orion bot (hedging)
├── Реализовать Range bot
├── Реализовать Vision bot
├── Реализовать HFT bot
└── Добавить bot management API

Артефакты:
├── src/trading/bots/argus.rs
├── src/trading/bots/orion.rs
├── src/trading/bots/range.rs
├── src/trading/bots/vision.rs
├── src/trading/bots/hft.rs
└── src/api/handlers/bots.rs
```

#### Week 16: Institutional Bots

```
Задачи:
├── Реализовать Kron bot
├── Реализовать Reed bot
├── Реализовать Spectrum bot
├── Реализовать Equilibrist bot
├── Реализовать Architect bot
└── Создать bot factory

Артефакты:
├── src/trading/bots/kron.rs
├── src/trading/bots/reed.rs
├── src/trading/bots/spectrum.rs
├── src/trading/bots/equilibrist.rs
├── src/trading/bots/architect.rs
└── src/trading/bots/factory.rs
```

### PHASE 4: Frontend Migration (Weeks 17-20)

#### Week 17: Vite Setup

```
Задачи:
├── Создать Vite + React проект
├── Настроить TypeScript
├── Добавить Tailwind CSS
├── Установить shadcn/ui components
├── Настроить routing (react-router)
└── Создать базовый layout

Артефакты:
├── citarion-frontend/package.json
├── citarion-frontend/vite.config.ts
├── citarion-frontend/src/main.tsx
├── citarion-frontend/src/App.tsx
└── citarion-frontend/src/components/layout/
```

#### Week 18: API Integration

```
Задачи:
├── Создать API client
├── Реализовать WebSocket client
├── Добавить TanStack Query setup
├── Создать API hooks
├── Добавить error handling
└── Создать auth context

Артефакты:
├── src/api/client.ts
├── src/api/websocket.ts
├── src/hooks/useAuth.ts
├── src/hooks/useBots.ts
├── src/hooks/usePositions.ts
└── src/stores/authStore.ts
```

#### Week 19: Components Migration

```
Задачи:
├── Мигрировать UI components (shadcn)
├── Мигрировать chart components
├── Мигрировать dashboard widgets
├── Мигрировать bot management panels
├── Мигрировать trading forms
└── Мигрировать tables

Артефакты:
├── src/components/ui/
├── src/components/chart/
├── src/components/dashboard/
├── src/components/bots/
├── src/components/trading/
└── src/components/positions/
```

#### Week 20: Polish & Integration

```
Задачи:
├── Добавить responsive design
├── Оптимизировать performance
├── Добавить loading states
├── Добавить error boundaries
├── Добавить notifications
└── Финальное тестирование

Артефакты:
├── src/components/ErrorBoundary.tsx
├── src/components/Loading.tsx
├── src/components/Notifications.tsx
└── Оптимизированные components
```

### PHASE 5: ML Integration (Weeks 21-22)

#### Week 21: Python ML Service

```
Задачи:
├── Создать Python FastAPI проект
├── Настроить gRPC server
├── Мигрировать ML models
├── Добавить signal classification
├── Добавить price prediction
└── Создать regime detection

Артефакты:
├── ml-service/main.py
├── ml-service/requirements.txt
├── ml-service/grpc/server.py
├── ml-service/models/classifier.py
├── ml-service/models/predictor.py
└── proto/ml.proto
```

#### Week 22: Rust ML Integration

```
Задачи:
├── Создать gRPC client в Rust
├── Добавить ML signal filtering
├── Интегрировать predictions
├── Добавить caching для predictions
├── Создать fallback logic
└── Добавить metrics

Артефакты:
├── src/ml/client.rs
├── src/ml/types.rs
├── src/ml/signal_filter.rs
└── proto/ml.rs (generated)
```

### PHASE 6: Testing & Deployment (Weeks 23-26)

#### Week 23: Integration Testing

```
Задачи:
├── Написать API integration tests
├── Написать WebSocket tests
├── Написать bot tests
├── Написать exchange tests
├── Добавить test fixtures
└── Создать test database

Артефакты:
├── tests/api_tests.rs
├── tests/ws_tests.rs
├── tests/bot_tests.rs
├── tests/exchange_tests.rs
└── tests/fixtures/
```

#### Week 24: Performance Testing

```
Задачи:
├── Создать benchmarks
├── Тест latency order execution
├── Тест throughput WebSocket
├── Профилирование memory
├── Оптимизация bottlenecks
└── Load testing

Артефакты:
├── benches/trading_bench.rs
├── Профили reports
└── Оптимизированный код
```

#### Week 25: Security Audit

```
Задачи:
├── Audit authentication
├── Audit API security
├── Audit encryption
├── Audit secrets management
├── Audit input validation
└── Исправить vulnerabilities

Артефакты:
├── Security audit report
└── Security fixes
```

#### Week 26: Production Deployment

```
Задачи:
├── Создать production config
├── Настроить systemd service
├── Настроить backups
├── Настроить monitoring
├── Создать deployment scripts
├── Финальное тестирование
└── Go-live

Артефакты:
├── config/production.toml
├── deploy/systemd/citarion.service
├── deploy/backup/backup.sh
├── deploy/scripts/deploy.sh
└── Documentation
```

---

# ЧАСТЬ 5: ТРЕБОВАНИЯ К КАЧЕСТВУ

## 5.1 Performance Requirements

```
┌─────────────────────────────────────────────────────────────────┐
│                    Performance Requirements                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LATENCY                                                        │
│  ├── Order execution (internal): < 1μs                         │
│  ├── Order execution (to exchange): < 10ms                     │
│  ├── WebSocket message latency: < 1ms                          │
│  ├── API response time: < 50ms (p99)                           │
│  └── Price tick processing: < 100μs                            │
│                                                                 │
│  THROUGHPUT                                                     │
│  ├── API requests: > 10,000 req/sec                            │
│  ├── WebSocket connections: > 1,000 concurrent                 │
│  ├── Price updates: > 100,000/sec                              │
│  └── Order processing: > 1,000/sec                             │
│                                                                 │
│  RESOURCE USAGE                                                 │
│  ├── Memory: < 1GB baseline                                    │
│  ├── CPU: < 50% on 4 cores under normal load                   │
│  └── Database connections: < 100                               │
│                                                                 │
│  UPTIME                                                         │
│  └── 99.99% availability (< 52 minutes downtime/year)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 5.2 Security Requirements

```
┌─────────────────────────────────────────────────────────────────┐
│                    Security Requirements                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AUTHENTICATION                                                 │
│  ├── JWT tokens with expiration                                │
│  ├── Refresh token rotation                                    │
│  ├── 2FA support (TOTP)                                        │
│  ├── API key authentication                                    │
│  └── Session management                                        │
│                                                                 │
│  ENCRYPTION                                                     │
│  ├── API keys encrypted at rest (AES-256)                      │
│  ├── Secrets in environment variables                          │
│  ├── TLS 1.3 for all connections                               │
│  └── Password hashing (Argon2)                                 │
│                                                                 │
│  INPUT VALIDATION                                               │
│  ├── All API inputs validated                                  │
│  ├── SQL injection prevention                                  │
│  ├── XSS prevention                                            │
│  └── Rate limiting                                             │
│                                                                 │
│  AUDIT                                                          │
│  ├── All trading actions logged                                │
│  ├── All configuration changes logged                          │
│  ├── All authentication events logged                          │
│  └── Audit log retention: 1 year                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 5.3 Testing Requirements

```
┌─────────────────────────────────────────────────────────────────┐
│                     Testing Requirements                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  COVERAGE                                                       │
│  ├── Unit tests: > 80% coverage                                │
│  ├── Integration tests: All API endpoints                      │
│  ├── E2E tests: Critical user flows                            │
│  └── Performance tests: All critical paths                     │
│                                                                 │
│  TYPES OF TESTS                                                 │
│  ├── Unit tests (each module)                                  │
│  ├── Integration tests (API + DB)                              │
│  ├── WebSocket tests                                           │
│  ├── Bot behavior tests                                        │
│  ├── Exchange client tests (mocked)                            │
│  ├── Performance benchmarks                                    │
│  └── Security tests                                            │
│                                                                 │
│  TEST ENVIRONMENT                                               │
│  ├── Separate test database                                    │
│  ├── Mock exchange APIs                                        │
│  └── CI/CD integration                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# ЧАСТЬ 6: РИСКИ И МИТИГАЦИЯ

## 6.1 Технические риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Exchange API changes | Средняя | Высокое | Abstraction layer, monitoring |
| Rust learning curve | Средняя | Среднее | Training, code review |
| Data migration issues | Низкая | Высокое | Staged migration, backups |
| Performance degradation | Низкая | Высокое | Benchmarks, profiling |
| Integration bugs | Средняя | Среднее | Comprehensive testing |

## 6.2 Project risks

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Timeline overrun | Средняя | Среднее | Buffer time, prioritization |
| Scope creep | Средняя | Среднее | Strict change control |
| Resource availability | Низкая | Высокое | Documentation, knowledge transfer |

---

# ЧАСТЬ 7: КРИТЕРИИ ПРИЁМКИ

## 7.1 Phase Acceptance Criteria

### Phase 1: Foundation
- [ ] Rust server runs and responds to health checks
- [ ] TimescaleDB is accessible and schema is created
- [ ] Redis is accessible
- [ ] Authentication works (login, logout, 2FA)
- [ ] API documentation is complete

### Phase 2: Core Trading
- [ ] At least 3 exchanges are integrated (Binance, Bybit, OKX)
- [ ] Order execution works end-to-end
- [ ] WebSocket streaming works
- [ ] Risk management validates orders
- [ ] Latency requirements are met

### Phase 3: Bots Migration
- [ ] All bot types are migrated and working
- [ ] Bot statistics are accurate
- [ ] Bot control (start/stop/pause) works
- [ ] State persistence works

### Phase 4: Frontend Migration
- [ ] All pages render correctly
- [ ] All API integrations work
- [ ] WebSocket updates work
- [ ] Responsive design works
- [ ] Performance is acceptable

### Phase 5: ML Integration
- [ ] ML service runs independently
- [ ] gRPC communication works
- [ ] Predictions are returned
- [ ] Signal filtering works

### Phase 6: Testing & Deployment
- [ ] All tests pass
- [ ] Performance requirements are met
- [ ] Security audit is passed
- [ ] Production deployment is successful
- [ ] Monitoring is working

---

# ЧАСТЬ 8: ДОКУМЕНТАЦИЯ

## 8.1 Required Documentation

```
┌─────────────────────────────────────────────────────────────────┐
│                    Documentation Deliverables                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ARCHITECTURE                                                   │
│  ├── System architecture diagram                               │
│  ├── Database schema diagram                                   │
│  ├── API documentation (OpenAPI)                               │
│  └── WebSocket protocol documentation                          │
│                                                                 │
│  DEVELOPMENT                                                    │
│  ├── Setup guide                                               │
│  ├── Development workflow                                      │
│  ├── Testing guide                                             │
│  └── Code style guide                                          │
│                                                                 │
│  DEPLOYMENT                                                     │
│  ├── Deployment guide                                          │
│  ├── Configuration reference                                   │
│  ├── Backup and recovery procedures                            │
│  └── Monitoring and alerting setup                             │
│                                                                 │
│  OPERATIONS                                                     │
│  ├── Runbook for incidents                                     │
│  ├── Exchange integration guide                                │
│  ├── Bot configuration guide                                   │
│  └── Risk management guide                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# ПРИЛОЖЕНИЕ A: Команды для миграции

## A.1 Rust Project Creation

```bash
# Create Rust project
cargo new citarion-server --name citarion_server
cd citarion-server

# Add dependencies
cargo add tokio --features full
cargo add axum --features ws,macros
cargo add sqlx --features runtime-tokio,postgres,chrono,uuid,rust_decimal
cargo add redis --features tokio-comp,connection-manager
cargo add serde --features derive
cargo add serde_json
cargo add chrono --features serde
cargo add uuid --features v4,serde
cargo add rust_decimal --features serde-with-str
cargo add tracing
cargo add tracing-subscriber --features env-filter,json
cargo add thiserror
cargo add anyhow
cargo add config
cargo add dotenvy
```

## A.2 Frontend Project Creation

```bash
# Create Vite React project
npm create vite@latest citarion-frontend -- --template react-ts
cd citarion-frontend

# Add dependencies
npm install react-router-dom @tanstack/react-query @tanstack/react-table zustand lightweight-charts lucide-react clsx tailwind-merge class-variance-authority date-fns decimal.js

# Add Radix UI components
npm install @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-tooltip

# Add dev dependencies
npm install -D tailwindcss postcss autoprefixer @types/react @types/react-dom
npx tailwindcss init -p
```

## A.3 TimescaleDB Setup (Docker)

```bash
# Run TimescaleDB
docker run -d --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=citarion \
  timescale/timescaledb:latest-pg16

# Run Redis
docker run -d --name redis \
  -p 6379:6379 \
  redis:alpine
```

---

**Конец Технического Задания**

*Версия 1.0.0 | Январь 2026*
