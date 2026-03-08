/**
 * LOGOS GARCH Integration
 * 
 * Integrates GARCH volatility analysis with LOGOS signal aggregation.
 * Adjusts signal weights based on volatility regime.
 * 
 * Institutional-grade risk management:
 * - Low volatility: Allow higher confidence signals
 * - Normal volatility: Standard signal processing
 * - High volatility: Reduce signal weights, require higher quality
 * - Extreme volatility: Filter out weaker signals, consider halting
 */

import { getGARCHIntegrationService, type VolatilityRegime, type VolatilityContext } from '../volatility/garch-integration-service';
import type { AggregatedSignal, IncomingSignal, SignalContribution } from './engine';
import type { BotCode } from '../orchestration/types';

// =============================================================================
// TYPES
// =============================================================================

export interface VolatilityWeightedSignal extends AggregatedSignal {
  volatilityContext: VolatilityContext;
  volatilityAdjustments: {
    confidenceAdjustment: number;
    consensusAdjustment: number;
    qualityDowngrade: boolean;
    shouldFilter: boolean;
  };
}

export interface LOGOSGARCHConfig {
  // Enable GARCH integration
  enabled: boolean;
  
  // Minimum regime to allow trading
  minRegimeForTrading: VolatilityRegime;
  
  // Regime-based weight multipliers
  regimeMultipliers: Record<VolatilityRegime, number>;
  
  // Confidence adjustments by regime
  confidenceAdjustments: Record<VolatilityRegime, number>;
  
  // Filter signals below this confidence in high/extreme vol
  minConfidenceInHighVol: number;
  minConfidenceInExtremeVol: number;
  
  // Require consensus boost in volatile markets
  consensusBoostInLowVol: number;
  consensusPenaltyInHighVol: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_LOGOS_GARCH_CONFIG: LOGOSGARCHConfig = {
  enabled: true,
  minRegimeForTrading: 'low', // Allow all regimes
  
  regimeMultipliers: {
    low: 1.15,       // Boost signals in low vol
    normal: 1.0,     // Standard processing
    high: 0.75,      // Reduce weight in high vol
    extreme: 0.4,    // Significantly reduce in extreme vol
  },
  
  confidenceAdjustments: {
    low: 0.05,       // Slight boost
    normal: 0,       // No adjustment
    high: -0.10,     // Reduce confidence
    extreme: -0.25,  // Significant reduction
  },
  
  minConfidenceInHighVol: 0.6,
  minConfidenceInExtremeVol: 0.75,
  
  consensusBoostInLowVol: 0.1,
  consensusPenaltyInHighVol: -0.15,
};

// =============================================================================
// LOGOS GARCH INTEGRATION CLASS
// =============================================================================

class LOGOSGARCHIntegration {
  private config: LOGOSGARCHConfig;
  private garchService = getGARCHIntegrationService();
  private volatilityCache: Map<string, VolatilityContext> = new Map();
  private adjustmentHistory: Array<{
    symbol: string;
    timestamp: number;
    regime: VolatilityRegime;
    adjustment: number;
    filtered: boolean;
  }> = [];

  constructor(config: Partial<LOGOSGARCHConfig> = {}) {
    this.config = { ...DEFAULT_LOGOS_GARCH_CONFIG, ...config };
  }

  /**
   * Get volatility context for a symbol
   */
  async getVolatilityContext(symbol: string): Promise<VolatilityContext | null> {
    // Check cache first
    const cached = this.volatilityCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 min cache
      return cached;
    }

    // Get from service
    const context = this.garchService.getVolatilityContext(symbol);
    if (context) {
      this.volatilityCache.set(symbol, context);
      return context;
    }

    return null;
  }

  /**
   * Adjust signal contribution based on volatility
   */
  adjustSignalContribution(
    contribution: SignalContribution,
    context: VolatilityContext
  ): SignalContribution {
    if (!this.config.enabled) {
      return contribution;
    }

    const regime = context.regime;
    const multiplier = this.config.regimeMultipliers[regime];
    const confidenceAdj = this.config.confidenceAdjustments[regime];

    return {
      ...contribution,
      weight: contribution.weight * multiplier,
      adjustedConfidence: Math.max(0, Math.min(1, 
        contribution.adjustedConfidence + confidenceAdj
      )),
    };
  }

  /**
   * Check if a signal should be filtered based on volatility
   */
  shouldFilterSignal(signal: IncomingSignal, context: VolatilityContext): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const regime = context.regime;

    // Filter based on regime and confidence
    if (regime === 'extreme' && signal.confidence < this.config.minConfidenceInExtremeVol) {
      return true;
    }

    if (regime === 'high' && signal.confidence < this.config.minConfidenceInHighVol) {
      return true;
    }

    // Filter in extreme vol if signal direction conflicts with volatility trend
    if (regime === 'extreme' && context.trend === 'increasing') {
      // Be more conservative when vol is increasing
      if (signal.confidence < 0.85) {
        return true;
      }
    }

    return false;
  }

  /**
   * Adjust aggregated signal based on volatility
   */
  adjustAggregatedSignal(
    signal: AggregatedSignal,
    context: VolatilityContext
  ): VolatilityWeightedSignal {
    const regime = context.regime;
    
    // Calculate adjustments
    let confidenceAdjustment = this.config.confidenceAdjustments[regime];
    let consensusAdjustment = 0;
    let qualityDowngrade = false;
    let shouldFilter = false;

    // Consensus adjustments
    if (regime === 'low') {
      consensusAdjustment = this.config.consensusBoostInLowVol;
    } else if (regime === 'high' || regime === 'extreme') {
      consensusAdjustment = this.config.consensusPenaltyInHighVol;
    }

    // Quality downgrade in volatile markets
    if ((regime === 'high' || regime === 'extreme') && signal.signalQuality === 'medium') {
      qualityDowngrade = true;
    }

    // Should filter signal entirely
    if (regime === 'extreme' && signal.confidence < this.config.minConfidenceInExtremeVol) {
      shouldFilter = true;
    }

    // Record adjustment
    this.adjustmentHistory.push({
      symbol: signal.symbol,
      timestamp: Date.now(),
      regime,
      adjustment: confidenceAdjustment,
      filtered: shouldFilter,
    });

    // Keep history bounded
    if (this.adjustmentHistory.length > 1000) {
      this.adjustmentHistory.shift();
    }

    return {
      ...signal,
      confidence: Math.max(0, Math.min(1, signal.confidence + confidenceAdjustment)),
      consensus: Math.max(0, Math.min(1, signal.consensus + consensusAdjustment)),
      signalQuality: qualityDowngrade ? 'low' : signal.signalQuality,
      volatilityContext: context,
      volatilityAdjustments: {
        confidenceAdjustment,
        consensusAdjustment,
        qualityDowngrade,
        shouldFilter,
      },
    };
  }

  /**
   * Get trading recommendation based on volatility
   */
  getTradingRecommendation(context: VolatilityContext): {
    action: 'increase' | 'maintain' | 'reduce' | 'halt';
    reason: string;
    suggestedMaxPosition: number;
    suggestedLeverage: number;
  } {
    const regime = context.regime;
    const trend = context.trend;

    switch (regime) {
      case 'low':
        return {
          action: 'increase',
          reason: `Низкая волатильность (${(context.currentVolatility * 100).toFixed(2)}%) - можно увеличить позиции`,
          suggestedMaxPosition: 50,
          suggestedLeverage: 3,
        };

      case 'normal':
        return {
          action: 'maintain',
          reason: `Нормальная волатильность (${(context.currentVolatility * 100).toFixed(2)}%) - стандартные параметры`,
          suggestedMaxPosition: 40,
          suggestedLeverage: 2,
        };

      case 'high':
        return {
          action: 'reduce',
          reason: `Высокая волатильность (${(context.currentVolatility * 100).toFixed(2)}%) - снижаем риски`,
          suggestedMaxPosition: 25,
          suggestedLeverage: 1.5,
        };

      case 'extreme':
        return {
          action: trend === 'increasing' ? 'halt' : 'reduce',
          reason: `Экстремальная волатильность (${(context.currentVolatility * 100).toFixed(2)}%) - ${
            trend === 'increasing' ? 'рекомендуется остановить торговлю' : 'критическое снижение рисков'
          }`,
          suggestedMaxPosition: 10,
          suggestedLeverage: 1,
        };
    }
  }

  /**
   * Get adjustment statistics
   */
  getAdjustmentStats(): {
    totalAdjustments: number;
    byRegime: Record<VolatilityRegime, number>;
    filteredCount: number;
    filterRate: number;
  } {
    const history = this.adjustmentHistory;
    const byRegime: Record<VolatilityRegime, number> = {
      low: 0,
      normal: 0,
      high: 0,
      extreme: 0,
    };

    let filteredCount = 0;

    for (const adj of history) {
      byRegime[adj.regime]++;
      if (adj.filtered) filteredCount++;
    }

    return {
      totalAdjustments: history.length,
      byRegime,
      filteredCount,
      filterRate: history.length > 0 ? filteredCount / history.length : 0,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LOGOSGARCHConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): LOGOSGARCHConfig {
    return { ...this.config };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let integrationInstance: LOGOSGARCHIntegration | null = null;

export function getLOGOSGARCHIntegration(config?: Partial<LOGOSGARCHConfig>): LOGOSGARCHIntegration {
  if (!integrationInstance) {
    integrationInstance = new LOGOSGARCHIntegration(config);
  }
  return integrationInstance;
}

export function resetLOGOSGARCHIntegration(): void {
  integrationInstance = null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Quick function to adjust signal confidence based on volatility
 */
export function adjustConfidenceForVolatility(
  symbol: string,
  confidence: number,
  regime: VolatilityRegime
): number {
  const adjustments: Record<VolatilityRegime, number> = {
    low: 0.05,
    normal: 0,
    high: -0.10,
    extreme: -0.25,
  };

  return Math.max(0, Math.min(1, confidence + adjustments[regime]));
}

/**
 * Quick function to check if trading should proceed
 */
export function shouldProceedWithTrade(
  symbol: string,
  confidence: number,
  context: VolatilityContext
): boolean {
  if (context.regime === 'extreme') {
    return confidence >= 0.85;
  }
  if (context.regime === 'high') {
    return confidence >= 0.65;
  }
  return confidence >= 0.5;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  LOGOSGARCHIntegration,
  DEFAULT_LOGOS_GARCH_CONFIG,
};
