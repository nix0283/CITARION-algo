/**
 * Argus Bot Whale Tracker
 */

export interface WhaleOrder {
  id: string;
  timestamp: Date;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  amount: number;
  value: number;
  exchange: string;
  detectedAt: Date;
}

export interface WhaleActivity {
  symbol: string;
  buyCount: number;
  sellCount: number;
  buyValue: number;
  sellValue: number;
  netValue: number;
  largestBuy: number;
  largestSell: number;
  recentOrders: WhaleOrder[];
}

export interface WhaleTrackerConfig {
  minValueUsdt: number;
  lookbackMinutes: number;
  alertThreshold: number;
}

const DEFAULT_CONFIG: WhaleTrackerConfig = {
  minValueUsdt: 100000,
  lookbackMinutes: 60,
  alertThreshold: 500000,
};

export class WhaleTracker {
  private config: WhaleTrackerConfig;
  private orders: Map<string, WhaleOrder[]> = new Map();

  constructor(config: Partial<WhaleTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  trackOrder(order: Omit<WhaleOrder, "id" | "detectedAt">): WhaleOrder | null {
    if (order.value < this.config.minValueUsdt) return null;

    const whaleOrder: WhaleOrder = {
      ...order,
      id: `whale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      detectedAt: new Date(),
    };

    if (!this.orders.has(order.symbol)) {
      this.orders.set(order.symbol, []);
    }
    this.orders.get(order.symbol)!.push(whaleOrder);
    this.cleanOldOrders(order.symbol);

    return whaleOrder;
  }

  getActivity(symbol: string): WhaleActivity {
    const orders = this.orders.get(symbol) || [];
    const cutoff = Date.now() - this.config.lookbackMinutes * 60 * 1000;

    const recentOrders = orders.filter(o => o.timestamp.getTime() >= cutoff);
    const buys = recentOrders.filter(o => o.side === "BUY");
    const sells = recentOrders.filter(o => o.side === "SELL");

    return {
      symbol,
      buyCount: buys.length,
      sellCount: sells.length,
      buyValue: buys.reduce((sum, o) => sum + o.value, 0),
      sellValue: sells.reduce((sum, o) => sum + o.value, 0),
      netValue: buys.reduce((sum, o) => sum + o.value, 0) - sells.reduce((sum, o) => sum + o.value, 0),
      largestBuy: buys.length > 0 ? Math.max(...buys.map(o => o.value)) : 0,
      largestSell: sells.length > 0 ? Math.max(...sells.map(o => o.value)) : 0,
      recentOrders: recentOrders.slice(-20),
    };
  }

  checkAlert(symbol: string): { alert: boolean; type: "BUY" | "SELL" | "NONE"; value: number } {
    const activity = this.getActivity(symbol);
    if (activity.buyValue >= this.config.alertThreshold) return { alert: true, type: "BUY", value: activity.buyValue };
    if (activity.sellValue >= this.config.alertThreshold) return { alert: true, type: "SELL", value: activity.sellValue };
    return { alert: false, type: "NONE", value: 0 };
  }

  getSentiment(symbol: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
    const activity = this.getActivity(symbol);
    const netFlow = activity.netValue;
    const totalFlow = activity.buyValue + activity.sellValue;
    if (totalFlow === 0) return "NEUTRAL";
    const flowRatio = netFlow / totalFlow;
    if (flowRatio > 0.3) return "BULLISH";
    if (flowRatio < -0.3) return "BEARISH";
    return "NEUTRAL";
  }

  private cleanOldOrders(symbol: string): void {
    const orders = this.orders.get(symbol);
    if (!orders) return;
    const cutoff = Date.now() - this.config.lookbackMinutes * 60 * 1000;
    this.orders.set(symbol, orders.filter(o => o.timestamp.getTime() >= cutoff));
  }

  clear(): void { this.orders.clear(); }
}
