# ЭТАП 3: ПЛАН PRODUCTION DEPLOYMENT

**Дата:** 2025-01-XX  
**Версия документа:** 1.0.0  
**Статус:** Готов к реализации  
**Зависимости:** Этап 1 и 2 должны быть завершены

---

## 3.1. MIGRATION POSTGRESQL

### 3.1.1. Причины миграции

| SQLite | PostgreSQL |
|---------|------------|
| Один файл, нет concurrency | Множественные подключения |
| Нет replication | Master-slave replication |
| Нет индексов для времени | TimescaleDB extension |
| Ограниченный размер | Unlimited with partitioning |
| Нет полнотекстового поиска | Full-text search |

### 3.1.2. Схема миграции

```sql
-- TimescaleDB для OHLCV данных
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE ohlcv_candles (
  time        TIMESTAMPTZ NOT NULL,
  symbol      VARCHAR(20) NOT NULL,
  interval    VARCHAR(10) NOT NULL,
  open        DECIMAL(20, 8),
  high        DECIMAL(20, 8),
  low         DECIMAL(20, 8),
  close       DECIMAL(20, 8),
  volume      DECIMAL(30, 8),
  PRIMARY KEY (time, symbol, interval)
);

SELECT create_hypertable('ohlcv_candles', 'time');

-- Continuous aggregates для быстрой агрегации
CREATE MATERIALIZED VIEW ohlcv_1h
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket,
       symbol,
       first(open, time) AS open,
       max(high) AS high,
       min(low) AS low,
       last(close, time) AS close,
       sum(volume) AS volume
FROM ohlcv_candles
WHERE interval = '1m'
GROUP BY bucket, symbol;

SELECT add_continuous_aggregate_policy('ohlcv_1h',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');
```

### 3.1.3. Оценка времени: 4 часа

---

## 3.2. REDIS CACHING

### 3.2.1. Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                        REDIS ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   CACHE     │  │   SESSION   │  │    PUB/SUB  │                 │
│  │   LAYER     │  │   STORE     │  │   EVENTS    │                 │
│  │             │  │             │  │             │                 │
│  │ • Tickers   │  │ • Sessions  │  │ • Signals   │                 │
│  │ • Orderbooks│  │ • Tokens    │  │ • Trades    │                 │
│  │ • Prices    │  │ • Cache     │  │ • Positions │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    DATA STRUCTURES                           │    │
│  │  Strings: tickers, prices                                   │    │
│  │  Hashes: orderbooks, positions                              │    │
│  │  Lists: trade history, signal queue                         │    │
│  │  Sorted Sets: leaderboards, rankings                        │    │
│  │  Streams: event log, audit trail                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2.2. Redis Client

```typescript
// src/lib/cache/redis-client.ts

import { createClient } from 'redis'

class RedisCache {
  private client: RedisClientType
  private subscriber: RedisClientType

  async connect(): Promise<void> {
    this.client = createClient({ url: process.env.REDIS_URL })
    this.subscriber = this.client.duplicate()
    
    await Promise.all([
      this.client.connect(),
      this.subscriber.connect(),
    ])
  }

  // Cache with TTL
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value)
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, serialized)
    } else {
      await this.client.set(key, serialized)
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key)
    return value ? JSON.parse(value) : null
  }

  // Cache-aside pattern
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached) return cached

    const value = await fetcher()
    await this.set(key, value, ttl)
    return value
  }

  // Pub/Sub
  async publish(channel: string, message: any): Promise<void> {
    await this.client.publish(channel, JSON.stringify(message))
  }

  async subscribe(channel: string, handler: (message: any) => void): Promise<void> {
    await this.subscriber.subscribe(channel, (message) => {
      handler(JSON.parse(message))
    })
  }
}
```

### 3.2.3. Оценка времени: 4 часа

---

## 3.3. MONITORING (PROMETHEUS + GRAFANA)

### 3.3.1. Метрики

```yaml
# Business Metrics
citarion_trades_total{symbol, side, bot_type}
citarion_pnl_current{symbol, bot_type}
citarion_position_count{symbol, side}
citarion_signal_confidence{bot_type, direction}

# Technical Metrics  
citarion_api_latency_seconds{exchange, endpoint}
citarion_websocket_connections{exchange}
citarion_order_execution_seconds{exchange}
citarion_bot_optimization_duration_seconds{bot_type}

# System Metrics
citarion_ga_generation{bot_type}
citarion_ml_accuracy{model}
citarion_journal_trades_total{outcome}
```

### 3.3.2. Grafana Dashboards

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CITARION DASHBOARD                              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │    PnL OVER TIME    │  │   WIN RATE BY BOT   │                  │
│  │    [Line Chart]     │  │    [Bar Chart]      │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │  TRADES BY HOUR     │  │   API LATENCY       │                  │
│  │    [Heatmap]        │  │    [Gauge]          │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    ACTIVE POSITIONS                          │   │
│  │  Symbol │ Side │ Size │ Entry │ PnL │ Bot │ Duration       │   │
│  │  BTC    │ LONG │ 0.5  │ 42000 │ +2% │ GA  │ 2h 30m         │   │
│  │  ETH    │ SHORT│ 5.0  │ 2200  │ -1% │ DCA │ 45m            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3.3. Оценка времени: 6 часов

---

## 3.4. SECURITY AUDIT

### 3.4.1. Checklist

- [ ] API Key encryption (AES-256)
- [ ] HTTPS everywhere
- [ ] Rate limiting per user/IP
- [ ] Input validation (all endpoints)
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF tokens
- [ ] Session timeout
- [ ] 2FA implementation
- [ ] IP whitelist for withdrawals

### 3.4.2. API Key Encryption

```typescript
// src/lib/security/encryption.ts

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

export class ApiKeyEncryption {
  private key: Buffer

  constructor(masterKey: string) {
    this.key = scryptSync(masterKey, 'citarion-salt', 32)
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
  }

  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':')
    
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    const decipher = createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }
}
```

### 3.4.3. Оценка времени: 6 часов

---

## 3.5. LOAD TESTING

### 3.5.1. Scenarios

```yaml
# k6 load test configuration

scenarios:
  # Normal load
  normal:
    executor: ramping-vus
    startVUs: 0
    stages:
      - duration: 2m, target: 50
      - duration: 5m, target: 50
      - duration: 2m, target: 0

  # Peak load
  peak:
    executor: ramping-vus
    startVUs: 0
    stages:
      - duration: 1m, target: 200
      - duration: 3m, target: 200
      - duration: 1m, target: 0

  # Stress test
  stress:
    executor: ramping-vus
    startVUs: 0
    stages:
      - duration: 2m, target: 500
      - duration: 5m, target: 500
      - duration: 2m, target: 0

thresholds:
  http_req_duration: ['p(95)<500']  # 95% of requests < 500ms
  http_req_failed: ['rate<0.01']    # <1% error rate
```

### 3.5.2. Оценка времени: 4 часа

---

## 3.6. DOCUMENTATION

### 3.6.1. Структура

```
/docs/
├── README.md                    # Overview
├── ARCHITECTURE.md              # System architecture
├── API.md                       # API documentation
├── DEPLOYMENT.md                # Deployment guide
├── SECURITY.md                  # Security guidelines
├── BOT_CODES_STANDARD.md        # Bot documentation
├── AUDIT_REPORT.md              # Audit report
├── STAGE1_INTEGRATION_PLAN.md   # Stage 1 plan
├── STAGE2_ALGORITHM_PLAN.md     # Stage 2 plan
├── STAGE3_DEPLOYMENT_PLAN.md    # Stage 3 plan
├── frameworks/                  # Framework docs
├── exchanges/                   # Exchange docs
└── bots/                        # Bot docs
```

### 3.6.2. Оценка времени: 4 часа

---

## 3.7. CI/CD PIPELINE

### 3.7.1. GitHub Actions

```yaml
# .github/workflows/ci.yml

name: CITARION CI/CD

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run test

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build

  deploy:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          # Deployment script
```

### 3.7.2. Оценка времени: 3 часа

---

## СВОДНАЯ ОЦЕНКА ВРЕМЕНИ (ЭТАП 3)

| Раздел | Описание | Время |
|--------|----------|-------|
| 3.1 | Migration PostgreSQL + TimescaleDB | 4ч |
| 3.2 | Redis caching | 4ч |
| 3.3 | Monitoring (Prometheus + Grafana) | 6ч |
| 3.4 | Security audit | 6ч |
| 3.5 | Load testing | 4ч |
| 3.6 | Documentation | 4ч |
| 3.7 | CI/CD pipeline | 3ч |
| **ИТОГО** | | **31 час (~4 дня)** |

---

## ПОСЛЕДОВАТЕЛЬНОСТЬ РЕАЛИЗАЦИИ (ЭТАП 3)

```
Day 1:
├── 3.1 PostgreSQL Migration
└── 3.2 Redis Caching

Day 2:
├── 3.3 Monitoring setup
└── 3.4 Security audit (part 1)

Day 3:
├── 3.4 Security audit (part 2)
└── 3.5 Load testing

Day 4:
├── 3.6 Documentation
├── 3.7 CI/CD pipeline
└── Final verification
```

---

## ЗАВЕРШЕНИЕ ПРОЕКТА

После завершения Этапа 3 платформа CITARION будет готова к production:

- ✅ PostgreSQL для надёжного хранения данных
- ✅ Redis для кэширования и сессий
- ✅ Мониторинг всех компонентов
- ✅ Безопасность на production уровне
- ✅ Load tested для 500+ пользователей
- ✅ Полная документация
- ✅ Автоматический CI/CD

---

*План Этапа 3 завершён. Жду подтверждения для начала реализации.*
