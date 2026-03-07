/**
 * ALERT SYSTEM - Notifications
 *
 * Multi-channel alert system supporting Telegram and Email.
 * Includes rate limiting and message queuing.
 */

// =============================================================================
// TYPES
// =============================================================================

export type AlertChannel = 'telegram' | 'email' | 'webhook';
export type AlertPriority = 'low' | 'normal' | 'high' | 'critical';

export interface AlertConfig {
  telegram?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  email?: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    fromAddress: string;
    toAddresses: string[];
    enabled: boolean;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
    enabled: boolean;
  };
  rateLimits: {
    maxPerMinute: number;
    maxPerHour: number;
    maxPerDay: number;
    burstLimit: number;
  };
  enabled: boolean;
  logAlerts: boolean;
}

export interface Alert {
  id: string;
  timestamp: number;
  channel: AlertChannel;
  priority: AlertPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  sent: boolean;
  sentAt?: number;
  error?: string;
}

export interface AlertStats {
  sent: number;
  failed: number;
  queued: number;
  byChannel: Record<AlertChannel, number>;
  byPriority: Record<AlertPriority, number>;
}

// =============================================================================
// RATE LIMITER
// =============================================================================

export class RateLimiter {
  private config: AlertConfig['rateLimits'];
  private sentTimestamps: number[] = [];

  constructor(config: AlertConfig['rateLimits']) {
    this.config = config;
  }

  /**
   * Check if we can send an alert
   */
  public canSend(): boolean {
    const now = Date.now();
    
    // Clean old timestamps
    this.sentTimestamps = this.sentTimestamps.filter(t => now - t < 24 * 60 * 60 * 1000);

    // Check burst limit
    const recentBurst = this.sentTimestamps.filter(t => now - t < 1000).length;
    if (recentBurst >= this.config.burstLimit) {
      return false;
    }

    // Check per minute
    const perMinute = this.sentTimestamps.filter(t => now - t < 60 * 1000).length;
    if (perMinute >= this.config.maxPerMinute) {
      return false;
    }

    // Check per hour
    const perHour = this.sentTimestamps.filter(t => now - t < 60 * 60 * 1000).length;
    if (perHour >= this.config.maxPerHour) {
      return false;
    }

    // Check per day
    if (this.sentTimestamps.length >= this.config.maxPerDay) {
      return false;
    }

    return true;
  }

  /**
   * Record a sent alert
   */
  public recordSent(): void {
    this.sentTimestamps.push(Date.now());
  }

  /**
   * Get time until next send is allowed
   */
  public getTimeUntilNextSend(): number {
    const now = Date.now();
    
    // Check burst
    const burstTimestamps = this.sentTimestamps.filter(t => now - t < 1000);
    if (burstTimestamps.length >= this.config.burstLimit) {
      return 1000 - (now - burstTimestamps[0]);
    }

    // Check per minute
    const minuteTimestamps = this.sentTimestamps.filter(t => now - t < 60 * 1000);
    if (minuteTimestamps.length >= this.config.maxPerMinute) {
      return 60 * 1000 - (now - minuteTimestamps[0]);
    }

    return 0;
  }

  /**
   * Reset rate limiter
   */
  public reset(): void {
    this.sentTimestamps = [];
  }
}

// =============================================================================
// ALERT SYSTEM
// =============================================================================

export class AlertSystem {
  private config: AlertConfig;
  private rateLimiter: RateLimiter;
  private queue: Alert[] = [];
  private sent: Alert[] = [];
  private stats: AlertStats;

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = {
      rateLimits: {
        maxPerMinute: 10,
        maxPerHour: 50,
        maxPerDay: 200,
        burstLimit: 3,
      },
      enabled: true,
      logAlerts: true,
      ...config,
    };

    this.rateLimiter = new RateLimiter(this.config.rateLimits);

    this.stats = {
      sent: 0,
      failed: 0,
      queued: 0,
      byChannel: { telegram: 0, email: 0, webhook: 0 },
      byPriority: { low: 0, normal: 0, high: 0, critical: 0 },
    };
  }

  /**
   * Send alert through configured channels
   */
  public async send(
    title: string,
    message: string,
    options: {
      channel?: AlertChannel;
      priority?: AlertPriority;
      data?: Record<string, unknown>;
    } = {}
  ): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const priority = options.priority || 'normal';

    // Determine channels
    const channels: AlertChannel[] = options.channel 
      ? [options.channel]
      : this.getEnabledChannels();

    for (const channel of channels) {
      const alert: Alert = {
        id: `alert-${channel}-${Date.now()}`,
        timestamp: Date.now(),
        channel,
        priority,
        title,
        message,
        data: options.data,
        sent: false,
      };

      // Check rate limit (except for critical)
      if (priority !== 'critical' && !this.rateLimiter.canSend()) {
        alert.error = 'Rate limit exceeded';
        this.queue.push(alert);
        this.stats.queued++;
        alerts.push(alert);
        continue;
      }

      // Send alert
      try {
        await this.sendAlert(alert);
        alert.sent = true;
        alert.sentAt = Date.now();
        this.rateLimiter.recordSent();
        this.stats.sent++;
        this.stats.byChannel[channel]++;
        this.stats.byPriority[priority]++;
      } catch (error) {
        alert.error = error instanceof Error ? error.message : 'Send failed';
        this.stats.failed++;
      }

      this.sent.push(alert);
      alerts.push(alert);

      // Log
      if (this.config.logAlerts) {
        console.log(`[Alert] ${channel} [${priority}] ${title}: ${message}`);
      }
    }

    // Keep last 1000 sent alerts
    if (this.sent.length > 1000) {
      this.sent = this.sent.slice(-1000);
    }

    return alerts;
  }

  /**
   * Send queued alerts
   */
  public async processQueue(): Promise<number> {
    let processed = 0;
    const failed: Alert[] = [];

    while (this.queue.length > 0 && this.rateLimiter.canSend()) {
      const alert = this.queue.shift()!;
      
      try {
        await this.sendAlert(alert);
        alert.sent = true;
        alert.sentAt = Date.now();
        this.rateLimiter.recordSent();
        this.stats.sent++;
        this.stats.byChannel[alert.channel]++;
        processed++;
      } catch (error) {
        alert.error = error instanceof Error ? error.message : 'Send failed';
        failed.push(alert);
      }

      this.sent.push(alert);
    }

    // Re-queue failed alerts
    this.queue.push(...failed);

    return processed;
  }

  /**
   * Send alert through specific channel
   */
  private async sendAlert(alert: Alert): Promise<void> {
    switch (alert.channel) {
      case 'telegram':
        await this.sendTelegram(alert);
        break;
      case 'email':
        await this.sendEmail(alert);
        break;
      case 'webhook':
        await this.sendWebhook(alert);
        break;
    }
  }

  /**
   * Send via Telegram
   */
  private async sendTelegram(alert: Alert): Promise<void> {
    if (!this.config.telegram?.enabled || !this.config.telegram.botToken) {
      throw new Error('Telegram not configured');
    }

    const text = this.formatTelegramMessage(alert);
    const url = `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.config.telegram.chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${error}`);
    }
  }

  /**
   * Send via Email
   */
  private async sendEmail(alert: Alert): Promise<void> {
    if (!this.config.email?.enabled) {
      throw new Error('Email not configured');
    }

    // In a real implementation, you would use nodemailer or similar
    // For now, we'll just log
    console.log(`[Email] To: ${this.config.email.toAddresses.join(', ')}`);
    console.log(`[Email] Subject: [${alert.priority.toUpperCase()}] ${alert.title}`);
    console.log(`[Email] Body: ${alert.message}`);
    
    // Simulate async
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Send via Webhook
   */
  private async sendWebhook(alert: Alert): Promise<void> {
    if (!this.config.webhook?.enabled) {
      throw new Error('Webhook not configured');
    }

    const response = await fetch(this.config.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.webhook.headers,
      },
      body: JSON.stringify({
        id: alert.id,
        timestamp: alert.timestamp,
        priority: alert.priority,
        title: alert.title,
        message: alert.message,
        data: alert.data,
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.status}`);
    }
  }

  /**
   * Format Telegram message
   */
  private formatTelegramMessage(alert: Alert): string {
    const emoji = this.getPriorityEmoji(alert.priority);
    let text = `${emoji} <b>${this.escapeHtml(alert.title)}</b>\n\n`;
    text += this.escapeHtml(alert.message);
    
    if (alert.data) {
      text += '\n\n<code>';
      text += this.escapeHtml(JSON.stringify(alert.data, null, 2));
      text += '</code>';
    }

    return text;
  }

  private getPriorityEmoji(priority: AlertPriority): string {
    switch (priority) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'normal': return '🟢';
      case 'low': return '⚪';
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Get enabled channels
   */
  private getEnabledChannels(): AlertChannel[] {
    const channels: AlertChannel[] = [];
    if (this.config.telegram?.enabled) channels.push('telegram');
    if (this.config.email?.enabled) channels.push('email');
    if (this.config.webhook?.enabled) channels.push('webhook');
    return channels;
  }

  /**
   * Get statistics
   */
  public getStats(): AlertStats {
    return { ...this.stats };
  }

  /**
   * Get queue size
   */
  public getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get recent alerts
   */
  public getRecentAlerts(limit: number = 100): Alert[] {
    return this.sent.slice(-limit);
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.rateLimits) {
      this.rateLimiter = new RateLimiter(this.config.rateLimits);
    }
  }

  /**
   * Enable/disable alerts
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }
}

// =============================================================================
// TRADING ALERTS
// =============================================================================

export class TradingAlerts {
  private alertSystem: AlertSystem;

  constructor(alertSystem: AlertSystem) {
    this.alertSystem = alertSystem;
  }

  /**
   * Send trade alert
   */
  public async tradeAlert(
    action: 'OPEN' | 'CLOSE' | 'MODIFY',
    symbol: string,
    side: 'LONG' | 'SHORT',
    details: {
      entryPrice?: number;
      exitPrice?: number;
      size?: number;
      pnl?: number;
      reason?: string;
    }
  ): Promise<void> {
    const emoji = action === 'OPEN' ? '🟢' : action === 'CLOSE' ? '🔴' : '🟡';
    const title = `${emoji} ${action} ${side} ${symbol}`;
    
    let message = '';
    if (action === 'OPEN') {
      message = `Opening ${side} position\nSymbol: ${symbol}\nEntry: ${details.entryPrice}\nSize: ${details.size}`;
    } else if (action === 'CLOSE') {
      message = `Closing ${side} position\nSymbol: ${symbol}\nExit: ${details.exitPrice}\nPnL: ${details.pnl}\nReason: ${details.reason}`;
    } else {
      message = `Modified ${side} position\nSymbol: ${symbol}`;
    }

    await this.alertSystem.send(title, message, {
      priority: action === 'CLOSE' && details.pnl && details.pnl < 0 ? 'high' : 'normal',
      data: details,
    });
  }

  /**
   * Send risk alert
   */
  public async riskAlert(
    type: 'DRAWDOWN' | 'LIMIT' | 'KILL_SWITCH',
    details: {
      current?: number;
      limit?: number;
      message: string;
    }
  ): Promise<void> {
    const emoji = type === 'KILL_SWITCH' ? '🚨' : '⚠️';
    const title = `${emoji} RISK ALERT: ${type}`;
    
    const priority = type === 'KILL_SWITCH' ? 'critical' : 'high';

    await this.alertSystem.send(title, details.message, {
      priority,
      channel: 'telegram',
      data: details,
    });
  }

  /**
   * Send bot status alert
   */
  public async botStatusAlert(
    botName: string,
    status: 'STARTED' | 'STOPPED' | 'ERROR',
    details?: {
      error?: string;
      uptime?: number;
      trades?: number;
    }
  ): Promise<void> {
    const emoji = status === 'STARTED' ? '🚀' : status === 'STOPPED' ? '🛑' : '❌';
    const title = `${emoji} ${botName} ${status}`;
    
    let message = `Bot: ${botName}\nStatus: ${status}`;
    if (details?.error) message += `\nError: ${details.error}`;
    if (details?.uptime) message += `\nUptime: ${Math.floor(details.uptime / 1000)}s`;
    if (details?.trades) message += `\nTrades: ${details.trades}`;

    const priority = status === 'ERROR' ? 'high' : 'normal';

    await this.alertSystem.send(title, message, { priority });
  }

  /**
   * Send signal alert
   */
  public async signalAlert(
    botName: string,
    symbol: string,
    direction: 'LONG' | 'SHORT',
    confidence: number,
    details?: Record<string, unknown>
  ): Promise<void> {
    const emoji = direction === 'LONG' ? '📈' : '📉';
    const title = `${emoji} ${botName} Signal: ${symbol}`;
    
    const message = `Direction: ${direction}\nSymbol: ${symbol}\nConfidence: ${(confidence * 100).toFixed(1)}%`;

    await this.alertSystem.send(title, message, {
      priority: confidence > 0.8 ? 'high' : 'normal',
      data: details,
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const defaultAlertConfig: AlertConfig = {
  rateLimits: {
    maxPerMinute: 10,
    maxPerHour: 50,
    maxPerDay: 200,
    burstLimit: 3,
  },
  enabled: true,
  logAlerts: true,
};

export function createAlertSystem(config?: Partial<AlertConfig>): AlertSystem {
  return new AlertSystem(config);
}
