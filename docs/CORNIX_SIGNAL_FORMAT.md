# Cornix Signal Format Documentation

> Source: https://help.cornix.io/en/articles/5814956-signal-posting

## Обзор

Документация описывает формат сигналов, совместимый с Cornix. Система поддерживает как **FUTURES** так и **SPOT** торговлю.

### ⚠️ Важное отличие SPOT vs FUTURES

- **SPOT сигнал**: В тексте сигнала должно присутствовать слово `spot` (в любом месте, любом регистре)
- **FUTURES сигнал**: Слово `spot` отсутствует в тексте (по умолчанию)

---

## Основные правила формата

### Обязательные элементы

1. **Пара монет** - всегда указывать полное название пары
   - Примеры: `BTC/USDT`, `ETH/USDT`, `BTCUSDT`, `#BTC/USDT`

2. **Ключевое слово покупки** - одно из:
   - `Buy` или `Entry`

3. **Ключевое слово продажи/стопа** - одно из:
   - `Sell`, `Stop`, или `Stop Loss`

### Необязательные элементы

- **Take Profit**: `Take Profit`, `TP`, `Target`, `Sell`
- **Leverage**: `Leverage`, `Lev`, или формат `x20`, `Cross x5`
- **Exchanges**: `Exchanges: Binance Futures, Bybit USDT`
- **Signal Type**: `Signal Type: Regular` или `Breakout`
- **Amount**: `Amount per trade 5%`
- **Risk Management**: `Risk management: Risk 1%`

---

## Полный шаблон сигнала (FUTURES)

```
⚡⚡ #BTC/USDT ⚡⚡
Exchanges: Binance Futures
Signal Type: Regular (Long)
Leverage: Isolated (5X)
Entry Zone: 38766.9 - 38766.9
Take-Profit Targets: 1) 39000 2) 39500 3) 40000
Stop Targets: 1) 38000
Trailing Configuration:
Entry: Percentage (0.5%)
Take-Profit: Percentage (0.5%)
Stop: Moving Target - Trigger: Target (1)
```

## Полный шаблон сигнала (SPOT)

```
#ETH/USDT SPOT
Exchanges: Binance
Buy: 2500
Take-Profit: 2600, 2700, 2800
Stop: 2400
```

---

## Детальное описание элементов

### 1. Пара монет (Coin Pair)

Форматы:
- `BTC/USDT` - стандартный
- `BTCUSDT` - без разделителя
- `#BTC/USDT` - с хештегом
- `BTC-USDT` - с дефисом

Поддерживаемые котируемые валюты:
- `USDT`, `USD`, `BUSD`, `USDC`, `BTC`, `ETH`, `BNB`

### 2. Направление (Direction)

Автоматически определяется из цен:
- Если Stop Loss ниже Entry → **LONG**
- Если Stop Loss выше Entry → **SHORT**

Или явно указывается:
- `LONG`, `Long`, `(Long)`
- `SHORT`, `Short`, `(Short)`

### 3. Точки входа (Entry)

#### Одиночный вход
```
Entry: 67000
Buy: 67000
```

#### Множественные входы
```
Entry: 67000, 66500, 66000
Buy: 67000 66500 66000
```

#### Нумерованные входы (до 10)
```
Entry Targets:
1) 67000
2) 66500
3) 66000
```

#### Диапазон входа (Entry Zone)
```
Entry Zone: 100-200
Buy Zone: 67000-66500
```

#### Вход по текущей цене
```
Buy at current price
```

#### Breakout сигналы
```
Enter above 150
Enter below 200
```

### 4. Take Profit (до 10 целей)

Форматы:
```
Take-Profit: 68000
TP: 68000
Target: 68000

Take-Profit Targets:
1) 68000
2) 69000
3) 70000

TP1: 68000
TP2: 69000
TP3: 70000
```

### 5. Stop Loss (только 1)

Форматы:
```
Stop: 66000
Stop Loss: 66000
SL: 66000

Stop Targets:
1) 66000
```

⚠️ **Важно**: Stop Loss не может быть:
- Выше Entry для LONG сигнала
- Ниже Entry для SHORT сигнала

### 6. Leverage (только для FUTURES)

Форматы:
```
Leverage: Isolated (5X)
Leverage: Cross x20
Lev: 10x
Isolated x5
Cross 10x
x20
```

По умолчанию: `Isolated x1`

### 7. Exchanges

```
Exchanges: Binance Futures, Bybit USDT
Exchanges: Bybit USDT, Binance Futures
```

Поддерживаемые биржи:
- Binance, Bybit, OKX, Bitget, BingX, Huobi, KuCoin, Gate, MEXC

### 8. Signal Type

```
Signal Type: Regular    (по умолчанию)
Signal Type: Breakout   (ожидание пробоя)
```

### 9. Amount Per Trade

```
Amount per trade 5%
Amount: 45.0%
Invest up to 5% of your portfolio
Capital invested: 2%
5% Max
```

Лимит: до 20%

### 10. Risk Management

```
Risk management: Risk 1% - 1.5% of your portfolio
Risk management 0.5%
RM: 10.0%
```

Лимит: до 20%

### 11. Trailing Configuration

```
Trailing Configuration:
Entry: Percentage (0.5%)
Take-Profit: Percentage (0.5%)
Stop: Moving Target - Trigger: Target (1)
```

Или:
```
Stop: Breakeven - Trigger: Percent (1%)
```

---

## Примеры сигналов

### Простой LONG сигнал
```
#BTC/USDT
LONG
Entry: 67000
TP: 68000, 69000
SL: 66000
Leverage: 10x
```

### Простой SHORT сигнал
```
BTCUSDT
SHORT
Entry: 68000
Take-Profit: 67000
Stop: 69000
```

### Breakout сигнал
```
#SOL/USDT
Enter above 150
TP: 160, 170
Stop: 140
Leverage: Cross x20
```

### Entry Zone сигнал
```
ETH/USDT
Entry Zone: 2500-2600
TP1: 2700
TP2: 2800
TP3: 2900
Stop: 2400
```

### Множественные входы и TP
```
#BTC/USDT
LONG
Entry Targets:
1) 67000
2) 66500
3) 66000
Take-Profit Targets:
1) 68000
2) 69000
3) 70000
Stop: 65000
Leverage: Isolated x10
```

### SPOT сигнал
```
ETH/USDT SPOT
Buy: 2500
TP: 2600, 2700
Stop: 2400
```

### SPOT сигнал с множественными TP
```
#SOL/USDT spot
Exchanges: Binance, Bybit
Entry: 100
TP1: 110
TP2: 120
TP3: 130
Stop: 90
```

---

## Ограничения

| Параметр | Максимум |
|----------|----------|
| Entry targets | 10 |
| Take Profit targets | 10 |
| Stop Loss | 1 |
| Amount per trade | 20% |
| Risk percentage | 20% |
| Signals per minute | 7 |

---

## Ключевые слова для парсинга

### Пара монет
- `BTC/USDT`, `BTCUSDT`, `#BTC/USDT`, `BTC-USDT`

### Вход
- `Entry`, `Buy`, `Enter`

### Take Profit
- `Take Profit`, `Take-Profit`, `TP`, `Target`, `Targets`

### Stop Loss
- `Stop Loss`, `Stop-Loss`, `Stop`, `SL`

### Направление
- `LONG`, `Long`, `long`
- `SHORT`, `Short`, `short`

### Рынок
- `SPOT`, `Spot`, `spot` → SPOT торговля
- Отсутствует → FUTURES торговля

### Leverage
- `Leverage`, `Lev`, `Isolated`, `Cross`

### Breakout
- `above`, `below`, `Signal Type: Breakout`

### Entry Zone
- `Entry Zone`, `Buy Zone`, `Zone`

---

## Интеграция с системой

Сигналы принимаются из трёх источников:
1. **TradingView Webhook**: `/api/webhook/tradingview`
2. **Telegram Bot**: `/api/telegram/webhook`
3. **Приложение Chat Bot**: `/api/chat/parse-signal`

Все три источника используют единый парсер Cornix формата.
