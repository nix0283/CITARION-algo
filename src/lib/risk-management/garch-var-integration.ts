/**
 * GARCH-VAR INTEGRATION
 *
 * Integrates GARCH volatility forecasts into VaR calculations
 * for more accurate risk assessment in volatile markets.
 */

import { VaRCalculator, defaultVaRConfig, type VaRResult } from './var-calculator';
import { getGarchIntegrationService, type GarchIntegrationService } from '@/lib/volatility/garch-integration-service';
import type { VaRConfig } from './types';

export interface GarchVaRResult extends VaRResult {
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
  garchForecast: number;
  volatilityAdjustment: number;
  adjustedStd: number;
}

export interface VolatilityAdjustments {
  varMultiplier: number;
  positionSizeMultiplier: number;
  stopLossMultiplier: number;
  confidenceBoost: number;
}

// Volatility regime adjustments
const VOLATILITY_MULTIPLIERS: Record<string, VolatilityAdjustments> = {
  low: {
    varMultiplier: 0.85,        // Lower VaR in low volatility
    positionSizeMultiplier: 1.2, // Can increase position size
    stopLossMultiplier: 0.9,    // Tighter stops
    confidenceBoost: 0.1,       // Higher confidence
  },
  normal: {
    varMultiplier: 1.0,
    positionSizeMultiplier: 1.0,
    stopLossMultiplier: 1.0,
    confidenceBoost: 0,
  },
  high: {
    varMultiplier: 1.3,         // Higher VaR in high volatility
    positionSizeMultiplier: 0.75, // Reduce position size
    stopLossMultiplier: 1.25,   // Wider stops
    confidenceBoost: -0.05,
  },
  extreme: {
    varMultiplier: 1.6,         // Much higher VaR
    positionSizeMultiplier: 0.5, // Significant position reduction
    stopLossMultiplier: 1.5,    // Much wider stops
    confidenceBoost: -0.1,
  },
};

/**
 * GARCH-Enhanced VaR Calculator
 */
export class GarchVaRCalculator {
  private varCalculator: VaRCalculator;
  private garchService: GarchIntegrationService | null = null;
  private config: VaRConfig;
  private cache: Map<string, { data: GarchVaRResult; timestamp: number }> = new Map();
  private cacheTtl: number = 60000; // 1 minute

  constructor(config: Partial<VaRConfig> = {}) {
    this.config = { ...defaultVaRConfig, ...config };
    this.varCalculator = new VaRCalculator(this.config);
  }

  /**
   * Initialize GARCH service
   */
  async initialize(): Promise<void> {
    try {
      this.garchService = getGarchIntegrationService();
    } catch (error) {
      console.error('[GarchVaR] Failed to initialize GARCH service:', error);
    }
  }

  /**
   * Calculate GARCH-adjusted VaR
   */
  async calculate(
    returns: number[],
    portfolioValue: number,
    symbol: string = 'BTCUSDT'
  ): Promise<GarchVaRResult> {
    // Check cache
    const cacheKey = `${symbol}-${portfolioValue}-${returns.length}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return cached.data;
    }

    // Calculate base VaR
    const baseVaR = this.varCalculator.calculate(returns, portfolioValue);

    // Get GARCH volatility data
    let volatilityRegime: 'low' | 'normal' | 'high' | 'extreme' = 'normal';
    let garchForecast = 0.02;
    let volatilityAdjustment = 1.0;

    try {
      if (!this.garchService) {
        await this.initialize();
      }

      if (this.garchService) {
        const context = this.garchService.getVolatilityContext(symbol);
        
        if (context) {
          volatilityRegime = context.regime;
          garchForecast = context.forecast1d;
          
          // Apply volatility adjustment
          const adjustments = VOLATILITY_MULTIPLIERS[volatilityRegime];
          volatilityAdjustment = adjustments.varMultiplier;
        }
      }
    } catch (error) {
      console.error('[GarchVaR] Error getting GARCH data:', error);
    }

    // Apply GARCH adjustment to VaR
    const adjustedVar = baseVaR.var * volatilityAdjustment;
    const adjustedES = baseVaR.expectedShortfall * volatilityAdjustment;
    
    // Calculate adjusted standard deviation
    const adjustedStd = garchForecast * portfolioValue;

    const result: GarchVaRResult = {
      ...baseVaR,
      var: adjustedVar,
      expectedShortfall: adjustedES,
      volatilityRegime,
      garchForecast,
      volatilityAdjustment,
      adjustedStd,
      riskPercentage: (adjustedVar / portfolioValue) * 100,
    };

    // Cache result
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Get volatility adjustments for position sizing
   */
  getVolatilityAdjustments(regime: string): VolatilityAdjustments {
    return VOLATILITY_MULTIPLIERS[regime] || VOLATILITY_MULTIPLIERS.normal;
  }

  /**
   * Calculate position size with GARCH adjustment
   */
  calculateAdjustedPositionSize(
    baseSize: number,
    symbol: string = 'BTCUSDT'
  ): { size: number; regime: string; multiplier: number } {
    let regime: 'low' | 'normal' | 'high' | 'extreme' = 'normal';
    
    try {
      if (this.garchService) {
        const context = this.garchService.getVolatilityContext(symbol);
        if (context) {
          regime = context.regime;
        }
      }
    } catch (error) {
      console.error('[GarchVaR] Error getting volatility:', error);
    }

    const adjustments = VOLATILITY_MULTIPLIERS[regime];
    const adjustedSize = baseSize * adjustments.positionSizeMultiplier;

    return {
      size: adjustedSize,
      regime,
      multiplier: adjustments.positionSizeMultiplier,
    };
  }

  /**
   * Calculate stop loss with GARCH adjustment
   */
  calculateAdjustedStopLoss(
    baseStopLossPercent: number,
    symbol: string = 'BTCUSDT'
  ): { stopLoss: number; regime: string; multiplier: number } {
    let regime: 'low' | 'normal' | 'high' | 'extreme' = 'normal';
    
    try {
      if (this.garchService) {
        const context = this.garchService.getVolatilityContext(symbol);
        if (context) {
          regime = context.regime;
        }
      }
    } catch (error) {
      console.error('[GarchVaR] Error getting volatility:', error);
    }

    const adjustments = VOLATILITY_MULTIPLIERS[regime];
    const adjustedStopLoss = baseStopLossPercent * adjustments.stopLossMultiplier;

    return {
      stopLoss: adjustedStopLoss,
      regime,
      multiplier: adjustments.stopLossMultiplier,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VaRConfig>): void {
    this.config = { ...this.config, ...config };
    this.varCalculator.updateConfig(this.config);
  }

  /**
   * Get current GARCH forecast
   */
  async getGarchForecast(symbol: string): Promise<{
    forecast1d: number;
    forecast5d: number;
    forecast10d: number;
    regime: string;
  }> {
    try {
      if (!this.garchService) {
        await this.initialize();
      }

      if (this.garchService) {
        const context = this.garchService.getVolatilityContext(symbol);
        if (context) {
          return {
            forecast1d: context.forecast1d,
            forecast5d: context.forecast5d,
            forecast10d: context.forecast10d,
            regime: context.regime,
          };
        }
      }
    } catch (error) {
      console.error('[GarchVaR] Error getting forecast:', error);
    }

    return {
      forecast1d: 0.02,
      forecast5d: 0.045,
      forecast10d: 0.063,
      regime: 'normal',
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let garchVaRInstance: GarchVaRCalculator | null = null;

export function getGarchVaRCalculator(): GarchVaRCalculator {
  if (!garchVaRInstance) {
    garchVaRInstance = new GarchVaRCalculator();
  }
  return garchVaRInstance;
}

export async function calculateGarchVaR(
  returns: number[],
  portfolioValue: number,
  symbol?: string
): Promise<GarchVaRResult> {
  const calculator = getGarchVaRCalculator();
  return calculator.calculate(returns, portfolioValue, symbol);
}

export { VOLATILITY_MULTIPLIERS };
