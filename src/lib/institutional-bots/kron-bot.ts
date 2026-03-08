/**
 * KRON BOT - Trend Following
 *
 * Systematic trend following using multiple indicators.
 * Combines EMA crossovers, ADX, Supertrend, and MACD.
 * 
 * NO NEURAL NETWORKS - Classical trend following methods only.
 */

import type {
  KronConfig,
  KronState,
  TrendSignal,
  TrendPosition,
  TrendStats,
  TrendDirection,
  BotStatus,
} from './types';

export class KronBot {
  private config: KronConfig;
  private state: KronState;
  private priceHistory: Map<string, number[]> = new Map();
  private highHistory: Map<string, number[]> = new Map();
  private lowHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();

  constructor(config: Partial<KronConfig> = {}) {
    this.config = {
      name: 'Kron',
      code: 'TRF',
      version: '1.0.0',
      mode: 'PAPER',
      exchanges: [],
      riskConfig: {
        maxPositionSize: 15000,
        maxTotalExposure: 150000,
        maxDrawdownPct: 0.20,
        riskPerTrade: 0.03,
        maxLeverage: 10,
      },
      notifications: {
        telegram: false,
        email: false,
        onSignal: true,
        onTrade: true,
        onRiskEvent: true,
      },
      logLevel: 'INFO',
      strategy: {
        trendMethod: 'COMBINED',
        emaPeriods: { fast: 9, medium: 21, slow: 55 },
        adxThreshold: 25,
        supertrendPeriod: 10,
        supertrendMultiplier: 3,
        minTrendStrength: 0.6,
        trailingStop: {
          enabled: true,
          atrPeriod: 14,
          atrMultiplier: 3,
        },
        pyramidEnabled: true,
        maxPyramidLevels: 3,
        positionSizing: 'VOLATILITY_ADJUSTED',
      },
      ...config,
    };

    this.state = {
      status: 'STOPPED',
      trends: new Map(),
      positions: new Map(),
      signals: [],
      stats: {
        totalTrades: 0,
        winRate: 0,
        avgPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        avgHoldingTime: 0,
        trendCapture: 0,
      },
    };
  }

  /**
   * Start the bot
   */
  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.state.status !== 'STOPPED') {
      return { success: false, message: 'Bot already running' };
    }

    this.state.status = 'STARTING';
    this.state.status = 'RUNNING';

    return { success: true, message: 'Kron started' };
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    this.state.status = 'STOPPED';
    return { success: true, message: 'Kron stopped' };
  }

  /**
   * Update with new OHLCV data
   */
  public updateData(
    symbol: string,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number
  ): TrendSignal[] {
    // Update histories
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
      this.highHistory.set(symbol, []);
      this.lowHistory.set(symbol, []);
      this.volumeHistory.set(symbol, []);
    }

    this.priceHistory.get(symbol)!.push(close);
    this.highHistory.get(symbol)!.push(high);
    this.lowHistory.get(symbol)!.push(low);
    this.volumeHistory.get(symbol)!.push(volume);

    // Keep last 200 candles
    const maxLen = 200;
    if (this.priceHistory.get(symbol)!.length > maxLen) {
      this.priceHistory.get(symbol)!.shift();
      this.highHistory.get(symbol)!.shift();
      this.lowHistory.get(symbol)!.shift();
      this.volumeHistory.get(symbol)!.shift();
    }

    // Update trend direction
    this.updateTrendDirection(symbol);

    // Generate signals
    const signal = this.generateSignal(symbol, close);
    if (signal) {
      this.state.signals.push(signal);
      // Keep last 100 signals
      if (this.state.signals.length > 100) {
        this.state.signals.shift();
      }
    }

    return this.state.signals.filter(s => s.symbol === symbol);
  }

  /**
   * Update trend direction for symbol
   */
  private updateTrendDirection(symbol: string): void {
    const prices = this.priceHistory.get(symbol);
    if (!prices || prices.length < this.config.strategy.emaPeriods.slow) {
      this.state.trends.set(symbol, 'SIDEWAYS');
      return;
    }

    const emaFast = this.calculateEMA(prices, this.config.strategy.emaPeriods.fast);
    const emaMedium = this.calculateEMA(prices, this.config.strategy.emaPeriods.medium);
    const emaSlow = this.calculateEMA(prices, this.config.strategy.emaPeriods.slow);

    // Determine trend
    if (emaFast > emaMedium && emaMedium > emaSlow) {
      this.state.trends.set(symbol, 'UPTREND');
    } else if (emaFast < emaMedium && emaMedium < emaSlow) {
      this.state.trends.set(symbol, 'DOWNTREND');
    } else {
      this.state.trends.set(symbol, 'SIDEWAYS');
    }
  }

  /**
   * Generate trading signal
   */
  private generateSignal(symbol: string, currentPrice: number): TrendSignal | null {
    const prices = this.priceHistory.get(symbol);
    const highs = this.highHistory.get(symbol);
    const lows = this.lowHistory.get(symbol);

    if (!prices || prices.length < this.config.strategy.emaPeriods.slow) {
      return null;
    }

    // Check if we already have a position
    const existingPosition = this.state.positions.get(symbol);
    if (existingPosition && existingPosition.pyramidLevel >= this.config.strategy.maxPyramidLevels) {
      return null;
    }

    // Calculate indicators
    const ema = {
      fast: this.calculateEMA(prices, this.config.strategy.emaPeriods.fast),
      medium: this.calculateEMA(prices, this.config.strategy.emaPeriods.medium),
      slow: this.calculateEMA(prices, this.config.strategy.emaPeriods.slow),
    };

    const adx = this.calculateADX(highs!, lows!, prices);
    const supertrend = this.calculateSupertrend(highs!, lows!, prices);
    const macd = this.calculateMACD(prices);

    // Determine signal direction
    let direction: 'LONG' | 'SHORT' | null = null;
    let strength = 0;

    switch (this.config.strategy.trendMethod) {
      case 'EMA_CROSS':
        direction = this.emaCrossSignal(ema, prices);
        strength = direction ? 0.7 : 0;
        break;

      case 'ADX':
        direction = this.adxSignal(adx, ema, prices);
        strength = adx / 100;
        break;

      case 'SUPERTREND':
        direction = supertrend.direction > 0 ? 'LONG' : 'SHORT';
        strength = 0.6;
        break;

      case 'COMBINED':
        const result = this.combinedSignal(ema, adx, supertrend, macd, prices);
        direction = result.direction;
        strength = result.strength;
        break;
    }

    if (!direction || strength < this.config.strategy.minTrendStrength) {
      return null;
    }

    // Check ADX threshold
    if (adx < this.config.strategy.adxThreshold) {
      return null;
    }

    const signal: TrendSignal = {
      id: `sig-${symbol}-${Date.now()}`,
      timestamp: Date.now(),
      symbol,
      exchange: this.config.exchanges[0]?.exchange || 'binance',
      direction,
      strength,
      confidence: this.calculateConfidence(ema, adx, supertrend, macd, direction),
      indicators: {
        adx,
        macd,
        ema,
        supertrend,
      },
      price: currentPrice,
    };

    return signal;
  }

  /**
   * EMA crossover signal
   */
  private emaCrossSignal(
    ema: { fast: number; medium: number; slow: number },
    prices: number[]
  ): 'LONG' | 'SHORT' | null {
    const price = prices[prices.length - 1];
    
    // Bullish: price > fast EMA > medium EMA > slow EMA
    if (price > ema.fast && ema.fast > ema.medium && ema.medium > ema.slow) {
      return 'LONG';
    }
    
    // Bearish: price < fast EMA < medium EMA < slow EMA
    if (price < ema.fast && ema.fast < ema.medium && ema.medium < ema.slow) {
      return 'SHORT';
    }

    return null;
  }

  /**
   * ADX-based signal
   */
  private adxSignal(
    adx: number,
    ema: { fast: number; medium: number; slow: number },
    prices: number[]
  ): 'LONG' | 'SHORT' | null {
    if (adx < this.config.strategy.adxThreshold) return null;
    return this.emaCrossSignal(ema, prices);
  }

  /**
   * Combined signal from multiple indicators
   */
  private combinedSignal(
    ema: { fast: number; medium: number; slow: number },
    adx: number,
    supertrend: { value: number; direction: number },
    macd: { value: number; signal: number; histogram: number },
    prices: number[]
  ): { direction: 'LONG' | 'SHORT' | null; strength: number } {
    let longScore = 0;
    let shortScore = 0;
    const weights = { ema: 0.3, adx: 0.15, supertrend: 0.35, macd: 0.2 };

    // EMA alignment
    const price = prices[prices.length - 1];
    if (price > ema.fast && ema.fast > ema.medium && ema.medium > ema.slow) {
      longScore += weights.ema;
    } else if (price < ema.fast && ema.fast < ema.medium && ema.medium < ema.slow) {
      shortScore += weights.ema;
    }

    // ADX strength
    if (adx > this.config.strategy.adxThreshold) {
      const adxScore = Math.min(adx / 50, 1) * weights.adx;
      longScore += adxScore;
      shortScore += adxScore;
    }

    // Supertrend
    if (supertrend.direction > 0) {
      longScore += weights.supertrend;
    } else {
      shortScore += weights.supertrend;
    }

    // MACD
    if (macd.histogram > 0) {
      longScore += weights.macd * Math.min(macd.histogram / Math.abs(macd.value || 1), 1);
    } else {
      shortScore += weights.macd * Math.min(Math.abs(macd.histogram) / Math.abs(macd.value || 1), 1);
    }

    const strength = Math.max(longScore, shortScore);
    
    if (longScore > shortScore && strength >= this.config.strategy.minTrendStrength) {
      return { direction: 'LONG', strength };
    } else if (shortScore > longScore && strength >= this.config.strategy.minTrendStrength) {
      return { direction: 'SHORT', strength };
    }

    return { direction: null, strength: 0 };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    ema: { fast: number; medium: number; slow: number },
    adx: number,
    supertrend: { value: number; direction: number },
    macd: { value: number; signal: number; histogram: number },
    direction: 'LONG' | 'SHORT'
  ): number {
    let confirmations = 0;
    let total = 4;

    // EMA alignment
    const emaAligned = direction === 'LONG'
      ? ema.fast > ema.medium && ema.medium > ema.slow
      : ema.fast < ema.medium && ema.medium < ema.slow;
    if (emaAligned) confirmations++;

    // ADX strength
    if (adx > 25) confirmations++;

    // Supertrend alignment
    const stAligned = direction === 'LONG' ? supertrend.direction > 0 : supertrend.direction < 0;
    if (stAligned) confirmations++;

    // MACD alignment
    const macdAligned = direction === 'LONG' ? macd.histogram > 0 : macd.histogram < 0;
    if (macdAligned) confirmations++;

    return confirmations / total;
  }

  /**
   * Calculate EMA
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  /**
   * Calculate ADX
   */
  private calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (highs.length < period + 1) return 0;

    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const tr: number[] = [];

    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

      const trValue = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      tr.push(trValue);
    }

    // Smooth using EMA
    const smoothTR = this.calculateEMA(tr, period);
    const smoothPlusDM = this.calculateEMA(plusDM, period);
    const smoothMinusDM = this.calculateEMA(minusDM, period);

    const plusDI = (smoothPlusDM / smoothTR) * 100;
    const minusDI = (smoothMinusDM / smoothTR) * 100;

    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    
    return isFinite(dx) ? dx : 0;
  }

  /**
   * Calculate Supertrend
   */
  private calculateSupertrend(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = this.config.strategy.supertrendPeriod,
    multiplier: number = this.config.strategy.supertrendMultiplier
  ): { value: number; direction: number } {
    if (closes.length < period) {
      return { value: closes[closes.length - 1] || 0, direction: 0 };
    }

    // Calculate ATR
    const atr = this.calculateATR(highs, lows, closes, period);
    
    // Calculate basic bands
    const hl2 = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
    const upperBand = hl2 + multiplier * atr;
    const lowerBand = hl2 - multiplier * atr;

    const close = closes[closes.length - 1];
    
    // Simplified - return current band
    if (close > upperBand) {
      return { value: lowerBand, direction: 1 };
    } else if (close < lowerBand) {
      return { value: upperBand, direction: -1 };
    }
    
    return { value: hl2, direction: 0 };
  }

  /**
   * Calculate ATR
   */
  private calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (highs.length < period + 1) return 0;

    const trValues: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trValues.push(tr);
    }

    return this.calculateEMA(trValues, period);
  }

  /**
   * Calculate MACD
   */
  private calculateMACD(
    prices: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): { value: number; signal: number; histogram: number } {
    const emaFast = this.calculateEMA(prices, fastPeriod);
    const emaSlow = this.calculateEMA(prices, slowPeriod);
    const macdValue = emaFast - emaSlow;

    // For signal line, we need MACD history
    // Simplified - use current value
    const signal = macdValue * 0.9; // Approximation
    const histogram = macdValue - signal;

    return { value: macdValue, signal, histogram };
  }

  /**
   * Open a position
   */
  public openPosition(signal: TrendSignal, capital: number): TrendPosition | null {
    const existingPosition = this.state.positions.get(signal.symbol);
    
    if (existingPosition) {
      // Pyramiding
      if (!this.config.strategy.pyramidEnabled) return null;
      if (existingPosition.pyramidLevel >= this.config.strategy.maxPyramidLevels) return null;
      if (existingPosition.side !== signal.direction) return null;

      // Add to position
      const addSize = capital / signal.price;
      existingPosition.size += addSize;
      existingPosition.pyramidLevel++;
      return existingPosition;
    }

    const prices = this.priceHistory.get(signal.symbol);
    const highs = this.highHistory.get(signal.symbol);
    const lows = this.lowHistory.get(signal.symbol);

    let stopLoss = signal.price * 0.02; // Default 2%
    
    if (this.config.strategy.trailingStop.enabled && highs && lows && prices) {
      const atr = this.calculateATR(highs, lows, prices, this.config.strategy.trailingStop.atrPeriod);
      stopLoss = signal.direction === 'LONG'
        ? signal.price - atr * this.config.strategy.trailingStop.atrMultiplier
        : signal.price + atr * this.config.strategy.trailingStop.atrMultiplier;
    }

    const size = capital / signal.price;

    const position: TrendPosition = {
      id: `pos-${signal.symbol}-${Date.now()}`,
      symbol: signal.symbol,
      exchange: signal.exchange,
      side: signal.direction,
      size,
      entryPrice: signal.price,
      currentPrice: signal.price,
      stopLoss,
      trailingStop: stopLoss,
      pyramidLevel: 0,
      pnl: 0,
      openedAt: Date.now(),
    };

    this.state.positions.set(signal.symbol, position);
    return position;
  }

  /**
   * Update positions
   */
  public updatePositions(currentPrices: Record<string, number>): void {
    for (const [symbol, position] of this.state.positions) {
      const price = currentPrices[symbol];
      if (!price) continue;

      position.currentPrice = price;

      // Calculate PnL
      const pnlPct = position.side === 'LONG'
        ? (price - position.entryPrice) / position.entryPrice
        : (position.entryPrice - price) / position.entryPrice;
      
      position.pnl = pnlPct * position.size * position.entryPrice;

      // Update trailing stop
      if (this.config.strategy.trailingStop.enabled) {
        if (position.side === 'LONG' && price > position.trailingStop) {
          const prices = this.priceHistory.get(symbol);
          const highs = this.highHistory.get(symbol);
          const lows = this.lowHistory.get(symbol);
          
          if (prices && highs && lows) {
            const atr = this.calculateATR(highs, lows, prices, this.config.strategy.trailingStop.atrPeriod);
            const newTrailing = price - atr * this.config.strategy.trailingStop.atrMultiplier;
            if (newTrailing > position.trailingStop) {
              position.trailingStop = newTrailing;
            }
          }
        } else if (position.side === 'SHORT' && price < position.trailingStop) {
          const prices = this.priceHistory.get(symbol);
          const highs = this.highHistory.get(symbol);
          const lows = this.lowHistory.get(symbol);
          
          if (prices && highs && lows) {
            const atr = this.calculateATR(highs, lows, prices, this.config.strategy.trailingStop.atrPeriod);
            const newTrailing = price + atr * this.config.strategy.trailingStop.atrMultiplier;
            if (newTrailing < position.trailingStop) {
              position.trailingStop = newTrailing;
            }
          }
        }
      }

      // Check stop loss
      if (position.side === 'LONG') {
        if (price <= position.stopLoss || price <= position.trailingStop) {
          this.closePosition(symbol, 'Stop loss hit');
        }
      } else {
        if (price >= position.stopLoss || price >= position.trailingStop) {
          this.closePosition(symbol, 'Stop loss hit');
        }
      }
    }
  }

  /**
   * Close a position
   */
  public closePosition(symbol: string, reason: string): { pnl: number } | null {
    const position = this.state.positions.get(symbol);
    if (!position) return null;

    this.state.positions.delete(symbol);

    // Update stats
    this.state.stats.totalTrades++;
    if (position.pnl > 0) {
      const wins = Math.round(this.state.stats.winRate * (this.state.stats.totalTrades - 1));
      this.state.stats.winRate = (wins + 1) / this.state.stats.totalTrades;
      this.state.stats.avgWin = 
        (this.state.stats.avgWin * (wins) + position.pnl) / (wins + 1);
    } else {
      const losses = this.state.stats.totalTrades - Math.round(this.state.stats.winRate * this.state.stats.totalTrades);
      this.state.stats.avgLoss = 
        (this.state.stats.avgLoss * (losses - 1) + position.pnl) / losses;
    }

    return { pnl: position.pnl };
  }

  /**
   * Get current state
   */
  public getState(): KronState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  public getConfig(): KronConfig {
    return { ...this.config };
  }

  /**
   * Get trend direction for symbol
   */
  public getTrendDirection(symbol: string): TrendDirection {
    return this.state.trends.get(symbol) || 'SIDEWAYS';
  }
}
