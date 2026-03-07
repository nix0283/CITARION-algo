/**
 * Incremental Indicators Manager
 *
 * Manages stateful, incremental indicator calculations for real-time trading.
 * Uses @junduck/trading-indi library for O(1) updates per tick.
 *
 * Key benefits:
 * - Instant updates (no recalculation of entire history)
 * - Memory efficient (sliding windows)
 * - Perfect for WebSocket tick data
 */

import {
  // Moving Averages
  EMA,
  SMA,
  // Momentum
  RSI,
  MACD,
  CMO,
  RVI,
  TSI,
  BBPOWER,
  // Volatility
  ATR,
  BBANDS,
  TR,
  NATR,
  // Trend
  ADX,
  AROON,
  SAR,
  VI,
  ICHIMOKU,
  // Oscillators
  STOCH,
  WILLR,
  ULTOSC,
  // Volume
  OBV,
  MFI,
  CMF,
  AD,
  // Types
  type OHLCVBar,
} from '@junduck/trading-indi';

import type {
  IncrementalBar,
  IndicatorState,
  IndicatorSignal,
  RSIResult,
  MACDResult,
  BBANDSResult,
  ATRResult,
  ADXResult,
  STOCHResult,
  IchimokuResult,
} from './types';

// ==================== INDICATOR SET CONFIG ====================

export interface IndicatorSetConfig {
  // Moving Averages
  ema20?: { enabled: boolean };
  ema50?: { enabled: boolean };
  ema200?: { enabled: boolean };
  sma20?: { enabled: boolean };
  sma50?: { enabled: boolean };

  // Momentum
  rsi?: { period: number; enabled: boolean };
  macd?: { periodFast: number; periodSlow: number; periodSignal: number; enabled: boolean };

  // Volatility
  atr?: { period: number; enabled: boolean };
  bbands?: { period: number; stddev: number; enabled: boolean };

  // Trend
  adx?: { period: number; enabled: boolean };

  // Oscillators
  stoch?: { periodK: number; periodD: number; smoothK: number; enabled: boolean };

  // Ichimoku
  ichimoku?: {
    tenkanPeriod: number;
    kijunPeriod: number;
    senkouBPeriod: number;
    displacement: number;
    enabled: boolean;
  };
}

const DEFAULT_CONFIG: IndicatorSetConfig = {
  ema20: { enabled: true },
  ema50: { enabled: true },
  ema200: { enabled: false },
  sma20: { enabled: false },
  sma50: { enabled: false },
  rsi: { period: 14, enabled: true },
  macd: { periodFast: 12, periodSlow: 26, periodSignal: 9, enabled: true },
  atr: { period: 14, enabled: true },
  bbands: { period: 20, stddev: 2, enabled: true },
  adx: { period: 14, enabled: true },
  stoch: { periodK: 14, periodD: 3, smoothK: 3, enabled: true },
  ichimoku: {
    tenkanPeriod: 9,
    kijunPeriod: 26,
    senkouBPeriod: 52,
    displacement: 26,
    enabled: false,
  },
};

// ==================== INCREMENTAL INDICATOR MANAGER ====================

/**
 * Manages a set of incremental indicators for real-time updates.
 * Each call to onUpdate() is O(1) - only processes new data point.
 */
export class IncrementalIndicatorManager {
  private config: IndicatorSetConfig;

  // Moving Averages
  private ema20: InstanceType<typeof EMA> | null = null;
  private ema50: InstanceType<typeof EMA> | null = null;
  private ema200: InstanceType<typeof EMA> | null = null;
  private sma20: InstanceType<typeof SMA> | null = null;
  private sma50: InstanceType<typeof SMA> | null = null;

  // Momentum
  private rsi: InstanceType<typeof RSI> | null = null;
  private macd: InstanceType<typeof MACD> | null = null;

  // Volatility
  private atr: InstanceType<typeof ATR> | null = null;
  private bbands: InstanceType<typeof BBANDS> | null = null;

  // Trend
  private adx: InstanceType<typeof ADX> | null = null;

  // Oscillators
  private stoch: InstanceType<typeof STOCH> | null = null;

  // Ichimoku
  private ichimoku: InstanceType<typeof ICHIMOKU> | null = null;

  // Previous values for crossover detection
  private prevMacd: { macd: number | null; signal: number | null } = {
    macd: null,
    signal: null,
  };
  private prevRsi: number | null = null;
  private prevStoch: { k: number | null; d: number | null } = { k: null, d: null };

  // Statistics
  private updateCount = 0;
  private lastUpdate = 0;

  constructor(config: Partial<IndicatorSetConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  private initialize(): void {
    // Moving Averages
    if (this.config.ema20?.enabled) {
      this.ema20 = new EMA({ period: 20 });
    }
    if (this.config.ema50?.enabled) {
      this.ema50 = new EMA({ period: 50 });
    }
    if (this.config.ema200?.enabled) {
      this.ema200 = new EMA({ period: 200 });
    }
    if (this.config.sma20?.enabled) {
      this.sma20 = new SMA({ period: 20 });
    }
    if (this.config.sma50?.enabled) {
      this.sma50 = new SMA({ period: 50 });
    }

    // Momentum
    if (this.config.rsi?.enabled) {
      this.rsi = new RSI({ period: this.config.rsi.period });
    }
    if (this.config.macd?.enabled) {
      this.macd = new MACD({
        period_fast: this.config.macd.periodFast,
        period_slow: this.config.macd.periodSlow,
        period_signal: this.config.macd.periodSignal,
      });
    }

    // Volatility
    if (this.config.atr?.enabled) {
      this.atr = new ATR({ period: this.config.atr.period });
    }
    if (this.config.bbands?.enabled) {
      this.bbands = new BBANDS({
        period: this.config.bbands.period,
        stddev: this.config.bbands.stddev,
      });
    }

    // Trend
    if (this.config.adx?.enabled) {
      this.adx = new ADX({ period: this.config.adx.period });
    }

    // Oscillators
    if (this.config.stoch?.enabled) {
      this.stoch = new STOCH({
        k_period: this.config.stoch.periodK,
        d_period: this.config.stoch.periodD,
        k_slowing: this.config.stoch.smoothK,
      });
    }

    // Ichimoku
    if (this.config.ichimoku?.enabled) {
      this.ichimoku = new ICHIMOKU({
        tenkan_period: this.config.ichimoku.tenkanPeriod,
        kijun_period: this.config.ichimoku.kijunPeriod,
        senkou_b_period: this.config.ichimoku.senkouBPeriod,
        displacement: this.config.ichimoku.displacement,
      });
    }
  }

  /**
   * Update all indicators with new bar data.
   * This is O(1) - only processes the new bar.
   */
  onUpdate(bar: IncrementalBar): IndicatorState {
    this.updateCount++;
    this.lastUpdate = Date.now();

    const signals: IndicatorSignal[] = [];

    // Convert to library format
    const libBar: OHLCVBar = {
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    };

    // Moving Averages
    const ema20Val = this.ema20?.onData(bar.close) ?? null;
    const ema50Val = this.ema50?.onData(bar.close) ?? null;
    const ema200Val = this.ema200?.onData(bar.close) ?? null;
    const sma20Val = this.sma20?.onData(bar.close) ?? null;
    const sma50Val = this.sma50?.onData(bar.close) ?? null;

    // EMA cross signals
    if (ema20Val !== null && ema50Val !== null) {
      const prevEma20 = this.ema20?.previousValue;
      const prevEma50 = this.ema50?.previousValue;

      if (prevEma20 !== null && prevEma50 !== null) {
        if (prevEma20 <= prevEma50 && ema20Val > ema50Val) {
          signals.push({
            indicator: 'EMA',
            type: 'buy',
            strength: 'moderate',
            reason: 'EMA20 crossed above EMA50',
          });
        } else if (prevEma20 >= prevEma50 && ema20Val < ema50Val) {
          signals.push({
            indicator: 'EMA',
            type: 'sell',
            strength: 'moderate',
            reason: 'EMA20 crossed below EMA50',
          });
        }
      }
    }

    // RSI
    const rsiVal = this.rsi?.onData(libBar) ?? null;
    const rsiResult: RSIResult = {
      value: rsiVal,
      overbought: rsiVal !== null && rsiVal >= 70,
      oversold: rsiVal !== null && rsiVal <= 30,
    };

    // RSI signals
    if (rsiVal !== null) {
      if (rsiVal <= 30 && (this.prevRsi === null || this.prevRsi > 30)) {
        signals.push({
          indicator: 'RSI',
          type: 'buy',
          strength: rsiVal <= 20 ? 'strong' : 'moderate',
          reason: `RSI entered oversold zone (${rsiVal.toFixed(2)})`,
          value: rsiVal,
        });
      } else if (rsiVal >= 70 && (this.prevRsi === null || this.prevRsi < 70)) {
        signals.push({
          indicator: 'RSI',
          type: 'sell',
          strength: rsiVal >= 80 ? 'strong' : 'moderate',
          reason: `RSI entered overbought zone (${rsiVal.toFixed(2)})`,
          value: rsiVal,
        });
      }
      this.prevRsi = rsiVal;
    }

    // MACD
    const macdResult = this.macd?.onData(libBar);
    const macdParsed: MACDResult = {
      macd: macdResult?.macd ?? null,
      signal: macdResult?.signal ?? null,
      histogram: macdResult?.histogram ?? null,
      crossover: null,
    };

    // MACD crossover detection
    if (macdResult && this.prevMacd.macd !== null && this.prevMacd.signal !== null) {
      if (this.prevMacd.macd <= this.prevMacd.signal && macdResult.macd > macdResult.signal) {
        macdParsed.crossover = 'bullish';
        signals.push({
          indicator: 'MACD',
          type: 'buy',
          strength: macdResult.histogram > 0 ? 'strong' : 'moderate',
          reason: 'MACD bullish crossover',
          value: macdResult.macd,
        });
      } else if (this.prevMacd.macd >= this.prevMacd.signal && macdResult.macd < macdResult.signal) {
        macdParsed.crossover = 'bearish';
        signals.push({
          indicator: 'MACD',
          type: 'sell',
          strength: macdResult.histogram < 0 ? 'strong' : 'moderate',
          reason: 'MACD bearish crossover',
          value: macdResult.macd,
        });
      }
    }
    if (macdResult) {
      this.prevMacd = { macd: macdResult.macd, signal: macdResult.signal };
    }

    // ATR
    const atrVal = this.atr?.onData(libBar) ?? null;
    const atrResult: ATRResult = {
      value: atrVal,
      tr: null, // TR is internal to ATR
    };

    // Bollinger Bands
    const bbandsResult = this.bbands?.onData(bar.close);
    const bbandsParsed: BBANDSResult = {
      upper: bbandsResult?.upper ?? null,
      middle: bbandsResult?.middle ?? null,
      lower: bbandsResult?.lower ?? null,
      bandwidth: null,
      percentB: null,
    };

    if (bbandsResult) {
      const range = bbandsResult.upper - bbandsResult.lower;
      bbandsParsed.bandwidth = range / bbandsResult.middle;
      bbandsParsed.percentB = (bar.close - bbandsResult.lower) / range;

      // Bollinger signals
      if (bar.close >= bbandsResult.upper) {
        signals.push({
          indicator: 'BB',
          type: 'sell',
          strength: 'moderate',
          reason: 'Price at upper Bollinger Band',
          value: bar.close,
        });
      } else if (bar.close <= bbandsResult.lower) {
        signals.push({
          indicator: 'BB',
          type: 'buy',
          strength: 'moderate',
          reason: 'Price at lower Bollinger Band',
          value: bar.close,
        });
      }
    }

    // ADX
    const adxResult = this.adx?.onData(libBar);
    const adxParsed: ADXResult = {
      adx: adxResult ?? null,
      plusDI: null,
      minusDI: null,
      trend: null,
    };

    if (adxResult !== null && adxResult !== undefined) {
      if (adxResult >= 25) {
        adxParsed.trend = 'strong_bullish'; // Simplified - would need DI for direction
      } else {
        adxParsed.trend = 'weak';
      }
    }

    // Stochastic
    const stochResult = this.stoch?.onData(libBar);
    const stochParsed: STOCHResult = {
      k: stochResult?.k ?? null,
      d: stochResult?.d ?? null,
      overbought: stochResult !== null && stochResult.k >= 80,
      oversold: stochResult !== null && stochResult.k <= 20,
    };

    // Stochastic signals
    if (stochResult && this.prevStoch.k !== null && this.prevStoch.d !== null) {
      if (this.prevStoch.k <= this.prevStoch.d && stochResult.k > stochResult.d && stochResult.k <= 20) {
        signals.push({
          indicator: 'STOCH',
          type: 'buy',
          strength: 'moderate',
          reason: 'Stochastic bullish crossover in oversold zone',
          value: stochResult.k,
        });
      } else if (this.prevStoch.k >= this.prevStoch.d && stochResult.k < stochResult.d && stochResult.k >= 80) {
        signals.push({
          indicator: 'STOCH',
          type: 'sell',
          strength: 'moderate',
          reason: 'Stochastic bearish crossover in overbought zone',
          value: stochResult.k,
        });
      }
    }
    if (stochResult) {
      this.prevStoch = { k: stochResult.k, d: stochResult.d };
    }

    return {
      timestamp: bar.timestamp ?? Date.now(),
      ema20: ema20Val,
      ema50: ema50Val,
      ema200: ema200Val,
      sma20: sma20Val,
      sma50: sma50Val,
      rsi: rsiResult,
      macd: macdParsed,
      atr: atrResult,
      bbands: bbandsParsed,
      adx: adxParsed,
      stoch: stochParsed,
      signals,
    };
  }

  /**
   * Get current indicator values without updating
   */
  getCurrentValues(): Partial<IndicatorState> {
    return {
      ema20: this.ema20?.currentValue ?? null,
      ema50: this.ema50?.currentValue ?? null,
      ema200: this.ema200?.currentValue ?? null,
    };
  }

  /**
   * Get statistics
   */
  getStats(): { updateCount: number; lastUpdate: number } {
    return {
      updateCount: this.updateCount,
      lastUpdate: this.lastUpdate,
    };
  }

  /**
   * Reset all indicators
   */
  reset(): void {
    this.initialize();
    this.prevMacd = { macd: null, signal: null };
    this.prevRsi = null;
    this.prevStoch = { k: null, d: null };
    this.updateCount = 0;
    this.lastUpdate = 0;
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Create an incremental indicator manager with default configuration
 */
export function createIncrementalIndicators(
  config: Partial<IndicatorSetConfig> = {}
): IncrementalIndicatorManager {
  return new IncrementalIndicatorManager(config);
}

/**
 * Create an incremental indicator manager optimized for scalping
 */
export function createScalpingIndicators(): IncrementalIndicatorManager {
  return new IncrementalIndicatorManager({
    ema20: { enabled: true },
    ema50: { enabled: true },
    rsi: { period: 7, enabled: true },
    macd: { periodFast: 5, periodSlow: 13, periodSignal: 4, enabled: true },
    atr: { period: 7, enabled: true },
    bbands: { period: 10, stddev: 1.5, enabled: true },
    stoch: { periodK: 5, periodD: 3, smoothK: 1, enabled: true },
    adx: { period: 7, enabled: false },
  });
}

/**
 * Create an incremental indicator manager optimized for swing trading
 */
export function createSwingIndicators(): IncrementalIndicatorManager {
  return new IncrementalIndicatorManager({
    ema20: { enabled: true },
    ema50: { enabled: true },
    ema200: { enabled: true },
    rsi: { period: 14, enabled: true },
    macd: { periodFast: 12, periodSlow: 26, periodSignal: 9, enabled: true },
    atr: { period: 14, enabled: true },
    bbands: { period: 20, stddev: 2, enabled: true },
    adx: { period: 14, enabled: true },
    stoch: { periodK: 14, periodD: 3, smoothK: 3, enabled: true },
  });
}

/**
 * Create an incremental indicator manager with all indicators
 */
export function createFullIndicators(): IncrementalIndicatorManager {
  return new IncrementalIndicatorManager({
    ema20: { enabled: true },
    ema50: { enabled: true },
    ema200: { enabled: true },
    sma20: { enabled: true },
    sma50: { enabled: true },
    rsi: { period: 14, enabled: true },
    macd: { periodFast: 12, periodSlow: 26, periodSignal: 9, enabled: true },
    atr: { period: 14, enabled: true },
    bbands: { period: 20, stddev: 2, enabled: true },
    adx: { period: 14, enabled: true },
    stoch: { periodK: 14, periodD: 3, smoothK: 3, enabled: true },
    ichimoku: {
      tenkanPeriod: 9,
      kijunPeriod: 26,
      senkouBPeriod: 52,
      displacement: 26,
      enabled: true,
    },
  });
}
