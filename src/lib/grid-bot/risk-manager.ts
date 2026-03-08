/**
 * Grid Bot Risk Manager - Production Ready
 * 
 * Comprehensive risk management for grid trading:
 * - Max drawdown monitoring
 * - Position limits
 * - Daily/weekly loss limits
 * - Risk alerts and notifications
 * - Emergency stop functionality
 */

import { EventEmitter } from 'events';
import {
  RiskManagementConfig,
  RiskMetrics,
  RiskAlert,
  DailyRiskTracker,
  GridTrade,
} from './types';

// ==================== DEFAULTS ====================

export const DEFAULT_RISK_CONFIG: RiskManagementConfig = {
  maxDrawdownPercent: 20,        // 20% max drawdown
  maxOpenPositions: 10,          // Maximum 10 open positions
  dailyLossLimit: 1000,          // $1000 daily loss limit
  weeklyLossLimit: 3000,         // $3000 weekly loss limit
  maxPositionSize: 1000,         // $1000 max per position
  maxLeverage: 10,               // 10x max leverage
  emergencyStopEnabled: true,    // Emergency stop on breach
  cooldownPeriodMinutes: 30,     // 30 minute cooldown after stop
};

// ==================== RISK MANAGER CLASS ====================

export class GridRiskManager extends EventEmitter {
  private config: RiskManagementConfig;
  private dailyTrackers: Map<string, DailyRiskTracker> = new Map();
  private alerts: RiskAlert[] = [];
  private equityCurve: number[] = [];
  private peakEquity: number = 0;
  private currentEquity: number = 0;
  private startPositionValue: number = 0;
  private openPositions: number = 0;
  private isEmergencyStopped: boolean = false;
  private emergencyStopTime: Date | null = null;
  private cooldownEndTime: Date | null = null;

  constructor(
    config: Partial<RiskManagementConfig> = {},
    initialEquity: number = 10000
  ) {
    super();
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
    this.currentEquity = initialEquity;
    this.peakEquity = initialEquity;
    this.startPositionValue = initialEquity;
    this.initializeDailyTracker();
  }

  // ==================== CORE RISK CHECKS ====================

  /**
   * Check if a new position can be opened
   */
  canOpenPosition(positionValue: number, leverage: number): {
    allowed: boolean;
    reason?: string;
    warning?: string;
  } {
    // Check emergency stop
    if (this.isEmergencyStopped) {
      const remaining = this.getRemainingCooldown();
      return {
        allowed: false,
        reason: `Emergency stop active. Cooldown remaining: ${remaining} minutes`,
      };
    }

    // Check position count
    if (this.openPositions >= this.config.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Maximum open positions (${this.config.maxOpenPositions}) reached`,
      };
    }

    // Check position size
    if (positionValue > this.config.maxPositionSize) {
      return {
        allowed: false,
        reason: `Position size ${positionValue} exceeds maximum ${this.config.maxPositionSize}`,
      };
    }

    // Check leverage
    if (leverage > this.config.maxLeverage) {
      return {
        allowed: false,
        reason: `Leverage ${leverage}x exceeds maximum ${this.config.maxLeverage}x`,
      };
    }

    // Check daily loss limit
    const dailyPnL = this.getDailyPnL();
    if (dailyPnL < -this.config.dailyLossLimit * 0.8) {
      this.addAlert({
        type: 'DAILY_LOSS_WARNING',
        severity: 'HIGH',
        message: `Approaching daily loss limit: ${Math.abs(dailyPnL).toFixed(2)} / ${this.config.dailyLossLimit}`,
        value: Math.abs(dailyPnL),
        threshold: this.config.dailyLossLimit,
      });
      
      return {
        allowed: true,
        warning: `Warning: Daily loss at ${((Math.abs(dailyPnL) / this.config.dailyLossLimit) * 100).toFixed(1)}% of limit`,
      };
    }

    // Check drawdown
    const drawdownPercent = this.calculateDrawdownPercent();
    if (drawdownPercent > this.config.maxDrawdownPercent * 0.8) {
      this.addAlert({
        type: 'DRAWDOWN_WARNING',
        severity: 'HIGH',
        message: `Approaching max drawdown: ${drawdownPercent.toFixed(2)}% / ${this.config.maxDrawdownPercent}%`,
        value: drawdownPercent,
        threshold: this.config.maxDrawdownPercent,
      });
    }

    return { allowed: true };
  }

  /**
   * Update equity and check risk limits
   */
  updateEquity(equity: number): {
    breaches: RiskAlert[];
    shouldStop: boolean;
  } {
    const breaches: RiskAlert[] = [];
    let shouldStop = false;

    // Update equity curve
    this.currentEquity = equity;
    this.equityCurve.push(equity);
    
    // Update peak
    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }

    // Check drawdown
    const drawdownPercent = this.calculateDrawdownPercent();
    
    if (drawdownPercent >= this.config.maxDrawdownPercent) {
      const alert: RiskAlert = {
        id: this.generateAlertId(),
        type: 'DRAWDOWN_CRITICAL',
        severity: 'CRITICAL',
        message: `Max drawdown exceeded: ${drawdownPercent.toFixed(2)}% >= ${this.config.maxDrawdownPercent}%`,
        timestamp: new Date(),
        value: drawdownPercent,
        threshold: this.config.maxDrawdownPercent,
      };
      breaches.push(alert);
      this.addAlert(alert);
      
      if (this.config.emergencyStopEnabled) {
        shouldStop = true;
        this.triggerEmergencyStop('MAX_DRAWDOWN');
      }
    }

    // Check daily loss
    const dailyPnL = this.getDailyPnL();
    if (dailyPnL <= -this.config.dailyLossLimit) {
      const alert: RiskAlert = {
        id: this.generateAlertId(),
        type: 'DAILY_LOSS_LIMIT',
        severity: 'CRITICAL',
        message: `Daily loss limit reached: ${Math.abs(dailyPnL).toFixed(2)}`,
        timestamp: new Date(),
        value: Math.abs(dailyPnL),
        threshold: this.config.dailyLossLimit,
      };
      breaches.push(alert);
      this.addAlert(alert);
      
      if (this.config.emergencyStopEnabled) {
        shouldStop = true;
        this.triggerEmergencyStop('DAILY_LOSS_LIMIT');
      }
    }

    // Check weekly loss
    const weeklyPnL = this.getWeeklyPnL();
    if (weeklyPnL <= -this.config.weeklyLossLimit) {
      const alert: RiskAlert = {
        id: this.generateAlertId(),
        type: 'DAILY_LOSS_LIMIT',
        severity: 'CRITICAL',
        message: `Weekly loss limit reached: ${Math.abs(weeklyPnL).toFixed(2)}`,
        timestamp: new Date(),
        value: Math.abs(weeklyPnL),
        threshold: this.config.weeklyLossLimit,
      };
      breaches.push(alert);
      this.addAlert(alert);
      
      if (this.config.emergencyStopEnabled) {
        shouldStop = true;
        this.triggerEmergencyStop('WEEKLY_LOSS_LIMIT');
      }
    }

    // Update daily tracker
    this.updateDailyTracker(equity);

    this.emit('equity_updated', { equity, drawdownPercent, dailyPnL });

    return { breaches, shouldStop };
  }

  /**
   * Record a trade for risk tracking
   */
  recordTrade(trade: GridTrade): void {
    const pnl = trade.pnl;
    const dateKey = this.getDateKey(trade.entryTime);
    
    let tracker = this.dailyTrackers.get(dateKey);
    if (!tracker) {
      tracker = this.createDailyTracker(dateKey);
    }
    
    tracker.realizedPnL += pnl;
    tracker.tradeCount++;
    
    if (pnl > 0) {
      tracker.winCount++;
    } else {
      tracker.lossCount++;
    }
    
    this.dailyTrackers.set(dateKey, tracker);
    
    // Check limits after trade
    const dailyPnL = this.getDailyPnL();
    if (dailyPnL < -this.config.dailyLossLimit * 0.9) {
      this.addAlert({
        type: 'DAILY_LOSS_WARNING',
        severity: 'CRITICAL',
        message: `Critical daily loss level: ${Math.abs(dailyPnL).toFixed(2)}`,
        value: Math.abs(dailyPnL),
        threshold: this.config.dailyLossLimit,
      });
    }
    
    this.emit('trade_recorded', { trade, dailyPnL });
  }

  // ==================== METRICS CALCULATION ====================

  /**
   * Calculate current drawdown percentage
   */
  calculateDrawdownPercent(): number {
    if (this.peakEquity === 0) return 0;
    return ((this.peakEquity - this.currentEquity) / this.peakEquity) * 100;
  }

  /**
   * Calculate current drawdown in currency
   */
  calculateDrawdown(): number {
    return this.peakEquity - this.currentEquity;
  }

  /**
   * Get daily PnL
   */
  getDailyPnL(): number {
    const today = this.getDateKey(new Date());
    const tracker = this.dailyTrackers.get(today);
    return tracker?.realizedPnL || 0;
  }

  /**
   * Get weekly PnL
   */
  getWeeklyPnL(): number {
    let weeklyPnL = 0;
    const now = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateKey = this.getDateKey(date);
      const tracker = this.dailyTrackers.get(dateKey);
      if (tracker) {
        weeklyPnL += tracker.realizedPnL;
      }
    }
    
    return weeklyPnL;
  }

  /**
   * Get comprehensive risk metrics
   */
  getRiskMetrics(): RiskMetrics {
    const currentDrawdown = this.calculateDrawdown();
    const currentDrawdownPercent = this.calculateDrawdownPercent();
    const dailyPnL = this.getDailyPnL();
    const weeklyPnL = this.getWeeklyPnL();
    
    // Calculate max drawdown from equity curve
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let runningPeak = this.startPositionValue;
    
    for (const equity of this.equityCurve) {
      if (equity > runningPeak) {
        runningPeak = equity;
      }
      const dd = runningPeak - equity;
      const ddPercent = (dd / runningPeak) * 100;
      
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDrawdownPercent = ddPercent;
      }
    }

    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore({
      drawdownPercent: currentDrawdownPercent,
      dailyLossPercent: Math.abs(dailyPnL) / this.config.dailyLossLimit * 100,
      positionUtilization: this.openPositions / this.config.maxOpenPositions * 100,
    });

    return {
      currentDrawdown,
      currentDrawdownPercent,
      maxDrawdown,
      maxDrawdownPercent,
      dailyPnL,
      weeklyPnL,
      openPositions: this.openPositions,
      positionUtilization: this.openPositions / this.config.maxOpenPositions,
      riskScore,
      isWithinLimits: this.checkWithinLimits(currentDrawdownPercent, dailyPnL, weeklyPnL),
      activeAlerts: this.getActiveAlerts(),
    };
  }

  /**
   * Calculate risk score (0-100)
   */
  private calculateRiskScore(params: {
    drawdownPercent: number;
    dailyLossPercent: number;
    positionUtilization: number;
  }): number {
    const drawdownScore = (params.drawdownPercent / this.config.maxDrawdownPercent) * 40;
    const lossScore = (params.dailyLossPercent / 100) * 35;
    const positionScore = (params.positionUtilization / 100) * 25;
    
    return Math.min(100, drawdownScore + lossScore + positionScore);
  }

  /**
   * Check if within all risk limits
   */
  private checkWithinLimits(
    drawdownPercent: number,
    dailyPnL: number,
    weeklyPnL: number
  ): boolean {
    return (
      drawdownPercent < this.config.maxDrawdownPercent &&
      dailyPnL > -this.config.dailyLossLimit &&
      weeklyPnL > -this.config.weeklyLossLimit &&
      this.openPositions <= this.config.maxOpenPositions &&
      !this.isEmergencyStopped
    );
  }

  // ==================== POSITION MANAGEMENT ====================

  /**
   * Increment open positions count
   */
  incrementPosition(): void {
    this.openPositions++;
    this.emit('position_opened', { count: this.openPositions });
    
    if (this.openPositions >= this.config.maxOpenPositions * 0.9) {
      this.addAlert({
        type: 'POSITION_LIMIT',
        severity: 'MEDIUM',
        message: `Approaching position limit: ${this.openPositions} / ${this.config.maxOpenPositions}`,
        value: this.openPositions,
        threshold: this.config.maxOpenPositions,
      });
    }
  }

  /**
   * Decrement open positions count
   */
  decrementPosition(): void {
    if (this.openPositions > 0) {
      this.openPositions--;
      this.emit('position_closed', { count: this.openPositions });
    }
  }

  /**
   * Set open positions count
   */
  setOpenPositions(count: number): void {
    this.openPositions = count;
  }

  // ==================== EMERGENCY STOP ====================

  /**
   * Trigger emergency stop
   */
  triggerEmergencyStop(reason: string): void {
    this.isEmergencyStopped = true;
    this.emergencyStopTime = new Date();
    this.cooldownEndTime = new Date(
      Date.now() + this.config.cooldownPeriodMinutes * 60 * 1000
    );
    
    const alert: RiskAlert = {
      id: this.generateAlertId(),
      type: 'DRAWDOWN_CRITICAL',
      severity: 'CRITICAL',
      message: `Emergency stop triggered: ${reason}`,
      timestamp: new Date(),
      value: 0,
      threshold: 0,
    };
    
    this.addAlert(alert);
    this.emit('emergency_stop', { reason, cooldownEndTime: this.cooldownEndTime });
  }

  /**
   * Check if emergency stopped
   */
  isEmergencyStoppedStatus(): boolean {
    return this.isEmergencyStopped;
  }

  /**
   * Get remaining cooldown in minutes
   */
  getRemainingCooldown(): number {
    if (!this.isEmergencyStopped || !this.cooldownEndTime) {
      return 0;
    }
    
    const remaining = this.cooldownEndTime.getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / 60000));
  }

  /**
   * Clear emergency stop (after cooldown)
   */
  clearEmergencyStop(): boolean {
    if (!this.isEmergencyStopped) return true;
    
    if (this.cooldownEndTime && Date.now() >= this.cooldownEndTime.getTime()) {
      this.isEmergencyStopped = false;
      this.emergencyStopTime = null;
      this.cooldownEndTime = null;
      this.emit('emergency_stop_cleared', {});
      return true;
    }
    
    return false;
  }

  // ==================== ALERTS ====================

  /**
   * Add alert
   */
  private addAlert(alert: Omit<RiskAlert, 'id' | 'timestamp'>): void {
    const fullAlert: RiskAlert = {
      ...alert,
      id: this.generateAlertId(),
      timestamp: new Date(),
    };
    
    this.alerts.push(fullAlert);
    this.emit('alert', fullAlert);
  }

  /**
   * Get active alerts (last 24 hours)
   */
  getActiveAlerts(): RiskAlert[] {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return this.alerts.filter(a => a.timestamp.getTime() > oneDayAgo);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): RiskAlert[] {
    return [...this.alerts];
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(daysToKeep: number = 7): void {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(a => a.timestamp.getTime() > cutoff);
  }

  // ==================== DAILY TRACKING ====================

  /**
   * Initialize today's tracker
   */
  private initializeDailyTracker(): void {
    const today = this.getDateKey(new Date());
    if (!this.dailyTrackers.has(today)) {
      this.createDailyTracker(today);
    }
  }

  /**
   * Create daily tracker
   */
  private createDailyTracker(dateKey: string): DailyRiskTracker {
    const tracker: DailyRiskTracker = {
      date: dateKey,
      startBalance: this.currentEquity,
      currentBalance: this.currentEquity,
      realizedPnL: 0,
      maxDrawdown: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
    };
    
    this.dailyTrackers.set(dateKey, tracker);
    return tracker;
  }

  /**
   * Update daily tracker
   */
  private updateDailyTracker(equity: number): void {
    const today = this.getDateKey(new Date());
    const tracker = this.dailyTrackers.get(today);
    
    if (tracker) {
      tracker.currentBalance = equity;
      
      const drawdown = tracker.startBalance - equity;
      if (drawdown > tracker.maxDrawdown) {
        tracker.maxDrawdown = drawdown;
      }
    }
  }

  /**
   * Get date key (YYYY-MM-DD)
   */
  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // ==================== UTILITIES ====================

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RiskManagementConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  /**
   * Get configuration
   */
  getConfig(): RiskManagementConfig {
    return { ...this.config };
  }

  /**
   * Reset risk manager
   */
  reset(equity: number): void {
    this.currentEquity = equity;
    this.peakEquity = equity;
    this.equityCurve = [equity];
    this.openPositions = 0;
    this.isEmergencyStopped = false;
    this.emergencyStopTime = null;
    this.cooldownEndTime = null;
    this.alerts = [];
    this.dailyTrackers.clear();
    this.initializeDailyTracker();
    
    this.emit('reset', { equity });
  }

  /**
   * Get equity curve
   */
  getEquityCurve(): number[] {
    return [...this.equityCurve];
  }

  /**
   * Get daily statistics
   */
  getDailyStats(date?: Date): DailyRiskTracker | null {
    const dateKey = date ? this.getDateKey(date) : this.getDateKey(new Date());
    return this.dailyTrackers.get(dateKey) || null;
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Create risk manager with sensible defaults
 */
export function createRiskManager(
  initialEquity: number,
  options: Partial<RiskManagementConfig> = {}
): GridRiskManager {
  return new GridRiskManager(options, initialEquity);
}

/**
 * Validate risk configuration
 */
export function validateRiskConfig(config: RiskManagementConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (config.maxDrawdownPercent <= 0 || config.maxDrawdownPercent > 100) {
    errors.push('Max drawdown must be between 0 and 100 percent');
  }
  
  if (config.maxOpenPositions <= 0) {
    errors.push('Max open positions must be positive');
  }
  
  if (config.dailyLossLimit <= 0) {
    errors.push('Daily loss limit must be positive');
  }
  
  if (config.weeklyLossLimit < config.dailyLossLimit) {
    errors.push('Weekly loss limit should be >= daily loss limit');
  }
  
  if (config.maxLeverage <= 0) {
    errors.push('Max leverage must be positive');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== EXPORT DEFAULT ====================

export default GridRiskManager;
