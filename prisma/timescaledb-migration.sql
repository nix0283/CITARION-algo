-- TimescaleDB Migration for OHLCV Data
-- Run this after setting up PostgreSQL with TimescaleDB extension

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create hypertable from OhlcvCandle table
-- This enables automatic partitioning by time
SELECT create_hypertable(
  'OhlcvCandle',
  'openTime',
  if_not_exists => TRUE,
  partitioning_column => 'symbol',
  number_partitions => 4
);

-- Add compression policy (compress data older than 7 days)
ALTER TABLE "OhlcvCandle" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol,exchange,timeframe',
  timescaledb.compress_orderby = 'openTime DESC'
);

SELECT add_compression_policy(
  'OhlcvCandle',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Add retention policy (delete data older than 365 days - optional)
-- Uncomment if you want automatic cleanup
-- SELECT add_retention_policy('OhlcvCandle', INTERVAL '365 days', if_not_exists => TRUE);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_time 
  ON "OhlcvCandle" (symbol, openTime DESC);

CREATE INDEX IF NOT EXISTS idx_ohlcv_exchange_time 
  ON "OhlcvCandle" (exchange, openTime DESC);

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_exchange_timeframe 
  ON "OhlcvCandle" (symbol, exchange, timeframe, openTime DESC);

-- Create continuous aggregate for daily OHLC (pre-aggregated data)
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_daily
WITH (timescaledb.continuous) AS
SELECT 
  symbol,
  exchange,
  marketType,
  time_bucket('1 day', openTime) AS bucket,
  FIRST(open, openTime) AS open,
  MAX(high) AS high,
  MIN(low) AS low,
  LAST(close, openTime) AS close,
  SUM(volume) AS volume,
  SUM("quoteVolume") AS "quoteVolume",
  SUM(trades) AS trades
FROM "OhlcvCandle"
WHERE timeframe = '1h' AND "isFinal" = true
GROUP BY symbol, exchange, marketType, bucket
WITH DATA;

-- Refresh policy for daily aggregate (refresh every hour)
SELECT add_continuous_aggregate_policy('ohlcv_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Create continuous aggregate for 4h OHLC
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_4h
WITH (timescaledb.continuous) AS
SELECT 
  symbol,
  exchange,
  marketType,
  time_bucket('4 hours', openTime) AS bucket,
  FIRST(open, openTime) AS open,
  MAX(high) AS high,
  MIN(low) AS low,
  LAST(close, openTime) AS close,
  SUM(volume) AS volume,
  SUM("quoteVolume") AS "quoteVolume"
FROM "OhlcvCandle"
WHERE timeframe = '1h' AND "isFinal" = true
GROUP BY symbol, exchange, marketType, bucket
WITH DATA;

SELECT add_continuous_aggregate_policy('ohlcv_4h',
  start_offset => INTERVAL '12 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

-- Grant permissions (adjust username as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;

-- Useful queries for monitoring
-- SELECT hypertable_size('OhlcvCandle');
-- SELECT * FROM timescaledb_information.compression_settings WHERE hypertable_name = 'OhlcvCandle';
-- SELECT * FROM chunk_compression_stats('OhlcvCandle');
