# Документация по фреймворкам и технологиям

Этот раздел содержит локальную документацию по критически важным и специфичным компонентам проекта CITARION.

## Содержание

### База данных и ORM

- **[Prisma ORM](./prisma.md)** - Работа с базой данных SQLite, схемы, миграции, отношения между таблицами

### Аутентификация

- **[NextAuth.js](./next-auth.md)** - Аутентификация пользователей, сессии, провайдеры

### AI интеграции

- **[z-ai-web-dev-sdk](./z-ai-sdk.md)** - Интеграция с AI моделями, чат, генерация изображений, поиск

### Торговые алгоритмы

- **[@vibetrader/pinets](./pinets.md)** - Pine Script транскомпиляция, торговые индикаторы

### Графики и визуализация

| Библиотека | Назначение | Когда использовать |
|------------|------------|-------------------|
| **[lightweight-charts](./lightweight-charts.md)** | Свечные графики, OHLCV | Торговые графики, теханализ |
| **[Recharts](./recharts.md)** | Линии, области, бары, pie | Аналитика, статистика, дашборды |

### UI Компоненты

| Библиотека | Документация |
|------------|--------------|
| **[shadcn/ui](./shadcn-ui.md)** | Полная документация |
| Radix UI | Документация включена в shadcn/ui |
| Tailwind CSS | Документация включена в shadcn/ui |

### Формы и валидация

- **[react-hook-form + zod](./react-hook-form-zod.md)** - Управление формами и валидация, интеграция с shadcn/ui

---

## Быстрый старт

### Структура проекта

```
citarion/
├── prisma/
│   ├── schema.prisma          # Основная схема БД
│   └── migrations/            # Миграции
├── src/
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── indicators/        # Калькулятор индикаторов
│   │   └── ...                # Бизнес-логика
│   ├── components/
│   │   ├── ui/                # shadcn/ui компоненты
│   │   ├── chart/             # Графики (lightweight-charts)
│   │   ├── analytics/         # Аналитика (Recharts)
│   │   └── ...                # Кастомные компоненты
│   ├── stores/
│   │   └── crypto-store.ts    # Zustand store
│   └── app/
│       └── api/               # Next.js API routes
└── docs/
    ├── frameworks/            # Документация по фреймворкам
    └── exchanges/             # Документация по биржам
```

### Основные зависимости

| Категория | Технология | Версия | Назначение |
|-----------|------------|--------|------------|
| Runtime | Bun | latest | JavaScript runtime |
| Framework | Next.js | 16.x | React фреймворк |
| Database | SQLite | - | Встроенная БД |
| ORM | Prisma | 6.x | Работа с БД |
| Auth | NextAuth | 4.x | Аутентификация |
| Charts | lightweight-charts | 5.x | Финансовые графики |
| Analytics | Recharts | 2.x | Диаграммы и статистика |
| UI | shadcn/ui | latest | Компоненты |
| UI Primitives | Radix UI | latest | Доступные примитивы |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| Forms | react-hook-form | 7.x | Управление формами |
| Validation | zod | 4.x | Schema валидация |
| State | Zustand | 5.x | Управление состоянием |
| AI | z-ai-web-dev-sdk | 0.0.x | AI интеграции |
| Trading | @vibetrader/pinets | 0.5.x | Pine Script |

---

## Выбор библиотеки для графиков

### lightweight-charts vs Recharts

| Критерий | lightweight-charts | Recharts |
|----------|-------------------|----------|
| Свечи (OHLCV) | ✅ Отлично | ❌ Нет |
| Финансовые индикаторы | ✅ Да | ⚠️ Ограничено |
| Line/Area Charts | ✅ Да | ✅ Отлично |
| Bar Charts | ⚠️ Базовый | ✅ Отлично |
| Pie Charts | ❌ Нет | ✅ Да |
| Комбинации графиков | ⚠️ Сложно | ✅ ComposedChart |
| Производительность | ✅ Очень высокая | ⚠️ Средняя |
| Кастомизация | ⚠️ Средняя | ✅ Высокая |
| Объём данных | 100k+ точек | ~10k точек |

**Рекомендация:**
- Торговые графики (свечи, индикаторы) → **lightweight-charts**
- Аналитика, статистика, дашборды → **Recharts**

---

## Использование документации

Каждый документ содержит:

1. **Обзор** - краткое описание технологии и её роли в проекте
2. **Установка и настройка** - как подключить в проекте
3. **Примеры использования** - практические примеры из кода CITARION
4. **Лучшие практики** - рекомендации по использованию
5. **Решение проблем** - частые ошибки и их решения

---

## Связанные ресурсы

- [Документация бирж](../exchanges/README.md) - API документация бирж (Binance, Bybit, OKX, Bitget, BingX)
- [OHLCV система](../OHLCV-SYSTEM.md) - Система хранения свечей
- [TimescaleDB](../TIMESCALEDB.md) - Миграция на TimescaleDB
- [CORNIX Signal Format](../CORNIX_SIGNAL_FORMAT.md) - Формат торговых сигналов

---

## Внешняя документация

При необходимости можно обратиться к официальной документации:

| Технология | Ссылка |
|------------|--------|
| Prisma | https://www.prisma.io/docs |
| NextAuth.js | https://next-auth.js.org/ |
| lightweight-charts | https://tradingview.github.io/lightweight-charts/ |
| Recharts | https://recharts.org/ |
| react-hook-form | https://react-hook-form.com/ |
| zod | https://zod.dev/ |
| shadcn/ui | https://ui.shadcn.com/ |
| Tailwind CSS | https://tailwindcss.com/docs |
| Radix UI | https://www.radix-ui.com/primitives |
| Zustand | https://zustand-demo.pmnd.rs/ |
