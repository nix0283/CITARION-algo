/**
 * Exchange Feature Provider for Gradient Boosting
 *
 * Provides real-time feature extraction from exchange data
 * for Gradient Boosting Signal Quality Scorer
 */

import type { SignalFeatures } from './index'

// =============================================================================
// TYPES
// =============================================================================

export interface ExchangeFeatureConfig {
  /** Exchange name */
  exchange: string
  /** Trading pair */
  symbol: string
  /** Timeframe for calculations */
  timeframe: string
  /** Number of candles for calculations */
  lookbackPeriod: number
}

export interface OHLCV {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MarketDataContext {
  fundingRate?: number
  basis?: number
  openInterestChange?: number
}

// =============================================================================
// TECHNICAL INDICATORS
// =============================================================================

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50

  let gains = 0
  let losses = 0

  // Calculate initial average gain/loss
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }

  const avgGain = gains / period
  const avgLoss = losses / period

  if (avgLoss === 0) return 100

  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

/**
 * Calculate MACD
 */
function calculateMACD(closes: number[]): { macd: number; signal: number } {
  if (closes.length < 26) return { macd: 0, signal: 0 }

  const ema12 = calculateEMA(closes, 12)
  const ema26 = calculateEMA(closes, 26)
  const macd = ema12 - ema26

  // For signal line, we'd need historical MACD values
  // Simplified: use current MACD as approximation
  return { macd, signal: macd * 0.8 }
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] || 0

  const multiplier = 2 / (period + 1)
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema
  }

  return ema
}

/**
 * Calculate Bollinger Bands position
 */
function calculateBollingerPosition(closes: number[], period: number = 20): number {
  if (closes.length < period) return 0

  const recentCloses = closes.slice(-period)
  const sma = recentCloses.reduce((a, b) => a + b, 0) / period
  const variance = recentCloses.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period
  const stdDev = Math.sqrt(variance)

  const currentPrice = closes[closes.length - 1]
  const upperBand = sma + (2 * stdDev)
  const lowerBand = sma - (2 * stdDev)

  // Position from -1 (lower band) to 1 (upper band)
  if (upperBand === lowerBand) return 0
  return ((currentPrice - sma) / (upperBand - sma))
}

/**
 * Calculate ADX (Average Directional Index)
 */
function calculateADX(candles: OHLCV[], period: number = 14): number {
  if (candles.length < period * 2) return 25 // Default value

  const highCandles = candles.slice(-period * 2)
  let plusDM = 0
  let minusDM = 0
  let tr = 0

  for (let i = 1; i < highCandles.length; i++) {
    const prev = highCandles[i - 1]
    const curr = highCandles[i]

    const upMove = curr.high - prev.high
    const downMove = prev.low - curr.low

    plusDM += upMove > downMove && upMove > 0 ? upMove : 0
    minusDM += downMove > upMove && downMove > 0 ? downMove : 0

    const trValue = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    )
    tr += trValue
  }

  const plusDI = (plusDM / tr) * 100
  const minusDI = (minusDM / tr) * 100

  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100
  return isNaN(dx) ? 25 : dx
}

/**
 * Calculate SuperTrend direction
 */
function calculateSuperTrendDirection(candles: OHLCV[], period: number = 10, multiplier: number = 3): number {
  if (candles.length < period) return 0

  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)

  // Calculate ATR
  let atrSum = 0
  for (let i = candles.length - period; i < candles.length; i++) {
    atrSum += Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
  }
  const atr = atrSum / period

  const currentClose = closes[closes.length - 1]
  const prevClose = closes[closes.length - 2]

  // Basic SuperTrend logic
  const upperBand = (highs[highs.length - 1] + lows[lows.length - 1]) / 2 + multiplier * atr
  const lowerBand = (highs[highs.length - 1] + lows[lows.length - 1]) / 2 - multiplier * atr

  if (currentClose > upperBand) return 1
  if (currentClose < lowerBand) return -1
  return prevClose > currentClose ? -1 : 1
}

/**
 * Calculate volatility
 */
function calculateVolatility(closes: number[], period: number): number {
  if (closes.length < period + 1) return 0.02

  const returns: number[] = []
  for (let i = closes.length - period; i < closes.length; i++) {
    const ret = (closes[i] - closes[i - 1]) / closes[i - 1]
    returns.push(ret)
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length

  return Math.sqrt(variance)
}

/**
 * Calculate trend strength
 */
function calculateTrendStrength(closes: number[]): number {
  if (closes.length < 20) return 0

  const ema20 = calculateEMA(closes, 20)
  const ema50 = closes.length >= 50 ? calculateEMA(closes, 50) : ema20
  const currentPrice = closes[closes.length - 1]

  // Normalize trend strength to -1 to 1
  const emaDiff = (ema20 - ema50) / ema50
  return Math.max(-1, Math.min(1, emaDiff * 10))
}

/**
 * Calculate EMA cross
 */
function calculateEMACross(closes: number[]): number {
  if (closes.length < 50) return 0

  const ema9 = calculateEMA(closes, 9)
  const ema21 = calculateEMA(closes, 21)

  return ema9 > ema21 ? 1 : -1
}

// =============================================================================
// EXCHANGE FEATURE PROVIDER
// =============================================================================

export class ExchangeFeatureProvider {
  private config: ExchangeFeatureConfig
  private candleCache: OHLCV[] = []
  private lastUpdate: number = 0
  private updateIntervalMs: number = 60000 // 1 minute

  constructor(config: ExchangeFeatureConfig) {
    this.config = {
      lookbackPeriod: 100,
      timeframe: '1h',
      ...config,
    }
  }

  /**
   * Update candle cache
   */
  updateCandles(candles: OHLCV[]): void {
    this.candleCache = candles
    this.lastUpdate = Date.now()
  }

  /**
   * Get signal features from cached data
   */
  getFeatures(context?: MarketDataContext): SignalFeatures {
    const closes = this.candleCache.map(c => c.close)
    const volumes = this.candleCache.map(c => c.volume)

    // Calculate returns
    const return1 = closes.length > 1 
      ? (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]
      : 0
    const return5 = closes.length > 5
      ? (closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]
      : 0
    const return10 = closes.length > 10
      ? (closes[closes.length - 1] - closes[closes.length - 11]) / closes[closes.length - 11]
      : 0

    // Calculate volume features
    const avgVolume = volumes.length > 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : volumes[volumes.length - 1] || 1
    const currentVolume = volumes[volumes.length - 1] || 1
    const volumeRatio = currentVolume / avgVolume

    const volumeTrend = volumes.length > 10
      ? (volumes.slice(-5).reduce((a, b) => a + b, 0) / 5) / 
        (volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5) - 1
      : 0

    // Calculate technical indicators
    const rsi14 = calculateRSI(closes, 14)
    const { macd, signal: macdSignal } = calculateMACD(closes)
    const bollingerPosition = calculateBollingerPosition(closes, 20)
    const adx = calculateADX(this.candleCache, 14)

    // Calculate trend features
    const emaCross = calculateEMACross(closes)
    const supertrendDirection = calculateSuperTrendDirection(this.candleCache)
    const trendStrength = calculateTrendStrength(closes)

    // Calculate volatility
    const volatility10 = calculateVolatility(closes, 10)
    const volatility20 = calculateVolatility(closes, 20)

    return {
      return_1: return1,
      return_5: return5,
      return_10: return10,
      volatility_10: volatility10,
      volatility_20: volatility20,
      rsi_14: rsi14,
      macd: macd,
      macd_signal: macdSignal,
      bollinger_position: bollingerPosition,
      adx: adx,
      volume_ratio: volumeRatio,
      volume_trend: volumeTrend,
      ema_cross: emaCross,
      supertrend_direction: supertrendDirection,
      trend_strength: trendStrength,
      funding_rate: context?.fundingRate || 0,
      basis: context?.basis || 0,
      open_interest_change: context?.openInterestChange || 0,
    }
  }

  /**
   * Get features for a specific signal
   */
  getFeaturesForSignal(
    candles: OHLCV[],
    context?: MarketDataContext
  ): SignalFeatures {
    this.updateCandles(candles)
    return this.getFeatures(context)
  }

  /**
   * Get features with additional context for signal providers
   */
  getFeaturesForSignalWithContext(
    candles: OHLCV[],
    signalContext?: {
      fundingRate?: number
      basis?: number
      openInterestChange?: number
    }
  ): SignalFeatures {
    this.updateCandles(candles)
    return this.getFeatures(signalContext)
  }

  /**
   * Extract features from raw exchange data
   */
  static extractFeaturesFromCandles(
    candles: OHLCV[],
    context?: MarketDataContext
  ): SignalFeatures {
    const provider = new ExchangeFeatureProvider({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      timeframe: '1h',
    })
    return provider.getFeaturesForSignal(candles, context)
  }

  /**
   * Check if cache needs refresh
   */
  needsRefresh(): boolean {
    return Date.now() - this.lastUpdate > this.updateIntervalMs
  }

  /**
   * Get current configuration
   */
  getConfig(): ExchangeFeatureConfig {
    return { ...this.config }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let providers: Map<string, ExchangeFeatureProvider> = new Map()

/**
 * Get or create feature provider for exchange/symbol
 */
export function getFeatureProvider(
  exchange: string,
  symbol: string,
  timeframe: string = '1h'
): ExchangeFeatureProvider {
  const key = `${exchange}:${symbol}:${timeframe}`

  if (!providers.has(key)) {
    providers.set(key, new ExchangeFeatureProvider({
      exchange,
      symbol,
      timeframe,
    }))
  }

  return providers.get(key)!
}

/**
 * Clear all providers
 */
export function clearProviders(): void {
  providers.clear()
}
