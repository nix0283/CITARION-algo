/**
 * Order Tracking Module
 * 
 * Provides real-time order fill tracking across multiple exchanges.
 * 
 * Components:
 * - FillTracker: Main class for tracking order fills
 * - OrderStateMachine: Manages valid state transitions
 * - Types: All type definitions
 * 
 * Usage:
 * ```typescript
 * import { getFillTracker, FillTrackerEvent } from '@/lib/order-tracking';
 * 
 * const tracker = getFillTracker();
 * await tracker.start();
 * 
 * // Listen for fill events
 * tracker.on('event', (event: FillTrackerEvent) => {
 *   if (event.type === 'ORDER_FILLED') {
 *     console.log('Order filled:', event.orderFill);
 *   }
 * });
 * 
 * // Register a new order
 * tracker.registerOrder({
 *   exchangeOrderId: '12345',
 *   symbol: 'BTCUSDT',
 *   side: 'BUY',
 *   requestedQuantity: 0.1,
 *   status: 'NEW',
 * });
 * 
 * // Process exchange events
 * tracker.processExchangeEvent({
 *   exchange: 'binance',
 *   type: 'ORDER_TRADE_UPDATE',
 *   exchangeOrderId: '12345',
 *   fill: {
 *     price: 50000,
 *     quantity: 0.05,
 *     fee: 0.5,
 *     feeCurrency: 'USDT',
 *     timestamp: new Date(),
 *   },
 *   timestamp: new Date(),
 * });
 * ```
 */

// Main classes
export { FillTracker, getFillTracker, initFillTracker } from './fill-tracker';
export {
  OrderStateMachine,
  OrderStateTransitionHandler,
  BatchStateProcessor,
  VALID_TRANSITIONS,
  EXCHANGE_STATUS_MAP,
} from './order-state-machine';

// Types
export {
  // State types
  OrderState,
  isTerminalState,
  isActiveState,
  
  // Data types
  FillEvent,
  OrderFill,
  ExchangeEvent,
  StateTransition,
  
  // Config types
  FillTrackerConfig,
  DEFAULT_FILL_TRACKER_CONFIG,
  
  // Event types
  FillTrackerEvent,
  
  // Signal/Position types
  SignalEntryFill,
  PositionFillSummary,
  
  // Database types
  OrderFillCreateData,
  OrderFillUpdateData,
} from './types';
