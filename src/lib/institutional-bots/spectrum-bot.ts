/**
 * SPECTRUM BOT - Pairs Trading
 *
 * Exploits mean reversion in cointegrated pairs.
 * Uses Engle-Granger cointegration test and ADF test.
 * 
 * NO NEURAL NETWORKS - Classical statistical methods only.
 */

import type {
  SpectrumConfig,
  SpectrumState,
  CointegrationResult,
  PairSignal,
  PairPosition,
  PairStats,
  BotStatus,
} from './types';

export class SpectrumBot {
  private config: SpectrumConfig;
  private state: SpectrumState;
  private priceHistory: Map<string, number[]> = new Map();

  constructor(config: Partial<SpectrumConfig> = {}) {
    this.config = {
      name: 'Spectrum',
      code: 'PR',
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
        lookbackPeriod: 100,
        zScoreEntry: 2.0,
        zScoreExit: 0.5,
        zScoreStopLoss: 4.0,
        minCointegration: 0.05,
        maxHalfLife: 20,
        rebalanceInterval: 86400000, // 24 hours
        correlationThreshold: 0.7,
        adfTestEnabled: true,
      },
      ...config,
    };

    this.state = {
      status: 'STOPPED',
      pairs: new Map(),
      positions: new Map(),
      signals: [],
      stats: {
        totalTrades: 0,
        winRate: 0,
        avgPnL: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        correlationAvg: 0,
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

    return { success: true, message: 'Spectrum started' };
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    this.state.status = 'STOPPED';
    return { success: true, message: 'Spectrum stopped' };
  }

  /**
   * Update with new price data
   */
  public updatePrices(prices: Record<string, number>): PairSignal[] {
    // Update price history
    for (const [symbol, price] of Object.entries(prices)) {
      if (!this.priceHistory.has(symbol)) {
        this.priceHistory.set(symbol, []);
      }
      const history = this.priceHistory.get(symbol)!;
      history.push(price);
      if (history.length > this.config.strategy.lookbackPeriod) {
        history.shift();
      }
    }

    // Find cointegrated pairs
    this.findCointegratedPairs();

    // Generate signals
    const signals = this.generateSignals();
    this.state.signals = signals;

    return signals;
  }

  /**
   * Find cointegrated pairs from price history
   */
  private findCointegratedPairs(): void {
    const symbols = Array.from(this.priceHistory.keys());
    
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symbol1 = symbols[i];
        const symbol2 = symbols[j];
        const pairKey = `${symbol1}-${symbol2}`;
        
        const prices1 = this.priceHistory.get(symbol1)!;
        const prices2 = this.priceHistory.get(symbol2)!;

        if (prices1.length < 30 || prices2.length < 30) continue;

        const result = this.testCointegration(prices1, prices2, symbol1, symbol2);
        
        if (result && result.pValue < this.config.strategy.minCointegration) {
          this.state.pairs.set(pairKey, result);
        } else {
          this.state.pairs.delete(pairKey);
        }
      }
    }
  }

  /**
   * Test cointegration using Engle-Granger method
   */
  private testCointegration(
    prices1: number[],
    prices2: number[],
    symbol1: string,
    symbol2: string
  ): CointegrationResult | null {
    const n = Math.min(prices1.length, prices2.length);
    const y = prices1.slice(-n);
    const x = prices2.slice(-n);

    // Linear regression: y = α + β*x
    const regression = this.linearRegression(y, x);
    const hedgeRatio = regression.slope;

    // Calculate spread
    const spread = y.map((yi, i) => yi - hedgeRatio * x[i]);

    // ADF test on spread
    const adfResult = this.adfTest(spread);
    
    if (adfResult.pValue > this.config.strategy.minCointegration) {
      return null;
    }

    // Calculate half-life of mean reversion
    const halfLife = this.calculateHalfLife(spread);

    if (halfLife > this.config.strategy.maxHalfLife) {
      return null;
    }

    // Current z-score
    const mean = this.mean(spread);
    const std = this.std(spread);
    const currentSpread = spread[spread.length - 1];
    const zScore = (currentSpread - mean) / std;

    return {
      symbol1,
      symbol2,
      hedgeRatio,
      pValue: adfResult.pValue,
      halfLife,
      spread,
      zScore,
      meanReversionSpeed: 1 / halfLife,
    };
  }

  /**
   * Linear regression
   */
  private linearRegression(y: number[], x: number[]): { slope: number; intercept: number } {
    const n = y.length;
    const sumX = x.reduce((s, v) => s + v, 0);
    const sumY = y.reduce((s, v) => s + v, 0);
    const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
    const sumX2 = x.reduce((s, v) => s + v * v, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Augmented Dickey-Fuller test
   */
  private adfTest(series: number[]): { statistic: number; pValue: number } {
    const n = series.length;
    const delta: number[] = [];
    
    for (let i = 1; i < n; i++) {
      delta.push(series[i] - series[i - 1]);
    }

    const lagged = series.slice(0, -1);
    const regression = this.linearRegression(delta, lagged);
    
    // Calculate test statistic
    const residuals = delta.map((d, i) => d - regression.slope * lagged[i] - regression.intercept);
    const se = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (n - 2));
    const tStat = regression.slope / se;

    // Approximate p-value (simplified)
    const pValue = this.approximateADF_PValue(tStat, n);

    return { statistic: tStat, pValue };
  }

  /**
   * Approximate ADF p-value using MacKinnon critical values
   */
  private approximateADF_PValue(tStat: number, n: number): number {
    // Simplified critical values
    const criticalValues = {
      '1%': -3.43,
      '5%': -2.86,
      '10%': -2.57,
    };

    if (tStat < criticalValues['1%']) return 0.01;
    if (tStat < criticalValues['5%']) return 0.05;
    if (tStat < criticalValues['10%']) return 0.10;
    return 0.50;
  }

  /**
   * Calculate half-life of mean reversion
   */
  private calculateHalfLife(spread: number[]): number {
    const delta: number[] = [];
    const lagged = spread.slice(0, -1);
    
    for (let i = 1; i < spread.length; i++) {
      delta.push(spread[i] - spread[i - 1]);
    }

    const regression = this.linearRegression(delta, lagged);
    const lambda = -regression.slope;

    if (lambda <= 0) return Infinity;
    return Math.log(2) / lambda;
  }

  /**
   * Generate trading signals
   */
  private generateSignals(): PairSignal[] {
    const signals: PairSignal[] = [];

    for (const [pairKey, cointResult] of this.state.pairs) {
      const [symbol1, symbol2] = pairKey.split('-');
      
      // Check if we already have a position in this pair
      if (this.state.positions.has(pairKey)) continue;

      const zScore = cointResult.zScore;
      const absZScore = Math.abs(zScore);

      // Entry signal
      if (absZScore >= this.config.strategy.zScoreEntry) {
        const direction = zScore > 0 ? 'SHORT_LONG' : 'LONG_SHORT';
        const currentSpread = cointResult.spread[cointResult.spread.length - 1];
        const mean = this.mean(cointResult.spread);
        const std = this.std(cointResult.spread);

        const signal: PairSignal = {
          id: `sig-${pairKey}-${Date.now()}`,
          timestamp: Date.now(),
          pair: [symbol1, symbol2] as [string, string],
          exchange: this.config.exchanges[0]?.exchange || 'binance',
          hedgeRatio: cointResult.hedgeRatio,
          zScore,
          direction,
          entrySpread: currentSpread,
          targetSpread: mean,
          stopLossSpread: mean + (zScore > 0 ? 1 : -1) * this.config.strategy.zScoreStopLoss * std,
          confidence: Math.min(absZScore / this.config.strategy.zScoreStopLoss, 1),
        };

        signals.push(signal);
      }
    }

    return signals;
  }

  /**
   * Update position with current prices
   */
  public updatePositions(currentPrices: Record<string, number>): void {
    for (const [pairKey, position] of this.state.positions) {
      const [symbol1, symbol2] = position.pair;
      const price1 = currentPrices[symbol1];
      const price2 = currentPrices[symbol2];

      if (!price1 || !price2) continue;

      // Update current prices
      position.leg1.currentPrice = price1;
      position.leg2.currentPrice = price2;

      // Calculate current spread
      const currentSpread = position.leg1.side === 'LONG'
        ? price1 - position.hedgeRatio * price2
        : position.hedgeRatio * price2 - price1;
      
      position.currentSpread = currentSpread;

      // Calculate PnL
      const pnl1 = position.leg1.side === 'LONG'
        ? (price1 - position.leg1.entryPrice) * position.leg1.size
        : (position.leg1.entryPrice - price1) * position.leg1.size;
      
      const pnl2 = position.leg2.side === 'LONG'
        ? (price2 - position.leg2.entryPrice) * position.leg2.size
        : (position.leg2.entryPrice - price2) * position.leg2.size;

      position.pnl = pnl1 + pnl2;

      // Check exit conditions
      const cointResult = this.state.pairs.get(pairKey);
      if (cointResult) {
        const absZScore = Math.abs(cointResult.zScore);
        
        // Exit if z-score returns to normal
        if (absZScore <= this.config.strategy.zScoreExit) {
          this.closePosition(pairKey, 'Z-score normalized');
        }
      }
    }
  }

  /**
   * Open a pair position
   */
  public openPosition(signal: PairSignal, capital: number): PairPosition | null {
    const [symbol1, symbol2] = signal.pair;
    const pairKey = `${symbol1}-${symbol2}`;

    if (this.state.positions.has(pairKey)) return null;

    const prices1 = this.priceHistory.get(symbol1);
    const prices2 = this.priceHistory.get(symbol2);
    if (!prices1 || !prices2) return null;

    const price1 = prices1[prices1.length - 1];
    const price2 = prices2[prices2.length - 1];

    // Calculate position sizes
    const hedgeRatio = signal.hedgeRatio;
    const size1 = capital / price1;
    const size2 = (capital * hedgeRatio) / price2;

    const position: PairPosition = {
      id: `pos-${pairKey}-${Date.now()}`,
      pair: signal.pair,
      exchange: signal.exchange,
      leg1: {
        symbol: symbol1,
        side: signal.direction === 'LONG_SHORT' ? 'LONG' : 'SHORT',
        size: size1,
        entryPrice: price1,
        currentPrice: price1,
        leverage: 1,
      },
      leg2: {
        symbol: symbol2,
        side: signal.direction === 'LONG_SHORT' ? 'SHORT' : 'LONG',
        size: size2,
        entryPrice: price2,
        currentPrice: price2,
        leverage: 1,
      },
      hedgeRatio,
      entrySpread: signal.entrySpread,
      currentSpread: signal.entrySpread,
      pnl: 0,
      openedAt: Date.now(),
    };

    this.state.positions.set(pairKey, position);
    return position;
  }

  /**
   * Close a pair position
   */
  public closePosition(pairKey: string, reason: string): { pnl: number } | null {
    const position = this.state.positions.get(pairKey);
    if (!position) return null;

    this.state.positions.delete(pairKey);

    // Update stats
    this.state.stats.totalTrades++;
    if (position.pnl > 0) {
      const wins = Math.round(this.state.stats.winRate * (this.state.stats.totalTrades - 1));
      this.state.stats.winRate = (wins + 1) / this.state.stats.totalTrades;
    }

    return { pnl: position.pnl };
  }

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================

  private mean(values: number[]): number {
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private std(values: number[]): number {
    const avg = this.mean(values);
    return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
  }

  /**
   * Get current state
   */
  public getState(): SpectrumState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  public getConfig(): SpectrumConfig {
    return { ...this.config };
  }

  /**
   * Get cointegrated pairs
   */
  public getPairs(): CointegrationResult[] {
    return Array.from(this.state.pairs.values());
  }
}
