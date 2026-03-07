/**
 * Trading Environment
 * Gym-compatible environment for RL trading agents
 */

import type {
  OHLCV
} from '../ml-pipeline/types'
import type {
  Action,
  ActionType,
  State,
  Observation,
  StepResult,
  EnvironmentConfig
} from './types'

export class TradingEnvironment {
  private config: EnvironmentConfig
  private data: OHLCV[] = []
  private currentIndex: number = 0
  private position: number = 0
  private entryPrice: number = 0
  private balance: number = 0
  private initialBalance: number = 0
  private maxEquity: number = 0
  private equityHistory: number[] = []
  private tradeCount: number = 0
  private wins: number = 0
  private totalPnl: number = 0

  constructor(config?: Partial<EnvironmentConfig>) {
    this.config = {
      initialBalance: 10000,
      commissionRate: 0.0004, // 0.04%
      slippageRate: 0.0001, // 0.01%
      maxPosition: 1,
      leverage: 1,
      rewardScaling: 100,
      punishHolding: false,
      rewardFunction: 'pnl',
      ...config
    }
    this.balance = this.config.initialBalance
    this.initialBalance = this.config.initialBalance
  }

  /**
   * Reset environment with new data
   */
  reset(data: OHLCV[]): Observation {
    this.data = data
    this.currentIndex = 50 // Start after enough data for indicators
    this.position = 0
    this.entryPrice = 0
    this.balance = this.config.initialBalance
    this.maxEquity = this.config.initialBalance
    this.equityHistory = [this.config.initialBalance]
    this.tradeCount = 0
    this.wins = 0
    this.totalPnl = 0

    return this.getObservation()
  }

  /**
   * Take a step in the environment
   */
  step(action: Action): StepResult {
    const currentPrice = this.data[this.currentIndex].close
    let reward = 0
    const prevEquity = this.getEquity(currentPrice)

    // Execute action
    switch (action.type) {
      case 'long':
        if (this.position <= 0) {
          // Close short if exists
          if (this.position < 0) {
            this.closePosition(currentPrice)
          }
          // Open long
          this.openPosition(1, currentPrice, action.size || 1)
        }
        break

      case 'short':
        if (this.position >= 0) {
          // Close long if exists
          if (this.position > 0) {
            this.closePosition(currentPrice)
          }
          // Open short
          this.openPosition(-1, currentPrice, action.size || 1)
        }
        break

      case 'close_long':
        if (this.position > 0) {
          this.closePosition(currentPrice)
        }
        break

      case 'close_short':
        if (this.position < 0) {
          this.closePosition(currentPrice)
        }
        break

      case 'hold':
        // No action
        break
    }

    // Move to next candle
    this.currentIndex++
    const newPrice = this.data[this.currentIndex]?.close || currentPrice
    const newEquity = this.getEquity(newPrice)

    // Update max equity and drawdown
    this.maxEquity = Math.max(this.maxEquity, newEquity)
    this.equityHistory.push(newEquity)

    // Calculate reward
    reward = this.calculateReward(prevEquity, newEquity)

    // Punish holding if enabled
    if (this.config.punishHolding && this.position !== 0) {
      reward -= 0.001 // Small penalty for holding
    }

    // Check if done
    const done = this.isDone()

    return {
      observation: this.getObservation(),
      reward: reward * this.config.rewardScaling,
      done,
      info: {
        pnl: newEquity - this.initialBalance,
        tradeCount: this.tradeCount,
        position: this.position,
        equity: newEquity
      }
    }
  }

  /**
   * Get current observation
   */
  private getObservation(): Observation {
    return {
      state: this.getState(),
      timestamp: this.data[this.currentIndex]?.timestamp || 0
    }
  }

  /**
   * Get current state
   */
  private getState(): State {
    const candle = this.data[this.currentIndex]
    const prevCandles = this.data.slice(this.currentIndex - 50, this.currentIndex)
    const closes = prevCandles.map((c) => c.close)

    // Calculate indicators
    const rsi = this.calculateRSI(closes, 14)
    const macd = this.calculateMACD(closes)
    const atr = this.calculateATR(prevCandles, 14)
    const adx = this.calculateADX(prevCandles, 14)
    const volatility = this.calculateVolatility(closes, 20)
    const trend = this.calculateTrend(closes, 20)
    const momentum = this.calculateMomentum(closes, 10)

    const currentPrice = candle.close
    const equity = this.getEquity(currentPrice)
    const drawdown = (this.maxEquity - equity) / this.maxEquity

    return {
      close: currentPrice,
      high: candle.high,
      low: candle.low,
      volume: candle.volume,
      rsi,
      macd: macd.macd,
      macdSignal: macd.signal,
      atr,
      adx,
      position: this.position,
      entryPrice: this.entryPrice,
      unrealizedPnl: this.position * (currentPrice - this.entryPrice),
      unrealizedPnlPercent: this.position * (currentPrice - this.entryPrice) / this.entryPrice,
      balance: this.balance,
      equity,
      drawdown,
      volatility,
      trend,
      momentum,
      hour: new Date(candle.timestamp).getHours(),
      dayOfWeek: new Date(candle.timestamp).getDay()
    }
  }

  /**
   * Open position
   */
  private openPosition(direction: number, price: number, size: number): void {
    const effectiveSize = Math.min(size, this.config.maxPosition) * direction
    const slippage = price * this.config.slippageRate
    const executionPrice = direction > 0 ? price + slippage : price - slippage
    const commission = Math.abs(effectiveSize) * price * this.config.commissionRate

    this.position = effectiveSize
    this.entryPrice = executionPrice
    this.balance -= commission
    this.tradeCount++
  }

  /**
   * Close position
   */
  private closePosition(price: number): void {
    if (this.position === 0) return

    const slippage = price * this.config.slippageRate
    const executionPrice = this.position > 0 ? price - slippage : price + slippage
    const pnl = this.position * (executionPrice - this.entryPrice) * this.config.leverage
    const commission = Math.abs(this.position) * price * this.config.commissionRate

    this.balance += pnl - commission
    this.totalPnl += pnl

    if (pnl > 0) this.wins++

    this.position = 0
    this.entryPrice = 0
  }

  /**
   * Calculate current equity
   */
  private getEquity(currentPrice: number): number {
    const unrealizedPnl = this.position * (currentPrice - this.entryPrice) * this.config.leverage
    return this.balance + unrealizedPnl
  }

  /**
   * Calculate reward
   */
  private calculateReward(prevEquity: number, newEquity: number): number {
    const pnl = (newEquity - prevEquity) / this.initialBalance

    switch (this.config.rewardFunction) {
      case 'sharpe':
        return this.calculateSharpeReward(pnl)
      case 'sortino':
        return this.calculateSortinoReward(pnl)
      case 'calmar':
        return this.calculateCalmarReward(pnl)
      default:
        return pnl
    }
  }

  private calculateSharpeReward(pnl: number): number {
    if (this.equityHistory.length < 2) return pnl
    const returns = this.getReturns()
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length)
    return std > 0 ? pnl / std : pnl
  }

  private calculateSortinoReward(pnl: number): number {
    if (this.equityHistory.length < 2) return pnl
    const returns = this.getReturns()
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const negativeReturns = returns.filter((r) => r < 0)
    const downsideDev = Math.sqrt(negativeReturns.reduce((sum, r) => sum + r ** 2, 0) / negativeReturns.length)
    return downsideDev > 0 ? pnl / downsideDev : pnl
  }

  private calculateCalmarReward(pnl: number): number {
    const drawdown = this.maxEquity > 0 ? (this.maxEquity - this.equityHistory[this.equityHistory.length - 1]) / this.maxEquity : 0
    return drawdown > 0 ? pnl / drawdown : pnl
  }

  private getReturns(): number[] {
    const returns: number[] = []
    for (let i = 1; i < this.equityHistory.length; i++) {
      returns.push((this.equityHistory[i] - this.equityHistory[i - 1]) / this.equityHistory[i - 1])
    }
    return returns
  }

  /**
   * Check if episode is done
   */
  private isDone(): boolean {
    // End of data
    if (this.currentIndex >= this.data.length - 1) return true

    // Ruin (balance too low)
    const currentPrice = this.data[this.currentIndex].close
    const equity = this.getEquity(currentPrice)
    if (equity < this.initialBalance * 0.1) return true

    return false
  }

  /**
   * Get state as array for neural network
   */
  getStateArray(): number[] {
    const state = this.getState()
    return [
      this.normalize(state.close, 0, 100000),
      this.normalize(state.high, 0, 100000),
      this.normalize(state.low, 0, 100000),
      this.normalize(state.volume, 0, 1000000000),
      state.rsi / 100,
      this.normalize(state.macd, -1000, 1000),
      this.normalize(state.macdSignal, -1000, 1000),
      this.normalize(state.atr, 0, 10000),
      state.adx / 100,
      state.position,
      this.normalize(state.entryPrice, 0, 100000),
      state.unrealizedPnlPercent,
      this.normalize(state.balance, 0, 100000),
      this.normalize(state.equity, 0, 100000),
      state.drawdown,
      state.volatility,
      state.trend,
      state.momentum,
      state.hour / 24,
      state.dayOfWeek / 7
    ]
  }

  private normalize(value: number, min: number, max: number): number {
    return (value - min) / (max - min)
  }

  /**
   * Get environment statistics
   */
  getStats(): {
    tradeCount: number
    winRate: number
    totalPnl: number
    maxDrawdown: number
    sharpeRatio: number
  } {
    const maxDrawdown = this.calculateMaxDrawdown()
    const returns = this.getReturns()
    const sharpeRatio = this.calculateSharpeRatio(returns)

    return {
      tradeCount: this.tradeCount,
      winRate: this.tradeCount > 0 ? this.wins / this.tradeCount : 0,
      totalPnl: this.totalPnl,
      maxDrawdown,
      sharpeRatio
    }
  }

  private calculateMaxDrawdown(): number {
    let maxDD = 0
    let peak = this.equityHistory[0]

    for (const equity of this.equityHistory) {
      if (equity > peak) peak = equity
      const dd = (peak - equity) / peak
      maxDD = Math.max(maxDD, dd)
    }

    return maxDD
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length)
    return std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : 0 // Annualized
  }

  // Technical indicator helpers
  private calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50

    const changes = closes.slice(1).map((c, i) => c - closes[i])
    const recentChanges = changes.slice(-period)

    const gains = recentChanges.filter((c) => c > 0)
    const losses = recentChanges.filter((c) => c < 0).map(Math.abs)

    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0

    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - 100 / (1 + rs)
  }

  private calculateMACD(closes: number[]): { macd: number; signal: number } {
    const ema12 = this.calculateEMA(closes, 12)
    const ema26 = this.calculateEMA(closes, 26)
    const macd = ema12 - ema26
    // Simplified signal
    return { macd, signal: macd * 0.8 }
  }

  private calculateEMA(values: number[], period: number): number {
    const k = 2 / (period + 1)
    let ema = values[0]
    for (let i = 1; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k)
    }
    return ema
  }

  private calculateATR(candles: OHLCV[], period: number): number {
    if (candles.length < period) return 0

    const trueRanges = candles.slice(1).map((c, i) => {
      const prev = candles[i]
      return Math.max(
        c.high - c.low,
        Math.abs(c.high - prev.close),
        Math.abs(c.low - prev.close)
      )
    })

    return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period
  }

  private calculateADX(candles: OHLCV[], period: number): number {
    if (candles.length < period * 2) return 25

    // Simplified ADX calculation
    const ranges = candles.slice(-period).map((c) => c.high - c.low)
    return ranges.reduce((a, b) => a + b, 0) / period / candles[candles.length - 1].close * 100
  }

  private calculateVolatility(closes: number[], period: number): number {
    if (closes.length < period) return 0

    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i])
    const recentReturns = returns.slice(-period)

    const mean = recentReturns.reduce((a, b) => a + b, 0) / period
    return Math.sqrt(recentReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / period)
  }

  private calculateTrend(closes: number[], period: number): number {
    if (closes.length < period) return 0

    const recent = closes.slice(-period)
    const first = recent[0]
    const last = recent[recent.length - 1]
    const trend = (last - first) / first

    return Math.max(-1, Math.min(1, trend * 10))
  }

  private calculateMomentum(closes: number[], period: number): number {
    if (closes.length < period + 1) return 0

    const current = closes[closes.length - 1]
    const past = closes[closes.length - 1 - period]
    return (current - past) / past
  }
}
