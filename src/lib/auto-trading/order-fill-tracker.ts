/**
 * Order Fill Tracking Service
 * Track order fill status and trigger appropriate actions
 */

import type { Trade, Position } from "@prisma/client";

export type OrderStatus = 
  | "PENDING" 
  | "OPEN" 
  | "PARTIALLY_FILLED" 
  | "FILLED" 
  | "CANCELLED" 
  | "EXPIRED" 
  | "REJECTED";

export type OrderType = "ENTRY" | "TP" | "SL" | "TRAILING_SL";

export interface OrderFillState {
  id: string;
  exchangeOrderId: string;
  clientOrderId: string;
  positionId: string;
  type: OrderType;
  status: OrderStatus;
  
  // Order details
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "LIMIT" | "MARKET" | "STOP_LIMIT";
  price: number;
  amount: number;
  
  // Fill tracking
  filledAmount: number;
  avgFillPrice: number;
  remainingAmount: number;
  fillPercentage: number;
  
  // Retry tracking (for TP Grace)
  retryCount: number;
  maxRetries: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastFillAt: Date | null;
  expiresAt: Date | null;
}

export interface OrderFillEvent {
  orderId: string;
  event: "CREATED" | "PARTIAL_FILL" | "FULL_FILL" | "CANCELLED" | "EXPIRED";
  filledAmount: number;
  fillPrice: number;
  timestamp: Date;
}

export interface OrderFillResult {
  success: boolean;
  state: OrderFillState;
  completed: boolean;
  needsRetry: boolean;
  action?: "UPDATE_PRICE" | "CANCEL" | "NONE";
}

/**
 * Create initial order fill state
 */
export function createOrderFillState(
  positionId: string,
  type: OrderType,
  symbol: string,
  side: "BUY" | "SELL",
  orderType: "LIMIT" | "MARKET" | "STOP_LIMIT",
  price: number,
  amount: number,
  maxRetries: number = 0
): OrderFillState {
  return {
    id: `of-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    exchangeOrderId: "",
    clientOrderId: `client-${Date.now()}`,
    positionId,
    type,
    status: "PENDING",
    symbol,
    side,
    orderType,
    price,
    amount,
    filledAmount: 0,
    avgFillPrice: 0,
    remainingAmount: amount,
    fillPercentage: 0,
    retryCount: 0,
    maxRetries,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastFillAt: null,
    expiresAt: null
  };
}

/**
 * Process fill event
 */
export function processFillEvent(
  state: OrderFillState,
  event: OrderFillEvent
): OrderFillResult {
  if (state.status === "FILLED" || state.status === "CANCELLED") {
    return {
      success: true,
      state,
      completed: state.status === "FILLED",
      needsRetry: false,
      action: "NONE"
    };
  }
  
  // Update fill amounts
  const newFilledAmount = state.filledAmount + event.filledAmount;
  const newRemaining = state.amount - newFilledAmount;
  const newAvgPrice = state.filledAmount > 0
    ? (state.avgFillPrice * state.filledAmount + event.fillPrice * event.filledAmount) / newFilledAmount
    : event.fillPrice;
  
  let newStatus: OrderStatus = state.status;
  let completed = false;
  let needsRetry = false;
  let action: "UPDATE_PRICE" | "CANCEL" | "NONE" = "NONE";
  
  if (event.event === "FULL_FILL" || newRemaining <= 0) {
    newStatus = "FILLED";
    completed = true;
  } else if (event.event === "PARTIAL_FILL") {
    newStatus = "PARTIALLY_FILLED";
    
    // Check if retry needed for TP orders
    if (state.type === "TP" && state.maxRetries > 0) {
      needsRetry = true;
      action = "UPDATE_PRICE";
    }
  } else if (event.event === "CANCELLED") {
    newStatus = "CANCELLED";
    needsRetry = state.type === "TP" && state.retryCount < state.maxRetries;
  } else if (event.event === "EXPIRED") {
    newStatus = "EXPIRED";
    needsRetry = state.type === "TP" && state.retryCount < state.maxRetries;
  }
  
  const newState: OrderFillState = {
    ...state,
    status: newStatus,
    filledAmount: newFilledAmount,
    avgFillPrice: newAvgPrice,
    remainingAmount: Math.max(0, newRemaining),
    fillPercentage: (newFilledAmount / state.amount) * 100,
    retryCount: needsRetry ? state.retryCount + 1 : state.retryCount,
    updatedAt: new Date(),
    lastFillAt: event.event.includes("FILL") ? event.timestamp : state.lastFillAt
  };
  
  return {
    success: true,
    state: newState,
    completed,
    needsRetry,
    action
  };
}

/**
 * Check if order needs price update for retry
 */
export function needsPriceUpdate(
  state: OrderFillState,
  timeoutMs: number
): boolean {
  if (state.status !== "PARTIALLY_FILLED" && state.status !== "OPEN") {
    return false;
  }
  
  if (state.type !== "TP" && state.type !== "ENTRY") {
    return false;
  }
  
  if (state.retryCount >= state.maxRetries) {
    return false;
  }
  
  // Check timeout
  const timeSinceUpdate = Date.now() - state.updatedAt.getTime();
  return timeSinceUpdate >= timeoutMs;
}

/**
 * Calculate fill statistics
 */
export function calculateFillStats(
  orders: OrderFillState[]
): {
  total: number;
  pending: number;
  partial: number;
  filled: number;
  cancelled: number;
  totalAmount: number;
  totalFilled: number;
  avgFillPercentage: number;
} {
  const stats = {
    total: orders.length,
    pending: 0,
    partial: 0,
    filled: 0,
    cancelled: 0,
    totalAmount: 0,
    totalFilled: 0,
    avgFillPercentage: 0
  };
  
  for (const order of orders) {
    stats.totalAmount += order.amount;
    stats.totalFilled += order.filledAmount;
    
    switch (order.status) {
      case "PENDING":
      case "OPEN":
        stats.pending++;
        break;
      case "PARTIALLY_FILLED":
        stats.partial++;
        break;
      case "FILLED":
        stats.filled++;
        break;
      case "CANCELLED":
      case "EXPIRED":
      case "REJECTED":
        stats.cancelled++;
        break;
    }
  }
  
  stats.avgFillPercentage = stats.totalAmount > 0
    ? (stats.totalFilled / stats.totalAmount) * 100
    : 0;
  
  return stats;
}

export default {
  createOrderFillState,
  processFillEvent,
  needsPriceUpdate,
  calculateFillStats
};
