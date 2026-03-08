/**
 * MFT BOT - Selene (Medium Frequency Trading)
 *
 * Production-ready VWAP/TWAP execution algorithms for institutional order execution.
 * Minimizes market impact through optimal order slicing.
 *
 * Features:
 * - VWAP (Volume Weighted Average Price) execution
 * - TWAP (Time Weighted Average Price) execution
 * - Implementation shortfall optimization
 * - Adaptive execution based on market conditions
 * - Real-time slippage monitoring
 *
 * NO NEURAL NETWORKS - Classical execution algorithms only.
 */

import type { BotStatus, BotMode, RiskConfig } from './types';
import { getEventBus } from '../orchestration';

// =============================================================================
// TYPES
// =============================================================================

export interface MFTConfig {
  name: 'Selene';
  code: 'MFT';
  version: string;
  mode: BotMode;
  exchanges: string[];
  riskConfig: RiskConfig;
  strategy: {
    executionAlgorithm: 'VWAP' | 'TWAP' | 'ADAPTIVE' | 'POV';
    defaultDuration: number;        // Default execution duration in ms
    maxParticipationRate: number;   // Max % of volume we can be
    minSliceSize: number;           // Minimum slice size in base currency
    maxSliceSize: number;           // Maximum slice size in base currency
    urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    enableSmartOrderRouting: boolean;
    priceImprovementTarget: number; // Target bps improvement
    maxSlippageBps: number;         // Max allowed slippage in basis points
  };
}

export interface VWAPProfile {
  symbol: string;
  timestamp: number;
  intervals: VolumeInterval[];
  totalVolume: number;
  cumulativeVolume: number[];
  vwapPrice: number;
  predictedVolumeProfile: number[];
}

export interface VolumeInterval {
  startTime: number;
  endTime: number;
  expectedVolume: number;
  actualVolume: number;
  participationRate: number;
}

export interface ExecutionOrder {
  id: string;
  parentOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  totalQuantity: number;
  filledQuantity: number;
  avgFillPrice: number;
  targetPrice: number;
  vwapTarget: number;
  twapTarget: number;
  duration: number;
  startTime: number;
  endTime: number;
  algorithm: 'VWAP' | 'TWAP' | 'ADAPTIVE' | 'POV';
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  slices: OrderSlice[];
  slippageBps: number;
  implementationShortfall: number;
}

export interface OrderSlice {
  id: string;
  orderId: string;
  sequenceNumber: number;
  plannedQuantity: number;
  plannedPrice: number;
  actualQuantity: number;
  actualPrice: number;
  plannedTime: number;
  actualTime: number;
  status: 'PENDING' | 'SUBMITTED' | 'FILLED' | 'CANCELLED';
  slippageBps: number;
}

export interface MarketData {
  symbol: string;
  timestamp: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  lastPrice: number;
  lastSize: number;
  volume: number;
  vwap: number;
  high: number;
  low: number;
  open: number;
}

export interface ExecutionMetrics {
  totalOrders: number;
  completedOrders: number;
  totalVolume: number;
  avgSlippageBps: number;
  avgImplementationShortfall: number;
  vwapOutperformance: number;  // Bps vs benchmark
  twapOutperformance: number;
  participationRate: number;
  fillRate: number;
}

export interface MFTState {
  status: BotStatus;
  activeOrders: Map<string, ExecutionOrder>;
  completedOrders: ExecutionOrder[];
  vwapProfiles: Map<string, VWAPProfile>;
  marketData: Map<string, MarketData>;
  metrics: ExecutionMetrics;
  volumeHistory: Map<string, VolumeInterval[]>;
}

// =============================================================================
// VWAP EXECUTION ENGINE
// =============================================================================

class VWAPEngine {
  private historicalVolume: Map<string, Map<number, number>> = new Map(); // symbol -> (hour -> avg volume)

  /**
   * Build VWAP profile for a symbol
   * Uses historical volume patterns to predict intraday volume distribution
   */
  buildVWAPProfile(
    symbol: string,
    totalQuantity: number,
    duration: number,
    currentTime: number
  ): VWAPProfile {
    const intervals: VolumeInterval[] = [];
    const intervalCount = Math.max(1, Math.floor(duration / (5 * 60 * 1000))); // 5-minute intervals
    const intervalDuration = duration / intervalCount;

    // Get predicted volume profile (based on historical patterns)
    const predictedProfile = this.predictVolumeProfile(symbol, currentTime, intervalCount);

    let cumulativeVolume = 0;
    const cumulativeVolumeArr: number[] = [];

    for (let i = 0; i < intervalCount; i++) {
      const startTime = currentTime + i * intervalDuration;
      const endTime = startTime + intervalDuration;
      const expectedVolume = predictedProfile[i] * totalQuantity;

      intervals.push({
        startTime,
        endTime,
        expectedVolume,
        actualVolume: 0,
        participationRate: 0,
      });

      cumulativeVolume += expectedVolume;
      cumulativeVolumeArr.push(cumulativeVolume);
    }

    return {
      symbol,
      timestamp: currentTime,
      intervals,
      totalVolume: totalQuantity,
      cumulativeVolume: cumulativeVolumeArr,
      vwapPrice: 0, // Updated during execution
      predictedVolumeProfile,
    };
  }

  /**
   * Predict volume profile using historical patterns
   * Standard U-shaped intraday volume pattern
   */
  private predictVolumeProfile(symbol: string, currentTime: number, intervals: number): number[] {
    const profile: number[] = [];
    const hour = new Date(currentTime).getHours();
    const basePattern = this.getBaseVolumePattern();

    for (let i = 0; i < intervals; i++) {
      const intervalHour = (hour + Math.floor(i * 5 / 60)) % 24;
      const hourWeight = basePattern[intervalHour] || 0.04;
      profile.push(hourWeight);
    }

    // Normalize to sum to 1
    const sum = profile.reduce((a, b) => a + b, 0);
    return profile.map(p => p / sum);
  }

  /**
   * Get base intraday volume pattern (U-shaped)
   */
  private getBaseVolumePattern(): Record<number, number> {
    // Typical crypto volume pattern (24h)
    return {
      0: 0.06,   // Midnight UTC
      1: 0.05,
      2: 0.04,
      3: 0.03,
      4: 0.03,
      5: 0.04,
      6: 0.05,
      7: 0.06,
      8: 0.07,   // European open
      9: 0.08,
      10: 0.07,
      11: 0.06,
      12: 0.05,
      13: 0.05,
      14: 0.06,
      15: 0.07,
      16: 0.08,  // US open
      17: 0.09,
      18: 0.08,
      19: 0.07,
      20: 0.06,
      21: 0.05,
      22: 0.05,
      23: 0.05,
    };
  }

  /**
   * Calculate optimal slice size for VWAP execution
   */
  calculateSliceQuantity(
    profile: VWAPProfile,
    intervalIndex: number,
    remainingQuantity: number,
    marketVolume: number,
    maxParticipationRate: number
  ): number {
    if (intervalIndex >= profile.intervals.length) {
      return Math.min(remainingQuantity, marketVolume * maxParticipationRate);
    }

    const plannedQuantity = profile.intervals[intervalIndex].expectedVolume;
    const participationLimited = marketVolume * maxParticipationRate;

    return Math.min(plannedQuantity, remainingQuantity, participationLimited);
  }

  /**
   * Update VWAP profile with actual market data
   */
  updateProfile(profile: VWAPProfile, actualVolume: number, vwapPrice: number): void {
    const currentIndex = profile.intervals.findIndex(
      i => Date.now() >= i.startTime && Date.now() < i.endTime
    );

    if (currentIndex >= 0) {
      profile.intervals[currentIndex].actualVolume += actualVolume;
      profile.intervals[currentIndex].participationRate =
        profile.intervals[currentIndex].actualVolume /
        Math.max(1, profile.intervals[currentIndex].expectedVolume);
    }

    profile.vwapPrice = vwapPrice;
  }
}

// =============================================================================
// TWAP EXECUTION ENGINE
// =============================================================================

class TWAPEngine {
  /**
   * Build TWAP schedule - evenly distributed slices over time
   */
  buildTWAPSchedule(
    symbol: string,
    totalQuantity: number,
    duration: number,
    currentTime: number,
    sliceCount: number
  ): { sliceTimes: number[]; sliceQuantities: number[] } {
    const sliceTimes: number[] = [];
    const sliceQuantities: number[] = [];
    const sliceDuration = duration / sliceCount;
    const baseQuantity = totalQuantity / sliceCount;
    const remainder = totalQuantity % sliceCount;

    for (let i = 0; i < sliceCount; i++) {
      sliceTimes.push(currentTime + i * sliceDuration);
      // Distribute remainder across first slices
      sliceQuantities.push(baseQuantity + (i < remainder ? 1 : 0));
    }

    return { sliceTimes, sliceQuantities };
  }

  /**
   * Calculate next TWAP slice
   */
  calculateNextSlice(
    order: ExecutionOrder,
    currentTime: number
  ): { quantity: number; delayMs: number } {
    const elapsed = currentTime - order.startTime;
    const expectedFillRate = order.totalQuantity / order.duration;
    const expectedFilled = elapsed * expectedFillRate / (5 * 60 * 1000); // Assuming 5min intervals

    const behindSchedule = expectedFilled - order.filledQuantity;
    const nextSlice = Math.max(order.totalQuantity / (order.duration / (5 * 60 * 1000)), behindSchedule);

    return {
      quantity: Math.min(nextSlice, order.totalQuantity - order.filledQuantity),
      delayMs: Math.max(0, order.duration / Math.ceil(order.totalQuantity / nextSlice) - elapsed),
    };
  }

  /**
   * Calculate TWAP price target
   */
  calculateTWAPTarget(prices: number[], startTime: number, currentTime: number): number {
    const relevantPrices = prices.filter((_, i) => i >= startTime && i <= currentTime);
    if (relevantPrices.length === 0) return 0;
    return relevantPrices.reduce((a, b) => a + b, 0) / relevantPrices.length;
  }
}

// =============================================================================
// ADAPTIVE EXECUTION ENGINE
// =============================================================================

class AdaptiveExecutionEngine {
  /**
   * Adaptive execution combines VWAP/TWAP based on market conditions
   */
  selectAlgorithm(
    marketData: MarketData,
    orderSize: number,
    urgency: 'LOW' | 'MEDIUM' | 'HIGH'
  ): { algorithm: 'VWAP' | 'TWAP'; participationRate: number } {
    const dailyVolume = marketData.volume;
    const orderToVolume = orderSize / dailyVolume;

    // High urgency or large order relative to volume
    if (urgency === 'HIGH' || orderToVolume > 0.05) {
      return { algorithm: 'TWAP', participationRate: 0.15 };
    }

    // Low urgency or small order
    if (urgency === 'LOW' || orderToVolume < 0.01) {
      return { algorithm: 'VWAP', participationRate: 0.05 };
    }

    // Medium urgency - use VWAP with moderate participation
    return { algorithm: 'VWAP', participationRate: 0.10 };
  }

  /**
   * Adjust slice size based on market impact
   */
  adjustSliceSize(
    plannedSize: number,
    marketData: MarketData,
    recentSlippage: number,
    maxSlippageBps: number
  ): number {
    if (recentSlippage <= maxSlippageBps * 0.5) {
      // Low slippage - can increase size
      return plannedSize * 1.2;
    } else if (recentSlippage >= maxSlippageBps) {
      // High slippage - reduce size
      return plannedSize * 0.7;
    }

    return plannedSize;
  }

  /**
   * Calculate market impact estimate
   */
  estimateMarketImpact(
    orderSize: number,
    avgDailyVolume: number,
    volatility: number
  ): number {
    // Square root law: impact ~ sqrt(order_size / ADV) * volatility
    const participationRatio = orderSize / avgDailyVolume;
    return Math.sqrt(participationRatio) * volatility * 100; // In basis points
  }
}

// =============================================================================
// MFT BOT CLASS
// =============================================================================

export class MFTBot {
  private config: MFTConfig;
  private state: MFTState;
  private vwapEngine: VWAPEngine;
  private twapEngine: TWAPEngine;
  private adaptiveEngine: AdaptiveExecutionEngine;
  private eventBus = getEventBus();
  private executionInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<MFTConfig> = {}) {
    this.config = {
      name: 'Selene',
      code: 'MFT',
      version: '2.0.0',
      mode: 'PAPER',
      exchanges: ['binance'],
      riskConfig: {
        maxPositionSize: 100000,
        maxTotalExposure: 1000000,
        maxDrawdownPct: 0.10,
        riskPerTrade: 0.02,
        maxLeverage: 1,
      },
      strategy: {
        executionAlgorithm: 'VWAP',
        defaultDuration: 30 * 60 * 1000, // 30 minutes
        maxParticipationRate: 0.10,
        minSliceSize: 100,
        maxSliceSize: 10000,
        urgencyLevel: 'MEDIUM',
        enableSmartOrderRouting: true,
        priceImprovementTarget: 5, // 5 bps
        maxSlippageBps: 50,
      },
      ...config,
    };

    this.state = {
      status: 'STOPPED',
      activeOrders: new Map(),
      completedOrders: [],
      vwapProfiles: new Map(),
      marketData: new Map(),
      metrics: {
        totalOrders: 0,
        completedOrders: 0,
        totalVolume: 0,
        avgSlippageBps: 0,
        avgImplementationShortfall: 0,
        vwapOutperformance: 0,
        twapOutperformance: 0,
        participationRate: 0,
        fillRate: 0,
      },
      volumeHistory: new Map(),
    };

    this.vwapEngine = new VWAPEngine();
    this.twapEngine = new TWAPEngine();
    this.adaptiveEngine = new AdaptiveExecutionEngine();
  }

  // ===========================================================================
  // LIFECYCLE METHODS
  // ===========================================================================

  /**
   * Start the bot
   */
  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.state.status !== 'STOPPED') {
      return { success: false, message: 'Bot already running' };
    }

    this.state.status = 'STARTING';

    // Start execution loop
    this.executionInterval = setInterval(() => {
      this.executionCycle();
    }, 5000); // 5-second execution cycle

    this.state.status = 'RUNNING';

    // Emit event
    this.eventBus.emit('bot.started', {
      botCode: 'MFT',
      botName: 'Selene',
      timestamp: Date.now(),
    });

    return { success: true, message: 'MFT (Selene) started with VWAP/TWAP execution engine' };
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
      this.executionInterval = null;
    }

    // Cancel all active orders
    for (const [id, order] of this.state.activeOrders) {
      if (order.status === 'ACTIVE') {
        order.status = 'CANCELLED';
        this.state.activeOrders.delete(id);
        this.state.completedOrders.push(order);
      }
    }

    this.state.status = 'STOPPED';

    this.eventBus.emit('bot.stopped', {
      botCode: 'MFT',
      botName: 'Selene',
      timestamp: Date.now(),
    });

    return { success: true, message: 'MFT (Selene) stopped' };
  }

  /**
   * Pause the bot
   */
  public async pause(): Promise<{ success: boolean; message: string }> {
    if (this.state.status !== 'RUNNING') {
      return { success: false, message: 'Bot not running' };
    }

    this.state.status = 'HALTED';
    return { success: true, message: 'MFT paused' };
  }

  /**
   * Resume the bot
   */
  public async resume(): Promise<{ success: boolean; message: string }> {
    if (this.state.status !== 'HALTED') {
      return { success: false, message: 'Bot not paused' };
    }

    this.state.status = 'RUNNING';
    return { success: true, message: 'MFT resumed' };
  }

  // ===========================================================================
  // ORDER EXECUTION
  // ===========================================================================

  /**
   * Submit a new order for execution
   */
  public submitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    targetPrice: number,
    duration?: number,
    algorithm?: 'VWAP' | 'TWAP' | 'ADAPTIVE' | 'POV'
  ): ExecutionOrder {
    const orderId = `mft-${symbol}-${Date.now()}`;
    const execAlgorithm = algorithm || this.config.strategy.executionAlgorithm;
    const execDuration = duration || this.config.strategy.defaultDuration;

    const order: ExecutionOrder = {
      id: orderId,
      parentOrderId: orderId,
      symbol,
      side,
      totalQuantity: quantity,
      filledQuantity: 0,
      avgFillPrice: 0,
      targetPrice,
      vwapTarget: targetPrice,
      twapTarget: targetPrice,
      duration: execDuration,
      startTime: Date.now(),
      endTime: Date.now() + execDuration,
      algorithm: execAlgorithm,
      status: 'PENDING',
      slices: [],
      slippageBps: 0,
      implementationShortfall: 0,
    };

    // Build execution profile
    if (execAlgorithm === 'VWAP' || execAlgorithm === 'ADAPTIVE') {
      const profile = this.vwapEngine.buildVWAPProfile(
        symbol,
        quantity,
        execDuration,
        Date.now()
      );
      this.state.vwapProfiles.set(orderId, profile);
    }

    this.state.activeOrders.set(orderId, order);
    this.state.metrics.totalOrders++;

    // Emit event
    this.eventBus.emit('bot.signal', {
      botCode: 'MFT',
      signalType: 'order_submitted',
      symbol,
      data: { orderId, quantity, algorithm: execAlgorithm },
      timestamp: Date.now(),
    });

    return order;
  }

  /**
   * Main execution cycle
   */
  private executionCycle(): void {
    if (this.state.status !== 'RUNNING') return;

    const now = Date.now();

    for (const [orderId, order] of this.state.activeOrders) {
      if (order.status !== 'ACTIVE' && order.status !== 'PENDING') continue;

      // Check if order is complete
      if (order.filledQuantity >= order.totalQuantity) {
        this.completeOrder(orderId, 'FILLED');
        continue;
      }

      // Check if duration exceeded
      if (now >= order.endTime) {
        this.completeOrder(orderId, 'TIME_EXPIRED');
        continue;
      }

      // Execute next slice
      this.executeNextSlice(order);
    }
  }

  /**
   * Execute next slice of an order
   */
  private executeNextSlice(order: ExecutionOrder): void {
    const now = Date.now();
    const marketData = this.state.marketData.get(order.symbol);

    // Create slice
    const sliceId = `${order.id}-slice-${order.slices.length + 1}`;
    let plannedQuantity = 0;

    switch (order.algorithm) {
      case 'VWAP': {
        const profile = this.state.vwapProfiles.get(order.id);
        if (profile) {
          const intervalIndex = profile.intervals.findIndex(
            i => now >= i.startTime && now < i.endTime
          );
          plannedQuantity = this.vwapEngine.calculateSliceQuantity(
            profile,
            intervalIndex,
            order.totalQuantity - order.filledQuantity,
            marketData?.volume || 0,
            this.config.strategy.maxParticipationRate
          );
        }
        break;
      }

      case 'TWAP': {
        const { quantity } = this.twapEngine.calculateNextSlice(order, now);
        plannedQuantity = quantity;
        break;
      }

      case 'ADAPTIVE': {
        const marketInfo = this.state.marketData.get(order.symbol);
        if (marketInfo) {
          const { algorithm, participationRate } = this.adaptiveEngine.selectAlgorithm(
            marketInfo,
            order.totalQuantity - order.filledQuantity,
            this.config.strategy.urgencyLevel
          );
          plannedQuantity = Math.min(
            (order.totalQuantity - order.filledQuantity) / 6, // 6 slices
            (marketInfo.volume || 10000) * participationRate
          );
        }
        break;
      }
    }

    // Apply limits
    plannedQuantity = Math.max(
      this.config.strategy.minSliceSize,
      Math.min(plannedQuantity, this.config.strategy.maxSliceSize)
    );
    plannedQuantity = Math.min(plannedQuantity, order.totalQuantity - order.filledQuantity);

    if (plannedQuantity <= 0) return;

    // Get current price
    const currentPrice = marketData?.lastPrice || order.targetPrice;
    const plannedPrice = currentPrice;

    const slice: OrderSlice = {
      id: sliceId,
      orderId: order.id,
      sequenceNumber: order.slices.length + 1,
      plannedQuantity,
      plannedPrice,
      actualQuantity: 0,
      actualPrice: 0,
      plannedTime: now,
      actualTime: now,
      status: 'SUBMITTED',
      slippageBps: 0,
    };

    // Simulate fill (in production, this would go to exchange)
    const fillPrice = this.simulateFill(currentPrice, plannedQuantity, marketData);
    const actualPrice = fillPrice.price;
    const actualQuantity = Math.min(plannedQuantity, fillPrice.filledQuantity);

    slice.actualQuantity = actualQuantity;
    slice.actualPrice = actualPrice;
    slice.actualTime = Date.now();
    slice.status = 'FILLED';
    slice.slippageBps = ((actualPrice - plannedPrice) / plannedPrice) * 10000;

    // Update order
    order.slices.push(slice);
    order.filledQuantity += actualQuantity;

    // Update avg fill price
    const totalValue = order.avgFillPrice * (order.filledQuantity - actualQuantity) + actualPrice * actualQuantity;
    order.avgFillPrice = totalValue / order.filledQuantity;

    // Update slippage
    order.slippageBps = ((order.avgFillPrice - order.targetPrice) / order.targetPrice) * 10000;

    // Update VWAP profile if applicable
    const profile = this.state.vwapProfiles.get(order.id);
    if (profile) {
      this.vwapEngine.updateProfile(profile, actualQuantity, order.avgFillPrice);
    }

    // Update order status
    order.status = 'ACTIVE';
  }

  /**
   * Simulate order fill (paper trading)
   */
  private simulateFill(
    price: number,
    quantity: number,
    marketData?: MarketData
  ): { price: number; filledQuantity: number } {
    // Add realistic slippage based on order size
    const slippageBps = Math.min(10, quantity / 1000); // 1 bps per 1000 units, max 10 bps
    const slippageFactor = 1 + (slippageBps / 10000);

    // Random variation
    const randomSlippage = (Math.random() - 0.5) * 0.001; // ±0.05%

    return {
      price: price * (slippageFactor + randomSlippage),
      filledQuantity: quantity * (0.95 + Math.random() * 0.05), // 95-100% fill rate
    };
  }

  /**
   * Complete an order
   */
  private completeOrder(orderId: string, reason: string): void {
    const order = this.state.activeOrders.get(orderId);
    if (!order) return;

    // Calculate implementation shortfall
    order.implementationShortfall = (order.avgFillPrice - order.targetPrice) * order.filledQuantity;

    order.status = reason === 'FILLED' ? 'COMPLETED' : 'CANCELLED';

    // Update metrics
    this.state.metrics.completedOrders++;
    this.state.metrics.totalVolume += order.filledQuantity * order.avgFillPrice;
    this.state.metrics.avgSlippageBps =
      (this.state.metrics.avgSlippageBps * (this.state.metrics.completedOrders - 1) + order.slippageBps)
      / this.state.metrics.completedOrders;
    this.state.metrics.avgImplementationShortfall =
      (this.state.metrics.avgImplementationShortfall * (this.state.metrics.completedOrders - 1) + order.implementationShortfall)
      / this.state.metrics.completedOrders;

    // Calculate outperformance vs VWAP/TWAP benchmarks
    const marketData = this.state.marketData.get(order.symbol);
    if (marketData) {
      const vwapBenchmark = marketData.vwap || order.targetPrice;
      const twapBenchmark = order.targetPrice; // Simplified
      this.state.metrics.vwapOutperformance = ((vwapBenchmark - order.avgFillPrice) / vwapBenchmark) * 10000;
      this.state.metrics.twapOutperformance = ((twapBenchmark - order.avgFillPrice) / twapBenchmark) * 10000;
    }

    // Move to completed
    this.state.activeOrders.delete(orderId);
    this.state.completedOrders.push(order);

    // Emit event
    this.eventBus.emit('bot.trade', {
      botCode: 'MFT',
      symbol: order.symbol,
      side: order.side,
      quantity: order.filledQuantity,
      price: order.avgFillPrice,
      timestamp: Date.now(),
    });
  }

  // ===========================================================================
  // MARKET DATA METHODS
  // ===========================================================================

  /**
   * Update market data for a symbol
   */
  public updateMarketData(data: MarketData): void {
    this.state.marketData.set(data.symbol, data);
  }

  /**
   * Update market data in bulk
   */
  public updateMarketDataBulk(data: MarketData[]): void {
    for (const d of data) {
      this.state.marketData.set(d.symbol, d);
    }
  }

  // ===========================================================================
  // QUERY METHODS
  // ===========================================================================

  /**
   * Get current state
   */
  public getState(): MFTState {
    return {
      ...this.state,
      activeOrders: new Map(this.state.activeOrders),
      vwapProfiles: new Map(this.state.vwapProfiles),
      marketData: new Map(this.state.marketData),
    };
  }

  /**
   * Get configuration
   */
  public getConfig(): MFTConfig {
    return { ...this.config };
  }

  /**
   * Get active orders
   */
  public getActiveOrders(): ExecutionOrder[] {
    return Array.from(this.state.activeOrders.values());
  }

  /**
   * Get completed orders
   */
  public getCompletedOrders(): ExecutionOrder[] {
    return [...this.state.completedOrders];
  }

  /**
   * Get execution metrics
   */
  public getMetrics(): ExecutionMetrics {
    return { ...this.state.metrics };
  }

  /**
   * Get order by ID
   */
  public getOrder(orderId: string): ExecutionOrder | null {
    return this.state.activeOrders.get(orderId) ||
           this.state.completedOrders.find(o => o.id === orderId) ||
           null;
  }

  /**
   * Cancel an order
   */
  public cancelOrder(orderId: string): { success: boolean; message: string } {
    const order = this.state.activeOrders.get(orderId);
    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    order.status = 'CANCELLED';
    this.state.activeOrders.delete(orderId);
    this.state.completedOrders.push(order);

    return { success: true, message: `Order ${orderId} cancelled` };
  }

  /**
   * Get VWAP profile for an order
   */
  public getVWAPProfile(orderId: string): VWAPProfile | null {
    return this.state.vwapProfiles.get(orderId) || null;
  }

  /**
   * Calculate expected execution schedule
   */
  public getExecutionSchedule(orderId: string): { times: number[]; quantities: number[] } | null {
    const order = this.state.activeOrders.get(orderId);
    if (!order) return null;

    const remaining = order.totalQuantity - order.filledQuantity;
    const remainingTime = order.endTime - Date.now();

    if (order.algorithm === 'TWAP') {
      const sliceCount = Math.ceil(remainingTime / (5 * 60 * 1000)); // 5-min slices
      const { sliceTimes, sliceQuantities } = this.twapEngine.buildTWAPSchedule(
        order.symbol,
        remaining,
        remainingTime,
        Date.now(),
        sliceCount
      );
      return { times: sliceTimes, quantities: sliceQuantities };
    }

    const profile = this.state.vwapProfiles.get(orderId);
    if (profile) {
      const times = profile.intervals.map(i => i.startTime);
      const quantities = profile.intervals.map(i => i.expectedVolume);
      return { times, quantities };
    }

    return null;
  }
}
