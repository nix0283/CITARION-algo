/**
 * GARCH Feature Provider for Gradient Boosting
 * 
 * Provides GARCH-based features for the Gradient Boosting signal scorer.
 * 
 * NEW FEATURES (not duplicating existing rolling volatility):
 * - garch_forecast_1d: 1-day ahead volatility forecast
 * - garch_forecast_5d: 5-day ahead volatility forecast
 * - garch_forecast_10d: 10-day ahead volatility forecast
 * - volatility_regime: encoded regime (0=low, 1=normal, 2=high, 3=extreme)
 * - volatility_trend: encoded trend (0=decreasing, 1=stable, 2=increasing)
 * - volatility_persistence: alpha + beta (GARCH persistence)
 * - conditional_volatility_ratio: current vs average volatility
 */

import { getGARCHIntegrationService, type VolatilityRegime, type VolatilityContext } from './garch-integration-service';

// =============================================================================
// TYPES
// =============================================================================

export interface GARCHFeatures {
  // Forecast features (normalized)
  garch_forecast_1d: number;      // 1-day forecast, normalized
  garch_forecast_5d: number;      // 5-day forecast, normalized
  garch_forecast_10d: number;     // 10-day forecast, normalized
  
  // Regime features
  volatility_regime: number;      // 0-3 encoded
  volatility_trend: number;       // 0-2 encoded
  
  // Model features
  volatility_persistence: number; // alpha + beta
  conditional_volatility_ratio: number; // current / average
  
  // Quality features
  model_converged: number;        // 0 or 1
  model_aic_normalized: number;   // AIC normalized
  
  // Raw values for reference
  raw_current_volatility: number;
  raw_regime: VolatilityRegime;
}

export interface GARCHFeatureConfig {
  // Normalization ranges
  volatilityMax: number;         // Max expected daily volatility (e.g., 0.1 = 10%)
  aicMax: number;                // Max expected AIC for normalization
  
  // Cache settings
  cacheTimeoutMs: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_GARCH_FEATURE_CONFIG: GARCHFeatureConfig = {
  volatilityMax: 0.15,   // 15% daily volatility = extreme
  aicMax: -1000,         // AIC typically negative, more negative = worse
  cacheTimeoutMs: 5 * 60 * 1000, // 5 minutes
};

// =============================================================================
// GARCH FEATURE PROVIDER CLASS
// =============================================================================

class GARCHFeatureProvider {
  private config: GARCHFeatureConfig;
  private garchService = getGARCHIntegrationService();
  private featureCache: Map<string, { features: GARCHFeatures; timestamp: number }> = new Map();

  constructor(config: Partial<GARCHFeatureConfig> = {}) {
    this.config = { ...DEFAULT_GARCH_FEATURE_CONFIG, ...config };
  }

  /**
   * Get GARCH features for a symbol
   */
  async getFeatures(symbol: string): Promise<GARCHFeatures | null> {
    // Check cache
    const cached = this.featureCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeoutMs) {
      return cached.features;
    }

    // Get volatility context
    const context = await this.garchService.getVolatilityContext(symbol);
    if (!context) {
      return this.getDefaultFeatures();
    }

    // Build features
    const features = this.buildFeatures(context);
    
    // Cache
    this.featureCache.set(symbol, {
      features,
      timestamp: Date.now(),
    });

    return features;
  }

  /**
   * Get features synchronously (from cache or default)
   */
  getFeaturesSync(symbol: string): GARCHFeatures {
    const cached = this.featureCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeoutMs) {
      return cached.features;
    }

    // Try to get from GARCH service cache
    const context = this.garchService.getVolatilityContext(symbol);
    if (context) {
      return this.buildFeatures(context);
    }

    return this.getDefaultFeatures();
  }

  /**
   * Build features from volatility context
   */
  private buildFeatures(context: VolatilityContext): GARCHFeatures {
    const { currentVolatility, forecastVolatility, regime, trend, params, modelQuality } = context;

    // Normalize forecasts
    const forecast1d = forecastVolatility[0] || currentVolatility;
    const forecast5d = forecastVolatility[4] || forecastVolatility[forecastVolatility.length - 1] || currentVolatility;
    const forecast10d = forecastVolatility[9] || forecastVolatility[forecastVolatility.length - 1] || currentVolatility;

    // Encode regime
    const regimeEncoding: Record<VolatilityRegime, number> = {
      low: 0,
      normal: 1,
      high: 2,
      extreme: 3,
    };

    // Encode trend
    const trendEncoding = {
      decreasing: 0,
      stable: 1,
      increasing: 2,
    };

    // Calculate persistence (alpha + beta)
    const persistence = params.alpha + params.beta;

    // Calculate volatility ratio
    const avgVolatility = currentVolatility / (regimeEncoding[regime] === 0 ? 0.5 : 
                         regimeEncoding[regime] === 1 ? 1.0 :
                         regimeEncoding[regime] === 2 ? 1.5 : 2.0);
    const volatilityRatio = avgVolatility > 0 ? currentVolatility / avgVolatility : 1;

    // Normalize AIC (typically negative, more negative = worse)
    const aicNormalized = Math.max(0, Math.min(1, modelQuality.aic / this.config.aicMax));

    return {
      // Forecast features (normalized 0-1)
      garch_forecast_1d: this.normalizeVolatility(forecast1d),
      garch_forecast_5d: this.normalizeVolatility(forecast5d),
      garch_forecast_10d: this.normalizeVolatility(forecast10d),
      
      // Regime features
      volatility_regime: regimeEncoding[regime] / 3, // Normalize to 0-1
      volatility_trend: trendEncoding[trend] / 2,    // Normalize to 0-1
      
      // Model features
      volatility_persistence: Math.min(1, persistence), // Typically < 1
      conditional_volatility_ratio: Math.min(2, volatilityRatio) / 2, // Normalize
      
      // Quality features
      model_converged: modelQuality.converged ? 1 : 0,
      model_aic_normalized: aicNormalized,
      
      // Raw values
      raw_current_volatility: currentVolatility,
      raw_regime: regime,
    };
  }

  /**
   * Normalize volatility to 0-1 range
   */
  private normalizeVolatility(vol: number): number {
    return Math.min(1, Math.max(0, vol / this.config.volatilityMax));
  }

  /**
   * Get default features when no data available
   */
  private getDefaultFeatures(): GARCHFeatures {
    return {
      garch_forecast_1d: 0.5,
      garch_forecast_5d: 0.5,
      garch_forecast_10d: 0.5,
      volatility_regime: 0.33, // Normal
      volatility_trend: 0.5,   // Stable
      volatility_persistence: 0.9,
      conditional_volatility_ratio: 0.5,
      model_converged: 0,
      model_aic_normalized: 0.5,
      raw_current_volatility: 0.02,
      raw_regime: 'normal',
    };
  }

  /**
   * Get feature names for ML model
   */
  getFeatureNames(): string[] {
    return [
      'garch_forecast_1d',
      'garch_forecast_5d',
      'garch_forecast_10d',
      'volatility_regime',
      'volatility_trend',
      'volatility_persistence',
      'conditional_volatility_ratio',
      'model_converged',
      'model_aic_normalized',
    ];
  }

  /**
   * Get feature descriptions
   */
  getFeatureDescriptions(): Record<keyof Omit<GARCHFeatures, 'raw_current_volatility' | 'raw_regime'>, string> {
    return {
      garch_forecast_1d: '1-day ahead GARCH volatility forecast (normalized)',
      garch_forecast_5d: '5-day ahead GARCH volatility forecast (normalized)',
      garch_forecast_10d: '10-day ahead GARCH volatility forecast (normalized)',
      volatility_regime: 'Current volatility regime (0=low, 0.33=normal, 0.67=high, 1=extreme)',
      volatility_trend: 'Volatility trend direction (0=decreasing, 0.5=stable, 1=increasing)',
      volatility_persistence: 'GARCH persistence (alpha + beta), indicates volatility memory',
      conditional_volatility_ratio: 'Ratio of current to average volatility',
      model_converged: 'Whether GARCH model converged during fitting',
      model_aic_normalized: 'Normalized AIC score for model quality',
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.featureCache.clear();
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<GARCHFeatureConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let providerInstance: GARCHFeatureProvider | null = null;

export function getGARCHFeatureProvider(config?: Partial<GARCHFeatureConfig>): GARCHFeatureProvider {
  if (!providerInstance) {
    providerInstance = new GARCHFeatureProvider(config);
  }
  return providerInstance;
}

export function resetGARCHFeatureProvider(): void {
  providerInstance = null;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  GARCHFeatureProvider,
  DEFAULT_GARCH_FEATURE_CONFIG,
};
