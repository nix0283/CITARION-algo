/**
 * Order Tracking Types
 * 
 * Type definitions for order fill tracking and state management.
 * Supports multiple exchanges with unified interface.
 */

import { ExchangeId } from '../exchange/types';

// ==================== ORDER STATE ====================

/**
 * Possible states of an order
 */
export type OrderState = 
  | 'NEW'
  | 'SUBMITTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

/**
 * Check if an order is in a terminal state
 */
export function isTerminalState(state: OrderState): boolean {
  return state === 'FILLED' || state === 'CANCELLED' || state === 'REJECTED' || state === 'EXPIRED';
}

/**
 * Check if an order is active (may still receive fills)
 */
export function isActiveState(state: OrderState): boolean {
  return state === 'NEW' || state === 'SUBMITTED' || state === 'PARTIALLY_FILLED';
}

// ==================== FILL EVENT ====================

/**
 * Individual fill event from exchange
 */
export interface FillEvent {
  /** Unique ID for this fill */
  id: string;
  /** Exchange-specific trade ID */
  tradeId: string;
  /** Price at which the fill occurred */
  price: number;
  /** Quantity filled in this event */
  quantity: number;
  /** Fee charged for this fill */
  fee: number;
  /** Currency the fee is charged in */
  feeCurrency: string;
  /** Timestamp of the fill */
  timestamp: Date;
  /** Whether this fill was a maker or taker */
  maker?: boolean;
  /** Additional exchange-specific data */
  metadata?: Record<string, unknown>;
}

// ==================== ORDER FILL ====================

/**
 * Comprehensive order fill tracking information
 */
export interface OrderFill {
  /** Internal order ID */
  orderId: string;
  /** Exchange-assigned order ID */
  exchangeOrderId: string;
  /** Client-provided order ID */
  clientOrderId?: string;
  /** Trading symbol */
  symbol: string;
  /** Exchange where the order was placed */
  exchange: ExchangeId;
  /** Order side */
  side: 'BUY' | 'SELL';
  /** Original requested quantity */
  requestedQuantity: number;
  /** Total quantity filled so far */
  filledQuantity: number;
  /** Remaining quantity to be filled */
  remainingQuantity: number;
  /** Weighted average fill price */
  avgFillPrice: number;
  /** Total fees paid */
  totalFees: number;
  /** Currency fees are paid in */
  feeCurrency: string;
  /** Current order state */
  status: OrderState;
  /** Individual fill events */
  fills: FillEvent[];
  /** Order creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** For limit orders, the limit price */
  limitPrice?: number;
  /** Order type */
  orderType: 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TRAILING_STOP';
  /** Position side (for hedge mode) */
  positionSide?: 'LONG' | 'SHORT' | 'BOTH';
  /** Reduce only flag */
  reduceOnly?: boolean;
  /** Whether this is a demo order */
  isDemo?: boolean;
  /** Signal ID that triggered this order (if applicable) */
  signalId?: number;
  /** Position ID this order is associated with */
  positionId?: string;
}

// ==================== EXCHANGE EVENT ====================

/**
 * Event received from exchange WebSocket or REST API
 */
export interface ExchangeEvent {
  /** Exchange that sent the event */
  exchange: ExchangeId;
  /** Event type */
  type: 'ORDER_UPDATE' | 'ORDER_TRADE_UPDATE' | 'ACCOUNT_UPDATE' | 'ORDER_SNAPSHOT';
  /** Symbol (if applicable) */
  symbol?: string;
  /** Exchange order ID */
  exchangeOrderId?: string;
  /** Client order ID */
  clientOrderId?: string;
  /** New status (if applicable) */
  status?: OrderState;
  /** Fill information (for trade updates) */
  fill?: Partial<FillEvent>;
  /** Current cumulative filled quantity */
  cumulativeFilledQuantity?: number;
  /** Current average price */
  averagePrice?: number;
  /** Original quantity */
  originalQuantity?: number;
  /** Remaining quantity */
  remainingQuantity?: number;
  /** Order side */
  side?: 'BUY' | 'SELL';
  /** Order type */
  orderType?: string;
  /** Timestamp of the event */
  timestamp: Date;
  /** Raw event data from exchange */
  rawData?: unknown;
}

// ==================== STATE TRANSITION ====================

/**
 * Represents a valid state transition
 */
export interface StateTransition {
  from: OrderState;
  to: OrderState;
  event: string;
  timestamp: Date;
}

// ==================== FILL TRACKER CONFIG ====================

/**
 * Configuration for FillTracker
 */
export interface FillTrackerConfig {
  /** Whether to persist fill data to database */
  persistFills: boolean;
  /** Whether to emit events on fills */
  emitEvents: boolean;
  /** How often to sync with exchange (ms) */
  syncInterval: number;
  /** Maximum retries for REST API sync */
  maxSyncRetries: number;
  /** Whether to track partial fills */
  trackPartialFills: boolean;
  /** Minimum fill quantity to consider as partial (vs dust) */
  minPartialFillQuantity: number;
}

/**
 * Default configuration for FillTracker
 */
export const DEFAULT_FILL_TRACKER_CONFIG: FillTrackerConfig = {
  persistFills: true,
  emitEvents: true,
  syncInterval: 5000,
  maxSyncRetries: 3,
  trackPartialFills: true,
  minPartialFillQuantity: 0.0001,
};

// ==================== FILL TRACKER EVENTS ====================

/**
 * Events emitted by FillTracker
 */
export type FillTrackerEvent =
  | { type: 'ORDER_CREATED'; orderFill: OrderFill }
  | { type: 'ORDER_UPDATED'; orderFill: OrderFill; previousStatus: OrderState }
  | { type: 'ORDER_FILLED'; orderFill: OrderFill }
  | { type: 'ORDER_PARTIALLY_FILLED'; orderFill: OrderFill; fillEvent: FillEvent }
  | { type: 'ORDER_CANCELLED'; orderFill: OrderFill }
  | { type: 'ORDER_REJECTED'; orderFill: OrderFill; reason?: string }
  | { type: 'ORDER_EXPIRED'; orderFill: OrderFill }
  | { type: 'FILL_RECEIVED'; orderFill: OrderFill; fillEvent: FillEvent }
  | { type: 'SYNC_STARTED'; exchange: ExchangeId }
  | { type: 'SYNC_COMPLETED'; exchange: ExchangeId; ordersUpdated: number }
  | { type: 'SYNC_FAILED'; exchange: ExchangeId; error: string };

// ==================== SIGNAL ENTRY FILL ====================

/**
 * Tracks fill status for signal entry prices
 */
export interface SignalEntryFill {
  /** Signal ID */
  signalId: number;
  /** Entry price index (for multi-entry signals) */
  entryIndex: number;
  /** Entry price */
  entryPrice: number;
  /** Whether this entry level is fully filled */
  isFilled: boolean;
  /** Quantity requested at this level */
  requestedQuantity: number;
  /** Quantity filled at this level */
  filledQuantity: number;
  /** Average actual fill price */
  avgFillPrice: number;
  /** Order IDs associated with this entry */
  orderIds: string[];
  /** Timestamp of first fill */
  firstFillAt?: Date;
  /** Timestamp of complete fill */
  completedAt?: Date;
}

// ==================== POSITION FILL SUMMARY ====================

/**
 * Summary of fills for a position
 */
export interface PositionFillSummary {
  /** Position ID */
  positionId: string;
  /** Signal ID (if applicable) */
  signalId?: number;
  /** Symbol */
  symbol: string;
  /** Direction */
  direction: 'LONG' | 'SHORT';
  /** Total requested quantity across all orders */
  totalRequestedQuantity: number;
  /** Total filled quantity */
  totalFilledQuantity: number;
  /** Overall fill percentage */
  fillPercentage: number;
  /** Weighted average entry price */
  avgEntryPrice: number;
  /** Entry prices with their fill status */
  entryFills: SignalEntryFill[];
  /** Whether all entries are filled */
  allEntriesFilled: boolean;
  /** Total fees paid */
  totalFees: number;
  /** Number of orders */
  orderCount: number;
  /** Number of fills */
  fillCount: number;
}

// ==================== DATABASE MODEL HELPERS ====================

/**
 * Data to create an OrderFill record in the database
 */
export interface OrderFillCreateData {
  id: string;
  orderId: string;
  exchangeOrderId: string;
  clientOrderId?: string;
  symbol: string;
  exchange: string;
  side: string;
  requestedQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  avgFillPrice: number;
  totalFees: number;
  feeCurrency: string;
  status: string;
  fills: string; // JSON string
  createdAt: Date;
  updatedAt: Date;
  orderType: string;
  positionSide?: string;
  reduceOnly?: boolean;
  isDemo?: boolean;
  signalId?: number;
  positionId?: string;
}

/**
 * Data to update an OrderFill record in the database
 */
export interface OrderFillUpdateData {
  filledQuantity?: number;
  remainingQuantity?: number;
  avgFillPrice?: number;
  totalFees?: number;
  status?: string;
  fills?: string;
  updatedAt: Date;
  exchangeOrderId?: string;
}
