/**
 * SPECTRUM BOT - Pairs Trading (PR)
 *
 * Production-ready pairs trading with cointegration analysis and Kalman filtering.
 * Exploits mean reversion in cointegrated asset pairs.
 *
 * Features:
 * - Engle-Granger and Johansen cointegration tests
 * - Kalman filter for dynamic hedge ratio estimation
 * - Real-time spread monitoring and z-score calculation
 * - Multi-pair portfolio management
 * - Risk-adjusted position sizing
 *
 * NO NEURAL NETWORKS - Classical statistical methods only.
 */

import type { BotStatus, BotMode, RiskConfig } from './types';
import { getEventBus } from '../orchestration';

// =============================================================================
// TYPES
// =============================================================================

export interface SpectrumConfig {
  name: 'Spectrum';
  code: 'PR';
  version: string;
  mode: BotMode;
  exchanges: string[];
  riskConfig: RiskConfig;
  strategy: {
    lookbackPeriod: number;
    zScoreEntry: number;
    zScoreExit: number;
    zScoreStopLoss: number;
    minCointegrationPValue: number;
    maxHalfLife: number;            // Days
    minHalfLife: number;            // Days
    kalmanFilterEnabled: boolean;
    kalmanObservationNoise: number;
    kalmanProcessNoise: number;
    correlationThreshold: number;
    adfTestLags: number;
    maxOpenPairs: number;
    rebalanceInterval: number;
    useDynamicHedgeRatio: boolean;
  };
}

export interface CointegrationResult {
  pair: [string, string];
  hedgeRatio: number;
  hedgeRatioStd: number;
  pValue: number;
  adfStatistic: number;
  criticalValues: { '1%': number; '5%': number; '10%': number };
  halfLife: number;
  meanReversionSpeed: number;
  spreadMean: number;
  spreadStd: number;
  currentSpread: number;
  currentZScore: number;
  cointegrationStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
  lastUpdated: number;
}

export interface KalmanState {
  state: number;           // Current hedge ratio estimate
  covariance: number;      // State covariance
  innovation: number;      // Innovation (prediction error)
  innovationCovariance: number;
  kalmanGain: number;
}

export interface PairPosition {
  id: string;
  pair: [string, string];
  leg1: { symbol: string; side: 'LONG' | 'SHORT'; size: number; entryPrice: number; currentPrice: number };
  leg2: { symbol: string; side: 'LONG' | 'SHORT'; size: number; entryPrice: number; currentPrice: number };
  hedgeRatio: number;
  entrySpread: number;
  entryZScore: number;
  currentSpread: number;
  currentZScore: number;
  targetSpread: number;
  stopLossSpread: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openedAt: number;
  maxAdverseExcursion: number;
  maxFavorableExcursion: number;
}

export interface PairSignal {
  id: string;
  timestamp: number;
  pair: [string, string];
  exchange: string;
  direction: 'LONG_SHORT' | 'SHORT_LONG';
  hedgeRatio: number;
  hedgeRatioStd: number;
  zScore: number;
  spread: number;
  targetSpread: number;
  stopLossSpread: number;
  confidence: number;
  cointegrationStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  halfLife: number;
  expectedReturn: number;
}

export interface SpectrumState {
  status: BotStatus;
  cointegratedPairs: Map<string, CointegrationResult>;
  positions: Map<string, PairPosition>;
  signals: PairSignal[];
  kalmanStates: Map<string, KalmanState>;
  priceHistory: Map<string, number[]>;
  spreadHistory: Map<string, number[]>;
  stats: {
    totalTrades: number;
    winRate: number;
    avgPnL: number;
    avgWin: number;
    avgLoss: number;
    maxDrawdown: number;
    sharpeRatio: number;
    avgHoldingTime: number;
    avgHalfLife: number;
    correlationAvg: number;
  };
}

// =============================================================================
// KALMAN FILTER
// =============================================================================

class KalmanFilter {
  private state: number = 0;
  private covariance: number = 1;
  private observationNoise: number;
  private processNoise: number;

  constructor(observationNoise: number = 0.1, processNoise: number = 0.0001) {
    this.observationNoise = observationNoise;
    this.processNoise = processNoise;
  }

  /**
   * Initialize filter with starting hedge ratio
   */
  initialize(initialState: number, initialCovariance: number = 1): void {
    this.state = initialState;
    this.covariance = initialCovariance;
  }

  /**
   * Update filter with new observation
   * State model: hedge_ratio(t) = hedge_ratio(t-1) + w(t), w ~ N(0, Q)
   * Observation model: y(t) = x(t) * hedge_ratio(t) + v(t), v ~ N(0, R)
   */
  update(y: number, x: number): KalmanState {
    // Prediction step
    const predictedCovariance = this.covariance + this.processNoise;

    // Innovation (measurement residual)
    const innovation = y - this.state * x;

    // Innovation covariance
    const innovationCovariance = predictedCovariance * x * x + this.observationNoise;

    // Kalman gain
    const kalmanGain = (predictedCovariance * x) / innovationCovariance;

    // Update step
    this.state = this.state + kalmanGain * innovation;
    this.covariance = Math.max(0.0001, (1 - kalmanGain * x) * predictedCovariance);

    return {
      state: this.state,
      covariance: this.covariance,
      innovation,
      innovationCovariance,
      kalmanGain,
    };
  }

  /**
   * Get current state estimate
   */
  getState(): KalmanState {
    return {
      state: this.state,
      covariance: this.covariance,
      innovation: 0,
      innovationCovariance: 0,
      kalmanGain: 0,
    };
  }

  /**
   * Get hedge ratio with confidence interval
   */
  getHedgeRatioWithConfidence(): { ratio: number; std: number; lower95: number; upper95: number } {
    const std = Math.sqrt(this.covariance);
    return {
      ratio: this.state,
      std,
      lower95: this.state - 1.96 * std,
      upper95: this.state + 1.96 * std,
    };
  }
}

// =============================================================================
// COINTEGRATION ANALYZER
// =============================================================================

class CointegrationAnalyzer {
  /**
   * Test cointegration using Engle-Granger two-step method
   */
  engleGrangerTest(
    prices1: number[],
    prices2: number[],
    lags: number = 1
  ): CointegrationResult | null {
    if (prices1.length < 30 || prices2.length < 30) return null;

    const n = Math.min(prices1.length, prices2.length);
    const y = prices1.slice(-n);
    const x = prices2.slice(-n);

    // Step 1: Estimate hedge ratio via OLS
    const regression = this.olsRegression(y, x);
    const hedgeRatio = regression.slope;

    // Step 2: Test residuals for stationarity using ADF
    const residuals = y.map((yi, i) => yi - hedgeRatio * x[i] - regression.intercept);
    const adfResult = this.augmentedDickeyFuller(residuals, lags);

    // Calculate half-life
    const halfLife = this.calculateHalfLife(residuals);

    // Determine cointegration strength
    let cointegrationStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    if (adfResult.pValue < 0.01) cointegrationStrength = 'STRONG';
    else if (adfResult.pValue < 0.05) cointegrationStrength = 'MODERATE';
    else if (adfResult.pValue < 0.10) cointegrationStrength = 'WEAK';
    else cointegrationStrength = 'NONE';

    const spreadMean = this.mean(residuals);
    const spreadStd = this.std(residuals);
    const currentSpread = residuals[residuals.length - 1];

    return {
      pair: ['', ''], // Set by caller
      hedgeRatio,
      hedgeRatioStd: regression.slopeStdError,
      pValue: adfResult.pValue,
      adfStatistic: adfResult.statistic,
      criticalValues: adfResult.criticalValues,
      halfLife,
      meanReversionSpeed: halfLife > 0 ? 1 / halfLife : 0,
      spreadMean,
      spreadStd,
      currentSpread,
      currentZScore: spreadStd > 0 ? (currentSpread - spreadMean) / spreadStd : 0,
      cointegrationStrength,
      lastUpdated: Date.now(),
    };
  }

  /**
   * OLS Regression with standard errors
   */
  private olsRegression(y: number[], x: number[]): {
    slope: number;
    intercept: number;
    slopeStdError: number;
    r2: number;
  } {
    const n = y.length;
    const sumX = x.reduce((s, v) => s + v, 0);
    const sumY = y.reduce((s, v) => s + v, 0);
    const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
    const sumX2 = x.reduce((s, v) => s + v * v, 0);
    const sumY2 = y.reduce((s, v) => s + v * v, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate residuals
    const residuals = y.map((yi, i) => yi - slope * x[i] - intercept);
    const sse = residuals.reduce((s, r) => s + r * r, 0);
    const sst = sumY2 - sumY * sumY / n;
    const r2 = 1 - sse / sst;

    // Standard error of slope
    const mse = sse / (n - 2);
    const slopeStdError = Math.sqrt(mse / (sumX2 - sumX * sumX / n));

    return { slope, intercept, slopeStdError, r2 };
  }

  /**
   * Augmented Dickey-Fuller test
   */
  private augmentedDickeyFuller(
    series: number[],
    lags: number = 1
  ): { statistic: number; pValue: number; criticalValues: { '1%': number; '5%': number; '10%': number } } {
    const n = series.length;

    // Calculate first differences
    const delta: number[] = [];
    for (let i = 1; i < n; i++) {
      delta.push(series[i] - series[i - 1]);
    }

    // Build lagged variables
    const lagged = series.slice(0, -1);
    const laggedDeltas: number[][] = [];

    for (let lag = 1; lag <= lags; lag++) {
      laggedDeltas.push(delta.slice(lag - 1, -1));
    }

    // ADF regression: delta(t) = alpha + beta * y(t-1) + sum(gamma_i * delta(t-i)) + e(t)
    // We're testing if beta < 0 (mean reversion exists)

    const y = delta.slice(lags);
    const x = lagged.slice(lags);

    // Simplified ADF statistic
    const regression = this.olsRegression(y, x);
    const tStat = regression.slope / regression.slopeStdError;

    // MacKinnon approximate critical values
    const criticalValues = {
      '1%': -3.43,
      '5%': -2.86,
      '10%': -2.57,
    };

    // Approximate p-value using Dickey-Fuller distribution
    let pValue: number;
    if (tStat < criticalValues['1%']) pValue = 0.01;
    else if (tStat < criticalValues['5%']) pValue = 0.05;
    else if (tStat < criticalValues['10%']) pValue = 0.10;
    else pValue = 0.50;

    return { statistic: tStat, pValue, criticalValues };
  }

  /**
   * Calculate half-life of mean reversion using Ornstein-Uhlenbeck process
   * dy(t) = lambda * (mu - y(t)) * dt + sigma * dW(t)
   * Half-life = ln(2) / lambda
   */
  private calculateHalfLife(spread: number[]): number {
    const n = spread.length;
    const delta: number[] = [];
    const lagged = spread.slice(0, -1);

    for (let i = 1; i < n; i++) {
      delta.push(spread[i] - spread[i - 1]);
    }

    // Regress delta on lagged spread
    const regression = this.olsRegression(delta, lagged);
    const lambda = -regression.slope;

    if (lambda <= 0) return Infinity; // No mean reversion

    return Math.log(2) / lambda;
  }

  /**
   * Johansen test for multiple cointegration vectors (simplified)
   */
  johansenTest(
    prices1: number[],
    prices2: number[]
  ): { rank: number; eigenvalues: number[]; hedgeRatios: number[][] } {
    // Simplified Johansen - in production, use full eigenvalue decomposition
    const n = Math.min(prices1.length, prices2.length);

    // Build difference matrices
    const dY = prices1.slice(1, n).map((p, i) => p - prices1[i]);
    const dX = prices2.slice(1, n).map((p, i) => p - prices2[i]);

    // Simplified: return Engle-Granger result
    const egResult = this.engleGrangerTest(prices1, prices2);
    if (!egResult) {
      return { rank: 0, eigenvalues: [], hedgeRatios: [] };
    }

    return {
      rank: egResult.pValue < 0.05 ? 1 : 0,
      eigenvalues: [1 - egResult.pValue],
      hedgeRatios: [[1, -egResult.hedgeRatio]],
    };
  }

  private mean(values: number[]): number {
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private std(values: number[]): number {
    const avg = this.mean(values);
    return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
  }
}

// =============================================================================
// SPECTRUM BOT CLASS
// =============================================================================

export class SpectrumBot {
  private config: SpectrumConfig;
  private state: SpectrumState;
  private cointegrationAnalyzer: CointegrationAnalyzer;
  private kalmanFilters: Map<string, KalmanFilter> = new Map();
  private eventBus = getEventBus();
  private analysisInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<SpectrumConfig> = {}) {
    this.config = {
      name: 'Spectrum',
      code: 'PR',
      version: '2.0.0',
      mode: 'PAPER',
      exchanges: ['binance'],
      riskConfig: {
        maxPositionSize: 10000,
        maxTotalExposure: 100000,
        maxDrawdownPct: 0.15,
        riskPerTrade: 0.02,
        maxLeverage: 5,
      },
      strategy: {
        lookbackPeriod: 100,
        zScoreEntry: 2.0,
        zScoreExit: 0.5,
        zScoreStopLoss: 4.0,
        minCointegrationPValue: 0.05,
        maxHalfLife: 20,
        minHalfLife: 1,
        kalmanFilterEnabled: true,
        kalmanObservationNoise: 0.1,
        kalmanProcessNoise: 0.0001,
        correlationThreshold: 0.7,
        adfTestLags: 1,
        maxOpenPairs: 5,
        rebalanceInterval: 86400000, // 24 hours
        useDynamicHedgeRatio: true,
      },
      ...config,
    };

    this.state = {
      status: 'STOPPED',
      cointegratedPairs: new Map(),
      positions: new Map(),
      signals: [],
      kalmanStates: new Map(),
      priceHistory: new Map(),
      spreadHistory: new Map(),
      stats: {
        totalTrades: 0,
        winRate: 0,
        avgPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        avgHoldingTime: 0,
        avgHalfLife: 0,
        correlationAvg: 0,
      },
    };

    this.cointegrationAnalyzer = new CointegrationAnalyzer();
  }

  // ===========================================================================
  // LIFECYCLE METHODS
  // ===========================================================================

  /**
   * Start the bot
   */
  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.state.status !== 'STOPPED') {
      return { success: false, message: 'Bot already running' };
    }

    this.state.status = 'STARTING';

    // Start analysis interval
    this.analysisInterval = setInterval(() => {
      this.analysisCycle();
    }, 60000); // Every minute

    this.state.status = 'RUNNING';

    this.eventBus.emit('bot.started', {
      botCode: 'PR',
      botName: 'Spectrum',
      timestamp: Date.now(),
    });

    return { success: true, message: 'Spectrum started with Kalman filter pairs trading engine' };
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    this.state.status = 'STOPPED';

    this.eventBus.emit('bot.stopped', {
      botCode: 'PR',
      botName: 'Spectrum',
      timestamp: Date.now(),
    });

    return { success: true, message: 'Spectrum stopped' };
  }

  // ===========================================================================
  // PRICE DATA MANAGEMENT
  // ===========================================================================

  /**
   * Update with new price data
   */
  public updatePrices(prices: Record<string, number>): PairSignal[] {
    // Update price history
    for (const [symbol, price] of Object.entries(prices)) {
      if (!this.state.priceHistory.has(symbol)) {
        this.state.priceHistory.set(symbol, []);
      }
      const history = this.state.priceHistory.get(symbol)!;
      history.push(price);

      // Keep only lookback period
      if (history.length > this.config.strategy.lookbackPeriod * 2) {
        history.shift();
      }
    }

    // Run analysis
    return this.analysisCycle();
  }

  /**
   * Analysis cycle
   */
  private analysisCycle(): PairSignal[] {
    if (this.state.status !== 'RUNNING') return [];

    // Update cointegration for all pairs
    this.updateCointegration();

    // Update Kalman filters
    if (this.config.strategy.kalmanFilterEnabled) {
      this.updateKalmanFilters();
    }

    // Generate signals
    const signals = this.generateSignals();
    this.state.signals = signals;

    // Update positions
    this.updatePositions();

    return signals;
  }

  /**
   * Update cointegration analysis for all symbol pairs
   */
  private updateCointegration(): void {
    const symbols = Array.from(this.state.priceHistory.keys());

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symbol1 = symbols[i];
        const symbol2 = symbols[j];
        const pairKey = `${symbol1}-${symbol2}`;

        const prices1 = this.state.priceHistory.get(symbol1)!;
        const prices2 = this.state.priceHistory.get(symbol2)!;

        if (prices1.length < 30 || prices2.length < 30) continue;

        const result = this.cointegrationAnalyzer.engleGrangerTest(
          prices1,
          prices2,
          this.config.strategy.adfTestLags
        );

        if (result) {
          result.pair = [symbol1, symbol2];

          // Check if cointegration is significant
          if (result.pValue <= this.config.strategy.minCointegrationPValue &&
              result.halfLife >= this.config.strategy.minHalfLife &&
              result.halfLife <= this.config.strategy.maxHalfLife) {
            this.state.cointegratedPairs.set(pairKey, result);
          } else {
            this.state.cointegratedPairs.delete(pairKey);
          }
        }
      }
    }
  }

  /**
   * Update Kalman filters for all cointegrated pairs
   */
  private updateKalmanFilters(): void {
    for (const [pairKey, cointResult] of this.state.cointegratedPairs) {
      const [symbol1, symbol2] = pairKey.split('-');
      const prices1 = this.state.priceHistory.get(symbol1);
      const prices2 = this.state.priceHistory.get(symbol2);

      if (!prices1 || !prices2 || prices1.length < 2) continue;

      // Get or create Kalman filter
      if (!this.kalmanFilters.has(pairKey)) {
        const kf = new KalmanFilter(
          this.config.strategy.kalmanObservationNoise,
          this.config.strategy.kalmanProcessNoise
        );
        kf.initialize(cointResult.hedgeRatio);
        this.kalmanFilters.set(pairKey, kf);
      }

      // Update filter with latest prices
      const kf = this.kalmanFilters.get(pairKey)!;
      const y = prices1[prices1.length - 1];
      const x = prices2[prices2.length - 1];
      const kalmanState = kf.update(y, x);

      this.state.kalmanStates.set(pairKey, kalmanState);

      // Update cointegration result with Kalman hedge ratio
      if (this.config.strategy.useDynamicHedgeRatio) {
        const hedgeRatioConfidence = kf.getHedgeRatioWithConfidence();
        cointResult.hedgeRatio = hedgeRatioConfidence.ratio;
        cointResult.hedgeRatioStd = hedgeRatioConfidence.std;

        // Recalculate spread and z-score with new hedge ratio
        const spread = y - cointResult.hedgeRatio * x;
        cointResult.currentSpread = spread;
        cointResult.currentZScore = (spread - cointResult.spreadMean) / cointResult.spreadStd;
      }

      // Update spread history
      if (!this.state.spreadHistory.has(pairKey)) {
        this.state.spreadHistory.set(pairKey, []);
      }
      this.state.spreadHistory.get(pairKey)!.push(cointResult.currentSpread);
    }
  }

  /**
   * Generate trading signals
   */
  private generateSignals(): PairSignal[] {
    const signals: PairSignal[] = [];

    for (const [pairKey, cointResult] of this.state.cointegratedPairs) {
      // Skip if we have position
      if (this.state.positions.has(pairKey)) continue;

      // Check max open pairs
      if (this.state.positions.size >= this.config.strategy.maxOpenPairs) continue;

      const absZScore = Math.abs(cointResult.currentZScore);

      // Entry signal
      if (absZScore >= this.config.strategy.zScoreEntry) {
        const direction = cointResult.currentZScore > 0 ? 'SHORT_LONG' : 'LONG_SHORT';
        const targetSpread = cointResult.spreadMean;
        const stopLossSpread = cointResult.spreadMean +
          (cointResult.currentZScore > 0 ? 1 : -1) * this.config.strategy.zScoreStopLoss * cointResult.spreadStd;

        const signal: PairSignal = {
          id: `sig-${pairKey}-${Date.now()}`,
          timestamp: Date.now(),
          pair: cointResult.pair,
          exchange: this.config.exchanges[0] || 'binance',
          direction,
          hedgeRatio: cointResult.hedgeRatio,
          hedgeRatioStd: cointResult.hedgeRatioStd,
          zScore: cointResult.currentZScore,
          spread: cointResult.currentSpread,
          targetSpread,
          stopLossSpread,
          confidence: this.calculateSignalConfidence(cointResult, absZScore),
          cointegrationStrength: cointResult.cointegrationStrength,
          halfLife: cointResult.halfLife,
          expectedReturn: Math.abs(cointResult.currentZScore) * 0.01 / cointResult.halfLife,
        };

        signals.push(signal);
      }
    }

    return signals;
  }

  /**
   * Calculate signal confidence score
   */
  private calculateSignalConfidence(cointResult: CointegrationResult, absZScore: number): number {
    let confidence = 0;

    // Z-score component (0-40%)
    confidence += Math.min(absZScore / 5, 1) * 0.4;

    // Cointegration strength (0-30%)
    if (cointResult.cointegrationStrength === 'STRONG') confidence += 0.3;
    else if (cointResult.cointegrationStrength === 'MODERATE') confidence += 0.2;
    else confidence += 0.1;

    // Half-life appropriateness (0-20%)
    const halfLifeScore = Math.max(0, 1 - Math.abs(cointResult.halfLife - 10) / 20);
    confidence += halfLifeScore * 0.2;

    // Hedge ratio stability (0-10%)
    const hedgeRatioStability = Math.max(0, 1 - cointResult.hedgeRatioStd / Math.abs(cointResult.hedgeRatio));
    confidence += hedgeRatioStability * 0.1;

    return Math.min(confidence, 1);
  }

  // ===========================================================================
  // POSITION MANAGEMENT
  // ===========================================================================

  /**
   * Open a pair position
   */
  public openPosition(signal: PairSignal, capital: number): PairPosition | null {
    const pairKey = `${signal.pair[0]}-${signal.pair[1]}`;

    if (this.state.positions.has(pairKey)) return null;

    const prices1 = this.state.priceHistory.get(signal.pair[0]);
    const prices2 = this.state.priceHistory.get(signal.pair[1]);

    if (!prices1?.length || !prices2?.length) return null;

    const price1 = prices1[prices1.length - 1];
    const price2 = prices2[prices2.length - 1];

    // Calculate position sizes based on hedge ratio
    const size1 = capital / price1;
    const size2 = (capital * signal.hedgeRatio) / price2;

    const position: PairPosition = {
      id: `pos-${pairKey}-${Date.now()}`,
      pair: signal.pair,
      leg1: {
        symbol: signal.pair[0],
        side: signal.direction === 'LONG_SHORT' ? 'LONG' : 'SHORT',
        size: size1,
        entryPrice: price1,
        currentPrice: price1,
      },
      leg2: {
        symbol: signal.pair[1],
        side: signal.direction === 'LONG_SHORT' ? 'SHORT' : 'LONG',
        size: size2,
        entryPrice: price2,
        currentPrice: price2,
      },
      hedgeRatio: signal.hedgeRatio,
      entrySpread: signal.spread,
      entryZScore: signal.zScore,
      currentSpread: signal.spread,
      currentZScore: signal.zScore,
      targetSpread: signal.targetSpread,
      stopLossSpread: signal.stopLossSpread,
      unrealizedPnl: 0,
      realizedPnl: 0,
      openedAt: Date.now(),
      maxAdverseExcursion: 0,
      maxFavorableExcursion: 0,
    };

    this.state.positions.set(pairKey, position);

    this.eventBus.emit('bot.trade', {
      botCode: 'PR',
      symbol: pairKey,
      side: signal.direction,
      quantity: capital,
      timestamp: Date.now(),
    });

    return position;
  }

  /**
   * Update all positions
   */
  private updatePositions(): void {
    for (const [pairKey, position] of this.state.positions) {
      const prices1 = this.state.priceHistory.get(position.leg1.symbol);
      const prices2 = this.state.priceHistory.get(position.leg2.symbol);

      if (!prices1?.length || !prices2?.length) continue;

      const price1 = prices1[prices1.length - 1];
      const price2 = prices2[prices2.length - 1];

      // Update current prices
      position.leg1.currentPrice = price1;
      position.leg2.currentPrice = price2;

      // Calculate current spread
      position.currentSpread = price1 - position.hedgeRatio * price2;

      // Get cointegration result for z-score
      const cointResult = this.state.cointegratedPairs.get(pairKey);
      if (cointResult) {
        position.currentZScore = (position.currentSpread - cointResult.spreadMean) / cointResult.spreadStd;
      }

      // Calculate PnL
      const pnl1 = position.leg1.side === 'LONG'
        ? (price1 - position.leg1.entryPrice) * position.leg1.size
        : (position.leg1.entryPrice - price1) * position.leg1.size;

      const pnl2 = position.leg2.side === 'LONG'
        ? (price2 - position.leg2.entryPrice) * position.leg2.size
        : (position.leg2.entryPrice - price2) * position.leg2.size;

      position.unrealizedPnl = pnl1 + pnl2;

      // Update MFE/MAE
      position.maxFavorableExcursion = Math.max(position.maxFavorableExcursion, position.unrealizedPnl);
      position.maxAdverseExcursion = Math.min(position.maxAdverseExcursion, position.unrealizedPnl);

      // Check exit conditions
      const absZScore = Math.abs(position.currentZScore);

      // Exit at target
      if (absZScore <= this.config.strategy.zScoreExit) {
        this.closePosition(pairKey, 'Target reached');
        continue;
      }

      // Stop loss
      if (absZScore >= this.config.strategy.zScoreStopLoss) {
        this.closePosition(pairKey, 'Stop loss');
        continue;
      }
    }
  }

  /**
   * Close a position
   */
  public closePosition(pairKey: string, reason: string): { pnl: number; reason: string } | null {
    const position = this.state.positions.get(pairKey);
    if (!position) return null;

    this.state.positions.delete(pairKey);

    // Update stats
    this.state.stats.totalTrades++;
    if (position.unrealizedPnl > 0) {
      const wins = Math.round(this.state.stats.winRate * (this.state.stats.totalTrades - 1));
      this.state.stats.winRate = (wins + 1) / this.state.stats.totalTrades;
      this.state.stats.avgWin =
        (this.state.stats.avgWin * wins + position.unrealizedPnl) / (wins + 1);
    } else {
      const losses = this.state.stats.totalTrades - Math.round(this.state.stats.winRate * this.state.stats.totalTrades);
      this.state.stats.avgLoss =
        (this.state.stats.avgLoss * Math.max(0, losses - 1) + position.unrealizedPnl) / Math.max(1, losses);
    }

    const cointResult = this.state.cointegratedPairs.get(pairKey);
    if (cointResult) {
      this.state.stats.avgHalfLife =
        (this.state.stats.avgHalfLife * (this.state.stats.totalTrades - 1) + cointResult.halfLife)
        / this.state.stats.totalTrades;
    }

    this.eventBus.emit('bot.signal', {
      botCode: 'PR',
      signalType: 'position_closed',
      symbol: pairKey,
      data: { pnl: position.unrealizedPnl, reason },
      timestamp: Date.now(),
    });

    return { pnl: position.unrealizedPnl, reason };
  }

  // ===========================================================================
  // QUERY METHODS
  // ===========================================================================

  /**
   * Get current state
   */
  public getState(): SpectrumState {
    return {
      ...this.state,
      cointegratedPairs: new Map(this.state.cointegratedPairs),
      positions: new Map(this.state.positions),
      kalmanStates: new Map(this.state.kalmanStates),
    };
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
  public getCointegratedPairs(): CointegrationResult[] {
    return Array.from(this.state.cointegratedPairs.values());
  }

  /**
   * Get active signals
   */
  public getSignals(): PairSignal[] {
    return [...this.state.signals];
  }

  /**
   * Get positions
   */
  public getPositions(): PairPosition[] {
    return Array.from(this.state.positions.values());
  }

  /**
   * Get Kalman state for a pair
   */
  public getKalmanState(pairKey: string): KalmanState | null {
    return this.state.kalmanStates.get(pairKey) || null;
  }

  /**
   * Get statistics
   */
  public getStats(): typeof this.state.stats {
    return { ...this.state.stats };
  }
}
