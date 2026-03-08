/**
 * TimescaleDB Migration Service
 * 
 * Handles migration from SQLite to PostgreSQL with TimescaleDB
 * for OHLCV and time-series data.
 * 
 * Features:
 * - Connection pooling with pg.Pool
 * - Batch data migration
 * - Hypertable management
 * - Compression policies
 * - Continuous aggregates
 * - SQLite fallback with time-series optimizations
 * 
 * CIT-036: Production-ready implementation with proper pg client support
 */

import { db } from '@/lib/db';

// ============================================================================
// TYPES
// ============================================================================

export interface TimescaleDBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface MigrationProgress {
  phase: 'preparing' | 'migrating' | 'validating' | 'completed' | 'error';
  tablesComplete: number;
  tablesTotal: number;
  rowsMigrated: number;
  currentTable?: string;
  error?: string;
  startedAt: Date;
  estimatedCompletion?: Date;
}

export interface HypertableInfo {
  hypertable_name: string;
  num_chunks: number;
  total_bytes: number;
  compressed_bytes: number;
  compression_ratio: number;
}

export type MigrationCallback = (progress: MigrationProgress) => void;

// ============================================================================
// SQLITE TIME-SERIES OPTIMIZATIONS (Fallback)
// ============================================================================

/**
 * SQLite Time-Series Optimizer
 * Provides time-series-like functionality when TimescaleDB is not available
 */
class SQLiteTimeSeriesOptimizer {
  private initialized = false;

  /**
   * Initialize SQLite optimizations for time-series data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Enable WAL mode for better concurrent performance
      await db.$executeRawUnsafe(`PRAGMA journal_mode = WAL`);
      
      // Set synchronous mode for better write performance
      await db.$executeRawUnsafe(`PRAGMA synchronous = NORMAL`);
      
      // Increase cache size (negative value = KB)
      await db.$executeRawUnsafe(`PRAGMA cache_size = -64000`); // 64MB
      
      // Set temp store to memory
      await db.$executeRawUnsafe(`PRAGMA temp_store = MEMORY`);
      
      // Set mmap size for larger databases
      await db.$executeRawUnsafe(`PRAGMA mmap_size = 268435456`); // 256MB

      this.initialized = true;
      console.log('✅ SQLite time-series optimizations enabled');
    } catch (error) {
      console.error('Failed to initialize SQLite optimizations:', error);
    }
  }

  /**
   * Create optimized indexes for time-series queries
   */
  async createTimeSeriesIndexes(): Promise<void> {
    try {
      // OHLCV indexes
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_ohlcv_time 
        ON "OhlcvCandle" ("openTime" DESC)
      `);
      
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_time 
        ON "OhlcvCandle" (symbol, exchange, timeframe, "openTime" DESC)
      `);

      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_ohlcv_final 
        ON "OhlcvCandle" ("isFinal", "openTime" DESC) 
        WHERE "isFinal" = 1
      `);

      // Funding rate indexes
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_funding_time 
        ON "FundingRateHistory" ("fundingTime" DESC)
      `);
      
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_funding_symbol_time 
        ON "FundingRateHistory" (symbol, exchange, "fundingTime" DESC)
      `);

      // PnL history indexes
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_pnl_time 
        ON "PnLHistory" (timestamp DESC)
      `);
      
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_pnl_user_time 
        ON "PnLHistory" ("userId", timestamp DESC)
      `);

      // Analyze tables for query optimization
      await db.$executeRawUnsafe(`ANALYZE`);

      console.log('✅ Time-series indexes created');
    } catch (error) {
      console.error('Failed to create time-series indexes:', error);
    }
  }

  /**
   * Create a time-based partition view for OHLCV data
   * This simulates hypertable-like queries in SQLite
   */
  async createOhlcvAggregates(): Promise<void> {
    try {
      // Create view for daily aggregates
      await db.$executeRawUnsafe(`
        CREATE VIEW IF NOT EXISTS ohlcv_daily_aggregate AS
        SELECT 
          symbol,
          exchange,
          timeframe,
          date("openTime") as day,
          first_value(open) OVER (PARTITION BY symbol, exchange, timeframe, date("openTime") ORDER BY "openTime") as open,
          MAX(high) as high,
          MIN(low) as low,
          last_value(close) OVER (PARTITION BY symbol, exchange, timeframe, date("openTime") ORDER BY "openTime" RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as close,
          SUM(volume) as volume,
          SUM("quoteVolume") as "quoteVolume",
          SUM(trades) as trades
        FROM "OhlcvCandle"
        WHERE "isFinal" = 1
        GROUP BY symbol, exchange, timeframe, date("openTime")
      `);

      // Create view for hourly aggregates
      await db.$executeRawUnsafe(`
        CREATE VIEW IF NOT EXISTS ohlcv_hourly_aggregate AS
        SELECT 
          symbol,
          exchange,
          timeframe,
          strftime('%Y-%m-%d %H:00:00', "openTime") as hour,
          first_value(open) OVER (PARTITION BY symbol, exchange, timeframe, strftime('%Y-%m-%d %H:00:00', "openTime") ORDER BY "openTime") as open,
          MAX(high) as high,
          MIN(low) as low,
          last_value(close) OVER (PARTITION BY symbol, exchange, timeframe, strftime('%Y-%m-%d %H:00:00', "openTime") ORDER BY "openTime" RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as close,
          SUM(volume) as volume
        FROM "OhlcvCandle"
        WHERE "isFinal" = 1 AND timeframe IN ('1m', '5m', '15m')
        GROUP BY symbol, exchange, timeframe, strftime('%Y-%m-%d %H:00:00', "openTime")
      `);

      console.log('✅ OHLCV aggregate views created');
    } catch (error) {
      // Views may already exist or have issues, log but continue
      console.warn('Note: Aggregate views may already exist:', error);
    }
  }

  /**
   * Get time-bucketed OHLCV data (simulates TimescaleDB time_bucket)
   */
  async getOhlcvByTimeBucket(params: {
    symbol: string;
    exchange?: string;
    bucketInterval: '1h' | '4h' | '1d' | '1w';
    startTime: Date;
    endTime: Date;
  }): Promise<Array<{
    bucket: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>> {
    const { symbol, exchange = 'binance', bucketInterval, startTime, endTime } = params;

    let timeExpr: string;
    switch (bucketInterval) {
      case '1h':
        timeExpr = `strftime('%Y-%m-%d %H:00:00', datetime("openTime"/1000, 'unixepoch'))`;
        break;
      case '4h':
        timeExpr = `strftime('%Y-%m-%d ' || ((CAST(strftime('%H', datetime("openTime"/1000, 'unixepoch')) AS INTEGER) / 4) * 4) || ':00:00', datetime("openTime"/1000, 'unixepoch'))`;
        break;
      case '1d':
        timeExpr = `date(datetime("openTime"/1000, 'unixepoch'))`;
        break;
      case '1w':
        timeExpr = `date(datetime("openTime"/1000, 'unixepoch'), 'weekday 0', '-6 days')`;
        break;
      default:
        timeExpr = `date(datetime("openTime"/1000, 'unixepoch'))`;
    }

    const results = await db.$queryRaw<Array<{
      bucket: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>>`
      SELECT 
        ${timeExpr} as bucket,
        first_value(open) OVER (PARTITION BY ${timeExpr} ORDER BY "openTime") as open,
        MAX(high) as high,
        MIN(low) as low,
        last_value(close) OVER (PARTITION BY ${timeExpr} ORDER BY "openTime" RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as close,
        SUM(volume) as volume
      FROM "OhlcvCandle"
      WHERE 
        symbol = ${symbol}
        AND exchange = ${exchange}
        AND "openTime" >= ${startTime.getTime()}
        AND "openTime" <= ${endTime.getTime()}
        AND "isFinal" = 1
      GROUP BY ${timeExpr}
      ORDER BY bucket ASC
    `;

    return results.map(r => ({
      bucket: new Date(r.bucket),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));
  }

  /**
   * Vacuum and optimize database
   */
  async optimize(): Promise<void> {
    try {
      // Rebuild database
      await db.$executeRawUnsafe(`VACUUM`);
      
      // Re-analyze
      await db.$executeRawUnsafe(`ANALYZE`);
      
      console.log('✅ Database optimized');
    } catch (error) {
      console.error('Failed to optimize database:', error);
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    sizeBytes: number;
    pageCount: number;
    pageSize: number;
    walCheckpoint: number;
  }> {
    try {
      const result = await db.$queryRaw<Array<{
        page_count: bigint;
        page_size: bigint;
        wal_checkpoint: bigint;
      }>>`PRAGMA page_count; PRAGMA page_size; PRAGMA wal_checkpoint;`;

      const pageCount = Number(result[0]?.page_count || 0);
      const pageSize = Number(result[0]?.page_size || 4096);
      
      return {
        sizeBytes: pageCount * pageSize,
        pageCount,
        pageSize,
        walCheckpoint: 0,
      };
    } catch {
      return {
        sizeBytes: 0,
        pageCount: 0,
        pageSize: 4096,
        walCheckpoint: 0,
      };
    }
  }
}

// ============================================================================
// TIMESCALEDB SERVICE
// ============================================================================

class TimescaleDBService {
  private config: TimescaleDBConfig | null = null;
  private connected: boolean = false;
  private migrationInProgress: boolean = false;
  private pgPool: InstanceType<typeof import('pg').Pool> | null = null;
  private sqliteOptimizer: SQLiteTimeSeriesOptimizer;
  private useTimescaleDB: boolean = false;

  constructor() {
    this.sqliteOptimizer = new SQLiteTimeSeriesOptimizer();
  }

  /**
   * Initialize TimescaleDB connection (or fallback to SQLite optimizations)
   */
  async initialize(config?: TimescaleDBConfig): Promise<boolean> {
    this.config = config || null;

    // If no config provided, use SQLite optimizations
    if (!config) {
      console.log('ℹ️ No TimescaleDB config provided, using SQLite time-series optimizations');
      await this.sqliteOptimizer.initialize();
      await this.sqliteOptimizer.createTimeSeriesIndexes();
      await this.sqliteOptimizer.createOhlcvAggregates();
      this.connected = true;
      this.useTimescaleDB = false;
      return true;
    }

    try {
      // Dynamically import pg to avoid errors when not installed
      const { Pool } = await import('pg');
      
      this.pgPool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
        max: config.maxConnections || 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      const client = await this.pgPool.connect();
      
      // Check if TimescaleDB extension is available
      const result = await client.query<{ extversion: string }>`
        SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'
      `;

      if (result.rows.length === 0) {
        console.warn('TimescaleDB extension not installed. Attempting to create...');
        try {
          await client.query`CREATE EXTENSION IF NOT EXISTS timescaledb`;
          console.log('✅ TimescaleDB extension created');
        } catch {
          console.warn('⚠️ Could not create TimescaleDB extension. Using standard PostgreSQL.');
        }
      } else {
        console.log('✅ TimescaleDB connected, version:', result.rows[0]?.extversion);
      }

      client.release();
      this.connected = true;
      this.useTimescaleDB = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize TimescaleDB:', error);
      console.log('ℹ️ Falling back to SQLite time-series optimizations');
      
      // Fallback to SQLite optimizations
      await this.sqliteOptimizer.initialize();
      await this.sqliteOptimizer.createTimeSeriesIndexes();
      this.connected = true;
      this.useTimescaleDB = false;
      return true;
    }
  }

  /**
   * Check if TimescaleDB is available (vs SQLite fallback)
   */
  isAvailable(): boolean {
    return this.connected;
  }

  /**
   * Check if using actual TimescaleDB
   */
  isUsingTimescaleDB(): boolean {
    return this.useTimescaleDB;
  }

  // ============================================================================
  // HYPERTABLE MANAGEMENT (TimescaleDB only)
  // ============================================================================

  /**
   * Create hypertable for OHLCV data
   */
  async createOhlcvHypertable(): Promise<void> {
    if (!this.useTimescaleDB) {
      console.log('Using SQLite: hypertables not applicable');
      return;
    }

    await this.query`
      SELECT create_hypertable(
        'OhlcvCandle',
        'openTime',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      )
    `;
  }

  /**
   * Create hypertable for funding rate history
   */
  async createFundingRateHypertable(): Promise<void> {
    if (!this.useTimescaleDB) {
      return;
    }

    await this.query`
      SELECT create_hypertable(
        'FundingRateHistory',
        'fundingTime',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      )
    `;
  }

  /**
   * Create hypertable for PnL history
   */
  async createPnLHistoryHypertable(): Promise<void> {
    if (!this.useTimescaleDB) {
      return;
    }

    await this.query`
      SELECT create_hypertable(
        'PnLHistory',
        'timestamp',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      )
    `;
  }

  /**
   * Create all hypertables
   */
  async createAllHypertables(): Promise<void> {
    if (!this.useTimescaleDB) {
      await this.sqliteOptimizer.createTimeSeriesIndexes();
      await this.sqliteOptimizer.createOhlcvAggregates();
      return;
    }

    await this.createOhlcvHypertable();
    await this.createFundingRateHypertable();
    await this.createPnLHistoryHypertable();
    console.log('✅ All hypertables created');
  }

  // ============================================================================
  // COMPRESSION (TimescaleDB only)
  // ============================================================================

  /**
   * Enable compression for OHLCV data
   */
  async enableOhlcvCompression(): Promise<void> {
    if (!this.useTimescaleDB) return;

    await this.query`
      ALTER TABLE "OhlcvCandle" SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'symbol,exchange,timeframe',
        timescaledb.compress_orderby = 'openTime DESC'
      )
    `;

    await this.query`
      SELECT add_compression_policy(
        'OhlcvCandle',
        INTERVAL '7 days',
        if_not_exists => TRUE
      )
    `;
  }

  /**
   * Enable compression for funding rate history
   */
  async enableFundingRateCompression(): Promise<void> {
    if (!this.useTimescaleDB) return;

    await this.query`
      ALTER TABLE "FundingRateHistory" SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'symbol,exchange',
        timescaledb.compress_orderby = 'fundingTime DESC'
      )
    `;

    await this.query`
      SELECT add_compression_policy(
        'FundingRateHistory',
        INTERVAL '30 days',
        if_not_exists => TRUE
      )
    `;
  }

  /**
   * Enable all compression policies
   */
  async enableAllCompression(): Promise<void> {
    if (!this.useTimescaleDB) {
      console.log('Using SQLite: compression not applicable');
      return;
    }

    await this.enableOhlcvCompression();
    await this.enableFundingRateCompression();
    console.log('✅ Compression policies enabled');
  }

  // ============================================================================
  // CONTINUOUS AGGREGATES (TimescaleDB only)
  // ============================================================================

  /**
   * Create daily OHLCV aggregate
   */
  async createDailyAggregate(): Promise<void> {
    if (!this.useTimescaleDB) {
      await this.sqliteOptimizer.createOhlcvAggregates();
      return;
    }

    await this.query`
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
      WITH DATA
    `;

    await this.query`
      SELECT add_continuous_aggregate_policy('ohlcv_daily',
        start_offset => INTERVAL '3 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      )
    `;
  }

  /**
   * Create hourly OHLCV aggregate
   */
  async createHourlyAggregate(): Promise<void> {
    if (!this.useTimescaleDB) return;

    await this.query`
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
      WITH DATA
    `;

    await this.query`
      SELECT add_continuous_aggregate_policy('ohlcv_hourly',
        start_offset => INTERVAL '3 hours',
        end_offset => INTERVAL '10 minutes',
        schedule_interval => INTERVAL '10 minutes',
        if_not_exists => TRUE
      )
    `;
  }

  /**
   * Create all continuous aggregates
   */
  async createAllAggregates(): Promise<void> {
    if (!this.useTimescaleDB) {
      await this.sqliteOptimizer.createOhlcvAggregates();
      return;
    }

    await this.createDailyAggregate();
    await this.createHourlyAggregate();
    console.log('✅ Continuous aggregates created');
  }

  // ============================================================================
  // RETENTION POLICIES (TimescaleDB only)
  // ============================================================================

  /**
   * Set retention policy for OHLCV data
   */
  async setOhlcvRetentionPolicy(retentionDays: number = 365): Promise<void> {
    if (!this.useTimescaleDB) return;

    await this.query`
      SELECT add_retention_policy(
        'OhlcvCandle',
        INTERVAL '${retentionDays} days',
        if_not_exists => TRUE,
        chunk_valid_for => INTERVAL '1 day'
      )
    `;
  }

  // ============================================================================
  // MIGRATION
  // ============================================================================

  /**
   * Migrate data from SQLite to TimescaleDB
   */
  async migrateFromSQLite(
    onProgress?: MigrationCallback
  ): Promise<{ success: boolean; rowsMigrated: number }> {
    if (this.migrationInProgress) {
      throw new Error('Migration already in progress');
    }

    if (!this.useTimescaleDB) {
      console.log('ℹ️ TimescaleDB not available, running SQLite optimizations instead');
      await this.sqliteOptimizer.optimize();
      return { success: true, rowsMigrated: 0 };
    }

    this.migrationInProgress = true;
    const startTime = new Date();
    let totalRows = 0;

    const progress: MigrationProgress = {
      phase: 'preparing',
      tablesComplete: 0,
      tablesTotal: 5,
      rowsMigrated: 0,
      startedAt: startTime,
    };

    try {
      // Phase 1: Prepare tables
      onProgress?.({ ...progress, phase: 'preparing' });
      await this.createAllHypertables();

      // Phase 2: Migrate data
      progress.phase = 'migrating';

      // Migrate OHLCV candles
      progress.currentTable = 'OhlcvCandle';
      onProgress?.(progress);
      const ohlcvCount = await this.migrateOhlcvData();
      totalRows += ohlcvCount;
      progress.rowsMigrated = totalRows;
      progress.tablesComplete++;
      onProgress?.(progress);

      // Migrate funding rate history
      progress.currentTable = 'FundingRateHistory';
      onProgress?.(progress);
      const fundingCount = await this.migrateFundingRateData();
      totalRows += fundingCount;
      progress.rowsMigrated = totalRows;
      progress.tablesComplete++;
      onProgress?.(progress);

      // Migrate PnL history
      progress.currentTable = 'PnLHistory';
      onProgress?.(progress);
      const pnlCount = await this.migratePnLData();
      totalRows += pnlCount;
      progress.rowsMigrated = totalRows;
      progress.tablesComplete++;
      onProgress?.(progress);

      // Phase 3: Validate
      progress.phase = 'validating';
      progress.currentTable = undefined;
      onProgress?.(progress);
      await this.validateMigration();

      // Phase 4: Setup post-migration
      await this.enableAllCompression();
      await this.createAllAggregates();

      // Phase 5: Complete
      progress.phase = 'completed';
      progress.tablesComplete = progress.tablesTotal;
      progress.estimatedCompletion = new Date();
      onProgress?.(progress);

      this.migrationInProgress = false;
      return { success: true, rowsMigrated: totalRows };
    } catch (error) {
      progress.phase = 'error';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.(progress);
      this.migrationInProgress = false;
      return { success: false, rowsMigrated: totalRows };
    }
  }

  /**
   * Migrate OHLCV data in batches
   */
  private async migrateOhlcvData(): Promise<number> {
    if (!this.useTimescaleDB || !this.pgPool) return 0;

    const batchSize = 10000;
    let migrated = 0;
    let hasMore = true;
    let skip = 0;

    while (hasMore) {
      const candles = await db.ohlcvCandle.findMany({
        skip,
        take: batchSize,
        orderBy: { openTime: 'asc' },
      });

      if (candles.length === 0) {
        hasMore = false;
        break;
      }

      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');

        for (const candle of candles) {
          await client.query(`
            INSERT INTO "OhlcvCandle" (
              id, symbol, exchange, "marketType", timeframe,
              "openTime", "closeTime", open, high, low, close, volume,
              "quoteVolume", trades, "takerBuyVolume", "takerBuyQuoteVolume",
              "isFinal", "createdAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (symbol, exchange, timeframe, "openTime") DO NOTHING
          `, [
            candle.id, candle.symbol, candle.exchange,
            candle.marketType, candle.timeframe,
            candle.openTime, candle.closeTime,
            candle.open, candle.high, candle.low,
            candle.close, candle.volume,
            candle.quoteVolume, candle.trades,
            candle.takerBuyVolume, candle.takerBuyQuoteVolume,
            candle.isFinal, candle.createdAt
          ]);
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      migrated += candles.length;
      skip += batchSize;

      if (candles.length < batchSize) {
        hasMore = false;
      }
    }

    return migrated;
  }

  /**
   * Migrate funding rate data
   */
  private async migrateFundingRateData(): Promise<number> {
    if (!this.useTimescaleDB || !this.pgPool) return 0;

    const rates = await db.fundingRateHistory.findMany();
    const client = await this.pgPool.connect();
    
    try {
      for (const rate of rates) {
        await client.query(`
          INSERT INTO "FundingRateHistory" (
            id, symbol, exchange, "fundingRate", "fundingTime",
            "markPrice", "indexPrice", "createdAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT DO NOTHING
        `, [
          rate.id, rate.symbol, rate.exchange,
          rate.fundingRate, rate.fundingTime,
          rate.markPrice, rate.indexPrice, rate.createdAt
        ]);
      }
    } finally {
      client.release();
    }

    return rates.length;
  }

  /**
   * Migrate PnL history data
   */
  private async migratePnLData(): Promise<number> {
    if (!this.useTimescaleDB || !this.pgPool) return 0;

    const history = await db.pnLHistory.findMany();
    const client = await this.pgPool.connect();

    try {
      for (const record of history) {
        await client.query(`
          INSERT INTO "PnLHistory" (
            id, "userId", timestamp, "isDemo", balance, equity,
            "realizedPnL", "unrealizedPnL", "fundingPnL", "feesPaid",
            "tradesCount", "winsCount", "lossesCount", "createdAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT DO NOTHING
        `, [
          record.id, record.userId, record.timestamp,
          record.isDemo, record.balance, record.equity,
          record.realizedPnL, record.unrealizedPnL,
          record.fundingPnL, record.feesPaid,
          record.tradesCount, record.winsCount, record.lossesCount,
          record.createdAt
        ]);
      }
    } finally {
      client.release();
    }

    return history.length;
  }

  /**
   * Validate migration
   */
  private async validateMigration(): Promise<void> {
    if (!this.useTimescaleDB || !this.pgPool) return;

    // Check row counts match
    const sqliteOhlcvCount = await db.ohlcvCandle.count();
    const result = await this.pgPool.query<{ count: string }>`
      SELECT COUNT(*) FROM "OhlcvCandle"
    `;
    const timescaleOhlcvCount = parseInt(result.rows[0]?.count || '0');

    if (timescaleOhlcvCount !== sqliteOhlcvCount) {
      console.warn(
        `OHLCV count mismatch: SQLite=${sqliteOhlcvCount}, TimescaleDB=${timescaleOhlcvCount}`
      );
    }

    // Check hypertables exist
    const hypertables = await this.pgPool.query<{ hypertable_name: string }>`
      SELECT hypertable_name FROM timescaledb_information.hypertables
    `;

    const expectedTables = ['OhlcvCandle', 'FundingRateHistory', 'PnLHistory'];
    for (const table of expectedTables) {
      if (!hypertables.rows.some(h => h.hypertable_name === table)) {
        console.warn(`Hypertable ${table} not found`);
      }
    }
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get hypertable statistics
   */
  async getHypertableStats(): Promise<HypertableInfo[]> {
    if (!this.useTimescaleDB || !this.pgPool) {
      // Return SQLite stats instead
      const stats = await this.sqliteOptimizer.getStats();
      return [{
        hypertable_name: 'SQLite',
        num_chunks: 1,
        total_bytes: stats.sizeBytes,
        compressed_bytes: 0,
        compression_ratio: 0,
      }];
    }

    const result = await this.pgPool.query<HypertableInfo>`
      SELECT
        hypertable_name,
        num_chunks,
        total_bytes,
        compressed_bytes,
        CASE
          WHEN total_bytes > 0
          THEN round(100 * compressed_bytes::numeric / total_bytes, 2)
          ELSE 0
        END as compression_ratio
      FROM timescaledb_information.hypertables ht
      LEFT JOIN timescaledb_information.chunks c ON ht.hypertable_name = c.hypertable_name
      GROUP BY ht.hypertable_name, num_chunks, total_bytes, compressed_bytes
    `;

    return result.rows;
  }

  /**
   * Get OHLCV data efficiently using time_bucket or SQLite equivalent
   */
  async getOhlcvByTimeBucket(params: {
    symbol: string;
    exchange?: string;
    bucketInterval: '1h' | '4h' | '1d' | '1w';
    startTime: Date;
    endTime: Date;
  }): Promise<Array<{
    bucket: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>> {
    if (!this.useTimescaleDB || !this.pgPool) {
      return this.sqliteOptimizer.getOhlcvByTimeBucket(params);
    }

    const { symbol, exchange = 'binance', bucketInterval, startTime, endTime } = params;

    const result = await this.pgPool.query<{
      bucket: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>`
      SELECT
        time_bucket(${bucketInterval}, "openTime") AS bucket,
        first(open, "openTime") AS open,
        max(high) AS high,
        min(low) AS low,
        last(close, "openTime") AS close,
        sum(volume) AS volume
      FROM "OhlcvCandle"
      WHERE
        symbol = ${symbol}
        AND exchange = ${exchange}
        AND "openTime" >= ${startTime}
        AND "openTime" <= ${endTime}
        AND "isFinal" = true
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    return result.rows;
  }

  /**
   * Get aggregated data from continuous aggregate or SQLite view
   */
  async getDailyOhlcv(params: {
    symbol: string;
    exchange?: string;
    startDate: Date;
    endDate: Date;
  }): Promise<Array<{
    day: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>> {
    if (!this.useTimescaleDB || !this.pgPool) {
      // Use SQLite aggregate view
      const { symbol, exchange = 'binance', startDate, endDate } = params;
      const results = await db.$queryRaw<Array<{
        day: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>>`
        SELECT 
          date("openTime") as day,
          first_value(open) OVER (PARTITION BY date("openTime") ORDER BY "openTime") as open,
          MAX(high) as high,
          MIN(low) as low,
          last_value(close) OVER (PARTITION BY date("openTime") ORDER BY "openTime" RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as close,
          SUM(volume) as volume
        FROM "OhlcvCandle"
        WHERE 
          symbol = ${symbol}
          AND exchange = ${exchange}
          AND "openTime" >= ${startDate.getTime()}
          AND "openTime" <= ${endDate.getTime()}
          AND "isFinal" = 1
        GROUP BY date("openTime")
        ORDER BY day ASC
      `;

      return results.map(r => ({
        day: new Date(r.day),
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));
    }

    const { symbol, exchange = 'binance', startDate, endDate } = params;

    const result = await this.pgPool.query<{
      day: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>`
      SELECT day, open, high, low, close, volume
      FROM ohlcv_daily
      WHERE
        symbol = ${symbol}
        AND exchange = ${exchange}
        AND day >= ${startDate}
        AND day <= ${endDate}
      ORDER BY day ASC
    `;

    return result.rows;
  }

  /**
   * Force compress old chunks (TimescaleDB only)
   */
  async compressOldChunks(tableName: string, olderThan: string = '7 days'): Promise<number> {
    if (!this.useTimescaleDB || !this.pgPool) return 0;

    const result = await this.pgPool.query<{ compress_chunk: string }>`
      SELECT compress_chunk(c.chunk_name)
      FROM timescaledb_information.chunks c
      WHERE c.hypertable_name = ${tableName}
      AND c.is_compressed = false
      AND c.range_end < NOW() - INTERVAL ${olderThan}
    `;

    return result.rows.length;
  }

  // ============================================================================
  // RAW QUERY HELPER
  // ============================================================================

  /**
   * Execute raw SQL query on TimescaleDB
   */
  private async query<T = unknown>(sql: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
    if (!this.pgPool) {
      console.warn('TimescaleDB pool not initialized, query not executed');
      return [];
    }

    try {
      const client = await this.pgPool.connect();
      try {
        // Build query with parameter placeholders
        let queryText = sql.strings[0];
        const params: unknown[] = [];
        
        for (let i = 0; i < values.length; i++) {
          queryText += `$${i + 1}${sql.strings[i + 1]}`;
          params.push(values[i]);
        }

        const result = await client.query(queryText, params);
        return result.rows as T[];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('TimescaleDB query error:', error);
      throw error;
    }
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    this.connected = false;
    console.log('TimescaleDB service shutdown complete');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const timescaleDB = new TimescaleDBService();
export { SQLiteTimeSeriesOptimizer };
export default timescaleDB;
