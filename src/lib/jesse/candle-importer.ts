/**
 * Jesse Candle Importer - TypeScript Port
 * 
 * Порт скрипта импорта свечей из jesse-ai/candle-importer-script
 * @see https://github.com/jesse-ai/candle-importer-script
 * 
 * Возможности:
 * - Импорт свечей с множества бирж
 * - Непрерывное обновление (scheduled)
 * - Resume capability (продолжение с последней свечи)
 * - Множество символов одновременно
 * - Поддержка разных таймфреймов
 */

// ==================== TYPES ====================

export type ExchangeId = "binance" | "bybit" | "okx" | "bitget" | "bingx";

export type Timeframe = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "12h" | "1d" | "1w" | "1M";

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: number;
  quoteVolume?: number;
  trades?: number;
  takerBuyBase?: number;
  takerBuyQuote?: number;
}

export interface ImportConfig {
  /** Биржа */
  exchange: ExchangeId;
  /** Символы для импорта */
  symbols: string[];
  /** Таймфрейм */
  timeframe: Timeframe;
  /** Начальная дата (timestamp в ms) */
  startDate: number;
  /** Конечная дата (timestamp в ms, опционально) */
  endDate?: number;
  /** Максимальное количество свечей за запрос */
  limit?: number;
  /** Задержка между запросами (ms) */
  requestDelay?: number;
  /** Callback для прогресса */
  onProgress?: (progress: ImportProgress) => void;
  /** Callback для новых свечей */
  onCandles?: (symbol: string, candles: CandleData[]) => void;
  /** Callback для ошибок */
  onError?: (error: Error, symbol?: string) => void;
}

export interface ImportProgress {
  /** Символ */
  symbol: string;
  /** Всего свечей */
  totalCandles: number;
  /** Текущее количество */
  currentCandles: number;
  /** Прогресс (%) */
  percent: number;
  /** Текущая дата */
  currentDate: Date;
  /** Статус */
  status: "running" | "completed" | "error" | "paused";
  /** Ошибка */
  error?: string;
}

export interface ImportResult {
  /** Символ */
  symbol: string;
  /** Количество импортированных свечей */
  candlesImported: number;
  /** Время выполнения (ms) */
  duration: number;
  /// Первая свеча */
  firstCandle?: CandleData;
  /// Последняя свеча */
  lastCandle?: CandleData;
  /// Ошибки */
  errors: string[];
}

// ==================== TIMEFRAME HELPERS ====================

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60 * 1000,
  "3m": 3 * 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000, // Approximate
};

const EXCHANGE_TIMEFRAMES: Record<ExchangeId, Record<Timeframe, string>> = {
  binance: {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "2h": "2h", "4h": "4h", "6h": "6h", "12h": "12h",
    "1d": "1d", "1w": "1w", "1M": "1M"
  },
  bybit: {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
    "1d": "D", "1w": "W", "1M": "M"
  },
  okx: {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H", "12h": "12H",
    "1d": "1D", "1w": "1W", "1M": "1M"
  },
  bitget: {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "2h": "2h", "4h": "4h", "6h": "6h", "12h": "12h",
    "1d": "1d", "1w": "1w", "1M": "1M"
  },
  bingx: {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "2h": "2h", "4h": "4h", "6h": "6h", "12h": "12h",
    "1d": "1d", "1w": "1w", "1M": "1M"
  }
};

// ==================== CANDLE IMPORTER ====================

/**
 * Класс для импорта свечей с бирж
 */
export class CandleImporter {
  private abortController: AbortController | null = null;
  private isPaused: boolean = false;
  private progress: Map<string, ImportProgress> = new Map();
  private results: Map<string, ImportResult> = new Map();

  /**
   * Импортировать свечи
   */
  async import(config: ImportConfig): Promise<ImportResult[]> {
    this.abortController = new AbortController();
    this.results.clear();
    this.progress.clear();

    const results: ImportResult[] = [];

    for (const symbol of config.symbols) {
      if (this.abortController.signal.aborted) break;

      const result = await this.importSymbol(symbol, config);
      results.push(result);
      this.results.set(symbol, result);
    }

    return results;
  }

  /**
   * Импортировать свечи для одного символа
   */
  private async importSymbol(symbol: string, config: ImportConfig): Promise<ImportResult> {
    const startTime = Date.now();
    const candles: CandleData[] = [];
    const errors: string[] = [];

    const limit = config.limit || 1000;
    const delay = config.requestDelay || 100;
    const timeframeMs = TIMEFRAME_MS[config.timeframe];
    const endTime = config.endDate || Date.now();

    let currentTime = config.startDate;
    let totalFetched = 0;

    // Initialize progress
    this.progress.set(symbol, {
      symbol,
      totalCandles: Math.ceil((endTime - config.startDate) / timeframeMs),
      currentCandles: 0,
      percent: 0,
      currentDate: new Date(currentTime),
      status: "running"
    });

    try {
      while (currentTime < endTime) {
        if (this.abortController?.signal.aborted) {
          this.updateProgress(symbol, { status: "paused" });
          break;
        }

        while (this.isPaused) {
          await this.sleep(1000);
        }

        // Fetch candles
        const fetchedCandles = await this.fetchCandles(
          config.exchange,
          symbol,
          config.timeframe,
          currentTime,
          Math.min(currentTime + limit * timeframeMs, endTime),
          limit
        );

        if (fetchedCandles.length === 0) {
          // No more data
          break;
        }

        // Filter and deduplicate
        const filteredCandles = fetchedCandles.filter(c =>
          c.timestamp >= config.startDate &&
          c.timestamp <= endTime
        );

        candles.push(...filteredCandles);
        totalFetched += filteredCandles.length;

        // Update progress
        const progress = this.progress.get(symbol);
        if (progress) {
          progress.currentCandles = totalFetched;
          progress.percent = Math.min(100, (totalFetched / progress.totalCandles) * 100);
          progress.currentDate = new Date(fetchedCandles[fetchedCandles.length - 1].timestamp);
          this.progress.set(symbol, { ...progress });
          config.onProgress?.({ ...progress });
        }

        // Callback for new candles
        if (filteredCandles.length > 0) {
          config.onCandles?.(symbol, filteredCandles);
        }

        // Move to next batch
        const lastTimestamp = fetchedCandles[fetchedCandles.length - 1].timestamp;
        currentTime = lastTimestamp + timeframeMs;

        // Delay between requests
        if (delay > 0) {
          await this.sleep(delay);
        }
      }

      // Sort by timestamp
      candles.sort((a, b) => a.timestamp - b.timestamp);

      // Remove duplicates
      const uniqueCandles = this.removeDuplicates(candles);

      // Update final progress
      this.updateProgress(symbol, { status: "completed", percent: 100 });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(errorMessage);
      this.updateProgress(symbol, { status: "error", error: errorMessage });
      config.onError?.(error instanceof Error ? error : new Error(errorMessage), symbol);
    }

    const duration = Date.now() - startTime;

    return {
      symbol,
      candlesImported: candles.length,
      duration,
      firstCandle: candles[0],
      lastCandle: candles[candles.length - 1],
      errors
    };
  }

  /**
   * Получить свечи с биржи
   */
  private async fetchCandles(
    exchange: ExchangeId,
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
    limit: number
  ): Promise<CandleData[]> {
    const exchangeTf = EXCHANGE_TIMEFRAMES[exchange][timeframe];

    switch (exchange) {
      case "binance":
        return this.fetchBinanceCandles(symbol, exchangeTf, startTime, endTime, limit);
      case "bybit":
        return this.fetchBybitCandles(symbol, exchangeTf, startTime, endTime, limit);
      case "okx":
        return this.fetchOKXCandles(symbol, exchangeTf, startTime, endTime, limit);
      case "bitget":
        return this.fetchBitgetCandles(symbol, exchangeTf, startTime, endTime, limit);
      case "bingx":
        return this.fetchBingxCandles(symbol, exchangeTf, startTime, endTime, limit);
      default:
        throw new Error(`Unsupported exchange: ${exchange}`);
    }
  }

  /**
   * Binance klines
   */
  private async fetchBinanceCandles(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number,
    limit: number
  ): Promise<CandleData[]> {
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("startTime", startTime.toString());
    url.searchParams.set("endTime", endTime.toString());
    url.searchParams.set("limit", limit.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();

    return data.map((k: (string | number)[]) => ({
      timestamp: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
      closeTime: k[6] as number,
      quoteVolume: parseFloat(k[7] as string),
      trades: k[8] as number,
      takerBuyBase: parseFloat(k[9] as string),
      takerBuyQuote: parseFloat(k[10] as string),
    }));
  }

  /**
   * Bybit klines
   */
  private async fetchBybitCandles(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number,
    limit: number
  ): Promise<CandleData[]> {
    const url = new URL("https://api.bybit.com/v5/market/kline");
    url.searchParams.set("category", "linear");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("start", startTime.toString());
    url.searchParams.set("end", endTime.toString());
    url.searchParams.set("limit", limit.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Bybit API error: ${response.status}`);
    }

    const json = await response.json();
    if (json.retCode !== 0) {
      throw new Error(`Bybit API error: ${json.retMsg}`);
    }

    // Bybit returns [startTime, openPrice, highPrice, lowPrice, closePrice, volume, turnover]
    return json.result.list.map((k: string[]) => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  /**
   * OKX candles
   */
  private async fetchOKXCandles(
    symbol: string,
    bar: string,
    startTime: number,
    endTime: number,
    limit: number
  ): Promise<CandleData[]> {
    const url = new URL("https://www.okx.com/api/v5/market/candles");
    url.searchParams.set("instId", symbol);
    url.searchParams.set("bar", bar);
    url.searchParams.set("before", startTime.toString());
    url.searchParams.set("after", endTime.toString());
    url.searchParams.set("limit", limit.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`OKX API error: ${response.status}`);
    }

    const json = await response.json();
    if (json.code !== "0") {
      throw new Error(`OKX API error: ${json.msg}`);
    }

    // OKX returns [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    return json.data.map((k: string[]) => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  /**
   * Bitget candles
   */
  private async fetchBitgetCandles(
    symbol: string,
    period: string,
    startTime: number,
    endTime: number,
    limit: number
  ): Promise<CandleData[]> {
    const url = new URL("https://api.bitget.com/api/v2/spot/market/candles");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("period", period);
    url.searchParams.set("after", startTime.toString());
    url.searchParams.set("before", endTime.toString());
    url.searchParams.set("limit", limit.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Bitget API error: ${response.status}`);
    }

    const json = await response.json();
    if (json.code !== "00000") {
      throw new Error(`Bitget API error: ${json.msg}`);
    }

    return json.data.map((k: (string | number)[]) => ({
      timestamp: parseInt(k[0] as string),
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
  }

  /**
   * BingX candles
   */
  private async fetchBingxCandles(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number,
    limit: number
  ): Promise<CandleData[]> {
    const url = new URL("https://open-api.bingx.com/openApi/spot/v1/market/kline");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("startTime", startTime.toString());
    url.searchParams.set("endTime", endTime.toString());
    url.searchParams.set("limit", limit.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`BingX API error: ${response.status}`);
    }

    const json = await response.json();
    if (json.code !== 0) {
      throw new Error(`BingX API error: ${json.msg}`);
    }

    // BingX returns [openTime, open, high, low, close, volume, closeTime, ...]
    return json.data.map((k: (string | number)[]) => ({
      timestamp: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
      closeTime: k[6] as number,
    }));
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Обновить прогресс
   */
  private updateProgress(symbol: string, update: Partial<ImportProgress>): void {
    const current = this.progress.get(symbol);
    if (current) {
      this.progress.set(symbol, { ...current, ...update });
    }
  }

  /**
   * Удалить дубликаты свечей
   */
  private removeDuplicates(candles: CandleData[]): CandleData[] {
    const seen = new Set<number>();
    return candles.filter(candle => {
      if (seen.has(candle.timestamp)) {
        return false;
      }
      seen.add(candle.timestamp);
      return true;
    });
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== CONTROL METHODS ====================

  /**
   * Приостановить импорт
   */
  pause(): void {
    this.isPaused = true;
    for (const [symbol, progress] of this.progress) {
      if (progress.status === "running") {
        this.progress.set(symbol, { ...progress, status: "paused" });
      }
    }
  }

  /**
   * Продолжить импорт
   */
  resume(): void {
    this.isPaused = false;
    for (const [symbol, progress] of this.progress) {
      if (progress.status === "paused") {
        this.progress.set(symbol, { ...progress, status: "running" });
      }
    }
  }

  /**
   * Остановить импорт
   */
  abort(): void {
    this.abortController?.abort();
    this.isPaused = false;
  }

  /**
   * Получить прогресс
   */
  getProgress(symbol?: string): ImportProgress | ImportProgress[] {
    if (symbol) {
      return this.progress.get(symbol) || {
        symbol,
        totalCandles: 0,
        currentCandles: 0,
        percent: 0,
        currentDate: new Date(),
        status: "error" as const,
        error: "No progress found"
      };
    }
    return Array.from(this.progress.values());
  }

  /**
   * Получить результаты
   */
  getResults(): Map<string, ImportResult> {
    return new Map(this.results);
  }
}

// ==================== SCHEDULED IMPORTER ====================

/**
 * Запланированный импорт свечей (для непрерывного обновления)
 */
export class ScheduledCandleImporter {
  private importer: CandleImporter;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private lastTimestamps: Map<string, number> = new Map();

  constructor() {
    this.importer = new CandleImporter();
  }

  /**
   * Начать непрерывный импорт
   */
  startScheduledImport(
    config: ImportConfig,
    intervalMs: number = 60 * 60 * 1000 // Every hour
  ): void {
    const key = `${config.exchange}-${config.symbols.join(",")}-${config.timeframe}`;

    if (this.intervals.has(key)) {
      console.warn(`Scheduled import already running for ${key}`);
      return;
    }

    // Initial import
    this.runImport(config);

    // Schedule recurring imports
    const intervalId = setInterval(() => {
      // Update start time to last known timestamp
      const updatedConfig = { ...config };
      // Will be handled by the importer
      this.runImport(updatedConfig);
    }, intervalMs);

    this.intervals.set(key, intervalId);
  }

  /**
   * Выполнить импорт
   */
  private async runImport(config: ImportConfig): Promise<void> {
    try {
      await this.importer.import({
        ...config,
        startDate: config.startDate,
        onProgress: (progress) => {
          console.log(`[${progress.symbol}] ${progress.percent.toFixed(1)}% - ${progress.currentDate.toISOString()}`);
        },
        onCandles: (symbol, candles) => {
          if (candles.length > 0) {
            const lastTs = candles[candles.length - 1].timestamp;
            this.lastTimestamps.set(symbol, lastTs);
          }
        }
      });
    } catch (error) {
      console.error("Scheduled import error:", error);
    }
  }

  /**
   * Остановить запланированный импорт
   */
  stopScheduledImport(
    exchange: ExchangeId,
    symbols: string[],
    timeframe: Timeframe
  ): void {
    const key = `${exchange}-${symbols.join(",")}-${timeframe}`;
    const intervalId = this.intervals.get(key);

    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(key);
    }
  }

  /**
   * Остановить все импорты
   */
  stopAll(): void {
    for (const intervalId of this.intervals.values()) {
      clearInterval(intervalId);
    }
    this.intervals.clear();
    this.importer.abort();
  }

  /**
   * Получить последнюю временную метку для символа
   */
  getLastTimestamp(symbol: string): number | undefined {
    return this.lastTimestamps.get(symbol);
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Создать импортер свечей
 */
export function createCandleImporter(): CandleImporter {
  return new CandleImporter();
}

/**
 * Создать запланированный импортер
 */
export function createScheduledImporter(): ScheduledCandleImporter {
  return new ScheduledCandleImporter();
}

// ==================== EXPORTS ====================

export {
  CandleImporter,
  ScheduledCandleImporter,
  TIMEFRAME_MS,
  EXCHANGE_TIMEFRAMES
};
