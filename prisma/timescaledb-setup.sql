-- TimescaleDB Setup Script
-- Run this after Prisma migration to configure hypertables and compression

-- ============================================
-- 1. Create Hypertables
-- ============================================

-- OHLCV Candles (time-series data)
SELECT create_hypertable(
  '"OhlcvCandle"',
  '"openTime"',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Funding Rate History
SELECT create_hypertable(
  '"FundingRateHistory"',
  '"fundingTime"',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- PnL History
SELECT create_hypertable(
  '"PnLHistory"',
  '"timestamp"',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ============================================
-- 2. Configure Compression
-- ============================================

-- Enable compression for OHLCV candles
ALTER TABLE "OhlcvCandle" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol,exchange,timeframe',
  timescaledb.compress_orderby = '"openTime" DESC'
);

-- Add compression policy (compress data older than 7 days)
SELECT add_compression_policy(
  '"OhlcvCandle"',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Enable compression for Funding Rate History
ALTER TABLE "FundingRateHistory" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol,exchange',
  timescaledb.compress_orderby = '"fundingTime" DESC'
);

SELECT add_compression_policy(
  '"FundingRateHistory"',
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- ============================================
-- 3. Create Continuous Aggregates
-- ============================================

-- Daily OHLCV aggregate (pre-computed daily candles)
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_daily
WITH (timescaledb.continuous) AS
SELECT
  symbol,
  exchange,
  timeframe,
  time_bucket('1 day', "openTime") AS day,
  first(open, "openTime") AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, "openTime") AS close,
  sum(volume) AS volume,
  sum("quoteVolume") AS "quoteVolume",
  sum(trades) AS trades
FROM "OhlcvCandle"
WHERE "isFinal" = true
GROUP BY symbol, exchange, timeframe, day
WITH DATA;

-- Refresh policy for daily aggregate
SELECT add_continuous_aggregate_policy('ohlcv_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Hourly OHLCV aggregate (for quick queries)
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_hourly
WITH (timescaledb.continuous) AS
SELECT
  symbol,
  exchange,
  timeframe,
  time_bucket('1 hour', "openTime") AS hour,
  first(open, "openTime") AS open,
  max(high) AS high,
  min(low) AS low,
  last(close, "openTime") AS close,
  sum(volume) AS volume
FROM "OhlcvCandle"
WHERE "isFinal" = true AND timeframe IN ('1m', '5m', '15m')
GROUP BY symbol, exchange, timeframe, hour
WITH DATA;

SELECT add_continuous_aggregate_policy('ohlcv_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '10 minutes',
  schedule_interval => INTERVAL '10 minutes',
  if_not_exists => TRUE
);

-- ============================================
-- 4. Create Additional Indexes
-- ============================================

-- Optimize for common query patterns
CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_time
ON "OhlcvCandle" (symbol, "openTime" DESC);

CREATE INDEX IF NOT EXISTS idx_ohlcv_exchange_symbol_time
ON "OhlcvCandle" (exchange, symbol, "openTime" DESC);

CREATE INDEX IF NOT EXISTS idx_ohlcv_timeframe_time
ON "OhlcvCandle" (timeframe, "openTime" DESC);

-- ============================================
-- 5. Retention Policies (Optional)
-- ============================================

-- Keep 1-minute candles for 30 days
SELECT add_retention_policy(
  '"OhlcvCandle"',
  INTERVAL '30 days',
  if_not_exists => TRUE,
  chunk_valid_for => INTERVAL '1 day'
);

-- ============================================
-- 6. Performance Views
-- ============================================

-- View for latest prices
CREATE OR REPLACE VIEW latest_prices AS
SELECT DISTINCT ON (symbol, exchange)
  symbol,
  exchange,
  close AS price,
  volume,
  "openTime" AS last_update
FROM "OhlcvCandle"
ORDER BY symbol, exchange, "openTime" DESC;

-- ============================================
-- 7. Functions for Data Management
-- ============================================

-- Function to get candles efficiently
CREATE OR REPLACE FUNCTION get_ohlcv(
  p_symbol TEXT,
  p_exchange TEXT DEFAULT 'binance',
  p_timeframe TEXT DEFAULT '1h',
  p_start_time TIMESTAMPTZ DEFAULT NULL,
  p_end_time TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
  open_time TIMESTAMPTZ,
  open FLOAT,
  high FLOAT,
  low FLOAT,
  close FLOAT,
  volume FLOAT
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    "openTime"::TIMESTAMPTZ,
    open,
    high,
    low,
    close,
    volume
  FROM "OhlcvCandle"
  WHERE
    symbol = p_symbol
    AND exchange = p_exchange
    AND timeframe = p_timeframe
    AND (p_start_time IS NULL OR "openTime" >= p_start_time)
    AND (p_end_time IS NULL OR "openTime" <= p_end_time)
  ORDER BY "openTime" ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 8. Statistics Views
-- ============================================

-- View for storage statistics
CREATE OR REPLACE VIEW timescaledb_stats AS
SELECT
  hypertable_name,
  num_chunks,
  pg_size_pretty(total_bytes) as total_size,
  pg_size_pretty(compressed_bytes) as compressed_size,
  CASE
    WHEN total_bytes > 0
    THEN round(100 * compressed_bytes::numeric / total_bytes, 2)
    ELSE 0
  END as compression_ratio
FROM timescaledb_information.chunks
JOIN timescaledb_information.hypertables ON chunks.hypertable_name = hypertables.hypertable_name;

-- ============================================
-- Done!
-- ============================================
-- TimescaleDB is now configured with:
-- - Hypertables for time-series data
-- - Automatic compression for old data
-- - Continuous aggregates for fast queries
-- - Retention policies for data management
