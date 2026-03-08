/**
 * Argus Bot Orderbook Analyzer
 * 
 * Анализ стакана для подтверждения пампов и дампов.
 */

export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: Date;
}

export interface OrderbookMetrics {
  bidVolume: number;
  askVolume: number;
  imbalance: number;
  largeBids: number;
  largeAsks: number;
  bidWall: number | null;
  askWall: number | null;
  spreadPercent: number;
  depth: number;
}

export interface OrderbookSignal {
  type: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  reason: string;
  metrics: OrderbookMetrics;
}

export interface OrderbookAnalyzerConfig {
  largeOrderThreshold: number;
  depthLevels: number;
  wallThreshold: number;
}

const DEFAULT_CONFIG: OrderbookAnalyzerConfig = {
  largeOrderThreshold: 10000,
  depthLevels: 20,
  wallThreshold: 3,
};

export class OrderbookAnalyzer {
  private config: OrderbookAnalyzerConfig;
  private history: OrderbookMetrics[] = [];
  private maxHistoryLength = 100;

  constructor(config: Partial<OrderbookAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  analyze(orderbook: OrderbookData): OrderbookMetrics {
    const bids = orderbook.bids.slice(0, this.config.depthLevels);
    const asks = orderbook.asks.slice(0, this.config.depthLevels);

    const bidVolume = bids.reduce((sum, b) => sum + b.price * b.quantity, 0);
    const askVolume = asks.reduce((sum, a) => sum + a.price * a.quantity, 0);
    const totalVolume = bidVolume + askVolume;

    const imbalance = totalVolume > 0 ? (bidVolume - askVolume) / totalVolume : 0;

    const largeBids = bids.filter(b => b.price * b.quantity >= this.config.largeOrderThreshold).length;
    const largeAsks = asks.filter(a => a.price * a.quantity >= this.config.largeOrderThreshold).length;

    const bidWall = this.findWall(bids);
    const askWall = this.findWall(asks);

    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const spreadPercent = bestBid > 0 ? ((bestAsk - bestBid) / bestBid) * 100 : 0;

    const depth = bidVolume + askVolume;

    const metrics: OrderbookMetrics = {
      bidVolume, askVolume, imbalance, largeBids, largeAsks,
      bidWall, askWall, spreadPercent, depth,
    };

    this.history.push(metrics);
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }

    return metrics;
  }

  generateSignal(metrics: OrderbookMetrics): OrderbookSignal {
    const reasons: string[] = [];
    let bullishScore = 0;
    let bearishScore = 0;

    if (metrics.imbalance > 0.3) {
      bullishScore += 30;
      reasons.push(`Strong bid imbalance (${(metrics.imbalance * 100).toFixed(1)}%)`);
    } else if (metrics.imbalance < -0.3) {
      bearishScore += 30;
      reasons.push(`Strong ask imbalance (${(metrics.imbalance * 100).toFixed(1)}%)`);
    }

    if (metrics.largeBids > metrics.largeAsks * 2) {
      bullishScore += 25;
      reasons.push(`Many large bids (${metrics.largeBids} vs ${metrics.largeAsks})`);
    } else if (metrics.largeAsks > metrics.largeBids * 2) {
      bearishScore += 25;
      reasons.push(`Many large asks (${metrics.largeAsks} vs ${metrics.largeBids})`);
    }

    if (metrics.bidWall && !metrics.askWall) {
      bullishScore += 20;
      reasons.push(`Bid wall at ${metrics.bidWall}`);
    } else if (metrics.askWall && !metrics.bidWall) {
      bearishScore += 20;
      reasons.push(`Ask wall at ${metrics.askWall}`);
    }

    let type: "BULLISH" | "BEARISH" | "NEUTRAL";
    let confidence: number;

    if (bullishScore > bearishScore + 20) {
      type = "BULLISH";
      confidence = Math.min(100, bullishScore);
    } else if (bearishScore > bullishScore + 20) {
      type = "BEARISH";
      confidence = Math.min(100, bearishScore);
    } else {
      type = "NEUTRAL";
      confidence = 50;
      reasons.push("Mixed signals");
    }

    return { type, confidence, reason: reasons.join(". "), metrics };
  }

  isPumpConfirmed(metrics: OrderbookMetrics): boolean {
    return metrics.imbalance > 0.3 && metrics.largeBids > 5 && metrics.bidWall !== null;
  }

  isDumpConfirmed(metrics: OrderbookMetrics): boolean {
    return metrics.imbalance < -0.3 && metrics.largeAsks > 5 && metrics.askWall !== null;
  }

  private findWall(levels: OrderbookLevel[]): number | null {
    if (levels.length === 0) return null;
    const volumes = levels.map(l => l.price * l.quantity);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const threshold = avgVolume * this.config.wallThreshold;

    for (let i = 0; i < levels.length; i++) {
      if (volumes[i] >= threshold) return levels[i].price;
    }
    return null;
  }

  getHistory(): OrderbookMetrics[] { return [...this.history]; }
  clearHistory(): void { this.history = []; }
}
