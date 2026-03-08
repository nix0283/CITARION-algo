/**
 * GARCH Integration Service for Trading Bots
 * 
 * Provides volatility-based risk management for:
 * - DCA Bot: Position sizing based on volatility regime
 * - BB Bot: Dynamic stop-loss/take-profit adjustment
 * - ORION Bot: Risk-weighted signal filtering
 * - LOGOS: Signal confidence adjustment
 * 
 * NO NEURAL NETWORKS - Classical econometric methods only.
 */

import {
  createGARCHModel,
  type GARCHType,
  type GARCHResult,
  type GARCHConfig,
} from './garch';

// =============================================================================
// TYPES
// =============================================================================

export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';
export type BotType = 'DCA' | 'BB' | 'ORION' | 'LOGOS' | 'GRID' | 'MFT';

export interface VolatilityContext {
  symbol: string;
  currentVolatility: number;
  forecastVolatility: number[];
  regime: VolatilityRegime;
  regimeScore: number; // 0-1 normalized
  trend: 'increasing' | 'decreasing' | 'stable';
  params: {
    omega: number;
    alpha: number;
    beta: number;
    gamma?: number;
  };
  modelQuality: {
    converged: boolean;
    aic: number;
    bic: number;
  };
  timestamp: number;
}

export interface BotRiskAdjustment {
  // Position sizing
  positionSizeMultiplier: number; // 0-1, reduce in high vol
  maxPositionPercent: number; // Adjusted max position
  
  // Stop loss / Take profit
  stopLossMultiplier: number; // Widen in high vol
  takeProfitMultiplier: number; // Extend in high vol
  
  // Entry/Exit
  entryDelay: number; // Seconds to delay entry in extreme vol
  shouldHaltTrading: boolean; // True in extreme vol
  
  // Signal filtering
  signalConfidenceAdjustment: number; // -0.3 to +0.1
  minSignalStrength: number; // Higher in high vol
  
  // Risk limits
  maxDrawdownPercent: number; // Tighter in high vol
  maxLeverage: number; // Lower in high vol
  
  // Rationale
  rationale: string;
}

export interface GARCHServiceConfig {
  defaultModelType: GARCHType;
  updateIntervalMs: number;
  minDataPoints: number;
  lookbackDays: number;
  forecastDays: number;
  cacheTimeoutMs: number;
}

// =============================================================================
// REGIME THRESHOLDS (INSTITUTIONAL STANDARDS)
// =============================================================================

const REGIME_THRESHOLDS = {
  low: 0.5,      // < 50% of average volatility
  normal: 1.0,   // 50-100% of average
  high: 1.5,     // 100-150% of average
  extreme: 2.0,  // > 150% of average
};

// Risk adjustments by regime (based on institutional risk management)
const REGIME_ADJUSTMENTS: Record<VolatilityRegime, Omit<BotRiskAdjustment, 'rationale'>> = {
  low: {
    positionSizeMultiplier: 1.2,      // Increase position in low vol
    maxPositionPercent: 50,           // Can use more capital
    stopLossMultiplier: 0.8,          // Tighter stops
    takeProfitMultiplier: 1.0,        // Normal targets
    entryDelay: 0,
    shouldHaltTrading: false,
    signalConfidenceAdjustment: 0.05, // Slight boost
    minSignalStrength: 0.3,           // Accept weaker signals
    maxDrawdownPercent: 15,           // Normal drawdown limit
    maxLeverage: 5,                   // Higher leverage allowed
  },
  normal: {
    positionSizeMultiplier: 1.0,
    maxPositionPercent: 40,
    stopLossMultiplier: 1.0,
    takeProfitMultiplier: 1.0,
    entryDelay: 0,
    shouldHaltTrading: false,
    signalConfidenceAdjustment: 0,
    minSignalStrength: 0.5,
    maxDrawdownPercent: 10,
    maxLeverage: 3,
  },
  high: {
    positionSizeMultiplier: 0.6,      // Reduce position
    maxPositionPercent: 25,
    stopLossMultiplier: 1.5,          // Wider stops
    takeProfitMultiplier: 1.3,        // Extended targets
    entryDelay: 5000,                 // 5 second delay
    shouldHaltTrading: false,
    signalConfidenceAdjustment: -0.1, // Reduce confidence
    minSignalStrength: 0.6,           // Require stronger signals
    maxDrawdownPercent: 7,
    maxLeverage: 2,
  },
  extreme: {
    positionSizeMultiplier: 0.2,      // Minimal position
    maxPositionPercent: 10,
    stopLossMultiplier: 2.0,          // Very wide stops
    takeProfitMultiplier: 1.5,
    entryDelay: 30000,                // 30 second delay
    shouldHaltTrading: true,          // Consider halting
    signalConfidenceAdjustment: -0.3, // Significant reduction
    minSignalStrength: 0.8,           // Only strongest signals
    maxDrawdownPercent: 5,
    maxLeverage: 1,                   // No leverage
  },
};

// Bot-specific adjustments
const BOT_SPECIFIC_MULTIPLIERS: Record<BotType, {
  positionSize: number;
  stopLoss: number;
  confidence: number;
}> = {
  DCA: {
    positionSize: 1.0,   // DCA benefits from volatility
    stopLoss: 1.2,       // Wider stops for averaging
    confidence: 0.9,
  },
  BB: {
    positionSize: 0.8,   // BB already uses volatility
    stopLoss: 1.0,
    confidence: 1.0,
  },
  ORION: {
    positionSize: 0.7,   // Conservative institutional
    stopLoss: 1.1,
    confidence: 0.95,
  },
  LOGOS: {
    positionSize: 1.0,   // Meta bot, uses all signals
    stopLoss: 1.0,
    confidence: 1.0,
  },
  GRID: {
    positionSize: 0.9,   // Grid works in ranging
    stopLoss: 1.3,
    confidence: 0.9,
  },
  MFT: {
    positionSize: 0.8,
    stopLoss: 1.2,
    confidence: 0.95,
  },
};

// =============================================================================
// GARCH INTEGRATION SERVICE
// =============================================================================

class GARCHIntegrationService {
  private config: GARCHServiceConfig;
  private volatilityCache: Map<string, VolatilityContext> = new Map();
  private priceHistory: Map<string, number[]> = new Map();
  private returnsHistory: Map<string, number[]> = new Map();
  private lastUpdate: Map<string, number> = new Map();
  private forecastAccuracy: Map<string, { predicted: number; actual: number; timestamp: number }[]> = new Map();

  constructor(config?: Partial<GARCHServiceConfig>) {
    this.config = {
      defaultModelType: 'GARCH',
      updateIntervalMs: 60 * 60 * 1000, // 1 hour
      minDataPoints: 30,
      lookbackDays: 365,
      forecastDays: 10,
      cacheTimeoutMs: 5 * 60 * 1000, // 5 minutes
      ...config,
    };
  }

  /**
   * Initialize volatility context for a symbol with price data
   */
  async initializeSymbol(symbol: string, prices: number[]): Promise<VolatilityContext> {
    if (prices.length < this.config.minDataPoints) {
      throw new Error(`Insufficient data: need ${this.config.minDataPoints}, got ${prices.length}`);
    }

    // Calculate returns
    const returns = this.calculateReturns(prices);
    this.priceHistory.set(symbol, prices);
    this.returnsHistory.set(symbol, returns);

    // Fit GARCH model
    const model = createGARCHModel(this.config.defaultModelType, {
      maxIterations: 100,
      tolerance: 1e-6,
    });

    const result = model.fit(returns);
    const currentVolatility = model.getCurrentVolatility();
    const forecast = model.forecast(this.config.forecastDays);

    // Determine regime
    const avgVolatility = this.calculateAverageVolatility(returns);
    const regime = this.determineRegime(currentVolatility, avgVolatility);
    const regimeScore = this.calculateRegimeScore(currentVolatility, avgVolatility);

    // Determine trend
    const trend = this.determineVolatilityTrend(forecast);

    const context: VolatilityContext = {
      symbol,
      currentVolatility,
      forecastVolatility: forecast,
      regime,
      regimeScore,
      trend,
      params: result.params,
      modelQuality: {
        converged: result.converged,
        aic: result.aic,
        bic: result.bic,
      },
      timestamp: Date.now(),
    };

    this.volatilityCache.set(symbol, context);
    this.lastUpdate.set(symbol, Date.now());

    return context;
  }

  /**
   * Get volatility context for a symbol (with cache)
   */
  getVolatilityContext(symbol: string): VolatilityContext | null {
    const cached = this.volatilityCache.get(symbol);
    if (!cached) return null;

    // Check cache freshness
    const lastUpdate = this.lastUpdate.get(symbol) || 0;
    if (Date.now() - lastUpdate > this.config.cacheTimeoutMs) {
      return null; // Cache expired
    }

    return cached;
  }

  /**
   * Update volatility with new price
   */
  updateWithNewPrice(symbol: string, newPrice: number): VolatilityContext | null {
    const prices = this.priceHistory.get(symbol);
    const returns = this.returnsHistory.get(symbol);
    const cached = this.volatilityCache.get(symbol);

    if (!prices || !returns || !cached) return null;

    // Calculate new return
    const lastPrice = prices[prices.length - 1];
    const newReturn = (newPrice - lastPrice) / lastPrice;

    // Store forecast accuracy
    const lastForecast = cached.forecastVolatility[0];
    if (lastForecast) {
      this.recordForecastAccuracy(symbol, lastForecast, Math.abs(newReturn));
    }

    // Update histories
    prices.push(newPrice);
    returns.push(newReturn);

    // Keep limited history
    if (prices.length > this.config.lookbackDays * 2) {
      prices.shift();
      returns.shift();
    }

    // Quick update using existing model (don't re-fit every tick)
    const model = createGARCHModel(this.config.defaultModelType);
    model.fit(returns.slice(-100)); // Quick fit on recent data

    const currentVolatility = model.getCurrentVolatility();
    const avgVolatility = this.calculateAverageVolatility(returns);
    const regime = this.determineRegime(currentVolatility, avgVolatility);

    // Update cached context
    const updated: VolatilityContext = {
      ...cached,
      currentVolatility,
      regime,
      regimeScore: this.calculateRegimeScore(currentVolatility, avgVolatility),
      trend: this.determineVolatilityTrend(model.forecast(this.config.forecastDays)),
      timestamp: Date.now(),
    };

    this.volatilityCache.set(symbol, updated);
    this.lastUpdate.set(symbol, Date.now());

    return updated;
  }

  /**
   * Get risk adjustments for a specific bot
   */
  getRiskAdjustment(symbol: string, botType: BotType): BotRiskAdjustment {
    const context = this.getVolatilityContext(symbol);

    if (!context) {
      // Return conservative defaults
      return {
        positionSizeMultiplier: 0.5,
        maxPositionPercent: 20,
        stopLossMultiplier: 1.5,
        takeProfitMultiplier: 1.2,
        entryDelay: 10000,
        shouldHaltTrading: false,
        signalConfidenceAdjustment: -0.1,
        minSignalStrength: 0.6,
        maxDrawdownPercent: 8,
        maxLeverage: 2,
        rationale: 'No volatility data available - using conservative defaults',
      };
    }

    // Get base adjustments for regime
    const baseAdjustments = REGIME_ADJUSTMENTS[context.regime];
    const botMultipliers = BOT_SPECIFIC_MULTIPLIERS[botType];

    // Apply bot-specific adjustments
    const adjusted: BotRiskAdjustment = {
      positionSizeMultiplier: Math.min(1, baseAdjustments.positionSizeMultiplier * botMultipliers.positionSize),
      maxPositionPercent: Math.round(baseAdjustments.maxPositionPercent * botMultipliers.positionSize),
      stopLossMultiplier: baseAdjustments.stopLossMultiplier * botMultipliers.stopLoss,
      takeProfitMultiplier: baseAdjustments.takeProfitMultiplier,
      entryDelay: baseAdjustments.entryDelay,
      shouldHaltTrading: baseAdjustments.shouldHaltTrading && context.regimeScore > 0.85,
      signalConfidenceAdjustment: baseAdjustments.signalConfidenceAdjustment * botMultipliers.confidence,
      minSignalStrength: baseAdjustments.minSignalStrength,
      maxDrawdownPercent: baseAdjustments.maxDrawdownPercent,
      maxLeverage: baseAdjustments.maxLeverage,
      rationale: this.generateRationale(context, botType),
    };

    return adjusted;
  }

  /**
   * Get signal confidence adjustment for LOGOS aggregation
   */
  getSignalConfidenceAdjustment(symbol: string, baseConfidence: number): number {
    const context = this.getVolatilityContext(symbol);
    if (!context) return baseConfidence;

    const adjustment = REGIME_ADJUSTMENTS[context.regime].signalConfidenceAdjustment;
    return Math.max(0, Math.min(1, baseConfidence + adjustment));
  }

  /**
   * Check if trading should be halted for a symbol
   */
  shouldHaltTrading(symbol: string): boolean {
    const context = this.getVolatilityContext(symbol);
    if (!context) return false;

    return context.regime === 'extreme' && context.regimeScore > 0.85;
  }

  /**
   * Get volatility forecast for N days
   */
  getVolatilityForecast(symbol: string, days: number): number[] | null {
    const context = this.getVolatilityContext(symbol);
    if (!context) return null;

    return context.forecastVolatility.slice(0, days);
  }

  /**
   * Get forecast accuracy metrics
   */
  getForecastAccuracy(symbol: string): {
    mape: number; // Mean Absolute Percentage Error
    bias: number; // Systematic bias (over/under prediction)
    samples: number;
  } | null {
    const history = this.forecastAccuracy.get(symbol);
    if (!history || history.length < 10) return null;

    let sumAPE = 0;
    let sumBias = 0;

    for (const sample of history) {
      const pe = (sample.predicted - sample.actual) / sample.actual;
      sumAPE += Math.abs(pe);
      sumBias += pe;
    }

    return {
      mape: sumAPE / history.length,
      bias: sumBias / history.length,
      samples: history.length,
    };
  }

  /**
   * Get all symbols with volatility context
   */
  getActiveSymbols(): string[] {
    return Array.from(this.volatilityCache.keys());
  }

  /**
   * Get summary for dashboard
   */
  getSummary(): {
    totalSymbols: number;
    regimes: Record<VolatilityRegime, number>;
    avgVolatility: number;
    needsUpdate: string[];
  } {
    const symbols = this.getActiveSymbols();
    const regimes: Record<VolatilityRegime, number> = {
      low: 0,
      normal: 0,
      high: 0,
      extreme: 0,
    };
    let totalVol = 0;
    const needsUpdate: string[] = [];

    for (const symbol of symbols) {
      const context = this.volatilityCache.get(symbol);
      if (context) {
        regimes[context.regime]++;
        totalVol += context.currentVolatility;

        const lastUpd = this.lastUpdate.get(symbol) || 0;
        if (Date.now() - lastUpd > this.config.cacheTimeoutMs) {
          needsUpdate.push(symbol);
        }
      }
    }

    return {
      totalSymbols: symbols.length,
      regimes,
      avgVolatility: symbols.length > 0 ? totalVol / symbols.length : 0,
      needsUpdate,
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
    return returns;
  }

  private calculateAverageVolatility(returns: number[]): number {
    if (returns.length < 2) return 0.01;
    const variance = returns.reduce((sum, r) => sum + r * r, 0) / returns.length;
    return Math.sqrt(variance);
  }

  private determineRegime(currentVol: number, avgVol: number): VolatilityRegime {
    const ratio = avgVol > 0 ? currentVol / avgVol : 1;

    if (ratio < REGIME_THRESHOLDS.low) return 'low';
    if (ratio < REGIME_THRESHOLDS.normal) return 'normal';
    if (ratio < REGIME_THRESHOLDS.high) return 'high';
    return 'extreme';
  }

  private calculateRegimeScore(currentVol: number, avgVol: number): number {
    const ratio = avgVol > 0 ? currentVol / avgVol : 1;
    // Normalize to 0-1 scale where 0 = low vol, 1 = extreme vol
    return Math.min(1, Math.max(0, (ratio - 0.3) / 1.7));
  }

  private determineVolatilityTrend(forecast: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (forecast.length < 3) return 'stable';

    const first = forecast.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last = forecast.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const change = (last - first) / first;

    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  private recordForecastAccuracy(symbol: string, predicted: number, actual: number): void {
    if (!this.forecastAccuracy.has(symbol)) {
      this.forecastAccuracy.set(symbol, []);
    }

    const history = this.forecastAccuracy.get(symbol)!;
    history.push({
      predicted,
      actual,
      timestamp: Date.now(),
    });

    // Keep last 100 predictions
    if (history.length > 100) {
      history.shift();
    }
  }

  private generateRationale(context: VolatilityContext, botType: BotType): string {
    const regimeDesc = {
      low: 'низкая волатильность - можно увеличить позиции',
      normal: 'нормальная волатильность - стандартные параметры',
      high: 'высокая волатильность - снижаем риски',
      extreme: 'экстремальная волатильность - критические меры',
    };

    const trendDesc = {
      increasing: 'растущая',
      decreasing: 'падающая',
      stable: 'стабильная',
    };

    return `${botType}: ${regimeDesc[context.regime]}. ` +
           `Тренд волатильности: ${trendDesc[context.trend]}. ` +
           `Текущая: ${(context.currentVolatility * 100).toFixed(2)}%`;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let serviceInstance: GARCHIntegrationService | null = null;

export function getGARCHIntegrationService(config?: Partial<GARCHServiceConfig>): GARCHIntegrationService {
  if (!serviceInstance) {
    serviceInstance = new GARCHIntegrationService(config);
  }
  return serviceInstance;
}

export function resetGARCHIntegrationService(): void {
  serviceInstance = null;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  GARCHIntegrationService,
  REGIME_THRESHOLDS,
  REGIME_ADJUSTMENTS,
  BOT_SPECIFIC_MULTIPLIERS,
};
