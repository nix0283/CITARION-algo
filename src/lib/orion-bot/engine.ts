/**
 * ORION BOT - Main Engine
 *
 * Trend-Following Hunter
 * Named after the Greek mythological hunter who pursues targets across the sky.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                      ORION ENGINE                           │
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
 * │  │   Signal    │  │    Risk     │  │   Hedging   │         │
 * │  │   Engine    │→ │   Manager   │→ │   Engine    │         │
 * │  │ EMA+STrend  │  │   Kelly     │  │  State Mach.│         │
 * │  └─────────────┘  └─────────────┘  └─────────────┘         │
 * │         ↓                ↓                ↓                 │
 * │  ┌─────────────────────────────────────────────────┐       │
 * │  │              Exchange Adapter Layer              │       │
 * │  │   Binance │ Bybit │ OKX │ Bitget │ Hyperliquid  │       │
 * │  └─────────────────────────────────────────────────┘       │
 * │         ↓                ↓                ↓                 │
 * │  ┌─────────────────────────────────────────────────┐       │
 * │  │           Validation Pipeline (Paper)            │       │
 * │  └─────────────────────────────────────────────────┘       │
 * └─────────────────────────────────────────────────────────────┘
 */

import type {
  OrionBotConfig,
  OrionBotState,
  OrionPosition,
  TrendSignal,
  BotStatus,
  BotMode,
  Candle,
  OrionEvent,
  OrionEventType,
} from './types';

import { SignalEngine, defaultStrategyConfig } from './signal-engine';
import { RiskManager, defaultRiskConfig, calculateKelly } from './risk-manager';
import { HedgingEngine, HedgeDecisionEngine, HedgeDecision } from './hedging-engine';
import { ExchangeManager, PaperTradingAdapter, type ExchangeAdapter } from './exchange-adapter';
import { ValidationPipeline, ValidationManager, defaultValidationCriteria } from './validation-pipeline';

// =============================================================================
// ORION ENGINE
// =============================================================================

export class OrionEngine {
  private config: OrionBotConfig;
  private state: OrionBotState;
  private signalEngine: SignalEngine;
  private riskManager: RiskManager;
  private hedgingEngine: HedgingEngine;
  private hedgeDecisionEngine: HedgeDecisionEngine;
  private exchangeManager: ExchangeManager;
  private validationPipeline: ValidationPipeline;
  private eventListeners: Map<OrionEventType, ((event: OrionEvent) => void)[]> = new Map();

  private heartbeatInterval: NodeJS.Timeout | null = null;
  private analysisInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<OrionBotConfig> = {}) {
    this.config = this.buildConfig(config);
    this.state = this.initializeState();
    this.signalEngine = new SignalEngine(this.config.strategy);
    this.riskManager = new RiskManager(this.config.risk);
    this.hedgingEngine = new HedgingEngine(this.config.hedging.autoHedgeCorrelation);
    this.hedgeDecisionEngine = new HedgeDecisionEngine(this.hedgingEngine);
    this.exchangeManager = new ExchangeManager();
    this.validationPipeline = new ValidationPipeline(defaultValidationCriteria);
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Initialize and start the bot
   */
  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.state.status !== 'STOPPED') {
      return { success: false, message: 'Bot is already running' };
    }

    try {
      this.state.status = 'STARTING';
      this.state.startTime = Date.now();
      this.state.lastHeartbeat = Date.now();

      // Initialize paper trading adapter
      const paperAdapter = new PaperTradingAdapter('orion-paper', { USDT: 10000 });
      this.exchangeManager.registerAdapter(paperAdapter);

      // Start validation pipeline
      if (this.config.paperValidationRequired) {
        this.validationPipeline.start();
      }

      // Start heartbeat
      this.heartbeatInterval = setInterval(() => {
        this.heartbeat();
      }, 5000);

      // Start analysis loop
      this.analysisInterval = setInterval(() => {
        this.runAnalysisCycle();
      }, 60000); // Every minute

      this.state.status = 'RUNNING';
      this.state.mode = 'PAPER';

      this.emitEvent({
        id: `event-${Date.now()}`,
        type: 'RECOVERY',
        timestamp: Date.now(),
        data: { action: 'started', mode: 'PAPER' },
        severity: 'INFO',
      });

      return { success: true, message: `Orion started in PAPER mode. Validation required before live.` };
    } catch (error) {
      this.state.status = 'ERROR';
      return {
        success: false,
        message: `Failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<{ success: boolean; message: string }> {
    if (this.state.status === 'STOPPED') {
      return { success: false, message: 'Bot is already stopped' };
    }

    try {
      // Clear intervals
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.analysisInterval) {
        clearInterval(this.analysisInterval);
        this.analysisInterval = null;
      }

      // Close all positions
      await this.closeAllPositions();

      // Disconnect exchanges
      await this.exchangeManager.disconnectAll();

      this.state.status = 'STOPPED';
      this.state.startTime = null;

      return { success: true, message: 'Orion stopped successfully' };
    } catch (error) {
      return {
        success: false,
        message: `Failed to stop: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Halt trading (keep running but don't open new positions)
   */
  public halt(reason: string): void {
    this.state.status = 'HALTED';
    this.emitEvent({
      id: `event-${Date.now()}`,
      type: 'DRAWDOWN_HALT',
      timestamp: Date.now(),
      data: { reason },
      severity: 'WARN',
    });
  }

  /**
   * Resume trading after halt
   */
  public resume(): void {
    if (this.state.status === 'HALTED') {
      this.state.status = 'RUNNING';
    }
  }

  /**
   * Switch to live mode (requires validation)
   */
  public async goLive(): Promise<{ success: boolean; message: string }> {
    if (this.config.paperValidationRequired && !this.validationPipeline.canGoLive()) {
      const result = this.validationPipeline.check();
      return {
        success: false,
        message: `Validation not complete. Status: ${result.status}. ${result.failureReason || ''}`
      };
    }

    this.state.mode = 'LIVE';
    return { success: true, message: 'Orion switched to LIVE mode' };
  }

  // ===========================================================================
  // TRADING
  // ===========================================================================

  /**
   * Process a signal and potentially open a position
   */
  public async processSignal(signal: TrendSignal): Promise<OrionPosition | null> {
    if (this.state.status !== 'RUNNING') {
      return null;
    }

    if (signal.direction === 'FLAT') {
      return null;
    }

    // Check hedging scenario
    const hedgeScenario = this.hedgingEngine.checkHedgeScenario(
      signal,
      Array.from(this.state.positions.values())
    );

    // Get account balance
    const balance = await this.getAccountBalance();
    const positions = Array.from(this.state.positions.values());

    // Calculate position size
    const positionSizing = this.riskManager.calculatePositionSize(
      signal,
      balance,
      positions
    );

    if (positionSizing.size === 0) {
      this.emitEvent({
        id: `event-${Date.now()}`,
        type: 'SIGNAL_FILTERED',
        timestamp: Date.now(),
        data: { signalId: signal.id, reason: positionSizing.reasoning },
        severity: 'INFO',
      });
      return null;
    }

    // Calculate stop loss and take profits
    const stopLoss = this.riskManager.calculateStopLoss(signal);
    const takeProfits = this.riskManager.calculateTakeProfits(signal, stopLoss);

    // Execute order
    const adapter = this.exchangeManager.getAdapter(signal.exchange);
    if (!adapter) {
      return null;
    }

    try {
      const side = signal.direction === 'LONG' ? 'BUY' : 'SELL';

      // Set leverage
      await adapter.setLeverage(signal.symbol, positionSizing.leverage);

      // Open position
      const order = await adapter.placeOrder(
        signal.symbol,
        side,
        'MARKET',
        positionSizing.size
      );

      // Create position record
      const position: OrionPosition = {
        id: `pos-${signal.exchange}-${signal.symbol}-${Date.now()}`,
        signalId: signal.id,
        exchange: signal.exchange,
        symbol: signal.symbol,
        side: signal.direction,
        status: 'ACTIVE',
        entryPrice: order.avgFillPrice,
        currentPrice: signal.price,
        size: positionSizing.size,
        value: positionSizing.size * order.avgFillPrice,
        leverage: positionSizing.leverage,
        unrealizedPnL: 0,
        unrealizedPnLPct: 0,
        realizedPnL: 0,
        stopLoss,
        takeProfits: takeProfits.map((tp, i) => ({
          id: `tp-${i}`,
          price: tp.price,
          sizePct: tp.sizePct,
          status: 'pending',
        })),
        trailingStop: {
          enabled: true,
          activationPct: 2,
          trailPct: 1.5,
          currentTrigger: null,
        },
        openedAt: Date.now(),
        closedAt: null,
        updatedAt: Date.now(),
        risk: {
          riskPct: positionSizing.riskPct * 100,
          riskAmount: positionSizing.riskAmount,
          kellyScore: positionSizing.riskPct / 0.02,
          riskRewardRatio: takeProfits[0].riskRewardRatio,
          maxAdverseExcursion: 0,
          maxFavorableExcursion: 0,
        },
        hedgeInfo: this.hedgingEngine.getHedgeInfo({
          ...{} as OrionPosition,
          exchange: signal.exchange,
          symbol: signal.symbol,
          side: signal.direction,
          value: positionSizing.size * order.avgFillPrice,
        }),
      };

      // Register in hedging engine
      this.hedgingEngine.registerPosition(position);

      // Add to state
      this.state.positions.set(position.id, position);

      // Place stop loss order
      const stopSide = signal.direction === 'LONG' ? 'SELL' : 'BUY';
      await adapter.placeStopLoss(signal.symbol, stopSide, stopLoss, positionSizing.size);

      // Place take profit orders
      for (const tp of position.takeProfits) {
        await adapter.placeTakeProfit(signal.symbol, stopSide, tp.price, positionSizing.size * tp.sizePct / 100);
      }

      this.emitEvent({
        id: `event-${Date.now()}`,
        type: 'POSITION_OPENED',
        timestamp: Date.now(),
        data: { positionId: position.id, signal: signal.id },
        severity: 'INFO',
      });

      return position;
    } catch (error) {
      this.addError('TRADE_ERROR', error instanceof Error ? error.message : 'Trade failed', {
        signal,
        sizing: positionSizing,
      });
      return null;
    }
  }

  /**
   * Close a specific position
   */
  public async closePosition(
    positionId: string,
    reason: string = 'Manual close'
  ): Promise<boolean> {
    const position = this.state.positions.get(positionId);
    if (!position) return false;

    const adapter = this.exchangeManager.getAdapter(position.exchange);
    if (!adapter) return false;

    try {
      await adapter.closePosition(position.symbol, position.side);

      position.status = 'CLOSED';
      position.closedAt = Date.now();

      this.hedgingEngine.removePosition(position);
      this.state.positions.delete(positionId);

      this.emitEvent({
        id: `event-${Date.now()}`,
        type: 'POSITION_CLOSED',
        timestamp: Date.now(),
        data: { positionId, reason },
        severity: 'INFO',
      });

      return true;
    } catch (error) {
      this.addError('CLOSE_ERROR', error instanceof Error ? error.message : 'Close failed', {
        positionId,
      });
      return false;
    }
  }

  /**
   * Close all positions
   */
  public async closeAllPositions(): Promise<void> {
    for (const positionId of this.state.positions.keys()) {
      await this.closePosition(positionId, 'Bot shutdown');
    }
  }

  // ===========================================================================
  // ANALYSIS
  // ===========================================================================

  /**
   * Run analysis cycle
   */
  private async runAnalysisCycle(): Promise<void> {
    if (this.state.status !== 'RUNNING') return;

    // For each configured exchange/symbol
    for (const exchangeConfig of this.config.exchanges) {
      if (!exchangeConfig.enabled) continue;

      const adapter = this.exchangeManager.getAdapter(exchangeConfig.exchange);
      if (!adapter) continue;

      for (const symbol of exchangeConfig.symbols) {
        try {
          // Get candles
          const candles = await adapter.getCandles(
            symbol,
            this.config.strategy.timeframes.primary,
            300 // Enough for EMA200 + buffer
          );

          if (candles.length < 200) continue;

          // Generate signal
          const signal = this.signalEngine.analyze(candles, exchangeConfig.exchange, symbol);

          if (signal && signal.direction !== 'FLAT') {
            this.state.pendingSignals.push(signal);

            this.emitEvent({
              id: `event-${Date.now()}`,
              type: 'SIGNAL_GENERATED',
              timestamp: Date.now(),
              data: { signal },
              severity: 'INFO',
            });

            // Process signal
            await this.processSignal(signal);
          }

          // Update existing positions
          await this.updatePositionsForSymbol(adapter, symbol, candles);

        } catch (error) {
          this.addError('ANALYSIS_ERROR', error instanceof Error ? error.message : 'Analysis failed', {
            exchange: exchangeConfig.exchange,
            symbol,
          });
        }
      }
    }

    // Check risk limits
    const riskCheck = this.riskManager.shouldHalt();
    if (riskCheck.halt) {
      this.halt(riskCheck.reason);
    }

    // Update validation
    const validation = this.validationPipeline.check();
    if (validation.isComplete()) {
      if (validation.status === 'VALIDATED') {
        this.emitEvent({
          id: `event-${Date.now()}`,
          type: 'RECOVERY',
          timestamp: Date.now(),
          data: { action: 'validation_passed' },
          severity: 'INFO',
        });
      }
    }
  }

  /**
   * Update positions for a symbol
   */
  private async updatePositionsForSymbol(
    adapter: ExchangeAdapter,
    symbol: string,
    candles: Candle[]
  ): Promise<void> {
    const currentPrice = candles[candles.length - 1]?.close || 0;
    if (!currentPrice) return;

    for (const position of this.state.positions.values()) {
      if (position.symbol !== symbol || position.status !== 'ACTIVE') continue;

      // Update current price and PnL
      position.currentPrice = currentPrice;
      const direction = position.side === 'LONG' ? 1 : -1;
      position.unrealizedPnL = direction * (currentPrice - position.entryPrice) * position.size;
      position.unrealizedPnLPct = direction * (currentPrice / position.entryPrice - 1) * 100;

      // Track MAE/MFE
      if (position.unrealizedPnLPct < position.risk.maxAdverseExcursion) {
        position.risk.maxAdverseExcursion = position.unrealizedPnLPct;
      }
      if (position.unrealizedPnLPct > position.risk.maxFavorableExcursion) {
        position.risk.maxFavorableExcursion = position.unrealizedPnLPct;
      }

      // Check hedge decisions
      const hedgeDecision = this.hedgeDecisionEngine.decide(position, currentPrice, null);
      if (hedgeDecision.action !== 'NO_ACTION') {
        this.emitEvent({
          id: `event-${Date.now()}`,
          type: 'RISK_LIMIT_WARNING',
          timestamp: Date.now(),
          data: { positionId: position.id, decision: hedgeDecision },
          severity: 'WARN',
        });
      }

      // Check trailing stop
      if (position.trailingStop.enabled && position.unrealizedPnLPct > position.trailingStop.activationPct) {
        const newTrigger = currentPrice * (1 - position.trailingStop.trailPct / 100);
        if (!position.trailingStop.currentTrigger || newTrigger > position.trailingStop.currentTrigger) {
          position.trailingStop.currentTrigger = newTrigger;

          this.emitEvent({
            id: `event-${Date.now()}`,
            type: 'TRAILING_STOP_ACTIVATED',
            timestamp: Date.now(),
            data: { positionId: position.id, trigger: newTrigger },
            severity: 'INFO',
          });
        }
      }

      // Check if stop loss or trailing stop hit
      if (position.trailingStop.currentTrigger && currentPrice <= position.trailingStop.currentTrigger) {
        await this.closePosition(position.id, 'Trailing stop hit');
      } else if (position.side === 'LONG' && currentPrice <= position.stopLoss) {
        await this.closePosition(position.id, 'Stop loss hit');
      } else if (position.side === 'SHORT' && currentPrice >= position.stopLoss) {
        await this.closePosition(position.id, 'Stop loss hit');
      }

      position.updatedAt = Date.now();
    }
  }

  // ===========================================================================
  // STATE & EVENTS
  // ===========================================================================

  /**
   * Get bot state
   */
  public getState(): OrionBotState {
    return { ...this.state };
  }

  /**
   * Get config
   */
  public getConfig(): OrionBotConfig {
    return { ...this.config };
  }

  /**
   * Get validation status
   */
  public getValidationStatus() {
    return this.validationPipeline.check();
  }

  /**
   * Subscribe to events
   */
  public on(eventType: OrionEventType, listener: (event: OrionEvent) => void): void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.push(listener);
    this.eventListeners.set(eventType, listeners);
  }

  /**
   * Emit event
   */
  private emitEvent(event: OrionEvent): void {
    const listeners = this.eventListeners.get(event.type) || [];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private heartbeat(): void {
    this.state.lastHeartbeat = Date.now();

    // Check for stale state
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - this.state.lastHeartbeat > staleThreshold) {
      this.halt('Heartbeat timeout');
    }
  }

  private async getAccountBalance(): Promise<number> {
    const adapter = this.exchangeManager.getPrimaryAdapter();
    if (!adapter) return 0;

    const balance = await adapter.getBalance('USDT');
    return balance?.total || 0;
  }

  private addError(code: string, message: string, context: Record<string, unknown>): void {
    this.state.errors.push({
      id: `err-${Date.now()}`,
      timestamp: Date.now(),
      code,
      message,
      context,
      recovered: false,
    });

    // Keep only last 100 errors
    if (this.state.errors.length > 100) {
      this.state.errors.shift();
    }
  }

  private buildConfig(partial: Partial<OrionBotConfig>): OrionBotConfig {
    return {
      name: partial.name || 'Orion',
      version: partial.version || '1.0.0',
      mode: partial.mode || 'PAPER',
      paperValidationRequired: partial.paperValidationRequired ?? true,
      minPaperDuration: partial.minPaperDuration || 7 * 24 * 60 * 60 * 1000,
      exchanges: partial.exchanges || [],
      strategy: { ...defaultStrategyConfig, ...partial.strategy },
      risk: { ...defaultRiskConfig, ...partial.risk },
      hedging: {
        enabled: true,
        allowOppositePositions: true,
        autoHedgeCorrelation: 0.7,
        ...partial.hedging,
      },
      notifications: partial.notifications || {
        telegram: false,
        email: false,
        onSignal: true,
        onTrade: true,
        onRiskEvent: true,
      },
      logLevel: partial.logLevel || 'INFO',
    };
  }

  private initializeState(): OrionBotState {
    return {
      status: 'STOPPED',
      instanceId: `orion-${Date.now()}`,
      startTime: null,
      lastHeartbeat: Date.now(),
      positions: new Map(),
      pendingSignals: [],
      riskMetrics: {
        portfolioRisk: 0,
        drawdown: 0,
        dailyPnL: 0,
        openRisk: 0,
        usedMargin: 0,
        availableMargin: 1,
        marginRatio: 0,
        winRate: 0.5,
        avgWinLossRatio: 1.5,
        kellyOptimal: 0.01,
        expectedValue: 0,
        sharpeRatio: 0,
        updatedAt: Date.now(),
      },
      dailyStats: {
        date: new Date().toISOString().split('T')[0],
        trades: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
        pnlPct: 0,
        maxDrawdown: 0,
        signalsGenerated: 0,
        signalsExecuted: 0,
      },
      lifetimeStats: {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnl: 0,
        totalPnlPct: 0,
        maxDrawdown: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        calmarRatio: 0,
        avgHoldingTime: 0,
        startedAt: Date.now(),
      },
      errors: [],
      mode: 'PAPER',
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { SignalEngine } from './signal-engine';
export { RiskManager, calculateKelly } from './risk-manager';
export { HedgingEngine, HedgeDecisionEngine } from './hedging-engine';
export { ExchangeManager, PaperTradingAdapter } from './exchange-adapter';
export { ValidationPipeline, ValidationManager } from './validation-pipeline';

export const ORION_VERSION = '1.0.0';
export const ORION_NAME = 'Orion - Trend-Following Hunter';
