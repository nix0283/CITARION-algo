/**
 * Argus Bot Advanced Pump/Dump Detection Engine
 * 
 * Implements multi-factor pump/dump detection algorithm:
 * - Volume surge detection (2x+ average volume)
 * - Price spike detection (rapid price movement)
 * - Orderbook imbalance analysis
 * - Whale activity correlation
 * - Pattern recognition
 * 
 * Detection signals are combined into a confidence score
 * and emitted as real-time alerts.
 */

import { EventEmitter } from 'events';
import type { TradeData, DepthData, VolumeSurgeEvent, ExchangeId } from './websocket-stream';

// ==================== TYPES ====================

export type SignalType = 'PUMP' | 'DUMP' | 'NEUTRAL';
export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'EXTREME';

export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
}

export interface PriceStats {
  currentPrice: number;
  change1m: number;    // 1 minute price change %
  change5m: number;    // 5 minute price change %
  change15m: number;   // 15 minute price change %
  high1m: number;
  low1m: number;
  high5m: number;
  low5m: number;
  vwap1m: number;
  vwap5m: number;
}

export interface DetectionSignal {
  id: string;
  symbol: string;
  exchange: ExchangeId;
  type: SignalType;
  strength: SignalStrength;
  confidence: number;      // 0-100
  priceChange: number;     // % change
  volumeSurge: number;     // multiplier
  orderbookImbalance: number;
  whaleActivity: number;   // net whale flow
  price: number;
  timestamp: Date;
  reasons: string[];
  metadata: {
    priceStats: PriceStats;
    volumeSurgeEvent?: VolumeSurgeEvent;
    depthSnapshot?: {
      bidVolume: number;
      askVolume: number;
      spread: number;
    };
    largeOrders: LargeOrder[];
  };
}

export interface LargeOrder {
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  value: number;
  timestamp: Date;
}

export interface DetectorConfig {
  // Price thresholds
  pumpThreshold1m: number;      // Default: 0.02 (2% in 1 min)
  pumpThreshold5m: number;      // Default: 0.05 (5% in 5 min)
  dumpThreshold1m: number;
  dumpThreshold5m: number;
  
  // Volume thresholds
  volumeSurgeThreshold: number; // Default: 2.0 (2x average)
  
  // Orderbook thresholds
  imbalanceThreshold: number;   // Default: 0.3 (30% imbalance)
  
  // Whale detection
  largeOrderThreshold: number;  // Default: 50000 USDT
  whaleFlowThreshold: number;   // Default: 100000 USDT
  
  // Detection weights
  priceWeight: number;          // Default: 0.4
  volumeWeight: number;         // Default: 0.3
  orderbookWeight: number;      // Default: 0.2
  whaleWeight: number;          // Default: 0.1
  
  // Cooldown
  signalCooldownMs: number;     // Default: 60000 (1 minute)
}

export interface DetectorState {
  lastSignal: Map<string, Date>;
  priceHistory: Map<string, PricePoint[]>;
  currentDepths: Map<string, DepthData>;
  largeOrders: Map<string, LargeOrder[]>;
  signals: DetectionSignal[];
}

const DEFAULT_CONFIG: DetectorConfig = {
  pumpThreshold1m: 0.02,
  pumpThreshold5m: 0.05,
  dumpThreshold1m: -0.02,
  dumpThreshold5m: -0.05,
  volumeSurgeThreshold: 2.0,
  imbalanceThreshold: 0.3,
  largeOrderThreshold: 50000,
  whaleFlowThreshold: 100000,
  priceWeight: 0.4,
  volumeWeight: 0.3,
  orderbookWeight: 0.2,
  whaleWeight: 0.1,
  signalCooldownMs: 60000,
};

// ==================== PUMP/DUMP DETECTOR ====================

export class PumpDumpDetector extends EventEmitter {
  private config: DetectorConfig;
  private state: DetectorState;
  private maxPriceHistory = 1000; // ~16 minutes at 100ms updates
  private maxLargeOrders = 100;
  private maxSignals = 100;

  constructor(config: Partial<DetectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      lastSignal: new Map(),
      priceHistory: new Map(),
      currentDepths: new Map(),
      largeOrders: new Map(),
      signals: [],
    };
  }

  // ==================== DATA PROCESSING ====================

  /**
   * Process incoming trade data
   */
  processTrade(trade: TradeData): void {
    // Update price history
    this.updatePriceHistory(trade);
    
    // Check for large order
    if (trade.value >= this.config.largeOrderThreshold) {
      this.recordLargeOrder(trade);
    }
  }

  /**
   * Process incoming depth data
   */
  processDepth(depth: DepthData): void {
    this.state.currentDepths.set(depth.symbol, depth);
  }

  /**
   * Process volume surge event
   */
  processVolumeSurge(symbol: string, event: VolumeSurgeEvent): DetectionSignal | null {
    // Get price stats
    const priceStats = this.calculatePriceStats(symbol);
    if (!priceStats) return null;
    
    // Get depth snapshot
    const depth = this.state.currentDepths.get(symbol);
    const depthSnapshot = depth ? {
      bidVolume: depth.bids.reduce((sum, [_, q]) => sum + q, 0),
      askVolume: depth.asks.reduce((sum, [_, q]) => sum + q, 0),
      spread: depth.asks[0]?.[0] && depth.bids[0]?.[0]
        ? (depth.asks[0][0] - depth.bids[0][0]) / depth.bids[0][0] * 100
        : 0,
    } : undefined;
    
    // Calculate orderbook imbalance
    const orderbookImbalance = depthSnapshot
      ? (depthSnapshot.bidVolume - depthSnapshot.askVolume) / 
        (depthSnapshot.bidVolume + depthSnapshot.askVolume)
      : 0;
    
    // Get whale activity
    const whaleActivity = this.calculateWhaleActivity(symbol);
    
    // Determine signal type and strength
    const detection = this.detectSignal(
      symbol,
      event.exchange,
      priceStats,
      event.surgeRatio,
      orderbookImbalance,
      whaleActivity,
      event.buyPressure,
      event,
      depthSnapshot
    );
    
    if (detection) {
      this.state.signals.push(detection);
      if (this.state.signals.length > this.maxSignals) {
        this.state.signals.shift();
      }
      this.emit('signal', detection);
    }
    
    return detection;
  }

  // ==================== DETECTION LOGIC ====================

  private updatePriceHistory(trade: TradeData): void {
    const symbol = trade.symbol;
    
    if (!this.state.priceHistory.has(symbol)) {
      this.state.priceHistory.set(symbol, []);
    }
    
    const history = this.state.priceHistory.get(symbol)!;
    history.push({
      timestamp: trade.timestamp.getTime(),
      price: trade.price,
      volume: trade.value,
    });
    
    // Keep only recent history
    while (history.length > this.maxPriceHistory) {
      history.shift();
    }
  }

  private recordLargeOrder(trade: TradeData): void {
    const symbol = trade.symbol;
    
    if (!this.state.largeOrders.has(symbol)) {
      this.state.largeOrders.set(symbol, []);
    }
    
    const orders = this.state.largeOrders.get(symbol)!;
    orders.push({
      side: trade.side,
      price: trade.price,
      quantity: trade.quantity,
      value: trade.value,
      timestamp: trade.timestamp,
    });
    
    // Keep only recent orders
    while (orders.length > this.maxLargeOrders) {
      orders.shift();
    }
  }

  private calculatePriceStats(symbol: string): PriceStats | null {
    const history = this.state.priceHistory.get(symbol);
    if (!history || history.length < 10) return null;
    
    const now = Date.now();
    const prices = history.map(p => p.price);
    const currentPrice = prices[prices.length - 1];
    
    // Find prices at different time windows
    const price1mAgo = this.getPriceAt(history, now - 60000);
    const price5mAgo = this.getPriceAt(history, now - 300000);
    const price15mAgo = this.getPriceAt(history, now - 900000);
    
    // Calculate changes
    const change1m = price1mAgo ? (currentPrice - price1mAgo) / price1mAgo : 0;
    const change5m = price5mAgo ? (currentPrice - price5mAgo) / price5mAgo : 0;
    const change15m = price15mAgo ? (currentPrice - price15mAgo) / price15mAgo : 0;
    
    // High/Low in windows
    const last1m = history.filter(p => p.timestamp >= now - 60000);
    const last5m = history.filter(p => p.timestamp >= now - 300000);
    
    const high1m = last1m.length > 0 ? Math.max(...last1m.map(p => p.price)) : currentPrice;
    const low1m = last1m.length > 0 ? Math.min(...last1m.map(p => p.price)) : currentPrice;
    const high5m = last5m.length > 0 ? Math.max(...last5m.map(p => p.price)) : currentPrice;
    const low5m = last5m.length > 0 ? Math.min(...last5m.map(p => p.price)) : currentPrice;
    
    // VWAP calculation
    const vwap1m = this.calculateVWAP(last1m);
    const vwap5m = this.calculateVWAP(last5m);
    
    return {
      currentPrice,
      change1m,
      change5m,
      change15m,
      high1m,
      low1m,
      high5m,
      low5m,
      vwap1m,
      vwap5m,
    };
  }

  private getPriceAt(history: PricePoint[], targetTime: number): number | null {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].timestamp <= targetTime) {
        return history[i].price;
      }
    }
    return history[0]?.price ?? null;
  }

  private calculateVWAP(points: PricePoint[]): number {
    if (points.length === 0) return 0;
    
    let totalValue = 0;
    let totalVolume = 0;
    
    for (const point of points) {
      totalValue += point.price * point.volume;
      totalVolume += point.volume;
    }
    
    return totalVolume > 0 ? totalValue / totalVolume : points[points.length - 1].price;
  }

  private calculateWhaleActivity(symbol: string): number {
    const orders = this.state.largeOrders.get(symbol);
    if (!orders || orders.length === 0) return 0;
    
    const now = Date.now();
    const recentOrders = orders.filter(o => now - o.timestamp.getTime() < 300000); // 5 min window
    
    let netFlow = 0;
    for (const order of recentOrders) {
      netFlow += order.side === 'BUY' ? order.value : -order.value;
    }
    
    return netFlow;
  }

  private detectSignal(
    symbol: string,
    exchange: ExchangeId,
    priceStats: PriceStats,
    volumeSurge: number,
    orderbookImbalance: number,
    whaleActivity: number,
    buyPressure: number,
    volumeSurgeEvent: VolumeSurgeEvent,
    depthSnapshot?: { bidVolume: number; askVolume: number; spread: number }
  ): DetectionSignal | null {
    // Check cooldown
    const lastSignal = this.state.lastSignal.get(symbol);
    if (lastSignal && Date.now() - lastSignal.getTime() < this.config.signalCooldownMs) {
      return null;
    }
    
    const reasons: string[] = [];
    let type: SignalType = 'NEUTRAL';
    let confidence = 0;
    
    // ===== PRICE ANALYSIS =====
    const priceScore = this.calculatePriceScore(priceStats, reasons);
    
    // ===== VOLUME ANALYSIS =====
    const volumeScore = this.calculateVolumeScore(volumeSurge, buyPressure, reasons);
    
    // ===== ORDERBOOK ANALYSIS =====
    const orderbookScore = this.calculateOrderbookScore(orderbookImbalance, reasons);
    
    // ===== WHALE ANALYSIS =====
    const whaleScore = this.calculateWhaleScore(whaleActivity, reasons);
    
    // ===== COMBINE SCORES =====
    const totalScore = 
      priceScore * this.config.priceWeight +
      volumeScore * this.config.volumeWeight +
      orderbookScore * this.config.orderbookWeight +
      whaleScore * this.config.whaleWeight;
    
    // Determine signal type
    if (totalScore >= 0.5) {
      type = 'PUMP';
      confidence = Math.min(100, totalScore * 100);
    } else if (totalScore <= -0.5) {
      type = 'DUMP';
      confidence = Math.min(100, Math.abs(totalScore) * 100);
    } else {
      return null; // Not significant enough
    }
    
    // Determine strength
    const strength: SignalStrength = 
      confidence >= 80 ? 'EXTREME' :
      confidence >= 60 ? 'STRONG' :
      confidence >= 40 ? 'MODERATE' : 'WEAK';
    
    // Update last signal time
    this.state.lastSignal.set(symbol, new Date());
    
    // Get recent large orders
    const recentOrders = this.state.largeOrders.get(symbol)?.slice(-10) || [];
    
    return {
      id: `sig-${symbol}-${Date.now()}`,
      symbol,
      exchange,
      type,
      strength,
      confidence,
      priceChange: priceStats.change5m,
      volumeSurge,
      orderbookImbalance,
      whaleActivity,
      price: priceStats.currentPrice,
      timestamp: new Date(),
      reasons,
      metadata: {
        priceStats,
        volumeSurgeEvent,
        depthSnapshot,
        largeOrders: recentOrders,
      },
    };
  }

  private calculatePriceScore(stats: PriceStats, reasons: string[]): number {
    let score = 0;
    
    // 1-minute change
    if (stats.change1m >= this.config.pumpThreshold1m) {
      score += 0.3;
      reasons.push(`1m price surge: +${(stats.change1m * 100).toFixed(2)}%`);
    } else if (stats.change1m <= this.config.dumpThreshold1m) {
      score -= 0.3;
      reasons.push(`1m price drop: ${(stats.change1m * 100).toFixed(2)}%`);
    }
    
    // 5-minute change
    if (stats.change5m >= this.config.pumpThreshold5m) {
      score += 0.4;
      reasons.push(`5m price surge: +${(stats.change5m * 100).toFixed(2)}%`);
    } else if (stats.change5m <= this.config.dumpThreshold5m) {
      score -= 0.4;
      reasons.push(`5m price drop: ${(stats.change5m * 100).toFixed(2)}%`);
    }
    
    // Price vs VWAP
    if (stats.vwap5m > 0) {
      const vwapDiff = (stats.currentPrice - stats.vwap5m) / stats.vwap5m;
      if (Math.abs(vwapDiff) > 0.02) {
        score += vwapDiff > 0 ? 0.2 : -0.2;
        reasons.push(`Price ${vwapDiff > 0 ? 'above' : 'below'} 5m VWAP: ${(Math.abs(vwapDiff) * 100).toFixed(2)}%`);
      }
    }
    
    return Math.max(-1, Math.min(1, score));
  }

  private calculateVolumeScore(volumeSurge: number, buyPressure: number, reasons: string[]): number {
    let score = 0;
    
    // Volume surge
    if (volumeSurge >= this.config.volumeSurgeThreshold) {
      score += Math.min(0.5, (volumeSurge - 1) * 0.2);
      reasons.push(`Volume surge: ${volumeSurge.toFixed(1)}x average`);
    }
    
    // Buy pressure
    if (Math.abs(buyPressure) > 0.2) {
      score += buyPressure * 0.3;
      reasons.push(`${buyPressure > 0 ? 'Buy' : 'Sell'} pressure: ${(Math.abs(buyPressure) * 100).toFixed(1)}%`);
    }
    
    return Math.max(-1, Math.min(1, score));
  }

  private calculateOrderbookScore(imbalance: number, reasons: string[]): number {
    if (Math.abs(imbalance) >= this.config.imbalanceThreshold) {
      reasons.push(`Orderbook imbalance: ${(imbalance * 100).toFixed(1)}%`);
      return imbalance;
    }
    return 0;
  }

  private calculateWhaleScore(whaleActivity: number, reasons: string[]): number {
    if (Math.abs(whaleActivity) >= this.config.whaleFlowThreshold) {
      const direction = whaleActivity > 0 ? 'buying' : 'selling';
      reasons.push(`Whale ${direction}: $${(Math.abs(whaleActivity) / 1000).toFixed(0)}K`);
      return whaleActivity > 0 ? 0.5 : -0.5;
    }
    return 0;
  }

  // ==================== PUBLIC METHODS ====================

  getConfig(): DetectorConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getRecentSignals(count: number = 20): DetectionSignal[] {
    return this.state.signals.slice(-count);
  }

  getLargeOrders(symbol: string): LargeOrder[] {
    return this.state.largeOrders.get(symbol) || [];
  }

  getPriceHistory(symbol: string): PricePoint[] {
    return this.state.priceHistory.get(symbol) || [];
  }

  getCurrentDepth(symbol: string): DepthData | undefined {
    return this.state.currentDepths.get(symbol);
  }

  clearState(): void {
    this.state = {
      lastSignal: new Map(),
      priceHistory: new Map(),
      currentDepths: new Map(),
      largeOrders: new Map(),
      signals: [],
    };
  }
}

// ==================== EXPORTS ====================

export type { DetectorConfig as PumpDumpDetectorConfig };
export type { DetectionSignal as PumpDumpSignal };
