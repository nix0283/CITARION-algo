/**
 * EQUILIBRIST BOT - Mean Reversion
 *
 * Trades mean reversion using Bollinger Bands, RSI, and Z-score.
 * NO NEURAL NETWORKS - Classical statistical methods only.
 */

import type {
  EquilibristConfig,
  EquilibristState,
  MeanReversionSignal,
  MeanReversionPosition,
  MeanReversionStats,
  BotStatus,
} from './types';

export class EquilibristBot {
  private config: EquilibristConfig;
  private state: EquilibristState;
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();

  constructor(config: Partial<EquilibristConfig> = {}) {
    this.config = {
      name: 'Equilibrist',
      code: 'MR',
      version: '1.0.0',
      mode: 'PAPER',
      exchanges: [],
      riskConfig: {
        maxPositionSize: 10000,
        maxTotalExposure: 100000,
        maxDrawdownPct: 0.15,
        riskPerTrade: 0.02,
        maxLeverage: 5,
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
        lookbackPeriod: 50,
        zScoreEntry: 2.0,
        zScoreExit: 0.5,
        zScoreStopLoss: 3.5,
        meanCalcMethod: 'SMA',
        stdCalcMethod: 'SIMPLE',
        bollingerBands: true,
        rsiConfirmation: true,
        volumeConfirmation: true,
        maxHoldingPeriod: 24 * 60 * 60 * 1000, // 24 hours
      },
      ...config,
    };

    this.state = {
      status: 'STOPPED',
      fairValues: new Map(),
      positions: new Map(),
      signals: [],
      stats: {
        totalTrades: 0,
        winRate: 0,
        avgPnL: 0,
        avgHoldingTime: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        avgZScoreEntry: 0,
        avgZScoreExit: 0,
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

    return { success: true, message: 'Equilibrist started' };
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    this.state.status = 'STOPPED';
    return { success: true, message: 'Equilibrist stopped' };
  }

  /**
   * Update with new price data
   */
  public updatePrices(prices: Record<string, number>, volumes?: Record<string, number>): MeanReversionSignal[] {
    // Update histories
    for (const [symbol, price] of Object.entries(prices)) {
      if (!this.priceHistory.has(symbol)) {
        this.priceHistory.set(symbol, []);
        this.volumeHistory.set(symbol, []);
      }

      this.priceHistory.get(symbol)!.push(price);
      if (volumes && volumes[symbol]) {
        this.volumeHistory.get(symbol)!.push(volumes[symbol]);
      }

      // Trim to lookback period
      const maxLen = this.config.strategy.lookbackPeriod * 2;
      if (this.priceHistory.get(symbol)!.length > maxLen) {
        this.priceHistory.get(symbol)!.shift();
        this.volumeHistory.get(symbol)!.shift();
      }
    }

    // Calculate fair values and signals
    const signals: MeanReversionSignal[] = [];

    for (const symbol of Object.keys(prices)) {
      const priceHistory = this.priceHistory.get(symbol)!;
      if (priceHistory.length < this.config.strategy.lookbackPeriod) continue;

      const price = priceHistory[priceHistory.length - 1];
      
      // Calculate fair value
      const fairValue = this.calculateFairValue(priceHistory);
      this.state.fairValues.set(symbol, fairValue);

      // Calculate z-score
      const zScore = this.calculateZScore(price, priceHistory);

      // Calculate indicators
      const rsi = this.config.strategy.rsiConfirmation 
        ? this.calculateRSI(priceHistory) 
        : null;
      
      const bollingerBands = this.config.strategy.bollingerBands
        ? this.calculateBollingerBands(priceHistory)
        : null;

      const volumeConfirm = this.config.strategy.volumeConfirmation
        ? this.checkVolumeConfirmation(symbol)
        : true;

      // Check if we already have a position
      if (this.state.positions.has(symbol)) continue;

      // Generate signal
      const absZScore = Math.abs(zScore);
      
      if (absZScore >= this.config.strategy.zScoreEntry && volumeConfirm) {
        // Confirm with RSI
        let rsiConfirm = true;
        if (rsi !== null) {
          rsiConfirm = zScore > 0 ? rsi > 70 : rsi < 30;
        }

        // Confirm with Bollinger Bands
        let bbConfirm = true;
        if (bollingerBands) {
          bbConfirm = zScore > 0 
            ? price > bollingerBands.upper 
            : price < bollingerBands.lower;
        }

        if (rsiConfirm && bbConfirm) {
          const signal: MeanReversionSignal = {
            id: `sig-${symbol}-${Date.now()}`,
            timestamp: Date.now(),
            symbol,
            exchange: this.config.exchanges[0]?.exchange || 'binance',
            price,
            fairValue,
            deviation: (price - fairValue) / fairValue,
            zScore,
            direction: zScore > 0 ? 'SHORT' : 'LONG',
            confidence: Math.min(absZScore / this.config.strategy.zScoreStopLoss, 1),
            expectedReturn: Math.abs(zScore) * 0.01, // Estimate
          };

          signals.push(signal);
        }
      }
    }

    this.state.signals = signals;
    return signals;
  }

  /**
   * Calculate fair value (mean)
   */
  private calculateFairValue(prices: number[]): number {
    const lookback = this.config.strategy.lookbackPeriod;
    const relevantPrices = prices.slice(-lookback);

    switch (this.config.strategy.meanCalcMethod) {
      case 'SMA':
        return relevantPrices.reduce((s, p) => s + p, 0) / relevantPrices.length;
      
      case 'EMA':
        return this.calculateEMA(relevantPrices);
      
      case 'KAMA':
        return this.calculateKAMA(relevantPrices);
      
      case 'REGRESSION':
        return this.calculateRegressionMean(relevantPrices);
      
      default:
        return relevantPrices.reduce((s, p) => s + p, 0) / relevantPrices.length;
    }
  }

  /**
   * Calculate EMA
   */
  private calculateEMA(prices: number[]): number {
    if (prices.length === 0) return 0;
    const multiplier = 2 / (prices.length + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  /**
   * Calculate KAMA (Kaufman's Adaptive Moving Average)
   */
  private calculateKAMA(prices: number[]): number {
    if (prices.length < 10) return prices[prices.length - 1] || 0;

    const period = 10;
    const fast = 2 / (2 + 1);
    const slow = 2 / (30 + 1);

    // Calculate efficiency ratio
    let change = 0;
    let volatility = 0;
    
    for (let i = prices.length - period; i < prices.length; i++) {
      if (i > 0) {
        volatility += Math.abs(prices[i] - prices[i - 1]);
      }
    }
    change = Math.abs(prices[prices.length - 1] - prices[prices.length - period]);
    
    const er = volatility > 0 ? change / volatility : 0;
    const sc = er * (fast - slow) + slow;
    const sc2 = sc * sc;

    let kama = prices[prices.length - period - 1] || prices[0];
    for (let i = prices.length - period; i < prices.length; i++) {
      kama = kama + sc2 * (prices[i] - kama);
    }

    return kama;
  }

  /**
   * Calculate regression-based mean
   */
  private calculateRegressionMean(prices: number[]): number {
    const n = prices.length;
    const xMean = (n - 1) / 2;
    const yMean = prices.reduce((s, p) => s + p, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (prices[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    const slope = denominator > 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    // Return the last point on regression line
    return slope * (n - 1) + intercept;
  }

  /**
   * Calculate z-score
   */
  private calculateZScore(currentPrice: number, prices: number[]): number {
    const lookback = this.config.strategy.lookbackPeriod;
    const relevantPrices = prices.slice(-lookback);

    let std: number;
    switch (this.config.strategy.stdCalcMethod) {
      case 'SIMPLE':
        const mean = relevantPrices.reduce((s, p) => s + p, 0) / relevantPrices.length;
        std = Math.sqrt(relevantPrices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / relevantPrices.length);
        break;
      
      case 'EWMA':
        std = this.calculateEWMAStd(relevantPrices);
        break;
      
      case 'PARKINSON':
        std = this.calculateParkinsonStd(prices);
        break;
      
      default:
        const avg = relevantPrices.reduce((s, p) => s + p, 0) / relevantPrices.length;
        std = Math.sqrt(relevantPrices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / relevantPrices.length);
    }

    const fairValue = this.calculateFairValue(prices);
    return std > 0 ? (currentPrice - fairValue) / std : 0;
  }

  /**
   * Calculate EWMA standard deviation
   */
  private calculateEWMAStd(prices: number[]): number {
    if (prices.length < 2) return 0;
    const lambda = 0.94;
    let variance = 0;
    let weight = 1 - lambda;

    for (let i = 1; i < prices.length; i++) {
      const returnVal = (prices[i] - prices[i - 1]) / prices[i - 1];
      variance = lambda * variance + weight * returnVal * returnVal;
    }

    return Math.sqrt(variance);
  }

  /**
   * Calculate Parkinson volatility
   */
  private calculateParkinsonStd(prices: number[]): number {
    // Simplified - need high/low data for true Parkinson
    if (prices.length < 2) return 0;
    
    // Approximate using daily ranges
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    
    return Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length);
  }

  /**
   * Calculate RSI
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate Bollinger Bands
   */
  private calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2): {
    upper: number;
    middle: number;
    lower: number;
  } {
    const relevantPrices = prices.slice(-period);
    const middle = relevantPrices.reduce((s, p) => s + p, 0) / relevantPrices.length;
    const std = Math.sqrt(relevantPrices.reduce((s, p) => s + Math.pow(p - middle, 2), 0) / relevantPrices.length);

    return {
      upper: middle + multiplier * std,
      middle,
      lower: middle - multiplier * std,
    };
  }

  /**
   * Check volume confirmation
   */
  private checkVolumeConfirmation(symbol: string): boolean {
    const volumes = this.volumeHistory.get(symbol);
    if (!volumes || volumes.length < 20) return true;

    const recent = volumes.slice(-5);
    const historical = volumes.slice(-20, -5);

    const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length;
    const avgHistorical = historical.reduce((s, v) => s + v, 0) / historical.length;

    return avgRecent >= avgHistorical * 0.8;
  }

  /**
   * Open a position
   */
  public openPosition(signal: MeanReversionSignal, capital: number): MeanReversionPosition | null {
    if (this.state.positions.has(signal.symbol)) return null;

    const priceHistory = this.priceHistory.get(signal.symbol);
    if (!priceHistory || priceHistory.length === 0) return null;

    const price = priceHistory[priceHistory.length - 1];
    const size = capital / price;

    const position: MeanReversionPosition = {
      id: `pos-${signal.symbol}-${Date.now()}`,
      symbol: signal.symbol,
      exchange: signal.exchange,
      side: signal.direction,
      size,
      entryPrice: price,
      currentPrice: price,
      fairValue: signal.fairValue,
      entryZScore: signal.zScore,
      currentZScore: signal.zScore,
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
      
      const priceHistory = this.priceHistory.get(symbol);
      if (priceHistory) {
        position.currentZScore = this.calculateZScore(price, priceHistory);
      }

      // Calculate PnL
      const pnlPct = position.side === 'LONG'
        ? (price - position.entryPrice) / position.entryPrice
        : (position.entryPrice - price) / position.entryPrice;
      
      position.pnl = pnlPct * position.size * position.entryPrice;

      // Check exit conditions
      const absZScore = Math.abs(position.currentZScore);
      
      if (absZScore <= this.config.strategy.zScoreExit) {
        this.closePosition(symbol, 'Z-score normalized');
      } else if (absZScore >= this.config.strategy.zScoreStopLoss) {
        this.closePosition(symbol, 'Stop loss');
      }

      // Check holding period
      const holdingTime = Date.now() - position.openedAt;
      if (holdingTime >= this.config.strategy.maxHoldingPeriod) {
        this.closePosition(symbol, 'Max holding period');
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
    }

    this.state.stats.avgZScoreEntry = 
      (this.state.stats.avgZScoreEntry * (this.state.stats.totalTrades - 1) + Math.abs(position.entryZScore)) 
      / this.state.stats.totalTrades;
    this.state.stats.avgZScoreExit = 
      (this.state.stats.avgZScoreExit * (this.state.stats.totalTrades - 1) + Math.abs(position.currentZScore)) 
      / this.state.stats.totalTrades;

    return { pnl: position.pnl };
  }

  /**
   * Get current state
   */
  public getState(): EquilibristState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  public getConfig(): EquilibristConfig {
    return { ...this.config };
  }

  /**
   * Get fair value for symbol
   */
  public getFairValue(symbol: string): number | null {
    return this.state.fairValues.get(symbol) || null;
  }
}
