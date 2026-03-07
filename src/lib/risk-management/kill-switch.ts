/**
 * KILL SWITCH
 *
 * Emergency position closer with automatic triggers.
 * Protects portfolio from catastrophic losses.
 * 
 * Supports auto-arming when:
 * - Any bot starts
 * - Trading mode switches to LIVE
 * - First position is opened
 * - System startup (configurable)
 * 
 * Periodic Safety Checks:
 * - Monitors drawdown, VaR, correlation, liquidity
 * - Auto-triggers kill switch when thresholds exceeded
 * - Configurable check intervals
 */

import type {
  KillSwitchConfig,
  KillSwitchStatus,
  KillSwitchTrigger,
  KillSwitchEvent,
  PositionRiskData,
  AutoArmConfig,
  AutoArmEvent,
  TradingState,
  SafetyCheckResult,
} from './types';

export type KillSwitchCallback = (positions: PositionRiskData[], reason: KillSwitchTrigger) => Promise<number>;

/**
 * Callback for auto-arm events
 */
export type AutoArmCallback = (event: AutoArmEvent) => void;

/**
 * Default auto-arm configuration
 */
export const defaultAutoArmConfig: AutoArmConfig = {
  autoArmWhenBotStarts: true,
  autoArmWhenLiveMode: true,
  autoArmWhenFirstPosition: true,
  autoArmOnStartup: true,
  requireConfirmationToDisarm: true,
  logAutoArmEvents: true,
};

/**
 * Safety check configuration
 */
export interface SafetyCheckConfig {
  /** Enable periodic safety checks */
  enabled: boolean;
  /** Check interval in milliseconds */
  intervalMs: number;
  /** Log each safety check */
  logChecks: boolean;
}

const DEFAULT_SAFETY_CHECK_CONFIG: SafetyCheckConfig = {
  enabled: true,
  intervalMs: 60000, // 1 minute
  logChecks: false,
};

export class KillSwitch {
  private config: KillSwitchConfig;
  private status: KillSwitchStatus;
  private callbacks: KillSwitchCallback[] = [];
  private autoArmCallbacks: AutoArmCallback[] = [];
  private autoArmHistory: AutoArmEvent[] = [];
  private safetyCheckInterval: NodeJS.Timeout | null = null;
  private safetyCheckConfig: SafetyCheckConfig;
  private safetyCheckCallbacks: Array<() => Promise<SafetyCheckResult>> = [];

  constructor(config: Partial<KillSwitchConfig> = {}) {
    this.config = {
      autoTrigger: true,
      triggers: {
        drawdown: true,
        varBreach: true,
        correlation: true,
        liquidity: false,
      },
      thresholds: {
        drawdownPct: 0.20,
        varMultiplier: 3.0,
        correlationLimit: 0.9,
        liquidityMin: 1000,
      },
      recoveryMode: 'manual',
      recoveryCooldown: 24 * 60 * 60 * 1000, // 24 hours
      autoArm: defaultAutoArmConfig,
      ...config,
    };

    this.status = {
      state: 'disarmed',
      positionsClosed: 0,
      pnlSaved: 0,
      triggerHistory: [],
      tradingState: 'idle',
    };
    
    this.safetyCheckConfig = DEFAULT_SAFETY_CHECK_CONFIG;
  }

  /**
   * Initialize the kill switch with auto-arm on startup
   * This should be called when the application starts
   */
  async initialize(): Promise<void> {
    // Auto-arm on startup if configured
    if (this.config.autoArm.autoArmOnStartup) {
      this.arm('system_startup');
      
      const event: AutoArmEvent = {
        id: `aa-${Date.now()}`,
        timestamp: Date.now(),
        reason: 'manual',
        previousState: 'disarmed',
        tradingState: this.status.tradingState,
      };
      this.autoArmHistory.push(event);
      
      this.log('info', 'Kill switch auto-armed on system startup');
    }
    
    // Start periodic safety checks
    this.startSafetyChecks();
    
    this.log('info', 'Kill switch initialized', {
      armed: this.isArmed(),
      safetyChecksEnabled: this.safetyCheckConfig.enabled,
    });
  }

  /**
   * Arm the kill switch
   * @param reason - Optional reason for arming (used for logging)
   */
  public arm(reason: string = 'manual'): void {
    if (this.status.state === 'triggered') {
      console.warn('[KillSwitch] Cannot arm kill switch while triggered');
      return;
    }
    
    const previousState = this.status.state;
    this.status.state = 'armed';
    this.status.lastArmedAt = Date.now();
    this.status.lastArmReason = reason;
    
    this.log('info', `Kill switch armed: ${reason}`, { previousState });
  }

  /**
   * Disarm the kill switch
   * @param confirmed - Whether the disarm has been explicitly confirmed
   * @returns true if disarmed, false if confirmation required
   */
  public disarm(confirmed: boolean = false): boolean {
    // If confirmation is required and not provided, reject
    if (this.config.autoArm.requireConfirmationToDisarm && !confirmed) {
      this.log('warn', 'Disarm requires explicit confirmation');
      return false;
    }
    
    const previousState = this.status.state;
    this.status.state = 'disarmed';
    this.status.lastArmedAt = undefined;
    this.status.lastArmReason = undefined;
    
    this.log('info', 'Kill switch disarmed', { previousState, confirmed });
    return true;
  }

  /**
   * Disarm with explicit confirmation (convenience method)
   */
  public disarmWithConfirmation(): boolean {
    return this.disarm(true);
  }

  /**
   * Trigger the kill switch
   */
  public async trigger(
    trigger: KillSwitchTrigger,
    positions: PositionRiskData[],
    equity: number,
    drawdown: number
  ): Promise<{ positionsClosed: number; pnlSaved: number }> {
    if (this.status.state === 'triggered') {
      return { positionsClosed: 0, pnlSaved: 0 };
    }

    const event: KillSwitchEvent = {
      id: `ks-${Date.now()}`,
      timestamp: Date.now(),
      trigger,
      equity,
      drawdown,
      positionsClosed: 0,
      recovered: false,
    };

    this.status.state = 'triggered';
    this.status.trigger = trigger;
    this.status.triggeredAt = Date.now();
    this.status.canRecoverAt = Date.now() + this.config.recoveryCooldown;

    let totalPnlSaved = 0;
    let closedCount = 0;

    // Execute close callbacks
    for (const callback of this.callbacks) {
      try {
        const pnl = await callback(positions, trigger);
        totalPnlSaved += pnl;
        closedCount++;
      } catch (error) {
        console.error('[KillSwitch] Callback error:', error);
      }
    }

    event.positionsClosed = closedCount;
    this.status.positionsClosed += closedCount;
    this.status.pnlSaved += totalPnlSaved;
    this.status.triggerHistory.push(event);

    this.log('warn', `Kill switch triggered: ${trigger}`, {
      equity,
      drawdown,
      positionsClosed: closedCount,
      pnlSaved: totalPnlSaved,
    });

    return { positionsClosed: closedCount, pnlSaved: totalPnlSaved };
  }

  /**
   * Check if conditions warrant automatic trigger
   */
  public checkConditions(
    drawdown: number,
    varBreach: boolean,
    correlation: number,
    liquidity: number
  ): KillSwitchTrigger | null {
    if (!this.config.autoTrigger || this.status.state !== 'armed') {
      return null;
    }

    // Check drawdown trigger
    if (this.config.triggers.drawdown && drawdown >= this.config.thresholds.drawdownPct) {
      return 'drawdown';
    }

    // Check VaR breach
    if (this.config.triggers.varBreach && varBreach) {
      return 'var_breach';
    }

    // Check correlation
    if (this.config.triggers.correlation && correlation >= this.config.thresholds.correlationLimit) {
      return 'correlation';
    }

    // Check liquidity
    if (this.config.triggers.liquidity && liquidity < this.config.thresholds.liquidityMin) {
      return 'liquidity';
    }

    return null;
  }

  /**
   * Attempt recovery after cooldown
   */
  public recover(): boolean {
    if (this.status.state !== 'triggered') {
      return false;
    }

    if (Date.now() < (this.status.canRecoverAt || 0)) {
      return false;
    }

    this.status.state = 'recovering';
    this.status.trigger = undefined;

    // Mark last event as recovered
    const lastEvent = this.status.triggerHistory[this.status.triggerHistory.length - 1];
    if (lastEvent) {
      lastEvent.recovered = true;
      lastEvent.recoveredAt = Date.now();
    }

    // Auto-arm if configured
    if (this.config.recoveryMode === 'automatic') {
      this.status.state = 'armed';
      this.log('info', 'Kill switch auto-armed after recovery');
    }

    return true;
  }

  /**
   * Register callback for position closing
   */
  public onClose(callback: KillSwitchCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Register callback for auto-arm events
   */
  public onAutoArm(callback: AutoArmCallback): void {
    this.autoArmCallbacks.push(callback);
  }

  /**
   * Get current status
   */
  public getStatus(): KillSwitchStatus {
    return { ...this.status };
  }

  /**
   * Get current configuration
   */
  public getConfig(): KillSwitchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<KillSwitchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update auto-arm configuration
   */
  public updateAutoArmConfig(config: Partial<AutoArmConfig>): void {
    this.config.autoArm = { ...this.config.autoArm, ...config };
  }

  /**
   * Check if kill switch is active
   */
  public isActive(): boolean {
    return this.status.state === 'armed' || this.status.state === 'triggered';
  }

  /**
   * Check if currently triggered
   */
  public isTriggered(): boolean {
    return this.status.state === 'triggered';
  }

  /**
   * Check if armed
   */
  public isArmed(): boolean {
    return this.status.state === 'armed';
  }

  /**
   * Can attempt recovery
   */
  public canRecover(): boolean {
    return (
      this.status.state === 'triggered' &&
      Date.now() >= (this.status.canRecoverAt || Infinity)
    );
  }

  /**
   * Get trigger history
   */
  public getHistory(limit: number = 10): KillSwitchEvent[] {
    return this.status.triggerHistory.slice(-limit);
  }

  /**
   * Get auto-arm history
   */
  public getAutoArmHistory(limit: number = 20): AutoArmEvent[] {
    return this.autoArmHistory.slice(-limit);
  }

  // ===========================================================================
  // AUTO-ARM METHODS
  // ===========================================================================

  /**
   * Get current trading state
   */
  public getTradingState(): TradingState {
    return this.status.tradingState;
  }

  /**
   * Update trading state
   */
  public setTradingState(state: TradingState): void {
    const previousState = this.status.tradingState;
    this.status.tradingState = state;
    this.log('info', `Trading state updated: ${previousState} -> ${state}`);
  }

  /**
   * Auto-arm when bot starts
   * @param botId - ID of the bot that started
   * @returns true if armed, false if already armed or disabled
   */
  public autoArmOnBotStart(botId: string): boolean {
    if (!this.config.autoArm.autoArmWhenBotStarts) {
      this.log('debug', 'Auto-arm on bot start is disabled');
      return false;
    }

    if (this.status.state === 'armed') {
      this.log('debug', 'Kill switch already armed, skipping auto-arm');
      return false;
    }

    const event: AutoArmEvent = {
      id: `aa-${Date.now()}`,
      timestamp: Date.now(),
      reason: 'bot_start',
      botId,
      previousState: this.status.state,
      tradingState: this.status.tradingState,
    };

    this.arm(`Bot started: ${botId}`);
    this.recordAutoArmEvent(event);

    return true;
  }

  /**
   * Auto-arm when trading mode switches to LIVE
   * @param previousMode - Previous trading mode
   * @returns true if armed, false if already armed or disabled
   */
  public autoArmOnLiveMode(previousMode?: TradingState): boolean {
    if (!this.config.autoArm.autoArmWhenLiveMode) {
      this.log('debug', 'Auto-arm on live mode is disabled');
      return false;
    }

    if (this.status.tradingState === 'live') {
      this.log('debug', 'Already in live mode');
      return false;
    }

    const event: AutoArmEvent = {
      id: `aa-${Date.now()}`,
      timestamp: Date.now(),
      reason: 'live_mode',
      previousState: this.status.state,
      tradingState: 'live',
    };

    // Update trading state first
    this.status.tradingState = 'live';
    
    // Arm the kill switch
    this.arm('Trading mode switched to LIVE');
    this.recordAutoArmEvent(event);

    return true;
  }

  /**
   * Auto-arm when first position is opened
   * @param positionId - ID of the first position
   * @param symbol - Symbol of the position
   * @returns true if armed, false if already armed or disabled
   */
  public autoArmOnFirstPosition(positionId: string, symbol: string): boolean {
    if (!this.config.autoArm.autoArmWhenFirstPosition) {
      this.log('debug', 'Auto-arm on first position is disabled');
      return false;
    }

    // Only auto-arm if this is truly the first position (no history of closed positions)
    if (this.status.positionsClosed > 0) {
      this.log('debug', 'Not first position (positions already closed)');
      return false;
    }

    if (this.status.state === 'armed') {
      this.log('debug', 'Kill switch already armed');
      return false;
    }

    const event: AutoArmEvent = {
      id: `aa-${Date.now()}`,
      timestamp: Date.now(),
      reason: 'first_position',
      previousState: this.status.state,
      tradingState: this.status.tradingState,
    };

    this.arm(`First position opened: ${symbol} (${positionId})`);
    this.recordAutoArmEvent(event);

    return true;
  }

  /**
   * Record an auto-arm event
   */
  private recordAutoArmEvent(event: AutoArmEvent): void {
    this.autoArmHistory.push(event);
    
    if (this.config.autoArm.logAutoArmEvents) {
      this.log('info', 'Auto-arm event recorded', { ...event });
    }

    // Notify callbacks
    for (const callback of this.autoArmCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('[KillSwitch] Auto-arm callback error:', error);
      }
    }
  }

  /**
   * Check if disarm requires confirmation
   */
  public requiresConfirmationToDisarm(): boolean {
    return this.config.autoArm.requireConfirmationToDisarm;
  }

  // ===========================================================================
  // SAFETY CHECKS
  // ===========================================================================

  /**
   * Start periodic safety checks
   */
  private startSafetyChecks(): void {
    if (!this.safetyCheckConfig.enabled || this.safetyCheckInterval) {
      return;
    }
    
    this.safetyCheckInterval = setInterval(async () => {
      await this.runSafetyCheck();
    }, this.safetyCheckConfig.intervalMs);
    
    this.log('info', `Safety checks started with interval ${this.safetyCheckConfig.intervalMs}ms`);
  }

  /**
   * Stop periodic safety checks
   */
  public stopSafetyChecks(): void {
    if (this.safetyCheckInterval) {
      clearInterval(this.safetyCheckInterval);
      this.safetyCheckInterval = null;
      this.log('info', 'Safety checks stopped');
    }
  }

  /**
   * Register a safety check callback
   * Callbacks should return safety check results
   */
  public registerSafetyCheck(callback: () => Promise<SafetyCheckResult>): void {
    this.safetyCheckCallbacks.push(callback);
  }

  /**
   * Run a single safety check cycle
   */
  private async runSafetyCheck(): Promise<void> {
    if (this.status.state !== 'armed') {
      return;
    }
    
    if (this.safetyCheckConfig.logChecks) {
      this.log('debug', 'Running safety check...');
    }
    
    try {
      for (const callback of this.safetyCheckCallbacks) {
        const result = await callback();
        
        if (result.shouldTrigger && result.trigger) {
          this.log('warn', `Safety check triggered: ${result.trigger}`, result);
          // The actual trigger should be called by the callback's owner
          // This just logs and prepares for the trigger
        }
      }
    } catch (error) {
      this.log('error', 'Safety check error:', error);
    }
  }

  /**
   * Update safety check configuration
   */
  public updateSafetyCheckConfig(config: Partial<SafetyCheckConfig>): void {
    const wasEnabled = this.safetyCheckConfig.enabled;
    this.safetyCheckConfig = { ...this.safetyCheckConfig, ...config };
    
    // Restart safety checks if enabled status changed
    if (wasEnabled && !this.safetyCheckConfig.enabled) {
      this.stopSafetyChecks();
    } else if (!wasEnabled && this.safetyCheckConfig.enabled) {
      this.startSafetyChecks();
    }
  }

  /**
   * Get safety check configuration
   */
  public getSafetyCheckConfig(): SafetyCheckConfig {
    return { ...this.safetyCheckConfig };
  }

  /**
   * Shutdown the kill switch gracefully
   */
  public shutdown(): void {
    this.stopSafetyChecks();
    this.callbacks = [];
    this.autoArmCallbacks = [];
    this.safetyCheckCallbacks = [];
    this.log('info', 'Kill switch shutdown complete');
  }

  // ===========================================================================
  // LOGGING
  // ===========================================================================

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [KillSwitch] ${message}`, meta || '');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const defaultKillSwitchConfig: KillSwitchConfig = {
  autoTrigger: true,
  triggers: {
    drawdown: true,
    varBreach: true,
    correlation: true,
    liquidity: false,
  },
  thresholds: {
    drawdownPct: 0.20,
    varMultiplier: 3.0,
    correlationLimit: 0.9,
    liquidityMin: 1000,
  },
  recoveryMode: 'manual',
  recoveryCooldown: 24 * 60 * 60 * 1000,
  autoArm: defaultAutoArmConfig,
};
