# TimescaleDB Migration Guide

This guide explains how to migrate from SQLite to PostgreSQL with TimescaleDB for OHLCV data storage.

## Why TimescaleDB?

- **10-100x faster** queries on time-series data
- **Automatic partitioning** by time (hypertables)
- **90% compression** for old data
- **Continuous aggregates** for pre-computed OHLC (1h → 4h, 1d)
- **Retention policies** for automatic cleanup

## Prerequisites

1. **PostgreSQL 13+** installed
2. **TimescaleDB extension** installed
3. Connection string for PostgreSQL

### Install TimescaleDB

#### Ubuntu/Debian
```bash
# Add TimescaleDB repository
sudo apt-get install -y wget
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo apt-key add -
sudo sh -c "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main' > /etc/apt/sources.list.d/timescaledb.list"
sudo apt-get update

# Install TimescaleDB
sudo apt-get install -y timescaledb-2-postgresql-15

# Configure PostgreSQL
sudo timescaledb-tune --quiet --yes
sudo systemctl restart postgresql
```

#### Docker (Recommended for Development)
```bash
docker run -d --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=password \
  timescale/timescaledb:latest-pg15
```

## Migration Steps

### 1. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE citarion;

# Connect to database
\c citarion

# Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### 2. Update Environment Variables

Create `.env` file:

```env
# PostgreSQL connection
DATABASE_URL="postgresql://postgres:password@localhost:5432/citarion?schema=public"

# Cron secret (optional)
CRON_SECRET="your-secret-key"
```

### 3. Update Prisma Schema

```bash
# Replace schema.prisma with PostgreSQL version
cp prisma/schema.postgresql.ts prisma/schema.prisma

# Or manually change provider in schema.prisma:
# provider = "postgresql"
```

### 4. Run Prisma Migration

```bash
# Generate Prisma client
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name init_postgresql
```

### 5. Run TimescaleDB Setup

```bash
# Connect to database
psql -U postgres -d citarion

# Run migration SQL
\i prisma/timescaledb-migration.sql
```

### 6. Migrate Existing Data (if any)

```bash
# If you have existing SQLite data, export it first:
sqlite3 prisma/dev.db ".dump" > sqlite_dump.sql

# Then import to PostgreSQL (adjust as needed)
psql -U postgres -d citarion < sqlite_dump.sql
```

## Post-Migration

### Verify Setup

```sql
-- Check hypertable
SELECT * FROM timescaledb_information.hypertables;

-- Check compression
SELECT * FROM timescaledb_information.compression_settings;

-- Check continuous aggregates
SELECT * FROM timescaledb_information.continuous_aggregates;
```

### Useful Queries

```sql
-- Get data size
SELECT hypertable_size('OhlcvCandle');

-- Get chunk info
SELECT * FROM chunk_compression_stats('OhlcvCandle');

-- Get compression stats
SELECT 
  chunk_name,
  before_compression_total_bytes,
  after_compression_total_bytes,
  ROUND((1 - after_compression_total_bytes::float / before_compression_total_bytes) * 100, 2) as compression_ratio
FROM chunk_compression_stats('OhlcvCandle')
ORDER BY chunk_name;
```

## Environment Variables for Production

```env
# PostgreSQL
DATABASE_URL="postgresql://user:password@host:5432/citarion?schema=public&sslmode=require"

# TimescaleDB
TIMESCALEDB_ENABLED="true"

# Cron secret for sync jobs
CRON_SECRET="your-production-secret"
```

## Performance Comparison

| Operation | SQLite | TimescaleDB |
|-----------|--------|-------------|
| Insert 1M candles | ~60s | ~5s |
| Query 1 year hourly | ~2s | ~50ms |
| Storage (1 year) | ~500MB | ~50MB (compressed) |
| Aggregation (1h→1d) | ~5s | Instant (pre-computed) |

## Troubleshooting

### Error: "hypertable already exists"
This is normal - the migration is idempotent.

### Error: "extension not found"
Make sure TimescaleDB is installed and enabled in PostgreSQL.

### Slow queries after migration
Make sure indexes are created and compression is applied:

```sql
-- Force compress old chunks
SELECT compress_chunk(c.chunk_name)
FROM timescaledb_information.chunks c
WHERE c.hypertable_name = 'OhlcvCandle'
AND c.is_compressed = false;
```
