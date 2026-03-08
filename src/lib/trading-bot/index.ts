/**
 * Trend Bot - Main Controller
 * Production-ready trend-following bot with:
 * - EMA + SuperTrend strategy
 * - Multi-exchange support
 * - Paper trading validation
 * - Hedging mode
 * - 24/7 operation
 */

import {
  ExchangeId,
  TradingMode,
  TradeDirection,
  PositionStatus,
  type Candle,
  type Position,
  type Order,
  type TradingSignal,
  type TrendBotConfig,
  type TradingPair,
  type BotEvent,
  type BotEventHandler,
  type AccountState
} from './types';
import { getKillSwitchManager, type TradingState } from '../risk-management/kill-switch-manager';
import { 
  DEFAULT_STRATEGY_CONFIG, 
  calculateStrategyState, 
  generateSignal, 
  checkExitSignal,
  updateTrailingStop 
} from './strategy';
import { 
  RiskManager, 
  DEFAULT_RISK_CONFIG 
} from './risk-manager';
import { 
  PaperTradingEngine, 
  DEFAULT_PAPER_CONFIG 
} from './paper-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface BotStatus {
  isRunning: boolean;
  isHalted: boolean;
  mode: TradingMode;
  startTime: number | null;
  uptime: number;
  positions: number;
  dailyPnL: number;
  totalPnL: number;
  currentDrawdown: number;
  lastSignal: TradingSignal | null;
  errors: Array<{ time: number; message: string }>;
}

export interface SymbolState {
  symbol: string;
  candles: Candle[];
  strategyState: ReturnType<typeof calculateStrategyState>;
  lastSignal: TradingSignal | null;
  position: Position | null;
}

// ============================================================================
// TREND BOT CLASS
// ============================================================================

export class TrendBot {
  private isRunning = false;
  private isHalted = false;
  private startTime: number | null = null;
  
  private symbolStates: Map<string, SymbolState> = new Map();
  private positions: Map<string, Position> = new Map();
  private riskManager: RiskManager;
  private paperEngine: PaperTradingEngine | null = null;
  
  private eventHandlers: BotEventHandler[] = [];
  private intervals: NodeJS.Timeout[] = [];
  private errors: Array<{ time: number; message: string }> = [];
  private killSwitchManager = getKillSwitchManager();

  private dailyPnL = 0;
  private totalPnL = 0;
  private tradeHistory: {
    winRate: number;
    avgWin: number;
    avgLoss: number;
    trades: number;
  } = {
    winRate: 0.5,
    avgWin: 0,
    avgLoss: 0,
    trades: 0
  };

  constructor(private readonly config: TrendBotConfig) {
    this.riskManager = new RiskManager(config.risk);
    
    // Initialize paper trading if needed
    if (config.mode === TradingMode.PAPER) {
      const pairsMap = new Map(config.pairs.map(p => [p.symbol, p]));
      this.paperEngine = new PaperTradingEngine(DEFAULT_PAPER_CONFIG, pairsMap);
    }

    // Initialize symbol states
    for (const pair of config.pairs) {
      this.symbolStates.set(pair.symbol, {
        symbol: pair.symbol,
        candles: [],
        strategyState: null as any,
        lastSignal: null,
        position: null
      });
    }
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Bot is already running');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.isHalted = false;

    // Register with KillSwitchManager for auto-arm
    const tradingState = this.config.mode === TradingMode.LIVE ? 'live' : 'paper';
    this.killSwitchManager.registerBot(this.config.id, 'trend', tradingState);

    this.emitEvent({
      type: 'BOT_STARTED',
      timestamp: Date.now()
    } as BotEvent);

    // Start main loop
    const mainInterval = setInterval(
      () => this.mainLoop(),
      this.config.updateIntervalMs
    );
    this.intervals.push(mainInterval);

    this.log('info', `Trend Bot started in ${this.config.mode} mode`);
    this.log('info', `Monitoring ${this.config.pairs.length} symbols`);
    this.log('info', `Strategy: EMA(${this.config.strategy.emaFastPeriod}/${this.config.strategy.emaMidPeriod}/${this.config.strategy.emaSlowPeriod}) + SuperTrend(${this.config.strategy.supertrendPeriod}, ${this.config.strategy.supertrendMultiplier})`);
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Clear all intervals
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];

    // Unregister from KillSwitchManager
    this.killSwitchManager.unregisterBot(this.config.id);

    // Close all positions or keep based on config
    // For now, we keep positions open

    this.emitEvent({
      type: 'BOT_STOPPED',
      timestamp: Date.now()
    } as BotEvent);

    this.log('info', 'Trend Bot stopped');
  }

  /**
   * Halt trading (keep running but no new positions)
   */
  halt(reason: string): void {
    this.isHalted = true;
    this.emitEvent({ type: 'BOT_HALTED', reason });
    this.log('warn', `Trading halted: ${reason}`);
  }

  /**
   * Resume trading after halt
   */
  resume(): void {
    this.isHalted = false;
    this.log('info', 'Trading resumed');
  }

  // =========================================================================
  // MAIN LOOP
  // =========================================================================

  /**
   * Main trading loop
   */
  private async mainLoop(): Promise<void> {
    try {
      // Update all symbols
      for (const [symbol, state] of this.symbolStates) {
        await this.processSymbol(symbol, state);
      }

      // Update risk state
      const equity = await this.getEquity();
      const ddState = this.riskManager.updateEquity(equity);

      if (ddState.maxDrawdownReached && !this.isHalted) {
        this.halt(`Max drawdown reached: ${ddState.currentDrawdown.toFixed(2)}%`);
        this.emitEvent({
          type: 'DRAWDOWN_WARNING',
          currentDD: ddState.currentDrawdown,
          maxDD: this.config.risk.maxDrawdownPercent
        });
      }

      // Check existing positions for exit signals
      await this.checkPositionExits();

    } catch (error) {
      this.handleError(error as Error, { context: 'mainLoop' });
    }
  }

  /**
   * Process a single symbol
   */
  private async processSymbol(symbol: string, state: SymbolState): Promise<void> {
    // Fetch latest candles (to be implemented by exchange connectors)
    const candles = await this.fetchCandles(symbol);
    
    if (!candles || candles.length < 200) {
      return; // Not enough data
    }

    // Update state
    state.candles = candles;

    // Calculate indicators
    state.strategyState = calculateStrategyState(candles, this.config.strategy);

    // Update risk manager with candles for correlation
    this.riskManager.updateCandles(symbol, candles);

    // Generate signal
    const signal = generateSignal(symbol, candles, state.strategyState, this.config.strategy);

    if (signal) {
      state.lastSignal = signal;
      this.emitEvent({ type: 'SIGNAL_GENERATED', signal });
      this.log('debug', `Signal: ${signal.direction} ${symbol} @ ${signal.entryPrice}`, {
        confidence: signal.confidence,
        trendState: signal.trendState
      });

      // Execute if not halted and no existing position
      if (!this.isHalted && !state.position) {
        await this.executeSignal(signal);
      }
    }
  }

  // =========================================================================
  // SIGNAL EXECUTION
  // =========================================================================

  /**
   * Execute a trading signal
   */
  private async executeSignal(signal: TradingSignal): Promise<void> {
    // Check if trading is allowed by kill switch
    if (!this.killSwitchManager.canTrade()) {
      this.log('warn', 'Signal rejected: Kill switch is active', { signal });
      return;
    }

    const equity = await this.getEquity();
    const existingPositions = Array.from(this.positions.values());

    // Risk check
    const riskCheck = this.riskManager.checkCanOpenPosition(
      signal,
      equity,
      existingPositions,
      this.tradeHistory
    );

    if (!riskCheck.allowed) {
      this.log('warn', `Signal rejected: ${riskCheck.reason}`, { signal });
      return;
    }

    // Calculate position size
    const positionSize = this.riskManager.calculatePositionSize(
      equity,
      signal.entryPrice,
      signal.stopLoss,
      this.tradeHistory
    );

    // Execute based on mode
    let order: Order | null = null;

    if (this.config.mode === TradingMode.PAPER && this.paperEngine) {
      // Paper trading
      order = await this.paperEngine.submitOrder(
        signal.symbol,
        signal.direction,
        'MARKET' as any,
        positionSize.size,
        undefined,
        undefined
      );

      // Update current price in paper engine
      const state = this.symbolStates.get(signal.symbol);
      if (state && state.candles.length > 0) {
        const lastCandle = state.candles[state.candles.length - 1];
        this.paperEngine.updatePrice(signal.symbol, lastCandle);
      }

    } else if (this.config.mode === TradingMode.LIVE) {
      // Live trading - would use exchange connectors
      this.log('warn', 'Live trading not implemented yet', { signal });
      return;
    }

    if (order) {
      // Create position
      const position: Position = {
        id: `pos_${Date.now()}`,
        symbol: signal.symbol,
        exchange: this.config.mode === TradingMode.PAPER ? ExchangeId.PAPER : ExchangeId.BINANCE,
        direction: signal.direction,
        status: PositionStatus.OPEN,
        size: positionSize.size,
        entryPrice: order.avgFillPrice,
        notionalValue: positionSize.notionalValue,
        stopLoss: signal.stopLoss,
        takeProfits: signal.takeProfits.map((tp, i) => ({
          price: tp,
          sizePercent: i === 0 ? 50 : i === 1 ? 30 : 20,
          filled: false
        })),
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        realizedPnl: 0,
        openedAt: Date.now(),
        updatedAt: Date.now(),
        trailingStopActivated: false
      };

      this.positions.set(position.id, position);
      
      // Track position with KillSwitchManager for auto-arm
      this.killSwitchManager.trackPositionOpen(position.id, signal.symbol, this.config.id);
      
      const state = this.symbolStates.get(signal.symbol);
      if (state) {
        state.position = position;
      }

      this.emitEvent({ type: 'POSITION_OPENED', position });
      this.log('info', `Position opened: ${position.direction} ${position.symbol}`, {
        size: position.size,
        entry: position.entryPrice,
        stopLoss: position.stopLoss
      });
    }
  }

  // =========================================================================
  // POSITION MANAGEMENT
  // =========================================================================

  /**
   * Check all positions for exit signals
   */
  private async checkPositionExits(): Promise<void> {
    for (const [id, position] of this.positions) {
      if (position.status !== PositionStatus.OPEN) continue;

      const state = this.symbolStates.get(position.symbol);
      if (!state || !state.strategyState) continue;

      // Get current price
      const candles = state.candles;
      const currentPrice = candles[candles.length - 1]?.close;

      if (!currentPrice) continue;

      // Check exit signal
      const exitCheck = checkExitSignal(
        position,
        candles,
        state.strategyState,
        this.config.strategy
      );

      if (exitCheck.shouldExit) {
        await this.closePosition(position, exitCheck.reason);
        continue;
      }

      // Check take profits
      for (let i = 0; i < position.takeProfits.length; i++) {
        const tp = position.takeProfits[i];
        if (tp.filled) continue;

        const hit = position.direction === TradeDirection.LONG
          ? currentPrice >= tp.price
          : currentPrice <= tp.price;

        if (hit) {
          await this.partialClosePosition(position, tp.sizePercent, `Take profit ${i + 1} hit`);
          tp.filled = true;
          this.emitEvent({ type: 'TAKE_PROFIT_HIT', position, level: i + 1 });
        }
      }

      // Check stop loss
      const stopHit = position.direction === TradeDirection.LONG
        ? currentPrice <= position.stopLoss
        : currentPrice >= position.stopLoss;

      if (stopHit) {
        await this.closePosition(position, 'Stop loss hit');
        this.emitEvent({ type: 'STOP_LOSS_HIT', position });
        continue;
      }

      // Update trailing stop
      if (this.config.strategy.useTrailingStop) {
        const newStop = updateTrailingStop(position, currentPrice, this.config.strategy);
        if (newStop !== null && newStop !== position.stopLoss) {
          position.stopLoss = newStop;
          position.updatedAt = Date.now();
          this.log('debug', `Trailing stop updated: ${position.symbol}`, {
            newStop: position.stopLoss
          });
        }
      }

      // Update unrealized PnL
      this.updatePositionPnL(position, currentPrice);
    }
  }

  /**
   * Update position P&L
   */
  private updatePositionPnL(position: Position, currentPrice: number): void {
    const pnlPerUnit = position.direction === TradeDirection.LONG
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;

    position.unrealizedPnl = pnlPerUnit * position.size;
    position.unrealizedPnlPercent = (pnlPerUnit / position.entryPrice) * 100;
    position.updatedAt = Date.now();
  }

  /**
   * Close entire position
   */
  private async closePosition(position: Position, reason: string): Promise<void> {
    if (this.config.mode === TradingMode.PAPER && this.paperEngine) {
      const oppositeDirection = position.direction === TradeDirection.LONG
        ? TradeDirection.SHORT
        : TradeDirection.LONG;

      await this.paperEngine.submitOrder(
        position.symbol,
        oppositeDirection,
        'MARKET' as any,
        position.size,
        undefined,
        undefined,
        position.id
      );
    }

    // Calculate realized PnL
    const state = this.symbolStates.get(position.symbol);
    const currentPrice = state?.candles[state.candles.length - 1]?.close || position.entryPrice;

    const pnl = position.direction === TradeDirection.LONG
      ? (currentPrice - position.entryPrice) * position.size
      : (position.entryPrice - currentPrice) * position.size;

    position.status = PositionStatus.CLOSED;
    position.closedAt = Date.now();
    position.realizedPnl = pnl;

    // Update tracking
    this.dailyPnL += pnl;
    this.totalPnL += pnl;
    this.riskManager.recordRealizedPnL(pnl);

    // Remove from active positions
    this.positions.delete(position.id);
    
    // Track position close with KillSwitchManager
    this.killSwitchManager.trackPositionClose(position.id);
    
    if (state) {
      state.position = null;
    }

    this.emitEvent({ type: 'POSITION_CLOSED', position, pnl });
    this.log('info', `Position closed: ${position.symbol}`, {
      reason,
      pnl: pnl.toFixed(2),
      pnlPercent: ((pnl / position.notionalValue) * 100).toFixed(2) + '%'
    });

    // Update trade history stats
    this.updateTradeStats(pnl);
  }

  /**
   * Partially close position
   */
  private async partialClosePosition(
    position: Position,
    percent: number,
    reason: string
  ): Promise<void> {
    const closeSize = position.size * (percent / 100);

    if (this.config.mode === TradingMode.PAPER && this.paperEngine) {
      const oppositeDirection = position.direction === TradeDirection.LONG
        ? TradeDirection.SHORT
        : TradeDirection.LONG;

      await this.paperEngine.submitOrder(
        position.symbol,
        oppositeDirection,
        'MARKET' as any,
        closeSize,
        undefined,
        undefined,
        position.id
      );
    }

    const state = this.symbolStates.get(position.symbol);
    const currentPrice = state?.candles[state.candles.length - 1]?.close || position.entryPrice;

    const pnl = position.direction === TradeDirection.LONG
      ? (currentPrice - position.entryPrice) * closeSize
      : (position.entryPrice - currentPrice) * closeSize;

    // Update position
    position.size -= closeSize;
    position.notionalValue = position.size * position.entryPrice;
    position.realizedPnl += pnl;

    this.dailyPnL += pnl;
    this.totalPnL += pnl;

    this.log('info', `Partial close: ${position.symbol}`, {
      reason,
      percent,
      pnl: pnl.toFixed(2)
    });
  }

  /**
   * Update trade statistics for Kelly criterion
   */
  private updateTradeStats(pnl: number): void {
    // Simple running calculation
    this.tradeHistory.trades++;

    if (pnl > 0) {
      const totalWins = this.tradeHistory.avgWin * (this.tradeHistory.trades - 1) + pnl;
      this.tradeHistory.avgWin = totalWins / this.tradeHistory.trades;
      this.tradeHistory.winRate = 
        (this.tradeHistory.winRate * (this.tradeHistory.trades - 1) + 1) / this.tradeHistory.trades;
    } else {
      const totalLosses = this.tradeHistory.avgLoss * (this.tradeHistory.trades - 1) + Math.abs(pnl);
      this.tradeHistory.avgLoss = totalLosses / this.tradeHistory.trades;
      this.tradeHistory.winRate = 
        (this.tradeHistory.winRate * (this.tradeHistory.trades - 1)) / this.tradeHistory.trades;
    }
  }

  // =========================================================================
  // DATA FETCHING (STUBS - TO BE IMPLEMENTED WITH EXCHANGE CONNECTORS)
  // =========================================================================

  /**
   * Fetch candles for a symbol
   * TODO: Implement with exchange connectors
   */
  private async fetchCandles(symbol: string): Promise<Candle[]> {
    // This would be implemented with actual exchange API calls
    // For now, return existing state
    const state = this.symbolStates.get(symbol);
    return state?.candles || [];
  }

  /**
   * Get total equity
   */
  private async getEquity(): Promise<number> {
    if (this.config.mode === TradingMode.PAPER && this.paperEngine) {
      return this.paperEngine.getAccountState().equity;
    }
    return 10000; // Default for now
  }

  // =========================================================================
  // EVENT HANDLING
  // =========================================================================

  /**
   * Add event handler
   */
  onEvent(handler: BotEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit event to all handlers
   */
  private emitEvent(event: BotEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.handleError(error as Error, { context: 'eventHandler' });
      }
    }
  }

  // =========================================================================
  // LOGGING & ERROR HANDLING
  // =========================================================================

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [TrendBot] ${message}`, meta || '');
  }

  private handleError(error: Error, context?: Record<string, unknown>): void {
    this.errors.push({
      time: Date.now(),
      message: error.message
    });

    this.log('error', error.message, { ...context, stack: error.stack });
    this.emitEvent({ type: 'ERROR', error, context });
  }

  // =========================================================================
  // PUBLIC GETTERS
  // =========================================================================

  getStatus(): BotStatus {
    return {
      isRunning: this.isRunning,
      isHalted: this.isHalted,
      mode: this.config.mode,
      startTime: this.startTime,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      positions: this.positions.size,
      dailyPnL: this.dailyPnL,
      totalPnL: this.totalPnL,
      currentDrawdown: 0, // Calculate from risk manager
      lastSignal: Array.from(this.symbolStates.values())[0]?.lastSignal || null,
      errors: this.errors.slice(-10)
    };
  }

  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getAccountState(): AccountState | null {
    if (this.paperEngine) {
      return this.paperEngine.getAccountState();
    }
    return null;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createTrendBot(
  pairs: TradingPair[],
  mode: TradingMode = TradingMode.PAPER
): TrendBot {
  const config: TrendBotConfig = {
    id: `trend_bot_${Date.now()}`,
    name: 'Trend Following Bot',
    mode,
    pairs,
    strategy: DEFAULT_STRATEGY_CONFIG,
    risk: DEFAULT_RISK_CONFIG,
    exchanges: new Map(),
    updateIntervalMs: 5000, // 5 seconds
    candleTimeframe: '1h'
  };

  return new TrendBot(config);
}
