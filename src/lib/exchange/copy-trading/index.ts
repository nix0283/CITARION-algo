/**
 * Copy Trading Module
 * 
 * Export all Copy Trading implementations for each exchange
 * Includes both Follower and Master Trader functionality
 */

// Legacy Copy Trading (Follower perspective)
export { BinanceCopyTrading } from './binance-copy-trading';
export { BybitCopyTrading } from './bybit-copy-trading';
export { OKXCopyTrading } from './okx-copy-trading';
export { BitgetCopyTrading } from './bitget-copy-trading';
export { BingXCopyTrading } from './bingx-copy-trading';

// Master Trader (Lead Trader) implementations
export { OKXMasterTrader } from './okx-master-trader';
export { BitgetMasterTrader } from './bitget-master-trader';
export { BinanceMasterTrader } from './binance-master-trader';
export { BybitMasterTrader } from './bybit-master-trader';
export { BingXMasterTrader } from './bingx-master-trader';

// Re-export types
export type {
  CopyTraderStats,
  CopyTraderPosition,
  CopyTraderTrade,
  CopyFollowerSettings,
  CopyFollowerInfo,
  CopyTraderProfitSummary,
  CopySubscribeParams,
  CopyTradingResult,
  LeadTraderStatus,
  CopyTradingSymbol,
  CopyClosePositionParams,
  CopyModifyTpslParams,
  // Master Trader types
  MasterTraderApplication,
  MasterTraderSettings,
  MasterFollowerInfo,
  MasterProfitSummary,
  MasterTraderPosition,
  MasterTraderResult,
} from '../types';
