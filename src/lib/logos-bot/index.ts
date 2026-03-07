/**
 * LOGOS Meta Bot
 * 
 * Signal aggregation, trade journaling, and pattern detection.
 */

export {
  LOGOSEngine,
  LOGOS_BOT_METADATA,
  DEFAULT_AGGREGATION_CONFIG,
  SignalAggregator,
} from './engine'

export type {
  IncomingSignal,
  AggregatedSignal,
  SignalContribution,
  BotPerformance,
  AggregationConfig,
} from './engine'

// Trade Journal & Pattern Detection
export { TradeJournal, PatternDetector } from './enhancements'

export type {
  JournalEntry,
  JournalStats,
  BotJournalStats,
  SymbolJournalStats,
  DetectedPattern,
  PatternType,
  PatternPerformance,
} from './enhancements'
