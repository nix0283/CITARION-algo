# CITARION Oracle Integration Specification

## 1. Event Subscriptions

Оракул подписывается на следующие топики:
- TRADING.POSITION.* (opened, closed, liquidated)
- ANALYTICS.SIGNAL.* (все сигналы от ботов)
- RISK.* (limit breach, drawdown)
- SYSTEM.BOT.* (started, stopped, error)

## 2. User Commands

| Команда | Действие |
|---------|----------|
| buy {SYMBOL} {AMOUNT} | Открыть LONG |
| sell {SYMBOL} {AMOUNT} | Открыть SHORT |
| close {SYMBOL} | Закрыть позицию |
| close all | Закрыть все |
| status {BOT} | Статус бота |
| signals | Последние сигналы |
| positions | Открытые позиции |
| risk | Метрики риска |

## 3. Notification Templates

| Событие | Шаблон |
|---------|--------|
| Position Opened | 🟢 {SYMBOL} {DIR} открыта |
| Position Closed | ✅ {SYMBOL} закрыта: +{PNL}% |
| Liquidation | 💀 ЛИКВИДАЦИЯ {SYMBOL} |
| Signal Generated | 📊 {BOT}: {SYMBOL} {DIR} |
| Drawdown Warning | ⚠️ Просадка: {DRAWDOWN}% |

---

*Document Version: 1.0.0*
*Platform Version: v1.4.0*
