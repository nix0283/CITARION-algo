/**
 * Jesse Integration Module
 * 
 * Интеграция компонентов из Jesse (https://jesse.trade)
 * 
 * Jesse - это продвинутый Python фреймворк для алгоритмической торговли криптовалютами.
 * Этот модуль портирует ключевые концепции в TypeScript для CITARION.
 * 
 * ## Компоненты:
 * 
 * ### 1. Component Indicators (component-indicators.ts)
 * - Компонентная система индикаторов
 * - 70+ технических индикаторов
 * - Автоматическое кэширование
 * - Композиция индикаторов
 * 
 * ### 2. Look-Ahead Protection (lookahead-protection.ts)
 * - Защита от look-ahead bias в бэктестах
 * - Валидация стратегий
 * - Защищённый доступ к данным
 * - Логирование нарушений
 * 
 * ### 3. Partial Fills (partial-fills.ts)
 * - Моделирование частичного исполнения ордеров
 * - Order book симуляция
 * - Метрики исполнения
 * - Реалистичный бэктестинг
 * 
 * ### 4. Multi-Symbol Strategies (multi-symbol.ts)
 * - Торговля несколькими инструментами
 * - Pairs trading
 * - Portfolio rebalancing
 * - Корреляционный анализ
 * 
 * ### 5. Indicators Library (indicators.ts)
 * - 300+ технических индикаторов
 * - JesseIndicators класс для удобного доступа
 * - Moving averages, momentum, volatility, volume, trend
 * 
 * @see https://jesse.trade
 * @see https://github.com/jesse-ai/jesse
 */

// Component Indicators System
export {
  // Types
  type IndicatorResult,
  type IndicatorParams,
  type IndicatorContext,
  type IIndicator,
  type IndicatorConfig,
  type BaseIndicator,
  
  // Indicators
  SMAIndicator,
  EMAIndicator,
  HMAIndicator,
  RSIIndicator,
  MACDIndicator,
  StochasticIndicator,
  ATRIndicator,
  BollingerBandsIndicator,
  CompositeIndicator,
  
  // Registry
  IndicatorRegistry,
  indicatorRegistry
} from "./component-indicators";

// Look-Ahead Protection
export {
  // Types
  type ProtectionMode,
  type LookAheadViolation,
  type LookAheadProtectionConfig,
  type TimestampedData,
  type ProtectedContext,
  
  // Classes
  LookAheadProtector,
  TimestampedDataStore,
  IndicatorValidator,
  ProtectedCandleIterator,
  
  // Factory functions
  createDefaultProtector,
  createProtectedBacktestContext
} from "./lookahead-protection";

// Partial Fills
export {
  // Types
  type OrderStatus,
  type OrderType,
  type OrderSide,
  type OrderFill,
  type Order,
  type PartialFillsConfig,
  type ExecutionResult,
  type ExecutionMetrics,
  type OrderBookLevel,
  type OrderBookSnapshot,
  
  // Classes
  PartialFillsEngine,
  PartialPosition,
  ExecutionStatistics,
  
  // Config
  DEFAULT_CONFIG
} from "./partial-fills";

// Multi-Symbol Strategies
export {
  // Types
  type Route,
  type RouteSignal,
  type RoutePosition,
  type SharedVariables,
  type RouteEvent,
  type CorrelationData,
  type MultiSymbolConfig,
  type PortfolioAnalysis,
  type PairsTradingParams,
  type PairsSignal,
  type RebalanceParams,
  type RebalanceAction,
  
  // Classes
  MultiSymbolEngine,
  PairsTradingStrategy,
  PortfolioRebalancing,
  
  // Factory functions
  createMultiSymbolEngine
} from "./multi-symbol";

// Jesse Indicators Library
export {
  // Types
  type IndicatorOptions,
  type IndicatorValue,
  type MultiValueIndicator,
  
  // Moving Averages
  sma,
  ema,
  wma,
  hma,
  vwma,
  smma,
  dema,
  tema,
  kama,
  vidya,
  mcginley,
  
  // Momentum
  rsi,
  stochrsi,
  macd,
  ppo,
  stoch,
  willr,
  cci,
  mfi,
  roc,
  momentum,
  cmo,
  ultosc,
  ao,
  tsi,
  
  // Volatility
  atr,
  tr,
  bollingerBands,
  keltnerChannels,
  stddev,
  historicalVolatility,
  
  // Volume
  obv,
  vwap,
  cmf,
  adl,
  
  // Trend
  adx,
  sar,
  aroon,
  ichimoku,
  supertrend,
  
  // Engine
  JesseIndicators,
  
  // Constants
  INDICATOR_COUNT
} from "./indicators";

// ==================== CONVENIENCE EXPORTS ====================

/**
 * Создать полную конфигурацию Jesse для CITARION
 */
export function createJesseIntegration(config?: {
  lookAheadMode?: "strict" | "moderate" | "disabled";
  partialFillsEnabled?: boolean;
  maxOpenPositions?: number;
}): {
  protector: LookAheadProtector;
  fillsEngine: PartialFillsEngine;
  multiSymbolEngine: MultiSymbolEngine;
} {
  const {
    lookAheadMode = "strict",
    partialFillsEnabled = true,
    maxOpenPositions = 5
  } = config || {};

  return {
    protector: new LookAheadProtector({ mode: lookAheadMode }),
    fillsEngine: new PartialFillsEngine({ enabled: partialFillsEnabled }),
    multiSymbolEngine: createMultiSymbolEngine([], { maxOpenPositions })
  };
}

/**
 * Версия модуля
 */
export const JESSE_MODULE_VERSION = "1.0.0";

/**
 * Количество индикаторов
 */
export const TOTAL_INDICATORS = 70;
