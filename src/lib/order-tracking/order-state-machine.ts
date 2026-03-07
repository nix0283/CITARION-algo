/**
 * Order State Machine
 * 
 * Manages valid state transitions for orders across all supported exchanges.
 * Implements a finite state machine pattern to ensure consistent order lifecycle.
 * 
 * Valid Transitions:
 * NEW -> SUBMITTED -> PARTIALLY_FILLED -> FILLED
 * NEW -> SUBMITTED -> CANCELLED
 * NEW -> REJECTED
 * SUBMITTED -> CANCELLED
 * PARTIALLY_FILLED -> FILLED
 * PARTIALLY_FILLED -> CANCELLED
 * Any active state -> EXPIRED
 */

import { OrderState, ExchangeEvent, StateTransition, isTerminalState, isActiveState } from './types';
import { ExchangeId } from '../exchange/types';

// ==================== TRANSITION RULES ====================

/**
 * Defines valid state transitions
 * Key: current state, Value: set of valid next states
 */
const VALID_TRANSITIONS: Record<OrderState, Set<OrderState>> = {
  'NEW': new Set(['SUBMITTED', 'REJECTED', 'EXPIRED']),
  'SUBMITTED': new Set(['PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED']),
  'PARTIALLY_FILLED': new Set(['FILLED', 'CANCELLED', 'EXPIRED']),
  'FILLED': new Set(), // Terminal state
  'CANCELLED': new Set(), // Terminal state
  'REJECTED': new Set(), // Terminal state
  'EXPIRED': new Set(), // Terminal state
};

/**
 * Exchange-specific status mappings
 * Maps exchange status strings to our unified OrderState
 */
const EXCHANGE_STATUS_MAP: Record<string, Record<string, OrderState>> = {
  binance: {
    'NEW': 'NEW',
    'PARTIALLY_FILLED': 'PARTIALLY_FILLED',
    'FILLED': 'FILLED',
    'CANCELED': 'CANCELLED',
    'PENDING_CANCEL': 'CANCELLED',
    'REJECTED': 'REJECTED',
    'EXPIRED': 'EXPIRED',
    'EXPIRED_IN_MATCH': 'EXPIRED',
  },
  bybit: {
    'Created': 'NEW',
    'New': 'SUBMITTED',
    'PartiallyFilled': 'PARTIALLY_FILLED',
    'Filled': 'FILLED',
    'Cancelled': 'CANCELLED',
    'Rejected': 'REJECTED',
    'Deactivated': 'EXPIRED',
    'Untriggered': 'NEW',
    'Triggered': 'SUBMITTED',
  },
  okx: {
    'canceled': 'CANCELLED',
    'live': 'SUBMITTED',
    'partially_filled': 'PARTIALLY_FILLED',
    'filled': 'FILLED',
    'failed': 'REJECTED',
    'expired': 'EXPIRED',
  },
  bitget: {
    'init': 'NEW',
    'new': 'SUBMITTED',
    'partial_fill': 'PARTIALLY_FILLED',
    'full_fill': 'FILLED',
    'cancelled': 'CANCELLED',
    'fail': 'REJECTED',
  },
  bingx: {
    '1': 'NEW', // Pending
    '2': 'SUBMITTED', // Open
    '3': 'PARTIALLY_FILLED', // Partially filled
    '4': 'FILLED', // Filled
    '5': 'CANCELLED', // Cancelled
    '6': 'REJECTED', // Failed
  },
};

// ==================== ORDER STATE MACHINE CLASS ====================

/**
 * Order State Machine
 * 
 * Handles state transitions and validation for orders
 */
export class OrderStateMachine {
  private transitions: StateTransition[] = [];
  private currentState: OrderState;

  constructor(initialState: OrderState = 'NEW') {
    this.currentState = initialState;
  }

  /**
   * Get current state
   */
  getState(): OrderState {
    return this.currentState;
  }

  /**
   * Check if transition is valid
   */
  canTransition(from: OrderState, to: OrderState): boolean {
    const validNextStates = VALID_TRANSITIONS[from];
    return validNextStates ? validNextStates.has(to) : false;
  }

  /**
   * Attempt to transition to a new state
   * Returns true if successful, false if invalid transition
   */
  transition(to: OrderState, event: string = ''): boolean {
    if (!this.canTransition(this.currentState, to)) {
      console.warn(
        `[OrderStateMachine] Invalid transition: ${this.currentState} -> ${to}`
      );
      return false;
    }

    const transition: StateTransition = {
      from: this.currentState,
      to,
      event,
      timestamp: new Date(),
    };

    this.transitions.push(transition);
    this.currentState = to;

    return true;
  }

  /**
   * Force transition without validation
   * Use only for recovery scenarios
   */
  forceTransition(to: OrderState, reason: string = 'forced'): void {
    const transition: StateTransition = {
      from: this.currentState,
      to,
      event: `forced:${reason}`,
      timestamp: new Date(),
    };

    this.transitions.push(transition);
    this.currentState = to;
  }

  /**
   * Get transition history
   */
  getTransitions(): StateTransition[] {
    return [...this.transitions];
  }

  /**
   * Check if in terminal state
   */
  isTerminal(): boolean {
    return isTerminalState(this.currentState);
  }

  /**
   * Check if order is active
   */
  isActive(): boolean {
    return isActiveState(this.currentState);
  }

  /**
   * Check if order has any fills
   */
  hasFills(): boolean {
    return this.currentState === 'PARTIALLY_FILLED' || this.currentState === 'FILLED';
  }

  /**
   * Get valid next states
   */
  getValidNextStates(): OrderState[] {
    const validStates = VALID_TRANSITIONS[this.currentState];
    return validStates ? Array.from(validStates) : [];
  }
}

// ==================== STATE TRANSITION HANDLER ====================

/**
 * Handles exchange events and determines state transitions
 */
export class OrderStateTransitionHandler {
  /**
   * Map exchange-specific status to unified OrderState
   */
  static mapExchangeStatus(
    exchange: ExchangeId,
    exchangeStatus: string
  ): OrderState {
    const statusMap = EXCHANGE_STATUS_MAP[exchange];
    if (!statusMap) {
      console.warn(
        `[OrderStateMachine] Unknown exchange: ${exchange}, defaulting to SUBMITTED`
      );
      return 'SUBMITTED';
    }

    const mappedState = statusMap[exchangeStatus];
    if (!mappedState) {
      console.warn(
        `[OrderStateMachine] Unknown status for ${exchange}: ${exchangeStatus}, defaulting to SUBMITTED`
      );
      return 'SUBMITTED';
    }

    return mappedState;
  }

  /**
   * Process an exchange event and determine the new state
   */
  static processEvent(
    currentState: OrderState,
    event: ExchangeEvent
  ): { newState: OrderState; validTransition: boolean } {
    // If the event provides a status, use it
    if (event.status) {
      const machine = new OrderStateMachine(currentState);
      const valid = machine.transition(event.status, `event:${event.type}`);
      return {
        newState: machine.getState(),
        validTransition: valid,
      };
    }

    // Determine state based on event type and fill information
    switch (event.type) {
      case 'ORDER_UPDATE':
        return this.processOrderUpdate(currentState, event);

      case 'ORDER_TRADE_UPDATE':
        return this.processTradeUpdate(currentState, event);

      case 'ORDER_SNAPSHOT':
        return this.processSnapshot(currentState, event);

      case 'ACCOUNT_UPDATE':
        return this.processAccountUpdate(currentState, event);

      default:
        return { newState: currentState, validTransition: false };
    }
  }

  /**
   * Process ORDER_UPDATE event
   */
  private static processOrderUpdate(
    currentState: OrderState,
    event: ExchangeEvent
  ): { newState: OrderState; validTransition: boolean } {
    // Calculate fill percentage
    const totalQty = event.originalQuantity || 0;
    const filledQty = event.cumulativeFilledQuantity || 0;
    const remainingQty = event.remainingQuantity || totalQty - filledQty;

    let newState: OrderState;

    if (filledQty <= 0) {
      // No fills yet
      newState = currentState === 'NEW' ? 'SUBMITTED' : currentState;
    } else if (remainingQty > 0 && filledQty < totalQty) {
      // Partially filled
      newState = 'PARTIALLY_FILLED';
    } else if (filledQty >= totalQty && totalQty > 0) {
      // Fully filled
      newState = 'FILLED';
    } else {
      // Unknown state, keep current
      newState = currentState;
    }

    const machine = new OrderStateMachine(currentState);
    const valid = machine.transition(newState, 'order_update');
    return { newState: machine.getState(), validTransition: valid };
  }

  /**
   * Process ORDER_TRADE_UPDATE event (fill event)
   */
  private static processTradeUpdate(
    currentState: OrderState,
    event: ExchangeEvent
  ): { newState: OrderState; validTransition: boolean } {
    // Trade updates indicate fills
    const totalQty = event.originalQuantity || 0;
    const filledQty = event.cumulativeFilledQuantity || 0;

    let newState: OrderState;

    if (filledQty >= totalQty && totalQty > 0) {
      newState = 'FILLED';
    } else if (filledQty > 0) {
      newState = 'PARTIALLY_FILLED';
    } else {
      newState = currentState;
    }

    const machine = new OrderStateMachine(currentState);
    const valid = machine.transition(newState, 'trade_update');
    return { newState: machine.getState(), validTransition: valid };
  }

  /**
   * Process ORDER_SNAPSHOT event
   */
  private static processSnapshot(
    currentState: OrderState,
    event: ExchangeEvent
  ): { newState: OrderState; validTransition: boolean } {
    // Snapshot provides full order state - use it directly
    if (event.status) {
      return { newState: event.status, validTransition: true };
    }

    // Calculate based on quantities
    return this.processOrderUpdate(currentState, event);
  }

  /**
   * Process ACCOUNT_UPDATE event
   */
  private static processAccountUpdate(
    currentState: OrderState,
    event: ExchangeEvent
  ): { newState: OrderState; validTransition: boolean } {
    // Account updates may contain position changes
    // For now, just return current state
    return { newState: currentState, validTransition: false };
  }
}

// ==================== BATCH STATE PROCESSOR ====================

/**
 * Process multiple orders at once
 */
export class BatchStateProcessor {
  /**
   * Process multiple events and return updated states
   */
  static processBatch(
    orders: Map<string, OrderState>,
    events: ExchangeEvent[]
  ): Map<string, { newState: OrderState; changed: boolean }> {
    const results = new Map<string, { newState: OrderState; changed: boolean }>();

    for (const event of events) {
      const orderId = event.exchangeOrderId || event.clientOrderId;
      if (!orderId) continue;

      const currentState = orders.get(orderId);
      if (!currentState) continue;

      const result = OrderStateTransitionHandler.processEvent(currentState, event);
      results.set(orderId, {
        newState: result.newState,
        changed: result.newState !== currentState,
      });
    }

    return results;
  }
}

// ==================== EXPORTS ====================

export { VALID_TRANSITIONS, EXCHANGE_STATUS_MAP };
export default OrderStateMachine;
