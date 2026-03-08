/**
 * Multi-Exchange Arbitrage Module
 * 
 * Provides cross-exchange arbitrage capabilities for CITARION platform.
 */

export * from './multi-exchange';
import { arbitrageScanner, arbitrageExecutor } from './multi-exchange';

export default {
  scanner: arbitrageScanner,
  executor: arbitrageExecutor,
};
