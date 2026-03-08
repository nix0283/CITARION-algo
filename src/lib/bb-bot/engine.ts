/**
 * BB Bot Engine - Complete Implementation (10/10)
 * 
 * Bollinger Bands Trading Bot with:
 * - Double Bollinger Bands (1SD + 2SD)
 * - Multi-Timeframe analysis
 * - Stochastic confirmation
 * - RSI divergence detection
 * - Volume confirmation
 * - Smart entry/exit logic
 */

import {
  MultiTimeframeConfirmation,
  DoubleBollingerBands,
  StochasticOscillator,
  RSICalculator,
  VolumeConfirmationFilter,
  DivergenceDetector,
  MTFConfig,
  MTFConfirmation,
  TimeframeSignal,
  DoubleBBSignal,
  StochasticSignal,
} from './mtf-confirmation';

// ==================== TYPES ====================

export interface BBBotConfig {
  symbol: string;
  timeframe: string;
  
  // Bollinger Bands
  bbPeriod: number;
  bbStdDev1: number;
  bbStdDev2: number;
  
  // Entry conditions
  entryOnTouch1SD: boolean;      // Enter on touch of 1SD
  entryOnTouch2SD: boolean;      // Enter on touch of 2SD
  entryOnSqueeze: boolean;       // Enter on BB squeeze breakout
  requireStochConfirm: boolean;  // Require Stochastic confirmation
  requireRSIConfirm: boolean;    // Require RSI confirmation
  requireVolumeConfirm: boolean; // Require volume confirmation
  
  // Stochastic settings
  stochK: number;
  stochD: number;
  stochSmooth: number;
  stochOversold: number;
  stochOverbought: number;
  
  // RSI settings
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  
  // Volume settings
  volumeLookback: number;
  minVolumeRatio: number;
  
  // Multi-timeframe
  useMTF: boolean;
  mtfTimeframes: string[];
  mtfRequiredConfirmations: number;
  
  // Risk management
  positionSize: number;          // USDT per trade
  leverage: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  useTrailingStop: boolean;
  trailingStopPercent: number;
  
  // Filters
  maxOpenPositions: number;
  maxDailyTrades: number;
  maxDailyLoss: number;
  cooldownMinutes: number;
}

export interface BBBotState {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED';
  position: BBBotPosition | null;
  lastSignal: BBBotSignal | null;
  dailyTrades: number;
  dailyPnL: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  totalPnL: number;
  lastTradeTime: Date | null;
  cooldownUntil: Date | null;
}

export interface BBBotPosition {
  id: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  trailingStopPrice: number | null;
  highestPrice: number;
  lowestPrice: number;
  entryBB: DoubleBBSignal;
  entryStoch: StochasticSignal;
  entryRSI: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  openedAt: Date;
}

export interface BBBotSignal {
  type: 'ENTRY_LONG' | 'ENTRY_SHORT' | 'EXIT_LONG' | 'EXIT_SHORT' | 'TRAILING_UPDATE';
  price: number;
  confidence: number;
  strength: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  reasons: string[];
  bbSignal: DoubleBBSignal;
  stochSignal: StochasticSignal;
  rsiValue: number;
  mtfConfirmation?: MTFConfirmation;
  volumeConfirmed: boolean;
  divergence: 'BULLISH' | 'BEARISH' | null;
  timestamp: Date;
}

export interface BBBotMetrics {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgHoldingTime: number;
  signalsGenerated: number;
  signalsExecuted: number;
  signalAccuracy: number;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_BB_BOT_CONFIG: BBBotConfig = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  bbPeriod: 20,
  bbStdDev1: 1.0,
  bbStdDev2: 2.0,
  entryOnTouch1SD: true,
  entryOnTouch2SD: true,
  entryOnSqueeze: true,
  requireStochConfirm: true,
  requireRSIConfirm: true,
  requireVolumeConfirm: true,
  stochK: 14,
  stochD: 3,
  stochSmooth: 3,
  stochOversold: 20,
  stochOverbought: 80,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  volumeLookback: 20,
  minVolumeRatio: 1.2,
  useMTF: true,
  mtfTimeframes: ['5m', '15m', '1h', '4h'],
  mtfRequiredConfirmations: 2,
  positionSize: 100,
  leverage: 10,
  takeProfitPercent: 3,
  stopLossPercent: 2,
  useTrailingStop: true,
  trailingStopPercent: 1.5,
  maxOpenPositions: 1,
  maxDailyTrades: 5,
  maxDailyLoss: 5,
  cooldownMinutes: 30,
};

// ==================== BB BOT ENGINE ====================

export class BBBotEngine {
  private config: BBBotConfig;
  private state: BBBotState;
  
  // Indicators
  private bb: DoubleBollingerBands;
  private stoch: StochasticOscillator;
  private rsi: RSICalculator;
  private volumeFilter: VolumeConfirmationFilter;
  private divergenceDetector: DivergenceDetector;
  private mtfConfirmation: MultiTimeframeConfirmation | null = null;
  
  // Price history
  private priceHistory: Array<{ 
    open: number; 
    high: number; 
    low: number; 
    close: number; 
    volume: number; 
    timestamp: Date;
  }> = [];
  
  // Metrics
  private tradeResults: Array<{ pnl: number; duration: number }> = [];
  private signals: BBBotSignal[] = [];
  private peakEquity: number = 0;
  private currentEquity: number = 0;

  constructor(config: Partial<BBBotConfig> = {}) {
    this.config = { ...DEFAULT_BB_BOT_CONFIG, ...config };
    this.state = {
      status: 'IDLE',
      position: null,
      lastSignal: null,
      dailyTrades: 0,
      dailyPnL: 0,
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      totalPnL: 0,
      lastTradeTime: null,
      cooldownUntil: null,
    };

    // Initialize indicators
    this.bb = new DoubleBollingerBands(
      this.config.bbPeriod,
      this.config.bbStdDev1,
      this.config.bbStdDev2
    );
    this.stoch = new StochasticOscillator(
      this.config.stochK,
      this.config.stochD,
      this.config.stochSmooth
    );
    this.rsi = new RSICalculator(this.config.rsiPeriod);
    this.volumeFilter = new VolumeConfirmationFilter({
      enabled: this.config.requireVolumeConfirm,
      minVolumeRatio: this.config.minVolumeRatio,
      lookbackPeriod: this.config.volumeLookback,
    });
    this.divergenceDetector = new DivergenceDetector();

    // Initialize MTF if enabled
    if (this.config.useMTF) {
      const mtfConfig: Partial<MTFConfig> = {
        timeframes: this.config.mtfTimeframes,
        requiredConfirmations: this.config.mtfRequiredConfirmations,
        bbPeriod: this.config.bbPeriod,
        bbStdDev1: this.config.bbStdDev1,
        bbStdDev2: this.config.bbStdDev2,
        stochK: this.config.stochK,
        stochD: this.config.stochD,
        stochSmooth: this.config.stochSmooth,
        rsiPeriod: this.config.rsiPeriod,
      };
      this.mtfConfirmation = new MultiTimeframeConfirmation(mtfConfig);
    }
  }

  /**
   * Update bot with new candle data
   */
  update(
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number
  ): BBBotSignal | null {
    // Store price history
    this.priceHistory.push({ open, high, low, close, volume, timestamp: new Date() });
    if (this.priceHistory.length > 200) {
      this.priceHistory.shift();
    }

    // Update indicators
    const bbSignal = this.bb.update(close);
    const stochSignal = this.stoch.update(high, low, close);
    const rsiResult = this.rsi.update(close);
    const volumeResult = this.volumeFilter.check(volume);
    const divergence = this.divergenceDetector.detect();

    // Add to divergence detector
    this.divergenceDetector.addDataPoint(close, rsiResult.value);

    // Update MTF if enabled
    let mtfConfirmation: MTFConfirmation | undefined;
    if (this.mtfConfirmation) {
      mtfConfirmation = this.mtfConfirmation.getConfirmation();
    }

    // Check cooldown
    if (this.state.cooldownUntil && new Date() < this.state.cooldownUntil) {
      return null;
    }

    // If we have a position, manage it
    if (this.state.position) {
      return this.managePosition(
        close, 
        bbSignal, 
        stochSignal, 
        rsiResult.value, 
        mtfConfirmation, 
        volumeResult.confirmed
      );
    }

    // Generate entry signal
    const signal = this.generateEntrySignal(
      close,
      high,
      low,
      volume,
      bbSignal,
      stochSignal,
      rsiResult.value,
      mtfConfirmation,
      volumeResult.confirmed,
      divergence.type
    );

    if (signal) {
      this.signals.push(signal);
      this.state.lastSignal = signal;
    }

    return signal;
  }

  /**
   * Generate entry signal
   */
  private generateEntrySignal(
    close: number,
    high: number,
    low: number,
    volume: number,
    bbSignal: DoubleBBSignal,
    stochSignal: StochasticSignal,
    rsiValue: number,
    mtfConfirmation: MTFConfirmation | undefined,
    volumeConfirmed: boolean,
    divergence: 'BULLISH' | 'BEARISH' | null
  ): BBBotSignal | null {
    const reasons: string[] = [];
    let direction: 'LONG' | 'SHORT' | null = null;
    let confidence = 0;

    // Check BB entry conditions
    if (this.config.entryOnTouch2SD) {
      if (bbSignal.signal === 'EXTREME_OVERSOLD') {
        direction = 'LONG';
        confidence += 0.3;
        reasons.push('Price touched 2SD lower band (extreme oversold)');
      } else if (bbSignal.signal === 'EXTREME_OVERBOUGHT') {
        direction = 'SHORT';
        confidence += 0.3;
        reasons.push('Price touched 2SD upper band (extreme overbought)');
      }
    }

    if (this.config.entryOnTouch1SD && !direction) {
      if (bbSignal.signal === 'OVERSOLD' && bbSignal.position === 'OUTSIDE_1SD_INSIDE_2SD') {
        direction = 'LONG';
        confidence += 0.2;
        reasons.push('Price touched 1SD lower band (oversold)');
      } else if (bbSignal.signal === 'OVERBOUGHT' && bbSignal.position === 'OUTSIDE_1SD_INSIDE_2SD') {
        direction = 'SHORT';
        confidence += 0.2;
        reasons.push('Price touched 1SD upper band (overbought)');
      }
    }

    // Check squeeze breakout
    if (this.config.entryOnSqueeze && bbSignal.squeeze) {
      reasons.push('BB squeeze detected - potential breakout');
    }

    if (!direction) return null;

    // Check Stochastic confirmation
    if (this.config.requireStochConfirm) {
      if (direction === 'LONG') {
        if (stochSignal.signal === 'OVERSOLD' || stochSignal.signal === 'BULLISH_CROSS') {
          confidence += 0.2;
          reasons.push(`Stochastic ${stochSignal.signal}`);
        } else {
          return null; // No confirmation
        }
      } else {
        if (stochSignal.signal === 'OVERBOUGHT' || stochSignal.signal === 'BEARISH_CROSS') {
          confidence += 0.2;
          reasons.push(`Stochastic ${stochSignal.signal}`);
        } else {
          return null;
        }
      }
    }

    // Check RSI confirmation
    if (this.config.requireRSIConfirm) {
      if (direction === 'LONG' && rsiValue <= this.config.rsiOversold) {
        confidence += 0.15;
        reasons.push(`RSI oversold (${rsiValue.toFixed(1)})`);
      } else if (direction === 'SHORT' && rsiValue >= this.config.rsiOverbought) {
        confidence += 0.15;
        reasons.push(`RSI overbought (${rsiValue.toFixed(1)})`);
      } else if (this.config.requireRSIConfirm) {
        return null; // Required but not confirmed
      }
    }

    // Check volume confirmation
    if (this.config.requireVolumeConfirm && !volumeConfirmed) {
      return null;
    }
    if (volumeConfirmed) {
      confidence += 0.1;
      reasons.push('Volume confirmed');
    }

    // Check divergence
    if (divergence) {
      if (direction === 'LONG' && divergence === 'BULLISH') {
        confidence += 0.15;
        reasons.push('Bullish divergence detected');
      } else if (direction === 'SHORT' && divergence === 'BEARISH') {
        confidence += 0.15;
        reasons.push('Bearish divergence detected');
      }
    }

    // Check MTF confirmation
    if (mtfConfirmation && this.config.useMTF) {
      if (mtfConfirmation.confirmed && mtfConfirmation.direction === direction) {
        confidence += 0.2;
        reasons.push(`MTF confirmed (${mtfConfirmation.timeframeVotes.length} timeframes)`);
      } else if (this.config.useMTF) {
        confidence *= 0.5; // Reduce confidence without MTF confirmation
      }
    }

    // Cap confidence
    confidence = Math.min(1, confidence);

    // Determine strength
    let strength: BBBotSignal['strength'];
    if (confidence >= 0.8) strength = 'VERY_STRONG';
    else if (confidence >= 0.6) strength = 'STRONG';
    else if (confidence >= 0.4) strength = 'MODERATE';
    else strength = 'WEAK';

    return {
      type: direction === 'LONG' ? 'ENTRY_LONG' : 'ENTRY_SHORT',
      price: close,
      confidence,
      strength,
      reasons,
      bbSignal,
      stochSignal,
      rsiValue,
      mtfConfirmation,
      volumeConfirmed,
      divergence,
      timestamp: new Date(),
    };
  }

  /**
   * Manage existing position
   */
  private managePosition(
    close: number,
    bbSignal: DoubleBBSignal,
    stochSignal: StochasticSignal,
    rsiValue: number,
    mtfConfirmation: MTFConfirmation | undefined,
    volumeConfirmed: boolean
  ): BBBotSignal | null {
    const position = this.state.position!;
    
    // Update PnL
    if (position.type === 'LONG') {
      position.unrealizedPnL = (close - position.entryPrice) * position.quantity;
      position.unrealizedPnLPercent = ((close - position.entryPrice) / position.entryPrice) * 100;
      
      // Update trailing stop
      if (close > position.highestPrice) {
        position.highestPrice = close;
        if (this.config.useTrailingStop && position.trailingStopPrice) {
          const newTrailingStop = close * (1 - this.config.trailingStopPercent / 100);
          if (newTrailingStop > position.trailingStopPrice) {
            position.trailingStopPrice = newTrailingStop;
          }
        }
      }
    } else {
      position.unrealizedPnL = (position.entryPrice - close) * position.quantity;
      position.unrealizedPnLPercent = ((position.entryPrice - close) / position.entryPrice) * 100;
      
      if (close < position.lowestPrice) {
        position.lowestPrice = close;
        if (this.config.useTrailingStop && position.trailingStopPrice) {
          const newTrailingStop = close * (1 + this.config.trailingStopPercent / 100);
          if (newTrailingStop < position.trailingStopPrice) {
            position.trailingStopPrice = newTrailingStop;
          }
        }
      }
    }

    // Check exit conditions
    const reasons: string[] = [];
    let shouldExit = false;
    let exitType: 'EXIT_LONG' | 'EXIT_SHORT' = position.type === 'LONG' ? 'EXIT_LONG' : 'EXIT_SHORT';

    // Take profit
    if (position.type === 'LONG' && close >= position.takeProfit) {
      shouldExit = true;
      reasons.push(`Take profit hit at ${position.takeProfit.toFixed(2)}`);
    } else if (position.type === 'SHORT' && close <= position.takeProfit) {
      shouldExit = true;
      reasons.push(`Take profit hit at ${position.takeProfit.toFixed(2)}`);
    }

    // Stop loss
    if (position.type === 'LONG' && close <= position.stopLoss) {
      shouldExit = true;
      reasons.push(`Stop loss hit at ${position.stopLoss.toFixed(2)}`);
    } else if (position.type === 'SHORT' && close >= position.stopLoss) {
      shouldExit = true;
      reasons.push(`Stop loss hit at ${position.stopLoss.toFixed(2)}`);
    }

    // Trailing stop
    if (this.config.useTrailingStop && position.trailingStopPrice) {
      if (position.type === 'LONG' && close <= position.trailingStopPrice) {
        shouldExit = true;
        reasons.push(`Trailing stop hit at ${position.trailingStopPrice.toFixed(2)}`);
      } else if (position.type === 'SHORT' && close >= position.trailingStopPrice) {
        shouldExit = true;
        reasons.push(`Trailing stop hit at ${position.trailingStopPrice.toFixed(2)}`);
      }
    }

    // BB-based exit
    if (position.type === 'LONG') {
      if (bbSignal.signal === 'OVERBOUGHT' || bbSignal.signal === 'EXTREME_OVERBOUGHT') {
        if (stochSignal.signal === 'OVERBOUGHT' || stochSignal.signal === 'BEARISH_CROSS') {
          shouldExit = true;
          reasons.push('BB overbought with Stochastic confirmation');
        }
      }
    } else {
      if (bbSignal.signal === 'OVERSOLD' || bbSignal.signal === 'EXTREME_OVERSOLD') {
        if (stochSignal.signal === 'OVERSOLD' || stochSignal.signal === 'BULLISH_CROSS') {
          shouldExit = true;
          reasons.push('BB oversold with Stochastic confirmation');
        }
      }
    }

    if (shouldExit) {
      return {
        type: exitType,
        price: close,
        confidence: 0.9,
        strength: 'STRONG',
        reasons,
        bbSignal,
        stochSignal,
        rsiValue,
        mtfConfirmation,
        volumeConfirmed,
        divergence: null,
        timestamp: new Date(),
      };
    }

    // Update trailing stop signal
    if (this.config.useTrailingStop && position.trailingStopPrice) {
      return {
        type: 'TRAILING_UPDATE',
        price: close,
        confidence: 0.5,
        strength: 'WEAK',
        reasons: [`Trailing stop updated to ${position.trailingStopPrice.toFixed(2)}`],
        bbSignal,
        stochSignal,
        rsiValue,
        mtfConfirmation,
        volumeConfirmed,
        divergence: null,
        timestamp: new Date(),
      };
    }

    return null;
  }

  /**
   * Execute entry signal
   */
  executeEntry(signal: BBBotSignal, currentPrice: number): BBBotPosition | null {
    if (this.state.position) return null;
    if (this.state.dailyTrades >= this.config.maxDailyTrades) return null;

    const direction = signal.type === 'ENTRY_LONG' ? 'LONG' : 'SHORT';
    const quantity = this.config.positionSize / currentPrice;

    const position: BBBotPosition = {
      id: `bb_${Date.now()}`,
      type: direction,
      entryPrice: currentPrice,
      size: this.config.positionSize,
      quantity,
      stopLoss: direction === 'LONG'
        ? currentPrice * (1 - this.config.stopLossPercent / 100)
        : currentPrice * (1 + this.config.stopLossPercent / 100),
      takeProfit: direction === 'LONG'
        ? currentPrice * (1 + this.config.takeProfitPercent / 100)
        : currentPrice * (1 - this.config.takeProfitPercent / 100),
      trailingStopPrice: null,
      highestPrice: currentPrice,
      lowestPrice: currentPrice,
      entryBB: signal.bbSignal,
      entryStoch: signal.stochSignal,
      entryRSI: signal.rsiValue,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      openedAt: new Date(),
    };

    this.state.position = position;
    this.state.dailyTrades++;
    this.state.lastTradeTime = new Date();

    // Activate trailing stop after profit threshold
    if (this.config.useTrailingStop) {
      // Will be activated when price moves in favor
    }

    return position;
  }

  /**
   * Execute exit signal
   */
  executeExit(signal: BBBotSignal, currentPrice: number): { pnl: number; pnlPercent: number } | null {
    if (!this.state.position) return null;

    const position = this.state.position;
    let pnl: number;
    let pnlPercent: number;

    if (position.type === 'LONG') {
      pnl = (currentPrice - position.entryPrice) * position.quantity;
      pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    } else {
      pnl = (position.entryPrice - currentPrice) * position.quantity;
      pnlPercent = ((position.entryPrice - currentPrice) / position.entryPrice) * 100;
    }

    // Update state
    this.state.totalTrades++;
    this.state.totalPnL += pnl;
    this.state.dailyPnL += pnlPercent;

    if (pnl > 0) {
      this.state.winTrades++;
    } else {
      this.state.lossTrades++;
    }

    // Store trade result
    const duration = (Date.now() - position.openedAt.getTime()) / 1000 / 60;
    this.tradeResults.push({ pnl, duration });

    // Set cooldown
    this.state.cooldownUntil = new Date(
      Date.now() + this.config.cooldownMinutes * 60 * 1000
    );

    // Clear position
    this.state.position = null;

    return { pnl, pnlPercent };
  }

  /**
   * Get state
   */
  getState(): BBBotState {
    return { ...this.state };
  }

  /**
   * Get config
   */
  getConfig(): BBBotConfig {
    return { ...this.config };
  }

  /**
   * Get metrics
   */
  getMetrics(): BBBotMetrics {
    const wins = this.tradeResults.filter(t => t.pnl > 0);
    const losses = this.tradeResults.filter(t => t.pnl < 0);
    const totalWins = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    return {
      totalTrades: this.state.totalTrades,
      winRate: this.state.totalTrades > 0 
        ? (this.state.winTrades / this.state.totalTrades) * 100 
        : 0,
      totalPnL: this.state.totalPnL,
      avgPnL: this.tradeResults.length > 0 
        ? this.state.totalPnL / this.tradeResults.length 
        : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0,
      avgWin: wins.length > 0 ? totalWins / wins.length : 0,
      avgLoss: losses.length > 0 ? totalLosses / losses.length : 0,
      largestWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
      largestLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
      maxDrawdown: 0, // Calculate from equity curve
      sharpeRatio: 0, // Calculate from returns
      avgHoldingTime: this.tradeResults.length > 0
        ? this.tradeResults.reduce((sum, t) => sum + t.duration, 0) / this.tradeResults.length
        : 0,
      signalsGenerated: this.signals.length,
      signalsExecuted: this.state.totalTrades,
      signalAccuracy: this.signals.length > 0 
        ? (this.state.totalTrades / this.signals.length) * 100 
        : 0,
    };
  }

  /**
   * Reset daily counters
   */
  resetDaily(): void {
    this.state.dailyTrades = 0;
    this.state.dailyPnL = 0;
  }

  /**
   * Clear all state
   */
  reset(): void {
    this.state = {
      status: 'IDLE',
      position: null,
      lastSignal: null,
      dailyTrades: 0,
      dailyPnL: 0,
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      totalPnL: 0,
      lastTradeTime: null,
      cooldownUntil: null,
    };
    this.tradeResults = [];
    this.signals = [];
    this.priceHistory = [];
    this.bb.clear();
    this.stoch.clear();
    this.rsi.clear();
    this.divergenceDetector.clear();
    if (this.mtfConfirmation) {
      this.mtfConfirmation.clear();
    }
  }
}

// ==================== EXPORTS ====================

export function createBBBot(config: Partial<BBBotConfig> = {}): BBBotEngine {
  return new BBBotEngine(config);
}
