/**
 * Auto-Trading Services Index
 * Export all Cornix-compatible auto-trading services
 */

// First Entry as Market
export {
  type FirstEntryMode,
  type FirstEntryStatus,
  type FirstEntryConfig,
  type FirstEntryState,
  type FirstEntryResult,
  calculateCappedPrice,
  calculateNextIterationPrice,
  isPriceWithinCap,
  validateFirstEntryConfig,
  createFirstEntryState,
  processFirstEntryIteration,
  isTPBeforeEntry,
  executeFirstEntryAsMarket
} from "./first-entry-market";

// TP Grace
export {
  type TPGraceConfig,
  type TPTarget,
  type TPGraceState,
  type TPGraceResult,
  calculateGracePrice,
  needsGraceRetry,
  validateTPGraceConfig,
  createTPGraceState,
  processTPGraceForTarget,
  processAllTPGrace,
  getTPTargetSummary,
  executeTPGrace
} from "./tp-grace";

// Trailing Stop
export {
  type TrailingType,
  type TrailingTriggerType,
  type TrailingStatus,
  type TrailingStopConfig,
  type TrailingStopState,
  type TrailingStopResult,
  validateTrailingConfig,
  shouldTriggerTrailing,
  calculateTrailingSL,
  createTrailingStopState,
  updatePriceTracking,
  processTrailingStop,
  TRAILING_PRESETS
} from "./trailing-stop";

// Trailing Entry
export {
  type TrailingEntryStatus,
  type TrailingEntryConfig,
  type TrailingEntryState,
  type TrailingEntryResult,
  calculateTrailingEntryPrice,
  shouldActivateTrailingEntry,
  processTrailingEntry
} from "./trailing-entry";

// Trailing TP
export {
  type TrailingTPStatus,
  type TrailingTPConfig,
  type TrailingTPState,
  calculateTrailingTPPrice,
  processTrailingTP
} from "./trailing-tp";

// Moving TP
export {
  type MovingTPBaseline,
  type MovingTPConfig,
  type MovingTPState,
  calculateMovingTPs,
  updateMovingTP
} from "./moving-tp";

// Entry Strategy
export {
  type EntryStrategyType,
  type EntryStrategyConfig,
  type EntryTarget,
  calculateEntryWeights,
  generateEntryTargets,
  validateEntryStrategyConfig
} from "./entry-strategy";

// TP Strategy
export {
  type TPStrategyType,
  type TPStrategyConfig,
  type TPTarget as TPTargetConfig,
  calculateTPWeights,
  generateTPTargets,
  validateTPStrategyConfig
} from "./tp-strategy";

// Signal Filter
export {
  type SignalFilterConfig,
  type SignalFilterResult,
  calculateRR,
  filterSignal,
  scoreSignal
} from "./signal-filter";

// Position Monitor
export {
  type PositionStatus,
  type PositionMonitorState,
  type EntryOrderState,
  type TPOrderState,
  type SLOrderState,
  createPositionMonitorState,
  updatePositionAfterEntryFill,
  updatePositionAfterTPFill,
  updateUnrealizedPnL,
  calculatePositionHealth
} from "./position-monitor";

// Order Fill Tracker
export {
  type OrderStatus,
  type OrderType,
  type OrderFillState,
  type OrderFillEvent,
  type OrderFillResult,
  createOrderFillState,
  processFillEvent,
  needsPriceUpdate,
  calculateFillStats
} from "./order-fill-tracker";

// Exchange Order
export {
  type ExchangeId,
  type TradingMode,
  type ExchangeOrderConfig,
  type ExchangeOrder,
  type ExchangeOrderResult,
  type ExchangeBalance,
  type ExchangePosition,
  getExchangeBaseUrl,
  exchangeHasTestnet,
  exchangeHasDemo,
  placeOrder,
  cancelOrder,
  getOrderStatus,
  getBalances,
  getPositions,
  setLeverage
} from "./exchange-order";

// Re-export default objects for convenience
import FirstEntryMarket from "./first-entry-market";
import TPGrace from "./tp-grace";
import TrailingStop from "./trailing-stop";
import TrailingEntry from "./trailing-entry";
import TrailingTP from "./trailing-tp";
import MovingTP from "./moving-tp";
import EntryStrategy from "./entry-strategy";
import TPStrategy from "./tp-strategy";
import SignalFilter from "./signal-filter";
import PositionMonitor from "./position-monitor";
import OrderFillTracker from "./order-fill-tracker";
import ExchangeOrder from "./exchange-order";

export const services = {
  firstEntryMarket: FirstEntryMarket,
  tpGrace: TPGrace,
  trailingStop: TrailingStop,
  trailingEntry: TrailingEntry,
  trailingTP: TrailingTP,
  movingTP: MovingTP,
  entryStrategy: EntryStrategy,
  tpStrategy: TPStrategy,
  signalFilter: SignalFilter,
  positionMonitor: PositionMonitor,
  orderFillTracker: OrderFillTracker,
  exchangeOrder: ExchangeOrder
};

export default services;
