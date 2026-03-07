# CITARION Orchestration Architecture — Production Design

## Executive Summary

Этот документ описывает production-ready архитектуру оркестрационного слоя для платформы CITARION. Архитектура основана на **NATS JetStream** как главном брокере сообщений с детерминированной доставкой, микросекундной задержкой и поддержкой 10M+ сообщений/сек.

---

## 1. Выбор технологического стека

### 1.1 Сравнение брокеров сообщений

| Критерий | NATS JetStream | Redis Streams | Kafka | RabbitMQ | Aeron |
|----------|----------------|---------------|-------|----------|-------|
| **Latency (p99)** | 100μs | 500μs | 1-5ms | 1-2ms | 10μs |
| **Throughput** | 10M/sec | 1M/sec | 1M/sec | 500K/sec | 50M/sec |
| **Persistence** | Yes | Yes | Yes | Yes | Limited |
| **Exactly-Once** | Yes | No | Yes | No | Yes |
| **Determinism** | Yes | No | Partial | No | Yes |
| **Complexity** | Low | Low | High | Medium | High |

### 1.2 Рекомендация: NATS JetStream

**Обоснование:**
1. Микросекундная задержка — критично для HFT бота (Helios)
2. Детерминизм — гарантирует порядок сообщений
3. Exactly-Once семантика — критично для торговых операций
4. Низкая сложность — один бинарный файл

---

## 2. Топики и схема сообщений

### 2.1 Иерархия топиков

```
CITARION.EVENTS
+-- TRADING
|   +-- ORDER (CREATED, FILLED, CANCELLED, REJECTED)
|   +-- POSITION (OPENED, CLOSED, LIQUIDATED)
+-- MARKET
|   +-- PRICE.{SYMBOL}
|   +-- ORDERBOOK.{SYMBOL}
|   +-- FUNDING.{SYMBOL}
+-- ANALYTICS
|   +-- SIGNAL.{BOT_CODE}
|   +-- FORECAST.{BOT_CODE}
+-- RISK
|   +-- LIMIT (BREACH, WARNING)
|   +-- DRAWDOWN (WARNING, CRITICAL)
+-- SYSTEM
|   +-- BOT (STARTED, STOPPED, ERROR)
+-- NOTIFICATION
    +-- USER.{USER_ID}
    +-- CHANNEL (TELEGRAM, EMAIL)
```

---

## 3. Стандартизированные коды ботов

| Код | Имя | Категория | Latency |
|-----|-----|-----------|---------|
| GRD | MESH | operational | <500ms |
| DCA | SCALE | operational | <500ms |
| BB | BAND | operational | <500ms |
| RNG | EDGE | operational | <500ms |
| PND | Argus | institutional | <200ms |
| TRD | Vision | institutional | <5s |
| ARB | Orion | institutional | <500ms |
| PR | Spectrum | institutional | <500ms |
| STA | Reed | institutional | <500ms |
| MM | Architect | institutional | <100ms |
| MR | Equilibrist | institutional | <500ms |
| TRF | Kron | institutional | <1s |
| HFT | Helios | frequency | <10ms |
| MFT | Selene | frequency | <100ms |
| LFT | Atlas | frequency | <1s |
| LOG | Logos | meta | <500ms |
| ORA | Оракул | meta | <200ms |
| SIG | Signal Bot | integration | <1s |
| CPY | CopyTrader | integration | <1s |
| WLF | WolfBot | integration | <500ms |
| LMB | Lumibot | integration | <500ms |

---

## 4. Интеграция с Оракулом

Оракул подписывается на:
- ANALYTICS.SIGNAL.* — все сигналы от ботов
- TRADING.POSITION.* — события позиций
- RISK.* — риск-события
- SYSTEM.BOT.* — статусы ботов

---

## 5. Поддерживаемые биржи

| Биржа | Spot | Futures | Testnet | Demo |
|-------|------|---------|---------|------|
| Binance | Yes | Yes | Yes | No |
| Bybit | Yes | Yes | Yes | No |
| OKX | Yes | Yes | No | Yes |
| Bitget | Yes | Yes | No | Yes |
| BingX | Yes | Yes | No | Yes |

---

*Document Version: 1.0.0*
*Platform Version: v1.4.0*
