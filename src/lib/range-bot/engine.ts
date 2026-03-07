/**
 * Range Bot Engine
 * Trading bot for sideways/ranging markets
 * 
 * Features:
 * - Auto-detect range boundaries (support/resistance)
 * - Trade between range levels
 * - Breakout detection
 * - Oscillator confirmation (RSI, Stochastic)
 * - Dynamic range adjustment
 */

export interface RangeLevel {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE' | 'MID';
  touches: number;
  strength: number; // 0-1 based on number of touches
  lastTouch: number; // timestamp
}

export interface RangeState {
  symbol: string;
  rangeHigh: number;
  rangeLow: number;
  rangeMid: number;
  rangeWidth: number; // percent
  inRange: boolean;
  position: 'TOP' | 'BOTTOM' | 'MIDDLE';
  breakout: 'UPSIDE' | 'DOWNSIDE' | null;
  timeInRange: number; // periods
}

export interface RangeConfig {
  symbol: string;
  
  // Range detection
  lookbackPeriod: number;       // Periods to analyze for range detection
  minTouches: number;           // Minimum touches to confirm level
  touchThreshold: number;       // % price can deviate from level to count as touch
  maxRangeWidth: number;        // Max range width % to consider as range
  minRangeWidth: number;        // Min range width % to trade
  
  // Entry/Exit
  entryFromSupport: number;     // % above support to buy
  entryFromResistance: number;  // % below resistance to sell
  takeProfitPercent: number;    // TP from entry
  stopLossPercent: number;      // SL from entry
  
  // Oscillator confirmation
  useRSI: boolean;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  
  useStochastic: boolean;
  stochK: number;
  stochD: number;
  stochOversold: number;
  stochOverbought: number;
  
  // Breakout settings
  breakoutConfirmation: number; // % beyond level to confirm breakout
  breakoutRetest: boolean;      // Wait for retest after breakout
  
  // Position sizing
  positionSize: number;         // USDT per trade
  maxPositions: number;         // Max simultaneous positions
  
  // Risk management
  maxDailyLoss: number;         // Max daily loss %
  maxDrawdown: number;          // Max drawdown %
}

export const DEFAULT_RANGE_CONFIG: RangeConfig = {
  symbol: 'BTCUSDT',
  lookbackPeriod: 50,
  minTouches: 2,
  touchThreshold: 0.3,
  maxRangeWidth: 5,
  minRangeWidth: 0.5,
  entryFromSupport: 0.2,
  entryFromResistance: 0.2,
  takeProfitPercent: 1.5,
  stopLossPercent: 1.0,
  useRSI: true,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  useStochastic: false,
  stochK: 14,
  stochD: 3,
  stochOversold: 20,
  stochOverbought: 80,
  breakoutConfirmation: 0.5,
  breakoutRetest: true,
  positionSize: 100,
  maxPositions: 3,
  maxDailyLoss: 3,
  maxDrawdown: 10,
};

export interface RangeSignal {
  type: 'BUY' | 'SELL' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'BREAKOUT_UP' | 'BREAKOUT_DOWN';
  price: number;
  confidence: number;
  reason: string;
  rangePosition: number; // 0 = support, 1 = resistance, 0.5 = mid
  oscillatorConfirm: boolean;
  timestamp: number;
}

export interface RangePosition {
  id: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  pnlPercent: number;
  openedAt: number;
}

export interface RangeMetrics {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
  currentStreak: number;
  maxStreak: number;
  avgHoldingTime: number;
}

export class RangeBot {
  private config: RangeConfig;
  private rangeState: RangeState | null = null;
  private levels: RangeLevel[] = [];
  private positions: Map<string, RangePosition> = new Map();
  private signals: RangeSignal[] = [];
  private metrics: RangeMetrics = {
    totalTrades: 0,
    winTrades: 0,
    lossTrades: 0,
    winRate: 0,
    totalPnL: 0,
    avgPnL: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    largestWin: 0,
    largestLoss: 0,
    currentStreak: 0,
    maxStreak: 0,
    avgHoldingTime: 0,
  };
  private priceHistory: number[] = [];
  private dailyPnL: number = 0;
  private peakEquity: number = 0;
  private currentEquity: number = 0;

  constructor(config: Partial<RangeConfig> = {}) {
    this.config = { ...DEFAULT_RANGE_CONFIG, ...config };
  }

  /**
   * Update bot with new price data
   */
  update(price: number, high: number, low: number, volume: number): void {
    this.priceHistory.push(price);
    
    // Keep only needed history
    if (this.priceHistory.length > this.config.lookbackPeriod * 2) {
      this.priceHistory = this.priceHistory.slice(-this.config.lookbackPeriod);
    }

    // Detect range
    if (this.priceHistory.length >= this.config.lookbackPeriod) {
      this.detectRange();
    }

    // Update positions PnL
    this.updatePositions(price);
  }

  /**
   * Detect trading range from price history
   */
  private detectRange(): void {
    const prices = this.priceHistory.slice(-this.config.lookbackPeriod);
    const highs = prices; // In real impl, we'd have separate highs
    const lows = prices;
    
    // Find potential support and resistance levels
    const levels = this.findLevels(prices);
    
    if (levels.length >= 2) {
      // Sort by price
      levels.sort((a, b) => a.price - b.price);
      
      // Find most significant support and resistance
      const supportLevel = levels.find(l => l.type === 'SUPPORT');
      const resistanceLevel = levels.find(l => l.type === 'RESISTANCE');
      
      if (supportLevel && resistanceLevel) {
        const rangeWidth = ((resistanceLevel.price - supportLevel.price) / supportLevel.price) * 100;
        
        // Validate range
        if (rangeWidth <= this.config.maxRangeWidth && rangeWidth >= this.config.minRangeWidth) {
          this.rangeState = {
            symbol: this.config.symbol,
            rangeHigh: resistanceLevel.price,
            rangeLow: supportLevel.price,
            rangeMid: (resistanceLevel.price + supportLevel.price) / 2,
            rangeWidth,
            inRange: true,
            position: this.getRangePosition(this.priceHistory[this.priceHistory.length - 1], supportLevel.price, resistanceLevel.price),
            breakout: null,
            timeInRange: (this.rangeState?.timeInRange || 0) + 1,
          };
          this.levels = [supportLevel, resistanceLevel];
        } else {
          // Range too wide or too narrow
          if (this.rangeState) {
            this.rangeState.inRange = false;
          }
        }
      }
    }
  }

  /**
   * Find support and resistance levels
   */
  private findLevels(prices: number[]): RangeLevel[] {
    const levels: RangeLevel[] = [];
    const threshold = this.config.touchThreshold / 100;
    
    // Find local extremes
    for (let i = 2; i < prices.length - 2; i++) {
      const price = prices[i];
      
      // Check for local high (resistance)
      if (prices[i] > prices[i-1] && prices[i] > prices[i-2] && 
          prices[i] > prices[i+1] && prices[i] > prices[i+2]) {
        const existingLevel = levels.find(l => 
          l.type === 'RESISTANCE' && 
          Math.abs(l.price - price) / price < threshold
        );
        
        if (existingLevel) {
          existingLevel.touches++;
          existingLevel.strength = Math.min(1, existingLevel.touches / this.config.minTouches);
          existingLevel.lastTouch = Date.now();
        } else {
          levels.push({
            price,
            type: 'RESISTANCE',
            touches: 1,
            strength: 1 / this.config.minTouches,
            lastTouch: Date.now(),
          });
        }
      }
      
      // Check for local low (support)
      if (prices[i] < prices[i-1] && prices[i] < prices[i-2] && 
          prices[i] < prices[i+1] && prices[i] < prices[i+2]) {
        const existingLevel = levels.find(l => 
          l.type === 'SUPPORT' && 
          Math.abs(l.price - price) / price < threshold
        );
        
        if (existingLevel) {
          existingLevel.touches++;
          existingLevel.strength = Math.min(1, existingLevel.touches / this.config.minTouches);
          existingLevel.lastTouch = Date.now();
        } else {
          levels.push({
            price,
            type: 'SUPPORT',
            touches: 1,
            strength: 1 / this.config.minTouches,
            lastTouch: Date.now(),
          });
        }
      }
    }
    
    // Filter levels with enough touches
    return levels.filter(l => l.touches >= this.config.minTouches);
  }

  /**
   * Get current position within range
   */
  private getRangePosition(price: number, low: number, high: number): 'TOP' | 'BOTTOM' | 'MIDDLE' {
    const mid = (high + low) / 2;
    const quarterRange = (high - low) / 4;
    
    if (price >= high - quarterRange) return 'TOP';
    if (price <= low + quarterRange) return 'BOTTOM';
    return 'MIDDLE';
  }

  /**
   * Calculate RSI
   */
  private calculateRSI(prices: number[], period: number): number {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate Stochastic
   */
  private calculateStochastic(prices: number[], k: number): { k: number; d: number } {
    if (prices.length < k) return { k: 50, d: 50 };
    
    const recentPrices = prices.slice(-k);
    const high = Math.max(...recentPrices);
    const low = Math.min(...recentPrices);
    const current = prices[prices.length - 1];
    
    const kValue = ((current - low) / (high - low)) * 100;
    const dValue = kValue; // Simplified, would use SMA in full impl
    
    return { k: kValue, d: dValue };
  }

  /**
   * Generate trading signal
   */
  generateSignal(price: number, rsi?: number, stoch?: { k: number; d: number }): RangeSignal | null {
    if (!this.rangeState || !this.rangeState.inRange) return null;

    const { rangeHigh, rangeLow } = this.rangeState;
    const rangePosition = (price - rangeLow) / (rangeHigh - rangeLow);
    
    // Get oscillator values
    const currentRSI = rsi ?? (this.config.useRSI ? 
      this.calculateRSI(this.priceHistory, this.config.rsiPeriod) : null);
    const currentStoch = stoch ?? (this.config.useStochastic ?
      this.calculateStochastic(this.priceHistory, this.config.stochK) : null);
    
    // Check for breakout
    const breakoutThreshold = this.config.breakoutConfirmation / 100;
    if (price > rangeHigh * (1 + breakoutThreshold)) {
      return {
        type: 'BREAKOUT_UP',
        price,
        confidence: 0.7,
        reason: `Price broke above resistance at ${rangeHigh.toFixed(2)}`,
        rangePosition: 1.1,
        oscillatorConfirm: true,
        timestamp: Date.now(),
      };
    }
    if (price < rangeLow * (1 - breakoutThreshold)) {
      return {
        type: 'BREAKOUT_DOWN',
        price,
        confidence: 0.7,
        reason: `Price broke below support at ${rangeLow.toFixed(2)}`,
        rangePosition: -0.1,
        oscillatorConfirm: true,
        timestamp: Date.now(),
      };
    }

    // Check for range trading signals
    const supportThreshold = rangeLow * (1 + this.config.entryFromSupport / 100);
    const resistanceThreshold = rangeHigh * (1 - this.config.entryFromResistance / 100);

    // Buy near support
    if (price <= supportThreshold && rangePosition < 0.3) {
      let oscillatorConfirm = true;
      if (this.config.useRSI && currentRSI !== null) {
        oscillatorConfirm = currentRSI <= this.config.rsiOversold;
      }
      if (this.config.useStochastic && currentStoch !== null) {
        oscillatorConfirm = oscillatorConfirm && currentStoch.k <= this.config.stochOversold;
      }

      return {
        type: 'BUY',
        price,
        confidence: oscillatorConfirm ? 0.8 : 0.5,
        reason: `Price near support ${rangeLow.toFixed(2)}, RSI: ${currentRSI?.toFixed(1) ?? 'N/A'}`,
        rangePosition,
        oscillatorConfirm,
        timestamp: Date.now(),
      };
    }

    // Sell near resistance
    if (price >= resistanceThreshold && rangePosition > 0.7) {
      let oscillatorConfirm = true;
      if (this.config.useRSI && currentRSI !== null) {
        oscillatorConfirm = currentRSI >= this.config.rsiOverbought;
      }
      if (this.config.useStochastic && currentStoch !== null) {
        oscillatorConfirm = oscillatorConfirm && currentStoch.k >= this.config.stochOverbought;
      }

      return {
        type: 'SELL',
        price,
        confidence: oscillatorConfirm ? 0.8 : 0.5,
        reason: `Price near resistance ${rangeHigh.toFixed(2)}, RSI: ${currentRSI?.toFixed(1) ?? 'N/A'}`,
        rangePosition,
        oscillatorConfirm,
        timestamp: Date.now(),
      };
    }

    // Close long near resistance
    const longPosition = Array.from(this.positions.values()).find(p => p.type === 'LONG');
    if (longPosition && price >= resistanceThreshold) {
      return {
        type: 'CLOSE_LONG',
        price,
        confidence: 0.8,
        reason: `Take profit at resistance ${rangeHigh.toFixed(2)}`,
        rangePosition,
        oscillatorConfirm: true,
        timestamp: Date.now(),
      };
    }

    // Close short near support
    const shortPosition = Array.from(this.positions.values()).find(p => p.type === 'SHORT');
    if (shortPosition && price <= supportThreshold) {
      return {
        type: 'CLOSE_SHORT',
        price,
        confidence: 0.8,
        reason: `Take profit at support ${rangeLow.toFixed(2)}`,
        rangePosition,
        oscillatorConfirm: true,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Execute a trade based on signal
   */
  executeSignal(signal: RangeSignal): RangePosition | null {
    if (this.positions.size >= this.config.maxPositions) return null;

    const id = `range_${Date.now()}`;
    
    if (signal.type === 'BUY') {
      const position: RangePosition = {
        id,
        type: 'LONG',
        entryPrice: signal.price,
        size: this.config.positionSize,
        stopLoss: signal.price * (1 - this.config.stopLossPercent / 100),
        takeProfit: signal.price * (1 + this.config.takeProfitPercent / 100),
        pnl: 0,
        pnlPercent: 0,
        openedAt: Date.now(),
      };
      this.positions.set(id, position);
      this.signals.push(signal);
      return position;
    }
    
    if (signal.type === 'SELL') {
      const position: RangePosition = {
        id,
        type: 'SHORT',
        entryPrice: signal.price,
        size: this.config.positionSize,
        stopLoss: signal.price * (1 + this.config.stopLossPercent / 100),
        takeProfit: signal.price * (1 - this.config.takeProfitPercent / 100),
        pnl: 0,
        pnlPercent: 0,
        openedAt: Date.now(),
      };
      this.positions.set(id, position);
      this.signals.push(signal);
      return position;
    }
    
    return null;
  }

  /**
   * Close a position
   */
  closePosition(positionId: string, price: number): RangePosition | null {
    const position = this.positions.get(positionId);
    if (!position) return null;
    
    if (position.type === 'LONG') {
      position.pnl = (price - position.entryPrice) * (position.size / position.entryPrice);
      position.pnlPercent = ((price - position.entryPrice) / position.entryPrice) * 100;
    } else {
      position.pnl = (position.entryPrice - price) * (position.size / position.entryPrice);
      position.pnlPercent = ((position.entryPrice - price) / position.entryPrice) * 100;
    }
    
    this.updateMetrics(position);
    this.positions.delete(positionId);
    
    return position;
  }

  /**
   * Update all positions with current price
   */
  private updatePositions(price: number): void {
    for (const position of this.positions.values()) {
      if (position.type === 'LONG') {
        position.pnl = (price - position.entryPrice) * (position.size / position.entryPrice);
        position.pnlPercent = ((price - position.entryPrice) / position.entryPrice) * 100;
      } else {
        position.pnl = (position.entryPrice - price) * (position.size / position.entryPrice);
        position.pnlPercent = ((position.entryPrice - price) / position.entryPrice) * 100;
      }
      
      // Check stop loss
      if (position.type === 'LONG' && price <= position.stopLoss) {
        this.closePosition(position.id, price);
      }
      if (position.type === 'SHORT' && price >= position.stopLoss) {
        this.closePosition(position.id, price);
      }
      
      // Check take profit
      if (position.type === 'LONG' && price >= position.takeProfit) {
        this.closePosition(position.id, price);
      }
      if (position.type === 'SHORT' && price <= position.takeProfit) {
        this.closePosition(position.id, price);
      }
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(closedPosition: RangePosition): void {
    this.metrics.totalTrades++;
    
    if (closedPosition.pnl >= 0) {
      this.metrics.winTrades++;
      this.metrics.avgWin = (this.metrics.avgWin * (this.metrics.winTrades - 1) + closedPosition.pnl) / this.metrics.winTrades;
      this.metrics.largestWin = Math.max(this.metrics.largestWin, closedPosition.pnl);
      this.metrics.currentStreak = this.metrics.currentStreak > 0 ? this.metrics.currentStreak + 1 : 1;
    } else {
      this.metrics.lossTrades++;
      this.metrics.avgLoss = (this.metrics.avgLoss * (this.metrics.lossTrades - 1) + Math.abs(closedPosition.pnl)) / this.metrics.lossTrades;
      this.metrics.largestLoss = Math.min(this.metrics.largestLoss, closedPosition.pnl);
      this.metrics.currentStreak = this.metrics.currentStreak < 0 ? this.metrics.currentStreak - 1 : -1;
    }
    
    this.metrics.maxStreak = Math.max(this.metrics.maxStreak, Math.abs(this.metrics.currentStreak));
    this.metrics.winRate = this.metrics.winTrades / this.metrics.totalTrades;
    this.metrics.totalPnL += closedPosition.pnl;
    this.metrics.avgPnL = this.metrics.totalPnL / this.metrics.totalTrades;
    
    if (this.metrics.avgLoss > 0) {
      this.metrics.profitFactor = this.metrics.avgWin / this.metrics.avgLoss;
    }
    
    this.dailyPnL += closedPosition.pnlPercent;
  }

  /**
   * Get current state
   */
  getState(): {
    config: RangeConfig;
    rangeState: RangeState | null;
    levels: RangeLevel[];
    positions: RangePosition[];
    signals: RangeSignal[];
    metrics: RangeMetrics;
  } {
    return {
      config: this.config,
      rangeState: this.rangeState,
      levels: this.levels,
      positions: Array.from(this.positions.values()),
      signals: this.signals.slice(-50),
      metrics: this.metrics,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RangeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get config
   */
  getConfig(): RangeConfig {
    return this.config;
  }
}

// Default export
const RangeBotDefault = {
  RangeBot,
  DEFAULT_RANGE_CONFIG,
};

export default RangeBotDefault;
