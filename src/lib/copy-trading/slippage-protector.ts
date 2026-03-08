/**
 * Slippage Protection for Copy Trading
 * 
 * Protects followers from entering at significantly worse prices than the master trader.
 * Calculates price deviation before follower execution and rejects trades exceeding thresholds.
 * 
 * Features:
 * - Captures master's entry price
 * - Calculates price deviation before follower execution
 * - Rejects execution if slippage exceeds threshold
 * - Logs slippage metrics for analysis
 * - Supports dynamic thresholds based on volatility (ATR)
 */

import type { ExchangeId, PositionSide } from "../exchange/types";

// ==================== TYPES ====================

/**
 * Configuration for slippage protection
 */
export interface SlippageConfig {
  /** Maximum acceptable slippage percentage (default: 0.5%) */
  maxSlippagePercent: number;
  
  /** Adjust threshold based on market volatility */
  volatilityMultiplier: boolean;
  
  /** Reject trade when slippage exceeded (default: true) */
  rejectOnExceeded: boolean;
  
  /** Warning threshold for logging (default: 0.25%) */
  warningThreshold: number;
  
  /** ATR period for volatility calculation (default: 14) */
  atrPeriod: number;
  
  /** Volatility multiplier for dynamic threshold */
  volatilityFactor: number;
  
  /** Enable logging of all slippage events */
  enableLogging: boolean;
  
  /** Maximum latency in ms before trade is considered stale */
  maxLatencyMs: number;
}

/**
 * Result of slippage check
 */
export interface SlippageResult {
  /** Master trader's entry price */
  masterPrice: number;
  
  /** Current market price */
  currentPrice: number;
  
  /** Calculated slippage percentage */
  slippagePercent: number;
  
  /** Direction of slippage */
  slippageDirection: 'positive' | 'negative' | 'none';
  
  /** Whether execution is acceptable */
  acceptable: boolean;
  
  /** Reason for accept/reject decision */
  reason: string;
  
  /** Dynamic threshold applied */
  appliedThreshold: number;
  
  /** Volatility level at time of check */
  volatilityLevel?: number;
  
  /** Time since master trade in ms */
  latencyMs: number;
  
  /** Warning level (none/warning/critical) */
  warningLevel: 'none' | 'warning' | 'critical';
}

/**
 * Context for a copy trade
 */
export interface CopyTradeContext {
  /** Exchange ID */
  exchange: ExchangeId;
  
  /** Trading symbol */
  symbol: string;
  
  /** Trade direction */
  direction: 'LONG' | 'SHORT';
  
  /** Master trader ID */
  masterTraderId: string;
  
  /** Follower ID */
  followerId: string;
  
  /** Position size (USDT) */
  positionSize: number;
  
  /** Leverage */
  leverage: number;
  
  /** Timestamp of master trade */
  masterTradeTime: Date;
  
  /** Entry type */
  entryType: 'market' | 'limit';
}

/**
 * Logged slippage event
 */
export interface SlippageLogEntry {
  id: string;
  timestamp: Date;
  context: CopyTradeContext;
  result: SlippageResult;
  executed: boolean;
  notes?: string;
}

/**
 * Volatility data for a symbol
 */
export interface VolatilityData {
  symbol: string;
  exchange: ExchangeId;
  atr: number;
  atrPercent: number;
  lastPrice: number;
  timestamp: Date;
}

/**
 * Price fetcher function type
 */
export type PriceFetcher = (symbol: string, exchange: ExchangeId) => Promise<number | null>;

/**
 * OHLCV data for ATR calculation
 */
export interface OHLCVCandle {
  high: number;
  low: number;
  close: number;
  timestamp: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_SLIPPAGE_CONFIG: SlippageConfig = {
  maxSlippagePercent: 0.5,
  volatilityMultiplier: true,
  rejectOnExceeded: true,
  warningThreshold: 0.25,
  atrPeriod: 14,
  volatilityFactor: 0.1,
  enableLogging: true,
  maxLatencyMs: 30000, // 30 seconds
};

// ==================== SLIPPAGE PROTECTOR CLASS ====================

/**
 * Slippage Protector for Copy Trading
 * 
 * Prevents followers from entering at significantly worse prices than master traders.
 * Uses ATR-based dynamic thresholds to adapt to market volatility.
 */
export class SlippageProtector {
  private config: SlippageConfig;
  private volatilityCache: Map<string, VolatilityData> = new Map();
  private slippageLog: SlippageLogEntry[] = [];
  private priceFetcher?: PriceFetcher;
  private ohlcvFetcher?: (symbol: string, exchange: ExchangeId, limit: number) => Promise<OHLCVCandle[]>;
  
  constructor(
    config: Partial<SlippageConfig> = {},
    priceFetcher?: PriceFetcher,
    ohlcvFetcher?: (symbol: string, exchange: ExchangeId, limit: number) => Promise<OHLCVCandle[]>
  ) {
    this.config = { ...DEFAULT_SLIPPAGE_CONFIG, ...config };
    this.priceFetcher = priceFetcher;
    this.ohlcvFetcher = ohlcvFetcher;
  }

  /**
   * Check if execution is acceptable based on slippage
   * 
   * @param masterEntry - Master trader's entry price
   * @param currentPrice - Current market price
   * @param direction - Trade direction (LONG or SHORT)
   * @param context - Copy trade context
   * @returns SlippageResult with acceptability and details
   */
  checkSlippage(
    masterEntry: number,
    currentPrice: number,
    direction: 'LONG' | 'SHORT',
    context: CopyTradeContext
  ): SlippageResult {
    const latencyMs = Date.now() - context.masterTradeTime.getTime();
    
    // Calculate slippage percentage
    const priceDiff = currentPrice - masterEntry;
    const slippagePercent = Math.abs(priceDiff / masterEntry) * 100;
    
    // Determine slippage direction
    let slippageDirection: 'positive' | 'negative' | 'none';
    if (slippagePercent < 0.001) {
      slippageDirection = 'none';
    } else if (direction === 'LONG') {
      // For longs, positive slippage means higher entry price (worse)
      slippageDirection = priceDiff > 0 ? 'positive' : 'negative';
    } else {
      // For shorts, positive slippage means lower entry price (worse)
      slippageDirection = priceDiff < 0 ? 'positive' : 'negative';
    }
    
    // Get dynamic threshold based on volatility
    const appliedThreshold = this.getDynamicThreshold(context.symbol, context.exchange);
    
    // Determine if slippage is acceptable
    // For the trade direction, we care about adverse slippage
    const adverseSlippage = direction === 'LONG' 
      ? (currentPrice > masterEntry ? slippagePercent : 0)
      : (currentPrice < masterEntry ? slippagePercent : 0);
    
    const acceptable = adverseSlippage <= appliedThreshold;
    
    // Determine warning level
    let warningLevel: 'none' | 'warning' | 'critical';
    if (!acceptable) {
      warningLevel = 'critical';
    } else if (adverseSlippage >= this.config.warningThreshold) {
      warningLevel = 'warning';
    } else {
      warningLevel = 'none';
    }
    
    // Build reason
    let reason: string;
    if (latencyMs > this.config.maxLatencyMs) {
      reason = `Trade signal stale (${latencyMs}ms > ${this.config.maxLatencyMs}ms max latency)`;
    } else if (!acceptable) {
      reason = `Slippage ${adverseSlippage.toFixed(4)}% exceeds threshold ${appliedThreshold.toFixed(4)}%`;
    } else if (warningLevel === 'warning') {
      reason = `Slippage ${adverseSlippage.toFixed(4)}% within threshold but above warning level`;
    } else {
      reason = `Slippage ${adverseSlippage.toFixed(4)}% within acceptable range`;
    }
    
    // Get volatility level
    const volatilityKey = `${context.exchange}:${context.symbol}`;
    const volatilityData = this.volatilityCache.get(volatilityKey);
    
    const result: SlippageResult = {
      masterPrice: masterEntry,
      currentPrice,
      slippagePercent: adverseSlippage,
      slippageDirection,
      acceptable: latencyMs <= this.config.maxLatencyMs && acceptable,
      reason,
      appliedThreshold,
      volatilityLevel: volatilityData?.atrPercent,
      latencyMs,
      warningLevel,
    };
    
    // Log the result
    if (this.config.enableLogging) {
      this.logSlippage(result, context);
    }
    
    return result;
  }

  /**
   * Get ATR-based dynamic threshold for a symbol
   * 
   * Higher volatility = higher acceptable slippage threshold
   * 
   * @param symbol - Trading symbol
   * @param exchange - Exchange ID
   * @returns Dynamic slippage threshold percentage
   */
  getDynamicThreshold(symbol: string, exchange: ExchangeId): number {
    if (!this.config.volatilityMultiplier) {
      return this.config.maxSlippagePercent;
    }
    
    const volatilityKey = `${exchange}:${symbol}`;
    const volatilityData = this.volatilityCache.get(volatilityKey);
    
    if (!volatilityData) {
      // Return default threshold if no volatility data
      return this.config.maxSlippagePercent;
    }
    
    // Calculate dynamic threshold based on ATR
    // Higher ATR% = higher threshold
    const atrPercent = volatilityData.atrPercent;
    const dynamicThreshold = this.config.maxSlippagePercent + 
      (atrPercent * this.config.volatilityFactor);
    
    // Cap at reasonable maximum
    return Math.min(dynamicThreshold, this.config.maxSlippagePercent * 3);
  }

  /**
   * Update volatility data for a symbol
   * 
   * @param symbol - Trading symbol
   * @param exchange - Exchange ID
   * @param candles - OHLCV candles for ATR calculation
   */
  updateVolatilityData(
    symbol: string,
    exchange: ExchangeId,
    candles: OHLCVCandle[]
  ): void {
    if (candles.length < this.config.atrPeriod) {
      return;
    }
    
    const atr = this.calculateATR(candles, this.config.atrPeriod);
    const lastCandle = candles[candles.length - 1];
    const lastPrice = lastCandle.close;
    const atrPercent = (atr / lastPrice) * 100;
    
    const volatilityKey = `${exchange}:${symbol}`;
    this.volatilityCache.set(volatilityKey, {
      symbol,
      exchange,
      atr,
      atrPercent,
      lastPrice,
      timestamp: new Date(),
    });
  }

  /**
   * Calculate ATR from OHLCV candles
   */
  private calculateATR(candles: OHLCVCandle[], period: number): number {
    if (candles.length < period + 1) {
      return 0;
    }
    
    const trueRanges: number[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }
    
    // Calculate smoothed ATR
    if (trueRanges.length < period) {
      return 0;
    }
    
    // First ATR is SMA
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // Subsequent values use smoothing
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }
    
    return atr;
  }

  /**
   * Log slippage for analysis
   * 
   * @param result - Slippage check result
   * @param context - Copy trade context
   */
  logSlippage(result: SlippageResult, context: CopyTradeContext): void {
    const entry: SlippageLogEntry = {
      id: `${Date.now()}-${context.masterTraderId}-${context.symbol}`,
      timestamp: new Date(),
      context,
      result,
      executed: false, // Will be updated after execution attempt
    };
    
    this.slippageLog.push(entry);
    
    // Keep only last 1000 entries to prevent memory issues
    if (this.slippageLog.length > 1000) {
      this.slippageLog = this.slippageLog.slice(-1000);
    }
    
    // Console logging for monitoring
    if (result.warningLevel === 'critical') {
      console.error('[SlippageProtector] CRITICAL:', {
        symbol: context.symbol,
        exchange: context.exchange,
        masterPrice: result.masterPrice,
        currentPrice: result.currentPrice,
        slippage: `${result.slippagePercent.toFixed(4)}%`,
        threshold: `${result.appliedThreshold.toFixed(4)}%`,
        direction: context.direction,
        acceptable: result.acceptable,
        reason: result.reason,
      });
    } else if (result.warningLevel === 'warning') {
      console.warn('[SlippageProtector] WARNING:', {
        symbol: context.symbol,
        slippage: `${result.slippagePercent.toFixed(4)}%`,
        threshold: `${result.appliedThreshold.toFixed(4)}%`,
      });
    }
  }

  /**
   * Mark a logged slippage event as executed or rejected
   */
  markExecuted(logId: string, executed: boolean, notes?: string): void {
    const entry = this.slippageLog.find(e => e.id === logId);
    if (entry) {
      entry.executed = executed;
      if (notes) {
        entry.notes = notes;
      }
    }
  }

  /**
   * Get current price for a symbol
   */
  async getCurrentPrice(symbol: string, exchange: ExchangeId): Promise<number | null> {
    if (this.priceFetcher) {
      return this.priceFetcher(symbol, exchange);
    }
    return null;
  }

  /**
   * Fetch and update volatility data
   */
  async fetchVolatilityData(symbol: string, exchange: ExchangeId): Promise<void> {
    if (this.ohlcvFetcher) {
      try {
        const candles = await this.ohlcvFetcher(symbol, exchange, this.config.atrPeriod + 1);
        if (candles && candles.length > 0) {
          this.updateVolatilityData(symbol, exchange, candles);
        }
      } catch (error) {
        console.error('[SlippageProtector] Failed to fetch OHLCV data:', error);
      }
    }
  }

  // ==================== GETTERS ====================

  /**
   * Get slippage configuration
   */
  getConfig(): SlippageConfig {
    return { ...this.config };
  }

  /**
   * Get recent slippage log entries
   */
  getSlippageLog(limit: number = 100): SlippageLogEntry[] {
    return this.slippageLog.slice(-limit);
  }

  /**
   * Get volatility data for a symbol
   */
  getVolatilityData(symbol: string, exchange: ExchangeId): VolatilityData | undefined {
    return this.volatilityCache.get(`${exchange}:${symbol}`);
  }

  /**
   * Get slippage statistics
   */
  getSlippageStats(): {
    totalChecks: number;
    acceptedCount: number;
    rejectedCount: number;
    warningCount: number;
    avgSlippage: number;
    maxSlippage: number;
    rejectionRate: number;
  } {
    const totalChecks = this.slippageLog.length;
    const accepted = this.slippageLog.filter(e => e.result.acceptable);
    const rejected = this.slippageLog.filter(e => !e.result.acceptable);
    const warnings = this.slippageLog.filter(e => e.result.warningLevel === 'warning');
    
    const slippages = this.slippageLog.map(e => e.result.slippagePercent);
    const avgSlippage = slippages.length > 0
      ? slippages.reduce((a, b) => a + b, 0) / slippages.length
      : 0;
    const maxSlippage = slippages.length > 0
      ? Math.max(...slippages)
      : 0;
    
    return {
      totalChecks,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      warningCount: warnings.length,
      avgSlippage,
      maxSlippage,
      rejectionRate: totalChecks > 0 ? rejected.length / totalChecks : 0,
    };
  }

  // ==================== SETTERS ====================

  /**
   * Update slippage configuration
   */
  updateConfig(config: Partial<SlippageConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set price fetcher function
   */
  setPriceFetcher(fetcher: PriceFetcher): void {
    this.priceFetcher = fetcher;
  }

  /**
   * Set OHLCV fetcher for volatility calculations
   */
  setOhlcvFetcher(fetcher: (symbol: string, exchange: ExchangeId, limit: number) => Promise<OHLCVCandle[]>): void {
    this.ohlcvFetcher = fetcher;
  }

  /**
   * Clear slippage log
   */
  clearLog(): void {
    this.slippageLog = [];
  }

  /**
   * Clear volatility cache
   */
  clearVolatilityCache(): void {
    this.volatilityCache.clear();
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create a slippage protector with default configuration
 */
export function createSlippageProtector(
  config: Partial<SlippageConfig> = {},
  priceFetcher?: PriceFetcher
): SlippageProtector {
  return new SlippageProtector(config, priceFetcher);
}

/**
 * Create slippage config by risk profile
 */
export function createSlippageConfigByProfile(
  profile: 'conservative' | 'moderate' | 'aggressive'
): SlippageConfig {
  switch (profile) {
    case 'conservative':
      return {
        maxSlippagePercent: 0.25,
        volatilityMultiplier: false,
        rejectOnExceeded: true,
        warningThreshold: 0.1,
        atrPeriod: 14,
        volatilityFactor: 0.05,
        enableLogging: true,
        maxLatencyMs: 15000, // 15 seconds
      };
    
    case 'moderate':
      return {
        maxSlippagePercent: 0.5,
        volatilityMultiplier: true,
        rejectOnExceeded: true,
        warningThreshold: 0.25,
        atrPeriod: 14,
        volatilityFactor: 0.1,
        enableLogging: true,
        maxLatencyMs: 30000, // 30 seconds
      };
    
    case 'aggressive':
      return {
        maxSlippagePercent: 1.0,
        volatilityMultiplier: true,
        rejectOnExceeded: false, // Allow execution with warning
        warningThreshold: 0.5,
        atrPeriod: 14,
        volatilityFactor: 0.15,
        enableLogging: true,
        maxLatencyMs: 60000, // 60 seconds
      };
  }
}

/**
 * Quick slippage check utility function
 */
export function checkSlippageQuick(
  masterPrice: number,
  currentPrice: number,
  direction: 'LONG' | 'SHORT',
  maxSlippagePercent: number = 0.5
): { acceptable: boolean; slippagePercent: number } {
  const priceDiff = Math.abs(currentPrice - masterPrice);
  const slippagePercent = (priceDiff / masterPrice) * 100;
  
  // Check adverse slippage
  const adverseSlippage = direction === 'LONG'
    ? (currentPrice > masterPrice ? slippagePercent : 0)
    : (currentPrice < masterPrice ? slippagePercent : 0);
  
  return {
    acceptable: adverseSlippage <= maxSlippagePercent,
    slippagePercent: adverseSlippage,
  };
}
