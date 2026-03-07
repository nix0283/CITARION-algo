/**
 * Position Monitoring Service
 * Real-time position monitoring for auto-trading features
 */

import type { Position, Trade } from "@prisma/client";

export type PositionStatus = 
  | "PENDING" 
  | "OPENING" 
  | "ACTIVE" 
  | "CLOSING" 
  | "CLOSED" 
  | "LIQUIDATED";

export interface PositionMonitorState {
  id: string;
  positionId: string;
  status: PositionStatus;
  
  // Entry tracking
  entryOrders: EntryOrderState[];
  totalEntryAmount: number;
  filledEntryAmount: number;
  avgEntryPrice: number;
  
  // Exit tracking
  tpOrders: TPOrderState[];
  slOrder: SLOrderState | null;
  
  // PnL
  unrealizedPnL: number;
  realizedPnL: number;
  
  // Risk metrics
  currentLeverage: number;
  liquidationPrice: number;
  marginUsed: number;
  
  // Timing
  openedAt: Date;
  lastUpdate: Date;
}

export interface EntryOrderState {
  id: string;
  price: number;
  amount: number;
  filledAmount: number;
  status: "PENDING" | "PARTIAL" | "FILLED" | "CANCELLED";
  type: "LIMIT" | "MARKET";
}

export interface TPOrderState {
  id: string;
  price: number;
  amount: number;
  filledAmount: number;
  retryCount: number;
  status: "PENDING" | "PARTIAL" | "FILLED" | "GRACE_ACTIVE";
}

export interface SLOrderState {
  id: string;
  price: number;
  amount: number;
  trailing: boolean;
  trailingType?: string;
  status: "PENDING" | "TRIGGERED" | "FILLED";
}

/**
 * Create initial position monitor state
 */
export function createPositionMonitorState(
  positionId: string,
  entryOrders: EntryOrderState[],
  tpOrders: TPOrderState[],
  slOrder: SLOrderState | null
): PositionMonitorState {
  return {
    id: `pm-${Date.now()}`,
    positionId,
    status: "OPENING",
    entryOrders,
    totalEntryAmount: entryOrders.reduce((sum, o) => sum + o.amount, 0),
    filledEntryAmount: 0,
    avgEntryPrice: 0,
    tpOrders,
    slOrder,
    unrealizedPnL: 0,
    realizedPnL: 0,
    currentLeverage: 1,
    liquidationPrice: 0,
    marginUsed: 0,
    openedAt: new Date(),
    lastUpdate: new Date()
  };
}

/**
 * Update position after entry fill
 */
export function updatePositionAfterEntryFill(
  state: PositionMonitorState,
  orderId: string,
  filledAmount: number,
  fillPrice: number
): PositionMonitorState {
  const orderIndex = state.entryOrders.findIndex(o => o.id === orderId);
  if (orderIndex === -1) return state;
  
  const orders = [...state.entryOrders];
  orders[orderIndex] = {
    ...orders[orderIndex],
    filledAmount: orders[orderIndex].filledAmount + filledAmount,
    status: orders[orderIndex].filledAmount + filledAmount >= orders[orderIndex].amount
      ? "FILLED"
      : "PARTIAL"
  };
  
  const totalFilled = state.filledEntryAmount + filledAmount;
  const newAvgEntry = state.filledEntryAmount > 0
    ? (state.avgEntryPrice * state.filledEntryAmount + fillPrice * filledAmount) / totalFilled
    : fillPrice;
  
  const allFilled = orders.every(o => o.status === "FILLED");
  
  return {
    ...state,
    status: allFilled ? "ACTIVE" : "OPENING",
    entryOrders: orders,
    filledEntryAmount: totalFilled,
    avgEntryPrice: newAvgEntry,
    lastUpdate: new Date()
  };
}

/**
 * Update position after TP fill
 */
export function updatePositionAfterTPFill(
  state: PositionMonitorState,
  orderId: string,
  filledAmount: number,
  fillPrice: number
): PositionMonitorState {
  const orderIndex = state.tpOrders.findIndex(o => o.id === orderId);
  if (orderIndex === -1) return state;
  
  const orders = [...state.tpOrders];
  orders[orderIndex] = {
    ...orders[orderIndex],
    filledAmount: orders[orderIndex].filledAmount + filledAmount,
    status: orders[orderIndex].filledAmount + filledAmount >= orders[orderIndex].amount
      ? "FILLED"
      : "PARTIAL"
  };
  
  // Calculate realized PnL
  const pnl = (fillPrice - state.avgEntryPrice) * filledAmount;
  const newRealizedPnL = state.realizedPnL + pnl;
  
  // Check if all TPs filled
  const allTPFilled = orders.every(o => o.status === "FILLED");
  
  return {
    ...state,
    status: allTPFilled ? "CLOSED" : state.status,
    tpOrders: orders,
    realizedPnL: newRealizedPnL,
    lastUpdate: new Date()
  };
}

/**
 * Update unrealized PnL
 */
export function updateUnrealizedPnL(
  state: PositionMonitorState,
  currentPrice: number,
  direction: "LONG" | "SHORT"
): PositionMonitorState {
  const remainingPosition = state.filledEntryAmount - 
    state.tpOrders.reduce((sum, o) => sum + o.filledAmount, 0);
  
  let unrealizedPnL = 0;
  if (remainingPosition > 0) {
    unrealizedPnL = direction === "LONG"
      ? (currentPrice - state.avgEntryPrice) * remainingPosition
      : (state.avgEntryPrice - currentPrice) * remainingPosition;
  }
  
  return {
    ...state,
    unrealizedPnL,
    lastUpdate: new Date()
  };
}

/**
 * Calculate position health
 */
export function calculatePositionHealth(
  state: PositionMonitorState,
  currentPrice: number,
  direction: "LONG" | "SHORT"
): {
  health: "HEALTHY" | "WARNING" | "CRITICAL";
  metrics: {
    pnlPercent: number;
    distanceToSL: number;
    distanceToLiquidation: number;
    fillRatio: number;
  };
} {
  const remainingPosition = state.filledEntryAmount - 
    state.tpOrders.reduce((sum, o) => sum + o.filledAmount, 0);
  
  const pnlPercent = remainingPosition > 0
    ? (state.unrealizedPnL / (state.avgEntryPrice * remainingPosition)) * 100
    : 0;
  
  const distanceToSL = state.slOrder
    ? Math.abs(currentPrice - state.slOrder.price) / currentPrice * 100
    : 100;
  
  const distanceToLiquidation = Math.abs(currentPrice - state.liquidationPrice) / currentPrice * 100;
  
  const fillRatio = state.filledEntryAmount / state.totalEntryAmount;
  
  let health: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";
  
  if (distanceToSL < 1 || distanceToLiquidation < 5) {
    health = "CRITICAL";
  } else if (distanceToSL < 3 || distanceToLiquidation < 10 || pnlPercent < -10) {
    health = "WARNING";
  }
  
  return {
    health,
    metrics: {
      pnlPercent,
      distanceToSL,
      distanceToLiquidation,
      fillRatio
    }
  };
}

export default {
  createPositionMonitorState,
  updatePositionAfterEntryFill,
  updatePositionAfterTPFill,
  updateUnrealizedPnL,
  calculatePositionHealth
};
