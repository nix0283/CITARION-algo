/**
 * Telegram Notifier
 *
 * Production-ready Telegram notification handler for the alert system.
 * Supports rich formatting, rate limiting, and message queuing.
 */

import type { Notifier, AlertChannel, AlertPayload, AlertData, AlertType, AlertPriority } from './index';
import { ALERT_EMOJIS } from './index';
import { db } from '@/lib/db';

// =============================================================================
// TYPES
// =============================================================================

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableNotification?: boolean;
  silent?: boolean; // Don't show in chat list
}

export interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
  };
  date: number;
  text?: string;
}

export interface TelegramResponse {
  ok: boolean;
  result?: TelegramMessage;
  description?: string;
  error_code?: number;
}

// =============================================================================
// TELEGRAM NOTIFIER CLASS
// =============================================================================

export class TelegramNotifier implements Notifier {
  name: AlertChannel = 'telegram';
  private config: TelegramConfig | null = null;
  private apiUrl: string = '';
  private messageQueue: Array<{
    text: string;
    resolve: (success: boolean) => void;
  }> = [];
  private lastSentTime: number = 0;
  private minInterval: number = 50; // 50ms between messages

  constructor(config?: TelegramConfig) {
    if (config) {
      this.configure(config);
    }
  }

  /**
   * Configure the notifier
   */
  configure(config: TelegramConfig): void {
    this.config = config;
    this.apiUrl = `https://api.telegram.org/bot${config.botToken}`;
  }

  /**
   * Load configuration from database
   */
  async loadConfig(userId?: string): Promise<boolean> {
    try {
      const settings = await db.alertSettings.findFirst({
        where: { userId: userId || null },
      });

      if (!settings || !settings.telegramEnabled) {
        return false;
      }

      this.configure({
        botToken: settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: settings.telegramChatId || '',
        enabled: true,
        parseMode: 'HTML',
      });

      return true;
    } catch (error) {
      console.error('[TelegramNotifier] Failed to load config:', error);
      return false;
    }
  }

  /**
   * Check if the notifier is configured
   */
  isConfigured(): boolean {
    return !!(this.config?.enabled && this.config?.botToken && this.config?.chatId);
  }

  /**
   * Send an alert via Telegram
   */
  async send(alert: AlertPayload & { alertId: string }): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      // Try to load config from database
      const loaded = await this.loadConfig(alert.userId);
      if (!loaded) {
        return { success: false, error: 'Telegram not configured' };
      }
    }

    try {
      const text = this.formatMessage(alert);
      const result = await this.sendMessage(text);

      if (!result.ok) {
        return { success: false, error: result.description || 'Unknown Telegram error' };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send a raw text message
   */
  async sendMessage(text: string): Promise<TelegramResponse> {
    if (!this.config) {
      return { ok: false, description: 'Not configured' };
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastSent = now - this.lastSentTime;
    if (timeSinceLastSent < this.minInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minInterval - timeSinceLastSent));
    }

    const url = `${this.apiUrl}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.config.chatId,
        text,
        parse_mode: this.config.parseMode || 'HTML',
        disable_notification: this.config.disableNotification,
      }),
    });

    this.lastSentTime = Date.now();

    return response.json();
  }

  /**
   * Format alert as Telegram message
   */
  private formatMessage(alert: AlertPayload & { alertId: string }): string {
    const emoji = ALERT_EMOJIS[alert.type] || '🔔';
    const priorityBadge = this.getPriorityBadge(alert.priority || 'normal');

    let message = `<b>${emoji} ${this.escapeHtml(alert.title)}</b>\n\n`;
    message += `${this.escapeHtml(alert.message)}\n\n`;

    // Add data section
    if (alert.data) {
      message += this.formatDataSection(alert.data, alert.type);
    }

    // Add footer
    message += `\n${priorityBadge} <code>${alert.alertId}</code>`;

    return message;
  }

  /**
   * Format data section based on alert type
   */
  private formatDataSection(data: AlertData, type: AlertType): string {
    const sections: string[] = [];

    // Symbol and direction
    if (data.symbol) {
      const directionEmoji = data.direction === 'LONG' ? '🟢' : data.direction === 'SHORT' ? '🔴' : '';
      sections.push(`📊 <b>Symbol:</b> ${data.symbol}${directionEmoji ? ` ${directionEmoji}` : ''}`);
    }

    // Price information
    if (data.currentPrice !== undefined) {
      sections.push(`💰 <b>Price:</b> $${data.currentPrice.toLocaleString()}`);
    }

    // Entry/Exit prices
    if (data.entryPrice !== undefined) {
      sections.push(`📍 <b>Entry:</b> $${data.entryPrice.toLocaleString()}`);
    }
    if (data.exitPrice !== undefined) {
      sections.push(`🎯 <b>Exit:</b> $${data.exitPrice.toLocaleString()}`);
    }

    // Position size
    if (data.size !== undefined) {
      sections.push(`📐 <b>Size:</b> ${data.size.toFixed(6)}`);
    }

    // Leverage
    if (data.leverage !== undefined) {
      sections.push(`⚡ <b>Leverage:</b> ${data.leverage}x`);
    }

    // PnL
    if (data.pnl !== undefined) {
      const pnlEmoji = data.pnl >= 0 ? '📈' : '📉';
      const pnlSign = data.pnl >= 0 ? '+' : '';
      sections.push(
        `${pnlEmoji} <b>PnL:</b> ${pnlSign}$${data.pnl.toFixed(2)} (${pnlSign}${((data.pnlPercent || 0) * 100).toFixed(2)}%)`
      );
    }

    // Drawdown
    if (data.drawdown !== undefined) {
      sections.push(`📉 <b>Drawdown:</b> ${data.drawdown.toFixed(2)}%`);
    }

    // Change percent
    if (data.changePercent !== undefined) {
      const changeEmoji = data.changePercent >= 0 ? '📈' : '📉';
      sections.push(`${changeEmoji} <b>Change:</b> ${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`);
    }

    // Bot info
    if (data.botName) {
      sections.push(`🤖 <b>Bot:</b> ${data.botName}`);
      if (data.botType) {
        sections.push(`📦 <b>Type:</b> ${data.botType}`);
      }
    }

    // Uptime
    if (data.uptime !== undefined) {
      const hours = Math.floor(data.uptime / 3600000);
      const minutes = Math.floor((data.uptime % 3600000) / 60000);
      sections.push(`⏱️ <b>Uptime:</b> ${hours}h ${minutes}m`);
    }

    // Trades count
    if (data.tradesCount !== undefined) {
      sections.push(`📊 <b>Trades:</b> ${data.tradesCount}`);
    }

    // Error
    if (data.error) {
      sections.push(`❌ <b>Error:</b> ${this.escapeHtml(data.error)}`);
    }

    // Exchange
    if (data.exchange) {
      sections.push(`🏦 <b>Exchange:</b> ${data.exchange}`);
    }

    // Confidence
    if (data.confidence !== undefined) {
      sections.push(`🎯 <b>Confidence:</b> ${(data.confidence * 100).toFixed(1)}%`);
    }

    if (sections.length === 0) {
      return '';
    }

    return `<pre>${sections.join('\n')}</pre>`;
  }

  /**
   * Get priority badge emoji
   */
  private getPriorityBadge(priority: AlertPriority): string {
    switch (priority) {
      case 'critical':
        return '🔴 CRITICAL';
      case 'high':
        return '🟠 HIGH';
      case 'normal':
        return '🟢';
      case 'low':
        return '⚪';
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Test the connection
   */
  async testConnection(): Promise<{ success: boolean; botInfo?: { id: number; username: string }; error?: string }> {
    if (!this.config?.botToken) {
      return { success: false, error: 'Bot token not configured' };
    }

    try {
      const response = await fetch(`${this.apiUrl}/getMe`);
      const data = await response.json();

      if (data.ok) {
        return {
          success: true,
          botInfo: {
            id: data.result.id,
            username: data.result.username,
          },
        };
      }

      return { success: false, error: data.description };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get chat info
   */
  async getChatInfo(): Promise<{ success: boolean; chat?: TelegramMessage['chat']; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Not configured' };
    }

    try {
      const response = await fetch(`${this.apiUrl}/getChat?chat_id=${this.config!.chatId}`);
      const data = await response.json();

      if (data.ok) {
        return { success: true, chat: data.result };
      }

      return { success: false, error: data.description };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set webhook for the bot
   */
  async setWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    if (!this.config?.botToken) {
      return { success: false, error: 'Bot token not configured' };
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
      );
      const data = await response.json();

      return { success: data.ok, error: data.description };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(): Promise<{ success: boolean; error?: string }> {
    if (!this.config?.botToken) {
      return { success: false, error: 'Bot token not configured' };
    }

    try {
      const response = await fetch(`${this.apiUrl}/deleteWebhook`);
      const data = await response.json();

      return { success: data.ok, error: data.description };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const telegramNotifier = new TelegramNotifier();

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Send a quick Telegram message
 */
export async function sendTelegramMessage(
  title: string,
  message: string,
  options?: {
    priority?: AlertPriority;
    data?: AlertData;
  }
): Promise<{ success: boolean; error?: string }> {
  // Try to load config from environment or database
  if (!telegramNotifier.isConfigured()) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      telegramNotifier.configure({
        botToken,
        chatId,
        enabled: true,
        parseMode: 'HTML',
      });
    } else {
      await telegramNotifier.loadConfig();
    }
  }

  if (!telegramNotifier.isConfigured()) {
    return { success: false, error: 'Telegram not configured' };
  }

  return telegramNotifier.send({
    type: 'SYSTEM',
    category: 'SYSTEM',
    alertId: `quick-${Date.now()}`,
    title,
    message,
    priority: options?.priority || 'normal',
    data: options?.data,
  });
}

/**
 * Initialize Telegram notifier with environment variables
 */
export function initTelegramFromEnv(): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    telegramNotifier.configure({
      botToken,
      chatId,
      enabled: true,
      parseMode: 'HTML',
    });
    console.log('[TelegramNotifier] Initialized from environment variables');
  }
}

// Auto-initialize from environment
initTelegramFromEnv();
