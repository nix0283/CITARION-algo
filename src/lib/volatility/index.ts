/**
 * VOLATILITY MODULE INDEX
 * 
 * GARCH volatility analysis for trading systems.
 * Provides volatility forecasting, regime detection, and bot integration.
 */

// Core GARCH models
export {
  GARCH,
  GJRGARCH,
  EGARCH,
  createGARCHModel,
  VolatilityAnalyzer,
  type GARCHType,
  type GARCHParams,
  type GARCHConfig,
  type GARCHResult,
} from './garch';

// GARCH Integration Service for trading bots
export {
  getGARCHIntegrationService,
  resetGARCHIntegrationService,
  GARCHIntegrationService,
  REGIME_THRESHOLDS,
  REGIME_ADJUSTMENTS,
  BOT_SPECIFIC_MULTIPLIERS,
  type VolatilityRegime,
  type BotType,
  type VolatilityContext,
  type BotRiskAdjustment,
  type GARCHServiceConfig,
} from './garch-integration-service';

// GARCH Feature Provider for ML models
export {
  getGARCHFeatureProvider,
  resetGARCHFeatureProvider,
  GARCHFeatureProvider,
  DEFAULT_GARCH_FEATURE_CONFIG,
  type GARCHFeatures,
  type GARCHFeatureConfig,
} from './garch-feature-provider';

// GARCH Training Data Collector
export {
  getGARCHTrainingCollector,
  resetGARCHTrainingCollector,
  GARCHTrainingCollector,
  DEFAULT_COLLECTOR_CONFIG,
  type ForecastRecord,
  type AccuracyMetrics,
  type CollectorConfig,
} from './garch-training-collector';
