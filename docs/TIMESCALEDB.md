# TimescaleDB Configuration

## Overview

TimescaleDB is a PostgreSQL extension for time-series data. It provides:
- **Hypertables**: Auto-partitioning by time
- **Compression**: 90% storage reduction for old data
- **Fast queries**: Optimized for time-based queries
- **Continuous aggregates**: Pre-computed aggregations

## Setup

### 1. Install PostgreSQL + TimescaleDB

```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib
sudo apt-get install timescaledb-2-postgresql-15

# macOS
brew install postgresql timescaledb

# Docker
docker run -d --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=password \
  timescale/timescaledb:latest-pg15
```

### 2. Create Database

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database
CREATE DATABASE citarion;

-- Connect to database
\c citarion

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### 3. Environment Variables

Create `.env` file:

```env
# PostgreSQL Connection
DATABASE_URL="postgresql://postgres:password@localhost:5432/citarion?schema=public"

# TimescaleDB enabled
TIMESCALE_ENABLED=true
```

### 4. Run Migration

```bash
# Generate Prisma client
bunx prisma generate

# Push schema to database
bunx prisma db push

# Run TimescaleDB setup script
psql -U postgres -d citarion -f prisma/timescaledb-setup.sql
```

## Schema Changes

The Prisma schema has been updated to use PostgreSQL with the following optimizations:
- Changed provider from `sqlite` to `postgresql`
- Added appropriate indexes for time-series queries
- Configured for TimescaleDB hypertables

## Hypertable Configuration

After running Prisma migration, execute:

```sql
-- Create hypertables for OHLCV data
SELECT create_hypertable('OhlcvCandle', 'openTime', if_not_exists => TRUE);

-- Create hypertable for funding rates
SELECT create_hypertable('FundingRateHistory', 'fundingTime', if_not_exists => TRUE);

-- Create hypertable for PnL history
SELECT create_hypertable('PnLHistory', 'timestamp', if_not_exists => TRUE);

-- Set compression settings (compress data older than 7 days)
ALTER TABLE "OhlcvCandle" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol,exchange,timeframe'
);

SELECT add_compression_policy('OhlcvCandle', INTERVAL '7 days');

-- Create continuous aggregates for daily stats
CREATE MATERIALIZED VIEW ohlcv_daily
WITH (timescaledb.continuous) AS
SELECT
  symbol,
  exchange,
  time_bucket('1 day', "openTime") AS day,
  first(open, "openTime") AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, "openTime") AS close,
  sum(volume) AS volume
FROM "OhlcvCandle"
GROUP BY symbol, exchange, day;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('ohlcv_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');
```

## Benefits

| Feature | SQLite | TimescaleDB |
|---------|--------|-------------|
| Storage | 100% | ~10% (90% compression) |
| Query speed (1 year data) | Slow | Fast |
| Concurrent writes | Limited | High |
| Time-based queries | Manual | Optimized |
| Auto-partitioning | No | Yes |
| Continuous aggregates | No | Yes |

## Migration from SQLite

If you have existing SQLite data:

1. Export data:
```bash
sqlite3 dev.db ".dump OhlcvCandle" > ohlcv_dump.sql
```

2. Convert and import to PostgreSQL:
```bash
pgloader sqlite://dev.db postgresql://postgres:password@localhost/citarion
```

Or use our migration script:
```bash
bun run scripts/migrate-to-timescaledb.ts
```
