/**
 * ALERT SYSTEM - Unified Notification Service
 *
 * Production-ready alert system supporting multiple channels:
 * - Telegram (bot notifications)
 * - WebSocket (real-time frontend updates)
 * - Webhook (custom integrations)
 * - Email (optional)
 *
 * Features:
 * - Rate limiting to prevent spam
 * - Alert persistence in database
 * - Quiet hours support
 * - Priority-based delivery
 * - Multiple alert types for trading, price, risk, and system events
 */

import { db } from '@/lib/db';

// =============================================================================
// TYPES
// =============================================================================

export type AlertChannel = 'telegram' | 'websocket' | 'webhook' | 'email';
export type AlertPriority = 'low' | 'normal' | 'high' | 'critical';

// Alert Types
export type AlertType =
  | 'TRADE_OPEN'
  | 'TRADE_CLOSE'
  | 'TRADE_TP'
  | 'TRADE_SL'
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW'
  | 'RISK_WARNING'
  | 'RISK_CRITICAL'
  | 'BOT_STARTED'
  | 'BOT_STOPPED'
  | 'BOT_ERROR'
  | 'PUMP_DETECTED'
  | 'DUMP_DETECTED';

export type AlertCategory = 'TRADE' | 'PRICE' | 'RISK' | 'SYSTEM' | 'SIGNAL';

export interface AlertData {
  // Trade alerts
  symbol?: string;
  direction?: 'LONG' | 'SHORT';
  side?: 'BUY' | 'SELL';
  entryPrice?: number;
  exitPrice?: number;
  size?: number;
  pnl?: number;
  pnlPercent?: number;
  leverage?: number;
  tpLevel?: number;
  slPrice?: number;

  // Price alerts
  currentPrice?: number;
  targetPrice?: number;
  changePercent?: number;

  // Risk alerts
  drawdown?: number;
  maxDrawdown?: number;
  exposure?: number;
  marginLevel?: number;

  // Bot alerts
  botName?: string;
  botType?: string;
  error?: string;
  uptime?: number;
  tradesCount?: number;

  // Additional context
  exchange?: string;
  timeframe?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface AlertPayload {
  type: AlertType;
  category: AlertCategory;
  title: string;
  message: string;
  priority?: AlertPriority;
  data?: AlertData;
  source?: string;
  sourceId?: string;
  channels?: AlertChannel[];
  userId?: string;
}

export interface AlertResult {
  success: boolean;
  alertId: string;
  sentChannels: AlertChannel[];
  failedChannels: AlertChannel[];
  error?: string;
}

export interface AlertStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  byType: Record<AlertType, number>;
  byCategory: Record<AlertCategory, number>;
  byPriority: Record<AlertPriority, number>;
  byChannel: Record<AlertChannel, number>;
}

export interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  burstLimit: number;
}

export interface AlertConfig {
  enabled: boolean;
  channels: AlertChannel[];
  rateLimits: RateLimitConfig;
  logAlerts: boolean;
  persistAlerts: boolean;
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
}

// =============================================================================
// ALERT TYPE MAPPINGS
// =============================================================================

export const ALERT_TYPE_CATEGORY: Record<AlertType, AlertCategory> = {
  TRADE_OPEN: 'TRADE',
  TRADE_CLOSE: 'TRADE',
  TRADE_TP: 'TRADE',
  TRADE_SL: 'TRADE',
  PRICE_ABOVE: 'PRICE',
  PRICE_BELOW: 'PRICE',
  RISK_WARNING: 'RISK',
  RISK_CRITICAL: 'RISK',
  BOT_STARTED: 'SYSTEM',
  BOT_STOPPED: 'SYSTEM',
  BOT_ERROR: 'SYSTEM',
  PUMP_DETECTED: 'SIGNAL',
  DUMP_DETECTED: 'SIGNAL',
};

export const ALERT_TYPE_PRIORITY: Record<AlertType, AlertPriority> = {
  TRADE_OPEN: 'normal',
  TRADE_CLOSE: 'normal',
  TRADE_TP: 'normal',
  TRADE_SL: 'high',
  PRICE_ABOVE: 'normal',
  PRICE_BELOW: 'normal',
  RISK_WARNING: 'high',
  RISK_CRITICAL: 'critical',
  BOT_STARTED: 'low',
  BOT_STOPPED: 'low',
  BOT_ERROR: 'high',
  PUMP_DETECTED: 'high',
  DUMP_DETECTED: 'high',
};

export const ALERT_EMOJIS: Record<AlertType, string> = {
  TRADE_OPEN: '🟢',
  TRADE_CLOSE: '🔴',
  TRADE_TP: '🎯',
  TRADE_SL: '🛑',
  PRICE_ABOVE: '📈',
  PRICE_BELOW: '📉',
  RISK_WARNING: '⚠️',
  RISK_CRITICAL: '🚨',
  BOT_STARTED: '🚀',
  BOT_STOPPED: '🛑',
  BOT_ERROR: '❌',
  PUMP_DETECTED: '🚀',
  DUMP_DETECTED: '💥',
};

// =============================================================================
// RATE LIMITER
// =============================================================================

export class AlertRateLimiter {
  private config: RateLimitConfig;
  private sentTimestamps: Map<string, number[]> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if an alert can be sent for the given key
   */
  canSend(key: string = 'default'): boolean {
    const now = Date.now();
    const timestamps = this.sentTimestamps.get(key) || [];

    // Clean old timestamps (older than 24 hours)
    const recentTimestamps = timestamps.filter((t) => now - t < 24 * 60 * 60 * 1000);

    // Check burst limit (per second)
    const burstCount = recentTimestamps.filter((t) => now - t < 1000).length;
    if (burstCount >= this.config.burstLimit) {
      return false;
    }

    // Check per minute limit
    const perMinute = recentTimestamps.filter((t) => now - t < 60 * 1000).length;
    if (perMinute >= this.config.maxPerMinute) {
      return false;
    }

    // Check per hour limit
    const perHour = recentTimestamps.filter((t) => now - t < 60 * 60 * 1000).length;
    if (perHour >= this.config.maxPerHour) {
      return false;
    }

    // Check per day limit
    if (recentTimestamps.length >= this.config.maxPerDay) {
      return false;
    }

    return true;
  }

  /**
   * Record a sent alert
   */
  recordSent(key: string = 'default'): void {
    const now = Date.now();
    const timestamps = this.sentTimestamps.get(key) || [];

    // Add new timestamp
    timestamps.push(now);

    // Keep only last 24 hours of timestamps
    const recentTimestamps = timestamps.filter((t) => now - t < 24 * 60 * 60 * 1000);

    this.sentTimestamps.set(key, recentTimestamps);
  }

  /**
   * Get time until next send is allowed
   */
  getTimeUntilNextSend(key: string = 'default'): number {
    const now = Date.now();
    const timestamps = this.sentTimestamps.get(key) || [];

    // Check burst
    const burstTimestamps = timestamps.filter((t) => now - t < 1000);
    if (burstTimestamps.length >= this.config.burstLimit && burstTimestamps.length > 0) {
      return 1000 - (now - burstTimestamps[0]);
    }

    // Check per minute
    const minuteTimestamps = timestamps.filter((t) => now - t < 60 * 1000);
    if (minuteTimestamps.length >= this.config.maxPerMinute && minuteTimestamps.length > 0) {
      return 60 * 1000 - (now - minuteTimestamps[0]);
    }

    return 0;
  }

  /**
   * Reset rate limiter
   */
  reset(key?: string): void {
    if (key) {
      this.sentTimestamps.delete(key);
    } else {
      this.sentTimestamps.clear();
    }
  }
}

// =============================================================================
// NOTIFIER INTERFACES
// =============================================================================

export interface Notifier {
  name: AlertChannel;
  send(alert: AlertPayload & { alertId: string }): Promise<{ success: boolean; error?: string }>;
  isConfigured(): boolean;
}

// =============================================================================
// ALERT SERVICE
// =============================================================================

class AlertServiceClass {
  private rateLimiter: AlertRateLimiter;
  private notifiers: Map<AlertChannel, Notifier> = new Map();
  private config: AlertConfig;
  private alertQueue: Array<{
    payload: AlertPayload;
    resolve: (result: AlertResult) => void;
  }> = [];

  constructor(config?: Partial<AlertConfig>) {
    this.config = {
      enabled: true,
      channels: ['websocket'],
      rateLimits: {
        maxPerMinute: 10,
        maxPerHour: 50,
        maxPerDay: 200,
        burstLimit: 3,
      },
      logAlerts: true,
      persistAlerts: true,
      ...config,
    };

    this.rateLimiter = new AlertRateLimiter(this.config.rateLimits);
  }

  /**
   * Register a notifier
   */
  registerNotifier(notifier: Notifier): void {
    this.notifiers.set(notifier.name, notifier);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.rateLimits) {
      this.rateLimiter = new AlertRateLimiter(this.config.rateLimits);
    }
  }

  /**
   * Send an alert through configured channels
   */
  async send(payload: AlertPayload): Promise<AlertResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        alertId: '',
        sentChannels: [],
        failedChannels: [],
        error: 'Alert system is disabled',
      };
    }

    // Check quiet hours
    if (this.isQuietHours()) {
      // For critical alerts, still send but log
      if (payload.priority !== 'critical') {
        return {
          success: false,
          alertId: '',
          sentChannels: [],
          failedChannels: [],
          error: 'Quiet hours active',
        };
      }
    }

    // Set defaults
    const category = payload.category || ALERT_TYPE_CATEGORY[payload.type];
    const priority = payload.priority || ALERT_TYPE_PRIORITY[payload.type];

    // Determine channels
    const channels = payload.channels || this.config.channels;

    // Generate alert ID
    const alertId = this.generateAlertId(payload.type);

    // Rate limiting
    const rateLimitKey = `${payload.type}:${payload.source || 'system'}`;
    const wasRateLimited =
      priority !== 'critical' && !this.rateLimiter.canSend(rateLimitKey);

    if (wasRateLimited) {
      // Queue the alert for later
      return new Promise((resolve) => {
        this.alertQueue.push({ payload, resolve });
        // Return immediately with queued status
        resolve({
          success: false,
          alertId,
          sentChannels: [],
          failedChannels: [],
          error: 'Rate limited - queued for later',
        });
      });
    }

    // Persist alert to database
    if (this.config.persistAlerts) {
      await this.persistAlert({
        ...payload,
        alertId,
        category,
        priority,
        channels,
      });
    }

    // Send through each channel
    const sentChannels: AlertChannel[] = [];
    const failedChannels: AlertChannel[] = [];
    const errors: string[] = [];

    for (const channel of channels) {
      const notifier = this.notifiers.get(channel);

      if (!notifier || !notifier.isConfigured()) {
        failedChannels.push(channel);
        continue;
      }

      try {
        const result = await notifier.send({
          ...payload,
          alertId,
          category,
          priority,
        });

        if (result.success) {
          sentChannels.push(channel);
          this.rateLimiter.recordSent(rateLimitKey);
        } else {
          failedChannels.push(channel);
          if (result.error) {
            errors.push(`${channel}: ${result.error}`);
          }
        }
      } catch (error) {
        failedChannels.push(channel);
        errors.push(
          `${channel}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Update alert record
    if (this.config.persistAlerts) {
      await this.updateAlertStatus(alertId, sentChannels, failedChannels, errors);
    }

    // Log
    if (this.config.logAlerts) {
      console.log(
        `[AlertService] ${payload.type} [${priority}] ${payload.title}: ` +
          `sent to ${sentChannels.join(', ') || 'none'}` +
          (failedChannels.length > 0 ? ` | failed: ${failedChannels.join(', ')}` : '')
      );
    }

    return {
      success: sentChannels.length > 0,
      alertId,
      sentChannels,
      failedChannels,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  /**
   * Process queued alerts
   */
  async processQueue(): Promise<number> {
    let processed = 0;
    const remaining: typeof this.alertQueue = [];

    for (const item of this.alertQueue) {
      const rateLimitKey = `${item.payload.type}:${item.payload.source || 'system'}`;

      if (this.rateLimiter.canSend(rateLimitKey)) {
        const result = await this.send(item.payload);
        item.resolve(result);
        processed++;
      } else {
        remaining.push(item);
      }
    }

    this.alertQueue = remaining;
    return processed;
  }

  /**
   * Check if current time is within quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.config.quietHours?.enabled) {
      return false;
    }

    const { start, end, timezone } = this.config.quietHours;
    const now = new Date();

    // Parse hours and minutes
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    // Get current time in specified timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const [currentHour, currentMin] = formatter
      .format(now)
      .split(':')
      .map(Number);

    const currentMinutes = currentHour * 60 + currentMin;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(type: AlertType): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${type.toLowerCase()}-${timestamp}-${random}`;
  }

  /**
   * Persist alert to database
   */
  private async persistAlert(alert: AlertPayload & {
    alertId: string;
    category: AlertCategory;
    priority: AlertPriority;
    channels: AlertChannel[];
  }): Promise<void> {
    try {
      await db.alertRecord.create({
        data: {
          alertId: alert.alertId,
          type: alert.type,
          category: alert.category,
          priority: alert.priority,
          title: alert.title,
          message: alert.message,
          data: alert.data ? JSON.stringify(alert.data) : null,
          source: alert.source,
          sourceId: alert.sourceId,
          symbol: alert.data?.symbol,
          channels: JSON.stringify(alert.channels),
          sentChannels: '[]',
          failedChannels: '[]',
          status: 'pending',
          userId: alert.userId,
        },
      });
    } catch (error) {
      console.error('[AlertService] Failed to persist alert:', error);
    }
  }

  /**
   * Update alert status in database
   */
  private async updateAlertStatus(
    alertId: string,
    sentChannels: AlertChannel[],
    failedChannels: AlertChannel[],
    errors: string[]
  ): Promise<void> {
    try {
      const status =
        sentChannels.length > 0 && failedChannels.length === 0
          ? 'sent'
          : sentChannels.length > 0
            ? 'partial'
            : 'failed';

      await db.alertRecord.update({
        where: { alertId },
        data: {
          status,
          sentChannels: JSON.stringify(sentChannels),
          failedChannels: JSON.stringify(failedChannels),
          error: errors.length > 0 ? errors.join('; ') : null,
          sentAt: status !== 'pending' ? new Date() : null,
        },
      });
    } catch (error) {
      console.error('[AlertService] Failed to update alert status:', error);
    }
  }

  /**
   * Get alert statistics
   */
  async getStats(since?: Date): Promise<AlertStats> {
    const where = since ? { createdAt: { gte: since } } : {};

    const alerts = await db.alertRecord.findMany({
      where,
      select: {
        type: true,
        category: true,
        priority: true,
        status: true,
        sentChannels: true,
      },
    });

    const stats: AlertStats = {
      total: alerts.length,
      sent: 0,
      failed: 0,
      pending: 0,
      byType: {} as Record<AlertType, number>,
      byCategory: {} as Record<AlertCategory, number>,
      byPriority: {} as Record<AlertPriority, number>,
      byChannel: {} as Record<AlertChannel, number>,
    };

    for (const alert of alerts) {
      // Count by status
      if (alert.status === 'sent') stats.sent++;
      else if (alert.status === 'failed') stats.failed++;
      else if (alert.status === 'pending') stats.pending++;

      // Count by type
      stats.byType[alert.type as AlertType] =
        (stats.byType[alert.type as AlertType] || 0) + 1;

      // Count by category
      stats.byCategory[alert.category as AlertCategory] =
        (stats.byCategory[alert.category as AlertCategory] || 0) + 1;

      // Count by priority
      stats.byPriority[alert.priority as AlertPriority] =
        (stats.byPriority[alert.priority as AlertPriority] || 0) + 1;

      // Count by channel
      try {
        const channels = JSON.parse(alert.sentChannels) as AlertChannel[];
        for (const ch of channels) {
          stats.byChannel[ch] = (stats.byChannel[ch] || 0) + 1;
        }
      } catch {
        // Ignore parse errors
      }
    }

    return stats;
  }

  /**
   * Get alert history
   */
  async getHistory(options?: {
    limit?: number;
    type?: AlertType;
    category?: AlertCategory;
    symbol?: string;
    userId?: string;
    since?: Date;
  }): Promise<Array<{
    alertId: string;
    type: AlertType;
    category: AlertCategory;
    priority: AlertPriority;
    title: string;
    message: string;
    data: AlertData | null;
    source: string | null;
    symbol: string | null;
    status: string;
    sentAt: Date | null;
    createdAt: Date;
  }>> {
    const alerts = await db.alertRecord.findMany({
      where: {
        type: options?.type,
        category: options?.category,
        symbol: options?.symbol,
        userId: options?.userId,
        createdAt: options?.since ? { gte: options.since } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 100,
    });

    return alerts.map((a) => ({
      alertId: a.alertId,
      type: a.type as AlertType,
      category: a.category as AlertCategory,
      priority: a.priority as AlertPriority,
      title: a.title,
      message: a.message,
      data: a.data ? (JSON.parse(a.data) as AlertData) : null,
      source: a.source,
      symbol: a.symbol,
      status: a.status,
      sentAt: a.sentAt,
      createdAt: a.createdAt,
    }));
  }
}

// Export singleton instance
export const AlertService = new AlertServiceClass();

// =============================================================================
// CONVENIENCE FUNCTIONS FOR COMMON ALERTS
// =============================================================================

/**
 * Send a trade opened alert
 */
export async function alertTradeOpened(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  leverage?: number;
  source?: string;
  sourceId?: string;
  userId?: string;
}): Promise<AlertResult> {
  const { symbol, direction, entryPrice, size, leverage, source, sourceId, userId } = params;
  const emoji = direction === 'LONG' ? '🟢' : '🔴';

  return AlertService.send({
    type: 'TRADE_OPEN',
    category: 'TRADE',
    title: `${emoji} ${direction} Position Opened`,
    message: `${symbol} @ $${entryPrice.toLocaleString()} | Size: ${size.toFixed(4)}${leverage ? ` | ${leverage}x` : ''}`,
    priority: 'normal',
    data: { symbol, direction, entryPrice, size, leverage },
    source,
    sourceId,
    userId,
  });
}

/**
 * Send a trade closed alert
 */
export async function alertTradeClosed(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  reason?: string;
  source?: string;
  sourceId?: string;
  userId?: string;
}): Promise<AlertResult> {
  const { symbol, direction, entryPrice, exitPrice, pnl, pnlPercent, reason, source, sourceId, userId } = params;
  const emoji = pnl >= 0 ? '✅' : '❌';
  const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);

  return AlertService.send({
    type: 'TRADE_CLOSE',
    category: 'TRADE',
    title: `${emoji} ${direction} Position Closed`,
    message: `${symbol} | PnL: $${pnlStr} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)${reason ? ` | ${reason}` : ''}`,
    priority: pnl < 0 ? 'high' : 'normal',
    data: { symbol, direction, entryPrice, exitPrice, pnl, pnlPercent },
    source,
    sourceId,
    userId,
  });
}

/**
 * Send a take profit hit alert
 */
export async function alertTakeProfit(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  tpLevel: number;
  price: number;
  pnl?: number;
  source?: string;
  sourceId?: string;
  userId?: string;
}): Promise<AlertResult> {
  const { symbol, direction, tpLevel, price, pnl, source, sourceId, userId } = params;

  return AlertService.send({
    type: 'TRADE_TP',
    category: 'TRADE',
    title: `🎯 Take Profit #${tpLevel} Hit`,
    message: `${symbol} ${direction} @ $${price.toLocaleString()}${pnl !== undefined ? ` | PnL: $${pnl.toFixed(2)}` : ''}`,
    priority: 'normal',
    data: { symbol, direction, tpLevel, exitPrice: price, pnl },
    source,
    sourceId,
    userId,
  });
}

/**
 * Send a stop loss hit alert
 */
export async function alertStopLoss(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  pnl: number;
  source?: string;
  sourceId?: string;
  userId?: string;
}): Promise<AlertResult> {
  const { symbol, direction, price, pnl, source, sourceId, userId } = params;

  return AlertService.send({
    type: 'TRADE_SL',
    category: 'TRADE',
    title: `🛑 Stop Loss Hit`,
    message: `${symbol} ${direction} @ $${price.toLocaleString()} | PnL: $${pnl.toFixed(2)}`,
    priority: 'high',
    data: { symbol, direction, slPrice: price, pnl },
    source,
    sourceId,
    userId,
  });
}

/**
 * Send a price alert
 */
export async function alertPrice(params: {
  symbol: string;
  type: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'PUMP_DETECTED' | 'DUMP_DETECTED';
  currentPrice: number;
  targetPrice?: number;
  changePercent?: number;
  source?: string;
  userId?: string;
}): Promise<AlertResult> {
  const { symbol, type, currentPrice, targetPrice, changePercent, source, userId } = params;
  const emoji = ALERT_EMOJIS[type];
  const direction = type === 'PRICE_ABOVE' || type === 'PUMP_DETECTED' ? 'above' : 'below';

  let message = `${symbol} @ $${currentPrice.toLocaleString()}`;
  if (targetPrice) {
    message += ` (crossed ${direction} $${targetPrice.toLocaleString()})`;
  }
  if (changePercent !== undefined) {
    message += ` | Change: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
  }

  return AlertService.send({
    type,
    category: 'PRICE',
    title: `${emoji} ${type.replace(/_/g, ' ')}`,
    message,
    priority: type === 'PUMP_DETECTED' || type === 'DUMP_DETECTED' ? 'high' : 'normal',
    data: { symbol, currentPrice, targetPrice, changePercent },
    source,
    userId,
  });
}

/**
 * Send a risk warning alert
 */
export async function alertRisk(params: {
  type: 'RISK_WARNING' | 'RISK_CRITICAL';
  message: string;
  drawdown?: number;
  maxDrawdown?: number;
  exposure?: number;
  marginLevel?: number;
  source?: string;
  userId?: string;
}): Promise<AlertResult> {
  const { type, message, drawdown, maxDrawdown, exposure, marginLevel, source, userId } = params;
  const emoji = ALERT_EMOJIS[type];

  return AlertService.send({
    type,
    category: 'RISK',
    title: `${emoji} ${type === 'RISK_CRITICAL' ? 'CRITICAL RISK' : 'Risk Warning'}`,
    message,
    priority: type === 'RISK_CRITICAL' ? 'critical' : 'high',
    data: { drawdown, maxDrawdown, exposure, marginLevel },
    source: source || 'risk-manager',
    userId,
  });
}

/**
 * Send a bot status alert
 */
export async function alertBotStatus(params: {
  botName: string;
  botType: string;
  status: 'BOT_STARTED' | 'BOT_STOPPED' | 'BOT_ERROR';
  error?: string;
  uptime?: number;
  tradesCount?: number;
  sourceId?: string;
  userId?: string;
}): Promise<AlertResult> {
  const { botName, botType, status, error, uptime, tradesCount, sourceId, userId } = params;
  const emoji = ALERT_EMOJIS[status];

  let message = `${botName} (${botType})`;
  if (status === 'BOT_STARTED') {
    message += ' started successfully';
  } else if (status === 'BOT_STOPPED') {
    message += ' stopped';
    if (uptime) {
      message += ` after ${Math.floor(uptime / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m`;
    }
    if (tradesCount) {
      message += ` | Trades: ${tradesCount}`;
    }
  } else if (status === 'BOT_ERROR') {
    message += ` error: ${error}`;
  }

  return AlertService.send({
    type: status,
    category: 'SYSTEM',
    title: `${emoji} ${botName}`,
    message,
    priority: status === 'BOT_ERROR' ? 'high' : 'low',
    data: { botName, botType, error, uptime, tradesCount },
    source: botName,
    sourceId,
    userId,
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export { AlertServiceClass };

export const defaultAlertConfig: AlertConfig = {
  enabled: true,
  channels: ['websocket'],
  rateLimits: {
    maxPerMinute: 10,
    maxPerHour: 50,
    maxPerDay: 200,
    burstLimit: 3,
  },
  logAlerts: true,
  persistAlerts: true,
};

export function createAlertService(config?: Partial<AlertConfig>): AlertServiceClass {
  return new AlertServiceClass(config);
}
