"use client";

import { useMemo } from "react";
import { Time } from "lightweight-charts";

export interface OrderMarker {
  id: string;
  time: number;
  price: number;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  status: "PENDING" | "FILLED" | "CANCELLED" | "REJECTED";
  quantity: number;
  filledQuantity?: number;
  avgPrice?: number;
  symbol: string;
  createdAt: number;
  updatedAt?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
}

export interface OrderMarkerConfig {
  showPending: boolean;
  showFilled: boolean;
  showCancelled: boolean;
  showStopOrders: boolean;
  markerSize: number;
}

const DEFAULT_CONFIG: OrderMarkerConfig = {
  showPending: true,
  showFilled: true,
  showCancelled: false,
  showStopOrders: true,
  markerSize: 8,
};

export interface ProcessedMarker {
  time: Time;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
  size: number;
  orderId: string;
  order: OrderMarker;
}

export function useOrderMarkers(
  orders: OrderMarker[],
  config: Partial<OrderMarkerConfig> = {}
): ProcessedMarker[] {
  // Merge config with defaults
  const showPending = config.showPending ?? DEFAULT_CONFIG.showPending;
  const showFilled = config.showFilled ?? DEFAULT_CONFIG.showFilled;
  const showCancelled = config.showCancelled ?? DEFAULT_CONFIG.showCancelled;
  const showStopOrders = config.showStopOrders ?? DEFAULT_CONFIG.showStopOrders;
  const markerSize = config.markerSize ?? DEFAULT_CONFIG.markerSize;

  return useMemo(() => {
    const markers: ProcessedMarker[] = [];

    for (const order of orders) {
      // Skip based on config
      if (!showPending && order.status === "PENDING") continue;
      if (!showFilled && order.status === "FILLED") continue;
      if (!showCancelled && (order.status === "CANCELLED" || order.status === "REJECTED")) continue;
      if (!showStopOrders && (order.type === "STOP" || order.type === "STOP_LIMIT")) continue;

      const isBuy = order.side === "BUY";
      const isFilled = order.status === "FILLED";
      const isPending = order.status === "PENDING";
      const isCancelled = order.status === "CANCELLED" || order.status === "REJECTED";

      // Determine marker color based on status and side
      let color: string;
      if (isCancelled) {
        color = "#6b7280"; // Gray for cancelled
      } else if (isFilled) {
        color = isBuy ? "#26a69a" : "#ef5350"; // Green for filled buy, red for filled sell
      } else if (isPending) {
        color = isBuy ? "#4caf50" : "#f44336"; // Lighter colors for pending
      } else {
        color = "#9ca3af";
      }

      // Determine shape based on order type
      let shape: "arrowUp" | "arrowDown" | "circle" | "square";
      if (order.type === "STOP" || order.type === "STOP_LIMIT") {
        shape = isBuy ? "square" : "square"; // Square for stop orders
      } else if (order.type === "LIMIT") {
        shape = "circle"; // Circle for limit orders
      } else {
        shape = isBuy ? "arrowUp" : "arrowDown"; // Arrow for market orders
      }

      // Build marker text
      const priceStr = order.avgPrice?.toFixed(2) || order.price.toFixed(2);
      const qtyStr = order.filledQuantity 
        ? `${order.filledQuantity.toFixed(4)}/${order.quantity.toFixed(4)}`
        : order.quantity.toFixed(4);
      
      let text = `${order.side} ${qtyStr}`;
      if (order.type !== "MARKET") {
        text += ` @ ${priceStr}`;
      }
      if (order.stopPrice) {
        text += ` Stop: ${order.stopPrice.toFixed(2)}`;
      }
      if (order.reduceOnly) {
        text += " (RO)";
      }

      markers.push({
        time: Math.floor(order.createdAt / 1000) as Time,
        position: isBuy ? "belowBar" : "aboveBar",
        color,
        shape,
        text,
        size: markerSize,
        orderId: order.id,
        order,
      });

      // Add separate marker for stop price if exists
      if (order.stopPrice && showStopOrders) {
        markers.push({
          time: Math.floor(order.createdAt / 1000) as Time,
          position: isBuy ? "aboveBar" : "belowBar",
          color: "#ff9800", // Orange for stop price
          shape: "circle",
          text: `Stop @ ${order.stopPrice.toFixed(2)}`,
          size: markerSize - 2,
          orderId: `${order.id}-stop`,
          order,
        });
      }
    }

    // Sort by time
    return markers.sort((a, b) => (a.time as number) - (b.time as number));
  }, [orders, showPending, showFilled, showCancelled, showStopOrders, markerSize]);
}

export function getOrderMarkersForChart(
  orders: OrderMarker[],
  config: Partial<OrderMarkerConfig> = {}
): Array<{
  time: Time;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const markers: ProcessedMarker[] = [];

  for (const order of orders) {
    if (!cfg.showPending && order.status === "PENDING") continue;
    if (!cfg.showFilled && order.status === "FILLED") continue;
    if (!cfg.showCancelled && (order.status === "CANCELLED" || order.status === "REJECTED")) continue;
    if (!cfg.showStopOrders && (order.type === "STOP" || order.type === "STOP_LIMIT")) continue;

    const isBuy = order.side === "BUY";
    const isFilled = order.status === "FILLED";
    const isPending = order.status === "PENDING";
    const isCancelled = order.status === "CANCELLED" || order.status === "REJECTED";

    let color: string;
    if (isCancelled) {
      color = "#6b7280";
    } else if (isFilled) {
      color = isBuy ? "#26a69a" : "#ef5350";
    } else if (isPending) {
      color = isBuy ? "#4caf50" : "#f44336";
    } else {
      color = "#9ca3af";
    }

    let shape: "arrowUp" | "arrowDown" | "circle" | "square";
    if (order.type === "STOP" || order.type === "STOP_LIMIT") {
      shape = "square";
    } else if (order.type === "LIMIT") {
      shape = "circle";
    } else {
      shape = isBuy ? "arrowUp" : "arrowDown";
    }

    const priceStr = order.avgPrice?.toFixed(2) || order.price.toFixed(2);
    const qtyStr = order.filledQuantity 
      ? `${order.filledQuantity.toFixed(4)}/${order.quantity.toFixed(4)}`
      : order.quantity.toFixed(4);
    
    let text = `${order.side} ${qtyStr}`;
    if (order.type !== "MARKET") {
      text += ` @ ${priceStr}`;
    }

    markers.push({
      time: Math.floor(order.createdAt / 1000) as Time,
      position: isBuy ? "belowBar" : "aboveBar",
      color,
      shape,
      text,
      size: cfg.markerSize,
      orderId: order.id,
      order,
    });
  }

  return markers.map((m) => ({
    time: m.time,
    position: m.position,
    color: m.color,
    shape: m.shape,
    text: m.text,
  }));
}

// Helper function to create order from trade data
export function createOrderMarkerFromTrade(trade: {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  type: "MARKET" | "LIMIT";
  timestamp: number;
}): OrderMarker {
  return {
    id: trade.id,
    time: Math.floor(trade.timestamp / 1000),
    price: trade.price,
    side: trade.side,
    type: trade.type,
    status: "FILLED",
    quantity: trade.quantity,
    filledQuantity: trade.quantity,
    avgPrice: trade.price,
    symbol: trade.symbol,
    createdAt: trade.timestamp,
  };
}

// Statistics from order markers
export function getOrderMarkerStats(orders: OrderMarker[]) {
  const stats = {
    total: orders.length,
    pending: 0,
    filled: 0,
    cancelled: 0,
    buyOrders: 0,
    sellOrders: 0,
    totalVolume: 0,
    averageFillPrice: 0,
  };

  let totalFillPrice = 0;
  let fillCount = 0;

  for (const order of orders) {
    stats.total++;
    
    if (order.status === "PENDING") stats.pending++;
    else if (order.status === "FILLED") {
      stats.filled++;
      if (order.avgPrice) {
        totalFillPrice += order.avgPrice * (order.filledQuantity || order.quantity);
        fillCount += order.filledQuantity || order.quantity;
      }
    }
    else if (order.status === "CANCELLED" || order.status === "REJECTED") stats.cancelled++;

    if (order.side === "BUY") stats.buyOrders++;
    else stats.sellOrders++;

    stats.totalVolume += order.quantity * order.price;
  }

  stats.averageFillPrice = fillCount > 0 ? totalFillPrice / fillCount : 0;

  return stats;
}
