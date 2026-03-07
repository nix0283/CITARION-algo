/**
 * REED BOT - Statistical Arbitrage
 *
 * Multi-factor statistical arbitrage using PCA and factor models.
 * NO NEURAL NETWORKS - Classical statistical methods only.
 */

import type {
  ReedConfig,
  ReedState,
  StatArbSignal,
  StatArbPosition,
  StatArbFactor,
  BotStatus,
} from './types';

export class ReedBot {
  private config: ReedConfig;
  private state: ReedState;
  private priceHistory: Map<string, number[]> = new Map();
  private returns: Map<string, number[]> = new Map();

  constructor(config: Partial<ReedConfig> = {}) {
    this.config = {
      name: 'Reed',
      code: 'STA',
      version: '1.0.0',
      mode: 'PAPER',
      exchanges: [],
      riskConfig: {
        maxPositionSize: 5000,
        maxTotalExposure: 50000,
        maxDrawdownPct: 0.10,
        riskPerTrade: 0.01,
        maxLeverage: 3,
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
        factorModels: ['MOMENTUM', 'MEAN_REVERSION', 'VOLUME', 'VOLATILITY'],
        lookbackPeriod: 60,
        minExpectedReturn: 0.02,
        maxHoldingPeriod: 5 * 24 * 60 * 60 * 1000, // 5 days
        rebalanceFrequency: 24 * 60 * 60 * 1000, // Daily
        universeSize: 50,
        sectorNeutral: true,
        marketNeutral: true,
        pcaComponents: 3,
      },
      ...config,
    };

    this.state = {
      status: 'STOPPED',
      factorModels: new Map(),
      positions: new Map(),
      signals: [],
      residuals: new Map(),
      stats: {
        totalTrades: 0,
        winRate: 0,
        avgPnL: 0,
        factorReturns: new Map(),
        informationRatio: 0,
        trackingError: 0,
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

    return { success: true, message: 'Reed started' };
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    this.state.status = 'STOPPED';
    return { success: true, message: 'Reed stopped' };
  }

  /**
   * Update with new price data
   */
  public updatePrices(prices: Record<string, number>): StatArbSignal[] {
    // Update price and returns history
    for (const [symbol, price] of Object.entries(prices)) {
      if (!this.priceHistory.has(symbol)) {
        this.priceHistory.set(symbol, []);
        this.returns.set(symbol, []);
      }

      const priceHistory = this.priceHistory.get(symbol)!;
      const returnsHistory = this.returns.get(symbol)!;
      
      if (priceHistory.length > 0) {
        const prevPrice = priceHistory[priceHistory.length - 1];
        if (prevPrice > 0) {
          const returnVal = (price - prevPrice) / prevPrice;
          returnsHistory.push(returnVal);
        }
      }

      priceHistory.push(price);

      // Keep only lookback period
      const maxLen = this.config.strategy.lookbackPeriod;
      if (priceHistory.length > maxLen) priceHistory.shift();
      if (returnsHistory.length > maxLen) returnsHistory.shift();
    }

    // Calculate factors
    this.calculateFactors();

    // Generate signals
    const signals = this.generateSignals();
    this.state.signals = signals;

    return signals;
  }

  /**
   * Calculate factor exposures for all symbols
   */
  private calculateFactors(): void {
    const symbols = Array.from(this.returns.keys());

    for (const symbol of symbols) {
      const returns = this.returns.get(symbol);
      if (!returns || returns.length < 20) continue;

      const factors: StatArbFactor[] = [];

      // Momentum factor
      if (this.config.strategy.factorModels.includes('MOMENTUM')) {
        const momentum = this.calculateMomentum(returns);
        factors.push({
          name: 'MOMENTUM',
          weight: 0.25,
          value: momentum,
          normalized: this.normalize(momentum, -0.1, 0.1),
        });
      }

      // Mean reversion factor
      if (this.config.strategy.factorModels.includes('MEAN_REVERSION')) {
        const meanReversion = this.calculateMeanReversion(returns);
        factors.push({
          name: 'MEAN_REVERSION',
          weight: 0.25,
          value: meanReversion,
          normalized: this.normalize(meanReversion, -0.05, 0.05),
        });
      }

      // Volume factor (simplified)
      if (this.config.strategy.factorModels.includes('VOLUME')) {
        const volumeFactor = this.calculateVolumeFactor(symbol);
        factors.push({
          name: 'VOLUME',
          weight: 0.25,
          value: volumeFactor,
          normalized: this.normalize(volumeFactor, -2, 2),
        });
      }

      // Volatility factor
      if (this.config.strategy.factorModels.includes('VOLATILITY')) {
        const volatility = this.std(returns) * Math.sqrt(252); // Annualized
        factors.push({
          name: 'VOLATILITY',
          weight: 0.25,
          value: volatility,
          normalized: this.normalize(volatility, 0.2, 0.8),
        });
      }

      this.state.factorModels.set(symbol, factors.map(f => f.normalized * f.weight));
    }
  }

  /**
   * Calculate momentum (return over lookback period)
   */
  private calculateMomentum(returns: number[]): number {
    if (returns.length < 10) return 0;
    const recent = returns.slice(-10);
    return recent.reduce((s, r) => s + r, 0);
  }

  /**
   * Calculate mean reversion (recent return vs historical)
   */
  private calculateMeanReversion(returns: number[]): number {
    if (returns.length < 20) return 0;
    const recent = returns.slice(-5);
    const historical = returns.slice(0, -5);
    
    const recentMean = this.mean(recent);
    const historicalMean = this.mean(historical);
    
    return historicalMean - recentMean; // Negative recent = buy signal
  }

  /**
   * Calculate volume factor (simplified - uses price change as proxy)
   */
  private calculateVolumeFactor(symbol: string): number {
    const prices = this.priceHistory.get(symbol);
    if (!prices || prices.length < 2) return 0;

    // Use price change magnitude as volume proxy
    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]));
    }
    
    return this.mean(changes);
  }

  /**
   * Generate trading signals
   */
  private generateSignals(): StatArbSignal[] {
    const signals: StatArbSignal[] = [];

    for (const [symbol, factorScores] of this.state.factorModels) {
      // Skip if we have a position
      if (this.state.positions.has(symbol)) continue;

      // Calculate expected return from factors
      const expectedReturn = factorScores.reduce((s, f) => s + f, 0);

      if (Math.abs(expectedReturn) < this.config.strategy.minExpectedReturn) continue;

      const returns = this.returns.get(symbol);
      if (!returns || returns.length < 20) continue;

      const signal: StatArbSignal = {
        id: `sig-${symbol}-${Date.now()}`,
        timestamp: Date.now(),
        symbol,
        exchange: this.config.exchanges[0]?.exchange || 'binance',
        factors: this.getFactorsForSymbol(symbol),
        expectedReturn,
        confidence: Math.min(Math.abs(expectedReturn) / 0.1, 1),
        holdingPeriod: Math.min(5, Math.round(1 / Math.abs(expectedReturn))),
        direction: expectedReturn > 0 ? 'LONG' : 'SHORT',
      };

      signals.push(signal);
    }

    // Sort by expected return
    signals.sort((a, b) => Math.abs(b.expectedReturn) - Math.abs(a.expectedReturn));

    return signals.slice(0, 10); // Top 10 signals
  }

  private getFactorsForSymbol(symbol: string): StatArbFactor[] {
    const factors: StatArbFactor[] = [];
    const scores = this.state.factorModels.get(symbol) || [];

    const names = this.config.strategy.factorModels;
    scores.forEach((score, i) => {
      factors.push({
        name: names[i] || `FACTOR_${i}`,
        weight: 0.25,
        value: score,
        normalized: score,
      });
    });

    return factors;
  }

  /**
   * Open a position
   */
  public openPosition(signal: StatArbSignal, capital: number): StatArbPosition | null {
    if (this.state.positions.has(signal.symbol)) return null;

    const prices = this.priceHistory.get(signal.symbol);
    if (!prices || prices.length === 0) return null;

    const price = prices[prices.length - 1];
    const size = capital / price;

    const position: StatArbPosition = {
      id: `pos-${signal.symbol}-${Date.now()}`,
      symbol: signal.symbol,
      exchange: signal.exchange,
      side: signal.direction,
      size,
      entryPrice: price,
      currentPrice: price,
      expectedReturn: signal.expectedReturn,
      residual: 0,
      pnl: 0,
      openedAt: Date.now(),
    };

    this.state.positions.set(signal.symbol, position);
    return position;
  }

  /**
   * Update positions with current prices
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

      // Check holding period
      const holdingTime = Date.now() - position.openedAt;
      if (holdingTime >= this.config.strategy.maxHoldingPeriod) {
        this.closePosition(symbol, 'Holding period exceeded');
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

    return { pnl: position.pnl };
  }

  /**
   * Calculate PCA for dimensionality reduction
   */
  public calculatePCA(): { components: number[][]; explainedVariance: number[] } {
    const symbols = Array.from(this.returns.keys());
    const n = symbols.length;
    
    if (n < 3) {
      return { components: [], explainedVariance: [] };
    }

    // Build returns matrix
    const minLength = Math.min(...symbols.map(s => this.returns.get(s)?.length || 0));
    if (minLength < 10) {
      return { components: [], explainedVariance: [] };
    }

    const matrix: number[][] = symbols.map(s => {
      const returns = this.returns.get(s) || [];
      return returns.slice(-minLength);
    });

    // Center the data
    const centered = matrix.map(row => {
      const avg = this.mean(row);
      return row.map(v => v - avg);
    });

    // Calculate covariance matrix
    const cov = this.covarianceMatrix(centered);

    // Simple eigendecomposition using power iteration
    const { eigenvalues, eigenvectors } = this.powerIteration(cov, this.config.strategy.pcaComponents);

    return {
      components: eigenvectors,
      explainedVariance: eigenvalues.map(e => e / eigenvalues.reduce((s, v) => s + v, 0)),
    };
  }

  private covarianceMatrix(data: number[][]): number[][] {
    const n = data.length;
    const m = data[0]?.length || 0;
    const cov: number[][] = [];

    for (let i = 0; i < n; i++) {
      cov[i] = [];
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < m; k++) {
          sum += data[i][k] * data[j][k];
        }
        cov[i][j] = sum / m;
      }
    }

    return cov;
  }

  private powerIteration(matrix: number[][], k: number): { eigenvalues: number[]; eigenvectors: number[][] } {
    const n = matrix.length;
    const eigenvalues: number[] = [];
    const eigenvectors: number[][] = [];

    let A = matrix.map(row => [...row]);

    for (let comp = 0; comp < k; comp++) {
      // Initialize random vector
      let v: number[] = Array(n).fill(0).map(() => Math.random());
      let eigenvalue = 0;

      // Power iteration
      for (let iter = 0; iter < 100; iter++) {
        // Multiply
        const newV: number[] = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            newV[i] += A[i][j] * v[j];
          }
        }

        // Calculate eigenvalue
        eigenvalue = Math.sqrt(newV.reduce((s, v) => s + v * v, 0));

        // Normalize
        const norm = newV.map(x => x / eigenvalue);
        v = norm;
      }

      eigenvalues.push(eigenvalue);
      eigenvectors.push(v);

      // Deflate matrix
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          A[i][j] -= eigenvalue * v[i] * v[j];
        }
      }
    }

    return { eigenvalues, eigenvectors };
  }

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private std(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
  }

  private normalize(value: number, min: number, max: number): number {
    return Math.max(-1, Math.min(1, (value - (min + max) / 2) / ((max - min) / 2)));
  }

  /**
   * Get current state
   */
  public getState(): ReedState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  public getConfig(): ReedConfig {
    return { ...this.config };
  }
}
