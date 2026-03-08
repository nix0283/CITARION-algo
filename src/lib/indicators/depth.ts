/**
 * Depth Indicators - Order Book Analysis
 * Ported from ai-technicals (https://github.com/sanzol-tech/ai-technicals)
 *
 * These indicators analyze order book (depth) data to extract trading signals.
 * Order book analysis provides insights into market microstructure that
 * traditional price-based indicators cannot capture.
 *
 * Available Indicators:
 * 1. DepthDelta - Bid/Ask volume imbalance
 * 2. DepthMiddlePrice - Weighted mid-price from order book
 * 3. DepthTrueRange - True range calculated from depth
 * 4. DepthWeightedPoints - Volume-weighted price points
 * 5. DepthSuperPrices - Aggregated price levels
 * 6. DepthBlockPoints - Large order detection
 */

import type { Time, LineData, HistogramData, WhitespaceData } from "lightweight-charts";
import type { IndicatorResult } from "./calculator";

// ==================== TYPES ====================

/**
 * Order book level (price level with volume)
 */
export interface DepthLevel {
  price: number;
  volume: number;
}

/**
 * Order book snapshot
 */
export interface OrderBookSnapshot {
  time: Time;
  symbol: string;
  bids: DepthLevel[];  // Sorted by price descending (best bid first)
  asks: DepthLevel[];  // Sorted by price ascending (best ask first)
  timestamp: number;
}

/**
 * Configuration for depth indicators
 */
export interface DepthConfig {
  levels: number;           // Number of depth levels to analyze (default: 20)
  aggregation: number;      // Price aggregation step (default: 0)
  minVolume: number;        // Minimum volume to consider (default: 0)
  largeOrderThreshold: number; // Volume threshold for large orders (default: auto)
}

/**
 * Result from depth analysis
 */
export interface DepthAnalysis {
  time: Time;
  bidVolume: number;
  askVolume: number;
  delta: number;            // bidVolume - askVolume
  deltaPercent: number;     // delta / (bidVolume + askVolume)
  imbalance: number;        // -1 to 1 scale
  spread: number;           // Best ask - best bid
  spreadPercent: number;    // Spread as percentage of mid-price
  midPrice: number;         // Simple mid-price
  weightedMidPrice: number; // Volume-weighted mid-price
  pressure: 'buy' | 'sell' | 'neutral';
  strength: number;         // 0-100 pressure strength
}

/**
 * Block trade detection result
 */
export interface BlockPoint {
  time: Time;
  side: 'bid' | 'ask';
  price: number;
  volume: number;
  notional: number;        // price * volume
  isLarge: boolean;
  distanceFromMid: number; // Distance from mid-price in %
}

/**
 * Weighted price point
 */
export interface WeightedPoint {
  price: number;
  volume: number;
  weight: number;
  cumulativeVolume: number;
  type: 'support' | 'resistance';
}

// ==================== DEPTH CALCULATIONS ====================

/**
 * Calculate depth delta (bid/ask volume imbalance)
 *
 * Delta = Bid Volume - Ask Volume
 * Positive delta = Buy pressure
 * Negative delta = Sell pressure
 */
export function calculateDepthDelta(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): number {
  const levels = config.levels ?? 20;

  let bidVolume = 0;
  let askVolume = 0;

  for (let i = 0; i < Math.min(levels, orderBook.bids.length); i++) {
    bidVolume += orderBook.bids[i].volume;
  }

  for (let i = 0; i < Math.min(levels, orderBook.asks.length); i++) {
    askVolume += orderBook.asks[i].volume;
  }

  return bidVolume - askVolume;
}

/**
 * Calculate depth imbalance as percentage
 * Returns value from -1 to 1
 * -1 = 100% asks, 1 = 100% bids
 */
export function calculateDepthImbalance(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): number {
  const levels = config.levels ?? 20;

  let bidVolume = 0;
  let askVolume = 0;

  for (let i = 0; i < Math.min(levels, orderBook.bids.length); i++) {
    bidVolume += orderBook.bids[i].volume;
  }

  for (let i = 0; i < Math.min(levels, orderBook.asks.length); i++) {
    askVolume += orderBook.asks[i].volume;
  }

  const totalVolume = bidVolume + askVolume;
  if (totalVolume === 0) return 0;

  return (bidVolume - askVolume) / totalVolume;
}

/**
 * Calculate volume-weighted mid-price
 * This provides a more accurate price than simple mid-price
 * when there's volume imbalance
 */
export function calculateWeightedMidPrice(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): number {
  const levels = config.levels ?? 20;

  let bidVolume = 0;
  let askVolume = 0;
  let bidNotional = 0;
  let askNotional = 0;

  for (let i = 0; i < Math.min(levels, orderBook.bids.length); i++) {
    bidVolume += orderBook.bids[i].volume;
    bidNotional += orderBook.bids[i].price * orderBook.bids[i].volume;
  }

  for (let i = 0; i < Math.min(levels, orderBook.asks.length); i++) {
    askVolume += orderBook.asks[i].volume;
    askNotional += orderBook.asks[i].price * orderBook.asks[i].volume;
  }

  // Weighted mid-price formula
  const totalVolume = bidVolume + askVolume;
  if (totalVolume === 0) {
    // Fallback to simple mid-price
    return (orderBook.bids[0]?.price + orderBook.asks[0]?.price) / 2 || 0;
  }

  const bidVwap = bidVolume > 0 ? bidNotional / bidVolume : orderBook.bids[0]?.price || 0;
  const askVwap = askVolume > 0 ? askNotional / askVolume : orderBook.asks[0]?.price || 0;

  // Weight by volume
  return (bidVwap * bidVolume + askVwap * askVolume) / totalVolume;
}

/**
 * Calculate depth true range
 * Similar to ATR but based on order book depth
 */
export function calculateDepthTrueRange(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): number {
  const levels = config.levels ?? 20;

  // Get the range of the order book
  const highestBid = orderBook.bids[0]?.price || 0;
  const lowestBid = orderBook.bids[Math.min(levels - 1, orderBook.bids.length - 1)]?.price || highestBid;
  const lowestAsk = orderBook.asks[0]?.price || 0;
  const highestAsk = orderBook.asks[Math.min(levels - 1, orderBook.asks.length - 1)]?.price || lowestAsk;

  // Depth true range is the range of the visible order book
  const bidRange = highestBid - lowestBid;
  const askRange = highestAsk - lowestAsk;
  const spread = lowestAsk - highestBid;

  return Math.max(bidRange, askRange, spread);
}

/**
 * Calculate volume-weighted price points (support/resistance)
 * Identifies significant price levels based on volume concentration
 */
export function calculateWeightedPoints(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): WeightedPoint[] {
  const levels = config.levels ?? 20;
  const minVolume = config.minVolume ?? 0;

  const points: WeightedPoint[] = [];
  const midPrice = (orderBook.bids[0]?.price + orderBook.asks[0]?.price) / 2 || 0;

  // Process bids (support levels)
  let cumulativeVolume = 0;
  for (let i = 0; i < Math.min(levels, orderBook.bids.length); i++) {
    const level = orderBook.bids[i];
    if (level.volume >= minVolume) {
      cumulativeVolume += level.volume;
      const weight = level.volume / cumulativeVolume;
      points.push({
        price: level.price,
        volume: level.volume,
        weight,
        cumulativeVolume,
        type: 'support',
      });
    }
  }

  // Process asks (resistance levels)
  cumulativeVolume = 0;
  for (let i = 0; i < Math.min(levels, orderBook.asks.length); i++) {
    const level = orderBook.asks[i];
    if (level.volume >= minVolume) {
      cumulativeVolume += level.volume;
      const weight = level.volume / cumulativeVolume;
      points.push({
        price: level.price,
        volume: level.volume,
        weight,
        cumulativeVolume,
        type: 'resistance',
      });
    }
  }

  // Sort by weight (most significant first)
  return points.sort((a, b) => b.weight - a.weight);
}

/**
 * Detect block points (large orders in the book)
 * These can act as strong support/resistance
 */
export function calculateBlockPoints(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): BlockPoint[] {
  const levels = config.levels ?? 20;
  const largeOrderThreshold = config.largeOrderThreshold ?? 0;

  const points: BlockPoint[] = [];
  const midPrice = (orderBook.bids[0]?.price + orderBook.asks[0]?.price) / 2 || 0;

  // Calculate average volume for threshold if not provided
  let avgVolume = largeOrderThreshold;
  if (avgVolume === 0) {
    let totalVolume = 0;
    let count = 0;

    for (let i = 0; i < Math.min(levels, orderBook.bids.length); i++) {
      totalVolume += orderBook.bids[i].volume;
      count++;
    }
    for (let i = 0; i < Math.min(levels, orderBook.asks.length); i++) {
      totalVolume += orderBook.asks[i].volume;
      count++;
    }

    avgVolume = count > 0 ? totalVolume / count : 0;
    // Large order is 3x average
    avgVolume *= 3;
  }

  // Find large bids
  for (let i = 0; i < Math.min(levels, orderBook.bids.length); i++) {
    const level = orderBook.bids[i];
    const isLarge = level.volume >= avgVolume;

    points.push({
      time: orderBook.time,
      side: 'bid',
      price: level.price,
      volume: level.volume,
      notional: level.price * level.volume,
      isLarge,
      distanceFromMid: ((midPrice - level.price) / midPrice) * 100,
    });
  }

  // Find large asks
  for (let i = 0; i < Math.min(levels, orderBook.asks.length); i++) {
    const level = orderBook.asks[i];
    const isLarge = level.volume >= avgVolume;

    points.push({
      time: orderBook.time,
      side: 'ask',
      price: level.price,
      volume: level.volume,
      notional: level.price * level.volume,
      isLarge,
      distanceFromMid: ((level.price - midPrice) / midPrice) * 100,
    });
  }

  // Sort by volume (largest first)
  return points.sort((a, b) => b.volume - a.volume);
}

/**
 * Calculate "super prices" - aggregated price levels
 * Groups nearby price levels into zones
 */
export function calculateSuperPrices(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): Array<{ price: number; volume: number; type: 'bid' | 'ask' }> {
  const aggregation = config.aggregation ?? 0;
  const levels = config.levels ?? 20;

  const superBids = new Map<number, number>();
  const superAsks = new Map<number, number>();

  // Aggregate bids
  for (let i = 0; i < Math.min(levels, orderBook.bids.length); i++) {
    const level = orderBook.bids[i];
    const aggregatedPrice = aggregation > 0
      ? Math.floor(level.price / aggregation) * aggregation
      : level.price;

    superBids.set(
      aggregatedPrice,
      (superBids.get(aggregatedPrice) || 0) + level.volume
    );
  }

  // Aggregate asks
  for (let i = 0; i < Math.min(levels, orderBook.asks.length); i++) {
    const level = orderBook.asks[i];
    const aggregatedPrice = aggregation > 0
      ? Math.ceil(level.price / aggregation) * aggregation
      : level.price;

    superAsks.set(
      aggregatedPrice,
      (superAsks.get(aggregatedPrice) || 0) + level.volume
    );
  }

  const result: Array<{ price: number; volume: number; type: 'bid' | 'ask' }> = [];

  superBids.forEach((volume, price) => {
    result.push({ price, volume, type: 'bid' });
  });

  superAsks.forEach((volume, price) => {
    result.push({ price, volume, type: 'ask' });
  });

  return result.sort((a, b) => b.volume - a.volume);
}

// ==================== FULL DEPTH ANALYSIS ====================

/**
 * Perform complete depth analysis on order book snapshot
 */
export function analyzeDepth(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): DepthAnalysis {
  const levels = config.levels ?? 20;

  // Calculate basic metrics
  let bidVolume = 0;
  let askVolume = 0;

  for (let i = 0; i < Math.min(levels, orderBook.bids.length); i++) {
    bidVolume += orderBook.bids[i].volume;
  }

  for (let i = 0; i < Math.min(levels, orderBook.asks.length); i++) {
    askVolume += orderBook.asks[i].volume;
  }

  const delta = bidVolume - askVolume;
  const totalVolume = bidVolume + askVolume;
  const deltaPercent = totalVolume > 0 ? delta / totalVolume : 0;
  const imbalance = deltaPercent; // Same as deltaPercent but normalized

  // Calculate spread
  const bestBid = orderBook.bids[0]?.price || 0;
  const bestAsk = orderBook.asks[0]?.price || 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  // Calculate weighted mid-price
  const weightedMidPrice = calculateWeightedMidPrice(orderBook, config);

  // Determine pressure
  let pressure: 'buy' | 'sell' | 'neutral';
  let strength: number;

  if (Math.abs(imbalance) < 0.1) {
    pressure = 'neutral';
    strength = 50;
  } else if (imbalance > 0) {
    pressure = 'buy';
    strength = Math.min(100, (imbalance + 1) * 50);
  } else {
    pressure = 'sell';
    strength = Math.min(100, (1 - imbalance) * 50);
  }

  return {
    time: orderBook.time,
    bidVolume,
    askVolume,
    delta,
    deltaPercent,
    imbalance,
    spread,
    spreadPercent,
    midPrice,
    weightedMidPrice,
    pressure,
    strength,
  };
}

// ==================== DEPTH INDICATOR RESULTS ====================

/**
 * Calculate Depth Delta indicator for chart
 * Shows bid/ask volume imbalance over time
 */
export function calculateDepthDeltaIndicator(
  orderBooks: OrderBookSnapshot[],
  config: Partial<DepthConfig> = {}
): IndicatorResult {
  const deltaValues: (number | null)[] = [];

  for (const ob of orderBooks) {
    const analysis = analyzeDepth(ob, config);
    deltaValues.push(analysis.delta);
  }

  const buildHistogramData = (
    values: (number | null)[]
  ): (HistogramData<Time> | WhitespaceData<Time>)[] => {
    return orderBooks.map((ob, i) => {
      const value = values[i];
      if (value !== null && !isNaN(value) && isFinite(value)) {
        return {
          time: ob.time,
          value,
          color: value >= 0 ? '#26A69A' : '#EF5350',
        };
      }
      return { time: ob.time };
    });
  };

  return {
    id: 'depth_delta',
    overlay: false,
    lines: [],
    histograms: [{
      name: 'delta',
      data: buildHistogramData(deltaValues),
      color: '#26A69A',
    }],
  };
}

/**
 * Calculate Depth Middle Price indicator for chart
 * Shows volume-weighted mid-price vs simple mid-price
 */
export function calculateDepthMiddlePriceIndicator(
  orderBooks: OrderBookSnapshot[],
  config: Partial<DepthConfig> = {}
): IndicatorResult {
  const simpleMidValues: (number | null)[] = [];
  const weightedMidValues: (number | null)[] = [];

  for (const ob of orderBooks) {
    const analysis = analyzeDepth(ob, config);
    simpleMidValues.push(analysis.midPrice);
    weightedMidValues.push(analysis.weightedMidPrice);
  }

  const buildLineData = (
    values: (number | null)[]
  ): (LineData<Time> | WhitespaceData<Time>)[] => {
    return orderBooks.map((ob, i) => {
      const value = values[i];
      if (value !== null && !isNaN(value) && isFinite(value)) {
        return { time: ob.time, value };
      }
      return { time: ob.time };
    });
  };

  return {
    id: 'depth_middle_price',
    overlay: true,
    lines: [
      { name: 'simple_mid', data: buildLineData(simpleMidValues), color: '#FFD700' },
      { name: 'weighted_mid', data: buildLineData(weightedMidValues), color: '#00BCD4' },
    ],
    histograms: [],
  };
}

/**
 * Calculate Depth Imbalance indicator for chart
 * Shows imbalance as oscillator from -1 to 1
 */
export function calculateDepthImbalanceIndicator(
  orderBooks: OrderBookSnapshot[],
  config: Partial<DepthConfig> = {}
): IndicatorResult {
  const imbalanceValues: (number | null)[] = [];

  for (const ob of orderBooks) {
    const analysis = analyzeDepth(ob, config);
    imbalanceValues.push(analysis.imbalance);
  }

  const buildLineData = (
    values: (number | null)[]
  ): (LineData<Time> | WhitespaceData<Time>)[] => {
    return orderBooks.map((ob, i) => {
      const value = values[i];
      if (value !== null && !isNaN(value) && isFinite(value)) {
        return { time: ob.time, value };
      }
      return { time: ob.time };
    });
  };

  return {
    id: 'depth_imbalance',
    overlay: false,
    lines: [
      { name: 'imbalance', data: buildLineData(imbalanceValues), color: '#9C27B0' },
    ],
    histograms: [],
  };
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Format depth analysis for display
 */
export function formatDepthAnalysis(analysis: DepthAnalysis): string {
  return `Order Book Analysis:
  Bid Volume: ${analysis.bidVolume.toFixed(2)}
  Ask Volume: ${analysis.askVolume.toFixed(2)}
  Delta: ${analysis.delta.toFixed(2)} (${(analysis.deltaPercent * 100).toFixed(2)}%)
  Imbalance: ${(analysis.imbalance * 100).toFixed(2)}%
  Spread: ${analysis.spread.toFixed(4)} (${analysis.spreadPercent.toFixed(4)}%)
  Mid Price: ${analysis.midPrice.toFixed(2)}
  Weighted Mid: ${analysis.weightedMidPrice.toFixed(2)}
  Pressure: ${analysis.pressure.toUpperCase()} (${analysis.strength.toFixed(0)}%)`;
}

/**
 * Create mock order book for testing
 */
export function createMockOrderBook(
  midPrice: number,
  spread: number,
  depthLevels: number = 20
): OrderBookSnapshot {
  const bids: DepthLevel[] = [];
  const asks: DepthLevel[] = [];

  const bestBid = midPrice - spread / 2;
  const bestAsk = midPrice + spread / 2;

  for (let i = 0; i < depthLevels; i++) {
    // Random volume between 10 and 1000
    const bidVolume = 10 + Math.random() * 990;
    const askVolume = 10 + Math.random() * 990;

    bids.push({
      price: bestBid - i * spread * 0.1,
      volume: bidVolume,
    });

    asks.push({
      price: bestAsk + i * spread * 0.1,
      volume: askVolume,
    });
  }

  return {
    time: Date.now() as unknown as Time,
    symbol: 'MOCK',
    bids,
    asks,
    timestamp: Date.now(),
  };
}

/**
 * Detect support and resistance from order book
 */
export function detectSupportResistance(
  orderBook: OrderBookSnapshot,
  config: Partial<DepthConfig> = {}
): {
  supports: Array<{ price: number; strength: number }>;
  resistances: Array<{ price: number; strength: number }>;
} {
  const blockPoints = calculateBlockPoints(orderBook, config);
  const weightedPoints = calculateWeightedPoints(orderBook, config);

  const supports: Array<{ price: number; strength: number }> = [];
  const resistances: Array<{ price: number; strength: number }> = [];

  // Add large bid orders as support
  for (const point of blockPoints.filter(p => p.side === 'bid' && p.isLarge)) {
    supports.push({
      price: point.price,
      strength: point.volume,
    });
  }

  // Add large ask orders as resistance
  for (const point of blockPoints.filter(p => p.side === 'ask' && p.isLarge)) {
    resistances.push({
      price: point.price,
      strength: point.volume,
    });
  }

  // Add weighted points
  for (const point of weightedPoints) {
    if (point.type === 'support') {
      supports.push({
        price: point.price,
        strength: point.volume,
      });
    } else {
      resistances.push({
        price: point.price,
        strength: point.volume,
      });
    }
  }

  // Sort and deduplicate
  const dedupe = (arr: Array<{ price: number; strength: number }>) => {
    const map = new Map<number, number>();
    for (const item of arr) {
      const existing = map.get(item.price) || 0;
      map.set(item.price, existing + item.strength);
    }
    return Array.from(map.entries())
      .map(([price, strength]) => ({ price, strength }))
      .sort((a, b) => b.strength - a.strength);
  };

  return {
    supports: dedupe(supports),
    resistances: dedupe(resistances),
  };
}
