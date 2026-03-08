/**
 * KILL SWITCH MANAGER
 *
 * Singleton manager for global kill switch access.
 * Provides integration with trading bots and mode switching.
 * 
 * Features:
 * - Single instance across the application
 * - Integration with bot lifecycle events
 * - Trading mode state tracking
 * - Position tracking for auto-arm triggers
 */

import { KillSwitch, defaultKillSwitchConfig, defaultAutoArmConfig, type KillSwitchCallback } from './kill-switch';
import type {
  KillSwitchConfig,
  KillSwitchStatus,
  KillSwitchTrigger,
  PositionRiskData,
  TradingState,
  AutoArmConfig,
  AutoArmEvent,
} from './types';

// Re-export TradingState for convenience
export type { TradingState } from './types';

/**
 * Bot registration info
 */
interface BotRegistration {
  id: string;
  type: string;
  startedAt: number;
  mode: TradingState;
}

/**
 * Position tracking info
 */
interface PositionInfo {
  id: string;
  symbol: string;
  openedAt: number;
  botId?: string;
}

/**
 * KillSwitchManager - Singleton for global kill switch management
 */
export class KillSwitchManager {
  private static instance: KillSwitchManager | null = null;
  private killSwitch: KillSwitch;
  private registeredBots: Map<string, BotRegistration> = new Map();
  private openPositions: Map<string, PositionInfo> = new Map();
  private tradingState: TradingState = 'idle';
  private stateChangeCallbacks: Array<(state: TradingState) => void> = [];
  private botStartCallbacks: Array<(botId: string, type: string) => void> = [];

  private constructor(config?: Partial<KillSwitchConfig>) {
    this.killSwitch = new KillSwitch(config);
    
    // Set up default close callback
    this.killSwitch.onClose(async (positions: PositionRiskData[], trigger: KillSwitchTrigger) => {
      console.log(`[KillSwitchManager] Processing ${positions.length} positions for trigger: ${trigger}`);
      
      // Clear tracked positions when kill switch triggers
      this.openPositions.clear();
      
      return positions.length;
    });
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config?: Partial<KillSwitchConfig>): KillSwitchManager {
    if (!KillSwitchManager.instance) {
      KillSwitchManager.instance = new KillSwitchManager(config);
    }
    return KillSwitchManager.instance;
  }

  /**
   * Reset the singleton (useful for testing)
   */
  public static resetInstance(): void {
    KillSwitchManager.instance = null;
  }

  /**
   * Initialize with configuration
   */
  public static initialize(config?: Partial<KillSwitchConfig>): KillSwitchManager {
    if (KillSwitchManager.instance) {
      console.warn('[KillSwitchManager] Already initialized, updating config');
      KillSwitchManager.instance.updateConfig(config);
    }
    return KillSwitchManager.getInstance(config);
  }

  // ===========================================================================
  // BOT REGISTRATION
  // ===========================================================================

  /**
   * Register a bot when it starts
   * This will trigger auto-arm if configured
   */
  public registerBot(botId: string, botType: string, mode: TradingState = 'paper'): void {
    const registration: BotRegistration = {
      id: botId,
      type: botType,
      startedAt: Date.now(),
      mode,
    };

    this.registeredBots.set(botId, registration);
    
    // Update trading state if this is the first bot or mode is higher
    this.updateTradingState(mode);
    
    // Trigger auto-arm on bot start
    this.killSwitch.autoArmOnBotStart(botId);
    
    // Notify callbacks
    this.botStartCallbacks.forEach(cb => {
      try {
        cb(botId, botType);
      } catch (error) {
        console.error('[KillSwitchManager] Bot start callback error:', error);
      }
    });
    
    this.log('info', `Bot registered: ${botId} (${botType})`, { mode });
  }

  /**
   * Unregister a bot when it stops
   */
  public unregisterBot(botId: string): void {
    const registration = this.registeredBots.get(botId);
    if (registration) {
      this.registeredBots.delete(botId);
      this.log('info', `Bot unregistered: ${botId}`);
      
      // Update trading state based on remaining bots
      this.recalculateTradingState();
    }
  }

  /**
   * Get all registered bots
   */
  public getRegisteredBots(): BotRegistration[] {
    return Array.from(this.registeredBots.values());
  }

  /**
   * Check if a specific bot is registered
   */
  public isBotRegistered(botId: string): boolean {
    return this.registeredBots.has(botId);
  }

  // ===========================================================================
  // TRADING STATE MANAGEMENT
  // ===========================================================================

  /**
   * Get current trading state
   */
  public getTradingState(): TradingState {
    return this.tradingState;
  }

  /**
   * Update trading state
   * Will trigger auto-arm if switching to LIVE
   */
  public setTradingState(state: TradingState): void {
    const previousState = this.tradingState;
    
    if (previousState === state) {
      return;
    }

    this.tradingState = state;
    this.killSwitch.setTradingState(state);
    
    // Trigger auto-arm when switching to live mode
    if (state === 'live' && previousState !== 'live') {
      this.killSwitch.autoArmOnLiveMode(previousState);
    }

    // Notify state change callbacks
    this.stateChangeCallbacks.forEach(cb => {
      try {
        cb(state);
      } catch (error) {
        console.error('[KillSwitchManager] State change callback error:', error);
      }
    });

    this.log('info', `Trading state changed: ${previousState} -> ${state}`);
  }

  /**
   * Update trading state based on a bot's mode
   */
  private updateTradingState(botMode: TradingState): void {
    // Live takes precedence over paper, paper over idle
    if (botMode === 'live') {
      this.setTradingState('live');
    } else if (botMode === 'paper' && this.tradingState === 'idle') {
      this.setTradingState('paper');
    }
  }

  /**
   * Recalculate trading state based on all registered bots
   */
  private recalculateTradingState(): void {
    let hasLive = false;
    let hasPaper = false;

    for (const bot of this.registeredBots.values()) {
      if (bot.mode === 'live') hasLive = true;
      if (bot.mode === 'paper') hasPaper = true;
    }

    if (hasLive) {
      this.setTradingState('live');
    } else if (hasPaper) {
      this.setTradingState('paper');
    } else {
      this.setTradingState('idle');
    }
  }

  // ===========================================================================
  // POSITION TRACKING
  // ===========================================================================

  /**
   * Track a position opening
   * Will trigger auto-arm if this is the first position
   */
  public trackPositionOpen(positionId: string, symbol: string, botId?: string): void {
    const position: PositionInfo = {
      id: positionId,
      symbol,
      openedAt: Date.now(),
      botId,
    };

    const isFirstPosition = this.openPositions.size === 0;
    this.openPositions.set(positionId, position);
    
    // Trigger auto-arm on first position
    if (isFirstPosition) {
      this.killSwitch.autoArmOnFirstPosition(positionId, symbol);
    }
    
    this.log('debug', `Position tracked: ${positionId} (${symbol})`);
  }

  /**
   * Track a position closing
   */
  public trackPositionClose(positionId: string): void {
    const position = this.openPositions.get(positionId);
    if (position) {
      this.openPositions.delete(positionId);
      this.log('debug', `Position closed: ${positionId}`);
    }
  }

  /**
   * Get all tracked positions
   */
  public getTrackedPositions(): PositionInfo[] {
    return Array.from(this.openPositions.values());
  }

  /**
   * Get count of open positions
   */
  public getOpenPositionCount(): number {
    return this.openPositions.size;
  }

  // ===========================================================================
  // KILL SWITCH OPERATIONS
  // ===========================================================================

  /**
   * Get the underlying KillSwitch instance
   */
  public getKillSwitch(): KillSwitch {
    return this.killSwitch;
  }

  /**
   * Arm the kill switch
   */
  public arm(reason: string = 'manual'): void {
    this.killSwitch.arm(reason);
  }

  /**
   * Disarm the kill switch (requires confirmation if configured)
   */
  public disarm(confirmed: boolean = false): boolean {
    return this.killSwitch.disarm(confirmed);
  }

  /**
   * Disarm with explicit confirmation
   */
  public disarmWithConfirmation(): boolean {
    return this.killSwitch.disarmWithConfirmation();
  }

  /**
   * Trigger the kill switch
   */
  public async trigger(
    positions: PositionRiskData[],
    trigger: KillSwitchTrigger,
    equity: number,
    drawdown: number
  ): Promise<{ positionsClosed: number; pnlSaved: number }> {
    // Unregister all bots when kill switch triggers
    for (const botId of this.registeredBots.keys()) {
      this.unregisterBot(botId);
    }
    
    return this.killSwitch.trigger(trigger, positions, equity, drawdown);
  }

  /**
   * Get kill switch status
   */
  public getStatus(): KillSwitchStatus {
    return this.killSwitch.getStatus();
  }

  /**
   * Check if trading is allowed
   */
  public canTrade(): boolean {
    return this.killSwitch.isActive() && !this.killSwitch.isTriggered();
  }

  /**
   * Check if kill switch is triggered
   */
  public isTriggered(): boolean {
    return this.killSwitch.isTriggered();
  }

  /**
   * Check if kill switch is armed
   */
  public isArmed(): boolean {
    return this.killSwitch.isArmed();
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  /**
   * Update kill switch configuration
   */
  public updateConfig(config?: Partial<KillSwitchConfig>): void {
    if (config) {
      this.killSwitch.updateConfig(config);
    }
  }

  /**
   * Update auto-arm configuration
   */
  public updateAutoArmConfig(config: Partial<AutoArmConfig>): void {
    this.killSwitch.updateAutoArmConfig(config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): KillSwitchConfig {
    return this.killSwitch.getConfig();
  }

  /**
   * Get auto-arm configuration
   */
  public getAutoArmConfig(): AutoArmConfig {
    return this.killSwitch.getConfig().autoArm;
  }

  // ===========================================================================
  // CALLBACKS
  // ===========================================================================

  /**
   * Register callback for position closing
   */
  public onClose(callback: KillSwitchCallback): void {
    this.killSwitch.onClose(callback);
  }

  /**
   * Register callback for auto-arm events
   */
  public onAutoArm(callback: (event: AutoArmEvent) => void): void {
    this.killSwitch.onAutoArm(callback);
  }

  /**
   * Register callback for trading state changes
   */
  public onStateChange(callback: (state: TradingState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Register callback for bot start events
   */
  public onBotStart(callback: (botId: string, type: string) => void): void {
    this.botStartCallbacks.push(callback);
  }

  // ===========================================================================
  // HISTORY
  // ===========================================================================

  /**
   * Get auto-arm history
   */
  public getAutoArmHistory(limit: number = 20): AutoArmEvent[] {
    return this.killSwitch.getAutoArmHistory(limit);
  }

  /**
   * Get trigger history
   */
  public getTriggerHistory(limit: number = 10): Array<{
    id: string;
    timestamp: number;
    trigger: KillSwitchTrigger;
    equity: number;
    drawdown: number;
    positionsClosed: number;
    recovered: boolean;
    recoveredAt?: number;
  }> {
    return this.killSwitch.getHistory(limit);
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * Get a summary of the current state
   */
  public getSummary(): {
    killSwitchState: string;
    tradingState: TradingState;
    registeredBots: number;
    openPositions: number;
    canTrade: boolean;
  } {
    return {
      killSwitchState: this.killSwitch.getStatus().state,
      tradingState: this.tradingState,
      registeredBots: this.registeredBots.size,
      openPositions: this.openPositions.size,
      canTrade: this.canTrade(),
    };
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [KillSwitchManager] ${message}`, meta || '');
  }
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

/**
 * Get the global KillSwitchManager instance
 */
export function getKillSwitchManager(config?: Partial<KillSwitchConfig>): KillSwitchManager {
  return KillSwitchManager.getInstance(config);
}

/**
 * Initialize the KillSwitchManager with configuration
 */
export function initializeKillSwitchManager(config?: Partial<KillSwitchConfig>): KillSwitchManager {
  return KillSwitchManager.initialize(config);
}

/**
 * Quick check if trading is allowed
 */
export function canTradeGlobally(): boolean {
  return KillSwitchManager.getInstance().canTrade();
}

/**
 * Default export
 */
export default KillSwitchManager;
