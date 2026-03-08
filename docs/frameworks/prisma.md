# Prisma ORM

Prisma - это современный ORM для Node.js и TypeScript, используемый в проекте CITARION для работы с SQLite базой данных.

## Обзор

### Роль в проекте

Prisma обеспечивает:
- Типобезопасный доступ к базе данных
- Автоматическую генерацию TypeScript типов
- Миграции базы данных
- Интуитивный API для CRUD операций

### Конфигурация

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

## Инициализация клиента

### Singleton Pattern

```typescript
// src/lib/db.ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
```

**Почему Singleton?**
- В development режиме Next.js пересоздаёт модули при каждом запросе
- Без singleton создаётся множество подключений к БД
- Это приводит к исчерпанию ресурсов SQLite

### Использование в API Routes

```typescript
// src/app/api/example/route.ts
import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const users = await db.user.findMany()
  return NextResponse.json({ users })
}
```

---

## Основные модели

### User

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  password     String?
  image        String?
  currentMode  String   @default("DEMO") // REAL or DEMO
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  accounts     Account[]
  trades       Trade[]
  botConfigs   BotConfig[]
  sessions     Session[]
}
```

**Использование:**

```typescript
// Создание пользователя
const user = await db.user.create({
  data: {
    email: "user@example.com",
    name: "John Doe",
    currentMode: "DEMO"
  }
})

// Поиск пользователя
const user = await db.user.findUnique({
  where: { email: "user@example.com" },
  include: { accounts: true, trades: true }
})

// Обновление режима
await db.user.update({
  where: { id: userId },
  data: { currentMode: "REAL" }
})
```

### Account

```prisma
model Account {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Account type
  accountType   String   @default("DEMO") // REAL or DEMO
  
  // Exchange configuration
  exchangeId    String   @default("binance")
  exchangeType  String   @default("spot") // spot, futures, inverse
  exchangeName  String   @default("Binance")
  
  // API Keys (encrypted for REAL accounts)
  apiKey        String?
  apiSecret     String?
  apiPassphrase String?  // For OKX, KuCoin
  
  // Virtual Balance for DEMO accounts
  virtualBalance String? // JSON string
  
  // Sub-account and testnet
  subAccount    String?
  isTestnet     Boolean  @default(false)
  
  isActive      Boolean  @default(true)
  lastSyncAt    DateTime?
  lastError     String?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  trades        Trade[]
  positions     Position[]
  botConfigs    BotConfig[]
  
  @@unique([userId, exchangeId, exchangeType])
}
```

**Использование:**

```typescript
// Создание демо-аккаунта
const account = await db.account.create({
  data: {
    userId: user.id,
    accountType: "DEMO",
    exchangeId: "binance",
    exchangeType: "futures",
    virtualBalance: JSON.stringify({ USDT: 10000, BTC: 0, ETH: 0 })
  }
})

// Создание реального аккаунта с API ключами
const realAccount = await db.account.create({
  data: {
    userId: user.id,
    accountType: "REAL",
    exchangeId: "bybit",
    exchangeType: "futures",
    apiKey: encryptedApiKey,
    apiSecret: encryptedApiSecret,
    isTestnet: true
  }
})

// Получение аккаунта с позициями
const accountWithPositions = await db.account.findUnique({
  where: { id: accountId },
  include: {
    positions: {
      where: { status: "OPEN" }
    }
  }
})
```

### Position

```prisma
model Position {
  id            String   @id @default(cuid())
  accountId     String
  account       Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  
  symbol        String
  direction     String   // LONG or SHORT
  status        String   @default("OPEN") // OPEN, CLOSED
  
  totalAmount   Float
  filledAmount  Float    @default(0)
  avgEntryPrice Float
  currentPrice  Float?
  leverage      Int      @default(1)
  
  // Source tracking
  source        String   @default("PLATFORM") // PLATFORM, EXTERNAL, SIGNAL
  
  // Escort (сопровождение позиций)
  escortEnabled Boolean  @default(false)
  escortStatus  String?  // PENDING_CONFIRMATION, ESCORTING, IGNORED
  
  // Risk management
  stopLoss      Float?
  takeProfit    Float?
  trailingStop  String?  // JSON
  trailingActivated Boolean @default(false)
  
  // PnL
  unrealizedPnl Float    @default(0)
  realizedPnl   Float    @default(0)
  
  // Funding tracking
  totalFundingPaid     Float    @default(0)
  totalFundingReceived Float    @default(0)
  lastFundingTime      DateTime?
  
  highestPrice  Float?   // For trailing stop
  lowestPrice   Float?   // For trailing stop SHORT
  
  isDemo        Boolean  @default(true)
  closedAt      DateTime?
  closeReason   String?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  trades        Trade[]
  fundingPayments FundingPayment[]
  
  @@index([source, escortStatus])
  @@index([accountId, status])
}
```

**Использование:**

```typescript
// Открытие позиции
const position = await db.position.create({
  data: {
    accountId: account.id,
    symbol: "BTCUSDT",
    direction: "LONG",
    status: "OPEN",
    totalAmount: 0.1,
    avgEntryPrice: 97000,
    leverage: 10,
    source: "SIGNAL",
    stopLoss: 95000,
    takeProfit: 100000,
    isDemo: true
  }
})

// Обновление.trailing stop
await db.position.update({
  where: { id: position.id },
  data: {
    trailingStop: JSON.stringify({
      type: "PERCENT",
      value: 5,
      activated: false,
      highestPrice: 97000
    }),
    highestPrice: 98000
  }
})

// Закрытие позиции
await db.position.update({
  where: { id: position.id },
  data: {
    status: "CLOSED",
    closedAt: new Date(),
    closeReason: "TP",
    realizedPnl: 300
  }
})

// Поиск позиций для escort
const escortPositions = await db.position.findMany({
  where: {
    source: "EXTERNAL",
    escortStatus: "ESCORTING",
    status: "OPEN"
  },
  include: { account: true }
})
```

### Signal

```prisma
model Signal {
  id            String   @id @default(cuid())
  signalId      Int      @unique  // Sequential ID (Cornix-style)
  
  // Source
  source        String   // TELEGRAM, DISCORD, TRADINGVIEW, MANUAL
  sourceChannel String?
  sourceMessage String?
  
  // Parsed data
  symbol        String
  direction     String   // LONG or SHORT
  action        String   // BUY, SELL, CLOSE
  marketType    String   @default("FUTURES")
  
  // Entry
  entryPrices   String?  // JSON array
  entryZone     String?  // JSON
  entryWeights  String?  // JSON array
  
  // Exit
  takeProfits   String?  // JSON array
  stopLoss      Float?
  
  // Additional
  leverage      Int      @default(1)
  leverageType  String   @default("ISOLATED")
  signalType    String   @default("REGULAR")
  trailingConfig String? // JSON
  
  // Status
  status        String   @default("PENDING")
  errorMessage  String?
  processedAt   DateTime?
  closedAt      DateTime?
  
  positionId    String? @unique
  position      Position? @relation(fields: [positionId], references: [id])
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([signalId])
  @@index([symbol, marketType, status])
}
```

**Использование:**

```typescript
// Создание сигнала
const signal = await db.signal.create({
  data: {
    signalId: await getNextSignalId(),
    source: "TELEGRAM",
    sourceChannel: "@trading_signals",
    sourceMessage: "BTCUSDT LONG Entry: 97000 TP: 100000 SL: 95000",
    symbol: "BTCUSDT",
    direction: "LONG",
    action: "BUY",
    entryPrices: JSON.stringify([97000, 96500, 96000]),
    takeProfits: JSON.stringify([
      { price: 98500, percentage: 30 },
      { price: 100000, percentage: 70 }
    ]),
    stopLoss: 95000,
    leverage: 10,
    status: "PENDING"
  }
})

// Получение активных сигналов
const activeSignals = await db.signal.findMany({
  where: {
    status: { in: ["PENDING", "ACTIVE"] }
  },
  orderBy: { createdAt: "desc" },
  include: { position: true }
})
```

---

## Сложные запросы

### Транзакции

```typescript
// Атомарная операция: создать трейд и обновить позицию
const result = await db.$transaction(async (tx) => {
  // Создаём трейд
  const trade = await tx.trade.create({
    data: {
      userId,
      accountId,
      symbol: "BTCUSDT",
      direction: "LONG",
      status: "CLOSED",
      entryPrice: 97000,
      exitPrice: 100000,
      amount: 0.1,
      pnl: 300,
      closeReason: "TP"
    }
  })
  
  // Обновляем позицию
  await tx.position.update({
    where: { id: positionId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closeReason: "TP",
      realizedPnl: 300
    }
  })
  
  return trade
})
```

### Агрегации

```typescript
// Подсчёт PnL за период
const pnlStats = await db.trade.aggregate({
  where: {
    userId,
    status: "CLOSED",
    closedAt: {
      gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 дней
    }
  },
  _sum: {
    pnl: true,
    fee: true
  },
  _count: {
    id: true
  }
})

console.log(`Total PnL: ${pnlStats._sum.pnl}`)
console.log(`Total trades: ${pnlStats._count.id}`)
```

### Группировка

```typescript
// PnL по символам
const pnlBySymbol = await db.trade.groupBy({
  by: ['symbol'],
  where: {
    userId,
    status: "CLOSED"
  },
  _sum: {
    pnl: true
  },
  _count: {
    id: true
  },
  orderBy: {
    _sum: {
      pnl: 'desc'
    }
  }
})
```

### Raw queries

```typescript
// Сырой SQL для сложных запросов
const result = await db.$queryRaw`
  SELECT
    symbol,
    COUNT(*) as trades,
    SUM(pnl) as totalPnl,
    AVG(pnl) as avgPnl
  FROM Trade
  WHERE userId = ${userId}
    AND status = 'CLOSED'
    AND closedAt >= datetime('now', '-30 days')
  GROUP BY symbol
  ORDER BY totalPnl DESC
`
```

---

## Миграции

### Создание миграции

```bash
# Создать миграцию
bun run db:migrate

# Применить миграции
bunx prisma migrate dev

# Сбросить базу данных
bun run db:reset
```

### Push без миграций (development)

```bash
# Быстрое применение изменений схемы
bun run db:push
```

### Генерация клиента

```bash
# После изменений схемы
bun run db:generate
```

---

## Лучшие практики

### 1. Всегда используйте include для связанных данных

```typescript
// ❌ Плохо - N+1 запросов
const users = await db.user.findMany()
for (const user of users) {
  const accounts = await db.account.findMany({
    where: { userId: user.id }
  })
}

// ✅ Хорошо - один запрос с join
const users = await db.user.findMany({
  include: { accounts: true }
})
```

### 2. Используйте select для оптимизации

```typescript
// Выбираем только нужные поля
const users = await db.user.findMany({
  select: {
    id: true,
    email: true,
    name: true
    // Не загружаем password, image и т.д.
  }
})
```

### 3. Индексы для частых запросов

```prisma
model Position {
  // ...
  
  @@index([accountId, status])  // Для фильтрации по аккаунту и статусу
  @@index([source, escortStatus])  // Для escort queries
}
```

### 4. Обработка ошибок

```typescript
import { Prisma } from '@prisma/client'

try {
  const user = await db.user.create({
    data: { email: "test@example.com" }
  })
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      // Unique constraint violation
      console.log("Email already exists")
    }
  }
  throw error
}
```

### 5. Soft Delete

```typescript
// Вместо удаления - помечаем как неактивный
await db.account.update({
  where: { id: accountId },
  data: { isActive: false }
})

// Фильтруем неактивные
const activeAccounts = await db.account.findMany({
  where: { isActive: true }
})
```

---

## Решение проблем

### Ошибка: "Can't reach database server"

```bash
# Проверьте DATABASE_URL в .env
DATABASE_URL="file:./dev.db"

# Или для абсолютного пути
DATABASE_URL="file:/path/to/database.db"
```

### Ошибка: "Prisma Client not generated"

```bash
# Сгенерируйте клиент
bun run db:generate
```

### Ошибка: "Table does not exist"

```bash
# Примените миграции
bun run db:push
# Или
bunx prisma migrate dev
```

### Медленные запросы

1. Добавьте индексы для часто фильтруемых полей
2. Используйте `select` вместо `include` для больших таблиц
3. Рассмотрите пагинацию для больших списков

```typescript
// Пагинация
const trades = await db.trade.findMany({
  where: { userId },
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: 'desc' }
})
```

---

## Связанные документы

- [TimescaleDB Migration](../TIMESCALEDB_MIGRATION.md) - Миграция на TimescaleDB
- [OHLCV System](../OHLCV-SYSTEM.md) - Система хранения свечей
