# Copy Trading API Documentation

## Обзор

Copy Trading API позволяет автоматически копировать сделки опытных трейдеров (Master/Lead/Elite Traders). Этот модуль предоставляет единый интерфейс для работы с Copy Trading на 5 биржах: Binance, Bybit, OKX, Bitget, и BingX.

**ВАЖИМО: Поддерживаются ДВЕ роли:**
1. **Follower** - подписывается и копирует сделки Master Trader
2. **Master Trader** - на него подписываются и копируют его сделки

## Структура меню в Sidebar

Раздел **Копитрейдинг** является декоративным контейнером с двумя подразделами:

| Подраздел | ID | Описание |
|-----------|-----|----------|
| Копирование сделок | `copy-trading` | Панель для подписки на Master Traders |
| Master Trader | `master-trading` | Dashboard для управления как Master Trader |

---

## Master Trader (Lead Trader) API

### Сравнительная таблица поддержки API для Master Traders

| Функция | OKX | Bitget | Binance | Bybit | BingX |
|---------|-----|--------|---------|-------|-------|
| **Подать заявку через API** | ✅ | ❌ (UI) | ❌ (UI) | ❌ (UI) | ❌ (UI) |
| **Получить настройки** | ✅ | ✅ | ⚠️ Частично | ❌ | ❌ |
| **Обновить настройки** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Список подписчиков** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Удалить подписчика** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Profit Sharing статистика** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Закрыть позицию (трансляция)** | ✅ | ✅ | ⚠️ Через API | ⚠️ Через API | ⚠️ Через API |
| **Изменить TP/SL (трансляция)** | ✅ | ✅ | ⚠️ Через API | ⚠️ Через API | ⚠️ Через API |
| **TP/SL Ratio настройки** | ❌ | ✅ | ❌ | ❌ | ❌ |

### Рекомендации по выбору биржи для Master Trader

1. **OKX** - Лучший выбор! Полный API для Master Traders
2. **Bitget** - Отличный API, есть TP/SL Ratio
3. **Binance/Bybit/BingX** - Используйте стандартный Trade API, управление через Web UI

---

## Follower API (Копирование трейдеров)

### Сравнительная таблица поддержки API для Followers

| Функция | OKX | Bitget | Binance | Bybit | BingX |
|---------|-----|--------|---------|-------|-------|
| **Публичный API лидеров** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Список трейдеров** | ✅ API | ✅ API | Web UI | Web UI | Web UI |
| **Статистика PnL/ROI** | ✅ API | ✅ API | Web UI | Web UI | Web UI |
| **История сделок** | ✅ API | ✅ API | ❌ | Web UI | Web UI |
| **Текущие позиции** | ✅ API | ✅ API | ❌ | ❌ | ❌ |
| **Подписка через API** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Управление копированием** | ✅ API | ✅ API | Web UI | Web UI | Web UI |

---

## Master Trader: Подробности по биржам

### OKX Master Trader (ЛУЧШИЙ ВЫБОР)

OKX имеет самое полное API для Master Traders.

#### Endpoints для Master Traders

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/v5/copytrading/apply-lead-trader` | POST | Стать Lead Trader |
| `/api/v5/copytrading/lead-traders` | GET | Профиль Lead Trader |
| `/api/v5/copytrading/amend-lead-trader` | POST | Изменить настройки |
| `/api/v5/copytrading/copy-followers` | GET | Список подписчиков |
| `/api/v5/copytrading/remove-copy-followers` | POST | Удалить подписчика |
| `/api/v5/copytrading/copy-trading-profit-sharing-details` | GET | Детали профита |
| `/api/v5/copytrading/current-subpositions` | GET | Текущие позиции с followers |

#### Как стать Master Trader на OKX

```typescript
// 1. Проверить статус
const status = await client.getLeadTraderStatus();

// 2. Подать заявку
const result = await client.applyAsMasterTrader({
  exchange: 'okx',
  profitSharePercent: 10,
  minCopyAmount: 100,
});

// 3. Управление
const followers = await client.getMasterFollowers();
const settings = await client.getMasterTraderSettings();
```

---

### Bitget Master Trader

Bitget имеет отличный API для Master Traders (Elite Traders).

#### Endpoints для Master Traders

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/mix/v1/trace/traderSymbols` | GET | Символы для копирования |
| `/api/mix/v1/trace/setUpCopySymbols` | POST | Настройка символов |
| `/api/mix/v1/trace/myFollowerList` | GET | Список подписчиков |
| `/api/mix/v1/trace/removeFollower` | POST | Удалить подписчика |
| `/api/mix/v1/trace/profitDateGroupList` | GET | Сводка прибыли |
| `/api/mix/v1/trace/closeTrackOrder` | POST | Закрыть позицию |
| `/api/mix/v1/trace/modifyTPSL` | POST | Изменить TP/SL |
| `/api/mix/v1/trace/traderUpdateConfig` | POST | Обновить настройки |
| `/api/mix/v1/trace/queryTraderTpslRatioConfig` | GET | TP/SL Ratio |
| `/api/mix/v1/trace/traderUpdateTpslRatioConfig` | POST | Установить TP/SL Ratio |

#### Уникальная фича: TP/SL Ratio

Bitget позволяет указать процент подписчиков, которые автоматически скопируют ваши TP/SL:

```typescript
// Установить, что 100% подписчиков получат TP/SL
await client.updateTpslRatioConfig({
  takeProfitRatio: 100,  // 100% получат TP
  stopLossRatio: 100,    // 100% получат SL
});
```

---

### Binance Master Trader

**ОГРАНИЧЕНИЯ:**
- Подача заявки только через Web UI
- Управление подписчиками только через Web UI
- Используйте стандартный Futures API для торговли

#### Доступные Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/sapi/v1/copyTrading/futures/userStatus` | GET | Статус Lead Trader |
| `/sapi/v1/copyTrading/futures/leadSymbol` | GET | Символы для Lead Trading |

#### Как стать Master Trader

1. Перейдите на Binance Copy Trading
2. Нажмите "Become a Lead Trader"
3. Требования:
   - Минимальный объём: 50,000 USDT за 30 дней
   - ROI > 10%
   - Win Rate > 50%
   - Max Drawdown < 50%
   - Минимум 30 дней торговли

4. После одобрения используйте стандартный Futures API

---

### Bybit Master Trader

**ОГРАНИЧЕНИЯ:**
- Подача заявки через Web UI
- Управление подписчиками через Web UI
- Используйте V5 API для торговли

#### Как стать Master Trader

1. Перейдите на Bybit Copy Trading
2. Нажмите "Apply to be Master Trader"
3. Требования:
   - Минимум 30 дней истории торговли
   - ROI > 15%
   - Win Rate > 50%
   - Max Drawdown < 50%

4. После одобрения используйте V5 API

#### Ключевые V5 Endpoints

```typescript
// Торговля (транслируется подписчикам)
POST /v5/order/create           // Открыть позицию
POST /v5/order/cancel           // Отменить ордер
POST /v5/position/trading-stop  // Установить TP/SL
GET /v5/position/list           // Получить позиции
```

---

### BingX Master Trader

**ОГРАНИЧЕНИЯ:**
- Минимальная поддержка API
- Основное управление через Web UI

#### Особенности

- Copy Trading 2.0
- Copy-by-position mode (поддерживает API торговлю)
- CopyTrade Pro (cross-exchange через Binance API)

---

## Quick Start: Master Trader

### Инициализация

```typescript
import { getExchangeClient } from '@/lib/exchange';

// Создаём клиент
const client = await getExchangeClient('okx', {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  passphrase: 'your-passphrase', // для OKX, Bitget
});
```

### Проверка статуса Master Trader

```typescript
const status = await client.getLeadTraderStatus();

if (status.isLeadTrader) {
  console.log(`Master Trader since: ${status.since}`);
  console.log(`Followers: ${status.followersCount}`);
} else {
  console.log('Not a Master Trader yet');
}
```

### Получение списка подписчиков

```typescript
const followers = await client.getMasterFollowers(50);

for (const follower of followers) {
  console.log(`${follower.nickname}: ${follower.totalCopiedTrades} trades, $${follower.totalPnl} PnL`);
}
```

### Управление настройками

```typescript
// Получить текущие настройки
const settings = await client.getMasterTraderSettings();

// Обновить настройки
await client.updateMasterTraderSettings({
  profitSharePercent: 15,
  minCopyAmount: 100,
  visible: true,
});
```

### Закрытие позиции (транслируется подписчикам)

```typescript
// OKX / Bitget - позиция закроется и у всех подписчиков
const result = await client.copyClosePosition({
  symbol: 'BTCUSDT',
  trackingNumber: 'tracking-id',
  market: true,
});
```

---

## UI Components

### MasterTraderPanel

Полный дашборд для Master Trader:
- Статистика (подписчики, профит, сделки)
- Список подписчиков с возможностью удаления
- Текущие позиции с количеством копирующих
- Настройки (profit share, мин. сумма, видимость)

### CopyTradingPanel

Дашборд для Follower:
- Рейтинг Master Traders
- Подписка на трейдеров
- Текущие позиции копируемых трейдеров
- Настройки копирования

---

## Best Practices для Master Traders

1. **Выберите правильную биржу**
   - OKX или Bitget для полного API контроля
   - Binance/Bybit если нужна большая ликвидность

2. **Настройте Profit Sharing**
   - Обычно 5-15% от прибыли followers
   - Слишком высокий % отпугнёт подписчиков

3. **Торгуйте стабильно**
   - Низкий Max Drawdown важнее высокого ROI
   - Followers уходят при больших просадках

4. **Используйте TP/SL**
   - Bitget: настройте TP/SL Ratio = 100%
   - Это защитит и вас, и followers

5. **Коммуникация**
   - Описывайте стратегию в профиле
   - Регулярно обновляйте статистику

---

## Error Handling

```typescript
const result = await client.removeMasterFollower(followerId);

if (!result.success) {
  console.error(`Error: ${result.error}`);
  console.error(`Code: ${result.errorCode}`);
  
  if (result.errorCode === 'NOT_SUPPORTED') {
    // Используйте Web UI
  }
}
```

---

## Cornix Integration

### Обзор

CITARION поддерживает Cornix-совместимый формат сигналов для интеграции с внешними copy trading платформами. Cornix — это популярная платформа для копитрейдинга, которая работает с 5 биржами.

### Компоненты Cornix

#### CornixFeaturesPanel
Управление функциями интеграции Cornix:
- **Auto Trading** - автоматическое исполнение сигналов
- **Signal Parsing** - распознавание Cornix формата
- **Webhook** - приём сигналов через webhook
- **Notifications** - Telegram уведомления
- **Risk Management** - проверка лимитов перед исполнением
- **TP/SL Copy** - автоматическое копирование TP/SL из сигналов

#### CornixMetricsPanel
Метрики производительности и сигналов:
- **Performance Tab** - PnL, Win Rate, Profit Factor, Sharpe Ratio
- **Signals Tab** - статистика сигналов по биржам и парам
- **Copy Trading Tab** - метрики followers и profit sharing

#### API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/cornix/features` | GET | Получить функции и подключённые биржи |
| `/api/cornix/features` | POST | Обновить настройки Cornix |
| `/api/cornix/metrics` | GET | Получить метрики производительности |
| `/api/webhook/tradingview` | POST | Приём TradingView/Cornix сигналов |

### Cornix Signal Format

CITARION поддерживает стандартный Cornix формат сигналов:

```
#BTCUSDT
Buy/Sell: Long
Entry: 45000-45500
Targets:
1: 46000
2: 47000
3: 48000
Stop: 44000
Leverage: 10x
```

### Поддерживаемые биржи

| Биржа | Spot | Futures | Testnet | Demo |
|-------|------|---------|---------|------|
| Binance | ✅ | ✅ | ✅ | ❌ |
| Bybit | ✅ | ✅ | ✅ | ❌ |
| OKX | ✅ | ✅ | ❌ | ✅ |
| Bitget | ✅ | ✅ | ❌ | ✅ |
| BingX | ✅ | ✅ | ❌ | ✅ |

---

## Changelog

### 2026-03-07
- **Добавлены Cornix API routes**
- Создан `/api/cornix/features` для управления функциями Cornix
- Создан `/api/cornix/metrics` для получения метрик производительности
- Создан компонент `CornixMetricsPanel` с полным dashboard метрик
- Интеграция с реальными данными из БД и бирж
- Поддержка period selection (7d, 30d, 90d, all time)

### 2026-03-06
- **Реализована реальная интеграция с API бирж**
- Добавлен `/api/master-trader` endpoint для управления Master Trader функциями
- MasterTraderPanel теперь использует реальные API вызовы вместо mock данных
- Добавлены методы Master Trader в OKXClient (getMasterTrader, applyAsMasterTrader, getMasterFollowers, etc.)
- Добавлена поддержка реального подключения к биржам OKX и Bitget через API
- Cornix-функции интегрированы с локальной БД (не требуют внешнего Cornix API)

### 2026-02-15
- Добавлена полная поддержка Master Trader API
- Созданы MasterTraderPanel и обновлённая документация
- Реализованы классы MasterTrader для всех бирж
- OKX и Bitget: полный API контроль
- Binance, Bybit, BingX: инструкции по использованию через Web UI
