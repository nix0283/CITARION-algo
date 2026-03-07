# CITARION Lumibot Trading Service

Python-сервис для алгоритмической торговли, интегрированный с платформой CITARION.

## Возможности

- **Бэктестинг стратегий** - тестирование на исторических данных
- **Live Trading** - торговля в реальном времени (Paper/Real)
- **Множество стратегий** - RSI, MACD, Bollinger Bands, Grid, EMA Cross
- **Интеграция с брокерами** - CCXT (крипто), Alpaca (акции), Interactive Brokers
- **REST API** - полноценный API для интеграции

## Быстрый старт

### С Docker Compose (рекомендуется)

```bash
cd lumibot-service
docker-compose up -d
```

### Без Docker

```bash
cd lumibot-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

## API Endpoints

### Health & Status
- `GET /` - Статус сервиса
- `GET /health` - Health check

### Strategies
- `GET /strategies` - Список стратегий
- `GET /strategies/{id}` - Детали стратегии

### Backtesting
- `POST /backtest` - Запуск бэктеста
- `POST /backtest/simulate` - Симуляция бэктеста

### Live Trading
- `GET /live` - Активные стратегии
- `POST /live/start` - Запуск стратегии
- `POST /live/{id}/stop` - Остановка стратегии

### Signals
- `GET /signals` - Получение сигналов
- `GET /signals/{strategy_id}` - Сигналы стратегии

## Стратегии

| ID | Название | Категория | Описание |
|----|----------|-----------|----------|
| `rsi_reversal` | RSI Reversal | Mean-reversion | Торговля по уровням RSI |
| `macd_trend` | MACD Trend Following | Trend-following | Пересечения MACD |
| `bollinger_reversion` | Bollinger Bands Reversion | Mean-reversion | Отскоки от полос Боллинджера |
| `grid_trading` | Grid Trading | Grid | Сеточная торговля |
| `ema_cross` | EMA Crossover | Trend-following | Пересечения EMA |

## Конфигурация

Переменные окружения:

```bash
# Service
SERVICE_NAME=CITARION Lumibot Trading Service
SERVICE_VERSION=1.0.0
HOST=0.0.0.0
PORT=8001
DEBUG=false

# Redis
REDIS_URL=redis://localhost:6379/0

# Exchange API Keys (optional)
BINANCE_API_KEY=your_key
BINANCE_API_SECRET=your_secret
BYBIT_API_KEY=your_key
BYBIT_API_SECRET=your_secret
```

## Интеграция с CITARION

Сервис работает как микросервис, доступный по адресу `http://localhost:8001`.

Next.js приложение взаимодействует через API routes:
- `/api/lumibot/status` - Статус
- `/api/lumibot/backtest` - Бэктестинг
- `/api/lumibot/live` - Live trading
- `/api/lumibot/strategies` - Стратегии

## Лицензия

MIT
